import { Router, type Request } from 'express';
import { z } from 'zod';
import { h, bad, forbidden, notFound, conflict, requireAuth, requirePerm, can, authorize, audit, broadcast, sseSubscribe, getSetting, type SessionUser } from '../core.js';
import * as O from '../services/orders.js';
import * as C from '../services/cash.js';

export const opsRouter = Router();
opsRouter.use(requireAuth);

const T = (req: Request) => req.tenant!.id;
const itemSchema = z.object({ variant_id: z.number().int(), qty: z.number().int().min(1).max(99), option_ids: z.array(z.number().int()).max(20).optional(), notes: z.string().max(200).optional() });
const authSchema = z.object({ username: z.string().max(60), password: z.string().max(200) }).optional();
const id = (req: Request) => { const n = Number(req.params.id); if (!Number.isInteger(n)) throw bad('Id inválido.'); return n; };

// ---------- tempo real ----------
opsRouter.get('/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: hello\ndata: {}\n\n`);
  const off = sseSubscribe(res, T(req));
  req.on('close', () => { off(); });
});

async function loadForUser(req: Request, orderId: number) {
  const o = await O.getOrder(req.db, T(req), orderId);
  const u = req.user!;
  if (can(u, 'orders.view')) return o;
  if (o.type === 'mesa' && can(u, 'tables.use')) return o;
  if (u.role === 'motoboy' && o.courier_id === u.id) return o;
  throw forbidden();
}

function summarize(o: any, user: SessionUser) {
  const base: any = {
    id: o.id, number: o.number, channel: o.channel, type: o.type, status: o.status, status_label: O.STATUS_LABELS[o.status], created_at: o.created_at,
    updated_at: o.updated_at, customer_name: o.customer_name, table_label: o.table_label, waiter_name: o.waiter_name, courier_id: o.courier_id, courier_name: o.courier_name,
    items_count: o.items_count, pending_qr: o.pending_qr, priority: o.priority, estimated_minutes: o.estimated_minutes, payment_status: o.payment_status, payment_hint: o.payment_hint,
    confirmed_at: o.confirmed_at, ready_at: o.ready_at, dispatched_at: o.dispatched_at, close_requested: o.close_requested, waiter_called_at: o.waiter_called_at,
    neighborhood: o.address_json?.neighborhood ?? null, delivery_fee_pending: o.type === 'delivery' && o.delivery_fee_cents === null, ticket_status: o.ticket_status, receivable: o.receivable,
  };
  if (can(user, 'orders.view_values')) Object.assign(base, { total_cents: o.total_cents, paid_cents: o.paid_cents });
  return base;
}

const LIST_SQL = `SELECT o.*, tb.label table_label, w.name waiter_name, c.name courier_name,
  (SELECT COALESCE(SUM(qty),0) FROM order_items i WHERE i.order_id = o.id AND i.status <> 'cancelado') items_count,
  (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id AND i.status = 'pendente' AND i.source = 'cliente') pending_qr,
  (SELECT status FROM kitchen_tickets k WHERE k.order_id = o.id AND k.status <> 'cancelado' ORDER BY k.seq DESC LIMIT 1) ticket_status
  FROM orders o LEFT JOIN dining_tables tb ON tb.id = o.table_id LEFT JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = o.courier_id`;

