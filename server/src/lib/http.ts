const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 EchoReader/0.1';

/** Minimum gap between requests to the same host, to stay polite to upstream sites. */
const HOST_INTERVAL_MS: Record<string, number> = {
  'ncode.syosetu.com': 1000,
  'api.syosetu.com': 300,
  'www.gutenberg.org': 500,
  'www.aozora.gr.jp': 500,
  'standardebooks.org': 700,
  'api.dictionaryapi.dev': 100,
};

const nextSlot = new Map<string, number>();

async function waitForHost(host: string) {
  const gap = HOST_INTERVAL_MS[host] ?? 0;
  if (!gap) return;
  const now = Date.now();
  const slot = Math.max(now, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + gap);
  if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
}

export class UpstreamError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

async function request(url: string, timeoutMs = 20000): Promise<Response> {
  await waitForHost(new URL(url).host);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ja,en;q=0.8' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new UpstreamError(`无法连接 ${new URL(url).host}：${(err as Error).message}`);
  }
  if (res.status === 404) throw new UpstreamError('找不到这本书或这一章', 404);
  if (!res.ok) throw new UpstreamError(`${new URL(url).host} 返回了 HTTP ${res.status}`);
  return res;
}

export async function fetchText(url: string, timeoutMs?: number) {
  return (await request(url, timeoutMs)).text();
}

export async function fetchJson<T>(url: string, timeoutMs?: number): Promise<T> {
  return (await request(url, timeoutMs)).json() as Promise<T>;
}

export async function fetchBytes(url: string, timeoutMs?: number): Promise<Uint8Array> {
  return new Uint8Array(await (await request(url, timeoutMs)).arrayBuffer());
}
