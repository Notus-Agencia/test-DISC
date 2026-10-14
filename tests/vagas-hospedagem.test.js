// Hospedagem do Vagas sem Caos (Cloudflare Pages): a Pages Function da página da vaga (/v/CODIGO) monta o HTML
// no servidor sem rede (funções puras) e os arquivos _headers / _redirects / _routes.json seguem o formato do Pages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..', 'vagas');
const ARQ_FUNCAO = path.join(RAIZ, 'functions', 'v', '[codigo].js');
const ORIGEM = 'https://vagas.gestaosemcaos.com.br';

const ANUNCIO = {
  ok: true,
  anuncio: {
    codigo: 'K7M2QX', titulo: 'Atendente de loja <turno da tarde>', modalidade: 'clt',
    empresa: { nome: 'Mercado & Cia', verificada: true, confidencial: false },
    cidade: { nome: 'Boa Vista', slug: 'boa-vista-rr' }, zona: { nome: 'Zona Oeste' },
    salarioMin: 160000, salarioMax: 185050, horario: 'Segunda a sábado, 13h às 21h',
    descricao: 'Atender clientes e repor gôndolas.\nExperiência não é obrigatória.',
    requisitos: 'Ensino médio', publicadoEm: '2026-10-13T12:00:00.000Z', validoAte: '2026-11-12', status: 'publicado'
  }
};

let mod;
test.before(async () => { mod = await import(pathToFileURL(ARQ_FUNCAO).href); });

test('nomes fixos: RPC, URL do Supabase e exportações do handler', () => {
  assert.equal(mod.RPC_ANUNCIO, 'vagas_anuncio_publico');
  assert.equal(mod.SUPABASE_URL, 'https://tevpqngqzxcswmticjnr.supabase.co');
  assert.equal(typeof mod.onRequestGet, 'function');
  assert.equal(mod.onRequestHead, mod.onRequestGet);
});

test('codigoValido: maiúsculas, só letras e números, tamanho 4 a 12', () => {
  assert.equal(mod.codigoValido(' k7m2qx '), 'K7M2QX');
  assert.equal(mod.codigoValido('K7M2QX'), 'K7M2QX');
  assert.equal(mod.codigoValido('abc'), '');
  assert.equal(mod.codigoValido('K7M2QX/../x'), '');
  assert.equal(mod.codigoValido(''), '');
  assert.equal(mod.codigoValido(undefined), '');
});

test('normalizarAnuncio: aceita {ok, anuncio} e variações de nome; dinheiro em centavos', () => {
  const a = mod.normalizarAnuncio(ANUNCIO);
  assert.equal(a.codigo, 'K7M2QX');
  assert.equal(a.titulo, 'Atendente de loja <turno da tarde>');
  assert.equal(a.modalidadeNome, 'CLT');
  assert.equal(a.empresaNome, 'Mercado & Cia');
  assert.equal(a.verificada, true);
  assert.equal(a.cidadeSlug, 'boa-vista-rr');
  assert.equal(a.zonaNome, 'Zona Oeste');
  assert.equal(mod.textoValor(a), 'R$ 1.600 a R$ 1.850,50');
  const plano = mod.normalizarAnuncio({ titulo: 'Diarista para evento', modalidade: 'diaria', diaria_valor: 15000, cidade_nome: 'Boa Vista', empresa_nome: 'Buffet X' });
  assert.equal(plano.modalidadeNome, 'Diária');
  assert.equal(mod.textoValor(plano), 'R$ 150 por dia');
  assert.equal(plano.empresaNome, 'Buffet X');
  assert.equal(mod.normalizarAnuncio({ ok: true, anuncio: { modalidade: 'clt' } }), null, 'sem título não há página');
  assert.equal(mod.normalizarAnuncio(null), null);
});

