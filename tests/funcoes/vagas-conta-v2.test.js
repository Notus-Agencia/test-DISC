// Edge Function "vagas-conta", ações da v2 (entrada por código, CNPJ, empresa e links de arquivo), com Auth, banco, Resend, Turnstile e
// BrasilAPI FALSOS (nenhuma chamada real). O banco falso repete as regras de 20261102120000_vagas_v2_codigos.sql (a migração
// real é testada em tests/supabase/vagas_codigos_v2.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  atenderVagasConta, criarBaseVagasConta, enviarCodigoWhatsappVagas, canalWhatsappLigadoVagas, VAGAS_BUCKET_CURRICULOS, VAGAS_BUCKET_VERIFICACAO
} from '../../supabase/funcoes-compartilhadas/vagas-conta.js';
import {
  gerarCodigoVagas, gerarSalVagas, hashCodigoVagas, conferirCodigoVagas, codigoDigitadoVagas, cnpjValidoVagas, pareceCpfVagas, nomeProprioVagas,
  interpretarCnpjVagas, whatsappDigitosVagas, montarEmailCodigoVagas, consultarCnpjVagas, VAGAS_FRASE_GOLPE, VAGAS_MSG_CNPJ_INDISPONIVEL, VAGAS_MSG_CPF
} from '../../supabase/funcoes-compartilhadas/vagas-v2.js';

const require = createRequire(import.meta.url);
const REGRAS = require('../../vagas/js/regras.js');
const SITE = 'https://vagas.gestaosemcaos.com.br';
const CHAVE_SERVICO = 'chave-de-servico-secreta-teste';
const CHAVE_RESEND = 're_chave_secreta_teste';
const UUID1 = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';
const CNPJ_OK = '11222333000181';

