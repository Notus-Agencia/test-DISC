'use strict';
// Versão do dono × versão técnica dos relatórios de equipe e "Como liderar" (js/versao-tecnica.js; decisão do painel
// científico, docs/painel-cientifico/decisao.md, seção 4, linha 12):
//   - a versão do dono (padrão) NUNCA traz a distância entre o estilo natural e o que o cargo pede (capítulo, barras por
//     pessoa, esforço de adaptação, exigido no mapa) — no lugar, "Este capítulo é liberado só para leitura por psicólogo(a).";
//   - a técnica sai completa e com "Leitura técnica: <nome> · CRP <RR/NNNNN>" em todas as páginas (e no pé da impressão);
//   - validação do CRP (formato, sem consulta externa) e do nome; API simulada e cliente Supabase (dois links, histórico).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const VT = require('../js/versao-tecnica.js');
const V = require('../js/relatorio-view.js');
const M = require('../js/relatorio-modelos.js');
const AV = require('../js/lideranca-avancado.js');
const SIM = require('../js/api-simulada.js');
const SB = require('../js/api-supabase.js');
const API = require('../js/api.js');
const AD = require('../js/admin.js');
const S = require('../js/scoring.js');
const EQUIPE_V1 = require('./fixtures/relatorio-equipe-v1.json');

const GERADO = '2026-10-05T12:00:00.000Z';
const EXIGIDO_DI = '4321'.repeat(10);
const RES = {
  DI: { percentuais: { D: 45, I: 25, S: 15, C: 15 }, codigo: 'DI' },
  SC: { percentuais: { D: 15, I: 20, S: 45, C: 20 }, codigo: 'SC' },
  CS: { percentuais: { D: 10, I: 15, S: 25, C: 50 }, codigo: 'CS' },
  IS: { percentuais: { D: 20, I: 40, S: 25, C: 15 }, codigo: 'IS' }
};
const LEITURA = { nome: 'Fulana de Tal', crp: '06/12345' };
const LINHA = 'Leitura técnica: Fulana de Tal · CRP 06/12345';
const RESTRITO = 'Este capítulo é liberado só para leitura por psicólogo(a).';

function equipeComParte2() {
  return M.equipe({
    empresa: { nome: 'Clínica Exemplo' }, consultor: 'Consultor Exemplo',
    colaboradores: [
      { pessoaId: 'a', nome: 'Ana Paula Souza', cargo: 'Diretora', resultado: RES.DI },
      { pessoaId: 'b', nome: 'Bruno Lima', cargo: 'Gerente', resultado: RES.SC, exigido: EXIGIDO_DI },
      { pessoaId: 'c', nome: 'Carla Dias', cargo: 'Analista', resultado: RES.CS, exigido: { percentuais: { D: 35, I: 30, S: 15, C: 20 }, codigo: 'DI' } },
      { pessoaId: 'e', nome: 'Eva Nunes', cargo: 'Atendimento', resultado: RES.IS }
    ],
    relacoes: [{ de: 'a', para: 'b', tipo: 'lidera' }, { de: 'b', para: 'c', tipo: 'lidera' }, { de: 'a', para: 'e', tipo: 'lidera' }]
  }, { geradoEm: GERADO });
}
function liderancaComParte2(avancado) {
  return M.lideranca({ pessoa: { nome: 'Bruno Lima', cargo: 'Gerente', resultado: RES.SC, exigido: EXIGIDO_DI },
    lider: { nome: 'Ana Paula Souza', resultado: RES.DI }, empresa: { nome: 'Clínica Exemplo' } }, avancado ? { geradoEm: GERADO, avancado: AV } : { geradoEm: GERADO });
}
const comLeitura = (d, l) => Object.assign({}, d, { leituraTecnica: l || LEITURA });
const texto = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
// Tudo o que é da Parte 2 no documento (nunca na versão do dono).
const RE_PARTE2_HTML = /distancia-doc|liderado-doc__dist|barra--dist|class="natex|mapa-rf__exigido|mapa-rf__seta|mapa-rf--exigido|data-leitura="tecnica"|data-leitura-tecnica/;
const RE_PARTE2_TEXTO = /Índice de esforço|Esforço moderado|Esforço baixo|Esforço alto|responderam a segunda parte do teste|Fator que os cargos mais pedem|Em média, (o que )?os cargos|Não mede estresse|exigido pelo trabalho|o que o trabalho pede|o que o cargo pede, na percepção|Leitura técnica:/;

