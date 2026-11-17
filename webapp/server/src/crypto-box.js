// Small authenticated encryption helper for secrets stored in the database (integration tokens).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const key = () => createHash('sha256').update(`hipcastle-secrets:${process.env.JWT_SECRET || 'dev-insecure-secret'}`).digest();

export function seal(obj) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function open(sealed) {
  const [v, iv, tag, data] = String(sealed).split('.');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8'));
}
