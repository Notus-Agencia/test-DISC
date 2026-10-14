// Vagas sem Caos — página de divulgação para quem procura trabalho (vagas/emprego.html), no celular (Pixel 5), sobre a PRÉVIA.
// A cidade é criada no próprio teste pela conta de equipe da prévia (nome fictício lido de volta do dado): os textos conferidos
// usam o nome que veio do banco, nunca um nome fixo. Recursos do banco que ainda não existem (pré-abertura, origem, canal) e o
// número do WhatsApp são simulados trocando o arquivo servido (page.route), sem mudar o repositório.
const { test, expect, devices } = require('@playwright/test');

const { defaultBrowserType, ...pixel5 } = devices['Pixel 5'];
void defaultBrowserType;
test.use(pixel5);

const BASE = '/vagas/';
const CIDADE = { slug: 'divulgacao-teste-xx', nome: 'Cidade de Teste', uf: 'XX' };

// Deixa a cidade de teste com a situação pedida (lista de espera ou ativa) e devolve o que o banco publica.
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
// Linhas da lista de espera guardadas pela prévia (a chave muda de versão: vagas_previa_v2, v3…).
async function listaPrevia(page, slug) {
  return page.evaluate((s) => {
    const k = Object.keys(localStorage).filter((x) => /^vagas_previa_v\d+$/.test(x)).sort().pop();
    return JSON.parse(localStorage.getItem(k)).listaEspera.filter((l) => l.cidade === s);
  }, slug);
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
// Troca um trecho do arquivo servido (simula recurso do banco ou número do dono).
async function trocarArquivo(page, padrao, de, para) {
  await page.route(padrao, async (r) => {
    const resp = await r.fetch();
    const corpo = await resp.text();
    if (!corpo.includes(de)) throw new Error('trecho não encontrado em ' + padrao + ': ' + de);
    await r.fulfill({ response: resp, body: corpo.replace(de, para) });
  });
}
async function espiarEnvios(page) {
  await page.evaluate(() => {
    window.__envios = [];
    const original = window.VAGAS_API.listaEspera;
    window.VAGAS_API.listaEspera = (d) => { window.__envios.push(d); return original(d); };
  });
}

test('lista de espera: o topo diz que ainda não abriu, com o nome do dado; dúvidas logo no começo; o botão do topo leva ao formulário', async ({ page }) => {
  const erros = vigiarErros(page);
  const cidade = await prepararCidade(page, 'lista_espera');
  expect(cidade.status).toBe('lista_espera');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera de ' + cidade.nome);
  await expect(page.locator('#vg-div-sobre')).toHaveText('Chegando em ' + cidade.nome);
  await expect(page.locator('#vg-div-hero-texto')).toHaveText('Vagas de carteira assinada, bico e diária de empresas de ' + cidade.nome + ', num lugar só.');
  await expect(page.locator('#vg-div-situacao')).toHaveText('Ainda não abriu: deixe seu contato e avisamos.');
  await expect(page.locator('#vg-div-como-titulo')).toHaveText('Como vai funcionar');
  await expect(page.locator('h1')).toHaveText('Mostre o que você sabe fazer.');
  await expect(page.locator('.vg-div-duvidas strong')).toHaveText(['É golpe?', 'Vão me cobrar?', 'Vão ver minha cara?', 'Precisa de experiência?']);
  await expect(page.locator('#vg-aviso-golpe')).toContainText('Nunca pague para se candidatar. Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.');
  await semRolagemLateral(page);

  // O botão do topo (já no HTML) leva ao formulário; a barra fixa some enquanto o botão do topo ou a chamada está na tela.
  const barra = page.locator('#vg-barra-divulgacao');
  await expect(page.locator('#vg-topo-acao')).toHaveText('Me avise quando abrir');
  await expect(barra).toHaveAttribute('role', 'region');
  await expect(barra).toHaveClass(/vg-div-barra--oculta/);
  await page.locator('#vg-div-cego-titulo').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 400));
  await expect(barra).not.toHaveClass(/vg-div-barra--oculta/);
  await expect(page.locator('#vg-barra-acao')).toHaveText('Me avise quando abrir');
  await expect(page.locator('#vg-barra-divulgacao-dica')).toHaveText('Grátis para quem procura trabalho. Sempre.');
  await page.click('#vg-barra-acao');
  await expect(page.locator('#vg-espera-email')).toBeFocused();
  await expect(barra).toHaveClass(/vg-div-barra--oculta/);

  // Os dois erros aparecem juntos (mensagens de avisos.json), com aria; o foco vai para o primeiro.
  await page.fill('#vg-espera-email', 'quero.vaga@');
  await page.fill('#vg-espera-whatsapp', '(62) 3333-1111');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-email-erro')).toHaveText('Escreva um e-mail válido, por exemplo nome@exemplo.com.');
  await expect(page.locator('#vg-espera-whatsapp-erro')).toHaveText('Escreva o WhatsApp com DDD e o número do celular, só os números (11 dígitos).');
  await expect(page.locator('#vg-espera-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#vg-espera-email')).toHaveAttribute('aria-describedby', /vg-espera-email-erro/);
  await expect(page.locator('#vg-espera-email')).toBeFocused();
  await expect(page.locator('#vg-espera-email-ajuda')).toContainText('Quem usa Android já tem e-mail: o Gmail do celular.');
  await expect(page.locator('#vg-espera-whatsapp-ajuda')).toHaveText('É por ele que avisamos quando abrir. Só para isso.');

  // Envio: listaEspera({cidade, email, perfil:'pessoa', whatsapp}); a prévia guarda o WhatsApp (migração 20261024).
  await espiarEnvios(page);
  await page.fill('#vg-espera-email', 'quero.vaga@exemplo.com');
  await page.fill('#vg-espera-whatsapp', '(62) 98888-1111');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok p').first()).toHaveText('Pronto! Avisamos por e-mail quando ' + cidade.nome + ' abrir.');
  await expect(page.locator('#vg-espera-ok')).toContainText('Avisamos no seu WhatsApp também.');
  await expect(page.locator('#vg-espera-ok')).toBeFocused();
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Você está na lista de ' + cidade.nome);
  expect(await page.evaluate(() => window.__envios)).toEqual([{ cidade: cidade.slug, email: 'quero.vaga@exemplo.com', perfil: 'pessoa', whatsapp: '5562988881111' }]);
  expect((await listaPrevia(page, cidade.slug)).map((l) => [l.email, l.perfil, l.whatsapp])).toEqual([['quero.vaga@exemplo.com', 'pessoa', '5562988881111']]);
  await expect(page.locator('#vg-amigo-depois')).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
  expect(erros).toEqual([]);
});

