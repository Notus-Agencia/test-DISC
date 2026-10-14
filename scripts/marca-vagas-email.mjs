#!/usr/bin/env node
// Gera assets/marca/vsc-logo-email.png (logo do Vagas sem Caos para o topo dos e-mails: o Gmail não mostra SVG) a partir de
// assets/marca/vsc-logo.svg, no mesmo tamanho e estilo de assets/marca/gsc-logo-email.png: fundo branco, sem margem, a mesma
// escala (gsc: 918 unidades -> 960 px), 136 px de altura. O e-mail mostra a 188 px de largura (a gsc, 960 px, aparece a 200).
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/marca-vagas-email.mjs   (usa o Chromium do Playwright)
// Depois: node scripts/montar-vagas.mjs (copia para vagas/comum/marca/).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(RAIZ, 'assets', 'marca', 'vsc-logo.svg'), 'utf8');
const vb = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);
const ESCALA = 960 / 918;                               // a mesma de gsc-logo-email.png
const largura = Math.round(vb[2] * ESCALA);             // 903
const altura = Math.ceil(vb[3] * ESCALA);               // 136
const nav = await chromium.launch();
try {
  const p = await nav.newPage({ viewport: { width: largura, height: altura }, deviceScaleFactor: 1 });
  await p.setContent('<!doctype html><html><body style="margin:0;background:#fff"><img alt="" style="display:block;width:' + largura +
    'px;height:auto" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '"></body></html>');
  await p.waitForFunction(() => document.images[0].complete);
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: largura, height: altura } });
  writeFileSync(join(RAIZ, 'assets', 'marca', 'vsc-logo-email.png'), png);
  console.log('assets/marca/vsc-logo-email.png: ' + largura + '×' + altura + ', ' + png.length + ' bytes');
} finally {
  await nav.close();
}
