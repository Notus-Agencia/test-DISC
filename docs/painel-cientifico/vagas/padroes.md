# Painel científico · Vagas sem Caos: padrões operacionais

**Membro:** psicologia · **Data:** 13/10/2026 · **Vale para:** agentes testes, textos, design, fundação, operação e qualquer pessoa que escreva item, tela ou texto da plataforma.
**Base:** `evidencias.md` (mesma pasta). Cada regra aqui é curta e verificável; a evidência está lá. Marcas: [V] confirmado, [S] secundário, [M] memória, [R] recomendação.

---

## 1. Análise da função antes do item (matriz tarefa × competência)

Nenhum banco de questões nasce sem esta matriz. É a validade de conteúdo (Princípios SIOP, 2018 [V]; Standards AERA/APA/NCME, 2014 [M]) e a defesa jurídica contra "teste que exclui por proxy" (Lei 9.029/1995 [V]).

**Passos (1 reunião de 60 a 90 min por função, pode ser por WhatsApp em grupo):**
1. **Juízes:** 2 a 3 empregadores da função em Boa Vista + 1 trabalhador(a) experiente na função + a pessoa que escreve os itens. Registrar nomes (só internamente) e data.
2. **Tarefas:** listar 8 a 15 tarefas que a pessoa faz **na primeira semana** na função (não o que faz depois de um ano). Frase com verbo: "receber o cliente", "conferir o troco", "anotar recado", "registrar venda".
3. **Para cada tarefa, três notas de 1 a 3:** frequência (raro / semanal / diário), importância (erro tolerável / erro custa / erro grave) e **"precisa saber antes de entrar"** (aprende em um dia / em uma semana / precisa trazer). Só entram no teste tarefas com importância ≥ 2 **e** "precisa trazer" ou "aprende em uma semana".
4. **Competências:** agrupar as tarefas que sobraram em 4 a 6 competências (as "competencias" do JSON). Cada competência precisa de pelo menos 2 tarefas.
5. **Peso:** número de itens por competência proporcional a frequência × importância. Registrar no arquivo `conteudo/vagas-testes/<teste>.matriz.md` (tabela tarefa × competência × pesos × juízes × data).
6. **Rastreabilidade:** cada item cita a tarefa que cobre (`funcao_alvo` ou campo `tarefa`). Item sem tarefa na matriz não entra.
7. **Concordância:** cada item passa por 2 juízes que respondem "esta questão é necessária para a função?" (sim / útil / não); item com um "não" sai (lógica do CVR de Lawshe, 1975 [M]).

---

## 2. Redação de itens de múltipla escolha

Adaptado de Haladyna, Downing & Rodriguez (2002, *Applied Measurement in Education*, 15(3), 309–333 [V]); a lista de 31 diretrizes está reordenada e traduzida para o contexto [M para a redação exata de cada diretriz]. **Toda diretriz é verificável no checklist da seção 8.**

### Conteúdo
1. Cada item mede **um** conteúdo e **um** comportamento mental (saber, aplicar, decidir). Não misturar "qual é a regra" com "o que fazer" no mesmo item.
2. Perguntar o que é **importante** para a função (matriz da seção 1), nunca detalhe trivial.
3. Usar **situação concreta** da função para medir aplicação; não só definição.
4. Itens **independentes**: a resposta de um não ajuda nem atrapalha outro; nenhum item usa informação de outro.
5. Evitar conteúdo específico demais (data, número de lei, valor exato que muda) e geral demais ("o que é bom atendimento?").
6. Nenhum item de **opinião** ("o que você acha?"). A chave tem de ser defensável por norma, procedimento ou consenso de 3 juízes.
7. Nenhuma **pegadinha** (exceção obscura, detalhe escondido, "exceto" no fim).
8. Vocabulário do **dia a dia** da função; ver seção 3.

### Formato
9. Formatos aceitos: pergunta direta ou completar frase; **"melhor resposta"** permitido só quando a instrução diz "qual é a melhor atitude".
10. Proibido o formato complexo ("I e II estão certas", "todas as anteriores").
11. Alternativas uma embaixo da outra (o motor já faz).

### Estilo
12. Revisar e corrigir cada item (ortografia, concordância, pontuação).
13. Gramática correta e **consistente entre enunciado e alternativas** (se o enunciado pede "o que fazer", todas as alternativas começam com verbo).
14. **Mínimo de leitura:** enunciado ≤ 35 palavras; alternativa ≤ 15 palavras; nenhum item com mais de 90 palavras no total. **Exceção:** itens "escolha a melhor mensagem" (português/escrita, atendimento/WhatsApp) podem ter alternativas de até 20 palavras, desde que as quatro tenham tamanho parecido (±4 palavras). Itens de interpretação com texto-base: texto ≤ 45 palavras + pergunta ≤ 20.

