-- OUTICICAS DIGITAL — esquema multiempresa para MySQL 8+ / MariaDB 10.6+
-- Datas em UTC (DATETIME(3)); valores em centavos (INT); JSON guardado como texto.

CREATE TABLE plans (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(80) NOT NULL,
  description   VARCHAR(500) NOT NULL DEFAULT '',
  price_cents   INT NULL,
  max_users     INT NULL,
  max_tables    INT NULL,
  max_products  INT NULL,
  features      VARCHAR(500) NOT NULL DEFAULT '{"delivery":true,"self_order":true,"kds":true,"reports":true}',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE files (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id  INT NULL,
  mime       VARCHAR(60) NOT NULL,
  size       INT NOT NULL,
  data       LONGBLOB NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tenants (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  slug           VARCHAR(60) NOT NULL UNIQUE,
  name           VARCHAR(120) NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','teste','suspenso','cancelado')),
  plan_id        INT NULL,
  trial_ends_at  DATETIME(3) NULL,
  order_seq      INT NOT NULL DEFAULT 0,
  document       VARCHAR(40) NOT NULL DEFAULT '',
  contact_name   VARCHAR(120) NOT NULL DEFAULT '',
  contact_phone  VARCHAR(30) NOT NULL DEFAULT '',
  contact_email  VARCHAR(160) NOT NULL DEFAULT '',
  notes          VARCHAR(1000) NOT NULL DEFAULT '',
  logo_file_id   INT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  FOREIGN KEY (logo_file_id) REFERENCES files(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE platform_users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  username      VARCHAR(60) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until  DATETIME(3) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id     INT NOT NULL,
  name          VARCHAR(120) NOT NULL,
  username      VARCHAR(60) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('admin','gerente','caixa','garcom','cozinha','motoboy')),
  phone         VARCHAR(30) NOT NULL DEFAULT '',
  active        TINYINT(1) NOT NULL DEFAULT 1,
  permissions   VARCHAR(2000) NOT NULL DEFAULT '{"grant":[],"revoke":[]}',
  available     TINYINT(1) NOT NULL DEFAULT 1,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until  DATETIME(3) NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY users_tenant_username (tenant_id, username),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  token_hash      CHAR(64) NOT NULL UNIQUE,
  kind            VARCHAR(10) NOT NULL CHECK (kind IN ('tenant','platform')),
  subject_id      INT NOT NULL,
  user_agent      VARCHAR(300) NULL,
  impersonated_by INT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at      DATETIME(3) NOT NULL,
  revoked         TINYINT(1) NOT NULL DEFAULT 0,
  KEY sessions_subject (kind, subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
  tenant_id INT NOT NULL,
  `key`     VARCHAR(60) NOT NULL,
  value     LONGTEXT NOT NULL,
  PRIMARY KEY (tenant_id, `key`),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  name      VARCHAR(80) NOT NULL,
  sector    VARCHAR(40) NOT NULL DEFAULT 'cozinha',
  sort      INT NOT NULL DEFAULT 0,
  active    TINYINT(1) NOT NULL DEFAULT 1,
  KEY categories_tenant (tenant_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  category_id INT NOT NULL,
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  image_url   VARCHAR(300) NULL,
  sector      VARCHAR(40) NULL,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  online      TINYINT(1) NOT NULL DEFAULT 1,
  featured    TINYINT(1) NOT NULL DEFAULT 0,
  order_types VARCHAR(80) NOT NULL DEFAULT 'delivery,retirada,mesa,balcao',
  sort        INT NOT NULL DEFAULT 0,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY products_tenant (tenant_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_variants (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  product_id  INT NOT NULL,
  name        VARCHAR(60) NOT NULL,
  price_cents INT NOT NULL CHECK (price_cents >= 0),
  order_types VARCHAR(80) NULL,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  sort        INT NOT NULL DEFAULT 0,
  KEY variants_product (product_id),
  KEY variants_tenant (tenant_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE option_groups (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id  INT NOT NULL,
  product_id INT NOT NULL,
  name       VARCHAR(60) NOT NULL,
  min_select INT NOT NULL DEFAULT 0,
  max_select INT NOT NULL DEFAULT 1,
  sort       INT NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE options (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  group_id    INT NOT NULL,
  name        VARCHAR(80) NOT NULL,
  price_cents INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  active      TINYINT(1) NOT NULL DEFAULT 1,
  sort        INT NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (group_id) REFERENCES option_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id    INT NOT NULL,
  name         VARCHAR(120) NOT NULL,
  phone        VARCHAR(20) NOT NULL,
  notes        VARCHAR(1000) NOT NULL DEFAULT '',
  save_address TINYINT(1) NOT NULL DEFAULT 0,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY customers_tenant_phone (tenant_id, phone),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_addresses (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id    INT NOT NULL,
  customer_id  INT NOT NULL,
  street       VARCHAR(160) NOT NULL,
  number       VARCHAR(30) NOT NULL DEFAULT '',
  complement   VARCHAR(120) NOT NULL DEFAULT '',
  neighborhood VARCHAR(120) NOT NULL DEFAULT '',
  reference    VARCHAR(160) NOT NULL DEFAULT '',
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE delivery_zones (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id         INT NOT NULL,
  name              VARCHAR(120) NOT NULL,
  fee_cents         INT NOT NULL CHECK (fee_cents >= 0),
  min_order_cents   INT NULL,
  estimated_minutes INT NULL,
  active            TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE dining_tables (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id  INT NOT NULL,
  label      VARCHAR(30) NOT NULL,
  seats      INT NULL,
  active     TINYINT(1) NOT NULL DEFAULT 1,
  sort       INT NOT NULL DEFAULT 0,
  qr_token   VARCHAR(40) NOT NULL UNIQUE,
  qr_enabled TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY tables_tenant_label (tenant_id, label),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id          INT NOT NULL,
  number             INT NOT NULL,
  public_token       VARCHAR(40) NOT NULL UNIQUE,
  idempotency_key    VARCHAR(100) NULL,
  channel            VARCHAR(20) NOT NULL CHECK (channel IN ('cardapio','qrcode','pdv','garcom','whatsapp','telefone')),
  type               VARCHAR(20) NOT NULL CHECK (type IN ('delivery','retirada','mesa','balcao')),
  status             VARCHAR(30) NOT NULL,
  table_id           INT NULL,
  guests             INT NULL,
  waiter_id          INT NULL,
  customer_id        INT NULL,
  customer_name      VARCHAR(120) NULL,
  customer_phone     VARCHAR(20) NULL,
  address_json       LONGTEXT NULL,
  delivery_zone_id   INT NULL,
  delivery_fee_cents INT NULL,
  subtotal_cents     INT NOT NULL DEFAULT 0,
  discount_cents     INT NOT NULL DEFAULT 0,
  discount_reason    VARCHAR(300) NULL,
  total_cents        INT NOT NULL DEFAULT 0,
  paid_cents         INT NOT NULL DEFAULT 0,
  payment_status     VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (payment_status IN ('pendente','parcial','pago')),
  payment_hint       VARCHAR(40) NULL,
  change_for_cents   INT NULL,
  notes              VARCHAR(1000) NOT NULL DEFAULT '',
  courier_id         INT NULL,
  priority           INT NOT NULL DEFAULT 0,
  estimated_minutes  INT NULL,
  close_requested    TINYINT(1) NOT NULL DEFAULT 0,
  waiter_called_at   DATETIME(3) NULL,
  receivable         TINYINT(1) NOT NULL DEFAULT 0,
  created_by         INT NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  confirmed_at       DATETIME(3) NULL,
  preparing_at       DATETIME(3) NULL,
  ready_at           DATETIME(3) NULL,
  dispatched_at      DATETIME(3) NULL,
  delivered_at       DATETIME(3) NULL,
  closed_at          DATETIME(3) NULL,
  canceled_at        DATETIME(3) NULL,
  cancel_reason      VARCHAR(300) NULL,
  UNIQUE KEY orders_tenant_number (tenant_id, number),
  UNIQUE KEY orders_tenant_idem (tenant_id, idempotency_key),
  KEY orders_tenant_status (tenant_id, status),
  KEY orders_tenant_created (tenant_id, created_at),
  KEY orders_courier (courier_id),
  KEY orders_table (table_id, status),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (table_id) REFERENCES dining_tables(id),
  FOREIGN KEY (waiter_id) REFERENCES users(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id),
  FOREIGN KEY (courier_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE kitchen_tickets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  order_id    INT NOT NULL,
  seq         INT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','preparo','pronto','entregue','cancelado')),
  note        VARCHAR(500) NOT NULL DEFAULT '',
  question    VARCHAR(300) NULL,
  created_by  INT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  accepted_at DATETIME(3) NULL,
  started_at  DATETIME(3) NULL,
  ready_at    DATETIME(3) NULL,
  served_at   DATETIME(3) NULL,
  UNIQUE KEY tickets_order_seq (order_id, seq),
  KEY tickets_tenant_status (tenant_id, status),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id        INT NOT NULL,
  order_id         INT NOT NULL,
  ticket_id        INT NULL,
  product_id       INT NULL,
  variant_id       INT NULL,
  name             VARCHAR(120) NOT NULL,
  variant_name     VARCHAR(60) NOT NULL DEFAULT '',
  category_name    VARCHAR(80) NOT NULL DEFAULT '',
  sector           VARCHAR(40) NOT NULL DEFAULT 'cozinha',
  unit_price_cents INT NOT NULL,
  options_json     VARCHAR(4000) NOT NULL DEFAULT '[]',
  options_cents    INT NOT NULL DEFAULT 0,
  qty              INT NOT NULL CHECK (qty > 0),
  total_cents      INT NOT NULL,
  notes            VARCHAR(300) NOT NULL DEFAULT '',
  status           VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','preparo','pronto','entregue','cancelado')),
  source           VARCHAR(10) NOT NULL DEFAULT 'equipe' CHECK (source IN ('equipe','cliente')),
  customer_label   VARCHAR(60) NULL,
  created_by       INT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ready_at         DATETIME(3) NULL,
  canceled_by      INT NULL,
  canceled_at      DATETIME(3) NULL,
  cancel_reason    VARCHAR(300) NULL,
  KEY items_order (order_id),
  KEY items_ticket (ticket_id),
  KEY items_tenant (tenant_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (ticket_id) REFERENCES kitchen_tickets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_events (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id   INT NOT NULL,
  order_id    INT NOT NULL,
  type        VARCHAR(40) NOT NULL,
  from_status VARCHAR(30) NULL,
  to_status   VARCHAR(30) NULL,
  user_id     INT NULL,
  note        TEXT NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY events_order (order_id),
  KEY events_tenant_type (tenant_id, type),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cash_sessions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id           INT NOT NULL,
  user_id             INT NOT NULL,
  opened_at           DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  opening_cents       INT NOT NULL CHECK (opening_cents >= 0),
  status              VARCHAR(10) NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','fechado')),
  closed_at           DATETIME(3) NULL,
  closed_by           INT NULL,
  expected_cash_cents INT NULL,
  counted_cash_cents  INT NULL,
  difference_cents    INT NULL,
  summary_json        LONGTEXT NULL,
  notes               VARCHAR(300) NULL,
  KEY cash_user (user_id, status),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE cash_movements (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id    INT NOT NULL,
  session_id   INT NOT NULL,
  type         VARCHAR(20) NOT NULL CHECK (type IN ('sangria','suprimento')),
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  reason       VARCHAR(300) NOT NULL,
  user_id      INT NOT NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (session_id) REFERENCES cash_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id       INT NOT NULL,
  order_id        INT NOT NULL,
  method          VARCHAR(30) NOT NULL,
  amount_cents    INT NOT NULL CHECK (amount_cents > 0),
  received_cents  INT NULL,
  change_cents    INT NOT NULL DEFAULT 0,
  cash_session_id INT NULL,
  collected_by    INT NULL,
  user_id         INT NOT NULL,
  idempotency_key VARCHAR(110) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  settled_at      DATETIME(3) NULL,
  voided          TINYINT(1) NOT NULL DEFAULT 0,
  voided_by       INT NULL,
  voided_at       DATETIME(3) NULL,
  void_reason     VARCHAR(300) NULL,
  UNIQUE KEY payments_tenant_idem (tenant_id, idempotency_key),
  KEY payments_order (order_id),
  KEY payments_session (cash_session_id),
  KEY payments_tenant_created (tenant_id, created_at),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE expenses (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id    INT NOT NULL,
  description  VARCHAR(200) NOT NULL,
  category     VARCHAR(60) NOT NULL DEFAULT 'Outros',
  supplier     VARCHAR(120) NOT NULL DEFAULT '',
  amount_cents INT NOT NULL CHECK (amount_cents > 0),
  due_date     DATE NOT NULL,
  paid_at      DATETIME(3) NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  notes        VARCHAR(1000) NOT NULL DEFAULT '',
  created_by   INT NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY expenses_tenant_due (tenant_id, due_date),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_log (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id        INT NULL,
  user_id          INT NULL,
  platform_user_id INT NULL,
  action           VARCHAR(60) NOT NULL,
  entity           VARCHAR(40) NULL,
  entity_id        INT NULL,
  data_json        LONGTEXT NULL,
  reason           VARCHAR(300) NULL,
  authorized_by    INT NULL,
  ip               VARCHAR(60) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY audit_tenant_created (tenant_id, created_at),
  KEY audit_action (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
