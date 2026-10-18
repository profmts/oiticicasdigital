# Integrações externas: requisitos e custos

Valores são referências aproximadas — **confirme o preço atual com cada fornecedor antes de contratar.**

## O que funciona sem nenhuma integração paga
- **WhatsApp manual:** botões abrem o WhatsApp com a mensagem pronta (cliente → loja, loja → cliente, motoboy → cliente).
  O sistema não afirma que a mensagem foi enviada ou lida — quem envia é a pessoa.
- **Pedido salvo primeiro no sistema:** o pedido do cardápio já chega ao Kanban e à cozinha sem depender do WhatsApp.
- **Pagamentos:** registrados manualmente pelo operador (Pix conferido no app do banco, maquininha de cartão à parte).

## Hospedagem (necessária)
| Item | Requisito | Custo de referência |
|---|---|---|
| Hostinger hospedagem Node.js Business/Cloud ou VPS KVM | Ver `HOSTINGER.md` | consulte o preço atual no site da Hostinger |
| Banco MySQL | incluído no plano da Hostinger (Bancos de dados → Gerenciamento) | incluso |
| Domínio `.com.br` | Registro.br | aprox. R$ 40/ano |
| Certificado HTTPS | Let’s Encrypt (automático no Caddy/Hostinger) | grátis |

## Cobrança das mensalidades do SaaS — próxima etapa
- **Opções:** Asaas, Mercado Pago (assinaturas), Pagar.me, Iugu — todas com boleto, Pix e cartão recorrente.
- **Requisitos:** conta PJ da OUTICICAS DIGITAL no gateway, chave de API e URL de webhook com HTTPS.
- **No sistema:** os planos já existem com preço; falta ligar cada empresa a uma assinatura e usar o webhook para
  manter a empresa ativa ou suspendê-la automaticamente em caso de atraso (hoje a suspensão é manual no painel).
- **Custo:** taxa por cobrança do gateway (varia por meio de pagamento).

## WhatsApp Business Platform (API oficial) — opcional
Para enviar avisos automáticos (“pedido confirmado”, “saiu para entrega”) sem ninguém tocar no celular.
- **Requisitos:** conta Meta Business verificada, número dedicado (não pode estar em uso no app WhatsApp comum),
  modelos de mensagem aprovados pela Meta, e um provedor (a própria Cloud API da Meta ou um BSP como Twilio, Zenvia, Gupshup).
- **Custo:** a Meta cobra por mensagem de modelo enviada (preço por país e categoria, em dólar); BSPs costumam cobrar mensalidade adicional.
- **No sistema:** os pontos de envio já existem (mudança de status do pedido em `server/services/orders.ts`);
  basta criar um serviço que chame a API quando o status mudar e registrar o retorno (enviado/entregue/lido) — nunca simular.

## Pagamento online (Pix com confirmação automática, cartão no cardápio) — opcional
- **Opções:** Mercado Pago, PagSeguro/PagBank, Asaas, Efí (Gerencianet), Stone, entre outros.
- **Requisitos:** conta PJ ou PF no gateway, credenciais de API, URL de webhook com HTTPS.
- **Custo:** Pix costuma ter taxa percentual baixa ou fixa por transação; cartão online tem taxa maior + prazo de recebimento.
- **No sistema:** o pagamento só pode ser marcado como pago a partir do webhook confirmado do gateway (gravando o id da transação).

## Nota fiscal (NFC-e) — opcional, conforme a situação fiscal da empresa
- **Requisitos:** CNPJ com inscrição estadual na SEFAZ-PB, credenciamento para NFC-e, **certificado digital A1** e CSC (código de segurança do contribuinte),
  cadastro fiscal dos produtos (NCM, CFOP, CST/CSOSN) e um emissor (API como Focus NFe, PlugNotas, NFE.io, ou software homologado).
- **Custo:** certificado A1 aprox. R$ 150–300/ano + mensalidade do emissor (varia por volume).
- **Importante:** consulte o contador. Até essa integração, o sistema emite apenas **comprovante não fiscal**.

## Integração com iFood e outros marketplaces — opcional
Exige cadastro como parceiro/integrador homologado na plataforma. O sistema já separa pedidos por canal, o que facilita
incluir um novo canal quando houver credenciais.
