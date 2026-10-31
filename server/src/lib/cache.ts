import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CACHE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.cache');

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const FOREVER = Number.POSITIVE_INFINITY;

interface Entry<T> {
  savedAt: number;
  value: T;
}

const inflight = new Map<string, Promise<unknown>>();

function fileFor(namespace: string, key: string) {
  const hash = createHash('sha1').update(key).digest('hex');
  return path.join(CACHE_ROOT, namespace, `${hash}.json`);
}

/**
 * Disk-backed memoization. Concurrent calls for the same key share one upstream request.
 * If a refresh fails, an expired entry is served rather than an error (upstreams are flaky).
 */
export async function cached<T>(
  namespace: string,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const file = fileFor(namespace, key);
  let stale: Entry<T> | undefined;
  try {
    stale = JSON.parse(await readFile(file, 'utf8')) as Entry<T>;
    if (Date.now() - stale.savedAt < ttlMs) return stale.value;
  } catch {
    // missing or corrupt: fall through to load
  }

  const id = `${namespace}:${key}`;
  const pending = inflight.get(id);
  if (pending) return pending as Promise<T>;

  const job = (async () => {
    let value: T;
    try {
      value = await load();
    } catch (err) {
      if (stale) return stale.value;
      throw err;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ savedAt: Date.now(), value } satisfies Entry<T>));
    return value;
  })().finally(() => inflight.delete(id));
  inflight.set(id, job);
  return job;
}
