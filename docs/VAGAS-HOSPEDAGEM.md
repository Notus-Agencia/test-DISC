# Vagas sem Caos — hospedagem e publicação

Como o site de vagas (`vagas/`) vai ao ar, o que acontece a cada push, o que precisa estar pronto antes de abrir ao
público e como testar. Passo a passo com botões para o dono: guia "Hospedagem" (scratchpad `vagas/guia-hospedagem/guia.html`).
Contrato do banco e das RPCs: `docs/VAGAS-SPEC.md`. Supabase em geral: `docs/SUPABASE.md`.

## 1. Arquitetura: um repositório, uma branch, dois sites

| | DISC (`disc.gestaosemcaos.com.br`) | Vagas (`vagas.gestaosemcaos.com.br`) |
|---|---|---|
| Provedor | GitHub Pages | Cloudflare Pages (plano grátis) |
| O que publica | a raiz do repositório | só a pasta `vagas/` ("Root directory" do projeto) |
| Build | nenhum | nenhum (site estático; Functions compiladas pelo Pages) |
| Branch de produção | `claude/disc-test-selection-system-61ot0f` | a mesma |
| Banco | Supabase `tevpqngqzxcswmticjnr` | o mesmo projeto (tabelas `vagas_*`, schema `vagas_interno`) |
| E-mail | Resend, `nao-responda@gestaosemcaos.com.br` | Resend, `vagas@gestaosemcaos.com.br` (mesmo domínio verificado) |
| DNS | Hostinger (CNAME → GitHub Pages) | Hostinger (CNAME → `<projeto>.pages.dev`) |

Por que assim (decisão em `scratchpad/vagas/produto.md`, seção 1): uma fila só de migrações; banco, função e tela no
mesmo commit; mesmos testes e CLAUDE.md. O Cloudflare Pages entra porque o GitHub Pages não tem cabeçalhos
personalizados (CSP/HSTS), redirecionamentos nem código no servidor; o Pages tem `_headers`, `_redirects` e Pages
Functions, que montam a página da vaga para a prévia no WhatsApp.

### O que acontece a cada push na branch

1. **GitHub Pages** republica o DISC (1 a 2 min). A pasta `vagas/` também fica acessível em
   `disc.gestaosemcaos.com.br/vagas/`, como arquivos soltos: sem `_headers`, sem Functions. Não divulgue esse caminho;
   é inofensivo (nada ali é segredo) e nenhum link do produto aponta para ele.
2. **Supabase** (integração GitHub, `docs/SUPABASE.md` §3) aplica as migrações novas de `supabase/migrations/` e
   reimplanta as Edge Functions de `supabase/functions/`.
3. **Cloudflare Pages** clona o repositório, entra em `vagas/`, compila `vagas/functions/` e publica o resto como está.
   Cada push na branch de produção vira uma implantação de produção; outras branches ganham uma prévia
   `https://<hash>.<projeto>.pages.dev`. O log fica em **Workers & Pages → projeto → Deployments**.
   Opcional, para não republicar o Vagas a cada push só do DISC: **Settings → Builds → Build watch paths** (procure
   por "watch paths"), incluir `vagas/*`.

Ordem segura de um recurso novo: migração + RPC primeiro (o site antigo continua funcionando), depois a tela.

## 2. Arquivos de hospedagem em `vagas/`

| Arquivo | Para quê |
|---|---|
| `_headers` | cabeçalhos de segurança e de cache dos **arquivos estáticos** (ver §3) |
| `_redirects` | `/` → `/boa-vista-rr/` (302, até existir seletor de cidade; tire a linha quando `index.html` tiver o seletor) |
| `_routes.json` | só `/v/*` passa pela Function; todo o resto é estático (e recebe o `_headers`) |
| `functions/v/[codigo].js` | Pages Function da página da vaga pelo link curto `/v/K7M2QX` (ver §4) |
| `functions/package.json` | só `{"type":"module"}`, para o Node dos testes importar a Function; o Pages ignora |

Regras do Cloudflare que explicam as escolhas (documentação em `developers.cloudflare.com/pages/`):

- `_headers` **não vale** para resposta de Pages Function; por isso a Function repete os cabeçalhos de segurança.
- `_redirects` **não vale** para rota atendida por Function; por isso não há regra `/v/:codigo` ativa (fica comentada,
  para o dia em que a Function for desligada).
