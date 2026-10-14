// Vagas sem Caos — página de divulgação para empresas (vagas/empresas.html), no computador (projeto desktop) e no celular do
// dono da loja, sobre a PRÉVIA. A cidade é criada no próprio teste (nome fictício lido de volta do dado).
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

test('empresa, lista de espera (computador): em 10 segundos o ganho, o preço e quem está por trás; lista como empresa; WhatsApp pendente', async ({ page }) => {
  const erros = vigiarErros(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const cidade = await prepararCidade(page, 'lista_espera');
  await page.goto(BASE + 'empresas.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera como empresa');
  await expect(page.locator('.vg-div-hero__sobre')).toHaveText('Para empresas de ' + cidade.nome);
  await expect(page.locator('h1')).toHaveText('Pare de entrevistar quem não sabe o básico.');
  await expect(page.locator('.vg-div-fatos dt')).toHaveText(['Quanto custa', 'Quem está por trás', 'Para começar']);
  await expect(page.locator('.vg-div-fatos')).toContainText('Grátis no lançamento.');
  await expect(page.locator('.vg-div-fatos')).toContainText('Gestão sem Caos');
  await expect(page.locator('#vg-espera-texto')).toHaveText('O Vagas sem Caos ainda não chegou em ' + cidade.nome + '. Entre na lista e avisamos quando chegar.');

  // Ação do topo pela situação; leva à chamada com o foco no e-mail. Sem barra fixa no computador.
  await expect(page.locator('#vg-topo-acao')).toHaveText('Entrar na lista de espera');
  await expect(page.locator('#vg-barra-divulgacao')).toBeHidden();
  await page.click('#vg-topo-acao');
  await expect(page.locator('#vg-espera-email')).toBeFocused();

  // Caminho humano: o número da Gestão sem Caos é pendência do dono; até lá o botão fica desligado, com o marcador.
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
  await expect(page.locator('#vg-espera-ok')).toHaveText('Pronto! Avisamos por e-mail quando ' + cidade.nome + ' abrir.');
  expect(await page.evaluate(() => window.__envios)).toEqual([{ cidade: cidade.slug, email: 'dona.loja@exemplo.com', perfil: 'empresa' }]);
  const linha = await page.evaluate((slug) => JSON.parse(localStorage.getItem('vagas_previa_v2')).listaEspera.filter((l) => l.cidade === slug)[0], cidade.slug);
  expect(linha.perfil).toBe('empresa');
  expect(erros).toEqual([]);
});

test('empresa, cidade ativa: "Cadastrar minha empresa" (topo e chamada) abre o cadastro da empresa em entrar.html?tipo=empresa', async ({ page }) => {
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
  // Perguntas de quem contrata: a do nome escondido tem a resposta do cartão sem nome e a lei.
  const p = page.locator('.vg-div-pergunta').filter({ hasText: 'Por que não aparece o nome de quem se candidata?' });
  await p.locator('summary').click();
  await expect(p).toContainText('Cartão sem nome e sem contato, por ordem de chegada.');
  await expect(p).toContainText('Lei 9.029/1995');
});
