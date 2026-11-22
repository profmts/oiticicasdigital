-- R13: resposta do salão à dúvida da cozinha. Guarda a resposta no ticket.
ALTER TABLE kitchen_tickets ADD COLUMN answer VARCHAR(300) NULL;
