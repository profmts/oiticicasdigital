import type { DB, Q } from '../db.js';
import { bad, conflict, notFound, audit, broadcast, getSetting, forbidden, type SessionUser, can } from '../core.js';
import { getOrder, recalc } from './orders.js';

export const openSessionOf = (q: Q, t: number, userId: number) =>
  q.get("SELECT * FROM cash_sessions WHERE tenant_id = $1 AND user_id = $2 AND status = 'aberto'", [t, userId]);

export async function sessionSummary(q: Q, t: number, id: number) {
  const s = await q.get('SELECT cs.*, u.name user_name FROM cash_sessions cs JOIN users u ON u.id = cs.user_id WHERE cs.id = $1 AND cs.tenant_id = $2', [id, t]);
  if (!s) throw notFound('Caixa não encontrado.');
  const byMethod = await q.all('SELECT method, COUNT(*) n, SUM(amount_cents) total FROM payments WHERE cash_session_id = $1 AND NOT voided GROUP BY method', [id]);
  const voided = await q.get('SELECT COUNT(*) n, COALESCE(SUM(amount_cents),0) total FROM payments WHERE cash_session_id = $1 AND voided', [id]);
  const movs = await q.all('SELECT m.*, u.name user_name FROM cash_movements m JOIN users u ON u.id = m.user_id WHERE session_id = $1 ORDER BY m.id', [id]);
  const sangria = movs.filter((m) => m.type === 'sangria').reduce((a, m) => a + m.amount_cents, 0);
  const suprimento = movs.filter((m) => m.type === 'suprimento').reduce((a, m) => a + m.amount_cents, 0);
  const cash = byMethod.find((m) => m.method === 'dinheiro')?.total || 0;
  const expectedCash = s.opening_cents + cash + suprimento - sangria;
  const payments = await q.all(`SELECT p.id, p.order_id, o.number, p.method, p.amount_cents, p.received_cents, p.change_cents, p.created_at, p.voided, p.void_reason, p.collected_by
     FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.cash_session_id = $1 ORDER BY p.id DESC`, [id]);
  return { ...s, byMethod, voided, movements: movs, sangria_cents: sangria, suprimento_cents: suprimento, cash_sales_cents: cash,
    expected_cash_cents: s.status === 'fechado' ? s.expected_cash_cents : expectedCash, total_received_cents: byMethod.reduce((a, m) => a + m.total, 0), payments };
}

export async function openCash(db: DB, t: number, user: SessionUser, openingCents: number, ip?: string) {
  if (!(openingCents >= 0)) throw bad('Informe o fundo de troco (pode ser zero).');
  return db.tx(async (q) => {
    if (await openSessionOf(q, t, user.id)) throw conflict('Você já tem um caixa aberto.');
    const id = (await q.get('INSERT INTO cash_sessions (tenant_id, user_id, opening_cents) VALUES ($1,$2,$3) RETURNING id', [t, user.id, Math.round(openingCents)])).id;
    await audit(q, { tenantId: t, userId: user.id, action: 'cash.open', entity: 'cash_session', entityId: id, data: { opening_cents: openingCents }, ip });
    return sessionSummary(q, t, id);
  });
}

