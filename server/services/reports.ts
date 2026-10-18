import type { Q } from '../db.js';

/**
 * Relatórios e dashboard calculados no fuso horário da empresa.
 * As datas ficam em UTC no banco; os limites de cada dia são calculados aqui e as
 * conversões usam deslocamento fixo (CONVERT_TZ com '+00:00' → '-03:00'), que funciona
 * em qualquer MySQL/MariaDB, mesmo sem as tabelas de fuso instaladas na hospedagem.
 */
export const todayIn = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (day: string, n: number) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isDay = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/** Deslocamento do fuso em minutos (Brasil: sem horário de verão desde 2019). */
export function offsetMinutes(tz: string, at = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}
const offsetStr = (min: number) => `${min < 0 ? '-' : '+'}${String(Math.floor(Math.abs(min) / 60)).padStart(2, '0')}:${String(Math.abs(min) % 60).padStart(2, '0')}`;
/** Início do dia local (AAAA-MM-DD) como instante UTC ISO. */
const dayStartUtc = (day: string, off: number) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) - off * 60000).toISOString(); };

export interface Filters { from?: string; to?: string; channel?: string; type?: string; user_id?: number; method?: string; shift?: string }
const SHIFTS: Record<string, [number, number]> = { manha: [6, 12], tarde: [12, 18], noite: [18, 24], madrugada: [0, 6] };

class P {
  v: unknown[] = [];
  add(x: unknown) { this.v.push(x); return `$${this.v.length}`; }
}

type Ctx = { t: number; tz: string; off: number; offs: string; from: string; to: string };
function ctx(t: number, tz: string, f: Filters): Ctx {
  const to = isDay(f.to) ? f.to! : todayIn(tz);
  const from = isDay(f.from) ? f.from! : to;
  const off = offsetMinutes(tz);
  return { t, tz, off, offs: offsetStr(off), from, to };
}
const local = (p: P, c: Ctx, col: string) => `CONVERT_TZ(${col}, '+00:00', ${p.add(c.offs)})`;
const rangeSql = (p: P, col: string, c: Ctx) => `${col} >= ${p.add(dayStartUtc(c.from, c.off))} AND ${col} < ${p.add(dayStartUtc(addDays(c.to, 1), c.off))}`;

function orderWhere(p: P, c: Ctx, f: Filters, a = 'o') {
  const w = [`${a}.tenant_id = ${p.add(c.t)}`, rangeSql(p, `${a}.created_at`, c)];
  if (f.channel) w.push(`${a}.channel = ${p.add(f.channel)}`);
  if (f.type) w.push(`${a}.type = ${p.add(f.type)}`);
  if (f.user_id) { const u = p.add(Number(f.user_id)); w.push(`(${a}.created_by = ${u} OR ${a}.waiter_id = ${u})`); }
  if (f.shift && SHIFTS[f.shift]) {
    const hr = `HOUR(${local(p, c, `${a}.created_at`)})`;
    w.push(`${hr} >= ${p.add(SHIFTS[f.shift][0])} AND ${hr} < ${p.add(SHIFTS[f.shift][1])}`);
  }
  if (f.method) w.push(`EXISTS (SELECT 1 FROM payments px WHERE px.order_id = ${a}.id AND px.voided = 0 AND px.method = ${p.add(f.method)})`);
  return w.join(' AND ');
}
const VALID = `o.status NOT IN ('cancelado','aguardando_confirmacao')`;
const n = (v: any) => Number(v || 0);

