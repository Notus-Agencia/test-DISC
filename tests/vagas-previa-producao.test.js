'use strict';
// Vagas sem Caos — prévia × produção e itens da base (revisão de código da fase C: T1, G1–G6, E6): o endereço nunca liga a
// prévia no domínio oficial, o cliente cai no banco de verdade com qualquer MODO que não seja 'previa', a prévia não guarda
// senha nem usa telefone ou código de selo que possam ser reais, CSP sem curinga e mensagem neutra de banco desatualizado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const API = require('../vagas/js/api.js');
const UI = require('../vagas/js/ui.js');
const PREVIA = require('../vagas/js/api-previa.js');
const R = require('../vagas/js/regras.js');

function armazem() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}
// Roda vagas/js/config.js como no navegador (sem module), com o MODO pedido.
function config(modo, hostname, search, ss) {
  const caixa = { location: { hostname, search: search || '' }, sessionStorage: ss || armazem() };
  caixa.self = caixa;
  vm.runInNewContext(ler('vagas/js/config.js').replace(/MODO: '[a-z]+'/, "MODO: '" + modo + "'"), caixa);
  return caixa.VAGAS_CONFIG.MODO;
}

test('G1/T1: no domínio oficial o endereço (?previa=1 ou a aba já marcada) nunca liga a prévia; fora dele, liga', () => {
  for (const host of ['vagas.gestaosemcaos.com.br', 'VAGAS.gestaosemcaos.com.br', 'disc.gestaosemcaos.com.br', 'gestaosemcaos.com.br']) {
    assert.equal(config('supabase', host, '?previa=1'), 'supabase', host + ' ?previa=1');
    assert.equal(config('supabase', host, '?codigo=Q8V3N2KD&previa=sim'), 'supabase', host + ' previa=sim');
    const ss = armazem();
    ss.setItem('vagas_previa', '1');
    assert.equal(config('supabase', host, '', ss), 'supabase', host + ': marca antiga da aba não vale');
    assert.equal(ss.getItem('vagas_previa'), null, host + ': e é apagada');
  }
  for (const host of ['localhost', '127.0.0.1', 'vagas-gestaosemcaos.pages.dev', 'abc123.vagas-gestaosemcaos.pages.dev', 'gestaosemcaos.com.br.golpe.com']) {
    const ss = armazem();
    assert.equal(config('supabase', host, '?previa=1', ss), 'previa', host);
    assert.equal(config('supabase', host, '', ss), 'previa', host + ': a aba continua na prévia');
    assert.equal(config('supabase', host, '?previa=0', ss), 'supabase', host + ': ?previa=0 desliga');
  }
  assert.equal(config('previa', 'vagas.gestaosemcaos.com.br', '?previa=0'), 'previa', 'no domínio oficial só o MODO decide');
});

test('G1: api.js falha fechada — só MODO "previa" exato liga o banco de mentira; qualquer outra coisa é o Supabase', () => {
  for (const [modo, esperado] of [['previa', 'previa'], ['supabase', 'supabase'], ['Previa', 'supabase'], ['previa ', 'supabase'], ['prévia', 'supabase'],
    ['', 'supabase'], [undefined, 'supabase'], [null, 'supabase'], ['producao', 'supabase']]) {
    assert.equal(API.modoDe({ MODO: modo }), esperado, String(modo));
  }
  assert.equal(API.modoDe(null), 'supabase');
  // No navegador: o VAGAS_API criado pela página segue a mesma regra.
  for (const [modo, esperado] of [['previa', 'previa'], ['supabse', 'supabase'], ['', 'supabase']]) {
    const caixa = { VAGAS_CONFIG: { MODO: modo, SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'k' } };
    caixa.self = caixa;
    vm.runInNewContext(ler('vagas/js/api.js'), caixa);
    assert.equal(caixa.VAGAS_API.modo, esperado, 'MODO ' + JSON.stringify(modo));
    assert.equal(typeof caixa.VAGAS_API.aoResponder, 'function');
  }
});

