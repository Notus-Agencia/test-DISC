'use strict';
// Feedback 360 da Liderança (js/feedback360.js): itens, escala, telas, validação do envio, cálculo por fonte (tema com 2 de 3
// frases), fusão de grupos pequenos, supressão (tema ≥ 3, frase ≥ 5, complementar em "Outras pessoas"), chefia à parte,
// autoavaliação fora das médias, "pouco observada", sinalizadas, visão do líder, leitura pela âncora, destaques, limiar de
// diferença, hipóteses DISC, consolidado (≥ 5 líderes), desenho de quem avalia quem (teto de 4 formulários) e textos.
// O banco faz a mesma conta (tests/supabase/feedback360.test.js confere SQL × JS).
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/feedback360.js');

function todos(v, extra) {
  const it = {};
  F.IDS_ITENS.forEach((id) => { it[id] = v; });
  return Object.assign(it, extra || {});
}
function resp(fonte, itens, extra) { return Object.assign({ fonte, itens, segundos: 300 }, extra || {}); }
function varias(fonte, n, gerar) { const out = []; for (let i = 0; i < n; i++) out.push(resp(fonte, gerar ? gerar(i) : todos(4))); return out; }

test('itens v0: 6 temas × 3 frases na ordem fixa, sem invertidos; escala de frequência com rótulo; GLB1 de concordância', () => {
  assert.deepEqual(F.TEMAS.map((t) => t.id), ['DIR', 'FBK', 'APO', 'AUT', 'RES', 'COE']);
  assert.equal(F.IDS_ITENS.length, 18);
  F.TEMAS.forEach((t) => assert.equal(t.itens.length, 3, t.id));
  assert.deepEqual(F.ESCALA.map((x) => x.rotulo), ['Nunca ou quase nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre ou quase sempre']);
  assert.equal(F.OPCAO_FORA.rotulo, 'Não tive como observar');
  assert.equal(F.OPCAO_FORA_AUTO.rotulo, 'Não se aplica ao meu trabalho');
  assert.deepEqual(F.ESCALA_GLB.map((x) => x.rotulo), ['Discordo totalmente', 'Discordo', 'Nem concordo nem discordo', 'Concordo', 'Concordo totalmente']);
  assert.equal(F.textoItem('DIR1', 'equipe', 'Marta E.'), 'Marta E. deixa claro quais são as prioridades da equipe para as próximas semanas.');
  assert.equal(F.textoItem('DIR1', 'auto', 'Marta E.'), 'Deixo claro quais são as prioridades da equipe para as próximas semanas.');
  assert.equal(F.textoItem('RES2', 'colegas', 'Ana P.'), 'Quando erra, Ana P. reconhece o erro abertamente.');
  assert.equal(F.textoItem('GLB1', 'auto'), 'No geral, o meu jeito de liderar ajuda a equipe a fazer um bom trabalho.');
  assert.equal(F.textoItem('AB2', 'equipe', 'Ana P.'), 'O que Ana P. poderia começar a fazer, ou fazer diferente, para liderar melhor?');
  F.IDS_ITENS.forEach((id) => assert.ok(F.textoItem(id, 'equipe', 'X Y.').length <= 125, id + ' cabe no celular'));
  assert.equal(F.item('ZZ1'), null);
});

test('telas: 1 tema por tela, "Para fechar" com GLB1 e comentários só para quem avalia (não na autoavaliação)', () => {
  assert.deepEqual(F.telas('equipe').map((t) => t.id), ['DIR', 'FBK', 'APO', 'AUT', 'RES', 'COE', 'GLB', 'AB']);
  assert.deepEqual(F.telas('auto').map((t) => t.id), ['DIR', 'FBK', 'APO', 'AUT', 'RES', 'COE', 'GLB']);
  assert.deepEqual(F.telas('chefia').pop().comentarios, ['AB1', 'AB2']);
  assert.deepEqual(F.telas('colegas')[0].itens, ['DIR1', 'DIR2', 'DIR3']);
});

