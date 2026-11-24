// server/lib/imageStore.js
//
// Where image files are kept. Live and in local dev: the R2 bucket, under
// market/, served from R2_PUBLIC_URL. In TEST_MODE: a folder next to the
// test database, served by this server at /test-uploads, so tests never
// touch real storage.

import fs from 'node:fs';
import path from 'node:path';
import { DeleteObjectsCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { dbPath } from '../db/path.js';
import { TEST_MODE } from './env.js';
import { r2, R2_BUCKET, R2_PUBLIC_URL } from './r2.js';

const PREFIX = 'market/';
export const TEST_UPLOADS = path.join(path.dirname(dbPath), 'uploads');

export const urlFor = (name) => (TEST_MODE ? `/test-uploads/${name}` : `${R2_PUBLIC_URL}/${PREFIX}${name}`);

export async function putFile(name, body, contentType) {
  if (TEST_MODE) {
    fs.mkdirSync(TEST_UPLOADS, { recursive: true });
    fs.writeFileSync(path.join(TEST_UPLOADS, name), body);
    return;
  }
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: PREFIX + name, Body: body, ContentType: contentType }));
}

export async function removeFiles(names) {
  if (!names.length) return;
  if (TEST_MODE) {
    for (const name of names) fs.rmSync(path.join(TEST_UPLOADS, name), { force: true });
    return;
  }
  await r2.send(new DeleteObjectsCommand({ Bucket: R2_BUCKET, Delete: { Objects: names.map((n) => ({ Key: PREFIX + n })) } }));
}
