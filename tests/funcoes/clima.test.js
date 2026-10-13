// Edge Function "clima" (código de confirmação do link pessoal da Pesquisa de Clima) e a ação "clima.envios" da função
// admin, com banco, Resend e WhatsApp falsos (nenhuma chamada real).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  atenderClima, acaoClimaCodigo, climaEnviosDisponiveis, montarEmailCodigoClima, lerEnvClima, criarDbClima,
  CLIMA_MSG_LINK, CLIMA_MSG_NAO_CONFIGURADO, CLIMA_MSG_FALHOU
} from '../../supabase/funcoes-compartilhadas/clima.js';
import { criarWhatsApp, PROVEDORES_WHATSAPP } from '../../supabase/funcoes-compartilhadas/whatsapp.js';
import { ACOES_ADMIN } from '../../supabase/funcoes-compartilhadas/admin.js';

const TOKEN = 'a'.repeat(64);
const SITE = 'https://disc.gestaosemcaos.com.br';

function preparar(op) {
  op = op || {};
  const pedidos = [];
  const db = {
    async codigoNovo(token, canal) {
      pedidos.push({ token, canal });
      if (op.dbFalha) throw new Error('falha no banco de dados (x)');
      if (token !== TOKEN) return { ok: false, erro: CLIMA_MSG_LINK };
      return { ok: true, codigo: '048213', canal, destino: canal === 'email' ? 'ana.souza@empresa.com.br' : '5511999998888',
        destinoMascarado: canal === 'email' ? 'a***@e***.com.br' : 'final 88', empresaNome: 'Clínica <Exemplo>', minutos: 10 };
    }
  };
  const enviados = [];
  async function fetch(url, o) {
    if (String(url) !== 'https://api.resend.com/emails') throw new Error('teste: chamada externa inesperada para ' + url);
    enviados.push(JSON.parse(o.body));
    if (op.resendFalha) return new Response('{"message":"x"}', { status: 500 });
    return new Response('{"id":"em_1"}', { status: 200 });
  }
  const base = { env: Object.assign({ SITE_URL: SITE, RESEND_API_KEY: 're_teste', EMAIL_REMETENTE: 'Gestão sem Caos <nao-responda@gestaosemcaos.com.br>' }, op.env), fetch, db };
  return { base, pedidos, enviados };
}
function req(corpo, op) {
  op = op || {};
  return new Request('https://x/functions/v1/clima', { method: op.metodo || 'POST', headers: { origin: op.origem || SITE, 'content-type': 'application/json' },
    body: op.metodo === 'GET' || op.metodo === 'OPTIONS' ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) });
}

test('código por e-mail: o banco gera, a função manda pelo Resend e devolve só o destino mascarado', async () => {
  const { base, pedidos, enviados } = preparar();
  const r = await acaoClimaCodigo(base, { acao: 'codigo', token: TOKEN.toUpperCase(), canal: 'email' });
  assert.deepEqual(r, { ok: true, canal: 'email', destino: 'a***@e***.com.br', minutos: 10 });
  assert.deepEqual(pedidos, [{ token: TOKEN, canal: 'email' }]);
  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0].to, ['ana.souza@empresa.com.br']);
  assert.match(enviados[0].subject, /048213/);
  assert.match(enviados[0].html, /048213/);
  assert.ok(enviados[0].html.includes('Cl&iacute;nica') || enviados[0].html.includes('Clínica &lt;Exemplo&gt;'), 'empresa escapada');
  assert.ok(!/notus/i.test(enviados[0].html + enviados[0].text), 'só a marca Gestão sem Caos');
  assert.match(enviados[0].text, /Só a consultoria \(Gestão sem Caos\) vê o seu nome/);
  assert.ok(!JSON.stringify(r).includes('048213'), 'o código nunca volta para o navegador');
});

test('mensagem única e nada enviado: token ou canal inválidos, link sem e-mail, e-mail ou WhatsApp sem configurar', async () => {
  const { base, pedidos, enviados } = preparar();
  assert.deepEqual(await acaoClimaCodigo(base, { token: 'x', canal: 'email' }), { ok: false, erro: CLIMA_MSG_LINK });
  assert.deepEqual(await acaoClimaCodigo(base, { token: TOKEN, canal: 'sms' }), { ok: false, erro: CLIMA_MSG_LINK });
  assert.deepEqual(await acaoClimaCodigo(base, { token: 'b'.repeat(64), canal: 'email' }), { ok: false, erro: CLIMA_MSG_LINK });
  // WhatsApp sem provedor: nem chega ao banco.
  assert.deepEqual(await acaoClimaCodigo(base, { token: TOKEN, canal: 'whatsapp' }), { ok: false, erro: CLIMA_MSG_NAO_CONFIGURADO, naoConfigurado: true });
  const sem = preparar({ env: { RESEND_API_KEY: '' } });
  assert.equal((await acaoClimaCodigo(sem.base, { token: TOKEN, canal: 'email' })).naoConfigurado, true);
  assert.equal(sem.pedidos.length, 0);
  assert.equal(pedidos.length, 1);
  assert.equal(enviados.length, 0);
  // Resend fora: mensagem de tentar de novo (o código gerado só vale com o envio).
  const falha = preparar({ resendFalha: true });
  assert.deepEqual(await acaoClimaCodigo(falha.base, { token: TOKEN, canal: 'email' }), { ok: false, erro: CLIMA_MSG_FALHOU });
});

