'use strict';
// Pesquisa de clima com identificação na prévia (API simulada): avisos dos 3 modos e a etapa de confirmação no celular
// (390 px); no painel (computador), escolha do modo com o alerta, links pessoais (Copiar / WhatsApp com o número),
// tela "uso interno da consultoria" com o registro do acesso e os dados de confirmação no "Editar colaborador".
// CLIMA_ID_CAPTURAS=<pasta> salva prints para a revisão do dono (clima-id-*.png).
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { coletarErros } = require('./util');

const CAPTURAS = process.env.CLIMA_ID_CAPTURAS || '';
const CONFIG_PREVIA = 'window.CONFIG = ' + JSON.stringify({ API_URL: 'simulada', BACKEND: 'simulada', WHATSAPP_RECRUTADOR: '', EMPRESA: '',
  MOSTRAR_RESULTADO_AO_CANDIDATO: false, GRUPOS_DEMONSTRACAO: 0 }) + ';';

async function capturar(page, nome, opcoes) {
  if (!CAPTURAS) return;
  await page.screenshot(Object.assign({ path: path.join(CAPTURAS, 'clima-id-' + nome + '.png') }, opcoes || {}));
}
async function previa(context) {
  await context.route('**/js/config.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: CONFIG_PREVIA }));
}
async function entrar(page) {
  await expect(page.locator('#form-login')).toBeVisible();
  await page.fill('#campo-email', 'admin@previa.com');
  await page.fill('#campo-senha', 'previa123');
  await page.click('#btn-entrar');
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
}
async function semRolagemLateral(page) {
  const [largura, janela] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(largura).toBeLessThanOrEqual(janela);
}
// Cria uma pesquisa aberta no modo pedido (apaga a aberta que houver), com e-mail para Lucas e CPF/data para Renata.
// Devolve os links pessoais por primeiro nome, o coletivo e o do líder da equipe de Diego.
async function criarRodadaApi(page, modo, metodos) {
  return page.evaluate(async (op) => {
    const s = await DISC_API.login('admin@previa.com', 'previa123');
    const eq = await DISC_API.listarEquipe(s.token, 'emp_previa_clinica');
    const id = (n) => eq.colaboradores.find((c) => c.nome.startsWith(n)).pessoaId;
    const lista = await DISC_API.climaListar(s.token, 'emp_previa_clinica');
    for (const r of lista.rodadas.filter((x) => x.status === 'aberta')) await DISC_API.climaExcluirRodada(s.token, r.id);
    await DISC_API.climaSalvarColaborador(s.token, { empresaId: 'emp_previa_clinica', pessoaId: id('Lucas'), email: 'lucas.exemplo@clinica.com.br' });
    await DISC_API.climaSalvarColaborador(s.token, { empresaId: 'emp_previa_clinica', pessoaId: id('Renata'), cpf3: '045', nascimento: '15/08' });
    const r = await DISC_API.climaCriarRodada(s.token, { empresaId: 'emp_previa_clinica', modo: op.modo, metodos: op.metodos,
      equipes: [{ liderId: id('Marta') }, { liderId: id('Diego') }, { liderId: id('Paulo') }] });
    const pessoais = {};
    r.rodada.equipes.forEach((e) => e.convites.forEach((c) => { pessoais[c.nome.split(' ')[0]] = c.token; }));
    return { rodadaId: r.rodada.id, pessoais, coletivo: r.rodada.equipes[1].tokenEquipe, lider: r.rodada.equipes[1].tokenLider };
  }, { modo, metodos });
}
// Responde a primeira pergunta e avança até a etapa de identificação.
async function responderAteIdentificacao(page) {
  await page.check('#clima-aceite');
  await page.click('[data-acao="comecar"]');
  await expect(page.locator('.progresso-topo')).toContainText('Parte 1 de 9');
  await page.click('.clima-opcao[data-item="A1"][data-valor="4"]');
  for (let i = 0; i < 8; i++) await page.click('[data-acao="proximo"]');
  await expect(page.locator('[data-tela="identificacao"]')).toBeVisible();
  await expect(page.locator('.progresso-topo')).toContainText('Parte 9 de 9');
}

test.describe('Pesquisa de clima com identificação: celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('modo anônimo (aviso de sempre) e identificação opcional: escolha no fim, código por e-mail ou anonimato', async ({ page, context }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/admin.html');
    // Aviso do modo anônimo, para comparar.
    const an = await criarRodadaApi(page, 'anonima', []);
    await page.goto('/clima.html?t=' + an.coletivo);
    await expect(page.locator('.sobretitulo')).toHaveText('Anônima e voluntária · cerca de 5 minutos');
    await expect(page.locator('[data-quem-ve]')).toHaveCount(0);
    await expect(page.locator('.clima-aviso__lista')).toContainText('não guardamos nome, telefone, e-mail nem endereço de internet');
    await semRolagemLateral(page);
    await capturar(page, 'aviso-anonima', { fullPage: true });

    await page.goto('/admin.html');
    const t = await criarRodadaApi(page, 'opcional', ['email', 'dados']);
    await page.goto('/clima.html?t=' + t.pessoais.Lucas);
    await expect(page.locator('.sobretitulo')).toHaveText('Identificação opcional · cerca de 5 minutos');
    await expect(page.locator('[data-quem-ve]')).toContainText('o seu nome fica só com a consultoria (Gestão sem Caos). A empresa nunca vê o seu nome nem as suas respostas.');
    const aviso = page.locator('.clima-aviso__lista');
    await expect(aviso).toContainText('"Quero me identificar" e "Prefiro manter o anonimato"');
    await expect(aviso).toContainText('A empresa (dono, RH e liderança) nunca vê o seu nome nem as suas respostas.');
    await expect(aviso).toContainText('Um grupo só aparece no relatório com pelo menos 5 respostas.');
    await expect(aviso).not.toContainText('Não pedimos o seu nome');
    await expect(page.locator('body')).not.toContainText('Lucas');
    await semRolagemLateral(page);
    await capturar(page, 'aviso-opcional', { fullPage: true });
    await responderAteIdentificacao(page);
    await expect(page.locator('h1')).toHaveText('Você quer se identificar?');
    await expect(page.locator('#clima-confirmar')).toBeHidden();
    // Sem escolher: pede a escolha.
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('#clima-erro')).toHaveText('Escolha se quer se identificar ou manter o anonimato.');
    await page.click('[data-escolha="identificar"]');
    await expect(page.locator('[data-escolha="identificar"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#clima-confirmar')).toBeVisible();
    await expect(page.locator('#clima-confirmar')).toContainText('l***@c***.com.br');
    // Diz de onde veio o e-mail (a pessoa não digita: o código vai para o contato do cadastro).
    await expect(page.locator('#clima-codigo-destino')).toHaveText('Vamos enviar um código de 6 números para o e-mail que a empresa informou no seu cadastro: l***@c***.com.br. Não é mais o seu e-mail? Avise quem enviou este link para corrigir o cadastro.');
    await capturar(page, 'confirmacao-antes', { fullPage: true });
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('#clima-erro')).toHaveText('Peça o código e digite os 6 números que chegarem.');
    await page.click('[data-acao="pedir-codigo"]');
    const previaCodigo = page.locator('.clima-previa-codigo');
    await expect(previaCodigo).toContainText('Prévia: nenhum e-mail é enviado.');
    const codigo = await previaCodigo.getAttribute('data-codigo-previa');
    expect(codigo).toMatch(/^[0-9]{6}$/);
    // Código errado: mensagem única; certo: envia identificada.
    await page.fill('#clima-codigo', codigo === '000000' ? '111111' : '000000');
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('#clima-erro')).toHaveText('Código incorreto ou vencido. Confira os 6 dígitos ou peça um novo código.');
    await page.fill('#clima-codigo', codigo);
    await semRolagemLateral(page);
    await capturar(page, 'confirmacao-codigo', { fullPage: true });
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('h1')).toHaveText('Respostas enviadas. Obrigado!');
    await expect(page.locator('body')).toHaveAttribute('data-identificada', 'sim');
    await expect(page.locator('.subtitulo')).toContainText('só para a consultoria (Gestão sem Caos)');
    // O código não fica no aparelho.
    const guardado = await page.evaluate(() => JSON.stringify(Object.assign({}, sessionStorage)));
    expect(guardado).toBe('{}');
    // Outra pessoa, pelo link pessoal, prefere o anonimato: vai sem nome.
    await page.goto('/clima.html?t=' + t.pessoais.Carla);
    await responderAteIdentificacao(page);
    await page.click('[data-escolha="anonimo"]');
    await expect(page.locator('#clima-confirmar')).toBeHidden();
    await semRolagemLateral(page);
    await capturar(page, 'identificacao-escolha', { fullPage: true });
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('body')).toHaveAttribute('data-identificada', 'nao');
    await expect(page.locator('.subtitulo')).toHaveText('Sua resposta não fica ligada a você. A empresa só vê resultados de grupo, depois que a pesquisa terminar.');
    // O link coletivo do modo opcional continua anônimo, com o caminho para se identificar.
    await page.goto('/clima.html?t=' + t.coletivo);
    await expect(page.locator('.clima-aviso__lista')).toContainText('Use o link pessoal que você recebeu. Por este link, a resposta é anônima.');
    expect(erros).toEqual([]);
  });

  test('modo identificado: aviso, link coletivo recusado, confirmação por CPF e data, link de uso único', async ({ page, context, browser }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/admin.html');
    const t = await criarRodadaApi(page, 'identificada', ['email', 'dados']);
    await page.goto('/clima.html?t=' + t.coletivo);
    await expect(page.locator('h1')).toHaveText('Link inválido');
    await expect(page.locator('.subtitulo')).toHaveText('Esta pesquisa é identificada: responda pelo link pessoal que você recebeu.');
    await page.goto('/clima.html?t=' + t.pessoais.Renata);
    await expect(page.locator('.sobretitulo')).toHaveText('Pesquisa identificada · cerca de 5 minutos');
    await expect(page.locator('[data-quem-ve]')).toContainText('O seu nome fica só com a consultoria (Gestão sem Caos). A empresa nunca vê o seu nome nem as suas respostas');
    await expect(page.locator('.clima-aviso__lista')).toContainText('Se não quiser se identificar, você pode não responder.');
    await semRolagemLateral(page);
    await capturar(page, 'aviso-identificada', { fullPage: true });
    await responderAteIdentificacao(page);
    await expect(page.locator('h1')).toHaveText('Confirme que é você');
    await expect(page.locator('[data-escolha]')).toHaveCount(0);
    // Só CPF/data (Renata não tem e-mail): campos de 16 px no celular.
    await expect(page.locator('#clima-cpf3')).toBeVisible();
    const fonte = await page.locator('#clima-cpf3').evaluate((e) => getComputedStyle(e).fontSize);
    expect(fonte).toBe('16px');
    await page.fill('#clima-cpf3', '045');
    await page.fill('#clima-nascimento', '1608');
    await expect(page.locator('#clima-nascimento')).toHaveValue('16/08');
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('#clima-erro')).toHaveText('Os dados não conferem com o cadastro. Confira e tente de novo.');
    await page.fill('#clima-nascimento', '15/08');
    await semRolagemLateral(page);
    await capturar(page, 'confirmacao-dados', { fullPage: true });
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('h1')).toHaveText('Respostas enviadas. Obrigado!');
    await expect(page.locator('body')).toHaveAttribute('data-identificada', 'sim');
    // Uso único: em outro aparelho (outro navegador, sem a marca deste), o link pessoal já não abre. A prévia guarda os
    // dados no armazenamento do navegador: o outro aparelho recebe uma cópia dele.
    const estadoAtual = await context.storageState();
    const outroAparelho = await browser.newContext({ storageState: { cookies: [], origins: estadoAtual.origins.map((o) => ({
      origin: o.origin, localStorage: o.localStorage.filter((x) => x.name !== 'disc_clima_respondido') })) } });
    await previa(outroAparelho);
    const outro = await outroAparelho.newPage();
    await outro.goto('/clima.html?t=' + t.pessoais.Renata);
    await expect(outro.locator('h1')).toHaveText('Link já usado');
    await outroAparelho.close();
    // No mesmo aparelho: "Você já respondeu", sem "outra pessoa vai responder" (o link é pessoal).
    await page.reload();
    await expect(page.locator('h1')).toHaveText('Você já respondeu');
    await expect(page.locator('[data-acao="outra-pessoa"]')).toHaveCount(0);
    expect(erros).toEqual([]);
  });
});

