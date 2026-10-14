'use strict';
// Vagas sem Caos — frente testes (onda 2): a prova de DEMONSTRAÇÃO da prévia (vagas/js/api-previa.js), o cliente das RPCs da
// prova (vagas/js/api.js) e a lógica pura das telas testes.html (vagas/js/testes-tela.js) e selo.html (vagas/js/selo.js).
// O banco de demonstração passa pelo MESMO validador das questões reais (scripts/montar-testes.mjs) e pelas palavras proibidas
// das telas; o motor segue a migração 20261023120000_vagas_testes.sql (sorteio 6/6/3, tempo, tolerância, 30 dias, nota, selo).
// Nada aqui depende do nome ou do slug da cidade da semente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PREVIA = require('../vagas/js/api-previa.js');
const API = require('../vagas/js/api.js');
const T = require('../vagas/js/testes.js');
const TELA = require('../vagas/js/testes-tela.js');
const SELO = require('../vagas/js/selo.js');
const CONF = require('./helpers/vagas-tela.js');

const RAIZ = path.join(__dirname, '..');
const SQL_TESTES = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '20261023120000_vagas_testes.sql'), 'utf8');
const DOC_TESTES = fs.readFileSync(path.join(RAIZ, 'docs', 'VAGAS-TESTES.md'), 'utf8');
const BANCO = PREVIA.TESTES_DEMONSTRACAO;
const MIN = 60000;
const DIA = 86400000;
const T0 = Date.parse('2026-10-13T15:00:00Z');

function memoria() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
// Backend da prévia com relógio controlado pelo teste (relogio.t).
function novo() {
  const relogio = { t: T0 };
  const b = PREVIA.criarBackend({ armazenamento: memoria(), agora: () => relogio.t });
  return { b, relogio, rpc: (nome, args) => b.rpc(nome, args || {}) };
}
// Conta NOVA pelo próprio cadastro da prévia (link do e-mail): os testes não dependem da semente (pessoas, selos, cidade).
let contas = 0;
async function entrarNova(x, tipo) {
  const email = 'teste' + (++contas) + '.' + (tipo || 'pessoa') + '@exemplo.com';
  const r = await x.b.conta.cadastrar({ email, tipo: tipo || 'pessoa', nome: 'Pessoa de Teste' });
  assert.equal(r.ok, true, r.erro);
  const m = /token_hash=([^&]+)&type=([a-z]+)/.exec(r.linkPrevia);
  const c = await x.b.conta.confirmarLink({ tokenHash: m[1], tipo: m[2] });
  assert.equal(c.ok, true, c.erro);
  return email;
}
function questao(id) { for (const t of BANCO) for (const q of t.questoes) if (q.id === id) return q; return null; }
function tentativaNoEstado(x, id) { return x.b.estado().provaDemo.tentativas.find((t) => t.id === id); }
// Posição MOSTRADA da alternativa certa (ou de uma errada) da questão atual.
function posicao(x, id, certo) {
  const tt = tentativaNoEstado(x, id);
  const item = tt.itens[tt.respondidas];
  const pos = item.alt.indexOf(questao(item.id).correta);
  return certo ? pos : (pos + 1) % 4;
}
// Faz a prova toda: acertos = quantas certas (as primeiras); passo = ms entre uma questão e a resposta.
async function fazerProva(x, slug, acertos, passo) {
  const ini = await x.rpc('vagas_iniciar_tentativa', { p_teste: slug });
  assert.equal(ini.ok, true, ini.erro);
  const id = ini.tentativa.id;
  let r = await x.rpc('vagas_proxima_questao', { p_tentativa: id });
  for (let n = 1; n <= 15; n++) {
    assert.equal(r.fim, false);
    assert.equal(r.numero, n);
    x.relogio.t += passo == null ? 20000 : passo;
    const resp = await x.rpc('vagas_responder', { p_tentativa: id, p_questao: n, p_alternativa: posicao(x, id, n <= acertos) });
    assert.equal(resp.ok, true, resp.erro);
    r = resp.fim ? { fim: true } : resp.proxima;
  }
  assert.equal(r.fim, true);
  return { id, fim: await x.rpc('vagas_finalizar', { p_tentativa: id }) };
}

// ------------------------------------------------------------------------------------------------- banco de demonstração
test('banco de DEMONSTRAÇÃO: 5 testes do contrato, 18 questões (6 fáceis, 6 médias, 6 difíceis), competências cobertas, ids "DEMO-"', async () => {
  const S = await import('../scripts/montar-testes.mjs');
  assert.deepEqual(BANCO.map((t) => t.slug), S.TESTES);
  // Nomes e tempos são os da tabela de docs/VAGAS-TESTES.md ("Os 5 testes").
  for (const t of BANCO) {
    assert.ok(DOC_TESTES.includes('| ' + t.nome + ' (`' + t.slug + '`)'), t.nome);
    assert.equal(t.minutos, t.slug === 'caixa' ? 25 : 20, t.slug);
    assert.equal(t.questoes.length, 18, t.slug);
    for (const d of [1, 2, 3]) assert.equal(t.questoes.filter((q) => q.dificuldade === d).length, 6, t.slug + ' dificuldade ' + d);
    const comps = t.competencias.map((c) => c.id);
    assert.equal(comps.length, t.slug === 'portugues' ? 4 : 5);
    for (const c of comps) assert.ok(t.questoes.filter((q) => q.competencia === c).length >= 3, t.slug + ' ' + c);
    for (const q of t.questoes) {
      assert.match(q.id, new RegExp('^DEMO-' + S.PREFIXOS[t.slug] + '-\\d{2}$'));
      assert.ok(comps.includes(q.competencia), q.id);
    }
    // Os nomes das competências são os do contrato (a tabela lista em minúsculas, separados por ";").
    const linha = DOC_TESTES.split('\n').find((l) => l.includes('(`' + t.slug + '`)'));
    for (const c of t.competencias) assert.ok(linha.toLowerCase().includes(c.nome.toLowerCase()), t.slug + ': ' + c.nome);
  }
  const ids = BANCO.flatMap((t) => t.questoes.map((q) => q.id));
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
});

