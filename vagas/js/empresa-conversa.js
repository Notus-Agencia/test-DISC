/*
 * Vagas sem Caos — painel da empresa: CONVERSAS (empresa.html#conversas e #conversa/<candidatura>). Desenho: docs/VAGAS-TELAS.md
 * §3.6. A conversa é o componente da casca (VAGAS_CONVERSA, lado empresa); aqui entram os ganchos da empresa: contato liberado
 * depois do Combinou (nome, WhatsApp, e-mail e foto, se houver: vagas_contato_pessoa, cada abertura registrada para a pessoa),
 * "Marcar como contratada", o roteiro de entrevista estruturada (roteiro-entrevista.js), as referências liberadas com o Combinou
 * e o cartão "como chegou".
 * Antes do Combinou: nada de nome, foto ou contato (o cabeçalho é "Pessoa candidata"). Foto só depois do Combinou e só aqui.
 * Esta é a ÚNICA tela da empresa em que o Mapa DISC aparece, e só DEPOIS da contratação (padroes.md §4; VAGAS-TELAS §3.6).
 */
(function (root) {
  'use strict';
  var U = root.VAGAS_UI;
  var A = root.VAGAS_API;
  var P = root.VAGAS_PECAS;
  var ER = root.VAGAS_EMPRESA_REGRAS;
  var E = root.VAGAS_EMPRESA;
  var RO = root.VAGAS_ROTEIRO;
  var el = U.el;
  var ctx = E.ctx;
  function t(c, v) { return U.t(c, v); }

  // ------------------------------------------------------------------------------------------------- lista
  function telaConversas(raiz) {
    U.carregando(raiz);
    return A.conversasDaEmpresa(ctx.empresa.id).then(function (r) {
      var lista = r.conversas || [];
      lista.forEach(function (c) { E.lembrarAnuncio(c.candidaturaId, c.anuncio && c.anuncio.id); });
      var cab = E.cabecalho({ sobre: ctx.empresa.nomeFantasia, titulo: 'Conversas', texto: 'Nome e contato aparecem depois do Combinou. ' + t('mensagem.aviso_empresa') });
      if (!lista.length) {
        var v = el('div', { id: 'vg-conversas-vazio' });
        U.vazio(v, { texto: 'Nenhuma conversa ainda. Elas começam quando você chama alguém para conversar nos cartões.', botao: { rotulo: 'Minhas vagas', href: '#vagas' } });
        E.tela(raiz, [cab, v]);
        return;
      }
      E.tela(raiz, [cab, el('ul', { class: 'vg-linhas', id: 'vg-conversas-lista' }, lista.map(function (c) {
        return el('li', {}, el('a', { class: 'vg-linha', href: '#conversa/' + c.candidaturaId, data: { candidatura: c.candidaturaId } }, [
          P.iniciais('', { confidencial: true }),
          el('span', {}, [el('span', { class: 'vg-linha__titulo' }, 'Pessoa candidata · ' + ((c.anuncio && c.anuncio.titulo) || '')),
            el('span', { class: 'vg-linha__sub' }, (c.ultima || '') + (c.ultimaEm ? ' · ' + U.relativa(c.ultimaEm) : ''))]),
          el('span', { class: 'vg-emp-linha-fim' }, [P.status('candidatura', c.status, { lado: 'empresa' }),
            c.naoLidas ? el('span', { class: 'vg-emp-n', 'aria-label': c.naoLidas + (c.naoLidas === 1 ? ' mensagem nova' : ' mensagens novas') }, String(c.naoLidas)) : null])
        ]));
      }))]);
    }, function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { telaConversas(raiz); } }); });
  }

  // ------------------------------------------------------------------------------------------------- roteiro de entrevista
  function roteiro() {
    if (!RO) return null;
    var p = RO.perguntas.map(function (q) {
      return el('li', { class: 'vg-emp-pergunta' }, [
        el('p', { class: 'seminegrito' }, (q.nucleo ? '★ ' : '') + q.numero + '. ' + q.titulo + ' (' + q.tipo + ')'),
        el('p', { class: 'vg-emp-pergunta__texto' }, '"' + q.texto + '"'),
        el('dl', { class: 'vg-emp-ancoras' }, q.ancoras.map(function (a) { return [el('dt', {}, 'Nota ' + a[0]), el('dd', {}, a[1])]; }))]);
    });
    return el('details', { class: 'caixa caixa--compacta vg-emp-roteiro', id: 'vg-roteiro' }, [
      el('summary', { class: 'seminegrito', id: 'vg-roteiro-abrir' }, t('botoes.roteiro_entrevista') || 'Roteiro de entrevista (20–30 min)'),
      el('div', { class: 'vg-emp-roteiro__corpo' }, [
        el('p', { class: 't-rotulo texto-medio' }, 'Para quem: ' + RO.paraQuem),
        el('p', { class: 'aviso', role: 'note' }, RO.aviso),
        el('h3', { class: 'vg-emp-roteiro__titulo' }, 'Antes de começar (2 min)'), E.lista(RO.antes),
        el('h3', { class: 'vg-emp-roteiro__titulo' }, 'As perguntas (' + RO.escolha + ')'),
        el('p', { class: 't-rotulo texto-medio' }, RO.instrucao),
        el('ol', { class: 'vg-emp-perguntas' }, p),
        el('h3', { class: 'vg-emp-roteiro__titulo' }, RO.especificasTitulo), E.lista(RO.especificas),
        el('h3', { class: 'vg-emp-roteiro__titulo' }, 'Depois (5 min)'), el('ol', { class: 'vg-emp-lista' }, RO.depois.map(function (x) { return el('li', {}, x); }))])]);
  }

  // ------------------------------------------------------------------------------------------------- conversa
  function telaConversa(raiz, candId) {
    var titulo = el('h1', { class: 'cabecalho__titulo t-pagina seminegrito', id: 'vg-emp-conversa-titulo', tabindex: '-1' }, 'Conversa');
    var cab = el('div', { class: 'cabecalho' }, el('div', { class: 'cabecalho__texto-area' }, [el('p', { class: 'sobretitulo' }, 'Conversas'), titulo]));
    var raizConversa = el('div', { id: 'vg-emp-conversa' });
    var lateral = el('aside', { class: 'vg-lateral', id: 'vg-conversa-lateral', 'aria-label': 'Contato e próximos passos' });
    var raizRoteiro = el('div', { id: 'vg-emp-roteiro-lugar' });
    E.tela(raiz, [cab, el('div', { class: 'vg-grade' }, [el('div', { class: 'vg-lateral' }, [raizConversa, raizRoteiro]), lateral])]);

    var contato = null;          // resposta de vagas_contato_pessoa (só na memória desta tela)
    var erroContato = null;
    var pedindoContato = false;
    var cartaoAntes = null;      // cartão cego "como chegou" (antes do Combinou)
    var anuncioId = E.anuncioDe(candId);
    var estado = null;
    var resp = null;

    function pessoa() { return contato && contato.pessoa; }
    // Depois do Combinou o cabeçalho da conversa troca "Pessoa candidata" pelo nome e a foto pequena (ou iniciais).
    function cabecalhoConversa() {
      var p = pessoa();
      if (!p || !estado || (estado.modo !== 'combinou' && estado.modo !== 'contratada')) return {};
      return { nome: p.nome, foto: P.fotoMini(p.fotoUrl, { id: 'vg-conversa-foto', nome: p.nome }) };
    }
    // O nome e a foto chegam depois (contatoPessoa): a conversa redesenha o cabeçalho (VAGAS_CONVERSA, c.redesenhar).
    function aplicarCabecalho() {
      if (conv && typeof conv.redesenhar === 'function') { conv.redesenhar(); return; }
      var c = cabecalhoConversa();
      var nome = raiz.querySelector('#vg-conversa-nome');
      if (!nome || !c.nome) return;
      nome.textContent = c.nome;
      var caixaFoto = nome.closest('.vg-conversa__cab').querySelector(':scope > span');
      if (caixaFoto) U.trocar(caixaFoto, c.foto);
    }
    function carregarContato() {
      if (pedindoContato || contato) return;
      pedindoContato = true;
      A.contatoPessoa(candId).then(function (r) { contato = r; erroContato = null; }, function (e) {
        erroContato = e;
        if (e.sessaoExpirada || e.confirmar || e.suspensa) U.tratarErro(e);
      }).then(function () { pedindoContato = false; aplicarCabecalho(); desenharLateral(); });
    }
    var buscouCartao = false;
    function acharCartao() {
      if (buscouCartao) return;
      buscouCartao = true;
      // A vaga da candidatura: da memória (veio dos cartões), da lista de conversas ou, sem conversa ainda, procurando nos cartões.
      var buscar = anuncioId ? Promise.resolve(anuncioId) : A.conversasDaEmpresa(ctx.empresa.id).then(function (r) {
        var c = (r.conversas || []).filter(function (x) { return x.candidaturaId === candId; })[0];
        if (c && c.anuncio) return c.anuncio.id;
        return A.anunciosDaEmpresa(ctx.empresa.id).then(function (ra) {
          var ids = (ra.anuncios || []).filter(function (x) { return x.candidaturas && x.candidaturas.total; }).map(function (x) { return x.id; });
          function proximo(i) {
            if (i >= ids.length) return null;
            return A.cartoes(ids[i], {}).then(function (rc) {
              var achou = (rc.cartoes || []).some(function (x) { return x.candidaturaId === candId; });
              return achou ? ids[i] : proximo(i + 1);
            });
          }
          return proximo(0);
        });
      });
      buscar.then(function (id) {
        anuncioId = id;
        E.lembrarAnuncio(candId, id);
        if (!id) return null;
        return A.cartoes(id, {}).then(function (r) { var c = (r.cartoes || []).filter(function (x) { return x.candidaturaId === candId; })[0]; cartaoAntes = c ? c.cartao : null; });
      }).then(desenharLateral, function () { /* sem o cartão: a lateral segue */ });
    }

    function marcarContratada(botao) {
      var nome = (pessoa() && pessoa().nome) || 'esta pessoa';
      U.confirmar({ id: 'vg-confirmar-contratada', titulo: 'Marcar a candidatura de ' + nome + ' como contratada?', texto: 'A vaga pode continuar no ar.', sim: t('botoes.marcar_contratada') || 'Marcar como contratada' })
        .then(function (sim) {
          if (!sim) return;
          U.ocupado(botao, true);
          A.marcarContratada(candId).then(function () {
            U.avisar(t('avisos.combinou_contratada'), { tipo: 'ok', ms: 8000 });
            return conv.atualizar();
          }, function (e) { U.ocupado(botao, false); U.tratarErro(e); });
        });
    }
    function encerrarVaga(botao) {
      U.confirmar({ id: 'vg-confirmar-encerrar', titulo: 'Encerrar a vaga?', texto: 'Quem está em conversa continua; os cartões novos param de chegar.', sim: t('botoes.encerrar') || 'Encerrar vaga', perigo: true })
        .then(function (sim) {
          if (!sim || !anuncioId) return;
          U.ocupado(botao, true);
          A.acaoAnuncio(anuncioId, 'encerrar').then(function () { U.avisar('Vaga encerrada.', { tipo: 'ok' }); botao.remove(); }, function (e) { U.ocupado(botao, false); U.tratarErro(e); });
        });
    }
    function curriculo() {
      var p = pessoa();
      if (!p) return;
      var cartao = p.cartao || {};
      var xs = (p.experiencias || []).map(function (x) {
        return el('li', {}, [el('span', { class: 'seminegrito' }, x.funcao), ' · ' + (x.empregador || 'sem empregador informado') + ' · ' + U.mesAno(x.inicio) + ' a ' + (x.fim ? U.mesAno(x.fim) : 'hoje') +
          (x.informal ? ' · sem carteira' : '')]);
      });
      var j = U.janela({ id: 'vg-janela-curriculo', titulo: 'Currículo de ' + p.nome, corpo: [
        el('h3', { class: 'vg-emp-roteiro__titulo' }, 'Experiências'), xs.length ? el('ul', { class: 'vg-emp-lista' }, xs) : el('p', { class: 't-rotulo texto-suave' }, 'Ainda sem experiência registrada.'),
        el('dl', { class: 'vg-dados' }, [
          el('dt', {}, 'Escolaridade'), el('dd', {}, root.VAGAS_REGRAS.rotulo(root.VAGAS_REGRAS.ESCOLARIDADES, cartao.escolaridade) || '—'),
          el('dt', {}, 'Turnos'), el('dd', {}, (cartao.turnos || []).map(function (x) { return root.VAGAS_REGRAS.rotulo(root.VAGAS_REGRAS.TURNOS, x); }).join(', ') || '—'),
          el('dt', {}, 'CNH'), el('dd', {}, (cartao.cnh || []).join(', ') || 'Não tem'),
          el('dt', {}, 'Cursos'), el('dd', {}, (cartao.cursos || []).join(', ') || '—')]),
        p.sobre ? [el('h3', { class: 'vg-emp-roteiro__titulo' }, 'Sobre'), el('p', { class: 't-rotulo texto-medio vg-emp-pre' }, p.sobre)] : null,
        el('p', { class: 't-nota texto-suave' }, 'Use os dados só para esta vaga.')],
        acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-janela-curriculo-fechar', onclick: function () { j.fechar('fechar'); } }, 'Fechar')] });
    }

    function desenharLateral() {
      if (!estado) return;
      var modo = estado.modo;
      var cards = [];
      var depoisCombinou = modo === 'combinou' || modo === 'contratada';
      var p = pessoa();
      // Contato
      if (modo === 'cortado' || (erroContato && erroContato.contatoCortado)) {
        cards.push(E.caixa({ id: 'vg-contato', titulo: 'Contato' }, [el('p', { class: 't-rotulo texto-medio' }, t('avisos.contato_cortado_empresa'))]));
      } else if (depoisCombinou && p) {
        var titulo = resp && resp.anuncio ? resp.anuncio.titulo : '';
        var msg = ER.textoWhatsappCombinou({ pessoaNome: p.nome, responsavelNome: E.nomeResponsavel(), empresaNome: ctx.empresa.nomeFantasia, vagaTitulo: titulo });
        cards.push(el('section', { class: 'caixa caixa--compacta caixa--destaque', id: 'vg-contato', 'aria-labelledby': 'vg-contato-sobre' }, [
          el('p', { class: 'sobretitulo', id: 'vg-contato-sobre' }, 'Contato liberado'),
          el('div', { class: 'vg-emp-contato' }, [P.fotoMini(p.fotoUrl, { grande: true, id: 'vg-contato-foto', nome: p.nome }), el('p', { class: 'vg-emp-contato__nome', id: 'vg-contato-nome' }, p.nome)]),
          el('p', { class: 't-rotulo texto-medio', id: 'vg-contato-dados' }, [p.whatsapp ? 'WhatsApp ' + formatarWhats(p.whatsapp) : '', p.whatsapp && p.email ? ' · ' : '', p.email || '']),
          el('div', { class: 'vg-emp-acoes-coluna' }, [
            p.whatsapp ? el('a', { class: 'botao botao--principal', id: 'vg-contato-whatsapp', href: U.whatsapp(p.whatsapp, msg), target: '_blank', rel: 'noopener noreferrer' },
              [U.icone('whatsapp'), t('botoes.whatsapp') || 'Chamar no WhatsApp']) : null,
            el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-contato-curriculo', onclick: curriculo }, 'Ver currículo completo')]),
          el('p', { class: 't-nota texto-suave vg-emp-nota' }, 'Foto, nome e contato liberados pela pessoa no Combinou (ela pode cortar o acesso). Esta abertura fica registrada para ela.'),
          p.fotoUrl ? el('p', { class: 't-nota texto-suave' }, t('foto.empresa')) : null]));
      } else if (depoisCombinou && erroContato) {
        cards.push(E.caixa({ id: 'vg-contato', titulo: 'Contato' }, [el('p', { class: 't-rotulo texto-medio' }, erroContato.message)]));
      } else if (depoisCombinou) {
        cards.push(E.caixa({ id: 'vg-contato', titulo: 'Contato' }, [el('p', { class: 't-rotulo texto-suave' }, 'Carregando…')]));
      } else if (modo !== 'encerrada') {
        cards.push(E.caixa({ id: 'vg-contato', titulo: 'Contato', classe: 'caixa--compacta caixa--suave' }, [el('p', { class: 't-rotulo texto-medio' }, 'O nome e o WhatsApp aparecem quando a pessoa tocar em "Combinou".')]));
      }
      // Contratou? (só depois do Combinou) e Contratada (o Mapa DISC aparece só aqui, depois da contratação)
      if (modo === 'combinou' && !E.suspensa()) {
        var b = el('button', { type: 'button', class: 'botao botao--laranja', id: 'vg-marcar-contratada', onclick: function (ev) { marcarContratada(ev.currentTarget); } }, t('botoes.marcar_contratada') || 'Marcar como contratada');
        cards.push(E.caixa({ id: 'vg-contratou', titulo: 'Contratou?' }, [el('p', { class: 't-rotulo texto-medio' }, 'Marque aqui. A vaga pode continuar no ar ou ser encerrada.'),
          el('div', { class: 'vg-emp-acoes-coluna' }, b)]));
      }
      if (modo === 'contratada') {
        var enc = anuncioId && !E.suspensa() ? el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-contratada-encerrar', onclick: function (ev) { encerrarVaga(ev.currentTarget); } }, 'Encerrar a vaga') : null;
        cards.push(E.caixa({ id: 'vg-contratada', titulo: 'Contratada' }, [el('p', { class: 't-rotulo texto-medio' }, 'Candidatura marcada como contratada. A vaga pode continuar no ar.'),
          enc ? el('div', { class: 'vg-emp-acoes-coluna' }, enc) : null]));
        // Opcional para a pessoa e nunca para decidir se ela fica: os 90 dias coincidem com o contrato de experiência (psicologia, revisão C 3.4).
        cards.push(E.caixa({ id: 'vg-integracao', titulo: 'Integração dos 90 dias', classe: 'caixa--compacta caixa--destaque' }, [
          el('p', { class: 't-rotulo texto-medio' }, 'Se quiser, a consultoria ajuda na chegada da pessoa na equipe, com o Mapa DISC. É opcional para a pessoa, ela recebe o próprio resultado, e o resultado não pode ser usado para decidir se ela fica depois do contrato de experiência.')]));
      }
      // Referências completas (liberadas com o Combinou)
      if (depoisCombinou && p && (p.referencias || []).length) {
        cards.push(E.caixa({ id: 'vg-ref-combinou', titulo: 'Referência profissional (' + p.referencias.length + ')' }, [
          el('p', { class: 't-nota texto-suave' }, 'Liberada com o Combinou.'),
          el('ul', { class: 'vg-refs' }, p.referencias.map(function (r) { return el('li', {}, P.cartaReferencia(r)); }))]));
      }
      // Cartão (como chegou)
      var cartao = (p && p.cartao) || cartaoAntes;
      if (cartao) {
        cards.push(el('section', { class: 'vg-emp-como-chegou', id: 'vg-cartao-chegou', 'aria-labelledby': 'vg-cartao-chegou-titulo' }, [
          el('h2', { class: 'caixa__titulo', id: 'vg-cartao-chegou-titulo' }, 'Cartão (como chegou)'),
          el('ul', { class: 'vg-cartoes vg-emp-cartao-lateral' }, P.cartaoCego(cartao, {}))]));
      }
      U.trocar(lateral, cards);
      U.trocar(raizRoteiro, depoisCombinou ? roteiro() : null);
    }

    var conv = root.VAGAS_CONVERSA.montar(raizConversa, {
      lado: 'empresa', candidaturaId: candId, h1: false, voltar: { href: '#conversas', rotulo: 'Conversas' },
      somenteLeitura: E.suspensa() ? (t('avisos.empresa_suspensa_contato') || 'Esta empresa está suspensa. Fale com a Gestão sem Caos.') : '',
      cabecalho: cabecalhoConversa,
      aoMudar: function (e, r) {
        estado = e; resp = r;
        if (r && r.anuncio && r.anuncio.titulo) titulo.textContent = r.anuncio.titulo;
        if ((e.modo === 'combinou' || e.modo === 'contratada') && !E.suspensa()) carregarContato();
        if (!cartaoAntes && !(contato && contato.pessoa)) acharCartao();
        desenharLateral();
      }
    });
    return { parar: conv.parar, pronto: conv.pronto };
  }
  function formatarWhats(n) {
    var d = String(n || '').replace(/\D/g, '').replace(/^55/, '');
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
  }

  E.telas.conversas = telaConversas;
  E.telas.conversa = telaConversa;
})(typeof self !== 'undefined' ? self : this);
