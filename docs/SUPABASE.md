# Como configurar o servidor no Supabase (passo a passo)

Este guia troca o servidor antigo (Google Planilha + Apps Script) pelo **Supabase**: um banco de dados de verdade, com login, e-mail de "Esqueci minha senha" e as funções que conversam com o ClickUp. O site continua o mesmo (GitHub Pages, `https://disc.gestaosemcaos.com.br`), e o ClickUp continua sendo de onde vêm os candidatos.

**Tempo:** cerca de 1 hora, sem pressa. **Custo:** o plano grátis do Supabase atende (com o "despertador" do passo 12).

> **Como ler os "prints descritos".** O painel do Supabase muda de vez em quando. Em cada passo está escrito **onde fica o botão** e **o que aparece na tela**. Se um nome estiver um pouco diferente (ex.: "Verify JWT" virou "Enforce JWT Verification"), procure o mais parecido no mesmo lugar.

**O que você vai precisar ter à mão**

- Um e-mail e senha para entrar no Supabase (ou a conta do GitHub).
- Acesso ao repositório do site no GitHub.
- O **token do ClickUp** (começa com `pk_`; veja a seção 5 de [CLICKUP.md](CLICKUP.md)).
- Opcional: a chave da Anthropic (para o botão "Melhorar textos com IA").
- Um bloco de notas para guardar o que for copiando (marcado com 📋 ao longo do guia).

**Ordem (não pule):**

| # | Passo | Onde |
|---|---|---|
| 1 | Criar o projeto | supabase.com |
| 2 | Copiar o endereço e a chave pública | Project Settings |
| 3 | Criar o banco (colar o SQL) | SQL Editor |
| 4 | Fechar o cadastro livre | Authentication > Sign In / Providers |
| 5 | Endereços do site | Authentication > URL Configuration |
| 6 | E-mails (convite e "Esqueci minha senha") | Authentication > Emails |
| 7 | Criar o seu usuário | Authentication > Users |
| 8 | Criar as 3 funções | Edge Functions |
| 9 | Guardar os segredos | Edge Functions > Secrets |
| 10 | Trazer o histórico da planilha (opcional) | SQL Editor |
| 11 | Ligar o site ao Supabase e entrar no painel | GitHub (`js/config.js`) |
| 12 | Despertador (para o projeto não "dormir") | GitHub > Settings > Secrets |
| 13 | Webhook do ClickUp ("gerar relatório") | ClickUp (comando pronto) |
| 14 | Testar tudo e desligar o servidor antigo | Site + Apps Script |

---

## 1. Criar o projeto

1. Entre em <https://supabase.com> e clique em **Start your project** (ou **Sign in**). Pode entrar com a conta do GitHub.
2. Na primeira vez ele pede uma **Organization** (organização): dê um nome (ex.: `Notus`), tipo **Personal**, plano **Free** → **Create organization**.
3. Clique em **New project**. Aparece um formulário:
   - **Project name:** `teste-disc`.
   - **Database Password:** clique em **Generate a password** e depois em **Copy**. 📋 Guarde essa senha (é a senha do banco; o site não usa, mas o suporte pode pedir).
   - **Region:** escolha **South America (São Paulo)**. Os dados ficam no Brasil e o site responde mais rápido.
   - Se aparecer **Security options / Data API**, deixe como está (**Data API** ligado, schema `public`).
4. Clique em **Create new project**. Aparece "Setting up project…". Espere 1 a 2 minutos até a tela inicial do projeto (com "Project Status" ou "Welcome to your new project").

## 2. Copiar o endereço do projeto e a chave pública

São **dois valores públicos**: podem ficar no site sem problema, porque o banco só deixa fazer o que as regras permitem.

1. No menu da esquerda, lá embaixo, clique na engrenagem **Project Settings**.
2. Clique em **Data API**. No topo aparece **Project URL**, algo como `https://abcdefghijkl.supabase.co`. Clique no ícone de copiar. 📋 Guarde como **Project URL**.
   - O pedaço `abcdefghijkl` é o **ID do projeto** (aparece também como *Project ref* / *Reference ID*). Ele aparece nos endereços das funções.
   - Nessa mesma página, em **Exposed schemas**, deve estar só `public` (e talvez `graphql_public`). **Não** adicione `disc_interno`.
3. Ainda em Project Settings, clique em **API Keys**. Há duas abas:
   - **Legacy API Keys** (chaves antigas): copie a chave **`anon` `public`** (um texto longo que começa com `eyJ`). 📋 Guarde como **anon key**. **Use esta, se existir** — é a que funciona com todas as opções padrão do guia.
   - **Publishable and secret API keys**: se a aba Legacy não existir no seu projeto, copie a **Publishable key** (começa com `sb_publishable_`). Nesse caso, no passo 8 desligue o "Verify JWT" também da função `disc-sync` (está explicado lá).
4. ⚠️ **Nunca** copie para o site, para o GitHub ou para conversas a chave **`service_role`** nem a **Secret key** (`sb_secret_…`). Elas abrem o banco inteiro. As funções do Supabase já recebem essa chave sozinhas; você não precisa dela em lugar nenhum.

## 3. Criar o banco (colar o SQL)

1. Abra o arquivo [`supabase/migrations/20261005120000_disc.sql`](../supabase/migrations/20261005120000_disc.sql) no GitHub e clique no botão **Copy raw file** (ícone de duas folhinhas, no canto direito acima do código).
2. No Supabase, menu da esquerda → **SQL Editor** (ícone de terminal `>_`).
3. Clique em **+** (ou **New query** / **Create a new snippet**). Abre uma área de texto em branco.
4. Cole tudo (Ctrl+V) e clique em **Run** (canto inferior direito; ou Ctrl+Enter).
5. Se aparecer o aviso **"Potential issue detected — Query has destructive operations"**, é normal: o arquivo recria gatilhos e regras (não apaga dados). Clique em **Run this query**.
6. Embaixo, em **Results**, deve aparecer **"Success. No rows returned"**.

7. Repita os passos 1 a 6 com o arquivo [`supabase/migrations/20261006120000_pessoas_formulario.sql`](../supabase/migrations/20261006120000_pessoas_formulario.sql) (formulário por processo e fichas de pessoas) e depois com [`supabase/migrations/20261007120000_empresas_equipes.sql`](../supabase/migrations/20261007120000_empresas_equipes.sql) (empresas, colaboradores, organograma e relatórios de equipe/liderança/pessoa) depois com [`supabase/migrations/20261008120000_parte2.sql`](../supabase/migrations/20261008120000_parte2.sql) (segunda parte do teste: perfil exigido pelo trabalho) depois com [`supabase/migrations/20261009120000_fotos.sql`](../supabase/migrations/20261009120000_fotos.sql) (fotos do candidato, do colaborador e do usuário do painel) e por último com [`supabase/migrations/20261010120000_mover_versao.sql`](../supabase/migrations/20261010120000_mover_versao.sql) (mover candidato de processo, contratar candidato, topo do organograma e conferência da versão do banco). Sempre **nessa ordem**: `…_disc.sql`, `…_pessoas_formulario.sql`, `…_empresas_equipes.sql`, `…_parte2.sql`, `…_fotos.sql`, `…_mover_versao.sql`.

