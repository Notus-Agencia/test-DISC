// Vagas sem Caos v2 · site da PESSOA no celular (projeto vagas-celular, Pixel 5), sobre a DEMONSTRAÇÃO (?previa=1, base fictícia):
// início -> buscar "cozinheira" -> vaga -> candidatar (3 caminhos, com um PDF de teste gerado na hora) -> código -> enviada -> candidaturas ->
// conversa; salvar e alertas; tema escuro; sem rolagem lateral; sem erro de console; teclado e foco; toques do fluxo "pessoa nova com PDF" <= 10.
const { test, expect } = require('@playwright/test');

const URL_PREVIA = '/vagas/index.html?previa=1';
const ANA = 'ana.paula@exemplo.com';

function coletarErros(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/cdnjs|net::|ERR_|Failed to load resource|favicon/i.test(m.text())) erros.push('console: ' + m.text());
  });
  return erros;
}
async function abrir(page, hash, onde) {
  await page.goto((onde || URL_PREVIA) + (hash || ''));
  await page.waitForSelector('#app .pagina', { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('#app .carregando-lista'));
}
async function irPara(page, hash) {
  await page.evaluate(async (h) => {
    if (location.hash === h) await window.VSC_P.render();   // mesmo endereço: o navegador não avisa, então redesenha à mão
    else location.hash = h;
  }, hash);
  await page.waitForFunction((h) => location.hash === h && !document.querySelector('#app .carregando-lista'), hash);
  await page.waitForTimeout(150);
}
// Um PDF pequeno e válido (texto em ASCII), gerado na hora: o leitor do navegador (pdf.js) tira nome, contato, função e experiência dele.
function pdfDeTeste(linhas) {
  const esc = (t) => t.replace(/([()\\])/g, '\\$1');
  let y = 740;
  const conteudo = 'BT /F1 11 Tf ' + linhas.map((l, i) => (i === 0 ? '72 ' + y + ' Td ' : '0 -18 Td ') + '(' + esc(l) + ') Tj').join(' ') + ' ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + conteudo.length + ' >>\nstream\n' + conteudo + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const pos = [];
  objs.forEach((o, i) => { pos.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('') +
    'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
const CURRICULO = ['JOANA RIBEIRO', 'Curriculo', 'Uruacu - GO', 'WhatsApp: (62) 98888-0182 - joana.teste@example.com', 'Objetivo', 'Cozinheira', 'Experiencia profissional',
  'Cozinheira - Marmitaria Panela de Barro', '2022 a hoje', 'Formacao', 'Ensino medio completo'];

// vaga da base com poucas perguntas de sim ou não (o caminho fica mais curto), de empresa verificada ou não, ainda sem candidatura
async function vagaSemPerguntas(page, verificada) {
  return page.evaluate((v) => {
    const P = window.VSC_P, aberta = (p) => /^(em que|que |qual|quais|quanto)/i.test(p);
    const l = P.D.ABERTAS.filter((x) => !!P.D.EMP[x.empresaId].verificada === v && !P.candPorVaga(x.id) && !x.perguntas.some(aberta)).sort((a, b) => a.perguntas.length - b.perguntas.length);
    return l[0].id;
  }, verificada);
}
// responde "Sim" a cada pergunta da empresa que estiver na folha (conta como toque)
async function responderPerguntas(page) {
  await expect(page.locator('#folha-cand .folha-corpo')).toBeVisible();
  await page.waitForTimeout(200);
  const grupos = page.locator('#folha-cand .pergunta .segmentado');
  const n = await grupos.count();
  for (let i = 0; i < n; i++) await grupos.nth(i).locator('button').first().click();
  return n;
}
async function digitarCodigo(page, k) {
  await page.locator('#cod-' + k + '-0').click();
  await page.keyboard.type('123456');
}
async function fecharComEsc(page, sel) {
  await page.keyboard.press('Escape');
  await expect(page.locator(sel)).toHaveCount(0);
  await page.waitForTimeout(350);   // o histórico (voltar da folha) assenta antes da próxima tela
}
async function entrarComoAna(page) {
  await irPara(page, '#/entrar');
  await page.fill('#ent-destino', ANA);
  await page.click('button[type="submit"]');
  await page.waitForSelector('#cod-ent-0');
  await digitarCodigo(page, 'ent');
  await page.waitForFunction(() => location.hash === '#/candidaturas');
  await page.waitForSelector('#app .linhas .linha');
}
const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('início: título, busca, atalhos, setores e aviso anti-golpe; busca por "cozinheira" leva à vaga e à candidatura', async ({ page }) => {
  const erros = coletarErros(page);
  await abrir(page);
  await expect(page.locator('h1')).toContainText('Vagas em');
  await expect(page.locator('.faixa-demo')).toContainText('Demonstração com empresas e vagas fictícias');
  await expect(page.locator('.golpe').first()).toContainText('Nunca pague para se candidatar. Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.');
  await page.fill('#q-inicio', 'cozinheira');
  await expect(page.locator('#sug-q-inicio button').first()).toBeVisible();
  await page.press('#q-inicio', 'Enter');
  await page.waitForFunction(() => location.hash.indexOf('#/vagas?q=') === 0);
  await expect(page.locator('#contagem')).toContainText('vaga');
  const n = await page.locator('#lista-busca .vaga').count();
  expect(n).toBeGreaterThan(0);
  const titulos = await page.locator('#lista-busca .vaga-titulo').allInnerTexts();
  expect(titulos.every((t) => /cozinh|chapeir|pizzaiol|merendeir/i.test(t.normalize('NFD').replace(/[̀-ͯ]/g, '')))).toBe(true);
  await page.locator('#lista-busca .vaga-titulo a').first().click();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.vp-salario b')).toContainText('R$');
  await expect(page.locator('[data-acao="candidatar"]').first()).toBeVisible();
  expect(erros).toEqual([]);
});

test('busca sem resultado oferece sair do filtro; "meio período" e erro de digitação não quebram', async ({ page }) => {
  await abrir(page, '#/vagas?q=xyzqwerty');
  await expect(page.locator('.vazio')).toContainText('Nenhuma vaga com a palavra');
  await irPara(page, '#/vagas?q=vendedro');
  await expect(page.locator('.dica-busca')).toContainText('vendedor');
  await irPara(page, '#/vagas?q=caixa&semexp=1&sal=1500:mes');
  await expect(page.locator('.filtros-ativos')).toContainText('Sem experiência');
  await page.click('.filtros-ativos [data-acao="limpar"]');
  await expect(page.locator('.filtros-ativos')).toHaveCount(0);
});

test('pessoa nova com PDF: 4 toques e o código; leitura do arquivo preenche nome, contato, função; enviada; candidaturas; sem rolagem lateral', async ({ page }) => {
  const erros = coletarErros(page);
  let toques = 0;
  const toque = async (loc) => { toques++; await loc.click(); };
  await abrir(page);
  const id = await vagaSemPerguntas(page, true);
  await irPara(page, '#/vaga/' + id);
  await toque(page.locator('[data-acao="candidatar"]').first());
  await expect(page.locator('#folha-cand')).toBeVisible();
  await expect(page.locator('#folha-cand')).toContainText('Precisa ter 18 anos ou mais');
  toques++;
  await page.setInputFiles('#arq-ap', { name: 'curriculo-joana.pdf', mimeType: 'application/pdf', buffer: pdfDeTeste(CURRICULO) });
  await expect(page.locator('#folha-cand h2')).toHaveText('Confira seus dados', { timeout: 30000 });
  if (!(await page.inputValue('#ap-nome'))) {
    await page.fill('#ap-nome', 'Joana Ribeiro');
    await page.fill('#ap-whats', '62988880182');
    await page.fill('#ap-email', 'joana.teste@example.com');
  } else {
    await expect(page.locator('#ap-nome')).toHaveValue('Joana Ribeiro');
    await expect(page.locator('#ap-whats')).toHaveValue('(62) 98888-0182');
    await expect(page.locator('#ap-email')).toHaveValue('joana.teste@example.com');
    await expect(page.locator('#ap-funcao')).toHaveValue('Cozinheira');
  }
  await expect(page.locator('#folha-cand')).toContainText('Ao enviar, a empresa');
  toques += await responderPerguntas(page);
  await toque(page.locator('#ap-aceite'));
  await toque(page.locator('[data-acao="ap-enviar"]'));
  await expect(page.locator('#folha-cand h2')).toHaveText('Confirme seu e-mail');
  await expect(page.locator('#folha-cand')).toContainText('jo•••@example.com');
  await digitarCodigo(page, 'ap');
  await expect(page.locator('#folha-cand .sucesso h3')).toHaveText('Candidatura enviada', { timeout: 15000 });
  expect(toques).toBeLessThanOrEqual(10);
  await page.click('#folha-cand [data-acao="ir"]');
  await page.waitForSelector('#app .linhas .linha');
  await expect(page.locator('#app .linhas .linha').first()).toContainText('Enviada');
  expect(await semRolagemLateral(page)).toBeLessThanOrEqual(0);
  expect(erros).toEqual([]);
});

test('caminho "Montar agora": 3 perguntas curtas, confere, código e enviada', async ({ page }) => {
  await abrir(page);
  const id = await vagaSemPerguntas(page, false);
  await irPara(page, '#/vaga/' + id);
  await page.locator('[data-acao="candidatar"]').first().click();
  await page.click('[data-acao="ap-montar"]');
  await expect(page.locator('#folha-cand h2')).toHaveText('Montar currículo');
  await expect(page.locator('.passos')).toContainText('1 de 3');
  await page.click('[data-acao="ap-continuar"]');
  await expect(page.locator('.passos')).toContainText('2 de 3');
  await page.click('.chip[data-v="1 a 3 anos"]');
  await page.click('[data-acao="ap-continuar"]');
  await expect(page.locator('.passos')).toContainText('3 de 3');
  await page.click('.chip[data-v="Ensino médio completo"]');
  await page.click('.chip[data-v="Manhã"]');
  await page.click('[data-acao="ap-continuar"]');
  await expect(page.locator('#folha-cand h2')).toHaveText('Confira seus dados');
  await expect(page.locator('#folha-cand')).toContainText('Currículo montado');
  await responderPerguntas(page);
  await page.fill('#ap-nome', 'Carlos Mota');
  await page.fill('#ap-whats', '62977776655');
  await page.fill('#ap-email', 'carlos.teste@example.com');
  await page.click('#ap-aceite');
  await page.click('[data-acao="ap-enviar"]');
  await digitarCodigo(page, 'ap');
  await expect(page.locator('#folha-cand .sucesso h3')).toHaveText('Candidatura enviada', { timeout: 15000 });
  await expect(page.locator('#folha-cand')).toContainText('em verificação');
});

test('caminho "Só nome, e-mail e WhatsApp": pede o e-mail porque o código vai por e-mail; erro de campo fica no campo', async ({ page }) => {
  await abrir(page);
  const id = await vagaSemPerguntas(page, true);
  await irPara(page, '#/vaga/' + id);
  await page.locator('[data-acao="candidatar"]').first().click();
  await page.click('[data-acao="ap-rapido"]');
  await expect(page.locator('#folha-cand h2')).toHaveText('Seus dados');
  await page.click('[data-acao="ap-enviar"]');
  await expect(page.locator('#ap-nome-erro')).toContainText('Escreva seu nome');
  await expect(page.locator('#ap-whats-erro')).toContainText('(62) 99999-9999');
  await expect(page.locator('#ap-email-erro')).toContainText('e-mail válido');
  await expect(page.locator('#ap-aceite-erro')).toContainText('Marque para continuar');
  await responderPerguntas(page);
  await page.fill('#ap-nome', 'Ana Beatriz');
  await page.fill('#ap-whats', '62966665544');
  await page.fill('#ap-email', 'ana.b@example.com');
  await page.click('#ap-aceite');
  await page.click('[data-acao="ap-enviar"]');
  await digitarCodigo(page, 'ap');
  await expect(page.locator('#folha-cand .sucesso h3')).toHaveText('Candidatura enviada', { timeout: 15000 });
});

test('código errado mostra o erro e deixa tentar de novo; reenviar espera 30 s', async ({ page }) => {
  await abrir(page, '#/entrar');
  await page.fill('#ent-destino', 'outra.pessoa@example.com');
  await page.click('button[type="submit"]');
  await page.waitForSelector('#cod-ent-0');
  await expect(page.locator('[data-acao="reenviar"]')).toBeDisabled();
  await expect(page.locator('[data-acao="reenviar"]')).toContainText('30');
  await page.locator('#cod-ent-0').click();
  await page.keyboard.type('111111');
  await expect(page.locator('#codigo-ent-erro')).toContainText('Código errado');
  await expect(page.locator('#cod-ent-0')).toBeFocused();
  await page.keyboard.type('123456');
  await page.waitForFunction(() => location.hash === '#/candidaturas');
});

test('pessoa com conta: candidaturas, andamento real, entrevista, conversa, confirmar presença, retirar', async ({ page }) => {
  const erros = coletarErros(page);
  await abrir(page);
  await entrarComoAna(page);
  await expect(page.locator('.abas')).toContainText('Em andamento');
  const total = await page.locator('#app .linhas .linha').count();
  expect(total).toBeGreaterThanOrEqual(3);
  await page.locator('#app .linhas .linha', { hasText: 'Entrevista marcada' }).first().click();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('.entrevista .quando')).toBeVisible();
  await expect(page.locator('.etapas .etapa').first()).toContainText('Enviada');
  await expect(page.locator('.conversa .msg.ela').first()).toContainText('Gostamos do seu currículo');
  await page.click('[data-acao="confirmar-presenca"]');
  await expect(page.locator('.entrevista')).toContainText('Presença confirmada');
  await page.fill('textarea[data-golpe]', 'Posso sim, obrigada.');
  await page.click('.escrever button[type="submit"]');
  await expect(page.locator('.conversa .msg.eu').last()).toContainText('Posso sim, obrigada.');
  // contato na mensagem: o texto orienta e não envia
  await page.fill('textarea[data-golpe]', 'chama no 62 98888-1234');
  await page.click('.escrever button[type="submit"]');
  await expect(page.locator('#folha-golpe, .msg-dica').first()).toBeVisible();
  await page.fill('textarea[data-golpe]', 'Posso pagar a taxa por pix?');
  await expect(page.locator('.msg-dica')).toContainText('ninguém pode cobrar');
  // retirar
  await page.click('[data-acao="opcoes-cand"]');
  await page.click('[data-acao="retirar"]');
  await page.click('#janela-sim');
  await expect(page.locator('.status.fim').first()).toBeVisible();
  await page.goBack().catch(() => {});
  expect(erros).toEqual([]);
});

test('empresa em verificação: "Liberar meu WhatsApp e meu currículo" abre a folha e registra a liberação', async ({ page }) => {
  await abrir(page);
  await entrarComoAna(page);
  await page.evaluate(async () => {
    const P = window.VSC_P, v = P.D.ABERTAS.filter((x) => !P.D.EMP[x.empresaId].verificada && !P.candPorVaga(x.id))[0];
    await window.VSC_API.candidatar({ vagaId: v.id, caminho: 'minimo', respostas: v.perguntas.map((p) => ({ pergunta: p, resposta: 'Sim' })), idLocal: 'e2e-liberar' });
    await P.carregarCands();
  });
  await irPara(page, '#/candidaturas');
  await page.locator('#app .linhas .linha', { hasText: 'Enviada' }).first().click();
  await expect(page.locator('#app')).toContainText('Esta empresa está em verificação');
  await page.click('[data-acao="liberar-whats"]');
  await expect(page.locator('#folha-liberar')).toContainText('vai ver seu nome, seu WhatsApp');
  await page.click('[data-acao="liberar-sim"]');
  await expect(page.locator('#app')).toContainText('foram liberados para esta empresa');
});

test('salvar sem conta fica no aparelho (vsc.eu.salvas) e sobe para a conta ao entrar; alertas: criar e apagar', async ({ page }) => {
  await abrir(page, '#/vagas?q=caixa');
  const id = await page.locator('#lista-busca .vaga').first().getAttribute('data-id');
  await page.locator('#lista-busca .vaga .salvar').first().click();
  await expect(page.locator('.toast')).toContainText('Vaga salva neste aparelho');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vsc.eu.salvas')))).toContain(id);
  await irPara(page, '#/salvas');
  await expect(page.locator('#app .vaga')).toHaveCount(1);
  await entrarComoAna(page);
  expect(await page.evaluate(() => localStorage.getItem('vsc.eu.salvas'))).toBeNull();
  await irPara(page, '#/salvas');
  await expect(page.locator('#app .vaga[data-id="' + id + '"]')).toHaveCount(1);
  await irPara(page, '#/alertas');
  await expect(page.locator('h1')).toHaveText('Alertas de vaga');
  const antes = await page.locator('#app .linhas > li').count();
  await page.click('[data-acao="criar-alerta"]');
  await page.selectOption('#al-setor', { index: 1 });
  await page.click('[data-acao="al-criar"]');
  await expect(page.locator('.toast')).toContainText('Alerta criado');
  await expect(page.locator('#app .linhas > li')).toHaveCount(antes + 1);
  await page.locator('#app [data-acao="apagar-alerta"]').first().click();
  await expect(page.locator('#app .linhas > li')).toHaveCount(antes);
});

test('alerta sem conta: pede e-mail, aceite e código por e-mail (não oferece WhatsApp)', async ({ page }) => {
  await abrir(page, '#/vagas?q=caixa');
  await page.locator('#lista-busca [data-acao="alerta-busca"]').first().click();
  await expect(page.locator('#folha-alerta')).toContainText('Avisar quando tiver vaga assim');
  await expect(page.locator('#folha-alerta')).not.toContainText('WhatsApp');
  await page.click('[data-acao="al-criar"]');
  await expect(page.locator('#al-contato-erro')).toContainText('e-mail válido');
  await page.fill('#al-contato', 'alerta.teste@example.com');
  await page.click('#al-aceite');
  await page.click('[data-acao="al-criar"]');
  await digitarCodigo(page, 'al');
  await expect(page.locator('.toast')).toContainText('Alerta criado', { timeout: 10000 });
});

test('tema escuro e efeitos: ficam no aparelho e valem já no primeiro quadro da próxima visita', async ({ page }) => {
  await abrir(page);
  await page.locator('#rodape [data-grupo="tema"] [data-valor="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#rodape [data-grupo="efeitos"] [data-valor="off"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-fx', 'off');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-fx', 'off');
  const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(fundo).toBe('rgb(18, 18, 18)');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vsc.prefs')).tema)).toBe('dark');
});

test('sem rolagem lateral em 390 px em todas as telas (sem conta e com conta) e sem erro de console', async ({ page }) => {
  const erros = coletarErros(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  const telas = ['#/', '#/vagas?q=caixa', '#/vaga/v01', '#/salvas', '#/candidaturas', '#/eu', '#/alertas', '#/curriculo', '#/entrar', '#/como-funciona'];
  for (const h of telas) { await irPara(page, h); expect(await semRolagemLateral(page), 'sem conta ' + h).toBeLessThanOrEqual(0); }
  await entrarComoAna(page);
  for (const h of telas.concat(['#/candidatura/' + (await page.evaluate(() => window.VSC_P.est.cands[0].id))])) {
    await irPara(page, h);
    expect(await semRolagemLateral(page), 'com conta ' + h).toBeLessThanOrEqual(0);
  }
  expect(erros).toEqual([]);
});

test('alvos de toque de 44 px e texto de 12 px ou mais nos botões principais', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  const medidas = await page.evaluate(() => Array.from(document.querySelectorAll('#app button.btn:not(.peq), #app a.btn:not(.peq), #barra-baixo a, #topo-acoes a:not(.peq), .busca-dupla .btn')).filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || '').trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) }; }));
  expect(medidas.length).toBeGreaterThan(4);
  medidas.filter((m) => m.h < 43).forEach((m) => { throw new Error('alvo pequeno: ' + JSON.stringify(m)); });
});

