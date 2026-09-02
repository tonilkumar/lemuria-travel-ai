import { describe, expect, it } from 'vitest';
import { expirySeverity, isAllowedDocumentMime, MAX_DOCUMENT_BYTES } from './documents.js';

describe('expirySeverity', () => {
  it('returns null when there is no expiry date', () => {
    expect(expirySeverity(null)).toBeNull();
  });

  it('returns null for a document expiring far in the future', () => {
    expect(expirySeverity(900)).toBeNull();
  });

  it('escalates as the date approaches', () => {
    expect(expirySeverity(300)).toBe('INFO');
    expect(expirySeverity(150)).toBe('WARN');
    expect(expirySeverity(60)).toBe('URGENT');
    expect(expirySeverity(10)).toBe('CRITICAL');
  });

  it('treats an already-expired document as critical', () => {
    expect(expirySeverity(-1)).toBe('CRITICAL');
    expect(expirySeverity(-500)).toBe('CRITICAL');
  });

  it('is inclusive at each boundary', () => {
    expect(expirySeverity(365)).toBe('INFO');
    expect(expirySeverity(180)).toBe('WARN');
    expect(expirySeverity(90)).toBe('URGENT');
    expect(expirySeverity(30)).toBe('CRITICAL');
  });

  it('never skips a level as days count down', () => {
    const order = ['INFO', 'WARN', 'URGENT', 'CRITICAL'];
    let lastIndex = -1;
    for (const days of [365, 200, 180, 120, 90, 45, 30, 5, 0]) {
      const severity = expirySeverity(days);
      if (!severity) continue;
      const index = order.indexOf(severity);
      expect(index).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = index;
    }
  });
});

describe('document upload limits', () => {
  it('accepts the formats travel paperwork actually arrives in', () => {
    expect(isAllowedDocumentMime('application/pdf')).toBe(true);
    expect(isAllowedDocumentMime('image/jpeg')).toBe(true);
    expect(isAllowedDocumentMime('image/png')).toBe(true);
  });

  it('rejects executables and archives', () => {
    expect(isAllowedDocumentMime('application/x-msdownload')).toBe(false);
    expect(isAllowedDocumentMime('application/zip')).toBe(false);
    expect(isAllowedDocumentMime('text/html')).toBe(false);
  });

  it('caps uploads at 25 MB', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
  });
});