test('validarEnvio: 0–5 nas frases, 1–5 no GLB1, pular = null, comentários AB1/AB2 limpos, autoavaliação sem comentário', () => {
  const ok = F.validarEnvio({ itens: { DIR1: 4, DIR2: 0, DIR3: null, GLB1: 5 }, comentarios: { AB1: '  Organiza\u0007  bem \n\n\n\n a semana ', AB2: null }, segundos: 99999 }, 'equipe');
  assert.deepEqual(ok, { ok: true, itens: { DIR1: 4, DIR2: 0, GLB1: 5 }, comentarios: { AB1: 'Organiza bem\n\na semana', AB2: '' }, segundos: 86400 });
  assert.deepEqual(F.validarEnvio({ itens: { DIR1: 3 }, comentarios: { AB1: 'não vai' } }, 'auto').comentarios, { AB1: '', AB2: '' });
  const FORMATO = { ok: false, erro: 'Respostas em formato inválido.' };
  for (const c of [null, [], { itens: { DIR1: 6 } }, { itens: { DIR1: -1 } }, { itens: { DIR1: 2.5 } }, { itens: { GLB1: 0 } }, { itens: { X1: 3 } },
    { itens: { DIR1: '3' } }, { itens: [1] }, { itens: { DIR1: 3 }, segundos: -2 }, { itens: { DIR1: 3 }, comentarios: { AB3: 'x' } },
    { itens: { DIR1: 3 }, comentarios: { AB1: 4 } }, { itens: { DIR1: 3 }, comentarios: 'x' }]) {
    assert.deepEqual(F.validarEnvio(c, 'equipe'), FORMATO, JSON.stringify(c));
  }
  assert.deepEqual(F.validarEnvio({ itens: { DIR1: 3 } }, 'diretoria'), FORMATO, 'fonte desconhecida');
  assert.deepEqual(F.validarEnvio({ itens: { DIR1: null }, comentarios: { AB1: '   ' } }, 'equipe'), { ok: false, erro: 'Responda pelo menos uma pergunta antes de enviar.' });
  assert.equal(F.validarEnvio({ comentarios: { AB2: 'Só comentário' } }, 'colegas').ok, true);
});

test('tema por avaliador: média das frases válidas com no mínimo 2 de 3; "não tive como observar" (0) e pulo ficam ausentes', () => {
  const t = F.temasDoAvaliador({ DIR1: 5, DIR2: 4, DIR3: 0, FBK1: 3, FBK2: 0, APO1: 2, APO2: 2, APO3: 5 });
  assert.equal(t.DIR, 4.5);
  assert.equal(t.FBK, null);
  assert.equal(t.APO, 3);
  assert.equal(t.AUT, null);
});

test('fusão de grupos pequenos: Outros < 3 vai para Colegas; Colegas ou Equipe com 1 ou 2 juntam todos; separados com 3 ou mais', () => {
  const casos = [
    [{ colegas: 4, equipe: 5, outros: 0 }, [['colegas'], ['equipe']]],
    [{ colegas: 3, equipe: 4, outros: 2 }, [['colegas', 'outros'], ['equipe']]],
    [{ colegas: 4, equipe: 6, outros: 3 }, [['colegas'], ['equipe'], ['outros']]],
    [{ colegas: 1, equipe: 5, outros: 0 }, [['colegas', 'equipe']]],
    [{ colegas: 0, equipe: 2, outros: 4 }, [['equipe', 'outros']]],
    [{ colegas: 2, equipe: 5, outros: 3 }, [['colegas', 'equipe', 'outros']]],
    [{ colegas: 0, equipe: 5, outros: 0 }, [['equipe']]],
    [{ colegas: 0, equipe: 0, outros: 1 }, [['outros']]],
    [{ colegas: 0, equipe: 0, outros: 0 }, []]
  ];
  for (const [nv, esperado] of casos) assert.deepEqual(F.gruposDaFusao(nv), esperado, JSON.stringify(nv));
});