- Um `functions/_middleware.js` na raiz faria **toda** requisição passar pela Function (e perder o `_headers`). Não há
  middleware; forçar `https`/host não é necessário (o Pages já serve só por HTTPS e o `pages.dev` pode ficar como
  endereço de reserva).
- Em `_headers`, duas regras que casam o mesmo caminho **somam** os cabeçalhos (valores unidos por vírgula). Por isso
  `/comum/*` e `/assets/*` fazem `! Cache-Control` antes de definir o cache longo.
- Limites: 100 regras e 2.000 caracteres por linha no `_headers`; 2.100 regras no `_redirects`.

## 3. Cabeçalhos (`_headers`)

CSP equivalente à do DISC, mais fechada onde dá:

- `script-src 'self' https://challenges.cloudflare.com` (o segundo é o Turnstile; sem ele o CAPTCHA não carrega).
  Nada de `unsafe-inline`/`unsafe-eval`: o script embutido de uma página precisa de hash, como o `tests/csp.test.js`
  do DISC confere para o `index.html`. Prefira arquivo `.js` separado.
- `connect-src 'self' https://tevpqngqzxcswmticjnr.supabase.co wss://…` (só o nosso projeto, não `*.supabase.co`).
- `img-src 'self' data: blob: https://tevpqngqzxcswmticjnr.supabase.co`: a foto da pessoa vem por URL assinada do
  Supabase Storage e só aparece para a empresa depois do Combinou. (Alternativa, se um dia a origem sair da CSP: a tela
  baixa por `fetch` e mostra como `blob:`, que já está liberado.)
