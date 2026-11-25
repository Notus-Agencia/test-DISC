# Vagas sem Caos v2 · servidor e adaptador — passa-bastão (24/11/2026)

Ramo `vagas/redesenho-v2`. Sem segredo, preço, dado pessoal ou IP neste arquivo (só NOMES de variáveis). Nada foi publicado,
aplicado no Supabase real nem rodado na VPS.

## 1. O que existe

| Peça | Arquivo | Para quê |
|---|---|---|
| Ações novas da Edge Function | `supabase/funcoes-compartilhadas/vagas-conta.js` (+ `vagas-v2.js`, peças puras) e os gerados `supabase/functions/vagas-conta/index.ts`, `dist/funcoes/vagas-conta/index.ts` | entrar por código, CNPJ, criar empresa, links de arquivo |
| Migração dos códigos | `supabase/migrations/20261102120000_vagas_v2_codigos.sql` | tabela `vagas_interno.codigos_entrada` e as funções de servidor |
| Adaptador das telas | `vagas/js/v2/api-v2.js` (`window.VSC_API`) | traduz os métodos do contrato para RPC, função e prévia |
| Configuração | `vagas/js/config.js` | `WHATSAPP_AJUDA`, `EMAIL_AJUDA`, `CANAL_WHATSAPP`, `PREVIA_LATENCIA`, `PREVIA_VALIDAR`, `ajuda()` |
| Hospedagem | `vagas/_headers`, `vagas/_redirects`, `vagas/functions/v/[codigo].js` | CSP canônica, link curto `/v/<código>` |
| Testes | `tests/funcoes/vagas-conta-v2.test.js`, `tests/supabase/vagas_codigos_v2.test.js`, `tests/vagas-v2-api.test.js`, `tests/vagas-v2-api-config.test.js`, `tests/vagas-v2-api-hospedagem.test.js`, `tests/vagas-hospedagem.test.js` | |

A fonte da função é `supabase/funcoes-compartilhadas/` (o `index.ts` de `functions/` é GERADO por `npm run montar:funcoes`; o
`npm test` confere que está em dia).

## 2. Ordem dos scripts nas telas

```html
<script src="js/config.js"></script>
<script src="js/v2/contrato.js"></script>
<script src="js/api.js"></script>
<script src="js/v2/api-v2.js"></script>
```

A tela de prévia declara `<meta name="vsc-previa" content="pessoa">` (ou `empresa`, ou os dois separados por espaço). Só no modo
prévia o `VSC_API.pronto` carrega `js/v2/previa/dados.js`, `dados-mais.js` e o arquivo da tela. No modo `supabase` ele resolve na
hora e nada de `previa/` é carregado. Toda tela deve esperar `VSC_API.pronto` antes de chamar um método (no modo `supabase` é
instantâneo). O adaptador funciona sem `?previa=1`: o modo vem de `VAGAS_CONFIG.MODO`.

Sessão: mesma chave do `api.js` (`vagas_sessao` no `localStorage`; "Lembrar neste celular" é isso mesmo, renovada pelo
refresh_token). `VSC_API.sessao()` é síncrono e devolve `{user:{id,email}}` ou `null`. `VSC_API.sair()` apaga a sessão e também as
chaves `vsc.eu.*` (pessoa) e `vsc.emp.*` (empresa) do aparelho (também ao entrar com OUTRA conta). **Dados pessoais que as telas
guardarem no aparelho (rascunho de currículo, por exemplo) devem usar esses prefixos.**

Erros: toda resposta `{ok:false}` vira `Error` em português com `.resposta`, `.codigo` (quando há) e as marcas do `api.js`
(`conexao`, `sessaoExpirada`, `bancoDesatualizado`, `bloqueado`, `captcha`, `aguardar`, `naoConfigurado`…). Método com
`login:true` sem sessão rejeita sem tocar a rede, com `sessaoExpirada = true`. Em modo prévia a validação com
`VSC_CONTRATO.validar` liga com `VAGAS_CONFIG.PREVIA_VALIDAR = true`; a espera simulada é `PREVIA_LATENCIA` (0 desliga).
Envio de arquivo: `VSC_API.curriculoEnviar({arquivo})` e `VSC_API.verificacaoDocumentoEnviar({empresaId, arquivo})` (também em
`VSC_API.uploads.*`): checa tipo e 10 MB no aparelho, sobe ao Storage com a sessão da pessoa (`x-upsert: false`) e registra pela RPC;
se o registro falhar, tenta apagar o arquivo solto.

