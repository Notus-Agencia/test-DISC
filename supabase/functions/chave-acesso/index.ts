// @ts-nocheck
// ARQUIVO GERADO AUTOMATICAMENTE — NÃO EDITE. Gerado de supabase/funcoes-fonte/chave-acesso/index.ts por: npm run montar:funcoes
// Autocontido: cole este arquivo inteiro no editor da Edge Function no painel do Supabase.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webauthn from 'npm:@simplewebauthn/server@13.3.3';

// ======== supabase/funcoes-compartilhadas/supabase-adaptadores.js ========
// Adaptadores entre a lógica das funções e o supabase-js (cliente "service role" no servidor).
// Recebem o cliente pronto (createClient vem do index.ts via jsr:@supabase/supabase-js@2), então
// são testáveis no Node com um cliente falso.

const NOMES_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CLICKUP_TOKEN',
  'CLICKUP_PASTA_ID', 'CLICKUP_WEBHOOK_SECRET', 'ANTHROPIC_API_KEY', 'SITE_URL',
  // Só para a aba Conexões (presença) e os pagamentos de teste (Stripe/InfinitePay): os valores nunca saem do servidor.
  'PAGAMENTO_PROVEDOR', 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET', 'INFINITEPAY_HANDLE', 'ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN', 'ASAAS_AMBIENTE',
  'RESEND_API_KEY', 'EMAIL_REMETENTE',
  // Pesquisa de Clima: provedor de WhatsApp para o código do link pessoal (nenhum contratado ainda; ver whatsapp.js).
  'WHATSAPP_PROVEDOR'];

/** Lê os segredos pelo getter (Deno.env.get). Ausente -> ''. */
function lerEnv(get) {
  const env = {};
  NOMES_ENV.forEach((n) => { let v = ''; try { v = get(n) || ''; } catch (err) { v = ''; } env[n] = String(v).trim(); });
  return env;
}

const COLUNAS_TESTE = 'id, status, valor_centavos, checkout_url, provedor_dados, criado_em, pago_em';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidValido(v) { return typeof v === 'string' && UUID.test(v); }

function falhaDb(error) {
  const e = new Error('falha no banco de dados (' + String((error && (error.message || error.code)) || 'erro').substring(0, 160) + ')');
  e.causa = error;
  return e;
}

async function dados(consulta) {
  const { data, error } = await consulta;
  if (error) throw falhaDb(error);
  return data;
}

