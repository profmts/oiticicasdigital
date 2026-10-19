import { useState } from 'react';
import { get, put } from '../../lib/api';
import { useData } from '../../lib/hooks';
import { money, dateTime, phoneFmt, waLink, STATUS_LABEL, TYPE_LABEL } from '../../lib/format';
import { OrderDrawer } from '../../components/OrderDrawer';
import { Button, Field, Input, Modal, Spinner, Textarea, useAction } from '../../components/ui';

export default function Customers() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data } = useData<any[]>(`/api/admin/customers?q=${encodeURIComponent(search)}`, [], 0);
  const [sel, setSel] = useState<any>(null);
  const [order, setOrder] = useState<number | null>(null);
  const { run, busy } = useAction();
  return (
    <div className="mx-auto max-w-5xl">
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou telefone" className="max-w-sm" aria-label="Buscar cliente" />
        <Button type="submit" variant="dark">Buscar</Button>
      </form>
      <p className="mb-3 text-sm text-lenha-600">Clientes são cadastrados automaticamente pelo telefone ao fazer pedidos. Endereços só ficam salvos quando o cliente autoriza.</p>
      {!data ? <Spinner /> : data.length === 0 ? <p className="py-10 text-center text-lenha-500">Nenhum cliente encontrado.</p> : (
        <div className="scroll-visible overflow-x-auto rounded-2xl bg-white ring-1 ring-lenha-100">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-lenha-500"><th className="px-4 py-2">Cliente</th><th>Telefone</th><th className="text-right">Pedidos</th><th className="text-right">Total comprado</th><th className="px-4">Último pedido</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t border-lenha-100 hover:bg-lenha-50" onClick={() => get(`/api/admin/customers/${c.id}`).then(setSel)}>
                  <td className="px-4 py-2 font-semibold">{c.name}</td><td>{phoneFmt(c.phone)}</td><td className="text-right tabnums">{c.orders}</td>
                  <td className="text-right tabnums">{money(c.total_cents)}</td><td className="px-4">{c.last_order ? dateTime(c.last_order) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sel && (
        <Modal open side onClose={() => setSel(null)} title={sel.name}
          footer={<Button className="w-full" busy={!!busy} onClick={() => run('s', () => put(`/api/admin/customers/${sel.id}`, { name: sel.name, notes: sel.notes }), 'Cliente atualizado.')}>Salvar</Button>}>
          <p><a href={`tel:${sel.phone}`} className="text-brasa-700 underline">{phoneFmt(sel.phone)}</a> · <a href={waLink(sel.phone, `Olá, ${sel.name.split(' ')[0]}!`)} target="_blank" rel="noopener" className="text-brasa-700 underline">WhatsApp</a></p>
          <div className="mt-3 space-y-3">
            <Field label="Nome"><Input value={sel.name} onChange={(e) => setSel({ ...sel, name: e.target.value })} /></Field>
            <Field label="Preferências e observações de atendimento"><Textarea value={sel.notes} onChange={(e) => setSel({ ...sel, notes: e.target.value })} /></Field>
          </div>
          {sel.top.length > 0 && <p className="mt-4 text-sm"><strong>Mais pede:</strong> {sel.top.map((t: any) => `${t.name} (${t.qty})`).join(', ')}</p>}
          {sel.addresses.length > 0 && (
            <div className="mt-4"><h3 className="font-semibold">Endereços salvos</h3>
              <ul className="text-sm">{sel.addresses.map((a: any) => <li key={a.id}>{a.street}, {a.number} — {a.neighborhood}{a.reference && ` (${a.reference})`}</li>)}</ul></div>
          )}
          <h3 className="mt-4 font-semibold">Pedidos</h3>
          <ul className="divide-y divide-lenha-100 text-sm">
            {sel.orders.map((o: any) => (
              <li key={o.id}><button className="flex w-full justify-between py-2 text-left" onClick={() => setOrder(o.id)}>
                <span>#{o.number} · {TYPE_LABEL[o.type]} · {dateTime(o.created_at)} · {STATUS_LABEL[o.status]}</span><span className="tabnums">{money(o.total_cents)}</span></button></li>
            ))}
          </ul>
        </Modal>
      )}
      <OrderDrawer orderId={order} onClose={() => setOrder(null)} />
    </div>
  );
}
