'use strict';
// Adaptador da v2 (vagas/js/v2/api-v2.js) com fetch FALSO: nada sai da máquina. Confere, para TODOS os métodos do contrato, a URL e o
// corpo no modo supabase, o token da sessão, os erros em português, o envio de arquivos e o modo prévia (sem carregar nada de
// previa/ no modo supabase).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CONTRATO = require('../vagas/js/v2/contrato.js');
const V2 = require('../vagas/js/v2/api-v2.js');

const URL_SB = 'https://exemplo.supabase.co';
const CHAVE = 'sb_publishable_chave_publica_de_teste';
const UID = '11111111-1111-4111-8111-111111111111';
const EMPRESA = '22222222-2222-4222-8222-222222222222';
const AGORA = 1900000000000;
const CONFIG = { SUPABASE_URL: URL_SB, SUPABASE_ANON_KEY: CHAVE, VERSAO_TERMOS: '2026-11-24', PREVIA_LATENCIA: 0, PREVIA_VALIDAR: true };

function memoria() {
  const m = {};
  return { getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; }, _m: m };
}
function sessaoValida(extra) {
  return Object.assign({ access_token: 'token-da-pessoa', refresh_token: 'renova-1', expires_at: Math.floor(AGORA / 1000) + 3600, user: { id: UID, email: 'ana@exemplo.com' } }, extra || {});
}

// fetch falso: guarda as chamadas e responde pelo que o teste mandar (função, objeto ou lista).
function criarMundo(op) {
  op = op || {};
  const chamadas = [];
  const arm = memoria();
  if (op.sessao) arm.setItem('vagas_sessao', JSON.stringify(op.sessao));
  async function fetchFalso(url, o) {
    const u = String(url).replace(URL_SB, '');
    chamadas.push({ url: u, metodo: (o && o.method) || 'GET', headers: (o && o.headers) || {}, corpo: o && typeof o.body === 'string' ? JSON.parse(o.body) : (o ? o.body : undefined) });
    const r = op.responder ? op.responder(u, o, chamadas) : null;
    const resp = r || { status: 200, json: { ok: true } };
    return new Response(resp.texto !== undefined ? resp.texto : JSON.stringify(resp.json), { status: resp.status || 200 });
  }
  const api = V2.criar({ modo: op.modo || 'supabase', config: Object.assign({}, CONFIG, op.config), url: URL_SB, chave: CHAVE, fetch: fetchFalso, armazenamento: arm,
    agora: () => AGORA, previaMetodos: op.previa, documento: op.documento, contrato: CONTRATO });
  return { api, chamadas, arm };
}

// Dados mínimos por método (só para ver o corpo chegar inteiro).
const DADOS = { id: UID, empresaId: EMPRESA, vagaId: UID, texto: 'Olá', cnpj: '11222333000181', destino: 'ana@exemplo.com', codigo: '123456', cidade: 'uruacu-go', acao: 'pausar' };

test('modo supabase: TODOS os métodos do contrato montam a URL e o corpo certos (rpc com p_dados; edge com acao)', async () => {
  const nomes = Object.keys(CONTRATO.METODOS);
  assert.ok(nomes.length >= 45);
  for (const nome of nomes) {
    const def = CONTRATO.METODOS[nome];
    const w = criarMundo({ sessao: sessaoValida(), responder: () => ({ json: { ok: true, sessao: sessaoValida(), novaConta: false } }) });
    assert.equal(typeof w.api[nome], 'function', nome);
    const dados = Object.assign({}, DADOS, { extra: nome });
    await w.api[nome](dados);
    assert.equal(w.chamadas.length, 1, nome);
    const c = w.chamadas[0];
    assert.equal(c.metodo, 'POST', nome);
    assert.equal(c.headers.apikey, CHAVE, nome);
    if (def.rpc || def.login) assert.equal(c.headers.Authorization, 'Bearer token-da-pessoa', nome + ': a sessão vai junto');
    else assert.equal(c.headers.Authorization, undefined, nome + ': função pública não leva o token');
    if (def.rpc) {
      assert.equal(c.url, '/rest/v1/rpc/' + def.rpc, nome);
      assert.deepEqual(c.corpo, { p_dados: dados }, nome);
    } else {
      assert.equal(c.url, '/functions/v1/vagas-conta', nome);
      const esperado = Object.assign({}, dados, { acao: def.edge });
      if (nome === 'codigoConfirmar') esperado.termosVersao = '2026-11-24';
      assert.deepEqual(c.corpo, esperado, nome);
    }
  }
});

