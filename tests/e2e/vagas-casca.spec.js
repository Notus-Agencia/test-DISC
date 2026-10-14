// Vagas sem Caos — base comum no computador (projeto desktop), sobre a PRÉVIA: cadastro da empresa (só a conta, sem senha, com o
// rascunho para a frente empresa), termos e privacidade gerados e a conversa do lado da empresa (só leitura quando suspensa).
const { test, expect } = require('@playwright/test');

const BASE = '/vagas/';

test('empresa: cadastro sem senha guarda o rascunho (CNPJ, nome, responsável, WhatsApp) e, depois do link e da senha, vai para empresa.html', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.goto(BASE + 'entrar.html?tipo=empresa');
  await expect(page.locator('#vg-emp-titulo')).toHaveText('Cadastrar empresa');
  await expect(page.locator('#vg-emp-form-cadastro input[type="password"]')).toHaveCount(0);
  await page.fill('#vg-emp-cnpj', '11222333000100');
  await expect(page.locator('#vg-emp-cnpj')).toHaveValue('11.222.333/0001-00');
  await page.click('#vg-emp-cadastrar');
  await expect(page.locator('#vg-emp-cnpj-erro')).toHaveText('CNPJ inválido. Confira os 14 números.');
  await expect(page.locator('#vg-emp-termos-erro')).toHaveText('Marque a caixa para continuar');
  await page.fill('#vg-emp-cnpj', '11.222.333/0001-81');
  await page.fill('#vg-emp-nome', 'Loja Nova Exemplo');
  await page.fill('#vg-emp-responsavel', 'Marcos Exemplo');
  await page.fill('#vg-emp-email', 'marcos@lojanova.exemplo');
  await page.fill('#vg-emp-whatsapp', '(95) 99999-0000');
  await page.check('#vg-emp-termos');
  await page.click('#vg-emp-cadastrar');
  await expect(page.locator('#vg-confirmar-email')).toContainText('Se este e-mail puder ser usado');
  const rascunho = await page.evaluate(() => JSON.parse(localStorage.getItem('vg.rascunho.empresa')));
  expect(rascunho.dados).toEqual({ cnpj: '11222333000181', nomeFantasia: 'Loja Nova Exemplo', responsavel: 'Marcos Exemplo', email: 'marcos@lojanova.exemplo',
    whatsapp: '5595999990000', cidade: '' });
  await page.click('#vg-abrir-link-previa');
  await expect(page.locator('#vg-ns-email')).toHaveValue('marcos@lojanova.exemplo');
  await page.fill('#vg-ns-senha', 'senha-boa-123');
  await page.fill('#vg-ns-confirmar', 'senha-boa-123');
  const antes = erros.slice();
  await page.click('#vg-ns-salvar');
  await page.waitForURL(/empresa\.html#inicio$/);
  expect(antes).toEqual([]);
});

test('convite de equipe: entrar.html?convite= abre em "Entrar" e segue para empresa.html?convite=; na volta do link o convite fica no endereço', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  const tk = 'c0'.repeat(32);
  // quem já tem conta: entra e vai para a tela de aceite da empresa (não para empresa.html#inicio)
  await page.goto(BASE + 'entrar.html?convite=' + tk);
  await expect(page.locator('#vg-form-entrar')).toBeVisible();
  await page.fill('#vg-entrar-email', 'empresa@previa.com');
  await page.fill('#vg-entrar-senha', 'previa123');
  await page.click('#vg-entrar-enviar');
  await page.waitForURL(new RegExp('empresa\\.html\\?convite=' + tk + '$'));
  // quem recebeu o link do e-mail (token_hash + convite): o token sai do endereço, o convite fica; depois da senha, o aceite
  await page.goto(BASE + 'entrar.html#entrar');
  const link = await page.evaluate(async () => {
    await window.VAGAS_API.sair();
    const r = await window.VAGAS_API.cadastrar({ email: 'convidada.equipe@exemplo.com', tipo: 'pessoa', nome: 'Convidada Teste',
      termosVersao: window.VAGAS_TEXTOS.consentimentos.termosVersao });
    return r.linkPrevia;
  });
  expect(link).toMatch(/^entrar\.html\?token_hash=/);
  await page.goto(BASE + link + '&convite=' + tk);
  await expect(page.locator('#vg-ns-email')).toHaveValue('convidada.equipe@exemplo.com');
  expect(new URL(page.url()).search).toBe('?convite=' + tk);
  await page.fill('#vg-ns-senha', 'senha-boa-123');
  await page.fill('#vg-ns-confirmar', 'senha-boa-123');
  await page.click('#vg-ns-salvar');
  await page.waitForURL(new RegExp('empresa\\.html\\?convite=' + tk + '$'));
  expect(await page.evaluate(() => localStorage.getItem('vg.entrar.convite'))).toBeNull();
  // token inválido no endereço: ignorado (vai para o destino normal)
  await page.goto(BASE + 'entrar.html?convite=nao-e-token#entrar');
  await page.evaluate(() => window.VAGAS_API.sair());
  await page.goto(BASE + 'entrar.html?convite=nao-e-token&de-novo=1#entrar');
  await page.fill('#vg-entrar-email', 'empresa@previa.com');
  await page.fill('#vg-entrar-senha', 'previa123');
  await page.click('#vg-entrar-enviar');
  await page.waitForURL(/empresa\.html#inicio$/);
  expect(erros).toEqual([]);
});

