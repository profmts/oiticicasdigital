import { useEffect, useState } from 'react';
import { get, post, withAuth } from '../lib/api';
import { useAuth, useData, useLive, useConnection, useNow, beep } from '../lib/hooks';
import { money, time, minutesSince, elapsed } from '../lib/format';
import { ProductPicker, CartList, cartTotal, type CartLine } from '../components/catalog';
import { ReasonDialog, OrderDrawer } from '../components/OrderDrawer';
import { Badge, Button, Modal, Spinner, Input, Field, Select, useAction, useToast, cx } from '../components/ui';
import { TenantLogo } from '../components/brand';

export const TABLE_STATE: Record<string, { label: string; cls: string }> = {
  livre: { label: 'Livre', cls: 'bg-white ring-1 ring-lenha-200 text-lenha-700' },
  ocupada: { label: 'Ocupada', cls: 'bg-lenha-700 text-white' },
  aguardando_pedido: { label: 'Aguardando pedido', cls: 'bg-ouro-400 text-lenha-900' },
  em_preparo: { label: 'Em preparo', cls: 'bg-brasa-500 text-white' },
  pedido_pronto: { label: 'Pedido pronto', cls: 'bg-ok text-white' },
  aguardando_pagamento: { label: 'Aguardando pagamento', cls: 'bg-lenha-900 text-ouro-300' },
  em_fechamento: { label: 'Em fechamento', cls: 'bg-lenha-900 text-white' },
};
const ITEM: Record<string, string> = { pendente: 'não enviado', enviado: 'na fila', preparo: 'na brasa', pronto: 'pronto', entregue: 'servido', cancelado: 'cancelado' };

