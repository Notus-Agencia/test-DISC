'use strict';
// Subaba "Andamento" da empresa (js/admin-andamento.js): ordem do organograma, situação do teste DISC e da parte 2,
// resumos, mensagens de lembrete e, principalmente, a confidencialidade prometida a quem responde: a pesquisa de clima
// só entra por contagens de equipe/rodada e o Feedback 360 só por números de grupo (quem avalia: só quantos links recebe).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AN = require('../js/admin-andamento.js');

const AGORA = '2026-10-13T12:00:00-03:00';
function colab(id, nome, extra) {
  return Object.assign({ pessoaId: id, nome, telefone: '55119000000' + id.slice(-2), cargo: '', area: '', status: 'ativo', resultado: null, respondidoEm: '', exigido: null }, extra || {});
}
const RES = { percentuais: { D: 30, I: 30, S: 20, C: 20 }, codigo: 'DI' };
const EXI = { percentuais: { D: 25, I: 25, S: 25, C: 25 }, codigo: 'DI' };
// Organograma da Clínica Exemplo: Marta lidera Diego e Paulo; Diego lidera Carla e Lucas; Paulo lidera Renata e Tiago.
const COLABS = [
  colab('p06', 'Marta Exemplo Diretora', { cargo: 'Diretora geral', resultado: RES, respondidoEm: '2026-10-04T10:00:00Z', exigido: EXI }),
  colab('p04', 'Diego Exemplo Simulado', { resultado: RES, respondidoEm: '2026-10-01T10:00:00Z', exigido: EXI }),
  colab('p07', 'Paulo Modelo Fictício', { resultado: RES, respondidoEm: '2026-10-08T10:00:00Z' }),
  colab('p03', 'Carla Modelo Demonstração', { resultado: RES, respondidoEm: '2026-09-30T10:00:00Z', exigido: EXI }),
  colab('p08', 'Lucas Fictício Exemplo'),
  colab('p09', 'Renata Exemplo Fictícia', { resultado: RES, respondidoEm: '2025-12-02T10:00:00Z', exigido: EXI }),
  colab('p10', 'Tiago Modelo Sem Teste'),
  colab('p11', 'Bia de Souza'),                                     // sem posição no organograma
  colab('p02', 'Bruno Desligado', { status: 'desligado' })
];
const REL = [['p06', 'p04'], ['p06', 'p07'], ['p04', 'p03'], ['p04', 'p08'], ['p07', 'p09'], ['p07', 'p10']]
  .map(([de, para]) => ({ de, para, tipo: 'lidera' })).concat([{ de: 'p04', para: 'p07', tipo: 'direto' }]);
const PROC_P2 = { id: 'pr1', nome: 'Equipe comercial', tipo: 'equipe', config: { formulario: { parte2: 'ligada' } } };
const PROC_P1 = { id: 'pr1', nome: 'Equipe comercial', tipo: 'equipe', config: { formulario: { parte2: 'desligada' } } };

// Rodada de clima IDENTIFICADA como o painel recebe (com os links pessoais de cada liderado: nomes e tokens).
const NOMES_CONVITES = ['Carla Modelo Demonstração', 'Lucas Fictício Exemplo', 'Renata Exemplo Fictícia', 'Tiago Modelo Sem Teste'];
const RODADA_ID = {
  id: 'r2', nome: 'Pesquisa de clima · out/2026', status: 'aberta', modo: 'identificada', identificadas: 3, convidados: 6, respondentes: 3,
  abertaEm: '2026-10-10T10:00:00Z',
  equipes: [
    { id: 'e1', nome: 'Equipe de Diego E.', area: 'Comercial', ordem: 0, convidados: 2, respondentes: 2, tokenEquipe: 'a'.repeat(64), tokenLider: 'b'.repeat(64),
      convites: [{ id: 'c1', pessoaId: 'p03', nome: NOMES_CONVITES[0], token: 'c'.repeat(64), metodos: [], usado: true },
        { id: 'c2', pessoaId: 'p08', nome: NOMES_CONVITES[1], token: 'd'.repeat(64), metodos: [], usado: true }] },
    { id: 'e2', nome: 'Equipe de Paulo M.', area: 'Atendimento', ordem: 1, convidados: 2, respondentes: 1, tokenEquipe: 'e'.repeat(64), tokenLider: 'f'.repeat(64),
      convites: [{ id: 'c3', pessoaId: 'p09', nome: NOMES_CONVITES[2], token: '1'.repeat(64), metodos: ['dados'], usado: true },
        { id: 'c4', pessoaId: 'p10', nome: NOMES_CONVITES[3], token: '2'.repeat(64), metodos: [], usado: false }] }
  ],
  relatorio: null
};
const RODADA_ANTIGA = { id: 'r1', nome: 'set/2026', status: 'encerrada', modo: 'anonima', convidados: 23, respondentes: 19, abertaEm: '2026-09-18T10:00:00Z',
  equipes: [{ id: 'e9', nome: 'Equipe de Marta E.', area: 'Diretoria', convidados: 3, respondentes: 2 }] };

