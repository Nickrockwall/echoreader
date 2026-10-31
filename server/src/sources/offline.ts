import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OfflineStatus, SourceId } from '../../../shared/types.ts';
import { sources } from './index.ts';

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const RECORD = path.join(DATA_DIR, 'offline.json');

/** Finished downloads survive restarts; running ones live in memory. */
type DownloadRecord = { total: number; done: number; finishedAt: string };

function loadRecords(): { [key: string]: DownloadRecord } {
  try {
    return JSON.parse(readFileSync(RECORD, 'utf8'));
  } catch {
    return {};
  }
}

const records = loadRecords();
const jobs = new Map<string, OfflineStatus & { cancelled?: boolean }>();

function saveRecords() {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(RECORD, JSON.stringify(records, null, 1));
}

const keyOf = (source: SourceId, id: string) => `${source}:${id}`;

export function offlineStatus(source: SourceId, id: string): OfflineStatus {
  const key = keyOf(source, id);
  const job = jobs.get(key);
  if (job) return { state: job.state, done: job.done, total: job.total, error: job.error };
  const rec = records[key];
  return rec ? { state: 'done', done: rec.done, total: rec.total, finishedAt: rec.finishedAt } : { state: 'none', done: 0, total: 0 };
}

/**
 * Fetches every chapter (and the table of contents) into the server's cache. Requests to
 * upstream sites stay rate-limited, so a long なろう serial takes a few minutes; chapters that
 * are already cached go by instantly.
 */
export function startOffline(source: SourceId, id: string): OfflineStatus {
  const key = keyOf(source, id);
  const running = jobs.get(key);
  if (running?.state === 'running') return offlineStatus(source, id);

  const job: OfflineStatus & { cancelled?: boolean } = { state: 'running', done: 0, total: 0 };
  jobs.set(key, job);
  const adapter = sources[source];

  void (async () => {
    try {
      const book = await adapter.book(id);
      job.total = book.chapterCount;
      for (let page = 1; page <= book.tocPages; page++) await adapter.toc(id, page);
      for (let i = 1; i <= book.chapterCount; i++) {
        if (job.cancelled) return;
        await adapter.chapter(id, i);
        job.done = i;
      }
      job.state = 'done';
      records[key] = { total: job.total, done: job.done, finishedAt: new Date().toISOString() };
      saveRecords();
      jobs.delete(key);
    } catch (err) {
      job.state = 'error';
      job.error = (err as Error).message;
    }
  })();

  return offlineStatus(source, id);
}

export function cancelOffline(source: SourceId, id: string): OfflineStatus {
  const job = jobs.get(keyOf(source, id));
  if (job?.state === 'running') {
    job.cancelled = true;
    jobs.delete(keyOf(source, id));
  }
  return offlineStatus(source, id);
}
