import { useEffect, useState } from 'react';
import { post, uid } from '../lib/api';
import { money, parseMoney, centsToInput } from '../lib/format';
import { Button, Modal, MoneyInput, Select, useAction, cx } from './ui';

type Line = { method: string; amount: string; received: string };

/**
 * Registro de recebimento. O operador confirma o que recebeu — nada é marcado como pago sozinho.
 * Permite dividir em várias formas (ex.: parte em dinheiro, parte no Pix) e calcula o troco.
 */
export function PaymentDialog({ order, methods, onClose, onDone, url, title = 'Receber pagamento' }: {
  order: any; methods: { id: string; name: string; active: boolean }[]; onClose: () => void; onDone: (o: any) => void; url?: string; title?: string;
}) {
  const balance = Math.max(0, order.total_cents - order.paid_cents);
  const active = methods.filter((m) => m.active);
  const [lines, setLines] = useState<Line[]>([{ method: active[0]?.id || 'dinheiro', amount: centsToInput(balance), received: '' }]);
  const [split, setSplit] = useState('');
  const [key] = useState(uid);
  const { run, busy } = useAction();
  useEffect(() => { setLines([{ method: active[0]?.id || 'dinheiro', amount: centsToInput(balance), received: '' }]); }, [order.id]); // eslint-disable-line

  const amounts = lines.map((l) => parseMoney(l.amount));
  const sum = amounts.reduce((s, a) => s + (Number.isFinite(a) ? a : 0), 0);
  const rest = balance - sum;
  const cashChange = lines.reduce((s, l, i) => {
    if (l.method !== 'dinheiro' || !l.received) return s;
    const r = parseMoney(l.received); return Number.isFinite(r) && r > amounts[i] ? s + (r - amounts[i]) : s;
  }, 0);
  const valid = sum > 0 && rest >= 0 && amounts.every((a) => Number.isFinite(a) && a > 0) &&
    lines.every((l, i) => l.method !== 'dinheiro' || !l.received || parseMoney(l.received) >= amounts[i]);

  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const submit = () => run('pay', async () => {
    const o = await post(url || `/api/orders/${order.id}/payments`, {
      idempotency_key: key,
      payments: lines.map((l, i) => ({ method: l.method, amount_cents: amounts[i], received_cents: l.method === 'dinheiro' && l.received ? parseMoney(l.received) : null })),
    });
    onDone(o);
  }, 'Pagamento registrado.');

  const n = Number(split);
  return (
    <Modal open onClose={onClose} title={title}
      footer={<Button size="lg" className="w-full" disabled={!valid} busy={busy === 'pay'} onClick={submit}>Confirmar recebimento de {money(sum)}</Button>}>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white p-3 ring-1 ring-lenha-100"><p className="text-xs text-lenha-500">Total</p><p className="font-cond text-xl font-bold tabnums">{money(order.total_cents)}</p></div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-lenha-100"><p className="text-xs text-lenha-500">Já pago</p><p className="font-cond text-xl font-bold tabnums">{money(order.paid_cents)}</p></div>
        <div className="rounded-xl bg-lenha-900 p-3 text-white"><p className="text-xs text-white/70">Falta</p><p className="font-cond text-xl font-bold tabnums">{money(balance)}</p></div>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <label className="flex-1 text-sm"><span className="mb-1 block font-semibold text-lenha-700">Dividir a conta por pessoas</span>
          <input inputMode="numeric" value={split} onChange={(e) => setSplit(e.target.value.replace(/\D/g, ''))} placeholder="Nº de pessoas" className="h-11 w-full rounded-xl border border-lenha-200 bg-white px-3" />
        </label>
        <Button variant="outline" disabled={!(n >= 2)} onClick={() => setLines([{ method: lines[0].method, amount: centsToInput(Math.ceil(balance / n)), received: '' }])}>
          {n >= 2 ? `${money(Math.ceil(balance / n))} cada` : 'Calcular'}
        </Button>
      </div>
      {n >= 2 && <p className="mt-1 text-xs text-lenha-500">Registre um pagamento por pessoa; o saldo vai diminuindo até zerar.</p>}

      <div className="mt-4 space-y-3">
        {lines.map((l, i) => (
          <div key={i} className="rounded-2xl bg-white p-3 ring-1 ring-lenha-100">
            <div className="flex gap-2">
              <Select value={l.method} onChange={(e) => set(i, 'method', e.target.value)} className="flex-1" aria-label="Forma de pagamento">
                {active.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
              <div className="w-36"><MoneyInput value={l.amount} onChange={(v) => set(i, 'amount', v)} aria-label="Valor" /></div>
              {lines.length > 1 && <button className="px-2 text-2xl text-lenha-500" aria-label="Remover forma" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>×</button>}
            </div>
            {l.method === 'dinheiro' && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-lenha-600">Cliente entregou</span>
                <div className="w-36"><MoneyInput value={l.received} onChange={(v) => set(i, 'received', v)} placeholder="opcional" aria-label="Valor entregue" /></div>
                {l.received && parseMoney(l.received) >= amounts[i] && <span className="font-semibold text-ok">Troco {money(parseMoney(l.received) - amounts[i])}</span>}
                {l.received && parseMoney(l.received) < amounts[i] && <span className="text-sm font-semibold text-alerta">Menor que o valor</span>}
              </div>
            )}
          </div>
        ))}
        {lines.length < 4 && rest > 0 && (
          <Button variant="ghost" onClick={() => setLines((ls) => [...ls, { method: active.find((m) => m.id !== ls.at(-1)?.method)?.id || active[0].id, amount: centsToInput(rest), received: '' }])}>+ Outra forma de pagamento ({money(rest)} restante)</Button>
        )}
      </div>
      <p className={cx('mt-3 text-sm font-semibold', rest < 0 ? 'text-alerta' : 'text-lenha-600')}>
        {rest < 0 ? `Valor acima do saldo em ${money(-rest)}. Para troco, use “Cliente entregou”.` : rest > 0 ? `Após este recebimento, ainda faltarão ${money(rest)}.` : 'Este recebimento quita o pedido.'}
        {cashChange > 0 && ` Troco total: ${money(cashChange)}.`}
      </p>
    </Modal>
  );
}