test('roteador: o "Pular para o conteúdo" (#conteudo) não vira rota; foco no conteúdo e o endereço volta para a rota atual', async ({ page }) => {
  await page.goto(BASE + 'entrar.html#entrar');
  await page.addScriptTag({ url: BASE + 'js/ui-area.js' });
  await page.evaluate(() => {
    const main = window.VAGAS_UI.el('main', { id: 'conteudo' }, [window.VAGAS_UI.el('h1', {}, 'Teste')]);
    document.body.appendChild(main);
    window.__rotas = [];
    window.__r = window.VAGAS_UI.roteador({ raiz: main, padrao: 'inicio', rotas: {
      inicio: () => window.__rotas.push('inicio'), outra: () => window.__rotas.push('outra'), '*': () => window.__rotas.push('desconhecida') } });
  });
  await page.evaluate(() => { location.hash = '#outra'; });
  await expect.poll(() => page.evaluate(() => window.__rotas.join(','))).toBe('desconhecida,outra');   // #entrar não é rota deste roteador: coringa
  await page.evaluate(() => { location.hash = '#conteudo'; });
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#outra');
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('conteudo');
  expect(await page.evaluate(() => window.__rotas.join(','))).toBe('desconhecida,outra');
});

test('termos.html e privacidade.html: gerados dos textos, com a faixa de minuta e sem erro', async ({ page }) => {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  for (const [arq, titulo] of [['termos.html', 'Termos de uso'], ['privacidade.html', 'Aviso de privacidade']]) {
    await page.goto(BASE + arq);
    await expect(page).toHaveTitle(titulo + ' | Vagas sem Caos');
    await expect(page.locator('#vg-faixa-minuta')).toContainText('Minuta, em revisão jurídica.');
    await expect(page.locator('h1').first()).toContainText(titulo);
    await expect(page.locator('.vg-doc h2').first()).toBeVisible();
  }
  expect(erros).toEqual([]);
});

test('conversa (lado da empresa): cabeçalho sem nome antes do Combinou e só leitura com a faixa quando a empresa está suspensa', async ({ page }) => {
  await page.goto(BASE + 'entrar.html?tipo=empresa');
  await page.addScriptTag({ url: BASE + 'js/ui-area.js' });
  await page.addScriptTag({ url: BASE + 'js/conversa.js' });
  await page.evaluate(async () => {
    const eu = await window.VAGAS_API.entrar('empresa@previa.com', 'previa123');
    const r = await window.VAGAS_API.conversasDaEmpresa(eu.empresas[0].id);
    const c = r.conversas[0];
    const raiz = window.VAGAS_UI.el('div', { id: 'raiz-teste' });
    document.body.appendChild(raiz);
    window.__nome = '';
    window.__c = window.VAGAS_CONVERSA.montar(raiz, { lado: 'empresa', candidaturaId: c.candidaturaId, somenteLeitura: 'Esta empresa está suspensa. Fale com a Gestão sem Caos.',
      cabecalho: () => (window.__nome ? { nome: window.__nome } : {}) });
    await window.__c.pronto;
  });
  await expect(page.locator('#vg-conversa-nome')).toHaveText('Pessoa candidata');
  // redesenhar(): o nome que chega depois (contatoPessoa) entra no cabeçalho sem esperar a situação mudar
  await page.evaluate(() => { window.__nome = 'Nome que chegou depois'; window.__c.redesenhar(); });
  await expect(page.locator('#vg-conversa-nome')).toHaveText('Nome que chegou depois');
  await page.evaluate(() => { window.__nome = ''; window.__c.redesenhar(); });
  await expect(page.locator('#vg-conversa-faixa')).toHaveText('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
  await expect(page.locator('#vg-form-mensagem')).toBeHidden();
  await expect(page.locator('#vg-conversa-bloqueio')).toContainText('Esta conversa fica registrada.');
  await expect(page.locator('#vg-aviso-golpe')).toHaveCount(0);
});