// Exemplo exato de docs/VAGAS-SPEC.md §8.1 (vagas_anuncios_publicos) + os campos que o vagas_anuncio_publico acrescenta.
const ANUNCIO_SPEC = {
  ok: true,
  anuncio: {
    id: '…', codigo: 'K7M2QX', titulo: 'Operador(a) de caixa', funcao: 'Operador(a) de caixa', modalidade: 'clt',
    area: { slug: 'caixa', nome: 'Caixa e operação de loja' }, turno: 'manha', fimDeSemana: false, experiencia: 'nao_precisa',
    comissao: false, selo: 'caixa', valor: { minCentavos: 162100, maxCentavos: 180000, unidade: 'mes' },
    cidade: { slug: 'boa-vista-rr', nome: 'Boa Vista' }, zona: { slug: 'centro-leste', nome: 'Centro e Zona Leste' },
    empresa: { nome: 'Mercadinho Sol do Norte', iniciais: 'MS', confidencial: false, conferida: true, setor: 'Supermercado', descricao: 'Mercadinho de bairro.' },
    diaria: null, paraHoje: false, quantidade: 2, publicadoEm: '2026-10-12T14:00:00.000000Z', expiraEm: '2026-11-11T14:00:00.000000Z',
    descricao: 'Atender no caixa e repor gôndolas.',
    requisitos: ['cnh_b', 'disponibilidade', 'outro'], requisitoOutro: 'Morar perto do Centro',
    requisitosLista: ['CNH categoria B', 'Disponibilidade de horário', 'Morar perto do Centro'],
    beneficios: ['vt', 'refeicao'], escolaridade: 'medio', inicio: 'imediato', inicioData: null, horasDia: null
  }
};

test('formato real da SPEC §8.1: salário de valor{minCentavos,maxCentavos}, verificada de empresa.conferida, requisitos em frases', () => {
  const a = mod.normalizarAnuncio(ANUNCIO_SPEC);
  assert.equal(a.salarioMin, 162100);
  assert.equal(a.salarioMax, 180000);
  assert.equal(mod.textoValor(a), 'R$ 1.621 a R$ 1.800');
  assert.equal(a.verificada, true);
  assert.equal(mod.textoEmpresa(a), 'Mercadinho Sol do Norte · verificada');
  assert.equal(a.requisitos, 'CNH categoria B · Disponibilidade de horário · Morar perto do Centro · Ensino médio');
  assert.equal(a.beneficios, 'Vale-transporte · Refeição');
  const html = mod.montarPaginaVaga(ANUNCIO_SPEC, ORIGEM);
  assert.ok(html.includes('<meta property="og:description" content="Mercadinho Sol do Norte · verificada · Boa Vista · Centro e Zona Leste · CLT · R$ 1.621 a R$ 1.800">'));
  assert.ok(html.includes('<span class="valor">R$ 1.621 a R$ 1.800</span>'), 'salário na página');
  assert.ok(html.includes('CNH categoria B · Disponibilidade de horário · Morar perto do Centro'), 'requisitos legíveis');
  assert.ok(!/cnh_b|disponibilidade<|>outro</.test(html), 'nunca imprime a chave');
  assert.ok(html.includes('11/11/2026'), 'expiraEm vira "Vaga aberta até"');
  assert.ok(html.includes('<dt>Vagas</dt><dd>2</dd>'));
});

test('formato real da SPEC: requisitos só como lista de chaves (sem requisitosLista) viram frases; unidade hora/serviço', () => {
  const a = mod.normalizarAnuncio({ ok: true, anuncio: Object.assign({}, ANUNCIO_SPEC.anuncio, { requisitosLista: undefined, valor: { minCentavos: 1200, maxCentavos: null, unidade: 'hora' }, escolaridade: 'nao_exigida' }) });
  assert.equal(a.requisitos, 'CNH categoria B · Disponibilidade de horário · Morar perto do Centro');
  assert.equal(mod.textoValor(a), 'R$ 12 por hora ou mais');
  const b = mod.normalizarAnuncio({ titulo: 'Pintor', modalidade: 'freelancer', valor: { minCentavos: 50000, maxCentavos: 80000, unidade: 'servico' }, requisitos: ['chave_inventada'] });
  assert.equal(mod.textoValor(b), 'R$ 500 a R$ 800 por serviço');
  assert.equal(b.requisitos, '');
});