test('modo supabase: método sem dados manda {p_dados: {}}; método público sem sessão não manda token; login:true sem sessão rejeita sem chamar a rede', async () => {
  const w = criarMundo();
  await w.api.base();
  assert.deepEqual(w.chamadas[0].corpo, { p_dados: {} });
  assert.equal(w.chamadas[0].headers.Authorization, undefined);
  assert.equal(w.chamadas[0].url, '/rest/v1/rpc/vagas_v2_base');
  await w.api.cnpjConsultar({ cnpj: '11222333000181' });
  assert.equal(w.chamadas[1].url, '/functions/v1/vagas-conta');
  assert.equal(w.chamadas[1].headers.Authorization, undefined);
  const antes = w.chamadas.length;
  for (const nome of Object.keys(CONTRATO.METODOS).filter((n) => CONTRATO.METODOS[n].login)) {
    await assert.rejects(() => w.api[nome]({}), (e) => { assert.equal(e.sessaoExpirada, true, nome); assert.equal(e.message, 'Sessão expirada. Entre de novo.'); return true; });
  }
  assert.equal(w.chamadas.length, antes, 'nada foi para a rede');
});

test('modo supabase: o token vencido é renovado pelo refresh_token (como o api.js) e a chamada segue', async () => {
  const w = criarMundo({ sessao: sessaoValida({ expires_at: Math.floor(AGORA / 1000) - 10 }),
    responder: (u) => (u.startsWith('/auth/v1/token') ? { json: { access_token: 'token-novo', refresh_token: 'renova-2', expires_in: 3600, user: { id: UID, email: 'ana@exemplo.com' } } } : { json: { ok: true, lista: [] } }) });
  await w.api.candidaturas();
  assert.equal(w.chamadas[0].url, '/auth/v1/token?grant_type=refresh_token');
  assert.deepEqual(w.chamadas[0].corpo, { refresh_token: 'renova-1' });
  assert.equal(w.chamadas[1].headers.Authorization, 'Bearer token-novo');
  assert.equal(JSON.parse(w.arm.getItem('vagas_sessao')).refresh_token, 'renova-2');
});

test('erros: {ok:false} vira Error em português com .resposta, .codigo e as marcas; banco/rede também', async () => {
  const w = criarMundo({ responder: (u) => {
    if (u.includes('vagas_v2_texto_checar')) return { json: { ok: false, erro: 'Muitas tentativas. Tente de novo mais tarde.', bloqueado: true } };
    if (u.includes('vagas_conta') || u.includes('vagas-conta')) return { json: { ok: false, erro: 'Isto parece um CPF. O MEI tem CNPJ próprio: ele está no Certificado do MEI (CCMEI).', codigo: 'cpf' } };
    if (u.includes('vagas_v2_vaga')) return { status: 404, json: { code: 'PGRST202' } };
    return null;
  } });
  await assert.rejects(() => w.api.textoChecar({ texto: 'x' }), (e) => {
    assert.equal(e.message, 'Muitas tentativas. Tente de novo mais tarde.');
    assert.equal(e.bloqueado, true);
    assert.deepEqual(e.resposta, { ok: false, erro: 'Muitas tentativas. Tente de novo mais tarde.', bloqueado: true });
    return true;
  });
  await assert.rejects(() => w.api.cnpjConsultar({ cnpj: '52998224725' }), (e) => { assert.equal(e.codigo, 'cpf'); assert.match(e.message, /CCMEI/); return true; });
  const errSilencioso = console.warn;
  console.warn = () => {};
  try {
    await assert.rejects(() => w.api.vaga({ id: UID }), (e) => { assert.equal(e.bancoDesatualizado, true); assert.match(e.message, /manutenção/); return true; });
  } finally { console.warn = errSilencioso; }
  const rede = V2.criar({ modo: 'supabase', config: CONFIG, url: URL_SB, chave: CHAVE, fetch: async () => { throw new Error('rede caiu'); }, armazenamento: memoria(), contrato: CONTRATO });
  await assert.rejects(() => rede.base(), (e) => { assert.equal(e.conexao, true); assert.match(e.message, /Não foi possível conectar/); return true; });
  // texto barrado: o detalhe chega em e.resposta.barra
  const barrada = criarMundo({ sessao: sessaoValida(), responder: () => ({ json: { ok: false, codigo: 'texto_barrado', erro: 'Este texto não pode ser publicado.', barra: [{ trecho: 'x', motivo: 'm', mensagem: 'msg' }] } }) });
  await assert.rejects(() => barrada.api.vagaPublicar({ empresaId: EMPRESA, vaga: {} }), (e) => { assert.equal(e.codigo, 'texto_barrado'); assert.equal(e.resposta.barra.length, 1); return true; });
});

