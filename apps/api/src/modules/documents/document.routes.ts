import {
  documentListQuerySchema,
  MAX_DOCUMENT_BYTES,
  uploadDocumentSchema,
  verifyDocumentSchema,
} from '@lemuria/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auditContext } from '../../lib/audit.js';
import { badRequest } from '../../lib/errors.js';
import { ok, paginated } from '../../lib/reply.js';
import { requireUser } from '../../plugins/auth.js';
import * as documentService from './document.service.js';

const idParam = z.object({ id: z.string().uuid() });

export async function documentRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate);

  app.get('/', { preHandler: [app.authorize('document.read')] }, async (req) => {
    const query = documentListQuerySchema.parse(req.query);
    const { rows, total } = await documentService.listDocuments(query, requireUser(req));
    return paginated(rows, query.page, query.pageSize, total);
  });

  /** Expiry queue — passports and visas approaching their date (spec §16). */
  app.get('/expiring', { preHandler: [app.authorize('document.read')] }, async (req) => {
    const { withinDays } = z
      .object({ withinDays: z.coerce.number().int().min(1).max(1095).default(180) })
      .parse(req.query);
    return ok(await documentService.expiringDocuments(withinDays, requireUser(req)));
  });

  /**
   * Multipart upload. Metadata travels as form fields beside the file, so every
   * value arrives as a string and is coerced by the schema.
   */
  app.post('/', { preHandler: [app.authorize('document.upload')] }, async (req, reply) => {
    if (!req.isMultipart()) {
      throw badRequest('Send the file as multipart/form-data.');
    }

    const fields: Record<string, string> = {};
    let file: documentService.UploadFile | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (file) throw badRequest('Upload one file at a time.');
        const buffer = await part.toBuffer();
        // toBuffer resolves even when the stream was truncated at the limit.
        if (part.file.truncated || buffer.byteLength > MAX_DOCUMENT_BYTES) {
          throw badRequest('That file is larger than 25 MB.');
        }
        file = {
          buffer,
          fileName: part.filename,
          mimeType: part.mimetype,
        };
      } else if (typeof part.value === 'string') {
        fields[part.fieldname] = part.value;
      }
    }

    if (!file) throw badRequest('Choose a file to upload.');

    const input = uploadDocumentSchema.parse(fields);
    const created = await documentService.uploadDocument(
      file,
      input,
      requireUser(req),
      auditContext(req),
    );

    reply.status(201);
    return ok(created);
  });

  /**
   * The only route that serves document bytes. It re-checks classification and
   * writes an access-log row, so every read of a passport is attributable.
   */
  app.get('/:id/download', { preHandler: [app.authorize('document.read')] }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const result = await documentService.openDocument(id, requireUser(req), auditContext(req));

    // Quoted and stripped: an unescaped quote in a filename would let a caller
    // inject extra header directives.
    const safeName = result.fileName.replace(/["\\\r\n]/g, '_');

    reply
      .header('Content-Type', result.mimeType)
      .header('Content-Length', String(result.sizeBytes))
      .header('Content-Disposition', `attachment; filename="${safeName}"`)
      // These bytes are private; no shared cache may retain them.
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff');

    return reply.send(result.stream);
  });

  app.post('/:id/verify', { preHandler: [app.authorize('document.upload')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    const input = verifyDocumentSchema.parse(req.body);
    return ok(
      await documentService.verifyDocument(
        id,
        input.verified,
        input.reason,
        requireUser(req),
        auditContext(req),
      ),
    );
  });

  app.delete('/:id', { preHandler: [app.authorize('document.delete')] }, async (req) => {
    const { id } = idParam.parse(req.params);
    return ok(await documentService.deleteDocument(id, requireUser(req), auditContext(req)));
  });
}
