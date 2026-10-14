/*
 * Vagas sem Caos — vaga.html?vaga=<CÓDIGO>: a página da vaga com "Quero"/"Pular" (docs/VAGAS-TELAS.md §2.4, mockups pessoa-vaga e
 * pessoa-vaga-enviada). O link curto /v/<código> é montado pela Pages Function (prévia do WhatsApp, sem JavaScript); o botão de lá
 * leva para a lista da cidade com ?vaga=, que abre esta página.
 *
 * "Quero" (decisão 2 do dono: exige o currículo completo):
 *   sem conta  -> guarda a intenção no aparelho ('vg.quero' = {codigo, id, em}) e vai para entrar.html?voltar=vaga.html?vaga=<código>
 *   currículo incompleto -> guarda a intenção e vai para eu.html#curriculo/1 (frente pessoa); quando a pessoa terminar, a frente
 *                           pessoa volta para vaga.html?vaga=<código> e esta tela envia a candidatura sozinha
 *   completo   -> 1º "Quero" mostra o aceite pessoa_candidatura (consentimentos.json); depois só o lembrete curto
 * "Pular": "Desfazer" por 6 s no aviso; só depois disso o pulo vai para o banco e a tela volta para a lista.
 * Vaga fora do ar: "Esta vaga não está mais no ar." + até 3 parecidas (mesma área, se a lista deste aparelho conhecia a vaga).
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var R = nodeJs ? require('./regras.js') : root.VAGAS_REGRAS;
  var CHAVE_QUERO = 'vg.quero';
  var CHAVE_ACEITE = 'vg.aceite.candidatura';
  var VALIDADE_INTENCAO = 7 * 86400000;   // a intenção de "Quero" guardada vale 7 dias

  function codigoValido(c) { var s = String(c || '').trim().toUpperCase(); return /^[A-Z0-9]{4,12}$/.test(s) ? s : ''; }
  // Intenção guardada vale para ESTA vaga e por 7 dias.
  function intencaoValida(i, codigo, agora) {
    return !!(i && i.codigo === codigo && Number(i.em) > (agora == null ? Date.now() : agora) - VALIDADE_INTENCAO);
  }
  // Linhas "Onde / Horário / Começa / …" da vaga (diária tem data, horário e valor do dia).
  function dadosDaVaga(a, U) {
    var d = [];
    var onde = [a.zona && a.zona.nome, a.cidade && a.cidade.nome].filter(Boolean).join(', ');
    if (onde) d.push(['Onde', onde]);
    if (a.modalidade === 'diaria' && a.diaria) {
      d.push(['Data', U.data(a.diaria.data)]);
      d.push(['Horário', a.diaria.inicio + ' às ' + a.diaria.fim]);
      d.push(['Valor do dia', U.valor(a.valor)]);
      d.push(['Pagamento', 'Combinado direto com a empresa']);
    } else {
      var turno = R.rotulo(R.TURNOS_VAGA, a.turno);
      if (turno) d.push(['Horário', turno + (a.fimDeSemana ? ', com fim de semana' : '') + (a.horasDia ? ', ' + a.horasDia + ' h por dia' : '')]);
      d.push(['Começa', a.inicio === 'data' && a.inicioData ? 'Em ' + U.data(a.inicioData) : 'Imediato']);
    }
    if (a.quantidade > 1) d.push(['Vagas', String(a.quantidade)]);
    if (a.publicadoEm) d.push(['Publicada', U.data(a.publicadoEm) + (a.expiraEm ? ' · fica no ar até ' + U.dataCurta(a.expiraEm) : '')]);
    return d;
  }
  function requisitosDaVaga(a) {
    var r = (a.requisitosLista || []).slice();
    var exp = R.rotulo(R.EXPERIENCIAS_VAGA, a.experiencia);
    if (exp) r.push(a.experiencia === 'nao_precisa' ? exp : 'Experiência: ' + exp.charAt(0).toLowerCase() + exp.slice(1));
    if (a.escolaridade && a.escolaridade !== 'nao_exigida') r.push('Escolaridade mínima: ' + R.rotulo(R.ESCOLARIDADES_VAGA, a.escolaridade));
    return r;
  }

  function iniciar() {
    var U = root.VAGAS_UI;
    var A = root.VAGAS_API;
    var P = root.VAGAS_PECAS;
    var el = U.el;
    var app = root.document.getElementById('app');
    var codigo = codigoValido(U.parametro('vaga') || U.parametro('codigo'));
    var anuncio = null;
    var eu = null;
    var temporizadorPulo = null;

    function voltarLista() { var s = anuncio && anuncio.cidade ? anuncio.cidade.slug : U.cidadeLembrada(); return s ? 'cidade.html?cidade=' + encodeURIComponent(s) : 'index.html'; }
    function pessoa() { return eu && eu.conta && eu.conta.tipo === 'pessoa' ? eu : null; }

    // ----------------------------------------------------------------- vaga fora do ar (com até 3 parecidas)
    function foraDoAr(mensagem) {
      root.document.title = 'Vaga fora do ar | Vagas sem Caos';
      var conhecida = null;
      var cidadeSlug = U.cidadeLembrada();
      if (cidadeSlug) {
        var g = U.armazenamento.ler('vg.lista.' + cidadeSlug);
        conhecida = g && g.anuncios ? g.anuncios.filter(function (x) { return x.codigo === codigo; })[0] : null;
      }
      var lista = el('ul', { class: 'vg-vagas', id: 'vg-parecidas' });
      U.trocar(app, [el('section', { class: 'caixa vazio', id: 'vg-vaga-fora' }, [
        el('h1', { class: 'vazio__titulo', tabindex: '-1' }, 'Esta vaga não está mais no ar.'),
        el('p', { class: 'vazio__texto' }, mensagem || 'Ela pode ter sido preenchida ou encerrada pela empresa.'),
        el('div', { class: 'acoes acoes-coluna' }, el('a', { class: 'botao botao--principal botao--grande', href: voltarLista(), id: 'vg-fora-lista' }, 'Ver as vagas abertas'))]),
        el('h2', { class: 'vg-vaga-pagina__secao', id: 'vg-parecidas-titulo', hidden: true }, 'Vagas parecidas'), lista]);
      U.focarTitulo(app);
      if (!cidadeSlug) return;
      var f = { cidade: cidadeSlug, limite: 3 };
      if (conhecida && conhecida.area) f.areas = [conhecida.area.slug];
      A.anuncios(f).then(function (r) {
        var outras = (r.anuncios || []).filter(function (x) { return x.codigo !== codigo; }).slice(0, 3);
        if (!outras.length) return;
        root.document.getElementById('vg-parecidas-titulo').hidden = false;
        U.trocar(lista, outras.map(function (a) { return P.cartaoVaga(a, { cidadeAtual: cidadeSlug }); }));
      }, function () { /* sem parecidas */ });
    }

    // ----------------------------------------------------------------- página da vaga
    function desenhar() {
      var a = anuncio;
      var emp = a.empresa || {};
      root.document.title = (a.funcao || a.titulo) + ' | Vagas sem Caos';
      var etiquetas = [el('span', { class: 'vg-etiqueta' }, P.modalidadeCurta(a.modalidade))].concat(P.etiquetasVaga(a));
      var empresaTexto = emp.confidencial
        ? [P.verificada('Empresa verificada'), ' · CNPJ conferido pela Gestão sem Caos. O nome aparece se ela chamar você para conversar.']
        : [emp.conferida ? P.verificada('Empresa verificada') : null, emp.conferida ? ' · ' + (U.t('avisos.empresa_conferida') || '') : '', emp.setor ? ' · ' + emp.setor : ''];
      var reqs = requisitosDaVaga(a);
      var beneficios = (a.beneficios || []).map(function (b) { return R.rotulo(R.BENEFICIOS, b); }).filter(Boolean);
      var artigo = el('article', { class: 'caixa surgir vg-vaga-pagina', id: 'vg-vaga', 'aria-labelledby': 'vg-vaga-titulo', data: { anuncio: a.id, codigo: a.codigo } }, [
        el('div', { class: 'vg-vaga-pagina__etiquetas' }, etiquetas),
        el('h1', { id: 'vg-vaga-titulo', class: 'vg-vaga-pagina__titulo', tabindex: '-1' }, a.funcao || a.titulo),
        el('div', { class: 'vg-vaga-pagina__empresa' }, [P.iniciais(emp.nome, { confidencial: emp.confidencial, iniciais: emp.iniciais }),
          el('div', {}, [el('p', { class: 'seminegrito', id: 'vg-vaga-empresa' }, emp.nome || ''), el('p', { class: 't-nota texto-suave' }, empresaTexto)])]),
        el('p', { class: 'vg-vaga-pagina__valor', id: 'vg-vaga-valor' }, [U.valor(a.valor) + (a.modalidade === 'estagio' ? ' de bolsa' : ''),
          a.comissao ? el('small', {}, ' + comissão') : null]),
        el('dl', { class: 'vg-dados', id: 'vg-vaga-dados' }, dadosDaVaga(a, U).map(function (x) { return [el('dt', {}, x[0]), el('dd', {}, x[1])]; })),
        el('h2', { class: 'vg-vaga-pagina__secao' }, 'O que a pessoa vai fazer'),
        el('p', { class: 'vg-vaga-pagina__texto', id: 'vg-vaga-descricao' }, a.descricao || ''),
        reqs.length ? [el('h2', { class: 'vg-vaga-pagina__secao' }, 'O que precisa'), el('ul', { class: 'vg-lista-texto', id: 'vg-vaga-requisitos' }, reqs.map(function (r) { return el('li', {}, r); }))] : null,
        beneficios.length ? [el('h2', { class: 'vg-vaga-pagina__secao' }, 'Benefícios'), el('ul', { class: 'vg-lista-texto', id: 'vg-vaga-beneficios' }, beneficios.map(function (b) { return el('li', {}, b); }))] : null,
        !emp.confidencial && emp.descricao ? [el('h2', { class: 'vg-vaga-pagina__secao' }, 'Sobre a empresa'), el('p', { class: 'vg-vaga-pagina__texto' }, emp.descricao)] : null,
        a.selo ? blocoSelo(a) : null,
        a.modalidade === 'diaria' ? el('p', { class: 'aviso', id: 'vg-vaga-bico' }, U.t('avisos.bico_mural')) : null,
        el('div', { class: 'vg-entrada__golpe' }, P.golpe({ id: 'vg-aviso-golpe', aoDenunciar: denunciar, idDenunciar: 'vg-golpe-denunciar' })),
        el('p', { class: 'vg-links-pe' }, [el('button', { type: 'button', class: 'botao botao--link', id: 'vg-denunciar', onclick: denunciar }, 'Denunciar esta vaga'), ' · ',
          el('a', { class: 'botao botao--link', id: 'vg-compartilhar', target: '_blank', rel: 'noopener noreferrer', href: U.compartilharWhatsapp(textoCompartilhar(a)) }, 'Compartilhar no WhatsApp')]),
        aceiteValido() ? el('p', { class: 't-nota texto-suave', id: 'vg-quero-lembrete' }, consentimento().lembrete_curto || '') : null
      ]);
      U.trocar(app, [el('a', { class: 'botao botao--link vg-voltar', href: voltarLista(), id: 'vg-voltar' }, [U.icone('voltar'), 'Vagas de ' + (a.cidade ? a.cidade.nome : 'volta para a lista')]), artigo]);
      desenharBarra();
      U.focarTitulo(app);
    }
    function textoCompartilhar(a) {
      var site = String((root.VAGAS_CONFIG && root.VAGAS_CONFIG.SITE_URL) || '').replace(/\/+$/, '');
      return [a.funcao || a.titulo, [a.zona && a.zona.nome, a.cidade && a.cidade.nome].filter(Boolean).join(', '), P.valorVaga(a)].filter(Boolean).join(' · ') +
        '\n' + (site ? site + '/v/' + a.codigo : root.location.href);
    }
    // Selo sugerido pela vaga (psicologia, revisão C 2.2): é só informação. Quem está logado também lê que pode se candidatar
    // sem ele; o botão mostra os minutos daquele teste no catálogo (sem "agora"); "Seu selo" só para quem já tem.
    function blocoSelo(a) {
      var nome = R.rotulo(R.TESTES_SELO, a.selo) || a.selo;
      var meu = null;
      var bloco = el('div', { class: 'vg-selo vg-selo--mini', id: 'vg-vaga-selo' }, [
        el('div', { class: 'vg-selo__topo' }, [el('span', { class: 'vg-selo__icone' }, U.icone('selo')), el('div', {}, [el('p', { class: 'vg-selo__rotulo', id: 'vg-vaga-selo-rotulo' }, 'Selo sugerido'),
          el('p', { class: 'vg-selo__nome', id: 'vg-vaga-selo-texto' }, 'Esta vaga sugere o teste de ' + nome + '. ' + (pessoa() ? 'Você pode se candidatar sem ele.' : 'Quem não tem o selo também pode se candidatar.'))])]),
        el('a', { class: 'botao botao--contorno', id: 'vg-vaga-fazer-teste', href: 'testes.html#teste/' + encodeURIComponent(a.selo) }, 'Fazer o teste')]);
      A.testesCatalogo().then(function (r) {
        var t = ((r && r.testes) || []).filter(function (x) { return x.slug === a.selo; })[0];
        var botao = root.document.getElementById('vg-vaga-fazer-teste');
        if (t && Number(t.minutos) > 0 && botao) botao.textContent = 'Fazer o teste (' + Math.round(Number(t.minutos)) + ' min)';
      }, function () { /* fica "Fazer o teste" */ });
      if (pessoa() && pessoa().pessoa && pessoa().pessoa.completo) {
        A.minhaPessoa().then(function (r) {
          meu = ((r.cartao && r.cartao.selos) || []).filter(function (s) { return s.teste === a.selo; })[0];
          if (!meu) return;
          U.trocar(root.document.getElementById('vg-vaga-selo-rotulo'), 'Seu selo');
          U.trocar(root.document.getElementById('vg-vaga-selo-texto'), 'Você já tem o selo de ' + nome + ': ' + U.t('avisos.selo_nota', { nota: Math.round(Number(meu.nota)), margem: meu.margem == null ? 10 : meu.margem }) + ', feito em ' + U.data(meu.data) + '.');
          var botao = root.document.getElementById('vg-vaga-fazer-teste');
          if (botao) botao.parentNode.removeChild(botao);
        }, function () { /* fica o texto padrão */ });
      }
      return bloco;
    }
    function desenharBarra() {
      var k = anuncio.minhaCandidatura;
      if (k && ['enviada', 'conversar', 'combinou', 'contratada'].indexOf(k.status) >= 0) {
        var botoes = k.status === 'enviada'
          ? [el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-retirar', onclick: retirar }, 'Retirar'),
            el('a', { class: 'botao botao--principal botao--grande', id: 'vg-ver-candidaturas', href: 'eu.html#candidaturas' }, 'Minhas candidaturas')]
          : [el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-ir-conversa', href: 'eu.html#conversa/' + encodeURIComponent(k.id) }, k.status === 'conversar' ? 'Responder à empresa' : 'Abrir a conversa')];
        U.fixar(U.barra({ id: 'vg-barra-vaga', dica: k.status === 'enviada' ? 'Candidatura enviada.' : 'A empresa quer conversar com você.', botoes: botoes }));
        return;
      }
      U.fixar(U.barra({ id: 'vg-barra-vaga', dica: 'Você escolhe: nada acontece sem o seu "Quero".', botoes: [
        el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-pular', onclick: pular }, 'Pular'),
        el('button', { type: 'button', class: 'botao botao--laranja botao--grande', id: 'vg-quero', onclick: quero }, 'Quero esta vaga')] }));
    }

    // ----------------------------------------------------------------- Quero
    function consentimento() {
      var c = root.VAGAS_TEXTOS && root.VAGAS_TEXTOS.consentimentos;
      return (c && c.aceites && c.aceites.pessoa_candidatura) || {};
    }
    // O aviso de candidatura vale por CONTA e por VERSÃO do texto (P2 da revisão C): outra pessoa no mesmo celular, ou um texto novo
    // de pessoa_candidatura, pede o aviso de novo. Guardado como {conta: e-mail da conta, versao, em} (vagas_eu não devolve o id).
    function versaoAceite() { return consentimento().versao || R.VERSAO_TERMOS; }
    function contaAtual() { return String((pessoa() && pessoa().conta && pessoa().conta.email) || '').trim().toLowerCase(); }
    function aceiteValido() {
      var g = U.armazenamento.ler(CHAVE_ACEITE);
      return !!(contaAtual() && g && g.conta === contaAtual() && g.versao === versaoAceite());
    }
    function guardarIntencao() { U.armazenamento.gravar(CHAVE_QUERO, { codigo: anuncio.codigo, id: anuncio.id, em: Date.now() }); }
    function quero() {
      if (!pessoa()) {
        if (eu && eu.conta) { U.avisar((R.MSG && R.MSG.SO_PESSOA) || 'Esta área é para quem procura emprego.', { tipo: 'erro' }); return; }
        guardarIntencao();
        U._api.navegar(U.linkEntrar('vaga.html?vaga=' + anuncio.codigo, ''));
        return;
      }
      if (!pessoa().pessoa || !pessoa().pessoa.completo) { irCompletar(); return; }
      if (!aceiteValido()) { pedirAceite(); return; }
      enviarQuero();
    }
    function irCompletar() {
      guardarIntencao();
      U.avisar('Falta terminar o currículo. Depois a candidatura é enviada sozinha.', { ms: 5000 });
      setTimeout(function () { U._api.navegar('eu.html#curriculo/1'); }, 900);
    }
    function pedirAceite() {
      var c = consentimento();
      var caixa = el('input', { type: 'checkbox', id: 'vg-aceite-candidatura' });
      var erro = el('p', { class: 'campo__erro', id: 'vg-aceite-candidatura-erro', role: 'alert', hidden: true });
      var enviar = el('button', { type: 'button', class: 'botao botao--laranja', id: 'vg-aceite-enviar' }, 'Enviar candidatura');
      var j = U.janela({ id: 'vg-janela-candidatura', titulo: c.titulo || 'Enviar minha candidatura', corpo: [
        el('div', { class: 'consentimento' }, [el('label', { class: 'marcar' }, [caixa, el('span', { class: 't-rotulo' }, c.texto || '')]),
          c.explicacao ? el('p', { class: 'consentimento__explicacao' }, c.explicacao) : null]), erro],
        acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-aceite-cancelar', onclick: function () { j.fechar('cancelar'); } }, 'Cancelar'), enviar] });
      enviar.addEventListener('click', function () {
        if (!caixa.checked) { erro.textContent = 'Marque a caixa para continuar'; erro.hidden = false; caixa.focus(); return; }
        U.armazenamento.gravar(CHAVE_ACEITE, { conta: contaAtual(), versao: versaoAceite(), em: Date.now() });
        j.fechar('aceite');
        enviarQuero();
      });
    }
    function enviarQuero() {
      var botao = root.document.getElementById('vg-quero');
      U.ocupado(botao, true, 'Enviando…');
      A.quero(anuncio.id).then(function (r) {
        U.armazenamento.apagar(CHAVE_QUERO);
        enviada(r.candidatura);
      }, function (e) {
        U.ocupado(botao, false);
        if (e.completar) { irCompletar(); return; }
        if (e.conexao) {
          guardarIntencao();
          U.avisar('Sem internet. Vamos enviar assim que voltar.', { tipo: 'erro', ms: 6000 });
          U.aoVoltarInternet(function () { if (U.armazenamento.ler(CHAVE_QUERO)) enviarQuero(); });
          return;
        }
        if (e.sessaoExpirada) { guardarIntencao(); U.tratarErro(e); return; }
        if (e.naoEncontrada) { foraDoAr(e.message); U.fixar(null); return; }
        U.avisar(e.message, { tipo: 'erro', ms: 6000 });
      });
    }
    function enviada() {
      var emp = anuncio.empresa || {};
      root.document.title = 'Candidatura enviada | Vagas sem Caos';
      var quem = emp.confidencial ? ['A ', el('strong', {}, 'empresa confidencial')] : [el('strong', {}, emp.nome)];
      U.trocar(app, el('section', { class: 'caixa centro surgir', id: 'vg-quero-ok', 'aria-labelledby': 'vg-quero-ok-titulo' }, [
        el('span', { class: 'vg-ok-icone' }, U.icone('check')),
        el('h1', { id: 'vg-quero-ok-titulo', class: 'titulo-pagina', tabindex: '-1' }, 'Candidatura enviada'),
        el('p', { class: 'subtitulo' }, anuncio.modalidade === 'diaria'
          ? quem.concat(' vê o seu cartão e, se chamar, libera o WhatsApp dela para combinar o dia.')
          : quem.concat(' recebe o seu cartão sem nome e sem foto: zona, experiência, escolaridade, turnos, CNH, pretensão e selos. Se ela quiser conversar, você recebe um aviso aqui e por e-mail.')),
        el('div', { class: 'aviso', id: 'vg-quero-ok-prazo' }, 'A empresa costuma responder em até 7 dias. Enquanto isso, você pode se candidatar a outras vagas.'),
        el('div', { class: 'acoes acoes-coluna' }, [el('a', { class: 'botao botao--principal botao--grande', href: voltarLista(), id: 'vg-quero-ok-voltar' }, 'Ver mais vagas'),
          el('a', { class: 'botao botao--claro botao--grande', href: 'eu.html#candidaturas', id: 'vg-quero-ok-candidaturas' }, 'Minhas candidaturas')])
      ]));
      U.fixar(U.navPessoa('vagas'));
      U.focarTitulo(app);
      U.anunciar('Candidatura enviada.');
    }

    // ----------------------------------------------------------------- Pular, retirar, denunciar
    function pular() {
      if (!pessoa()) { U._api.navegar(voltarLista()); return; }
      var desfeito = false;
      U.avisar(U.t('avisos.pular_feito') || 'Vaga pulada.', { ms: 6000, acao: { rotulo: 'Desfazer', aoClicar: function () { desfeito = true; clearTimeout(temporizadorPulo); U.anunciar('Pulo desfeito.'); } } });
      clearTimeout(temporizadorPulo);
      temporizadorPulo = setTimeout(function () {
        if (desfeito) return;
        A.pular(anuncio.id).then(function () { U._api.navegar(voltarLista()); }, function (e) { U.tratarErro(e); });
      }, 6000);
    }
    function retirar() {
      U.confirmar({ id: 'vg-confirmar-retirar', titulo: 'Retirar a candidatura?', texto: 'A empresa deixa de ver o seu cartão. Você pode se candidatar de novo enquanto a vaga estiver no ar.',
        sim: 'Retirar', perigo: true }).then(function (sim) {
        if (!sim) return;
        A.retirar(anuncio.minhaCandidatura.id).then(function () {
          U.avisar(U.t('avisos.candidatura_retirada') || 'Candidatura retirada.', { tipo: 'ok' });
          anuncio.minhaCandidatura = null;
          desenharBarra();
        }, function (e) { U.tratarErro(e); });
      });
    }
    function denunciar() { P.janelaDenuncia({ alvo: 'anuncio', id: anuncio.id }); }

    // ----------------------------------------------------------------- começo
    if (!codigo) { foraDoAr('O endereço da vaga está incompleto. Confira o link que você recebeu.'); return; }
    U.carregando(app);
    var conta = A.eu().then(function (r) { return r; }, function () { return null; });
    Promise.all([A.anuncio(codigo), conta]).then(function (r) {
      anuncio = r[0].anuncio;
      eu = r[1];
      return A.cidades().then(function (c) {
        var cid = (c.cidades || []).filter(function (x) { return anuncio.cidade && x.slug === anuncio.cidade.slug; })[0];
        U.definirFuso(cid && cid.fuso);
        U.topo({ cidade: anuncio.cidade, aoCidade: function () { U._api.navegar('index.html?escolher=1'); } });
      }, function () { U.topo({ cidade: anuncio.cidade }); });
    }).then(function () {
      if (!anuncio) return;
      desenhar();
      A.anuncioVista(codigo).catch(function () { /* contagem de vistas não atrapalha a tela */ });
      // Volta do entrar / do currículo com a intenção guardada: envia sozinho quando já dá.
      var intencao = U.armazenamento.ler(CHAVE_QUERO);
      if (intencaoValida(intencao, anuncio.codigo) && !anuncio.minhaCandidatura && pessoa() && pessoa().pessoa && pessoa().pessoa.completo) {
        U.anunciar('Enviando a sua candidatura…');
        quero();
      }
    }, function (e) {
      if (e.naoEncontrada) { U.topo({}); foraDoAr(e.message); return; }
      U.topo({});
      U.tratarErro(e, { raiz: app, aoTentar: function () { root.location.reload(); } });
    });
  }

  var VAGAS_VAGA = { codigoValido: codigoValido, intencaoValida: intencaoValida, dadosDaVaga: dadosDaVaga, requisitosDaVaga: requisitosDaVaga,
    CHAVE_QUERO: CHAVE_QUERO, iniciar: iniciar };
  if (nodeJs) module.exports = VAGAS_VAGA;
  else { root.VAGAS_VAGA = VAGAS_VAGA; iniciar(); }
})(typeof self !== 'undefined' ? self : this);
