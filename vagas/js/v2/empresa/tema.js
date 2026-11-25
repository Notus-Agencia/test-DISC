/* Tema e efeitos da página da empresa. Roda no <head>, antes da pintura, para a tela já nascer no tema certo (sem piscar).
   Preferências só neste aparelho: chave "vsc.prefs.v1" = {tema: 'auto'|'light'|'dark', fx: 'auto'|'on'|'off'}. */
(function () {
  'use strict';
  var d = document.documentElement, p = null;
  try { p = JSON.parse(localStorage.getItem('vsc.prefs.v1')); } catch (e) { p = null; }
  p = p || {};
  if (p.tema === 'light' || p.tema === 'dark') d.setAttribute('data-theme', p.tema);
  var n = navigator, c = n.connection;
  var fraco = (n.deviceMemory && n.deviceMemory <= 4) || (n.hardwareConcurrency && n.hardwareConcurrency <= 4) || !!(c && c.saveData);
  if (p.fx === 'off') d.setAttribute('data-fx', 'off');
  else if (p.fx !== 'on' && fraco) d.setAttribute('data-vidro', 'off');
  d.setAttribute('lang', 'pt-BR');
})();
