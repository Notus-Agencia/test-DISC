# Recrutamento e Seleção em sessões · Mapa DISC, Vendas, Clima/360 e Vagas sem Caos

Pasta de trabalho do projeto "Recrutamento e Seleção" da Gestão sem Caos, desde 26/10/2026. Tudo aqui é escrito para ser lido
por sessões do Claude Code. **O repositório é público: nada de segredo, preço, dado pessoal ou gabarito entra nesta pasta.**

Até 26/10 o projeto foi tocado numa sessão só, na nuvem (236 commits, de 05/10 a 26/10; agora histórico, só consulta).
Daqui em diante: uma sessão de coordenação (S0), uma sessão nova por frente e por fase, e uma sessão de validação (SV)
entre as fases.

## Ordem de leitura (toda sessão, antes de qualquer coisa)

1. [`PLANO.md`](PLANO.md): os 4 produtos, como o sistema é hoje, limitações, frentes, fases, portões e ordem.
2. [`regras.md`](regras.md): regras que não se quebram e decisões do dono, com data.
3. [`referencias.md`](referencias.md): repositório, endereços, ids, onde está cada documento (sem segredo).
4. O arquivo da sua sessão em [`sessoes/`](sessoes/).
5. [`status/`](status/): `README.md` é o painel geral; `S<n>.md` é o passa-bastão de cada sessão.
6. [`pendencias.md`](pendencias.md): o que falta o dono decidir ou fazer.

Quem mexe em código lê também o [`CLAUDE.md`](../../CLAUDE.md) da raiz. O contrato técnico é o [`docs/SPEC.md`](../SPEC.md)
(índice dos módulos), mais `SUPABASE.md`, `VENDAS.md`, `MULTIEMPRESA-PLANO.md`, `CLICKUP.md`, `BACKUP.md` e os `VAGAS-*.md`.

## Sessões

Modelo e esforço seguem a tabela da skill `projeto-em-sessoes` (decisão do dono, 26/10/2026).

| Sessão | Arquivo | Quando abrir | Modelo · esforço |
| --- | --- | --- | --- |
| S0 · Coordenação (Recrutamento e Seleção) | [`sessoes/S0-coordenacao.md`](sessoes/S0-coordenacao.md) | já aberta; fica o projeto todo | Opus 5.5 · alto só nesta 1ª rodada (montar o plano); depois Sonnet 5.5 · médio |
| S1 · Núcleo DISC e vendas, fase 0 (fundação) | [`sessoes/S1-nucleo-vendas.md`](sessoes/S1-nucleo-vendas.md) | logo após o ok do dono (P0) | Sonnet 5.5 · alto |
| S1 · fase 1 (venda direta no ar) | idem | depois do P1 | Opus 5.5 · alto (regras de pagamento) |
| S1 · fase 2 (multiempresa: banco e segurança) | idem | depois do P3 | Opus 5.5 · alto; extra nas etapas 4 e 5 |
| S1 · fase 3 (convites, painel do cliente, assinatura) | idem | depois do P4 | Opus 5.5 · alto |
| S2 · Vagas sem Caos, fase 0 (conferir o beta) | [`sessoes/S2-vagas.md`](sessoes/S2-vagas.md) | logo após o ok do dono (P0) | Sonnet 5.5 · alto |
| S2 · fase 1 (preparar a abertura) | idem | depois do P5 (parte técnica) | Opus 5.5 · alto |
| S2 · fase 2 (abrir Uruaçu) | idem | depois do P6 | Sonnet 5.5 · alto |
| S3 · Clima e Feedback 360, fase 0 (conferência para vender) | [`sessoes/S3-clima-360.md`](sessoes/S3-clima-360.md) | **só se o dono quiser** (P7) | Sonnet 5.5 · alto |
| S3 · fase 1 (piloto) e fase 2 (v2) | idem | depois do P8 | Opus 5.5 · alto |
| SV · Validação (V1 a V6) | [`sessoes/SV-validacao.md`](sessoes/SV-validacao.md) | no meio de cada fase, para escrever os casos antes do fim; nunca é quem construiu | Sonnet 5.5 · alto (leitura em lote e clientes simulados: Haiku 5.5 · baixo) |

