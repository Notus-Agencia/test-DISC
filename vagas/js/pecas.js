/*
 * Vagas sem Caos — peças de tela compartilhadas (VAGAS_PECAS). UMD; carregue depois de regras.js, textos.js e ui.js.
 * As peças com dados da pessoa (selo, cartão cego, carta de referência, foto) ficam em pecas-pessoa.js (carregue depois deste
 * nas telas que mostram essas peças); a lista pública não precisa delas.
 * Cada peça devolve um Element montado com VAGAS_UI.el (texto sempre como textNode) e lê SÓ os campos que pode mostrar: o cartão
 * cego nunca lê nome, foto ou contato, mesmo que venham no objeto.
 *
 *   golpe({id?, aoDenunciar?}) -> aviso anti-golpe com a frase fixa (docs/VAGAS-TELAS.md, regras transversais)
 *   iniciais(nome, {confidencial?, grande?}) · verificada(texto?) · modalidadeCurta(id)
 *   valorVaga(anuncio) -> 'R$ 1.620 + comissão' · metaVaga(anuncio, {cidadeAtual?}) -> ['Caixa e operação de loja', 'CLT', 'Centro', …]
 *   etiquetasVaga(anuncio) -> [Element] · cartaoVaga(anuncio, {href?, agora?, cidadeAtual?}) -> <li> (lista e prévia na empresa)
 *   status(tipo: 'candidatura'|'anuncio'|'empresa', chave, {lado?: 'empresa'}) -> .vg-status
 *   janelaDenuncia({alvo: 'anuncio'|'mensagem'|'referencia', id, aoEnviada?}) -> janela com os motivos de VAGAS_REGRAS
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var U = nodeJs ? require('./ui.js') : root.VAGAS_UI;
  var R = nodeJs ? require('./regras.js') : root.VAGAS_REGRAS;
  var el = U.el;

  // Frase anti-golpe fixa das telas (docs/VAGAS-TELAS.md, regras para todas as telas). A versão curta do boletim é avisos.nunca_pague.
  var GOLPE_FORTE = 'Nunca pague para se candidatar.';
  var GOLPE_TEXTO = 'Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.';

  function rotulo(lista, id) { return R.rotulo(lista, id) || ''; }
  function golpe(op) {
    op = op || {};
    return el('div', { class: 'vg-golpe', id: op.id === undefined ? 'vg-aviso-golpe' : op.id, role: 'note' }, [U.icone('escudo'), el('p', {}, [
      el('strong', {}, GOLPE_FORTE), ' ' + GOLPE_TEXTO,
      op.aoDenunciar ? [' ', el('button', { type: 'button', class: 'botao botao--link', id: op.idDenunciar, onclick: op.aoDenunciar }, 'Denunciar')] : null])]);
  }
  function iniciais(nome, op) {
    op = op || {};
    var conf = !!op.confidencial;
    return el('span', { class: 'vg-iniciais' + (conf ? ' vg-iniciais--confidencial' : '') + (op.grande ? ' vg-iniciais--grande' : ''), 'aria-hidden': 'true' },
      conf ? '?' : (op.iniciais || R.iniciais(nome) || '·'));
  }
  function verificada(texto) { return el('span', { class: 'vg-verificada' }, [U.icone('check'), texto || 'verificada']); }
  function modalidadeCurta(id) { return rotulo(R.MODALIDADES, id).replace(/\s*\(.*\)$/, ''); }

  function valorVaga(a) {
    if (!a || !a.valor) return '';
    var v = U.valor(a.valor);
    if (a.modalidade === 'estagio' && v) v += ' de bolsa';
    return v + (a.comissao ? ' + comissão' : '');
  }
  var SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  function diaDaDiaria(d) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.data || '')) return '';
    var dia = SEMANA[new Date(d.data + 'T12:00:00Z').getUTCDay()];
    return dia + ' ' + U.dataCurta(d.data) + (d.inicio && d.fim ? ', ' + d.inicio + ' às ' + d.fim : '');
  }
  function metaVaga(a, op) {
    op = op || {};
    var m = [];
    if (a.area && a.area.nome) m.push(a.area.nome);
    m.push(modalidadeCurta(a.modalidade));
    var outraCidade = a.cidade && op.cidadeAtual && a.cidade.slug !== op.cidadeAtual;
    if (a.zona && a.zona.nome && !outraCidade) m.push(a.zona.nome);
    else if (a.cidade && a.cidade.nome) m.push(a.cidade.nome);
    if (a.modalidade === 'diaria' && a.diaria) m.push(diaDaDiaria(a.diaria));
    else if (a.turno) m.push(rotulo(R.TURNOS_VAGA, a.turno));
    if (a.experiencia === 'nao_precisa') m.push('Sem experiência');
    return m.filter(Boolean);
  }
  function etiquetasVaga(a) {
    var e = [];
    if (a.destaque) e.push(el('span', { class: 'vg-etiqueta vg-etiqueta--destaque' }, 'Destaque'));
    if (a.urgente) e.push(el('span', { class: 'vg-etiqueta vg-etiqueta--urgente' }, 'Urgente hoje'));
    if (a.paraHoje) e.push(el('span', { class: 'vg-etiqueta vg-etiqueta--hoje' }, 'Para hoje'));
    if (a.selo) e.push(el('span', { class: 'vg-etiqueta vg-etiqueta--selo' }, 'Selo sugerido: ' + (rotulo(R.TESTES_SELO, a.selo) || a.selo)));
    return e;
  }
  function cartaoVaga(a, op) {
    op = op || {};
    var emp = a.empresa || {};
    var etq = etiquetasVaga(a);
    var href = op.href || ('vaga.html?vaga=' + encodeURIComponent(a.codigo || ''));
    return el('li', {}, el('a', { class: 'vg-vaga' + (a.destaque ? ' vg-vaga--destaque' : ''), href: href, data: { anuncio: a.id, codigo: a.codigo } }, [
      iniciais(emp.nome, { confidencial: emp.confidencial, iniciais: emp.iniciais }),
      el('span', { class: 'vg-vaga__corpo' }, [
        el('span', { class: 'vg-vaga__titulo' }, a.funcao || a.titulo || ''),
        el('span', { class: 'vg-vaga__empresa' }, [emp.nome || '', emp.conferida ? verificada() : null]),
        el('span', { class: 'vg-vaga__valor' }, valorVaga(a)),
        el('span', { class: 'vg-vaga__meta' }, metaVaga(a, op).map(function (x) { return el('span', {}, x); })),
        etq.length ? el('span', { class: 'vg-vaga__etiquetas' }, etq) : null
      ]),
      a.publicadoEm ? el('span', { class: 'vg-vaga__quando' }, U.relativa(a.publicadoEm, op.agora)) : null
    ]));
  }

  // Situação com rótulo e cor (cores só por classe; rótulos das listas de VAGAS_REGRAS).
  var CLASSES = {
    candidatura: { agora_nao: 'agora-nao' },
    anuncio: { em_revisao: 'revisao', pausado: 'pausada', encerrado: 'encerrada', suspenso: 'suspensa', removido: 'removida' },
    empresa: { em_analise: 'analise' }
  };
  // Lado da empresa nos cartões cegos (docs/VAGAS-TELAS.md §3.5): "Agora não" e recusa aparecem sem frase negativa.
  var CANDIDATURA_EMPRESA = { enviada: 'Novo', conversar: 'Você chamou', combinou: 'Combinou', contratada: 'Contratada', agora_nao: 'Agora não', retirada: 'Encerrada', recusada: 'Encerrada' };
  function status(tipo, chave, op) {
    op = op || {};
    var lista = tipo === 'anuncio' ? R.STATUS_ANUNCIO : tipo === 'empresa' ? R.STATUS_EMPRESA : R.STATUS_CANDIDATURA;
    var texto = tipo === 'candidatura' && op.lado === 'empresa' ? CANDIDATURA_EMPRESA[chave] : rotulo(lista, chave);
    var classe = (CLASSES[tipo] && CLASSES[tipo][chave]) || String(chave || '').replace(/_/g, '-');
    if (tipo === 'candidatura' && op.lado === 'empresa' && chave === 'enviada') classe = 'novo';
    return el('span', { class: 'vg-status vg-status--' + classe, data: { status: chave } }, texto || '');
  }

  function janelaDenuncia(op) {
    op = op || {};
    var escolhido = '';
    var erro = el('p', { class: 'campo__erro', id: 'vg-denuncia-erro', role: 'alert', hidden: true });
    var motivos = el('div', { class: 'vg-opcoes', id: 'vg-denuncia-motivos', role: 'radiogroup', 'aria-labelledby': 'vg-denuncia-motivo-rotulo' },
      R.MOTIVOS_DENUNCIA_TELA.map(function (m) {
        return el('button', { type: 'button', class: 'vg-chip', role: 'radio', 'aria-checked': 'false', data: { motivo: m.id }, onclick: function (ev) {
          escolhido = m.id;
          Array.prototype.forEach.call(motivos.children, function (b) { b.setAttribute('aria-checked', b === ev.currentTarget ? 'true' : 'false'); });
          erro.hidden = true;
        } }, m.texto || m.rotulo);
      }));
    var detalhe = el('textarea', { id: 'vg-denuncia-detalhe', class: 'entrada', maxlength: '300', rows: '3', 'aria-describedby': 'vg-denuncia-contador' });
    var cont = el('p', { class: 'vg-contador', id: 'vg-denuncia-contador' }, '0 de 300');
    detalhe.addEventListener('input', function () { cont.textContent = detalhe.value.length + ' de 300'; });
    var enviar = el('button', { type: 'button', class: 'botao botao--principal', id: 'vg-denuncia-enviar' }, 'Enviar denúncia');
    var j = U.janela({ id: 'vg-janela-denuncia', titulo: U.t('avisos.denuncia_titulo') || 'Denunciar', aoFechar: op.aoFechar, corpo: [
      el('p', { class: 't-rotulo texto-medio' }, U.t('avisos.denuncia_texto')),
      el('p', { class: 'campo__rotulo', id: 'vg-denuncia-motivo-rotulo' }, 'Motivo'), motivos, erro,
      el('label', { class: 'campo__rotulo', for: 'vg-denuncia-detalhe' }, ['Conte o que aconteceu ', el('span', { class: 'obrigatorio' }, '(opcional)')]), detalhe, cont
    ], acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-denuncia-cancelar', onclick: function () { j.fechar('cancelar'); } }, 'Cancelar'), enviar] });
    enviar.addEventListener('click', function () {
      if (!escolhido) { erro.textContent = 'Escolha o motivo da denúncia.'; erro.hidden = false; return; }
      U.ocupado(enviar, true, 'Enviando…');
      root.VAGAS_API.denunciar({ alvo: op.alvo, id: op.id, motivo: escolhido, detalhe: detalhe.value.trim() }).then(function () {
        j.fechar('enviada');
        U.avisar(U.t('avisos.denuncia_ok') || 'Denúncia recebida.', { tipo: 'ok', ms: 6000 });
        if (op.aoEnviada) op.aoEnviada();
      }, function (e) {
        U.ocupado(enviar, false);
        if (e.sessaoExpirada) { U.tratarErro(e); return; }
        erro.textContent = e.message; erro.hidden = false;
      });
    });
    return j;
  }

  var VAGAS_PECAS = {
    golpe: golpe, iniciais: iniciais, verificada: verificada, modalidadeCurta: modalidadeCurta, valorVaga: valorVaga, metaVaga: metaVaga,
    etiquetasVaga: etiquetasVaga, cartaoVaga: cartaoVaga, status: status, janelaDenuncia: janelaDenuncia, diaDaDiaria: diaDaDiaria, rotulo: rotulo,
    TEXTOS: { GOLPE_FORTE: GOLPE_FORTE, GOLPE_TEXTO: GOLPE_TEXTO, CANDIDATURA_EMPRESA: CANDIDATURA_EMPRESA }
  };
  if (nodeJs) module.exports = VAGAS_PECAS;
  else root.VAGAS_PECAS = VAGAS_PECAS;
})(typeof self !== 'undefined' ? self : this);