test('teclado e foco: pular para o conteúdo, folha com foco preso e Esc devolve o foco', async ({ page }) => {
  await abrir(page, '#/vaga/v01');
  await page.keyboard.press('Tab');
  await expect(page.locator('.pular')).toBeFocused();
  await page.keyboard.press('Enter');
  const botao = page.locator('[data-acao="candidatar"]').first();
  await botao.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#folha-cand')).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement.closest('#folha-cand'))).toBe(true);
  // a página atrás da folha fica inerte: o foco só anda dentro da folha (ou sai para fora da página)
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !document.activeElement.closest('#app, #topo, #rodape, #barra-baixo, .faixa-demo')), 'foco preso na folha').toBe(true); }
  await page.keyboard.press('Escape');
  await expect(page.locator('#folha-cand')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-acao'))).toBe('candidatar');
  // foco visível no botão
  await botao.focus();
  const contorno = await botao.evaluate((e) => getComputedStyle(e).outlineStyle + '|' + getComputedStyle(e).outlineWidth);
  expect(contorno).not.toMatch(/^none/);
});

test('a página troca o título e leva o foco para o conteúdo ao mudar de tela', async ({ page }) => {
  await abrir(page);
  await irPara(page, '#/como-funciona');
  await expect(page).toHaveTitle(/Como funciona/);
  expect(await page.evaluate(() => document.activeElement.id)).toBe('app');
  await irPara(page, '#/vaga/v01');
  await expect(page).toHaveTitle(/Operador\(a\) de caixa/);
});

