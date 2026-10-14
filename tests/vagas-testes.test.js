'use strict';
// Vagas sem Caos · testes de habilidade (vagas/js/testes.js): código do selo, tempo, nota (a mesma conta do banco), estado da
// prova (uma questão por vez, contagem a partir do tempo do servidor), instruções, mensagens, selo com margem e resultado
// (nunca "aprovado/reprovado"). O banco faz a mesma conta e usa as mesmas mensagens: tests/supabase/vagas_testes.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../vagas/js/testes.js');

const proibidas = (obj) => T.PALAVRAS_PROIBIDAS.filter((p) => JSON.stringify(obj).toLowerCase().includes(p));

test('constantes do selo e do teste', () => {
  assert.equal(T.NOTA_MINIMA, 60);
  assert.equal(T.MARGEM_PADRAO, 10);
  assert.equal(T.INTERVALO_DIAS, 30);
  assert.equal(T.TOLERANCIA_SEG_POR_QUESTAO, 10);
  assert.equal(T.ALFABETO_CODIGO.length, 32);
  assert.doesNotMatch(T.ALFABETO_CODIGO, /[IO01]/, 'sem caracteres ambíguos');
  assert.equal(T.TEXTO_SELO, 'Habilidade testada · online, sem supervisão');
});

test('código do selo: normaliza (minúsculas, hífen, espaços) e formata K7M2-QX9A; inválido vira vazio', () => {
  assert.equal(T.normalizarCodigo(' k7m2-qx9a '), 'K7M2QX9A');
  assert.equal(T.formatarCodigo('K7M2QX9A'), 'K7M2-QX9A');
  assert.equal(T.normalizarCodigo('K7M2QX9'), '', '7 caracteres');
  assert.equal(T.normalizarCodigo('K7M2QX9O'), '', 'letra O não existe no alfabeto');
  assert.equal(T.normalizarCodigo('K7M2QX91'), '', 'algarismo 1 não existe no alfabeto');
  assert.equal(T.formatarCodigo(null), '');
});

test('tempo: relógio mm:ss e por extenso', () => {
  assert.equal(T.formatarTempo(0), '0:00');
  assert.equal(T.formatarTempo(59), '0:59');
  assert.equal(T.formatarTempo(725), '12:05');
  assert.equal(T.formatarTempo(3723), '1:02:03');
  assert.equal(T.formatarTempo(-5), '0:00');
  assert.equal(T.tempoPorExtenso(0), 'O tempo acabou');
  assert.equal(T.tempoPorExtenso(1), 'Falta 1 segundo');
  assert.equal(T.tempoPorExtenso(45), 'Faltam 45 segundos');
  assert.equal(T.tempoPorExtenso(60), 'Falta 1 minuto');
  assert.equal(T.tempoPorExtenso(61), 'Faltam 2 minutos');
  assert.equal(T.tempoPorExtenso(1200), 'Faltam 20 minutos');
});

test('nota: arredonda 100 × acertos ÷ total (meio ponto para cima), como o banco', () => {
  assert.equal(T.calcularNota(9, 15), 60);
  assert.equal(T.calcularNota(8, 15), 53);
  assert.equal(T.calcularNota(1, 15), 7);
  assert.equal(T.calcularNota(15, 15), 100);
  assert.equal(T.calcularNota(0, 15), 0);
  assert.equal(T.calcularNota(1, 8), 13, '12,5 arredonda para 13');
  assert.equal(T.calcularNota(20, 15), 100, 'nunca passa de 100');
  assert.equal(T.calcularNota(3, 0), 0);
});

test('datas: AAAA-MM-DD -> DD/MM/AAAA; data-hora ISO no fuso da cidade (sem fuso: Brasília, UTC−3)', () => {
  assert.equal(T.dataBR('2026-10-13'), '13/10/2026');
  assert.equal(T.dataBR('lixo'), '');
  assert.equal(T.FUSO_PADRAO, 'America/Sao_Paulo');
  assert.equal(T.dataDoIso('2026-10-13T02:59:00.000Z'), '12/10/2026');
  assert.equal(T.dataDoIso('2026-10-13T03:00:00.000Z'), '13/10/2026');
  assert.equal(T.dataDoIso('2026-10-13T03:59:00.000Z', 'America/Manaus'), '12/10/2026', 'o fuso da cidade, quando vier');
  assert.equal(T.hoje(Date.parse('2026-01-01T02:00:00Z')), '2025-12-31');
  assert.equal(T.hoje(Date.parse('2026-01-01T03:00:00Z')), '2026-01-01');
  assert.equal(T.hojeBoaVista, T.hoje, 'nome antigo, mesmo comportamento');
});

