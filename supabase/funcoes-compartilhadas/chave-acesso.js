// Chave de acesso (passkey/WebAuthn) do painel DISC — lógica da Edge Function "chave-acesso" (pedido do dono, 27/10/2026).
// Entrar: o navegador oferece a chave na sugestão do campo de e-mail; a função confere a assinatura (SimpleWebAuthn), checa que a
// pessoa ainda é admin e devolve o token do link mágico dela; o navegador troca por sessão com verifyOtp (a mesma do login por senha).
// Criar, listar e tirar: só com a sessão aberta de um admin (JWT). O banco guarda só a chave pública. Desafio de 5 min, uso único.
// Tudo que fala com o mundo entra por "base" (banco, Auth, SimpleWebAuthn), então o teste usa um mundo falso.
import { criarAutenticador } from './supabase-adaptadores.js';

const CHAVE_MINUTOS = 5;
const CHAVE_MAX_APARELHOS = 10;

export function chaveOrigens(env) {
  const lista = [];
  const site = String((env && env.SITE_URL) || '').trim().replace(/\/+$/, '');
  if (/^https:\/\/[^/]+$/i.test(site)) lista.push(site.toLowerCase());
  String((env && env.CHAVE_ACESSO_ORIGENS) || '').split(',').map((s) => s.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean)
    .forEach((o) => lista.push(o));
  return lista;
}

export function chaveCors(origem, permitidas) {
  return {
    'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Vary': 'Origin'
  };
}

export function chaveApelido(agente) {
  const a = String(agente || '');
  if (/iPhone/i.test(a)) return 'iPhone';
  if (/iPad/i.test(a)) return 'iPad';
  if (/Android/i.test(a)) return 'Celular Android';
  if (/Macintosh|Mac OS X/i.test(a)) return 'Mac';
  if (/Windows/i.test(a)) return 'Computador Windows';
  return 'Este aparelho';
}

const chaveHex = (bytes) => '\\x' + Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('');
const chaveDeHex = (s) => new Uint8Array((String(s).replace(/^\\x/, '').match(/../g) || []).map((h) => parseInt(h, 16)));

export async function atenderChaveAcesso(req, base) {
  const origens = chaveOrigens(base.env);
  const origem = (req.headers.get('origin') || '').toLowerCase();
  const H = chaveCors(origem, origens);
  const resp = (corpo, status) => new Response(JSON.stringify(corpo), { status: status || 200, headers: Object.assign({}, H, { 'Content-Type': 'application/json' }) });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: H });
  if (req.method !== 'POST') return resp({ ok: false, erro: 'metodo' }, 405);
  if (!origens.includes(origem)) return resp({ ok: false, erro: 'origem' }, 403);
  const rpID = new URL(origem).hostname;
  let b = {};
  try { b = await req.json(); } catch (e) { return resp({ ok: false, erro: 'pedido' }, 400); }
  const { db, webauthn: W } = base;

  // quem cria, lista e tira precisa estar logado como admin
  async function admin() {
    const a = await base.autenticar(req.headers.get('authorization'));
    return a && a.eAdmin ? a.usuario : null;
  }

  try {
    switch (b.acao) {
      // ---- entrar (tela de entrar, sem sessão) ----
      case 'entrar-opcoes': {
        const o = await W.generateAuthenticationOptions({ rpID, userVerification: 'required' });
        await db.guardarDesafio(o.challenge, 'entrar', null, new Date(Date.now() + CHAVE_MINUTOS * 60000).toISOString());
        return resp(o);
      }
      case 'entrar': {
        const r = b.resposta;
        if (!r || !r.id || !r.response || !r.response.clientDataJSON) return resp({ ok: false, erro: 'pedido' }, 400);
        const p = await db.chavePorCredencial(String(r.id));
        if (!p) return resp({ ok: false, erro: 'chave' }, 401);
        let v = null;
        try {
          v = await W.verifyAuthenticationResponse({
            response: r, expectedChallenge: (d) => db.gastarDesafio(d, 'entrar', null), expectedOrigin: origem, expectedRPID: rpID,
            credential: { id: p.credencial_id, publicKey: chaveDeHex(p.chave_publica), counter: Number(p.contador), transports: p.transportes },
            requireUserVerification: true
          });
        } catch (e) { v = null; }
        if (!v || !v.verified) return resp({ ok: false, erro: 'chave' }, 401);
        // continua admin? (a chave de quem perdeu o acesso não abre mais nada)
        if (!(await db.eAdmin(p.user_id))) return resp({ ok: false, erro: 'chave' }, 401);
        const email = await db.emailDe(p.user_id);
        const token = email ? await db.tokenDeEntrada(email) : null;
        if (!token) return resp({ ok: false, erro: 'servidor' }, 500);
        await db.usou(p.id, v.authenticationInfo.newCounter, new Date().toISOString());
        return resp({ ok: true, token_hash: token });
      }
      // ---- Segurança (dentro do painel, com a sessão) ----
      case 'criar-opcoes': {
        const u = await admin();
        if (!u) return resp({ ok: false, erro: 'sessao' }, 401);
        const ja = await db.chavesDe(u.id);
        if (ja.length >= CHAVE_MAX_APARELHOS) return resp({ ok: false, erro: 'limite' }, 422);
        const o = await W.generateRegistrationOptions({
          rpName: 'Gestão sem Caos', rpID, userName: u.email, userDisplayName: u.email,
          userID: new TextEncoder().encode(u.id), attestationType: 'none',
          excludeCredentials: ja.map((x) => ({ id: x.credencial_id, transports: x.transportes })),
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' }
        });
        await db.guardarDesafio(o.challenge, 'criar', u.id, new Date(Date.now() + CHAVE_MINUTOS * 60000).toISOString());
        return resp(o);
      }
      case 'criar': {
        const u = await admin();
        if (!u) return resp({ ok: false, erro: 'sessao' }, 401);
        let v = null;
        try {
          v = await W.verifyRegistrationResponse({
            response: b.resposta, expectedChallenge: (d) => db.gastarDesafio(d, 'criar', u.id),
            expectedOrigin: origem, expectedRPID: rpID, requireUserVerification: true
          });
        } catch (e) { v = null; }
        if (!v || !v.verified || !v.registrationInfo) return resp({ ok: false, erro: 'criar' }, 422);
        const c = v.registrationInfo.credential;
        await db.guardarChave({
          user_id: u.id, credencial_id: c.id, chave_publica: chaveHex(c.publicKey), contador: c.counter,
          transportes: c.transports || [], apelido: chaveApelido(req.headers.get('user-agent'))
        });
        return resp({ ok: true, aparelhos: await db.aparelhosDe(u.id) });
      }
      case 'listar': {
        const u = await admin();
        if (!u) return resp({ ok: false, erro: 'sessao' }, 401);
        return resp({ ok: true, aparelhos: await db.aparelhosDe(u.id) });
      }
      case 'tirar': {
        const u = await admin();
        if (!u) return resp({ ok: false, erro: 'sessao' }, 401);
        await db.tirarChave(u.id, Number(b.id));
        return resp({ ok: true, aparelhos: await db.aparelhosDe(u.id) });
      }
    }
    return resp({ ok: false, erro: 'acao' }, 400);
  } catch (e) {
    console.error('[chave-acesso]', e instanceof Error ? e.message : e);
    return resp({ ok: false, erro: 'servidor' }, 500);
  }
}

