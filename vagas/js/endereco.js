/*
 * Vagas sem Caos — endereço certo. O GitHub Pages do DISC também serve a pasta vagas/ (disc.gestaosemcaos.com.br/vagas/…);
 * quem abrir por lá vai para https://vagas.gestaosemcaos.com.br com o MESMO caminho, parâmetros e âncora.
 * Carregue no <head> de todas as páginas do site de vagas, antes de qualquer outro script.
 *   VAGAS_ENDERECO.destino({hostname, pathname, search, hash}[, ligado]) -> URL de destino | '' (já está no lugar certo)
 * LIGADO = false enquanto vagas.gestaosemcaos.com.br não está no ar: a versão beta fica em disc.gestaosemcaos.com.br/vagas/
 * (sem isso, quem abrisse a beta iria para um endereço que ainda não existe). Ligue no dia em que o domínio próprio abrir.
 */
(function (root) {
  'use strict';
  var ALVO = 'https://vagas.gestaosemcaos.com.br';
  var LIGADO = false;
  // Onde o site de vagas mora de verdade (ou é testado): não redireciona.
  function proprio(host) {
    return host === 'vagas.gestaosemcaos.com.br' || host === 'localhost' || host === '127.0.0.1' || /\.pages\.dev$/.test(host);
  }
  function destino(loc, ligado) {
    if (!(ligado === undefined ? LIGADO : ligado)) return '';
    var host = String((loc && loc.hostname) || '').toLowerCase();
    if (!host || proprio(host)) return '';
    var caminho = String(loc.pathname || '/');
    var m = /^(.*?)\/vagas(\/.*)?$/.exec(caminho);
    if (!m) return '';
    return ALVO + (m[2] || '/') + String(loc.search || '') + String(loc.hash || '');
  }
  var VAGAS_ENDERECO = { destino: destino, ALVO: ALVO, LIGADO: LIGADO };
  if (typeof module !== 'undefined' && module.exports) { module.exports = VAGAS_ENDERECO; return; }
  root.VAGAS_ENDERECO = VAGAS_ENDERECO;
  try {
    var d = destino(root.location);
    if (d) root.location.replace(d);
  } catch (e) { /* sem location: nada a fazer */ }
})(typeof self !== 'undefined' ? self : this);
