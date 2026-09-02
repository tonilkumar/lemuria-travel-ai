import { extname } from 'node:path';
import { ALLOWED_DOCUMENT_EXTENSIONS, isAllowedDocumentMime } from '@lemuria/shared';
import { badRequest } from './errors.js';

/**
 * Content-type detection from magic bytes.
 *
 * The browser's declared Content-Type is a claim, not evidence — a renamed
 * script arrives as `image/png` if the client says so. Sniffing the leading
 * bytes is what actually decides whether a file is what it claims to be.
 *
 * Deliberately free of any database or config import so it stays unit-testable.
 */
const SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'application/pdf', test: (b) => b.subarray(0, 4).toString('latin1') === '%PDF' },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  // DOCX and XLSX are ZIP containers — and so is every other archive, hence the
  // extension cross-check below rather than trusting this signature alone.
  { mime: 'application/zip', test: (b) => b[0] === 0x50 && b[1] === 0x4b },
  {
    mime: 'application/msword',
    test: (b) => b.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])),
  },
];

const OOXML_BY_EXTENSION: Record<string, string> = {
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * Returns the real content type, or throws a user-readable validation error.
 * The declared type is consulted only for HEIC, which has no signature we check.
 */
export function detectDocumentMime(
  buffer: Buffer,
  declaredMime: string,
  fileName: string,
): string {
  const extension = extname(fileName).toLowerCase();

  if (!(ALLOWED_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension)) {
    throw badRequest(`Files of type ${extension || '(none)'} are not accepted.`);
  }

  const match = SIGNATURES.find((s) => s.test(buffer));

  if (!match) {
    if (extension === '.heic' && declaredMime === 'image/heic') return declaredMime;
    throw badRequest('That file does not look like a supported document.');
  }

  if (match.mime === 'application/zip') {
    const ooxml = OOXML_BY_EXTENSION[extension];
    if (!ooxml) throw badRequest('Archive files are not accepted.');
    return ooxml;
  }

  if (!isAllowedDocumentMime(match.mime)) {
    throw badRequest('That file type is not accepted.');
  }

  return match.mime;
}