test('calcular: chefia à parte e fora de "Outras pessoas"; autoavaliação nunca entra em média; composição informada', () => {
  const r = F.calcular({
    convidados: { auto: 1, chefia: 1, colegas: 4, equipe: 6, outros: 0 },
    respostas: [resp('auto', todos(5)), resp('chefia', todos(1)), ...varias('equipe', 5, () => todos(4)), ...varias('colegas', 3, () => todos(2))]
  });
  assert.equal(r.liberado, true);
  assert.deepEqual(r.grupos.map((g) => [g.id, g.nome, g.n]), [['colegas', 'Colegas', 3], ['equipe', 'Equipe', 5]]);
  assert.deepEqual(r.outras.composicao, { colegas: 3, equipe: 5 });
  assert.equal(r.outras.n, 8);
  assert.equal(r.outras.temas.DIR.media, 3.3, '(3 × 2 + 5 × 4) / 8 = 3,25 → 3,3; sem a chefia (1) e sem a autoavaliação (5)');
  assert.equal(r.chefia.temas.DIR, 1);
  assert.equal(r.chefia.itens.DIR1, 1);
  assert.equal(r.auto.temas.DIR, 5);
  assert.equal(r.auto.itens.DIR1, 5);
  assert.equal(r.grupos[0].temas.DIR.media, 2);
  assert.equal(r.grupos[0].itens.DIR1, null, 'frase com 3 respostas não aparece no grupo');
  assert.deepEqual(r.grupos[1].itens.DIR1, { n: 5, media: 4, dist: [0, 0, 0, 5, 0] });
  assert.equal(r.outras.itens.DIR1.n, 5, 'colegas (3) não mostram frase e somam menos de 5: saem de "Outras pessoas" na frase');
  assert.deepEqual(r.fontesExibidas, ['colegas', 'equipe']);
});

test('nenhum relatório quando as respostas anônimas (mesmo fundidas) ficam abaixo de 3; a chefia não conta', () => {
  const r = F.calcular({ convidados: { auto: 1, chefia: 2, colegas: 1, equipe: 2 },
    respostas: [resp('auto', todos(5)), resp('chefia', todos(3)), resp('chefia', todos(4)), resp('colegas', todos(4)), resp('equipe', todos(3))] });
  assert.equal(r.liberado, false);
  assert.deepEqual(r.grupos, []);
  assert.equal(r.outras, null);
  assert.equal(r.chefia, null, 'sem relatório, nem a chefia aparece');
  assert.equal(r.suprimidas, 2);
  // Com 3 na fusão, libera ("Colegas e equipe").
  const r3 = F.calcular({ respostas: [resp('colegas', todos(4)), ...varias('equipe', 2)] });
  assert.equal(r3.liberado, true);
  assert.deepEqual(r3.grupos.map((g) => [g.nome, g.n, g.composicao]), [['Colegas e equipe', 3, { colegas: 1, equipe: 2 }]]);
  assert.equal(r3.grupos[0].temas.DIR.n, 3);
  assert.equal(r3.outras.itens.DIR1, null, 'frase só com 5 ou mais');
});

test('tema e frase abaixo do mínimo por "não tive como observar": a célula some e a supressão complementar protege "Outras pessoas"', () => {
  // Equipe 6, Colegas 3. Em AUT, 2 colegas marcaram "não tive como observar" nas 3 frases: colegas fica com 1 no tema.
  const colegas = varias('colegas', 3, (i) => todos(2, i < 2 ? { AUT1: 0, AUT2: 0, AUT3: 0 } : {}));
  const r = F.calcular({ respostas: [...varias('equipe', 6, () => todos(4)), ...colegas] });
  const col = r.grupos.find((g) => g.id === 'colegas');
  assert.equal(col.temas.AUT, null);
  assert.equal(r.outras.temas.AUT.n, 6, 'o 1 colega sai de "Outras pessoas" em AUT (senão a subtração revelaria a célula escondida)');
  assert.equal(r.outras.temas.AUT.media, 4);
  assert.equal(r.outras.temas.DIR.n, 9, 'nos outros temas, todos entram');
  // Frase: colegas (3) nunca aparecem por frase; com equipe 6 visível, 3 < 5 → saem de "Outras pessoas" na frase.
  assert.equal(r.outras.itens.DIR1.n, 6);
  // Equipe 4 e colegas 4: nenhum grupo mostra frase, mas juntos são 8 → "Outras pessoas" mostra a frase com 8.
  const r2 = F.calcular({ respostas: [...varias('equipe', 4), ...varias('colegas', 4, () => todos(3))] });
  assert.equal(r2.grupos[0].itens.DIR1, null);
  assert.equal(r2.grupos[1].itens.DIR1, null);
  assert.equal(r2.outras.itens.DIR1.n, 8);
  assert.equal(r2.outras.itens.DIR1.media, 3.5);
});

