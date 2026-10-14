/*
 * Vagas sem Caos — referencia.html?t=<token>: a EMPRESA abre o pedido de referência que uma pessoa mandou (link do WhatsApp ou do
 * e-mail) e preenche a referência. Desenho: docs/VAGAS-TELAS.md §3.9; contrato: VAGAS_API.conviteReferencia(token) e
 * oferecerReferencia({conviteToken, …}) (docs/VAGAS-SPEC.md §8.6). O formulário é o mesmo de empresa.html#referencia/dar
 * (empresa-referencias.js). Sem login: entrar.html?voltar=referencia.html?t=… e volta para cá.
 * Só empresa verificada (CNPJ conferido) dá referência. A pessoa decide se aceita; a empresa nunca fica sabendo da decisão (P2).
 */
(function (root) {
  'use strict';
  var U = root.VAGAS_UI;
  var A = root.VAGAS_API;
  var E = root.VAGAS_EMPRESA;
  var el = U.el;
  var ctx = E.ctx;
  function t(c, v) { return U.t(c, v); }

  function iniciar() {
    var doc = root.document;
    var raiz = doc.getElementById('conteudo');
    var pular = doc.querySelector('.pular');
    if (pular) pular.addEventListener('click', function (ev) { ev.preventDefault(); raiz.focus(); });
    var token = String(U.parametro('t') || '').trim().toLowerCase();
    function semPedido(texto) {
      U.vazio(raiz, { titulo: 'Pedido de referência', h1: true, texto: texto, botao: { rotulo: 'Ir para referências', href: 'empresa.html#referencias', id: 'vg-ref-ir-referencias' } });
      U.focarTitulo(raiz);
    }
    U.carregando(raiz);
    U.exigirConta({ tipo: 'empresa', raiz: raiz }).then(function (eu) {
      ctx.eu = eu;
      return E.carregar();
    }).then(function () {
      E.menu({ base: 'empresa.html', atual: 'referencias' });
      E.faixas();
      if (!ctx.empresa) {
        U.vazio(raiz, { titulo: 'Cadastre a empresa primeiro', h1: true, texto: 'Para dar referência, complete o cadastro da empresa.', botao: { rotulo: 'Completar o cadastro', href: 'empresa.html#cadastro' } });
        U.focarTitulo(raiz);
        return;
      }
      if (!/^[0-9a-f]{64}$/.test(token)) { semPedido('Convite inválido ou vencido. Peça um link novo à pessoa.'); return; }
      return A.conviteReferencia(token).then(function (r) {
        var cv = r.convite || {};
        // Pedido feito para uma empresa da plataforma: usa essa empresa (quem tem mais de uma conta de empresa).
        if (cv.empresaId && cv.empresaId !== ctx.empresa.id) {
          var outra = ctx.empresas.filter(function (x) { return x.id === cv.empresaId; })[0];
          if (outra) { ctx.empresa = outra; E.escolher(outra.id); E.menu({ base: 'empresa.html', atual: 'referencias' }); E.faixas(); }
        }
        var nome = (cv.pessoa && cv.pessoa.nome) || 'Pessoa';
        var cab = E.cabecalho({ sobre: 'Referências · Pedido de ' + nome, titulo: 'Dar referência profissional', idTitulo: 'vg-ref-pedido-titulo',
          texto: t('avisos.referencia_empresa_como_funciona') + (cv.expiraEm ? ' O pedido vale até ' + U.data(cv.expiraEm) + '.' : '') });
        if (!E.verificada() || E.suspensa()) {
          E.tela(raiz, [cab, el('p', { class: 'aviso', id: 'vg-ref-so-verificada', role: 'note' }, t('avisos.referencia_empresa_so_verificada'))]);
          U.focarTitulo(raiz);
          return;
        }
        E.tela(raiz, [cab, el('div', { class: 'vg-grade' }, [
          E.referencia.formulario({ modo: 'convite', token: token, pessoaNome: nome, rotuloPessoa: nome + ' (pediu a referência)', base: 'empresa.html',
            aoCancelar: function () { U._api.navegar('empresa.html#referencias'); } }),
          E.referencia.lateral()])]);
        U.focarTitulo(raiz);
      }, function (e) {
        if (e.sessaoExpirada || e.confirmar || e.conexao || e.suspensa) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { root.location.reload(); } }); return; }
        semPedido(e.message);
      });
    }, function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { root.location.reload(); } }); });
  }
  iniciar();
})(typeof self !== 'undefined' ? self : this);
