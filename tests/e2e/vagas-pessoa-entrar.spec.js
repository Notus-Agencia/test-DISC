// Vagas sem Caos — entrar.html no celular (projeto vagas-celular, Pixel 5), sobre a PRÉVIA (dados fictícios no navegador):
// criar conta sem senha, link do e-mail -> "Crie sua senha", entrar com ?voltar= validado, erro único de login, esqueci a senha,
// link vencido, armazenamento bloqueado (sessionStorage e memória) e as peças da base (VAGAS_UI.el, janela, cartão cego, selo,
// conversa) rodando no navegador de verdade.
const { test, expect } = require('@playwright/test');

const BASE = '/vagas/';
const SENHA = 'previa123';

function coletarErros(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404 \(Not Found\)/.test(m.text())) erros.push('console: ' + m.text()); });
  return erros;
}
// Bloqueia o armazenamento do navegador antes de qualquer script da página (navegador em modo restrito).
async function bloquear(page, nomes) {
  await page.addInitScript((lista) => {
    for (const n of lista) Object.defineProperty(window, n, { configurable: true, get() { throw new DOMException('bloqueado', 'SecurityError'); } });
  }, nomes);
}

test('criar conta sem senha: erros nos campos, resposta neutra, link da prévia, "Crie sua senha" e vai para o currículo', async ({ page }) => {
  const erros = coletarErros(page);
  await page.goto(BASE + 'entrar.html');
  await expect(page.locator('#vg-criar-titulo')).toBeFocused();
  await expect(page.locator('#vg-aba-criar')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vg-form-criar input[type="password"]')).toHaveCount(0);
  await expect(page.locator('#vg-aviso-golpe')).toContainText('Nunca pague para se candidatar.');
  await page.click('#vg-criar-enviar');
  await expect(page.locator('#vg-criar-nome-erro')).toHaveText('Escreva o seu nome');
  await expect(page.locator('#vg-criar-email-erro')).toHaveText('Esse e-mail parece incompleto. Confira se tem o ".com" no fim.');
  await expect(page.locator('#vg-criar-termos-erro')).toHaveText('Marque a caixa para continuar');
  await expect(page.locator('#vg-criar-nome')).toBeFocused();
  await expect(page.locator('#vg-criar-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#vg-criar-email')).toHaveAttribute('aria-describedby', /vg-criar-email-erro/);
  await page.fill('#vg-criar-nome', 'Pessoa Teste');
  await page.fill('#vg-criar-email', 'nova.pessoa@exemplo.com');
  await page.check('#vg-criar-termos');
  await page.click('#vg-criar-enviar');
  await expect(page.locator('#vg-confirmar-email')).toContainText('Se este e-mail puder ser usado, você vai receber um link em instantes.');
  await expect(page.locator('#vg-reenviar')).toBeDisabled();
  await expect(page.locator('#vg-reenviar')).toContainText('Reenviar em');
  await page.click('#vg-abrir-link-previa');
  await expect(page.locator('#vg-ns-titulo')).toHaveText('Crie sua senha');
  await expect(page).toHaveURL(/entrar\.html$/);   // o token sai da barra
  await expect(page.locator('#vg-ns-email')).toHaveValue('nova.pessoa@exemplo.com');
  await expect(page.locator('#vg-ns-email')).toHaveAttribute('readonly', '');
  await page.fill('#vg-ns-senha', 'curta');
  await page.click('#vg-ns-salvar');
  await expect(page.locator('#vg-ns-senha-erro')).toHaveText('A senha precisa ter de 8 a 72 caracteres.');
  await page.fill('#vg-ns-senha', 'senha-boa-123');
  await page.fill('#vg-ns-confirmar', 'senha-boa-124');
  await page.click('#vg-ns-salvar');
  await expect(page.locator('#vg-ns-confirmar-erro')).toHaveText('As senhas não são iguais.');
  await page.fill('#vg-ns-confirmar', 'senha-boa-123');
  const ok = erros.slice();
  await page.click('#vg-ns-salvar');
  await page.waitForURL(/eu\.html#curriculo\/1$/);
  expect(ok).toEqual([]);
});

test('entrar: ?voltar= do próprio site é respeitado; de fora é ignorado; erro de login é único', async ({ page }) => {
  await page.goto(BASE + 'entrar.html?voltar=' + encodeURIComponent('vaga.html?vaga=K7M2QX') + '#entrar');
  await expect(page.locator('#vg-entrar-titulo')).toBeVisible();
  await page.fill('#vg-entrar-email', 'pessoa@previa.com');
  await page.fill('#vg-entrar-senha', 'errada123');
  await page.click('#vg-entrar-enviar');
  await expect(page.locator('#vg-entrar-erro')).toHaveText('E-mail ou senha não conferem.');
  await page.fill('#vg-entrar-email', 'ninguem@previa.com');
  await page.click('#vg-entrar-enviar');
  await expect(page.locator('#vg-entrar-erro')).toHaveText('E-mail ou senha não conferem.');
  await page.fill('#vg-entrar-email', 'pessoa@previa.com');
  await page.fill('#vg-entrar-senha', SENHA);
  await page.click('#vg-entrar-enviar');
  await page.waitForURL(/vaga\.html\?vaga=K7M2QX$/);

  await page.goto(BASE + 'entrar.html?voltar=' + encodeURIComponent('https://golpe.exemplo/x.html'));
  await expect(page.locator('#vg-ja-entrou')).toBeVisible();
  await page.click('#vg-ja-continuar');
  await page.waitForURL(/vagas\/index\.html$/);
});

test('sessão vencida: entrar mostra o aviso e abre na aba "Já tenho conta"', async ({ page }) => {
  await page.goto(BASE + 'entrar.html?motivo=sessao&voltar=eu.html%23candidaturas');
  await expect(page.locator('#vg-entrar-motivo')).toContainText('Sua sessão venceu. Entre de novo para continuar.');
  await expect(page.locator('#vg-aba-entrar')).toHaveAttribute('aria-pressed', 'true');
});

test('esqueci a senha: resposta neutra, botão "Enviado" e o link (recovery) cai em "Crie sua senha"', async ({ page }) => {
  await page.goto(BASE + 'entrar.html#esqueci');
  await expect(page.locator('#vg-esqueci-titulo')).toHaveText('Esqueci a senha');
  await page.fill('#vg-esqueci-email', 'quem.nao.existe@previa.com');
  await page.click('#vg-esqueci-enviar');
  await expect(page.locator('#vg-esqueci-ok')).toHaveText('Se esse e-mail tiver conta, o link chega em alguns minutos. Olhe também a caixa de spam.');
  await expect(page.locator('#vg-esqueci-enviar')).toHaveText('Enviado');
  await expect(page.locator('#vg-esqueci-enviar')).toBeDisabled();
  await expect(page.locator('#vg-abrir-link-previa')).toHaveCount(0);
  await page.goto(BASE + 'entrar.html?de-novo=1#esqueci');
  await page.fill('#vg-esqueci-email', 'pessoa@previa.com');
  await page.click('#vg-esqueci-enviar');
  await page.click('#vg-abrir-link-previa');
  await expect(page.locator('#vg-ns-titulo')).toHaveText('Crie sua senha');
  await expect(page.locator('#vg-ns-email')).toHaveValue('pessoa@previa.com');
});

test('link vencido ou já usado: mensagem do contrato e caminho para pedir outro', async ({ page }) => {
  await page.goto(BASE + 'entrar.html?token_hash=previaabcdef123456&type=recovery');
  await expect(page.locator('#vg-link-expirado')).toContainText('O link expirou ou já foi usado. Peça outro na tela de entrada.');
  await page.click('#vg-link-pedir');
  await expect(page.locator('#vg-form-esqueci')).toBeVisible();
});

test('localStorage bloqueado: a prévia e a conta funcionam pelo sessionStorage (do cadastro até a senha)', async ({ page }) => {
  const erros = coletarErros(page);
  await bloquear(page, ['localStorage']);
  await page.goto(BASE + 'entrar.html');
  await page.fill('#vg-criar-nome', 'Pessoa Restrita');
  await page.fill('#vg-criar-email', 'restrita@exemplo.com');
  await page.check('#vg-criar-termos');
  await page.click('#vg-criar-enviar');
  await page.click('#vg-abrir-link-previa');
  await page.fill('#vg-ns-senha', 'senha-boa-123');
  await page.fill('#vg-ns-confirmar', 'senha-boa-123');
  const antes = erros.slice();
  await page.click('#vg-ns-salvar');
  await page.waitForURL(/eu\.html#curriculo\/1$/);
  expect(antes).toEqual([]);
});

test('sem localStorage nem sessionStorage: a prévia ainda abre (memória) e o login funciona na página', async ({ page }) => {
  const erros = coletarErros(page);
  await bloquear(page, ['localStorage', 'sessionStorage']);
  await page.goto(BASE + 'entrar.html#entrar');
  await page.fill('#vg-entrar-email', 'pessoa@previa.com');
  await page.fill('#vg-entrar-senha', SENHA);
  const antes = erros.slice();
  await page.click('#vg-entrar-enviar');
  await page.waitForURL(/vagas\/index\.html$/);
  expect(antes).toEqual([]);
});

test('VAGAS_UI.el: texto sempre como texto, href javascript: some, innerHTML proibido; janela prende o foco e Esc devolve', async ({ page }) => {
  await page.goto(BASE + 'entrar.html');
  const r = await page.evaluate(() => {
    const U = window.VAGAS_UI;
    const p = U.el('p', { class: 'x', 'data-a': '1' }, ['<img src=x onerror="window.__xss=1">', 2, null, U.el('b', {}, 'ok')]);
    const a = U.el('a', { href: 'javascript:window.__xss=1' }, 'link');
    let proibido = '';
    try { U.el('div', { innerHTML: '<b>x</b>' }); } catch (e) { proibido = e.message; }
    return { texto: p.textContent, img: p.querySelectorAll('img').length, b: p.querySelectorAll('b').length, href: a.getAttribute('href'), proibido, xss: window.__xss || 0 };
  });
  expect(r).toEqual({ texto: '<img src=x onerror="window.__xss=1">2ok', img: 0, b: 1, href: null, proibido: 'VAGAS_UI.el: innerHTML não é permitido (use filhos).', xss: 0 });

  await page.evaluate(() => {
    const b = window.VAGAS_UI.el('button', { id: 'gatilho', type: 'button' }, 'abrir');
    document.body.appendChild(b);
    b.focus();
    window.__resposta = 'pendente';
    window.VAGAS_UI.confirmar({ id: 'vg-teste', titulo: 'Excluir?', texto: 'Não dá para desfazer.', sim: 'Excluir', perigo: true }).then((v) => { window.__resposta = v; });
  });
  await expect(page.locator('#vg-teste')).toHaveAttribute('role', 'alertdialog');
  await expect(page.locator('#vg-teste-nao')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#vg-teste-sim')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#vg-teste-nao')).toBeFocused();   // o foco não sai da janela
  await expect(page.locator('#app')).toHaveJSProperty('inert', true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#vg-teste')).toHaveCount(0);
  await expect(page.locator('#gatilho')).toBeFocused();
  expect(await page.evaluate(() => window.__resposta)).toBe(false);
  await expect(page.locator('#app')).toHaveJSProperty('inert', false);
});

test('peças: cartão cego sem nome, foto nem contato e só "Referência de empresa verificada: sim"; selo com a margem; carta sem estrelas', async ({ page }) => {
  await page.goto(BASE + 'entrar.html');
  await page.addScriptTag({ url: BASE + 'js/pecas-pessoa.js' });
  const r = await page.evaluate(() => {
    const P = window.VAGAS_PECAS;
    window.VAGAS_UI.definirFuso('America/Sao_Paulo');
    const cartao = { nome: 'Fulana Secreta', fotoUrl: 'data:image/png;base64,AAAA', whatsapp: '5595991234567', email: 'f@x.com',
      zona: { nome: 'Zona Norte' }, cargos: ['Atendente'], experiencias: [{ funcao: 'Caixa', meses: 15, atual: false }], escolaridade: 'medio',
      turnos: ['manha'], cnh: [], pretensaoCentavos: 160000, temReferencia: true, referencias: { total: 2, pontosFortes: [{ ponto: 'pontualidade', vezes: 2 }] },
      selos: [{ teste: 'caixa', nome: 'Operação de caixa', nota: 73, data: '2026-10-03', validoAte: '2027-10-03', codigo: 'K7M2QX9A', supervisao: 'online' }] };
    const li = P.cartaoCego(cartao, { ordem: 2, chegouEm: '2026-10-12T19:40:00Z', status: 'enviada' });
    const ref = P.cartaReferencia({ empresa: { nome: 'Padaria Modelo', conferida: true }, funcao: 'Atendente', vinculo: 'clt', inicio: '2024-03', fim: '2025-08',
      pontosFortes: ['pontualidade', 'inventado'], recomendaPara: ['Caixa'], texto: 'Abria a loja no horário.', criadoEm: '2026-10-10T12:00:00Z' });
    const selo = P.selo({ nome: 'Atendimento e recepção', nota: 80, data: '2026-10-03', validoAte: '2027-10-03', codigo: 'Q8V3N2KD', supervisao: 'online' });
    return { cartao: li.textContent, imgs: li.querySelectorAll('img').length, ref: ref.textContent, selo: selo.textContent };
  });
  for (const proibido of ['Fulana', '5595', 'f@x.com', 'pontualidade', 'Chega no horário', '2 refer']) expect(r.cartao).not.toContain(proibido);
  expect(r.imgs).toBe(0);
  for (const deve of ['Pessoa candidata', '2º', 'Novo', 'Zona Norte', 'Caixa, 1 ano e 3 meses', 'Médio completo', 'A partir de R$ 1.600',
    'Referência de empresa verificada: sim', 'Nota 73 de 100 (15 questões; margem de cerca de ±10 pontos)', 'online, sem supervisão', 'K7M2-QX9A']) expect(r.cartao).toContain(deve);
  expect(r.ref).toContain('Chega no horário e avisa quando não pode');
  expect(r.ref).not.toContain('inventado');
  expect(r.ref).toContain('Recomendaria para: Caixa');
  expect(r.ref).toContain('mar/2024 a ago/2025');
  expect(r.selo).toContain('Habilidade testada');
  expect(r.selo).toContain('Nota 80 de 100 (15 questões; margem de cerca de ±10 pontos)');
  expect(r.selo).toContain('Q8V3-N2KD');
  for (const t of [r.cartao, r.ref, r.selo]) expect(t).not.toMatch(/aprovad|reprovad|ranking|★|estrela/i);
});

test('conversa (lado da pessoa): mensagens, envio com id do aparelho, mensagem bloqueada fica no campo, convite pendente', async ({ page }) => {
  await page.goto(BASE + 'entrar.html');
  await page.addScriptTag({ url: BASE + 'js/ui-area.js' });
  await page.addScriptTag({ url: BASE + 'js/conversa.js' });
  const ids = await page.evaluate(async () => {
    await window.VAGAS_API.entrar('pessoa@previa.com', 'previa123');
    const r = await window.VAGAS_API.minhasConversas();
    const raiz = window.VAGAS_UI.el('div', { id: 'raiz-teste' });
    document.body.appendChild(raiz);
    window.__mudancas = [];
    const comb = r.conversas.find((c) => c.status === 'combinou');
    const conv = r.conversas.find((c) => c.status === 'conversar');
    window.__c = window.VAGAS_CONVERSA.montar(raiz, { lado: 'pessoa', candidaturaId: comb.candidaturaId, intervaloMs: 60000,
      aoMudar: (e) => window.__mudancas.push(e.modo), acoes: (ctx) => [window.VAGAS_UI.el('p', { id: 'gancho-acoes' }, 'gancho ' + ctx.estado.modo)] });
    await window.__c.pronto;
    return { comb: comb.candidaturaId, conv: conv.candidaturaId };
  });
  await expect(page.locator('#vg-conversa-nome')).not.toHaveText('');
  await expect(page.locator('#vg-mensagens .vg-msg--sistema')).toContainText(['Combinou!']);
  await expect(page.locator('#gancho-acoes')).toHaveText('gancho combinou');
  await expect(page.locator('#vg-form-mensagem')).toBeVisible();
  await expect(page.locator('#vg-conversa-bloqueio')).toContainText('Pedidos de dinheiro, Pix ou documento não passam por aqui.');
  await page.fill('#vg-mensagem-texto', 'Posso passar amanhã às 9h?');
  await expect(page.locator('#vg-mensagem-rascunho')).toContainText('Rascunho salvo neste aparelho às');
  await page.click('#vg-mensagem-enviar');
  await expect(page.locator('#vg-mensagens .vg-msg--minha').last()).toContainText('Posso passar amanhã às 9h?');
  await expect(page.locator('#vg-mensagem-texto')).toHaveValue('');
  await page.fill('#vg-mensagem-texto', 'Me passa a chave do Pix para a taxa');
  await page.click('#vg-mensagem-enviar');
  await expect(page.locator('#vg-mensagem-texto-erro')).toContainText('Mensagem bloqueada: ninguém paga para concorrer a uma vaga.');
  await expect(page.locator('#vg-mensagem-texto')).toHaveValue('Me passa a chave do Pix para a taxa');
  expect(await page.evaluate(() => window.__mudancas)).toEqual(['combinou']);
  const repetida = await page.evaluate(async () => {
    const antes = (await window.VAGAS_API.conversa(window.__c.resposta().candidaturaId)).mensagens.length;
    await window.__c.enviar('Mensagem repetida');
    return antes;
  });
  await expect(page.locator('#vg-mensagens .vg-msg--minha').last()).toContainText('Mensagem repetida');
  expect(await page.evaluate(async () => (await window.VAGAS_API.conversa(window.__c.resposta().candidaturaId)).mensagens.length)).toBe(repetida + 1);
  await page.evaluate(async (id) => {
    window.__c.parar();
    const raiz = document.getElementById('raiz-teste');
    window.__c2 = window.VAGAS_CONVERSA.montar(raiz, { lado: 'pessoa', candidaturaId: id });
    await window.__c2.pronto;
  }, ids.conv);
  expect(await page.evaluate(() => window.__c2.estado().modo)).toBe('convite');
  await expect(page.locator('#vg-conversa-nome')).toHaveText('Empresa confidencial');
});
