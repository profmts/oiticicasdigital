export const money = (c: number | null | undefined) =>
  c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "12,50" | "12.5" | "1.234,50" → centavos */
export function parseMoney(s: string): number {
  const t = String(s || '').trim().replace(/\s|R\$/g, '');
  if (!t) return NaN;
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/**
 * Máscara de dinheiro no estilo "centavos primeiro": a pessoa digita só números e o valor
 * se forma da direita para a esquerda, com separador de milhar e vírgula de centavos.
 * Ex.: "5" -> "0,05", "1250" -> "12,50", "123456" -> "1.234,56". Sem dígitos -> "".
 */
export const maskCents = (s: string | number): string => {
  const digits = String(s ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  const n = parseInt(digits, 10);
  return Math.floor(n / 100).toLocaleString('pt-BR') + ',' + String(n % 100).padStart(2, '0');
};
export const centsToInput = (c: number | null | undefined) => (c == null ? '' : maskCents(String(Math.round(c))));

/** Máscara de telefone enquanto digita: (83) 99999-9999 (celular) ou (83) 9999-9999 (fixo). */
export const maskPhone = (s: string): string => {
  const d = (s || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/** Máscara de CPF enquanto digita: 000.000.000-00. */
export const maskCpf = (s: string): string => {
  const d = (s || '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

export const time = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const dateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
export const date = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('pt-BR') : '—');

export function minutesSince(iso?: string | null, now = Date.now()) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}
export const elapsed = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`);

export const todayLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const addDays = (day: string, n: number) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

export const phoneFmt = (p?: string | null) => {
  const d = (p || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return p || '';
};

export const TYPE_LABEL: Record<string, string> = { delivery: 'Delivery', retirada: 'Retirada', mesa: 'Mesa', balcao: 'Balcão' };
export const CHANNEL_LABEL: Record<string, string> = { cardapio: 'Cardápio digital', qrcode: 'QR Code (presencial)', pdv: 'PDV', garcom: 'Garçom', whatsapp: 'WhatsApp', telefone: 'Telefone' };
export const STATUS_LABEL: Record<string, string> = {
  aguardando_confirmacao: 'Aguardando confirmação', confirmado: 'Aguardando preparo', em_preparo: 'Em preparo', pronto: 'Pronto',
  saiu_entrega: 'Saiu para entrega', concluido: 'Concluído', cancelado: 'Cancelado', aberto: 'Mesa aberta', fechamento: 'Conta solicitada',
};
export const SECTOR_LABEL: Record<string, string> = { espetos: 'Espetos', porcoes: 'Porções', bebidas: 'Bebidas', cozinha: 'Cozinha' };

export function waLink(phone: string, text: string) {
  const d = phone.replace(/\D/g, '');
  const full = d.length <= 11 ? '55' + d : d;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function mapsLink(a: { street?: string; number?: string; neighborhood?: string }, city = '') {
  const q = [a.street, a.number, a.neighborhood, city].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
