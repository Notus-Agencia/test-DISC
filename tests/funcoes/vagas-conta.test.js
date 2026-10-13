// Edge Function "vagas-conta" (contas do Vagas sem Caos) com Auth, banco, Resend e Turnstile FALSOS (nenhuma chamada real):
// resposta neutra (não revela se o e-mail existe), senha criada só no clique do link, nunca mexe em conta do painel DISC,
// cadastro assistido só por operador(a) da cidade ou equipe, convite de operação só pela equipe, exclusão com confirmação.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atenderVagasConta, montarEmailVagas, mascararEmailVagas, linkVagas, vagasCors, lerEnvVagasConta, criarBaseVagasConta,
  VAGAS_MSG_ENVIADO, VAGAS_MSG_EMAIL_NAO_CONFIGURADO, VAGAS_MSG_CAPTCHA, VAGAS_MSG_TERMOS, VAGAS_MSG_JA_EXISTE, VAGAS_MSG_CONVITE_EQUIPE,
  linkConviteEquipe
} from '../../supabase/funcoes-compartilhadas/vagas-conta.js';

const SITE = 'https://vagas.gestaosemcaos.com.br';

// Mundo falso: usuários do Auth (com app_metadata), contas do Vagas, admins do DISC, operadores e limites.
function preparar(op) {
  op = op || {};
  const usuarios = [];   // {id, email, confirmada, app, usuario}
  const contas = {};     // userId -> {tipo, status, ...dados}
  const admins = new Set(op.admins || []);
  const operadores = {}; // userId -> [{cidade, papel}]
  const chamadasLimite = [];
  const links = [];
  const excluidos = [];
  const fotosPedidas = [];
  const assinadas = [];
  const removidos = [];
  const convites = [];
  let n = 0;
  (op.usuarios || []).forEach((u) => { usuarios.push(u); if (u.conta) contas[u.id] = u.conta; if (u.operador) operadores[u.id] = u.operador; });
  const db = {
    async limite(acao, cf, xff, email, ator) {
      chamadasLimite.push({ acao, cf, xff, email, ator });
      if (op.bloquear) return { ok: false, erro: 'Muitas tentativas. Tente de novo mais tarde.', bloqueado: true };
      return { ok: true };
    },
    async consultar(email) {
      const u = usuarios.find((x) => x.email === email);
      if (!u) return { ok: true, existe: false };
      return { ok: true, existe: true, userId: u.id, produto: (u.app && u.app.produto) || '', confirmada: !!u.confirmada,
        conta: contas[u.id] ? { tipo: contas[u.id].tipo, status: contas[u.id].status || 'pendente' } : null, admin: admins.has(u.id) };
    },
    async registrar(userId, dados) {
      if (op.registroFalha) return { ok: false, erro: 'Empresa não encontrada.' };
      if (contas[userId] && contas[userId].tipo !== dados.tipo) {
        // Como o banco: só conta pendente "solta" (não assistida, sem vínculo) com e-mail não confirmado troca de tipo.
        const u = usuarios.find((x) => x.id === userId);
        const solta = (contas[userId].status || 'pendente') === 'pendente' && !(u && u.confirmada) && !contas[userId].assistidaPor;
        if (!solta) return { ok: false, erro: 'Este e-mail já tem uma conta de outro tipo.' };
      }
      contas[userId] = Object.assign({ status: 'pendente' }, contas[userId] || {}, dados);
      if (dados.operador) operadores[userId] = [{ cidade: dados.operador.cidade, papel: dados.operador.papel }];
      return { ok: true, userId, tipo: dados.tipo };
    },
    async quem(userId) {
      return { ok: true, admin: admins.has(userId), conta: contas[userId] ? { tipo: contas[userId].tipo, status: 'ativa' } : null,
        operador: operadores[userId] || [] };
    },
    async foto(userId, candidatura) {
      fotosPedidas.push({ userId, candidatura });
      return op.foto ? op.foto(userId, candidatura) : { ok: false, erro: 'Sem foto.', semFoto: true };
    },
    async conviteEquipe(userId, empresaId, email, cf, xff) {
      convites.push({ userId, empresaId, email, cf, xff });
      return op.convite ? op.convite(userId, empresaId, email) : { ok: false, erro: 'Empresa não encontrada.' };
    }
  };
  const storage = {
    async assinar(bucket, caminho, segundos) { assinadas.push({ bucket, caminho, segundos }); return 'https://p.supabase.co/storage/v1/object/sign/' + bucket + '/' + caminho + '?token=t'; },
    async remover(bucket, caminhos) { if (op.removerFalha) throw new Error('Storage: falha ao apagar'); removidos.push({ bucket, caminhos }); }
  };
  const apps = [];
  const auth = {
    async criarUsuario(u) {
      n += 1;
      const id = 'novo-' + n;
      usuarios.push({ id, email: u.email, confirmada: false, app: u.app, usuario: u.usuario, senha: u.senha });
      return { id };
    },
    async gerarLink(tipo, email) {
      if (op.inviteFalha && tipo === 'invite') throw new Error('Auth: invite recusado');
      links.push({ tipo, email });
      return 'hash' + links.length + 'abcdefghijklmnop';
    },
    async usuarioDoToken(jwt) {
      const u = (op.jwts || {})[jwt];
      return u ? { id: u, email: '' } : null;
    },
    async atualizarApp(id, app) { apps.push({ id, app }); const u = usuarios.find((x) => x.id === id); if (u) u.app = app; },
    async excluirUsuario(id) { excluidos.push(id); }
  };
  const enviados = [];
  const captchas = [];
  async function fetch(url, o) {
    if (String(url) === 'https://api.resend.com/emails') {
      enviados.push(JSON.parse(o.body));
      if (op.resendFalha) return new Response('{"message":"x"}', { status: 500 });
      return new Response('{"id":"em_1"}', { status: 200 });
    }
    if (String(url) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      const corpo = new URLSearchParams(String(o.body));
      captchas.push(Object.fromEntries(corpo));
      return new Response(JSON.stringify({ success: corpo.get('response') === 'captcha-bom' }), { status: 200 });
    }
    throw new Error('teste: chamada externa inesperada para ' + url);
  }
  const env = Object.assign({ VAGAS_SITE_URL: SITE + '/', RESEND_API_KEY: 're_teste', VAGAS_EMAIL_REMETENTE: 'Vagas sem Caos <vagas@gestaosemcaos.com.br>' }, op.env);
  const base = { env, fetch, db, auth, storage, aleatorio: () => 'senha-aleatoria-' + (n + 1) };
  return { base, usuarios, contas, operadores, links, enviados, captchas, chamadasLimite, excluidos, fotosPedidas, assinadas, removidos, apps, convites };
}

