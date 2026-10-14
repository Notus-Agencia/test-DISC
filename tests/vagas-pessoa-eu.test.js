'use strict';
// Vagas sem Caos — área da pessoa (eu.html, frente pessoa da onda 2): lógica pura de vagas/js/eu-logica.js (conversões do currículo,
// validação por passo, prévia do cartão cego igual à do banco, candidaturas, quem viu, referências) e as conferências de segurança e
// de texto da página e dos scripts (tests/helpers/vagas-tela.js). Nada aqui depende do nome nem do endereço da cidade da semente:
// a cidade ativa vem de vagas_cidades_publicas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const L = require('../vagas/js/eu-logica.js');
const R = require('../vagas/js/regras.js');
const T = require('../vagas/js/textos.js');
// No navegador textos-conta.js acrescenta as chaves ao VAGAS_TEXTOS; no Node exporta à parte: junta igual ao navegador.
const TC = require('../vagas/js/textos-conta.js');
Object.keys(TC).forEach((k) => { if (k === 'avisos') Object.assign(T.avisos, TC.avisos); else T[k] = TC[k]; });
const PREVIA = require('../vagas/js/api-previa.js');
const TELA = require('./helpers/vagas-tela.js');

const RAIZ = path.join(__dirname, '..');
const AGORA = Date.parse('2026-10-13T15:00:00Z');
const SCRIPTS = ['js/eu-logica.js', 'js/eu.js', 'js/eu-curriculo.js', 'js/eu-candidaturas.js', 'js/eu-referencias.js', 'js/eu-dados.js'];

function memoria() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
function novo() {
  let t = AGORA;
  return PREVIA.criarBackend({ armazenamento: memoria(), agora: () => (t += 1000) });
}
async function ok(p) { const r = await p; assert.equal(r.ok, true, r && r.erro); return r; }
const rpc = (b, nome, args) => ok(b.rpc(nome, args || {}));
const entrar = (b, email) => ok(b.conta.entrar(email, PREVIA.SENHA_PREVIA));
async function contaNova(b, email) {
  const c = await ok(b.conta.cadastrar({ email, tipo: 'pessoa', nome: 'Pessoa Nova' }));
  const m = /token_hash=([^&]+)&type=(\w+)/.exec(c.linkPrevia);
  await ok(b.conta.confirmarLink({ tokenHash: m[1], tipo: m[2] }));
  await ok(b.conta.definirSenha('senha-boa-123'));
}
async function cidadeAtiva(b) {
  const r = await rpc(b, 'vagas_cidades_publicas');
  const c = r.cidades.find((x) => x.status === 'ativa' && x.zonas.length);
  assert.ok(c, 'a semente tem uma cidade ativa com zonas');
  return { cidades: r.cidades, cidade: c, zonasDe: (s) => (r.cidades.find((x) => x.slug === s) || { zonas: [] }).zonas };
}