test('formato real da SPEC: diária usa valor.minCentavos (unidade dia) e diaria{data,inicio,fim}', () => {
  const r = { ok: true, anuncio: Object.assign({}, ANUNCIO_SPEC.anuncio, { titulo: 'Ajudante de evento', modalidade: 'diaria', valor: { minCentavos: 15000, maxCentavos: null, unidade: 'dia' }, diaria: { data: '2026-10-14', inicio: '07:00', fim: '16:00' }, paraHoje: true, requisitos: [], requisitosLista: [] }) };
  const a = mod.normalizarAnuncio(r);
  assert.equal(a.diariaValor, 15000);
  assert.equal(mod.textoValor(a), 'R$ 150 por dia');
  assert.equal(a.diariaHorario, '07:00–16:00');
  const html = mod.montarPaginaVaga(r, ORIGEM);
  assert.ok(html.includes('<dt>Quando</dt><dd>14/10/2026, 07:00–16:00</dd>'));
  assert.ok(html.includes('<dt>Diária</dt>'));
  assert.ok(html.includes('· Diária · R$ 150 por dia">'));
});

test('empresa confidencial no formato real: nome "Empresa confidencial" + conferida', () => {
  const a = mod.normalizarAnuncio({ ok: true, anuncio: Object.assign({}, ANUNCIO_SPEC.anuncio, { empresa: { nome: 'Empresa confidencial', iniciais: '', confidencial: true, conferida: true } }) });
  assert.equal(mod.textoEmpresa(a), 'Empresa confidencial · verificada');
});

test('empresa confidencial: nunca mostra o nome, mesmo que venha no JSON', () => {
  const a = mod.normalizarAnuncio({ titulo: 'Caixa', empresa: { nome: 'Não mostrar', confidencial: true, verificada: true } });
  assert.equal(a.empresaNome, '');
  assert.equal(mod.textoEmpresa(a), 'Empresa confidencial · verificada');
  const html = mod.montarPaginaVaga({ titulo: 'Caixa', empresa: { nome: 'Não mostrar', confidencial: true, verificada: true } }, ORIGEM);
  assert.ok(!html.includes('Não mostrar'));
  assert.ok(html.includes('Empresa confidencial · verificada'));
  const semSelo = mod.normalizarAnuncio({ titulo: 'Caixa', confidencial: true });
  assert.equal(mod.textoEmpresa(semSelo), 'Empresa confidencial');
});

test('montarPaginaVaga: Open Graph completo, sem JavaScript, texto escapado', () => {
  const html = mod.montarPaginaVaga(ANUNCIO, ORIGEM);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<html lang="pt-BR">'));
  assert.ok(!/<script/i.test(html), 'a página abre sem JavaScript');
  assert.ok(html.includes('<meta property="og:title" content="Atendente de loja &lt;turno da tarde&gt; · Vagas sem Caos">'));
  assert.ok(html.includes('<meta property="og:description" content="Mercado &amp; Cia · verificada · Boa Vista · Zona Oeste · CLT · R$ 1.600 a R$ 1.850,50">'));
  assert.ok(html.includes('<meta property="og:url" content="https://vagas.gestaosemcaos.com.br/v/K7M2QX">'));
  assert.ok(html.includes('<meta property="og:image" content="https://vagas.gestaosemcaos.com.br/comum/marca/vsc-logo-email.png">'));
  assert.ok(html.includes('<meta property="og:site_name" content="Vagas sem Caos">'));
  assert.ok(html.includes('<h1>Atendente de loja &lt;turno da tarde&gt;</h1>'));
  assert.ok(!html.includes('<turno da tarde>'), 'nada de HTML cru vindo do anúncio');
  assert.ok(html.includes('href="/vaga.html?vaga=K7M2QX"'), 'botão leva direto para a tela da vaga com o código');
  assert.ok(html.includes('Quero esta vaga'));
  assert.ok(html.includes('12/11/2026'), 'data de validade no formato brasileiro');
  assert.ok(html.includes('Gestão sem Caos') && !/notus/i.test(html), 'marca certa');
  const semUrls = html.replace(/https?:\/\/\S+/g, '');
  assert.ok(!/\b[\w.-]+@[\w.-]+\.\w+\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\(\d{2}\)\s?\d{4,5}-?\d{4}|telefone|whatsapp/i.test(semUrls), 'sem e-mail, CPF ou telefone de pessoa');
});