async function chamar(base, corpo, op) {
  op = op || {};
  const headers = { origin: op.origem || SITE, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' };
  if (op.jwt) headers.authorization = 'Bearer ' + op.jwt;
  const r = await atenderVagasConta(new Request('https://x/functions/v1/vagas-conta', { method: op.metodo || 'POST', headers,
    body: op.metodo === 'OPTIONS' || op.metodo === 'GET' ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) }), base);
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), json: r.status === 204 ? null : await r.json() };
}
const NEUTRA = (email) => ({ ok: true, enviado: true, mensagem: VAGAS_MSG_ENVIADO, email: mascararEmailVagas(email) });

test('cadastrar: cria a conta com app_metadata do Vagas, SEM senha conhecida, e manda o link "confirmar e criar senha"', async () => {
  const w = preparar();
  const r = await chamar(w.base, { acao: 'cadastrar', email: ' Ana.Souza@Exemplo.com ', tipo: 'pessoa', termosVersao: '2026-10', nome: 'Ana Souza', senha: 'ignorada123' });
  assert.equal(r.status, 200);
  assert.equal(r.cors, SITE);
  assert.deepEqual(r.json, NEUTRA('ana.souza@exemplo.com'));
  assert.equal(r.json.email, 'a***@e***.com');
  assert.equal(w.usuarios.length, 1);
  const u = w.usuarios[0];
  assert.equal(u.email, 'ana.souza@exemplo.com');
  assert.deepEqual(u.app, { produto: 'vagas', tipo: 'pessoa' });
  assert.equal(u.senha, 'senha-aleatoria-1', 'a senha digitada no cadastro nunca é usada (é criada no clique)');
  assert.deepEqual(w.contas[u.id], { status: 'pendente', tipo: 'pessoa', termosVersao: '2026-10' });
  assert.deepEqual(w.links, [{ tipo: 'invite', email: 'ana.souza@exemplo.com' }]);
  assert.equal(w.enviados.length, 1);
  const m = w.enviados[0];
  assert.deepEqual(m.to, ['ana.souza@exemplo.com']);
  assert.equal(m.from, 'Vagas sem Caos <vagas@gestaosemcaos.com.br>');
  assert.equal(m.subject, 'Confirme seu e-mail — Vagas sem Caos');
  assert.ok(m.html.includes(SITE + '/entrar.html?token_hash=hash1abcdefghijklmnop&amp;type=invite'));
  assert.ok(m.text.includes(SITE + '/entrar.html?token_hash=hash1abcdefghijklmnop&type=invite'));
  assert.match(m.html, /Olá, Ana!/);
  assert.match(m.text, /Nunca pague para se candidatar/);
  assert.ok(!/notus/i.test(m.html + m.text), 'só a marca Gestão sem Caos');
  assert.deepEqual(w.chamadasLimite, [{ acao: 'cadastrar', cf: '', xff: '203.0.113.9, 10.0.0.1', email: 'ana.souza@exemplo.com', ator: null }]);
  assert.ok(!JSON.stringify(r.json).includes('hash1'), 'o link nunca volta para o navegador');
});

test('cadastrar: resposta neutra — conta do Vagas pendente recebe link novo; confirmada recebe "já tem conta"; conta do DISC, nada', async () => {
  const w = preparar({ usuarios: [
    { id: 'p1', email: 'pendente@x.com', confirmada: false, app: { produto: 'vagas', tipo: 'pessoa' }, conta: { tipo: 'pessoa' } },
    { id: 'c1', email: 'confirmada@x.com', confirmada: true, app: { produto: 'vagas', tipo: 'empresa' }, conta: { tipo: 'empresa', status: 'ativa' } },
    { id: 'd1', email: 'dono@gestaosemcaos.com.br', confirmada: true, app: {} }
  ], admins: ['d1'] });
  for (const email of ['pendente@x.com', 'confirmada@x.com', 'dono@gestaosemcaos.com.br']) {
    const r = await chamar(w.base, { acao: 'cadastrar', email, tipo: 'pessoa', termosVersao: '2026-10' });
    assert.deepEqual(r.json, NEUTRA(email), email);
  }
  assert.equal(w.usuarios.length, 3, 'nenhum usuário novo');
  assert.deepEqual(w.enviados.map((e) => [e.to[0], e.subject]), [
    ['pendente@x.com', 'Confirme seu e-mail — Vagas sem Caos'],
    ['confirmada@x.com', 'Você já tem conta — Vagas sem Caos']]);
  assert.ok(w.enviados[1].html.includes(SITE + '/entrar.html'));
  assert.equal(w.contas.d1, undefined, 'nunca vira conta do Vagas');
});