/* ------------------------------------------------------------------ CRP e nome */

test('CRP: formato RR/NNNNN (região 01–99 com 2 dígitos + número de 3 a 6 dígitos), normalizado', () => {
  const validos = { '06/12345': '06/12345', 'CRP 06/12345': '06/12345', 'crp-06/12345': '06/12345', 'CRP: 06/12345': '06/12345',
    ' 06 / 12345 ': '06/12345', '06-123456': '06/123456', '01/123': '01/123', '24/004567': '24/004567' };
  for (const [ent, sai] of Object.entries(validos)) assert.equal(VT.normalizarCrp(ent), sai, ent);
  for (const ruim of ['', null, undefined, '6/12345', '006/12345', '00/12345', '06/12', '06/1234567', '06/0000', '0612345', '06 12345',
    'RR/NNNNN', '06/12345a', 'ab/12345', '06/12.345', '06//12345', 'CRP', '<b>06/12345</b>', 42]) {
    assert.equal(VT.normalizarCrp(ruim), '', String(ruim));
  }
});

test('nome de quem vai ler: nome e sobrenome, só letras (com acento), ponto, hífen e apóstrofo', () => {
  assert.equal(VT.normalizarNomeLeitor('  Fulana   de  Tal '), 'Fulana de Tal');
  assert.equal(VT.normalizarNomeLeitor('Dra. Maria Souza'), 'Dra. Maria Souza');
  assert.equal(VT.normalizarNomeLeitor("João D'Ávila-Neto"), "João D'Ávila-Neto");
  for (const ruim of ['', 'Fulana', 'A B', 'Ana 3', '<b>Ana</b> Souza', 'Ana "Lu" Souza', 'Ana Souza; drop', 'x'.repeat(60) + ' ' + 'y'.repeat(60), null]) {
    assert.equal(VT.normalizarNomeLeitor(ruim), '', String(ruim));
  }
  assert.deepEqual(VT.validarLeitor({ nome: 'Fulana', crp: '06/12345' }), { ok: false, erro: VT.MSG_NOME, campo: 'nome' });
  assert.deepEqual(VT.validarLeitor({ nome: 'Fulana de Tal', crp: '6/1' }), { ok: false, erro: VT.MSG_CRP, campo: 'crp' });
  assert.deepEqual(VT.validarLeitor({ nome: ' Fulana  de Tal', crp: 'CRP 06-12345' }), { ok: true, nome: 'Fulana de Tal', crp: '06/12345' });
  assert.equal(VT.linhaLeitura(LEITURA), LINHA);
  assert.equal(VT.linhaLeitura({ nome: 'Fulana de Tal', crp: 'x' }), '');
  assert.match(VT.MSG_CRP, /RR\/NNNNN/);
  assert.equal(VT.AVISO_CRP, 'Ao informar o CRP, você declara que o relatório será lido por esse(a) profissional; a informação fica registrada.');
  assert.equal(VT.TEXTO_RESTRITO, RESTRITO);
});

/* ------------------------------------------------------------------ versão do dono (dados) */

