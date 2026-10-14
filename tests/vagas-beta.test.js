// Versão beta fechada com código (vagas/js/beta.js): tranca só no domínio oficial e libera com o código certo.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../vagas/js/beta.js');

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

test('tranca no domínio oficial até o código certo estar guardado', () => {
  const h = B.CODIGO_SHA256;
  assert.equal(B.precisa('disc.gestaosemcaos.com.br', null, h), true);
  assert.equal(B.precisa('vagas.gestaosemcaos.com.br', 'outro', h), true);
  assert.equal(B.precisa('gestaosemcaos.com.br', null, h), true);
  assert.equal(B.precisa('disc.gestaosemcaos.com.br', h, h), false);
});

test('não tranca fora do domínio oficial nem sem código configurado', () => {
  const h = B.CODIGO_SHA256;
  for (const host of ['localhost', '127.0.0.1', 'gsc-vagas.pages.dev', 'gestaosemcaos.com.br.exemplo.com', '']) {
    assert.equal(B.precisa(host, null, h), false, host);
  }
  assert.equal(B.precisa('disc.gestaosemcaos.com.br', null, ''), false);
});

test('o código é comparado sem espaços nas pontas e sem diferença de maiúsculas', () => {
  assert.equal(B.normalizar('  Vagas-Beta-4817 '), 'vagas-beta-4817');
  assert.equal(B.normalizar(null), '');
  assert.match(B.CODIGO_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(sha(B.normalizar(' VAGAS-BETA-4817')), B.CODIGO_SHA256);
});

test('a chave guardada não começa com vg. (o "Sair" do site não apaga a liberação)', () => {
  assert.doesNotMatch(B.CHAVE, /^vg\./);
});

test('toda página do site de vagas carrega a porta da beta no <head>, depois de endereco.js', () => {
  const pasta = path.join(__dirname, '..', 'vagas');
  const paginas = fs.readdirSync(pasta).filter((f) => f.endsWith('.html'));
  assert.ok(paginas.length >= 10);
  for (const p of paginas) {
    const html = fs.readFileSync(path.join(pasta, p), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    assert.match(head, /<link rel="stylesheet" href="assets\/vagas-beta\.css">/, p);
    const iEndereco = head.indexOf('<script src="js/endereco.js"></script>');
    const iBeta = head.indexOf('<script src="js/beta.js"></script>');
    assert.ok(iEndereco >= 0 && iBeta > iEndereco, `${p}: beta.js no <head>, depois de endereco.js`);
  }
});