test('cadastrar: conta pendente "pré-registrada" por outro com o tipo errado troca o tipo (banco + app_metadata); invite recusado cai no magiclink', async () => {
  const w = preparar({ usuarios: [
    { id: 'v', email: 'vitima@x.com', confirmada: false, app: { produto: 'vagas', tipo: 'empresa' }, conta: { tipo: 'empresa', status: 'pendente' } },
    { id: 'c1', email: 'confirmada@x.com', confirmada: true, app: { produto: 'vagas', tipo: 'empresa' }, conta: { tipo: 'empresa', status: 'ativa' } }
  ], inviteFalha: true });
  const r = await chamar(w.base, { acao: 'cadastrar', email: 'vitima@x.com', tipo: 'pessoa', termosVersao: '2026-10-13' });
  assert.deepEqual(r.json, NEUTRA('vitima@x.com'), 'resposta neutra, como sempre');
  assert.equal(w.contas.v.tipo, 'pessoa', 'o banco troca o tipo da conta pendente');
  assert.deepEqual(w.apps, [{ id: 'v', app: { produto: 'vagas', tipo: 'pessoa' } }], 'o app_metadata acompanha');
  assert.deepEqual(w.links, [{ tipo: 'magiclink', email: 'vitima@x.com' }], 'invite recusado no cadastrar: cai no magiclink');
  assert.ok(w.enviados[0].html.includes('&amp;type=magiclink'));
  // Mesmo tipo: nada muda no app_metadata; conta confirmada: nem o banco nem o Auth mudam o tipo.
  await chamar(w.base, { acao: 'cadastrar', email: 'vitima@x.com', tipo: 'pessoa', termosVersao: '2026-10-13' });
  assert.equal(w.apps.length, 1);
  assert.deepEqual((await chamar(w.base, { acao: 'cadastrar', email: 'confirmada@x.com', tipo: 'pessoa', termosVersao: '2026-10-13' })).json, NEUTRA('confirmada@x.com'));
  assert.equal(w.contas.c1.tipo, 'empresa');
  assert.equal(w.apps.length, 1);
  // Conta assistida pendente (dona de empresa, convite de operação): o banco recusa a troca; o tipo fica, o link vai de novo
  // e a resposta é a MESMA neutra (nunca erro interno, nada revela o vínculo).
  const a = preparar({ usuarios: [{ id: 'a', email: 'assistida@x.com', confirmada: false, app: { produto: 'vagas', tipo: 'empresa' },
    conta: { tipo: 'empresa', status: 'pendente', assistidaPor: 'op' } }] });
  assert.deepEqual((await chamar(a.base, { acao: 'cadastrar', email: 'assistida@x.com', tipo: 'pessoa', termosVersao: '2026-10-13' })).json, NEUTRA('assistida@x.com'));
  assert.equal(a.contas.a.tipo, 'empresa', 'o vínculo da conta assistida fica');
  assert.deepEqual(a.apps, [], 'app_metadata intacto');
  assert.deepEqual(a.links, [{ tipo: 'invite', email: 'assistida@x.com' }], 'o link vai de novo');
  assert.equal(a.enviados.length, 1);
});

test('cadastrar: validações, e-mail não configurado, captcha (Turnstile) e limite por origem', async () => {
  const w = preparar();
  assert.deepEqual((await chamar(w.base, { acao: 'cadastrar', email: 'x', tipo: 'pessoa', termosVersao: '1' })).json, { ok: false, erro: 'E-mail inválido.' });
  assert.deepEqual((await chamar(w.base, { acao: 'cadastrar', email: 'a@b.com', tipo: 'operador', termosVersao: '1' })).json,
    { ok: false, erro: 'Escolha se a conta é para procurar emprego ou para uma empresa.' });
  assert.deepEqual((await chamar(w.base, { acao: 'cadastrar', email: 'a@b.com', tipo: 'pessoa' })).json, { ok: false, erro: VAGAS_MSG_TERMOS });
  const sem = preparar({ env: { RESEND_API_KEY: '' } });
  assert.deepEqual((await chamar(sem.base, { acao: 'cadastrar', email: 'a@b.com', tipo: 'pessoa', termosVersao: '1' })).json,
    { ok: false, erro: VAGAS_MSG_EMAIL_NAO_CONFIGURADO, naoConfigurado: true });
  assert.equal(sem.usuarios.length, 0, 'sem e-mail não cria conta pela metade');
  const cap = preparar({ env: { TURNSTILE_SECRET: 'segredo-turnstile' } });
  assert.deepEqual((await chamar(cap.base, { acao: 'cadastrar', email: 'a@b.com', tipo: 'pessoa', termosVersao: '1', captcha: 'ruim' })).json,
    { ok: false, erro: VAGAS_MSG_CAPTCHA, captcha: true });
  assert.equal((await chamar(cap.base, { acao: 'cadastrar', email: 'a@b.com', tipo: 'pessoa', termosVersao: '1', captcha: 'captcha-bom' })).json.ok, true);
  assert.equal(cap.captchas[1].secret, 'segredo-turnstile');
  const bloq = preparar({ bloquear: true });
  assert.deepEqual((await chamar(bloq.base, { acao: 'cadastrar', email: 'a@b.com', tipo: 'pessoa', termosVersao: '1' })).json,
    { ok: false, erro: 'Muitas tentativas. Tente de novo mais tarde.', bloqueado: true });
  assert.equal(bloq.usuarios.length, 0);
});

test('reenviar e esqueci: só para conta do Vagas; mesma resposta para quem não existe; recovery no esqueci', async () => {
  const w = preparar({ usuarios: [
    { id: 'p1', email: 'pendente@x.com', confirmada: false, app: { produto: 'vagas' }, conta: { tipo: 'pessoa' } },
    { id: 'c1', email: 'confirmada@x.com', confirmada: true, app: { produto: 'vagas' }, conta: { tipo: 'pessoa' } },
    { id: 'd1', email: 'dono@gestaosemcaos.com.br', confirmada: true, app: {} }
  ], admins: ['d1'], inviteFalha: true });
  for (const email of ['pendente@x.com', 'confirmada@x.com', 'dono@gestaosemcaos.com.br', 'ninguem@x.com']) {
    assert.deepEqual((await chamar(w.base, { acao: 'reenviar', email })).json, NEUTRA(email));
  }
  assert.deepEqual(w.links, [{ tipo: 'magiclink', email: 'pendente@x.com' }], 'invite recusado: cai no magiclink');
  for (const email of ['pendente@x.com', 'confirmada@x.com', 'dono@gestaosemcaos.com.br', 'ninguem@x.com']) {
    assert.deepEqual((await chamar(w.base, { acao: 'esqueci', email })).json, NEUTRA(email));
  }
  assert.deepEqual(w.links.slice(1), [{ tipo: 'recovery', email: 'pendente@x.com' }, { tipo: 'recovery', email: 'confirmada@x.com' }]);
  assert.equal(w.enviados.filter((e) => e.subject === 'Crie uma nova senha — Vagas sem Caos').length, 2);
  assert.ok(w.enviados.every((e) => e.to[0] !== 'dono@gestaosemcaos.com.br'), 'nunca mexe na conta do painel');
});

