// Edge Function "vagas-conta" (contas do Vagas sem Caos) com Auth, banco, Resend e Turnstile FALSOS (nenhuma chamada real):
// resposta neutra (não revela se o e-mail existe), senha criada só no clique do link, nunca mexe em conta do painel DISC,
// cadastro assistido só por operador(a) da cidade ou equipe, convite de operação só pela equipe, exclusão com confirmação.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atenderVagasConta, montarEmailVagas, mascararEmailVagas, linkVagas, vagasCors, lerEnvVagasConta, criarBaseVagasConta,
  VAGAS_MSG_ENVIADO, VAGAS_MSG_EMAIL_NAO_CONFIGURADO, VAGAS_MSG_CAPTCHA, VAGAS_MSG_TERMOS, VAGAS_MSG_JA_EXISTE
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
      if (contas[userId] && contas[userId].tipo !== dados.tipo) return { ok: false, erro: 'Este e-mail já tem uma conta de outro tipo.' };
      contas[userId] = Object.assign({ status: 'pendente' }, contas[userId] || {}, dados);
      if (dados.operador) operadores[userId] = [{ cidade: dados.operador.cidade, papel: dados.operador.papel }];
      return { ok: true, userId, tipo: dados.tipo };
    },
    async quem(userId) {
      return { ok: true, admin: admins.has(userId), conta: contas[userId] ? { tipo: contas[userId].tipo, status: 'ativa' } : null,
        operador: operadores[userId] || [] };
    }
  };
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
  const base = { env, fetch, db, auth, aleatorio: () => 'senha-aleatoria-' + (n + 1) };
  return { base, usuarios, contas, operadores, links, enviados, captchas, chamadasLimite, excluidos };
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
});

test('HTTP: CORS só do site do Vagas e localhost, OPTIONS, método, corpo, ação desconhecida e erro interno sem detalhes', async () => {
  const w = preparar();
  assert.equal((await chamar(w.base, { acao: 'x' }, { origem: 'https://golpe.example' })).cors, null);
  assert.equal((await chamar(w.base, { acao: 'x' }, { origem: 'http://localhost:4321' })).cors, 'http://localhost:4321');
  assert.equal((await chamar(w.base, { acao: 'x' }, { origem: 'https://disc.gestaosemcaos.com.br' })).cors, null);
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
  for (const tipo of ['confirmar', 'jaTemConta', 'senha', 'assistido', 'operador']) {
    const m = montarEmailVagas(tipo, { url: SITE + '/entrar.html?x=<y>', nome: '<b>Ana</b>' });
    assert.match(m.assunto, /— Vagas sem Caos$/);
    assert.ok(!m.html.includes('<b>Ana</b>'), 'nome escapado');
    assert.ok(m.html.includes('Gestão sem Caos'));
    assert.ok(!/notus/i.test(m.html + m.texto));
  }
  assert.equal(mascararEmailVagas('ana.souza@empresa.com.br'), 'a***@e***.com.br');
  assert.equal(linkVagas({}, 'abc', 'recovery'), SITE + '/entrar.html?token_hash=abc&type=recovery');
  assert.equal(linkVagas({ VAGAS_SITE_URL: 'https://vagas-gestaosemcaos.pages.dev/' }, 'abc', 'invite'), 'https://vagas-gestaosemcaos.pages.dev/entrar.html?token_hash=abc&type=invite');
  assert.equal(vagasCors(new Request('https://x', { headers: { origin: SITE } }), {})['Access-Control-Allow-Origin'], SITE);
  assert.deepEqual(Object.keys(lerEnvVagasConta(() => ' v ')).sort(), ['EMAIL_REMETENTE', 'RESEND_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL',
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
  assert.deepEqual(chamadas.map((c) => c[0] === 'rpc' ? c[1] : c[0]), ['vagas_conta_limite', 'vagas_conta_consultar', 'vagas_conta_registrar',
    'vagas_conta_quem', 'createUser', 'generateLink', 'deleteUser']);
  assert.deepEqual(chamadas[0][2], { p_acao: 'cadastrar', p_cf: '1.2.3.4', p_xff: '', p_email: 'a@b.com', p_ator: null });
  assert.deepEqual(chamadas[4][1], { email: 'a@b.com', password: 's', email_confirm: false, app_metadata: { produto: 'vagas', tipo: 'pessoa' }, user_metadata: {} });
  assert.deepEqual(chamadas[5][1], { type: 'invite', email: 'a@b.com' });
});
