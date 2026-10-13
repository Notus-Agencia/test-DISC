'use strict';
// Painel do DISC — grupo "Vagas" (js/admin-vagas.js) na prévia (API simulada). Sem ?vagas=1 a prévia do painel fica exatamente
// como era (sem o grupo); com ?vagas=1: cidades e praças, operadores, moderação geral e números da praça, com dados fictícios do
// próprio módulo. Nenhum teste depende de nome ou endereço de cidade (tudo é lido da tela ou do dado).
const { test, expect } = require('@playwright/test');
const { coletarErros, configurar } = require('./util.js');

async function entrar(page, url) {
  await configurar(page, { API_URL: 'simulada' });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(url || '/admin.html');
  await page.fill('#campo-email', 'admin@previa.com');
  await page.fill('#campo-senha', 'previa123');
  await page.click('#btn-entrar');
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#contagem')).not.toHaveText('Carregando…');
}
const abrir = (page, aba) => page.locator('.aba[data-aba="' + aba + '"]').click();

test('sem ?vagas=1 a prévia do painel continua igual: nenhum item do grupo Vagas', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page);
  await expect(page.locator('.menu-grupo[data-grupo="vagas"]')).toBeHidden();
  await expect(page.locator('.aba[data-aba^="vg-"]:visible')).toHaveCount(0);
  await expect(page.locator('.menu-grupo__titulo:visible')).toHaveText(['Seleção', 'Empresas', 'Vendas', 'Configurações']);
  expect(erros).toEqual([]);
});

test('com ?vagas=1: grupo Vagas entre Empresas e Vendas; cidades e praças com situação do dado; nova cidade e mudança de situação com o efeito', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page, '/admin.html?vagas=1');
  await expect(page.locator('.menu-grupo__titulo:visible')).toHaveText(['Seleção', 'Empresas', 'Vagas', 'Vendas', 'Configurações']);
  await expect(page.locator('.menu-grupo[data-grupo="vagas"] .aba:visible .aba__texto')).toHaveText(['Cidades e praças', 'Operadores', 'Moderação geral', 'Números da praça']);
  await abrir(page, 'vg-cidades');
  await expect(page.locator('#vista-vg-cidades h2')).toHaveText('Cidades e praças');
  await expect(page.locator('#vista-vg-cidades h2')).toBeFocused();
  await expect(page.locator('.aba[data-aba="vg-cidades"]')).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/#vg-cidades$/);
  const cartoes = page.locator('#vg-adm-cidades > li');
  await expect(cartoes.first()).toBeVisible();
  const n = await cartoes.count();
  await expect(page.locator('#vg-adm-cidades > li[data-status="ativa"]').first()).toContainText('Vagas no ar');
  await expect(page.locator('#aba-n-vg-moderacao')).toHaveText(/^\d+$/);

  // Nova cidade: o endereço é sugerido a partir do nome + UF e ela nasce rascunho.
  await page.click('#vg-adm-nova-cidade');
  await page.fill('#vg-adm-cid-nome', 'Cidade de Teste');
  await page.fill('#vg-adm-cid-uf', 'go');
  await expect(page.locator('#vg-adm-cid-slug')).toHaveValue('cidade-de-teste-go');
  await page.fill('#vg-adm-cid-ibge', '123');
  await page.click('#janela-ok');
  await expect(page.locator('#janela-erro')).toHaveText('O código IBGE tem 7 números.');
  await page.fill('#vg-adm-cid-ibge', '');
  await page.click('#janela-ok');
  await expect(page.locator('#aviso-geral')).toContainText('Cidade criada como rascunho: Cidade de Teste.');
  await expect(cartoes).toHaveCount(n + 1);
  const nova = page.locator('#vg-adm-cidades > li[data-cidade="cidade-de-teste-go"]');
  await expect(nova).toHaveAttribute('data-status', 'rascunho');
  await nova.locator('[data-acao="lista"]').click();
  await expect(page.locator('#confirmar-desc')).toContainText('Abrir a lista de espera de Cidade de Teste');
  await page.click('#confirmar-ok');
  await expect(nova).toHaveAttribute('data-status', 'lista_espera');

  // Pausar mostra o efeito antes (esconde N vagas; nada é apagado) e Reativar volta.
  const ativa = page.locator('#vg-adm-cidades > li[data-status="ativa"]').first();
  const slug = await ativa.getAttribute('data-cidade');
  await ativa.locator('[data-acao="pausar"]').click();
  await expect(page.locator('#confirmar-desc')).toHaveText(/esconde \d+ vagas? e bloqueia cadastros novos; nada é apagado\.$/);
  await page.click('#confirmar-ok');
  const mesma = page.locator('#vg-adm-cidades > li[data-cidade="' + slug + '"]');
  await expect(mesma).toHaveAttribute('data-status', 'pausada');
  await mesma.locator('[data-acao="reativar"]').click();
  await page.click('#confirmar-ok');
  await expect(mesma).toHaveAttribute('data-status', 'ativa');
  // Lista de espera abaixo da meta: "Ativar (faltam N)" desligado.
  await expect(page.locator('#vg-adm-cidades > li[data-status="lista_espera"] [data-acao="ativar"]').first()).toBeDisabled();

  // Zonas da cidade.
  await mesma.locator('[data-acao="zonas"]').click();
  const zonas = await page.locator('#vg-adm-zonas > li').count();
  await page.fill('#vg-adm-zona-nome', 'Zona Teste');
  await page.fill('#vg-adm-zona-bairros', 'Um, Dois');
  await page.click('#janela-ok');
  await expect(page.locator('#aviso-geral')).toContainText('Zona criada');
  await expect(mesma.locator('[data-acao="zonas"]')).toHaveText('Zonas (' + (zonas + 1) + ')');
  expect(erros).toEqual([]);
});