async function periodTotals(q: Q, c: Ctx, f: Filters) {
  let p = new P();
  const sales = await q.get(`SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) gross, COALESCE(SUM(subtotal_cents),0) sub,
      COALESCE(SUM(discount_cents),0) disc, COALESCE(SUM(COALESCE(delivery_fee_cents,0)),0) fees
    FROM orders o WHERE ${orderWhere(p, c, f)} AND ${VALID}`, p.v);
  p = new P();
  const canceled = await q.get(`SELECT COUNT(*) n FROM orders o WHERE ${orderWhere(p, c, f)} AND o.status = 'cancelado'`, p.v);
  p = new P();
  const pw = [`pm.tenant_id = ${p.add(c.t)}`, rangeSql(p, 'pm.created_at', c), 'pm.voided = 0'];
  if (f.method) pw.push(`pm.method = ${p.add(f.method)}`);
  if (f.channel) pw.push(`o.channel = ${p.add(f.channel)}`);
  if (f.type) pw.push(`o.type = ${p.add(f.type)}`);
  const received = await q.get(`SELECT COALESCE(SUM(pm.amount_cents),0) v FROM payments pm JOIN orders o ON o.id = pm.order_id WHERE ${pw.join(' AND ')}`, p.v);
  const orders = n(sales.n); const gross = n(sales.gross);
  return { orders, gross_cents: gross, subtotal_cents: n(sales.sub), discount_cents: n(sales.disc), delivery_fees_cents: n(sales.fees),
    avg_ticket_cents: orders ? Math.round(gross / orders) : 0, received_cents: n(received.v), canceled_orders: n(canceled.n) };
}

export async function dashboard(q: Q, t: number, tz: string, f: Filters) {
  const c = ctx(t, tz, f);
  const days = Math.round((new Date(c.to).getTime() - new Date(c.from).getTime()) / 864e5) + 1;
  const prev = { ...c, from: addDays(c.from, -days), to: addDays(c.from, -1) };
  const cur = await periodTotals(q, c, f);
  const previous = await periodTotals(q, prev, f);
  const sq = async (sql: (w: string, p: P) => string) => { const p = new P(); const w = orderWhere(p, c, f); return q.all(sql(w, p), p.v); };
  const byChannel = await sq((w) => `SELECT channel, type, COUNT(*) n, SUM(total_cents) total FROM orders o WHERE ${w} AND ${VALID} GROUP BY channel, type ORDER BY total DESC`);
  const byDay = await sq((w, p) => `SELECT DATE_FORMAT(${local(p, c, 'created_at')}, '%Y-%m-%d') AS \`day\`, COUNT(*) n, SUM(total_cents) total FROM orders o WHERE ${w} AND ${VALID} GROUP BY 1 ORDER BY 1`);
  const byHour = await sq((w, p) => `SELECT HOUR(${local(p, c, 'created_at')}) AS \`hour\`, COUNT(*) n, SUM(total_cents) total FROM orders o WHERE ${w} AND ${VALID} GROUP BY 1 ORDER BY 1`);
  const topProducts = await sq((w) => `SELECT i.name, i.variant_name, SUM(i.qty) qty, SUM(i.total_cents) total FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE ${w} AND ${VALID} AND i.status NOT IN ('cancelado','pendente') GROUP BY i.name, i.variant_name ORDER BY qty DESC LIMIT 10`);
  let p = new P();
  const byMethod = await q.all(`SELECT method, COUNT(*) n, SUM(amount_cents) total FROM payments pm WHERE pm.tenant_id = ${p.add(t)} AND voided = 0 AND ${rangeSql(p, 'pm.created_at', c)} GROUP BY method ORDER BY total DESC`, p.v);

  const live = Object.fromEntries((await q.all(`SELECT status, COUNT(*) n FROM orders WHERE tenant_id = $1 AND status NOT IN ('concluido','cancelado') GROUP BY status`, [t])).map((x) => [x.status, n(x.n)]));
  const one = async (sql: string, prm: unknown[]) => n((await q.get(sql, prm))?.n);
  const awaitingCourier = await one(`SELECT COUNT(*) n FROM orders WHERE tenant_id = $1 AND type='delivery' AND status='pronto'`, [t]);
  const awaitingPickup = await one(`SELECT COUNT(*) n FROM orders WHERE tenant_id = $1 AND type IN ('retirada','balcao') AND status='pronto'`, [t]);
  const qrPending = await one(`SELECT COUNT(*) n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.tenant_id = $1 AND i.status = 'pendente' AND i.source = 'cliente' AND o.status IN ('aberto','fechamento')`, [t]);
  const today = todayIn(tz);
  const tc = { ...c, from: today, to: today };
  p = new P();
  const doneToday = await q.get(`SELECT COALESCE(SUM(status='concluido'),0) done, COALESCE(SUM(status='cancelado'),0) canceled FROM orders o WHERE o.tenant_id = ${p.add(t)} AND ${rangeSql(p, 'o.created_at', tc)}`, p.v);
  const todayTotals = await periodTotals(q, tc, {});
  const monthTotals = await periodTotals(q, { ...c, from: today.slice(0, 8) + '01', to: today }, {});

  p = new P();
  const expensesPaid = n((await q.get(`SELECT COALESCE(SUM(amount_cents),0) v FROM expenses e WHERE e.tenant_id = ${p.add(t)} AND status='pago' AND ${rangeSql(p, 'e.paid_at', c)}`, p.v)).v);
  const expensesDue = n((await q.get(`SELECT COALESCE(SUM(amount_cents),0) v FROM expenses WHERE tenant_id = $1 AND status <> 'cancelado' AND due_date BETWEEN $2 AND $3`, [t, c.from, c.to])).v);
  const payable = await q.get(`SELECT COUNT(*) n, COALESCE(SUM(amount_cents),0) v, COALESCE(SUM(CASE WHEN due_date < $2 THEN amount_cents END),0) overdue FROM expenses WHERE tenant_id = $1 AND status='pendente'`, [t, today]);
  const receivable = await q.get(`SELECT COUNT(*) n, COALESCE(SUM(total_cents - paid_cents),0) v FROM orders WHERE tenant_id = $1 AND status NOT IN ('cancelado','aguardando_confirmacao') AND paid_cents < total_cents`, [t]);
  const courierPending = await q.get(`SELECT COUNT(*) n, COALESCE(SUM(amount_cents),0) v FROM payments WHERE tenant_id = $1 AND cash_session_id IS NULL AND voided = 0`, [t]);
  const cash = await q.all(`SELECT cs.id, cs.opened_at, cs.opening_cents, u.name user_name FROM cash_sessions cs JOIN users u ON u.id = cs.user_id WHERE cs.tenant_id = $1 AND cs.status='aberto'`, [t]);

  return {
    range: { from: c.from, to: c.to, prev_from: prev.from, prev_to: prev.to },
    period: cur, previous, today: todayTotals, month: monthTotals,
    live: { ...live, awaiting_courier: awaitingCourier, awaiting_pickup: awaitingPickup, qr_pending_items: qrPending, done_today: n(doneToday.done), canceled_today: n(doneToday.canceled) },
    byChannel, byDay, byHour, topProducts, byMethod,
    finance: {
      revenue_cents: cur.gross_cents, received_cents: cur.received_cents, expenses_paid_cents: expensesPaid, expenses_due_cents: expensesDue,
      cash_result_cents: cur.received_cents - expensesPaid, operating_estimate_cents: cur.gross_cents - expensesDue,
      payable: { n: n(payable.n), v: n(payable.v), overdue: n(payable.overdue) }, receivable: { n: n(receivable.n), v: n(receivable.v) },
      courier_pending: { n: n(courierPending.n), v: n(courierPending.v) },
    },
    cash_sessions: cash,
  };
}

