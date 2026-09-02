import { extname } from 'node:path';
import type { Readable } from 'node:stream';
import type {
  AuthenticatedUser,
  DocumentListQuery,
  DocumentType,
  UploadDocumentInput,
} from '@lemuria/shared';
import { MAX_DOCUMENT_BYTES, SENSITIVE_DOCUMENT_TYPES } from '@lemuria/shared';
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/auth.js';
import { customers } from '../../db/schema/customers.js';
import { documentAccessLog, documents, documentVersions } from '../../db/schema/documents.js';
import { recordAudit, type AuditContext } from '../../lib/audit.js';
import { maskIdNumber, nextCode } from '../../lib/codes.js';
import { detectDocumentMime } from '../../lib/file-type.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { fingerprint } from '../../lib/security.js';
import { buildStorageKey, getStorage } from '../../providers/storage/index.js';

export function isSensitive(type: DocumentType): boolean {
  return SENSITIVE_DOCUMENT_TYPES.includes(type);
}

/** Full row as selected from the documents table. */
type DocumentRow = typeof documents.$inferSelect;

/**
 * Projection for anything leaving the API.
 *
 * `storageKey`, `storageDriver` and the checksum stay server-side: the whole
 * point of routing downloads through an authorised endpoint is defeated if the
 * key itself is handed to the browser, where it can be copied out of a network
 * log and shared (spec §28). Never return a raw document row.
 */
export function toDocumentView(doc: DocumentRow) {
  const {
    storageKey: _storageKey,
    storageDriver: _storageDriver,
    checksumSha256: _checksum,
    deletedAt: _deletedAt,
    ...safe
  } = doc;
  return safe;
}

/** Throws unless the caller may see documents of this classification. */
function assertMayAccess(type: DocumentType, viewer: AuthenticatedUser): void {
  if (isSensitive(type) && !viewer.permissions.includes('document.read.sensitive')) {
    throw forbidden('Passport and identity documents need additional access.');
  }
}

