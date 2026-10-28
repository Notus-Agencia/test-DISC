// Chave de acesso do painel de ponta a ponta, num Chrome de verdade com um aparelho de digital SIMULADO (WebAuthn virtual do
// Chrome, pelo CDP): entrar com a senha, criar a chave em Segurança, sair, entrar só com a chave e tirar o aparelho.
// O painel roda com o js/api-supabase.js e o supabase-js de verdade; o "Supabase" é falso (rotas abaixo), mas a função
// chave-acesso é a de verdade (supabase/funcoes-compartilhadas/chave-acesso.js com a SimpleWebAuthn), com banco em memória.
const path = require('path');
const crypto = require('crypto');
const { test, expect } = require('@playwright/test');
const { coletarErros, configurar } = require('./util.js');

const SB = 'https://projeto-teste.supabase.co';
const USUARIO = { id: 'aaaaaaaa-0000-4000-8000-0000000000a1', email: 'dona@empresa.com', aud: 'authenticated', role: 'authenticated',
  user_metadata: { nome: 'Dona' }, app_metadata: {} };

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(nome) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: USUARIO.id, email: USUARIO.email, role: 'authenticated', aud: 'authenticated', exp, sessao: nome }) + '.assinatura';
}
function sessao(token) {
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + token, user: USUARIO };
}

/** Supabase falso + a função chave-acesso de verdade. Devolve o estado para o teste conferir. */
async function simularSupabase(page) {
  const { atenderChaveAcesso } = await import(path.join(__dirname, '..', '..', 'supabase', 'funcoes-compartilhadas', 'chave-acesso.js'));
  const webauthn = await import('@simplewebauthn/server');
  const st = { tokens: new Set(), links: new Set(), chaves: [], desafios: [], seq: 0, entradas: { senha: 0, chave: 0 }, chamadasChave: [] };
  const db = {
    async guardarDesafio(desafio, tipo, userId, expiraEm) { st.desafios.push({ desafio, tipo, user_id: userId, expira_em: expiraEm }); },
    async gastarDesafio(desafio, tipo, userId) {
      const i = st.desafios.findIndex((d) => d.desafio === desafio && d.tipo === tipo && (d.user_id || null) === (userId || null) && d.expira_em > new Date().toISOString());
      if (i < 0) return false;
      st.desafios.splice(i, 1); return true;
    },
    async chavePorCredencial(id) { return st.chaves.find((c) => c.credencial_id === id) || null; },
    async chavesDe(u) { return st.chaves.filter((c) => c.user_id === u); },
    async aparelhosDe(u) { return st.chaves.filter((c) => c.user_id === u).map(({ id, apelido, criado_em, usado_em }) => ({ id, apelido, criado_em, usado_em })); },
    async guardarChave(l) { st.chaves.push(Object.assign({ id: ++st.seq, criado_em: new Date().toISOString(), usado_em: null }, l)); },
    async tirarChave(u, id) { st.chaves = st.chaves.filter((c) => !(c.user_id === u && c.id === id)); },
    async usou(id, contador, quando) { const c = st.chaves.find((x) => x.id === id); c.contador = contador; c.usado_em = quando; },
    async eAdmin(u) { return u === USUARIO.id; },
    async emailDe(u) { return u === USUARIO.id ? USUARIO.email : null; },
    async tokenDeEntrada() { const t = crypto.randomBytes(16).toString('hex'); st.links.add(t); return t; }
  };

  await configurar(page, { BACKEND: 'supabase', API_URL: SB, SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon-publica' });
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'content-range' };
  await page.route(SB + '/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (status, corpo, extra) => route.fulfill({ status, headers: Object.assign({}, CORS, extra || {}), contentType: 'application/json', body: JSON.stringify(corpo) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    let corpo = null;
    try { corpo = req.postDataJSON(); } catch (e) { corpo = null; }

    if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      if (corpo.email !== USUARIO.email || corpo.password !== 'senha-forte-1') return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      st.entradas.senha++;
      const t = jwt('senha'); st.tokens.add(t); return json(200, sessao(t));
    }
    if (p === '/auth/v1/token') { const t = jwt('renovada'); st.tokens.add(t); return json(200, sessao(t)); }
    if (p === '/auth/v1/verify') {
      // o token do link mágico vale uma vez só (como no Supabase)
      if (corpo.type !== 'magiclink' || !st.links.has(corpo.token_hash)) return json(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      st.links.delete(corpo.token_hash);
      st.entradas.chave++;
      const t = jwt('chave'); st.tokens.add(t); return json(200, sessao(t));
    }
    if (p === '/auth/v1/user') return json(200, USUARIO);
    if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: CORS });
    if (p === '/rest/v1/rpc/garantir_primeiro_admin') return json(200, { ok: true, admin: true });
    if (p === '/rest/v1/rpc/e_admin') return json(200, true);
    if (p.startsWith('/rest/v1/rpc/')) return json(200, null);
    if (p === '/functions/v1/chave-acesso') {
      const h = req.headers();
      st.chamadasChave.push({ acao: corpo && corpo.acao, comSessao: st.tokens.has(String(h.authorization || '').replace(/^Bearer /, '')) });
      const base = {
        env: { CHAVE_ACESSO_ORIGENS: h.origin },
        webauthn,
        db,
        async autenticar(authorization) {
          const t = String(authorization || '').replace(/^Bearer\s+/, '');
          return st.tokens.has(t) ? { usuario: { id: USUARIO.id, email: USUARIO.email }, eAdmin: true } : null;
        }
      };
      const r = await atenderChaveAcesso(new Request(req.url(), { method: 'POST', headers: { origin: h.origin, authorization: h.authorization || '',
        'content-type': 'application/json', 'user-agent': h['user-agent'] || '' }, body: req.postData() }), base);
      const headers = {}; r.headers.forEach((v, k) => { headers[k] = v; });
      return route.fulfill({ status: r.status, headers, body: await r.text() });
    }
    if (p.startsWith('/functions/v1/')) return json(200, { ok: true });
    if (p.startsWith('/rest/v1/')) {
      const objeto = /vnd\.pgrst\.object/.test(req.headers().accept || '');
      if (req.method() === 'GET' && p === '/rest/v1/admins') return json(200, objeto ? { nome: 'Dona', foto: null } : [{ nome: 'Dona', foto: null }]);
      if (objeto) return json(406, { code: 'PGRST116', message: 'no rows' });
      return json(200, [], { 'content-range': '*/0' });
    }
    return json(404, { message: 'rota falsa sem resposta: ' + p });
  });
  return st;
}

