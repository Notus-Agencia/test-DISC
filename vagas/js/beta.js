/*
 * Gestão sem Caos Vagas — versão beta fechada com código de acesso (só enquanto CODIGO_SHA256 estiver preenchido).
 * No domínio oficial (*.gestaosemcaos.com.br) a página só aparece depois do código, que fica guardado neste navegador.
 * Em localhost, *.pages.dev e no artefato de prévia não tranca nada (testes e prévias seguem como antes).
 * É uma porta de vidro: segura curiosos e buscadores, não um cofre (o repositório é público). Por isso a beta só roda com
 * dados de exemplo (MODO 'previa' em js/config.js). Para abrir ao público: CODIGO_SHA256 = '' (ou tire o script das páginas).
 * Carregue no <head>, depois de js/endereco.js, com assets/vagas-beta.css (a CSP não deixa estilo inline).
 *   VAGAS_BETA.precisa(hostname, guardado, hash) -> true quando a página deve ficar trancada
 *   VAGAS_BETA.normalizar(codigo) -> o código como é comparado (sem espaços nas pontas, minúsculo)
 */
(function (root) {
  'use strict';
  // SHA-256 do código de acesso normalizado. Trocar o código: node -e "console.log(require('crypto').createHash('sha256').update('<código>').digest('hex'))"
  var CODIGO_SHA256 = 'a4eca3781faaf31a3f4d59a6552dabed5167a154b0caf2ed1bc0b73e1f237bd6';
  var CHAVE = 'gsc_vagas_beta';   // fora do prefixo vg.: o "Sair" do site não apaga
  var CLASSE = 'beta-trancado';

  function oficial(host) { return /(^|\.)gestaosemcaos\.com\.br$/i.test(String(host || '')); }
  function precisa(host, guardado, hash) { return !!hash && oficial(host) && guardado !== hash; }
  function normalizar(codigo) { return String(codigo == null ? '' : codigo).trim().toLowerCase(); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }

  var VAGAS_BETA = { precisa: precisa, normalizar: normalizar, CHAVE: CHAVE, CODIGO_SHA256: CODIGO_SHA256 };
  if (typeof module !== 'undefined' && module.exports) { module.exports = VAGAS_BETA; return; }
  root.VAGAS_BETA = VAGAS_BETA;

  var doc = root.document;
  var guardado = null;
  try { guardado = root.localStorage.getItem(CHAVE); } catch (e) { /* bloqueado: pede o código a cada visita */ }
  if (!doc || !precisa(root.location && root.location.hostname, guardado, CODIGO_SHA256)) return;
  // A conferência (crypto.subtle) só existe em página segura: quem abrir por http vai para a mesma página em https.
  if (root.location.protocol === 'http:') { root.location.replace('https:' + root.location.href.slice(5)); return; }
  doc.documentElement.classList.add(CLASSE);

  function el(tag, attrs, filhos) {
    var n = doc.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    (filhos || []).forEach(function (f) { n.appendChild(typeof f === 'string' ? doc.createTextNode(f) : f); });
    return n;
  }

  function montar() {
    var campo = el('input', { id: 'vg-beta-codigo', class: 'vg-beta__campo', type: 'password', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', required: 'required' });
    var erro = el('p', { class: 'vg-beta__erro', id: 'vg-beta-erro', role: 'alert' });
    var botao = el('button', { class: 'botao botao--principal vg-beta__botao', type: 'submit', id: 'vg-beta-entrar' }, ['Entrar']);
    var form = el('form', { class: 'vg-beta__form', novalidate: 'novalidate' }, [
      el('label', { for: 'vg-beta-codigo', class: 'vg-beta__rotulo' }, ['Código de acesso']), campo, erro, botao]);
    var caixa = el('main', { class: 'vg-beta', id: 'vg-beta' }, [el('div', { class: 'vg-beta__cartao' }, [
      el('img', { class: 'vg-beta__logo', src: 'comum/marca/gsc-logo.svg', alt: 'Gestão sem Caos', width: '199', height: '28' }),
      el('p', { class: 'vg-beta__selo' }, ['Versão beta']),
      el('h1', { class: 'vg-beta__titulo' }, ['Acesso com código']),
      el('p', { class: 'vg-beta__texto' }, ['Esta é uma versão de demonstração, com dados de exemplo. Para ver, digite o código que a Gestão sem Caos passou para você.']),
      form])]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      erro.textContent = '';
      var sutil = root.crypto && root.crypto.subtle;
      if (!sutil || !root.TextEncoder) { erro.textContent = 'Este navegador não consegue conferir o código. Tente outro navegador.'; return; }
      botao.disabled = true;
      sutil.digest('SHA-256', new root.TextEncoder().encode(normalizar(campo.value))).then(function (buf) {
        botao.disabled = false;
        if (hex(buf) !== CODIGO_SHA256) { erro.textContent = 'Código incorreto. Confira e tente de novo.'; campo.focus(); campo.select(); return; }
        try { root.localStorage.setItem(CHAVE, CODIGO_SHA256); } catch (e) { /* sem armazenamento: vale só nesta visita */ }
        caixa.parentNode.removeChild(caixa);
        doc.documentElement.classList.remove(CLASSE);
      }, function () { botao.disabled = false; erro.textContent = 'Não deu para conferir o código. Tente de novo.'; });
    });
    doc.body.insertBefore(caixa, doc.body.firstChild);
    campo.focus();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', montar);
  else montar();
})(typeof self !== 'undefined' ? self : this);
