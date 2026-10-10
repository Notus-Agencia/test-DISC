'use strict';
// "Como liderar" avançado (modelo 'lideranca', versão 2) na página pública relatorio.html: capa, índice, quem é, guia rápido,
// 10 capítulos (feedback, delegação, motivação, retenção, desgaste, mudanças, conflito, 1:1, 90 dias, você e esta pessoa),
// limites e fundamentos. Celular 375 px e computador sem rolagem lateral, PDF A4 com capítulo em página nova, e o relatório
// antigo (versão 1, já publicado no banco) continua desenhado como antes. Servidor sempre simulado (page.route).
const { test, expect } = require('@playwright/test');
const { API_FALSA, coletarErros, configurar, simularApi } = require('./util');
const MODELOS = require('../../js/relatorio-modelos.js');
const AVANCADO = require('../../js/lideranca-avancado.js');

const TOKEN = 'tokenLiderar_' + 'z'.repeat(30);
const GERADO = '2026-10-10T12:00:00.000Z';
const ENTRADA = {
  pessoa: { nome: 'Marina Costa', cargo: 'Gerente comercial', telefone: '5595991112222', resultado: { percentuais: { D: 36, I: 31, S: 15, C: 18 }, codigo: 'DI' } },
  lider: { nome: 'Paulo Mendes Souza', resultado: { percentuais: { D: 14, I: 20, S: 38, C: 28 }, codigo: 'SC' } },
  empresa: { nome: 'Loja Exemplo' }, consultor: 'Consultor Exemplo'
};
const V2 = MODELOS.lideranca(JSON.parse(JSON.stringify(ENTRADA)), { geradoEm: GERADO, avancado: AVANCADO });
const V1 = MODELOS.lideranca(JSON.parse(JSON.stringify(ENTRADA)), { geradoEm: GERADO });
const CAPITULOS = ['feedback', 'delegacao', 'motivacao', 'retencao', 'desgaste', 'mudanca', 'conflito', 'um_a_um', 'plano90', 'voce'];
const SECOES = ['capa', 'indice', 'resumo', 'liderar', ...CAPITULOS, 'encerramento', 'rodape'];

async function abrir(page, dados) {
  await configurar(page, { API_URL: API_FALSA });
  const chamadas = await simularApi(page, (corpo) => {
    if (corpo.acao === 'relatorioPublico' && corpo.token === TOKEN) return { ok: true, modelo: 'lideranca', relatorio: dados };
    return { ok: false, erro: 'Relatório não encontrado.' };
  });
  await page.goto('/relatorio.html?r=' + TOKEN);
  await expect(page.locator('#relatorio')).toHaveAttribute('data-estado', 'pronto');
  return chamadas;
}

async function semRolagemLateral(page) {
  const [largura, janela] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(largura).toBeLessThanOrEqual(janela);
}

