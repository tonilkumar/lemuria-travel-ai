import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { LocalStorageProvider } from './local.js';
import { S3StorageProvider } from './s3.js';
import type { StorageProvider } from './types.js';

let instance: StorageProvider | null = null;

/**
 * Resolves the configured storage driver once per process.
 *
 * An S3 driver selected without a bucket falls back to local disk with a loud
 * warning rather than failing every upload at runtime: a misconfigured staging
 * box should degrade, not silently lose documents.
 */
export function getStorage(): StorageProvider {
  if (instance) return instance;

  if (env.STORAGE_DRIVER === 's3') {
    if (!env.S3_BUCKET) {
      logger.warn('STORAGE_DRIVER is s3 but S3_BUCKET is unset; falling back to local disk');
      instance = new LocalStorageProvider(env.STORAGE_LOCAL_PATH);
      return instance;
    }
    instance = new S3StorageProvider({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
    return instance;
  }

  instance = new LocalStorageProvider(env.STORAGE_LOCAL_PATH);
  return instance;
}

export { buildStorageKey } from './types.js';
export type { StorageProvider, StoredObject } from './types.js';
