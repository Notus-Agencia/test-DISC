// Vagas sem Caos — área da pessoa: "Eu" (meus dados, baixar, banco de talentos, excluir, sair), referências do lado da pessoa (lista,
// ler e decidir, pedir) e a guarda da área, no celular (projeto vagas-celular), sobre a PRÉVIA. No fim, todas as telas a 390 px:
// sem rolagem lateral, um h1 por tela e nenhuma palavra proibida no texto que aparece.
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { PALAVRAS_PROIBIDAS } = require('../helpers/vagas-tela.js');

const BASE = '/vagas/';
const SENHA = 'previa123';

function coletarErros(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404 \(Not Found\)/.test(m.text())) erros.push('console: ' + m.text()); });
  return erros;
}
async function entrarComo(page, email, destino) {
  await page.goto(BASE + 'entrar.html');
  await page.evaluate(([e, s]) => window.VAGAS_API.entrar(e, s), [email, SENHA]);
  await page.goto(BASE + 'eu.html#' + destino);
}

test('guarda: sem sessão vai para entrar com ?voltar=; conta de empresa vê "Esta área é para quem procura emprego."', async ({ page }) => {
  await page.goto(BASE + 'eu.html#candidaturas');
  await page.waitForURL(/entrar\.html\?motivo=sessao&voltar=eu\.html%23candidaturas$/);
  await entrarComo(page, 'empresa@previa.com', 'dados');
  await expect(page.locator('h1')).toHaveText('Esta área é para quem procura emprego.');
  await expect(page.locator('#vg-trocar-conta')).toBeVisible();
  await expect(page.locator('#vg-nav')).toHaveCount(0);
});

test('conta suspensa: faixa "só leitura" e a mensagem no lugar do "Carregando…"', async ({ page }) => {
  await page.goto(BASE + 'entrar.html');
  await page.evaluate(async () => {
    await window.VAGAS_API.entrar('pessoa@previa.com', 'previa123');
    // O "banco" da prévia fica no armazenamento do navegador (a chave muda com a versão da semente).
    const chave = Object.keys(localStorage).find((k) => /^vagas_previa_v\d+$/.test(k));
    const s = JSON.parse(localStorage.getItem(chave));
    const u = s.usuarios.find((x) => x.email === 'pessoa@previa.com');
    s.contas[u.id].status = 'suspensa';
    localStorage.setItem(chave, JSON.stringify(s));
  });
  await page.goto(BASE + 'eu.html#candidaturas');
  await expect(page.locator('#vg-faixa-suspensa')).toContainText('Esta conta está suspensa.');
  await expect(page.locator('#vg-eu-suspensa h1')).toHaveText('Conta suspensa');
  await expect(page.locator('#vg-eu-suspensa')).toContainText('Sua conta está suspensa.');
  await expect(page.locator('.vg-estado .giro')).toHaveCount(0);
});

test('"Pular para o conteúdo" leva o foco ao conteúdo sem trocar de tela', async ({ page }) => {
  await entrarComo(page, 'pessoa@previa.com', 'candidaturas');
  await expect(page.locator('#vg-cand-titulo')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('a.pular')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toBeFocused();
  await expect(page).toHaveURL(/#candidaturas$/);
  await expect(page.locator('#vg-cand-titulo')).toBeVisible();
});

test('com o armazenamento do navegador bloqueado, a área abre (sessão na sessionStorage)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('bloqueado', 'SecurityError'); } });
  });
  await page.goto(BASE + 'entrar.html?voltar=' + encodeURIComponent('eu.html#dados') + '#entrar');
  await page.fill('#vg-entrar-email', 'pessoa@previa.com');
  await page.fill('#vg-entrar-senha', SENHA);
  await page.click('#vg-entrar-enviar');
  await page.waitForURL(/eu\.html#dados$/);
  await expect(page.locator('#vg-eu-titulo')).not.toHaveText('');
  await page.goto(BASE + 'eu.html#candidaturas');
  await expect(page.locator('#vg-cand-lista .vg-linha')).toHaveCount(3);
});

