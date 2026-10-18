import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../lib/hooks';
import { money, todayLocal, addDays, TYPE_LABEL, CHANNEL_LABEL, date, time } from '../../lib/format';
import { Spinner, ErrorBox, Select, Input, Stat, cx } from '../../components/ui';

const PRESETS = [
  { id: 'hoje', label: 'Hoje', range: () => [todayLocal(), todayLocal()] },
  { id: 'ontem', label: 'Ontem', range: () => [addDays(todayLocal(), -1), addDays(todayLocal(), -1)] },
  { id: '7d', label: '7 dias', range: () => [addDays(todayLocal(), -6), todayLocal()] },
  { id: '30d', label: '30 dias', range: () => [addDays(todayLocal(), -29), todayLocal()] },
  { id: 'mes', label: 'Este mês', range: () => [todayLocal().slice(0, 8) + '01', todayLocal()] },
];

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev && !cur) return <span>sem movimento no período anterior</span>;
  if (!prev) return <span>sem base no período anterior</span>;
  const d = Math.round(((cur - prev) / prev) * 100);
  return <span className={cx('font-semibold', d >= 0 ? 'text-ok' : 'text-alerta')}>{d >= 0 ? '+' : ''}{d}% vs. período anterior</span>;
}

function Bars({ rows, label, value, fmt = money, empty = 'Sem dados no período.' }: { rows: any[]; label: (r: any) => string; value: (r: any) => number; fmt?: (n: number) => string; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-lenha-500">{empty}</p>;
  const max = Math.max(...rows.map(value), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{label(r)}</span>
          <span className="h-3 rounded-full bg-lenha-100"><span className="block h-3 rounded-full bg-brasa-500" style={{ width: `${(value(r) / max) * 100}%` }} /></span>
          <span className="text-right font-semibold tabnums">{fmt(value(r))}</span>
        </li>
      ))}
    </ul>
  );
}

