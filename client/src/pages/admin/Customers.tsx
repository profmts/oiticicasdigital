import { useState } from 'react';
import { get, put } from '../../lib/api';
import { useData } from '../../lib/hooks';
import { money, dateTime, phoneFmt, waLink, STATUS_LABEL, TYPE_LABEL } from '../../lib/format';
import { OrderDrawer } from '../../components/OrderDrawer';
import { Button, Field, Input, Modal, Spinner, Textarea, useAction, cx } from '../../components/ui';

const cpfFmt = (c?: string | null) => {
  const d = (c || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : '';
};

export default function Customers() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data } = useData<any[]>(`/api/admin/customers?q=${encodeURIComponent(search)}`, [], 0);
  const [sel, setSel] = useState<any>(null);
  const [order, setOrder] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [promo, setPromo] = useState(false);
  const { run, busy } = useAction();

  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = (data || []).map((c) => c.id);
  const allPicked = allOnPage.length > 0 && allOnPage.every((id) => picked.has(id));
  const toggleAll = () => setPicked((s) => { const n = new Set(s); allPicked ? allOnPage.forEach((id) => n.delete(id)) : allOnPage.forEach((id) => n.add(id)); return n; });
  const pickedCustomers = (data || []).filter((c) => picked.has(c.id));

  return (
    <div className="mx-auto max-w-5xl">
      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome ou telefone" className="max-w-sm" aria-label="Buscar cliente" />
        <Button type="submit" variant="dark">Buscar</Button>
      </form>
      <p className="mb-3 text-sm text-lenha-600">Clientes são cadastrados automaticamente pelo telefone ao fazer pedidos. Selecione clientes para enviar uma promoção pelo WhatsApp.</p>

      {picked.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-brasa-50 px-4 py-3 ring-1 ring-brasa-200">
          <span className="font-semibold text-brasa-800">{picked.size} cliente(s) selecionado(s)</span>
          <Button size="sm" className="ml-auto" onClick={() => setPromo(true)}>Enviar promoção por WhatsApp</Button>
          <button className="text-sm font-semibold text-lenha-600 hover:underline" onClick={() => setPicked(new Set())}>Limpar seleção</button>
        </div>
      )}

      {!data ? <Spinner /> : data.length === 0 ? <p className="py-10 text-center text-lenha-500">Nenhum cliente encontrado.</p> : (
        <div className="scroll-visible overflow-x-auto rounded-2xl bg-white ring-1 ring-lenha-100">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-lenha-500">
              <th className="px-3 py-2"><input type="checkbox" className="size-4 accent-[var(--color-brasa-500)]" checked={allPicked} onChange={toggleAll} aria-label="Selecionar todos" /></th>
              <th className="px-2 py-2">Cliente</th><th>Telefone</th><th className="text-right">Pedidos</th><th className="text-right">Total comprado</th><th className="px-4">Último pedido</th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className={cx('border-t border-lenha-100 hover:bg-lenha-50', picked.has(c.id) && 'bg-brasa-50/60')}>
                  <td className="px-3 py-2"><input type="checkbox" className="size-4 accent-[var(--color-brasa-500)]" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Selecionar ${c.name}`} /></td>
                  <td className="cursor-pointer px-2 py-2 font-semibold" onClick={() => get(`/api/admin/customers/${c.id}`).then(setSel)}>{c.name}</td>
                  <td className="cursor-pointer" onClick={() => get(`/api/admin/customers/${c.id}`).then(setSel)}>{phoneFmt(c.phone)}</td>
                  <td className="text-right tabnums">{c.orders}</td>
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
          {cpfFmt(sel.cpf) && <p className="mt-1 text-sm text-lenha-600">CPF: {cpfFmt(sel.cpf)}</p>}
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

      {promo && <PromoModal customers={pickedCustomers} onClose={() => setPromo(false)} />}
      <OrderDrawer orderId={order} onClose={() => setOrder(null)} />
    </div>
  );
}

/**
 * Promoção por WhatsApp sem custo: o lojista escreve a mensagem uma vez e envia a cada cliente
 * pelo botão (abre o WhatsApp com o texto pronto). Use {nome} para personalizar com o primeiro nome.
 * Disparo automático em massa só com a API oficial do WhatsApp Business (paga); aqui é manual.
 */
function PromoModal({ customers, onClose }: { customers: any[]; onClose: () => void }) {
  const [msg, setMsg] = useState('Olá, {nome}! Temos uma novidade no cardápio hoje. 🔥');
  const [sent, setSent] = useState<Set<number>>(new Set());
  const textFor = (c: any) => msg.replace(/\{nome\}/gi, (c.name || '').split(' ')[0] || 'cliente');
  const copiar = () => { try { navigator.clipboard?.writeText(msg); } catch { /* */ } };
  return (
    <Modal open wide onClose={onClose} title={`Promoção por WhatsApp (${customers.length})`}>
      <Field label="Mensagem" hint="Use {nome} para personalizar com o primeiro nome do cliente.">
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} maxLength={600} />
      </Field>
      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-lenha-500">Envie um a um pelo botão. O envio automático em massa exige a API oficial do WhatsApp (paga).</p>
        <button className="text-sm font-semibold text-brasa-700 hover:underline" onClick={copiar}>Copiar mensagem</button>
      </div>
      <ul className="mt-3 max-h-80 divide-y divide-lenha-100 overflow-y-auto scroll-visible rounded-xl ring-1 ring-lenha-100">
        {customers.map((c) => (
          <li key={c.id} className={cx('flex items-center gap-3 px-3 py-2', sent.has(c.id) && 'opacity-60')}>
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.name}</span><span className="block text-xs text-lenha-500">{phoneFmt(c.phone)}</span></span>
            {sent.has(c.id) && <span className="text-xs font-semibold text-ok">enviado</span>}
            <a href={waLink(c.phone, textFor(c))} target="_blank" rel="noopener" onClick={() => setSent((s) => new Set(s).add(c.id))}
              className="inline-flex h-9 items-center rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-[#0b2a17]">WhatsApp</a>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
