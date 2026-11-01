import { LoaderCircle } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, SIGNED_OUT_EVENT } from '../lib/api.ts';

/**
 * A copy on a cloud server is protected by an access password. On your own computer the server
 * reports that none is needed and this renders the app straight away. Offline (status request
 * fails) the app opens too, so books saved on the device stay readable.
 */
export function SignInGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'open' | 'locked'>('checking');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.auth
      .status()
      .then((s) => setState(s.required && !s.signedIn ? 'locked' : 'open'))
      .catch(() => setState('open'));
    const lock = () => setState('locked');
    window.addEventListener(SIGNED_OUT_EVENT, lock);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, lock);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.auth.login(password);
      setPassword('');
      setState('open');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'open') return <>{children}</>;
  if (state === 'checking') return null;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-6 py-16 font-ui">
      <h1 className="ui-hero text-3xl font-bold text-ink">EchoReader</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">这是一个私人书房。输入访问密码后，这台设备会一直记住登录状态。</p>
      <form onSubmit={submit} className="mt-8 space-y-3">
        <label className="block text-sm text-ink-soft">
          访问密码
          <input
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-rule bg-surface px-3 py-2.5 text-base text-ink focus:border-celadon focus:outline-none"
          />
        </label>
        {error && <p className="rounded-md bg-danger-wash px-3 py-2 text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={!password || busy}
          className="ui-primary flex w-full items-center justify-center gap-2 rounded-md bg-celadon px-4 py-2.5 text-sm font-medium text-on-accent hover:bg-celadon-deep disabled:opacity-60"
        >
          {busy && <LoaderCircle size={14} className="animate-spin" />}
          进入书房
        </button>
      </form>
    </main>
  );
}
