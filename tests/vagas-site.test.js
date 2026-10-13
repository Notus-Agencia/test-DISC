'use strict';
// Vagas sem Caos — site (vagas/): página "em construção" com a marca da Gestão sem Caos (nunca Notus), política de segurança,
// endereço certo (disc.gestaosemcaos.com.br/vagas/… → vagas.gestaosemcaos.com.br/…) e as peças copiadas por
// scripts/montar-vagas.mjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const END = require('../vagas/js/endereco.js');

const VAGAS = path.join(__dirname, '..', 'vagas');
const ler = (rel) => fs.readFileSync(path.join(VAGAS, rel), 'utf8');

test('index.html: marca Gestão sem Caos, nada de Notus em tela, frase anti-golpe, só arquivos do próprio site', () => {
  const html = ler('index.html');
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /Vagas sem Caos · uma ferramenta da Gestão sem Caos/);
  assert.match(html, /alt="Gestão sem Caos"/);
  assert.match(html, /Nunca pague para se candidatar\.<\/strong> Se alguém pedir em nosso nome, é golpe\./);
  const visivel = html.replace(/<link[^>]*>/g, '').replace(/<script[^>]*><\/script>/g, '');
  assert.ok(!/notus/i.test(visivel), 'nenhum "Notus" em texto da página');
  assert.ok(!html.includes('icone.svg'), 'a estrela da Notus não aparece em tela pública');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(!/^(https?:)?\/\//.test(m[1]), 'arquivo de fora: ' + m[1]);
    if (!m[1].startsWith('#')) assert.ok(fs.existsSync(path.join(VAGAS, m[1])), 'falta ' + m[1]);
  }
});

test('index.html: CSP fechada, sem script inline, redirecionamento antes de tudo, sem indexar enquanto em construção', () => {
  const html = ler('index.html');
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(m);
  const dir = {};
  m[1].split(';').map((x) => x.trim()).filter(Boolean).forEach((x) => { const p = x.split(/\s+/); dir[p[0]] = p.slice(1); });
  assert.deepEqual(dir['script-src'], ["'self'"]);
  assert.deepEqual(dir['object-src'], ["'none'"]);
  // No modo supabase a tela fala com o projeto (fetch) e mostra a foto assinada (img): a meta libera só o domínio do Supabase;
  // o _headers da hospedagem pode apertar para o projeto exato (meta + cabeçalho = interseção), nunca precisa abrir mais.
  assert.deepEqual(dir['connect-src'], ["'self'", 'https://*.supabase.co']);
  assert.ok(dir['img-src'].includes('https://*.supabase.co') && dir['img-src'].includes('blob:'));
  assert.equal([...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)].length, 0, 'sem <script> inline');
  assert.ok(!/\son[a-z]+=/.test(html), 'sem atributos on*');
  assert.ok(html.indexOf('js/endereco.js') < html.indexOf('<link rel="stylesheet"'), 'o redirecionamento vem antes do CSS');
  assert.match(html, /<meta name="robots" content="noindex">/);
});

test('endereço: disc.gestaosemcaos.com.br/vagas/… vai para vagas.gestaosemcaos.com.br com caminho, parâmetros e âncora', () => {
  const de = (hostname, pathname, search, hash) => END.destino({ hostname, pathname, search: search || '', hash: hash || '' });
  assert.equal(de('disc.gestaosemcaos.com.br', '/vagas/'), 'https://vagas.gestaosemcaos.com.br/');
  assert.equal(de('disc.gestaosemcaos.com.br', '/vagas'), 'https://vagas.gestaosemcaos.com.br/');
  assert.equal(de('disc.gestaosemcaos.com.br', '/vagas/boa-vista-rr/', '?vaga=K7M2QX', '#topo'),
    'https://vagas.gestaosemcaos.com.br/boa-vista-rr/?vaga=K7M2QX#topo');
  assert.equal(de('wellington-dotcom.github.io', '/test-DISC/vagas/entrar.html', '?token_hash=abc&type=invite'),
    'https://vagas.gestaosemcaos.com.br/entrar.html?token_hash=abc&type=invite');
  for (const host of ['vagas.gestaosemcaos.com.br', 'localhost', '127.0.0.1', 'vagas-gestaosemcaos.pages.dev']) {
    assert.equal(de(host, '/vagas/x.html'), '', host + ' já é o lugar certo');
  }
  assert.equal(de('disc.gestaosemcaos.com.br', '/admin.html'), '', 'fora de /vagas não mexe');
  assert.equal(de('', '/vagas/'), '');
});

test('vagas/comum/ em dia com assets/ (scripts/montar-vagas.mjs) e logos que a Pages Function usa', async () => {
  const { conferir } = await import('../scripts/montar-vagas.mjs');
  assert.deepEqual(conferir(), []);
  for (const f of ['marca/gsc-logo-negativo.svg', 'marca/gsc-logo-email.png', 'marca/gsc-favicon.svg', 'marca/gsc-logo.svg',
    'fonts/plus-jakarta-sans-latin-wght-normal.woff2', 'fonts/OFL.txt']) {
    assert.ok(fs.existsSync(path.join(VAGAS, 'comum', f)), f);
  }
  assert.match(ler('comum/notus.css'), /^\/\* CÓPIA GERADA por scripts\/montar-vagas\.mjs/);
});

test('o site de vagas não carrega segredos nem o código do DISC', () => {
  const arquivos = [];
  const andar = (p) => {
    for (const n of fs.readdirSync(p)) {
      const c = path.join(p, n);
      if (fs.statSync(c).isDirectory()) { if (n !== 'comum' && n !== 'functions') andar(c); } else if (/\.(html|js|css)$/.test(n)) arquivos.push(c);
    }
  };
  andar(VAGAS);
  assert.ok(arquivos.length >= 6);
  for (const a of arquivos) {
    const t = fs.readFileSync(a, 'utf8');
    assert.ok(!/sb_secret_[A-Za-z0-9_-]{8,}|eyJhbGciOiJ[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{16,}/.test(t), a + ': parece uma chave secreta');
    assert.ok(!/\.\.\/(js|assets)\//.test(t), a + ' não pode depender de arquivos fora de vagas/');
  }
});
