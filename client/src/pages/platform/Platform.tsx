import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { get, post, put } from '../../lib/api';
import { money, parseMoney, centsToInput, dateTime, date } from '../../lib/format';
import { Badge, Button, Field, Input, Modal, MoneyInput, Select, Spinner, Stat, Textarea, Toggle, useAction, useToast, cx } from '../../components/ui';
import { PlatformWordmark } from '../../components/brand';

const STATUS: Record<string, { label: string; tone: any }> = { ativo: { label: 'Ativa', tone: 'ok' }, teste: { label: 'Em teste', tone: 'ouro' }, suspenso: { label: 'Suspensa', tone: 'alerta' }, cancelado: { label: 'Cancelada', tone: 'neutral' } };

function usePlatformMe() {
  const [me, setMe] = useState<any>(undefined);
  useEffect(() => { get('/api/platform/me').then((r) => setMe(r.user)).catch(() => setMe(null)); }, []);
  return me;
}

export function PlatformLogin() {
  const nav = useNavigate();
  const [setup, setSetup] = useState<boolean | null>(null);
  const [f, setF] = useState({ name: '', username: '', password: '', confirm: '', token: '' });
  const [tokenReq, setTokenReq] = useState(false);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { get('/api/platform/setup-needed').then((r) => { setSetup(r.needed); setTokenReq(r.token_required); }); get('/api/platform/me').then((r) => r.user && nav('/plataforma', { replace: true })); }, []); // eslint-disable-line
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (setup && f.password !== f.confirm) return setErr('As senhas não conferem.');
    setBusy(true);
    try { await post(setup ? '/api/platform/setup' : '/api/platform/login', setup ? { name: f.name, username: f.username, password: f.password, setup_token: f.token || undefined } : { username: f.username, password: f.password }); nav('/plataforma'); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const up = (k: string) => (e: any) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="tech-grid flex min-h-dvh items-center justify-center p-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-2xl">
        <PlatformWordmark />
        <h1 className="mt-6 font-slab text-2xl font-bold">{setup ? 'Configurar a plataforma' : 'Administração da plataforma'}</h1>
        <p className="mt-1 text-sm text-lenha-600">{setup ? 'Crie o primeiro acesso de administrador da OITICICAS DIGITAL.' : 'Área do dono e do suporte da plataforma.'}</p>
        <div className="mt-5 space-y-3">
          {setup && <Field label="Seu nome"><Input value={f.name} onChange={up('name')} required /></Field>}
          <Field label="Usuário"><Input value={f.username} onChange={up('username')} autoCapitalize="none" autoComplete="username" required /></Field>
          <Field label="Senha" hint={setup ? 'Mínimo de 10 caracteres.' : undefined}><Input type="password" value={f.password} onChange={up('password')} autoComplete={setup ? 'new-password' : 'current-password'} required /></Field>
          {setup && <Field label="Repita a senha"><Input type="password" value={f.confirm} onChange={up('confirm')} required /></Field>}
          {setup && tokenReq && <Field label="Código de configuração" hint="Valor da variável SETUP_TOKEN definida no servidor."><Input type="password" value={f.token} onChange={up('token')} required /></Field>}
        </div>
        {err && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-alerta" role="alert">{err}</p>}
        <Button type="submit" size="lg" className="mt-5 w-full" busy={busy} disabled={setup === null}>{setup ? 'Criar e entrar' : 'Entrar'}</Button>
      </form>
    </div>
  );
}

