-- M2/M7/M8: marca de exclusão (soft delete) para usuários, produtos e mesas.
-- Registros com histórico são escondidos (deleted_at preenchido) para preservar a auditoria
-- e os pedidos antigos; registros sem histórico podem ser apagados de vez pela aplicação.
ALTER TABLE users ADD COLUMN deleted_at DATETIME(3) NULL;
ALTER TABLE products ADD COLUMN deleted_at DATETIME(3) NULL;
ALTER TABLE dining_tables ADD COLUMN deleted_at DATETIME(3) NULL;