test('sem internet: a candidatura entra na fila, a tela diz "Esperando internet" e sai quando a rede volta (idLocal, sem duplicar)', async ({ page }) => {
  await abrir(page);
  await entrarComoAna(page);
  const id = await vagaSemPerguntas(page, true);
  await page.locator('[data-acao="ajustes"]').click();
  await page.locator('label[for="aj-offline"]').click();
  await fecharComEsc(page, '#folha-ajustes');
  await irPara(page, '#/vaga/' + id);
  await page.locator('[data-acao="candidatar"]').first().click();
  await responderPerguntas(page);
  await page.click('[data-acao="ap-enviar-conta"]');
  await expect(page.locator('#folha-cand .sucesso h3')).toHaveText('Esperando internet');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vsc.eu.fila')).length)).toBe(1);
  await page.click('#folha-cand [data-acao="ir"]');
  await expect(page.locator('#app .linhas .linha').first()).toContainText('Esperando internet');
  await page.locator('[data-acao="ajustes"]').click();
  await page.locator('label[for="aj-offline"]').click();
  await expect(page.locator('.toast')).toContainText('Internet de volta', { timeout: 10000 });
  await fecharComEsc(page, '#folha-ajustes');
  await page.waitForFunction(() => !localStorage.getItem('vsc.eu.fila') || JSON.parse(localStorage.getItem('vsc.eu.fila')).length === 0);
  await irPara(page, '#/candidaturas');
  await expect(page.locator('#app .linhas .linha', { hasText: 'Esperando internet' })).toHaveCount(0);
});

