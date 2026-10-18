import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post, uid } from '../../lib/api';
import { money, parseMoney, waLink, phoneFmt, time } from '../../lib/format';
import { tenantTheme } from '../../lib/theme';
import { ProductModal, priceLabel, variantsFor, cartTotal, lineTotal, type CartLine } from '../../components/catalog';
import { Button, Field, Input, Select, Textarea, Modal, MoneyInput, Spinner, ErrorBox, cx } from '../../components/ui';
import { TenantLogo, PlatformLogo } from '../../components/brand';

type Mode = 'online' | 'mesa' | 'balcao';
const load = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') ?? d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } };

export default function Menu({ mode = 'online' }: { mode?: Mode }) {
  const { slug = '', token = '' } = useParams();
  const [data, setData] = useState<any>(null);
  const [table, setTable] = useState<any>(null);
  const [err, setErr] = useState('');
  const [type, setType] = useState<string>(() => (mode === 'mesa' ? 'mesa' : mode === 'balcao' ? 'balcao' : load(`od_type_${slug}`, 'delivery')));
  const cartKey = `od_cart_${slug}_${mode}`;
  const [cart, setCart] = useState<CartLine[]>(() => load(cartKey, []));
  const [open, setOpen] = useState<any>(null);
  const [q, setQ] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [comanda, setComanda] = useState(false);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const sections = useRef<Record<number, HTMLElement | null>>({});

  const fetchMenu = useCallback(() => get(`/api/public/${slug}/menu`).then(setData).catch((e) => setErr(e.message)), [slug]);
  const fetchTable = useCallback(() => mode === 'mesa' ? get(`/api/public/${slug}/tables/${token}`).then(setTable).catch((e) => setErr(e.message)) : Promise.resolve(), [slug, token, mode]);
  useEffect(() => { fetchMenu(); fetchTable(); const t = setInterval(() => { fetchMenu(); fetchTable(); }, mode === 'mesa' ? 15000 : 60000); return () => clearInterval(t); }, [fetchMenu, fetchTable, mode]);
  useEffect(() => save(cartKey, cart), [cart, cartKey]);
  useEffect(() => { if (mode === 'online') save(`od_type_${slug}`, type); }, [type, slug, mode]);
  useEffect(() => { if (data?.settings?.store_name) document.title = `${data.settings.store_name} · Cardápio`; }, [data]);
  useEffect(() => {
    const st = data?.settings; if (!st || mode !== 'online') return;
    if (type === 'delivery' && !st.accept_delivery && st.accept_pickup) setType('retirada');
    if (type === 'retirada' && !st.accept_pickup && st.accept_delivery) setType('delivery');
  }, [data, type, mode]);

  const validVariantIds = useMemo(() => new Set((data?.categories || []).flatMap((c: any) => c.products.flatMap((p: any) => variantsFor(p, type).map((v: any) => v.id)))), [data, type]);
  const invalid = data ? cart.filter((l) => !validVariantIds.has(l.variant_id)) : [];

  if (err && !data) return <div className="mx-auto max-w-lg p-6"><ErrorBox msg={err} retry={fetchMenu} /></div>;
  if (!data || (mode === 'mesa' && !table)) return <Spinner label="Abrindo o cardápio…" />;
  const s = data.settings;
  const accepting = mode === 'online' ? s.is_open : mode === 'mesa' ? table.enabled : s.self_order_counter_enabled;

  const norm = (x: string) => x.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const cats = data.categories.map((c: any) => ({ ...c, products: c.products.filter((p: any) => variantsFor(p, type).length && (!q || norm(p.name + ' ' + p.description).includes(norm(q)))) })).filter((c: any) => c.products.length);
  const featured = data.categories.flatMap((c: any) => c.products).filter((p: any) => p.featured && variantsFor(p, type).length);
  const total = cartTotal(cart);
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const go = (cid: number) => { setActiveCat(cid); sections.current[cid]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const minPrice = (p: any) => Math.min(...variantsFor(p, type).map((v: any) => v.price_cents));

  return (
    <div style={tenantTheme(s)} className="pb-28 text-lenha-900">
      {data.demo && <div className="bg-ouro-400 px-4 py-1.5 text-center text-sm font-semibold text-lenha-900">Ambiente de demonstração — pedidos aqui são fictícios.</div>}
      <Hero s={s} tenant={data.tenant} />

      <div className="mx-auto max-w-3xl px-4">
        <div className="relative z-10 -mt-7 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-lenha-100">
          {mode === 'mesa' ? (
            <TableBar slug={slug} token={token} table={table} onComanda={() => setComanda(true)} reload={fetchTable} />
          ) : mode === 'balcao' ? (
            <div>
              <p className="font-slab text-xl font-bold">Pedido no balcão</p>
              <p className="text-sm text-lenha-600">Escolha, envie e acompanhe pelo número do pedido. O pagamento é feito no caixa.</p>
              {!accepting && <p className="mt-2 font-semibold text-alerta">Pedidos pelo QR do balcão estão desativados. Faça seu pedido no caixa.</p>}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className={cx('inline-flex items-center gap-2 font-semibold', s.is_open ? 'text-ok' : 'text-alerta')}>
                  <span className={cx('size-2.5 rounded-full', s.is_open ? 'bg-ok' : 'bg-alerta')} />{s.is_open ? 'Aberto agora' : 'Fechado'}
                </span>
                {s.is_open && type === 'delivery' && s.delivery_estimate_minutes && <span className="text-sm text-lenha-600">Entrega em cerca de {s.delivery_estimate_minutes} min</span>}
                {s.is_open && type === 'retirada' && s.pickup_estimate_minutes && <span className="text-sm text-lenha-600">Retirada em cerca de {s.pickup_estimate_minutes} min</span>}
                {s.min_order_cents > 0 && <span className="text-sm text-lenha-600">Pedido mínimo {money(s.min_order_cents)}</span>}
              </div>
              {!s.is_open && <p className="mt-2 text-sm text-lenha-700">{s.closed_message}</p>}
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-lenha-50 p-1" role="tablist" aria-label="Como você quer receber">
                {(['delivery', 'retirada'] as const).map((t) => {
                  const enabled = t === 'delivery' ? s.accept_delivery : s.accept_pickup;
                  return (
                    <button key={t} role="tab" aria-selected={type === t} disabled={!enabled} onClick={() => setType(t)}
                      className={cx('h-11 rounded-lg font-semibold transition-colors', type === t ? 'bg-lenha-900 text-white' : 'text-lenha-700', !enabled && 'opacity-40')}>
                      {t === 'delivery' ? 'Entrega' : 'Retirar no local'}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {mode === 'online' && s.banners?.length > 0 && <Banners banners={s.banners} onPick={(name) => { const c = data.categories.find((x: any) => x.name === name); if (c) go(c.id); }} />}

        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no cardápio" aria-label="Buscar no cardápio"
          className="mt-5 h-12 w-full rounded-xl border border-lenha-200 bg-white px-4 focus:border-brasa-500 focus:outline-none focus:ring-2 focus:ring-brasa-200" />
      </div>

      <nav className="no-scrollbar sticky top-0 z-20 mt-4 flex gap-2 overflow-x-auto border-b border-lenha-100 px-4 py-2 backdrop-blur sm:justify-center" style={{ background: 'color-mix(in oklab, var(--color-papel) 92%, transparent)' }} aria-label="Categorias">
        {cats.map((c: any) => (
          <button key={c.id} onClick={() => go(c.id)} className={cx('h-9 shrink-0 rounded-full px-4 text-sm font-semibold', activeCat === c.id ? 'bg-brasa-500 text-white' : 'bg-white text-lenha-700 ring-1 ring-lenha-200')}>{c.name}</button>
        ))}
      </nav>

      <main className="mx-auto max-w-3xl px-4">
        {!q && featured.length > 0 && (
          <section className="mt-6">
            <h2 className="font-slab text-2xl font-bold">Destaques</h2>
            <div className="no-scrollbar -mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-2">
              {featured.map((p: any) => (
                <button key={p.id} onClick={() => setOpen(p)} className="w-64 shrink-0 rounded-2xl bg-lenha-900 p-4 text-left text-white">
                  <p className="font-slab text-lg font-bold leading-tight">{p.name}</p>
                  {p.description && <p className="mt-1 line-clamp-3 text-sm text-white/75">{p.description}</p>}
                  <p className="mt-3 font-cond text-2xl font-bold" style={{ color: 'var(--color-brasa-200)' }}>{priceLabel(p, type)}</p>
                </button>
              ))}
            </div>
          </section>
        )}
        {cats.map((c: any) => (
          <section key={c.id} ref={(el) => { sections.current[c.id] = el; }} className="scroll-mt-16 pt-6">
            <h2 className="font-slab text-2xl font-bold">{c.name}</h2>
            <ul className="mt-2 divide-y divide-lenha-100 rounded-2xl bg-white ring-1 ring-lenha-100">
              {c.products.map((p: any) => (
                <li key={p.id}>
                  <button onClick={() => setOpen(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brasa-50">
                    {p.image_url && <img src={p.image_url} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl object-cover" />}
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold leading-tight">{p.name}</span>
                      {p.description && <span className="mt-0.5 block line-clamp-2 text-sm text-lenha-500">{p.description}</span>}
                      {variantsFor(p, type).length > 1 && <span className="mt-0.5 block text-xs text-lenha-500">{variantsFor(p, type).map((v: any) => `${v.name} ${money(v.price_cents)}`).join(' · ')}</span>}
                    </span>
                    <span className="shrink-0 text-right font-cond text-xl font-bold text-brasa-700 tabnums">
                      {variantsFor(p, type).length > 1 ? <><span className="block font-sans text-xs font-medium text-lenha-500">a partir de</span>{money(minPrice(p))}</> : priceLabel(p, type)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {cats.length === 0 && <p className="py-10 text-center text-lenha-500">{q ? `Nada encontrado para “${q}”.` : 'Nenhum produto disponível no momento.'}</p>}

        <footer className="mt-10 rounded-2xl bg-lenha-900 p-5 text-white/85">
          <p className="font-slab text-xl font-bold text-white">{s.store_name}</p>
          {s.address && <p className="mt-1 text-sm">{s.address}</p>}
          {s.whatsapp && (
            <a href={waLink(s.whatsapp, 'Olá! Vim pelo cardápio digital.')} target="_blank" rel="noopener" className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-[#25D366] px-4 font-semibold text-[#0b2a17]">
              <WaIcon /> WhatsApp {s.whatsapp_display || phoneFmt(s.whatsapp)}
            </a>
          )}
          {s.instagram && <p className="mt-3 text-sm">Instagram: {s.instagram}</p>}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-white/60">
            <a href={`/${slug}/entrar`} className="underline">Acesso da equipe</a>
            <a href="/" className="flex items-center gap-1.5"><PlatformLogo light className="h-5 w-auto" /> Feito com {data.platform}</a>
          </div>
        </footer>
      </main>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
          <button onClick={() => setCheckout(true)} className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between rounded-2xl bg-brasa-500 px-5 text-white shadow-xl">
            <span className="grid size-9 place-items-center rounded-full bg-white/20 font-bold tabnums">{count}</span>
            <span className="text-lg font-semibold">{mode === 'mesa' ? 'Ver pedido da mesa' : 'Ver carrinho'}</span>
            <span className="font-cond text-2xl font-bold tabnums">{money(total)}</span>
          </button>
        </div>
      )}

      <ProductModal product={open} type={type} onClose={() => setOpen(null)} onAdd={(l) => setCart((c) => [...c, l])} />
      {checkout && mode === 'online' && <Checkout slug={slug} data={data} type={type as any} cart={cart} setCart={setCart} invalid={invalid} onClose={() => setCheckout(false)} />}
      {checkout && mode !== 'online' && <InHouseCheckout slug={slug} token={token} mode={mode} accepting={!!accepting} cart={cart} setCart={setCart} invalid={invalid}
        onClose={() => setCheckout(false)} onSent={() => { fetchTable(); }} />}
      {comanda && table && <ComandaModal table={table} onClose={() => setComanda(false)} />}
    </div>
  );
}

function Hero({ s, tenant }: { s: any; tenant: any }) {
  return (
    <header className="relative overflow-hidden bg-lenha-900 pb-12 pt-6">
      <div aria-hidden className="absolute inset-0 opacity-90"
        style={{ background: 'repeating-linear-gradient(180deg, color-mix(in oklab, var(--color-brasa-500) 70%, white) 0 7px, transparent 7px 13px), linear-gradient(180deg, color-mix(in oklab, var(--color-brasa-500) 60%, white), var(--color-brasa-500) 60%, var(--color-brasa-700))', WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 35%, #000 100%)', maskImage: 'linear-gradient(180deg, transparent 0%, #000 35%, #000 100%)' }} />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 text-center">
        <TenantLogo url={tenant.logo_url} name={s.store_name} className="size-52 rounded-[2rem] bg-white object-contain text-5xl shadow-2xl ring-4 ring-white/70 sm:size-60" />
        {s.slogan ? <p className="mt-4 font-slab text-xl font-bold text-white drop-shadow">{s.slogan}</p> : <p className="mt-4 font-slab text-2xl font-bold text-white drop-shadow">{s.store_name}</p>}
      </div>
    </header>
  );
}

function Banners({ banners, onPick }: { banners: any[]; onPick: (cat: string) => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (banners.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);
  const b = banners[i % banners.length];
  return (
    <div className="mt-4">
      <button onClick={() => b.category && onPick(b.category)} className="relative block h-32 w-full overflow-hidden rounded-2xl bg-brasa-500 text-left text-white">
        {b.image_url && <img src={b.image_url} alt="" className="absolute inset-0 size-full object-cover opacity-60" />}
        <span className="relative block p-5">
          <span className="block font-slab text-2xl font-bold leading-tight">{b.title}</span>
          <span className="mt-1 block max-w-md text-sm text-white/90">{b.subtitle}</span>
        </span>
      </button>
      {banners.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {banners.map((_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Destaque ${k + 1}`} className={cx('h-2 rounded-full transition-all', k === i ? 'w-6 bg-brasa-500' : 'w-2 bg-lenha-200')} />)}
        </div>
      )}
    </div>
  );
}

/** Barra da mesa (pedido presencial pelo QR): consumo, chamar garçom, pedir a conta. */
function TableBar({ slug, token, table, onComanda, reload }: { slug: string; token: string; table: any; onComanda: () => void; reload: () => void }) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const call = async (kind: 'garcom' | 'conta') => {
    setBusy(kind); setMsg('');
    try { await post(`/api/public/${slug}/tables/${token}/call`, { kind }); setMsg(kind === 'conta' ? 'Pedido de conta enviado. O garçom já vem.' : 'Garçom chamado. Ele já vem.'); reload(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(''); }
  };
  const c = table.comanda;
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid size-14 place-items-center rounded-2xl bg-lenha-900 font-cond text-3xl font-bold text-white">{table.table.label}</span>
        <div className="min-w-0 flex-1">
          <p className="font-slab text-xl font-bold leading-tight">Mesa {table.table.label}</p>
          <p className="text-sm text-lenha-600">{c ? <>Consumo até agora: <strong>{money(c.total_cents)}</strong></> : 'Faça seu pedido pelo celular.'}</p>
        </div>
        {c && <Button size="sm" variant="outline" onClick={onComanda}>Ver consumo</Button>}
      </div>
      {!table.enabled && <p className="mt-3 rounded-lg bg-ouro-300 px-3 py-2 text-sm font-semibold">Pedidos pelo celular estão desativados nesta mesa. Chame o garçom.</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" busy={busy === 'garcom'} disabled={!c} onClick={() => call('garcom')}>Chamar garçom</Button>
        <Button variant="dark" busy={busy === 'conta'} disabled={!c || c.close_requested} onClick={() => call('conta')}>{c?.close_requested ? 'Conta pedida' : 'Pedir a conta'}</Button>
      </div>
      {!c && <p className="mt-2 text-xs text-lenha-500">Chamar garçom e pedir a conta ficam disponíveis depois do primeiro pedido.</p>}
      {msg && <p className="mt-2 text-sm font-semibold text-ok" role="status">{msg}</p>}
    </div>
  );
}

const ITEM_ST: Record<string, string> = { pendente: 'aguardando confirmação', enviado: 'na fila da cozinha', preparo: 'sendo preparado', pronto: 'pronto', entregue: 'servido' };
function ComandaModal({ table, onClose }: { table: any; onClose: () => void }) {
  const c = table.comanda;
  return (
    <Modal open onClose={onClose} title={`Consumo da mesa ${table.table.label}`}>
      <ul className="divide-y divide-lenha-100">
        {c.items.map((i: any, k: number) => (
          <li key={k} className="flex justify-between gap-3 py-2">
            <span><strong>{i.qty}x</strong> {i.name}{i.variant_name && ` · ${i.variant_name}`}
              <span className="block text-xs text-lenha-500">{ITEM_ST[i.status] || i.status} · {time(i.created_at)}{i.customer_label ? ` · ${i.customer_label}` : ''}</span></span>
            <span className="tabnums">{money(i.total_cents)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-between border-t border-lenha-100 pt-3 font-cond text-2xl font-bold"><span>Total</span><span className="tabnums">{money(c.total_cents)}</span></div>
      {c.paid_cents > 0 && <p className="text-right text-sm text-ok">Pago: {money(c.paid_cents)}</p>}
      <p className="mt-3 text-xs text-lenha-500">Valores conferidos pelo caixa no fechamento da conta.</p>
    </Modal>
  );
}

function CartLines({ cart, setCart, invalid, type }: { cart: CartLine[]; setCart: (f: any) => void; invalid: CartLine[]; type: string }) {
  return (
    <ul className="divide-y divide-lenha-100">
      {cart.map((l) => (
        <li key={l.key} className={cx('flex items-start gap-3 py-2', invalid.includes(l) && 'opacity-50')}>
          <div className="flex items-center rounded-lg border border-lenha-200 bg-white">
            <button className="size-9" aria-label="Diminuir" onClick={() => setCart((ls: CartLine[]) => ls.flatMap((x) => (x.key === l.key ? (x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : []) : [x])))}>−</button>
            <span className="w-6 text-center font-bold tabnums">{l.qty}</span>
            <button className="size-9" aria-label="Aumentar" onClick={() => setCart((ls: CartLine[]) => ls.map((x) => (x.key === l.key ? { ...x, qty: Math.min(99, x.qty + 1) } : x)))}>+</button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">{l.name}{l.variant_name && ` · ${l.variant_name}`}</p>
            {l.options.length > 0 && <p className="text-xs text-lenha-500">{l.options.join(', ')}</p>}
            {l.notes && <p className="text-xs text-lenha-500">Obs.: {l.notes}</p>}
            {invalid.includes(l) && <p className="text-xs font-semibold text-alerta">Indisponível para {type === 'delivery' ? 'entrega' : type === 'retirada' ? 'retirada' : 'consumo no local'}</p>}
          </div>
          <span className="font-semibold tabnums">{money(lineTotal(l))}</span>
        </li>
      ))}
      {!cart.length && <li className="py-6 text-center text-lenha-500">Seu carrinho está vazio.</li>}
    </ul>
  );
}

/** Pedido presencial: mesa (vai para a comanda da mesa) ou balcão (retira no balcão). */
function InHouseCheckout({ slug, token, mode, accepting, cart, setCart, invalid, onClose, onSent }: { slug: string; token: string; mode: Mode; accepting: boolean; cart: CartLine[]; setCart: (f: any) => void; invalid: CartLine[]; onClose: () => void; onSent: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState(() => load<string>('od_guest_name', ''));
  const [notes, setNotes] = useState('');
  const [key, setKey] = useState(uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | { sent: boolean }>(null);
  const submit = async () => {
    setError('');
    if (invalid.length) return setError('Remova os itens indisponíveis para continuar.');
    if (name.trim().length < 2) return setError('Informe seu nome para o garçom te encontrar.');
    setBusy(true);
    try {
      const items = cart.map((l) => ({ variant_id: l.variant_id, qty: l.qty, option_ids: l.option_ids, notes: l.notes || undefined }));
      save('od_guest_name', name.trim());
      if (mode === 'mesa') {
        const r = await post(`/api/public/${slug}/tables/${token}/orders`, { idempotency_key: key, customer_name: name.trim(), notes, items });
        setCart([]); setKey(uid()); setDone({ sent: r.sent_to_kitchen }); onSent();
      } else {
        const r = await post(`/api/public/${slug}/orders`, { idempotency_key: key, type: 'balcao', customer_name: name.trim(), notes, items });
        setCart([]); nav(`/${slug}/pedido/${r.token}?novo=1`);
      }
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  if (done) return (
    <Modal open onClose={onClose} title="Pedido enviado" footer={<Button className="w-full" size="lg" onClick={onClose} data-autofocus>Voltar ao cardápio</Button>}>
      <p className="text-lg">{done.sent ? 'Seu pedido já foi para a cozinha.' : 'Seu pedido chegou para a equipe. O garçom confirma em instantes e envia para a cozinha.'}</p>
      <p className="mt-2 text-sm text-lenha-600">Acompanhe em “Ver consumo”. Para pedir mais, é só escolher de novo.</p>
    </Modal>
  );
  return (
    <Modal open onClose={onClose} title={mode === 'mesa' ? 'Seu pedido para a mesa' : 'Seu pedido no balcão'}
      footer={<div>{error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-alerta" role="alert">{error}</p>}
        <Button size="lg" className="w-full" busy={busy} onClick={submit} disabled={!cart.length || !accepting}>Enviar pedido · {money(cartTotal(cart))}</Button></div>}>
      <CartLines cart={cart} setCart={setCart} invalid={invalid} type={mode === 'mesa' ? 'mesa' : 'balcao'} />
      <Field label="Seu nome" className="mt-4"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} /></Field>
      <Field label="Observação (opcional)" className="mt-3"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} /></Field>
      <p className="mt-3 text-sm text-lenha-600">{mode === 'mesa' ? 'O pagamento é feito ao fechar a conta com o garçom ou no caixa.' : 'Pague no caixa e retire quando seu número for chamado.'}</p>
      {!accepting && <p className="mt-2 text-sm font-semibold text-alerta">Pedidos pelo celular estão desativados agora. Chame a equipe.</p>}
    </Modal>
  );
}

function Checkout({ slug, data, type, cart, setCart, invalid, onClose }: { slug: string; data: any; type: 'delivery' | 'retirada'; cart: CartLine[]; setCart: (f: any) => void; invalid: CartLine[]; onClose: () => void }) {
  const nav = useNavigate();
  const s = data.settings;
  const CK = `od_customer_${slug}`;
  const saved = load<any>(CK, {});
  const [f, setF] = useState({ name: saved.name || '', phone: saved.phone || '', street: saved.street || '', number: saved.number || '', complement: saved.complement || '',
    neighborhood: saved.neighborhood || '', zone: saved.zone ? String(saved.zone) : '', reference: saved.reference || '', payment: '', change: '', notes: '', remember: !!saved.name });
  const [key] = useState(uid);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const up = (k: string) => (e: any) => setF((x) => ({ ...x, [k]: e.target.value }));
  const zone = data.zones.find((z: any) => String(z.id) === f.zone);
  const subtotal = cartTotal(cart);
  const fee = type === 'delivery' ? (zone ? zone.fee_cents : null) : 0;
  const minOrder = (zone?.min_order_cents ?? s.min_order_cents) || 0;
  const short = minOrder > 0 && subtotal < minOrder;
  const change = parseMoney(f.change);

  const submit = async () => {
    setError('');
    if (invalid.length) return setError('Alguns itens não estão disponíveis para este tipo de pedido. Remova-os para continuar.');
    if (!s.is_open) return setError(s.closed_message);
    if (f.name.trim().length < 2) return setError('Informe seu nome.');
    if (f.phone.replace(/\D/g, '').length < 10) return setError('Informe seu WhatsApp com DDD.');
    if (type === 'delivery') {
      if (f.street.trim().length < 3) return setError('Informe a rua.');
      if (!zone && (data.zones.length ? f.zone !== 'outro' || f.neighborhood.trim().length < 2 : f.neighborhood.trim().length < 2)) return setError(data.zones.length ? 'Escolha o bairro.' : 'Informe o bairro.');
    }
    if (!f.payment) return setError('Escolha a forma de pagamento.');
    if (short) return setError(`Pedido mínimo: ${money(minOrder)}.`);
    setBusy(true);
    try {
      const r = await post(`/api/public/${slug}/orders`, {
        idempotency_key: key, type, customer_name: f.name, customer_phone: f.phone,
        address: type === 'delivery' ? { street: f.street, number: f.number, complement: f.complement, neighborhood: zone ? zone.name : f.neighborhood, reference: f.reference } : undefined,
        delivery_zone_id: type === 'delivery' && zone ? zone.id : null, payment_hint: f.payment,
        change_for_cents: f.payment === 'dinheiro' && Number.isFinite(change) && change > 0 ? change : null,
        notes: f.notes, save_address: f.remember && type === 'delivery',
        items: cart.map((l) => ({ variant_id: l.variant_id, qty: l.qty, option_ids: l.option_ids, notes: l.notes || undefined })),
      });
      save(CK, f.remember ? { name: f.name, phone: f.phone, street: f.street, number: f.number, complement: f.complement, neighborhood: f.neighborhood, zone: f.zone, reference: f.reference } : {});
      setCart([]);
      nav(`/${slug}/pedido/${r.token}?novo=1`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Seu pedido" wide
      footer={<div>{error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-alerta" role="alert">{error}</p>}
        <Button size="lg" className="w-full" busy={busy} onClick={submit} disabled={!cart.length}>Enviar pedido · {money(subtotal + (fee || 0))}</Button></div>}>
      <CartLines cart={cart} setCart={setCart} invalid={invalid} type={type} />
      <section className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Seu nome"><Input value={f.name} onChange={up('name')} autoComplete="name" /></Field>
        <Field label="WhatsApp com DDD"><Input value={f.phone} onChange={up('phone')} inputMode="tel" autoComplete="tel" placeholder="(00) 9 0000-0000" /></Field>
      </section>
      {type === 'delivery' ? (
        <section className="mt-4 grid gap-3 sm:grid-cols-6">
          <Field label="Rua" className="sm:col-span-4"><Input value={f.street} onChange={up('street')} autoComplete="address-line1" /></Field>
          <Field label="Número" className="sm:col-span-2"><Input value={f.number} onChange={up('number')} /></Field>
          <Field label="Bairro" className="sm:col-span-3">
            {data.zones.length ? (
              <Select value={f.zone} onChange={up('zone')}>
                <option value="">Escolha o bairro</option>
                {data.zones.map((z: any) => <option key={z.id} value={z.id}>{z.name} — entrega {money(z.fee_cents)}</option>)}
                {s.allow_unlisted_neighborhood && <option value="outro">Outro bairro (taxa a confirmar)</option>}
              </Select>
            ) : <Input value={f.neighborhood} onChange={(e) => setF((x) => ({ ...x, neighborhood: e.target.value, zone: 'outro' }))} />}
          </Field>
          {f.zone === 'outro' && data.zones.length > 0 && <Field label="Nome do bairro" className="sm:col-span-3"><Input value={f.neighborhood} onChange={up('neighborhood')} /></Field>}
          <Field label="Complemento" className="sm:col-span-3"><Input value={f.complement} onChange={up('complement')} placeholder="Apto, bloco, casa" /></Field>
          <Field label="Ponto de referência" className="sm:col-span-6"><Input value={f.reference} onChange={up('reference')} /></Field>
        </section>
      ) : <p className="mt-4 rounded-xl bg-lenha-50 px-4 py-3 text-sm">Retirada em: {s.address || s.store_name}</p>}
      <section className="mt-4">
        <p className="mb-2 text-sm font-semibold text-lenha-700">Pagamento {type === 'delivery' ? 'na entrega' : 'na retirada'}</p>
        <div className="grid grid-cols-2 gap-2">
          {s.payment_methods.map((m: any) => (
            <button key={m.id} onClick={() => setF((x) => ({ ...x, payment: m.id }))} className={cx('h-12 rounded-xl border-2 font-semibold', f.payment === m.id ? 'border-brasa-500 bg-brasa-50' : 'border-lenha-100 bg-white')}>{m.name}</button>
          ))}
        </div>
        {f.payment === 'dinheiro' && <Field label="Troco para quanto?" hint="Deixe em branco se não precisar de troco." className="mt-3"><MoneyInput value={f.change} onChange={(v) => setF((x) => ({ ...x, change: v }))} /></Field>}
        {f.payment === 'pix' && s.pix_key && <p className="mt-3 rounded-xl bg-lenha-50 px-4 py-3 text-sm">Chave Pix: <strong className="select-all">{s.pix_key}</strong>. O pagamento é conferido pelo atendimento.</p>}
      </section>
      <Field label="Observações do pedido" className="mt-4"><Textarea value={f.notes} onChange={up('notes')} maxLength={300} /></Field>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4 accent-[var(--color-brasa-500)]" checked={f.remember} onChange={(e) => setF((x) => ({ ...x, remember: e.target.checked }))} />
        Lembrar meus dados neste aparelho{type === 'delivery' && ' e guardar meu endereço para os próximos pedidos'}.</label>
      <dl className="mt-5 space-y-1 rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
        <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabnums">{money(subtotal)}</dd></div>
        {type === 'delivery' && <div className="flex justify-between"><dt>Entrega</dt><dd className="tabnums">{fee == null ? 'a confirmar' : money(fee)}</dd></div>}
        <div className="flex justify-between border-t border-lenha-100 pt-2 font-cond text-2xl font-bold"><dt>Total</dt><dd className="tabnums">{money(subtotal + (fee || 0))}{type === 'delivery' && fee == null ? ' + entrega' : ''}</dd></div>
        {short && <p className="text-sm font-semibold text-alerta">Faltam {money(minOrder - subtotal)} para o pedido mínimo.</p>}
      </dl>
    </Modal>
  );
}

export const WaIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.6 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.6-1.2-3s.8-2.2 1-2.5c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .5l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z" /></svg>
);
