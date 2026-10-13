/*
 * Vagas sem Caos — base do painel da EMPRESA (empresa.html e referencia.html): contexto da conta (empresas, empresa atual,
 * cidade, zonas, fuso), menu lateral, faixas de situação da empresa (em análise / suspensa, com o motivo da moderação) e peças
 * de formulário do computador (cabeçalho, caixa, pílulas de escolha, campo, caixa de marcar). Carregue depois de ui.js,
 * ui-area.js, pecas.js e empresa-regras.js. Tudo montado com VAGAS_UI.el (texto sempre como textNode).
 *
 *   VAGAS_EMPRESA.carregar() -> Promise<ctx> · ctx = {eu, empresas, empresa, cidades, cidade}
 *   VAGAS_EMPRESA.menu({atual, base}) · marcar(rota) · faixas() · motivo(chave, vars) · zonas() · ativa() · suspensa()
 *   verificada() · dono() · nomeResponsavel() · lembrarResponsavel(nome) · escolher(empresaId)
 *   cabecalho({sobre, titulo, texto, acoes, extra}) · caixa({titulo, id, classe}, filhos) · chips({...}) · campo({...}) · marcar({...})
 *   tela(raiz, filhos) (troca o conteúdo e põe o foco no h1)
 * As telas (empresa-vaga.js, empresa-conversa.js, empresa-referencias.js, empresa.js) se registram em VAGAS_EMPRESA.telas.
 */
