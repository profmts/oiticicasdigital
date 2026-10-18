import { useState } from 'react';
import { api, post, put, patch, del } from '../../lib/api';
import { useData } from '../../lib/hooks';
import { money, parseMoney, centsToInput, SECTOR_LABEL, TYPE_LABEL } from '../../lib/format';
import { Badge, Button, Field, Input, Modal, MoneyInput, Select, Spinner, Textarea, Toggle, useAction, cx } from '../../components/ui';

const TYPES = ['delivery', 'retirada', 'mesa', 'balcao'];

/** M8: excluir produto, com a confirmação da senha do administrador da empresa. */
function ExcluirProduto({ produto, onClose, onDone }: { produto: any; onClose: () => void; onDone: () => void }) {
  const [password, setPass] = useState('');
  const { run, busy } = useAction();
  return (
    <Modal open onClose={onClose} title={`Excluir ${produto.name}`}
      footer={<Button variant="danger" className="w-full" busy={!!busy} disabled={!password}
        onClick={() => run('x', () => del(`/api/products/${produto.id}`, { password }).then(onDone), 'Produto excluído.')}>Excluir produto</Button>}>
      <p className="mb-3 text-sm text-lenha-600">O produto <strong>{produto.name}</strong> será removido do cardápio. Se ele já foi vendido, some do cardápio mas é mantido no histórico das vendas antigas. Confirme com a sua senha.</p>
      <Field label="Sua senha"><Input type="password" value={password} autoComplete="current-password" onChange={(e) => setPass(e.target.value)} /></Field>
    </Modal>
  );
}

export default function Products() {
  const { data, reload } = useData<any>('/api/catalog?all=1', ['catalog'], 0);
  const settings = useData<any>('/api/admin/settings', [], 0);
  const [edit, setEdit] = useState<any>(null);
  const [excluir, setExcluir] = useState<any>(null);
  const [cat, setCat] = useState<any>(null);
  const [q, setQ] = useState('');
  const { run } = useAction();
  if (!data) return <Spinner />;
  const sectors = settings.data?.kitchen_sectors || ['espetos', 'porcoes', 'bebidas'];
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto" className="h-11 w-64 rounded-xl border border-lenha-200 bg-white px-3" aria-label="Buscar produto" />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setCat({ name: '', sector: sectors[0], sort: data.categories.length, active: true })}>Nova categoria</Button>
          <Button onClick={() => setEdit({ category_id: data.categories[0]?.id, name: '', description: '', active: true, online: true, featured: false, order_types: TYPES, sort: 0, variants: [{ name: 'Único', price: '' }], option_groups: [] })}>Novo produto</Button>
        </div>
      </div>
      <p className="text-sm text-lenha-600">Preços e produtos valem na hora para o cardápio digital, PDV e garçons. Alterações de preço ficam registradas na auditoria; vendas antigas mantêm o preço da época.</p>
      {data.categories.map((c: any) => {
        const prods = c.products.filter((p: any) => !q || norm(p.name).includes(norm(q)));
        if (q && !prods.length) return null;
        return (
          <section key={c.id}>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="font-slab text-xl font-bold">{c.name}</h2>
              <Badge>{SECTOR_LABEL[c.sector] || c.sector}</Badge>
              {!c.active && <Badge tone="alerta">Categoria oculta</Badge>}
              <button className="ml-auto text-sm font-semibold text-brasa-700" onClick={() => setCat({ ...c, active: !!c.active })}>Editar categoria</button>
            </div>
            <ul className="divide-y divide-lenha-100 rounded-2xl bg-white ring-1 ring-lenha-100">
              {prods.map((p: any) => (
                <li key={p.id} className={cx('flex flex-wrap items-center gap-3 px-4 py-2.5', !p.active && 'bg-lenha-50')}>
                  {p.image_url ? <img src={p.image_url} alt="" className="size-12 rounded-lg object-cover" /> : <span className="grid size-12 place-items-center rounded-lg bg-lenha-100 font-slab text-lg font-bold text-lenha-500">{p.name[0]}</span>}
                  <div className="min-w-0 flex-1">
                    <p className={cx('font-semibold', !p.active && 'text-lenha-500')}>{p.name} {p.featured ? <Badge tone="ouro">Destaque</Badge> : null} {!p.online && <Badge>Só no salão/PDV</Badge>}</p>
                    <p className="text-sm text-lenha-600">{p.variants.filter((v: any) => v.active).map((v: any) => `${v.name === 'Único' ? '' : v.name + ' '}${money(v.price_cents)}`).join(' · ')}{p.option_groups.length > 0 && ` · ${p.option_groups.length} grupo(s) de opções`}</p>
                  </div>
                  <Toggle checked={!!p.active} onChange={(v) => run('t', () => patch(`/api/products/${p.id}/toggle`, { active: v }).then(reload), v ? 'Produto disponível.' : 'Produto pausado.')} label={p.active ? 'Disponível' : 'Pausado'} />
                  <Button size="sm" variant="outline" onClick={() => setEdit(toForm(p))}>Editar</Button>
                  <Button size="sm" variant="ghost" className="text-alerta" onClick={() => setExcluir(p)}>Excluir</Button>
                </li>
              ))}
              {prods.length === 0 && <li className="px-4 py-3 text-sm text-lenha-500">Nenhum produto nesta categoria.</li>}
            </ul>
          </section>
        );
      })}
      {edit && <ProductEditor initial={edit} categories={data.categories} sectors={sectors} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {cat && <CategoryEditor initial={cat} sectors={sectors} onClose={() => setCat(null)} onSaved={() => { setCat(null); reload(); }} />}
      {excluir && <ExcluirProduto produto={excluir} onClose={() => setExcluir(null)} onDone={() => { setExcluir(null); reload(); }} />}
    </div>
  );
}