test('montarPaginaVaga: vaga encerrada ganha noindex e botão "Ver outras vagas"', () => {
  const html = mod.montarPaginaVaga({ ok: true, anuncio: Object.assign({}, ANUNCIO.anuncio, { status: 'encerrado' }) }, ORIGEM);
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(html.includes('Vaga encerrada'));
  assert.ok(html.includes('Ver outras vagas'));
  assert.ok(!html.includes('Quero esta vaga'));
});

test('montarPaginaErro: 404 e 503 simples, com noindex e sem script', () => {
  const h404 = mod.montarPaginaErro('nao_encontrada', ORIGEM);
  assert.ok(h404.includes('Vaga não encontrada') && h404.includes('noindex') && !/<script/i.test(h404));
  const h503 = mod.montarPaginaErro('indisponivel', ORIGEM);
  assert.ok(h503.includes('Não deu para carregar a vaga'));
});

test('responderComAnuncio: {ok:false} ou anúncio sem título viram 404', () => {
  assert.equal(mod.responderComAnuncio({ ok: false, erro: 'Vaga não encontrada.' }, ORIGEM).status, 404);
  assert.equal(mod.responderComAnuncio(null, ORIGEM).status, 404);
  const r = mod.responderComAnuncio(ANUNCIO, ORIGEM);
  assert.equal(r.status, 200);
  assert.ok(r.html.includes('og:title'));
});

test('cabecalhosHtml: segurança repetida na Function (o _headers não vale para ela) e cache só no 200', () => {
  const ok = mod.cabecalhosHtml(200, 120);
  assert.equal(ok['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(ok['Cache-Control'], 'public, max-age=120, s-maxage=600, stale-while-revalidate=600');
  assert.ok(ok['Content-Security-Policy'].includes("frame-ancestors 'none'"));
  assert.ok(ok['Content-Security-Policy'].includes("default-src 'none'"));
  assert.equal(ok['X-Content-Type-Options'], 'nosniff');
  assert.ok(ok['Strict-Transport-Security'].startsWith('max-age=31536000'));
  assert.equal(mod.cabecalhosHtml(404, 120)['Cache-Control'], 'no-store');
  assert.equal(mod.cabecalhosHtml(503, 120)['Cache-Control'], 'no-store');
});

test('lerChaveDoConfig: acha a chave anon no formato do js/config.js', () => {
  assert.equal(mod.lerChaveDoConfig("var CONFIG = {\n  SUPABASE_URL: 'https://x.supabase.co',\n  SUPABASE_ANON_KEY: 'sb_publishable_abc',\n};"), 'sb_publishable_abc');
  assert.equal(mod.lerChaveDoConfig('SUPABASE_ANON_KEY = "eyJ.x.y"'), 'eyJ.x.y');
  assert.equal(mod.lerChaveDoConfig(''), '');
});

test('reais: centavos -> texto em reais', () => {
  assert.equal(mod.reais(160000), 'R$ 1.600');
  assert.equal(mod.reais(185050), 'R$ 1.850,50');
  assert.equal(mod.reais(5), 'R$ 0,05');
  assert.equal(mod.reais('x'), '');
});

test('_headers: CSP sem script de fora (exceto Turnstile), Supabase liberado, cache longo em /comum e /assets', () => {
  const txt = fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8');
  const blocos = txt.split(/\n(?=\S)/).map((b) => b.trim()).filter(Boolean);
  const geral = blocos.find((b) => b.startsWith('/*\n'));
  assert.ok(geral, 'bloco /* presente');
  const csp = /Content-Security-Policy: (.+)/.exec(geral)[1];
  const dir = {};
  csp.split(';').map((x) => x.trim()).filter(Boolean).forEach((x) => { const p = x.split(/\s+/); dir[p[0]] = p.slice(1); });
  assert.deepEqual(dir['script-src'], ["'self'", 'https://challenges.cloudflare.com']);
  assert.ok(dir['connect-src'].includes('https://tevpqngqzxcswmticjnr.supabase.co'));
  assert.ok(!dir['connect-src'].includes('https://*.supabase.co'), 'só o projeto, não qualquer *.supabase.co');
  assert.ok(dir['img-src'].includes('https://tevpqngqzxcswmticjnr.supabase.co'), 'foto da pessoa (URL assinada do Storage, só depois do Combinou)');
  assert.ok(!dir['img-src'].includes('https://*.supabase.co'));
  assert.deepEqual(dir['frame-ancestors'], ["'none'"]);
  assert.deepEqual(dir['object-src'], ["'none'"]);
  assert.ok(!dir['script-src'].includes("'unsafe-inline'") && !dir['script-src'].includes("'unsafe-eval'"));
  for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'Referrer-Policy', 'Permissions-Policy']) assert.ok(geral.includes(h), h);
  for (const caminho of ['/comum/*', '/assets/*']) {
    const b = blocos.find((x) => x.startsWith(caminho + '\n'));
    assert.ok(b, caminho);
    assert.ok(b.includes('! Cache-Control'), caminho + ' tira o Cache-Control curto do /* antes de pôr o longo');
    assert.ok(/max-age=604800/.test(b), caminho + ' cache longo');
  }
  assert.ok(/Cache-Control: public, max-age=0, must-revalidate/.test(geral), 'HTML sem cache longo');
  for (const linha of txt.split('\n')) assert.ok(linha.length <= 2000, 'linha do _headers acima do limite de 2.000 caracteres');
  assert.ok(blocos.length <= 100);
});

