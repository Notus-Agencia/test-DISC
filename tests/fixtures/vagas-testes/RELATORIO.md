# Testes de habilidade — relatório do banco de questões

> ARQUIVO GERADO por `node scripts/montar-testes.mjs` a partir dos `<teste>.json` desta pasta (não edite).
> Não tem gabarito. O caderno com as respostas e as explicações sai só no terminal: `node scripts/montar-testes.mjs --revisao`.

| Teste | Questões | Prova | Minutos | Competências | Versão |
|---|---|---|---|---|---|
| Atendimento (FICTÍCIO) (`atendimento`) | 80 | 15 | 20 | 5 | 2026-10-v0 |
| Vendas (FICTÍCIO) (`vendas`) | 80 | 15 | 20 | 5 | 2026-10-v0 |
| Administrativo (FICTÍCIO) (`administrativo`) | 80 | 15 | 20 | 5 | 2026-10-v0 |
| Caixa (FICTÍCIO) (`caixa`) | 80 | 15 | 25 | 5 | 2026-10-v0 |
| Português (FICTÍCIO) (`portugues`) | 80 | 15 | 20 | 4 | 2026-10-v0 |
| **Total** | **400** | | | | |

Sorteio da prova (igual ao banco): 40% fácil, 40% média, 20% difícil (6/6/3 em 15), estratificado por competência; no máximo 1 questão por grupo de itens-irmãos; as que a pessoa já viu ficam por último.

Regras conferidas por código: banco ≥ 75 e ≥ 5× a prova; cada célula competência × dificuldade com ≥ 2× o que o sorteio tira dela (grupo de itens-irmãos conta 1); 4 alternativas distintas e 1 correta; posição da correta equilibrada (diferença ≤ 2); correta mais longa e mais curta, cada uma, em ≤ 40% das questões; enunciado ≤ 300 caracteres, frases ≤ 30 palavras; contas que fecham; sem número de lei/artigo no que a pessoa lê; sem termos proibidos (personalidade, raciocínio, gíria, marca, religião, gênero, idade, origem).

## Atendimento (FICTÍCIO) (`atendimento`)

Banco FICTÍCIO para os testes automáticos do motor. Não é o conteúdo real: nenhum item tem significado.

| Competência | Fácil (1) | Média (2) | Difícil (3) | Total |
|---|---|---|---|---|
| Competência fictícia A (`fic_a`) | 6 | 6 | 4 | 16 |
| Competência fictícia B (`fic_b`) | 6 | 6 | 4 | 16 |
| Competência fictícia C (`fic_c`) | 6 | 6 | 4 | 16 |
| Competência fictícia D (`fic_d`) | 6 | 6 | 4 | 16 |
| Competência fictícia E (`fic_e`) | 6 | 6 | 4 | 16 |
| **Total** | 30 | 30 | 20 | 80 |

- Prova: 6 fáceis, 6 médias e 3 difíceis; no máximo 2/2/1 de uma mesma competência por dificuldade.
- Grupos de itens-irmãos (no máximo 1 por prova): `fic_par_a` (ATE-001, ATE-006); `fic_par_b` (ATE-012, ATE-017).
- Posição da correta no arquivo (1ª/2ª/3ª/4ª; na prova as alternativas são embaralhadas): 20 / 20 / 20 / 20.
- Tamanho da correta frente às 3 erradas: mais curta em 20, no meio ou empatada em 40, mais longa em 20 (25%; o limite é 40%).

Matriz tarefa × competência (nº de questões; análise da função em `atendimento.analise.md`):

