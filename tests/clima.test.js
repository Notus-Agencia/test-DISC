'use strict';
// Pesquisa de Clima (js/clima.js): itens, telas, validação do envio, cálculo (recodificação, mínimo de itens, 0–100, rwg,
// faixas), supressão (k = 5 e 10, complemento, "Outras equipes", área × equipe, por dimensão), visão do cliente,
// intervenções e textos obrigatórios. O banco faz a mesma conta (tests/supabase/clima.test.js confere SQL × JS).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../js/clima.js');

function todos(v) {
  const it = {};
  C.BLOCOS.forEach((b) => b.itens.forEach((i) => { it[i.id] = v; }));
  it.H1 = v;
  return it;
}
function membro(eq, itens, extra) { return Object.assign({ equipeId: eq, papel: 'membro', itens }, extra || {}); }
function eqs(tamanhos, areas) {
  return tamanhos.map((n, i) => ({ id: 'e' + (i + 1), nome: 'Equipe ' + (i + 1), area: (areas || [])[i] || '', ordem: i, convidados: Math.max(1, n + 1) }));
}
function respostas(tamanhos, gerar) {
  const out = [];
  tamanhos.forEach((n, i) => { for (let j = 0; j < n; j++) out.push(membro('e' + (i + 1), gerar ? gerar(i, j) : todos(4))); });
  return out;
}
const grupo = (r, id) => r.grupos.filter((g) => g.id === id)[0];

test('itens v0: 25 fechados no núcleo (5 invertidos), 3 do líder, 5 do complemento; escala com rótulo', () => {
  const nucleo = [];
  C.BLOCOS.forEach((b) => b.itens.forEach((i) => nucleo.push(i)));
  assert.equal(nucleo.length + 1, 25, 'A5 + B4 + C3 + D3 + E3 + F3 + G3 + H1');
  assert.deepEqual(nucleo.filter((i) => i.invertido).map((i) => i.id), ['A3', 'B4', 'D1', 'D2', 'G3']);
  assert.deepEqual(C.BLOCOS.map((b) => [b.id, b.minimo]), [['A', 3], ['B', 2], ['C', 2], ['D', 2], ['E', 2], ['F', 2], ['G', 2]]);
  assert.deepEqual(C.ITENS_LIDER.map((i) => i.id), ['FL1', 'FL2', 'FL3']);
  assert.deepEqual(C.ITENS_N.map((i) => i.id), ['N1', 'N2', 'N3', 'N4', 'N5']);
  assert.deepEqual(C.ESCALA.map((x) => x.rotulo), ['Discordo totalmente', 'Discordo', 'Nem concordo nem discordo', 'Concordo', 'Concordo totalmente']);
  assert.deepEqual(C.ESCALA_N4.map((x) => x.rotulo), ['Nunca', 'Uma ou duas vezes', 'Três vezes ou mais', 'Prefiro não responder']);
  assert.equal(C.item('A3').invertido, true);
  assert.equal(C.item('N4').escala, 'frequencia');
  assert.equal(C.item('H2').escala, 'aberta');
  assert.equal(C.item('ZZ'), null);
});

