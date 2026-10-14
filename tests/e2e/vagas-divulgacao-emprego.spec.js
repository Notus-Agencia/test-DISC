// Vagas sem Caos — página de divulgação para quem procura trabalho (vagas/emprego.html), no celular (Pixel 5), sobre a PRÉVIA.
// A cidade é criada no próprio teste pela conta de equipe da prévia (nome fictício lido de volta do dado): os textos conferidos
// usam o nome que veio do banco, nunca um nome fixo.
const { test, expect, devices } = require('@playwright/test');

const { defaultBrowserType, ...pixel5 } = devices['Pixel 5'];
void defaultBrowserType;
test.use(pixel5);

const BASE = '/vagas/';
const CIDADE = { slug: 'divulgacao-teste-xx', nome: 'Cidade de Teste', uf: 'XX' };

// Deixa a cidade de teste com a situação pedida (lista de espera ou ativa) e devolve o nome que o banco publica.
async function prepararCidade(page, status) {
  await page.goto(BASE + 'emprego.html');
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
async function semRolagemLateral(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test('lista de espera: nome da cidade do dado, dúvidas logo no começo, barra fixa, formulário com e-mail obrigatório e WhatsApp opcional', async ({ page }) => {
  const erros = vigiarErros(page);
  const cidade = await prepararCidade(page, 'lista_espera');
  expect(cidade.status).toBe('lista_espera');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera de ' + cidade.nome);
  await expect(page.locator('.vg-div-hero__sobre')).toHaveText('Emprego em ' + cidade.nome);
  await expect(page.locator('.vg-div-hero__texto')).toHaveText('E apareça para as empresas de ' + cidade.nome + '.');
  await expect(page.locator('h1')).toHaveText('Mostre o que você sabe fazer.');
  // As quatro dúvidas aparecem antes de "Como funciona"; o aviso anti-golpe é o fixo das telas.
  await expect(page.locator('.vg-div-duvidas strong')).toHaveText(['É golpe?', 'Vão me cobrar?', 'Precisa de experiência?', 'Vão ver minha cara?']);
  await expect(page.locator('#vg-aviso-golpe')).toHaveText('Nunca pague para se candidatar. Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.');
  await semRolagemLateral(page);

  // Barra fixa: a ação principal à mão; leva à chamada e põe o foco no e-mail; some quando a chamada está na tela.
  const barra = page.locator('#vg-barra-divulgacao');
  await expect(page.locator('#vg-barra-acao')).toHaveText('Me avise quando abrir');
  await expect(page.locator('#vg-barra-divulgacao-dica')).toHaveText('Grátis para quem procura trabalho. Sempre.');
  await expect(barra).not.toHaveClass(/vg-div-barra--oculta/);
  await page.click('#vg-barra-acao');
  await expect(page.locator('#vg-espera-email')).toBeFocused();
  await expect(barra).toHaveClass(/vg-div-barra--oculta/);

  // Validação: e-mail obrigatório; WhatsApp de telefone fixo recusado; mensagens de avisos.json no campo, com aria.
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-email-erro')).toHaveText('Escreva um e-mail válido, por exemplo nome@exemplo.com.');
  await expect(page.locator('#vg-espera-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#vg-espera-email')).toHaveAttribute('aria-describedby', /vg-espera-email-erro/);
  await expect(page.locator('label[for="vg-espera-whatsapp"]')).toContainText('(opcional)');
  await expect(page.locator('#vg-espera-whatsapp-ajuda')).toHaveText('É por ele que avisamos quando abrir. Só para isso.');
  await page.fill('#vg-espera-email', 'quero.vaga@exemplo.com');
  await page.fill('#vg-espera-whatsapp', '(62) 3333-1111');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-whatsapp-erro')).toHaveText('Escreva o WhatsApp com DDD e o número do celular, só os números (11 dígitos).');
  await expect(page.locator('#vg-espera-email-erro')).toHaveCount(0);

  // Envio: o contrato é listaEspera({cidade, email, perfil:'pessoa', whatsapp?}).
  await page.evaluate(() => {
    window.__envios = [];
    const original = window.VAGAS_API.listaEspera;
    window.VAGAS_API.listaEspera = (d) => { window.__envios.push(d); return original(d); };
  });
  await page.fill('#vg-espera-whatsapp', '(62) 98888-1111');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok')).toContainText('Pronto! Avisamos por e-mail quando ' + cidade.nome + ' abrir.');
  await expect(page.locator('#vg-espera-ok')).toContainText('Se você deixou o WhatsApp, avisamos por lá também.');
  expect(await page.evaluate(() => window.__envios)).toEqual([{ cidade: cidade.slug, email: 'quero.vaga@exemplo.com', perfil: 'pessoa', whatsapp: '5562988881111' }]);
  const naLista = await page.evaluate((slug) => JSON.parse(localStorage.getItem(Object.keys(localStorage).filter((k) => /^vagas_previa_v\d+$/.test(k)).sort().pop())).listaEspera.filter((l) => l.cidade === slug).map((l) => [l.email, l.perfil, l.whatsapp]), cidade.slug);
  expect(naLista).toEqual([['quero.vaga@exemplo.com', 'pessoa', '5562988881111']]);
  // Depois de entrar na lista: "Mandar para um amigo" ali mesmo.
  await expect(page.locator('#vg-amigo-depois')).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
  expect(erros).toEqual([]);
});

test('lista de espera: sair da lista pelo e-mail (LGPD), aviso de privacidade e "Mandar para um amigo" com texto pronto', async ({ page }) => {
  const erros = vigiarErros(page);
  const cidade = await prepararCidade(page, 'lista_espera');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await page.fill('#vg-espera-email', 'sair@exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok')).toBeVisible();
  await expect(page.locator('#vg-espera-lgpd')).toContainText('Usamos o e-mail e o WhatsApp só para este aviso. Guardamos até a cidade abrir e mais 90 dias.');
  await expect(page.locator('#vg-espera-lgpd a')).toHaveAttribute('href', 'privacidade.html');

  await page.click('#vg-sair-abrir');
  await page.click('#vg-sair-enviar');
  await expect(page.locator('#vg-sair-email-erro')).toHaveText('Escreva um e-mail válido, por exemplo nome@exemplo.com.');
  await page.fill('#vg-sair-email', 'sair@exemplo.com');
  await page.click('#vg-sair-enviar');
  await expect(page.locator('#vg-sair-ok')).toHaveText('Pronto. Se este e-mail estava na lista, ele saiu.');
  const naLista = await page.evaluate((slug) => JSON.parse(localStorage.getItem(Object.keys(localStorage).filter((k) => /^vagas_previa_v\d+$/.test(k)).sort().pop())).listaEspera.filter((l) => l.cidade === slug).length, cidade.slug);
  expect(naLista).toBe(0);

  const href = await page.locator('#vg-amigo').getAttribute('href');
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  const texto = decodeURIComponent(href.replace('https://wa.me/?text=', ''));
  expect(texto).toContain('vagas de empresas de ' + cidade.nome);
  expect(texto).toContain('lista de espera');
  expect(texto).toContain('Nunca pague para se candidatar.');
  expect(texto).toMatch(/https:\/\/vagas\.gestaosemcaos\.com\.br\/emprego(\?cidade=[a-z0-9-]+)?$/);
  await expect(page.locator('#vg-amigo')).toHaveText('Mandar para um amigo');
  expect(erros).toEqual([]);
});

test('cidade ativa: "Criar minha conta" vai para o cadastro e lembra a cidade; "Ver as vagas" abre a lista da cidade', async ({ page }) => {
  const erros = vigiarErros(page);
  const cidade = await prepararCidade(page, 'ativa');
  expect(cidade.status).toBe('ativa');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('O Vagas sem Caos já está em ' + cidade.nome);
  await expect(page.locator('#vg-form-espera')).toHaveCount(0);
  await expect(page.locator('#vg-criar-conta')).toHaveAttribute('href', 'entrar.html#criar');
  await expect(page.locator('#vg-ver-vagas')).toHaveAttribute('href', 'cidade.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-ja-tenho-conta')).toHaveAttribute('href', 'entrar.html#entrar');
  await expect(page.locator('#vg-barra-acao')).toHaveText('Criar minha conta');
  await expect(page.locator('#vg-barra-acao')).toHaveAttribute('href', 'entrar.html#criar');
  const texto = decodeURIComponent((await page.locator('#vg-amigo').getAttribute('href')).replace('https://wa.me/?text=', ''));
  expect(texto).toContain('reúne vagas de empresas de ' + cidade.nome);
  await semRolagemLateral(page);
  await page.click('#vg-criar-conta');
  await page.waitForURL(/entrar\.html#criar$/);
  await expect(page.locator('#vg-criar-titulo')).toHaveText('Criar minha conta');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vg.cidade')))).toBe(cidade.slug);
  expect(erros).toEqual([]);
});

test('sem ?cidade=: usa a primeira cidade-polo do banco; perguntas abrem sem script; sem internet mostra "Tentar de novo"', async ({ page }) => {
  const cidade = await prepararCidade(page, 'lista_espera');   // ordem 0: vira a primeira da lista
  await page.goto(BASE + 'emprego.html');
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera de ' + cidade.nome);
  await expect(page.locator('#vg-outras-cidades')).toContainText('Outra cidade:');
  const pergunta = page.locator('.vg-div-pergunta').filter({ hasText: 'É grátis mesmo?' });
  await pergunta.locator('summary').click();
  await expect(pergunta).toHaveAttribute('open', '');
  await expect(pergunta.locator('p')).toHaveText('Sim. Currículo, testes, selo e candidaturas são de graça, sempre. Você nunca paga para se candidatar.');

  // Sem conexão (o banco não responde): erro com "Tentar de novo"; o texto da página continua lá.
  const pagina = await page.context().newPage();
  await pagina.route('**/js/api-previa.js', (r) => r.abort());
  await pagina.goto(BASE + 'emprego.html');
  await expect(pagina.locator('#vg-tentar-de-novo')).toBeVisible();
  await expect(pagina.locator('#vg-faixa-offline')).toBeVisible();
  await expect(pagina.locator('h1')).toHaveText('Mostre o que você sabe fazer.');
  await pagina.unroute('**/js/api-previa.js');
  await pagina.click('#vg-tentar-de-novo');
  await expect(pagina.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera de ' + cidade.nome);
});

test('banco sem o WhatsApp da lista (RECURSOS.listaEsperaWhatsapp falso): só o e-mail, e o aviso de privacidade fala só dele', async ({ page }) => {
  const cidade = await prepararCidade(page, 'lista_espera');
  // Simula um cliente de antes da migração 20261024 trocando só o RECURSOS do api.js servido.
  await page.route('**/js/api.js', async (r) => {
    const resp = await r.fetch();
    const corpo = (await resp.text()).replace('return { listaEsperaWhatsapp: true };', 'return { listaEsperaWhatsapp: false };');
    await r.fulfill({ response: resp, body: corpo });
  });
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-espera-email')).toBeVisible();
  await expect(page.locator('#vg-espera-whatsapp')).toHaveCount(0);
  await expect(page.locator('#vg-espera-lgpd')).toContainText('Usamos o e-mail só para este aviso.');
  await page.evaluate(() => {
    window.__envios = [];
    const original = window.VAGAS_API.listaEspera;
    window.VAGAS_API.listaEspera = (d) => { window.__envios.push(d); return original(d); };
  });
  await page.fill('#vg-espera-email', 'so.email@exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok p')).toHaveText(['Pronto! Avisamos por e-mail quando ' + cidade.nome + ' abrir.']);
  expect(await page.evaluate(() => window.__envios)).toEqual([{ cidade: cidade.slug, email: 'so.email@exemplo.com', perfil: 'pessoa' }]);
});