### Enunciado
15. A instrução está clara no enunciado (o que está sendo perguntado, sem precisar ler as alternativas).
16. A ideia central fica no enunciado, não nas alternativas.
17. Sem enfeite: nada de história que não serve para responder.
18. Enunciado **afirmativo**. "NÃO", "EXCETO", "INCORRETA" são proibidos (nem em maiúsculas).

### Alternativas
19. **4 alternativas** (padrão do motor) ou 3 quando não houver 3 distratores plausíveis (3 opções bastam: Rodriguez, 2005 [V]). Nunca inventar o 4º distrator absurdo só para completar.
20. **Uma só** resposta certa, confirmada por 2 juízes.
21. A posição da certa varia (o motor embaralha; mesmo assim, no JSON, distribuir).
22. Alternativas numéricas em ordem crescente; de tempo, em ordem cronológica.
23. Alternativas **independentes** (não se sobrepõem, não se incluem).
24. Alternativas **homogêneas** em conteúdo e forma gramatical.
25. Alternativas de **comprimento parecido** (a certa não pode ser a mais longa nem a mais detalhada).
26. "Nenhuma das anteriores": só em cálculo, e raro.
27. "Todas as anteriores": proibido.
28. Alternativas afirmativas; sem "não" dentro da alternativa quando possível.
29. **Sem pistas:** sem "sempre/nunca" só na errada, sem palavra do enunciado repetida só na certa, sem par de alternativas opostas em que uma é obviamente a certa, sem alternativa absurda.
30. Todo distrator é **plausível**: alguém que não sabe escolheria.
31. Distratores vêm de **erros típicos** da função (troco errado por conta comum, recado sem telefone, "sim senhor" sem resolver).

### Regras adicionais da plataforma [R]
32. **Instrução de conhecimento**, não de tendência: "O que deve ser feito?", não "O que você faria?" (McDaniel et al., 2007 [V]).
33. **Resistência à busca na internet:** preferir cenário aplicado a fato memorizável (Steger et al., 2020 [V]). Fato puro ("qual lei…") no máximo 10% do banco.
34. Campo `explicacao` obrigatório e curto; nunca aparece durante a prova; pode aparecer na devolutiva depois de 30 dias (decidir com o integrador).
35. Campo `fonte_ou_justificativa`: "Norma: …" (com lei/norma real) ou "Prática: …" (consenso de juízes). "Norma" só com fonte conferível.
36. **Dificuldade alvo** (p esperado na população candidata): nível 1 = 0,80–0,90; nível 2 = 0,60–0,80; nível 3 = 0,40–0,60. Banco: 40% nível 1, 40% nível 2, 20% nível 3. Prova de 15: 6 / 6 / 3, sorteio estratificado por nível **e** por competência.
37. Banco mínimo: 5× a prova por teste (≥ 75) **e** ≥ 12 por competência (para que o sorteio não repita).
38. Cada item tem `id` estável; mudar texto = id novo (versionamento; ver `evidencias.md` §10).

---

## 3. Linguagem

- **Nível de leitura:** 29% da população adulta brasileira é analfabeta funcional (INAF 2018 e 2024 [V]). O alvo é alfabetismo **elementar**: frases de até 20 palavras, ordem direta (sujeito, verbo, objeto), uma ideia por frase, sem oração intercalada, sem gerúndio encadeado, sem sigla sem explicação, números em algarismos, dinheiro como "R$ 12,50".
- **Palavras:** as da função e do comércio local. Se a palavra não aparece em placa de loja, conversa de balcão ou manual simples, trocar. Lista de troca: "efetuar" → "fazer"; "solicitar" → "pedir"; "adquirir" → "comprar"; "mercadoria" → "produto"; "proceder" → "fazer"; "estabelecimento" → "loja/empresa".
- **Nomes de pessoas nos cenários:** evitar; usar "o cliente", "uma cliente", "a pessoa", "o colega". Quando precisar, nomes comuns e variados; nunca nome que marca classe, origem ou religião.
- **Gênero:** linguagem neutra ou alternada por item ("um cliente" / "uma cliente"), sem "o(a)" dentro de alternativa (dificulta leitura); nunca associar gênero a função ou a comportamento.
- **Regionalidade:** cenários reconhecíveis em Boa Vista e no interior (loja, farmácia, mercado, clínica, oficina, lanchonete, pousada); sem referência a transporte, bairro ou costume de outra região; sem gíria.
- **Marcas:** nenhuma (produto, banco, app, loja). "Cartão", "Pix", "maquininha" são genéricos e podem.
- **Pessoas na cena:** sem estereótipo (idoso que "não entende", mulher que "reclama", jovem que "não trabalha", migrante que "não fala"). Pessoa idosa aparece como cliente prioritária (Lei 10.741/2003 [S]), e só.
- **Tom:** respeitoso, sem ironia, sem humor.

