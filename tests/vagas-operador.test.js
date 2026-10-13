'use strict';
// Vagas sem Caos — operação da praça (frente operacao, onda 2): regras puras de vagas/js/operador-regras.js (boletim do dia, motivos
// da lista fechada, sinais da fila, números da praça), textos transcritos iguais à origem (whatsapp.json, moderacao.json), a
// página e os scripts nas regras da casca (CSP, nada inline, palavras proibidas, sem cidade fixa) e a regra de LGPD na interface:
// o operador só chama RPCs de operação (nenhuma de pessoa, currículo, contato, foto ou conversa).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const O = require('../vagas/js/operador-regras.js');
const R = require('../vagas/js/regras.js');
const TC = require('../vagas/js/textos-conta.js');
const AV = require('../js/admin-vagas.js');
const TELA = require('./helpers/vagas-tela.js');

const RAIZ = path.join(__dirname, '..');
const lerJson = (rel) => JSON.parse(fs.readFileSync(path.join(RAIZ, rel), 'utf8'));
const WHATS = lerJson('conteudo/vagas-textos/whatsapp.json');
const MODERACAO = lerJson('conteudo/vagas-textos/moderacao.json');
const MOTIVOS = TC.moderacao.motivos;
const AGORA = Date.parse('2026-10-13T15:00:00Z');   // 12:00 em Brasília
const SCRIPTS = ['js/operador-regras.js', 'js/operador.js', 'js/operador-moderacao.js', 'js/operador-praca.js'];

function msg(chave) { return WHATS.mensagens.filter((m) => m.chave === chave)[0]; }
function anuncio(extra) {
  return Object.assign({ id: 'a1', codigo: 'K7M2QX', funcao: 'Atendente de loja', modalidade: 'clt', valor: { minCentavos: 170000, maxCentavos: 190000, unidade: 'mes' },
    zona: { slug: 'centro', nome: 'Centro' }, cidade: { slug: 'x-go', nome: 'Cidade X' }, publicadoEm: new Date(AGORA - 3600000).toISOString() }, extra || {});
}

