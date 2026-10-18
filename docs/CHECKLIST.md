# Checklist de testes antes de entrar em produção

Os itens marcados **[auto]** são verificados pelos testes automatizados (`npm test` e `npm run test:pg` — 22 testes de API, e
`tests/e2e_browser.py` — fluxo completo no navegador). Mesmo assim, repita-os no aparelho real da loja.

| # | Teste | Como validar | Auto |
|---|---|---|---|
| 1 | Login de cada perfil | Entrar com admin, gerente, caixa, garçom, cozinha e motoboy; cada um cai na sua tela | [auto] |
| 2 | Restrições de acesso | Garçom não abre `/admin`; cozinha não vê valores; motoboy não vê pedidos de outro motoboy | [auto] |
| 3 | Cadastro/edição de produto | Alterar preço → aparece no cardápio e no PDV; auditoria registra o preço antigo e o novo | [auto] |
| 4 | Pedido pelo cardápio | No celular: escolher itens, combo com opções, bairro, pagamento, enviar → link de acompanhamento | [auto] |
| 5 | Pedido via PDV | Venda balcão com dinheiro + Pix e troco; comprovante imprime | [auto] |
| 6 | Abertura/fechamento de mesa | Garçom abre mesa, lança, pede a conta; caixa recebe e encerra; mesa volta a “Livre” | [auto] |
| 7 | Lançamento por garçom | Item mostra o nome do garçom e o horário | [auto] |
| 8 | Envio para a cozinha | Rodada aparece no KDS com observações; som toca | [auto] |
| 9 | Kanban | Arrastar cartão entre colunas; transições inválidas são recusadas; outra tela atualiza sozinha | [auto] |
| 10 | Atribuição de entrega | Atribuir motoboy; sem motoboy não despacha | [auto] |
| 11 | Status pelo motoboy | Coleta → saiu → entregue (com valor recebido) e tentativa sem sucesso | [auto] |
| 12 | Registro de pagamento | Não paga mais que o saldo; troco correto; pagamento parcial | [auto] |
| 13 | Caixa | Abrir com fundo, sangria, suprimento, acerto do motoboy, fechar com contagem e diferença | [auto] |
| 14 | Despesas | Lançar, pagar, cancelar; entram no dashboard | [auto] |
| 15 | Dashboard | Conferir com as vendas do dia; período sem vendas mostra zero | [auto] |
| 16 | Estoque | — Fase 3 (ainda não implementado) | — |
| 17 | Cancelamentos e estornos | Exigem motivo e autorização; não apagam registros | [auto] |
| 18 | Responsividade | Cardápio, garçom e motoboy em celular; KDS em monitor; PDV em tablet | [auto parcial] |
| 19 | Persistência | Recarregar a página e reiniciar o servidor: nada se perde | [auto] |
| 20 | Duplicidade | Tocar duas vezes em “Enviar pedido”/“Confirmar recebimento” não duplica | [auto] |
| 21 | Pedido pelo QR da mesa | Cliente lê o QR, pede, chama o garçom; garçom confirma e envia à cozinha; QR desativado/regenerado deixa de funcionar | [auto] |
| 22 | Isolamento entre empresas | Uma empresa não vê nem altera pedidos, produtos ou mesas de outra; plano limita usuários/mesas; suspensão bloqueia acesso | [auto] |

## Antes de abrir para clientes
- [ ] Criar o administrador da plataforma (com `SETUP_TOKEN`) e o administrador do Espetinho do Sergio.
- [ ] Criar um usuário para cada funcionário.
- [ ] Cadastrar bairros e taxas (ou deixar “taxa a confirmar” conscientemente).
- [ ] Definir tempos estimados e pedido mínimo, se houver.
- [ ] Cadastrar a chave Pix (opcional).
- [ ] Publicar com HTTPS e `COOKIE_SECURE=true` (ver `HOSTINGER.md`).
- [ ] Imprimir os QR Codes das mesas e testar um pedido em cada tipo de celular.
- [ ] Testar a restauração de um backup do banco uma vez.
- [ ] Imprimir o QR Code com o endereço definitivo.
- [ ] Testar a impressora térmica (Chrome → imprimir → tamanho 80 mm, sem margens).