/** Aparelho com digital simulada (o "Touch ID" do Chrome de teste: confirma sozinho). */
async function aparelhoSimulado(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true
  } });
  return { credenciais: async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials };
}

async function abrirSeguranca(page) {
  await page.click('#btn-usuario');
  await page.click('#btn-seguranca');
  await expect(page.locator('#janela-trocar-senha')).toBeVisible();
}

test('chave de acesso: cria em Segurança, entra só com a chave (mesma sessão), a senha segue valendo e tira o aparelho', async ({ page }) => {
  const erros = coletarErros(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  const st = await simularSupabase(page);
  const aparelho = await aparelhoSimulado(page);

  // 1. Entrar com a senha (a tela de entrar é a de sempre: o campo de e-mail ganhou a sugestão da chave)
  await page.goto('/admin.html');
  await expect(page.locator('#form-login')).toBeVisible();
  await expect(page.locator('#campo-email')).toHaveAttribute('autocomplete', 'username webauthn');
  await page.fill('#campo-email', USUARIO.email);
  await page.fill('#campo-senha', 'senha-forte-1');
  await page.click('#btn-entrar');
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
  expect(st.entradas.senha).toBe(1);

  // 2. Segurança: a senha e a chave são partes separadas; criar a chave pede a digital (simulada) e lista o aparelho
  await abrirSeguranca(page);
  await expect(page.locator('#janela-cancelar')).toHaveText('Fechar');
  await expect(page.locator('.chave')).toBeVisible();
  await page.click('#chave-criar');
  await expect(page.locator('#chave-aviso')).toHaveText('Chave de acesso criada. Na próxima vez, toque no campo de e-mail e escolha a chave.');
  await expect(page.locator('#chave-lista > li')).toHaveCount(1);
  expect(st.chaves).toHaveLength(1);
  expect(await aparelho.credenciais()).toHaveLength(1);
  // o mesmo aparelho não cria a segunda
  await page.click('#chave-criar');
  await expect(page.locator('#chave-aviso')).toHaveText('Este aparelho já tem uma chave de acesso.');
  expect(st.chaves).toHaveLength(1);
  await page.click('#janela-cancelar');

  // 3. Sair e entrar SÓ com a chave: sem digitar e-mail nem senha. A chave vem pela sugestão do campo de e-mail; o aparelho
  //    simulado escolhe a chave sozinho (no aparelho de verdade a pessoa toca no campo e escolhe), então o painel volta sozinho.
  await page.click('#btn-usuario');
  await page.click('#btn-sair');
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
  expect(st.entradas.chave).toBe(1);
  expect(st.entradas.senha).toBe(1);
  expect(st.chaves[0].usado_em).toBeTruthy();
  await expect(page.locator('#usuario-nome')).toHaveText('Dona');

  // 4. Tirar o aparelho em Segurança
  await abrirSeguranca(page);
  await expect(page.locator('#chave-lista > li')).toHaveCount(1);
  await expect(page.locator('#chave-lista > li')).toContainText('último uso');
  await page.locator('#chave-lista [data-tirar]').click();
  await expect(page.locator('#chave-aviso')).toHaveText('Chave de acesso tirada.');
  await expect(page.locator('#chave-lista > li')).toHaveCount(0);
  expect(st.chaves).toHaveLength(0);
  await page.click('#janela-cancelar');

  // 5. Sem o aparelho cadastrado a chave não entra, e a senha continua valendo
  await page.click('#btn-usuario');
  await page.click('#btn-sair');
  await expect(page.locator('#form-login')).toBeVisible();
  await page.click('#campo-email');
  await page.waitForTimeout(2000);
  await expect(page.locator('#tela-painel')).toBeHidden();
  expect(st.entradas.chave).toBe(1);
  await page.fill('#campo-email', USUARIO.email);
  await page.fill('#campo-senha', 'senha-forte-1');
  await page.click('#btn-entrar');
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
  expect(st.entradas.senha).toBe(2);

  expect(erros.filter((e) => !/404|406|Failed to load resource/.test(e))).toEqual([]);
});
