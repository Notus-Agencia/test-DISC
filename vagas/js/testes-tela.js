/*
 * Vagas sem Caos — testes de habilidade na tela da pessoa (testes.html), no celular: catálogo, instruções, prova (uma questão
 * por tela), resultado com o selo e as vagas que sugerem o teste. UMD: window.VAGAS_TESTES_TELA / module.exports (as funções puras
 * abaixo são testadas no Node; a montagem da tela só roda no navegador).
 *
 * Rotas (docs/VAGAS-TELAS.md §1 e §2.7): #catalogo · #teste/<slug> (instruções) · #prova · #resultado/<tentativa> · #vagas/<slug>.
 * Contrato das RPCs: docs/VAGAS-TESTES.md (VAGAS_API.testesCatalogo, iniciarTentativa, proximaQuestao, responder, registrarSinal,
 * finalizar). Estado e textos da prova: vagas/js/testes.js (VAGAS_TESTES). Textos fixos: padroes.md §5 e §6 e avisos.json.
 *
 * O que esta tela garante (e por quê):
 *   - O tempo é o do servidor: o relógio do aparelho só mede o que passou desde a última resposta dele (VAGAS_TESTES.segundosRestantes).
 *   - A alternativa escolhida fica no aparelho (vg.prova.<tentativa>) até o servidor confirmar; se a internet cair, a tela mostra
 *     "Reconectando…" e reenvia sozinha (reenviar a mesma resposta não muda nada no servidor). A tentativa nunca se perde.
 *   - "Responder" explícito (toque acidental em tela pequena não gasta a questão) e nada de voltar.
 *   - Sair da tela e copiar texto viram só registro (vagas_registrar_sinal); ninguém perde o selo por isso.
 *   - O relógio fica sempre à vista (na barra fixa, ao lado de "Responder"); sair da prova pela página pede confirmação e
 *     avisa que o relógio continua; quem volta de outro app lê que o relógio continuou contando.
 *   - Nunca mostra quais questões a pessoa errou: só acertos por competência.
 *   - Datas no fuso da cidade da pessoa (VAGAS_UI.definirFuso), nunca um fuso fixo.
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var T = nodeJs ? require('./testes.js') : root.VAGAS_TESTES;
  var U = nodeJs ? require('./ui.js') : root.VAGAS_UI;

  var DIA = 86400000;
  var POUCO_TEMPO = 60;              // segundos: o relógio fica laranja (aviso de pouco tempo, sem som)
  var AVISOS_TEMPO = [300, 60];      // anúncios para leitor de tela ("Faltam 5 minutos", "Falta 1 minuto")
  var ESPERA_RECONECTAR = [2, 4, 8, 15];
  var PAGINAS_VAGAS = 5;             // até 100 vagas da cidade para contar as que sugerem cada teste (cidade pequena cabe)
  var CHAVE_ATUAL = 'vg.prova.atual';
  var FORA_AVISAR_SEG = 30;          // fora da prova por mais que isto: na volta, a barra diz que o relógio continuou

  // Textos desta tela. Os fixos vêm de padroes.md §6, da revisão da psicologia (revisao-c-psicologia-1, bloco 2) e de
  // avisos.json (VAGAS_UI.t: teste_opcional, teste_antes, selo_sem_selo…); os demais estão listados no relatório para a revisão.
  // avisos.teste_opcional (psicologia 2.9, com dois-pontos) vai no catálogo, nas instruções e em "Vagas que sugerem este teste";
  // nunca dentro da prova.
  var TXT = {
    FRASE_PESSOA: 'Se quiser, faça o teste da sua função no celular e tente o selo de habilidade testada.',   // psicologia 2.3
    LIMITES: 'O teste mede conhecimento prático. Não mede inteligência, personalidade nem caráter, e não garante desempenho.',  // padroes §6
    DEMONSTRACAO: 'Questões de demonstração (a prova real usa outro banco)',
    GRATIS: 'Os testes são grátis. Ninguém pode cobrar por eles.',                                              // psicologia 2.10
    DICA_PROVA: 'Depois de responder não dá para voltar.',
    RECONECTANDO_RESPOSTA: 'Reconectando… sua resposta está guardada.',
    SEM_RESPOSTA_ERRO: 'O que ficou sem resposta vale como erro.',
    QUEM_NAO_TEM: 'Quem não tem o selo também pode se candidatar.',
    OPCIONAL_CURTO: 'O teste é opcional: você pode se candidatar sem ele.',                                      // psicologia 2.8
    CADA_PARTE: 'Cada parte teve só 3 ou 4 questões: use como pista do que revisar, não como medida exata.',      // psicologia 2.8
    NO_CARTAO: 'Ele aparece no seu cartão para as empresas das vagas em que você se candidatar.',                // psicologia 2.5
    NO_CARTAO_OUTRO: 'No seu cartão continua o selo de nota maior que você já tinha neste teste.',               // psicologia 2.5
    // Novos (UX da fase C): ainda passam pela psicologia.
    ABERTA: 'Seu teste já começou e o relógio continua contando. Toque em "Continuar o teste" para voltar à questão em que parou.',
    VOLTOU: 'O relógio continuou contando enquanto você estava fora.',
    SAIR_TITULO: 'Sair da prova?',
    SAIR_TEXTO: 'O relógio continua contando enquanto você estiver fora. Para voltar, abra Testes e toque em "Continuar".',
    CALCULANDO: 'Calculando a sua nota…'
  };

  // ------------------------------------------------------------------------------------------------- funções puras
  function inteiro(v) { var n = Number(v); return isFinite(n) ? Math.trunc(n) : 0; }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function juntar(lista) {
    var l = (lista || []).filter(Boolean);
    if (l.length <= 1) return l.join('');
    return l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
  }
  function diasAte(isoAlvo, agora) {
    var t = Date.parse(String(isoAlvo || ''));
    if (!isFinite(t)) return 0;
    return Math.max(1, Math.ceil((t - (agora == null ? Date.now() : agora)) / DIA));
  }

  // O que o item do catálogo oferece: continuar a prova aberta, esperar os 30 dias, refazer ou fazer pela primeira vez.
  function acaoDoTeste(item, agora) {
    var m = (item && item.minha) || null;
    var t = agora == null ? Date.now() : agora;
    var selo = m && m.selo && m.selo.situacao !== 'revogado' && m.selo.situacao !== 'vencido' ? m.selo : null;
    if (m && m.aberta) {
      return { tipo: 'continuar', faltam: Math.max(0, inteiro(m.aberta.total) - inteiro(m.aberta.respondidas)), selo: selo,
        minutos: m.aberta.segundosRestantes == null ? null : Math.ceil(Math.max(0, inteiro(m.aberta.segundosRestantes)) / 60) };
    }
    if (m && m.podeIniciarEm && Date.parse(m.podeIniciarEm) > t) return { tipo: 'aguardar', dias: diasAte(m.podeIniciarEm, t), quando: m.podeIniciarEm, selo: selo };
    if (m && (m.selo || m.ultima)) return { tipo: 'refazer', selo: selo };
    return { tipo: 'fazer', selo: null };
  }

  // Linha de informação do item (docs/VAGAS-TELAS.md §2.7): "15 questões · 20 min · sugerido em 3 vagas" / "Selo válido até … · nota 82 (±10)"
  // / "Você começou este teste · faltam 12 questões · restam 14 min" (o relógio não para: a linha diz quanto sobra).
  // op.data(iso) formata a data no fuso da cidade; op.pedidos = quantas vagas da cidade sugerem este teste.
  function linhaDoTeste(item, op) {
    op = op || {};
    var data = op.data || function (x) { return String(x || ''); };
    var a = acaoDoTeste(item, op.agora);
    var m = (item && item.minha) || {};
    var partes = [];
    if (a.tipo === 'continuar') {
      partes.push('Você começou este teste');
      partes.push('falta' + (a.faltam === 1 ? ' ' : 'm ') + plural(a.faltam, 'questão', 'questões'));
      if (a.minutos != null) partes.push('resta' + (a.minutos === 1 ? ' ' : 'm ') + a.minutos + ' min');
      return partes.join(' · ');
    }
    if (a.selo) partes.push('Selo válido até ' + data(a.selo.validoAte) + ' · nota ' + inteiro(a.selo.nota) + ' (±' + (a.selo.margem == null ? 10 : inteiro(a.selo.margem)) + ')');
    else if (m.ultima && m.ultima.nota != null) partes.push('Última nota ' + inteiro(m.ultima.nota) + ' (±' + (item.margem == null ? 10 : inteiro(item.margem)) + ')');
    if (a.tipo === 'aguardar') partes.push('pode refazer a partir de ' + data(a.quando));
    if (!partes.length) {
      partes.push(plural(inteiro(item.questoes), 'questão', 'questões'));
      partes.push(inteiro(item.minutos) + ' min');
      if (item.slug === 'caixa') partes.push('pode usar papel e caneta');
    }
    var n = op.pedidos ? inteiro(op.pedidos[item.slug]) : 0;
    if (n > 0 && a.tipo !== 'aguardar') partes.push('sugerido em ' + plural(n, 'vaga', 'vagas'));
    return partes.join(' · ');
  }

  // Linhas das instruções com ícone: as do contrato (VAGAS_TESTES.instrucoes) sem as duas que a tela mostra no texto fixo de
  // padroes.md §5.7 (avisos.teste_antes), para não dizer a mesma coisa duas vezes com palavras diferentes.
  var ICONES_INSTRUCAO = [[/^São \d+ questões/, 'lista'], [/^Você tem \d+ minutos/, 'relogio'], [/^Se a internet cair/, 'nuvem'],
    [/^Se você encerrar/, 'alerta'], [/papel e caneta/, 'moeda'], [/^Se você sair da prova/, 'olho'], [/ganha o selo/, 'selo']];
  function linhasInstrucoes(teste) {
    return T.instrucoes(teste).filter(function (l) { return !/^Faça sozinho/.test(l) && !/^O teste mede/.test(l); }).map(function (l) {
      var ic = 'seta';
      ICONES_INSTRUCAO.some(function (p) { if (p[0].test(l)) { ic = p[1]; return true; } return false; });
      return { icone: ic, texto: l };
    });
  }

  // Acertos por competência para as barras ("5 de 6"); nunca quais questões.
  function partesDoResultado(res) {
    return T.textoResultado(res).competencias.map(function (c) {
      return { nome: c.nome, acertos: c.acertos, total: c.total, texto: c.acertos + ' de ' + c.total,
        percentual: c.total ? Math.round((100 * c.acertos) / c.total) : 0 };
    });
  }
  // Linhas do resultado sem as que dependem de data (a tela escreve a data no fuso da cidade) e sem a do código (o selo mostra).
  function linhasDoResultado(res) {
    return T.textoResultado(Object.assign({}, res, { podeIniciarEm: null })).linhas.filter(function (l) { return !/^O selo vale até/.test(l); });
  }
  function textoRefazer(res, data) {
    return res && res.podeIniciarEm ? 'Você pode refazer este teste a partir de ' + data(res.podeIniciarEm) + ', de graça.' : '';
  }
  // Os nomes das partes já têm vírgula e "e" ("Troca, devolução e direitos do consumidor"): a lista vai com ponto e vírgula.
  // op.respondidas (quando a tela sabe): quem respondeu menos da metade não recebe a lista (ela diria pouco ou nada).
  function ondeAcertouMenos(res, op) {
    var r = res || {};
    var resp = op && op.respondidas;
    if (resp != null && inteiro(r.total) > 0 && inteiro(resp) * 2 < inteiro(r.total)) return '';
    return T.textoResultado(r).estudar.join('; ');
  }

  // Quantas vagas sugerem cada teste (o selo da vaga é só informação: a pessoa vê, a empresa não filtra pessoas por ele).
  function contarPedidos(anuncios) {
    var n = {};
    (anuncios || []).forEach(function (a) { if (a && a.selo) n[a.selo] = (n[a.selo] || 0) + 1; });
    return n;
  }
  // "de 20 a 25 minutos" (ou "20 minutos" se todos forem iguais): o tempo vem do catálogo, nunca fixo na tela.
  function faixaDeMinutos(testes) {
    var m = (testes || []).map(function (t) { return inteiro(t.minutos); }).filter(function (x) { return x > 0; });
    if (!m.length) return '';
    var menor = Math.min.apply(null, m);
    var maior = Math.max.apply(null, m);
    return menor === maior ? menor + ' minutos' : 'de ' + menor + ' a ' + maior + ' minutos';
  }
  function textoBotaoVagas(n) { return n > 0 ? 'Ver ' + plural(n, 'vaga que sugere', 'vagas que sugerem') + ' este teste' : 'Ver vagas'; }

  // Relógio: "12:05", laranja com 1 minuto ou menos; anúncio para leitor de tela em 5 min e 1 min (só o mais próximo, uma vez:
  // quem abre a prova com 50 s ouve "Falta 1 minuto" e nunca "Faltam 5 minutos" depois). marcar = limites que já não falam.
  function estadoDoRelogio(seg, anunciados) {
    var s = Math.max(0, inteiro(seg));
    var ja = anunciados || [];
    var anunciar = 0;
    AVISOS_TEMPO.forEach(function (limite) { if (s > 0 && s <= limite && ja.indexOf(limite) < 0) anunciar = limite; });
    return { texto: T.formatarTempo(s), pouco: s <= POUCO_TEMPO, acabou: s === 0, anunciar: anunciar,
      falado: anunciar ? T.tempoPorExtenso(anunciar) : '',
      marcar: anunciar ? AVISOS_TEMPO.filter(function (l) { return l >= anunciar; }) : [] };
  }

  function linkSelo(codigo, base) {
    var c = T.normalizarCodigo(codigo);
    var rel = 'selo.html?codigo=' + c;
    try { return base ? new URL(rel, base).href : rel; } catch (e) { return rel; }
  }
  function erroCodigo(e) { return (e && e.resposta && e.resposta.codigo) || ''; }

  var PURO = {
    TXT: TXT, POUCO_TEMPO: POUCO_TEMPO, CHAVE_ATUAL: CHAVE_ATUAL,
    acaoDoTeste: acaoDoTeste, linhaDoTeste: linhaDoTeste, linhasInstrucoes: linhasInstrucoes, partesDoResultado: partesDoResultado,
    linhasDoResultado: linhasDoResultado, textoRefazer: textoRefazer, ondeAcertouMenos: ondeAcertouMenos, contarPedidos: contarPedidos,
    textoBotaoVagas: textoBotaoVagas, faixaDeMinutos: faixaDeMinutos, estadoDoRelogio: estadoDoRelogio, linkSelo: linkSelo, juntar: juntar, diasAte: diasAte
  };
  if (nodeJs) { module.exports = PURO; return; }
  root.VAGAS_TESTES_TELA = PURO;

  // ================================================================================================================= navegador
  var doc = root.document;
  var A = root.VAGAS_API;
  var P = root.VAGAS_PECAS;
  var el = U.el;
  var app = doc.getElementById('app');
  if (!app) return;

  // catalogoPrevio: o catálogo pedido junto com a conta (iniciar), usado pela primeira tela. fim: o que a prova já sabe quando
  // termina ({tentativa, respondidas, resultado?}), para o resultado não perguntar de novo.
  var ctx = { logado: false, eu: null, cidade: null, catalogo: null, catalogoEm: 0, catalogoPrevio: null, vagas: null, fim: null,
    roteador: null, vez: 0 };
  var prova = null;
  // Cada troca de rota ganha um número: resposta que chega depois de a pessoa ter ido para outra tela é ignorada (não desenha
  // por cima da prova, por exemplo).
  function novaVez() { ctx.vez += 1; return ctx.vez; }

  function agora() { return Date.now(); }
  function data(isoOuDia) { return U.data(isoOuDia); }
  function ir(hash) { if (ctx.roteador) ctx.roteador.ir(hash); else root.location.hash = hash; }
  function hrefVagas() { return ctx.cidade ? 'cidade.html?cidade=' + encodeURIComponent(ctx.cidade.slug) : 'index.html'; }
  function demonstracao() { return A && A.modo === 'previa'; }

  // Faixa da prévia: as questões são de demonstração (nunca as da prova real). Uma faixa só por tela: com a faixa geral da prévia
  // (VAGAS_UI.faixaPrevia), o aviso das questões entra dentro dela.
  function marcarDemonstracao() {
    if (!demonstracao() || doc.getElementById('vg-faixa-demo')) return;
    var geral = doc.getElementById('vg-faixa-previa');
    if (geral) { geral.appendChild(doc.createTextNode(' ')); geral.appendChild(el('strong', { id: 'vg-faixa-demo' }, TXT.DEMONSTRACAO)); return; }
    var faixa = el('div', { class: 'faixa-demo', id: 'vg-faixa-demo', role: 'note' }, el('strong', {}, TXT.DEMONSTRACAO));
    var pular = doc.querySelector('.pular');
    doc.body.insertBefore(faixa, pular ? pular.nextSibling : doc.body.firstChild);
  }
  function fixarNav() { U.fixar(ctx.logado ? U.navPessoa('testes') : null); }
  function lerAtual() { var a = U.armazenamento.ler(CHAVE_ATUAL); return a && typeof a === 'object' && a.tentativa ? a : null; }
  function chavePendente(t) { return 'vg.prova.' + t; }

  // ------------------------------------------------------------------------------------------------- dados da tela
  var CATALOGO_RECENTE_MS = 60000;   // instruções logo depois do catálogo usam o que ele trouxe (uma ida e volta a menos)
  function carregarCatalogo(forcar) {
    var previo = ctx.catalogoPrevio;
    ctx.catalogoPrevio = null;
    var pedido = previo || (ctx.catalogo && !forcar ? null : A.testesCatalogo());
    if (!pedido) return Promise.resolve(ctx.catalogo);
    return pedido.then(function (r) { ctx.catalogo = r; ctx.catalogoEm = agora(); return r; });
  }
  function catalogoRecente() { return !!ctx.catalogo && agora() - ctx.catalogoEm < CATALOGO_RECENTE_MS; }
  // Depois de começar ou terminar uma prova, o que o catálogo sabia ("Continuar", "Em 30 dias") ficou velho.
  function esquecerCatalogo() { ctx.catalogo = null; ctx.catalogoPrevio = null; }
  // Vagas da cidade (até 100) para contar as que sugerem cada teste. Falha aqui nunca derruba a tela: a contagem só some.
  function carregarVagas() {
    if (ctx.vagas) return Promise.resolve(ctx.vagas);
    if (!ctx.cidade) return Promise.resolve([]);
    var lista = [];
    function pagina(depois, n) {
      return A.anuncios({ cidade: ctx.cidade.slug, areas: [], limite: 20, depois: depois || undefined }).then(function (r) {
        lista = lista.concat(r.anuncios || []);
        if (r.proximo && n + 1 < PAGINAS_VAGAS) return pagina(r.proximo, n + 1);
        return lista;
      });
    }
    return pagina('', 0).then(function (l) { ctx.vagas = l; return l; }, function () { return []; });
  }
  // r = resposta de A.cidades() (pedida em paralelo com a conta, em iniciar).
  function definirCidade(r) {
    var slug = (ctx.eu && ctx.eu.pessoa && ctx.eu.pessoa.cidades && ctx.eu.pessoa.cidades[0]) || U.cidadeLembrada();
    if (!slug || !r) return;
    var c = (r.cidades || []).filter(function (x) { return x.slug === slug; })[0];
    if (!c) return;
    ctx.cidade = { slug: c.slug, nome: c.nome, fuso: c.fuso };
    U.definirFuso(c.fuso);
    U.topo({ cidade: { nome: c.nome, slug: c.slug }, aoCidade: function () { U._api.navegar('index.html'); } });
  }

  // ------------------------------------------------------------------------------------------------- catálogo
  function botaoDoItem(item, a) {
    var slug = item.slug;
    var id = 'vg-teste-' + slug + '-acao';
    if (!ctx.logado) return el('a', { class: 'botao botao--principal vg-teste__acao', id: id, href: '#teste/' + slug }, U.t('botoes.fazer_teste') || 'Fazer o teste');
    if (a.tipo === 'continuar') {
      return el('button', { type: 'button', class: 'botao botao--principal vg-teste__acao', id: id, onclick: function (ev) { comecar(slug, ev.currentTarget, null); } }, 'Continuar');
    }
    if (a.tipo === 'aguardar') return el('span', { class: 'vg-teste__acao vg-teste__espera texto-medio', id: id }, 'Em ' + plural(a.dias, 'dia', 'dias'));
    if (a.tipo === 'refazer') return el('a', { class: 'botao botao--claro vg-teste__acao', id: id, href: '#teste/' + slug }, U.t('botoes.refazer_teste') || 'Refazer o teste');
    return el('a', { class: 'botao botao--principal vg-teste__acao', id: id, href: '#teste/' + slug }, U.t('botoes.fazer_teste') || 'Fazer o teste');
  }
  function itemDoCatalogo(item, pedidos) {
    var a = acaoDoTeste(item, agora());
    return el('li', { class: 'vg-teste', id: 'vg-teste-' + item.slug, data: { teste: item.slug, acao: a.tipo } }, [
      el('p', { class: 'vg-teste__nome' }, [item.nome, a.selo ? ' ' : null, a.selo ? el('span', { class: 'vg-etiqueta vg-etiqueta--selo' }, [U.icone('selo'), 'Selo']) : null]),
      el('p', { class: 'vg-teste__info', id: 'vg-teste-' + item.slug + '-info' }, linhaDoTeste(item, { agora: agora(), data: data, pedidos: pedidos })),
      botaoDoItem(item, a)
    ]);
  }
  function telaCatalogo() {
    pararProva();
    fixarNav();
    U.carregando(app);
    var vez = novaVez();
    return carregarCatalogo(true).then(function (r) {
      if (vez !== ctx.vez) return;
      var regras = r.regras || {};
      var validade = (r.testes[0] && r.testes[0].validadeMeses) || 12;
      var lista = el('ul', { class: 'vg-testes', id: 'vg-testes-lista' }, r.testes.map(function (t) { return itemDoCatalogo(t, null); }));
      U.trocar(app, el('section', { 'aria-labelledby': 'vg-testes-titulo' }, [
        el('p', { class: 'sobretitulo' }, 'Habilidade testada'),
        el('h1', { id: 'vg-testes-titulo', class: 'titulo-pagina', tabindex: '-1' }, 'Testes'),
        el('p', { class: 'subtitulo' }, TXT.FRASE_PESSOA),
        el('p', { class: 'subtitulo', id: 'vg-testes-subtitulo' }, 'Grátis, no celular' + (faixaDeMinutos(r.testes) ? ', ' + faixaDeMinutos(r.testes) + ' cada' : '') +
          '. O selo mostra o teste, a nota com a margem e a data, e vale ' + validade + ' meses. Pode refazer depois de ' + (regras.intervaloDias || 30) + ' dias.'),
        el('p', { class: 'aviso', id: 'vg-testes-opcional' }, U.t('avisos.teste_opcional')),
        ctx.logado ? null : el('div', { class: 'aviso', id: 'vg-testes-entrar-aviso' }, [el('p', {}, T.MENSAGENS.login),
          el('div', { class: 'acoes' }, el('a', { class: 'botao botao--claro', id: 'vg-testes-entrar', href: U.linkEntrar('testes.html') }, 'Entrar'))]),
        lista,
        el('p', { class: 'aviso', id: 'vg-testes-aviso' }, [U.t('avisos.selo_nao_e_psicologico'), ' ', TXT.GRATIS])
      ]));
      // A contagem de vagas chega depois e só completa a linha de cada teste.
      carregarVagas().then(function (vagas) {
        if (vez !== ctx.vez) return;
        var pedidos = contarPedidos(vagas);
        r.testes.forEach(function (t) {
          var info = doc.getElementById('vg-teste-' + t.slug + '-info');
          if (info) info.textContent = linhaDoTeste(t, { agora: agora(), data: data, pedidos: pedidos });
        });
      });
    }, function (e) { if (vez === ctx.vez) U.tratarErro(e, { raiz: app, aoTentar: telaCatalogo }); });
  }

  // ------------------------------------------------------------------------------------------------- instruções
  function telaInstrucoes(slug) {
    pararProva();
    fixarNav();
    U.carregando(app);
    var vez = novaVez();
    return carregarCatalogo(!catalogoRecente()).then(function (r) {
      if (vez !== ctx.vez) return;
      var t = (r.testes || []).filter(function (x) { return x.slug === slug; })[0];
      if (!t) {
        U.vazio(app, { h1: true, titulo: T.MENSAGENS.teste_indisponivel, texto: '', botao: { rotulo: 'Ver os testes', href: '#catalogo', id: 'vg-voltar-catalogo' } });
        return;
      }
      var a = acaoDoTeste(t, agora());
      var erro = el('p', { class: 'aviso aviso--erro', id: 'vg-instrucoes-erro', role: 'alert', hidden: true });
      var principal;
      if (!ctx.logado) {
        principal = el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-prova-comecar', href: U.linkEntrar('testes.html#teste/' + slug) }, 'Entrar para começar');
      } else if (a.tipo === 'aguardar') {
        principal = null;
      } else {
        principal = el('button', { type: 'button', class: 'botao botao--laranja botao--grande', id: 'vg-prova-comecar',
          onclick: function (ev) { comecar(slug, ev.currentTarget, erro); } }, a.tipo === 'continuar' ? 'Continuar o teste' : 'Começar');
      }
      U.trocar(app, el('section', { class: 'caixa surgir', id: 'vg-instrucoes', 'aria-labelledby': 'vg-instrucoes-titulo', data: { teste: slug } }, [
        el('p', { class: 'sobretitulo' }, 'Teste de habilidade'),
        el('h1', { id: 'vg-instrucoes-titulo', class: 'titulo-pagina', tabindex: '-1' }, t.nome),
        t.descricao ? el('p', { class: 'subtitulo' }, t.descricao) : null,
        // Quem voltou da prova (voltar do celular, catálogo): o relógio não parou.
        a.tipo === 'continuar' && ctx.logado ? el('p', { class: 'aviso', id: 'vg-instrucoes-aberta' }, TXT.ABERTA) : null,
        el('ul', { class: 'vg-lista-itens', id: 'vg-instrucoes-lista' }, linhasInstrucoes(t).map(function (l) {
          return el('li', { class: 'vg-item' }, [U.icone(l.icone), el('span', { class: 'vg-item__texto t-corpo' }, l.texto)]);
        })),
        el('p', { class: 'aviso', id: 'vg-instrucoes-sozinho' }, U.t('avisos.teste_antes')),
        el('p', { class: 'aviso', id: 'vg-instrucoes-opcional' }, U.t('avisos.teste_opcional')),
        a.tipo === 'aguardar' && ctx.logado ? el('p', { class: 'aviso', id: 'vg-instrucoes-aguardar' }, 'Você pode fazer de novo a partir de ' + data(a.quando) + '.') : null,
        erro,
        el('div', { class: 'acoes' }, [principal, el('a', { class: 'botao botao--link', href: '#catalogo', id: 'vg-prova-depois' }, 'Deixar para depois')])
      ]));
    }, function (e) { if (vez === ctx.vez) U.tratarErro(e, { raiz: app, aoTentar: function () { telaInstrucoes(slug); } }); });
  }

  // Começa (ou retoma) a tentativa e vai para a prova. Erros de regra (30 dias, conta, limite) aparecem no próprio cartão.
  function comecar(slug, botao, alvoErro) {
    U.ocupado(botao, true, 'Abrindo…');
    A.iniciarTentativa(slug).then(function (r) {
      var t = r.tentativa;
      esquecerCatalogo();
      U.armazenamento.gravar(CHAVE_ATUAL, { tentativa: t.id, teste: t.teste, nome: t.nome, total: t.total });
      ir('prova');
    }, function (e) {
      U.ocupado(botao, false);
      if (e.sessaoExpirada || e.confirmar || e.suspensa) { U.tratarErro(e); return; }
      if (e.conexao) U.faixaOffline(true, { aoTentar: function () { U.faixaOffline(false); comecar(slug, botao, alvoErro); } });
      if (alvoErro) { alvoErro.textContent = e.message; alvoErro.hidden = false; } else U.avisar(e.message, { tipo: 'erro' });
    });
  }

  // ------------------------------------------------------------------------------------------------- prova
  function pararProva() {
    if (!prova) return;
    clearInterval(prova.relogio);
    clearTimeout(prova.reenvio);
    clearTimeout(prova.esperaFim);
    doc.removeEventListener('visibilitychange', prova.aoEsconder);
    doc.removeEventListener('copy', prova.aoCopiar);
    doc.removeEventListener('click', prova.aoClicarFora, true);
    root.removeEventListener('online', prova.aoVoltar);
    root.removeEventListener('pagehide', prova.aoPagehide);
    root.removeEventListener('pageshow', prova.aoPageshow);
    prova = null;
  }
  function telaProva() {
    pararProva();
    if (!ctx.logado) { U.irParaEntrar({}); return; }
    var atual = lerAtual();
    if (!atual) { ir('catalogo'); return; }
    U.fixar(null);
    U.carregando(app, 'Carregando a questão…');
    carregarQuestao(atual, 0, novaVez());
  }
  function carregarQuestao(atual, tentativas, vez) {
    A.proximaQuestao(atual.tentativa).then(function (r) {
      if (vez !== ctx.vez) return;
      U.faixaOffline(false);
      if (r.fim) { irResultado(atual.tentativa, null); return; }
      var est = T.novoEstado({ tentativa: { id: atual.tentativa, teste: atual.teste, nome: atual.nome, total: r.total, respondidas: r.numero - 1,
        segundosRestantes: r.segundosRestantes } }, agora());
      iniciarProva(atual, T.aplicarQuestao(est, r, agora()));
    }, function (e) {
      if (vez !== ctx.vez) return;
      if (e.conexao) {
        // Sem internet: a tentativa continua no servidor; a tela tenta de novo sozinha (e na volta da internet).
        U.carregando(app, U.t('avisos.teste_reconectando'));
        var espera = ESPERA_RECONECTAR[Math.min(tentativas, ESPERA_RECONECTAR.length - 1)] * 1000;
        var tm = setTimeout(function () { root.removeEventListener('online', volta); if (vez === ctx.vez) carregarQuestao(atual, tentativas + 1, vez); }, espera);
        var volta = function () { clearTimeout(tm); root.removeEventListener('online', volta); if (vez === ctx.vez) carregarQuestao(atual, tentativas + 1, vez); };
        root.addEventListener('online', volta);
        return;
      }
      if (erroCodigo(e) === 'tentativa_inexistente') {
        U.armazenamento.apagar(CHAVE_ATUAL);
        U.avisar(e.message, { tipo: 'erro' });
        ir('catalogo');
        return;
      }
      U.tratarErro(e, { raiz: app, aoTentar: function () { carregarQuestao(atual, 0, vez); } });
    });
  }

  function iniciarProva(atual, estado) {
    pararProva();
    esquecerCatalogo();
    prova = { atual: atual, estado: estado, sel: null, enviando: false, esgotou: false, avisouFim: false, consultasFim: 0, anunciados: [],
      tentativasEnvio: 0, saiuEm: null };
    var p = prova;
    // Recarregar ou fechar a página também esconde a tela: pagehide vem antes e marca que não é troca de aba. Sem o diálogo
    // "as alterações podem não ser salvas": a tentativa e a escolha já estão guardadas.
    p.aoEsconder = function () {
      if (doc.visibilityState === 'hidden') {
        if (!p.saindo) { p.saiuEm = agora(); sinal('troca_aba'); }
        return;
      }
      // Voltou de outro app: o relógio andou. Quem ficou fora um tempo lê isso na barra (até a próxima questão).
      if (p.saiuEm != null && agora() - p.saiuEm >= FORA_AVISAR_SEG * 1000) { dica(TXT.VOLTOU); U.anunciar(TXT.VOLTOU); }
      p.saiuEm = null;
      tique();
    };
    p.aoPagehide = function () { p.saindo = true; };
    p.aoPageshow = function () { p.saindo = false; };
    root.addEventListener('pagehide', p.aoPagehide);
    root.addEventListener('pageshow', p.aoPageshow);
    p.aoCopiar = function () { sinal('copiar'); };
    p.aoVoltar = function () { if (p.reenvioPendente) { clearTimeout(p.reenvio); enviarResposta(); } };
    // Link ou botão do topo (logo, pílula da cidade) tira a pessoa da prova: confirma na própria tela, dizendo que o relógio
    // continua. Âncoras da própria página, a barra e as janelas seguem normais.
    p.aoClicarFora = function (ev) {
      if (p.saidaConfirmada || !ev.target || !ev.target.closest) return;
      var alvo = ev.target.closest('a[href], #vg-cidade');
      if (!alvo || app.contains(alvo) || alvo.closest('#vg-fixo') || alvo.closest('.vg-janela')) return;
      var href = alvo.getAttribute('href');
      if (href && href.charAt(0) === '#') return;
      ev.preventDefault();
      ev.stopPropagation();
      U.confirmar({ id: 'vg-confirmar-sair', titulo: TXT.SAIR_TITULO, texto: TXT.SAIR_TEXTO, sim: 'Sair', nao: 'Continuar o teste' }).then(function (sim) {
        if (!sim || p !== prova) return;
        p.saidaConfirmada = true;
        if (alvo.tagName === 'A') U._api.navegar(alvo.href); else alvo.click();
      });
    };
    doc.addEventListener('visibilitychange', p.aoEsconder);
    doc.addEventListener('copy', p.aoCopiar);
    doc.addEventListener('click', p.aoClicarFora, true);
    root.addEventListener('online', p.aoVoltar);
    var responder = el('button', { type: 'button', class: 'botao botao--principal botao--grande', id: 'vg-prova-responder', disabled: true, onclick: enviarResposta }, 'Responder');
    p.botao = responder;
    // O relógio fica na barra fixa, ao lado de "Responder": sempre à vista, mesmo com a questão rolada. O leitor de tela lê o
    // valor (o texto escondido faz parte do nome do relógio; nada de aria-label por cima).
    var relogio = el('span', { class: 'vg-tempo', id: 'vg-prova-tempo', role: 'timer' },
      [U.icone('relogio'), el('span', { class: 'visualmente-oculto' }, 'Tempo que falta: '), el('span', { id: 'vg-prova-segundos' }, '')]);
    U.fixar(U.barra({ id: 'vg-barra-prova', dica: TXT.DICA_PROVA, botoes: [relogio, responder] }));
    mostrarQuestao();
    p.relogio = setInterval(tique, 500);
    tique();
    retomarPendente();
  }
  function sinal(tipo) {
    if (!prova) return;
    A.registrarSinal(prova.estado.tentativa, tipo).catch(function () { /* só registro: falha não atrapalha a prova */ });
  }
  // Dica da barra: a regra da prova; "Reconectando…" ou "o relógio continuou" quando for o caso.
  function dica(texto) {
    var d = doc.getElementById('vg-barra-prova-dica');
    if (d) d.textContent = texto || TXT.DICA_PROVA;
  }

  function mostrarQuestao() {
    var p = prova;
    var e = p.estado;
    var prog = T.progresso(e);
    var q = e.questao;
    var opcoes = el('ul', { class: 'vg-prova__opcoes', id: 'vg-prova-opcoes', role: 'radiogroup', 'aria-labelledby': 'vg-prova-enunciado' },
      q.alternativas.map(function (texto, i) {
        return el('li', {}, el('button', { type: 'button', class: 'retrato vg-opcao', role: 'radio', 'aria-checked': 'false', 'aria-pressed': 'false',
          'aria-posinset': String(i + 1), 'aria-setsize': String(q.alternativas.length),
          data: { opcao: i }, onclick: function () { escolher(i); } }, [el('span', { class: 'vg-opcao__letra', 'aria-hidden': 'true' }, 'ABCD'.charAt(i)),
          el('span', { class: 'retrato-texto' }, texto)]));
      }));
    var feito = el('span', { class: 'vg-prova__feito', style: { width: prog.percentual + '%' } });
    U.trocar(app, el('section', { class: 'caixa', id: 'vg-prova', 'aria-labelledby': 'vg-prova-enunciado', data: { questao: e.numero, tentativa: e.tentativa } }, [
      el('div', { class: 'vg-prova__topo' }, [
        el('p', { class: 't-rotulo texto-medio', id: 'vg-prova-numero' }, [el('span', { class: 'visualmente-oculto' }, 'Questão '),
          el('strong', { class: 'progresso-num' }, String(prog.numero)), ' de ' + prog.total])
      ]),
      el('div', { class: 'vg-prova__barra trilho', 'aria-hidden': 'true' }, feito),
      q.texto ? el('div', { class: 'vg-prova__apoio', id: 'vg-prova-apoio' }, q.texto) : null,
      el('h1', { id: 'vg-prova-enunciado', class: 'vg-prova__enunciado', tabindex: '-1' }, q.enunciado),
      opcoes,
      el('p', { class: 'vg-reconectando', id: 'vg-prova-reconectando', role: 'status', 'aria-live': 'polite', hidden: true },
        [el('span', { class: 'giro', 'aria-hidden': 'true' }), TXT.RECONECTANDO_RESPOSTA]),
      el('div', { class: 'acoes' }, el('button', { type: 'button', class: 'botao botao--link', id: 'vg-prova-encerrar', onclick: encerrar }, 'Encerrar o teste'))
    ]));
    p.sel = null;
    p.botao.disabled = true;
    dica(null);
    U.focarTitulo(app);
    try { root.scrollTo(0, 0); } catch (err) { /* ignora */ }
    U.anunciar(prog.texto);
  }
  function marcar(i) {
    var lista = doc.getElementById('vg-prova-opcoes');
    if (!lista) return;
    Array.prototype.forEach.call(lista.querySelectorAll('.vg-opcao'), function (b) {
      var sim = Number(b.getAttribute('data-opcao')) === i;
      b.setAttribute('aria-pressed', sim ? 'true' : 'false');
      b.setAttribute('aria-checked', sim ? 'true' : 'false');
    });
  }
  function escolher(i) {
    var p = prova;
    if (!p || p.enviando) return;
    p.sel = i;
    marcar(i);
    p.botao.disabled = false;
    // A escolha fica no aparelho: recarregar a página não perde (e o reenvio usa a mesma).
    U.armazenamento.gravar(chavePendente(p.estado.tentativa), { numero: p.estado.numero, alternativa: i, enviar: false });
  }
  // Ao abrir a prova: escolha guardada desta questão volta marcada; resposta que já tinha sido enviada é reenviada.
  function retomarPendente() {
    var p = prova;
    var g = U.armazenamento.ler(chavePendente(p.estado.tentativa));
    if (!g || g.numero !== p.estado.numero || !(g.alternativa >= 0 && g.alternativa <= 3)) { U.armazenamento.apagar(chavePendente(p.estado.tentativa)); return; }
    escolher(g.alternativa);
    if (g.enviar) enviarResposta();
  }
  // "Reconectando…" embaixo das alternativas e também na barra (que fica à vista com a questão rolada).
  function reconectando(sim) {
    var r = doc.getElementById('vg-prova-reconectando');
    if (r) r.hidden = !sim;
    dica(sim ? TXT.RECONECTANDO_RESPOSTA : null);
  }
  function travarOpcoes(sim) {
    var lista = doc.getElementById('vg-prova-opcoes');
    if (lista) Array.prototype.forEach.call(lista.querySelectorAll('button'), function (b) { b.disabled = sim; });
  }
  // O servidor deu mais tempo do que o relógio do aparelho achava: um novo "acabou" volta a valer.
  function conferirTempo(p) {
    if (T.segundosRestantes(p.estado, agora()) > 0) { p.esgotou = false; p.avisouFim = false; p.consultasFim = 0; }
  }

  function enviarResposta() {
    var p = prova;
    if (!p || p.enviando || p.sel === null) return;
    p.enviando = true;
    p.reenvioPendente = false;
    var numero = p.estado.numero;
    var alternativa = p.sel;
    U.armazenamento.gravar(chavePendente(p.estado.tentativa), { numero: numero, alternativa: alternativa, enviar: true });
    U.ocupado(p.botao, true, 'Enviando…');
    travarOpcoes(true);
    A.responder(p.estado.tentativa, numero, alternativa).then(function (r) {
      if (p !== prova) return;
      p.enviando = false;
      p.tentativasEnvio = 0;
      reconectando(false);
      U.faixaOffline(false);
      U.armazenamento.apagar(chavePendente(p.estado.tentativa));
      U.ocupado(p.botao, false);
      if (r.fim) { irResultado(p.estado.tentativa, { respondidas: r.respondidas }); return; }
      p.estado = T.aplicarResposta(p.estado, r, agora());
      p.esgotou = false;
      conferirTempo(p);
      mostrarQuestao();
    }, function (e) {
      if (p !== prova) return;
      p.enviando = false;
      if (e.conexao) {
        // Internet caiu: a resposta continua guardada no aparelho e vai de novo sozinha (o servidor tolera o reenvio).
        reconectando(true);
        p.reenvioPendente = true;
        var espera = ESPERA_RECONECTAR[Math.min(p.tentativasEnvio, ESPERA_RECONECTAR.length - 1)] * 1000;
        p.tentativasEnvio += 1;
        p.reenvio = setTimeout(function () { if (p === prova) enviarResposta(); }, espera);
        return;
      }
      reconectando(false);
      U.ocupado(p.botao, false);
      travarOpcoes(false);
      if (e.resposta && e.resposta.fim) { U.armazenamento.apagar(chavePendente(p.estado.tentativa)); irResultado(p.estado.tentativa, { respondidas: p.estado.respondidas }); return; }
      if (e.sessaoExpirada || e.confirmar || e.suspensa) { U.tratarErro(e); return; }
      U.avisar(e.message, { tipo: 'erro' });
      if (erroCodigo(e) === 'fora_de_ordem') { U.armazenamento.apagar(chavePendente(p.estado.tentativa)); carregarQuestao(p.atual, 0, ctx.vez); }
    });
  }

  function tique() {
    var p = prova;
    if (!p) return;
    var s = T.segundosRestantes(p.estado, agora());
    var r = estadoDoRelogio(s, p.anunciados);
    var seg = doc.getElementById('vg-prova-segundos');
    var caixa = doc.getElementById('vg-prova-tempo');
    if (seg) seg.textContent = r.texto;
    if (caixa) caixa.classList.toggle('vg-tempo--pouco', r.pouco);
    if (r.anunciar) { p.anunciados = p.anunciados.concat(r.marcar); U.anunciar(r.falado); }
    if (r.acabou && !p.esgotou) { p.esgotou = true; tempoAcabou(); }
  }
  // Tempo do servidor acabou: a resposta marcada ainda vale (tolerância de 10 s para a questão da tela); sem resposta, a tela
  // pergunta ao servidor, que fecha a tentativa ("tempo_esgotado") e vai para o resultado. "O tempo acabou" é anunciado uma vez
  // só; a primeira pergunta sai em 1,5 s (o relógio do aparelho pode ter corrido na frente) e a seguinte, depois da tolerância.
  function tempoAcabou() {
    var p = prova;
    if (!p.avisouFim) { p.avisouFim = true; U.anunciar(T.tempoPorExtenso(0) + '.'); }
    if (p.sel !== null && !p.enviando) { enviarResposta(); return; }
    if (p.enviando) return;
    var espera = p.consultasFim ? (T.TOLERANCIA_SEG_POR_QUESTAO + 1) * 1000 : 1500;
    p.consultasFim += 1;
    p.esperaFim = setTimeout(function () {
      if (p !== prova) return;
      A.proximaQuestao(p.estado.tentativa).then(function (r) {
        if (p !== prova) return;
        if (r.fim) { irResultado(p.estado.tentativa, { respondidas: p.estado.respondidas }); return; }
        // O relógio do aparelho correu na frente do servidor: segue com o tempo que o servidor disse.
        p.estado = T.aplicarQuestao(p.estado, r, agora());
        conferirTempo(p);
        p.esgotou = false;
      }, function () { if (p === prova) p.esgotou = false; });
    }, espera);
  }

  function encerrar() {
    var p = prova;
    if (!p) return;
    U.confirmar({ id: 'vg-confirmar-encerrar', titulo: 'Encerrar o teste agora?', texto: U.t('avisos.teste_encerrar_conta') + ' ' + TXT.SEM_RESPOSTA_ERRO,
      sim: 'Encerrar', nao: 'Continuar o teste', perigo: true }).then(function (sim) {
      if (!sim || p !== prova) return;
      var t = p.estado.tentativa;
      var respondidas = p.estado.respondidas;
      pararProva();
      U.carregando(app, TXT.CALCULANDO);
      A.finalizar(t).then(function (r) { irResultado(t, { respondidas: respondidas, resultado: r.resultado }); },
        function (e) { U.tratarErro(e, { raiz: app, aoTentar: function () { irResultado(t, null); } }); });
    });
  }
  // fim (quando a prova acabou de terminar nesta tela): {respondidas, resultado?}. O resultado não pergunta de novo se a
  // tentativa acabou e, com o resultado em mãos, desenha sem esperar o servidor.
  function irResultado(t, fim) {
    pararProva();
    esquecerCatalogo();
    var atual = lerAtual();
    if (atual && atual.tentativa === t) U.armazenamento.apagar(CHAVE_ATUAL);
    U.armazenamento.apagar(chavePendente(t));
    ctx.fim = fim ? { tentativa: t, respondidas: fim.respondidas, resultado: fim.resultado || null } : null;
    ir('resultado/' + t);
  }

  // ------------------------------------------------------------------------------------------------- resultado
  // O selo novo está no cartão? (o cartão mostra 1 selo por teste, o de nota maior). null = não deu para saber.
  function seloNoCartao(res, meus) {
    if (!res.selo || !meus || !Array.isArray(meus.selos)) return null;
    var s = meus.selos.filter(function (x) { return x && x.codigo === res.selo.codigo; })[0];
    return s ? !!s.exibido : null;
  }
  function telaResultado(t) {
    pararProva();
    if (!ctx.logado) { U.irParaEntrar({}); return; }
    fixarNav();
    var vez = novaVez();
    var fim = ctx.fim && ctx.fim.tentativa === t ? ctx.fim : null;
    ctx.fim = null;
    U.carregando(app, TXT.CALCULANDO);
    // Antes de pedir o resultado, confere que a tentativa acabou (vagas_finalizar ENCERRA uma tentativa aberta); a prova que
    // acabou de terminar nesta tela já sabe.
    (fim ? Promise.resolve({ fim: true }) : A.proximaQuestao(t)).then(function (r) {
      if (vez !== ctx.vez) return null;
      if (!r.fim) {
        U.armazenamento.gravar(CHAVE_ATUAL, { tentativa: t, teste: '', nome: '', total: r.total });
        ir('prova');
        return null;
      }
      var pedido = fim && fim.resultado ? Promise.resolve({ resultado: fim.resultado }) : A.finalizar(t);
      // Os selos da pessoa (para saber se o novo está no cartão) vão junto, em paralelo; sem eles a tela segue.
      var meus = fim && fim.resultado && !fim.resultado.selo ? Promise.resolve(null) : A.meusSelos().catch(function () { return null; });
      return Promise.all([pedido, meus]).then(function (x) {
        if (vez !== ctx.vez) return;
        var res = x[0].resultado;
        mostrarResultado(res, { cartao: seloNoCartao(res, x[1]), respondidas: fim ? fim.respondidas : null });
        // A contagem de vagas chega depois e só completa o botão.
        carregarVagas().then(function (vagas) { if (vez === ctx.vez) botaoVagas(res.teste, contarPedidos(vagas)); });
      });
    }).catch(function (e) {
      if (vez !== ctx.vez) return;
      if (erroCodigo(e) === 'tentativa_inexistente') {
        U.vazio(app, { h1: true, titulo: e.message, texto: '', botao: { rotulo: 'Ver os testes', href: '#catalogo', id: 'vg-voltar-catalogo' } });
        return;
      }
      U.tratarErro(e, { raiz: app, aoTentar: function () { telaResultado(t); } });
    });
  }
  function botaoVagas(teste, pedidos) {
    var b = doc.getElementById('vg-resultado-vagas');
    if (!b) return;
    var n = pedidos ? inteiro(pedidos[teste]) : 0;
    b.textContent = textoBotaoVagas(n);
    b.setAttribute('href', n > 0 ? '#vagas/' + teste : hrefVagas());
  }
  // Peça do selo da casca; o código ganha o id que os testes e a tela de compartilhar usam (#vg-selo-codigo).
  function pecaDoSelo(res) {
    var s = P.selo(Object.assign({ nome: res.nome, margem: res.margem }, res.selo), { destaque: true });
    var c = s.querySelector('.vg-selo__codigo');
    if (c) c.id = 'vg-selo-codigo';
    return s;
  }
  function compartilhar(res) {
    var codigo = T.formatarCodigo(res.selo.codigo);
    var link = linkSelo(res.selo.codigo, root.location.href);
    var dados = { title: 'Selo de habilidade testada', text: U.t('avisos.selo_conferir', { codigo: codigo }), url: link };
    var n = root.navigator;
    if (n && typeof n.share === 'function') { n.share(dados).catch(function () { /* a pessoa desistiu de compartilhar */ }); return; }
    U.copiar(link).then(function () { U.avisar('Copiado', { tipo: 'ok' }); }, function (e) { U.avisar(e.message, { tipo: 'erro' }); });
  }
  // op.cartao: true/false/null (o selo novo está no cartão?); op.respondidas: quantas a pessoa respondeu, quando a tela sabe.
  function mostrarResultado(res, op) {
    op = op || {};
    var temSelo = !!res.selo;
    var refazer = textoRefazer(res, data);
    var menos = temSelo ? '' : ondeAcertouMenos(res, { respondidas: op.respondidas });
    var partes = partesDoResultado(res);
    var subtitulo = temSelo
      ? (op.cartao == null ? null : el('p', { class: 'subtitulo', id: 'vg-resultado-cartao' }, op.cartao ? TXT.NO_CARTAO : TXT.NO_CARTAO_OUTRO))
      : el('p', { class: 'subtitulo', id: 'vg-resultado-sem-selo' }, U.t('avisos.selo_sem_selo'));
    var botao = el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-resultado-vagas', href: hrefVagas() }, textoBotaoVagas(0));
    U.trocar(app, el('section', { class: 'caixa surgir', id: 'vg-resultado', 'aria-labelledby': 'vg-resultado-titulo', data: { selo: temSelo ? 'sim' : 'nao', status: res.status } }, [
      el('p', { class: 'sobretitulo' }, res.nome),
      el('h1', { id: 'vg-resultado-titulo', class: 'titulo-pagina', tabindex: '-1' }, temSelo ? 'Você ganhou o selo' : 'Prova concluída'),
      subtitulo,
      temSelo ? el('div', { id: 'vg-selo', class: 'vg-resultado__selo' }, pecaDoSelo(res)) : null,
      temSelo ? el('p', { class: 'texto-medio', id: 'vg-selo-conferir' }, [U.t('avisos.selo_conferir', { codigo: T.formatarCodigo(res.selo.codigo) }), ' ',
        el('a', { href: linkSelo(res.selo.codigo), id: 'vg-selo-conferir-link' }, 'Conferir agora')]) : null,
      el('div', { class: 't-corpo', id: 'vg-resultado-nota' }, linhasDoResultado(res).map(function (l) { return el('p', {}, l); })),
      refazer ? el('p', { class: 't-corpo texto-medio', id: 'vg-resultado-refazer' }, refazer) : null,
      el('h2', { class: 'caixa__titulo vg-resultado__partes-titulo' }, 'Como você foi em cada parte'),
      el('ul', { class: 'vg-linhas', id: 'vg-resultado-partes' }, partes.map(function (x) {
        return el('li', {}, [el('div', { class: 'progresso-topo' }, [el('span', {}, x.nome), el('span', { class: 'tabular' }, x.texto)]),
          el('div', { class: 'vg-prova__barra trilho', 'aria-hidden': 'true' }, el('span', { class: 'vg-prova__feito', style: { width: x.percentual + '%' } }))]);
      })),
      menos ? el('p', { id: 'vg-resultado-estudar' }, U.t('avisos.selo_sem_selo_competencias', { competencias: menos })) : null,
      el('p', { class: 'texto-medio', id: 'vg-resultado-cada-parte' }, TXT.CADA_PARTE),
      el('p', { class: 'aviso', id: 'vg-resultado-limites' }, TXT.LIMITES),
      // Sem selo: só o lembrete curto (a frase de cima já diz que a empresa não fica sabendo). Com selo, não se aplica.
      temSelo ? null : el('p', { class: 'texto-medio', id: 'vg-resultado-opcional' }, TXT.OPCIONAL_CURTO),
      el('div', { class: 'acoes acoes-coluna' }, [botao,
        temSelo ? el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-resultado-compartilhar', onclick: function () { compartilhar(res); } },
          [U.icone('compartilhar'), 'Compartilhar o selo']) : null,
        el('a', { class: 'botao botao--link', href: '#catalogo', id: 'vg-resultado-voltar' }, 'Voltar aos testes')])
    ]));
    U.anunciar(temSelo ? 'Você ganhou o selo.' : 'Prova concluída.');
  }

  // ------------------------------------------------------------------------------------------------- vagas que sugerem o teste
  function telaVagas(slug) {
    pararProva();
    fixarNav();
    U.carregando(app);
    var vez = novaVez();
    Promise.all([carregarCatalogo(false), carregarVagas()]).then(function (x) {
      if (vez !== ctx.vez) return;
      var t = (x[0].testes || []).filter(function (y) { return y.slug === slug; })[0];
      var vagas = x[1].filter(function (a) { return a.selo === slug; });
      var cab = [el('p', { class: 'sobretitulo' }, t ? t.nome : 'Habilidade testada'),
        el('h1', { id: 'vg-testes-vagas-titulo', class: 'titulo-pagina', tabindex: '-1' }, 'Vagas que sugerem este teste'),
        el('p', { class: 'subtitulo' }, ctx.cidade ? 'Vagas de ' + ctx.cidade.nome + '.' : ''),
        el('p', { class: 'aviso', id: 'vg-testes-vagas-opcional' }, U.t('avisos.teste_opcional'))];
      var corpo = vagas.length
        ? el('ul', { class: 'vg-vagas', id: 'vg-testes-vagas' }, vagas.map(function (a) { return P.cartaoVaga(a, { cidadeAtual: ctx.cidade && ctx.cidade.slug }); }))
        : el('div', { id: 'vg-testes-vagas-vazio' });
      U.trocar(app, el('section', { 'aria-labelledby': 'vg-testes-vagas-titulo' }, cab.concat([corpo,
        el('div', { class: 'acoes' }, el('a', { class: 'botao botao--link', href: '#catalogo', id: 'vg-testes-vagas-voltar' }, 'Voltar aos testes'))])));
      if (!vagas.length) {
        U.vazio(corpo, { titulo: 'Nenhuma vaga sugere este teste agora', texto: TXT.QUEM_NAO_TEM, botao: { rotulo: 'Ver todas as vagas', href: hrefVagas(), id: 'vg-testes-vagas-todas' } });
      }
    }, function (e) { if (vez === ctx.vez) U.tratarErro(e, { raiz: app, aoTentar: function () { telaVagas(slug); } }); });
  }

  // ------------------------------------------------------------------------------------------------- início
  // Em 3G, cada ida e volta conta: a lista de cidades (pública) sai junto com a sessão, e o catálogo sai junto com a conta.
  function iniciar() {
    U.topo({});
    marcarDemonstracao();
    U.aoVoltarInternet(function () { U.faixaOffline(false); });
    var cidades = A.cidades().then(null, function () { return null; /* sem a cidade a tela segue (fuso de reserva) */ });
    A.sessao().then(function () { return true; }, function (e) { if (e && e.sessaoExpirada) return false; throw e; }).then(function (logado) {
      ctx.catalogoPrevio = A.testesCatalogo();
      ctx.catalogoPrevio.then(null, function () { /* a tela que usar mostra o erro */ });
      var conta = logado ? U.exigirConta({ tipo: 'pessoa', raiz: app }).then(function (eu) { ctx.logado = true; ctx.eu = eu; }) : Promise.resolve();
      return Promise.all([conta, cidades]).then(function (x) { definirCidade(x[1]); });
    }).then(function () {
      ctx.roteador = U.roteador({ raiz: app, padrao: 'catalogo', rotas: {
        catalogo: telaCatalogo, 'teste/': telaInstrucoes, prova: telaProva, 'resultado/': telaResultado, 'vagas/': telaVagas,
        '*': function () { ir('catalogo'); } } });
    }).catch(function (e) { U.tratarErro(e, { raiz: app, aoTentar: function () { root.location.reload(); } }); });
  }
  iniciar();
})(typeof self !== 'undefined' ? self : this);
