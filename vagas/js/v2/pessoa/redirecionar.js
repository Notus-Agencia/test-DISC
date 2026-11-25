/*
 * Vagas sem Caos v2 · redirecionador das telas ANTIGAS da pessoa (cidade.html, vaga.html, entrar.html, eu.html, emprego.html).
 * Os endereços antigos (divulgados, salvos em favoritos, links de e-mail) continuam funcionando e caem na tela nova (index.html#/...).
 * Roda no navegador (troca o endereço na hora) e no Node (testes: VSC_REDIRECIONAR.destino).
 */
(function (root) {
  'use strict';
  const LIMPA = (s, max) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, max || 64);

  // arquivo: 'cidade.html' | 'vaga.html' | 'entrar.html' | 'eu.html' | 'emprego.html'; busca: '?a=b'; hash: '#...'
  function destino(arquivo, busca, hash) {
    const q = new URLSearchParams(busca || ''), h = String(hash || '').replace(/^#\/?/, '');
    if (arquivo === 'cidade.html') {
      const vaga = LIMPA(q.get('vaga'));
      if (vaga) return 'index.html#/vaga/' + vaga;
      const cidade = LIMPA(q.get('cidade'), 60).toLowerCase();
      return 'index.html' + (cidade ? '?cidade=' + cidade : '') + '#/vagas';
    }
    if (arquivo === 'vaga.html') {
      const c = LIMPA(q.get('c') || q.get('codigo'));
      return 'index.html#/' + (c ? 'vaga/' + c : 'vagas');
    }
    if (arquivo === 'entrar.html') return 'index.html#/entrar';
    if (arquivo === 'eu.html') {
      if (/^curriculo/i.test(h)) return 'index.html#/curriculo';
      if (/^(candidaturas|candidatura)/i.test(h)) return 'index.html#/candidaturas';
      if (/^alertas/i.test(h)) return 'index.html#/alertas';
      return 'index.html#/eu';
    }
    if (arquivo === 'emprego.html') return 'index.html#/como-funciona';
    return 'index.html';
  }
  const API = { destino };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  root.VSC_REDIRECIONAR = API;
  const arq = (root.location.pathname.split('/').pop() || '').replace(/\/$/, '');
  root.location.replace(destino(/\.html$/.test(arq) ? arq : arq + '.html', root.location.search, root.location.hash));
})(typeof self !== 'undefined' ? self : this);
