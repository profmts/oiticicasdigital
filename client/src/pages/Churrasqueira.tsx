import { useEffect, useRef, useState } from 'react';
import { post } from '../lib/api';
import { useAuth, useData, useNow, useConnection, beep, useSoundPref } from '../lib/hooks';
import { time, minutesSince, elapsed } from '../lib/format';
import { Button, Spinner, useAction, useToast, cx } from '../components/ui';
import { TenantLogo } from '../components/brand';
import { TeamScreensMenu } from '../components/TeamNav';

const ORIGIN = (t: any) => (t.type === 'mesa' ? `Mesa ${t.table_label}` : t.type === 'delivery' ? 'Delivery' : t.type === 'retirada' ? 'Retirada' : 'Balcão');
const PENDING = (s: string) => ['enviado', 'preparo'].includes(s);
type View = 'brasa' | 'pedido' | 'anteriores';

/** Tela do churrasqueiro: mostra os espetos (setor da churrasqueira) somados por tipo e por pedido, com impressão. */
export default function Churrasqueira() {
  const { tenant } = useAuth();
  const online = useConnection();
  const [view, setView] = useState<View>('brasa');
  const [sound, toggleSound] = useSoundPref('esp_sound_churras');
  const settings = useData<any>('/api/admin/settings', ['settings'], 0);
  const sector = settings.data?.churrasqueira_sector || 'espetos';
  const url = settings.data ? `/api/kitchen/tickets?sector=${encodeURIComponent(sector)}` : null;
  const live = useData<any[]>(url, ['orders'], 15000);
  const hist = useData<any[]>(settings.data && view === 'anteriores' ? `${url}&history=1` : null, ['orders'], 15000);
  const now = useNow(10000);
  const toast = useToast();
  const seen = useRef<Set<number> | null>(null);
  const [printMode, setPrintMode] = useState<'lista' | 'comandas' | null>(null);
  const { run, busy } = useAction();
  const alertMin = settings.data?.prep_alert_minutes || 25;

  useEffect(() => {
    if (!live.data) return;
    const ids = new Set(live.data.map((t) => t.id));
    if (seen.current) {
      const novos = [...ids].filter((id) => !seen.current!.has(id));
      if (novos.length) { if (sound) beep(3); const nt = live.data.filter((t) => novos.includes(t.id)); toast('Novo espeto na brasa: ' + nt.map((t) => `#${t.number} (${ORIGIN(t)})`).join(', '), 'info'); }
    }
    seen.current = ids;
  }, [live.data]); // eslint-disable-line

  useEffect(() => { if (printMode) { const id = setTimeout(() => { window.print(); setPrintMode(null); }, 60); return () => clearTimeout(id); } }, [printMode]);

  const reload = () => { live.reload(); hist.reload(); };
  const act = (key: string, fn: () => Promise<any>) => run(key, () => fn().then(reload));
  const allLive = live.data || [];

  // "Na brasa": soma os espetos pendentes por tipo, em todos os pedidos abertos.
  const groups: Record<string, { key: string; name: string; qty: number; ids: number[]; oldest: string }> = {};
  for (const t of allLive) for (const i of t.items) {
    if (!PENDING(i.status)) continue;
    const key = i.name + (i.variant_name ? ` · ${i.variant_name}` : '');
    const g = groups[key] || (groups[key] = { key, name: key, qty: 0, ids: [], oldest: t.created_at });
    g.qty += i.qty; g.ids.push(i.id); if (t.created_at < g.oldest) g.oldest = t.created_at;
  }
  const brasa = Object.values(groups).sort((a, b) => b.qty - a.qty);

  const isHistory = view === 'anteriores';
  const loading = settings.data == null || (isHistory ? !hist.data : !live.data);
  const perPedido = isHistory ? (hist.data || []) : allLive;

  const TABS: [View, string, number | null][] = [['brasa', 'Na brasa', brasa.length], ['pedido', 'Por pedido', allLive.length], ['anteriores', 'Anteriores', null]];

  return (
    <div className="tela-equipe tech-grid min-h-dvh text-white">
      <style>{`@media print{body *{visibility:hidden}#churras-print,#churras-print *{visibility:visible}#churras-print{display:block!important;position:absolute;left:0;top:0;width:100%;color:#000;padding:10px;font-family:ui-monospace,Menlo,monospace}#churras-print h2{font-size:20px;margin:0 0 6px}#churras-print .l{display:flex;justify-content:space-between;font-size:18px;border-bottom:1px dashed #000;padding:4px 0}#churras-print .o{margin-bottom:14px}}`}</style>
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-white/10 bg-lenha-900/95 px-3 py-2 backdrop-blur">
        <TenantLogo url={tenant?.logo_url} name={tenant?.name || ''} className="size-10 rounded-lg bg-white object-contain text-xs" />
        <h1 className="font-slab text-2xl font-bold">Churrasqueira</h1>
        <nav className="flex gap-1 overflow-x-auto" aria-label="Fluxo da churrasqueira">
          {TABS.map(([v, label, count]) => (
            <button key={v} onClick={() => setView(v)} className={cx('flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-lg font-semibold', view === v ? (v === 'anteriores' ? 'bg-ouro-400 text-lenha-900' : 'bg-brasa-500') : 'bg-white/10')}>
              {label}{count != null && count > 0 && <span className={cx('grid min-w-6 place-items-center rounded-full px-1.5 text-sm', view === v ? 'bg-white/25' : 'bg-white/20')}>{count}</span>}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => setPrintMode('lista')} className="h-11 rounded-xl bg-white px-3 font-semibold text-lenha-900">Imprimir lista</button>
          <span className="font-cond text-2xl tabnums">{new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <button onClick={toggleSound} className={cx('h-11 rounded-xl px-3 font-semibold', sound ? 'bg-white/10' : 'bg-alerta')}>{sound ? 'Som ligado' : 'Som desligado'}</button>
          <span className={cx('size-3 rounded-full', online ? 'bg-green-400' : 'bg-red-500')} title={online ? 'Conectado' : 'Sem conexão'} />
          <TeamScreensMenu dark current="/churrasqueira" />
        </div>
      </header>
      {!online && <p className="bg-alerta px-4 py-2 text-center font-semibold">Sem conexão em tempo real. A tela continua atualizando a cada 15 segundos.</p>}

      {loading ? <Spinner /> : view === 'brasa' ? (
        brasa.length === 0 ? <p className="py-24 text-center font-slab text-3xl text-lenha-200">Nenhum espeto na brasa.</p> : (
          <>
            <main className="grid grid-cols-2 gap-4 p-4 pt-8 sm:grid-cols-3 lg:grid-cols-4">
              {brasa.map((g) => {
                const late = minutesSince(g.oldest, now) >= alertMin;
                return (
                  <button key={g.key} onClick={() => act(`g${g.ids[0]}`, () => post(`/api/kitchen/items/${g.ids[0]}/status`, { to: 'pronto' }))}
                    className={cx('ticket flex flex-col items-center rounded-2xl p-4 text-center text-lenha-900 shadow-xl', late ? 'ring-4 ring-alerta' : '')}>
                    {late && <span className="mb-1 rounded-full bg-alerta px-2 text-xs font-bold text-white">ATRASADO</span>}
                    <span className="text-lg font-bold leading-tight">{g.name}</span>
                    <span className="font-cond text-6xl font-black leading-none tabnums">{g.qty}</span>
                    <span className="text-sm text-lenha-500">na brasa · toque ao tirar</span>
                  </button>
                );
              })}
            </main>
            <p className="px-4 pb-10 text-sm text-lenha-200">O número é a soma de todos os pedidos abertos. Toque no espeto conforme vai tirando da brasa. Em vermelho: tem pedido esperando há mais de {alertMin} min.</p>
          </>
        )
      ) : (
        perPedido.length === 0 ? <p className="py-24 text-center font-slab text-3xl text-lenha-200">{isHistory ? 'Nada nas últimas 12 horas.' : 'Nenhum pedido com espeto.'}</p> : (
          <main className="grid grid-cols-1 gap-x-4 gap-y-8 p-4 pt-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {perPedido.map((t) => {
              const mins = minutesSince(t.created_at, now);
              const late = !isHistory && t.status !== 'pronto' && mins >= alertMin;
              const pending = t.items.filter((i: any) => PENDING(i.status));
              return (
                <article key={t.id} className="ticket flex flex-col rounded-b-2xl text-lenha-900 shadow-xl">
                  <div className={cx('flex items-start justify-between gap-2 px-4 pb-2 pt-3', late ? 'bg-alerta text-white' : t.status === 'pronto' ? 'bg-ok text-white' : 'bg-lenha-100')}>
                    <div><p className="font-cond text-4xl font-bold leading-none">#{t.number}</p><p className="text-lg font-semibold">{ORIGIN(t)}</p></div>
                    <div className="text-right"><p className="font-cond text-3xl font-bold tabnums">{elapsed(mins)}</p><p className="text-sm">entrou {time(t.created_at)}</p></div>
                  </div>
                  <ul className="flex-1 divide-y divide-lenha-100 px-2">
                    {t.items.map((i: any) => {
                      const done = ['pronto', 'entregue'].includes(i.status);
                      return (
                        <li key={i.id}>
                          <button disabled={isHistory || done || i.status === 'cancelado'} onClick={() => act(`i${i.id}`, () => post(`/api/kitchen/items/${i.id}/status`, { to: 'pronto' }))}
                            className={cx('flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left', !isHistory && !done && 'hover:bg-lenha-50', (done || i.status === 'cancelado') && 'opacity-40')}>
                            <span className="font-cond text-3xl font-bold leading-none tabnums">{i.qty}</span>
                            <span className="flex-1"><span className={cx('block text-xl font-semibold leading-tight', done && 'line-through')}>{i.name}{i.variant_name && ` · ${i.variant_name}`}</span>
                              {i.notes && <span className="mt-0.5 block rounded bg-ouro-300 px-2 text-lg font-bold">{i.notes}</span>}</span>
                            {done && <span className="text-sm font-bold text-ok">Pronto</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {!isHistory && (
                    <div className="flex gap-2 border-t border-lenha-100 p-3">
                      <button onClick={() => setPrintMode('comandas')} className="h-14 rounded-xl bg-lenha-100 px-4 font-semibold">Imprimir</button>
                      {pending.length > 0 && <Button size="lg" variant="success" className="flex-1" busy={busy === `p${t.id}`} onClick={() => act(`p${t.id}`, () => post(`/api/kitchen/tickets/${t.id}/status`, { to: 'pronto', sector }))}>Espetos prontos</Button>}
                      {pending.length === 0 && <p className="flex flex-1 items-center justify-center font-semibold text-ok">Pronto</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </main>
        )
      )}

      <div id="churras-print" style={{ display: 'none' }}>
        {printMode === 'lista' ? (
          <><h2>CHURRASQUEIRA — a assar agora</h2>{brasa.length ? brasa.map((g) => <div key={g.key} className="l"><span>{g.name}</span><b>{g.qty}</b></div>) : <p>Nada pendente.</p>}<p>{new Date().toLocaleString('pt-BR')}</p></>
        ) : printMode === 'comandas' ? (
          allLive.map((t) => <div key={t.id} className="o"><h2>Pedido #{t.number} — {ORIGIN(t)}</h2>{t.items.filter((i: any) => PENDING(i.status)).map((i: any) => <div key={i.id} className="l"><span>{i.name}{i.variant_name ? ` · ${i.variant_name}` : ''}</span><b>{i.qty}</b></div>)}</div>)
        ) : null}
      </div>
    </div>
  );
}
