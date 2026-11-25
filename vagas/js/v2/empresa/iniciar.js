/* ==========================================================================
   Site da empresa · partida: espera o adaptador, vê se a pessoa já tem conta e abre a tela da rota
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP, S = E.S;

  /* a faixa da demonstração só existe no modo prévia: no modo real nenhum rastro dela fica na página */
  function faixaDaDemonstracao() {
    var f = document.createElement('div');
    f.className = 'demo-faixa'; f.id = 'demo-faixa';
    f.innerHTML = '<div class="pagina">' + E.ic('info', 's14') + '<span>Demonstração com empresas e vagas fictícias</span>' +
      '<button type="button" id="btn-controles" data-acao="controles">Controles da prévia</button></div>';
    document.body.insertBefore(f, document.getElementById('topo'));
  }

  function partir() {
    if (E.previa) faixaDaDemonstracao();
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