test('versaoDono (equipe): sem pressao, sem exigido por colaborador e no mapa; restrito: true; o resto igual', () => {
  const d = equipeComParte2();
  assert.ok(d.pressao && d.colaboradores.some((c) => c.exigido) && d.mapa.pontos.some((p) => p.exigido), 'fixture tem Parte 2');
  const dono = VT.versaoDono(Object.assign({}, d, { leituraTecnica: LEITURA }));
  assert.equal('pressao' in dono, false);
  assert.ok(dono.colaboradores.every((c) => !('exigido' in c)));
  assert.ok(dono.mapa.pontos.every((p) => !('exigido' in p)));
  assert.equal(dono.restrito, true);
  assert.equal('leituraTecnica' in dono, false, 'leitura técnica nunca vem do snapshot');
  for (const k of ['sumario', 'organograma', 'equilibrio', 'pares', 'liderancas', 'decisao', 'avisos', 'numeros']) assert.deepEqual(dono[k], d[k], k);
  assert.ok(d.pressao, 'não muda o original');
  assert.equal(VT.temRestrito(d), true);
  // sem a Parte 2: nada a esconder
  const sem = M.equipe({ empresa: { nome: 'X' }, colaboradores: [{ pessoaId: 'a', nome: 'Ana Souza', resultado: RES.DI }], relacoes: [] }, { geradoEm: GERADO });
  assert.equal(VT.temRestrito(sem), false);
  assert.equal(VT.versaoDono(sem).restrito, undefined);
  // relatórios de equipe v1 já publicados (com "pressão do trabalho")
  assert.equal(VT.temRestrito(EQUIPE_V1), true);
  assert.equal('pressao' in VT.versaoDono(EQUIPE_V1), false);
});

test('versaoDono (Como liderar, v1 e avançado): sem exigido, sem a seção de esforço e sem o item do plano que a cita', () => {
  for (const av of [false, true]) {
    const d = liderancaComParte2(av);
    assert.equal(d.versao, av ? 2 : 1);
    assert.ok(d.exigido && d.secoes.some((s) => s.chave === 'esforco'));
    const dono = VT.versaoDono(d);
    assert.equal('exigido' in dono, false);
    assert.ok(!dono.secoes.some((s) => s.chave === 'esforco'));
    assert.ok(!JSON.stringify(dono.secoes).includes('Esforço de adaptação ao cargo'));
    assert.ok(dono.mapa.pontos.every((p) => !('exigido' in p)));
    assert.equal(dono.restrito, true);
    if (av) assert.deepEqual(dono.avancado, d.avancado, 'capítulos do avançado não mudam');
    const plano = dono.secoes.find((s) => s.chave === 'plano');
    assert.equal(plano.itens.length, d.secoes.find((s) => s.chave === 'plano').itens.length - 1);
  }
  // processo e pessoa: só tiram a leitura técnica/restrito (não são deste recorte)
  const pes = M.pessoa({ pessoa: { nome: 'Carla Dias', resultado: RES.CS, exigido: EXIGIDO_DI } }, { geradoEm: GERADO });
  assert.deepEqual(VT.versaoDono(Object.assign({}, pes, { restrito: true })), pes);
  assert.equal(VT.temRestrito(pes), false);
});

/* ------------------------------------------------------------------ documento: dono nunca, técnica sempre */

const CASOS = {
  'equipe v2': () => equipeComParte2(),
  'equipe v1 (já publicado)': () => JSON.parse(JSON.stringify(EQUIPE_V1)),
  'como liderar v1': () => liderancaComParte2(false),
  'como liderar avançado': () => liderancaComParte2(true)
};