test('"pouco observada": mais da metade marcou "não tive como observar" → sem média, com rótulo', () => {
  const r = F.calcular({ respostas: varias('equipe', 6, (i) => todos(4, { APO1: i < 4 ? 0 : 5 })) });
  assert.deepEqual(r.grupos[0].itens.APO1, { pouco: true });
  assert.deepEqual(r.outras.itens.APO1, { pouco: true });
  assert.ok(r.grupos[0].itens.APO2.media);
});

test('opiniões variadas só com n ≥ 5 (rwg < 0,50); com 3 ou 4, nada', () => {
  const dividido = (i) => todos(i % 2 ? 1 : 5);
  const r = F.calcular({ respostas: varias('equipe', 6, dividido) });
  assert.equal(r.grupos[0].temas.DIR.variadas, true);
  const r4 = F.calcular({ respostas: varias('equipe', 4, dividido) });
  assert.equal(r4.grupos[0].temas.DIR.variadas, null);
  const iguais = F.calcular({ respostas: varias('equipe', 6, () => todos(4)) });
  assert.equal(iguais.grupos[0].temas.DIR.variadas, false);
});

test('respostas sinalizadas (rápidas ou "linha reta"): contadas sempre; saem só por decisão do consultor, por grupo', () => {
  const rs = [...varias('equipe', 4, () => todos(3, { DIR1: 4 })), resp('equipe', todos(5), { segundos: 200 }), resp('equipe', todos(2, { DIR1: 3 }), { segundos: 10 })];
  const r = F.calcular({ respostas: rs });
  assert.equal(r.sinalizadas.equipe, 2);
  assert.equal(r.grupos[0].n, 6);
  const x = F.calcular({ respostas: rs, excluir: ['equipe', 'chefia'] });
  assert.deepEqual(x.excluir, ['equipe'], 'só fontes anônimas');
  assert.equal(x.excluidas.equipe, 2);
  assert.equal(x.grupos[0].n, 4);
});

test('visaoLider: sem distribuição, sem contagens por fonte e sem sinalizadas por fonte (só o total dos grupos exibidos)', () => {
  const r = F.calcular({ convidados: { auto: 1, chefia: 1, colegas: 2, equipe: 6 },
    respostas: [resp('auto', todos(5)), resp('chefia', todos(3, { DIR2: 4 })), ...varias('equipe', 6, () => todos(4, { DIR3: 3 })),
      resp('equipe', todos(4, { DIR3: 3 }), { segundos: 1 })] });
  const v = F.visaoLider(r);
  const txt = JSON.stringify(v);
  assert.ok(!/"dist"/.test(txt));
  assert.equal(v.respondentes, undefined);
  assert.equal(v.sinalizadas, undefined);
  assert.deepEqual(v.convidados, { equipe: 6 });
  assert.equal(v.chefiasConvidadas, 1);
  assert.deepEqual(v.qualidade, { sinalizadas: 1, excluidas: 0 });
  assert.deepEqual(v.outras.itens.DIR1, { n: 7, media: 4 });
  assert.equal(v.chefia.temas.DIR, 3.3);
  const nl = F.visaoLider(F.calcular({ respostas: [resp('chefia', todos(3)), resp('equipe', todos(3))] }));
  assert.equal(nl.liberado, false);
  assert.equal(nl.chefia, null);
});

test('leitura pela âncora mais próxima (5 faixas, 1 casa) e posição na régua; margem ampla com 3 ou 4', () => {
  const casos = [[5, 'sempre'], [4.5, 'sempre'], [4.45, 'sempre'], [4.44, 'frequentemente'], [3.5, 'frequentemente'], [3.45, 'frequentemente'],
    [3.44, 'as_vezes'], [2.5, 'as_vezes'], [2.4, 'raramente'], [1.5, 'raramente'], [1.4, 'nunca'], [1, 'nunca']];
  for (const [m, id] of casos) assert.equal(F.leitura(m).id, id, String(m));
  assert.equal(F.leitura(4.2).rotulo, 'frequentemente');
  assert.equal(F.leitura(null), null);
  assert.equal(F.posicao(1), 0);
  assert.equal(F.posicao(3), 50);
  assert.equal(F.posicao(5), 100);
  assert.equal(F.margemAmpla(3), true);
  assert.equal(F.margemAmpla(4), true);
  assert.equal(F.margemAmpla(5), false);
});

