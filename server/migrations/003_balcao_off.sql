-- M9: o QR de pedido no balcão passa a ser desligado por padrão.
-- Para empresas novas, o padrão já vem desligado (defaultSettings).
-- Aqui desligamos apenas na empresa Espetinho do Sergio, onde estava ligado por ser teste.
-- As chaves novas (hide_table_13, team_pin) são criadas para as empresas existentes
-- pelo próprio sistema na inicialização (ensureSettings), não precisam de migração.
UPDATE settings s
  JOIN tenants t ON t.id = s.tenant_id
SET s.value = 'false'
WHERE t.slug = 'espetinho-do-sergio' AND s.`key` = 'self_order_counter_enabled';
