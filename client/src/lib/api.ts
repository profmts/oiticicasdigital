export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: any) { super(message); }
}

type Auth = { username: string; password: string };
type AuthAsker = (perm: string) => Promise<Auth | null>;
let askAuth: AuthAsker = async () => null;
export function setAuthAsker(fn: AuthAsker) { askAuth = fn; }

export async function api<T = any>(method: string, url: string, body?: any): Promise<T> {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body instanceof FormData ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth') && !url.startsWith('/api/public') && !location.pathname.includes('/entrar')) {
      location.href = url.startsWith('/api/platform') ? '/plataforma/entrar' : `/entrar?volta=${encodeURIComponent(location.pathname)}`;
    }
    throw new ApiError(res.status, data?.error || 'Não foi possível concluir. Verifique a conexão e tente de novo.', data?.details);
  }
  return data as T;
}

/**
 * Executa uma ação que pode exigir autorização de supervisor.
 * Se o servidor pedir, abre a janela de autorização e repete com as credenciais.
 */
export async function withAuth<T>(fn: (auth?: Auth) => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) {
    if (e instanceof ApiError && e.status === 403 && e.details?.needsAuthorization) {
      const auth = await askAuth(e.details.needsAuthorization);
      if (!auth) throw new ApiError(0, 'Ação cancelada.');
      return fn(auth);
    }
    throw e;
  }
}

export const get = <T = any>(u: string) => api<T>('GET', u);
export const post = <T = any>(u: string, b: any = {}) => api<T>('POST', u, b);
export const put = <T = any>(u: string, b: any) => api<T>('PUT', u, b);
export const patch = <T = any>(u: string, b: any) => api<T>('PATCH', u, b);
export const del = <T = any>(u: string, b: any = {}) => api<T>('DELETE', u, b);

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
