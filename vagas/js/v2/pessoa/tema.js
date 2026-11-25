/*
 * Vagas sem Caos v2 · tema e efeitos ANTES de pintar (carregado no <head>, sem defer: a página não pisca).
 * A preferência fica só neste aparelho, em 'vsc.prefs' (não é dado pessoal: não sai ao sair da conta).
 * data-theme: nenhum (segue o aparelho) | light | dark · data-fx="off": sem vidro nem movimento · data-vidro="off": só tira o vidro.
 */
(function () {
  'use strict';
  var d = document.documentElement, p = null;
  try { p = JSON.parse(localStorage.getItem('vsc.prefs')); } catch (e) { p = null; }
  if (!p || typeof p !== 'object') p = {};
  if (p.tema === 'light' || p.tema === 'dark') d.setAttribute('data-theme', p.tema);
  if (p.fx === 'off') d.setAttribute('data-fx', 'off');
  else if (p.fx !== 'on') {
    try {
      var n = navigator, c = n.connection;
      if ((n.deviceMemory && n.deviceMemory <= 4) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || (c && c.saveData)) d.setAttribute('data-vidro', 'off');
    } catch (e) { /* sem informações do aparelho: vidro ligado */ }
  }
})();
