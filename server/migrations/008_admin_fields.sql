-- R4: CPF e e-mail do administrador da empresa (o telefone já existe em users.phone). Opcionais.
ALTER TABLE users ADD COLUMN cpf VARCHAR(11) NULL;
ALTER TABLE users ADD COLUMN email VARCHAR(160) NULL;