test('destaques: 3 mais e 3 menos observadas em "Outras pessoas" (n ≥ 5), empates até 5, nada quando tudo fica a menos de 0,3', () => {
  function com(medias, n) {
    const it = {};
    F.IDS_ITENS.forEach((id, i) => { if (medias[i] != null) it[id] = { n: n || 6, media: medias[i] }; });
    return { liberado: true, outras: { temas: {}, itens: it } };
  }
  const d = F.destaques(com([4.8, 4.6, 4.5, 4.4, 4.0, 3.9, 3.8, 3.6, 3.5, 3.4, 3.3, 3.2, 3.0, 2.9, 2.8, 2.4, 2.3, 2.0]));
  assert.deepEqual(d.manter.map((x) => x.item), ['DIR1', 'DIR2', 'DIR3', 'FBK1'], '4,4 está a menos de 0,3 de 4,5: empate entra');
  assert.deepEqual(d.desenvolver.map((x) => x.item), ['COE3', 'COE2', 'COE1']);
  const empateLongo = F.destaques(com([3.8, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3, 3.3]));
  assert.deepEqual(empateLongo.manter.map((x) => x.item), ['DIR1'], 'empate com mais de 5: fica só o que se destaca');
  assert.deepEqual(empateLongo.desenvolver, []);
  assert.equal(F.destaques(com([4.1, 4.0, 4.2, 4.1])).parecidas, true);
  assert.deepEqual(F.destaques(com([4.8, 2.0], 4)).manter, [], 'só frases com 5 respostas ou mais');
});

test('diferença de percepção: só por tema, |Δ| ≥ 1,0 e n ≥ 3 no grupo comparado; margem ampla com 3 ou 4; nunca com a chefia', () => {
  const r = F.calcular({ respostas: [resp('auto', todos(5, { FBK1: 3, FBK2: 3, FBK3: 3, APO1: 4, APO2: 4, APO3: 4 })), resp('chefia', todos(1)),
    ...varias('equipe', 6, () => todos(4, { FBK1: 4, FBK2: 4, FBK3: 4, APO1: 3, APO2: 3, APO3: 3 })),
    ...varias('colegas', 3, () => todos(4, { FBK1: 5, FBK2: 5, FBK3: 5 }))] });
  const d = F.diferencas(r);
  const deOutras = d.filter((x) => x.grupo === 'outras');
  assert.deepEqual(deOutras.map((x) => [x.tema, x.delta, x.sentido]), [['DIR', 1, 'acima'], ['FBK', -1.3, 'abaixo'], ['AUT', 1, 'acima'], ['RES', 1, 'acima'], ['COE', 1, 'acima']]);
  assert.ok(!d.some((x) => x.tema === 'APO' && x.grupo === 'outras'), 'APO: colegas 4 e equipe 3 → "Outras pessoas" 3,3; autoavaliação 4; Δ 0,7 < 1,0');
  const fbkColegas = d.find((x) => x.tema === 'FBK' && x.grupo === 'colegas');
  assert.deepEqual([fbkColegas.delta, fbkColegas.sentido, fbkColegas.margemAmpla], [-2, 'abaixo', true]);
  assert.ok(!d.some((x) => x.grupo === 'chefia'));
  assert.match(F.textoDiferenca(fbkColegas), /^Em feedback e reconhecimento, o grupo "Colegas" percebeu uma frequência maior do que você marcou\.$/);
  assert.deepEqual(F.diferencas(F.calcular({ respostas: varias('equipe', 5) })), [], 'sem autoavaliação, sem diferença');
});

test('hipóteses DISC: no máximo 2, com o dado, a leitura "pode ser que", 2+ explicações que não são DISC, pergunta e primeiro passo', () => {
  const r = F.calcular({ respostas: [resp('auto', todos(5)), ...varias('equipe', 6, () => todos(4, { APO1: 2, APO2: 2, APO3: 2, RES1: 3, RES2: 3, RES3: 3 }))] });
  const h = F.hipotesesDisc(r, 'DI');
  assert.equal(h.length, 2);
  h.forEach((x) => {
    assert.match(x.estilo, /pode ser que/);
    assert.ok(x.outras.length >= 2);
    assert.ok(x.pergunta.endsWith('?'));
    assert.ok(x.passo);
  });
  assert.equal(h[0].tema, 'DIR', 'a diferença de percepção vem primeiro');
  assert.deepEqual(F.hipotesesDisc(r, ''), []);
  assert.deepEqual(F.hipotesesDisc(r, 'X'), []);
  assert.match(F.TEXTOS.hipotese, /Hipótese para conversa, não conclusão\./);
});