/** Acesso às tabelas (public.*) com o cliente service role (ignora RLS: só código do servidor usa). */
function criarDb(sb) {
  return {
    async processoPorId(id) {
      if (!uuidValido(String(id || ''))) return null;
      return dados(sb.from('processos').select('*').eq('id', id).maybeSingle());
    },
    async processoPorLista(listId) {
      const linhas = await dados(sb.from('processos').select('*').eq('clickup_list_id', String(listId)).eq('ativo', true)
        .order('criado_em', { ascending: false }).limit(1));
      return (linhas && linhas[0]) || null;
    },
    /** Respostas do DISC do processo (pelo processo_id; histórico importado só com o código também vale). */
    async respostasDoProcesso(proc) {
      let q = sb.from('respostas').select('id, pessoa_id, telefone, respostas, validacao, protocolo, recebido_em, foto, pessoas(foto)');
      q = /^(?:[A-Z0-9]{4}|[A-Z0-9]{10})$/.test(proc.codigo || '')   // código do link: 4 (antigos) ou 10 (novos)
        ? q.or('processo_id.eq.' + proc.id + ',avaliacao.eq.' + proc.codigo)
        : q.eq('processo_id', proc.id);
      return (await dados(q.order('recebido_em', { ascending: true }))) || [];
    },
    async respostaPorId(id) {
      return dados(sb.from('respostas').select('id, processo_id, nome, telefone, respostas, validacao, protocolo, clickup_sync')
        .eq('id', id).maybeSingle());
    },
    /** Troca clickup_sync por "marca" só se estiver livre (vazio, com erro ou travado há mais de "limiteIso"). */
    async reservarSync(id, marca, limiteIso) {
      const linhas = await dados(sb.from('respostas').update({ clickup_sync: marca }).eq('id', id)
        .or('clickup_sync.is.null,clickup_sync->>estado.eq.erro,and(clickup_sync->>estado.eq.sincronizando,clickup_sync->>em.lt."' + limiteIso + '")')
        .select('id'));
      return !!(linhas && linhas.length);
    },
    async gravarSync(id, valor) {
      await dados(sb.from('respostas').update({ clickup_sync: valor }).eq('id', id));
    },
    async relatorioInserir(reg) {
      await dados(sb.from('relatorios').insert(reg));
    },
    async relatorioLer(token) {
      return dados(sb.from('relatorios').select('*').eq('token', token).maybeSingle());
    },
    async relatorioAtualizar(token, campos) {
      await dados(sb.from('relatorios').update(campos).eq('token', token));
    },
    async relatoriosListar(processoId) {
      let q = sb.from('relatorios').select('token, processo_id, status, criado_em, atualizado_em, publicado_em');
      if (processoId) {
        if (!uuidValido(processoId)) return [];
        q = q.eq('processo_id', processoId);
      }
      return (await dados(q.order('criado_em', { ascending: false }))) || [];
    },
    async configLer(chave) {
      const l = await dados(sb.from('configuracoes').select('valor').eq('chave', chave).maybeSingle());
      return l ? l.valor : null;
    },
    async configGravar(chave, valor) {
      await dados(sb.from('configuracoes').upsert({ chave, valor }, { onConflict: 'chave' }));
    },
    /** Anti-abuso (tabela limites_vendas): registra uma tentativa e devolve quantas houve desde "desdeIso" (inclui esta). */
    async contarTentativa(tipo, chave, desdeIso, agoraIso) {
      const c = String(chave).substring(0, 200);
      await dados(sb.from('limites_vendas').insert({ tipo, chave: c, em: agoraIso }));
      const linhas = await dados(sb.from('limites_vendas').select('id').eq('tipo', tipo).eq('chave', c).gte('em', desdeIso).limit(1000));
      return (linhas || []).length;
    },
    /** Histórico de envios por e-mail (public.envios_email; linha montada por linhaEnvio em email.js). */
    async envioRegistrar(linha) {
      await dados(sb.from('envios_email').insert(linha));
    },
    async adminsListar() {
      return (await dados(sb.from('admins').select('user_id, nome, criado_em, foto').order('criado_em', { ascending: true }))) || [];
    },
    async adminInserir(userId, nome) {
      await dados(sb.from('admins').upsert({ user_id: userId, nome }, { onConflict: 'user_id' }));
    },
    async adminRemover(userId) {
      await dados(sb.from('admins').delete().eq('user_id', userId));
    },
    // Pedidos de TESTE da aba Conexões (pedidos.teste = true; migração 20261013120000_conexoes.sql).
    async pedidoTesteInserir(reg) {
      return dados(sb.from('pedidos').insert(reg).select('id, criado_em').single());
    },
    async pedidoTesteLer(id) {
      if (!uuidValido(String(id || ''))) return null;
      return dados(sb.from('pedidos').select(COLUNAS_TESTE).eq('id', id).eq('teste', true).maybeSingle());
    },
    async pedidoTesteUltimo() {
      const linhas = await dados(sb.from('pedidos').select(COLUNAS_TESTE).eq('teste', true).order('criado_em', { ascending: false }).limit(1));
      return (linhas && linhas[0]) || null;
    },
    async pedidoTesteAtualizar(id, campos) {
      await dados(sb.from('pedidos').update(campos).eq('id', id).eq('teste', true));
    }
  };
}

/** Supabase Auth (API de administração; só com a service role key). */
function criarAuthAdmin(sb) {
  const POR_PAGINA = 200;
  return {
    async usuarioPorId(id) {
      const { data, error } = await sb.auth.admin.getUserById(id);
      return error || !data ? null : data.user || null;
    },
    async usuarioPorEmail(email) {
      const alvo = String(email || '').toLowerCase();
      for (let pagina = 1; pagina <= 50; pagina++) {
        const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA });
        if (error) throw new Error('não foi possível ler os usuários (' + (error.message || 'erro') + ')');
        const lista = (data && data.users) || [];
        const achado = lista.find((u) => String(u.email || '').toLowerCase() === alvo);
        if (achado) return achado;
        if (lista.length < POR_PAGINA) break;
      }
      return null;
    },
    async convidar(email, op) {
      const opcoes = { data: { nome: op && op.nome ? op.nome : '' } };
      if (op && op.redirectTo) opcoes.redirectTo = op.redirectTo;
      const { data, error } = await sb.auth.admin.inviteUserByEmail(email, opcoes);
      if (error || !data || !data.user) throw new Error(String((error && error.message) || 'o Supabase não criou o usuário'));
      return data.user;
    },
    async excluir(id) {
      const { error } = await sb.auth.admin.deleteUser(id);
      if (error) throw new Error(String(error.message || 'erro'));
    }
  };
}

