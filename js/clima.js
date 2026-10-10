/*
 * Pesquisa de Clima da Equipe · Gestão sem Caos — módulo PURO (sem DOM, sem rede), UMD:
 * window.DISC_CLIMA / module.exports.
 *
 * Especificação: docs/painel-cientifico/decisao.md, seções 3.1 (itens, escala, cálculo, faixas, anonimato), 5 (relatório,
 * públicos, o que nunca mostrar, intervenções, 30/60/90) e 6 (avisos e textos obrigatórios, nomes e palavras proibidas).
 * O cálculo e a supressão de VERDADE rodam no banco (supabase/migrations/20261017120000_clima.sql,
 * disc_interno.clima_calcular): este arquivo é a mesma regra em JavaScript, usada pela prévia (js/api-simulada.js), pelos
 * testes (tests/clima.test.js) e pela conferência cruzada SQL × JS (tests/supabase/clima.test.js). Mudou uma regra aqui?
 * Mude no SQL também (o teste cruzado falha se divergirem).
 *
 * API:
 *   VERSAO_ITENS ('v0'), K (5), K_DETALHE (10), ESCALA, ESCALA_N4, BLOCOS, DIMENSOES, ITEM_H1, ITEM_H2, ITENS_LIDER (FL1–FL3),
 *   ITENS_N (N1–N5), item(id) -> {id, texto, bloco, invertido, escala:'concordancia'|'frequencia'|'aberta'}
 *   telas(papel, {complemento, n4}) -> [{id, titulo, topo?, itens:[ids], comentario?: bool}]   (uma tela por bloco)
 *   itensPermitidos(papel, {complemento, n4}) -> [ids]
 *   validarEnvio(corpo, papel, {complemento, n4}) -> {ok, itens, comentario, segundos, chave} | {ok:false, erro}
 *   escoresRespondente(itens, papel) -> {A..G: 0–100|null, H1: 0–100|null}  (F do líder = FL1–FL3)
 *   suprimir(nos, n, base, k) -> {id: bool}   (supressão complementar numa árvore; nos = [{id, pai, ordem}])
 *   calcular({equipes:[{id, nome, area, ordem, convidados}], respostas:[{equipeId, papel, itens, comentario, segundos}],
 *             complemento, n4}) -> resultado congelado (formato no fim deste comentário)
 *   visaoCliente(resultado) -> o mesmo sem o que é só do consultor (lideres, qualidade, AD, contagens de quem não aparece)
 *   faixa(escore), rotuloFaixa, leituraFaixa, rotuloAlinhamento, textoAlinhamento
 *   temasOrdenados(grupo) -> {melhores:[dim], priorizar:[dim]} · intervencoes(resultado) -> [{id, titulo, ...}]
 *   PLANO_30_60_90, avisoRespondente({empresa, complemento, retencaoDias, contatoDados}), AVISO_LIDER, textoN4(canal),
 *   TEXTOS (fixos do relatório, 6.2), REFERENCIAS, PALAVRAS_PROIBIDAS (6.4), nomeCurto(nome)
 *
 * Resultado (o que o banco congela no encerramento da rodada):
 *   { versao:1, versaoItens, k, kDetalhe, convidados, respondentes, taxa (0–100), suprimido (empresa com menos de k),
 *     grupos: [ {id:'empresa'|'area:<nome>'|<equipeId>|'outras:<paiId>', tipo:'empresa'|'area'|'equipe'|'outras', nome,
 *               pai, nivel, ordem, n, convidados?, taxa?, equipes?:[nomes] (área e "outras"),
 *               dimensoes: {A..G: {n, escore, faixa, rwg, alinhamento, ad, distribuicao:{favoravel, intermediario, atencao}|null}|null},
 *               h1: {n, escore, faixa}|null } ]  (ordem fixa do organograma; nunca ranking)
 *     equipes: [ {id, nome, area, ordem, convidados, respondentes, taxa, situacao:'aparece'|'outras'|'nao_aparece',
 *                 motivo:''|'minimo'|'complemento'|'sem_respostas'|'empresa', grupo:'<id do grupo onde a equipe conta>'|''} ]
 *       ('outras' = fundida em "Outras equipes"; 'nao_aparece' com grupo = conta só no total daquele grupo; sem grupo = fora),
 *     complemento: {ligado, n4Ligado, grupos:[{id, nome, itens:{N1,N2,N3,N5: {n, escore, faixa}|null}}], n4:{n, pct}|null},
 *     comentarios: {quantidade, disponivel}, qualidade: {rapidas, linhaReta}, lideres: [{equipeId, dimensoes:{A..G}, h1}] }
 * Arredondamentos (iguais no SQL): inteiro = piso(x + 0,5 + 1e-9); rwg e AD com 2 casas pela mesma regra.
 */