// Ciclo do 360 ABERTO como o painel recebe (contagens por fonte e a lista de convites com nome, fonte e token).
const CICLO_ABERTO = {
  id: 'f2', nome: 'Feedback 360 · out/2026', status: 'aberto', abertoEm: '2026-10-12T10:00:00Z', encerramentoPrevisto: '2026-10-27',
  avaliados: [
    { id: 'a1', pessoaId: 'p04', nome: 'Diego E.', convidados: { auto: 1, chefia: 1, colegas: 1, equipe: 2, outros: 0 }, respondentes: { auto: 1, chefia: 1, colegas: 0, equipe: 1, outros: 0 },
      relatorios: { lider: null, chefia: null } },
    { id: 'a2', pessoaId: 'p07', nome: 'Paulo M.', convidados: { auto: 1, chefia: 1, colegas: 1, equipe: 2, outros: 1 }, respondentes: { auto: 0, chefia: 0, colegas: 1, equipe: 2, outros: 1 },
      relatorios: { lider: null, chefia: null } }
  ],
  convites: [
    { pessoaId: 'p04', nome: 'Diego Exemplo Simulado', avaliadoId: 'a1', fonte: 'auto', token: '3'.repeat(64), respondeu: true },
    { pessoaId: 'p06', nome: 'Marta Exemplo Diretora', avaliadoId: 'a1', fonte: 'chefia', token: '4'.repeat(64) },
    { pessoaId: 'p06', nome: 'Marta Exemplo Diretora', avaliadoId: 'a2', fonte: 'chefia', token: '5'.repeat(64) },
    { pessoaId: 'p03', nome: 'Carla Modelo Demonstração', avaliadoId: 'a1', fonte: 'equipe', token: '6'.repeat(64) },
    { pessoaId: 'p07', nome: 'Paulo Modelo Fictício', avaliadoId: 'a1', fonte: 'colegas', token: '7'.repeat(64) },
    { pessoaId: 'p03', nome: 'Carla Modelo Demonstração', avaliadoId: 'a2', fonte: 'outros', token: '8'.repeat(64) }
  ]
};
const CICLO_ENCERRADO = {
  id: 'f1', nome: 'ago/2026', status: 'encerrado', abertoEm: '2026-07-30T10:00:00Z', encerradoEm: '2026-08-13T10:00:00Z', manterLista: true,
  avaliados: [
    { id: 'b1', pessoaId: 'p06', nome: 'Marta E.', convidados: { auto: 1, equipe: 2, outros: 4 }, respondentes: { auto: 1, equipe: 2, outros: 4 },
      resultado: { liberado: true }, devolutivaEm: '2026-08-19T10:00:00Z', relatorios: { lider: { status: 'publicado', token: 'x' } } },
    { id: 'b2', pessoaId: 'p07', nome: 'Paulo M.', convidados: { auto: 1, chefia: 1, colegas: 1, equipe: 2 }, respondentes: { auto: 1, chefia: 1, colegas: 0, equipe: 2 },
      resultado: { liberado: false }, devolutivaEm: '', relatorios: { lider: null } }
  ],
  // Mesmo que a lista ficasse (manterLista), depois do encerramento ela não entra no quadro.
  convites: [{ pessoaId: 'p03', nome: 'Carla Modelo Demonstração', avaliadoId: 'b1', fonte: 'equipe', token: '9'.repeat(64) }]
};

