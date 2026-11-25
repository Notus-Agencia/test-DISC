// Vagas sem Caos v2 — site da EMPRESA (vagas/empresas.html) sobre a PRÉVIA (?previa=1), projeto desktop.
// Celular: as 4 tarefas (anunciar, ver candidatos, chamar, marcar entrevista) rodam com viewport de 390 px.
// "Toques" = cliques/seleções; "digitações" = preencher campo (a meta do plano conta toques, não letras).
const { test, expect } = require('@playwright/test');

const URL = '/vagas/empresas.html?previa=1';
const CELULAR = { width: 390, height: 844 };

function observar(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  return erros;
}
async function abrir(page, hash) {
  await page.context().route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>wa</p>' }));
  await page.context().route('https://vagas.exemplo/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>exemplo</p>' }));
  await page.goto(URL + (hash || ''));
  await page.waitForSelector('html[data-empresa-pronta]');
}
// entra como uma empresa de exemplo pelos controles da prévia (os mesmos que a pessoa usa)
async function entrarComo(page, id) {
  await page.evaluate(async (alvo) => {
    await window.VSC_PREVIA_EMPRESA.trocar(alvo);
    await window.VSC_EMP.carregarConta();
    window.VSC_EMP.esquecerTela();
    location.hash = '#/inicio';
    window.VSC_EMP.render();
  }, id);
  await expect(page.locator('h1').first()).toHaveText('Início');
}
// navegação por hash dentro da mesma página (page.goto só com a mudança do hash é instável quando a tela troca o próprio hash)
async function ir(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
}
function contador(page) {
  const c = { toques: 0 };
  c.clicar = async (loc) => { c.toques++; await loc.click(); };
  c.escolher = async (loc, v) => { c.toques++; await loc.selectOption(v); };
  return c;
}
async function semRolagemLateral(page) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(r.sw).toBeLessThanOrEqual(r.w + 1);
}

test.describe('anunciar a primeira vaga (celular)', () => {
  test.use({ viewport: CELULAR });

  test('empresa nova: modelo, CNPJ de exemplo, código e vaga no ar com selo em até 10 toques', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/anunciar');
    const c = contador(page);
    await expect(page.locator('h1')).toHaveText('Anuncie sua vaga grátis');
    await c.clicar(page.locator('[data-modelo="caixa"]'));
    await expect(page.locator('h1')).toHaveText('Nova vaga');
    await expect(page.locator('#f-desc')).not.toHaveValue('');
    await expect(page.locator('#f-sal-dica')).toContainText(/Vagas parecidas em Uruaçu e região pagam de R\$ [\d.]+ a R\$ [\d.]+ por mês/);
    await page.fill('#f-de', '1800');
    await c.clicar(page.locator('[data-acao="cnpj-exemplo"]'));
    await expect(page.locator('#f-doc-res')).toContainText('É esta empresa?');
    await c.clicar(page.locator('[data-acao="doc-sim"]'));
    await expect(page.locator('#f-bairro')).toHaveValue('Setor Norte');
    await page.fill('#f-resp', 'Antônio Exemplo');
    await page.fill('#f-whats', '(62) 99999-0000');
    await page.fill('#f-email', 'antonio@mercearia.exemplo');
    await c.clicar(page.locator('#btn-publicar'));
    await expect(page.locator('#form-codigo')).toBeVisible();
    await page.fill('#codigo', '123456');
    await c.clicar(page.locator('#cod-ok'));
    await expect(page.locator('h1')).toHaveText('Sua vaga está no ar');
    await expect(page.locator('.selo.verificando').first()).toContainText('Empresa em verificação');
    await expect(page.locator('#msg-compartilhar')).toContainText('Estamos contratando Caixa');
    expect(c.toques).toBeLessThanOrEqual(10);
    await semRolagemLateral(page);
    // compartilhar no WhatsApp abre o wa.me com a mensagem pronta
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-acao="compartilhar"]').click()]);
    await popup.waitForURL(/wa\.me/);
    expect(popup.url()).toMatch(/^https:\/\/wa\.me\/\?text=Estamos/);
    // a empresa já está no painel, mesmo depois de recarregar a página (a sessão fica neste aparelho)
    await ir(page, '#/inicio');
    await page.reload();
    await page.waitForSelector('html[data-empresa-pronta]');
    await expect(page.locator('h1').first()).toHaveText('Início');
    await expect(page.locator('.indicador').first()).toContainText('1');
    expect(erros).toEqual([]);
  });

  test('sem 3 vagas parecidas na região, a dica de salário manda conferir o piso', async ({ page }) => {
    await abrir(page, '#/vaga/nova?modelo=jardineiro');
    await expect(page.locator('#f-sal-dica')).toHaveText('Confira o piso da sua categoria.');
  });

  test('texto com telefone ou cobrança é barrado e diz o que tirar', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/vaga/nova?modelo=caixa');
    await page.fill('#f-desc', 'Vaga de caixa na loja. Ligue para 62 99999-1234 e pague taxa de inscrição para começar.');
    await expect(page.locator('#f-desc-check')).toContainText('Tire');
    await page.fill('#f-de', '1700');
    await page.click('#btn-publicar');
    await expect(page.locator('#form-erros')).toContainText(/Faltam|Falta|Ajuste o texto/);
    expect(erros).toEqual([]);
  });

  test('salário é obrigatório e diz como corrigir', async ({ page }) => {
    await abrir(page, '#/vaga/nova?modelo=repositor');
    await page.click('#btn-publicar');
    await expect(page.locator('#form-erros')).toContainText('salário');
    await expect(page.locator('#c-de .erro-campo')).toContainText('Informe o salário');
  });
});

