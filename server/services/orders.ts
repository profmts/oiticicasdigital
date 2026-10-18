import type { DB, Q } from '../db.js';
import { nowIso } from '../db.js';
import { bad, conflict, notFound, forbidden, randomToken, audit, broadcast, getSetting, digits, type SessionUser, can } from '../core.js';

export type OrderType = 'delivery' | 'retirada' | 'mesa' | 'balcao';
export type Channel = 'cardapio' | 'qrcode' | 'pdv' | 'garcom' | 'whatsapp' | 'telefone';

export const STATUS_LABELS: Record<string, string> = {
  aguardando_confirmacao: 'Aguardando confirmação', confirmado: 'Confirmado — aguardando preparo', em_preparo: 'Em preparo', pronto: 'Pronto',
  saiu_entrega: 'Saiu para entrega', concluido: 'Concluído', cancelado: 'Cancelado', aberto: 'Mesa aberta', fechamento: 'Conta solicitada',
};

const FLOW: Record<string, string[]> = {
  aguardando_confirmacao: ['confirmado', 'cancelado'],
  confirmado: ['em_preparo', 'pronto', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto: ['saiu_entrega', 'concluido', 'em_preparo', 'cancelado'],
  saiu_entrega: ['concluido', 'pronto', 'cancelado'],
  aberto: ['fechamento', 'concluido', 'cancelado'],
  fechamento: ['aberto', 'concluido', 'cancelado'],
  concluido: [], cancelado: [],
};

export function canTransition(order: { type: string; status: string }, to: string) {
  if (!(FLOW[order.status] || []).includes(to)) return false;
  if (to === 'saiu_entrega' && order.type !== 'delivery') return false;
  if (order.type === 'mesa' && !['aberto', 'fechamento', 'concluido', 'cancelado'].includes(to)) return false;
  if (order.type !== 'mesa' && ['aberto', 'fechamento'].includes(to)) return false;
  return true;
}

export interface ItemInput { variant_id: number; qty: number; option_ids?: number[]; notes?: string }
interface PricedItem {
  product_id: number; variant_id: number; name: string; variant_name: string; category_name: string; sector: string;
  unit_price_cents: number; options: { id: number; group: string; name: string; price_cents: number }[]; options_cents: number;
  qty: number; total_cents: number; notes: string;
}

/** Preços SEMPRE calculados no servidor, a partir do cadastro da empresa. */
export async function priceItems(q: Q, t: number, items: ItemInput[], type: OrderType, opts: { online?: boolean } = {}): Promise<PricedItem[]> {
  if (!Array.isArray(items) || items.length === 0) throw bad('Adicione pelo menos um item.');
  if (items.length > 100) throw bad('Itens demais em um único pedido.');
  const out: PricedItem[] = [];
  for (const it of items) {
    const qty = Math.floor(Number(it.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) throw bad('Quantidade inválida.');
    const v = await q.get(`SELECT v.id, v.name vname, v.price_cents, v.active vactive, v.order_types vtypes,
        p.id pid, p.name, p.active pactive, p.online, p.order_types ptypes, COALESCE(p.sector, c.sector) sector, c.name cname, c.active cactive
      FROM product_variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
      WHERE v.id = $1 AND v.tenant_id = $2`, [Number(it.variant_id), t]);
    if (!v || !v.vactive || !v.pactive || !v.cactive) throw bad('Um dos produtos não está mais disponível. Atualize o cardápio.');
    if (opts.online && !v.online) throw bad(`${v.name} não está disponível no cardápio digital.`);
    if (!String(v.vtypes || v.ptypes || '').split(',').includes(type)) throw bad(`${v.name}${v.vname !== 'Único' ? ` (${v.vname})` : ''} não está disponível para este tipo de pedido.`);
    const groups = await q.all('SELECT id, name, min_select, max_select FROM option_groups WHERE product_id = $1', [v.pid]);
    const optIds = [...new Set((it.option_ids || []).map(Number))];
    const chosen = optIds.length ? await q.all('SELECT id, name, price_cents, active, group_id FROM options WHERE id IN ($1) AND tenant_id = $2', [optIds, t]) : [];
    if (chosen.length !== optIds.length) throw bad(`Opção inválida para ${v.name}.`);
    for (const o of chosen) if (!o.active || !groups.some((g) => g.id === o.group_id)) throw bad(`Opção inválida para ${v.name}.`);
    for (const g of groups) {
      const n = chosen.filter((o) => o.group_id === g.id).length;
      if (n < g.min_select) throw bad(`Escolha ${g.name.toLowerCase()} para ${v.name}.`);
      if (n > g.max_select) throw bad(`Máximo de ${g.max_select} opção(ões) em ${g.name} para ${v.name}.`);
    }
    const options = chosen.map((o) => ({ id: o.id, group: groups.find((g) => g.id === o.group_id).name, name: o.name, price_cents: o.price_cents }));
    const options_cents = options.reduce((s, o) => s + o.price_cents, 0);
    out.push({
      product_id: v.pid, variant_id: v.id, name: v.name, variant_name: v.vname === 'Único' ? '' : v.vname, category_name: v.cname, sector: v.sector,
      unit_price_cents: v.price_cents, options, options_cents, qty, total_cents: (v.price_cents + options_cents) * qty, notes: String(it.notes || '').slice(0, 200).trim(),
    });
  }
  return out;
}

export async function getOrder(q: Q, t: number, id: number, lock = false) {
  const o = await q.get(`SELECT * FROM orders WHERE id = $1 AND tenant_id = $2 ${lock ? 'FOR UPDATE' : ''}`, [id, t]);
  if (!o) throw notFound('Pedido não encontrado.');
  return o;
}

export async function recalc(q: Q, t: number, orderId: number) {
  const o = await getOrder(q, t, orderId);
  const sub = (await q.get("SELECT COALESCE(SUM(total_cents),0) s FROM order_items WHERE order_id = $1 AND status <> 'cancelado'", [orderId])).s;
  const discount = Math.min(o.discount_cents, sub);
  const total = sub - discount + (o.delivery_fee_cents || 0);
  const paid = (await q.get('SELECT COALESCE(SUM(amount_cents),0) s FROM payments WHERE order_id = $1 AND NOT voided', [orderId])).s;
  const ps = paid <= 0 ? 'pendente' : paid >= total ? 'pago' : 'parcial';
  await q.run('UPDATE orders SET subtotal_cents=$1, discount_cents=$2, total_cents=$3, paid_cents=$4, payment_status=$5, updated_at=NOW(3) WHERE id=$6', [sub, discount, total, paid, ps, orderId]);
  return getOrder(q, t, orderId);
}

export async function event(q: Q, t: number, orderId: number, type: string, userId: number | null, note?: string | null, from?: string | null, to?: string | null) {
  await q.run('INSERT INTO order_events (tenant_id, order_id, type, from_status, to_status, user_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [t, orderId, type, from ?? null, to ?? null, userId, note ?? null]);
}

async function insertItems(q: Q, t: number, orderId: number, items: PricedItem[], userId: number | null, source: 'equipe' | 'cliente' = 'equipe', customerLabel: string | null = null) {
  for (const i of items) {
    await q.run(`INSERT INTO order_items (tenant_id, order_id, product_id, variant_id, name, variant_name, category_name, sector, unit_price_cents,
      options_json, options_cents, qty, total_cents, notes, created_by, source, customer_label) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [t, orderId, i.product_id, i.variant_id, i.name, i.variant_name, i.category_name, i.sector, i.unit_price_cents,
      JSON.stringify(i.options.map(({ group, name, price_cents }) => ({ group, name, price_cents }))), i.options_cents, i.qty, i.total_cents, i.notes, userId, source, customerLabel]);
  }
}

/** Cria um ticket de cozinha com todos os itens ainda não enviados do pedido. */
export async function sendPendingToKitchen(q: Q, t: number, orderId: number, userId: number | null, note = '') {
  const pending = await q.all("SELECT id FROM order_items WHERE order_id = $1 AND status = 'pendente'", [orderId]);
  if (pending.length === 0) return null;
  const seq = (await q.get('SELECT COALESCE(MAX(seq),0) m FROM kitchen_tickets WHERE order_id = $1', [orderId])).m + 1;
  const tid = (await q.get('INSERT INTO kitchen_tickets (tenant_id, order_id, seq, note, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [t, orderId, seq, note, userId])).id;
  await q.run("UPDATE order_items SET status = 'enviado', ticket_id = $1 WHERE order_id = $2 AND status = 'pendente'", [tid, orderId]);
  await event(q, t, orderId, 'kitchen_sent', userId, `Rodada ${seq}: ${pending.length} item(ns) enviados para a cozinha`);
  return tid as number;
}

async function nextNumber(q: Q, t: number) {
  // LAST_INSERT_ID(expr) guarda o novo número só nesta conexão: seguro com vários pedidos ao mesmo tempo
  await q.run('UPDATE tenants SET order_seq = LAST_INSERT_ID(order_seq + 1) WHERE id = $1', [t]);
  return (await q.get('SELECT LAST_INSERT_ID() AS n')).n as number;
}

export interface CreateOrderInput {
  channel: Channel; type: OrderType; items: ItemInput[]; idempotency_key?: string;
  customer_name?: string; customer_phone?: string; save_address?: boolean;
  address?: { street?: string; number?: string; complement?: string; neighborhood?: string; reference?: string };
  delivery_zone_id?: number | null; payment_hint?: string; change_for_cents?: number | null; notes?: string;
  table_id?: number; guests?: number; send_to_kitchen?: boolean; delivery_fee_cents?: number | null;
}

const isUnique = (e: any) => e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062;

export async function createOrder(db: DB, t: number, input: CreateOrderInput, user: SessionUser | null) {
  const findDup = async () => input.idempotency_key ? db.get('SELECT id FROM orders WHERE tenant_id = $1 AND idempotency_key = $2', [t, input.idempotency_key]) : undefined;
  const dup = await findDup();
  if (dup) return { order: await getOrder(db, t, dup.id), duplicate: true };
  let order: any;
  try {
    order = await db.tx(async (q) => {
      const online = input.channel === 'cardapio' || input.channel === 'qrcode';
      const type = input.type;
      if (!['delivery', 'retirada', 'mesa', 'balcao'].includes(type)) throw bad('Tipo de pedido inválido.');
      if (input.channel === 'cardapio') {
        if (!(await getSetting(q, t, 'is_open'))) throw conflict((await getSetting(q, t, 'closed_message')) || 'Estamos fechados no momento.');
        if (type === 'delivery' && !(await getSetting(q, t, 'accept_delivery'))) throw bad('Delivery indisponível no momento.');
        if (type === 'retirada' && !(await getSetting(q, t, 'accept_pickup'))) throw bad('Retirada indisponível no momento.');
        if (!['delivery', 'retirada'].includes(type)) throw bad('Tipo de pedido inválido.');
      }
      const items = type === 'mesa' && (!input.items || input.items.length === 0) ? [] : await priceItems(q, t, input.items, type, { online });
      const subtotal = items.reduce((s, i) => s + i.total_cents, 0);

      const phone = digits(input.customer_phone);
      const name = String(input.customer_name || '').trim().slice(0, 80);
      if (online && name.length < 2) throw bad('Informe seu nome.');
      if (input.channel === 'cardapio' || type === 'delivery') {
        if (phone.length < 10 || phone.length > 13) throw bad('Informe um telefone/WhatsApp válido com DDD.');
      }

      let address: any = null; let zoneId: number | null = null; let fee: number | null = null;
      if (type === 'delivery') {
        const a = input.address || {};
        address = {
          street: String(a.street || '').trim().slice(0, 120), number: String(a.number || '').trim().slice(0, 20),
          complement: String(a.complement || '').trim().slice(0, 80), neighborhood: String(a.neighborhood || '').trim().slice(0, 80),
          reference: String(a.reference || '').trim().slice(0, 120),
        };
        if (address.street.length < 3) throw bad('Informe a rua do endereço de entrega.');
        if (input.delivery_zone_id) {
          const z = await q.get('SELECT * FROM delivery_zones WHERE id = $1 AND tenant_id = $2 AND active', [input.delivery_zone_id, t]);
          if (!z) throw bad('Bairro de entrega inválido.');
          zoneId = z.id; fee = z.fee_cents; address.neighborhood = z.name;
          const min = z.min_order_cents ?? (await getSetting<number>(q, t, 'min_order_cents')) ?? 0;
          if (online && min > 0 && subtotal < min) throw bad(`Pedido mínimo para ${z.name}: R$ ${(min / 100).toFixed(2).replace('.', ',')}.`);
        } else {
          if (online && !(await getSetting(q, t, 'allow_unlisted_neighborhood'))) throw bad('Selecione um bairro atendido.');
          if (address.neighborhood.length < 2) throw bad('Informe o bairro.');
          fee = online ? null : (input.delivery_fee_cents ?? null);
        }
      }
      const minGeneral = (await getSetting<number>(q, t, 'min_order_cents')) || 0;
      if (input.channel === 'cardapio' && !zoneId && minGeneral > 0 && subtotal < minGeneral) throw bad(`Pedido mínimo: R$ ${(minGeneral / 100).toFixed(2).replace('.', ',')}.`);

      let tableId: number | null = null;
      if (type === 'mesa') {
        const tb = await q.get('SELECT * FROM dining_tables WHERE id = $1 AND tenant_id = $2 AND active', [input.table_id, t]);
        if (!tb) throw bad('Mesa inválida.');
        if (await q.get("SELECT id FROM orders WHERE table_id = $1 AND type = 'mesa' AND status IN ('aberto','fechamento') FOR UPDATE", [tb.id])) throw conflict(`A mesa ${tb.label} já está aberta.`);
        tableId = tb.id;
      }

      let customerId: number | null = null;
      if (phone.length >= 10) {
        const c = await q.run(`INSERT INTO customers (tenant_id, name, phone, save_address) VALUES ($1,$2,$3,$4)
          ON DUPLICATE KEY UPDATE name = IF(VALUES(name) = '', name, VALUES(name)), id = LAST_INSERT_ID(id)`, [t, name || '', phone, !!input.save_address]);
        customerId = c.insertId;
        if (input.save_address && address) {
          await q.run('UPDATE customers SET save_address = true WHERE id = $1', [customerId]);
          if (!(await q.get('SELECT id FROM customer_addresses WHERE customer_id=$1 AND street=$2 AND number=$3', [customerId, address.street, address.number]))) {
            await q.run('INSERT INTO customer_addresses (tenant_id, customer_id, street, number, complement, neighborhood, reference) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [t, customerId, address.street, address.number, address.complement, address.neighborhood, address.reference]);
          }
        }
      }

      const status = online ? 'aguardando_confirmacao' : type === 'mesa' ? 'aberto' : 'confirmado';
      const number = await nextNumber(q, t);
      const est = type === 'delivery' ? await getSetting(q, t, 'delivery_estimate_minutes') : type === 'retirada' ? await getSetting(q, t, 'pickup_estimate_minutes') : null;
      const paymentHint = input.payment_hint ? String(input.payment_hint).slice(0, 40) : null;
      if (online && paymentHint) {
        const methods = ((await getSetting<any[]>(q, t, 'payment_methods')) || []).filter((m) => m.active && m.online).map((m) => m.id);
        if (!methods.includes(paymentHint)) throw bad('Forma de pagamento indisponível.');
      }
      const r = await q.get(`INSERT INTO orders (tenant_id, number, public_token, idempotency_key, channel, type, status, table_id, guests, waiter_id, customer_id,
          customer_name, customer_phone, address_json, delivery_zone_id, delivery_fee_cents, payment_hint, change_for_cents, notes, estimated_minutes, created_by, confirmed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id`, [
        t, number, randomToken(18), input.idempotency_key || null, input.channel, type, status, tableId,
        type === 'mesa' ? Math.max(1, Math.min(50, Number(input.guests) || 1)) : null,
        type === 'mesa' && user?.role !== undefined ? user.id : null, customerId, name || null, phone || null,
        address ? JSON.stringify(address) : null, zoneId, fee, paymentHint,
        input.change_for_cents && input.change_for_cents > 0 ? Math.round(input.change_for_cents) : null,
        String(input.notes || '').slice(0, 300), est ?? null, user?.id ?? null, status === 'confirmado' ? nowIso() : null,
      ]);
      const orderId = r.id as number;
      await insertItems(q, t, orderId, items, user?.id ?? null, user ? 'equipe' : 'cliente', user ? null : name || null);
      await event(q, t, orderId, 'created', user?.id ?? null, `Pedido criado (${input.channel})`, null, status);
      if (status === 'confirmado' && input.send_to_kitchen !== false) await sendPendingToKitchen(q, t, orderId, user?.id ?? null);
      if (status === 'confirmado' && input.send_to_kitchen === false) {
        await q.run("UPDATE order_items SET status='entregue' WHERE order_id=$1 AND status='pendente'", [orderId]);
        await q.run("UPDATE orders SET status='pronto', ready_at=NOW(3) WHERE id=$1", [orderId]);
        await event(q, t, orderId, 'status', user?.id ?? null, 'Venda direta sem preparo', 'confirmado', 'pronto');
      }
      return recalc(q, t, orderId);
    });
  } catch (e) {
    if (isUnique(e)) { const d = await findDup(); if (d) return { order: await getOrder(db, t, d.id), duplicate: true }; }
    throw e;
  }
  broadcast(t, 'orders', { kind: 'new', orderId: order.id, channel: order.channel, type: order.type });
  return { order, duplicate: false };
}

export function assertTableAccess(o: any, user: SessionUser) {
  if (o.type === 'mesa' && user.role === 'garcom' && !can(user, 'tables.manage') && o.waiter_id && o.waiter_id !== user.id) {
    throw forbidden('Esta mesa está sob responsabilidade de outro garçom.');
  }
}

export async function addItems(db: DB, t: number, orderId: number, items: ItemInput[], user: SessionUser, send: boolean) {
  const out = await db.tx(async (q) => {
    const o = await getOrder(q, t, orderId, true);
    if (['concluido', 'cancelado'].includes(o.status)) throw conflict('Pedido já finalizado.');
    if (o.type !== 'mesa' && !['confirmado', 'aguardando_confirmacao'].includes(o.status)) throw conflict('Só é possível incluir itens em pedidos que ainda não entraram em preparo.');
    assertTableAccess(o, user);
    const priced = await priceItems(q, t, items, o.type);
    await insertItems(q, t, orderId, priced, user.id);
    if (o.type === 'mesa' && !o.waiter_id && user.role === 'garcom') await q.run('UPDATE orders SET waiter_id = $1 WHERE id = $2', [user.id, orderId]);
    await event(q, t, orderId, 'items_added', user.id, priced.map((i) => `${i.qty}x ${i.name}${i.variant_name ? ' ' + i.variant_name : ''}`).join(', '));
    if (o.status === 'fechamento') {
      await q.run("UPDATE orders SET status='aberto', close_requested=false WHERE id=$1", [orderId]);
      await event(q, t, orderId, 'status', user.id, 'Novos itens: conta reaberta', 'fechamento', 'aberto');
    }
    if (send && o.status !== 'aguardando_confirmacao') await sendPendingToKitchen(q, t, orderId, user.id);
    return recalc(q, t, orderId);
  });
  broadcast(t, 'orders', { orderId });
  return out;
}

/**
 * Pedido presencial pelo QR Code da mesa (cliente, sem login).
 * Abre a comanda da mesa se ainda não existir. Os itens vão direto para a cozinha
 * apenas se a empresa ativar "enviar automaticamente"; senão aguardam a confirmação da equipe.
 */
export async function selfOrderTable(db: DB, t: number, table: any, items: ItemInput[], customerName: string, notes: string, key: string) {
  const res = await db.tx(async (q) => {
    if (await q.get("SELECT 1 FROM order_events WHERE tenant_id = $1 AND type = 'qr_order' AND note LIKE $2", [t, `%[${key}]%`])) return { duplicate: true, orderId: null as number | null, sent: false };
    const priced = await priceItems(q, t, items, 'mesa', { online: true });
    let o = await q.get("SELECT * FROM orders WHERE table_id = $1 AND tenant_id = $2 AND type='mesa' AND status IN ('aberto','fechamento') FOR UPDATE", [table.id, t]);
    if (!o) {
      const number = await nextNumber(q, t);
      const ins = await q.run(`INSERT INTO orders (tenant_id, number, public_token, channel, type, status, table_id, guests) VALUES ($1,$2,$3,'qrcode','mesa','aberto',$4,1)`,
        [t, number, randomToken(18), table.id]);
      o = await getOrder(q, t, ins.insertId);
      await event(q, t, o.id, 'created', null, `Mesa ${table.label} aberta pelo QR Code`, null, 'aberto');
    } else if (o.status === 'fechamento') {
      await q.run("UPDATE orders SET status='aberto', close_requested=false WHERE id=$1", [o.id]);
      await event(q, t, o.id, 'status', null, 'Cliente pediu mais itens pelo QR: conta reaberta', 'fechamento', 'aberto');
    }
    const label = customerName.trim().slice(0, 40) || null;
    await insertItems(q, t, o.id, priced, null, 'cliente', label);
    await event(q, t, o.id, 'qr_order', null, `${label || 'Cliente'} pediu pelo QR: ${priced.map((i) => `${i.qty}x ${i.name}`).join(', ')}${notes ? ` — Obs.: ${notes}` : ''} [${key}]`);
    const auto = await getSetting<boolean>(q, t, 'self_order_auto_kitchen');
    if (auto) await sendPendingToKitchen(q, t, o.id, null, notes ? `Cliente: ${notes}` : '');
    await recalc(q, t, o.id);
    return { duplicate: false, orderId: o.id as number, sent: !!auto };
  });
  if (!res.duplicate) broadcast(t, 'orders', { kind: 'qr_order', orderId: res.orderId, table: table.label });
  return res;
}

export async function sendToKitchen(db: DB, t: number, orderId: number, user: SessionUser) {
  const out = await db.tx(async (q) => {
    const o = await getOrder(q, t, orderId, true);
    assertTableAccess(o, user);
    if (['concluido', 'cancelado', 'aguardando_confirmacao'].includes(o.status)) throw conflict('Pedido não pode ser enviado para a cozinha agora.');
    if (!(await sendPendingToKitchen(q, t, orderId, user.id))) throw bad('Não há itens novos para enviar.');
    return recalc(q, t, orderId);
  });
  broadcast(t, 'orders', { orderId, kind: 'kitchen' });
  return out;
}

export async function cancelItem(db: DB, t: number, itemId: number, user: SessionUser, reason: string, authorizedBy: number | null, ip?: string) {
  const out = await db.tx(async (q) => {
    const it = await q.get('SELECT * FROM order_items WHERE id = $1 AND tenant_id = $2', [itemId, t]);
    if (!it) throw notFound('Item não encontrado.');
    if (it.status === 'cancelado') throw conflict('Item já cancelado.');
    const o = await getOrder(q, t, it.order_id, true);
    if (['concluido', 'cancelado'].includes(o.status)) throw conflict('Pedido finalizado: itens não podem ser alterados.');
    assertTableAccess(o, user);
    if (it.status !== 'pendente' && !authorizedBy) throw forbidden('Item já enviado para a cozinha: cancelamento precisa de autorização.');
    if (!reason || reason.trim().length < 3) throw bad('Informe o motivo do cancelamento.');
    await q.run("UPDATE order_items SET status='cancelado', canceled_by=$1, canceled_at=NOW(3), cancel_reason=$2 WHERE id=$3", [user.id, reason, itemId]);
    await event(q, t, o.id, 'item_canceled', user.id, `${it.qty}x ${it.name} — ${reason}`);
    await audit(q, { tenantId: t, userId: user.id, action: 'item.cancel', entity: 'order', entityId: o.id, data: { item: it.name, qty: it.qty, total_cents: it.total_cents, was: it.status }, reason, authorizedBy, ip });
    if (it.ticket_id) await syncTicket(q, t, it.ticket_id, user.id);
    const after = await recalc(q, t, o.id);
    if (after.paid_cents > after.total_cents) throw conflict('O valor já pago ficaria maior que o total. Estorne o pagamento antes de cancelar o item.');
    return after;
  });
  broadcast(t, 'orders', { orderId: out.id });
  return out;
}

export async function syncTicket(q: Q, t: number, ticketId: number, userId: number | null) {
  const tk = await q.get('SELECT * FROM kitchen_tickets WHERE id = $1', [ticketId]);
  const items = await q.all("SELECT status FROM order_items WHERE ticket_id = $1 AND status <> 'cancelado'", [ticketId]);
  let status = tk.status;
  if (items.length === 0) status = 'cancelado';
  else if (items.every((i) => i.status === 'entregue')) status = 'entregue';
  else if (items.every((i) => ['pronto', 'entregue'].includes(i.status))) status = 'pronto';
  else if (items.some((i) => ['preparo', 'pronto'].includes(i.status)) && tk.status === 'novo') status = 'preparo';
  if (status !== tk.status) {
    const col = status === 'pronto' ? ', ready_at = NOW(3)' : status === 'preparo' ? ', started_at = COALESCE(started_at, NOW(3))' : status === 'entregue' ? ', served_at = NOW(3)' : '';
    await q.run(`UPDATE kitchen_tickets SET status = $1 ${col} WHERE id = $2`, [status, ticketId]);
  }
  await syncOrderFromTickets(q, t, tk.order_id, userId);
}

async function syncOrderFromTickets(q: Q, t: number, orderId: number, userId: number | null) {
  const o = await getOrder(q, t, orderId);
  if (o.type === 'mesa' || !['confirmado', 'em_preparo'].includes(o.status)) return;
  const ts = await q.all("SELECT status FROM kitchen_tickets WHERE order_id = $1 AND status <> 'cancelado'", [orderId]);
  if (ts.length === 0) return;
  if (ts.every((x) => ['pronto', 'entregue'].includes(x.status))) await setStatusRaw(q, t, o, 'pronto', userId, 'Cozinha marcou como pronto');
  else if (o.status === 'confirmado' && ts.some((x) => x.status !== 'novo')) await setStatusRaw(q, t, o, 'em_preparo', userId, 'Cozinha iniciou o preparo');
}

const STAMP: Record<string, string> = { confirmado: 'confirmed_at', em_preparo: 'preparing_at', pronto: 'ready_at', saiu_entrega: 'dispatched_at', concluido: 'closed_at', cancelado: 'canceled_at' };

async function setStatusRaw(q: Q, t: number, o: any, to: string, userId: number | null, note?: string) {
  const stamp = STAMP[to];
  const extra = stamp ? `, ${stamp} = NOW(3)` : '';
  const extra2 = to === 'concluido' && o.type === 'delivery' ? ', delivered_at = NOW(3)' : '';
  await q.run(`UPDATE orders SET status = $1, updated_at = NOW(3) ${extra} ${extra2} WHERE id = $2`, [to, o.id]);
  await event(q, t, o.id, 'status', userId, note, o.status, to);
}

export async function setTicketStatus(db: DB, t: number, ticketId: number, to: 'preparo' | 'pronto' | 'entregue', user: SessionUser, sector?: string) {
  await db.tx(async (q) => {
    const tk = await q.get('SELECT * FROM kitchen_tickets WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [ticketId, t]);
    if (!tk) throw notFound('Ticket não encontrado.');
    if (tk.status === 'cancelado') throw conflict('Ticket cancelado.');
    const order = await getOrder(q, t, tk.order_id);
    if (order.status === 'cancelado') throw conflict('Pedido cancelado.');
    const sf = sector ? ' AND sector = $2' : '';
    const p = sector ? [ticketId, sector] : [ticketId];
    if (to === 'preparo') {
      await q.run(`UPDATE order_items SET status='preparo' WHERE ticket_id=$1 AND status='enviado' ${sf}`, p);
      await q.run("UPDATE kitchen_tickets SET accepted_at = COALESCE(accepted_at, NOW(3)), started_at = COALESCE(started_at, NOW(3)), status = CASE WHEN status='novo' THEN 'preparo' ELSE status END WHERE id=$1", [ticketId]);
    } else if (to === 'pronto') {
      await q.run(`UPDATE order_items SET status='pronto', ready_at=NOW(3) WHERE ticket_id=$1 AND status IN ('enviado','preparo') ${sf}`, p);
    } else {
      await q.run(`UPDATE order_items SET status='entregue' WHERE ticket_id=$1 AND status IN ('enviado','preparo','pronto') ${sf}`, p);
    }
    await event(q, t, tk.order_id, 'kitchen', user.id, `Rodada ${tk.seq}${sector ? ` [${sector}]` : ''}: ${to}`);
    await syncTicket(q, t, ticketId, user.id);
  });
  broadcast(t, 'orders', { kind: 'kitchen' });
}

export async function setItemStatus(db: DB, t: number, itemId: number, to: 'preparo' | 'pronto' | 'entregue', user: SessionUser) {
  await db.tx(async (q) => {
    const it = await q.get('SELECT * FROM order_items WHERE id = $1 AND tenant_id = $2', [itemId, t]);
    if (!it || !it.ticket_id) throw notFound('Item não encontrado na cozinha.');
    if (it.status === 'cancelado') throw conflict('Item cancelado.');
    await q.run(`UPDATE order_items SET status=$1, ready_at = CASE WHEN $1='pronto' THEN NOW(3) ELSE ready_at END WHERE id=$2`, [to, itemId]);
    await syncTicket(q, t, it.ticket_id, user.id);
  });
  broadcast(t, 'orders', { kind: 'kitchen' });
}

export async function confirmOrder(db: DB, t: number, orderId: number, user: SessionUser, p: { delivery_fee_cents?: number | null; estimated_minutes?: number | null }) {
  const out = await db.tx(async (q) => {
    const o = await getOrder(q, t, orderId, true);
    if (o.status !== 'aguardando_confirmacao') throw conflict('Este pedido já foi confirmado ou finalizado.');
    if (o.type === 'delivery' && o.delivery_fee_cents === null) {
      if (p.delivery_fee_cents === undefined || p.delivery_fee_cents === null || p.delivery_fee_cents < 0) throw bad('Informe a taxa de entrega para confirmar (bairro não cadastrado).');
      await q.run('UPDATE orders SET delivery_fee_cents = $1 WHERE id = $2', [Math.round(p.delivery_fee_cents), orderId]);
    }
    if (p.estimated_minutes) await q.run('UPDATE orders SET estimated_minutes = $1 WHERE id = $2', [Math.round(p.estimated_minutes), orderId]);
    await setStatusRaw(q, t, o, 'confirmado', user.id, 'Pedido aceito pelo estabelecimento');
    await sendPendingToKitchen(q, t, orderId, user.id);
    return recalc(q, t, orderId);
  });
  broadcast(t, 'orders', { orderId, kind: 'confirmed' });
  return out;
}

export async function changeStatus(db: DB, t: number, orderId: number, to: string, user: SessionUser, p: { note?: string; receivable_auth?: number | null } = {}) {
  const out = await db.tx(async (q) => {
    const o = await getOrder(q, t, orderId, true);
    if (o.status === to) return o;
    if (to === 'confirmado' && o.status === 'aguardando_confirmacao') throw bad('Use a ação "Confirmar pedido".');
    if (to === 'cancelado') throw bad('Use a ação "Cancelar pedido" (exige motivo).');
    if (!canTransition(o, to)) throw conflict(`Não é possível mover de "${STATUS_LABELS[o.status]}" para "${STATUS_LABELS[to] || to}".`);
    if (to === 'saiu_entrega' && !o.courier_id) throw bad('Atribua um motoboy antes de despachar.');
    if (to === 'concluido') {
      const fresh = await recalc(q, t, orderId);
      if (o.type === 'mesa' && (await q.get("SELECT 1 FROM order_items WHERE order_id = $1 AND status = 'pendente'", [orderId]))) throw conflict('Há itens pedidos pelo QR ainda não confirmados. Envie para a cozinha ou cancele antes de encerrar.');
      if (fresh.paid_cents < fresh.total_cents) {
        if (!p.receivable_auth) throw conflict('Pedido com saldo em aberto. Registre o pagamento ou autorize como conta a receber.');
        await q.run('UPDATE orders SET receivable = true WHERE id = $1', [orderId]);
        await audit(q, { tenantId: t, userId: user.id, action: 'order.receivable', entity: 'order', entityId: orderId, data: { open_cents: fresh.total_cents - fresh.paid_cents }, reason: p.note, authorizedBy: p.receivable_auth });
      }
      if (o.type === 'mesa') await q.run("UPDATE order_items SET status='entregue' WHERE order_id=$1 AND status = 'pronto'", [orderId]);
    }
    if (to === 'em_preparo') await q.run("UPDATE kitchen_tickets SET status='preparo', started_at=COALESCE(started_at,NOW(3)) WHERE order_id=$1 AND status='novo'", [orderId]);
    if (to === 'pronto') {
      await q.run("UPDATE order_items SET status='pronto', ready_at=COALESCE(ready_at,NOW(3)) WHERE order_id=$1 AND status IN ('enviado','preparo')", [orderId]);
      await q.run("UPDATE kitchen_tickets SET status='pronto', ready_at=COALESCE(ready_at,NOW(3)) WHERE order_id=$1 AND status IN ('novo','preparo')", [orderId]);
    }
    if (to === 'concluido' && o.type !== 'mesa') {
      await q.run("UPDATE order_items SET status='entregue' WHERE order_id=$1 AND status <> 'cancelado'", [orderId]);
      await q.run("UPDATE kitchen_tickets SET status='entregue', served_at=COALESCE(served_at,NOW(3)) WHERE order_id=$1 AND status <> 'cancelado'", [orderId]);
    }
    if (to === 'fechamento') await q.run('UPDATE orders SET close_requested = true WHERE id = $1', [orderId]);
    if (to === 'aberto') await q.run('UPDATE orders SET close_requested = false WHERE id = $1', [orderId]);
    await setStatusRaw(q, t, o, to, user.id, p.note);
    return recalc(q, t, orderId);
  });
  broadcast(t, 'orders', { orderId });
  return out;
}

export async function cancelOrder(db: DB, t: number, orderId: number, user: SessionUser, reason: string, authorizedBy: number, ip?: string) {
  const out = await db.tx(async (q) => {
    const o = await getOrder(q, t, orderId, true);
    if (['concluido', 'cancelado'].includes(o.status)) throw conflict('Pedido já finalizado: não pode ser cancelado. Use estorno de pagamento, se necessário.');
    if (!reason || reason.trim().length < 3) throw bad('Informe o motivo do cancelamento.');
    if (await q.get('SELECT 1 FROM payments WHERE order_id=$1 AND NOT voided', [orderId])) throw conflict('Há pagamentos registrados. Estorne os pagamentos antes de cancelar o pedido.');
    await q.run("UPDATE order_items SET status='cancelado', canceled_by=$1, canceled_at=NOW(3), cancel_reason=$2 WHERE order_id=$3 AND status <> 'cancelado'", [user.id, reason, orderId]);
    await q.run("UPDATE kitchen_tickets SET status='cancelado' WHERE order_id=$1", [orderId]);
    await q.run('UPDATE orders SET cancel_reason = $1 WHERE id = $2', [reason, orderId]);
    await setStatusRaw(q, t, o, 'cancelado', user.id, reason);
    await audit(q, { tenantId: t, userId: user.id, action: 'order.cancel', entity: 'order', entityId: orderId, data: { number: o.number, total_cents: o.total_cents, status: o.status }, reason, authorizedBy, ip });
    return recalc(q, t, orderId);
  });
  broadcast(t, 'orders', { orderId, kind: 'canceled' });
  return out;
}

export async function setDiscount(db: DB, t: number, orderId: number, user: SessionUser, cents: number, reason: string, authorizedBy: number, ip?: string) {
  const out = await db.tx(async (q) => {
    await getOrder(q, t, orderId, true);
    const o = await recalc(q, t, orderId);
    if (['concluido', 'cancelado'].includes(o.status)) throw conflict('Pedido finalizado.');
    cents = Math.round(cents);
    if (!(cents >= 0) || cents > o.subtotal_cents) throw bad('Desconto inválido (não pode ser maior que o subtotal).');
    if (cents > 0 && (!reason || reason.trim().length < 3)) throw bad('Informe o motivo do desconto.');
    await q.run('UPDATE orders SET discount_cents = $1, discount_reason = $2 WHERE id = $3', [cents, cents ? reason : null, orderId]);
    await event(q, t, orderId, 'discount', user.id, `Desconto: R$ ${(cents / 100).toFixed(2)} — ${reason || ''}`);
    await audit(q, { tenantId: t, userId: user.id, action: 'order.discount', entity: 'order', entityId: orderId, data: { from: o.discount_cents, to: cents, subtotal: o.subtotal_cents }, reason, authorizedBy, ip });
    const after = await recalc(q, t, orderId);
    if (after.paid_cents > after.total_cents) throw conflict('Desconto deixaria o valor pago maior que o total. Estorne antes.');
    return after;
  });
  broadcast(t, 'orders', { orderId });
  return out;
}

export async function assignCourier(db: DB, t: number, orderId: number, courierId: number | null, user: SessionUser) {
  const out = await db.tx(async (q) => {
    const o = await getOrder(q, t, orderId, true);
    if (o.type !== 'delivery') throw bad('Apenas pedidos de delivery têm motoboy.');
    if (['concluido', 'cancelado'].includes(o.status)) throw conflict('Pedido finalizado.');
    if (o.status === 'saiu_entrega' && courierId !== o.courier_id) throw conflict('Pedido já saiu para entrega. Registre o retorno antes de trocar o motoboy.');
    if (courierId) {
      const c = await q.get("SELECT id, name FROM users WHERE id = $1 AND tenant_id = $2 AND role = 'motoboy' AND active", [courierId, t]);
      if (!c) throw bad('Motoboy inválido ou inativo.');
      await event(q, t, orderId, 'courier', user.id, `Entrega atribuída a ${c.name}`);
    } else await event(q, t, orderId, 'courier', user.id, 'Motoboy removido');
    await q.run('UPDATE orders SET courier_id = $1, updated_at = NOW(3) WHERE id = $2', [courierId, orderId]);
    return getOrder(q, t, orderId);
  });
  broadcast(t, 'orders', { orderId, kind: 'courier' });
  return out;
}

export async function suggestCourier(q: Q, t: number) {
  return q.get(`SELECT u.id, u.name, (SELECT COUNT(*) FROM orders o WHERE o.courier_id = u.id AND o.status IN ('pronto','saiu_entrega')) AS active_load
    FROM users u WHERE u.tenant_id = $1 AND u.role = 'motoboy' AND u.active AND u.available ORDER BY active_load ASC, u.name LIMIT 1`, [t]);
}

export async function orderDetail(q: Q, t: number, id: number, user?: SessionUser) {
  const o = await getOrder(q, t, id);
  const items = await q.all('SELECT i.*, u.name created_by_name FROM order_items i LEFT JOIN users u ON u.id = i.created_by WHERE i.order_id = $1 ORDER BY i.id', [id]);
  const tickets = await q.all('SELECT * FROM kitchen_tickets WHERE order_id = $1 ORDER BY seq', [id]);
  const events = await q.all('SELECT e.*, u.name user_name FROM order_events e LEFT JOIN users u ON u.id = e.user_id WHERE order_id = $1 ORDER BY e.id', [id]);
  const payments = await q.all('SELECT p.*, u.name user_name, c.name collector_name FROM payments p LEFT JOIN users u ON u.id = p.user_id LEFT JOIN users c ON c.id = p.collected_by WHERE order_id = $1 ORDER BY p.id', [id]);
  const extra = await q.get(`SELECT tb.label table_label, w.name waiter_name, c.name courier_name, cb.name created_by_name
    FROM orders o LEFT JOIN dining_tables tb ON tb.id = o.table_id LEFT JOIN users w ON w.id = o.waiter_id LEFT JOIN users c ON c.id = o.courier_id
    LEFT JOIN users cb ON cb.id = o.created_by WHERE o.id = $1`, [id]);
  const full: any = {
    ...o, ...extra, address: o.address_json, events: events.map((e) => ({ ...e, note: e.note?.replace(/ \[[^\]]+\]$/, '') })),
    items: items.map((i) => ({ ...i, options: i.options_json, created_by_name: i.created_by_name || (i.source === 'cliente' ? `Cliente${i.customer_label ? ` ${i.customer_label}` : ''} (QR)` : null) })),
    tickets, payments, status_label: STATUS_LABELS[o.status],
  };
  if (user && !can(user, 'orders.view_values') && !can(user, 'tables.use')) return stripValues(full);
  return full;
}

export function stripValues(o: any) {
  const { subtotal_cents, discount_cents, total_cents, paid_cents, payments, ...rest } = o;
  return { ...rest, items: (o.items || []).map(({ unit_price_cents, total_cents, options_cents, ...i }: any) => i) };
}