test.describe('Pesquisa de clima com identificação: painel (computador)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('modo com alerta, links pessoais com WhatsApp do cadastro, uso interno com registro e dados do colaborador', async ({ page, context }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/admin.html#empresa/emp_previa_clinica/clima');
    await entrar(page);
    await expect(page.locator('.clima-rodada[data-status="encerrada"] .clima-selo-modo')).toHaveText('Anônima');
    // Cadastro de exemplo: e-mail para Lucas e Carla, CPF/data para Carla e Renata (as formas de confirmação dos links).
    await page.evaluate(async () => {
      const s = await DISC_API.login('admin@previa.com', 'previa123');
      const eq = await DISC_API.listarEquipe(s.token, 'emp_previa_clinica');
      const id = (n) => eq.colaboradores.find((c) => c.nome.startsWith(n)).pessoaId;
      await DISC_API.climaSalvarColaborador(s.token, { empresaId: 'emp_previa_clinica', pessoaId: id('Lucas'), email: 'lucas.exemplo@clinica.com.br' });
      await DISC_API.climaSalvarColaborador(s.token, { empresaId: 'emp_previa_clinica', pessoaId: id('Carla'), email: 'carla.exemplo@clinica.com.br', cpf3: '123', nascimento: '01/02' });
      await DISC_API.climaSalvarColaborador(s.token, { empresaId: 'emp_previa_clinica', pessoaId: id('Renata'), cpf3: '045', nascimento: '15/08' });
    });
    await page.click('#btn-clima-nova');
    const janela = page.locator('#janela-clima-nova');
    await expect(janela.locator('.clima-modo')).toHaveCount(3);
    await expect(page.locator('#clima-modo-anonima')).toBeChecked();
    await expect(janela.locator('.clima-modo[data-modo="anonima"]')).toContainText('(recomendado)');
    await expect(page.locator('#clima-alerta-modo')).toBeHidden();
    await page.check('#clima-modo-identificada');
    await expect(page.locator('#clima-alerta-modo')).toHaveText('Nos modos com identificação as respostas tendem a ser menos sinceras, principalmente sobre liderança. Recomende o modo anônimo.');
    await expect(page.locator('#clima-metodos')).toBeVisible();
    await expect(page.locator('#clima-metodo-email')).toBeChecked();
    await expect(page.locator('#clima-metodo-dados')).toBeChecked();
    await expect(page.locator('#clima-metodo-whatsapp')).toHaveCount(0);
    await expect(janela.locator('.clima-conv').first()).toBeDisabled();
    await page.locator('#clima-modos').scrollIntoViewIfNeeded();
    await capturar(page, 'painel-nova');
    await page.click('#janela-ok');
    await expect(janela).toHaveCount(0);
    const aberta = page.locator('.clima-rodada[data-status="aberta"]');
    await expect(aberta.locator('.clima-selo-modo')).toHaveText('Identificada');
    await expect(aberta.locator('[data-link="equipe"]')).toHaveCount(0);
    await expect(aberta.locator('[data-link="lider"]')).toHaveCount(3);
    const pessoais = aberta.locator('.clima-equipe', { hasText: 'Equipe de Diego' }).locator('.clima-pessoais');
    await pessoais.locator('summary').click();
    await expect(pessoais.locator('.clima-pessoal')).toHaveCount(2);
    const carla = pessoais.locator('.clima-pessoal', { hasText: 'Carla' });
    await expect(carla.locator('[data-link="pessoal"]')).toContainText('/clima.html?t=');
    const wa = await carla.locator('[data-acao="whatsapp-pessoal"]').getAttribute('href');
    expect(wa).toMatch(/^https:\/\/wa\.me\/55\d{10,11}\?text=/);
    expect(decodeURIComponent(wa)).toContain('só a Gestão sem Caos vê o seu nome');
    await expect(carla.locator('.clima-pessoal__metodos')).toHaveText('Confirma por: e-mail ou CPF e data');
    await expect(aberta.locator('.clima-avisos')).toContainText('sem forma de confirmação');
    if (await page.locator('#aviso-geral-fechar').isVisible()) await page.click('#aviso-geral-fechar');
    await capturar(page, 'painel-links', { fullPage: true });
    // Uso interno: aberta = só quem respondeu com identificação; o acesso fica registrado.
    await aberta.locator('[data-acao="clima-uso-interno"]').click();
    const interno = page.locator('#janela-clima-identificacao');
    await expect(interno).toBeVisible();
    await expect(interno.locator('#janela-titulo')).toHaveText('Uso interno da consultoria');
    await expect(interno.locator('[data-uso-interno]')).toContainText('Este acesso ficou registrado');
    await expect(interno.locator('.clima-acessos li')).toHaveCount(1);
    await capturar(page, 'painel-uso-interno');
    await page.click('#janela-ok');
    // Editar colaborador: e-mail e CPF/data (opcionais; viram código no servidor).
    await page.goto('/admin.html#empresa/emp_previa_clinica');
    const card = page.locator('#lista-colaboradores > li', { hasText: 'Tiago' });
    await card.locator('[data-acao="editar"]').click();
    const conf = page.locator('#colab-clima-conf');
    await expect(conf).toBeVisible();
    await expect(page.locator('#colab-conf-situacao')).toHaveText('Nenhum CPF/data cadastrado.');
    await page.fill('#colab-cpf3', '12');
    await page.fill('#colab-nascimento', '0101');
    await page.click('#janela-ok');
    await expect(page.locator('#janela-erro')).toHaveText('Informe os 3 últimos dígitos do CPF.');
    await page.fill('#colab-cpf3', '123');
    await expect(page.locator('#janela-erro')).toHaveText(''); // corrigiu o campo: a mensagem velha some
    await page.fill('#colab-email-clima', 'tiago@clinica.com.br');
    await capturar(page, 'painel-colaborador');
    await page.click('#janela-ok');
    await expect(page.locator('#janela-editar-colaborador')).toHaveCount(0);
    await card.locator('[data-acao="editar"]').click();
    await expect(page.locator('#colab-conf-situacao')).toContainText('CPF e data já cadastrados');
    await expect(page.locator('#colab-email-clima')).toHaveValue('tiago@clinica.com.br');
    const guardado = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
    expect(guardado).not.toContain('123:0101');
    await page.click('#janela-cancelar');
    expect(erros).toEqual([]);
  });
});
