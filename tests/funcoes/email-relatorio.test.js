// Ação "relatorio.enviarEmail" da Edge Function "admin" e o e-mail com a marca (supabase/funcoes-compartilhadas/email.js),
// com banco, Auth e Resend falsos (fetch falso: nenhuma chamada real).
import test from 'node:test';
import assert from 'node:assert/strict';
import { criarDbFalso, UUID_ADMIN } from './apoio.js';
import { atenderAdmin } from '../../supabase/funcoes-compartilhadas/http.js';
import { LIMITE_EMAILS_HORA, MSG_EMAIL_PAINEL_NAO_CONFIGURADO } from '../../supabase/funcoes-compartilhadas/admin.js';
import { montarEmailRelatorio, escaparHtml, ASSUNTOS_RELATORIO, LOGO_EMAIL, linhaEnvio, registrarEnvio } from '../../supabase/funcoes-compartilhadas/email.js';
import { criarResend } from '../../supabase/funcoes-compartilhadas/asaas.js';

const SITE = 'https://disc.gestaosemcaos.com.br';
const TOKEN_PUB = 'c'.repeat(64);
const TOKEN_RASC = 'd'.repeat(64);
const TOKEN_PESSOA = 'e'.repeat(48);

function preparar(op) {
  op = op || {};
  const db = criarDbFalso({
    admins: [{ user_id: UUID_ADMIN, nome: 'Wellington Venâncio', criado_em: '2026-09-01T00:00:00Z' }],
    relatorios: [
      { token: TOKEN_PUB, processo_id: 'p1', modelo: 'processo', status: 'publicado', dados: { processo: { nome: 'Recepção' } } },
      { token: TOKEN_RASC, processo_id: 'p1', modelo: 'processo', status: 'rascunho', dados: {} },
      { token: TOKEN_PESSOA, processo_id: null, modelo: 'pessoa', status: 'publicado', dados: { modelo: 'pessoa', titulo: 'Seu perfil DISC — Ana <b>' } }
    ]
  });
  const enviados = [];
  async function fetch(url, o) {
    if (String(url) !== 'https://api.resend.com/emails') throw new Error('teste: chamada externa inesperada para ' + url);
    const corpo = JSON.parse(o.body);
    enviados.push({ corpo, headers: o.headers });
    if (op.resendFalha) return new Response('{"message":"x"}', { status: 500 });
    return new Response('{"id":"em_1"}', { status: 200 });
  }
  let relogio = Date.parse('2026-10-06T12:00:00Z');
  const base = {
    env: Object.assign({ SITE_URL: SITE + '/', RESEND_API_KEY: 're_teste', EMAIL_REMETENTE: 'Gestão sem Caos <nao-responda@gestaosemcaos.com.br>' }, op.env),
    fetch, db, authAdmin: {}, agora: () => relogio,
    autenticar: async (h) => (h === 'Bearer jwt-admin' ? { usuario: { id: UUID_ADMIN, email: 'dona@empresa.com' }, eAdmin: true }
      : (h === 'Bearer jwt-comum' ? { usuario: { id: 'x', email: 'x@x.com' }, eAdmin: false } : null))
  };
  async function chamar(corpo, jwt) {
    const req = new Request('https://x.supabase.co/functions/v1/admin', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json', origin: SITE }, jwt === null ? {} : { authorization: 'Bearer ' + (jwt || 'jwt-admin') }),
      body: JSON.stringify(corpo)
    });
    return (await atenderAdmin(req, base)).json();
  }
  return { db, chamar, enviados, avancar: (ms) => { relogio += ms; } };
}

test('enviarEmail: só admin logado; e-mail e relatório validados; rascunho não vai', async () => {
  const { chamar, enviados } = preparar();
  const acao = 'relatorio.enviarEmail';
  assert.equal((await chamar({ acao, relatorioToken: TOKEN_PUB, para: 'a@b.com' }, null)).sessaoExpirada, true);
  assert.equal((await chamar({ acao, relatorioToken: TOKEN_PUB, para: 'a@b.com' }, 'jwt-comum')).ok, false);
  assert.equal((await chamar({ acao, relatorioToken: TOKEN_PUB, para: 'sem-arroba' })).erro, 'Informe um e-mail válido para o destinatário.');
  assert.equal((await chamar({ acao, relatorioToken: 'x', para: 'a@b.com' })).erro, 'Relatório não encontrado.');
  assert.equal((await chamar({ acao, relatorioToken: 'f'.repeat(64), para: 'a@b.com' })).erro, 'Relatório não encontrado.');
  assert.equal((await chamar({ acao, relatorioToken: TOKEN_RASC, para: 'a@b.com' })).erro, 'Publique o relatório antes de enviar o link.');
  assert.equal(enviados.length, 0);
});

