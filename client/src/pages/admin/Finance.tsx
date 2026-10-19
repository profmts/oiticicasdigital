import { useState } from 'react';
import { post, put } from '../../lib/api';
import { useAuth, useData } from '../../lib/hooks';
import { money, parseMoney, centsToInput, date, todayLocal } from '../../lib/format';
import { ReasonDialog } from '../../components/OrderDrawer';
import { Badge, Button, Field, Input, Modal, MoneyInput, Select, Spinner, Textarea, Toggle, useAction, cx } from '../../components/ui';

const CATS = ['Insumos', 'Bebidas', 'Carvão e gás', 'Embalagens', 'Funcionários', 'Aluguel', 'Energia e água', 'Taxas e tarifas', 'Manutenção', 'Marketing', 'Impostos', 'Outros'];

export default function Finance() {
  const { can } = useAuth();
  const [status, setStatus] = useState('pendente');
  const { data, reload } = useData<any[]>(`/api/admin/expenses${status ? `?status=${status}` : ''}`, ['finance'], 0);
  const [edit, setEdit] = useState<any>(null);
  const [cancel, setCancel] = useState<any>(null);
  const { run } = useAction();
  const today = todayLocal();
  const total = (data || []).reduce((a, e) => a + (e.status !== 'cancelado' ? e.amount_cents : 0), 0);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="font-slab text-2xl font-bold">Contas a pagar</h1>
        <div className="flex gap-1 rounded-xl bg-lenha-50 p-1">
          {[['pendente', 'Pendentes'], ['pago', 'Pagas'], ['cancelado', 'Canceladas'], ['', 'Todas']].map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={cx('h-9 rounded-lg px-3 text-sm font-semibold', status === k && 'bg-white shadow')}>{l}</button>)}
        </div>
        {can('finance.manage') && <Button className="ml-auto" onClick={() => setEdit({ description: '', category: 'Insumos', supplier: '', amount: '', due_date: today, notes: '', paid: false })}>Nova despesa</Button>}
      </div>
      <p className="mb-3 text-sm text-lenha-600">As despesas entram no dashboard e no fluxo de caixa. Contas a receber (saldos de pedidos em aberto) e o fluxo de caixa diário estão em Relatórios.</p>
      {!data ? <Spinner /> : data.length === 0 ? <p className="py-10 text-center text-lenha-500">Nenhuma despesa {status === 'pendente' ? 'pendente' : 'neste filtro'}.</p> : (
        <div className="scroll-visible overflow-x-auto rounded-2xl bg-white ring-1 ring-lenha-100">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-lenha-500"><th className="px-4 py-2">Vencimento</th><th>Descrição</th><th>Categoria</th><th>Fornecedor</th><th className="text-right">Valor</th><th className="px-4">Situação</th><th /></tr></thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className="border-t border-lenha-100">
                  <td className={cx('px-4 py-2', e.status === 'pendente' && e.due_date < today && 'font-semibold text-alerta')}>{date(e.due_date)}</td>
                  <td>{e.description}</td><td>{e.category}</td><td>{e.supplier}</td><td className="text-right font-semibold tabnums">{money(e.amount_cents)}</td>
                  <td className="px-4">{e.status === 'pago' ? <Badge tone="ok">Paga {date(e.paid_at)}</Badge> : e.status === 'cancelado' ? <Badge>Cancelada</Badge> : e.due_date < today ? <Badge tone="alerta">Vencida</Badge> : <Badge tone="ouro">Pendente</Badge>}</td>
                  <td className="whitespace-nowrap pr-3 text-right">
                    {e.status === 'pendente' && can('finance.manage') && <>
                      <button className="mr-3 font-semibold text-ok" onClick={() => run('p', () => post(`/api/admin/expenses/${e.id}/pay`, {}).then(reload), 'Despesa paga.')}>Pagar</button>
                      <button className="mr-3 font-semibold text-brasa-700" onClick={() => setEdit({ ...e, amount: centsToInput(e.amount_cents) })}>Editar</button>
                      <button className="font-semibold text-alerta" onClick={() => setCancel(e)}>Cancelar</button></>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t border-lenha-200 font-semibold"><td className="px-4 py-2" colSpan={4}>Total</td><td className="text-right tabnums">{money(total)}</td><td colSpan={2} /></tr></tfoot>
          </table>
        </div>
      )}
      {edit && <ExpenseEditor initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {cancel && <ReasonDialog title={`Cancelar “${cancel.description}”`} cta="Cancelar despesa" info="A despesa não é apagada: fica registrada como cancelada." onClose={() => setCancel(null)}
        onSubmit={(reason) => post(`/api/admin/expenses/${cancel.id}/cancel`, { reason }).then(() => { setCancel(null); reload(); })} />}
    </div>
  );
}

function ExpenseEditor({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const { run, busy } = useAction();
  const body = { description: f.description, category: f.category, supplier: f.supplier, amount_cents: parseMoney(f.amount), due_date: f.due_date, notes: f.notes, paid: f.paid };
  return (
    <Modal open onClose={onClose} title={f.id ? 'Editar despesa' : 'Nova despesa'}
      footer={<Button className="w-full" busy={!!busy} disabled={f.description.trim().length < 2 || !(parseMoney(f.amount) > 0) || !f.due_date} onClick={() => run('s', () => (f.id ? put(`/api/admin/expenses/${f.id}`, body) : post('/api/admin/expenses', body)).then(onSaved), 'Despesa salva.')}>Salvar</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Descrição" className="sm:col-span-2"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Categoria"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Fornecedor"><Input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
        <Field label="Valor"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Vencimento"><Input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
        <Field label="Observações" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        {!f.id && <Toggle checked={f.paid} onChange={(v) => setF({ ...f, paid: v })} label="Já foi paga (hoje)" />}
      </div>
    </Modal>
  );
}
