import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { get } from '../../lib/api';
import { money, time, waLink, TYPE_LABEL } from '../../lib/format';
import { Spinner, ErrorBox, cx } from '../../components/ui';
import { tenantTheme } from '../../lib/theme';
import { TenantLogo } from '../../components/brand';
import { WaIcon } from './Menu';

const STEPS: Record<string, { key: string; label: string }[]> = {
  delivery: [
    { key: 'aguardando_confirmacao', label: 'Pedido recebido' }, { key: 'confirmado', label: 'Aceito pelo restaurante' },
    { key: 'em_preparo', label: 'Em preparo' }, { key: 'pronto', label: 'Pronto' }, { key: 'saiu_entrega', label: 'Saiu para entrega' }, { key: 'concluido', label: 'Entregue' },
  ],
  retirada: [
    { key: 'aguardando_confirmacao', label: 'Pedido recebido' }, { key: 'confirmado', label: 'Aceito pelo restaurante' },
    { key: 'em_preparo', label: 'Em preparo' }, { key: 'pronto', label: 'Pronto para retirar' }, { key: 'concluido', label: 'Retirado' },
  ],
};
const PAY: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito' };

export default function Track() {
  const { token, slug = '' } = useParams();
  const [sp] = useSearchParams();
  const [o, setO] = useState<any>(null);
  const [store, setStore] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => get(`/api/public/${slug}/orders/${token}`).then((x) => { setO(x); setErr(''); }).catch((e) => setErr(e.message));
    load(); get(`/api/public/${slug}/menu`).then((m) => setStore({ ...m.settings, logo_url: m.tenant.logo_url })).catch(() => {});
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [token, slug]);
  if (err && !o) return <div className="mx-auto max-w-lg p-6"><ErrorBox msg={err} /></div>;
  if (!o) return <Spinner label="Buscando seu pedido…" />;
  const steps = STEPS[o.type] || STEPS.retirada; // balcão segue as etapas de retirada
  const idx = steps.findIndex((s) => s.key === o.status);
  const at = (k: string) => o.events.filter((e: any) => e.to_status === k).at(-1)?.created_at;
  const msg = [
    `Olá! Fiz o pedido *#${o.number}* pelo cardápio digital.`,
    ...o.items.map((i: any) => `• ${i.qty}x ${i.name}${i.variant_name ? ` (${i.variant_name})` : ''}${i.options.length ? ` — ${i.options.map((x: any) => x.name).join(', ')}` : ''}${i.notes ? ` [${i.notes}]` : ''}`),
    `Total: ${money(o.total_cents)}${o.type === 'delivery' && o.delivery_fee_cents == null ? ' + taxa de entrega a confirmar' : ''}`,
    `${TYPE_LABEL[o.type]}${o.address ? `: ${o.address.street}, ${o.address.number} — ${o.address.neighborhood}` : ''}`,
    `Pagamento: ${PAY[o.payment_hint] || o.payment_hint || '-'}${o.change_for_cents ? ` (troco para ${money(o.change_for_cents)})` : ''}`,
    `Acompanhar: ${location.origin}/${slug}/pedido/${token}`,
  ].join('\n');

  return (
    <div style={tenantTheme(store || undefined)}><div className="mx-auto max-w-lg px-4 pb-10 pt-6">
      <Link to={`/${slug}`} className="flex items-center gap-3"><TenantLogo url={store?.logo_url} name={store?.store_name || ''} className="size-14 rounded-xl bg-white object-contain" /><span className="font-semibold text-brasa-700">Voltar ao cardápio</span></Link>
      {sp.get('novo') && !['cancelado', 'concluido'].includes(o.status) && (
        <div className="mt-5 rounded-2xl bg-ok px-5 py-4 text-white">
          <p className="font-slab text-xl font-bold">Pedido #{o.number} registrado</p>
          <p className="mt-1 text-sm text-white/90">Ele já chegou ao sistema do restaurante. Guarde este link para acompanhar.</p>
        </div>
      )}
      <h1 className="mt-6 font-slab text-3xl font-bold">Pedido #{o.number}</h1>
      {o.type === 'balcao' && !['concluido', 'cancelado'].includes(o.status) && <p className="mt-2 rounded-xl bg-lenha-900 px-4 py-3 text-white">Pague no caixa e retire no balcão quando chamarem o número <strong className="font-cond text-2xl">#{o.number}</strong>.</p>}
      <p className="text-lenha-600">{TYPE_LABEL[o.type]} · feito às {time(o.created_at)}{o.estimated_minutes && !['concluido', 'cancelado'].includes(o.status) ? ` · previsão de ${o.estimated_minutes} min` : ''}</p>

      {o.status === 'cancelado' ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5"><p className="font-bold text-alerta">Pedido cancelado</p>{o.cancel_reason && <p className="mt-1 text-sm">Motivo: {o.cancel_reason}</p>}</div>
      ) : (
        <ol className="mt-6 space-y-0" aria-label="Andamento do pedido">
          {steps.map((s, i) => {
            const done = i <= idx;
            return (
              <li key={s.key} className="relative flex gap-4 pb-5 last:pb-0">
                {i < steps.length - 1 && <span className={cx('absolute left-[11px] top-6 h-full w-0.5', i < idx ? 'bg-brasa-500' : 'bg-lenha-200')} aria-hidden />}
                <span className={cx('relative z-10 grid size-6 shrink-0 place-items-center rounded-full border-2', done ? 'border-brasa-500 bg-brasa-500' : 'border-lenha-200 bg-white', i === idx && 'pulse-new')}>
                  {done && <svg viewBox="0 0 20 20" className="size-3.5 text-white" fill="currentColor" aria-hidden><path d="M7.6 13.4 4.2 10l-1.4 1.4 4.8 4.8 10-10-1.4-1.4z" /></svg>}
                </span>
                <div className="-mt-0.5">
                  <p className={cx('font-semibold', !done && 'text-lenha-300')}>{s.label}</p>
                  {done && at(s.key) && <p className="text-sm text-lenha-500">{time(at(s.key))}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <section className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
        <ul className="divide-y divide-lenha-100">
          {o.items.map((i: any, k: number) => (
            <li key={k} className="flex justify-between gap-3 py-2">
              <span><strong>{i.qty}x</strong> {i.name}{i.variant_name && ` · ${i.variant_name}`}
                {i.options.length > 0 && <span className="block text-xs text-lenha-500">{i.options.map((x: any) => x.name).join(', ')}</span>}
                {i.notes && <span className="block text-xs text-lenha-500">Obs.: {i.notes}</span>}</span>
              <span className="tabnums">{money(i.total_cents)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-lenha-100 pt-2 text-sm">
          {o.discount_cents > 0 && <div className="flex justify-between"><dt>Desconto</dt><dd>− {money(o.discount_cents)}</dd></div>}
          {o.type === 'delivery' && <div className="flex justify-between"><dt>Entrega</dt><dd>{o.delivery_fee_cents == null ? 'a confirmar pelo restaurante' : money(o.delivery_fee_cents)}</dd></div>}
          <div className="flex justify-between font-cond text-2xl font-bold"><dt>Total</dt><dd className="tabnums">{money(o.total_cents)}</dd></div>
          <div className="flex justify-between text-lenha-600"><dt>Pagamento</dt><dd>{PAY[o.payment_hint] || o.payment_hint}{o.change_for_cents ? ` · troco p/ ${money(o.change_for_cents)}` : ''}</dd></div>
        </dl>
      </section>

      {store?.whatsapp && (
        <a href={waLink(store.whatsapp, msg)} target="_blank" rel="noopener" className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-semibold text-lenha-900">
          <WaIcon /> Falar com o restaurante no WhatsApp
        </a>
      )}
      {store?.whatsapp && <p className="mt-2 text-center text-xs text-lenha-500">Abre o WhatsApp com o resumo do pedido para você enviar, se quiser.</p>}
    </div></div>
  );
}