test('estado da prova: uma questão por vez; o tempo conta a partir do valor do servidor', () => {
  let e = T.novoEstado({ ok: true, tentativa: { id: 'abc', teste: 'caixa', nome: 'Caixa e matemática prática', total: 15,
    respondidas: 0, segundosRestantes: 1500, retomada: false } }, 1000);
  assert.deepEqual([e.tentativa, e.total, e.numero, e.fim, e.questao], ['abc', 15, 1, false, null]);
  e = T.aplicarQuestao(e, { ok: true, fim: false, tentativa: 'abc', numero: 1, total: 15, segundosRestantes: 1498,
    questao: { texto: '', enunciado: 'Qual é o troco?', alternativas: ['R$ 1,00', 'R$ 2,00', 'R$ 3,00', 'R$ 4,00'] } }, 10000);
  assert.equal(e.questao.enunciado, 'Qual é o troco?');
  assert.equal(T.segundosRestantes(e, 10000), 1498);
  assert.equal(T.segundosRestantes(e, 20500), 1488, 'conta 10 s passados no aparelho');
  assert.equal(T.segundosRestantes(e, 10000 + 2000 * 1000), 0, 'nunca negativo');
  assert.equal(T.segundosRestantes(e, 5000), 1498, 'relógio do aparelho voltando não aumenta o tempo');
  assert.deepEqual(T.progresso(e), { numero: 1, total: 15, respondidas: 0, percentual: 0, texto: 'Questão 1 de 15' });

  const prox = { ok: true, respondidas: 1, total: 15, fim: false, proxima: { ok: true, fim: false, numero: 2, total: 15,
    segundosRestantes: 1470, questao: { texto: 'Aviso', enunciado: 'E agora?', alternativas: ['a', 'b', 'c', 'd'] } } };
  const e2 = T.aplicarResposta(e, prox, 40000);
  assert.deepEqual([e2.numero, e2.respondidas, e2.questao.texto, e2.segundosServidor, e2.recebidaEm], [2, 1, 'Aviso', 1470, 40000]);
  assert.equal(e.numero, 1, 'o estado anterior não muda');
  assert.equal(T.progresso(e2).percentual, 7);

  const fim = T.aplicarResposta(e2, { ok: true, respondidas: 15, total: 15, fim: true }, 50000);
  assert.deepEqual([fim.fim, fim.questao, T.segundosRestantes(fim, 50000)], [true, null, 0]);
  const esgotado = T.aplicarResposta(e2, { ok: false, codigo: 'tempo_esgotado', erro: 'O tempo acabou.', fim: true }, 60000);
  assert.equal(esgotado.fim, true);
  const erroComum = T.aplicarResposta(e2, { ok: false, codigo: 'alternativa_invalida', erro: 'Escolha uma das alternativas.' }, 60000);
  assert.deepEqual([erroComum.fim, erroComum.numero], [false, 2], 'erro sem fim não muda a questão');
  const acabou = T.aplicarQuestao(e2, { ok: true, fim: true, status: 'tempo_esgotado', respondidas: 4 }, 70000);
  assert.deepEqual([acabou.fim, acabou.status, acabou.respondidas], [true, 'tempo_esgotado', 4]);
});

test('instruções: uma por vez, sem voltar, tempo, sozinho(a), não mede inteligência; caixa: papel sim, calculadora não', () => {
  const at = T.instrucoes({ slug: 'atendimento', nome: 'Atendimento e recepção', questoes: 15, minutos: 20 });
  const cx = T.instrucoes({ slug: 'caixa', nome: 'Caixa e matemática prática', questoes: 15, minutos: 25 });
  assert.match(at.join(' '), /São 15 questões sobre o básico de atendimento e recepção, uma por vez\. Não dá para voltar\./);
  assert.match(at.join(' '), /Você tem 20 minutos/);
  assert.match(at.join(' '), /Faça sozinho\(a\), sem consultar/);
  assert.match(at.join(' '), /Não mede inteligência nem personalidade/);
  assert.match(at.join(' '), /refazer em 30 dias, de graça/);
  assert.match(at.join(' '), /Com nota 60 ou mais, você ganha o selo/);
  assert.match(at.join(' '), /Se você encerrar antes de responder tudo, a tentativa conta: o que ficou sem resposta vale como erro\./);
  // LGPD (art. 6º, VI): a pessoa sabe o que a prova registra antes de começar; a frase é informativa (sem tom de punição) e
  // diz que o relógio continua quando ela sai (revisão de UX, fase C).
  assert.match(at.join(' '), /Se você sair da prova \(para atender uma ligação, por exemplo\), o relógio continua\. Registramos o tempo de cada questão, quando você sai da tela e quando copia texto\. Sozinho, esse registro não muda a sua nota nem tira o seu selo\./);
  assert.ok(!/presencial|antes de qualquer decisão/.test(at.join(' ')), 'psicologia (revisão C 2.7)');
  assert.match(at.join(' '), /Se a internet cair, entre de novo e continue de onde parou, no tempo que sobrou\./);
  assert.ok(!at.join(' ').includes('calculadora'));
  assert.match(cx.join(' '), /Você tem 25 minutos/);
  assert.match(cx.join(' '), /Pode usar papel e caneta para as contas\. Não use calculadora\./);
  assert.ok(cx.indexOf('Pode usar papel e caneta para as contas. Não use calculadora.') > cx.findIndex((l) => /Faça sozinho/.test(l)), 'depois da regra de fazer sozinho(a)');
  // A nota mínima vem do catálogo (o Angoff pode mudá-la no banco); sem ela, a constante.
  const angoff = T.instrucoes({ slug: 'vendas', nome: 'Vendas no varejo', questoes: 20, minutos: 20, notaMinima: 67 });
  assert.match(angoff.join(' '), /São 20 questões/);
  assert.match(angoff.join(' '), /Com nota 67 ou mais/);
  assert.deepEqual(proibidas(at.concat(cx, angoff)), []);
});

