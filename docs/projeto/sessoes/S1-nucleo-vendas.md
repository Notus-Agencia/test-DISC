# S1 · Núcleo DISC e vendas

Frentes (a) Mapa DISC e processo seletivo e (b) venda direta (B2C) e multiempresa/assinatura (B2B). **Dona dos arquivos
compartilhados** (`PLANO.md` §6).

## Leia antes

`README.md`, `PLANO.md`, `regras.md`, `referencias.md`, `pendencias.md`, `status/` e, conforme a fase: `docs/SPEC.md`,
`docs/SUPABASE.md`, `docs/EMAILS.md`, `docs/BACKUP.md`, `docs/VENDAS.md`, `docs/CLICKUP.md`, `docs/MULTIEMPRESA-PLANO.md`.
Código: `index.html`, `admin.html`, `js/` (`app.js`, `admin.js`, `api-supabase.js`, `scoring.js`, `relatorio-motor.js`,
`lideranca.js`), `supabase/migrations/`, `supabase/functions/` (`admin`, `pagamento`, `stripe-webhook`, `disc-sync`,
`clickup-webhook`), `tests/`.

## Fase 0 · Fundação (Sonnet 5.5 · alto)

1. Inventário "o que está no ar" (telas do candidato e do painel, funções, relatórios, ClickUp, vendas) em `status/S1.md`.
2. `npm test` verde; se não estiver, listar o que falha antes de mexer em qualquer coisa.
3. Backup: conferir o robô depois que o dono cadastrar os segredos; anotar a data da última cópia boa.
4. E-mail: com a chave da Resend cadastrada pelo dono, testar recuperar senha, convite e envio de relatório; atualizar `docs/EMAILS.md`
   para o domínio `disc.`.
5. Aba Conexões do painel: anotar se o Stripe está em modo de teste ou de produção.
6. Propor (não aplicar) o que fazer com o legado do Apps Script.
7. Se o dono decidir D-sel: tirar aderência, ordenação por aderência e "Encaixe /100" dos relatórios, **com prévia aprovada antes do push**.
**Pronto quando:** backup verde por 3 dias; e-mails chegando; inventário escrito; PR com "pode publicar".

## Fase 1 · Venda direta no ar (Opus 5.5 · alto)

Percurso de compra completo no modo teste (cartão, Pix, Apple Pay, cupom, relatório, recuperar, reembolso, estorno); `EMPRESA_LEGAL`,
`WHATSAPP_SUPORTE`, termos e privacidade revisados pelo(a) advogado(a); troca da conta Stripe se decidida (só as 3 chaves, o dono
cadastra); virada para produção; compra-teste de valor mínimo e estorno. Textos sem promessa clínica nem garantia.
**Pronto quando:** V1 duas rodadas sem erro; checklist jurídico de `docs/VENDAS.md` marcado; "pode publicar".

## Fase 2 · Multiempresa: banco e segurança (Opus 5.5 · alto; extra nas etapas 4 e 5)

Etapas 0 a 5 de `docs/MULTIEMPRESA-PLANO.md`. Uma etapa por PR. Ensaio com dump no Postgres embutido; cópia de segurança antes da
separação de fichas; todas as conferências dão 0. Decisões M1 a M4 de `pendencias.md` já tomadas.
**Pronto quando:** V2 duas rodadas sem erro; "pode publicar" por etapa.

## Fase 3 · Convites, painel do cliente, assinatura (Opus 5.5 · alto)

Etapas 6 a 9: convites sem e-mail, painel do cliente (prévia aprovada antes), capacidade e anti-abuso por empresa, Stripe Billing.
**Pronto quando:** V4 duas rodadas sem erro; cliente piloto usa; "pode publicar".

## Não faça

- Dar push na branch de produção sem o "pode publicar" do dono. Aplicar migração à mão em produção.
- Pôr segredo, dado pessoal, preço ou nome de pessoa no repositório. Digitar senha, chave ou token (o dono cadastra).
- Mudar cor ou tela sem prévia aprovada. Quebrar seletores de `tests/e2e`.
- Mexer em `vagas/`, nas migrações `vagas_*`, em Clima e 360 (são da S2 e da S3): peça pela S0.
