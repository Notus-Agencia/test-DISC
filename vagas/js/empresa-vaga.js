/*
 * Vagas sem Caos — painel da empresa: VAGAS (empresa.html#vagas, #vaga/nova, #vaga/<id>, #vaga/<id>/editar, #vaga/<id>/cartoes).
 * Desenho: docs/VAGAS-TELAS.md §3.3 (nova vaga como produto: campos fechados antes da descrição), §3.4 (vaga publicada, link
 * curto, WhatsApp, números, pausar/retomar/encerrar/renovar) e §3.5 (cartões cegos). Contrato: docs/VAGAS-SPEC.md §8.4.
 * Vetos: P1 (cartão cego só "Referência de empresa verificada: sim", pela peça da casca) e P3 (nada de filtrar ou ordenar por
 * dado da pessoa: o único filtro é "Mostrar", pela situação da candidatura; a ordem é sempre a de chegada; o selo é informação).
 * Compras ocultas no lançamento (decisão 6): a vaga não mostra preço nem "Contratar".
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
  var cfg = root.VAGAS_CONFIG || {};
  var ctx = E.ctx;
  function t(c, v) { return U.t(c, v); }
  function rotulo(lista, id) { return R.rotulo(lista, id); }
  function curta(lista) { return lista.map(function (x) { return { id: x.id, rotulo: x.rotulo.replace(/\s*\(.*\)$/, '') }; }); }

  // ------------------------------------------------------------------------------------------------- dados
  function anuncios() { return A.anunciosDaEmpresa(ctx.empresa.id).then(function (r) { return r.anuncios || []; }); }
  function acharAnuncio(id) {
    return anuncios().then(function (lista) {
      var a = lista.filter(function (x) { return x.id === id; })[0];
      if (!a) { var e = new Error('Vaga não encontrada.'); e.naoEncontrada = true; throw e; }
      return a;
    });
  }
  // A vaga como a PESSOA vê no mural (confidencial sem o nome da empresa).
  function comoAPessoaVe(a) {
    var c = Object.assign({}, a);
    if (a.confidencial) c.empresa = { nome: 'Empresa confidencial', iniciais: '', confidencial: true, conferida: !!(a.empresa && a.empresa.conferida) };
    return c;
  }
  function textoWhatsapp(a) {
    var link = ER.linkCurto(a.codigo, cfg.SITE_URL);
    return ER.textoWhatsappVaga({ titulo: a.funcao || a.titulo, confidencial: a.confidencial, empresaNome: ctx.empresa.nomeFantasia,
      zona: (a.zona && a.zona.nome) || (a.cidade && a.cidade.nome) || '', valor: P.valorVaga(a), link: link });
  }

  // ------------------------------------------------------------------------------------------------- tabela de vagas (início e #vagas)
  function metaLinha(a) {
    var m = [P.modalidadeCurta(a.modalidade)];
    if (a.confidencial) m.push('confidencial');
    if (a.modalidade === 'diaria' && a.diaria) m.push(P.diaDaDiaria(a.diaria));
    if (a.zona && a.zona.nome) m.push(a.zona.nome);
    return m.filter(Boolean).join(' · ');
  }
  function acaoDaLinha(a) {
    var cartoes = ['publicado', 'pausado', 'encerrado'].indexOf(a.status) >= 0 && a.candidaturas && a.candidaturas.total > 0;
    if (cartoes) return el('a', { class: 'botao ' + (a.candidaturas.novas ? 'botao--principal' : 'botao--claro'), href: '#vaga/' + a.id + '/cartoes', data: { acao: 'cartoes' } }, 'Ver cartões');
    if (a.status === 'rascunho') return el('a', { class: 'botao botao--claro', href: '#vaga/' + a.id, data: { acao: 'editar' } }, 'Editar');
    return el('a', { class: 'botao botao--claro', href: '#vaga/' + a.id, data: { acao: 'ver' } }, 'Ver vaga');
  }
  // Situação da vaga. Publicada numa cidade que ainda não abriu (pré-abertura, VAGAS-SPEC §6.8): "Aguardando a abertura".
  function statusVaga(a) {
    if (a.aguardaAbertura) return el('span', { class: 'vg-status vg-status--revisao', data: { status: 'aguarda_abertura' } }, 'Aguardando a abertura');
    return P.status('anuncio', a.status);
  }
  function tabelaVagas(lista, op) {
    op = op || {};
    return el('div', { class: 'vg-rolagem' }, el('table', { class: 'vg-tabela', id: op.id || 'vg-emp-vagas-tabela' }, [
      el('thead', {}, el('tr', {}, [el('th', { scope: 'col' }, 'Vaga'), el('th', { scope: 'col' }, 'Status'), el('th', { scope: 'col', class: 'num' }, 'Quero'),
        el('th', { scope: 'col', class: 'num' }, 'Novos'), el('th', { scope: 'col' }, 'No ar até'), el('th', { scope: 'col' }, el('span', { class: 'visualmente-oculto' }, 'Ação'))])),
      el('tbody', {}, lista.map(function (a) {
        var no = a.status === 'publicado' || a.status === 'pausado';
        return el('tr', { data: { anuncio: a.id } }, [
          el('td', {}, [el('a', { class: 'seminegrito vg-emp-link-vaga', href: '#vaga/' + a.id }, a.funcao || a.titulo), el('span', { class: 'vg-emp-sub' }, metaLinha(a))]),
          el('td', {}, statusVaga(a)),
          el('td', { class: 'num' }, a.publicadoEm || a.candidaturas.total ? String(a.candidaturas.total) : '—'),
          el('td', { class: 'num' + (a.candidaturas.novas ? ' seminegrito' : '') }, a.publicadoEm || a.candidaturas.novas ? String(a.candidaturas.novas) : '—'),
          el('td', { class: 'nao-quebra' }, no && a.expiraEm && !a.aguardaAbertura ? U.dataCurta(a.expiraEm) : '—'),
          el('td', {}, el('div', { class: 'vg-tabela__acoes' }, acaoDaLinha(a)))]);
      }))]));
  }

  // #vagas: todas as vagas da empresa (mais nova primeiro, como vem do banco).
  function telaVagas(raiz) {
    U.carregando(raiz);
    return anuncios().then(function (lista) {
      var nova = E.suspensa() ? null : el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-emp-nova-vaga', href: '#vaga/nova' }, [U.icone('mais'), 'Nova vaga']);
      var corpo = lista.length ? E.caixa({ id: 'vg-emp-vagas', classe: 'caixa--ampla' }, [tabelaVagas(lista),
        el('p', { class: 't-nota texto-suave vg-emp-nota' }, t('avisos.vaga_em_revisao'))])
        : vazioPrimeiraVaga();
      E.tela(raiz, [E.cabecalho({ sobre: ctx.empresa.nomeFantasia, titulo: 'Minhas vagas', texto: lista.length === 1 ? '1 vaga' : lista.length + ' vagas', acoes: [nova] }), corpo]);
    }, function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { telaVagas(raiz); } }); });
  }
  function vazioPrimeiraVaga() {
    var raizVazio = el('div', { id: 'vg-emp-sem-vagas' });
    U.vazio(raizVazio, { titulo: 'Publique a primeira vaga em 5 minutos', texto: t('avisos.vaga_em_revisao'),
      botao: E.suspensa() ? null : { rotulo: 'Nova vaga', href: '#vaga/nova', id: 'vg-emp-primeira-vaga' } });
    return raizVazio;
  }

  // ------------------------------------------------------------------------------------------------- formulário (nova vaga / edição)
  var PRAZOS = [{ id: '48', rotulo: '48 horas' }, { id: '72', rotulo: '72 horas' }, { id: '120', rotulo: '5 dias' }, { id: '168', rotulo: '7 dias' }];
  var UNIDADES = { mes: 'Por mês', hora: 'Por hora', dia: 'Por dia', servico: 'Por serviço' };
  var ROTULO_VALOR = { clt: 'Salário', temporario: 'Salário', estagio: 'Bolsa', diaria: 'Valor do dia', freelancer: 'Valor' };
  var IDS = { area: 'vg-vaga-area', funcao: 'vg-vaga-funcao', modalidade: 'vg-vaga-modalidade', quantidade: 'vg-vaga-quantidade',
    salarioDe: 'vg-vaga-salario-de', salarioAte: 'vg-vaga-salario-ate', unidade: 'vg-vaga-unidade', comissao: 'vg-vaga-comissao', turno: 'vg-vaga-turno',
    fimDeSemana: 'vg-vaga-fim-de-semana', inicio: 'vg-vaga-inicio', inicioData: 'vg-vaga-inicio-data', zona: 'vg-vaga-zona', experiencia: 'vg-vaga-experiencia',
    escolaridade: 'vg-vaga-escolaridade', requisitos: 'vg-vaga-requisitos', requisitoOutro: 'vg-vaga-requisito-outro', selo: 'vg-vaga-selo',
    beneficios: 'vg-vaga-beneficios', confidencial: 'vg-vaga-confidencial', descricao: 'vg-vaga-descricao', data: 'vg-vaga-data',
    horaInicio: 'vg-vaga-hora-inicio', horaFim: 'vg-vaga-hora-fim', prazoHoras: 'vg-vaga-prazo', horasDia: 'vg-vaga-horas' };

  function telaFormulario(raiz, anuncio) {
    if (E.suspensa()) { U.vazio(raiz, { titulo: 'Conta suspensa', texto: 'Enquanto a conta estiver suspensa, as vagas ficam só para leitura.', h1: true }); return; }
    var editando = !!anuncio;
    var noAr = editando && anuncio.status !== 'rascunho';
    var rasc = U.rascunho(editando ? 'vaga.' + anuncio.id : 'vaga');
    var f = editando ? ER.formDeAnuncio(anuncio) : ER.formVazio();
    var guardado = rasc.ler();
    if (guardado && guardado.dados && guardado.dados.form) f = Object.assign(f, guardado.dados.form);
    // Vaga nova: o id que o banco deu no 1º salvar fica guardado (aqui e no rascunho do aparelho) e vale para as tentativas seguintes,
    // senão uma publicação que falha depois do salvar (sem internet, demora) cria outra vaga no 2º clique.
    var idCriado = !editando && guardado && guardado.dados && typeof guardado.dados.id === 'string' ? guardado.dados.id : null;
    var enviando = false;
    var hoje = R.hoje(U.fuso());
    var zonas = E.zonas();
    var podeConfidencial = E.verificada();
    var info = el('span', { id: 'vg-vaga-rascunho' });
    var erroGeral = el('p', { class: 'aviso aviso--erro', id: 'vg-vaga-erro', role: 'alert', hidden: true });
    var etiquetas = el('div', { class: 'vg-emp-etiquetas', id: 'vg-vaga-etiquetas', 'aria-live': 'polite' });
    var temTermo = {};
    var campos = {};

    function salvarLocal() { U.mostrarRascunho(info, rasc.gravar({ form: f, id: editando ? anuncio.id : idCriado }).hora); }
    var salvarDepois = U.aoParar(salvarLocal, 500);
    function mudou() { desenharEtiquetas(); salvarDepois(); }
    function desenharEtiquetas() {
      var lista = ER.etiquetasFiltro(f, { zonas: zonas, hoje: hoje });
      U.trocar(etiquetas, lista.length ? lista.map(function (x) { return el('span', { class: 'vg-etiqueta vg-etiqueta--selo' }, x); })
        : el('p', { class: 't-nota texto-suave' }, 'Preencha os campos fechados para ver as etiquetas.'));
    }
    function erroNoCampo(chave, msg) {
      var no = campos[chave] || campos.descricao;
      U.erroCampo(no, msg);
      try { no.focus({ preventScroll: false }); } catch (e) { /* segue */ }
      if (no.scrollIntoView) no.scrollIntoView({ block: 'center' });
    }

    // --- 1. O que é a vaga
    var botaoArea = el('button', { type: 'button', class: 'vg-emp-escolha', id: IDS.area, 'aria-haspopup': 'dialog', 'aria-describedby': IDS.area + '-ajuda', onclick: abrirAreas },
      [el('span', { class: 'vg-emp-escolha__texto' }, f.area ? rotulo(R.AREAS, f.area) : 'Escolher a área'), U.icone('seta')]);
    campos.area = botaoArea;
    function abrirAreas() {
      var escolha = E.chips({ id: 'vg-janela-area-opcoes', rotulo: 'Lista fechada de 24 áreas', opcoes: R.AREAS, valor: f.area, aoMudar: function (v) {
        f.area = v; botaoArea.firstChild.textContent = rotulo(R.AREAS, v); U.limparErroCampo(botaoArea); j.fechar('escolheu'); mudou();
      } });
      var j = U.janela({ id: 'vg-janela-area', titulo: 'Área da vaga', corpo: [escolha.no],
        acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-janela-area-fechar', onclick: function () { j.fechar('fechar'); } }, 'Fechar')] });
    }
    var area = el('div', { class: 'campo' }, [el('p', { class: 'campo__rotulo', id: IDS.area + '-rotulo' }, ['Área ', el('span', { class: 'obrigatorio' }, '(obrigatório)')]),
      botaoArea, el('span', { class: 'campo__ajuda', id: IDS.area + '-ajuda' }, 'Lista fechada de 24 áreas: é o que a pessoa filtra.')]);
    botaoArea.setAttribute('aria-labelledby', IDS.area + '-rotulo ' + IDS.area);

    var funcao = E.campo({ id: IDS.funcao, rotulo: 'Função', obrigatorio: true, valor: f.funcao, atributos: { maxlength: '60', autocomplete: 'off' },
      ajuda: t('anuncio.campos.titulo_funcao') });
    campos.funcao = funcao.campo;
    texto(funcao.campo, 'funcao');

    var blocoDiaria = el('div', { class: 'form-grade campo--largo vg-emp-diaria', id: 'vg-vaga-bloco-diaria' });
    var blocoEstagio = el('div', { class: 'campo', id: 'vg-vaga-bloco-estagio' });
    var blocoInicio = el('div', { class: 'campo', id: 'vg-vaga-bloco-inicio' });
    var rotValor = el('span', {}, ROTULO_VALOR[f.modalidade] || 'Salário');
    var unidadeVaga = el('div', { id: 'vg-vaga-bloco-unidade' });

    var modalidade = E.chips({ id: IDS.modalidade, rotulo: 'Tipo de contrato', obrigatorio: true, opcoes: curta(R.MODALIDADES), valor: f.modalidade, aoMudar: function (v) {
      f.modalidade = v;
      if (ER.unidadesDaModalidade(v).indexOf(f.unidade) < 0) f.unidade = ER.unidadePadrao(v);
      desenharModalidade(); mudou();
    } });
    campos.modalidade = modalidade.grupo;
    var quantidade = E.campo({ id: IDS.quantidade, rotulo: 'Quantas vagas', tipo: 'number', valor: f.quantidade, atributos: { min: '1', max: '100', inputmode: 'numeric' } });
    campos.quantidade = quantidade.campo;
    quantidade.campo.addEventListener('input', function () { f.quantidade = quantidade.campo.value; mudou(); });

    var salDe = el('input', { id: IDS.salarioDe, class: 'entrada', type: 'text', inputmode: 'decimal', placeholder: 'R$ 0,00', value: f.salarioDe || null, autocomplete: 'off',
      'aria-describedby': IDS.salarioDe + '-ajuda' });
    var salAte = el('input', { id: IDS.salarioAte, class: 'entrada', type: 'text', inputmode: 'decimal', placeholder: 'R$ 0,00', value: f.salarioAte || null, autocomplete: 'off',
      'aria-label': 'Até (opcional)' });
    campos.salarioDe = salDe; campos.salarioAte = salAte;
    [[salDe, 'salarioDe'], [salAte, 'salarioAte']].forEach(function (p) {
      p[0].addEventListener('input', function () { f[p[1]] = p[0].value; U.limparErroCampo(p[0]); mudou(); });
      p[0].addEventListener('blur', function () { var c = ER.centavosDe(p[0].value); if (c != null) { p[0].value = ER.textoDeCentavos(c); f[p[1]] = p[0].value; } });
    });
    var comissao = E.marcar({ id: IDS.comissao, rotulo: 'Tem comissão', marcado: f.comissao, aoMudar: function (v) {
      f.comissao = v;
      var cb = root.document.getElementById('vg-vaga-ben-comissao');
      if (cb) cb.checked = v;
      f.beneficios = f.beneficios.filter(function (b) { return b !== 'comissao'; }).concat(v ? ['comissao'] : []);
      mudou();
    } });
    var salario = el('div', { class: 'campo' }, [
      el('label', { class: 'campo__rotulo', for: IDS.salarioDe }, [rotValor, ' ', el('span', { class: 'obrigatorio' }, '(obrigatório)')]),
      el('div', { class: 'vg-emp-faixa-valor' }, [salDe, el('span', { class: 't-rotulo texto-suave', 'aria-hidden': 'true' }, 'a'), salAte]),
      el('span', { class: 'campo__ajuda', id: IDS.salarioDe + '-ajuda' }, 'Valor ou faixa (o "até" é opcional). Diária: valor do dia. Estágio: bolsa.'),
      unidadeVaga, el('div', { class: 'vg-emp-marcar-linha' }, comissao.no)]);
    campos.comissao = comissao.caixa;

    var turno = E.chips({ id: IDS.turno, rotulo: 'Turno', obrigatorio: true, opcoes: R.TURNOS_VAGA, valor: f.turno, aoMudar: function (v) { f.turno = v; mudou(); } });
    campos.turno = turno.grupo;
    var fds = E.marcar({ id: IDS.fimDeSemana, rotulo: 'Trabalha fim de semana', marcado: f.fimDeSemana, aoMudar: function (v) { f.fimDeSemana = v; mudou(); } });
    var blocoTurno = el('div', { class: 'campo' }, [turno.no, el('div', { class: 'vg-emp-marcar-linha' }, fds.no)]);

    var zona = zonas.length ? E.chips({ id: IDS.zona, rotulo: 'Zona', obrigatorio: true, opcoes: zonas.map(function (z) { return { id: z.slug, rotulo: z.nome }; }),
      valor: f.zona, aoMudar: function (v) { f.zona = v; mudou(); }, ajuda: t('anuncio.campos.zona_obrigatoria') }) : null;
    if (zona) campos.zona = zona.grupo;

    function desenharModalidade() {
      var mod = f.modalidade;
      rotValor.textContent = ROTULO_VALOR[mod] || 'Salário';
      // Unidade do valor: só quando a modalidade aceita mais de uma.
      var us = ER.unidadesDaModalidade(mod);
      if (mod && us.length > 1) {
        var u = E.chips({ id: IDS.unidade, rotulo: 'O valor é', opcoes: us.map(function (x) { return { id: x, rotulo: UNIDADES[x] }; }), valor: f.unidade || us[0],
          aoMudar: function (v) { f.unidade = v; mudou(); } });
        campos.unidade = u.grupo;
        U.trocar(unidadeVaga, u.no);
      } else U.limpar(unidadeVaga);
      // Diária: data (hoje até +7), horário, prazo no ar e o aviso do emprego doméstico.
      if (mod === 'diaria') {
        var dias = ER.proximosDias(hoje, 8);
        var dataC = E.chips({ id: IDS.data, rotulo: 'Dia do trabalho', obrigatorio: true, opcoes: dias.map(function (d) { return { id: d.data, rotulo: d.rotulo }; }),
          valor: f.data, aoMudar: function (v) { f.data = v; mudou(); } });
        var hi = E.campo({ id: IDS.horaInicio, rotulo: 'Começa às', tipo: 'time', obrigatorio: true, valor: f.horaInicio });
        var hf = E.campo({ id: IDS.horaFim, rotulo: 'Termina às', tipo: 'time', obrigatorio: true, valor: f.horaFim });
        hi.campo.addEventListener('input', function () { f.horaInicio = hi.campo.value; mudou(); });
        hf.campo.addEventListener('input', function () { f.horaFim = hf.campo.value; mudou(); });
        var prazo = E.chips({ id: IDS.prazoHoras, rotulo: 'Fica no ar por', opcoes: PRAZOS, valor: f.prazoHoras || '48', aoMudar: function (v) { f.prazoHoras = v; mudou(); },
          ajuda: t('avisos.bico_prazo') });
        campos.data = dataC.grupo; campos.horaInicio = hi.campo; campos.horaFim = hf.campo; campos.prazoHoras = prazo.grupo;
        dataC.no.classList.add('campo--largo');
        U.trocar(blocoDiaria, [dataC.no, hi.no, hf.no, prazo.no, el('p', { class: 'aviso campo--largo', id: 'vg-vaga-aviso-domestico', role: 'note' }, t('avisos.bico_diarista'))]);
        blocoDiaria.hidden = false;
      } else { U.limpar(blocoDiaria); blocoDiaria.hidden = true; }
      if (mod === 'estagio') {
        var horas = E.campo({ id: IDS.horasDia, rotulo: 'Horas por dia', tipo: 'number', obrigatorio: true, valor: f.horasDia, atributos: { min: '1', max: '6', inputmode: 'numeric' },
          ajuda: 'Estágio: até 6 horas por dia.' });
        horas.campo.addEventListener('input', function () { f.horasDia = horas.campo.value; mudou(); });
        campos.horasDia = horas.campo;
        U.trocar(blocoEstagio, horas.no);
        blocoEstagio.hidden = false;
      } else { U.limpar(blocoEstagio); blocoEstagio.hidden = true; }
      blocoInicio.hidden = mod === 'diaria';
    }
    // Começo: imediato ou numa data (dd/mm/aaaa).
    var dataInicio = el('input', { id: IDS.inicioData, class: 'entrada vg-emp-data', type: 'text', inputmode: 'numeric', placeholder: 'dd/mm/aaaa', maxlength: '10', autocomplete: 'off',
      value: f.inicioData || null, disabled: f.inicio !== 'data', 'aria-label': 'Data de início (dd/mm/aaaa)' });
    dataInicio.addEventListener('input', function () { f.inicioData = dataInicio.value; mudou(); });
    campos.inicioData = dataInicio;
    var inicio = E.chips({ id: IDS.inicio, rotulo: 'Começo', opcoes: [{ id: 'imediato', rotulo: 'Imediato' }, { id: 'data', rotulo: 'Em uma data' }], valor: f.inicio,
      aoMudar: function (v) { f.inicio = v; dataInicio.disabled = v !== 'data'; if (v === 'data') dataInicio.focus(); else U.limparErroCampo(dataInicio); mudou(); } });
    campos.inicio = inicio.grupo;
    U.trocar(blocoInicio, [inicio.no, dataInicio]);

    // --- 2. O que a vaga pede
    // Opções da lista do banco, sem as antigas acima de 6 meses (CLT, art. 442-A).
    var experiencia = E.chips({ id: IDS.experiencia, rotulo: 'Experiência', obrigatorio: true, opcoes: ER.opcoesExperiencia(), valor: f.experiencia,
      aoMudar: function (v) { f.experiencia = v; mudou(); },
      ajuda: 'Só peça experiência se a função exige. Bico e trabalho sem carteira contam. A lei não deixa exigir mais de 6 meses na mesma função (CLT, art. 442-A).' });
    campos.experiencia = experiencia.grupo;
    var escolaridade = E.chips({ id: IDS.escolaridade, rotulo: 'Escolaridade mínima', opcoes: R.ESCOLARIDADES_VAGA, valor: f.escolaridade,
      aoMudar: function (v) { f.escolaridade = v; mudou(); }, ajuda: 'Só marque se a função exige de verdade. Cada exigência afasta gente que sabe fazer o trabalho.' });
    campos.escolaridade = escolaridade.grupo;
    var outro = el('input', { id: IDS.requisitoOutro, class: 'entrada', type: 'text', maxlength: '80', placeholder: 'Qual?', value: f.requisitoOutro || null,
      disabled: f.requisitos.indexOf('outro') < 0, 'aria-label': 'Outro requisito' });
    campos.requisitoOutro = outro;
    texto(outro, 'requisitoOutro');
    var requisitos = el('div', { class: 'vg-checks', id: IDS.requisitos, role: 'group', 'aria-labelledby': IDS.requisitos + '-rotulo' }, R.REQUISITOS_VAGA.map(function (r) {
      return E.marcar({ id: 'vg-vaga-req-' + r.id, rotulo: r.id === 'curso_registro' ? 'Curso ou registro profissional' : r.rotulo.replace('CNH categoria ', 'CNH '),
        marcado: f.requisitos.indexOf(r.id) >= 0, valor: r.id, aoMudar: function (v) {
          f.requisitos = f.requisitos.filter(function (x) { return x !== r.id; }).concat(v ? [r.id] : []);
          if (r.id === 'outro') { outro.disabled = !v; if (v) outro.focus(); else U.limparErroCampo(outro); }
          mudou();
        } }).no;
    }));
    campos.requisitos = requisitos;
    var blocoRequisitos = el('div', { class: 'campo' }, [el('p', { class: 'campo__rotulo', id: IDS.requisitos + '-rotulo' }, 'Requisitos objetivos'), requisitos, outro]);
    var selo = E.chips({ id: IDS.selo, rotulo: 'Selo sugerido', opcional: true, opcoes: [{ id: 'nenhum', rotulo: 'Nenhum' }].concat(R.TESTES_SELO), valor: f.selo || 'nenhum',
      aoMudar: function (v) { f.selo = v; mudou(); },
      ajuda: 'Quem não tem o selo também pode se candidatar, e o cartão chega do mesmo jeito. O teste é opcional: sem selo não quer dizer que a pessoa não sabe. Sem nota mínima.' });
    campos.selo = selo.grupo;

    // --- 3. O que a vaga oferece
    var beneficios = el('div', { class: 'vg-checks', id: IDS.beneficios, role: 'group', 'aria-labelledby': IDS.beneficios + '-rotulo' }, R.BENEFICIOS.map(function (b) {
      return E.marcar({ id: 'vg-vaga-ben-' + b.id, rotulo: b.rotulo, marcado: f.beneficios.indexOf(b.id) >= 0 || (b.id === 'comissao' && f.comissao), valor: b.id, aoMudar: function (v) {
        f.beneficios = f.beneficios.filter(function (x) { return x !== b.id; }).concat(v ? [b.id] : []);
        if (b.id === 'comissao') { f.comissao = v; comissao.caixa.checked = v; }
        mudou();
      } }).no;
    }));
    campos.beneficios = beneficios;
    var blocoBeneficios = el('div', { class: 'campo' }, [el('p', { class: 'campo__rotulo', id: IDS.beneficios + '-rotulo' }, 'Benefícios'), beneficios]);
    var confidencial = E.chips({ id: IDS.confidencial, rotulo: 'Nome da empresa', opcoes: [{ id: 'nao', rotulo: 'Mostrar "' + ctx.empresa.nomeFantasia + '"' },
      { id: 'sim', rotulo: 'Confidencial', desabilitado: !podeConfidencial }], valor: f.confidencial ? 'sim' : 'nao',
      aoMudar: function (v) { f.confidencial = v === 'sim'; mudou(); },
      ajuda: podeConfidencial ? t('avisos.empresa_confidencial_empresa') : 'Só empresa com CNPJ conferido pode anunciar como confidencial.' });
    campos.confidencial = confidencial.grupo;

    // --- 4. Descrição (o único texto livre)
    var descricao = E.campo({ id: IDS.descricao, rotulo: 'O que a pessoa vai fazer no dia a dia', obrigatorio: true, multilinha: true, linhas: '5', valor: f.descricao,
      atributos: { maxlength: '1500' }, largo: true, depois: el('p', { class: 'vg-contador', id: IDS.descricao + '-contador' }),
      ajuda: 'De 40 a 1.500 letras. Só a função e a rotina: os requisitos vão nos campos acima.' });
    campos.descricao = descricao.campo;
    var contadorDesc = descricao.no.querySelector('#' + IDS.descricao + '-contador');
    function contar() { contadorDesc.textContent = descricao.campo.value.length + ' de 1500'; }
    descricao.campo.addEventListener('input', contar);
    contar();
    texto(descricao.campo, 'descricao');

    // Texto livre: ao sair do campo (e enquanto corrige) confere os termos proibidos; com termo, "Enviar para publicar" fica desligado.
    function texto(campo, chave) {
      var conferir = U.aoParar(function () { conferirTermo(campo, chave, false); }, 400);
      campo.addEventListener('input', function () { f[chave] = campo.value; mudou(); if (temTermo[chave]) conferir(); });
      campo.addEventListener('blur', function () { conferirTermo(campo, chave, true); });
    }
    function conferirTermo(campo, chave, mostrar) {
      var l = chave === 'requisitoOutro' && f.requisitos.indexOf('outro') < 0 ? [] : ER.termosProibidos(campo.value, 'anuncio');
      temTermo[chave] = l.length > 0;
      if (l.length && (mostrar || temTermo[chave])) U.erroCampo(campo, ER.mensagemTermos(l, { descricao: chave === 'descricao' }));
      else if (!l.length) U.limparErroCampo(campo);
      atualizarBotoes();
    }

    // --- ações
    var botoes = [];
    var publicar = el('button', { type: 'button', class: 'botao botao--laranja botao--grande', id: noAr ? 'vg-vaga-salvar' : 'vg-vaga-publicar', onclick: function () { enviar(!noAr); } },
      noAr ? 'Salvar alterações' : 'Enviar para publicar');
    var salvar = noAr ? null : el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-vaga-salvar-rascunho', onclick: function () { enviar(false); } }, 'Salvar rascunho');
    botoes.push(salvar, publicar);
    function atualizarBotoes() {
      var algum = Object.keys(temTermo).some(function (k) { return temTermo[k]; });
      publicar.disabled = algum;
      publicar.setAttribute('aria-describedby', algum ? 'vg-vaga-termo-nota' : '');
      notaTermo.hidden = !algum;
    }
    var notaTermo = el('p', { class: 't-nota texto-suave', id: 'vg-vaga-termo-nota', hidden: true }, 'Corrija o texto marcado em vermelho para enviar.');

    function enviar(publicarDepois) {
      if (enviando) return;
      erroGeral.hidden = true;
      var v = ER.validarVaga(f, { hoje: hoje, zonas: zonas, empresaId: editando || idCriado ? null : ctx.empresa.id, id: editando ? anuncio.id : idCriado });
      if (!v.ok) { erroNoCampo(v.campo, v.erro); if (v.termo) { temTermo[v.campo] = true; atualizarBotoes(); } return; }
      var alvo = publicarDepois ? publicar : (salvar || publicar);
      enviando = true;
      botoes.forEach(function (b) { if (b) b.disabled = true; });
      U.ocupado(alvo, true, publicarDepois ? 'Enviando…' : 'Salvando…');
      A.salvarAnuncio(v.dados).then(function (r) {
        var an = r.anuncio;
        if (!editando && an && an.id) { idCriado = an.id; salvarLocal(); }
        if (!publicarDepois) return { anuncio: an, publicada: false };
        return A.publicarAnuncio(an.id).then(function (p) { return { anuncio: p.anuncio, publicada: true, emRevisao: p.emRevisao }; });
      }).then(function (x) {
        enviando = false;
        rasc.apagar();
        U.ocupado(alvo, false);
        if (x.publicada) U.avisar(x.emRevisao ? t('avisos.vaga_em_revisao') : x.anuncio && x.anuncio.aguardaAbertura ? (x.anuncio.avisoAbertura || E.avisoAbertura()) : 'Vaga publicada.', { tipo: 'ok', ms: 6000 });
        else U.avisar('Salvo', { tipo: 'ok' });
        E.irPara('vaga/' + x.anuncio.id);
      }, function (e) {
        enviando = false;
        U.ocupado(alvo, false);
        botoes.forEach(function (b) { if (b) b.disabled = false; });
        atualizarBotoes();
        if (e.sessaoExpirada || e.confirmar || e.suspensa || e.conexao) { U.tratarErro(e); return; }
        var c = ER.campoDoErro(e.message, f);
        if (c && campos[c]) erroNoCampo(c, e.message);
        else { erroGeral.textContent = e.message; erroGeral.hidden = false; erroGeral.focus && erroGeral.focus(); }
      });
    }

    // --- montagem
    var devolvida = editando && anuncio.status === 'rascunho' && anuncio.statusMotivo ? E.motivo(anuncio.statusMotivo, { vaga_titulo: anuncio.funcao }) : null;
    var form = el('form', { id: 'vg-form-vaga', class: 'caixa caixa--ampla vg-emp-form', novalidate: true, onsubmit: function (ev) { ev.preventDefault(); enviar(!noAr); } }, [
      devolvida ? el('div', { class: 'aviso aviso--erro', id: 'vg-vaga-devolvida', role: 'note' }, [el('p', { class: 'seminegrito' }, 'A operação devolveu esta vaga' + (devolvida.titulo ? ': ' + devolvida.titulo : '') + '.'),
        el('p', {}, devolvida.texto), devolvida.correcao ? el('p', {}, devolvida.correcao) : null]) : null,
      el('fieldset', { class: 'vg-emp-bloco' }, [el('legend', { class: 'vg-emp-bloco__titulo' }, '1. O que é a vaga'),
        el('div', { class: 'form-grade' }, [area, funcao.no, modalidade.no, quantidade.no, salario, blocoTurno, blocoInicio, blocoEstagio, zona ? zona.no : null, blocoDiaria])]),
      el('fieldset', { class: 'vg-emp-bloco' }, [el('legend', { class: 'vg-emp-bloco__titulo' }, '2. O que a vaga pede'),
        el('div', { class: 'form-grade' }, [experiencia.no, escolaridade.no, blocoRequisitos, selo.no])]),
      el('fieldset', { class: 'vg-emp-bloco' }, [el('legend', { class: 'vg-emp-bloco__titulo' }, '3. O que a vaga oferece'),
        el('div', { class: 'form-grade' }, [blocoBeneficios, confidencial.no])]),
      el('fieldset', { class: 'vg-emp-bloco' }, [el('legend', { class: 'vg-emp-bloco__titulo' }, '4. Descrição'), descricao.no]),
      erroGeral,
      !noAr && E.preAbertura() ? el('p', { class: 'aviso', id: 'vg-vaga-pre-abertura', role: 'note' }, E.avisoAbertura()) : null,
      el('div', { class: 'vg-emp-acoes-form' }, botoes.filter(Boolean)), notaTermo
    ]);
    var lateral = el('aside', { class: 'vg-lateral', 'aria-label': 'Ajuda' }, [
      E.caixa({ id: 'vg-vaga-filtros-previa', titulo: 'Como a vaga aparece nos filtros', classe: 'caixa--compacta caixa--destaque' },
        [etiquetas, el('p', { class: 't-nota texto-suave vg-emp-nota' }, 'Cada campo fechado vira um filtro para quem procura. O texto livre não entra na busca.')]),
      E.caixa({ id: 'vg-vaga-nao-entra', titulo: 'O que não entra no anúncio' }, [E.lista(['Idade, sexo, "boa aparência", estado civil, filhos, religião, nacionalidade.',
        'Taxa, Pix, "investimento inicial", link encurtado, telefone no texto.', 'Vaga sem salário ou sem valor da diária.']),
        el('p', { class: 't-nota texto-suave vg-emp-nota' }, t('anuncio.lei_resumo'))]),
      E.caixa({ id: 'vg-vaga-diaria-ajuda', titulo: 'Diária ou bico' }, [el('p', { class: 't-rotulo texto-medio' }, t('avisos.bico_valor_obrigatorio') + ' ' + t('avisos.bico_prazo')),
        el('p', { class: 't-nota texto-suave vg-emp-nota' }, t('avisos.bico_mural'))])
    ]);
    E.tela(raiz, [
      E.cabecalho({ sobre: 'Minhas vagas', titulo: editando ? (noAr ? 'Editar vaga' : 'Continuar a vaga') : 'Nova vaga', idTitulo: 'vg-vaga-titulo',
        texto: 'Primeiro os campos fechados (é por eles que as pessoas acham a vaga nos filtros), depois a descrição. Salário é obrigatório.',
        acoes: [el('p', { class: 'vg-rascunho' }, info)] }),
      el('div', { class: 'vg-grade' }, [form, lateral])
    ]);
    desenharModalidade();
    desenharEtiquetas();
    if (guardado && guardado.em) U.mostrarRascunho(info, U.hora(new Date(guardado.em).toISOString()));
    // Rascunho que voltou com termo proibido: já mostra a marca.
    ['funcao', 'descricao', 'requisitoOutro'].forEach(function (k) { if (f[k] && ER.termosProibidos(f[k], 'anuncio').length) conferirTermo(campos[k], k, true); });
  }

  // ------------------------------------------------------------------------------------------------- vaga publicada
  function textoSituacao(a) {
    var p = [];
    if (a.status === 'publicado') p.push('No ar desde ' + U.dataCurta(a.publicadoEm) + (a.expiraEm ? ', até ' + U.dataCurta(a.expiraEm) : '') + '.');
    else if (a.status === 'em_revisao') p.push('Em revisão: a operação confere em até 1 dia útil.');
    else if (a.status === 'pausado') p.push('Pausada: não aparece no mural até você retomar.' + (a.expiraEm ? ' Prazo até ' + U.dataCurta(a.expiraEm) + '.' : ''));
    else if (a.status === 'encerrado') p.push('Encerrada' + (a.encerradoEm ? ' em ' + U.dataCurta(a.encerradoEm) : '') + '.');
    else if (a.status === 'suspenso') p.push('Fora do ar por denúncias: a operação está analisando.');
    else if (a.status === 'removido') p.push('Removida pela moderação.');
    if (a.status === 'publicado' && a.expirado) p[0] = 'O prazo acabou em ' + U.dataCurta(a.expiraEm) + '. Use "Renovar" para voltar ao ar.';
    if (a.aguardaAbertura) p[0] = a.avisoAbertura || E.avisoAbertura(a.cidade);
    if (a.confidencial) p.push('Confidencial.');
    var c = a.candidaturas || {};
    if (a.publicadoEm || c.total) p.push((c.total === 1 ? '1 pessoa disse "Quero"' : (c.total || 0) + ' pessoas disseram "Quero"') + '; ' + (c.novas === 1 ? '1 cartão novo.' : (c.novas || 0) + ' cartões novos.'));
    return p.join(' ');
  }
  function telaVaga(raiz, id) {
    U.carregando(raiz);
    return acharAnuncio(id).then(function (a) {
      if (a.status === 'rascunho') return telaFormulario(raiz, a);
      return A.anuncioNumeros(a.id).then(function (n) { return n.numeros; }, function () { return null; }).then(function (n) { desenharVaga(raiz, a, n); });
    }, function (e) {
      if (e.naoEncontrada) { U.vazio(raiz, { titulo: 'Vaga não encontrada', texto: 'Ela pode ter sido apagada ou é de outra empresa.', botao: { rotulo: 'Minhas vagas', href: '#vagas' }, h1: true }); return; }
      U.tratarErro(e, { raiz: raiz, aoTentar: function () { telaVaga(raiz, id); } });
    });
  }
  function desenharVaga(raiz, a, n) {
    var ocupadoEm = null;
    var so = E.suspensa() || a.status === 'suspenso' || a.status === 'removido';
    function acao(nome, aviso) {
      return function (ev) {
        var b = ev.currentTarget;
        U.ocupado(b, true);
        A.acaoAnuncio(a.id, nome).then(function (r) {
          U.avisar(aviso, { tipo: 'ok' });
          return A.anuncioNumeros(a.id).then(function (x) { return x.numeros; }, function () { return n; }).then(function (nn) { desenharVaga(raiz, r.anuncio, nn); U.focarTitulo(raiz); });
        }, function (e) { U.ocupado(b, false); U.tratarErro(e); });
      };
    }
    function encerrar(ev) {
      ocupadoEm = ev.currentTarget;
      U.confirmar({ id: 'vg-confirmar-encerrar', titulo: 'Encerrar a vaga?', texto: 'Quem está em conversa continua; os cartões novos param de chegar.', sim: t('botoes.encerrar') || 'Encerrar vaga', perigo: true })
        .then(function (sim) { if (sim) acao('encerrar', 'Vaga encerrada.')({ currentTarget: ocupadoEm }); });
    }
    var c = a.candidaturas || {};
    var acoes = so ? [] : [
      ['publicado', 'pausado', 'encerrado'].indexOf(a.status) >= 0 ? el('a', { class: 'botao botao--principal', id: 'vg-vaga-ver-cartoes', href: '#vaga/' + a.id + '/cartoes' },
        c.total ? 'Ver ' + c.total + (c.total === 1 ? ' cartão' : ' cartões') : 'Ver cartões') : null,
      el('a', { class: 'botao botao--claro', id: 'vg-vaga-editar', href: '#vaga/' + a.id + '/editar' }, 'Editar'),
      a.status === 'publicado' && !a.expirado ? el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-vaga-pausar', onclick: acao('pausar', 'Vaga pausada.') }, t('botoes.pausar') || 'Pausar') : null,
      a.status === 'pausado' && !a.expirado ? el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-vaga-retomar', onclick: acao('retomar', 'Vaga de volta ao ar.') }, t('botoes.retomar') || 'Retomar') : null,
      ER.podeRenovar(a) ? el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-vaga-renovar', onclick: acao('renovar', 'Vaga renovada.') }, 'Renovar') : null,
      ['publicado', 'pausado', 'em_revisao'].indexOf(a.status) >= 0 ? el('button', { type: 'button', class: 'botao botao--perigo', id: 'vg-vaga-encerrar', onclick: encerrar }, 'Encerrar') : null
    ].filter(Boolean);
    var removida = a.status === 'removido' && a.statusMotivo ? E.motivo(a.statusMotivo, { vaga_titulo: a.funcao }) : null;
    var principal = [];
    if (removida) principal.push(el('div', { class: 'aviso aviso--erro', id: 'vg-vaga-motivo', role: 'note' }, [el('p', {}, removida.texto), removida.correcao ? el('p', {}, removida.correcao) : null]));
    // Aguardando a abertura: o link curto e a mensagem do WhatsApp só funcionam quando a cidade abrir.
    if (a.aguardaAbertura) principal.push(E.caixa({ id: 'vg-vaga-aguarda', titulo: 'Divulgar', classe: 'caixa--ampla' }, [
      el('p', { class: 't-rotulo texto-medio' }, a.avisoAbertura || E.avisoAbertura(a.cidade)),
      el('p', { class: 't-nota texto-suave vg-emp-nota' }, 'O link curto e a mensagem para o WhatsApp aparecem aqui quando a vaga entrar no ar.')]));
    else if (a.status === 'publicado' || a.status === 'pausado') principal.push(divulgar(a));
    principal.push(E.caixa({ id: 'vg-vaga-como-aparece', titulo: 'Como aparece para as pessoas', classe: 'caixa--ampla' },
      [el('ul', { class: 'vg-vagas vg-emp-previa-vaga' }, P.cartaoVaga(comoAPessoaVe(a), { href: '#vaga/' + a.id }))]));
    var lateral = [numeros(a, n)];
    E.tela(raiz, [
      E.cabecalho({ sobre: 'Minhas vagas', titulo: a.funcao || a.titulo, idTitulo: 'vg-vaga-h1', idTexto: 'vg-vaga-situacao', texto: textoSituacao(a),
        extra: el('p', { class: 'vg-emp-situacao' }, statusVaga(a)) }),
      acoes.length ? el('div', { class: 'vg-emp-acoes-vaga', id: 'vg-vaga-acoes' }, acoes) : null,
      el('div', { class: 'vg-grade' }, [el('div', { class: 'vg-lateral' }, principal), el('aside', { class: 'vg-lateral', 'aria-label': 'Números' }, lateral)])
    ]);
  }
  function divulgar(a) {
    var link = ER.linkCurto(a.codigo, cfg.SITE_URL);
    var msg = textoWhatsapp(a);
    var campoLink = el('input', { id: 'vg-vaga-link', class: 'entrada codigo', type: 'text', readOnly: true, value: link, 'aria-label': 'Link curto da vaga' });
    function copiarCom(botao, texto) {
      return function () {
        U.copiar(texto).then(function () {
          var antes = botao.getAttribute('data-texto') || botao.textContent;
          botao.setAttribute('data-texto', antes);
          U.trocar(botao, [U.icone('check'), 'Copiado']);
          U.anunciar('Copiado');
          setTimeout(function () { U.trocar(botao, [U.icone('copiar'), botao.getAttribute('data-texto')]); }, 2000);
        }, function (e) { U.avisar(e.message, { tipo: 'erro' }); });
      };
    }
    var copiar = el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-vaga-copiar' }, [U.icone('copiar'), 'Copiar']);
    copiar.setAttribute('data-texto', 'Copiar');
    copiar.addEventListener('click', copiarCom(copiar, link));
    var copiarMsg = el('button', { type: 'button', class: 'botao botao--link', id: 'vg-vaga-copiar-mensagem' }, [U.icone('copiar'), t('botoes.copiar_mensagem') || 'Copiar mensagem']);
    copiarMsg.setAttribute('data-texto', t('botoes.copiar_mensagem') || 'Copiar mensagem');
    copiarMsg.addEventListener('click', copiarCom(copiarMsg, msg));
    return E.caixa({ id: 'vg-vaga-divulgar', titulo: 'Divulgar', classe: 'caixa--ampla' }, [
      el('p', { class: 'campo__rotulo seminegrito' }, 'Link curto da vaga'),
      campoLink,
      el('div', { class: 'vg-emp-divulgar-acoes' }, [copiar,
        el('a', { class: 'botao botao--principal', id: 'vg-vaga-whatsapp', href: U.compartilharWhatsapp(msg), target: '_blank', rel: 'noopener noreferrer' },
          [U.icone('whatsapp'), t('botoes.compartilhar') || 'Compartilhar no WhatsApp'])]),
      el('p', { class: 't-nota texto-suave vg-emp-nota' }, 'O link abre a prévia da vaga no WhatsApp (cargo, salário, zona) e leva direto para o "Quero".'),
      el('div', { class: 'vg-emp-mensagem', id: 'vg-vaga-mensagem' }, [el('p', { class: 't-rotulo texto-medio' }, [el('span', { class: 'seminegrito' }, 'Mensagem pronta: '), msg]), copiarMsg])
    ]);
  }
  function numeros(a, n) {
    if (!n) return E.caixa({ id: 'vg-vaga-numeros', titulo: 'Números desta vaga' }, [el('p', { class: 't-rotulo texto-suave' }, 'Os números aparecem depois que a vaga vai ao ar.')]);
    var linhas = [['Vistas', n.vistas], ['Quero', n.quero], ['Com selo', n.quero ? n.comSelo + ' de ' + n.quero : '0'], ['Conversas', n.conversas], ['Combinou', n.combinou],
      ['Contratadas', n.contratadas]];
    return E.caixa({ id: 'vg-vaga-numeros', titulo: 'Números desta vaga' }, [
      el('dl', { class: 'vg-dados vg-emp-numeros' }, linhas.map(function (l) { return [el('dt', {}, l[0]), el('dd', { class: 'tabular' }, String(l[1] == null ? 0 : l[1]))]; })),
      el('p', { class: 't-nota texto-suave vg-emp-nota' }, 'Só totais: nenhum número diz quem é a pessoa.')]);
  }

  // ------------------------------------------------------------------------------------------------- cartões cegos
  function telaCartoes(raiz, id, filtroInicial) {
    U.carregando(raiz);
    var filtro = filtroInicial || 'novos';
    return Promise.all([acharAnuncio(id), A.cartoes(id, {})]).then(function (r) {
      var a = r[0];
      var lista = r[1].cartoes || [];
      lista.forEach(function (c) { E.lembrarAnuncio(c.candidaturaId, a.id); });
      desenhar(a, lista);
    }, function (e) {
      if (e.naoEncontrada) { U.vazio(raiz, { titulo: 'Vaga não encontrada', texto: 'Ela pode ter sido apagada ou é de outra empresa.', botao: { rotulo: 'Minhas vagas', href: '#vagas' }, h1: true }); return; }
      U.tratarErro(e, { raiz: raiz, aoTentar: function () { telaCartoes(raiz, id, filtro); } });
    });
    function recarregar() { telaCartoes(raiz, id, filtro).then(function () { U.focarTitulo(raiz); }); }
    function desenhar(a, lista) {
      var total = lista.length;
      var titulo = total === 0 ? 'Ninguém se candidatou ainda' : total === 1 ? '1 pessoa quer esta vaga' : total + ' pessoas querem esta vaga';
      var cab = E.cabecalho({ sobre: (a.funcao || a.titulo) + (a.confidencial ? ' · Confidencial' : ''), titulo: titulo, idTitulo: 'vg-cartoes-titulo',
        texto: 'Por ordem de chegada. Sem nome, foto, idade ou nacionalidade até vocês combinarem. Quem decide é você.',
        // Como ler o selo no momento da decisão (psicologia, revisão C 3.2; padroes.md §5.4).
        extra: el('p', { class: 't-rotulo texto-medio vg-emp-nota', id: 'vg-cartoes-selo' }, 'O selo é informação, não requisito: o teste é opcional e nem toda função tem teste. ' +
          'Sem selo não quer dizer que a pessoa não sabe. A nota tem margem de cerca de 10 pontos e não serve para ordenar pessoas.'),
        acoes: [el('a', { class: 'botao botao--claro', href: '#vaga/' + a.id, id: 'vg-cartoes-voltar' }, [U.icone('voltar'), 'Voltar para a vaga'])] });
      if (!total) {
        var vazio = el('div', { id: 'vg-cartoes-vazio' });
        U.vazio(vazio, { texto: a.aguardaAbertura ? (a.avisoAbertura || E.avisoAbertura(a.cidade)) : 'Ninguém se candidatou ainda. Compartilhe o link no WhatsApp: é por lá que as pessoas chegam.',
          botao: a.status === 'publicado' && !a.aguardaAbertura ? { rotulo: t('botoes.compartilhar') || 'Compartilhar no WhatsApp', href: U.compartilharWhatsapp(textoWhatsapp(a)), id: 'vg-cartoes-compartilhar' } : null });
        var b = vazio.querySelector('#vg-cartoes-compartilhar');
        if (b) { b.setAttribute('target', '_blank'); b.setAttribute('rel', 'noopener noreferrer'); }
        E.tela(raiz, [cab, vazio]);
        return;
      }
      // "Mostrar": o único filtro, pela situação da candidatura (veto P3). A contagem de cada opção ajuda a não perder ninguém.
      var opcoes = ER.FILTROS_CARTOES.map(function (x) { return { id: x.id, rotulo: x.rotulo + ' (' + ER.filtrarCartoes(lista, x.id).length + ')' }; });
      var mostrar = E.chips({ id: 'vg-cartoes-filtros', rotulo: 'Mostrar', opcoes: opcoes, valor: filtro, aoMudar: function (v) { filtro = v; desenharLista(); } });
      var ul = el('ul', { class: 'vg-cartoes', id: 'vg-cartoes' });
      function desenharLista() {
        var vistos = ER.filtrarCartoes(lista, filtro);
        U.trocar(ul, vistos.length ? vistos.map(function (x) { return cartao(a, x.cartao, x.ordem); })
          : el('li', { class: 'caixa vazio vg-emp-sem-cartoes' }, el('p', { class: 'vazio__texto' }, 'Nenhum cartão nesta lista.')));
      }
      desenharLista();
      E.tela(raiz, [cab, el('div', { class: 'vg-emp-mostrar' }, mostrar.no), ul,
        el('p', { class: 't-nota texto-suave vg-emp-nota' }, t('avisos.combinou_agora_nao_empresa'))]);
    }
    function cartao(a, c, ordem) {
      var st = c.status;
      var acoes = [];
      var so = E.suspensa();
      if (!so && st === 'enviada') {
        acoes.push(el('button', { type: 'button', class: 'botao botao--claro', data: { acao: 'agora_nao' }, onclick: function (ev) { agoraNao(ev.currentTarget, c); } }, t('botoes.agora_nao') || 'Agora não'));
        acoes.push(el('button', { type: 'button', class: 'botao botao--principal', data: { acao: 'conversar' }, onclick: function () { chamar(c, a, recarregar); } }, t('botoes.quero_conversar') || 'Quero conversar'));
      } else if (st === 'conversar') {
        if (!so) acoes.push(el('button', { type: 'button', class: 'botao botao--claro', data: { acao: 'agora_nao' }, onclick: function (ev) { agoraNao(ev.currentTarget, c); } }, t('botoes.agora_nao') || 'Agora não'));
        acoes.push(el('a', { class: 'botao botao--principal', href: '#conversa/' + c.candidaturaId, data: { acao: 'ver-conversa' } }, 'Ver conversa'));
      } else if (st === 'combinou' || st === 'contratada') {
        acoes.push(el('a', { class: 'botao botao--principal vg-emp-acao-larga', href: '#conversa/' + c.candidaturaId, data: { acao: 'ver-conversa' } }, 'Ver conversa e contato'));
      } else if (st === 'agora_nao' && !so) {
        acoes.push(el('button', { type: 'button', class: 'botao botao--link vg-emp-acao-larga', data: { acao: 'mudar' }, onclick: function () { chamar(c, a, recarregar); } }, 'Mudar para "Quero conversar"'));
      }
      var no = P.cartaoCego(c.cartao, { ordem: ordem, chegouEm: c.chegouEm, status: st, acoes: acoes, decidido: st === 'agora_nao', candidaturaId: c.candidaturaId,
        idReferencia: 'vg-ref-cartao-' + ordem });
      var linha = st === 'conversar' ? 'Esperando a pessoa aceitar.' : c.contatoCortado ? t('avisos.contato_cortado_empresa')
        : st === 'recusada' || st === 'retirada' ? 'A pessoa encerrou esta candidatura.' : '';
      if (linha) {
        var antes = no.querySelector('.vg-cartao__acoes');
        no.insertBefore(el('p', { class: 'vg-cartao__status' }, linha), antes);
      }
      return no;
    }
    function agoraNao(botao, c) {
      U.ocupado(botao, true);
      A.decidir(c.candidaturaId, 'agora_nao').then(function () {
        U.avisar(t('avisos.combinou_agora_nao_empresa'), { tipo: 'ok', ms: 6000 });
        recarregar();
      }, function (e) { U.ocupado(botao, false); U.tratarErro(e); });
    }
  }
  // "Quero conversar" com primeira mensagem opcional (decisão 3 do dono). Escrever já vale como "Quero conversar".
  function chamar(c, a, depois) {
    var campo = el('textarea', { id: 'vg-chamar-texto', class: 'entrada', rows: '4', maxlength: '1000', placeholder: 'Ex.: dia e hora da entrevista',
      'aria-describedby': 'vg-chamar-contador vg-chamar-nota' });
    var cont = el('p', { class: 'vg-contador', id: 'vg-chamar-contador' }, '0 de 1000');
    campo.addEventListener('input', function () { cont.textContent = campo.value.length + ' de 1000'; U.limparErroCampo(campo); });
    var enviar = el('button', { type: 'button', class: 'botao botao--principal', id: 'vg-chamar-enviar' }, 'Chamar para conversar');
    var j = U.janela({ id: 'vg-janela-chamar', titulo: 'Quero conversar', foco: '#vg-chamar-texto', corpo: [
      el('p', { class: 't-rotulo texto-medio' }, 'Vaga: ' + (a.funcao || a.titulo)),
      el('label', { class: 'campo__rotulo', for: 'vg-chamar-texto' }, ['Escreva a primeira mensagem ', el('span', { class: 'obrigatorio' }, '(opcional)')]),
      campo, cont, el('p', { class: 't-nota texto-suave', id: 'vg-chamar-nota' }, t('mensagem.aviso_empresa'))],
      acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-chamar-cancelar', onclick: function () { j.fechar('cancelar'); } }, 'Cancelar'), enviar] });
    // Id da mensagem: um por texto. Se o envio "falhou" mas chegou ao servidor (demora, internet caindo), tocar de novo com o
    // mesmo texto reaproveita o id e o banco não grava a mensagem duas vezes (como o conversa.js faz).
    var idMsg = null;
    var textoMsg = null;
    enviar.addEventListener('click', function () {
      var texto = campo.value.trim();
      if (texto) {
        var erro = root.VAGAS_CONVERSA.validarTexto(texto);
        if (erro) { U.erroCampo(campo, erro); campo.focus(); return; }
        if (texto !== textoMsg) { textoMsg = texto; idMsg = U.novoId(); }
      }
      U.ocupado(enviar, true, 'Enviando…');
      var p = texto ? A.enviarMensagem(c.candidaturaId, texto, idMsg) : A.decidir(c.candidaturaId, 'conversar');
      p.then(function () {
        j.fechar('enviado');
        U.avisar('Enviado. A pessoa recebe o convite para conversar.', { tipo: 'ok' });
        if (depois) depois();
      }, function (e) {
        U.ocupado(enviar, false);
        if (e.sessaoExpirada || e.confirmar) { j.fechar('erro'); U.tratarErro(e); return; }
        U.erroCampo(campo, e.message);
      });
    });
    return j;
  }

  E.telas.vagas = telaVagas;
  E.telas.vagaNova = function (raiz) { telaFormulario(raiz, null); };
  E.telas.vaga = telaVaga;
  E.telas.vagaEditar = function (raiz, id) {
    U.carregando(raiz);
    return acharAnuncio(id).then(function (a) {
      if (a.status === 'removido' || a.status === 'suspenso') { desenharVaga(raiz, a, null); return; }
      telaFormulario(raiz, a);
    }, function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { E.telas.vagaEditar(raiz, id); } }); });
  };
  E.telas.cartoes = telaCartoes;
  E.vagas = { anuncios: anuncios, tabela: tabelaVagas, vazioPrimeiraVaga: vazioPrimeiraVaga, textoSituacao: textoSituacao, chamar: chamar };
})(typeof self !== 'undefined' ? self : this);
