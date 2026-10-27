# S2 · Vagas sem Caos

Frente (d): plataforma de vagas, marca própria, piloto em Uruaçu-GO. Só toca nos arquivos do Vagas; o painel e o que é
compartilhado pedem à S1 pela S0.

## Leia antes

`README.md`, `PLANO.md`, `regras.md`, `referencias.md`, `pendencias.md` (seção E), `status/` e, em ordem: `docs/VAGAS-SPEC.md`
(contrato; §13 "Para colocar no ar"), `VAGAS-HOSPEDAGEM.md`, `VAGAS-OPERACAO.md`, `VAGAS-TELAS.md`, `VAGAS-TEXTOS.md`,
`VAGAS-TESTES.md`, `docs/painel-cientifico/vagas/`. Código: `vagas/`, `supabase/migrations/20261022…` a `20261024…`,
`supabase/functions/vagas-conta/`, `scripts/montar-vagas.mjs`, `scripts/montar-testes.mjs`, `tests/` (`vagas-*`).

## Fase 0 · Conferir o beta (Sonnet 5.5 · alto; só leitura em produção)

1. Conferir o que de fato está aplicado em produção (migrações, funções, segredos) **por leitura**; comparar com `VAGAS-SPEC.md` §13.
2. `npm test` e e2e do Vagas.
3. Confirmar: beta exige código; grupo Vagas escondido no painel; cidade em `lista_espera`.
4. Publicar a prévia (artefato) do grupo Vagas no painel para o dono decidir V-painel.
5. Lista "o que falta para abrir" em `status/S2.md`, separando técnico (S2) de humano (dono, operador, advogado, psicólogo).
**Pronto quando:** `status/S2.md` com a lista; nada em produção mudou.

## Fase 1 · Preparar a abertura (Opus 5.5 · alto)

Cloudflare Pages e DNS de `vagas.`; `pg_cron` (lista de espera e contas assistidas); Turnstile; `MODO: 'supabase'`; painel de revisão
da equipe dos testes; tempo extra para acessibilidade; canal de WhatsApp de Uruaçu. Ordem segura: migração e RPC primeiro, depois a tela.
**Pronto quando:** V3 duas rodadas sem erro; backup e plano pago do banco no lugar; "pode publicar".

## Fase 2 · Abrir Uruaçu (Sonnet 5.5 · alto)

`status = ativa`; aviso à lista de espera; números da praça; consertos pedidos pela operação.
**Pronto quando:** V5 sem erro; metas 4.1 de `VAGAS-OPERACAO.md` medidas.

## Não faça

- Abrir a praça, ligar o grupo no painel ou trocar o modo sem o ok do dono. Qualquer coisa que cobre da pessoa que procura emprego.
- Pôr o banco de questões ou o gabarito no repositório (público). Dado pessoal de pessoa do Vagas em log ou prova.
- Usar a palavra "match", "certificado" ou "aprovado" nos textos. Mudar cor ou tela sem prévia aprovada.
- Mexer no núcleo do DISC (S1) nem em Clima e 360 (S3).