(function (root) {
  'use strict';
  var U = root.VAGAS_UI;
  var A = root.VAGAS_API;
  var ER = root.VAGAS_EMPRESA_REGRAS;
  var el = U.el;
  var CHAVE_EMPRESA = 'vg.empresa.atual';
  var CHAVE_NOME = 'vg.empresa.responsavel';

  var ctx = { eu: null, empresas: [], empresa: null, cidades: [], cidade: null, naoLidas: 0 };
  var E = root.VAGAS_EMPRESA || {};
  E.ctx = ctx;
  E.telas = E.telas || {};

  // ------------------------------------------------------------------------------------------------- contexto
  function escolherEmpresa(lista) {
    var guardada = U.armazenamento.ler(CHAVE_EMPRESA);
    return lista.filter(function (e) { return e.id === guardada; })[0] || lista[0] || null;
  }
  function carregar() {
    return Promise.all([A.minhasEmpresas(), A.cidades().catch(function () { return { cidades: [] }; })]).then(function (r) {
      ctx.empresas = r[0].empresas || [];
      ctx.cidades = r[1].cidades || [];
      ctx.empresa = escolherEmpresa(ctx.empresas);
      ctx.cidade = ctx.empresa ? ctx.cidades.filter(function (c) { return c.slug === ctx.empresa.cidade.slug; })[0] || null : null;
      U.definirFuso(ctx.cidade && ctx.cidade.fuso);
      return ctx;
    });
  }
  function escolher(id) { U.armazenamento.gravar(CHAVE_EMPRESA, id); }
  function zonas() { return (ctx.cidade && ctx.cidade.zonas) || []; }
  function ativa() { return !!(ctx.empresa && ctx.empresa.status === 'ativa'); }
  function suspensa() { return !!(ctx.empresa && ctx.empresa.status === 'suspensa'); }
  function verificada() { return !!(ctx.empresa && ctx.empresa.status === 'ativa' && ctx.empresa.cnpjConferidoEm); }
  function dono() { return !!(ctx.empresa && ctx.empresa.papel === 'dono'); }
  function nomeResponsavel() { var n = U.armazenamento.ler(CHAVE_NOME); return typeof n === 'string' ? n : ''; }
  function lembrarResponsavel(nome) { if (nome) U.armazenamento.gravar(CHAVE_NOME, String(nome).slice(0, 60)); }
  // Motivo da moderação para a empresa (moderacao.json via textos-conta.js); motivo livre aparece como veio.
  function motivo(chave, vars) {
    var T = root.VAGAS_TEXTOS || {};
    return ER.motivoModeracao(chave, vars || {}, T.moderacao && T.moderacao.motivos);
  }

  // ------------------------------------------------------------------------------------------------- menu lateral
  var GRUPOS = [
    { titulo: 'Minha empresa', itens: [['inicio', 'Início', 'casa'], ['vagas', 'Minhas vagas', 'vagas'], ['conversas', 'Conversas', 'conversa'], ['referencias', 'Referências', 'selo']] },
    { titulo: 'Mais', itens: [['banco', 'Buscar no banco', 'lupa'], ['compras', 'Compras', 'moeda'], ['dados', 'Dados da empresa', 'predio']] }
  ];
  var gavetaLigada = false;
  function menu(op) {
    op = op || {};
    var base = op.base || '';
    var e = ctx.empresa;
    var nome = nomeResponsavel();
    var grupos = GRUPOS.map(function (g) {
      return { titulo: g.titulo, itens: g.itens.map(function (i) {
        var n = i[0] === 'vagas' && e && e.anuncios ? e.anuncios.total : i[0] === 'conversas' ? ctx.naoLidas : 0;
        return { id: 'vg-emp-aba-' + i[0], rotulo: i[1], icone: i[2], href: base + '#' + i[0], rota: i[0], n: n || '', etiqueta: i[0] === 'banco' ? 'Fase 2' : '' };
      }) };
    });
    grupos[1].itens.push({ id: 'vg-emp-sair', rotulo: 'Sair', icone: 'sair', aoClicar: sair });
    var aside = U.menuLateral({ id: 'vg-menu', produto: 'Vagas sem Caos · Empresa', grupos: grupos,
      usuario: e ? { nome: nome || e.nomeFantasia, papel: nome ? e.nomeFantasia : (e.papel === 'dono' ? 'Dono(a)' : 'Recrutador(a)') } : null });
    var antigo = root.document.getElementById('vg-menu');
    var principal = root.document.querySelector('main');
    if (antigo) antigo.parentNode.replaceChild(aside, antigo);
    else principal.parentNode.insertBefore(aside, principal);
    if (!gavetaLigada) { U.ligarGaveta({ botao: 'vg-menu-abrir', menu: 'vg-menu' }); gavetaLigada = true; }
    if (op.atual) U.marcarMenu(op.atual);
    return aside;
  }
  function sair() {
    A.sair().then(function () { U._api.navegar('entrar.html?tipo=empresa'); });
  }
  // Conversas com mensagem nova (número no menu); não bloqueia a tela.
  function contarConversas() {
    if (!ctx.empresa) return Promise.resolve(0);
    return A.conversasDaEmpresa(ctx.empresa.id).then(function (r) {
      ctx.naoLidas = (r.conversas || []).filter(function (c) { return c.naoLidas > 0; }).length;
      var n = root.document.querySelector('#vg-emp-aba-conversas .aba__n');
      if (n) n.textContent = ctx.naoLidas ? String(ctx.naoLidas) : '';
      return ctx.naoLidas;
    }, function () { return 0; });
  }

  // ------------------------------------------------------------------------------------------------- faixas da empresa
  // Em análise: dá para escrever vagas (vão ao ar depois da liberação). Recusada pela operação: continua em análise, com o
  // motivo para corrigir. Suspensa: faixa fixa e tudo só leitura (docs/VAGAS-TELAS.md §3.1).
  function faixas() {
    U.tirarFaixa('vg-faixa-empresa');
    var e = ctx.empresa;
    if (!e) return;
    var m = motivo(e.statusMotivo, { empresa_nome: e.nomeFantasia, cnpj: e.cnpjFormatado });
    if (e.status === 'suspensa') {
      U.somenteLeitura('Conta suspensa.' + (m ? ' Motivo: ' + m.texto : '') + ' Fale com a praça.');
      return;
    }
    if (e.status === 'em_analise') {
      U.faixa({ id: 'vg-faixa-empresa', forte: 'Em análise.', texto: m
        ? 'A operação da praça pediu um ajuste no cadastro: ' + m.texto + (m.correcao ? ' ' + m.correcao : '')
        : 'Seu CNPJ está em conferência pela operação da praça. Dá para escrever vagas; elas vão ao ar depois da liberação.' });
    }
  }

  // ------------------------------------------------------------------------------------------------- peças de tela
  function cabecalho(op) {
    op = op || {};
    return el('div', { class: 'cabecalho' }, [
      el('div', { class: 'cabecalho__texto-area' }, [
        op.sobre ? el('p', { class: 'sobretitulo', id: op.idSobre }, op.sobre) : null,
        el('h1', { class: 'cabecalho__titulo t-pagina seminegrito', id: op.idTitulo, tabindex: '-1' }, op.titulo || ''),
        op.texto ? el('p', { class: 'cabecalho__texto', id: op.idTexto }, op.texto) : null,
        op.extra || null]),
      (op.acoes || []).filter(Boolean).length ? el('div', { class: 'cabecalho__acoes' }, op.acoes.filter(Boolean)) : null
    ]);
  }
  function caixa(op, filhos) {
    op = op || {};
    var idTitulo = op.id ? op.id + '-titulo' : null;
    return el('section', { class: 'caixa ' + (op.classe || 'caixa--compacta'), id: op.id, 'aria-labelledby': op.titulo ? idTitulo : null }, [
      op.titulo ? el('h2', { class: 'caixa__titulo', id: idTitulo }, op.titulo) : null].concat(filhos || []));
  }
  // Escolha em pílulas (nunca <select>). Única: role=radio + aria-checked; múltipla: aria-pressed (com limite opcional).
  function chips(op) {
    op = op || {};
    var multiplo = !!op.multiplo;
    var atual = multiplo ? (op.valor || []).slice() : (op.valor == null ? '' : op.valor);
    var grupo = el('div', { class: 'vg-opcoes', id: op.id, role: multiplo ? 'group' : 'radiogroup', 'aria-labelledby': op.id + '-rotulo' });
    function desenhar() {
      Array.prototype.forEach.call(grupo.children, function (b) {
        var v = b.getAttribute('data-valor');
        var sim = multiplo ? atual.indexOf(v) >= 0 : atual === v;
        b.setAttribute(multiplo ? 'aria-pressed' : 'aria-checked', sim ? 'true' : 'false');
      });
    }
    (op.opcoes || []).forEach(function (o) {
      grupo.appendChild(el('button', { type: 'button', class: 'vg-chip', role: multiplo ? null : 'radio', data: { valor: o.id }, disabled: !!o.desabilitado || !!op.desabilitado,
        onclick: function () {
          if (multiplo) {
            var i = atual.indexOf(o.id);
            if (i >= 0) atual.splice(i, 1);
            else {
              if (op.max && atual.length >= op.max) { if (op.aoLimite) op.aoLimite(); return; }
              atual.push(o.id);
            }
          } else atual = o.id;
          desenhar();
          U.limparErroCampo(grupo);
          if (op.aoMudar) op.aoMudar(multiplo ? atual.slice() : atual);
        } }, o.rotulo));
    });
    desenhar();
    var no = el('div', { class: 'campo' + (op.largo ? ' campo--largo' : '') }, [
      el('p', { class: 'campo__rotulo', id: op.id + '-rotulo' }, [op.rotulo || '', op.obrigatorio ? [' ', el('span', { class: 'obrigatorio' }, '(obrigatório)')] : null,
        op.opcional ? [' ', el('span', { class: 'obrigatorio' }, '(opcional)')] : null]),
      grupo, op.ajuda ? el('span', { class: 'campo__ajuda', id: op.id + '-ajuda' }, op.ajuda) : null]);
    return { no: no, grupo: grupo, valor: function () { return multiplo ? atual.slice() : atual; },
      definir: function (v) { atual = multiplo ? (v || []).slice() : (v == null ? '' : v); desenhar(); } };
  }
  function campo(op) {
    op = op || {};
    var atributos = Object.assign({ id: op.id, class: 'entrada', type: op.tipo || 'text', value: op.valor == null || op.valor === '' ? null : String(op.valor),
      'aria-describedby': op.ajuda ? op.id + '-ajuda' : null }, op.atributos || {});
    var c = op.multilinha ? el('textarea', Object.assign({ id: op.id, class: 'entrada', rows: op.linhas || '4', 'aria-describedby': op.ajuda ? op.id + '-ajuda' : null }, op.atributos || {}))
      : el('input', atributos);
    if (op.multilinha && op.valor) c.value = String(op.valor);
    var no = el('div', { class: 'campo' + (op.largo ? ' campo--largo' : '') + (op.classe ? ' ' + op.classe : '') }, [
      el('label', { class: 'campo__rotulo', for: op.id }, [op.rotulo || '', op.obrigatorio ? [' ', el('span', { class: 'obrigatorio' }, '(obrigatório)')] : null,
        op.opcional ? [' ', el('span', { class: 'obrigatorio' }, '(opcional)')] : null]),
      c, op.depois || null, op.ajuda ? el('span', { class: 'campo__ajuda', id: op.id + '-ajuda' }, op.ajuda) : null]);
    c.addEventListener('input', function () { U.limparErroCampo(c); });
    return { no: no, campo: c };
  }
  function marcar(op) {
    op = op || {};
    var caixaMarcar = el('input', { type: 'checkbox', id: op.id, checked: !!op.marcado, disabled: !!op.desabilitado, data: { valor: op.valor } });
    if (op.aoMudar) caixaMarcar.addEventListener('change', function () { U.limparErroCampo(caixaMarcar); op.aoMudar(caixaMarcar.checked); });
    return { no: el('label', { class: 'marcar t-rotulo' }, [caixaMarcar, el('span', {}, op.rotulo)]), caixa: caixaMarcar };
  }
  function lista(itens, classe) { return el('ul', { class: classe || 'vg-emp-lista' }, (itens || []).map(function (t) { return el('li', {}, t); })); }
  function tela(raiz, filhos) { U.trocar(raiz, filhos); return raiz; }
  // Candidatura -> vaga (só na memória desta aba): a conversa usa para achar o cartão "como chegou" e encerrar a vaga.
  var anuncioDaCandidatura = {};
  function lembrarAnuncio(cand, anuncioId) { if (cand && anuncioId) anuncioDaCandidatura[cand] = anuncioId; }
  function anuncioDe(cand) { return anuncioDaCandidatura[cand] || null; }
  function irPara(hash) { if (root.location.hash.replace(/^#/, '') === hash) root.dispatchEvent(new root.HashChangeEvent('hashchange')); else root.location.hash = hash; }

  E.carregar = carregar; E.escolher = escolher; E.zonas = zonas; E.ativa = ativa; E.suspensa = suspensa; E.verificada = verificada; E.dono = dono;
  E.nomeResponsavel = nomeResponsavel; E.lembrarResponsavel = lembrarResponsavel; E.motivo = motivo; E.menu = menu; E.contarConversas = contarConversas;
  E.faixas = faixas; E.cabecalho = cabecalho; E.caixa = caixa; E.chips = chips; E.campo = campo; E.marcar = marcar; E.lista = lista; E.tela = tela;
  E.irPara = irPara; E.sair = sair; E.lembrarAnuncio = lembrarAnuncio; E.anuncioDe = anuncioDe;
  root.VAGAS_EMPRESA = E;
})(typeof self !== 'undefined' ? self : this);
