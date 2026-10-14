// Vagas sem Caos — página de divulgação para empresas (vagas/empresas.html), no computador (projeto desktop) e no celular do
// dono da loja (360 e 390 px), sobre a PRÉVIA. A cidade é criada no próprio teste (nome fictício lido de volta do dado).
// Recursos do banco que ainda não existem (pré-abertura) e o número do WhatsApp são simulados trocando o arquivo servido.
const { test, expect } = require('@playwright/test');

const BASE = '/vagas/';
const CIDADE = { slug: 'divulgacao-empresa-xx', nome: 'Cidade Empresa Teste', uf: 'XX' };

async function prepararCidade(page, status) {
  await page.goto(BASE + 'empresas.html');
  await page.waitForFunction(() => window.VAGAS_REGRAS && window.VAGAS_API);
  return page.evaluate(async ({ c, status }) => {
    await window.VAGAS_API.entrar('admin@previa.com', 'previa123');
    await window.VAGAS_API.admCidadeSalvar({ slug: c.slug, nome: c.nome, uf: c.uf, status, ordem: 0 });
    await window.VAGAS_API.sair();
    const r = await window.VAGAS_API.cidades();
    return r.cidades.filter((x) => x.slug === c.slug)[0];
  }, { c: CIDADE, status });
}
function vigiarErros(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  return erros;
}
async function trocarArquivo(page, padrao, de, para) {
  await page.route(padrao, async (r) => {
    const resp = await r.fetch();
    const corpo = await resp.text();
    if (!corpo.includes(de)) throw new Error('trecho não encontrado em ' + padrao + ': ' + de);
    await r.fulfill({ response: resp, body: corpo.replace(de, para) });
  });
}

test('empresa, lista de espera (computador): em 10 segundos o ganho, o preço e quem está por trás; lista como empresa; WhatsApp pendente só na prévia', async ({ page }) => {
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const cidade = await prepararCidade(page, 'lista_espera');
  await page.goto(BASE + 'empresas.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera como empresa');
  await expect(page.locator('#vg-div-sobre')).toHaveText('Para empresas de ' + cidade.nome);
  await expect(page.locator('h1')).toHaveText('Veja o que a pessoa sabe antes da entrevista.');
  await expect(page.locator('.vg-div-hero__texto')).toContainText('com margem de cerca de 10 pontos');
  await expect(page.locator('.vg-div-hero__texto')).toContainText('Sem selo não quer dizer que a pessoa não sabe');
  await expect(page.locator('.vg-div-fatos dt')).toHaveText(['Quanto custa', 'Quem está por trás', 'Para começar']);
  await expect(page.locator('.vg-div-fatos')).toContainText('Anunciar vaga é grátis no lançamento.');
  await expect(page.locator('.vg-div-fatos')).toContainText('Gestão sem Caos');
  await expect(page.locator('#vg-espera-texto')).toHaveText('O Vagas sem Caos ainda não chegou em ' + cidade.nome + '. Entre na lista e avisamos quando chegar.');
  await expect(page.locator('body')).not.toContainText('DISC');

  // Ação do topo pela situação; leva à chamada com o foco no e-mail. Sem barra fixa no computador.
  await expect(page.locator('#vg-topo-acao')).toHaveText('Entrar na lista de espera');
  await expect(page.locator('#vg-barra-divulgacao')).toBeHidden();
  await page.click('#vg-topo-acao');
  await expect(page.locator('#vg-espera-email')).toBeFocused();

  // Caminho humano: sem número, na prévia aparece desligado com o marcador; nenhum link wa.me.
  await expect(page.locator('#vg-topo-whatsapp')).toBeDisabled();
  await expect(page.locator('#vg-topo-whatsapp-pendente')).toContainText('[NÚMERO DA GESTÃO SEM CAOS]');
  await expect(page.locator('#vg-chamada-whatsapp')).toBeDisabled();
  await expect(page.locator('a[href^="https://wa.me/"]')).toHaveCount(0);

  await page.evaluate(() => {
    window.__envios = [];
    const original = window.VAGAS_API.listaEspera;
    window.VAGAS_API.listaEspera = (d) => { window.__envios.push(d); return original(d); };
  });
  await page.fill('#vg-espera-email', 'Dona.Loja@Exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok p')).toHaveText(['Pronto! Avisamos por e-mail quando ' + cidade.nome + ' abrir.']);
  expect(await page.evaluate(() => window.__envios)).toEqual([{ cidade: cidade.slug, email: 'dona.loja@exemplo.com', perfil: 'empresa' }]);
  expect(erros).toEqual([]);
});

test('empresa, cidade aberta: "Cadastrar minha empresa" (topo e chamada) abre o cadastro da empresa em entrar.html?tipo=empresa', async ({ page }) => {
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const cidade = await prepararCidade(page, 'ativa');
  await page.goto(BASE + 'empresas.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Cadastre sua empresa');
  await expect(page.locator('#vg-topo-acao')).toHaveText('Cadastrar minha empresa');
  await expect(page.locator('#vg-topo-acao')).toHaveAttribute('href', 'entrar.html?tipo=empresa');
  await expect(page.locator('#vg-cadastrar-empresa')).toHaveAttribute('href', 'entrar.html?tipo=empresa');
  await expect(page.locator('#vg-ja-tenho-conta')).toHaveAttribute('href', 'entrar.html?tipo=empresa#entrar');
  await expect(page.locator('#vg-form-espera')).toHaveCount(0);
  await page.click('#vg-cadastrar-empresa');
  await page.waitForURL(/entrar\.html\?tipo=empresa$/);
  await expect(page.locator('#vg-emp-titulo')).toHaveText('Cadastrar empresa');
  expect(erros).toEqual([]);
});