test('assistido: só operador(a) da cidade ou equipe; conta pendente com quem fez e o mutirão; link só para a pessoa', async () => {
  const w = preparar({ usuarios: [{ id: 'op1', email: 'op@x.com', confirmada: true, app: { produto: 'vagas' }, conta: { tipo: 'operador' },
    operador: [{ cidade: 'boa-vista-rr', papel: 'operador' }] },
  { id: 'mod1', email: 'mod@x.com', confirmada: true, app: { produto: 'vagas' }, conta: { tipo: 'operador' },
    operador: [{ cidade: 'boa-vista-rr', papel: 'moderador' }] },
  { id: 'ja', email: 'ja@x.com', confirmada: true, app: { produto: 'vagas' }, conta: { tipo: 'pessoa' } }],
  jwts: { 'jwt-op': 'op1', 'jwt-mod': 'mod1', 'jwt-pessoa': 'ja' } });
  const corpo = { acao: 'assistido', email: 'Rosa@Exemplo.com', tipo: 'pessoa', cidade: 'boa-vista-rr', nome: 'Rosa Alves', codigoEvento: 'MUTIRAO-01' };
  assert.deepEqual((await chamar(w.base, corpo)).json, { ok: false, erro: 'Sessão expirada. Entre de novo.', sessaoExpirada: true });
  assert.deepEqual((await chamar(w.base, corpo, { jwt: 'jwt-pessoa' })).json, { ok: false, erro: 'Sem permissão.' });
  assert.deepEqual((await chamar(w.base, corpo, { jwt: 'jwt-mod' })).json, { ok: false, erro: 'Sem permissão.' });
  assert.deepEqual((await chamar(w.base, Object.assign({}, corpo, { cidade: 'mucajai-rr' }), { jwt: 'jwt-op' })).json, { ok: false, erro: 'Sem permissão.' });
  const r = await chamar(w.base, corpo, { jwt: 'jwt-op' });
  assert.deepEqual(r.json, { ok: true, enviado: true, email: 'r***@e***.com' });
  const u = w.usuarios.find((x) => x.email === 'rosa@exemplo.com');
  assert.deepEqual(u.app, { produto: 'vagas', tipo: 'pessoa', assistido: true });
  assert.equal(u.confirmada, false);
  assert.deepEqual(w.contas[u.id], { status: 'pendente', tipo: 'pessoa', assistidaPor: 'op1', cidade: 'boa-vista-rr', empresaId: '', codigoEvento: 'MUTIRAO-01' });
  assert.deepEqual(w.enviados.map((e) => e.to[0]), ['rosa@exemplo.com'], 'o link vai só para a pessoa');
  assert.equal(w.enviados[0].subject, 'Ative a sua conta — Vagas sem Caos');
  assert.match(w.enviados[0].text, /Sem a sua confirmação, a conta não vale/);
  assert.deepEqual((await chamar(w.base, Object.assign({}, corpo, { email: 'ja@x.com' }), { jwt: 'jwt-op' })).json,
    { ok: false, erro: VAGAS_MSG_JA_EXISTE, existe: true });
  // Registro recusado (ex.: empresa de outra cidade): o usuário criado é apagado (sem conta pela metade).
  const f = preparar({ usuarios: w.usuarios.filter((x) => x.id === 'op1'), jwts: { 'jwt-op': 'op1' }, registroFalha: true });
  f.operadores.op1 = [{ cidade: 'boa-vista-rr', papel: 'operador' }];
  assert.deepEqual((await chamar(f.base, Object.assign({}, corpo, { email: 'outra@x.com', tipo: 'empresa', empresaId: 'e1' }), { jwt: 'jwt-op' })).json,
    { ok: false, erro: 'Empresa não encontrada.' });
  assert.deepEqual(f.excluidos, ['novo-1']);
  assert.equal(f.enviados.length, 0);
});

test('operador: só a equipe convida; e-mail de outra conta é recusado; conta de operação existente só ganha a cidade', async () => {
  const w = preparar({ usuarios: [{ id: 'adm', email: 'dono@gsc.com', confirmada: true, app: {} },
    { id: 'p', email: 'pessoa@x.com', confirmada: true, app: { produto: 'vagas' }, conta: { tipo: 'pessoa' } },
    { id: 'op', email: 'op@x.com', confirmada: true, app: { produto: 'vagas' }, conta: { tipo: 'operador' } }],
  admins: ['adm'], jwts: { 'jwt-adm': 'adm', 'jwt-p': 'p' } });
  const corpo = { acao: 'operador', email: 'parceiro@rorainopolis.com', cidade: 'rorainopolis-rr', papel: 'moderador', cidadeNome: 'Rorainópolis' };
  assert.deepEqual((await chamar(w.base, corpo, { jwt: 'jwt-p' })).json, { ok: false, erro: 'Sem permissão.' });
  assert.deepEqual((await chamar(w.base, corpo, { jwt: 'jwt-adm' })).json, { ok: true, enviado: true, email: 'p***@r***.com' });
  const u = w.usuarios.find((x) => x.email === 'parceiro@rorainopolis.com');
  assert.deepEqual(w.contas[u.id].operador, { cidade: 'rorainopolis-rr', papel: 'moderador' });
  assert.equal(w.enviados[0].subject, 'Acesso de operação — Vagas sem Caos');
  assert.match(w.enviados[0].text, /em Rorainópolis/);
  assert.deepEqual((await chamar(w.base, Object.assign({}, corpo, { email: 'pessoa@x.com' }), { jwt: 'jwt-adm' })).json,
    { ok: false, erro: 'Este e-mail já tem outra conta. Use um e-mail só para a operação.' });
  assert.deepEqual((await chamar(w.base, Object.assign({}, corpo, { email: 'op@x.com', papel: 'operador' }), { jwt: 'jwt-adm' })).json,
    { ok: true, existente: true, email: 'o***@x***.com' });
  assert.deepEqual(w.operadores.op, [{ cidade: 'rorainopolis-rr', papel: 'operador' }]);
});