function cnpjAlfanumerico(base12) {
  const dv = (s, pesos) => { let t = 0; for (let i = 0; i < pesos.length; i++) t += (s.charCodeAt(i) - 48) * pesos[i]; const r = t % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + d1 + d2;
}

function respostaBrasilApi(extra) {
  return Object.assign({ cnpj: CNPJ_OK, razao_social: 'PADARIA DO ZE LTDA', nome_fantasia: 'PADARIA DO ZÉ', descricao_situacao_cadastral: 'ATIVA',
    situacao_cadastral: 2, data_inicio_atividade: '2019-03-04', municipio: 'URUAÇU', uf: 'GO', bairro: 'CENTRO', opcao_pelo_mei: false,
    cnae_fiscal_descricao: 'Padaria e confeitaria com predominância de revenda' }, extra || {});
}

// Mundo falso: relógio, tabela de códigos (mesmas regras do SQL), Auth, contas, Resend, Turnstile e BrasilAPI.
function preparar(op) {
  op = op || {};
  const relogio = { t: 1900000000000 };
  const codigos = [];
  const usuarios = [];
  const contas = {};
  const admins = new Set(op.admins || []);
  const chamadasDb = [];
  const enviados = [];
  const consultasCnpj = [];
  const assinadas = [];
  const excluidos = [];
  const links = [];
  const confirmados = [];
  const garantidos = [];
  const empresasCriadas = [];
  const limites = [];
  const cancelados = [];
  let n = 0;
  (op.usuarios || []).forEach((u) => { usuarios.push(u); if (u.conta) contas[u.id] = u.conta; });
  const erro = (erroTxt, extra) => Object.assign({ ok: false, erro: erroTxt }, extra || {});
  const sorteados = [];
  const filaCodigos = (op.codigos || ['123456', '654321', '111222', '333444']).slice();
  const contagens = {};
  const contar = (chave, max) => { contagens[chave] = (contagens[chave] || 0) + 1; return contagens[chave] > max; };
  const db = {
    async limite() { return { ok: true }; },
    async consultar(email) {
      chamadasDb.push(['consultar', email]);
      const u = usuarios.find((x) => x.email === email);
      if (!u) return { ok: true, existe: false };
      return { ok: true, existe: true, userId: u.id, produto: (u.app && u.app.produto) || '', confirmada: !!u.confirmada,
        conta: contas[u.id] ? { tipo: contas[u.id].tipo, status: contas[u.id].status || 'ativa', assistidaCidade: null } : null, admin: admins.has(u.id) };
    },
    async quem(userId) { return { ok: true, admin: admins.has(userId), conta: contas[userId] || null, operador: [] }; },
    async codigoNovo(canal, destino, sal, hash, cf, xff) {
      chamadasDb.push(['codigoNovo', canal, destino, sal, hash, cf, xff]);
      if (op.bloquear) return erro('Muitas tentativas. Tente de novo mais tarde.', { bloqueado: true });
      const ult = codigos.filter((c) => c.destino === destino).reduce((m, c) => Math.max(m, c.criado), 0);
      if (ult && relogio.t - ult < 30000) {
        return erro('Espere alguns segundos para pedir outro código.', { codigo: 'aguarde', reenviarEmSeg: Math.ceil((ult + 30000 - relogio.t) / 1000), aguardar: true });
      }
      if (contar('destino:' + destino, 5)) return erro('Muitas tentativas. Tente de novo mais tarde.', { bloqueado: true });
      codigos.filter((c) => c.destino === destino && !c.usado).forEach((c) => { c.usado = true; });
      const c = { id: 'cod-' + (codigos.length + 1), canal, destino, sal, hash, tentativas: 0, criado: relogio.t, expira: relogio.t + 600000, usado: false };
      codigos.push(c);
      return { ok: true, id: c.id, reenviarEmSeg: 30, expiraEmSeg: 600 };
    },
    async codigoTentar(destino) {
      chamadasDb.push(['codigoTentar', destino]);
      const c = codigos.filter((x) => x.destino === destino && !x.usado).pop();
      if (!c || c.expira <= relogio.t) return erro('Este código venceu ou já foi usado. Peça um novo código.', { codigo: 'codigo_vencido' });
      if (c.tentativas >= 5) return erro('Você errou o código vezes demais. Peça um novo código.', { codigo: 'tentativas' });
      c.tentativas += 1;
      return { ok: true, id: c.id, sal: c.sal, hash: c.hash, restantes: 5 - c.tentativas };
    },
    async codigoUsar(id) {
      chamadasDb.push(['codigoUsar', id]);
      const c = codigos.find((x) => x.id === id);
      if (!c || c.usado || c.expira <= relogio.t) return erro('Este código venceu ou já foi usado. Peça um novo código.', { codigo: 'codigo_vencido' });
      codigos.filter((x) => x.destino === c.destino).forEach((x) => { x.usado = true; });
      return { ok: true };
    },
    async codigoCancelar(id) {
      cancelados.push(id);
      const i = codigos.findIndex((x) => x.id === id && !x.usado);
      if (i >= 0) codigos.splice(i, 1);
      return { ok: true };
    },
    async limiteV2(acao, cf, xff, chave, ator) {
      limites.push({ acao, cf, xff, ator });
      return op.bloquearV2 ? erro('Muitas tentativas. Tente de novo mais tarde.', { bloqueado: true }) : { ok: true };
    },
    async contaGarantir(userId, dados) {
      garantidos.push({ userId, dados });
      if (op.garantirFalha) return erro('Não foi possível criar a conta.');
      contas[userId] = Object.assign({ status: 'ativa' }, contas[userId] || {}, { tipo: dados.tipo });
      return { ok: true };
    },
    async empresaCriar(userId, dados) {
      empresasCriadas.push({ userId, dados });
      if (op.empresaErro) return erro(op.empresaErro, { codigo: 'ja_existe', segredoDoBanco: 'x' });
      return { ok: true, empresa: { id: UUID2, nome: dados.nomeFantasia, estado: 'em_verificacao', prazoAte: '2026-12-01T00:00:00Z' }, interno: 'nao-vaza' };
    },
    async arquivoLink(userId, id) { chamadasDb.push(['arquivoLink', userId, id]); return op.arquivo ? op.arquivo(userId, id) : { ok: true, caminho: 'pessoa/arq.pdf', nome: 'cv.pdf' }; },
    async documentoLink(userId, id) { chamadasDb.push(['documentoLink', userId, id]); return op.documento ? op.documento(userId, id) : { ok: true, caminho: 'empresa/doc.pdf', nome: 'cartao.pdf' }; }
  };
  const auth = {
    async criarUsuario(u) { n += 1; const id = 'novo-' + n; usuarios.push({ id, email: u.email, confirmada: false, app: u.app, usuario: u.usuario, senha: u.senha }); return { id }; },
    async confirmarEmail(id) { confirmados.push(id); const u = usuarios.find((x) => x.id === id); if (u) u.confirmada = true; },
    async gerarLink(tipo, email) { links.push({ tipo, email }); return 'hashlink' + links.length; },
    async sessaoDoLink(hash) {
      if (op.sessaoFalha) throw new Error('Auth: a sessão não abriu (HTTP 500)');
      const u = usuarios.find((x) => x.email === links[links.length - 1].email);
      return { access_token: 'acesso-' + hash, refresh_token: 'renova-' + hash, expires_at: 1900003600, user: { id: u.id, email: u.email } };
    },
    async usuarioDoToken(jwt) { const u = (op.jwts || {})[jwt]; return u ? { id: u, email: '' } : null; },
    async excluirUsuario(id) { excluidos.push(id); const i = usuarios.findIndex((x) => x.id === id); if (i >= 0) usuarios.splice(i, 1); }
  };
  const storage = { async assinar(bucket, caminho, segundos) { assinadas.push({ bucket, caminho, segundos }); return 'https://p.supabase.co/storage/v1/object/sign/' + bucket + '/' + caminho + '?token=t'; }, async remover() {} };
  async function fetch(url, o) {
    const u = String(url);
    if (u === 'https://api.resend.com/emails') {
      const corpo = JSON.parse(o.body);
      enviados.push(corpo);
      if (op.resendFalha) return new Response('{"message":"x"}', { status: 500 });
      return new Response('{"id":"em_1"}', { status: 200 });
    }
    if (u === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
      const corpo = new URLSearchParams(String(o.body));
      return new Response(JSON.stringify({ success: corpo.get('response') === 'captcha-bom' }), { status: 200 });
    }
    if (u.startsWith('https://brasilapi.com.br/api/cnpj/v1/')) {
      const cnpj = decodeURIComponent(u.split('/').pop());
      consultasCnpj.push(cnpj);
      if (op.brasilapi) return op.brasilapi(cnpj);
      return new Response(JSON.stringify(respostaBrasilApi({ cnpj })), { status: 200 });
    }
    throw new Error('teste: chamada externa inesperada para ' + url);
  }
  const env = Object.assign({ VAGAS_SITE_URL: SITE, RESEND_API_KEY: CHAVE_RESEND, SUPABASE_SERVICE_ROLE_KEY: CHAVE_SERVICO,
    VAGAS_EMAIL_REMETENTE: 'Vagas sem Caos <vagas@gestaosemcaos.com.br>' }, op.env);
  const base = { env, fetch, db, auth, storage, cnpjCache: new Map(), aleatorio: () => 'senha-aleatoria-descartada',
    sortearCodigo: () => { const c = filaCodigos.shift() || '999999'; sorteados.push(c); return c; } };
  return { base, relogio, codigos, usuarios, contas, chamadasDb, enviados, consultasCnpj, assinadas, excluidos, links, confirmados, garantidos,
    empresasCriadas, limites, cancelados, sorteados };
}

async function chamar(base, corpo, op) {
  op = op || {};
  const headers = { origin: op.origem || SITE, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' };
  if (op.jwt) headers.authorization = 'Bearer ' + op.jwt;
  const r = await atenderVagasConta(new Request('https://x/functions/v1/vagas-conta', { method: op.metodo || 'POST', headers,
    body: op.metodo === 'OPTIONS' || op.metodo === 'GET' ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) }), base);
  return { status: r.status, cors: r.headers.get('access-control-allow-origin'), json: r.status === 204 ? null : await r.json(), cabecalhos: r.headers };
}
const PEDIR = (destino, extra) => Object.assign({ acao: 'codigo_pedir', destino, canal: 'email' }, extra || {});
const CONFIRMAR = (destino, codigo, extra) => Object.assign({ acao: 'codigo_confirmar', destino, codigo, termosVersao: '2026-11-24' }, extra || {});

// ---------------------------------------------------------------------------------------------------------------------
// codigo_pedir
// ---------------------------------------------------------------------------------------------------------------------

test('codigo_pedir: manda o código por e-mail (Resend), guarda só o HASH e a resposta não traz código nem hash', async () => {
  const w = preparar();
  const r = await chamar(w.base, PEDIR(' Ana.Souza@Exemplo.com '));
  assert.equal(r.status, 200);
  assert.equal(r.cors, SITE);
  assert.deepEqual(r.json, { ok: true, canal: 'email', destinoMascarado: 'a***@e***.com', reenviarEmSeg: 30, expiraEmSeg: 600 });
  assert.equal(w.enviados.length, 1);
  const m = w.enviados[0];
  assert.deepEqual(m.to, ['ana.souza@exemplo.com']);
  assert.equal(m.from, 'Vagas sem Caos <vagas@gestaosemcaos.com.br>');
  assert.equal(m.subject, 'Seu código do Vagas sem Caos: 123456');
  assert.match(m.text, /Seu código do Vagas sem Caos: 123456\. Vale por 10 minutos\./);
  assert.ok(m.text.includes('Nunca pague para se candidatar. Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.'));
  assert.ok(m.html.includes('>123456<'));
  assert.ok(!/notus/i.test(m.html + m.text));
  // o banco só recebe sal e hash: o código nunca é gravado
  const novo = w.chamadasDb.find((c) => c[0] === 'codigoNovo');
  assert.equal(novo[1], 'email');
  assert.equal(novo[2], 'ana.souza@exemplo.com');
  assert.match(novo[3], /^[0-9a-f]{32}$/);
  assert.match(novo[4], /^[0-9a-f]{64}$/);
  assert.equal(novo[6], '203.0.113.9, 10.0.0.1');
  assert.ok(!JSON.stringify(w.chamadasDb).includes('123456'), 'o código nunca vai ao banco');
  assert.ok(!JSON.stringify(w.codigos).includes('123456'));
  assert.ok(!JSON.stringify(r.json).includes('123456') && !JSON.stringify(r.json).includes(novo[4]));
  assert.equal(r.cabecalhos.get('cache-control'), 'no-store');
  assert.equal(w.usuarios.length, 0, 'pedir o código não cria conta');
});

test('codigo_pedir: o hash muda com o sal, o destino e o código; e o código nunca é escrito no log', async () => {
  const antes = console.error;
  const logs = [];
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const w = preparar({ resendFalha: true });
    await chamar(w.base, PEDIR('ana@exemplo.com'));
    assert.ok(logs.length >= 1);
    assert.ok(!logs.join('\n').includes('123456'), 'o código não aparece no log');
  } finally { console.error = antes; }
  const h = await hashCodigoVagas('123456', 'a@x.com', 'aa'.repeat(16), 'segredo');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, await hashCodigoVagas('123456', 'a@x.com', 'bb'.repeat(16), 'segredo'));
  assert.notEqual(h, await hashCodigoVagas('123456', 'b@x.com', 'aa'.repeat(16), 'segredo'));
  assert.notEqual(h, await hashCodigoVagas('123457', 'a@x.com', 'aa'.repeat(16), 'segredo'));
  assert.notEqual(h, await hashCodigoVagas('123456', 'a@x.com', 'aa'.repeat(16), 'outro-segredo'));
  assert.equal(await conferirCodigoVagas('123456', 'a@x.com', 'aa'.repeat(16), 'segredo', h), true);
  assert.equal(await conferirCodigoVagas('123450', 'a@x.com', 'aa'.repeat(16), 'segredo', h), false);
});

