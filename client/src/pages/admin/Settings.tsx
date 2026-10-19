import { useEffect, useState } from 'react';
import { api, post, put } from '../../lib/api';
import { useData } from '../../lib/hooks';
import { money, parseMoney, centsToInput } from '../../lib/format';
import { Button, Field, Input, Modal, MoneyInput, Select, Spinner, Textarea, Toggle, useAction, cx } from '../../components/ui';
import { useAuth } from '../../lib/hooks';
import { tenantTheme } from '../../lib/theme';
import { TenantLogo } from '../../components/brand';

const Section = ({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) => (
  <section className="rounded-2xl bg-white p-5 ring-1 ring-lenha-100">
    <h2 className="font-slab text-xl font-bold">{title}</h2>
    {desc && <p className="mb-3 text-sm text-lenha-600">{desc}</p>}
    <div className={desc ? '' : 'mt-3'}>{children}</div>
  </section>
);

// Todas as chaves de configuração editadas nesta tela (salvas de uma vez pelo botão geral).
// is_open fica de fora: é controlada pelo botão Abrir/Fechar loja no topo do painel.
const ALL_KEYS = [
  'store_name', 'slogan', 'whatsapp', 'whatsapp_display', 'address', 'city', 'instagram', 'timezone',
  'closed_message', 'accept_delivery', 'accept_pickup', 'allow_unlisted_neighborhood', 'min_order_cents',
  'delivery_estimate_minutes', 'pickup_estimate_minutes', 'prep_alert_minutes', 'payment_methods', 'pix_key',
  'banners', 'kitchen_sectors', 'self_order_enabled', 'self_order_auto_kitchen', 'self_order_counter_enabled',
  'hide_table_13', 'team_pin', 'brand_color', 'brand_dark', 'menu_font',
];

export default function Settings() {
  const { data, reload } = useData<any>('/api/admin/settings', ['settings'], 0);
  const [s, setS] = useState<any>(null);
  const { run, busy } = useAction();
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw, setResetPw] = useState('');
  useEffect(() => { if (data) setS({ ...data, min_order: centsToInput(data.min_order_cents || 0) }); }, [data]);
  if (!s) return <Spinner />;
  const set = (k: string, v: any) => setS((x: any) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v.replace(/\D/g, '')) || null);

  // Monta o corpo com todas as chaves, convertendo o pedido mínimo para centavos.
  const buildBody = () => {
    const body: any = Object.fromEntries(ALL_KEYS.map((k) => [k, s[k]]));
    body.min_order_cents = parseMoney(s.min_order || '0') || 0;
    return body;
  };
  const dirty = !!data && ALL_KEYS.some((k) => {
    const v = k === 'min_order_cents' ? (parseMoney(s.min_order || '0') || 0) : s[k];
    return JSON.stringify(v) !== JSON.stringify(data[k]);
  });
  const saveAll = () => run('save', () => put('/api/admin/settings', buildBody()).then(reload), 'Configurações salvas.');
  const doReset = () => run('reset', async () => {
    const r = await post('/api/admin/settings/reset', { password: resetPw });
    setS({ ...r, min_order: centsToInput(r.min_order_cents || 0) });
    await reload();
    setResetOpen(false); setResetPw('');
  }, 'Configurações redefinidas para o padrão de fábrica.');

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-24">
      <Section title="Estabelecimento">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome"><Input value={s.store_name} onChange={(e) => set('store_name', e.target.value)} /></Field>
          <Field label="Frase do cardápio"><Input value={s.slogan} onChange={(e) => set('slogan', e.target.value)} /></Field>
          <Field label="WhatsApp de pedidos (com 55 e DDD)" hint="Ex.: 5583999999999"><Input value={s.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} inputMode="tel" /></Field>
          <Field label="WhatsApp como aparece para o cliente"><Input value={s.whatsapp_display} onChange={(e) => set('whatsapp_display', e.target.value)} /></Field>
          <Field label="Endereço" className="sm:col-span-2"><Textarea value={s.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label="Cidade"><Input value={s.city || ''} onChange={(e) => set('city', e.target.value)} placeholder="Ex.: Cajazeiras - PB" /></Field>
          <Field label="Instagram (opcional)"><Input value={s.instagram} onChange={(e) => set('instagram', e.target.value)} placeholder="@perfil" /></Field>
          <Field label="Fuso horário (relatórios)"><Select value={s.timezone || 'America/Fortaleza'} onChange={(e) => set('timezone', e.target.value)}>
            {['America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Sao_Paulo', 'America/Belem', 'America/Manaus', 'America/Cuiaba', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha'].map((z) => <option key={z}>{z}</option>)}</Select></Field>
        </div>
      </Section>

      <Branding s={s} set={set} busy={busy} />

      <Section title="Pedido presencial pelo QR Code" desc="Os QR Codes das mesas e do balcão ficam no menu QR Codes.">
        <div className="space-y-3">
          <Toggle checked={!!s.self_order_enabled} onChange={(v) => set('self_order_enabled', v)} label="Clientes podem pedir pelo QR Code da mesa" />
          <Toggle checked={!!s.self_order_auto_kitchen} onChange={(v) => set('self_order_auto_kitchen', v)} label="Enviar pedidos do QR direto para a cozinha (sem confirmação do garçom)" />
          <Toggle checked={!!s.self_order_counter_enabled} onChange={(v) => set('self_order_counter_enabled', v)} label="QR do balcão: cliente pede e retira no balcão (equipe confirma)" />
          <p className="text-sm text-lenha-600">Recomendado: deixar a confirmação do garçom ligada no começo, para evitar pedidos feitos por quem não está na mesa.</p>
        </div>
      </Section>

      <Section title="Mesas" desc="Ajustes das mesas do salão.">
        <Toggle checked={!!s.hide_table_13} onChange={(v) => set('hide_table_13', v)} label="Ocultar a mesa 13 (pula o número 13 no salão e no QR, sem apagar a mesa)" />
      </Section>

      <Section title="Acesso da equipe por PIN" desc="Com um PIN definido, a tela de acesso mostra os perfis da equipe para escolher e pedir só a senha. Deixe em branco para manter o login tradicional (usuário e senha digitados).">
        <Field label="PIN da loja (somente números, 4 a 8 dígitos)" hint="O aparelho lembra o PIN depois da primeira vez. Compartilhe só com a equipe.">
          <Input value={s.team_pin || ''} inputMode="numeric" maxLength={8} placeholder="ex.: 2468" onChange={(e) => set('team_pin', e.target.value.replace(/\D/g, ''))} className="w-40" />
        </Field>
      </Section>

      <Section title="Funcionamento e pedidos online" desc="Abra e feche a loja pelo botão no topo do painel. Tempos estimados e pedido mínimo só aparecem para o cliente quando preenchidos.">
        <div className="space-y-3">
          <Toggle checked={s.accept_delivery} onChange={(v) => set('accept_delivery', v)} label="Aceitar pedidos para entrega" />
          <Toggle checked={s.accept_pickup} onChange={(v) => set('accept_pickup', v)} label="Aceitar pedidos para retirada" />
          <Toggle checked={s.allow_unlisted_neighborhood} onChange={(v) => set('allow_unlisted_neighborhood', v)} label="Aceitar bairros fora da lista (taxa combinada na confirmação)" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Pedido mínimo" hint="0 = sem mínimo"><MoneyInput value={s.min_order} onChange={(v) => set('min_order', v)} /></Field>
            <Field label="Tempo de entrega (min)"><Input inputMode="numeric" value={s.delivery_estimate_minutes ?? ''} onChange={(e) => set('delivery_estimate_minutes', num(e.target.value))} /></Field>
            <Field label="Tempo de retirada (min)"><Input inputMode="numeric" value={s.pickup_estimate_minutes ?? ''} onChange={(e) => set('pickup_estimate_minutes', num(e.target.value))} /></Field>
          </div>
          <Field label="Mensagem quando fechado"><Input value={s.closed_message} onChange={(e) => set('closed_message', e.target.value)} /></Field>
        </div>
      </Section>

      <Zones />

      <Section title="Formas de pagamento" desc="Desative as que não aceita. “No cardápio” define se o cliente pode escolher ao pedir online.">
        <ul className="space-y-2">
          {s.payment_methods.map((m: any, i: number) => (
            <li key={m.id} className="flex flex-wrap items-center gap-4 rounded-xl bg-lenha-50 px-3 py-2">
              <Input className="w-56" value={m.name} onChange={(e) => set('payment_methods', s.payment_methods.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Nome" />
              <Toggle checked={m.active} onChange={(v) => set('payment_methods', s.payment_methods.map((x: any, j: number) => (j === i ? { ...x, active: v } : x)))} label="Ativa" />
              <Toggle checked={m.online} onChange={(v) => set('payment_methods', s.payment_methods.map((x: any, j: number) => (j === i ? { ...x, online: v } : x)))} label="No cardápio" />
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => { const name = prompt('Nome da forma de pagamento (ex.: Vale-refeição)'); if (name) set('payment_methods', [...s.payment_methods, { id: name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30), name, active: true, online: false }]); }}>+ Outra forma</Button>
        <Field label="Chave Pix (mostrada ao cliente que escolher Pix)" className="mt-3"><Input value={s.pix_key} onChange={(e) => set('pix_key', e.target.value)} /></Field>
      </Section>

      <Section title="Cozinha">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Alerta de atraso (minutos)" hint="Pedidos acima deste tempo ficam em vermelho no Kanban e na cozinha."><Input inputMode="numeric" value={s.prep_alert_minutes} onChange={(e) => set('prep_alert_minutes', Number(e.target.value.replace(/\D/g, '')) || 1)} /></Field>
          <Field label="Setores de preparo" hint="Separados por vírgula. Ex.: espetos, porcoes, bebidas"><Input value={s.kitchen_sectors.join(', ')} onChange={(e) => set('kitchen_sectors', e.target.value.split(',').map((x: string) => x.trim()).filter(Boolean))} /></Field>
        </div>
      </Section>

      <Section title="Banners do cardápio" desc="Destaques rotativos no topo do cardápio. “Categoria” leva o cliente até ela ao tocar.">
        <div className="space-y-2">
          {s.banners.map((b: any, i: number) => (
            <div key={i} className="grid gap-2 rounded-xl bg-lenha-50 p-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
              <Input value={b.title} placeholder="Título" onChange={(e) => set('banners', s.banners.map((x: any, j: number) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label="Título" />
              <Input value={b.subtitle} placeholder="Texto" onChange={(e) => set('banners', s.banners.map((x: any, j: number) => (j === i ? { ...x, subtitle: e.target.value } : x)))} aria-label="Texto" />
              <Input value={b.category || ''} placeholder="Categoria" onChange={(e) => set('banners', s.banners.map((x: any, j: number) => (j === i ? { ...x, category: e.target.value } : x)))} aria-label="Categoria" />
              <button className="px-2 text-xl text-alerta" aria-label="Remover banner" onClick={() => set('banners', s.banners.filter((_: any, j: number) => j !== i))}>×</button>
            </div>
          ))}
          {s.banners.length < 8 && <Button variant="ghost" size="sm" onClick={() => set('banners', [...s.banners, { title: '', subtitle: '', category: '' }])}>+ Banner</Button>}
        </div>
      </Section>

      <BackupSection />

      <Section title="Redefinir configurações" desc="Volta os ajustes de funcionamento, pagamentos, cozinha, banners e identidade visual para o padrão de fábrica. Mantém o nome, contatos, endereço, fuso, PIN e chave Pix da empresa. NÃO apaga pedidos, clientes, produtos nem caixa.">
        <Button variant="outline" onClick={() => { setResetPw(''); setResetOpen(true); }}>Redefinir para padrão de fábrica</Button>
      </Section>

      {/* Barra fixa: salvar tudo de uma vez, com aviso de alterações não salvas. */}
      <div className="no-print sticky bottom-0 z-10 -mx-3 border-t border-lenha-100 bg-papel/95 px-3 py-3 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <span className={cx('text-sm font-semibold', dirty ? 'text-brasa-700' : 'text-lenha-500')}>
            {dirty ? '● Você tem alterações não salvas.' : 'Tudo salvo.'}
          </span>
          <Button className="ml-auto" busy={busy === 'save'} disabled={!dirty} onClick={saveAll}>Salvar todas as alterações</Button>
        </div>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Redefinir para o padrão de fábrica"
        footer={<div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setResetOpen(false)}>Cancelar</Button><Button className="flex-1" busy={busy === 'reset'} disabled={!resetPw} onClick={doReset}>Redefinir</Button></div>}>
        <p className="mb-3 text-sm text-lenha-700">Os ajustes de funcionamento, pagamentos, cozinha, banners e identidade visual voltam ao padrão. Nome, contatos, endereço, fuso, PIN e chave Pix são mantidos. Nenhum pedido, cliente, produto ou caixa é apagado.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (resetPw) doReset(); }}>
          <Field label="Confirme com a sua senha"><Input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} autoComplete="current-password" autoFocus /></Field>
          <button type="submit" hidden />
        </form>
      </Modal>
    </div>
  );
}

function Zones() {
  const zones = useData<any[]>('/api/zones', [], 0);
  const [n, setN] = useState({ name: '', fee: '', min: '', eta: '' });
  const { run, busy } = useAction();
  return (
    <Section title="Bairros e taxas de entrega" desc="Cadastre os bairros atendidos com a taxa de cada um. Nenhuma taxa é cobrada automaticamente sem estar cadastrada aqui. Os bairros são salvos na hora, sem depender do botão geral.">
      {zones.data?.length === 0 && <p className="mb-3 rounded-lg bg-ouro-300/40 px-3 py-2 text-sm">Nenhum bairro cadastrado: pedidos de entrega ficam com a taxa “a confirmar”, definida na confirmação.</p>}
      <ul className="divide-y divide-lenha-100">
        {zones.data?.map((z) => (
          <li key={z.id} className={cx('flex flex-wrap items-center gap-3 py-2', !z.active && 'opacity-50')}>
            <span className="flex-1 font-semibold">{z.name}</span><span className="tabnums">{money(z.fee_cents)}</span>
            {z.min_order_cents ? <span className="text-sm text-lenha-500">mín. {money(z.min_order_cents)}</span> : null}
            <Toggle checked={!!z.active} onChange={(v) => run('z', () => put(`/api/zones/${z.id}`, { ...z, active: v }).then(zones.reload))} label="Ativo" />
            <button className="text-sm font-semibold text-brasa-700" onClick={() => { const fee = prompt(`Nova taxa para ${z.name} (R$)`, centsToInput(z.fee_cents)); if (fee != null && Number.isFinite(parseMoney(fee))) run('z', () => put(`/api/zones/${z.id}`, { ...z, active: !!z.active, fee_cents: parseMoney(fee) }).then(zones.reload), 'Taxa atualizada.'); }}>Alterar taxa</button>
          </li>
        ))}
      </ul>
      <form className="mt-3 grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); run('nz', () => post('/api/zones', { name: n.name, fee_cents: parseMoney(n.fee), min_order_cents: n.min ? parseMoney(n.min) : null, estimated_minutes: n.eta ? Number(n.eta) : null }).then(() => { setN({ name: '', fee: '', min: '', eta: '' }); zones.reload(); }), 'Bairro cadastrado.'); }}>
        <Input placeholder="Bairro" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} aria-label="Bairro" />
        <MoneyInput placeholder="Taxa" value={n.fee} onChange={(v) => setN({ ...n, fee: v })} aria-label="Taxa" />
        <MoneyInput placeholder="Mínimo" value={n.min} onChange={(v) => setN({ ...n, min: v })} aria-label="Pedido mínimo" />
        <Input placeholder="Min. entrega" inputMode="numeric" value={n.eta} onChange={(e) => setN({ ...n, eta: e.target.value.replace(/\D/g, '') })} aria-label="Tempo estimado" />
        <Button type="submit" busy={busy === 'nz'} disabled={n.name.length < 2 || !Number.isFinite(parseMoney(n.fee))}>Adicionar</Button>
      </form>
    </Section>
  );
}

function BackupSection() {
  return (
    <Section title="Seus dados" desc="O banco de dados da plataforma tem backup automático no servidor. Você também pode baixar uma cópia completa dos dados da sua empresa (pedidos, clientes, produtos, caixa e despesas) a qualquer momento.">
      <a href="/api/admin/export" download><Button variant="dark">Baixar meus dados (JSON)</Button></a>
    </Section>
  );
}

// Caixa de cor: um quadrado grande e clicável, sem precisar digitar o código.
function ColorBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-lenha-200 bg-white p-2 hover:border-brasa-400">
        <span className="size-12 shrink-0 rounded-lg ring-1 ring-lenha-200" style={{ backgroundColor: value }} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Toque para escolher a cor</span>
          <span className="block text-xs uppercase tracking-wide text-lenha-500">{value}</span>
        </span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="size-10 shrink-0 cursor-pointer rounded-lg border border-lenha-200 bg-white" aria-label={label} />
      </label>
    </Field>
  );
}