test('meus dados: nome, e-mail e cidades do dado; itens; baixar o arquivo JSON; entrar e sair do banco de talentos com o aceite', async ({ page }) => {
  const erros = coletarErros(page);
  await entrarComo(page, 'pessoa@previa.com', '');
  await expect(page).toHaveURL(/eu\.html#dados$/);
  const minha = await page.evaluate(async () => (await window.VAGAS_API.minhaPessoa()).pessoa);
  await expect(page.locator('#vg-eu-titulo')).toHaveText(minha.nome);
  await expect(page.locator('#vg-eu-subtitulo')).toHaveText('pessoa@previa.com · ' + minha.cidade.nome);
  await expect(page.locator('#vg-cidade')).toContainText(minha.cidade.nome);
  await expect(page.locator('#vg-eu-item-curriculo')).toContainText('5 passos completos');
  await expect(page.locator('#vg-eu-curriculo')).toHaveAttribute('href', '#curriculo/1');
  await expect(page.locator('#vg-eu-item-selos')).toContainText('Atendimento e recepção (80)');
  await expect(page.locator('#vg-eu-item-referencias')).toContainText('1 aparece para as empresas · 1 esperando você');
  await expect(page.locator('#vg-eu-item-quem-viu')).toContainText('1 empresa abriu');
  await expect(page.locator('#vg-nav-eu .vg-nav__n')).toHaveText('1');
  await expect(page.locator('#vg-meus-dados')).toContainText('Contas paradas por 24 meses são apagadas sozinhas.');

  const [arquivo] = await Promise.all([page.waitForEvent('download'), page.click('#vg-dados-baixar')]);
  expect(arquivo.suggestedFilename()).toBe('meus-dados-vagas.json');
  const dados = JSON.parse(fs.readFileSync(await arquivo.path(), 'utf8'));
  expect(dados.conta.email).toBe('pessoa@previa.com');
  expect(dados.ok).toBeUndefined();
  expect(Array.isArray(dados.referenciasRecebidas)).toBe(true);
  expect(Array.isArray(dados.candidaturas)).toBe(true);

  await expect(page.locator('#vg-eu-item-banco')).toContainText('Fora do banco');
  await page.click('#vg-eu-banco');
  await expect(page.locator('#vg-janela-banco')).toContainText('Autorizo que empresas da(s) minha(s) cidade(s) vejam o meu cartão sem nome e sem contato');
  await expect(page.locator('#vg-janela-banco')).toContainText('Candidatar-se a uma vaga não depende dessa autorização.');
  await page.click('#vg-banco-sim');
  await expect(page.locator('#vg-eu-item-banco')).toContainText(/Autorizado até \d{2}\/\d{2}\/\d{4}/);
  await expect(page.locator('#vg-eu-banco')).toHaveText('Sair do banco');
  await page.click('#vg-eu-banco');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Você saiu do banco de talentos.');
  await expect(page.locator('#vg-eu-item-banco')).toContainText('Fora do banco');
  expect(erros).toEqual([]);
});

test('excluir a conta: botão só libera com EXCLUIR; depois some tudo do aparelho e a conta não entra mais', async ({ page }) => {
  await entrarComo(page, 'pessoa@previa.com', 'curriculo/4');
  await page.fill('#vg-cv-pretensao', '2000');
  await expect(page.locator('#vg-cv-rascunho')).toContainText('Rascunho salvo');
  await page.goto(BASE + 'eu.html#dados');
  await page.click('#vg-dados-excluir');
  const janela = page.locator('#vg-confirmar-excluir');
  await expect(janela).toContainText('Excluir a conta de vez?');
  await expect(janela).toContainText('Para confirmar, digite EXCLUIR.');
  await expect(page.locator('#vg-confirmar-excluir-texto')).toBeFocused();
  await expect(page.locator('#vg-confirmar-excluir-sim')).toBeDisabled();
  await page.fill('#vg-confirmar-excluir-texto', 'EXCLUI');
  await expect(page.locator('#vg-confirmar-excluir-sim')).toBeDisabled();
  await page.click('#vg-confirmar-excluir-cancelar');
  await expect(janela).toHaveCount(0);
  await page.click('#vg-dados-excluir');
  await page.fill('#vg-confirmar-excluir-texto', 'EXCLUIR');
  await expect(page.locator('#vg-confirmar-excluir-sim')).toBeEnabled();
  await page.click('#vg-confirmar-excluir-sim');
  await expect(page.locator('#vg-conta-excluida-titulo')).toHaveText('Conta excluída.');
  await expect(page.locator('#vg-conta-excluida')).toContainText('Obrigado por usar o Vagas sem Caos.');
  await expect(page.locator('#vg-nav')).toHaveCount(0);
  const depois = await page.evaluate(async () => ({
    rascunho: localStorage.getItem('vg.rascunho.curriculo'),
    entrar: await window.VAGAS_API.entrar('pessoa@previa.com', 'previa123').then(() => 'entrou', (e) => e.message)
  }));
  expect(depois).toEqual({ rascunho: null, entrar: 'E-mail ou senha não conferem.' });
});

test('sair da conta: limpa o que é desta pessoa no aparelho e vai para o início', async ({ page }) => {
  await entrarComo(page, 'pessoa@previa.com', 'curriculo/4');
  await page.fill('#vg-cv-pretensao', '2000');
  await expect(page.locator('#vg-cv-rascunho')).toContainText('Rascunho salvo');
  await page.goto(BASE + 'eu.html#dados');
  await page.click('#vg-sair');
  await page.waitForURL(/index\.html$/);
  expect(await page.evaluate(() => [localStorage.getItem('vg.rascunho.curriculo'), localStorage.getItem('vg.cache.candidaturas')])).toEqual([null, null]);
});

test('referências: pendente primeiro com "Ler e decidir"; aceita "Visível"; ocultar e mostrar sem avisar a empresa; página pública "em breve"', async ({ page }) => {
  const erros = coletarErros(page);
  await entrarComo(page, 'pessoa@previa.com', 'referencias');
  await expect(page.locator('#vg-ref-lista-titulo')).toHaveText('Referências');
  await expect(page.locator('.vg-eu-cabecalho .subtitulo')).toContainText('Sem estrelas, sem nota, sem média.');
  const cartas = page.locator('#vg-ref-lista .vg-ref');
  await expect(cartas).toHaveCount(2);
  await expect(cartas.nth(0).locator('.vg-status')).toHaveText('Pendente');
  await expect(cartas.nth(0).locator('[data-acao="ler"]')).toHaveText('Ler e decidir');
  await expect(cartas.nth(1).locator('.vg-status')).toHaveText('Visível');
  await expect(page.locator('#vg-ref-lista')).not.toContainText(/★|estrela|média|nota \d/i);
  await expect(page.locator('#vg-ref-aviso-combinou')).toHaveText('Antes do Combinou, a empresa vê só "Referência de empresa verificada: sim". Nem o nome da empresa, nem os pontos fortes, nem o texto.');
  await expect(page.locator('#vg-ref-publicar')).toBeDisabled();
  await expect(page.locator('#vg-ref-publicar-campo')).toContainText('em breve');
  await cartas.nth(1).locator('[data-acao="ocultar"]').click();
  await expect(page.locator('#vg-aviso-geral')).toContainText('a empresa que deixou a referência não fica sabendo');
  await expect(page.locator('#vg-ref-lista .vg-ref').nth(1).locator('.vg-status')).toHaveText('Oculta');
  await page.locator('#vg-ref-lista .vg-ref').nth(1).locator('[data-acao="mostrar"]').click();
  await expect(page.locator('#vg-ref-lista .vg-ref').nth(1).locator('.vg-status')).toHaveText('Visível');
  await page.locator('#vg-ref-lista .vg-ref').nth(1).locator('[data-acao="remover"]').click();
  await expect(page.locator('#vg-confirmar-remover-ref')).toContainText('a empresa não é avisada');
  await page.click('#vg-confirmar-remover-ref-sim');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Referência excluída.');
  await expect(page.locator('#vg-ref-lista .vg-ref')).toHaveCount(1);
  // A empresa autora vê só "enviada" (veto P2): nada do que a pessoa fez aparece para ela.
  const visaoEmpresa = await page.evaluate(async () => {
    await window.VAGAS_API.entrar('empresa6@previa.com', 'previa123');
    const eu = await window.VAGAS_API.eu();
    const r = await window.VAGAS_API.referenciasDaEmpresa(eu.empresas[0].id);
    return r.referencias.map((x) => x.status);
  });
  expect(visaoEmpresa).toEqual(['enviada']);
  expect(erros).toEqual([]);
});

test('ler e decidir: o texto do aceite com o nome da empresa; denunciar; aceitar baixa o contador do menu', async ({ page }) => {
  await entrarComo(page, 'pessoa@previa.com', 'referencias');
  await page.locator('[data-acao="ler"]').click();
  await expect(page).toHaveURL(/#referencia\/[0-9a-f-]{36}$/);
  const nome = await page.evaluate(async () => (await window.VAGAS_API.minhasReferencias()).referencias.find((r) => r.status === 'pendente').empresa.nome);
  await expect(page.locator('#vg-ref-receber-titulo')).toHaveText(nome + ' deu uma referência para você');
  await expect(page.locator('#vg-ref-carta')).toHaveClass(/vg-ref--pendente/);
  await expect(page.locator('#vg-ref-aceite')).toContainText('Aceito que a referência profissional de ' + nome + ' apareça');
  await expect(page.locator('#vg-ref-aceite')).not.toContainText('[REVISÃO');
  await expect(page.locator('#vg-ref-denunciar-linha')).toContainText('A empresa não vê se você recusou.');
  await page.click('#vg-ref-denunciar');
  await expect(page.locator('#vg-janela-denuncia')).toBeVisible();
  await page.click('#vg-denuncia-cancelar');
  await expect(page.locator('#vg-nav-eu .vg-nav__n')).toHaveText('1');
  await page.click('#vg-ref-aceitar');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Referência publicada.');
  await expect(page).toHaveURL(/#referencias$/);
  await expect(page.locator('#vg-ref-lista .vg-status')).toHaveText(['Visível', 'Visível']);
  await expect(page.locator('#vg-nav-eu .vg-nav__n')).toHaveCount(0);
});

test('recusar a referência: confirmação; vira "Você recusou" e a empresa não fica sabendo', async ({ page }) => {
  await entrarComo(page, 'pessoa@previa.com', 'referencias');
  await page.locator('[data-acao="ler"]').click();
  await page.click('#vg-ref-recusar');
  await expect(page.locator('#vg-confirmar-recusar-ref')).toContainText('a empresa que deixou a referência não fica sabendo');
  await page.click('#vg-confirmar-recusar-ref-sim');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Referência recusada.');
  await expect(page.locator('#vg-ref-lista .vg-status').first()).toHaveText('Você recusou');
});

test('pedir referência: erros nos campos, convite com link completo desta página, copiar, WhatsApp e "Pedidos enviados"', async ({ page }) => {
  const erros = coletarErros(page);
  await entrarComo(page, 'pessoa@previa.com', 'referencias');
  await page.click('#vg-ref-novo-pedido');
  await expect(page).toHaveURL(/#referencia\/pedir$/);
  await expect(page.locator('#vg-ref-pedir-titulo')).toHaveText('Pedir referência');
  await expect(page.locator('#vg-ref-pedir-aceite')).toContainText('Quero pedir uma referência profissional a esta empresa.');
  await page.click('#vg-ref-pedir-enviar');
  await expect(page.locator('#vg-ref-pedir-empresa-erro')).toHaveText('Informe o nome da empresa.');
  await expect(page.locator('#vg-ref-pedir-empresa')).toBeFocused();
  await page.fill('#vg-ref-pedir-cnpj', '11.111.111/1111-11');
  await page.click('#vg-ref-pedir-enviar');
  await expect(page.locator('#vg-ref-pedir-cnpj-erro')).toHaveText('CNPJ inválido. Confira os números.');
  await page.fill('#vg-ref-pedir-cnpj', '');
  await page.fill('#vg-ref-pedir-empresa', 'Padaria do Bairro');
  await expect(page.locator('#vg-ref-pedir-aceite')).toContainText('Quero pedir uma referência profissional a Padaria do Bairro.');
  await page.click('#vg-ref-pedir-enviar');
  await expect(page.locator('#vg-ref-convite')).toContainText('Convite criado. Vale 30 dias; você vê aqui quando a empresa responder.');
  const link = await page.locator('#vg-ref-convite-link').inputValue();
  expect(link).toMatch(/^http:\/\/localhost:\d+\/vagas\/referencia\.html\?t=[0-9a-f]{64}$/);
  await expect(page.locator('#vg-ref-pedir-whatsapp')).toHaveAttribute('href', 'https://wa.me/?text=' + encodeURIComponent('Oi! Estou no Vagas sem Caos e queria pedir uma referência profissional da empresa Padaria do Bairro. Leva 2 minutos: ' + link));
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('#vg-ref-convite-copiar');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Copiado');
  await page.goto(BASE + 'eu.html#referencias');
  await expect(page.locator('#vg-ref-convites')).toContainText('Padaria do Bairro');
  await expect(page.locator('#vg-ref-convites')).toContainText('esperando a empresa');
  await expect(page.locator('#vg-ref-convites [data-acao="copiar"]')).toBeVisible();
  expect(erros).toEqual([]);
});

test('todas as telas a 390 px: sem rolagem lateral, um h1, título com "| Vagas sem Caos", nenhuma palavra proibida e nada de DISC', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await entrarComo(page, 'pessoa@previa.com', 'dados');
  const ids = await page.evaluate(async () => {
    const c = (await window.VAGAS_API.minhasCandidaturas()).candidaturas;
    const r = (await window.VAGAS_API.minhasReferencias()).referencias;
    return { convite: c.find((k) => k.status === 'conversar').id, conversa: c.find((k) => k.status === 'combinou').id, ref: r.find((x) => x.status === 'pendente').id };
  });
  const rotas = ['dados', 'candidaturas', 'curriculo/1', 'curriculo/2', 'curriculo/3', 'curriculo/4', 'curriculo/5', 'conversa/' + ids.convite,
    'conversa/' + ids.conversa, 'quem-viu', 'referencias', 'referencia/pedir', 'referencia/' + ids.ref];
  for (const r of rotas) {
    await page.goto(BASE + 'eu.html#' + r);
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h1')).not.toHaveText('');
    await page.waitForLoadState('networkidle');
    const m = await page.evaluate(() => ({ larg: document.documentElement.scrollWidth, vis: document.documentElement.clientWidth, texto: document.body.innerText, titulo: document.title }));
    expect(m.larg, r + ': rolagem lateral').toBeLessThanOrEqual(m.vis);
    expect(m.titulo, r).toMatch(/ \| Vagas sem Caos$/);
    // Texto na tela: palavras proibidas e "DISC" (o nome da cidade aqui vem do dado, como deve ser).
    const achadas = PALAVRAS_PROIBIDAS.map((re) => (m.texto.match(re) || [])[0]).filter(Boolean);
    expect(achadas, r).toEqual([]);
    expect(m.texto, r).not.toMatch(/\bDISC\b/);
    if (r.startsWith('curriculo/5') || r.startsWith('candidaturas')) expect(m.texto).not.toMatch(/Ana Clara Ribeiro/);
  }
});