test('codigo_pedir: e-mail inválido, canal inválido, Resend não configurado e captcha (Turnstile)', async () => {
  const w = preparar();
  assert.deepEqual((await chamar(w.base, PEDIR('x'))).json, { ok: false, erro: 'E-mail inválido.' });
  assert.deepEqual((await chamar(w.base, PEDIR('a@b.com', { canal: 'sms' }))).json, { ok: false, erro: 'Canal inválido.' });
  assert.equal((await chamar(w.base, { acao: 'codigo_pedir', destino: 'a@b.com' })).json.canal, 'email', 'sem canal vale e-mail');
  const sem = preparar({ env: { RESEND_API_KEY: '' } });
  const r = await chamar(sem.base, PEDIR('a@b.com'));
  assert.equal(r.json.ok, false);
  assert.equal(r.json.naoConfigurado, true, 'não finge que enviou');
  assert.equal(sem.enviados.length, 0);
  assert.equal(sem.codigos.length, 0, 'e nada é guardado');
  const cap = preparar({ env: { TURNSTILE_SECRET: 'segredo-turnstile' } });
  assert.equal((await chamar(cap.base, PEDIR('a@b.com', { captcha: 'ruim' }))).json.captcha, true);
  assert.equal((await chamar(cap.base, PEDIR('a@b.com', { captcha: 'captcha-bom' }))).json.ok, true);
});

test('codigo_pedir: reenviar só depois de 30 s; o código novo invalida o anterior', async () => {
  const w = preparar();
  assert.equal((await chamar(w.base, PEDIR('a@b.com'))).json.ok, true);
  w.relogio.t += 10000;
  const cedo = await chamar(w.base, PEDIR('a@b.com'));
  assert.equal(cedo.json.ok, false);
  assert.equal(cedo.json.codigo, 'aguarde');
  assert.equal(cedo.json.reenviarEmSeg, 20);
  assert.equal(cedo.json.aguardar, true);
  assert.equal(w.enviados.length, 1, 'nenhum e-mail novo antes de 30 s');
  w.relogio.t += 21000;
  assert.equal((await chamar(w.base, PEDIR('a@b.com'))).json.ok, true);
  assert.equal(w.enviados.length, 2);
  assert.match(w.enviados[1].text, /111222/, "o pedido recusado por pressa também sorteia, mas não envia");
  // o código antigo (123456) não vale mais
  const velho = await chamar(w.base, CONFIRMAR('a@b.com', '123456'));
  assert.equal(velho.json.ok, false);
  assert.equal(velho.json.codigo, 'codigo_errado');
  assert.equal(w.usuarios.length, 0);
});

test('codigo_pedir: limite do banco vira "Muitas tentativas" e nada é enviado', async () => {
  const w = preparar({ bloquear: true });
  const r = await chamar(w.base, PEDIR('a@b.com'));
  assert.deepEqual(r.json, { ok: false, erro: 'Muitas tentativas. Tente de novo mais tarde.', bloqueado: true });
  assert.equal(w.enviados.length, 0);
});

test('codigo_pedir: se o e-mail não sai, o código é apagado e a resposta é um erro claro', async () => {
  const antes = console.error;
  console.error = () => {};
  try {
    const w = preparar({ resendFalha: true });
    const r = await chamar(w.base, PEDIR('a@b.com'));
    assert.deepEqual(r.json, { ok: false, erro: 'Não deu para enviar o e-mail agora. Tente de novo em instantes.', codigo: 'envio_falhou' });
    assert.equal(w.cancelados.length, 1);
    assert.equal(w.codigos.length, 0, 'o código que não saiu não fica guardado');
  } finally { console.error = antes; }
});

test('codigo_pedir: o canal WhatsApp está desligado por padrão (e continua não configurado mesmo com a chave ligada)', async (t) => {
  t.mock.method(console, 'error', () => {});
  const w = preparar();
  const r = await chamar(w.base, PEDIR('62999990000', { canal: 'whatsapp' }));
  assert.deepEqual(r.json, { ok: false, erro: 'O código por WhatsApp ainda não está ligado. Use o e-mail.', codigo: 'canal_desligado' });
  assert.equal(w.codigos.length, 0);
  assert.equal(w.enviados.length, 0);
  // chave ligada, sem provedor: tenta, não envia, apaga o código
  const l = preparar({ env: { VAGAS_CANAL_WHATSAPP: 'ligado' } });
  const r2 = await chamar(l.base, PEDIR('(62) 99999-0000', { canal: 'whatsapp' }));
  assert.equal(r2.json.ok, false);
  assert.equal(r2.json.codigo, 'canal_desligado');
  assert.equal(l.codigos.length, 0);
  assert.equal(l.enviados.length, 0);
  // com chave e variáveis do provedor: a função ainda devolve "não configurado" (nenhum provedor foi inventado)
  const env = { VAGAS_CANAL_WHATSAPP: 'ligado', VAGAS_WHATSAPP_PROVEDOR_URL: 'https://provedor.exemplo', VAGAS_WHATSAPP_PROVEDOR_TOKEN: 't' };
  const e = await enviarCodigoWhatsappVagas({ env }, '5562999990000', '123456');
  assert.deepEqual(e, { enviado: false, naoConfigurado: true, provedorLido: true });
  assert.equal((await enviarCodigoWhatsappVagas({ env: {} }, '5562999990000', '123456')).provedorLido, false);
  assert.equal(canalWhatsappLigadoVagas({ VAGAS_CANAL_WHATSAPP: ' Ligado ' }), true);
  assert.equal(canalWhatsappLigadoVagas({}), false);
  assert.equal(canalWhatsappLigadoVagas({ VAGAS_CANAL_WHATSAPP: 'sim' }), false);
});

// ---------------------------------------------------------------------------------------------------------------------
// codigo_confirmar
// ---------------------------------------------------------------------------------------------------------------------