function Branding({ s, set, busy }: { s: any; set: (k: string, v: any) => void; busy: string | null }) {
  const { tenant, refresh } = useAuth();
  const { run } = useAction();
  const upload = async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    await run('logo', async () => { const r = await api('POST', '/api/uploads', fd); await post('/api/admin/logo', { file_id: r.id }); await refresh(); }, 'Logo atualizada.');
  };
  return (
    <Section title="Identidade visual do cardápio" desc="Logo e cores que o cliente vê no cardápio digital, no QR da mesa e no acompanhamento do pedido. O painel da equipe usa as cores da plataforma.">
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <TenantLogo url={tenant?.logo_url} name={s.store_name} className="size-24 rounded-2xl bg-white object-contain text-2xl ring-1 ring-lenha-100" />
            <label className="inline-flex h-11 cursor-pointer items-center rounded-xl border border-lenha-200 bg-white px-4 font-semibold">{busy === 'logo' ? 'Enviando…' : 'Trocar logo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorBox label="Cor principal" value={s.brand_color} onChange={(v) => set('brand_color', v)} />
            <ColorBox label="Cor escura (fundos e textos)" value={s.brand_dark} onChange={(v) => set('brand_dark', v)} />
            <Field label="Estilo dos títulos"><Select value={s.menu_font} onChange={(e) => set('menu_font', e.target.value)}><option value="modern">Moderno</option><option value="slab">Clássico (serifado)</option></Select></Field>
          </div>
          <p className="text-sm text-lenha-500">As cores e a logo valem assim que você salvar as alterações.</p>
        </div>
        <div style={tenantTheme(s)} className="overflow-hidden rounded-2xl ring-1 ring-lenha-100" aria-label="Prévia">
          <div className="bg-lenha-900 p-4 text-center"><TenantLogo url={tenant?.logo_url} name={s.store_name} className="mx-auto size-16 rounded-xl bg-white object-contain" /><p className="mt-2 font-slab font-bold text-white">{s.slogan || s.store_name}</p></div>
          <div className="space-y-2 p-3">
            <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-lenha-100"><span className="text-sm font-semibold">Produto exemplo</span><span className="font-cond font-bold text-brasa-700">R$ 10,00</span></div>
            <div className="rounded-xl bg-brasa-500 py-2 text-center text-sm font-semibold text-white">Ver carrinho</div>
          </div>
        </div>
      </div>
    </Section>
  );
}
