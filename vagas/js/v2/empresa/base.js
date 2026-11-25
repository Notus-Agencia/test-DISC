/* ==========================================================================
   Vagas sem Caos · site da empresa · base: utilidades, camadas (<dialog>), avisos, menu, rotas por hash e topo
   Espaço de nomes único: window.VSC_EMP (E). As telas só falam com o banco por window.VSC_API (adaptador v2).
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP = window.VSC_EMP || {};
  var API = window.VSC_API, CFG = window.VAGAS_CONFIG || {}, CON = window.VSC_CONTRATO;
  var raiz = document.documentElement;

  E.API = API; E.CFG = CFG; E.CON = CON;
  E.previa = !!API && API.modo === 'previa';
  E.GOLPE = CON.FRASE_GOLPE;
  E.HORA = 3600000; E.DIA = 24 * E.HORA;

  /* ---------- texto, número e data ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function ic(n, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function icSetor(id) { return document.getElementById('i-setor-' + id) ? ic('setor-' + id) : ic('maleta'); }
  function milhar(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function reais(n) {
    var v = Number(n) || 0, inteiro = Math.floor(v), cent = Math.round((v - inteiro) * 100);
    return 'R$ ' + milhar(inteiro) + (cent ? ',' + ('0' + cent).slice(-2) : '');
  }
  function num(s) { var n = parseInt(String(s || '').replace(/\D/g, ''), 10); return isNaN(n) ? 0 : n; }
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function iniciais(nome) { var p = String(nome || '').replace(/\(.*?\)/g, '').trim().split(/\s+/); return ((p[0] || '')[0] || '').toUpperCase() + ((p[1] || '')[0] || '').toUpperCase(); }
  function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }
  function digitos(s) { return String(s || '').replace(/\D/g, ''); }
  function emailValido(s) { return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(s || '').trim()); }
  /* WhatsApp com DDD, como o banco guarda: 55 + DDD + número */
  function waDigitos(s) { var d = digitos(s); if (d.length === 10 || d.length === 11) d = '55' + d; return d; }
  function waValido(s) { return /^55[1-9][1-9][0-9]{8,9}$/.test(waDigitos(s)); }
  function mascararWa(d) {
    d = digitos(d).replace(/^55/, '');
    if (d.length < 10) return '';
    return '(' + d.slice(0, 2) + ') ' + (d.length === 11 ? '9 ' : '') + '••••-' + d.slice(-4);
  }
  function uuid() {
    var c = window.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  var SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function agora() { return Date.now(); }
  function brt(ms) { return new Date(ms - 3 * E.HORA); }   /* horário de Brasília, qualquer que seja o fuso do aparelho */
  function dd(n) { return ('0' + n).slice(-2); }
  function dataBr(ms) { var d = brt(ms); return dd(d.getUTCDate()) + '/' + dd(d.getUTCMonth() + 1); }
  function dataIsoBr(ms) { var d = brt(ms); return d.getUTCFullYear() + '-' + dd(d.getUTCMonth() + 1) + '-' + dd(d.getUTCDate()); }
  function horaBr(ms) { var d = brt(ms), h = d.getUTCHours(), m = d.getUTCMinutes(); return h + 'h' + (m ? dd(m) : ''); }
  function diaSemana(ms) { return brt(ms).getUTCDay(); }
  function quando(ms) { return SEMANA[diaSemana(ms)] + ' ' + dataBr(ms) + ', ' + horaBr(ms); }
  function ms(iso) { var t = Date.parse(iso); return isNaN(t) ? 0 : t; }
  var NB = ' ';   /* espaço que não quebra: "há 4 h" fica junto */
  function ha(t) {
    var h = Math.max(0, (agora() - t) / E.HORA);
    if (h < 1) return 'agora';
    if (h < 24) return 'há' + NB + Math.round(h) + NB + 'h';
    var d = Math.round(h / 24); return d === 1 ? 'há' + NB + '1' + NB + 'dia' : 'há' + NB + d + NB + 'dias';
  }
  function relogio() { var d = new Date(); return dd(d.getHours()) + ':' + dd(d.getMinutes()); }

  var POR_TXT = { mes: 'por mês', dia: 'por dia', hora: 'por hora', servico: 'por serviço' };
  function salTexto(s) {
    if (!s || !(Number(s.min) > 0)) return { v: '', p: '' };
    var v = Number(s.max) > Number(s.min) ? reais(s.min) + ' a ' + reais(s.max) : reais(s.min);
    var p = POR_TXT[s.periodo] || '';
    if (s.obs) p += (p ? ', ' : '') + s.obs;
    return { v: v, p: p };
  }
  function salHtml(s) { var t = salTexto(s); return t.v ? '<b>' + esc(t.v) + '</b>' + (t.p ? ' ' + esc(t.p) : '') : '<span class="pv-vazio">Salário ainda não informado</span>'; }
  function exemplo() { return E.previa ? '<span class="exemplo">Exemplo</span>' : ''; }
  function golpe() { return '<p class="golpe">' + ic('escudo') + '<span>' + esc(E.GOLPE) + '</span></p>'; }

  /* ---------- armazenamento só deste aparelho (nada que precise sobreviver) ---------- */
  function lerJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function gravarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* só conveniência */ } }
  function apagar(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
  function copiar(txt) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(txt).then(function () { return true; }, function () { return false; }); } catch (e) { /* sem área de transferência */ }
    return Promise.resolve(false);
  }
  function movimentoReduzido() { return raiz.getAttribute('data-fx') === 'off' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function ehCelular() { return window.innerWidth <= 760; }
  function ehMouse() { return !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches); }

  E.esc = esc; E.norm = norm; E.ic = ic; E.icSetor = icSetor; E.milhar = milhar; E.reais = reais; E.num = num; E.$ = $; E.$$ = $$; E.plural = plural;
  E.iniciais = iniciais; E.primeiroNome = primeiroNome; E.digitos = digitos; E.emailValido = emailValido; E.waDigitos = waDigitos; E.waValido = waValido;
  E.mascararWa = mascararWa; E.uuid = uuid; E.SEMANA = SEMANA; E.SEMANA_LONGA = SEMANA_LONGA; E.agora = agora; E.dataBr = dataBr; E.dataIsoBr = dataIsoBr;
  E.horaBr = horaBr; E.diaSemana = diaSemana; E.quando = quando; E.ms = ms; E.ha = ha; E.relogio = relogio; E.salTexto = salTexto; E.salHtml = salHtml;
  E.exemplo = exemplo; E.golpe = golpe; E.lerJSON = lerJSON; E.gravarJSON = gravarJSON; E.apagar = apagar; E.copiar = copiar;
  E.movimentoReduzido = movimentoReduzido; E.ehCelular = ehCelular; E.ehMouse = ehMouse; E.POR_TXT = POR_TXT; E.brt = brt;

  /* ---------- estado e interface ---------- */
  E.S = { sessao: false, empresas: [], empresa: null, vagas: [], limites: null, cands: [], totais: null, base: null, painelEm: 0, candsVaga: '', lote: [] };
  E.UI = { visao: null, ordem: 'recentes', filtros: {}, aba: 'aberta', sel: {}, gvAba: 'resumo', listaVaga: '', empresaAba: 'dados' };
  E.TELAS = {}; E.PRE = {}; E.ACOES = {};

  /* ---------- preferências: tema e efeitos (só neste aparelho) ---------- */
  var CHAVE_PREF = 'vsc.prefs.v1';
  var PREF = lerJSON(CHAVE_PREF) || { tema: 'auto', fx: 'auto' };
  function aparelhoFraco() {
    var c = navigator.connection;
    return (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || !!(c && c.saveData);
  }
  function aplicarPref() {
    if (PREF.tema === 'light' || PREF.tema === 'dark') raiz.setAttribute('data-theme', PREF.tema); else raiz.removeAttribute('data-theme');
    raiz.removeAttribute('data-fx'); raiz.removeAttribute('data-vidro');
    if (PREF.fx === 'off') raiz.setAttribute('data-fx', 'off');
    else if (PREF.fx !== 'on' && aparelhoFraco()) raiz.setAttribute('data-vidro', 'off');
  }
  E.PREF = PREF; E.CHAVE_PREF = CHAVE_PREF; E.aplicarPref = aplicarPref;
  aplicarPref();

  /* ---------- camadas abertas (<dialog>): a de cima recebe o aviso e o menu ---------- */
  var pilhaDl = [];
  function mostrarModal(dl) {
    if (!dl.open) { try { dl.showModal(); } catch (e) { dl.setAttribute('open', ''); } }
    var i = pilhaDl.indexOf(dl); if (i >= 0) pilhaDl.splice(i, 1); pilhaDl.push(dl);
  }
  function dialogoTopo() { for (var i = pilhaDl.length - 1; i >= 0; i--) { var d = pilhaDl[i]; if (d.open && !d.classList.contains('saindo')) return d; } return null; }
  E.mostrarModal = mostrarModal; E.dialogoTopo = dialogoTopo;

  /* ---------- aviso que some (fica dentro da camada de cima, senão o <dialog> o cobre) ---------- */
  var toastVivo = null;
  function toast(msg, acao, fn, icone) {
    if (toastVivo) toastVivo.remove();
    var el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status');
    el.innerHTML = ic(icone || 'check') + '<span></span>' + (acao ? '<button class="toast-acao" type="button"></button>' : '');
    el.querySelector('span').textContent = msg;
    if (acao) el.querySelector('button').textContent = acao; else el.style.paddingRight = '16px';
    var host = dialogoTopo() || document.body, y = null;
    host.appendChild(el); toastVivo = el;
    if (host !== document.body) {
      var rod = host.querySelector('.gv-rodape, .folha-rodape');
      if (rod) y = rod.offsetHeight + 12;
      if (host.id === 'gaveta' && !ehCelular()) { var gr = host.getBoundingClientRect(), tr = el.getBoundingClientRect(); if (tr.left < gr.left) el.style.left = Math.round(gr.left) + 'px'; }
    } else {
      var bs = document.querySelector('.barra-selecao');
      if (bs && bs.offsetParent) y = Math.max(0, window.innerHeight - bs.getBoundingClientRect().top) + 12;
    }
    if (y != null) el.style.setProperty('--toast-y', Math.round(y) + 'px');
    var tempo = acao ? 7000 : 3200, timer;
    function sair() { clearTimeout(timer); el.classList.add('saindo'); setTimeout(function () { el.remove(); if (toastVivo === el) toastVivo = null; }, 100); }
    function contar() { clearTimeout(timer); timer = setTimeout(sair, tempo); }
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', contar);
    el.addEventListener('focusin', function () { clearTimeout(timer); });
    el.addEventListener('focusout', contar);
    if (acao) el.querySelector('button').addEventListener('click', function () { fn(); sair(); });
    contar();
  }
  E.toast = toast; E.toastVivo = function () { return toastVivo; };

  /* ---------- folhas, janela e gaveta (<dialog> nativo) ---------- */
  function abrir(id, html) {
    var dl = document.getElementById(id);
    if (html != null) dl.innerHTML = html;
    fecharMenu();
    if (id === 'folha-curta') {
      dl.classList.add('vidro', 'denso');
      if (dl.querySelector('input:not([type="hidden"]),textarea,select')) dl.classList.remove('vidro', 'denso');
    }
    mostrarModal(dl);
    if (id === 'folha-curta' && dl.classList.contains('vidro') && dl.offsetWidth * dl.offsetHeight > 0.3 * window.innerWidth * window.innerHeight) dl.classList.remove('vidro', 'denso');
    var foco = dl.querySelector('[autofocus]');
    if (foco && !ehCelular()) setTimeout(function () { foco.focus(); }, 30);
    else { dl.setAttribute('tabindex', '-1'); dl.focus({ preventScroll: true }); }
    return dl;
  }
  function fechar(dl, depois) {
    if (typeof dl === 'string') dl = document.getElementById(dl);
    if (!dl || !dl.open) { if (depois) depois(); return; }
    var fim = function () { dl.classList.remove('saindo'); dl.style.transform = ''; dl.close(); if (depois) depois(); };
    if (movimentoReduzido()) { fim(); return; }
    dl.classList.add('saindo'); setTimeout(fim, 100);
  }
  var menuFechouEm = 0;
  $$('dialog').forEach(function (dl) {
    dl.addEventListener('cancel', function (e) {
      e.preventDefault();
      if (!$('#menu').hidden || Date.now() - menuFechouEm < 150) { fecharMenu(); return; }
      if (dl.id === 'gaveta') E.fecharGaveta(); else fechar(dl);
    });
    dl.addEventListener('close', function () { var i = pilhaDl.indexOf(dl); if (i >= 0) pilhaDl.splice(i, 1); if (dl.onfechou) { var f = dl.onfechou; dl.onfechou = null; f(); } });
    dl.addEventListener('click', function (e) {
      if (e.target !== dl) return;
      var r = dl.getBoundingClientRect();
      var fora = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (fora) { if (dl.id === 'gaveta') E.fecharGaveta(); else fechar(dl); }
    });
    dl.addEventListener('pointerdown', function (e) {
      var h = e.target.closest('.folha-topo'); if (!h || e.target.closest('button') || window.innerWidth > 760) return;
      var y0 = e.clientY, dy = 0;
      function mv(ev) { dy = Math.max(0, ev.clientY - y0); dl.style.transform = 'translateY(' + Math.round(dy) + 'px)'; }
      function up() { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); if (dy > dl.offsetHeight * 0.3) fechar(dl); else dl.style.transform = ''; }
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    });
  });
  function folhaTopo(id, titulo, alca) {
    return (alca !== false ? '<div class="folha-alca" aria-hidden="true"></div>' : '') +
      '<div class="folha-topo"><h2 id="' + id + '">' + esc(titulo) + '</h2><button class="btn-icone" type="button" data-acao="fechar-dialogo" aria-label="Fechar">' + ic('x') + '</button></div>';
  }
  function janela(titulo, texto, rotulo, perigo, fn) {
    abrir('janela', '<h2 id="janela-titulo">' + esc(titulo) + '</h2><p>' + esc(texto) + '</p><div class="janela-acoes">' +
      '<button class="btn sec" type="button" data-acao="fechar-dialogo">Cancelar</button>' +
      '<button class="btn ' + (perigo ? 'perigo' : '') + '" type="button" id="janela-ok">' + esc(rotulo) + '</button></div>');
    $('#janela-ok').addEventListener('click', function () { fechar('janela', fn); });
  }
  function janela2(titulo, texto, a, b) {
    abrir('janela', '<h2 id="janela-titulo">' + esc(titulo) + '</h2><p>' + esc(texto) + '</p><div class="janela-acoes">' +
      '<button class="btn sec" type="button" id="janela-a">' + esc(a.rot) + '</button>' +
      '<button class="btn" type="button" id="janela-b">' + esc(b.rot) + '</button></div>');
    $('#janela-a').addEventListener('click', function () { fechar('janela', a.fn); });
    $('#janela-b').addEventListener('click', function () { fechar('janela', b.fn); });
  }
  E.abrir = abrir; E.fechar = fechar; E.folhaTopo = folhaTopo; E.janela = janela; E.janela2 = janela2;

  /* ---------- menu ⋯ (toque, mouse ou teclado; setas andam, Esc e Tab fecham) ---------- */
  var menuDono = null, ultimoPorTeclado = false;
  function abrirMenu(botao, itens) {
    var m = $('#menu');
    if (menuDono === botao && !m.hidden) { fecharMenu(); return; }
    m.innerHTML = itens.map(function (it) {
      if (it === '-') return '<hr>';
      if (it.titulo) return '<div class="menu-titulo">' + esc(it.titulo) + '</div>';
      var radio = it.marcado != null;
      return '<button type="button" role="' + (radio ? 'menuitemradio' : 'menuitem') + '" class="' + (it.perigo ? 'perigo' : '') + '"' + (radio ? ' aria-checked="' + !!it.marcado + '"' : '') + '>' + (it.ic ? ic(it.ic) : '') + esc(it.txt) + '</button>';
    }).join('');
    var bts = $$('button', m), k = 0;
    itens.forEach(function (it) { if (it === '-' || it.titulo) return; var b = bts[k++]; b.addEventListener('click', function (ev) { var d = menuDono; fecharMenu(); if (d && ev.detail === 0 && document.body.contains(d)) d.focus({ preventScroll: true }); it.fn(); }); });
    m.hidden = false; menuDono = botao; botao.setAttribute('aria-expanded', 'true');
    var dlPai = botao.closest('dialog');
    if (dlPai) dlPai.appendChild(m); else document.body.appendChild(m);
    var r = botao.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    var pr = dlPai ? dlPai.getBoundingClientRect() : { left: -window.scrollX, top: -window.scrollY };
    var x = Math.min(Math.max(8, r.right - mw), window.innerWidth - mw - 8);
    var y = r.bottom + 6; if (y + mh > window.innerHeight - 8 && r.top - mh - 6 > 8) y = r.top - mh - 6;
    m.style.left = (x - pr.left + (dlPai ? dlPai.scrollLeft : 0)) + 'px';
    m.style.top = (y - pr.top + (dlPai ? dlPai.scrollTop : 0)) + 'px';
    var b0 = m.querySelector('button'); if (b0 && (ultimoPorTeclado || !ehMouse())) b0.focus({ preventScroll: true });
  }
  function fecharMenu() {
    var m = $('#menu'); if (!m || m.hidden) return;
    m.hidden = true; if (menuDono) menuDono.setAttribute('aria-expanded', 'false'); menuDono = null; menuFechouEm = Date.now();
    if (m.parentNode !== document.body) document.body.appendChild(m);
  }
  E.abrirMenu = abrirMenu; E.fecharMenu = fecharMenu;
  $('#menu').addEventListener('keydown', function (e) {
    var bs = $$('#menu button'), i = bs.indexOf(document.activeElement), n = bs.length;
    if (!n) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % n].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + n) % n].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); bs[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); bs[n - 1].focus(); }
    else if (e.key === 'Tab' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var d = menuDono; fecharMenu(); if (d) d.focus(); }
  });
  document.addEventListener('pointerdown', function (e) { if (!e.target.closest('#menu') && !e.target.closest('[aria-haspopup="menu"]')) fecharMenu(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#menu').hidden) { e.preventDefault(); var d = menuDono; fecharMenu(); if (d) d.focus(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('[aria-haspopup="menu"]')) ultimoPorTeclado = true;
  });
  window.addEventListener('resize', function () { if (!$('#menu').hidden) fecharMenu(); });

  /* ---------- ações por clique (delegação) ---------- */
  var ACOES = E.ACOES;
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-acao]');
    if (!el) return;
    var fn = ACOES[el.getAttribute('data-acao')];
    if (!fn) return;
    ultimoPorTeclado = e.detail === 0;
    if (el.tagName === 'A' || el.type === 'submit') e.preventDefault();
    fn(el, e);
  });
  ACOES['fechar-dialogo'] = function (el) { var dl = el.closest('dialog'); if (dl && dl.id === 'gaveta') E.fecharGaveta(); else fechar(dl); };
  ACOES['ir'] = function (el) { ir(el.getAttribute('data-para')); };

  /* ---------- rotas por hash: #/tela/arg?chave=valor ---------- */
  var telaAtual = '', fichaAtual = '', renderN = 0, montando = false;
  function lerRota() {
    var h = String(location.hash || '').replace(/^#\/?/, ''), q = {}, i = h.indexOf('?');
    if (i >= 0) {
      h.slice(i + 1).split('&').forEach(function (par) {
        if (!par) return;
        var j = par.indexOf('='), k = decodeURIComponent(j < 0 ? par : par.slice(0, j)), v = j < 0 ? '' : decodeURIComponent(par.slice(j + 1).replace(/\+/g, ' '));
        q[k] = v;
      });
      h = h.slice(0, i);
    }
    var partes = h.split('/').filter(Boolean).map(decodeURIComponent);
    return { tela: partes[0] || '', arg: partes[1] || '', arg2: partes[2] || '', q: q, bruto: h };
  }
  function montaHash(tela, arg, q) {
    var h = '#/' + tela + (arg ? '/' + encodeURIComponent(arg) : '');
    var ks = Object.keys(q || {}).filter(function (k) { return q[k] !== '' && q[k] != null; });
    if (ks.length) h += '?' + ks.map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&');
    return h;
  }
  function ir(h) {
    h = String(h);
    if (h.charAt(0) !== '#') h = '#/' + h.replace(/^\/?/, '');
    if (location.hash === h) render(); else location.hash = h;
  }
  E.lerRota = lerRota; E.montaHash = montaHash; E.ir = ir; E.rota = lerRota;
  window.addEventListener('hashchange', function () { render(); });

  var PRECISA_CONTA = { inicio: 1, vagas: 1, candidatos: 1, candidato: 1, empresa: 1, verificacao: 1, publicada: 1 };
  E.PRECISA_CONTA = PRECISA_CONTA;
  var timerCarga = null;
  function render() {
    fecharMenu();
    var r = lerRota(), S = E.S;
    var tela = r.tela;
    if (!tela) { ir(S.empresa ? '#/inicio' : '#/anunciar'); return; }
    if (tela === 'vaga' && r.arg !== 'nova' && r.arg !== 'editar') { ir('#/vaga/nova'); return; }
    if (!E.TELAS[tela]) { ir(S.empresa ? '#/inicio' : '#/anunciar'); return; }
    if (PRECISA_CONTA[tela] && !S.empresa && !(tela === 'vagas' && r.arg === 'varias')) { ir(S.sessao ? '#/anunciar' : '#/entrar'); return; }
    if (tela === 'entrar' && S.empresa) { ir('#/inicio'); return; }
    var eventual = ++renderN;
    var gv = $('#gaveta');
    if (tela !== 'candidato') {
      if (gv.open) gv.close();
      $$('dialog[open]').forEach(function (d) { if (d.id !== 'gaveta' || tela !== 'candidato') d.close(); });
    }
    var ficha = tela + '/' + r.arg;
    var entrando = tela === 'candidato' ? !/^candidatos\//.test(fichaAtual) : ficha !== fichaAtual;
    var pre = E.PRE[tela] && (entrando || (tela === 'candidatos' && E.UI.listaVaga !== (r.q.vaga || ''))) ? E.PRE[tela](r) : null;
    clearTimeout(timerCarga);
    if (pre) {
      timerCarga = setTimeout(function () { if (eventual === renderN) montarCarregando(); }, 160);
      pre.then(function () { if (eventual === renderN) { clearTimeout(timerCarga); montar(tela, r); } },
        function (e) { if (eventual === renderN) { clearTimeout(timerCarga); montarErro(e, tela, r); } });
      return;
    }
    montar(tela, r);
  }
  function montarCarregando() {
    $('#app').innerHTML = '<div class="tela pagina"><div class="cartao vazio" role="status" aria-live="polite"><span class="giro" aria-hidden="true"></span><b>Carregando…</b></div></div>';
  }
  function montarErro(e, tela, r) {
    if (e && e.sessaoExpirada) return;
    $('#app').innerHTML = '<div class="tela pagina"><div class="cartao vazio" role="alert">' + ic('erro') + '<b>Não deu para carregar</b><p>' + esc(E.msgErro(e)) +
      '</p><button class="btn sec" type="button" data-acao="tentar-de-novo">Tentar de novo</button></div></div>';
    pintarTopo(null, false); pintarBarra(null);
  }
  ACOES['tentar-de-novo'] = function () { fichaAtual = ''; render(); };
  function montar(tela, r) {
    if (montando) return;
    montando = true;
    try { montarAgora(tela, r); } finally { montando = false; }
  }
  function montarAgora(tela, r) {
    if (tela === 'candidato') {
      /* a lista fica por baixo da gaveta */
      if (!/^candidatos\//.test(fichaAtual)) montarAgora('candidatos', { tela: 'candidatos', arg: '', arg2: '', q: { vaga: E.UI.listaVaga || '' }, bruto: 'candidatos' });
      E.gavetaAbrir(r.arg);
      return;
    }
    var ae = document.activeElement;
    if (ae && ae !== document.body && $('#app').contains(ae)) ae.blur();
    var res = E.TELAS[tela](r) || {};
    var app = $('#app'), ficha = tela + '/' + r.arg;
    var mesma = ficha === fichaAtual, primeira = !fichaAtual;
    var html = res.html || '';
    if (primeira || mesma) html = html.replace(/\scascata(?=["\s])/g, '');
    app.onclick = null; app.onchange = null;
    app.innerHTML = '<div class="tela pagina' + (movimentoReduzido() || mesma || primeira ? '' : ' entra') + '" data-tela="' + tela + '">' + html + '</div>';
    telaAtual = ficha; fichaAtual = ficha;
    document.body.classList.toggle('cinza', !!res.cinza);
    document.body.setAttribute('data-tela', tela);
    pintarTopo(res.nav, res.topoBotao);
    pintarBarra(res.barra === 'baixo' ? res.nav : null);
    document.body.classList.toggle('tem-barra-publicar', res.barra === 'publicar');
    $('#rodape').hidden = !!res.semRodape;
    if (!res.manterRolagem && !mesma) window.scrollTo(0, 0);
    if (tela === 'candidatos') E.UI.listaVaga = r.q.vaga || '';
    document.title = (res.titulo ? res.titulo + ' | ' : '') + 'Vagas sem Caos';
    if (res.depois) res.depois();
  }
  E.render = render; E.montar = montar;
  E.telaAtual = function () { return telaAtual; };
  /* marca que a próxima visita à tela deve recarregar os dados */
  E.esquecerTela = function () { fichaAtual = ''; };

  /* ---------- topo e barra de baixo ---------- */
  var NAV = [
    { id: 'inicio', txt: 'Início', ic: 'inicio', h: '#/inicio' },
    { id: 'vagas', txt: 'Vagas', ic: 'maleta', h: '#/vagas' },
    { id: 'candidatos', txt: 'Candidatos', ic: 'pessoas', h: '#/candidatos' },
    { id: 'empresa', txt: 'Empresa', ic: 'predio', h: '#/empresa' }
  ];
  function logoVsc() {
    return '<img class="logo-img so-claro" src="comum/marca/vsc-logo.svg" alt="Vagas sem Caos" width="863" height="129">' +
      '<img class="logo-img so-escuro" src="comum/marca/vsc-logo-negativo.svg" alt="" width="863" height="129">';
  }
  function novosCount() {
    if (E.S.vagas.length) return E.S.vagas.reduce(function (t, v) { return t + (v.novos || 0); }, 0);
    return E.S.cands.filter(function (c) { return c.etapa === 'nova'; }).length;
  }
  function avisosCount() { return novosCount() + E.S.cands.filter(function (c) { return c.etapa !== 'nova' && c.naoLidas > 0; }).length; }
  E.novosCount = novosCount; E.avisosCount = avisosCount;
  function pintarTopo(nav, botao) {
    var t = $('#topo-in'), S = E.S;
    if (!S.empresa) {
      t.innerHTML = '<a class="logo" href="#/anunciar" aria-label="Vagas sem Caos, início">' + logoVsc() + '</a>' +
        '<div class="topo-acoes"><span class="detalhe so-pc">Já anuncia aqui?</span><a class="btn fantasma" href="#/entrar">Entrar</a></div>';
      return;
    }
    var n = novosCount(), av = avisosCount();
    t.innerHTML = '<a class="logo" href="#/inicio" aria-label="Vagas sem Caos, início do painel">' + logoVsc() + '</a>' +
      '<nav class="nav-topo" aria-label="Painel">' + NAV.map(function (it) {
        return '<a href="' + it.h + '"' + (nav === it.id ? ' aria-current="page"' : '') + '>' + esc(it.txt) +
          (it.id === 'candidatos' && n ? ' <span class="contador" aria-label="' + n + (n === 1 ? ' novo' : ' novos') + '">' + n + '</span>' : '') + '</a>';
      }).join('') + '</nav>' +
      '<div class="topo-acoes">' +
      '<button class="btn-icone sino" type="button" data-acao="avisos" aria-label="Avisos' + (av ? ', ' + av + (av === 1 ? ' novo' : ' novos') : '') + '">' + ic('sino') + (av ? '<span class="contador">' + av + '</span>' : '') + '</button>' +
      '<a class="topo-empresa" href="#/empresa"><span class="avatar p">' + esc(iniciais(S.empresa.nome)) + '</span><span>' + esc(S.empresa.nome) + '</span></a>' +
      (botao === false ? '' : '<a class="btn so-pc' + (botao === 'sec' ? ' sec' : '') + '" href="#/vaga/nova" data-acao="nova-vaga">' + ic('mais') + 'Anunciar vaga</a>') +
      '</div>';
  }
  function pintarBarra(nav) {
    var b = $('#barra-baixo');
    if (!nav || !E.S.empresa) { b.hidden = true; document.body.classList.remove('tem-barra-baixo'); return; }
    var n = novosCount();
    b.innerHTML = NAV.map(function (it) {
      return '<a href="' + it.h + '"' + (nav === it.id ? ' aria-current="page"' : '') + '>' + ic(it.ic) + '<span>' + esc(it.txt) + '</span>' +
        (it.id === 'candidatos' && n ? '<span class="contador" aria-label="' + n + (n === 1 ? ' novo' : ' novos') + '">' + n + '</span>' : '') + '</a>';
    }).join('');
    b.hidden = false; document.body.classList.add('tem-barra-baixo');
  }
  E.pintarTopo = pintarTopo; E.pintarBarra = pintarBarra; E.logoVsc = logoVsc;
  /* topo ganha vidro quando a página sai do alto */
  (function () {
    var s = document.createElement('div');
    s.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none';
    document.body.prepend(s);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { $('#topo').toggleAttribute('data-rolou', !e[0].isIntersecting); }).observe(s);
  })();

  /* ---------- erros do banco ---------- */
  E.msgErro = function (e) {
    if (!e) return 'Não deu certo. Tente de novo.';
    if (e.conexao) return 'Sem conexão com a internet. Confira o sinal e tente de novo.';
    return e.message || 'Não deu certo. Tente de novo.';
  };
  /* chama o banco; se a sessão acabou, volta para a entrada */
  E.api = function (metodo, dados) {
    return API.pronto.then(function () { return API[metodo](dados || {}); }).catch(function (e) {
      if (e && e.sessaoExpirada && E.S.sessao) E.sessaoCaiu();
      throw e;
    });
  };
  E.sessaoCaiu = function () {
    E.zerarConta();
    $$('dialog[open]').forEach(function (d) { d.close(); });
    toast('Sua sessão acabou. Entre de novo.', null, null, 'info');
    ir('#/entrar');
  };
})();
