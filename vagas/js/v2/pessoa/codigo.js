/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · código de 6 números (entrar sem senha). O código vai por E-MAIL: o WhatsApp só será ligado depois
 * (VAGAS_CONFIG.CANAL_WHATSAPP). A conta nasce quando o código é confirmado (na 1ª candidatura, no 1º alerta ou em "Entrar").
 * Cada lugar que pede código usa um "contexto" k: 'ent' (tela Entrar), 'ap' (candidatura), 'al' (alerta), 'den' (denúncia), 'cf' (aviso de cidade).
 */
(function (root) {
  'use strict';
  const doc = root.document, P = root.VSC_P, { $, $$, esc, ic } = P;
  const ST = {}, CONTAGEM = {};
  const cod = (P.codigo = { ST, lembrar: true, dica: '' });

  cod.html = function (k) {
    let c = '';
    for (let i = 0; i < 6; i++) c += `<input id="cod-${k}-${i}" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="Número ${i + 1} de 6">`;
    return `<div class="codigo" id="codigo-${k}" data-codigo-caixa="${k}" role="group" aria-label="Código de 6 números">${c}</div>` +
      `<p class="erro-campo codigo-erro" id="codigo-${k}-erro" role="alert" hidden>${ic('erro')}<span></span></p>` +
      (cod.dica ? `<p class="codigo-exemplo">${ic('info')}<span>${esc(cod.dica)}</span></p>` : '') +
      `<div class="codigo-acoes"><button class="link" type="button" data-acao="reenviar" data-codigo="${k}" disabled>Reenviar código em <span class="num">30</span> s</button></div>`;
  };
  // pede o código ao servidor; devolve {destinoMascarado, reenviarEmSeg}
  cod.pedir = async function (k, destino, extra) {
    const r = await P.api('codigoPedir', { destino, canal: 'email' });
    cod.dica = r.dicaDemonstracao || '';
    ST[k] = Object.assign(ST[k] || {}, extra || {}, { destino, mascarado: r.destinoMascarado || P.emailEscondido(destino), ocupado: false });
    return r;
  };
  cod.contar = function (k, seg) {
    clearInterval(CONTAGEM[k]);
    const b = $('[data-acao="reenviar"][data-codigo="' + k + '"]');
    if (!b) return;
    let n = seg || 30;
    b.disabled = true; b.innerHTML = 'Reenviar código em <span class="num">' + n + '</span> s';
    CONTAGEM[k] = setInterval(() => {
      n--;
      const bb = $('[data-acao="reenviar"][data-codigo="' + k + '"]');
      if (!bb) { clearInterval(CONTAGEM[k]); return; }
      if (n <= 0) { clearInterval(CONTAGEM[k]); bb.disabled = false; bb.textContent = 'Reenviar código'; } else bb.innerHTML = 'Reenviar código em <span class="num">' + n + '</span> s';
    }, 1000);
  };
  cod.foco = (k) => setTimeout(() => { const c = $('#cod-' + k + '-0'); if (c) c.focus(); }, 30);
  function mostrarErro(k, msg) {
    const caixa = $('[data-codigo-caixa="' + k + '"]'), erro = $('#codigo-' + k + '-erro');
    if (!caixa || !erro) return;
    caixa.setAttribute('aria-invalid', 'true');
    erro.hidden = false;
    erro.querySelector('span').textContent = msg;
  }
  cod.erro = mostrarErro;
  cod.conferir = async function (k) {
    const caixa = $('[data-codigo-caixa="' + k + '"]'), st = ST[k];
    if (!caixa || !st || st.ocupado) return;
    const ins = $$('input', caixa), codigo = ins.map((x) => x.value).join('');
    if (codigo.length < 6) { mostrarErro(k, 'Digite os 6 números.'); const vz = ins.filter((x) => !x.value)[0]; if (vz) vz.focus(); return; }
    st.ocupado = true;
    ins.forEach((x) => { x.disabled = true; });
    const botao = $('[data-acao="conferir-codigo"][data-codigo="' + k + '"]');
    if (botao) botao.disabled = true;
    try {
      const r = await P.api('codigoConfirmar', { destino: st.destino, codigo, tipo: 'pessoa', nome: st.nome || undefined });
      clearInterval(CONTAGEM[k]);
      if (!cod.lembrar) { P.eu.guardar('curta', 1); try { root.sessionStorage.setItem('vsc.eu.viva', '1'); } catch (e) { /* sem sessionStorage */ } }
      try { await P.aposEntrar(); } catch (e) { P.toast(P.msgErro(e), null, 'sem-rede'); }
      st.ocupado = false;
      if (st.aoOk) await st.aoOk(r);
    } catch (e) {
      st.ocupado = false;
      ins.forEach((x) => { x.disabled = false; x.value = ''; });
      if (botao) botao.disabled = false;
      mostrarErro(k, P.msgErro(e, 'Código errado. Confira os 6 números.'));
      if (ins[0]) ins[0].focus();
    }
  };
  cod.reenviar = async function (k) {
    const st = ST[k];
    if (!st) return;
    try { const r = await cod.pedir(k, st.destino); cod.contar(k, r.reenviarEmSeg || 30); P.toast('Código reenviado para ' + st.mascarado + '.', null, 'email'); } catch (e) {
      if (e.resposta && e.resposta.reenviarEmSeg) cod.contar(k, e.resposta.reenviarEmSeg);
      mostrarErro(k, P.msgErro(e));
    }
  };

  doc.addEventListener('input', (e) => {
    const t = e.target, caixa = t.closest && t.closest('[data-codigo-caixa]');
    if (!caixa) return;
    const ins = $$('input', caixa), i = ins.indexOf(t), d = t.value.replace(/\D/g, '');
    if (d.length > 1) d.split('').slice(0, 6 - i).forEach((ch, j) => { ins[i + j].value = ch; }); else t.value = d;
    caixa.removeAttribute('aria-invalid');
    const erro = $('#codigo-' + caixa.getAttribute('data-codigo-caixa') + '-erro');
    if (erro) erro.hidden = true;
    const vazio = ins.filter((x) => !x.value)[0];
    if (vazio) { if (d) vazio.focus(); } else cod.conferir(caixa.getAttribute('data-codigo-caixa'));
  });
  doc.addEventListener('keydown', (e) => {
    const t = e.target, caixa = t.closest && t.closest('[data-codigo-caixa]');
    if (!caixa) return;
    const ins = $$('input', caixa), i = ins.indexOf(t);
    if (e.key === 'Backspace' && !t.value && i > 0) { ins[i - 1].value = ''; ins[i - 1].focus(); e.preventDefault(); } else if (e.key === 'ArrowLeft' && i > 0) ins[i - 1].focus();
    else if (e.key === 'ArrowRight' && i < 5) ins[i + 1].focus();
    else if (e.key === 'Enter') { e.preventDefault(); cod.conferir(caixa.getAttribute('data-codigo-caixa')); }
  });
  P.acoes['conferir-codigo'] = (b) => cod.conferir(b.getAttribute('data-codigo'));
  P.acoes.reenviar = (b) => cod.reenviar(b.getAttribute('data-codigo'));
})(typeof self !== 'undefined' ? self : this);
