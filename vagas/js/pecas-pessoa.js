/*
 * Vagas sem Caos — peças com dados da PESSOA (acrescenta ao VAGAS_PECAS de pecas.js; carregue logo depois dele).
 * Cada peça lê SÓ os campos que pode mostrar: o cartão cego nunca lê nome, foto, idade ou contato, mesmo que venham no objeto.
 *
 *   selo(selo, {mini?, destaque?, rotulo?}) -> nota COM a margem ("Nota N de 100 (15 questões; margem de cerca de ±10 pontos)"),
 *     "online, sem supervisão", data, validade e código; nunca "aprovado"; vencido = "Vencido em …"; revogado = sem nota
 *   cartaoCego(cartao, {ordem?, chegouEm?, status?, acoes?, previa?, decidido?, candidaturaId?, id?, idReferencia?}) -> <li>
 *     (zona, funções, experiência, escolaridade, turnos, CNH, pretensão, cursos, selos como informação; referência só
 *      "Referência de empresa verificada: sim" — veto P1; sem nome, foto, idade, contato, ordem por nota)
 *   cartaReferencia(referencia, {pendente?, acoes?, id?}) -> carta (sem estrelas, sem média; pontos fortes só da lista fechada)
 *   fotoMini(url, {grande?, id?, nome?}) -> foto pequena (SÓ depois do Combinou, para a empresa daquela candidatura) ou iniciais
 *   tempoDeMeses(m) -> '1 ano e 3 meses'
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var P = nodeJs ? require('./pecas.js') : root.VAGAS_PECAS;
  var U = nodeJs ? require('./ui.js') : root.VAGAS_UI;
  var R = nodeJs ? require('./regras.js') : root.VAGAS_REGRAS;
  var el = U.el;
  var rotulo = P.rotulo;
  var iniciais = P.iniciais;
  var verificada = P.verificada;
  var status = P.status;
  // Rótulo do selo: padroes.md §5.1 ("Habilidade testada · online, sem supervisão").
  var SELO_ROTULO = 'Habilidade testada';
  // Cartão cego: decisão P1 (só isto; sem contagem, pontos fortes, texto nem nome da empresa).
  var REF_SIM = 'Referência de empresa verificada: sim';

  function selo(s, op) {
    s = s || {};
    op = op || {};
    var revogado = s.situacao === 'revogado' || s.nota == null;
    var vencido = !revogado && s.situacao === 'vencido';
    var codigo = String(s.codigo || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    var linha = [];
    if (s.data) linha.push(el('span', {}, 'Feito em ' + U.data(s.data)));
    if (vencido && s.validoAte) linha.push(el('span', {}, 'Vencido em ' + U.data(s.validoAte)));
    else if (!revogado && s.validoAte) linha.push(el('span', {}, 'Vale até ' + U.data(s.validoAte)));
    linha.push(el('span', {}, s.supervisao === 'presencial' ? 'presencial, documento conferido' : (U.t('avisos.selo_supervisao') || 'online, sem supervisão')));
    if (codigo.length === 8) linha.push(el('span', { class: 'vg-selo__codigo' }, codigo.slice(0, 4) + '-' + codigo.slice(4)));
    return el('div', { class: 'vg-selo' + (op.mini ? ' vg-selo--mini' : '') + (op.destaque ? ' vg-selo--destaque' : ''), data: { codigo: codigo || null } }, [
      el('div', { class: 'vg-selo__topo' }, [el('span', { class: 'vg-selo__icone' }, U.icone('selo')),
        el('div', {}, [el('p', { class: 'vg-selo__rotulo' }, op.rotulo || SELO_ROTULO), el('p', { class: 'vg-selo__nome' }, s.nome || rotulo(R.TESTES_SELO, s.teste))])]),
      revogado ? el('p', { class: 'vg-selo__nota' }, 'Sem validade.')
        : el('p', { class: 'vg-selo__nota' }, U.t('avisos.selo_nota', { nota: Math.round(Number(s.nota)), margem: s.margem == null ? 10 : s.margem })),
      el('p', { class: 'vg-selo__linha' }, linha)
    ]);
  }

  function tempoDeMeses(m) {
    m = Math.max(1, Number(m) || 0);
    if (m < 12) return m + (m === 1 ? ' mês' : ' meses');
    var a = Math.floor(m / 12);
    var r = m % 12;
    return a + (a === 1 ? ' ano' : ' anos') + (r ? ' e ' + r + (r === 1 ? ' mês' : ' meses') : '');
  }
  // Cartão cego: o que a empresa vê antes do Combinou. Lê só estes campos (nada de nome, foto, idade, contato).
  function cartaoCego(c, op) {
    c = c || {};
    op = op || {};
    var linhas = [];
    function linha(dt, dd) { if (dd) { linhas.push(el('dt', {}, dt)); linhas.push(el('dd', {}, dd)); } }
    linha('Zona', c.zona && c.zona.nome ? c.zona.nome + (c.cidade && c.cidade.nome ? ', ' + c.cidade.nome : '') : (c.cidade && c.cidade.nome) || '');
    linha('Quer trabalhar com', (c.cargos || []).join(', '));
    linha('Experiência', (c.experiencias || []).length ? c.experiencias.map(function (x) { return x.funcao + ', ' + tempoDeMeses(x.meses) + (x.atual ? ' (atual)' : ''); }).join('; ') : 'Ainda sem experiência registrada');
    linha('Escolaridade', rotulo(R.ESCOLARIDADES, c.escolaridade));
    linha('Turnos', (c.turnos || []).map(function (x) { return rotulo(R.TURNOS, x); }).filter(Boolean).join(', '));
    linha('CNH', (c.cnh || []).length ? c.cnh.join(', ') : 'Não tem');
    linha('Pretensão', c.pretensaoCentavos ? 'A partir de ' + U.reais(c.pretensaoCentavos) : 'Não informou');
    if ((c.cursos || []).length) linha('Cursos', c.cursos.join(', '));
    var selos = (c.selos || []).map(function (s) { return selo(s, { mini: true }); });
    var resto = U.t('avisos.referencia_cartao_cego_empresa', { quantidade: 'sim' }).replace(/^[^.]*\.\s*/, '');
    return el('li', { class: 'caixa caixa--compacta vg-cartao' + (op.decidido ? ' vg-cartao--decidido' : '') + (op.previa ? ' vg-cartao--previa' : ''),
      id: op.id, data: { candidatura: op.candidaturaId } }, [
      el('div', { class: 'vg-cartao__topo' }, [
        op.ordem ? el('span', { class: 'vg-cartao__ordem' }, op.ordem + 'º') : null,
        el('div', {}, [el('p', { class: 'vg-cartao__quem' }, 'Pessoa candidata'), op.chegouEm ? el('p', { class: 'vg-cartao__chegou' }, 'chegou em ' + U.dataHora(op.chegouEm)) : null]),
        op.status ? status('candidatura', op.status, { lado: 'empresa' }) : null
      ]),
      el('dl', { class: 'vg-cartao__linhas' }, linhas),
      selos.length ? el('div', { class: 'vg-cartao__selos' }, selos) : null,
      c.temReferencia ? el('div', { class: 'vg-cartao__refs', id: op.idReferencia }, [el('p', { class: 'vg-ref-contagem' }, [U.icone('check'), REF_SIM]),
        resto ? el('p', { class: 't-eixo texto-suave' }, resto) : null]) : null,
      op.acoes && op.acoes.length ? el('div', { class: 'vg-cartao__acoes' }, op.acoes) : null
    ]);
  }

  function vinculo(id) { return U.t('referencia.vinculos.' + id) || rotulo(R.VINCULOS, id); }
  // Carta de referência: sem estrelas, sem nota, sem média. Pontos fortes só da lista fechada (chave desconhecida some).
  function cartaReferencia(r, op) {
    r = r || {};
    op = op || {};
    var emp = r.empresa || {};
    var pontos = (r.pontosFortes || []).map(function (p) { return rotulo(R.PONTOS_FORTES, p); }).filter(Boolean);
    var periodo = U.mesAno(r.inicio) + ' a ' + (r.atual || !r.fim ? 'hoje' : U.mesAno(r.fim));
    return el('article', { class: 'vg-ref' + (op.pendente ? ' vg-ref--pendente' : ''), id: op.id, data: { referencia: r.id } }, [
      el('div', { class: 'vg-ref__topo' }, [iniciais(emp.nome), el('div', { class: 'vg-ref__quem' }, [
        el('p', { class: 'vg-ref__empresa' }, [emp.nome || '', emp.conferida ? verificada('empresa verificada') : null]),
        el('p', { class: 'vg-ref__meta' }, [r.funcao, vinculo(r.vinculo), periodo].filter(Boolean).join(' · '))])]),
      pontos.length ? el('ul', { class: 'vg-ref__pontos', 'aria-label': 'Pontos fortes' }, pontos.map(function (p) { return el('li', { class: 'vg-etiqueta vg-etiqueta--selo' }, p); })) : null,
      (r.recomendaPara || []).length ? el('p', { class: 'vg-ref__recomenda' }, 'Recomendaria para: ' + r.recomendaPara.join(', ')) : null,
      r.texto ? el('p', { class: 'vg-ref__texto' }, r.texto) : null,
      r.criadoEm ? el('p', { class: 'vg-ref__assina' }, 'Referência de ' + (emp.nome || 'empresa verificada') + ' · ' + U.data(r.criadoEm)) : null,
      op.acoes && op.acoes.length ? el('div', { class: 'vg-ref__acoes' }, op.acoes) : null
    ]);
  }

  // Foto opcional da pessoa: só para a empresa daquela candidatura, depois do Combinou (quem chama confere).
  function fotoMini(url, op) {
    op = op || {};
    if (!url) return iniciais(op.nome || '', {});
    return el('img', { class: 'vg-foto__mini' + (op.grande ? ' vg-foto__mini--grande' : ''), id: op.id, src: url, alt: op.nome ? 'Foto de ' + op.nome : '',
      width: op.grande ? '48' : '40', height: op.grande ? '48' : '40', referrerpolicy: 'no-referrer' });
  }

  [['selo', selo], ['cartaoCego', cartaoCego], ['cartaReferencia', cartaReferencia], ['fotoMini', fotoMini], ['tempoDeMeses', tempoDeMeses]]
    .forEach(function (x) { P[x[0]] = x[1]; });
  P.TEXTOS.SELO_ROTULO = SELO_ROTULO;
  P.TEXTOS.REF_SIM = REF_SIM;
  if (nodeJs) module.exports = P;
})(typeof self !== 'undefined' ? self : this);