Para conferir: menu **Table Editor** → devem existir as tabelas `admins`, `processos`, `pessoas`, `respostas`, `relatorios`, `configuracoes`, `empresas`, `vinculos` e `relacoes`, todas sem o selo vermelho **"RLS disabled"** / **"Unrestricted"**.

> **Pode rodar de novo?** Sim. Cada arquivo só cria o que falta e atualiza as funções, **sem apagar** respostas nem processos. Se rodar um arquivo mais antigo de novo, rode os mais novos logo depois, na ordem (os antigos voltam algumas funções para a versão anterior).

> **Migrações novas são automáticas.** Com a integração do GitHub do Supabase ligada, cada arquivo novo em `supabase/migrations/` é aplicado sozinho no push para a branch de produção (foi assim com `20261006120000_pessoas_formulario.sql`: ela cria `pessoas`, liga as respostas que já existem à pessoa do mesmo WhatsApp e não apaga nada). Se a integração estiver desligada ou falhar, rode à mão: abra o arquivo, **Copy raw file**, cole no **SQL Editor** e **Run** (como nos passos acima).

> **Onde fica a integração e o que ela usa.** Supabase → **Project Settings → Integrations → GitHub**: repositório
> `Notus-Agencia/test-DISC`, **Working directory** `.` (a pasta `supabase/` fica na raiz), **Deploy to production** ligado e
> **Production branch name** = a branch que publica o site (hoje `claude/disc-test-selection-system-61ot0f`).
> **Mudou o repositório de dono ou de nome, ou renomeou a branch?** A integração para de receber os pushes sem avisar
> (aconteceu em 10/2026, na mudança de `wellington-dotcom` para `Notus-Agencia`): abra essa tela, escolha o repositório de
> novo, confira a branch e clique em **Enable integration**. O sinal de que parou é a faixa "banco desatualizado" no painel.

### 3a. Conferir se o banco está atualizado

O painel faz isso sozinho: ao entrar, se faltar alguma migração, aparece no topo a faixa **"O banco de dados está desatualizado: faltam …"** com o nome dos arquivos que faltam. Para conferir à mão:

1. **SQL Editor** → **+** → cole e rode:
   ```sql
   select public.versao_banco();
   ```
2. Resposta esperada: `{"ok": true, "versao": 20261010120000, "migracoes": [...], "faltando": []}`.
   - `faltando` com nomes (ex.: `["20261009120000_fotos"]`) = rode esses arquivos (passo 3b).
   - Erro **`function public.versao_banco() does not exist`** = a `20261010120000_mover_versao.sql` ainda não foi aplicada (e talvez outras). Rode a consulta abaixo para ver quais existem e depois aplique as que faltam (passo 3b):
   ```sql
   select
     to_regclass('public.pessoas')  is not null as "20261006 pessoas",
     to_regclass('public.empresas') is not null as "20261007 empresas",
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'respostas' and column_name = 'exigido') as "20261008 parte2",
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'respostas' and column_name = 'foto') as "20261009 fotos",
     exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'respostas' and column_name = 'historico_processos') as "20261010 mover/versão";
   ```
   Cada coluna `false` = essa migração falta.
3. Também dá para ver o histórico da integração do GitHub em **Database → Migrations** (lista das migrações aplicadas por ela). Migração rodada à mão no SQL Editor **não** aparece nessa lista — por isso a conferência acima vale mais.

### 3b. Aplicar migrações à mão no SQL Editor, na ordem

Use quando a faixa do painel avisar, quando a integração do GitHub estiver desligada ou quando um push falhar ao aplicar.

1. Veja quais faltam (passo 3a).
2. Para **cada arquivo que falta, do mais antigo para o mais novo** (a ordem é a do número no começo do nome):
   `20261006120000_pessoas_formulario.sql` → `20261007120000_empresas_equipes.sql` → `20261008120000_parte2.sql` → `20261009120000_fotos.sql` → `20261010120000_mover_versao.sql`:
   1. Abra o arquivo em `supabase/migrations/` no GitHub → **Copy raw file**.
   2. **SQL Editor** → **+** → cole tudo → **Run** (se aparecer "destructive operations", **Run this query**: são gatilhos e funções recriados, nenhum dado é apagado).
   3. Confira **"Success. No rows returned"** antes de ir para o próximo.
3. Na dúvida, pode rodar **todos** a partir do primeiro que falta: cada arquivo é idempotente (só cria o que falta e não apaga respostas, pessoas, empresas nem relatórios). O que **não** pode é rodar um antigo e parar: rode sempre até o último.
4. Rode `select public.versao_banco();` de novo: `faltando` deve vir `[]`. Recarregue o painel (a faixa some).

## 4. Fechar o cadastro livre

Sem isso, qualquer pessoa poderia criar uma conta (ela não veria nada, mas não há motivo para deixar aberto).

1. Menu **Authentication** (ícone de pessoas) → no submenu, **Sign In / Providers** (em versões antigas: **Providers** ou **Settings**).
2. Na seção **User Signups**, **desligue** **Allow new users to sign up**.
3. Deixe **ligado** o provedor **Email** (na lista **Auth Providers**). Se quiser, dentro dele mantenha **Confirm email** ligado.
4. Clique em **Save changes**.

Convites feitos pelo painel continuam funcionando com o cadastro fechado.

## 5. Endereços do site (para os links dos e-mails)

1. **Authentication** → **URL Configuration**.
2. **Site URL:** apague o que estiver (`http://localhost:3000`) e escreva `https://disc.gestaosemcaos.com.br` → **Save changes**.
3. **Redirect URLs** → **Add URL** → escreva `https://disc.gestaosemcaos.com.br/admin.html` → **Save URLs**.
   - Opcional, para testar no computador: adicione também `http://localhost:4173/admin.html`.
4. **Vagas sem Caos:** adicione também `https://vagas.gestaosemcaos.com.br/**` (os links dos e-mails do Vagas abrem
   `https://vagas.gestaosemcaos.com.br/entrar.html?token_hash=…`). Veja a seção 15.

## 6. E-mails (convite e "Esqueci minha senha")

O Supabase manda e-mails sozinho, **mas o servidor de e-mail grátis dele só entrega para os e-mails dos membros da sua organização no Supabase** e só poucos por hora. Para o "Esqueci minha senha" funcionar para você, isso basta. Para **convidar outras pessoas** para o painel, configure um servidor de e-mail próprio (SMTP):

