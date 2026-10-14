/*
 * Vagas sem Caos — operação da praça (operador.html, computador). Casca da área: guarda de conta de operação (operador, moderador
 * ou equipe), escolha da cidade (só as que a conta opera, sempre do dado), menu lateral com contagens, roteador por hash e as
 * peças comuns das telas (cabeçalho e janela de motivo). As telas ficam em operador-moderacao.js (#fila, #denuncias, #empresas) e
 * operador-praca.js (#assistido, #boletim, #numeros, #repasse, #zonas), que se registram em VAGAS_OP_TELAS antes deste arquivo.
 *
 * Regra de LGPD na interface (docs/VAGAS-TELAS.md §4 e §10.8): não existe tela de pessoas. O operador vê vagas, empresas, o conteúdo
 * denunciado (nunca quem denunciou) e o e-mail que ele mesmo digitou no cadastro assistido. Nunca currículo, contato, foto, conversa.
 */
(function (root) {
  'use strict';
  var doc = root.document;
  var U = root.VAGAS_UI;
  var A = root.VAGAS_API;
  var O = root.VAGAS_OPERADOR;
  var T = root.VAGAS_TEXTOS;
  var el = U.el;
  var TELAS = root.VAGAS_OP_TELAS = root.VAGAS_OP_TELAS || {};
  var CHAVE_CIDADE = 'vg.op.cidade';

  var MENU = [
    { titulo: 'Moderação', itens: [['fila', 'Fila', 'lista'], ['denuncias', 'Denúncias', 'denuncia'], ['empresas', 'Empresas', 'predio']] },
    { titulo: 'Praça', itens: [['assistido', 'Cadastro assistido', 'pessoa'], ['boletim', 'Boletim do dia', 'copiar'], ['numeros', 'Números da praça', 'grafico'],
      ['repasse', 'Repasse do mês', 'moeda'], ['zonas', 'Zonas e textos', 'cidade']] }
  ];

  var ctx = {
    eu: null, cidades: [], slug: '', roteador: null,
    cidade: function () { var s = ctx.slug; return ctx.cidades.filter(function (c) { return c.slug === s; })[0] || ctx.cidades[0] || null; },
    papel: function () { var c = ctx.cidade(); return c ? c.papel : ''; },
    // Moderador(a) só modera: não aprova/recusa/suspende/reativa empresa, não faz cadastro assistido nem mexe em zona (VAGAS-SPEC §3).
    podeTudo: function () { return ctx.papel() !== 'moderador'; },
    motivos: function () { var m = T && T.buscar ? T.buscar('moderacao.motivos') : null; return m || {}; },
    site: function () { var s = root.VAGAS_CONFIG && root.VAGAS_CONFIG.SITE_URL; return String(s || '').replace(/\/+$/, ''); }
  };

  // ------------------------------------------------------------------------------------------------- peças comuns das telas
  ctx.cabecalho = function (op) {
    var c = ctx.cidade();
    return el('div', { class: 'cabecalho' }, [
      el('div', { class: 'cabecalho__texto-area' }, [
        el('p', { class: 'sobretitulo' }, (op.sobre || 'Praça') + (c ? ' · ' + c.nome : '')),
        el('h1', { class: 'cabecalho__titulo t-pagina seminegrito', tabindex: '-1' }, op.titulo),
        op.texto ? el('p', { class: 'cabecalho__texto' }, op.texto) : null
      ]),
      op.acoes ? el('div', { class: 'cabecalho__acoes' }, op.acoes) : null
    ]);
  };
  // Pílulas de escolha única (sem <select>): [{id, rotulo}] -> grupo com aria-checked; aoMudar(id).
  ctx.pilulas = function (op) {
    var grupo = el('div', { class: 'vg-opcoes', id: op.id, role: 'radiogroup', 'aria-label': op.rotulo, 'aria-labelledby': op.rotuloId });
    function marcar(id) {
      Array.prototype.forEach.call(grupo.children, function (b) { b.setAttribute('aria-checked', b.getAttribute('data-valor') === id ? 'true' : 'false'); });
    }
    (op.opcoes || []).forEach(function (o) {
      grupo.appendChild(el('button', { type: 'button', class: 'vg-chip', role: 'radio', 'aria-checked': 'false', data: { valor: o.id }, disabled: o.desligado,
        onclick: function () { marcar(o.id); grupo.valor = o.id; if (op.aoMudar) op.aoMudar(o.id); } }, o.rotulo));
    });
    grupo.valor = op.valor || '';
    marcar(grupo.valor);
    grupo.definir = function (id) { grupo.valor = id; marcar(id); };
    return grupo;
  };
  ctx.segmento = function (op) {
    var seg = el('div', { class: 'segmento', role: 'tablist', 'aria-label': op.rotulo });
    function marcar(id) {
      Array.prototype.forEach.call(seg.children, function (b) {
        var sim = b.getAttribute('data-valor') === id;
        b.setAttribute('aria-selected', sim ? 'true' : 'false');
        b.setAttribute('aria-pressed', sim ? 'true' : 'false');
      });
    }
    op.opcoes.forEach(function (o) {
      seg.appendChild(el('button', { type: 'button', class: 'segmento__botao', role: 'tab', id: o.idBotao, data: { valor: o.id },
        onclick: function () { marcar(o.id); op.aoMudar(o.id); } }, o.rotulo));
    });
    marcar(op.valor);
    seg.marcar = marcar;
    return seg;
  };

  // Janela de decisão com motivo da lista fechada (conteudo/vagas-textos/moderacao.json). Resolve {motivo, marcas} ou null.
  // op: {titulo, texto, motivos:[{chave, titulo, correcao}], sim, perigo, caixas:[{id, rotulo, marcada}], semEscolha (motivo fixo)}
  ctx.decidir = function (op) {
    return new Promise(function (resolver) {
      var escolhido = op.motivos.length === 1 ? op.motivos[0].chave : '';
      var resposta = null;
      var j = null;
      var erro = el('p', { class: 'campo__erro', id: 'vg-op-motivo-erro', role: 'alert', hidden: true });
      var ajuda = el('p', { class: 't-nota texto-suave vg-op-correcao', id: 'vg-op-motivo-ajuda', 'aria-live': 'polite' });
      function mostrarAjuda() {
        var m = op.motivos.filter(function (x) { return x.chave === escolhido; })[0];
        ajuda.textContent = m && m.correcao ? 'A empresa lê também: ' + m.correcao : '';
      }
      var lista = op.motivos.length > 1 ? ctx.pilulas({ id: 'vg-op-motivo', rotuloId: 'vg-op-motivo-rotulo', valor: escolhido,
        opcoes: op.motivos.map(function (m) { return { id: m.chave, rotulo: m.titulo }; }),
        aoMudar: function (id) { escolhido = id; erro.hidden = true; mostrarAjuda(); } }) : null;
      var caixas = (op.caixas || []).map(function (c) {
        return el('label', { class: 'marcar' }, [el('input', { type: 'checkbox', id: c.id, checked: !!c.marcada }), el('span', { class: 't-rotulo' }, c.rotulo)]);
      });
      var corpo = [
        op.texto ? el('p', { class: 't-rotulo texto-medio' }, op.texto) : null,
        lista ? el('p', { class: 'campo__rotulo', id: 'vg-op-motivo-rotulo' }, 'Motivo') : null,
        lista || (op.motivos[0] ? el('p', { class: 't-corpo seminegrito', id: 'vg-op-motivo-fixo' }, op.motivos[0].titulo) : null),
        erro, ajuda
      ].concat(caixas.length ? [el('div', { class: 'vg-op-caixas' }, caixas)] : []);
      var nao = el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-op-confirmar-cancelar', onclick: function () { j.fechar('nao'); } }, 'Cancelar');
      var sim = el('button', { type: 'button', class: 'botao ' + (op.perigo ? 'botao--perigo' : 'botao--principal'), id: 'vg-op-confirmar-sim', onclick: function () {
        if (op.motivos.length && !escolhido) { erro.textContent = 'Escolha o motivo.'; erro.hidden = false; return; }
        var marcas = {};
        (op.caixas || []).forEach(function (c) { var x = doc.getElementById(c.id); marcas[c.chave || c.id] = !!(x && x.checked); });
        resposta = { motivo: escolhido, marcas: marcas };
        j.fechar('sim');
      } }, op.sim || 'Confirmar');
      j = U.janela({ id: 'vg-op-confirmar', titulo: op.titulo, corpo: corpo, acoes: [nao, sim], foco: lista ? '.vg-chip' : '#vg-op-confirmar-cancelar',
        aoFechar: function () { resolver(resposta); } });
      mostrarAjuda();
    });
  };

  // Erro de uma ação: marcas padrão (sessão, conta suspensa, sem internet) pela base; o resto vira aviso com e.message.
  ctx.falhou = function (e) { U.tratarErro(e); };

  // ------------------------------------------------------------------------------------------------- contagens e menu
  function contagens() { var c = ctx.cidade(); return (c && c.contagens) || {}; }
  function numeroDoMenu(rota, n) {
    var a = doc.querySelector('.aba[data-rota="' + rota + '"] .aba__n');
    if (a) a.textContent = n > 0 ? String(n) : '';
  }
  function atualizarMenu() {
    var k = contagens();
    numeroDoMenu('fila', (Number(k.anunciosEmRevisao) || 0) + (Number(k.anunciosSuspensos) || 0) + (Number(k.empresasEmAnalise) || 0));
    numeroDoMenu('denuncias', Number(k.denunciasAbertas) || 0);
    var c = ctx.cidade();
    var papel = doc.getElementById('vg-op-papel');
    if (papel && c) papel.textContent = O.rotuloPapel(c.papel) + ' · ' + c.nome;
  }
  // Depois de cada decisão: contagens novas do banco (a fila e o menu ficam iguais ao que o banco diz).
  ctx.atualizarContagens = function () {
    return A.opResumo().then(function (r) { ctx.cidades = r.cidades || []; atualizarMenu(); return r; }, function () { /* o menu fica como estava */ });
  };

  function sair(ev) {
    if (ev && ev.currentTarget) U.ocupado(ev.currentTarget, true, 'Saindo…');
    function ir() { U._api.navegar('entrar.html'); }
    A.sair().then(ir, ir);
  }
  function montarMenu() {
    var c = ctx.cidade();
    var conta = ctx.eu && ctx.eu.conta;
    var grupos = MENU.map(function (g) {
      return { titulo: g.titulo, itens: g.itens.map(function (i) { return { id: 'vg-op-aba-' + i[0], rotulo: i[1], icone: i[2], href: '#' + i[0], rota: i[0] }; }) };
    });
    // Sair (O2 da revisão C): o cadastro assistido do mutirão costuma ser em aparelho emprestado. VAGAS_API.sair limpa o aparelho.
    grupos[grupos.length - 1].itens.push({ id: 'vg-op-sair', rotulo: 'Sair', icone: 'sair', aoClicar: sair });
    var menu = U.menuLateral({ id: 'vg-menu', produto: 'Operação da praça',
      grupos: grupos,
      usuario: { nome: (conta && conta.email) || 'Equipe da Gestão sem Caos', papel: c ? O.rotuloPapel(c.papel) + ' · ' + c.nome : '' } });
    // Selo fixo do menu (VAGAS-TELAS §4): toda ação do operador fica no registro de moderação.
    var produto = menu.querySelector('.menu-lateral__produto');
    if (produto) produto.parentNode.insertBefore(el('p', { class: 'vg-op-registro', id: 'vg-op-registro' }, [U.icone('escudo'), 'Cada ato fica registrado']), produto.nextSibling);
    var papel = menu.querySelector('.menu-lateral__usuario .t-nota');
    if (papel) papel.id = 'vg-op-papel';
    var principal = doc.getElementById('conteudo');
    principal.parentNode.insertBefore(menu, principal);
    U.ligarGaveta({ botao: 'vg-menu-abrir', menu: 'vg-menu' });
  }

  // Mais de uma cidade (equipe, ou operador de duas praças): pílulas acima da tela. Uma cidade só: nada a escolher.
  function barraCidades(principal) {
    var antiga = doc.getElementById('vg-op-cidades');
    if (antiga) antiga.parentNode.removeChild(antiga);
    if (ctx.cidades.length < 2) return;
    var barra = el('div', { class: 'vg-op-cidades', id: 'vg-op-cidades' }, [el('span', { class: 't-nota texto-suave', id: 'vg-op-cidades-rotulo' }, 'Cidade'),
      ctx.pilulas({ id: 'vg-op-cidade', rotuloId: 'vg-op-cidades-rotulo', valor: ctx.slug,
        opcoes: ctx.cidades.map(function (c) { return { id: c.slug, rotulo: c.nome }; }),
        aoMudar: function (slug) { trocarCidade(slug); } })]);
    principal.insertBefore(barra, principal.firstChild);
  }
  function trocarCidade(slug) {
    ctx.slug = slug;
    U.armazenamento.gravar(CHAVE_CIDADE, slug);
    var c = ctx.cidade();
    if (c && c.fuso) U.definirFuso(c.fuso);
    atualizarMenu();
    if (ctx.roteador) ctx.roteador.resolver();
  }

  // ------------------------------------------------------------------------------------------------- início
  function iniciar() {
    var principal = doc.getElementById('conteudo');
    U.limpar(principal);
    var raiz = el('div', { id: 'vg-op-tela' });
    principal.appendChild(raiz);
    U.carregando(raiz);
    U.exigirConta({ tipo: 'operador', raiz: raiz }).then(function (eu) {
      ctx.eu = eu;
      return A.opResumo();
    }).then(function (r) {
      ctx.cidades = r.cidades || [];
      if (!ctx.cidades.length) {
        U.vazio(raiz, { h1: true, titulo: 'Nenhuma cidade para operar', texto: 'Esta conta ainda não opera nenhuma cidade. Fale com a equipe da Gestão sem Caos.' });
        return;
      }
      var lembrada = U.armazenamento.ler(CHAVE_CIDADE);
      ctx.slug = ctx.cidades.some(function (c) { return c.slug === lembrada; }) ? lembrada : ctx.cidades[0].slug;
      // Cidades conhecidas (fuso, nome) para as datas da tela: vem de vagas_cidades_publicas quando a cidade está aberta.
      return A.cidades().then(function (pub) {
        var porSlug = {};
        (pub.cidades || []).forEach(function (c) { porSlug[c.slug] = c; });
        ctx.cidades.forEach(function (c) { var p = porSlug[c.slug]; c.fuso = p ? p.fuso : ''; c.zonas = p ? p.zonas : null; c.praca = p ? p.praca : null; });
      }, function () { /* sem a lista pública: datas no fuso de reserva */ }).then(function () {
        var c = ctx.cidade();
        U.definirFuso(c && c.fuso);
        montarMenu();
        barraCidades(principal);
        atualizarMenu();
        var rotas = {};
        Object.keys(TELAS).forEach(function (k) {
          rotas[k] = function (resto) {
            U.limpar(raiz);
            return Promise.resolve(TELAS[k](raiz, ctx, resto)).catch(function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { ctx.roteador.resolver(); } }); });
          };
        });
        rotas['*'] = rotas.fila;
        ctx.roteador = U.roteador({ rotas: rotas, padrao: 'fila', raiz: raiz, aoTrocar: function (rr) { U.marcarMenu(rr.chave === '*' ? 'fila' : rr.chave); } });
      });
    }).catch(function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { root.location.reload(); } }); });
  }

  root.VAGAS_OPERADOR_TELA = { ctx: ctx, iniciar: iniciar };
  if (doc && doc.getElementById('conteudo')) {
    U.aoVoltarInternet(function () { U.faixaOffline(false); if (ctx.roteador) ctx.roteador.resolver(); });
    iniciar();
  }
})(typeof self !== 'undefined' ? self : this);
