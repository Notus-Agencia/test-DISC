/*
 * Vagas sem Caos — base das telas COM CONTA (acrescenta ao VAGAS_UI de ui.js; carregue logo depois dele). Separado de ui.js para a
 * lista pública (cidade.html) caber nos 100 KB da primeira visita: ela não precisa de nada daqui.
 *
 * API:
 *   rotaPara(rotas, hash, padrao) -> {chave, resto, hash} (puro: a chave mais longa que serve; 'curriculo/' serve 'curriculo/3')
 *   roteador({rotas: {'inicio': fn, 'conversa/': fn(resto)}, padrao, raiz, aoTrocar, focarNoInicio}) -> {ir(hash), atual(), resolver()}
 *     (foco no h1 da raiz e rolagem ao topo a cada troca, como o teste DISC). As âncoras do "Pular para o conteúdo" (#conteudo, #app)
 *     não são rota: o foco vai para o elemento e o endereço volta para a rota atual.
 *   exigirConta({tipo: 'pessoa'|'empresa'|'operador', raiz?}) -> Promise<resposta de VAGAS_API.eu()>
 *     sem sessão -> entrar.html?voltar=<esta página>; conta assistida sem aceite -> entrar.html?termos=1&voltar=…;
 *     conta de outro tipo -> mensagem na raiz com "Sair e entrar com outra conta". Nesses casos a Promise nunca resolve.
 *   menuLateral({id?, produto, grupos: [{titulo, itens: [{id, rotulo, icone, href|aoClicar, rota, n, etiqueta}]}], usuario: {nome, papel}})
 *   marcarMenu(rota) (aria-current na .aba com data-rota) · ligarGaveta({botao:'vg-menu-abrir', menu:'vg-menu'}) (abaixo de 900 px)
 *   rascunho(tela, {armazenamento?, agora?}) -> {chave:'vg.rascunho.<tela>', ler() -> {dados, em}|null, gravar(dados) -> {em, hora}, apagar()}
 *   textoRascunho(hora) -> 'Rascunho salvo neste aparelho às 14:32' · mostrarRascunho(alvo, hora) (aria-live)
 *   copiar(texto) -> Promise · contador(campo, alvo, max) -> atualizar()
 */
