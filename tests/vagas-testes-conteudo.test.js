'use strict';
// Vagas sem Caos · validador e gerador do banco de questões dos testes de habilidade (scripts/montar-testes.mjs).
// O conteúdo REAL (com gabarito) não fica no repositório: aqui roda o banco FICTÍCIO tests/fixtures/vagas-testes/ (gerado por
// --gerar-ficticio, determinístico), que cumpre as mesmas regras. Confere: o fixture passa e está em dia; itens mal escritos
// (Haladyna et al., 2002), contas que não fecham, termos proibidos e bancos desequilibrados são barrados; o SQL gerado e o
// RELATORIO.md não levam explicação; só o caderno de revisão tem o gabarito; e a migração 20261023120001 continua um ESPELHO
// sem conteúdo. O sorteio do banco (vagas_interno.teste_sortear) usa as mesmas cotas: tests/supabase/vagas_testes.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const FIXTURE = path.join(RAIZ, 'tests', 'fixtures', 'vagas-testes');
const ESPELHO = path.join(RAIZ, 'supabase', 'migrations', '20261023120001_vagas_questoes.sql');

let S;
let conteudo;
test.before(async () => {
  S = await import('../scripts/montar-testes.mjs');
  conteudo = S.lerConteudo(FIXTURE);
});

const clonar = (x) => JSON.parse(JSON.stringify(x));
const caixa = () => clonar(conteudo.dados.caixa);
// Uma questão de conta e uma de situação (sem texto de apoio), tiradas do fixture, para estragar de propósito.
const deConta = () => clonar(conteudo.dados.caixa.questoes.find((q) => q.conta));
const deSituacao = () => clonar(conteudo.dados.caixa.questoes.find((q) => !q.conta && !q.texto));
const checar = (q) => {
  const d = conteudo.dados.caixa;
  return S.checarQuestao(q, 'CAI', d.competencias.map((c) => c.id), d.tarefas.map((t) => t.id));
};
const temErro = (erros, re) => erros.some((e) => re.test(e));

test('o banco FICTÍCIO passa no validador, é determinístico e está em dia no repositório', () => {
  assert.deepEqual(conteudo.erros, []);
  assert.deepEqual(Object.keys(conteudo.dados), ['atendimento', 'vendas', 'administrativo', 'caixa', 'portugues']);
  assert.equal(S.PASTA_FICTICIA, FIXTURE);
  const gerado = S.gerarFicticio();
  const ids = new Set();
  for (const d of Object.values(conteudo.dados)) {
    assert.deepEqual(d, gerado.dados[d.teste], d.teste + '.json igual ao que --gerar-ficticio gera (rode node scripts/montar-testes.mjs --gerar-ficticio)');
    assert.equal(fs.readFileSync(path.join(FIXTURE, d.teste + '.analise.md'), 'utf8').replace(/\r\n/g, '\n'), gerado.analises[d.teste] + '\n');
    assert.match(d.nome, /FICTÍCIO/);
    assert.ok(d.questoes.length >= S.MIN_QUESTOES, d.teste + ' com ' + d.questoes.length);
    assert.ok(d.competencias.length >= 3 && d.competencias.length <= 5, d.teste);
    assert.equal(d.prova.questoes, 15, d.teste);
    for (const q of d.questoes) {
      assert.ok(!ids.has(q.id), 'id repetido ' + q.id);
      ids.add(q.id);
      assert.match(q.id, new RegExp('^' + S.PREFIXOS[d.teste] + '-\\d{3}$'));
      assert.match(q.enunciado, /^FICTÍCIO /, q.id + ' rotulado');
      assert.match(q.fonte_ou_justificativa, /^(Prática|Norma|Conta|Língua): /);
      assert.ok(q.funcao_alvo, q.id + ' sem funcao_alvo');
    }
    const r = S.resumir(d);
    assert.deepEqual(r.posicoes, [20, 20, 20, 20], d.teste);
    assert.ok(r.tamanho.longa / r.questoes <= S.MAX_CORRETA_MAIS_LONGA, d.teste + ' correta mais longa em ' + r.tamanho.longa);
    assert.ok(r.tamanho.curta / r.questoes <= S.MAX_CORRETA_MAIS_CURTA, d.teste + ' correta mais curta em ' + r.tamanho.curta);
    for (const c of d.competencias) {
      const x = r.porCompetencia[c.id];
      assert.ok(x[1] && x[2] && x[3], d.teste + '/' + c.id + ' sem alguma dificuldade');
    }
    assert.ok(d.questoes.some((q) => q.grupo), d.teste + ' com grupos de itens-irmãos (o sorteio tira 1 por grupo)');
  }
  assert.equal(ids.size, 400);
  assert.ok(conteudo.dados.caixa.questoes.some((q) => q.conta), 'o caixa tem itens de conta');
  assert.equal(S.gerarRelatorio(conteudo.dados), fs.readFileSync(path.join(FIXTURE, 'RELATORIO.md'), 'utf8').replace(/\r\n/g, '\n'), 'RELATORIO.md do fixture em dia');
});