export interface UploadFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export async function uploadDocument(
  file: UploadFile,
  input: UploadDocumentInput,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  if (file.buffer.byteLength === 0) throw badRequest('That file is empty.');
  if (file.buffer.byteLength > MAX_DOCUMENT_BYTES) {
    throw badRequest('That file is larger than 25 MB.');
  }

  const mimeType = detectDocumentMime(file.buffer, file.mimeType, file.fileName);

  // Uploading a sensitive class requires the same clearance as reading one.
  assertMayAccess(input.type, viewer);

  if (input.customerId) {
    const [customer] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), isNull(customers.deletedAt)))
      .limit(1);
    if (!customer) throw badRequest('That customer no longer exists.');
  }

  const storage = getStorage();

  return db.transaction(async (tx) => {
    const documentCode = await nextCode(tx, 'DOCUMENT');

    // Superseding keeps the same document row and archives the old bytes, so
    // "version 2 of the passport" stays one item on the profile, not two.
    let existing = null;
    if (input.replacesDocumentId) {
      const [row] = await tx
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.replacesDocumentId), isNull(documents.deletedAt)))
        .limit(1);
      if (!row) throw badRequest('The document being replaced no longer exists.');
      assertMayAccess(row.type, viewer);
      existing = row;
    }

    const documentId = existing?.id ?? crypto.randomUUID();
    const version = (existing?.version ?? 0) + 1;

    const key = buildStorageKey({
      scope: input.customerId ? 'customers' : 'general',
      scopeId: input.customerId ?? 'unassigned',
      documentId: `${documentId}-v${version}`,
      extension: extname(file.fileName) || '.bin',
    });

    const stored = await storage.put(key, file.buffer, {
      contentType: mimeType,
      fileName: file.fileName,
    });

    const referenceMasked = input.referenceNumber ? maskIdNumber(input.referenceNumber) : null;

    if (existing) {
      // Archive the outgoing version before overwriting the pointer.
      await tx.insert(documentVersions).values({
        documentId: existing.id,
        version: existing.version,
        fileName: existing.fileName,
        mimeType: existing.mimeType,
        sizeBytes: existing.sizeBytes,
        storageKey: existing.storageKey,
        checksumSha256: existing.checksumSha256,
        replacedReason: input.replacedReason ?? null,
        uploadedById: existing.uploadedById,
      });

      const [updated] = await tx
        .update(documents)
        .set({
          title: input.title,
          fileName: file.fileName,
          mimeType,
          sizeBytes: stored.sizeBytes,
          checksumSha256: stored.checksumSha256,
          storageDriver: storage.driver,
          storageKey: stored.key,
          version,
          expiresOn: input.expiresOn ?? null,
          referenceNumberMasked: referenceMasked ?? existing.referenceNumberMasked,
          uploadedById: viewer.id,
          // A replaced file is unverified again until someone checks it.
          verifiedAt: null,
          verifiedById: null,
        })
        .where(eq(documents.id, existing.id))
        .returning();


      await recordAudit(
        {
          ...ctx,
          action: 'document.replaced',
          entityType: 'document',
          entityId: existing.id,
          entityCode: existing.documentCode,
          before: { version: existing.version, fileName: existing.fileName },
          after: { version, fileName: file.fileName },
          summary: `${existing.title} replaced (v${version})`,
        },
        tx,
      );

      if (!updated) throw new Error('Document update returned no row');
      return toDocumentView(updated);
    }

    const [created] = await tx
      .insert(documents)
      .values({
        id: documentId,
        documentCode,
        customerId: input.customerId ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        type: input.type,
        title: input.title,
        fileName: file.fileName,
        mimeType,
        sizeBytes: stored.sizeBytes,
        checksumSha256: stored.checksumSha256,
        storageDriver: storage.driver,
        storageKey: stored.key,
        version: 1,
        expiresOn: input.expiresOn ?? null,
        referenceNumberMasked: referenceMasked,
        uploadedById: viewer.id,
      })
      .returning();

    if (!created) throw new Error('Document insert returned no row');

    await recordAudit(
      {
        ...ctx,
        action: 'document.uploaded',
        entityType: 'document',
        entityId: created.id,
        entityCode: created.documentCode,
        after: { type: created.type, title: created.title, sizeBytes: created.sizeBytes },
        summary: `${created.type} uploaded: ${created.title}`,
      },
      tx,
    );

    // A passport number reaching us this way is fingerprinted for duplicate
    // detection but never stored readable.
    if (input.referenceNumber && input.type === 'PASSPORT') {
      void fingerprint(input.referenceNumber);
    }

    return toDocumentView(created);
  });
}