| Tarefa | Competência fictícia A | Competência fictícia B | Competência fictícia C | Competência fictícia D | Competência fictícia E | Total |
|---|---|---|---|---|---|---|
| Tarefa fictícia A (`tarefa_a`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia B (`tarefa_b`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia C (`tarefa_c`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia D (`tarefa_d`) | 4 | 4 | 4 | 4 | 4 | 20 |

- Função-alvo: função fictícia (testes automáticos) (80).

10 questões mais longas (caracteres de texto + enunciado + alternativas; leitura no celular):

| Questão | Caracteres | Enunciado |
|---|---|---|
| ATE-026 | 355 | FICTÍCIO ATE-026: neste item de teste automático, qual é a resposta marcada como certa? |
| ATE-027 | 355 | FICTÍCIO ATE-027: neste item de teste automático, qual é a resposta marcada como certa? |
| ATE-028 | 355 | FICTÍCIO ATE-028: neste item de teste automático, qual é a resposta marcada como certa? |
| ATE-029 | 355 | FICTÍCIO ATE-029: neste item de teste automático, qual é a resposta marcada como certa? |
| ATE-030 | 355 | FICTÍCIO ATE-030: neste item de teste automático, qual é a resposta marcada como certa? |
| ATE-001 | 286 | FICTÍCIO ATE-001: neste item de teste automático, qual é a resposta marcada como certa? |
| ATE-002 | 286 | FICTÍCIO ATE-002: neste item de teste automático, qual é a resposta marcada como certa? |
| ATE-003 | 286 | FICTÍCIO ATE-003: neste item de teste automático, qual é a resposta marcada como certa? |
| ATE-004 | 286 | FICTÍCIO ATE-004: neste item de teste automático, qual é a resposta marcada como certa? |
| ATE-005 | 286 | FICTÍCIO ATE-005: neste item de teste automático, qual é a resposta marcada como certa? |

## Vendas (FICTÍCIO) (`vendas`)

Banco FICTÍCIO para os testes automáticos do motor. Não é o conteúdo real: nenhum item tem significado.

| Competência | Fácil (1) | Média (2) | Difícil (3) | Total |
|---|---|---|---|---|
| Competência fictícia A (`fic_a`) | 6 | 6 | 4 | 16 |
| Competência fictícia B (`fic_b`) | 6 | 6 | 4 | 16 |
| Competência fictícia C (`fic_c`) | 6 | 6 | 4 | 16 |
| Competência fictícia D (`fic_d`) | 6 | 6 | 4 | 16 |
| Competência fictícia E (`fic_e`) | 6 | 6 | 4 | 16 |
| **Total** | 30 | 30 | 20 | 80 |

- Prova: 6 fáceis, 6 médias e 3 difíceis; no máximo 2/2/1 de uma mesma competência por dificuldade.
- Grupos de itens-irmãos (no máximo 1 por prova): `fic_par_a` (VEN-001, VEN-006); `fic_par_b` (VEN-012, VEN-017).
- Posição da correta no arquivo (1ª/2ª/3ª/4ª; na prova as alternativas são embaralhadas): 20 / 20 / 20 / 20.
- Tamanho da correta frente às 3 erradas: mais curta em 20, no meio ou empatada em 40, mais longa em 20 (25%; o limite é 40%).

Matriz tarefa × competência (nº de questões; análise da função em `vendas.analise.md`):

| Tarefa | Competência fictícia A | Competência fictícia B | Competência fictícia C | Competência fictícia D | Competência fictícia E | Total |
|---|---|---|---|---|---|---|
| Tarefa fictícia A (`tarefa_a`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia B (`tarefa_b`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia C (`tarefa_c`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia D (`tarefa_d`) | 4 | 4 | 4 | 4 | 4 | 20 |

- Função-alvo: função fictícia (testes automáticos) (80).

10 questões mais longas (caracteres de texto + enunciado + alternativas; leitura no celular):

| Questão | Caracteres | Enunciado |
|---|---|---|
| VEN-026 | 355 | FICTÍCIO VEN-026: neste item de teste automático, qual é a resposta marcada como certa? |
| VEN-027 | 355 | FICTÍCIO VEN-027: neste item de teste automático, qual é a resposta marcada como certa? |
| VEN-028 | 355 | FICTÍCIO VEN-028: neste item de teste automático, qual é a resposta marcada como certa? |
| VEN-029 | 355 | FICTÍCIO VEN-029: neste item de teste automático, qual é a resposta marcada como certa? |
| VEN-030 | 355 | FICTÍCIO VEN-030: neste item de teste automático, qual é a resposta marcada como certa? |
| VEN-001 | 286 | FICTÍCIO VEN-001: neste item de teste automático, qual é a resposta marcada como certa? |
| VEN-002 | 286 | FICTÍCIO VEN-002: neste item de teste automático, qual é a resposta marcada como certa? |
| VEN-003 | 286 | FICTÍCIO VEN-003: neste item de teste automático, qual é a resposta marcada como certa? |
| VEN-004 | 286 | FICTÍCIO VEN-004: neste item de teste automático, qual é a resposta marcada como certa? |
| VEN-005 | 286 | FICTÍCIO VEN-005: neste item de teste automático, qual é a resposta marcada como certa? |

## Administrativo (FICTÍCIO) (`administrativo`)

Banco FICTÍCIO para os testes automáticos do motor. Não é o conteúdo real: nenhum item tem significado.

| Competência | Fácil (1) | Média (2) | Difícil (3) | Total |
|---|---|---|---|---|
| Competência fictícia A (`fic_a`) | 6 | 6 | 4 | 16 |
| Competência fictícia B (`fic_b`) | 6 | 6 | 4 | 16 |
| Competência fictícia C (`fic_c`) | 6 | 6 | 4 | 16 |
| Competência fictícia D (`fic_d`) | 6 | 6 | 4 | 16 |
| Competência fictícia E (`fic_e`) | 6 | 6 | 4 | 16 |
| **Total** | 30 | 30 | 20 | 80 |

- Prova: 6 fáceis, 6 médias e 3 difíceis; no máximo 2/2/1 de uma mesma competência por dificuldade.
- Grupos de itens-irmãos (no máximo 1 por prova): `fic_par_a` (ADM-001, ADM-006); `fic_par_b` (ADM-012, ADM-017).
- Posição da correta no arquivo (1ª/2ª/3ª/4ª; na prova as alternativas são embaralhadas): 20 / 20 / 20 / 20.
- Tamanho da correta frente às 3 erradas: mais curta em 20, no meio ou empatada em 40, mais longa em 20 (25%; o limite é 40%).

Matriz tarefa × competência (nº de questões; análise da função em `administrativo.analise.md`):

| Tarefa | Competência fictícia A | Competência fictícia B | Competência fictícia C | Competência fictícia D | Competência fictícia E | Total |
|---|---|---|---|---|---|---|
| Tarefa fictícia A (`tarefa_a`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia B (`tarefa_b`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia C (`tarefa_c`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia D (`tarefa_d`) | 4 | 4 | 4 | 4 | 4 | 20 |

- Função-alvo: função fictícia (testes automáticos) (80).

10 questões mais longas (caracteres de texto + enunciado + alternativas; leitura no celular):

| Questão | Caracteres | Enunciado |
|---|---|---|
| ADM-026 | 355 | FICTÍCIO ADM-026: neste item de teste automático, qual é a resposta marcada como certa? |
| ADM-027 | 355 | FICTÍCIO ADM-027: neste item de teste automático, qual é a resposta marcada como certa? |
| ADM-028 | 355 | FICTÍCIO ADM-028: neste item de teste automático, qual é a resposta marcada como certa? |
| ADM-029 | 355 | FICTÍCIO ADM-029: neste item de teste automático, qual é a resposta marcada como certa? |
| ADM-030 | 355 | FICTÍCIO ADM-030: neste item de teste automático, qual é a resposta marcada como certa? |
| ADM-001 | 286 | FICTÍCIO ADM-001: neste item de teste automático, qual é a resposta marcada como certa? |
| ADM-002 | 286 | FICTÍCIO ADM-002: neste item de teste automático, qual é a resposta marcada como certa? |
| ADM-003 | 286 | FICTÍCIO ADM-003: neste item de teste automático, qual é a resposta marcada como certa? |
| ADM-004 | 286 | FICTÍCIO ADM-004: neste item de teste automático, qual é a resposta marcada como certa? |
| ADM-005 | 286 | FICTÍCIO ADM-005: neste item de teste automático, qual é a resposta marcada como certa? |

## Caixa (FICTÍCIO) (`caixa`)

Banco FICTÍCIO para os testes automáticos do motor. Não é o conteúdo real: nenhum item tem significado.

| Competência | Fácil (1) | Média (2) | Difícil (3) | Total |
|---|---|---|---|---|
| Competência fictícia A (`fic_a`) | 6 | 6 | 4 | 16 |
| Competência fictícia B (`fic_b`) | 6 | 6 | 4 | 16 |
| Competência fictícia C (`fic_c`) | 6 | 6 | 4 | 16 |
| Competência fictícia D (`fic_d`) | 6 | 6 | 4 | 16 |
| Competência fictícia E (`fic_e`) | 6 | 6 | 4 | 16 |
| **Total** | 30 | 30 | 20 | 80 |

- Prova: 6 fáceis, 6 médias e 3 difíceis; no máximo 2/2/1 de uma mesma competência por dificuldade.
- Grupos de itens-irmãos (no máximo 1 por prova): `fic_par_a` (CAI-001, CAI-006); `fic_par_b` (CAI-012, CAI-017).
- Posição da correta no arquivo (1ª/2ª/3ª/4ª; na prova as alternativas são embaralhadas): 20 / 20 / 20 / 20.
- Tamanho da correta frente às 3 erradas: mais curta em 16, no meio ou empatada em 48, mais longa em 16 (20%; o limite é 40%).

Matriz tarefa × competência (nº de questões; análise da função em `caixa.analise.md`):

| Tarefa | Competência fictícia A | Competência fictícia B | Competência fictícia C | Competência fictícia D | Competência fictícia E | Total |
|---|---|---|---|---|---|---|
| Tarefa fictícia A (`tarefa_a`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia B (`tarefa_b`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia C (`tarefa_c`) | 4 | 4 | 4 | 4 | 4 | 20 |
| Tarefa fictícia D (`tarefa_d`) | 4 | 4 | 4 | 4 | 4 | 20 |

- Função-alvo: função fictícia (testes automáticos) (80).

10 questões mais longas (caracteres de texto + enunciado + alternativas; leitura no celular):

| Questão | Caracteres | Enunciado |
|---|---|---|
| CAI-027 | 355 | FICTÍCIO CAI-027: neste item de teste automático, qual é a resposta marcada como certa? |
| CAI-028 | 355 | FICTÍCIO CAI-028: neste item de teste automático, qual é a resposta marcada como certa? |
| CAI-029 | 355 | FICTÍCIO CAI-029: neste item de teste automático, qual é a resposta marcada como certa? |
| CAI-030 | 355 | FICTÍCIO CAI-030: neste item de teste automático, qual é a resposta marcada como certa? |
| CAI-002 | 286 | FICTÍCIO CAI-002: neste item de teste automático, qual é a resposta marcada como certa? |
| CAI-003 | 286 | FICTÍCIO CAI-003: neste item de teste automático, qual é a resposta marcada como certa? |
| CAI-004 | 286 | FICTÍCIO CAI-004: neste item de teste automático, qual é a resposta marcada como certa? |
| CAI-005 | 286 | FICTÍCIO CAI-005: neste item de teste automático, qual é a resposta marcada como certa? |
| CAI-007 | 286 | FICTÍCIO CAI-007: neste item de teste automático, qual é a resposta marcada como certa? |
| CAI-008 | 286 | FICTÍCIO CAI-008: neste item de teste automático, qual é a resposta marcada como certa? |

## Português (FICTÍCIO) (`portugues`)

Banco FICTÍCIO para os testes automáticos do motor. Não é o conteúdo real: nenhum item tem significado.

| Competência | Fácil (1) | Média (2) | Difícil (3) | Total |
|---|---|---|---|---|
| Competência fictícia A (`fic_a`) | 8 | 8 | 4 | 20 |
| Competência fictícia B (`fic_b`) | 8 | 8 | 4 | 20 |
| Competência fictícia C (`fic_c`) | 8 | 8 | 4 | 20 |
| Competência fictícia D (`fic_d`) | 8 | 8 | 4 | 20 |
| **Total** | 32 | 32 | 16 | 80 |

- Prova: 6 fáceis, 6 médias e 3 difíceis; no máximo 2/2/1 de uma mesma competência por dificuldade.
- Grupos de itens-irmãos (no máximo 1 por prova): `fic_par_a` (POR-001, POR-005); `fic_par_b` (POR-010, POR-014).
- Posição da correta no arquivo (1ª/2ª/3ª/4ª; na prova as alternativas são embaralhadas): 20 / 20 / 20 / 20.
- Tamanho da correta frente às 3 erradas: mais curta em 20, no meio ou empatada em 40, mais longa em 20 (25%; o limite é 40%).

Matriz tarefa × competência (nº de questões; análise da função em `portugues.analise.md`):

| Tarefa | Competência fictícia A | Competência fictícia B | Competência fictícia C | Competência fictícia D | Total |
|---|---|---|---|---|---|
| Tarefa fictícia A (`tarefa_a`) | 20 | · | · | · | 20 |
| Tarefa fictícia B (`tarefa_b`) | · | 20 | · | · | 20 |
| Tarefa fictícia C (`tarefa_c`) | · | · | 20 | · | 20 |
| Tarefa fictícia D (`tarefa_d`) | · | · | · | 20 | 20 |

- Função-alvo: função fictícia (testes automáticos) (80).

10 questões mais longas (caracteres de texto + enunciado + alternativas; leitura no celular):

| Questão | Caracteres | Enunciado |
|---|---|---|
| POR-021 | 355 | FICTÍCIO POR-021: neste item de teste automático, qual é a resposta marcada como certa? |
| POR-022 | 355 | FICTÍCIO POR-022: neste item de teste automático, qual é a resposta marcada como certa? |
| POR-023 | 355 | FICTÍCIO POR-023: neste item de teste automático, qual é a resposta marcada como certa? |
| POR-024 | 355 | FICTÍCIO POR-024: neste item de teste automático, qual é a resposta marcada como certa? |
| POR-001 | 286 | FICTÍCIO POR-001: neste item de teste automático, qual é a resposta marcada como certa? |
| POR-002 | 286 | FICTÍCIO POR-002: neste item de teste automático, qual é a resposta marcada como certa? |
| POR-003 | 286 | FICTÍCIO POR-003: neste item de teste automático, qual é a resposta marcada como certa? |
| POR-004 | 286 | FICTÍCIO POR-004: neste item de teste automático, qual é a resposta marcada como certa? |
| POR-005 | 286 | FICTÍCIO POR-005: neste item de teste automático, qual é a resposta marcada como certa? |
| POR-006 | 286 | FICTÍCIO POR-006: neste item de teste automático, qual é a resposta marcada como certa? |