- `frame-src https://challenges.cloudflare.com` (Turnstile), `frame-ancestors 'none'` + `X-Frame-Options: DENY`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` fechando câmera, microfone, localização,
  pagamento e USB; `Cross-Origin-Opener-Policy: same-origin`.
- Cache: HTML e tudo o mais `max-age=0, must-revalidate` (o Cloudflare ainda guarda na borda e revalida);
  `/js/*` 10 min; `/comum/*` e `/assets/*` 7 dias com `stale-while-revalidate`. Trocou um arquivo de `/comum/`
  ou `/assets/` e precisa valer na hora? Mude o nome ou acrescente `?v=2` na referência.

**Se o pagamento (Stripe) entrar no Vagas**, acrescente, como no `admin.html` do DISC: `script-src` + `frame-src`
`https://js.stripe.com https://*.js.stripe.com`, `frame-src https://hooks.stripe.com`, `connect-src https://api.stripe.com
https://*.stripe.com`, `img-src https://*.stripe.com`. O teste `tests/vagas-hospedagem.test.js` confere a CSP: atualize-o junto.

## 4. Página da vaga no servidor (`functions/v/[codigo].js`)

`GET /v/K7M2QX` → a Function chama a RPC pública **`vagas_anuncio_publico(p_codigo)`** (nome na constante `RPC_ANUNCIO`;
registrado pelo agente fundacao em `docs/VAGAS-SPEC.md`) por `fetch` em `POST /rest/v1/rpc/…` com a chave anon, e
devolve o HTML completo da vaga: abre **sem JavaScript** e traz as tags Open Graph que o WhatsApp lê para a prévia
(título da vaga; empresa ou "Empresa confidencial · verificada"; cidade/zona; modalidade; faixa salarial ou diária).
Nunca dado de pessoa. O botão "Quero essa vaga" leva para `/<cidade>/?vaga=<código>` (a tela da cidade abre a vaga).

- **Chave anon** (pública): variável `SUPABASE_ANON_KEY` do projeto no Pages (**Settings → Variables and Secrets**)
  ou, se não existir, a Function lê a chave de `/js/config.js` do próprio site (`lerChaveDoConfig`). Nada a configurar.
- **Cache**: `Cache-Control: public, max-age=120, s-maxage=600` + Cache API da borda. Uma vaga editada pode demorar
  até 2 min para atualizar no link; o WhatsApp guarda a prévia por conta própria.
- **Erros**: código fora do padrão ou vaga inexistente/encerrada → **404** com página simples (`no-store`); Supabase
  fora do ar → **503** com `Retry-After: 30`. Vaga com status diferente de `publicado` → página com "Vaga encerrada",
  `noindex` e botão "Ver outras vagas".
- **Campos lidos** (formato de `docs/VAGAS-SPEC.md` §8.1; `normalizarAnuncio` também aceita alguns sinônimos):
  `codigo`, `titulo`/`funcao`, `modalidade`, `valor{minCentavos, maxCentavos, unidade: mes|hora|dia|servico}`,
  `empresa{nome, confidencial, conferida}` (conferida = "verificada" na tela), `cidade{nome, slug}`, `zona{nome}`,
  `diaria{data, inicio, fim}`, `quantidade`, `descricao`, `requisitosLista` (frases prontas; sem ela, as chaves de
  `requisitos` + `requisitoOutro` viram frases e chave desconhecida some; nunca imprime `cnh_b`), `beneficios`
  (chaves → frases), `escolaridade`, `expiraEm` ("Vaga aberta até"). Vaga fora do ar vem como `{ok:false}` → 404.
  A Function **não** chama `vagas_anuncio_vista` (prévia de link não conta como vista).
- **Imagem da prévia**: `/comum/marca/gsc-logo-email.png` (PNG; o WhatsApp não mostra SVG). Uma imagem própria
  1200×630 com a marca Vagas melhora a prévia: troque a constante `IMAGEM_OG`.
- Testes sem rede: `node --test tests/vagas-hospedagem.test.js` (entra no `npm test`).

## 5. Testar localmente

- Só as telas: `PORT=4190 node tests/e2e/server.js` e abra `http://localhost:4190/vagas/` (o `_headers`, o
  `_redirects` e a Function **não** rodam aqui).
- Com Function, `_headers` e `_redirects`: `npx wrangler pages dev vagas/` (abre em `http://localhost:8788`; a
  Function compila de `vagas/functions/`). Pede o Node 18+ e baixa o `wrangler` na hora; não há dependência no
  `package.json` de propósito. Para a Function achar a chave anon, deixe `vagas/js/config.js` no modo Supabase ou
  rode `npx wrangler pages dev vagas/ --binding SUPABASE_ANON_KEY=<chave anon>`.
- Prévia do WhatsApp: cole `https://vagas.gestaosemcaos.com.br/v/<código>` numa conversa consigo mesmo. Para
  inspecionar as tags: `curl -s https://vagas.gestaosemcaos.com.br/v/<código> | grep 'og:'`.

## 6. Variáveis, segredos e custos

| Onde | Nome | Valor | Obrigatório |
|---|---|---|---|
| Supabase → Edge Functions → Secrets | `VAGAS_SITE_URL` | `https://vagas.gestaosemcaos.com.br` | sim (CORS e links dos e-mails da `vagas-conta`) |
| idem | `VAGAS_EMAIL_REMETENTE` | `Vagas · Gestão sem Caos <vagas@gestaosemcaos.com.br>` | recomendado (sem ele usa `EMAIL_REMETENTE`) |
| idem | `TURNSTILE_SECRET` | chave secreta do widget Turnstile | sim antes de abrir ao público (sem ela a `vagas-conta` não exige CAPTCHA) |
| idem | `RESEND_API_KEY` | já existe (DISC) | já configurado |
| Cloudflare Pages → Settings → Variables and Secrets | `SUPABASE_ANON_KEY` | chave anon (pública) | não (a Function lê de `/js/config.js`) |
| `vagas/js/config.js` | `TURNSTILE_SITE_KEY` (ou o nome que a fundação fixar) | chave pública (sitekey) do widget | sim, é pública e vai no código |

Nunca no repositório, no guia nem em conversa: `service_role`/`sb_secret_`, a chave do Resend, a secreta do Turnstile.

Custos (confira os limites atuais em `developers.cloudflare.com/pages/platform/limits/` e
`developers.cloudflare.com/turnstile/`): Cloudflare Pages grátis (500 builds/mês, 1 build por vez; Functions no plano
grátis dos Workers, 100 mil requisições/dia) e Turnstile grátis. O que custa é o **Supabase Pro** (US$ 25/mês por
organização, com US$ 10 de crédito de computação incluído na data em que isto foi escrito; confira em
supabase.com/pricing): sem pausa por inatividade, backups diários, mais e-mails de Auth e suporte. Decisão aprovada
na proposta (item 6): Pro **antes** de abrir ao público.

## 7. Verificações antes de abrir ao público

1. **Supabase Pro** ativo na organização (Organization → Billing); sem isso o projeto pausa com 7 dias sem acesso.
2. **Auth → URL Configuration**: Site URL continua `https://disc.gestaosemcaos.com.br`; em Redirect URLs há
   `https://vagas.gestaosemcaos.com.br/**` (e, se quiser testar a prévia, `https://*.<projeto>.pages.dev/**`).
3. **Auth → Sign In / Providers**: o cadastro livre (**Allow new users to sign up**) continua **desligado**. As contas
   nascem na `vagas-conta`. O CAPTCHA do Auth **não** é ligado (vale para o projeto todo e quebraria o painel do DISC).
4. **Edge Function `vagas-conta`** implantada com **Verify JWT desligado** e os segredos da tabela do §6.
5. **CORS**: a `vagas-conta` só aceita a origem de `VAGAS_SITE_URL` (padrão `corsVendas` de
   `supabase/funcoes-compartilhadas/pagamento.js`). As funções do DISC continuam só com `SITE_URL`; nada do Vagas chama
   `admin`/`pagamento`. Se um dia a mesma função precisar servir os dois sites, ela passa a aceitar uma lista
   (`produto.md`, §1, item 6).
6. **Turnstile**: widget criado com hostname `vagas.gestaosemcaos.com.br` (e `localhost` para testes); sitekey no
   `config.js`, secreta em `TURNSTILE_SECRET`. Um cadastro de teste passa pelo CAPTCHA e chega o e-mail de confirmação.
7. **Resend**: domínio `gestaosemcaos.com.br` segue **Verified**; `VAGAS_EMAIL_REMETENTE` definido. Um e-mail de
   "Esqueci minha senha" do Vagas chega com remetente `vagas@…` e o link abre `vagas.gestaosemcaos.com.br/entrar.html`.
8. **DNS**: `https://vagas.gestaosemcaos.com.br/` abre com cadeado, redireciona para `/boa-vista-rr/`;
   `https://<projeto>.pages.dev/` também (é o endereço de reserva).
9. **Cabeçalhos**: `curl -sI https://vagas.gestaosemcaos.com.br/boa-vista-rr/` mostra `content-security-policy`,
   `strict-transport-security` e `x-content-type-options`. Ou use securityheaders.com.
10. **Prévia**: `curl -s https://vagas.gestaosemcaos.com.br/v/<código real> | grep og:` traz título, descrição e
    imagem; um código inventado responde 404.
11. **Backup**: no Pro, **Database → Backups** lista os backups diários (procure por "Download" para guardar uma
    cópia fora do computador do dia a dia antes de abrir ao público).
12. **Robô "manter ativo"** (`.github/workflows/manter-ativo.yml`): no Pro pode ficar ligado (inofensivo).
13. `npm test` verde na branch publicada (inclui `tests/vagas-hospedagem.test.js`).

## 8. Plano de troca de domínio `equipe.` (só documentado; nada implementado)

Decisão da proposta (seção 3): o DISC passa a chamar-se **Equipe sem Caos** em `equipe.gestaosemcaos.com.br`, em duas fases.

- **Fase 1** — `equipe.` só redireciona para `disc.`. Como o GitHub Pages aceita um único domínio por site, a saída
  mais simples é um projeto no Cloudflare Pages só com um `_redirects` (`/*  https://disc.gestaosemcaos.com.br/:splat  301`)
  e o CNAME `equipe` na Hostinger apontando para ele. Links com token continuam funcionando porque o `:splat` leva
  caminho e query.
- **Fase 2** — se `equipe.` virar o principal: no mesmo dia, (a) `CNAME` do repositório passa a `equipe.gestaosemcaos.com.br`
  e o DNS `equipe` aponta para o GitHub Pages; (b) o projeto de redirecionamento do Pages recebe o domínio `disc.` e
  passa a mandar `disc.` → `equipe.` (301, mantendo caminho e parâmetros); (c) `SITE_URL` das Edge Functions,
  Site URL/Redirect URLs do Auth, remetente e modelos de e-mail, domínio do Apple Pay no Stripe e `js/config.js`
  trocam juntos. `disc.` nunca é desligado (decisão de marca).
