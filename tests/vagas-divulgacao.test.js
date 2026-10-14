'use strict';
// Vagas sem Caos — páginas de divulgação (vagas/emprego.html, vagas/empresas.html, vagas/js/divulgacao.js,
// vagas/assets/vagas-divulgacao.css): lógica pura (cidade, situação, lista de espera, textos prontos), textos transcritos
// conferidos com a fonte (avisos.json, padroes.md, pecas.js), palavras proibidas, peso da primeira visita e prévia do WhatsApp.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const TELA = require('./helpers/vagas-tela.js');
const D = require('../vagas/js/divulgacao.js');
const R = require('../vagas/js/regras.js');

const RAIZ = path.join(__dirname, '..');
const VAGAS = path.join(RAIZ, 'vagas');
const ler = (rel) => fs.readFileSync(path.join(VAGAS, rel), 'utf8');
const AVISOS = JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo', 'vagas-textos', 'avisos.json'), 'utf8'));
const PADROES = fs.readFileSync(path.join(RAIZ, 'docs', 'painel-cientifico', 'vagas', 'padroes.md'), 'utf8');
const PAGINAS = { pessoa: 'emprego.html', empresa: 'empresas.html' };

// Texto visível de um trecho de HTML (sem tags, entidades básicas, espaços normalizados).
function visivel(html) {
  return String(html).replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
function corpo(html) { return html.slice(html.indexOf('<body')); }
// Elementos com um atributo: devolve [{valor, texto}] (o elemento termina no fechamento da mesma tag, sem aninhar igual).
function marcados(html, atributo) {
  const re = new RegExp('<(p|span|div|li)\\b[^>]*\\s' + atributo + '="([^"]+)"[^>]*>([\\s\\S]*?)</\\1>', 'g');
  return [...html.matchAll(re)].map((m) => ({ valor: m[2], texto: visivel(m[3]) }));
}
function buscar(obj, caminho) { return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function frasePadrao(rotulo) {
  const m = new RegExp('^- ' + rotulo + ': "(.+)"', 'm').exec(PADROES);
  assert.ok(m, 'frase modelo "' + rotulo + '" existe em padroes.md');
  return m[1];
}

// ------------------------------------------------------------------------------------------------- lógica pura
test('escolherCidade: a pedida, depois a lembrada, depois a 1ª cidade-polo; só ativa ou lista de espera; nunca nome fixo', () => {
  const cidades = [
    { slug: 'polo-a-xx', nome: 'Polo A', status: 'ativa', praca: null },
    { slug: 'vizinha-xx', nome: 'Vizinha', status: 'ativa', praca: 'polo-a-xx' },
    { slug: 'nova-xx', nome: 'Nova', status: 'lista_espera', praca: null },
    { slug: 'rascunho-xx', nome: 'Rascunho', status: 'rascunho', praca: null },
    { slug: 'pausada-xx', nome: 'Pausada', status: 'pausada', praca: null }
  ];
  assert.equal(D.escolherCidade(cidades, 'nova-xx', 'polo-a-xx').slug, 'nova-xx');
  assert.equal(D.escolherCidade(cidades, ' NOVA-XX ', '').slug, 'nova-xx', 'endereço sem caixa nem espaço');
  assert.equal(D.escolherCidade(cidades, 'nao-existe', 'vizinha-xx').slug, 'vizinha-xx', 'cai na lembrada');
  assert.equal(D.escolherCidade(cidades, '', '').slug, 'polo-a-xx', 'sem pedido: a primeira cidade-polo na ordem do banco');
  assert.equal(D.escolherCidade(cidades, 'rascunho-xx', 'pausada-xx').slug, 'polo-a-xx', 'rascunho e pausada não aparecem');
  assert.equal(D.escolherCidade([cidades[1]], '', '').slug, 'vizinha-xx', 'só uma vizinha: ela mesma');
  assert.equal(D.escolherCidade([], 'x', 'y'), null);
  assert.equal(D.escolherCidade(null), null);
  assert.deepEqual(D.outrasCidades(cidades, cidades[0]).map((c) => c.slug), ['nova-xx'], 'outras cidades: só polos publicados');
  assert.equal(D.situacao(cidades[0]), 'ativa');
  assert.equal(D.situacao(cidades[2]), 'espera');
  assert.equal(D.situacao(null), 'sem_cidade');
});

test('lista de espera: e-mail obrigatório, WhatsApp opcional (celular com DDD), perfil pessoa|empresa; mensagens de avisos.json', () => {
  assert.deepEqual(D.lerEspera({ cidade: 'Nova-XX', email: '  Ana@Exemplo.COM ', perfil: 'pessoa' }),
    { ok: true, dados: { cidade: 'nova-xx', email: 'ana@exemplo.com', perfil: 'pessoa' } }, 'sem WhatsApp: a chave nem vai');
  assert.deepEqual(D.lerEspera({ cidade: 'nova-xx', email: 'a@b.co', whatsapp: '(62) 98888-1111', perfil: 'empresa' }).dados,
    { cidade: 'nova-xx', email: 'a@b.co', perfil: 'empresa', whatsapp: '5562988881111' });
  assert.equal(D.lerEspera({ email: 'a@b.co', perfil: 'qualquer' }).dados.perfil, 'pessoa');
  const semEmail = D.lerEspera({ email: 'ana@exemplo', whatsapp: '62988881111' });
  assert.deepEqual([semEmail.ok, semEmail.campo, semEmail.erro], [false, 'email', AVISOS.validacao.email_invalido]);
  const fixo = D.lerEspera({ email: 'a@b.co', whatsapp: '(62) 3333-1111' });
  assert.deepEqual([fixo.ok, fixo.campo, fixo.erro], [false, 'whatsapp', AVISOS.validacao.whatsapp_invalido], 'telefone fixo não serve');
  assert.equal(D.lerEspera({ email: 'a@b.co', whatsapp: '   ' }).ok, true, 'WhatsApp em branco é aceito');
});

test('leitura do e-mail e do WhatsApp: igual à de vagas/js/regras.js (as páginas não carregam regras.js)', () => {
  const emails = ['', '  ', 'a@b.co', ' A@B.CO ', 'a@b', 'a b@c.d', 'x'.repeat(250) + '@b.co', 'ana.silva+vagas@exemplo.com.br', null, undefined, 42];
  for (const e of emails) assert.equal(D.normalizarEmail(e), R.normalizarEmail(e), 'e-mail ' + JSON.stringify(e));
  const numeros = ['', '62988881111', '(62) 98888-1111', '+55 62 98888-1111', '5562988881111', '6233331111', '556233331111', '988881111',
    '00062988881111', '55 0 62 98888 1111', '11 91234-5678', null];
  for (const n of numeros) {
    assert.equal(D.normalizarWhatsapp(n), R.normalizarWhatsapp(n), 'whatsapp ' + JSON.stringify(n));
    assert.equal(D.whatsappCelularValido(D.normalizarWhatsapp(n)), R.whatsappCelularValido(R.normalizarWhatsapp(n)), 'celular ' + JSON.stringify(n));
  }
});

test('textos da lista: total só a partir de 10 (o banco devolve em dezenas); cidade sempre do dado', () => {
  const c = { slug: 'nova-xx', nome: 'Cidade Nova', status: 'lista_espera', interessados: 120 };
  assert.equal(D.textoEspera(c), 'O Vagas sem Caos ainda não chegou em Cidade Nova. Deixe seu e-mail e avisamos quando abrir. 120 pessoas já estão na lista.');
  assert.equal(D.textoEspera(Object.assign({}, c, { interessados: 0 })), 'O Vagas sem Caos ainda não chegou em Cidade Nova. Entre na lista e avisamos quando chegar.');
  assert.equal(D.textoEspera(Object.assign({}, c, { interessados: null })), D.preencher(D.TEXTOS.cidade_lista_espera_vazia, { cidade: 'Cidade Nova' }));
  assert.equal(D.preencher(D.TEXTOS.cidade_lista_espera_ok, { cidade: 'Cidade Nova' }), 'Pronto! Avisamos por e-mail quando Cidade Nova abrir.');
});

test('"Mandar para um amigo" e WhatsApp da Gestão sem Caos: texto pronto com o link curto e o aviso anti-golpe; número pendente desliga o botão', () => {
  const c = { slug: 'nova-xx', nome: 'Cidade Nova' };
  assert.equal(D.linkPagina('pessoa', c, false), 'https://vagas.gestaosemcaos.com.br/emprego');
  assert.equal(D.linkPagina('pessoa', c, true), 'https://vagas.gestaosemcaos.com.br/emprego?cidade=nova-xx');
  assert.equal(D.linkPagina('empresa', null, true), 'https://vagas.gestaosemcaos.com.br/empresas');
  for (const sit of ['ativa', 'espera', 'sem_cidade']) {
    const t = D.textoAmigo(sit, sit === 'sem_cidade' ? null : c, 'https://vagas.gestaosemcaos.com.br/emprego');
    assert.match(t, /Nunca pague para se candidatar\./);
    assert.match(t, /https:\/\/vagas\.gestaosemcaos\.com\.br\/emprego$/);
    assert.match(t, /grátis|de graça/i);
    assert.deepEqual(TELA.conferirTexto(t, 'amigo ' + sit), []);
    if (sit !== 'sem_cidade') assert.match(t, /de Cidade Nova/);
  }
  assert.match(D.textoAmigo('espera', c, 'L'), /lista de espera/);
  assert.match(D.textoAmigo('ativa', c, 'L'), /"Quero"/);
  assert.equal(D.textoContato(c), 'Oi! Tenho uma empresa em Cidade Nova e quero saber como anunciar vagas no Vagas sem Caos.');
  assert.equal(D.textoContato(null), 'Oi! Tenho uma empresa e quero saber como anunciar vagas no Vagas sem Caos.');
  assert.equal(D.WHATSAPP_GESTAO, '[NÚMERO DA GESTÃO SEM CAOS]', 'pendência do dono: o número ainda é o marcador');
  assert.equal(D.numeroGestao(D.WHATSAPP_GESTAO), '', 'marcador não vira link');
  assert.equal(D.numeroGestao('55 (62) 3333-4444'), '556233334444', 'fixo com DDD serve (é a empresa que atende)');
  assert.equal(D.numeroGestao('5562988881111'), '5562988881111');
  assert.equal(D.numeroGestao('62988881111'), '', 'sem o 55: a constante precisa vir completa');
});

test('destinos: sempre relativos; pessoa cria a conta em entrar.html#criar; empresa em entrar.html?tipo=empresa', () => {
  const c = { slug: 'nova-xx', nome: 'Cidade Nova' };
  assert.deepEqual(D.destinos('pessoa', c), { criar: 'entrar.html#criar', entrar: 'entrar.html#entrar', vagas: 'cidade.html?cidade=nova-xx' });
  assert.deepEqual(D.destinos('empresa', c), { criar: 'entrar.html?tipo=empresa', entrar: 'entrar.html?tipo=empresa#entrar', vagas: 'cidade.html?cidade=nova-xx' });
  assert.equal(D.destinos('pessoa', null).vagas, 'index.html');
  for (const d of [D.destinos('pessoa', c), D.destinos('empresa', c)]) for (const v of Object.values(d)) assert.ok(!v.startsWith('/'), v);
});

// ------------------------------------------------------------------------------------------------- textos conferidos com a fonte
test('textos transcritos em divulgacao.js: iguais a conteudo/vagas-textos/avisos.json (palavra por palavra)', () => {
  const fonte = {
    cidade_lista_espera: AVISOS.avisos.cidade_lista_espera, cidade_lista_espera_vazia: AVISOS.avisos.cidade_lista_espera_vazia,
    cidade_lista_espera_ok: AVISOS.avisos.cidade_lista_espera_ok, email_invalido: AVISOS.validacao.email_invalido,
    whatsapp_invalido: AVISOS.validacao.whatsapp_invalido, lista_espera: AVISOS.botoes.lista_espera, gratis_para_sempre: AVISOS.avisos.gratis_para_sempre
  };
  assert.deepEqual(D.TEXTOS, fonte);
});

test('páginas: trechos marcados com data-texto são avisos.json; com data-padrao são as frases modelo de padroes.md; anti-golpe igual ao de pecas.js', () => {
  const ROTULOS = { pessoa: 'Para quem procura', empresa: 'Para a empresa', limites: 'Sobre limites', combinou: 'Sobre o Combinou',
    refazer: 'Sobre refazer', entrevista: 'Sobre a entrevista' };
  let total = 0;
  for (const pagina of Object.values(PAGINAS)) {
    const html = ler(pagina);
    for (const m of marcados(html, 'data-texto')) {
      const esperado = buscar(AVISOS, m.valor);
      assert.equal(typeof esperado, 'string', pagina + ': chave ' + m.valor + ' existe');
      assert.equal(m.texto, esperado, pagina + ': ' + m.valor);
      total++;
    }
    for (const m of marcados(html, 'data-padrao')) {
      assert.ok(ROTULOS[m.valor], 'rótulo conhecido ' + m.valor);
      assert.equal(m.texto, frasePadrao(ROTULOS[m.valor]), pagina + ': frase modelo ' + m.valor);
      total++;
    }
  }
  assert.ok(total >= 10, 'textos conferidos: ' + total);
  const pecas = fs.readFileSync(path.join(VAGAS, 'js', 'pecas.js'), 'utf8');
  const forte = /GOLPE_FORTE = '([^']+)'/.exec(pecas)[1];
  const resto = /GOLPE_TEXTO = '([^']+)'/.exec(pecas)[1];
  const golpe = /<div class="vg-golpe[^"]*" id="vg-aviso-golpe" role="note">([\s\S]*?)<\/div>/.exec(ler(PAGINAS.pessoa));
  assert.ok(golpe, 'emprego.html tem o aviso anti-golpe fixo');
  assert.equal(visivel(golpe[1]), forte + ' ' + resto);
});

