import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { dependencyFailure, notFound } from '../../lib/errors.js';
import type { PutOptions, StorageProvider, StoredObject } from './types.js';

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string | undefined;
  accessKeyId?: string | undefined;
  secretAccessKey?: string | undefined;
  forcePathStyle?: boolean;
}

/**
 * S3-compatible driver. Works against AWS S3 and any compatible endpoint —
 * DigitalOcean Spaces, Cloudflare R2, MinIO — by setting `S3_ENDPOINT`.
 *
 * Azure Blob and Google Cloud Storage would each need their own adapter behind
 * the same `StorageProvider` interface; nothing above this layer would change.
 */
export class S3StorageProvider implements StorageProvider {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle ? { forcePathStyle: true } : {}),
      ...(config.accessKeyId && config.secretAccessKey
        ? {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }
        : {}),
    });
  }

  async put(key: string, body: Buffer, options: PutOptions): Promise<StoredObject> {
    const checksumSha256 = createHash('sha256').update(body).digest('hex');

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: options.contentType,
          // Server-side encryption at rest. The bucket should also enforce this
          // via policy, so a client that forgets the header still gets it.
          ServerSideEncryption: 'AES256',
          ...(options.fileName
            ? { ContentDisposition: `attachment; filename="${sanitiseFilename(options.fileName)}"` }
            : {}),
        }),
      );
    } catch (err) {
      throw dependencyFailure('Could not store the document.', err);
    }

    return { key, sizeBytes: body.byteLength, checksumSha256 };
  }

  async get(key: string): Promise<Readable> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) throw notFound('Document file');
      return result.Body as Readable;
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') throw notFound('Document file');
      throw dependencyFailure('Could not read the document.', err);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      throw dependencyFailure('Could not delete the document.', err);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

/** Strips anything that could break out of the Content-Disposition header. */
function sanitiseFilename(name: string): string {
  return name.replace(/[^\w.\- ]/g, '_').slice(0, 120);
}
