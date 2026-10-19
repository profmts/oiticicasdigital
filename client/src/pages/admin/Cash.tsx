import { useState } from 'react';
import { get, post } from '../../lib/api';
import { useAuth, useData } from '../../lib/hooks';
import { money, parseMoney, time, dateTime } from '../../lib/format';
import { Button, Field, Input, MoneyInput, Modal, Spinner, Stat, Badge, useAction, cx } from '../../components/ui';

export default function Cash() {
  const { can } = useAuth();
  const cur = useData<any>('/api/admin/cash/current', ['cash', 'orders'], 30000);
  const settings = useData<any>('/api/admin/settings', [], 0);
  const sessions = useData<any[]>(can('cash.view_all') ? '/api/admin/cash/sessions' : null, ['cash'], 0);
  const [opening, setOpening] = useState('');
  const [mov, setMov] = useState<null | 'sangria' | 'suprimento'>(null);
  const [closing, setClosing] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const [view, setView] = useState<any>(null);
  const { run, busy } = useAction();
  if (!cur.data) return <Spinner />;
  const s = cur.data.session;
  const mName = (id: string) => settings.data?.payment_methods?.find((m: any) => m.id === id)?.name || id;
  const pending = cur.data.courier_pending || [];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {!s ? (
        <section className="rounded-2xl bg-white p-6 ring-1 ring-lenha-100">
          <h1 className="font-slab text-2xl font-bold">Abrir caixa</h1>
          <p className="mt-1 text-lenha-600">Conte o dinheiro que está na gaveta para troco. Os recebimentos que você registrar entram neste caixa.</p>
          <form className="mt-4 flex max-w-sm items-end gap-2" onSubmit={(e) => { e.preventDefault(); run('open', () => post('/api/admin/cash/open', { opening_cents: parseMoney(opening || '0') }).then(cur.reload), 'Caixa aberto.'); }}>
            <Field label="Fundo de troco" className="flex-1"><MoneyInput value={opening} onChange={setOpening} placeholder="0,00" /></Field>
            <Button type="submit" busy={busy === 'open'} disabled={opening !== '' && !Number.isFinite(parseMoney(opening))}>Abrir caixa</Button>
          </form>
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-slab text-2xl font-bold">Caixa de {s.user_name}</h1>
            <Badge tone="ok">Aberto às {time(s.opened_at)}</Badge>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setMov('suprimento')}>Suprimento</Button>
              <Button variant="outline" onClick={() => setMov('sangria')}>Sangria</Button>
              <Button variant="dark" onClick={() => setClosing(true)}>Fechar caixa</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat tone="dark" label="Dinheiro esperado na gaveta" value={money(s.expected_cash_cents)} sub="Fundo + vendas em dinheiro + suprimentos − sangrias" />
            <Stat label="Total recebido" value={money(s.total_received_cents)} sub={`${s.payments.filter((p: any) => !p.voided).length} pagamentos`} />
            <Stat label="Fundo de troco" value={money(s.opening_cents)} />
            <Stat label="Sangrias / suprimentos" value={`${money(s.sangria_cents)}`} sub={`Suprimentos: ${money(s.suprimento_cents)}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
              <h2 className="mb-2 font-slab text-lg font-bold">Por forma de pagamento</h2>
              {s.byMethod.length === 0 ? <p className="text-sm text-lenha-500">Nenhum recebimento ainda.</p> : (
                <dl className="space-y-1">{s.byMethod.map((m: any) => <div key={m.method} className="flex justify-between"><dt>{mName(m.method)} ({m.n})</dt><dd className="font-semibold tabnums">{money(m.total)}</dd></div>)}</dl>
              )}
              {s.voided.n > 0 && <p className="mt-2 text-sm text-alerta">{s.voided.n} estorno(s): {money(s.voided.total)}</p>}
              {s.movements.length > 0 && (
                <>
                  <h3 className="mt-4 font-semibold">Movimentos</h3>
                  <ul className="text-sm">{s.movements.map((m: any) => <li key={m.id} className="flex justify-between"><span>{time(m.created_at)} · {m.type === 'sangria' ? 'Sangria' : 'Suprimento'} — {m.reason}</span><span className="tabnums">{m.type === 'sangria' ? '−' : '+'} {money(m.amount_cents)}</span></li>)}</ul>
                </>
              )}
            </section>
            <section className="rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
              <h2 className="mb-2 font-slab text-lg font-bold">Acerto com motoboys</h2>
              {pending.length === 0 ? <p className="text-sm text-lenha-500">Nenhum valor aguardando acerto.</p> : (
                <>
                  <ul className="divide-y divide-lenha-100 text-sm">
                    {pending.map((p: any) => (
                      <li key={p.id}><label className="flex items-center gap-3 py-2">
                        <input type="checkbox" className="size-5 accent-brasa-500" checked={sel.includes(p.id)} onChange={(e) => setSel((x) => (e.target.checked ? [...x, p.id] : x.filter((i) => i !== p.id)))} />
                        <span className="flex-1">{p.courier_name} · #{p.number} · {mName(p.method)}{p.change_cents ? ` (troco ${money(p.change_cents)})` : ''}</span>
                        <span className="font-semibold tabnums">{money(p.amount_cents)}</span>
                      </label></li>
                    ))}
                  </ul>
                  <Button className="mt-2 w-full" disabled={!sel.length} busy={busy === 'settle'} onClick={() => run('settle', () => post('/api/admin/cash/settle', { payment_ids: sel }).then(() => { setSel([]); cur.reload(); }), 'Acerto registrado no seu caixa.')}>
                    Conferi e recebi {money(pending.filter((p: any) => sel.includes(p.id)).reduce((a: number, p: any) => a + p.amount_cents, 0))}
                  </Button>
                </>
              )}
            </section>
          </div>
          <section className="rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
            <h2 className="mb-2 font-slab text-lg font-bold">Recebimentos deste caixa</h2>
            {s.payments.length === 0 ? <p className="text-sm text-lenha-500">Nenhum recebimento ainda.</p> : (
              <ul className="divide-y divide-lenha-100 text-sm">
                {s.payments.map((p: any) => (
                  <li key={p.id} className={cx('flex justify-between py-1.5', p.voided && 'opacity-50 line-through')}><span>{time(p.created_at)} · Pedido #{p.number} · {mName(p.method)}{p.change_cents ? ` · troco ${money(p.change_cents)}` : ''}</span><span className="tabnums">{money(p.amount_cents)}</span></li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {sessions.data && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
          <h2 className="mb-2 font-slab text-lg font-bold">Histórico de caixas</h2>
          <div className="scroll-visible overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-lenha-500"><th className="py-1">Operador</th><th>Abertura</th><th>Fechamento</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferença</th><th /></tr></thead>
              <tbody>
                {sessions.data.map((x) => (
                  <tr key={x.id} className="border-t border-lenha-100">
                    <td className="py-1.5">{x.user_name}</td><td>{dateTime(x.opened_at)}</td><td>{x.closed_at ? dateTime(x.closed_at) : <Badge tone="ok">aberto</Badge>}</td>
                    <td className="text-right tabnums">{money(x.expected_cash_cents)}</td><td className="text-right tabnums">{money(x.counted_cash_cents)}</td>
                    <td className={cx('text-right font-semibold tabnums', x.difference_cents < 0 ? 'text-alerta' : x.difference_cents > 0 ? 'text-ok' : '')}>{x.difference_cents == null ? '—' : money(x.difference_cents)}</td>
                    <td className="text-right"><button className="font-semibold text-brasa-700" onClick={() => get(`/api/admin/cash/sessions/${x.id}`).then(setView)}>Ver</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mov && <MovementDialog type={mov} onClose={() => setMov(null)} onDone={() => { setMov(null); cur.reload(); }} />}
      {closing && s && <CloseDialog s={s} mName={mName} onClose={() => setClosing(false)} onDone={(x) => { setClosing(false); setView(x); cur.reload(); sessions.reload(); }} />}
      {view && (
        <Modal open onClose={() => setView(null)} title={`Caixa de ${view.user_name}`}>
          <p className="text-sm text-lenha-600">{dateTime(view.opened_at)} até {view.closed_at ? dateTime(view.closed_at) : 'agora'}</p>
          <dl className="mt-3 space-y-1">
            <div className="flex justify-between"><dt>Fundo de troco</dt><dd className="tabnums">{money(view.opening_cents)}</dd></div>
            {view.byMethod.map((m: any) => <div key={m.method} className="flex justify-between"><dt>{mName(m.method)}</dt><dd className="tabnums">{money(m.total)}</dd></div>)}
            <div className="flex justify-between"><dt>Sangrias</dt><dd className="tabnums">− {money(view.sangria_cents)}</dd></div>
            <div className="flex justify-between"><dt>Suprimentos</dt><dd className="tabnums">{money(view.suprimento_cents)}</dd></div>
            <div className="flex justify-between border-t border-lenha-100 pt-1 font-semibold"><dt>Dinheiro esperado</dt><dd className="tabnums">{money(view.expected_cash_cents)}</dd></div>
            {view.counted_cash_cents != null && <div className="flex justify-between"><dt>Contado</dt><dd className="tabnums">{money(view.counted_cash_cents)}</dd></div>}
            {view.difference_cents != null && <div className={cx('flex justify-between font-bold', view.difference_cents < 0 ? 'text-alerta' : 'text-ok')}><dt>Diferença</dt><dd className="tabnums">{money(view.difference_cents)}</dd></div>}
          </dl>
          {view.notes && <p className="mt-2 text-sm">Obs.: {view.notes}</p>}
        </Modal>
      )}
    </div>
  );
}

function MovementDialog({ type, onClose, onDone }: { type: 'sangria' | 'suprimento'; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState(''); const [reason, setReason] = useState('');
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title={type === 'sangria' ? 'Sangria (retirar dinheiro)' : 'Suprimento (colocar dinheiro)'}
      footer={<Button className="w-full" busy={!!busy} disabled={!(parseMoney(v) > 0) || reason.trim().length < 3} onClick={() => run('m', () => post('/api/admin/cash/movement', { type, amount_cents: parseMoney(v), reason }).then(onDone), 'Movimento registrado.')}>Registrar {type}</Button>}>
      <div className="space-y-3">
        <Field label="Valor"><MoneyInput value={v} onChange={setV} /></Field>
        <Field label="Motivo"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'sangria' ? 'Ex.: depósito, pagamento de fornecedor' : 'Ex.: reforço de troco'} /></Field>
      </div>
    </Modal>
  );
}

function CloseDialog({ s, mName, onClose, onDone }: { s: any; mName: (id: string) => string; onClose: () => void; onDone: (x: any) => void }) {
  const [v, setV] = useState(''); const [notes, setNotes] = useState('');
  const { run, busy } = useAction();
  const counted = parseMoney(v);
  const diff = Number.isFinite(counted) ? counted - s.expected_cash_cents : null;
  return (
    <Modal open onClose={onClose} title="Fechar caixa"
      footer={<Button className="w-full" variant="dark" busy={!!busy} disabled={!Number.isFinite(counted)} onClick={() => run('c', () => post('/api/admin/cash/close', { counted_cents: counted, notes }).then(onDone), 'Caixa fechado.')}>Confirmar fechamento</Button>}>
      <p className="mb-3 text-sm text-lenha-600">Conte o dinheiro da gaveta e informe abaixo. Pix e cartões são conferidos pelo extrato.</p>
      <dl className="mb-4 space-y-1 rounded-xl bg-lenha-50 p-3 text-sm">
        {s.byMethod.filter((m: any) => m.method !== 'dinheiro').map((m: any) => <div key={m.method} className="flex justify-between"><dt>{mName(m.method)}</dt><dd className="tabnums">{money(m.total)}</dd></div>)}
      </dl>
      <Field label="Dinheiro contado na gaveta"><MoneyInput value={v} onChange={setV} /></Field>
      {diff != null && <p className={cx('mt-2 font-semibold', diff === 0 ? 'text-ok' : 'text-alerta')}>{diff === 0 ? 'Bateu com o esperado.' : diff > 0 ? `Sobra de ${money(diff)}.` : `Falta de ${money(-diff)}.`}</p>}
      <Field label="Observações" className="mt-3"><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Modal>
  );
}