test('operadores: lista com papel, contrato e repasse; convidar, editar o repasse e desligar', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page, '/admin.html?vagas=1');
  await abrir(page, 'vg-operadores');
  await expect(page.locator('#vista-vg-operadores h2')).toHaveText('Operadores');
  const linhas = page.locator('#vg-adm-operadores tbody tr');
  await expect(linhas.first()).toBeVisible();
  const n = await linhas.count();
  await page.click('#vg-adm-novo-operador');
  await expect(page.locator('#vg-adm-op-contrato')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await page.fill('#vg-adm-op-email', 'nao-e-email');
  await page.click('#janela-ok');
  await expect(page.locator('#janela-erro')).toHaveText('E-mail inválido.');
  await page.fill('#vg-adm-op-email', 'nova.operacao@exemplo.com');
  await page.click('#vg-adm-op-papel');
  await page.locator('#vg-adm-op-papel-lista [data-valor="moderador"]').click();
  await page.fill('#vg-adm-op-repasse', '20');
  await page.click('#janela-ok');
  await expect(page.locator('#aviso-geral')).toContainText('Convite enviado para nova.operacao@exemplo.com.');
  await expect(linhas).toHaveCount(n + 1);
  const linha = page.locator('#vg-adm-operadores tr[data-operador="nova.operacao@exemplo.com"]');
  await expect(linha).toContainText('Moderação');
  await expect(linha).toContainText('20%');
  await linha.locator('[data-acao="editar"]').click();
  await expect(page.locator('#vg-adm-op-email')).toHaveAttribute('readonly', '');
  await page.fill('#vg-adm-op-repasse', '0');
  await page.click('#janela-ok');
  await expect(linha).toContainText('0% (própria)');
  await linha.locator('[data-acao="desligar"]').click();
  await expect(page.locator('#confirmar-desc')).toContainText('perde o acesso');
  await page.click('#confirmar-ok');
  await expect(linha).toContainText('desligado');
  await expect(linha.locator('[data-acao="desligar"]')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('moderação geral: pendências no topo, registro com filtros e "Reverter" onde há volta (registra um ato novo)', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page, '/admin.html?vagas=1');
  await abrir(page, 'vg-moderacao');
  await expect(page.locator('#vista-vg-moderacao h2')).toHaveText('Moderação geral');
  await expect(page.locator('#vg-adm-pendencias .vg-adm-pendencia').first()).toContainText('esperando');
  const linhas = page.locator('#vg-adm-moderacao tbody tr');
  await expect(linhas.first()).toBeVisible();
  const n = await linhas.count();
  await expect(page.locator('#vg-adm-abrir-fila')).toHaveAttribute('href', /\/operador\.html#fila$/);
  await page.click('#vg-adm-mod-tipo');
  await page.locator('#vg-adm-mod-tipo-lista [data-valor="empresa"]').click();
  const empresas = await linhas.count();
  expect(empresas).toBeLessThan(n);
  for (let i = 0; i < empresas; i++) await expect(linhas.nth(i)).toContainText('Empresa');
  const reverter = page.locator('#vg-adm-moderacao tr[data-acao="empresa_suspender"] [data-acao="reverter"]');
  await reverter.click();
  await page.click('#confirmar-ok');
  await expect(page.locator('#aviso-geral')).toContainText('Revertido');
  await expect(linhas.first()).toHaveAttribute('data-acao', 'empresa_reativar');
  await page.fill('#vg-adm-mod-busca', 'xyz sem resultado');
  await expect(page.locator('#vg-adm-moderacao-vazio')).toContainText('Nada com esse filtro.');
  expect(erros).toEqual([]);
});

test('números da praça: 15 indicadores com alvo, etiqueta de cor e gatilhos; trocar a praça; o endereço #vg-numeros abre direto', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page, '/admin.html?vagas=1');
  await abrir(page, 'vg-numeros');
  await expect(page.locator('#vista-vg-numeros h2')).toHaveText('Números da praça');
  await expect(page.locator('#vg-adm-numeros [data-indicador]')).toHaveCount(15);
  await expect(page.locator('#vg-adm-numeros [data-indicador="vagas_ativas"] .vg-adm-numero__alvo')).toContainText('alvo ');
  const comCor = page.locator('#vg-adm-numeros [data-indicador][data-cor]:not([data-cor=""])');
  expect(await comCor.count()).toBeGreaterThan(0);
  await expect(comCor.first().locator('.selo')).toHaveText(/^(No alvo|Perto do alvo|Longe do alvo)$/);
  await expect(page.locator('#vg-adm-numeros [data-indicador="receita_liquida_centavos"]')).toContainText('Grátis no lançamento');
  await expect(page.locator('#vg-adm-selos tbody tr')).toHaveCount(5);
  await expect(page.locator('#vg-adm-gatilhos > ul > li')).toHaveCount(5);
  const sobre = page.locator('#vista-vg-numeros .sobretitulo');
  const antes = await sobre.innerText();
  await page.click('#vg-adm-num-cidade');
  const opcoes = page.locator('#vg-adm-num-cidade-lista [role="option"]');
  expect(await opcoes.count()).toBeGreaterThan(1);
  await opcoes.nth(1).click();
  await expect(sobre).not.toHaveText(antes);
  await page.reload();
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#vista-vg-numeros h2')).toHaveText('Números da praça');
  await expect(page.locator('#vg-adm-numeros [data-indicador]')).toHaveCount(15);
  expect(erros).toEqual([]);
});

test('sair limpa as telas do Vagas (o próximo login não vê nada do anterior)', async ({ page }) => {
  await entrar(page, '/admin.html?vagas=1');
  await abrir(page, 'vg-cidades');
  await expect(page.locator('#vg-adm-cidades > li').first()).toBeVisible();
  await page.click('#btn-usuario');
  await page.click('#btn-sair');
  await expect(page.locator('#form-login')).toBeVisible();
  await expect(page.locator('#vista-vg-cidades')).toBeHidden();
  expect(await page.locator('#vista-vg-cidades').evaluate((n) => n.childElementCount)).toBe(0);
});
