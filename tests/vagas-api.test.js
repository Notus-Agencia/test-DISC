'use strict';
// Vagas sem Caos — cliente vagas/js/api.js no modo Supabase (fetch, sem supabase-js), com um fetch de mentira: monta as
// chamadas certas (RPC, Auth, Edge Function), guarda e renova a sessão, e traduz cada falha em Error em português.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const API = require('../vagas/js/api.js');

const URL_SB = 'https://exemplo.supabase.co';
const CHAVE = 'sb_publishable_teste';
// A 20261024 (onda 2) acrescenta e redefine RPCs (painel da praça, equipe da empresa, lista de espera com WhatsApp).
const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261022120000_vagas.sql'), 'utf8') +
  fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261024120000_vagas_onda2.sql'), 'utf8');

function memoria() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}
function resposta(status, corpo) {
  return { status, text: () => Promise.resolve(corpo === undefined ? '' : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo))) };
}
// fetch de mentira: responde pela rota; guarda as chamadas.
function falso(rotas) {
  const chamadas = [];
  const f = (url, o) => {
    const c = { url, metodo: o.method, cabecalhos: o.headers, corpo: o.body ? JSON.parse(o.body) : null };
    chamadas.push(c);
    const caminho = url.replace(URL_SB, '');
    for (const [padrao, fn] of rotas) if (caminho.startsWith(padrao)) return Promise.resolve(fn(c));
    return Promise.resolve(resposta(404, { code: 'PGRST202' }));
  };
  f.chamadas = chamadas;
  return f;
}
const SESSAO = { access_token: 'tok1', refresh_token: 'ref1', expires_in: 3600, user: { id: 'u1', email: 'ana@exemplo.com' } };
let relogio = Date.parse('2026-10-13T15:00:00Z');
const criar = (rotas, arm) => {
  const fetch = falso(rotas);
  const api = API.criar({ modo: 'supabase', url: URL_SB + '/', chave: CHAVE, fetch, armazenamento: arm || memoria(), agora: () => relogio });
  return { api, fetch };
};

test('contrato: todo método aponta para uma RPC que existe na migração (ou nas dos testes/DISC)', () => {
  const doBanco = new Set([...SQL.matchAll(/create or replace function public\.([a-z_0-9]+)/g)].map((m) => m[1]));
  for (const [nome, def] of Object.entries(API.METODOS)) {
    assert.ok(doBanco.has(def.rpc) || ['vagas_selo_publico'].includes(def.rpc), nome + ' -> ' + def.rpc);
    assert.ok(Array.isArray(def.p) && def.p.every((p) => /^p_[a-z]+$/.test(p)), nome);
  }
  // Os parâmetros batem com a assinatura da função no banco.
  for (const def of Object.values(API.METODOS)) {
    if (def.rpc === 'vagas_selo_publico' || def.rpc === 'versao_banco') continue;
    const m = new RegExp('create or replace function public\\.' + def.rpc + '\\(([^)]*)\\)').exec(SQL);
    const nomes = m[1].trim() ? m[1].split(',').map((x) => x.trim().split(/\s+/)[0]) : [];
    assert.deepEqual(nomes, def.p, def.rpc);
  }
  // Públicos = exatamente os liberados para anon na migração (+ o selo da 20261023 e versao_banco).
  const anon = /publicas text\[\] := array\[([^\]]+)\]/.exec(SQL)[1].match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1)).sort();
  const publicos = Object.values(API.METODOS).filter((d) => d.publico).map((d) => d.rpc)
    .filter((r) => r !== 'vagas_selo_publico' && r !== 'versao_banco').sort();
  assert.deepEqual(publicos, anon);
});

test('RPC pública sem sessão: só apikey (sem Authorization), POST com os parâmetros nomeados', async () => {
  const { api, fetch } = criar([['/rest/v1/rpc/vagas_anuncios_publicos', () => resposta(200, { ok: true, anuncios: [], proximo: '' })]]);
  const r = await api.anuncios({ cidade: 'boa-vista-rr' });
  assert.deepEqual(r, { ok: true, anuncios: [], proximo: '' });
  const c = fetch.chamadas[0];
  assert.equal(c.url, URL_SB + '/rest/v1/rpc/vagas_anuncios_publicos');
  assert.equal(c.metodo, 'POST');
  assert.equal(c.cabecalhos.apikey, CHAVE);
  assert.ok(!('Authorization' in c.cabecalhos));
  assert.deepEqual(c.corpo, { p_filtro: { cidade: 'boa-vista-rr' } });
  // Argumento ausente vira o padrão (objeto vazio), nunca null.
  await api.anuncios();
  assert.deepEqual(fetch.chamadas[1].corpo, { p_filtro: {} });
});