test('E6: aoVoltarInternet devolve a função que tira o ouvinte; a conversa tira o seu ao parar', () => {
  const ouvintes = [];
  const caixa = { addEventListener: (t, f) => ouvintes.push([t, f]), removeEventListener: (t, f) => { const i = ouvintes.findIndex((o) => o[0] === t && o[1] === f); if (i >= 0) ouvintes.splice(i, 1); } };
  caixa.self = caixa;
  vm.runInNewContext(ler('vagas/js/ui.js'), caixa);
  const fn = () => {};
  const antes = ouvintes.length;   // o próprio ui.js já ouve 'online' para tirar a faixa "Sem internet"
  const tirar = caixa.VAGAS_UI.aoVoltarInternet(fn);
  assert.equal(ouvintes.length, antes + 1);
  assert.deepEqual(ouvintes[ouvintes.length - 1], ['online', fn]);
  tirar();
  assert.equal(ouvintes.length, antes);
  assert.ok(ouvintes.some((o) => o[0] === 'online'), 'a faixa "Sem internet" sai quando a internet volta');
  assert.equal(typeof UI.aoVoltarInternet(fn), 'function', 'sem window (Node): devolve uma função que não faz nada');
  assert.match(ler('vagas/js/conversa.js'), /var tirarOuvinteInternet = U\.aoVoltarInternet\([^]*parar: function \(\) \{[^}]*tirarOuvinteInternet\(\);/);
});

test('faixa "Sem internet": sai quando o servidor responde de novo (VAGAS_API.aoResponder) e quando a internet volta', async () => {
  let pedidos = 0;
  const api = API.criar({ modo: 'supabase', url: 'https://x.supabase.co', chave: 'k', armazenamento: null,
    fetch: () => { pedidos++; return Promise.resolve({ status: 200, text: () => Promise.resolve('{"ok":true,"cidades":[]}') }); } });
  let avisos = 0;
  api.aoResponder(() => { avisos++; });
  await api.cidades();
  assert.equal(pedidos, 1);
  assert.ok(avisos >= 1, 'quem ouve fica sabendo que o servidor respondeu');
  const ui = ler('vagas/js/ui.js');
  assert.match(ui, /aoVoltarInternet\(semFaixaOffline\);/);
  assert.match(ui, /VAGAS_API\.aoResponder\(semFaixaOffline\)/);
});

test('G2: faixa da prévia em toda tela (uma só; a dos testes entra dentro dela) e aviso de selo de demonstração', () => {
  const ui = ler('vagas/js/ui.js');
  assert.match(ui, /function faixaPrevia\(\) \{[^]*A\.modo !== 'previa' \|\| porId\('vg-faixa-previa'\)\) return null;[^]*class: 'faixa-demo', id: 'vg-faixa-previa', role: 'note'/);
  assert.match(ui, /'Versão beta:'\),\s+' dados de exemplo, nada aqui é real\. Não use sua senha de verdade\.'/);
  assert.match(ui, /\n  faixaPrevia\(\);\n\}\)\(/, 'chamada ao carregar o ui.js, em toda página');
  for (const p of fs.readdirSync(path.join(RAIZ, 'vagas')).filter((f) => f.endsWith('.html') && !/^(termos|privacidade)\.html$/.test(f))) {
    const html = ler('vagas/' + p);
    assert.ok(html.indexOf('js/api.js') > 0 && html.indexOf('js/api.js') < html.indexOf('js/ui.js'), p + ': api.js antes do ui.js');
  }
  assert.match(ler('vagas/js/testes-tela.js'), /var geral = doc\.getElementById\('vg-faixa-previa'\);\n\s+if \(geral\) \{[^}]*id: 'vg-faixa-demo'/);
  assert.match(ler('vagas/js/selo.js'), /A && A\.modo === 'previa' \? el\('p', \{ class: 'aviso', id: 'vg-conferir-demo'[^]*Selo de demonstração\./);
  assert.match(ler('vagas/assets/vagas-pc.css'), /body\.vg-pc > \.faixa-demo \{ margin-left: 248px; \}|body\.vg-pc > \.vg-faixa, body\.vg-pc > \.faixa-demo \{ margin-left: 248px; \}/);
});

test('G3: a prévia não guarda no navegador a senha que a pessoa cria (as da semente seguem a senha pública da prévia)', async () => {
  const arm = armazem();
  const b = PREVIA.criarBackend({ armazenamento: arm, semente: true });
  const c = await b.conta.cadastrar({ email: 'nova.senha@exemplo.com', tipo: 'pessoa', termosVersao: R.VERSAO_TERMOS });
  const link = API.linkDoEndereco({ search: '?' + c.linkPrevia.split('?')[1] });
  assert.equal((await b.conta.confirmarLink(link)).ok, true);
  assert.equal((await b.conta.definirSenha('minha-senha-de-verdade-123')).ok, true);
  const guardado = Object.values(arm._m).join('\n');
  assert.ok(!guardado.includes('minha-senha-de-verdade-123'), 'a senha não fica no armazenamento');
  await b.conta.sair();
  assert.equal((await b.conta.entrar('nova.senha@exemplo.com', 'outra-senha-qualquer')).ok, true, 'na prévia qualquer senha de 8+ entra');
  await b.conta.sair();
  assert.equal((await b.conta.entrar('nova.senha@exemplo.com', 'curta')).ok, false);
  assert.equal((await b.conta.entrar('pessoa@previa.com', 'errada123')).erro, 'E-mail ou senha não conferem.', 'conta da semente: só a senha da prévia');
  assert.equal((await b.conta.entrar('pessoa@previa.com', PREVIA.SENHA_PREVIA)).ok, true);
  assert.ok(Object.keys(arm._m).every((k) => k !== 'vagas_previa_v3'), 'a chave antiga (com senha em texto puro) é apagada');
  const velho = armazem();
  velho.setItem('vagas_previa_v3', JSON.stringify({ usuarios: [{ senha: 'segredo' }] }));
  PREVIA.criarBackend({ armazenamento: velho, semente: false });
  assert.equal(velho.getItem('vagas_previa_v3'), null);
});

test('G4: telefones da semente com DDD que não existe (23) e códigos de selo sorteados (o exemplo da tela não confere)', async () => {
  const fonte = ler('vagas/js/api-previa.js');
  assert.doesNotMatch(fonte, /'5562/, 'nenhum número com DDD 62');
  const b = PREVIA.criarBackend({ armazenamento: armazem(), semente: true });
  const st = b.estado();
  const numeros = [];
  JSON.stringify(st, (k, v) => { if (typeof v === 'string' && /^55\d{10,11}$/.test(v)) numeros.push(v); return v; });
  assert.ok(numeros.length > 20, 'a semente tem telefones');
  for (const n of numeros) assert.equal(n.slice(2, 4), '23', n);
  const codigos = Object.values(st.selos).flat().map((s) => s.codigo);
  assert.equal(codigos.length, 2);
  for (const c of codigos) { assert.match(c, /^[A-HJ-NP-Z2-9]{8}$/); assert.notEqual(c, 'Q8V3N2KD'); }
  const outra = PREVIA.criarBackend({ armazenamento: armazem(), semente: true });
  assert.notDeepEqual(Object.values(outra.estado().selos).flat().map((s) => s.codigo), codigos, 'sorteados, não fixos');
  const r = await b.rpc('vagas_selo_publico', { p_codigo: 'Q8V3N2KD' });
  assert.equal(r.ok, false, 'o código do exemplo da tela não é um selo da prévia');
});

test('CSP: sem curinga *.supabase.co (só o projeto) nas páginas e sem unsafe-inline no _headers', () => {
  const PROJETO = 'https://tevpqngqzxcswmticjnr.supabase.co';
  for (const p of fs.readdirSync(path.join(RAIZ, 'vagas')).filter((f) => f.endsWith('.html'))) {
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(ler('vagas/' + p))[1];
    assert.ok(!csp.includes('*.supabase.co'), p);
    assert.ok(csp.includes("connect-src 'self' " + PROJETO), p);
    assert.ok(!csp.includes('unsafe-inline'), p);
  }
  const cab = /Content-Security-Policy: ([^\n]+)/.exec(ler('vagas/_headers'))[1];
  assert.ok(!cab.includes('unsafe-inline') && !cab.includes('*.supabase.co'));
  assert.match(cab, /style-src 'self';/);
});

test('G6: banco desatualizado — frase neutra na tela, detalhe técnico só no erro (console) e no painel da equipe', async () => {
  const api = API.criar({ modo: 'supabase', url: 'https://x.supabase.co', chave: 'k', armazenamento: null,
    fetch: () => Promise.resolve({ status: 404, text: () => Promise.resolve('{"code":"PGRST202"}') }) });
  await assert.rejects(api.cidades(), (e) => e.bancoDesatualizado === true && e.message === 'O Vagas sem Caos está em manutenção. Tente de novo em alguns minutos.' &&
    /20261022120000_vagas/.test(e.tecnico));
  assert.equal(API.MSG.BANCO, 'O Vagas sem Caos está em manutenção. Tente de novo em alguns minutos.');
  assert.match(ler('js/admin-vagas.js'), /Peça para aplicar as migrações do Vagas \(docs\/SUPABASE\.md\)/, 'o painel continua com a mensagem técnica');
});