// Palavras e promessas que não entram em texto de divulgação (BRIEF §2, padroes.md §4 e §6, pedido do dono).
const PROMESSAS = [/comprova/i, /\bprev[eê]\b|\bprever\b/i, /garantid/i, /emprego garantido/i, /vai ser contratad/i, /consiga (um )?emprego/i,
  /\bmatch\b/i, /os melhores/i, /\branking\b/i, /curr[ií]culo verificado/i, /perfil ideal/i, /cient[ií]fic/i, /\bcertificad/i];
const RH = [/processo seletivo/i, /compet[eê]ncia/i, /\bperfil\b/i, /\bcandidato\b/i, /recrutamento/i];

test('páginas: CSP, scripts em ordem, nada inline, sem palavra proibida, sem promessa e sem nome de cidade (nem a do piloto)', () => {
  assert.deepEqual(TELA.conferirPagina(PAGINAS.pessoa), []);
  // "DISC" aparece só em empresas.html, e só na frase fixa avisos.disc_fora (depois de contratar, nunca para escolher).
  assert.deepEqual(TELA.conferirPagina(PAGINAS.empresa, { permitirDisc: true }), []);
  assert.deepEqual(TELA.conferirScript('js/divulgacao.js'), []);
  const disc = ler(PAGINAS.empresa).replace(/<span data-texto="avisos\.disc_fora">[^<]*<\/span>/, '');
  assert.doesNotMatch(disc, /\bDISC\b/, 'DISC só dentro de avisos.disc_fora');
  assert.match(ler(PAGINAS.empresa), /<span data-texto="avisos\.disc_fora">O Mapa DISC não entra na seleção\./);
  for (const pagina of Object.values(PAGINAS)) {
    const t = visivel(corpo(ler(pagina))) + ' ' + visivel((ler(pagina).match(/content="[^"]*"/g) || []).join(' '));
    for (const re of PROMESSAS) assert.doesNotMatch(t, re, pagina + ': ' + re);
    // "garante" só na pergunta "O teste garante…?" e na negação da frase modelo ("não garante desempenho").
    const garante = t.replace(/O teste garante que a pessoa é boa\?/g, '').replace(/não garante desempenho/g, '');
    assert.doesNotMatch(garante, /garant/i, pagina + ': "garante" fora da negação');
    assert.doesNotMatch(t, /Urua[cç]u|Goi[aá]s|\bGO\b/, pagina + ': cidade do piloto só vem do dado');
    assert.doesNotMatch(ler(pagina), /icone\.svg|estrela/i, pagina + ': nunca a estrela');
  }
  const js = TELA.semComentarios(ler('js/divulgacao.js'));
  for (const re of PROMESSAS) assert.doesNotMatch(js, re, 'divulgacao.js: ' + re);
  assert.doesNotMatch(js, /Urua[cç]u|uruacu/i, 'divulgacao.js sem cidade fixa');
  // Quem procura trabalho: nada de termo de RH (pedido do dono).
  const pessoa = visivel(corpo(ler(PAGINAS.pessoa)));
  for (const re of RH) assert.doesNotMatch(pessoa, re, 'emprego.html: termo de RH ' + re);
});

test('páginas: um h1, um botão laranja no HTML (o resto vem da situação da cidade), ids que os testes de navegador usam', () => {
  for (const [tipo, pagina] of Object.entries(PAGINAS)) {
    const html = ler(pagina);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, pagina + ': um h1');
    assert.ok((html.match(/botao--laranja/g) || []).length <= 1, pagina + ': no máximo um botão laranja fixo no HTML');
    assert.match(html, new RegExp('<body class="vg-div vg-div--' + tipo + '" data-divulgacao="' + tipo + '">'));
    for (const id of ['vg-chamada', 'vg-chamada-corpo', 'vg-div-titulo', 'conteudo']) assert.match(html, new RegExp('id="' + id + '"'), pagina + ': #' + id);
    assert.match(html, /<section class="caixa caixa--vidro vg-div-chamada" id="vg-chamada"[^>]*data-divulgacao-acao>/, pagina + ': a chamada é o único vidro');
    assert.equal((html.match(/caixa--vidro/g) || []).length, 1, pagina + ': um vidro por página');
    assert.match(html, /<p id="aviso" class="visualmente-oculto" role="status" aria-live="polite"><\/p>/);
    // Leves de propósito: sem regras.js, textos.js nem pecas.js (o teste de textos acima garante a mesma fonte).
    const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(scripts, ['js/endereco.js', 'js/config.js', 'js/api.js', 'js/ui.js', 'js/divulgacao.js'], pagina);
  }
  assert.match(ler(PAGINAS.pessoa), /id="vg-amigo" data-amigo/);
  assert.match(ler(PAGINAS.empresa), /id="vg-topo-acao" href="#vg-chamada" data-divulgacao-acao/);
});

test('primeira visita: até 100 KB transferidos (gzip), medida igual à da lista pública', async () => {
  const { pesoDaLista } = await import('../scripts/montar-vagas.mjs');
  for (const pagina of Object.values(PAGINAS)) {
    const p = pesoDaLista(RAIZ, pagina);
    assert.ok(p && !p.itens.some((x) => x.falta), pagina + ': todos os arquivos existem');
    assert.ok(p.total <= 100 * 1024, pagina + ': ' + (p.total / 1024).toFixed(1) + ' KB');
  }
});

test('prévia no WhatsApp: og:title/description/url/image com o endereço final e imagem PNG 1200x630 com o logo', () => {
  const ROTA = { pessoa: '/emprego', empresa: '/empresas' };
  for (const [tipo, pagina] of Object.entries(PAGINAS)) {
    const html = ler(pagina);
    const meta = (p) => { const m = new RegExp('<meta property="' + p + '" content="([^"]+)">').exec(html); return m ? m[1] : ''; };
    assert.ok(meta('og:title').length > 10 && meta('og:description').length > 40, pagina);
    assert.equal(meta('og:url'), 'https://vagas.gestaosemcaos.com.br' + ROTA[tipo]);
    assert.match(html, new RegExp('<link rel="canonical" href="https://vagas.gestaosemcaos.com.br' + ROTA[tipo] + '">'));
    const img = meta('og:image');
    assert.match(img, /^https:\/\/vagas\.gestaosemcaos\.com\.br\/assets\/divulgacao-(emprego|empresas)\.png$/);
    const arquivo = path.join(VAGAS, img.replace('https://vagas.gestaosemcaos.com.br/', ''));
    const b = fs.readFileSync(arquivo);
    assert.equal(b.slice(1, 4).toString(), 'PNG', 'PNG (o WhatsApp não mostra SVG)');
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [1200, 630]);
    assert.ok(b.length < 300 * 1024, 'imagem leve para a prévia: ' + b.length);
    assert.equal(meta('og:image:width'), '1200');
    assert.equal(meta('og:locale'), 'pt_BR');
  }
});

