# Plano · Recrutamento e Seleção em sessões (a partir de 26/10/2026)

Proposta da S0 na 1ª rodada. **Esperando o ok do dono** (ver `pendencias.md`). Datas são alvo, não promessa.

## 1. Objetivo

Quatro produtos da Gestão sem Caos que compartilham o mesmo repositório, o mesmo Supabase e o mesmo painel, e que hoje
andam numa conversa só. O objetivo do projeto é **levar cada produto até estar no ar, um de cada vez, sem quebrar os que
já funcionam**, e em cada um saber o que falta e quem precisa fazer.

Os objetivos de negócio abaixo são o que o repositório e a lista do ClickUp mostram. **O dono confirma ou corrige**
(`pendencias.md`, D-obj).

| Produto | Objetivo de negócio | Para quem | Estado |
| --- | --- | --- | --- |
| **(a) Mapa DISC e processo seletivo** | Serviço de recrutamento e gestão de pessoas da consultoria: o candidato faz o teste, o recrutador vê no painel, a liderança recebe o guia, o contratante recebe o relatório do processo, tudo ligado ao ClickUp. É a base dos outros três. | consultoria e clientes dela | No ar e em uso |
| **(b) Venda direta (B2C) e multiempresa/assinatura (B2B)** | Receita própria do produto: (1) a pessoa compra o "Mapa de Perfil" no site, paga no Stripe e recebe o relatório; (2) a empresa cliente tem acesso próprio ao painel, só dos dados dela, por assinatura. | pessoa física; empresa cliente | B2C construído (Stripe, Pix, cupons, relatório pago); se já está em modo de produção não está registrado no repositório: a S1 f0 confere na aba Conexões do painel. B2B só em plano (nenhuma migração das 9 etapas existe) |
| **(c) Clima, Feedback 360 e organograma** | Serviços de gestão para empresas clientes: pesquisa de clima (anônima, com mínimo de respondentes), Feedback 360 da liderança (confidencial) e organograma/colaboradores como base. | empresa cliente, via consultor | Versão 1 construída e testada em prévia; textos "em validação"; **não vender antes da revisão profissional** |
| **(d) Vagas sem Caos** | Plataforma de vagas de cidade pequena (piloto em Uruaçu-GO): a pessoa procura emprego de graça, a empresa publica vagas; selo de habilidade testada; "Combinou" quando os dois querem conversar. Marca própria, com a Gestão sem Caos como endosso. A cobrança da empresa só vem depois das metas do piloto. | quem procura trabalho; empresas da cidade | Beta fechada com código; grupo Vagas escondido no painel; cidade em lista de espera |

## 2. Como o sistema é hoje (26/10/2026)

| Peça | Estado |
| --- | --- |
| Repositório | `Notus-Agencia/test-DISC`, **público**. Branch de produção: `claude/disc-test-selection-system-61ot0f`. 236 commits (05/10 a 26/10; 105 deles em 14/10, quase todos do Vagas) |
| Site | HTML/CSS/JS puro, sem build. DISC em `disc.gestaosemcaos.com.br` (GitHub Pages). Vagas em `disc.gestaosemcaos.com.br/vagas/` (beta fechada com código); `vagas.gestaosemcaos.com.br` (Cloudflare Pages) está desenhado e ainda não ligado |
| Banco | Supabase, **um só projeto** (produção). 25 migrações; entram sozinhas a cada push na branch de produção |
| Funções | Edge Functions: `admin`, `disc-sync`, `clickup-webhook`, `pagamento`, `stripe-webhook`, `asaas-webhook`, `infinitepay-webhook`, `clima`, `vagas-conta` |
| Legado | Google Apps Script (`apps-script/`) ainda existe e `API_URL` do `js/config.js` ainda aponta para ele, mas `BACKEND` é `supabase` |
| Testes | `npm test` (unidade e guardas), `npm run test:supabase` (Postgres embutido), `npm run test:e2e` (Playwright, celular e computador) |
| E-mail | Resend. Domínios `disc.gestaosemcaos.com.br` e `gestaosemcaos.com.br` aparecem como **verificados** (conferido em 26/10). Falta a chave da Resend no sistema (`pendencias.md`) |
| Backup do banco | robô diário no GitHub Actions, **em pausa até 29/10** (segredos não cadastrados) |
| ClickUp | pasta "Recrutamento e Seleção" com os campos do DISC; lista de tarefas do projeto: "Sistema Painel DISC" |
| Supabase plano grátis | pausa com 7 dias sem uso; um robô "manter ativo" faz uma consulta a cada 3 dias |

O que a sessão antiga deixou está em [`status/historico-sessao-unica.md`](status/historico-sessao-unica.md).

## 3. Limitações e como contornar

