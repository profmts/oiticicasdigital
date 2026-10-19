import { useState } from 'react';
import { post } from '../../lib/api';
import { useData, useNow, useAuth } from '../../lib/hooks';
import { money, time, minutesSince, elapsed, TYPE_LABEL, CHANNEL_LABEL, STATUS_LABEL } from '../../lib/format';
import { OrderDrawer, NEXT } from '../../components/OrderDrawer';
import { Badge, Button, Spinner, ErrorBox, Select, useAction, cx } from '../../components/ui';

type Col = { id: string; title: string; match: (o: any) => boolean; drop?: string; hint?: string };
const COLS: Col[] = [
  { id: 'novos', title: 'Aguardando confirmação', match: (o) => o.status === 'aguardando_confirmacao' },
  { id: 'confirmado', title: 'Aguardando preparo', match: (o) => o.status === 'confirmado', drop: 'confirmado' },
  { id: 'em_preparo', title: 'Em preparo', match: (o) => o.status === 'em_preparo', drop: 'em_preparo' },
  { id: 'pronto', title: 'Prontos', match: (o) => o.status === 'pronto' && o.type !== 'delivery', drop: 'pronto', hint: 'retirada e balcão' },
  { id: 'motoboy', title: 'Aguardando motoboy', match: (o) => o.status === 'pronto' && o.type === 'delivery', drop: 'pronto' },
  { id: 'rota', title: 'Saiu para entrega', match: (o) => o.status === 'saiu_entrega', drop: 'saiu_entrega' },
  { id: 'mesas', title: 'Mesas abertas', match: (o) => o.type === 'mesa' && ['aberto', 'fechamento'].includes(o.status) },
  { id: 'concluido', title: 'Concluídos (12h)', match: (o) => o.status === 'concluido', drop: 'concluido' },
  { id: 'cancelado', title: 'Cancelados (12h)', match: (o) => o.status === 'cancelado' },
];
const TICKET: Record<string, string> = { novo: 'na fila', preparo: 'na brasa', pronto: 'pronto p/ servir', entregue: 'servido' };

