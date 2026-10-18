import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { get, post } from './api';

export interface Me { id: number; name: string; username: string; role: string; role_label: string; permissions: string[]; home: string; impersonatedBy?: number | null }
export interface TenantInfo { id: number; slug: string; name: string; status: string; logo_url: string | null; plan: any; trial_ends_at: string | null }
interface AuthCtx { me: Me | null; tenant: TenantInfo | null; loading: boolean; demo: boolean; platformUser: { name: string } | null; refresh: () => Promise<void>; logout: () => Promise<void>; can: (p: string) => boolean }
const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [platformUser, setPlatformUser] = useState<{ name: string } | null>(null);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { const r = await get('/api/auth/me'); setMe(r.user); setTenant(r.tenant || null); setPlatformUser(r.platform_user); setDemo(!!r.demo); } catch { setMe(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const logout = async () => { const slug = tenant?.slug; await post('/api/auth/logout'); setMe(null); location.href = slug ? `/${slug}/entrar` : '/entrar'; };
  const can = (p: string) => !!me?.permissions.includes(p);
  return <Ctx.Provider value={{ me, tenant, platformUser, loading, demo, refresh, logout, can }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

/** Canal de eventos em tempo real (SSE). Uma conexão por aba, compartilhada. */
type Listener = (e: { scope: string; kind?: string; orderId?: number; channel?: string }) => void;
const listeners = new Set<Listener>();
let es: EventSource | null = null;
let connected = false;
const statusListeners = new Set<(c: boolean) => void>();
function ensureStream() {
  if (es) return;
  es = new EventSource('/api/stream');
  es.addEventListener('hello', () => { connected = true; statusListeners.forEach((f) => f(true)); listeners.forEach((l) => l({ scope: 'reconnect' })); });
  es.addEventListener('change', (ev) => { const d = JSON.parse((ev as MessageEvent).data); listeners.forEach((l) => l(d)); });
  es.onerror = () => { connected = false; statusListeners.forEach((f) => f(false)); };
}
export function useLive(fn: Listener) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    ensureStream();
    const l: Listener = (e) => ref.current(e);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
}
export function useConnection() {
  const [c, setC] = useState(connected);
  useEffect(() => { ensureStream(); statusListeners.add(setC); return () => { statusListeners.delete(setC); }; }, []);
  return c;
}

/** Busca dados e recarrega quando chegam eventos dos escopos informados (com intervalo de segurança). */
export function useData<T>(url: string | null, scopes: string[] = [], pollMs = 30000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const urlRef = useRef(url); urlRef.current = url;
  const timer = useRef<any>(null);
  const load = useCallback(async () => {
    if (!urlRef.current) return;
    try { const d = await get<T>(urlRef.current); setData(d); setError(null); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { setLoading(true); load(); }, [url, load]);
  useEffect(() => { if (!pollMs) return; const t = setInterval(load, pollMs); return () => clearInterval(t); }, [load, pollMs]);
  useLive((e) => {
    if (scopes.length && e.scope !== 'reconnect' && !scopes.includes(e.scope)) return;
    clearTimeout(timer.current); timer.current = setTimeout(load, 150);
  });
  return { data, error, loading, reload: load, setData };
}

export function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Bip curto via Web Audio (sem arquivo externo). */
let audioCtx: AudioContext | null = null;
export function beep(times = 2) {
  try {
    audioCtx ||= new AudioContext();
    const ctx = audioCtx;
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.35 + 0.25);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + i * 0.35); o.stop(ctx.currentTime + i * 0.35 + 0.3);
    }
  } catch { /* navegador sem áudio */ }
}
export function useSoundPref(key: string) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem(key) !== 'off'; } catch { return true; } });
  const toggle = () => { const v = !on; setOn(v); try { localStorage.setItem(key, v ? 'on' : 'off'); } catch { /* */ } if (v) beep(1); };
  return [on, toggle] as const;
}