test('consolidado: só com 5 ou mais líderes liberados; média por tema com peso 1 por líder; focos só com 5 ou mais planos', () => {
  const lider = (v) => F.visaoLider(F.calcular({ respostas: varias('equipe', 5, () => todos(v)) }));
  assert.equal(F.consolidar([lider(4), lider(3), lider(4), lider(5)], []).disponivel, false);
  const c = F.consolidar([lider(4), lider(3), lider(4), lider(5), lider(2)], [['APO1'], ['APO2', 'APO3'], ['DIR1'], ['RES3'], ['APO1', 'DIR2']]);
  assert.equal(c.disponivel, true);
  assert.deepEqual(c.temas.DIR, { lideres: 5, media: 3.6 });
  assert.deepEqual(c.focos, { DIR: 2, FBK: 0, APO: 3, AUT: 0, RES: 1, COE: 0 });
  assert.equal(F.consolidar([lider(4), lider(3), lider(4), lider(5), lider(2)], [['APO1']]).focos, null);
});

test('desenho de quem avalia quem: sugestão do organograma (dono primeiro), teto de 4 com exceção da chefia, mínimo de 3', () => {
  const colabs = ['Marta Dona', 'Diego Lider', 'Paulo Lider', 'Ana A', 'Bia B', 'Caio C', 'Dani D', 'Eva E'].map((n, i) => ({ pessoaId: 'p' + i, nome: n }));
  const rel = [['p0', 'p1'], ['p0', 'p2'], ['p1', 'p3'], ['p1', 'p4'], ['p2', 'p5'], ['p2', 'p6']].map(([de, para]) => ({ de, para, tipo: 'lidera' }))
    .concat([{ de: 'p1', para: 'p2', tipo: 'direto' }]);
  const s = F.sugerirDesenho(colabs, rel, ['p0']);
  assert.deepEqual(s.avaliados.map((a) => [a.nome, a.topo, a.chefia, a.equipe, a.colegas, a.outros]), [
    ['Marta Dona', true, [], ['p1', 'p2'], [], ['p3', 'p4', 'p5']],
    ['Diego Lider', false, ['p0'], ['p3', 'p4'], ['p2'], []],
    ['Paulo Lider', false, ['p0'], ['p5', 'p6'], ['p1'], []]]);
  const v = F.validarDesenho(s.avaliados, colabs, rel);
  assert.equal(v.ok, true, v.erro);
  // Teto: p3 (avalia o próprio líder) cabe em 3 listas de opcionais; p7 (solta) em 4.
  const extra = JSON.parse(JSON.stringify(s.avaliados));
  extra[0].outros = ['p7'];
  extra[1].colegas = ['p7'];
  extra[2].colegas = ['p7'];
  assert.equal(F.validarDesenho(extra, colabs, rel).ok, true);
  const muito = F.validarDesenho([
    { pessoaId: 'p1', chefia: ['p0'], equipe: ['p3', 'p4'], colegas: ['p5', 'p6'] },
    { pessoaId: 'p2', chefia: ['p0'], equipe: ['p5', 'p6'], colegas: ['p3', 'p4'] },
    { pessoaId: 'p0', equipe: ['p1', 'p2'], outros: ['p3', 'p5', 'p7'] }], colabs, rel);
  assert.equal(muito.ok, true, 'p3: 1 obrigatório + 2 opcionais');
  const estoura = F.validarDesenho([
    { pessoaId: 'p1', chefia: ['p0'], equipe: ['p3', 'p4'], outros: ['p5'] },
    { pessoaId: 'p2', chefia: ['p0'], equipe: ['p5', 'p6'], colegas: ['p3', 'p4'] },
    { pessoaId: 'p0', equipe: ['p1', 'p2'], outros: ['p5', 'p3', 'p7'] }].concat([]), colabs, rel);
  assert.equal(estoura.ok, true);
  const m = F.validarDesenho([{ pessoaId: 'p1', chefia: ['p0'], equipe: ['p3', 'p4'], colegas: ['p7'] },
    { pessoaId: 'p2', chefia: ['p0'], equipe: ['p5', 'p6'], colegas: ['p7'] },
    { pessoaId: 'p0', equipe: ['p1', 'p2'], outros: ['p7', 'p3'] }], colabs, rel);
  assert.equal(m.ok, true);
  assert.match(F.validarDesenho([{ pessoaId: 'p1', chefia: ['p2'], equipe: ['p3', 'p4'], colegas: ['p7'] }], colabs, rel).erro, /A chefia de Diego L\. precisa ser quem lidera/);
  assert.match(F.validarDesenho([{ pessoaId: 'p1', chefia: ['p0'], equipe: ['p3', 'p4'] }], colabs, rel).erro, /Diego L\. precisa de pelo menos 3 pessoas/);
  assert.match(F.validarDesenho([{ pessoaId: 'p3', equipe: ['p4'] }], colabs, rel).erro, /liderar alguém no organograma/);
  assert.match(F.validarDesenho([], colabs, rel).erro, /pelo menos uma pessoa/);
  // Chefia de 5 líderes: avalia todos (exceção) com o aviso de fazer em ondas; nenhum opcional a mais.
  const grande = [{ pessoaId: 'c', nome: 'Chefe Grande' }, { pessoaId: 'x', nome: 'Xis Solto' }];
  const rel2 = [];
  for (let i = 0; i < 5; i++) {
    grande.push({ pessoaId: 'l' + i, nome: 'Lider ' + i });
    rel2.push({ de: 'c', para: 'l' + i, tipo: 'lidera' });
    for (let j = 0; j < 3; j++) { grande.push({ pessoaId: 'e' + i + j, nome: 'Eq ' + i + j }); rel2.push({ de: 'l' + i, para: 'e' + i + j, tipo: 'lidera' }); }
  }
  const des = (outros) => [0, 1, 2, 3, 4].map((i) => ({ pessoaId: 'l' + i, chefia: ['c'], equipe: ['e' + i + '0', 'e' + i + '1', 'e' + i + '2'], outros: outros(i) }));
  const ok5 = F.validarDesenho(des((i) => (i < 4 ? ['x'] : [])), grande, rel2);
  assert.equal(ok5.ok, true);
  assert.ok(ok5.avisos.some((a) => /Chefe G\. avalia 5 pessoas/.test(a) && /ondas/.test(a)));
  assert.match(F.validarDesenho(des(() => ['x']), grande, rel2).erro, /Xis S\. passaria do limite de 4 formulários/);
  assert.match(F.validarDesenho(des((i) => (i > 0 ? ['e00'] : [])), grande, rel2).erro, /Eq 0\. passaria do limite/);
  // A sugestão respeita o teto: ninguém passa de 4 opcionais menos obrigatórios.
  const sg = F.sugerirDesenho(grande, rel2, ['c']);
  Object.values(F.cargaDe(sg.avaliados)).forEach((c) => assert.ok(c.opcionais <= Math.max(0, 4 - c.obrigatorios)));
});

