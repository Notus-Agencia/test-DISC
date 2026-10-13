'use strict';
// Relatório do Feedback 360 (js/relatorio-view.js, modelo 'feedback360': visão do líder, da chefia e consolidado) e funções
// puras do painel (js/admin-feedback360.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/relatorio-view.js');
const F = require('../js/feedback360.js');
const AF = require('../js/admin-feedback360.js');

function todos(v, extra) { const it = {}; F.IDS_ITENS.forEach((id) => { it[id] = v; }); it.GLB1 = 4; return Object.assign(it, extra || {}); }
function resp(fonte, itens) { return { fonte, itens, segundos: 300 }; }
// Equipe 5 (frases aparecem), colegas 3, chefia 1, auto 1. Autoavaliação 1 ponto acima em APO.
function resultado(extraResp) {
  const r = [resp('auto', todos(4, { APO1: 5, APO2: 5, APO3: 5 })), resp('chefia', todos(4, { DIR1: 0 }))];
  for (let i = 0; i < 5; i++) r.push(resp('equipe', todos(3 + (i % 2), { APO1: 3, APO2: 3, APO3: 3, RES2: 2 + (i % 3) })));
  for (let i = 0; i < 3; i++) r.push(resp('colegas', todos(4, { APO1: 4, APO2: 4, APO3: 4, FBK2: i ? 3 : 5 })));
  return F.calcular({ respostas: r.concat(extraResp || []), convidados: { auto: 1, chefia: 1, equipe: 6, colegas: 3, outros: 0 }, excluir: [] });
}
function snapshot(res, extra) {
  return Object.assign({ modelo: 'feedback360', visao: 'lider', versao: 1, titulo: 'Feedback 360 da Liderança · Ana P.', geradoEm: '2026-10-10T12:00:00.000Z',
    empresa: { nome: 'Empresa X' }, consultor: 'Consultor', ciclo: { nome: 'Ciclo', abertoEm: '2026-09-01T12:00:00.000Z', encerradoEm: '2026-09-15T12:00:00.000Z', versaoItens: 'v0' },
    avaliado: { nome: 'Ana P.', topo: false }, devolutivaEm: '2026-09-20T12:00:00.000Z', resultado: F.visaoLider(res), temas: ['Retornos claros'],
    comentarios: [{ pergunta: 'AB1', texto: 'Organiza bem a semana.' }], comentariosChefia: [{ pergunta: 'AB2', texto: 'Delegar mais.' }],
    foco: 'Conversas individuais', observacao: 'Concordo.', plano: F.validarPlano({ comportamentos: [{ item: 'APO1', acao: 'Conversa quinzenal' }],
      acoes: [{ texto: 'Agenda fixa', prazo: '2026-10-30' }], datas: { checkin: '2026-11-05' } }).plano,
    disc: null, guias: [] }, extra || {});
}
const textoDe = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const secoesDe = (html) => [...html.matchAll(/data-secao="([a-z-]+)"/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);

test('relatório do líder: os 11 capítulos (com DISC aceito), marca confidencial em cada página, sem número, nota, semáforo ou média da empresa', () => {
  const html = V.montarHtml(snapshot(resultado(), { disc: { codigo: 'DC' } }));
  assert.deepEqual(secoesDe(html), ['capa', 'indice', 'como-ler', 'resumo', 'temas', 'comportamentos', 'diferencas', 'comentarios', 'estilo', 'equipe', 'plano',
    'acompanhamento', 'metodo', 'rodape']);
  const marca = F.TEXTOS.marca('Ana P.');
  assert.equal(marca, 'Confidencial · desenvolvimento de Ana P. · não usar em decisões de pessoal');
  assert.equal((html.match(/class="pag-cab__dir">Confidencial · desenvolvimento de Ana P\. · não usar em decisões de pessoal</g) || []).length, 11, 'marca no cabeçalho das 11 páginas');
  assert.ok(html.includes('class="f360-marca-dagua"'), 'marca d\'água para o PDF');
  const t = textoDe(html);
  F.PALAVRAS_PROIBIDAS.forEach((p) => assert.ok(!t.toLowerCase().includes(p), 'palavra proibida: ' + p));
  assert.ok(!/\b[1-5][,.]\d\b/.test(t), 'nenhuma média com casa decimal aparece para o líder');
  assert.ok(!/\b\d{1,3}\s*%|de 0 a 100|semáforo|média da empresa/i.test(t.replace('Não compara você com outros líderes nem com a média da empresa.', '')));
  F.ESCALA.forEach((x) => assert.ok(t.includes(x.rotulo), 'régua com o rótulo ' + x.rotulo));
  assert.ok(t.includes('Retornos claros') && t.includes('Organiza bem a semana.') && t.includes('Delegar mais.'));
  assert.ok(t.includes('Da sua chefia (identificada)'));
  assert.ok(html.includes('data-hipotese='), 'hipótese DISC só com o aceite');
  assert.ok(t.includes(F.TEXTOS.hipotese));
  assert.ok(t.includes(F.NAO_RECOMENDAR) && t.includes(F.TEXTOS.expectativa));
  assert.equal((html.match(/data-tema="[A-Z]{3}"/g) || []).length, 12, '6 réguas de tema + 6 blocos de frases');
});

test('relatório do líder: sem aceite não há capítulo de estilo; diferença só com 1 ponto ou mais e texto de cautela', () => {
  const res = resultado();
  const html = V.montarHtml(snapshot(res));
  assert.ok(!html.includes('data-secao="estilo"') && !html.includes('data-hipotese='));
  assert.equal(secoesDe(html).length, 13, 'capa, índice, 10 capítulos e rodapé');
  const difs = F.diferencas(F.visaoLider(res));
  assert.ok(difs.length >= 1 && difs.every((d) => Math.abs(d.delta) >= 1));
  difs.forEach((d) => assert.ok(html.includes('data-diferenca="' + d.tema + ':' + d.grupo + '"')));
  assert.ok(!html.includes('data-diferenca="DIR:'), 'DIR: auto 4 × outras ~3,8 não é diferença');
  assert.ok(textoDe(html).includes(F.TEXTOS.diferencas));
});

test('relatório do líder: grupos pequenos não aparecem sozinhos; frase com menos de 5 diz por quê; tudo escapado', () => {
  // Só 3 de colegas + 1 de equipe: fusão em "Colegas e equipe" (4) e nenhuma frase.
  const r = [resp('auto', todos(4))];
  for (let i = 0; i < 3; i++) r.push(resp('colegas', todos(4)));
  r.push(resp('equipe', todos(3)));
  const res = F.calcular({ respostas: r, convidados: { auto: 1, chefia: 0, equipe: 2, colegas: 3, outros: 0 }, excluir: [] });
  const html = V.montarHtml(snapshot(res, { comentariosChefia: [], avaliado: { nome: '<img src=x onerror=alert(1)>', topo: true }, temas: ['<script>alert(1)</script>'] }));
  const t = textoDe(html);
  assert.ok(t.includes('Colegas e equipe'));
  assert.ok(t.includes('menos de 5 respostas'));
  assert.ok(t.includes('Margem ampla'));
  assert.ok(!html.includes('<script>alert(1)') && !html.includes('<img src=x'));
  assert.ok(!t.includes('respostas da chefia'), 'topo do organograma: sem número de chefia na capa');
});

test('visão da chefia: só o plano e o acompanhamento, com a marca confidencial; nada de respostas, réguas ou comentários', () => {
  const s = snapshot(resultado());
  const html = V.montarHtml({ modelo: 'feedback360', visao: 'chefia', versao: 1, titulo: 'Plano', geradoEm: s.geradoEm, empresa: s.empresa, consultor: 'C',
    ciclo: { nome: 'Ciclo', encerradoEm: s.ciclo.encerradoEm }, avaliado: { nome: 'Ana P.' }, devolutivaEm: s.devolutivaEm, plano: s.plano });
  assert.deepEqual(secoesDe(html), ['capa', 'plano', 'acompanhamento', 'rodape']);
  assert.ok(html.includes('data-visao="chefia"'));
  assert.ok(!html.includes('f360-linha') && !html.includes('f360-comentario') && !html.includes('data-tema='));
  const t = textoDe(html);
  assert.ok(t.includes(F.TEXTOS.chefiaPlano));
  assert.ok(t.includes('Conversa quinzenal') && t.includes('Agenda fixa · até 30/10/2026'));
  assert.ok(!t.includes('Concordo.'), 'observação do líder não vai para a chefia');
  assert.equal((html.match(/class="pag-cab__dir">Confidencial · desenvolvimento de Ana P\./g) || []).length, 2);
  F.PALAVRAS_PROIBIDAS.forEach((p) => assert.ok(!t.toLowerCase().includes(p), 'palavra proibida: ' + p));
});

test('consolidado da empresa: só com 5 ou mais líderes, sem nomes, sem ranking', () => {
  const res = F.visaoLider(resultado());
  const cons = F.consolidar([res, res, res, res, res], [['APO1'], ['APO2', 'COE1'], ['DIR1'], ['APO3'], ['FBK1']]);
  assert.ok(cons.disponivel);
  const html = V.montarHtml({ modelo: 'feedback360', visao: 'empresa', versao: 1, titulo: 'Consolidado', geradoEm: '2026-10-10T12:00:00.000Z',
    empresa: { nome: 'Empresa X' }, consultor: 'C', ciclo: { nome: 'Ciclo', encerradoEm: '2026-09-15T12:00:00.000Z' }, consolidado: cons });
  assert.ok(html.includes('data-visao="empresa"'));
  const t = textoDe(html);
  assert.ok(t.includes('Média dos líderes') && t.includes('Apoio e desenvolvimento: 3 líderes'));
  assert.ok(!t.includes('Ana P.'));
  assert.ok(!/\b[1-5][,.]\d\b/.test(t));
  F.PALAVRAS_PROIBIDAS.forEach((p) => assert.ok(!t.toLowerCase().includes(p), 'palavra proibida: ' + p));
  assert.ok(V.montarHtml({ modelo: 'feedback360', visao: 'outra' }).includes('doc-erro'));
});

test('painel: links, mensagens por fonte (chefia identificada, demais confidencial) e contagens só agregadas', () => {
  assert.equal(AF.linkF360('https://x.com/app/admin.html?a=1#b', 'ab'.repeat(32)), 'https://x.com/app/feedback360.html?t=' + 'ab'.repeat(32));
  assert.equal(AF.linkRelatorio('https://x.com/admin.html', 'tk'), 'https://x.com/relatorio.html?r=tk');
  const base = { empresa: 'Clínica X', avaliado: 'Marta E.', pessoa: 'Diego Esteves', link: 'L', fim: '2026-10-27' };
  const auto = AF.mensagemConvite(Object.assign({}, base, { fonte: 'auto' }));
  const chefia = AF.mensagemConvite(Object.assign({}, base, { fonte: 'chefia' }));
  const equipe = AF.mensagemConvite(Object.assign({}, base, { fonte: 'equipe' }));
  assert.ok(auto.startsWith('Olá, Diego! Este é o seu link de autoavaliação') && auto.endsWith('\nL'));
  assert.ok(chefia.includes('aparece identificada') && chefia.includes('até 27/10'));
  assert.ok(equipe.includes('confidencial') && equipe.includes('pelo menos 3 respostas') && !equipe.includes('Marta E..'));
  [auto, chefia, equipe].forEach((m) => { assert.ok(!/anônim|notus/i.test(m)); assert.ok(m.includes('Gestão sem Caos')); });
  const ciclo = { status: 'aberto', avaliados: [
    { nome: 'Ana P.', convidados: { auto: 1, chefia: 1, colegas: 2, equipe: 3, outros: 0 }, respondentes: { auto: 1, chefia: 0, colegas: 1, equipe: 1, outros: 0 } },
    { nome: 'Bia R.', convidados: { auto: 1, chefia: 1, colegas: 3, equipe: 4, outros: 0 }, respondentes: { auto: 0, chefia: 1, colegas: 2, equipe: 4, outros: 0 } },
    { nome: 'Caio S.', convidados: { auto: 1, chefia: 0, colegas: 3, equipe: 5, outros: 0 }, respondentes: { auto: 1, chefia: 0, colegas: 3, equipe: 5, outros: 0 } }] };
  assert.deepEqual(AF.contagens(ciclo.avaliados[0]).map((x) => x.fonte), ['auto', 'chefia', 'colegas', 'equipe']);
  const av = AF.avisosAberto(ciclo);
  assert.equal(av.length, 2);
  assert.ok(av[0].startsWith('Ana P.: 2 respostas') && av[0].includes('não há relatório'));
  assert.ok(av[1].startsWith('Bia R.: colegas com 1 ou 2'));
  assert.deepEqual(AF.avisosAberto({ status: 'encerrado', avaliados: ciclo.avaliados }), []);
});

test('painel: plano do formulário, datas sugeridas, prévia igual ao snapshot do banco e consolidado só com 5', () => {
  assert.equal(AF.planoDoFormulario({ comportamentos: [{ item: '' }] }), null);
  const p = AF.planoDoFormulario({ comportamentos: [{ item: 'APO1', acao: ' 1:1 ' }, { item: '' }], acoes: [{ texto: 'A', prazo: '2026-11-01' }, { texto: ' ' }], datas: AF.datasSugeridas('2026-09-20') });
  assert.ok(F.validarPlano(p).ok);
  assert.deepEqual(p.comportamentos, [{ item: 'APO1', acao: '1:1' }]);
  assert.deepEqual(AF.datasSugeridas('2026-09-20'), { conversaEquipe: '2026-10-11', conversaChefia: '2026-10-11', checkin: '2026-11-04', retornos: '2026-12-04', pulso: '2027-01-03', reaplicacao: '2027-09-20' });
  const res = resultado();
  const a = { id: 'a1', nome: 'Ana P.', topo: false, resultado: res, temas: ['T'], foco: 'F', observacao: 'O', plano: p, discAceito: false, devolutivaEm: '2026-09-20T12:00:00Z' };
  const coms = [{ pergunta: 'AB1', chefia: false, elegivel: true, status: 'mantido', texto: 'bom', textoModerado: 'bom' },
    { pergunta: 'AB2', chefia: false, elegivel: true, status: 'editado', texto: 'Fulano disse X', textoModerado: '[trecho removido] disse X' },
    { pergunta: 'AB2', chefia: false, elegivel: true, status: 'descartado', texto: 'ofensa', textoModerado: '' },
    { pergunta: 'AB1', chefia: false, elegivel: false, status: 'pendente', texto: 'grupo escondido', textoModerado: '' },
    { pergunta: 'AB1', chefia: true, elegivel: true, status: 'mantido', texto: 'da chefia', textoModerado: 'da chefia' }];
  const s = AF.snapshotPrevia({ nome: 'Ciclo', abertoEm: 'x', encerradoEm: 'y' }, a, { nome: 'Empresa X' }, coms, 'Consultor', 'DC');
  assert.equal(s.modelo, 'feedback360'); assert.equal(s.visao, 'lider');
  assert.deepEqual(s.comentarios.map((x) => x.texto), ['bom', '[trecho removido] disse X']);
  assert.deepEqual(s.comentariosChefia.map((x) => x.texto), ['da chefia']);
  assert.equal(s.disc, null, 'sem aceite, sem DISC');
  assert.deepEqual(AF.snapshotPrevia({}, Object.assign({}, a, { discAceito: true }), {}, [], '', 'DC').disc, { codigo: 'DC' });
  assert.deepEqual(s.resultado, F.visaoLider(res));
  assert.ok(!V.montarHtml(s).includes('doc-erro'));
  const lib = { resultado: { liberado: true }, devolutivaEm: 'x' };
  assert.equal(AF.podeConsolidar({ status: 'encerrado', avaliados: [lib, lib, lib, lib] }), false);
  assert.equal(AF.podeConsolidar({ status: 'encerrado', avaliados: [lib, lib, lib, lib, lib] }), true);
  assert.equal(AF.podeConsolidar({ status: 'encerrado', avaliados: [lib, lib, lib, lib, { resultado: { liberado: true } }] }), false);
});

test('tela de resposta: token só da URL (64 hex), envio só com o respondido e sem comentários na autoavaliação', () => {
  const R = require('../js/feedback360-resposta.js');
  const tk = 'AB'.repeat(32);
  assert.equal(R.tokenDaUrl('?t=' + tk, ''), tk.toLowerCase());
  assert.equal(R.tokenDaUrl('', '#t-' + tk), tk.toLowerCase());
  assert.equal(R.tokenDaUrl('?t=123', '#x'), '');
  const corpo = R.montarEnvio({ DIR1: 4, DIR2: 0, DIR3: undefined, GLB1: 5 }, { AB1: '  bom  ', AB2: '' }, 181.6, 'equipe');
  assert.deepEqual(corpo, { itens: { DIR1: 4, DIR2: 0, GLB1: 5 }, comentarios: { AB1: 'bom' }, segundos: 182 });
  assert.ok(F.validarEnvio(corpo, 'equipe').ok);
  assert.deepEqual(R.montarEnvio({ DIR1: 5 }, { AB1: 'x' }, null, 'auto'), { itens: { DIR1: 5 } });
  assert.equal(R.rotuloProgresso(0, 8), 'Parte 1 de 8');
});

test('painel: desenho inicial do organograma oferece "outros" entre os colaboradores ativos e respeita o teto', () => {
  const colabs = ['Dona Maria', 'Bruno Souza', 'Carla Mendes', 'E1 a', 'E2 b', 'E3 c', 'E4 d', 'Solto x'].map((n, i) => ({ pessoaId: 'p' + i, nome: n, status: 'ativo' }));
  const rel = [{ de: 'p0', para: 'p1', tipo: 'lidera' }, { de: 'p0', para: 'p2', tipo: 'lidera' }, { de: 'p1', para: 'p3', tipo: 'lidera' }, { de: 'p1', para: 'p4', tipo: 'lidera' },
    { de: 'p2', para: 'p5', tipo: 'lidera' }, { de: 'p2', para: 'p6', tipo: 'lidera' }];
  const s = AF.desenhoInicial(colabs, rel, ['p0']);
  assert.deepEqual(s.avaliados.map((a) => a.pessoaId), ['p0', 'p1', 'p2']);
  const bruno = s.avaliados[1];
  assert.ok(bruno.candidatosOutros.includes('p7') && !bruno.candidatosOutros.includes('p1') && !bruno.candidatosOutros.includes('p3'));
  assert.ok(F.validarDesenho(s.avaliados, colabs, rel).ok);
});