test('codigo_confirmar: código certo cria a conta, confirma o e-mail, chama o banco e devolve a sessão (sem senha, sem link)', async () => {
  const w = preparar();
  await chamar(w.base, PEDIR('Ana@Exemplo.com'));
  const r = await chamar(w.base, CONFIRMAR('ana@exemplo.com', '123 456', { nome: 'Ana Souza', tipo: 'pessoa' }));
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.novaConta, true);
  assert.equal(r.json.tipo, 'pessoa');
  assert.deepEqual(Object.keys(r.json.sessao).sort(), ['access_token', 'expires_at', 'refresh_token', 'user']);
  assert.deepEqual(r.json.sessao.user, { id: 'novo-1', email: 'ana@exemplo.com' });
  assert.equal(r.json.sessao.expires_at, 1900003600);
  assert.equal(w.usuarios.length, 1);
  const u = w.usuarios[0];
  assert.deepEqual(u.app, { produto: 'vagas', tipo: 'pessoa' });
  assert.deepEqual(u.usuario, { nome: 'Ana Souza' });
  assert.equal(u.senha, 'senha-aleatoria-descartada', 'ninguém conhece a senha');
  assert.deepEqual(w.confirmados, ['novo-1']);
  assert.deepEqual(w.garantidos, [{ userId: 'novo-1', dados: { tipo: 'pessoa', nome: 'Ana Souza', termosVersao: '2026-11-24' } }]);
  assert.deepEqual(w.links, [{ tipo: 'magiclink', email: 'ana@exemplo.com' }]);
  assert.ok(!JSON.stringify(r.json).includes('hashlink1') || r.json.sessao.access_token.includes('hashlink1'), 'o token do link não vaza fora da sessão');
  assert.ok(!('hashed_token' in r.json) && !('senha' in r.json));
  // o mesmo código não vale duas vezes
  const outra = await chamar(w.base, CONFIRMAR('ana@exemplo.com', '123456'));
  assert.equal(outra.json.ok, false);
  assert.equal(outra.json.codigo, 'codigo_vencido');
  assert.equal(w.usuarios.length, 1);
});

test('codigo_confirmar: conta existente entra sem criar outra (novaConta=false) e mantém o tipo da conta', async () => {
  const w = preparar({ usuarios: [{ id: 'e1', email: 'dono@loja.com', confirmada: true, app: { produto: 'vagas', tipo: 'empresa' }, conta: { tipo: 'empresa', status: 'ativa' } }] });
  await chamar(w.base, PEDIR('dono@loja.com'));
  const r = await chamar(w.base, CONFIRMAR('dono@loja.com', '123456', { tipo: 'pessoa' }));
  assert.equal(r.json.ok, true);
  assert.equal(r.json.novaConta, false);
  assert.equal(r.json.tipo, 'empresa');
  assert.equal(r.json.sessao.user.id, 'e1');
  assert.equal(w.usuarios.length, 1);
  assert.deepEqual(w.confirmados, [], 'já estava confirmada');
  assert.equal(w.garantidos[0].dados.tipo, 'empresa');
});

test('codigo_confirmar: conta pendente (link antigo sem clique) fica confirmada pelo código', async () => {
  const w = preparar({ usuarios: [{ id: 'p1', email: 'pend@x.com', confirmada: false, app: { produto: 'vagas', tipo: 'pessoa' }, conta: { tipo: 'pessoa', status: 'pendente' } }] });
  await chamar(w.base, PEDIR('pend@x.com'));
  const r = await chamar(w.base, CONFIRMAR('pend@x.com', '123456'));
  assert.equal(r.json.ok, true);
  assert.deepEqual(w.confirmados, ['p1']);
});

test('codigo_confirmar: operação (conta de operador) entra sem passar pela função de conta da pessoa', async () => {
  const w = preparar({ usuarios: [{ id: 'o1', email: 'op@x.com', confirmada: true, app: { produto: 'vagas', tipo: 'operador' }, conta: { tipo: 'operador', status: 'ativa' } }] });
  await chamar(w.base, PEDIR('op@x.com'));
  const r = await chamar(w.base, CONFIRMAR('op@x.com', '123456'));
  assert.equal(r.json.ok, true);
  assert.equal(r.json.tipo, 'operador');
  assert.deepEqual(w.garantidos, []);
});

test('codigo_confirmar: código errado conta tentativa; na 5ª errada o código morre, mesmo o certo depois', async () => {
  const w = preparar();
  await chamar(w.base, PEDIR('a@b.com'));
  for (let i = 1; i <= 4; i++) {
    const r = await chamar(w.base, CONFIRMAR('a@b.com', '000000'));
    assert.equal(r.json.ok, false);
    assert.equal(r.json.codigo, 'codigo_errado');
    assert.equal(r.json.erro, 'Código incorreto. Confira e tente de novo.');
    assert.equal(r.json.restantes, 5 - i);
  }
  const quinta = await chamar(w.base, CONFIRMAR('a@b.com', '000000'));
  assert.equal(quinta.json.codigo, 'tentativas');
  assert.equal(quinta.json.erro, 'Você errou o código vezes demais. Peça um novo código.');
  const certo = await chamar(w.base, CONFIRMAR('a@b.com', '123456'));
  assert.equal(certo.json.ok, false);
  assert.equal(certo.json.codigo, 'tentativas');
  assert.equal(w.usuarios.length, 0, 'sem conta e sem sessão');
  // pedir outro código (depois de 30 s) volta a funcionar
  w.relogio.t += 31000;
  assert.equal((await chamar(w.base, PEDIR('a@b.com'))).json.ok, true);
  assert.equal((await chamar(w.base, CONFIRMAR('a@b.com', '654321'))).json.ok, true);
});

test('codigo_confirmar: código vencido (10 minutos) e sem pedido', async () => {
  const w = preparar();
  assert.equal((await chamar(w.base, CONFIRMAR('a@b.com', '123456'))).json.codigo, 'codigo_vencido', 'sem pedido');
  await chamar(w.base, PEDIR('a@b.com'));
  w.relogio.t += 601000;
  const r = await chamar(w.base, CONFIRMAR('a@b.com', '123456'));
  assert.equal(r.json.ok, false);
  assert.equal(r.json.codigo, 'codigo_vencido');
  assert.equal(r.json.erro, 'Este código venceu ou já foi usado. Peça um novo código.');
  assert.equal(w.usuarios.length, 0);
});

test('codigo_confirmar: validações (formato, e-mail, versão dos termos, WhatsApp) sem gastar tentativa', async () => {
  const w = preparar();
  await chamar(w.base, PEDIR('a@b.com'));
  const antes = w.chamadasDb.length;
  assert.equal((await chamar(w.base, CONFIRMAR('a@b.com', '12345'))).json.codigo, 'codigo_formato');
  assert.equal((await chamar(w.base, CONFIRMAR('a@b.com', 'abcdef'))).json.codigo, 'codigo_formato');
  assert.equal((await chamar(w.base, CONFIRMAR('x', '123456'))).json.erro, 'E-mail inválido.');
  assert.equal((await chamar(w.base, { acao: 'codigo_confirmar', destino: 'a@b.com', codigo: '123456' })).json.erro,
    'Para criar a conta, aceite os termos de uso e o aviso de privacidade.');
  const wa = await chamar(w.base, CONFIRMAR('62999990000', '123456'));
  assert.equal(wa.json.codigo, 'canal_desligado');
  assert.equal(w.chamadasDb.length, antes, 'nenhuma tentativa foi gasta');
});