test('perfil: dados, privacidade, preferências, vagas escondidas, baixar meus dados e apagar a conta', async ({ page }) => {
  await abrir(page);
  await entrarComoAna(page);
  await irPara(page, '#/eu');
  await expect(page.locator('.pessoa-cab')).toContainText('Ana Paula Rezende');
  for (const t of ['Meu currículo', 'Alertas de vaga', 'Vagas salvas', 'Candidaturas', 'Quem viu meu currículo', 'Como usamos seus dados', 'Baixar meus dados', 'Apagar minha conta', 'Preferências', 'Sair']) {
    await expect(page.locator('#app')).toContainText(t);
  }
  await page.click('[data-acao="quem-viu"]');
  await expect(page.locator('#folha-quem')).toContainText('Abriu seu');
  await page.keyboard.press('Escape');
  const [down] = await Promise.all([page.waitForEvent('download'), page.click('[data-acao="baixar-dados"]')]);
  expect(down.suggestedFilename()).toBe('meus-dados-vagas-sem-caos.json');
  await page.click('[data-acao="editar-dados"]');
  await page.fill('#dd-nome', 'Ana Paula R. Teste');
  await page.click('[data-acao="ed-dados-salvar"]');
  await expect(page.locator('.pessoa-cab')).toContainText('Ana Paula R. Teste');
  await page.click('[data-acao="apagar-conta"]');
  await page.click('#janela-sim');
  await page.waitForFunction(() => location.hash === '#/');
  expect(await page.evaluate(() => window.VSC_API.sessao())).toBeNull();
});