const NAV = [['/plataforma', 'Visão geral'], ['/plataforma/empresas', 'Empresas'], ['/plataforma/planos', 'Planos'], ['/plataforma/equipe', 'Equipe da plataforma'], ['/plataforma/auditoria', 'Auditoria']];
export function PlatformLayout() {
  const me = usePlatformMe();
  const nav = useNavigate();
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (me === null) nav('/plataforma/entrar', { replace: true }); }, [me]); // eslint-disable-line
  if (!me) return <Spinner />;
  const links = NAV.map(([to, label]) => (
    <NavLink key={to} to={to} end={to === '/plataforma'} onClick={() => setMenu(false)} className={({ isActive }) => cx('block rounded-xl px-3 py-2.5 font-semibold', isActive ? 'bg-brasa-500 text-white' : 'text-white/75 hover:bg-white/10')}>{label}</NavLink>
  ));
  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="tech-grid fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 p-5 lg:flex">
        <PlatformWordmark light size="sm" />
        <nav className="space-y-1">{links}</nav>
      </aside>
      {menu && <div className="fixed inset-0 z-40 bg-lenha-900/60 lg:hidden" onClick={() => setMenu(false)}><aside className="tech-grid h-full w-72 space-y-6 p-5" onClick={(e) => e.stopPropagation()}><PlatformWordmark light size="sm" /><nav className="space-y-1">{links}</nav></aside></div>}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-lenha-100 bg-papel/95 px-4 backdrop-blur">
        <button className="grid size-10 place-items-center rounded-xl hover:bg-lenha-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu"><svg viewBox="0 0 24 24" className="size-6" fill="currentColor"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" /></svg></button>
        <span className="font-slab font-bold">Plataforma</span>
        <span className="ml-auto text-sm text-lenha-600">{me.name}</span>
        <button className="h-9 rounded-full px-3 text-sm font-semibold hover:bg-lenha-100" onClick={() => post('/api/platform/logout').then(() => nav('/plataforma/entrar'))}>Sair</button>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6"><Outlet /></main>
    </div>
  );
}

export function PlatformOverview() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { get('/api/platform/overview').then(setD); }, []);
  if (!d) return <Spinner />;
  return (
    <div className="space-y-4">
      <h1 className="font-slab text-2xl font-bold">Visão geral</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat tone="dark" label="Empresas ativas" value={d.tenants.ativos} sub={`${d.tenants.total} cadastradas · ${d.tenants.teste} em teste · ${d.tenants.suspensos} suspensas`} />
        <Stat label="Receita recorrente (planos com preço)" value={money(d.mrr.v)} sub={d.mrr.sem_preco ? `${d.mrr.sem_preco} empresa(s) em plano sem preço definido` : 'Soma dos planos das empresas ativas'} />
        <Stat label="Pedidos nas últimas 24h" value={d.today.orders} sub={`Movimentado pelas empresas: ${money(d.today.total)}`} />
        <Stat label="Pedidos no mês" value={d.month.orders} sub={`Movimentado: ${money(d.month.total)}`} />
      </div>
      <p className="text-sm text-lenha-600">Valores movimentados pertencem às empresas; a receita da plataforma vem dos planos. Cobrança automática de mensalidades ainda não está integrada.</p>
    </div>
  );
}