test('codigo_confirmar: conta do painel DISC (ou administradora) não entra por aqui, e nenhuma conta nova nasce', async () => {
  const w = preparar({ usuarios: [{ id: 'd1', email: 'dono@gestaosemcaos.com.br', confirmada: true, app: {} }], admins: ['d1'] });
  await chamar(w.base, PEDIR('dono@gestaosemcaos.com.br'));
  const r = await chamar(w.base, CONFIRMAR('dono@gestaosemcaos.com.br', '123456'));
  assert.equal(r.json.ok, false);
  assert.equal(r.json.codigo, 'conta_de_outro_sistema');
  assert.equal(w.garantidos.length, 0);
  assert.equal(w.links.length, 0, 'nenhuma sessão é aberta');
});

test('codigo_confirmar: se o banco recusa a conta nova, o usuário do Auth é apagado (sem conta pela metade)', async () => {
  const w = preparar({ garantirFalha: true });
  await chamar(w.base, PEDIR('a@b.com'));
  const r = await chamar(w.base, CONFIRMAR('a@b.com', '123456'));
  assert.equal(r.json.ok, false);
  assert.deepEqual(w.excluidos, ['novo-1']);
  assert.equal(w.usuarios.length, 0);
  assert.equal(w.links.length, 0);
});

test('codigo_confirmar: falha ao abrir a sessão devolve erro genérico (sem vazar nada) e não deixa o código valer de novo', async () => {
  const antes = console.error;
  console.error = () => {};
  try {
    const w = preparar({ sessaoFalha: true });
    await chamar(w.base, PEDIR('a@b.com'));
    const r = await chamar(w.base, CONFIRMAR('a@b.com', '123456'));
    assert.equal(r.json.ok, false);
    assert.equal(r.json.erro, 'Erro interno no servidor. Tente novamente em instantes.');
    assert.equal((await chamar(w.base, CONFIRMAR('a@b.com', '123456'))).json.codigo, 'codigo_vencido');
  } finally { console.error = antes; }
});

// ---------------------------------------------------------------------------------------------------------------------
// cnpj
// ---------------------------------------------------------------------------------------------------------------------

test('cnpj: empresa ATIVA, com a forma do contrato e a base consultada pelo servidor', async () => {
  const w = preparar();
  const r = await chamar(w.base, { acao: 'cnpj', cnpj: '11.222.333/0001-81' });
  assert.deepEqual(r.json, { ok: true, cnpj: CNPJ_OK, tipo: 'empresa', ativa: true, situacao: 'ativa', razaoSocial: 'PADARIA DO ZE LTDA', nomeFantasia: 'PADARIA DO ZÉ',
    cidade: 'Uruaçu', uf: 'GO', bairro: 'Centro', abertura: '2019-03-04', mei: false, setor: 'Padaria e confeitaria com predominância de revenda' });
  assert.deepEqual(w.consultasCnpj, [CNPJ_OK]);
  assert.deepEqual(w.limites[0], { acao: 'cnpj', cf: '', xff: '203.0.113.9, 10.0.0.1', ator: null });
  // contrato: cnpjConsultar
  const C = require('../../vagas/js/v2/contrato.js');
  assert.deepEqual(C.validar('cnpjConsultar', r.json), []);
});

test('cnpj: baixada, suspensa e MEI são lidas pela situação (ativa só se ATIVA)', async () => {
  const baixada = preparar({ brasilapi: () => new Response(JSON.stringify(respostaBrasilApi({ descricao_situacao_cadastral: 'BAIXADA', situacao_cadastral: 8 })), { status: 200 }) });
  const b = await chamar(baixada.base, { acao: 'cnpj', cnpj: CNPJ_OK });
  assert.equal(b.json.ok, true);
  assert.equal(b.json.ativa, false);
  assert.equal(b.json.situacao, 'baixada');
  const mei = preparar({ brasilapi: () => new Response(JSON.stringify(respostaBrasilApi({ opcao_pelo_mei: true })), { status: 200 }) });
  const m = await chamar(mei.base, { acao: 'cnpj', cnpj: CNPJ_OK });
  assert.equal(m.json.mei, true);
  assert.equal(m.json.tipo, 'mei');
  assert.equal(m.json.ativa, true);
});

test('cnpj: CPF digitado recebe a dica do CCMEI e não consulta nada', async () => {
  const w = preparar();
  const r = await chamar(w.base, { acao: 'cnpj', cnpj: '529.982.247-25' });
  assert.deepEqual(r.json, { ok: false, erro: 'Isto parece um CPF. O MEI tem CNPJ próprio: ele está no Certificado do MEI (CCMEI).', codigo: 'cpf' });
  assert.equal(r.json.erro, VAGAS_MSG_CPF);
  assert.deepEqual(w.consultasCnpj, []);
  assert.equal(pareceCpfVagas('52998224725'), true);
  assert.equal(pareceCpfVagas('11222333000181'), false);
});

test('cnpj: inválido não chega à consulta; alfanumérico (IN RFB 2.229/2024) é aceito e consultado', async () => {
  const w = preparar();
  const ruim = await chamar(w.base, { acao: 'cnpj', cnpj: '11222333000182' });
  assert.deepEqual(ruim.json, { ok: false, erro: 'CNPJ inválido. Confira os números.', codigo: 'cnpj_invalido' });
  assert.equal((await chamar(w.base, { acao: 'cnpj', cnpj: '' })).json.codigo, 'cnpj_invalido');
  assert.deepEqual(w.consultasCnpj, []);
  const alfa = cnpjAlfanumerico('12ABC34501DE');
  assert.equal(cnpjValidoVagas(alfa), true);
  assert.equal(REGRAS.cnpjValido(alfa), true, 'mesma regra do navegador e do banco');
  assert.equal(cnpjValidoVagas(alfa.slice(0, 13) + (alfa[13] === '0' ? '1' : '0')), false);
  const a = await chamar(w.base, { acao: 'cnpj', cnpj: alfa.slice(0, 2) + '.' + alfa.slice(2, 5) + '.' + alfa.slice(5, 8) + '/' + alfa.slice(8, 12) + '-' + alfa.slice(12).toLowerCase() });
  assert.equal(a.json.ok, true);
  assert.equal(a.json.cnpj, alfa);
  assert.deepEqual(w.consultasCnpj, [alfa]);
  for (const c of ['11222333000181', '00000000000191', '33000167000101', '07526557011659']) assert.equal(cnpjValidoVagas(c), REGRAS.cnpjValido(c), c);
});

test('cnpj: não encontrado (404) e consulta fora do ar NUNCA aprovam', async () => {
  const nada = preparar({ brasilapi: () => new Response('{"message":"CNPJ não encontrado"}', { status: 404 }) });
  assert.deepEqual((await chamar(nada.base, { acao: 'cnpj', cnpj: CNPJ_OK })).json,
    { ok: false, erro: 'Não achamos este CNPJ na Receita Federal. Confira os números.', codigo: 'cnpj_nao_encontrado' });
  const falhas = [
    () => new Response('erro', { status: 503 }),
    () => new Response('muitas', { status: 429 }),
    () => new Response('não é json', { status: 200 }),
    () => new Response('{"cnpj":"99999999000191","descricao_situacao_cadastral":"ATIVA"}', { status: 200 }),   // CNPJ diferente do pedido
    () => new Response('{}', { status: 200 }),
    () => { throw new Error('rede caiu'); }
  ];
  for (const f of falhas) {
    const w = preparar({ brasilapi: f });
    const r = await chamar(w.base, { acao: 'cnpj', cnpj: CNPJ_OK });
    assert.deepEqual(r.json, { ok: false, erro: 'Não deu para consultar o CNPJ agora. Tente de novo em instantes.', codigo: 'consulta_indisponivel' });
    assert.equal(r.json.erro, VAGAS_MSG_CNPJ_INDISPONIVEL);
    assert.equal(r.json.ativa, undefined);
  }
});

