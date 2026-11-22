-- R9: nomenclatura final dos planos. Renomeia os planos existentes mantendo as empresas ligadas a eles.
UPDATE plans SET name = 'Interno', description = 'Todos os recursos, sem limites. Plano interno, para lojas de demonstração e teste (não é para vender).' WHERE name = 'Plano inicial';
UPDATE plans SET name = 'Equipe' WHERE name = 'Pro';
UPDATE plans SET name = 'Profissional' WHERE name = 'Máximo';
