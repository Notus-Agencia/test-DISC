'use strict';
// "Como liderar" avançado: conteúdo por combinação (conteudo/lideranca/<CODIGO>.json -> js/lideranca-avancado-dados.js),
// montagem dos capítulos (js/lideranca-avancado.js), snapshot versão 2 do modelo 'lideranca' (js/relatorio-modelos.js)
// e desenho no documento público (js/relatorio-view.js), inclusive os relatórios antigos (versão 1) já publicados.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LA = require('../js/lideranca-avancado.js');
const DADOS = require('../js/lideranca-avancado-dados.js');
const CB = require('../js/disc-combinacoes.js');
const M = require('../js/relatorio-modelos.js');
const V = require('../js/relatorio-view.js');

const LETRAS = ['D', 'I', 'S', 'C'];
const GERADO = '2026-10-10T12:00:00.000Z';
const CAPITULOS = ['feedback', 'delegacao', 'motivacao', 'retencao', 'desgaste', 'mudanca', 'conflito', 'um_a_um', 'plano90', 'voce'];
// Linguagem marcada por gênero para a pessoa avaliada, rótulos clínicos, exclusão e marca da agência.
const GENERO = /(^|[^a-zà-ÿ])(ele|ela|eles|elas|dele|dela|deles|delas|nele|nela|neles|nelas)(?![a-zà-ÿ])|\b(o|a|do|da|ao|à|pelo|pela|um|uma) (colaborador|colaboradora|funcion[áa]ri[oa]|liderad[oa])\b/i;
const CLINICO = /(^|[^a-zà-ÿ])(ansied|ansios|depress|burnout|transtorn|diagn[oó]st|s[ií]ndrome|doen[çc]|adoec|patol[oó]g|neuro|c[ée]rebr|t[oó]xic|surto)/i;
const EXCLUSAO = /n[aã]o contrat|descart|elimin|reprov|demit/i;
const MERCADO = /\b(Executor|Comunicador|Planejador|Analista|Inovador|Empreendedor|Comandante|Aconselhador|Especialista|Protetor|Solucionador|Competidor|Articulador|Julgador|Organizador|Integrador|Influenciador|Inventivo|Motivador|Vendedor|Diplomata|Atendente|Professoral|Estrategista|Controlador|Administrador)\b/i;
const palavras = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// Resultado DISC que cai na combinação pedida (regra de DISC_COMBINACOES.codigo).
function resultadoPara(cod) {
  const p = { D: 20, I: 20, S: 20, C: 20 };
  if (cod.length === 1) { p[cod] = 40; return { percentuais: p, codigo: cod + LETRAS.filter((l) => l !== cod)[0] }; }
  const outros = LETRAS.filter((l) => l !== cod[0] && l !== cod[1]);
  p[cod[0]] = 30; p[cod[1]] = 28; p[outros[0]] = 21; p[outros[1]] = 21;
  return { percentuais: p, codigo: cod };
}
function textos(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => textos(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => textos(x, out));
  return out;
}
function palavrasDe(v) { return textos(v).reduce((n, t) => n + palavras(t), 0); }

test('conteúdo: as mesmas 16 combinações do relatório pessoal avançado, um JSON por combinação', () => {
  assert.deepEqual(Object.keys(DADOS).sort(), CB.CODIGOS.slice().sort());
  const pasta = path.join(__dirname, '..', 'conteudo', 'lideranca');
  const arquivos = fs.readdirSync(pasta).filter((a) => a.endsWith('.json')).sort();
  assert.deepEqual(arquivos, CB.CODIGOS.map((c) => c + '.json').sort());
  const profundo = fs.readdirSync(path.join(__dirname, '..', 'conteudo', 'profundo')).filter((a) => a.endsWith('.json')).sort();
  assert.deepEqual(arquivos, profundo);
});