export default function Orders() {
  const { data, error, loading, reload } = useData<any[]>('/api/orders?active=1', ['orders'], 20000);
  const settings = useData<any>('/api/admin/settings', ['settings'], 0);
  const now = useNow(20000);
  const { can } = useAuth();
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState<any>(null);
  const [over, setOver] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(true);
  const { run } = useAction();
  const alertMin = settings.data?.prep_alert_minutes || 25;

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox msg={error} retry={reload} />;
  const list = (data || []).filter((o) => !filter || o.type === filter || o.channel === filter);
  const cols = COLS.filter((c) => !hideDone || !['concluido', 'cancelado'].includes(c.id));

  const move = (o: any, to: string) => {
    if (o.status === to) return;
    if (o.type === 'mesa') return;
    run('move', () => post(`/api/orders/${o.id}/status`, { to }).then(reload), `#${o.number}: ${STATUS_LABEL[to]}`);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto" aria-label="Filtrar pedidos">
          <option value="">Todos os canais</option>
          <option value="delivery">Delivery</option><option value="retirada">Retirada</option><option value="balcao">Balcão</option><option value="mesa">Mesas</option>
          <option value="cardapio">Cardápio digital</option><option value="pdv">PDV</option><option value="whatsapp">WhatsApp</option>
        </Select>
        <Button variant="outline" size="sm" onClick={() => setHideDone((v) => !v)}>{hideDone ? 'Mostrar concluídos e cancelados' : 'Ocultar concluídos e cancelados'}</Button>
        <span className="text-sm text-lenha-500">Arraste o cartão para mudar a etapa, ou abra o pedido. Alerta após {alertMin} min.</span>
        <SearchBox onOpen={setOpen} />
      </div>
      <div className="kanban-scroll -mx-3 flex gap-3 overflow-x-auto px-3 pb-3 sm:-mx-5 sm:px-5">
        {cols.map((c) => {
          const items = list.filter(c.match).sort((a, b) => b.priority - a.priority || (['concluido', 'cancelado'].includes(c.id) ? b.updated_at.localeCompare(a.updated_at) : a.created_at.localeCompare(b.created_at)));
          const canDrop = dragging && c.drop && c.drop !== dragging.status && dragging.type !== 'mesa';
          return (
            <section key={c.id} aria-label={c.title}
              onDragOver={(e) => { if (canDrop) { e.preventDefault(); setOver(c.id); } }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (canDrop) move(dragging, c.drop!); setDragging(null); }}
              className={cx('flex w-72 shrink-0 flex-col rounded-2xl p-2 transition-colors', over === c.id ? 'bg-brasa-100 ring-2 ring-brasa-400' : c.id === 'novos' && items.length ? 'bg-brasa-50' : 'bg-lenha-50')}>
              <header className="flex items-center justify-between px-2 py-1">
                <h2 className="font-semibold">{c.title}</h2>
                <span className={cx('rounded-full px-2 text-sm font-bold tabnums', items.length ? 'bg-lenha-900 text-white' : 'text-lenha-300')}>{items.length}</span>
              </header>
              {c.hint && <p className="px-2 text-xs text-lenha-500">{c.hint}</p>}
              <div className="scroll-visible mt-2 flex max-h-[calc(100dvh-13rem)] flex-col gap-2 overflow-y-auto">
                {items.map((o) => {
                  const ref = o.status === 'aguardando_confirmacao' ? o.created_at : o.confirmed_at || o.created_at;
                  const mins = minutesSince(ref, now);
                  const late = ['aguardando_confirmacao', 'confirmado', 'em_preparo'].includes(o.status) && mins >= (o.status === 'aguardando_confirmacao' ? 5 : alertMin);
                  const next = NEXT[o.type]?.[o.status]?.[0];
                  return (
                    <article key={o.id} draggable={o.type !== 'mesa' && !['concluido', 'cancelado', 'aguardando_confirmacao'].includes(o.status) && can('orders.manage')}
                      onDragStart={() => setDragging(o)} onDragEnd={() => { setDragging(null); setOver(null); }}
                      className={cx('rounded-xl bg-white p-3 shadow-sm ring-1', late ? 'ring-2 ring-alerta' : 'ring-lenha-100', o.status === 'aguardando_confirmacao' && 'pulse-new')}>
                      <button className="block w-full text-left" onClick={() => setOpen(o.id)}>
                        <div className="flex items-center gap-2">
                          <span className="font-cond text-2xl font-bold">#{o.number}</span>
                          {o.priority > 0 && <Badge tone="alerta">Prioridade</Badge>}
                          <span className={cx('ml-auto text-sm font-semibold tabnums', late ? 'text-alerta' : 'text-lenha-500')}>{['concluido', 'cancelado'].includes(o.status) ? time(o.updated_at) : elapsed(mins)}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge tone={o.type === 'delivery' ? 'brasa' : o.type === 'mesa' ? 'dark' : 'neutral'}>{TYPE_LABEL[o.type]}{o.table_label ? ` ${o.table_label}` : ''}</Badge>
                          {o.channel !== 'pdv' && o.channel !== 'garcom' && <Badge tone={o.channel === 'qrcode' ? 'brasa' : 'neutral'}>{CHANNEL_LABEL[o.channel]}</Badge>}
                          {o.delivery_fee_pending && <Badge tone="ouro">Taxa a confirmar</Badge>}
                          {o.close_requested ? <Badge tone="ouro">Conta pedida</Badge> : null}
                          {o.pending_qr > 0 && <Badge tone="alerta">{o.pending_qr} do QR p/ confirmar</Badge>}
                          {o.waiter_called_at && !o.close_requested ? <Badge tone="alerta">Chamando garçom</Badge> : null}
                        </div>
                        <p className="mt-1.5 truncate text-sm">{o.customer_name || o.waiter_name || 'Sem nome'}{o.neighborhood && <span className="text-lenha-500"> · {o.neighborhood}</span>}</p>
                        <p className="text-sm text-lenha-500">{o.items_count} item(ns) · entrou {time(o.created_at)}{o.total_cents != null && <> · <strong className="text-lenha-900">{money(o.total_cents)}</strong></>}</p>
                        {o.type === 'delivery' && <p className="text-sm">{o.courier_name ? <>Motoboy: <strong>{o.courier_name}</strong></> : <span className="text-lenha-500">Sem motoboy</span>}</p>}
                        {o.type === 'mesa' && o.ticket_status && <p className="text-sm text-lenha-600">Última rodada: {TICKET[o.ticket_status]}</p>}
                        {o.payment_status !== 'pago' && o.status === 'concluido' && <Badge tone="alerta" className="mt-1">Saldo em aberto</Badge>}
                      </button>
                      {can('orders.manage') && o.status === 'aguardando_confirmacao' && <Button size="sm" className="mt-2 w-full" onClick={() => setOpen(o.id)}>Revisar e confirmar</Button>}
                      {can('orders.manage') && next && o.type !== 'mesa' && !(next.to === 'concluido' && o.payment_status !== 'pago') && !(next.to === 'saiu_entrega' && !o.courier_id) && (
                        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => move(o, next.to)}>{next.label}</Button>
                      )}
                    </article>
                  );
                })}
                {items.length === 0 && <p className="px-2 py-4 text-center text-sm text-lenha-300">Nenhum pedido</p>}
              </div>
            </section>
          );
        })}
      </div>
      <OrderDrawer orderId={open} onClose={() => { setOpen(null); reload(); }} />
    </div>
  );
}

function SearchBox({ onOpen }: { onOpen: (id: number) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<any[] | null>(null);
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return setRes(null);
    const { get } = await import('../../lib/api');
    setRes(await get(`/api/orders?q=${encodeURIComponent(q.trim())}&limit=20`));
  };
  return (
    <form onSubmit={search} className="relative ml-auto">
      <input type="search" value={q} onChange={(e) => { setQ(e.target.value); if (!e.target.value) setRes(null); }} placeholder="Buscar nº, nome ou telefone"
        className="h-10 w-64 rounded-xl border border-lenha-200 bg-white px-3 text-sm" aria-label="Buscar pedido" />
      {res && (
        <div className="absolute right-0 top-11 z-20 w-80 rounded-xl bg-white p-1 shadow-xl ring-1 ring-lenha-100">
          {res.length === 0 && <p className="p-3 text-sm text-lenha-500">Nenhum pedido encontrado.</p>}
          {res.map((o) => (
            <button key={o.id} type="button" onClick={() => { onOpen(o.id); setRes(null); }} className="flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-lenha-50">
              <span><strong>#{o.number}</strong> {o.customer_name || TYPE_LABEL[o.type]}</span><span className="text-lenha-500">{STATUS_LABEL[o.status]}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