test('lista de espera: sair pelo e-mail (LGPD, foco no aviso), nota de consentimento e "Mandar no WhatsApp" com novidade local', async ({ page }) => {
  const erros = vigiarErros(page);
  const cidade = await prepararCidade(page, 'lista_espera');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-espera-lgpd')).toContainText('Ao tocar no botão, você aceita receber o aviso de quando ' + cidade.nome + ' abrir.');
  await expect(page.locator('#vg-espera-lgpd a')).toHaveAttribute('href', 'privacidade.html');
  await page.fill('#vg-espera-email', 'sair@exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok')).toBeVisible();

  await page.click('#vg-sair-abrir');
  await page.click('#vg-sair-enviar');
  await expect(page.locator('#vg-sair-email-erro')).toHaveText('Escreva um e-mail válido, por exemplo nome@exemplo.com.');
  await page.fill('#vg-sair-email', 'sair@exemplo.com');
  await page.click('#vg-sair-enviar');
  await expect(page.locator('#vg-sair-ok')).toHaveText('Pronto. Se este e-mail estava na lista, ele saiu.');
  await expect(page.locator('#vg-sair-ok')).toBeFocused();
  expect(await listaPrevia(page, cidade.slug)).toEqual([]);

  await expect(page.locator('#vg-amigo')).toHaveText('Mandar no WhatsApp');
  const href = await page.locator('#vg-amigo').getAttribute('href');
  expect(href.startsWith('https://wa.me/?text=')).toBe(true);
  const texto = decodeURIComponent(href.replace('https://wa.me/?text=', ''));
  expect(texto.startsWith('Vai abrir o Vagas sem Caos em ' + cidade.nome + ': ')).toBe(true);
  expect(texto).toMatch(/https:\/\/vagas\.gestaosemcaos\.com\.br\/emprego\?(cidade=[a-z0-9-]+&)?de=indicacao · Nunca pague para se candidatar\.$/);
  expect(erros).toEqual([]);
});

