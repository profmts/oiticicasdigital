-- R6: módulo fiscal (NFC-e). Dados fiscais por produto e registro das notas emitidas.
-- A configuração fiscal da empresa (CNPJ, IE, regime, CSC, token da API) fica em settings (chave 'fiscal').
-- A emissão real é feita por uma API fiscal (Focus NFe); aqui guardamos só o resultado.
ALTER TABLE products ADD COLUMN ncm VARCHAR(8) NULL;
ALTER TABLE products ADD COLUMN cfop VARCHAR(4) NULL;
ALTER TABLE products ADD COLUMN origem VARCHAR(1) NOT NULL DEFAULT '0';
ALTER TABLE products ADD COLUMN tax_class VARCHAR(20) NOT NULL DEFAULT 'normal';

CREATE TABLE nfce (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  order_id    INT NOT NULL,
  ref         VARCHAR(60) NOT NULL,
  ambiente    VARCHAR(10) NOT NULL DEFAULT 'homolog',
  status      VARCHAR(20) NOT NULL DEFAULT 'pendente',
  numero      INT NULL,
  serie       INT NULL,
  chave       VARCHAR(44) NULL,
  protocolo   VARCHAR(40) NULL,
  danfe_url   VARCHAR(400) NULL,
  xml_url     VARCHAR(400) NULL,
  qrcode_url  LONGTEXT NULL,
  cpf         VARCHAR(14) NULL,
  total_cents INT NOT NULL DEFAULT 0,
  message     VARCHAR(600) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY nfce_ref (tenant_id, ref),
  KEY nfce_order (order_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
