// Edge Function "chave-acesso" (chave de acesso do painel) de ponta a ponta com um "aparelho" de mentira (chave P-256 gerada aqui,
// que assina como o Touch ID assinaria) e a SimpleWebAuthn de verdade: criar em Segurança, entrar sem senha (devolve o token do
// link mágico da MESMA conta), desafio que não vale duas vezes, outro domínio, quem deixou de ser admin, só admin cria/lista/tira,
// limite de aparelhos e tirar. Banco e Auth são falsos (memória). Sem a biblioteca instalada o teste é pulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { atenderChaveAcesso, chaveOrigens, chaveApelido } from '../../supabase/funcoes-compartilhadas/chave-acesso.js';

let webauthn = null;
try { webauthn = await import('@simplewebauthn/server'); } catch (e) { /* sem a biblioteca: pula */ }
const pular = webauthn ? false : 'rode npm install (falta @simplewebauthn/server)';

const SITE = 'https://disc.gestaosemcaos.com.br';
const RP = 'disc.gestaosemcaos.com.br';
const ANA = { id: 'aaaaaaaa-0000-4000-8000-0000000000a1', email: 'ana@gestaosemcaos.com.br' };

// ---- CBOR mínimo (atestado "none" e chave COSE) ----
function cabeca(tipo, n) {
  if (n < 24) return Buffer.from([(tipo << 5) | n]);
  if (n < 256) return Buffer.from([(tipo << 5) | 24, n]);
  const b = Buffer.alloc(3); b[0] = (tipo << 5) | 25; b.writeUInt16BE(n, 1); return b;
}
function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? cabeca(0, v) : cabeca(1, -1 - v);
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return Buffer.concat([cabeca(3, b.length), b]); }
  if (Buffer.isBuffer(v)) return Buffer.concat([cabeca(2, v.length), v]);
  if (v instanceof Map) return Buffer.concat([cabeca(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error('tipo');
}
const b64 = (b) => b.toString('base64url');

function aparelho(rpId, origem) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credId = randomBytes(16);
  const rpHash = createHash('sha256').update(rpId).digest();
  let usos = 0;
  const cliente = (tipo, desafio) => Buffer.from(JSON.stringify({ type: tipo, challenge: desafio, origin: origem, crossOrigin: false }));
  return {
    id: b64(credId),
    criar(desafio) {
      const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
      const tam = Buffer.alloc(2); tam.writeUInt16BE(credId.length);
      const authData = Buffer.concat([rpHash, Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), tam, credId, cose]); // UP + UV + AT
      const att = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
      return { id: b64(credId), rawId: b64(credId), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: b64(cliente('webauthn.create', desafio)), attestationObject: b64(att), transports: ['internal'] } };
    },
    entrar(desafio) {
      const n = Buffer.alloc(4); n.writeUInt32BE(++usos);
      const authData = Buffer.concat([rpHash, Buffer.from([0x05]), n]);
      const cd = cliente('webauthn.get', desafio);
      const assinatura = sign('sha256', Buffer.concat([authData, createHash('sha256').update(cd).digest()]), privateKey);
      return { id: b64(credId), rawId: b64(credId), type: 'public-key', clientExtensionResults: {},
        response: { clientDataJSON: b64(cd), authenticatorData: b64(authData), signature: b64(assinatura) } };
    }
  };
}

/** mundo falso: tabelas em memória + Auth com o JWT "jwt-ana" */
function mundo(op) {
  op = op || {};
  const st = { chaves: [], desafios: [], seq: 0, admins: new Set(op.admins || [ANA.id]), links: [] };
  const base = {
    env: { SITE_URL: SITE },
    webauthn,
    async autenticar(authorization) {
      if (authorization === 'Bearer jwt-ana') return { usuario: { id: ANA.id, email: ANA.email }, eAdmin: st.admins.has(ANA.id) };
      if (authorization === 'Bearer jwt-gestor') return { usuario: { id: 'bbbbbbbb-0000-4000-8000-0000000000b2', email: 'g@x.com' }, eAdmin: false };
      return null;
    },
    db: {
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
      async eAdmin(u) { return st.admins.has(u); },
      async emailDe(u) { return u === ANA.id ? ANA.email : null; },
      async tokenDeEntrada(email) { st.links.push(email); return 'hash-' + email; }
    }
  };
  async function pedir(corpo, o) {
    o = o || {};
    const headers = { 'content-type': 'application/json', origin: o.origem || SITE, 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };
    if (o.jwt) headers.authorization = 'Bearer ' + o.jwt;
    const r = await atenderChaveAcesso(new Request('https://x.supabase.co/functions/v1/chave-acesso', { method: 'POST', headers, body: JSON.stringify(corpo) }), base);
    return { status: r.status, corpo: await r.json() };
  }
  return { st, pedir };
}

