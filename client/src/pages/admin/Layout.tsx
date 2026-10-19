import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useConnection, useLive, useData, beep, useSoundPref } from '../../lib/hooks';
import { post } from '../../lib/api';
import { useToast, useAction, cx } from '../../components/ui';
import { PlatformWordmark, TenantLogo } from '../../components/brand';

const NAV: { to: string; label: string; perm: string; group: string; icon: string }[] = [
  { to: '/admin', label: 'Painel', perm: 'dashboard.view', group: 'Operação', icon: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z' },
  { to: '/admin/pedidos', label: 'Pedidos', perm: 'orders.view', group: 'Operação', icon: 'M4 4h4v16H4zm6 0h4v10h-4zm6 0h4v13h-4z' },
  { to: '/admin/pdv', label: 'PDV', perm: 'pdv.use', group: 'Operação', icon: 'M4 5h16v10H4zm-1 12h18v2H3zm5-9h2v4H8zm4 0h4v2h-4z' },
  { to: '/admin/mesas', label: 'Mesas', perm: 'tables.use', group: 'Operação', icon: 'M3 8h18v3h-2v8h-2v-8H7v8H5v-8H3z' },
  { to: '/admin/entregas', label: 'Entregas', perm: 'delivery.manage', group: 'Operação', icon: 'M5 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0m10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0M3 6h11v9H3zm11 3h4l3 4v2h-7z' },
  { to: '/admin/caixa', label: 'Caixa', perm: 'cash.operate', group: 'Operação', icon: 'M3 7h18v12H3zm2-3h14v2H5zm7 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6' },
  { to: '/admin/produtos', label: 'Cardápio', perm: 'products.manage', group: 'Gestão', icon: 'M5 3h14v18H5zm3 4h8v2H8zm0 4h8v2H8zm0 4h5v2H8z' },
  { to: '/admin/clientes', label: 'Clientes', perm: 'customers.view', group: 'Gestão', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-8 8c0-4 4-6 8-6s8 2 8 6z' },
  { to: '/admin/financeiro', label: 'Financeiro', perm: 'finance.view', group: 'Gestão', icon: 'M4 19h16v2H4zM6 10h3v7H6zm5-4h3v11h-3zm5 6h3v5h-3z' },
  { to: '/admin/relatorios', label: 'Relatórios', perm: 'reports.view', group: 'Gestão', icon: 'M6 2h9l5 5v15H6zm8 1v5h5M9 13h8v2H9zm0 4h8v2H9z' },
  { to: '/admin/usuarios', label: 'Equipe e acessos', perm: 'users.manage', group: 'Sistema', icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6M1 21c0-4 4-6 8-6s8 2 8 6zm16-5c3 0 6 1.5 6 5h-4' },
  { to: '/admin/qrcodes', label: 'QR Codes', perm: 'tables.manage', group: 'Sistema', icon: 'M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm8-2h3v3h-3zm3 3h2v2h-2zm2-3h3v3h-3zm-5 5h3v3h-3zm5 0h3v3h-3z' },
  { to: '/admin/configuracoes', label: 'Configurações', perm: 'settings.manage', group: 'Sistema', icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8m9 4-2-1 .5-2.3-2-2-2.2.6L14 3h-4l-1.2 2.3-2.3-.6-2 2L5 9 3 10v4l2 1-.5 2.3 2 2 2.3-.6L10 21h4l1.2-2.3 2.3.6 2-2L19 15l2-1z' },
  { to: '/admin/auditoria', label: 'Auditoria', perm: 'audit.view', group: 'Sistema', icon: 'M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5z' },
];

export default function AdminLayout() {
  const { me, can, logout, demo, tenant } = useAuth();
  const online = useConnection();
  const toast = useToast();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const [sound, toggleSound] = useSoundPref('esp_sound_admin');
  const settings = useData<any>('/api/admin/settings', ['settings'], 60000);
  const { run, busy } = useAction();
  useLive((e) => {
    if (e.scope === 'orders' && e.kind === 'new' && e.channel === 'cardapio' && can('orders.manage')) {
      if (sound) beep(3);
      toast('Novo pedido do cardápio digital aguardando confirmação.', 'info');
    }
    if (e.scope === 'orders' && e.kind === 'new' && e.channel === 'qrcode' && can('orders.manage')) {
      if (sound) beep(3);
      toast('Novo pedido pelo QR do balcão aguardando confirmação.', 'info');
    }
    if (e.scope === 'orders' && (e.kind === 'qr_order' || e.kind === 'call') && (can('tables.use') || can('orders.manage'))) {
      if (sound) beep(2);
      toast(e.kind === 'qr_order' ? `Mesa ${(e as any).table}: cliente fez pedido pelo QR.` : `Mesa ${(e as any).table}: ${(e as any).call === 'conta' ? 'pediu a conta' : 'chamou o garçom'}.`, 'info');
    }
    if (e.scope === 'orders' && e.kind === 'question' && (can('orders.manage') || can('tables.use'))) {
      if (sound) beep(1);
      toast('A cozinha enviou uma dúvida sobre um pedido. Veja o histórico do pedido.', 'info');
    }
  });
  const items = NAV.filter((n) => can(n.perm) || (n.to === '/admin/qrcodes' && can('settings.manage')));
  const groups = [...new Set(items.map((i) => i.group))];
  const isOpen = settings.data?.is_open;

  const tenantCard = tenant && (
    <div className="mb-5 flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5 ring-1 ring-white/10">
      <TenantLogo url={tenant.logo_url} name={tenant.name} className="size-11 shrink-0 rounded-xl bg-white object-contain text-sm" />
      <div className="min-w-0"><p className="truncate font-semibold text-white">{tenant.name}</p><p className="truncate text-xs text-neon-300">{tenant.plan?.name || 'Sem plano'}{tenant.status === 'teste' ? ' · em teste' : ''}</p></div>
    </div>
  );
  const nav = (
    <nav className="flex flex-col gap-5" aria-label="Menu principal">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1 px-3 text-xs font-semibold text-white/40">{g}</p>
          {items.filter((i) => i.group === g).map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/admin'} onClick={() => setMenu(false)}
              className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold', isActive ? 'bg-brasa-500 text-white' : 'text-white/80 hover:bg-white/10')}>
              <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="currentColor" aria-hidden><path d={i.icon} /></svg>{i.label}
            </NavLink>
          ))}
        </div>
      ))}
      <div>
        <p className="mb-1 px-3 text-xs font-semibold text-white/40">Telas da equipe</p>
        {can('kitchen.use') && <a href="/cozinha" className="block rounded-xl px-3 py-2.5 font-semibold text-white/80 hover:bg-white/10">Tela da cozinha</a>}
        {can('tables.use') && <a href="/garcom" className="block rounded-xl px-3 py-2.5 font-semibold text-white/80 hover:bg-white/10">App do garçom</a>}
        {can('delivery.courier') && <a href="/motoboy" className="block rounded-xl px-3 py-2.5 font-semibold text-white/80 hover:bg-white/10">App do motoboy</a>}
        {tenant && <a href={`/${tenant.slug}`} target="_blank" className="block rounded-xl px-3 py-2.5 font-semibold text-white/80 hover:bg-white/10">Cardápio digital</a>}
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="tech-grid fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto p-4 lg:flex">
        <div className="mb-4 px-1"><PlatformWordmark light size="sm" /></div>
        {tenantCard}
        {nav}
      </aside>
      {menu && (
        <div className="fixed inset-0 z-40 bg-lenha-900/60 lg:hidden" onClick={() => setMenu(false)}>
          <aside className="tech-grid h-full w-72 overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 px-1"><PlatformWordmark light size="sm" /></div>{tenantCard}{nav}
          </aside>
        </div>
      )}
      <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-lenha-100 bg-papel/95 px-3 backdrop-blur sm:px-5">
        <button className="grid size-10 place-items-center rounded-xl hover:bg-lenha-100 lg:hidden" onClick={() => setMenu(true)} aria-label="Abrir menu">
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z" /></svg>
        </button>
        <span className="truncate font-slab text-lg font-bold">{NAV.find((n) => (n.to === '/admin' ? loc.pathname === '/admin' : loc.pathname.startsWith(n.to)))?.label}</span>
        {demo && <span className="hidden rounded-full bg-ouro-400 px-2 py-0.5 text-xs font-bold sm:inline">Demonstração</span>}
        <div className="ml-auto flex items-center gap-2">
          {settings.data && (can('orders.manage') || can('settings.manage')) && (
            <button disabled={busy === 'store'} onClick={() => run('store', () => post('/api/admin/store/open', { open: !isOpen }).then(() => settings.reload()), isOpen ? 'Loja fechada para pedidos online.' : 'Loja aberta para pedidos online.')}
              className={cx('flex h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold', isOpen ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}
              title="Abrir/fechar o cardápio digital para novos pedidos">
              <span className={cx('size-2 rounded-full', isOpen ? 'bg-ok' : 'bg-alerta')} /><span className="sm:hidden">{isOpen ? 'Aberta' : 'Fechada'}</span><span className="hidden sm:inline">{isOpen ? 'Loja aberta' : 'Loja fechada'}</span>
            </button>
          )}
          <button onClick={toggleSound} className="grid size-9 place-items-center rounded-full hover:bg-lenha-100" aria-label={sound ? 'Desligar som de novos pedidos' : 'Ligar som de novos pedidos'} title={sound ? 'Som ligado' : 'Som desligado'}>
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">{sound ? <path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4M14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6" /> : <path d="M3 9v6h4l5 5V4L7 9zm18.6 6.2-1.4 1.4-3.2-3.2-3.2 3.2-1.4-1.4 3.2-3.2-3.2-3.2 1.4-1.4 3.2 3.2 3.2-3.2 1.4 1.4-3.2 3.2z" />}</svg>
          </button>
          <span className={cx('size-2.5 rounded-full', online ? 'bg-ok' : 'bg-alerta')} title={online ? 'Atualização em tempo real ativa' : 'Sem conexão em tempo real — reconectando'} />
          <div className="hidden text-right text-sm leading-tight sm:block"><p className="font-semibold">{me?.name}</p><p className="text-lenha-500">{me?.role_label}</p></div>
          <button onClick={logout} className="h-9 rounded-full px-3 text-sm font-semibold text-lenha-700 hover:bg-lenha-100">Sair</button>
        </div>
      </header>
      {me?.impersonatedBy ? <p className="no-print bg-ouro-400 px-4 py-1.5 text-center text-sm font-semibold">Acesso de suporte da plataforma em andamento — tudo fica registrado na auditoria.</p> : null}
      <main className="p-3 sm:p-5"><Outlet /></main>
    </div>
  );
}
