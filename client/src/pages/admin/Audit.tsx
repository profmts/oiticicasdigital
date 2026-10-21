import { useState } from 'react';
import { useData } from '../../lib/hooks';
import { dateTime } from '../../lib/format';
import { Select, Spinner } from '../../components/ui';

const LABEL: Record<string, string> = {
  'auth.login': 'Entrou no sistema', 'auth.login_failed': 'Tentativa de login falhou', 'user.create': 'Criou acesso', 'user.update': 'Alterou acesso', 'user.setup_admin': 'Configuração inicial',
  'user.password_change': 'Trocou a própria senha', 'order.cancel': 'Cancelou pedido', 'item.cancel': 'Cancelou item', 'order.discount': 'Concedeu desconto', 'payment.void': 'Estornou pagamento',
  'order.receivable': 'Concluiu com saldo em aberto', 'order.delivery_fee': 'Alterou taxa de entrega', 'cash.open': 'Abriu caixa', 'cash.close': 'Fechou caixa', 'cash.sangria': 'Sangria', 'cash.suprimento': 'Suprimento',
  'cash.settle_courier': 'Acerto de motoboy', 'product.create': 'Criou produto', 'product.update': 'Alterou produto', 'product.pause': 'Pausou produto', 'product.resume': 'Reativou produto',
  'category.create': 'Criou categoria', 'category.update': 'Alterou categoria', 'settings.update': 'Alterou configurações', 'settings.reset': 'Redefiniu configurações (padrão de fábrica)', 'settings.logo': 'Trocou a logo', 'settings.cover': 'Trocou a capa do cardápio', 'store.open': 'Abriu a loja', 'store.close': 'Fechou a loja',
  'expense.create': 'Lançou despesa', 'expense.update': 'Alterou despesa', 'expense.pay': 'Pagou despesa', 'expense.cancel': 'Cancelou despesa', 'table.transfer': 'Transferiu mesa',
  'zone.create': 'Criou bairro', 'zone.update': 'Alterou bairro', 'backup.create': 'Gerou backup',
};

export default function Audit() {
  const [action, setAction] = useState('');
  const { data } = useData<any[]>(`/api/admin/audit?limit=300${action ? `&action=${action}` : ''}`, [], 0);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex items-center gap-2">
        <p className="text-sm text-lenha-600">Registro permanente das operações críticas. Não pode ser alterado nem apagado.</p>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="ml-auto w-56" aria-label="Filtrar ações">
          <option value="">Todas as ações</option><option value="order">Pedidos</option><option value="item">Itens</option><option value="payment">Pagamentos</option>
          <option value="cash">Caixa</option><option value="product">Produtos</option><option value="user">Usuários</option><option value="auth">Logins</option><option value="settings">Configurações</option><option value="expense">Despesas</option>
        </Select>
      </div>
      {!data ? <Spinner /> : (
        <div className="scroll-visible overflow-x-auto rounded-2xl bg-white ring-1 ring-lenha-100">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-lenha-500"><th className="px-4 py-2">Quando</th><th>Quem</th><th>Ação</th><th>Detalhes</th></tr></thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-t border-lenha-100 align-top">
                  <td className="whitespace-nowrap px-4 py-2">{dateTime(a.created_at)}</td>
                  <td>{a.user_name || '—'}{a.authorized_name && <span className="block text-xs text-lenha-500">autorizado por {a.authorized_name}</span>}</td>
                  <td className="font-semibold">{LABEL[a.action] || a.action}{a.entity === 'order' && a.entity_id ? ` (pedido id ${a.entity_id})` : ''}</td>
                  <td className="max-w-md pr-4 text-xs text-lenha-600">{a.reason && <span className="block text-sm text-lenha-900">Motivo: {a.reason}</span>}{a.data_json != null && <span className="break-all">{typeof a.data_json === 'string' ? a.data_json : JSON.stringify(a.data_json)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