test.describe('limites e ações das vagas', () => {
  test('empresa em verificação: 3 no ar e 3 por dia, com explicação e sem beco sem saída', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/anunciar');
    await entrarComo(page, 'studio');
    await ir(page, '#/vagas');
    await expect(page.locator('.cab p').first()).toContainText('de 3 enquanto verificamos');
    await expect(page.locator('.nota-data').first()).toContainText('3 vagas no ar');
    // publica até passar do limite de 3 no ar: a vaga vira rascunho e a tela explica como liberar
    const funcoes = ['caixa', 'repositor', 'vendedor'];
    let rascunho = false;
    for (const m of funcoes) {
      await ir(page, '#/vaga/nova?modelo=' + m);
      await page.fill('#f-de', '1800');
      await page.click('#btn-publicar');
      await page.waitForFunction(() => document.querySelector('#folha-curta[open]') || /no ar/.test(document.querySelector('h1').innerText));
      if (await page.locator('#folha-curta[open]').count()) { rascunho = true; break; }
      await expect(page.locator('h1')).toHaveText('Sua vaga está no ar');
    }
    expect(rascunho).toBeTruthy();
    await expect(page.locator('#folha-curta')).toContainText('rascunho');
    await expect(page.locator('#folha-curta')).toContainText('pause ou encerre outra vaga');
    await page.click('[data-acao="ir-rascunhos"]');
    await expect(page.locator('.aba[aria-selected="true"]')).toContainText('Rascunhos');
    await expect(page.locator('.tabela [data-acao="publicar-rascunho"]').first()).toBeVisible();
    // passou de 3 criadas no dia: o banco recusa com a mensagem do limite e o texto fica guardado
    for (const m of ['motorista', 'cozinheiro']) {
      await ir(page, '#/vaga/nova?modelo=' + m);
      await page.fill('#f-de', '2200');
      await page.click('#btn-publicar');
      await page.waitForFunction(() => document.querySelector('#folha-curta[open]'));
      if (await page.locator('#folha-curta:has-text("Limite de vagas do dia")').count()) break;
      await page.click('#folha-curta [data-acao="ir-rascunhos"]');
      await expect(page.locator('.aba[aria-selected="true"]')).toContainText('Rascunhos');
    }
    await expect(page.locator('#folha-curta')).toContainText('Hoje já foram criadas 3 vagas');
    await expect(page.locator('#folha-curta')).toContainText('Volte amanhã');
    await page.click('#folha-curta [data-acao="fechar-dialogo"]');
    await expect(page.locator('#f-desc')).not.toHaveValue('');
    expect(erros).toEqual([]);
  });

  test('duplicar em 3 toques, pausar, encerrar e deixar mais 30 dias no ar', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/anunciar');
    await entrarComo(page, 'super');
    await ir(page, '#/vagas');
    const c = contador(page);
    const linha = page.locator('.tabela tbody tr').first();
    const titulo = await linha.locator('.vaga-cel a').innerText();
    await c.clicar(linha.locator('[data-acao="duplicar"]'));
    await expect(page.locator('h1')).toContainText('cópia de');
    await expect(page.locator('#f-titulo')).toHaveValue(titulo.split(' · ')[0]);
    await c.escolher(page.locator('#f-loja'), { index: 1 });
    await c.clicar(page.locator('#btn-publicar'));
    await expect(page.locator('h1')).toHaveText('Sua vaga está no ar');
    expect(c.toques).toBeLessThanOrEqual(3);
    // pausar, voltar ao ar, encerrar e mais 30 dias
    await ir(page, '#/vagas');
    const alvo = page.locator('.tabela tbody tr').first();
    const nome = await alvo.locator('.vaga-cel a').innerText();
    await alvo.locator('[data-acao="pausar"]').click();
    await expect(page.locator('.toast')).toContainText('Vaga pausada');
    await page.locator('.aba', { hasText: 'Pausadas' }).click();
    await expect(page.locator('.tabela tbody tr').first()).toContainText(nome);
    await page.locator('.tabela tbody tr').first().locator('[data-acao="pausar"]').click();
    await expect(page.locator('.toast')).toContainText('voltou ao ar');
    await ir(page, '#/vagas');
    await page.locator('.tabela tbody tr').first().locator('[data-acao="encerrar"]').click();
    await page.click('#janela-ok');
    await expect(page.locator('.toast')).toContainText('Vaga encerrada');
    await page.locator('.aba', { hasText: 'Encerradas' }).click();
    await page.locator('.tabela tbody tr').first().locator('[data-acao="mais-30"]').click();
    await expect(page.locator('.toast')).toContainText('mais 30 dias');
    expect(erros).toEqual([]);
  });

  test('anunciar várias vagas: uma linha por vaga, revisão e publicação (empresa verificada)', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/anunciar');
    await entrarComo(page, 'super');
    await ir(page, '#/vagas/varias');
    await expect(page.locator('h1')).toHaveText('Anunciar várias vagas');
    for (const [i, f, s] of [[0, 'Caixa', '1800'], [1, 'Estoquista', '1700']]) {
      await page.fill(`#vr-${i}-titulo`, f);
      await page.locator(`#vr-${i}-titulo`).dispatchEvent('change');
      await page.fill(`#vr-${i}-de`, s);
      await page.selectOption(`#vr-${i}-turno`, 'Comercial');
    }
    await page.click('#vr-2-titulo');
    await page.click('[data-acao="vr-tirar"][data-i="2"]');
    await page.click('#form-varias button[type="submit"]');
    await expect(page.locator('h1')).toContainText('Revise as 2 vagas');
    await page.click('#vr-publicar');
    await expect(page.locator('.cab h1')).toHaveText('Vagas');
    await expect(page.locator('.toast')).toContainText('2 vagas no ar');
    expect(erros).toEqual([]);
  });
});

