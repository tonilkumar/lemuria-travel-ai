import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { documentTypeEnum, primaryId, timestamps } from './_shared.js';
import { users } from './auth.js';
import { customers } from './customers.js';

/**
 * Document metadata. Bytes live in object storage, never in Postgres.
 * `storageKey` is opaque and never exposed to the browser — downloads go
 * through an authorised API route that checks permission and writes an audit
 * entry, so an object-storage URL can never leak into a shared link (spec §28).
 */
export const documents = pgTable(
  'documents',
  {
    id: primaryId(),
    documentCode: varchar('document_code', { length: 32 }).notNull(),

    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    /** Optional owning entity, e.g. a visa case or quotation. */
    entityType: varchar('entity_type', { length: 40 }),
    entityId: uuid('entity_id'),

    type: documentTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),

    storageDriver: varchar('storage_driver', { length: 16 }).notNull(),
    storageKey: text('storage_key').notNull(),
    isEncrypted: boolean('is_encrypted').notNull().default(false),

    /** Current version number; superseded versions live in document_versions. */
    version: integer('version').notNull().default(1),

    /** Drives the 12-month and 6-month expiry alerts (spec §16). */
    expiresOn: date('expires_on'),
    /** Passport/visa numbers are stored masked; full values are never logged. */
    referenceNumberMasked: varchar('reference_number_masked', { length: 40 }),

    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    verifiedById: uuid('verified_by_id').references(() => users.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('documents_code_idx').on(t.documentCode),
    index('documents_customer_type_idx').on(t.customerId, t.type),
    index('documents_entity_idx').on(t.entityType, t.entityId),
    index('documents_expiry_idx').on(t.expiresOn),
  ],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: primaryId(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    storageKey: text('storage_key').notNull(),
    checksumSha256: varchar('checksum_sha256', { length: 64 }),
    replacedReason: text('replaced_reason'),
    uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('document_versions_document_idx').on(t.documentId, t.version)],
);

/** Every read of a sensitive document is recorded, not just every write. */
export const documentAccessLog = pgTable(
  'document_access_log',
  {
    id: primaryId(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 20 }).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('document_access_log_document_idx').on(t.documentId, t.createdAt)],
);

export const documentsRelations = relations(documents, ({ one, many }) => ({
  customer: one(customers, { fields: [documents.customerId], references: [customers.id] }),
  uploadedBy: one(users, { fields: [documents.uploadedById], references: [users.id] }),
  versions: many(documentVersions),
}));
