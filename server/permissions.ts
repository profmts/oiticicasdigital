export const ROLES = ['admin', 'gerente', 'caixa', 'garcom', 'cozinha', 'motoboy'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  caixa: 'Caixa / Atendente',
  garcom: 'Garçom',
  cozinha: 'Cozinha',
  motoboy: 'Motoboy',
};

export const PERMISSIONS = {
  'dashboard.view': 'Ver dashboard e indicadores',
  'orders.view': 'Ver pedidos de todos os canais',
  'orders.manage': 'Confirmar e movimentar pedidos',
  'orders.view_values': 'Ver valores dos pedidos',
  'orders.cancel': 'Cancelar pedidos e itens já enviados',
  'pdv.use': 'Usar o PDV',
  'discount.apply': 'Conceder descontos',
  'tables.use': 'Atender mesas (lançar itens)',
  'tables.manage': 'Transferir, fechar e gerenciar todas as mesas',
  'kitchen.use': 'Usar a tela da cozinha',
  'delivery.manage': 'Gerenciar entregas e atribuir motoboys',
  'delivery.courier': 'Realizar entregas (área do motoboy)',
  'payments.receive': 'Registrar recebimentos',
  'payments.void': 'Estornar pagamentos',
  'cash.operate': 'Abrir/fechar o próprio caixa, sangria e suprimento',
  'cash.view_all': 'Ver todos os caixas e acertos',
  'finance.view': 'Ver financeiro (despesas, contas)',
  'finance.manage': 'Lançar e pagar despesas',
  'products.manage': 'Cadastrar produtos, preços e categorias',
  'customers.view': 'Ver clientes e histórico',
  'reports.view': 'Ver e exportar relatórios',
  'users.manage': 'Gerenciar usuários e permissões',
  'settings.manage': 'Alterar configurações do estabelecimento',
  'audit.view': 'Ver auditoria',
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  admin: ALL,
  gerente: ALL.filter((p) => !['users.manage', 'settings.manage'].includes(p)),
  caixa: [
    'orders.view', 'orders.manage', 'orders.view_values', 'pdv.use', 'tables.use', 'tables.manage',
    'delivery.manage', 'payments.receive', 'cash.operate', 'customers.view',
  ],
  garcom: ['tables.use'],
  cozinha: ['kitchen.use'],
  motoboy: ['delivery.courier'],
};

/** Permissões que nunca podem ser concedidas a determinados papéis (segurança). */
const NEVER: Partial<Record<Role, Permission[]>> = {
  garcom: ['users.manage', 'settings.manage', 'finance.manage', 'audit.view'],
  cozinha: ['users.manage', 'settings.manage', 'finance.manage', 'finance.view', 'orders.view_values', 'audit.view'],
  motoboy: ['users.manage', 'settings.manage', 'finance.manage', 'finance.view', 'orders.view', 'audit.view', 'customers.view'],
};

export function effectivePermissions(role: Role, adjustments: { grant?: string[]; revoke?: string[] }): Permission[] {
  const set = new Set<Permission>(ROLE_DEFAULTS[role]);
  if (role !== 'admin') {
    for (const p of adjustments.grant || []) if (p in PERMISSIONS) set.add(p as Permission);
    for (const p of adjustments.revoke || []) set.delete(p as Permission);
    for (const p of NEVER[role] || []) set.delete(p);
  }
  return [...set];
}

/** Tela inicial de cada papel. */
export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  gerente: '/admin',
  caixa: '/admin/pdv',
  garcom: '/garcom',
  cozinha: '/cozinha',
  motoboy: '/motoboy',
};