test('cnpj: tempo esgotado (8 s) vira consulta indisponível', async () => {
  const fetchLento = (url, o) => new Promise((res, rej) => { o.signal.addEventListener('abort', () => rej(new Error('abortado'))); });
  const r = await consultarCnpjVagas(fetchLento, CNPJ_OK, { prazoMs: 20, cache: new Map() });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'consulta_indisponivel');
});

test('cnpj: cache curto (5 min) só guarda consulta que deu certo; limite por origem', async () => {
  const w = preparar();
  await chamar(w.base, { acao: 'cnpj', cnpj: CNPJ_OK });
  await chamar(w.base, { acao: 'cnpj', cnpj: CNPJ_OK });
  assert.equal(w.consultasCnpj.length, 1);
  const cache = new Map();
  let t = 1000;
  const chamadas = [];
  const f = async (u) => { chamadas.push(u); return new Response(JSON.stringify(respostaBrasilApi()), { status: 200 }); };
  await consultarCnpjVagas(f, CNPJ_OK, { cache, agora: () => t });
  t += 299000;
  await consultarCnpjVagas(f, CNPJ_OK, { cache, agora: () => t });
  assert.equal(chamadas.length, 1);
  t += 2000;
  await consultarCnpjVagas(f, CNPJ_OK, { cache, agora: () => t });
  assert.equal(chamadas.length, 2);
  await consultarCnpjVagas(f, CNPJ_OK, { cache, agora: () => t, fresco: true });
  assert.equal(chamadas.length, 3, 'fresco ignora o cache');
  const fora = preparar({ brasilapi: () => new Response('x', { status: 500 }) });
  await chamar(fora.base, { acao: 'cnpj', cnpj: CNPJ_OK });
  await chamar(fora.base, { acao: 'cnpj', cnpj: CNPJ_OK });
  assert.equal(fora.consultasCnpj.length, 2, 'falha não vai para o cache');
  const bloq = preparar({ bloquearV2: true });
  assert.deepEqual((await chamar(bloq.base, { acao: 'cnpj', cnpj: CNPJ_OK })).json, { ok: false, erro: 'Muitas tentativas. Tente de novo mais tarde.', bloqueado: true });
  assert.equal(bloq.consultasCnpj.length, 0);
});

// ---------------------------------------------------------------------------------------------------------------------
// empresa_criar
// ---------------------------------------------------------------------------------------------------------------------

const EMPRESA_CORPO = { acao: 'empresa_criar', cnpj: CNPJ_OK, nomeFantasia: ' Padaria do Zé ', cidade: 'Uruaçu', bairro: 'Centro', setor: 'Alimentação',
  responsavel: 'Zé da Padaria', whatsapp: '(62) 99999-0000', email: 'Ze@Padaria.com' };

test('empresa_criar: precisa de login; refaz a consulta no servidor e chama o banco com os dados limpos', async () => {
  const w = preparar({ jwts: { tk: 'u-emp' } });
  assert.equal((await chamar(w.base, EMPRESA_CORPO)).json.sessaoExpirada, true);
  assert.deepEqual(w.consultasCnpj, []);
  const r = await chamar(w.base, EMPRESA_CORPO, { jwt: 'tk' });
  assert.equal(r.json.ok, true);
  assert.deepEqual(Object.keys(r.json).sort(), ['empresa', 'ok'], 'só a empresa volta');
  assert.equal(r.json.empresa.estado, 'em_verificacao');
  assert.deepEqual(w.consultasCnpj, [CNPJ_OK]);
  assert.deepEqual(w.empresasCriadas, [{ userId: 'u-emp', dados: {
    cnpj: CNPJ_OK, nomeFantasia: 'Padaria do Zé', cidade: 'Uruaçu', bairro: 'Centro', setor: 'Alimentação', responsavel: 'Zé da Padaria',
    whatsapp: '5562999990000', email: 'ze@padaria.com',
    consulta: { situacao: 'ativa', razaoSocial: 'PADARIA DO ZE LTDA', nomeFantasia: 'PADARIA DO ZÉ', cidade: 'Uruaçu', uf: 'GO', abertura: '2019-03-04', mei: false } } }]);
  assert.deepEqual(w.limites.map((l) => [l.acao, l.ator]), [['empresa_criar', 'u-emp']]);
});

test('empresa_criar: não confia no navegador — mesmo que o CNPJ tenha sido "ativo" antes, a consulta fresca manda', async () => {
  const w = preparar({ jwts: { tk: 'u-emp' } });
  await chamar(w.base, { acao: 'cnpj', cnpj: CNPJ_OK });
  await chamar(w.base, EMPRESA_CORPO, { jwt: 'tk' });
  assert.equal(w.consultasCnpj.length, 2, 'o cache da consulta pública não vale na criação');
});

test('empresa_criar: CNPJ baixado/suspenso é recusado com o motivo; sem consulta não cria; CPF e inválido também não', async () => {
  const baixada = preparar({ jwts: { tk: 'u' }, brasilapi: () => new Response(JSON.stringify(respostaBrasilApi({ descricao_situacao_cadastral: 'BAIXADA' })), { status: 200 }) });
  const b = await chamar(baixada.base, EMPRESA_CORPO, { jwt: 'tk' });
  assert.equal(b.json.ok, false);
  assert.equal(b.json.codigo, 'cnpj_inativo');
  assert.equal(b.json.situacao, 'baixada');
  assert.match(b.json.erro, /baixado na Receita Federal\. Só empresa com situação ATIVA pode anunciar/);
  assert.equal(baixada.empresasCriadas.length, 0);
  const suspensa = preparar({ jwts: { tk: 'u' }, brasilapi: () => new Response(JSON.stringify(respostaBrasilApi({ descricao_situacao_cadastral: 'SUSPENSA' })), { status: 200 }) });
  assert.match((await chamar(suspensa.base, EMPRESA_CORPO, { jwt: 'tk' })).json.erro, /suspenso/);
  const fora = preparar({ jwts: { tk: 'u' }, brasilapi: () => new Response('x', { status: 503 }) });
  const f = await chamar(fora.base, EMPRESA_CORPO, { jwt: 'tk' });
  assert.equal(f.json.codigo, 'consulta_indisponivel');
  assert.equal(fora.empresasCriadas.length, 0, 'nunca aprova sem consulta');
  const w = preparar({ jwts: { tk: 'u' } });
  assert.equal((await chamar(w.base, Object.assign({}, EMPRESA_CORPO, { cnpj: '529.982.247-25' }), { jwt: 'tk' })).json.codigo, 'cpf');
  assert.equal((await chamar(w.base, Object.assign({}, EMPRESA_CORPO, { cnpj: '11222333000182' }), { jwt: 'tk' })).json.codigo, 'cnpj_invalido');
  assert.equal(w.empresasCriadas.length, 0);
});

