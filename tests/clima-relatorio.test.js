'use strict';
// Relatório de clima (js/relatorio-view.js, modelo 'clima') e funções puras do painel (js/admin-clima.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/relatorio-view.js');
const C = require('../js/clima.js');
const AC = require('../js/admin-clima.js');

function todos(v) { const it = {}; C.BLOCOS.forEach((b) => b.itens.forEach((i) => { it[i.id] = v; })); it.H1 = v; return it; }
function resultado(tamanhos, extra) {
  const equipes = tamanhos.map((n, i) => ({ id: 'e' + (i + 1), nome: 'Equipe ' + (i + 1), area: '', ordem: i, convidados: n + 2 }));
  const respostas = [];
  tamanhos.forEach((n, i) => { for (let j = 0; j < n; j++) respostas.push({ equipeId: 'e' + (i + 1), papel: 'membro', itens: Object.assign(todos(2 + (j % 3)), { N1: 2, N2: 3, N3: 4, N5: 4, N4: j === 0 ? 2 : 1 }) }); });
  return C.calcular(Object.assign({ equipes, respostas, complemento: true, n4: true }, extra || {}));
}
function snapshot(res, extra) {
  return Object.assign({ modelo: 'clima', versao: 1, titulo: 'Pesquisa de clima · Empresa X', geradoEm: '2026-10-10T12:00:00.000Z',
    empresa: { nome: 'Empresa X', cidade: 'Boa Vista' }, consultor: 'Consultor', rodada: { nome: 'Clima', abertaEm: '2026-09-01T12:00:00.000Z',
      encerradaEm: '2026-09-20T12:00:00.000Z', complemento: true, n4Ligado: true, canalTexto: 'o RH', canalUrl: '', versaoItens: 'v0' },
    resultado: C.visaoCliente(res), temas: ['Reuniões longas'] }, extra || {});
}
const textoDe = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('relatório de clima: capítulos da decisão 5.3, textos fixos, faixas, intervenções e plano', () => {
  const html = V.montarHtml(snapshot(resultado([11, 6, 2])));
  const secoes = [...html.matchAll(/data-secao="([a-z-]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
  assert.deepEqual(secoes, ['capa', 'indice', 'como-ler', 'resumo', 'grupos', 'fatores', 'comentarios', 'plano', 'pgr', 'metodo', 'rodape']);
  const t = textoDe(html);
  assert.ok(t.includes(C.TEXTOS.abertura));
  assert.ok(t.includes(C.TEXTOS.faixas));
  assert.ok(t.includes(C.TEXTOS.origem));
  assert.ok(t.includes(C.TEXTOS.nr1));
  assert.ok(t.includes(C.TEXTOS.usoProibido));
  assert.ok(t.includes('Outras equipes'));
  assert.ok(t.includes('Reúne: Equipe 2, Equipe 3.'));
  assert.ok(t.includes('Reuniões longas'));
  assert.ok(t.includes('Plano de 30, 60 e 90 dias'));
  assert.ok(t.includes('Severidade'), 'anexo PGR com campos para preencher');
  assert.ok(/data-intervencao="[a-zA-Z]+"/.test(html));
  assert.ok(!/índice geral|ranking de equipes/i.test(t));
  C.PALAVRAS_PROIBIDAS.forEach((p) => assert.ok(!t.toLowerCase().includes(p), 'palavra proibida: ' + p));
});

test('relatório de clima: sem complemento não há fatores nem anexo PGR; empresa abaixo de 5 = aviso; comentários só com 10+', () => {
  const sem = V.montarHtml(snapshot(resultado([6, 6], { complemento: false }), { rodada: { complemento: false, n4Ligado: false } }));
  assert.ok(!sem.includes('data-secao="fatores"') && !sem.includes('data-secao="pgr"'));
  assert.ok(sem.includes('data-secao="comentarios"'), '12 respostas: comentários (temas) entram');
  const pouca = V.montarHtml(snapshot(resultado([2, 2]), { temas: [] }));
  assert.ok(textoDe(pouca).includes('Respostas insuficientes'));
  assert.ok(!pouca.includes('data-secao="comentarios"'));
  const nove = V.montarHtml(snapshot(resultado([9])));
  assert.ok(!nove.includes('data-secao="comentarios"'), 'com 9 respostas não há temas de comentários');
  assert.ok(textoDe(nove).includes(C.TEXTOS.margem));
});

test('relatório de clima: tudo escapado (nomes de equipe e temas)', () => {
  const res = resultado([6, 6]);
  res.grupos[1].nome = '<img src=x onerror=alert(1)>';
  const html = V.montarHtml(snapshot(res, { temas: ['<script>alert(1)</script>'], empresa: { nome: '"><b>X</b>' } }));
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<b>X</b>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('painel: líderes do organograma em pré-ordem a partir do topo, só quem lidera alguém ativo', () => {
  const col = (id, nome, area, status) => ({ pessoaId: id, nome, cargo: 'C', area, status: status || 'ativo' });
  const colaboradores = [col('m', 'Marta Diretora', 'Diretoria'), col('d', 'Diego Vendas', 'Comercial'), col('p', 'Paulo Atende', 'Atendimento'),
    col('c', 'Carla', 'Comercial'), col('l', 'Lucas', 'Comercial'), col('r', 'Renata', 'Atendimento'), col('x', 'Xis Desligado', '', 'desligado')];
  const relacoes = [{ de: 'm', para: 'p', tipo: 'lidera' }, { de: 'm', para: 'd', tipo: 'lidera' }, { de: 'd', para: 'c', tipo: 'lidera' },
    { de: 'd', para: 'l', tipo: 'lidera' }, { de: 'p', para: 'r', tipo: 'lidera' }, { de: 'p', para: 'x', tipo: 'lidera' }, { de: 'c', para: 'l', tipo: 'direto' }];
  assert.deepEqual(AC.lideresDoOrganograma(colaboradores, relacoes, ['m']).map((l) => [l.pessoaId, l.liderados, l.area]),
    [['m', 2, 'Diretoria'], ['d', 2, 'Comercial'], ['p', 1, 'Atendimento']]);
  assert.deepEqual(AC.lideresDoOrganograma(colaboradores, [], []), []);
});

test('painel: convites, avisos da pesquisa aberta e situação das equipes', () => {
  const link = AC.linkClima('https://site.com/painel/admin.html#empresa/x/clima', 'a'.repeat(64));
  assert.equal(link, 'https://site.com/painel/clima.html?t=' + 'a'.repeat(64));
  const m = AC.mensagemConvite('Clínica Exemplo', link, 'membro');
  assert.ok(m.includes('anônima e voluntária') && m.includes(link) && m.includes('Gestão sem Caos') && !/notus/i.test(m));
  assert.ok(AC.mensagemConvite('Clínica Exemplo', link, 'lider').includes('não envie para a equipe'));
  const av = AC.avisosAberta({ status: 'aberta', respondentes: 7, convidados: 20, equipes: [{ nome: 'Equipe A', respondentes: 6 }, { nome: 'Equipe B', respondentes: 1 }] });
  assert.equal(av.length, 2);
  assert.ok(av[0].startsWith('Equipe B: 1 resposta.'));
  assert.ok(av[1].includes('Adesão de 35%'));
  assert.deepEqual(AC.avisosAberta({ status: 'encerrada' }), []);
  const res = resultado([11, 6, 2]);
  assert.deepEqual(res.equipes.map((e) => AC.textoSituacao(e, res.grupos)), ['Aparece no relatório.',
    'Fundida em "Outras equipes" para proteger o anonimato de uma equipe pequena (regra do complemento).',
    'Fundida em "Outras equipes": menos de 5 respostas.']);
  const area = C.calcular({ equipes: [{ id: 'a', nome: 'A', area: 'X', ordem: 0, convidados: 9 }, { id: 'b', nome: 'B', area: 'X', ordem: 1, convidados: 9 },
    { id: 'c', nome: 'C', area: 'Y', ordem: 2, convidados: 9 }], respostas: [8, 3, 9].flatMap((n, i) => Array.from({ length: n }, () => ({ equipeId: 'abc'[i], papel: 'membro', itens: todos(4) }))) });
  assert.equal(AC.textoSituacao(area.equipes[1], area.grupos), 'Não aparece sozinha: menos de 5 respostas (conta só no total de X).');
});

test('painel: a prévia em nova aba usa o mesmo snapshot do servidor (visão do cliente, temas só com 10+)', () => {
  const res = resultado([11, 6, 2]);
  const snap = AC.snapshotPrevia({ nome: 'Clima', abertaEm: 'a', encerradaEm: 'b', complemento: true, n4: true, canalTexto: 'RH', canalUrl: '', versaoItens: 'v0' },
    res, { nome: 'Empresa X', cidade: '' }, ['  ', 'Tema 1'], 'Consultor');
  assert.deepEqual(snap.resultado, C.visaoCliente(res));
  assert.deepEqual(snap.temas, ['Tema 1']);
  assert.equal(snap.rodada.n4Ligado, true);
  assert.equal(snap.resultado.lideres, undefined);
  assert.deepEqual(AC.snapshotPrevia({}, resultado([9]), { nome: 'E' }, ['Tema'], '').temas, []);
});