function Columns({ rows, x, y, label }: { rows: any[]; x: (r: any) => string; y: (r: any) => number; label: (r: any) => string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-lenha-500">Sem vendas no período.</p>;
  const max = Math.max(...rows.map(y), 1);
  return (
    <div className="flex h-40 items-end gap-1" role="img" aria-label="Gráfico de colunas">
      {rows.map((r, i) => (
        <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={`${x(r)}: ${label(r)}`}>
          <div className="rounded-t bg-brasa-500 group-hover:bg-brasa-600" style={{ height: `${Math.max(2, (y(r) / max) * 100)}%` }} />
          <span className="mt-1 truncate text-center text-[10px] text-lenha-500">{x(r)}</span>
        </div>
      ))}
    </div>
  );
}

const Panel = ({ title, children, className, action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) => (
  <section className={cx('rounded-2xl bg-white p-4 ring-1 ring-lenha-100', className)}>
    <div className="mb-3 flex items-center justify-between"><h2 className="font-slab text-lg font-bold">{title}</h2>{action}</div>{children}
  </section>
);

export default function Dashboard() {
  const [preset, setPreset] = useState('hoje');
  const [range, setRange] = useState<string[]>(PRESETS[0].range());
  const [f, setF] = useState({ type: '', channel: '', shift: '', method: '', user_id: '' });
  const staff = useData<any[]>('/api/admin/staff', [], 0);
  const qs = new URLSearchParams({ from: range[0], to: range[1], ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  const { data: d, error, reload } = useData<any>(`/api/admin/dashboard?${qs}`, ['orders', 'cash', 'finance'], 30000);
  const settings = useData<any>('/api/admin/settings', [], 0);
  const methodName = (id: string) => settings.data?.payment_methods?.find((m: any) => m.id === id)?.name || id;

  if (error && !d) return <ErrorBox msg={error} retry={reload} />;
  const live = d?.live || {};
  const p = d?.period; const prev = d?.previous;

  return (
    <div className="space-y-4">
      {/* Agora */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          ['Aguardando confirmação', live.aguardando_confirmacao, live.aguardando_confirmacao ? 'bg-brasa-500 text-white' : ''],
          ['Aguardando preparo', live.confirmado], ['Em preparo', live.em_preparo],
          ['Aguardando retirada', live.awaiting_pickup], ['Aguardando motoboy', live.awaiting_courier], ['Em entrega', live.saiu_entrega],
        ].map(([l, v, c]: any) => (
          <Link key={l} to="/admin/pedidos" className={cx('rounded-2xl p-3 ring-1 ring-lenha-100', c || 'bg-white')}>
            <p className="text-sm opacity-80">{l}</p><p className="font-cond text-3xl font-bold tabnums">{v || 0}</p>
          </Link>
        ))}
      </div>
      <p className="text-sm text-lenha-600">Hoje: {live.done_today || 0} concluídos, {live.canceled_today || 0} cancelados, {live.aberto || 0} mesa(s) aberta(s){live.fechamento ? `, ${live.fechamento} com conta pedida` : ''}.</p>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-lenha-50 p-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((x) => <button key={x.id} onClick={() => { setPreset(x.id); setRange(x.range()); }} className={cx('h-10 rounded-xl px-3 text-sm font-semibold', preset === x.id ? 'bg-lenha-900 text-white' : 'bg-white ring-1 ring-lenha-200')}>{x.label}</button>)}
        </div>
        <Input type="date" value={range[0]} onChange={(e) => { setPreset(''); setRange([e.target.value, range[1] < e.target.value ? e.target.value : range[1]]); }} className="sm:w-40" aria-label="De" />
        <Input type="date" value={range[1]} onChange={(e) => { setPreset(''); setRange([range[0] > e.target.value ? e.target.value : range[0], e.target.value]); }} className="sm:w-40" aria-label="Até" />
        <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="sm:w-44" aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} className="sm:w-44" aria-label="Canal"><option value="">Todos os canais</option>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <Select value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })} className="sm:w-44" aria-label="Turno"><option value="">Todos os turnos</option><option value="manha">Manhã (6h–12h)</option><option value="tarde">Tarde (12h–18h)</option><option value="noite">Noite (18h–24h)</option><option value="madrugada">Madrugada (0h–6h)</option></Select>
        <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className="sm:w-40" aria-label="Forma de pagamento"><option value="">Todas as formas</option>{settings.data?.payment_methods?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
        <Select value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} className="sm:w-44" aria-label="Funcionário"><option value="">Todos os funcionários</option>{staff.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
      </div>

      {!d ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat tone="dark" label="Vendas registradas (faturamento)" value={money(p.gross_cents)} sub={<Delta cur={p.gross_cents} prev={prev.gross_cents} />} />
            <Stat label="Recebido de fato" value={money(p.received_cents)} sub="Pagamentos confirmados no período" />
            <Stat label="Pedidos" value={p.orders} sub={<Delta cur={p.orders} prev={prev.orders} />} />
            <Stat label="Ticket médio" value={money(p.avg_ticket_cents)} sub={`Descontos: ${money(p.discount_cents)} · Cancelados: ${p.canceled_orders}`} />
          </div>
          <p className="text-xs text-lenha-500">Período {date(d.range.from)} a {date(d.range.to)} · comparado com {date(d.range.prev_from)} a {date(d.range.prev_to)}. Faturamento hoje {money(d.today.gross_cents)} · no mês {money(d.month.gross_cents)}.</p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={d.byDay.length > 1 ? 'Vendas por dia' : 'Vendas por horário'}>
              {d.byDay.length > 1
                ? <Columns rows={d.byDay} x={(r) => r.day.slice(8, 10) + '/' + r.day.slice(5, 7)} y={(r) => r.total} label={(r) => `${money(r.total)} · ${r.n} pedidos`} />
                : <Columns rows={d.byHour} x={(r) => `${r.hour}h`} y={(r) => r.total} label={(r) => `${money(r.total)} · ${r.n} pedidos`} />}
            </Panel>
            <Panel title="Horários de maior movimento">
              <Bars rows={[...d.byHour].sort((a: any, b: any) => b.n - a.n).slice(0, 6)} label={(r) => `${String(r.hour).padStart(2, '0')}h às ${String(r.hour + 1).padStart(2, '0')}h`} value={(r) => r.n} fmt={(n) => `${n} pedidos`} />
            </Panel>
            <Panel title="Produtos mais vendidos" action={<Link to="/admin/relatorios" className="text-sm font-semibold text-brasa-700">Relatórios</Link>}>
              <Bars rows={d.topProducts} label={(r) => `${r.name}${r.variant_name ? ` (${r.variant_name})` : ''}`} value={(r) => r.qty} fmt={(n) => `${n} un.`} />
            </Panel>
            <Panel title="Desempenho por canal">
              <Bars rows={d.byChannel} label={(r) => `${CHANNEL_LABEL[r.channel]} · ${TYPE_LABEL[r.type]}`} value={(r) => r.total} />
            </Panel>
            <Panel title="Recebimentos por forma de pagamento">
              <Bars rows={d.byMethod} label={(r) => methodName(r.method)} value={(r) => r.total} />
            </Panel>
            <Panel title="Financeiro do período">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt>Faturamento (vendas registradas)</dt><dd className="font-semibold tabnums">{money(d.finance.revenue_cents)}</dd></div>
                <div className="flex justify-between"><dt>Recebido de fato</dt><dd className="font-semibold tabnums">{money(d.finance.received_cents)}</dd></div>
                <div className="flex justify-between"><dt>Despesas pagas</dt><dd className="font-semibold tabnums text-alerta">− {money(d.finance.expenses_paid_cents)}</dd></div>
                <div className="flex justify-between border-t border-lenha-100 pt-2"><dt className="font-semibold">Resultado de caixa (recebido − despesas pagas)</dt><dd className={cx('font-cond text-2xl font-bold tabnums', d.finance.cash_result_cents < 0 && 'text-alerta')}>{money(d.finance.cash_result_cents)}</dd></div>
                <div className="flex justify-between text-lenha-600"><dt>Resultado operacional estimado (faturamento − despesas com vencimento no período)</dt><dd className="tabnums">{money(d.finance.operating_estimate_cents)}</dd></div>
                <p className="rounded-lg bg-lenha-50 px-3 py-2 text-xs text-lenha-600">Estimativa: não inclui o custo das mercadorias vendidas (fichas técnicas ainda não cadastradas), por isso não é o lucro real.</p>
              </dl>
            </Panel>
            <Panel title="Contas e caixa">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt>Contas a pagar pendentes ({d.finance.payable.n})</dt><dd className="font-semibold tabnums">{money(d.finance.payable.v)}</dd></div>
                {d.finance.payable.overdue > 0 && <div className="flex justify-between text-alerta"><dt>Vencidas</dt><dd className="font-semibold tabnums">{money(d.finance.payable.overdue)}</dd></div>}
                <div className="flex justify-between"><dt>A receber / saldos em aberto ({d.finance.receivable.n})</dt><dd className="font-semibold tabnums">{money(d.finance.receivable.v)}</dd></div>
                <div className="flex justify-between"><dt>Com motoboys, aguardando acerto ({d.finance.courier_pending.n})</dt><dd className="font-semibold tabnums">{money(d.finance.courier_pending.v)}</dd></div>
                <div className="border-t border-lenha-100 pt-2">
                  <p className="font-semibold">Caixas abertos</p>
                  {d.cash_sessions.length === 0 ? <p className="text-lenha-500">Nenhum caixa aberto.</p> : d.cash_sessions.map((c: any) => <p key={c.id}>{c.user_name} · aberto às {time(c.opened_at)} · fundo {money(c.opening_cents)}</p>)}
                </div>
              </dl>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
