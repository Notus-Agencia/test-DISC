'use strict';
// Vagas sem Caos v2 · TELAS DA PESSOA: o que dá para conferir sem navegador (o fluxo na tela fica em tests/e2e/vagas-pessoa-v2.spec.js).
// HTML sem script nem estilo inline, CSP canônica, ordem dos scripts, nada de fetch direto, nada de dado fictício fora de previa/, palavras
// proibidas nos textos, frase anti-golpe exata, links internos que existem, testes/selo/referências escondidos e redirecionadores.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CONTRATO = require('../vagas/js/v2/contrato.js');
const REDIR = require('../vagas/js/v2/pessoa/redirecionar.js');

const VAGAS = path.join(__dirname, '..', 'vagas');
const lerArq = (rel) => fs.readFileSync(path.join(VAGAS, rel), 'utf8');
const CANONICA = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://challenges.cloudflare.com; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://tevpqngqzxcswmticjnr.supabase.co; connect-src 'self' https://tevpqngqzxcswmticjnr.supabase.co https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'";
const PASTA_JS = path.join(VAGAS, 'js', 'v2', 'pessoa');
const ARQUIVOS_JS = fs.readdirSync(PASTA_JS).filter((f) => f.endsWith('.js')).map((f) => 'js/v2/pessoa/' + f).concat(['js/v2/previa/pessoa.js']);
const HTML = lerArq('index.html');
const REDIRECIONADORES = ['cidade.html', 'vaga.html', 'entrar.html', 'eu.html', 'emprego.html'];

function metaCsp(html) { const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html); return m ? m[1] : null; }

test('index.html: CSP da meta é a canônica e o _headers repete a mesma (mais frame-ancestors)', () => {
  assert.equal(metaCsp(HTML), CANONICA);
  const h = lerArq('_headers');
  assert.ok(h.includes('Content-Security-Policy: ' + CANONICA + "; frame-ancestors 'none'"));
});

