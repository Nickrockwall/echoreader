/**
 * Compresses the built dictionaries into server/dict-data/ so they can be committed and
 * restored on a fresh checkout without downloading anything. Part of `npm run setup:dict`.
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGzip, constants } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DICTIONARIES = ['jmdict.sqlite', 'ja-zh.sqlite'];

for (const name of DICTIONARIES) {
  const from = path.join(ROOT, 'data', name);
  if (!existsSync(from)) {
    console.log(`跳过 ${name}：还没有生成`);
    continue;
  }
  const to = path.join(ROOT, 'dict-data', `${name}.gz`);
  await pipeline(createReadStream(from), createGzip({ level: constants.Z_BEST_COMPRESSION }), createWriteStream(to));
  console.log(`已压缩 ${name} → dict-data/${name}.gz（${((await stat(to)).size / 1e6).toFixed(1)} MB）`);
}
