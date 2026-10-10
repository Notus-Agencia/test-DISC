/*
 * "Como liderar esta pessoa" AVANÇADO (modelo 'lideranca' de js/relatorio-modelos.js, versão 2).
 * Texto escrito POR COMBINAÇÃO (as 16 de conteudo/profundo: D, I, S, C, DI, DS, ...) em conteudo/lideranca/<CODIGO>.json,
 * montado em js/lideranca-avancado-dados.js (global DISC_LIDERANCA_DADOS) por scripts/montar-lideranca.mjs.
 *
 * Módulo PURO (UMD, global DISC_LIDERANCA_AVANCADO; sem DOM, sem rede, testável no Node):
 *   CAPITULOS            -> [{ id, titulo, curto, meta, base }] na ordem do documento (10)
 *   FUNDAMENTOS          -> [string] referências completas (só estudos reais), para a seção final
 *   codigoCombinacao(resultado) -> 'DI' | 'S' | ... (regra de DISC_COMBINACOES.codigo: puro quando o secundário é fraco) ou null
 *   temDados(codigo, opcoes?) -> bool
 *   montar(resultado, ctx?) -> bloco "avancado" do snapshot ou null (sem conteúdo da combinação: quem chama usa o guia de antes)
 *     resultado: { percentuais: {D,I,S,C}, codigo? }
 *     ctx: { nome: nome curto já pronto ("Ana P."), lider: { nome, percentuais, codigo? } | null,
 *            dados?: DISC_LIDERANCA_DADOS (testes) }
 *     -> { versao: 1, combinacao: { codigo, puro, nome, frase, descricao } | { codigo, puro },
 *          retrato: [parágrafos], capitulos: [capitulo], fundamentos: [string] }
 *   capitulo = { id, numero, titulo, curto, meta, intro, blocos: [bloco], base }
 *   bloco (lista branca; a view ignora tipos desconhecidos):
 *     { tipo: 'texto', texto } · { tipo: 'destaques', itens: [{ titulo, texto }] } · { tipo: 'grupos', itens: [{ titulo, itens: [string] }] }
 *     { tipo: 'frases', titulo, itens: [{ situacao, frase }] } · { tipo: 'etapas', itens: [{ titulo, itens: [string] }] }
 *     { tipo: 'passos', titulo, itens: [{ titulo, texto }] } · { tipo: 'perguntas', titulo, itens: [string] }
 *     { tipo: 'exemplo', titulo, texto } · { tipo: 'alerta', titulo, texto, itens? }
 *     { tipo: 'estilos', itens: [{ letra, nome, texto, ajustes: [string], atual: bool }] }
 *   Capítulos (ids, nesta ordem): feedback, delegacao, motivacao, retencao, desgaste, mudanca, conflito, um_a_um, plano90, voce.
 *
 * "Você e esta pessoa": com os percentuais de quem lidera, mostra só o estilo primário dessa pessoa (marcado como atual) e
 * as diferenças de 20+ pontos num mesmo fator (textos de DISC_RELATORIO_LIDERANCA.DIFERENCA); sem eles, os 4 estilos.
 * Marcador {nome} do conteúdo vira o nome curto (ou "esta pessoa"). Só texto puro: escape ao exibir.
 * Desgaste: só comportamentos observáveis, sem rótulos; com sinais fortes, orienta conversa e apoio profissional.
 */