test('excluir: só com JWT e "EXCLUIR"; conta que também é do painel DISC não é apagada por aqui', async () => {
  const w = preparar({ usuarios: [{ id: 'p', email: 'p@x.com', confirmada: true, app: { produto: 'vagas' }, conta: { tipo: 'pessoa' } },
    { id: 'adm', email: 'a@x.com', confirmada: true, app: {}, conta: { tipo: 'operador' } }],
  admins: ['adm'], jwts: { 'jwt-p': 'p', 'jwt-adm': 'adm' } });
  assert.deepEqual((await chamar(w.base, { acao: 'excluir', confirmar: 'EXCLUIR' })).json, { ok: false, erro: 'Sessão expirada. Entre de novo.', sessaoExpirada: true });
  assert.deepEqual((await chamar(w.base, { acao: 'excluir', confirmar: 'sim' }, { jwt: 'jwt-p' })).json, { ok: false, erro: 'Para excluir, digite EXCLUIR.' });
  assert.deepEqual((await chamar(w.base, { acao: 'excluir', confirmar: 'EXCLUIR' }, { jwt: 'jwt-adm' })).json,
    { ok: false, erro: 'Esta conta também acessa o painel DISC. Fale com a Gestão sem Caos para excluir.' });
  assert.deepEqual((await chamar(w.base, { acao: 'excluir', confirmar: 'EXCLUIR' }, { jwt: 'jwt-p' })).json, { ok: true, excluida: true });
  assert.deepEqual(w.excluidos, ['p']);
  assert.deepEqual(w.removidos, [{ bucket: 'vagas-fotos', caminhos: ['p/foto.jpg'] }], 'a foto sai junto com a conta');
  // Storage falhou ao apagar a foto: a conta NÃO é apagada (a foto ficaria órfã) e a resposta é o erro genérico, sem detalhe.
  const q = preparar({ usuarios: [{ id: 'p', email: 'p@x.com', confirmada: true, app: { produto: 'vagas' }, conta: { tipo: 'pessoa' } }],
    jwts: { 'jwt-p': 'p' }, removerFalha: true });
  assert.deepEqual((await chamar(q.base, { acao: 'excluir', confirmar: 'EXCLUIR' }, { jwt: 'jwt-p' })).json,
    { ok: false, erro: 'Erro interno no servidor. Tente novamente em instantes.' });
  assert.deepEqual(q.excluidos, [], 'conta intacta quando a foto não pôde ser apagada');
});

test('foto: só com JWT; o banco decide (vagas_conta_foto); URL assinada de 5 minutos só quando ele deixa', async () => {
  const pode = (u, c) => (u === 'emp' && c === '11111111-2222-3333-4444-555555555555') || (u === 'p' && c === null)
    ? { ok: true, caminho: 'p/foto.jpg' } : { ok: false, erro: 'A foto só aparece depois do Combinou.', semCombinou: true };
  const w = preparar({ jwts: { 'jwt-emp': 'emp', 'jwt-outra': 'outra', 'jwt-p': 'p' }, foto: pode });
  assert.deepEqual((await chamar(w.base, { acao: 'foto', candidatura: '11111111-2222-3333-4444-555555555555' })).json,
    { ok: false, erro: 'Sessão expirada. Entre de novo.', sessaoExpirada: true });
  assert.deepEqual((await chamar(w.base, { acao: 'foto', candidatura: 'x' }, { jwt: 'jwt-emp' })).json, { ok: false, erro: 'Candidatura não encontrada.' });
  assert.deepEqual((await chamar(w.base, { acao: 'foto', candidatura: '11111111-2222-3333-4444-555555555555' }, { jwt: 'jwt-outra' })).json,
    { ok: false, erro: 'A foto só aparece depois do Combinou.', semCombinou: true });
  assert.equal(w.assinadas.length, 0, 'nada assinado sem o sim do banco');
  const r = (await chamar(w.base, { acao: 'foto', candidatura: '11111111-2222-3333-4444-555555555555' }, { jwt: 'jwt-emp' })).json;
  assert.equal(r.ok, true);
  assert.equal(r.url, 'https://p.supabase.co/storage/v1/object/sign/vagas-fotos/p/foto.jpg?token=t');
  assert.ok(Date.parse(r.expiraEm) > Date.now());
  assert.deepEqual(w.assinadas, [{ bucket: 'vagas-fotos', caminho: 'p/foto.jpg', segundos: 300 }]);
  assert.equal((await chamar(w.base, { acao: 'foto' }, { jwt: 'jwt-p' })).json.ok, true, 'a própria foto');
  assert.deepEqual(w.fotosPedidas.map((x) => [x.userId, x.candidatura]), [['outra', '11111111-2222-3333-4444-555555555555'],
    ['emp', '11111111-2222-3333-4444-555555555555'], ['p', null]]);
});

// Convite de equipe: o banco (vagas_conta_convite_equipe) decide e diz o destino; aqui, o banco falso responde como ele.
const EMPRESA = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'ab'.repeat(32);
const CONVITE = { id: '99999999-2222-4333-8444-555555555555', email: 'x', papel: 'recrutador', status: 'pendente',
  criadoEm: '2026-10-14T12:00:00.000Z', expiraEm: '2026-10-17T12:00:00.000Z' };
