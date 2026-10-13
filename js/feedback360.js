/*
 * Feedback 360 da Liderança · Gestão sem Caos — módulo PURO (sem DOM, sem rede), UMD: window.DISC_F360 / module.exports.
 *
 * Especificação: docs/painel-cientifico/360/decisao.md, seções 3.1 (formulários, escala, itens DIR/FBK/APO/AUT/RES/COE,
 * GLB1, AB1/AB2, cálculo por fonte, mínimos, fusão, quem avalia quem e teto de formulários), 4 (capítulos do relatório,
 * quem vê o quê, devolutiva, plano, menu de ações, DISC e clima) e 5 (avisos, textos fixos, nomes e palavras proibidas).
 * A agregação e a supressão de VERDADE rodam no banco (supabase/migrations/20261021120000_feedback360.sql,
 * disc_interno.f360_calcular): este arquivo é a mesma regra em JavaScript, usada pela prévia (js/api-simulada.js), pelos
 * testes (tests/feedback360.test.js) e pela conferência cruzada SQL × JS (tests/supabase/feedback360.test.js). Mudou uma
 * regra de calcular()? Mude no SQL também (o teste cruzado falha se divergirem). O que é derivado do que já foi suprimido
 * (leitura pela âncora, destaques, diferenças, hipóteses DISC, consolidado) fica só aqui: o relatório calcula na hora.
 *
 * API:
 *   VERSAO_ITENS ('v0'), K_TEMA (3), K_ITEM (5), K_VARIADAS (5), K_CONSOLIDADO (5), LIMIAR_DIFERENCA (1,0), TETO (4),
 *   FONTES, ANONIMAS, NOME_FONTE, ESCALA (1–5 com rótulo), OPCAO_FORA / OPCAO_FORA_AUTO (0), ESCALA_GLB, TEMAS, IDS_ITENS,
 *   GLB1, AB1, AB2, item(id), tema(id), textoItem(id, fonte, nome), telas(fonte) -> [{id, titulo, itens, comentarios?}]
 *   validarEnvio(corpo, fonte) -> {ok, itens, comentarios:{AB1, AB2}, segundos} | {ok:false, erro}
 *   temasDoAvaliador(itens) -> {DIR..COE: média|null} (mínimo 2 de 3 frases válidas)
 *   calcular({respostas:[{fonte, itens, segundos}], convidados:{fonte: n}, excluir:[fontes anônimas]}) -> resultado
 *   visaoLider(resultado) -> o mesmo sem o que é só do consultor (distribuição, contagens por fonte, sinalizadas por fonte)
 *   leitura(media) -> {id, rotulo} (âncora mais próxima, 5 faixas) · posicao(media) -> 0–100 na régua
 *   destaques(resultado) -> {manter:[{item, media}], desenvolver:[…], parecidas} · diferencas(resultado) -> [...]
 *   hipotesesDisc(resultado, codigo) -> [até 2] · consolidar([visões de líderes], focos) -> consolidado (≥ 5 líderes)
 *   sugerirDesenho(colaboradores, relacoes, topoIds) -> {avaliados:[…], carga} · validarDesenho(avaliados, colaboradores,
 *   relacoes) -> {ok, erro?, avisos, carga} · grupoDaFonte(fonte), validarPlano(plano) -> {ok, plano} | {ok:false, erro}
 *   MENU_ACOES, NAO_RECOMENDAR, AVISO_RES3, INSTRUCAO(fonte, nome), avisoLider(o), avisoAvaliador(o), avisoChefia(o),
 *   AVISO_COMENTARIO(o), avisoPulso(o), PROTOCOLO_RELATOS, ROTEIRO_MODERACAO, TEXTOS (5.2), REFERENCIAS, PALAVRAS_PROIBIDAS,
 *   nomeCurto(nome), arred1(x), embaralhar(lista, rnd)
 *
 * Resultado (o que o banco congela no encerramento, por pessoa avaliada):
 *   { versao:1, versaoItens, kTema, kItem, convidados:{fonte:n}, respondentes:{fonte:n}, validas:{fonte:n},
 *     sinalizadas:{fonte:n}, excluidas:{fonte:n}, excluir:[fontes], liberado (≥ 3 respostas anônimas válidas num grupo
 *     exibido), suprimidas (anônimas válidas fora de qualquer grupo exibido), fontesExibidas:[fontes],
 *     grupos:[{id:'colegas+equipe', nome, fontes, n, respondentes, composicao:{fonte:n},
 *              temas:{DIR:{n, media, variadas:bool|null}|null, …}, itens:{DIR1:{n, media, dist:[c1..c5]}|{pouco:true}|null, …}}],
 *     outras:{n, composicao, temas, itens}|null   ("Outras pessoas (sem a chefia)"),
 *     chefia:{n, temas:{DIR: média|null}, itens:{DIR1: média|'nao'|null}}|null,
 *     auto:{temas:{DIR: média|null}, itens:{DIR1: 1–5|'nao'|null}}|null }
 * Arredondamento (igual no SQL): média com 1 casa = piso(x × 10 + 0,5 + 1e-9) / 10; rwg com 2 casas pela mesma regra.
 */
