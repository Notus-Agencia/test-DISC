'use strict';
// Guarda da hospedagem e da documentação do servidor da v2: a CSP do passa-bastão é a do _headers, todo segredo da função está
// listado (só o NOME), a migração dos códigos é aditiva e nada de segredo entra no repositório.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const DOC = ler('docs/projeto/status/vagas-v2-servidor.md');

test('a CSP do passa-bastão (seção do nginx) é exatamente a do vagas/_headers (mais frame-ancestors)', () => {
  const cab = /Content-Security-Policy: ([^\n]+)/.exec(ler('vagas/_headers'))[1];
  const canonica = cab.replace(/; frame-ancestors 'none'$/, '');
  assert.notEqual(canonica, cab, 'o _headers termina com frame-ancestors');
  assert.ok(DOC.includes('\n' + canonica + '\n'), 'o passa-bastão repete a política canônica linha por linha');
  assert.ok(DOC.includes('<a política do item 6.1>; frame-ancestors \'none\''));
});

test('todas as variáveis da função estão documentadas (só o nome) e nenhum segredo aparece', async () => {
  const { NOMES_ENV_VAGAS_CONTA } = await import(pathToFileURL(path.join(RAIZ, 'supabase', 'funcoes-compartilhadas', 'vagas-conta.js')).href);
  for (const n of NOMES_ENV_VAGAS_CONTA) assert.ok(DOC.includes('`' + n + '`'), 'falta documentar ' + n);
  for (const arq of ['docs/projeto/status/vagas-v2-servidor.md', 'supabase/migrations/20261102120000_vagas_v2_codigos.sql', 'supabase/funcoes-compartilhadas/vagas-v2.js',
    'supabase/funcoes-compartilhadas/vagas-conta.js', 'vagas/js/v2/api-v2.js', 'vagas/js/config.js']) {
    const t = ler(arq);
    assert.ok(!/sb_secret_|service_role_key\s*[:=]\s*['"]|re_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}\./i.test(t), arq + ' tem cara de segredo');
    assert.ok(!/notus/i.test(t), arq + ' cita a agência');
  }
});

test('o canal WhatsApp e o número de ajuda estão desligados/vazios por padrão e o nome do provedor não foi inventado', () => {
  const cfg = require('../vagas/js/config.js');
  assert.equal(cfg.CANAL_WHATSAPP, false);
  assert.equal(cfg.WHATSAPP_AJUDA, '');
  const fonte = ler('supabase/funcoes-compartilhadas/vagas-conta.js');
  const urls = fonte.match(/https?:\/\/[^\s'"`)]+/g) || [];
  const permitidas = /supabase\.co|gestaosemcaos|resend\.dev|api\.resend\.com|challenges\.cloudflare\.com|exemplo|wa\.me/;
  for (const u of urls) assert.ok(permitidas.test(u), 'URL externa não prevista na função: ' + u);
  assert.ok(!/twilio|zenvia|gupshup|z-api|evolution|meta\.com|graph\.facebook/i.test(ler('supabase/funcoes-compartilhadas/vagas-v2.js') + fonte), 'nenhum provedor de WhatsApp foi escolhido');
});

test('a migração dos códigos é aditiva: nada de apagar tabela, coluna ou função existente; RLS ligada', () => {
  const sql = ler('supabase/migrations/20261102120000_vagas_v2_codigos.sql');
  assert.ok(!/\bdrop\s+(table|column|schema|function|policy|trigger)\b/i.test(sql));
  assert.ok(!/\balter\s+table\s+public\./i.test(sql), 'não mexe em tabela que já existe');
  assert.ok(/enable row level security/i.test(sql));
  for (const f of ['vagas_conta_codigo_novo', 'vagas_conta_codigo_tentar', 'vagas_conta_codigo_usar', 'vagas_conta_codigo_cancelar', 'vagas_conta_limite_v2']) {
    assert.ok(new RegExp('create or replace function public\\.' + f + '\\(').test(sql), f);
  }
  assert.ok(/create table if not exists vagas_interno\.codigos_entrada/.test(sql));
});

test('o link curto leva para a rota nova da pessoa (/#/vaga/<código>) e a regra equivalente do nginx está documentada', async () => {
  const mod = await import(pathToFileURL(path.join(RAIZ, 'vagas', 'functions', 'v', '[codigo].js')).href);
  assert.equal(mod.rotaDaVaga('K7M2QX'), '/#/vaga/K7M2QX');
  assert.equal(mod.FRASE_GOLPE, require('../vagas/js/v2/contrato.js').FRASE_GOLPE);
  assert.ok(DOC.includes('return 302 /#/vaga/$1'));
  assert.ok(/\/v\/:codigo\s+\/#\/vaga\/:codigo/.test(ler('vagas/_redirects')), 'a regra para o dia em que a Function sair está no _redirects');
});