(function (root) {
  'use strict';

  var LETRAS = ['D', 'I', 'S', 'C'];
  var NOMES = { D: 'Dominância', I: 'Influência', S: 'Estabilidade', C: 'Conformidade' };
  var VERSAO = 1;

  var CAPITULOS = [
    { id: 'feedback', titulo: 'Como dar feedback', curto: 'Feedback', meta: 'O que funciona · O que dá errado · Frases prontas',
      base: 'Base: Kluger e DeNisi (1996), que reuniram centenas de estudos sobre feedback, e Hattie e Timperley (2007).' },
    { id: 'delegacao', titulo: 'Delegação e metas', curto: 'Delegação', meta: 'Autonomia · Como combinar a entrega · Acompanhamento',
      base: 'Base: Locke e Latham (2002), sobre metas claras e desafiadoras.' },
    { id: 'motivacao', titulo: 'Motivação e reconhecimento', curto: 'Motivação', meta: 'Autonomia · Competência · Vínculo',
      base: 'Base: Deci e Ryan (2000), teoria da autodeterminação.' },
    { id: 'retencao', titulo: 'Retenção: o que faz ficar ou sair', curto: 'Retenção', meta: 'O que segura · O que afasta · Conversa de permanência',
      base: 'Base: Mitchell e colegas (2001), sobre o que prende as pessoas ao trabalho, e Griffeth, Hom e Gaertner (2000).' },
    { id: 'desgaste', titulo: 'Sinais de desgaste', curto: 'Desgaste', meta: 'Demandas e recursos · Sinais · Como agir',
      base: 'Base: Bakker e Demerouti (2007), modelo de demandas e recursos do trabalho.' },
    { id: 'mudanca', titulo: 'Como conduzir mudanças', curto: 'Mudanças', meta: 'Antes · Durante · Depois',
      base: 'Base: Kotter (1995), sobre como conduzir mudanças, e Edmondson (1999), sobre segurança psicológica.' },
    { id: 'conflito', titulo: 'Conflitos e como mediar', curto: 'Conflito', meta: 'Gatilhos · Como aparece · Como mediar',
      base: 'Base: De Dreu e Weingart (2003), sobre conflito de tarefa e conflito pessoal, e Edmondson (1999).' },
    { id: 'um_a_um', titulo: 'Reunião individual (1:1)', curto: 'Reunião 1:1', meta: 'Frequência · Pauta · Perguntas',
      base: 'Base: Rogelberg (2024), sobre reuniões individuais, e Edmondson (1999).' },
    { id: 'plano90', titulo: 'Os primeiros 90 dias', curto: 'Primeiros 90 dias', meta: 'Chegada ou nova função · 30, 60 e 90 dias',
      base: 'Base: Bauer e colegas (2007), sobre a integração de quem chega.' },
    { id: 'voce', titulo: 'Você e esta pessoa', curto: 'Você e esta pessoa', meta: 'Ajustes conforme o estilo de quem lidera',
      base: 'Base: Graen e Uhl-Bien (1995), sobre a qualidade da relação de trabalho entre líder e equipe.' }
  ];

  var FUNDAMENTOS = [
    'Marston, W. M. (1928). Emotions of normal people. Kegan Paul, Trench, Trubner & Co. Origem do modelo DISC.',
    'Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions on performance: A historical review, a meta-analysis, and a preliminary feedback intervention theory. Psychological Bulletin, 119(2), 254–284.',
    'Hattie, J., & Timperley, H. (2007). The power of feedback. Review of Educational Research, 77(1), 81–112.',
    'Locke, E. A., & Latham, G. P. (2002). Building a practically useful theory of goal setting and task motivation: A 35-year odyssey. American Psychologist, 57(9), 705–717.',
    'Deci, E. L., & Ryan, R. M. (2000). The "what" and "why" of goal pursuits: Human needs and the self-determination of behavior. Psychological Inquiry, 11(4), 227–268.',
    'Mitchell, T. R., Holtom, B. C., Lee, T. W., Sablynski, C. J., & Erez, M. (2001). Why people stay: Using job embeddedness to predict voluntary turnover. Academy of Management Journal, 44(6), 1102–1121.',
    'Griffeth, R. W., Hom, P. W., & Gaertner, S. (2000). A meta-analysis of antecedents and correlates of employee turnover. Journal of Management, 26(3), 463–488.',
    'Bakker, A. B., & Demerouti, E. (2007). The Job Demands-Resources model: State of the art. Journal of Managerial Psychology, 22(3), 309–328.',
    'Kotter, J. P. (1995). Leading change: Why transformation efforts fail. Harvard Business Review, 73(2), 59–67.',
    'Edmondson, A. (1999). Psychological safety and learning behavior in work teams. Administrative Science Quarterly, 44(2), 350–383.',
    'De Dreu, C. K. W., & Weingart, L. R. (2003). Task versus relationship conflict, team performance, and team member satisfaction: A meta-analysis. Journal of Applied Psychology, 88(4), 741–749.',
    'Rogelberg, S. G. (2024). Glad we met: The art and science of 1:1 meetings. Oxford University Press.',
    'Bauer, T. N., Bodner, T., Erdogan, B., Truxillo, D. M., & Tucker, J. S. (2007). Newcomer adjustment during organizational socialization: A meta-analytic review of antecedents, outcomes, and methods. Journal of Applied Psychology, 92(3), 707–721.',
    'Graen, G. B., & Uhl-Bien, M. (1995). Relationship-based approach to leadership: Development of leader-member exchange (LMX) theory of leadership over 25 years. The Leadership Quarterly, 6(2), 219–247.'
  ];

  // Textos fixos (valem para qualquer combinação).
  var INTRO = {
    feedback: 'Feedback que ajuda fala da tarefa e do comportamento que dá para observar, nunca do jeito de ser da pessoa. Quando a conversa vira julgamento pessoal, o desempenho tende a piorar em vez de melhorar.',
    delegacao: 'Delegar bem é combinar antes o resultado esperado, o prazo e até onde vai a decisão de quem recebe a tarefa. Metas claras e desafiadoras costumam render mais do que um vago "faça o seu melhor".',
    motivacao: 'As pessoas tendem a se engajar mais quando sentem três coisas: que têm escolha sobre o próprio trabalho (autonomia), que estão ficando boas no que fazem (competência) e que fazem parte de um grupo que se importa (vínculo). Veja o que cada uma significa para este perfil.',
    retencao: 'Ninguém fica numa empresa só pelo salário. Pesam também a relação com quem lidera, o encaixe com o trabalho e os laços com a equipe. Veja o que costuma segurar ou afastar este perfil e como perguntar antes que seja tarde.',
    desgaste: 'Todo trabalho tem demandas (o que cobra energia) e recursos (o que devolve energia). O desgaste aparece quando as demandas ficam altas por muito tempo e os recursos não acompanham. Aqui estão sinais que dá para observar no dia a dia, sem rótulos e sem tentar adivinhar a causa.',
    mudanca: 'Mudança anunciada de surpresa costuma gerar resistência em qualquer perfil. Com este, alguns cuidados antes, durante e depois fazem diferença.',
    conflito: 'Discordar sobre a tarefa pode melhorar o trabalho; o problema é quando a discordância vira pessoal. Veja como este perfil tende a entrar em atrito e como mediar.',
    um_a_um: 'A reunião individual é o momento de ouvir, alinhar prioridades e tirar obstáculos do caminho. A pauta é da pessoa tanto quanto de quem lidera.',
    plano90: 'Os primeiros três meses numa empresa ou numa função nova pesam muito no engajamento. Um plano simples, com conversas marcadas, ajuda a pessoa a entender o papel, ganhar confiança e se sentir parte.',
    voce: 'Liderar bem não é tratar todo mundo igual: é ajustar o seu jeito ao jeito da outra pessoa, sem deixar de ser quem você é.'
  };

  var REGRA_FEEDBACK = {
    titulo: 'Antes de qualquer feedback',
    itens: [
      'Descreva o fato: o que aconteceu, quando e com qual resultado. Sem "você sempre" nem "você nunca".',
      'Diga o efeito no trabalho, no cliente ou na equipe.',
      'Combine o próximo passo e quando vocês vão conversar de novo sobre o assunto.',
      'Elogio e correção em conversas separadas: quando vêm juntos, um apaga o outro.'
    ]
  };

  var ALERTA_DESGASTE = {
    titulo: 'Quando o sinal é forte',
    texto: 'Se vários sinais fortes aparecem juntos e duram semanas, não espere passar. Quem lidera não precisa descobrir a causa nem dar nome ao que a pessoa sente; precisa observar, perguntar e abrir caminho para ajuda.',
    itens: [
      'Chame para uma conversa reservada e diga o que você observou, com exemplos, sem rótulos.',
      'Pergunte como a pessoa está e o que ajudaria agora; escute mais do que fala.',
      'Reduza ou redistribua a carga quando for possível e combine uma nova conversa em poucos dias.',
      'Lembre que procurar apoio profissional, como um psicólogo ou o serviço de saúde da empresa ou do plano, é cuidado e não fraqueza.',
      'Se a pessoa falar em se machucar ou em não querer mais viver, não deixe para depois: fique junto e procure ajuda na hora, como o CVV (ligue 188, 24 horas, gratuito) ou o SAMU (192).'
    ]
  };

  var SEGURANCA = {
    mudanca: 'Abra espaço para dúvidas e críticas sem punição. Quem pode dizer "isso não vai funcionar" sem medo avisa cedo onde a mudança vai travar.',
    um_a_um: 'Quando a pessoa pode trazer um erro, uma dúvida ou uma discordância sem medo de ser punida, os problemas aparecem cedo. Agradeça quando alguém traz uma má notícia.',
    conflito: 'Discordar da ideia é bem-vindo; atacar a pessoa, não. Deixe essa regra clara para todo o time e cumpra você também.'
  };

  /* ------------------------------------------------------------------ módulos vizinhos */

  function modulo(global, caminho) {
    if (root && root[global]) return root[global];
    if (typeof require === 'function') { try { return require(caminho); } catch (e) { /* ausente */ } }
    return null;
  }
  function dadosLideranca(opcoes) {
    if (opcoes && opcoes.dados && typeof opcoes.dados === 'object') return opcoes.dados;
    return modulo('DISC_LIDERANCA_DADOS', './lideranca-avancado-dados.js') || {};
  }
  function lista(v) { return Array.isArray(v) ? v : []; }
  function texto(v) { return v === null || v === undefined ? '' : String(v); }

  function percentuaisValidos(p) {
    if (!p || typeof p !== 'object') return null;
    var out = {}, soma = 0;
    for (var i = 0; i < LETRAS.length; i++) {
      var b = p[LETRAS[i]];
      var v = Number(b);
      if (b === null || b === '' || typeof b === 'boolean' || !isFinite(v) || v < 0 || v > 100) return null;
      out[LETRAS[i]] = Math.round(v * 10) / 10;
      soma += v;
    }
    return soma > 0 ? out : null;
  }

  function codigoCombinacao(resultado) {
    var CB = modulo('DISC_COMBINACOES', './disc-combinacoes.js');
    if (!CB || !resultado) return null;
    return CB.codigo(resultado.percentuais, resultado.codigo);
  }

  function temDados(codigo, opcoes) {
    var D = dadosLideranca(opcoes);
    return !!(codigo && Object.prototype.hasOwnProperty.call(D, codigo) && D[codigo] && D[codigo].feedback);
  }

  function fmtPct(n) { return (Math.round(Number(n) * 10) / 10).toString().replace('.', ',') + '%'; }

  // Ordem decrescente, empate pela ordem D, I, S, C.
  function primario(p) {
    return LETRAS.slice().sort(function (a, b) { return (p[b] - p[a]) || (LETRAS.indexOf(a) - LETRAS.indexOf(b)); })[0];
  }

  /* ------------------------------------------------------------------ montagem */

  function montar(resultado, ctx) {
    ctx = ctx || {};
    if (!resultado || !percentuaisValidos(resultado.percentuais)) return null;
    var cod = codigoCombinacao(resultado);
    if (!cod || !temDados(cod, ctx)) return null;
    var d = dadosLideranca(ctx)[cod];
    var nome = texto(ctx.nome).trim();

    // {nome} -> nome curto; sem nome, "esta pessoa" (maiúscula no começo de frase; "de {nome}" -> "desta pessoa").
    function nm(s) {
      s = texto(s);
      if (!nome) s = s.replace(/\bde \{nome\}/g, 'desta pessoa');
      return s.replace(/\{nome\}/g, function (m, pos) {
        if (nome) return nome;
        var antes = s.slice(0, pos);
        return /(^|[.!?:]\s+|["“(]\s*)$/.test(antes) ? 'Esta pessoa' : 'esta pessoa';
      }).replace(/( [A-ZÀ-Ý]\.)\./g, '$1');
    }
    function nms(v) { return lista(v).map(nm); }
    function topicos(v, a, b) { return lista(v).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { var o = {}; o[a] = nm(x[a]); o[b] = nm(x[b]); return o; }); }

    var CB = modulo('DISC_COMBINACOES', './disc-combinacoes.js');
    var cb = CB && typeof CB.combinacao === 'function' ? CB.combinacao(resultado.percentuais, resultado.codigo) : null;
    var combinacao = cb ? { codigo: cb.codigo, puro: cb.puro, nome: cb.nome, frase: cb.frase, descricao: cb.descricao } : { codigo: cod, puro: cod.length === 1 };

    var caps = {};
    function cap(id, blocos) {
      var meta = CAPITULOS.filter(function (c) { return c.id === id; })[0];
      caps[id] = { id: id, titulo: meta.titulo, curto: meta.curto, meta: meta.meta, intro: INTRO[id], blocos: blocos.filter(Boolean), base: meta.base };
    }

    var fb = d.feedback || {};
    cap('feedback', [
      { tipo: 'texto', texto: nm(fb.texto) },
      { tipo: 'alerta', titulo: REGRA_FEEDBACK.titulo, texto: '', itens: REGRA_FEEDBACK.itens.slice(), leve: true },
      { tipo: 'grupos', itens: [{ titulo: 'O que funciona', itens: nms(fb.funciona) }, { titulo: 'O que dá errado', itens: nms(fb.da_errado) }] },
      { tipo: 'frases', titulo: 'Frases prontas', itens: topicos(fb.frases, 'situacao', 'frase') }
    ]);

    var dl = d.delegacao || {};
    cap('delegacao', [
      { tipo: 'texto', texto: nm(dl.texto) },
      { tipo: 'destaques', itens: [{ titulo: 'Quanta autonomia dar', texto: nm(dl.autonomia) }, { titulo: 'Como acompanhar', texto: nm(dl.acompanhar) }] },
      { tipo: 'grupos', itens: [{ titulo: 'Como combinar a entrega', itens: nms(dl.combinar) }, { titulo: 'Armadilhas comuns', itens: nms(dl.armadilhas) }] },
      { tipo: 'exemplo', titulo: 'Na prática', texto: nm(dl.exemplo) }
    ]);

    var mt = d.motivacao || {};
    cap('motivacao', [
      { tipo: 'texto', texto: nm(mt.texto) },
      { tipo: 'destaques', itens: [{ titulo: 'Autonomia', texto: nm(mt.autonomia) }, { titulo: 'Competência', texto: nm(mt.competencia) }, { titulo: 'Vínculo', texto: nm(mt.vinculo) }] },
      { tipo: 'grupos', itens: [{ titulo: 'Como reconhecer', itens: nms(mt.reconhecer) }, { titulo: 'O que desmotiva', itens: nms(mt.desmotiva) }] }
    ]);

    var rt = d.retencao || {};
    cap('retencao', [
      { tipo: 'texto', texto: nm(rt.texto) },
      { tipo: 'grupos', itens: [{ titulo: 'O que faz ficar', itens: nms(rt.fica) }, { titulo: 'O que faz sair', itens: nms(rt.sai) }] },
      { tipo: 'grupos', itens: [{ titulo: 'Sinais de que a pessoa pode estar de saída', itens: nms(rt.sinais) }] },
      { tipo: 'perguntas', titulo: 'Conversa de permanência: pergunte antes que seja tarde', itens: nms(rt.perguntas) }
    ]);

    var dg = d.desgaste || {};
    cap('desgaste', [
      { tipo: 'texto', texto: nm(dg.texto) },
      { tipo: 'grupos', itens: [{ titulo: 'O que mais cobra energia deste perfil', itens: nms(dg.demandas) }, { titulo: 'O que mais devolve energia', itens: nms(dg.recursos) }] },
      { tipo: 'grupos', itens: [{ titulo: 'Primeiros sinais', itens: nms(dg.sinais_iniciais) }, { titulo: 'Sinais fortes', itens: nms(dg.sinais_fortes) }] },
      { tipo: 'grupos', itens: [{ titulo: 'Como agir', itens: nms(dg.como_agir) }] },
      { tipo: 'frases', titulo: 'Para abrir a conversa', itens: [{ situacao: 'Sem rótulo, a partir do que você viu', frase: nm(dg.conversa) }] },
      { tipo: 'alerta', titulo: ALERTA_DESGASTE.titulo, texto: ALERTA_DESGASTE.texto, itens: ALERTA_DESGASTE.itens.slice() }
    ]);

    var md = d.mudanca || {};
    cap('mudanca', [
      { tipo: 'texto', texto: nm(md.texto) },
      { tipo: 'etapas', itens: [{ titulo: 'Antes', itens: nms(md.antes) }, { titulo: 'Durante', itens: nms(md.durante) }, { titulo: 'Depois', itens: nms(md.depois) }] },
      { tipo: 'frases', titulo: 'Como anunciar', itens: [{ situacao: 'Primeira conversa sobre a mudança', frase: nm(md.frase) }] },
      { tipo: 'exemplo', titulo: 'Segurança para discordar', texto: SEGURANCA.mudanca }
    ]);

    var cf = d.conflito || {};
    cap('conflito', [
      { tipo: 'texto', texto: nm(cf.texto) },
      { tipo: 'destaques', itens: [{ titulo: 'Como o atrito costuma aparecer', texto: nm(cf.como_aparece) }] },
      { tipo: 'grupos', itens: [{ titulo: 'O que costuma disparar o atrito', itens: nms(cf.gatilhos) }] },
      { tipo: 'passos', titulo: 'Como mediar, passo a passo', itens: nms(cf.mediar).map(function (t) { return { titulo: '', texto: t }; }) },
      { tipo: 'frases', titulo: 'Para começar a mediação', itens: [{ situacao: 'Com as duas partes juntas', frase: nm(cf.frase) }] },
      { tipo: 'exemplo', titulo: 'Regra do time', texto: SEGURANCA.conflito }
    ]);

    var um = d.um_a_um || {};
    cap('um_a_um', [
      { tipo: 'destaques', itens: [{ titulo: 'Frequência e formato', texto: nm(um.frequencia) }] },
      { tipo: 'passos', titulo: 'Pauta sugerida', itens: topicos(um.pauta, 'titulo', 'texto') },
      { tipo: 'perguntas', titulo: 'Perguntas que costumam abrir a conversa', itens: nms(um.perguntas) },
      { tipo: 'grupos', itens: [{ titulo: 'Evite na reunião', itens: nms(um.evite) }] },
      { tipo: 'exemplo', titulo: 'Segurança para falar', texto: SEGURANCA.um_a_um }
    ]);

    var pl = d.plano_90 || {};
    cap('plano90', [
      { tipo: 'texto', texto: nm(pl.texto) },
      { tipo: 'etapas', itens: [{ titulo: 'Dias 1 a 30', itens: nms(pl.dias_30) }, { titulo: 'Dias 31 a 60', itens: nms(pl.dias_60) }, { titulo: 'Dias 61 a 90', itens: nms(pl.dias_90) }] },
      { tipo: 'grupos', itens: [{ titulo: 'Sinais de que a integração vai bem', itens: nms(pl.sinais_bons) }] }
    ]);

    // Você e esta pessoa
    var ve = d.voce_e_esta_pessoa || {};
    var lider = ctx.lider && typeof ctx.lider === 'object' ? ctx.lider : null;
    var lp = lider ? percentuaisValidos(lider.percentuais) : null;
    var pp = percentuaisValidos(resultado.percentuais);
    var blocosVoce = [];
    var estilos;
    if (lp) {
      var lc = texto(lider.codigo).toUpperCase();
      var lPrim = /^[DISC]/.test(lc) ? lc.charAt(0) : primario(lp);
      var pPrim = cod.charAt(0);
      blocosVoce.push({ tipo: 'texto', texto: 'Seu estilo: ' + (/^[DISC]{2}$/.test(lc) ? lc : lPrim) + ', com ' + NOMES[lPrim] + ' ' + fmtPct(lp[lPrim]) + ' como fator principal. ' +
        'Estilo de ' + (nome || 'esta pessoa') + ': ' + cod + ', com ' + NOMES[pPrim] + ' ' + fmtPct(pp[pPrim]) + '. Abaixo, os ajustes que costumam ajudar quem lidera com o seu estilo.' });
      estilos = [lPrim];
    } else {
      blocosVoce.push({ tipo: 'texto', texto: 'O perfil de quem lidera não está no sistema. Encontre abaixo o estilo que mais se parece com o seu (o fator mais forte no seu teste DISC) e use os ajustes indicados para esse estilo.' });
      estilos = LETRAS.slice();
    }
    blocosVoce.push({ tipo: 'estilos', itens: estilos.map(function (l) {
      var x = ve[l] || {};
      return { letra: l, nome: 'Se você lidera com mais ' + NOMES[l], texto: nm(x.texto), ajustes: nms(x.ajustes), atual: !!lp };
    }) });
    if (lp) {
      var RL = modulo('DISC_RELATORIO_LIDERANCA', './relatorio-lideranca.js');
      var DIF = RL && RL.DIFERENCA, LIM = RL && RL.LIMIAR_DIFERENCA ? RL.LIMIAR_DIFERENCA : 20;
      var difs = [];
      if (DIF) {
        LETRAS.forEach(function (l) {
          var dif = lp[l] - pp[l];
          if (Math.abs(dif) < LIM || !DIF[l]) return;
          var t = dif > 0 ? DIF[l].liderMais : DIF[l].pessoaMais;
          difs.push(nm(t.replace('{L}', fmtPct(lp[l])).replace('{P}', fmtPct(pp[l]))));
        });
      }
      if (difs.length) blocosVoce.push({ tipo: 'grupos', itens: [{ titulo: 'Onde vocês mais diferem', itens: difs }] });
    }
    blocosVoce.push({ tipo: 'grupos', itens: [{ titulo: 'Vale para qualquer estilo', itens: [
      'Pergunte de vez em quando: "o que eu faço que ajuda o seu trabalho e o que atrapalha?". E mude alguma coisa a partir da resposta.',
      'Combine por escrito o que é prioridade nesta semana; diferenças de estilo pesam menos quando o combinado é claro.',
      'Não use o perfil como rótulo nem como desculpa: o DISC mostra preferências, e as pessoas mudam com o contexto.'
    ] }] });
    cap('voce', blocosVoce);

    var capitulos = CAPITULOS.map(function (c, i) { var x = caps[c.id]; x.numero = i + 1; return x; });
    return {
      versao: VERSAO,
      combinacao: combinacao,
      retrato: nms(d.retrato),
      capitulos: capitulos,
      fundamentos: FUNDAMENTOS.slice()
    };
  }

  var API = {
    VERSAO: VERSAO,
    LETRAS: LETRAS,
    CAPITULOS: CAPITULOS,
    FUNDAMENTOS: FUNDAMENTOS,
    codigoCombinacao: codigoCombinacao,
    temDados: function (codigo, opcoes) { return temDados(String(codigo || '').toUpperCase(), opcoes); },
    montar: montar
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.DISC_LIDERANCA_AVANCADO = API;
})(typeof self !== 'undefined' ? self : this);