test('RPC de conta sem sessão: rejeita "Sessão expirada" sem chamar a rede', async () => {
  const { api, fetch } = criar([]);
  await assert.rejects(api.eu(), (e) => e.message === 'Sessão expirada. Entre de novo.' && e.sessaoExpirada === true);
  assert.equal(fetch.chamadas.length, 0);
});

test('entrar: guarda a sessão, chama vagas_eu com Bearer; erro de login em português', async () => {
  const arm = memoria();
  const { api, fetch } = criar([
    ['/auth/v1/token?grant_type=password', (c) => (c.corpo.password === 'certa' ? resposta(200, SESSAO) : resposta(400, { error_code: 'invalid_credentials' }))],
    ['/rest/v1/rpc/vagas_eu', () => resposta(200, { ok: true, conta: { tipo: 'pessoa' } })]
  ], arm);
  await assert.rejects(api.entrar('ana@exemplo.com', 'errada'), (e) => e.message === 'E-mail ou senha não conferem.');
  const eu = await api.entrar(' ANA@exemplo.com ', 'certa');
  assert.equal(eu.conta.tipo, 'pessoa');
  assert.equal(fetch.chamadas[1].corpo.email, 'ana@exemplo.com');
  assert.equal(fetch.chamadas[2].cabecalhos.Authorization, 'Bearer tok1');
  const guardada = JSON.parse(arm.getItem(API.CHAVE_SESSAO));
  assert.equal(guardada.refresh_token, 'ref1');
  assert.deepEqual((await api.sessao()).usuario, { id: 'u1', email: 'ana@exemplo.com' });
});

test('sessão: renova antes de vencer e de novo num 401; refresh recusado limpa a sessão', async () => {
  const arm = memoria();
  let renovacoes = 0;
  let primeira401 = true;
  const { api, fetch } = criar([
    ['/auth/v1/token?grant_type=refresh_token', () => { renovacoes += 1; return resposta(200, Object.assign({}, SESSAO, { access_token: 'tok' + (renovacoes + 1) })); }],
    ['/rest/v1/rpc/vagas_pessoa_minha', (c) => {
      if (c.cabecalhos.Authorization === 'Bearer tok2' && primeira401) { primeira401 = false; return resposta(401, { message: 'JWT expired' }); }
      return resposta(200, { ok: true, pessoa: null });
    }]
  ], arm);
  arm.setItem(API.CHAVE_SESSAO, JSON.stringify({ access_token: 'tok1', refresh_token: 'ref1', expires_at: Math.floor(relogio / 1000) + 30, user: { id: 'u1', email: 'a@b.com' } }));
  await api.minhaPessoa();
  assert.equal(renovacoes, 2, 'renovou por estar perto de vencer e de novo depois do 401');
  assert.equal(fetch.chamadas[fetch.chamadas.length - 1].cabecalhos.Authorization, 'Bearer tok3');
  // Refresh recusado: sessão some e o erro é "Sessão expirada".
  const arm2 = memoria();
  arm2.setItem(API.CHAVE_SESSAO, JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: 1, user: { id: 'u', email: '' } }));
  const b = criar([['/auth/v1/token?grant_type=refresh_token', () => resposta(400, { error: 'invalid_grant' })]], arm2);
  await assert.rejects(b.api.eu(), (e) => e.sessaoExpirada === true);
  assert.equal(arm2.getItem(API.CHAVE_SESSAO), null);
});

