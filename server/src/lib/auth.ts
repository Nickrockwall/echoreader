import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Optional access password for a copy running on a cloud server. Without ECHOREADER_PASSWORD
 * (the normal setup on your own computer) everything is open, as before.
 *
 * The page shell is public (it holds no data); every /api request needs the login cookie.
 */
const PASSWORD = process.env.ECHOREADER_PASSWORD ?? '';
const COOKIE = 'echoreader_auth';
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
/** Failed logins allowed per address per window, to slow down guessing. */
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;

export const authRequired = PASSWORD.length > 0;

// Changing the password changes the token, which signs every device out.
const token = createHmac('sha256', createHash('sha256').update(`echoreader:${PASSWORD}`).digest())
  .update('session-v1')
  .digest('hex');

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function cookieValue(req: Request) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export const isSignedIn = (req: Request) => !authRequired || same(cookieValue(req), token);

const failures = new Map<string, { count: number; since: number }>();

export function login(req: Request, res: Response) {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const record = failures.get(ip);
  if (record && now - record.since > FAILURE_WINDOW_MS) failures.delete(ip);
  if ((failures.get(ip)?.count ?? 0) >= MAX_FAILURES) {
    res.status(429).json({ error: '密码错误次数太多，请 10 分钟后再试' });
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!authRequired || same(password, PASSWORD)) {
    failures.delete(ip);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: YEAR_MS, path: '/' });
    res.json({ required: authRequired, signedIn: true });
    return;
  }
  const f = failures.get(ip) ?? { count: 0, since: now };
  f.count++;
  failures.set(ip, f);
  res.status(401).json({ error: '密码不对' });
}

export function status(req: Request, res: Response) {
  res.json({ required: authRequired, signedIn: isSignedIn(req) });
}

/** Guards every /api route except the login endpoints. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isSignedIn(req)) return next();
  res.status(401).json({ error: '需要先输入访问密码', auth: true });
}
