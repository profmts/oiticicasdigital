import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../lib/hooks';
import { money, todayLocal, addDays, TYPE_LABEL, CHANNEL_LABEL, date, time } from '../../lib/format';
import { Spinner, ErrorBox, Select, Input, cx } from '../../components/ui';

const PRESETS = [
  { id: 'hoje', label: 'Hoje', range: () => [todayLocal(), todayLocal()] },
  { id: 'ontem', label: 'Ontem', range: () => [addDays(todayLocal(), -1), addDays(todayLocal(), -1)] },
  { id: '7d', label: '7 dias', range: () => [addDays(todayLocal(), -6), todayLocal()] },
  { id: '30d', label: '30 dias', range: () => [addDays(todayLocal(), -29), todayLocal()] },
  { id: 'mes', label: 'Este mês', range: () => [todayLocal().slice(0, 8) + '01', todayLocal()] },
];

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev && !cur) return <span className="text-lenha-500">sem movimento no período anterior</span>;
  if (!prev) return <span className="text-lenha-500">sem base no período anterior</span>;
  const d = Math.round(((cur - prev) / prev) * 100);
  return <span className={cx('font-semibold', d >= 0 ? 'text-ok' : 'text-alerta')}>{d >= 0 ? '▲ +' : '▼ '}{d}% vs. período anterior</span>;
}

function Bars({ rows, label, value, fmt = money, empty = 'Sem dados no período.' }: { rows: any[]; label: (r: any) => string; value: (r: any) => number; fmt?: (n: number) => string; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-lenha-500">{empty}</p>;
  const max = Math.max(...rows.map(value), 1);
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-lenha-700">{label(r)}</span>
          <span className="h-2.5 rounded-full bg-lenha-100"><span className="block h-2.5 rounded-full bg-brasa-500" style={{ width: `${(value(r) / max) * 100}%` }} /></span>
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
    <div className="flex h-44 items-end gap-1" role="img" aria-label="Gráfico de colunas">
      {rows.map((r, i) => (
        <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" title={`${x(r)}: ${label(r)}`}>
          <div className="rounded-t-md bg-brasa-400 transition-colors group-hover:bg-brasa-600" style={{ height: `${Math.max(2, (y(r) / max) * 100)}%` }} />
          <span className="mt-1 truncate text-center text-[10px] text-lenha-500">{x(r)}</span>
        </div>
      ))}
    </div>
  );
}