| Limitação | Como contornar |
| --- | --- |
| Cada push na branch de produção publica o site **e aplica migrações no banco real** | trabalho só em ramo próprio e PR; migração só junta depois de ensaio no Postgres embutido e da SV; "pode publicar" do dono |
| Não existe banco de teste | Postgres embutido nos testes, prévia (`?demo=1`, `API_URL: 'simulada'`) e dados fictícios. Ambiente de teste de verdade (ramo do Supabase) é decisão do dono (`pendencias.md`, D-amb) |
| Repositório público | nada de segredo, gabarito de teste, dado pessoal, preço ou nome de pessoa em `docs/projeto/`; o banco de questões do Vagas fica numa cópia privada fora do repositório |
| Os 4 produtos dividem banco, painel (`admin.html`, `js/admin.js`) e `js/api-supabase.js` | S1 é dona dos arquivos compartilhados; S2 e S3 só tocam nos arquivos do próprio produto e pedem o resto pela S0 (seção 6) |
| Dependências humanas (advogado, psicólogo, operador, contador) | cada uma está em `pendencias.md` com quem faz e o que bloqueia; a sessão nunca finge que está resolvida |
| Conta Stripe ainda não é da Gestão sem Caos | decisão do dono (`pendencias.md`); a troca é de 3 chaves, sem mudar código |
| Dono não é programador | português simples; tela nova só com prévia aprovada; tudo com "onde clicar" |
| Sessão nunca digita senha, chave ou token | o dono cadastra os segredos (GitHub, Supabase, Resend, Stripe); a sessão confere o resultado |

## 4. Frentes, fases e portões

### S1 · Núcleo DISC e vendas (produtos a e b)

| Fase | O que entra | Pronto quando | Alvo |
| --- | --- | --- | --- |
| 0 · Fundação | inventário "o que está no ar" por tela e por função; `npm test` verde na branch de produção; backup do banco funcionando (o dono cadastra os 2 segredos, a sessão confere o robô verde); chave da Resend ligada e e-mails de acesso testados; atualizar `docs/EMAILS.md` para o domínio `disc.`; decidir o legado do Apps Script (guardar ou aposentar); se o dono escolher, ajustes do DISC em seleção (`pendencias.md`, D-sel) | backup verde por 3 dias; e-mail de recuperar senha e de relatório chegando; inventário em `status/S1.md`; PR com "pode publicar" | 26/10 a 06/11 |
| 1 · Venda direta no ar | percurso de compra de ponta a ponta no modo teste (cartão, Pix, Apple Pay, cupom, relatório, recuperar, reembolso); `EMPRESA_LEGAL`, `WHATSAPP_SUPORTE`, termos e privacidade revisados; troca da conta Stripe se decidida; virada para produção; compra-teste de valor mínimo e estorno | V1 duas rodadas sem erro; checklist jurídico de `docs/VENDAS.md` marcado; "pode publicar" | depois do P1 |
| 2 · Multiempresa: banco e segurança | etapas 0 a 5 de `docs/MULTIEMPRESA-PLANO.md`: preparo, papéis internos, empresa nas respostas, seletor de empresa, fichas por empresa, segurança por empresa (RLS) | V2 duas rodadas sem erro; todas as conferências do plano dão 0; ensaio com dump no Postgres embutido; "pode publicar" por etapa | depois do P3 |
| 3 · Convites, painel do cliente, assinatura | etapas 6 a 9: convites sem e-mail, painel do cliente, capacidade e anti-abuso por empresa, assinatura (Stripe Billing) | V4 duas rodadas sem erro; cliente piloto usa; "pode publicar" | depois do P4 |

### S2 · Vagas sem Caos (produto d)

| Fase | O que entra | Pronto quando | Alvo |
| --- | --- | --- | --- |
| 0 · Conferir o beta | ler `VAGAS-SPEC.md` §13 e conferir o que **de fato** está aplicado em produção (migrações, funções, segredos) só por leitura; `npm test` e e2e do Vagas; confirmar que o grupo Vagas segue escondido no painel e que o beta exige código; lista "o que falta para abrir" separada em técnico (S2) e humano (dono) | `status/S2.md` com a lista; nada em produção mudou | 26/10 a 06/11 |
| 1 · Preparar a abertura | Cloudflare Pages e DNS de `vagas.`; agendamentos (`pg_cron`) da lista de espera e das contas assistidas; Turnstile; trocar `MODO` da prévia para `supabase`; painel de revisão da equipe dos testes; tempo extra (acessibilidade); canal de WhatsApp de Uruaçu | V3 duas rodadas sem erro (privacidade, cartão cego, celular); backup e plano pago do banco no lugar; "pode publicar" | depois do P5 |
| 2 · Abrir Uruaçu | `status = ativa`; aviso à lista de espera; acompanhar os números da praça e consertar o que a operação pedir | V5; metas 4.1 de `VAGAS-OPERACAO.md` medidas | semana 5 do calendário de 13 semanas |
| 3 · Cobrança da empresa | definida no portão, depois das metas do piloto (NFS-e, pedidos). Fora deste plano até lá | definido no P6 | a definir |

O calendário das 13 semanas de Uruaçu (`VAGAS-OPERACAO.md` §9) é em grande parte **trabalho de pessoas** (operador, advogado,
psicólogo, contador, parcerias). A S2 cobre só o que é sistema.

### S3 · Clima e Feedback 360 (produto c) — só abre se o dono quiser

