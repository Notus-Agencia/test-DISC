/*
 * Vagas sem Caos — endereço certo. O GitHub Pages do DISC também serve a pasta vagas/ (disc.gestaosemcaos.com.br/vagas/…);
 * quem abrir por lá vai para https://vagas.gestaosemcaos.com.br com o MESMO caminho, parâmetros e âncora.
 * Carregue no <head> de todas as páginas do site de vagas, antes de qualquer outro script.
 *   VAGAS_ENDERECO.destino({hostname, pathname, search, hash}) -> URL de destino | '' (já está no lugar certo)
 */
(function (root) {
  'use strict';
  var ALVO = 'https://vagas.gestaosemcaos.com.br';
  // Onde o site de vagas mora de verdade (ou é testado): não redireciona.
  function proprio(host) {
    return host === 'vagas.gestaosemcaos.com.br' || host === 'localhost' || host === '127.0.0.1' || /\.pages\.dev$/.test(host);
  }
  function destino(loc) {
    var host = String((loc && loc.hostname) || '').toLowerCase();
    if (!host || proprio(host)) return '';
    var caminho = String(loc.pathname || '/');
    var m = /^(.*?)\/vagas(\/.*)?$/.exec(caminho);
    if (!m) return '';
    return ALVO + (m[2] || '/') + String(loc.search || '') + String(loc.hash || '');
  }
  var VAGAS_ENDERECO = { destino: destino, ALVO: ALVO };
  if (typeof module !== 'undefined' && module.exports) { module.exports = VAGAS_ENDERECO; return; }
  root.VAGAS_ENDERECO = VAGAS_ENDERECO;
  try {
    var d = destino(root.location);
    if (d) root.location.replace(d);
  } catch (e) { /* sem location: nada a fazer */ }
})(typeof self !== 'undefined' ? self : this);