test('telas: uma por bloco; membro A–G, H (com comentário) e N só com o complemento (N4 só com canal); líder sem G/N, com FL', () => {
  assert.deepEqual(C.telas('membro').map((t) => t.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  assert.equal(C.telas('membro').filter((t) => t.id === 'F')[0].topo, 'Seu líder é a pessoa a quem você responde no dia a dia.');
  assert.equal(C.telas('membro').filter((t) => t.id === 'H')[0].comentario, true);
  assert.deepEqual(C.telas('membro', { complemento: true }).pop().itens, ['N1', 'N2', 'N3', 'N5']);
  assert.deepEqual(C.telas('membro', { complemento: true, n4: true }).pop().itens, ['N1', 'N2', 'N3', 'N4', 'N5']);
  assert.deepEqual(C.telas('membro', { complemento: false, n4: true }).map((t) => t.id).indexOf('N'), -1, 'N4 sem complemento não liga');
  const lider = C.telas('lider', { complemento: true, n4: true });
  assert.deepEqual(lider.map((t) => t.id), ['A', 'B', 'C', 'D', 'E', 'FL', 'H']);
  assert.deepEqual(lider[5].itens, ['FL1', 'FL2', 'FL3']);
  assert.equal(lider[6].comentario, false);
});

test('validarEnvio: só itens do formulário, valores inteiros na escala, pular = null, chave obrigatória, vazio recusado', () => {
  const k = 'a'.repeat(32);
  const ok = C.validarEnvio({ itens: { A1: 4, A3: null, N4: 0 }, comentario: '  Mais\u0007  reuniões \n\n\n\ncurtas ', segundos: 99999, chave: k }, 'membro', { complemento: true, n4: true });
  assert.deepEqual(ok, { ok: true, itens: { A1: 4, N4: 0 }, comentario: 'Mais reuniões\n\ncurtas', segundos: 86400, chave: k });
  const ruim = (corpo, papel, op) => C.validarEnvio(corpo, papel || 'membro', op).erro;
  assert.equal(ruim({ itens: { N4: 1 }, chave: k }, 'membro', { complemento: true }), 'Respostas em formato inválido.', 'N4 sem canal');
  assert.equal(ruim({ itens: { N1: 3 }, chave: k }), 'Respostas em formato inválido.', 'N sem complemento');
  assert.equal(ruim({ itens: { FL1: 3 }, chave: k }), 'Respostas em formato inválido.');
  assert.equal(ruim({ itens: { G1: 3 }, chave: k }, 'lider'), 'Respostas em formato inválido.');
  assert.equal(ruim({ itens: { A1: 0 }, chave: k }), 'Respostas em formato inválido.');
  assert.equal(ruim({ itens: { A1: 3.5 }, chave: k }), 'Respostas em formato inválido.');
  assert.equal(ruim({ itens: { A1: '3' }, chave: k }), 'Respostas em formato inválido.');
  assert.equal(ruim({ itens: { H2: 'x' }, chave: k }), 'Respostas em formato inválido.');
  assert.equal(ruim({ itens: { A1: 3 } }), 'Respostas em formato inválido.');
  assert.equal(ruim({ itens: { A1: 3 }, chave: 'xyz' }), 'Respostas em formato inválido.');
  assert.equal(ruim({ itens: { A1: 3 }, segundos: -2, chave: k }), 'Respostas em formato inválido.');
  assert.equal(ruim(null), 'Respostas em formato inválido.');
  assert.equal(ruim({ itens: { A1: null }, comentario: '   ', chave: k }), 'Responda pelo menos uma pergunta antes de enviar.');
  assert.equal(C.validarEnvio({ comentario: 'só o comentário', chave: k }, 'membro').ok, true);
  assert.equal(C.validarEnvio({ itens: { FL1: 5 }, comentario: 'ignorado', chave: k }, 'lider').comentario, '', 'líder não comenta');
  assert.equal(C.validarEnvio({ comentario: 'x'.repeat(1500), chave: k }, 'membro').comentario.length, 1000);
});

test('cálculo por pessoa: recodificação (6 − x), mínimo de metade do bloco, escala 0–100, F do líder = FL', () => {
  // A: 3 de 5 respondidos é o mínimo; A3 invertido (5 vira 1).
  assert.ok(Math.abs(C.escoresRespondente({ A1: 5, A2: 5, A3: 5 }, 'membro').A - (((5 + 5 + 1) / 3) - 1) * 25) < 1e-9);
  assert.equal(C.escoresRespondente({ A1: 5, A2: 5 }, 'membro').A, null, 'A com 2 de 5: ausente');
  assert.equal(C.escoresRespondente({ B1: 1, B4: 1 }, 'membro').B, ((1 + 5) / 2 - 1) * 25, 'B com 2 de 4 vale; B4 invertido');
  assert.equal(C.escoresRespondente({ C1: 3 }, 'membro').C, null, 'C com 1 de 3: ausente');
  assert.equal(C.escoresRespondente({ G1: 5, G2: 5, G3: 1 }, 'membro').G, 100);
  assert.equal(C.escoresRespondente({ D1: 5, D2: 5, D3: 1 }, 'membro').D, 0);
  assert.equal(C.escoresRespondente({ H1: 3 }, 'membro').H1, 50);
  assert.equal(C.escoresRespondente({ F1: 5, F2: 5, FL1: 1, FL2: 1 }, 'lider').F, 0, 'líder: F vem do FL');
  assert.equal(C.escoresRespondente({ F1: 5, F2: 5, FL1: 1, FL2: 1 }, 'membro').F, 100);
  assert.equal(C.escoresRespondente({ A1: 7, A2: 'x', A4: 2.5 }, 'membro').A, null, 'valor fora da escala não conta');
});

test('faixas 0–100 (75 e 50) e rótulos de alinhamento (0,70 e 0,50)', () => {
  assert.deepEqual([100, 75, 74, 50, 49, 0].map(C.faixa), ['favoravel', 'favoravel', 'intermediario', 'intermediario', 'atencao', 'atencao']);
  assert.equal(C.rotuloFaixa('atencao'), 'Ponto de atenção');
  assert.equal(C.leituraFaixa('favoravel'), 'A equipe relata uma boa experiência neste tema.');
  assert.equal(C.rotuloAlinhamento('divididas'), 'Opiniões divididas');
  assert.equal(C.TEXTOS.faixas, 'Faixas de referência provisórias, definidas pela escala de resposta. Não são normas nem comparação com outras empresas.');
});

test('rwg(j) com σ² = 2: unanimidade = 1; metade 1 e metade 5 = 0; caso calculado à mão; AD', () => {
  const mk = (vals) => vals.map((v) => ({ itens: todos(v), escores: C.escoresRespondente(todos(v), 'membro') }));
  assert.deepEqual(C.alinhamento(mk([4, 4, 4, 4, 4]), 'C'), { rwg: 1, alinhamento: 'alinhada', ad: 0 });
  assert.deepEqual(C.alinhamento(mk([1, 5, 1, 5, 1, 5]), 'C'), { rwg: 0, alinhamento: 'divididas', ad: 2 });
  // C (3 itens) com respostas 3,4,3,4: variância amostral de cada item = 1/3; s̄²/σ² = 1/6;
  // rwg = 3·(5/6) / (3·(5/6) + 1/6) = 2,5 / 2,6667 = 0,9375 -> 0,94. AD = 0,5.
  assert.deepEqual(C.alinhamento(mk([3, 4, 3, 4]), 'C'), { rwg: 0.94, alinhamento: 'alinhada', ad: 0.5 });
  // Item com menos de 2 respostas não entra; sem nenhum item com 2+, sem alinhamento.
  assert.equal(C.alinhamento(mk([3]), 'C'), null);
});

test('supressão: 4 equipes × 5 respondentes — todas aparecem; distribuição só na empresa (20)', () => {
  const r = C.calcular({ equipes: eqs([5, 5, 5, 5]), respostas: respostas([5, 5, 5, 5]) });
  assert.deepEqual(r.grupos.map((g) => [g.id, g.n]), [['empresa', 20], ['e1', 5], ['e2', 5], ['e3', 5], ['e4', 5]]);
  assert.ok(grupo(r, 'empresa').dimensoes.A.distribuicao, 'empresa com 20: distribuição');
  ['e1', 'e2', 'e3', 'e4'].forEach((id) => {
    assert.ok(grupo(r, id).dimensoes.A.escore >= 0);
    assert.equal(grupo(r, id).dimensoes.A.distribuicao, null, 'equipe com 5: sem distribuição');
  });
  assert.equal(r.taxa, 83);
  assert.ok(r.equipes.every((e) => e.situacao === 'aparece'));
});

test('supressão: equipe com menos de 5 vai para "Outras equipes" (que também precisa de 5) e o complemento esconde mais uma', () => {
  // 11 + 6 + 2: o resto (2) isolaria a equipe pequena -> a menor que aparece (6) vai junto para "Outras equipes" (8).
  const r = C.calcular({ equipes: eqs([11, 6, 2]), respostas: respostas([11, 6, 2]) });
  assert.deepEqual(r.grupos.map((g) => [g.id, g.tipo, g.n]), [['empresa', 'empresa', 19], ['e1', 'equipe', 11], ['outras:empresa', 'outras', 8]]);
  assert.deepEqual(grupo(r, 'outras:empresa').equipes, ['Equipe 2', 'Equipe 3']);
  assert.deepEqual(r.equipes.map((e) => [e.situacao, e.motivo, e.grupo]),
    [['aparece', '', 'e1'], ['outras', 'complemento', 'outras:empresa'], ['outras', 'minimo', 'outras:empresa']]);
  // Distribuição (k >= 10): empresa 19 − e1 11 = 8 < 10 -> some da e1.
  assert.ok(grupo(r, 'empresa').dimensoes.A.distribuicao);
  assert.equal(grupo(r, 'e1').dimensoes.A.distribuicao, null);
  assert.equal(grupo(r, 'outras:empresa').convidados, undefined, 'sem taxa por equipe dentro de "Outras"');
  // Só a empresa abaixo de 5: nada aparece.
  const pouca = C.calcular({ equipes: eqs([2, 2]), respostas: respostas([2, 2]) });
  assert.equal(pouca.suprimido, true);
  assert.deepEqual(pouca.grupos, []);
  assert.deepEqual(pouca.equipes.map((e) => e.motivo), ['empresa', 'empresa']);
});

test('supressão: área menos equipe < 5 esconde a equipe (fica só a área); área = rótulo com 2+ equipes e não todas', () => {
  const r = C.calcular({ equipes: eqs([8, 3, 9], ['Comercial', 'Comercial', 'Atendimento']), respostas: respostas([8, 3, 9]) });
  assert.deepEqual(r.grupos.map((g) => [g.id, g.nivel, g.n]), [['empresa', 0, 20], ['area:Comercial', 1, 11], ['e3', 1, 9]]);
  assert.deepEqual(grupo(r, 'area:Comercial').equipes, ['Equipe 1', 'Equipe 2']);
  assert.deepEqual(r.equipes.map((e) => [e.situacao, e.motivo, e.grupo]),
    [['nao_aparece', 'complemento', 'area:Comercial'], ['nao_aparece', 'minimo', 'area:Comercial'], ['aparece', '', 'e3']]);
  // Com 6 + 5 na área: as duas aparecem; área = soma, resto 0.
  const r2 = C.calcular({ equipes: eqs([6, 5, 9], ['Comercial', 'Comercial', 'Atendimento']), respostas: respostas([6, 5, 9]) });
  assert.deepEqual(r2.grupos.map((g) => g.id), ['empresa', 'area:Comercial', 'e1', 'e2', 'e3']);
  // Com "Outras equipes" dentro da área: 7 + 3 + 3 -> e1 aparece, Outras da área (6).
  const r3 = C.calcular({ equipes: eqs([7, 3, 3, 9], ['Comercial', 'Comercial', 'Comercial', 'Atendimento']), respostas: respostas([7, 3, 3, 9]) });
  assert.deepEqual(r3.grupos.map((g) => [g.id, g.n]), [['empresa', 22], ['area:Comercial', 13], ['e1', 7], ['outras:area:Comercial', 6], ['e4', 9]]);
  // Todas as equipes no mesmo rótulo: a área seria a empresa inteira -> não vira recorte.
  const r4 = C.calcular({ equipes: eqs([6, 6], ['Comercial', 'Comercial']), respostas: respostas([6, 6]) });
  assert.deepEqual(r4.grupos.map((g) => g.id), ['empresa', 'e1', 'e2']);
});

test('supressão por dimensão: quem pulou conta; o resto da dimensão também precisa de 5', () => {
  // e1: 6 pessoas, só 4 com F; e2: 6 com F. Empresa F = 10; e1 some (4); e2 também (10 − 6 = 4 isolaria e1).
  const semF = (i, j) => { const it = todos(4); if (i === 0 && j < 2) { delete it.F1; delete it.F2; delete it.F3; } return it; };
  const r = C.calcular({ equipes: eqs([6, 6]), respostas: respostas([6, 6], semF) });
  assert.equal(grupo(r, 'empresa').dimensoes.F.n, 10);
  assert.equal(grupo(r, 'e1').dimensoes.F, null);
  assert.equal(grupo(r, 'e2').dimensoes.F, null);
  assert.equal(grupo(r, 'e1').dimensoes.A.n, 6, 'as outras dimensões continuam');
  assert.equal(grupo(r, 'e2').dimensoes.A.n, 6);
});

test('unanimidade: escore, faixa, "equipe alinhada" e distribuição 100/0/0 (k >= 10)', () => {
  const r = C.calcular({ equipes: eqs([12]), respostas: respostas([12], () => todos(5)) });
  const a = grupo(r, 'empresa').dimensoes.C;
  assert.deepEqual(a, { n: 12, escore: 100, faixa: 'favoravel', rwg: 1, alinhamento: 'alinhada', ad: 0, distribuicao: { favoravel: 100, intermediario: 0, atencao: 0 } });
  // A com todos 5: A3 invertido vira 1 -> média 4,2 -> 80.
  assert.equal(grupo(r, 'empresa').dimensoes.A.escore, 80);
  assert.equal(grupo(r, 'empresa').h1.escore, 100);
  assert.equal(r.qualidade.linhaReta, 12, '"linha reta" inclusive nos invertidos é sinalizada (só para o consultor)');
});

test('complemento N: k >= 10 na empresa e áreas, nunca por equipe; com 9 não aparece; N4 só no total da empresa', () => {
  const comN = (i, j) => Object.assign(todos(4), { N1: 2, N2: 3, N3: 4, N5: 5, N4: j === 0 ? 3 : (j === 1 ? 0 : 1) });
  const nove = C.calcular({ equipes: eqs([9]), respostas: respostas([9], comN), complemento: true, n4: true });
  assert.deepEqual(nove.complemento.grupos, [{ id: 'empresa', nome: 'Toda a empresa', itens: { N1: null, N2: null, N3: null, N5: null } }]);
  assert.equal(nove.complemento.n4, null);
  const r = C.calcular({ equipes: eqs([12, 6, 11], ['Comercial', 'Comercial', 'Atendimento']), respostas: respostas([12, 6, 11], comN), complemento: true, n4: true });
  assert.deepEqual(r.complemento.grupos.map((g) => g.id), ['empresa', 'area:Comercial']);
  assert.deepEqual(r.complemento.grupos[0].itens.N1, { n: 29, escore: 25, faixa: 'atencao' });
  assert.deepEqual(r.complemento.grupos[1].itens.N5, { n: 18, escore: 100, faixa: 'favoravel' });
  // N4: "prefiro não responder" fora do denominador; relato = uma ou duas vezes / três ou mais.
  assert.deepEqual(r.complemento.n4, { n: 26, pct: 12 });
  // Sem canal de escuta, o N4 não liga.
  assert.equal(C.calcular({ equipes: eqs([12]), respostas: respostas([12], comN), complemento: true, n4: false }).complemento.n4, null);
  // Sem complemento, nada de N.
  assert.deepEqual(C.calcular({ equipes: eqs([12]), respostas: respostas([12], comN) }).complemento, { ligado: false, n4Ligado: false, grupos: [], n4: null });
});

test('líder: não entra na média da equipe; visão do líder só de equipes que aparecem (e nunca no relatório do cliente)', () => {
  const lider = (eq) => ({ equipeId: eq, papel: 'lider', itens: Object.assign({}, ...C.telas('lider').map((t) => Object.fromEntries(t.itens.map((id) => [id, 1])))) });
  const resp = respostas([6, 2]).concat([lider('e1'), lider('e2')]);
  const r = C.calcular({ equipes: eqs([6, 2]), respostas: resp });
  assert.equal(r.respondentes, 8, 'líderes fora da contagem');
  assert.equal(grupo(r, 'empresa').n, 8);
  assert.deepEqual(r.lideres, [], 'resto 2 esconde a e1: nenhuma visão de líder');
  const r2 = C.calcular({ equipes: eqs([6, 5]), respostas: respostas([6, 5]).concat([lider('e1')]) });
  assert.equal(r2.lideres.length, 1);
  // Líder com tudo 1: invertidos viram 5 (A3; B4; D1 e D2), o resto fica 1.
  assert.deepEqual(r2.lideres[0], { equipeId: 'e1', dimensoes: { A: 20, B: 25, C: 0, D: 67, E: 0, F: 0, G: null }, h1: 0 });
  assert.equal(grupo(r2, 'e1').dimensoes.C.escore, 75, 'média da equipe sem o líder');
  const cli = C.visaoCliente(r2);
  assert.equal(cli.lideres, undefined);
  assert.equal(cli.qualidade, undefined);
  assert.equal(cli.grupos[0].dimensoes.A.ad, undefined);
});

test('visão do cliente: contagens só das equipes que aparecem', () => {
  const r = C.calcular({ equipes: eqs([11, 6, 2]), respostas: respostas([11, 6, 2]) });
  const cli = C.visaoCliente(r);
  assert.deepEqual(cli.equipes.map((e) => Object.keys(e).sort()), [
    ['area', 'convidados', 'grupo', 'id', 'motivo', 'nome', 'ordem', 'respondentes', 'situacao', 'taxa'],
    ['area', 'grupo', 'id', 'motivo', 'nome', 'ordem', 'situacao'],
    ['area', 'grupo', 'id', 'motivo', 'nome', 'ordem', 'situacao']]);
  assert.equal(r.equipes[2].respondentes, 2, 'o consultor vê a contagem');
});

test('ordem fixa do organograma (nunca ranking): grupos seguem a ordem das equipes, não o escore', () => {
  const r = C.calcular({ equipes: eqs([6, 6, 6]), respostas: respostas([6, 6, 6], (i) => todos([2, 5, 3][i])) });
  assert.deepEqual(r.grupos.map((g) => g.id), ['empresa', 'e1', 'e2', 'e3']);
});

test('suprimir: regra genérica da árvore (resto 0 ou >= k; esconde o menor; empate pelo de maior ordem)', () => {
  const nos = [{ id: 'E', pai: '', ordem: 0 }, { id: 'X', pai: 'E', ordem: 1 }, { id: 'Y', pai: 'E', ordem: 2 }, { id: 'Z', pai: 'E', ordem: 3 }];
  const base = { E: true, X: true, Y: true, Z: true };
  assert.deepEqual(C.suprimir(nos, { E: 17, X: 6, Y: 6, Z: 5 }, base, 5), { E: true, X: true, Y: true, Z: true });
  assert.deepEqual(C.suprimir(nos, { E: 15, X: 6, Y: 6, Z: 3 }, base, 5), { E: true, X: true, Y: false, Z: false }, 'empate: some o de maior ordem');
  assert.deepEqual(C.suprimir(nos, { E: 4, X: 4, Y: 0, Z: 0 }, base, 5), { E: false, X: false, Y: false, Z: false });
  assert.deepEqual(C.suprimir(nos, { E: 20, X: 10, Y: 10, Z: 0 }, { E: true, X: true, Y: false, Z: true }, 5), { E: true, X: true, Y: false, Z: false });
});

test('intervenções por resultado (2 ou 3, com base citada) e plano 30/60/90', () => {
  const fav = () => Object.assign(todos(5), { A3: 1, B4: 1, D1: 1, D2: 1, G3: 1 });   // tudo favorável (invertidos em 1)
  const r = C.calcular({ equipes: eqs([12]), respostas: respostas([12], () => {
    const it = fav();
    ['B1', 'B2', 'B3'].forEach((k) => { it[k] = 1; }); it.B4 = 5;     // clareza muito baixa
    ['G1', 'G2'].forEach((k) => { it[k] = 2; }); it.G3 = 4;            // carga baixa
    return Object.assign(it, { N4: 2, N1: 4 });
  }), complemento: true, n4: true });
  const iv = C.intervencoes(r);
  assert.deepEqual(iv.map((x) => x.id), ['metas', 'carga', 'debrief', 'canal']);
  assert.equal(iv[0].base, 'Kleingeld, van Mierlo & Arends, 2011');
  assert.equal(iv[3].prioridade, 'alta');
  // Tudo favorável: nenhuma intervenção obrigatória.
  assert.deepEqual(C.intervencoes(C.calcular({ equipes: eqs([6]), respostas: respostas([6], fav) })), []);
  assert.deepEqual(C.PLANO_30_60_90.map((p) => p.momento), ['Dias 0 a 10', 'Dia 30', 'Dia 60', 'Dia 90', 'Mês 6', 'Depois']);
  // Temas: melhores e para priorizar, sem repetir.
  const t = C.temasOrdenados(grupo(r, 'empresa'));
  assert.equal(t.priorizar[0], 'B');
  assert.ok(t.melhores.every((d) => t.priorizar.indexOf(d) === -1));
});

test('textos obrigatórios: aviso ao respondente (6.1), líder, N4, fixos do relatório (6.2) e marca Gestão sem Caos', () => {
  const av = C.avisoRespondente({ empresa: 'Clínica Exemplo', complemento: true, retencaoDias: 90, contatoDados: 'rh@clinica.com' });
  assert.equal(av.titulo, 'Pesquisa de Clima da Equipe · Clínica Exemplo');
  const txt = av.paragrafos.map((p) => p.rotulo + ' ' + p.texto).join('\n');
  assert.match(txt, /Clínica Exemplo é a responsável pela pesquisa\. A Gestão sem Caos cuida da coleta e do relatório em nome dela\./);
  assert.match(txt, /Um grupo só aparece no relatório com pelo menos 5 respostas\. Detalhes e comentários, só com 10 ou mais\./);
  assert.match(txt, /não guardamos nome, telefone, e-mail nem endereço de internet/);
  assert.match(txt, /\(NR-1\)/);
  assert.match(txt, /em até 90 dias depois da entrega do relatório/);
  assert.match(txt, /rh@clinica\.com ou a Gestão sem Caos/);
  assert.doesNotMatch(C.avisoRespondente({ empresa: 'X' }).paragrafos.map((p) => p.texto).join(' '), /NR-1/);
  assert.equal(av.aceite, 'Li este aviso e quero responder.');
  assert.match(C.AVISO_LIDER, /não entra na média da equipe/);
  assert.equal(C.textoN4('o RH (canal interno)'), 'Se você está passando por isso, procure o RH (canal interno). Esta pesquisa não é canal de denúncia e não identifica quem respondeu.');
  assert.equal(C.TEXTOS.abertura, 'Clima é a percepção coletiva do ambiente de trabalho. Este relatório não avalia pessoas, não faz diagnóstico de saúde e não é avaliação psicológica.');
  assert.equal(C.TEXTOS.adesao(45), 'Baixa adesão (45% responderam): leia com cautela.');
  assert.match(C.TEXTOS.origem, /Em validação\.$/);
});

test('nenhuma palavra ou promessa proibida (decisao.md 6.3/6.4) nos textos do módulo nem na tela de resposta', () => {
  const textos = [];
  function juntar(v) {
    if (typeof v === 'string') textos.push(v);
    else if (typeof v === 'function') textos.push(String(v(50)));
    else if (Array.isArray(v)) v.forEach(juntar);
    else if (v && typeof v === 'object') Object.keys(v).forEach((k) => juntar(v[k]));
  }
  juntar([C.BLOCOS, C.ITENS_LIDER, C.ITEM_H1, C.ITEM_H2, C.ITENS_N, C.ESCALA, C.ESCALA_N4, C.INTERVENCOES, C.PLANO_30_60_90, C.MAPA_PGR,
    C.FALTA_PGR, C.REFERENCIAS, C.AVISO_LIDER, C.textoN4('RH'), C.avisoRespondente({ empresa: 'X', complemento: true }), C.TEXTOS]);
  const tela = fs.readFileSync(path.join(__dirname, '..', 'js', 'clima-resposta.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'clima.html'), 'utf8');
  // O arquivo de estilos assets/notus.css não é texto de tela (nome interno do sistema visual).
  const tudo = (textos.join('\n') + '\n' + tela.replace(/assets\/notus\.css/g, '')).toLowerCase();
  C.PALAVRAS_PROIBIDAS.forEach((p) => assert.ok(tudo.indexOf(p) === -1, 'palavra proibida: ' + p));
  assert.ok(!/estrela|icone\.svg/i.test(tela), 'a estrela da Notus não vai em tela pública');
});

test('clima.html: CSP fechada (sem script inline), logo da Gestão sem Caos, carrega o módulo e a tela', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'clima.html'), 'utf8');
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(m, 'falta a CSP');
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  assert.match(m[1], /script-src 'self';/);
  assert.match(m[1], /connect-src 'self' https:\/\/\*\.supabase\.co/);
  assert.equal([...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>/g)].length, 0, 'sem <script> inline');
  assert.ok(!/<[^>]+\son[a-z]+\s*=/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'sem atributos on*');
  assert.match(html, /assets\/marca\/gsc-logo\.svg/);
  ['js/config.js', 'js/api.js', 'js/api-simulada.js', 'assets/vendor/supabase.js', 'js/api-supabase.js', 'js/clima.js', 'js/clima-resposta.js'].forEach((s) => {
    assert.ok(html.includes('src="' + s + '"'), s);
  });
  assert.ok(html.indexOf('js/clima.js') < html.indexOf('js/clima-resposta.js'));
});