export async function cashMovement(db: DB, t: number, user: SessionUser, type: 'sangria' | 'suprimento', amountCents: number, reason: string, ip?: string) {
  if (!(amountCents > 0)) throw bad('Valor inválido.');
  if (!reason || reason.trim().length < 3) throw bad('Informe o motivo.');
  return db.tx(async (q) => {
    const s = await openSessionOf(q, t, user.id);
    if (!s) throw conflict('Abra o caixa primeiro.');
    if (type === 'sangria' && amountCents > (await sessionSummary(q, t, s.id)).expected_cash_cents) throw bad('Sangria maior que o dinheiro esperado na gaveta.');
    const id = (await q.get('INSERT INTO cash_movements (tenant_id, session_id, type, amount_cents, reason, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [t, s.id, type, Math.round(amountCents), reason, user.id])).id;
    await audit(q, { tenantId: t, userId: user.id, action: `cash.${type}`, entity: 'cash_session', entityId: s.id, data: { amount_cents: amountCents, movement_id: id }, reason, ip });
    return sessionSummary(q, t, s.id);
  });
}

export async function closeCash(db: DB, t: number, user: SessionUser, countedCents: number, notes: string, ip?: string) {
  if (!(countedCents >= 0)) throw bad('Informe o valor contado em dinheiro.');
  return db.tx(async (q) => {
    const s = await openSessionOf(q, t, user.id);
    if (!s) throw conflict('Você não tem caixa aberto.');
    const sum = await sessionSummary(q, t, s.id);
    const diff = Math.round(countedCents) - sum.expected_cash_cents;
    await q.run(`UPDATE cash_sessions SET status='fechado', closed_at=NOW(3), closed_by=$1, expected_cash_cents=$2, counted_cash_cents=$3, difference_cents=$4, summary_json=$5, notes=$6 WHERE id=$7`,
      [user.id, sum.expected_cash_cents, Math.round(countedCents), diff, JSON.stringify({ byMethod: sum.byMethod, sangria: sum.sangria_cents, suprimento: sum.suprimento_cents, total: sum.total_received_cents }), notes || null, s.id]);
    await audit(q, { tenantId: t, userId: user.id, action: 'cash.close', entity: 'cash_session', entityId: s.id, data: { expected: sum.expected_cash_cents, counted: countedCents, difference: diff }, reason: notes, ip });
    return sessionSummary(q, t, s.id);
  });
}

const methodIds = async (q: Q, t: number) => ((await getSetting<any[]>(q, t, 'payment_methods')) || []).filter((m) => m.active).map((m) => m.id as string);

/**
 * Registra recebimento confirmado pelo operador — nada é marcado como pago sozinho.
 * Caixa: precisa de caixa aberto. Motoboy: fica "aguardando acerto" até o caixa conferir.
 */
export async function addPayments(db: DB, t: number, orderId: number, user: SessionUser, list: { method: string; amount_cents: number; received_cents?: number | null }[], key?: string) {
  const dupKey = key ? `${key}:0` : null;
  if (dupKey) {
    const ex = await db.get('SELECT order_id FROM payments WHERE tenant_id = $1 AND idempotency_key = $2', [t, dupKey]);
    if (ex) return recalc(db, t, ex.order_id);
  }
  const out = await db.tx(async (q) => {
    await getOrder(q, t, orderId, true);
    const o = await recalc(q, t, orderId);
    if (o.status === 'cancelado') throw conflict('Pedido cancelado.');
    if (o.status === 'aguardando_confirmacao') throw conflict('Confirme o pedido antes de registrar pagamento.');
    if (o.type === 'delivery' && o.delivery_fee_cents === null) throw conflict('Defina a taxa de entrega antes de receber.');
    if (!Array.isArray(list) || list.length === 0) throw bad('Informe ao menos uma forma de pagamento.');
    const isCourier = user.role === 'motoboy';
    let session: any = null;
    if (isCourier) { if (o.courier_id !== user.id) throw forbidden('Esta entrega não está atribuída a você.'); }
    else { session = await openSessionOf(q, t, user.id); if (!session) throw conflict('Abra o seu caixa antes de registrar recebimentos.'); }
    const valid = await methodIds(q, t);
    let balance = o.total_cents - o.paid_cents;
    if (balance <= 0) throw conflict('Este pedido já está quitado.');
    for (const [idx, p] of list.entries()) {
      if (!valid.includes(p.method)) throw bad(`Forma de pagamento inválida: ${p.method}`);
      const amount = Math.round(p.amount_cents);
      if (!(amount > 0)) throw bad('Valor de pagamento inválido.');
      if (amount > balance) throw bad('Valor maior que o saldo do pedido. Para troco, informe o valor recebido em dinheiro.');
      let received: number | null = null; let change = 0;
      if (p.method === 'dinheiro' && p.received_cents != null) {
        received = Math.round(p.received_cents);
        if (received < amount) throw bad('Valor recebido em dinheiro menor que o valor a pagar.');
        change = received - amount;
      }
      await q.run(`INSERT INTO payments (tenant_id, order_id, method, amount_cents, received_cents, change_cents, cash_session_id, collected_by, user_id, idempotency_key, settled_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [t, orderId, p.method, amount, received, change, session?.id ?? null, isCourier ? user.id : null, user.id, key ? `${key}:${idx}` : null, session ? new Date().toISOString() : null]);
      balance -= amount;
    }
    await q.run('INSERT INTO order_events (tenant_id, order_id, type, user_id, note) VALUES ($1,$2,$3,$4,$5)',
      [t, orderId, 'payment', user.id, list.map((p) => `${p.method}: R$ ${(p.amount_cents / 100).toFixed(2)}`).join(' + ') + (isCourier ? ' (recebido pelo motoboy, aguardando acerto)' : '')]);
    return recalc(q, t, orderId);
  });
  broadcast(t, 'orders', { orderId, kind: 'payment' });
  broadcast(t, 'cash');
  return out;
}

export async function voidPayment(db: DB, t: number, paymentId: number, user: SessionUser, reason: string, authorizedBy: number, ip?: string) {
  if (!reason || reason.trim().length < 3) throw bad('Informe o motivo do estorno.');
  const out = await db.tx(async (q) => {
    const p = await q.get('SELECT * FROM payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [paymentId, t]);
    if (!p) throw notFound('Pagamento não encontrado.');
    if (p.voided) throw conflict('Pagamento já estornado.');
    if (p.cash_session_id) {
      const s = await q.get('SELECT status FROM cash_sessions WHERE id = $1', [p.cash_session_id]);
      if (s.status === 'fechado') throw conflict('O caixa deste pagamento já foi fechado. Registre o estorno como despesa/ajuste no financeiro.');
    }
    await q.run('UPDATE payments SET voided=true, voided_by=$1, voided_at=NOW(3), void_reason=$2 WHERE id=$3', [user.id, reason, paymentId]);
    await q.run('INSERT INTO order_events (tenant_id, order_id, type, user_id, note) VALUES ($1,$2,$3,$4,$5)', [t, p.order_id, 'payment_void', user.id, `Estorno ${p.method} R$ ${(p.amount_cents / 100).toFixed(2)} — ${reason}`]);
    await audit(q, { tenantId: t, userId: user.id, action: 'payment.void', entity: 'order', entityId: p.order_id, data: { payment_id: p.id, method: p.method, amount_cents: p.amount_cents }, reason, authorizedBy, ip });
    const o = await getOrder(q, t, p.order_id);
    if (o.status === 'concluido') await q.run('UPDATE orders SET receivable = true WHERE id = $1', [o.id]);
    return recalc(q, t, p.order_id);
  });
  broadcast(t, 'orders', { orderId: out.id });
  broadcast(t, 'cash');
  return out;
}

export async function settleCourierPayments(db: DB, t: number, user: SessionUser, paymentIds: number[], ip?: string) {
  const out = await db.tx(async (q) => {
    const s = await openSessionOf(q, t, user.id);
    if (!s) throw conflict('Abra o seu caixa antes do acerto.');
    if (!can(user, 'cash.operate')) throw forbidden();
    const r = await q.run('UPDATE payments SET cash_session_id = $1, settled_at = NOW(3) WHERE tenant_id = $2 AND id IN ($3) AND cash_session_id IS NULL AND NOT voided', [s.id, t, paymentIds]);
    await audit(q, { tenantId: t, userId: user.id, action: 'cash.settle_courier', entity: 'cash_session', entityId: s.id, data: { payment_ids: paymentIds, settled: r.rowCount }, ip });
    return sessionSummary(q, t, s.id);
  });
  broadcast(t, 'cash');
  return out;
}

export const pendingCourierPayments = (q: Q, t: number) => q.all(`SELECT p.id, p.order_id, o.number, p.method, p.amount_cents, p.received_cents, p.change_cents, p.created_at, u.name courier_name, u.id courier_id
  FROM payments p JOIN orders o ON o.id = p.order_id JOIN users u ON u.id = p.collected_by
  WHERE p.tenant_id = $1 AND p.cash_session_id IS NULL AND NOT p.voided ORDER BY u.name, p.id`, [t]);
