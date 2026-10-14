/*
 * Vagas sem Caos — conferência pública do selo (selo.html?codigo=K7M2QX9A), para qualquer pessoa (a empresa que recebeu o
 * código, por exemplo). docs/VAGAS-TELAS.md §2.8; RPC vagas_selo_publico (docs/VAGAS-TESTES.md). UMD: window.VAGAS_SELO /
 * module.exports (as funções puras são testadas no Node).
 *
 * Nunca mostra nome, e-mail, cidade ou qualquer dado da pessoa: o banco não manda e a tela só lê os campos do selo. Código
 * inexistente, mal formado ou consulta bloqueada pelo limite por origem: a mensagem do contrato ("Selo não encontrado. Confira o
 * código."), igual nos três casos (a tela não ajuda a adivinhar códigos).
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var T = nodeJs ? require('./testes.js') : root.VAGAS_TESTES;
  var U = nodeJs ? require('./ui.js') : root.VAGAS_UI;

  var TXT = {
    FORMATO: 'O código tem 8 letras e números, como Q8V3N2KD',                                                 // VAGAS-TELAS §2.8
    EMITIDO: 'Emitido pelo Vagas sem Caos, uma ferramenta da Gestão sem Caos. O selo pertence a uma pessoa cadastrada; o nome dela só aparece para quem ela autorizou.',
    EMPRESA: 'Veja quem já provou o básico da função: o selo mostra teste, data e nota. A decisão de contratar continua sendo sua.'   // padroes §6
  };

  // '' quando o código está no formato (8 letras e números do alfabeto do selo, com ou sem hífen/espaço); senão a mensagem do campo.
  function validarCodigo(v) { return T.normalizarCodigo(v) ? '' : TXT.FORMATO; }
  // Título e ícone do resultado pela situação do selo (vencido nunca vira "reprovado": só a data).
  function situacao(selo, data) {
    var s = selo || {};
    var d = data || function (x) { return String(x || ''); };
    if (s.situacao === 'revogado') return { tipo: 'revogado', icone: 'alerta', titulo: 'Selo cancelado' };
    if (s.situacao === 'vencido') return { tipo: 'vencido', icone: 'relogio', titulo: 'Selo vencido em ' + d(s.validoAte) };
    return { tipo: 'valido', icone: 'check', titulo: 'Selo válido' };
  }
  var PURO = { TXT: TXT, validarCodigo: validarCodigo, situacao: situacao };
  if (nodeJs) { module.exports = PURO; return; }
  root.VAGAS_SELO = PURO;

  // ================================================================================================================= navegador
  var doc = root.document;
  var A = root.VAGAS_API;
  var P = root.VAGAS_PECAS;
  var el = U.el;
  var app = doc.getElementById('app');
  if (!app) return;

  var campo = el('input', { id: 'vg-conferir-codigo', class: 'entrada codigo', type: 'text', name: 'codigo', maxlength: '12', autocomplete: 'off',
    autocapitalize: 'characters', spellcheck: 'false', inputmode: 'text', 'aria-describedby': 'vg-conferir-ajuda' });
  var enviar = el('button', { type: 'submit', class: 'botao botao--principal botao--grande', id: 'vg-conferir-enviar' }, 'Conferir');
  var resultado = el('div', { id: 'vg-conferir-resultado', 'aria-live': 'polite' });
  // Maiúsculas automáticas enquanto a pessoa digita (o código não tem minúsculas).
  campo.addEventListener('input', function () {
    var pos = campo.selectionStart;
    campo.value = campo.value.toUpperCase();
    try { campo.setSelectionRange(pos, pos); } catch (e) { /* campo sem seleção */ }
    U.limparErroCampo(campo);
  });

  function mostrarSelo(selo) {
    var s = situacao(selo, U.data);
    U.trocar(resultado, [
      el('div', { class: 'vg-conferir', id: 'vg-conferir-situacao', data: { situacao: s.tipo } }, [
        el('span', { class: s.tipo === 'valido' ? 'vg-conferir__ok' : 'vg-iniciais' }, U.icone(s.icone)),
        el('h2', { class: 't-titulo seminegrito', id: 'vg-conferir-titulo', tabindex: '-1' }, s.titulo)]),
      el('div', { id: 'vg-selo' }, P.selo(selo)),
      el('p', { class: 't-nota texto-suave', id: 'vg-conferir-emitido' }, TXT.EMITIDO)
    ]);
    var titulo = doc.getElementById('vg-conferir-titulo');
    if (titulo) titulo.focus();
  }
  function mostrarErro(msg) {
    U.trocar(resultado, el('div', { class: 'vg-conferir', id: 'vg-conferir-situacao', data: { situacao: 'inexistente' } }, [
      el('span', { class: 'vg-iniciais' }, U.icone('alerta')),
      el('p', { class: 't-titulo seminegrito', id: 'vg-conferir-erro', role: 'alert' }, msg)]));
  }
  function conferir() {
    var erro = validarCodigo(campo.value);
    if (erro) { U.limpar(resultado); U.erroCampo(campo, erro); campo.focus(); return; }
    var codigo = T.normalizarCodigo(campo.value);
    campo.value = T.formatarCodigo(codigo);
    // O endereço passa a ter o código (dá para mandar o link adiante).
    try { root.history.replaceState(null, '', root.location.pathname + '?codigo=' + codigo); } catch (e) { /* sem history */ }
    U.ocupado(enviar, true, 'Conferindo…');
    U.carregando(resultado);
    A.seloPublico(codigo).then(function (r) {
      U.ocupado(enviar, false);
      mostrarSelo(r.selo);
    }, function (e) {
      U.ocupado(enviar, false);
      if (e.conexao) { U.tratarErro(e, { raiz: resultado, aoTentar: conferir }); return; }
      mostrarErro(e.message);
    });
  }

  function iniciar() {
    U.topo({});
    var form = el('form', { class: 'formulario', id: 'vg-form-conferir', novalidate: 'novalidate', onsubmit: function (ev) { ev.preventDefault(); conferir(); } }, [
      el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-conferir-codigo' }, 'Código do selo'),
        el('span', { class: 'campo__ajuda', id: 'vg-conferir-ajuda' }, 'São 8 letras e números. Pode ser com ou sem hífen.'), campo]),
      el('div', { class: 'acoes' }, enviar)
    ]);
    U.trocar(app, el('section', { class: 'caixa surgir', id: 'vg-conferir', 'aria-labelledby': 'vg-conferir-h1' }, [
      el('p', { class: 'sobretitulo' }, 'Habilidade testada'),
      el('h1', { class: 'titulo-pagina', id: 'vg-conferir-h1', tabindex: '-1' }, 'Conferir um selo'),
      form,
      resultado,
      el('p', { class: 'aviso', id: 'vg-conferir-aviso' }, U.t('avisos.selo_empresa')),
      el('p', { class: 't-nota texto-suave', id: 'vg-conferir-empresa' }, TXT.EMPRESA)
    ]));
    var inicial = U.parametro('codigo');
    if (inicial) { campo.value = String(inicial).toUpperCase().slice(0, 12); conferir(); } else U.focarTitulo(app);
  }
  iniciar();
})(typeof self !== 'undefined' ? self : this);