## 3. Ações da Edge Function `vagas-conta` (corpo `{acao, ...}`; as antigas continuam iguais)

Resposta sempre HTTP 200 com `{ok:true,...}` ou `{ok:false, erro:'texto em português', codigo?, ...marcas}`. CORS só da origem de
`VAGAS_SITE_URL`, do painel do DISC e de localhost. Nada de segredo, hash, sal ou código nas respostas.

| Ação | Login | Corpo | Resposta |
|---|---|---|---|
| `codigo_pedir` | não | `destino`, `canal` (`email` padrão; `whatsapp`), `captcha?` | `{canal, destinoMascarado, reenviarEmSeg:30, expiraEmSeg:600}` |
| `codigo_confirmar` | não | `destino`, `codigo` (6 dígitos), `nome?`, `tipo?` (`pessoa` padrão \| `empresa`), `termosVersao` (o adaptador manda `VERSAO_TERMOS`) | `{sessao:{access_token, refresh_token, expires_at, user:{id,email}}, novaConta, tipo}` |
| `cnpj` | não | `cnpj` (com ou sem pontuação; numérico ou alfanumérico) | `{cnpj, tipo:'mei'\|'empresa', ativa, situacao, razaoSocial, nomeFantasia, cidade, uf, bairro, abertura, mei, setor}` |
| `empresa_criar` | JWT | `cnpj`, `cidade`, `responsavel`, `whatsapp`, `nomeFantasia?`, `bairro?`, `setor?`, `email?` | `{empresa}` (forma do banco: `EMPRESA` + `estado`, `prazoAte`) |
| `arquivo_link` | JWT | `id` (candidatura) | `{url, expiraEm}` (5 min, bucket `vagas-curriculos`) |
| `documento_link` | JWT | `id` (documento) | `{url, expiraEm}` (5 min, bucket `vagas-verificacao`) |

Códigos de erro (`codigo`): `aguarde` (com `reenviarEmSeg`), `canal_desligado`, `envio_falhou`, `codigo_formato`, `codigo_errado`
(com `restantes`), `tentativas` (5 erradas: peça outro código), `codigo_vencido`, `conta_de_outro_sistema`, `cpf`, `cnpj_invalido`,
`cnpj_nao_encontrado`, `consulta_indisponivel`, `cnpj_inativo` (com `situacao`), mais os que o banco devolver (repassados só com a
mensagem e as marcas conhecidas).

**Entrar por código** (decisão 2A): o código tem 6 dígitos sorteados com `crypto.getRandomValues`; vai por e-mail (Resend) e o banco
guarda só `HMAC-SHA256(chave = SUPABASE_SERVICE_ROLE_KEY + sal de 16 bytes por linha; mensagem = e-mail + código)` em
`vagas_interno.codigos_entrada`. Vale 10 minutos, 5 tentativas (a tentativa é gasta ANTES de comparar, em uma instrução só: pedidos em
paralelo não passam de 5), pedido novo só depois de 30 s e invalida o anterior; confere em tempo constante; usa uma vez só. Limites no
banco: 5 pedidos por hora por e-mail, 20 por hora por origem, 60 conferências por hora por origem. Só depois de provar o e-mail o
código acha ou cria o usuário do Auth (senha aleatória que ninguém conhece, `app_metadata.produto = 'vagas'`), confirma o e-mail,
chama `vagas_v2_conta_garantir_servidor` e devolve uma sessão REAL (o link mágico é gerado e trocado em `/auth/v1/verify` dentro da
função; o token do link nunca sai). Conta do painel DISC (ou administradora) não entra por aqui. Conta de operação (tipo `operador`)
entra sem passar pelo `garantir`. Se o banco recusar a conta nova, o usuário do Auth é apagado (sem conta pela metade).