test('plano: 1 ou 2 frases entre as 18, até 3 ações com prazo, datas válidas, textos curtos', () => {
  assert.deepEqual(F.validarPlano(null), { ok: true, plano: null });
  assert.match(F.validarPlano({ comportamentos: [] }).erro, /1 ou 2 comportamentos/);
  assert.match(F.validarPlano({ comportamentos: [{ item: 'DIR1' }, { item: 'DIR2' }, { item: 'DIR3' }] }).erro, /1 ou 2 comportamentos/);
  assert.match(F.validarPlano({ comportamentos: [{ item: 'DIR1' }, { item: 'DIR1' }] }).erro, /sem repetir/);
  assert.match(F.validarPlano({ comportamentos: [{ item: 'DIR1' }], acoes: [{ texto: 'a' }, { texto: 'b' }, { texto: 'c' }, { texto: 'd' }] }).erro, /No máximo 3 ações/);
  const p = F.validarPlano({ comportamentos: [{ item: 'APO1', acao: 'x'.repeat(400) }], acoes: [{ texto: '1:1', prazo: '2026-02-30' }, { texto: '' }],
    datas: { pulso: '2027-01-15', checkin: 'amanhã' } }).plano;
  assert.equal(p.comportamentos[0].acao.length, 300);
  assert.deepEqual(p.acoes, [{ texto: '1:1', prazo: '' }]);
  assert.equal(p.datas.pulso, '2027-01-15');
  assert.equal(p.datas.checkin, '');
  assert.deepEqual(Object.keys(p.datas), F.MOMENTOS_PLANO.map((m) => m.id));
});

