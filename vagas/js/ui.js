/*
 * Vagas sem Caos — base comum das telas (VAGAS_UI). UMD como os outros arquivos de vagas/js: window.VAGAS_UI / module.exports.
 * Carregue depois de endereco.js, config.js, regras.js, textos.js e api.js. Nada aqui usa innerHTML: todo texto que vem do banco,
 * da prévia, da URL ou da pessoa entra como textNode (VAGAS_UI.el). Contrato e exemplos: mesa de equipe, bloco "casca — marco 1".
 * As telas com conta carregam também ui-area.js (roteador, exigirConta, menu lateral, rascunho, copiar): fica separado para a
 * lista pública caber nos 100 KB da primeira visita.
 *
 * API (este arquivo):
 *   el(tag, atributos, filhos) -> Element      icone(nome, classe?) -> <svg>      limpar(no)      trocar(no, filhos)
 *   avisar(texto, {tipo:'ok'|'erro', acao:{rotulo, aoClicar}, ms:4000})  -> #vg-aviso-geral        anunciar(texto) -> #aviso
 *   carregando(raiz, texto?) · esqueletos(raiz, n) · vazio(raiz, {titulo?, texto, botao?:{rotulo, href|aoClicar, id}, botao2?})
 *   erroCarregar(raiz, {texto?, aoTentar}) · faixa({id, texto, forte?, tipo?:'offline', acao?}) · tirarFaixa(id)
 *   faixaOffline(ligar, {texto?, aoTentar?}) · aoVoltarInternet(fn) · somenteLeitura(mensagem)
 *   tratarErro(e, {raiz?, aoTentar?}) -> 'sessao'|'confirmar'|'suspensa'|'banco'|'conexao'|'erro' (o padrão do contrato)
 *   irParaEntrar({motivo?, voltar?}) · linkEntrar(voltar, extra?) · paginaAtual() · voltarValido(v, padrao) · parametro(nome)
 *   focarTitulo(raiz) · folha({id, titulo, corpo, barra?, acaoCabecalho?, aoFechar}) · janela({id, titulo, corpo, acoes, aoFechar})
 *   confirmar({id?, titulo, texto, sim, nao?, perigo?}) -> Promise<boolean>
 *   barra({id?, dica?, botoes}) · navPessoa(atual, {badges?}) · fixar(elemento|null) · topo({cidade?, aoCidade?})
 *   armazenamento {tipo, ler, gravar, apagar} · criarArmazenamento(janela) · novoId() · cidadeLembrada() · lembrarCidade(slug)
 *   definirFuso(fuso) · fuso() · reais(c) · valor({minCentavos, maxCentavos, unidade}) · data(isoOuDia) · dataCurta · hora ·
 *   dataHora · relativa(iso, agoraMs?) · mesAno('AAAA-MM')
 *   whatsapp(numero, texto?) · compartilharWhatsapp(texto) · t(caminho, vars) (VAGAS_TEXTOS)
 *   erroCampo(campo, msg) · limparErroCampo(campo) · ocupado(botao, sim, texto?) · aoParar(fn, ms)
 */