type Col = [string, string, ('money' | 'int' | 'text' | 'min')?];
const run = async (q: Q, c: Ctx, f: Filters, build: (w: string, p: P) => string) => { const p = new P(); const w = orderWhere(p, c, f); return q.all(build(w, p), p.v); };
const mins = (a: string, b: string) => `ROUND(AVG(TIMESTAMPDIFF(SECOND, ${b}, ${a})) / 60)`;

export const REPORTS: Record<string, { title: string; columns: Col[]; run: (q: Q, c: Ctx, f: Filters) => Promise<any[]> }> = {
  vendas_dia: {
    title: 'Faturamento por dia', columns: [['day', 'Dia'], ['orders', 'Pedidos', 'int'], ['gross', 'Faturamento', 'money'], ['discount', 'Descontos', 'money'], ['avg', 'Ticket médio', 'money']],
    run: (q, c, f) => run(q, c, f, (w, p) => `SELECT DATE_FORMAT(${local(p, c, 'created_at')}, '%Y-%m-%d') AS \`day\`, COUNT(*) orders, SUM(total_cents) gross, SUM(discount_cents) discount, ROUND(AVG(total_cents)) \`avg\` FROM orders o WHERE ${w} AND ${VALID} GROUP BY 1 ORDER BY 1`),
  },
  vendas_produto: {
    title: 'Vendas por produto', columns: [['name', 'Produto'], ['variant_name', 'Variação'], ['category_name', 'Categoria'], ['qty', 'Qtd.', 'int'], ['total', 'Total', 'money']],
    run: (q, c, f) => run(q, c, f, (w) => `SELECT i.name, i.variant_name, MAX(i.category_name) category_name, SUM(i.qty) qty, SUM(i.total_cents) total FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${w} AND ${VALID} AND i.status NOT IN ('cancelado','pendente') GROUP BY i.name, i.variant_name ORDER BY qty DESC`),
  },
  vendas_categoria: {
    title: 'Vendas por categoria', columns: [['category_name', 'Categoria'], ['qty', 'Itens', 'int'], ['total', 'Total', 'money']],
    run: (q, c, f) => run(q, c, f, (w) => `SELECT i.category_name, SUM(i.qty) qty, SUM(i.total_cents) total FROM order_items i JOIN orders o ON o.id=i.order_id WHERE ${w} AND ${VALID} AND i.status NOT IN ('cancelado','pendente') GROUP BY i.category_name ORDER BY total DESC`),
  },
  vendas_canal: {
    title: 'Vendas por canal', columns: [['channel', 'Canal'], ['type', 'Tipo'], ['orders', 'Pedidos', 'int'], ['gross', 'Total', 'money'], ['avg', 'Ticket médio', 'money']],
    run: (q, c, f) => run(q, c, f, (w) => `SELECT channel, type, COUNT(*) orders, SUM(total_cents) gross, ROUND(AVG(total_cents)) \`avg\` FROM orders o WHERE ${w} AND ${VALID} GROUP BY channel, type ORDER BY gross DESC`),
  },
  recebimentos: {
    title: 'Recebimentos por forma de pagamento', columns: [['method', 'Forma'], ['n', 'Pagamentos', 'int'], ['total', 'Recebido', 'money'], ['voided', 'Estornado', 'money']],
    run: (q, c) => { const p = new P(); return q.all(`SELECT method, SUM(voided = 0) n, COALESCE(SUM(CASE WHEN voided = 0 THEN amount_cents END),0) total, COALESCE(SUM(CASE WHEN voided = 1 THEN amount_cents END),0) voided FROM payments pm WHERE pm.tenant_id = ${p.add(c.t)} AND ${rangeSql(p, 'pm.created_at', c)} GROUP BY method ORDER BY total DESC`, p.v); },
  },
  horarios: {
    title: 'Movimento por horário', columns: [['hour', 'Hora'], ['orders', 'Pedidos', 'int'], ['gross', 'Total', 'money']],
    run: (q, c, f) => run(q, c, f, (w, p) => `SELECT CONCAT(LPAD(HOUR(${local(p, c, 'created_at')}), 2, '0'), ':00') AS \`hour\`, COUNT(*) orders, SUM(total_cents) gross FROM orders o WHERE ${w} AND ${VALID} GROUP BY 1 ORDER BY 1`),
  },
  sem_saida: {
    title: 'Produtos sem saída no período', columns: [['category', 'Categoria'], ['name', 'Produto'], ['variant', 'Variação']],
    run: (q, c) => { const p = new P(); const tp = p.add(c.t); return q.all(`SELECT cat.name category, pr.name, v.name variant FROM product_variants v JOIN products pr ON pr.id=v.product_id JOIN categories cat ON cat.id=pr.category_id
      WHERE v.tenant_id = ${tp} AND v.active = 1 AND pr.active = 1 AND NOT EXISTS (SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.variant_id=v.id AND i.status <> 'cancelado' AND o.status <> 'cancelado' AND ${rangeSql(p, 'o.created_at', c)}) ORDER BY cat.sort, pr.sort`, p.v); },
  },
  descontos: {
    title: 'Descontos concedidos', columns: [['created_at', 'Data'], ['number', 'Pedido'], ['user_name', 'Operador'], ['authorized', 'Autorizado por'], ['reason', 'Motivo'], ['to', 'Desconto', 'money']],
    run: async (q, c) => {
      const p = new P();
      const rows = await q.all(`SELECT a.created_at, o.number, u.name user_name, au.name authorized, a.reason, a.data_json FROM audit_log a JOIN orders o ON o.id=a.entity_id LEFT JOIN users u ON u.id=a.user_id LEFT JOIN users au ON au.id=a.authorized_by WHERE a.tenant_id = ${p.add(c.t)} AND a.action='order.discount' AND ${rangeSql(p, 'a.created_at', c)} ORDER BY a.id`, p.v);
      return rows.map((x) => ({ ...x, to: x.data_json?.to ?? 0, data_json: undefined }));
    },
  },
  cancelamentos: {
    title: 'Cancelamentos e estornos', columns: [['created_at', 'Data'], ['action', 'Tipo'], ['number', 'Pedido'], ['user_name', 'Operador'], ['authorized', 'Autorizado por'], ['reason', 'Motivo'], ['value', 'Valor', 'money']],
    run: async (q, c) => {
      const p = new P();
      const labels: Record<string, string> = { 'order.cancel': 'Pedido cancelado', 'item.cancel': 'Item cancelado', 'payment.void': 'Pagamento estornado' };
      const rows = await q.all(`SELECT a.created_at, a.action, o.number, u.name user_name, au.name authorized, a.reason, a.data_json FROM audit_log a LEFT JOIN orders o ON o.id=a.entity_id LEFT JOIN users u ON u.id=a.user_id LEFT JOIN users au ON au.id=a.authorized_by WHERE a.tenant_id = ${p.add(c.t)} AND a.action IN ('order.cancel','item.cancel','payment.void') AND ${rangeSql(p, 'a.created_at', c)} ORDER BY a.id`, p.v);
      return rows.map((x) => ({ ...x, action: labels[x.action], value: x.data_json?.total_cents ?? x.data_json?.amount_cents ?? 0, data_json: undefined }));
    },
  },
  garcons: {
    title: 'Desempenho dos garçons', columns: [['name', 'Garçom'], ['tables', 'Mesas atendidas', 'int'], ['items', 'Itens lançados', 'int'], ['total', 'Vendido', 'money']],
    run: (q, c) => { const p = new P(); const r1 = rangeSql(p, 'o.created_at', c); const r2 = rangeSql(p, 'i.created_at', c); const tp = p.add(c.t);
      return q.all(`SELECT u.name, (SELECT COUNT(*) FROM orders o WHERE o.waiter_id=u.id AND o.type='mesa' AND o.status<>'cancelado' AND ${r1}) AS \`tables\`,
        COALESCE(SUM(i.qty),0) items, COALESCE(SUM(i.total_cents),0) total FROM users u LEFT JOIN order_items i ON i.created_by=u.id AND i.status<>'cancelado' AND ${r2}
        WHERE u.tenant_id = ${tp} AND u.role='garcom' GROUP BY u.id, u.name ORDER BY total DESC`, p.v); },
  },
  motoboys: {
    title: 'Entregas por motoboy', columns: [['name', 'Motoboy'], ['deliveries', 'Entregas', 'int'], ['avg_min', 'Tempo médio (saída→entrega)', 'min'], ['fees', 'Taxas de entrega', 'money'], ['failed', 'Tentativas sem sucesso', 'int']],
    run: (q, c) => { const p = new P(); const r2 = rangeSql(p, 'e.created_at', c); const r1 = rangeSql(p, 'o.delivered_at', c); const tp = p.add(c.t);
      return q.all(`SELECT u.name, COUNT(o.id) deliveries, ${mins('o.delivered_at', 'o.dispatched_at')} avg_min, COALESCE(SUM(o.delivery_fee_cents),0) fees,
        (SELECT COUNT(*) FROM order_events e WHERE e.type='delivery_failed' AND e.user_id=u.id AND ${r2}) failed
        FROM users u LEFT JOIN orders o ON o.courier_id=u.id AND o.status='concluido' AND ${r1}
        WHERE u.tenant_id = ${tp} AND u.role='motoboy' GROUP BY u.id, u.name ORDER BY deliveries DESC`, p.v); },
  },
  tempos: {
    title: 'Tempos de preparo e entrega', columns: [['type', 'Tipo'], ['orders', 'Pedidos', 'int'], ['prep', 'Preparo médio', 'min'], ['delivery', 'Entrega média', 'min'], ['total', 'Total médio (pedido→conclusão)', 'min']],
    run: (q, c, f) => run(q, c, f, (w) => `SELECT type, COUNT(*) orders, ${mins('ready_at', 'COALESCE(confirmed_at, created_at)')} prep,
      ${mins('delivered_at', 'dispatched_at')} delivery, ${mins('closed_at', 'created_at')} total FROM orders o WHERE ${w} AND status = 'concluido' GROUP BY type`),
  },
  caixas: {
    title: 'Fechamentos de caixa', columns: [['opened_at', 'Abertura'], ['closed_at', 'Fechamento'], ['user_name', 'Operador'], ['opening_cents', 'Fundo', 'money'], ['expected_cash_cents', 'Dinheiro esperado', 'money'], ['counted_cash_cents', 'Contado', 'money'], ['difference_cents', 'Diferença', 'money']],
    run: (q, c) => { const p = new P(); return q.all(`SELECT cs.opened_at, cs.closed_at, u.name user_name, cs.opening_cents, cs.expected_cash_cents, cs.counted_cash_cents, cs.difference_cents FROM cash_sessions cs JOIN users u ON u.id=cs.user_id WHERE cs.tenant_id = ${p.add(c.t)} AND ${rangeSql(p, 'cs.opened_at', c)} ORDER BY cs.id`, p.v); },
  },
  despesas: {
    title: 'Despesas', columns: [['due_date', 'Vencimento'], ['description', 'Descrição'], ['category', 'Categoria'], ['supplier', 'Fornecedor'], ['status', 'Status'], ['amount_cents', 'Valor', 'money']],
    run: (q, c) => q.all(`SELECT due_date, description, category, supplier, status, amount_cents FROM expenses WHERE tenant_id = $1 AND due_date BETWEEN $2 AND $3 ORDER BY due_date`, [c.t, c.from, c.to]),
  },
  fluxo_caixa: {
    title: 'Fluxo de caixa (por dia)', columns: [['day', 'Dia'], ['entradas', 'Entradas (recebimentos)', 'money'], ['saidas', 'Saídas (despesas pagas)', 'money'], ['saldo', 'Saldo do dia', 'money']],
    run: async (q, c) => {
      let p = new P();
      const ins = await q.all(`SELECT DATE_FORMAT(${local(p, c, 'created_at')}, '%Y-%m-%d') AS \`day\`, SUM(amount_cents) v FROM payments pm WHERE pm.tenant_id = ${p.add(c.t)} AND voided = 0 AND ${rangeSql(p, 'pm.created_at', c)} GROUP BY 1`, p.v);
      p = new P();
      const outs = await q.all(`SELECT DATE_FORMAT(${local(p, c, 'paid_at')}, '%Y-%m-%d') AS \`day\`, SUM(amount_cents) v FROM expenses e WHERE e.tenant_id = ${p.add(c.t)} AND status='pago' AND ${rangeSql(p, 'e.paid_at', c)} GROUP BY 1`, p.v);
      const days = [...new Set([...ins, ...outs].map((x) => x.day))].sort();
      return days.map((d) => { const e = n(ins.find((x) => x.day === d)?.v); const s = n(outs.find((x) => x.day === d)?.v); return { day: d, entradas: e, saidas: s, saldo: e - s }; });
    },
  },
  contas_receber: {
    title: 'Contas a receber (saldos em aberto)', columns: [['number', 'Pedido'], ['created_at', 'Data'], ['customer_name', 'Cliente'], ['type', 'Tipo'], ['status', 'Status'], ['total_cents', 'Total', 'money'], ['paid_cents', 'Pago', 'money'], ['open', 'Em aberto', 'money']],
    run: (q, c) => q.all(`SELECT number, created_at, customer_name, type, status, total_cents, paid_cents, total_cents - paid_cents AS \`open\` FROM orders WHERE tenant_id = $1 AND status NOT IN ('cancelado','aguardando_confirmacao') AND paid_cents < total_cents ORDER BY created_at`, [c.t]),
  },
};

export function runReport(q: Q, t: number, tz: string, kind: string, f: Filters) {
  return REPORTS[kind].run(q, ctx(t, tz, f), f);
}

export function toCsv(cols: Col[], rows: any[]) {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const fmt = (v: any, t?: string) => (t === 'money' ? (v == null ? '' : (v / 100).toFixed(2).replace('.', ',')) : v);
  return '﻿' + [cols.map((c) => esc(c[1])).join(';'), ...rows.map((r) => cols.map((c) => esc(fmt(r[c[0]], c[2]))).join(';'))].join('\r\n');
}
