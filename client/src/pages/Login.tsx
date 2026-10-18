import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/hooks';
import { Button, Field, Input } from '../components/ui';
import { PlatformWordmark, TenantLogo } from '../components/brand';

export default function Login() {
  const nav = useNavigate();
  const { slug } = useParams();
  const [sp] = useSearchParams();
  const { me, refresh, demo } = useAuth();
  const [company, setCompany] = useState(() => slug || (() => { try { return localStorage.getItem('od_company') || ''; } catch { return ''; } })());
  const [tenant, setTenant] = useState<any>(null);
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (me) nav(sp.get('volta') || me.home, { replace: true }); }, [me]); // eslint-disable-line
  useEffect(() => {
    setTenant(null);
    const c = company.trim().toLowerCase();
    if (c.length < 3) return;
    const t = setTimeout(() => get(`/api/auth/tenant/${encodeURIComponent(c)}`).then(setTenant).catch(() => setTenant(null)), 350);
    return () => clearTimeout(t);
  }, [company]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      await post('/api/auth/login', { company: company.trim().toLowerCase(), username: f.username, password: f.password });
      try { localStorage.setItem('od_company', company.trim().toLowerCase()); } catch { /* */ }
      await refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="tech-grid relative hidden flex-col justify-between p-10 text-white lg:flex">
        <PlatformWordmark light size="lg" />
        <div className="max-w-md">
          <p className="font-slab text-4xl font-bold leading-tight">Pedidos, cozinha, mesas e caixa no mesmo lugar.</p>
          <p className="mt-4 text-lg text-white/70">Cada pessoa da equipe entra com o próprio usuário e vê só o que precisa para trabalhar.</p>
        </div>
        <p className="text-sm text-white/50">© {new Date().getFullYear()} OUTICICAS DIGITAL</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><PlatformWordmark /></div>
          {tenant ? (
            <div className="mb-6 flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-lenha-100">
              <TenantLogo url={tenant.logo_url} name={tenant.name} className="size-14 rounded-xl bg-white object-contain text-xl" />
              <div><p className="font-slab text-lg font-bold leading-tight">{tenant.name}</p><p className="text-sm text-lenha-500">{tenant.active ? 'Acesso da equipe' : 'Acesso suspenso'}</p></div>
            </div>
          ) : <h1 className="mb-6 font-slab text-3xl font-bold">Acesso da equipe</h1>}
          {demo && <p className="mb-4 rounded-xl bg-ouro-300/60 px-3 py-2 text-sm">Demonstração: empresa <strong>espetinho-do-sergio</strong>, usuários admin, gerente, caixa, garcom1, cozinha, motoboy1 — senha demo1234.</p>}
          <div className="space-y-4">
            {!slug && <Field label="Código da empresa" hint="É o final do endereço do cardápio. Ex.: espetinho-do-sergio"><Input value={company} onChange={(e) => setCompany(e.target.value.replace(/\s/g, '').toLowerCase())} autoCapitalize="none" required /></Field>}
            <Field label="Usuário"><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoCapitalize="none" autoComplete="username" required /></Field>
            <Field label="Senha"><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" required /></Field>
          </div>
          {err && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-alerta" role="alert">{err}</p>}
          <Button type="submit" size="lg" className="mt-6 w-full" busy={busy}>Entrar</Button>
          <div className="mt-6 flex justify-between text-sm text-lenha-500">
            {slug ? <Link to={`/${slug}`} className="underline">Ver o cardápio</Link> : <Link to="/" className="underline">Início</Link>}
            {slug && <Link to="/entrar" className="underline">Outra empresa</Link>}
          </div>
        </form>
      </div>
    </div>
  );
}