(function (root) {
  'use strict';

  var doc = root.document || null;
  var FUSO_RESERVA = 'America/Sao_Paulo';   // só quando a cidade não informa o fuso (nunca um fuso fixo de cidade)
  var fusoAtual = FUSO_RESERVA;
  var R = function () { return root.VAGAS_REGRAS || (typeof require === 'function' ? require('./regras.js') : null); };
  var MSG = {
    SESSAO: 'Sua sessão venceu. Entre de novo para continuar.',
    ERRO_CARREGAR: 'Não deu para carregar.',
    TENTAR: 'Tentar de novo',
    CARREGANDO: 'Carregando…',
    OFFLINE: 'Sem internet.',
    OFFLINE_TEXTO: 'Mostrando o que você viu por último. Suas respostas e rascunhos ficam guardados no celular.',
    RASCUNHO: 'Rascunho salvo neste aparelho às ',
    OUTRA_CONTA: 'Você entrou com outra conta. Saia e entre com a conta certa para continuar.',
    TROCAR_CONTA: 'Sair e entrar com outra conta'
  };

  // ------------------------------------------------------------------------------------------------- textos
  function t(caminho, vars) {
    var T = root.VAGAS_TEXTOS || (typeof module !== 'undefined' && module.exports ? require('./textos.js') : null);
    return T && typeof T.t === 'function' ? T.t(caminho, vars) : '';
  }

  // ------------------------------------------------------------------------------------------------- DOM seguro
  var PROPRIEDADES = { checked: 1, disabled: 1, hidden: 1, selected: 1, readOnly: 1, value: 1, multiple: 1, indeterminate: 1 };
  function el(tag, atributos, filhos) {
    var no = doc.createElement(tag);
    var a = atributos || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === undefined || v === null || v === false) return;
      if (k === 'innerHTML' || k === 'outerHTML' || k === 'insertAdjacentHTML') throw new Error('VAGAS_UI.el: ' + k + ' não é permitido (use filhos).');
      if (k === 'class' || k === 'className') { no.className = String(v); return; }
      if (k === 'texto') { no.textContent = String(v); return; }
      if (k === 'data' && typeof v === 'object') { Object.keys(v).forEach(function (d) { if (v[d] != null) no.setAttribute('data-' + d, String(v[d])); }); return; }
      if (k === 'style' && typeof v === 'object') { Object.keys(v).forEach(function (s) { no.style[s] = v[s]; }); return; }
      if (/^on[a-z]+$/.test(k) && typeof v === 'function') { no.addEventListener(k.slice(2), v); return; }
      if ((k === 'href' || k === 'src' || k === 'action' || k === 'formaction') && /^\s*(javascript|vbscript|data:text):?/i.test(String(v))) return;
      if (PROPRIEDADES[k]) { no[k] = v === true ? true : v; return; }
      no.setAttribute(k, v === true ? '' : String(v));
    });
    acrescentar(no, filhos);
    return no;
  }
  function acrescentar(no, filhos) {
    if (filhos === undefined || filhos === null || filhos === false) return no;
    if (Array.isArray(filhos)) { filhos.forEach(function (f) { acrescentar(no, f); }); return no; }
    if (typeof filhos === 'string' || typeof filhos === 'number') { no.appendChild(doc.createTextNode(String(filhos))); return no; }
    if (filhos && filhos.nodeType) no.appendChild(filhos);
    return no;
  }
  function limpar(no) { if (no) while (no.firstChild) no.removeChild(no.firstChild); return no; }
  function trocar(no, filhos) { limpar(no); return acrescentar(no, filhos); }
  function porId(id) { return doc ? doc.getElementById(id) : null; }

  // Ícones (traço 2, como nos mockups). Desenho fixo daqui: nada vindo de fora entra no SVG.
  var ICONES = {
    pin: [['path', 'M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z'], ['circle', 12, 10, 2.5]],
    check: [['path', 'm5 12 5 5L20 7']],
    escudo: [['path', 'M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z'], ['path', 'M8.5 12l2.5 2.5 4.5-5']],
    lupa: [['circle', 11, 11, 7], ['path', 'm20 20-3.5-3.5']],
    relogio: [['circle', 12, 12, 9], ['path', 'M12 7v5l3 2']],
    seta: [['path', 'm9 6 6 6-6 6']],
    voltar: [['path', 'm15 6-6 6 6 6']],
    vagas: [['rect', 3, 7, 18, 13, 2], ['path', 'M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18']],
    selo: [['circle', 12, 9, 5], ['path', 'm8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7']],
    conversa: [['path', 'M4 5h16v11H8l-4 4z']],
    pessoa: [['circle', 12, 8, 4], ['path', 'M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8']],
    salvo: [['path', 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z'], ['path', 'M17 21v-8H7v8M7 3v5h8']],
    nuvem: [['path', 'M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9z']],
    whatsapp: [['path', 'M3 21l1.6-4.6A8.5 8.5 0 1 1 8 19.3z'], ['path', 'M9 9.5c.3 2 2.5 4.2 4.5 4.5l1.5-1.5 2 1-1 2c-4 0-8-4-8-8l2-1 1 2z']],
    copiar: [['rect', 9, 9, 11, 11, 2], ['path', 'M5 15V5a2 2 0 0 1 2-2h10']],
    alerta: [['path', 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z']],
    predio: [['rect', 4, 3, 16, 18, 2], ['path', 'M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3']],
    lista: [['path', 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01']],
    mais: [['path', 'M12 5v14M5 12h14']],
    casa: [['path', 'M3 11 12 3l9 8v10h-6v-6H9v6H3z']],
    sair: [['path', 'M10 17l5-5-5-5M15 12H3M21 3v18']],
    cidade: [['path', 'M3 21h18M5 21V8l5-3v16M14 21V11l5-2v12M8 9h.01M8 13h.01M8 17h.01M17 13h.01M17 17h.01']],
    grafico: [['path', 'M4 20V10M10 20V4M16 20v-7M22 20H2']],
    moeda: [['circle', 12, 12, 9], ['path', 'M12 7v10M9.5 9.5h3.5a1.5 1.5 0 0 1 0 3H11a1.5 1.5 0 0 0 0 3h3.5']],
    baixar: [['path', 'M12 3v12M7 10l5 5 5-5M4 20h16']],
    lixo: [['path', 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3']],
    denuncia: [['path', 'M4 21V4h12l-1 4 1 4H4']],
    compartilhar: [['circle', 18, 5, 2.5], ['circle', 6, 12, 2.5], ['circle', 18, 19, 2.5], ['path', 'm8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6']],
    bloqueio: [['rect', 4, 11, 16, 10, 2], ['path', 'M8 11V7a4 4 0 0 1 8 0v4']],
    fechar: [['path', 'M6 6l12 12M18 6 6 18']],
    menu: [['path', 'M4 6h16M4 12h16M4 18h16']],
    olho: [['path', 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z'], ['circle', 12, 12, 3]]
  };
  var SVG = 'http://www.w3.org/2000/svg';
  function icone(nome, classe) {
    var s = doc.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'icone' + (classe ? ' ' + classe : ''));
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    (ICONES[nome] || []).forEach(function (p) {
      var f = doc.createElementNS(SVG, p[0]);
      if (p[0] === 'path') f.setAttribute('d', p[1]);
      else if (p[0] === 'circle') { f.setAttribute('cx', p[1]); f.setAttribute('cy', p[2]); f.setAttribute('r', p[3]); }
      else { f.setAttribute('x', p[1]); f.setAttribute('y', p[2]); f.setAttribute('width', p[3]); f.setAttribute('height', p[4]); f.setAttribute('rx', p[5]); }
      s.appendChild(f);
    });
    return s;
  }

  // ------------------------------------------------------------------------------------------------- avisos
  var temporizadorAviso = null;
  function anunciar(texto) {
    var a = porId('aviso');
    if (!a) { a = el('p', { id: 'aviso', class: 'visualmente-oculto', role: 'status', 'aria-live': 'polite' }); doc.body.appendChild(a); }
    a.textContent = '';
    // Troca em dois tempos: o leitor de tela anuncia mesmo quando o texto se repete.
    setTimeout(function () { a.textContent = String(texto || ''); }, 30);
  }
  function avisar(texto, op) {
    op = op || {};
    var a = porId('vg-aviso-geral');
    if (!a) { a = el('div', { id: 'vg-aviso-geral', class: 'aviso aviso-geral', role: 'status', 'aria-live': 'polite', hidden: true }); doc.body.appendChild(a); }
    a.className = 'aviso aviso-geral' + (op.tipo === 'erro' ? ' aviso--erro' : op.tipo === 'ok' ? ' aviso--ok' : '');
    a.setAttribute('role', op.tipo === 'erro' ? 'alert' : 'status');
    trocar(a, [el('span', { class: 'aviso-geral__texto' }, String(texto || '')),
      op.acao ? el('button', { type: 'button', class: 'botao botao--link aviso-geral__acao', onclick: function () { esconder(); op.acao.aoClicar(); } }, op.acao.rotulo) : null]);
    a.hidden = false;
    function esconder() { a.hidden = true; }
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(esconder, op.ms || (op.acao ? 6000 : 4000));
    return a;
  }

  // ------------------------------------------------------------------------------------------------- estados padrão
  function carregando(raiz, texto) {
    return trocar(raiz, el('div', { class: 'vg-estado', role: 'status', 'aria-live': 'polite' }, [el('span', { class: 'giro giro--grande', 'aria-hidden': 'true' }), el('p', {}, texto || MSG.CARREGANDO)]));
  }
  function esqueletos(raiz, n) {
    var itens = [];
    for (var i = 0; i < (n || 3); i++) itens.push(el('li', { class: 'vg-esqueleto', 'aria-hidden': 'true' }));
    return trocar(raiz, [el('p', { class: 'visualmente-oculto', role: 'status' }, MSG.CARREGANDO), el('ul', { class: 'vg-esqueletos' }, itens)]);
  }
  function botaoDe(b, classe) {
    if (!b) return null;
    if (b.href) return el('a', { class: classe, href: b.href, id: b.id }, b.rotulo);
    return el('button', { type: 'button', class: classe, id: b.id, onclick: b.aoClicar }, b.rotulo);
  }
  function vazio(raiz, op) {
    op = op || {};
    return trocar(raiz, el('section', { class: 'caixa vazio', id: op.id }, [
      op.titulo ? el(op.h1 ? 'h1' : 'h2', { class: 'vazio__titulo', tabindex: op.h1 ? '-1' : null }, op.titulo) : null,
      el('p', { class: 'vazio__texto' }, op.texto || ''),
      op.botao || op.botao2 ? el('div', { class: 'acoes acoes-coluna' }, [botaoDe(op.botao, 'botao botao--principal botao--grande'), botaoDe(op.botao2, 'botao botao--claro botao--grande')]) : null
    ]));
  }
  function erroCarregar(raiz, op) {
    op = op || {};
    var texto = op.texto || MSG.ERRO_CARREGAR;
    return trocar(raiz, el('div', { class: 'vg-estado vg-estado--erro' }, [
      el('div', { class: 'aviso aviso--erro', role: 'alert' }, [el('p', {}, texto),
        op.aoTentar ? el('div', { class: 'acoes' }, el('button', { type: 'button', class: 'botao botao--claro', id: op.idTentar || 'vg-tentar-de-novo', onclick: op.aoTentar }, MSG.TENTAR)) : null])
    ]));
  }

  // Faixas (moldura azul-escura logo abaixo do topo): cidade pausada, sem internet, conta suspensa, empresa em análise.
  function faixa(op) {
    var antiga = porId(op.id);
    var f = el('div', { id: op.id, class: 'vg-faixa' + (op.tipo === 'offline' ? ' vg-faixa--offline' : ''), role: 'status' }, [
      icone(op.icone || (op.tipo === 'offline' ? 'nuvem' : 'alerta')),
      el('p', {}, [op.forte ? el('strong', {}, op.forte + ' ') : null, op.texto || '', op.acao ? botaoDe(op.acao, 'botao botao--link') : null])
    ]);
    if (antiga) { antiga.parentNode.replaceChild(f, antiga); return f; }
    var topo = doc.querySelector('.vg-pc__topo') || doc.querySelector('header.topo') || null;
    var principal = doc.querySelector('main');
    if (topo && topo.parentNode) topo.parentNode.insertBefore(f, topo.nextSibling);
    else if (principal && principal.parentNode) principal.parentNode.insertBefore(f, principal);
    else doc.body.insertBefore(f, doc.body.firstChild);
    return f;
  }
  function tirarFaixa(id) { var f = porId(id); if (f && f.parentNode) f.parentNode.removeChild(f); }
  function faixaOffline(ligar, op) {
    op = op || {};
    if (!ligar) { tirarFaixa('vg-faixa-offline'); return null; }
    return faixa({ id: 'vg-faixa-offline', tipo: 'offline', forte: MSG.OFFLINE, texto: op.texto || MSG.OFFLINE_TEXTO, acao: op.aoTentar ? { rotulo: MSG.TENTAR, aoClicar: op.aoTentar, id: 'vg-offline-tentar' } : null });
  }
  function aoVoltarInternet(fn) { if (root.addEventListener) root.addEventListener('online', fn); }

  // ------------------------------------------------------------------------------------------------- navegação e ?voltar=
  var RE_VOLTAR = /^[a-z0-9-]+\.html([?#][^\s]*)?$/;
  function voltarValido(v, padrao) {
    var s = String(v == null ? '' : v).trim();
    return RE_VOLTAR.test(s) && s.indexOf('//') < 0 && s.indexOf('\\') < 0 ? s : (padrao === undefined ? '' : padrao);
  }
  function parametro(nome, busca) {
    var s = String(busca != null ? busca : (root.location && root.location.search) || '').replace(/^\?/, '');
    var achado = null;
    s.split('&').some(function (par) {
      var i = par.indexOf('=');
      var k = i < 0 ? par : par.slice(0, i);
      try { k = decodeURIComponent(k); } catch (e) { return false; }
      if (k !== nome) return false;
      try { achado = i < 0 ? '' : decodeURIComponent(par.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { achado = ''; }
      return true;
    });
    return achado;
  }
  // Página atual como valor de ?voltar= (só o arquivo + busca + âncora; sem token de link de e-mail).
  function paginaAtual(loc) {
    loc = loc || root.location || {};
    var arquivo = String(loc.pathname || '').split('/').pop() || 'index.html';
    var pares = String(loc.search || '').replace(/^\?/, '').split('&').filter(function (par) {
      return par && !/^(token_hash|type|voltar|motivo)(=|$)/.test(par);
    });
    return voltarValido(arquivo + (pares.length ? '?' + pares.join('&') : '') + String(loc.hash || ''), 'index.html');
  }
  function linkEntrar(voltar, extra) {
    var v = voltarValido(voltar, '');
    return 'entrar.html' + (extra || v ? '?' : '') + (extra ? extra + (v ? '&' : '') : '') + (v ? 'voltar=' + encodeURIComponent(v) : '');
  }
  var api = {
    navegar: function (url) { root.location.assign(url); }
  };
  function irParaEntrar(op) {
    op = op || {};
    api.navegar(linkEntrar(op.voltar || paginaAtual(), op.motivo ? 'motivo=' + encodeURIComponent(op.motivo) : ''));
  }

  // Tratamento padrão dos erros do contrato (docs/VAGAS-SPEC.md §2): a mensagem já vem em português.
  function tratarErro(e, op) {
    op = op || {};
    e = e || {};
    if (e.sessaoExpirada) { irParaEntrar({ motivo: 'sessao' }); return 'sessao'; }
    if (e.confirmar) { irParaEntrar({ motivo: 'confirmar' }); return 'confirmar'; }
    if (e.suspensa) { somenteLeitura(e.message); return 'suspensa'; }
    if (e.conexao) {
      faixaOffline(true, { aoTentar: op.aoTentar });
      if (op.raiz) erroCarregar(op.raiz, { texto: e.message, aoTentar: op.aoTentar });
      return 'conexao';
    }
    var tipo = e.bancoDesatualizado ? 'banco' : 'erro';
    if (op.raiz) erroCarregar(op.raiz, { texto: e.message || t('avisos.erro_generico'), aoTentar: op.aoTentar });
    else avisar(e.message || t('avisos.erro_generico'), { tipo: 'erro' });
    return tipo;
  }
  // Conta ou empresa suspensa: faixa fixa e a tela fica só leitura (as frentes escondem as ações com body.vg-so-leitura).
  function somenteLeitura(mensagem) {
    if (doc && doc.body) doc.body.classList.add('vg-so-leitura');
    return faixa({ id: 'vg-faixa-suspensa', forte: '', texto: mensagem || t('avisos.conta_suspensa') });
  }

  function focarTitulo(raiz) {
    var alvo = (raiz && raiz.querySelector ? raiz : doc).querySelector('h1');
    if (!alvo) return;
    if (!alvo.hasAttribute('tabindex')) alvo.setAttribute('tabindex', '-1');
    try { alvo.focus({ preventScroll: true }); } catch (e) { alvo.focus(); }
  }
  // ------------------------------------------------------------------------------------------------- folha e janela (foco preso)
  var FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function abrirCamada(caixa, op, janela) {
    var anterior = doc.activeElement;
    var veu = el('div', { class: 'vg-folha-veu', 'aria-hidden': 'true' });
    var camada = el('div', { class: 'vg-camada' + (janela ? ' vg-camada--janela' : '') }, [veu, caixa]);
    var irmaos = Array.prototype.filter.call(doc.body.children, function (c) { return c.id !== 'aviso' && c.id !== 'vg-aviso-geral' && !c.inert; });
    doc.body.appendChild(camada);
    irmaos.forEach(function (c) { c.inert = true; c.setAttribute('data-vg-inerte', '1'); });
    doc.body.classList.add('vg-camada-aberta');
    var fechada = false;
    function fechar(motivo) {
      if (fechada) return;
      fechada = true;
      doc.removeEventListener('keydown', teclas, true);
      irmaos.forEach(function (c) { c.inert = false; c.removeAttribute('data-vg-inerte'); });
      if (camada.parentNode) camada.parentNode.removeChild(camada);
      if (!doc.querySelector('.vg-camada')) doc.body.classList.remove('vg-camada-aberta');
      if (anterior && anterior.focus && doc.body.contains(anterior)) { try { anterior.focus({ preventScroll: true }); } catch (e) { anterior.focus(); } }
      if (op.aoFechar) op.aoFechar(motivo || 'fechar');
    }
    function teclas(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); fechar('esc'); return; }
      if (ev.key !== 'Tab') return;
      var f = Array.prototype.filter.call(caixa.querySelectorAll(FOCAVEIS), function (x) { return x.offsetParent !== null || x === doc.activeElement; });
      if (!f.length) { ev.preventDefault(); return; }
      var primeiro = f[0], ultimo = f[f.length - 1];
      if (ev.shiftKey && (doc.activeElement === primeiro || !caixa.contains(doc.activeElement))) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && (doc.activeElement === ultimo || !caixa.contains(doc.activeElement))) { ev.preventDefault(); primeiro.focus(); }
    }
    doc.addEventListener('keydown', teclas, true);
    veu.addEventListener('click', function () { fechar('veu'); });
    var alvo = op.foco ? caixa.querySelector(op.foco) : caixa.querySelector('h1, h2');
    if (alvo) { if (!alvo.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|TEXTAREA)$/.test(alvo.tagName)) alvo.setAttribute('tabindex', '-1'); try { alvo.focus({ preventScroll: true }); } catch (e) { alvo.focus(); } }
    return { elemento: caixa, camada: camada, fechar: fechar };
  }
  function folha(op) {
    op = op || {};
    var idTitulo = (op.id || 'vg-folha') + '-titulo';
    var corpo = el('div', { class: 'vg-folha__corpo' }, op.corpo);
    var caixa = el('section', { class: 'vg-folha', id: op.id, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': idTitulo }, [
      el('div', { class: 'vg-folha__cab' }, [el('span', { class: 'vg-folha__alca', 'aria-hidden': 'true' }), el('h2', { id: idTitulo, class: 't-titulo' }, op.titulo || ''), op.acaoCabecalho || null]),
      corpo, op.barra || null
    ]);
    var c = abrirCamada(caixa, op, false);
    c.corpo = corpo;
    return c;
  }
  function janela(op) {
    op = op || {};
    var idTitulo = (op.id || 'vg-janela') + '-titulo';
    var caixa = el('section', { class: 'caixa vidro-janela vg-janela', id: op.id, role: op.alerta ? 'alertdialog' : 'dialog', 'aria-modal': 'true', 'aria-labelledby': idTitulo }, [
      el('h2', { id: idTitulo, class: 'vg-janela__titulo' }, op.titulo || ''),
      el('div', { class: 'vg-janela__corpo' }, op.corpo),
      op.acoes ? el('div', { class: 'vg-janela__acoes' }, op.acoes) : null
    ]);
    return abrirCamada(caixa, op, true);
  }
  function confirmar(op) {
    op = op || {};
    var id = op.id || 'vg-confirmar';
    return new Promise(function (resolver) {
      var resposta = false;
      var j = null;
      var nao = el('button', { type: 'button', class: 'botao botao--claro', id: id + '-nao', onclick: function () { j.fechar('nao'); } }, op.nao || t('botoes.cancelar') || 'Cancelar');
      var sim = el('button', { type: 'button', class: 'botao ' + (op.perigo ? 'botao--perigo' : 'botao--principal'), id: id + '-sim', onclick: function () { resposta = true; j.fechar('sim'); } }, op.sim || 'Confirmar');
      j = janela({ id: id, titulo: op.titulo, alerta: true, corpo: op.texto ? el('p', { class: 't-corpo texto-medio' }, op.texto) : null, acoes: [nao, sim], foco: '#' + id + '-nao',
        aoFechar: function () { resolver(resposta); } });
    });
  }

  // ------------------------------------------------------------------------------------------------- barra fixa e navegação
  function barra(op) {
    op = op || {};
    var botoes = (op.botoes || []).filter(Boolean);
    return el('div', { class: 'barra-nav', id: op.id }, [
      op.dica ? el('p', { class: 'barra-dica', id: op.id ? op.id + '-dica' : null }, op.dica) : null,
      el('div', { class: 'barra-botoes' + (botoes.length === 1 ? ' barra-botoes--um' : '') }, botoes)
    ]);
  }
  // Um lugar só para o que fica fixo embaixo: a barra de ação OU a navegação (nunca as duas).
  function fixar(elemento) {
    var vaga = porId('vg-fixo');
    if (!vaga) { vaga = el('div', { id: 'vg-fixo' }); doc.body.appendChild(vaga); }
    trocar(vaga, elemento || null);
    doc.body.classList.toggle('vg-com-barra', !!(elemento && elemento.classList.contains('barra-nav')));
    doc.body.classList.toggle('vg-com-nav', !!(elemento && elemento.classList.contains('vg-nav')));
    return elemento;
  }
  var DESTINOS = [['vagas', 'Vagas', 'vagas'], ['testes', 'Testes', 'selo'], ['candidaturas', 'Candidaturas', 'conversa'], ['eu', 'Eu', 'pessoa']];
  function hrefNav(k) {
    if (k === 'vagas') { var c = cidadeLembrada(); return c ? 'cidade.html?cidade=' + encodeURIComponent(c) : 'index.html'; }
    if (k === 'testes') return 'testes.html';
    if (k === 'candidaturas') return 'eu.html#candidaturas';
    return 'eu.html#dados';
  }
  function navPessoa(atual, op) {
    op = op || {};
    var badges = op.badges || {};
    return el('nav', { class: 'vg-nav', id: 'vg-nav', 'aria-label': 'Minha área' }, DESTINOS.map(function (d) {
      var n = Number(badges[d[0]]) || 0;
      return el('a', { class: 'vg-nav__item', id: 'vg-nav-' + d[0], href: (op.hrefs && op.hrefs[d[0]]) || hrefNav(d[0]), 'aria-current': atual === d[0] ? 'page' : null }, [
        icone(d[2]), d[1], n > 0 ? el('span', { class: 'vg-nav__n', 'aria-label': n + (n === 1 ? ' novidade' : ' novidades') }, String(n > 9 ? '9+' : n)) : null]);
    }));
  }
  // Topo da pessoa: logo do Vagas sem Caos (o nome já está no logo) | pílula da cidade (nome sempre vindo do dado, nunca fixo).
  function topo(op) {
    op = op || {};
    var alvo = porId('vg-topo');
    var interno = el('div', { class: 'topo-interno' }, [
      el('a', { href: 'index.html', class: 'vg-topo__marca', 'aria-label': 'Vagas sem Caos, início' }, el('img', { class: 'logo-gsc topo-logo', src: 'comum/marca/vsc-logo.svg', alt: 'Vagas sem Caos', width: '160', height: '24' })),
      op.cidade ? el('button', { type: 'button', class: 'vg-cidade', id: 'vg-cidade', 'aria-haspopup': 'dialog', 'aria-label': 'Cidade: ' + op.cidade.nome + '. Trocar a cidade', onclick: op.aoCidade },
        [icone('pin'), el('span', { class: 'vg-cidade__nome' }, op.cidade.nome)]) : null
    ]);
    if (alvo) { trocar(alvo, interno); return alvo; }
    return el('header', { class: 'topo vidro-cabecalho', id: 'vg-topo' }, interno);
  }

  // ------------------------------------------------------------------------------------------------- armazenamento e rascunho
  // localStorage -> sessionStorage -> memória: a prévia e os rascunhos abrem até em navegador que bloqueia o armazenamento.
  function criarArmazenamento(janelaAlvo) {
    var base = null;
    var tipo = 'memoria';
    [['local', 'localStorage'], ['sessao', 'sessionStorage']].some(function (p) {
      try {
        var s = janelaAlvo && janelaAlvo[p[1]];
        if (!s) return false;
        s.setItem('vg.__teste', '1');
        s.removeItem('vg.__teste');
        base = s; tipo = p[0];
        return true;
      } catch (e) { return false; }
    });
    var memoria = {};
    function lerTexto(k) {
      if (Object.prototype.hasOwnProperty.call(memoria, k)) return memoria[k];
      if (base) { try { return base.getItem(k); } catch (e) { /* cai na memória */ } }
      return null;
    }
    function gravarTexto(k, v) {
      if (base) { try { base.setItem(k, v); delete memoria[k]; return true; } catch (e) { /* cheio ou bloqueado: memória */ } }
      memoria[k] = v;
      return false;
    }
    function apagar(k) { delete memoria[k]; if (base) { try { base.removeItem(k); } catch (e) { /* ignora */ } } }
    return {
      tipo: tipo,
      lerTexto: lerTexto, gravarTexto: gravarTexto, apagar: apagar,
      ler: function (k, padrao) { var s = lerTexto(k); if (s == null) return padrao === undefined ? null : padrao; try { return JSON.parse(s); } catch (e) { return padrao === undefined ? null : padrao; } },
      gravar: function (k, v) { return gravarTexto(k, JSON.stringify(v)); }
    };
  }
  var armazenamento = criarArmazenamento(root);
  function cidadeLembrada() { var c = armazenamento.ler('vg.cidade'); return typeof c === 'string' && /^[a-z0-9-]{2,60}$/.test(c) ? c : ''; }
  function lembrarCidade(slug) { if (/^[a-z0-9-]{2,60}$/.test(String(slug || ''))) armazenamento.gravar('vg.cidade', slug); }

  // Id gerado no aparelho (envios repetidos não duplicam).
  function novoId() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Array(16);
    if (c && typeof c.getRandomValues === 'function') { var u = new Uint8Array(16); c.getRandomValues(u); for (var i = 0; i < 16; i++) b[i] = u[i]; }
    else for (var j = 0; j < 16; j++) b[j] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ------------------------------------------------------------------------------------------------- formatação
  function definirFuso(f) { fusoAtual = typeof f === 'string' && /^[A-Za-z_]+\/[A-Za-z_/+-]+$/.test(f) ? f : FUSO_RESERVA; return fusoAtual; }
  function fuso() { return fusoAtual; }
  function reais(c) {
    var rr = R();
    var s = rr ? rr.reais(c) : 'R$ ' + ((Number(c) || 0) / 100).toFixed(2).replace('.', ',');
    return s.replace(/,00$/, '');
  }
  var UNIDADE_CURTA = { hora: ' por hora', dia: ' por dia', servico: ' por serviço' };
  function valor(v) {
    if (!v || v.minCentavos == null) return '';
    var base = reais(v.minCentavos) + (v.maxCentavos != null && v.maxCentavos !== v.minCentavos ? ' a ' + reais(v.maxCentavos) : '');
    return base + (UNIDADE_CURTA[v.unidade] || '');
  }
  function partes(iso, f) {
    var ms = typeof iso === 'number' ? iso : Date.parse(String(iso || ''));
    if (!isFinite(ms)) return null;
    try {
      var p = {};
      new Intl.DateTimeFormat('en-GB', { timeZone: f || fusoAtual, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
      return { a: p.year, m: p.month, d: p.day, h: p.hour === '24' ? '00' : p.hour, mi: p.minute };
    } catch (e) {
      var d = new Date(ms - 3 * 3600000).toISOString();
      return { a: d.slice(0, 4), m: d.slice(5, 7), d: d.slice(8, 10), h: d.slice(11, 13), mi: d.slice(14, 16) };
    }
  }
  function soDia(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function data(iso) {
    if (soDia(iso)) return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
    var p = partes(iso); return p ? p.d + '/' + p.m + '/' + p.a : '';
  }
  function dataCurta(iso) { var d = data(iso); return d ? d.slice(0, 5) : ''; }
  function hora(iso) { var p = partes(iso); return p ? p.h + ':' + p.mi : ''; }
  function dataHora(iso) { var p = partes(iso); return p ? p.d + '/' + p.m + ', ' + p.h + ':' + p.mi : ''; }
  function diaDe(iso) { var p = soDia(iso) ? { a: iso.slice(0, 4), m: iso.slice(5, 7), d: iso.slice(8, 10) } : partes(iso); return p ? Date.UTC(+p.a, +p.m - 1, +p.d) : NaN; }
  // "agora", "há 5 min", "há 2 h", "hoje", "ontem", "há 3 dias" (até 30 dias), depois a data.
  function relativa(iso, agoraMs) {
    var ms = Date.parse(String(iso || ''));
    if (!isFinite(ms)) return '';
    var agora = agoraMs == null ? Date.now() : agoraMs;
    var dif = Math.max(0, agora - ms);
    var dias = Math.round((diaDe(new Date(agora).toISOString()) - diaDe(new Date(ms).toISOString())) / 86400000);
    if (dias <= 0) {
      if (dif < 60000) return 'agora';
      if (dif < 3600000) return 'há ' + Math.floor(dif / 60000) + ' min';
      if (dif < 12 * 3600000) return 'há ' + Math.floor(dif / 3600000) + ' h';
      return 'hoje';
    }
    if (dias === 1) return 'ontem';
    if (dias <= 30) return 'há ' + dias + ' dias';
    return data(iso);
  }
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function mesAno(s) { var m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(s || '')); return m ? MESES[+m[2] - 1] + '/' + m[1] : ''; }

  // ------------------------------------------------------------------------------------------------- utilidades de tela
  function whatsapp(numero, texto) {
    var d = String(numero == null ? '' : numero).replace(/\D/g, '');
    if (!d) return '';
    return 'https://wa.me/' + d + (texto ? '?text=' + encodeURIComponent(texto) : '');
  }
  function compartilharWhatsapp(texto) { return 'https://wa.me/?text=' + encodeURIComponent(String(texto || '')); }
  function erroCampo(campo, msg) {
    if (!campo) return null;
    var id = (campo.id || novoId()) + '-erro';
    var span = porId(id);
    if (!span) {
      span = el('span', { class: 'campo__erro', id: id, role: 'alert' });
      var depois = campo.closest && (campo.closest('.vg-opcoes, .marcar') || campo);
      depois.parentNode.insertBefore(span, depois.nextSibling);
    }
    span.textContent = msg;
    campo.setAttribute('aria-invalid', 'true');
    var desc = (campo.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x && x !== id; });
    campo.setAttribute('aria-describedby', [id].concat(desc).join(' '));
    return span;
  }
  function limparErroCampo(campo) {
    if (!campo) return;
    var id = campo.id + '-erro';
    var span = porId(id);
    if (span && span.parentNode) span.parentNode.removeChild(span);
    campo.removeAttribute('aria-invalid');
    var desc = (campo.getAttribute('aria-describedby') || '').split(' ').filter(function (x) { return x && x !== id; });
    if (desc.length) campo.setAttribute('aria-describedby', desc.join(' ')); else campo.removeAttribute('aria-describedby');
  }
  function ocupado(botao, sim, texto) {
    if (!botao) return;
    if (sim) {
      if (!botao.hasAttribute('data-rotulo')) botao.setAttribute('data-rotulo', botao.textContent);
      botao.disabled = true;
      botao.setAttribute('aria-busy', 'true');
      if (texto) botao.textContent = texto;
    } else {
      botao.disabled = false;
      botao.removeAttribute('aria-busy');
      if (botao.hasAttribute('data-rotulo')) { botao.textContent = botao.getAttribute('data-rotulo'); botao.removeAttribute('data-rotulo'); }
    }
  }
  function aoParar(fn, ms) {
    var tm = null;
    return function () { var a = arguments; var self = this; clearTimeout(tm); tm = setTimeout(function () { fn.apply(self, a); }, ms || 400); };
  }

  var VAGAS_UI = {
    el: el, icone: icone, limpar: limpar, trocar: trocar, acrescentar: acrescentar, t: t,
    avisar: avisar, anunciar: anunciar, carregando: carregando, esqueletos: esqueletos, vazio: vazio, erroCarregar: erroCarregar,
    faixa: faixa, tirarFaixa: tirarFaixa, faixaOffline: faixaOffline, aoVoltarInternet: aoVoltarInternet, somenteLeitura: somenteLeitura,
    tratarErro: tratarErro, irParaEntrar: irParaEntrar, linkEntrar: linkEntrar, paginaAtual: paginaAtual, voltarValido: voltarValido, parametro: parametro,
    focarTitulo: focarTitulo, folha: folha, janela: janela, confirmar: confirmar,
    barra: barra, fixar: fixar, navPessoa: navPessoa, topo: topo,
    criarArmazenamento: criarArmazenamento, armazenamento: armazenamento, cidadeLembrada: cidadeLembrada, lembrarCidade: lembrarCidade, novoId: novoId,
    definirFuso: definirFuso, fuso: fuso, reais: reais, valor: valor, data: data, dataCurta: dataCurta, hora: hora, dataHora: dataHora,
    relativa: relativa, mesAno: mesAno, whatsapp: whatsapp, compartilharWhatsapp: compartilharWhatsapp,
    erroCampo: erroCampo, limparErroCampo: limparErroCampo, ocupado: ocupado, aoParar: aoParar,
    MSG: MSG, FUSO_RESERVA: FUSO_RESERVA, RE_VOLTAR: RE_VOLTAR,
    _api: api   // testes trocam _api.navegar para não sair da página
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = VAGAS_UI;
  else root.VAGAS_UI = VAGAS_UI;
})(typeof self !== 'undefined' ? self : this);