test('banco de DEMONSTRAÇÃO: cada questão passa no validador das questões reais (padroes.md §2 e §4) e nas palavras proibidas das telas', async () => {
  const S = await import('../scripts/montar-testes.mjs');
  for (const t of BANCO) {
    const comps = t.competencias.map((c) => c.id);
    t.questoes.forEach((q, i) => {
      // O validador pede os campos da cópia privada (só revisão); a demonstração não precisa deles na tela.
      const comoReal = Object.assign({}, q, { id: S.PREFIXOS[t.slug] + '-' + String(901 + i).slice(-3), funcao_alvo: 'demonstração',
        explicacao: 'Questão de demonstração da prévia, sem uso na prova real.', fonte_ou_justificativa: 'Prática: demonstração da prévia.' });
      assert.deepEqual(S.checarQuestao(comoReal, S.PREFIXOS[t.slug], comps), [], q.id);
      const textos = [q.texto || '', q.enunciado].concat(q.alternativas).join('\n');
      assert.deepEqual(CONF.conferirTexto(textos, q.id), [], q.id);
      // Enunciado ≤ 35 palavras; alternativa ≤ 15 (≤ 20 nas de "melhor mensagem"); texto-base ≤ 45 (padroes.md §2.14).
      const palavras = (s) => s.trim().split(/\s+/).length;
      assert.ok(palavras(q.enunciado) <= 35, q.id + ' enunciado');
      if (q.texto) assert.ok(palavras(q.texto) <= 45, q.id + ' texto');
      const mensagem = /melhor mensagem|melhor resposta|resposta mais adequada|mensagem informa melhor|começar um e-mail/i.test(q.enunciado);
      for (const a of q.alternativas) assert.ok(palavras(a) <= (mensagem ? 20 : 15), q.id + ': ' + a);
      if (mensagem) {
        const n = q.alternativas.map(palavras);
        assert.ok(Math.max(...n) - Math.min(...n) <= 4, q.id + ' alternativas de tamanho parecido (±4 palavras)');
      }
      assert.ok(!/o que voc[eê] faria/i.test(q.enunciado), q.id + ': instrução de conhecimento, não de tendência');
    });
    // A certa não pode ser a mais longa (nem a mais curta) em mais de 40% das questões (pista de tamanho).
    const maisLonga = t.questoes.filter((q) => q.alternativas.every((a, i) => i === q.correta || a.length < q.alternativas[q.correta].length)).length;
    const maisCurta = t.questoes.filter((q) => q.alternativas.every((a, i) => i === q.correta || a.length > q.alternativas[q.correta].length)).length;
    assert.ok(maisLonga <= 0.4 * t.questoes.length, t.slug + ': certa é a mais longa em ' + maisLonga);
    assert.ok(maisCurta <= 0.4 * t.questoes.length, t.slug + ': certa é a mais curta em ' + maisCurta);
  }
  // O arquivo da prévia diz, no código, que as questões são de demonstração e não as reais.
  const fonte = fs.readFileSync(path.join(RAIZ, 'vagas', 'js', 'api-previa.js'), 'utf8');
  assert.match(fonte, /PROVA DE DEMONSTRAÇÃO/);
  assert.match(fonte, /NÃO são as questões da prova real/);
  assert.equal(TELA.TXT.DEMONSTRACAO, 'Questões de demonstração (a prova real usa outro banco)');
});

test('rótulos dos selos: a vaga ("Pede selo: …"), o cartão e a conferência usam os nomes do catálogo dos testes', () => {
  const R = require('../vagas/js/regras.js');
  assert.deepEqual(R.TESTES_SELO.map((x) => [x.id, x.rotulo]), BANCO.map((t) => [t.slug, t.nome]));
  // O selo fictício da semente também (a conferência pública e o cartão mostram o nome do selo).
  const x = novo();
  for (const lista of Object.values(x.b.estado().selos)) for (const s of lista) assert.equal(s.nome, BANCO.find((t) => t.slug === s.teste).nome, s.codigo);
});

test('datas da prova no fuso da cidade da pessoa (reserva America/Sao_Paulo), nunca um fuso fixo', async () => {
  const x = novo();
  await entrarNova(x);   // conta nova, sem currículo: sem cidade, vale a reserva (horário de Brasília)
  // Prova terminada às 02:30 UTC de 14/10 = 23:30 de 13/10 em Brasília: o selo é de 13/10.
  x.relogio.t = Date.parse('2026-10-14T02:30:00Z');
  const ini = await x.rpc('vagas_iniciar_tentativa', { p_teste: 'caixa' });
  await x.rpc('vagas_proxima_questao', { p_tentativa: ini.tentativa.id });
  for (let n = 1; n <= 15; n++) {
    await x.rpc('vagas_responder', { p_tentativa: ini.tentativa.id, p_questao: n, p_alternativa: posicao(x, ini.tentativa.id, true) });
  }
  const r = (await x.rpc('vagas_finalizar', { p_tentativa: ini.tentativa.id })).resultado;
  assert.deepEqual([r.selo.data, r.selo.validoAte], ['2026-10-13', '2027-10-13']);
  const fonte = fs.readFileSync(path.join(RAIZ, 'vagas', 'js', 'api-previa.js'), 'utf8');
  const bloco = fonte.slice(fonte.indexOf('PROVA DE DEMONSTRAÇÃO'), fonte.indexOf('function criarBackend'));
  assert.ok(!/America\/(?!Sao_Paulo)[A-Z]/.test(bloco), 'nenhum fuso de cidade fixo no motor da prova');
});

test('mensagens da prova de demonstração = as da migração 20261023 e as de VAGAS_TESTES.MENSAGENS', () => {
  for (const [codigo, msg] of Object.entries(PREVIA.MSG_PROVA)) {
    assert.ok(SQL_TESTES.includes(msg), 'mensagem fora da migração: ' + msg);
    assert.ok(T.MENSAGENS[codigo] && msg.startsWith(T.MENSAGENS[codigo]), codigo);
  }
  assert.deepEqual(PREVIA.REGRAS_PROVA, { questoes: 15, intervaloDias: 30, toleranciaSeg: 10, notaMinima: 60, margem: 10, validadeMeses: 12, rapidaSeg: 3 });
  assert.equal(PREVIA.REGRAS_PROVA.notaMinima, T.NOTA_MINIMA);
  assert.equal(PREVIA.REGRAS_PROVA.toleranciaSeg, T.TOLERANCIA_SEG_POR_QUESTAO);
});