test('ordem do organograma: topo, cada equipe abaixo do líder (por nome), sem posição no fim; desligados fora', () => {
  const o = AN.ordemOrganograma(COLABS, REL, ['p06']);
  assert.deepEqual(o.map((x) => [x.c.pessoaId, x.nivel]), [['p06', 0], ['p04', 1], ['p03', 2], ['p08', 2], ['p07', 1], ['p09', 2], ['p10', 2], ['p11', 0]]);
  assert.equal(o[0].liderados, 2);
  assert.equal(o[2].liderId, 'p04');
  assert.equal(o[7].semPosicao, true);
  assert.equal(o[0].semPosicao, false);
  // Sem topo salvo: quem lidera e não tem líder vira raiz; alguém só no topo (sem liderados) também tem posição.
  const sem = AN.ordemOrganograma(COLABS, REL, []);
  assert.equal(sem[0].c.pessoaId, 'p06');
  const soTopo = AN.ordemOrganograma(COLABS, REL, ['p11', 'p06']);
  assert.deepEqual(soTopo.slice(0, 2).map((x) => [x.c.pessoaId, x.semPosicao]), [['p11', false], ['p06', false]]);
  assert.deepEqual(AN.ordemOrganograma([], REL, ['p06']), []);
});

test('teste DISC e parte 2 por pessoa: respondeu, falta, parte 2 feita / falta / responder de novo / não pedida / sem link', () => {
  const marta = COLABS[0], paulo = COLABS[2], lucas = COLABS[4];
  assert.deepEqual(AN.situacaoDisc(marta, PROC_P2), { respondeu: true, em: '2026-10-04T10:00:00Z', codigo: 'DI', parte2: 'feita' });
  assert.equal(AN.situacaoDisc(paulo, PROC_P2).parte2, 'refazer', 'respondeu antes de a parte 2 ser ligada');
  assert.equal(AN.situacaoDisc(lucas, PROC_P2).parte2, 'falta');
  assert.equal(AN.situacaoDisc(lucas, PROC_P2).respondeu, false);
  assert.equal(AN.situacaoDisc(paulo, PROC_P1).parte2, 'nao_pedida');
  assert.equal(AN.situacaoDisc(marta, PROC_P1).parte2, 'feita', 'respondida quando o link pedia');
  assert.equal(AN.situacaoDisc(lucas, null).parte2, 'sem_link');
  assert.equal(AN.parte2Ligada({ config: {} }), false);
  const r = AN.resumoDisc(COLABS, PROC_P2);
  assert.equal(r.total, 8);
  assert.equal(r.responderam, 5);
  assert.deepEqual(r.faltam.map((c) => c.pessoaId), ['p08', 'p10', 'p11']);
  assert.equal(r.parte2Feitas, 4);
  assert.equal(AN.textoResumoDisc(r, PROC_P2), '5 de 8 colaboradores responderam · faltam 3 · parte 2: 4 de 8');
  assert.equal(AN.textoResumoDisc(AN.resumoDisc(COLABS, PROC_P1), PROC_P1), '5 de 8 colaboradores responderam · faltam 3');
  assert.equal(AN.textoResumoDisc(AN.resumoDisc(COLABS, null), null), '5 de 8 colaboradores responderam · faltam 3 · ainda não há link do teste da equipe');
  assert.equal(AN.textoResumoDisc(AN.resumoDisc([COLABS[0]], PROC_P1), PROC_P1), '1 de 1 colaborador respondeu · todos responderam');
  const inativo = Object.assign({}, PROC_P1, { ativa: false });
  assert.equal(AN.textoResumoDisc(AN.resumoDisc(COLABS, inativo), inativo), '5 de 8 colaboradores responderam · faltam 3 · o link do teste da equipe está desativado');
  assert.equal(AN.textoResumoDisc(AN.resumoDisc([], PROC_P1), PROC_P1), 'nenhum colaborador cadastrado ainda');
});

test('pesquisa de clima: só contagens por rodada e equipe; nada dos links pessoais, tokens nem identificadas', () => {
  const m = AN.modeloClima(RODADA_ID);
  assert.deepEqual(Object.keys(m).sort(), ['convidados', 'equipes', 'id', 'modo', 'nome', 'respondentes', 'status', 'taxa']);
  assert.deepEqual(m.equipes.map((e) => Object.keys(e).sort()), [0, 1].map(() => ['area', 'convidados', 'id', 'nome', 'respondentes', 'taxa']));
  assert.deepEqual(m.equipes.map((e) => [e.nome, e.respondentes, e.convidados, e.taxa]), [['Equipe de Diego E.', 2, 2, 100], ['Equipe de Paulo M.', 1, 2, 50]]);
  const json = JSON.stringify(m);
  for (const n of NOMES_CONVITES) {
    assert.ok(!json.includes(n), n);
    assert.ok(!json.includes(n.split(' ')[0]), 'nem o primeiro nome: ' + n);
  }
  for (const proibido of ['usado', 'token', 'convites', 'identificadas', 'pessoaId', 'metodos', 'p03', 'p08', 'p09', 'p10']) assert.ok(!json.includes(proibido), proibido);
  assert.equal(AN.textoResumoClima(m), 'aberta · 3 de 6 responderam (50%) · identificada');
  assert.equal(AN.textoResumoClima(AN.modeloClima(RODADA_ANTIGA)), 'encerrada · 19 de 23 responderam (83%) · anônima');
  assert.equal(AN.modeloClima({ modo: 'xyz' }).modo, 'anonima');
  assert.equal(AN.rodadaEmFoco([RODADA_ANTIGA, RODADA_ID]).id, 'r2', 'a aberta primeiro');
  assert.equal(AN.rodadaEmFoco([RODADA_ANTIGA]).id, 'r1');
  assert.equal(AN.rodadaEmFoco([]), null);
});

