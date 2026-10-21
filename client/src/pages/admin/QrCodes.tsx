import { useState } from 'react';
import { post, put, del } from '../../lib/api';
import { useAuth, useData } from '../../lib/hooks';
import { Badge, Button, Field, Input, Modal, Spinner, Toggle, useAction } from '../../components/ui';

/** Excluir mesa: confirmada com a senha do próprio administrador da empresa. */
function ExcluirMesa({ table, onClose, onDone }: { table: any; onClose: () => void; onDone: () => void }) {
  const [password, setPass] = useState('');
  const { run, busy } = useAction();
  const excluir = () => run('x', () => del(`/api/tables/${table.id}`, { password }).then(onDone), 'Mesa excluída.');
  return (
    <Modal open onClose={onClose} title={`Excluir a mesa ${table.label}`}
      footer={<Button variant="danger" className="w-full" busy={!!busy} disabled={!password} onClick={excluir}>Excluir mesa</Button>}>
      <p className="mb-3 text-sm text-lenha-600">A mesa some das listas. Se já teve pedidos, o histórico é preservado. Confirme com a sua senha de administrador.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (password) excluir(); }}>
        <Field label="Sua senha"><Input type="password" value={password} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" autoFocus /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Editar o nome (número) da mesa. */
function EditarMesa({ table, onClose, onDone }: { table: any; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState(table.label);
  const { run, busy } = useAction();
  const salvar = () => run('e', () => put(`/api/tables/${table.id}`, { label: label.trim(), seats: table.seats, active: table.active, sort: table.sort, qr_enabled: table.qr_enabled }).then(onDone), 'Nome da mesa atualizado.');
  return (
    <Modal open onClose={onClose} title={`Editar a mesa ${table.label}`}
      footer={<Button className="w-full" busy={!!busy} disabled={label.trim().length < 1 || label.trim() === table.label} onClick={salvar}>Salvar nome</Button>}>
      <form onSubmit={(e) => { e.preventDefault(); if (label.trim()) salvar(); }}>
        <Field label="Nome ou número da mesa" hint="Ex.: 7, Varanda, Balcão 2."><Input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus /></Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

const qrSrc = (url: string) => `/api/public/qrcode.svg?url=${encodeURIComponent(url)}`;

/** QR Codes do cardápio, do balcão e de cada mesa (pedido presencial). */
export default function QrCodes() {
  const { tenant, can } = useAuth();
  const tables = useData<any[]>('/api/tables/admin', ['tables'], 0);
  const settings = useData<any>('/api/admin/settings', ['settings'], 0);
  const [count, setCount] = useState('10');
  const [label, setLabel] = useState('');
  const [excluir, setExcluir] = useState<any>(null);
  const [editar, setEditar] = useState<any>(null);
  const { run, busy } = useAction();
  if (!tables.data || !tenant) return <Spinner />;
  const base = `${location.origin}/${tenant.slug}`;
  const tableUrl = (t: any) => `${base}/mesa/${t.qr_token}`;
  const s = settings.data || {};

  const printCards = (cards: { title: string; subtitle: string; url: string }[]) => {
    const w = window.open('', '_blank');
    if (!w) return;
    const logo = tenant.logo_url ? `<img src="${location.origin}${tenant.logo_url}" style="height:70px;border-radius:12px">` : `<strong style="font-size:22px">${tenant.name}</strong>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR Codes — ${tenant.name}</title><style>
      body{font-family:system-ui,sans-serif;margin:0;padding:16px;color:#0a1224} .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
      .card{border:2px solid #0a1224;border-radius:18px;padding:16px;text-align:center;break-inside:avoid} .card h2{margin:8px 0 2px;font-size:30px}
      .card p{margin:0 0 8px;font-size:14px} .card img.qr{width:62%;max-width:240px} .foot{font-size:10px;color:#5b6b85;margin-top:6px;word-break:break-all}
      @media print{body{padding:0}}</style></head><body><div class="grid">${cards.map((c) => `<div class="card">${logo}<h2>${c.title}</h2><p>${c.subtitle}</p><img class="qr" src="${location.origin}${qrSrc(c.url)}"><div class="foot">${c.url}</div></div>`).join('')}</div>
      <script>Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>print(),300))</script></body></html>`);
    w.document.close();
  };
  const active = tables.data.filter((t) => t.active);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="grid gap-4 md:grid-cols-2">
        {[{ t: 'Cardápio digital (delivery e retirada)', d: 'Para divulgar no Instagram, WhatsApp, embalagens e panfletos.', url: base },
          { t: 'Pedido no balcão', d: 'O cliente pede pelo celular e retira no balcão quando o número for chamado.', url: `${base}/balcao`, off: !s.self_order_counter_enabled }].map((x) => (
          <article key={x.url} className="flex gap-4 rounded-2xl bg-white p-4 ring-1 ring-lenha-100">
            <img src={qrSrc(x.url)} alt={`QR Code: ${x.t}`} className="size-32 shrink-0 rounded-xl bg-white p-1 ring-1 ring-lenha-100" />
            <div className="min-w-0">
              <h2 className="font-slab text-lg font-bold leading-tight">{x.t}</h2>
              <p className="text-sm text-lenha-600">{x.d}</p>
              {x.off && <Badge tone="alerta" className="mt-1">Desativado nas configurações</Badge>}
              <a href={x.url} target="_blank" className="mt-1 block truncate text-sm text-brasa-600 underline">{x.url}</a>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={qrSrc(x.url)} download="qrcode.svg"><Button size="sm" variant="outline">Baixar</Button></a>
                <Button size="sm" variant="outline" onClick={() => printCards([{ title: x.t.split(' (')[0], subtitle: 'Aponte a câmera do celular', url: x.url }])}>Imprimir</Button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-lenha-100">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-slab text-xl font-bold">QR Code de cada mesa</h2>
          {active.length > 0 && <Button className="ml-auto" onClick={() => printCards(active.filter((t) => t.qr_enabled).map((t) => ({ title: `Mesa ${t.label}`, subtitle: 'Peça pelo celular: aponte a câmera', url: tableUrl(t) })))}>Imprimir todas as mesas</Button>}
        </div>
        <p className="mt-1 text-sm text-lenha-600">
          O cliente lê o QR, faz o pedido, chama o garçom e pede a conta. {s.self_order_auto_kitchen ? 'Os pedidos vão direto para a cozinha.' : 'Os pedidos aguardam a confirmação do garçom antes de ir para a cozinha.'}
          {' '}Ajuste em Configurações → Pedido presencial.
        </p>
        {!s.self_order_enabled && <p className="mt-2 rounded-lg bg-ouro-300/60 px-3 py-2 text-sm font-semibold">Pedido pelo QR das mesas está desativado nas configurações.</p>}

        {tables.data.length === 0 && (
          <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); run('b', () => post('/api/tables/bulk', { count: Number(count) }).then(tables.reload), 'Mesas criadas.'); }}>
            <Field label="Criar mesas numeradas de 1 até"><Input inputMode="numeric" className="w-24" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} /></Field>
            <Button type="submit" busy={busy === 'b'} disabled={!(Number(count) > 0)}>Criar mesas</Button>
          </form>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tables.data.map((t) => (
            <article key={t.id} className={'rounded-xl p-3 ring-1 ring-lenha-100 ' + (t.active ? 'bg-lenha-50' : 'bg-lenha-50 opacity-50')}>
              <div className="flex items-center gap-3">
                <img src={qrSrc(tableUrl(t))} alt={`QR Code da mesa ${t.label}`} className={'size-24 rounded-lg bg-white p-1 ' + (t.qr_enabled ? '' : 'opacity-30')} />
                <div className="min-w-0 flex-1">
                  <p className="font-cond text-2xl font-bold">Mesa {t.label}</p>
                  <Toggle checked={t.qr_enabled} onChange={(v) => run('q', () => put(`/api/tables/${t.id}`, { label: t.label, seats: t.seats, active: t.active, sort: t.sort, qr_enabled: v }).then(tables.reload))} label="Pedido pelo QR" />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => printCards([{ title: `Mesa ${t.label}`, subtitle: 'Peça pelo celular: aponte a câmera', url: tableUrl(t) }])}>Imprimir</Button>
                <a href={tableUrl(t)} target="_blank"><Button size="sm" variant="ghost">Testar</Button></a>
                {can('settings.manage') && <Button size="sm" variant="ghost" onClick={() => confirm(`Gerar um novo QR para a mesa ${t.label}? O QR impresso atual deixa de funcionar.`) && run('r', () => post(`/api/tables/${t.id}/regenerate-qr`).then(tables.reload), 'Novo QR gerado. Imprima e substitua o antigo.')}>Novo QR</Button>}
                <Button size="sm" variant="ghost" onClick={() => setEditar(t)}>Editar nome</Button>
                <Button size="sm" variant="ghost" onClick={() => run('a', () => put(`/api/tables/${t.id}`, { label: t.label, seats: t.seats, active: !t.active, sort: t.sort, qr_enabled: t.qr_enabled }).then(tables.reload))}>{t.active ? 'Desativar mesa' : 'Reativar'}</Button>
                {can('settings.manage') && <Button size="sm" variant="ghost" className="text-alerta" onClick={() => setExcluir(t)}>Excluir</Button>}
              </div>
            </article>
          ))}
        </div>
        {excluir && <ExcluirMesa table={excluir} onClose={() => setExcluir(null)} onDone={() => { setExcluir(null); tables.reload(); }} />}
        {editar && <EditarMesa table={editar} onClose={() => setEditar(null)} onDone={() => { setEditar(null); tables.reload(); }} />}
        <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); run('t', () => post('/api/tables', { label, sort: tables.data!.length + 1 }).then(() => { setLabel(''); tables.reload(); }), 'Mesa adicionada.'); }}>
          <Field label="Nova mesa (nome ou número)"><Input value={label} onChange={(e) => setLabel(e.target.value)} className="w-44" /></Field>
          <Button type="submit" variant="outline" disabled={!label.trim()} busy={busy === 't'}>Adicionar</Button>
        </form>
      </section>
    </div>
  );
}