opsRouter.get('/orders', requirePerm('orders.view'), h(async (req) => {
  const qy = req.query; const w = ['o.tenant_id = $1']; const p: unknown[] = [T(req)];
  const add = (cond: string, v: unknown) => { p.push(v); w.push(cond.replace('?', `$${p.length}`)); };
  if (qy.active === '1') add(`(o.status NOT IN ('concluido','cancelado') OR o.updated_at >= ?)`, new Date(Date.now() - 12 * 3600e3).toISOString());
  if (qy.status) add('o.status = ?', String(qy.status));
  if (qy.type) add('o.type = ?', String(qy.type));
  if (qy.q) {
    const s = String(qy.q).trim();
    if (/^#?\d{1,7}$/.test(s)) add('o.number = ?', Number(s.replace('#', '')));
    else { p.push(`%${s.replace(/\D/g, '') || '§'}%`); p.push(`%${s}%`); w.push(`(o.customer_phone LIKE $${p.length - 1} OR o.customer_name LIKE $${p.length})`); }
  }
  const rows = await req.db.all(`${LIST_SQL} WHERE ${w.join(' AND ')} ORDER BY o.priority DESC, o.created_at DESC LIMIT ${Math.min(Number(qy.limit) || 300, 1000)}`, p);
  return rows.map((o) => summarize(o, req.user!));
}));

opsRouter.get('/orders/:id', h(async (req) => {
  const o = await loadForUser(req, id(req));
  const d = await O.orderDetail(req.db, T(req), o.id, req.user);
  if (req.user!.role === 'motoboy') {
    return { id: d.id, number: d.number, status: d.status, status_label: d.status_label, customer_name: d.customer_name, customer_phone: d.customer_phone,
      address: d.address, notes: d.notes, payment_hint: d.payment_hint, change_for_cents: d.change_for_cents, total_cents: d.total_cents, paid_cents: d.paid_cents,
      items: d.items.filter((i: any) => i.status !== 'cancelado').map((i: any) => ({ name: i.name, variant_name: i.variant_name, qty: i.qty })) };
  }
  return d;
}));

const createSchema = z.object({
  type: z.enum(['delivery', 'retirada', 'mesa', 'balcao']), channel: z.enum(['pdv', 'garcom', 'whatsapp', 'telefone']).default('pdv'),
  items: z.array(itemSchema).max(100).default([]), idempotency_key: z.string().min(8).max(80).optional(),
  customer_name: z.string().max(80).optional(), customer_phone: z.string().max(25).optional(), save_address: z.boolean().optional(),
  address: z.object({ street: z.string().max(120).optional(), number: z.string().max(20).optional(), complement: z.string().max(80).optional(), neighborhood: z.string().max(80).optional(), reference: z.string().max(120).optional() }).optional(),
  delivery_zone_id: z.number().int().nullable().optional(), delivery_fee_cents: z.number().int().min(0).nullable().optional(),
  payment_hint: z.string().max(40).optional(), change_for_cents: z.number().int().nullable().optional(), notes: z.string().max(300).optional(),
  table_id: z.number().int().optional(), guests: z.number().int().min(1).max(50).optional(), send_to_kitchen: z.boolean().optional(),
});

opsRouter.post('/orders', h(async (req) => {
  const body = createSchema.parse(req.body);
  const u = req.user!;
  if (body.type === 'mesa') { if (!can(u, 'tables.use')) throw forbidden(); } else if (!can(u, 'pdv.use')) throw forbidden();
  const input = body.type === 'mesa' ? { ...body, channel: u.role === 'garcom' ? 'garcom' : 'pdv' } : body;
  const { order, duplicate } = await O.createOrder(req.db, T(req), input as any, u);
  return { ...(await O.orderDetail(req.db, T(req), order.id, u)), duplicate };
}));

opsRouter.post('/orders/:id/items', h(async (req) => {
  const { items, send } = z.object({ items: z.array(itemSchema).min(1).max(60), send: z.boolean().default(true) }).parse(req.body);
  const o = await loadForUser(req, id(req));
  if (!can(req.user, o.type === 'mesa' ? 'tables.use' : 'pdv.use')) throw forbidden();
  await O.addItems(req.db, T(req), o.id, items, req.user!, send);
  return O.orderDetail(req.db, T(req), o.id, req.user);
}));

opsRouter.post('/orders/:id/send', h(async (req) => {
  const o = await loadForUser(req, id(req));
  if (!can(req.user, 'tables.use') && !can(req.user, 'pdv.use') && !can(req.user, 'orders.manage')) throw forbidden();
  await O.sendToKitchen(req.db, T(req), o.id, req.user!);
  return O.orderDetail(req.db, T(req), o.id, req.user);
}));

opsRouter.post('/orders/:id/attend', h(async (req) => {
  // garçom atendeu o chamado feito pelo QR da mesa
  const o = await loadForUser(req, id(req));
  if (!can(req.user, 'tables.use') && !can(req.user, 'orders.manage')) throw forbidden();
  await req.db.run('UPDATE orders SET waiter_called_at = NULL WHERE id = $1', [o.id]);
  await O.event(req.db, T(req), o.id, 'qr_call_done', req.user!.id, 'Chamado atendido');
  broadcast(T(req), 'orders', { orderId: o.id });
  return O.orderDetail(req.db, T(req), o.id, req.user);
}));

opsRouter.post('/orders/:id/confirm', requirePerm('orders.manage'), h(async (req) => {
  const p = z.object({ delivery_fee_cents: z.number().int().min(0).nullable().optional(), estimated_minutes: z.number().int().min(1).max(300).nullable().optional() }).parse(req.body || {});
  await O.confirmOrder(req.db, T(req), id(req), req.user!, p);
  return O.orderDetail(req.db, T(req), id(req), req.user);
}));

opsRouter.post('/orders/:id/status', h(async (req) => {
  const p = z.object({ to: z.string(), note: z.string().max(300).optional(), auth: authSchema }).parse(req.body);
  const o = await loadForUser(req, id(req));
  const u = req.user!;
  const waiterOk = o.type === 'mesa' && ['fechamento', 'aberto'].includes(p.to) && can(u, 'tables.use');
  if (!waiterOk && !can(u, 'orders.manage')) throw forbidden();
  if (waiterOk) O.assertTableAccess(o, u);
  let receivableAuth: number | null = null;
  if (p.to === 'concluido') {
    const fresh = await O.recalc(req.db, T(req), o.id);
    if (fresh.paid_cents < fresh.total_cents && (p.auth || p.note)) {
      if (!p.note || p.note.trim().length < 3) throw bad('Informe o motivo para concluir com saldo em aberto.');
      receivableAuth = await authorize(req, 'finance.manage', p.auth);
    }
  }
  await O.changeStatus(req.db, T(req), o.id, p.to, u, { note: p.note, receivable_auth: receivableAuth });
  return O.orderDetail(req.db, T(req), o.id, u);
}));

opsRouter.post('/orders/:id/cancel', h(async (req) => {
  const p = z.object({ reason: z.string().min(3).max(300), auth: authSchema }).parse(req.body);
  const o = await loadForUser(req, id(req));
  const by = o.status === 'aguardando_confirmacao' && can(req.user, 'orders.manage') ? req.user!.id : await authorize(req, 'orders.cancel', p.auth);
  await O.cancelOrder(req.db, T(req), o.id, req.user!, p.reason, by, req.ip);
  return O.orderDetail(req.db, T(req), o.id, req.user);
}));

opsRouter.post('/items/:id/cancel', h(async (req) => {
  const p = z.object({ reason: z.string().min(3).max(300), auth: authSchema }).parse(req.body);
  const it = await req.db.get('SELECT * FROM order_items WHERE id = $1 AND tenant_id = $2', [id(req), T(req)]);
  if (!it) throw notFound('Item não encontrado.');
  await loadForUser(req, it.order_id);
  if (!can(req.user, 'tables.use') && !can(req.user, 'pdv.use') && !can(req.user, 'orders.manage')) throw forbidden();
  const by = it.status === 'pendente' ? null : await authorize(req, 'orders.cancel', p.auth);
  await O.cancelItem(req.db, T(req), it.id, req.user!, p.reason, by, req.ip);
  return O.orderDetail(req.db, T(req), it.order_id, req.user);
}));

opsRouter.post('/orders/:id/discount', h(async (req) => {
  const p = z.object({ amount_cents: z.number().int().min(0).optional(), percent: z.number().min(0).max(100).optional(), reason: z.string().max(200).default(''), auth: authSchema }).parse(req.body);
  const o = await O.recalc(req.db, T(req), (await loadForUser(req, id(req))).id);
  if (!can(req.user, 'pdv.use') && !can(req.user, 'orders.manage')) throw forbidden();
  const cents = p.percent != null ? Math.round(o.subtotal_cents * p.percent / 100) : p.amount_cents ?? 0;
  const by = await authorize(req, 'discount.apply', p.auth);
  await O.setDiscount(req.db, T(req), o.id, req.user!, cents, p.reason, by, req.ip);
  return O.orderDetail(req.db, T(req), o.id, req.user);
}));

opsRouter.post('/orders/:id/delivery-fee', requirePerm('orders.manage'), h(async (req) => {
  const { fee_cents } = z.object({ fee_cents: z.number().int().min(0).max(100000) }).parse(req.body);
  const o = await O.getOrder(req.db, T(req), id(req));
  if (o.type !== 'delivery' || ['concluido', 'cancelado'].includes(o.status)) throw conflict('Não é possível alterar a taxa deste pedido.');
  await req.db.run('UPDATE orders SET delivery_fee_cents = $1 WHERE id = $2', [fee_cents, o.id]);
  await audit(req.db, { tenantId: T(req), userId: req.user!.id, action: 'order.delivery_fee', entity: 'order', entityId: o.id, data: { from: o.delivery_fee_cents, to: fee_cents }, ip: req.ip });
  await O.recalc(req.db, T(req), o.id); broadcast(T(req), 'orders', { orderId: o.id });
  return O.orderDetail(req.db, T(req), o.id, req.user);
}));

opsRouter.post('/orders/:id/priority', requirePerm('orders.manage'), h(async (req) => {
  const { priority } = z.object({ priority: z.number().int().min(0).max(2) }).parse(req.body);
  await req.db.run('UPDATE orders SET priority = $1 WHERE id = $2 AND tenant_id = $3', [priority, id(req), T(req)]);
  broadcast(T(req), 'orders', { orderId: id(req) }); return { ok: true };
}));

opsRouter.post('/orders/:id/payments', requirePerm('payments.receive', 'delivery.courier'), h(async (req) => {
  const p = z.object({ payments: z.array(z.object({ method: z.string().max(30), amount_cents: z.number().int().min(1), received_cents: z.number().int().nullable().optional() })).min(1).max(6), idempotency_key: z.string().max(80).optional() }).parse(req.body);
  const o = await loadForUser(req, id(req));
  await C.addPayments(req.db, T(req), o.id, req.user!, p.payments, p.idempotency_key);
  return O.orderDetail(req.db, T(req), o.id, req.user);
}));

opsRouter.post('/payments/:id/void', h(async (req) => {
  const p = z.object({ reason: z.string().min(3).max(300), auth: authSchema }).parse(req.body);
  const by = await authorize(req, 'payments.void', p.auth);
  const o = await C.voidPayment(req.db, T(req), id(req), req.user!, p.reason, by, req.ip);
  return O.orderDetail(req.db, T(req), o.id, req.user);
}));

opsRouter.post('/orders/:id/courier', requirePerm('delivery.manage'), h(async (req) => {
  const { courier_id } = z.object({ courier_id: z.number().int().nullable() }).parse(req.body);
  await O.assignCourier(req.db, T(req), id(req), courier_id, req.user!);
  return O.orderDetail(req.db, T(req), id(req), req.user);
}));
opsRouter.get('/couriers', requirePerm('delivery.manage', 'orders.view'), h(async (req) => {
  const list = await req.db.all(`SELECT u.id, u.name, u.phone, u.available, (SELECT COUNT(*) FROM orders o WHERE o.courier_id = u.id AND o.status IN ('pronto','saiu_entrega')) AS active_load
    FROM users u WHERE u.tenant_id = $1 AND u.role = 'motoboy' AND u.active ORDER BY u.name`, [T(req)]);
  return { couriers: list.map(({ active_load, ...c }: any) => ({ ...c, load: Number(active_load) })), suggestion: (await O.suggestCourier(req.db, T(req))) || null };
}));

// ---------- Mesas ----------
opsRouter.get('/tables', requirePerm('tables.use'), h(async (req) => {
  const u = req.user!;
  const hide13 = await getSetting(req.db, T(req), 'hide_table_13');
  let tables = await req.db.all('SELECT id, label, seats, sort, qr_enabled FROM dining_tables WHERE tenant_id = $1 AND active ORDER BY sort, label', [T(req)]);
  if (hide13) tables = tables.filter((t) => t.label !== '13');
  const open = await req.db.all(`${LIST_SQL} WHERE o.tenant_id = $1 AND o.type = 'mesa' AND o.status IN ('aberto','fechamento')`, [T(req)]);
  const tick = await req.db.all(`SELECT order_id, status, COUNT(*) n FROM kitchen_tickets WHERE tenant_id = $1 AND status IN ('novo','preparo','pronto') GROUP BY order_id, status`, [T(req)]);
  const pend = await req.db.all(`SELECT order_id, COUNT(*) n FROM order_items WHERE tenant_id = $1 AND status = 'pendente' GROUP BY order_id`, [T(req)]);
  return tables.map((t) => {
    const o = open.find((x) => x.table_id === t.id);
    if (!o) return { ...t, state: 'livre' };
    const ts = tick.filter((x) => x.order_id === o.id);
    const mine = !o.waiter_id || o.waiter_id === u.id || can(u, 'tables.manage');
    let state = 'ocupada';
    if (o.status === 'fechamento') state = o.paid_cents > 0 ? 'em_fechamento' : 'aguardando_pagamento';
    else if (ts.some((x) => x.status === 'pronto')) state = 'pedido_pronto';
    else if (ts.length) state = 'em_preparo';
    else if (o.items_count === 0 || pend.some((x) => x.order_id === o.id)) state = 'aguardando_pedido';
    return { ...t, state, order: { id: o.id, number: o.number, guests: o.guests, waiter_id: o.waiter_id, waiter_name: o.waiter_name, created_at: o.created_at, items_count: o.items_count, mine,
      pending_qr: o.pending_qr, called: !!o.waiter_called_at, close_requested: o.close_requested, channel: o.channel,
      ...(mine ? { total_cents: o.total_cents, paid_cents: o.paid_cents } : {}) } };
  });
}));

opsRouter.post('/orders/:id/transfer', requirePerm('tables.manage'), h(async (req) => {
  const p = z.object({ table_id: z.number().int().optional(), waiter_id: z.number().int().optional(), reason: z.string().max(200).default('') }).parse(req.body);
  const out = await req.db.tx(async (q) => {
    const o = await O.getOrder(q, T(req), id(req), true);
    if (o.type !== 'mesa' || !['aberto', 'fechamento'].includes(o.status)) throw conflict('Só mesas abertas podem ser transferidas.');
    const notes: string[] = [];
    if (p.table_id && p.table_id !== o.table_id) {
      const t = await q.get('SELECT * FROM dining_tables WHERE id = $1 AND tenant_id = $2 AND active', [p.table_id, T(req)]);
      if (!t) throw bad('Mesa de destino inválida.');
      if (await q.get("SELECT 1 FROM orders WHERE table_id = $1 AND type='mesa' AND status IN ('aberto','fechamento')", [t.id])) throw conflict(`A mesa ${t.label} está ocupada.`);
      await q.run('UPDATE orders SET table_id = $1 WHERE id = $2', [t.id, o.id]); notes.push(`mesa → ${t.label}`);
    }
    if (p.waiter_id && p.waiter_id !== o.waiter_id) {
      const w = await q.get("SELECT id, name FROM users WHERE id = $1 AND tenant_id = $2 AND active AND role IN ('garcom','gerente','admin','caixa')", [p.waiter_id, T(req)]);
      if (!w) throw bad('Garçom inválido.');
      await q.run('UPDATE orders SET waiter_id = $1 WHERE id = $2', [w.id, o.id]); notes.push(`responsável → ${w.name}`);
    }
    if (!notes.length) throw bad('Nada para transferir.');
    await O.event(q, T(req), o.id, 'transfer', req.user!.id, notes.join('; ') + (p.reason ? ` — ${p.reason}` : ''));
    await audit(q, { tenantId: T(req), userId: req.user!.id, action: 'table.transfer', entity: 'order', entityId: o.id, data: p, reason: p.reason, ip: req.ip });
    return o.id as number;
  });
  broadcast(T(req), 'orders', { orderId: out });
  return O.orderDetail(req.db, T(req), out, req.user);
}));

opsRouter.get('/waiters', requirePerm('tables.use'), h((req) => req.db.all("SELECT id, name FROM users WHERE tenant_id = $1 AND active AND role = 'garcom' ORDER BY name", [T(req)])));

opsRouter.post('/tickets/:id/served', requirePerm('tables.use', 'orders.manage'), h(async (req) => {
  const t = await req.db.get('SELECT * FROM kitchen_tickets WHERE id = $1 AND tenant_id = $2', [id(req), T(req)]);
  if (!t) throw notFound();
  const o = await loadForUser(req, t.order_id);
  O.assertTableAccess(o, req.user!);
  await O.setTicketStatus(req.db, T(req), t.id, 'entregue', req.user!);
  return { ok: true };
}));

// ---------- Cozinha (KDS) ----------
opsRouter.get('/kitchen/tickets', requirePerm('kitchen.use', 'orders.manage'), h(async (req) => {
  const sector = req.query.sector ? String(req.query.sector) : null;
  const history = req.query.history === '1';
  const ts = await req.db.all(`SELECT k.*, o.number, o.type, o.channel, o.priority, o.notes order_notes, o.customer_name, tb.label table_label, w.name waiter_name
    FROM kitchen_tickets k JOIN orders o ON o.id = k.order_id LEFT JOIN dining_tables tb ON tb.id = o.table_id LEFT JOIN users w ON w.id = o.waiter_id
    WHERE k.tenant_id = $1 AND ${history ? "k.status IN ('pronto','entregue','cancelado') AND k.created_at >= $2" : "k.status IN ('novo','preparo','pronto') AND o.status NOT IN ('cancelado','concluido') AND $2 IS NOT NULL"}
    ORDER BY o.priority DESC, k.created_at ${history ? 'DESC' : 'ASC'} LIMIT 200`, [T(req), new Date(Date.now() - 12 * 3600e3).toISOString()]);
  const items = ts.length ? await req.db.all(`SELECT id, ticket_id, name, variant_name, qty, options_json, notes, sector, status, ready_at, source, customer_label FROM order_items WHERE ticket_id IN ($1) ORDER BY id`, [ts.map((t) => t.id)]) : [];
  return ts.map((t) => ({
    id: t.id, order_id: t.order_id, number: t.number, seq: t.seq, type: t.type, channel: t.channel, priority: t.priority, status: t.status,
    table_label: t.table_label, waiter_name: t.waiter_name, customer_first_name: (t.customer_name || '').split(' ')[0] || null,
    created_at: t.created_at, started_at: t.started_at, ready_at: t.ready_at, note: [t.order_notes, t.note].filter(Boolean).join(' · '), question: t.question,
    items: items.filter((i) => i.ticket_id === t.id && (!sector || i.sector === sector)).map((i) => ({ ...i, options: i.options_json, options_json: undefined })),
  })).filter((t) => t.items.length > 0)
    .filter((t) => history || !sector || t.items.some((i: any) => !['pronto', 'entregue', 'cancelado'].includes(i.status)) || t.status === 'pronto');
}));

opsRouter.post('/kitchen/tickets/:id/status', requirePerm('kitchen.use', 'orders.manage'), h(async (req) => {
  const { to, sector } = z.object({ to: z.enum(['preparo', 'pronto']), sector: z.string().max(30).optional() }).parse(req.body);
  await O.setTicketStatus(req.db, T(req), id(req), to, req.user!, sector);
  return { ok: true };
}));
opsRouter.post('/kitchen/items/:id/status', requirePerm('kitchen.use', 'orders.manage'), h(async (req) => {
  const { to } = z.object({ to: z.enum(['preparo', 'pronto']) }).parse(req.body);
  await O.setItemStatus(req.db, T(req), id(req), to, req.user!);
  return { ok: true };
}));
opsRouter.post('/kitchen/tickets/:id/question', requirePerm('kitchen.use', 'orders.manage', 'tables.use'), h(async (req) => {
  const { text } = z.object({ text: z.string().max(200) }).parse(req.body);
  const t = await req.db.get('SELECT * FROM kitchen_tickets WHERE id = $1 AND tenant_id = $2', [id(req), T(req)]);
  if (!t) throw notFound();
  await req.db.run('UPDATE kitchen_tickets SET question = $1 WHERE id = $2', [text.trim() || null, t.id]);
  await O.event(req.db, T(req), t.order_id, text.trim() ? 'kitchen_question' : 'kitchen_answer', req.user!.id, text.trim() || 'Dúvida respondida');
  broadcast(T(req), 'orders', { kind: text.trim() ? 'question' : 'answer', orderId: t.order_id });
  return { ok: true };
}));

// ---------- Motoboy ----------
opsRouter.get('/courier/deliveries', requirePerm('delivery.courier'), h(async (req) => {
  const rows = await req.db.all(`SELECT id, number, status, customer_name, customer_phone, address_json, notes, payment_hint, change_for_cents, total_cents, paid_cents,
      ready_at, dispatched_at, delivered_at, created_at FROM orders WHERE tenant_id = $1 AND courier_id = $2 AND type = 'delivery'
      AND (status IN ('confirmado','em_preparo','pronto','saiu_entrega') OR (status = 'concluido' AND delivered_at >= $3))
      ORDER BY CASE status WHEN 'saiu_entrega' THEN 0 WHEN 'pronto' THEN 1 WHEN 'concluido' THEN 3 ELSE 2 END, created_at`,
  [T(req), req.user!.id, new Date(Date.now() - 12 * 3600e3).toISOString()]);
  const ids = rows.map((r) => r.id);
  const items = ids.length ? await req.db.all(`SELECT order_id, name, variant_name, qty FROM order_items WHERE status <> 'cancelado' AND order_id IN ($1)`, [ids]) : [];
  const picked = ids.length ? await req.db.all(`SELECT DISTINCT order_id FROM order_events WHERE type = 'courier_pickup' AND order_id IN ($1)`, [ids]) : [];
  const me = await req.db.get('SELECT available FROM users WHERE id = $1', [req.user!.id]);
  return { available: !!me.available, deliveries: rows.map((r) => ({ ...r, address: r.address_json, address_json: undefined, picked_up: picked.some((p) => p.order_id === r.id), items: items.filter((i) => i.order_id === r.id) })) };
}));

async function courierOrder(req: Request) {
  const o = await O.getOrder(req.db, T(req), id(req));
  if (o.courier_id !== req.user!.id) throw forbidden('Esta entrega não está atribuída a você.');
  return o;
}
opsRouter.post('/courier/orders/:id/pickup', requirePerm('delivery.courier'), h(async (req) => {
  const o = await courierOrder(req);
  if (o.status !== 'pronto') throw conflict('O pedido ainda não está pronto para coleta.');
  await O.event(req.db, T(req), o.id, 'courier_pickup', req.user!.id, 'Motoboy confirmou a coleta');
  broadcast(T(req), 'orders', { orderId: o.id }); return { ok: true };
}));
opsRouter.post('/courier/orders/:id/dispatch', requirePerm('delivery.courier'), h(async (req) => {
  const o = await courierOrder(req);
  await O.changeStatus(req.db, T(req), o.id, 'saiu_entrega', req.user!, { note: 'Saiu para entrega' });
  return { ok: true };
}));
opsRouter.post('/courier/orders/:id/delivered', requirePerm('delivery.courier'), h(async (req) => {
  const p = z.object({ payments: z.array(z.object({ method: z.string(), amount_cents: z.number().int().min(1), received_cents: z.number().int().nullable().optional() })).max(4).default([]), note: z.string().max(300).optional(), idempotency_key: z.string().max(80).optional() }).parse(req.body);
  const o = await courierOrder(req);
  if (o.status !== 'saiu_entrega') throw conflict('Marque "saiu para entrega" antes de concluir.');
  if (p.payments.length) await C.addPayments(req.db, T(req), o.id, req.user!, p.payments, p.idempotency_key);
  const fresh = await O.recalc(req.db, T(req), o.id);
  if (fresh.paid_cents < fresh.total_cents) throw conflict(`Falta registrar R$ ${((fresh.total_cents - fresh.paid_cents) / 100).toFixed(2).replace('.', ',')} recebido do cliente.`);
  await O.changeStatus(req.db, T(req), o.id, 'concluido', req.user!, { note: p.note ? `Entregue — ${p.note}` : 'Entregue ao cliente' });
  return { ok: true };
}));
opsRouter.post('/courier/orders/:id/failed', requirePerm('delivery.courier'), h(async (req) => {
  const { note } = z.object({ note: z.string().min(3).max(300) }).parse(req.body);
  const o = await courierOrder(req);
  if (o.status !== 'saiu_entrega') throw conflict('A entrega não está em rota.');
  await O.event(req.db, T(req), o.id, 'delivery_failed', req.user!.id, `Tentativa sem sucesso: ${note}`);
  await O.changeStatus(req.db, T(req), o.id, 'pronto', req.user!, { note: `Retornou: ${note}` });
  return { ok: true };
}));
opsRouter.post('/courier/note/:id', requirePerm('delivery.courier'), h(async (req) => {
  const { note } = z.object({ note: z.string().min(1).max(300) }).parse(req.body);
  const o = await courierOrder(req);
  await O.event(req.db, T(req), o.id, 'courier_note', req.user!.id, note);
  broadcast(T(req), 'orders', { orderId: o.id }); return { ok: true };
}));
opsRouter.post('/courier/availability', requirePerm('delivery.courier'), h(async (req) => {
  const { available } = z.object({ available: z.boolean() }).parse(req.body);
  await req.db.run('UPDATE users SET available = $1, updated_at = NOW(3) WHERE id = $2', [available, req.user!.id]);
  broadcast(T(req), 'couriers'); return { ok: true };
}));
