/*
 * Vagas sem Caos · testes de habilidade (Gestão sem Caos) — módulo PURO (sem DOM, sem rede), UMD: window.VAGAS_TESTES /
 * module.exports. As regras de VERDADE (sorteio, gabarito, tempo, nota, selo) rodam no banco:
 * supabase/migrations/20261023120000_vagas_testes.sql. Este arquivo só formata, guarda o estado da tela e escreve os textos.
 * Contrato das chamadas: docs/VAGAS-TESTES.md. tests/supabase/vagas_testes.test.js confere as constantes e a nota contra o banco.
 *
 * API:
 *   NOTA_MINIMA (60, provisória: Angoff antes de abrir; a tela usa teste.notaMinima do catálogo quando vier), MARGEM_PADRAO (10),
 *   INTERVALO_DIAS (30), TOLERANCIA_SEG_POR_QUESTAO (10 s depois do fim para a questão que já está na tela), ALFABETO_CODIGO,
 *   PALAVRAS_PROIBIDAS (nunca aparecem no selo nem no resultado)
 *   normalizarCodigo(c) -> 'K7M2QX9A' | ''     formatarCodigo(c) -> 'K7M2-QX9A' | ''
 *   formatarTempo(seg) -> '12:05' (ou '1:02:03')     tempoPorExtenso(seg) -> 'Faltam 12 minutos' | 'Falta 1 minuto' | …
 *   calcularNota(acertos, total) -> 0–100 (a mesma conta do banco: arredonda 100 × acertos ÷ total)
 *   dataBR('2026-10-13') -> '13/10/2026'    dataDoIso('2026-10-13T03:00:00.000Z', fuso?) -> '13/10/2026' (fuso da cidade — o campo
 *   "fuso" dela —; sem fuso, o horário de Brasília, America/Sao_Paulo, como o banco)    hoje(agoraMs?, fuso?) -> 'AAAA-MM-DD'
 *   (hojeBoaVista: nome antigo de hoje(), mantido só para quem já chamava; usa o mesmo fuso padrão)
 *   novoEstado(respostaIniciar, agoraMs) -> estado da prova
 *   aplicarQuestao(estado, respostaProximaQuestao, agoraMs) -> estado com a questão atual (ou fim)
 *   aplicarResposta(estado, respostaResponder, agoraMs) -> estado com a próxima questão (ou fim)
 *   segundosRestantes(estado, agoraMs) -> segundos (conta a partir do valor que o SERVIDOR mandou; o relógio do aparelho
 *                                         só mede o tempo passado desde a última resposta do servidor)
 *   progresso(estado) -> {numero, total, respondidas, percentual, texto: 'Questão 3 de 15'}
 *   instrucoes(teste) -> [frases] (tela antes de começar: regras, aviso do que a prova registra (LGPD), encerrar cedo conta;
 *                          caixa: papel e caneta sim, calculadora não)
 *   AVISO_SUPERVISAO, TEXTO_SELO, mensagemErro(respostaOuCodigo) -> texto
 *   exibirSelo(selo, hojeIso?) -> {titulo, nota, linhaNota, descricao, data, validade, situacao, rotuloSituacao, modalidade, codigo}
 *   textoResultado(resultado) -> {titulo, nota, linhas, competencias, estudar, refazer}
 *   situacaoDoTeste(itemDoCatalogo, agoraMs) -> {acao: 'fazer'|'continuar'|'aguardar'|'refazer', texto}
 *
 * Estado da prova: {tentativa, teste, nome, total, respondidas, numero, questao: {texto, enunciado, alternativas} | null,
 *   segundosServidor, recebidaEm, fim, status}
 */
