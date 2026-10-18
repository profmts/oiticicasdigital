import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '../lib/api';
import { money, dateTime, TYPE_LABEL, phoneFmt } from '../lib/format';
import { Spinner, ErrorBox } from '../components/ui';

/** Comprovante não fiscal para impressora térmica de 80 mm (ou A4). */
export default function Receipt() {
  const { id } = useParams();
  const [o, setO] = useState<any>(null);
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState('');
  const kitchen = new URLSearchParams(location.search).get('via') === 'cozinha';
  useEffect(() => {
    Promise.all([get(`/api/orders/${id}`), get('/api/admin/settings')]).then(([a, b]) => { setO(a); setS(b); setTimeout(() => window.print(), 400); }).catch((e) => setErr(e.message));
  }, [id]);
  if (err) return <div className="p-6"><ErrorBox msg={err} /></div>;
  if (!o || !s) return <Spinner />;
  const items = o.items.filter((i: any) => i.status !== 'cancelado');
  const methods = Object.fromEntries((s.payment_methods || []).map((m: any) => [m.id, m.name]));
  return (
    <div className="mx-auto bg-white p-3 font-mono text-[13px] leading-snug text-black" style={{ width: '80mm' }}>
      <div className="no-print mb-3 flex gap-2 font-sans">
        <button onClick={() => window.print()} className="rounded bg-black px-3 py-1 text-white">Imprimir</button>
        <a href={kitchen ? `/imprimir/${id}` : `/imprimir/${id}?via=cozinha`} className="rounded border px-3 py-1">{kitchen ? 'Via do cliente' : 'Via da cozinha'}</a>
      </div>
      <p className="text-center text-base font-bold">{s.store_name}</p>
      {!kitchen && <p className="text-center text-[11px]">{s.address}<br />WhatsApp {s.whatsapp_display}</p>}
      <p className="my-2 border-y border-dashed border-black py-1 text-center font-bold">{kitchen ? 'VIA DA COZINHA' : 'COMPROVANTE NÃO FISCAL'}</p>
      <p className="text-lg font-bold">Pedido #{o.number}</p>
      <p>{TYPE_LABEL[o.type]}{o.table_label ? ` ${o.table_label}` : ''} · {dateTime(o.created_at)}</p>
      {o.waiter_name && <p>Garçom: {o.waiter_name}</p>}
      {o.customer_name && <p>Cliente: {o.customer_name}{o.customer_phone && !kitchen ? ` · ${phoneFmt(o.customer_phone)}` : ''}</p>}
      {o.address && <p>{o.address.street}, {o.address.number} {o.address.complement}<br />{o.address.neighborhood}{o.address.reference && ` · Ref.: ${o.address.reference}`}</p>}
      <div className="my-2 border-t border-dashed border-black" />
      {items.map((i: any) => (
        <div key={i.id} className="mb-1">
          <div className="flex justify-between gap-2"><span>{i.qty}x {i.name}{i.variant_name && ` ${i.variant_name}`}</span>{!kitchen && <span>{money(i.total_cents)}</span>}</div>
          {i.options.length > 0 && <div className="pl-3 text-[12px]">{i.options.map((x: any) => x.name).join(', ')}</div>}
          {i.notes && <div className="pl-3 text-[12px] font-bold">* {i.notes}</div>}
        </div>
      ))}
      {o.notes && <p className="mt-1 font-bold">Obs.: {o.notes}</p>}
      {!kitchen && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <div className="flex justify-between"><span>Subtotal</span><span>{money(o.subtotal_cents)}</span></div>
          {o.discount_cents > 0 && <div className="flex justify-between"><span>Desconto</span><span>-{money(o.discount_cents)}</span></div>}
          {o.type === 'delivery' && <div className="flex justify-between"><span>Entrega</span><span>{o.delivery_fee_cents == null ? 'a confirmar' : money(o.delivery_fee_cents)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>TOTAL</span><span>{money(o.total_cents)}</span></div>
          {o.payments.filter((p: any) => !p.voided).map((p: any) => (
            <div key={p.id} className="flex justify-between"><span>{methods[p.method] || p.method}{p.change_cents ? ` (troco ${money(p.change_cents)})` : ''}</span><span>{money(p.amount_cents)}</span></div>
          ))}
          {o.total_cents - o.paid_cents > 0 && <div className="flex justify-between font-bold"><span>A PAGAR</span><span>{money(o.total_cents - o.paid_cents)}</span></div>}
          {o.payment_hint && o.paid_cents < o.total_cents && <p>Pagamento: {methods[o.payment_hint] || o.payment_hint}{o.change_for_cents ? ` · troco p/ ${money(o.change_for_cents)}` : ''}</p>}
          <p className="mt-3 text-center text-[11px]">Documento sem valor fiscal.<br />Obrigado pela preferência!</p>
        </>
      )}
    </div>
  );
}
