import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, uid } from '../../lib/api';
import { useData } from '../../lib/hooks';
import { money, parseMoney } from '../../lib/format';
import { ProductPicker, CartList, cartTotal, type CartLine } from '../../components/catalog';
import { PaymentDialog } from '../../components/PaymentDialog';
import { OrderDrawer } from '../../components/OrderDrawer';
import { Button, Field, Input, Select, MoneyInput, Toggle, Modal, Spinner, useAction, cx } from '../../components/ui';

type Kind = 'balcao' | 'retirada' | 'delivery';

export default function PDV() {
  const catalog = useData<any>('/api/catalog', ['catalog'], 0);
  const settings = useData<any>('/api/admin/settings', ['settings'], 0);
  const cash = useData<any>('/api/admin/cash/current', ['cash'], 0);
  const zones = useData<any[]>('/api/zones', [], 0);
  const [kind, setKind] = useState<Kind>('balcao');
  const [channel, setChannel] = useState<'pdv' | 'whatsapp' | 'telefone'>('pdv');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cust, setCust] = useState({ name: '', phone: '', street: '', number: '', complement: '', neighborhood: '', reference: '', zone: '', fee: '', payment: '', change: '', notes: '' });
  const [sendKitchen, setSendKitchen] = useState(true);
  const [key, setKey] = useState(uid);
  const [order, setOrder] = useState<any>(null);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [drawer, setDrawer] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [showCust, setShowCust] = useState(false);
  const { run, busy } = useAction();

  useEffect(() => { setKey(uid()); }, [lines, kind]);
  // Se só tem bebidas, sugere não enviar para a cozinha
  useEffect(() => {
    const prods = (catalog.data?.categories || []).flatMap((c: any) => c.products.map((p: any) => ({ ...p, sector: p.sector || c.sector })));
    const allDrinks = lines.length > 0 && lines.every((l) => prods.find((p: any) => p.id === l.product_id)?.sector === 'bebidas');
    setSendKitchen(!allDrinks);
  }, [lines.length]); // eslint-disable-line

  const lookup = async () => {
    const d = cust.phone.replace(/\D/g, '');
    if (d.length < 10) return;
    const c = await get(`/api/admin/customers/lookup/${d}`).catch(() => null);
    if (c) {
      const a = c.addresses?.[0];
      setCust((x) => ({ ...x, name: x.name || c.name, ...(a && !x.street ? { street: a.street, number: a.number, complement: a.complement, neighborhood: a.neighborhood, reference: a.reference } : {}) }));
    }
  };

  if (!catalog.data || !settings.data) return <Spinner />;
  const subtotal = cartTotal(lines);
  const zone = zones.data?.find((z: any) => String(z.id) === cust.zone);
  const fee = kind === 'delivery' ? (zone ? zone.fee_cents : parseMoney(cust.fee)) : 0;
  const cashOpen = !!cash.data?.session;
  const up = (k: string) => (e: any) => setCust((x) => ({ ...x, [k]: e.target.value }));

  const create = (payNow: boolean) => run('create', async () => {
    if (kind === 'delivery' && !zone && !Number.isFinite(fee)) throw new Error('Informe a taxa de entrega ou escolha um bairro cadastrado.');
    const o = await post('/api/orders', {
      type: kind, channel, idempotency_key: key, send_to_kitchen: sendKitchen,
      items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, option_ids: l.option_ids, notes: l.notes || undefined })),
      customer_name: cust.name || undefined, customer_phone: cust.phone || undefined, notes: cust.notes || undefined,
      payment_hint: cust.payment || undefined, change_for_cents: cust.change ? parseMoney(cust.change) : null,
      ...(kind === 'delivery' ? { address: { street: cust.street, number: cust.number, complement: cust.complement, neighborhood: zone ? zone.name : cust.neighborhood, reference: cust.reference },
        delivery_zone_id: zone ? zone.id : null, delivery_fee_cents: zone ? undefined : fee } : {}),
    });
    setOrder(o); setSheet(false);
    if (payNow) setPaying(true); else finish(o);
    return o;
  });
  const finish = (o: any) => {
    setDone(o); setOrder(null); setPaying(false); setLines([]); setShowCust(false);
    setCust({ name: '', phone: '', street: '', number: '', complement: '', neighborhood: '', reference: '', zone: '', fee: '', payment: '', change: '', notes: '' });
  };

  const cart = (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-lenha-50 p-1">
        {(['balcao', 'retirada', 'delivery'] as Kind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cx('h-10 rounded-lg text-sm font-semibold', kind === k ? 'bg-lenha-900 text-white' : 'text-lenha-700')}>{k === 'balcao' ? 'Balcão' : k === 'retirada' ? 'Retirada' : 'Delivery'}</button>
        ))}
      </div>
      <div className="mt-2 flex-1 overflow-y-auto">
        <CartList lines={lines} setLines={setLines} />
        {(kind !== 'balcao' || showCust) && (
          <div className="mt-3 space-y-2 border-t border-lenha-100 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Telefone" value={cust.phone} onChange={up('phone')} onBlur={lookup} inputMode="tel" aria-label="Telefone do cliente" />
              <Input placeholder="Nome do cliente" value={cust.name} onChange={up('name')} aria-label="Nome do cliente" />
            </div>
            {kind !== 'balcao' && (
              <Select value={channel} onChange={(e) => setChannel(e.target.value as any)} aria-label="Canal">
                <option value="pdv">Pedido no balcão</option><option value="whatsapp">Recebido pelo WhatsApp</option><option value="telefone">Recebido por telefone</option>
              </Select>
            )}
            {kind === 'delivery' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <Input className="col-span-2" placeholder="Rua" value={cust.street} onChange={up('street')} aria-label="Rua" />
                  <Input placeholder="Nº" value={cust.number} onChange={up('number')} aria-label="Número" />
                </div>
                <Select value={cust.zone} onChange={up('zone')} aria-label="Bairro">
                  <option value="">Bairro não cadastrado</option>
                  {zones.data?.filter((z: any) => z.active).map((z: any) => <option key={z.id} value={z.id}>{z.name} — {money(z.fee_cents)}</option>)}
                </Select>
                {!zone && <div className="grid grid-cols-2 gap-2"><Input placeholder="Bairro" value={cust.neighborhood} onChange={up('neighborhood')} aria-label="Bairro" /><MoneyInput placeholder="Taxa" value={cust.fee} onChange={(v) => setCust((x) => ({ ...x, fee: v }))} aria-label="Taxa de entrega" /></div>}
                <Input placeholder="Complemento / referência" value={cust.reference} onChange={up('reference')} aria-label="Referência" />
                <div className="grid grid-cols-2 gap-2">
                  <Select value={cust.payment} onChange={up('payment')} aria-label="Pagamento na entrega">
                    <option value="">Pagamento na entrega…</option>
                    {settings.data.payment_methods.filter((m: any) => m.active).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                  {cust.payment === 'dinheiro' && <MoneyInput placeholder="Troco para" value={cust.change} onChange={(v) => setCust((x) => ({ ...x, change: v }))} aria-label="Troco para" />}
                </div>
              </>
            )}
            <Input placeholder="Observação do pedido" value={cust.notes} onChange={up('notes')} aria-label="Observação do pedido" />
          </div>
        )}
        {kind === 'balcao' && !showCust && <button className="mt-2 text-sm font-semibold text-brasa-700" onClick={() => setShowCust(true)}>+ Identificar cliente</button>}
      </div>
      <div className="mt-3 space-y-2 border-t border-lenha-100 pt-3">
        <Toggle checked={sendKitchen} onChange={setSendKitchen} label="Enviar para a cozinha" />
        <div className="flex items-baseline justify-between"><span className="text-lenha-600">Total</span><span className="font-cond text-3xl font-bold tabnums">{money(subtotal + (Number.isFinite(fee) ? fee : 0))}</span></div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={!lines.length} busy={busy === 'create'} onClick={() => create(false)}>{kind === 'balcao' ? 'Só lançar' : 'Cobrar depois'}</Button>
          <Button disabled={!lines.length || !cashOpen} busy={busy === 'create'} onClick={() => create(true)}>Cobrar agora</Button>
        </div>
        {!cashOpen && <p className="text-xs text-alerta">Abra o caixa para registrar pagamentos. <Link to="/admin/caixa" className="font-semibold underline">Ir para o caixa</Link></p>}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0 pb-24 lg:pb-0">
        <ProductPicker catalog={catalog.data} type={kind} onAdd={(l) => setLines((ls) => [...ls, l])} />
      </div>
      <aside className="sticky top-20 hidden h-[calc(100dvh-6.5rem)] rounded-2xl bg-white p-4 ring-1 ring-lenha-100 lg:block">{cart}</aside>
      <div className="fixed inset-x-0 bottom-0 z-20 p-3 lg:hidden">
        <button onClick={() => setSheet(true)} className="flex h-14 w-full items-center justify-between rounded-2xl bg-lenha-900 px-5 text-white shadow-xl">
          <span>{lines.reduce((a, l) => a + l.qty, 0)} itens</span><span className="font-semibold">Ver venda</span><span className="font-cond text-2xl font-bold">{money(subtotal)}</span>
        </button>
      </div>
      <Modal open={sheet} onClose={() => setSheet(false)} title="Venda atual">{cart}</Modal>

      {paying && order && <PaymentDialog order={order} methods={settings.data.payment_methods} onClose={() => { setPaying(false); finish(order); }} onDone={(o) => finish(o)} />}
      {done && (
        <Modal open onClose={() => setDone(null)} title={`Pedido #${done.number} lançado`}
          footer={<div className="flex gap-2"><a href={`/imprimir/${done.id}`} target="_blank" className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-lenha-200 bg-white font-semibold">Imprimir comprovante</a><Button className="flex-1" onClick={() => setDone(null)} data-autofocus>Nova venda</Button></div>}>
          <p className="text-lg">Total {money(done.total_cents)} · {done.payment_status === 'pago' ? <strong className="text-ok">pago</strong> : done.payment_status === 'parcial' ? <strong>pago parcialmente ({money(done.paid_cents)})</strong> : <strong className="text-alerta">pagamento pendente</strong>}</p>
          <p className="mt-2 text-sm text-lenha-600">{done.tickets?.length ? 'Os itens foram para a fila da cozinha.' : 'Venda sem preparo na cozinha.'}</p>
          <button className="mt-3 text-sm font-semibold text-brasa-700 underline" onClick={() => { setDrawer(done.id); setDone(null); }}>Abrir pedido</button>
        </Modal>
      )}
      <OrderDrawer orderId={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