test('index.html: nenhum <script> inline, nenhum <style>, nenhum style="" nem onclick=', () => {
  const scripts = HTML.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  assert.ok(scripts.length >= 10);
  scripts.forEach((s) => { assert.match(s, /\ssrc="[^"]+"/, s); assert.equal(s.replace(/<script\b[^>]*>/i, '').replace(/<\/script>/i, '').trim(), '', s); });
  assert.ok(!/<style\b/i.test(HTML));
  assert.ok(!/\sstyle\s*=/i.test(HTML));
  assert.ok(!/\son[a-z]+\s*=/i.test(HTML));
});

test('index.html: lang pt-BR, viewport, meta vsc-previa=pessoa, folhas de estilo do sistema e da pessoa, nada de Google Fonts', () => {
  assert.match(HTML, /<html lang="pt-BR">/);
  assert.match(HTML, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  assert.match(HTML, /<meta name="vsc-previa" content="pessoa">/);
  assert.match(HTML, /href="assets\/v2\/sistema\.css"/);
  assert.match(HTML, /href="assets\/v2\/pessoa\.css"/);
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(HTML));
  assert.ok(!/<script[^>]+src="https?:/i.test(HTML), 'nenhum script externo no HTML: pdf.js e mammoth entram sob demanda');
});

test('index.html: ordem dos scripts do passa-bastão do servidor; script de tema no <head> sem defer', () => {
  const head = HTML.slice(0, HTML.indexOf('</head>'));
  assert.match(head, /<script src="js\/v2\/pessoa\/tema\.js"><\/script>/);
  const ordem = ['js/config.js', 'js/v2/contrato.js', 'js/api.js', 'js/v2/api-v2.js', 'js/v2/icones.js', 'js/v2/pessoa/nucleo.js', 'js/v2/pessoa/busca.js', 'js/v2/pessoa/partida.js'];
  let ult = -1;
  ordem.forEach((s) => { const i = HTML.indexOf('src="' + s + '"'); assert.ok(i > ult, s + ' fora de ordem'); ult = i; });
  assert.ok(!/\b(defer|async)\b/.test(head));
});

test('index.html: <noscript> útil com a frase anti-golpe exata e links legais', () => {
  const m = /<noscript>([\s\S]*?)<\/noscript>/.exec(HTML);
  assert.ok(m);
  assert.ok(m[1].includes(CONTRATO.FRASE_GOLPE));
  assert.match(m[1], /JavaScript/);
  assert.match(m[1], /href="termos\.html"/);
  assert.match(m[1], /href="privacidade\.html"/);
});

test('todo script e todo link local do index.html existe', () => {
  const refs = [];
  HTML.replace(/\s(?:src|href)="([^"#]+)(?:#[^"]*)?"/g, (m, r) => { if (!/^(https?:|mailto:|tel:|data:)/.test(r)) refs.push(r); return m; });
  assert.ok(refs.length > 15);
  refs.forEach((r) => assert.ok(fs.existsSync(path.join(VAGAS, r.split('?')[0])), 'não existe: ' + r));
});

test('rotas por hash do HTML e dos scripts apontam para rotas que existem; sem link para testes, selo ou referência', () => {
  const rotas = ['', 'vagas', 'vaga', 'candidatar', 'candidatura', 'candidaturas', 'salvas', 'alertas', 'curriculo', 'eu', 'entrar', 'como-funciona'];
  const fontes = [HTML].concat(ARQUIVOS_JS.map(lerArq));
  fontes.forEach((src) => {
    (src.match(/#\/[a-z-]*/g) || []).forEach((h) => assert.ok(rotas.indexOf(h.slice(2)) >= 0, 'rota desconhecida: ' + h));
    assert.ok(!/(testes|selo|referencia)\.html/.test(src), 'link para tela escondida');
  });
  fontes.forEach((src) => { (src.match(/href="[a-z][a-z-]*\.html/g) || []).forEach((l) => assert.ok(fs.existsSync(path.join(VAGAS, l.slice(6))), l)); });
});

test('scripts da pessoa: sem fetch direto, sem estilo inline, sem console, sem TODO, sem eval; dado fictício só em previa/', () => {
  ARQUIVOS_JS.forEach((f) => {
    const s = lerArq(f);
    assert.ok(!/\bfetch\s*\(/.test(s), f + ': fetch direto');
    assert.ok(!/XMLHttpRequest|navigator\.sendBeacon/.test(s), f + ': XHR');
    assert.ok(!/\sstyle\s*=\s*["'\\]/.test(s) && !/setAttribute\(\s*['"]style/.test(s), f + ': estilo inline');
    assert.ok(!/\bconsole\./.test(s), f + ': console');
    assert.ok(!/\b(TODO|FIXME|XXX)\b/.test(s), f + ': TODO solto');
    assert.ok(!/\beval\s*\(|new Function\s*\(|document\.write/.test(s), f + ': eval');
    if (f !== 'js/v2/previa/pessoa.js') assert.ok(!/VSC_DADOS|VSC_PREVIA_METODOS/.test(s), f + ': dado fictício fora da prévia');
    assert.ok(!/<script\b/i.test(s), f + ': script montado por HTML');
  });
});

test('a faixa e os ajustes da demonstração só existem no código de previa/; o site de produção não os cita', () => {
  const comum = ARQUIVOS_JS.filter((f) => f !== 'js/v2/previa/pessoa.js').map(lerArq).join('\n') + HTML;
  assert.ok(!/Demonstração com empresas|Ajustes da demonstração|123456|vagas fictícias/i.test(comum));
  assert.match(lerArq('js/v2/previa/pessoa.js'), /Demonstração com empresas e vagas fictícias/);
  assert.match(lerArq('js/v2/previa/pessoa.js'), /Ajustes da demonstração/);
});

// textos entre aspas do código: onde as palavras proibidas poderiam aparecer em tela
function textos(src) {
  const out = [];
  (src.match(/(['"`])(?:\\.|(?!\1)[^\\\n])*\1/g) || []).forEach((t) => out.push(t.slice(1, -1).replace(/\$\{[^}]*\}/g, ' ').replace(/<[^>]*>/g, ' ')));
  return out.filter((t) => /\s/.test(t.trim()) || /^[A-ZÀ-Ú]/.test(t.trim())).join('\n');
}
test('textos das telas não têm palavra proibida (Tinder, swipe, match, aprovado, DISC, nota, pontuação, Notus...)', () => {
  const fontes = { 'index.html': HTML.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ') };
  ARQUIVOS_JS.filter((f) => f !== 'js/v2/pessoa/redirecionar.js').forEach((f) => { fontes[f] = textos(lerArq(f)); });
  const palavras = CONTRATO.PROIBIDAS.concat(['nota']);
  Object.keys(fontes).forEach((f) => {
    const t = fontes[f].toLowerCase();
    palavras.forEach((p) => {
      const re = new RegExp('(^|[^a-zà-ú])' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-zà-ú]|$)', 'i');
      assert.ok(!re.test(t), f + ': palavra proibida "' + p + '"');
    });
  });
});

test('a frase anti-golpe vem do contrato, palavra por palavra, e aparece nos 5 lugares do §5.8', () => {
  const p = lerArq('js/v2/pessoa/pecas.js');
  assert.match(p, /C\.FRASE_GOLPE/);
  ['telas-vagas.js', 'candidatar.js', 'candidaturas.js'].forEach((f) => assert.match(lerArq('js/v2/pessoa/' + f), /P\.golpe\(\)/));
  assert.match(p, /corpoVaga[\s\S]*vp-golpe/);
  assert.ok(!/Nunca pague/.test(p.replace(/\/\*[\s\S]*?\*\//g, '')), 'frase solta no código: use o contrato');
});

test('18+: nenhuma vaga ou texto de jovem aprendiz como oferta; a tela avisa que é só para 18 anos ou mais', () => {
  const f = lerArq('js/v2/pessoa/candidatar.js') + lerArq('js/v2/pessoa/formularios.js') + lerArq('js/v2/pessoa/telas-vagas.js');
  assert.match(f, /Precisa ter 18 anos ou mais/);
  assert.match(f, /Tenho 18 anos ou mais/);
  assert.ok(!/Jovem aprendiz['"`]/.test(lerArq('js/v2/pessoa/nucleo.js')));
});

test('a pessoa nunca vê número de candidatos nem "Selo sugerido"; sem campo de idade, sexo, estado civil, foto ou nacionalidade', () => {
  ARQUIVOS_JS.filter((f) => f !== 'js/v2/pessoa/texto-curriculo.js' && f !== 'js/v2/pessoa/redirecionar.js').forEach((f) => {
    const t = textos(lerArq(f)).toLowerCase();
    assert.ok(!/selo sugerido|candidatos? (já|se candidat)|\d+ candidatos/.test(t), f);
    assert.ok(!/(sua idade|data de nascimento|seu estado civil|qual seu sexo|nacionalidade)\b/.test(t.replace('troque por um sem eles', '')) || f.endsWith('candidatar.js') || f.endsWith('eu.js') || f.endsWith('arquivos.js') || f.endsWith('telas-vagas.js'), f);
  });
  assert.ok(!/name="(idade|sexo|nascimento|estado_civil|nacionalidade)"/.test(ARQUIVOS_JS.map(lerArq).join('\n')));
});

test('cada módulo sob demanda existe como arquivo e a ordem das dependências não tem ciclo', () => {
  const ctx = vm.createContext({ document: { currentScript: { src: 'http://x/js/v2/pessoa/nucleo.js' } }, localStorage: {} });
  ctx.self = ctx;
  vm.runInContext(lerArq('js/v2/pessoa/nucleo.js'), ctx);
  const P = ctx.VSC_P;
  const nomes = new Set(Object.values(P.MOD_ACAO).concat(Object.values(P.MOD_TELA)));
  assert.ok(nomes.size >= 5);
  nomes.forEach((n) => assert.ok(fs.existsSync(path.join(PASTA_JS, n + '.js')), 'módulo ausente: ' + n));
  ['codigo', 'texto-curriculo', 'arquivos', 'fila'].forEach((n) => assert.ok(fs.existsSync(path.join(PASTA_JS, n + '.js')), n));
  assert.equal(P.MOD_ACAO.candidatar, 'candidatar');
  assert.equal(P.MOD_TELA.candidaturas, 'candidaturas');
});

test('pdf.js 3.11.174 e mammoth 1.6.0 só sob demanda, do cdnjs, com integrity (SRI) e crossorigin', () => {
  const s = lerArq('js/v2/pessoa/arquivos.js');
  assert.match(s, /pdf\.js\/3\.11\.174\/pdf\.min\.js/);
  assert.match(s, /pdf\.js\/3\.11\.174\/pdf\.worker\.min\.js/);
  assert.match(s, /mammoth\/1\.6\.0\/mammoth\.browser\.min\.js/);
  assert.equal((s.match(/sha384-[A-Za-z0-9+/]{64}/g) || []).length, 3);
  assert.match(s, /\.integrity = lib\.sri/);
  assert.match(s, /\.crossOrigin = 'anonymous'/);
  assert.ok(!/<(script|link)\b[^>]*cdnjs/i.test(HTML), 'o HTML não carrega nenhuma biblioteca externa');
  // só essas libs: nenhum outro endereço externo nos scripts
  const ext = new Set();
  ARQUIVOS_JS.forEach((f) => { (lerArq(f).match(/https?:\/\/[a-z0-9.-]+/gi) || []).forEach((u) => ext.add(u.toLowerCase())); });
  ['https://cdnjs.cloudflare.com', 'https://wa.me', 'https://tevpqngqzxcswmticjnr.supabase.co'].forEach((u) => ext.delete(u));
  assert.deepEqual([...ext].filter((u) => !/www\.w3\.org|example\.com/.test(u)), []);
});

test('peso da primeira visita (gzip): HTML + CSS + JS que carregam sem cache ficam perto de 150 KB', () => {
  const zlib = require('node:zlib');
  const gz = (rel) => zlib.gzipSync(fs.readFileSync(path.join(VAGAS, rel))).length;
  const eager = ['index.html', 'assets/v2/sistema.css', 'assets/v2/pessoa.css', 'js/config.js', 'js/v2/contrato.js', 'js/api.js', 'js/v2/api-v2.js', 'js/v2/icones.js']
    .concat(['tema', 'nucleo', 'busca', 'pecas', 'folhas', 'conta', 'telas-vagas', 'rotas', 'partida'].map((n) => 'js/v2/pessoa/' + n + '.js'));
  const total = eager.reduce((t, f) => t + gz(f), 0);
  assert.ok(total <= 150 * 1024, 'primeira visita: ' + Math.round(total / 1024) + ' KB (gzip)');
  const lentos = ['candidatar', 'candidaturas', 'eu', 'filtros', 'entrar', 'codigo', 'arquivos', 'fila', 'texto-curriculo'].reduce((t, n) => t + gz('js/v2/pessoa/' + n + '.js'), 0);
  assert.ok(lentos > 0);
});

/* ---------- redirecionadores das telas antigas ---------- */
test('telas antigas da pessoa viram redirecionadores curtos: meta refresh + link + noscript, sem JS inline', () => {
  REDIRECIONADORES.forEach((f) => {
    const h = lerArq(f);
    assert.ok(h.length < 1500, f + ' deveria ser curto');
    assert.match(h, /<meta http-equiv="refresh" content="\d+; url=index\.html#\/[a-z-]*">/, f);
    assert.match(h, /<a href="index\.html#\/[a-z-]*">/, f);
    assert.match(h, /<noscript>/, f);
    assert.equal(metaCsp(h), CANONICA, f);
    assert.ok(!/<style\b|\sstyle=|<script\b(?![^>]*\ssrc=)/i.test(h), f);
    assert.match(h, /<script src="js\/v2\/pessoa\/redirecionar\.js"><\/script>/, f);
  });
});
test('redirecionar.destino leva o endereço antigo para a tela nova (cidade, vaga, entrar, eu, emprego)', () => {
  assert.equal(REDIR.destino('cidade.html', '?cidade=uruacu-go', ''), 'index.html?cidade=uruacu-go#/vagas');
  assert.equal(REDIR.destino('cidade.html', '', ''), 'index.html#/vagas');
  assert.equal(REDIR.destino('cidade.html', '?cidade=uruacu-go&vaga=K7M2QX', ''), 'index.html#/vaga/K7M2QX');
  assert.equal(REDIR.destino('vaga.html', '?c=K7M2QX', ''), 'index.html#/vaga/K7M2QX');
  assert.equal(REDIR.destino('vaga.html', '?codigo=k7m2qx', ''), 'index.html#/vaga/k7m2qx');
  assert.equal(REDIR.destino('vaga.html', '', ''), 'index.html#/vagas');
  assert.equal(REDIR.destino('entrar.html', '?x=1', '#entrar'), 'index.html#/entrar');
  assert.equal(REDIR.destino('eu.html', '', '#curriculo/arquivo'), 'index.html#/curriculo');
  assert.equal(REDIR.destino('eu.html', '', '#candidaturas'), 'index.html#/candidaturas');
  assert.equal(REDIR.destino('eu.html', '', ''), 'index.html#/eu');
  assert.equal(REDIR.destino('emprego.html', '', ''), 'index.html#/como-funciona');
});
test('redirecionar.destino não deixa código estranho passar para o endereço (injeção por ?vaga=)', () => {
  assert.equal(REDIR.destino('cidade.html', '?vaga=%22%3E%3Cscript%3Ealert(1)', ''), 'index.html#/vaga/scriptalert1');
  assert.ok(!/[<>"' ]/.test(REDIR.destino('vaga.html', '?c=a b"c', '')));
});
