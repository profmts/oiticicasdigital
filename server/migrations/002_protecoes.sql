-- Proteções no próprio banco: vendas, pagamentos, caixa, despesas e auditoria não podem ser apagados.
-- Aplicado em "melhor esforço": algumas hospedagens compartilhadas não permitem criar gatilhos (triggers);
-- nesse caso o sistema continua protegido pela aplicação, que nunca apaga esses registros.
-- @@
CREATE TRIGGER no_delete_orders BEFORE DELETE ON orders FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de pedidos não podem ser excluídos; use cancelamento.'
-- @@
CREATE TRIGGER no_delete_payments BEFORE DELETE ON payments FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de pagamentos não podem ser excluídos; use estorno.'
-- @@
CREATE TRIGGER no_delete_items BEFORE DELETE ON order_items FOR EACH ROW BEGIN IF OLD.status <> 'pendente' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Itens enviados não podem ser excluídos; use cancelamento.'; END IF; END
-- @@
CREATE TRIGGER no_delete_cash BEFORE DELETE ON cash_sessions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de caixa não podem ser excluídos.'
-- @@
CREATE TRIGGER no_delete_cashmov BEFORE DELETE ON cash_movements FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Movimentos de caixa não podem ser excluídos.'
-- @@
CREATE TRIGGER no_delete_expenses BEFORE DELETE ON expenses FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de despesas não podem ser excluídos; use cancelamento.'
-- @@
CREATE TRIGGER no_delete_tenants BEFORE DELETE ON tenants FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de empresas não podem ser excluídos.'
-- @@
CREATE TRIGGER no_delete_audit BEFORE DELETE ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de auditoria não podem ser excluídos.'
-- @@
CREATE TRIGGER no_update_audit BEFORE UPDATE ON audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de auditoria não podem ser alterados.'
