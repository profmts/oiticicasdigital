-- R3: CPF opcional do cliente, informado no momento do pedido. Guardado só com os dígitos (11).
-- Serve para identificação, nota e futura fidelidade. Nunca é obrigatório.
ALTER TABLE customers ADD COLUMN cpf VARCHAR(11) NULL;
