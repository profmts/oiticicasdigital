# OITICICAS DIGITAL

Plataforma SaaS para restaurantes: cada empresa tem o próprio cardápio digital, pedidos pelo QR Code da mesa,
PDV, cozinha (KDS), garçons, delivery com área do motoboy, caixa, financeiro, relatórios e auditoria —
com dados isolados entre empresas e um painel da plataforma para cadastrar empresas e planos.

A empresa **Espetinho do Sergio** já vem criada na primeira execução, com a logo, o cardápio oficial (56 produtos),
WhatsApp, endereço e cores que já tinha.

## Endereços

| Endereço | Quem usa |
|---|---|
| `/` | Página da plataforma OITICICAS DIGITAL |
| `/plataforma` | Dono/suporte da plataforma: empresas, planos, equipe, auditoria |
| `/<empresa>` | Cardápio digital da empresa (delivery e retirada). Ex.: `/espetinho-do-sergio` |
| `/<empresa>/mesa/<código>` | **Pedido presencial pelo QR Code da mesa** |
| `/<empresa>/balcao` | Pedido presencial pelo QR do balcão (retira no balcão) |
| `/<empresa>/pedido/<código>` | Cliente acompanha o pedido |
| `/<empresa>/entrar` ou `/entrar` | Login da equipe da empresa |
| `/admin`, `/garcom`, `/cozinha`, `/motoboy` | Telas da equipe (cada função vê só o que pode) |

## Pedido presencial pelo QR Code

1. Em **Painel → QR Codes**, imprima o QR de cada mesa (e o do balcão, se quiser).
2. O cliente lê o QR, vê o cardápio com os preços “no estabelecimento”, informa o nome e envia o pedido.
3. O garçom recebe o aviso na hora (som + destaque na mesa) e confirma o envio para a cozinha
   — ou, se a empresa preferir, os pedidos vão direto para a cozinha (Configurações → Pedido presencial).
4. Pelo celular o cliente acompanha o consumo da mesa, **chama o garçom** e **pede a conta**.
5. O pagamento continua no caixa/garçom. Um QR pode ser desativado ou regenerado (o impresso antigo deixa de funcionar).

## SaaS: empresas e planos

- **Empresas:** criadas no painel da plataforma com endereço próprio (`/nome-da-empresa`), administrador inicial e
  situação (ativa, em teste com data, suspensa, cancelada). Suspender bloqueia o login e o cardápio na hora.
- **Planos:** limites de usuários, mesas e produtos; liga/desliga delivery, pedido por QR e relatórios.
  O preço é informativo — a cobrança automática de mensalidades é a próxima etapa (ver `docs/ROADMAP.md`).
- **Isolamento:** todas as consultas filtram pela empresa; os testes verificam que uma empresa não lê nem altera dados de outra.
- **Suporte:** a plataforma pode entrar no painel de uma empresa por até 4 h, com motivo registrado na auditoria da empresa.
- **Identidade:** cada empresa define logo, cor principal, cor escura e estilo dos títulos do cardápio.
  Os painéis usam a identidade tecnológica da OITICICAS DIGITAL.

## Instalação local

Requisitos: **Node.js 22+** e um banco **MySQL 8+ ou MariaDB 10.6+** (o banco da Hostinger já serve).

```bash
npm install
cp .env.example .env          # preencha DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
npm run build
npm start                     # http://localhost:3000 — as tabelas são criadas sozinhas no primeiro início
```

Primeiro acesso: abra `/plataforma/entrar` e crie o administrador da plataforma. Em **Empresas → Espetinho do Sergio →
Gerenciar**, crie o administrador da empresa. Ele entra em `/espetinho-do-sergio/entrar`.

### Demonstração (banco separado, dados fictícios)
```bash
npm run build && npm run demo
```
Usa um banco separado (`DEMO_DATABASE_URL`, padrão `mysql://od:od123@127.0.0.1:3306/oiticicas_demo`; o nome precisa
terminar em `_demo`). O banco de produção nunca é tocado.
- Plataforma: `/plataforma` — usuário `suporte`, senha `demo12345678`
- Espetinho (`espetinho-do-sergio`): `admin`, `gerente`, `caixa`, `garcom1`, `cozinha`, `motoboy1` — senha `demo1234`
- QR de mesa de exemplo: `/espetinho-do-sergio/mesa/demo-mesa-1`
- Segunda empresa fictícia: `pizzaria-demo` (usuário `admin`, senha `demo1234`)

### Desenvolvimento e testes
```bash
npm run dev          # API (3000) + interface com recarga (5173)
npm test             # 22 testes de integração num banco MySQL de teste recriado a cada execução
                     # (TEST_DATABASE_URL, padrão mysql://od:od123@127.0.0.1:3306/oiticicas_test; nome termina em _test)
npm run typecheck
python3 tests/e2e_browser.py   # fluxo completo no navegador (Playwright), com `npm run demo` rodando
```

## Publicação na Hostinger

Passo a passo em **`docs/HOSTINGER.md`**. Resumo:

- **Hospedagem Node.js da Hostinger (Business/Cloud) + banco MySQL da própria Hostinger:** envie o .zip ou importe do
  GitHub, build `npm run build`, entrada `dist/server.js`, e informe `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
  Logos e fotos ficam no banco, então não dependem do disco.
- **VPS da Hostinger (KVM):** `docker compose up -d --build` sobe MySQL 8.4, o sistema, HTTPS automático (Caddy) e
  backup diário do banco.

## Arquitetura

```
client/   React 19 + TypeScript + Tailwind 4 (Vite)
server/   Node + Express 5 + TypeScript, MySQL 8+/MariaDB (mysql2), validação Zod
  migrations/   SQL versionado, aplicado sozinho ao iniciar (com trava contra duas instâncias)
  services/     pedidos (máquina de estados, QR), caixa, relatórios no fuso da empresa
  routes/       autenticação, público por empresa, operação, administração da empresa, plataforma
tests/    API (node:test) e ponta a ponta (Playwright)
deploy/   Caddyfile (HTTPS)
```

Regras que valem para todas as empresas: preços calculados no servidor; pedidos e pagamentos sem duplicidade
(chave de idempotência); nada é marcado como pago sem confirmação do operador; pedidos, pagamentos, caixas,
despesas, empresas e auditoria não podem ser apagados (bloqueio no banco); cancelamentos, estornos e descontos
exigem motivo e permissão (ou senha de supervisor); comprovante **não fiscal**.

## Segurança
bcrypt (custo 12) · cookies `HttpOnly`/`SameSite=Lax`/`Secure` · sessão da plataforma separada da sessão da empresa ·
bloqueio após 5 senhas erradas · `SETUP_TOKEN` obrigatório para criar o primeiro administrador em produção ·
checagem de origem contra CSRF · validação no servidor com mensagens em português · limite de requisições nos
formulários públicos · motoboy só vê as próprias entregas, cozinha não vê valores · tempo real isolado por empresa.

## Documentos
- `docs/HOSTINGER.md` — publicação passo a passo
- `docs/CHECKLIST.md` — roteiro de testes antes de abrir para clientes
- `docs/INTEGRACOES.md` — WhatsApp oficial, pagamentos, cobrança de mensalidades, NFC-e
- `docs/ROADMAP.md` — próximas fases
