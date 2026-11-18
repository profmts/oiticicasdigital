-- R7: nível de suporte no plano. Os três planos de venda (Começo, Pro, Máximo)
-- são criados pelo seed (server/seed/catalog.ts), de forma idempotente, para não
-- atrapalhar a escolha do plano da empresa demo na primeira execução.
-- A nota fiscal passa a ser um recurso do plano (chave nota_fiscal em features, opt-in).
ALTER TABLE plans ADD COLUMN support VARCHAR(20) NOT NULL DEFAULT 'sem';