test('respostas do banco: {ok:false} vira Error com as marcas; 404/PGRST202 = banco sem a migração; rede fora = conexao', async () => {
  const { api } = criar([
    ['/rest/v1/rpc/vagas_anuncio_publico', () => resposta(200, { ok: false, erro: 'Vaga não encontrada ou já encerrada.', naoEncontrada: true })],
    ['/rest/v1/rpc/vagas_cidades_publicas', () => resposta(500, 'erro interno')]
  ]);
  await assert.rejects(api.anuncio('ABC123'), (e) => e.message === 'Vaga não encontrada ou já encerrada.' && e.naoEncontrada === true &&
    e.resposta.naoEncontrada === true);
  await assert.rejects(api.listaEspera({}), (e) => e.bancoDesatualizado === true && /20261022120000_vagas/.test(e.message));
  // Toda marca do contrato (docs/VAGAS-SPEC.md §2) chega em e.<marca>, inclusive linkExpirado, existe e ativa.
  const marcas = ['sessaoExpirada', 'confirmar', 'bloqueado', 'suspensa', 'semConta', 'completar', 'naoConfigurado', 'captcha', 'bancoDesatualizado',
    'naoEncontrada', 'listaEspera', 'pausada', 'verEmpresa', 'semCombinou', 'contatoCortado', 'bloqueada', 'aguardar', 'semFoto', 'linkExpirado', 'existe', 'ativa'];
  const todas = {};
  marcas.forEach((k) => { todas[k] = true; });
  const m = criar([['/rest/v1/rpc/vagas_lista_espera_sair', () => resposta(200, Object.assign({ ok: false, erro: 'Teste das marcas.' }, todas))]]);
  await assert.rejects(m.api.listaEsperaSair({ cidade: 'rorainopolis-rr', email: 'a@b.com' }), (e) => {
    for (const k of marcas) assert.equal(e[k], true, 'marca ' + k);
    return e.message === 'Teste das marcas.';
  });
  assert.deepEqual(m.fetch.chamadas[0].corpo, { p_dados: { cidade: 'rorainopolis-rr', email: 'a@b.com' } });
  await assert.rejects(api.cidades(), (e) => e.message === 'O servidor recusou a solicitação.');
  const fora = API.criar({ modo: 'supabase', url: URL_SB, chave: CHAVE, armazenamento: memoria(), fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
  await assert.rejects(fora.cidades(), (e) => e.conexao === true && /conexão com a internet/.test(e.message));
});

test('Edge Function vagas-conta: cadastrar SEM senha e com a versão dos termos; excluir com JWT; 404 = função não publicada', async () => {
  const arm = memoria();
  arm.setItem(API.CHAVE_SESSAO, JSON.stringify({ access_token: 'tok1', refresh_token: 'r', expires_at: Math.floor(relogio / 1000) + 3600, user: { id: 'u', email: '' } }));
  const { api, fetch } = criar([['/functions/v1/vagas-conta', (c) => resposta(200, { ok: true, enviado: true, acao: c.corpo.acao })]], arm);
  await api.cadastrar({ email: 'nova@exemplo.com', tipo: 'pessoa', senha: 'nao-vai' });
  const c = fetch.chamadas[0];
  assert.equal(c.url, URL_SB + '/functions/v1/vagas-conta');
  assert.deepEqual(c.corpo, { acao: 'cadastrar', email: 'nova@exemplo.com', tipo: 'pessoa', nome: '', termosVersao: '2026-10-13', captcha: '' });
  assert.ok(!('Authorization' in c.cabecalhos));
  await api.excluirConta();
  assert.deepEqual(fetch.chamadas[1].corpo, { acao: 'excluir', confirmar: 'EXCLUIR' });
  assert.equal(fetch.chamadas[1].cabecalhos.Authorization, 'Bearer tok1');
  assert.equal(arm.getItem(API.CHAVE_SESSAO), null, 'excluir a conta encerra a sessão');
  const sem = criar([['/functions/v1/vagas-conta', () => resposta(404, 'Not found')]]);
  await assert.rejects(sem.api.esqueciSenha('a@b.com'), (e) => e.naoConfigurado === true);
});

test('link do e-mail: lê token_hash/type do endereço, confirma (verify) e cria a senha (PUT /user)', async () => {
  assert.equal(API.linkDoEndereco({ search: '' }), null);
  assert.equal(API.linkDoEndereco({ search: '?token_hash=abc&type=invite' }), null, 'token curto demais');
  assert.equal(API.linkDoEndereco({ search: '?token_hash=abcdefgh12&type=outro' }), null);
  const link = API.linkDoEndereco({ search: '?token_hash=pkce_abcdef123456&type=invite' });
  assert.deepEqual(link, { tokenHash: 'pkce_abcdef123456', tipo: 'invite' });
  const { api, fetch } = criar([
    ['/auth/v1/verify', (c) => (c.corpo.token_hash === 'pkce_abcdef123456' ? resposta(200, SESSAO) : resposta(403, { error_code: 'otp_expired' }))],
    ['/auth/v1/user', () => resposta(200, { id: 'u1' })]
  ]);
  await assert.rejects(api.confirmarLink({ tokenHash: 'outro_token_123', tipo: 'invite' }), (e) => {
    assert.equal(e.linkExpirado, true, 'a marca linkExpirado chega em e.linkExpirado');
    return e.message === 'O link expirou ou já foi usado. Peça outro na tela de entrada.';
  });
  await assert.rejects(api.confirmarLink(null), (e) => e.linkExpirado === true);
  assert.deepEqual(await api.confirmarLink(link), { ok: true, tipo: 'invite', precisaSenha: true });
  assert.deepEqual(fetch.chamadas[1].corpo, { type: 'invite', token_hash: 'pkce_abcdef123456' });
  await assert.rejects(api.definirSenha('curta'), (e) => e.message === 'A senha precisa ter de 8 a 72 caracteres.');
  assert.deepEqual(await api.definirSenha('senha-boa-123'), { ok: true });
  const put = fetch.chamadas[fetch.chamadas.length - 1];
  assert.deepEqual([put.metodo, put.cabecalhos.Authorization, put.corpo], ['PUT', 'Bearer tok1', { password: 'senha-boa-123' }]);
});

test('o cliente não tem chave secreta nem supabase-js; config.js só com a chave pública', () => {
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'vagas', 'js', 'api.js'), 'utf8');
  assert.ok(!/service_role|sb_secret_|createClient\(/.test(fonte));
  const cfg = require('../vagas/js/config.js');
  assert.equal(cfg.MODO, 'previa');
  assert.match(cfg.SUPABASE_ANON_KEY, /^sb_publishable_/);
  assert.match(cfg.SUPABASE_URL, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  const texto = fs.readFileSync(path.join(__dirname, '..', 'vagas', 'js', 'config.js'), 'utf8');
  assert.ok(!/sb_secret_|eyJhbGciOi/.test(texto), 'nenhum segredo nem JWT em config.js');
  assert.match(texto, /SUPABASE_ANON_KEY\s*[:=]\s*['"][^'"]+['"]/, 'linha que a Pages Function (/v/) lê');
  // A mesma chave pública e o mesmo projeto do DISC.
  const disc = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');
  assert.ok(disc.includes(cfg.SUPABASE_URL) && disc.includes(cfg.SUPABASE_ANON_KEY));
});

test('foto: grava e apaga direto no Storage com o login da pessoa; URL assinada pela Edge Function; contatoPessoa traz fotoUrl', async () => {
  const arm = memoria();
  arm.setItem(API.CHAVE_SESSAO, JSON.stringify({ access_token: 'tok1', refresh_token: 'r', expires_at: Math.floor(relogio / 1000) + 3600, user: { id: 'u1', email: '' } }));
  let assinar = true;
  const { api, fetch } = criar([
    ['/storage/v1/object/vagas-fotos/u1/foto.jpg', () => resposta(200, { Key: 'vagas-fotos/u1/foto.jpg' })],
    ['/storage/v1/object/vagas-fotos', () => resposta(200, [{ name: 'u1/foto.jpg' }])],
    ['/functions/v1/vagas-conta', (c) => (assinar ? resposta(200, { ok: true, url: 'https://exemplo.supabase.co/storage/v1/object/sign/vagas-fotos/p/foto.jpg?token=t',
      expiraEm: '2026-10-13T15:05:00.000Z', pedido: c.corpo }) : resposta(200, { ok: false, erro: 'A foto só aparece depois do Combinou.', semCombinou: true }))],
    ['/rest/v1/rpc/vagas_contato_pessoa', () => resposta(200, { ok: true, pessoa: { nome: 'Ana', temFoto: true } })]
  ], arm);
  const FOTO = 'A foto precisa ser JPG, PNG ou WEBP, com até 1 MB.';
  await assert.rejects(api.enviarFoto({ type: 'image/gif', size: 10 }), (e) => e.message === FOTO);
  await assert.rejects(api.enviarFoto({ type: 'image/jpeg', size: 1048577 }), (e) => e.message === FOTO);
  assert.equal(fetch.chamadas.length, 0, 'nada vai para a rede sem passar na conferência');
  const corpo = { type: 'image/jpeg', size: 150000 };
  fetch.chamadas.length = 0;
  const falsoFetch = (url, o) => { fetch.chamadas.push({ url, metodo: o.method, cabecalhos: o.headers, corpoBruto: o.body }); return Promise.resolve(resposta(200, { Key: 'x' })); };
  const api2 = API.criar({ modo: 'supabase', url: URL_SB, chave: CHAVE, fetch: falsoFetch, armazenamento: arm, agora: () => relogio });
  assert.deepEqual(await api2.enviarFoto(corpo), { ok: true, temFoto: true });
  const up = fetch.chamadas[0];
  assert.equal(up.url, URL_SB + '/storage/v1/object/vagas-fotos/u1/foto.jpg');
  assert.equal(up.metodo, 'POST');
  assert.deepEqual([up.cabecalhos.Authorization, up.cabecalhos['Content-Type'], up.cabecalhos['x-upsert']], ['Bearer tok1', 'image/jpeg', 'true']);
  assert.equal(up.corpoBruto, corpo, 'o arquivo vai como está');
  assert.deepEqual(await api.apagarFoto(), { ok: true, temFoto: false });
  const del = fetch.chamadas.find((c) => c.metodo === 'DELETE');
  assert.equal(del.url, URL_SB + '/storage/v1/object/vagas-fotos');
  assert.deepEqual(del.corpo, { prefixes: ['u1/foto.jpg'] });
  const url = await api.fotoUrl('11111111-2222-3333-4444-555555555555');
  assert.deepEqual(url.pedido, { acao: 'foto', candidatura: '11111111-2222-3333-4444-555555555555' });
  const ct = await api.contatoPessoa('11111111-2222-3333-4444-555555555555');
  assert.equal(ct.pessoa.fotoUrl, 'https://exemplo.supabase.co/storage/v1/object/sign/vagas-fotos/p/foto.jpg?token=t');
  assinar = false;
  assert.equal((await api.contatoPessoa('11111111-2222-3333-4444-555555555555')).pessoa.fotoUrl, '', 'sem URL quando o banco não deixa');
  await assert.rejects(api.fotoUrl('11111111-2222-3333-4444-555555555555'), (e) => e.semCombinou === true);
});

test('onda 2: painel da praça, equipe da empresa e convite por e-mail (Edge Function, com a sessão)', async () => {
  assert.deepEqual(['indicadores', 'equipeDaEmpresa', 'cancelarConvite', 'removerMembro', 'conviteEquipe', 'aceitarConviteEquipe'].map((m) => API.METODOS[m].rpc),
    ['vagas_op_indicadores', 'vagas_equipe_empresa', 'vagas_equipe_convite_cancelar', 'vagas_equipe_remover', 'vagas_equipe_convite', 'vagas_equipe_convite_aceitar']);
  assert.ok(['indicadores', 'equipeDaEmpresa', 'cancelarConvite', 'removerMembro', 'conviteEquipe', 'aceitarConviteEquipe'].every((m) => !API.METODOS[m].publico));
  const arm = memoria();
  arm.setItem(API.CHAVE_SESSAO, JSON.stringify({ access_token: 'tok1', refresh_token: 'ref1', expires_at: relogio / 1000 + 3600, user: { id: 'u1', email: 'a@b.co' } }));
  const { api, fetch } = criar([
    ['/rest/v1/rpc/vagas_op_indicadores', () => resposta(200, { ok: true, indicadores: [], gatilhos: [] })],
    ['/rest/v1/rpc/vagas_equipe_remover', () => resposta(200, { ok: false, erro: 'A empresa precisa ter pelo menos uma pessoa como dona. Esta pessoa não pode sair da equipe.' })],
    ['/functions/v1/vagas-conta', () => resposta(200, { ok: true, enviado: true, mensagem: 'Pronto.', email: 'n***@e***.com', convite: { id: 'c1' } })]
  ], arm);
  await api.indicadores('uruacu-go');
  assert.deepEqual(fetch.chamadas[0].corpo, { p_cidade: 'uruacu-go' });
  assert.equal(fetch.chamadas[0].cabecalhos.Authorization, 'Bearer tok1');
  await assert.rejects(api.removerMembro('e1', 'u2'), (e) => /pelo menos uma pessoa como dona/.test(e.message));
  assert.deepEqual(fetch.chamadas[1].corpo, { p_empresa: 'e1', p_membro: 'u2' });
  const r = await api.convidarEquipe('e1', 'nova@exemplo.com');
  assert.equal(r.convite.id, 'c1');
  assert.deepEqual(fetch.chamadas[2].corpo, { acao: 'convite_equipe', empresaId: 'e1', email: 'nova@exemplo.com' });
  assert.equal(fetch.chamadas[2].cabecalhos.Authorization, 'Bearer tok1');
  // Convite no endereço: sozinho ou junto do link do e-mail; só 64 hex.
  const tk = 'ab'.repeat(32);
  assert.equal(API.conviteDoEndereco({ search: '?convite=' + tk }), tk);
  assert.equal(API.conviteDoEndereco({ search: '?token_hash=abc12345&type=invite&convite=' + tk.toUpperCase() }), tk);
  assert.deepEqual(API.linkDoEndereco({ search: '?token_hash=abc12345&type=invite&convite=' + tk }), { tokenHash: 'abc12345', tipo: 'invite' });
  assert.equal(API.conviteDoEndereco({ search: '?convite=' + tk + 'ff' }), '');
  assert.equal(API.conviteDoEndereco({ search: '' }), '');
  assert.equal(API.conviteDoEndereco(null), '');
});