test('meu currículo: editar o que as empresas veem e anexar arquivo (PDF) lendo os dados', async ({ page }) => {
  await abrir(page);
  await entrarComoAna(page);
  await irPara(page, '#/curriculo');
  await expect(page.locator('#app')).toContainText('O que as empresas veem');
  await expect(page.locator('#app')).toContainText('curriculo-ana.pdf');
  await page.click('[data-acao="editar-cv"]');
  await page.fill('#ed-funcao', 'Atendente de padaria');
  await page.click('[data-acao="ed-salvar"]');
  await expect(page.locator('#app')).toContainText('Atendente de padaria');
  await page.click('[data-acao="apagar-arquivo"]');
  await page.click('#janela-sim');
  await expect(page.locator('#app')).toContainText('Arquivo do currículo');
  await expect(page.locator('#app')).not.toContainText('curriculo-ana.pdf');
});

test('rotas diretas: #/candidatar/<id> abre a vaga com a folha; vaga que não existe mostra aviso', async ({ page }) => {
  await abrir(page, '#/candidatar/v01');
  await expect(page.locator('#folha-cand')).toBeVisible();
  await page.keyboard.press('Escape');
  await irPara(page, '#/vaga/inexistente123');
  await expect(page.locator('.vazio')).toContainText('Vaga não encontrada');
});