test('_redirects: a raiz fica com o index.html (escolha da cidade); /<cidade>/ vai para cidade.html; /v/ fica com a Function', () => {
  const txt = fs.readFileSync(path.join(RAIZ, '_redirects'), 'utf8');
  const regras = txt.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  assert.ok(!regras.some((r) => r[0] === '/'), 'sem cidade fixa na raiz');
  // A regra dinâmica da cidade fica por último; antes dela, as estáticas das páginas de divulgação (/emprego/, /empresas/) e
  // do selo (/selo/), e o endereço curto da conferência do selo (/selo/<código>).
  assert.deepEqual(regras[regras.length - 1], ['/:cidade/', '/cidade.html?cidade=:cidade', '302']);
  assert.deepEqual(regras.slice(0, -1), [['/emprego/', '/emprego', '301'], ['/empresas/', '/empresas', '301'],
    ['/selo/', '/selo', '301'], ['/selo/:codigo', '/selo.html?codigo=:codigo', '302']]);
  assert.ok(!regras.some((r) => r[0].startsWith('/v/')), 'uma regra /v/ ignoraria a Function (o Pages não aplica _redirects a rota de Function)');
  for (const r of regras) {
    assert.ok(r.length === 2 || r.length === 3, 'origem destino [código]');
    if (r[2]) assert.ok(['301', '302', '303', '307', '308', '200'].includes(r[2]), 'código aceito pelo Pages');
    assert.ok(r.join(' ').length <= 1000);
  }
  assert.ok(regras.length <= 2100);
});

test('_routes.json: só /v/* passa pela Function (o resto é estático e recebe o _headers)', () => {
  const rotas = JSON.parse(fs.readFileSync(path.join(RAIZ, '_routes.json'), 'utf8'));
  assert.equal(rotas.version, 1);
  assert.deepEqual(rotas.include, ['/v/*']);
  assert.deepEqual(rotas.exclude, []);
  assert.ok(!fs.existsSync(path.join(RAIZ, 'functions', '_middleware.js')), 'um _middleware.js na raiz faria TODA requisição passar pela Function');
});

test('functions/package.json marca ESM (só para o Node dos testes)', () => {
  const pj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'functions', 'package.json'), 'utf8'));
  assert.equal(pj.type, 'module');
  assert.ok(!pj.dependencies && !pj.scripts, 'sem dependências: o Pages não instala nada aqui');
});

test('onRequestGet: código inválido responde 404 sem chamar a rede', async () => {
  const chamouRede = [];
  const context = {
    request: new Request('https://vagas.gestaosemcaos.com.br/v/x'),
    params: { codigo: 'x' },
    env: { ASSETS: { fetch: async () => { chamouRede.push(1); return new Response(''); } } },
    waitUntil: () => {}
  };
  const resp = await mod.onRequestGet(context);
  assert.equal(resp.status, 404);
  assert.equal(chamouRede.length, 0);
  assert.equal(resp.headers.get('cache-control'), 'no-store');
  assert.ok((await resp.text()).includes('Vaga não encontrada'));
});
