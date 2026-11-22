import { useState } from 'react';
import { useAuth } from '../lib/hooks';
import { cx } from './ui';

/**
 * Menu único das telas de equipe. Junta num só lugar: trocar de tela
 * (cozinha, churrasqueira, garçom, motoboy, cardápio, painel), voltar ao painel
 * e sair. Deixa o cabeçalho limpo, com só o essencial do trabalho à vista.
 */
export function TeamScreensMenu({ dark = false, current }: { dark?: boolean; current?: string }) {
  const { me, tenant, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const screens = [
    can('kitchen.use') && { to: '/cozinha', label: 'Cozinha' },
    can('kitchen.use') && tenant?.plan?.features?.churrasqueira !== false && { to: '/churrasqueira', label: 'Churrasqueira' },
    can('tables.use') && { to: '/garcom', label: 'Garçom' },
    can('delivery.courier') && { to: '/motoboy', label: 'Motoboy' },
    tenant && { to: `/${tenant.slug}`, label: 'Cardápio' },
    me.home?.startsWith('/admin') && { to: me.home, label: 'Painel' },
  ].filter(Boolean) as { to: string; label: string }[];
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className={cx('flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors', dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-lenha-800 ring-1 ring-lenha-200 hover:bg-lenha-50')}>
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" /></svg>
        Menu
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl bg-white p-1 text-lenha-800 shadow-xl ring-1 ring-lenha-200">
            {screens.length > 0 && <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-lenha-400">Ir para a tela</p>}
            {screens.map((s) => {
              const active = current === s.to;
              return (
                <a key={s.to + s.label} href={s.to} role="menuitem"
                  className={cx('block rounded-lg px-3 py-2.5 text-sm font-semibold', active ? 'bg-brasa-50 text-brasa-700' : 'hover:bg-lenha-100')}>
                  {s.label}{active && ' ·'}
                </a>
              );
            })}
            <hr className="my-1 border-lenha-100" />
            <button onClick={logout} role="menuitem" className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-alerta hover:bg-red-50">
              Sair{me.name ? ` · ${me.name.split(' ')[0]}` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
