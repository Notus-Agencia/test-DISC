/*
 * Vagas sem Caos — páginas de divulgação: emprego.html (quem procura trabalho, celular primeiro) e empresas.html (quem
 * contrata). O texto das páginas é HTML estático: abre rápido no celular simples, aparece na prévia do WhatsApp e não some se
 * o script falhar. Este arquivo só faz o que depende do dado:
 *   - escolhe a cidade (?cidade=<slug> → cidade lembrada no aparelho → primeira cidade-polo de VAGAS_API.cidades());
 *   - põe o nome da cidade nos lugares marcados com data-cidade (sempre do dado, nunca fixo);
 *   - monta a chamada pela situação da cidade: lista de espera → formulário (e-mail obrigatório + WhatsApp opcional);
 *     ativa → "Criar minha conta" / "Cadastrar minha empresa";
 *   - "Mandar para um amigo" (WhatsApp com texto pronto), o WhatsApp da Gestão sem Caos (empresas) e a barra fixa com a ação.
 *
 * Carregue depois de endereco.js, config.js, api.js e ui.js. Para a primeira visita caber em 100 KB num pacote de dados curto,
 * as páginas NÃO carregam regras.js, textos.js nem pecas.js: os textos fixos usados aqui estão transcritos em TEXTOS e a leitura
 * do e-mail e do WhatsApp repete a de vagas/js/regras.js (tests/vagas-divulgacao.test.js compara as duas coisas com a fonte).
 * Na PRÉVIA o banco de mentira (api-previa.js) precisa de regras.js: ele é carregado sob demanda antes da 1ª chamada.
 *
 * Página: <body data-divulgacao="pessoa|empresa">. No Node (testes): require('./vagas/js/divulgacao.js') -> funções puras.
 */