(function (root) {
  'use strict';

  var VERSAO_ITENS = 'v0';
  var K = 5;
  var K_DETALHE = 10;
  var SIGMA2 = 2;            // variância da nula uniforme numa escala de 5 pontos
  var EPS = 1e-9;
  var ORDEM_OUTRAS = 1000000;

  var ESCALA = [
    { valor: 1, rotulo: 'Discordo totalmente' },
    { valor: 2, rotulo: 'Discordo' },
    { valor: 3, rotulo: 'Nem concordo nem discordo' },
    { valor: 4, rotulo: 'Concordo' },
    { valor: 5, rotulo: 'Concordo totalmente' }
  ];
  // N4: frequência. 0 = "Prefiro não responder" (fica fora do denominador).
  var ESCALA_N4 = [
    { valor: 1, rotulo: 'Nunca' },
    { valor: 2, rotulo: 'Uma ou duas vezes' },
    { valor: 3, rotulo: 'Três vezes ou mais' },
    { valor: 0, rotulo: 'Prefiro não responder' }
  ];

  // Itens v0 (rascunho para revisão de conteúdo; decisao.md 3.1.3). invertido = recodificar (6 − x) antes de calcular.
  var BLOCOS = [
    { id: 'A', nome: 'Liberdade para falar', curto: 'Liberdade para falar', minimo: 3, itens: [
      { id: 'A1', texto: 'Nesta equipe, as pessoas falam o que pensam, mesmo quando pensam diferente do líder.' },
      { id: 'A2', texto: 'Quando alguém aqui erra, a conversa é sobre como resolver, e não sobre achar culpado.' },
      { id: 'A3', texto: 'Nesta equipe, quem faz uma pergunta simples pode virar motivo de piada.', invertido: true },
      { id: 'A4', texto: 'Nesta equipe, quem vê um problema avisa logo, mesmo quando a notícia é ruim.' },
      { id: 'A5', texto: 'Aqui dá para propor um jeito novo de fazer o trabalho, mesmo sem ter certeza de que vai dar certo.' }
    ] },
    { id: 'B', nome: 'Clareza de metas e papéis', curto: 'Clareza de metas e papéis', minimo: 2, itens: [
      { id: 'B1', texto: 'Todos na equipe sabem quais são as prioridades deste mês.' },
      { id: 'B2', texto: 'Quando chega uma tarefa nova, fica claro quem é o responsável por ela.' },
      { id: 'B3', texto: 'A equipe sabe como medir se o trabalho do mês deu certo.' },
      { id: 'B4', texto: 'As prioridades mudam tanto que a equipe deixa trabalhos pela metade.', invertido: true }
    ] },
    { id: 'C', nome: 'Confiança e apoio entre colegas', curto: 'Confiança entre colegas', minimo: 2, itens: [
      { id: 'C1', texto: 'Nesta equipe, as pessoas cumprem o que combinam umas com as outras.' },
      { id: 'C2', texto: 'Aqui, as pessoas passam aos colegas as informações de que eles precisam para trabalhar.' },
      { id: 'C3', texto: 'Quando alguém da equipe está sobrecarregado(a), os outros se oferecem para ajudar.' }
    ] },
    { id: 'D', nome: 'Como a equipe lida com divergências', curto: 'Divergências', minimo: 2, itens: [
      { id: 'D1', texto: 'Aqui, desentendimentos pessoais acabam virando briga ou "gelo" entre colegas.', invertido: true },
      { id: 'D2', texto: 'Na nossa equipe, a divisão do trabalho costuma gerar discussão e mal-estar.', invertido: true },
      { id: 'D3', texto: 'Nesta equipe, dá para discordar de uma ideia sem que a conversa vire pessoal.' }
    ] },
    { id: 'E', nome: 'Aprender com o trabalho', curto: 'Aprender com o trabalho', minimo: 2, itens: [
      { id: 'E1', texto: 'Depois de uma entrega importante, a equipe conversa sobre o que deu certo e o que não deu.' },
      { id: 'E2', texto: 'Quando um erro se repete, a equipe muda o jeito de trabalhar para ele não voltar.' },
      { id: 'E3', texto: 'Na nossa equipe, ideias de melhoria saem do papel.' }
    ] },
    { id: 'F', nome: 'Apoio da liderança', curto: 'Apoio da liderança', minimo: 2, topo: 'Seu líder é a pessoa a quem você responde no dia a dia.', itens: [
      { id: 'F1', texto: 'Quando algo no meu trabalho precisa melhorar, meu líder me fala de forma clara.' },
      { id: 'F2', texto: 'Meu líder pede a opinião da equipe antes de decidir coisas que mudam o nosso trabalho.' },
      { id: 'F3', texto: 'Meu líder deixa a equipe decidir como fazer o trabalho, sem controlar cada passo.' }
    ] },
    { id: 'G', nome: 'Carga e recursos', curto: 'Carga e recursos', minimo: 2, itens: [
      { id: 'G1', texto: 'O volume de trabalho que recebo cabe no meu horário normal.' },
      { id: 'G2', texto: 'As metas que recebo são possíveis de alcançar.' },
      { id: 'G3', texto: 'Perco tempo no trabalho por falta de ferramenta, sistema ou informação.', invertido: true }
    ] }
  ];
  var DIMENSOES = BLOCOS.map(function (b) { return b.id; });
  // Formulário do líder: no lugar do bloco F, a autopercepção (mesmo cálculo; entra só na visão líder × equipe).
  var ITENS_LIDER = [
    { id: 'FL1', texto: 'Quando algo no trabalho de alguém da equipe precisa melhorar, eu falo de forma clara com a pessoa.' },
    { id: 'FL2', texto: 'Peço a opinião da equipe antes de decidir coisas que mudam o trabalho dela.' },
    { id: 'FL3', texto: 'Deixo a equipe decidir como fazer o trabalho, sem controlar cada passo.' }
  ];
  var ITEM_H1 = { id: 'H1', texto: 'No geral, esta equipe consegue entregar o que se espera dela.' };
  var ITEM_H2 = { id: 'H2', texto: 'Se você pudesse mudar uma coisa no trabalho da equipe, o que seria?',
    ajuda: 'Opcional. Não escreva nomes nem informações de saúde.' };
  var ITENS_N = [
    { id: 'N1', texto: 'Quando algo muda no meu trabalho (horário, sistema, regra), sou avisado(a) com tempo para me preparar.', nome: 'Aviso de mudanças' },
    { id: 'N2', texto: 'O ritmo do meu trabalho me permite fazer pausas curtas quando preciso.', nome: 'Pausas no ritmo de trabalho' },
    { id: 'N3', texto: 'O esforço que eu coloco no trabalho é reconhecido de forma justa.', nome: 'Reconhecimento do esforço' },
    { id: 'N4', texto: 'Nos últimos 6 meses, fui tratado(a) com grosseria, humilhação ou ameaça no trabalho.', nome: 'Relato de tratamento ofensivo', frequencia: true },
    { id: 'N5', texto: 'Se eu passar por uma situação de desrespeito no trabalho, sei a quem recorrer.', nome: 'Saber a quem recorrer' }
  ];
  var N_INDICADORES = ['N1', 'N2', 'N3', 'N5'];
  var MAX_COMENTARIO = 1000;
  var MAX_SEGUNDOS = 86400;

  var MAPA_ITENS = {};
  BLOCOS.forEach(function (b) {
    b.itens.forEach(function (it) { MAPA_ITENS[it.id] = { id: it.id, texto: it.texto, bloco: b.id, invertido: !!it.invertido, escala: 'concordancia' }; });
  });
  ITENS_LIDER.forEach(function (it) { MAPA_ITENS[it.id] = { id: it.id, texto: it.texto, bloco: 'F', invertido: false, escala: 'concordancia', lider: true }; });
  MAPA_ITENS.H1 = { id: 'H1', texto: ITEM_H1.texto, bloco: 'H', invertido: false, escala: 'concordancia' };
  MAPA_ITENS.H2 = { id: 'H2', texto: ITEM_H2.texto, bloco: 'H', invertido: false, escala: 'aberta' };
  ITENS_N.forEach(function (it) { MAPA_ITENS[it.id] = { id: it.id, texto: it.texto, bloco: 'N', invertido: false, escala: it.frequencia ? 'frequencia' : 'concordancia' }; });

  function item(id) { return MAPA_ITENS[id] ? Object.assign({}, MAPA_ITENS[id]) : null; }
  function bloco(id) { for (var i = 0; i < BLOCOS.length; i++) if (BLOCOS[i].id === id) return BLOCOS[i]; return null; }
  function ids(lista) { return lista.map(function (x) { return x.id; }); }

  /* ------------------------------------------------------------------ formulário (telas e validação) */

  function opcoesForm(o) { o = o || {}; var c = o.complemento === true; return { complemento: c, n4: c && o.n4 === true }; }

  // Uma tela por bloco. Membro: A–G, H (H1 + comentário H2), N (só com o complemento). Líder: A–E, FL (autopercepção), H1.
  function telas(papel, opcoes) {
    var o = opcoesForm(opcoes);
    var lider = papel === 'lider';
    var out = [];
    BLOCOS.forEach(function (b) {
      if (lider && b.id === 'G') return;
      if (lider && b.id === 'F') {
        out.push({ id: 'FL', titulo: 'O seu jeito de liderar', topo: 'Pense em como você conduz a sua equipe no dia a dia.', itens: ids(ITENS_LIDER) });
        return;
      }
      out.push({ id: b.id, titulo: b.nome, topo: b.topo || '', itens: ids(b.itens) });
    });
    out.push({ id: 'H', titulo: 'Para fechar', topo: '', itens: ['H1'], comentario: !lider });
    if (!lider && o.complemento) {
      out.push({ id: 'N', titulo: 'Condições de trabalho', topo: 'Estas perguntas são sobre você e o seu trabalho.',
        itens: ['N1', 'N2', 'N3'].concat(o.n4 ? ['N4'] : []).concat(['N5']) });
    }
    return out;
  }

  function itensPermitidos(papel, opcoes) {
    var l = [];
    telas(papel, opcoes).forEach(function (t) { l = l.concat(t.itens); });
    return l;
  }

  function inteiro(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function limparComentario(v) {
    if (v === null || v === undefined) return '';
    var s = String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return s.length > MAX_COMENTARIO ? s.slice(0, MAX_COMENTARIO).trim() : s;
  }

  // Mesmas regras e mensagens de public.clima_enviar (banco).
  function validarEnvio(corpo, papel, opcoes) {
    var c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : null;
    if (!c) return { ok: false, erro: 'Respostas em formato inválido.' };
    var it = c.itens;
    if (it === undefined || it === null) it = {};
    if (typeof it !== 'object' || Array.isArray(it)) return { ok: false, erro: 'Respostas em formato inválido.' };
    var permitidos = itensPermitidos(papel, opcoes);
    var limpos = {};
    var chaves = Object.keys(it);
    for (var i = 0; i < chaves.length; i++) {
      var k = chaves[i];
      var v = it[k];
      if (permitidos.indexOf(k) === -1 || k === 'H2') return { ok: false, erro: 'Respostas em formato inválido.' };
      if (v === null) continue; // pulou a pergunta
      var faixaOk = k === 'N4' ? (inteiro(v) && v >= 0 && v <= 3) : (inteiro(v) && v >= 1 && v <= 5);
      if (!faixaOk) return { ok: false, erro: 'Respostas em formato inválido.' };
      limpos[k] = v;
    }
    var comentario = papel === 'lider' ? '' : limparComentario(c.comentario);
    if (c.comentario !== undefined && c.comentario !== null && typeof c.comentario !== 'string') return { ok: false, erro: 'Respostas em formato inválido.' };
    var segundos = null;
    if (c.segundos !== undefined && c.segundos !== null) {
      if (!inteiro(c.segundos) || c.segundos < 0) return { ok: false, erro: 'Respostas em formato inválido.' };
      segundos = Math.min(c.segundos, MAX_SEGUNDOS);
    }
    var chave = typeof c.chave === 'string' ? c.chave : '';
    if (!/^[0-9a-f]{32}$/.test(chave)) return { ok: false, erro: 'Respostas em formato inválido.' };
    if (!Object.keys(limpos).length && !comentario) return { ok: false, erro: 'Responda pelo menos uma pergunta antes de enviar.' };
    return { ok: true, itens: limpos, comentario: comentario, segundos: segundos, chave: chave };
  }

  /* ------------------------------------------------------------------ cálculo */

  function arred(x) { return Math.floor(x + 0.5 + EPS); }
  function arred2(x) { return Math.floor(x * 100 + 0.5 + EPS) / 100; }
  function faixa(escore) { return escore >= 75 ? 'favoravel' : (escore >= 50 ? 'intermediario' : 'atencao'); }
  function rotuloAlinhamentoDe(rwg) { var c = Math.round(rwg * 100); return c >= 70 ? 'alinhada' : (c >= 50 ? 'variadas' : 'divididas'); }

  function itensDoBloco(dim, papel) { return dim === 'F' && papel === 'lider' ? ITENS_LIDER : bloco(dim).itens; }
  function valorRecodificado(itens, it) {
    var v = itens[it.id];
    if (!inteiro(v) || v < 1 || v > 5) return null;
    return it.invertido ? 6 - v : v;
  }

  // Escore 0–100 de cada dimensão para uma pessoa: média dos itens respondidos (recodificados) se respondeu pelo menos
  // metade do bloco (arredondando para cima); senão null. Sem arredondar (o grupo arredonda no fim).
  function escoresRespondente(itens, papel) {
    var out = {};
    itens = itens || {};
    DIMENSOES.forEach(function (d) {
      var b = bloco(d);
      var soma = 0, c = 0;
      itensDoBloco(d, papel).forEach(function (it) {
        var x = valorRecodificado(itens, it);
        if (x !== null) { soma += x; c++; }
      });
      out[d] = c >= b.minimo ? 25 * (soma - c) / c : null;
    });
    var h = itens.H1;
    out.H1 = inteiro(h) && h >= 1 && h <= 5 ? (h - 1) * 25 : null;
    return out;
  }

  // Concordância intragrupo do bloco (rwg(j), σ² = 2) e desvio médio (AD), sobre quem tem a dimensão válida.
  function alinhamento(respostas, dim) {
    var its = bloco(dim).itens;
    var variancias = [], ads = [];
    its.forEach(function (it) {
      var xs = [];
      respostas.forEach(function (r) { var x = valorRecodificado(r.itens, it); if (x !== null) xs.push(x); });
      if (xs.length < 2) return;
      var m = 0; xs.forEach(function (x) { m += x; }); m /= xs.length;
      var sq = 0, ab = 0; xs.forEach(function (x) { sq += (x - m) * (x - m); ab += Math.abs(x - m); });
      variancias.push(sq / (xs.length - 1));
      ads.push(ab / xs.length);
    });
    if (!variancias.length) return null;
    var J = variancias.length;
    var s2 = 0; variancias.forEach(function (v) { s2 += v; }); s2 /= J;
    var razao = s2 / SIGMA2;
    var rwg = razao >= 1 ? 0 : (J * (1 - razao)) / (J * (1 - razao) + razao);
    rwg = Math.max(0, Math.min(1, rwg));
    var ad = 0; ads.forEach(function (v) { ad += v; }); ad /= ads.length;
    var r2 = arred2(rwg);
    return { rwg: r2, alinhamento: rotuloAlinhamentoDe(r2), ad: arred2(ad) };
  }

  function pct(c, n) { return n ? arred(100 * c / n) : 0; }

  // Estatística de uma dimensão num conjunto de respostas (membros). Sem supressão (quem chama decide).
  function estatDimensao(resps, dim) {
    var validas = resps.filter(function (r) { return r.escores[dim] !== null; });
    var n = validas.length;
    if (!n) return { n: 0 };
    var s = 0; validas.forEach(function (r) { s += r.escores[dim]; });
    var escore = arred(s / n);
    var al = alinhamento(validas, dim);
    var fav = 0, inter = 0, at = 0;
    validas.forEach(function (r) { var e = r.escores[dim]; if (e >= 75) fav++; else if (e >= 50) inter++; else at++; });
    return { n: n, escore: escore, faixa: faixa(escore), rwg: al ? al.rwg : null, alinhamento: al ? al.alinhamento : null, ad: al ? al.ad : null,
      distribuicao: { favoravel: pct(fav, n), intermediario: pct(inter, n), atencao: pct(at, n) } };
  }
  function estatItemUnico(resps, id) {
    var xs = [];
    resps.forEach(function (r) { var v = r.itens[id]; if (inteiro(v) && v >= 1 && v <= 5) xs.push((v - 1) * 25); });
    if (!xs.length) return { n: 0 };
    var s = 0; xs.forEach(function (x) { s += x; });
    var e = arred(s / xs.length);
    return { n: xs.length, escore: e, faixa: faixa(e) };
  }

  /*
   * Supressão complementar numa árvore em que cada nó com filhos é a união deles (mais o que não aparece).
   *   nos:  [{id, pai ('' na raiz), ordem}]  ·  n: {id: contagem}  ·  base: {id: true se o nó pode aparecer}  ·  k: mínimo
   * Um nó aparece com n >= k; depois, de baixo para cima, em cada nó que aparece o RESTO (n do nó − soma dos filhos que
   * aparecem) precisa ser 0 ou >= k; senão some o filho menor (empate: o que vem depois na ordem) com tudo abaixo dele.
   * Assim nenhuma subtração entre recortes isola menos de k pessoas. A raiz que não aparece esconde tudo.
   */
  function suprimir(nos, n, base, k) {
    var mostrar = {}, filhos = {}, prof = {};
    nos.forEach(function (x) { filhos[x.id] = []; });
    nos.forEach(function (x) { if (x.pai && filhos[x.pai]) filhos[x.pai].push(x); });
    var raiz = nos.filter(function (x) { return !x.pai; })[0];
    function profundidade(x) {
      if (prof[x.id] !== undefined) return prof[x.id];
      var pai = x.pai ? nos.filter(function (y) { return y.id === x.pai; })[0] : null;
      return (prof[x.id] = pai ? profundidade(pai) + 1 : 0);
    }
    nos.forEach(function (x) { mostrar[x.id] = !!base[x.id] && (n[x.id] || 0) >= k; profundidade(x); });
    if (!raiz || !mostrar[raiz.id]) { nos.forEach(function (x) { mostrar[x.id] = false; }); return mostrar; }
    function esconder(x) { mostrar[x.id] = false; filhos[x.id].forEach(esconder); }
    var internos = nos.filter(function (x) { return filhos[x.id].length; }).sort(function (a, b) {
      return prof[b.id] - prof[a.id] || (a.ordem - b.ordem) || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0));
    });
    internos.forEach(function (x) {
      if (!mostrar[x.id]) return;
      for (;;) {
        var vis = filhos[x.id].filter(function (f) { return mostrar[f.id]; });
        var soma = 0; vis.forEach(function (f) { soma += n[f.id] || 0; });
        var resto = (n[x.id] || 0) - soma;
        if (!vis.length || resto === 0 || resto >= k) break;
        var menor = vis[0];
        vis.forEach(function (f) {
          var nf = n[f.id] || 0, nm = n[menor.id] || 0;
          if (nf < nm || (nf === nm && (f.ordem > menor.ordem || (f.ordem === menor.ordem && f.id > menor.id)))) menor = f;
        });
        esconder(menor);
      }
    });
    return mostrar;
  }

  function nomeCurto(nome) {
    var PART = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };
    var partes = String(nome || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!partes.length) return 'Sem nome';
    var primeiro = partes[0].charAt(0).toUpperCase() + partes[0].slice(1);
    for (var i = 1; i < partes.length; i++) {
      if (!PART[partes[i].toLowerCase()]) return primeiro + ' ' + partes[i].charAt(0).toUpperCase() + '.';
    }
    return primeiro;
  }

  /*
   * Cálculo completo da rodada (o que o banco congela no encerramento). Entrada:
   *   equipes: [{id, nome, area, ordem, convidados}] · respostas: [{equipeId, papel:'membro'|'lider', itens, comentario, segundos}]
   *   complemento: bool · n4: bool (canal de escuta informado)
   */
  function calcular(entrada) {
    entrada = entrada || {};
    var equipes = (entrada.equipes || []).slice().sort(function (a, b) { return a.ordem - b.ordem || (a.id < b.id ? -1 : 1); });
    var compl = entrada.complemento === true;
    var n4Ligado = compl && entrada.n4 === true;
    var todas = (entrada.respostas || []).map(function (r) {
      var itens = r.itens && typeof r.itens === 'object' ? r.itens : {};
      return { equipeId: String(r.equipeId), papel: r.papel === 'lider' ? 'lider' : 'membro', itens: itens,
        comentario: typeof r.comentario === 'string' ? r.comentario : '', segundos: inteiro(r.segundos) && r.segundos >= 0 ? r.segundos : null,
        escores: escoresRespondente(itens, r.papel === 'lider' ? 'lider' : 'membro') };
    });
    var membros = todas.filter(function (r) { return r.papel === 'membro'; });
    var porEquipe = {};
    equipes.forEach(function (e) { porEquipe[e.id] = []; });
    membros.forEach(function (r) { if (porEquipe[r.equipeId]) porEquipe[r.equipeId].push(r); });
    membros = membros.filter(function (r) { return !!porEquipe[r.equipeId]; });

    var convidados = 0; equipes.forEach(function (e) { convidados += e.convidados || 0; });
    var res = {
      versao: 1, versaoItens: VERSAO_ITENS, k: K, kDetalhe: K_DETALHE,
      convidados: convidados, respondentes: membros.length, taxa: convidados ? Math.min(100, pct(membros.length, convidados)) : 0,
      suprimido: membros.length < K, grupos: [], equipes: [],
      complemento: { ligado: compl, n4Ligado: n4Ligado, grupos: [], n4: null },
      comentarios: { quantidade: 0, disponivel: false }, qualidade: { rapidas: 0, linhaReta: 0 }, lideres: []
    };

    // 1) Árvore dos recortes: empresa > áreas > equipes. Área = rótulo com 2+ equipes e menos que todas (uma área com
    //    1 equipe é a própria equipe; com todas, é a empresa).
    var areas = {}, ordemArea = [];
    equipes.forEach(function (e) {
      var a = String(e.area || '').trim();
      if (!a) return;
      if (!areas[a]) { areas[a] = []; ordemArea.push(a); }
      areas[a].push(e);
    });
    function ehArea(a) { return !!a && areas[a].length >= 2 && areas[a].length < equipes.length; }
    var nos = [{ id: 'empresa', pai: '', ordem: 0, tipo: 'empresa', equipes: equipes.map(function (e) { return e.id; }) }];
    ordemArea.forEach(function (a) {
      if (!ehArea(a)) return;
      nos.push({ id: 'area:' + a, pai: 'empresa', ordem: areas[a][0].ordem, tipo: 'area', nome: a, equipes: areas[a].map(function (e) { return e.id; }) });
    });
    equipes.forEach(function (e) {
      var a = String(e.area || '').trim();
      var pai = ehArea(a) ? 'area:' + a : 'empresa';
      nos.push({ id: e.id, pai: pai, ordem: e.ordem, tipo: 'equipe', nome: e.nome, area: a, equipes: [e.id] });
    });
    function respsDe(no) { var l = []; no.equipes.forEach(function (id) { l = l.concat(porEquipe[id] || []); }); return l; }
    var nGrupo = {}, base = {};
    nos.forEach(function (x) { nGrupo[x.id] = respsDe(x).length; base[x.id] = true; });
    var mostra = suprimir(nos, nGrupo, base, K);

    // 2) Árvore exibida: nós que aparecem + "Outras equipes" (o resto de cada nó que tem filhos aparecendo).
    var exib = [];
    var noPorId = {}; nos.forEach(function (x) { noPorId[x.id] = x; });
    // Filhos na ordem do organograma (áreas e equipes soltas intercaladas pela ordem da 1ª equipe).
    function filhosDe(id) {
      return nos.filter(function (x) { return x.pai === id; }).sort(function (a, b) { return a.ordem - b.ordem || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)); });
    }
    function montar(x, paiExib, nivel) {
      var no = { id: x.id, pai: paiExib, ordem: x.ordem, tipo: x.tipo, nome: x.tipo === 'empresa' ? 'Toda a empresa' : x.nome, nivel: nivel, equipes: x.equipes.slice() };
      exib.push(no);
      var fs = filhosDe(x.id);
      var vis = fs.filter(function (f) { return mostra[f.id]; });
      vis.forEach(function (f) { montar(f, x.id, nivel + 1); });
      if (vis.length) {
        var cobertas = {}; vis.forEach(function (f) { f.equipes.forEach(function (id) { cobertas[id] = true; }); });
        var resto = x.equipes.filter(function (id) { return !cobertas[id]; });
        var nResto = 0; resto.forEach(function (id) { nResto += (porEquipe[id] || []).length; });
        if (nResto > 0) exib.push({ id: 'outras:' + x.id, pai: x.id, ordem: ORDEM_OUTRAS, tipo: 'outras', nome: 'Outras equipes', nivel: nivel + 1, equipes: resto });
      }
    }
    if (mostra.empresa) montar(noPorId.empresa, '', 0);

    // 3) Supressão por estatística (cada dimensão, H1) e da distribuição (k >= 10) na árvore exibida.
    var respExib = {}; exib.forEach(function (x) { respExib[x.id] = respsDe(x); });
    var baseExib = {}; exib.forEach(function (x) { baseExib[x.id] = true; });
    var grupos = exib.map(function (x) {
      var g = { id: x.id, tipo: x.tipo, nome: x.nome, pai: x.pai, nivel: x.nivel, ordem: x.ordem, n: respExib[x.id].length, dimensoes: {}, h1: null };
      if (x.tipo === 'area' || x.tipo === 'outras') g.equipes = x.equipes.map(function (id) { return equipes.filter(function (e) { return e.id === id; })[0].nome; });
      if (x.tipo !== 'outras') {
        var conv = 0; x.equipes.forEach(function (id) { conv += (equipes.filter(function (e) { return e.id === id; })[0].convidados || 0); });
        g.convidados = conv;
        g.taxa = conv ? Math.min(100, pct(g.n, conv)) : 0;
      }
      return g;
    });
    var gPorId = {}; grupos.forEach(function (g) { gPorId[g.id] = g; });
    DIMENSOES.forEach(function (d) {
      var est = {}, nd = {};
      exib.forEach(function (x) { est[x.id] = estatDimensao(respExib[x.id], d); nd[x.id] = est[x.id].n; });
      var m = suprimir(exib, nd, baseExib, K);
      var md = suprimir(exib, nd, m, K_DETALHE);
      exib.forEach(function (x) {
        var e = est[x.id];
        gPorId[x.id].dimensoes[d] = m[x.id] ? { n: e.n, escore: e.escore, faixa: e.faixa, rwg: e.rwg, alinhamento: e.alinhamento, ad: e.ad,
          distribuicao: md[x.id] ? e.distribuicao : null } : null;
      });
    });
    (function () {
      var est = {}, nh = {};
      exib.forEach(function (x) { est[x.id] = estatItemUnico(respExib[x.id], 'H1'); nh[x.id] = est[x.id].n; });
      var m = suprimir(exib, nh, baseExib, K);
      exib.forEach(function (x) { gPorId[x.id].h1 = m[x.id] ? { n: est[x.id].n, escore: est[x.id].escore, faixa: est[x.id].faixa } : null; });
    })();
    res.grupos = grupos;

    // 4) Situação de cada equipe (painel: "aparece", "fundida em Outras equipes" ou "não aparece").
    res.equipes = equipes.map(function (e) {
      var n = (porEquipe[e.id] || []).length;
      var s = { id: e.id, nome: e.nome, area: String(e.area || '').trim(), ordem: e.ordem, convidados: e.convidados || 0, respondentes: n,
        taxa: e.convidados ? Math.min(100, pct(n, e.convidados)) : 0, situacao: 'nao_aparece', motivo: '', grupo: '' };
      if (gPorId[e.id]) { s.situacao = 'aparece'; s.grupo = e.id; return s; }
      if (!n) { s.motivo = 'sem_respostas'; return s; }
      if (!mostra.empresa) { s.motivo = 'empresa'; return s; }
      s.motivo = n < K ? 'minimo' : 'complemento';
      var outras = exib.filter(function (x) { return x.tipo === 'outras' && x.equipes.indexOf(e.id) >= 0; })[0];
      if (outras) { s.situacao = 'outras'; s.grupo = outras.id; return s; }
      // Sem "Outras equipes" (o grupo de cima não tem outro recorte aparecendo): conta só no total desse grupo.
      var acima = noPorId[e.id].pai;
      while (acima && !gPorId[acima]) acima = noPorId[acima].pai;
      s.grupo = acima || '';
      return s;
    });

    // 5) Complemento N (k >= 10): N1–N3 e N5 na empresa e nas áreas que aparecem; N4 só na empresa.
    if (compl && mostra.empresa) {
      var nosN = exib.filter(function (x) { return x.tipo === 'empresa' || x.tipo === 'area'; }).map(function (x) { return { id: x.id, pai: x.pai, ordem: x.ordem }; });
      var gruposN = nosN.map(function (x) { return { id: x.id, nome: gPorId[x.id].nome, itens: {} }; });
      N_INDICADORES.forEach(function (id) {
        var est = {}, nn = {}, b = {};
        nosN.forEach(function (x) { est[x.id] = estatItemUnico(respExib[x.id], id); nn[x.id] = est[x.id].n; b[x.id] = true; });
        var m = suprimir(nosN, nn, b, K_DETALHE);
        gruposN.forEach(function (g) { g.itens[id] = m[g.id] ? { n: est[g.id].n, escore: est[g.id].escore, faixa: est[g.id].faixa } : null; });
      });
      res.complemento.grupos = gruposN;
      if (n4Ligado) {
        var resp4 = membros.filter(function (r) { var v = r.itens.N4; return inteiro(v) && v >= 1 && v <= 3; });
        if (resp4.length >= K_DETALHE) {
          var relatos = resp4.filter(function (r) { return r.itens.N4 >= 2; }).length;
          res.complemento.n4 = { n: resp4.length, pct: pct(relatos, resp4.length) };
        }
      }
    }

    // 6) Comentários (só quantidade; o texto fica no banco até a retenção), qualidade e visão do líder (só consultor).
    res.comentarios.quantidade = membros.filter(function (r) { return r.comentario.trim() !== ''; }).length;
    res.comentarios.disponivel = membros.length >= K_DETALHE;
    todas.filter(function (r) { return !!porEquipe[r.equipeId]; }).forEach(function (r) {
      var respondidos = Object.keys(r.itens).filter(function (k) { var v = r.itens[k]; return inteiro(v) && v >= 1 && v <= (k === 'N4' ? 3 : 5); });
      if (r.segundos !== null && respondidos.length && r.segundos < 2 * respondidos.length) res.qualidade.rapidas++;
      var likert = respondidos.filter(function (k) { return k !== 'N4'; });
      var inv = likert.some(function (k) { return MAPA_ITENS[k] && MAPA_ITENS[k].invertido; });
      if (likert.length >= 6 && inv && likert.every(function (k) { return r.itens[k] === r.itens[likert[0]]; })) res.qualidade.linhaReta++;
    });
    equipes.forEach(function (e) {
      if (!gPorId[e.id]) return;
      var l = todas.filter(function (r) { return r.papel === 'lider' && r.equipeId === e.id; })[0];
      if (!l) return;
      var dims = {};
      DIMENSOES.forEach(function (d) { dims[d] = d === 'G' || l.escores[d] === null ? null : arred(l.escores[d]); });
      res.lideres.push({ equipeId: e.id, dimensoes: dims, h1: l.escores.H1 === null ? null : arred(l.escores.H1) });
    });
    return res;
  }

  // O que vai para o relatório do cliente (dono): sem a visão do líder, sem qualidade, sem AD e sem contagens de quem
  // não aparece (nunca "quem respondeu"; a taxa só aparece agregada nos grupos que passam no mínimo).
  function visaoCliente(r) {
    var c = JSON.parse(JSON.stringify(r || {}));
    delete c.lideres;
    delete c.lideresApagados;
    delete c.qualidade;
    (c.grupos || []).forEach(function (g) {
      Object.keys(g.dimensoes || {}).forEach(function (d) { if (g.dimensoes[d]) delete g.dimensoes[d].ad; });
    });
    c.equipes = (c.equipes || []).map(function (e) {
      var s = { id: e.id, nome: e.nome, area: e.area, ordem: e.ordem, situacao: e.situacao, motivo: e.motivo, grupo: e.grupo };
      if (e.situacao === 'aparece') { s.convidados = e.convidados; s.respondentes = e.respondentes; s.taxa = e.taxa; }
      return s;
    });
    return c;
  }

  /* ------------------------------------------------------------------ leitura (relatório e painel) */

  var ROTULO_FAIXA = { favoravel: 'Favorável', intermediario: 'Intermediário', atencao: 'Ponto de atenção' };
  var LEITURA_FAIXA = {
    favoravel: 'A equipe relata uma boa experiência neste tema.',
    intermediario: 'Há pontos a melhorar neste tema; vale conversar.',
    atencao: 'A equipe relata dificuldade neste tema; vale priorizar na conversa.'
  };
  var ROTULO_ALINHAMENTO = { alinhada: 'Equipe alinhada', variadas: 'Opiniões variadas', divididas: 'Opiniões divididas' };
  var TEXTO_ALINHAMENTO = {
    alinhada: 'As respostas são parecidas entre si.',
    variadas: 'Parte das pessoas vê o tema de um jeito e parte de outro.',
    divididas: 'A média não representa bem a equipe. Vale entender as diferentes experiências na conversa de devolutiva.'
  };
  function rotuloFaixa(f) { return ROTULO_FAIXA[f] || '—'; }
  function leituraFaixa(f) { return LEITURA_FAIXA[f] || ''; }
  function rotuloAlinhamento(a) { return ROTULO_ALINHAMENTO[a] || ''; }
  function textoAlinhamento(a) { return TEXTO_ALINHAMENTO[a] || ''; }

  // Temas com melhor e pior escore num grupo (só os que aparecem). Não é ranking de equipes: é dentro de um grupo.
  function temasOrdenados(grupo) {
    var dims = DIMENSOES.filter(function (d) { return grupo && grupo.dimensoes && grupo.dimensoes[d]; });
    var ord = dims.slice().sort(function (a, b) { return grupo.dimensoes[b].escore - grupo.dimensoes[a].escore || DIMENSOES.indexOf(a) - DIMENSOES.indexOf(b); });
    var nm = Math.min(3, Math.floor(ord.length / 2));
    var np = Math.min(3, ord.length - nm);
    return { melhores: ord.slice(0, nm), priorizar: ord.slice(ord.length - np).reverse() };
  }

  // Menu de intervenções (decisao.md 5.7). Base: só referências verificadas nos pareceres (autor e ano).
  var INTERVENCOES = {
    debrief: { titulo: 'Conversa curta depois de cada entrega (debrief)', resultado: 'Aprender com o trabalho baixo; apoio aos outros temas',
      comoFazer: '20 minutos depois de cada entrega importante ou a cada 15 dias, com 4 perguntas fixas (o que era para acontecer, o que aconteceu, por quê, o que fazer diferente). Quem facilita muda a cada vez; sai 1 compromisso registrado.',
      base: 'Tannenbaum & Cerasoli, 2013' },
    metas: { titulo: 'Metas de equipe específicas', resultado: 'Clareza de metas e papéis baixa',
      comoFazer: '1 a 3 metas da equipe por trimestre, visíveis para todos. Rever metas individuais que competem entre si.',
      base: 'Kleingeld, van Mierlo & Arends, 2011' },
    papeis: { titulo: 'Combinar quem decide o quê', resultado: 'Clareza baixa ou divisão do trabalho gerando mal-estar',
      comoFazer: 'Oficina de 90 minutos: listar as entregas que se repetem, um responsável por item; as zonas cinzentas a liderança resolve.',
      base: 'Klein et al., 2009' },
    acordo: { titulo: 'Acordo de equipe e combinados para discordar', resultado: 'Confiança ou forma de lidar com divergências baixa',
      comoFazer: 'Acordo de 1 página escrito pela equipe, revisto em 60 dias. Se o desconforto estiver concentrado entre duas pessoas: conversa mediada, não oficina coletiva.',
      base: 'Mathieu & Rapp, 2009' },
    fala: { titulo: 'Liderança que abre espaço para falar', resultado: 'Liberdade para falar baixa',
      comoFazer: 'Treino da liderança para conversas individuais; perguntar antes de afirmar; reagir bem a más notícias; rituais curtos em que todos falam. Nada de palestra sobre o tema.',
      base: "O'Donovan & McAuliffe, 2020" },
    umAum: { titulo: 'Conversa individual quinzenal, feedback sobre a tarefa e delegação', resultado: 'Apoio da liderança baixo',
      comoFazer: 'Roteiro fixo de 1:1 a cada 15 dias (prioridades, bloqueios, desenvolvimento). Feedback sobre o trabalho, não sobre a pessoa.',
      base: 'Kluger & DeNisi, 1996; Burke et al., 2006' },
    indicadores: { titulo: 'Indicadores da equipe com retorno mensal', resultado: 'Percepção de entrega baixa',
      comoFazer: '3 a 5 indicadores que a equipe controla, num quadro visível; reunião mensal de 30 minutos para olhar e ajustar.',
      base: 'Pritchard et al., 2008' },
    carga: { titulo: 'Medidas organizacionais sobre carga e recursos', resultado: 'Carga e recursos baixo',
      comoFazer: 'Reunião de priorização com a direção: o que a equipe para de fazer, o que é redistribuído, que recurso falta e que prazo muda. Levar ao responsável pelo gerenciamento de riscos. Nunca responder a excesso de trabalho com programa de resiliência.',
      base: 'Lesener, Gusy & Wolter, 2019' },
    canal: { titulo: 'Acionar o canal de escuta e a apuração da empresa', resultado: 'Relatos de tratamento ofensivo',
      comoFazer: 'A empresa aciona o próprio canal e a apuração, com orientação jurídica. A pesquisa não é canal de denúncia e não identifica ninguém. Nunca fazer oficina coletiva sobre o tema.',
      base: '' },
    mudancas: { titulo: 'Avisar mudanças com antecedência e ouvir quem é afetado', resultado: 'Aviso de mudanças baixo',
      comoFazer: 'Calendário de mudanças e um prazo mínimo de aviso combinado; consultar quem é afetado antes de mudar.',
      base: 'ISO 45003' }
  };
  var INTERVENCAO_POR_DIMENSAO = { A: ['fala', 'debrief'], B: ['metas', 'papeis'], C: ['acordo'], D: ['acordo', 'papeis'], E: ['debrief'], F: ['umAum'], G: ['carga'] };
  var NAO_RECOMENDAR = 'Não recomendamos como resposta principal: confraternização ou atividade recreativa, palestra motivacional, remanejar pessoas por perfil DISC, programa de resiliência como resposta a carga excessiva.';

  // 2 ou 3 intervenções a partir do total da empresa (pontos de atenção primeiro, depois intermediários, do menor escore).
  // Relato de tratamento ofensivo (N4 > 0) e aviso de mudanças baixo entram à parte.
  function intervencoes(resultado) {
    var emp = resultado && resultado.grupos ? resultado.grupos.filter(function (g) { return g.tipo === 'empresa'; })[0] : null;
    var out = [], usadas = {};
    function por(id, motivo, prioridade) {
      if (usadas[id] || !INTERVENCOES[id]) return;
      usadas[id] = true;
      out.push(Object.assign({ id: id, motivo: motivo, prioridade: prioridade }, INTERVENCOES[id]));
    }
    if (emp) {
      var cand = DIMENSOES.filter(function (d) { return emp.dimensoes[d] && emp.dimensoes[d].faixa !== 'favoravel'; }).sort(function (a, b) {
        var fa = emp.dimensoes[a].faixa === 'atencao' ? 0 : 1, fb = emp.dimensoes[b].faixa === 'atencao' ? 0 : 1;
        return fa - fb || emp.dimensoes[a].escore - emp.dimensoes[b].escore || DIMENSOES.indexOf(a) - DIMENSOES.indexOf(b);
      });
      cand.forEach(function (d) {
        if (out.length >= 3) return;
        var b = bloco(d);
        por(INTERVENCAO_POR_DIMENSAO[d][0], b.nome + ': ' + rotuloFaixa(emp.dimensoes[d].faixa).toLowerCase() + ' (' + emp.dimensoes[d].escore + ')', emp.dimensoes[d].faixa === 'atencao' ? 'alta' : 'media');
      });
      if (out.length && out.length < 3 && !usadas.debrief) por('debrief', 'Apoio às outras ações: a equipe olha junto o que mudou.', 'apoio');
      if (emp.h1 && emp.h1.faixa === 'atencao' && out.length < 3) por('indicadores', 'Percepção de entrega: ponto de atenção (' + emp.h1.escore + ')', 'media');
    }
    var comp = resultado && resultado.complemento;
    if (comp && comp.grupos) {
      var ce = comp.grupos.filter(function (g) { return g.id === 'empresa'; })[0];
      if (ce && ce.itens.N1 && ce.itens.N1.faixa === 'atencao') por('mudancas', 'Aviso de mudanças: ponto de atenção (' + ce.itens.N1.escore + ')', 'media');
    }
    if (comp && comp.n4 && comp.n4.pct > 0) por('canal', 'Há relatos de tratamento ofensivo nos últimos 6 meses (' + comp.n4.pct + '% de quem respondeu).', 'alta');
    return out;
  }

  // Plano 30/60/90 e reaplicação (decisao.md 5.8). Responsável e data ficam em branco para o cliente preencher.
  var PLANO_30_60_90 = [
    { momento: 'Dias 0 a 10', oque: 'Devolutiva à liderança (60 min); depois, oficina com a equipe (60 a 90 min): a equipe confere a leitura e escolhe 2 prioridades.', quem: 'Consultoria e liderança', indicador: 'Oficina feita; 2 prioridades escritas' },
    { momento: 'Dia 30', oque: 'Rotinas implantadas: acordo publicado, pelo menos 2 debriefs, mapa de quem decide o quê.', quem: 'Liderança', indicador: 'Número de debriefs; acordo publicado' },
    { momento: 'Dia 60', oque: 'Pulso: 6 a 8 perguntas (temas escolhidos e "vi mudanças concretas"); revisão com a consultoria.', quem: 'Consultoria', indicador: 'Adesão de 60% ou mais; direção da mudança' },
    { momento: 'Dia 90', oque: 'Revisão: indicadores do negócio e situação das ações; manter, trocar ou encerrar cada ação.', quem: 'Liderança e direção', indicador: 'Ações concluídas' },
    { momento: 'Mês 6', oque: 'Pesquisa completa de novo e comparação com esta rodada.', quem: 'Consultoria', indicador: 'Mudança fora da margem (10 pontos ou mais, provisório)' },
    { momento: 'Depois', oque: 'Pesquisa completa 1 vez por ano; pulso a cada 3 a 6 meses; reaplicar também depois de mudança grande (troca de liderança, fusão de equipes, desligamentos).', quem: 'Consultoria', indicador: '' }
  ];
  var ITEM_PULSO = { id: 'P1', texto: 'Depois da última pesquisa, vi mudanças concretas no trabalho da equipe.' };

  /* ------------------------------------------------------------------ textos obrigatórios (decisao.md 6.1 e 6.2) */

  // Aviso ao respondente (link coletivo, anônimo). Os trechos entre colchetes da decisão viram dados da rodada; o que
  // depende do advogado (base legal) só aparece quando estiver definido (CONFIG.CLIMA_BASE_LEGAL).
  function avisoRespondente(o) {
    o = o || {};
    var emp = String(o.empresa || '').trim() || 'a empresa';
    var dias = inteiro(o.retencaoDias) && o.retencaoDias > 0 ? o.retencaoDias : 90;
    var contato = String(o.contatoDados || '').trim();
    var baseLegal = String(o.baseLegal || '').trim();
    return {
      titulo: 'Pesquisa de Clima da Equipe · ' + (String(o.empresa || '').trim() || 'Gestão sem Caos'),
      paragrafos: [
        { rotulo: 'O que é:', texto: 'perguntas sobre como você percebe o seu trabalho: organização das tarefas, liderança, apoio do time e liberdade para falar. Leva cerca de 5 minutos. Pesquisa para maiores de 18 anos.' },
        { rotulo: 'Quem conduz:', texto: emp + ' é a responsável pela pesquisa. A Gestão sem Caos cuida da coleta e do relatório em nome dela.' },
        { rotulo: 'É voluntário.', texto: 'Você pode pular perguntas ou parar no meio. Nada muda para você por isso.' },
        { rotulo: 'Não pedimos o seu nome.', texto: 'A resposta não fica ligada a você: não guardamos nome, telefone, e-mail nem endereço de internet junto com ela.' },
        { rotulo: 'A empresa só vê resultados de grupo.', texto: 'Um grupo só aparece no relatório com pelo menos 5 respostas. Detalhes e comentários, só com 10 ou mais. Ninguém da empresa vê a sua resposta nem sabe se você respondeu. Nada aparece antes do fim da pesquisa.' },
        { rotulo: 'Comentários:', texto: 'não escreva nomes de pessoas nem informações sobre a sua saúde. A empresa recebe os comentários resumidos por tema, sem o texto original.' },
        { rotulo: 'Para que serve:', texto: 'orientar melhorias no ambiente de trabalho' + (o.complemento ? ' e apoiar a identificação de fatores psicossociais no programa de gerenciamento de riscos da empresa (NR-1)' : '') + '. Não serve para avaliar ninguém individualmente.' },
        { rotulo: 'Não é avaliação psicológica', texto: 'e não avalia a sua saúde.' },
        { rotulo: 'Por quanto tempo:', texto: 'as respostas são apagadas ou viram números de grupo em até ' + dias + ' dias depois da entrega do relatório.' },
        { rotulo: 'Seus direitos:', texto: 'como a resposta não fica ligada a você, depois de enviada não é possível encontrá-la para corrigir ou apagar. Dúvidas sobre dados: ' +
          (contato ? contato + ' ou ' : '') + 'a Gestão sem Caos.' + (baseLegal ? ' Base legal: ' + baseLegal + ', conforme a LGPD (Lei 13.709/2018).' : ' Tratamento conforme a LGPD (Lei 13.709/2018).') }
      ],
      aceite: 'Li este aviso e quero responder.'
    };
  }
  var AVISO_LIDER = 'Sua parte como líder. Você responde às mesmas perguntas sobre a sua equipe e a três perguntas sobre o seu jeito de liderar. A sua resposta não entra na média da equipe. Você verá a sua visão ao lado da visão da equipe, por tema, e só você e o consultor da Gestão sem Caos veem essa comparação. Ela serve para o seu desenvolvimento e não pode ser usada em avaliação de desempenho, bônus ou ranking de líderes.';
  function textoN4(canal) {
    var t = String(canal || '').trim();
    return 'Se você está passando por isso, procure ' + (t || 'o canal de escuta da empresa') + '. Esta pesquisa não é canal de denúncia e não identifica quem respondeu.';
  }
  var TEXTOS = {
    abertura: 'Clima é a percepção coletiva do ambiente de trabalho. Este relatório não avalia pessoas, não faz diagnóstico de saúde e não é avaliação psicológica.',
    faixas: 'Faixas de referência provisórias, definidas pela escala de resposta. Não são normas nem comparação com outras empresas.',
    margem: 'Estimativa com margem ampla: com menos de 10 respostas, pequenas mudanças de opinião movem bastante o resultado.',
    divididas: 'A média não representa bem a equipe. Vale entender as diferentes experiências na conversa de devolutiva.',
    adesao: function (taxa) { return 'Baixa adesão (' + taxa + '% responderam): leia com cautela.'; },
    origem: 'Perguntas próprias da Gestão sem Caos, inspiradas em temas estudados pela psicologia organizacional (referências no anexo). Em validação.',
    nr1: 'Este material apoia a identificação de fatores psicossociais e a consulta aos trabalhadores prevista no gerenciamento de riscos ocupacionais (NR-1). Não substitui o PGR, a avaliação de riscos nem o plano de ação, que são do empregador e do responsável técnico.',
    usoProibido: 'Não use este relatório para decidir contratação, promoção, desligamento, remanejamento, salário ou bônus.',
    naoRanking: 'Os grupos aparecem na ordem do organograma, sem ordenar do melhor para o pior. Comparar equipes ou lideranças entre si não é o objetivo e não deve virar ranking, bônus ou avaliação de desempenho.',
    naoRecomendar: NAO_RECOMENDAR
  };
  var TAXA_MINIMA = 60;

  // Correspondência com os exemplos do Guia do MTE (decisao.md 5.3), sem a palavra proibida como rótulo.
  var MAPA_PGR = [
    { indicador: 'G', nome: 'Carga e recursos', fator: 'excesso de trabalho; metas impossíveis' },
    { indicador: 'F', nome: 'Apoio da liderança', fator: 'falta de apoio da chefia' },
    { indicador: 'B', nome: 'Clareza de metas e papéis', fator: 'falhas de comunicação' },
    { indicador: 'C', nome: 'Confiança entre colegas', fator: 'relações e conflito no trabalho' },
    { indicador: 'D', nome: 'Divergências', fator: 'relações e conflito no trabalho' },
    { indicador: 'N3', nome: 'Reconhecimento do esforço', fator: 'desequilíbrio entre esforço e recompensa' },
    { indicador: 'N4', nome: 'Relato de tratamento ofensivo', fator: 'comportamento ofensivo no trabalho, como relato agregado (a apuração é da empresa)' },
    { indicador: 'N1', nome: 'Aviso de mudanças', fator: 'gestão de mudanças (ISO 45003)' }
  ];
  var FALTA_PGR = [
    'avaliação de risco (severidade × probabilidade) com critério documentado;',
    'inventário de riscos e plano de ação no PGR;',
    'implementação, acompanhamento e comunicação aos trabalhadores;',
    'integração com o PCMSO e a CIPA;',
    'outras fontes: afastamentos, CATs, horas extras, rotatividade, faltas, canal de denúncia, observação do trabalho, AEP/AET da NR-17;',
    'fatores que pedem registro e não percepção: jornada, turnos, pausas, trabalho isolado, violência de terceiros.'
  ];

  // Referências do anexo de método: só as verificadas nos pareceres (decisao.md 3.1.3; as de memória ficaram de fora).
  var REFERENCIAS = [
    'Edmondson, 1999 — segurança psicológica e aprendizagem de equipes.',
    'Frazier et al., 2017 — meta-análise sobre segurança psicológica.',
    'Kleingeld, van Mierlo & Arends, 2011 — metas de grupo.',
    'Wageman, Hackman & Lehman, 2005 — condições de efetividade de equipes.',
    'De Jong, Dirks & Gillespie, 2016 — confiança dentro da equipe.',
    'Mesmer-Magnus & DeChurch, 2009 — compartilhamento de informação.',
    'de Wit, Greer & Jehn, 2012 — conflitos em equipes.',
    'Marlow & Lacerenza, 2025 — aprendizagem e reflexão de equipes.',
    'Tannenbaum & Cerasoli, 2013 — debriefs.',
    'Burke et al., 2006 — liderança em equipes.',
    'Kluger & DeNisi, 1996 — feedback.',
    'Lesener, Gusy & Wolter, 2019 — demandas e recursos do trabalho.',
    'LeBreton & Senter, 2008 — concordância dentro do grupo (rwg).',
    'ISO 45003 — saúde e segurança psicológica no trabalho.'
  ];

  // Palavras e promessas proibidas nos relatórios e telas (decisao.md 6.3 e 6.4). Os testes varrem os textos gerados.
  var PALAVRAS_PROIBIDAS = ['burnout', 'adoecimento', 'depressão', 'ansiedade', 'tóxic', 'assédio', 'risco grave', 'crítico',
    'harmonia', 'travador', 'tensão', 'validado', 'validada', 'laudo', 'comprovad', 'científic', 'garante', 'conformidade', 'certificado',
    'selo nr-1', 'prevê desempenho', 'teste de clima', 'avaliação de riscos psicossociais', 'notus'];

  var DISC_CLIMA = {
    VERSAO_ITENS: VERSAO_ITENS, K: K, K_DETALHE: K_DETALHE, SIGMA2: SIGMA2, TAXA_MINIMA: TAXA_MINIMA, MAX_COMENTARIO: MAX_COMENTARIO,
    ESCALA: ESCALA, ESCALA_N4: ESCALA_N4, BLOCOS: BLOCOS, DIMENSOES: DIMENSOES, ITENS_LIDER: ITENS_LIDER, ITEM_H1: ITEM_H1, ITEM_H2: ITEM_H2,
    ITENS_N: ITENS_N, N_INDICADORES: N_INDICADORES, ITEM_PULSO: ITEM_PULSO,
    item: item, bloco: bloco, telas: telas, itensPermitidos: itensPermitidos, validarEnvio: validarEnvio, limparComentario: limparComentario,
    escoresRespondente: escoresRespondente, alinhamento: alinhamento, suprimir: suprimir, calcular: calcular, visaoCliente: visaoCliente,
    faixa: faixa, rotuloFaixa: rotuloFaixa, leituraFaixa: leituraFaixa, rotuloAlinhamento: rotuloAlinhamento, textoAlinhamento: textoAlinhamento,
    temasOrdenados: temasOrdenados, intervencoes: intervencoes, INTERVENCOES: INTERVENCOES, PLANO_30_60_90: PLANO_30_60_90,
    avisoRespondente: avisoRespondente, AVISO_LIDER: AVISO_LIDER, textoN4: textoN4, TEXTOS: TEXTOS, MAPA_PGR: MAPA_PGR, FALTA_PGR: FALTA_PGR,
    REFERENCIAS: REFERENCIAS, PALAVRAS_PROIBIDAS: PALAVRAS_PROIBIDAS, nomeCurto: nomeCurto, arred: arred, arred2: arred2
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_CLIMA;
  else root.DISC_CLIMA = DISC_CLIMA;
})(typeof self !== 'undefined' ? self : this);
