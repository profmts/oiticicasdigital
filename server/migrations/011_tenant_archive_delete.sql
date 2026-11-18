-- R8: arquivar empresa (reversível) e excluir empresa de vez (com trava).
-- archived_at preenchido = empresa arquivada (some da lista e bloqueia o acesso), mantendo os dados.
ALTER TABLE tenants ADD COLUMN archived_at DATETIME(3) NULL;

-- Permite excluir a empresa apenas quando @od_wipe = 1 (ligado só pela exclusão feita pelo dono da plataforma).
DROP TRIGGER IF EXISTS no_delete_tenants;
CREATE TRIGGER no_delete_tenants BEFORE DELETE ON tenants FOR EACH ROW
BEGIN
  IF (@od_wipe IS NULL OR @od_wipe <> 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registros de empresas não podem ser excluídos.';
  END IF;
END
