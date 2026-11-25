'use strict';
// Vagas sem Caos v2 · leitura simples do currículo (vagas/js/v2/pessoa/texto-curriculo.js): texto -> campos. Descarta nascimento, idade,
// estado civil, CPF, RG e semelhantes; só AVISA que o arquivo tem isso.
const test = require('node:test');
const assert = require('node:assert/strict');
const { extrair } = require('../vagas/js/v2/pessoa/texto-curriculo.js');

const CIDADES = [
  { id: 'uruacu-go', nome: 'Uruaçu', bairros: ['Centro', 'Vila Nova', 'Setor Sul'] },
  { id: 'campinorte-go', nome: 'Campinorte', bairros: ['Centro', 'Vila Nova'] }
];
const AGORA = new Date('2026-11-25T12:00:00-03:00');
const TEXTO = [
  'JOANA RIBEIRO', 'Currículo', 'Uruaçu - GO · Bairro Vila Nova', 'WhatsApp: (62) 90000-0182 · joana.ribeiro@example.com',
  'Data de nascimento: 12/03/1990', 'Idade: 36 anos de idade', 'Estado civil: solteira', 'CPF 123.456.789-00', 'RG 1234567 SSP-GO', 'Nacionalidade: brasileira', '',
  'Objetivo', 'Cozinheira ou auxiliar de cozinha', '',
  'Experiência profissional', 'Auxiliar de cozinha – Restaurante Beira do Lago', '2021 a 2024', '- Pré-preparo, saladas e lavagem de louça',
  'Cozinheira – Marmitaria Panela de Barro (2024 a hoje)', '- Arroz, feijão, carnes e 80 marmitex por dia', 'Ajudante geral', '',
  'Formação', 'Ensino médio completo', 'CNH categoria B', '', 'Cursos', 'Boas práticas na manipulação de alimentos (16 h)', 'Informática básica'
].join('\n');

test('lê nome, e-mail, telefone, cidade, bairro, função, escolaridade, cursos e CNH', () => {
  const r = extrair(TEXTO, { cidades: CIDADES, agora: AGORA });
  assert.equal(r.nome, 'Joana Ribeiro');
  assert.equal(r.email, 'joana.ribeiro@example.com');
  assert.equal(r.whats, '(62) 90000-0182');
  assert.equal(r.cidade, 'uruacu-go');
  assert.equal(r.bairro, 'Vila Nova');
  assert.equal(r.funcao, 'Cozinheira ou auxiliar de cozinha');
  assert.equal(r.escolaridade, 'Ensino médio completo');
  assert.deepEqual(r.cnh, ['B']);
  assert.deepEqual(r.cursos, ['Boas práticas na manipulação de alimentos (16 h)', 'Informática básica']);
  assert.equal(r.temContato, true);
});

test('experiências saem com cargo, lugar e mês de início e de saída (AAAA-MM); sem data vai para "outras"', () => {
  const r = extrair(TEXTO, { cidades: CIDADES, agora: AGORA });
  assert.deepEqual(r.experiencias, [
    { cargo: 'Auxiliar de cozinha', empresa: 'Restaurante Beira do Lago', inicio: '2021-01', fim: '2024-12' },
    { cargo: 'Cozinheira', empresa: 'Marmitaria Panela de Barro', inicio: '2024-01', fim: null }
  ]);
  assert.deepEqual(r.outras, ['Ajudante geral']);
  assert.equal(r.tempo, 'Mais de 3 anos');
});

test('descarta nascimento, idade, estado civil, CPF, RG e nacionalidade: nada disso entra em nenhum campo', () => {
  const r = extrair(TEXTO, { cidades: CIDADES, agora: AGORA });
  const saida = JSON.stringify(Object.assign({}, r, { sensiveis: [] })).toLowerCase();
  ['1990', '12/03', '36 anos', 'solteira', '123.456.789', 'ssp-go', '1234567', 'brasileira', 'nascimento', 'estado civil'].forEach((p) => assert.ok(saida.indexOf(p) < 0, p + ' vazou: ' + saida));
  assert.deepEqual(r.sensiveis.slice().sort(), ['CPF', 'RG', 'data de nascimento', 'estado civil'].sort());
});

test('datas no futuro ou invertidas não viram experiência inválida; "hoje" deixa a saída em branco', () => {
  const r = extrair(['Maria Souza', 'Experiência', 'Caixa – Mercado', '2030 a 2031', 'Atendente – Loja', '2020 a 2019', 'Vendedora – Loja Azul', '03/2022 a 05/2023'].join('\n'), { cidades: CIDADES, agora: AGORA });
  assert.ok(r.experiencias.every((x) => /^\d{4}-\d{2}$/.test(x.inicio) && (x.fim === null || /^\d{4}-\d{2}$/.test(x.fim))));
  assert.ok(!r.experiencias.some((x) => x.cargo === 'Caixa'));
  const v = r.experiencias.filter((x) => x.cargo === 'Vendedora')[0];
  assert.deepEqual([v.inicio, v.fim], ['2022-03', '2023-05']);
  const at = r.experiencias.filter((x) => x.cargo === 'Atendente')[0];
  assert.equal(at.fim, null);
});

test('CNH: só a categoria, e "CNH de motorista" não inventa letra', () => {
  assert.deepEqual(extrair('Pedro Lima\nCNH: AB', { cidades: CIDADES, agora: AGORA }).cnh, ['A', 'B']);
  assert.deepEqual(extrair('Pedro Lima\nPossuo CNH de motorista profissional', { cidades: CIDADES, agora: AGORA }).cnh, []);
});

test('escolaridade: médio incompleto, superior em andamento e técnico', () => {
  assert.equal(extrair('Ana Paula Dias\nEnsino médio incompleto', { agora: AGORA }).escolaridade, 'Ensino médio incompleto');
  assert.equal(extrair('Ana Paula Dias\nSuperior incompleto em Administração', { agora: AGORA }).escolaridade, 'Superior em andamento');
  assert.equal(extrair('Ana Paula Dias\nTécnico em Enfermagem', { agora: AGORA }).escolaridade, 'Técnico completo');
});

test('cidade fora da lista guarda só o texto; sem texto nenhum devolve campos vazios sem quebrar', () => {
  const r = extrair('Carlos Mota\nMara Rosa - GO', { cidades: CIDADES, agora: AGORA });
  assert.equal(r.cidade, '');
  assert.equal(r.cidadeTexto, 'Mara Rosa - GO');
  const v = extrair('', { agora: AGORA });
  assert.equal(v.nome, ''); assert.deepEqual(v.experiencias, []); assert.deepEqual(v.sensiveis, []);
});

test('nome não pega título nem linha com número ou dado pessoal', () => {
  const r = extrair('CURRÍCULO\nEstado civil casado\n(62) 99999-0000\nLucas Almeida Santos\nObjetivo: vendedor', { agora: AGORA });
  assert.equal(r.nome, 'Lucas Almeida Santos');
  assert.equal(r.funcao, 'vendedor');
});