/**
 * Autenticador do painel: confere o JWT do usuário no Supabase Auth e pergunta ao banco se ele é
 * admin (RPC public.e_admin(), com o próprio JWT -> auth.uid()). {usuario, eAdmin} ou null.
 */
function criarAutenticador(createClient, env) {
  return async function autenticar(authorization) {
    const m = /^Bearer\s+(\S+)\s*$/i.exec(String(authorization || ''));
    if (!m) return null;
    const jwt = m[1];
    if (jwt === env.SUPABASE_ANON_KEY) return null; // chave pública não é usuário logado
    const cliente = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: 'Bearer ' + jwt } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data, error } = await cliente.auth.getUser(jwt);
    if (error || !data || !data.user) return null;
    const r = await cliente.rpc('e_admin');
    return { usuario: { id: data.user.id, email: data.user.email || '' }, eAdmin: !r.error && r.data === true };
  };
}

/** Tudo que as funções precisam, a partir do createClient do supabase-js e do getter de segredos. */
function criarBaseSupabase(createClient, getEnv, extras) {
  const env = lerEnv(getEnv);
  const servico = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return Object.assign({
    env,
    fetch: (u, o) => fetch(u, o),
    db: criarDb(servico),
    authAdmin: criarAuthAdmin(servico),
    autenticar: criarAutenticador(createClient, env)
  }, extras || {});
}

// ======== supabase/funcoes-compartilhadas/chave-acesso.js ========
// Chave de acesso (passkey/WebAuthn) do painel DISC — lógica da Edge Function "chave-acesso" (pedido do dono, 27/10/2026).
// Entrar: o navegador oferece a chave na sugestão do campo de e-mail; a função confere a assinatura (SimpleWebAuthn), checa que a
// pessoa ainda é admin e devolve o token do link mágico dela; o navegador troca por sessão com verifyOtp (a mesma do login por senha).
// Criar, listar e tirar: só com a sessão aberta de um admin (JWT). O banco guarda só a chave pública. Desafio de 5 min, uso único.
// Tudo que fala com o mundo entra por "base" (banco, Auth, SimpleWebAuthn), então o teste usa um mundo falso.

const CHAVE_MINUTOS = 5;
const CHAVE_MAX_APARELHOS = 10;

function chaveOrigens(env) {
  const lista = [];
  const site = String((env && env.SITE_URL) || '').trim().replace(/\/+$/, '');
  if (/^https:\/\/[^/]+$/i.test(site)) lista.push(site.toLowerCase());
  String((env && env.CHAVE_ACESSO_ORIGENS) || '').split(',').map((s) => s.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean)
    .forEach((o) => lista.push(o));
  return lista;
}

function chaveCors(origem, permitidas) {
  return {
    'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info',
    'Vary': 'Origin'
  };
}

function chaveApelido(agente) {
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

async function atenderChaveAcesso(req, base) {
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
function criarBaseChaveAcesso(createClient, getEnv, webauthn) {
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

// ======== supabase/funcoes-fonte/chave-acesso/index.ts ========
// Edge Function "chave-acesso" — chave de acesso (digital ou rosto) do painel DISC. Entra com a chave e recebe a MESMA sessão
// do login por senha (link mágico gerado com a chave de serviço, trocado no navegador por verifyOtp). A senha continua de reserva.
// Pública: no painel, desligue "Verify JWT" (supabase/config.toml já declara); criar, listar e tirar conferem o JWT do admin.
// Segredos: SITE_URL (origem do painel = domínio da chave), CHAVE_ACESSO_ORIGENS? (outras origens, separadas por vírgula).
// Lógica em supabase/funcoes-compartilhadas/chave-acesso.js. Para colar no painel do Supabase use dist/funcoes/chave-acesso/index.ts
// (gerado por npm run montar:funcoes).

Deno.serve((req) => atenderChaveAcesso(req, criarBaseChaveAcesso(createClient, (n) => Deno.env.get(n), webauthn)));
