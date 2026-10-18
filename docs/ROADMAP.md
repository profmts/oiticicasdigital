# Próximas fases

Novas tabelas entram por migration (`server/migrations/002_*.sql`, aplicada sozinha ao iniciar); cada módulo novo é
serviço + rotas + tela, sem reconstruir o que existe. Toda tabela nova leva `tenant_id`.

## Plataforma (SaaS)
- **Cobrança automática de mensalidades:** integração com gateway de assinaturas (Asaas, Mercado Pago, Pagar.me, Iugu):
  cliente → assinatura → webhook de pagamento → empresa ativa/suspensa automaticamente após X dias de atraso.
- **Cadastro self-service:** página “Criar minha conta” com período de teste.
- **Domínio próprio por empresa** (ex.: `cardapio.espetinhodosergio.com.br`) apontando para o mesmo sistema.
- Indicadores da plataforma: crescimento, empresas sem movimento, uso por plano.

## Gestão da empresa
- **Estoque e fichas técnicas:** insumos, entradas, perdas, inventário, alerta de mínimo. Baixa proposta ao **confirmar**
  o pedido; itens cancelados antes do preparo voltam ao estoque, depois contam como perda; cada movimento referencia o
  item do pedido (chave única) para nunca baixar ou repor em dobro.
- **Fornecedores**, **CMV** e **DRE gerencial completa** (sem ficha técnica o sistema não estima custo).
- **Cupons, promoções com prazo e fidelidade.**
- **Aplicativo instalável (PWA)** para garçom, cozinha e motoboy, com aviso mesmo com a tela bloqueada.