export function PlatformTenants() {
  const [list, setList] = useState<any[] | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const load = () => { get('/api/platform/tenants').then(setList); get('/api/platform/plans').then(setPlans); };
  useEffect(load, []);
  if (!list) return <Spinner />;
  const shown = list.filter((t) => !q || (t.name + t.slug).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="font-slab text-2xl font-bold">Empresas</h1>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="ml-auto sm:w-56" aria-label="Buscar empresa" />
        <Button onClick={() => setCreating(true)}>Nova empresa</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((t) => (
          <article key={t.id} className="rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-slab text-lg font-bold leading-tight">{t.name}</p>
                <a href={`/${t.slug}`} target="_blank" className="text-sm text-brasa-600 underline">/{t.slug}</a>
              </div>
              <Badge tone={STATUS[t.status].tone}>{STATUS[t.status].label}</Badge>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-lenha-500">Plano</dt><dd className="font-semibold">{t.plan_name || '—'}</dd></div>
              <div><dt className="text-lenha-500">Usuários</dt><dd className="font-semibold">{t.users}</dd></div>
              <div><dt className="text-lenha-500">Pedidos 30 dias</dt><dd className="font-semibold">{t.orders_30d}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-lenha-500">Desde {date(t.created_at)}{t.last_order ? ` · último pedido ${dateTime(t.last_order)}` : ''}{t.status === 'teste' && t.trial_ends_at ? ` · teste até ${date(t.trial_ends_at)}` : ''}</p>
            <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => setEdit(t)}>Gerenciar</Button></div>
          </article>
        ))}
      </div>
      {creating && <NewTenant plans={plans} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
      {edit && <TenantEditor tenant={edit} plans={plans} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

const slugify = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);

function NewTenant({ plans, onClose, onDone }: { plans: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', slug: '', plan_id: plans[0]?.id ? String(plans[0].id) : '', status: 'ativo', trial_days: '15', document: '', contact_name: '', contact_phone: '', contact_email: '', admin_name: '', admin_user: 'admin', admin_pass: '', tables: '0' });
  const [slugTouched, setSlugTouched] = useState(false);
  const { run, busy } = useAction();
  const up = (k: string) => (e: any) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === 'name' && !slugTouched ? { slug: slugify(e.target.value) } : {}) }));
  return (
    <Modal open onClose={onClose} title="Nova empresa" wide
      footer={<Button className="w-full" size="lg" busy={!!busy} disabled={f.name.length < 2 || f.slug.length < 3 || f.admin_pass.length < 8 || f.admin_name.length < 2}
        onClick={() => run('c', () => post('/api/platform/tenants', { name: f.name, slug: f.slug, plan_id: f.plan_id ? Number(f.plan_id) : null, status: f.status, trial_days: Number(f.trial_days) || 15,
          document: f.document, contact_name: f.contact_name, contact_phone: f.contact_phone, contact_email: f.contact_email, tables: Number(f.tables) || 0,
          admin: { name: f.admin_name, username: f.admin_user, password: f.admin_pass } }).then(onDone), 'Empresa criada.')}>Criar empresa</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome da empresa"><Input value={f.name} onChange={up('name')} /></Field>
        <Field label="Endereço do cardápio" hint={`${location.origin}/${f.slug || 'nome-da-empresa'}`}><Input value={f.slug} onChange={(e) => { setSlugTouched(true); setF({ ...f, slug: slugify(e.target.value) }); }} /></Field>
        <Field label="Plano"><Select value={f.plan_id} onChange={up('plan_id')}><option value="">Sem plano</option>{plans.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Situação"><Select value={f.status} onChange={up('status')}><option value="ativo">Ativa</option><option value="teste">Período de teste</option></Select></Field>
        {f.status === 'teste' && <Field label="Dias de teste"><Input inputMode="numeric" value={f.trial_days} onChange={up('trial_days')} /></Field>}
        <Field label="CNPJ/CPF"><Input value={f.document} onChange={up('document')} /></Field>
        <Field label="Responsável"><Input value={f.contact_name} onChange={up('contact_name')} /></Field>
        <Field label="Telefone"><Input value={f.contact_phone} onChange={up('contact_phone')} /></Field>
        <Field label="E-mail"><Input type="email" value={f.contact_email} onChange={up('contact_email')} /></Field>
        <Field label="Criar mesas numeradas (0 = nenhuma)"><Input inputMode="numeric" value={f.tables} onChange={up('tables')} /></Field>
      </div>
      <h3 className="mt-5 font-slab text-lg font-bold">Primeiro acesso do administrador da empresa</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <Field label="Nome"><Input value={f.admin_name} onChange={up('admin_name')} /></Field>
        <Field label="Usuário"><Input value={f.admin_user} onChange={up('admin_user')} autoCapitalize="none" /></Field>
        <Field label="Senha inicial" hint="Mínimo de 8 caracteres."><Input type="password" value={f.admin_pass} onChange={up('admin_pass')} autoComplete="new-password" /></Field>
      </div>
    </Modal>
  );
}

/** M3: Reiniciar empresa. Confirmação com a palavra REINICIAR, a senha do dono da plataforma e o novo administrador. */
function ReiniciarEmpresa({ tenant, onClose, onDone }: { tenant: any; onClose: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState('');
  const [auth, setAuth] = useState({ username: '', password: '' });
  const [admin, setAdmin] = useState({ name: '', username: 'admin', password: '' });
  const { run, busy } = useAction();
  const pronto = confirm.trim().toUpperCase() === 'REINICIAR' && auth.username && auth.password && admin.name.length >= 2 && admin.username.length >= 3 && admin.password.length >= 8;
  return (
    <Modal open onClose={onClose} title={`Reiniciar ${tenant.name}`} wide
      footer={<Button variant="danger" className="w-full" busy={!!busy} disabled={!pronto}
        onClick={() => run('x', () => post(`/api/platform/tenants/${tenant.id}/reset`, { confirm, auth, admin }).then(onDone), 'Empresa reiniciada.')}>Reiniciar empresa agora</Button>}>
      <div className="rounded-xl bg-alerta/10 p-3 text-sm text-lenha-700">Isto apaga todos os dados operacionais e a auditoria de <strong>{tenant.name}</strong> e não pode ser desfeito. O cardápio e as configurações são mantidos.</div>
      <div className="mt-4 space-y-3">
        <Field label='Digite REINICIAR para confirmar'><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="REINICIAR" /></Field>
        <p className="text-sm font-semibold">Sua senha de administrador da plataforma</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Usuário da plataforma"><Input value={auth.username} autoCapitalize="none" onChange={(e) => setAuth({ ...auth, username: e.target.value })} /></Field>
          <Field label="Senha"><Input type="password" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} /></Field>
        </div>
        <p className="text-sm font-semibold">Administrador que o cliente vai usar</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Nome"><Input value={admin.name} onChange={(e) => setAdmin({ ...admin, name: e.target.value })} /></Field>
          <Field label="Usuário"><Input value={admin.username} autoCapitalize="none" onChange={(e) => setAdmin({ ...admin, username: e.target.value.replace(/\s/g, '') })} /></Field>
          <Field label="Senha (8+)"><Input type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function TenantEditor({ tenant, plans, onClose, onDone }: { tenant: any; plans: any[]; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ ...tenant, plan_id: tenant.plan_id ? String(tenant.plan_id) : '', trial_ends_at: tenant.trial_ends_at ? tenant.trial_ends_at.slice(0, 10) : '' });
  const [users, setUsers] = useState<any[]>([]);
  const [adm, setAdm] = useState({ name: '', username: 'admin', password: '' });
  const [reset, setReset] = useState<{ user_id: string; password: string }>({ user_id: '', password: '' });
  const [reiniciar, setReiniciar] = useState(false);
  const { run, busy } = useAction();
  const toast = useToast();
  useEffect(() => { get(`/api/platform/tenants/${tenant.id}/users`).then(setUsers); }, [tenant.id]);
  const up = (k: string) => (e: any) => setF((x: any) => ({ ...x, [k]: e.target.value }));
  const save = () => run('s', () => put(`/api/platform/tenants/${tenant.id}`, { name: f.name, slug: f.slug, plan_id: f.plan_id ? Number(f.plan_id) : null, status: f.status,
    trial_ends_at: f.trial_ends_at ? new Date(f.trial_ends_at + 'T23:59:59').toISOString() : null, document: f.document, contact_name: f.contact_name, contact_phone: f.contact_phone, contact_email: f.contact_email, notes: f.notes || '' })
    .then((r: any) => { if (r.slug_changed) toast('Endereço alterado: reimprima os QR Codes da empresa.', 'info'); onDone(); }), 'Empresa atualizada.');
  const enter = () => { const reason = prompt('Motivo do acesso de suporte (fica registrado para a empresa):'); if (reason && reason.length >= 3) run('i', () => post(`/api/platform/tenants/${tenant.id}/impersonate`, { reason }).then(() => { location.href = '/admin'; })); };
  return (
    <Modal open side onClose={onClose} title={tenant.name}
      footer={<Button className="w-full" busy={busy === 's'} onClick={save}>Salvar alterações</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><Input value={f.name} onChange={up('name')} /></Field>
        <Field label="Endereço" hint="Mudar o endereço invalida QR Codes e links já divulgados."><Input value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} /></Field>
        <Field label="Situação"><Select value={f.status} onChange={up('status')}><option value="ativo">Ativa</option><option value="teste">Em teste</option><option value="suspenso">Suspensa (bloqueia acesso e cardápio)</option><option value="cancelado">Cancelada</option></Select></Field>
        <Field label="Plano"><Select value={f.plan_id} onChange={up('plan_id')}><option value="">Sem plano</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        {f.status === 'teste' && <Field label="Teste até"><Input type="date" value={f.trial_ends_at} onChange={up('trial_ends_at')} /></Field>}
        <Field label="CNPJ/CPF"><Input value={f.document} onChange={up('document')} /></Field>
        <Field label="Responsável"><Input value={f.contact_name} onChange={up('contact_name')} /></Field>
        <Field label="Telefone"><Input value={f.contact_phone} onChange={up('contact_phone')} /></Field>
        <Field label="E-mail"><Input value={f.contact_email} onChange={up('contact_email')} /></Field>
        <Field label="Anotações internas" className="sm:col-span-2"><Textarea value={f.notes || ''} onChange={up('notes')} /></Field>
      </div>
      <section className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
        <h3 className="font-slab text-lg font-bold">Acessos da empresa</h3>
        {users.length === 0 ? <p className="text-sm text-alerta">A empresa ainda não tem usuários. Crie o administrador abaixo.</p> : (
          <ul className="mt-2 text-sm">{users.map((u) => <li key={u.id} className={cx(!u.active && 'opacity-50')}>{u.name} · @{u.username} · {u.role}</li>)}</ul>
        )}
        <p className="mt-3 text-sm font-semibold">Criar administrador</p>
        <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input placeholder="Nome" value={adm.name} onChange={(e) => setAdm({ ...adm, name: e.target.value })} aria-label="Nome do administrador" />
          <Input placeholder="Usuário" value={adm.username} onChange={(e) => setAdm({ ...adm, username: e.target.value })} aria-label="Usuário" />
          <Input placeholder="Senha (8+)" type="password" value={adm.password} onChange={(e) => setAdm({ ...adm, password: e.target.value })} aria-label="Senha" />
          <Button variant="outline" disabled={adm.name.length < 2 || adm.password.length < 8} busy={busy === 'a'} onClick={() => run('a', () => post(`/api/platform/tenants/${tenant.id}/admins`, adm).then(() => get(`/api/platform/tenants/${tenant.id}/users`).then(setUsers)), 'Administrador criado.')}>Criar</Button>
        </div>
        {users.length > 0 && <>
          <p className="mt-4 text-sm font-semibold">Redefinir senha</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Select value={reset.user_id} onChange={(e) => setReset({ ...reset, user_id: e.target.value })} aria-label="Usuário"><option value="">Escolha o usuário</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>)}</Select>
            <Input type="password" placeholder="Nova senha (8+)" value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} aria-label="Nova senha" />
            <Button variant="outline" disabled={!reset.user_id || reset.password.length < 8} busy={busy === 'r'} onClick={() => run('r', () => post(`/api/platform/tenants/${tenant.id}/reset-password`, { user_id: Number(reset.user_id), password: reset.password }).then(() => setReset({ user_id: '', password: '' })), 'Senha redefinida.')}>Redefinir</Button>
          </div>
        </>}
      </section>
      <section className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
        <h3 className="font-slab text-lg font-bold">Suporte</h3>
        <p className="text-sm text-lenha-600">Entra no painel da empresa como administrador por até 4 horas. O acesso fica registrado na auditoria da empresa.</p>
        <Button className="mt-2" variant="dark" busy={busy === 'i'} onClick={enter}>Acessar painel da empresa</Button>
      </section>

      <section className="mt-4 rounded-2xl border-2 border-alerta/40 bg-alerta/5 p-4">
        <h3 className="font-slab text-lg font-bold text-alerta">Reiniciar empresa</h3>
        <p className="text-sm text-lenha-600">Apaga <strong>todos</strong> os pedidos, pagamentos, caixas, entregas, clientes e a auditoria da empresa, e remove a equipe, deixando só um administrador novo. <strong>Mantém</strong> o cardápio, a logo, as cores e as configurações. Use ao entregar o sistema para o cliente. Não dá para desfazer.</p>
        <Button className="mt-2" variant="danger" onClick={() => setReiniciar(true)}>Reiniciar esta empresa</Button>
      </section>
      {reiniciar && <ReiniciarEmpresa tenant={tenant} onClose={() => setReiniciar(false)} onDone={() => { setReiniciar(false); onDone(); }} />}
    </Modal>
  );
}