**CNPJ**: consulta feita PELO SERVIDOR na BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/<cnpj>`, constante `VAGAS_URL_CNPJ`), com
prazo de 8 s e cache de 5 min só de consulta que deu certo. CPF digitado (11 números) recebe a dica do Certificado do MEI (CCMEI).
Base fora do ar, resposta estranha ou CNPJ diferente do pedido: `consulta_indisponivel`, e NUNCA se aprova sem consulta.
`empresa_criar` refaz a consulta sem cache e recusa quem não está ATIVA (`cnpj_inativo`, com o motivo: baixado, suspenso, inapto, nulo).
A consulta pública devolve a razão social de qualquer CNPJ (dado público da Receita), com limite de 60 por hora por origem.

**Canal WhatsApp**: DESLIGADO. `canal:'whatsapp'` responde "O código por WhatsApp ainda não está ligado. Use o e-mail." A estrutura
existe (`enviarCodigoWhatsappVagas`), mas hoje só lê as variáveis e devolve "não configurado": nenhum provedor foi escolhido nem
inventado. Para ligar um dia: escolher o provedor, escrever o envio dentro dessa função, cadastrar as variáveis, ligar
`VAGAS_CANAL_WHATSAPP=ligado` no servidor E `CANAL_WHATSAPP: true` em `vagas/js/config.js`, e só então a tela mostrar o botão.
Hoje o campo de WhatsApp não vira conta (o usuário do Auth é por e-mail).

## 4. Variáveis e segredos da função (Supabase → Edge Functions → Secrets; NUNCA no repositório)

| Nome | Para quê | Obrigatória |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | o Supabase já entrega à função | sim (automáticas) |
| `SUPABASE_ANON_KEY` | `apikey` do `/auth/v1/verify` (se faltar, usa a de serviço) | automática |
| `RESEND_API_KEY` | envio do código por e-mail. Sem ela: erro "não configurado" (não finge que enviou) | sim |
| `VAGAS_EMAIL_REMETENTE` | remetente, ex. `Vagas sem Caos <vagas@dominio-verificado>`. Sem ele cai em `EMAIL_REMETENTE` e depois no `onboarding@resend.dev`, que SÓ entrega para o dono da conta do Resend | sim |
| `VAGAS_SITE_URL` | `https://vagas.gestaosemcaos.com.br` (CORS e links de e-mail) | sim |
| `EMAIL_REMETENTE`, `SITE_URL` | os do DISC (reserva do remetente; origem do painel do DISC) | já existem |
| `TURNSTILE_SECRET` | liga o "não sou robô" em cadastrar/reenviar/esqueci/`codigo_pedir`. **Só cadastre depois que as telas tiverem o widget** (`TURNSTILE_SITE_KEY` em `config.js`), senão ninguém consegue pedir código | opcional |
| `VAGAS_CANAL_WHATSAPP` | `ligado` abre o canal (hoje sem efeito: provedor não ligado) | não |
| `VAGAS_WHATSAPP_PROVEDOR_URL`, `VAGAS_WHATSAPP_PROVEDOR_TOKEN`, `VAGAS_WHATSAPP_PROVEDOR_REMETENTE` | provedor do WhatsApp, quando houver | não |

Banco: aplicar `20261101…` (BANCO) e `20261102120000_vagas_v2_codigos.sql` (idempotente; usa `vagas_interno.contar`/`origens_de` da
`20261022120000`). A função `vagas-conta` chama as RPCs de servidor do BANCO: `vagas_v2_conta_garantir_servidor(p_uid, p_dados)`,
`vagas_v2_empresa_criar_servidor(p_uid, p_dados)`, `vagas_v2_arquivo_link_servidor(p_uid, p_candidatura)` e
`vagas_v2_documento_link_servidor(p_uid, p_documento)`. Ordem segura: migrações → função → site.
Supabase Auth → URL Configuration: `https://vagas.gestaosemcaos.com.br/**` em Redirect URLs (já pedido na S2).

## 5. Como testar o código por e-mail ponta a ponta SEM segredo no repositório