test('o gerado está em dia com os JSONs e o validador recusa conteúdo fora das regras', async () => {
  const S = await import('../scripts/montar-lideranca.mjs');
  const { dados, erros } = S.lerConteudo();
  assert.deepEqual(erros, []);
  assert.equal(fs.readFileSync(path.join(__dirname, '..', 'js', 'lideranca-avancado-dados.js'), 'utf8').replace(/\r\n/g, '\n'), S.gerar(dados));
  const bom = JSON.parse(JSON.stringify(DADOS.DI));
  assert.deepEqual(S.checarConteudo(bom), []);
  const casos = [
    [(d) => { d.feedback.texto += ' Quando ela erra, avise.'; }, /gênero/],
    [(d) => { d.retencao.fica[0] = 'O colaborador fica quando tem desafio e reconhecimento visível.'; }, /gênero/],
    [(d) => { d.desgaste.sinais_fortes[0] = 'Sinais de ansiedade frequentes durante as reuniões da semana.'; }, /proibido/],
    [(d) => { d.desgaste.texto += ' Pode ser burnout.'; }, /proibido/],
    [(d) => { d.retrato[0] += ' Perfil de Executor nato.'; }, /proibido/],
    [(d) => { d.conflito.frase += ' Fale com a Notus.'; }, /proibido/],
    [(d) => { d.plano_90.dias_30[0] = 'Apresente {cargo} ao time e aos clientes principais da empresa.'; }, /marcador/],
    [(d) => { d.feedback.frases = d.feedback.frases.slice(0, 2); }, /feedback\.frases/],
    [(d) => { delete d.um_a_um; }, /um_a_um/],
    [(d) => { delete d.voce_e_esta_pessoa.C; }, /voce_e_esta_pessoa\.C/]
  ];
  for (const [mexer, esperado] of casos) {
    const d = JSON.parse(JSON.stringify(DADOS.DI));
    mexer(d);
    const e = S.checarConteudo(d);
    assert.ok(e.some((m) => esperado.test(m)), esperado + ' -> ' + JSON.stringify(e));
  }
});