export function PlatformPlans() {
  const [list, setList] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any>(null);
  const load = () => get('/api/platform/plans').then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <Spinner />;
  return (
    <div>
      <div className="mb-4 flex items-center"><h1 className="font-slab text-2xl font-bold">Planos</h1>
        <Button className="ml-auto" onClick={() => setEdit({ name: '', description: '', price: '', max_users: '', max_tables: '', max_products: '', features: { delivery: true, self_order: true, kds: true, reports: true }, active: true })}>Novo plano</Button></div>
      <p className="mb-4 text-sm text-lenha-600">Limites vazios = ilimitado. O preço é informativo até a cobrança automática ser integrada (ver documentação).</p>
      <div className="grid gap-3 md:grid-cols-3">
        {list.map((p) => (
          <article key={p.id} className={cx('rounded-2xl bg-white p-5 ring-1 ring-lenha-100', !p.active && 'opacity-60')}>
            <p className="font-slab text-xl font-bold">{p.name}</p>
            <p className="font-cond text-3xl font-bold text-brasa-600">{p.price_cents == null ? 'Preço a definir' : `${money(p.price_cents)}/mês`}</p>
            {p.description && <p className="mt-1 text-sm text-lenha-600">{p.description}</p>}
            <ul className="mt-3 space-y-1 text-sm">
              <li>Usuários: {p.max_users ?? 'ilimitado'}</li><li>Mesas: {p.max_tables ?? 'ilimitado'}</li><li>Produtos: {p.max_products ?? 'ilimitado'}</li>
              <li>Delivery: {p.features.delivery ? 'sim' : 'não'} · QR na mesa: {p.features.self_order ? 'sim' : 'não'} · Relatórios: {p.features.reports ? 'sim' : 'não'}</li>
            </ul>
            <p className="mt-2 text-xs text-lenha-500">{p.tenants} empresa(s)</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setEdit({ ...p, price: p.price_cents == null ? '' : centsToInput(p.price_cents), max_users: p.max_users ?? '', max_tables: p.max_tables ?? '', max_products: p.max_products ?? '' })}>Editar</Button>
          </article>
        ))}
      </div>
      {edit && <PlanEditor initial={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function PlanEditor({ initial, onClose, onDone }: { initial: any; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState(initial);
  const { run, busy } = useAction();
  const n = (v: any) => (v === '' || v == null ? null : Number(String(v).replace(/\D/g, '')) || null);
  const body = { name: f.name, description: f.description, price_cents: f.price === '' ? null : parseMoney(f.price), max_users: n(f.max_users), max_tables: n(f.max_tables), max_products: n(f.max_products), features: f.features, active: f.active };
  return (
    <Modal open onClose={onClose} title={f.id ? 'Editar plano' : 'Novo plano'}
      footer={<Button className="w-full" busy={!!busy} disabled={f.name.length < 2} onClick={() => run('s', () => (f.id ? put(`/api/platform/plans/${f.id}`, body) : post('/api/platform/plans', body)).then(onDone), 'Plano salvo.')}>Salvar</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Preço mensal" hint="Vazio = a definir"><MoneyInput value={f.price} onChange={(v) => setF({ ...f, price: v })} /></Field>
        <Field label="Descrição" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Máx. usuários"><Input inputMode="numeric" value={f.max_users} onChange={(e) => setF({ ...f, max_users: e.target.value })} placeholder="ilimitado" /></Field>
        <Field label="Máx. mesas"><Input inputMode="numeric" value={f.max_tables} onChange={(e) => setF({ ...f, max_tables: e.target.value })} placeholder="ilimitado" /></Field>
        <Field label="Máx. produtos"><Input inputMode="numeric" value={f.max_products} onChange={(e) => setF({ ...f, max_products: e.target.value })} placeholder="ilimitado" /></Field>
      </div>
      <div className="mt-4 space-y-3">
        {([['delivery', 'Delivery e retirada pelo cardápio'], ['self_order', 'Pedido pelo QR Code (mesa e balcão)'], ['kds', 'Tela da cozinha'], ['reports', 'Relatórios e exportação']] as const).map(([k, l]) => (
          <Toggle key={k} checked={f.features[k]} onChange={(v) => setF({ ...f, features: { ...f.features, [k]: v } })} label={l} />
        ))}
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Disponível para novas empresas" />
      </div>
    </Modal>
  );
}

export function PlatformTeam() {
  const [list, setList] = useState<any[] | null>(null);
  const [f, setF] = useState({ name: '', username: '', password: '' });
  const { run, busy } = useAction();
  const load = () => get('/api/platform/users').then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <Spinner />;
  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 font-slab text-2xl font-bold">Equipe da plataforma</h1>
      <ul className="divide-y divide-lenha-100 rounded-2xl bg-white ring-1 ring-lenha-100">
        {list.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1"><strong>{u.name}</strong> <span className="text-lenha-500">@{u.username}</span></span>
            <Toggle checked={u.active} onChange={(v) => run('t', () => put(`/api/platform/users/${u.id}`, { active: v }).then(load))} label={u.active ? 'Ativo' : 'Inativo'} />
          </li>
        ))}
      </ul>
      <h2 className="mt-6 font-slab text-lg font-bold">Novo acesso</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input placeholder="Nome" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Nome" />
        <Input placeholder="Usuário" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} aria-label="Usuário" />
        <Input placeholder="Senha (10+)" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-label="Senha" />
        <Button busy={!!busy} disabled={f.name.length < 2 || f.username.length < 3 || f.password.length < 10} onClick={() => run('c', () => post('/api/platform/users', f).then(() => { setF({ name: '', username: '', password: '' }); load(); }), 'Acesso criado.')}>Criar</Button>
      </div>
    </div>
  );
}

export function PlatformAudit() {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { get('/api/platform/audit').then(setList); }, []);
  if (!list) return <Spinner />;
  return (
    <div>
      <h1 className="mb-4 font-slab text-2xl font-bold">Auditoria da plataforma</h1>
      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-lenha-100">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-lenha-500"><th className="px-4 py-2">Quando</th><th>Quem</th><th>Ação</th><th>Empresa</th><th className="px-4">Detalhes</th></tr></thead>
          <tbody>{list.map((a) => (
            <tr key={a.id} className="border-t border-lenha-100 align-top"><td className="whitespace-nowrap px-4 py-2">{dateTime(a.created_at)}</td><td>{a.platform_name}</td><td className="font-semibold">{a.action.replace('platform.', '')}</td><td>{a.tenant_name || '—'}</td>
              <td className="max-w-md break-all px-4 text-xs text-lenha-600">{a.reason && <span className="block text-sm text-lenha-900">Motivo: {a.reason}</span>}{a.data_json ? JSON.stringify(a.data_json) : ''}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
