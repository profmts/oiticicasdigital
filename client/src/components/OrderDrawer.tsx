import { useEffect, useState } from 'react';
import { get, post, withAuth } from '../lib/api';
import { money, dateTime, time, TYPE_LABEL, CHANNEL_LABEL, STATUS_LABEL, phoneFmt, waLink, mapsLink, parseMoney, centsToInput } from '../lib/format';
import { useAuth, useLive } from '../lib/hooks';
import { Badge, Button, Modal, MoneyInput, Select, Field, Input, Textarea, Spinner, useAction, cx } from './ui';
import { PaymentDialog } from './PaymentDialog';

export const NEXT: Record<string, Record<string, { to: string; label: string }[]>> = {
  delivery: { confirmado: [{ to: 'em_preparo', label: 'Iniciar preparo' }], em_preparo: [{ to: 'pronto', label: 'Marcar pronto' }], pronto: [{ to: 'saiu_entrega', label: 'Saiu para entrega' }], saiu_entrega: [{ to: 'concluido', label: 'Entregue' }] },
  retirada: { confirmado: [{ to: 'em_preparo', label: 'Iniciar preparo' }], em_preparo: [{ to: 'pronto', label: 'Marcar pronto' }], pronto: [{ to: 'concluido', label: 'Cliente retirou' }] },
  balcao: { confirmado: [{ to: 'em_preparo', label: 'Iniciar preparo' }], em_preparo: [{ to: 'pronto', label: 'Marcar pronto' }], pronto: [{ to: 'concluido', label: 'Entregue ao cliente' }] },
  mesa: { aberto: [{ to: 'fechamento', label: 'Fechar conta' }], fechamento: [{ to: 'concluido', label: 'Encerrar mesa' }, { to: 'aberto', label: 'Reabrir' }] },
};

const STATUS_MSG: Record<string, string> = {
  confirmado: 'foi confirmado e já está na fila da cozinha', em_preparo: 'está sendo preparado na brasa', pronto: 'está pronto',
  saiu_entrega: 'saiu para entrega', concluido: 'foi concluído. Obrigado pela preferência!', cancelado: 'foi cancelado',
};