test('cidade aberta: primeiro "Ver as vagas de {cidade}", depois "Criar minha conta"; "sair da lista" vai para o rodapé', async ({ page }) => {
  const erros = vigiarErros(page);
  const cidade = await prepararCidade(page, 'ativa');
  expect(cidade.status).toBe('ativa');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Já tem vaga em ' + cidade.nome);
  await expect(page.locator('#vg-div-sobre')).toHaveText('Vagas em ' + cidade.nome);
  await expect(page.locator('#vg-div-situacao')).toHaveText('Já abriu: veja as vagas e toque em "Quero".');
  await expect(page.locator('#vg-topo-acao')).toHaveText('Ver as vagas de ' + cidade.nome);
  await expect(page.locator('#vg-topo-acao')).toHaveAttribute('href', 'cidade.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-topo-acao2')).toHaveText('Criar minha conta');
  await expect(page.locator('#vg-ver-vagas')).toHaveAttribute('href', 'cidade.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-criar-conta')).toHaveAttribute('href', 'entrar.html#criar');
  await expect(page.locator('#vg-ja-tenho-conta')).toHaveAttribute('href', 'entrar.html#entrar');
  await expect(page.locator('#vg-form-espera')).toHaveCount(0);
  await expect(page.locator('#vg-chamada #vg-sair')).toHaveCount(0);
  await expect(page.locator('#vg-div-rodape #vg-sair-abrir')).toHaveText('Sair da lista de espera');
  await expect(page.locator('#vg-barra-acao')).toHaveText('Ver as vagas de ' + cidade.nome);
  const texto = decodeURIComponent((await page.locator('#vg-amigo').getAttribute('href')).replace('https://wa.me/?text=', ''));
  expect(texto.startsWith('Já tem vaga no Vagas sem Caos em ' + cidade.nome + ': ')).toBe(true);
  await semRolagemLateral(page);
  await page.click('#vg-criar-conta');
  await page.waitForURL(/entrar\.html#criar$/);
  await expect(page.locator('#vg-criar-titulo')).toHaveText('Criar minha conta');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vg.cidade')))).toBe(cidade.slug);
  expect(erros).toEqual([]);
});

test('sem ?cidade=: primeira cidade-polo; perguntas abrem sem script; sem conexão o topo continua usável e "Tentar de novo" volta', async ({ page }) => {
  const cidade = await prepararCidade(page, 'lista_espera');   // ordem 0: vira a primeira da lista
  await page.goto(BASE + 'emprego.html');
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera de ' + cidade.nome);
  await expect(page.locator('#vg-outras-cidades')).toContainText('Outra cidade:');
  const pergunta = page.locator('.vg-div-pergunta').filter({ hasText: 'E se eu não for bem no teste?' });
  await pergunta.locator('summary').click();
  await expect(pergunta).toHaveAttribute('open', '');
  await expect(pergunta).toContainText('A empresa não fica sabendo: ela só vê o selo.');

  // Sem conexão (o banco não responde): o topo fica com o texto do HTML e o botão leva à chamada, que mostra "Tentar de novo".
  const pagina = await page.context().newPage();
  await pagina.route('**/js/api-previa.js', (r) => r.abort());
  await pagina.goto(BASE + 'emprego.html');
  await expect(pagina.locator('#vg-tentar-de-novo')).toBeVisible();
  await expect(pagina.locator('#vg-faixa-offline')).toBeVisible();
  await expect(pagina.locator('#vg-div-sobre')).toHaveText('Emprego na sua cidade');
  await expect(pagina.locator('#vg-topo-acao')).toHaveText('Começar');
  await pagina.click('#vg-topo-acao');
  await expect(pagina.locator('#vg-tentar-de-novo')).toBeInViewport();
  await pagina.unroute('**/js/api-previa.js');
  await pagina.click('#vg-tentar-de-novo');
  await expect(pagina.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera de ' + cidade.nome);
});

test('erro do banco no envio: a mensagem aparece no formulário, o botão volta e nada se perde; a isca para robô não envia nada', async ({ page }) => {
  const cidade = await prepararCidade(page, 'lista_espera');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-form-espera')).toBeVisible();
  await page.evaluate(() => { window.VAGAS_API.listaEspera = () => Promise.reject(new Error('Muitas tentativas. Tente de novo mais tarde.')); });
  await page.fill('#vg-espera-email', 'alguem@exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-erro')).toHaveText('Muitas tentativas. Tente de novo mais tarde.');
  await expect(page.locator('#vg-espera-enviar')).toBeEnabled();
  await expect(page.locator('#vg-espera-email')).toHaveValue('alguem@exemplo.com');

  // Isca: um robô que preenche o campo escondido recebe o mesmo "Pronto!" e nada vai para o banco.
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-form-espera')).toBeVisible();
  await espiarEnvios(page);
  await expect(page.locator('#vg-espera-site')).toHaveAttribute('tabindex', '-1');
  await page.evaluate(() => { document.getElementById('vg-espera-site').value = 'http://spam.exemplo'; });
  await page.fill('#vg-espera-email', 'robo@exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok')).toBeVisible();
  expect(await page.evaluate(() => window.__envios)).toEqual([]);
});