for (const [nome, gerar] of Object.entries(CASOS)) {
  test('versão do dono nunca contém o capítulo nem as barras da Parte 2 — ' + nome, () => {
    const d = gerar();
    // sem leitura, com leitura inválida, com "restrito" falso ou com a leitura escondida no snapshot: sempre a do dono
    for (const variante of [d, comLeitura(d, { nome: 'Fulana de Tal', crp: '6/123' }), comLeitura(d, { nome: '<b>X</b>', crp: '06/12345' }),
      Object.assign({}, d, { restrito: false }), comLeitura(d, 'Fulana de Tal · CRP 06/12345')]) {
      const html = V.montarHtml(variante);
      assert.match(html, /data-leitura="dono"/);
      assert.doesNotMatch(html.replace('data-leitura="dono"', ''), RE_PARTE2_HTML);
      assert.doesNotMatch(texto(html), RE_PARTE2_TEXTO);
      assert.ok(html.includes(RESTRITO), 'a linha no lugar do conteúdo');
    }
  });

  test('versão técnica traz o conteúdo e "Leitura técnica: nome · CRP" em todas as páginas — ' + nome, () => {
    const html = V.montarHtml(comLeitura(gerar()));
    assert.match(html, /data-leitura="tecnica"/);
    assert.ok(!html.includes(RESTRITO), 'nada escondido');
    assert.match(html, /distancia-doc|class="natex"/, 'o capítulo da Parte 2 está lá');
    if (/^equipe/.test(nome)) assert.match(html, /class="liderado-doc__dist"/, 'barras por pessoa no guia do líder');
    // capa, índice e cada página (seção) com a linha
    const capa = html.slice(html.indexOf('data-secao="capa"'), html.indexOf('data-secao="indice"'));
    assert.ok(capa.includes(LINHA), 'capa');
    if (html.includes('id="indice"')) {   // o "Como liderar" v1 não tem índice
      const indice = html.slice(html.indexOf('id="indice"'), html.indexOf('<section class="secao'));
      assert.ok(indice.includes(LINHA), 'índice');
    }
    const secoes = html.split('<section class="secao').slice(1).map((s) => s.slice(0, s.indexOf('</section>')));
    assert.ok(secoes.length >= 3);
    secoes.forEach((s, i) => assert.ok(s.includes('data-leitura-tecnica') && s.includes(LINHA), 'página ' + (i + 1)));
    const rodape = html.slice(html.indexOf('data-secao="rodape"'));
    assert.ok(rodape.includes(LINHA), 'rodapé');
    // impressão: a linha no pé de todas as folhas (@page)
    assert.match(html, /<style data-leitura-tecnica-impressao="">@media print \{ @page \{ @bottom-center \{ content: "Leitura técnica: Fulana de Tal · CRP 06\/12345";/);
  });
}

test('versão técnica: a página escapa o nome e não aceita leitura fora do formato', () => {
  const d = equipeComParte2();
  // só passa nome válido (letras): nada de HTML ou aspas no documento nem no CSS da impressão
  const html = V.montarHtml(comLeitura(d, { nome: "Ana D'Ávila Souza", crp: 'CRP 06-123456' }));
  assert.ok(html.includes('Leitura técnica: Ana D&#39;Ávila Souza · CRP 06/123456'));
  assert.ok(html.includes('content: "Leitura técnica: Ana D\'Ávila Souza · CRP 06/123456"'));
});

/* ------------------------------------------------------------------ páginas e painel */

test('relatorio.html e admin.html carregam js/versao-tecnica.js antes do relatorio-view.js', () => {
  for (const pag of ['relatorio.html', 'admin.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', pag), 'utf8');
    const i = html.indexOf('<script src="js/versao-tecnica.js"></script>');
    assert.ok(i > 0, pag);
    assert.ok(i < html.indexOf('<script src="js/relatorio-view.js"></script>'), pag);
  }
});

test('painel: linha do histórico da versão técnica', () => {
  const em = '2026-10-13T17:32:00.000Z';
  const quando = AD.textoLeituraTecnica({ acao: 'gerada', nome: 'Fulana de Tal', crp: '06/12345', por: 'Wellington', em });
  assert.match(quando, /^Gerada para Fulana de Tal \(CRP 06\/12345\) por Wellington em \d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
  assert.match(AD.textoLeituraTecnica({ acao: 'despublicada', nome: 'Fulana de Tal', crp: '06/12345', por: '', em }),
    /^Link de Fulana de Tal \(CRP 06\/12345\) despublicado por um administrador em /);
  assert.equal(AD.textoLeituraTecnica(null), '');
});

/* ------------------------------------------------------------------ API simulada (prévia) */

function localStorageFalso() {
  const dados = {};
  return { dados, getItem: (k) => (k in dados ? dados[k] : null), setItem: (k, v) => { dados[k] = String(v); }, removeItem: (k) => { delete dados[k]; } };
}

test('API simulada: dois links (dono e técnico), validação, histórico, despublicar um não afeta o outro', async () => {
  const armazenamento = localStorageFalso();
  const api = SIM.criar({ armazenamento, scoring: S, latenciaMs: 0 });
  const T = (await api.login('admin@previa.com', 'previa123')).token;
  const eu = (await api.eu(T)).usuario;
  const clinica = (await api.listarEmpresas(T)).empresas.find((x) => x.nome === 'Clínica Exemplo');
  const dados = equipeComParte2();
  // o snapshot nunca grava leitura técnica (nem "restrito")
  const r = (await api.salvarRelatorioModelo(T, { modelo: 'equipe', empresaId: clinica.id, dados: Object.assign({}, dados, { leituraTecnica: LEITURA, restrito: false }), publicar: true })).relatorio;
  const aberto = (await api.abrirRelatorioModelo(T, r.id)).relatorio.dados;
  assert.equal('leituraTecnica' in aberto, false);
  assert.equal('restrito' in aberto, false);
  assert.ok(aberto.pressao, 'o painel guarda o snapshot completo');

  // link do dono: sem a Parte 2
  const pubDono = await api.relatorioPublico(r.token);
  assert.equal(pubDono.versao, undefined);
  assert.equal(pubDono.relatorio.restrito, true);
  assert.equal('pressao' in pubDono.relatorio, false);
  assert.ok(pubDono.relatorio.colaboradores.every((c) => !('exigido' in c)));

  // ainda sem versão técnica
  assert.deepEqual(await api.relatorioTecnico(T, r.id), { ok: true, tecnica: { status: '', token: '', nome: '', crp: '', publicadoEm: '' }, historico: [] });
  await assert.rejects(api.gerarRelatorioTecnico(T, r.id, { nome: 'Fulana de Tal', crp: '6/123' }), (e) => e.message === VT.MSG_CRP);
  await assert.rejects(api.gerarRelatorioTecnico(T, r.id, { nome: 'Fulana', crp: '06/12345' }), (e) => e.message === VT.MSG_NOME);
  await assert.rejects(api.despublicarRelatorioTecnico(T, r.id), /não tem versão técnica/);

  const g1 = await api.gerarRelatorioTecnico(T, r.id, { nome: ' Fulana  de Tal ', crp: 'CRP 06-12345' });
  assert.equal(g1.tecnica.status, 'publicado');
  assert.match(g1.tecnica.token, /^[0-9a-f]{64}$/);
  assert.notEqual(g1.tecnica.token, r.token);
  assert.match(g1.tecnica.url, new RegExp('relatorio\\.html\\?r=' + g1.tecnica.token + '$'));
  assert.deepEqual([g1.tecnica.nome, g1.tecnica.crp], ['Fulana de Tal', '06/12345']);
  assert.deepEqual(g1.historico.map((h) => [h.acao, h.nome, h.crp, h.por]), [['gerada', 'Fulana de Tal', '06/12345', eu.nome]]);
  assert.match(g1.historico[0].em, /^\d{4}-\d{2}-\d{2}T/);

  const pubTec = await api.relatorioPublico(g1.tecnica.token);
  assert.equal(pubTec.versao, 'tecnica');
  assert.deepEqual(pubTec.leituraTecnica, LEITURA);
  assert.ok(pubTec.relatorio.pressao && !pubTec.relatorio.restrito, 'completa');
  assert.equal('leituraTecnica' in pubTec.relatorio, false, 'a leitura vem fora do snapshot');

  // gerar de novo troca o link técnico (o anterior para de abrir)
  const g2 = await api.gerarRelatorioTecnico(T, r.id, { nome: 'Beltrana Souza', crp: '05/54321' });
  assert.notEqual(g2.tecnica.token, g1.tecnica.token);
  await assert.rejects(api.relatorioPublico(g1.tecnica.token), /Relatório não encontrado ou fora do ar/);
  assert.deepEqual((await api.relatorioPublico(g2.tecnica.token)).leituraTecnica, { nome: 'Beltrana Souza', crp: '05/54321' });

  // despublicar a técnica: o link técnico para; o do dono continua
  const d1 = await api.despublicarRelatorioTecnico(T, r.id);
  assert.equal(d1.tecnica.status, 'despublicado');
  assert.equal(d1.tecnica.url, undefined);
  await assert.rejects(api.relatorioPublico(g2.tecnica.token), /Relatório não encontrado ou fora do ar/);
  assert.equal((await api.relatorioPublico(r.token)).ok, true);
  assert.deepEqual(d1.historico.map((h) => h.acao), ['despublicada', 'gerada', 'gerada']);
  assert.equal((await api.despublicarRelatorioTecnico(T, r.id)).historico.length, 3, 'já despublicada: nada muda');

  // despublicar o do dono: o técnico (gerado de novo) continua
  const g3 = await api.gerarRelatorioTecnico(T, r.id, LEITURA);
  await api.salvarRelatorioModelo(T, { id: r.id, modelo: 'equipe', empresaId: clinica.id, dados, publicar: false });
  await assert.rejects(api.relatorioPublico(r.token), /Relatório não encontrado ou fora do ar/);
  assert.equal((await api.relatorioPublico(g3.tecnica.token)).versao, 'tecnica');

  // só admin; só equipe e "Como liderar"
  const TG = (await api.login('gestor@previa.com', 'previa123')).token;
  await assert.rejects(api.gerarRelatorioTecnico(TG, r.id, LEITURA), /Sem permissão/);
  await assert.rejects(api.relatorioTecnico(TG, r.id), /Sem permissão/);
  const marta = (await api.listarEquipe(T, clinica.id)).colaboradores.find((c) => /Marta/.test(c.nome));
  const pes = (await api.salvarRelatorioModelo(T, { modelo: 'pessoa', pessoaId: marta.pessoaId, dados: { titulo: 'X' } })).relatorio;
  await assert.rejects(api.gerarRelatorioTecnico(T, pes.id, LEITURA), /Relatório não encontrado/);

  // excluir o relatório: os dois links param; o histórico fica guardado
  await api.excluirRelatorioModelo(T, r.id);
  await assert.rejects(api.relatorioPublico(g3.tecnica.token), /Relatório não encontrado ou fora do ar/);
  const historico = JSON.parse(armazenamento.dados.disc_simulada_leituras_tecnicas).filter((h) => h.relatorioId === r.id);
  assert.equal(historico.length, 4);
  assert.ok(historico.every((h) => h.porId === eu.id && h.modelo === 'equipe'));
});

test('API simulada: relatório já publicado antes (snapshot completo no banco) abre na versão do dono', async () => {
  const api = SIM.criar({ armazenamento: localStorageFalso(), scoring: S, latenciaMs: 0 });
  const T = (await api.login('admin@previa.com', 'previa123')).token;
  const clinica = (await api.listarEmpresas(T)).empresas.find((x) => x.nome === 'Clínica Exemplo');
  const r = (await api.salvarRelatorioModelo(T, { modelo: 'equipe', empresaId: clinica.id, dados: JSON.parse(JSON.stringify(EQUIPE_V1)), publicar: true })).relatorio;
  const pub = await api.relatorioPublico(r.token);
  assert.equal(pub.ok, true);
  assert.equal(pub.relatorio.restrito, true);
  assert.equal('pressao' in pub.relatorio, false);
  assert.doesNotMatch(texto(V.montarHtml(Object.assign({ modelo: pub.modelo }, pub.relatorio))), RE_PARTE2_TEXTO);
});

/* ------------------------------------------------------------------ cliente Supabase e Apps Script */

function clienteSupabase(rpcs) {
  const chamadas = [];
  const sessao = { access_token: 'jwt', refresh_token: 'r', user: { id: '11111111-1111-4111-8111-111111111111', email: 'dona@empresa.com', user_metadata: {} } };
  const lib = {
    createClient() {
      return {
        auth: { async getSession() { return { data: { session: sessao }, error: null }; } },
        async rpc(nome, args) {
          chamadas.push({ nome, args });
          if (rpcs[nome]) return rpcs[nome](args);
          return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
        },
        from() { throw new Error('não usado'); },
        functions: { async invoke() { return { data: { ok: true }, error: null }; } }
      };
    }
  };
  const api = SB.criar({ supabase: lib, url: 'https://exemplo.supabase.co', chave: 'anon', scoring: S, timeoutMs: 1000, timeoutLongoMs: 1000,
    local: { href: 'https://site.exemplo/admin.html', origin: 'https://site.exemplo', pathname: '/admin.html' } });
  return { api, chamadas };
}
const ID = '33333333-3333-4333-8333-333333333333';
const TOKEN_TEC = 'c'.repeat(64);

test('cliente Supabase: relatorioPublico repassa versão técnica e leitura; gerar valida antes e manda normalizado', async () => {
  const resposta = (tec) => ({ data: { ok: true, tecnica: tec, historico: [{ acao: 'gerada', nome: 'Fulana de Tal', crp: '06/12345', por: 'Dona', em: '2026-10-13T12:00:00+00:00' }] }, error: null });
  const { api, chamadas } = clienteSupabase({
    relatorio_publico: (a) => ({ data: a.p_token === TOKEN_TEC
      ? { ok: true, modelo: 'equipe', versao: 'tecnica', relatorio: { titulo: 'R' }, leituraTecnica: LEITURA, publicadoEm: '2026-10-13T12:00:00.000Z' }
      : { ok: true, modelo: 'equipe', relatorio: { titulo: 'R', restrito: true }, publicadoEm: '2026-10-13T12:00:00.000Z' }, error: null }),
    gerar_relatorio_tecnico: () => resposta({ status: 'publicado', token: TOKEN_TEC, nome: 'Fulana de Tal', crp: '06/12345', publicadoEm: '2026-10-13T12:00:00+00:00' }),
    despublicar_relatorio_tecnico: () => resposta({ status: 'despublicado', token: TOKEN_TEC, nome: 'Fulana de Tal', crp: '06/12345', publicadoEm: '2026-10-13T12:00:00+00:00' })
  });
  const dono = await api.relatorioPublico('d'.repeat(64));
  assert.deepEqual(dono, { ok: true, modelo: 'equipe', relatorio: { titulo: 'R', restrito: true }, publicadoEm: '2026-10-13T12:00:00.000Z' });
  const tec = await api.relatorioPublico(TOKEN_TEC);
  assert.equal(tec.versao, 'tecnica');
  assert.deepEqual(tec.leituraTecnica, LEITURA);

  await assert.rejects(api.gerarRelatorioTecnico('jwt', ID, { nome: 'Fulana de Tal', crp: '6/1' }), (e) => e.message === VT.MSG_CRP);
  assert.equal(chamadas.filter((c) => c.nome === 'gerar_relatorio_tecnico').length, 0, 'CRP inválido nem chega ao banco');
  const g = await api.gerarRelatorioTecnico('jwt', ID, { nome: ' Fulana  de Tal', crp: 'CRP 06-12345' });
  assert.deepEqual(chamadas.find((c) => c.nome === 'gerar_relatorio_tecnico').args, { p_relatorio: ID, p_nome: 'Fulana de Tal', p_crp: '06/12345' });
  assert.equal(g.tecnica.url, 'https://site.exemplo/relatorio.html?r=' + TOKEN_TEC);
  assert.deepEqual(g.historico, [{ acao: 'gerada', nome: 'Fulana de Tal', crp: '06/12345', por: 'Dona', em: '2026-10-13T12:00:00.000Z' }]);
  const d = await api.despublicarRelatorioTecnico('jwt', ID);
  assert.equal(d.tecnica.status, 'despublicado');
  assert.equal(d.tecnica.url, undefined);
  await assert.rejects(api.gerarRelatorioTecnico('jwt', 'nao-e-uuid', LEITURA), /Relatório não encontrado/);
  // banco sem a migração: o painel segue sem a versão técnica (sem quebrar)
  assert.deepEqual(await api.relatorioTecnico('jwt', ID), { ok: true, semMigracao: true, tecnica: null, historico: [] });
});

test('Apps Script (legado): versão técnica só com o servidor Supabase', async () => {
  for (const m of ['relatorioTecnico', 'gerarRelatorioTecnico', 'despublicarRelatorioTecnico']) {
    assert.ok(API.METODOS.includes(m) && SB.METODOS.includes(m) && SIM.METODOS.includes(m), m);
    await assert.rejects(API[m]('token', ID, LEITURA), (e) => e.message === 'Disponível só com o servidor Supabase.', m);
  }
});