test('entrar por código: pedir não guarda nada; confirmar guarda a sessão (vagas_sessao), manda a versão dos termos e não devolve os tokens', async () => {
  const w = criarMundo({ responder: (u, o) => {
    if (JSON.parse(o.body).acao === 'codigo_confirmar') return { json: { ok: true, novaConta: true, tipo: 'pessoa', sessao: sessaoValida() } };
    return { json: { ok: true, canal: 'email', destinoMascarado: 'a***@e***.com', reenviarEmSeg: 30, expiraEmSeg: 600 } };
  } });
  assert.equal(w.api.sessao(), null);
  const p = await w.api.codigoPedir({ destino: 'ana@exemplo.com', canal: 'email', captcha: 'tk' });
  assert.equal(p.canal, 'email');
  assert.deepEqual(w.chamadas[0].corpo, { destino: 'ana@exemplo.com', canal: 'email', captcha: 'tk', acao: 'codigo_pedir' });
  assert.equal(w.arm.getItem('vagas_sessao'), null);
  const r = await w.api.codigoConfirmar({ destino: 'ana@exemplo.com', codigo: '123456', nome: 'Ana', tipo: 'pessoa' });
  assert.deepEqual(r, { ok: true, novaConta: true, tipo: 'pessoa', sessao: { user: { id: UID, email: 'ana@exemplo.com' } } });
  assert.deepEqual(CONTRATO.validar('codigoConfirmar', r), []);
  assert.equal(w.chamadas[1].corpo.termosVersao, '2026-11-24');
  assert.ok(!JSON.stringify(r).includes('token-da-pessoa'));
  const guardada = JSON.parse(w.arm.getItem('vagas_sessao'));
  assert.equal(guardada.access_token, 'token-da-pessoa');
  assert.equal(guardada.refresh_token, 'renova-1');
  assert.deepEqual(w.api.sessao(), { user: { id: UID, email: 'ana@exemplo.com' } });
  // a chamada seguinte já leva o token
  await w.api.eu();
  assert.equal(w.chamadas[2].headers.Authorization, 'Bearer token-da-pessoa');
});

test('sair: limpa a sessão e os dados pessoais das telas (vsc.eu.* e vsc.emp.*), avisa o servidor e deixa o resto', async () => {
  const w = criarMundo({ sessao: sessaoValida() });
  w.arm.setItem('vsc.eu.rascunho', 'dados');
  w.arm.setItem('vsc.emp.rascunho', 'dados');
  w.arm.setItem('vsc.tema', 'escuro');
  const r = await w.api.sair();
  assert.deepEqual(r, { ok: true });
  assert.equal(w.arm.getItem('vagas_sessao'), null);
  assert.equal(w.arm.getItem('vsc.eu.rascunho'), null);
  assert.equal(w.arm.getItem('vsc.emp.rascunho'), null);
  assert.equal(w.arm.getItem('vsc.tema'), 'escuro', 'preferência não é dado pessoal');
  assert.equal(w.api.sessao(), null);
  assert.equal(w.chamadas[0].url, '/auth/v1/logout');
  assert.equal(w.chamadas[0].headers.Authorization, 'Bearer token-da-pessoa');
  await w.api.sair();   // sem sessão: não chama a rede de novo
  assert.equal(w.chamadas.length, 1);
});

test('entrar com OUTRA conta limpa os dados pessoais da anterior', async () => {
  const w = criarMundo({ sessao: sessaoValida(), responder: () => ({ json: { ok: true, novaConta: false, tipo: 'empresa', sessao: sessaoValida({ user: { id: EMPRESA, email: 'dono@loja.com' } }) } }) });
  w.arm.setItem('vsc.eu.rascunho', 'dados da Ana');
  await w.api.codigoConfirmar({ destino: 'dono@loja.com', codigo: '123456' });
  assert.equal(w.arm.getItem('vsc.eu.rascunho'), null);
  assert.equal(w.api.sessao().user.id, EMPRESA);
});

