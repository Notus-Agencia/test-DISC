/*
 * Vagas sem Caos — área de quem procura emprego (eu.html), no celular. Este arquivo é o núcleo: guarda de conta de pessoa, topo com
 * a cidade (sempre do dado), navegação inferior com os convites a responder, roteador por hash e o contexto (ctx) que as telas usam.
 * As telas ficam em eu-curriculo.js, eu-candidaturas.js, eu-referencias.js e eu-dados.js (registram-se em VAGAS_EU_TELAS); a lógica
 * pura em eu-logica.js. Carregue depois de endereco.js, config.js, regras.js, textos.js, textos-conta.js, api.js, ui.js, ui-area.js,
 * pecas.js, pecas-pessoa.js, conversa.js e dos arquivos das telas (este por último: ele começa tudo).
 *
 * Rotas (docs/VAGAS-TELAS.md §1): #curriculo/1…5 · #candidaturas · #conversa/<id> · #quem-viu · #dados · #referencias ·
 *   #referencia/pedir · #referencia/<id>. Sem rota: currículo incompleto -> #curriculo/1; completo -> #dados.
 */
(function (root) {
  'use strict';
  var doc = root.document;
  var CHAVE_QUERO = 'vg.quero';                 // intenção de "Quero" guardada pela página da vaga (casca): {codigo, id, em}
  var VALIDADE_QUERO = 7 * 86400000;           // a mesma validade da página da vaga
  var CHAVE_CACHE = 'vg.cache.candidaturas';    // última lista vista (mostrada sem internet), só da mesma conta

  function iniciar() {
    var U = root.VAGAS_UI;
    var A = root.VAGAS_API;
    var L = root.VAGAS_EU_LOGICA;
    var TELAS = root.VAGAS_EU_TELAS || {};
    var el = U.el;
    var app = doc.getElementById('app');
    var roteador = null;
    var ativo = null;

    var ctx = {
      app: app, eu: null, email: '', cidades: [], minha: null, candidaturas: null, convites: 0, refsPendentes: 0, cv: null,
      cidadeDe: function (slug) { return ctx.cidades.filter(function (c) { return c.slug === slug; })[0] || null; },
      zonasDe: function (slug) { var c = ctx.cidadeDe(slug); return c ? (c.zonas || []) : []; },
      titulo: function (t) { doc.title = t + ' | Vagas sem Caos'; },
      ir: function (h) { if (roteador) roteador.ir(h); else root.location.hash = h; },
      // A tela que tem algo rodando (a conversa consulta a cada 20 s) registra aqui; trocar de rota para.
      ativo: function (obj) { ativo = obj; },
      nav: function (atual) { return U.fixar(U.navPessoa(atual, { badges: { candidaturas: ctx.convites, eu: ctx.refsPendentes } })); },
      hrefVagas: function () {
        var p = ctx.minha && ctx.minha.pessoa;
        var slug = (p && p.cidade && p.cidade.slug) || U.cidadeLembrada();
        return slug ? 'cidade.html?cidade=' + encodeURIComponent(slug) : 'index.html';
      },
      // Cabeçalho comum das telas: voltar (opcional), sobretítulo, h1 e subtítulo.
      cabecalho: function (op) {
        return el('div', { class: 'vg-eu-cabecalho' }, [
          op.voltar ? el('a', { class: 'botao botao--link vg-voltar', href: op.voltar.href, id: op.voltar.id || 'vg-voltar' }, [U.icone('voltar'), op.voltar.rotulo]) : null,
          op.sobretitulo ? el('p', { class: 'sobretitulo' }, op.sobretitulo) : null,
          el('h1', { class: 'titulo-pagina', id: op.idTitulo, tabindex: '-1' }, op.titulo),
          op.subtitulo ? el('p', { class: 'subtitulo', id: op.idSubtitulo }, op.subtitulo) : null
        ]);
      },
      recarregarMinha: function () { return A.minhaPessoa().then(function (r) { ctx.minha = r; ctx.eu.pessoa = ctx.eu.pessoa || {}; ctx.eu.pessoa.completo = !!r.completo; return r; }); },
      recarregarCandidaturas: function () {
        return A.minhasCandidaturas().then(function (r) {
          ctx.candidaturas = r.candidaturas || [];
          ctx.convites = L.convitesPendentes(ctx.candidaturas);
          U.armazenamento.gravar(CHAVE_CACHE, { conta: ctx.email, em: Date.now(), candidaturas: ctx.candidaturas });
          return ctx.candidaturas;
        });
      },
      candidaturasGuardadas: function () {
        var g = U.armazenamento.ler(CHAVE_CACHE);
        return g && g.conta === ctx.email && Array.isArray(g.candidaturas) ? g.candidaturas : null;
      },
      recarregarConta: function () { return A.eu().then(function (r) { ctx.eu = r; ctx.refsPendentes = (r.pessoa && r.pessoa.referenciasPendentes) || 0; return r; }); },
      // Intenção de "Quero" ainda valendo (a página da vaga envia sozinha quando o currículo fica completo).
      intencao: function () {
        var i = U.armazenamento.ler(CHAVE_QUERO);
        return i && typeof i.codigo === 'string' && /^[A-Z0-9]{4,12}$/.test(i.codigo) && Number(i.em) > Date.now() - VALIDADE_QUERO ? i : null;
      },
      // Ao sair ou excluir a conta: nada desta pessoa fica no aparelho (o celular costuma ser dividido).
      limparAparelho: function () {
        ['vg.rascunho.curriculo', 'vg.rascunho.referencia-pedir', CHAVE_CACHE, CHAVE_QUERO, 'vg.aceite.candidatura'].forEach(function (k) { U.armazenamento.apagar(k); });
        (ctx.candidaturas || []).forEach(function (k) { U.armazenamento.apagar('vg.rascunho.conversa.' + k.id); });
      }
    };

    function trocarDeRota() {
      if (ctx.gravarRascunhoPendente) ctx.gravarRascunhoPendente();
      ctx.gravarRascunhoPendente = null;
      if (ativo && typeof ativo.parar === 'function') ativo.parar();
      ativo = null;
      U.tirarFaixa('vg-faixa-offline');
    }
    function tela(nome) {
      return function (resto) {
        trocarDeRota();
        var fn = TELAS[nome];
        if (typeof fn !== 'function') { U.vazio(app, { titulo: 'Esta parte ainda não está pronta.', h1: true, texto: '', botao: { rotulo: 'Voltar', href: 'eu.html#dados' } }); return null; }
        return fn(ctx, resto);
      };
    }

    // O que foi digitado e ainda não foi para o rascunho vai antes de a página fechar (celular troca de app, aba some).
    root.addEventListener('pagehide', function () { if (ctx.gravarRascunhoPendente) ctx.gravarRascunhoPendente(); });    U.topo({});
    U.carregando(app);
    // Conta suspensa: exigirConta (casca) põe a faixa "só leitura" e não resolve; aqui o "Carregando…" vira a mensagem.
    var vigia = root.MutationObserver ? new root.MutationObserver(function () {
      if (ctx.eu || !doc.body.classList.contains('vg-so-leitura')) return;
      vigia.disconnect();
      U.vazio(app, { id: 'vg-eu-suspensa', titulo: 'Conta suspensa', h1: true, texto: U.t('avisos.conta_suspensa') });
      U.focarTitulo(app);
    }) : null;
    if (vigia) vigia.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    U.exigirConta({ tipo: 'pessoa', raiz: app }).then(function (eu) {
      if (vigia) vigia.disconnect();
      ctx.eu = eu;
      ctx.email = String((eu.conta && eu.conta.email) || '').toLowerCase();
      ctx.refsPendentes = (eu.pessoa && eu.pessoa.referenciasPendentes) || 0;
      return Promise.all([
        A.cidades().then(function (r) { return r.cidades || []; }, function () { return []; }),
        A.minhaPessoa(),
        ctx.recarregarCandidaturas().catch(function () { return null; })
      ]);
    }).then(function (r) {
      ctx.cidades = r[0];
      ctx.minha = r[1];
      var p = ctx.minha && ctx.minha.pessoa;
      var lembrada = U.cidadeLembrada();
      var ativas = ctx.cidades.filter(function (c) { return c.status === 'ativa'; });
      var cid = (p && p.cidade && (ctx.cidadeDe(p.cidade.slug) || p.cidade)) || ctx.cidadeDe(lembrada) || ativas[0] || null;
      // "Vagas" na navegação abre a cidade lembrada no aparelho; sem lembrança, a do currículo.
      if (!lembrada && p && p.cidade && p.cidade.slug) U.lembrarCidade(p.cidade.slug);
      U.definirFuso(cid && cid.fuso);
      U.topo({ cidade: cid ? { nome: cid.nome, slug: cid.slug } : null, aoCidade: function () { U._api.navegar('index.html?escolher=1'); } });
      var padrao = ctx.minha && ctx.minha.completo ? 'dados' : 'curriculo/1';
      // Sem âncora: grava a rota padrão no endereço (voltar e recarregar caem no mesmo lugar) sem disparar hashchange.
      if (!String(root.location.hash || '').replace(/^#/, '') && root.history && root.history.replaceState) {
        try { root.history.replaceState(null, '', '#' + padrao); } catch (e) { /* segue com a rota padrão do roteador */ }
      }
      roteador = U.roteador({ raiz: app, padrao: padrao, rotas: {
        'curriculo': function () { trocarDeRota(); ctx.ir('curriculo/1'); },
        'curriculo/': tela('curriculo'),
        'candidaturas': tela('candidaturas'),
        'conversa/': tela('conversa'),
        'quem-viu': tela('quemViu'),
        'dados': tela('dados'),
        'referencias': tela('referencias'),
        'referencia/pedir': tela('pedirReferencia'),
        'referencia/': tela('referencia'),
        '*': function () { trocarDeRota(); root.location.replace('#' + padrao); }
      } });
    }, function (e) {
      U.tratarErro(e, { raiz: app, aoTentar: function () { root.location.reload(); } });
    });
  }

  var VAGAS_EU = { iniciar: iniciar, CHAVE_QUERO: CHAVE_QUERO, CHAVE_CACHE: CHAVE_CACHE };
  if (typeof module !== 'undefined' && module.exports) { module.exports = VAGAS_EU; return; }
  root.VAGAS_EU = VAGAS_EU;
  if (doc && doc.getElementById('app')) iniciar();
})(typeof self !== 'undefined' ? self : this);
