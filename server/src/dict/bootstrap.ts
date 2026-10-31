import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DICTIONARIES = ['jmdict.sqlite', 'ja-zh.sqlite'];

/**
 * A fresh checkout has the dictionaries only as committed .gz files; unpack any that are missing
 * into server/data/ before the first lookup. Takes a few seconds, once.
 */
export async function ensureDictionaries() {
  for (const name of DICTIONARIES) {
    const target = path.join(ROOT, 'data', name);
    const packed = path.join(ROOT, 'dict-data', `${name}.gz`);
    if (existsSync(target) || !existsSync(packed)) continue;
    await mkdir(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    try {
      await pipeline(createReadStream(packed), createGunzip(), createWriteStream(tmp));
      await rename(tmp, target);
      console.log(`已解压词典 ${name}`);
    } catch (err) {
      await rm(tmp, { force: true });
      console.error(`解压 ${name} 失败，可运行 npm run setup:dict -w server 重新生成`, err);
    }
  }
}
