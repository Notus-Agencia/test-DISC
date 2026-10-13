/*
 * Vagas sem Caos — index.html: escolha da cidade (lembrada no aparelho em 'vg.cidade') -> lista da cidade (cidade.html?cidade=).
 *   index.html               cidade lembrada -> vai direto para a lista; uma cidade só -> vai direto; senão mostra a escolha
 *   index.html?escolher=1    sempre mostra a escolha (pílula da cidade nas outras telas)
 * Sem cidade ativa (todas em lista de espera ou nenhuma): mantém "Estamos preparando o site" e oferece a lista de espera.
 * Nenhum nome de cidade fixo: tudo vem de VAGAS_API.cidades().
 */
(function (root) {
  'use strict';
  var U = root.VAGAS_UI;
  var A = root.VAGAS_API;
  var el = U.el;
  var lista = root.document.getElementById('vg-cidades');
  var escolher = U.parametro('escolher') === '1';

  function irPara(slug) { U._api.navegar('cidade.html?cidade=' + encodeURIComponent(slug)); }
  function rotulo(c) {
    if (c.status === 'lista_espera') return 'Avise-me';
    if (c.status === 'pausada') return 'Em pausa';
    return 'Ver vagas';
  }
  function mostrar(cidades) {
    var ativas = cidades.filter(function (c) { return c.status === 'ativa'; });
    var principais = cidades.filter(function (c) { return !c.praca; });   // cidades do entorno aparecem dentro da principal
    var preparando = root.document.getElementById('vg-preparando');
    if (preparando) preparando.hidden = ativas.length > 0;
    if (!principais.length) { U.trocar(lista, null); return; }
    U.trocar(lista, [
      el('h2', { class: 'caixa__titulo', id: 'vg-cidades-titulo' }, ativas.length ? 'Escolha a sua cidade' : 'Avise-me quando abrir'),
      el('ul', { class: 'vg-linhas', 'aria-labelledby': 'vg-cidades-titulo' }, principais.map(function (c) {
        var vizinhas = cidades.filter(function (x) { return x.praca === c.slug; }).map(function (x) { return x.nome; });
        return el('li', {}, el('a', { class: 'vg-linha', href: 'cidade.html?cidade=' + encodeURIComponent(c.slug), id: 'vg-cidade-' + c.slug,
          data: { cidade: c.slug, status: c.status }, onclick: function () { if (c.status === 'ativa') U.lembrarCidade(c.slug); } }, [
          el('span', { class: 'vg-iniciais', 'aria-hidden': 'true' }, U.icone('pin')),
          el('span', {}, [el('span', { class: 'vg-linha__titulo' }, c.nome + (c.uf ? ' (' + c.uf + ')' : '')),
            el('span', { class: 'vg-linha__sub' }, c.status === 'lista_espera' ? 'Ainda não chegamos: entre na lista de espera'
              : c.status === 'pausada' ? 'Vagas em pausa por enquanto' : vizinhas.length ? 'e região: ' + vizinhas.join(', ') : 'Vagas no ar')]),
          el('span', { class: 'vg-status vg-status--' + (c.status === 'ativa' ? 'publicado' : c.status === 'pausada' ? 'pausada' : 'revisao') }, rotulo(c))
        ]));
      }))
    ]);
  }
  function carregar() {
    U.carregando(lista);
    A.cidades().then(function (r) {
      var cidades = (r.cidades || []).filter(function (c) { return c.status === 'ativa' || c.status === 'lista_espera' || c.status === 'pausada'; });
      var lembrada = U.cidadeLembrada();
      var achou = cidades.filter(function (c) { return c.slug === lembrada; })[0];
      if (!escolher && achou) { irPara(achou.slug); return; }
      // a lembrada sumiu da lista pública (cidade pausada não aparece nela): a tela da cidade diz se está pausada
      if (!escolher && lembrada) { irPara(lembrada); return; }
      var principais = cidades.filter(function (c) { return !c.praca; });
      if (!escolher && principais.length === 1 && principais[0].status === 'ativa') { irPara(principais[0].slug); return; }
      mostrar(cidades);
    }, function (e) { U.tratarErro(e, { raiz: lista, aoTentar: carregar }); });
  }
  carregar();
})(typeof self !== 'undefined' ? self : this);
