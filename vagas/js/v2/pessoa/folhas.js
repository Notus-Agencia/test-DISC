/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · camadas que flutuam: aviso que some (toast), folhas (dialog nativo com foco preso e Esc) e
 * janela de confirmação. A folha empurra uma entrada no histórico: o botão "voltar" do celular fecha a folha em vez de sair da tela.
 */
(function (root) {
  'use strict';
  const doc = root.document, P = root.VSC_P, { $, $$, ic, esc } = P;

  /* ---------- aviso que some (fica por cima de folha aberta) ---------- */
  let TOAST = null;
  P.toast = function (msg, desfazer, icone) {
    if (TOAST) { try { TOAST.remove(); } catch (e) { /* já saiu */ } TOAST = null; }
    const el = doc.createElement('div'), pop = typeof el.showPopover === 'function';
    el.className = 'toast' + (desfazer ? '' : ' sem-acao');
    el.setAttribute('role', 'status');
    el.innerHTML = ic(icone || 'check') + '<span></span>' + (desfazer ? '<button class="toast-acao" type="button">Desfazer</button>' : '');
    el.querySelector('span').textContent = msg;
    if (pop) el.setAttribute('popover', 'manual');
    doc.body.appendChild(el);
    if (pop) { try { el.showPopover(); } catch (e) { /* sem popover: fica no corpo */ } }
    TOAST = el;
    let timer;
    const sair = () => {
      el.classList.add('saindo');
      setTimeout(() => { try { if (pop && el.matches(':popover-open')) el.hidePopover(); } catch (e) { /* já fechou */ } el.remove(); if (TOAST === el) TOAST = null; }, 100);
    };
    const contar = () => { clearTimeout(timer); timer = setTimeout(sair, desfazer ? 6000 : 3000); };
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', contar);
    if (desfazer) el.querySelector('button').addEventListener('click', () => { desfazer(); sair(); });
    contar();
  };

  /* ---------- folhas ---------- */
  let VOLTANDO = 0;
  const FILA_PUSH = [];
  function empurrar(dl) {
    if (VOLTANDO) { FILA_PUSH.push(dl); return; }
    try { root.history.pushState({ folha: dl.id }, ''); dl._pushed = true; } catch (e) { /* sem histórico */ }
  }
  P.abrirFolha = function (o) {
    const velho = doc.getElementById(o.id);
    let reusa = false;
    if (velho) { reusa = !!velho.open && !!velho._pushed; velho._semVolta = true; try { velho.close(); } catch (e) { /* já fechou */ } velho.remove(); }
    const dl = doc.createElement('dialog');
    dl.id = o.id;
    dl.setAttribute('aria-labelledby', o.id + '-t');
    if (o.janela) {
      dl.className = 'janela';
      dl.innerHTML = `<h2 id="${o.id}-t">${o.titulo}</h2>${o.corpo || ''}<div class="janela-acoes">${o.rodape || ''}</div>`;
    } else {
      dl.className = 'folha ' + (o.classe || '');
      dl.innerHTML = '<div class="folha-alca" aria-hidden="true"></div><div class="folha-topo">' +
        (o.voltar ? `<button class="btn-icone" type="button" data-acao="ap-voltar" aria-label="Voltar" hidden>${ic('voltar')}</button>` : '') +
        `<h2 id="${o.id}-t">${o.titulo}</h2><button class="btn-icone" type="button" data-fechar aria-label="Fechar">${ic('x')}</button></div>` +
        `<div class="folha-corpo">${o.corpo || ''}</div><div class="folha-rodape"${o.rodape ? '' : ' hidden'}>${o.rodape || ''}</div>`;
    }
    const quem = doc.activeElement, quemSel = quem && quem.getAttribute && quem.getAttribute('data-acao')
      ? '[data-acao="' + quem.getAttribute('data-acao') + '"]' + (quem.getAttribute('data-id') ? '[data-id="' + quem.getAttribute('data-id') + '"]' : '') : '';
    dl.addEventListener('cancel', (e) => { e.preventDefault(); P.fechar(dl); });
    dl._hash = root.location.hash;
    dl.addEventListener('close', () => {
      dl.remove();
      if (o.aoFechar) o.aoFechar();
      if (dl._pushed && !dl._semVolta && !dl._porPop && root.history.state && root.history.state.folha === dl.id) { VOLTANDO++; try { root.history.back(); } catch (e) { VOLTANDO--; } }
      // devolve o foco a quem abriu a folha; se a tela foi redesenhada nesse meio tempo, procura o botão equivalente
      const alvo = quem && doc.contains(quem) ? quem : quemSel ? doc.querySelector(quemSel) : null;
      if (alvo && alvo.focus) { try { alvo.focus({ preventScroll: true }); } catch (e) { /* sem foco */ } }
    });
    doc.body.appendChild(dl);
    ligarArraste(dl);
    dl.showModal();
    if (reusa) dl._pushed = true; else empurrar(dl);
    const f = o.foco && dl.querySelector(o.foco);
    if (f) f.focus(); else { const h = dl.querySelector('h2'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    return dl;
  };
  P.fechar = function (dl) {
    if (!dl || !dl.open) return;
    if (P.semMovimento()) { dl.close(); return; }
    dl.classList.add('saindo');
    setTimeout(() => { dl.classList.remove('saindo'); dl.style.transform = ''; if (dl.open) dl.close(); }, 100);
  };
  P.fecharTodas = () => $$('dialog[open]').forEach((d) => { try { d.close(); } catch (e) { /* já fechou */ } });
  root.addEventListener('popstate', () => {
    if (VOLTANDO > 0) {
      VOLTANDO--;
      if (!VOLTANDO) FILA_PUSH.splice(0).forEach((dl) => { if (dl.open && doc.contains(dl)) empurrar(dl); });
      return;
    }
    const ds = $$('dialog[open]');
    if (!ds.length) return;
    const topo = ds[ds.length - 1];
    topo._porPop = true;
    P.fechar(topo);
    if (root.location.hash !== topo._hash) ds.forEach((d) => { d._porPop = true; P.fechar(d); });
  });
  function ligarArraste(dl) {
    const h = dl.querySelector('.folha-topo');
    if (!h) return;
    let y0 = null, dy = 0;
    h.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || root.innerWidth > 760) return;
      y0 = e.clientY; dy = 0;
      try { h.setPointerCapture(e.pointerId); } catch (x) { /* sem captura */ }
    });
    h.addEventListener('pointermove', (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); dl.style.transform = 'translateY(' + Math.round(dy) + 'px)'; });
    h.addEventListener('pointerup', () => { if (y0 === null) return; y0 = null; if (dy > dl.offsetHeight * 0.25) P.fechar(dl); else dl.style.transform = ''; dy = 0; });
  }
  // janela de confirmação: titulo e botao em texto puro; texto já escapado por quem chama
  P.janela = function (titulo, texto, botao, cls, aoSim) {
    const dl = P.abrirFolha({ id: 'janela', janela: true, titulo: esc(titulo), corpo: `<p>${texto}</p>`,
      rodape: `<button class="btn fantasma" type="button" data-fechar>Cancelar</button><button class="btn ${cls || ''}" type="button" id="janela-sim">${esc(botao)}</button>` });
    $('#janela-sim', dl).addEventListener('click', () => { P.fechar(dl); aoSim(); });
  };
  P.copiar = function (texto) {
    try { if (root.navigator.clipboard && root.navigator.clipboard.writeText) { root.navigator.clipboard.writeText(texto).catch(() => {}); return; } } catch (e) { /* tenta o jeito antigo */ }
    try { const t = doc.createElement('textarea'); t.value = texto; t.className = 'sr'; doc.body.appendChild(t); t.select(); doc.execCommand('copy'); t.remove(); } catch (e) { /* sem cópia */ }
  };
})(typeof self !== 'undefined' ? self : this);