---

## 4. Proibições (conteúdo que não entra em item, tela ou texto)

| Proibido | Por quê | Onde está a evidência |
|---|---|---|
| Qualquer item de **personalidade, temperamento, "perfil", valores, motivação** ("você prefere…", "você se considera…") | Técnica psicológica; privativa em seleção (Lei 4.119/62, art. 13 §1º [V]); validade baixa (Morgeson et al., 2007 [V]) | `evidencias.md` §4 |
| **Raciocínio abstrato, lógica, sequências, figuras, analogias** | Teste de inteligência = teste psicológico (Res. CFP 31/2022 [V]); maior impacto adverso (Roth et al., 2001 [V]) | §4, §5 |
| **Atenção, memória, velocidade** ("quantos erros no texto em 30 s") | Mesma razão; penaliza conexão lenta e celular velho | §4 |
| **Itens de tendência** ("o que você faria?") | Mede traço, falseável | §2.2 |
| Estereótipo de **gênero, idade, raça, origem, religião, deficiência, estado civil** | Lei 9.029/95 [V]; CLT art. 373-A [S] | §5 |
| **Marcas** e nomes de empresas reais | Publicidade indevida; vantagem para quem conhece a marca | §3 |
| Conteúdo que exija **escolaridade acima da função** (fração em caixa simples, análise sintática em atendimento) | Impacto adverso sem validade | §5 |
| **Fato memorizável que se acha no Google** como maioria do banco | Cola fácil (Steger et al., 2020 [V]) | §6 |
| **"Pegadinha"**, "exceto", "não", "todas as anteriores" | Haladyna et al., 2002 [V] | §2 |
| **DISC** em qualquer ponto da seleção (cartão, busca, filtro, ranking, logo após o Combinou) | Proposta §6.7; `etica.md` B.8 | §4 |
| Pergunta sobre **saúde, gravidez, antecedentes, religião, sindicato** | LGPD art. 11 [M]; Lei 9.029/95 [V] | — |

---

## 5. Regras do selo

1. **O selo mostra:** nome do teste, data, nota de 0 a 100 **com a margem** ("margem de cerca de ±10 pontos"), código de 8 caracteres, "Habilidade testada · online, sem supervisão", validade (12 meses). Na fase 2, "presencial · documento conferido".
2. **O selo nunca mostra:** "aprovado", "reprovado", "aprovada com louvor", percentil, posição, comparação com outras pessoas, quais questões errou.
3. **Resultado sem selo:** "Ainda sem selo neste teste. Você pode refazer em 30 dias, de graça." + nota por competência como "onde você acertou menos" (descritivo, 3 itens por competência não medem com precisão).
4. **A empresa:** filtra só por "tem selo do teste X"; nunca vê ranking por nota; a nota aparece no cartão com a margem e o aviso "15 questões; não ordena pessoas".
5. **Corte:** 60% provisório; Angoff modificado antes de abrir; revisão aos 200 resultados; nunca corte = Angoff + SEM (`evidencias.md` §7).
6. **Prova:** 15 itens, 6 / 6 / 3 por dificuldade, estratificada por competência; 20 min (25 no caixa); 1 item por tela; sem voltar; tempo por item registrado; sinais registrados nunca anulam sozinhos.
7. **Antes da prova (tela obrigatória):** "Faça sozinho(a), sem consultar. A empresa pode pedir a prova presencial. O teste mede o que você sabe hoje do básico da função; não mede inteligência nem personalidade. Pode refazer em 30 dias."
8. **Devolutiva:** acertos por competência, sem gabarito; link "o que estudar" por competência (texto curto, sem curso pago da plataforma).
9. **Validade do selo:** 12 meses; "vencido" nunca aparece como "reprovado".
10. **Revogação:** só pela equipe, com motivo registrado, e a pessoa é avisada.

---

## 6. Regras de texto (telas, e-mails, WhatsApp, rádio, material de venda)

**Nunca:** promessa de emprego, prazo ou resultado; "aprovado"; "perfil ideal"; "compatibilidade"; "match"; "o teste prevê desempenho"; "currículo verificado"; "validado"; "científico"; "certificado"; "ranking"; "os melhores"; "teste psicológico"; "avaliação"; "Tinder"; nome de agência.

