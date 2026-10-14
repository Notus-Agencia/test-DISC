/*
 * Vagas sem Caos — referência profissional, LADO DA EMPRESA: referências dadas (empresa.html#referencias) e o formulário de dar
 * referência (empresa.html#referencia/dar e referencia.html?t=<token>, quando a empresa abre o pedido de uma pessoa).
 * Desenho: docs/VAGAS-TELAS.md §3.9; contrato: docs/VAGAS-SPEC.md §8.6; regras: padroes.md §7.
 * Vetos: P2 — a empresa nunca vê se a pessoa aceitou, ocultou, recusou ou removeu (a lista mostra só o que a empresa escreveu e
 * o andamento da MODERAÇÃO; VAGAS_EMPRESA_REGRAS.andamentoReferencia). Pontos fortes só da lista fechada (VAGAS_REGRAS.PONTOS_FORTES),
 * até 3; sem estrelas, nota ou média; texto curto só com fato observado.
 */
(function (root) {
  'use strict';
  var U = root.VAGAS_UI;
  var A = root.VAGAS_API;
  var R = root.VAGAS_REGRAS;
  var P = root.VAGAS_PECAS;
  var ER = root.VAGAS_EMPRESA_REGRAS;
  var E = root.VAGAS_EMPRESA;
  var el = U.el;
  var ctx = E.ctx;
  var LIMITE_MES = 20;
  function t(c, v) { return U.t(c, v); }
  function aceite() {
    var c = root.VAGAS_TEXTOS && root.VAGAS_TEXTOS.consentimentos;
    return (c && c.aceites && c.aceites.empresa_referencia_declaracao) || {};
  }
  function vinculo(id) { return t('referencia.vinculos.' + id) || R.rotulo(R.VINCULOS, id); }
  function periodo(r) { return U.mesAno(r.inicio) + ' a ' + (r.atual || !r.fim ? 'hoje' : U.mesAno(r.fim)); }

  // ------------------------------------------------------------------------------------------------- formulário
  // op: {modo: 'convite'|'candidatura'|'email', token?, candidaturaId?, pessoaNome?, rotuloPessoa?, aoEnviado(r), aoCancelar()}
  function formulario(op) {
    op = op || {};
    var porEmail = op.modo === 'email';
    var campos = {};
    var erro = el('p', { class: 'aviso aviso--erro', id: 'vg-ref-dar-erro', role: 'alert', hidden: true });
    var pessoa = porEmail
      ? E.campo({ id: 'vg-ref-dar-pessoa', rotulo: 'E-mail da pessoa', tipo: 'email', obrigatorio: true, atributos: { autocomplete: 'off', inputmode: 'email' }, largo: true,
        ajuda: 'Para dar referência sem pedido, use o e-mail que a pessoa usa no Vagas sem Caos. Só pessoas com conta.' })
      : E.campo({ id: 'vg-ref-dar-pessoa', rotulo: 'Pessoa', valor: op.rotuloPessoa || op.pessoaNome || '', atributos: { readOnly: true }, largo: true });
    campos.email = pessoa.campo;
    var funcao = E.campo({ id: 'vg-ref-dar-funcao', rotulo: 'Função que exercia', obrigatorio: true, atributos: { maxlength: '80' } });
    campos.funcao = funcao.campo;
    var vinc = E.chips({ id: 'vg-ref-dar-vinculo', rotulo: 'Vínculo', obrigatorio: true, opcoes: R.VINCULOS.map(function (v) { return { id: v.id, rotulo: vinculo(v.id) }; }) });
    campos.vinculo = vinc.grupo;
    var inicio = el('input', { id: 'vg-ref-dar-inicio', class: 'entrada vg-emp-mes', type: 'text', inputmode: 'numeric', placeholder: 'MM/AAAA', maxlength: '7', autocomplete: 'off',
      'aria-describedby': 'vg-ref-dar-periodo-ajuda' });
    var fim = el('input', { id: 'vg-ref-dar-fim', class: 'entrada vg-emp-mes', type: 'text', inputmode: 'numeric', placeholder: 'MM/AAAA', maxlength: '7', autocomplete: 'off',
      'aria-label': 'Até (mês/ano)' });
    campos.inicio = inicio; campos.fim = fim;
    [inicio, fim].forEach(function (c) { c.addEventListener('input', function () { U.limparErroCampo(c); }); });
    var atual = E.marcar({ id: 'vg-ref-dar-atual', rotulo: 'Trabalha aqui atualmente', aoMudar: function (v) { fim.disabled = v; if (v) { fim.value = ''; U.limparErroCampo(fim); } } });
    var blocoPeriodo = el('div', { class: 'campo' }, [
      el('label', { class: 'campo__rotulo', for: 'vg-ref-dar-inicio' }, ['Período ', el('span', { class: 'obrigatorio' }, '(obrigatório)')]),
      el('div', { class: 'vg-emp-faixa-valor' }, [inicio, el('span', { class: 't-rotulo texto-suave', 'aria-hidden': 'true' }, 'até'), fim]),
      el('span', { class: 'campo__ajuda', id: 'vg-ref-dar-periodo-ajuda' }, 'Mês/ano, como 09/2025.'),
      el('div', { class: 'vg-emp-marcar-linha' }, atual.no)]);
    var recomenda = E.chips({ id: 'vg-ref-dar-recomenda', rotulo: 'Recomendaria para', opcional: true, multiplo: true, max: 5, largo: true,
      opcoes: [{ id: 'mesma', rotulo: 'A mesma função' }].concat(R.AREAS),
      ajuda: 'Até 5, da lista fechada de áreas.', aoLimite: function () { U.erroCampo(recomenda.grupo, 'Escolha até 5 funções em "Recomendaria para".'); } });
    campos.recomenda = recomenda.grupo;
    var pontos = E.chips({ id: 'vg-ref-dar-pontos', rotulo: 'Pontos fortes (até 3, do que você viu no trabalho)', obrigatorio: true, multiplo: true, max: 3, largo: true,
      opcoes: R.PONTOS_FORTES, ajuda: 'Lista fechada de comportamentos observados no trabalho.',
      aoLimite: function () { U.erroCampo(pontos.grupo, t('referencia.validacao.pontos_maximo') || 'Escolha até 3 pontos fortes.'); } });
    campos.pontos = pontos.grupo;
    var texto = E.campo({ id: 'vg-ref-dar-texto', rotulo: 'Em poucas palavras', opcional: true, multilinha: true, linhas: '3', atributos: { maxlength: '300' }, largo: true,
      depois: el('p', { class: 'vg-contador', id: 'vg-ref-dar-contador' }, '0 de 300'), ajuda: t('avisos.referencia_texto_regras') });
    campos.texto = texto.campo;
    var cont = texto.no.querySelector('#vg-ref-dar-contador');
    texto.campo.addEventListener('input', function () { cont.textContent = texto.campo.value.length + ' de 300'; });
    texto.campo.addEventListener('blur', function () {
      var l = ER.termosProibidos(texto.campo.value, 'referencia');
      if (l.length) U.erroCampo(texto.campo, l[0].erro); else U.limparErroCampo(texto.campo);
    });
    var decl = aceite();
    var declaro = el('input', { type: 'checkbox', id: 'vg-ref-dar-declaro' });
    declaro.addEventListener('change', function () { U.limparErroCampo(declaro); });
    campos.declaro = declaro;
    var blocoDeclaro = el('div', { class: 'consentimento campo--largo' }, [el('label', { class: 'marcar' }, [declaro, el('span', { class: 't-rotulo' }, decl.texto || 'Declaro que a pessoa trabalhou nesta empresa no período informado.')]),
      decl.explicacao ? el('p', { class: 'consentimento__explicacao' }, U.t('consentimentos.aceites.empresa_referencia_declaracao.explicacao', { limite_mes: LIMITE_MES })) : null]);
    var enviar = el('button', { type: 'submit', class: 'botao botao--laranja botao--grande', id: 'vg-ref-dar-enviar' }, t('botoes.referencia_enviar') || 'Enviar referência');
    var cancelar = el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-ref-dar-cancelar', onclick: function () { if (op.aoCancelar) op.aoCancelar(); } }, 'Cancelar');
    var form = el('form', { class: 'caixa caixa--ampla vg-emp-form', id: 'vg-ref-form-dar', novalidate: true }, [
      el('div', { class: 'form-grade' }, [pessoa.no, funcao.no, vinc.no, blocoPeriodo, el('div', { class: 'campo' }), recomenda.no, pontos.no, texto.no, blocoDeclaro]),
      erro, el('div', { class: 'vg-emp-acoes-form' }, [cancelar, enviar])]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      erro.hidden = true;
      var rec = recomenda.valor().map(function (id) { return id === 'mesma' ? funcao.campo.value.trim() : R.rotulo(R.AREAS, id); }).filter(Boolean);
      var l = ER.lerReferenciaForm({ email: pessoa.campo.value, funcao: funcao.campo.value, vinculo: vinc.valor(), inicio: inicio.value, fim: fim.value,
        atual: atual.caixa.checked, pontos: pontos.valor(), recomenda: rec, texto: texto.campo.value, declaro: declaro.checked }, Date.now(), { porEmail: porEmail });
      if (!l.ok) { var c = campos[l.campo] || funcao.campo; U.erroCampo(c, l.erro); if (c.focus) c.focus(); return; }
      var dados = Object.assign({ empresaId: ctx.empresa.id }, l.dados);
      if (op.modo === 'convite') dados.conviteToken = op.token;
      else if (op.modo === 'candidatura') dados.candidaturaId = op.candidaturaId;
      U.ocupado(enviar, true, 'Enviando…');
      A.oferecerReferencia(dados).then(function (r) {
        var ok = el('section', { class: 'caixa caixa--ampla', id: 'vg-ref-dar-ok', role: 'status' }, [
          el('div', { class: 'vg-ok-icone' }, U.icone('check')), el('h2', { class: 't-titulo', tabindex: '-1' }, 'Referência enviada'),
          el('p', { class: 't-corpo texto-medio' }, t('avisos.referencia_empresa_em_moderacao')),
          el('div', { class: 'acoes' }, el('a', { class: 'botao botao--principal', href: (op.base || '') + '#referencias', id: 'vg-ref-dar-ver' }, 'Ver referências dadas'))]);
        form.parentNode.replaceChild(ok, form);
        U.focarTitulo(ok);
        U.anunciar('Referência enviada.');
        if (op.aoEnviado) op.aoEnviado(r);
      }, function (e) {
        U.ocupado(enviar, false);
        if (e.sessaoExpirada || e.confirmar || e.suspensa || e.conexao) { U.tratarErro(e); return; }
        var c = ER.campoDoErroReferencia(e.message);
        if (c && campos[c]) { U.erroCampo(campos[c], e.message); if (campos[c].focus) campos[c].focus(); }
        else { erro.textContent = e.message; erro.hidden = false; }
      });
    });
    return form;
  }
  function lateralDar() {
    return el('aside', { class: 'vg-lateral', 'aria-label': 'Como funciona a referência' }, [
      E.caixa({ id: 'vg-ref-como-aparece', titulo: 'Como aparece' }, [
        el('p', { class: 't-rotulo texto-medio' }, 'Antes do Combinou, outras empresas veem só isto no cartão:'),
        el('p', { class: 'vg-ref-contagem' }, [U.icone('check'), P.TEXTOS.REF_SIM]),
        el('p', { class: 't-rotulo texto-medio vg-emp-nota' }, 'Depois do Combinou: a referência inteira, com o nome da empresa.')]),
      E.caixa({ id: 'vg-ref-regras', titulo: 'Regras' }, [E.lista([t('avisos.referencia_empresa_limite', { limite_mes: LIMITE_MES }), t('avisos.referencia_sem_ordem'),
        'A decisão de mostrar ou não é só da pessoa.'])])
    ]);
  }

  // empresa.html#referencia/dar (por e-mail) e #referencia/dar/candidatura/<id> (depois do Combinou).
  function telaDar(raiz, resto) {
    if (!E.verificada() || E.suspensa()) {
      E.tela(raiz, [E.cabecalho({ sobre: 'Referências', titulo: 'Dar referência profissional' }),
        el('p', { class: 'aviso', id: 'vg-ref-so-verificada', role: 'note' }, t('avisos.referencia_empresa_so_verificada'))]);
      return;
    }
    var m = /^candidatura\/([0-9a-fA-F-]{36})$/.exec(resto || '');
    var modo = m ? 'candidatura' : 'email';
    E.tela(raiz, [
      E.cabecalho({ sobre: 'Referências', titulo: 'Dar referência profissional', texto: t('avisos.referencia_empresa_como_funciona') }),
      el('div', { class: 'vg-grade' }, [formulario({ modo: modo, candidaturaId: m ? m[1] : null, rotuloPessoa: m ? 'Pessoa da conversa (depois do Combinou)' : '',
        aoCancelar: function () { E.irPara('referencias'); } }), lateralDar()])]);
  }

  // ------------------------------------------------------------------------------------------------- referências dadas
  function telaReferencias(raiz) {
    U.carregando(raiz);
    return A.referenciasDaEmpresa(ctx.empresa.id).then(function (r) {
      var lista = r.referencias || [];
      var pode = E.verificada() && !E.suspensa();
      var cab = E.cabecalho({ sobre: ctx.empresa.nomeFantasia, titulo: 'Referências', idTexto: 'vg-ref-restantes',
        texto: pode ? 'Sua empresa ainda pode dar ' + r.restantes30Dias + (r.restantes30Dias === 1 ? ' referência' : ' referências') + ' nestes 30 dias.' : t('avisos.referencia_empresa_so_verificada'),
        acoes: [pode ? el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-ref-nova', href: '#referencia/dar' }, [U.icone('mais'), t('botoes.referencia_dar') || 'Dar referência']) : null] });
      var corpo;
      if (!lista.length) {
        corpo = el('div', { id: 'vg-ref-vazio' });
        U.vazio(corpo, { titulo: 'Sua empresa ainda não deu referências', texto: t('avisos.referencia_empresa_como_funciona') });
      } else {
        corpo = E.caixa({ id: 'vg-ref-dadas', titulo: 'Referências dadas', classe: 'caixa--ampla' }, [
          el('div', { class: 'vg-rolagem' }, el('table', { class: 'vg-tabela', id: 'vg-ref-tabela' }, [
            el('thead', {}, el('tr', {}, ['Função · período', 'Pontos fortes', 'Moderação', ''].map(function (h) {
              return el('th', { scope: 'col' }, h || el('span', { class: 'visualmente-oculto' }, 'Ver'));
            }))),
            el('tbody', {}, lista.map(linha))])),
          el('p', { class: 't-nota texto-suave vg-emp-nota' }, 'Aqui aparece só o que a sua empresa escreveu e o andamento da moderação. A decisão de mostrar a referência é só da pessoa.')]);
      }
      E.tela(raiz, [cab, el('div', { class: 'vg-grade' }, [corpo, lateralLista()])]);
    }, function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { telaReferencias(raiz); } }); });
  }
  function linha(r) {
    var and = ER.andamentoReferencia(r);
    var mot = and.motivo ? E.motivo(and.motivo, { pessoa_nome: 'esta pessoa', limite_mes: LIMITE_MES }) : null;
    var pontos = (r.pontosFortes || []).map(function (p) { return R.rotulo(R.PONTOS_FORTES, p); }).filter(Boolean);
    return el('tr', { data: { referencia: r.id } }, [
      el('td', {}, [el('span', { class: 'seminegrito' }, r.funcao), el('span', { class: 'vg-emp-sub' }, periodo(r) + ' · ' + vinculo(r.vinculo)),
        el('span', { class: 'vg-emp-sub' }, 'Enviada em ' + U.data(r.criadoEm))]),
      el('td', {}, pontos.join(', ')),
      el('td', {}, [el('span', { class: 'vg-status vg-status--' + and.classe, data: { andamento: and.classe } }, and.rotulo), mot ? el('span', { class: 'vg-emp-sub' }, mot.texto) : null]),
      el('td', {}, el('div', { class: 'vg-tabela__acoes' }, el('button', { type: 'button', class: 'botao botao--claro', data: { acao: 'ver' }, onclick: function () { ver(r); } }, 'Ver')))]);
  }
  // A carta como a empresa escreveu (texto completo, mesmo em revisão); sem nada da decisão da pessoa.
  function ver(r) {
    var j = U.janela({ id: 'vg-janela-referencia', titulo: 'Referência que sua empresa deu', corpo: [P.cartaReferencia(Object.assign({}, r, { texto: r.texto }), { id: 'vg-ref-carta' }),
      el('p', { class: 't-nota texto-suave' }, ER.andamentoReferencia(r).rotulo + '.')],
      acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-janela-referencia-fechar', onclick: function () { j.fechar('fechar'); } }, 'Fechar')] });
  }
  // Pedidos chegam por link (a pessoa manda pelo WhatsApp ou e-mail): aqui a empresa cola o link e abre o pedido.
  function lateralLista() {
    var campo = el('input', { id: 'vg-ref-pedido-link', class: 'entrada', type: 'text', placeholder: 'Cole aqui o link do pedido', autocomplete: 'off', 'aria-label': 'Link do pedido de referência' });
    var abrir = el('button', { type: 'button', class: 'botao botao--principal', id: 'vg-ref-pedido-abrir' }, 'Abrir pedido');
    abrir.addEventListener('click', function () {
      var m = /(?:[?&]t=)?([0-9a-f]{64})\b/i.exec(campo.value.trim());
      if (!m) { U.erroCampo(campo, 'Link de pedido inválido. Confira se copiou o link inteiro.'); campo.focus(); return; }
      U._api.navegar('referencia.html?t=' + m[1].toLowerCase());
    });
    campo.addEventListener('input', function () { U.limparErroCampo(campo); });
    return el('aside', { class: 'vg-lateral', 'aria-label': 'Pedidos de referência' }, [
      E.caixa({ id: 'vg-ref-pedidos', titulo: 'Pedidos de referência', classe: 'caixa--compacta caixa--destaque' }, [
        el('p', { class: 't-rotulo texto-medio' }, 'Quem trabalhou na sua empresa pode pedir a referência pelo Vagas sem Caos e mandar o link para você. Abra o link com a conta da empresa, ou cole aqui:'),
        el('div', { class: 'vg-link-curto vg-emp-pedido' }, [campo, abrir]),
        el('p', { class: 't-nota texto-suave vg-emp-nota' }, 'Não lembra da pessoa ou não quer recomendar? Só não responda; ela não é avisada de recusa.')]),
      E.caixa({ id: 'vg-ref-porque', titulo: 'Por que vale a pena' }, [el('p', { class: 't-rotulo texto-medio' },
        'Boas pessoas muitas vezes não são vistas. Uma referência pública e verificada ajuda a pessoa que trabalhou bem com você a ser chamada para conversar.'),
        el('p', { class: 't-nota texto-suave vg-emp-nota' }, t('avisos.referencia_sem_ordem'))])
    ]);
  }

  E.telas.referencias = telaReferencias;
  E.telas.referenciaDar = telaDar;
  E.referencia = { formulario: formulario, lateral: lateralDar };
})(typeof self !== 'undefined' ? self : this);
