-- R12: novo perfil de equipe "churrasqueiro". Atualiza a checagem da coluna role.
-- (CHECK de coluna no MariaDB se troca redefinindo a coluna, não com DROP CONSTRAINT.)
ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL CHECK (role IN ('admin','gerente','caixa','garcom','cozinha','churrasqueiro','motoboy'));
