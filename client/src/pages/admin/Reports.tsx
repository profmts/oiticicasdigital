import { useState } from 'react';
import { useData } from '../../lib/hooks';
import { money, todayLocal, addDays, dateTime, date, TYPE_LABEL, CHANNEL_LABEL, STATUS_LABEL } from '../../lib/format';
import { Input, Select, Spinner, Button, cx } from '../../components/ui';

export default function Reports() {
  const list = useData<any[]>('/api/admin/reports', [], 0);
  const settings = useData<any>('/api/admin/settings', [], 0);
  const [kind, setKind] = useState('vendas_dia');
  const [from, setFrom] = useState(addDays(todayLocal(), -6));
  const [to, setTo] = useState(todayLocal());
  const [channel, setChannel] = useState('');
  const qs = new URLSearchParams({ from, to, ...(channel ? { channel } : {}) }).toString();
  const { data, loading } = useData<any>(`/api/admin/reports/${kind}?${qs}`, [], 0);
  const methods = Object.fromEntries((settings.data?.payment_methods || []).map((m: any) => [m.id, m.name]));
  const fmt = (v: any, t: string | undefined, key: string) => {
    if (v == null || v === '') return '—';
    if (t === 'money') return money(v);
    if (t === 'min') return `${v} min`;
    if (key === 'created_at' || key.endsWith('_at')) return dateTime(v);
    if (key === 'day' || key === 'due_date') return date(v);
    if (key === 'type') return TYPE_LABEL[v] || v;
    if (key === 'channel') return CHANNEL_LABEL[v] || v;
    if (key === 'method') return methods[v] || v;
    if (key === 'status') return STATUS_LABEL[v] || v;
    if (key === 'number') return `#${v}`;
    return v;
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Relatórios">
        {list.data?.map((r) => <button key={r.id} onClick={() => setKind(r.id)} className={cx('shrink-0 rounded-xl px-3 py-2 text-left text-sm font-semibold', kind === r.id ? 'bg-lenha-900 text-white' : 'hover:bg-lenha-100')}>{r.title}</button>)}
      </nav>
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="De" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="Até" />
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-44" aria-label="Canal"><option value="">Todos os canais</option>{Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <a href={`/api/admin/reports/${kind}?${qs}&format=csv`} className="ml-auto"><Button variant="outline">Exportar CSV (Excel)</Button></a>
          <Button variant="outline" onClick={() => window.print()}>Imprimir / PDF</Button>
        </div>
        {!data || loading ? <Spinner /> : (
          <section className="rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
            <h1 className="font-slab text-xl font-bold">{data.title}</h1>
            <p className="mb-3 text-sm text-lenha-500">{date(from)} a {date(to)} · calculado a partir dos registros do sistema</p>
            {data.rows.length === 0 ? <p className="py-8 text-center text-lenha-500">Sem registros no período.</p> : (
              <div className="scroll-visible overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-lenha-500">{data.columns.map((c: any) => <th key={c[0]} className={cx('py-1 pr-3', ['money', 'int', 'min'].includes(c[2]) && 'text-right')}>{c[1]}</th>)}</tr></thead>
                  <tbody>
                    {data.rows.map((r: any, i: number) => (
                      <tr key={i} className="border-t border-lenha-100">
                        {data.columns.map((c: any) => <td key={c[0]} className={cx('py-1.5 pr-3', ['money', 'int', 'min'].includes(c[2]) && 'text-right tabnums')}>{fmt(r[c[0]], c[2], c[0])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                  {data.columns.some((c: any) => c[2] === 'money' || c[2] === 'int') && (
                    <tfoot><tr className="border-t-2 border-lenha-200 font-semibold">
                      {data.columns.map((c: any, i: number) => <td key={c[0]} className={cx('py-1.5 pr-3', ['money', 'int'].includes(c[2]) && 'text-right tabnums')}>
                        {i === 0 ? 'Total' : c[2] === 'money' && !/avg|médio|Diferença|Contado|esperado|Fundo/i.test(c[0] + c[1]) ? money(data.rows.reduce((a: number, r: any) => a + (r[c[0]] || 0), 0)) : c[2] === 'int' ? data.rows.reduce((a: number, r: any) => a + (r[c[0]] || 0), 0) : ''}</td>)}
                    </tr></tfoot>
                  )}
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