const Panel = ({ title, children, className, action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) => (
  <section className={cx('rounded-2xl bg-white p-4 ring-1 ring-lenha-100', className)}>
    <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-slab text-lg font-bold">{title}</h3>{action}</div>{children}
  </section>
);

/** Cartão de número grande. O faturamento é o destaque (escuro); os demais são claros e menores. */
function Kpi({ label, value, sub, hero, accent }: { label: string; value: string; sub?: React.ReactNode; hero?: boolean; accent?: 'ok' | 'alerta' }) {
  return (
    <div className={cx('flex flex-col justify-between rounded-2xl p-5 ring-1', hero ? 'bg-lenha-900 text-white ring-lenha-900' : 'bg-white ring-lenha-100')}>
      <p className={cx('text-sm font-semibold', hero ? 'text-white/70' : 'text-lenha-500')}>{label}</p>
      <p className={cx('mt-2 font-cond font-bold leading-none tabnums', hero ? 'text-5xl sm:text-6xl' : 'text-2xl sm:text-3xl', accent === 'ok' && 'text-ok', accent === 'alerta' && 'text-alerta')}>{value}</p>
      {sub && <p className={cx('mt-2 text-xs leading-snug', hero ? 'text-white/70' : 'text-lenha-500')}>{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [preset, setPreset] = useState('hoje');
  const [range, setRange] = useState<string[]>(PRESETS[0].range());
  const [f, setF] = useState({ type: '', channel: '', shift: '', method: '', user_id: '' });
  const [showFilters, setShowFilters] = useState(false);
  const staff = useData<any[]>('/api/admin/staff', [], 0);
  const qs = new URLSearchParams({ from: range[0], to: range[1], ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) }).toString();
  const { data: d, error, reload } = useData<any>(`/api/admin/dashboard?${qs}`, ['orders', 'cash', 'finance'], 30000);
  const settings = useData<any>('/api/admin/settings', [], 0);
  const methodName = (id: string) => settings.data?.payment_methods?.find((m: any) => m.id === id)?.name || id;
  const activeFilters = Object.values(f).filter(Boolean).length;
  const clearFilters = () => setF({ type: '', channel: '', shift: '', method: '', user_id: '' });

  if (error && !d) return <ErrorBox msg={error} retry={reload} />;
  const live = d?.live || {};
  const p = d?.period; const prev = d?.previous;

  const NOW_CARDS: [string, number, boolean][] = [
    ['Aguardando confirmação', live.aguardando_confirmacao, true],
    ['Aguardando preparo', live.confirmado, false], ['Em preparo', live.em_preparo, false],
    ['Aguardando retirada', live.awaiting_pickup, false], ['Aguardando motoboy', live.awaiting_courier, false], ['Em entrega', live.saiu_entrega, false],
  ];

  return (
    <div className="space-y-5">
      {/* 1) Agora na operação */}
      <section>
        <h2 className="mb-2 font-slab text-base font-bold text-lenha-700">Agora na operação</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {NOW_CARDS.map(([l, v, alertable]) => {
            const on = alertable && v > 0;
            return (
              <Link key={l} to="/admin/pedidos" title="Abrir pedidos"
                className={cx('rounded-2xl p-3 ring-1 transition-colors', on ? 'bg-brasa-500 text-white ring-brasa-500' : 'bg-white ring-lenha-100 hover:ring-lenha-300')}>
                <p className={cx('text-xs font-semibold leading-tight', on ? 'text-white/85' : 'text-lenha-500')}>{l}</p>
                <p className="mt-1 font-cond text-3xl font-bold tabnums">{v || 0}</p>
              </Link>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-lenha-600">Hoje: {live.done_today || 0} concluídos, {live.canceled_today || 0} cancelados, {live.aberto || 0} mesa(s) aberta(s){live.fechamento ? `, ${live.fechamento} com conta pedida` : ''}.</p>
      </section>

      {/* 2) Período e filtros */}
      <section className="rounded-2xl bg-white p-3 ring-1 ring-lenha-100">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {PRESETS.map((x) => <button key={x.id} onClick={() => { setPreset(x.id); setRange(x.range()); }} className={cx('h-10 rounded-xl px-3.5 text-sm font-semibold transition-colors', preset === x.id ? 'bg-lenha-900 text-white' : 'bg-lenha-50 text-lenha-700 hover:bg-lenha-100')}>{x.label}</button>)}
          </div>
          <div className="flex items-center gap-1.5">
            <Input type="date" value={range[0]} onChange={(e) => { setPreset(''); setRange([e.target.value, range[1] < e.target.value ? e.target.value : range[1]]); }} className="w-36" aria-label="De" />
            <span className="text-sm text-lenha-400">até</span>
            <Input type="date" value={range[1]} onChange={(e) => { setPreset(''); setRange([range[0] > e.target.value ? e.target.value : range[0], e.target.value]); }} className="w-36" aria-label="Até" />
          </div>
          <button onClick={() => setShowFilters((v) => !v)} className={cx('ml-auto flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors', showFilters || activeFilters ? 'bg-brasa-50 text-brasa-700 ring-1 ring-brasa-200' : 'bg-lenha-50 text-lenha-700 hover:bg-lenha-100')}>
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><path d="M3 5h18v2l-7 7v5l-4 2v-7L3 7z" /></svg>
            Filtros{activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-brasa-500 text-xs text-white">{activeFilters}</span>}
          </button>
        </div>
        {showFilters && (
          <div className="mt-3 grid gap-2 border-t border-lenha-100 pt-3 sm:grid-cols-2 lg:grid-cols-3">
            <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} aria-label="Canal"><option value="">Todos os canais</option>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Select value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })} aria-label="Turno"><option value="">Todos os turnos</option><option value="manha">Manhã (6h–12h)</option><option value="tarde">Tarde (12h–18h)</option><option value="noite">Noite (18h–24h)</option><option value="madrugada">Madrugada (0h–6h)</option></Select>
            <Select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} aria-label="Forma de pagamento"><option value="">Todas as formas</option>{settings.data?.payment_methods?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
            <Select value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })} aria-label="Funcionário"><option value="">Todos os funcionários</option>{staff.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
            {activeFilters > 0 && <button onClick={clearFilters} className="h-11 rounded-xl text-sm font-semibold text-brasa-700 hover:bg-lenha-50">Limpar filtros</button>}
          </div>
        )}
      </section>

      {!d ? <Spinner /> : (
        <>
          {/* 3) Números do período (destaque) */}
          <section>
            <div className="grid gap-3 lg:grid-cols-2">
              <Kpi hero label="Faturamento no período" value={money(p.gross_cents)} sub={<Delta cur={p.gross_cents} prev={prev.gross_cents} />} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Kpi label="Recebido de fato" value={money(p.received_cents)} accent="ok" sub="Pagamentos confirmados" />
                <Kpi label="Pedidos" value={String(p.orders)} sub={<Delta cur={p.orders} prev={prev.orders} />} />
                <Kpi label="Ticket médio" value={money(p.avg_ticket_cents)} sub={`Descontos ${money(p.discount_cents)} · ${p.canceled_orders} cancelados`} />
              </div>
            </div>
            <p className="mt-2 text-xs text-lenha-500">Período {date(d.range.from)} a {date(d.range.to)}, comparado com {date(d.range.prev_from)} a {date(d.range.prev_to)}. Faturamento hoje {money(d.today.gross_cents)}, no mês {money(d.month.gross_cents)}.</p>
          </section>

          {/* 4) Gráficos e detalhamento */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={d.byDay.length > 1 ? 'Vendas por dia' : 'Vendas por horário'}>
              {d.byDay.length > 1
                ? <Columns rows={d.byDay} x={(r) => r.day.slice(8, 10) + '/' + r.day.slice(5, 7)} y={(r) => r.total} label={(r) => `${money(r.total)} · ${r.n} pedidos`} />
                : <Columns rows={d.byHour} x={(r) => `${r.hour}h`} y={(r) => r.total} label={(r) => `${money(r.total)} · ${r.n} pedidos`} />}
            </Panel>
            <Panel title="Horários de maior movimento">
              <Bars rows={[...d.byHour].sort((a: any, b: any) => b.n - a.n).slice(0, 6)} label={(r) => `${String(r.hour).padStart(2, '0')}h às ${String(r.hour + 1).padStart(2, '0')}h`} value={(r) => r.n} fmt={(n) => `${n} pedidos`} />
            </Panel>
            <Panel title="Produtos mais vendidos" action={<Link to="/admin/relatorios" className="text-sm font-semibold text-brasa-700 hover:underline">Relatórios</Link>}>
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
                <div className="flex justify-between gap-3"><dt className="text-lenha-600">Faturamento (vendas registradas)</dt><dd className="font-semibold tabnums">{money(d.finance.revenue_cents)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-lenha-600">Recebido de fato</dt><dd className="font-semibold tabnums text-ok">{money(d.finance.received_cents)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-lenha-600">Despesas pagas</dt><dd className="font-semibold tabnums text-alerta">− {money(d.finance.expenses_paid_cents)}</dd></div>
                <div className="flex justify-between gap-3 border-t border-lenha-100 pt-2"><dt className="font-semibold">Resultado de caixa</dt><dd className={cx('font-cond text-2xl font-bold tabnums', d.finance.cash_result_cents < 0 ? 'text-alerta' : 'text-ok')}>{money(d.finance.cash_result_cents)}</dd></div>
                <div className="flex justify-between gap-3 text-lenha-600"><dt>Resultado operacional estimado</dt><dd className="tabnums">{money(d.finance.operating_estimate_cents)}</dd></div>
                <p className="rounded-lg bg-lenha-50 px-3 py-2 text-xs text-lenha-600">Estimativa: não inclui o custo das mercadorias vendidas, por isso não é o lucro real.</p>
              </dl>
            </Panel>
            <Panel title="Contas e caixa" className="lg:col-span-2">
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3"><dt className="text-lenha-600">Contas a pagar pendentes ({d.finance.payable.n})</dt><dd className="font-semibold tabnums">{money(d.finance.payable.v)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-lenha-600">A receber / saldos em aberto ({d.finance.receivable.n})</dt><dd className="font-semibold tabnums">{money(d.finance.receivable.v)}</dd></div>
                {d.finance.payable.overdue > 0
                  ? <div className="flex justify-between gap-3 text-alerta"><dt>Contas vencidas</dt><dd className="font-semibold tabnums">{money(d.finance.payable.overdue)}</dd></div>
                  : <div />}
                <div className="flex justify-between gap-3"><dt className="text-lenha-600">Com motoboys, aguardando acerto ({d.finance.courier_pending.n})</dt><dd className="font-semibold tabnums">{money(d.finance.courier_pending.v)}</dd></div>
                <div className="border-t border-lenha-100 pt-2 sm:col-span-2">
                  <p className="font-semibold">Caixas abertos</p>
                  {d.cash_sessions.length === 0 ? <p className="text-lenha-500">Nenhum caixa aberto.</p> : d.cash_sessions.map((c: any) => <p key={c.id} className="text-lenha-600">{c.user_name}, aberto às {time(c.opened_at)}, fundo {money(c.opening_cents)}</p>)}
                </div>
              </dl>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