1. **Authentication** → **Emails** → aba **SMTP Settings** → ligue **Enable Custom SMTP**.
2. Preencha com os dados do seu provedor de e-mail (ex.: Gmail com "senha de app", Brevo, Resend, Zoho):
   - **Sender email** (ex.: `nao-responda@gestaosemcaos.com.br`) e **Sender name** (ex.: `Gestão sem Caos`);
   - **Host**, **Port**, **Username**, **Password** (o provedor informa).
3. **Save changes**.
4. Na aba **Templates**, cole os modelos de `supabase/templates/` (um por tipo de e-mail: `recuperar-senha.html` em **Reset Password**, `convite.html` em **Invite user**, `link-de-acesso.html` em **Magic Link**, `confirmar-cadastro.html` em **Confirm signup**, `trocar-email.html` em **Change Email Address**).
   O botão deles leva para `https://disc.gestaosemcaos.com.br/admin.html?token_hash={{ .TokenHash }}&type=…`: o link fica no domínio do site (e não no do Supabase) e o próprio painel confere o código (`verifyOtp`), de modo que antivírus de e-mail que "abrem" o link antes da pessoa não o gastam. Links antigos (`{{ .ConfirmationURL }}`) continuam funcionando. Se o domínio do site mudar, troque o endereço nos cinco modelos.

> Sem SMTP próprio, você ainda pode dar acesso a alguém: crie o usuário à mão (como no passo 7, com **Auto Confirm User**), mande a senha por um canal seguro e depois, **no painel**, aba **Usuários** → **Convidar administrador** com o **mesmo e-mail** (como o usuário já existe, o painel só libera o acesso, sem mandar e-mail). Sem esse último passo a pessoa entra e vê "Este e-mail ainda não tem acesso ao painel". No primeiro acesso ela troca a senha pelo menu do painel.

## 7. Criar o seu usuário (você vira administrador no primeiro login)

1. **Authentication** → **Users** → botão **Add user** (canto superior direito) → **Create new user**.
2. **Email address:** o seu e-mail. **User Password:** uma senha forte (pelo menos 8 caracteres). 📋 Guarde.
3. Marque **Auto Confirm User?** e clique em **Create user**.

Não existe mais "chave de primeiro acesso": **o primeiro usuário que entrar no painel vira administrador automaticamente** (o painel mostra uma mensagem avisando). Depois disso, só um administrador dá acesso a outra pessoa (aba **Usuários** do painel → **Convidar**).

> Faça o primeiro login **você mesmo**, logo depois do passo 11, antes de criar qualquer outro usuário.

## 8. Criar as 3 funções (Edge Functions)

O sistema tem três funções. Cada uma é **um arquivo só**, já pronto, na pasta [`dist/funcoes/`](../dist/funcoes) do repositório:

| Nome da função (exatamente assim) | Arquivo para colar | Para que serve | Verify JWT |
|---|---|---|---|
| `admin` | `dist/funcoes/admin/index.ts` | Painel: ClickUp, relatórios, IA e usuários (só administradores) | **Ligado** |
| `disc-sync` | `dist/funcoes/disc-sync/index.ts` | Leva o resultado do candidato para a tarefa dele no ClickUp | **Ligado** (desligue só se usou a Publishable key no passo 2) |
| `clickup-webhook` | `dist/funcoes/clickup-webhook/index.ts` | Recebe o aviso do ClickUp quando o briefing vai para "gerar relatório" | **Desligado** |
| `clima` | `dist/funcoes/clima/index.ts` | Pesquisa de clima com identificação: manda o código de confirmação do link pessoal (e-mail pelo Resend) | **Desligado** |
| `vagas-conta` | `dist/funcoes/vagas-conta/index.ts` | Vagas sem Caos: cria as contas (pessoa, empresa, cadastro assistido, operador) e manda os links de confirmar e de "Esqueci minha senha"; exclui a conta (seção 15) | **Desligado** (confere o login sozinha quando precisa) |

Para **cada** linha da tabela:

1. No GitHub, abra o arquivo da coluna "Arquivo para colar" e clique em **Copy raw file**.
2. No Supabase, menu **Edge Functions** (ícone de raio/chaves `{}`) → botão **Deploy a new function** → **Via Editor**.
3. Abre um editor com um código de exemplo (`Deno.serve…`). Clique dentro, selecione tudo (Ctrl+A), apague e cole o arquivo (Ctrl+V).
4. Embaixo, no campo **Function name**, apague o nome sugerido (ex.: `hello-world`) e escreva o nome da primeira coluna (`admin`, `disc-sync` ou `clickup-webhook`).
5. Clique em **Deploy function**. Espere a mensagem de sucesso (10 a 30 segundos). A tela muda para a página da função, com o endereço `https://<ID do projeto>.supabase.co/functions/v1/<nome>`.
6. Ajuste o **Verify JWT** conforme a última coluna: na página da função, aba **Details** → seção **Function Configuration** → chave **Verify JWT with legacy secret** / **Enforce JWT Verification** → **Save changes**.
   - `clickup-webhook` **precisa** ficar **desligado**: quem chama é o ClickUp, que não tem login. A segurança dela é a assinatura do ClickUp (segredo `CLICKUP_WEBHOOK_SECRET`, passo 9).
   - `admin` confere sozinha se quem chamou é administrador; mesmo se você desligar o Verify JWT dela, ninguém de fora consegue usar.
   - `disc-sync` só responde `{ok}` e nunca devolve dados; desligar é seguro, se precisar.

> **Atualizar uma função depois:** quando um desses arquivos mudar no repositório, abra **Edge Functions** → clique na função → aba **Code** → apague tudo, cole o arquivo novo → **Deploy updates**. Confira que o Verify JWT continua como na tabela.

## 9. Guardar os segredos (Secrets)

Segredos são senhas que **só as funções** enxergam; nunca vão para o site.

1. **Edge Functions** → no submenu, **Secrets**.
2. Em **Add or replace secrets**, preencha **Name** e **Value**. Use **Add another** para mais de um e, no fim, **Save**.

| Name | Value | Obrigatório? |
|---|---|---|
| `SITE_URL` | `https://disc.gestaosemcaos.com.br` (sem barra no fim) | Sim — usado no link do convite, no link do relatório comentado no ClickUp e para liberar o site a chamar as funções |
| `CLICKUP_TOKEN` | o token do ClickUp (`pk_…`) | Sim, para usar o ClickUp |
| `CLICKUP_PASTA_ID` | ID da pasta de recrutamento no ClickUp (o número no endereço da pasta) | Opcional — sem ele, o painel lista todas as listas do workspace |
| `ANTHROPIC_API_KEY` | a chave da Anthropic (`sk-ant-…`) | Opcional — sem ela, o botão "Melhorar textos com IA" não aparece |
| `CLICKUP_WEBHOOK_SECRET` | o `secret` devolvido pelo ClickUp no passo 13 | Só depois do passo 13 |
| `VAGAS_SITE_URL` | `https://vagas.gestaosemcaos.com.br` (sem barra no fim) | Para o Vagas sem Caos: endereço dos links dos e-mails e única origem liberada para chamar a `vagas-conta` |
| `VAGAS_EMAIL_REMETENTE` | `Vagas · Gestão sem Caos <vagas@gestaosemcaos.com.br>` | Opcional — sem ele, a `vagas-conta` usa o `EMAIL_REMETENTE` do DISC |
| `TURNSTILE_SECRET` | a chave secreta do widget Turnstile da Cloudflare | Opcional — liga o "não sou robô" no cadastro, reenviar e "Esqueci minha senha" do Vagas (a chave pública vai em `vagas/js/config.js`, `TURNSTILE_SITE_KEY`) |