const respostaBanco = (destino, email) => ({ ok: true, convite: Object.assign({}, CONVITE, { email }), token: TOKEN, destino,
  empresaNome: 'Loja <Teste>', cidadeNome: 'Cidade Exemplo', convidadoPor: 'Dona Exemplo' });

test('convite_equipe: só com JWT; e-mail e empresa conferidos antes; o banco decide a permissão e o erro dele volta só com a mensagem', async () => {
  const w = preparar({ jwts: { 'jwt-dono': 'dono', 'jwt-rec': 'rec' }, convite: (u) => (u === 'rec'
    ? { ok: false, erro: 'Só quem é dono(a) da conta da empresa pode convidar pessoas para a equipe.', token: TOKEN, destino: 'nova' }
    : { ok: false, erro: 'Muitos convites hoje. Tente de novo amanhã.', bloqueado: true }) });
  const corpo = { acao: 'convite_equipe', empresaId: EMPRESA, email: 'nova@x.com' };
  assert.deepEqual((await chamar(w.base, corpo)).json, { ok: false, erro: 'Sessão expirada. Entre de novo.', sessaoExpirada: true });
  assert.deepEqual((await chamar(w.base, Object.assign({}, corpo, { email: 'x' }), { jwt: 'jwt-dono' })).json, { ok: false, erro: 'E-mail inválido.' });
  assert.deepEqual((await chamar(w.base, Object.assign({}, corpo, { empresaId: '1; drop' }), { jwt: 'jwt-dono' })).json, { ok: false, erro: 'Empresa não encontrada.' });
  assert.deepEqual(w.convites, [], 'nada chega ao banco sem login, e-mail e empresa válidos');
  const rec = (await chamar(w.base, corpo, { jwt: 'jwt-rec' })).json;
  assert.deepEqual(rec, { ok: false, erro: 'Só quem é dono(a) da conta da empresa pode convidar pessoas para a equipe.' }, 'token e destino nunca saem');
  assert.deepEqual((await chamar(w.base, corpo, { jwt: 'jwt-dono' })).json, { ok: false, erro: 'Muitos convites hoje. Tente de novo amanhã.', bloqueado: true });
  assert.deepEqual(w.convites[0], { userId: 'rec', empresaId: EMPRESA, email: 'nova@x.com', cf: '', xff: '203.0.113.9, 10.0.0.1' });
  assert.equal(w.enviados.length, 0);
  const sem = preparar({ env: { RESEND_API_KEY: '' }, jwts: { 'jwt-dono': 'dono' } });
  assert.deepEqual((await chamar(sem.base, corpo, { jwt: 'jwt-dono' })).json, { ok: false, erro: VAGAS_MSG_EMAIL_NAO_CONFIGURADO, naoConfigurado: true });
  assert.deepEqual(sem.convites, [], 'sem e-mail configurado, nenhum convite é criado');
});

test('convite_equipe: resposta NEUTRA (igual para conta nova, de empresa, pendente, de outro tipo ou do painel); e-mail certo para cada caso; token só no e-mail', async () => {
  const destinos = { 'nova@x.com': 'nova', 'empresa@x.com': 'empresa', 'pendente@x.com': 'empresa_pendente', 'pessoa@x.com': 'outro_tipo',
    'dono@gestaosemcaos.com.br': 'nenhum' };
  const w = preparar({ jwts: { 'jwt-dono': 'dono' }, convite: (u, e, email) => respostaBanco(destinos[email], email),
    usuarios: [{ id: 'emp', email: 'empresa@x.com', confirmada: true, app: { produto: 'vagas' }, conta: { tipo: 'empresa', status: 'ativa' } },
      { id: 'pen', email: 'pendente@x.com', confirmada: false, app: { produto: 'vagas' }, conta: { tipo: 'empresa' } }] });
  const respostas = [];
  for (const email of Object.keys(destinos)) {
    const r = (await chamar(w.base, { acao: 'convite_equipe', empresaId: EMPRESA, email: ' ' + email.toUpperCase() + ' ' }, { jwt: 'jwt-dono' })).json;
    assert.ok(!JSON.stringify(r).includes(TOKEN), 'o token nunca vai para o navegador');
    assert.ok(!/"destino"|outro_tipo|empresa_pendente|"nenhum"|"nova"/.test(JSON.stringify(r)), 'nem o destino');
    respostas.push(Object.assign({}, r, { email: 'x', convite: Object.assign({}, r.convite, { email: 'x' }) }));
  }
  for (const r of respostas) assert.deepEqual(r, respostas[0]);
  assert.deepEqual(respostas[0], { ok: true, enviado: true, mensagem: VAGAS_MSG_CONVITE_EQUIPE, email: 'x', convite: Object.assign({}, CONVITE, { email: 'x' }) });
  // Conta nova: nasce pendente, de empresa, sem senha conhecida; o link confirma o e-mail, cria a senha e leva o convite.
  const nova = w.usuarios.find((u) => u.email === 'nova@x.com');
  assert.deepEqual(nova.app, { produto: 'vagas', tipo: 'empresa', convite: true });
  assert.deepEqual(w.contas[nova.id], { status: 'pendente', tipo: 'empresa' });
  assert.deepEqual(w.links, [{ tipo: 'invite', email: 'nova@x.com' }, { tipo: 'invite', email: 'pendente@x.com' }]);
  const porPara = Object.fromEntries(w.enviados.map((e) => [e.to[0], e]));
  assert.deepEqual(Object.keys(porPara).sort(), ['empresa@x.com', 'nova@x.com', 'pendente@x.com', 'pessoa@x.com'], 'conta só do painel: nada é enviado');
  assert.ok(porPara['nova@x.com'].text.includes(SITE + '/entrar.html?token_hash=hash1abcdefghijklmnop&type=invite&convite=' + TOKEN));
  assert.ok(porPara['pendente@x.com'].text.includes(SITE + '/entrar.html?token_hash=hash2abcdefghijklmnop&type=invite&convite=' + TOKEN));
  assert.ok(porPara['empresa@x.com'].text.includes(SITE + '/entrar.html?convite=' + TOKEN));
  assert.ok(!porPara['empresa@x.com'].text.includes('token_hash'), 'quem já tem conta só entra e aceita');
  assert.ok(!porPara['pessoa@x.com'].text.includes(TOKEN), 'conta de outro tipo: sem convite que funcione, só a explicação');
  assert.match(porPara['pessoa@x.com'].text, /outro tipo/);
  for (const e of Object.values(porPara)) {
    assert.equal(e.subject, 'Convite para a equipe de Loja <Teste> — Vagas sem Caos');
    assert.match(e.text, /Dona Exemplo, da empresa Loja <Teste>, convidou você para a equipe dela no Vagas sem Caos, em Cidade Exemplo\./);
    assert.ok(e.html.includes('Loja &lt;Teste&gt;') && !e.html.includes('Loja <Teste>'), 'nome da empresa escapado');
    assert.ok(!/notus/i.test(e.html + e.text));
  }
  assert.match(porPara['nova@x.com'].text, /vale por 3 dias e funciona uma vez só/);
});

