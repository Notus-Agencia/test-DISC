/*
 * Vagas sem Caos — cidade.html: lista pública de vagas de UMA cidade (docs/VAGAS-TELAS.md §2.1–2.3, mockups pessoa-inicio,
 * pessoa-filtros, pessoa-espera, pessoa-pausada, pessoa-offline).
 *   cidade.html?cidade=<slug>[&areas=a,b&modalidade=clt&turno=manha&salarioMin=160000&zona=<slug>&entorno=1&semExperiencia=1&paraHoje=1&busca=…]
 *   cidade.html?cidade=<slug>&vaga=<CÓDIGO>  (botão "Quero essa vaga" do link curto /v/<código>) -> vaga.html?vaga=<CÓDIGO>
 * Filtros só de atributos da VAGA (P3: nada de nota, selo, referência, idade, sexo). Ficam no aparelho ('vg.filtros.<cidade>')
 * e na URL. A última lista fica no aparelho ('vg.lista.<cidade>') para abrir sem internet. Nome da cidade sempre do dado.
 * Lista de espera: e-mail (WhatsApp opcional quando VAGAS_API.RECURSOS.listaEsperaWhatsapp existir).
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var R = nodeJs ? require('./regras.js') : root.VAGAS_REGRAS;
  var LIMITE = 20;
  // WhatsApp opcional na lista de espera (decisão 4 do dono): o banco ainda não guarda (pedido ao banco-onda2). O campo
  // #vg-espera-whatsapp só aparece quando o cliente anunciar o recurso (VAGAS_API.RECURSOS.listaEsperaWhatsapp); ele vai na chave
  // `whatsapp` de VAGAS_API.listaEspera. Até lá a tela manda só o e-mail.
  function listaEsperaComWhatsapp(api) { return !!(api && api.RECURSOS && api.RECURSOS.listaEsperaWhatsapp); }
  var FILTROS = ['areas', 'modalidade', 'turno', 'salarioMin', 'zona', 'entorno', 'semExperiencia', 'paraHoje', 'busca'];
  var LISTAS = { areas: 1, modalidade: 1, turno: 1 };

  // ------------------------------------------------------------------------------------------------- lógica pura
  // Filtros a partir da busca da URL (só chaves e valores conhecidos; o resto é ignorado).
  function filtrosDaUrl(busca, parametro) {
    var f = {};
    var tem = false;
    FILTROS.forEach(function (k) {
      var v = parametro(k, busca);
      if (v === null) return;
      tem = true;
      if (LISTAS[k]) {
        var lista = k === 'areas' ? R.AREAS : k === 'modalidade' ? R.MODALIDADES : R.TURNOS_VAGA;
        f[k] = R.listaEnum(String(v).split(','), lista);
      } else if (k === 'salarioMin') { var n = parseInt(v, 10); if (n > 0 && n < 10000000) f[k] = n; }
      else if (k === 'zona') { if (/^[a-z0-9-]{1,60}$/.test(v)) f[k] = v; }
      else if (k === 'busca') { var b = R.limparTexto(v, 60); if (b) f[k] = b; }
      else f[k] = v === '1' || v === 'true';
    });
    return tem ? f : null;
  }
  function filtrosParaUrl(f) {
    var p = [];
    FILTROS.forEach(function (k) {
      var v = f[k];
      if (v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && !v.length)) return;
      p.push(k + '=' + encodeURIComponent(Array.isArray(v) ? v.join(',') : v === true ? '1' : String(v)));
    });
    return p.join('&');
  }
  // Filtro que vai para VAGAS_API.anuncios: sem "areas" = o banco usa as áreas do currículo (pessoa logada); entorno só se pedido.
  function filtroDaApi(slug, f, extra) {
    var o = { cidade: slug, entorno: !!f.entorno, limite: LIMITE };
    ['areas', 'modalidade', 'turno'].forEach(function (k) { if (f[k] && f[k].length) o[k] = f[k].slice(); });
    if (f.areasTodas) o.areas = [];
    if (f.salarioMin) o.salarioMin = f.salarioMin;
    if (f.zona) o.zona = f.zona;
    if (f.semExperiencia) o.semExperiencia = true;
    if (f.paraHoje) o.paraHoje = true;
    if (f.busca) o.busca = f.busca;
    return Object.assign(o, extra || {});
  }
  function quantosFiltros(f) {
    return (f.areas || []).length + (f.modalidade || []).length + (f.turno || []).length + (f.salarioMin ? 1 : 0) + (f.zona ? 1 : 0) +
      (f.semExperiencia ? 1 : 0) + (f.paraHoje ? 1 : 0) + (f.entorno ? 1 : 0);
  }
  // "R$ 1.600", "1600", "1.600,00" -> centavos; '' -> null; texto com letra -> NaN (erro na tela).
  function lerSalario(t) {
    var s = String(t || '').trim();
    if (!s) return null;
    if (/[a-qs-z]/i.test(s.replace(/^r\$\s*/i, ''))) return NaN;
    var limpo = s.replace(/^r\$\s*/i, '').replace(/\./g, '').replace(/,\d{0,2}$/, '').replace(/\D/g, '');
    if (!limpo) return NaN;
    return parseInt(limpo, 10) * 100;
  }
  // "Mais de 10" (o banco devolve aproximado, em dezenas; 0 = esconde). Nunca o número exato.
  function interessadosTexto(n) { n = Number(n) || 0; return n >= 10 ? 'Mais de ' + (Math.floor(n / 10) * 10) : ''; }

  // ------------------------------------------------------------------------------------------------- tela
  function iniciar() {
    var U = root.VAGAS_UI;
    var A = root.VAGAS_API;
    var P = root.VAGAS_PECAS;
    var el = U.el;
    var app = root.document.getElementById('app');
    var slug = String(U.parametro('cidade') || U.cidadeLembrada() || '').toLowerCase();
    var codigo = String(U.parametro('vaga') || '').toUpperCase();
    if (/^[A-Z0-9]{4,12}$/.test(codigo)) { root.location.replace('vaga.html?vaga=' + encodeURIComponent(codigo)); return; }
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) { U._api.navegar('index.html?escolher=1'); return; }

    var cidades = [];
    var cidade = null;
    var logado = null;          // resposta de eu() da pessoa (ou null)
    var filtros = filtrosDaUrl(root.location.search, U.parametro) || U.armazenamento.ler('vg.filtros.' + slug, null) || {};
    var proximo = '';
    var vagas = [];
    var pedido = 0;
    var areasPadrao = [];

    function nomeCidade() { return cidade ? cidade.nome : ''; }
    function vizinhas() { return cidades.filter(function (c) { return c.praca === slug && c.status === 'ativa'; }); }
    function outraAtiva() { return cidades.filter(function (c) { return c.status === 'ativa' && c.slug !== slug && !c.praca; })[0] || null; }
    function topo() { U.topo({ cidade: cidade ? { nome: cidade.nome, slug: slug } : null, aoCidade: escolherCidade }); }
    function titulo(t) { root.document.title = t + ' | Vagas sem Caos'; }

    // ----------------------------------------------------------------- janela de cidades (pílula do topo)
    function escolherCidade() {
      var j = U.janela({ id: 'vg-janela-cidade', titulo: 'Escolha a cidade', corpo: el('ul', { class: 'vg-linhas' }, cidades.filter(function (c) { return !c.praca; }).map(function (c) {
        var texto = c.status === 'lista_espera' ? 'Avise-me' : c.status === 'pausada' ? 'Em pausa' : (c.slug === slug ? 'Você está aqui' : 'Ver vagas');
        return el('li', {}, el('a', { class: 'vg-linha', href: 'cidade.html?cidade=' + encodeURIComponent(c.slug), data: { cidade: c.slug },
          onclick: function () { if (c.status === 'ativa') U.lembrarCidade(c.slug); } }, [
          el('span', { class: 'vg-iniciais', 'aria-hidden': 'true' }, U.icone('pin')), el('span', { class: 'vg-linha__titulo' }, c.nome),
          el('span', { class: 'vg-status' }, texto)]));
      })), acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-janela-cidade-fechar', onclick: function () { j.fechar(); } }, 'Fechar')] });
    }

    // ----------------------------------------------------------------- lista
    var busca, contagem, chips, abrir, listaEl, mais, notaAreas;
    function montarLista() {
      var viz = vizinhas();
      titulo('Vagas de ' + nomeCidade());
      busca = el('input', { id: 'vg-busca', class: 'entrada', type: 'search', placeholder: 'Buscar por função (ex.: caixa, vendedor)', autocomplete: 'off', value: filtros.busca || '', enterkeyhint: 'search' });
      abrir = el('button', { type: 'button', class: 'vg-chip vg-chip--filtrar', id: 'vg-abrir-filtros', 'aria-haspopup': 'dialog', 'aria-controls': 'vg-filtros', 'aria-expanded': 'false', onclick: abrirFiltros });
      chips = el('div', { class: 'vg-chips vg-chips--ativos', id: 'vg-filtros-ativos', role: 'group', 'aria-label': 'Filtros ativos' });
      contagem = el('p', { class: 'vg-contagem', id: 'vg-contagem', 'aria-live': 'polite' });
      listaEl = el('ul', { class: 'vg-vagas', id: 'vg-lista', 'aria-labelledby': 'vg-titulo' });
      mais = el('div', { class: 'acoes acoes-coluna', hidden: true }, el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-mais', onclick: verMais }, 'Ver mais 20 vagas'));
      notaAreas = el('p', { class: 'vg-nota-lista', id: 'vg-nota-areas', hidden: true });
      U.trocar(app, [
        el('section', { 'aria-labelledby': 'vg-titulo' }, [
          el('p', { class: 'sobretitulo' }, viz.length ? nomeCidade() + ' e região' : nomeCidade()),
          el('h1', { id: 'vg-titulo', class: 'titulo-pagina', tabindex: '-1' }, 'Vagas de hoje'),
          el('p', { class: 'subtitulo' }, 'Empresas daqui, conferidas uma a uma. Candidatar-se é grátis, sempre.'),
          el('div', { class: 'vg-busca' }, [el('label', { class: 'visualmente-oculto', for: 'vg-busca' }, 'Buscar vaga'), U.icone('lupa'), busca]),
          el('div', { class: 'vg-filtros-barra', id: 'vg-filtros-barra' }, [abrir, chips]),
          contagem, listaEl, mais, notaAreas,
          el('div', { class: 'vg-entrada__golpe' }, P.golpe({ id: 'vg-aviso-golpe' }))
        ]),
        el('footer', { class: 'rodape' }, el('p', { class: 'rodape-nota' }, ['Vagas sem Caos é uma ferramenta da Gestão sem Caos · ',
          el('a', { href: 'termos.html' }, 'Termos'), ' · ', el('a', { href: 'privacidade.html' }, 'Privacidade')]))
      ]);
      busca.addEventListener('input', U.aoParar(function () { filtros.busca = R.limparTexto(busca.value, 60); aplicar(); }, 400));
      busca.addEventListener('search', function () { filtros.busca = R.limparTexto(busca.value, 60); aplicar(); });
      desenharChips();
    }
    function rotuloFiltro(k, v) {
      if (k === 'areas') return R.rotulo(R.AREAS, v);
      if (k === 'modalidade') return P.modalidadeCurta(v);
      if (k === 'turno') return R.rotulo(R.TURNOS_VAGA, v);
      if (k === 'salarioMin') return 'a partir de ' + U.reais(v);
      if (k === 'zona') { var z = (cidade.zonas || []).filter(function (x) { return x.slug === v; })[0]; return z ? z.nome : v; }
      if (k === 'entorno') return 'Com ' + vizinhas().map(function (c) { return c.nome; }).join(' e ');
      if (k === 'semExperiencia') return 'Sem experiência';
      if (k === 'paraHoje') return 'Para hoje';
      return v;
    }
    function desenharChips() {
      var n = quantosFiltros(filtros);
      U.trocar(abrir, [U.icone('lista'), 'Filtrar', n ? el('span', { class: 'vg-chip__n', 'aria-label': n + (n === 1 ? ' filtro ativo' : ' filtros ativos') }, String(n)) : null]);
      var itens = [];
      ['areas', 'modalidade', 'turno'].forEach(function (k) { (filtros[k] || []).forEach(function (v) { itens.push([k, v]); }); });
      ['salarioMin', 'zona', 'entorno', 'semExperiencia', 'paraHoje'].forEach(function (k) { if (filtros[k]) itens.push([k, filtros[k]]); });
      U.trocar(chips, itens.map(function (x) {
        var r = rotuloFiltro(x[0], x[1]);
        return el('button', { type: 'button', class: 'vg-chip', 'aria-pressed': 'true', data: { filtro: x[0], valor: String(x[1]) }, 'aria-label': 'Tirar filtro ' + r,
          onclick: function () { tirarFiltro(x[0], x[1]); } }, r + ' ✕');
      }));
    }
    function tirarFiltro(k, v) {
      if (LISTAS[k]) filtros[k] = (filtros[k] || []).filter(function (x) { return x !== v; });
      else delete filtros[k];
      if (k === 'areas' && !filtros.areas.length && logado) filtros.areasTodas = true;
      aplicar();
    }
    function guardarFiltros() {
      U.armazenamento.gravar('vg.filtros.' + slug, filtros);
      var q = filtrosParaUrl(filtros);
      try { root.history.replaceState(null, '', 'cidade.html?cidade=' + encodeURIComponent(slug) + (q ? '&' + q : '')); } catch (e) { /* segue */ }
    }
    function aplicar() { guardarFiltros(); desenharChips(); carregar(); }
    function limparFiltros() { filtros = logado ? { areasTodas: true } : {}; busca.value = ''; aplicar(); }

    function desenharVagas(anuncios, total) {
      U.trocar(listaEl, anuncios.map(function (a) { return P.cartaoVaga(a, { cidadeAtual: slug }); }));
      mais.hidden = !proximo;
      var nFiltros = quantosFiltros(filtros) + (filtros.busca ? 1 : 0);
      var texto = total === 1 ? '1 vaga' : total + ' vagas';
      U.trocar(contagem, [el('span', {}, areasPadrao.length && !filtros.areas ? [el('strong', {}, texto), ' nas suas áreas'] : [el('strong', {}, texto), ' em ' + nomeCidade()]),
        nFiltros || areasPadrao.length ? el('button', { type: 'button', class: 'botao botao--link', id: 'vg-limpar-filtros', onclick: limparFiltros }, 'Limpar filtros') : null]);
      if (areasPadrao.length) {
        notaAreas.hidden = false;
        U.trocar(notaAreas, ['Você recebe aviso por e-mail quando entra vaga nova em ' + areasPadrao.map(function (a) { return R.rotulo(R.AREAS, a); }).join(' e ') + '. ',
          el('a', { href: 'eu.html#curriculo/2', id: 'vg-mudar-areas' }, 'Mudar minhas áreas')]);
      } else notaAreas.hidden = true;
      if (!anuncios.length) {
        U.trocar(listaEl, el('li', {}, el('div', { class: 'caixa vazio', id: 'vg-lista-vazia' }, [
          el('p', { class: 'vazio__texto' }, nFiltros || areasPadrao.length ? 'Nenhuma vaga com esses filtros. Tire um filtro ou veja todas.' : 'Nenhuma vaga no ar agora. Volte mais tarde: as empresas publicam durante a semana.'),
          nFiltros || areasPadrao.length ? el('div', { class: 'acoes acoes-coluna' }, el('button', { type: 'button', class: 'botao botao--principal botao--grande', id: 'vg-ver-todas', onclick: limparFiltros }, 'Ver todas')) : null])));
      }
    }
    function carregar() {
      var meu = ++pedido;
      proximo = '';
      U.esqueletos(listaEl, 3);
      mais.hidden = true;
      var f = filtroDaApi(slug, filtros);
      return Promise.all([A.anuncios(f), A.anuncios(filtroDaApi(slug, filtros, { somenteTotal: true })).catch(function () { return null; })]).then(function (r) {
        if (meu !== pedido) return;
        U.faixaOffline(false);
        vagas = r[0].anuncios || [];
        proximo = r[0].proximo || '';
        areasPadrao = r[0].areasPadrao ? (r[0].areasAplicadas || []) : [];
        desenharVagas(vagas, r[1] ? r[1].total : vagas.length);
        U.armazenamento.gravar('vg.lista.' + slug, { em: Date.now(), nome: nomeCidade(), anuncios: vagas, filtros: filtros });
      }, function (e) {
        if (meu !== pedido) return;
        if (e.listaEspera) { mostrarEspera((e.resposta || {}).interessados); return; }
        if (e.pausada) { mostrarPausada(); return; }
        if (e.naoEncontrada) { naoEncontrada(); return; }
        if (e.conexao) { mostrarOffline(); return; }
        U.tratarErro(e, { raiz: listaEl, aoTentar: carregar });
      });
    }
    function verMais() {
      var botao = root.document.getElementById('vg-mais');
      U.ocupado(botao, true, 'Carregando…');
      A.anuncios(filtroDaApi(slug, filtros, { depois: proximo })).then(function (r) {
        U.ocupado(botao, false);
        var novos = r.anuncios || [];
        vagas = vagas.concat(novos);
        proximo = r.proximo || '';
        novos.forEach(function (a) { listaEl.appendChild(P.cartaoVaga(a, { cidadeAtual: slug })); });
        mais.hidden = !proximo;
        var primeira = novos[0] && listaEl.querySelector('[data-codigo="' + novos[0].codigo + '"]');
        if (primeira) primeira.focus();
        U.anunciar(novos.length + ' vagas a mais na lista.');
      }, function (e) { U.ocupado(botao, false); U.tratarErro(e); });
    }
    // Sem internet: faixa + a última lista guardada neste aparelho, com a data.
    function mostrarOffline() {
      var g = U.armazenamento.ler('vg.lista.' + slug);
      U.faixaOffline(true, { texto: 'Mostrando as vagas que você viu por último. Suas respostas e rascunhos ficam guardados no celular.', aoTentar: carregar });
      if (!g || !g.anuncios) { U.erroCarregar(listaEl, { texto: U.t('avisos.sem_internet') || 'Sem internet.', aoTentar: carregar }); return; }
      U.trocar(listaEl, g.anuncios.map(function (a) { return P.cartaoVaga(a, { cidadeAtual: slug }); }));
      U.trocar(contagem, [el('span', { id: 'vg-lista-de' }, 'Lista de ' + U.dataHora(new Date(g.em).toISOString()).replace(', ', ' às ')),
        el('button', { type: 'button', class: 'botao botao--link', id: 'vg-tentar-de-novo', onclick: carregar }, 'Tentar de novo')]);
    }

    // ----------------------------------------------------------------- folha de filtros (carregada só quando a pessoa toca em "Filtrar")
    function abrirFiltros() {
      var ctx = { filtros: filtros, cidade: cidade, vizinhas: vizinhas(), logado: !!logado, slug: slug, botao: abrir, filtroDaApi: filtroDaApi, FILTROS: FILTROS,
        aplicar: function (novos) { filtros = novos; aplicar(); } };
      if (root.VAGAS_CIDADE_FILTROS) { root.VAGAS_CIDADE_FILTROS.abrir(ctx); return; }
      U.ocupado(abrir, true);
      var s = root.document.createElement('script');
      s.src = 'js/cidade-filtros.js';
      // "ocupado" desliga o botão e o foco sai dele: devolve o foco antes de abrir, para o Esc/Fechar voltarem ao "Filtrar"
      s.onload = function () { U.ocupado(abrir, false); desenharChips(); abrir.focus(); root.VAGAS_CIDADE_FILTROS.abrir(ctx); };
      s.onerror = function () { U.ocupado(abrir, false); desenharChips(); U.avisar(U.t('avisos.sem_internet') || 'Sem internet.', { tipo: 'erro' }); };
      root.document.head.appendChild(s);
    }

    // ----------------------------------------------------------------- cidade em lista de espera, pausada, não encontrada
    function mostrarEspera(interessados) {
      titulo('Lista de espera');
      var n = interessadosTexto(interessados != null ? interessados : cidade && cidade.interessados);
      var texto = U.t('avisos.cidade_lista_espera', { cidade: nomeCidade(), total: n });
      if (!n) texto = U.t('avisos.cidade_lista_espera_vazia', { cidade: nomeCidade() }) || texto.replace(/\s*[^.]*\bpessoas já estão na lista\.$/, '');
      var email = el('input', { id: 'vg-espera-email', class: 'entrada entrada--principal', type: 'email', inputmode: 'email', autocomplete: 'email', placeholder: 'voce@exemplo.com', 'aria-describedby': 'vg-espera-email-ajuda' });
      var whats = listaEsperaComWhatsapp(A) ? el('input', { id: 'vg-espera-whatsapp', class: 'entrada', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '(DDD) 99999-0000' }) : null;
      var perfil = 'pessoa';
      function opcao(id, valor, rotulo) {
        return el('button', { type: 'button', class: 'vg-chip', id: id, role: 'radio', 'aria-checked': valor === perfil ? 'true' : 'false', onclick: function (ev) {
          perfil = valor;
          Array.prototype.forEach.call(ev.currentTarget.parentNode.children, function (b) { b.setAttribute('aria-checked', b === ev.currentTarget ? 'true' : 'false'); });
        } }, rotulo);
      }
      var enviar = el('button', { type: 'submit', class: 'botao botao--laranja botao--grande', id: 'vg-espera-enviar' }, U.t('botoes.lista_espera') || 'Me avise quando abrir');
      var erro = el('p', { class: 'aviso aviso--erro', id: 'vg-espera-erro', role: 'alert', hidden: true });
      var form = el('form', { class: 'formulario', id: 'vg-form-espera', novalidate: true }, [
        el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-espera-email' }, 'Seu e-mail'), email,
          el('span', { class: 'campo__ajuda', id: 'vg-espera-email-ajuda' }, 'Só para avisar da abertura. Nada de propaganda.')]),
        whats ? el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-espera-whatsapp' }, ['WhatsApp ', el('span', { class: 'obrigatorio' }, '(opcional)')]), whats,
          el('span', { class: 'campo__ajuda' }, 'Em cidade pequena é por ele que a pessoa fica sabendo.')]) : null,
        el('fieldset', { class: 'campo campo--grupo' }, [el('legend', { class: 'campo__rotulo' }, 'Você é'),
          el('div', { class: 'vg-opcoes', role: 'radiogroup' }, [opcao('vg-espera-pessoa', 'pessoa', 'Quem procura vaga'), opcao('vg-espera-empresa', 'empresa', 'Empresa que contrata')])]),
        erro, el('div', { class: 'acoes' }, enviar)]);
      var caixa = el('section', { class: 'caixa caixa--vidro surgir', id: 'vg-espera', 'aria-labelledby': 'vg-espera-titulo' }, [
        el('p', { class: 'sobretitulo' }, nomeCidade()), el('h1', { id: 'vg-espera-titulo', class: 'titulo-pagina', tabindex: '-1' }, 'Ainda não chegamos aqui'),
        el('p', { class: 'subtitulo', id: 'vg-espera-texto' }, texto), form]);
      var outra = outraAtiva();
      U.trocar(app, [caixa, el('section', { class: 'caixa vg-espera__caixa', id: 'vg-enquanto' }, [el('h2', { class: 'caixa__titulo' }, 'Enquanto isso'),
        el('p', { class: 't-rotulo texto-medio' }, [outra ? [el('a', { href: 'cidade.html?cidade=' + encodeURIComponent(outra.slug), id: 'vg-espera-outra' }, 'Ver as vagas de ' + outra.nome), ' ou '] : null,
          el('a', { href: 'testes.html', id: 'vg-espera-testes' }, outra ? 'fazer um teste' : 'Fazer um teste'), ': o selo vale em qualquer cidade.'])])]);
      U.focarTitulo(app);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        erro.hidden = true;
        var e = R.normalizarEmail(email.value);
        if (!e) { U.erroCampo(email, 'Digite um e-mail válido, como nome@exemplo.com'); email.focus(); return; }
        U.limparErroCampo(email);
        if (whats && whats.value.trim() && !R.whatsappCelularValido(R.normalizarWhatsapp(whats.value))) {
          U.erroCampo(whats, U.t('validacao.whatsapp_invalido') || 'WhatsApp inválido.'); whats.focus(); return;
        }
        if (whats) U.limparErroCampo(whats);
        var dados = { cidade: slug, email: e, perfil: perfil };
        if (whats && whats.value.trim()) dados.whatsapp = R.normalizarWhatsapp(whats.value);
        U.ocupado(enviar, true, 'Enviando…');
        A.listaEspera(dados).then(function () {
          U.trocar(form, el('p', { class: 'aviso aviso--ok', id: 'vg-espera-ok', role: 'status' }, U.t('avisos.cidade_lista_espera_ok', { cidade: nomeCidade() })));
        }, function (er) {
          U.ocupado(enviar, false);
          if (er.ativa) { root.location.reload(); return; }
          erro.textContent = er.message; erro.hidden = false;
        });
      });
    }
    // A lista pública de cidades traz só ativas e em lista de espera: uma cidade pausada não aparece nela. O mural
    // responde "pausada" ou "não encontrada"; o nome vem da última lista guardada no aparelho (se houver).
    function semCidadeNaLista() {
      A.anuncios(filtroDaApi(slug, {}, { somenteTotal: true })).then(function (r) {
        cidade = { slug: slug, nome: (r.cidade && r.cidade.nome) || '', status: 'ativa', zonas: [] };
        topo(); U.lembrarCidade(slug); montarLista(); carregar();
      }, function (e) {
        if (e.pausada) {
          var guardada = U.armazenamento.ler('vg.lista.' + slug);
          var nome = guardada && typeof guardada.nome === 'string' ? guardada.nome.slice(0, 80) : '';
          if (nome) { cidade = { slug: slug, nome: nome, status: 'pausada', zonas: [] }; topo(); }
          mostrarPausada(e.message);
          return;
        }
        if (e.naoEncontrada || e.listaEspera) { naoEncontrada(); return; }
        U.tratarErro(e, { raiz: app, aoTentar: function () { root.location.reload(); } });
      });
    }
    function mostrarPausada(textoDoBanco) {
      titulo('Em pausa');
      U.faixa({ id: 'vg-faixa-cidade', texto: nomeCidade() ? U.t('avisos.cidade_pausada', { cidade: nomeCidade() })
        : (textoDoBanco || 'As vagas desta cidade estão pausadas no momento.') });
      var outra = outraAtiva();
      var escolher = !outra && cidades.some(function (c) { return c.slug !== slug; });
      U.vazio(app, { id: 'vg-vazio-cidade', h1: true, titulo: 'Sem vagas por enquanto', texto: (nomeCidade() ? '' : 'Seus dados e seus selos continuam valendo. ') +
        (outra ? 'Você pode ver as vagas de ' + outra.nome + ' ou fazer um teste.' : escolher ? 'Você pode escolher outra cidade ou fazer um teste enquanto isso.' : 'Você pode fazer um teste enquanto isso.'),
        botao: outra ? { rotulo: 'Ver vagas de ' + outra.nome, href: 'cidade.html?cidade=' + encodeURIComponent(outra.slug), id: 'vg-pausada-outra' }
          : escolher ? { rotulo: 'Escolher outra cidade', href: 'index.html?escolher=1', id: 'vg-pausada-outra' } : null,
        botao2: { rotulo: 'Fazer um teste', href: 'testes.html', id: 'vg-pausada-testes' } });
      U.focarTitulo(app);
    }
    function naoEncontrada() {
      titulo('Cidade não encontrada');
      if (U.cidadeLembrada() === slug) U.armazenamento.apagar('vg.cidade');   // não volta para cá na próxima visita
      U.vazio(app, { h1: true, titulo: 'Cidade não encontrada', texto: 'Este endereço não é de uma cidade do Vagas sem Caos. Escolha a sua cidade na lista.',
        botao: { rotulo: 'Escolher a cidade', href: 'index.html?escolher=1', id: 'vg-escolher-cidade' } });
      U.focarTitulo(app);
    }

    // ----------------------------------------------------------------- começo
    U.carregando(app);
    var eu = A.eu().then(function (r) { return r.conta && r.conta.tipo === 'pessoa' ? r : null; }, function () { return null; });
    Promise.all([A.cidades(), eu]).then(function (r) {
      cidades = r[0].cidades || [];
      logado = r[1];
      cidade = cidades.filter(function (c) { return c.slug === slug; })[0] || null;
      if (cidade && cidade.praca) {   // cidade do entorno: a lista é a da praça, com o entorno ligado
        var praca = cidade.praca;
        filtros.entorno = true;
        slug = praca;
        cidade = cidades.filter(function (c) { return c.slug === praca; })[0] || cidade;
      }
      U.definirFuso(cidade && cidade.fuso);
      topo();
      if (logado) U.fixar(U.navPessoa('vagas'));
      if (!cidade) { semCidadeNaLista(); return; }
      if (cidade.status === 'lista_espera') { mostrarEspera(cidade.interessados); return; }
      if (cidade.status === 'pausada') { mostrarPausada(); return; }
      U.lembrarCidade(slug);
      montarLista();
      carregar();
    }, function (e) {
      var guardada = U.armazenamento.ler('vg.lista.' + slug);
      if (e.conexao && guardada) {
        cidade = { nome: typeof guardada.nome === 'string' ? guardada.nome.slice(0, 80) : '', slug: slug, zonas: [] };
        topo();
        montarLista();
        mostrarOffline();
        return;
      }
      U.tratarErro(e, { raiz: app, aoTentar: function () { root.location.reload(); } });
    });
  }

  var VAGAS_CIDADE = { filtrosDaUrl: filtrosDaUrl, filtrosParaUrl: filtrosParaUrl, filtroDaApi: filtroDaApi, quantosFiltros: quantosFiltros,
    lerSalario: lerSalario, interessadosTexto: interessadosTexto, listaEsperaComWhatsapp: listaEsperaComWhatsapp, LIMITE: LIMITE, iniciar: iniciar };
  if (nodeJs) module.exports = VAGAS_CIDADE;
  else { root.VAGAS_CIDADE = VAGAS_CIDADE; iniciar(); }
})(typeof self !== 'undefined' ? self : this);