test.describe('Como liderar avançado', () => {
  test('snapshot de teste é a versão 2 com os 10 capítulos', () => {
    expect(V2.versao).toBe(2);
    expect(V2.avancado.capitulos.map((c) => c.id)).toEqual(CAPITULOS);
    expect(V1.versao).toBe(1);
  });

  for (const [nome, viewport] of [['celular 375', { width: 375, height: 812 }], ['computador', { width: 1280, height: 900 }]]) {
    test('abre com capa, índice, guia rápido e os 10 capítulos, sem rolagem lateral (' + nome + ')', async ({ page }) => {
      const erros = coletarErros(page);
      await page.setViewportSize(viewport);
      const chamadas = await abrir(page, V2);
      await expect(page.locator('#relatorio')).toHaveAttribute('data-modelo', 'lideranca');
      const doc = page.locator('.doc[data-modelo="lideranca"][data-versao="avancado"]');
      await expect(doc).toHaveCount(1);
      for (const id of SECOES) await expect(page.locator('[data-secao="' + id + '"]')).toHaveCount(1);
      await expect(page.locator('.capa__titulo')).toContainText('Como liderar Marina C.');
      await expect(page.locator('.capa img.marca-doc__logo')).toHaveAttribute('alt', 'Gestão sem Caos');
      await expect(page.locator('#indice .indice__lista li')).toHaveCount(SECOES.length - 3);   // sem capa, índice e rodapé
      await expect(page.locator('[data-secao="resumo"]')).toContainText('Retrato para quem lidera');
      // Feedback: regra, o que funciona × o que dá errado, frases prontas
      const fb = page.locator('[data-secao="feedback"]');
      await expect(fb.locator('.obs__tit').first()).toHaveText('Antes de qualquer feedback');
      expect(await fb.locator('.frase-doc').count()).toBeGreaterThanOrEqual(5);
      await expect(fb.locator('.rotulo-doc', { hasText: 'O que dá errado' })).toHaveCount(1);
      // Desgaste: sinais observáveis e o que fazer quando o sinal é forte (sem rótulos)
      const dg = page.locator('[data-secao="desgaste"]');
      await expect(dg.locator('.obs--alerta')).toContainText('Quando o sinal é forte');
      await expect(dg.locator('.obs--alerta')).toContainText('CVV');
      await expect(dg).not.toContainText(/burnout|ansiedade|depress|diagn[oó]stic/i);
      // 30/60/90 em três colunas de cartões; 1:1 com pauta numerada
      await expect(page.locator('[data-secao="plano90"] .etapas90 .cartao-doc')).toHaveCount(3);
      expect(await page.locator('[data-secao="um_a_um"] .passos-doc li').count()).toBeGreaterThanOrEqual(5);
      // Você e esta pessoa: só o estilo de quem lidera (S), marcado, e as diferenças de 20+ pontos
      const voce = page.locator('[data-secao="voce"]');
      await expect(voce.locator('.estilo-doc')).toHaveCount(1);
      await expect(voce.locator('.estilo-doc--atual')).toHaveAttribute('data-letra', 'S');
      await expect(voce).toContainText('Seu estilo: SC');
      await expect(voce.locator('.rotulo-doc', { hasText: 'Onde vocês mais diferem' })).toHaveCount(1);
      // Base discreta em cada capítulo e Fundamentos no fim
      await expect(page.locator('.base-doc')).toHaveCount(CAPITULOS.length);
      expect(await page.locator('.fundamentos-doc li').count()).toBeGreaterThanOrEqual(12);
      await expect(page.locator('#btn-salvar-pdf')).toBeVisible();
      expect(chamadas.map((c) => c.corpo.acao)).toEqual(['relatorioPublico']);
      await page.evaluate(() => document.fonts.ready);
      await semRolagemLateral(page);
      const texto = await page.locator('body').innerText();
      for (const proibido of ['Notus', 'Souza', 'Costa', '5595991112222', '@', 'WhatsApp', '{nome}', 'undefined']) expect(texto).not.toContain(proibido);
      expect(texto).not.toMatch(/\b(ele|ela|dele|dela)\b/i);
      expect(erros).toEqual([]);
    });
  }

  test('PDF A4: cada capítulo começa em página nova e nada passa da largura', async ({ page }) => {
    await page.setViewportSize({ width: 794, height: 1123 });
    await abrir(page, V2);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await semRolagemLateral(page);
    await expect(page.locator('#btn-salvar-pdf')).toBeHidden();
    for (const id of CAPITULOS) {
      const quebra = await page.locator('section[data-secao="' + id + '"]').evaluate((e) => getComputedStyle(e).breakBefore);
      expect(quebra, id).toBe('page');
    }
    // frases, estilos e cartões não se partem no meio
    expect(await page.locator('.frase-doc').first().evaluate((e) => getComputedStyle(e).breakInside)).toBe('avoid');
    expect(await page.locator('.estilo-doc').first().evaluate((e) => getComputedStyle(e).breakInside)).toBe('avoid');
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
    expect(paginas).toBeGreaterThanOrEqual(2 + 2 + CAPITULOS.length + 1);   // capa, índice, quem é, guia, capítulos, limites
  });

  test('relatório antigo (versão 1, já publicado) continua com o guia de antes', async ({ page }) => {
    const erros = coletarErros(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await abrir(page, V1);
    await expect(page.locator('.doc[data-modelo="lideranca"]')).toHaveCount(1);
    await expect(page.locator('.doc[data-versao="avancado"]')).toHaveCount(0);
    for (const id of ['capa', 'resumo', 'liderar', 'encerramento', 'rodape']) await expect(page.locator('[data-secao="' + id + '"]')).toHaveCount(1);
    await expect(page.locator('[data-secao="feedback"]')).toHaveCount(0);
    await expect(page.locator('[data-secao="liderar"]')).toContainText('Como dar feedback');
    await semRolagemLateral(page);
    expect(erros).toEqual([]);
  });

  test('índice leva ao capítulo', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await abrir(page, V2);
    await page.locator('#indice a[href="#desgaste"]').click();
    await expect(page.locator('section#desgaste')).toBeInViewport();
  });
});
