/*
 * Vagas sem Caos — roteiro de entrevista estruturada para a EMPRESA, depois do Combinou (empresa.html#conversa/<id>).
 * Transcrição PALAVRA POR PALAVRA de docs/painel-cientifico/vagas/entrevista-estruturada.md (o site não enxerga docs/):
 * as 8 perguntas com as âncoras de nota, o que não perguntar, o antes e o depois. tests/vagas-empresa.test.js confere que cada
 * texto aqui é igual ao do .md; mudou lá, muda aqui (e o teste avisa).
 * A plataforma não calcula nota nem ordena pessoas: o roteiro é só para a empresa anotar no papel ou no celular.
 * UMD: window.VAGAS_ROTEIRO / module.exports.
 */
(function (root) {
  'use strict';
  var VAGAS_ROTEIRO = {
    titulo: 'Roteiro de entrevista estruturada',
    paraQuem: 'a empresa, depois do "Combinou". Tempo: 20 a 30 minutos. Quem usa: quem vai decidir a contratação; se der, duas pessoas.',
    aviso: 'Este roteiro não substitui a decisão de ninguém. A plataforma não calcula nota, não ordena pessoas e não recomenda contratar. Quem decide é a empresa, por pessoas, e é bom registrar a decisão e o motivo (LGPD, art. 20: a pessoa tem direito a revisão de decisão tomada só por tratamento automatizado).',
    antes: [
      'Diga: "Vou fazer as mesmas perguntas que faço a todas as pessoas para esta vaga e vou anotar. Não tem resposta certa decorada; quero exemplos do que você já fez ou faria."',
      'Tenha a vaga à mão: horário, salário, tarefas. Vai responder a dúvidas no fim.',
      'Não pergunte (Lei 9.029/1995; CLT art. 373-A; LGPD art. 11): idade, estado civil, filhos ou planos de ter, gravidez, religião, cor/raça, orientação sexual, saúde ou doença, antecedentes, se tem processo trabalhista, quem indicou, time de futebol, política, se "tem com quem deixar as crianças". Se a pessoa falar disso, não anote e não use.',
      'Não use o DISC nem qualquer "perfil" nesta etapa.'
    ],
    escolha: 'escolha 6 a 8; as marcadas com ★ são o núcleo',
    instrucao: 'Para cada pergunta: ouça, peça exemplo ("me conte uma vez em que…"), anote o que a pessoa fez (não o que ela "é") e dê a nota de 1 a 5 com a âncora antes de passar à próxima.',
    perguntas: [
      { numero: 1, nucleo: true, titulo: 'Tarefa principal da vaga', tipo: 'situacional',
        texto: "Nesta vaga, [descreva a tarefa mais frequente, ex.: 'você vai atender o balcão e o WhatsApp ao mesmo tempo']. Chega um cliente no balcão e o telefone toca. O que você faz, em que ordem?",
        ancoras: [[1, 'Não sabe por onde começar ou ignora um dos dois.'], [3, 'Resolve um e deixa o outro esperando sem avisar.'],
          [5, 'Prioriza com critério claro (quem está na frente / quem pode esperar), avisa quem espera e retoma.']] },
      { numero: 2, nucleo: true, titulo: 'Experiência com a tarefa', tipo: 'comportamental',
        texto: "Me conte uma situação de um trabalho anterior (ou da sua vida) em que você teve de [tarefa da vaga: 'fechar um caixa' / 'atender alguém irritado' / 'organizar um estoque']. O que você fez e como terminou?",
        ancoras: [[1, 'Não tem exemplo ou descreve de forma vaga ("eu sempre atendo bem").'], [3, 'Exemplo real, mas sem dizer o que fez de concreto nem o resultado.'],
          [5, 'Exemplo concreto, com o que fez passo a passo e o resultado (inclusive se deu errado e o que aprendeu).']] },
      { numero: 3, nucleo: true, titulo: 'Erro e correção', tipo: 'comportamental',
        texto: 'Conte uma vez em que você errou no trabalho ou em uma tarefa importante. O que aconteceu depois?',
        ancoras: [[1, '"Nunca errei" ou culpa só os outros.'], [3, 'Reconhece o erro, mas não diz o que mudou.'],
          [5, 'Reconhece, avisou quem precisava, corrigiu e mudou o jeito de fazer.']] },
      { numero: 4, nucleo: true, titulo: 'Cliente ou colega difícil', tipo: 'situacional',
        texto: 'Uma cliente reclama em voz alta que foi cobrada errado, e você não tem certeza se foi. O que você faz?',
        ancoras: [[1, 'Discute, nega ou manda esperar sem explicação.'], [3, 'Acalma, mas não confere nem encaminha.'],
          [5, 'Ouve, confere o que pode (cupom, sistema), explica, resolve ou chama quem resolve, sem brigar.']] },
      { numero: 5, nucleo: false, titulo: 'Regra e segurança', tipo: 'situacional, adaptar à função',
        texto: "Um colega pede para você [ex.: 'passar uma venda sem registrar' / 'liberar um produto vencido' / 'pular a conferência']. O que você faz?",
        ancoras: [[1, 'Faz o que o colega pediu.'], [3, 'Recusa, mas não sabe explicar por quê nem a quem avisar.'],
          [5, 'Recusa, explica a regra e avisa a pessoa responsável.']] },
      { numero: 6, nucleo: false, titulo: 'Aprender o novo', tipo: 'comportamental',
        texto: 'Conte uma vez em que você teve de aprender algo novo rápido (um sistema, uma máquina, uma rotina). Como fez?',
        ancoras: [[1, 'Não tem exemplo ou dependeu só de alguém ensinar várias vezes.'], [3, 'Aprendeu, mas sem estratégia (tentativa e erro sem anotar).'],
          [5, 'Perguntou, anotou, praticou, conferiu com alguém e passou a fazer sozinho(a) em poucos dias.']] },
      { numero: 7, nucleo: false, titulo: 'Rotina e horário', tipo: 'comportamental',
        texto: 'Como você organizou seus horários no último trabalho ou estudo? Teve alguma dificuldade para chegar no horário e como resolveu?',
        ancoras: [[1, 'Não tem rotina ou relata atrasos sem solução.'], [3, 'Cumpre horário, mas sem plano para imprevisto.'],
          [5, 'Tem rotina, antecipa imprevistos (transporte, chuva) e avisa quando não consegue.']] },
      { numero: 8, nucleo: false, titulo: 'Trabalho com os outros', tipo: 'comportamental',
        texto: 'Conte uma vez em que um colega precisou de ajuda e você estava com a sua tarefa atrasada. O que você fez?',
        ancoras: [[1, 'Não ajudou e não avisou; ou largou a própria tarefa sem avisar.'], [3, 'Ajudou ou não, sem combinar com ninguém.'],
          [5, 'Avaliou, combinou com o colega ou o responsável, e as duas coisas foram resolvidas.']] }
    ],
    especificasTitulo: 'Perguntas específicas da função (opcional, 1 ou 2)',
    especificas: [
      'Caixa: "O cliente paga R$ 50 em uma compra de R$ 37,40. Quanto é o troco? Se o sistema cair, como você registra?" (5 = troco certo + registro manual com conferência)',
      'Vendas: "O cliente quer um produto que acabou. O que você faz?" (5 = oferece alternativa parecida, explica, anota o pedido ou avisa quando chega)',
      'Administrativo: "Chegam três coisas ao mesmo tempo: um boleto que vence hoje, um e-mail do chefe e um cliente na porta. Em que ordem?" (5 = critério claro de prazo/pessoa presente, avisa quem espera)',
      'Português/redação: "Escreva aqui um recado de 3 linhas para o seu chefe avisando que o fornecedor atrasou." (5 = quem, o quê, quando, o que precisa decidir; sem erro que atrapalhe o entendimento)'
    ],
    depois: [
      'Some as notas só para você; não mostre à pessoa. A soma serve para comparar as pessoas nas mesmas perguntas, não para "aprovar".',
      'Pergunte: "Tem alguma dúvida sobre a vaga, o horário ou o salário?" e responda.',
      'Diga quando vai dar retorno. Dê retorno a todo mundo, inclusive a quem não ficou, pela plataforma ("Agora não").',
      'Registre a decisão e o motivo (duas linhas). Isso protege a empresa e a pessoa.',
      'Decida com três fontes, não com uma: selo (conhecimento do básico), entrevista (como a pessoa age) e experiência/referência (o que já fez). Nenhuma delas sozinha prevê desempenho.'
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = VAGAS_ROTEIRO;
  else root.VAGAS_ROTEIRO = VAGAS_ROTEIRO;
})(typeof self !== 'undefined' ? self : this);
