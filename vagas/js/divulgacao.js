/*
 * Vagas sem Caos — páginas de divulgação: emprego.html (quem procura trabalho, celular primeiro) e empresas.html (quem
 * contrata). O texto das páginas é HTML estático: abre rápido no celular simples, aparece na prévia do WhatsApp e continua
 * utilizável se o banco demorar ou falhar (o botão do topo já existe no HTML e leva à chamada). Este arquivo só faz o que
 * depende do dado:
 *   - escolhe a cidade (?cidade=<slug> → cidade lembrada no aparelho → primeira cidade-polo de VAGAS_API.cidades());
 *   - diz no topo a situação da cidade (chegando / já abriu), sempre com o nome vindo do dado, nunca fixo;
 *   - monta a chamada: lista de espera (e-mail obrigatório + WhatsApp opcional quando RECURSOS.listaEsperaWhatsapp) ou cidade
 *     aberta ("Ver as vagas de {cidade}" / "Cadastrar minha empresa");
 *   - "Mandar no WhatsApp" (texto pronto), o WhatsApp da Gestão sem Caos e a barra fixa com a ação principal.
 * Recursos opcionais do banco, todos atrás de VAGAS_API.RECURSOS (sem a marca, a página faz como antes):
 *   preAberturaEmpresas (empresa cadastra antes de a cidade abrir) · origemListaEspera (manda ?de= como "origem") ·
 *   canalWhatsapp na cidade (link do Canal do WhatsApp da cidade).
 * Só na PRÉVIA (VAGAS_API.modo === 'previa'): seletor "Ver como: cidade em espera | cidade aberta" (sessionStorage, só para
 * mostrar os dois estados ao dono) e os marcadores das pendências do dono (número do WhatsApp, razão social e CNPJ). Fora da
 * prévia, sem número não há botão de WhatsApp nem marcador.
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
  // "Falar no WhatsApp" só aparece na prévia (desligado, com o marcador); fora dela, não aparece.
  var WHATSAPP_GESTAO = '[NÚMERO DA GESTÃO SEM CAOS]';
  // Pendência do dono (rodapé, só na prévia até ser informado).
  var MARCADOR_EMPRESA = '[RAZÃO SOCIAL E CNPJ DA GESTÃO SEM CAOS]';
  var SITE = 'https://vagas.gestaosemcaos.com.br';
  // Endereço curto de cada página: o Cloudflare Pages serve emprego.html em /emprego e empresas.html em /empresas;
  // /emprego/ e /empresas/ (barra no fim) vão para eles por _redirects, antes da regra da cidade.
  var ENDERECO = { pessoa: '/emprego', empresa: '/empresas' };
  // De onde a pessoa veio (?de=): lista fechada; o valor só vai para o banco, nunca fica guardado no aparelho.
  var ORIGENS = ['radio', 'cartaz', 'grupo', 'canal', 'escola', 'mutirao', 'indicacao', 'outro'];
  var CHAVE_VISAO = 'vg.divulgacao.visao';

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
    comecar: 'Começar',
    semCidade: 'Ainda não há cidade aberta para cadastro. Volte em breve.',
    emBreve: 'Em breve',
    // topo (pessoa)
    sobrePadrao: 'Emprego na sua cidade',
    sobreEspera: 'Chegando em {{cidade}}',
    sobreAtiva: 'Vagas em {{cidade}}',
    heroTexto: 'Vagas de carteira assinada, bico e diária de empresas {{lugar}}, num lugar só.',
    situacaoEspera: 'Ainda não abriu: deixe seu contato e avisamos.',
    situacaoAtiva: 'Já abriu: veja as vagas e toque em "Quero".',
    comoFunciona: 'Como funciona',
    comoVaiFuncionar: 'Como vai funcionar',
    // topo (empresa)
    sobreEmpresa: 'Para empresas',
    sobreEmpresaCidade: 'Para empresas de {{cidade}}',
    // chamada
    esperaTitulo: 'Entre na lista de espera de {{cidade}}',
    esperaTituloEmpresa: 'Entre na lista de espera como empresa',
    naLista: 'Você está na lista de {{cidade}}',
    ajudaEmail: 'Para avisar quando abrir. Nada de propaganda. Quem usa Android já tem e-mail: o Gmail do celular.',
    ajudaEmailEmpresa: 'Para avisar quando abrir. Nada de propaganda.',
    ajudaWhatsapp: 'É por ele que avisamos quando abrir. Só para isso.',
    lgpd: 'Ao tocar no botão, você aceita receber o aviso de quando {{cidade}} abrir. Usamos o e-mail e o WhatsApp só para isso. Guardamos até a cidade abrir e mais 90 dias, e você pode sair da lista quando quiser.',
    lgpdSoEmail: 'Ao tocar no botão, você aceita receber o aviso de quando {{cidade}} abrir. Usamos o e-mail só para isso. Guardamos até a cidade abrir e mais 90 dias, e você pode sair da lista quando quiser.',
    okWhatsapp: 'Avisamos no seu WhatsApp também.',
    canal: 'Não usa e-mail? Siga o Canal do Vagas sem Caos em {{cidade}} no WhatsApp',
    sairAbrir: 'Quero sair da lista',
    sairAbrirAtiva: 'Sair da lista de espera',
    sairTexto: 'Escreva o e-mail que você deixou na lista. Ele sai da lista, junto com o WhatsApp.',
    sairTextoSoEmail: 'Escreva o e-mail que você deixou na lista. Ele sai da lista.',
    sairBotao: 'Sair da lista',
    sairOk: 'Pronto. Se este e-mail estava na lista, ele saiu.',
    ativaTitulo: 'Já tem vaga em {{cidade}}',
    ativaTexto: 'Veja as vagas. Para se candidatar, você cria a conta e faz o currículo em 5 passos, pelo celular.',
    ativaEmpresaTitulo: 'Cadastre sua empresa',
    ativaEmpresaTexto: 'Precisa de CNPJ ou MEI. No lançamento, é grátis.',
    preAberturaTexto: 'Sua vaga entra no ar no dia em que {{cidade}} abrir. Precisa de CNPJ ou MEI. No lançamento, é grátis.',
    verVagas: 'Ver as vagas de {{cidade}}',
    criarConta: 'Criar minha conta',
    cadastrarEmpresa: 'Cadastrar minha empresa',
    esperaEmpresa: 'Entrar na lista de espera',
    jaTenhoConta: 'Já tenho conta',
    falarWhatsapp: 'Falar no WhatsApp',
    humano: 'Prefere falar com uma pessoa? Chame a Gestão sem Caos no WhatsApp.',
    humanoPreAbertura: 'Prefere que a gente faça com você? Chame a Gestão sem Caos no WhatsApp.',
    enviando: 'Enviando…',
    saindo: 'Saindo…',
    naoEnviou: 'Não deu para enviar. Tente de novo.',
    amigo: 'Mandar no WhatsApp',
    dicaEmpresa: 'Grátis no lançamento.',
    acaoPrincipal: 'Ação principal',
    // prévia
    previaRotulo: 'Prévia · ver como:',
    previaEspera: 'Cidade em espera',
    previaAtiva: 'Cidade aberta'
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

  // ?de= da campanha: só um valor da lista fechada; o resto é ignorado.
  function lerOrigem(v) { var o = texto(v).trim().toLowerCase(); return ORIGENS.indexOf(o) >= 0 ? o : ''; }

  // Formulário da lista de espera: e-mail obrigatório, WhatsApp opcional (contrato: VAGAS_API.listaEspera({cidade, email,
  // perfil, whatsapp?, origem?})). Confere os dois campos de uma vez: {ok, dados} ou {ok:false, erros:{email?, whatsapp?},
  // campo, erro} (campo e erro = o primeiro, para o foco).
  function lerEspera(d) {
    d = d || {};
    var erros = {};
    var email = normalizarEmail(d.email);
    if (!email) erros.email = TEXTOS.email_invalido;
    var w = '';
    if (texto(d.whatsapp).trim()) {
      w = normalizarWhatsapp(d.whatsapp);
      if (!whatsappCelularValido(w)) erros.whatsapp = TEXTOS.whatsapp_invalido;
    }
    var campos = Object.keys(erros);
    if (campos.length) return { ok: false, erros: erros, campo: campos[0], erro: erros[campos[0]] };
    var dados = { cidade: texto(d.cidade).trim().toLowerCase(), email: email, perfil: d.perfil === 'empresa' ? 'empresa' : 'pessoa' };
    if (w) dados.whatsapp = w;
    var origem = lerOrigem(d.origem);
    if (origem) dados.origem = origem;
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

  // Prévia: "ver como" a cidade em espera ou aberta (só muda o que a tela mostra; o banco não muda).
  function visaoPrevia(v) { return v === 'espera' || v === 'ativa' ? v : ''; }
  function aplicarVisao(c, visao) {
    if (!c || !visaoPrevia(visao)) return c;
    var copia = {};
    Object.keys(c).forEach(function (k) { copia[k] = c[k]; });
    copia.status = visao === 'ativa' ? 'ativa' : 'lista_espera';
    return copia;
  }

  // Texto do convite da lista: com o total só quando o banco devolve 10 ou mais (o número é aproximado, em dezenas).
  function textoEspera(c) {
    var n = Number(c && c.interessados) || 0;
    return n >= 10 ? preencher(TEXTOS.cidade_lista_espera, { cidade: c.nome, total: n }) : preencher(TEXTOS.cidade_lista_espera_vazia, { cidade: c && c.nome });
  }

  // O que o topo diz em cada situação (o HTML já traz o texto sem cidade; o script só troca quando o dado chega).
  function textosTopo(tipo, sit, c) {
    var nome = c && c.nome;
    if (tipo === 'empresa') return { sobre: nome ? preencher(FRASES.sobreEmpresaCidade, { cidade: nome }) : FRASES.sobreEmpresa };
    return {
      sobre: !nome ? FRASES.sobrePadrao : preencher(sit === 'ativa' ? FRASES.sobreAtiva : FRASES.sobreEspera, { cidade: nome }),
      texto: preencher(FRASES.heroTexto, { lugar: nome ? 'de ' + nome : 'da sua cidade' }),
      situacao: sit === 'ativa' ? FRASES.situacaoAtiva : sit === 'espera' ? FRASES.situacaoEspera : '',
      comoTitulo: sit === 'espera' ? FRASES.comoVaiFuncionar : FRASES.comoFunciona
    };
  }

  // Destino das ações (caminhos SEMPRE relativos: o mesmo HTML roda na raiz, em /vagas/ e no artefato de prévia).
  function destinos(tipo, cidade) {
    var slug = cidade ? encodeURIComponent(cidade.slug) : '';
    return tipo === 'empresa'
      ? { criar: 'entrar.html?tipo=empresa', entrar: 'entrar.html?tipo=empresa#entrar', vagas: slug ? 'cidade.html?cidade=' + slug : 'index.html' }
      : { criar: 'entrar.html#criar', entrar: 'entrar.html#entrar', vagas: slug ? 'cidade.html?cidade=' + slug : 'index.html' };
  }

  // Ações do topo (a 1ª é a principal; é também a da barra fixa). recursos = VAGAS_API.RECURSOS.
  function acoesTopo(tipo, sit, c, recursos) {
    var d = destinos(tipo, c);
    var pre = !!(recursos && recursos.preAberturaEmpresas === true);
    if (sit === 'sem_cidade' || !c) return [{ rotulo: FRASES.comecar, href: '#vg-chamada' }];
    if (tipo === 'empresa') {
      if (sit === 'ativa' || pre) return [{ rotulo: FRASES.cadastrarEmpresa, href: d.criar, lembrar: true }];
      return [{ rotulo: FRASES.esperaEmpresa, href: '#vg-chamada' }];
    }
    if (sit === 'ativa') {
      return [{ rotulo: preencher(FRASES.verVagas, { cidade: c.nome }), href: d.vagas, lembrar: true },
        { rotulo: FRASES.criarConta, href: d.criar, lembrar: true, secundaria: true }];
    }
    return [{ rotulo: TEXTOS.lista_espera, href: '#vg-chamada' }];
  }

  // Link da página para compartilhar: com ?cidade= só quando há mais de uma cidade-polo; ?de= marca a origem da campanha.
  function linkPagina(tipo, cidade, comCidade, origem) {
    var q = [];
    if (comCidade && cidade) q.push('cidade=' + encodeURIComponent(cidade.slug));
    if (lerOrigem(origem)) q.push('de=' + lerOrigem(origem));
    return SITE + (ENDERECO[tipo] || ENDERECO.pessoa) + (q.length ? '?' + q.join('&') : '');
  }

  // "Mandar no WhatsApp": novidade local, curta, com o link e o aviso anti-golpe.
  function textoAmigo(sit, cidade, link) {
    var nome = cidade && cidade.nome;
    if (sit === 'ativa' && nome) {
      return 'Já tem vaga no Vagas sem Caos em ' + nome + ': carteira assinada, bico e diária de empresas daqui, de graça e pelo celular. Veja as vagas: ' +
        link + ' · Nunca pague para se candidatar.';
    }
    if (sit === 'espera' && nome) {
      return 'Vai abrir o Vagas sem Caos em ' + nome + ': vagas de empresas daqui, num lugar só, de graça e pelo celular. Deixe seu contato e receba o aviso quando abrir: ' +
        link + ' · Nunca pague para se candidatar.';
    }
    return 'Vagas sem Caos: vagas de empresas da cidade, de graça e pelo celular. ' + link + ' · Nunca pague para se candidatar.';
  }
  // Primeira mensagem para a Gestão sem Caos.
  function textoContato(tipo, cidade) {
    var em = cidade && cidade.nome ? ' em ' + cidade.nome : '';
    if (tipo === 'empresa') return 'Oi! Tenho uma empresa' + em + ' e quero saber como anunciar vagas no Vagas sem Caos.';
    return em ? 'Oi! Moro' + em + ' e quero ajuda com o Vagas sem Caos.' : 'Oi! Quero ajuda com o Vagas sem Caos.';
  }
  // Número da Gestão sem Caos utilizável? (o marcador da pendência não é número)
  function numeroGestao(n) {
    var d = texto(n).replace(/\D/g, '');
    return /^\[/.test(texto(n).trim()) || !/^55[1-9][1-9][0-9]{8,9}$/.test(d) ? '' : d;
  }
  // Botão de WhatsApp da Gestão sem Caos: 'link' com número; 'marcador' só na prévia sem número; '' fora da prévia sem número.
  function mostrarWhatsapp(modo, numero) { return numeroGestao(numero) ? 'link' : modo === 'previa' ? 'marcador' : ''; }
  // Canal do WhatsApp da cidade (C2): só endereço de canal do próprio WhatsApp, por https.
  function canalValido(url) {
    var u = texto(url).trim();
    return /^https:\/\/(www\.)?whatsapp\.com\/channel\/[A-Za-z0-9_-]{6,64}$/.test(u) ? u : '';
  }

  var PURO = {
    WHATSAPP_GESTAO: WHATSAPP_GESTAO, MARCADOR_EMPRESA: MARCADOR_EMPRESA, SITE: SITE, ENDERECO: ENDERECO, ORIGENS: ORIGENS, TEXTOS: TEXTOS, FRASES: FRASES,
    preencher: preencher, normalizarEmail: normalizarEmail, normalizarWhatsapp: normalizarWhatsapp, whatsappCelularValido: whatsappCelularValido,
    lerOrigem: lerOrigem, lerEspera: lerEspera, escolherCidade: escolherCidade, outrasCidades: outrasCidades, situacao: situacao,
    visaoPrevia: visaoPrevia, aplicarVisao: aplicarVisao, textoEspera: textoEspera, textosTopo: textosTopo, destinos: destinos, acoesTopo: acoesTopo,
    linkPagina: linkPagina, textoAmigo: textoAmigo, textoContato: textoContato, numeroGestao: numeroGestao, mostrarWhatsapp: mostrarWhatsapp,
    canalValido: canalValido
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
  var RECURSOS = API.RECURSOS || {};
  var previa = API.modo === 'previa';
  // O campo de WhatsApp só aparece quando o cliente anuncia que o banco aceita (RECURSOS da migração 20261024).
  var comWhatsapp = !!RECURSOS.listaEsperaWhatsapp;
  var estado = { cidade: null, real: null, sit: null, cidades: [] };
  var observador = null;
  var barra = null;

  function porId(id) { return doc.getElementById(id); }
  function focar(n) { try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } }

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

  // ---- prévia: "ver como" (sessionStorage: some quando a aba fecha; nunca no modo supabase)
  var memoriaVisao = '';
  function lerVisao() { try { return visaoPrevia(root.sessionStorage.getItem(CHAVE_VISAO)); } catch (e) { return memoriaVisao; } }
  function gravarVisao(v) {
    memoriaVisao = v;
    try { if (v) root.sessionStorage.setItem(CHAVE_VISAO, v); else root.sessionStorage.removeItem(CHAVE_VISAO); } catch (e) { /* fica na memória */ }
  }
  function montarSeletorPrevia() {
    var principal = porId('conteudo');
    if (!previa || !principal || porId('vg-div-previa')) return;
    function botao(v, rotulo) {
      return el('button', { type: 'button', class: 'segmento__botao', id: 'vg-previa-' + v, 'aria-pressed': lerVisao() === v ? 'true' : 'false', onclick: function () {
        gravarVisao(lerVisao() === v ? '' : v);
        Array.prototype.forEach.call(doc.querySelectorAll('#vg-div-previa .segmento__botao'), function (b) {
          b.setAttribute('aria-pressed', b.id === 'vg-previa-' + lerVisao() ? 'true' : 'false');
        });
        carregar();
      } }, rotulo);
    }
    principal.insertBefore(el('div', { class: 'vg-div-previa', id: 'vg-div-previa', role: 'group', 'aria-label': FRASES.previaRotulo }, [
      el('span', { class: 'vg-div-previa__rotulo' }, FRASES.previaRotulo),
      el('span', { class: 'segmento' }, [botao('espera', FRASES.previaEspera), botao('ativa', FRASES.previaAtiva)])
    ]), principal.firstChild);
  }

  // ---- WhatsApp da Gestão sem Caos
  function botaoWhatsappGestao(id, classe) {
    var modo = mostrarWhatsapp(API.modo, WHATSAPP_GESTAO);
    if (modo === 'link') {
      return el('a', { class: 'botao ' + classe + ' botao--grande', id: id, href: U.whatsapp(numeroGestao(WHATSAPP_GESTAO), textoContato(tipo, estado.cidade)),
        target: '_blank', rel: 'noopener' }, [U.icone('whatsapp'), FRASES.falarWhatsapp]);
    }
    if (modo !== 'marcador') return null;
    // Só na prévia: botão desligado e o marcador da pendência do dono.
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

  function sucessoEspera(c, form, comWhats) {
    var ok = el('div', { class: 'aviso aviso--ok vg-div-ok', id: 'vg-espera-ok', tabindex: '-1' }, [
      el('p', {}, preencher(TEXTOS.cidade_lista_espera_ok, { cidade: c.nome })),
      comWhats ? el('p', {}, FRASES.okWhatsapp) : null
    ]);
    form.parentNode.replaceChild(ok, form);
    var titulo = porId('vg-chamada-titulo');
    if (titulo) titulo.textContent = preencher(FRASES.naLista, { cidade: c.nome });
    U.anunciar(ok.textContent);
    focar(ok);
    if (tipo === 'pessoa') {
      ok.appendChild(el('div', { class: 'acoes' }, el('a', { class: 'botao botao--claro botao--grande', id: 'vg-amigo-depois', 'data-amigo': '', href: hrefAmigo(),
        target: '_blank', rel: 'noopener' }, [U.icone('whatsapp'), FRASES.amigo])));
    }
  }

  function formEspera(c) {
    var email = campo('vg-espera-email', 'Seu e-mail', false, tipo === 'empresa' ? FRASES.ajudaEmailEmpresa : FRASES.ajudaEmail,
      { type: 'email', autocomplete: 'email', inputmode: 'email', required: 'required', 'aria-describedby': 'vg-espera-email-ajuda', placeholder: 'nome@exemplo.com' });
    var whats = comWhatsapp ? campo('vg-espera-whatsapp', 'Seu WhatsApp', true, FRASES.ajudaWhatsapp,
      { type: 'tel', autocomplete: 'tel-national', inputmode: 'tel', 'aria-describedby': 'vg-espera-whatsapp-ajuda', placeholder: '(DDD) 9 0000-0000' }) : null;
    // Isca para robô: fora da tela e fora do Tab; quem preenche recebe o mesmo "Pronto!" e nada é enviado.
    var isca = el('div', { class: 'vg-div-isca', 'aria-hidden': 'true' }, [el('label', { for: 'vg-espera-site' }, 'Não preencha'),
      el('input', { type: 'text', id: 'vg-espera-site', name: 'site', tabindex: '-1', autocomplete: 'off' })]);
    var erro = el('p', { class: 'aviso aviso--erro', id: 'vg-espera-erro', role: 'alert', hidden: true });
    var enviar = el('button', { type: 'submit', class: 'botao botao--laranja botao--grande botao--bloco', id: 'vg-espera-enviar' }, TEXTOS.lista_espera);
    var form = el('form', { class: 'formulario vg-div-form', id: 'vg-form-espera', novalidate: 'novalidate' }, [email, whats, isca, erro, enviar]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var cEmail = porId('vg-espera-email');
      var cWhats = porId('vg-espera-whatsapp');
      U.limparErroCampo(cEmail); if (cWhats) U.limparErroCampo(cWhats);
      erro.hidden = true;
      var l = lerEspera({ cidade: c.slug, email: cEmail.value, whatsapp: cWhats ? cWhats.value : '', perfil: tipo,
        origem: RECURSOS.origemListaEspera === true ? U.parametro('de') : '' });
      if (!l.ok) {
        if (l.erros.email) U.erroCampo(cEmail, l.erros.email);
        if (l.erros.whatsapp && cWhats) U.erroCampo(cWhats, l.erros.whatsapp);
        focar(l.campo === 'whatsapp' && cWhats ? cWhats : cEmail);
        return;
      }
      if (porId('vg-espera-site').value) { sucessoEspera(c, form, !!l.dados.whatsapp); return; }
      U.ocupado(enviar, true, FRASES.enviando);
      API.listaEspera(l.dados).then(function () {
        sucessoEspera(c, form, !!l.dados.whatsapp);
      }).catch(function (e) {
        U.ocupado(enviar, false);
        if (e && e.resposta && e.resposta.ativa) {
          // Na prévia, "ver como: cidade em espera" sobre uma cidade aberta: mostra o caminho de quem entra na lista.
          if (previa && lerVisao() === 'espera') { sucessoEspera(c, form, !!l.dados.whatsapp); return; }
          carregar(); return;                                              // a cidade abriu enquanto a página estava aberta
        }
        var msg = (e && e.message) || '';
        if (cWhats && /whatsapp/i.test(msg)) { U.erroCampo(cWhats, msg); focar(cWhats); return; }
        if (/e-mail/i.test(msg) && !(e && e.conexao)) { U.erroCampo(cEmail, msg); focar(cEmail); return; }
        erro.textContent = msg || FRASES.naoEnviou;
        erro.hidden = false;
      });
    });
    return form;
  }

  // Sair da lista (LGPD): pelo e-mail; a resposta é sempre a mesma (não revela se o e-mail estava na lista).
  function blocoSair(c, rotulo) {
    var campoEmail = el('input', { class: 'entrada', id: 'vg-sair-email', name: 'vg-sair-email', type: 'email', autocomplete: 'email', inputmode: 'email', 'aria-describedby': 'vg-sair-texto' });
    var botao = el('button', { type: 'submit', class: 'botao botao--claro botao--grande', id: 'vg-sair-enviar' }, FRASES.sairBotao);
    var form = el('form', { class: 'vg-div-sair__form', id: 'vg-form-sair', novalidate: 'novalidate' }, [
      el('p', { class: 'campo__ajuda', id: 'vg-sair-texto' }, comWhatsapp ? FRASES.sairTexto : FRASES.sairTextoSoEmail),
      el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-sair-email' }, 'E-mail'), campoEmail]),
      el('div', { class: 'acoes' }, botao)
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      U.limparErroCampo(campoEmail);
      var email = normalizarEmail(campoEmail.value);
      if (!email) { U.erroCampo(campoEmail, TEXTOS.email_invalido); focar(campoEmail); return; }
      U.ocupado(botao, true, FRASES.saindo);
      API.listaEsperaSair({ cidade: c.slug, email: email }).then(function () {
        var ok = el('p', { class: 'aviso aviso--ok', id: 'vg-sair-ok', tabindex: '-1' }, FRASES.sairOk);
        form.parentNode.replaceChild(ok, form);
        U.anunciar(FRASES.sairOk);
        focar(ok);
      }).catch(function (e) {
        U.ocupado(botao, false);
        U.erroCampo(campoEmail, (e && e.message) || FRASES.naoEnviou);
      });
    });
    return el('details', { class: 'vg-div-sair', id: 'vg-sair' }, [el('summary', { id: 'vg-sair-abrir' }, rotulo || FRASES.sairAbrir), form]);
  }

  function notaLgpd(c) {
    return el('p', { class: 'vg-div-nota', id: 'vg-espera-lgpd' }, [preencher(comWhatsapp ? FRASES.lgpd : FRASES.lgpdSoEmail, { cidade: c.nome }) + ' ',
      el('a', { href: 'privacidade.html' }, 'Aviso de privacidade'), '.']);
  }

  // Canal do WhatsApp da cidade (C2): só um link para fora, nada é coletado.
  function linkCanal(c) {
    var url = canalValido(c && c.canalWhatsapp);
    if (!url) return null;
    return el('p', { class: 'vg-div-canal', id: 'vg-espera-canal' }, el('a', { href: url, target: '_blank', rel: 'noopener', id: 'vg-canal-link' },
      [U.icone('whatsapp'), preencher(FRASES.canal, { cidade: c.nome })]));
  }

  function blocoHumano(texto) {
    var b = botaoWhatsappGestao('vg-chamada-whatsapp', 'botao--claro');
    return b ? el('div', { class: 'vg-div-humano' }, [el('p', {}, texto), b]) : null;
  }
  function jaTenhoConta(d) { return el('p', { class: 'vg-div-nota' }, el('a', { href: d.entrar, id: 'vg-ja-tenho-conta' }, FRASES.jaTenhoConta)); }

  // ---- chamada por situação
  function chamadaEspera(c) {
    if (tipo === 'empresa' && RECURSOS.preAberturaEmpresas === true) return chamadaPreAbertura(c);
    var filhos = [
      el('h2', { class: 'vg-div-chamada__titulo', id: 'vg-chamada-titulo' }, tipo === 'empresa' ? FRASES.esperaTituloEmpresa : preencher(FRASES.esperaTitulo, { cidade: c.nome })),
      el('p', { class: 'vg-div-chamada__texto', id: 'vg-espera-texto' }, tipo === 'empresa' ? preencher(TEXTOS.cidade_lista_espera_vazia, { cidade: c.nome }) : textoEspera(c)),
      formEspera(c),
      tipo === 'pessoa' ? linkCanal(c) : null,
      notaLgpd(c),
      blocoSair(c)
    ];
    if (tipo === 'empresa') filhos.push(blocoHumano(FRASES.humano));
    return filhos;
  }

  function chamadaPreAbertura(c) {
    var d = destinos('empresa', c);
    return [
      el('h2', { class: 'vg-div-chamada__titulo', id: 'vg-chamada-titulo' }, FRASES.ativaEmpresaTitulo),
      el('p', { class: 'vg-div-chamada__texto', id: 'vg-pre-abertura' }, preencher(FRASES.preAberturaTexto, { cidade: c.nome })),
      el('div', { class: 'acoes acoes-coluna' }, el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-cadastrar-empresa', href: d.criar,
        onclick: function () { U.lembrarCidade(c.slug); } }, FRASES.cadastrarEmpresa)),
      blocoHumano(FRASES.humanoPreAbertura),
      jaTenhoConta(d)
    ];
  }

  function chamadaAtiva(c) {
    var d = destinos(tipo, c);
    var lembrar = function () { U.lembrarCidade(c.slug); };
    if (tipo === 'empresa') {
      return [
        el('h2', { class: 'vg-div-chamada__titulo', id: 'vg-chamada-titulo' }, FRASES.ativaEmpresaTitulo),
        el('p', { class: 'vg-div-chamada__texto' }, FRASES.ativaEmpresaTexto),
        el('div', { class: 'acoes acoes-coluna' }, el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-cadastrar-empresa', href: d.criar, onclick: lembrar }, FRASES.cadastrarEmpresa)),
        blocoHumano(FRASES.humano),
        jaTenhoConta(d)
      ];
    }
    return [
      el('h2', { class: 'vg-div-chamada__titulo', id: 'vg-chamada-titulo' }, preencher(FRASES.ativaTitulo, { cidade: c.nome })),
      el('p', { class: 'vg-div-chamada__texto' }, FRASES.ativaTexto),
      el('div', { class: 'acoes acoes-coluna' }, [
        el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-ver-vagas', href: d.vagas, onclick: lembrar }, preencher(FRASES.verVagas, { cidade: c.nome })),
        el('a', { class: 'botao botao--claro botao--grande', id: 'vg-criar-conta', href: d.criar, onclick: lembrar }, FRASES.criarConta)
      ]),
      jaTenhoConta(d)
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

  // ---- topo: textos da situação e ações (o HTML já traz um botão que leva à chamada; aqui só refina)
  function porTexto(id, valor) { var n = porId(id); if (n && valor != null) n.textContent = valor; }
  function montarTopo() {
    var t = textosTopo(tipo, estado.sit, estado.cidade);
    porTexto('vg-div-sobre', t.sobre);
    porTexto('vg-div-hero-texto', t.texto);
    porTexto('vg-div-situacao', t.situacao);
    porTexto('vg-div-como-titulo', t.comoTitulo);
    var acoes = acoesTopo(tipo, estado.sit, estado.cidade, RECURSOS);
    var principal = porId('vg-topo-acao');
    if (principal) { principal.textContent = acoes[0].rotulo; principal.setAttribute('href', acoes[0].href); principal.setAttribute('data-lembrar', acoes[0].lembrar ? '1' : ''); }
    var caixa = porId('vg-topo-acoes');
    if (!caixa) return;
    Array.prototype.forEach.call(caixa.querySelectorAll('[data-topo-extra]'), function (n) { n.parentNode.removeChild(n); });
    var segunda = acoes[1];
    if (segunda) {
      caixa.appendChild(el('a', { class: 'botao botao--branco botao--grande', id: 'vg-topo-acao2', href: segunda.href, 'data-topo-extra': '',
        onclick: function () { if (estado.cidade) U.lembrarCidade(estado.cidade.slug); } }, segunda.rotulo));
    }
    if (tipo === 'empresa') {
      var w = botaoWhatsappGestao('vg-topo-whatsapp', 'botao--branco');
      if (w) { w.setAttribute('data-topo-extra', ''); caixa.appendChild(w); }
    }
  }

  function aoClicarAcao(ev) {
    var a = ev.currentTarget;
    var href = a.getAttribute('href') || '';
    if (a.getAttribute('data-lembrar') === '1' && estado.cidade) U.lembrarCidade(estado.cidade.slug);
    if (href.charAt(0) !== '#') return;            // vai para o cadastro ou para as vagas
    ev.preventDefault();
    var alvo = porId('vg-chamada');
    if (!alvo) return;
    var reduzir = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { alvo.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' }); } catch (e) { alvo.scrollIntoView(); }
    var email = porId('vg-espera-email');
    setTimeout(function () { focar(email || porId('vg-chamada-titulo') || alvo); }, reduzir ? 0 : 400);
  }

  // ---- barra fixa: montada já no carregamento ("Começar"), refinada quando o dado chega
  function montarBarra() {
    var acao = el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-barra-acao', href: '#vg-chamada', onclick: aoClicarAcao }, FRASES.comecar);
    barra = U.barra({ id: 'vg-barra-divulgacao', dica: tipo === 'pessoa' ? TEXTOS.gratis_para_sempre : FRASES.dicaEmpresa, botoes: [acao] });
    barra.classList.add('vg-div-barra');
    barra.setAttribute('role', 'region');
    barra.setAttribute('aria-label', FRASES.acaoPrincipal);
    U.fixar(barra);
    // Uma ação principal à vista por vez: a barra some enquanto a chamada (ou o botão do topo) está na tela.
    var vistos = Array.prototype.slice.call(doc.querySelectorAll('[data-divulgacao-acao]'));
    if (!vistos.length || typeof root.IntersectionObserver !== 'function') return;
    var naTela = {};
    observador = new root.IntersectionObserver(function (itens) {
      itens.forEach(function (i) { naTela[i.target.id] = i.isIntersecting; });
      var algum = Object.keys(naTela).some(function (k) { return naTela[k]; });
      barra.classList.toggle('vg-div-barra--oculta', algum);
      barra.setAttribute('aria-hidden', algum ? 'true' : 'false');
      Array.prototype.forEach.call(barra.querySelectorAll('a, button'), function (x) { if (algum) x.setAttribute('tabindex', '-1'); else x.removeAttribute('tabindex'); });
    }, { threshold: 0.15 });
    vistos.forEach(function (v) { observador.observe(v); });
  }
  function atualizarBarra() {
    if (!barra) return;
    var acoes = acoesTopo(tipo, estado.sit, estado.cidade, RECURSOS);
    var acao = porId('vg-barra-acao');
    acao.textContent = acoes[0].rotulo;
    acao.setAttribute('href', acoes[0].href);
    acao.setAttribute('data-lembrar', acoes[0].lembrar ? '1' : '');
    var linha = barra.querySelector('.barra-botoes');
    var velho = porId('vg-barra-whatsapp');
    if (velho) velho.parentNode.removeChild(velho);
    linha.classList.remove('vg-div-barra__botoes--whats', 'barra-botoes--um');
    // Empresa com número: WhatsApp só com o ícone (cabe a 360 px), o resto da linha fica para a ação.
    if (tipo === 'empresa' && mostrarWhatsapp(API.modo, WHATSAPP_GESTAO) === 'link') {
      linha.insertBefore(el('a', { class: 'botao botao--claro botao--grande vg-div-barra__whats', id: 'vg-barra-whatsapp', 'aria-label': FRASES.falarWhatsapp,
        href: U.whatsapp(numeroGestao(WHATSAPP_GESTAO), textoContato(tipo, estado.cidade)), target: '_blank', rel: 'noopener' }, U.icone('whatsapp')), acao);
      linha.classList.add('vg-div-barra__botoes--whats');
    } else {
      linha.classList.add('barra-botoes--um');
    }
  }

  // ---- "Mandar no WhatsApp"
  function hrefAmigo() {
    var link = linkPagina('pessoa', estado.cidade, outrasCidades(estado.cidades, null).length > 1, 'indicacao');
    return U.compartilharWhatsapp(textoAmigo(estado.sit, estado.cidade, link));
  }
  function atualizarAmigo() {
    Array.prototype.forEach.call(doc.querySelectorAll('[data-amigo]'), function (a) { a.setAttribute('href', hrefAmigo()); });
  }

  // ---- ajuda humana (pessoa), pergunta do golpe e rodapé
  function montarAjuda() {
    var ajuda = porId('vg-div-ajuda');
    var acoes = porId('vg-ajuda-acoes');
    if (ajuda && acoes) {
      var b = botaoWhatsappGestao('vg-ajuda-whatsapp', 'botao--claro');
      U.trocar(acoes, b);
      ajuda.hidden = !b;
    }
    var link = mostrarWhatsapp(API.modo, WHATSAPP_GESTAO) === 'link';
    Array.prototype.forEach.call(doc.querySelectorAll('[data-com-whatsapp]'), function (n) { n.hidden = !link; });
  }
  function montarRodape() {
    var rodape = porId('vg-div-rodape');
    if (!rodape) return;
    var extra = porId('vg-div-rodape-extra');
    if (!extra) { extra = el('div', { class: 'vg-div-rodape__extra', id: 'vg-div-rodape-extra' }); rodape.appendChild(extra); }
    U.trocar(extra, [
      // Cidade aberta: "sair da lista" sai da chamada (quem chega agora nunca entrou em lista) e fica aqui embaixo.
      estado.sit === 'ativa' && estado.cidade ? blocoSair(estado.cidade, FRASES.sairAbrirAtiva) : null,
      previa ? el('p', { class: 'vg-div-marcador', id: 'vg-marcador-empresa' }, MARCADOR_EMPRESA) : null
    ]);
  }

  // ---- carregar
  function carregar() {
    var raiz = porId('vg-chamada-corpo');
    if (raiz) U.carregando(raiz, FRASES.carregando);
    return garantirRegras().then(function () { return API.cidades(); }).then(function (r) {
      estado.cidades = (r && r.cidades) || [];
      estado.real = escolherCidade(estado.cidades, U.parametro('cidade'), U.cidadeLembrada());
      estado.cidade = previa ? aplicarVisao(estado.real, lerVisao()) : estado.real;
      estado.sit = situacao(estado.cidade);
      doc.body.setAttribute('data-situacao', estado.sit);
      montarTopo();
      montarChamada();
      atualizarBarra();
      atualizarAmigo();
      montarAjuda();
      montarRodape();
    }).catch(function (e) {
      if (raiz) U.tratarErro(e, { raiz: raiz, aoTentar: carregar });
    });
  }

  montarSeletorPrevia();
  var topoAcao = porId('vg-topo-acao');
  if (topoAcao) topoAcao.addEventListener('click', aoClicarAcao);
  montarBarra();
  montarRodape();
  carregar();
})(typeof self !== 'undefined' ? self : this);
