'use strict';
// Painel do DISC — grupo "Vagas" (js/admin-vagas.js): quando aparece (Supabase com a migração do Vagas; prévia só com ?vagas=1),
// as listas transcritas iguais à origem (moderacao.json, indicadores.json, consentimentos.json, regras.js), as regras puras das
// telas, a prévia fictícia (nenhum dado de pessoa) e o adaptador do Supabase (RPC por fetch com o token da sessão do painel).
// Os ganchos em admin.html/js/admin.js não mudam nada das abas que já existem.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const V = require('../js/admin-vagas.js');
const AD = require('../js/admin.js');
const R = require('../vagas/js/regras.js');
const TELA = require('./helpers/vagas-tela.js');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const lerJson = (rel) => JSON.parse(ler(rel));
const AGORA = Date.parse('2026-10-13T15:00:00Z');

function armazem() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}

test('listas transcritas: títulos dos motivos = moderacao.json; indicadores = indicadores.json (v2, cidade pequena); testes = regras.js; contrato = consentimentos.json', () => {
  const mod = lerJson('conteudo/vagas-textos/moderacao.json');
  assert.deepEqual(Object.keys(V.MOTIVOS).sort(), mod.motivos.map((m) => m.chave).sort());
  for (const m of mod.motivos) assert.equal(V.MOTIVOS[m.chave], m.titulo, m.chave);
  const ind = lerJson('conteudo/vagas-operacao/indicadores.json');
  assert.equal(ind.versao, 2);
  assert.deepEqual(V.INDICADORES.map((i) => i.chave), ind.indicadores.map((i) => i.chave), 'mesmas 15 chaves, mesma ordem');
  const num = (a) => (a == null ? null : typeof a === 'object' ? (a.total == null ? null : a.total) : a);
  for (const i of ind.indicadores) {
    const v = V.INDICADORES.filter((x) => x.chave === i.chave)[0];
    assert.deepEqual([v.nome, v.unidade, v.periodo, v.direcao, v.hipotese], [i.nome, i.unidade, i.periodo, i.direcao, !!i.hipotese], i.chave);
    assert.equal(v.alvo, num(i.alvo && i.alvo.cidadePequena), i.chave + ' alvo');
    assert.equal(v.alvoLancamento, num(i.alvoLancamento && i.alvoLancamento.cidadePequena), i.chave + ' alvo do lançamento');
  }
  assert.deepEqual(V.TESTES.map((t) => t[0]), R.TESTES_SELO.map((t) => t.id));
  assert.deepEqual(V.TESTES.map((t) => t[1]), R.TESTES_SELO.map((t) => t.rotulo));
  const contrato = lerJson('conteudo/vagas-textos/consentimentos.json').aceites.filter((a) => a.chave === 'operador_contrato')[0];
  assert.equal(V.CONTRATO_OPERADOR, contrato.versao);
});

test('quando o grupo aparece: Supabase só com a migração do Vagas (versaoBanco) e a sessão do painel; prévia só com ?vagas=1 ou CONFIG.VAGAS_PAINEL', () => {
  const cfg = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'pub' };
  const api = { sessaoAtual: () => Promise.resolve({ ok: true, token: 't' }) };
  assert.equal(V.disponivel({ supabase: true, config: cfg, discApi: api, banco: true }), true);
  assert.equal(V.disponivel({ supabase: true, config: cfg, discApi: api, banco: null }), false, 'antes de conferir o banco, não aparece');
  assert.equal(V.disponivel({ supabase: true, config: cfg, discApi: api, banco: false }), false);
  assert.equal(V.disponivel({ supabase: true, config: cfg, discApi: {}, banco: true }), false, 'sem sessaoAtual no cliente');
  assert.equal(V.disponivel({ supabase: true, config: {}, discApi: api, banco: true }), false);
  assert.equal(V.disponivel({ supabase: false, simulada: false, config: cfg, discApi: api, banco: true }), false, 'Apps Script: nunca');
  const ss = armazem();
  assert.equal(V.disponivel({ simulada: true, config: {}, local: { search: '' }, sessionStorage: ss }), false, 'prévia do DISC continua igual');
  assert.equal(V.disponivel({ simulada: true, config: {}, local: { search: '?vagas=1' }, sessionStorage: ss }), true);
  assert.equal(V.disponivel({ simulada: true, config: {}, local: { search: '' }, sessionStorage: ss }), true, 'lembrado na aba');
  assert.equal(V.disponivel({ simulada: true, config: {}, local: { search: '?x=1&vagas=0' }, sessionStorage: ss }), false);
  assert.equal(V.disponivel({ simulada: true, config: {}, local: { search: '' }, sessionStorage: ss }), false, '?vagas=0 desliga');
  assert.equal(V.disponivel({ simulada: true, config: { VAGAS_PAINEL: true }, local: { search: '' }, sessionStorage: null }), true);
  assert.equal(V.bancoTemVagas({ ok: true, versao: 20261022120000, faltando: [] }), true);
  assert.equal(V.bancoTemVagas({ ok: true, versao: 20261024120001, faltando: ['20261024120000_vagas_onda2'] }), true, 'faltar a onda 2 não esconde o grupo');
  assert.equal(V.bancoTemVagas({ ok: true, versao: 20261024120001, faltando: [V.MIGRACAO] }), false);
  assert.equal(V.bancoTemVagas({ ok: true, versao: 20261010120000, faltando: [] }), false, 'banco de antes do Vagas (versão anterior)');
  assert.equal(V.bancoTemVagas({ ok: true, faltando: [] }), false, 'sem versão declarada: não arrisca');
  assert.equal(V.bancoTemVagas({ ok: false, faltando: [], semFuncao: true }), false);
  assert.equal(V.bancoTemVagas(null), false);
});