test('enviarEmail: sem RESEND_API_KEY -> mensagem clara (veja Conexões) e naoConfigurado; sem SITE_URL nem https -> orienta', async () => {
  const a = preparar({ env: { RESEND_API_KEY: '' } });
  assert.deepEqual(await a.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'a@b.com' }),
    { ok: false, erro: MSG_EMAIL_PAINEL_NAO_CONFIGURADO, naoConfigurado: true });
  assert.equal(MSG_EMAIL_PAINEL_NAO_CONFIGURADO, 'O envio por e-mail ainda não está configurado (veja Conexões).');
  const b = preparar({ env: { SITE_URL: '' } });
  assert.match((await b.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'a@b.com', baseUrl: 'http://localhost:4173/admin.html' })).erro, /SITE_URL/);
  const ok = await b.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'a@b.com', baseUrl: 'https://outro.exemplo.com/admin.html' });
  assert.equal(ok.ok, true);
  assert.ok(b.enviados[0].corpo.html.includes('https://outro.exemplo.com/relatorio.html?r=' + TOKEN_PUB));
});

test('enviarEmail: manda só o link, com a marca, assunto do modelo e tudo escapado', async () => {
  const { chamar, enviados } = preparar();
  const r = await chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PESSOA, para: ' Ana@Exemplo.com ', nome: 'Ana <script>', mensagem: 'Oi & <b>tchau</b>', baseUrl: 'https://malicioso.exemplo/admin.html' });
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.para, 'ana@exemplo.com');
  assert.equal(r.assunto, 'Seu relatório DISC — Gestão sem Caos');
  assert.equal(enviados.length, 1);
  const c = enviados[0].corpo;
  assert.deepEqual(c.to, ['ana@exemplo.com']);
  assert.equal(c.from, 'Gestão sem Caos <nao-responda@gestaosemcaos.com.br>');
  assert.equal(enviados[0].headers.Authorization, 'Bearer re_teste');
  assert.equal(c.subject, ASSUNTOS_RELATORIO.pessoa);
  const url = SITE + '/relatorio.html?r=' + TOKEN_PESSOA; // SITE_URL vence o baseUrl do painel
  assert.ok(c.html.includes('href="' + url + '"'));
  assert.ok(!c.html.includes('malicioso'));
  assert.ok(c.html.includes(LOGO_EMAIL));
  assert.ok(c.html.includes('#F34405'));
  assert.ok(c.html.includes('>Ver relatório</a>'));
  assert.ok(!c.html.includes('<script>') && !c.html.includes('<b>'));
  assert.ok(c.html.includes('Olá, Ana!') && c.html.includes('Oi &amp; &lt;b&gt;tchau&lt;/b&gt;'));
  assert.ok(c.html.includes('Seu perfil DISC — Ana &lt;b&gt;'));
  assert.ok(c.html.includes('Wellington Venâncio, da Gestão sem Caos,'));
  assert.ok(!/Notus/i.test(c.html + c.text));
  assert.ok(!('attachments' in c));
  assert.ok(c.text.includes('Ver relatório: ' + url));
});

test('enviarEmail: limite de ' + LIMITE_EMAILS_HORA + ' por hora por admin; falha do Resend vira mensagem em português', async () => {
  const t = preparar();
  for (let i = 0; i < LIMITE_EMAILS_HORA; i++) assert.equal((await t.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'a@b.com' })).ok, true);
  assert.match((await t.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'a@b.com' })).erro, /^Limite de 30 e-mails por hora/);
  assert.equal(t.enviados.length, LIMITE_EMAILS_HORA);
  assert.equal(t.db.st.limites.every((l) => l.tipo === 'relatorio_email' && l.chave === UUID_ADMIN), true);
  t.avancar(3600001);
  assert.equal((await t.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'a@b.com' })).ok, true);
  const f = preparar({ resendFalha: true });
  assert.match((await f.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'a@b.com' })).erro, /^Não foi possível enviar o e-mail agora/);
});

test('montarEmailRelatorio: assunto por modelo, sem nome -> "Olá!", escaparHtml', () => {
  assert.equal(montarEmailRelatorio({ modelo: 'equipe', url: 'https://x/r' }).assunto, 'Relatório de equipe — Gestão sem Caos');
  assert.equal(montarEmailRelatorio({ modelo: 'lideranca', url: 'https://x/r' }).assunto, 'Como liderar — relatório da Gestão sem Caos');
  assert.equal(montarEmailRelatorio({ modelo: 'qualquer', url: 'https://x/r' }).assunto, 'Relatório do processo seletivo — Gestão sem Caos');
  const m = montarEmailRelatorio({ modelo: 'processo', url: 'https://x/r?a=1&b="2"' });
  assert.ok(m.html.includes('Olá!'));
  assert.ok(m.html.includes('href="https://x/r?a=1&amp;b=&quot;2&quot;"'));
  assert.equal(escaparHtml(`<a href='x'>&</a>`), '&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;');
});