// ---------------------------------------------------------------------------------------------------------------------
// Envio de arquivos
// ---------------------------------------------------------------------------------------------------------------------

function arquivo(nome, tipo, tamanho) { return { name: nome, type: tipo, size: tamanho, _arquivo: true }; }

test('curriculoEnviar: sobe ao bucket privado com o token e x-upsert false, depois registra com curriculoGuardar', async () => {
  const w = criarMundo({ sessao: sessaoValida(), responder: (u) => (u.startsWith('/storage/') ? { json: { Key: 'x' } } : { json: { ok: true, arquivo: { nome: 'Meu CV.pdf', tamanhoKb: 3, tipo: 'application/pdf', enviadoEm: '2026-11-24T12:00:00Z' } } }) });
  const cv = arquivo('C:\\fakepath\\Meu CV.pdf', 'application/pdf', 2500);
  const r = await w.api.curriculoEnviar({ arquivo: cv });
  assert.equal(r.ok, true);
  assert.equal(r.arquivo.nome, 'Meu CV.pdf');
  const up = w.chamadas[0];
  assert.match(up.url, new RegExp('^/storage/v1/object/vagas-curriculos/' + UID + '/[0-9a-f-]{36}\\.pdf$'));
  assert.equal(up.metodo, 'POST');
  assert.equal(up.headers.Authorization, 'Bearer token-da-pessoa');
  assert.equal(up.headers.apikey, CHAVE);
  assert.equal(up.headers['x-upsert'], 'false');
  assert.equal(up.headers['Content-Type'], 'application/pdf');
  assert.equal(up.corpo, cv, 'o arquivo vai como corpo');
  const reg = w.chamadas[1];
  assert.equal(reg.url, '/rest/v1/rpc/vagas_v2_curriculo_guardar');
  assert.equal(reg.corpo.p_dados.caminho, up.url.replace('/storage/v1/object/vagas-curriculos/', ''));
  assert.deepEqual({ nome: reg.corpo.p_dados.nome, tamanhoKb: reg.corpo.p_dados.tamanhoKb, tipo: reg.corpo.p_dados.tipo }, { nome: 'Meu CV.pdf', tamanhoKb: 3, tipo: 'application/pdf' });
  assert.equal(w.api.uploads.curriculoEnviar, w.api.curriculoEnviar);
});

test('curriculoEnviar: valida tipo e 10 MB no navegador, em português, sem chamar a rede', async () => {
  const w = criarMundo({ sessao: sessaoValida() });
  const casos = [
    [arquivo('a.txt', 'text/plain', 100), 'O currículo precisa ser PDF, Word, JPG, PNG ou HEIC.'],
    [arquivo('a.exe', 'application/x-msdownload', 100), 'O currículo precisa ser PDF, Word, JPG, PNG ou HEIC.'],
    [arquivo('grande.pdf', 'application/pdf', 10485761), 'O arquivo passa de 10 MB. Escolha um arquivo menor.'],
    [arquivo('vazio.pdf', 'application/pdf', 0), 'Escolha um arquivo.'],
    [null, 'Escolha um arquivo.']
  ];
  for (const [a, msg] of casos) await assert.rejects(() => w.api.curriculoEnviar({ arquivo: a }), (e) => { assert.equal(e.message, msg); return true; });
  assert.equal(w.chamadas.length, 0);
});

test('curriculoEnviar: celular manda HEIC sem tipo (infere pela extensão); 10 MB exatos passam; Word e imagens passam', async () => {
  for (const [nome, tipo, ext, mime] of [['foto.HEIC', '', 'heic', 'image/heic'], ['cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', null],
    ['cv.doc', 'application/msword', 'doc', null], ['scan.jpg', 'image/jpg', 'jpg', 'image/jpeg'], ['scan.png', 'image/png', 'png', null], ['cv.pdf', 'application/pdf', 'pdf', null]]) {
    const w = criarMundo({ sessao: sessaoValida(), responder: (u) => (u.startsWith('/storage/') ? { json: {} } : { json: { ok: true, arquivo: {} } }) });
    await w.api.curriculoEnviar({ arquivo: arquivo(nome, tipo, 10485760) });
    assert.match(w.chamadas[0].url, new RegExp('\\.' + ext + '$'), nome);
    assert.equal(w.chamadas[0].headers['Content-Type'], mime || tipo, nome);
  }
});