test('empresa_criar: campos obrigatórios e erro do banco (só mensagem e marcas conhecidas voltam)', async () => {
  const w = preparar({ jwts: { tk: 'u' }, empresaErro: 'Esta empresa já está cadastrada.' });
  const sem = (campo) => chamar(w.base, Object.assign({}, EMPRESA_CORPO, { [campo]: '' }), { jwt: 'tk' });
  assert.equal((await sem('responsavel')).json.erro, 'Diga o nome de quem responde pela empresa.');
  assert.equal((await sem('cidade')).json.erro, 'Escolha a cidade da empresa.');
  assert.equal((await sem('whatsapp')).json.erro, 'WhatsApp inválido. Digite o DDD e o número.');
  assert.equal((await chamar(w.base, Object.assign({}, EMPRESA_CORPO, { email: 'x' }), { jwt: 'tk' })).json.erro, 'E-mail inválido.');
  const r = await chamar(w.base, EMPRESA_CORPO, { jwt: 'tk' });
  assert.deepEqual(r.json, { ok: false, erro: 'Esta empresa já está cadastrada.', codigo: 'ja_existe' });
  assert.ok(!JSON.stringify(r.json).includes('segredoDoBanco'));
  const bloq = preparar({ jwts: { tk: 'u' }, bloquearV2: true });
  assert.equal((await chamar(bloq.base, EMPRESA_CORPO, { jwt: 'tk' })).json.bloqueado, true);
  assert.equal(bloq.consultasCnpj.length, 0);
});

// ---------------------------------------------------------------------------------------------------------------------
// arquivo_link / documento_link
// ---------------------------------------------------------------------------------------------------------------------

test('arquivo_link: o banco decide; a Function assina 5 minutos no bucket privado e devolve só {url, expiraEm}', async () => {
  const w = preparar({ jwts: { tk: 'u-emp' } });
  assert.equal((await chamar(w.base, { acao: 'arquivo_link', id: UUID1 })).json.sessaoExpirada, true);
  assert.equal((await chamar(w.base, { acao: 'arquivo_link', id: 'x' }, { jwt: 'tk' })).json.naoEncontrada, true);
  const r = await chamar(w.base, { acao: 'arquivo_link', id: UUID1 }, { jwt: 'tk' });
  assert.equal(r.json.ok, true);
  assert.deepEqual(Object.keys(r.json).sort(), ['expiraEm', 'ok', 'url']);
  assert.match(r.json.url, /^https:\/\/p\.supabase\.co\/storage\/v1\/object\/sign\/vagas-curriculos\/pessoa\/arq\.pdf\?token=/);
  assert.ok(Math.abs(new Date(r.json.expiraEm).getTime() - Date.now() - 300000) < 5000);
  assert.deepEqual(w.assinadas, [{ bucket: VAGAS_BUCKET_CURRICULOS, caminho: 'pessoa/arq.pdf', segundos: 300 }]);
  assert.deepEqual(w.chamadasDb.filter((c) => c[0] === 'arquivoLink'), [['arquivoLink', 'u-emp', UUID1]]);
  assert.ok(!JSON.stringify(r.json).includes('cv.pdf'), 'o nome interno não volta');
});

test('arquivo_link: o banco recusa (empresa em verificação sem liberação) e nada é assinado', async () => {
  const w = preparar({ jwts: { tk: 'u' }, arquivo: () => ({ ok: false, erro: 'A pessoa ainda não liberou o arquivo.', codigo: 'sem_liberacao', caminho: 'nao/pode.pdf' }) });
  const r = await chamar(w.base, { acao: 'arquivo_link', id: UUID1 }, { jwt: 'tk' });
  assert.deepEqual(r.json, { ok: false, erro: 'A pessoa ainda não liberou o arquivo.', codigo: 'sem_liberacao' });
  assert.deepEqual(w.assinadas, []);
});

test('documento_link: bucket de verificação, mesma regra', async () => {
  const w = preparar({ jwts: { tk: 'u-dono' } });
  const r = await chamar(w.base, { acao: 'documento_link', id: UUID2 }, { jwt: 'tk' });
  assert.equal(r.json.ok, true);
  assert.deepEqual(w.assinadas, [{ bucket: VAGAS_BUCKET_VERIFICACAO, caminho: 'empresa/doc.pdf', segundos: 300 }]);
  assert.deepEqual(w.chamadasDb.filter((c) => c[0] === 'documentoLink'), [['documentoLink', 'u-dono', UUID2]]);
  assert.deepEqual(w.limites.map((l) => l.acao), ['documento_link']);
  const bloq = preparar({ jwts: { tk: 'u' }, bloquearV2: true });
  assert.equal((await chamar(bloq.base, { acao: 'documento_link', id: UUID2 }, { jwt: 'tk' })).json.bloqueado, true);
  assert.deepEqual(bloq.assinadas, []);
});

// ---------------------------------------------------------------------------------------------------------------------
// CORS, segredos e ações antigas
// ---------------------------------------------------------------------------------------------------------------------