/** Banco (tabelas fechadas, chave de serviço), Auth e SimpleWebAuthn de verdade. */
export function criarBaseChaveAcesso(createClient, getEnv, webauthn) {
  const env = {};
  ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SITE_URL', 'CHAVE_ACESSO_ORIGENS'].forEach((n) => { env[n] = getEnv(n) || ''; });
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const ok = (r) => { if (r.error) throw new Error('banco ' + (r.error.message || 'erro')); return r.data; };
  return {
    env,
    webauthn,
    autenticar: criarAutenticador(createClient, env),
    db: {
      async guardarDesafio(desafio, tipo, userId, expiraEm) {
        ok(await sb.from('admin_chave_desafios').delete().lt('expira_em', new Date().toISOString()));
        ok(await sb.from('admin_chave_desafios').insert({ desafio, tipo, user_id: userId, expira_em: expiraEm }));
      },
      async gastarDesafio(desafio, tipo, userId) {
        let q = sb.from('admin_chave_desafios').delete().eq('desafio', desafio).eq('tipo', tipo).gt('expira_em', new Date().toISOString());
        q = userId ? q.eq('user_id', userId) : q.is('user_id', null);
        const r = ok(await q.select('desafio'));
        return Array.isArray(r) && r.length > 0;
      },
      async chavePorCredencial(id) {
        return ok(await sb.from('admin_chaves').select('*').eq('credencial_id', id).maybeSingle());
      },
      async chavesDe(userId) {
        return ok(await sb.from('admin_chaves').select('credencial_id, transportes').eq('user_id', userId)) || [];
      },
      async aparelhosDe(userId) {
        return ok(await sb.from('admin_chaves').select('id, apelido, criado_em, usado_em').eq('user_id', userId).order('criado_em')) || [];
      },
      async guardarChave(linha) { ok(await sb.from('admin_chaves').insert(linha)); },
      async tirarChave(userId, id) { ok(await sb.from('admin_chaves').delete().eq('user_id', userId).eq('id', id)); },
      async usou(id, contador, quando) { ok(await sb.from('admin_chaves').update({ contador, usado_em: quando }).eq('id', id)); },
      async eAdmin(userId) {
        const r = ok(await sb.from('admins').select('user_id').eq('user_id', userId).maybeSingle());
        return !!r;
      },
      async emailDe(userId) {
        const { data, error } = await sb.auth.admin.getUserById(userId);
        return error || !data || !data.user ? null : data.user.email || null;
      },
      /** token do link mágico (não manda e-mail); o navegador troca por sessão com verifyOtp({token_hash, type:'magiclink'}) */
      async tokenDeEntrada(email) {
        const { data, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email });
        return error || !data || !data.properties ? null : data.properties.hashed_token || null;
      }
    }
  };
}