test('banco sem o WhatsApp da lista (RECURSOS.listaEsperaWhatsapp falso): só o e-mail, e a nota fala só dele', async ({ page }) => {
  const cidade = await prepararCidade(page, 'lista_espera');
  await trocarArquivo(page, '**/js/api.js', 'return { listaEsperaWhatsapp: true };', 'return { listaEsperaWhatsapp: false };');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-espera-email')).toBeVisible();
  await expect(page.locator('#vg-espera-whatsapp')).toHaveCount(0);
  await expect(page.locator('#vg-espera-lgpd')).toContainText('Usamos o e-mail só para isso.');
  await espiarEnvios(page);
  await page.fill('#vg-espera-email', 'so.email@exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok p')).toHaveText(['Pronto! Avisamos por e-mail quando ' + cidade.nome + ' abrir.']);
  expect(await page.evaluate(() => window.__envios)).toEqual([{ cidade: cidade.slug, email: 'so.email@exemplo.com', perfil: 'pessoa' }]);
});

test('origem (C3) e canal da cidade (C2): só com o recurso do banco; ?de= da lista fechada vai no envio e nunca fica no aparelho', async ({ page }) => {
  const cidade = await prepararCidade(page, 'lista_espera');
  await trocarArquivo(page, '**/js/api.js', 'return { listaEsperaWhatsapp: true };',
    'return { listaEsperaWhatsapp: true, origemListaEspera: true };');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug + '&de=radio');
  await expect(page.locator('#vg-form-espera')).toBeVisible();
  await expect(page.locator('#vg-espera-canal')).toHaveCount(0);                  // a cidade não tem canal
  await espiarEnvios(page);
  await page.fill('#vg-espera-email', 'radio@exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok')).toBeVisible();
  expect(await page.evaluate(() => window.__envios)).toEqual([{ cidade: cidade.slug, email: 'radio@exemplo.com', perfil: 'pessoa', origem: 'radio' }]);
  // O que a página guarda no aparelho (fora o banco de mentira da prévia, que é o "banco" e guarda o e-mail): nada da origem.
  expect(await page.evaluate(() => {
    const tudo = {};
    for (const s of [localStorage, sessionStorage]) for (const k of Object.keys(s)) if (!/^vagas_previa/.test(k)) tudo[k] = s.getItem(k);
    return JSON.stringify(tudo);
  })).not.toContain('radio');

  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug + '&de=facebook');
  await espiarEnvios(page);
  await page.fill('#vg-espera-email', 'outra@exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok')).toBeVisible();
  expect(await page.evaluate(() => window.__envios[0].origem)).toBeUndefined();

  // Canal do WhatsApp da cidade (C2): link para fora, sem coletar nada; endereço que não é canal é ignorado.
  const p2 = await page.context().newPage();
  await p2.route('**/js/api.js', async (r) => {
    const resp = await r.fetch();
    const extra = '\n;(function(){var o=window.VAGAS_API.cidades;window.VAGAS_API.cidades=function(){return o.apply(this,arguments).then(function(r){' +
      'r.cidades.forEach(function(c){c.canalWhatsapp="https://whatsapp.com/channel/0029VaTESTE1234";});return r;});};})();';
    await r.fulfill({ response: resp, body: (await resp.text()) + extra });
  });
  await p2.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(p2.locator('#vg-canal-link')).toHaveText('Não usa e-mail? Siga o Canal do Vagas sem Caos em ' + cidade.nome + ' no WhatsApp');
  await expect(p2.locator('#vg-canal-link')).toHaveAttribute('href', 'https://whatsapp.com/channel/0029VaTESTE1234');
  await expect(p2.locator('#vg-canal-link')).toHaveAttribute('rel', 'noopener');
});

