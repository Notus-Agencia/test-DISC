/* ==========================================================================
   Site da empresa · dados: conta, base pública, painel (vagas e candidatos) e ajudantes sobre as formas do contrato
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP, S = E.S, UI = E.UI, esc = E.esc, norm = E.norm, API = E.API;
  var CHAVE_ATUAL = 'vsc.emp.atual', CHAVE_LOTE = 'vsc.emp.lote';

  /* ---------- listas de escolha (rótulos da casa) ---------- */
  E.TIPOS = ['Carteira assinada', 'Temporário', 'Diária', 'Por serviço', 'Estágio', 'PJ'];
  E.TURNOS = ['Manhã', 'Tarde', 'Noite', 'Comercial', 'Escala 12x36', 'Fim de semana'];
  E.BENEFICIOS = ['Vale-alimentação', 'Vale-transporte', 'Cesta básica', 'Plano de saúde', 'Refeição no local', 'Comissão', 'Uniforme fornecido'];
  var TIPO_TELA = { CLT: 'Carteira assinada', Freelancer: 'Por serviço' };
  var TIPO_API = { 'Carteira assinada': 'CLT', 'Por serviço': 'Freelancer' };
  E.tipoTela = function (t) { return TIPO_TELA[t] || t || ''; };
  E.tipoApi = function (t) { return TIPO_API[t] || t || ''; };
  /* períodos de salário que o banco aceita para cada tipo */
  E.PERIODOS = [['mes', 'Mês'], ['dia', 'Dia'], ['hora', 'Hora']];
  E.periodosDoTipo = function (tipo) {
    if (tipo === 'Diária') return ['dia'];
    if (tipo === 'Por serviço' || tipo === 'PJ') return ['mes', 'dia', 'hora'];
    return ['mes', 'hora'];
  };
  E.COLUNAS = [
    { id: 'novos', nome: 'Novos', etapas: ['nova', 'vista'] },
    { id: 'conversa', nome: 'Em conversa', etapas: ['em conversa'] },
    { id: 'entrevista', nome: 'Entrevista', etapas: ['entrevista marcada'] },
    { id: 'contratado', nome: 'Contratados', etapas: ['contratada'] },
    { id: 'naoseguiu', nome: 'Não seguiu', etapas: ['não seguiu'] }
  ];
  E.COL_DA_ETAPA = { 'nova': 'novos', 'vista': 'novos', 'em conversa': 'conversa', 'entrevista marcada': 'entrevista', 'contratada': 'contratado', 'não seguiu': 'naoseguiu' };
  E.ETAPA_DA_COL = { novos: 'vista', conversa: 'em conversa', entrevista: 'entrevista marcada', contratado: 'contratada', naoseguiu: 'não seguiu' };

  /* ---------- conta ---------- */
  E.zerarConta = function () {
    S.sessao = false; S.empresas = []; S.empresa = null; S.vagas = []; S.limites = null; S.cands = []; S.totais = null; S.painelEm = 0; S.candsVaga = '';
    UI.filtros = {}; UI.sel = {}; UI.listaVaga = '';
  };
  function escolherEmpresa() {
    var atual = E.lerJSON(CHAVE_ATUAL), alvo = null;
    S.empresas.forEach(function (e) { if (e.id === atual) alvo = e; });
    S.empresa = alvo || S.empresas[0] || null;
  }
  E.trocarEmpresa = function (id) {
    S.empresas.forEach(function (e) { if (e.id === id) S.empresa = e; });
    E.gravarJSON(CHAVE_ATUAL, id);
    S.vagas = []; S.cands = []; S.painelEm = 0; E.esquecerTela();
  };
  E.carregarConta = function () {
    if (!API.sessao()) { E.zerarConta(); return Promise.resolve(); }
    S.sessao = true;
    return E.api('minhasEmpresas', {}).then(function (r) {
      S.empresas = r.empresas || [];
      escolherEmpresa();
    });
  };
  /* depois de criar a empresa ou entrar */
  E.definirEmpresas = function (lista, escolhida) {
    S.sessao = true; S.empresas = lista; escolherEmpresa();
    if (escolhida) S.empresas.forEach(function (e) { if (e.id === escolhida) S.empresa = e; });
    if (S.empresa) E.gravarJSON(CHAVE_ATUAL, S.empresa.id);
  };
  E.sair = function () {
    return API.sair().then(function () { E.zerarConta(); E.esquecerTela(); E.ir('#/anunciar'); E.toast('Você saiu.'); });
  };

  /* ---------- base pública (cidades, setores e vagas no ar da região) ---------- */
  var promessaBase = null;
  E.carregarBase = function () {
    if (S.base) return Promise.resolve(S.base);
    if (!promessaBase) {
      promessaBase = E.api('base', {}).then(function (r) { S.base = r; return r; }, function (e) { promessaBase = null; throw e; });
    }
    return promessaBase;
  };
  E.cidades = function () { return (S.base && S.base.cidades) || []; };
  E.setores = function () { return (S.base && S.base.setores) || []; };
  E.cidadePor = function (id) { var l = E.cidades(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; };
  E.cidadeNome = function (id) { var c = E.cidadePor(id); return c ? c.nome : (id || '').replace(/-[a-z]{2}$/, '').replace(/-/g, ' ').replace(/^./, function (x) { return x.toUpperCase(); }); };
  E.setorPor = function (id) { var l = E.setores(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; };
  E.cidadePrincipal = function () { return (S.base && S.base.praca && S.base.praca.cidadePrincipal) || (E.cidades()[0] && E.cidades()[0].id) || ''; };
  /* a cidade da base que tem este nome (a Receita escreve o nome, o banco usa o código) */
  E.cidadePorNome = function (nome) {
    var n = norm(nome).replace(/-/g, ' '), l = E.cidades();
    for (var i = 0; i < l.length; i++) if (norm(l[i].nome).replace(/-/g, ' ') === n) return l[i];
    return null;
  };

  /* ---------- painel: vagas e candidatos da empresa ---------- */
  E.carregarVagas = function () {
    return E.api('vagasDaEmpresa', { empresaId: S.empresa.id }).then(function (r) {
      S.vagas = r.vagas || []; S.limites = r.limites || null;
      if (r.empresa) { S.empresa = r.empresa; for (var i = 0; i < S.empresas.length; i++) if (S.empresas[i].id === r.empresa.id) S.empresas[i] = r.empresa; }
    });
  };
  E.carregarCands = function (vagaId) {
    var d = { empresaId: S.empresa.id }; if (vagaId) d.vagaId = vagaId;
    return E.api('candidatos', d).then(function (r) { S.cands = (r.lista || []).map(E.preparaCand); S.totais = r.totais || null; S.candsVaga = vagaId || ''; });
  };
  E.carregarPainel = function (vagaId) {
    return Promise.all([E.carregarVagas(), E.carregarCands(vagaId || '')]).then(function () { S.painelEm = Date.now(); });
  };
  /* acrescenta campos de leitura rápida sem mudar o que veio do banco */
  E.preparaCand = function (c) { c.t = E.ms(c.criadaEm); return c; };
  E.vagaPor = function (id) { for (var i = 0; i < S.vagas.length; i++) if (S.vagas[i].id === id) return S.vagas[i]; return null; };
  E.candPor = function (id) { for (var i = 0; i < S.cands.length; i++) if (S.cands[i].id === id) return S.cands[i]; return null; };
  E.candsDa = function (vid) { return S.cands.filter(function (c) { return !vid || c.vagaId === vid; }); };
  E.trocaVaga = function (v) { /* troca (ou põe) uma vaga na lista local */
    for (var i = 0; i < S.vagas.length; i++) if (S.vagas[i].id === v.id) { S.vagas[i] = v; return; }
    S.vagas.unshift(v);
  };
  E.trocaCand = function (c) {
    E.preparaCand(c);
    for (var i = 0; i < S.cands.length; i++) if (S.cands[i].id === c.id) { S.cands[i] = c; return c; }
    S.cands.push(c); return c;
  };

  /* ---------- verificação, limites e vagas ---------- */
  E.verificada = function () { return !!(S.empresa && S.empresa.verificada); };
  E.emVerificacao = function () { return !!S.empresa && !S.empresa.verificada; };
  E.estadoEmpresa = function () { return (S.empresa && S.empresa.estado) || 'em_verificacao'; };
  E.maxNoAr = function () { return S.limites ? S.limites.maxNoAr : (E.verificada() ? null : E.CON.LIMITES.vagasNoAr); };
  E.maxHoje = function () { return S.limites ? S.limites.maxHoje : (E.verificada() ? 30 : E.CON.LIMITES.vagasPorDia); };
  E.noAr = function () { return S.vagas.filter(function (v) { return v.status === 'aberta'; }).length; };
  E.restanteNoAr = function () { var m = E.maxNoAr(); return m == null ? 999 : Math.max(0, m - E.noAr()); };
  E.restanteHoje = function () { var m = E.maxHoje(), h = S.limites ? S.limites.hoje : 0; return m == null ? 999 : Math.max(0, m - h); };
  E.abertas = function () { return S.vagas.filter(function (v) { return v.status === 'aberta'; }); };
  E.grupoVaga = function (v) {
    if (v.status === 'aberta') return 'aberta';
    if (v.status === 'pausada') return 'pausada';
    if (v.status === 'rascunho') return 'rascunho';
    if (v.status === 'segurada' || v.status === 'revisao') return 'revisao';
    return 'encerrada';
  };
  /* "Cabem 3 vagas no ar e 3 novas por dia enquanto verificamos." */
  E.textoLimites = function () {
    var a = E.maxNoAr(), h = E.maxHoje();
    return 'Enquanto a empresa está em verificação, cabem ' + (a == null ? 3 : a) + ' vagas no ar e ' + (h == null ? 3 : h) + ' vagas novas por dia.';
  };
  E.prazoVerificacao = function () { return S.empresa && S.empresa.prazoAte ? E.dataBr(E.ms(S.empresa.prazoAte)) : ''; };
  E.noArAte = function (v) { return v.repete && v.tipo === 'Diária' ? 'toda semana' : (v.expiraEm ? E.dataBr(E.ms(v.expiraEm)) : ''); };

  /* ---------- endereços (lojas) ---------- */
  E.lojas = function () { return (S.empresa && S.empresa.lojas) || []; };
  E.variasLojas = function () { return E.lojas().length > 1; };
  E.lojaCidadeSlug = function (l) {
    if (!l || !l.cidade) return S.empresa ? S.empresa.cidade : '';
    if (E.cidadePor(l.cidade)) return l.cidade;
    var c = E.cidadePorNome(l.cidade); return c ? c.id : (S.empresa ? S.empresa.cidade : '');
  };
  E.lojaDe = function (v) {
    var ls = E.lojas(), i;
    for (i = 0; i < ls.length; i++) if (norm(ls[i].bairro) === norm(v.bairro) && E.lojaCidadeSlug(ls[i]) === v.cidade) return ls[i];
    return null;
  };
  E.tituloLocal = function (v) { var l = E.variasLojas() ? E.lojaDe(v) : null; return l ? v.titulo + ' · ' + l.nome : v.titulo; };

  /* ---------- diária: dias à frente e texto do horário ---------- */
  E.diasProximos = function (n) {
    var out = [], t = E.agora();
    for (var i = 0; i < n; i++) {
      var m = t + i * E.DIA, wd = E.diaSemana(m);
      out.push({ i: i, ms: m, iso: E.dataIsoBr(m), rot: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : E.SEMANA[wd].replace(/^./, function (c) { return c.toUpperCase(); }), data: E.dataBr(m), fds: wd === 0 || wd === 6 });
    }
    return out;
  };
  E.turnoPelaHora = function (das, as, fds) { if (fds) return 'Fim de semana'; if (as <= 13) return 'Manhã'; if (das >= 18) return 'Noite'; if (das >= 12) return 'Tarde'; return 'Comercial'; };
  E.hh = function (h) { return ('0' + h).slice(-2) + ':00'; };
  E.diaExtenso = function (m) { return E.SEMANA_LONGA[E.diaSemana(m)]; };
  E.textoDiaria = function (d, curto) {
    var x = E.diasProximos(8)[d.dia] || E.diasProximos(1)[0], wd = E.diaSemana(x.ms);
    var q = d.repetir ? (wd === 0 || wd === 6 ? 'Todo ' : 'Toda ') + E.diaExtenso(x.ms) : E.SEMANA[wd].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + x.data;
    return q + (curto ? ', ' + d.das + 'h às ' + d.as + 'h' : ', das ' + d.das + 'h às ' + d.as + 'h');
  };
  /* a diária da vaga (formato do banco) como texto curto */
  E.diariaCurta = function (v) { return v.horario || (v.repete ? 'Repete toda semana' : v.turno || ''); };

  /* ---------- vagas prontas neste aparelho (as que passaram do limite do dia) ---------- */
  E.lerLote = function () { var l = E.lerJSON(CHAVE_LOTE); return Array.isArray(l) ? l : []; };
  E.gravarLote = function (l) { if (l.length) E.gravarJSON(CHAVE_LOTE, l); else E.apagar(CHAVE_LOTE); };

  /* ---------- link da vaga e mensagem para compartilhar ---------- */
  E.linkCurto = function (v) {
    var base = E.previa ? 'https://vagas.exemplo' : String(E.CFG.SITE_URL || location.origin).replace(/\/+$/, '');
    return base + '/v/' + v.id;
  };
  E.mensagemCompartilhar = function (v) {
    var t = E.salTexto(v.salario), onde = [v.bairro, E.cidadeNome(v.cidade)].filter(Boolean).join(' de ');
    return 'Estamos contratando ' + v.titulo + (t.v ? ': ' + t.v + ' ' + t.p : '') + (onde ? ', no ' + onde : '') + '. Candidate-se pelo Vagas sem Caos: ' + E.linkCurto(v) + ' ' +
      'Nunca pague para se candidatar.' + (E.previa ? ' (vaga de exemplo, não é real)' : '');
  };
  E.linkWhatsAppCompartilhar = function (msg) { return 'https://wa.me/?text=' + encodeURIComponent(msg); };
  E.abrirEmNovaAba = function (url) {
    var a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    document.body.appendChild(a); a.click(); a.remove();
  };

  /* ---------- ajuda da Gestão sem Caos (número só se estiver configurado) ---------- */
  E.ajudaHtml = function (rotulo, texto) {
    var a = E.CFG.ajuda ? E.CFG.ajuda(texto || '') : { tipo: 'contingencia', texto: '', href: '' };
    if (a.href) return '<a class="link" href="' + esc(a.href) + '" target="_blank" rel="noopener noreferrer">' + esc(rotulo || 'Falar com a Gestão sem Caos') + '</a>';
    return '<span class="detalhe">' + esc(a.texto || '') + '</span>';
  };
})();
