/*
 * Vagas sem Caos — folha de filtros da lista pública (docs/VAGAS-TELAS.md §2.1a, mockup pessoa-filtros). Carregada por cidade.js só
 * quando a pessoa toca em "Filtrar" (a primeira visita da lista fica dentro dos 100 KB).
 *   VAGAS_CIDADE_FILTROS.abrir({filtros, cidade, vizinhas, logado, slug, botao, filtroDaApi, FILTROS, aplicar(novosFiltros)})
 * Só atributos da VAGA (P3): áreas (24), tipo de contrato, turno, salário a partir de, zona, entorno, sem experiência, para hoje.
 * "Ver N vagas" conta com VAGAS_API.anuncios({…, somenteTotal: true}) a cada mudança.
 */
(function (root) {
  'use strict';
  var AREAS_VISIVEIS = 6;
  function lerSalario(t) { return root.VAGAS_CIDADE.lerSalario(t); }
  function abrir(ctx) {
    var U = root.VAGAS_UI;
    var A = root.VAGAS_API;
    var P = root.VAGAS_PECAS;
    var R = root.VAGAS_REGRAS;
    var el = U.el;
      var rascunho = JSON.parse(JSON.stringify(ctx.filtros));
      delete rascunho.areasTodas;
      var aplicarBotao = el('button', { type: 'button', class: 'botao botao--laranja botao--grande', id: 'vg-filtros-aplicar' }, 'Ver vagas');
      var todas = false;
      function chipsDe(id, lista, chave, unico) {
        return el('div', { class: 'vg-opcoes', id: id, role: 'group' }, lista.map(function (o, i) {
          var marcado = unico ? (rascunho[chave] || '') === o.id : (rascunho[chave] || []).indexOf(o.id) >= 0;
          return el('button', { type: 'button', class: 'vg-chip', id: id.replace(/s$/, '') + '-' + (o.id || 'todas'), 'aria-pressed': marcado ? 'true' : 'false', data: { valor: o.id },
            hidden: chave === 'areas' && !todas && i >= AREAS_VISIVEIS && !marcado,
            onclick: function (ev) {
              var b = ev.currentTarget;
              if (unico) { rascunho[chave] = o.id || undefined; Array.prototype.forEach.call(b.parentNode.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); }
              else {
                var l = rascunho[chave] || [];
                rascunho[chave] = b.getAttribute('aria-pressed') === 'true' ? l.filter(function (x) { return x !== o.id; }) : l.concat(o.id);
                b.setAttribute('aria-pressed', rascunho[chave].indexOf(o.id) >= 0 ? 'true' : 'false');
              }
              contar();
            } }, o.rotulo);
        }));
      }
      var areas = chipsDe('vg-filtro-areas', R.AREAS, 'areas');
      var verTodas = el('button', { type: 'button', class: 'botao botao--link', id: 'vg-filtro-areas-todas', 'aria-expanded': 'false', 'aria-controls': 'vg-filtro-areas', onclick: function () {
        todas = !todas;
        Array.prototype.forEach.call(areas.children, function (b, i) { if (i >= AREAS_VISIVEIS) b.hidden = !todas && b.getAttribute('aria-pressed') !== 'true'; });
        verTodas.setAttribute('aria-expanded', todas ? 'true' : 'false');
        verTodas.textContent = todas ? 'Mostrar menos áreas' : 'Ver todas as 24 áreas';
      } }, 'Ver todas as 24 áreas');
      var salario = el('input', { id: 'vg-filtro-salario', class: 'entrada', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'Ex.: 1600',
        value: rascunho.salarioMin ? String(rascunho.salarioMin / 100) : '', 'aria-describedby': 'vg-filtro-salario-ajuda' });
      salario.addEventListener('input', U.aoParar(function () {
        var v = lerSalario(salario.value);
        if (v !== v) { U.erroCampo(salario, 'Digite só o número, como 1600'); return; }
        U.limparErroCampo(salario);
        rascunho.salarioMin = v || undefined;
        contar();
      }, 300));
      var zonas = [{ id: '', rotulo: 'Todas' }].concat((ctx.cidade.zonas || []).map(function (z) { return { id: z.slug, rotulo: z.nome }; }));
      var viz = ctx.vizinhas;
      function marcar(id, chave, texto) {
        var c = el('input', { type: 'checkbox', id: id, checked: !!rascunho[chave], onchange: function () { rascunho[chave] = c.checked || undefined; contar(); } });
        return el('label', { class: 'marcar' }, [c, el('span', { class: 't-rotulo' }, texto)]);
      }
      var form = el('form', { id: 'vg-form-filtros', novalidate: true, onsubmit: function (ev) { ev.preventDefault(); } }, [
        el('fieldset', { class: 'vg-folha__grupo' }, [el('legend', { class: 'campo__rotulo' }, ['Área ', el('span', { class: 'obrigatorio' }, '(pode marcar várias)')]), areas, verTodas]),
        el('fieldset', { class: 'vg-folha__grupo' }, [el('legend', { class: 'campo__rotulo' }, 'Tipo de contrato'), chipsDe('vg-filtro-modalidade', R.MODALIDADES.map(function (m) { return { id: m.id, rotulo: P.modalidadeCurta(m.id) }; }), 'modalidade')]),
        el('fieldset', { class: 'vg-folha__grupo' }, [el('legend', { class: 'campo__rotulo' }, 'Turno'), chipsDe('vg-filtro-turno', R.TURNOS_VAGA, 'turno')]),
        el('div', { class: 'vg-folha__grupo campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-filtro-salario' }, 'Salário a partir de (R$)'), salario,
          el('span', { class: 'campo__ajuda', id: 'vg-filtro-salario-ajuda' }, 'Vagas com faixa contam pelo valor mais alto. Diária: valor do dia × 22.')]),
        el('fieldset', { class: 'vg-folha__grupo' }, [el('legend', { class: 'campo__rotulo' }, 'Zona'), chipsDe('vg-filtro-zona', zonas, 'zona', true),
          viz.length ? marcar('vg-filtro-entorno', 'entorno', 'Incluir ' + viz.map(function (c) { return c.nome; }).join(' e ')) : null]),
        el('fieldset', { class: 'vg-folha__grupo' }, [el('legend', { class: 'campo__rotulo' }, 'Mais'), el('div', { class: 'vg-checks' }, [
          marcar('vg-filtro-sem-experiencia', 'semExperiencia', 'Aceita sem experiência'),
          marcar('vg-filtro-hoje', 'paraHoje', 'Para hoje (diárias e bicos de hoje e amanhã)')])])
      ]);
      var limpar = el('button', { type: 'button', class: 'botao botao--link', id: 'vg-filtros-limpar' }, 'Limpar tudo');
      var fechar = el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-filtros-fechar' }, 'Fechar');
      ctx.botao.setAttribute('aria-expanded', 'true');
      var f = U.folha({ id: 'vg-filtros', titulo: 'Filtrar vagas', corpo: form, acaoCabecalho: limpar, foco: '#vg-filtros-titulo',
        barra: U.barra({ id: 'vg-barra-filtros', dica: 'Os filtros ficam salvos neste celular.', botoes: [fechar, aplicarBotao] }),
        aoFechar: function () { ctx.botao.setAttribute('aria-expanded', 'false'); } });
      var ultimo = 0;
      var contar = U.aoParar(function () {
        var n = ++ultimo;
        A.anuncios(ctx.filtroDaApi(ctx.slug, rascunho.areas && rascunho.areas.length ? rascunho : Object.assign({}, rascunho, ctx.logado ? { areasTodas: true } : {}), { somenteTotal: true }))
          .then(function (r) { if (n === ultimo) aplicarBotao.textContent = r.total === 1 ? 'Ver 1 vaga' : 'Ver ' + r.total + ' vagas'; },
            function () { if (n === ultimo) aplicarBotao.textContent = 'Ver vagas'; });
      }, 300);
      contar();
      fechar.addEventListener('click', function () { f.fechar('fechar'); });
      limpar.addEventListener('click', function () {
        rascunho = {};
        salario.value = '';
        U.limparErroCampo(salario);
        Array.prototype.forEach.call(form.querySelectorAll('.vg-chip'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-valor') === '' ? 'true' : 'false'); });
        Array.prototype.forEach.call(form.querySelectorAll('input[type="checkbox"]'), function (c) { c.checked = false; });
        contar();
      });
      aplicarBotao.addEventListener('click', function () {
        if (salario.getAttribute('aria-invalid') === 'true') { salario.focus(); return; }
        var novos = {};
        ctx.FILTROS.forEach(function (k) { if (k !== 'busca' && rascunho[k] !== undefined && !(Array.isArray(rascunho[k]) && !rascunho[k].length)) novos[k] = rascunho[k]; });
        if (ctx.filtros.busca) novos.busca = ctx.filtros.busca;
        if (ctx.logado && !(novos.areas || []).length) novos.areasTodas = true;
        f.fechar('aplicar');
        ctx.aplicar(novos);
      });
  }
  root.VAGAS_CIDADE_FILTROS = { abrir: abrir };
})(typeof self !== 'undefined' ? self : this);