test('a migração 20261023120001 é um ESPELHO sem conteúdo: só comentário, sem carga nem gabarito', () => {
  const texto = fs.readFileSync(ESPELHO, 'utf8');
  assert.deepEqual(S.checarEspelho(texto), []);
  assert.doesNotMatch(texto, /insert|correta|values/i);
  assert.ok(texto.split('\n').every((l) => /^\s*(--.*)?$/.test(l)), 'cada linha é comentário ou vazia');
  assert.match(texto, /SQL Editor/);
  assert.match(texto, /--conteudo <pasta privada> --saida/);
  assert.match(texto, /faltando: \['20261023120001_vagas_questoes'\]/);
  // O que barra um espelho que deixou de ser espelho.
  assert.ok(S.checarEspelho('').length);
  assert.ok(temErro(S.checarEspelho('-- ESPELHO\nselect 1;'), /não é comentário/));
  assert.ok(temErro(S.checarEspelho('-- ESPELHO com insert'), /insert/));
  assert.ok(temErro(S.checarEspelho('-- ESPELHO\n-- correta'), /gabarito/));
  assert.ok(temErro(S.checarEspelho('-- só comentário'), /ESPELHO/));
  // O conteúdo real nunca entra no repositório: a pasta antiga está no .gitignore.
  assert.match(fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8'), /^conteudo\/vagas-testes\/$/m);
  assert.ok(!fs.existsSync(path.join(RAIZ, 'conteudo', 'vagas-testes')), 'sem conteudo/vagas-testes no repositório');
});

test('cotas do sorteio: 6/6/3 em 15, divididas por competência sem passar do que cada célula aguenta', () => {
  assert.deepEqual(S.cotasProva(15), { 1: 6, 2: 6, 3: 3 });
  assert.deepEqual(S.cotasProva(10), { 1: 4, 2: 4, 3: 2 });
  for (const C of [3, 4, 5]) {
    const cel = S.cotasPorCelula(15, C);
    assert.equal(cel.length, C);
    const porDif = { 1: 0, 2: 0, 3: 0 };
    for (const c of cel) for (const d of [1, 2, 3]) porDif[d] += c[d];
    assert.deepEqual(porDif, { 1: 6, 2: 6, 3: 3 }, 'C=' + C);
    const porComp = cel.map((c) => c[1] + c[2] + c[3]);
    assert.ok(Math.max(...porComp) - Math.min(...porComp) <= 1, 'competências equilibradas com C=' + C + ': ' + porComp);
  }
  assert.deepEqual(S.maximoPorCelula(15, 5), { 1: 2, 2: 2, 3: 1 });
  assert.deepEqual(S.maximoPorCelula(15, 4), { 1: 2, 2: 2, 3: 1 });
  assert.equal(S.unidades([{ grupo: 'a' }, { grupo: 'a' }, {}, { grupo: 'b' }]), 3, 'grupo de itens-irmãos conta 1');
});

test('a conta da questão só aceita aritmética e precisa dar o valor da correta', () => {
  assert.ok(Math.abs(S.avaliarConta('50 - 37.40') - 12.6) < 1e-9);
  assert.equal(S.avaliarConta('(120 * 0.9) / 3'), 36);
  assert.equal(S.avaliarConta('process.exit(1)'), null);
  assert.equal(S.avaliarConta('1 + a'), null);
  assert.equal(S.avaliarConta(''), null);
  assert.equal(S.valorDe('R$ 1.234,56'), 1234.56);
  assert.equal(S.valorDe('12,5%'), 12.5);
  assert.ok(S.ehNumerica('R$ 12,60') && S.ehNumerica('3 parcelas de R$ 40,00') && S.ehNumerica('15%'));
  assert.ok(!S.ehNumerica('Conferir o valor e entregar contando.'));

  assert.deepEqual(checar(deConta()), [], 'a questão do fixture passa');
  const errada = deConta();
  errada.conta = errada.conta + ' + 1';
  assert.ok(temErro(checar(errada), /não dá o valor da alternativa correta/));
  const semConta = deConta();
  delete semConta.conta;
  assert.ok(temErro(checar(semConta), /resposta numérica sem "conta"/));
  const repetida = deConta();
  repetida.alternativas[(repetida.correta + 1) % 4] = repetida.alternativas[repetida.correta];
  assert.ok(temErro(checar(repetida), /alternativa errada com o mesmo valor da correta/));
  const formato = deConta();
  formato.enunciado = 'A compra deu R$ 37,4. Qual é o troco de uma nota de R$ 50?';
  assert.ok(temErro(checar(formato), /fora do formato "R\$ 1\.234,56"/));
});

test('redação de itens: barra enunciado negativo, de tendência, sem pergunta, absolutos e "todas as anteriores"', () => {
  assert.deepEqual(checar(deSituacao()), [], 'a questão do fixture passa');
  const casos = [
    [(q) => { q.enunciado = 'Qual destas atitudes NÃO é correta no caixa?'; }, /enunciado negativo/],
    [(q) => { q.enunciado = 'Todas são corretas, exceto qual?'; }, /enunciado negativo/],
    [(q) => { q.enunciado = 'Qual alternativa está incorreta?'; }, /enunciado negativo/],
    [(q) => { q.enunciado = 'O cliente reclamou do troco. O que você faria?'; }, /instrução de tendência/],
    [(q) => { q.enunciado = 'Entregar o troco ao cliente.'; }, /terminar com "\?"/],
    [(q) => { q.alternativas[q.correta === 0 ? 1 : 0] = 'Nunca contar o troco na frente do cliente.'; }, /determinante absoluto/],
    [(q) => { q.alternativas[q.correta === 0 ? 1 : 0] = 'Todas as anteriores.'; }, /depende de posição/],
    [(q) => { q.alternativas[q.correta === 0 ? 1 : 0] = 'Igual à alternativa B.'; }, /depende de posição/],
    [(q) => { q.alternativas.pop(); }, /exatamente 4 alternativas/],
    [(q) => { q.alternativas[1] = q.alternativas[0].toUpperCase(); }, /alternativas repetidas/],
    [(q) => { q.correta = 4; }, /índice 0–3/],
    [(q) => { q.dificuldade = 4; }, /dificuldade deve ser 1, 2 ou 3/],
    [(q) => { q.explicacao = ''; }, /explicação/],
    [(q) => { q.fonte_ou_justificativa = 'Porque sim.'; }, /fonte_ou_justificativa/],
    [(q) => { q.fonte_ou_justificativa = 'Norma: Código de Defesa do Consumidor.'; }, /"Norma:" sem número/],
    [(q) => { q.enunciado = 'Segundo a Lei 8.078, o que fazer com o troco?'; }, /número de lei\/artigo/],
    [(q) => { q.enunciado = 'Pelo art. 39 do Código, o que fazer com o troco?'; }, /número de lei\/artigo/],
    [(q) => { q.enunciado = 'Com uma frase de muitas palavras que segue e segue sem parar e sem ponto nenhum para ver se o validador reclama de frase longa demais para ler no celular hoje?'; }, /frase longa/],
    [(q) => { q.competencia = 'simpatia'; }, /competência desconhecida/],
    [(q) => { q.tarefa = 'sorrir'; }, /tarefa desconhecida/],
    [(q) => { q.id = 'CAI-1'; }, /id deve ser CAI-NNN/],
    [(q) => { q.gabarito = 1; }, /campo desconhecido: gabarito/],
    [(q) => { q.funcao_alvo = ''; }, /funcao_alvo/],
    [(q) => { q.grupo = 'Grupo Inválido'; }, /grupo inválido/]
  ];
  for (const [estragar, re] of casos) {
    const q = deSituacao();
    estragar(q);
    const erros = checar(q);
    assert.ok(temErro(erros, re), 'esperava ' + re + ' em ' + JSON.stringify(q.enunciado) + ' -> ' + JSON.stringify(erros));
  }
});

test('termos proibidos: personalidade, raciocínio, gíria, marca, religião, gênero, origem, idade e o nome da agência', () => {
  const termos = [
    ['Qual é o seu tipo de personalidade?', /personalidade/],
    ['Qual sequência lógica completa a série?', /personalidade, raciocínio/],
    ['O cliente pediu pelo zap o que fazer?', /gíria/],
    ['O cliente pagou com cartão Nubank. O que fazer?', /marca real/],
    ['O cliente saiu da igreja e pediu troco. O que fazer?', /religião/],
    ['Uma mulher pediu troco. O que fazer?', /gênero/],
    ['O produto é do setor feminino. O que fazer?', /gênero/],
    ['Um cliente venezuelano pediu troco. O que fazer?', /origem/],
    ['Um cliente goiano pediu troco. O que fazer?', /origem/],
    ['Um velhinho pediu troco. O que fazer?', /idade/],
    ['Uma cliente idosa, já velha, pediu troco. O que fazer?', /idade/],
    ['A Notus pediu troco. O que fazer?', /agência/]
  ];
  for (const [enunciado, re] of termos) {
    const q = deSituacao();
    q.enunciado = enunciado;
    assert.ok(temErro(checar(q), re), enunciado);
  }
});

test('banco: tamanho mínimo, posições da correta, correta mais longa, células e tarefas', () => {
  assert.deepEqual(S.checarTeste(caixa()), []);

  const pequeno = caixa();
  pequeno.questoes = pequeno.questoes.slice(0, 60);
  assert.ok(temErro(S.checarTeste(pequeno), /mínimo 75/));

  const posicoes = caixa();
  for (const q of posicoes.questoes) {
    const certa = q.alternativas[q.correta];
    q.alternativas.splice(q.correta, 1);
    q.alternativas.unshift(certa);
    q.correta = 0;
  }
  assert.ok(temErro(S.checarTeste(posicoes), /posições da correta desequilibradas/));

  const longa = caixa();
  for (const q of longa.questoes) if (!q.conta) q.alternativas[q.correta] = q.alternativas[q.correta].replace(/\.$/, '') + ', com calma e atenção ao detalhe todo, sem pressa nenhuma.';
  assert.ok(temErro(S.checarTeste(longa), /a correta é a alternativa mais longa/));

  const celula = caixa();
  const primeira = celula.competencias[0].id;
  celula.questoes = celula.questoes.filter((q) => !(q.competencia === primeira && q.dificuldade === 3));
  assert.ok(temErro(S.checarTeste(celula), new RegExp('célula ' + primeira + ' × dificuldade 3|mínimo')));

  const grupoSo = caixa();
  grupoSo.questoes[2].grupo = 'grupo_de_um';
  assert.ok(temErro(S.checarTeste(grupoSo), /grupo grupo_de_um com 1 questão só/));

  const tarefa = caixa();
  tarefa.tarefas.push({ id: 'tarefa_vazia', nome: 'Tarefa sem questões' });
  assert.ok(temErro(S.checarTeste(tarefa), /tarefa tarefa_vazia com 0 questões/));

  const desconhecido = caixa();
  desconhecido.teste = 'raciocinio';
  assert.ok(temErro(S.checarTeste(desconhecido), /teste desconhecido/));
});

test('análise da função: lerConteudo exige <teste>.analise.md citando toda tarefa, com a matriz batendo com o banco', () => {
  for (const d of Object.values(conteudo.dados)) {
    const txt = fs.readFileSync(path.join(FIXTURE, d.teste + '.analise.md'), 'utf8');
    assert.match(txt, /Matriz tarefa × competência/);
    assert.doesNotMatch(txt, /notus/i);
    for (const t of d.tarefas) assert.ok(txt.includes('`' + t.id + '`'), d.teste + ': ' + t.id);
  }
  // Numa cópia temporária: sem a análise, ou com a matriz desatualizada, o conteúdo é recusado.
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'vagas-testes-'));
  try {
    for (const a of fs.readdirSync(FIXTURE)) if (a !== 'RELATORIO.md') fs.copyFileSync(path.join(FIXTURE, a), path.join(tmp, a));
    assert.deepEqual(S.lerConteudo(tmp).erros, []);
    const analise = path.join(tmp, 'caixa.analise.md');
    const original = fs.readFileSync(analise, 'utf8');
    fs.writeFileSync(analise, original.replace(/\| 20 \|$/m, '| 19 |'));
    assert.ok(temErro(S.lerConteudo(tmp).erros, /caixa\.analise\.md: matriz tarefa × competência desatualizada/));
    fs.unlinkSync(analise);
    assert.ok(temErro(S.lerConteudo(tmp).erros, /caixa\.analise\.md: análise da função ausente/));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('o gabarito e as explicações ficam no conteúdo: SQL de carga e RELATORIO sem explicação; só o caderno de revisão marca a certa', () => {
  const sql = S.gerarSql(conteudo.dados);
  const relatorio = S.gerarRelatorio(conteudo.dados);
  const revisao = S.gerarRevisao(conteudo.dados);
  assert.match(sql, /NUNCA commitar/);
  let total = 0;
  for (const d of Object.values(conteudo.dados)) {
    for (const q of d.questoes) {
      total++;
      assert.ok(sql.includes("'" + q.id + "'"), q.id + ' no SQL');
      assert.ok(!sql.includes(q.explicacao.replace(/'/g, "''")), q.id + ': explicação no SQL');
      assert.ok(!relatorio.includes(q.explicacao), q.id + ': explicação no RELATORIO');
      assert.ok(!sql.includes(q.fonte_ou_justificativa.replace(/'/g, "''")), q.id + ': fonte no SQL');
    }
  }
  assert.doesNotMatch(relatorio, /\[certa\]|correta: \d|gabarito: /i);
  assert.match(relatorio, /Não tem gabarito/);
  assert.match(relatorio, /Matriz tarefa × competência/);
  assert.match(relatorio, /10 questões mais longas/);
  assert.equal((revisao.match(/\*\*\[certa\]\*\*/g) || []).length, total, 'cada questão com 1 certa marcada no caderno');
  assert.match(revisao, /CONFIDENCIAL/);
  // O SQL não apaga questões (tentativas antigas apontam para elas): só desativa.
  assert.doesNotMatch(sql, /delete from/i);
  assert.match(sql, /set ativa = false/);
  for (const t of [sql, relatorio, revisao]) assert.doesNotMatch(t, /notus/i);
});
