# Vagas sem Caos · testes de habilidade (contrato)

Testes curtos de **conhecimento prático** (o básico de uma função) que dão à pessoa o selo **"habilidade testada"** no
Vagas sem Caos, da Gestão sem Caos. Não são testes psicológicos: não medem personalidade, inteligência, raciocínio
abstrato nem atenção (terreno do psicólogo: Lei 4.119/1962 e SATEPSI). Cada questão pergunta **o que é correto fazer**
numa situação de trabalho, nunca "o que você faria".

> **O banco de questões (com o gabarito) nunca entra no repositório.** O repositório é público e o site do DISC sai dele
> pelo GitHub Pages: qualquer arquivo aqui vira URL. A cópia-mestre do conteúdo é **privada**, fora do GitHub, e o banco
> de dados é carregado à mão (ver [Gabarito fora do repositório](#gabarito-fora-do-repositório)). No repositório ficam o
> motor, o validador, um banco **FICTÍCIO** para os testes automáticos e um **espelho** vazio da migração do conteúdo.

| Peça | Onde |
|---|---|
| Motor (tabelas, sorteio, tempo, nota, selo, limites) | `supabase/migrations/20261023120000_vagas_testes.sql` |
| Migração do banco de questões: **espelho só com comentário** (a carga é à mão) | `supabase/migrations/20261023120001_vagas_questoes.sql` |
| Conteúdo REAL (JSON com gabarito e explicações + análise da função + RELATORIO.md) | **cópia privada, fora do repositório** (pasta `<teste>.json`, `<teste>.analise.md`, `RELATORIO.md`) |
| Banco FICTÍCIO para os testes automáticos (gerado, determinístico, rotulado "FICTÍCIO") | `tests/fixtures/vagas-testes/` |
| Validador e gerador (SQL de carga, RELATORIO.md, caderno de revisão, banco fictício) | `scripts/montar-testes.mjs` (`--checar` roda no `npm test`) |
| Textos e formatação nas telas (módulo puro, sem rede) | `vagas/js/testes.js` (`window.VAGAS_TESTES`) |
| Testes | `tests/vagas-testes.test.js`, `tests/vagas-testes-conteudo.test.js`, `tests/supabase/vagas_testes.test.js` |

## Os 5 testes

| Teste (`slug`) | Competências | Prova | Banco |
|---|---|---|---|
| Atendimento e recepção (`atendimento`) | receber e informar; telefone e WhatsApp; agenda e horários; reclamações e situações difíceis; sigilo e dados do cliente | 15 questões, 20 min | 80 |
| Vendas no varejo (`vendas`) | abordagem e necessidade do cliente; apresentação do produto e fechamento; objeções, negociação e preço; troca, devolução e direitos do consumidor; pós-venda e relacionamento | 15, 20 min | 80 |
| Rotina administrativa (`administrativo`) | organização de documentos; planilha básica; e-mail e comunicação escrita; notas, recibos e contas a pagar; agenda e rotina do escritório | 15, 20 min | 80 |
| Caixa e matemática prática (`caixa`) | troco e contagem de dinheiro; porcentagem e desconto; juros e parcelamento; Pix, cartão e dinheiro; abertura, fechamento e conferência do caixa | 15, **25 min** | 80 |
| Português prático (`portugues`) | ortografia e acentuação; concordância e uso correto; interpretação de avisos e mensagens; mensagem profissional | 15, 20 min | 80 |

Contagens por competência × dificuldade, matriz tarefa × competência e posição das corretas: `RELATORIO.md` da cópia
privada (gerado pelo validador; não tem gabarito, mas também fica fora do repositório porque lista grupos e enunciados).

## Regras da prova (no banco; o cliente só mostra)

- **Quem faz:** conta logada (nunca sessão anônima). Com a fundação (20261022) no banco, **só conta de pessoa com status
  ativo** (`vagas_contas.tipo = 'pessoa'`, `status = 'ativa'`): conta de empresa, de operador ou usuário do DISC não
  inicia tentativa (não colhe o banco). Sem a tabela `vagas_contas` (migrações independentes), basta estar em `auth.users`.
- **Sorteio estratificado** (`vagas_interno.teste_sortear`, igual a `cotasPorCelula` do gerador): 15 questões = 40%
  fáceis, 40% médias, 20% difíceis (**6/6/3**), divididas por competência (15 ÷ C; as competências em ordem sorteada; as
  dificuldades 3, 1 e 2 em rodízio, e as células difíceis são preenchidas primeiro). **No máximo 1 questão por grupo de
  itens-irmãos** (mesma situação-base ou mesmo tipo de conta; o caixa tem 2 grupos de troco simples, então até 2 contas de
  troco simples por prova). As que a pessoa já viu em tentativas anteriores ficam por último. Faltou questão numa célula:
  completa na mesma competência, depois em qualquer uma.
- **Ordem:** das fáceis para as difíceis; as 4 alternativas são embaralhadas em cada prova (gerador criptográfico do
  banco). Por isso nenhuma alternativa pode depender da posição ("todas as anteriores", "letra B").
- **Uma questão por vez, sem voltar.** O banco só entrega a questão atual; responder grava e já devolve a próxima.
  Reenviar a mesma resposta (internet fraca) devolve o estado sem mudar nada.
- **Tempo pelo relógio do servidor.** `terminaEm` = início + minutos. A resposta da questão que **já estava na tela** é
  aceita até **maior(fim, hora em que ela apareceu) + 10 s** (tolerância para internet fraca; como nenhuma questão nova
  é entregue depois do fim, na prática é fim + 10 s para a questão da tela, e não 10 s × nº de questões). Tentativa
  vencida fecha sozinha na próxima chamada (status `tempo_esgotado`; vale o que foi respondido; o que ficou sem resposta
  conta como erro).
- **Encerrar antes de responder tudo conta** como tentativa (`vagas_finalizar`): a tela confirma antes de chamar. A
  instrução antes da prova avisa. Exceção: tentativa em que **nenhuma questão chegou a ser mostrada** (aberta por engano
  e encerrada ou vencida) **não conta para os 30 dias** e não devolve `podeIniciarEm`.
- **1 tentativa por teste a cada 30 dias**, contados do início da anterior em que ao menos 1 questão foi mostrada.
  Refazer é grátis. Tentativa aberta é retomada (duas abas não criam duas tentativas).
- **Nota** = arredonda(100 × acertos ÷ total), de 0 a 100. A tela mostra os acertos por competência, **nunca quais
  questões a pessoa errou** (isso entregaria o gabarito).
- **Selo** com nota ≥ **60** (ver [Nota de corte](#nota-de-corte-60-provisória)), válido por **12 meses**, sempre com a
  margem: **"Nota 82 (±10)"**. Nunca "aprovado" ou "reprovado"; abaixo do corte a tela diz o que estudar e quando pode
  refazer. A nota mínima e o nº de questões vêm do banco (`notaMinima` no catálogo, `questoes` no selo): quando o Angoff
  mudar `vagas_testes.nota_minima`, as telas acompanham sem mexer no JS.
- **Sinais de fraude** são só registrados (não anulam nada sozinhos): resposta em menos de 3 s depois de mostrada; troca
  de aba e cópia de texto informadas pelo aparelho. Alertas: `respostas_rapidas` (≥ 1/3 das questões), `troca_aba`
  (≥ 3), `copiou_texto` (≥ 1). Quem decide é uma pessoa da equipe (`vagas_revogar_selo`). **Transparência (LGPD, art. 6º,
  VI):** a tela de instruções avisa o que a prova registra (tempo de cada questão, saída da tela, cópia de texto) e que
  ninguém perde o selo só por isso.
- **Limite por origem** (mesmo padrão da 20261020, tabela `limites_vendas`): **10 tentativas novas em 10 min ou 60 por
  dia** por origem (colheita em massa do banco fica cara; um ponto de internet compartilhado em Boa Vista ainda cabe);
  na conferência pública do selo, 20 códigos inexistentes em 10 min ou 100 por dia. Monitorar `limites_vendas` com
  `chave = 'sem-ip'`: se o gateway deixar de mandar `x-forwarded-for`, todas as consultas caem no mesmo balde.
- **Datas** mostradas (do selo, validade, "pode refazer a partir de") no fuso de Boa Vista (UTC−4); datas-hora em ISO UTC.

### Teste de caixa: papel e caneta sim, calculadora não

A tela de instruções do caixa diz: **"Pode usar papel e caneta para as contas. Não use calculadora."**
(`VAGAS_TESTES.instrucoes({slug: 'caixa'})`). O teste mede a conta que o caixa faz no balcão (troco, desconto, parcela),
com tempo folgado (25 min, sem pressa: velocidade seria teste de atenção). Online e sem supervisão, a regra é de
confiança: o selo diz "online, sem supervisão" e a versão presencial (onda 2) é que garante a regra.

## Chamadas (RPC)

Todas pelo cliente Supabase, `supabase.rpc(nome, args)` (**POST**, o padrão; com GET a transação é só de leitura e o
limite por origem trata como bloqueada). Erro de regra nunca é exceção: volta `{ok: false, erro, codigo, ...}` com o
texto pronto para a tela (os mesmos textos em `VAGAS_TESTES.MENSAGENS`, conferidos pelos testes).

| Função | Quem chama | Devolve (`ok: true`) |
|---|---|---|
| `vagas_testes_catalogo()` | todos (anon e logado) | `{regras: {intervaloDias: 30, toleranciaSegPorQuestao: 10, supervisao: 'online'}, testes: [{slug, nome, descricao, questoes, minutos, validadeMeses, notaMinima, margem, competencias: [{id, nome}], minha?}]}`. Logado: `minha = {aberta: {tentativa, respondidas, total, segundosRestantes} \| null, ultima: {status, nota, data} \| null, podeIniciarEm: ISO \| null, selo \| null}` |
| `vagas_iniciar_tentativa(p_teste text)` | pessoa logada (conta ativa) | `{tentativa: {id, teste, nome, total, respondidas, minutos, segundosRestantes, terminaEm, retomada}}` |
| `vagas_proxima_questao(p_tentativa uuid)` | logado (dono) | `{fim: false, tentativa, numero, total, segundosRestantes, questao: {texto, enunciado, alternativas: [4]}}` ou `{fim: true, tentativa, status, respondidas, total}` |
| `vagas_responder(p_tentativa uuid, p_questao int, p_alternativa int)` | logado (dono) | `p_questao` = número 1..total; `p_alternativa` = posição **mostrada** 0..3. `{respondidas, total, fim, proxima?}` (`proxima` = o mesmo formato da `vagas_proxima_questao`); reenvio: `+ duplicado: true` |
| `vagas_finalizar(p_tentativa uuid)` | logado (dono) | `{resultado: {tentativa, teste, nome, status, acertos, total, nota, margem, notaMinima, porCompetencia: [{id, nome, acertos, total}], selo \| null, podeIniciarEm \| null}}`. Idempotente: chamar com `fim: true`; encerrar antes conta (a tela confirma) |
| `vagas_registrar_sinal(p_tentativa uuid, p_tipo text)` | logado (dono) | `p_tipo` = `'troca_aba'` (saiu da tela) ou `'copiar'` (copiou texto). `{ok: true}` |
| `vagas_meus_selos()` | logado | `{selos: [selo + {exibido}]}` (todos; `exibido` = o que vai no cartão) |
| `vagas_selo_publico(p_codigo text)` | todos (página de conferência) | `{selo}`. Aceita `k7m2-qx9a`, com espaço ou hífen. Sem nome da pessoa |
| `vagas_revogar_selo(p_codigo text, p_motivo text)` | equipe (`e_admin`) | `{ok: true}` |

**Selo** (`selo`): `{codigo, teste, nome, nota (null se revogado), margem: 10, questoes: 15, data: 'AAAA-MM-DD',
validoAte: 'AAAA-MM-DD', supervisao: 'online' | 'presencial', situacao: 'valido' | 'vencido' | 'revogado'}` (`questoes`
= quantas questões a prova daquele selo teve). Código: 8 caracteres de `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sem I, O, 0,
1), mostrado como `K7M2-QX9A` (`formatarCodigo`). Texto na tela: `exibirSelo(selo)` → `linhaNota: 'Nota 82 (±10)'`,
`TEXTO_SELO: 'Habilidade testada · online, sem supervisão'` e a descrição "Teste sobre o básico de …, feito em
DD/MM/AAAA, online e sem supervisão. Nota N de 100 (15 questões; margem de cerca de ±10 pontos)." (texto fixo da
psicologia para a nota; o nº de questões e a margem vêm do selo).

**Códigos de erro** (`codigo`):

| Código | Quando | Texto |
|---|---|---|
| `login` | sem sessão, sessão anônima ou usuário apagado (`sessaoExpirada: true`) | Entre na sua conta para fazer o teste. |
| `so_pessoa` | com a fundação no banco: conta sem linha em `vagas_contas` ou de tipo empresa/operador | Os testes são para a conta de pessoa. Entre com a sua conta de pessoa para fazer o teste. |
| `conta_inativa` | com a fundação no banco: conta de pessoa pendente (e-mail não confirmado) ou suspensa | Sua conta não está ativa. Confirme o e-mail ou fale com a equipe da Gestão sem Caos. |
| `teste_indisponivel` | teste inativo, inexistente ou banco sem questões suficientes | Este teste não está disponível agora. |
| `aguarde` | menos de 30 dias desde o início da anterior que contou (`podeIniciarEm`) | Você fez este teste há menos de 30 dias. Pode fazer de novo a partir de DD/MM/AAAA. |
| `limite_origem` | muitas tentativas novas da mesma conexão | Muitos testes começados a partir desta conexão. Tente de novo mais tarde. |
| `tentativa_inexistente` | id errado ou de outra pessoa | Teste não encontrado. Volte à lista de testes. |
| `encerrada` | responder tentativa fechada (`fim: true`) | Este teste já foi encerrado. |
| `tempo_esgotado` | responder depois do prazo da questão na tela (`fim: true`) | O tempo acabou. As respostas dadas até aqui foram guardadas. |
| `fora_de_ordem` | questão adiantada, que não foi mostrada ou número inválido | Esta questão não está disponível. Siga para a questão atual. |
| `alternativa_invalida` | posição fora de 0..3 | Escolha uma das alternativas. |
| `sinal_invalido` | `p_tipo` desconhecido | Sinal inválido. |
| `selo_inexistente` | código inexistente, mal formado ou origem bloqueada | Selo não encontrado. Confira o código. |
| `sem_permissao` / `motivo` | revogar sem ser da equipe / sem motivo | Só a equipe da Gestão sem Caos pode revogar um selo. / Escreva o motivo da revogação. |

**Fluxo da tela:** catálogo → instruções (`instrucoes(teste)`, com o aviso do que a prova registra e de que encerrar
cedo conta) → `vagas_iniciar_tentativa` → `vagas_proxima_questao` → `vagas_responder` em laço (mostra `proxima`; com
`fim: true` chama `vagas_finalizar`) → resultado (`textoResultado`). O botão "Encerrar" pede confirmação antes de
`vagas_finalizar`. O cronômetro conta a partir de `segundosRestantes` do servidor (`segundosRestantes(estado, agora)`);
ao recarregar a página, `vagas_iniciar_tentativa` retoma (`retomada: true`). Eventos `visibilitychange` (escondeu) e
`copy` chamam `vagas_registrar_sinal`.

## Dados e permissões

- Tabelas `vagas_testes`, `vagas_questoes` (com o gabarito), `vagas_tentativas`, `vagas_tentativa_respostas`,
  `vagas_selos`, todas com RLS. **Nenhuma política em `vagas_questoes`** e nenhuma permissão para anon/authenticated:
  o gabarito só é lido pelas funções do banco. A equipe (`public.e_admin()`) lê tentativas e selos (política de
  leitura) para o painel de revisão.
- Cada resposta guarda a posição mostrada (`alternativa`), a alternativa original (`alternativa_original`, antes de
  embaralhar), se acertou e as horas em que a questão foi mostrada e respondida: é o que a análise de itens usa (p,
  discriminação, distratores, tempo por item), sem dado da pessoa.
- Tudo se liga a `auth.users(id)` com `on delete cascade`: apagar a conta apaga tentativas, respostas e selos.
- **Ganchos para a fundação (20261022):** `vagas_interno.selos_cartao(p_user)` → selos válidos, 1 por teste (maior nota;
  empate, o mais recente), sem `situacao`, para o cartão do perfil (a fundação já chama); `vagas_interno.testes_exportar(p_user)`
  → `{tentativas: [resumo], selos: [...]}` para `vagas_exportar_meus_dados` (LGPD), sem questões nem gabarito (a fundação
  chama por `to_regprocedure`). Só `service_role` executa; a fundação chama de dentro das suas funções `security definer`.
- `versao_banco()` conhece as duas migrações (versão `20261023120001`); `js/api-supabase.js` (`MIGRACOES`,
  `VERSAO_ATUAL`) e `js/api-simulada.js` (`VERSAO_BANCO`) acompanham. A entrada `20261023120001_vagas_questoes` é
  sondada por `exists (select 1 from vagas_questoes where ativa)`: **enquanto a equipe não carregar o banco de questões,
  `versao_banco()` devolve `faltando: ['20261023120001_vagas_questoes']`** e o painel mostra a faixa "banco
  desatualizado". É o sinal de que falta a carga, não um erro. **Na integração com a 20261022:** a entrada da fundação
  entra na lista da `versao_banco` desta migração (que roda depois e a substitui) e em `MIGRACOES`.

## Nota de corte 60 (provisória)

- **Por que 60:** 60 = 9 de 15 questões. Quem só chuta (1 em 4) chega a 9 acertos em cerca de 0,4% das provas; é a
  "média 6" que o público conhece; e as questões cobrem o básico da primeira semana na função (a análise da função de
  cada teste), onde acertar 60% é o mínimo razoável.
- **Provisória:** antes de abrir ao público, **Angoff modificado** com 5 a 8 juízes por teste (pessoas que contratam ou
  supervisionam a função em Boa Vista): para cada questão, "de 100 pessoas minimamente prontas para a função, quantas
  acertam?"; o corte é a média das somas, revisto depois do piloto. Aos **200 resultados** por teste: dificuldade (p),
  discriminação, distratores que ninguém escolhe e DIF por escolaridade; o corte pode mudar com nova versão do teste.
  O novo corte entra em `vagas_testes.nota_minima` (as telas leem do catálogo).
- **Margem ±10:** com 15 questões, o erro de medida de uma nota individual fica em torno de 10 a 12 pontos (desvio da
  binomial: √(p(1−p)/15) ≈ 0,10 a 0,13 entre 50% e 80% de acerto). Por isso o selo mostra "Nota 82 (±10)" e não um
  número seco. Com o piloto, recalcular pelo KR-20 (erro-padrão = DP × √(1 − KR-20)) e ajustar `vagas_testes.margem_nota`.

## Conteúdo: formato e revisão

A cópia privada tem, para cada teste, `<teste>.json` e `<teste>.analise.md` (análise da função com a matriz tarefa ×
competência), mais o `RELATORIO.md` gerado. Cada `<teste>.json`:

```
{ teste, nome, descricao, versao: 'AAAA-MM-vN', ativo, prova: {questoes: 15, minutos},
  competencias: [{id, nome}], tarefas: [{id, nome}],
  questoes: [{ id: 'CAI-001', competencia, tarefa, dificuldade: 1|2|3, grupo?, funcao_alvo,
               texto? (aviso/mensagem a interpretar), enunciado (pergunta terminada em "?"),
               alternativas: [4], correta: 0..3, explicacao (só revisão), fonte_ou_justificativa, conta? }] }
```

- `fonte_ou_justificativa` começa com `Prática:`, `Norma:` (com o número da lei e o artigo: "Norma: Lei 8.078/1990, art.
  49"), `Conta:` ou `Língua:`. O número da lei **nunca** aparece no enunciado nem nas alternativas (nada de decoreba).
- `conta`: obrigatória quando a resposta é um número; o validador confere que dá o valor da alternativa certa.
- **Ids estáveis:** corrigir vírgula ou acento mantém o id. Mudou o sentido, a resposta ou a dificuldade → id novo (o
  antigo sai do JSON e fica **inativo** no banco: as tentativas antigas apontam para ele). Toda mudança sobe `versao`.
- `node scripts/montar-testes.mjs --conteudo <pasta privada>` valida e regrava o `RELATORIO.md` da pasta; `--saida
  <arquivo.sql>` grava o SQL de carga (ver abaixo); `--revisao --conteudo <pasta privada>` imprime no terminal o
  **caderno de revisão com o gabarito** (nunca salvar no repositório nem mandar a quem faz o teste); `--checar` (no `npm
  test`) valida o banco fictício e confere que o espelho continua vazio; `--gerar-ficticio` regrava o banco fictício.

O validador barra (lista completa no cabeçalho do script): menos de 75 questões; célula competência × dificuldade sem o
dobro do que o sorteio tira dela (grupo conta 1); posição da correta desequilibrada; correta mais longa (ou mais curta)
em mais de 40% das questões; enunciado negativo ("exceto", "incorreta", "qual NÃO"); instrução de tendência ("o que você
faria"); "sempre/nunca/jamais" nas alternativas; "todas/nenhuma das anteriores"; frase com mais de 30 palavras; R$ fora
do formato "R$ 1.234,56"; conta que não fecha; personalidade, raciocínio, atenção, gíria, marca real, religião, gênero,
idade ou origem como rótulo de pessoa; tarefa da análise com menos de 3 questões; matriz da análise desatualizada.

**Revisão humana (o que o código não confere), antes de cada versão ir ao ar:**

1. **Especialista da função** (quem contrata ou supervisiona): a situação acontece em Boa Vista? A certa é a prática
   aceita (e não "a da minha loja")? Alguma errada também é defensável? → questão sai ou é reescrita. Itens marcados
   "a conferir por especialista" na `fonte_ou_justificativa` (ex.: nota fiscal e MEI, LC 123/2006, art. 26, § 1º).
2. **Psicologia (com veto):** item de conhecimento e não de jeito de ser; sem pista (tamanho, palavra repetida do
   enunciado, absolutos como "todo/toda/nenhum" também nos distratores, chave como único "Sim"/"Não"); linguagem simples;
   sem viés de gênero, idade, origem, religião ou escolaridade além do necessário; dificuldade marcada coerente.
3. **Norma:** toda `Norma:` conferida no texto atual da lei (CDC, LGPD, Lei 13.455/2017, Código Penal etc.).
4. **Português:** professor(a) de português revisa o teste `portugues` e o texto de todos.
5. Registro da revisão (quem, quando, o que mudou) e nova `versao`.

## Gabarito fora do repositório

**Decisão do integrador:** o conteúdo real nunca entra no repositório (nem em commit antigo: a branch foi refeita sem ele).

- **Cópia-mestre privada:** os 5 `<teste>.json`, os 5 `<teste>.analise.md` e o `RELATORIO.md`, numa pasta fora do
  GitHub (ideal: repositório **privado** só do conteúdo, com histórico, acesso só para quem revisa). O banco de dados
  **não** é cópia-mestre: `vagas_questoes` não guarda `explicacao`, `fonte_ou_justificativa`, `tarefa`, `funcao_alvo`
  nem `conta`.
- **Carga no banco (a cada versão do conteúdo):**
  1. `node scripts/montar-testes.mjs --conteudo <pasta privada> --saida <arquivo fora do repositório>.sql` — valida,
     regrava o `RELATORIO.md` da pasta e grava o SQL de carga (catálogo + questões com gabarito; idempotente; questão que
     saiu do conteúdo fica inativa, nunca apagada). O script recusa `--saida` dentro de `supabase/migrations`.
  2. Supabase → **SQL Editor** → colar o arquivo → **Run** → `select public.versao_banco();` deve vir sem a
     `20261023120001_vagas_questoes` em `faltando`.
  3. **Apagar o arquivo gerado.** Nunca commitar; nunca mandar por canal aberto.
- **No repositório:** `supabase/migrations/20261023120001_vagas_questoes.sql` é um espelho só com comentário (mantém o
  nome para `versao_banco()`/`MIGRACOES` e para a integração GitHub → Supabase, que o aplica sem efeito); `--checar`
  falha se ele ganhar qualquer linha que não seja comentário, ou mencionar carga ou a coluna do gabarito;
  `conteudo/vagas-testes/` está no `.gitignore` (uma cópia local do conteúdo ali nunca é commitada por engano); os
  testes automáticos usam só o banco fictício `tests/fixtures/vagas-testes/`.
- **Defesa em profundidade (recomendado, decisão do dono):** publicar o site do DISC por um workflow do GitHub Actions
  (`actions/upload-pages-artifact`) só com as pastas do site, ou um `_config.yml` com `exclude`, porque `supabase/`,
  `tests/`, `scripts/` e `docs/` já são URLs públicas hoje (sem gabarito, mas sem necessidade de estar no ar).

Quem tem acesso à cópia privada vê o gabarito: acesso só para quem precisa, e o banco de questões cresce (versões novas)
para que o vazamento de uma versão não valha para sempre.

## Pendências

- Juízes (notas F, I e T da análise da função e "necessária?" por questão, Lawshe), piloto e Angoff (corte 60 provisório).
- Onde guardar a cópia privada (repositório privado de conteúdo) e quem tem acesso: decisão do dono.
- Alternativas numéricas: o motor embaralha todas; a recomendação de itens é mostrar números em ordem crescente. Decidir
  com a psicologia (precisaria de um campo `ordem_fixa` na questão e de não embaralhar nesses casos).
- Português: amostra de redação **sem nota**, mostrada à empresa depois do Combinou (onda 2; sem correção automática).
- Versão presencial do selo (`presencial = true`; onda 2): a operação pediu 1 tentativa presencial extra dentro dos 30
  dias (mutirão) e um jeito de o operador marcar "documento conferido" (`vagas_op_marcar_presencial` ou código de sessão
  em `vagas_iniciar_tentativa`); a psicologia apoia com a regra "selo exibido = o presencial, se existir e passar do
  corte; senão o online de maior nota" (hoje: o de maior nota).
- Painel de revisão da equipe: função só para `e_admin` com os agregados por questão (vezes mostrada, % de acerto,
  escolha de cada alternativa original, tempo mediano, correlação item-total), sem pessoa; e a lista de tentativas com
  alertas para decidir revogação. Os dados já são guardados (`vagas_tentativa_respostas`).
- Telas (catálogo, prova, resultado, selo público e painel de revisão da equipe): fora deste pacote.
- Agendamento que fecha tentativas vencidas sem esperar a próxima chamada (`vagas_interno.teste_fechar_vencidas(null)`
  pela `service_role`): opcional, o fechamento já acontece em qualquer consulta da pessoa.
