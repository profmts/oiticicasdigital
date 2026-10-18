-- M3 (Reiniciar empresa): as travas que impedem apagar vendas, pagamentos, caixa, despesas e
-- auditoria continuam valendo para o uso normal. Elas passam a abrir exceção APENAS quando a
-- variável de sessão @od_wipe = 1, que só a reinicialização feita pelo dono da plataforma liga,
-- dentro de uma transação, e desliga em seguida. "Melhor esforço": onde a hospedagem não permite
-- gatilhos, não há trava e a aplicação continua sendo a proteção (nunca apaga esses registros fora da reinicialização).
-- @@
DROP TRIGGER IF EXISTS no_delete_orders
-- @@
CREATE TRIGGER no_delete_orders BEFORE DELETE ON orders FOR EACH ROW BEGIN IF (@od_wipe IS NULL OR @od_wipe <> 1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de pedidos não podem ser excluídos; use cancelamento.'; END IF; END
-- @@
DROP TRIGGER IF EXISTS no_delete_payments
-- @@
CREATE TRIGGER no_delete_payments BEFORE DELETE ON payments FOR EACH ROW BEGIN IF (@od_wipe IS NULL OR @od_wipe <> 1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de pagamentos não podem ser excluídos; use estorno.'; END IF; END
-- @@
DROP TRIGGER IF EXISTS no_delete_items
-- @@
CREATE TRIGGER no_delete_items BEFORE DELETE ON order_items FOR EACH ROW BEGIN IF (OLD.status <> 'pendente' AND (@od_wipe IS NULL OR @od_wipe <> 1)) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Itens enviados não podem ser excluídos; use cancelamento.'; END IF; END
-- @@
DROP TRIGGER IF EXISTS no_delete_cash
-- @@
CREATE TRIGGER no_delete_cash BEFORE DELETE ON cash_sessions FOR EACH ROW BEGIN IF (@od_wipe IS NULL OR @od_wipe <> 1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de caixa não podem ser excluídos.'; END IF; END
-- @@
DROP TRIGGER IF EXISTS no_delete_cashmov
-- @@
CREATE TRIGGER no_delete_cashmov BEFORE DELETE ON cash_movements FOR EACH ROW BEGIN IF (@od_wipe IS NULL OR @od_wipe <> 1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Movimentos de caixa não podem ser excluídos.'; END IF; END
-- @@
DROP TRIGGER IF EXISTS no_delete_expenses
-- @@
CREATE TRIGGER no_delete_expenses BEFORE DELETE ON expenses FOR EACH ROW BEGIN IF (@od_wipe IS NULL OR @od_wipe <> 1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de despesas não podem ser excluídos; use cancelamento.'; END IF; END
-- @@
DROP TRIGGER IF EXISTS no_delete_audit
-- @@
CREATE TRIGGER no_delete_audit BEFORE DELETE ON audit_log FOR EACH ROW BEGIN IF (@od_wipe IS NULL OR @od_wipe <> 1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de auditoria não podem ser excluídos.'; END IF; END