test('Feedback 360: avaliado só com números de grupo (sem chefia e autoavaliação); avaliador só "recebe N links" e só com o ciclo aberto', () => {
  const f = AN.modeloF360(CICLO_ABERTO);
  assert.equal(f.aberto, true);
  assert.deepEqual(f.avaliados.p04, { aberto: true, respostas: 1, convidados: 3, minimo: 3, liberado: false, devolutivaEm: '', publicado: false });
  assert.deepEqual(f.avaliados.p07, { aberto: true, respostas: 4, convidados: 4, minimo: 3, liberado: false, devolutivaEm: '', publicado: false });
  assert.deepEqual(f.links, { p04: 1, p06: 2, p03: 2, p07: 1 });
  assert.equal(f.respondidos, 7);
  assert.equal(f.formularios, 11);
  const json = JSON.stringify(f);
  for (const proibido of ['token', 'fonte', 'chefia', 'auto', 'respondeu', 'Carla', 'Marta', 'avaliadoId', '"a1"', '"a2"']) assert.ok(!json.includes(proibido), proibido);
  assert.equal(AN.textoResumoF360(f, AGORA), 'coleta aberta · 7 de 11 formulários respondidos · encerramento previsto 27/10');

  const e = AN.modeloF360(CICLO_ENCERRADO);
  assert.deepEqual(e.links, {}, 'encerrado: a lista de quem foi convidado não aparece (nem com manterLista)');
  assert.deepEqual(e.avaliados.p06, { aberto: false, respostas: 6, convidados: 6, minimo: 3, liberado: true, devolutivaEm: '2026-08-19T10:00:00Z', publicado: true });
  assert.equal(e.avaliados.p07.liberado, false);
  assert.equal(AN.textoResumoF360(e), 'encerrado · 1 de 2 líderes com relatório liberado · 1 devolutiva feita');
  assert.equal(AN.cicloEmFoco([CICLO_ENCERRADO, CICLO_ABERTO]).id, 'f2');
  assert.equal(AN.cicloEmFoco([]), null);
});

