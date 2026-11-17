// Off-site database backups to S3-compatible storage (AWS S3 Cape Town, Cloudflare R2, Backblaze B2…).
// Local snapshots live on the same disk as the database, so they don't survive losing that disk.
//
//   BACKUP_S3_BUCKET             bucket name (required to enable)
//   BACKUP_S3_ACCESS_KEY_ID      access key with put/list/delete on the bucket (required)
//   BACKUP_S3_SECRET_ACCESS_KEY  secret key (required)
//   BACKUP_S3_REGION             e.g. af-south-1 (AWS Cape Town) or auto (R2). Default: auto
//   BACKUP_S3_ENDPOINT           custom endpoint for R2/B2, e.g. https://<account>.r2.cloudflarestorage.com
//   BACKUP_S3_PREFIX             key prefix. Default: hipcastle/
//   BACKUP_S3_KEEP               copies to keep. Default: 30 (a month of daily backups)
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { basename } from 'node:path';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

export function offsiteConfig() {
  const e = process.env;
  const enabled = Boolean(e.BACKUP_S3_BUCKET && e.BACKUP_S3_ACCESS_KEY_ID && e.BACKUP_S3_SECRET_ACCESS_KEY);
  return {
    enabled,
    bucket: e.BACKUP_S3_BUCKET || null,
    region: e.BACKUP_S3_REGION || 'auto',
    endpoint: e.BACKUP_S3_ENDPOINT || null,
    prefix: (e.BACKUP_S3_PREFIX ?? 'hipcastle/').replace(/^\/+/, ''),
    keep: Math.max(1, Number(e.BACKUP_S3_KEEP) || 30),
  };
}

let client = null;
/** Tests can inject a client. */
export function setOffsiteClient(c) { client = c; }
function getClient(cfg) {
  if (client) return client;
  client = new S3Client({
    region: cfg.region,
    ...(cfg.endpoint && { endpoint: cfg.endpoint, forcePathStyle: true }),
    credentials: { accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY },
  });
  return client;
}

/** Upload a local snapshot (gzipped) and prune old copies. Returns a short summary. */
export async function uploadBackup(file) {
  const cfg = offsiteConfig();
  if (!cfg.enabled) return null;
  const s3 = getClient(cfg);
  const key = `${cfg.prefix}${basename(file)}.gz`;
  const body = gzipSync(await readFile(file));
  await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: 'application/gzip', ContentEncoding: 'gzip' }));
  // Retention: keep the newest `keep` backups under the prefix (names sort by timestamp).
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: cfg.prefix }));
  const keys = (listed.Contents || []).map((o) => o.Key).filter((k) => /hipcastle-.*\.db\.gz$/.test(k)).sort().reverse();
  const old = keys.slice(cfg.keep);
  if (old.length) await s3.send(new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: old.map((Key) => ({ Key })) } }));
  return { key, bytes: body.length, pruned: old.length };
}