test('convite_equipe: erro genérico quando o envio ou o registro falham (sem detalhe, sem conta pela metade)', async () => {
  const resend = preparar({ jwts: { 'jwt-dono': 'dono' }, resendFalha: true, convite: (u, e, email) => respostaBanco('empresa', email) });
  assert.deepEqual((await chamar(resend.base, { acao: 'convite_equipe', empresaId: EMPRESA, email: 'a@x.com' }, { jwt: 'jwt-dono' })).json,
    { ok: false, erro: 'Erro interno no servidor. Tente novamente em instantes.' });
  const reg = preparar({ jwts: { 'jwt-dono': 'dono' }, registroFalha: true, convite: (u, e, email) => respostaBanco('nova', email) });
  assert.deepEqual((await chamar(reg.base, { acao: 'convite_equipe', empresaId: EMPRESA, email: 'b@x.com' }, { jwt: 'jwt-dono' })).json,
    { ok: false, erro: 'Erro interno no servidor. Tente novamente em instantes.' });
  assert.deepEqual(reg.excluidos, ['novo-1'], 'o usuário criado pela metade é apagado');
  assert.equal(reg.enviados.length, 0);
  const semToken = preparar({ jwts: { 'jwt-dono': 'dono' }, convite: () => ({ ok: true, convite: CONVITE, token: '', destino: 'empresa' }) });
  assert.deepEqual((await chamar(semToken.base, { acao: 'convite_equipe', empresaId: EMPRESA, email: 'c@x.com' }, { jwt: 'jwt-dono' })).json,
    { ok: false, erro: 'Erro interno no servidor. Tente novamente em instantes.' });
  assert.equal(linkConviteEquipe({}, TOKEN, null), SITE + '/entrar.html?convite=' + TOKEN);
  assert.equal(linkConviteEquipe({}, TOKEN, { hash: 'h1', tipo: 'magiclink' }), SITE + '/entrar.html?token_hash=h1&type=magiclink&convite=' + TOKEN);
});

test('HTTP: CORS só do site do Vagas, do painel do DISC e localhost, OPTIONS, método, corpo, ação desconhecida e erro interno sem detalhes', async () => {
  const w = preparar();
  assert.equal((await chamar(w.base, { acao: 'x' }, { origem: 'https://golpe.example' })).cors, null);
  assert.equal((await chamar(w.base, { acao: 'x' }, { origem: 'http://localhost:4321' })).cors, 'http://localhost:4321');
  // Pedido da operação (onda 2): o painel do DISC convida operador pela aba "Vagas"; o token da equipe continua obrigatório.
  assert.equal((await chamar(w.base, { acao: 'x' }, { origem: 'https://disc.gestaosemcaos.com.br' })).cors, 'https://disc.gestaosemcaos.com.br');
  assert.equal((await chamar(w.base, { acao: 'x' }, { origem: 'https://disc.gestaosemcaos.com.br.golpe.example' })).cors, null);
  const opt = await chamar(w.base, null, { metodo: 'OPTIONS' });
  assert.equal(opt.status, 204);
  assert.equal((await chamar(w.base, null, { metodo: 'GET' })).status, 405);
  assert.deepEqual((await chamar(w.base, '')).json, { ok: false, erro: 'Requisição vazia.' });
  assert.deepEqual((await chamar(w.base, '{x')).json, { ok: false, erro: 'JSON inválido.' });
  assert.deepEqual((await chamar(w.base, '[]')).json, { ok: false, erro: 'Formato de requisição inválido.' });
  assert.deepEqual((await chamar(w.base, 'x'.repeat(5000))).json, { ok: false, erro: 'Requisição grande demais.' });
  assert.deepEqual((await chamar(w.base, { acao: 'apagar' })).json, { ok: false, erro: 'Ação desconhecida.' });
  const quebra = preparar({ resendFalha: true });
  const r = await chamar(quebra.base, { acao: 'cadastrar', email: 'a@b.com', tipo: 'pessoa', termosVersao: '1' });
  assert.deepEqual(r.json, { ok: false, erro: 'Erro interno no servidor. Tente novamente em instantes.' });
});