// ------------------------------------------------------------------------------------------------- motor da prova
test('sorteio: 15 questões, 6 fáceis + 6 médias + 3 difíceis, em ordem de dificuldade, todas as competências, alternativas embaralhadas', async () => {
  for (const t of BANCO) {
    for (let rodada = 0; rodada < 25; rodada++) {
      const x = novo();
      await entrarNova(x);
      const ini = await x.rpc('vagas_iniciar_tentativa', { p_teste: t.slug });
      const tt = tentativaNoEstado(x, ini.tentativa.id);
      const qs = tt.itens.map((i) => questao(i.id));
      assert.equal(qs.length, 15);
      assert.equal(new Set(qs.map((q) => q.id)).size, 15, 'sem repetir');
      assert.deepEqual([1, 2, 3].map((d) => qs.filter((q) => q.dificuldade === d).length), [6, 6, 3], t.slug);
      assert.deepEqual(qs.map((q) => q.dificuldade), qs.map((q) => q.dificuldade).slice().sort(), 'das fáceis para as difíceis');
      for (const c of t.competencias) assert.ok(qs.filter((q) => q.competencia === c.id).length >= 2, t.slug + ' ' + c.id);
      for (const i of tt.itens) assert.deepEqual(i.alt.slice().sort(), [0, 1, 2, 3]);
      // A questão mostrada traz as alternativas na ordem embaralhada da prova, sem o gabarito.
      const r = await x.rpc('vagas_proxima_questao', { p_tentativa: ini.tentativa.id });
      assert.deepEqual(r.questao.alternativas, tt.itens[0].alt.map((k) => qs[0].alternativas[k]));
      assert.ok(!('correta' in r.questao) && !JSON.stringify(r).includes('"correta"'));
      if (rodada > 2) break;
    }
  }
});

test('iniciar: conta de pessoa logada; retoma a aberta; erros do contrato (login, só pessoa, teste indisponível)', async () => {
  const x = novo();
  const sem = await x.rpc('vagas_iniciar_tentativa', { p_teste: 'vendas' });
  assert.deepEqual([sem.ok, sem.codigo, sem.sessaoExpirada, sem.erro], [false, 'login', true, 'Entre na sua conta para fazer o teste.']);
  await entrarNova(x, 'empresa');
  assert.equal((await x.rpc('vagas_iniciar_tentativa', { p_teste: 'vendas' })).codigo, 'so_pessoa');
  await x.b.conta.sair();
  await entrarNova(x);
  assert.equal((await x.rpc('vagas_iniciar_tentativa', { p_teste: 'xadrez' })).erro, 'Este teste não está disponível agora.');
  const a = await x.rpc('vagas_iniciar_tentativa', { p_teste: ' Vendas ' });
  assert.equal(a.ok, true);
  assert.deepEqual([a.tentativa.teste, a.tentativa.total, a.tentativa.respondidas, a.tentativa.minutos, a.tentativa.segundosRestantes, a.tentativa.retomada],
    ['vendas', 15, 0, 20, 1200, false]);
  assert.equal(a.tentativa.terminaEm, new Date(T0 + 20 * MIN).toISOString());
  x.relogio.t += 30000;
  const b = await x.rpc('vagas_iniciar_tentativa', { p_teste: 'vendas' });
  assert.deepEqual([b.tentativa.id, b.tentativa.retomada, b.tentativa.segundosRestantes], [a.tentativa.id, true, 1170]);
  assert.equal((await x.rpc('vagas_iniciar_tentativa', { p_teste: 'caixa' })).tentativa.minutos, 25);
  // Conta suspensa não faz teste.
  x.b.estado().contas[x.b.estado().sessao].status = 'suspensa';
  assert.equal((await x.rpc('vagas_iniciar_tentativa', { p_teste: 'administrativo' })).codigo, 'conta_inativa');
});

test('responder: uma por vez, sem voltar; reenvio não muda nada; fora de ordem; alternativa inválida; encerrada', async () => {
  const x = novo();
  await entrarNova(x);
  const id = (await x.rpc('vagas_iniciar_tentativa', { p_teste: 'atendimento' })).tentativa.id;
  // Antes de a questão aparecer, não dá para responder.
  assert.equal((await x.rpc('vagas_responder', { p_tentativa: id, p_questao: 1, p_alternativa: 0 })).codigo, 'fora_de_ordem');
  await x.rpc('vagas_proxima_questao', { p_tentativa: id });
  assert.equal((await x.rpc('vagas_responder', { p_tentativa: id, p_questao: 2, p_alternativa: 0 })).codigo, 'fora_de_ordem');
  assert.equal((await x.rpc('vagas_responder', { p_tentativa: id, p_questao: 1, p_alternativa: 4 })).erro, 'Escolha uma das alternativas.');
  assert.equal((await x.rpc('vagas_responder', { p_tentativa: id, p_questao: 'x', p_alternativa: 0 })).codigo, 'fora_de_ordem');
  const certa = posicao(x, id, true);
  const r1 = await x.rpc('vagas_responder', { p_tentativa: id, p_questao: 1, p_alternativa: certa });
  assert.deepEqual([r1.ok, r1.respondidas, r1.fim, r1.proxima.numero], [true, 1, false, 2]);
  // Reenvio da mesma questão (internet fraca): devolve a atual, não muda a resposta gravada.
  const dup = await x.rpc('vagas_responder', { p_tentativa: id, p_questao: 1, p_alternativa: (certa + 1) % 4 });
  assert.deepEqual([dup.ok, dup.duplicado, dup.respondidas, dup.proxima.numero], [true, true, 1, 2]);
  assert.equal(tentativaNoEstado(x, id).itens[0].correta, true);
  // Recarregar a questão não zera a hora em que ela apareceu.
  const exibida = tentativaNoEstado(x, id).itens[1].exibidaEm;
  x.relogio.t += 5000;
  assert.equal((await x.rpc('vagas_proxima_questao', { p_tentativa: id })).numero, 2);
  assert.equal(tentativaNoEstado(x, id).itens[1].exibidaEm, exibida);
  await x.rpc('vagas_finalizar', { p_tentativa: id });
  const enc = await x.rpc('vagas_responder', { p_tentativa: id, p_questao: 2, p_alternativa: 0 });
  assert.deepEqual([enc.codigo, enc.fim, enc.erro], ['encerrada', true, 'Este teste já foi encerrado.']);
  // Tentativa de outra pessoa não existe para quem não é a dona.
  await x.b.conta.sair();
  await entrarNova(x);
  assert.equal((await x.rpc('vagas_proxima_questao', { p_tentativa: id })).erro, 'Teste não encontrado. Volte à lista de testes.');
  assert.equal((await x.rpc('vagas_finalizar', { p_tentativa: id })).codigo, 'tentativa_inexistente');
});

