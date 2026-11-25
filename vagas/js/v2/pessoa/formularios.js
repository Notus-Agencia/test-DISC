/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · peças de formulário usadas por mais de uma tela sob demanda (candidatar, filtros, eu):
 * campo de texto, seleção, opções de cidade e bairro, caixa de aceite dos Termos.
 */
(function (root) {
  'use strict';
  const P = root.VSC_P, { esc, ic } = P, D = P.D;
  const TEXTO_ACEITE = 'Li e aceito os Termos de uso e o Aviso de privacidade do Vagas sem Caos. Tenho 18 anos ou mais.';

  P.campo = function (id, rot, val, o) {
    o = o || {};
    const erro = o.erro ? `<p class="erro-campo" id="${id}-erro">${ic('erro')}<span>${o.erro}</span></p>` : '';
    return `<div class="campo"><label for="${id}">${rot}${o.opc ? ' <span class="opcional">(opcional)</span>' : ''}</label>` +
      `<input class="entrada" id="${id}" data-alvo="${o.alvo || 'ap'}" data-campo="${o.k}" value="${esc(val || '')}"${o.attrs || ''}${o.erro ? ` aria-invalid="true" aria-describedby="${id}-erro"` : ''}>` +
      (o.dica ? `<p class="dica${o.falta ? ' falta' : ''}">${o.dica}</p>` : '') + erro + '</div>';
  };
  P.selecao = function (id, rot, opcoes, o) {
    o = o || {};
    return `<div class="campo"><label for="${id}">${rot}</label><div class="selecao"><select class="entrada" id="${id}" data-alvo="${o.alvo || 'ap'}" data-campo="${o.k}"${o.erro ? ` aria-invalid="true" aria-describedby="${id}-erro"` : ''}>${opcoes}</select>${ic('chevron')}</div>` +
      (o.erro ? `<p class="erro-campo" id="${id}-erro">${ic('erro')}<span>${o.erro}</span></p>` : '') + '</div>';
  };
  P.opcoesCidade = (sel) => D.cidades.map((c) => `<option value="${esc(c.id)}"${sel === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  P.bairrosDe = (cid) => { const c = D.CID[cid]; if (!c) return []; const b = c.bairros || []; return b.indexOf('Zona rural') >= 0 || !b.length ? b : b.concat(['Zona rural']); };
  P.opcoesBairro = (cid, sel) => '<option value="">Escolha</option>' + P.bairrosDe(cid).map((b) => `<option${sel === b ? ' selected' : ''}>${esc(b)}</option>`).join('');
  P.linhaAceite = (id, alvo, marcado, erro) =>
    `<div class="aceite-bloco"><label class="aceite" for="${id}"><input type="checkbox" id="${id}" data-alvo="${alvo}" data-campo="aceite"${marcado ? ' checked' : ''}${erro ? ` aria-invalid="true" aria-describedby="${id}-erro"` : ''}><span>${TEXTO_ACEITE}</span></label>` +
    (erro ? `<p class="erro-campo" id="${id}-erro">${ic('erro')}<span>${erro}</span></p>` : '') +
    '<p class="aceite-links"><a class="link" href="termos.html" target="_blank" rel="noopener">Ler os Termos de uso</a><a class="link" href="privacidade.html" target="_blank" rel="noopener">Ler o Aviso de privacidade</a></p></div>';

})(typeof self !== 'undefined' ? self : this);