test('curriculoEnviar: armazenamento recusa (413, 403) e registro que falha apagam o arquivo solto e dão erro em português', async () => {
  const grande = criarMundo({ sessao: sessaoValida(), responder: () => ({ status: 413, json: { error: 'Payload too large' } }) });
  await assert.rejects(() => grande.api.curriculoEnviar({ arquivo: arquivo('a.pdf', 'application/pdf', 1000) }), (e) => { assert.equal(e.message, 'O arquivo passa de 10 MB. Escolha um arquivo menor.'); return true; });
  const negado = criarMundo({ sessao: sessaoValida(), responder: () => ({ status: 403, json: { error: 'x' } }) });
  await assert.rejects(() => negado.api.curriculoEnviar({ arquivo: arquivo('a.pdf', 'application/pdf', 1000) }), (e) => { assert.equal(e.message, 'Não foi possível guardar o arquivo. Tente de novo.'); return true; });
  const expirada = criarMundo({ sessao: sessaoValida(), responder: () => ({ status: 401, json: {} }) });
  await assert.rejects(() => expirada.api.curriculoEnviar({ arquivo: arquivo('a.pdf', 'application/pdf', 1000) }), (e) => e.sessaoExpirada === true);
  const semRegistro = criarMundo({ sessao: sessaoValida(), responder: (u) => (u.startsWith('/storage/v1/object/vagas-curriculos') ? { json: {} } : { json: { ok: false, erro: 'Você já tem um currículo anexado.' } }) });
  await assert.rejects(() => semRegistro.api.curriculoEnviar({ arquivo: arquivo('a.pdf', 'application/pdf', 1000) }), (e) => { assert.equal(e.message, 'Você já tem um currículo anexado.'); return true; });
  const apagou = semRegistro.chamadas.find((c) => c.metodo === 'DELETE');
  assert.ok(apagou, 'tentou tirar o arquivo solto');
  assert.equal(apagou.url, '/storage/v1/object/vagas-curriculos');
  assert.equal(apagou.corpo.prefixes.length, 1);
  const semSessao = criarMundo();
  await assert.rejects(() => semSessao.api.curriculoEnviar({ arquivo: arquivo('a.pdf', 'application/pdf', 1000) }), (e) => e.sessaoExpirada === true);
  assert.equal(semSessao.chamadas.length, 0);
});