test('tempo do servidor: 10 s de tolerância para a questão que está na tela; depois disso fecha com "tempo esgotado"', async () => {
  // Questão na tela antes do fim: a resposta vale até o fim + 10 s.
  let x = novo();
  await entrarNova(x);
  let id = (await x.rpc('vagas_iniciar_tentativa', { p_teste: 'vendas' })).tentativa.id;
  await x.rpc('vagas_proxima_questao', { p_tentativa: id });
  x.relogio.t = T0 + 20 * MIN + 9000;
  const dentro = await x.rpc('vagas_responder', { p_tentativa: id, p_questao: 1, p_alternativa: posicao(x, id, true) });
  assert.deepEqual([dentro.ok, dentro.fim, dentro.respondidas], [true, true, 1], 'aceita, e nenhuma questão nova depois do fim');
  let res = (await x.rpc('vagas_finalizar', { p_tentativa: id })).resultado;
  assert.deepEqual([res.status, res.acertos, res.nota, res.selo], ['tempo_esgotado', 1, 7, null]);

  // Passou da tolerância: a resposta não entra, a tentativa fecha e o que ficou sem resposta conta como erro.
  x = novo();
  await entrarNova(x);
  id = (await x.rpc('vagas_iniciar_tentativa', { p_teste: 'vendas' })).tentativa.id;
  await x.rpc('vagas_proxima_questao', { p_tentativa: id });
  x.relogio.t = T0 + 20 * MIN + 11000;
  const fora = await x.rpc('vagas_responder', { p_tentativa: id, p_questao: 1, p_alternativa: posicao(x, id, true) });
  assert.deepEqual([fora.ok, fora.codigo, fora.fim, fora.erro], [false, 'tempo_esgotado', true, 'O tempo acabou. As respostas dadas até aqui foram guardadas.']);
  res = (await x.rpc('vagas_finalizar', { p_tentativa: id })).resultado;
  assert.deepEqual([res.status, res.acertos, res.nota], ['tempo_esgotado', 0, 0]);

  // A questão que apareceu perto do fim também tem só os 10 s (não 10 s por questão).
  x = novo();
  await entrarNova(x);
  id = (await x.rpc('vagas_iniciar_tentativa', { p_teste: 'vendas' })).tentativa.id;
  x.relogio.t = T0 + 20 * MIN - 2000;
  const ultima = await x.rpc('vagas_proxima_questao', { p_tentativa: id });
  assert.equal(ultima.segundosRestantes, 2);
  x.relogio.t = T0 + 20 * MIN + 10500;
  assert.equal((await x.rpc('vagas_proxima_questao', { p_tentativa: id })).status, 'tempo_esgotado');
  // O catálogo também fecha a tentativa vencida e mostra a última.
  const cat = await x.rpc('vagas_testes_catalogo');
  const vendas = cat.testes.find((t) => t.slug === 'vendas').minha;
  assert.equal(vendas.aberta, null);
  assert.equal(vendas.ultima.status, 'tempo_esgotado');
});