(function (root) {
  'use strict';

  // Pendência do dono: número de WhatsApp da Gestão sem Caos (só algarismos, com 55 e DDD). Enquanto for o marcador, o botão
  // "Falar no WhatsApp" aparece desligado, com o marcador visível na prévia.
  var WHATSAPP_GESTAO = '[NÚMERO DA GESTÃO SEM CAOS]';
  var SITE = 'https://vagas.gestaosemcaos.com.br';
  // Endereço curto de cada página: o Cloudflare Pages serve emprego.html em /emprego e empresas.html em /empresas, sem regra.
  var ENDERECO = { pessoa: '/emprego', empresa: '/empresas' };

  // Transcritos de conteudo/vagas-textos/avisos.json (chave entre parênteses); o teste confere palavra por palavra.
  var TEXTOS = {
    cidade_lista_espera: 'O Vagas sem Caos ainda não chegou em {{cidade}}. Deixe seu e-mail e avisamos quando abrir. {{total}} pessoas já estão na lista.',
    cidade_lista_espera_vazia: 'O Vagas sem Caos ainda não chegou em {{cidade}}. Entre na lista e avisamos quando chegar.',
    cidade_lista_espera_ok: 'Pronto! Avisamos por e-mail quando {{cidade}} abrir.',
    email_invalido: 'Escreva um e-mail válido, por exemplo nome@exemplo.com.',                                   // validacao
    whatsapp_invalido: 'Escreva o WhatsApp com DDD e o número do celular, só os números (11 dígitos).',          // validacao
    lista_espera: 'Me avise quando abrir',                                                                       // botoes
    gratis_para_sempre: 'Grátis para quem procura trabalho. Sempre.'
  };
  // Textos próprios desta área (não estão em avisos.json): listados em scratchpad/vagas/divulgacao/textos.md para a revisão.
  var FRASES = {
    carregando: 'Carregando…',
    semCidade: 'Ainda não há cidade aberta para cadastro. Volte em breve.',
    esperaTitulo: 'Entre na lista de espera',
    esperaTituloEmpresa: 'Entre na lista de espera como empresa',
    ajudaEmail: 'Para avisar quando abrir. Nada de propaganda.',
    ajudaWhatsapp: 'É por ele que avisamos quando abrir. Só para isso.',
    lgpd: 'Usamos o e-mail e o WhatsApp só para este aviso. Guardamos até a cidade abrir e mais 90 dias.',
    lgpdSoEmail: 'Usamos o e-mail só para este aviso. Guardamos até a cidade abrir e mais 90 dias.',
    okWhatsapp: 'Se você deixou o WhatsApp, avisamos por lá também.',
    sairAbrir: 'Quero sair da lista',
    sairTexto: 'Escreva o e-mail que você deixou na lista. Ele sai da lista, junto com o WhatsApp.',
    sairTextoSoEmail: 'Escreva o e-mail que você deixou na lista. Ele sai da lista.',
    sairBotao: 'Sair da lista',
    sairOk: 'Pronto. Se este e-mail estava na lista, ele saiu.',
    ativaTitulo: 'O Vagas sem Caos já está em {{cidade}}',
    ativaTexto: 'Crie sua conta e faça seu currículo em 5 passos, pelo celular.',
    ativaEmpresaTitulo: 'Cadastre sua empresa',
    ativaEmpresaTexto: 'Precisa de CNPJ ou MEI. No lançamento, é grátis.',
    criarConta: 'Criar minha conta',
    cadastrarEmpresa: 'Cadastrar minha empresa',
    verVagas: 'Ver as vagas',
    jaTenhoConta: 'Já tenho conta',
    falarWhatsapp: 'Falar no WhatsApp',
    humano: 'Prefere falar com uma pessoa? Chame a Gestão sem Caos no WhatsApp.',
    enviando: 'Enviando…',
    saindo: 'Saindo…',
    naoEnviou: 'Não deu para enviar. Tente de novo.',
    saibaMais: 'Saiba mais',
    esperaEmpresa: 'Entrar na lista de espera',
    emBreve: 'Em breve',
    amigo: 'Mandar para um amigo'
  };

  // ------------------------------------------------------------------------------------------------- funções puras
  function texto(v) { return v == null ? '' : String(v); }
  function preencher(modelo, vars) {
    vars = vars || {};
    return texto(modelo).replace(/\{\{(\w+)\}\}/g, function (m, k) { return vars[k] == null ? '' : String(vars[k]); }).replace(/\s+/g, ' ').trim();
  }

  // Igual a VAGAS_REGRAS.normalizarEmail / normalizarWhatsapp / whatsappCelularValido (o teste compara com regras.js).
  function normalizarEmail(p) {
    var e = texto(p).replace(/^\s+|\s+$/g, '').toLowerCase();
    return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
  }
  function normalizarWhatsapp(p) {
    var d = texto(p).replace(/[^0-9]/g, '');
    if (d.length === 10 || d.length === 11) return '55' + d;
    if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') return d;
    return '';
  }
  function whatsappCelularValido(d) { return /^55[1-9][1-9]9[0-9]{8}$/.test(texto(d)); }

  // Formulário da lista de espera: e-mail obrigatório, WhatsApp opcional (contrato: VAGAS_API.listaEspera({cidade, email,
  // perfil, whatsapp?})). Devolve {ok, dados} ou {ok:false, campo, erro} com a mensagem do campo.
  function lerEspera(d) {
    d = d || {};
    var email = normalizarEmail(d.email);
    if (!email) return { ok: false, campo: 'email', erro: TEXTOS.email_invalido };
    var dados = { cidade: texto(d.cidade).trim().toLowerCase(), email: email, perfil: d.perfil === 'empresa' ? 'empresa' : 'pessoa' };
    if (texto(d.whatsapp).trim()) {
      var w = normalizarWhatsapp(d.whatsapp);
      if (!whatsappCelularValido(w)) return { ok: false, campo: 'whatsapp', erro: TEXTOS.whatsapp_invalido };
      dados.whatsapp = w;
    }
    return { ok: true, dados: dados };
  }

  // Cidade da página: só as que o banco publica (ativa ou lista de espera). Ordem: a pedida no endereço, a lembrada no aparelho,
  // a primeira cidade-polo (sem "praca") na ordem do banco; nunca um nome fixo.
  function escolherCidade(cidades, pedida, lembrada) {
    var lista = (cidades || []).filter(function (c) { return c && (c.status === 'ativa' || c.status === 'lista_espera') && c.slug && c.nome; });
    function achar(slug) { slug = texto(slug).trim().toLowerCase(); return slug ? lista.filter(function (c) { return c.slug === slug; })[0] || null : null; }
    return achar(pedida) || achar(lembrada) || lista.filter(function (c) { return !c.praca; })[0] || lista[0] || null;
  }
  // Cidades-polo para "outras cidades" (só quando houver mais de uma).
  function outrasCidades(cidades, atual) {
    return (cidades || []).filter(function (c) {
      return c && (c.status === 'ativa' || c.status === 'lista_espera') && !c.praca && c.slug && c.nome && (!atual || c.slug !== atual.slug);
    });
  }
  function situacao(c) { return !c ? 'sem_cidade' : c.status === 'ativa' ? 'ativa' : 'espera'; }

  // Texto do convite da lista: com o total só quando o banco devolve 10 ou mais (o número é aproximado, em dezenas).
  function textoEspera(c) {
    var n = Number(c && c.interessados) || 0;
    return n >= 10 ? preencher(TEXTOS.cidade_lista_espera, { cidade: c.nome, total: n }) : preencher(TEXTOS.cidade_lista_espera_vazia, { cidade: c && c.nome });
  }

  // Link curto da página; com ?cidade= só quando há mais de uma cidade-polo (com uma só, o link fica curto para o WhatsApp).
  function linkPagina(tipo, cidade, comCidade) {
    return SITE + (ENDERECO[tipo] || ENDERECO.pessoa) + (comCidade && cidade ? '?cidade=' + encodeURIComponent(cidade.slug) : '');
  }

  // "Mandar para um amigo": texto pronto (base: whatsapp.json, operador_convite_pessoa), conforme a situação da cidade.
  function textoAmigo(sit, cidade, link) {
    var lugar = cidade && cidade.nome ? 'de ' + cidade.nome : 'da cidade';
    if (sit === 'ativa') {
      return 'Oi! O Vagas sem Caos reúne vagas de empresas ' + lugar + ' em um só lugar. Você faz o currículo pelo celular e toca em "Quero" nas vagas. ' +
        'Se a empresa também quiser, vocês conversam. É grátis. Nunca pague para se candidatar. ' + link;
    }
    if (sit === 'espera') {
      return 'Oi! O Vagas sem Caos vai reunir vagas de empresas ' + lugar + ' em um só lugar. É grátis e pelo celular. ' +
        'Entre na lista de espera para saber quando abrir. Nunca pague para se candidatar. ' + link;
    }
    return 'Oi! Conhece o Vagas sem Caos? Vagas de empresas da cidade, de graça e pelo celular. Nunca pague para se candidatar. ' + link;
  }
  // Primeira mensagem da empresa para a Gestão sem Caos.
  function textoContato(cidade) {
    return 'Oi! Tenho uma empresa' + (cidade && cidade.nome ? ' em ' + cidade.nome : '') + ' e quero saber como anunciar vagas no Vagas sem Caos.';
  }
  // Número da Gestão sem Caos utilizável? (o marcador da pendência não é número)
  function numeroGestao(n) {
    var d = texto(n).replace(/\D/g, '');
    return /^\[/.test(texto(n).trim()) || !/^55[1-9][1-9][0-9]{8,9}$/.test(d) ? '' : d;
  }

  // Destino das ações principais (caminhos SEMPRE relativos: o mesmo HTML roda na raiz, em /vagas/ e no artefato de prévia).
  function destinos(tipo, cidade) {
    var slug = cidade ? encodeURIComponent(cidade.slug) : '';
    return tipo === 'empresa'
      ? { criar: 'entrar.html?tipo=empresa', entrar: 'entrar.html?tipo=empresa#entrar', vagas: slug ? 'cidade.html?cidade=' + slug : 'index.html' }
      : { criar: 'entrar.html#criar', entrar: 'entrar.html#entrar', vagas: slug ? 'cidade.html?cidade=' + slug : 'index.html' };
  }

  var PURO = {
    WHATSAPP_GESTAO: WHATSAPP_GESTAO, SITE: SITE, ENDERECO: ENDERECO, TEXTOS: TEXTOS, FRASES: FRASES,
    preencher: preencher, normalizarEmail: normalizarEmail, normalizarWhatsapp: normalizarWhatsapp, whatsappCelularValido: whatsappCelularValido,
    lerEspera: lerEspera, escolherCidade: escolherCidade, outrasCidades: outrasCidades, situacao: situacao, textoEspera: textoEspera,
    linkPagina: linkPagina, textoAmigo: textoAmigo, textoContato: textoContato, numeroGestao: numeroGestao, destinos: destinos
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURO; return; }

  // ------------------------------------------------------------------------------------------------- página (navegador)
  var doc = root.document;
  var U = root.VAGAS_UI;
  var API = root.VAGAS_API;
  var SCRIPT = (doc && doc.currentScript && doc.currentScript.src) || '';
  if (!doc || !U || !API) return;
  var el = U.el;
  var tipo = doc.body && doc.body.getAttribute('data-divulgacao') === 'empresa' ? 'empresa' : 'pessoa';
  var estado = { cidade: null, sit: null, cidades: [] };
  // O campo de WhatsApp só aparece quando o cliente anuncia que o banco aceita (RECURSOS da migração 20261024).
  var comWhatsapp = !!(API.RECURSOS && API.RECURSOS.listaEsperaWhatsapp);
  var observador = null;

  // A prévia precisa de regras.js antes do api-previa.js (no modo supabase a página não baixa esse arquivo).
  function garantirRegras() {
    var cfg = root.VAGAS_CONFIG || {};
    if (cfg.MODO === 'supabase' || root.VAGAS_REGRAS) return Promise.resolve();
    return new Promise(function (res) {
      var s = doc.createElement('script');
      s.src = SCRIPT ? SCRIPT.replace(/divulgacao\.js(\?.*)?$/, 'regras.js') : 'js/regras.js';
      s.onload = res; s.onerror = res;
      doc.head.appendChild(s);
    });
  }

  function porId(id) { return doc.getElementById(id); }

  // Nome da cidade nos lugares marcados: data-cidade="{{cidade}}" (modelo) mostra o modelo preenchido e desfaz o hidden.
  function porCidade(c) {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-cidade]'), function (n) {
      if (!c) return;
      n.textContent = preencher(n.getAttribute('data-cidade'), { cidade: c.nome });
      n.hidden = false;
    });
  }

  function botaoWhatsappGestao(id, classe) {
    var num = numeroGestao(WHATSAPP_GESTAO);
    if (num) {
      return el('a', { class: 'botao ' + classe + ' botao--grande', id: id, href: U.whatsapp(num, textoContato(estado.cidade)), target: '_blank', rel: 'noopener' },
        [U.icone('whatsapp'), FRASES.falarWhatsapp]);
    }
    // Sem número ainda: botão desligado e o marcador da pendência (só aparece enquanto o dono não informa o número).
    return el('span', { class: 'vg-div-pendente', id: id + '-pendente' }, [
      el('button', { type: 'button', class: 'botao ' + classe + ' botao--grande', id: id, disabled: true }, [U.icone('whatsapp'), FRASES.falarWhatsapp]),
      el('span', { class: 'vg-div-marcador' }, WHATSAPP_GESTAO)
    ]);
  }

  // ---- lista de espera
  function campo(id, rotulo, opcional, ajuda, atrib) {
    return el('div', { class: 'campo' }, [
      el('label', { class: 'campo__rotulo', for: id }, [rotulo, opcional ? el('span', { class: 'obrigatorio' }, ' (opcional)') : null]),
      el('input', Object.assign({ class: 'entrada entrada--principal', id: id, name: id }, atrib)),
      el('span', { class: 'campo__ajuda', id: id + '-ajuda' }, ajuda)
    ]);
  }

  function formEspera(c) {
    var email = campo('vg-espera-email', 'Seu e-mail', false, FRASES.ajudaEmail,
      { type: 'email', autocomplete: 'email', inputmode: 'email', required: 'required', 'aria-describedby': 'vg-espera-email-ajuda', placeholder: 'nome@exemplo.com' });
    var whats = comWhatsapp ? campo('vg-espera-whatsapp', 'Seu WhatsApp', true, FRASES.ajudaWhatsapp,
      { type: 'tel', autocomplete: 'tel-national', inputmode: 'tel', 'aria-describedby': 'vg-espera-whatsapp-ajuda', placeholder: '(DDD) 9 0000-0000' }) : null;
    var erro = el('p', { class: 'aviso aviso--erro', id: 'vg-espera-erro', role: 'alert', hidden: true });
    var enviar = el('button', { type: 'submit', class: 'botao botao--laranja botao--grande botao--bloco', id: 'vg-espera-enviar' }, TEXTOS.lista_espera);
    var form = el('form', { class: 'formulario vg-div-form', id: 'vg-form-espera', novalidate: 'novalidate' }, [email, whats, erro, enviar]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var cEmail = porId('vg-espera-email');
      var cWhats = porId('vg-espera-whatsapp');
      U.limparErroCampo(cEmail); if (cWhats) U.limparErroCampo(cWhats);
      erro.hidden = true;
      var l = lerEspera({ cidade: c.slug, email: cEmail.value, whatsapp: cWhats ? cWhats.value : '', perfil: tipo });
      if (!l.ok) {
        var alvo = l.campo === 'whatsapp' ? cWhats : cEmail;
        U.erroCampo(alvo, l.erro);
        alvo.focus();
        return;
      }
      U.ocupado(enviar, true, FRASES.enviando);
      API.listaEspera(l.dados).then(function () {
        var ok = el('div', { class: 'aviso aviso--ok vg-div-ok', id: 'vg-espera-ok', role: 'status', tabindex: '-1' }, [
          el('p', {}, preencher(TEXTOS.cidade_lista_espera_ok, { cidade: c.nome })),
          l.dados.whatsapp ? el('p', {}, FRASES.okWhatsapp) : null
        ]);
        form.parentNode.replaceChild(ok, form);
        U.anunciar(ok.textContent);
        try { ok.focus({ preventScroll: true }); } catch (e) { ok.focus(); }
        if (tipo === 'pessoa') mostrarAmigoDepois(ok);
      }).catch(function (e) {
        U.ocupado(enviar, false);
        if (e && e.resposta && e.resposta.ativa) { carregar(); return; }   // a cidade abriu enquanto a página estava aberta
        var msg = (e && e.message) || '';
        if (cWhats && /whatsapp/i.test(msg)) { U.erroCampo(cWhats, msg); cWhats.focus(); return; }
        if (/e-mail/i.test(msg) && !(e && e.conexao)) { U.erroCampo(cEmail, msg); cEmail.focus(); return; }
        erro.textContent = msg || FRASES.naoEnviou;
        erro.hidden = false;
      });
    });
    return form;
  }

  // Sair da lista (LGPD): pelo e-mail; a resposta é sempre a mesma (não revela se o e-mail estava na lista).
  function blocoSair(c) {
    var campoEmail = el('input', { class: 'entrada', id: 'vg-sair-email', name: 'vg-sair-email', type: 'email', autocomplete: 'email', inputmode: 'email', 'aria-describedby': 'vg-sair-texto' });
    var botao = el('button', { type: 'submit', class: 'botao botao--claro', id: 'vg-sair-enviar' }, FRASES.sairBotao);
    var form = el('form', { class: 'vg-div-sair__form', id: 'vg-form-sair', novalidate: 'novalidate' }, [
      el('p', { class: 'campo__ajuda', id: 'vg-sair-texto' }, comWhatsapp ? FRASES.sairTexto : FRASES.sairTextoSoEmail),
      el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-sair-email' }, 'E-mail'), campoEmail]),
      el('div', { class: 'acoes' }, botao)
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      U.limparErroCampo(campoEmail);
      var email = normalizarEmail(campoEmail.value);
      if (!email) { U.erroCampo(campoEmail, TEXTOS.email_invalido); campoEmail.focus(); return; }
      U.ocupado(botao, true, FRASES.saindo);
      API.listaEsperaSair({ cidade: c.slug, email: email }).then(function () {
        var ok = el('p', { class: 'aviso aviso--ok', id: 'vg-sair-ok', role: 'status' }, FRASES.sairOk);
        form.parentNode.replaceChild(ok, form);
        U.anunciar(FRASES.sairOk);
      }).catch(function (e) {
        U.ocupado(botao, false);
        U.erroCampo(campoEmail, (e && e.message) || FRASES.naoEnviou);
      });
    });
    return el('details', { class: 'vg-div-sair', id: 'vg-sair' }, [el('summary', { id: 'vg-sair-abrir' }, FRASES.sairAbrir), form]);
  }

  function notaLgpd() {
    return el('p', { class: 'vg-div-nota', id: 'vg-espera-lgpd' }, [(comWhatsapp ? FRASES.lgpd : FRASES.lgpdSoEmail) + ' ', el('a', { href: 'privacidade.html' }, 'Aviso de privacidade'), '.']);
  }

  // ---- chamada por situação
  function chamadaEspera(c) {
    var filhos = [
      el('h2', { class: 'vg-div-chamada__titulo', id: 'vg-chamada-titulo' }, tipo === 'empresa' ? FRASES.esperaTituloEmpresa : FRASES.esperaTitulo + ' de ' + c.nome),
      el('p', { class: 'vg-div-chamada__texto', id: 'vg-espera-texto' }, tipo === 'empresa' ? preencher(TEXTOS.cidade_lista_espera_vazia, { cidade: c.nome }) : textoEspera(c)),
      formEspera(c),
      notaLgpd(),
      blocoSair(c)
    ];
    if (tipo === 'empresa') filhos.push(el('div', { class: 'vg-div-humano' }, [el('p', {}, FRASES.humano), botaoWhatsappGestao('vg-chamada-whatsapp', 'botao--claro')]));
    return filhos;
  }

  function chamadaAtiva(c) {
    var d = destinos(tipo, c);
    var lembrar = function () { U.lembrarCidade(c.slug); };
    if (tipo === 'empresa') {
      return [
        el('h2', { class: 'vg-div-chamada__titulo', id: 'vg-chamada-titulo' }, FRASES.ativaEmpresaTitulo),
        el('p', { class: 'vg-div-chamada__texto' }, FRASES.ativaEmpresaTexto),
        el('div', { class: 'acoes acoes-coluna' }, [
          el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-cadastrar-empresa', href: d.criar, onclick: lembrar }, FRASES.cadastrarEmpresa),
          botaoWhatsappGestao('vg-chamada-whatsapp', 'botao--claro')
        ]),
        el('p', { class: 'vg-div-nota' }, el('a', { href: d.entrar, id: 'vg-ja-tenho-conta' }, FRASES.jaTenhoConta)),
        blocoSair(c)
      ];
    }
    return [
      el('h2', { class: 'vg-div-chamada__titulo', id: 'vg-chamada-titulo' }, preencher(FRASES.ativaTitulo, { cidade: c.nome })),
      el('p', { class: 'vg-div-chamada__texto' }, FRASES.ativaTexto),
      el('div', { class: 'acoes acoes-coluna' }, [
        el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-criar-conta', href: d.criar, onclick: lembrar }, FRASES.criarConta),
        el('a', { class: 'botao botao--claro botao--grande', id: 'vg-ver-vagas', href: d.vagas, onclick: lembrar }, FRASES.verVagas)
      ]),
      el('p', { class: 'vg-div-nota' }, el('a', { href: d.entrar, id: 'vg-ja-tenho-conta' }, FRASES.jaTenhoConta)),
      blocoSair(c)
    ];
  }

  function chamadaOutras(atual) {
    var outras = outrasCidades(estado.cidades, atual);
    if (!outras.length) return null;
    var pagina = tipo === 'empresa' ? 'empresas.html' : 'emprego.html';
    return el('p', { class: 'vg-div-nota', id: 'vg-outras-cidades' }, ['Outra cidade: ',
      outras.map(function (o, i) { return [i ? ' · ' : '', el('a', { href: pagina + '?cidade=' + encodeURIComponent(o.slug) }, o.nome)]; })]);
  }

  function montarChamada() {
    var raiz = porId('vg-chamada-corpo');
    if (!raiz) return;
    var c = estado.cidade;
    if (estado.sit === 'sem_cidade') {
      U.trocar(raiz, [el('h2', { class: 'vg-div-chamada__titulo', id: 'vg-chamada-titulo' }, FRASES.emBreve), el('p', { class: 'vg-div-chamada__texto' }, FRASES.semCidade)]);
      return;
    }
    U.trocar(raiz, [estado.sit === 'ativa' ? chamadaAtiva(c) : chamadaEspera(c), chamadaOutras(c)]);
  }

  // ---- ações principais (topo da empresa e barra fixa): a mesma ação, conforme a situação
  function rotuloAcao() {
    if (estado.sit === 'ativa') return tipo === 'empresa' ? FRASES.cadastrarEmpresa : FRASES.criarConta;
    if (estado.sit === 'espera') return tipo === 'empresa' ? FRASES.esperaEmpresa : TEXTOS.lista_espera;
    return FRASES.saibaMais;
  }
  function irParaChamada(ev) {
    var alvo = porId('vg-chamada');
    if (!alvo || estado.sit === 'ativa') return;   // ativa: o link já leva ao cadastro
    if (ev) ev.preventDefault();
    var reduzir = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { alvo.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' }); } catch (e) { alvo.scrollIntoView(); }
    var email = porId('vg-espera-email');
    if (email) setTimeout(function () { try { email.focus({ preventScroll: true }); } catch (e) { email.focus(); } }, reduzir ? 0 : 400);
  }
  function hrefAcao() { return estado.sit === 'ativa' ? destinos(tipo, estado.cidade).criar : '#vg-chamada'; }
  function atualizarAcao(a) {
    if (!a) return;
    a.textContent = rotuloAcao();
    a.setAttribute('href', hrefAcao());
  }

  function montarBarra() {
    var acao = el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-barra-acao', href: hrefAcao(), onclick: function (ev) {
      if (estado.sit === 'ativa' && estado.cidade) U.lembrarCidade(estado.cidade.slug);
      irParaChamada(ev);
    } }, rotuloAcao());
    var botoes = [acao];
    if (tipo === 'empresa' && numeroGestao(WHATSAPP_GESTAO)) {
      botoes.unshift(el('a', { class: 'botao botao--claro botao--grande', id: 'vg-barra-whatsapp', href: U.whatsapp(numeroGestao(WHATSAPP_GESTAO), textoContato(estado.cidade)),
        target: '_blank', rel: 'noopener' }, [U.icone('whatsapp'), 'WhatsApp']));
    }
    var b = U.barra({ id: 'vg-barra-divulgacao', dica: tipo === 'pessoa' ? TEXTOS.gratis_para_sempre : 'Grátis no lançamento.', botoes: botoes });
    b.classList.add('vg-div-barra');
    U.fixar(b);
    // Uma ação principal à vista por vez: a barra some enquanto a chamada (ou o botão do topo) está na tela.
    var vistos = Array.prototype.slice.call(doc.querySelectorAll('[data-divulgacao-acao]'));
    if (observador) { observador.disconnect(); observador = null; }
    if (!vistos.length || typeof root.IntersectionObserver !== 'function') return;
    var naTela = {};
    var obs = observador = new root.IntersectionObserver(function (itens) {
      itens.forEach(function (i) { naTela[i.target.id] = i.isIntersecting; });
      var algum = Object.keys(naTela).some(function (k) { return naTela[k]; });
      b.classList.toggle('vg-div-barra--oculta', algum);
      b.setAttribute('aria-hidden', algum ? 'true' : 'false');
      Array.prototype.forEach.call(b.querySelectorAll('a, button'), function (x) { if (algum) x.setAttribute('tabindex', '-1'); else x.removeAttribute('tabindex'); });
    }, { threshold: 0.15 });
    vistos.forEach(function (v) { obs.observe(v); });
  }

  // ---- "Mandar para um amigo"
  function hrefAmigo() {
    var link = linkPagina('pessoa', estado.cidade, outrasCidades(estado.cidades, null).length > 1);
    return U.compartilharWhatsapp(textoAmigo(estado.sit, estado.cidade, link));
  }
  function atualizarAmigo() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-amigo]'), function (a) { a.setAttribute('href', hrefAmigo()); });
  }
  function mostrarAmigoDepois(ok) {
    ok.appendChild(el('div', { class: 'acoes' }, el('a', { class: 'botao botao--claro botao--grande', id: 'vg-amigo-depois', 'data-amigo': '', href: hrefAmigo(),
      target: '_blank', rel: 'noopener' }, [U.icone('whatsapp'), FRASES.amigo])));
  }

  // ---- carregar
  function carregar() {
    var raiz = porId('vg-chamada-corpo');
    if (raiz) U.carregando(raiz, FRASES.carregando);
    return garantirRegras().then(function () { return API.cidades(); }).then(function (r) {
      estado.cidades = (r && r.cidades) || [];
      estado.cidade = escolherCidade(estado.cidades, U.parametro('cidade'), U.cidadeLembrada());
      estado.sit = situacao(estado.cidade);
      doc.body.setAttribute('data-situacao', estado.sit);
      porCidade(estado.cidade);
      montarChamada();
      atualizarAcao(porId('vg-topo-acao'));
      atualizarAmigo();
      var w = porId('vg-topo-whatsapp');
      if (w) w.parentNode.replaceChild(botaoWhatsappGestao('vg-topo-whatsapp', 'botao--branco'), w);
      montarBarra();
    }).catch(function (e) {
      if (raiz) U.tratarErro(e, { raiz: raiz, aoTentar: carregar });
    });
  }

  var topoAcao = porId('vg-topo-acao');
  if (topoAcao) topoAcao.addEventListener('click', irParaChamada);
  carregar();
})(typeof self !== 'undefined' ? self : this);