Fable 5.1 só quando o dono pedir ou algo travar. Regra prática: se a sessão errar duas vezes a mesma coisa, sobe o esforço e
depois o modelo (a sessão não muda o próprio modelo: pede ao dono).

Nomes na barra lateral (seção "Recrutamento e Seleção"): `S0 · Coordenação (Recrutamento e Seleção)`,
`S1 · Núcleo DISC e vendas (fase 0)`, `S2 · Vagas sem Caos (fase 0)`, `SV · Validação (V1)`. O que terminou vira
`<assunto> (histórico)`. A sessão antiga da nuvem fica como `Recrutamento e Seleção · sessão única (histórico)`.

## Como abrir uma sessão

- Pasta: `~/Documents/Claude Code/Recrutamento e Seleção/test-DISC` (cópia principal; **nunca troque o ramo dela**).
- Começa em modo de planejamento e espera o ok do dono antes de construir.
- Primeira mensagem: `Leia docs/projeto/README.md e assuma a sessão S<n>, só a fase <N>.` mais o escopo e o "pronto quando".
- Primeira ação: criar a cópia isolada dela (worktree) a partir da branch de produção e trabalhar só lá.

```bash
git -C "$HOME/Documents/Claude Code/Recrutamento e Seleção/test-DISC" fetch origin
git -C "$HOME/Documents/Claude Code/Recrutamento e Seleção/test-DISC" worktree add \
  "$HOME/Documents/Claude Code/Recrutamento e Seleção/wt/s1-f0" -b s1/f0-fundacao \
  origin/claude/disc-test-selection-system-61ot0f
```

- Fecha a fase com PR e passa-bastão em `status/S<n>.md` (feito, onde está, o que falta, armadilhas). A fase seguinte abre
  uma sessão nova, que lê esse arquivo.

## Rotina do dono

| Ele quer… | Onde |
| --- | --- |
| Saber como está, o que vem agora, o que depende dele | Na S0: "como estamos?" |
| Decidir algo ou liberar uma fase | Na S0; ela registra em `regras.md` e avisa as sessões |
| Aprovar o plano de uma sessão ou responder a ela | Na própria sessão (é um botão lá) |
| Ver uma tela nova antes de ir ao ar | Na prévia (artefato) que a sessão publica; `push` só depois do "aprovado" |
| Detalhe técnico longo de uma frente | Na própria sessão (mais barato) |
| Ver todas as pendências de todos os projetos | No Painel geral |

## Regras curtas (as completas estão em `regras.md`)

- **A branch de produção publica a cada push** (`claude/disc-test-selection-system-61ot0f`: GitHub Pages do DISC, migrações do
  Supabase e funções entram sozinhas). Ninguém dá push nela sem o "pode publicar" do dono. Trabalho em ramo próprio e PR.
- Só existe **um** banco (o de produção). Teste de banco roda no Postgres embutido (`npm run test:supabase`) e na prévia
  (`?demo=1`); nunca com dado real em prova.
- No máximo 3 sessões construindo ao mesmo tempo, mais a SV.
- Mudança visual: prévia aprovada antes do push. Cores só com aprovação.
- Marca nos textos de cliente: "Gestão sem Caos" (o Vagas sem Caos tem marca própria, com a Gestão sem Caos como endosso).
  Nunca "Notus" em tela, e-mail ou relatório. Nada técnico para cliente final.
- Nada de preço, custo ou valor cobrado nesta pasta. Funções, nunca nomes de pessoa. Nada de dado pessoal nem segredo.
- Testar no computador e no celular (375 px) antes de mostrar. Nada de pop-up. Poucos pedidos de permissão.