1. Sem rede: `npm test` (a função inteira roda com Auth, banco, Resend e BrasilAPI falsos) e
   `npm run test:supabase` (a migração num Postgres embutido).
2. Com o Supabase real, depois que o dono cadastrar os segredos no painel e aplicar a migração: no Terminal, com o e-mail de teste do
   dono (a chave PÚBLICA está em `vagas/js/config.js`):

```bash
URL=https://tevpqngqzxcswmticjnr.supabase.co
ANON=$(grep -o "sb_publishable_[A-Za-z0-9_-]*" vagas/js/config.js)
curl -s "$URL/functions/v1/vagas-conta" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"acao":"codigo_pedir","destino":"SEU-EMAIL@exemplo.com","canal":"email"}'
# o código chega no e-mail; depois:
curl -s "$URL/functions/v1/vagas-conta" -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"acao":"codigo_confirmar","destino":"SEU-EMAIL@exemplo.com","codigo":"123456","termosVersao":"2026-11-24","tipo":"pessoa"}'
```

   A segunda resposta traz a sessão (`access_token`...). Não cole essa saída em chat nem em arquivo do repositório.
3. Conferir o CNPJ: `-d '{"acao":"cnpj","cnpj":"<um CNPJ de empresa conhecida>"}'`.
4. Pelo site: abrir o site num endereço de teste (nunca no oficial com `?previa=1`), pedir o código e entrar.

## 6. Hospedagem: o que o nginx da VPS precisa repetir

O site oficial roda no nginx da VPS (stack do site; o `Dockerfile.site` remove `vagas/functions`), NÃO no Cloudflare: `_headers`,
`_redirects` e Pages Functions só valem no Cloudflare/espelho. O nginx precisa de:

**6.1 CSP canônica** (idêntica à `<meta>` das telas, mais `frame-ancestors`, que só vale em cabeçalho):

```
default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://challenges.cloudflare.com; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://tevpqngqzxcswmticjnr.supabase.co; connect-src 'self' https://tevpqngqzxcswmticjnr.supabase.co https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'
```

Mudanças em relação à CSP da v1: `https://cdnjs.cloudflare.com` entra em `script-src` (pdf.js e mammoth, só 3.11.174 e 1.6.0, com
`integrity` e `crossorigin="anonymous"`), `worker-src` (worker do pdf.js) e `connect-src` (o pdf.js baixa o worker/fontes); sai o
`wss://` do Supabase (nada usa tempo real). O CNPJ NÃO precisa de `connect-src` para a BrasilAPI: é a função que consulta.

**6.2 Demais cabeçalhos** (em toda resposta, inclusive erro): `Strict-Transport-Security: max-age=31536000; includeSubDomains`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `Cross-Origin-Opener-Policy: same-origin`.

**6.3 Cache**: HTML `Cache-Control: public, max-age=0, must-revalidate`; `/js/*` `public, max-age=600, must-revalidate`; `/comum/*` e
`/assets/*` `public, max-age=604800, stale-while-revalidate=86400` (trocou arquivo e precisa valer na hora? mude o nome ou use `?v=`).

**6.4 Link curto da vaga**: `/v/<código>` (4 a 12 letras/números) → `302` para `/#/vaga/<código>`. No Cloudflare isso é a Function
(`vagas/functions/v/[codigo].js`, que também serve a prévia do WhatsApp com as tags Open Graph); no nginx não há Function: o
redirecionamento simples basta, e a prévia do WhatsApp mostra a do site (sem o título da vaga).

**6.5 Redirecionamentos das páginas antigas** (os do `vagas/_redirects`; se o nginx já os tem, nada a fazer): `/emprego/` → `/emprego`
(301), `/empresas/` → `/empresas` (301), `/selo/` → `/selo` (301), `/selo/<código>` → `/selo.html?codigo=<código>` (302) e
`/<cidade>/` → `/cidade.html?cidade=<cidade>` (302; as páginas `cidade.html`, `vaga.html`, `entrar.html`, `eu.html`, `emprego.html` e
`empresa.html` viram redirecionadores para a tela nova, a cargo das telas).

Modelo (o dono aplica; cuidado: em nginx, um `add_header` dentro de `location` APAGA os do nível de cima, então repita o `include`):