test('CORS: as ações novas respondem só à origem do site (e localhost); o preflight vale para todas', async () => {
  const w = preparar();
  const pre = await chamar(w.base, null, { metodo: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.cors, SITE);
  assert.equal((await chamar(w.base, PEDIR('a@b.com'), { origem: SITE })).cors, SITE);
  assert.equal((await chamar(w.base, { acao: 'cnpj', cnpj: CNPJ_OK }, { origem: 'http://localhost:4315' })).cors, 'http://localhost:4315');
  assert.equal((await chamar(w.base, { acao: 'cnpj', cnpj: CNPJ_OK }, { origem: 'https://golpe.exemplo.com' })).cors, null);
  assert.equal((await chamar(w.base, PEDIR('a@b.com'), { metodo: 'GET' })).status, 405);
});

test('segredos: nenhuma resposta das ações novas contém chave de serviço, chave do Resend, hash, sal ou código', async () => {
  const w = preparar({ jwts: { tk: 'u' } });
  const respostas = [];
  respostas.push((await chamar(w.base, PEDIR('a@b.com'))).json);
  respostas.push((await chamar(w.base, CONFIRMAR('a@b.com', '000000'))).json);
  respostas.push((await chamar(w.base, CONFIRMAR('a@b.com', '123456', { nome: 'Ana' }))).json);
  respostas.push((await chamar(w.base, { acao: 'cnpj', cnpj: CNPJ_OK })).json);
  respostas.push((await chamar(w.base, EMPRESA_CORPO, { jwt: 'tk' })).json);
  respostas.push((await chamar(w.base, { acao: 'arquivo_link', id: UUID1 }, { jwt: 'tk' })).json);
  const texto = JSON.stringify(respostas);
  const novo = w.chamadasDb.find((c) => c[0] === 'codigoNovo');
  for (const proibido of [CHAVE_SERVICO, CHAVE_RESEND, novo[3], novo[4]]) assert.ok(!texto.includes(proibido), 'vazou: ' + proibido.slice(0, 8));
  assert.ok(!texto.includes('"codigo":"123456"'));
});

test('ações antigas continuam (ação desconhecida, corpo vazio, JSON ruim)', async () => {
  const w = preparar();
  assert.deepEqual((await chamar(w.base, { acao: 'nao_existe' })).json, { ok: false, erro: 'Ação desconhecida.' });
  assert.deepEqual((await chamar(w.base, '')).json, { ok: false, erro: 'Requisição vazia.' });
  assert.deepEqual((await chamar(w.base, '{')).json, { ok: false, erro: 'JSON inválido.' });
});

// ---------------------------------------------------------------------------------------------------------------------
// Adaptador real com supabase-js falso
// ---------------------------------------------------------------------------------------------------------------------

test('base real: RPCs novas, confirmar e-mail e troca do link por sessão (verify do Auth)', async () => {
  const chamadas = [];
  const sbFalso = {
    rpc: async (nome, args) => { chamadas.push(['rpc', nome, args]); return { data: { ok: true }, error: null }; },
    auth: { admin: { updateUserById: async (id, a) => { chamadas.push(['updateUserById', id, a]); return { error: null }; } } }
  };
  const buscas = [];
  const buscaFalsa = async (url, o) => {
    buscas.push([String(url), o]);
    return new Response(JSON.stringify({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600, expires_at: 1900003600, user: { id: 'u1', email: 'a@b.com', outro: 'x' } }), { status: 200 });
  };
  const envs = { SUPABASE_URL: 'https://p.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'servico', SUPABASE_ANON_KEY: 'anon' };
  const b = criarBaseVagasConta(() => sbFalso, (n) => envs[n] || '', { fetch: buscaFalsa });
  await b.db.codigoNovo('email', 'a@b.com', 'aa', 'bb', '1.2.3.4', 'x');
  await b.db.codigoTentar('a@b.com', '1.2.3.4', '');
  await b.db.codigoUsar(UUID1);
  await b.db.codigoCancelar(UUID1);
  await b.db.limiteV2('cnpj', '1.2.3.4', '', '', null);
  await b.db.contaGarantir('u1', { tipo: 'pessoa' });
  await b.db.empresaCriar('u1', { cnpj: CNPJ_OK });
  await b.db.arquivoLink('u1', UUID1);
  await b.db.documentoLink('u1', UUID2);
  await b.auth.confirmarEmail('u1');
  const s = await b.auth.sessaoDoLink('hash-do-link');
  assert.deepEqual(chamadas.map((c) => c[1] || c[0]), ['vagas_conta_codigo_novo', 'vagas_conta_codigo_tentar', 'vagas_conta_codigo_usar', 'vagas_conta_codigo_cancelar',
    'vagas_conta_limite_v2', 'vagas_v2_conta_garantir_servidor', 'vagas_v2_empresa_criar_servidor', 'vagas_v2_arquivo_link_servidor', 'vagas_v2_documento_link_servidor', 'u1']);
  assert.deepEqual(chamadas[0][2], { p_canal: 'email', p_destino: 'a@b.com', p_sal: 'aa', p_hash: 'bb', p_cf: '1.2.3.4', p_xff: 'x' });
  assert.deepEqual(chamadas[5][2], { p_uid: 'u1', p_dados: { tipo: 'pessoa' } });
  assert.deepEqual(chamadas[7][2], { p_uid: 'u1', p_candidatura: UUID1 });
  assert.deepEqual(chamadas[8][2], { p_uid: 'u1', p_documento: UUID2 });
  assert.deepEqual(chamadas[9], ['updateUserById', 'u1', { email_confirm: true }]);
  assert.equal(buscas[0][0], 'https://p.supabase.co/auth/v1/verify');
  assert.equal(buscas[0][1].headers.apikey, 'anon');
  assert.deepEqual(JSON.parse(buscas[0][1].body), { type: 'magiclink', token_hash: 'hash-do-link' });
  assert.deepEqual(s, { access_token: 'a1', refresh_token: 'r1', expires_at: 1900003600, user: { id: 'u1', email: 'a@b.com' } });
  const semAnon = criarBaseVagasConta(() => sbFalso, (n) => ({ SUPABASE_URL: 'https://p.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'servico' }[n] || ''), { fetch: buscaFalsa });
  await semAnon.auth.sessaoDoLink('h');
  assert.equal(buscas[1][1].headers.apikey, 'servico');
  const quebrada = criarBaseVagasConta(() => sbFalso, () => 'x', { fetch: async () => new Response('{"msg":"token invalido"}', { status: 403 }) });
  await assert.rejects(() => quebrada.auth.sessaoDoLink('h'), (e) => /HTTP 403/.test(e.message) && !/token/.test(e.message));
});

// ---------------------------------------------------------------------------------------------------------------------
// Peças puras
// ---------------------------------------------------------------------------------------------------------------------

test('gerarCodigoVagas: sempre 6 dígitos, com zeros à esquerda e sem viés (descarta o que passa do teto)', () => {
  assert.equal(gerarCodigoVagas(() => 0), '000000');
  assert.equal(gerarCodigoVagas(() => 7), '000007');
  assert.equal(gerarCodigoVagas(() => 999999), '999999');
  const fila = [4294967295, 4294000000, 1234567];
  assert.equal(gerarCodigoVagas(() => fila.shift()), '234567', 'valores acima do teto são sorteados de novo');
  for (let i = 0; i < 200; i++) assert.match(gerarCodigoVagas(), /^[0-9]{6}$/);
  assert.match(gerarSalVagas(), /^[0-9a-f]{32}$/);
  assert.notEqual(gerarSalVagas(), gerarSalVagas());
  assert.equal(codigoDigitadoVagas(' 123-456 '), '123456');
  assert.equal(codigoDigitadoVagas('12345a'), '');
});

test('e-mail do código: tem o código, o prazo e a frase anti-golpe palavra por palavra', () => {
  const m = montarEmailCodigoVagas({ codigo: '042042', logo: 'https://x/logo.png' });
  assert.equal(m.assunto, 'Seu código do Vagas sem Caos: 042042');
  assert.ok(m.texto.includes(VAGAS_FRASE_GOLPE));
  assert.ok(m.html.includes(VAGAS_FRASE_GOLPE));
  assert.ok(m.texto.includes('Vale por 10 minutos'));
  assert.ok(!/<script|style="[^"]*url\(/i.test(m.html));
  const C = require('../../vagas/js/v2/contrato.js');
  assert.equal(VAGAS_FRASE_GOLPE, C.FRASE_GOLPE, 'a frase do servidor é a do contrato');
  assert.ok(!new RegExp(C.PROIBIDAS.filter((p) => p !== 'disc').join('|'), 'i').test(m.texto));
});

test('interpretarCnpjVagas e nomeProprioVagas', () => {
  assert.equal(nomeProprioVagas('SANTA CRUZ DE GOIÁS'), 'Santa Cruz de Goiás');
  assert.equal(interpretarCnpjVagas({}, CNPJ_OK), null);
  assert.equal(interpretarCnpjVagas(respostaBrasilApi({ descricao_situacao_cadastral: '', situacao_cadastral: 2 }), CNPJ_OK).ativa, true, 'o código 2 também vale');
  assert.equal(interpretarCnpjVagas(respostaBrasilApi({ descricao_situacao_cadastral: '', situacao_cadastral: 8 }), CNPJ_OK), null, 'sem situação conhecida não aprova');
  assert.equal(interpretarCnpjVagas(respostaBrasilApi({ descricao_situacao_cadastral: 'Baixada' }), CNPJ_OK).situacao, 'baixada');
  assert.equal(interpretarCnpjVagas(respostaBrasilApi({ data_inicio_atividade: 'ontem' }), CNPJ_OK).abertura, null);
  assert.equal(whatsappDigitosVagas('(62) 99999-0000'), '5562999990000');
  assert.equal(whatsappDigitosVagas('123'), '');
});