**Frases modelo (copiar como estão):**
- Para quem procura: "Mostre o que você sabe fazer: faça o teste da função no celular e ganhe o selo de habilidade testada."
- Para a empresa: "Veja quem já provou o básico da função: o selo mostra teste, data e nota. A decisão de contratar continua sendo sua."
- Sobre o selo: "Habilidade testada: 15 questões sobre o básico de [função], em [data], online e sem supervisão. Nota [N] de 100 (margem de cerca de ±10)."
- Sobre a ciência: "Testes de conhecimento da função estão entre os métodos de seleção com melhor evidência científica (Schmidt & Hunter, 1998; Sackett et al., 2022)." Só com a citação.
- Sobre limites: "O teste mede conhecimento prático. Não mede inteligência, personalidade nem caráter, e não garante desempenho."
- Sobre o Combinou: "Combinou: os dois lados disseram que querem conversar. Quem decide é a empresa, por pessoas."
- Sobre refazer: "Não conseguiu o selo? Pode refazer depois de 30 dias, de graça."
- Sobre a referência profissional: "Referência profissional: a empresa informa período, função e até 3 pontos observados no trabalho. Só aparece com a sua autorização e você pode ocultar quando quiser."
- Sobre a entrevista: "Depois do Combinou, use o roteiro de entrevista estruturada: as mesmas perguntas para todas as pessoas, com notas por pergunta."

**Textos de venda (script, rádio, boletim) do agente operacao:** "pare de entrevistar quem não sabe o básico" e "contratou e em 15 dias a pessoa não sabia dar o troco?" **ficam**, com um ajuste: nunca seguidos de "o selo garante" ou "com selo isso não acontece". Forma aceita: "o selo mostra quem já sabe o básico; a entrevista e a experiência fazem o resto".

---

## 7. Regras da referência profissional (resumo; detalhe em `evidencias.md` §4A)

1. Só positiva, factual, de empresa verificada, com consentimento prévio da pessoa; ocultável em silêncio (empresa não é avisada da ocultação).
2. Campos: período, função, vínculo, até 3 pontos fortes da **lista fechada de 12** (§4A.4), "recomendaria para" (funções), texto livre opcional ≤ 300 caracteres **só com situação observada**, declaração da empresa.
3. Cartão cego: só "Referência de empresa verificada: sim" (ou "1" / "2+"); pontos fortes e texto só depois do Combinou ou no perfil público escolhido pela pessoa.
4. Sem filtro "tem referência" no MVP; sem estrelas, média, ranking, contagem ordenável.
5. Moderação recusa adjetivos de personalidade isolados, dado sensível, comparação com outra pessoa, negativa disfarçada.

---

## 8. Checklist de revisão (o que eu uso em cada item e em cada texto)

### 8.1 Por item (reprova com qualquer "não")
- [ ] Cita uma tarefa da matriz da função
- [ ] Mede um só conteúdo/comportamento
- [ ] Instrução "o que deve ser feito" (não "o que você faria")
- [ ] Enunciado afirmativo, sem NÃO/EXCETO
- [ ] ≤ 35 palavras no enunciado, ≤ 15 por alternativa, ≤ 90 no total
- [ ] Uma só resposta defensável (norma ou consenso); `fonte_ou_justificativa` preenchida e conferível
- [ ] 3 distratores plausíveis, homogêneos, de tamanho parecido, sem pista
- [ ] Sem "todas/nenhuma das anteriores"
- [ ] Sem marca, sem nome que marca classe/origem/religião, sem estereótipo
- [ ] Sem personalidade, raciocínio abstrato, atenção, memória
- [ ] Não exige escolaridade acima da função
- [ ] Não se resolve com uma busca de 10 s (ou está dentro da cota de 10% de fatos)
- [ ] Vocabulário elementar; frase em ordem direta
- [ ] Dificuldade declarada coerente com o alvo (§2, regra 36)
- [ ] `id` único e estável

### 8.2 Por banco
- [ ] ≥ 75 itens; ≥ 12 por competência; distribuição 40/40/20 por dificuldade
- [ ] Matriz tarefa × competência registrada com juízes e data
- [ ] ≤ 10% de itens de fato puro
- [ ] Chave distribuída entre as 4 posições (±5 itens)
- [ ] Nenhum item depende de outro
- [ ] Nenhum par de itens quase iguais (sorteio pode trazer os dois)

### 8.3 Por texto (tela, e-mail, venda)
- [ ] Nenhuma palavra da lista "Nunca" (§6)
- [ ] Toda afirmação sobre seleção/desempenho tem citação real
- [ ] Linguagem neutra; "Gestão sem Caos"; sem "Tinder"
- [ ] "Decisão humana" explícita onde há seleção
- [ ] Nível de leitura elementar

---

## Referências
As mesmas de `evidencias.md` §12, mais:
- Lawshe, C. H. (1975). A quantitative approach to content validity. *Personnel Psychology, 28*, 563–575. [M]
- Lei 10.741/2003 (Estatuto da Pessoa Idosa) e Lei 10.048/2000 (atendimento prioritário). [S]
