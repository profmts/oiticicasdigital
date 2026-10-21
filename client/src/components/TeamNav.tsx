import { useState } from 'react';
import { useAuth } from '../lib/hooks';
import { cx } from './ui';

/**
 * Menu para a equipe logada alternar entre as telas que tem permissão
 * (cozinha, garçom, motoboy, cardápio e painel). Mostra só as telas liberadas.
 * No cardápio público, só aparece quando há equipe logada; para o cliente comum, fica invisível.
 */
export function TeamScreensMenu({ dark = false, current }: { dark?: boolean; current?: string }) {
  const { me, tenant, can } = useAuth();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const screens = [
    can('kitchen.use') && { to: '/cozinha', label: 'Cozinha' },
    can('tables.use') && { to: '/garcom', label: 'Garçom' },
    can('delivery.courier') && { to: '/motoboy', label: 'Motoboy' },
    tenant && { to: `/${tenant.slug}`, label: 'Cardápio' },
    me.home?.startsWith('/admin') && { to: me.home, label: 'Painel' },
  ].filter(Boolean) as { to: string; label: string }[];
  if (screens.length <= 1) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className={cx('flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold transition-colors', dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white text-lenha-800 ring-1 ring-lenha-200 hover:bg-lenha-50')}>
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><path d="M4 5h16v2H4zm0 6h16v2H4zm0 6h16v2H4z" /></svg>
        Telas
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-xl bg-white p-1 shadow-xl ring-1 ring-lenha-200">
            {screens.map((s) => {
              const active = current === s.to;
              return (
                <a key={s.to + s.label} href={s.to} role="menuitem"
                  className={cx('block rounded-lg px-3 py-2 text-sm font-semibold', active ? 'bg-brasa-50 text-brasa-700' : 'text-lenha-800 hover:bg-lenha-100')}>
                  {s.label}{active && ' ·'}
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