const toForm = (p: any) => ({
  id: p.id, category_id: p.category_id, name: p.name, description: p.description, image_url: p.image_url, sector: p.sector || '', active: !!p.active, online: !!p.online, featured: !!p.featured,
  order_types: p.order_types, sort: p.sort,
  variants: p.variants.filter((v: any) => v.active).map((v: any) => ({ id: v.id, name: v.name, price: centsToInput(v.price_cents), order_types: v.order_types })),
  option_groups: p.option_groups.map((g: any) => ({ id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select, options: g.options.filter((o: any) => o.active).map((o: any) => ({ id: o.id, name: o.name, price: centsToInput(o.price_cents) })) })),
});

function ProductEditor({ initial, categories, sectors, onClose, onSaved }: { initial: any; categories: any[]; sectors: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<any>(initial);
  const [err, setErr] = useState('');
  const { run, busy } = useAction();
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const upload = async (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    const r = await run('up', () => api('POST', '/api/uploads', fd), 'Foto enviada.');
    if (r) set('image_url', r.url);
  };
  const save = () => {
    setErr('');
    const variants = f.variants.map((v: any) => ({ id: v.id, name: v.name.trim(), price_cents: parseMoney(v.price), active: true, order_types: v.order_types || null }));
    if (variants.some((v: any) => !v.name || !Number.isFinite(v.price_cents))) return setErr('Cada variação precisa de nome e preço.');
    const groups = f.option_groups.map((g: any) => ({ id: g.id, name: g.name.trim(), min_select: Number(g.min_select) || 0, max_select: Math.max(1, Number(g.max_select) || 1),
      options: g.options.map((o: any) => ({ id: o.id, name: o.name.trim(), price_cents: parseMoney(o.price || '0'), active: true })) }));
    if (groups.some((g: any) => !g.name || !g.options.length || g.options.some((o: any) => !o.name || !Number.isFinite(o.price_cents)))) return setErr('Revise os grupos de opções: cada um precisa de nome e ao menos uma opção com preço (pode ser 0).');
    const body = { category_id: Number(f.category_id), name: f.name, description: f.description || '', image_url: f.image_url || null, sector: f.sector || null, active: f.active, online: f.online, featured: f.featured, order_types: f.order_types, sort: Number(f.sort) || 0, variants, option_groups: groups };
    run('save', () => (f.id ? put(`/api/products/${f.id}`, body) : post('/api/products', body)).then(onSaved), 'Produto salvo.');
  };
  return (
    <Modal open onClose={onClose} title={f.id ? `Editar ${initial.name}` : 'Novo produto'} wide
      footer={<div>{err && <p className="mb-2 text-sm font-semibold text-alerta">{err}</p>}<Button className="w-full" size="lg" busy={busy === 'save'} disabled={f.name.trim().length < 2 || !f.order_types.length} onClick={save}>Salvar produto</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Categoria"><Select value={f.category_id} onChange={(e) => set('category_id', e.target.value)}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Descrição" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} maxLength={400} /></Field>
        <Field label="Setor de preparo (cozinha)" hint="Vazio = usa o setor da categoria."><Select value={f.sector} onChange={(e) => set('sector', e.target.value)}><option value="">Da categoria</option>{sectors.map((s) => <option key={s} value={s}>{SECTOR_LABEL[s] || s}</option>)}</Select></Field>
        <Field label="Ordem de exibição"><Input inputMode="numeric" value={f.sort} onChange={(e) => set('sort', e.target.value.replace(/\D/g, ''))} /></Field>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-sm font-semibold text-lenha-700">Foto</span>
          <div className="flex items-center gap-3">
            {f.image_url ? <img src={f.image_url} alt="" className="size-20 rounded-xl object-cover" /> : <span className="grid size-20 place-items-center rounded-xl bg-lenha-100 text-xs text-lenha-500">Sem foto</span>}
            <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-lenha-200 bg-white px-3 text-sm font-semibold">{busy === 'up' ? 'Enviando…' : 'Escolher foto'}<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
            {f.image_url && <button className="text-sm text-alerta" onClick={() => set('image_url', null)}>Remover</button>}
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
        <Toggle checked={f.active} onChange={(v) => set('active', v)} label="Disponível para venda" />
        <Toggle checked={f.online} onChange={(v) => set('online', v)} label="Aparece no cardápio digital" />
        <Toggle checked={f.featured} onChange={(v) => set('featured', v)} label="Destaque no cardápio" />
      </div>
      <fieldset className="mt-4">
        <legend className="mb-1 text-sm font-semibold text-lenha-700">Pode ser vendido em</legend>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => {
            const on = f.order_types.includes(t);
            return <button key={t} onClick={() => set('order_types', on ? f.order_types.filter((x: string) => x !== t) : [...f.order_types, t])} className={cx('h-9 rounded-full px-4 text-sm font-semibold', on ? 'bg-lenha-900 text-white' : 'bg-white ring-1 ring-lenha-200')}>{TYPE_LABEL[t]}</button>;
          })}
        </div>
      </fieldset>

      <h3 className="mt-6 font-slab text-lg font-bold">Preços e tamanhos</h3>
      <p className="text-sm text-lenha-600">Um produto simples tem uma variação “Único”. Use variações para tamanhos (Pequena/Grande) ou versões com preço diferente.</p>
      <div className="mt-2 space-y-2">
        {f.variants.map((v: any, i: number) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-lenha-100">
            <Input className="w-40 flex-1" value={v.name} onChange={(e) => set('variants', f.variants.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Nome da variação" />
            <div className="w-32"><MoneyInput value={v.price} onChange={(val) => set('variants', f.variants.map((x: any, j: number) => (j === i ? { ...x, price: val } : x)))} aria-label="Preço" /></div>
            <Select className="w-48" value={v.order_types ? v.order_types.join(',') : ''} onChange={(e) => set('variants', f.variants.map((x: any, j: number) => (j === i ? { ...x, order_types: e.target.value ? e.target.value.split(',') : null } : x)))} aria-label="Onde vale">
              <option value="">Vale onde o produto vale</option>
              <option value="delivery,retirada,balcao">Só para viagem</option>
              <option value="mesa,balcao">Só no estabelecimento</option>
              <option value="mesa">Só mesas</option>
            </Select>
            {f.variants.length > 1 && <button className="px-2 text-xl text-alerta" aria-label="Remover variação" onClick={() => set('variants', f.variants.filter((_: any, j: number) => j !== i))}>×</button>}
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => set('variants', [...f.variants, { name: '', price: '' }])}>+ Adicionar variação</Button>
      </div>

      <h3 className="mt-6 font-slab text-lg font-bold">Adicionais e escolhas</h3>
      <p className="text-sm text-lenha-600">Ex.: “Espeto do combo” (escolha 1, obrigatório) ou “Adicionais” (opcional, até 3).</p>
      <div className="mt-2 space-y-3">
        {f.option_groups.map((g: any, gi: number) => {
          const setG = (k: string, val: any) => set('option_groups', f.option_groups.map((x: any, j: number) => (j === gi ? { ...x, [k]: val } : x)));
          return (
            <div key={gi} className="rounded-xl bg-white p-3 ring-1 ring-lenha-100">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Nome do grupo" className="flex-1"><Input value={g.name} onChange={(e) => setG('name', e.target.value)} /></Field>
                <Field label="Mínimo" className="w-20"><Input inputMode="numeric" value={g.min_select} onChange={(e) => setG('min_select', e.target.value.replace(/\D/g, ''))} /></Field>
                <Field label="Máximo" className="w-20"><Input inputMode="numeric" value={g.max_select} onChange={(e) => setG('max_select', e.target.value.replace(/\D/g, ''))} /></Field>
                <button className="h-11 px-2 text-sm font-semibold text-alerta" onClick={() => set('option_groups', f.option_groups.filter((_: any, j: number) => j !== gi))}>Remover grupo</button>
              </div>
              <div className="mt-2 space-y-1">
                {g.options.map((o: any, oi: number) => (
                  <div key={oi} className="flex gap-2">
                    <Input className="flex-1" value={o.name} placeholder="Opção" onChange={(e) => setG('options', g.options.map((x: any, j: number) => (j === oi ? { ...x, name: e.target.value } : x)))} aria-label="Nome da opção" />
                    <div className="w-32"><MoneyInput value={o.price} placeholder="0,00" onChange={(val) => setG('options', g.options.map((x: any, j: number) => (j === oi ? { ...x, price: val } : x)))} aria-label="Acréscimo" /></div>
                    <button className="px-2 text-xl text-alerta" aria-label="Remover opção" onClick={() => setG('options', g.options.filter((_: any, j: number) => j !== oi))}>×</button>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setG('options', [...g.options, { name: '', price: '' }])}>+ Opção</Button>
              </div>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={() => set('option_groups', [...f.option_groups, { name: '', min_select: 0, max_select: 1, options: [{ name: '', price: '' }] }])}>+ Grupo de opções</Button>
      </div>
    </Modal>
  );
}

function CategoryEditor({ initial, sectors, onClose, onSaved }: { initial: any; sectors: string[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const { run, busy } = useAction();
  const body = { name: f.name, sector: f.sector, sort: Number(f.sort) || 0, active: f.active };
  return (
    <Modal open onClose={onClose} title={f.id ? 'Editar categoria' : 'Nova categoria'}
      footer={<Button className="w-full" busy={!!busy} disabled={f.name.trim().length < 2} onClick={() => run('s', () => (f.id ? put(`/api/categories/${f.id}`, body) : post('/api/categories', body)).then(onSaved), 'Categoria salva.')}>Salvar</Button>}>
      <div className="space-y-3">
        <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Setor de preparo padrão"><Select value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })}>{sectors.map((s) => <option key={s} value={s}>{SECTOR_LABEL[s] || s}</option>)}</Select></Field>
        <Field label="Ordem"><Input inputMode="numeric" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value.replace(/\D/g, '') })} /></Field>
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Categoria visível" />
      </div>
    </Modal>
  );
}