(function (root) {
  'use strict';
  var U = (typeof module !== 'undefined' && module.exports) ? require('./ui.js') : root.VAGAS_UI;
  var doc = root.document || null;
  var el = U.el;

  // ------------------------------------------------------------------------------------------------- roteador por hash
  function rotaPara(rotas, hash, padrao) {
    var h = String(hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* mantém */ }
    if (!h) h = padrao || '';
    var melhor = null;
    Object.keys(rotas || {}).forEach(function (k) {
      if (k === '*') return;
      var serve = h === k || (k.slice(-1) === '/' && h.indexOf(k) === 0);
      if (serve && (melhor === null || k.length > melhor.length)) melhor = k;
    });
    if (melhor === null) return Object.prototype.hasOwnProperty.call(rotas || {}, '*') ? { chave: '*', resto: h, hash: h } : { chave: null, resto: h, hash: h };
    return { chave: melhor, resto: melhor.slice(-1) === '/' ? h.slice(melhor.length) : '', hash: h };
  }
  function roteador(op) {
    op = op || {};
    var primeira = true;
    var atual = null;
    function resolver() {
      var h = /^#(conteudo|app)$/.test(root.location.hash || '') ? '' : root.location.hash;   // âncora do "Pular" não é rota
      var r = rotaPara(op.rotas, h, op.padrao);
      atual = r;
      var fn = r.chave !== null ? op.rotas[r.chave] : null;
      var saida = fn ? fn(r.resto, r.hash) : null;
      Promise.resolve(saida).then(function () {
        if (op.aoTrocar) op.aoTrocar(r);
        if (!primeira || op.focarNoInicio) { U.focarTitulo(op.raiz); try { root.scrollTo(0, 0); } catch (e) { /* ignora */ } }
        primeira = false;
      });
      return r;
    }
    function aoMudarHash() {
      var m = /^#(conteudo|app)$/.exec(root.location.hash || '');
      if (m && atual) {
        try { if (root.history && root.history.replaceState) root.history.replaceState(null, '', '#' + atual.hash); } catch (e) { /* segue */ }
        var alvo = doc && doc.getElementById(m[1]);
        if (alvo) { if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1'); alvo.focus(); }
        return;
      }
      resolver();
    }
    root.addEventListener('hashchange', aoMudarHash);
    resolver();
    return {
      ir: function (h) { if (root.location.hash.replace(/^#/, '') === h) resolver(); else root.location.hash = h; },
      atual: function () { return atual; },
      resolver: resolver
    };
  }

  // ------------------------------------------------------------------------------------------------- conta
  function mensagemTela(raiz, titulo, texto, botoes) {
    var alvo = raiz || doc.getElementById('app') || doc.getElementById('conteudo');
    if (!alvo) return;
    U.trocar(alvo, el('section', { class: 'caixa vazio' }, [el('h1', { class: 'vazio__titulo', tabindex: '-1' }, titulo), el('p', { class: 'vazio__texto' }, texto),
      botoes ? el('div', { class: 'acoes acoes-coluna' }, botoes) : null]));
    U.focarTitulo(alvo);
  }
  function exigirConta(op) {
    op = op || {};
    var A = root.VAGAS_API;
    var nunca = new Promise(function () { /* a própria função cuida da tela */ });
    return A.eu().then(function (r) {
      var c = r.conta;
      var tipo = op.tipo;
      var rr = root.VAGAS_REGRAS || { MSG: {} };
      if (c && !c.termosVersao) { U._api.navegar(U.linkEntrar(U.paginaAtual(), 'termos=1')); return nunca; }
      var serve = !tipo || (tipo === 'operador' ? !!(r.admin || (r.operador && r.operador.length)) : !!(c && c.tipo === tipo));
      if (serve) return r;
      var texto = tipo === 'pessoa' ? rr.MSG.SO_PESSOA : tipo === 'empresa' ? rr.MSG.SO_EMPRESA : !c ? rr.MSG.SEM_CONTA : rr.MSG.SEM_PERMISSAO;
      mensagemTela(op.raiz, texto, U.MSG.OUTRA_CONTA, [
        el('button', { type: 'button', class: 'botao botao--principal botao--grande', id: 'vg-trocar-conta', onclick: function () {
          A.sair().then(function () { U._api.navegar(U.linkEntrar(U.paginaAtual(), tipo === 'empresa' ? 'tipo=empresa' : '')); });
        } }, U.MSG.TROCAR_CONTA)]);
      return nunca;
    }, function (e) {
      U.tratarErro(e, { raiz: op.raiz, aoTentar: function () { root.location.reload(); } });
      return nunca;
    });
  }

  // ------------------------------------------------------------------------------------------------- menu lateral e gaveta
  function menuLateral(op) {
    op = op || {};
    var u = op.usuario || {};
    return el('aside', { class: 'menu-lateral', id: op.id || 'vg-menu', 'aria-label': 'Menu' }, [
      el('img', { class: 'logo-gsc menu-lateral__logo', src: 'comum/marca/gsc-logo.svg', alt: 'Gestão sem Caos', width: '156', height: '22' }),
      el('p', { class: 'menu-lateral__produto' }, op.produto || 'Vagas sem Caos'),
      el('nav', { class: 'menu-lateral__nav', 'aria-label': 'Seções' }, (op.grupos || []).map(function (g) {
        return el('div', { class: 'menu-grupo' }, [g.titulo ? el('p', { class: 'menu-grupo__titulo' }, g.titulo) : null].concat((g.itens || []).map(function (i) {
          return el(i.href ? 'a' : 'button', { class: 'aba', id: i.id, href: i.href, type: i.href ? null : 'button', data: { rota: i.rota }, onclick: i.aoClicar }, [
            U.icone(i.icone || 'seta'), el('span', { class: 'aba__texto' }, i.rotulo), i.etiqueta ? el('span', { class: 'aba__etiqueta' }, i.etiqueta) : null,
            el('span', { class: 'aba__n tabular' }, i.n ? String(i.n) : '')]);
        })));
      })),
      u.nome ? el('div', { class: 'menu-lateral__usuario' }, [el('span', { class: 'usuario__inicial', 'aria-hidden': 'true' }, String(u.nome).trim().charAt(0).toUpperCase()),
        el('span', {}, [el('span', { class: 'seminegrito' }, u.nome), u.papel ? el('br') : null, u.papel ? el('span', { class: 't-nota texto-suave' }, u.papel) : null])]) : null
    ]);
  }
  function marcarMenu(rota) {
    Array.prototype.forEach.call(doc.querySelectorAll('.aba[data-rota]'), function (a) {
      var r = a.getAttribute('data-rota');
      if (r && (rota === r || String(rota).indexOf(r + '/') === 0)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function ligarGaveta(op) {
    op = op || {};
    var botao = doc.getElementById(op.botao || 'vg-menu-abrir');
    var menu = doc.getElementById(op.menu || 'vg-menu');
    if (!botao || !menu) return;
    var veu = doc.getElementById('vg-menu-veu') || doc.body.appendChild(el('div', { class: 'menu-veu', id: 'vg-menu-veu', hidden: true }));
    function abrir(sim) {
      doc.body.classList.toggle('menu-aberto', sim);
      veu.hidden = !sim;
      botao.setAttribute('aria-expanded', sim ? 'true' : 'false');
      if (sim) { var a = menu.querySelector('.aba'); if (a) a.focus(); } else botao.focus();
    }
    botao.setAttribute('aria-controls', menu.id);
    botao.setAttribute('aria-expanded', 'false');
    botao.addEventListener('click', function () { abrir(!doc.body.classList.contains('menu-aberto')); });
    veu.addEventListener('click', function () { abrir(false); });
    menu.addEventListener('click', function (ev) { if (ev.target.closest && ev.target.closest('.aba') && doc.body.classList.contains('menu-aberto')) abrir(false); });
    doc.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && doc.body.classList.contains('menu-aberto')) abrir(false); });
  }

  // ------------------------------------------------------------------------------------------------- rascunho no aparelho
  function rascunho(tela, op) {
    op = op || {};
    var arm = op.armazenamento || U.armazenamento;
    var chave = 'vg.rascunho.' + String(tela);
    var agora = op.agora || function () { return Date.now(); };
    return {
      chave: chave,
      ler: function () { var r = arm.ler(chave); return r && typeof r === 'object' && 'dados' in r ? r : null; },
      gravar: function (dados) { var em = agora(); arm.gravar(chave, { dados: dados, em: em }); return { em: em, hora: U.hora(new Date(em).toISOString()) }; },
      apagar: function () { arm.apagar(chave); }
    };
  }
  function textoRascunho(hora) { return U.MSG.RASCUNHO + hora; }
  function mostrarRascunho(alvo, hora) {
    if (!alvo) return;
    if (!alvo.hasAttribute('aria-live')) { alvo.setAttribute('aria-live', 'polite'); alvo.classList.add('vg-rascunho'); }
    U.trocar(alvo, hora ? [U.icone('salvo'), textoRascunho(hora)] : null);
  }

  // ------------------------------------------------------------------------------------------------- copiar e contador
  function copiar(texto) {
    var n = root.navigator;
    if (n && n.clipboard && n.clipboard.writeText) return n.clipboard.writeText(String(texto)).catch(function () { return copiarVelho(texto); });
    return copiarVelho(texto);
  }
  function copiarVelho(texto) {
    return new Promise(function (ok, falhou) {
      var c = el('textarea', { class: 'visualmente-oculto', readOnly: true, 'aria-hidden': 'true' });
      c.value = String(texto);
      doc.body.appendChild(c); c.select();
      var deu = false;
      try { deu = doc.execCommand('copy'); } catch (e) { deu = false; }
      doc.body.removeChild(c);
      if (deu) ok(); else falhou(new Error('Não deu para copiar. Toque e segure no texto para copiar.'));
    });
  }
  function contador(campo, alvo, max) {
    function atualizar() { alvo.textContent = String(campo.value.length) + ' de ' + max; }
    campo.addEventListener('input', atualizar);
    atualizar();
    return atualizar;
  }

  [['rotaPara', rotaPara], ['roteador', roteador], ['exigirConta', exigirConta], ['menuLateral', menuLateral], ['marcarMenu', marcarMenu],
    ['ligarGaveta', ligarGaveta], ['rascunho', rascunho], ['textoRascunho', textoRascunho], ['mostrarRascunho', mostrarRascunho],
    ['copiar', copiar], ['contador', contador]].forEach(function (p) { U[p[0]] = p[1]; });
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
})(typeof self !== 'undefined' ? self : this);