for (const cod of Object.keys(DADOS)) {
  test('conteúdo ' + cod + ': capítulos obrigatórios, tamanho mínimo, linguagem neutra, sem termos proibidos', () => {
    const d = DADOS[cod];
    assert.equal(d.codigo, cod);
    for (const k of ['retrato', 'feedback', 'delegacao', 'motivacao', 'retencao', 'desgaste', 'mudanca', 'conflito', 'um_a_um', 'plano_90', 'voce_e_esta_pessoa']) {
      assert.ok(d[k], cod + ': falta ' + k);
    }
    assert.ok(palavrasDe(d) >= 2500, cod + ': ' + palavrasDe(d) + ' palavras');
    assert.ok(d.feedback.frases.length >= 5 && d.feedback.frases.every((f) => f.situacao && palavras(f.frase) >= 12), cod + ': frases prontas');
    assert.ok(d.feedback.funciona.length >= 4 && d.feedback.da_errado.length >= 4);
    assert.ok(palavras(d.delegacao.exemplo) >= 40 && d.delegacao.combinar.length >= 4);
    for (const k of ['autonomia', 'competencia', 'vinculo']) assert.ok(palavras(d.motivacao[k]) >= 25, cod + ': motivacao.' + k);
    assert.ok(d.retencao.fica.length >= 4 && d.retencao.sai.length >= 4 && d.retencao.perguntas.length >= 3);
    assert.ok(d.desgaste.sinais_iniciais.length >= 4 && d.desgaste.sinais_fortes.length >= 3 && d.desgaste.como_agir.length >= 4);
    assert.ok(d.mudanca.antes.length >= 3 && d.mudanca.durante.length >= 3 && d.mudanca.depois.length >= 3);
    assert.ok(d.conflito.gatilhos.length >= 4 && d.conflito.mediar.length >= 5);
    assert.ok(palavras(d.um_a_um.frequencia) >= 20 && d.um_a_um.pauta.length >= 5 && d.um_a_um.perguntas.length >= 5);
    for (const k of ['dias_30', 'dias_60', 'dias_90']) assert.ok(d.plano_90[k].length >= 4, cod + ': plano_90.' + k);
    for (const l of LETRAS) assert.ok(palavras(d.voce_e_esta_pessoa[l].texto) >= 40 && d.voce_e_esta_pessoa[l].ajustes.length >= 3, cod + ': voce.' + l);
    for (const t of textos(d)) {
      assert.doesNotMatch(t, GENERO, cod + ': ' + t);
      assert.doesNotMatch(t, CLINICO, cod + ': ' + t);
      assert.doesNotMatch(t, EXCLUSAO, cod + ': ' + t);
      assert.doesNotMatch(t, MERCADO, cod + ': ' + t);
      assert.doesNotMatch(t, /notus|whatsapp|@/i, cod + ': ' + t);
    }
  });

  test('montar ' + cod + ': 10 capítulos na ordem, blocos preenchidos, "Base" com estudo citado e nome trocado', () => {
    const r = resultadoPara(cod);
    assert.equal(CB.codigo(r.percentuais, r.codigo), cod);
    const av = LA.montar(r, { nome: 'Ana P.', lider: null });
    assert.ok(av, cod);
    assert.equal(av.combinacao.codigo, cod);
    assert.equal(av.combinacao.puro, cod.length === 1);
    assert.deepEqual(av.capitulos.map((c) => c.id), CAPITULOS);
    assert.deepEqual(av.capitulos.map((c) => c.numero), CAPITULOS.map((c, i) => i + 1));
    assert.equal(av.retrato.length, DADOS[cod].retrato.length);
    for (const c of av.capitulos) {
      assert.ok(c.titulo && c.intro && c.meta, cod + ' ' + c.id);
      assert.ok(c.blocos.length >= 2, cod + ' ' + c.id + ': blocos');
      assert.match(c.base, /^Base: .+\(\d{4}\)/, cod + ' ' + c.id + ': linha Base');
      // Todo ano citado na linha "Base" corresponde a uma referência dos Fundamentos cujo 1º autor aparece na linha.
      for (const m of c.base.matchAll(/\((\d{4})\)/g)) {
        assert.ok(av.fundamentos.some((f) => f.includes('(' + m[1] + ')') && c.base.includes(f.split(',')[0])), cod + ' ' + c.id + ': ' + m[0] + ' fora dos Fundamentos');
      }
    }
    const json = JSON.stringify(av);
    assert.deepEqual(JSON.parse(json), av);
    assert.doesNotMatch(json, /\{nome\}|undefined|NaN|\[object/);
    assert.doesNotMatch(json, /notus/i);
    // Linguagem neutra em todo texto do guia (a frase oficial da combinação vem de js/disc-combinacoes.js e fica de fora:
    // os pronomes dela falam de coisas, não da pessoa).
    for (const t of textos([av.retrato, av.capitulos, av.fundamentos])) assert.doesNotMatch(t, GENERO, cod + ': ' + t);
    const fb = av.capitulos[0];
    assert.ok(fb.blocos.find((b) => b.tipo === 'frases').itens.length >= 5);
    const dg = av.capitulos.find((c) => c.id === 'desgaste');
    const alerta = dg.blocos.find((b) => b.tipo === 'alerta');
    assert.match(alerta.titulo, /sinal é forte/);
    assert.ok(alerta.itens.some((t) => /apoio profissional/.test(t)) && alerta.itens.some((t) => /CVV \(ligue 188/.test(t)));
    const voce = av.capitulos.find((c) => c.id === 'voce');
    assert.deepEqual(voce.blocos.find((b) => b.tipo === 'estilos').itens.map((e) => e.letra), LETRAS, 'sem líder: os 4 estilos');
  });
}

test('referências: só as dos estudos de base, com autor e ano, e cada uma usada em algum capítulo ou no DISC', () => {
  assert.ok(LA.FUNDAMENTOS.length >= 12);
  for (const autor of ['Kluger', 'Locke', 'Deci', 'Bakker', 'Edmondson', 'Mitchell', 'Kotter', 'De Dreu', 'Rogelberg', 'Bauer', 'Graen', 'Marston', 'Hattie', 'Griffeth']) {
    assert.ok(LA.FUNDAMENTOS.some((f) => f.startsWith(autor)), autor);
  }
  const bases = LA.CAPITULOS.map((c) => c.base).join(' ');
  for (const f of LA.FUNDAMENTOS) {
    const autor = f.split(',')[0];
    if (autor === 'Marston') continue;   // origem do DISC, citada só nos Fundamentos
    assert.ok(bases.includes(autor.replace(/^De Dreu$/, 'De Dreu')), autor + ' citado em alguma linha Base');
  }
  for (const f of LA.FUNDAMENTOS) assert.match(f, /\(\d{4}\)\./, f);
});

test('você e esta pessoa: com os percentuais do líder, só o estilo dele marcado e as diferenças de 20+ pontos', () => {
  // pessoa DI (D 36, I 31) liderada por SC (S 38, C 28): D −22 e S +23 => duas diferenças.
  const r = { percentuais: { D: 36, I: 31, S: 15, C: 18 }, codigo: 'DI' };
  const av = LA.montar(r, { nome: 'Marina C.', lider: { nome: 'Paulo M.', percentuais: { D: 14, I: 20, S: 38, C: 28 }, codigo: 'SC' } });
  const voce = av.capitulos.find((c) => c.id === 'voce');
  assert.match(voce.blocos[0].texto, /^Seu estilo: SC, com Estabilidade 38% como fator principal\. Estilo de Marina C\.: DI, com Dominância 36%\./);
  const est = voce.blocos.find((b) => b.tipo === 'estilos').itens;
  assert.equal(est.length, 1);
  assert.equal(est[0].letra, 'S');
  assert.equal(est[0].atual, true);
  assert.deepEqual(est[0].ajustes, DADOS.DI.voce_e_esta_pessoa.S.ajustes);
  const dif = voce.blocos.find((b) => b.tipo === 'grupos' && b.itens[0].titulo === 'Onde vocês mais diferem');
  assert.equal(dif.itens[0].itens.length, 2);
  assert.match(dif.itens[0].itens[0], /^A Dominância pesa bem mais no estilo de Marina C\. do que no seu:/);
  assert.match(dif.itens[0].itens[1], /^A Estabilidade pesa bem mais no seu estilo do que no de Marina C\.:/);
  // líder sem código: estilo primário pelos percentuais; líder sem percentuais: os 4 estilos
  const semCod = LA.montar(r, { nome: 'Marina C.', lider: { nome: 'X', percentuais: { D: 20, I: 20, S: 20, C: 40 } } });
  assert.equal(semCod.capitulos.find((c) => c.id === 'voce').blocos.find((b) => b.tipo === 'estilos').itens[0].letra, 'C');
  const semPct = LA.montar(r, { nome: 'Marina C.', lider: { nome: 'X', percentuais: null } });
  assert.equal(semPct.capitulos.find((c) => c.id === 'voce').blocos.find((b) => b.tipo === 'estilos').itens.length, 4);
});

test('sem nome: {nome} vira "esta pessoa" (maiúscula no começo, "desta pessoa" depois de "de")', () => {
  const av = LA.montar(resultadoPara('ID'), {});
  const json = JSON.stringify(av);
  assert.doesNotMatch(json, /\{nome\}|de esta pessoa/);
  assert.match(json, /Apresente esta pessoa ao time/);
  assert.match(json, /foi desta pessoa/);
});

test('sem conteúdo ou resultado inválido: null (quem chama usa o guia de antes)', () => {
  assert.equal(LA.montar(null), null);
  assert.equal(LA.montar({ percentuais: { D: 'x', I: 1, S: 1, C: 1 } }), null);
  assert.equal(LA.montar(resultadoPara('DI'), { dados: {} }), null);
  assert.equal(LA.temDados('di'), true);
  assert.equal(LA.temDados('XX'), false);
  assert.equal(LA.codigoCombinacao({ percentuais: { D: 40, I: 21, S: 20, C: 19 }, codigo: 'DI' }), 'D');
});

/* ------------------------------------------------------------------ snapshot do modelo 'lideranca' (versão 2) */

const PESSOA = { nome: 'Marina Costa Lima', cargo: 'Gerente comercial', telefone: '5595991112222', email: 'marina@exemplo.com', idade: 37,
  resultado: { percentuais: { D: 36, I: 31, S: 15, C: 18 }, codigo: 'DI' } };
const LIDER = { nome: 'Paulo Mendes Souza', resultado: { percentuais: { D: 14, I: 20, S: 38, C: 28 }, codigo: 'SC' } };
function snapshot(op) {
  return M.lideranca({ pessoa: JSON.parse(JSON.stringify(PESSOA)), lider: JSON.parse(JSON.stringify(LIDER)), empresa: { nome: 'Loja Exemplo' }, consultor: 'Consultor Exemplo' },
    Object.assign({ geradoEm: GERADO }, op || {}));
}

test('modelo lideranca com o módulo avançado: versão 2, capítulos, combinação oficial, determinístico e sem dados sensíveis', () => {
  const d = snapshot({ avancado: LA });
  assert.equal(d.modelo, 'lideranca');
  assert.equal(d.versao, 2);
  assert.equal(d.versao, M.VERSAO_LIDERANCA_AVANCADO);
  assert.deepEqual(d.avancado.capitulos.map((c) => c.id), CAPITULOS);
  assert.equal(d.combinacao.codigo, 'DI');
  assert.equal(d.combinacao.nome, CB.nome('DI').nome);
  assert.equal(d.pessoa.estilo, CB.nome('DI').nome);
  assert.equal(d.pessoa.nome, 'Marina C.');
  // abertura neutra (sem "direto(a)"), com a combinação e os percentuais
  assert.match(d.resumo, /^Combinação DI \(Mobilizador\): Dominância 36% como traço principal e Influência 31% como secundário\./);
  assert.doesNotMatch(d.resumo, /\(a\)/);
  // as seções da versão 1 continuam no snapshot (guia rápido e compatibilidade)
  for (const k of ['comunicacao', 'precisa', 'evita', 'cobrar', 'rendeMais', 'riscos']) assert.ok(d.secoes.some((s) => s.chave === k), k);
  assert.equal(JSON.stringify(d), JSON.stringify(snapshot({ avancado: LA })));
  const json = JSON.stringify(d);
  for (const p of ['5595991112222', 'marina@exemplo.com', '"idade"', 'Lima', 'Souza', 'Costa', 'Mendes', 'Notus']) assert.ok(!json.includes(p), p);
  assert.ok(json.length < 200000, 'snapshot cabe folgado no limite do banco (' + json.length + ')');
  // pessoa SC (secundário fraco) vira a combinação pura S, com o nome oficial
  const s = M.lideranca({ pessoa: { nome: 'Bruno Lima', resultado: { percentuais: { D: 15, I: 20, S: 45, C: 20 }, codigo: 'SC' } }, empresa: { nome: 'X' } }, { geradoEm: GERADO, avancado: LA });
  assert.equal(s.avancado.combinacao.codigo, 'S');
  assert.equal(s.combinacao.nome, CB.nome('S').nome);
  assert.match(s.resumo, /^Combinação S \(Pilar\): Estabilidade 45% como traço principal, com folga sobre os outros fatores\./);
});

test('modelo lideranca sem o módulo (ou sem conteúdo): versão 1, igual à de antes', () => {
  const v1 = snapshot();
  assert.equal(v1.versao, 1);
  assert.equal(v1.avancado, undefined);
  const semConteudo = snapshot({ avancado: { montar: () => null } });
  assert.equal(semConteudo.versao, 1);
  assert.equal(semConteudo.avancado, undefined);
  const quebrado = snapshot({ avancado: { montar: () => { throw new Error('x'); } } });
  assert.equal(quebrado.versao, 1);
});

/* ------------------------------------------------------------------ documento público */

test('view: versão 2 desenha capa, índice, quem é, guia rápido, os 10 capítulos e limites com fundamentos', () => {
  const d = snapshot({ avancado: LA });
  const html = V.montarHtml(d);
  assert.match(html, /data-modelo="lideranca" data-versao="avancado"/);
  for (const id of ['capa', 'indice', 'resumo', 'liderar', ...CAPITULOS, 'encerramento', 'rodape']) assert.match(html, new RegExp('data-secao="' + id + '"'), id);
  assert.match(html, /Como liderar <em>Marina C\.<\/em>/);
  assert.match(html, /Retrato para quem lidera/);
  assert.equal((html.match(/class="base-doc"/g) || []).length, CAPITULOS.length);
  assert.ok((html.match(/class="frase-doc"/g) || []).length >= 5);
  assert.equal((html.match(/estilo-doc--atual/g) || []).length, 1);
  assert.match(html, /data-letra="S"/);
  assert.match(html, /class="fundamentos-doc"/);
  assert.match(html, /Kluger, A\. N\., &amp; DeNisi, A\. \(1996\)/);
  assert.doesNotMatch(html, /Notus|undefined|\{nome\}/);
  // o guia rápido não repete os temas que viraram capítulos
  const guia = html.slice(html.indexOf('data-secao="liderar"'), html.indexOf('data-secao="feedback"'));
  assert.match(guia, /Como se comunicar/);
  assert.doesNotMatch(guia, /Como dar feedback|Plano de acompanhamento/);
});

test('view: relatório antigo (versão 1, já publicado) continua com o desenho de antes', () => {
  const v1 = snapshot();
  const html = V.montarHtml(v1);
  assert.doesNotMatch(html, /data-versao="avancado"/);
  for (const id of ['capa', 'resumo', 'liderar', 'encerramento', 'rodape']) assert.match(html, new RegExp('data-secao="' + id + '"'));
  assert.match(html, /Como liderar no dia a dia/);
  assert.doesNotMatch(html, /data-secao="feedback"|class="base-doc"/);
  // bloco avancado malformado também cai na versão 1
  for (const av of [{ capitulos: 'x' }, { capitulos: [] }, { capitulos: [null, { id: 3 }] }, 'texto']) {
    const h = V.montarHtml(Object.assign({}, v1, { versao: 2, avancado: av }));
    assert.match(h, /Como liderar no dia a dia/);
    assert.doesNotMatch(h, /data-versao="avancado"/);
  }
});

test('view: texto malicioso nos capítulos é escapado e tipos de bloco desconhecidos são ignorados', () => {
  const d = snapshot({ avancado: LA });
  const ataque = '<img src=x onerror="window.__x=1">';
  const cap = d.avancado.capitulos[0];
  cap.titulo = ataque; cap.intro = ataque; cap.base = ataque;
  cap.blocos.push({ tipo: 'texto', texto: ataque }, { tipo: 'frases', itens: [{ situacao: ataque, frase: ataque }] },
    { tipo: 'estilos', itens: [{ letra: '"><script>', nome: ataque, texto: ataque, ajustes: [ataque], atual: true }] },
    { tipo: 'html', html: '<b>cru</b>' }, { tipo: 'grupos', itens: [{ titulo: ataque, itens: [ataque, 3, null] }] });
  d.avancado.retrato = [ataque];
  d.avancado.fundamentos = [ataque];
  const html = V.montarHtml(d);
  assert.doesNotMatch(html, /<img src=x|<script>|<b>cru<\/b>/);
  assert.match(html, /&lt;img src=x onerror=&quot;window\.__x=1&quot;&gt;/);
});
