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

/** Tela inicial clássica de cada papel (usada como preferência quando ainda é acessível). */
export const ROLE_HOME: Record<Role, string> = {
  admin: '/admin',
  gerente: '/admin',
  caixa: '/admin/pdv',
  garcom: '/garcom',
  cozinha: '/cozinha',
  motoboy: '/motoboy',
};

/** Telas de equipe (fora do painel) por papel. */
const TEAM_HOME: Partial<Record<Role, string>> = { garcom: '/garcom', cozinha: '/cozinha', motoboy: '/motoboy' };

/**
 * Permissões que, se concedidas, dão acesso ao painel administrativo (/admin).
 * NÃO inclui as permissões próprias das telas de equipe (tables.use, kitchen.use, delivery.courier),
 * para que um funcionário "puro" continue indo direto para a sua tela.
 */
export const ADMIN_ENTRY: Permission[] = [
  'dashboard.view', 'orders.view', 'pdv.use', 'cash.operate', 'delivery.manage',
  'products.manage', 'customers.view', 'finance.view', 'reports.view', 'users.manage',
  'settings.manage', 'audit.view',
];

/** Ordem de preferência da tela inicial dentro do painel (primeira permissão que a pessoa tiver). */
const HOME_PRIORITY: [Permission, string][] = [
  ['dashboard.view', '/admin'],
  ['pdv.use', '/admin/pdv'],
  ['orders.view', '/admin/pedidos'],
  ['cash.operate', '/admin/caixa'],
  ['delivery.manage', '/admin/entregas'],
  ['products.manage', '/admin/produtos'],
  ['customers.view', '/admin/clientes'],
  ['finance.view', '/admin/financeiro'],
  ['reports.view', '/admin/relatorios'],
  ['users.manage', '/admin/usuarios'],
  ['settings.manage', '/admin/configuracoes'],
  ['audit.view', '/admin/auditoria'],
];

/**
 * Tela inicial efetiva a partir das permissões reais da pessoa.
 * - Funcionário de equipe sem permissões de painel: vai para a tela de equipe.
 * - Qualquer pessoa com permissão de painel: vai para a primeira tela disponível do painel,
 *   mantendo o destino clássico do papel quando ele ainda for acessível (ex.: caixa -> PDV).
 */
export function homeFor(role: Role, permissions: Permission[]): string {
  const hasPanel = permissions.some((p) => ADMIN_ENTRY.includes(p));
  const team = TEAM_HOME[role];
  if (team && !hasPanel) return team;
  // Mantém o destino clássico do papel se a permissão correspondente existir.
  const preferred = HOME_PRIORITY.find(([perm, route]) => route === ROLE_HOME[role] && permissions.includes(perm));
  if (preferred) return preferred[1];
  for (const [perm, route] of HOME_PRIORITY) if (permissions.includes(perm)) return route;
  return team || '/admin';
}
