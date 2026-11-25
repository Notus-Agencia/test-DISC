'use strict';
// vagas/js/config.js na v2: padrões seguros (número de ajuda vazio, canal WhatsApp desligado), ajuda() com contingência e a regra
// de que o endereço só liga a prévia fora do domínio oficial.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const j = (x) => JSON.parse(JSON.stringify(x));
const FONTE = fs.readFileSync(path.join(__dirname, '..', 'vagas', 'js', 'config.js'), 'utf8');

function carregar(host, busca, sessao) {
  const ss = Object.assign({}, sessao || {});
  const root = { location: { hostname: host, search: busca || '' },
    sessionStorage: { getItem: (k) => (k in ss ? ss[k] : null), setItem: (k, v) => { ss[k] = String(v); }, removeItem: (k) => { delete ss[k]; } } };
  root.self = root;
  vm.createContext(root);
  vm.runInContext(FONTE, root);
  return { config: root.VAGAS_CONFIG, ss };
}

test('padrões da v2: sem número de ajuda inventado, canal WhatsApp desligado, termos de 24/11/2026', () => {
  const c = require('../vagas/js/config.js');
  assert.equal(c.WHATSAPP_AJUDA, '', 'nunca invente um número');
  assert.equal(c.EMAIL_AJUDA, '');
  assert.equal(c.CANAL_WHATSAPP, false);
  assert.equal(c.PREVIA_LATENCIA, 120);
  assert.equal(c.VERSAO_TERMOS, '2026-11-24');
  assert.equal(c.SUPABASE_URL, 'https://tevpqngqzxcswmticjnr.supabase.co');
  assert.ok(!/service_role|secret/i.test(c.SUPABASE_ANON_KEY.replace(/^sb_publishable_/, '')), 'só a chave pública');
  assert.equal(c.ajudaLink, c.ajuda);
});

test('ajuda(): contingência quando o número está vazio; WhatsApp só com número válido; e-mail como segunda opção', () => {
  const { config: c } = carregar('vagas.gestaosemcaos.com.br');
  assert.deepEqual(j(c.ajuda()), { tipo: 'contingencia', texto: 'O atendimento por WhatsApp ainda não está disponível. Volte em breve.', href: '' });
  c.WHATSAPP_AJUDA = '(62) 99999-0000';
  assert.deepEqual(j(c.ajuda('Preciso de ajuda com a vaga')), { tipo: 'whatsapp', href: 'https://wa.me/5562999990000?text=Preciso%20de%20ajuda%20com%20a%20vaga' });
  assert.deepEqual(j(c.ajuda()), { tipo: 'whatsapp', href: 'https://wa.me/5562999990000' });
  c.WHATSAPP_AJUDA = '+55 62 99999-0000';
  assert.equal(c.ajuda().href, 'https://wa.me/5562999990000');
  c.WHATSAPP_AJUDA = '123';
  assert.equal(c.ajuda().tipo, 'contingencia', 'número inválido não vira link');
  c.WHATSAPP_AJUDA = '';
  c.EMAIL_AJUDA = 'ajuda@exemplo.com';
  assert.deepEqual(j(c.ajuda('Oi')), { tipo: 'contingencia', texto: 'Fale com a gente pelo e-mail ajuda@exemplo.com.', href: 'mailto:ajuda@exemplo.com?subject=Oi' });
  c.EMAIL_AJUDA = 'isto não é e-mail';
  assert.equal(c.ajuda().href, '');
});

test('a prévia só liga fora do domínio oficial (?previa=1) e o endereço oficial nunca a liga', () => {
  assert.equal(carregar('localhost', '?previa=1').config.MODO, 'previa');
  assert.equal(carregar('abc.pages.dev', '?previa=1').config.MODO, 'previa');
  assert.equal(carregar('localhost', '').config.MODO, 'supabase');
  assert.equal(carregar('vagas.gestaosemcaos.com.br', '?previa=1').config.MODO, 'supabase');
  const guardada = carregar('localhost', '', { vagas_previa: '1' });
  assert.equal(guardada.config.MODO, 'previa', 'a aba lembra');
  assert.equal(carregar('localhost', '?previa=0', { vagas_previa: '1' }).config.MODO, 'supabase');
  const oficial = carregar('vagas.gestaosemcaos.com.br', '', { vagas_previa: '1' });
  assert.equal(oficial.config.MODO, 'supabase');
  assert.equal(oficial.ss.vagas_previa, undefined, 'no domínio oficial a marca é apagada');
});