test('nota, selo e 30 dias: 9 de 15 = 60 ganha o selo (12 meses); 8 de 15 = 53 não; refazer só depois de 30 dias, de graça', async () => {
  const x = novo();
  await entrarNova(x);
  const com = await fazerProva(x, 'administrativo', 9);
  const r = com.fim.resultado;
  assert.deepEqual([r.status, r.acertos, r.total, r.nota, r.margem, r.notaMinima], ['concluida', 9, 15, 60, 10, 60]);
  assert.equal(r.porCompetencia.reduce((s, c) => s + c.total, 0), 15);
  assert.equal(r.porCompetencia.reduce((s, c) => s + c.acertos, 0), 9);
  assert.ok(r.porCompetencia.every((c) => Object.keys(c).sort().join() === 'acertos,id,nome,total'), 'nunca quais questões');
  assert.match(r.selo.codigo, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(r.selo.validoAte, String(Number(r.selo.data.slice(0, 4)) + 1) + r.selo.data.slice(4));
  assert.deepEqual([r.selo.nota, r.selo.margem, r.selo.questoes, r.selo.supervisao, r.selo.situacao], [60, 10, 15, 'online', 'valido']);
  assert.equal(r.podeIniciarEm, new Date(T0 + 30 * DIA).toISOString());
  // Finalizar de novo devolve o mesmo resultado (idempotente).
  assert.deepEqual((await x.rpc('vagas_finalizar', { p_tentativa: com.id })).resultado, r);
  // O selo vai para o cartão (st.selos[uid], o que vagas_cartoes e o passo 5 leem) e para "meus selos".
  const uid = x.b.estado().sessao;
  assert.ok(x.b.estado().selos[uid].some((s) => s.codigo === r.selo.codigo && s.nota === 60 && !('situacao' in s)));
  const meus = await x.rpc('vagas_meus_selos');
  assert.equal(meus.selos.find((s) => s.codigo === r.selo.codigo).exibido, true);
  // 30 dias: a mensagem traz a data, e o catálogo diz quando pode refazer.
  const aguarde = await x.rpc('vagas_iniciar_tentativa', { p_teste: 'administrativo' });
  assert.equal(aguarde.codigo, 'aguarde');
  assert.match(aguarde.erro, /^Você fez este teste há menos de 30 dias\. Pode fazer de novo a partir de \d{2}\/\d{2}\/\d{4}\.$/);
  assert.equal(aguarde.podeIniciarEm, r.podeIniciarEm);
  const item = (await x.rpc('vagas_testes_catalogo')).testes.find((t) => t.slug === 'administrativo');
  assert.equal(item.minha.podeIniciarEm, r.podeIniciarEm);
  assert.equal(item.minha.selo.codigo, r.selo.codigo);
  assert.deepEqual(item.minha.ultima, { status: 'concluida', nota: 60, data: r.selo.data });

  // 8 de 15 = 53: sem selo, com a data para refazer.
  const sem = (await fazerProva(x, 'portugues', 8)).fim.resultado;
  assert.deepEqual([sem.nota, sem.selo, sem.status], [53, null, 'concluida']);
  // Depois dos 30 dias: nova tentativa; as difíceis já vistas ficam por último (3 das 6 difíceis são novas).
  const vistas = tentativaNoEstado(x, com.id).itens.map((i) => i.id);
  x.relogio.t = T0 + 30 * DIA + 1000;
  const nova = await x.rpc('vagas_iniciar_tentativa', { p_teste: 'administrativo' });
  assert.equal(nova.ok, true, nova.erro);
  const dificeisNovas = tentativaNoEstado(x, nova.tentativa.id).itens.map((i) => questao(i.id)).filter((q) => q.dificuldade === 3);
  assert.ok(dificeisNovas.every((q) => !vistas.includes(q.id)), 'difíceis ainda não vistas primeiro');
});

test('tentativa aberta por engano e encerrada sem ver questão não conta para os 30 dias; encerrar depois de ver conta', async () => {
  const x = novo();
  await entrarNova(x);
  const a = await x.rpc('vagas_iniciar_tentativa', { p_teste: 'caixa' });
  const r = (await x.rpc('vagas_finalizar', { p_tentativa: a.tentativa.id })).resultado;
  assert.deepEqual([r.podeIniciarEm, r.nota, r.status], [null, 0, 'concluida']);
  const b = await x.rpc('vagas_iniciar_tentativa', { p_teste: 'caixa' });
  assert.equal(b.ok, true);
  assert.notEqual(b.tentativa.id, a.tentativa.id);
  await x.rpc('vagas_proxima_questao', { p_tentativa: b.tentativa.id });
  const rb = (await x.rpc('vagas_finalizar', { p_tentativa: b.tentativa.id })).resultado;
  assert.ok(rb.podeIniciarEm);
  assert.equal((await x.rpc('vagas_iniciar_tentativa', { p_teste: 'caixa' })).codigo, 'aguarde');
});

test('sinais só registram (saiu da tela, copiou texto) e viram alertas para a equipe; respostas em menos de 3 s também', async () => {
  const x = novo();
  await entrarNova(x);
  const id = (await x.rpc('vagas_iniciar_tentativa', { p_teste: 'vendas' })).tentativa.id;
  assert.equal((await x.rpc('vagas_registrar_sinal', { p_tentativa: id, p_tipo: 'piscar' })).erro, 'Sinal inválido.');
  for (let i = 0; i < 3; i++) assert.equal((await x.rpc('vagas_registrar_sinal', { p_tentativa: id, p_tipo: 'troca_aba' })).ok, true);
  assert.equal((await x.rpc('vagas_registrar_sinal', { p_tentativa: id, p_tipo: 'copiar' })).ok, true);
  await x.rpc('vagas_finalizar', { p_tentativa: id });
  assert.equal((await x.rpc('vagas_registrar_sinal', { p_tentativa: id, p_tipo: 'copiar' })).codigo, 'tentativa_inexistente', 'só na tentativa aberta');
  const tt = tentativaNoEstado(x, id);
  assert.deepEqual([tt.sinais.trocasAba, tt.sinais.copias], [3, 1]);
  assert.deepEqual(tt.alertas, ['troca_aba', 'copiou_texto']);
  // Prova respondida toda em 1 s por questão: alerta de respostas rápidas (ninguém perde o selo por isso).
  const rapida = await fazerProva(x, 'atendimento', 15, 1000);
  assert.deepEqual(tentativaNoEstado(x, rapida.id).alertas, ['respostas_rapidas']);
  assert.equal(rapida.fim.resultado.nota, 100);
  assert.ok(rapida.fim.resultado.selo, 'o selo sai mesmo com alerta: quem decide é uma pessoa da equipe');
});

test('selo público: acha pelo código (com hífen, minúsculas), sem dado da pessoa; vencido depois de 12 meses; inexistente com a mensagem do contrato', async () => {
  const x = novo();
  const email = await entrarNova(x);
  const uid = x.b.estado().sessao;
  const selo = (await fazerProva(x, 'vendas', 12)).fim.resultado.selo;
  const fmt = selo.codigo.slice(0, 4).toLowerCase() + '-' + selo.codigo.slice(4).toLowerCase();
  await x.b.conta.sair();
  const pub = await x.rpc('vagas_selo_publico', { p_codigo: fmt });
  assert.equal(pub.ok, true);
  assert.deepEqual(Object.keys(pub.selo).sort(), ['codigo', 'data', 'margem', 'nome', 'nota', 'questoes', 'situacao', 'supervisao', 'teste', 'validoAte']);
  assert.ok(!JSON.stringify(pub).includes(email) && !JSON.stringify(pub).includes('Pessoa de Teste') && !JSON.stringify(pub).includes(uid), 'sem nome, e-mail nem id');
  for (const ruim of ['', 'ZZZZ-ZZZZ', 'K7M2-QX9', 'O0I1O0I1']) {
    const r = await x.rpc('vagas_selo_publico', { p_codigo: ruim });
    assert.deepEqual([r.ok, r.codigo, r.erro], [false, 'selo_inexistente', 'Selo não encontrado. Confira o código.'], ruim);
  }
  x.relogio.t = T0 + 400 * DIA;
  assert.equal((await x.rpc('vagas_selo_publico', { p_codigo: selo.codigo })).selo.situacao, 'vencido');
  const v = await x.b.conta.entrar(email, 'senha-de-teste');
  assert.equal(v.ok, false, 'conta nova sem senha: volta pela sessão guardada');
  x.b.estado().sessao = uid;
  assert.equal((await x.rpc('vagas_testes_catalogo')).testes.find((t) => t.slug === 'vendas').minha.selo, null, 'vencido sai do catálogo');
  assert.ok(!x.b.estado().selos[uid].some((s) => s.codigo === selo.codigo), 'e do cartão');
});

test('catálogo: público sem "minha"; logado com aberta, última, quando pode refazer e selo; exportação (LGPD) traz os testes', async () => {
  const x = novo();
  const anon = await x.rpc('vagas_testes_catalogo');
  assert.deepEqual(anon.regras, { intervaloDias: 30, toleranciaSegPorQuestao: 10, supervisao: 'online' });
  assert.equal(anon.testes.length, 5);
  for (const t of anon.testes) {
    assert.deepEqual([t.questoes, t.validadeMeses, t.notaMinima, t.margem], [15, 12, 60, 10]);
    assert.ok(!('minha' in t));
    assert.ok(!JSON.stringify(t).includes('alternativas'), 'o catálogo não traz questões');
  }
  await entrarNova(x);
  const id = (await x.rpc('vagas_iniciar_tentativa', { p_teste: 'caixa' })).tentativa.id;
  await x.rpc('vagas_proxima_questao', { p_tentativa: id });
  x.relogio.t += 60000;
  const caixa = (await x.rpc('vagas_testes_catalogo')).testes.find((t) => t.slug === 'caixa').minha;
  assert.deepEqual(caixa.aberta, { tentativa: id, respondidas: 0, total: 15, segundosRestantes: 25 * 60 - 60 });
  assert.equal(caixa.podeIniciarEm, null, 'com tentativa aberta, sem data de refazer');
  const exp = await x.rpc('vagas_exportar_meus_dados');
  assert.equal(exp.testes.tentativas.length, 1);
  assert.equal(exp.testes.tentativas[0].teste, 'caixa');
  assert.ok(!JSON.stringify(exp.testes).includes('alternativas'), 'sem questões nem gabarito');
});

// ------------------------------------------------------------------------------------------------- cliente (api.js)
test('api.js: os métodos da prova apontam para as RPCs da migração 20261023, com os mesmos parâmetros', () => {
  const esperado = { testesCatalogo: ['vagas_testes_catalogo', []], iniciarTentativa: ['vagas_iniciar_tentativa', ['p_teste']],
    proximaQuestao: ['vagas_proxima_questao', ['p_tentativa']], responder: ['vagas_responder', ['p_tentativa', 'p_questao', 'p_alternativa']],
    registrarSinal: ['vagas_registrar_sinal', ['p_tentativa', 'p_tipo']], finalizar: ['vagas_finalizar', ['p_tentativa']],
    meusSelos: ['vagas_meus_selos', []], seloPublico: ['vagas_selo_publico', ['p_codigo']] };
  for (const [m, [rpc, p]] of Object.entries(esperado)) {
    assert.equal(API.METODOS[m].rpc, rpc, m);
    assert.deepEqual(API.METODOS[m].p, p, m);
    const assinatura = new RegExp('create or replace function public\\.' + rpc + '\\(([^)]*)\\)').exec(SQL_TESTES);
    assert.ok(assinatura, rpc);
    const nomes = assinatura[1].trim() ? assinatura[1].split(',').map((x) => x.trim().split(/\s+/)[0]) : [];
    assert.deepEqual(nomes, p, rpc);
  }
  assert.equal(API.METODOS.testesCatalogo.publico, true);
  assert.equal(API.METODOS.seloPublico.publico, true);
  for (const m of ['iniciarTentativa', 'proximaQuestao', 'responder', 'registrarSinal', 'finalizar', 'meusSelos']) assert.ok(!API.METODOS[m].publico, m);
});

test('api.js no modo Supabase: responder vai por POST com os parâmetros nomeados; erro de regra vira Error com o código e a marca', async () => {
  const chamadas = [];
  const respostas = {
    vagas_responder: { ok: true, respondidas: 3, total: 15, fim: false, proxima: { ok: true, fim: false, numero: 4 } },
    vagas_iniciar_tentativa: { ok: false, erro: 'Você fez este teste há menos de 30 dias. Pode fazer de novo a partir de 12/11/2026.', codigo: 'aguarde', podeIniciarEm: '2026-11-12T15:00:00.000Z' },
    vagas_finalizar: { ok: false, erro: 'Entre na sua conta para fazer o teste.', codigo: 'login', sessaoExpirada: true }
  };
  const fetch = (url, o) => {
    chamadas.push({ url, o });
    const nome = url.split('/rpc/')[1];
    return Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify(respostas[nome])) });
  };
  const arm = memoria();
  arm.setItem('vagas_sessao', JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_at: Math.floor(T0 / 1000) + 3600, user: { id: 'u1', email: 'a@b.com' } }));
  const api = API.criar({ modo: 'supabase', url: 'https://x.supabase.co', chave: 'sb_publishable_x', fetch, armazenamento: arm, agora: () => T0 });
  const r = await api.responder('6f1c0000-0000-4000-8000-000000000001', 3, 2);
  assert.equal(r.proxima.numero, 4);
  assert.equal(chamadas[0].o.method, 'POST');
  assert.deepEqual(JSON.parse(chamadas[0].o.body), { p_tentativa: '6f1c0000-0000-4000-8000-000000000001', p_questao: 3, p_alternativa: 2 });
  assert.equal(chamadas[0].o.headers.Authorization, 'Bearer tok');
  const e = await api.iniciarTentativa('caixa').catch((x) => x);
  assert.equal(e.message, respostas.vagas_iniciar_tentativa.erro);
  assert.deepEqual([e.resposta.codigo, e.resposta.podeIniciarEm], ['aguarde', '2026-11-12T15:00:00.000Z']);
  const login = await api.finalizar('x').catch((x) => x);
  assert.equal(login.sessaoExpirada, true, 'sem sessão: a tela manda para o entrar');
});