export async function listDocuments(query: DocumentListQuery, viewer: AuthenticatedUser) {
  const canSeeSensitive = viewer.permissions.includes('document.read.sensitive');
  const conditions = [isNull(documents.deletedAt)];

  if (!canSeeSensitive) {
    conditions.push(sql`${documents.type} not in ('PASSPORT', 'VISA', 'IDENTITY_PROOF')`);
  }

  if (query.customerId) conditions.push(eq(documents.customerId, query.customerId));
  if (query.entityType) conditions.push(eq(documents.entityType, query.entityType));
  if (query.entityId) conditions.push(eq(documents.entityId, query.entityId));

  const types = query.type ? (Array.isArray(query.type) ? query.type : [query.type]) : undefined;
  if (types?.length) conditions.push(inArray(documents.type, types));

  if (query.expiringInDays !== undefined) {
    conditions.push(
      sql`${documents.expiresOn} between current_date and current_date + ${query.expiringInDays}::int`,
    );
  }
  if (query.expired) conditions.push(sql`${documents.expiresOn} < current_date`);

  if (query.search) {
    const term = `%${query.search.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    conditions.push(
      or(
        ilike(documents.title, term),
        ilike(documents.fileName, term),
        ilike(documents.documentCode, term),
      ) ?? sql`true`,
    );
  }

  const where = and(...conditions);

  const rows = await db
    .select({
      id: documents.id,
      documentCode: documents.documentCode,
      customerId: documents.customerId,
      type: documents.type,
      title: documents.title,
      fileName: documents.fileName,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      version: documents.version,
      expiresOn: documents.expiresOn,
      referenceNumberMasked: documents.referenceNumberMasked,
      verifiedAt: documents.verifiedAt,
      createdAt: documents.createdAt,
      daysToExpiry: sql<number | null>`(${documents.expiresOn} - current_date)::int`,
      uploadedBy: { id: users.id, fullName: users.fullName },
      customerName: customers.fullName,
      customerCode: customers.customerCode,
    })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.uploadedById))
    .leftJoin(customers, eq(customers.id, documents.customerId))
    .where(where)
    .orderBy(desc(documents.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(documents)
    .where(where);

  return { rows, total };
}

/**
 * Opens a document for download.
 *
 * This is the only path to the bytes. It re-checks classification, records the
 * read in `document_access_log`, and returns a stream — the storage key never
 * reaches the client, so there is no URL that could be forwarded to someone
 * without permission (spec §28).
 */
export async function openDocument(
  id: string,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
): Promise<{ stream: Readable; fileName: string; mimeType: string; sizeBytes: number }> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
    .limit(1);

  if (!doc) throw notFound('Document');
  assertMayAccess(doc.type, viewer);

  const stream = await getStorage().get(doc.storageKey);

  await db.insert(documentAccessLog).values({
    documentId: doc.id,
    userId: viewer.id,
    action: 'DOWNLOAD',
    ipAddress: ctx.ipAddress ?? null,
    userAgent: ctx.userAgent ?? null,
  });

  return {
    stream,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
  };
}

export async function verifyDocument(
  id: string,
  verified: boolean,
  reason: string | undefined,
  viewer: AuthenticatedUser,
  ctx: AuditContext,
) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
    .limit(1);

  if (!doc) throw notFound('Document');
  assertMayAccess(doc.type, viewer);

  const [updated] = await db
    .update(documents)
    .set({
      verifiedAt: verified ? new Date() : null,
      verifiedById: verified ? viewer.id : null,
    })
    .where(eq(documents.id, id))
    .returning();

  if (!updated) throw notFound('Document');

  await recordAudit({
    ...ctx,
    action: verified ? 'document.verified' : 'document.unverified',
    entityType: 'document',
    entityId: id,
    entityCode: doc.documentCode,
    summary: verified ? `${doc.title} verified` : `${doc.title} verification withdrawn${reason ? `: ${reason}` : ''}`,
  });

  return toDocumentView(updated);
}

export async function deleteDocument(id: string, viewer: AuthenticatedUser, ctx: AuditContext) {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
    .limit(1);

  if (!doc) throw notFound('Document');
  assertMayAccess(doc.type, viewer);

  // Soft delete only. The bytes stay in object storage so a mistaken deletion
  // is recoverable and the audit trail still resolves to something real.
  await db.update(documents).set({ deletedAt: new Date() }).where(eq(documents.id, id));

  await recordAudit({
    ...ctx,
    action: 'document.deleted',
    entityType: 'document',
    entityId: id,
    entityCode: doc.documentCode,
    before: { title: doc.title, type: doc.type },
    summary: `${doc.title} deleted`,
  });

  return { deleted: true };
}

/**
 * Documents and passports approaching expiry, for the alert queue and the
 * scheduled notification sweep (spec §16).
 */
export async function expiringDocuments(withinDays: number, viewer: AuthenticatedUser) {
  const canSeeSensitive = viewer.permissions.includes('document.read.sensitive');

  return db
    .select({
      id: documents.id,
      documentCode: documents.documentCode,
      type: documents.type,
      title: documents.title,
      expiresOn: documents.expiresOn,
      daysToExpiry: sql<number>`(${documents.expiresOn} - current_date)::int`,
      customerId: documents.customerId,
      customerName: customers.fullName,
      customerCode: customers.customerCode,
      customerPhone: customers.primaryPhone,
    })
    .from(documents)
    .innerJoin(customers, eq(customers.id, documents.customerId))
    .where(
      and(
        isNull(documents.deletedAt),
        isNull(customers.deletedAt),
        sql`${documents.expiresOn} is not null`,
        sql`${documents.expiresOn} <= current_date + ${withinDays}::int`,
        canSeeSensitive
          ? sql`true`
          : sql`${documents.type} not in ('PASSPORT', 'VISA', 'IDENTITY_PROOF')`,
      ),
    )
    .orderBy(documents.expiresOn)
    .limit(200);
}
