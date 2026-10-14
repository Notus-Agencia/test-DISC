# Cópia de segurança do banco (Supabase)

O plano grátis do Supabase **não faz backup**. Até o plano Pro valer a pena (quando houver cadastros de verdade no Vagas),
um robô do GitHub copia o banco todo dia, tranca a cópia com uma senha e guarda por 90 dias.

- Robô: `.github/workflows/backup-banco.yml` (todo dia às 03:41 de Brasília, e no botão **Run workflow**).
- Script: `scripts/backup-banco.sh` (o mesmo que o robô usa; dá para rodar à mão).
- O repositório é **público**: a cópia só sai trancada (AES-256). Sem a `BACKUP_SENHA`, ninguém abre, nem a equipe.

## O que entra e o que não entra

| Entra | Não entra |
|---|---|
| Tudo do DISC e do Vagas: tabelas, dados, funções, regras de acesso (`public`, `vagas_interno`) | Arquivos do Storage (as fotos opcionais do currículo do Vagas). Hoje não há nenhum. |
| Histórico das migrações (`supabase_migrations`) | Configurações do painel do Supabase (Auth, segredos das Edge Functions, URLs) |
| Contas de login e dados do Storage (`auth`, `storage`; só os dados, a estrutura é do Supabase) | O código das Edge Functions (já está no repositório) |

## Ligar (uma vez, uns 10 minutos)

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Crie dois segredos.
Nunca cole essas senhas em conversa, e-mail ou arquivo do repositório.

1. **`SUPABASE_DB_URL`**
   - No Supabase, abra o projeto e clique em **Connect** (no topo).
   - Escolha **Session pooler**, copie a URI e troque `[YOUR-PASSWORD]` pela senha do banco.
   - Use o "Session pooler", não a conexão direta: o GitHub não tem IPv6.
   - Não lembra a senha do banco? **Project Settings → Database → Reset database password**. O site e o painel não
     usam essa senha (usam chaves), então trocar não derruba nada.
2. **`BACKUP_SENHA`**
   - Uma frase longa, de 20 caracteres ou mais (por exemplo, 5 palavras soltas).
   - **Guarde também fora do GitHub** (gerenciador de senhas ou um documento privado). O GitHub não mostra o segredo
     de volta, e sem ele as cópias não abrem.

Teste na hora:
1. **Actions → Cópia de segurança do banco → Run workflow**.
2. A execução fica verde em 1 a 2 minutos.
3. No fim da página da execução, em **Artifacts**, aparece `backup-AAAA-MM-DD`.

Se ficar vermelho, a primeira linha do erro diz o motivo: segredo ausente, senha curta ou conexão recusada (aí a URI
ou a senha do banco estão erradas).

## Abrir uma cópia

1. **Baixar:** **Actions → Cópia de segurança do banco** → a execução do dia → **Artifacts**. Vem um `.zip` com o
   `backup-AAAA-MM-DD.tar.gpg` dentro.
2. **Destrancar e extrair**, num computador com GnuPG (o gpg pede a `BACKUP_SENHA`):
   ```
   gpg -d backup-AAAA-MM-DD.tar.gpg > backup.tar
   tar -xf backup.tar
   ```
3. **Resultado:** `app.dump`, `contas.dump` e `LEIA-ME.txt`.
4. **Depois de usar:** o `backup.tar` e os `.dump` têm dados pessoais (LGPD). Apague-os do computador.

## Restaurar

Os comandos usam o `pg_restore` e o `psql` da **versão 17** (a do banco).

### Caso comum: alguém apagou algo por engano

Não mexa no banco de produção às cegas. Restaure a cópia num banco à parte, ache as linhas e devolva só elas:

1. Restaure num Postgres 17 local ou num projeto Supabase descartável:
   ```
   pg_restore --no-owner --no-privileges -d "<URI do banco à parte>" app.dump
   ```
   O erro `schema "public" already exists` é esperado e pode ser ignorado.
2. Compare com produção e devolva as linhas com `INSERT` (ou peça ajuda ao Claude com o banco à parte em mãos).

### Desastre: o projeto do Supabase se perdeu

1. **Novo projeto:** crie um projeto Supabase novo (mesma região, us-east-2). Não ligue a integração com o GitHub
   ainda.
2. **Produto e migrações** (`app.dump`). O histórico de migrações vem junto, então a integração não reaplica nada
   depois:
   ```
   pg_restore --no-owner --no-privileges -d "<URI do Session pooler do projeto novo>" app.dump
   ```
3. **Contas e Storage** (`contas.dump`, só dados). Desligar os gatilhos durante a carga é o jeito que o Supabase
   indica:
   ```
   pg_restore --data-only --no-owner -f contas.sql contas.dump
   psql "<URI>" --single-transaction -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica" -f contas.sql
   ```
4. **Refazer à mão o que não vem na cópia** (veja `docs/SUPABASE.md` e `docs/VAGAS-HOSPEDAGEM.md`):
   - Auth: URLs e provedores;
   - segredos das Edge Functions;
   - integração com o GitHub;
   - as chaves novas no `js/config.js` e no `vagas/js/config.js`.
5. **Conferir:** entrar no painel do DISC, abrir um relatório e entrar numa conta do Vagas.

## Quando trocar pelo Supabase Pro

- **Quando:** no dia em que o Vagas abrir ao público em Uruaçu. A partir daí, perder currículo de candidato é sério
  pela LGPD.
- **O que o Pro traz:** backup diário com restauração por botão, sem pausa por inatividade.
- **Com o Pro:** este robô pode continuar como segunda cópia, fora do Supabase.