async function criarChave(m, ap) {
  const o = await m.pedir({ acao: 'criar-opcoes' }, { jwt: 'jwt-ana' });
  assert.equal(o.status, 200);
  assert.equal(o.corpo.rp.id, RP);
  assert.equal(o.corpo.authenticatorSelection.residentKey, 'required');
  return m.pedir({ acao: 'criar', resposta: ap.criar(o.corpo.challenge) }, { jwt: 'jwt-ana' });
}
async function entrar(m, ap, origem) {
  const o = await m.pedir({ acao: 'entrar-opcoes' }, { origem });
  assert.equal(o.status, 200);
  return { desafio: o.corpo.challenge, enviar: (resp) => m.pedir({ acao: 'entrar', resposta: resp }, { origem }) };
}

test('origens e apelidos', () => {
  assert.deepEqual(chaveOrigens({ SITE_URL: SITE + '/' }), [SITE]);
  assert.deepEqual(chaveOrigens({ SITE_URL: 'http://x.com', CHAVE_ACESSO_ORIGENS: 'http://localhost:8080, ' }), ['http://localhost:8080']);
  assert.equal(chaveApelido('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'), 'iPhone');
  assert.equal(chaveApelido('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'Mac');
  assert.equal(chaveApelido(''), 'Este aparelho');
});

test('cria a chave em Segurança, entra sem senha (token da mesma conta) e tira o aparelho', { skip: pular }, async () => {
  const m = mundo();
  const ap = aparelho(RP, SITE);
  const c = await criarChave(m, ap);
  assert.equal(c.status, 200);
  assert.equal(c.corpo.aparelhos.length, 1);
  assert.equal(c.corpo.aparelhos[0].apelido, 'Mac');
  assert.ok(!JSON.stringify(c.corpo).includes('chave_publica'), 'não devolve a chave guardada');

  const e = await entrar(m, ap, SITE);
  const r = await e.enviar(ap.entrar(e.desafio));
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo, { ok: true, token_hash: 'hash-' + ANA.email });
  assert.ok(m.st.chaves[0].usado_em, 'registra o último uso');
  assert.equal(m.st.chaves[0].contador, 1);

  const l = await m.pedir({ acao: 'listar' }, { jwt: 'jwt-ana' });
  assert.equal(l.corpo.aparelhos.length, 1);
  const t = await m.pedir({ acao: 'tirar', id: l.corpo.aparelhos[0].id }, { jwt: 'jwt-ana' });
  assert.deepEqual(t.corpo, { ok: true, aparelhos: [] });
  const e2 = await entrar(m, ap, SITE);
  assert.equal((await e2.enviar(ap.entrar(e2.desafio))).status, 401, 'aparelho tirado não entra');
});

test('o desafio vale uma vez só, e o inventado não vale', { skip: pular }, async () => {
  const m = mundo();
  const ap = aparelho(RP, SITE);
  await criarChave(m, ap);
  const e = await entrar(m, ap, SITE);
  const resp = ap.entrar(e.desafio);
  assert.equal((await e.enviar(resp)).status, 200);
  const repetido = await e.enviar(resp);
  assert.equal(repetido.status, 401);
  assert.equal(repetido.corpo.token_hash, undefined);
  const inventado = await m.pedir({ acao: 'entrar', resposta: ap.entrar(Buffer.from('desafio-que-ninguem-pediu').toString('base64url')) });
  assert.equal(inventado.status, 401);
  assert.equal(m.st.links.length, 1, 'só uma entrada gerou token');
});

test('desafio vencido (mais de 5 minutos) não vale', { skip: pular }, async () => {
  const m = mundo();
  const ap = aparelho(RP, SITE);
  await criarChave(m, ap);
  const e = await entrar(m, ap, SITE);
  m.st.desafios.forEach((d) => { d.expira_em = new Date(Date.now() - 1000).toISOString(); });
  assert.equal((await e.enviar(ap.entrar(e.desafio))).status, 401);
});

test('chave assinada por outro aparelho, ou feita para outro domínio, não entra', { skip: pular }, async () => {
  const m = mundo();
  const ap = aparelho(RP, SITE);
  await criarChave(m, ap);
  const e = await entrar(m, ap, SITE);
  const falso = aparelho(RP, SITE);
  const resp = falso.entrar(e.desafio);
  resp.id = resp.rawId = ap.id; // finge ser o aparelho da Ana, mas assina com outra chave
  assert.equal((await e.enviar(resp)).status, 401);
  const e2 = await entrar(m, ap, SITE);
  const phishing = aparelho('disc.gestaosemcaos.com.br.falso.com', 'https://disc.gestaosemcaos.com.br.falso.com');
  phishing.entrar(e2.desafio);
  const r = ap.entrar(e2.desafio);
  const cd = JSON.parse(Buffer.from(r.response.clientDataJSON, 'base64url').toString());
  cd.origin = 'https://disc.gestaosemcaos.com.br.falso.com';
  r.response.clientDataJSON = Buffer.from(JSON.stringify(cd)).toString('base64url');
  assert.equal((await e2.enviar(r)).status, 401);
  assert.equal(m.st.links.length, 0);
});

test('origem não permitida é recusada (e não ganha CORS)', { skip: pular }, async () => {
  const m = mundo();
  const r = await m.pedir({ acao: 'entrar-opcoes' }, { origem: 'https://outro-site.com' });
  assert.equal(r.status, 403);
});

test('quem deixou de ser admin não entra mais com a chave', { skip: pular }, async () => {
  const m = mundo();
  const ap = aparelho(RP, SITE);
  await criarChave(m, ap);
  m.st.admins.delete(ANA.id);
  const e = await entrar(m, ap, SITE);
  assert.equal((await e.enviar(ap.entrar(e.desafio))).status, 401);
  assert.equal(m.st.links.length, 0);
});

test('criar, listar e tirar exigem a sessão de um admin', { skip: pular }, async () => {
  const m = mundo();
  for (const acao of ['criar-opcoes', 'criar', 'listar', 'tirar']) {
    assert.equal((await m.pedir({ acao })).status, 401, acao + ' sem sessão');
    assert.equal((await m.pedir({ acao }, { jwt: 'jwt-gestor' })).status, 401, acao + ' sem ser admin');
  }
});

test('uma pessoa não tira o aparelho de outra', { skip: pular }, async () => {
  const m = mundo({ admins: [ANA.id] });
  await criarChave(m, aparelho(RP, SITE));
  m.st.chaves[0].user_id = 'cccccccc-0000-4000-8000-0000000000c3'; // a chave é de outra pessoa
  await m.pedir({ acao: 'tirar', id: m.st.chaves[0].id }, { jwt: 'jwt-ana' });
  assert.equal(m.st.chaves.length, 1);
});

test('limite de 10 aparelhos e o mesmo aparelho não é cadastrado duas vezes', { skip: pular }, async () => {
  const m = mundo();
  for (let i = 0; i < 10; i++) assert.equal((await criarChave(m, aparelho(RP, SITE))).status, 200);
  const o = await m.pedir({ acao: 'criar-opcoes' }, { jwt: 'jwt-ana' });
  assert.equal(o.status, 422);
  assert.equal(o.corpo.erro, 'limite');
  // desafio de criar não serve para entrar (e vice-versa)
  const ap = aparelho(RP, SITE);
  const o2 = await m.pedir({ acao: 'entrar-opcoes' });
  assert.equal((await m.pedir({ acao: 'criar', resposta: ap.criar(o2.corpo.challenge) }, { jwt: 'jwt-ana' })).status, 422);
});
