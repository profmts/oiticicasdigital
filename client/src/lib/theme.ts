import type { CSSProperties } from 'react';

/**
 * Identidade visual da empresa no cardápio público: sobrescreve os tokens do sistema
 * com a cor da marca e a cor escura escolhidas nas configurações.
 */
export function tenantTheme(s: { brand_color?: string; brand_dark?: string; menu_font?: string } | undefined): CSSProperties {
  const c = /^#[0-9a-f]{6}$/i.test(s?.brand_color || '') ? s!.brand_color! : '#2f6bff';
  const d = /^#[0-9a-f]{6}$/i.test(s?.brand_dark || '') ? s!.brand_dark! : '#0a1224';
  const mix = (a: string, pct: number, b = 'white') => `color-mix(in oklab, ${a} ${pct}%, ${b})`;
  return {
    '--color-brasa-50': mix(c, 8), '--color-brasa-100': mix(c, 18), '--color-brasa-200': mix(c, 35), '--color-brasa-400': mix(c, 80),
    '--color-brasa-500': c, '--color-brasa-600': mix(c, 85, 'black'), '--color-brasa-700': mix(c, 72, 'black'),
    '--color-lenha-50': mix(d, 5), '--color-lenha-100': mix(d, 11), '--color-lenha-200': mix(d, 20), '--color-lenha-300': mix(d, 40),
    '--color-lenha-500': mix(d, 65), '--color-lenha-700': mix(d, 85), '--color-lenha-800': mix(d, 93), '--color-lenha-900': d,
    '--color-papel': mix(c, 4), '--color-ouro-300': mix(c, 30), '--color-ouro-400': mix(c, 55),
    '--font-slab': s?.menu_font === 'slab' ? '"Zilla Slab", Georgia, serif' : '"Sora", system-ui, sans-serif',
    backgroundColor: 'var(--color-papel)', minHeight: '100dvh',
  } as CSSProperties;
}