test('prévia "ver como": o dono vê a mesma cidade em espera e aberta, sem mudar o banco; ajuda humana com o marcador', async ({ page }) => {
  const cidade = await prepararCidade(page, 'ativa');
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Já tem vaga em ' + cidade.nome);
  await expect(page.locator('#vg-div-previa')).toContainText('Prévia · ver como:');
  await page.click('#vg-previa-espera');
  await expect(page.locator('#vg-previa-espera')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera de ' + cidade.nome);
  await expect(page.locator('#vg-div-sobre')).toHaveText('Chegando em ' + cidade.nome);
  // O banco segue com a cidade aberta; a prévia mostra o caminho de quem entra na lista mesmo assim.
  await page.fill('#vg-espera-email', 'dono@exemplo.com');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok')).toBeVisible();
  await page.reload();
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera de ' + cidade.nome, { timeout: 10000 });
  await page.click('#vg-previa-ativa');
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Já tem vaga em ' + cidade.nome);
  const status = await page.evaluate(async (slug) => (await window.VAGAS_API.cidades()).cidades.filter((c) => c.slug === slug)[0].status, cidade.slug);
  expect(status).toBe('ativa');
  // Ajuda humana: na prévia aparece com o marcador da pendência do dono (sem número, fora da prévia, ela some).
  await expect(page.locator('#vg-div-ajuda')).toBeVisible();
  await expect(page.locator('#vg-ajuda-whatsapp')).toBeDisabled();
  await expect(page.locator('#vg-div-ajuda')).toContainText('[NÚMERO DA GESTÃO SEM CAOS]');
  await expect(page.locator('#vg-marcador-empresa')).toHaveText('[RAZÃO SOCIAL E CNPJ DA GESTÃO SEM CAOS]');
});

test('fora da prévia sem número: nenhum botão de WhatsApp nem marcador; a 360 px nada passa da tela', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const cidade = await prepararCidade(page, 'lista_espera');
  await trocarArquivo(page, '**/js/api.js', "api.modo = 'previa';", "api.modo = 'previa-teste';");
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-chamada-titulo')).toHaveText('Entre na lista de espera de ' + cidade.nome);
  await expect(page.locator('#vg-div-previa')).toHaveCount(0);
  await expect(page.locator('#vg-div-ajuda')).toBeHidden();
  await expect(page.locator('#vg-ajuda-whatsapp')).toHaveCount(0);
  await expect(page.locator('#vg-marcador-empresa')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('[NÚMERO DA GESTÃO SEM CAOS]');
  await semRolagemLateral(page);
  for (const sel of ['#vg-topo-acao', '#vg-espera-enviar']) {
    expect(await page.locator(sel).evaluate((b) => b.scrollWidth <= b.clientWidth)).toBe(true);
  }
});

test('com o número da Gestão sem Caos: ajuda humana com o link do WhatsApp e a frase de denúncia na pergunta do golpe', async ({ page }) => {
  const cidade = await prepararCidade(page, 'lista_espera');
  await trocarArquivo(page, '**/js/divulgacao.js', "var WHATSAPP_GESTAO = '[NÚMERO DA GESTÃO SEM CAOS]';", "var WHATSAPP_GESTAO = '5562999990000';");
  await page.goto(BASE + 'emprego.html?cidade=' + cidade.slug);
  await expect(page.locator('#vg-ajuda-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/5562999990000\?text=/);
  const texto = decodeURIComponent((await page.locator('#vg-ajuda-whatsapp').getAttribute('href')).split('?text=')[1]);
  expect(texto).toBe('Oi! Moro em ' + cidade.nome + ' e quero ajuda com o Vagas sem Caos.');
  const golpe = page.locator('.vg-div-pergunta').filter({ hasText: 'E se for golpe?' });
  await golpe.locator('summary').click();
  await expect(golpe).toContainText('Pediram dinheiro? Denuncie a vaga ou chame a Gestão sem Caos no WhatsApp.');
  await expect(page.locator('body')).not.toContainText('[NÚMERO DA GESTÃO SEM CAOS]');
});