test('api.js no modo prévia: a prova inteira pelo cliente (com as mesmas respostas e erros)', async () => {
  const x = novo();
  const api = API.criar({ modo: 'previa', backend: x.b });
  const cat = await api.testesCatalogo();
  assert.equal(cat.demonstracao, true);
  await entrarNova(x);
  const ini = await api.iniciarTentativa('vendas');
  const q = await api.proximaQuestao(ini.tentativa.id);
  assert.equal(q.numero, 1);
  const r = await api.responder(ini.tentativa.id, 1, 0);
  assert.equal(r.respondidas, 1);
  const e = await api.responder(ini.tentativa.id, 5, 0).catch((err) => err);
  assert.deepEqual([e.message, e.resposta.codigo], ['Esta questão não está disponível. Siga para a questão atual.', 'fora_de_ordem']);
  assert.equal((await api.registrarSinal(ini.tentativa.id, 'copiar')).ok, true);
  const fim = await api.finalizar(ini.tentativa.id);
  assert.equal(fim.resultado.status, 'concluida');
  assert.ok(Array.isArray((await api.meusSelos()).selos));
});

// ------------------------------------------------------------------------------------------------- telas (lógica pura)
const DATA = (x) => { const d = String(x).slice(0, 10); return d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4); };
const ITEM = { slug: 'vendas', nome: 'Vendas no varejo', questoes: 15, minutos: 20, margem: 10, notaMinima: 60 };