test('textos obrigatórios: "confidencial", nunca "anônimo"; chefia avisada; sem promessas nem palavras proibidas; marca d\'água', () => {
  const op = { empresa: 'Clínica Exemplo', nome: 'Marta E.', fonte: 'equipe', encerramentoPrevisto: '2026-10-27', retencaoDias: 90 };
  const b = F.avisoAvaliador(op);
  const tb = b.paragrafos.map((p) => p.rotulo + ' ' + p.texto).join(' ');
  assert.match(tb, /Sua resposta é confidencial\./);
  assert.match(tb, /grupo Equipe/);
  assert.match(tb, /previsto para 27\/10\/2026/);
  assert.match(tb, /Uma pergunta geral no final serve só para estudar a qualidade do questionário/);
  assert.match(tb, /Não é canal de denúncia\./);
  assert.equal(b.aceite, 'Li este aviso e quero responder.');
  const a = F.avisoLider({ empresa: 'Clínica Exemplo' });
  assert.equal(a.aceite, 'Li este aviso e quero participar.');
  assert.match(a.paragrafos.map((p) => p.texto).join(' '), /Sua chefia vê só o seu plano de desenvolvimento|vê só o seu plano de desenvolvimento/);
  const c = F.avisoChefia(Object.assign({}, op, { fonte: 'chefia' }));
  const tc = c.paragrafos.map((p) => p.rotulo + ' ' + p.texto).join(' ');
  assert.match(tc, /Sua resposta aparece identificada\./);
  assert.ok(!/confidencial/.test(tc) && !/dentro do grupo/.test(tc), 'a chefia não recebe a promessa de grupo');
  assert.match(F.avisoChefia(Object.assign({}, op, { duasChefias: true })).paragrafos.map((p) => p.texto).join(' '), /cada uma pode deduzir a resposta da outra/);
  assert.equal(F.TEXTOS.marca('Marta E.'), 'Confidencial · desenvolvimento de Marta E. · não usar em decisões de pessoal');
  assert.match(F.TEXTOS.capa('Marta E.'), /^Relatório confidencial de desenvolvimento de Marta E\./);
  assert.match(F.INSTRUCAO('equipe', 'Marta E.'), /Pense no que você viu Marta E\. fazer nos últimos 3 meses/);
  assert.match(F.INSTRUCAO('auto'), /Pense no que você fez nos últimos 3 meses/);
  assert.match(F.AVISO_COMENTARIO(op), /^Comentário \(opcional\)\. Descreva comportamentos/);
  const tudo = [tb, a.paragrafos.map((p) => p.rotulo + ' ' + p.texto).join(' '), tc, F.AVISO_COMENTARIO(op), F.avisoPulso(op), F.INSTRUCAO('equipe', 'X'),
    F.INSTRUCAO('auto'), F.NAO_RECOMENDAR, F.AVISO_RES3, F.ROTEIRO_MODERACAO.join(' '), F.PROTOCOLO_RELATOS.join(' ')]
    .concat(Object.keys(F.TEXTOS).map((k) => (typeof F.TEXTOS[k] === 'function' ? F.TEXTOS[k]('Marta E.') : F.TEXTOS[k])))
    .concat(Object.keys(F.MENU_ACOES).map((k) => F.MENU_ACOES[k].acoes.join(' '))).join(' ').toLowerCase();
  // "não é avaliação psicológica" é obrigatório; "anônim" e as palavras de 5.3/5.4, nunca.
  const proibidas = F.PALAVRAS_PROIBIDAS.filter((p) => p !== 'avaliação de desempenho');
  for (const p of proibidas) assert.ok(!tudo.includes(p), 'palavra proibida: ' + p);
  assert.ok(!/notus/.test(tudo));
  assert.equal(F.nomeCurto('Maria da Silva'), 'Maria S.');
});
