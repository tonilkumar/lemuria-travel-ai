import { describe, expect, it } from 'vitest';
import { detectDocumentMime } from './file-type.js';

const pdf = () => Buffer.from('%PDF-1.4\n...rest of a pdf...');
const png = () =>
  Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16)]);
const zip = () => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16)]);
const text = () => Buffer.from('just some text pretending to be an image');

describe('detectDocumentMime', () => {
  it('identifies real files from their bytes', () => {
    expect(detectDocumentMime(pdf(), 'application/pdf', 'passport.pdf')).toBe('application/pdf');
    expect(detectDocumentMime(png(), 'image/png', 'photo.png')).toBe('image/png');
    expect(detectDocumentMime(jpeg(), 'image/jpeg', 'photo.jpg')).toBe('image/jpeg');
  });

  it('ignores a lying Content-Type and trusts the bytes', () => {
    // Client claims PNG; the bytes are a PDF. The bytes win.
    expect(detectDocumentMime(pdf(), 'image/png', 'scan.pdf')).toBe('application/pdf');
  });

  it('rejects a text file renamed to an image extension', () => {
    expect(() => detectDocumentMime(text(), 'image/png', 'payload.png')).toThrow(
      /does not look like a supported document/i,
    );
  });

  it('rejects a disallowed extension outright', () => {
    expect(() => detectDocumentMime(pdf(), 'application/pdf', 'installer.exe')).toThrow(
      /not accepted/i,
    );
    expect(() => detectDocumentMime(pdf(), 'application/pdf', 'script.sh')).toThrow(/not accepted/i);
  });

  it('rejects a file with no extension', () => {
    expect(() => detectDocumentMime(pdf(), 'application/pdf', 'passport')).toThrow(/not accepted/i);
  });

  it('accepts a ZIP container only when the extension says it is an Office file', () => {
    expect(detectDocumentMime(zip(), '', 'itinerary.docx')).toContain('wordprocessingml');
    expect(detectDocumentMime(zip(), '', 'costs.xlsx')).toContain('spreadsheetml');
  });

  it('rejects a ZIP disguised behind an allowed image extension', () => {
    // .zip is not an allowed extension at all, so it fails on the extension gate.
    expect(() => detectDocumentMime(zip(), 'application/zip', 'bundle.zip')).toThrow(/not accepted/i);
    // A real archive renamed to .png fails on the signature gate.
    expect(() => detectDocumentMime(zip(), 'image/png', 'bundle.png')).toThrow(
      /archive files are not accepted/i,
    );
  });

  it('allows HEIC only when the extension and the declared type agree', () => {
    expect(detectDocumentMime(text(), 'image/heic', 'photo.heic')).toBe('image/heic');
    expect(() => detectDocumentMime(text(), 'image/png', 'photo.heic')).toThrow();
  });

  it('is case-insensitive about extensions', () => {
    expect(detectDocumentMime(pdf(), 'application/pdf', 'PASSPORT.PDF')).toBe('application/pdf');
  });
});
