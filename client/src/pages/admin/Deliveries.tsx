import { useState } from 'react';
import { post } from '../../lib/api';
import { useData, useNow } from '../../lib/hooks';
import { money, time, minutesSince, elapsed, STATUS_LABEL } from '../../lib/format';
import { OrderDrawer } from '../../components/OrderDrawer';
import { Badge, Select, Spinner, useAction, cx } from '../../components/ui';

export default function Deliveries() {
  const orders = useData<any[]>('/api/orders?active=1&type=delivery', ['orders'], 20000);
  const couriers = useData<any>('/api/couriers', ['orders', 'couriers'], 30000);
  const [open, setOpen] = useState<number | null>(null);
  const now = useNow(20000);
  const { run } = useAction();
  if (!orders.data || !couriers.data) return <Spinner />;
  const groups = [
    { title: 'Em preparo', items: orders.data.filter((o) => ['aguardando_confirmacao', 'confirmado', 'em_preparo'].includes(o.status)) },
    { title: 'Prontos — aguardando despacho', items: orders.data.filter((o) => o.status === 'pronto') },
    { title: 'Em rota', items: orders.data.filter((o) => o.status === 'saiu_entrega') },
    { title: 'Entregues (12h)', items: orders.data.filter((o) => o.status === 'concluido') },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 font-slab text-lg font-bold">{g.title} <span className="text-lenha-400">({g.items.length})</span></h2>
            {g.items.length === 0 ? <p className="rounded-xl bg-white/60 px-4 py-3 text-sm text-lenha-500 ring-1 ring-lenha-100">Nenhum pedido.</p> : (
              <ul className="divide-y divide-lenha-100 rounded-2xl bg-white ring-1 ring-lenha-100">
                {g.items.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <button onClick={() => setOpen(o.id)} className="min-w-0 flex-1 text-left">
                      <p><strong className="font-cond text-xl">#{o.number}</strong> · {o.customer_name} · <span className="text-lenha-600">{o.neighborhood || 'bairro não informado'}</span></p>
                      <p className="text-sm text-lenha-500">{STATUS_LABEL[o.status]} · {o.status === 'saiu_entrega' ? `saiu ${time(o.dispatched_at)} (${elapsed(minutesSince(o.dispatched_at, now))})` : `entrou ${time(o.created_at)}`}
                        {o.total_cents != null && ` · ${money(o.total_cents)}`}{o.payment_status !== 'pago' && ' · cobrar na entrega'}</p>
                      {o.delivery_fee_pending && <Badge tone="ouro">Taxa a confirmar</Badge>}
                    </button>
                    {o.status !== 'concluido' && (
                      <Select className="w-48" value={o.courier_id || ''} disabled={o.status === 'saiu_entrega'} aria-label={`Motoboy do pedido ${o.number}`}
                        onChange={(e) => run('c', () => post(`/api/orders/${o.id}/courier`, { courier_id: e.target.value ? Number(e.target.value) : null }).then(orders.reload), 'Entregador atualizado.')}>
                        <option value="">Sem motoboy</option>
                        {couriers.data.couriers.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.available ? '' : ' (pausa)'}</option>)}
                      </Select>
                    )}
                    {o.status === 'concluido' && <span className="text-sm text-lenha-600">{o.courier_name}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
      <aside className="space-y-2">
        <h2 className="font-slab text-lg font-bold">Motoboys</h2>
        {couriers.data.couriers.length === 0 && <p className="text-sm text-lenha-500">Nenhum motoboy cadastrado. Crie os acessos em Equipe e acessos.</p>}
        {couriers.data.couriers.map((c: any) => (
          <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-lenha-100">
            <span className={cx('size-2.5 rounded-full', c.available ? 'bg-ok' : 'bg-lenha-300')} />
            <span className="flex-1 font-semibold">{c.name}</span>
            <span className="text-sm text-lenha-600">{c.load} em andamento</span>
          </div>
        ))}
        {couriers.data.suggestion && <p className="text-sm text-lenha-600">Próximo sugerido: <strong>{couriers.data.suggestion.name}</strong> (disponível, com menos entregas).</p>}
      </aside>
      <OrderDrawer orderId={open} onClose={() => { setOpen(null); orders.reload(); }} />
    </div>
  );
}