test('peças: e-mails com a marca, máscara, link, CORS, ambiente e o adaptador do supabase-js', async () => {
  for (const tipo of ['confirmar', 'jaTemConta', 'senha', 'assistido', 'operador', 'conviteEquipe', 'conviteEquipeOutraConta']) {
    const m = montarEmailVagas(tipo, { url: SITE + '/entrar.html?x=<y>', nome: '<b>Ana</b>', empresa: '<i>Loja</i>', quem: '<s>Bia</s>' });
    assert.match(m.assunto, /— Vagas sem Caos$/);
    assert.ok(!m.html.includes('<b>Ana</b>') && !m.html.includes('<i>Loja</i>') && !m.html.includes('<s>Bia</s>'), 'nome escapado');
    assert.ok(m.html.includes('Gestão sem Caos'));
    assert.ok(!/notus/i.test(m.html + m.texto));
  }
  assert.equal(mascararEmailVagas('ana.souza@empresa.com.br'), 'a***@e***.com.br');
  assert.equal(linkVagas({}, 'abc', 'recovery'), SITE + '/entrar.html?token_hash=abc&type=recovery');
  assert.equal(linkVagas({ VAGAS_SITE_URL: 'https://vagas-gestaosemcaos.pages.dev/' }, 'abc', 'invite'), 'https://vagas-gestaosemcaos.pages.dev/entrar.html?token_hash=abc&type=invite');
  assert.equal(vagasCors(new Request('https://x', { headers: { origin: SITE } }), {})['Access-Control-Allow-Origin'], SITE);
  // O painel do DISC (convite de operador pela aba "Vagas") também lê a resposta; qualquer outra origem, não.
  const cors = (origin, env) => vagasCors(new Request('https://x', { headers: { origin } }), env || {})['Access-Control-Allow-Origin'];
  assert.equal(cors('https://disc.gestaosemcaos.com.br'), 'https://disc.gestaosemcaos.com.br');
  assert.equal(cors('https://painel.exemplo.com', { SITE_URL: 'https://painel.exemplo.com/' }), 'https://painel.exemplo.com');
  assert.equal(cors('https://disc.gestaosemcaos.com.br', { SITE_URL: 'https://painel.exemplo.com' }), undefined);
  assert.equal(cors('https://golpe.exemplo.com'), undefined);
  assert.equal(cors('http://localhost:4315'), 'http://localhost:4315');
  assert.deepEqual(Object.keys(lerEnvVagasConta(() => ' v ')).sort(), ['EMAIL_REMETENTE', 'RESEND_API_KEY', 'SITE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL',
    'TURNSTILE_SECRET', 'VAGAS_EMAIL_REMETENTE', 'VAGAS_SITE_URL']);
  // Adaptador real com um supabase-js falso: chama as RPCs certas e o admin do Auth com os parâmetros certos.
  const chamadas = [];
  const sbFalso = {
    rpc: async (nome, args) => { chamadas.push(['rpc', nome, args]); return { data: { ok: true, existe: false }, error: null }; },
    auth: {
      admin: {
        createUser: async (a) => { chamadas.push(['createUser', a]); return { data: { user: { id: 'u1' } }, error: null }; },
        generateLink: async (a) => { chamadas.push(['generateLink', a]); return { data: { properties: { hashed_token: 'h1' } }, error: null }; },
        deleteUser: async (id) => { chamadas.push(['deleteUser', id]); return { error: null }; }
      },
      getUser: async (jwt) => ({ data: { user: jwt === 'ok' ? { id: 'u9', email: 'x@y.com' } : null }, error: null })
    },
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (caminho, seg) => { chamadas.push(['assinar', bucket, caminho, seg]); return { data: { signedUrl: 'https://u' }, error: null }; },
        remove: async (caminhos) => { chamadas.push(['remover', bucket, caminhos]); return { data: [], error: null }; }
      })
    }
  };
  const b = criarBaseVagasConta(() => sbFalso, (n) => ({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }[n] || ''));
  await b.db.limite('cadastrar', '1.2.3.4', '', 'a@b.com', null);
  await b.db.consultar('a@b.com');
  await b.db.registrar('u1', { tipo: 'pessoa' });
  await b.db.quem('u1');
  assert.deepEqual(await b.auth.criarUsuario({ email: 'a@b.com', senha: 's', app: { produto: 'vagas', tipo: 'pessoa' }, usuario: {} }), { id: 'u1' });
  assert.equal(await b.auth.gerarLink('invite', 'a@b.com'), 'h1');
  assert.deepEqual(await b.auth.usuarioDoToken('ok'), { id: 'u9', email: 'x@y.com' });
  assert.equal(await b.auth.usuarioDoToken('ruim'), null);
  await b.auth.excluirUsuario('u1');
  await b.db.foto('u1', null);
  assert.equal(await b.storage.assinar('vagas-fotos', 'u1/foto.jpg', 300), 'https://u');
  await b.storage.remover('vagas-fotos', ['u1/foto.jpg']);
  await b.db.conviteEquipe('u1', EMPRESA, 'a@b.com', '1.2.3.4', '');
  assert.deepEqual(chamadas.map((c) => c[0] === 'rpc' ? c[1] : c[0]), ['vagas_conta_limite', 'vagas_conta_consultar', 'vagas_conta_registrar',
    'vagas_conta_quem', 'createUser', 'generateLink', 'deleteUser', 'vagas_conta_foto', 'assinar', 'remover', 'vagas_conta_convite_equipe']);
  assert.deepEqual(chamadas[10][2], { p_user: 'u1', p_empresa: EMPRESA, p_email: 'a@b.com', p_cf: '1.2.3.4', p_xff: '' });
  assert.deepEqual(chamadas[7][2], { p_user: 'u1', p_candidatura: null });
  assert.deepEqual(chamadas[8], ['assinar', 'vagas-fotos', 'u1/foto.jpg', 300]);
  assert.deepEqual(chamadas[0][2], { p_acao: 'cadastrar', p_cf: '1.2.3.4', p_xff: '', p_email: 'a@b.com', p_ator: null });
  assert.deepEqual(chamadas[4][1], { email: 'a@b.com', password: 's', email_confirm: false, app_metadata: { produto: 'vagas', tipo: 'pessoa' }, user_metadata: {} });
  assert.deepEqual(chamadas[5][1], { type: 'invite', email: 'a@b.com' });
});