- Pesquisa de clima com identificação: o código por e-mail usa os mesmos `RESEND_API_KEY` e `EMAIL_REMETENTE` (docs/EMAILS.md). `WHATSAPP_PROVEDOR` fica **sem criar** até existir um provedor de WhatsApp contratado (sem ele, a opção "Código por WhatsApp" não aparece).
- **Não** crie `SUPABASE_URL`, `SUPABASE_ANON_KEY` nem `SUPABASE_SERVICE_ROLE_KEY`: o Supabase já fornece esses sozinho (eles aparecem na lista com um cadeado).
- Trocou um segredo? Não precisa reimplantar: vale na próxima chamada.

## 10. Trazer o histórico da planilha (opcional)

Faça este passo **antes** do passo 11 se quiser manter no painel os candidatos antigos e **os mesmos links/códigos de processo** (assim os links já enviados continuam funcionando).

1. Na planilha do Google, abra a aba **Avaliacoes** → **Arquivo** → **Fazer download** → **Valores separados por vírgula (.csv)**. Salve como `Avaliacoes.csv`.
2. Faça o mesmo com a aba **Respostas** → `Respostas.csv`.
3. Num computador com o [Node.js](https://nodejs.org) instalado, dentro da pasta do repositório:

   ```bash
   node scripts/migrar-planilha.mjs Respostas.csv --processos Avaliacoes.csv --saida importar.sql
   ```

   Ele mostra quantos processos e respostas converteu e um **Aviso** para cada linha que pulou (ex.: respostas incompletas, data inválida). Os D/I/S/C e o perfil são recalculados como o servidor faz.
   - Não tem Node? Peça ao Claude: envie os dois CSVs e peça "gere o importar.sql com scripts/migrar-planilha.mjs".
4. **SQL Editor** → **+** → cole o conteúdo de `importar.sql` → **Run**. Deve aparecer "Success".
5. Confira em **Table Editor** → `respostas` e `processos`.

Observações:
- Pode rodar o mesmo arquivo de novo: o que já existe é pulado.
- O banco aceita até 2.000 respostas no total (proteção contra abuso) e existem 2.400 códigos de candidato (ex.: `47K`); o histórico conta nos dois limites. Se a planilha tiver muitos candidatos antigos, apague antes os de processos encerrados.
- Os **relatórios** já publicados na planilha **não** são migrados: gere de novo pelo painel, se precisar.
- Os logins antigos (aba Usuarios) não são migrados: cada pessoa é convidada de novo pelo painel.
- Depois de importar, **apague os CSVs e o `importar.sql`** do computador (têm dados pessoais).

## 11. Ligar o site ao Supabase e entrar no painel

O site só passa a usar o Supabase quando o arquivo `js/config.js` mudar. O mais simples é **mandar para o Claude** a 📋 Project URL e a 📋 anon key (as duas são públicas) e pedir: "ligue o site ao Supabase". Ele publica uma prévia e só faz o push depois da sua aprovação.

Se preferir fazer você mesmo, no GitHub: abra `js/config.js` → ícone de lápis (**Edit this file**) → troque estas três linhas:

```js
    BACKEND: 'supabase',
    SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOi...a chave anon inteira...',
```

→ **Commit changes…** → **Commit changes**. O GitHub Pages atualiza o site em 1 a 2 minutos.

Depois:

1. Abra `https://disc.gestaosemcaos.com.br/admin.html` (se a página antiga aparecer, recarregue com Ctrl+F5).
2. Entre com o e-mail e a senha do passo 7. Na primeira vez aparece o aviso de que você virou **administrador**.
3. Aba **Processos**: confira os processos (importados no passo 10) ou crie os novos. Ao ligar um processo a uma lista do ClickUp, a lista aparece num seletor (se o `CLICKUP_TOKEN` estiver certo).
4. Aba **Usuários**: **Convidar** manda um e-mail para a pessoa criar a própria senha (precisa do SMTP do passo 6). **Remover** tira o acesso. Ninguém redefine a senha de outra pessoa: cada um usa **Esqueci minha senha** na tela de entrada.

> **Voltar atrás:** se algo der muito errado, troque `BACKEND` de volta para `'appsscript'` no `js/config.js`. O servidor antigo continua no repositório (pasta `apps-script/`) até você desligá-lo no passo 14.

## 12. Despertador (para o projeto grátis não "dormir")

No plano grátis, o Supabase **pausa** o projeto depois de 7 dias sem nenhum acesso (o site para de gravar até alguém reativar). O repositório já tem um robô do GitHub ([`.github/workflows/manter-ativo.yml`](../.github/workflows/manter-ativo.yml)) que faz uma consulta inofensiva a cada 3 dias. Ele só precisa de dois segredos:

1. No GitHub, abra o repositório → **Settings** → no menu da esquerda, **Secrets and variables** → **Actions**.
2. Clique em **New repository secret**:
   - **Name:** `SUPABASE_URL` · **Secret:** a 📋 Project URL → **Add secret**.
3. De novo **New repository secret**:
   - **Name:** `SUPABASE_ANON_KEY` · **Secret:** a 📋 anon key (ou a Publishable key) → **Add secret**.
4. Teste na hora: aba **Actions** → à esquerda, **Manter Supabase ativo** → **Run workflow** → **Run workflow**. Em 1 minuto aparece um ✅ verde. Clique nele para ver "Supabase respondeu (o projeto está ativo)".

- Sem esses dois segredos o robô não faz nada (fica verde com o aviso "despertador desligado").
- O GitHub desliga robôs agendados de repositórios sem nenhuma alteração há 60 dias e manda um e-mail avisando. Se receber, vá em **Actions** → **Manter Supabase ativo** → **Enable workflow**.
- Se o projeto for pausado mesmo assim: no Supabase, abra o projeto e clique em **Restore project** (leva alguns minutos; os dados não se perdem).

## 13. Webhook do ClickUp ("gerar relatório" no ClickUp)

Isto faz o ClickUp **avisar o Supabase** quando a tarefa **📌 Briefing…** de um processo for para o status **gerar relatório**. O sistema então gera o rascunho, comenta "Rascunho pronto para revisão no painel" e muda o status para **relatório em revisão** (se esse status existir na lista). Antes isso era o gatilho de 10 minutos do Apps Script; agora é na hora.

O ClickUp **não tem tela** para esse tipo de webhook (o "Call webhook" das Automações não assina a mensagem); ele é criado com **um comando**. Você precisa de:

- **TOKEN**: o token `pk_…` do ClickUp.
- **WORKSPACE**: o número do seu workspace. Abra o ClickUp no navegador: o endereço é `https://app.clickup.com/9012345678/home` → o número depois de `app.clickup.com/` é o workspace.
- **ENDERECO**: `https://<ID do projeto>.supabase.co/functions/v1/clickup-webhook` (o ID do projeto é o pedaço da Project URL).

**No Windows** (menu Iniciar → digite `PowerShell` → abra), cole trocando os três valores:

```powershell
$TOKEN = "pk_COLE_AQUI"
$WORKSPACE = "9012345678"
$ENDERECO = "https://abcdefghijkl.supabase.co/functions/v1/clickup-webhook"
$corpo = @{ endpoint = $ENDERECO; events = @("taskStatusUpdated") } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri "https://api.clickup.com/api/v2/team/$WORKSPACE/webhook" -Headers @{ Authorization = $TOKEN } -ContentType "application/json" -Body $corpo
"ID do webhook: " + $r.id
"SECRET (copie): " + $r.webhook.secret
```

**No Mac ou Linux** (Terminal):

```bash
TOKEN="pk_COLE_AQUI"
WORKSPACE="9012345678"
ENDERECO="https://abcdefghijkl.supabase.co/functions/v1/clickup-webhook"
curl -sS -X POST "https://api.clickup.com/api/v2/team/$WORKSPACE/webhook" \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d "{\"endpoint\":\"$ENDERECO\",\"events\":[\"taskStatusUpdated\"]}"
```

A resposta tem `"id": "…"` e, dentro de `"webhook"`, um `"secret": "…"`. 📋 Copie o **secret** e guarde também o **id** (serve para apagar o webhook depois).

Por fim, no Supabase: **Edge Functions** → **Secrets** → **Name** `CLICKUP_WEBHOOK_SECRET`, **Value** = o secret → **Save**.

⚠️ **Desligue o gatilho antigo do Apps Script agora** (se ele existir): na planilha → **Extensões** → **Apps Script** → **Acionadores** (ícone de relógio) → apague o acionador criado por `instalarGatilho`. Senão os dois servidores reagem ao mesmo "gerar relatório" e o ClickUp recebe comentário em dobro.

Para testar: num processo ligado a uma lista do ClickUp, mude a tarefa **📌 Briefing…** para **gerar relatório**. Em menos de 1 minuto deve aparecer o comentário no ClickUp e o rascunho no painel (página do processo).

Comandos úteis (troque os valores; no Windows use `Invoke-RestMethod -Method Get/Delete/Put` com o mesmo cabeçalho):

```bash
# ver os webhooks e a "saúde" de cada um (health: active / failing / suspended)
curl -sS "https://api.clickup.com/api/v2/team/$WORKSPACE/webhook" -H "Authorization: $TOKEN"
# reativar um webhook suspenso
curl -sS -X PUT "https://api.clickup.com/api/v2/webhook/ID_DO_WEBHOOK" -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" -d '{"status":"active"}'
# apagar um webhook
curl -sS -X DELETE "https://api.clickup.com/api/v2/webhook/ID_DO_WEBHOOK" -H "Authorization: $TOKEN"
```

> Mesmo sem o webhook, tudo funciona: o rascunho também é gerado no painel, pelo botão **Gerar rascunho do relatório** na página do processo.

## 14. Testar tudo e desligar o servidor antigo

**Teste rápido (10 minutos):**

1. **Candidato:** no painel, aba **Processos**, copie o link de um processo e abra numa janela anônima do celular. Faça o teste com dados de teste (ex.: "Teste Notus", seu WhatsApp). No fim aparece o código (ex.: `47K`).
2. **Painel:** recarregue a aba **Participantes**: o teste aparece com o mesmo código.
3. **ClickUp:** se o processo está ligado a uma lista, em até 1 minuto a tarefa do candidato (achada pelo WhatsApp) recebe os campos do DISC; se não achar, aparece uma tarefa nova "Teste Notus (DISC)" com a etiqueta **sem formulário**.
4. **Relatório:** gere um rascunho, **Publicar**, abra o link e depois **Despublicar**.
5. **Senha:** saia do painel, clique em **Esqueci minha senha**, siga o e-mail e defina uma senha nova.
6. Apague o participante de teste (detalhe → **Excluir**) e a tarefa de teste no ClickUp.

**Desligar o servidor antigo** (depois de uns dias com tudo certo):

1. Confira que o acionador do Apps Script já foi apagado (passo 13): na planilha → **Extensões** → **Apps Script** → menu **Acionadores** (ícone de relógio) → não deve sobrar o da função de relatório (criado por `instalarGatilho`).
2. **Implantar** → **Gerenciar implantações** → **Arquivar** a implantação do App da Web.
3. Guarde a planilha por um tempo como cópia e depois apague os dados pessoais (veja "LGPD" abaixo).

---

## 15. Vagas sem Caos (vagas.gestaosemcaos.com.br)

O Vagas sem Caos usa **o mesmo projeto** do Supabase do DISC (as tabelas dele começam com `vagas_` e ficam separadas;
nada do DISC muda). Contrato técnico: [VAGAS-SPEC.md](VAGAS-SPEC.md); hospedagem do site: [VAGAS-HOSPEDAGEM.md](VAGAS-HOSPEDAGEM.md).

1. **Banco:** aplique [`supabase/migrations/20261022120000_vagas.sql`](../supabase/migrations/20261022120000_vagas.sql)
   (com a integração do GitHub ela entra sozinha; à mão: SQL Editor → cole → Run, como no passo 3b). Ela é idempotente,
   não apaga nada e cria uma semente fictícia de cidades (Boa Vista, Mucajaí, Cantá e Rorainópolis — a 20261024120001, item
   1b, passa as quatro para rascunho). Confira: `select public.versao_banco();` deve trazer `20261022120000_vagas` em `migracoes`.
   A mesma migração faz o primeiro login **nunca** promover uma conta do Vagas a administradora do painel DISC.
   Ela também cria no **Storage** o bucket PRIVADO `vagas-fotos` (foto opcional da pessoa: até 1 MB, jpg/png/webp) e as
   políticas: cada pessoa grava, troca e apaga só a própria foto; ninguém lê direto (a empresa recebe, depois do Combinou,
   uma URL de 5 minutos assinada pela função `vagas-conta`). Confira em **Storage → Buckets** (deve aparecer `vagas-fotos`,
   sem o selo "Public").
1b. **Onda 2 e praça piloto:** depois das migrações dos testes de habilidade (20261023), aplique na ordem
   [`20261024120000_vagas_onda2.sql`](../supabase/migrations/20261024120000_vagas_onda2.sql) (painel da praça com os 15
   indicadores, equipe da empresa com convite por e-mail, WhatsApp opcional na lista de espera, fuso da cidade nos testes) e
   [`20261024120001_vagas_piloto_uruacu.sql`](../supabase/migrations/20261024120001_vagas_piloto_uruacu.sql) (cria Uruaçu-GO
   **em lista de espera**, porte pequena, fuso de Brasília, com as 6 zonas da operação; passa as cidades de Roraima da
   semente para rascunho uma vez só). As duas são idempotentes e não apagam nada. Confira: `select public.versao_banco();` deve
   trazer `versao: 20261024120001` e `faltando` vazio (ou só `20261023120001_vagas_questoes`, se o banco de questões ainda não
   foi carregado). **Para abrir Uruaçu:** painel (grupo "Vagas") ou `admCidadeSalvar({slug:'uruacu-go', status:'ativa'})`
   com o login da equipe — rodar a migração de novo não fecha a cidade. Se alguém rodar a 20261022 ou a 20261023 de novo
   depois, rode a 20261024120000 em seguida (ela recria as funções que aquelas voltariam à versão antiga). Depois de aplicar,
   **publique de novo a função `vagas-conta`** (item 2): o convite de equipe é a ação nova `convite_equipe`, e o `excluir`
   passa a conferir a última pessoa dona. Limpeza das contas criadas por convite e nunca confirmadas: roda a cada convite novo;
   para rodar também sem convites, agende no `pg_cron` (Database → Cron) `select vagas_interno.contas_convite_limpar();`
   uma vez por dia. Confira uma vez no SQL Editor que ela roda sem erro de permissão no `auth.users` (sem permissão ela só
   devolve 0 e o convite continua funcionando).
1c. **Aviso de abertura da lista de espera:** aplique
   [`20261024120002_vagas_aviso_abertura.sql`](../supabase/migrations/20261024120002_vagas_aviso_abertura.sql) depois da
   20261024120001 (idempotente; só acrescenta colunas, um gatilho e funções). Confira: `versao_banco()` com
   `versao: 20261024120002`. **Publique de novo a função `vagas-conta`** (ação nova `avisar_lista_espera`: só a equipe, em
   lotes de até 50 e-mails). Agende no `pg_cron` (Database → Cron), uma vez por dia, `select vagas_interno.lista_espera_limpar();`
   (tira da lista quem já foi avisado e, 30 dias depois da abertura, a lista inteira da cidade). Como avisar, passo a passo:
   [VAGAS-SPEC.md §6.7](VAGAS-SPEC.md). Ela traz também as correções da 2ª revisão de segurança (N1, N2) por cima de funções da
   20261024120000: se alguém rodar a 20261024120000 de novo, rode a 20261024120002 em seguida. **Aplique antes do primeiro aviso.**
1d. **Reforço do aviso (aplique ANTES do primeiro aviso real):**
   [`20261024120003_vagas_aviso_reforco.sql`](../supabase/migrations/20261024120003_vagas_aviso_reforco.sql), depois da
   20261024120002 (idempotente). Confira: `versao_banco()` com `versao: 20261024120003`. **Publique de novo a função
   `vagas-conta`.** O que muda: o e-mail da lista passa a aceitar só caracteres ASCII visíveis (linhas antigas que não
   passariam saem); a fila do aviso não trava (e-mail recusado não volta; falha vai para o fim, até 3 vezes); teto de
   60 e-mails de aviso em 24 h (sobra cota do Resend para confirmação, senha e convites). Para mudar o teto (por exemplo,
   no plano pago do Resend), no SQL Editor:
   `insert into vagas_interno.ajustes (chave, valor) values ('aviso_teto_diario', '200') on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();`
   A tabela `vagas_interno.ajustes` guarda também um sal secreto gerado na migração (`sal_privado`): não apague nem copie
   essa linha (sem ela, as marcas de "saiu da lista" e os limites por e-mail recomeçam do zero).
1e. **Pré-abertura, canal e lista de espera nova:**
   [`20261024120004_vagas_pre_abertura.sql`](../supabase/migrations/20261024120004_vagas_pre_abertura.sql), depois da
   20261024120003 (idempotente). Confira: `versao_banco()` com `versao: 20261024120004`. **Publique de novo a função
   `vagas-conta`** (ação nova `lista_espera`). O que muda: na cidade em lista de espera a empresa já se cadastra e anuncia
   (a vaga fica pronta e invisível e entra no ar no dia da abertura, com a validade contada dali); cada cidade pode ter o
   canal de WhatsApp (só o link do canal); a lista de espera guarda de onde a pessoa veio (lista fechada), tem limites
   separados para entrar e sair, por e-mail e por WhatsApp, e a isca `site`. Turnstile na lista: com a chave pública no site
   e o `TURNSTILE_SECRET` na função, ligue no SQL Editor
   `insert into vagas_interno.ajustes (chave, valor) values ('lista_espera_captcha', 'sim') on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();`
   (desligar: `delete from vagas_interno.ajustes where chave = 'lista_espera_captcha';`).
1f. **Ajustes da fase C:** [`20261024120005_vagas_fase_c.sql`](../supabase/migrations/20261024120005_vagas_fase_c.sql), depois da
   20261024120004 (idempotente). Confira: `versao_banco()` com `versao: 20261024120005`. Ela muda dados de um jeito só: as
   vagas que pediam experiência "até 1 ano", "1 a 3 anos" ou "mais de 3 anos" passam a "pelo menos 6 meses na função"
   (CLT, art. 442-A). A empresa deixa de ver se a pessoa aceitou a referência (veto P2 da psicologia).
2. **Função `vagas-conta`:** crie como no passo 8 (arquivo `dist/funcoes/vagas-conta/index.ts`) com **Verify JWT
   desligado** (o cadastro é feito por quem ainda não tem login; as ações que exigem login conferem o token sozinhas).
3. **Segredos** (passo 9): `RESEND_API_KEY` (o mesmo do DISC), `VAGAS_SITE_URL`, e os opcionais `VAGAS_EMAIL_REMETENTE` e
   `TURNSTILE_SECRET`. A `vagas-conta` também lê o `SITE_URL` do DISC (o mesmo segredo do passo 9) para aceitar chamadas do
   painel do DISC (convite de operador pela aba "Vagas"); sem ele, aceita `https://disc.gestaosemcaos.com.br`. Nenhuma chave secreta vai para o site: `vagas/js/config.js` leva só a URL do projeto e a chave
   **pública** (as mesmas de `js/config.js`).
4. **Redirect URL** (passo 5): `https://vagas.gestaosemcaos.com.br/**`.
5. **Cadastro aberto do Auth continua fechado** (passo 4): as contas do Vagas são criadas só pela função `vagas-conta`
   (com `app_metadata.produto = 'vagas'`), sem senha no cadastro — a pessoa cria a senha depois de clicar no link.
6. **Ligar o site ao banco:** em `vagas/js/config.js`, troque `MODO: 'previa'` por `MODO: 'supabase'` (até lá o site roda
   com dados fictícios de Uruaçu guardados só no navegador). Na página, `?previa=1` volta a prévia só naquela aba.
7. **Operadores das cidades:** pelo painel (grupo "Vagas", quando existir) ou chamando a ação `operador` da `vagas-conta`
   com o login da equipe; o operador recebe o link, cria a senha e só enxerga empresas, vagas e denúncias da cidade dele
   (nunca pessoas nem contatos).
8. **Na semana de abrir:** plano Pro do Supabase (o grátis pausa projeto parado e tem limites menores) e domínio `vagas` no DNS
   ([VAGAS-HOSPEDAGEM.md](VAGAS-HOSPEDAGEM.md)).
9. **Excluir uma conta do Vagas (LGPD):** SEMPRE pela ação `excluir` da função `vagas-conta` (botão "Excluir minha conta" no
   site, ou a equipe chamando a função com o login da pessoa). Ela apaga a foto do bucket `vagas-fotos` ANTES de apagar o
   usuário — apagar pelo painel do Supabase (Authentication → Users → Delete) deixa a foto órfã no Storage. Os prazos de
   retenção propostos estão em [VAGAS-SPEC.md §7.1](VAGAS-SPEC.md) (para o advogado confirmar); a limpeza automática entra
   depois da decisão.

| Erro no site do Vagas | Causa | O que fazer |
|---|---|---|
| "O banco de dados ainda não tem o Vagas sem Caos…" | migração 20261022 não aplicada | item 1 |
| "O cadastro ainda não está disponível…" | função `vagas-conta` não publicada | item 2 |
| Painel da praça, equipe da empresa ou WhatsApp da lista de espera: "O banco de dados ainda não tem o Vagas sem Caos…" | 20261024120000 não aplicada | item 1b |
| Convite de equipe: "Ação desconhecida." | `vagas-conta` publicada antes da onda 2 | item 1b (publicar a função de novo) |
| "Avisar por e-mail" (lista de espera): "Ação desconhecida." ou "O banco de dados ainda não tem…" | `vagas-conta` antiga ou 20261024120002 não aplicada | item 1c |
| Lista de espera: "Confirme que você não é um robô…" para todo mundo | ajuste `lista_espera_captcha` ligado sem o site mandar o captcha | item 1e (desligar o ajuste ou pôr a chave do Turnstile no site) |
| "Avisar por e-mail" para no meio com `tetoAtingido` | acabou a cota de 24 h do aviso (padrão 60) | continue no dia seguinte, ou aumente o ajuste `aviso_teto_diario` (item 1d) |
| "O envio de e-mail ainda não está configurado…" | falta `RESEND_API_KEY` | item 3 |
| Link do e-mail abre o DISC ou dá "link expirou" | Redirect URL ou `VAGAS_SITE_URL` faltando | itens 3 e 4; peça um link novo |

## Se algo der errado

| O que aparece | Causa provável | O que fazer |
|---|---|---|
| Painel: faixa "O banco de dados está desatualizado: faltam …" ou mensagem "O banco de dados está desatualizado. Peça para aplicar as migrações" | Alguma migração de `supabase/migrations/` não foi aplicada no projeto | Passos 3a e 3b: confira quais faltam e rode na ordem. |
| SQL Editor: `ERROR: relation "auth.users" does not exist` | O SQL foi rodado fora do Supabase | Cole no SQL Editor do projeto Supabase (passo 3). |
| SQL Editor: `ERROR: ... already exists` ou `permission denied` | Rodou só um pedaço do arquivo ou um arquivo antigo | Copie o arquivo **inteiro** de novo pelo **Copy raw file** e rode. Ele pode ser rodado várias vezes. Se continuar, copie a mensagem e mande para o Claude. |
| Site do candidato: "Link inválido ou avaliação encerrada" | Código do processo errado ou processo desativado | No painel, aba Processos, confira se o processo está **Ativo** e copie o link de novo. |
| Site do candidato: "Este link de avaliação não está mais ativo." | O processo foi desativado ou apagado | Reative o processo no painel. |
| Site: "Não foi possível conectar ao servidor" | Project URL ou anon key errados no `js/config.js`, ou projeto pausado | Confira os dois valores (passo 2 e 11). No Supabase, veja se o projeto está **Paused** → **Restore project**. |
| Painel: "E-mail ou senha incorretos." | Senha errada ou usuário não confirmado | Use **Esqueci minha senha**, ou em Authentication > Users confira se o usuário existe (crie de novo marcando **Auto Confirm User**). |
| Painel: "Este e-mail ainda não tem acesso ao painel…" (ou "Sem permissão.") logo depois de entrar | Já existe outro administrador e você não é um deles | Peça a um administrador para convidar você. Se você é o dono e ninguém mais tem acesso: SQL Editor → `insert into public.admins (user_id, nome) select id, 'Dono' from auth.users where email = 'seu@email.com' on conflict do nothing;` → Run. |
| Painel: "Sessão expirada. Entre de novo." toda hora | Relógio do computador errado, ou o navegador bloqueia armazenamento | Acerte data/hora do computador; não use janela anônima para o painel. |
| "Esqueci minha senha"/convite: e-mail não chega | Servidor de e-mail grátis do Supabase (só entrega para membros da organização e poucos por hora) | Configure o SMTP próprio (passo 6). Olhe também o spam. Em **Authentication > Logs** aparece o motivo. |
| Link do e-mail abre o site errado (ex.: `localhost:3000`) ou dá "link inválido" | Site URL / Redirect URLs não configurados | Refaça o passo 5. Peça um e-mail novo (cada link vale uma vez e expira). |
| Painel: ClickUp "não configurado" | Falta o segredo `CLICKUP_TOKEN` | Passo 9. |
| Painel: ClickUp "não conectado" / listas vazias | Token errado, ou o usuário do token não vê as listas | Gere outro token com um usuário que tenha acesso às listas e troque o segredo. Se usou `CLICKUP_PASTA_ID`, confira o número. |
| Botão "Melhorar textos com IA" não aparece | Falta `ANTHROPIC_API_KEY` | Passo 9 (é opcional). |
| Publicar relatório: "Link não comentado no ClickUp: defina o segredo SITE_URL…" | Falta `SITE_URL` | Passo 9. O relatório foi publicado mesmo assim; copie o link pelo painel. |
| Navegador (F12 → Console): "blocked by CORS policy" ao chamar `functions/v1/admin` | `SITE_URL` diferente do endereço do site | `SITE_URL` deve ser exatamente `https://disc.gestaosemcaos.com.br` (com `https`, sem barra no fim). |
| Função responde **401** "Invalid JWT" / "Missing authorization header" | Verify JWT ligado onde não deveria (ou chave nova `sb_publishable_`) | `clickup-webhook` sempre com Verify JWT **desligado**. Com a Publishable key, desligue também em `disc-sync`. Se o painel der 401 na função `admin`, desligue nela também (ela confere o login sozinha). |
| Tarefa do candidato não recebeu o DISC no ClickUp | Processo sem lista, WhatsApp diferente no formulário, ou campos DISC faltando na pasta | Veja [CLICKUP.md](CLICKUP.md) (campos do DISC e "Como o DISC acha o candidato"). Os avisos aparecem no painel em Processos. **Edge Functions → disc-sync → Logs** mostra o erro. |
| "gerar relatório" no ClickUp não faz nada | Webhook não criado, `CLICKUP_WEBHOOK_SECRET` errado, ou webhook suspenso | **Edge Functions → clickup-webhook → Logs**: "Assinatura inválida" = secret errado (copie de novo; se perdeu, apague o webhook e crie outro); "Webhook não configurado" = falta o segredo. Veja a saúde do webhook com o comando "ver os webhooks" (passo 13) e reative se estiver `suspended`. A tarefa precisa começar com **📌 Briefing** e estar numa lista ligada a um processo ativo. |
| Candidatos recebem "Muitos envios em pouco tempo…" | Proteção: no máximo 40 envios a cada 10 minutos | Espere 10 minutos. Se for um uso legítimo grande, fale com o Claude para ajustar o limite. |
| Candidatos recebem "Limite de respostas atingido. Avise o recrutador." | O banco tem 2.000 respostas (proteção) | Exporte o CSV no painel e apague respostas antigas (processos encerrados). |
| Candidatos recebem "Limite de códigos atingido…" | Os 2.400 códigos de candidato (ex.: `47K`) estão em uso | Apague candidatos antigos ou de teste no painel (o código volta a ficar livre). |
| GitHub Actions "Manter Supabase ativo" com ❌ | Segredos do GitHub errados ou projeto pausado | Confira `SUPABASE_URL` e `SUPABASE_ANON_KEY` (passo 12) e se o projeto está ativo. |

**Onde ver os erros no Supabase:** **Edge Functions** → clique na função → aba **Logs** (ou **Invocations**); **Authentication** → **Logs** (login e e-mails); **Logs & Analytics** no menu (banco e API).

## LGPD: apagar os dados

- **Pelo painel:** detalhe do candidato → **Excluir**, ou **Excluir todos** (digitando EXCLUIR), por processo.
- **Pelo Supabase:** **Table Editor** → `respostas` → marque as linhas → **Delete**. Ou no SQL Editor:
  `delete from public.respostas where recebido_em < now() - interval '6 months';`
- A ficha da pessoa (`public.pessoas`) sai sozinha junto com a última resposta dela (por qualquer um dos caminhos acima) — **menos** se ela for colaboradora ativa de uma empresa (continua no time, sem resultado). Para tirá-la também: desligue no painel e apague no SQL Editor `delete from public.pessoas where id = '…';` (vínculos, relações e relatórios dela saem junto).
- **Só a foto:** detalhe da resposta → **Remover foto** (apaga a foto da resposta, da ficha da pessoa e das outras respostas dela). Relatórios já gerados guardam a foto que estava no snapshot: gere de novo ou exclua o relatório. No SQL Editor: `update public.respostas set foto = null; update public.pessoas set foto = null;`.
- Apague também CSVs, PDFs e mensagens com códigos que tiver salvo, como antes.
- No plano grátis não há cópia de segurança para baixar: exporte o CSV pelo painel de vez em quando, se quiser guardar.

## Referência técnica (para quem for mexer no código)

- Banco: `supabase/migrations/20261005120000_disc.sql` + `supabase/migrations/20261006120000_pessoas_formulario.sql` + `supabase/migrations/20261007120000_empresas_equipes.sql` + `supabase/migrations/20261008120000_parte2.sql` + `supabase/migrations/20261009120000_fotos.sql` + `supabase/migrations/20261010120000_mover_versao.sql` (em ordem; `pessoas` + formulário por processo; empresas/vínculos/relações + relatórios por modelo, com `salvar_colaborador`, `mover_colaborador` e `salvar_relacoes` só para admin; `respostas.exigido` + `formulario.parte2` — com a Parte 2 ligada, `enviar_resposta` exige o perfil exigido de 40 dígitos; fotos em `pessoas.foto`, `respostas.foto` e `admins.foto` — data URL JPEG até 40 000 caracteres, sem Storage; `formulario.campos.foto` obrigatória/opcional/oculta; envio até 80 000 caracteres; `salvar_minha_foto` só grava a foto do próprio usuário (privilégio por coluna + gatilho com `auth.uid()`), `remover_foto` (LGPD, só admin); snapshot dos relatórios por modelo até 1 MB; `mover_resposta` (troca o processo da resposta, com `respostas.historico_processos`), `contratar_pessoa` (candidato vira colaborador ativo; ativo em outra empresa = move) e `salvar_relacoes(p_empresa, p_relacoes, p_opcoes)` com `{topoIds}` em `empresas.organograma`, só admin; `versao_banco()` pública, só leitura, para o painel avisar migração faltando; idempotentes; RLS em todas as tabelas; anon só chama `avaliacao_publica`, `enviar_resposta`, `relatorio_publico` e `versao_banco` (nenhuma devolve foto: o relatório publicado mostra só o que está no snapshot); authenticated só com `public.e_admin()`; `garantir_primeiro_admin()`). Dados de exemplo para projeto de teste: `supabase/seed_previa.sql` (não rode no projeto real).
- Funções: fonte em `supabase/functions/<nome>/index.ts` + `supabase/funcoes-compartilhadas/*.js`; `npm run montar:funcoes` gera `dist/funcoes/<nome>/index.ts` (um arquivo por função, para colar no painel). `npm test` confere se os gerados estão atualizados.
- Site: `js/config.js` (`BACKEND`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`), `js/api-supabase.js`, `assets/vendor/supabase.js`.
- Despertador: `.github/workflows/manter-ativo.yml`. Migração: `scripts/migrar-planilha.mjs` (testes em `tests/migrar-planilha.test.js`).
- Testes do banco num Postgres embutido: `npm run test:supabase`.
- Contrato completo: seção "Supabase" de [SPEC.md](SPEC.md).
- Vagas sem Caos: `supabase/migrations/20261022120000_vagas.sql` (tabelas `vagas_*`, schema fechado `vagas_interno`, RPCs
  `vagas_*`), função `vagas-conta` (`supabase/funcoes-fonte/vagas-conta/` + `supabase/funcoes-compartilhadas/vagas-conta.js`),
  site em `vagas/` (cliente `vagas/js/api.js` por fetch, sem supabase-js), testes `tests/supabase/vagas.test.js`,
  `tests/vagas-*.test.js` e `tests/funcoes/vagas-conta.test.js`. Contrato: [VAGAS-SPEC.md](VAGAS-SPEC.md).