```nginx
# snippets/vagas-cabecalhos.conf
add_header Content-Security-Policy "<a política do item 6.1>; frame-ancestors 'none'" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;

# no server { } de vagas.gestaosemcaos.com.br
include snippets/vagas-cabecalhos.conf;
location ~ "^/v/([A-Za-z0-9]{4,12})/?$" { include snippets/vagas-cabecalhos.conf; return 302 /#/vaga/$1; }
location = /emprego/  { return 301 /emprego; }
location = /empresas/ { return 301 /empresas; }
location = /selo/     { return 301 /selo; }
location ~ "^/selo/([A-Za-z0-9]+)$" { return 302 /selo.html?codigo=$1; }
location ^~ /js/     { include snippets/vagas-cabecalhos.conf; add_header Cache-Control "public, max-age=600, must-revalidate" always; }
location ^~ /comum/  { include snippets/vagas-cabecalhos.conf; add_header Cache-Control "public, max-age=604800, stale-while-revalidate=86400" always; }
location ^~ /assets/ { include snippets/vagas-cabecalhos.conf; add_header Cache-Control "public, max-age=604800, stale-while-revalidate=86400" always; }
location ~ "^/([a-z0-9]+(-[a-z0-9]+)*)/$" { return 302 /cidade.html?cidade=$1; }   # depois dos ^~ acima
```

Opcional: no endereço OFICIAL, bloquear `/js/v2/previa/` (`location ^~ /js/v2/previa/ { return 404; }`): a demonstração fictícia só
roda fora do domínio oficial e nada de produção a carrega.

## 7. Limitações e pendências

- **Pessoa SEM e-mail ainda não entra** enquanto o canal WhatsApp estiver desligado: a tela pede o e-mail. Alternativa hoje: o
  cadastro assistido da equipe (ação `assistido`), que também exige um e-mail (a pessoa pode criar um gratuito na hora). Quando o
  WhatsApp ligar, o login por telefone exigirá usuário de Auth por telefone: trabalho à parte.
- O código de entrada vai por e-mail pelo Resend. Se o remetente `onboarding@resend.dev` (padrão) estiver em uso, só chega no e-mail do
  dono da conta do Resend.
- A Pages Function `/v/<código>` ainda lê a RPC antiga `vagas_anuncio_publico` (as tabelas antigas ficam; a v2 só esconde). Trocar
  para `vagas_v2_vaga` quando o BANCO confirmar que o código curto da vaga é o `id` que ela aceita.
- `VERSAO_TERMOS` do `config.js` passou para `2026-11-24`; `vagas/js/regras.js` e os textos (coordenação) ainda dizem `2026-10-13`.
- Peso da lista pública legada (`cidade.html`, limite de 100 KB gzip no `montar-vagas.mjs`): o `config.js` e o `api.js` ganharam
  ~0,7 KB e ficaram a ~0,1 KB do limite. A página é substituída pela nova; o limite precisa ir para ~150 KB quando ela sair.
- Testes antigos que podem quebrar com as telas novas (a cargo de quem troca a tela): `tests/vagas-site.test.js` (CSP da `index.html`),
  `tests/vagas-casca-telas.test.js` (peso da `cidade.html`), `tests/vagas-previa-producao.test.js` (CSP).

## 8. O que o dono do negócio precisa fazer

1. Cadastrar na função os segredos da seção 4 (`RESEND_API_KEY`, `VAGAS_EMAIL_REMETENTE` com domínio verificado, `VAGAS_SITE_URL`).
2. Aplicar as migrações no Supabase (depois do ok) e publicar a função `vagas-conta` pelo caminho de sempre (integração do GitHub).
3. Aplicar no nginx da VPS a seção 6 (CSP canônica, cabeçalhos, `/v/<código>`).
4. Decidir o provedor de WhatsApp e o número único de ajuda (`WHATSAPP_AJUDA`, hoje vazio; sem ele as telas mostram o texto de
   contingência) e o e-mail de ajuda (`EMAIL_AJUDA`).
5. Só ligar `TURNSTILE_SECRET` junto com a chave pública do widget nas telas.