test('operador.html e os scripts do operador seguem as regras da casca (CSP, nada inline, ordem, palavras proibidas, sem cidade fixa)', () => {
  assert.deepEqual(TELA.conferirPagina('operador.html'), []);
  for (const s of SCRIPTS) assert.deepEqual(TELA.conferirScript(s), [], s);
  const html = fs.readFileSync(path.join(TELA.VAGAS, 'operador.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(scripts[scripts.length - 1], 'js/operador.js', 'a casca da tela por último (as telas se registram antes)');
  for (const s of ['js/ui-area.js', 'js/pecas.js', 'js/textos-conta.js', 'js/operador-regras.js']) assert.ok(scripts.indexOf(s) !== -1 && scripts.indexOf(s) < scripts.indexOf('js/operador.js'), s);
  assert.match(html, /<body class="vg-pc vg-op">/);
  assert.match(html, /assets\/vagas-pc\.css/);
});

test('LGPD na interface: o operador só chama RPCs de operação, nunca de pessoa, currículo, contato, foto ou conversa', () => {
  const PERMITIDAS = new Set(['eu', 'cidades', 'anuncios', 'opResumo', 'opEmpresas', 'opEmpresaDecidir', 'opEmpresaCadastrar', 'opVincularMembro', 'opAnuncios',
    'opAnuncioDecidir', 'opDenuncias', 'opDenunciaDecidir', 'opModeracao', 'opReferencias', 'opReferenciaDecidir', 'opIndicadores', 'opAssistidos',
    'admZonaSalvar', 'cadastroAssistido', 'reenviarConfirmacao', 'sair']);
  const usadas = new Set();
  for (const s of SCRIPTS) {
    const js = TELA.semComentarios(fs.readFileSync(path.join(TELA.VAGAS, s), 'utf8'));
    for (const m of js.matchAll(/\bA\.([a-zA-Z]+)\b/g)) usadas.add(m[1]);
    assert.doesNotMatch(js, /minhaPessoa|contatoPessoa|cartoes|fotoUrl|conversa\(|exportarMeusDados|curriculo/i, s);
  }
  for (const u of usadas) assert.ok(PERMITIDAS.has(u), 'RPC fora da operação: ' + u);
});

test('boletim do dia: o modelo é o de whatsapp.json palavra por palavra (texto e item) e o lembrete do cadastro assistido também', () => {
  const b = msg('boletim_do_dia');
  assert.equal(O.BOLETIM.texto, b.texto);
  assert.equal(O.BOLETIM.item, b.formato_item);
  assert.equal(O.MSG_ASSISTIDO, msg('operador_cadastro_assistido').texto);
});

test('montarBoletim: cidade, data e total do dado; uma linha por vaga com o link curto; sem https:// nem cidade fixa', () => {
  const t = O.montarBoletim({ cidade: 'Cidade X', data: '13/10', total: 12, site: 'https://vagas.gestaosemcaos.com.br/', slug: 'x-go',
    vagas: [anuncio(), anuncio({ codigo: 'P9Q2RS', funcao: 'Diária: descarga', modalidade: 'diaria', valor: { minCentavos: 12000, maxCentavos: null, unidade: 'dia' }, zona: null })] });
  const linhas = t.split('\n');
  assert.equal(linhas[0], '*Vagas sem Caos · Cidade X · 13/10*');
  assert.equal(linhas[2], '• Atendente de loja · Centro · R$ 1.700 a R$ 1.900 · vagas.gestaosemcaos.com.br/v/K7M2QX');
  assert.equal(linhas[3], '• Diária: descarga · Cidade X · R$ 120 por dia · vagas.gestaosemcaos.com.br/v/P9Q2RS', 'sem zona: a cidade do dado');
  assert.match(t, /12 vagas abertas hoje\. Veja todas e candidate-se pelo celular: vagas\.gestaosemcaos\.com\.br\/x-go\/\n/);
  assert.match(t, /Se alguém pedir em nosso nome, é golpe\.$/);
  assert.doesNotMatch(t, /https?:\/\/|\{\{/);
  assert.equal(O.enderecoCurto('https://a.b/c/'), 'a.b/c');
  assert.equal(O.preencher('Oi, {{nome}}{{x}}!', { nome: 'Ana' }), 'Oi, Ana!', 'variável sem valor some');
});

test('selecionarBoletim: novas desde ontem / 24 h / 7 dias, no máximo 10 (as mais novas); sem nova, as 3 mais recentes ainda abertas', () => {
  const h = 3600000;
  const lista = [0, 5, 20, 30, 50, 100, 140, 200].map((x, i) => anuncio({ id: 'a' + i, codigo: 'C' + i, publicadoEm: new Date(AGORA - x * h).toISOString() }));
  const fuso = 'America/Sao_Paulo';
  assert.deepEqual(O.selecionarBoletim(lista, '24h', { agora: AGORA, fuso }).vagas.map((a) => a.id), ['a0', 'a1', 'a2']);
  // Desde 00:00 de ontem (12/10 em Brasília): 0 h, 5 h, 20 h e 30 h (12/10 06:00) entram; 50 h (11/10) não.
  assert.deepEqual(O.selecionarBoletim(lista, 'ontem', { agora: AGORA, fuso }).vagas.map((a) => a.id), ['a0', 'a1', 'a2', 'a3']);
  assert.equal(O.selecionarBoletim(lista, 'semana', { agora: AGORA, fuso }).vagas.length, 7);
  const muitas = Array.from({ length: 14 }, (_, i) => anuncio({ id: 'm' + i, publicadoEm: new Date(AGORA - i * 60000).toISOString() }));
  const s = O.selecionarBoletim(muitas, '24h', { agora: AGORA, fuso });
  assert.equal(s.vagas.length, O.MAX_BOLETIM);
  assert.equal(s.vagas[0].id, 'm0');
  assert.equal(s.novas, 14);
  const velhas = lista.slice(5).map((a) => Object.assign({}, a));
  const r = O.selecionarBoletim(velhas, '24h', { agora: AGORA, fuso });
  assert.equal(r.reaproveitadas, true);
  assert.deepEqual(r.vagas.map((a) => a.id), ['a5', 'a6', 'a7']);
  assert.deepEqual(O.selecionarBoletim([], 'ontem', { agora: AGORA, fuso }), { vagas: [], reaproveitadas: false, novas: 0 });
});

test('motivos: sempre chaves de moderacao.json, do alvo certo; publicar, reativar e improcedente têm motivo fixo', () => {
  const chaves = new Set(MODERACAO.motivos.map((m) => m.chave));
  const casos = [['anuncio', 'devolver'], ['anuncio', 'remover'], ['empresa', 'recusar'], ['empresa', 'suspender'], ['referencia', 'recusar_texto'], ['referencia', 'remover']];
  for (const [alvo, dec] of casos) {
    const l = O.motivosPara(MOTIVOS, alvo, dec);
    assert.ok(l.length >= 1, alvo + '/' + dec);
    for (const m of l) { assert.ok(chaves.has(m.chave), m.chave); assert.equal(MOTIVOS[m.chave].alvo, alvo); assert.ok(m.titulo); }
  }
  const dev = O.motivosPara(MOTIVOS, 'anuncio', 'devolver').map((m) => m.chave);
  assert.equal(MOTIVOS[dev[0]].acao, 'recusar', 'devolver: primeiro o que se corrige');
  assert.ok(!dev.includes('anuncio_denuncias') && !dev.includes('anuncio_ok_apos_revisao'));
  assert.equal(MOTIVOS[O.motivosPara(MOTIVOS, 'anuncio', 'remover')[0].chave].acao, 'remover');
  assert.deepEqual(O.motivosPara(MOTIVOS, 'empresa', 'recusar').map((m) => m.chave).sort(), ['empresa_cnpj_nao_confere', 'empresa_sem_representacao']);
  assert.deepEqual(O.motivosPara(MOTIVOS, 'anuncio', 'publicar').map((m) => m.chave), ['anuncio_ok_apos_revisao']);
  assert.deepEqual(O.motivosPara(MOTIVOS, 'empresa', 'reativar').map((m) => m.chave), ['empresa_reativada']);
  assert.deepEqual(O.motivosPara(MOTIVOS, 'denuncia', 'improcedente').map((m) => m.chave), ['denuncia_improcedente']);
  assert.deepEqual(O.motivosPara(MOTIVOS, 'empresa', 'aprovar'), []);
  assert.ok(!O.motivosPara(MOTIVOS, 'referencia', 'recusar_texto').some((m) => m.chave === 'referencia_limite'));
  const men = O.motivosDenuncia(MOTIVOS, 'mensagem').map((m) => m.chave);
  assert.ok(men.includes('mensagem_pedido_dinheiro') && men.includes('empresa_suspensa_golpe'));
  assert.ok(O.motivosDenuncia(MOTIVOS, 'referencia').every((m) => MOTIVOS[m.chave].alvo === 'referencia'));
  assert.ok(O.motivosDenuncia(MOTIVOS, 'anuncio').every((m) => MOTIVOS[m.chave].alvo === 'anuncio'));
});

test('fila: por que está esperando, sinais do texto (lista de regras.js) e o trecho marcado como palavra inteira', () => {
  assert.match(O.porQueNaFila({ status: 'suspenso', denunciasAbertas: 3 }), /^3 denúncias de contas diferentes/);
  assert.match(O.porQueNaFila({ status: 'em_revisao', empresa: { status: 'em_analise' } }), /Empresa ainda em análise/);
  assert.match(O.porQueNaFila({ status: 'em_revisao', empresa: { status: 'ativa' } }), /Revisão obrigatória/);
  const golpe = O.sinaisDoAnuncio(anuncio({ descricao: 'Trabalhe de casa. Taxa de cadastro de R$ 49,90 por Pix para liberar o material.' }));
  assert.equal(golpe[0].tipo, 'golpe');
  assert.equal(golpe[0].forte, true);
  const doc = O.sinaisDoAnuncio(anuncio({ descricao: 'Descarregar caminhão. Levar RG original no primeiro dia.', modalidade: 'diaria', diaria: { data: '2026-10-18' } }));
  assert.equal(doc[0].texto, 'Sinal: pede documento no texto');
  assert.ok(doc.some((s) => s.texto === 'Data da diária informada'));
  assert.deepEqual(O.marcarTrecho('Jorge pediu: levar RG original.', 'rg').map((p) => p.marcado ? '[' + p.texto + ']' : p.texto).join(''), 'Jorge pediu: levar [RG] original.');
  assert.deepEqual(O.marcarTrecho('Pagamento só por PÍX hoje', 'pix').filter((p) => p.marcado).map((p) => p.texto), ['PÍX']);
  assert.deepEqual(O.marcarTrecho('nada aqui', 'rg'), [{ texto: 'nada aqui', marcado: false }]);
  assert.deepEqual(O.marcarTrecho('texto', ''), [{ texto: 'texto', marcado: false }]);
  assert.equal(O.sinaisDoAnuncio(anuncio({ denunciasAbertas: 2 })).pop().texto, '2 denúncias abertas');
});

test('pequenas regras: atrasada (> 24 h), papel, código do evento, repasse (parceiro × operação própria), endereço da zona', () => {
  assert.equal(O.atrasada(new Date(AGORA - 25 * 3600000).toISOString(), AGORA), true);
  assert.equal(O.atrasada(new Date(AGORA - 23 * 3600000).toISOString(), AGORA), false);
  assert.equal(O.atrasada('', AGORA), false);
  assert.equal(O.rotuloPapel('moderador'), 'Moderação');
  assert.equal(O.rotuloPapel('admin'), 'Equipe da Gestão sem Caos');
  assert.equal(O.codigoEvento('mutirao', '2026-10-13'), 'mutirao-20261013');
  assert.equal(O.codigoEvento('<x>', '2026-10-13'), 'balcao-20261013');
  assert.deepEqual(O.REPASSE(50), { tipo: 'parceiro', percentual: 50 });
  assert.deepEqual(O.REPASSE(0), { tipo: 'propria', percentual: 0 });
  assert.deepEqual(O.REPASSE(undefined), { tipo: 'desconhecido' });
  assert.equal(O.slugZona('Zona rural e lago'), 'zona-rural-e-lago');
  assert.equal(O.slugZona('Região Norte'), 'regiao-norte');
});

test('números da praça: valor com unidade, alvo (menor é melhor = "até"), cor só como rótulo, barra e texto de "sem dado"', () => {
  const f = (x) => O.formatarIndicador(Object.assign({ nome: 'N', direcao: 'maior_melhor', hipotese: false }, x));
  let r = f({ chave: 'vagas_ativas', unidade: 'vagas', valor: 14, alvo: 20, alvoLancamento: 15, cor: 'atencao',
    detalhe: { porArea: [{ nome: 'Atendimento e recepção', valor: 4 }, { nome: 'Caixa', valor: 3 }] } });
  assert.deepEqual([r.valor, r.alvo, r.cor, r.corRotulo, r.barra], ['14', 'alvo 20 · lançamento 15', 'atencao', 'Perto do alvo', 70]);
  assert.equal(r.nota, 'Mais vagas: Atendimento e recepção (4), Caixa (3)');
  r = f({ chave: 'primeira_resposta_empresa_dias', unidade: 'dias', direcao: 'menor_melhor', valor: 3.2, alvo: 7, cor: 'ok', detalhe: { semRespostaEm7DiasPct: 12 } });
  assert.deepEqual([r.valor, r.alvo, r.barra, r.corRotulo, r.nota], ['3,2 dias', 'alvo até 7 dias', 100, 'No alvo', 'mediana · 12% sem resposta em 7 dias']);
  r = f({ chave: 'denuncia_tempo_decisao_h', unidade: 'horas', direcao: 'menor_melhor', valor: 48, alvo: 24, cor: 'alerta', hipotese: true, detalhe: { abertasMais24h: 2 } });
  assert.deepEqual([r.valor, r.alvo, r.barra, r.corRotulo], ['48 h', 'alvo até 24 h (hipótese)', 50, 'Longe do alvo']);
  r = f({ chave: 'fila_moderacao', unidade: 'itens', direcao: 'menor_melhor', valor: 0, alvo: 0, cor: 'ok', detalhe: { anuncios: 0, empresas: 0, referencias: 0 } });
  assert.equal(r.barra, 100);
  assert.equal(f({ chave: 'fila_moderacao', unidade: 'itens', direcao: 'menor_melhor', valor: 2, alvo: 0, cor: 'alerta' }).barra, 0);
  r = f({ chave: 'receita_liquida_centavos', unidade: 'centavos', valor: null, alvo: null, semDado: true });
  assert.deepEqual([r.valor, r.alvo, r.cor, r.barra, r.semDado, r.nota], ['—', 'sem alvo definido', null, null, true, 'Grátis no lançamento: ainda não há vendas.']);
  assert.equal(f({ chave: 'emails_mes', unidade: 'e-mails', valor: 1140, alvo: 3000, direcao: 'menor_melhor', cor: 'ok' }).valor, '1.140');
  assert.equal(O.valorComUnidade(123640, 'centavos'), 'R$ 1.236,40');
  assert.equal(O.valorComUnidade(150000, 'centavos'), 'R$ 1.500');
  assert.equal(O.valorComUnidade(1, 'dias'), '1 dia');
  assert.equal(f({ chave: 'vagas_ativas', unidade: 'vagas', valor: 3, alvo: null, cor: null }).alvo, 'sem alvo definido', 'cidade sem porte: sem alvo e sem cor');
  const sem = f({ chave: 'vagas_combinou_7d', unidade: '%', valor: null, alvo: 60, semBase: true, cor: null });
  assert.equal(sem.valor, '—');
});

test('gatilhos e contagens: situação por partes (ok, não, manual, sem dado, regra fixa) e as 8 contagens do resumo', () => {
  const g = O.formatarGatilho({ chave: 'antes_de_cobrar', nome: 'Pode começar a cobrar', aplica: true, atingido: false,
    partes: [{ descricao: 'a', ok: true }, { descricao: 'b', ok: false }, { descricao: 'c', ok: null, semDado: true }] });
  assert.deepEqual([g.situacao, g.rotulo, g.contagem], ['nao', 'Ainda não', '1 de 3']);
  assert.deepEqual(g.partes.map((p) => p.estado), ['ok', 'nao', 'sem_dado']);
  assert.equal(O.formatarGatilho({ aplica: true, atingido: null, partes: [{ ok: null, manual: true }] }).situacao, 'conferir');
  assert.equal(O.formatarGatilho({ aplica: false, partes: [] }).rotulo, 'Não se aplica');
  assert.equal(O.formatarGatilho({ aplica: true, atingido: true, partes: [{ ok: true, fixa: true }] }).rotulo, 'Regra fixa');
  const c = O.contagensResumo({ anunciosNoAr: 1200, denunciasAbertas: 2 });
  assert.equal(c.length, 8);
  assert.deepEqual(c[0], { chave: 'anunciosNoAr', rotulo: 'Vagas no ar', valor: '1.200' });
  assert.equal(c.filter((x) => x.chave === 'pessoas')[0].valor, '0');
});

test('números da praça: a formatação do operador e a do painel do DISC (js/admin-vagas.js) dão o MESMO resultado', async () => {
  const fonte = AV.criarSimulada({ agora: () => AGORA });
  const resumo = await fonte.rpc('vagas_op_resumo', {});
  for (const c of resumo.cidades) {
    const r = await fonte.rpc('vagas_op_indicadores', { p_cidade: c.slug });
    assert.equal(r.indicadores.length, 15);
    for (const i of r.indicadores) assert.deepEqual(O.formatarIndicador(i), AV.formatarIndicador(i), c.slug + ' ' + i.chave);
    for (const g of r.gatilhos) assert.deepEqual(O.formatarGatilho(g), AV.formatarGatilho(g), g.chave);
    assert.deepEqual(O.contagensResumo(c.contagens), AV.contagensResumo(c.contagens));
  }
  for (const [v, u] of [[0, '%'], [3.25, 'dias'], [1, 'dias'], [99999, 'centavos'], [-500, 'centavos'], [1234567, 'pessoas'], [null, 'horas']]) {
    assert.equal(O.valorComUnidade(v, u), AV.valorComUnidade(v, u), v + ' ' + u);
  }
  // O próprio trecho de código é o mesmo nos dois arquivos (entre os marcadores >>> e <<<).
  const trecho = (rel) => { const t = fs.readFileSync(path.join(RAIZ, rel), 'utf8'); return t.slice(t.indexOf('var CORES_PADRAO'), t.indexOf('// <<<')); };
  assert.equal(trecho('vagas/js/operador-regras.js'), trecho('js/admin-vagas.js'));
});

test('CSS do operador: só tokens (nenhuma cor solta, tamanho fora da escala ou peso fora de 400/600/700)', () => {
  const css = fs.readFileSync(path.join(TELA.VAGAS, 'assets/vagas-operador.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(css, /font-size:\s*\d/);
  assert.doesNotMatch(css, /font-weight:\s*(?!400|600|700)\d/);
  assert.ok(R.TESTES_SELO.length === 5);
});