/** Quadro de mesas — usado no app do garçom e no painel (Mesas). */
export function TablesBoard({ admin }: { admin?: boolean }) {
  const { me, can } = useAuth();
  const tables = useData<any[]>('/api/tables', ['orders', 'tables'], 15000);
  const [mine, setMine] = useState(false);
  const [openTable, setOpenTable] = useState<any>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<number | null>(null);
  const toast = useToast();
  useLive((e) => {
    if (e.scope === 'orders' && e.kind === 'kitchen' && tables.data?.some((t) => t.order?.mine)) tables.reload();
  });
  useLive((e) => { if (e.scope === 'orders' && (e.kind === 'qr_order' || e.kind === 'call')) { tables.reload(); if (!admin) beep(2); } });
  // aviso quando um pedido de mesa minha fica pronto
  const readyMine = (tables.data || []).filter((t) => t.state === 'pedido_pronto' && t.order?.waiter_id === me?.id).map((t) => t.id).join(',');
  useEffect(() => { if (readyMine && !admin) { beep(2); toast('Tem pedido pronto para servir.', 'info'); } }, [readyMine]); // eslint-disable-line

  if (!tables.data) return <Spinner />;
  const list = tables.data.filter((t) => !mine || t.order?.waiter_id === me?.id);
  if (!tables.data.length) return <p className="rounded-2xl bg-white p-6 text-center text-lenha-600">Nenhuma mesa cadastrada. {can('settings.manage') ? 'Cadastre em Configurações.' : 'Peça ao administrador para cadastrar as mesas.'}</p>;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-lenha-50 p-1">
          <button onClick={() => setMine(false)} className={cx('h-9 rounded-lg px-4 text-sm font-semibold', !mine && 'bg-white shadow')}>Todas</button>
          <button onClick={() => setMine(true)} className={cx('h-9 rounded-lg px-4 text-sm font-semibold', mine && 'bg-white shadow')}>Minhas</button>
        </div>
        <span className="ml-auto text-sm text-lenha-500">{tables.data.filter((t) => t.state !== 'livre').length} ocupadas de {tables.data.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {list.map((t) => {
          const st = TABLE_STATE[t.state];
          return (
            <button key={t.id} onClick={() => (t.order ? (t.order.mine ? setOrderId(t.order.id) : toast(`Mesa de ${t.order.waiter_name}.`, 'info')) : setOpenTable(t))}
              className={cx('flex aspect-square flex-col items-start justify-between rounded-2xl p-3 text-left', st.cls, t.state === 'pedido_pronto' && 'pulse-new')}>
              <span className="flex w-full items-start justify-between gap-1">
                <span className="font-cond text-4xl font-bold leading-none">{t.label}</span>
                {t.order?.called && <span className="blink rounded-full bg-alerta px-2 py-0.5 text-[11px] font-bold text-white">{t.order.close_requested ? 'Conta' : 'Chamando'}</span>}
              </span>
              {t.order?.pending_qr > 0 && <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[11px] font-bold text-lenha-900">{t.order.pending_qr} item(ns) do QR para confirmar</span>}
              <span className="text-xs font-semibold leading-tight">{st.label}
                {t.order && <span className="block font-normal opacity-80">{t.order.waiter_name?.split(' ')[0]} · {t.order.guests}p</span>}
                {t.order?.total_cents != null && <span className="block font-semibold">{money(t.order.total_cents)}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {openTable && <OpenTableDialog table={openTable} onClose={() => setOpenTable(null)} onOpened={(o) => { setOpenTable(null); setOrderId(o.id); tables.reload(); }} />}
      {orderId && <TableOrder orderId={orderId} admin={admin} onClose={() => { setOrderId(null); tables.reload(); }} onPay={(id) => { setOrderId(null); setDrawer(id); }} />}
      <OrderDrawer orderId={drawer} onClose={() => { setDrawer(null); tables.reload(); }} />
    </div>
  );
}

function OpenTableDialog({ table, onClose, onOpened }: { table: any; onClose: () => void; onOpened: (o: any) => void }) {
  const [guests, setGuests] = useState(2);
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title={`Abrir mesa ${table.label}`}
      footer={<Button size="lg" className="w-full" busy={!!busy} onClick={() => run('open', () => post('/api/orders', { type: 'mesa', table_id: table.id, guests }).then(onOpened), `Mesa ${table.label} aberta.`)}>Abrir mesa</Button>}>
      <p className="mb-2 font-semibold">Quantas pessoas?</p>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} onClick={() => setGuests(n)} className={cx('h-14 rounded-xl font-cond text-2xl font-bold', guests === n ? 'bg-brasa-500 text-white' : 'bg-white ring-1 ring-lenha-200')}>{n}</button>
        ))}
      </div>
    </Modal>
  );
}

function TableOrder({ orderId, admin, onClose, onPay }: { orderId: number; admin?: boolean; onClose: () => void; onPay: (id: number) => void }) {
  const { can } = useAuth();
  const [o, setO] = useState<any>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [cancelItem, setCancelItem] = useState<any>(null);
  const [transfer, setTransfer] = useState(false);
  const { run, busy } = useAction();
  const now = useNow(30000);
  const load = () => get(`/api/orders/${orderId}`).then(setO);
  useEffect(() => { load(); get('/api/catalog').then(setCatalog); }, [orderId]); // eslint-disable-line
  useLive((e) => { if (e.orderId === orderId || e.kind === 'kitchen') load(); });
  if (!o) return <Modal open onClose={onClose} title="Mesa"><Spinner /></Modal>;

  const send = () => run('send', async () => {
    const r = await post(`/api/orders/${o.id}/items`, { items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, option_ids: l.option_ids, notes: l.notes || undefined })), send: true });
    setO(r); setLines([]); setAdding(false);
  }, 'Itens enviados para a cozinha.');
  const rounds = [...new Set(o.items.map((i: any) => i.ticket_id ?? 0))] as number[];
  const pendingItems = o.items.filter((i: any) => i.status === 'pendente');
  const readyTickets = o.tickets.filter((t: any) => t.status === 'pronto');
  const open = ['aberto', 'fechamento'].includes(o.status);

  return (
    <Modal open onClose={onClose} side title={<>Mesa {o.table_label} <span className="font-sans text-base font-normal text-lenha-500">#{o.number} · {o.guests} pessoa(s) · {o.waiter_name || (o.channel === 'qrcode' ? 'aberta pelo QR' : '')}</span></>}
      footer={open && (
        <div className="flex flex-col gap-2">
          {o.waiter_called_at && <Button variant="danger" busy={busy === 'attend'} onClick={() => run('attend', () => post(`/api/orders/${o.id}/attend`).then(setO), 'Chamado atendido.')}>{o.close_requested ? 'Cliente pediu a conta — marcar como atendido' : 'Cliente chamou — marcar como atendido'}</Button>}
          {pendingItems.length > 0 && <Button variant="primary" busy={busy === 'sendqr'} onClick={() => run('sendqr', () => post(`/api/orders/${o.id}/send`).then(setO), 'Enviado para a cozinha.')}>Confirmar e enviar {pendingItems.length} item(ns) para a cozinha</Button>}
          {readyTickets.map((t: any) => (
            <Button key={t.id} variant="success" busy={busy === `srv${t.id}`} onClick={() => run(`srv${t.id}`, () => post(`/api/tickets/${t.id}/served`).then(load), 'Marcado como servido.')}>Rodada {t.seq} pronta — marcar como servida</Button>
          ))}
          <div className="flex gap-2">
            <Button className="flex-1" size="lg" onClick={() => setAdding(true)}>Lançar itens</Button>
            {o.status === 'aberto'
              ? <Button className="flex-1" size="lg" variant="dark" busy={busy === 'close'} disabled={!o.items.some((i: any) => i.status !== 'cancelado')} onClick={() => run('close', () => post(`/api/orders/${o.id}/status`, { to: 'fechamento' }).then(setO), 'Conta solicitada ao caixa.')}>Pedir a conta</Button>
              : can('payments.receive') ? <Button className="flex-1" size="lg" variant="dark" onClick={() => onPay(o.id)}>Receber</Button>
                : <Button className="flex-1" size="lg" variant="outline" busy={busy === 'reopen'} onClick={() => run('reopen', () => post(`/api/orders/${o.id}/status`, { to: 'aberto' }).then(setO))}>Reabrir conta</Button>}
          </div>
        </div>
      )}>
      {o.status === 'fechamento' && <p className="mb-3 rounded-xl bg-ouro-300/60 px-4 py-2 font-semibold">Conta solicitada — aguardando pagamento no caixa.</p>}
      {o.items.length === 0 && <p className="py-8 text-center text-lenha-500">Mesa aberta às {time(o.created_at)}. Toque em “Lançar itens”.</p>}
      {rounds.map((tid) => {
        const t = o.tickets.find((x: any) => x.id === tid);
        const its = o.items.filter((i: any) => (i.ticket_id ?? 0) === tid);
        return (
          <section key={tid} className="mb-4">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-lenha-600">
              {t ? <>Rodada {t.seq} · {time(t.created_at)}</> : <span className="text-alerta">Aguardando confirmação para a cozinha</span>}
              {t && <Badge tone={t.status === 'pronto' ? 'ok' : t.status === 'entregue' ? 'neutral' : 'brasa'}>{t.status === 'novo' ? 'na fila' : t.status === 'preparo' ? `na brasa · ${elapsed(minutesSince(t.started_at || t.created_at, now))}` : t.status === 'pronto' ? 'pronto' : t.status === 'entregue' ? 'servido' : t.status}</Badge>}
              {t?.question && <Badge tone="alerta">Cozinha pergunta: {t.question}</Badge>}
            </h3>
            <ul className="divide-y divide-lenha-100 rounded-2xl bg-white ring-1 ring-lenha-100">
              {its.map((i: any) => (
                <li key={i.id} className={cx('flex items-start gap-3 px-3 py-2', i.status === 'cancelado' && 'opacity-50')}>
                  <span className="font-bold">{i.qty}x</span>
                  <div className="min-w-0 flex-1">
                    <p className={cx('font-semibold leading-tight', i.status === 'cancelado' && 'line-through')}>{i.name}{i.variant_name && ` · ${i.variant_name}`}</p>
                    {i.options.length > 0 && <p className="text-xs text-lenha-500">{i.options.map((x: any) => x.name).join(', ')}</p>}
                    {i.notes && <p className="text-xs font-semibold text-brasa-700">Obs.: {i.notes}</p>}
                    <p className="text-xs text-lenha-500">{ITEM[i.status]} · {i.created_by_name} {time(i.created_at)}</p>
                  </div>
                  <span className="text-sm tabnums">{money(i.total_cents)}</span>
                  {open && i.status !== 'cancelado' && <button className="text-xs font-semibold text-alerta" onClick={() => setCancelItem(i)}>Cancelar</button>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div className="flex justify-between border-t border-lenha-100 pt-3 font-cond text-2xl font-bold"><span>Total</span><span className="tabnums">{money(o.total_cents)}</span></div>
      {o.paid_cents > 0 && <p className="text-right text-sm text-ok">Pago: {money(o.paid_cents)}</p>}
      {admin && can('tables.manage') && open && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button className="text-sm font-semibold text-brasa-700 underline" onClick={() => setTransfer(true)}>Transferir mesa ou garçom</button>
          <button className="text-sm font-semibold text-alerta underline disabled:opacity-50" disabled={busy === 'release'} onClick={() => run('release', () => post(`/api/orders/${o.id}/release`).then(onClose), 'Mesa liberada.')}>Liberar mesa</button>
        </div>
      )}

      {adding && catalog && (
        <Modal open onClose={() => setAdding(false)} title={`Lançar na mesa ${o.table_label}`} wide
          footer={<div className="flex items-center gap-3"><span className="font-cond text-2xl font-bold tabnums">{money(cartTotal(lines))}</span><Button className="flex-1" size="lg" disabled={!lines.length} busy={busy === 'send'} onClick={send}>Enviar {lines.reduce((a, l) => a + l.qty, 0)} item(ns) para a cozinha</Button></div>}>
          {lines.length > 0 && <div className="mb-3 rounded-2xl bg-white p-3 ring-1 ring-brasa-200"><CartList lines={lines} setLines={setLines} /></div>}
          <ProductPicker catalog={catalog} type="mesa" compact onAdd={(l) => setLines((ls) => [...ls, l])} />
        </Modal>
      )}
      {cancelItem && <ReasonDialog title={`Cancelar ${cancelItem.qty}x ${cancelItem.name}`} cta="Cancelar item"
        info={cancelItem.status === 'pendente' ? undefined : 'Este item já foi para a cozinha. O cancelamento precisa da senha de um supervisor e fica registrado.'}
        onClose={() => setCancelItem(null)} onSubmit={(reason) => withAuth((auth) => post(`/api/items/${cancelItem.id}/cancel`, { reason, auth })).then((x) => { setO(x); setCancelItem(null); })} />}
      {transfer && <TransferDialog order={o} onClose={() => setTransfer(false)} onDone={(x) => { setO(x); setTransfer(false); }} />}
    </Modal>
  );
}

function TransferDialog({ order, onClose, onDone }: { order: any; onClose: () => void; onDone: (o: any) => void }) {
  const [tables, setTables] = useState<any[]>([]);
  const [waiters, setWaiters] = useState<any[]>([]);
  const [t, setT] = useState(''); const [w, setW] = useState(''); const [reason, setReason] = useState('');
  const { run, busy } = useAction();
  useEffect(() => { get('/api/tables').then(setTables); get('/api/waiters').then(setWaiters); }, []);
  return (
    <Modal open onClose={onClose} title="Transferir"
      footer={<Button className="w-full" busy={!!busy} disabled={!t && !w} onClick={() => run('t', () => post(`/api/orders/${order.id}/transfer`, { table_id: t ? Number(t) : undefined, waiter_id: w ? Number(w) : undefined, reason }).then(onDone), 'Transferência registrada.')}>Transferir</Button>}>
      <div className="space-y-3">
        <Field label="Para a mesa"><Select value={t} onChange={(e) => setT(e.target.value)}><option value="">Manter mesa {order.table_label}</option>{tables.filter((x) => x.state === 'livre').map((x) => <option key={x.id} value={x.id}>Mesa {x.label}</option>)}</Select></Field>
        <Field label="Garçom responsável"><Select value={w} onChange={(e) => setW(e.target.value)}><option value="">Manter {order.waiter_name}</option>{waiters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Motivo (opcional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

export default function Waiter() {
  const { me, logout, tenant } = useAuth();
  const online = useConnection();
  return (
    <div className="tela-equipe min-h-dvh pb-8">
      <header className="tech-grid sticky top-0 z-20 flex items-center gap-3 px-4 py-3 text-white">
        <TenantLogo url={tenant?.logo_url} name={tenant?.name || ''} className="size-10 rounded-lg bg-white object-contain text-xs" />
        <div className="leading-tight"><p className="font-slab text-lg font-bold">Mesas</p><p className="text-sm text-lenha-200">{me?.name}</p></div>
        <span className={cx('ml-auto size-2.5 rounded-full', online ? 'bg-green-400' : 'bg-red-400')} title={online ? 'Conectado' : 'Reconectando'} />
        {me?.home?.startsWith('/admin') && <button onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = me.home))} className="flex h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-sm font-semibold hover:bg-white/20" title="Voltar à tela anterior"><svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>Voltar</button>}
        <button onClick={logout} className="h-9 rounded-full px-3 text-sm font-semibold hover:bg-white/10">Sair</button>
      </header>
      <main className="p-3"><TablesBoard /></main>
    </div>
  );
}
