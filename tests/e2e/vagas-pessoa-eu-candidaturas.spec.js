// Vagas sem Caos — área da pessoa: candidaturas, convite/Combinou, conversa e "quem viu meu contato" (eu.html), no celular (projeto
// vagas-celular), sobre a PRÉVIA com a pessoa@previa.com (uma vaga confidencial chamando para conversar, um Combinou, uma enviada).
const { test, expect } = require('@playwright/test');

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
const linhaCom = (page, status) => page.locator('#vg-cand-lista .vg-linha').filter({ has: page.locator('.vg-status[data-status="' + status + '"]') });

test('candidaturas: Andando/Fechadas, "Responder" em laranja, convite no menu; a enviada abre a folha e retira com confirmação', async ({ page }) => {
  const erros = coletarErros(page);
  await entrarComo(page, 'pessoa@previa.com', 'candidaturas');
  await expect(page.locator('#vg-cand-titulo')).toHaveText('Candidaturas');
  await expect(page.locator('#vg-cand-aba-andando')).toHaveText('Andando (3)');
  await expect(page.locator('#vg-cand-aba-andando')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vg-cand-aba-fechadas')).toHaveText('Fechadas (0)');
  await expect(page.locator('#vg-cand-lista .vg-status')).toHaveText(['Responder', 'Combinou', 'Enviada']);
  await expect(linhaCom(page, 'conversar')).toContainText('Empresa confidencial · chamou você para conversar');
  await expect(linhaCom(page, 'conversar').locator('.vg-status')).toHaveClass(/vg-status--conversar/);
  await expect(page.locator('#vg-nav-candidaturas')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#vg-nav-candidaturas .vg-nav__n')).toHaveText('1');
  await expect(page.locator('#vg-cand-nota')).toContainText('Enviada há mais de 7 dias sem resposta?');

  await linhaCom(page, 'enviada').click();
  await expect(page.locator('#vg-cand-folha')).toBeVisible();
  await expect(page.locator('#vg-cand-ver-vaga')).toHaveAttribute('href', /^vaga\.html\?vaga=[A-Z0-9]{6}$/);
  await page.click('#vg-cand-retirar');
  await expect(page.locator('#vg-confirmar-retirar')).toContainText('A empresa deixa de ver o seu cartão.');
  await page.click('#vg-confirmar-retirar-nao');
  expect(await page.evaluate(async () => (await window.VAGAS_API.minhasCandidaturas()).candidaturas.filter((k) => k.status === 'retirada').length)).toBe(0);
  await linhaCom(page, 'enviada').click();
  await page.click('#vg-cand-retirar');
  await page.click('#vg-confirmar-retirar-sim');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Candidatura retirada');
  await expect(page.locator('#vg-cand-aba-andando')).toHaveText('Andando (2)');
  await page.click('#vg-cand-aba-fechadas');
  await expect(page.locator('#vg-cand-lista .vg-status')).toHaveText(['Retirada']);
  await expect(page.locator('#vg-cand-lista')).toContainText('você retirou em');
  expect(erros).toEqual([]);
});

test('convite: o nome da empresa confidencial aparece ANTES de liberar; o aceite traz o texto exato; depois do Combinou, WhatsApp da empresa', async ({ page }) => {
  const erros = coletarErros(page);
  await entrarComo(page, 'pessoa@previa.com', 'candidaturas');
  await linhaCom(page, 'conversar').click();
  await expect(page).toHaveURL(/#conversa\/[0-9a-f-]{36}$/);
  await expect(page.locator('#vg-convite-titulo')).toHaveText('A empresa quer conversar com você');
  const nome = (await page.locator('#vg-convite-empresa-nome').textContent()).trim();
  expect(nome).not.toBe('Empresa confidencial');
  expect(nome.length).toBeGreaterThan(3);
  await expect(page.locator('#vg-convite-empresa')).toContainText('esta era a "empresa confidencial"');
  await expect(page.locator('#vg-convite-empresa')).toContainText('Empresa verificada');
  await expect(page.locator('#vg-conversa-nome')).toHaveText(nome);
  await expect(page.locator('#vg-mensagens .vg-msg').first()).toContainText('Gostamos do seu cartão');
  await expect(page.locator('#vg-convite-decidir')).toContainText(nome + ' vê o seu nome, o seu currículo completo e a sua foto, se você enviou;');
  await expect(page.locator('#vg-convite-decidir')).toContainText('o seu WhatsApp e o seu e-mail ficam liberados para ela, e os dela para você;');
  await expect(page.locator('#vg-convite-decidir')).toContainText('Nenhuma das duas respostas aparece para outras empresas.');
  await expect(page.locator('#vg-nav')).toHaveCount(0);
  await expect(page.locator('#vg-aviso-golpe')).toContainText('Nunca pague para se candidatar.');
  await expect(page.locator('#vg-conversa-whatsapp')).toHaveCount(0);
  // Antes do Combinou, dá para responder por mensagem sem liberar o contato.
  await expect(page.locator('#vg-form-mensagem')).toBeVisible();

  await page.click('#vg-convite-aceitar');
  const janela = page.locator('#vg-confirmar-combinou');
  await expect(janela).toContainText('Quero conversar com ' + nome + '. Libero meu nome, meu WhatsApp, meu e-mail, meu currículo completo e a minha foto (se eu enviei) só para esta empresa, só para esta vaga.');
  await expect(janela).toContainText('Documento, só na contratação, depois de conhecer a empresa.');
  await expect(janela).not.toContainText('[REVISÃO');
  await page.click('#vg-confirmar-combinou-nao');
  await expect(page.locator('#vg-convite')).toBeVisible();
  await page.click('#vg-convite-aceitar');
  await page.click('#vg-confirmar-combinou-sim');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Combinou! ' + nome + ' quer conversar com você.');
  await expect(page.locator('#vg-conversa-whatsapp')).toHaveAttribute('href', /^https:\/\/wa\.me\/\d{12,13}\?text=Ol%C3%A1!%20Combinamos/);
  await expect(page.locator('#vg-convite')).toHaveCount(0);
  await expect(page.locator('#vg-conversa-vaga .vg-status, .vg-conversa__vaga .vg-status')).toHaveText('Combinou');
  await expect(page.locator('#vg-nav')).toBeVisible();
  expect(erros).toEqual([]);
});

test('recusar o convite: confirmação na página; vira "Você recusou" e a conversa fecha', async ({ page }) => {
  await entrarComo(page, 'pessoa@previa.com', 'candidaturas');
  await linhaCom(page, 'conversar').click();
  const nome = (await page.locator('#vg-convite-empresa-nome').textContent()).trim();
  await page.click('#vg-convite-recusar');
  await expect(page.locator('#vg-confirmar-recusar')).toContainText('Recusar o convite da empresa ' + nome + '?');
  await page.click('#vg-confirmar-recusar-sim');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Tudo bem. A empresa não vê o seu nome nem o seu contato.');
  await expect(page.locator('#vg-conversa-faixa')).toBeVisible();
  await expect(page.locator('#vg-form-mensagem')).toBeHidden();
  await page.goto(BASE + 'eu.html#candidaturas');
  await page.click('#vg-cand-aba-fechadas');
  await expect(page.locator('#vg-cand-lista .vg-status')).toHaveText(['Você recusou']);
  await expect(page.locator('#vg-nav-candidaturas .vg-nav__n')).toHaveCount(0);
});

test('conversa depois do Combinou: mensagem enviada aparece; mensagem com telefone é bloqueada e fica no campo', async ({ page }) => {
  await entrarComo(page, 'pessoa@previa.com', 'candidaturas');
  await linhaCom(page, 'combinou').click();
  await expect(page.locator('#vg-conversa-whatsapp')).toBeVisible();
  await expect(page.locator('#vg-mensagens .vg-msg--sistema')).toContainText(['Combinou!']);
  await page.fill('#vg-mensagem-texto', 'Posso passar amanhã às 9h?');
  await page.click('#vg-mensagem-enviar');
  await expect(page.locator('#vg-mensagens .vg-msg--minha').last()).toContainText('Posso passar amanhã às 9h?');
  await page.fill('#vg-mensagem-texto', 'Me liga no 62 99123-4567');
  await page.click('#vg-mensagem-enviar');
  await expect(page.locator('#vg-mensagem-texto-erro')).toContainText('Mensagem bloqueada: telefone, e-mail e redes sociais só depois do Combinou');
  await expect(page.locator('#vg-mensagem-texto')).toHaveValue('Me liga no 62 99123-4567');
  await page.click('#vg-conversa .botao--icone');   // voltar
  await expect(page).toHaveURL(/#candidaturas$/);
});

test('quem viu meu contato: quem abriu e quando; cortar o acesso (com confirmação) fecha a conversa; voltar a compartilhar', async ({ page }) => {
  const erros = coletarErros(page);
  await entrarComo(page, 'pessoa@previa.com', 'quem-viu');
  await expect(page.locator('#vg-quem-viu-titulo')).toHaveText('Quem viu meu contato');
  const item = page.locator('#vg-quem-viu-lista .vg-item').first();
  await expect(item).toContainText(/abriu em \d{2}\/\d{2} às \d{2}:\d{2}/);
  await expect(page.locator('#vg-quem-viu-aviso')).toContainText('Fora as empresas desta lista, nenhuma empresa nem o operador da praça vê o seu contato.');
  await item.locator('[data-acao="cortar"]').click();
  await expect(page.locator('#vg-confirmar-cortar')).toContainText('deixa de ver o seu WhatsApp e a sua foto');
  await page.click('#vg-confirmar-cortar-sim');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Você encerrou. A empresa não vê mais o seu contato');
  await expect(page.locator('#vg-quem-viu-lista .vg-item').first()).toContainText('você parou de compartilhar em');
  const id = await page.locator('#vg-quem-viu-lista .vg-item').first().getAttribute('data-candidatura');
  await page.goto(BASE + 'eu.html#conversa/' + id);
  await expect(page.locator('#vg-conversa-faixa')).toContainText('Você encerrou.');
  await expect(page.locator('#vg-form-mensagem')).toBeHidden();
  await expect(page.locator('#vg-conversa-whatsapp')).toHaveCount(0);
  await page.goto(BASE + 'eu.html#quem-viu');
  await page.locator('#vg-quem-viu-lista [data-acao="voltar"]').click();
  await expect(page.locator('#vg-aviso-geral')).toContainText('Contato liberado de novo');
  await expect(page.locator('#vg-quem-viu-lista [data-acao="cortar"]')).toHaveCount(1);
  expect(erros).toEqual([]);
});