(function (root) {
  'use strict';

  var NOTA_MINIMA = 60;
  var MARGEM_PADRAO = 10;
  var INTERVALO_DIAS = 30;
  var TOLERANCIA_SEG_POR_QUESTAO = 10;   // a questão que já está na tela é aceita até maior(fim, hora em que apareceu) + 10 s
  var ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // Sem fuso da cidade: horário de Brasília (o mesmo padrão do banco, vagas_interno.fuso_conta). Nenhuma cidade fixa aqui.
  var FUSO_PADRAO = 'America/Sao_Paulo';
  // O selo e o resultado nunca falam em aprovação nem comparam pessoas (padrões do painel científico, §5).
  var PALAVRAS_PROIBIDAS = ['aprovad', 'reprovad', 'percentil', 'ranking', 'melhor que', 'pior que'];

  var AVISO_SUPERVISAO = 'Online, sem supervisão';
  var TEXTO_SELO = 'Habilidade testada · online, sem supervisão';

  var MENSAGENS = {
    login: 'Entre na sua conta para fazer o teste.',
    so_pessoa: 'Os testes são para a conta de pessoa. Entre com a sua conta de pessoa para fazer o teste.',
    conta_inativa: 'Sua conta não está ativa. Confirme o e-mail ou fale com a equipe da Gestão sem Caos.',
    teste_indisponivel: 'Este teste não está disponível agora.',
    aguarde: 'Você fez este teste há menos de 30 dias.',
    limite_origem: 'Muitos testes começados a partir desta conexão. Tente de novo mais tarde.',
    tentativa_inexistente: 'Teste não encontrado. Volte à lista de testes.',
    encerrada: 'Este teste já foi encerrado.',
    tempo_esgotado: 'O tempo acabou. As respostas dadas até aqui foram guardadas.',
    fora_de_ordem: 'Esta questão não está disponível. Siga para a questão atual.',
    alternativa_invalida: 'Escolha uma das alternativas.',
    sinal_invalido: 'Sinal inválido.',
    selo_inexistente: 'Selo não encontrado. Confira o código.',
    sem_permissao: 'Só a equipe da Gestão sem Caos pode revogar um selo.',
    motivo: 'Escreva o motivo da revogação.',
    rede: 'Sem conexão. Confira a internet e tente de novo. O tempo do teste continua contando.',
    desconhecido: 'Algo deu errado. Tente de novo em instantes.'
  };

  function inteiro(v) {
    var n = Number(v);
    return isFinite(n) ? Math.trunc(n) : 0;
  }

  function normalizarCodigo(c) {
    var s = String(c == null ? '' : c).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.length !== 8) return '';
    for (var i = 0; i < s.length; i++) if (ALFABETO_CODIGO.indexOf(s.charAt(i)) === -1) return '';
    return s;
  }

  function formatarCodigo(c) {
    var s = normalizarCodigo(c);
    return s ? s.slice(0, 4) + '-' + s.slice(4) : '';
  }

  function doisDigitos(n) { return (n < 10 ? '0' : '') + n; }

  function formatarTempo(seg) {
    var s = Math.max(0, inteiro(seg));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var r = s % 60;
    return h > 0 ? h + ':' + doisDigitos(m) + ':' + doisDigitos(r) : m + ':' + doisDigitos(r);
  }

  function tempoPorExtenso(seg) {
    var s = Math.max(0, inteiro(seg));
    if (s === 0) return 'O tempo acabou';
    if (s < 60) return s === 1 ? 'Falta 1 segundo' : 'Faltam ' + s + ' segundos';
    var m = Math.ceil(s / 60);
    return m === 1 ? 'Falta 1 minuto' : 'Faltam ' + m + ' minutos';
  }

  // Igual ao banco: round(100.0 * acertos / total), meio ponto arredondado para cima.
  function calcularNota(acertos, total) {
    var t = inteiro(total);
    if (t <= 0) return 0;
    var a = Math.min(Math.max(inteiro(acertos), 0), t);
    return Math.floor((100 * a) / t + 0.5 + 1e-9);
  }

  function dataBR(aaaaMmDd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(aaaaMmDd || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
  }

  // 'AAAA-MM-DD' de um instante no fuso pedido (Intl; sem Intl de fusos, UTC−3).
  function dataNoFuso(t, fuso) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: fuso || FUSO_PADRAO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
    } catch (e) {
      return new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10);
    }
  }

  function dataDoIso(iso, fuso) {
    var t = Date.parse(String(iso || ''));
    if (!isFinite(t)) return '';
    return dataBR(dataNoFuso(t, fuso));
  }

  function hoje(agoraMs, fuso) {
    return dataNoFuso(typeof agoraMs === 'number' ? agoraMs : Date.now(), fuso);
  }
  var hojeNoFuso = hoje;
  var hojeBoaVista = hoje;

  // ---------------------------------------------------------------- estado da prova

  function novoEstado(resposta, agoraMs) {
    var t = (resposta && resposta.tentativa) || {};
    return {
      tentativa: String(t.id || ''), teste: String(t.teste || ''), nome: String(t.nome || ''),
      total: inteiro(t.total), respondidas: inteiro(t.respondidas), numero: inteiro(t.respondidas) + 1,
      questao: null, segundosServidor: Math.max(0, inteiro(t.segundosRestantes)), recebidaEm: agoraMs,
      retomada: !!t.retomada, fim: false, status: 'aberta'
    };
  }

  function copiar(estado) {
    var e = {};
    for (var k in estado) if (Object.prototype.hasOwnProperty.call(estado, k)) e[k] = estado[k];
    return e;
  }

  function aplicarQuestao(estado, resposta, agoraMs) {
    var e = copiar(estado);
    if (!resposta || resposta.ok !== true) return e;
    if (resposta.fim) {
      e.fim = true;
      e.questao = null;
      if (resposta.status) e.status = String(resposta.status);
      if (resposta.respondidas != null) e.respondidas = inteiro(resposta.respondidas);
      return e;
    }
    var q = resposta.questao || {};
    e.numero = inteiro(resposta.numero);
    e.total = inteiro(resposta.total) || e.total;
    e.respondidas = e.numero - 1;
    e.questao = {
      texto: String(q.texto || ''), enunciado: String(q.enunciado || ''),
      alternativas: (Array.isArray(q.alternativas) ? q.alternativas : []).map(String)
    };
    e.segundosServidor = Math.max(0, inteiro(resposta.segundosRestantes));
    e.recebidaEm = agoraMs;
    e.fim = false;
    return e;
  }

  function aplicarResposta(estado, resposta, agoraMs) {
    var e = copiar(estado);
    if (!resposta) return e;
    if (resposta.ok !== true) {
      if (resposta.fim) { e.fim = true; e.questao = null; }
      return e;
    }
    e.respondidas = inteiro(resposta.respondidas);
    if (resposta.fim) { e.fim = true; e.questao = null; return e; }
    if (resposta.proxima) return aplicarQuestao(e, resposta.proxima, agoraMs);
    return e;
  }

  function segundosRestantes(estado, agoraMs) {
    if (!estado || estado.fim) return 0;
    var passados = Math.floor(Math.max(0, (agoraMs - estado.recebidaEm)) / 1000);
    return Math.max(0, estado.segundosServidor - passados);
  }

  function progresso(estado) {
    var total = Math.max(0, inteiro(estado && estado.total));
    var resp = Math.min(Math.max(0, inteiro(estado && estado.respondidas)), total);
    var numero = Math.min(resp + 1, total);
    return {
      numero: numero, total: total, respondidas: resp,
      percentual: total ? Math.round((100 * resp) / total) : 0,
      texto: total ? 'Questão ' + numero + ' de ' + total : ''
    };
  }

  // ---------------------------------------------------------------- textos

  function minuscula(s) {
    s = String(s || '');
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  function instrucoes(teste) {
    var t = teste || {};
    var n = inteiro(t.questoes) || 15;
    var min = inteiro(t.minutos) || 20;
    var linhas = [
      'São ' + n + ' questões sobre o básico de ' + minuscula(t.nome || 'a função') + ', uma por vez. Não dá para voltar.',
      'Você tem ' + min + ' minutos. O tempo começa quando você tocar em "Começar" e não para, nem se a internet cair.',
      'Se a internet cair, entre de novo: o teste continua de onde parou.',
      'Se você encerrar antes de responder tudo, a tentativa conta: o que ficou sem resposta vale como erro.',
      'Faça sozinho(a), sem consultar. A empresa pode pedir a prova presencial.',
      'Durante a prova, registramos o tempo de cada questão, a saída da tela e a cópia de texto. Ninguém perde o selo só por isso: uma pessoa da equipe revisa antes de qualquer decisão.',
      'O teste mede o que você sabe hoje do básico da função. Não mede inteligência nem personalidade.',
      'Com nota ' + (inteiro(t.notaMinima) || NOTA_MINIMA) + ' ou mais, você ganha o selo, que vale 12 meses. Você pode refazer em ' + INTERVALO_DIAS + ' dias, de graça.'
    ];
    if (t.slug === 'caixa') linhas.splice(5, 0, 'Pode usar papel e caneta para as contas. Não use calculadora.');
    return linhas;
  }

  function mensagemErro(r) {
    if (typeof r === 'string') return MENSAGENS[r] || MENSAGENS.desconhecido;
    if (r && typeof r.erro === 'string' && r.erro.trim()) return r.erro;
    if (r && r.codigo && MENSAGENS[r.codigo]) return MENSAGENS[r.codigo];
    return MENSAGENS.desconhecido;
  }

  function linhaNota(nota, margem) {
    return 'Nota ' + inteiro(nota) + ' (±' + (margem == null ? MARGEM_PADRAO : inteiro(margem)) + ')';
  }

  var ROTULOS_SITUACAO = { valido: 'Válido', vencido: 'Vencido', revogado: 'Cancelado pela equipe' };

  function exibirSelo(selo, hojeIso) {
    var s = selo || {};
    var hoje = hojeIso || hojeNoFuso();
    var situacao = s.situacao === 'revogado' ? 'revogado'
      : (s.situacao === 'vencido' || (s.validoAte && String(s.validoAte) < hoje)) ? 'vencido' : 'valido';
    var margem = s.margem == null ? MARGEM_PADRAO : inteiro(s.margem);
    var questoes = inteiro(s.questoes) || 15;
    var temNota = situacao !== 'revogado' && s.nota != null;
    var presencial = s.supervisao === 'presencial';
    return {
      titulo: String(s.nome || ''), codigo: formatarCodigo(s.codigo),
      nota: temNota ? inteiro(s.nota) : null, margem: margem,
      linhaNota: temNota ? linhaNota(s.nota, margem) : '',
      descricao: temNota
        ? 'Teste sobre o básico de ' + minuscula(s.nome) + ', feito em ' + dataBR(s.data) + ', ' +
          (presencial ? 'presencial, com documento conferido' : 'online e sem supervisão') + '. Nota ' + inteiro(s.nota) +
          ' de 100 (' + questoes + ' questões; margem de cerca de ±' + margem + ' pontos).'
        : 'Este selo foi cancelado pela equipe da Gestão sem Caos.',
      data: dataBR(s.data), validade: s.validoAte ? 'Vale até ' + dataBR(s.validoAte) : '',
      situacao: situacao, rotuloSituacao: ROTULOS_SITUACAO[situacao],
      modalidade: presencial ? 'Presencial, com documento conferido' : AVISO_SUPERVISAO
    };
  }

  function textoResultado(res) {
    var r = res || {};
    var comps = Array.isArray(r.porCompetencia) ? r.porCompetencia : [];
    var competencias = comps.map(function (c) {
      return { nome: String(c.nome || c.id || ''), acertos: inteiro(c.acertos), total: inteiro(c.total),
        texto: String(c.nome || c.id || '') + ': ' + inteiro(c.acertos) + ' de ' + inteiro(c.total) };
    });
    // "Onde você acertou menos": descritivo (3 questões por competência não medem com precisão).
    var menor = competencias.reduce(function (m, c) {
      var p = c.total ? c.acertos / c.total : 1;
      return p < m ? p : m;
    }, 1);
    var estudar = competencias.filter(function (c) { return c.total && c.acertos / c.total === menor && menor < 1; })
      .map(function (c) { return c.nome; });
    var refazer = r.podeIniciarEm ? 'Você pode refazer este teste a partir de ' + dataDoIso(r.podeIniciarEm) + ', de graça.' : '';
    var margem = r.margem == null ? MARGEM_PADRAO : inteiro(r.margem);
    var linhas = ['Você acertou ' + inteiro(r.acertos) + ' de ' + inteiro(r.total) + ' questões. ' + linhaNota(r.nota, margem) + '.'];
    if (r.status === 'tempo_esgotado') linhas.push('O tempo acabou antes do fim; as questões sem resposta contaram como erro.');
    var titulo;
    if (r.selo) {
      titulo = 'Você ganhou o selo de ' + String(r.nome || '') + '.';
      linhas.push('O selo vale até ' + dataBR(r.selo.validoAte) + '. Código para conferir: ' + formatarCodigo(r.selo.codigo) + '.');
    } else {
      titulo = 'Ainda sem selo neste teste.';
      linhas.push('O selo sai a partir da nota ' + inteiro(r.notaMinima || NOTA_MINIMA) + '.');
    }
    if (refazer) linhas.push(refazer);
    return { titulo: titulo, nota: inteiro(r.nota), linhas: linhas, competencias: competencias, estudar: estudar, refazer: refazer };
  }

  function situacaoDoTeste(item, agoraMs) {
    var m = (item && item.minha) || null;
    if (m && m.aberta) {
      var faltam = Math.max(0, inteiro(m.aberta.total) - inteiro(m.aberta.respondidas));
      return { acao: 'continuar', texto: 'Continuar o teste (falta' + (faltam === 1 ? '' : 'm') + ' ' + faltam + ' quest' + (faltam === 1 ? 'ão' : 'ões') + ')' };
    }
    if (m && m.podeIniciarEm && Date.parse(m.podeIniciarEm) > (typeof agoraMs === 'number' ? agoraMs : Date.now())) {
      return { acao: 'aguardar', texto: 'Você pode fazer de novo a partir de ' + dataDoIso(m.podeIniciarEm) + '.' };
    }
    if (m && (m.selo || m.ultima)) return { acao: 'refazer', texto: 'Refazer o teste (grátis)' };
    return { acao: 'fazer', texto: 'Fazer o teste (grátis)' };
  }

  var VAGAS_TESTES = {
    NOTA_MINIMA: NOTA_MINIMA, MARGEM_PADRAO: MARGEM_PADRAO, INTERVALO_DIAS: INTERVALO_DIAS,
    TOLERANCIA_SEG_POR_QUESTAO: TOLERANCIA_SEG_POR_QUESTAO, ALFABETO_CODIGO: ALFABETO_CODIGO,
    PALAVRAS_PROIBIDAS: PALAVRAS_PROIBIDAS, AVISO_SUPERVISAO: AVISO_SUPERVISAO, TEXTO_SELO: TEXTO_SELO, MENSAGENS: MENSAGENS,
    normalizarCodigo: normalizarCodigo, formatarCodigo: formatarCodigo, formatarTempo: formatarTempo,
    tempoPorExtenso: tempoPorExtenso, calcularNota: calcularNota, dataBR: dataBR, dataDoIso: dataDoIso,
    hoje: hoje, hojeBoaVista: hojeBoaVista, FUSO_PADRAO: FUSO_PADRAO, novoEstado: novoEstado, aplicarQuestao: aplicarQuestao, aplicarResposta: aplicarResposta,
    segundosRestantes: segundosRestantes, progresso: progresso, instrucoes: instrucoes, mensagemErro: mensagemErro,
    exibirSelo: exibirSelo, textoResultado: textoResultado, situacaoDoTeste: situacaoDoTeste
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = VAGAS_TESTES;
  else root.VAGAS_TESTES = VAGAS_TESTES;
})(typeof self !== 'undefined' ? self : this);