test.describe('candidatos (celular)', () => {
  test.use({ viewport: CELULAR });

  test('verificada: da lista ao "Chamar no WhatsApp" em poucos toques, com a ordem só por data', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/anunciar');
    await entrarComo(page, 'super');
    const c = contador(page);
    await c.clicar(page.locator('.barra-baixo a', { hasText: 'Candidatos' }));
    await expect(page.locator('h1')).toHaveText('Candidatos');
    await expect(page.locator('.nota-data.rodape-fixo-nota')).toHaveText('A ordem é por data. O Vagas sem Caos não dá nota nem classifica pessoas.');
    await c.clicar(page.locator('.cartao-candidato .cc-link').first());
    await expect(page.locator('#gaveta[open]')).toBeVisible();
    await expect(page.locator('#gv-nome')).toContainText(' '); // empresa verificada: nome completo
    await c.clicar(page.locator('[data-acao="gv-whats"]'));
    await expect(page.locator('#wa-msg')).toBeVisible();
    const [popup] = await Promise.all([page.waitForEvent('popup'), c.clicar(page.locator('#wa-abrir'))]);
    await popup.waitForURL(/wa\.me/);
    expect(popup.url()).toMatch(/^https:\/\/wa\.me\/55\d+\?text=/);
    expect(c.toques).toBeLessThanOrEqual(5);
    await semRolagemLateral(page);
    expect(erros).toEqual([]);
  });

  test('em verificação: só "Mandar mensagem"; o WhatsApp vem quando a pessoa libera', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/anunciar');
    await entrarComo(page, 'studio');
    await ir(page, '#/candidatos');
    await page.locator('.cartao-candidato .cc-link').first().click();
    await expect(page.locator('#gaveta[open]')).toBeVisible();
    await expect(page.locator('[data-acao="gv-whats"]')).toHaveCount(0);
    await expect(page.locator('[data-acao="gv-mensagem"]')).toBeVisible();
    await expect(page.locator('.gv-whats-linha')).toContainText('Pedir o WhatsApp');
    // só o primeiro nome
    expect((await page.locator('#gv-nome').innerText()).trim().split(/\s+/).length).toBe(1);
    await page.click('[data-acao="gv-mensagem"]');
    await expect(page.locator('.golpe-ambar')).toContainText('Nunca pague para se candidatar. Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.');
    await page.fill('#gv-msg', 'Olá. Podemos conversar amanhã às 14h?');
    await page.click('#gv-form button');
    await expect(page.locator('.msg.minha').last()).toContainText('Podemos conversar amanhã');
    // mensagem com número de telefone é barrada pelo banco
    await page.fill('#gv-msg', 'Me chama no 62 99999-1234');
    await page.click('#gv-form button');
    await expect(page.locator('#gv-erro')).toContainText('Telefone');
    expect(erros).toEqual([]);
  });

  test('marcar entrevista: dia, hora e convite; perguntas sugeridas sem nota', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/anunciar');
    await entrarComo(page, 'super');
    await ir(page, '#/candidatos?etapa=novos');
    const c = contador(page);
    await c.clicar(page.locator('.cartao-candidato .cc-link').first());
    await c.clicar(page.locator('[data-acao="gv-agendar"]'));
    await expect(page.locator('#form-ent')).toBeVisible();
    await expect(page.locator('#ent-enviar')).toBeDisabled();
    await page.locator('#form-ent summary').click();
    await expect(page.locator('#form-ent details')).toContainText('não dá nota');
    await c.clicar(page.locator('#ent-dias [data-dia]').nth(2));
    await c.clicar(page.locator('#ent-horas [data-h="10"]'));
    await c.clicar(page.locator('#ent-enviar'));
    await expect(page.locator('.toast')).toContainText('Convite enviado');
    await expect(page.locator('#gaveta .status').first()).toContainText('a confirmar');
    expect(erros).toEqual([]);
  });

  test('não seguir com desfazer', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/anunciar');
    await entrarComo(page, 'super');
    await ir(page, '#/candidatos?etapa=novos');
    const nome = (await page.locator('.cartao-candidato .cc-link').first().innerText()).trim();
    await page.locator('.cartao-candidato .cc-link').first().click();
    await page.click('[data-acao="gv-naoseguir"]');
    await page.click('#ns-ok');
    await expect(page.locator('.toast')).toContainText('foi para Não seguiu');
    await page.click('.toast-acao');
    await expect(page.locator('#gaveta .status').first()).not.toContainText('Não seguiu');
    expect(nome.length).toBeGreaterThan(1);
    expect(erros).toEqual([]);
  });

  test('filtros só por fato e ordem por data', async ({ page }) => {
    await abrir(page, '#/anunciar');
    await entrarComo(page, 'super');
    await ir(page, '#/candidatos');
    await expect(page.locator('#chips-filtro')).not.toContainText(/idade|sexo|estado civil|foto|nota/i);
    await page.locator('.segmentado [data-v="lista"]').click();
    const antes = await page.locator('.lista-cands > li').count();
    await page.locator('#chips-filtro [data-k="anexo"]').click();
    const depois = await page.locator('.lista-cands > li').count();
    expect(depois).toBeLessThan(antes);
    await expect(page.locator('#ordem option')).toHaveText(['Mais recentes primeiro', 'Mais antigos primeiro']);
  });
});