export function OrderDrawer({ orderId, onClose }: { orderId: number | null; onClose: () => void }) {
  const { can, tenant } = useAuth();
  const [o, setO] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [couriers, setCouriers] = useState<any>(null);
  const [dlg, setDlg] = useState<null | 'pay' | 'discount' | 'cancel' | 'confirm' | 'receivable' | { itemCancel: any } | { voidPay: any }>(null);
  const { run, busy } = useAction();
  const load = () => orderId && get(`/api/orders/${orderId}`).then(setO).catch(() => {});
  useEffect(() => { setO(null); if (orderId) { load(); get('/api/admin/settings').then(setSettings).catch(() => {}); if (can('delivery.manage')) get('/api/couriers').then(setCouriers).catch(() => {}); } }, [orderId]); // eslint-disable-line
  useLive((e) => { if (orderId && (e.orderId === orderId || e.scope === 'reconnect' || e.kind === 'kitchen')) load(); });
  if (!orderId) return null;

  const act = (key: string, fn: () => Promise<any>, msg?: string) => run(key, async () => { const r = await fn(); if (r?.id) setO(r); else await load(); return r; }, msg);
  const balance = o ? o.total_cents - o.paid_cents : 0;
  const final = o && ['concluido', 'cancelado'].includes(o.status);
  const methodName = (id: string) => settings?.payment_methods?.find((m: any) => m.id === id)?.name || id;

  return (
    <Modal open side onClose={onClose} title={o ? <>Pedido #{o.number} <span className="font-sans text-base font-normal text-lenha-500">{TYPE_LABEL[o.type]}{o.table_label ? ` ${o.table_label}` : ''}</span></> : 'Pedido'}
      footer={o && !final && (
        <div className="flex flex-wrap gap-2">
          {o.status === 'aguardando_confirmacao' && can('orders.manage') && <Button className="flex-1" onClick={() => setDlg('confirm')}>Confirmar pedido</Button>}
          {can('orders.manage') && (NEXT[o.type]?.[o.status] || []).map((n) => (
            <Button key={n.to} className="flex-1" variant={n.to === 'aberto' ? 'outline' : n.to === 'concluido' ? 'success' : 'primary'} busy={busy === n.to}
              onClick={() => {
                if (n.to === 'concluido' && balance > 0) return setDlg('receivable');
                act(n.to, () => post(`/api/orders/${o.id}/status`, { to: n.to }), `Pedido #${o.number}: ${STATUS_LABEL[n.to]}.`);
              }}>{n.label}</Button>
          ))}
          {can('payments.receive') && balance > 0 && o.status !== 'aguardando_confirmacao' && !(o.type === 'delivery' && o.delivery_fee_cents == null) &&
            <Button className="flex-1" variant="dark" onClick={() => setDlg('pay')}>Receber {money(balance)}</Button>}
        </div>
      )}>
      {!o ? <Spinner /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={o.status === 'cancelado' ? 'alerta' : o.status === 'concluido' ? 'ok' : 'brasa'}>{STATUS_LABEL[o.status]}</Badge>
            <Badge>{CHANNEL_LABEL[o.channel]}</Badge>
            <Badge tone={o.payment_status === 'pago' ? 'ok' : o.payment_status === 'parcial' ? 'ouro' : 'neutral'}>{o.payment_status === 'pago' ? 'Pago' : o.payment_status === 'parcial' ? 'Pago parcialmente' : 'Pagamento pendente'}</Badge>
            {o.receivable ? <Badge tone="alerta">Conta a receber</Badge> : null}
            <span className="text-sm text-lenha-500">Entrou {dateTime(o.created_at)}</span>
          </div>

          {(o.customer_name || o.customer_phone) && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
              <p className="font-semibold">{o.customer_name}</p>
              {o.customer_phone && <a className="text-brasa-700 underline" href={`tel:${o.customer_phone}`}>{phoneFmt(o.customer_phone)}</a>}
              {o.address && (
                <p className="mt-2 text-sm">{o.address.street}, {o.address.number}{o.address.complement && ` — ${o.address.complement}`}<br />{o.address.neighborhood}{o.address.reference && <><br />Ref.: {o.address.reference}</>}
                  <a className="ml-2 font-semibold text-brasa-700 underline" href={mapsLink(o.address, settings?.city)} target="_blank" rel="noopener">Mapa</a></p>
              )}
              {o.payment_hint && <p className="mt-2 text-sm">Cliente vai pagar com <strong>{methodName(o.payment_hint)}</strong>{o.change_for_cents ? ` — troco para ${money(o.change_for_cents)}` : ''}</p>}
              {o.customer_phone && (
                <a href={waLink(o.customer_phone, `Olá, ${(o.customer_name || '').split(' ')[0]}! Seu pedido #${o.number} no ${tenant?.name || 'restaurante'} ${STATUS_MSG[o.status] || 'foi recebido'}.`)} target="_blank" rel="noopener"
                  className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-lenha-900">Avisar cliente no WhatsApp</a>
              )}
            </section>
          )}
          {o.notes && <p className="rounded-xl bg-ouro-300/40 px-4 py-2 text-sm"><strong>Observação:</strong> {o.notes}</p>}
          {o.type === 'mesa' && <p className="text-sm text-lenha-600">Garçom: <strong>{o.waiter_name || '—'}</strong> · {o.guests} pessoa(s)</p>}

          {o.type === 'delivery' && !final && can('delivery.manage') && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
              <Field label="Motoboy">
                <Select value={o.courier_id || ''} disabled={o.status === 'saiu_entrega'} onChange={(e) => act('courier', () => post(`/api/orders/${o.id}/courier`, { courier_id: e.target.value ? Number(e.target.value) : null }), 'Entregador atualizado.')}>
                  <option value="">Sem motoboy</option>
                  {couriers?.couriers.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.available ? '' : ' (indisponível)'} — {c.load} em rota/fila</option>)}
                </Select>
              </Field>
              {!o.courier_id && couriers?.suggestion && <button className="mt-2 text-sm font-semibold text-brasa-700 underline" onClick={() => act('courier', () => post(`/api/orders/${o.id}/courier`, { courier_id: couriers.suggestion.id }), 'Entregador atribuído.')}>Sugestão: {couriers.suggestion.name} (menos entregas agora)</button>}
              {o.delivery_fee_cents == null && o.status !== 'aguardando_confirmacao' && <FeeEditor order={o} onDone={setO} />}
            </section>
          )}

          <section>
            <h3 className="mb-2 font-slab text-lg font-bold">Itens</h3>
            <ul className="divide-y divide-lenha-100 rounded-2xl bg-white ring-1 ring-lenha-100">
              {o.items.map((i: any) => (
                <li key={i.id} className={cx('flex items-start gap-3 px-4 py-2', i.status === 'cancelado' && 'opacity-50')}>
                  <span className="font-bold tabnums">{i.qty}x</span>
                  <div className="min-w-0 flex-1">
                    <p className={cx('font-semibold leading-tight', i.status === 'cancelado' && 'line-through')}>{i.name}{i.variant_name && <span className="font-normal"> · {i.variant_name}</span>}</p>
                    {i.options.length > 0 && <p className="text-xs text-lenha-500">{i.options.map((x: any) => x.name).join(', ')}</p>}
                    {i.notes && <p className="text-xs font-semibold text-brasa-700">Obs.: {i.notes}</p>}
                    <p className="text-xs text-lenha-500">{i.created_by_name ? `${i.created_by_name} · ` : ''}{time(i.created_at)} · {ITEM_STATUS[i.status]}{i.cancel_reason && ` — ${i.cancel_reason}`}</p>
                  </div>
                  {i.total_cents != null && <span className="tabnums">{money(i.total_cents)}</span>}
                  {!final && i.status !== 'cancelado' && (can('orders.manage') || can('pdv.use')) && (
                    <button className="text-sm font-semibold text-alerta" onClick={() => setDlg({ itemCancel: i })} aria-label={`Cancelar ${i.name}`}>Cancelar</button>
                  )}
                </li>
              ))}
            </ul>
            {o.total_cents != null && (
              <dl className="mt-3 space-y-1 px-1 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabnums">{money(o.subtotal_cents)}</dd></div>
                {o.discount_cents > 0 && <div className="flex justify-between text-alerta"><dt>Desconto ({o.discount_reason})</dt><dd className="tabnums">− {money(o.discount_cents)}</dd></div>}
                {o.type === 'delivery' && <div className="flex justify-between"><dt>Entrega</dt><dd className="tabnums">{o.delivery_fee_cents == null ? 'a confirmar' : money(o.delivery_fee_cents)}</dd></div>}
                <div className="flex justify-between font-cond text-2xl font-bold"><dt>Total</dt><dd className="tabnums">{money(o.total_cents)}</dd></div>
                {o.paid_cents > 0 && <div className="flex justify-between text-ok"><dt>Pago</dt><dd className="tabnums">{money(o.paid_cents)}</dd></div>}
              </dl>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {!final && o.status !== 'aguardando_confirmacao' && o.items.some((i: any) => i.status === 'pendente') && <Button size="sm" onClick={() => act('send', () => post(`/api/orders/${o.id}/send`), 'Itens enviados para a cozinha.')}>Enviar itens pendentes para a cozinha</Button>}
              {o.waiter_called_at && !final && <Button size="sm" variant="danger" onClick={() => act('attend', () => post(`/api/orders/${o.id}/attend`), 'Chamado atendido.')}>Atender chamado da mesa</Button>}
              {!final && (can('pdv.use') || can('orders.manage')) && <Button size="sm" variant="outline" onClick={() => setDlg('discount')}>Desconto</Button>}
              <a href={`/imprimir/${o.id}`} target="_blank" className="inline-flex h-9 items-center rounded-xl border border-lenha-200 bg-white px-3 text-sm font-semibold">Imprimir comprovante</a>
              {!final && <Button size="sm" variant="ghost" className="text-alerta" onClick={() => setDlg('cancel')}>{o.status === 'aguardando_confirmacao' ? 'Recusar pedido' : 'Cancelar pedido'}</Button>}
              {can('orders.manage') && !final && <Button size="sm" variant="ghost" onClick={() => act('prio', () => post(`/api/orders/${o.id}/priority`, { priority: o.priority ? 0 : 1 }))}>{o.priority ? 'Tirar prioridade' : 'Marcar prioridade'}</Button>}
            </div>
          </section>

          {o.payments?.length > 0 && (
            <section>
              <h3 className="mb-2 font-slab text-lg font-bold">Pagamentos</h3>
              <ul className="divide-y divide-lenha-100 rounded-2xl bg-white ring-1 ring-lenha-100">
                {o.payments.map((p: any) => (
                  <li key={p.id} className={cx('flex items-center gap-3 px-4 py-2 text-sm', p.voided && 'opacity-50')}>
                    <span className="flex-1"><strong>{methodName(p.method)}</strong> · {time(p.created_at)} · {p.collector_name ? `recebido por ${p.collector_name}${p.cash_session_id ? '' : ' (aguarda acerto)'}` : p.user_name}
                      {p.change_cents > 0 && ` · troco ${money(p.change_cents)}`}{p.voided ? ` · estornado: ${p.void_reason}` : ''}</span>
                    <span className={cx('tabnums', p.voided && 'line-through')}>{money(p.amount_cents)}</span>
                    {!p.voided && <button className="font-semibold text-alerta" onClick={() => setDlg({ voidPay: p })}>Estornar</button>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 font-slab text-lg font-bold">Histórico</h3>
            <ol className="space-y-1.5 text-sm">
              {o.events.map((e: any) => (
                <li key={e.id} className="flex gap-3"><span className="w-12 shrink-0 text-lenha-500 tabnums">{time(e.created_at)}</span>
                  <span>{e.to_status ? <strong>{STATUS_LABEL[e.to_status]}</strong> : null}{e.to_status && e.note ? ' — ' : ''}{e.note}{e.user_name && <span className="text-lenha-500"> · {e.user_name}</span>}</span></li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {o && dlg === 'pay' && settings && <PaymentDialog order={o} methods={settings.payment_methods} onClose={() => setDlg(null)} onDone={(x) => { setO(x); setDlg(null); }} />}
      {o && dlg === 'confirm' && <ConfirmDialog order={o} onClose={() => setDlg(null)} onDone={(x) => { setO(x); setDlg(null); }} />}
      {o && dlg === 'discount' && <DiscountDialog order={o} onClose={() => setDlg(null)} onDone={(x) => { setO(x); setDlg(null); }} />}
      {o && dlg === 'cancel' && <ReasonDialog title={o.status === 'aguardando_confirmacao' ? `Recusar pedido #${o.number}` : `Cancelar pedido #${o.number}`} cta={o.status === 'aguardando_confirmacao' ? 'Recusar pedido' : 'Cancelar pedido'}
        info={o.paid_cents > 0 ? 'Há pagamentos registrados: estorne-os antes de cancelar.' : 'O cancelamento fica registrado com o motivo e o responsável.'}
        onClose={() => setDlg(null)} onSubmit={(reason) => withAuth((auth) => post(`/api/orders/${o.id}/cancel`, { reason, auth })).then((x) => { setO(x); setDlg(null); })} />}
      {o && dlg === 'receivable' && <ReasonDialog title="Concluir com saldo em aberto" cta="Concluir como conta a receber"
        info={`Falta receber ${money(balance)}. O pedido ficará como conta a receber (fiado). Exige permissão do financeiro.`}
        onClose={() => setDlg(null)} onSubmit={(reason) => withAuth((auth) => post(`/api/orders/${o.id}/status`, { to: 'concluido', note: reason, auth: auth || { username: '', password: '' } })).then((x) => { setO(x); setDlg(null); })} />}
      {o && dlg && typeof dlg === 'object' && 'itemCancel' in dlg && <ReasonDialog title={`Cancelar ${dlg.itemCancel.qty}x ${dlg.itemCancel.name}`} cta="Cancelar item"
        info={dlg.itemCancel.status === 'pendente' ? 'Item ainda não foi para a cozinha.' : 'Item já enviado para a cozinha: precisa de autorização.'}
        onClose={() => setDlg(null)} onSubmit={(reason) => withAuth((auth) => post(`/api/items/${dlg.itemCancel.id}/cancel`, { reason, auth })).then((x) => { setO(x); setDlg(null); })} />}
      {o && dlg && typeof dlg === 'object' && 'voidPay' in dlg && <ReasonDialog title={`Estornar ${money(dlg.voidPay.amount_cents)} (${methodName(dlg.voidPay.method)})`} cta="Estornar pagamento"
        info="O estorno exige autorização e fica registrado. Devolva o valor ao cliente pelo mesmo meio."
        onClose={() => setDlg(null)} onSubmit={(reason) => withAuth((auth) => post(`/api/payments/${dlg.voidPay.id}/void`, { reason, auth })).then((x) => { setO(x); setDlg(null); })} />}
    </Modal>
  );
}

const ITEM_STATUS: Record<string, string> = { pendente: 'não enviado', enviado: 'na fila da cozinha', preparo: 'em preparo', pronto: 'pronto', entregue: 'entregue', cancelado: 'cancelado' };

function FeeEditor({ order, onDone }: { order: any; onDone: (o: any) => void }) {
  const [v, setV] = useState('');
  const { run, busy } = useAction();
  return (
    <div className="mt-3 flex items-end gap-2">
      <Field label="Taxa de entrega (bairro não cadastrado)" className="flex-1"><MoneyInput value={v} onChange={setV} /></Field>
      <Button busy={!!busy} disabled={!Number.isFinite(parseMoney(v))} onClick={() => run('fee', () => post(`/api/orders/${order.id}/delivery-fee`, { fee_cents: parseMoney(v) }).then(onDone), 'Taxa definida.')}>Salvar</Button>
    </div>
  );
}

function ConfirmDialog({ order, onClose, onDone }: { order: any; onClose: () => void; onDone: (o: any) => void }) {
  const needFee = order.type === 'delivery' && order.delivery_fee_cents == null;
  const [fee, setFee] = useState('');
  const [eta, setEta] = useState(order.estimated_minutes ? String(order.estimated_minutes) : '');
  const { run, busy } = useAction();
  const feeC = parseMoney(fee);
  return (
    <Modal open onClose={onClose} title={`Confirmar pedido #${order.number}`}
      footer={<Button className="w-full" size="lg" busy={!!busy} disabled={needFee && !Number.isFinite(feeC)}
        onClick={() => run('c', () => post(`/api/orders/${order.id}/confirm`, { delivery_fee_cents: needFee ? feeC : undefined, estimated_minutes: eta ? Number(eta) : null }).then(onDone), 'Pedido confirmado e enviado para a cozinha.')}>Confirmar e enviar para a cozinha</Button>}>
      <div className="space-y-4">
        {needFee && <Field label={`Taxa de entrega para ${order.address?.neighborhood || 'o bairro informado'}`} hint="O cliente escolheu um bairro fora da lista. Combine a taxa e informe aqui."><MoneyInput value={fee} onChange={setFee} /></Field>}
        <Field label="Tempo estimado (minutos)" hint="Aparece para o cliente no acompanhamento do pedido."><Input inputMode="numeric" value={eta} onChange={(e) => setEta(e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
    </Modal>
  );
}

function DiscountDialog({ order, onClose, onDone }: { order: any; onClose: () => void; onDone: (o: any) => void }) {
  const [mode, setMode] = useState<'valor' | 'pct'>('valor');
  const [v, setV] = useState(order.discount_cents ? centsToInput(order.discount_cents) : '');
  const [reason, setReason] = useState(order.discount_reason || '');
  const { run, busy } = useAction();
  const cents = mode === 'valor' ? parseMoney(v) : Math.round(order.subtotal_cents * Number(v.replace(',', '.')) / 100);
  return (
    <Modal open onClose={onClose} title="Desconto"
      footer={<Button className="w-full" busy={!!busy} disabled={!Number.isFinite(cents) || cents < 0 || cents > order.subtotal_cents || (cents > 0 && reason.trim().length < 3)}
        onClick={() => run('d', () => withAuth((auth) => post(`/api/orders/${order.id}/discount`, mode === 'valor' ? { amount_cents: cents, reason, auth } : { percent: Number(v.replace(',', '.')), reason, auth })).then(onDone), 'Desconto aplicado.')}>
        Aplicar desconto de {money(Number.isFinite(cents) ? cents : 0)}</Button>}>
      <p className="mb-3 text-sm text-lenha-600">O desconto substitui qualquer desconto anterior (não acumula). Sem permissão, será pedida a senha de um supervisor.</p>
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-lenha-50 p-1">
        {(['valor', 'pct'] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={cx('h-10 rounded-lg font-semibold', mode === m ? 'bg-white shadow' : '')}>{m === 'valor' ? 'Valor (R$)' : 'Percentual (%)'}</button>)}
      </div>
      {mode === 'valor' ? <MoneyInput value={v} onChange={setV} /> : <Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="%" />}
      <Field label="Motivo" className="mt-3"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

export function ReasonDialog({ title, cta, info, onClose, onSubmit }: { title: string; cta: string; info?: string; onClose: () => void; onSubmit: (reason: string) => Promise<any> }) {
  const [reason, setReason] = useState('');
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title={title}
      footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={onClose}>Voltar</Button><Button variant="danger" className="flex-1" busy={!!busy} disabled={reason.trim().length < 3} onClick={() => run('r', () => onSubmit(reason.trim()))}>{cta}</Button></div>}>
      {info && <p className="mb-3 text-sm text-lenha-600">{info}</p>}
      <Field label="Motivo"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
    </Modal>
  );
}
