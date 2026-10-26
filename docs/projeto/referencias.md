# Referências (sem segredo nenhum)

Ids, endereços e onde está cada coisa. Chaves, senhas e tokens **nunca** entram aqui: ficam nos segredos do GitHub, nos
segredos das Edge Functions do Supabase e nos painéis do Stripe, da Resend e do ClickUp, cadastrados pelo dono.

## Código e publicação

| O quê | Onde |
| --- | --- |
| Repositório | `Notus-Agencia/test-DISC` (público) |
| Branch de produção | `claude/disc-test-selection-system-61ot0f` (cada push publica; ver `README.md`) |
| Cópia de trabalho | `~/Documents/Claude Code/Recrutamento e Seleção/test-DISC` |
| Ramo deste plano | `projeto/sessoes-plano` (PR em rascunho) |
| Backups do dia 14/10 (Vagas) | ramos `backup/vagas-2026-10-14/{banco,empresa,integracao,marca,testes}` (só consulta) |
| DISC (site e painel) | `https://disc.gestaosemcaos.com.br` (GitHub Pages; `CNAME` na raiz) e `/admin.html` |
| Vagas (beta fechada) | `https://disc.gestaosemcaos.com.br/vagas/` (exige código) |
| Vagas (endereço definitivo, ainda não ligado) | `vagas.gestaosemcaos.com.br` em Cloudflare Pages (`docs/VAGAS-HOSPEDAGEM.md`) |
| Domínio e DNS | Hostinger |
| Banco e funções | Supabase, projeto `tevpqngqzxcswmticjnr`, região us-east-2; integração com o GitHub aplica migrações e funções no push |
| E-mail | Resend, região São Paulo; domínios `disc.gestaosemcaos.com.br` e `gestaosemcaos.com.br` (verificados em 26/10) |
| Pagamento | Stripe (conta ainda da agência de marketing); alternativas no código: InfinitePay e Asaas |
| Backup | `.github/workflows/backup-banco.yml` + `scripts/backup-banco.sh` (`docs/BACKUP.md`); despertador `manter-ativo.yml` |

## Documentos do repositório (fonte de cada produto)

| Assunto | Arquivo |
| --- | --- |
| Instruções e marca | `CLAUDE.md`, `docs/IDENTIDADE-VISUAL.md` |
| Uso do DISC pelo recrutador | `README.md` |
| Contrato técnico (índice de todos os módulos) | `docs/SPEC.md` |
| Servidor Supabase, passo a passo | `docs/SUPABASE.md`; Apps Script antigo: `docs/BACKEND.md` |
| E-mails de acesso | `docs/EMAILS.md` (cita o domínio raiz; atualizar na S1 f0) |
| ClickUp | `docs/CLICKUP.md` |
| Venda direta | `docs/VENDAS.md` |
| Multiempresa | `docs/MULTIEMPRESA-PLANO.md` |
| Backup | `docs/BACKUP.md` |
| Clima e Feedback 360 (ciência e decisão) | `docs/painel-cientifico/decisao.md`, `equipes.md`, `etica.md`, `psicometria.md`, `360/` |
| Vagas | `docs/VAGAS-SPEC.md` (contrato), `VAGAS-TELAS.md`, `VAGAS-TEXTOS.md`, `VAGAS-TESTES.md`, `VAGAS-HOSPEDAGEM.md`, `VAGAS-OPERACAO.md`, `docs/painel-cientifico/vagas/` |
| Conteúdo de operação e textos | `conteudo/vagas-operacao/`, `conteudo/vagas-textos/`; relatórios da liderança em `conteudo/lideranca/`, `conteudo/profundo/` |

## Migrações (ordem; todas em `supabase/migrations/`)

`20261005…` (DISC) → `…parte2`, `…fotos`, `…mover_versao` → `20261011…vendas` → `…infinitepay` → `…propostas_rastreio`,
`…conexoes`, `…proposta_eventos_decisao` → `20261014…stripe` → `…minimo_cobranca` → `…envios_email` → `20261017…clima`,
`…clima_identificacao` → `…versao_tecnica` → `…codigos_processo` → `20261021…feedback360` → `20261022…vagas` →
`20261023…vagas_testes`, `…vagas_questoes` → `20261024…vagas_onda2`, `…piloto_uruacu`, `…aviso_abertura`, `…aviso_reforco`,
`…pre_abertura`, `…fase_c`. As do multiempresa (`papeis`, `respostas_empresa`, `fichas_por_empresa`, `rls_empresas`,
`capacidade_empresa`) **ainda não existem**.

## Edge Functions (`supabase/functions/`)

`admin`, `disc-sync`, `clickup-webhook`, `pagamento`, `stripe-webhook`, `asaas-webhook`, `infinitepay-webhook`, `clima`,
`vagas-conta`. Cópias para colar à mão em `dist/funcoes/`.

## ClickUp

- Espaço Consultoria GSC → pasta Projetos Ativos → lista **Sistema Painel DISC** (id `901329221416`).
- Tarefa-resumo do plano: criada pela S0 em 26/10/2026 (link em `status/README.md`).
- Para o produto de seleção: pasta própria "Recrutamento e Seleção" (campos do DISC, uma lista por processo).

## Sessões

| Sessão | Onde |
| --- | --- |
| Sessão antiga (única, nuvem; histórico) | https://claude.ai/code/session_017T6h8nE7qnSntp6azJfc2a |
| Painel geral (todos os projetos) | sessão local do dono (junta as pendências de todos os projetos) |
| S0 · Coordenação (Recrutamento e Seleção) | esta |

## Modelos prontos de outros projetos

`Notus-Agencia/bi-isabella-eleuterio` (ramo `develop`, `docs/projeto/`) e `Notus-Agencia/maquina-conteudo` (ramo
`projeto/sessoes-plano`, `docs/projeto/`).
