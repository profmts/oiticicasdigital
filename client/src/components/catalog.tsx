import { useEffect, useState } from 'react';
import { money } from '../lib/format';
import { Button, Modal, Textarea, cx } from './ui';

export interface CartLine {
  key: string; variant_id: number; product_id: number; qty: number; option_ids: number[]; notes: string;
  name: string; variant_name: string; options: string[]; unit_cents: number;
}

export const variantsFor = (p: any, type: string) =>
  p.variants.filter((v: any) => v.active !== 0 && (v.order_types || p.order_types).includes(type));

export const lineTotal = (l: CartLine) => l.unit_cents * l.qty;
export const cartTotal = (ls: CartLine[]) => ls.reduce((s, l) => s + lineTotal(l), 0);

export function priceLabel(p: any, type: string) {
  const vs = variantsFor(p, type);
  if (!vs.length) return '';
  const min = Math.min(...vs.map((v: any) => v.price_cents));
  const max = Math.max(...vs.map((v: any) => v.price_cents));
  return min === max ? money(min) : `${money(min)} a ${money(max)}`;
}

/** Montagem do item: variação, opções obrigatórias/adicionais, quantidade e observação. */
export function ProductModal({ product, type, onClose, onAdd, cta = 'Adicionar' }: { product: any | null; type: string; onClose: () => void; onAdd: (l: CartLine) => void; cta?: string }) {
  const vs = product ? variantsFor(product, type) : [];
  const [variantId, setVariantId] = useState<number | null>(null);
  const [sel, setSel] = useState<Record<number, number[]>>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const key = product?.id;
  useEffect(() => { setVariantId(vs.length === 1 ? vs[0].id : null); setSel({}); setQty(1); setNotes(''); setTried(false); }, [key]); // eslint-disable-line
  if (!product) return null;
  const v = vs.find((x: any) => x.id === variantId);
  const groups = product.option_groups.map((g: any) => ({ ...g, options: g.options.filter((o: any) => o.active !== 0) }));
  const chosen = groups.flatMap((g: any) => g.options.filter((o: any) => (sel[g.id] || []).includes(o.id)));
  const unit = (v?.price_cents || 0) + chosen.reduce((s: number, o: any) => s + o.price_cents, 0);
  const missing = [!v && 'o tamanho/opção', ...groups.filter((g: any) => (sel[g.id] || []).length < g.min_select).map((g: any) => g.name.toLowerCase())].filter(Boolean) as string[];
  const toggle = (g: any, oid: number) => setSel((s) => {
    const cur = s[g.id] || [];
    if (cur.includes(oid)) return { ...s, [g.id]: cur.filter((x) => x !== oid) };
    if (g.max_select === 1) return { ...s, [g.id]: [oid] };
    if (cur.length >= g.max_select) return s;
    return { ...s, [g.id]: [...cur, oid] };
  });
  const add = () => {
    setTried(true);
    if (missing.length) return;
    onAdd({ key: `${v.id}-${Date.now()}`, variant_id: v.id, product_id: product.id, qty, option_ids: chosen.map((o: any) => o.id), notes: notes.trim(),
      name: product.name, variant_name: v.name === 'Único' ? '' : v.name, options: chosen.map((o: any) => o.name), unit_cents: unit });
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={product.name}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-lenha-200 bg-white">
            <button className="size-11 text-2xl text-lenha-700" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Diminuir">−</button>
            <span className="w-8 text-center font-cond text-xl font-bold tabnums" aria-live="polite">{qty}</span>
            <button className="size-11 text-2xl text-lenha-700" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="Aumentar">+</button>
          </div>
          <Button className="flex-1" size="lg" onClick={add}>{cta} · {money(unit * qty)}</Button>
        </div>
      }>
      {product.image_url && <img src={product.image_url} alt="" className="mb-4 aspect-[16/9] w-full rounded-2xl object-cover" />}
      {product.description && <p className="mb-4 text-lenha-700">{product.description}</p>}
      {vs.length > 1 && (
        <fieldset className="mb-5">
          <legend className="mb-2 font-semibold">Escolha <span className="text-sm font-normal text-lenha-500">(obrigatório)</span></legend>
          <div className="grid gap-2">
            {vs.map((x: any) => (
              <button key={x.id} onClick={() => setVariantId(x.id)} className={cx('flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left', variantId === x.id ? 'border-brasa-500 bg-brasa-50' : 'border-lenha-100 bg-white')}>
                <span className="font-semibold">{x.name}</span><span className="tabnums">{money(x.price_cents)}</span>
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {groups.map((g: any) => (
        <fieldset key={g.id} className="mb-5">
          <legend className="mb-2 font-semibold">{g.name} <span className="text-sm font-normal text-lenha-500">{g.min_select > 0 ? `(escolha ${g.max_select === g.min_select ? g.min_select : `de ${g.min_select} a ${g.max_select}`})` : `(opcional, até ${g.max_select})`}</span></legend>
          <div className="grid grid-cols-2 gap-2">
            {g.options.map((o: any) => {
              const on = (sel[g.id] || []).includes(o.id);
              return (
                <button key={o.id} onClick={() => toggle(g, o.id)} className={cx('rounded-xl border-2 px-3 py-2 text-left text-sm', on ? 'border-brasa-500 bg-brasa-50 font-semibold' : 'border-lenha-100 bg-white')}>
                  {o.name}{o.price_cents > 0 && <span className="block text-xs text-lenha-500">+ {money(o.price_cents)}</span>}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <label className="block">
        <span className="mb-1 block font-semibold">Observação <span className="text-sm font-normal text-lenha-500">(opcional)</span></span>
        <Textarea value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: bem passado, sem cebola" />
      </label>
      {tried && missing.length > 0 && <p className="mt-3 text-sm font-semibold text-alerta">Falta escolher {missing.join(' e ')}.</p>}
    </Modal>
  );
}

/** Seletor rápido de produtos para PDV e garçom. */
export function ProductPicker({ catalog, type, onAdd, compact }: { catalog: any; type: string; onAdd: (l: CartLine) => void; compact?: boolean }) {
  const [cat, setCat] = useState<number | 'all'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<any>(null);
  const cats = (catalog?.categories || []).filter((c: any) => c.products.some((p: any) => variantsFor(p, type).length));
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const prods = cats.flatMap((c: any) => (cat === 'all' || cat === c.id ? c.products : []))
    .filter((p: any) => variantsFor(p, type).length && (!q || norm(p.name).includes(norm(q))));
  const pick = (p: any) => {
    const vs = variantsFor(p, type);
    if (vs.length === 1 && p.option_groups.length === 0) {
      onAdd({ key: `${vs[0].id}-${Date.now()}`, variant_id: vs[0].id, product_id: p.id, qty: 1, option_ids: [], notes: '', name: p.name, variant_name: '', options: [], unit_cents: vs[0].price_cents });
    } else setOpen(p);
  };
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto"
        className="h-12 w-full rounded-xl border border-lenha-200 bg-white px-4 text-base focus:border-brasa-500 focus:outline-none focus:ring-2 focus:ring-brasa-200" />
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ id: 'all', name: 'Todos' }, ...cats].map((c: any) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={cx('h-10 shrink-0 rounded-full px-4 text-sm font-semibold', cat === c.id ? 'bg-lenha-900 text-white' : 'bg-white text-lenha-700 border border-lenha-200')}>{c.name}</button>
        ))}
      </div>
      <div className={cx('scroll-visible grid gap-2 overflow-y-auto', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4')}>
        {prods.map((p: any) => (
          <button key={p.id} onClick={() => pick(p)} className="flex min-h-20 flex-col justify-between rounded-xl border border-lenha-100 bg-white p-3 text-left hover:border-brasa-400 active:bg-brasa-50">
            <span className="font-semibold leading-tight">{p.name}</span>
            <span className="mt-1 text-sm text-brasa-700 tabnums">{priceLabel(p, type)}{p.option_groups.length > 0 && ' · opções'}</span>
          </button>
        ))}
        {prods.length === 0 && <p className="col-span-full py-6 text-center text-lenha-500">Nenhum produto encontrado.</p>}
      </div>
      <ProductModal product={open} type={type} onClose={() => setOpen(null)} onAdd={onAdd} />
    </div>
  );
}

export function CartList({ lines, setLines, showValues = true }: { lines: CartLine[]; setLines: (f: (l: CartLine[]) => CartLine[]) => void; showValues?: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!lines.length) return <p className="py-8 text-center text-sm text-lenha-500">Toque nos produtos para adicionar.</p>;
  return (
    <ul className="divide-y divide-lenha-100">
      {lines.map((l) => (
        <li key={l.key} className="py-2">
          <div className="flex items-start gap-2">
            <div className="flex items-center rounded-lg border border-lenha-200 bg-white">
              <button className="h-8 w-8 text-lg" aria-label="Diminuir" onClick={() => setLines((ls) => ls.flatMap((x) => (x.key === l.key ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x])))}>−</button>
              <span className="w-6 text-center font-bold tabnums">{l.qty}</span>
              <button className="h-8 w-8 text-lg" aria-label="Aumentar" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, qty: Math.min(99, x.qty + 1) } : x)))}>+</button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-tight">{l.name}{l.variant_name && <span className="font-normal text-lenha-500"> · {l.variant_name}</span>}</p>
              {l.options.length > 0 && <p className="text-xs text-lenha-500">{l.options.join(', ')}</p>}
              {editing === l.key ? (
                <input autoFocus defaultValue={l.notes} maxLength={200} onBlur={(e) => { const v = e.target.value; setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, notes: v } : x))); setEditing(null); }}
                  className="mt-1 h-8 w-full rounded-lg border border-lenha-200 px-2 text-sm" placeholder="Observação" />
              ) : (
                <button className="text-left text-xs font-semibold text-brasa-700" onClick={() => setEditing(l.key)}>{l.notes ? `Obs.: ${l.notes}` : '+ observação'}</button>
              )}
            </div>
            {showValues && <span className="text-sm font-semibold tabnums">{money(lineTotal(l))}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