test('verificacaoDocumentoEnviar: bucket de verificação, pasta da empresa, só PDF/JPG/PNG, registra com verificacaoDocumento', async () => {
  const w = criarMundo({ sessao: sessaoValida(), responder: (u) => (u.startsWith('/storage/') ? { json: {} } : { json: { ok: true, documentos: [{ id: UID }] } }) });
  const r = await w.api.verificacaoDocumentoEnviar({ empresaId: EMPRESA, arquivo: arquivo('cartao-cnpj.pdf', 'application/pdf', 5000) });
  assert.equal(r.ok, true);
  assert.equal(r.documentos.length, 1);
  assert.match(w.chamadas[0].url, new RegExp('^/storage/v1/object/vagas-verificacao/' + EMPRESA + '/[0-9a-f-]{36}\\.pdf$'));
  assert.equal(w.chamadas[1].url, '/rest/v1/rpc/vagas_v2_verificacao_documento');
  assert.equal(w.chamadas[1].corpo.p_dados.empresaId, EMPRESA);
  assert.equal(w.chamadas[1].corpo.p_dados.caminho, w.chamadas[0].url.replace('/storage/v1/object/vagas-verificacao/', ''));
  assert.equal(w.chamadas[1].corpo.p_dados.tipo, 'application/pdf');
  const antes = w.chamadas.length;
  await assert.rejects(() => w.api.verificacaoDocumentoEnviar({ empresaId: EMPRESA, arquivo: arquivo('x.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100) }),
    (e) => { assert.equal(e.message, 'O documento precisa ser PDF, JPG ou PNG.'); return true; });
  await assert.rejects(() => w.api.verificacaoDocumentoEnviar({ empresaId: EMPRESA, arquivo: arquivo('x.heic', 'image/heic', 100) }), /PDF, JPG ou PNG/);
  await assert.rejects(() => w.api.verificacaoDocumentoEnviar({ empresaId: 'nao-e-uuid', arquivo: arquivo('x.pdf', 'application/pdf', 100) }), (e) => e.message === 'Empresa não encontrada.');
  await assert.rejects(() => w.api.verificacaoDocumentoEnviar({ empresaId: EMPRESA, arquivo: arquivo('g.pdf', 'application/pdf', 10485761) }), /10 MB/);
  assert.equal(w.chamadas.length, antes);
});

// ---------------------------------------------------------------------------------------------------------------------
// Modo prévia
// ---------------------------------------------------------------------------------------------------------------------

test('modo prévia: roteia para VSC_PREVIA_METODOS sem tocar a rede, devolve cópia e valida com o contrato', async () => {
  const base = { ok: true, praca: { cidade: 'uruacu-go' }, cidades: [], setores: [], vagas: [], empresas: [], geradoEm: '2026-11-24T10:00:00Z' };
  const w = criarMundo({ modo: 'previa', previa: { base: async (d) => Object.assign({ recebeu: d }, base) } });
  assert.equal(w.api.modo, 'previa');
  const r = await w.api.base({ cidade: 'uruacu-go' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.recebeu, { cidade: 'uruacu-go' });
  assert.equal(w.chamadas.length, 0);
  r.cidades.push('mexeu');
  assert.equal((await w.api.base()).cidades.length, 0, 'cada chamada recebe uma cópia');
});

test('modo prévia: método ausente, resposta fora do contrato e {ok:false} viram erros em português', async () => {
  const w = criarMundo({ modo: 'previa', previa: {
    base: () => ({ ok: true, vagas: 'não é lista' }),
    vaga: () => ({ ok: false, erro: 'Esta vaga não existe.', naoEncontrada: true, codigo: 'sem_vaga' }),
    eu: () => undefined
  } });
  await assert.rejects(() => w.api.candidaturas(), (e) => { assert.equal(e.message, 'Esta função não existe na demonstração.'); return true; });
  await assert.rejects(() => w.api.base(), (e) => { assert.match(e.message, /Demonstração fora do contrato em base/); return true; });
  await assert.rejects(() => w.api.vaga({ id: 'x' }), (e) => { assert.equal(e.message, 'Esta vaga não existe.'); assert.equal(e.naoEncontrada, true); assert.equal(e.codigo, 'sem_vaga'); return true; });
  await assert.rejects(() => w.api.eu(), /fora do contrato/);
  const solto = criarMundo({ modo: 'previa', config: { PREVIA_VALIDAR: false }, previa: { base: () => ({ ok: true, qualquer: 1 }) } });
  assert.equal((await solto.api.base()).qualquer, 1, 'sem PREVIA_VALIDAR a forma não é conferida');
});

test('modo prévia: latência simulada só quando PREVIA_LATENCIA é diferente de 0', async () => {
  const f = () => ({ ok: true, lista: [] });
  const lento = criarMundo({ modo: 'previa', config: { PREVIA_LATENCIA: 60, PREVIA_VALIDAR: false }, previa: { candidaturas: f } });
  let t = Date.now();
  await lento.api.candidaturas();
  assert.ok(Date.now() - t >= 50, 'esperou');
  const rapido = criarMundo({ modo: 'previa', config: { PREVIA_LATENCIA: 0, PREVIA_VALIDAR: false }, previa: { candidaturas: f } });
  t = Date.now();
  await rapido.api.candidaturas();
  assert.ok(Date.now() - t < 40, 'sem espera');
});

test('modo prévia: entrar por código guarda uma sessão de demonstração e sair a limpa', async () => {
  const w = criarMundo({ modo: 'previa', previa: {
    codigoPedir: () => ({ ok: true, canal: 'email', destinoMascarado: 'd***@e***.com', reenviarEmSeg: 30, expiraEmSeg: 600 }),
    codigoConfirmar: () => ({ ok: true, novaConta: true, tipo: 'pessoa', sessao: { access_token: 'demo', refresh_token: 'demo', expires_at: 1900003600, user: { id: 'demo-1', email: 'demo@exemplo.com' } } })
  } });
  assert.equal(w.api.sessao(), null);
  assert.equal((await w.api.codigoPedir({ destino: 'demo@exemplo.com' })).canal, 'email');
  const r = await w.api.codigoConfirmar({ destino: 'demo@exemplo.com', codigo: '123456' });
  assert.equal(r.sessao.access_token, undefined);
  assert.deepEqual(w.api.sessao(), { user: { id: 'demo-1', email: 'demo@exemplo.com' } });
  await w.api.sair();
  assert.equal(w.api.sessao(), null);
  assert.equal(w.chamadas.length, 0, 'a demonstração nunca usa a rede');
});

test('modo prévia: envio de arquivo valida igual ao real e cai em curriculoGuardar quando a prévia não tem curriculoEnviar', async () => {
  const guardados = [];
  const w = criarMundo({ modo: 'previa', previa: { curriculoGuardar: (d) => { guardados.push(d); return { ok: true, arquivo: { nome: d.nome, tamanhoKb: d.tamanhoKb, tipo: d.tipo, enviadoEm: '2026-11-24T12:00:00Z' } }; } } });
  await assert.rejects(() => w.api.curriculoEnviar({ arquivo: arquivo('a.txt', 'text/plain', 10) }), /PDF, Word, JPG, PNG ou HEIC/);
  const r = await w.api.curriculoEnviar({ arquivo: arquivo('cv.pdf', 'application/pdf', 2048) });
  assert.equal(r.arquivo.nome, 'cv.pdf');
  assert.match(guardados[0].caminho, /^previa\/[0-9a-f-]{36}\.pdf$/);
  assert.equal(guardados[0].tamanhoKb, 2);
  assert.equal(w.chamadas.length, 0);
  const direto = criarMundo({ modo: 'previa', previa: { verificacaoDocumentoEnviar: (d) => ({ ok: true, documentos: [{ nome: d.nome, empresaId: d.empresaId }] }) } });
  const v = await direto.api.verificacaoDocumentoEnviar({ empresaId: EMPRESA, arquivo: arquivo('doc.png', 'image/png', 1000) });
  assert.deepEqual(v.documentos, [{ nome: 'doc.png', empresaId: EMPRESA }]);
});

// ---------------------------------------------------------------------------------------------------------------------
// Carregamento sob demanda dos arquivos da prévia
// ---------------------------------------------------------------------------------------------------------------------

function documentoFalso(metaConteudo, jaTem) {
  const scripts = [];
  const doc = {
    readyState: 'complete', currentScript: null, scripts,
    head: { appendChild(s) { scripts.push(s.src); setTimeout(() => s.onload && s.onload(), 0); } },
    createElement: () => ({}),
    querySelector(sel) {
      if (sel === 'meta[name="vsc-previa"]') return metaConteudo === null ? null : { getAttribute: () => metaConteudo };
      const m = /script\[src\$="(.+)"\]/.exec(sel);
      return m && (jaTem || []).some((s) => s.endsWith(m[1])) ? {} : null;
    }
  };
  return doc;
}

test('pronto (prévia): injeta dados.js, dados-mais.js e só o arquivo da tela declarada no meta, em ordem', async () => {
  for (const [meta, esperado] of [['pessoa', ['dados.js', 'dados-mais.js', 'pessoa.js']], ['empresa', ['dados.js', 'dados-mais.js', 'empresa.js']],
    ['pessoa empresa', ['dados.js', 'dados-mais.js', 'pessoa.js', 'empresa.js']], [null, ['dados.js', 'dados-mais.js']]]) {
    const doc = documentoFalso(meta);
    const api = V2.criar({ modo: 'previa', config: CONFIG, documento: doc, baseUrlPrevia: 'https://x/js/v2/previa/', contrato: CONTRATO });
    await api.pronto;
    assert.deepEqual(doc.scripts, esperado.map((a) => 'https://x/js/v2/previa/' + a), String(meta));
  }
  const doc = documentoFalso('pessoa', ['/js/v2/previa/dados.js']);
  await V2.criar({ modo: 'previa', config: CONFIG, documento: doc, baseUrlPrevia: 'js/v2/previa/', contrato: CONTRATO }).pronto;
  assert.deepEqual(doc.scripts, ['js/v2/previa/dados-mais.js', 'js/v2/previa/pessoa.js'], 'o que a página já carregou não é carregado de novo');
});

test('pronto (prévia): arquivo que não carrega rejeita com erro de conexão em português', async () => {
  const doc = documentoFalso('pessoa');
  doc.head.appendChild = (s) => setTimeout(() => s.onerror && s.onerror(), 0);
  const api = V2.criar({ modo: 'previa', config: CONFIG, documento: doc, contrato: CONTRATO });
  await assert.rejects(() => api.pronto, (e) => e.conexao === true && /conectar/.test(e.message));
  await assert.rejects(() => api.base(), (e) => e.conexao === true);
});

test('pronto (supabase): resolve na hora e NUNCA injeta nada de previa/', async () => {
  const doc = documentoFalso('pessoa');
  const api = V2.criar({ modo: 'supabase', config: CONFIG, documento: doc, url: URL_SB, chave: CHAVE, fetch: async () => new Response('{"ok":true}'), armazenamento: memoria(), contrato: CONTRATO });
  await api.pronto;
  await api.base();
  assert.deepEqual(doc.scripts, []);
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'vagas', 'js', 'v2', 'api-v2.js'), 'utf8');
  assert.ok(!/\bsrc\s*=\s*['"][^'"]*previa\/(dados|pessoa|empresa)/.test(fonte), 'o caminho dos arquivos da prévia é montado só dentro do modo prévia');
});

// ---------------------------------------------------------------------------------------------------------------------
// No navegador (scripts na ordem da página, num contexto isolado)
// ---------------------------------------------------------------------------------------------------------------------

function paginaFalsa(modo) {
  const chamadas = [];
  const scripts = [];
  const sandbox = { console, setTimeout, clearTimeout, URL, Promise, JSON, Date, Math, Response, AbortController,
    VAGAS_CONFIG: Object.assign({}, CONFIG, { MODO: modo }),
    fetch: async (u, o) => { chamadas.push({ url: String(u).replace(URL_SB, ''), corpo: o && o.body }); return new Response('{"ok":true,"lista":[]}', { status: 200 }); },
    localStorage: memoria(), sessionStorage: memoria(),
    document: { readyState: 'complete', currentScript: { src: 'https://vagas.exemplo/js/v2/api-v2.js' }, head: { appendChild(s) { scripts.push(s.src); setTimeout(() => s.onload && s.onload(), 0); } },
      createElement: () => ({}), querySelector: (sel) => (sel.indexOf('meta') === 0 ? { getAttribute: () => 'pessoa' } : null) } };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of ['v2/contrato.js', 'api.js', 'v2/api-v2.js']) {
    const arq = path.join(__dirname, '..', 'vagas', 'js', f);
    sandbox.document.currentScript = { src: 'https://vagas.exemplo/js/' + f };
    vm.runInContext(fs.readFileSync(arq, 'utf8'), sandbox, { filename: arq });
  }
  return { sandbox, chamadas, scripts };
}

test('no navegador (modo supabase): window.VSC_API aparece depois de config.js, contrato.js e api.js, fala com o Supabase e não carrega nada de previa/', async () => {
  const p = paginaFalsa('supabase');
  const A = p.sandbox.VSC_API;
  assert.equal(A.modo, 'supabase');
  await A.pronto;
  await A.base({ cidade: 'uruacu-go' });
  assert.equal(p.chamadas[0].url, '/rest/v1/rpc/vagas_v2_base');
  assert.equal(JSON.parse(p.chamadas[0].corpo).p_dados.cidade, 'uruacu-go');
  assert.deepEqual(p.scripts, []);
  assert.equal(A.sessao(), null);
  assert.ok(Object.keys(CONTRATO.METODOS).every((m) => typeof A[m] === 'function'));
});

test('no navegador (modo prévia): VSC_API carrega os arquivos da prévia pelo caminho do próprio script e responde pelo VSC_PREVIA_METODOS', async () => {
  const p = paginaFalsa('previa');
  const A = p.sandbox.VSC_API;
  assert.equal(A.modo, 'previa');
  p.sandbox.VSC_PREVIA_METODOS = { candidaturas: () => ({ ok: true, lista: [] }) };
  await A.pronto;
  assert.deepEqual(p.scripts, ['https://vagas.exemplo/js/v2/previa/dados.js', 'https://vagas.exemplo/js/v2/previa/dados-mais.js', 'https://vagas.exemplo/js/v2/previa/pessoa.js']);
  assert.deepEqual((await A.candidaturas()).lista, []);
  assert.equal(p.chamadas.length, 0);
});
