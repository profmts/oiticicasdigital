import { useState } from 'react';
import { post, put } from '../../lib/api';
import { useAuth, useData } from '../../lib/hooks';
import { Badge, Button, Field, Input, Modal, Select, Spinner, Toggle, useAction, cx } from '../../components/ui';

export default function Users() {
  const { me } = useAuth();
  const users = useData<any[]>('/api/admin/users', [], 0);
  const meta = useData<any>('/api/admin/users/meta', [], 0);
  const [edit, setEdit] = useState<any>(null);
  if (!users.data || !meta.data) return <Spinner />;
  const roleLabel = Object.fromEntries(meta.data.roles.map((r: any) => [r.id, r.label]));
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex items-center">
        <p className="text-sm text-lenha-600">Cada pessoa tem o próprio usuário. Tudo o que ela faz fica registrado com o nome dela.</p>
        <Button className="ml-auto" onClick={() => setEdit({ name: '', username: '', role: 'garcom', phone: '', active: true, password: '', permissions: { grant: [], revoke: [] } })}>Novo acesso</Button>
      </div>
      <ul className="divide-y divide-lenha-100 rounded-2xl bg-white ring-1 ring-lenha-100">
        {users.data.map((u) => (
          <li key={u.id} className={cx('flex items-center gap-3 px-4 py-3', !u.active && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{u.name} {u.id === me?.id && <Badge>você</Badge>} {!u.active && <Badge tone="alerta">Desativado</Badge>}</p>
              <p className="text-sm text-lenha-600">@{u.username} · {roleLabel[u.role]}{(u.permissions.grant.length || u.permissions.revoke.length) ? ' · permissões ajustadas' : ''}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEdit({ ...u, password: '', active: !!u.active })}>Editar</Button>
          </li>
        ))}
      </ul>
      {edit && <UserEditor initial={edit} meta={meta.data} self={edit.id === me?.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); users.reload(); }} />}
    </div>
  );
}

function UserEditor({ initial, meta, self, onClose, onSaved }: { initial: any; meta: any; self: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial);
  const { run, busy } = useAction();
  const defaults: string[] = meta.roles.find((r: any) => r.id === f.role)?.defaults || [];
  const effective = (p: string) => (defaults.includes(p) && !f.permissions.revoke.includes(p)) || f.permissions.grant.includes(p);
  const togglePerm = (p: string, on: boolean) => {
    const g = new Set<string>(f.permissions.grant); const r = new Set<string>(f.permissions.revoke);
    if (on) { r.delete(p); if (!defaults.includes(p)) g.add(p); } else { g.delete(p); if (defaults.includes(p)) r.add(p); }
    setF({ ...f, permissions: { grant: [...g], revoke: [...r] } });
  };
  const body = { name: f.name, username: f.username, role: f.role, phone: f.phone || '', active: f.active, password: f.password || undefined, permissions: f.permissions };
  return (
    <Modal open onClose={onClose} title={f.id ? `Editar ${initial.name}` : 'Novo acesso'} wide
      footer={<Button className="w-full" busy={!!busy} disabled={f.name.length < 2 || f.username.length < 3 || (!f.id && f.password.length < 6)} onClick={() => run('s', () => (f.id ? put(`/api/admin/users/${f.id}`, body) : post('/api/admin/users', body)).then(onSaved), 'Acesso salvo.')}>Salvar</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Usuário (login)"><Input value={f.username} autoCapitalize="none" onChange={(e) => setF({ ...f, username: e.target.value.replace(/\s/g, '') })} /></Field>
        <Field label="Função"><Select value={f.role} disabled={self} onChange={(e) => setF({ ...f, role: e.target.value, permissions: { grant: [], revoke: [] } })}>{meta.roles.map((r: any) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
        <Field label="Telefone"><Input value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label={f.id ? 'Nova senha (deixe vazio para manter)' : 'Senha inicial'} hint="Mínimo de 6 caracteres. Ao trocar, a pessoa é desconectada dos aparelhos."><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <div className="flex items-end pb-2"><Toggle checked={f.active} disabled={self} onChange={(v) => setF({ ...f, active: v })} label="Acesso ativo" /></div>
      </div>
      {self && <p className="mt-3 rounded-lg bg-lenha-50 px-3 py-2 text-sm">Você não pode alterar a própria função, permissões ou desativar o próprio acesso.</p>}
      {f.role !== 'admin' && !self && (
        <fieldset className="mt-5">
          <legend className="font-slab text-lg font-bold">Permissões</legend>
          <p className="mb-2 text-sm text-lenha-600">Já vêm marcadas as permissões padrão da função. Ajuste se precisar.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(meta.permissions).map(([p, label]: any) => (
              <label key={p} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-lenha-100">
                <input type="checkbox" className="mt-0.5 size-4 accent-brasa-500" checked={effective(p)} onChange={(e) => togglePerm(p, e.target.checked)} />
                <span>{label}{defaults.includes(p) && <span className="text-lenha-400"> · padrão</span>}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </Modal>
  );
}
