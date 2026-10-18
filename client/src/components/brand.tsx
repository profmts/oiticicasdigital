import { cx } from './ui';

/** Marca da plataforma OUTICICAS DIGITAL (arquivo original enviado, só com o fundo removido). */
export function PlatformLogo({ light, className }: { light?: boolean; className?: string }) {
  return <img src={light ? '/outicicas-logo-white.png' : '/outicicas-logo.png'} alt="OUTICICAS DIGITAL" className={cx('object-contain', className)} />;
}

export function PlatformWordmark({ light, size = 'md' }: { light?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'lg' ? 'h-16' : size === 'sm' ? 'h-8' : 'h-11';
  const t = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-xl';
  return (
    <span className="inline-flex items-center gap-2.5">
      <PlatformLogo light={light} className={s + ' w-auto'} />
      <span className={cx('font-slab font-bold leading-none tracking-tight', t, light ? 'text-white' : 'text-lenha-900')}>
        OUTICICAS<span className={cx('block font-sans font-semibold tracking-[0.3em]', size === 'lg' ? 'text-base' : 'text-[0.6em]', light ? 'text-neon-300' : 'text-brasa-600')}>DIGITAL</span>
      </span>
    </span>
  );
}

export function TenantLogo({ url, name, className }: { url?: string | null; name: string; className?: string }) {
  if (url) return <img src={url} alt={name} className={cx('object-cover', className)} />;
  return <span style={{ backgroundColor: 'var(--color-brasa-500)', color: '#fff' }} className={cx('grid place-items-center font-slab font-bold', className)} aria-label={name}>{name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>;
}
