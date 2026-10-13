'use strict';
// Código do link de processo (index.html?a=CODIGO ou #a-CODIGO): 10 caracteres nos processos novos, 4 nos antigos
// (que continuam valendo). A MESMA regra em todo lugar: site e tela do candidato (js/api.js), prévia
// (js/api-simulada.js), Apps Script legado (apps-script/Code.gs) e importação da planilha (scripts/migrar-planilha.mjs).
// O cliente Supabase e as Edge Functions estão em tests/api-supabase.test.js e tests/funcoes/montagem.test.js; o banco
// (normalizar_codigo, regra da coluna, sorteio e limite por origem) em tests/supabase/codigos_processo.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const API = require('../js/api.js');
const SIM = require('../js/api-simulada.js');
const { carregarGas } = require('./helpers/gas.js');
const { prng } = require('./helpers/fixtures.js');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RE_NOVO = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;
// [entrada, esperado]
const CASOS = [
  ['SEL1', 'SEL1'], ['sel1', 'SEL1'], [' k7 qz ', 'K7QZ'], [1234, '1234'],
  ['K7QZ3MWR9T', 'K7QZ3MWR9T'], ['k7qz3 mwr9t', 'K7QZ3MWR9T'], ['\tK7QZ3MWR9T\n', 'K7QZ3MWR9T'],
  ['ABC', ''], ['ABCDE', ''], ['ABCDEF', ''], ['K7QZ3MWR9', ''], ['K7QZ3MWR9TX', ''], ['K7QZ3MWR9TK7QZ', ''],
  ['AB-C', ''], ['K7QZ-3MWR9T', ''], ['ÁBCD', ''], ['<script>', ''], ['', ''], [null, ''], [undefined, '']
];

test('js/api.js: aceita 4 (antigos) e 10 (novos) caracteres, minúsculas e espaços; o resto é inválido', () => {
  assert.equal(API.ALFABETO_CODIGO, ALFABETO);
  assert.equal(API.TAMANHO_CODIGO, 10);
  assert.ok(!/[IO01]/.test(API.ALFABETO_CODIGO), 'sem caracteres ambíguos');
  for (const [entrada, esperado] of CASOS) assert.equal(API.normalizarCodigoAvaliacao(entrada), esperado, String(entrada));
});

test('js/api.js: o código vem do link ?a= ou #a- nos dois formatos (a tela do candidato usa esta função)', () => {
  const url = (s, h) => API.codigoAvaliacaoDaUrl(s, h);
  assert.equal(url('?a=K7QZ3MWR9T', ''), 'K7QZ3MWR9T');
  assert.equal(url('?utm=zap&a=k7qz3mwr9t', ''), 'K7QZ3MWR9T');
  assert.equal(url('', '#a-K7QZ3MWR9T'), 'K7QZ3MWR9T');
  assert.equal(url('', '#a-k7qz3mwr9t'), 'K7QZ3MWR9T');
  assert.equal(url('?a=K7QZ%203MWR9T', ''), 'K7QZ3MWR9T', 'espaço codificado (link quebrado no WhatsApp)');
  assert.equal(url('?a=SEL1', ''), 'SEL1');
  assert.equal(url('', '#a-EQP1'), 'EQP1');
  assert.equal(url('?a=K7QZ3MWR9T', '#a-SEL1'), 'K7QZ3MWR9T', '?a= tem prioridade');
  assert.equal(url('?a=K7QZ3MWR9', ''), '', '9 caracteres: link mal formado');
  assert.equal(url('?a=K7QZ3MWR9TX', ''), '');
  assert.equal(url('?a=%E0%A4%A', ''), '');
  assert.equal(url('', ''), '');
});

test('prévia e Apps Script: mesma normalização do site (e o apóstrofo da planilha sai)', () => {
  const gas = carregarGas().g;
  for (const [entrada, esperado] of CASOS) {
    assert.equal(SIM.normalizarCodigoAvaliacao(entrada), esperado, 'prévia: ' + entrada);
    assert.equal(gas.normalizarCodigoAvaliacao(entrada), esperado, 'Code.gs: ' + entrada);
  }
  assert.equal(SIM.normalizarCodigoAvaliacao("'K7QZ3MWR9T"), 'K7QZ3MWR9T');
  assert.equal(gas.normalizarCodigoAvaliacao("'SEL1"), 'SEL1');
});

test('prévia e Apps Script: código novo tem 10 caracteres do alfabeto e nunca repete um usado', () => {
  const gas = carregarGas().g;
  for (const gerar of [SIM.gerarCodigoAvaliacao, gas.gerarCodigoAvaliacao]) {
    const usados = {};
    const rnd = prng(2026);
    for (let i = 0; i < 300; i++) {
      const c = gerar(usados, rnd);
      assert.match(c, RE_NOVO);
      assert.equal(usados[c], undefined, 'repetiu ' + c);
      usados[c] = true;
    }
    // Com o sorteio fixo: o primeiro candidato já usado é pulado.
    const r1 = prng(7);
    const primeiro = gerar({}, r1);
    const r2 = prng(7);
    const segundo = gerar({ [primeiro]: true }, r2);
    assert.match(segundo, RE_NOVO);
    assert.notEqual(segundo, primeiro);
    // Sorteio "travado" (sempre o mesmo número): desiste com a mensagem de sempre.
    const travado = () => 0.5;
    const unico = gerar({}, travado);
    assert.throws(() => gerar({ [unico]: true }, travado), /Não foi possível gerar um código novo/);
  }
  // Sem sorteio informado: a prévia usa Math.random; o Apps Script, o UUID aleatório (Utilities.getUuid — no teste, o
  // UUID falso do tests/helpers/gas.js). Os dois espalham pelo alfabeto todo.
  const cods = [];
  for (let i = 0; i < 50; i++) cods.push(gas.gerarCodigoAvaliacao({}), SIM.gerarCodigoAvaliacao({}));
  cods.forEach((c) => assert.match(c, RE_NOVO));
  assert.equal(new Set(cods).size, cods.length);
  assert.equal(new Set(cods.join('').split('')).size, 32);
});

test('importação da planilha: avaliações com código de 4 ou 10 caracteres', async () => {
  const M = await import(path.join(__dirname, '..', 'scripts', 'migrar-planilha.mjs'));
  const proc = (codigo) => ({ id: 'ava_1', codigo, nome: 'Recepção', tipo: 'selecao', empresa: 'Clínica', ativa: 'TRUE', mostrarResultado: 'FALSE', config: '' });
  const r10 = M.converterProcessos([proc('K7QZ3MWR9T')]);
  const r4 = M.converterProcessos([proc('SEL1')]);
  const r9 = M.converterProcessos([proc('K7QZ3MWR9')]);
  assert.equal(r10.total, 1);
  assert.match(r10.comandos[0], /values \('K7QZ3MWR9T', 'Recepção'/);
  assert.equal(r4.total, 1);
  assert.match(r4.comandos[0], /values \('SEL1', /);
  assert.equal(r9.total, 0);
  assert.match(r9.avisos[0], /código "K7QZ3MWR9" inválido/);
});