test('ganchos no painel: abasDoPapel com o 5º argumento põe as 4 abas depois de Relatórios; sem ele, nada muda; rotas de ida e volta', () => {
  assert.deepEqual(AD.abasDoPapel('admin', true, true, true, true),
    ['lista', 'processos', 'empresas', 'relatorios', 'vg-cidades', 'vg-operadores', 'vg-moderacao', 'vg-numeros', 'vendas', 'usuarios', 'comparativo', 'importar', 'conexoes']);
  assert.deepEqual(AD.abasDoPapel('admin', true, true, true), ['lista', 'processos', 'empresas', 'relatorios', 'vendas', 'usuarios', 'comparativo', 'importar', 'conexoes']);
  assert.deepEqual(AD.abasDoPapel('gestor', true, true, true, true), []);
  assert.deepEqual(AD.abasDoPapel('', false, true, true, true), ['lista', 'comparativo', 'importar'], 'sem servidor não há Vagas');
  for (const a of V.ABAS) {
    assert.deepEqual(AD.lerRota('#' + a), { aba: a });
    assert.equal(AD.formatarRota({ aba: a }), a);
  }
  assert.deepEqual(AD.lerRota('#vg-outra'), { aba: 'lista' });
  const html = ler('admin.html');
  for (const a of V.ABAS) {
    assert.match(html, new RegExp('<button type="button" class="aba" data-aba="' + a + '"[^>]* hidden>'), 'aba ' + a + ' nasce escondida');
    assert.match(html, new RegExp('<div id="vista-' + a + '" class="vista nao-imprimir" hidden></div>'));
  }
  const grupos = [...html.matchAll(/data-grupo="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(grupos, ['selecao', 'empresas', 'vagas', 'vendas', 'config'], 'Vagas entre Empresas e Vendas (VAGAS-TELAS §5)');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(scripts[scripts.indexOf('js/admin.js') - 1], 'js/admin-vagas.js');
  assert.match(html, /<link rel="stylesheet" href="assets\/admin-vagas\.css">/);
  assert.doesNotMatch(html, /vagas\/(js|assets|comum)\//, 'o painel não carrega nada de vagas/ (não é publicada no site do DISC)');
  assert.doesNotMatch(ler('js/admin-vagas.js'), /require\(['"]\.\.\/vagas|['"]vagas\/js/, 'nem o módulo');
});

test('cidades: situação, linha da praça (tudo do dado), efeito da mudança, meta para ativar, endereço sugerido e conferência do formulário', () => {
  const cidades = [{ slug: 'polo-go', nome: 'Polo', status: 'ativa', contagens: { anunciosNoAr: 8 } },
    { slug: 'vizinha-go', nome: 'Vizinha', status: 'ativa', praca: 'polo-go' }, { slug: 'nova-go', nome: 'Nova', status: 'lista_espera', metaListaEspera: 200, contagens: { listaEspera: 112 } }];
  assert.equal(V.rotuloStatusCidade(cidades[0]), 'Ativa');
  assert.equal(V.rotuloStatusCidade(cidades[1]), 'Ativa (entorno)');
  assert.equal(V.rotuloStatusCidade(cidades[2]), 'Lista de espera');
  const ops = [{ email: 'a@x.com', cidade: { slug: 'polo-go' }, repassePercentual: 0, ativo: true }, { email: 'b@x.com', cidade: 'nova-go', repassePercentual: 50, ativo: true }];
  assert.equal(V.linhaPraca(cidades[0], cidades, ops), 'Praça: Polo + Vizinha · operação própria');
  assert.equal(V.linhaPraca(cidades[1], cidades, ops), 'Entorno de Polo: aparece em "incluir entorno" · sem operador');
  assert.equal(V.linhaPraca(cidades[2], cidades, ops), 'operada por parceiro');
  assert.equal(V.linhaPraca(cidades[2], cidades, null), '', 'sem a lista de operadores, não diz nada sobre operação');
  assert.equal(V.efeitoStatus(cidades[0], 'pausada'), 'Pausar Polo esconde 8 vagas e bloqueia cadastros novos; nada é apagado.');
  assert.match(V.efeitoStatus(Object.assign({}, cidades[0], { status: 'pausada' }), 'ativa'), /^Reativar Polo volta a mostrar/);
  assert.equal(V.faltamParaAtivar(cidades[2]), 88);
  assert.equal(V.faltamParaAtivar(Object.assign({}, cidades[2], { metaListaEspera: null })), 0, 'sem meta, liberado');
  assert.equal(V.slugCidade('São João d\'Aliança', 'go'), 'sao-joao-d-alianca-go');
  assert.equal(V.slugCidade('X', ''), '');
  assert.deepEqual(V.lerCidade({ nome: '  Nova  Cidade ', uf: 'go', slug: 'nova-cidade-go', ibge: '52.216-01', metaListaEspera: '200', porte: 'pequena', praca: '' }, true),
    { ok: true, dados: { slug: 'nova-cidade-go', nome: 'Nova Cidade', uf: 'GO', ibge: '5221601', praca: null, porte: 'pequena', metaListaEspera: 200, status: 'rascunho' } });
  assert.equal(V.lerCidade({ nome: 'Nova', uf: 'G', slug: 'nova-g' }, true).erro, 'Informe a UF com 2 letras.');
  assert.match(V.lerCidade({ nome: 'Nova', uf: 'GO', slug: 'Nova Cidade' }, true).erro, /^Endereço inválido/);
  assert.equal(V.lerCidade({ nome: 'Nova', uf: 'GO', slug: 'nova-go', ibge: '123' }, true).erro, 'O código IBGE tem 7 números.');
  assert.equal(V.lerCidade({ nome: 'Nova', uf: 'GO', slug: '', metaListaEspera: '2a' }, false).erro, 'A meta da lista de espera é um número inteiro.');
  assert.equal(V.lerCidade({ nome: 'Nova', uf: 'GO', slug: 'qualquer coisa' }, false).ok, true, 'editar não muda o endereço');
});

test('operadores e moderação: conferência do convite, rótulos dos atos, título do motivo, voltas possíveis, pendências e filtros', () => {
  assert.deepEqual(V.lerOperador({ email: ' Op@X.com ', cidade: 'a-go', papel: 'operador', repassePercentual: '50', contratoVersao: '2026-10-13' }),
    { ok: true, dados: { cidade: 'a-go', email: 'op@x.com', papel: 'operador', repassePercentual: 50, contratoVersao: '2026-10-13' } });
  assert.equal(V.lerOperador({ email: 'x', cidade: 'a-go', papel: 'operador' }).erro, 'E-mail inválido.');
  assert.equal(V.lerOperador({ email: 'a@b.co', cidade: '', papel: 'operador' }).erro, 'Escolha a cidade.');
  assert.equal(V.lerOperador({ email: 'a@b.co', cidade: 'a-go', papel: 'admin' }).erro, 'Escolha o papel.');
  assert.equal(V.lerOperador({ email: 'a@b.co', cidade: 'a-go', papel: 'moderador', repassePercentual: '101' }).erro, 'Percentual de repasse inválido (0 a 100).');
  assert.equal(V.lerOperador({ email: 'a@b.co', cidade: 'a-go', papel: 'moderador', repassePercentual: '' }).dados.repassePercentual, 0);
  assert.equal(V.rotuloAto('empresa_suspender'), 'Suspendeu a empresa');
  assert.equal(V.rotuloAto('algo_novo_do_banco'), 'Algo novo do banco');
  assert.equal(V.tituloMotivo('anuncio_sem_valor'), 'Sem faixa salarial ou valor da diária');
  assert.equal(V.tituloMotivo('livre'), 'livre');
  assert.deepEqual(V.reversao({ acao: 'empresa_suspender', alvoId: 'e1' }).args, { p_empresa: 'e1', p_acao: 'reativar', p_motivo: 'empresa_reativada' });
  assert.deepEqual(V.reversao({ acao: 'suspender_por_denuncias', alvoId: 'a1' }).args, { p_anuncio: 'a1', p_acao: 'publicar', p_motivo: 'anuncio_ok_apos_revisao' });
  assert.equal(V.reversao({ acao: 'anuncio_remover', alvoId: 'a1' }), null, 'sem RPC de reversão (pedido ao banco)');
  assert.equal(V.pendencias({ contagens: { anunciosEmRevisao: 2, anunciosSuspensos: 1, empresasEmAnalise: 1, denunciasAbertas: 1, anunciosNoAr: 9 } }), 5);
  const regs = [{ cidade: 'a-go', alvo: 'anuncio', acao: 'anuncio_remover', motivo: 'anuncio_falso', alvoNome: 'Caixa · Loja' },
    { cidade: 'b-go', alvo: 'empresa', acao: 'empresa_aprovar', papel: 'operador' }, { cidade: 'a-go', alvo: 'zona', acao: 'zona_salvar' }];
  assert.equal(V.filtrarAtos(regs, { cidade: 'a-go' }).length, 2);
  assert.equal(V.filtrarAtos(regs, { tipo: 'cidade' }).length, 1, 'zonas e operadores entram em "Cidades, zonas e operadores"');
  assert.equal(V.filtrarAtos(regs, { busca: 'xyz' }).length, 0);
  assert.equal(V.filtrarAtos(regs, { busca: 'parece nao' }).length, 1, 'busca no título do motivo, sem acento');
  assert.equal(V.filtrarAtos(regs, { busca: 'liberou' }).length, 1, 'busca no rótulo do ato');
});

test('prévia do painel: dados fictícios em memória, nada de pessoa; cidade, zona, operador e reversão funcionam como as RPCs', async () => {
  const f = V.criarSimulada({ agora: () => AGORA });
  const r = await f.rpc('vagas_op_resumo', {});
  assert.ok(r.ok && r.cidades.length >= 2);
  assert.ok(r.cidades.some((c) => c.status === 'ativa') && r.cidades.some((c) => c.status === 'lista_espera') && r.cidades.some((c) => c.status === 'rascunho'));
  const tudo = JSON.stringify(f.estado());
  assert.doesNotMatch(tudo, /whatsapp"|cpf|curriculo|"pessoa"\s*:\s*\{|telefone/i, 'nenhum dado de pessoa na prévia do painel');
  const ativa = r.cidades.filter((c) => c.status === 'ativa')[0];
  const ind = await f.rpc('vagas_op_indicadores', { p_cidade: ativa.slug });
  assert.deepEqual(ind.indicadores.map((i) => i.chave), V.INDICADORES.map((i) => i.chave));
  assert.equal(ind.gatilhos.length, 5);
  for (const i of ind.indicadores) {
    if (i.semDado || i.alvo == null) assert.equal(i.cor, null, i.chave);
    else assert.equal(i.cor, R.corIndicador ? R.corIndicador(i.valor, i.alvo, i.direcao) : i.cor, i.chave + ': cor pela regra do arquivo');
  }
  await assert.rejects(f.rpc('vagas_adm_cidade_salvar', { p_dados: { slug: 'sem uf', nome: 'X', uf: 'GO' } }), /Endereço da cidade inválido/);
  const nova = await f.rpc('vagas_adm_cidade_salvar', { p_dados: { slug: 'cidade-teste-go', nome: 'Cidade Teste', uf: 'GO', status: 'rascunho' } });
  assert.equal(nova.cidade.status, 'rascunho');
  await f.rpc('vagas_adm_zona_salvar', { p_dados: { cidade: 'cidade-teste-go', slug: 'centro', nome: 'Centro', bairros: ['Centro'] } });
  assert.equal(f.estado().cidades.filter((c) => c.slug === 'cidade-teste-go')[0].zonas.length, 1);
  await assert.rejects(f.rpc('vagas_adm_operador_salvar', { p_dados: { cidade: 'cidade-teste-go', email: 'novo@x.com', papel: 'operador' } }), /Use o convite de operador/);
  const conv = await f.conta('operador', { email: 'novo@x.com', cidade: 'cidade-teste-go', papel: 'moderador' });
  assert.equal(conv.enviado, true);
  await f.rpc('vagas_adm_operador_salvar', { p_dados: { cidade: 'cidade-teste-go', email: 'novo@x.com', papel: 'moderador', repassePercentual: 20 } });
  const ops = (await f.rpc('vagas_adm_operadores', {})).operadores.filter((o) => o.email === 'novo@x.com')[0];
  assert.deepEqual([ops.papel, ops.repassePercentual, ops.cidade.slug], ['moderador', 20, 'cidade-teste-go']);
  const mods = (await f.rpc('vagas_op_moderacao', { p_filtro: { limite: 200 } })).registros;
  assert.equal(mods[0].acao, 'operador_salvar', 'cada ato da equipe entra no registro');
  const susp = mods.filter((m) => m.acao === 'empresa_suspender')[0];
  const volta = V.reversao(susp);
  await f.rpc(volta.rpc, volta.args);
  assert.equal((await f.rpc('vagas_op_moderacao', { p_filtro: {} })).registros[0].acao, 'empresa_reativar');
  await assert.rejects(f.rpc('vagas_funcao_que_nao_existe', {}), (e) => e.bancoDesatualizado === true);
});

test('Supabase: RPC por fetch no endereço do projeto com a chave pública e o token da sessão do painel; erros com as marcas', async () => {
  const chamadas = [];
  let resposta = { status: 200, corpo: { ok: true, cidades: [] } };
  const fetch = (url, op) => { chamadas.push({ url, op }); return Promise.resolve({ ok: resposta.status < 400, status: resposta.status, text: () => Promise.resolve(JSON.stringify(resposta.corpo)) }); };
  const f = V.criarSupabase({ url: 'https://proj.supabase.co/', chave: 'pub-123', sessao: () => Promise.resolve({ ok: true, token: 'tok-9' }), fetch });
  const r = await f.rpc('vagas_op_resumo', {});
  assert.deepEqual(r, { ok: true, cidades: [] });
  assert.equal(chamadas[0].url, 'https://proj.supabase.co/rest/v1/rpc/vagas_op_resumo');
  assert.equal(chamadas[0].op.method, 'POST');
  assert.deepEqual(chamadas[0].op.headers, { apikey: 'pub-123', Authorization: 'Bearer tok-9', 'Content-Type': 'application/json' });
  await f.rpc('vagas_adm_cidade_salvar', { p_dados: { slug: 'a-go' } });
  assert.deepEqual(JSON.parse(chamadas[1].op.body), { p_dados: { slug: 'a-go' } });
  await f.conta('operador', { email: 'a@b.co', cidade: 'a-go', papel: 'operador' });
  assert.equal(chamadas[2].url, 'https://proj.supabase.co/functions/v1/vagas-conta');
  assert.deepEqual(JSON.parse(chamadas[2].op.body), { acao: 'operador', email: 'a@b.co', cidade: 'a-go', papel: 'operador' });
  await assert.rejects(f.rpc('vagas_pessoa_minha', {}), /Função não permitida/, 'o painel só chama RPCs de operação e equipe');
  assert.equal(chamadas.length, 3);
  resposta = { status: 404, corpo: { code: 'PGRST202', message: 'Could not find the function' } };
  await assert.rejects(f.rpc('vagas_op_indicadores', { p_cidade: 'a-go' }), (e) => e.bancoDesatualizado === true);
  resposta = { status: 401, corpo: { message: 'JWT expired' } };
  await assert.rejects(f.rpc('vagas_op_resumo', {}), (e) => e.sessaoExpirada === true);
  resposta = { status: 200, corpo: { ok: false, erro: 'Sem permissão.' } };
  await assert.rejects(f.rpc('vagas_op_resumo', {}), /^Error: Sem permissão\.$/);
  const semRede = V.criarSupabase({ url: 'https://p.supabase.co', chave: 'k', sessao: () => Promise.resolve({ token: 't' }), fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
  await assert.rejects(semRede.rpc('vagas_op_resumo', {}), (e) => e.conexao === true);
  const semSessao = V.criarSupabase({ url: 'https://p.supabase.co', chave: 'k', sessao: () => Promise.reject(new Error('x')), fetch });
  await assert.rejects(semSessao.rpc('vagas_op_resumo', {}), (e) => e.sessaoExpirada === true);
});

test('texto e visual: sem palavra proibida nem "Notus", CSS só com tokens, nenhum innerHTML', () => {
  const js = ler('js/admin-vagas.js');
  assert.deepEqual(TELA.conferirTexto(js, 'js/admin-vagas.js', { permitirDisc: true }), []);
  const t = TELA.semComentarios(js);
  assert.doesNotMatch(t, /innerHTML|insertAdjacentHTML|outerHTML|document\.write|\beval\(/);
  assert.doesNotMatch(t, /(^|[^.\w])(confirm|alert|prompt)\(/);
  const css = ler('assets/admin-vagas.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'cor solta');
  assert.doesNotMatch(css, /font-size:\s*\d/, 'tamanho fora da escala --t-*');
  assert.doesNotMatch(css, /font-weight:\s*(?!400|600|700)\d/);
});