(function (root) {
  'use strict';

  var VERSAO_ITENS = 'v0';
  var K_TEMA = 3;            // tema por grupo anônimo e em "Outras pessoas"
  var K_ITEM = 5;            // frase por grupo e em "Outras pessoas"
  var K_VARIADAS = 5;        // "opiniões variadas" (rwg)
  var K_CONSOLIDADO = 5;     // consolidado da liderança: líderes
  var LIMIAR_DIFERENCA = 1.0;
  var LIMIAR_EMPATE = 0.3;
  var RWG_VARIADAS = 0.5;
  var SIGMA2 = 2;
  var TETO = 4;              // formulários sobre outras pessoas por ciclo (além da autoavaliação)
  var MAX_COLEGAS = 6;
  var MAX_OUTROS = 4;
  var MAX_CHEFIAS = 2;
  var MAX_AVALIADOS = 60;
  var MAX_COMENTARIO = 1000;
  var MAX_SEGUNDOS = 86400;
  var EPS = 1e-9;

  var FONTES = ['auto', 'chefia', 'colegas', 'equipe', 'outros'];
  var ANONIMAS = ['colegas', 'equipe', 'outros'];
  var NOME_FONTE = { auto: 'Autoavaliação', chefia: 'Chefia', colegas: 'Colegas', equipe: 'Equipe', outros: 'Outros' };

  // Escala de frequência (decisao.md 3.1.3): todos os pontos com rótulo; 0 = fora da escala (não entra na média).
  var ESCALA = [
    { valor: 1, rotulo: 'Nunca ou quase nunca' },
    { valor: 2, rotulo: 'Raramente' },
    { valor: 3, rotulo: 'Às vezes' },
    { valor: 4, rotulo: 'Frequentemente' },
    { valor: 5, rotulo: 'Sempre ou quase sempre' }
  ];
  var OPCAO_FORA = { valor: 0, rotulo: 'Não tive como observar' };
  var OPCAO_FORA_AUTO = { valor: 0, rotulo: 'Não se aplica ao meu trabalho' };
  // GLB1: concordância de 5 pontos com os rótulos do clima (DC 3.1.2). Coletada, nunca mostrada (P10).
  var ESCALA_GLB = [
    { valor: 1, rotulo: 'Discordo totalmente' },
    { valor: 2, rotulo: 'Discordo' },
    { valor: 3, rotulo: 'Nem concordo nem discordo' },
    { valor: 4, rotulo: 'Concordo' },
    { valor: 5, rotulo: 'Concordo totalmente' }
  ];
  var PERGUNTA_GUIA = 'Nos últimos 3 meses, com que frequência…';

  // Itens v0 (decisao.md 3.1.4). "[Nome]" = primeiro nome e inicial de quem é avaliado. Nenhum item invertido.
  var TEMAS = [
    { id: 'DIR', nome: 'Direção e decisões', itens: [
      { id: 'DIR1', texto: '[Nome] deixa claro quais são as prioridades da equipe para as próximas semanas.', auto: 'Deixo claro quais são as prioridades da equipe para as próximas semanas.' },
      { id: 'DIR2', texto: 'Ao passar uma tarefa, [Nome] combina o resultado esperado e o prazo.', auto: 'Ao passar uma tarefa, combino o resultado esperado e o prazo.' },
      { id: 'DIR3', texto: '[Nome] toma no tempo certo as decisões que cabem à sua função, sem deixar a equipe esperando.', auto: 'Tomo no tempo certo as decisões que cabem à minha função, sem deixar a equipe esperando.' }
    ] },
    { id: 'FBK', nome: 'Feedback e reconhecimento', itens: [
      { id: 'FBK1', texto: 'Quando o trabalho de alguém precisa melhorar, [Nome] fala com a pessoa de forma clara.', auto: 'Quando o trabalho de alguém precisa melhorar, falo com a pessoa de forma clara.' },
      { id: 'FBK2', texto: 'Ao dar um retorno, [Nome] fala de fatos e exemplos concretos, e não do jeito de ser da pessoa.', auto: 'Ao dar um retorno, falo de fatos e exemplos concretos, e não do jeito de ser da pessoa.' },
      { id: 'FBK3', texto: 'Quando alguém entrega um bom trabalho, [Nome] diz com clareza o que ficou bom.', auto: 'Quando alguém entrega um bom trabalho, digo com clareza o que ficou bom.' }
    ] },
    { id: 'APO', nome: 'Apoio e desenvolvimento', itens: [
      { id: 'APO1', texto: '[Nome] reserva um tempo para conversas individuais com as pessoas que lidera.', auto: 'Reservo um tempo para conversas individuais com as pessoas que lidero.' },
      { id: 'APO2', texto: 'Quando alguém não sabe fazer algo, [Nome] ensina ou indica quem possa ensinar.', auto: 'Quando alguém não sabe fazer algo, ensino ou indico quem possa ensinar.' },
      { id: 'APO3', texto: 'Quando falta recurso, informação ou ajuda para o trabalho andar, [Nome] toma providências para resolver.', auto: 'Quando falta recurso, informação ou ajuda para o trabalho andar, tomo providências para resolver.' }
    ] },
    { id: 'AUT', nome: 'Autonomia e participação', itens: [
      { id: 'AUT1', texto: '[Nome] pede a opinião das pessoas envolvidas antes de decidir mudanças no trabalho delas.', auto: 'Peço a opinião das pessoas envolvidas antes de decidir mudanças no trabalho delas.' },
      { id: 'AUT2', texto: '[Nome] deixa as pessoas decidirem como fazer o próprio trabalho, sem controlar cada passo.', auto: 'Deixo as pessoas decidirem como fazer o próprio trabalho, sem controlar cada passo.' },
      { id: 'AUT3', texto: '[Nome] confia responsabilidades novas às pessoas, com o apoio de que elas precisam.', auto: 'Confio responsabilidades novas às pessoas, com o apoio de que elas precisam.' }
    ] },
    { id: 'RES', nome: 'Escuta e respeito', itens: [
      { id: 'RES1', texto: '[Nome] mantém a calma quando alguém traz um problema ou uma notícia ruim.', auto: 'Mantenho a calma quando alguém traz um problema ou uma notícia ruim.' },
      { id: 'RES2', texto: 'Quando erra, [Nome] reconhece o erro abertamente.', auto: 'Quando erro, reconheço o erro abertamente.' },
      { id: 'RES3', texto: 'Mesmo sob pressão, [Nome] trata as pessoas com respeito, sem gritar e sem expor ninguém na frente dos outros.', auto: 'Mesmo sob pressão, trato as pessoas com respeito, sem gritar e sem expor ninguém na frente dos outros.' }
    ] },
    { id: 'COE', nome: 'Coerência e justiça', itens: [
      { id: 'COE1', texto: '[Nome] cumpre, no prazo, o que combina com as pessoas.', auto: 'Cumpro, no prazo, o que combino com as pessoas.' },
      { id: 'COE2', texto: '[Nome] trata todas as pessoas da equipe pelos mesmos critérios (em tarefas, folgas e metas).', auto: 'Trato todas as pessoas da equipe pelos mesmos critérios (em tarefas, folgas e metas).' },
      { id: 'COE3', texto: '[Nome] explica o motivo das decisões que afetam a equipe.', auto: 'Explico o motivo das decisões que afetam a equipe.' }
    ] }
  ];
  var IDS_TEMAS = TEMAS.map(function (t) { return t.id; });
  var IDS_ITENS = [];
  TEMAS.forEach(function (t) { t.itens.forEach(function (i) { IDS_ITENS.push(i.id); }); });
  var GLB1 = { id: 'GLB1', texto: 'No geral, o jeito de [Nome] liderar ajuda a equipe a fazer um bom trabalho.', auto: 'No geral, o meu jeito de liderar ajuda a equipe a fazer um bom trabalho.' };
  var AB1 = { id: 'AB1', texto: 'O que [Nome] faz no dia a dia e deveria continuar fazendo?', curto: 'Continuar' };
  var AB2 = { id: 'AB2', texto: 'O que [Nome] poderia começar a fazer, ou fazer diferente, para liderar melhor?', curto: 'Fazer diferente' };

  var MAPA = {};
  TEMAS.forEach(function (t) { t.itens.forEach(function (i) { MAPA[i.id] = { id: i.id, tema: t.id, texto: i.texto, auto: i.auto }; }); });

  function item(id) { return MAPA[id] ? Object.assign({}, MAPA[id]) : null; }
  function tema(id) { for (var i = 0; i < TEMAS.length; i++) if (TEMAS[i].id === id) return TEMAS[i]; return null; }
  function fonteValida(f) { return FONTES.indexOf(f) >= 0; }
  function comNome(t, nome) { return String(t).replace(/\[Nome\]/g, String(nome || '').trim() || 'a pessoa'); }
  // Texto da frase para quem responde: autoavaliação = "Eu…"; os outros formulários = "[Nome]…".
  function textoItem(id, fonte, nome) {
    if (id === 'GLB1') return fonte === 'auto' ? GLB1.auto : comNome(GLB1.texto, nome);
    if (id === 'AB1' || id === 'AB2') return comNome((id === 'AB1' ? AB1 : AB2).texto, nome);
    var x = MAPA[id];
    if (!x) return '';
    return fonte === 'auto' ? x.auto : comNome(x.texto, nome);
  }

  /* ------------------------------------------------------------------ formulário (telas e validação) */

  // 1 tema por tela (3 frases), depois "Para fechar" (GLB1) e, para quem avalia, os 2 comentários opcionais.
  function telas(fonte) {
    var out = TEMAS.map(function (t) { return { id: t.id, titulo: t.nome, itens: t.itens.map(function (i) { return i.id; }) }; });
    out.push({ id: 'GLB', titulo: 'Para fechar', itens: ['GLB1'] });
    if (fonte !== 'auto') out.push({ id: 'AB', titulo: 'Comentários (opcional)', itens: [], comentarios: ['AB1', 'AB2'] });
    return out;
  }

  function inteiro(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function limparComentario(v) {
    if (v === null || v === undefined) return '';
    var s = String(v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return s.length > MAX_COMENTARIO ? s.slice(0, MAX_COMENTARIO).trim() : s;
  }

  // Mesmas regras e mensagens de public.f360_enviar (banco). 18 frases: 0 (fora da escala) a 5; GLB1: 1 a 5; pular = null.
  // Comentários AB1/AB2 só de quem avalia (na autoavaliação são descartados).
  function validarEnvio(corpo, fonte) {
    var FORMATO = { ok: false, erro: 'Respostas em formato inválido.' };
    var c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : null;
    if (!c || !fonteValida(fonte)) return FORMATO;
    var it = c.itens;
    if (it === undefined || it === null) it = {};
    if (typeof it !== 'object' || Array.isArray(it)) return FORMATO;
    var limpos = {};
    var chaves = Object.keys(it);
    for (var i = 0; i < chaves.length; i++) {
      var k = chaves[i];
      var v = it[k];
      if (IDS_ITENS.indexOf(k) === -1 && k !== 'GLB1') return FORMATO;
      if (v === null) continue;
      var ok = k === 'GLB1' ? (inteiro(v) && v >= 1 && v <= 5) : (inteiro(v) && v >= 0 && v <= 5);
      if (!ok) return FORMATO;
      limpos[k] = v;
    }
    var com = c.comentarios;
    if (com !== undefined && com !== null && (typeof com !== 'object' || Array.isArray(com))) return FORMATO;
    var comentarios = { AB1: '', AB2: '' };
    if (com) {
      var ck = Object.keys(com);
      for (var j = 0; j < ck.length; j++) {
        if (ck[j] !== 'AB1' && ck[j] !== 'AB2') return FORMATO;
        var cv = com[ck[j]];
        if (cv !== null && cv !== undefined && typeof cv !== 'string') return FORMATO;
        if (fonte !== 'auto') comentarios[ck[j]] = limparComentario(cv);
      }
    }
    var segundos = null;
    if (c.segundos !== undefined && c.segundos !== null) {
      if (!inteiro(c.segundos) || c.segundos < 0) return FORMATO;
      segundos = Math.min(c.segundos, MAX_SEGUNDOS);
    }
    if (!Object.keys(limpos).length && !comentarios.AB1 && !comentarios.AB2) return { ok: false, erro: 'Responda pelo menos uma pergunta antes de enviar.' };
    return { ok: true, itens: limpos, comentarios: comentarios, segundos: segundos };
  }

  /* ------------------------------------------------------------------ cálculo (regras de 3.1.6 e 3.1.8) */

  function arred1(x) { return Math.floor(x * 10 + 0.5 + EPS) / 10; }
  function arred2(x) { return Math.floor(x * 100 + 0.5 + EPS) / 100; }
  function valido(v) { return inteiro(v) && v >= 1 && v <= 5; }
  function zeros() { var o = {}; FONTES.forEach(function (f) { o[f] = 0; }); return o; }

  // Tema de um avaliador: média das frases válidas (1–5) com no mínimo 2 de 3; senão null. Sem arredondar.
  function temasDoAvaliador(itens) {
    var out = {};
    itens = itens || {};
    TEMAS.forEach(function (t) {
      var s = 0, c = 0;
      t.itens.forEach(function (i) { var v = itens[i.id]; if (valido(v)) { s += v; c++; } });
      out[t.id] = c >= 2 ? s / c : null;
    });
    return out;
  }

  function normalizar(r) {
    var itens = {};
    var bruto = r && r.itens && typeof r.itens === 'object' && !Array.isArray(r.itens) ? r.itens : {};
    IDS_ITENS.forEach(function (id) { var v = bruto[id]; if (inteiro(v) && v >= 0 && v <= 5) itens[id] = v; });
    var temas = temasDoAvaliador(itens);
    var respondidos = Object.keys(itens).length;
    var seg = r && inteiro(r.segundos) && r.segundos >= 0 ? r.segundos : null;
    var rapida = seg !== null && respondidos > 0 && seg < 2 * respondidos;
    var reta = IDS_ITENS.every(function (id) { return valido(itens[id]); }) && IDS_ITENS.every(function (id) { return itens[id] === itens[IDS_ITENS[0]]; });
    return { fonte: r.fonte, itens: itens, temas: temas, valida: IDS_TEMAS.some(function (t) { return temas[t] !== null; }), sinalizada: rapida || reta };
  }

  // rwg(j) com σ² = 2 sobre as frases do tema, entre quem tem o tema válido (mesma fórmula do clima, DC 3.1.5).
  function rwgTema(membros, t) {
    var vars = [];
    tema(t).itens.forEach(function (i) {
      var xs = [];
      membros.forEach(function (m) { if (m.temas[t] !== null && valido(m.itens[i.id])) xs.push(m.itens[i.id]); });
      if (xs.length < 2) return;
      var mu = 0; xs.forEach(function (x) { mu += x; }); mu /= xs.length;
      var sq = 0; xs.forEach(function (x) { sq += (x - mu) * (x - mu); });
      vars.push(sq / (xs.length - 1));
    });
    if (!vars.length) return null;
    var J = vars.length;
    var s2 = 0; vars.forEach(function (v) { s2 += v; }); s2 /= J;
    var razao = s2 / SIGMA2;
    var rwg = razao >= 1 ? 0 : (J * (1 - razao)) / (J * (1 - razao) + razao);
    return arred2(Math.max(0, Math.min(1, rwg)));
  }

  function estatTema(membros, t) {
    var vs = membros.filter(function (m) { return m.temas[t] !== null; });
    if (!vs.length) return { n: 0 };
    var s = 0; vs.forEach(function (m) { s += m.temas[t]; });
    var variadas = null;
    if (vs.length >= K_VARIADAS) { var r = rwgTema(vs, t); variadas = r === null ? null : r < RWG_VARIADAS; }
    return { n: vs.length, media: arred1(s / vs.length), variadas: variadas };
  }

  function estatItem(membros, id) {
    var dist = [0, 0, 0, 0, 0], n = 0, s = 0, nao = 0;
    membros.forEach(function (m) {
      var v = m.itens[id];
      if (valido(v)) { n++; s += v; dist[v - 1]++; } else if (v === 0) nao++;
    });
    return { n: n, media: n ? arred1(s / n) : null, nao: nao, r: membros.length, dist: dist };
  }

  function nomeDoGrupo(fontes) {
    var nomes = fontes.map(function (f, i) { var x = NOME_FONTE[f]; return i ? x.toLowerCase() : x; });
    return nomes.length <= 1 ? nomes.join('') : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
  }

  /*
   * Fusão de grupos pequenos (3.1.6, regra 5), decidida uma vez pelo número de respostas VÁLIDAS de cada grupo anônimo:
   *   1) "Outros" com 1 ou 2 junta-se a Colegas;
   *   2) se Colegas (com ou sem Outros) ou Equipe continuar com 1 ou 2, todos os grupos anônimos que têm resposta
   *      se juntam ("Colegas e equipe", com Outros se houver);
   *   3) grupo (ou fusão) com menos de 3 não aparece e não entra em número nenhum (supressão complementar).
   */
  function gruposDaFusao(nv) {
    var colF = ['colegas'];
    var outrosSep = nv.outros >= K_TEMA;
    if (nv.outros > 0 && !outrosSep) colF.push('outros');
    var nCol = nv.colegas + (colF.indexOf('outros') >= 0 ? nv.outros : 0);
    var fundir = (nCol > 0 && nCol < K_TEMA) || (nv.equipe > 0 && nv.equipe < K_TEMA);
    var defs = [];
    if (fundir) {
      var todas = ANONIMAS.filter(function (f) { return nv[f] > 0; });
      if (todas.length) defs.push(todas);
    } else {
      if (nCol > 0) defs.push(colF.filter(function (f) { return nv[f] > 0; }));
      if (nv.equipe > 0) defs.push(['equipe']);
      if (outrosSep) defs.push(['outros']);
    }
    return defs;
  }

  /*
   * "Outras pessoas (sem a chefia)" por tema ou frase: todos os avaliadores anônimos dos grupos exibidos, peso 1 por
   * avaliador. Supressão complementar (3.1.6, regra 5, último item): se as células escondidas dos grupos exibidos somam
   * de 1 a k−1 respostas, essas respostas saem de "Outras pessoas" (senão "Outras pessoas" menos os grupos visíveis
   * revelaria a célula escondida); se somam k ou mais, ficam (o resto também tem o mínimo).
   */
  function incluidosEmOutras(cel, k) {
    var nH = 0;
    cel.forEach(function (x) { if (!x.mostra) nH += x.n; });
    var tirar = nH > 0 && nH < k;
    return cel.filter(function (x) { return x.mostra || (!tirar && x.n > 0); });
  }

  /*
   * Cálculo completo de uma pessoa avaliada (o que o banco congela no encerramento). Entrada:
   *   respostas: [{fonte: 'auto'|'chefia'|'colegas'|'equipe'|'outros', itens: {DIR1: 0–5, …, GLB1: 1–5}, segundos}]
   *   convidados: {fonte: n} · excluir: fontes anônimas cujas respostas sinalizadas o consultor decidiu tirar (regra 16)
   */
  function calcular(entrada) {
    entrada = entrada || {};
    var conv = zeros();
    var ec = entrada.convidados && typeof entrada.convidados === 'object' ? entrada.convidados : {};
    FONTES.forEach(function (f) { conv[f] = inteiro(ec[f]) && ec[f] > 0 ? ec[f] : 0; });
    var excluir = ANONIMAS.filter(function (f) { return Array.isArray(entrada.excluir) && entrada.excluir.indexOf(f) >= 0; });
    var todas = (Array.isArray(entrada.respostas) ? entrada.respostas : []).filter(function (r) { return r && fonteValida(r.fonte); }).map(normalizar);
    var sinal = zeros(), excl = zeros(), resp = zeros(), val = zeros();
    var usadas = [];
    todas.forEach(function (r) {
      if (r.sinalizada) sinal[r.fonte]++;
      if (r.sinalizada && excluir.indexOf(r.fonte) >= 0) { excl[r.fonte]++; return; }
      usadas.push(r);
      resp[r.fonte]++;
      if (r.valida) val[r.fonte]++;
    });
    var res = { versao: 1, versaoItens: VERSAO_ITENS, kTema: K_TEMA, kItem: K_ITEM, convidados: conv, respondentes: resp, validas: val,
      sinalizadas: sinal, excluidas: excl, excluir: excluir, liberado: false, suprimidas: 0, fontesExibidas: [],
      grupos: [], outras: null, chefia: null, auto: null };

    // Autoavaliação (nunca entra em média nenhuma): a primeira, se houver.
    var a = usadas.filter(function (r) { return r.fonte === 'auto'; })[0];
    if (a) {
      var at = {}, ai = {};
      IDS_TEMAS.forEach(function (t) { at[t] = a.temas[t] === null ? null : arred1(a.temas[t]); });
      IDS_ITENS.forEach(function (id) { var v = a.itens[id]; ai[id] = valido(v) ? v : (v === 0 ? 'nao' : null); });
      res.auto = { temas: at, itens: ai };
    }

    // Grupos anônimos: fusão e mínimo de 3.
    var defs = gruposDaFusao({ colegas: val.colegas, equipe: val.equipe, outros: val.outros });
    var exibidos = [];
    var totalAnon = val.colegas + val.equipe + val.outros;
    defs.forEach(function (fs) {
      var n = 0; fs.forEach(function (f) { n += val[f]; });
      if (n < K_TEMA) return;
      var comp = {}; fs.forEach(function (f) { comp[f] = val[f]; });
      var r = 0; fs.forEach(function (f) { r += resp[f]; });
      exibidos.push({ id: fs.join('+'), nome: nomeDoGrupo(fs), fontes: fs.slice(), n: n, respondentes: r, composicao: comp,
        membros: usadas.filter(function (x) { return fs.indexOf(x.fonte) >= 0; }) });
    });
    var nExib = 0; exibidos.forEach(function (g) { nExib += g.n; });
    res.suprimidas = totalAnon - nExib;
    res.liberado = exibidos.length > 0;
    if (!res.liberado) return res;
    exibidos.forEach(function (g) { res.fontesExibidas = res.fontesExibidas.concat(g.fontes); });
    res.fontesExibidas = ANONIMAS.filter(function (f) { return res.fontesExibidas.indexOf(f) >= 0; });

    var grupos = exibidos.map(function (g) {
      return { id: g.id, nome: g.nome, fontes: g.fontes, n: g.n, respondentes: g.respondentes, composicao: g.composicao, temas: {}, itens: {} };
    });
    var compO = {}; exibidos.forEach(function (g) { g.fontes.forEach(function (f) { compO[f] = val[f]; }); });
    var outras = { n: nExib, composicao: compO, temas: {}, itens: {} };

    IDS_TEMAS.forEach(function (t) {
      var cel = exibidos.map(function (g, i) {
        var e = estatTema(g.membros, t);
        var mostra = e.n >= K_TEMA;
        grupos[i].temas[t] = mostra ? { n: e.n, media: e.media, variadas: e.variadas } : null;
        return { g: g, n: e.n, mostra: mostra };
      });
      var membros = [];
      incluidosEmOutras(cel, K_TEMA).forEach(function (x) { membros = membros.concat(x.g.membros); });
      var eo = estatTema(membros, t);
      outras.temas[t] = eo.n >= K_TEMA ? { n: eo.n, media: eo.media, variadas: eo.variadas } : null;
    });

    IDS_ITENS.forEach(function (id) {
      var cel = exibidos.map(function (g, i) {
        var e = estatItem(g.membros, id);
        var pouco = e.nao * 2 > e.r;
        var mostra = !pouco && e.n >= K_ITEM;
        grupos[i].itens[id] = mostra ? { n: e.n, media: e.media, dist: e.dist } : (pouco ? { pouco: true } : null);
        return { g: g, n: e.n, mostra: mostra };
      });
      // "Pouco observada" em "Outras pessoas": conta de todos os grupos exibidos (é só uma proporção, sem média).
      var todosM = [];
      exibidos.forEach(function (g) { todosM = todosM.concat(g.membros); });
      var et = estatItem(todosM, id);
      var membros = [];
      incluidosEmOutras(cel, K_ITEM).forEach(function (x) { membros = membros.concat(x.g.membros); });
      var eo = estatItem(membros, id);
      outras.itens[id] = et.nao * 2 > et.r ? { pouco: true } : (eo.n >= K_ITEM ? { n: eo.n, media: eo.media, dist: eo.dist } : null);
    });
    res.grupos = grupos;
    res.outras = outras;

    // Chefia (à parte, identificada): média das chefias (no máximo 2) por tema e por frase.
    var ch = usadas.filter(function (r) { return r.fonte === 'chefia'; });
    if (ch.length) {
      var ct = {}, ci = {};
      IDS_TEMAS.forEach(function (t) {
        var s = 0, c = 0;
        ch.forEach(function (r) { if (r.temas[t] !== null) { s += r.temas[t]; c++; } });
        ct[t] = c ? arred1(s / c) : null;
      });
      IDS_ITENS.forEach(function (id) {
        var s = 0, c = 0, nao = false;
        ch.forEach(function (r) { var v = r.itens[id]; if (valido(v)) { s += v; c++; } else if (v === 0) nao = true; });
        ci[id] = c ? arred1(s / c) : (nao ? 'nao' : null);
      });
      res.chefia = { n: ch.length, temas: ct, itens: ci };
    }
    return res;
  }

  function copia(x) { return JSON.parse(JSON.stringify(x === undefined ? null : x)); }

  // O que vai para o relatório do líder: sem distribuição por alternativa (só consultor), sem contagens por fonte e sem
  // sinalizadas por fonte (só o total dos grupos exibidos). Mesma regra de disc_interno.f360_visao_lider.
  function visaoLider(r) {
    var c = copia(r || {});
    var exib = Array.isArray(c.fontesExibidas) ? c.fontesExibidas : [];
    var sin = 0, exc = 0;
    exib.forEach(function (f) { sin += (c.sinalizadas && c.sinalizadas[f]) || 0; exc += (c.excluidas && c.excluidas[f]) || 0; });
    var conv = {};
    exib.forEach(function (f) { conv[f] = (c.convidados && c.convidados[f]) || 0; });
    var saida = { versao: c.versao, versaoItens: c.versaoItens, kTema: c.kTema, kItem: c.kItem, liberado: !!c.liberado,
      fontesExibidas: exib, convidados: conv, chefiasConvidadas: (c.convidados && c.convidados.chefia) || 0,
      qualidade: { sinalizadas: sin, excluidas: exc }, grupos: [], outras: null, chefia: c.chefia || null, auto: c.auto || null };
    function semDist(itens) {
      var o = {};
      Object.keys(itens || {}).forEach(function (k) { var x = itens[k]; o[k] = x && typeof x === 'object' && x.dist ? { n: x.n, media: x.media } : x; });
      return o;
    }
    saida.grupos = (c.grupos || []).map(function (g) {
      return { id: g.id, nome: g.nome, fontes: g.fontes, n: g.n, composicao: g.composicao, temas: g.temas, itens: semDist(g.itens) };
    });
    if (c.outras) saida.outras = { n: c.outras.n, composicao: c.outras.composicao, temas: c.outras.temas, itens: semDist(c.outras.itens) };
    if (!saida.liberado) { saida.grupos = []; saida.outras = null; saida.chefia = null; }
    return saida;
  }

  /* ------------------------------------------------------------------ leitura (derivada do que já foi suprimido) */

  // Âncora mais próxima (3.1.7): a média com 1 casa cai numa das 5 faixas. Não é nota nem norma.
  var LEITURAS = [
    { id: 'sempre', rotulo: 'sempre ou quase sempre', min: 4.5 },
    { id: 'frequentemente', rotulo: 'frequentemente', min: 3.5 },
    { id: 'as_vezes', rotulo: 'às vezes', min: 2.5 },
    { id: 'raramente', rotulo: 'raramente', min: 1.5 },
    { id: 'nunca', rotulo: 'nunca ou quase nunca', min: -Infinity }
  ];
  function leitura(media) {
    if (typeof media !== 'number' || !isFinite(media)) return null;
    var m = arred1(media);
    for (var i = 0; i < LEITURAS.length; i++) if (m >= LEITURAS[i].min - EPS) return { id: LEITURAS[i].id, rotulo: LEITURAS[i].rotulo };
    return null;
  }
  // Posição na régua de 1 a 5 (0 a 100%).
  function posicao(media) {
    if (typeof media !== 'number' || !isFinite(media)) return null;
    return Math.max(0, Math.min(100, (media - 1) * 25));
  }
  function margemAmpla(n) { return typeof n === 'number' && n >= K_TEMA && n < K_ITEM; }

  // Comportamentos mais e menos observados (regra 10): em "Outras pessoas", só frases com n ≥ 5; ordem DENTRO da pessoa.
  // 3 de cada lado; se a 4ª está a menos de 0,3 da 3ª, entram as empatadas (até 5 no total). Se o empate passaria de 5
  // frases, ficam só as que se destacam por 0,3 ou mais (pode não sobrar nenhuma). Uma frase que empata (menos de 0,3) com
  // alguma do outro lado não entra em "para desenvolver". Sem destaque quando todas ficam a menos de 0,3 umas das outras.
  function destaques(r) {
    var o = r && r.outras && r.outras.itens ? r.outras.itens : {};
    var lista = IDS_ITENS.filter(function (id) { var x = o[id]; return x && typeof x.media === 'number' && x.n >= K_ITEM; })
      .map(function (id) { return { item: id, media: o[id].media }; });
    var vazio = { manter: [], desenvolver: [], parecidas: false, disponiveis: lista.length };
    if (lista.length < 2) return vazio;
    function perto(a, b) { return Math.abs(arred1(a - b)) < LIMIAR_EMPATE - EPS; }
    var desc = lista.slice().sort(function (a, b) { return b.media - a.media || IDS_ITENS.indexOf(a.item) - IDS_ITENS.indexOf(b.item); });
    if (perto(desc[0].media, desc[desc.length - 1].media)) { vazio.parecidas = true; return vazio; }
    var lado = Math.min(3, Math.floor(lista.length / 2));
    function pegar(ord, usados) {
      var livres = ord.filter(function (x) { return !usados[x.item]; });
      var base = livres.slice(0, lado);
      if (!base.length) return [];
      var ref = base[base.length - 1].media;
      var empatadas = livres.slice(lado).filter(function (x) { return perto(x.media, ref); });
      if (base.length + empatadas.length <= 5) return base.concat(empatadas);
      return base.filter(function (x) { return !perto(x.media, ref); });
    }
    var manter = pegar(desc, {});
    var usados = {}; manter.forEach(function (x) { usados[x.item] = true; });
    var asc = lista.slice().sort(function (a, b) { return a.media - b.media || IDS_ITENS.indexOf(a.item) - IDS_ITENS.indexOf(b.item); });
    var desenvolver = pegar(asc, usados).filter(function (x) { return !manter.some(function (m) { return perto(m.media, x.media); }); });
    return { manter: manter, desenvolver: desenvolver, parecidas: false, disponiveis: lista.length };
  }

  // Diferença de percepção (regra 11): autoavaliação × grupo anônimo exibido (e "Outras pessoas"), só por tema, com n ≥ 3
  // no grupo comparado e |Δ| ≥ 1,0. Nunca com a chefia (1 pessoa). Ordem: "Outras pessoas" primeiro, depois a ordem fixa.
  function diferencas(r) {
    if (!r || !r.auto || !r.liberado) return [];
    var alvos = [];
    if (r.outras) alvos.push({ id: 'outras', nome: 'Outras pessoas', temas: r.outras.temas });
    (r.grupos || []).forEach(function (g) { if (!r.outras || (r.grupos || []).length > 1) alvos.push({ id: g.id, nome: g.nome, temas: g.temas }); });
    var out = [];
    alvos.forEach(function (a) {
      IDS_TEMAS.forEach(function (t) {
        var x = a.temas && a.temas[t];
        var v = r.auto.temas[t];
        if (!x || typeof v !== 'number' || x.n < K_TEMA) return;
        var d = arred1(v - x.media);
        if (Math.abs(d) < LIMIAR_DIFERENCA - EPS) return;
        out.push({ tema: t, grupo: a.id, nome: a.nome, auto: v, outros: x.media, delta: d, sentido: d > 0 ? 'acima' : 'abaixo', margemAmpla: margemAmpla(x.n) });
      });
    });
    return out;
  }
  function textoDiferenca(d) {
    var nomeT = tema(d.tema).nome.toLowerCase();
    var quem = d.grupo === 'outras' ? 'as outras pessoas perceberam' : 'o grupo "' + d.nome + '" percebeu';
    return d.sentido === 'acima'
      ? 'Em ' + nomeT + ', você marcou uma frequência maior do que ' + quem + '.'
      : 'Em ' + nomeT + ', ' + quem + ' uma frequência maior do que você marcou.';
  }

  /* ------------------------------------------------------------------ hipóteses DISC (4.8): só com o aceite do líder */

  var HIPOTESES = {
    DIR: { D: 'pode ser que a rapidez para decidir, comum no estilo D, faça a direção parecer óbvia para você e pouco explicada para quem executa.',
      I: 'pode ser que o entusiasmo com várias ideias ao mesmo tempo, comum no estilo I, deixe as prioridades menos nítidas para a equipe.',
      S: 'pode ser que o cuidado em ouvir todos antes de decidir, comum no estilo S, faça algumas decisões levarem mais tempo do que a equipe espera.',
      C: 'pode ser que a busca por informação completa antes de decidir, comum no estilo C, faça algumas decisões esperarem mais do que a equipe gostaria.' },
    FBK: { D: 'pode ser que o foco no resultado, comum no estilo D, faça o retorno sair curto e direto, com menos exemplos do que a pessoa precisa.',
      I: 'pode ser que a vontade de manter a conversa leve, comum no estilo I, faça o retorno sobre o que precisa melhorar ficar para depois.',
      S: 'pode ser que o cuidado em evitar desconforto, comum no estilo S, faça conversas difíceis serem adiadas.',
      C: 'pode ser que a atenção aos detalhes, comum no estilo C, faça o retorno se concentrar no que falta e menos no que ficou bom.' },
    APO: { D: 'pode ser que o ritmo acelerado, comum no estilo D, deixe pouco espaço na agenda para conversas individuais.',
      I: 'pode ser que as conversas aconteçam com frequência, mas de forma informal, sem um momento combinado para tratar de bloqueios.',
      S: 'pode ser que a disposição em ajudar, comum no estilo S, faça você resolver no lugar da pessoa em vez de ensinar.',
      C: 'pode ser que a preferência por analisar antes de agir, comum no estilo C, faça os pedidos de ajuda esperarem antes de virar providência.' },
    AUT: { D: 'pode ser que a vontade de garantir o resultado, comum no estilo D, faça você decidir sozinho(a) ou acompanhar de perto passos que a equipe poderia decidir.',
      I: 'pode ser que as decisões aconteçam em conversas rápidas, comuns no estilo I, sem deixar claro o que a equipe pode decidir sozinha.',
      S: 'pode ser que a preocupação em não sobrecarregar as pessoas, comum no estilo S, faça você confiar menos responsabilidades novas a elas.',
      C: 'pode ser que o padrão alto de qualidade, comum no estilo C, faça você conferir cada passo antes de deixar a equipe seguir.' },
    RES: { D: 'pode ser que a objetividade sob pressão, comum no estilo D, seja percebida como impaciência quando alguém traz um problema.',
      I: 'pode ser que a energia nas conversas, comum no estilo I, deixe menos espaço para quem fala menos.',
      S: 'pode ser que a tendência a guardar o desconforto, comum no estilo S, faça os erros serem pouco comentados abertamente.',
      C: 'pode ser que o foco em corrigir o que está errado, comum no estilo C, faça a reação a uma má notícia parecer mais crítica do que você pretende.' },
    COE: { D: 'pode ser que a rapidez em mudar de rumo, comum no estilo D, faça alguns combinados mudarem sem que a equipe entenda o motivo.',
      I: 'pode ser que a vontade de atender a todos, comum no estilo I, faça você assumir mais compromissos do que dá para cumprir no prazo.',
      S: 'pode ser que a vontade de evitar conflito, comum no estilo S, faça você ceder a pedidos de forma diferente para pessoas diferentes.',
      C: 'pode ser que você siga critérios claros para si, comum no estilo C, mas eles não estejam escritos nem explicados à equipe.' }
  };
  var OUTRAS_EXPLICACOES = {
    DIR: ['prioridades que mudam por decisão de outras áreas ou da direção', 'um papel nunca combinado: o que cabe à sua função decidir', 'carga de trabalho alta neste período'],
    FBK: ['carga alta, que deixa pouco tempo para conversas', 'equipe nova, com pouco histórico de trabalho junto', 'mudança recente na equipe ou na função'],
    APO: ['carga alta neste período', 'falta de recurso que não depende de você', 'equipe nova, que pede mais tempo de acompanhamento'],
    AUT: ['equipe nova, que ainda está aprendendo o trabalho', 'um papel nunca combinado: o que a equipe pode decidir sozinha', 'mudança recente de processo ou de sistema'],
    RES: ['um período de pressão fora do comum', 'mudança recente na equipe ou na função', 'carga de trabalho alta neste período'],
    COE: ['decisões que vieram de cima e chegaram sem explicação', 'regras diferentes por cargo ou turno, que nunca foram explicadas', 'mudança recente de chefia ou de processo']
  };
  var PERGUNTAS_CONVERSA = {
    DIR: 'O que a equipe precisaria saber, no começo de cada semana, para não depender de você para decidir o que vem primeiro?',
    FBK: 'Quando foi a última vez que você deu um retorno claro sobre algo que precisava melhorar? O que ajudou ou atrapalhou?',
    APO: 'Em que momento da semana caberia uma conversa individual de 20 minutos com cada pessoa?',
    AUT: 'Que decisões a equipe já poderia tomar sem você, se isso estivesse combinado?',
    RES: 'Como você costuma reagir no primeiro minuto depois de uma má notícia? O que a pessoa vê?',
    COE: 'Que combinado recente mudou sem explicação para a equipe?'
  };
  var PRIMEIRO_PASSO = {
    DIR: 'Deixar visíveis de 1 a 3 prioridades do mês e, ao delegar, combinar o que é "pronto", até quando e o que fazer se travar.',
    FBK: 'Regra das 48 horas: retorno até 2 dias depois do fato, com o comportamento, o efeito e o próximo passo.',
    APO: 'Conversa individual quinzenal de 20 a 30 minutos, com a pauta da pessoa primeiro e uma pergunta fixa sobre bloqueios.',
    AUT: 'Combinar com cada pessoa o nível de autonomia: "decida e me conte" ou "me consulte antes".',
    RES: 'Perguntar antes de afirmar e agradecer quando alguém traz uma má notícia.',
    COE: 'Escrever os critérios antes de decidir (folgas, escalas, metas) e explicar: "decidi X por causa de Y; revemos em Z".'
  };
  var TEXTO_HIPOTESE = 'Hipótese para conversa, não conclusão. Há outras explicações possíveis. Os percentuais do DISC são relativos dentro de cada pessoa e mostram o que ela prioriza, não quanto tem de cada característica.';

  // Disparo [Mod]: tema entre os 2 de menor leitura em "Outras pessoas" ou com diferença de percepção. No máximo 2.
  function hipotesesDisc(r, codigo) {
    var L = String(codigo || '').toUpperCase().charAt(0);
    if (!r || !r.liberado || !r.outras || 'DISC'.indexOf(L) < 0 || !L) return [];
    var difs = diferencas(r).filter(function (d) { return d.grupo === 'outras'; });
    var comDif = difs.map(function (d) { return d.tema; });
    var mostrados = IDS_TEMAS.filter(function (t) { return r.outras.temas[t]; });
    var baixos = mostrados.slice().sort(function (a, b) { return r.outras.temas[a].media - r.outras.temas[b].media || IDS_TEMAS.indexOf(a) - IDS_TEMAS.indexOf(b); }).slice(0, 2);
    var temas = [];
    comDif.concat(baixos).forEach(function (t) { if (temas.indexOf(t) < 0 && temas.length < 2) temas.push(t); });
    return temas.map(function (t) {
      var x = r.outras.temas[t];
      var d = difs.filter(function (y) { return y.tema === t; })[0];
      var dado = d ? textoDiferenca(d) : 'Em ' + tema(t).nome.toLowerCase() + ', a leitura das outras pessoas ficou em "' + leitura(x.media).rotulo + '", entre as mais baixas dos seus temas.';
      return { tema: t, dado: dado, estilo: 'Uma leitura de estilo possível: ' + HIPOTESES[t][L], outras: OUTRAS_EXPLICACOES[t].slice(0, 3),
        pergunta: PERGUNTAS_CONVERSA[t], passo: PRIMEIRO_PASSO[t] };
    });
  }

  /* ------------------------------------------------------------------ consolidado da liderança (≥ 5 líderes, só total) */

  // lideres: visões de líder (visaoLider) com relatório liberado e devolutiva feita; focos: [[ids de frases do plano]].
  // Média por tema = média das leituras de "Outras pessoas" de cada líder (peso 1 por líder), só com ≥ 5 líderes no tema.
  function consolidar(lideres, focos) {
    var ls = (lideres || []).filter(function (r) { return r && r.liberado && r.outras; });
    var out = { lideres: ls.length, disponivel: ls.length >= K_CONSOLIDADO, temas: {}, focos: null };
    if (!out.disponivel) return out;
    IDS_TEMAS.forEach(function (t) {
      var s = 0, c = 0;
      ls.forEach(function (r) { var x = r.outras.temas[t]; if (x) { s += x.media; c++; } });
      out.temas[t] = c >= K_CONSOLIDADO ? { lideres: c, media: arred1(s / c) } : null;
    });
    var fs = (focos || []).filter(function (f) { return Array.isArray(f) && f.length; });
    if (fs.length >= K_CONSOLIDADO) {
      out.focos = {};
      IDS_TEMAS.forEach(function (t) { out.focos[t] = 0; });
      fs.forEach(function (f) {
        var vistos = {};
        f.forEach(function (id) { var x = MAPA[id]; if (x && !vistos[x.tema]) { vistos[x.tema] = true; out.focos[x.tema]++; } });
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ quem avalia quem (3.1.9) */

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

  function mapaOrganograma(colaboradores, relacoes) {
    var ativos = {};
    (colaboradores || []).forEach(function (c) { if (c && c.status !== 'desligado' && c.pessoaId) ativos[String(c.pessoaId)] = c; });
    var lidera = {}, chefes = {}, direto = {};
    (relacoes || []).forEach(function (r) {
      if (!r || !ativos[r.de] || !ativos[r.para] || r.de === r.para) return;
      if (r.tipo === 'lidera') {
        (lidera[r.de] = lidera[r.de] || []).push(String(r.para));
        (chefes[r.para] = chefes[r.para] || []).push(String(r.de));
      } else if (r.tipo === 'direto') {
        (direto[r.de] = direto[r.de] || []).push(String(r.para));
        (direto[r.para] = direto[r.para] || []).push(String(r.de));
      }
    });
    return { ativos: ativos, lidera: lidera, chefes: chefes, direto: direto };
  }

  // Carga de cada pessoa: obrigatórios (avaliar o próprio líder = equipe; avaliar quem responde a ela = chefia) e opcionais
  // (colegas e outros). Teto: opcionais ≤ máx(0, 4 − obrigatórios). A chefia avalia cada líder direto mesmo acima de 4.
  function cargaDe(avaliados) {
    var c = {};
    function ctr(p) { return (c[p] = c[p] || { obrigatorios: 0, opcionais: 0 }); }
    (avaliados || []).forEach(function (a) {
      (a.equipe || []).forEach(function (p) { ctr(p).obrigatorios++; });
      (a.chefia || []).forEach(function (p) { ctr(p).obrigatorios++; });
      (a.colegas || []).forEach(function (p) { ctr(p).opcionais++; });
      (a.outros || []).forEach(function (p) { ctr(p).opcionais++; });
    });
    return c;
  }
  function cabe(carga, p) { var x = carga[p] || { obrigatorios: 0, opcionais: 0 }; return x.opcionais < Math.max(0, TETO - x.obrigatorios); }

  /*
   * Sugestão a partir do organograma: avalia quem lidera alguém (na ordem do organograma, começando pelo topo = dono);
   * chefia = quem lidera a pessoa (até 2); equipe = todos os liderados diretos ativos; colegas = outros líderes que
   * respondem à mesma chefia ou têm relação "trabalha com" (até 6); outros (só para quem não tem chefia, como o dono) =
   * pessoas do nível abaixo dos liderados e de "trabalha com" (até 4). Colegas e outros respeitam o teto e são distribuídos
   * primeiro para quem tem menos pessoas convidadas (prioridade 3 de 3.1.9). O consultor confere e ajusta.
   */
  function sugerirDesenho(colaboradores, relacoes, topoIds) {
    var o = mapaOrganograma(colaboradores, relacoes);
    function porNome(a, b) { return String(o.ativos[a].nome).localeCompare(String(o.ativos[b].nome), 'pt-BR'); }
    var topo = (topoIds || []).map(String).filter(function (id) { return o.ativos[id] && !(o.chefes[id] || []).length; });
    var raizes = topo.concat(Object.keys(o.ativos).filter(function (id) { return !(o.chefes[id] || []).length && topo.indexOf(id) === -1; }).sort(porNome));
    var ordem = [], visto = {};
    function visitar(id) {
      if (visto[id]) return;
      visto[id] = true;
      var fs = (o.lidera[id] || []).slice().sort(porNome);
      if (fs.length) ordem.push(id);
      fs.forEach(visitar);
    }
    raizes.forEach(visitar);
    Object.keys(o.lidera).sort(porNome).forEach(visitar);
    var lideres = {}; ordem.forEach(function (id) { lideres[id] = true; });
    var avaliados = ordem.map(function (id) {
      var chefia = (o.chefes[id] || []).slice().sort(porNome).slice(0, MAX_CHEFIAS);
      var equipe = (o.lidera[id] || []).slice().sort(porNome);
      var fora = {}; fora[id] = true; chefia.concat(equipe).forEach(function (p) { fora[p] = true; });
      var cand = [];
      chefia.forEach(function (ch) { (o.lidera[ch] || []).forEach(function (p) { if (lideres[p] && !fora[p] && cand.indexOf(p) < 0) cand.push(p); }); });
      (o.direto[id] || []).forEach(function (p) { if (lideres[p] && !fora[p] && cand.indexOf(p) < 0) cand.push(p); });
      cand.sort(porNome);
      var candOutros = [];
      if (!chefia.length) {
        equipe.forEach(function (p) { (o.lidera[p] || []).forEach(function (q) { if (!fora[q] && cand.indexOf(q) < 0 && candOutros.indexOf(q) < 0) candOutros.push(q); }); });
        (o.direto[id] || []).forEach(function (p) { if (!fora[p] && cand.indexOf(p) < 0 && candOutros.indexOf(p) < 0) candOutros.push(p); });
        candOutros.sort(porNome);
      }
      return { pessoaId: id, nome: o.ativos[id].nome, topo: !(o.chefes[id] || []).length, chefia: chefia, equipe: equipe, colegas: [], outros: [],
        candidatosColegas: cand, candidatosOutros: candOutros };
    });
    var carga = cargaDe(avaliados);
    function anon(a) { return a.equipe.length + a.colegas.length + a.outros.length; }
    // Rodadas: em cada uma, quem tem menos convidados anônimos recebe mais um colega (ou "outro", para quem não tem chefia).
    for (var guarda = 0; guarda < 200; guarda++) {
      var mudou = false;
      avaliados.slice().sort(function (a, b) { return anon(a) - anon(b) || ordem.indexOf(a.pessoaId) - ordem.indexOf(b.pessoaId); }).forEach(function (a) {
        if (a.colegas.length < MAX_COLEGAS) {
          var p = a.candidatosColegas.filter(function (x) { return a.colegas.indexOf(x) < 0 && cabe(carga, x); })[0];
          if (p) { a.colegas.push(p); carga[p] = carga[p] || { obrigatorios: 0, opcionais: 0 }; carga[p].opcionais++; mudou = true; return; }
        }
        if (a.outros.length < MAX_OUTROS && anon(a) < K_ITEM) {
          var q = a.candidatosOutros.filter(function (x) { return a.outros.indexOf(x) < 0 && cabe(carga, x); })[0];
          if (q) { a.outros.push(q); carga[q] = carga[q] || { obrigatorios: 0, opcionais: 0 }; carga[q].opcionais++; mudou = true; }
        }
      });
      if (!mudou) break;
    }
    avaliados.forEach(function (a) { a.colegas.sort(porNome); a.outros.sort(porNome); });
    return { avaliados: avaliados, carga: cargaDe(avaliados) };
  }

  /*
   * Conferência do desenho (mesmas regras e mensagens de public.f360_criar_ciclo): avaliados = [{pessoaId, chefia, equipe,
   * colegas, outros}] (ids de colaboradores ativos). Devolve {ok, erro?, avisos, carga}.
   */
  function validarDesenho(avaliados, colaboradores, relacoes) {
    var o = mapaOrganograma(colaboradores, relacoes);
    function nm(id) { return nomeCurto(o.ativos[id] ? o.ativos[id].nome : ''); }
    function falha(msg) { return { ok: false, erro: msg, avisos: [], carga: {} }; }
    if (!Array.isArray(avaliados) || !avaliados.length) return falha('Escolha pelo menos uma pessoa para ser avaliada.');
    if (avaliados.length > MAX_AVALIADOS) return falha('Pessoas avaliadas demais num ciclo (máximo 60).');
    var vistos = {}, avisos = [], limpos = [];
    for (var i = 0; i < avaliados.length; i++) {
      var a = avaliados[i] || {};
      var id = String(a.pessoaId || '');
      if (!o.ativos[id] || !(o.lidera[id] || []).length) return falha('Quem é avaliado precisa ser colaborador(a) ativo(a) desta empresa e liderar alguém no organograma.');
      if (vistos[id]) return falha('Pessoa avaliada repetida.');
      vistos[id] = true;
      var lista = function (v) { return Array.isArray(v) ? v.map(String) : []; };
      var chefia = lista(a.chefia), equipe = lista(a.equipe), colegas = lista(a.colegas), outros = lista(a.outros);
      var todos = chefia.concat(equipe, colegas, outros);
      var uniq = {};
      for (var j = 0; j < todos.length; j++) {
        if (uniq[todos[j]]) return falha(nm(id) + ': a mesma pessoa aparece duas vezes na lista de quem avalia.');
        uniq[todos[j]] = true;
      }
      if (chefia.length > MAX_CHEFIAS || chefia.some(function (p) { return (o.chefes[id] || []).indexOf(p) < 0; })) {
        return falha('A chefia de ' + nm(id) + ' precisa ser quem lidera essa pessoa no organograma (no máximo 2).');
      }
      if (equipe.some(function (p) { return (o.lidera[id] || []).indexOf(p) < 0; })) return falha('A equipe de ' + nm(id) + ' só pode ter pessoas que ela lidera no organograma.');
      if (colegas.concat(outros).some(function (p) { return !o.ativos[p] || p === id; }) || todos.indexOf(id) >= 0) {
        return falha('Colegas e outros convidados de ' + nm(id) + ' precisam ser colaboradores ativos desta empresa (e não a própria pessoa).');
      }
      if (colegas.length > MAX_COLEGAS || outros.length > MAX_OUTROS) return falha(nm(id) + ': no máximo 6 colegas e 4 outros convidados.');
      if (equipe.length + colegas.length + outros.length < K_TEMA) {
        return falha(nm(id) + ' precisa de pelo menos 3 pessoas convidadas além da chefia (equipe, colegas ou outros). Com menos, não haveria relatório.');
      }
      if ((o.chefes[id] || []).length && !chefia.length) avisos.push(nm(id) + ': a chefia ficou de fora da lista.');
      if (equipe.length < (o.lidera[id] || []).length) avisos.push(nm(id) + ': nem todos os liderados diretos foram convidados (o padrão é convidar todos).');
      if (equipe.length + colegas.length + outros.length < K_ITEM) avisos.push(nm(id) + ': menos de 5 pessoas convidadas além da chefia. Frase por frase só aparece com 5 respostas.');
      limpos.push({ pessoaId: id, chefia: chefia, equipe: equipe, colegas: colegas, outros: outros });
    }
    var carga = cargaDe(limpos);
    var ids = Object.keys(carga);
    for (var k = 0; k < ids.length; k++) {
      var c = carga[ids[k]];
      if (c.opcionais > Math.max(0, TETO - c.obrigatorios)) {
        return { ok: false, erro: nm(ids[k]) + ' passaria do limite de 4 formulários por pessoa: tire essa pessoa de alguma lista de colegas ou de outros convidados.', avisos: avisos, carga: carga };
      }
      if (c.obrigatorios > TETO) avisos.push(nm(ids[k]) + ' avalia ' + c.obrigatorios + ' pessoas (é chefia de várias): faça a coleta em ondas, com pelo menos 2 semanas entre elas.');
    }
    return { ok: true, avisos: avisos, carga: carga, avaliados: limpos };
  }

  /* ------------------------------------------------------------------ plano 30/60/90 e menu de ações (4.6 e 4.7) */

  var MENU_ACOES = {
    DIR: { acoes: ['De 1 a 3 prioridades do mês, visíveis para todos.', 'Ao delegar, 3 perguntas: o que é "pronto", até quando, o que fazer se travar.', 'Prazo para cada decisão parada.'],
      base: 'Kleingeld, van Mierlo & Arends, 2011; Judge & Piccolo, 2004', capitulos: ['Delegação e metas', 'Como conduzir mudanças'] },
    FBK: { acoes: ['Regra das 48 horas: retorno até 2 dias depois do fato, com o comportamento, o efeito e o próximo passo.', 'Reconhecimento específico: dizer o que ficou bom e por quê.'],
      base: 'Kluger & DeNisi, 1996; Judge & Piccolo, 2004', capitulos: ['Como dar feedback', 'Motivação e reconhecimento'] },
    APO: { acoes: ['Conversa individual (1:1) quinzenal de 20 a 30 minutos, com a pauta da pessoa primeiro.', 'Uma pergunta fixa sobre bloqueios em cada conversa.', 'Cada pedido parado ganha dono e data.'],
      base: 'Judge, Piccolo & Ilies, 2004', capitulos: ['Reunião individual (1:1)', 'Sinais de desgaste', 'Os primeiros 90 dias'] },
    AUT: { acoes: ['Combinar o nível de autonomia de cada pessoa: "decida e me conte" ou "me consulte antes".', 'Delegar o resultado, não a tarefa.', '1 objetivo de aprendizagem por pessoa liderada.'],
      base: 'Lee, Willis & Tian, 2018; Kim, Beehr & Prewett, 2018; Burke et al., 2006', capitulos: ['Delegação e metas', 'Retenção', 'Os primeiros 90 dias'] },
    RES: { acoes: ['Perguntar antes de afirmar.', 'Agradecer a má notícia.', 'Falar por último nas reuniões.', 'Conversa de 20 minutos depois de cada entrega, com 4 perguntas (o que era para acontecer, o que aconteceu, por quê, o que fazer diferente).'],
      base: 'Edmondson, 1999; Tannenbaum & Cerasoli, 2013', capitulos: ['Como conduzir mudanças', 'Conflitos e como mediar'] },
    COE: { acoes: ['Critérios escritos antes de decidir (folgas, escalas, metas).', '"Decidi X por causa de Y; revemos em Z."', 'Caderno de combinados.'],
      base: 'Colquitt et al., 2001; Lee et al., 2020', capitulos: ['Conflitos e como mediar', 'Você e esta pessoa'] }
  };
  var ACAO_VARIOS_LIDERES = 'Quando vários líderes escolhem o mesmo tema: oficina prática curta, em 2 ou 3 encontros espaçados, com casos reais (Lacerenza et al., 2017).';
  var NAO_RECOMENDAR = 'Não recomendamos: palestra motivacional, curso longo sem prática, trocar o líder por outro perfil DISC ou coaching longo como resposta padrão.';
  var AVISO_RES3 = 'Leitura baixa em "Mesmo sob pressão, trata as pessoas com respeito" é tratada numa conversa individual com o consultor, nunca com exposição do líder.';

  var MOMENTOS_PLANO = [
    { id: 'conversaEquipe', rotulo: 'Conversa com a equipe e com os colegas (dias 15 a 30)', quem: 'Líder' },
    { id: 'conversaChefia', rotulo: 'Conversa de 30 minutos com a chefia sobre o plano (dias 15 a 30)', quem: 'Líder e chefia' },
    { id: 'checkin', rotulo: 'Check-in com o consultor (dias 30 a 60)', quem: 'Líder e consultor' },
    { id: 'retornos', rotulo: 'Pedir retorno curto a 2 ou 3 pessoas (dias 60 a 90)', quem: 'Líder' },
    { id: 'pulso', rotulo: 'Pulso e segundo encontro (dias 90 a 120)', quem: 'Consultor' },
    { id: 'reaplicacao', rotulo: 'Novo Feedback 360 completo (mês 12)', quem: 'Consultor' }
  ];
  var MAX_TEXTO_PLANO = 300;
  // 'AAAA-MM-DD' que existe no calendário (2026-02-30 não vale; igual ao ::date do banco).
  function dataValida(s) {
    var m = typeof s === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function textoPlano(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXTO_PLANO); }

  // Plano escrito na devolutiva (4.2 cap. 9): 1 ou 2 frases escolhidas entre as 18 e escritas como ação; até 3 ações do
  // menu (ou próprias) com prazo; o que vai dizer à equipe; quem apoia; como vai saber que melhorou; datas; andamento.
  function validarPlano(p) {
    if (p === null || p === undefined) return { ok: true, plano: null };
    if (typeof p !== 'object' || Array.isArray(p)) return { ok: false, erro: 'Plano em formato inválido.' };
    var comp = Array.isArray(p.comportamentos) ? p.comportamentos : [];
    if (!comp.length || comp.length > 2) return { ok: false, erro: 'Escolha 1 ou 2 comportamentos para o plano.' };
    var vistos = {}, c2 = [];
    for (var i = 0; i < comp.length; i++) {
      var x = comp[i] || {};
      if (IDS_ITENS.indexOf(x.item) < 0 || vistos[x.item]) return { ok: false, erro: 'Escolha os comportamentos entre as 18 frases (sem repetir).' };
      vistos[x.item] = true;
      c2.push({ item: x.item, acao: textoPlano(x.acao) });
    }
    var acoes = (Array.isArray(p.acoes) ? p.acoes : []).map(function (a) { a = a || {}; return { texto: textoPlano(a.texto), prazo: dataValida(a.prazo) ? a.prazo : '' }; })
      .filter(function (a) { return a.texto; });
    if (acoes.length > 3) return { ok: false, erro: 'No máximo 3 ações no plano.' };
    var datas = {};
    var pd = p.datas && typeof p.datas === 'object' ? p.datas : {};
    MOMENTOS_PLANO.forEach(function (m) { datas[m.id] = dataValida(pd[m.id]) ? pd[m.id] : ''; });
    return { ok: true, plano: { comportamentos: c2, acoes: acoes, contar: textoPlano(p.contar), apoio: textoPlano(p.apoio), indicador: textoPlano(p.indicador),
      datas: datas, andamento: textoPlano(p.andamento) } };
  }

  /* ------------------------------------------------------------------ textos obrigatórios (decisao.md 3.1.3, 5.1 e 5.2) */

  var NOME_PRODUTO = 'Feedback 360 da Liderança';
  var SUBTITULO = 'Como quem trabalha com você percebe a sua liderança';
  var MINUTOS = '5 a 7';
  var N_PERGUNTAS = IDS_ITENS.length + 1 + 2;

  function INSTRUCAO(fonte, nome) {
    if (fonte === 'auto') {
      return 'Pense no que você fez nos últimos 3 meses, e não na sua impressão geral sobre você. Para cada frase, marque com que frequência isso acontece. Se a frase não faz parte do seu trabalho, marque "Não se aplica ao meu trabalho". Não existe nota final, e este resultado não é usado para salário, promoção ou desligamento.';
    }
    return 'Pense no que você viu ' + (String(nome || '').trim() || 'a pessoa') + ' fazer nos últimos 3 meses, e não na sua impressão geral sobre a pessoa. Para cada frase, marque com que frequência isso acontece. Se você não teve como ver, marque "Não tive como observar": isso não prejudica ninguém. Não existe nota final, e este resultado não é usado para salário, promoção ou desligamento.';
  }

  function dataBr(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function baseLegalTexto(b) {
    var t = String(b || '').trim();
    return t ? 'Base legal: ' + t + ', conforme a LGPD (Lei 13.709/2018).' : 'Tratamento conforme a LGPD (Lei 13.709/2018).';
  }
  function opcoesAviso(o) {
    o = o || {};
    var emp = String(o.empresa || '').trim();
    return { empresa: emp || 'empresa', da: emp ? 'da ' + emp : 'da empresa', a: emp ? 'a ' + emp : 'a empresa', aa: emp ? 'à ' + emp : 'à empresa',
      nome: String(o.nome || '').trim() || 'a pessoa avaliada',
      dias: inteiro(o.retencaoDias) && o.retencaoDias > 0 ? o.retencaoDias : 90, contato: String(o.contatoDados || '').trim(),
      canal: String(o.canalTexto || '').trim(), fim: dataBr(o.encerramentoPrevisto), baseLegal: o.baseLegal };
  }
  function canalGsc(x) { return (x.contato ? x.contato + ' ou ' : '') + 'o(a) consultor(a) da Gestão sem Caos'; }
  // "Marta E.." -> "Marta E." (nome curto termina em ponto).
  function pontuar(t) { return String(t).replace(/([^.])\.\.(?!\.)/g, '$1.'); }
  function aviso(titulo, paragrafos, aceite) {
    return { titulo: pontuar(titulo), paragrafos: paragrafos.map(function (p) { return { rotulo: pontuar(p.rotulo), texto: pontuar(p.texto) }; }), aceite: aceite };
  }

  // 5.1-a: para quem é avaliado (convite e adesão; formulário de autoavaliação).
  function avisoLider(o) {
    var x = opcoesAviso(o);
    return aviso(NOME_PRODUTO + ' · ' + (String((o || {}).empresa || '').trim() || 'Gestão sem Caos'), [
        { rotulo: 'O que é:', texto: 'você vai receber a visão de quem trabalha com você (sua chefia, colegas e equipe) sobre comportamentos de liderança do dia a dia, ao lado da sua própria visão. Você responde em cerca de ' + MINUTOS + ' minutos.' },
        { rotulo: 'Para que serve:', texto: 'só para o seu desenvolvimento. O resultado não pode ser usado para decidir promoção, salário, bônus, desligamento ou remanejamento, nem para comparar ou ranquear líderes. Isso está no contrato ' + x.da + ' com a Gestão sem Caos.' },
        { rotulo: 'Quem conduz:', texto: x.a + ' é a responsável pelos dados. A Gestão sem Caos aplica, monta o relatório e conversa com você sobre ele, em nome ' + x.da + '.' },
        { rotulo: 'Quem vê o seu relatório:', texto: 'você e o(a) consultor(a) da Gestão sem Caos. Você recebe o relatório numa conversa com o consultor. Sua chefia vê só o seu plano de desenvolvimento (os comportamentos que você escolher, as ações e as datas), nunca as respostas nem os comentários.' },
        { rotulo: 'Como as respostas aparecem:', texto: 'a resposta da sua chefia aparece identificada. Colegas e equipe aparecem só como média de grupo, e só quando o grupo tem pelo menos 3 respostas; frase por frase, só com 5 ou mais. Grupos menores são juntados ou não aparecem. Você não saberá quem respondeu o quê, e a Gestão sem Caos não vai revelar.' },
        { rotulo: 'Comentários:', texto: 'você vai ler comentários revisados pela Gestão sem Caos, sem nomes, sem detalhes que identifiquem quem escreveu e sem ofensas. São opiniões de quem convive com você, não fatos verificados.' },
        { rotulo: 'Não é avaliação psicológica.', texto: 'Não mede personalidade, inteligência, saúde nem caráter. Mostra como alguns comportamentos seus são percebidos hoje.' },
        { rotulo: 'Você pode sair', texto: 'a qualquer momento, avisando ' + canalGsc(x) + '. Não há consequência para você.' },
        { rotulo: 'Por quanto tempo:', texto: 'as respostas individuais são apagadas em até ' + x.dias + ' dias depois da nossa conversa de devolutiva. O seu relatório fica disponível para você por 24 meses.' },
        { rotulo: 'Seus direitos:', texto: 'acesso ao seu relatório, correção dos seus dados e registro da sua própria observação no relatório. Dúvidas ou pedidos: ' + canalGsc(x) + '. ' + baseLegalTexto(x.baseLegal) }
      ], 'Li este aviso e quero participar.');
  }

  // 5.1-b: para colegas, equipe e outros (link individual, "confidencial").
  function avisoAvaliador(o) {
    var x = opcoesAviso(o);
    var grupo = NOME_FONTE[(o || {}).fonte] || 'Outros';
    return aviso('Feedback 360 de ' + x.nome + ' · ' + (String((o || {}).empresa || '').trim() || 'Gestão sem Caos'), [
        { rotulo: 'O que é:', texto: x.nome + ' quer saber com que frequência você vê alguns comportamentos de liderança dessa pessoa no dia a dia. São ' + N_PERGUNTAS + ' perguntas, cerca de ' + MINUTOS + ' minutos.' },
        { rotulo: 'É voluntário.', texto: 'Você pode pular perguntas ou não responder. Ninguém da empresa recebe a lista de quem respondeu.' },
        { rotulo: 'Sua resposta fica dentro do grupo ' + grupo + ':', texto: x.nome + ' vê só a média do grupo, e só se o grupo tiver pelo menos 3 respostas; frase por frase, só com 5 ou mais. Se tiver menos, as respostas são juntadas com outro grupo ou não aparecem. Em grupo pequeno a pessoa pode perceber tendências; por isso, escreva o que você diria com respeito, numa conversa.' },
        { rotulo: 'Seu link é individual só para evitar respostas repetidas.', texto: 'A Gestão sem Caos guarda a ligação entre o link e a resposta só até o encerramento da coleta' + (x.fim ? ' (previsto para ' + x.fim + ')' : '') + ' e depois apaga. Nunca repassa essa ligação ' + x.aa + ' nem a ' + x.nome + '. Sua resposta é confidencial.' },
        { rotulo: 'Para que serve:', texto: 'só para o desenvolvimento de ' + x.nome + '. Não pode ser usado para promoção, salário, bônus ou desligamento de ninguém. ' + x.a.charAt(0).toUpperCase() + x.a.slice(1) + ' se comprometeu a não tomar nenhuma medida contra quem responde.' },
        { rotulo: 'Uma pergunta geral', texto: 'no final serve só para estudar a qualidade do questionário e não aparece no relatório.' },
        // Sem a frase do pulso de 90 dias: a v1 não tem o pulso e, sem guardar a lista de convidados (manter_lista, que
        // depende do advogado), não dá para reconvidar o mesmo grupo. Volta quando o pulso existir.
        { rotulo: 'Não é canal de denúncia.', texto: 'Se você passou por assédio, discriminação ou violência, use ' + (x.canal || 'o canal de denúncia da empresa') + '. Se escrever algo assim aqui, o texto não vai para ' + x.nome + ': a Gestão sem Caos retira o trecho e avisa a pessoa de contato definida no contrato, sem o texto e sem nada que aponte você.' },
        { rotulo: 'Não é avaliação psicológica', texto: 'de ninguém.' },
        { rotulo: 'Dados:', texto: x.a + ' é responsável e a Gestão sem Caos opera em nome dela. As respostas individuais são apagadas em até ' + x.dias + ' dias depois da devolutiva. Até o encerramento da coleta você pode apagar a sua resposta por este mesmo link ou pedir isso ' + (x.contato ? 'por ' + x.contato + ' ou ' : '') + 'ao(à) consultor(a) da Gestão sem Caos. Depois disso ela deixa de estar ligada a você e não pode mais ser localizada. ' + baseLegalTexto(x.baseLegal) }
      ], 'Li este aviso e quero responder.');
  }

  // 5.1-c: a chefia é identificada (no lugar do parágrafo do grupo anônimo e do link "confidencial").
  function avisoChefia(o) {
    var x = opcoesAviso(o);
    var b = avisoAvaliador(o);
    var duas = !!(o && o.duasChefias);
    var c = (duas ? 'Como a chefia é identificada, ' + x.nome + ' verá a resposta das chefias separada e saberá de quem é. As respostas das duas chefias aparecem juntas; com duas pessoas, cada uma pode deduzir a resposta da outra.'
      : 'Como a chefia direta é uma só pessoa, ' + x.nome + ' verá a sua resposta separada e saberá que é sua.') +
      ' Responda como faria numa conversa de feedback. Você verá o plano de desenvolvimento de ' + x.nome + ', não as respostas dos outros grupos nem os comentários. O resultado é para o desenvolvimento de ' + x.nome + ' e não pode ser usado em decisões de promoção, salário ou desligamento, inclusive por você.';
    var ps = b.paragrafos.filter(function (p) { return !/^Sua resposta fica dentro do grupo|^Seu link é individual|^Daqui a cerca de 3 meses/.test(p.rotulo); });
    ps.splice(2, 0, { rotulo: 'Sua resposta aparece identificada.', texto: c });
    ps.forEach(function (p) {
      if (p.rotulo === 'É voluntário.') p.texto = 'Você pode pular perguntas ou não responder.';
      // A resposta da chefia continua identificável pelo papel: sem a promessa de "deixa de estar ligada a você".
      if (p.rotulo === 'Dados:') p.texto = p.texto.replace(/ Depois disso ela deixa de estar ligada a você e não pode mais ser localizada\./, '');
    });
    return aviso(b.titulo, ps, b.aceite);
  }

  // 5.1-d: logo acima de cada campo de comentário.
  function AVISO_COMENTARIO(o) {
    var x = opcoesAviso(o);
    return pontuar('Comentário (opcional). Descreva comportamentos e situações de trabalho, e não o jeito de ser da pessoa. Não cite nomes, datas, projetos ou detalhes que mostrem quem você é. Não escreva sobre saúde, religião, vida pessoal ou características físicas de ninguém. A Gestão sem Caos revisa os comentários antes de ' + x.nome + ' ler e pode retirar trechos. Ofensas são removidas. Este espaço não é canal de denúncia: para isso, use ' + (x.canal || 'o canal de denúncia da empresa') + '.');
  }
  // 5.1-e: convite do pulso (texto para quando o pulso for aberto; v2).
  function avisoPulso(o) {
    var x = opcoesAviso(o);
    return pontuar('Pulso do Feedback 360 de ' + x.nome + ' · ' + (x.empresa === 'empresa' ? 'Gestão sem Caos' : x.empresa) + '. São até 4 perguntas sobre os comportamentos que ' + x.nome + ' escolheu trabalhar depois do último Feedback 360. As mesmas regras valem: resposta confidencial, só resultado de grupo, com pelo menos 5 respostas, e nenhum uso para salário, promoção ou desligamento.');
  }
  // 5.1-f: protocolo de relatos (para o consultor; validar com o advogado).
  var PROTOCOLO_RELATOS = [
    'Retirar o trecho do relatório do líder.',
    'Registrar internamente (o painel conta o relato no ciclo).',
    'Comunicar ao contato definido no contrato, que nunca é o líder avaliado, só que "houve relato de possível assédio envolvendo a liderança avaliada", sem o texto e sem nada que aponte o autor.',
    'Reforçar a divulgação do canal da empresa.'
  ];
  var ROTEIRO_MODERACAO = [
    'Tire nomes, datas, projetos e detalhes que mostrem quem escreveu; marque o lugar com "[trecho removido]".',
    'Tire qualquer menção a saúde, religião, vida pessoal ou características físicas.',
    'Ofensas saem. Uma crítica dura, mas sobre comportamento, fica.',
    'Relato de assédio, discriminação ou violência: descarte o comentário com o motivo "relato" e siga o protocolo de relatos.',
    'Não reescreva o sentido: edite só o necessário para proteger quem escreveu. Na dúvida, descarte.'
  ];
  var MOTIVOS_DESCARTE = { identifica: 'Identifica quem escreveu', ofensa: 'Ofensa', sensivel: 'Dado sensível', relato: 'Relato de assédio, discriminação ou violência', fora: 'Fora do tema' };

  var TEXTOS = {
    capa: function (nome) { return pontuar('Relatório confidencial de desenvolvimento de ' + nome + '.') + ' Mostra como comportamentos de liderança são percebidos por grupos de pessoas, ao lado da autoavaliação. Não é avaliação psicológica, não mede competência técnica nem desempenho e não pode ser usado para decidir contratação, promoção, salário, bônus, desligamento ou remanejamento, nem para comparar líderes.'; },
    grupos: 'Grupos com menos de 3 respostas não aparecem separados. Com 3 ou 4 respostas, a média tem margem ampla: uma opinião muda bastante o resultado. Frase por frase, só com 5 respostas ou mais.',
    chefia: 'A resposta da chefia aparece identificada; a chefia foi avisada disso antes de responder. É a visão de uma pessoa.',
    comentarios: 'Opiniões de quem convive com você, revisadas pela Gestão sem Caos para proteger quem escreveu. Trechos removidos aparecem marcados.',
    diferencas: 'É normal que você e os outros vejam o seu trabalho de formas diferentes: cada grupo vê uma parte dele. Uma diferença pode refletir percepções diferentes ou jeitos diferentes de usar a escala. Use-a como pergunta para a conversa, não como conclusão.',
    leitura: 'As palavras mostram a frequência média percebida. Não são notas, não são normas e não comparam você com outras pessoas.',
    mudanca: '"Dentro da margem" não quer dizer que nada mudou: mudanças de comportamento costumam ser pequenas e levam tempo.',
    origem: 'Perguntas próprias da Gestão sem Caos, inspiradas em temas estudados pela psicologia organizacional (referências no anexo). Em validação.',
    hipotese: TEXTO_HIPOTESE,
    marca: function (nome) { return 'Confidencial · desenvolvimento de ' + nome + ' · não usar em decisões de pessoal'; },
    naoPergunte: 'Não pergunte quem disse, não insinue, não mude o tratamento com ninguém por causa do resultado.',
    expectativa: 'A melhora média depois de um feedback 360 é pequena (Smither, London & Reilly, 2005). A diferença vem da conversa, do plano e do acompanhamento.',
    margem: 'Margem ampla: com 3 ou 4 respostas, uma opinião muda bastante o resultado.',
    variadas: 'Opiniões variadas neste grupo: as respostas ficaram bem diferentes entre si.',
    pouco: 'Pouco observada por este grupo: mais da metade marcou "Não tive como observar".',
    semRelatorio: 'Com menos de 3 respostas de colegas, equipe e outros convidados (mesmo juntando grupos), nenhum resultado pode aparecer sem expor quem respondeu. O consultor oferece uma conversa estruturada sobre o que você quer desenvolver, sem dados de terceiros.',
    consolidado: 'Total da liderança da empresa, sem nomes e sem comparação entre líderes. Cada líder pesa igual. Só aparece com 5 líderes ou mais.',
    chefiaPlano: 'Você vê só o plano de desenvolvimento. As respostas, as notas e os comentários ficam com o líder e o consultor. O plano é para o desenvolvimento e não pode ser usado em decisões de promoção, salário ou desligamento.'
  };

  // Referências do anexo de método: só as marcadas como verificadas na decisão (as de memória ficaram de fora).
  var REFERENCIAS = [
    'Judge, Piccolo & Ilies, 2004 — consideração e estruturação na liderança.',
    'Judge & Piccolo, 2004 — liderança transformacional, transacional e laissez-faire.',
    'Kleingeld, van Mierlo & Arends, 2011 — metas de grupo.',
    'Burke et al., 2006 — comportamentos de liderança em equipes.',
    'Kluger & DeNisi, 1996 — efeitos do feedback.',
    'Liden et al., 2015 — liderança servidora.',
    'Lee, Willis & Tian, 2018; Kim, Beehr & Prewett, 2018 — liderança que dá autonomia.',
    'Edmondson, 1999; Frazier et al., 2017 — segurança psicológica.',
    'Schyns & Schilling, 2013; Mackey et al., 2017 — liderança destrutiva.',
    'Colquitt et al., 2001 — justiça nas organizações.',
    'Hoffman et al., 2010 — cada grupo de avaliadores vê uma parte do trabalho.',
    'Heidemeier & Moser, 2009 — a autoavaliação costuma ser mais alta.',
    'Scullen, Mount & Goff, 2000 — a parte de cada avaliador nas notas.',
    'Smither, London & Reilly, 2005 — mudança depois de um feedback 360.',
    'Seifert, Yukl & McDonald, 2003 — devolutiva em conversa.',
    'Bracken & Rose, 2011 — participação e acompanhamento.',
    'LeBreton & Senter, 2008 — concordância dentro do grupo (rwg).'
  ];

  // Palavras e promessas proibidas nos relatórios e telas (5.3 e 5.4). Os testes varrem os textos gerados.
  var PALAVRAS_PROIBIDAS = ['ponto cego', 'superestim', 'autoimagem inflada', 'tóxic', 'travador', 'ponto fraco', 'deficiência', 'diagnóstico',
    'validado', 'validada', 'ranking', 'melhor líder', 'pior líder', 'aprovado', 'reprovado', 'avaliação de desempenho', 'anônim',
    'laudo', 'comprovad', 'científic', 'garante', 'nota de liderança', 'score', 'notus', 'dimensões do mlq', 'lpi', 'everything disc', 'disc®'];

  function embaralhar(lista, rnd) {
    var a = (lista || []).slice();
    var r = typeof rnd === 'function' ? rnd : Math.random;
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function grupoDaFonte(f) { return NOME_FONTE[f] || ''; }

  var DISC_F360 = {
    VERSAO_ITENS: VERSAO_ITENS, K_TEMA: K_TEMA, K_ITEM: K_ITEM, K_VARIADAS: K_VARIADAS, K_CONSOLIDADO: K_CONSOLIDADO,
    LIMIAR_DIFERENCA: LIMIAR_DIFERENCA, LIMIAR_EMPATE: LIMIAR_EMPATE, RWG_VARIADAS: RWG_VARIADAS, SIGMA2: SIGMA2, TETO: TETO,
    MAX_COLEGAS: MAX_COLEGAS, MAX_OUTROS: MAX_OUTROS, MAX_CHEFIAS: MAX_CHEFIAS, MAX_AVALIADOS: MAX_AVALIADOS, MAX_COMENTARIO: MAX_COMENTARIO,
    FONTES: FONTES, ANONIMAS: ANONIMAS, NOME_FONTE: NOME_FONTE, ESCALA: ESCALA, OPCAO_FORA: OPCAO_FORA, OPCAO_FORA_AUTO: OPCAO_FORA_AUTO,
    ESCALA_GLB: ESCALA_GLB, PERGUNTA_GUIA: PERGUNTA_GUIA, TEMAS: TEMAS, IDS_TEMAS: IDS_TEMAS, IDS_ITENS: IDS_ITENS, GLB1: GLB1, AB1: AB1, AB2: AB2,
    LEITURAS: LEITURAS, NOME_PRODUTO: NOME_PRODUTO, SUBTITULO: SUBTITULO, MINUTOS: MINUTOS, N_PERGUNTAS: N_PERGUNTAS,
    item: item, tema: tema, textoItem: textoItem, telas: telas, validarEnvio: validarEnvio, limparComentario: limparComentario,
    temasDoAvaliador: temasDoAvaliador, gruposDaFusao: gruposDaFusao, calcular: calcular, visaoLider: visaoLider,
    leitura: leitura, posicao: posicao, margemAmpla: margemAmpla, destaques: destaques, diferencas: diferencas, textoDiferenca: textoDiferenca,
    hipotesesDisc: hipotesesDisc, consolidar: consolidar, sugerirDesenho: sugerirDesenho, validarDesenho: validarDesenho, cargaDe: cargaDe,
    validarPlano: validarPlano, MOMENTOS_PLANO: MOMENTOS_PLANO, MENU_ACOES: MENU_ACOES, ACAO_VARIOS_LIDERES: ACAO_VARIOS_LIDERES,
    NAO_RECOMENDAR: NAO_RECOMENDAR, AVISO_RES3: AVISO_RES3, INSTRUCAO: INSTRUCAO, avisoLider: avisoLider, avisoAvaliador: avisoAvaliador,
    avisoChefia: avisoChefia, AVISO_COMENTARIO: AVISO_COMENTARIO, avisoPulso: avisoPulso, PROTOCOLO_RELATOS: PROTOCOLO_RELATOS,
    ROTEIRO_MODERACAO: ROTEIRO_MODERACAO, MOTIVOS_DESCARTE: MOTIVOS_DESCARTE, TEXTOS: TEXTOS, REFERENCIAS: REFERENCIAS,
    PALAVRAS_PROIBIDAS: PALAVRAS_PROIBIDAS, nomeCurto: nomeCurto, arred1: arred1, arred2: arred2, embaralhar: embaralhar,
    grupoDaFonte: grupoDaFonte, dataBr: dataBr
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_F360;
  else root.DISC_F360 = DISC_F360;
})(typeof self !== 'undefined' ? self : this);