test('mensagens de erro: a do servidor primeiro; código conhecido; desconhecido; sem rede', () => {
  assert.equal(T.mensagemErro({ ok: false, erro: 'Texto do servidor.', codigo: 'login' }), 'Texto do servidor.');
  assert.equal(T.mensagemErro('so_pessoa'), 'Os testes são para a conta de pessoa. Entre com a sua conta de pessoa para fazer o teste.');
  assert.equal(T.mensagemErro('conta_inativa'), 'Sua conta não está ativa. Confirme o e-mail ou fale com a equipe da Gestão sem Caos.');
  assert.equal(T.mensagemErro({ ok: false, codigo: 'selo_inexistente' }), 'Selo não encontrado. Confira o código.');
  assert.equal(T.mensagemErro('rede'), 'Sem conexão. Confira a internet e tente de novo. O tempo do teste continua contando.');
  assert.equal(T.mensagemErro('???'), T.MENSAGENS.desconhecido);
  assert.equal(T.mensagemErro(null), T.MENSAGENS.desconhecido);
});

test('selo: nota com margem, "online, sem supervisão", validade, vencido, cancelado e presencial; nunca "aprovado"', () => {
  const selo = { codigo: 'K7M2QX9A', teste: 'atendimento', nome: 'Atendimento e recepção', nota: 82, margem: 10,
    data: '2026-10-13', validoAte: '2027-10-13', supervisao: 'online', situacao: 'valido' };
  const v = T.exibirSelo(selo, '2026-11-01');
  assert.equal(v.titulo, 'Atendimento e recepção');
  assert.equal(v.codigo, 'K7M2-QX9A');
  assert.equal(v.linhaNota, 'Nota 82 (±10)');
  assert.equal(v.descricao, 'Teste sobre o básico de atendimento e recepção, feito em 13/10/2026, online e sem supervisão. Nota 82 de 100 (15 questões; margem de cerca de ±10 pontos).');
  assert.deepEqual([v.data, v.validade, v.situacao, v.rotuloSituacao, v.modalidade],
    ['13/10/2026', 'Vale até 13/10/2027', 'valido', 'Válido', 'Online, sem supervisão']);
  assert.equal(T.exibirSelo(selo, '2027-10-14').situacao, 'vencido', 'vencido pela data, mesmo sem o servidor dizer');
  assert.equal(T.exibirSelo(Object.assign({}, selo, { situacao: 'vencido' }), '2026-11-01').rotuloSituacao, 'Vencido');
  const rev = T.exibirSelo(Object.assign({}, selo, { situacao: 'revogado', nota: null }), '2026-11-01');
  // Psicologia (revisão C 2.6): "sem validade", nunca "cancelado" (soa como fraude a quem confere).
  assert.deepEqual([rev.situacao, rev.nota, rev.linhaNota, rev.rotuloSituacao], ['revogado', null, '', 'Sem validade']);
  assert.equal(rev.descricao, 'Este selo não vale mais. Se quiser, peça à pessoa para fazer o teste de novo.');
  const pres = T.exibirSelo(Object.assign({}, selo, { supervisao: 'presencial', margem: undefined }), '2026-11-01');
  assert.equal(pres.modalidade, 'Presencial, com documento conferido');
  assert.equal(pres.linhaNota, 'Nota 82 (±10)', 'sem margem do servidor, usa a padrão');
  // O nº de questões vem do selo (a prova pode mudar de tamanho); sem ele, 15.
  const vinte = T.exibirSelo(Object.assign({}, selo, { questoes: 20, margem: 8 }), '2026-11-01');
  assert.match(vinte.descricao, /Nota 82 de 100 \(20 questões; margem de cerca de ±8 pontos\)\./);
  assert.deepEqual(proibidas([v, rev, pres]), []);
});