test('pré-abertura (C1, com RECURSOS.preAberturaEmpresas): em espera a empresa já se cadastra; sem a marca, lista como antes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cidade = await prepararCidade(page, 'lista_espera');
  await trocarArquivo(page, '**/js/api.js', 'return { listaEsperaWhatsapp: true };', 'return { listaEsperaWhatsapp: true, preAberturaEmpresas: true };');
  await page.goto(BASE + 'empresas.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Cadastre sua empresa');
  await expect(page.locator('#vg-pre-abertura')).toHaveText('Sua vaga entra no ar no dia em que ' + cidade.nome + ' abrir. Precisa de CNPJ ou MEI. No lançamento, é grátis.');
  await expect(page.locator('#vg-topo-acao')).toHaveText('Cadastrar minha empresa');
  await expect(page.locator('#vg-cadastrar-empresa')).toHaveAttribute('href', 'entrar.html?tipo=empresa');
  await expect(page.locator('#vg-chamada')).toContainText('Prefere que a gente faça com você? Chame a Gestão sem Caos no WhatsApp.');
  await expect(page.locator('#vg-form-espera')).toHaveCount(0);
});

test('empresa no celular do dono: sem rolagem lateral; a barra fixa aparece quando o botão do topo sai da tela e some na chamada', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const cidade = await prepararCidade(page, 'lista_espera');
  await page.goto(BASE + 'empresas.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera como empresa');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  const barra = page.locator('#vg-barra-divulgacao');
  await expect(barra).toHaveClass(/vg-div-barra--oculta/);           // o botão do topo está na tela
  await page.locator('#vg-div-ganhos-titulo').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 600));
  await expect(barra).not.toHaveClass(/vg-div-barra--oculta/);
  await expect(page.locator('#vg-barra-acao')).toHaveText('Entrar na lista de espera');
  await expect(page.locator('#vg-barra-divulgacao-dica')).toHaveText('Grátis no lançamento.');
  await page.locator('#vg-chamada').scrollIntoViewIfNeeded();
  await expect(barra).toHaveClass(/vg-div-barra--oculta/);
  // O nome escondido: a regra única do contato e o texto aprovado da lei.
  const p = page.locator('.vg-div-pergunta').filter({ hasText: 'Por que não aparece o nome de quem se candidata?' });
  await p.locator('summary').click();
  await expect(p).toContainText('Se a pessoa tocar em "Combinou", os dois passam a ver nome, WhatsApp e e-mail.');
  await expect(p).toContainText('(Lei 9.029/1995; CLT, art. 373-A). Descreva a função, não a pessoa.');
});

test('a 360 px com o número da Gestão sem Caos: WhatsApp só com o ícone na barra e nada passa da pílula; topo com o link', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const cidade = await prepararCidade(page, 'lista_espera');
  await trocarArquivo(page, '**/js/divulgacao.js', "var WHATSAPP_GESTAO = '[NÚMERO DA GESTÃO SEM CAOS]';", "var WHATSAPP_GESTAO = '5562999990000';");
  await page.goto(BASE + 'empresas.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-topo-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/5562999990000\?text=/);
  const texto = decodeURIComponent((await page.locator('#vg-topo-whatsapp').getAttribute('href')).split('?text=')[1]);
  expect(texto).toBe('Oi! Tenho uma empresa em ' + cidade.nome + ' e quero saber como anunciar vagas no Vagas sem Caos.');
  await expect(page.locator('body')).not.toContainText('[NÚMERO DA GESTÃO SEM CAOS]');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.evaluate(() => window.scrollTo(0, 1400));
  await expect(page.locator('#vg-barra-divulgacao')).not.toHaveClass(/vg-div-barra--oculta/);
  await expect(page.locator('#vg-barra-whatsapp')).toHaveAttribute('aria-label', 'Falar no WhatsApp');
  await expect(page.locator('#vg-barra-whatsapp')).toHaveText('');
  for (const b of await page.locator('#vg-barra-divulgacao .barra-botoes .botao').all()) {
    expect(await b.evaluate((x) => x.scrollWidth <= x.clientWidth)).toBe(true);
  }
  for (const sel of ['#vg-topo-acao', '#vg-topo-whatsapp']) {
    expect(await page.locator(sel).evaluate((x) => x.scrollWidth <= x.clientWidth)).toBe(true);
  }
});

test('fora da prévia sem número: a empresa não vê botão de WhatsApp nem marcador (nem no topo, nem na chamada, nem no rodapé)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const cidade = await prepararCidade(page, 'lista_espera');
  await trocarArquivo(page, '**/js/api.js', "api.modo = 'previa';", "api.modo = 'previa-teste';");
  await page.goto(BASE + 'empresas.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera como empresa');
  await expect(page.locator('#vg-topo-whatsapp')).toHaveCount(0);
  await expect(page.locator('#vg-chamada-whatsapp')).toHaveCount(0);
  await expect(page.locator('.vg-div-humano')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('[NÚMERO DA GESTÃO SEM CAOS]');
  await expect(page.locator('body')).not.toContainText('[RAZÃO SOCIAL');
});