// ---------------------------------------------------------------------------------------------------------------- página e scripts
test('eu.html e os scripts da área: CSP, ordem dos scripts, nada inline, sem innerHTML/confirm, sem palavra proibida nem cidade fixa', () => {
  assert.deepEqual(TELA.conferirPagina('eu.html'), []);
  for (const s of SCRIPTS) assert.deepEqual(TELA.conferirScript(s), [], s);
  const html = fs.readFileSync(path.join(RAIZ, 'vagas', 'eu.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts.slice(-6), SCRIPTS.slice(0, 1).concat(SCRIPTS.slice(2), ['js/eu.js']), 'telas antes, eu.js por último');
  for (const base of ['js/ui-area.js', 'js/pecas-pessoa.js', 'js/conversa.js', 'js/textos-conta.js']) assert.ok(scripts.includes(base), base);
  assert.match(html, /img-src 'self' data: blob: https:\/\/tevpqngqzxcswmticjnr\.supabase\.co/, 'a foto (blob e URL assinada) precisa da CSP (só o projeto)');
  assert.match(html, /<title>[^<]*\| Vagas sem Caos<\/title>/);
  assert.ok(!/notus|icone\.svg/i.test(html.replace(/comum\/notus\.css/g, '')), 'nada da Notus na tela');
});

test('vagas-pessoa.css: só tokens (nenhuma cor nova em hexadecimal), nada de fonte nova', () => {
  const css = fs.readFileSync(path.join(RAIZ, 'vagas', 'assets', 'vagas-pessoa.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), 'cor em hexadecimal');
  for (const m of css.matchAll(/font-family:\s*([^;]+);/g)) assert.match(m[1], /monospace/, 'só a fonte de código já usada na casca');
  for (const m of css.matchAll(/rgba\(([^)]+)\)/g)) assert.match(m[1], /^243, 68, 5, \.\d+$|^19, 40, 63, \.\d+$/, 'transparência só do laranja e do azul-escuro da identidade');
});

test('textos usados pelas telas existem (avisos, botões, validação, foto, referência e os aceites de consentimentos.json)', () => {
  const fonte = SCRIPTS.map((s) => fs.readFileSync(path.join(RAIZ, 'vagas', s), 'utf8')).join('\n');
  const chaves = [...new Set([...fonte.matchAll(/U\.t\('([a-z_.]+)'/g)].map((m) => m[1]))];
  assert.ok(chaves.length > 20);
  for (const k of chaves) {
    if (k.endsWith('.')) continue;   // chave montada na hora (referencia.texto_status.<situação>): conferida logo abaixo
    assert.ok(T.t(k), 'texto ausente: ' + k);
  }
  for (const s of ['pendente', 'nao_publicado']) assert.ok(T.t('referencia.texto_status.' + s), s);
  for (const a of ['foto_opcional', 'pessoa_banco_talentos', 'pessoa_combinou_contato', 'pessoa_referencia_aceitar', 'pessoa_referencia_pedir']) {
    const c = T.consentimentos.aceites[a];
    assert.ok(c && c.titulo && c.texto, a);
  }
  for (const a of ['pessoa_combinou_contato', 'pessoa_referencia_aceitar', 'pessoa_referencia_pedir']) assert.match(T.consentimentos.aceites[a].texto, /\{\{empresa_nome\}\}/, a);
  assert.equal(L.semMarcador(T.consentimentos.aceites.foto_opcional.explicacao).includes('['), false, 'marcador de revisão não vai para a tela');
});

// ---------------------------------------------------------------------------------------------------------------- conversões
test('pílulas de tempo: N = 3, 9, 24 e 48 meses antes do mês atual; datas gravadas voltam na pílula mais próxima', () => {
  assert.deepEqual(L.TEMPOS.map((t) => [t.id, t.rotulo]), [['menos6', 'Menos de 6 meses'], ['6a12', '6 meses a 1 ano'], ['1a3', '1 a 3 anos'], ['mais3', 'Mais de 3 anos']]);
  assert.equal(L.mesAtual(AGORA), '2026-10');
  assert.equal(L.inicioDoTempo('menos6', AGORA), '2026-07');
  assert.equal(L.inicioDoTempo('6a12', AGORA), '2026-01');
  assert.equal(L.inicioDoTempo('1a3', AGORA), '2024-10');
  assert.equal(L.inicioDoTempo('mais3', AGORA), '2022-10');
  assert.equal(L.mesMenos('2026-02', 3), '2025-11');
  for (const t of L.TEMPOS) assert.equal(L.tempoDoPeriodo(L.inicioDoTempo(t.id, AGORA), '', AGORA), t.id, 'ida e volta: ' + t.id);
  assert.equal(L.tempoDoPeriodo('2023-02', '2025-01', AGORA), '1a3');   // 24 meses
  assert.equal(L.tempoDoPeriodo('2020-01', '2025-01', AGORA), 'mais3');
  assert.equal(L.tempoDoPeriodo('2026-05', '2026-09', AGORA), 'menos6');
  assert.equal(L.tempoDoPeriodo('', '', AGORA), '');
});

test('carteira assinada, CNH, pretensão e WhatsApp: os valores do contrato', () => {
  assert.equal(L.informalDe('sim'), false);
  assert.equal(L.informalDe('nao'), true);
  assert.equal(L.informalDe('nd'), null, '"Prefiro não dizer" manda null (migração 0005 do banco)');
  assert.equal(L.informalDe(''), null, 'sem resposta também é "não informado" (sem a chave o banco grava false = "Sim")');
  assert.equal(L.carteiraDe(true), 'nao');
  assert.equal(L.carteiraDe(false), 'sim', 'ao reabrir, false volta como "Sim" marcado');
  assert.equal(L.carteiraDe(null), 'nd', 'null (banco com a 0005) volta como "Prefiro não dizer" marcado');
  assert.equal(L.carteiraDe(undefined), '', 'resposta sem a chave: nenhuma pílula');
  // Os dois bancos: com a 0005 o null volta null; antes dela, vira false (e reabre como "Sim").
  for (const c of ['sim', 'nao', 'nd']) assert.equal(L.carteiraDe(L.informalDe(c)), c, 'ida e volta com o banco novo: ' + c);
  assert.equal(L.carteiraDe(L.informalDe('nd') === true), 'sim', 'banco antigo (informal === true) reabre "Prefiro não dizer" como "Sim"');
  assert.deepEqual(L.CNH_OPCOES.map((c) => [c.id, c.lista]), [['nao', []], ['A', ['A']], ['B', ['B']], ['AB', ['A', 'B']], ['C', ['C']]]);
  assert.equal(L.cnhDe([]), 'nao');
  assert.equal(L.cnhDe(['A', 'B']), 'AB');
  assert.equal(L.cnhDe(['B', 'D']), 'C');
  assert.equal(L.cnhDe(['E']), 'C');
  assert.equal(L.cnhDe(['A']), 'A');
  assert.equal(L.centavosDe(''), null);
  assert.equal(L.centavosDe('1600'), 160000);
  assert.equal(L.centavosDe('1.600'), 160000);
  assert.equal(L.centavosDe('R$ 1.600,00'), 160000);
  assert.ok(Number.isNaN(L.centavosDe('mil e seiscentos')));
  assert.ok(Number.isNaN(L.centavosDe('9999999')));
  assert.equal(L.reaisDe(180000), '1800');
  assert.equal(L.reaisDe(null), '');
  assert.equal(L.formatarWhatsapp('5562991234567'), '(62) 99123-4567');
  assert.equal(L.formatarWhatsapp('62991234567'), '(62) 99123-4567');
  assert.equal(L.formatarWhatsapp(''), '');
});

test('experiência -> contrato: pílula vira início, "atual" deixa o fim vazio, "Não" vira informal, "Prefiro não dizer" vira null, campo vazio sai do envio', () => {
  const cv = L.cvVazio({ cidade: 'cidade-x' });
  cv.experiencias = [
    { cargo: ' Atendente  de loja ', onde: '', tempo: '1a3', inicio: L.inicioDoTempo('1a3', AGORA), fim: '', atual: false, carteira: 'nao', datas: false },
    { cargo: 'Caixa', onde: 'Mercado do bairro', tempo: 'menos6', inicio: L.inicioDoTempo('menos6', AGORA), fim: '', atual: true, carteira: 'nd', datas: false },
    { cargo: 'Repositor', onde: 'Loja X', tempo: '', inicio: '2021-03', fim: '2022-01', atual: false, carteira: 'sim', datas: true },
    L.expVazia()];
  const d = L.pessoaDoCv(cv, { agora: AGORA });
  assert.deepEqual(d.experiencias, [
    { funcao: 'Atendente de loja', inicio: '2024-10', fim: '2026-10', informal: true },
    { funcao: 'Caixa', empregador: 'Mercado do bairro', inicio: '2026-07', fim: '', informal: null },
    { funcao: 'Repositor', empregador: 'Loja X', inicio: '2021-03', fim: '2022-01', informal: false }]);
  cv.semExperiencia = true;
  assert.deepEqual(L.pessoaDoCv(cv, { agora: AGORA }).experiencias, [], '"Ainda não trabalhei" envia experiencias: []');
});

test('validação por passo: cada campo obrigatório com a mensagem certa, no campo certo; depois de preencher, nada', () => {
  const zonas = [{ slug: 'z1', nome: 'Zona 1', bairros: [] }];
  const op = { zonasDe: (s) => (s === 'c1' ? zonas : []), agora: AGORA };
  const cv = L.cvVazio();
  const campos = (n) => L.validarPasso(n, cv, op).map((e) => e.campo + ': ' + e.msg);
  assert.deepEqual(campos(1), ['vg-cv-cidades: Escolha pelo menos uma cidade.', 'vg-cv-zona: Escolha a zona onde você mora ou pode trabalhar.']);
  assert.deepEqual(campos(2), ['vg-cv-areas: Marque pelo menos uma área', 'vg-exp-cargo: Preencha o que você fazia ou toque em "Ainda não trabalhei"']);
  assert.deepEqual(campos(3), ['vg-cv-escolaridade: Escolha a sua escolaridade.']);
  assert.deepEqual(campos(4), ['vg-cv-turnos: Marque pelo menos um turno em que pode trabalhar.',
    'vg-cv-modalidades: Marque pelo menos um tipo de vaga (CLT, temporário, diária, freelancer ou estágio).', 'vg-cv-nome: Informe seu nome e sobrenome.',
    'vg-cv-whatsapp: ' + T.t('validacao.whatsapp_invalido')]);
  assert.equal(L.primeiroPassoIncompleto(cv, op), 1);
  cv.cidades = ['c1']; cv.zona = 'z9';
  assert.deepEqual(campos(1), ['vg-cv-zona: Escolha a zona onde você mora ou pode trabalhar.'], 'zona de outra cidade não vale');
  cv.zona = 'z1';
  cv.areas = ['caixa'];
  cv.experiencias = [{ cargo: 'A', onde: '', tempo: '', inicio: '', fim: '', atual: false, carteira: '', datas: false },
    { cargo: 'Caixa', onde: 'veja www.loja-exemplo.com', tempo: 'menos6', inicio: L.inicioDoTempo('menos6', AGORA), fim: '', atual: false, carteira: '', datas: false }];
  assert.deepEqual(campos(2), ['vg-exp-cargo: Preencha o que você fazia', 'vg-exp-tempo: Escolha por quanto tempo',
    'vg-exp-onde-2: ' + R.conferirTexto('veja www.loja-exemplo.com', 'perfil').erro]);
  cv.experiencias = [{ cargo: 'Caixa', onde: '', tempo: '', inicio: '2026-11', fim: '', atual: false, carteira: '', datas: true }];
  assert.deepEqual(campos(2), ['vg-exp-inicio: O início de uma experiência não pode estar no futuro.']);
  cv.experiencias = [{ cargo: 'Caixa', onde: '', tempo: '', inicio: '2025-05', fim: '2024-01', atual: false, carteira: '', datas: true }];
  assert.deepEqual(campos(2), ['vg-exp-fim: A saída não pode ser antes do início.']);
  cv.experiencias = [L.expVazia()];
  cv.semExperiencia = true;
  assert.deepEqual(campos(2), []);
  cv.escolaridade = 'medio';
  cv.cursos = ['Atendimento www.golpe.com'];
  assert.equal(campos(3)[0].split(':')[0], 'vg-cv-cursos', 'curso com link é barrado como no banco');
  cv.cursos = ['Atendimento ao cliente'];
  cv.turnos = ['manha']; cv.modalidades = ['clt']; cv.nome = 'Ana'; cv.whatsapp = '(62) 9912-3456'; cv.pretensao = 'abc';
  assert.deepEqual(campos(4).map((x) => x.split(':')[0]), ['vg-cv-pretensao', 'vg-cv-nome', 'vg-cv-whatsapp']);
  cv.nome = 'Ana Souza'; cv.whatsapp = '(62) 99123-4567'; cv.pretensao = '1.600';
  for (const n of [1, 2, 3, 4, 5]) assert.deepEqual(campos(n), [], 'passo ' + n);
  assert.equal(L.primeiroPassoIncompleto(cv, op), 5);
  assert.equal(L.prontoParaSalvar(cv, op), true);
});

// ---------------------------------------------------------------------------------------------------------------- contra a prévia
test('currículo de quem já tem cadastro: ida e volta sem perder nada e a prévia do passo 5 é o MESMO cartão que o banco devolve', async () => {
  const b = novo();
  const { cidades } = await cidadeAtiva(b);
  await entrar(b, 'pessoa@previa.com');
  const minha = await rpc(b, 'vagas_pessoa_minha');
  const cv = L.cvDaPessoa(minha.pessoa, AGORA);
  assert.equal(cv.cidades[0], minha.pessoa.cidade.slug);
  assert.equal(cv.zona, minha.pessoa.zona.slug);
  assert.deepEqual(cv.areas, minha.pessoa.areas.slice().sort((a, b2) => R.AREAS.findIndex((x) => x.id === a) - R.AREAS.findIndex((x) => x.id === b2)));
  assert.equal(cv.nome, minha.pessoa.nome);
  assert.equal(cv.whatsapp, L.formatarWhatsapp(minha.pessoa.whatsapp));
  const d = L.pessoaDoCv(cv, { sobre: minha.pessoa.sobre, email: minha.pessoa.email, agora: AGORA });
  assert.equal(R.lerPessoa(d, AGORA).ok, true, R.lerPessoa(d, AGORA).erro);
  assert.deepEqual(d.cargos, L.cargosDe(cv), '"Quer trabalhar com" = as áreas marcadas');
  const local = L.cartaoLocal(cv, { cidades, cartao: minha.cartao, agora: AGORA });
  const salvo = await rpc(b, 'vagas_pessoa_salvar', { p_dados: d });
  assert.deepEqual(local, salvo.cartao);
  assert.equal(salvo.pessoa.sobre, minha.pessoa.sobre, '"sobre" não está no desenho e volta como estava');
  assert.deepEqual(salvo.pessoa.experiencias, minha.pessoa.experiencias, 'experiências gravadas voltam iguais (datas exatas)');
  const texto = JSON.stringify(local);
  for (const proibido of [minha.pessoa.nome, minha.pessoa.whatsapp, minha.pessoa.email, 'foto', 'fotoUrl', 'temFoto']) assert.ok(!texto.includes(proibido), 'cartão cego sem ' + proibido);
});

test('conta nova: preenche os 5 passos, salva no banco (completo) e o cartão local bate com o do banco, sem nome nem contato', async () => {
  const b = novo();
  const { cidades, cidade, zonasDe } = await cidadeAtiva(b);
  await contaNova(b, 'nova.pessoa@exemplo.com');
  assert.equal((await rpc(b, 'vagas_pessoa_minha')).completo, false);
  const eu = await rpc(b, 'vagas_eu');
  const cv = L.cvVazio({ cidade: cidade.slug, nome: eu.conta.nome });
  assert.equal(cv.nome, 'Pessoa Nova', 'o nome do cadastro já vem no passo 4');
  Object.assign(cv, { zona: cidade.zonas[0].slug, areas: ['atendimento', 'caixa'], escolaridade: 'medio', cursos: ['Atendimento ao cliente'], cnh: 'B',
    turnos: ['tarde', 'manha'], modalidades: ['diaria', 'clt'], pretensao: '1600', nome: 'Nova Pessoa Teste', whatsapp: '(62) 99123-4567', banco: false });
  cv.experiencias = [{ cargo: 'Atendente', onde: 'Loja do Centro', tempo: '1a3', inicio: L.inicioDoTempo('1a3', AGORA), fim: '', atual: false, carteira: 'sim', datas: false },
    { cargo: 'Repositor', onde: '', tempo: '', inicio: '2021-03', fim: '2022-01', atual: false, carteira: 'nd', datas: true }];
  const op = { zonasDe, agora: AGORA };
  assert.equal(L.primeiroPassoIncompleto(cv, op), 5);
  const local = L.cartaoLocal(cv, { cidades, cartao: null, agora: AGORA });
  const salvo = await rpc(b, 'vagas_pessoa_salvar', { p_dados: L.pessoaDoCv(cv, op) });
  assert.equal(salvo.completo, true);
  assert.deepEqual(local, salvo.cartao);
  assert.deepEqual(salvo.cartao.turnos, ['manha', 'tarde'], 'ordem da lista fechada, como no banco');
  assert.deepEqual(salvo.cartao.cargos, ['Atendimento e recepção', 'Caixa e operação de loja']);
  assert.equal(salvo.cartao.experiencias[0].meses, 25);
  // "Prefiro não dizer": com a migração 0005 o banco devolve null (reabre marcado); antes dela, false (reabre como "Sim").
  const nd = salvo.pessoa.experiencias.find((x) => x.funcao === 'Repositor');
  assert.ok(nd.informal === null || nd.informal === false, 'informal de "Prefiro não dizer": ' + nd.informal);
  assert.equal(L.cvDaPessoa(salvo.pessoa, AGORA).experiencias.find((x) => x.cargo === 'Repositor').carteira, nd.informal === null ? 'nd' : 'sim');
  assert.equal(L.cvDaPessoa(salvo.pessoa, AGORA).experiencias.find((x) => x.cargo === 'Atendente').carteira, 'sim', '"Sim" volta marcado');
  assert.equal(salvo.cartao.experiencias.find((x) => x.funcao === 'Repositor').informal, false, 'no cartão, só "Não" vira "sem carteira"');
  assert.ok(!JSON.stringify(salvo.cartao).includes('Nova Pessoa Teste'));
  assert.ok(!JSON.stringify(salvo.cartao).includes('99123'));
  assert.equal(salvo.pessoa.whatsapp, '5562991234567');
});

test('candidaturas da semente: andando/fechadas, rótulos sem frase negativa, convites a responder e empresa confidencial escondida até o convite', async () => {
  const b = novo();
  await entrar(b, 'pessoa@previa.com');
  const lista = (await rpc(b, 'vagas_minhas_candidaturas')).candidaturas;
  const g = L.separar(lista);
  assert.ok(g.andando.length >= 3);
  assert.equal(L.convitesPendentes(lista), 1);
  const conv = lista.find((k) => k.status === 'conversar');
  assert.equal(L.empresaDe(conv), 'Empresa confidencial');
  assert.equal(L.confidencialDe(conv), true);
  assert.match(L.subtitulo(conv), /^Empresa confidencial · chamou você para conversar/);
  const comb = lista.find((k) => k.status === 'combinou');
  assert.equal(L.empresaDe(comb), comb.combinou.empresa.nome);
  assert.match(L.subtitulo(comb, { dataCurta: () => '12/10' }), / · contato liberado em 12\/10( · \d+ mensage(m nova|ns novas))?$/);
  const fmt = { relativa: () => 'há 2 dias', dataCurta: () => '10/10' };
  const base = { id: 'x', anuncio: { titulo: 'Caixa', empresa: { nome: 'Loja Exemplo' } }, criadoEm: '', atualizadoEm: '', conversa: null, combinou: null };
  const sub = (status, extra) => L.subtitulo(Object.assign({}, base, { status }, extra || {}), fmt);
  assert.equal(sub('enviada'), 'Loja Exemplo · enviada há 2 dias');
  assert.equal(sub('agora_nao'), 'Loja Exemplo · candidatura encerrada');
  assert.equal(sub('retirada'), 'Loja Exemplo · você retirou em 10/10');
  assert.equal(sub('recusada'), 'Loja Exemplo · você recusou o convite');
  assert.equal(sub('enviada', { conversa: { naoLidas: 2 } }), 'Loja Exemplo · enviada há 2 dias · 2 mensagens novas');
  for (const s of ['agora_nao', 'retirada', 'recusada', 'contratada']) assert.equal(L.grupo({ status: s }), 'fechada', s);
  assert.equal(L.grupo({ status: 'combinou', contatoCortadoEm: '2026-10-10T10:00:00Z' }), 'fechada');
  assert.equal(L.grupo({ status: 'combinou', contatoCortadoEm: '' }), 'andando');
  for (const s of R.STATUS_CANDIDATURA.map((x) => x.id)) assert.ok(!/disse não|rejeit|reprov/i.test(sub(s)), s);
  assert.equal(R.rotulo(R.STATUS_CANDIDATURA, 'agora_nao'), 'Encerrada');
  assert.equal(L.abreConversa({ status: 'conversar' }), true);
  assert.equal(L.abreConversa({ status: 'enviada' }), false);
});

test('quem viu: acessos + Combinou que ainda não abriu; cortar e voltar a compartilhar só quando dá', async () => {
  const b = novo();
  await entrar(b, 'pessoa@previa.com');
  const acessos = (await rpc(b, 'vagas_quem_viu_meu_contato')).acessos;
  const lista = (await rpc(b, 'vagas_minhas_candidaturas')).candidaturas;
  const itens = L.quemViu(acessos, lista);
  assert.equal(itens.length, 1);
  assert.equal(itens[0].podeCortar, true);
  assert.ok(itens[0].abriuEm);
  const comb = lista.find((k) => k.status === 'combinou');
  await rpc(b, 'vagas_cortar_acesso', { p_candidatura: comb.id });
  const depois = L.quemViu((await rpc(b, 'vagas_quem_viu_meu_contato')).acessos, (await rpc(b, 'vagas_minhas_candidaturas')).candidaturas);
  assert.equal(depois[0].podeCortar, false);
  assert.equal(depois[0].podeVoltar, true);
  assert.ok(depois[0].cortadoEm);
  const semAcesso = L.quemViu([], [{ id: 'k1', status: 'combinou', contatoCortadoEm: '', anuncio: { titulo: 'Caixa', empresa: { nome: 'Loja' } }, combinou: { em: '2026-10-13T10:00:00Z', empresa: { nome: 'Loja Real' } } },
    { id: 'k2', status: 'enviada', anuncio: { titulo: 'X' } }]);
  assert.deepEqual(semAcesso.map((x) => [x.empresa, x.abriuEm, x.podeCortar]), [['Loja Real', '', true]]);
});

test('referências: rótulos Visível/Oculta/Pendente, link completo a partir da página (raiz e /vagas/), mensagem pronta do WhatsApp', () => {
  assert.deepEqual(L.statusReferencia({ status: 'aceita', visivel: true }), { texto: 'Visível', classe: 'combinou' });
  assert.deepEqual(L.statusReferencia({ status: 'ocultada' }), { texto: 'Oculta', classe: 'encerrada' });
  assert.deepEqual(L.statusReferencia({ status: 'pendente' }), { texto: 'Pendente', classe: 'conversar' });
  const t = 'a'.repeat(64);
  assert.equal(L.linkCompleto('/referencia.html?t=' + t, 'http://localhost:4311/vagas/eu.html#referencias'), 'http://localhost:4311/vagas/referencia.html?t=' + t);
  assert.equal(L.linkCompleto('/referencia.html?t=' + t, 'https://vagas.exemplo/eu.html#referencia/pedir'), 'https://vagas.exemplo/referencia.html?t=' + t);
  for (const ruim of ['https://golpe.exemplo/referencia.html', '//golpe.exemplo/x.html', 'javascript:alert(1)', '/pasta/x.html', '']) assert.equal(L.linkCompleto(ruim, 'https://vagas.exemplo/eu.html'), '', ruim);
  const m = L.mensagemPedido('Padaria Modelo', 'https://vagas.exemplo/referencia.html?t=' + t);
  assert.match(m, /Padaria Modelo/);
  assert.ok(m.endsWith('https://vagas.exemplo/referencia.html?t=' + t));
  assert.deepEqual(TELA.conferirTexto(m, 'mensagem'), []);
  assert.deepEqual(TELA.conferirTexto(L.mensagemWhatsappEmpresa('Caixa'), 'whatsapp'), []);
});

test('excluir só com EXCLUIR; rascunho do aparelho só vale para a mesma conta; marcadores de revisão saem do texto', () => {
  assert.equal(L.confirmaExcluir('EXCLUIR'), true);
  assert.equal(L.confirmaExcluir(' excluir '), true);
  assert.equal(L.confirmaExcluir('EXCLUI'), false);
  assert.equal(L.confirmaExcluir(''), false);
  const r = { dados: { conta: 'ana@exemplo.com', cv: L.cvVazio() }, em: AGORA };
  assert.equal(L.rascunhoDaConta(r, 'Ana@Exemplo.com'), r);
  assert.equal(L.rascunhoDaConta(r, 'outra@exemplo.com'), null, 'celular dividido: o rascunho de outra pessoa não aparece');
  assert.equal(L.rascunhoDaConta(null, 'ana@exemplo.com'), null);
  assert.equal(L.semMarcador('Texto final. [REVISÃO JURÍDICA]'), 'Texto final.');
  assert.equal(L.semMarcador('Selo [REVISÃO PSICOLOGIA] ok'), 'Selo ok');
});

// ---------------------------------------------------------------------------------------------------------------- sair do aparelho
// P1 da revisão C: ao sair por QUALQUER caminho, o que a conta deixou no aparelho (chaves 'vg.*') sai, num lugar só (VAGAS_API).
// Fica a cidade lembrada e o que só serve para a próxima conta continuar um link (volta e tokens de convite/referência).
const API = require('../vagas/js/api.js');
function aparelho() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => (Object.keys(m)[i] === undefined ? null : Object.keys(m)[i]), get length() { return Object.keys(m).length; }, _m: m };
}
const DA_CONTA = ['vg.rascunho.curriculo', 'vg.cache.candidaturas', 'vg.aceite.candidatura', 'vg.quero', 'vg.rascunho.conversa.k1', 'vg.prova.atual',
  'vg.empresa.atual', 'vg.op.cidade', 'vg.filtros.x', 'vg.entrar.senha'];
const FICA = ['vg.cidade', 'vg.entrar.voltar', 'vg.entrar.convite', 'vg.empresa.convite', 'vg.referencia.t'];
function encher(arm) { DA_CONTA.concat(FICA).forEach((k) => arm.setItem(k, '{"dados":1}')); arm.setItem('vagas_previa_v3', '{}'); }
function sobrou(arm) { return Object.keys(arm._m).filter((k) => k !== 'vagas_sessao').sort(); }
const SO_O_QUE_FICA = FICA.concat(['vagas_previa_v3']).sort();

test('sair do aparelho: limparAparelho tira as chaves vg.* da conta e deixa a cidade, os tokens de link e o que não é vg.*', () => {
  const arm = aparelho();
  encher(arm);
  assert.equal(API.limparAparelho(arm), DA_CONTA.length);
  assert.deepEqual(sobrou(arm), SO_O_QUE_FICA);
  assert.deepEqual(API.FICA_NO_APARELHO.slice().sort(), FICA.slice().sort());
  assert.equal(API.limparAparelho(null), 0, 'sem armazenamento: não quebra');
});

test('sair do aparelho (Supabase): sair, sessão recusada, sessão vencida e entrar com OUTRA conta limpam; renovar a mesma conta não', async () => {
  const URL_SB = 'https://exemplo.supabase.co';
  const resp = (status, corpo) => ({ status, text: () => Promise.resolve(JSON.stringify(corpo)) });
  const sessao = (id, tok) => ({ access_token: tok || 'tok-' + id, refresh_token: 'ref-' + id, expires_in: 3600, user: { id, email: id + '@exemplo.com' } });
  let relogio = AGORA;
  function cliente(rotas, arm) {
    const fetch = (url) => {
      const c = url.replace(URL_SB, '');
      for (const [p, fn] of rotas) if (c.startsWith(p)) return Promise.resolve(fn());
      return Promise.resolve(resp(404, { code: 'PGRST202' }));
    };
    return API.criar({ modo: 'supabase', url: URL_SB, chave: 'sb_publishable_x', fetch, armazenamento: arm, agora: () => relogio });
  }
  let quem = 'u1';
  const rotas = [['/auth/v1/token?grant_type=password', () => resp(200, sessao(quem))], ['/auth/v1/logout', () => resp(204, {})],
    ['/rest/v1/rpc/vagas_eu', () => resp(200, { ok: true, conta: { tipo: 'pessoa' } })]];
  // 1) "Sair da conta" (e "Sair e entrar com outra conta", que chama o mesmo sair()).
  let arm = aparelho();
  let api = cliente(rotas, arm);
  await api.entrar('u1@exemplo.com', 'senha-boa-1');
  encher(arm);
  await api.sair();
  assert.deepEqual(sobrou(arm), SO_O_QUE_FICA, 'sair');
  assert.equal(arm.getItem('vagas_sessao'), null);
  // 2) Entrar sem sessão anterior não apaga a intenção de "Quero" guardada antes de entrar.
  arm.setItem('vg.quero', '{"codigo":"ABC123"}');
  await api.entrar('u1@exemplo.com', 'senha-boa-1');
  assert.ok(arm.getItem('vg.quero'), 'sem sessão antes: nada a limpar');
  // 3) Entrar com OUTRA conta sem passar pelo "Sair": limpa o que a anterior deixou.
  encher(arm);
  quem = 'u2';
  await api.entrar('u2@exemplo.com', 'senha-boa-1');
  assert.deepEqual(sobrou(arm), SO_O_QUE_FICA, 'troca de conta');
  // 4) Sessão recusada pelo servidor (401 sem renovação possível): limpa.
  encher(arm);
  api = cliente([['/rest/v1/rpc/vagas_minhas_candidaturas', () => resp(401, {})], ['/auth/v1/token?grant_type=refresh_token', () => resp(400, { error: 'invalid_grant' })]], arm);
  await assert.rejects(api.minhasCandidaturas(), (e) => e.sessaoExpirada === true);
  assert.deepEqual(sobrou(arm), SO_O_QUE_FICA, 'sessão recusada');
  // 5) Renovar a MESMA conta não limpa. 6) Sessão vencida (renovação recusada): limpa.
  arm = aparelho();
  api = cliente([['/auth/v1/token?grant_type=password', () => resp(200, sessao('u3'))], ['/rest/v1/rpc/vagas_eu', () => resp(200, { ok: true, conta: {} })],
    ['/auth/v1/token?grant_type=refresh_token', () => resp(200, sessao('u3', 'tok-novo'))], ['/rest/v1/rpc/vagas_minhas_candidaturas', () => resp(200, { ok: true, candidaturas: [] })]], arm);
  await api.entrar('u3@exemplo.com', 'senha-boa-1');
  encher(arm);
  relogio += 2 * 3600 * 1000;
  await api.minhasCandidaturas();
  assert.equal(JSON.parse(arm.getItem('vagas_sessao')).access_token, 'tok-novo');
  assert.equal(sobrou(arm).length, DA_CONTA.length + SO_O_QUE_FICA.length, 'renovar a mesma conta não apaga nada');
  api = cliente([['/auth/v1/token?grant_type=refresh_token', () => resp(400, { error: 'invalid_grant' })]], arm);
  relogio += 2 * 3600 * 1000;
  await assert.rejects(api.minhasCandidaturas(), (e) => e.sessaoExpirada === true);
  assert.deepEqual(sobrou(arm), SO_O_QUE_FICA, 'sessão vencida');
});

test('sair do aparelho (prévia): sair, excluir e entrar com outra conta limpam; entrar sem sessão antes guarda a intenção de "Quero"', async () => {
  const b = novo();
  const arm = aparelho();
  const api = API.criar({ modo: 'previa', backend: b, armazenamento: arm });
  arm.setItem('vg.quero', '{"codigo":"ABC123"}');
  await api.entrar('pessoa@previa.com', PREVIA.SENHA_PREVIA);
  assert.ok(arm.getItem('vg.quero'), 'a intenção de quem ainda não tinha entrado continua');
  encher(arm);
  await api.entrar('pessoa2@previa.com', PREVIA.SENHA_PREVIA);
  assert.deepEqual(sobrou(arm), SO_O_QUE_FICA, 'troca de conta');
  encher(arm);
  await api.sair();
  assert.deepEqual(sobrou(arm), SO_O_QUE_FICA, 'sair');
  encher(arm);
  await api.sair();
  assert.deepEqual(sobrou(arm), SO_O_QUE_FICA, 'sair sem sessão também limpa');
  await api.entrar('pessoa3@previa.com', PREVIA.SENHA_PREVIA);
  encher(arm);
  await api.excluirConta();
  assert.deepEqual(sobrou(arm), SO_O_QUE_FICA, 'excluir');
});

test('rascunho do aparelho vale 7 dias: mais velho, ler() apaga e devolve nada', () => {
  const U = require('../vagas/js/ui-area.js');
  const janela = { localStorage: aparelho() };
  const arm = U.criarArmazenamento(janela);
  let agora = AGORA;
  const r = U.rascunho('curriculo', { armazenamento: arm, agora: () => agora });
  r.gravar({ conta: 'ana@exemplo.com' });
  agora += 6 * 86400000;
  assert.deepEqual(r.ler().dados, { conta: 'ana@exemplo.com' }, '6 dias: vale');
  agora += 2 * 86400000;
  assert.equal(r.ler(), null, '8 dias: venceu');
  assert.equal(janela.localStorage.getItem('vg.rascunho.curriculo'), null, 'e sai do aparelho');
});

test('aviso de candidatura (vaga.js) vale por conta e por versão do texto; "Voltar a compartilhar" pede o aceite do Combinou', () => {
  const vaga = fs.readFileSync(path.join(RAIZ, 'vagas', 'js', 'vaga.js'), 'utf8');
  assert.match(vaga, /gravar\(CHAVE_ACEITE, \{ conta: contaAtual\(\), versao: versaoAceite\(\), em: Date\.now\(\) \}\)/);
  assert.match(vaga, /g\.conta === contaAtual\(\) && g\.versao === versaoAceite\(\)/);
  assert.ok(!/armazenamento\.ler\(CHAVE_ACEITE\)\)/.test(vaga), 'nada de "existe a chave = já aceitou"');
  const cand = fs.readFileSync(path.join(RAIZ, 'vagas', 'js', 'eu-candidaturas.js'), 'utf8');
  assert.match(cand, /function voltar\(x\) \{\s*confirmarContato\(x\.empresa/);
});
