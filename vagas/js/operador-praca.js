/*
 * Vagas sem Caos — operação da praça, telas da PRAÇA (registradas em VAGAS_OP_TELAS; a casca é operador.js):
 *   #assistido  cadastro assistido de pessoa (conta pendente; só vale quando ELA confirma pelo link) e de empresa (empresa já
 *               verificada + conta da pessoa responsável). Ação "assistido" da Edge Function vagas-conta.
 *   #boletim    texto pronto do boletim do dia (modelo de whatsapp.json), para copiar e colar à mão no Canal e nos grupos.
 *   #numeros    números da praça: os 15 indicadores com alvo e cor (vagas_op_indicadores); sem a RPC, as 8 contagens do resumo.
 *   #repasse    praça com parceiro (repasse) ou operação própria (sem repasse); grátis no lançamento: ainda sem vendas.
 *   #zonas      zonas da cidade (criar, editar, desativar); situação e preços só a equipe muda.
 * Ids: docs/VAGAS-TELAS.md §4.2, §4.5, §4.6 e §4.7.
 */
(function (root) {
  'use strict';
  var doc = root.document;
  var U = root.VAGAS_UI;
  var A = root.VAGAS_API;
  var O = root.VAGAS_OPERADOR;
  var R = root.VAGAS_REGRAS;
  var el = U.el;
  var TELAS = root.VAGAS_OP_TELAS = root.VAGAS_OP_TELAS || {};

  function campo(id, rotulo, entrada, op) {
    op = op || {};
    return el('div', { class: 'campo' + (op.largo ? ' campo--largo' : '') }, [
      el('label', { class: 'campo__rotulo', for: id }, [rotulo, op.obrigatorio ? el('span', { class: 'obrigatorio' }, ' (obrigatório)') : null]),
      entrada, op.ajuda ? el('span', { class: 'campo__ajuda', id: id + '-ajuda' }, op.ajuda) : null
    ]);
  }
  function entrada(id, tipo, extra) {
    return el('input', Object.assign({ class: 'entrada', id: id, type: tipo || 'text', autocomplete: 'off' }, extra || {}));
  }
  function grupo(rotuloId, rotulo, conteudo) {
    return el('div', { class: 'campo' }, [el('p', { class: 'campo__rotulo', id: rotuloId }, rotulo), conteudo]);
  }

  // ------------------------------------------------------------------------------------------------- #assistido
  // Aviso lido em voz alta (texto do mockup aprovado; docs/VAGAS-TELAS.md §4.2).
  var AVISO_LIDO = 'Você vai receber um e-mail para confirmar a conta. Só depois disso ela vale. Candidatar-se é grátis e ninguém da operação vê o seu currículo ou contato.';
  TELAS.assistido = function (raiz, ctx) {
    var c = ctx.cidade();
    var tipo = TELAS.assistido.tipo || 'pessoa';
    var corpoForm = el('div', { id: 'vg-op-ass-corpo' });
    var seg = ctx.segmento({ rotulo: 'Para quem é a conta', valor: tipo, aoMudar: function (v) { tipo = TELAS.assistido.tipo = v; desenhar(); }, opcoes: [
      { id: 'pessoa', idBotao: 'vg-op-ass-pessoa', rotulo: 'Pessoa' }, { id: 'empresa', idBotao: 'vg-op-ass-empresa', rotulo: 'Empresa' }] });
    var lateral = el('div', { class: 'vg-lateral' }, [ctx.podeTudo() ? pendentes(ctx) : null, el('section', { class: 'caixa caixa--compacta' }, [
      el('h2', { class: 'caixa__titulo' }, 'O que você não vê'),
      el('p', { class: 't-rotulo texto-medio' }, 'Currículo, selos, candidaturas, conversas e contato das pessoas. Só o e-mail de cadastro e o status da conta. Isso vale para toda a operação.')])]);
    U.trocar(raiz, [ctx.cabecalho({ sobre: 'Praça', titulo: 'Cadastro assistido',
      texto: 'Para quem não consegue se cadastrar sozinho (mutirão, balcão, SINE). A conta nasce pendente e só vale quando a pessoa confirma pelo link do e-mail: a confirmação é o consentimento dela.' }),
    ctx.podeTudo() ? seg : null, el('div', { class: 'vg-grade' }, [corpoForm, lateral])]);
    if (!ctx.podeTudo()) {
      U.vazio(corpoForm, { titulo: 'Só a operação da praça faz cadastro assistido.', texto: 'A moderação decide vagas, empresas e denúncias.' });
      return;
    }
    function desenhar() { U.trocar(corpoForm, tipo === 'empresa' ? formEmpresa(ctx, c) : formPessoa(ctx, c)); }
    desenhar();
  };

  function onde(ctx, aoMudar) {
    var hoje = R.hoje(U.fuso());
    var local = 'mutirao';
    var codigo = entrada('vg-op-ass-evento', 'text', { maxlength: '40', value: O.codigoEvento(local, hoje), 'aria-describedby': 'vg-op-ass-evento-ajuda' });
    var pil = ctx.pilulas({ id: 'vg-op-ass-local', rotuloId: 'vg-op-ass-local-rotulo', valor: local, opcoes: O.LOCAIS, aoMudar: function (v) {
      local = v; codigo.value = O.codigoEvento(v, hoje); if (aoMudar) aoMudar(v);
    } });
    return { elementos: [grupo('vg-op-ass-local-rotulo', 'Onde está sendo feito', pil),
      campo('vg-op-ass-evento', 'Código do evento', codigo, { ajuda: 'Agrupa as contas do mesmo mutirão nos números da praça. Pode deixar como está.' })],
    codigo: function () { return codigo.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40); } };
  }
  function cidadeDoForm(ctx, c) {
    if (ctx.cidades.length < 2) return { elemento: el('p', { class: 't-corpo', id: 'vg-op-ass-cidade' }, c.nome), valor: function () { return c.slug; } };
    var p = ctx.pilulas({ id: 'vg-op-ass-cidade', rotuloId: 'vg-op-ass-cidade-rotulo', valor: c.slug, opcoes: ctx.cidades.map(function (x) { return { id: x.slug, rotulo: x.nome }; }) });
    return { elemento: p, valor: function () { return p.valor; } };
  }
  function leuAviso() {
    return el('div', { class: 'consentimento vg-op-leu' }, el('label', { class: 'marcar' }, [el('input', { type: 'checkbox', id: 'vg-op-ass-leu' }),
      el('span', { class: 't-rotulo' }, 'Li para a pessoa, em voz alta, o aviso: "' + AVISO_LIDO + '"')]));
  }
  function seuEmail(ctx, email) { var c = ctx.eu && ctx.eu.conta; return !!(c && c.email && R.normalizarEmail(c.email) === email); }

  function formPessoa(ctx, c) {
    var nome = entrada('vg-op-ass-nome', 'text', { maxlength: '120', autocomplete: 'off' });
    var email = entrada('vg-op-ass-email', 'email', { inputmode: 'email', maxlength: '254', 'aria-describedby': 'vg-op-ass-email-ajuda', required: true });
    var cid = cidadeDoForm(ctx, c);
    var lugar = onde(ctx);
    var resultado = el('div', { id: 'vg-op-ass-resultado', 'aria-live': 'polite' });
    var criar = el('button', { type: 'submit', class: 'botao botao--laranja botao--grande', id: 'vg-op-ass-criar' }, 'Criar conta pendente e enviar o link');
    var form = el('form', { class: 'caixa', id: 'vg-op-form-assistido', novalidate: true }, [
      el('div', { class: 'form-grade' }, [
        campo('vg-op-ass-nome', 'Nome', nome),
        campo('vg-op-ass-email', 'E-mail da pessoa', email, { obrigatorio: true, ajuda: 'Sem e-mail? Ajude a criar um no celular dela, no Gmail ou Outlook. Nunca use o seu.' }),
        grupo('vg-op-ass-cidade-rotulo', 'Cidade', cid.elemento)
      ].concat(lugar.elementos)),
      leuAviso(),
      el('div', { class: 'acoes vg-op-acoes-direita' }, criar),
      resultado
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      U.limparErroCampo(email);
      var leu = doc.getElementById('vg-op-ass-leu');
      U.limparErroCampo(leu);
      U.limpar(resultado);
      var e = R.normalizarEmail(email.value);
      var ok = true;
      if (!e) { U.erroCampo(email, 'Informe o e-mail da pessoa.'); ok = false; } else if (seuEmail(ctx, e)) { U.erroCampo(email, 'Use o e-mail da pessoa, nunca o seu.'); ok = false; }
      if (!leu.checked) { U.erroCampo(leu, 'Leia o aviso para a pessoa e marque a caixa.'); ok = false; }
      if (!ok) return;
      U.ocupado(criar, true, 'Criando…');
      A.cadastroAssistido({ email: e, tipo: 'pessoa', cidade: cid.valor(), nome: nome.value.trim(), codigoEvento: lugar.codigo() }).then(function () {
        U.ocupado(criar, false);
        var primeiro = nome.value.trim().split(/\s+/)[0] || '';
        U.trocar(resultado, el('div', { class: 'aviso aviso--ok', role: 'status', id: 'vg-op-ass-ok' }, [
          el('p', {}, 'Conta criada como pendente para ' + e + '. O link foi enviado. A conta só vale quando a pessoa confirmar; sem confirmação em 7 dias, ela é apagada.'),
          el('p', { class: 'acoes' }, el('a', { class: 'botao botao--claro botao--pequeno', id: 'vg-op-ass-whatsapp', target: '_blank', rel: 'noopener noreferrer',
            href: U.compartilharWhatsapp(O.preencher(O.MSG_ASSISTIDO, { pessoa_primeiro_nome: primeiro, email: e })) }, [U.icone('whatsapp'), ' Mandar o lembrete pelo WhatsApp']))
        ]));
        nome.value = ''; email.value = ''; leu.checked = false;
        U.anunciar('Conta pendente criada.');
        recarregarPendentes();
      }, function (er) {
        U.ocupado(criar, false);
        if (er.sessaoExpirada || er.conexao) { U.tratarErro(er); return; }
        if (er.existe) { U.erroCampo(email, er.message); return; }
        U.trocar(resultado, el('p', { class: 'aviso aviso--erro', role: 'alert', id: 'vg-op-ass-erro' }, er.message));
      });
    });
    return form;
  }

  function formEmpresa(ctx, c) {
    var cnpj = entrada('vg-op-ass-cnpj', 'text', { inputmode: 'numeric', maxlength: '18' });
    var razao = entrada('vg-op-ass-razao', 'text', { maxlength: '160' });
    var fantasia = entrada('vg-op-ass-fantasia', 'text', { maxlength: '120' });
    var setor = entrada('vg-op-ass-setor', 'text', { maxlength: '80' });
    var whats = entrada('vg-op-ass-whatsapp', 'tel', { inputmode: 'tel', maxlength: '20' });
    var responsavel = entrada('vg-op-ass-nome', 'text', { maxlength: '120' });
    var email = entrada('vg-op-ass-email', 'email', { inputmode: 'email', maxlength: '254', 'aria-describedby': 'vg-op-ass-email-ajuda' });
    var zonas = (c.zonas || []).map(function (z) { return { id: z.slug, rotulo: z.nome }; });
    var zona = zonas.length ? ctx.pilulas({ id: 'vg-op-ass-zona', rotuloId: 'vg-op-ass-zona-rotulo', valor: '', opcoes: zonas }) : null;
    var lugar = onde(ctx);
    var resultado = el('div', { id: 'vg-op-ass-resultado', 'aria-live': 'polite' });
    var criar = el('button', { type: 'submit', class: 'botao botao--laranja botao--grande', id: 'vg-op-ass-criar' }, 'Cadastrar a empresa e enviar o link');
    cnpj.addEventListener('blur', function () { var n = R.normalizarCnpj(cnpj.value); if (n.length === 14) cnpj.value = R.formatarCnpj(n); });
    var form = el('form', { class: 'caixa', id: 'vg-op-form-assistido', novalidate: true }, [
      el('p', { class: 't-rotulo texto-medio vg-op-intro' }, 'Confira o CNPJ na Receita antes: a empresa cadastrada aqui já nasce verificada. A conta é de quem responde pela empresa e só vale quando ela confirmar pelo e-mail.'),
      el('div', { class: 'form-grade' }, [
        campo('vg-op-ass-cnpj', 'CNPJ ou MEI', cnpj, { obrigatorio: true }), campo('vg-op-ass-razao', 'Razão social', razao, { obrigatorio: true }),
        campo('vg-op-ass-fantasia', 'Nome fantasia', fantasia), campo('vg-op-ass-setor', 'Setor', setor, { ajuda: 'Ex.: Supermercado, Padaria, Clínica.' }),
        campo('vg-op-ass-whatsapp', 'WhatsApp da empresa', whats),
        zona ? grupo('vg-op-ass-zona-rotulo', 'Zona da cidade', zona) : null,
        campo('vg-op-ass-nome', 'Nome de quem responde pela empresa', responsavel),
        campo('vg-op-ass-email', 'E-mail de quem responde pela empresa', email, { obrigatorio: true, ajuda: 'É o e-mail da conta. Nunca use o seu.' })
      ].concat(lugar.elementos)),
      leuAviso(),
      el('div', { class: 'acoes vg-op-acoes-direita' }, criar),
      resultado
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var leu = doc.getElementById('vg-op-ass-leu');
      [email, leu].forEach(U.limparErroCampo);
      U.limpar(resultado);
      var e = R.normalizarEmail(email.value);
      var ok = true;
      if (!e) { U.erroCampo(email, 'Informe o e-mail de quem responde pela empresa.'); ok = false; } else if (seuEmail(ctx, e)) { U.erroCampo(email, 'Use o e-mail da empresa, nunca o seu.'); ok = false; }
      if (!leu.checked) { U.erroCampo(leu, 'Leia o aviso para a pessoa e marque a caixa.'); ok = false; }
      var dados = { cnpj: cnpj.value, razaoSocial: razao.value, nomeFantasia: fantasia.value, setor: setor.value, whatsapp: whats.value, email: e, cidade: c.slug, zona: zona ? zona.valor : '' };
      var conferida = R.lerEmpresa(dados);
      if (!conferida.ok) { U.trocar(resultado, el('p', { class: 'aviso aviso--erro', role: 'alert', id: 'vg-op-ass-erro' }, conferida.erro)); ok = false; }
      if (!ok) return;
      U.ocupado(criar, true, 'Cadastrando…');
      A.opEmpresaCadastrar(dados).then(function (r) {
        var emp = r.empresa;
        return A.cadastroAssistido({ email: e, tipo: 'empresa', cidade: c.slug, empresaId: emp.id, nome: responsavel.value.trim(), codigoEvento: lugar.codigo() }).then(function () {
          U.ocupado(criar, false);
          U.trocar(resultado, el('p', { class: 'aviso aviso--ok', role: 'status', id: 'vg-op-ass-ok' },
            'Empresa ' + emp.nomeFantasia + ' cadastrada e verificada. Conta pendente criada para ' + e + ': o link foi enviado e ela só vale depois da confirmação.'));
          form.reset();
          recarregarPendentes();
          return ctx.atualizarContagens();
        }, function (er) {
          U.ocupado(criar, false);
          U.trocar(resultado, el('p', { class: 'aviso aviso--erro', role: 'alert', id: 'vg-op-ass-erro' },
            'Empresa ' + emp.nomeFantasia + ' cadastrada e verificada, mas a conta não foi criada: ' + er.message + ' Se a pessoa já tem conta de empresa, dê o acesso em Empresas.'));
        });
      }, function (er) {
        U.ocupado(criar, false);
        if (er.sessaoExpirada || er.conexao) { U.tratarErro(er); return; }
        U.trocar(resultado, el('p', { class: 'aviso aviso--erro', role: 'alert', id: 'vg-op-ass-erro' }, er.message));
      });
    });
    return form;
  }

  // Pendentes de confirmação (só a operação; a moderação não faz cadastro assistido). vagas_op_assistidos devolve o e-mail
  // MASCARADO (a operação nunca lê contato de pessoa): a lista é só para conferir; para mandar o link de novo, a pessoa (ou o
  // operador, com ela do lado) digita o e-mail completo. Sem a RPC (banco antigo), só o campo de reenviar.
  function pendentes(ctx) {
    var titulo = el('h2', { class: 'caixa__titulo' }, 'Pendentes de confirmação');
    var lista = el('div', { id: 'vg-op-pendentes-lista' });
    var campoEmail = entrada('vg-op-reenviar-email', 'email', { inputmode: 'email', maxlength: '254', 'aria-describedby': 'vg-op-reenviar-email-ajuda' });
    var b = el('button', { type: 'button', class: 'botao botao--claro botao--pequeno', id: 'vg-op-reenviar' }, 'Reenviar link');
    var ajuda = 'Digite o e-mail completo da pessoa: a lista mostra só o começo, para proteger o contato dela.';
    var reenviarCampo = campo('vg-op-reenviar-email', 'Mandar o link de novo', campoEmail, { ajuda: ajuda });
    b.addEventListener('click', function () {
      U.limparErroCampo(campoEmail);
      var e = R.normalizarEmail(campoEmail.value);
      if (!e) { U.erroCampo(campoEmail, 'E-mail inválido.'); return; }
      U.ocupado(b, true, 'Enviando…');
      A.reenviarConfirmacao(e).then(function () {
        U.ocupado(b, false);
        campoEmail.value = '';
        U.avisar('Se a conta ainda estiver pendente, o link foi enviado de novo.', { tipo: 'ok', ms: 6000 });
      }, function (er) { U.ocupado(b, false); if (er.sessaoExpirada || er.conexao) { U.tratarErro(er); return; } U.avisar(er.message, { tipo: 'erro' }); });
    });
    var caixa = el('section', { class: 'caixa caixa--compacta', id: 'vg-op-pendentes' }, [titulo, lista, reenviarCampo, el('div', { class: 'acoes' }, b),
      el('p', { class: 't-nota texto-suave vg-op-nota' }, 'Contas não confirmadas em 7 dias são apagadas.')]);
    function preparar(mascara) {
      var a = doc.getElementById('vg-op-reenviar-email-ajuda');
      if (a) a.textContent = 'Digite o e-mail completo de ' + mascara + '.';
      campoEmail.focus();
    }
    if (typeof A.opAssistidos !== 'function') {
      U.trocar(lista, el('p', { class: 't-rotulo texto-medio' }, 'A lista das contas pendentes ainda não está disponível.'));
      return caixa;
    }
    function carregar() {
      U.carregando(lista);
      A.opAssistidos({ cidade: ctx.cidade().slug }).then(function (r) {
        var cs = r.contas || [];
        titulo.textContent = 'Pendentes de confirmação (' + cs.length + ')';
        if (!cs.length) { U.trocar(lista, el('p', { class: 't-rotulo texto-medio', id: 'vg-op-pendentes-vazio' }, 'Nenhuma conta esperando confirmação.')); return; }
        U.trocar(lista, el('ul', { class: 'vg-op-lista-limpa', id: 'vg-op-pendentes-contas' }, cs.map(function (x) {
          var bx = el('button', { type: 'button', class: 'botao botao--claro botao--pequeno', 'data-acao': 'reenviar', 'aria-label': 'Reenviar o link para ' + x.email,
            onclick: function () { preparar(x.email); } }, 'Reenviar');
          return el('li', { class: 'vg-item', 'data-tipo': x.tipo }, [el('div', { class: 'vg-item__texto' }, [el('p', { class: 'vg-item__titulo' }, x.email),
            el('p', { class: 'vg-item__sub' }, (x.tipo === 'empresa' ? 'Empresa' : 'Pessoa') + ' · criada ' + U.relativa(x.criadoEm) + (x.codigoEvento ? ' · ' + x.codigoEvento : ''))]), bx]);
        })));
      }, function (e) {
        if (e.sessaoExpirada) { U.tratarErro(e); return; }
        U.trocar(lista, el('p', { class: 't-rotulo texto-medio' }, 'Não deu para carregar a lista agora.'));
      });
    }
    caixa.recarregar = carregar;   // depois de um cadastro novo
    carregar();
    return caixa;
  }
  function recarregarPendentes() { var p = doc.getElementById('vg-op-pendentes'); if (p && typeof p.recarregar === 'function') p.recarregar(); }

  // ------------------------------------------------------------------------------------------------- #boletim
  var PERIODOS = [{ id: 'ontem', rotulo: 'Novas desde ontem' }, { id: '24h', rotulo: 'Últimas 24 h' }, { id: 'semana', rotulo: 'Últimos 7 dias' }];
  TELAS.boletim = function (raiz, ctx) {
    var c = ctx.cidade();
    var periodo = 'ontem';
    var entorno = true;
    var texto = '';
    var temEntorno = false;
    var pre = el('pre', { class: 'vg-boletim', id: 'vg-op-boletim-texto', tabindex: '0', 'aria-label': 'Texto do boletim' });
    var nota = el('p', { class: 't-nota texto-suave', id: 'vg-op-boletim-nota', 'aria-live': 'polite' });
    var copiar = el('button', { type: 'button', class: 'botao botao--laranja', id: 'vg-op-boletim-copiar', disabled: true }, [U.icone('copiar'), ' Copiar boletim']);
    var filtros = el('div', { class: 'vg-op-filtros' }, [
      grupo('vg-op-boletim-periodo-rotulo', 'Vagas', ctx.pilulas({ id: 'vg-op-boletim-periodo', rotuloId: 'vg-op-boletim-periodo-rotulo', valor: periodo, opcoes: PERIODOS,
        aoMudar: function (v) { periodo = v; carregar(); } }))
    ]);
    U.trocar(raiz, [ctx.cabecalho({ sobre: 'Praça', titulo: 'Boletim do dia', acoes: [copiar],
      texto: 'Texto pronto com as vagas novas, para colar no Canal e nos grupos de WhatsApp. Sem disparador: você posta à mão.' }),
    el('div', { class: 'vg-grade' }, [el('section', { class: 'caixa', 'aria-label': 'Boletim' }, [filtros, pre, nota]), el('div', { class: 'vg-lateral' }, [
      el('section', { class: 'caixa caixa--compacta' }, [el('h2', { class: 'caixa__titulo' }, 'Onde e quando postar'), el('ul', { class: 'vg-op-lista t-rotulo texto-medio' }, [
        el('li', {}, 'Canal da cidade e grupos parceiros, até as 9h em dia útil.'), el('li', {}, 'Postagem à mão: nenhum disparador automático.'),
        el('li', {}, 'Vaga que saiu do ar: avise no Canal no mesmo dia.')])]),
      el('section', { class: 'caixa caixa--compacta' }, [el('h2', { class: 'caixa__titulo' }, 'O que entra'), el('ul', { class: 'vg-op-lista t-rotulo texto-medio' }, [
        el('li', {}, 'Só vaga no ar, de empresa verificada.'), el('li', {}, 'Salário ou valor do dia, sempre.'),
        el('li', {}, 'Sem telefone de empresa: o contato é pelo link da vaga.')])])])])]);
    copiar.addEventListener('click', function () {
      U.copiar(texto).then(function () {
        copiar.textContent = 'Copiado';
        U.avisar('Boletim copiado. Agora é só colar no Canal e nos grupos.', { tipo: 'ok' });
        setTimeout(function () { U.trocar(copiar, [U.icone('copiar'), ' Copiar boletim']); }, 2500);
      }, function (e) { U.avisar(e.message, { tipo: 'erro' }); });
    });
    // Entorno: cidades da praça (outras cidades com "praca" = esta) entram junto, como no mural da pessoa.
    A.cidades().then(function (r) {
      temEntorno = (r.cidades || []).some(function (x) { return x.praca === c.slug; });
      if (!temEntorno) return;
      filtros.appendChild(grupo('vg-op-boletim-cidade-rotulo', 'Cidade', ctx.pilulas({ id: 'vg-op-boletim-cidade', rotuloId: 'vg-op-boletim-cidade-rotulo', valor: 'praca',
        opcoes: [{ id: 'praca', rotulo: c.nome + ' e entorno' }, { id: 'cidade', rotulo: 'Só ' + c.nome }], aoMudar: function (v) { entorno = v === 'praca'; carregar(); } })));
    }, function () { /* sem a lista: só a cidade com o entorno padrão */ });

    function carregar() {
      copiar.disabled = true;
      pre.textContent = U.MSG.CARREGANDO;
      U.limpar(nota);
      var filtro = { cidade: c.slug, entorno: entorno, areas: [], limite: 20 };
      return Promise.all([A.anuncios(filtro), A.anuncios(Object.assign({}, filtro, { somenteTotal: true }))]).then(function (r) {
        var sel = O.selecionarBoletim(r[0].anuncios || [], periodo, { fuso: U.fuso() });
        var total = r[1].total == null ? (r[0].anuncios || []).length : r[1].total;
        if (!sel.vagas.length) {
          texto = '';
          pre.textContent = 'Nenhuma vaga no ar nesta cidade agora: não há boletim para postar.';
          return;
        }
        texto = O.montarBoletim({ cidade: c.nome, data: U.dataCurta(new Date().toISOString()), vagas: sel.vagas, total: total, site: ctx.site(), slug: c.slug });
        pre.textContent = texto;
        copiar.disabled = false;
        nota.textContent = sel.reaproveitadas ? 'Nenhuma vaga nova no período: o boletim traz as ' + sel.vagas.length + ' mais recentes ainda abertas.'
          : sel.vagas.length + (sel.vagas.length === 1 ? ' vaga nova' : ' vagas novas') + (sel.novas > sel.vagas.length ? ' (as ' + O.MAX_BOLETIM + ' mais recentes; o resto fica no site).' : '.');
      }, function (e) {
        texto = '';
        pre.textContent = e.listaEspera || e.pausada ? 'O mural desta cidade não está aberto: não há boletim.' : e.message;
        if (e.sessaoExpirada) U.tratarErro(e);
      });
    }
    return carregar();
  };

  // ------------------------------------------------------------------------------------------------- #numeros
  TELAS.numeros = function (raiz, ctx) {
    var c = ctx.cidade();
    var corpo = el('div', { id: 'vg-op-numeros-corpo' });
    U.trocar(raiz, [ctx.cabecalho({ sobre: 'Praça', titulo: 'Números da praça',
      texto: 'Os alvos da proposta para a praça. A cor aparece só como etiqueta: no alvo, perto do alvo ou longe do alvo.' }), corpo]);
    U.carregando(corpo);
    function semIndicadores(motivo) {
      U.trocar(corpo, [el('div', { class: 'vg-numeros', id: 'vg-op-numeros' }, O.contagensResumo(c.contagens).map(function (x) {
        return el('div', { class: 'caixa caixa--compacta vg-numero', data: { contagem: x.chave } }, [el('p', { class: 'vg-numero__rotulo' }, x.rotulo), el('p', { class: 'vg-numero__valor tabular' }, x.valor)]);
      })), el('p', { class: 'aviso vg-op-nota', id: 'vg-op-numeros-breve' }, motivo || 'Em breve: os 15 indicadores com alvo e cor. Até lá, estas são as contagens de agora.')]);
    }
    if (typeof A.opIndicadores !== 'function') { semIndicadores(); return; }
    return A.opIndicadores(c.slug).then(function (r) {
      U.trocar(corpo, desenharIndicadores(r));
    }, function (e) {
      if (e.bancoDesatualizado) { semIndicadores(); return; }
      U.tratarErro(e, { raiz: corpo, aoTentar: function () { TELAS.numeros(raiz, ctx); } });
    });
  };
  function desenharIndicadores(r) {
    var cores = {};
    (R.CORES_INDICADOR || []).forEach(function (x) { cores[x.id] = x.rotulo; });
    var inds = (r.indicadores || []).map(function (i) { return { bruto: i, f: O.formatarIndicador(i, Object.keys(cores).length ? cores : null) }; });
    var selos = inds.filter(function (x) { return x.bruto.chave === 'pessoas_com_selo_por_funcao'; })[0];
    var ativas = inds.filter(function (x) { return x.bruto.chave === 'vagas_ativas'; })[0];
    var blocos = el('div', { class: 'vg-numeros', id: 'vg-op-numeros' }, inds.map(function (x) {
      var f = x.f;
      return el('div', { class: 'caixa caixa--compacta vg-numero', data: { indicador: f.chave, cor: f.cor || '' } }, [
        el('p', { class: 'vg-numero__rotulo' }, f.nome),
        el('p', { class: 'vg-numero__valor tabular' }, f.valor),
        el('p', { class: 'vg-numero__alvo' }, [f.alvo, f.cor ? ' ' : null, f.cor ? el('span', { class: 'vg-status vg-op-cor vg-op-cor--' + f.cor }, f.corRotulo) : null]),
        f.barra != null ? el('div', { class: 'vg-numero__barra', role: 'img', 'aria-label': f.barra + '% do alvo' }, el('span', { class: 'vg-numero__feito', style: { width: f.barra + '%' } })) : null,
        f.nota ? el('p', { class: 't-nota texto-suave' }, f.nota) : null
      ]);
    }));
    var tabelaSelos = null;
    if (selos && !selos.f.semDado) {
      var porTeste = (selos.bruto.detalhe || {}).porTeste || {};
      var pedem = ((ativas && ativas.bruto.detalhe) || {}).porTeste || {};
      tabelaSelos = el('section', { class: 'caixa vg-op-secao' }, [el('h2', { class: 'caixa__titulo' }, 'Pessoas com selo, por teste'),
        el('div', { class: 'vg-rolagem' }, el('table', { class: 'vg-tabela', id: 'vg-op-selos' }, [
          el('thead', {}, el('tr', {}, [el('th', { scope: 'col' }, 'Teste'), el('th', { scope: 'col', class: 'num' }, 'Com selo'), el('th', { scope: 'col', class: 'num' }, 'Vagas no ar que citam o teste')])),
          el('tbody', {}, (R.TESTES_SELO || []).map(function (t) {
            return el('tr', { data: { teste: t.id } }, [el('td', {}, t.rotulo), el('td', { class: 'num' }, O.contagemProtegida(porTeste[t.id])),
              el('td', { class: 'num' }, O.numeroBr(pedem[t.id] || 0))]);
          }))])),
        el('p', { class: 't-nota texto-suave' }, 'Contagem de selos válidos' + (selos.bruto.ateOntem ? ', até ontem' : '') + ', para acompanhar a praça. Nunca aparece para empresa.')]);
    }
    var gat = (r.gatilhos || []).map(O.formatarGatilho);
    var gatilhos = gat.length ? el('section', { class: 'caixa vg-op-secao', id: 'vg-op-gatilhos' }, [el('h2', { class: 'caixa__titulo' }, 'Gatilhos da proposta'),
      el('ul', { class: 'vg-op-gatilhos' }, gat.map(function (g) {
        return el('li', { data: { gatilho: g.chave } }, [
          el('p', { class: 't-corpo seminegrito' }, [g.nome, ' ', el('span', { class: 'vg-status vg-op-gatilho--' + g.situacao }, g.rotulo + (g.contagem ? ' · ' + g.contagem : ''))]),
          el('ul', { class: 'vg-op-partes t-rotulo texto-medio' }, g.partes.map(function (p) {
            return el('li', { data: { estado: p.estado } }, [U.icone(p.estado === 'ok' || p.estado === 'fixa' ? 'check' : p.estado === 'nao' ? 'fechar' : 'relogio'), ' ', p.descricao,
              p.estado === 'manual' ? ' (conferência da equipe)' : p.estado === 'sem_dado' ? ' (ainda sem dado)' : '']);
          }))]);
      }))]) : null;
    var praca = (r.praca || []).length > 1 ? el('p', { class: 't-nota texto-suave' }, 'Praça: ' + r.praca.map(function (x) { return x.nome; }).join(', ') + '.') : null;
    var protegidos = inds.some(function (x) { return x.bruto.ateOntem; }) ? el('p', { class: 'aviso vg-op-nota', id: 'vg-op-numeros-protegidos' }, O.NOTA_PROTEGIDOS) : null;
    return [praca, blocos, protegidos, tabelaSelos, gatilhos, r.geradoEm ? el('p', { class: 't-nota texto-suave vg-op-nota' }, 'Calculado ' + U.relativa(r.geradoEm) + ', às ' + U.hora(r.geradoEm) + '.') : null];
  }

  // ------------------------------------------------------------------------------------------------- #repasse
  TELAS.repasse = function (raiz, ctx) {
    var c = ctx.cidade();
    var rp = O.REPASSE(c.repassePercentual);
    var corpo;
    if (rp.tipo === 'propria') {
      corpo = el('section', { class: 'caixa vazio', id: 'vg-op-repasse-propria' }, [el('h2', { class: 'vazio__titulo' }, 'Nesta praça não há repasse'),
        el('p', { class: 'vazio__texto' }, 'A praça é operada pela própria Gestão sem Caos: as vendas entram como receita, sem repasse.')]);
    } else {
      var cartao = function (rotulo, valor, nota, destaque) {
        return el('div', { class: 'caixa caixa--compacta resumo__cartao' + (destaque ? ' caixa--destaque' : '') }, [el('p', { class: 'resumo__rotulo' }, rotulo),
          el('div', {}, [el('p', { class: 't-numero tabular' }, valor), nota ? el('p', { class: 'resumo__nota' }, nota) : null])]);
      };
      corpo = [rp.tipo === 'parceiro' ? el('div', { class: 'resumo', id: 'vg-op-repasse-blocos' }, [
        cartao('Receita líquida da praça', 'R$ 0', 'nenhuma venda'),
        cartao('Seu repasse', 'R$ 0', 'percentual do contrato: ' + rp.percentual + '%', true),
        cartao('Vendas pelo parceiro', 'R$ 0', 'no balcão'), cartao('Vendas online', 'R$ 0', 'no site')]) : null,
      el('p', { class: 'aviso vg-op-nota', id: 'vg-op-repasse-gratis' }, rp.tipo === 'parceiro'
        ? 'Grátis no lançamento: ainda não há vendas nesta praça. Quando a cobrança começar, cada venda aparece aqui com a sua parte.'
        : 'Grátis no lançamento: ainda não há vendas. Quando a cobrança começar, aqui aparecem a receita líquida da praça e, se a praça tiver parceiro, o seu repasse. Em praça com operação própria da Gestão sem Caos não há repasse.')];
    }
    U.trocar(raiz, [ctx.cabecalho({ sobre: 'Praça', titulo: 'Repasse do mês',
      texto: 'Receita líquida = pago − estornos − taxas. Pix manual até o dia 10, contra nota fiscal do parceiro.' })].concat(corpo));
  };

  // ------------------------------------------------------------------------------------------------- #zonas
  var STATUS_CIDADE = { rascunho: 'Rascunho', lista_espera: 'Lista de espera', ativa: 'Ativa', pausada: 'Pausada' };
  TELAS.zonas = function (raiz, ctx) {
    var c = ctx.cidade();
    var lista = el('div', { id: 'vg-op-zonas-corpo' });
    var nova = ctx.podeTudo() ? el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-op-zona-nova', onclick: function () { janelaZona(ctx, c, null, carregar); } }, [U.icone('mais'), ' Nova zona']) : null;
    U.trocar(raiz, [ctx.cabecalho({ sobre: 'Praça', titulo: 'Zonas e textos', acoes: nova ? [nova] : null,
      texto: 'As zonas aparecem no filtro de quem procura vaga e no anúncio. Bairro que ainda não está em nenhuma zona: coloque na mais perto.' }),
    el('div', { class: 'vg-grade' }, [lista, el('div', { class: 'vg-lateral' }, [
      el('section', { class: 'caixa caixa--compacta' }, [el('h2', { class: 'caixa__titulo' }, 'Situação e preços'),
        el('p', { class: 't-rotulo texto-medio' }, ['Situação da cidade: ', el('span', { class: 'vg-status', id: 'vg-op-cidade-status' }, STATUS_CIDADE[c.status] || c.status)]),
        el('p', { class: 't-nota texto-suave' }, 'Só a equipe da Gestão sem Caos muda a situação da cidade e os preços.')]),
      el('section', { class: 'caixa caixa--compacta' }, [el('h2', { class: 'caixa__titulo' }, 'Textos da praça'),
        el('p', { class: 't-nota texto-suave' }, 'Em breve: WhatsApp da praça, endereço do balcão e horário do mutirão, para aparecer nas telas de quem procura vaga.')])])])]);
    function carregar() {
      U.carregando(lista);
      return A.cidades().then(function (r) {
        var pub = (r.cidades || []).filter(function (x) { return x.slug === c.slug; })[0];
        c.zonas = pub ? pub.zonas : null;
        if (!pub) { U.vazio(lista, { titulo: 'Zonas desta cidade', texto: 'As zonas aparecem aqui quando a cidade estiver aberta ou em lista de espera.' }); return; }
        if (!pub.zonas.length) { U.vazio(lista, { titulo: 'Nenhuma zona ainda.', texto: 'Crie as zonas da cidade para as vagas e os filtros.' }); return; }
        U.trocar(lista, el('ul', { class: 'vg-op-zonas caixa', id: 'vg-op-zonas' }, pub.zonas.map(function (z, i) {
          return el('li', { class: 'vg-item', data: { zona: z.slug } }, [
            el('div', { class: 'vg-item__texto' }, [el('p', { class: 'vg-item__titulo' }, z.nome),
              el('p', { class: 'vg-item__sub' }, z.bairros && z.bairros.length ? z.bairros.join(', ') : 'Sem bairros listados')]),
            ctx.podeTudo() ? el('div', { class: 'vg-tabela__acoes' }, [
              el('button', { type: 'button', class: 'botao botao--claro botao--pequeno', data: { acao: 'editar' }, onclick: function () { janelaZona(ctx, c, Object.assign({ ordem: i + 1 }, z), carregar); } }, 'Editar'),
              el('button', { type: 'button', class: 'botao botao--perigo botao--pequeno', data: { acao: 'desativar' }, onclick: function () { desativar(z, i + 1); } }, 'Desativar')]) : null]);
        })));
      }, function (e) { U.tratarErro(e, { raiz: lista, aoTentar: carregar }); });
    }
    function desativar(z, ordem) {
      U.confirmar({ id: 'vg-op-confirmar', titulo: 'Desativar a zona "' + z.nome + '"?', perigo: true, sim: 'Desativar',
        texto: 'Ela some do filtro e do cadastro de vagas novas. Vagas e pessoas que já estão nela continuam como estão.' }).then(function (sim) {
        if (!sim) return;
        A.admZonaSalvar({ cidade: c.slug, slug: z.slug, nome: z.nome, bairros: z.bairros || [], ordem: ordem, ativa: false }).then(function () {
          U.avisar('Zona desativada.', { tipo: 'ok' });
          return carregar();
        }, ctx.falhou);
      });
    }
    return carregar();
  };
  function janelaZona(ctx, c, z, depois) {
    var nome = entrada('vg-op-zona-nome', 'text', { maxlength: '60', value: z ? z.nome : '' });
    var bairros = el('textarea', { class: 'entrada', id: 'vg-op-zona-bairros', rows: '4', 'aria-describedby': 'vg-op-zona-bairros-ajuda' });
    bairros.value = z && z.bairros ? z.bairros.join(', ') : '';
    var erro = el('p', { class: 'campo__erro', id: 'vg-op-zona-erro', role: 'alert', hidden: true });
    var j = null;
    var salvar = el('button', { type: 'button', class: 'botao botao--principal', id: 'vg-op-zona-salvar' }, 'Salvar zona');
    salvar.addEventListener('click', function () {
      erro.hidden = true;
      var n = nome.value.trim();
      if (n.length < 2) { erro.textContent = 'Informe o nome da zona.'; erro.hidden = false; return; }
      var lista = bairros.value.split(/[,\n;]/).map(function (b) { return b.trim(); }).filter(Boolean);
      var slug = z ? z.slug : O.slugZona(n);
      var ordem = z ? z.ordem : ((c.zonas || []).length + 1);
      U.ocupado(salvar, true, 'Salvando…');
      A.admZonaSalvar({ cidade: c.slug, slug: slug, nome: n, bairros: lista, ordem: ordem, ativa: true }).then(function () {
        j.fechar('salvo');
        U.avisar(z ? 'Zona atualizada.' : 'Zona criada.', { tipo: 'ok' });
        depois();
      }, function (e) { U.ocupado(salvar, false); erro.textContent = e.message; erro.hidden = false; });
    });
    j = U.janela({ id: 'vg-op-zona', titulo: z ? 'Editar a zona' : 'Nova zona', corpo: [
      campo('vg-op-zona-nome', 'Nome da zona', nome, { ajuda: 'Ex.: Centro, Região Norte, Zona rural.' }),
      el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-op-zona-bairros' }, 'Bairros'), bairros,
        el('span', { class: 'campo__ajuda', id: 'vg-op-zona-bairros-ajuda' }, 'Separe por vírgula ou um por linha.')]), erro
    ], acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-op-zona-cancelar', onclick: function () { j.fechar('cancelar'); } }, 'Cancelar'), salvar],
    foco: '#vg-op-zona-nome' });
  }
})(typeof self !== 'undefined' ? self : this);
