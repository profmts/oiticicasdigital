# Publicação na Hostinger (MySQL)

O sistema usa **MySQL 8+ ou MariaDB 10.6+** — o mesmo banco que já vem na hospedagem da Hostinger.
As tabelas são criadas sozinhas na primeira vez que o sistema inicia.

---

## Opção A — Hospedagem Node.js (Business / Cloud) + banco MySQL da Hostinger

### 1. Criar o banco MySQL
hPanel → **Websites → Painel do site → Bancos de dados → Gerenciamento**.
Informe nome do banco, usuário e uma senha forte e clique em **Criar**. Anote os três dados
(a Hostinger acrescenta um prefixo, ex.: `u123456789_outicicas`).

### 2. Criar o Node.js Web App
hPanel → **Websites → Adicionar site → Node.js Web App** → **Enviar seus arquivos** (o .zip do sistema)
ou **Importar repositório Git**.

Configurações de build:
- Framework: **Express** (ou Other)
- Versão do Node: **22.x**
- Comando de build: `npm run build`
- Arquivo de entrada: `dist/server.js`

### 3. Variáveis de ambiente
```
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_NAME=u123456789_outicicas
DB_USER=u123456789_outicicas
DB_PASSWORD=<senha do banco>
DATABASE_POOL=5
SETUP_TOKEN=<código longo e aleatório>
COOKIE_SECURE=true
TRUST_PROXY=true
```
Se o hPanel mostrar outro host para o banco, use o que estiver lá. Também é possível usar uma única variável
`DATABASE_URL=mysql://usuario:senha@localhost:3306/banco` (evite se a senha tiver `@`, `:` ou `/`).

### 4. Deploy e primeiro acesso
Faça o deploy. No primeiro início aparece no log `[db] migration aplicada: 001_mysql.sql`.
1. `https://seudominio.com.br/plataforma/entrar` → crie o administrador da plataforma (pede o `SETUP_TOKEN`).
2. **Empresas → Espetinho do Sergio → Gerenciar → Criar administrador**.
3. O Sergio entra em `https://seudominio.com.br/espetinho-do-sergio/entrar`, cria a equipe, cadastra bairros e mesas,
   imprime os QR Codes e abre a loja.

Observações:
- Logos e fotos ficam salvos no banco, então não se perdem quando a hospedagem substitui os arquivos a cada deploy.
- Algumas hospedagens compartilhadas não permitem criar *triggers*. Nesse caso o log mostra
  `002_protecoes.sql: item ignorado` — é esperado: o sistema continua impedindo exclusões pela aplicação.
- Se o proxy da hospedagem segurar a conexão de tempo real, as telas continuam atualizando sozinhas a cada 15–30 segundos.
- Depois de mudar variáveis, use **Reiniciar** no painel do site.

### Backups
- Ative os backups automáticos do plano no hPanel.
- Use também **Bancos de dados → phpMyAdmin → Exportar** periodicamente e, dentro do sistema,
  **Configurações → Seus dados → Baixar meus dados** de cada empresa.

---

## Opção B — VPS da Hostinger (KVM) com Docker

```bash
git clone <seu-repositório> outicicas && cd outicicas   # ou envie o .zip e descompacte
cp .env.example .env && nano .env
```
Preencha `DOMAIN`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` e `SETUP_TOKEN` (ex.: `openssl rand -hex 24`).
As variáveis `DB_*` não são usadas aqui (o docker-compose preenche a conexão).

```bash
docker compose up -d --build
docker compose logs -f app      # aguarde "OUTICICAS DIGITAL rodando..."
```
Crie os registros DNS **A** `@` (e `www`) apontando para o IP do VPS; o Caddy emite o HTTPS sozinho.

- Atualizar: `git pull && docker compose up -d --build` (as migrations rodam sozinhas).
- Backup diário: o serviço `backup` grava `mysqldump` em `./backups` (14 dias).
- Restaurar: `gunzip -c backups/arquivo.sql.gz | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" outicicas'`

---

## Checklist de produção
- [ ] HTTPS ativo e `COOKIE_SECURE=true`
- [ ] `SETUP_TOKEN` definido (e guardado em local seguro)
- [ ] Administrador da plataforma criado; criar um segundo acesso de suporte em **Equipe da plataforma**
- [ ] Backup do banco testado (exportar e restaurar uma vez)
- [ ] QR Codes impressos com o domínio definitivo (se o domínio mudar, reimprima)