test('vagas-divulgacao.css: só cores, tamanhos e pesos da identidade; respeita movimento reduzido', () => {
  const css = TELA.semComentarios(ler('assets/vagas-divulgacao.css'));
  const liberadas = new Set(['#f34405', '#f2762e', '#ff9f40', '#324e73', '#13283f', '#141414', '#f2f2f2', '#c43803', '#eaeef4', '#e2e6ec', '#6b7586',
    '#46546a', '#e9ecef', '#8a97ab', '#5d7699', '#c5ccd6', '#fff', '#ffffff', '#dc2626', '#fef2f2', '#fca5a5', '#047857', '#065f46', '#ecfdf5', '#b91c1c']);
  for (const m of css.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) assert.ok(liberadas.has(m[0].toLowerCase()), 'cor fora da paleta: ' + m[0]);
  // rgba só das cores da marca: branco, laranja (243,68,5) e azul-escuro (19,40,63).
  for (const m of css.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+)/g)) assert.ok(['255,255,255', '243,68,5', '19,40,63'].includes([m[1], m[2], m[3]].join()), 'rgba ' + m[0]);
  for (const m of css.matchAll(/font-size\s*:\s*([0-9.]+)px/g)) assert.ok([11, 12, 13, 15, 16, 18, 24, 28, 32, 44].includes(Number(m[1])), 'fonte ' + m[1]);
  for (const m of css.matchAll(/font-weight\s*:\s*(\w+)/g)) assert.ok(['400', '600', '700', 'inherit'].includes(m[1]), 'peso ' + m[1]);
  assert.doesNotMatch(css, /repeating-(linear|radial)-gradient/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('_redirects: as variações de /emprego e /empresas vão para o endereço curto, sem laço e sem mexer na regra da raiz', () => {
  const regras = ler('_redirects').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  assert.equal(regras[0][0], '/', 'a regra da raiz continua a primeira (é da casca)');
  const minhas = regras.filter((r) => /^\/(emprego|empresas)/.test(r[0]));
  assert.deepEqual(minhas, [['/emprego/', '/emprego', '301'], ['/empregos', '/emprego', '301'], ['/empregos/', '/emprego', '301'], ['/empresas/', '/empresas', '301']]);
  const origens = new Set(regras.map((r) => r[0]));
  for (const r of minhas) assert.ok(!origens.has(r[1]), 'destino ' + r[1] + ' não é origem de outra regra (sem laço)');
});
