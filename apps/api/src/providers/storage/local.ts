import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { notFound } from '../../lib/errors.js';
import type { PutOptions, StorageProvider, StoredObject } from './types.js';

/**
 * Local disk driver, for development and single-node installs.
 *
 * Not suitable for a horizontally scaled deployment — two API instances would
 * not share a filesystem. Use the S3 driver there.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(rootPath: string) {
    this.root = resolve(rootPath);
  }

  /**
   * Resolves a key inside the storage root and refuses anything that escapes
   * it. Keys are server-generated, but a traversal guard on the filesystem
   * boundary is cheap insurance against a future caller that forgets.
   */
  private resolveKey(key: string): string {
    if (isAbsolute(key) || key.includes('\0')) throw notFound('Document');
    const target = resolve(join(this.root, normalize(key)));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw notFound('Document');
    }
    return target;
  }

  async put(key: string, body: Buffer, _options: PutOptions): Promise<StoredObject> {
    const target = this.resolveKey(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);

    return {
      key,
      sizeBytes: body.byteLength,
      checksumSha256: createHash('sha256').update(body).digest('hex'),
    };
  }

  async get(key: string): Promise<Readable> {
    const target = this.resolveKey(key);
    try {
      await stat(target);
    } catch {
      throw notFound('Document file');
    }
    return createReadStream(target);
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolveKey(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }
}
