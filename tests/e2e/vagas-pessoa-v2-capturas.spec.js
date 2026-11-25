// Capturas das telas principais da pessoa (390x844 e 1280x800, claro e escuro) para olhar a olho nu.
// Só roda com CAPTURAS_DIR=<pasta> (fora disso fica pulado e não escreve nada).
const { test } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const DIR = process.env.CAPTURAS_DIR;
test.skip(!DIR, 'defina CAPTURAS_DIR para gerar as capturas');

const TELAS = [
  ['inicio', '#/'], ['resultados', '#/vagas?q=caixa'], ['vaga', '#/vaga/v01'], ['salvas', '#/salvas'], ['entrar', '#/entrar'], ['como-funciona', '#/como-funciona'],
  ['candidaturas', '#/candidaturas'], ['candidatura', '#/candidatura/c01'], ['perfil', '#/eu'], ['curriculo', '#/curriculo'], ['alertas', '#/alertas']
];
const TAMANHOS = { celular: { width: 390, height: 844 }, pc: { width: 1280, height: 800 } };

for (const tema of ['light', 'dark']) {
  for (const [tam, vp] of Object.entries(TAMANHOS)) {
    test('capturas ' + tam + ' ' + tema, async ({ page }) => {
      fs.mkdirSync(DIR, { recursive: true });
      await page.setViewportSize(vp);
      await page.addInitScript((t) => { try { localStorage.setItem('vsc.prefs', JSON.stringify({ tema: t, fx: 'off' })); } catch (e) { /* sem armazenamento */ } }, tema);
      const foto = (nome, o) => page.screenshot(Object.assign({ path: path.join(DIR, tam + '-' + tema + '-' + nome + '.png') }, o || {}));
      await page.goto('/vagas/index.html?previa=1');
      await page.waitForSelector('#app .pagina');
      await page.waitForTimeout(400);
      const ir = async (h) => { await page.evaluate(async (x) => { if (location.hash === x) await window.VSC_P.render(); else location.hash = x; }, h); await page.waitForTimeout(450); };
      for (const [nome, h] of TELAS.slice(0, 6)) { await ir(h); await foto(nome, { fullPage: nome === 'inicio' ? false : true }); }
      // candidatar (pessoa nova): início, conferir
      await ir('#/vaga/v01');
      await page.locator('[data-acao="candidatar"]').first().click();
      await page.waitForSelector('#folha-cand');
      await page.waitForTimeout(300);
      await foto('candidatar-1');
      await page.click('[data-acao="ap-exemplo"]');
      await page.waitForSelector('#ap-nome');
      await page.waitForTimeout(300);
      await foto('candidatar-2');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      // com conta (Ana)
      await ir('#/entrar');
      await page.fill('#ent-destino', 'ana.paula@exemplo.com');
      await page.click('button[type="submit"]');
      await page.waitForSelector('#cod-ent-0');
      await foto('codigo');
      await page.locator('#cod-ent-0').click();
      await page.keyboard.type('123456');
      await page.waitForFunction(() => location.hash === '#/candidaturas');
      await page.waitForTimeout(500);
      for (const [nome, h] of TELAS.slice(6)) { await ir(h); await foto(nome, { fullPage: true }); }
      await ir('#/vaga/v03');
      await page.locator('[data-acao="candidatar"]').first().click();
      await page.waitForSelector('#folha-cand');
      await page.waitForTimeout(300);
      await foto('candidatar-conta');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      await page.locator('[data-acao="ajustes"]').click();
      await page.waitForSelector('#folha-ajustes');
      await foto('ajustes');
    });
  }
}
