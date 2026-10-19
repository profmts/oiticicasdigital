import { useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { useAuth, useData, useConnection, beep } from '../lib/hooks';
import { money, time, phoneFmt, mapsLink, waLink, STATUS_LABEL } from '../lib/format';
import { PaymentDialog } from '../components/PaymentDialog';
import { Badge, Button, Modal, Spinner, Textarea, Toggle, useAction, cx } from '../components/ui';
import { TenantLogo } from '../components/brand';

const PAY: Record<string, string> = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito' };

export default function Courier() {
  const { me, logout, tenant } = useAuth();
  const online = useConnection();
  const { data, reload } = useData<any>('/api/courier/deliveries', ['orders'], 20000);
  const [methods, setMethods] = useState<any[]>([]);
  const [city, setCity] = useState('');
  const [deliver, setDeliver] = useState<any>(null);
  const [fail, setFail] = useState<any>(null);
  const [note, setNote] = useState<any>(null);
  const [known, setKnown] = useState<string>('');
  const { run, busy } = useAction();
  useEffect(() => { get('/api/admin/settings').then((s) => { setMethods(s.payment_methods || []); setCity(s.city || ''); }).catch(() => {}); }, []);
  const ids = (data?.deliveries || []).filter((d: any) => d.status !== 'concluido').map((d: any) => d.id).join(',');
  useEffect(() => { if (known && ids && ids !== known && ids.split(',').some((i) => !known.split(',').includes(i))) beep(2); setKnown(ids); }, [ids]); // eslint-disable-line

  const active = (data?.deliveries || []).filter((d: any) => d.status !== 'concluido');
  const done = (data?.deliveries || []).filter((d: any) => d.status === 'concluido');

  return (
    <div className="tela-equipe min-h-dvh pb-8">
      <header className="tech-grid sticky top-0 z-20 flex items-center gap-3 px-4 py-3 text-white">
        <TenantLogo url={tenant?.logo_url} name={tenant?.name || ''} className="size-10 rounded-lg bg-white object-contain text-xs" />
        <div className="leading-tight"><p className="font-slab text-lg font-bold">Minhas entregas</p><p className="text-sm text-lenha-200">{me?.name}</p></div>
        <span className={cx('ml-auto size-2.5 rounded-full', online ? 'bg-green-400' : 'bg-red-400')} />
        {me?.home?.startsWith('/admin') && <a href={me.home} className="flex h-9 items-center gap-1 rounded-full bg-white/10 px-3 text-sm font-semibold hover:bg-white/20" title="Voltar ao painel administrativo"><svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>Painel</a>}
        <button onClick={logout} className="h-9 rounded-full px-3 text-sm font-semibold hover:bg-white/10">Sair</button>
      </header>
      <main className="mx-auto max-w-lg space-y-4 p-3">
        {data && (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
            <Toggle checked={data.available} onChange={(v) => run('av', () => post('/api/courier/availability', { available: v }).then(reload))} label={data.available ? 'Disponível para novas entregas' : 'Indisponível (pausa)'} />
          </div>
        )}
        {!data ? <Spinner /> : active.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-lenha-200 py-12 text-center text-lenha-500">Nenhuma entrega atribuída a você agora.</p>
        ) : active.map((d: any) => {
          const balance = d.total_cents - d.paid_cents;
          return (
            <article key={d.id} className={cx('overflow-hidden rounded-2xl bg-white shadow-sm ring-1', d.status === 'saiu_entrega' ? 'ring-2 ring-brasa-500' : 'ring-lenha-100')}>
              <div className="flex items-center gap-2 border-b border-lenha-100 px-4 py-3">
                <span className="font-cond text-3xl font-bold">#{d.number}</span>
                <Badge tone={d.status === 'pronto' ? 'ok' : d.status === 'saiu_entrega' ? 'brasa' : 'neutral'}>{d.status === 'pronto' ? (d.picked_up ? 'Coletado' : 'Pronto para coleta') : STATUS_LABEL[d.status]}</Badge>
                <span className="ml-auto text-sm text-lenha-500">{d.dispatched_at ? `saiu ${time(d.dispatched_at)}` : `pedido ${time(d.created_at)}`}</span>
              </div>
              <div className="space-y-2 px-4 py-3">
                <p className="text-lg font-semibold">{d.customer_name}</p>
                <p>{d.address?.street}, {d.address?.number}{d.address?.complement && ` — ${d.address.complement}`}<br /><strong>{d.address?.neighborhood}</strong>{d.address?.reference && <><br /><span className="text-lenha-600">Ref.: {d.address.reference}</span></>}</p>
                <div className="grid grid-cols-3 gap-2">
                  <a href={mapsLink(d.address || {}, city)} target="_blank" rel="noopener" className="flex h-11 items-center justify-center rounded-xl bg-lenha-900 font-semibold text-white">Rota</a>
                  <a href={`tel:${d.customer_phone}`} className="flex h-11 items-center justify-center rounded-xl border border-lenha-200 font-semibold">Ligar</a>
                  <a href={waLink(d.customer_phone, `Olá! Sou o entregador do ${tenant?.name || 'restaurante'} com o seu pedido #${d.number}.`)} target="_blank" rel="noopener" className="flex h-11 items-center justify-center rounded-xl bg-[#25D366] font-semibold text-lenha-900">WhatsApp</a>
                </div>
                <p className="text-sm text-lenha-500">{phoneFmt(d.customer_phone)}</p>
                {d.notes && <p className="rounded-lg bg-ouro-300/50 px-3 py-2 text-sm">Obs.: {d.notes}</p>}
                <details className="text-sm"><summary className="cursor-pointer font-semibold">{d.items.reduce((a: number, i: any) => a + i.qty, 0)} itens</summary>
                  <ul className="mt-1">{d.items.map((i: any, k: number) => <li key={k}>{i.qty}x {i.name}{i.variant_name && ` · ${i.variant_name}`}</li>)}</ul></details>
                <div className={cx('rounded-xl px-3 py-2', balance > 0 ? 'bg-brasa-50' : 'bg-green-50')}>
                  {balance > 0 ? <p><strong>Cobrar {money(balance)}</strong> — {PAY[d.payment_hint] || d.payment_hint || 'forma não informada'}{d.change_for_cents ? ` · levar troco para ${money(d.change_for_cents)} (troco de ${money(d.change_for_cents - balance)})` : ''}</p>
                    : <p className="font-semibold text-ok">Já pago — não cobrar</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-lenha-100 p-3">
                {d.status === 'pronto' && !d.picked_up && <Button className="flex-1" variant="outline" busy={busy === `pk${d.id}`} onClick={() => run(`pk${d.id}`, () => post(`/api/courier/orders/${d.id}/pickup`).then(reload), 'Coleta confirmada.')}>Confirmar coleta</Button>}
                {d.status === 'pronto' && <Button className="flex-1" busy={busy === `ds${d.id}`} onClick={() => run(`ds${d.id}`, () => post(`/api/courier/orders/${d.id}/dispatch`).then(reload), 'Saída registrada.')}>Saí para entrega</Button>}
                {['confirmado', 'em_preparo'].includes(d.status) && <p className="flex-1 py-2 text-center text-sm text-lenha-500">Aguardando a cozinha terminar.</p>}
                {d.status === 'saiu_entrega' && (
                  <>
                    <Button className="flex-1" variant="success" size="lg" onClick={() => (balance > 0 ? setDeliver(d) : run(`dl${d.id}`, () => post(`/api/courier/orders/${d.id}/delivered`, {}).then(reload), 'Entrega concluída.'))}>Entregue</Button>
                    <Button variant="outline" size="lg" onClick={() => setFail(d)}>Não entregue</Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setNote(d)}>Anotar ocorrência</Button>
              </div>
            </article>
          );
        })}
        {done.length > 0 && (
          <section>
            <h2 className="mb-2 font-slab text-lg font-bold">Concluídas hoje</h2>
            <ul className="divide-y divide-lenha-100 rounded-2xl bg-white ring-1 ring-lenha-100">
              {done.map((d: any) => <li key={d.id} className="flex justify-between px-4 py-2 text-sm"><span>#{d.number} · {d.address?.neighborhood}</span><span className="text-lenha-500">entregue {time(d.delivered_at)}</span></li>)}
            </ul>
          </section>
        )}
      </main>
      {deliver && <PaymentDialog title={`Recebido na entrega #${deliver.number}`} order={deliver} methods={methods} onClose={() => setDeliver(null)}
        url={`/api/courier/orders/${deliver.id}/delivered`} onDone={() => { setDeliver(null); reload(); }} />}
      {fail && <TextDialog title={`Entrega #${fail.number} sem sucesso`} cta="Registrar e voltar" hint="O pedido volta para a fila de despacho." onClose={() => setFail(null)}
        onSubmit={(t) => post(`/api/courier/orders/${fail.id}/failed`, { note: t }).then(() => { setFail(null); reload(); })} />}
      {note && <TextDialog title={`Ocorrência no pedido #${note.number}`} cta="Salvar ocorrência" onClose={() => setNote(null)}
        onSubmit={(t) => post(`/api/courier/note/${note.id}`, { note: t }).then(() => setNote(null))} />}
    </div>
  );
}

function TextDialog({ title, cta, hint, onClose, onSubmit }: { title: string; cta: string; hint?: string; onClose: () => void; onSubmit: (t: string) => Promise<any> }) {
  const [t, setT] = useState('');
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title={title} footer={<Button className="w-full" busy={!!busy} disabled={t.trim().length < 3} onClick={() => run('x', () => onSubmit(t.trim()), 'Registrado.')}>{cta}</Button>}>
      {hint && <p className="mb-3 text-sm text-lenha-600">{hint}</p>}
      <div className="mb-3 flex flex-wrap gap-2">{['Cliente ausente', 'Endereço não encontrado', 'Telefone não atende', 'Cliente recusou'].map((s) => <button key={s} onClick={() => setT(s)} className="rounded-full bg-lenha-100 px-3 py-1.5 text-sm">{s}</button>)}</div>
      <Textarea value={t} onChange={(e) => setT(e.target.value)} maxLength={300} />
    </Modal>
  );
}
