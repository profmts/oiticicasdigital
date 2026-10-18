import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/hooks';
import { Button, Field, Input, cx } from '../components/ui';
import { PlatformWordmark, TenantLogo } from '../components/brand';

const ROLE_ICON: Record<string, string> = { admin: '★', gerente: '◆', caixa: '$', cozinha: '🍳', garcom: '🍽', motoboy: '🛵' };
const ROLE_ORDER = ['admin', 'gerente', 'caixa', 'cozinha', 'garcom', 'motoboy'];
const pinKey = (slug: string) => `od_pin_${slug}`;

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
  // M11: fluxo com PIN e escolha de perfil
  const [pin, setPin] = useState('');
  const [profiles, setProfiles] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => { if (me) nav(sp.get('volta') || me.home, { replace: true }); }, [me]); // eslint-disable-line
  useEffect(() => {
    setTenant(null); setProfiles(null); setSelected(null); setErr('');
    const c = company.trim().toLowerCase();
    if (c.length < 3) return;
    const t = setTimeout(() => get(`/api/auth/tenant/${encodeURIComponent(c)}`).then(setTenant).catch(() => setTenant(null)), 350);
    return () => clearTimeout(t);
  }, [company]);

  // Se a empresa usa PIN e o aparelho já lembra o PIN, tenta carregar os perfis sozinho.
  useEffect(() => {
    if (!tenant?.pin_login || profiles) return;
    let saved = ''; try { saved = localStorage.getItem(pinKey(tenant.slug)) || ''; } catch { /* */ }
    if (saved) carregarPerfis(saved, true);
  }, [tenant]); // eslint-disable-line

  const carregarPerfis = async (code: string, silencioso = false) => {
    setErr(''); setBusy(true);
    try {
      const r = await post('/api/auth/profiles', { company: tenant.slug, pin: code });
      setProfiles(r.profiles);
      try { localStorage.setItem(pinKey(tenant.slug), code); localStorage.setItem('od_company', tenant.slug); } catch { /* */ }
    } catch (e: any) {
      try { localStorage.removeItem(pinKey(tenant.slug)); } catch { /* */ }
      if (!silencioso) setErr(e.message);
    } finally { setBusy(false); }
  };

  const entrar = async (username: string, password: string) => {
    setErr(''); setBusy(true);
    try {
      await post('/api/auth/login', { company: (tenant?.slug || company).trim().toLowerCase(), username, password });
      try { localStorage.setItem('od_company', (tenant?.slug || company).trim().toLowerCase()); } catch { /* */ }
      await refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const trocarPin = () => { setProfiles(null); setSelected(null); setPin(''); setErr(''); try { localStorage.removeItem(pinKey(tenant.slug)); } catch { /* */ } };

  const usaPin = !!tenant?.pin_login;
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="tech-grid relative hidden flex-col justify-between p-10 text-white lg:flex">
        <PlatformWordmark light size="lg" />
        <div className="max-w-md">
          <p className="font-slab text-4xl font-bold leading-tight">Pedidos, cozinha, mesas e caixa no mesmo lugar.</p>
          <p className="mt-4 text-lg text-white/70">Cada pessoa da equipe entra com o próprio usuário e vê só o que precisa para trabalhar.</p>
        </div>
        <p className="text-sm text-white/50">© {new Date().getFullYear()} OITICICAS DIGITAL</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><PlatformWordmark /></div>
          {tenant ? (
            <div className="mb-6 flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-lenha-100">
              <TenantLogo url={tenant.logo_url} name={tenant.name} className="size-14 rounded-xl bg-white object-contain text-xl" />
              <div><p className="font-slab text-lg font-bold leading-tight">{tenant.name}</p><p className="text-sm text-lenha-500">{tenant.active ? 'Acesso da equipe' : 'Acesso suspenso'}</p></div>
            </div>
          ) : <h1 className="mb-6 font-slab text-3xl font-bold">Acesso da equipe</h1>}
          {demo && <p className="mb-4 rounded-xl bg-ouro-300/60 px-3 py-2 text-sm">Demonstração: empresa <strong>espetinho-do-sergio</strong>, usuários admin, gerente, caixa, garcom1, cozinha, motoboy1 — senha demo1234.</p>}

          {!slug && (
            <Field label="Código da empresa" hint="É o final do endereço do cardápio. Ex.: espetinho-do-sergio" className="mb-4">
              <Input value={company} onChange={(e) => setCompany(e.target.value.replace(/\s/g, '').toLowerCase())} autoCapitalize="none" required />
            </Field>
          )}

          {/* ---- Fluxo com PIN e escolha de perfil ---- */}
          {usaPin && !profiles && (
            <form onSubmit={(e) => { e.preventDefault(); carregarPerfis(pin); }}>
              <Field label="PIN da loja" hint="Peça o código à gerência. O aparelho lembra depois da primeira vez.">
                <Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={8} autoFocus required className="text-center text-2xl tracking-[0.4em]" />
              </Field>
              {err && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-alerta" role="alert">{err}</p>}
              <Button type="submit" size="lg" className="mt-6 w-full" busy={busy} disabled={pin.length < 4}>Continuar</Button>
            </form>
          )}

          {usaPin && profiles && !selected && (
            <div>
              <p className="mb-3 text-sm font-semibold text-lenha-600">Quem é você?</p>
              <div className="grid grid-cols-2 gap-2">
                {profiles.slice().sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)).map((p) => (
                  <button key={p.username} onClick={() => { setSelected(p); setErr(''); setF({ username: p.username, password: '' }); }}
                    className="flex flex-col items-start gap-1 rounded-2xl bg-white p-3 text-left ring-1 ring-lenha-200 hover:ring-brasa-400">
                    <span className="grid size-9 place-items-center rounded-full bg-brasa-100 text-lg text-brasa-700">{ROLE_ICON[p.role] || '•'}</span>
                    <span className="font-semibold leading-tight">{p.name.split(' ')[0]}</span>
                    <span className="text-xs text-lenha-500">{p.role_label}</span>
                  </button>
                ))}
              </div>
              {profiles.length === 0 && <p className="text-sm text-lenha-500">Nenhum acesso cadastrado nesta empresa.</p>}
              <button className="mt-5 text-sm text-lenha-500 underline" onClick={trocarPin}>Trocar o PIN deste aparelho</button>
            </div>
          )}

          {usaPin && selected && (
            <form onSubmit={(e) => { e.preventDefault(); entrar(selected.username, f.password); }}>
              <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-lenha-200">
                <span className="grid size-10 place-items-center rounded-full bg-brasa-100 text-lg text-brasa-700">{ROLE_ICON[selected.role] || '•'}</span>
                <div><p className="font-semibold leading-tight">{selected.name}</p><p className="text-xs text-lenha-500">{selected.role_label}</p></div>
              </div>
              <Field label="Sua senha"><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" autoFocus required /></Field>
              {err && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-alerta" role="alert">{err}</p>}
              <Button type="submit" size="lg" className="mt-6 w-full" busy={busy}>Entrar</Button>
              <button type="button" className="mt-4 text-sm text-lenha-500 underline" onClick={() => { setSelected(null); setErr(''); }}>Escolher outro perfil</button>
            </form>
          )}

          {/* ---- Login tradicional (empresas sem PIN) ---- */}
          {!usaPin && (
            <form onSubmit={(e) => { e.preventDefault(); entrar(f.username, f.password); }}>
              <div className="space-y-4">
                <Field label="Usuário"><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoCapitalize="none" autoComplete="username" required /></Field>
                <Field label="Senha"><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="current-password" required /></Field>
              </div>
              {err && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-alerta" role="alert">{err}</p>}
              <Button type="submit" size="lg" className="mt-6 w-full" busy={busy}>Entrar</Button>
            </form>
          )}

          <div className="mt-6 flex justify-between text-sm text-lenha-500">
            {slug ? <Link to={`/${slug}`} className="underline">Ver o cardápio</Link> : <Link to="/" className="underline">Início</Link>}
            {slug && <Link to="/entrar" className="underline">Outra empresa</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}
