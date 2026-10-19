import { useEffect, useRef, useState } from 'react';
import { post } from '../lib/api';
import { useAuth, useData, useNow, useConnection, beep, useSoundPref } from '../lib/hooks';
import { time, minutesSince, elapsed, SECTOR_LABEL } from '../lib/format';
import { Modal, Button, Input, Spinner, useAction, cx } from '../components/ui';
import { TenantLogo } from '../components/brand';

const ORIGIN = (t: any) => (t.type === 'mesa' ? `Mesa ${t.table_label}` : t.type === 'delivery' ? 'Delivery' : t.type === 'retirada' ? 'Retirada' : 'Balcão');

export default function Kitchen() {
  const { me, logout, tenant } = useAuth();
  const online = useConnection();
  const [sector, setSector] = useState('');
  const [history, setHistory] = useState(false);
  const [sound, toggleSound] = useSoundPref('esp_sound_kds');
  const url = `/api/kitchen/tickets?${sector ? `sector=${sector}&` : ''}${history ? 'history=1' : ''}`;
  const { data, reload } = useData<any[]>(url, ['orders'], 15000);
  const settings = useData<any>('/api/admin/settings', ['settings'], 0);
  const now = useNow(10000);
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [ask, setAsk] = useState<any>(null);
  const { run, busy } = useAction();
  const alertMin = settings.data?.prep_alert_minutes || 25;

  // alerta sonoro para tickets novos
  useEffect(() => {
    if (!data || history) return;
    const ids = new Set(data.map((t) => t.id));
    if (seen.current) {
      const novos = [...ids].filter((id) => !seen.current!.has(id));
      if (novos.length) { if (sound) beep(3); setFresh(new Set(novos)); setTimeout(() => setFresh(new Set()), 5000); }
    }
    seen.current = ids;
  }, [data]); // eslint-disable-line

  const act = (key: string, fn: () => Promise<any>) => run(key, () => fn().then(reload));
  const sectors = settings.data?.kitchen_sectors || ['espetos', 'porcoes', 'bebidas'];
  const list = data || [];

  return (
    <div className="tela-equipe tech-grid min-h-dvh text-white">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-white/10 bg-lenha-900/95 px-3 py-2 backdrop-blur">
        <TenantLogo url={tenant?.logo_url} name={tenant?.name || ''} className="size-10 rounded-lg bg-white object-contain text-xs" />
        <h1 className="font-slab text-2xl font-bold">Cozinha</h1>
        <nav className="flex gap-1 overflow-x-auto" aria-label="Setores">
          {['', ...sectors].map((s: string) => (
            <button key={s} onClick={() => setSector(s)} className={cx('h-11 shrink-0 rounded-xl px-4 text-lg font-semibold', sector === s ? 'bg-brasa-500' : 'bg-white/10')}>{s ? SECTOR_LABEL[s] || s : 'Tudo'}</button>
          ))}
        </nav>
        <button onClick={() => setHistory((h) => !h)} className={cx('h-11 rounded-xl px-4 font-semibold', history ? 'bg-ouro-400 text-lenha-900' : 'bg-white/10')}>{history ? 'Voltar à fila' : 'Anteriores'}</button>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-cond text-2xl tabnums">{new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <button onClick={toggleSound} className={cx('h-11 rounded-xl px-3 font-semibold', sound ? 'bg-white/10' : 'bg-alerta')}>{sound ? 'Som ligado' : 'Som desligado'}</button>
          <span className={cx('size-3 rounded-full', online ? 'bg-green-400' : 'bg-red-500')} title={online ? 'Conectado' : 'Sem conexão — reconectando'} />
          <span className="hidden text-sm text-lenha-200 md:inline">{me?.name}</span>
          {me?.home?.startsWith('/admin') && <a href={me.home} className="flex h-11 items-center gap-1 rounded-xl bg-white/10 px-3 text-sm font-semibold hover:bg-white/20" title="Voltar ao painel administrativo"><svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>Painel</a>}
          <button onClick={logout} className="h-11 rounded-xl px-3 text-sm hover:bg-white/10">Sair</button>
        </div>
      </header>
      {!online && <p className="bg-alerta px-4 py-2 text-center font-semibold">Sem conexão em tempo real. A tela continua atualizando a cada 15 segundos.</p>}

      {!data ? <Spinner /> : list.length === 0 ? (
        <p className="py-24 text-center font-slab text-3xl text-lenha-200">{history ? 'Nada nas últimas 12 horas.' : 'Nenhum pedido na fila.'}</p>
      ) : (
        <main className="grid grid-cols-1 gap-x-4 gap-y-8 p-4 pt-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map((t) => {
            const mins = minutesSince(t.created_at, now);
            const late = !history && t.status !== 'pronto' && mins >= alertMin;
            const pending = t.items.filter((i: any) => ['enviado', 'preparo'].includes(i.status));
            return (
              <article key={t.id} className={cx('ticket flex flex-col rounded-b-2xl text-lenha-900 shadow-xl', fresh.has(t.id) && 'pulse-new')}>
                <div className={cx('flex items-start justify-between gap-2 px-4 pb-2 pt-3', late ? 'bg-alerta text-white' : t.status === 'pronto' ? 'bg-ok text-white' : t.status === 'preparo' ? 'bg-ouro-400' : 'bg-lenha-100')}>
                  <div>
                    <p className="font-cond text-4xl font-bold leading-none">#{t.number}{t.seq > 1 && <span className="text-2xl"> · {t.seq}ª</span>}</p>
                    <p className="text-lg font-semibold">{ORIGIN(t)}{t.customer_first_name && t.type !== 'mesa' ? ` · ${t.customer_first_name}` : ''}{t.waiter_name && t.type === 'mesa' ? ` · ${t.waiter_name.split(' ')[0]}` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-cond text-3xl font-bold tabnums">{elapsed(mins)}</p>
                    <p className="text-sm">entrou {time(t.created_at)}</p>
                    {t.priority > 0 && <p className="mt-1 rounded bg-lenha-900 px-2 text-sm font-bold text-white">Prioridade</p>}
                  </div>
                </div>
                {t.note && <p className="bg-ouro-300 px-4 py-2 text-lg font-semibold">{t.note}</p>}
                {t.question && <p className="bg-red-100 px-4 py-2 font-semibold text-alerta">Dúvida enviada: {t.question}</p>}
                <ul className="flex-1 divide-y divide-lenha-100 px-2">
                  {t.items.map((i: any) => {
                    const done = ['pronto', 'entregue'].includes(i.status);
                    return (
                      <li key={i.id}>
                        <button disabled={history || done || i.status === 'cancelado'} onClick={() => act(`i${i.id}`, () => post(`/api/kitchen/items/${i.id}/status`, { to: 'pronto' }))}
                          className={cx('flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left', !history && !done && 'hover:bg-lenha-50', (done || i.status === 'cancelado') && 'opacity-40')}>
                          <span className="font-cond text-3xl font-bold leading-none tabnums">{i.qty}</span>
                          <span className="flex-1">
                            <span className={cx('block text-xl font-semibold leading-tight', (done || i.status === 'cancelado') && 'line-through')}>{i.name}{i.variant_name && ` · ${i.variant_name}`}</span>
                            {i.options.length > 0 && <span className="block text-lg">{i.options.map((x: any) => x.name).join(', ')}</span>}
                            {i.notes && <span className="mt-0.5 block rounded bg-ouro-300 px-2 text-lg font-bold">{i.notes}</span>}
                            {!sector && <span className="text-sm text-lenha-500">{SECTOR_LABEL[i.sector] || i.sector}</span>}
                          </span>
                          {done && <span className="text-sm font-bold text-ok">Pronto</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!history && (
                  <div className="flex gap-2 border-t border-lenha-100 p-3">
                    <button onClick={() => setAsk(t)} className="h-14 rounded-xl bg-lenha-100 px-4 font-semibold" aria-label="Pedir esclarecimento ao atendimento">?</button>
                    {t.status === 'novo' && <Button size="lg" className="flex-1" variant="dark" busy={busy === `s${t.id}`} onClick={() => act(`s${t.id}`, () => post(`/api/kitchen/tickets/${t.id}/status`, { to: 'preparo', sector: sector || undefined }))}>Aceitar e iniciar</Button>}
                    {pending.length > 0 && t.status !== 'novo' && <Button size="lg" variant="success" className="flex-1" busy={busy === `p${t.id}`} onClick={() => act(`p${t.id}`, () => post(`/api/kitchen/tickets/${t.id}/status`, { to: 'pronto', sector: sector || undefined }))}>{sector ? `${SECTOR_LABEL[sector] || sector} prontos` : 'Pedido pronto'}</Button>}
                    {pending.length === 0 && <p className="flex flex-1 items-center justify-center font-semibold text-ok">Pronto · aguardando retirada</p>}
                  </div>
                )}
              </article>
            );
          })}
        </main>
      )}
      {ask && <AskDialog ticket={ask} onClose={() => { setAsk(null); reload(); }} />}
    </div>
  );
}

function AskDialog({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const [text, setText] = useState(ticket.question || '');
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title={`Dúvida sobre o pedido #${ticket.number}`}
      footer={<div className="flex gap-2">{ticket.question && <Button variant="outline" className="flex-1" onClick={() => run('c', () => post(`/api/kitchen/tickets/${ticket.id}/question`, { text: '' }).then(onClose))}>Marcar como resolvida</Button>}<Button className="flex-1" busy={!!busy} disabled={!text.trim()} onClick={() => run('q', () => post(`/api/kitchen/tickets/${ticket.id}/question`, { text }).then(onClose), 'Dúvida enviada ao atendimento.')}>Enviar ao atendimento</Button></div>}>
      <p className="mb-3 text-lenha-700">O atendimento e o garçom veem a dúvida no pedido.</p>
      <div className="mb-3 flex flex-wrap gap-2">{['Item em falta', 'Confirmar ponto da carne', 'Observação não entendida'].map((s) => <button key={s} onClick={() => setText(s)} className="rounded-full bg-lenha-100 px-3 py-1.5 text-sm">{s}</button>)}</div>
      <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} />
    </Modal>
  );
}