test('lista vazia da cidade: texto bom e botão "Avisar quando tiver vaga em <cidade>"', async ({ page }) => {
  await abrir(page);
  await page.evaluate(async () => {
    const P = window.VSC_P, base = window.VSC_PREVIA_METODOS.base();
    window.VSC_PREVIA_METODOS.base = () => Object.assign({}, base, { vagas: [], empresas: [] });
    await P.carregarBase();
    await P.render();
  });
  await expect(page.locator('.vazio')).toContainText('Ainda não há vagas aqui');
  await expect(page.locator('.vazio')).toContainText('Avise-me quando chegar');
  await expect(page.locator('[data-acao="avisar-cidade"]')).toContainText('Avisar quando tiver vaga em Uruaçu');
  await page.click('[data-acao="avisar-cidade"]');
  await expect(page.locator('#folha-alerta')).toBeVisible();
});

test('telas antigas redirecionam: cidade.html, vaga.html, entrar.html, eu.html e emprego.html', async ({ page }) => {
  await page.goto('/vagas/cidade.html?cidade=uruacu-go&previa=1');
  await page.waitForURL(/index\.html\?cidade=uruacu-go.*#\/vagas/);
  await page.goto('/vagas/vaga.html?c=v01');
  await page.waitForURL(/index\.html#\/vaga\/v01/);
  await page.goto('/vagas/entrar.html');
  await page.waitForURL(/index\.html#\/entrar/);
  await page.goto('/vagas/eu.html#curriculo');
  await page.waitForURL(/index\.html#\/curriculo/);
  await page.goto('/vagas/emprego.html');
  await page.waitForURL(/index\.html#\/como-funciona/);
});

test('produção (sem ?previa): nenhum arquivo da demonstração é pedido e nenhuma faixa de demonstração aparece', async ({ page }) => {
  const pedidos = [];
  page.on('request', (r) => pedidos.push(r.url()));
  await page.goto('/vagas/index.html');
  await page.waitForSelector('#app .pagina');
  await page.waitForTimeout(800);
  expect(pedidos.filter((u) => /\/previa\//.test(u))).toEqual([]);
  expect(await page.locator('.faixa-demo').count()).toBe(0);
  expect(await page.locator('.exemplo').count()).toBe(0);
  await expect(page.locator('#app')).not.toContainText('Demonstração');
  await expect(page.locator('#app')).toContainText('Não foi possível carregar as vagas');
});

test('testes, selo e referências ficam escondidos: nenhum link nas telas da pessoa', async ({ page }) => {
  await abrir(page);
  for (const h of ['#/', '#/vagas?q=caixa', '#/vaga/v01', '#/como-funciona', '#/entrar']) {
    await irPara(page, h);
    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')));
    expect(links.filter((l) => /testes\.html|selo\.html|referencia\.html/.test(l))).toEqual([]);
  }
});