test.describe('empresa, equipe e verificação', () => {
  test('dados, endereços, equipe com link do convite e verificação com documento', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/anunciar');
    await entrarComo(page, 'studio');
    await ir(page, '#/empresa');
    await expect(page.locator('.selo.verificando')).toContainText('Empresa em verificação');
    await page.fill('#cd-sobre', 'Studio de unhas e beleza.');
    await page.click('#form-dados button[type="submit"]');
    await expect(page.locator('.toast')).toContainText('Dados salvos');
    await page.click('#add-loja summary');
    await page.fill('#lj-nome', 'Studio Centro');
    await page.selectOption('#lj-bairro', 'Centro');
    await page.click('#form-loja button[type="submit"]');
    await expect(page.locator('.lojas')).toContainText('Studio Centro');
    await ir(page, '#/empresa?aba=equipe');
    await page.fill('#eq-email', 'ajudante@exemplo.com');
    await page.click('#form-equipe button[type="submit"]');
    await expect(page.locator('#eq-convite')).toContainText('Copie o link');
    await expect(page.locator('#eq-link')).toContainText('#/entrar?convite=');
    await ir(page, '#/verificacao');
    await expect(page.locator('.etapas')).toContainText('CNPJ ativo na Receita Federal');
    await expect(page.locator('.faixa.calmo').first()).toContainText('Prazo: até');
    await page.setInputFiles('#vf-arquivo', { name: 'cartao-cnpj.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 exemplo') });
    await page.click('#vf-enviar');
    await expect(page.locator('.toast')).toContainText('Documento enviado');
    await expect(page.locator('ul.arquivos', { hasText: 'cartao-cnpj.pdf' })).toBeVisible();
    expect(erros).toEqual([]);
  });

  test('empresa verificada mostra a data e o estado; Entrar por código leva ao painel', async ({ page }) => {
    const erros = observar(page);
    await abrir(page, '#/entrar');
    await expect(page.locator('#form-entrar')).toBeVisible();
    await page.fill('#ent-email', 'contato@mercado.exemplo');
    await page.click('#ent-botao');
    await expect(page.locator('#form-codigo')).toBeVisible();
    await page.fill('#codigo', '000000');
    await page.click('#cod-ok');
    await expect(page.locator('#cod-erro')).toContainText('Código errado');
    await page.fill('#codigo', '123456');
    await page.click('#cod-ok');
    await expect(page.locator('h1').first()).toHaveText('Início');
    await ir(page, '#/verificacao');
    await expect(page.locator('.selo.verificada')).toContainText('Empresa verificada');
    await expect(page.locator('.selo-data')).toContainText('CNPJ conferido em');
    expect(erros).toEqual([]);
  });
});

test.describe('aparência', () => {
  test('tema escuro e telas principais sem rolagem lateral em 390 px', async ({ page }) => {
    const erros = observar(page);
    await page.setViewportSize(CELULAR);
    await page.emulateMedia({ colorScheme: 'dark' });
    await abrir(page, '#/anunciar');
    const fundo = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(fundo).not.toBe('rgb(255, 255, 255)');
    await entrarComo(page, 'super');
    for (const h of ['#/inicio', '#/vagas', '#/candidatos', '#/empresa', '#/verificacao', '#/vagas/varias', '#/vaga/nova']) {
      await ir(page, h);
      await page.waitForSelector('html[data-empresa-pronta]');
      await page.waitForTimeout(250);
      await semRolagemLateral(page);
    }
    // tema escolhido pela pessoa vence o do aparelho
    await page.evaluate(() => localStorage.setItem('vsc.prefs.v1', JSON.stringify({ tema: 'light', fx: 'auto' })));
    await page.reload();
    await page.waitForSelector('html[data-empresa-pronta]');
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe('light');
    expect(erros).toEqual([]);
  });
});
