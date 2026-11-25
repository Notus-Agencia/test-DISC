/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · rotas por hash (#/, #/vagas?q=, #/vaga/<id>, #/candidatar/<id>, #/entrar, #/candidaturas,
 * #/candidatura/<id>, #/salvas, #/alertas, #/curriculo, #/eu, #/como-funciona), desenho da tela, topo, preferências (tema e efeitos)
 * e os ouvintes de toque, digitação e envio que valem para o site todo.
 */
(function (root) {
  'use strict';
  const doc = root.document, P = root.VSC_P, { $, $$, esc, ic } = P, E = P.est, D = P.D;

  /* ---------- rotas ---------- */
  const ID = '[A-Za-z0-9_-]{3,64}';
  P.rolagem = {};
  P.navegou = 0;
  P.rota = function () {
    const h = (root.location.hash || '').replace(/^#\/?/, ''), i = h.indexOf('?');
    const caminho = i < 0 ? h : h.slice(0, i), qs = i < 0 ? '' : h.slice(i + 1);
    let m;
    if (!caminho) return { v: 'inicio' };
    if (caminho === 'vagas') return { v: 'busca', qs };
    if ((m = new RegExp('^vaga/(' + ID + ')$').exec(caminho))) return { v: 'vaga', id: m[1] };
    if ((m = new RegExp('^candidatar/(' + ID + ')$').exec(caminho))) return { v: 'vaga', id: m[1], abrir: true };
    if ((m = new RegExp('^candidatura/(' + ID + ')$').exec(caminho))) return { v: 'candidatura', id: m[1] };
    if (['entrar', 'candidaturas', 'salvas', 'alertas', 'curriculo', 'eu', 'como-funciona'].indexOf(caminho) >= 0) return { v: caminho };
    return { v: 'inicio' };
  };
  const chaveRota = (r) => r.v + (r.id ? '-' + r.id : '');
  P.ir = function (h) {
    if (root.location.hash === h) { P.render(); return; }
    if (root.history.state && root.history.state.folha) { try { root.location.replace(h); return; } catch (e) { /* segue pelo hash */ } }
    root.location.hash = h;
  };
  const navDe = (r) => ({ inicio: 'vagas', busca: 'vagas', vaga: 'vagas', salvas: 'salvas', candidaturas: 'candidaturas', candidatura: 'candidaturas' }[r.v] || 'perfil');
  const TITULOS = { inicio: 'Vagas sem Caos', busca: 'Vagas', salvas: 'Vagas salvas', candidaturas: 'Candidaturas', candidatura: 'Candidatura', eu: 'Perfil', curriculo: 'Meu currículo',
    alertas: 'Alertas de vaga', entrar: 'Entrar', 'como-funciona': 'Como funciona' };

  /* ---------- topo ---------- */
  const entrarHTML = () => (E.conta
    ? `<a class="avatar-link" href="#/eu" aria-label="Seu perfil"><span class="avatar p">${E.conta.nome ? esc(P.iniciais(E.conta.nome)) : ic('usuario')}</span></a>`
    : '<a class="btn fantasma peq" href="#/entrar">Entrar</a>');
  P.pintarTopo = function (r) {
    const topo = $('#topo'), meio = $('#topo-meio'), acoes = $('#topo-acoes'), extra = $('#topo-extra');
    let modo = 'normal';
    const empresa = '<a class="link" href="empresas.html">Sou empresa</a>';
    meio.innerHTML = ''; extra.innerHTML = ''; extra.hidden = true;
    acoes.innerHTML = empresa + entrarHTML();
    if (r.v === 'busca' || (r.v === 'vaga' && P.split)) {
      modo = 'busca';
      meio.innerHTML = `<a class="voltar so-estreito" href="#/" aria-label="Voltar para o início">${ic('voltar')}</a>` +
        `<form class="busca-topo" data-form="buscar" data-origem="topo" role="search" autocomplete="off">${ic('busca')}` +
        `<label class="sr" for="q-busca">Que vaga você procura?</label><input class="entrada" id="q-busca" name="q" type="search" enterkeyhint="search" placeholder="Função, setor ou palavra" value="${esc(E.filtros.q)}" aria-autocomplete="list" aria-controls="sug-q-busca" aria-expanded="false">` +
        '<ul class="sugestoes" id="sug-q-busca" role="listbox" aria-label="Sugestões" hidden></ul></form>';
      extra.hidden = false; extra.innerHTML = P.chipsFiltro(E.filtros);
      acoes.innerHTML = `<span class="so-largo">${empresa}</span>` + entrarHTML();
    } else if (r.v !== 'inicio' && r.v !== 'salvas' && r.v !== 'candidaturas' && r.v !== 'eu') {
      modo = 'interno';
      const volta = { candidatura: ['#/candidaturas', 'Candidaturas'], curriculo: ['#/eu', 'Perfil'], alertas: ['#/eu', 'Perfil'] }[r.v];
      meio.innerHTML = volta ? `<a class="voltar" href="${volta[0]}">${ic('voltar')}${volta[1]}</a>` : `<button class="voltar" type="button" data-acao="voltar">${ic('voltar')}${r.v === 'vaga' ? 'Vagas' : 'Voltar'}</button>`;
      const v = r.v === 'vaga' && D.VAGA[r.id];
      acoes.innerHTML = (v ? `<span class="so-estreito"><button class="btn-icone" type="button" data-acao="compartilhar" data-id="${esc(v.id)}" aria-label="Compartilhar vaga">${ic('compartilhar')}</button>${P.salvaBotao(v)}</span>` : '') +
        `<span class="so-largo">${empresa}${entrarHTML()}</span>`;
    }
    topo.setAttribute('data-modo', modo);
    P.nav(r);
  };
  P.nav = function (r) {
    const n = navDe(r);
    $$('[data-nav]').forEach((a) => { if (a.getAttribute('data-nav') === n) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  };
  const medirTopo = () => { const t = $('#topo'); if (t) doc.documentElement.style.setProperty('--topo-alt', t.offsetHeight + 'px'); };

  /* ---------- preferências: tema e efeitos ---------- */
  function syncSeg() {
    const p = P.prefs();
    $$('.segmentado[data-grupo="tema"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === (p.tema || 'auto'))));
    $$('.segmentado[data-grupo="efeitos"] button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.valor === (p.fx || 'auto'))));
  }
  P.syncSeg = syncSeg;
  P.fraco = () => { try { const n = root.navigator, c = n.connection; return !!((n.deviceMemory && n.deviceMemory <= 4) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || (c && c.saveData)); } catch (e) { return false; } };
  P.aplicarPrefs = function () {
    const d = doc.documentElement, p = P.prefs();
    if (p.tema === 'light' || p.tema === 'dark') d.setAttribute('data-theme', p.tema); else d.removeAttribute('data-theme');
    d.removeAttribute('data-fx'); d.removeAttribute('data-vidro');
    if (p.fx === 'off') d.setAttribute('data-fx', 'off'); else if (p.fx !== 'on' && P.fraco()) d.setAttribute('data-vidro', 'off');
    syncSeg();
  };
  P.grupos.tema = (v) => { P.guardarPrefs({ tema: v }); P.aplicarPrefs(); };
  P.grupos.efeitos = (v) => { P.guardarPrefs({ fx: v }); P.aplicarPrefs(); P.toast(v === 'off' ? 'Efeitos reduzidos: sem vidro e sem movimento' : v === 'on' ? 'Efeitos completos' : 'Efeitos automáticos'); };

  /* ---------- desenho ---------- */
  let ATUAL = null, SEQ = 0;
  P.split = false;
  const tituloDa = (r) => {
    const v = r.v === 'vaga' && D.VAGA[r.id];
    return (v ? v.titulo + ' · ' + P.empresaDe(v).nome : TITULOS[r.v] || 'Vagas sem Caos') + (r.v === 'inicio' || v ? '' : ' · Vagas sem Caos');
  };
  async function preparar(r, o) {
    if (r.v === 'busca' && !o.manter) {
      const F = P.queryParaFiltro(r.qs);
      F.aviso = E.avisoBusca || '';
      E.avisoBusca = '';
      E.filtros = F;
    }
    if (P.MOD_TELA[r.v]) await P.modulo(P.MOD_TELA[r.v]);
    if (r.v === 'vaga' && !D.VAGA[r.id]) await P.api('vaga', { id: r.id }).then((x) => P.incluir(x.vaga, x.empresa), () => null);
    if (r.v === 'salvas') await P.garantirVagas(E.salvas);
    if (E.conta && !E.candsCarregadas && ['candidaturas', 'candidatura', 'inicio', 'vaga', 'busca'].indexOf(r.v) >= 0) await P.carregarCands().catch(() => null);
    if (r.v === 'candidatura' && P.prepararCandidatura) await P.prepararCandidatura(r.id);
  }
  function desenhar(r, o) {
    P.split = r.v === 'vaga' && P.largo() && D.ABERTAS.length > 0 && P.B.filtrar(E.filtros).some((v) => v.id === r.id);
    const fn = P.telas[r.v] || P.telas.inicio;
    let html;
    if (r.v === 'vaga') html = P.split ? P.telas.busca(r.id) : fn(r.id);
    else if (r.v === 'candidatura') html = fn(r.id);
    else html = fn();
    $('#app').innerHTML = html;
    if (r.v === 'busca' || P.split) P.primeiraLista = false;
    P.pintarTopo(r);
    const vagaPagina = r.v === 'vaga' && !P.split, barra = !!$('#barra-cand'), semBarra = (vagaPagina && barra) || r.v === 'candidatura';
    doc.body.classList.toggle('tem-barra-candidatar', vagaPagina && barra);
    doc.body.classList.toggle('tem-barra-baixo', !semBarra);
    doc.body.classList.toggle('tela-conversa', r.v === 'candidatura');
    $('#barra-baixo').hidden = semBarra;
    $('#rodape').hidden = ['inicio', 'como-funciona', 'salvas'].indexOf(r.v) < 0;
    P.pintarContadores(); syncSeg(); medirTopo();
    if (P.depois[r.v]) P.depois[r.v](r, o);
    if (!o.manter) {
      doc.title = tituloDa(r);
      const y = P.rolagem[chaveRota(r)];
      root.scrollTo(0, (r.v === 'busca' || r.v === 'inicio') && y ? y : 0);
      const app = $('#app');
      if (app && !(r.v === 'busca' && doc.activeElement && doc.activeElement.closest && doc.activeElement.closest('#topo'))) { try { app.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }
      P.anunciar(tituloDa(r));
    }
    ATUAL = r;
    if (r.abrir && !o.manter && P.abrirCandidatura) P.abrirCandidatura(r.id);
  }
  P.depois = {};
  P.render = async function (o) {
    o = o || {};
    const r = P.rota(), meu = ++SEQ;
    if (ATUAL && !o.manter) P.rolagem[chaveRota(ATUAL)] = root.scrollY;
    // no computador, trocar de vaga ao lado da lista não redesenha a lista
    if (!o.manter && ATUAL && P.largo() && r.v === 'vaga' && D.VAGA[r.id] && (ATUAL.v === 'busca' || (ATUAL.v === 'vaga' && P.split)) && $('#split-det') && P.B.filtrar(E.filtros).some((v) => v.id === r.id)) {
      const det = $('#split-det');
      det.innerHTML = P.painelVaga(D.VAGA[r.id]); det.scrollTop = 0;
      $$('#lista-busca .vaga').forEach((li) => { if (li.getAttribute('data-id') === r.id) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current'); });
      P.split = true; ATUAL = r; P.nav(r); doc.title = tituloDa(r);
      return;
    }
    const lento = setTimeout(() => {
      if (meu === SEQ && !o.manter && !$('#app .carregando-lista')) $('#app').innerHTML = '<div class="pagina"><div class="carregando-lista" role="status"><span class="giro" aria-hidden="true"></span><span>Carregando…</span></div></div>';
    }, 160);
    try { await preparar(r, o); } catch (e) {
      clearTimeout(lento);
      if (meu !== SEQ) return;
      $('#app').innerHTML = `<div class="pagina estreita"><div class="vazio">${ic('sem-rede')}<b>Não foi possível abrir esta tela</b><p>${esc(P.msgErro(e))}</p><button class="btn" type="button" data-acao="recarregar">Tentar de novo</button></div></div>`;
      return;
    }
    clearTimeout(lento);
    if (meu !== SEQ) return;
    const sempre = !o.manter && ATUAL && doc.startViewTransition && !P.semMovimento() && chaveRota(ATUAL) !== chaveRota(r) && !doc.querySelector('dialog[open]');
    if (sempre) {
      try {
        const vt = doc.startViewTransition(() => desenhar(r, o));
        ['ready', 'finished', 'updateCallbackDone'].forEach((k) => { if (vt && vt[k] && vt[k].catch) vt[k].catch(() => {}); });
        return;
      } catch (e) { /* desenha direto */ }
    }
    desenhar(r, o);
  };
  P.redesenhar = () => P.render({ manter: true });
  P.aoSair = () => { P.render({ manter: true }); };

  /* ---------- sugestões da busca ---------- */
  let SUG = { lista: [], i: -1, input: null };
  const fecharSugestoes = () => { $$('.sugestoes').forEach((u) => { u.hidden = true; }); $$('[aria-controls^="sug-"]').forEach((i) => i.setAttribute('aria-expanded', 'false')); SUG.i = -1; };
  function mostrarSugestoes(inp) {
    const ul = $('#sug-' + inp.id);
    if (!ul) return;
    const l = P.B.sugestoes(inp.value, E.filtros.onde, root.innerWidth <= 760 ? 3 : 5);
    SUG = { lista: l, i: -1, input: inp };
    if (!l.length) { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); return; }
    ul.innerHTML = l.map((s, i) => `<li role="presentation"><button type="button" role="option" id="sug-${inp.id}-${i}" data-acao="sugestao" data-i="${i}" aria-selected="false"${s.tipo === 'todas' ? ' class="sug-todas"' : ''}>` +
      `${ic(s.tipo === 'setor' ? 'setor-' + s.id : s.tipo === 'todas' ? 'chevron-dir' : 'busca')}<span>${s.tipo === 'todas' ? 'Ver todas as vagas de “' + esc(s.txt) + '”' : esc(s.txt)}</span><small>${P.plural(s.n, 'vaga', 'vagas')}</small></button></li>`).join('');
    ul.hidden = false; inp.setAttribute('aria-expanded', 'true');
  }
  P.escolherSugestao = function (i) {
    const s = SUG.lista[i], inp = SUG.input;
    if (!s) return;
    const doTopo = inp && inp.id === 'q-busca', F = doTopo ? E.filtros : Object.assign(P.B.filtroVazio(), { onde: E.filtros.onde });
    fecharSugestoes();
    if (s.tipo === 'todas') { P.buscarTexto(s.txt, F); return; }
    if (s.tipo === 'setor') { F.setores = [s.id]; F.q = ''; } else F.q = s.txt;
    P.aplicarFiltros(F);
  };

  /* ---------- toques, digitação e envio (valem para o site todo) ---------- */
  P.alvos = {};      // alvo -> {obj(), set?(k, v), aoChip?(chip, k), aoDigitar?(el, k), aoMudar?(el, k)}
  P.formularios = {};
  const aoClicar = function (e) {
    const t = e.target;
    if (t.tagName === 'DIALOG') { const r = t.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) P.fechar(t); return; }
    if (!t.closest('.busca-dupla,.busca-topo')) fecharSugestoes();
    const f = t.closest('[data-fechar]');
    if (f) { P.fechar(f.closest('dialog')); return; }
    const seg = t.closest('.segmentado[data-grupo]>button');
    if (seg) {
      const g = seg.parentNode;
      $$('button', g).forEach((x) => x.setAttribute('aria-pressed', String(x === seg)));
      if (P.grupos[g.getAttribute('data-grupo')]) P.grupos[g.getAttribute('data-grupo')](seg.getAttribute('data-valor'), g);
      return;
    }
    const ch = t.closest('.chip[data-alvo]');
    if (ch) { aoChip(ch); return; }
    const a = t.closest('[data-acao]');
    if (!a) return;
    const nome = a.getAttribute('data-acao');
    let fn = P.acoes[nome];
    if (!fn && P.MOD_ACAO[nome]) {
      e.preventDefault();
      P.modulo(P.MOD_ACAO[nome]).then(() => { if (P.acoes[nome]) P.acoes[nome](a, e); }, (er) => P.toast(P.msgErro(er), null, 'erro'));
      return;
    }
    if (fn) { if (a.tagName === 'BUTTON' || nome === 'voltar') e.preventDefault(); fn(a, e); }
  };
  function aoChip(ch) {
    const alvo = ch.getAttribute('data-alvo'), al = P.alvos[alvo];
    if (!al) return;
    let obj = al.obj(), k = ch.getAttribute('data-campo');
    const modo = ch.getAttribute('data-modo'), v = ch.getAttribute('data-v');
    if (!obj) return;
    if (k.indexOf('nt-') === 0 && al.sub) { obj = al.sub(); k = k.slice(3); }
    if (modo === 'multi') {
      const arr = obj[k] || (obj[k] = []), i = arr.indexOf(v), max = +ch.getAttribute('data-max') || 99;
      if (i >= 0) arr.splice(i, 1); else if (arr.length < max) arr.push(v); else { P.toast('Escolha até ' + max + '.', null, 'info'); return; }
      ch.setAttribute('aria-pressed', String(arr.indexOf(v) >= 0));
    } else if (modo === 'sal') {
      al.sal(+v);
    } else if (modo === 'texto') {
      obj[k] = v;
      const inp = $('#m-funcao');
      if (inp) { inp.value = v; inp.removeAttribute('aria-invalid'); }
      $$('.chip[data-campo="' + k + '"][data-modo="texto"]', ch.parentNode).forEach((x) => x.setAttribute('aria-pressed', String(x === ch)));
    } else {
      obj[k] = obj[k] === v ? '' : v;
      $$('.chip[data-campo="' + ch.getAttribute('data-campo') + '"]', ch.parentNode).forEach((x) => x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === obj[k])));
    }
    if (al.aoChip) al.aoChip(ch, k);
  }
  const aoDigitar = function (e) {
    const t = e.target;
    if (t.id === 'q-inicio' || t.id === 'q-busca') { mostrarSugestoes(t); return; }
    if (t.hasAttribute('data-mascara-whats')) { const mw = P.mascaraWhats(t.value); if (mw !== t.value) t.value = mw; }
    if (t.hasAttribute('data-golpe') && P.checarGolpe) { P.checarGolpe(t); return; }
    const alvo = t.getAttribute('data-alvo'), k = t.getAttribute('data-campo');
    if (!alvo || !k || t.tagName === 'SELECT' || t.type === 'checkbox') return;
    const al = P.alvos[alvo], obj = al && al.obj();
    if (!obj) return;
    if (al.set) al.set(k, t.value); else obj[k] = t.value;
    if (t.getAttribute('aria-invalid') === 'true') { t.removeAttribute('aria-invalid'); const er = doc.getElementById(t.id + '-erro'); if (er) er.hidden = true; }
    if (al.aoDigitar) al.aoDigitar(t, k);
  };
  const aoMudar = function (e) {
    const t = e.target;
    if (t.matches('input[type="file"][data-arquivo]')) {
      const f = t.files && t.files[0], ctx = t.getAttribute('data-arquivo');
      t.value = '';
      if (f) P.modulo('arquivos').then(() => P.escolheuArquivo(f, ctx));
      return;
    }
    if (t.id === 'onde-inicio') { E.filtros.onde = t.value; E.filtros.bairro = ''; return; }
    const alvo = t.getAttribute('data-alvo'), c = t.getAttribute('data-campo');
    if (!alvo || !c) { if (P.aoMudarGeral) P.aoMudarGeral(t); return; }
    const al = P.alvos[alvo], obj = al && al.obj();
    if (!obj) return;
    if (t.type === 'checkbox') obj[c] = t.checked; else if (al.set) al.set(c, t.value); else obj[c] = t.value;
    if (al.aoMudar) al.aoMudar(t, c);
  };
  const aoEnviar = function (e) {
    e.preventDefault();
    const f = e.target, tipo = f.getAttribute('data-form');
    if (tipo === 'buscar') {
      const q = (f.querySelector('[name="q"]').value || '').trim(), onde = f.querySelector('[name="onde"]');
      const F = f.getAttribute('data-origem') === 'topo' ? E.filtros : Object.assign(P.B.filtroVazio(), { onde: onde ? onde.value : E.filtros.onde });
      fecharSugestoes(); P.buscarTexto(q, F);
      if (F.aviso === 'bairro') setTimeout(() => { if (P.acoes.bairro) P.acoes.bairro(); }, 60);
      return;
    }
    const fn = P.formularios[tipo];
    if (fn) fn(f, e);
    else if (P.MOD_ACAO['form:' + tipo]) P.modulo(P.MOD_ACAO['form:' + tipo]).then(() => { if (P.formularios[tipo]) P.formularios[tipo](f, e); });
  };
  const aoTecla = function (e) {
    const t = e.target;
    if ((t.id === 'q-inicio' || t.id === 'q-busca') && SUG.lista.length && !$('#sug-' + t.id).hidden) {
      const bts = $$('#sug-' + t.id + ' button');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        SUG.i = (SUG.i + (e.key === 'ArrowDown' ? 1 : -1) + bts.length) % bts.length;
        bts.forEach((b, i) => b.setAttribute('aria-selected', String(i === SUG.i)));
        t.setAttribute('aria-activedescendant', bts[SUG.i].id);
      } else if (e.key === 'Enter' && SUG.i >= 0) { e.preventDefault(); P.escolherSugestao(SUG.i); } else if (e.key === 'Escape') fecharSugestoes();
    }
    if (e.key === 'Enter' && t.closest && t.closest('#folha-cand') && t.tagName === 'INPUT' && !t.closest('[data-codigo-caixa]')) {
      const campos = $$('#folha-cand .folha-corpo input.entrada, #folha-cand .folha-corpo select.entrada').filter((x) => !x.disabled && x.offsetParent), i = campos.indexOf(t);
      e.preventDefault();
      if (i >= 0 && campos[i + 1]) campos[i + 1].focus(); else t.blur();
    }
  };
  const aoSairFoco = function (e) {
    if (e.target.id !== 'q-inicio' && e.target.id !== 'q-busca') return;
    if (e.target.id === 'q-inicio' && root.innerWidth <= 760) return;
    setTimeout(() => { if (!doc.activeElement || !doc.activeElement.closest('.sugestoes')) fecharSugestoes(); }, 160);
  };
  P.acoes.recarregar = () => root.location.reload();
  P.iniciarOuvintes = function () {
    doc.addEventListener('click', aoClicar);
    doc.addEventListener('input', aoDigitar);
    doc.addEventListener('change', aoMudar);
    doc.addEventListener('submit', aoEnviar);
    doc.addEventListener('keydown', aoTecla);
    doc.addEventListener('focusout', aoSairFoco);
    // arrastar o arquivo para a área de anexar (computador)
    doc.addEventListener('dragover', (e) => { const z = e.target.closest && e.target.closest('[data-upload]'); if (z) { e.preventDefault(); z.setAttribute('data-arrastando', ''); } });
    doc.addEventListener('dragleave', (e) => { const z = e.target.closest && e.target.closest('[data-upload]'); if (z && !z.contains(e.relatedTarget)) z.removeAttribute('data-arrastando'); });
    doc.addEventListener('drop', (e) => {
      const z = e.target.closest && e.target.closest('[data-upload]');
      if (!z) return;
      e.preventDefault(); z.removeAttribute('data-arrastando');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) P.modulo('arquivos').then(() => P.escolheuArquivo(f, z.getAttribute('data-upload')));
    });
    root.addEventListener('hashchange', () => { P.navegou++; P.render(); });
    let larg = root.innerWidth, timer;
    root.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { const w = root.innerWidth, cruzou = (larg >= 981) !== (w >= 981) || (larg >= 761) !== (w >= 761); larg = w; if (cruzou) P.render({ manter: true }); else medirTopo(); }, 120);
    });
    const topo = $('#topo'), s = $('#sentinela');
    if (topo && s && 'IntersectionObserver' in root) new root.IntersectionObserver((en) => { topo.toggleAttribute('data-rolou', !en[0].isIntersecting); }).observe(s);
    if (root.matchMedia) { try { root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncSeg); } catch (e) { /* sem ouvinte */ } }
  };
})(typeof self !== 'undefined' ? self : this);
