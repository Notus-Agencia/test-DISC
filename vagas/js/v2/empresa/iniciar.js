/* ==========================================================================
   Site da empresa · partida: espera o adaptador, vê se a pessoa já tem conta e abre a tela da rota
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP, S = E.S;

  function partir() {
    if (E.previa) { var f = document.getElementById('demo-faixa'); if (f) f.hidden = false; }
    var antes = E.API.pronto.then(function () { return E.carregarConta(); }).catch(function (e) {
      if (e && e.sessaoExpirada) { E.zerarConta(); return; }
      E.zerarConta();
      E.avisoDeConexao = E.msgErro(e);
    });
    antes.then(function () {
      var convite = /[?&]convite=([0-9a-f]{64})/i.exec(location.search);
      if (convite && !location.hash) { location.replace(location.pathname + '#/entrar?convite=' + convite[1]); return; }
      if (!location.hash || location.hash === '#') { location.replace(location.pathname + location.search + (S.empresa ? '#/inicio' : '#/anunciar')); }
      E.render();
      if (E.avisoDeConexao) E.toast(E.avisoDeConexao, null, null, 'erro');
      E.pronto = true;
      document.documentElement.setAttribute('data-empresa-pronta', '1');
    });
  }
  partir();
})();