test('histórico: cada envio (ok ou erro) vai para envios_email com quem enviou, quando e o id do Resend', async () => {
  const t = preparar();
  const r = await t.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'Dono@Empresa.com', nome: 'Dono', mensagem: 'segredo' });
  assert.equal(r.ok, true, r.erro);
  assert.equal(r.por, 'Wellington Venâncio');
  assert.deepEqual(t.db.st.envios, [{ tipo: 'relatorio', referencia: TOKEN_PUB, destinatario: 'dono@empresa.com', enviado_por: 'Wellington Venâncio',
    enviado_por_id: UUID_ADMIN, em: r.enviadoEm, resultado: 'ok', provedor_id: 'em_1' }]);
  assert.ok(!JSON.stringify(t.db.st.envios).includes('segredo'), 'nada do conteúdo do e-mail');
  // Falha do Resend: registrada como erro (sem id), e a resposta continua sendo o erro em português.
  const f = preparar({ resendFalha: true });
  assert.equal((await f.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'a@b.com' })).ok, false);
  assert.deepEqual(f.db.st.envios.map((e) => [e.resultado, e.provedor_id, e.destinatario]), [['erro', null, 'a@b.com']]);
  // Recusas antes de chamar o Resend (rascunho, e-mail inválido) não entram no histórico.
  await f.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_RASC, para: 'a@b.com' });
  await f.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'x' });
  assert.equal(f.db.st.envios.length, 1);
  // O banco sem a tabela (migração não aplicada) não atrapalha o envio.
  const sem = preparar();
  sem.db.st.envioFalha = true;
  assert.equal((await sem.chamar({ acao: 'relatorio.enviarEmail', relatorioToken: TOKEN_PUB, para: 'a@b.com' })).ok, true);
});

test('linhaEnvio / registrarEnvio: só o combinado, validado como na tabela; nunca lança', async () => {
  const base = { tipo: 'pedido', referencia: '0b6f6a52-6c1e-4c55-9d3b-1d2f0e9a7c11', destinatario: ' Bia@Exemplo.com ', resultado: 'ok', em: '2026-10-06T12:00:00.000Z' };
  assert.deepEqual(linhaEnvio(base), { tipo: 'pedido', referencia: base.referencia, destinatario: 'bia@exemplo.com', enviado_por: 'cliente',
    enviado_por_id: null, em: base.em, resultado: 'ok', provedor_id: null });
  assert.equal(linhaEnvio(Object.assign({}, base, { enviadoPorId: UUID_ADMIN, enviadoPor: '' })).enviado_por, 'Administrador');
  assert.equal(linhaEnvio(Object.assign({}, base, { enviadoPorId: UUID_ADMIN, enviadoPor: ' Ana\n  Souza ' })).enviado_por, 'Ana Souza');
  assert.equal(linhaEnvio(Object.assign({}, base, { resultado: 'qualquer' })).resultado, 'erro');
  assert.equal(linhaEnvio(Object.assign({}, base, { provedorId: '<x>' })).provedor_id, null);
  assert.equal(linhaEnvio(Object.assign({}, base, { provedorId: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' })).provedor_id, '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794');
  for (const ruim of [{ tipo: 'outro' }, { referencia: 'a b' }, { referencia: '' }, { destinatario: 'sem-arroba' }, { enviadoPorId: 'nao-uuid' }]) {
    assert.equal(linhaEnvio(Object.assign({}, base, ruim)), null, JSON.stringify(ruim));
  }
  assert.equal(await registrarEnvio(null, base), false);
  assert.equal(await registrarEnvio({ envioRegistrar: async () => { throw new Error('sem tabela'); } }, base), false);
  const gravadas = [];
  assert.equal(await registrarEnvio({ envioRegistrar: async (l) => { gravadas.push(l); } }, base), true);
  assert.equal(gravadas.length, 1);
});

test('criarResend: devolve o id do e-mail no Resend (vazio se não vier)', async () => {
  const com = criarResend({ apiKey: 're_x', fetch: async () => new Response('{"id":"49a3999c-0ce1"}', { status: 200 }) });
  assert.deepEqual(await com.enviar({ para: 'a@b.com', assunto: 'x', html: '<p>x</p>', texto: 'x' }), { id: '49a3999c-0ce1' });
  const sem = criarResend({ apiKey: 're_x', fetch: async () => new Response('não é json', { status: 200 }) });
  assert.deepEqual(await sem.enviar({ para: 'a@b.com', assunto: 'x', html: '', texto: '' }), { id: '' });
  const falha = criarResend({ apiKey: 're_x', fetch: async () => new Response('{}', { status: 422 }) });
  await assert.rejects(falha.enviar({ para: 'a@b.com', assunto: 'x', html: '', texto: '' }), /Resend: HTTP 422/);
});