| Fase | O que entra | Pronto quando | Alvo |
| --- | --- | --- | --- |
| 0 · Conferência para vender | checklist de profissionais de `docs/painel-cientifico/decisao.md` §7 e `360/decisao.md` §7; base legal em `CLIMA_BASE_LEGAL` e `F360_BASE_LEGAL` (depois do advogado); revisar textos e rótulos; ensaio completo em prévia com empresa fictícia | lista de bloqueios fechada, cada um com dono; nenhuma promessa de "validado" nos textos | depois do P7 |
| 1 · Piloto com um cliente | uma rodada de clima e/ou um ciclo de 360 com uma empresa, por links, relatório pelo consultor | V6; devolutiva feita; ajustes anotados | depois do P8 |
| 2 · Versão 2 | relatório do líder, comparação entre rodadas, Trilha B (instrumentos científicos, se autorizados) | definida depois do piloto | 2027 |

### SV · Validação

| Rodada | Valida | Foco |
| --- | --- | --- |
| V1 | S1 fases 0 e 1 | e-mails de acesso, backup (abrir uma cópia e conferir), compra B2C no modo teste, cupom, reembolso, recuperar relatório, textos sem promessa clínica |
| V2 | S1 fase 2 | matriz de 7 usuários do plano (dono, consultor, admin da empresa, leitor, outra empresa, vários, sem acesso), mesmo telefone em duas empresas e no B2C, migração aplicada duas vezes |
| V3 | S2 fase 1 | privacidade (cartão cego até o Combinou, sem dado do DISC), limites de abuso, Turnstile, celular, grupo Vagas escondido |
| V4 | S1 fase 3 | convite (link só no clique, conta existente não ganha link), painel do cliente sem Vendas nem Conexões, assinatura em modo teste |
| V5 | S2 fase 2 | abertura da praça, aviso à lista de espera sem duplicar, números da praça |
| V6 | S3 fases 0 e 1 | supressão de grupos pequenos (clima k≥5/10, 360 k≥3), modos de identificação, relatório sem rótulo de "validado" |

## 5. Portões e ordem

Ordem sugerida (o dono decide): **fundação primeiro e Vagas em paralelo (S1 f0 e S2 f0, só conferência, sem risco)**; depois a
venda direta; depois o multiempresa; Clima/360 só se o dono quiser. Motivo: a fundação destrava e-mail e backup, que todo o
resto precisa; a S2 f0 só lê; a venda direta já está pronta e é a primeira receita; o multiempresa é a maior mudança de banco e
só deve começar com as decisões dele tomadas.

| Portão | O que libera | Condição (o dono dá o ok na S0) |
| --- | --- | --- |
| P0 | S1 f0, S2 f0 e a SV escrever os casos de V1 | ok do dono neste plano e nas decisões bloqueantes (`pendencias.md`: D-obj, D-sel, D-amb) |
| P1 | S1 f1 | S1 f0 pronta e V1 parte A (e-mail e backup) sem erro |
| P2 | venda direta ao público | V1 completa; conta Stripe decidida; termos revisados; "pode publicar" |
| P3 | S1 f2 | P1; decisões do multiempresa (`pendencias.md`, M1 a M4) |
| P4 | S1 f3 | V2 duas rodadas sem erro; backup do banco funcionando |
| P5 | S2 f1 | S2 f0 pronta; grupo Vagas decidido; operador de Uruaçu e advogado(a) definidos |
| P6 | abrir Uruaçu (S2 f2) | V3 sem erro; backup em plano pago; psicólogo(a) e advogado(a) com parecer; "pode publicar" |
| P7 | S3 f0 | o dono diz que quer Clima/360 agora |
| P8 | S3 f1 | profissionais da `decisao.md` §7 concluídos; base legal definida |

**No máximo 3 sessões construindo ao mesmo tempo**, mais a SV. Onda 1: S1 f0 + S2 f0 (+ SV escrevendo casos). Onda 2: S1 f1 +
S2 f1 conforme P1 e P5. Onda 3: S1 f2 (sozinha: é o maior risco no banco).

## 6. Quem toca em quê

| Área | Dona |
| --- | --- |
| `admin.html`, `js/admin.js`, `js/api-supabase.js`, `js/api.js`, `js/api-simulada.js`, `js/config.js`, `assets/notus.css`, migrações do núcleo (`20261005…` a `20261021…`) | S1 |
| `vagas/`, `docs/VAGAS-*.md`, migrações `vagas_*`, Edge Function `vagas-conta`, `scripts/montar-vagas.mjs`, `scripts/montar-testes.mjs` | S2 |
| `js/clima*.js`, `js/feedback360*.js`, `js/admin-clima.js`, `js/admin-feedback360.js`, `clima.html`, `feedback360.html`, `docs/painel-cientifico/` | S3 |
| `docs/projeto/` | S0 (as sessões escrevem só o próprio `status/S<n>.md`) |

Duas sessões que precisam do mesmo arquivo compartilhado pedem pela S0, que define a ordem. O painel (`admin.js`) tem o grupo
Vagas, o grupo Clima/360 e o núcleo: mudança nele passa pela S1.