test('quadro inteiro: linha por pessoa sem nada de clima; bloco do clima só com equipes e números; 360 só agregado', () => {
  const q = AN.montarQuadro({ colaboradores: COLABS, relacoes: REL, topoIds: ['p06'], processo: PROC_P2,
    clima: { rodadas: [RODADA_ANTIGA, RODADA_ID] }, f360: { ciclos: [CICLO_ENCERRADO, CICLO_ABERTO] } });
  assert.deepEqual(q.linhas.map((l) => l.pessoaId), ['p06', 'p04', 'p03', 'p08', 'p07', 'p09', 'p10', 'p11']);
  for (const l of q.linhas) {
    assert.deepEqual(Object.keys(l).sort(), ['area', 'cargo', 'disc', 'equipe', 'f360', 'liderados', 'links360', 'nivel', 'nome', 'pessoaId', 'semPosicao', 'telefone'],
      'nenhuma coluna de clima por pessoa');
    assert.ok(!/clima/i.test(JSON.stringify(l)), l.nome);
  }
  const porId = {};
  q.linhas.forEach((l) => { porId[l.pessoaId] = l; });
  assert.equal(porId.p03.equipe, 'Equipe de Diego E.');
  assert.equal(porId.p06.equipe, 'Topo');
  assert.equal(porId.p11.semPosicao, true);
  assert.equal(porId.p04.f360.respostas, 1);
  assert.equal(porId.p03.f360, null, 'quem só avalia não tem situação de avaliado');
  assert.equal(porId.p03.links360, 2);
  assert.equal(porId.p11.links360, 0);
  // Clima: só nomes de equipe (líder) e números, mesmo com a rodada identificada e os links pessoais na resposta da API.
  const clima = JSON.stringify(q.clima);
  for (const n of NOMES_CONVITES) assert.ok(!clima.includes(n.split(' ')[0]), n);
  const semEquipes = clima.replace(/Equipe de [A-ZÀ-Ú][a-zà-ú]+ [A-Z]\./g, '');
  for (const c of COLABS) assert.ok(!semEquipes.includes(c.nome.split(' ')[0]), 'fora do nome da equipe: ' + c.nome);
  assert.equal(q.clima.foco.id, 'r2');
  assert.deepEqual(q.clima.rodadas.map((r) => r.id), ['r2', 'r1']);
  // Ciclo encerrado em foco: ninguém aparece como "recebe links".
  const q2 = AN.montarQuadro({ colaboradores: COLABS, relacoes: REL, topoIds: ['p06'], processo: PROC_P2, clima: { rodadas: [] }, f360: { ciclos: [CICLO_ENCERRADO] } });
  assert.ok(q2.linhas.every((l) => l.links360 === null));
  assert.equal(q2.clima.foco, null);
  // Carregando ou com erro: sem clima e sem 360 no quadro.
  const q3 = AN.montarQuadro({ colaboradores: COLABS, relacoes: REL, processo: null, clima: { erro: 'x' }, f360: null });
  assert.equal(q3.clima, null);
  assert.equal(q3.f360, null);
  assert.ok(q3.linhas.every((l) => l.f360 === null && l.links360 === null));
  assert.deepEqual(q3.linhas.map((l) => l.disc.parte2), ['feita', 'feita', 'feita', 'sem_link', 'sem_link', 'feita', 'sem_link', 'sem_link']);
});

test('lembretes: o do grupo vai SEM nomes (decisão do dono); o pessoal chama pelo primeiro nome; a marca certa', () => {
  const g = AN.mensagemLembrete({ empresa: 'Clínica Exemplo', link: 'https://x/index.html?a=EQP1', nomes: ['Tiago Modelo Sem Teste', 'Lucas Fictício Exemplo', 'Bia de Souza'], minutos: 15 });
  assert.match(g, /^Olá, pessoal! Lembrete da avaliação de perfil da equipe da Clínica Exemplo, conduzida pela Gestão sem Caos\./);
  assert.match(g, /Se você ainda não respondeu, responda pelo link abaixo:\nhttps:\/\/x\/index\.html\?a=EQP1\n\nLeva cerca de 15 minutos/);
  assert.ok(!/Tiago|Lucas|Bia|Modelo|Fictício|Souza|falta a resposta de/.test(g), 'nenhum nome vai para o grupo');
  const p = AN.mensagemPessoal({ empresa: 'Clínica Exemplo', nome: 'Tiago Modelo Sem Teste', link: 'https://x/index.html?a=EQP1', minutos: 10 });
  assert.match(p, /^Olá, Tiago! Lembrete: a Clínica Exemplo está fazendo uma avaliação de perfil da equipe, conduzida pela Gestão sem Caos, e ainda falta a sua resposta\./);
  assert.match(p, /\nhttps:\/\/x\/index\.html\?a=EQP1\n\nLeva cerca de 10 minutos/);
  for (const t of [g, p]) assert.ok(!/notus/i.test(t));
  assert.equal(AN.nomeCurto('maria da silva'), 'Maria S.');
  assert.equal(AN.dataCurta('2026-10-04T10:00:00Z', AGORA), '04/10');
  assert.equal(AN.dataCurta('2025-12-02T10:00:00Z', AGORA), '02/12/2025');
  assert.equal(AN.dataCurta('2026-10-27', AGORA), '27/10');
  assert.equal(AN.dataCurta('', AGORA), '');
});

test('código: o quadro não lê dado de resposta individual do clima nem do 360 (só contagens) e não chama a tela de uso interno', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-andamento.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
  for (const proibido of ['climaIdentificacao', 'climaComentarios', 'f360Comentarios', 'climaResultado', '.usado', 'identificadas', 'tokenEquipe', 'tokenLider', '.token', '.fonte']) {
    assert.ok(!src.includes(proibido), proibido);
  }
  // A lista de convites (só existe com o 360 aberto) é lida num único lugar, para contar links por pessoa.
  assert.equal((src.match(/convites/g) || []).length, 1);
  assert.match(src, /if \(aberto\) \(c\.convites \|\| \[\]\)\.forEach\(function \(x\) \{ if \(x && x\.pessoaId\) links\[/);
});