test('WhatsApp: a interface está pronta; com um provedor registrado o código vai por ele', async () => {
  assert.equal(criarWhatsApp({ env: {} }).configurado, false);
  assert.equal(criarWhatsApp({ env: { WHATSAPP_PROVEDOR: 'inexistente' } }).configurado, false);
  await assert.rejects(criarWhatsApp({ env: {} }).enviarCodigo({ para: '5511', codigo: '1' }), /nenhum provedor/);
  const mandados = [];
  PROVEDORES_WHATSAPP.teste = ({ env }) => ({ configurado: !!env.WHATSAPP_TESTE_CHAVE, async enviarCodigo(m) { mandados.push(m); return { id: 'w1' }; } });
  try {
    assert.deepEqual(climaEnviosDisponiveis({ RESEND_API_KEY: '', WHATSAPP_PROVEDOR: 'teste' }), { email: false, whatsapp: false });
    const { base } = preparar({ env: { WHATSAPP_PROVEDOR: 'Teste', WHATSAPP_TESTE_CHAVE: 'k' } });
    assert.deepEqual(climaEnviosDisponiveis(base.env), { email: true, whatsapp: true });
    const r = await acaoClimaCodigo(base, { token: TOKEN, canal: 'whatsapp' });
    assert.deepEqual(r, { ok: true, canal: 'whatsapp', destino: 'final 88', minutos: 10 });
    assert.deepEqual(mandados, [{ para: '5511999998888', codigo: '048213', empresa: 'Clínica <Exemplo>', minutos: 10 }]);
    // A função admin diz ao painel o que está ligado (sem valores de segredos).
    assert.deepEqual(await ACOES_ADMIN['clima.envios']({ env: base.env }), { ok: true, email: true, whatsapp: true });
  } finally {
    delete PROVEDORES_WHATSAPP.teste;
  }
  assert.deepEqual(await ACOES_ADMIN['clima.envios']({ env: { RESEND_API_KEY: 're_x' } }), { ok: true, email: true, whatsapp: false });
});

test('HTTP: CORS só do site, método, corpo, ação desconhecida e erro interno sem detalhes', async () => {
  const { base } = preparar();
  const ok = await atenderClima(req({ acao: 'codigo', token: TOKEN, canal: 'email' }), base);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), SITE);
  assert.equal((await ok.json()).ok, true);
  const fora = await atenderClima(req({ acao: 'codigo', token: TOKEN, canal: 'email' }, { origem: 'https://malicioso.example' }), base);
  assert.equal(fora.headers.get('access-control-allow-origin'), null);
  assert.equal((await atenderClima(req(null, { metodo: 'OPTIONS' }), base)).status, 204);
  assert.equal((await atenderClima(req(null, { metodo: 'GET' }), base)).status, 405);
  assert.equal((await (await atenderClima(req('{x'), base)).json()).erro, 'JSON inválido.');
  assert.equal((await (await atenderClima(req('x'.repeat(3000)), base)).json()).erro, 'Requisição grande demais.');
  assert.equal((await (await atenderClima(req({ acao: 'outra' }), base)).json()).erro, 'Ação desconhecida.');
  const quebrado = preparar({ dbFalha: true });
  const r = await (await atenderClima(req({ acao: 'codigo', token: TOKEN, canal: 'email' }), quebrado.base)).json();
  assert.deepEqual(r, { ok: false, erro: 'Erro interno no servidor. Tente novamente em instantes.' });
});

test('e-mail do código, leitura dos segredos e o adaptador do banco', async () => {
  const m = montarEmailCodigoClima({ codigo: '123456', empresa: 'Clínica Exemplo', minutos: 10 });
  assert.match(m.assunto, /^Seu código: 123456/);
  assert.match(m.texto, /vale por 10 minutos/);
  assert.ok(m.html.includes('gsc-logo-email.png'));
  const env = lerEnvClima((n) => ({ RESEND_API_KEY: ' re_1 ', WHATSAPP_PROVEDOR: 'x', OUTRO: 'nao' })[n]);
  assert.equal(env.RESEND_API_KEY, 're_1');
  assert.equal(env.WHATSAPP_PROVEDOR, 'x');
  assert.equal(env.OUTRO, undefined);
  const chamadas = [];
  const db = criarDbClima({ rpc: async (nome, args) => { chamadas.push({ nome, args }); return { data: '{"ok":true,"codigo":"1"}', error: null }; } });
  assert.deepEqual(await db.codigoNovo(TOKEN, 'email'), { ok: true, codigo: '1' });
  assert.deepEqual(chamadas, [{ nome: 'clima_codigo_novo', args: { p_token: TOKEN, p_canal: 'email' } }]);
  const dbErro = criarDbClima({ rpc: async () => ({ data: null, error: { message: 'boom' } }) });
  await assert.rejects(dbErro.codigoNovo(TOKEN, 'email'), /falha no banco de dados \(boom\)/);
});