test('resultado: com e sem selo, onde acertou menos, tempo esgotado e data para refazer', () => {
  const base = { tentativa: 't', teste: 'caixa', nome: 'Caixa e matemática prática', status: 'concluida', acertos: 11,
    total: 15, nota: 73, margem: 10, notaMinima: 60, podeIniciarEm: '2026-11-12T15:00:00.000Z',
    porCompetencia: [{ id: 'troco', nome: 'Troco e contagem de dinheiro', acertos: 3, total: 3 },
      { id: 'porcentagem', nome: 'Porcentagem e desconto', acertos: 1, total: 3 },
      { id: 'juros', nome: 'Juros e parcelamento', acertos: 2, total: 3 },
      { id: 'pagamentos', nome: 'Pix, cartão e dinheiro', acertos: 3, total: 3 },
      { id: 'fechamento', nome: 'Abertura, fechamento e conferência do caixa', acertos: 2, total: 3 }],
    selo: { codigo: 'K7M2QX9A', nota: 73, margem: 10, data: '2026-10-13', validoAte: '2027-10-13' } };
  const com = T.textoResultado(base);
  assert.equal(com.titulo, 'Você ganhou o selo de Caixa e matemática prática.');
  // No resultado, a margem por extenso (o "±" sozinho é opaco para quem lê pouco).
  assert.equal(com.linhas[0], 'Você acertou 11 de 15 questões. Nota 73 (margem de cerca de 10 pontos, para mais ou para menos).');
  assert.match(com.linhas.join(' '), /O selo vale até 13\/10\/2027\. Código para conferir: K7M2-QX9A\./);
  assert.equal(com.refazer, 'Você pode refazer este teste a partir de 12/11/2026, de graça.');
  assert.deepEqual(com.estudar, ['Porcentagem e desconto']);
  assert.equal(com.competencias[0].texto, 'Troco e contagem de dinheiro: 3 de 3');

  const sem = T.textoResultado(Object.assign({}, base, { selo: null, nota: 40, acertos: 6, status: 'tempo_esgotado' }));
  assert.equal(sem.titulo, 'Ainda sem selo neste teste.');
  assert.match(sem.linhas.join(' '), /O tempo acabou antes do fim; as questões sem resposta contaram como erro\./);
  assert.match(sem.linhas.join(' '), /O selo sai a partir da nota 60\./);
  const tudoCerto = T.textoResultado(Object.assign({}, base, { porCompetencia: base.porCompetencia.map((c) => Object.assign({}, c, { acertos: c.total })) }));
  assert.deepEqual(tudoCerto.estudar, [], 'sem "onde acertou menos" quando acertou tudo');
  assert.deepEqual(proibidas([com, sem]), []);
});

test('situação do teste no catálogo: fazer, continuar, aguardar, refazer', () => {
  const agora = Date.parse('2026-10-20T12:00:00Z');
  assert.deepEqual(T.situacaoDoTeste({ slug: 'vendas' }, agora), { acao: 'fazer', texto: 'Fazer o teste (grátis)' });
  assert.deepEqual(T.situacaoDoTeste({ minha: { aberta: { tentativa: 'x', respondidas: 14, total: 15 } } }, agora),
    { acao: 'continuar', texto: 'Continuar o teste (falta 1 questão)' });
  assert.equal(T.situacaoDoTeste({ minha: { aberta: { respondidas: 3, total: 15 } } }, agora).texto, 'Continuar o teste (faltam 12 questões)');
  assert.deepEqual(T.situacaoDoTeste({ minha: { aberta: null, podeIniciarEm: '2026-11-12T15:00:00.000Z', ultima: { nota: 40 } } }, agora),
    { acao: 'aguardar', texto: 'Você pode fazer de novo a partir de 12/11/2026.' });
  assert.equal(T.situacaoDoTeste({ minha: { aberta: null, podeIniciarEm: '2026-10-01T00:00:00.000Z', ultima: { nota: 40 } } }, agora).acao, 'refazer');
  assert.equal(T.situacaoDoTeste({ minha: { aberta: null, podeIniciarEm: null, ultima: null, selo: { nota: 90 } } }, agora).acao, 'refazer');
});