test('catálogo: ação e linha de cada teste (fazer, continuar, esperar os 30 dias, refazer, selo com nota e margem)', () => {
  assert.deepEqual(TELA.acaoDoTeste(ITEM, T0), { tipo: 'fazer', selo: null });
  assert.equal(TELA.linhaDoTeste(ITEM, { agora: T0, data: DATA }), '15 questões · 20 min');
  assert.equal(TELA.linhaDoTeste(Object.assign({}, ITEM, { slug: 'caixa', minutos: 25 }), { agora: T0, data: DATA, pedidos: { caixa: 1 } }),
    '15 questões · 25 min · pode usar papel e caneta · pedido em 1 vaga');
  assert.equal(TELA.linhaDoTeste(ITEM, { agora: T0, data: DATA, pedidos: { vendas: 3 } }), '15 questões · 20 min · pedido em 3 vagas');
  const aberta = Object.assign({}, ITEM, { minha: { aberta: { tentativa: 't', respondidas: 14, total: 15, segundosRestantes: 60 } } });
  assert.equal(TELA.acaoDoTeste(aberta, T0).tipo, 'continuar');
  assert.equal(TELA.linhaDoTeste(aberta, { agora: T0, data: DATA }), 'Você começou este teste · falta 1 questão');
  const selo = { codigo: 'K7M2QX9A', nota: 82, margem: 10, validoAte: '2027-10-10', situacao: 'valido' };
  const esperando = Object.assign({}, ITEM, { minha: { aberta: null, ultima: { status: 'concluida', nota: 82 }, podeIniciarEm: new Date(T0 + 18 * DIA - 1).toISOString(), selo } });
  assert.deepEqual([TELA.acaoDoTeste(esperando, T0).tipo, TELA.acaoDoTeste(esperando, T0).dias], ['aguardar', 18]);
  assert.equal(TELA.linhaDoTeste(esperando, { agora: T0, data: DATA, pedidos: { vendas: 9 } }), 'Selo válido até 10/10/2027 · nota 82 (±10) · pode refazer a partir de 31/10/2026');
  const refazer = Object.assign({}, ITEM, { minha: { aberta: null, ultima: { status: 'concluida', nota: 53 }, podeIniciarEm: null, selo: null } });
  assert.equal(TELA.acaoDoTeste(refazer, T0).tipo, 'refazer');
  assert.equal(TELA.linhaDoTeste(refazer, { agora: T0, data: DATA }), 'Última nota 53 (±10)');
  const vencido = Object.assign({}, ITEM, { minha: { ultima: { nota: 70 }, selo: Object.assign({}, selo, { situacao: 'vencido' }) } });
  assert.equal(TELA.acaoDoTeste(vencido, T0).selo, null, 'selo vencido não aparece como selo');
});

test('instruções: as do contrato sem repetir o texto fixo de padroes.md §5.7; caixa com papel e caneta; o que a prova registra (LGPD)', () => {
  const linhas = TELA.linhasInstrucoes(ITEM).map((l) => l.texto);
  assert.ok(linhas.some((l) => /^São 15 questões sobre o básico de vendas no varejo, uma por vez\. Não dá para voltar\.$/.test(l)));
  assert.ok(linhas.includes('Durante a prova, registramos o tempo de cada questão, a saída da tela e a cópia de texto. Ninguém perde o selo só por isso: uma pessoa da equipe revisa antes de qualquer decisão.'));
  assert.ok(linhas.some((l) => /a tentativa conta/.test(l)), 'encerrar cedo conta');
  assert.ok(!linhas.some((l) => /^Faça sozinho|^O teste mede/.test(l)), 'essas vão no texto fixo (avisos.teste_antes)');
  assert.ok(!linhas.some((l) => /calculadora/.test(l)));
  const caixa = TELA.linhasInstrucoes(Object.assign({}, ITEM, { slug: 'caixa', nome: 'Caixa e matemática prática', minutos: 25 }));
  assert.ok(caixa.some((l) => l.texto === 'Pode usar papel e caneta para as contas. Não use calculadora.'));
  for (const l of caixa) assert.ok(l.icone && l.icone !== 'seta', l.texto);
  const TEXTOS = require('../vagas/js/textos.js');
  assert.equal(TEXTOS.t('avisos.teste_antes'), 'Faça sozinho(a), sem consultar. A empresa pode pedir a prova presencial. O teste mede o que você sabe hoje do básico da função; não mede inteligência nem personalidade. Pode refazer em 30 dias.',
    'texto fixo de padroes.md §5.7, palavra por palavra');
  assert.equal(TEXTOS.t('avisos.selo_sem_selo'), 'Ainda sem selo neste teste. Você pode refazer em 30 dias, de graça.', 'padroes.md §5.3');
});

test('resultado: barras por competência ("5 de 6"), linhas sem data fixa, onde acertou menos; nunca "aprovado"', () => {
  const res = { nome: 'Vendas no varejo', status: 'tempo_esgotado', acertos: 8, total: 15, nota: 53, margem: 10, notaMinima: 60, selo: null,
    podeIniciarEm: '2026-11-12T15:00:00.000Z', porCompetencia: [{ id: 'a', nome: 'Abordagem', acertos: 3, total: 3 }, { id: 'b', nome: 'Objeções', acertos: 1, total: 3 },
      { id: 'c', nome: 'Troca', acertos: 1, total: 3 }, { id: 'd', nome: 'Pós-venda', acertos: 2, total: 3 }, { id: 'e', nome: 'Produto', acertos: 1, total: 3 }] };
  assert.deepEqual(TELA.partesDoResultado(res)[1], { nome: 'Objeções', acertos: 1, total: 3, texto: '1 de 3', percentual: 33 });
  assert.deepEqual(TELA.linhasDoResultado(res), ['Você acertou 8 de 15 questões. Nota 53 (±10).',
    'O tempo acabou antes do fim; as questões sem resposta contaram como erro.', 'O selo sai a partir da nota 60.']);
  assert.equal(TELA.textoRefazer(res, DATA), 'Você pode refazer este teste a partir de 12/11/2026, de graça.');
  assert.equal(TELA.ondeAcertouMenos(res), 'Objeções, Troca e Produto');
  const comSelo = Object.assign({}, res, { status: 'concluida', acertos: 12, nota: 80, selo: { codigo: 'K7M2QX9A', validoAte: '2027-10-13' } });
  assert.deepEqual(TELA.linhasDoResultado(comSelo), ['Você acertou 12 de 15 questões. Nota 80 (±10).'], 'o código e a validade estão no selo');
  for (const l of TELA.linhasDoResultado(res).concat(TELA.linhasDoResultado(comSelo))) assert.deepEqual(CONF.conferirTexto(l, 'resultado'), []);
  assert.deepEqual(TELA.contarPedidos([{ selo: 'caixa' }, { selo: null }, { selo: 'caixa' }, { selo: 'vendas' }, {}]), { caixa: 2, vendas: 1 });
  assert.equal(TELA.textoBotaoVagas(9), 'Ver 9 vagas que pedem este selo');
  assert.equal(TELA.textoBotaoVagas(1), 'Ver 1 vaga que pede este selo');
  assert.equal(TELA.textoBotaoVagas(0), 'Ver vagas');
  assert.equal(TELA.juntar(['a']), 'a');
  assert.equal(TELA.linkSelo('k7m2-qx9a'), 'selo.html?codigo=K7M2QX9A');
  assert.equal(TELA.linkSelo('K7M2QX9A', 'https://vagas.gestaosemcaos.com.br/testes.html#resultado/x'), 'https://vagas.gestaosemcaos.com.br/selo.html?codigo=K7M2QX9A');
});

test('relógio da prova: mm:ss, laranja com 1 minuto ou menos, avisa uma vez em 5 min e em 1 min (só o mais próximo)', () => {
  assert.deepEqual(TELA.estadoDoRelogio(1200, []).texto, '20:00');
  assert.equal(TELA.estadoDoRelogio(61, []).pouco, false);
  assert.equal(TELA.estadoDoRelogio(60, []).pouco, true);
  let r = TELA.estadoDoRelogio(299, []);
  assert.deepEqual([r.anunciar, r.falado, r.marcar], [300, 'Faltam 5 minutos', [300]]);
  r = TELA.estadoDoRelogio(250, [300]);
  assert.equal(r.anunciar, 0);
  r = TELA.estadoDoRelogio(50, []);
  assert.deepEqual([r.anunciar, r.falado, r.marcar], [60, 'Falta 1 minuto', [300, 60]], 'abriu com 50 s: nunca fala "5 minutos" depois');
  r = TELA.estadoDoRelogio(0, []);
  assert.deepEqual([r.acabou, r.anunciar, r.texto], [true, 0, '0:00']);
});

test('conferência do selo: código no formato (com ou sem hífen); situação válida, vencida (só a data) e cancelada', () => {
  assert.equal(SELO.validarCodigo('q8v3-n2kd'), '');
  assert.equal(SELO.validarCodigo(' Q8V3 N2KD '), '');
  for (const ruim of ['', 'Q8V3N2K', 'Q8V3N2KD9', 'O0I1O0I1', 'Q8V3-N2K!']) assert.equal(SELO.validarCodigo(ruim), 'O código tem 8 letras e números, como Q8V3N2KD', ruim);
  assert.deepEqual(SELO.situacao({ situacao: 'valido' }), { tipo: 'valido', icone: 'check', titulo: 'Selo válido' });
  assert.equal(SELO.situacao({ situacao: 'vencido', validoAte: '2026-10-13' }, DATA).titulo, 'Selo vencido em 13/10/2026');
  assert.equal(SELO.situacao({ situacao: 'revogado' }).tipo, 'revogado');
  for (const t of Object.values(SELO.TXT)) assert.deepEqual(CONF.conferirTexto(t, 'selo.js'), []);
});

test('páginas e scripts da frente testes: CSP, ordem dos scripts, nada inline, sem innerHTML, sem palavra proibida nem cidade fixa; CSS só com tokens', () => {
  for (const p of ['testes.html', 'selo.html']) assert.deepEqual(CONF.conferirPagina(p), [], p);
  for (const s of ['js/testes-tela.js', 'js/selo.js']) assert.deepEqual(CONF.conferirScript(s), [], s);
  for (const t of Object.values(TELA.TXT)) assert.deepEqual(CONF.conferirTexto(t, 'TXT'), []);
  const css = CONF.semComentarios(fs.readFileSync(path.join(CONF.VAGAS, 'assets', 'vagas-testes.css'), 'utf8'));
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|font-family/i.test(css), 'nenhuma cor nem fonte fora dos tokens');
  // Telas da pessoa no celular: o roteiro, a barra fixa e a navegação vêm da base da casca (sem componente visual novo).
  const tela = fs.readFileSync(path.join(CONF.VAGAS, 'js', 'testes-tela.js'), 'utf8');
  for (const peca of ['U.roteador', 'U.exigirConta', 'U.fixar', 'U.navPessoa', 'U.barra', 'U.confirmar', 'P.selo', 'P.cartaoVaga', 'U.tratarErro']) assert.ok(tela.includes(peca), peca);
  assert.ok(!/localStorage|sessionStorage/.test(CONF.semComentarios(tela)), 'armazenamento só por VAGAS_UI.armazenamento');
  // A conferência pública não mostra dado da pessoa (a RPC não manda; a tela também não procura).
  assert.ok(!/nome(Exibicao)?\b.*pessoa|email|whatsapp/i.test(CONF.semComentarios(fs.readFileSync(path.join(CONF.VAGAS, 'js', 'selo.js'), 'utf8'))));
});
