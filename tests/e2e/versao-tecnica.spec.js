'use strict';
// Versão do dono × versão técnica dos relatórios de equipe e "Como liderar" (js/versao-tecnica.js; decisão do painel
// científico, seção 4, linha 12):
//   - página do relatório: o link do dono nunca mostra a distância entre o estilo natural e o que o cargo pede (nem as
//     barras por pessoa, nem o esforço de adaptação) e escreve "Este capítulo é liberado só para leitura por psicólogo(a).";
//     o link técnico mostra tudo e "Leitura técnica: <nome> · CRP <n>" em todas as páginas, também no PDF;
//   - painel (prévia): salvar → informar nome e CRP (validado, com o aviso) → link técnico, histórico, despublicar só ele.
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { API_FALSA, coletarErros, configurar, simularApi } = require('./util');
const MODELOS = require('../../js/relatorio-modelos.js');
const AVANCADO = require('../../js/lideranca-avancado.js');

const TOKEN_DONO = 'tokenDono_' + 'd'.repeat(32);
const TOKEN_TEC = 'e'.repeat(64);
const GERADO = '2026-10-05T12:00:00.000Z';
const EXIGIDO_DI = '4321'.repeat(10);
const RES = {
  DI: { percentuais: { D: 45, I: 25, S: 15, C: 15 }, codigo: 'DI' },
  SC: { percentuais: { D: 15, I: 20, S: 45, C: 20 }, codigo: 'SC' },
  CS: { percentuais: { D: 10, I: 15, S: 25, C: 50 }, codigo: 'CS' },
  IS: { percentuais: { D: 20, I: 40, S: 25, C: 15 }, codigo: 'IS' }
};
const LEITURA = { nome: 'Fulana de Tal', crp: '06/12345' };
const LINHA = 'Leitura técnica: Fulana de Tal · CRP 06/12345';
const RESTRITO = 'Este capítulo é liberado só para leitura por psicólogo(a).';
const AVISO = 'Ao informar o CRP, você declara que o relatório será lido por esse(a) profissional; a informação fica registrada.';
const PREVIAS = process.env.PRINTS_VERSAO_TECNICA || '';

const DADOS = {
  equipe: MODELOS.equipe({
    empresa: { nome: 'Clínica Exemplo' }, consultor: 'Consultor Exemplo',
    colaboradores: [
      { pessoaId: 'a', nome: 'Ana Paula Souza', cargo: 'Diretora', resultado: RES.DI },
      { pessoaId: 'b', nome: 'Bruno Lima', cargo: 'Gerente', resultado: RES.SC, exigido: EXIGIDO_DI },
      { pessoaId: 'c', nome: 'Carla Dias', cargo: 'Analista', resultado: RES.CS, exigido: { percentuais: { D: 35, I: 30, S: 15, C: 20 }, codigo: 'DI' } },
      { pessoaId: 'e', nome: 'Eva Nunes', cargo: 'Atendimento', resultado: RES.IS }
    ],
    relacoes: [{ de: 'a', para: 'b', tipo: 'lidera' }, { de: 'b', para: 'c', tipo: 'lidera' }, { de: 'a', para: 'e', tipo: 'lidera' }]
  }, { geradoEm: GERADO }),
  lideranca: MODELOS.lideranca({ pessoa: { nome: 'Bruno Lima', cargo: 'Gerente', resultado: RES.SC, exigido: EXIGIDO_DI },
    lider: { nome: 'Ana Paula Souza', resultado: RES.DI }, empresa: { nome: 'Clínica Exemplo' } }, { geradoEm: GERADO, avancado: AVANCADO })
};

// Servidor falso: o link do dono devolve o snapshot COMPLETO (como um banco ainda sem a migração) — a página esconde
// mesmo assim; o técnico vem com versao 'tecnica' e quem vai ler.
async function abrir(page, modelo, token) {
  await configurar(page, { API_URL: API_FALSA });
  await simularApi(page, (corpo) => {
    if (corpo.acao !== 'relatorioPublico') return { ok: false, erro: 'Ação desconhecida.' };
    if (corpo.token === TOKEN_DONO) return { ok: true, modelo, relatorio: DADOS[modelo], publicadoEm: GERADO };
    if (corpo.token === TOKEN_TEC) return { ok: true, modelo, versao: 'tecnica', relatorio: DADOS[modelo], leituraTecnica: LEITURA, publicadoEm: GERADO };
    return { ok: false, erro: 'Relatório não encontrado ou fora do ar.' };
  });
  await page.goto('/relatorio.html?r=' + token);
  await expect(page.locator('#relatorio')).toHaveAttribute('data-estado', 'pronto');
}
async function semRolagemLateral(page) {
  const [largura, janela] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(largura).toBeLessThanOrEqual(janela);
}
async function print(page, nome) {
  if (!PREVIAS) return;
  fs.mkdirSync(PREVIAS, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(PREVIAS, nome + '.png'), fullPage: false });
}
// Texto de cada página do PDF (pdftotext, do poppler). Sem ele na máquina: null (a checagem por página fica de fora).
function paginasDoPdf(pdf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-pdf-'));
  const arq = path.join(dir, 'r.pdf');
  fs.writeFileSync(arq, pdf);
  try { return execFileSync('pdftotext', ['-layout', arq, '-'], { encoding: 'utf8' }).split('\f').filter((p) => p.trim()); } catch (e) { return null; }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test.describe('Página do relatório: versão do dono × versão técnica', () => {
  for (const [nome, viewport] of [['celular 375', { width: 375, height: 812 }], ['computador', { width: 1280, height: 900 }]]) {
    test('equipe, link do dono: sem o capítulo da distância nem as barras por pessoa; a linha no lugar (' + nome + ')', async ({ page }) => {
      const erros = coletarErros(page);
      await page.setViewportSize(viewport);
      await abrir(page, 'equipe', TOKEN_DONO);
      await expect(page.locator('article.doc[data-leitura="dono"]')).toHaveCount(1);
      await expect(page.locator('.distancia-doc, .liderado-doc__dist, .barra--dist, .mapa-rf__seta, .mapa-rf__exigido, [data-leitura-tecnica]')).toHaveCount(0);
      await expect(page.locator('[data-secao="ritmo"] .restrito-doc')).toHaveText(new RegExp(RESTRITO.replace(/[()]/g, '\\$&')));
      await expect(page.locator('[data-secao="ritmo"]')).toContainText('Distância entre o estilo natural e o que o cargo pede');
      await expect(page.locator('[data-secao="lideres"] .restrito-doc')).toHaveCount(1);
      const texto = await page.locator('#relatorio').innerText();
      expect(texto).not.toMatch(/responderam a segunda parte|Fator que os cargos mais pedem|Não mede estresse|Leitura técnica/);
      await expect(page).toHaveTitle(/^Relatório de equipe — Clínica Exemplo$/);
      await semRolagemLateral(page);
      if (nome === 'computador') {
        await page.locator('[data-secao="ritmo"] .restrito-doc').scrollIntoViewIfNeeded();
        await print(page, 'versao-tecnica-dono-1280');
      } else {
        await page.locator('[data-secao="ritmo"] .restrito-doc').scrollIntoViewIfNeeded();
        await print(page, 'versao-tecnica-dono-390');
      }
      expect(erros).toEqual([]);
    });

    test('equipe, link técnico: capítulo e barras por pessoa, "Leitura técnica" em todas as páginas (' + nome + ')', async ({ page }) => {
      const erros = coletarErros(page);
      await page.setViewportSize(viewport);
      await abrir(page, 'equipe', TOKEN_TEC);
      await expect(page.locator('article.doc[data-leitura="tecnica"]')).toHaveCount(1);
      await expect(page.locator('.restrito-doc')).toHaveCount(0);
      await expect(page.locator('[data-secao="ritmo"] .distancia-doc')).toBeVisible();
      await expect(page.locator('[data-secao="lideres"] .liderado-doc__dist')).toHaveCount(2);
      await expect(page.locator('[data-secao="capa"] .leitura-tec')).toHaveText(LINHA);
      const secoes = page.locator('section.secao');
      const n = await secoes.count();
      expect(n).toBeGreaterThanOrEqual(8);
      for (let i = 0; i < n; i++) await expect(secoes.nth(i).locator('.leitura-tec')).toHaveText(LINHA);
      await expect(page.locator('#indice .leitura-tec')).toHaveText(LINHA);
      await expect(page.locator('.rodape-doc')).toContainText(LINHA);
      await expect(page).toHaveTitle(/versão técnica$/);
      await semRolagemLateral(page);
      if (nome === 'computador') {
        await page.locator('[data-secao="ritmo"] .distancia-doc').scrollIntoViewIfNeeded();
        await print(page, 'versao-tecnica-tecnica-1280');
      } else {
        await page.locator('[data-secao="ritmo"] .distancia-doc').scrollIntoViewIfNeeded();
        await print(page, 'versao-tecnica-tecnica-390');
      }
      expect(erros).toEqual([]);
    });
  }

  test('equipe, link técnico em PDF A4: nome e CRP em todas as páginas impressas', async ({ page }) => {
    await page.setViewportSize({ width: 794, height: 1123 });
    await abrir(page, 'equipe', TOKEN_TEC);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    await semRolagemLateral(page);
    await expect(page.locator('style[data-leitura-tecnica-impressao]')).toHaveCount(1);
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const paginas = paginasDoPdf(pdf);
    test.info().annotations.push({ type: 'pdf', description: paginas ? paginas.length + ' páginas conferidas' : 'pdftotext ausente: só o CSS conferido' });
    if (!paginas) return;
    expect(paginas.length).toBeGreaterThanOrEqual(10);
    paginas.forEach((p, i) => expect(p.replace(/\s+/g, ' '), 'página ' + (i + 1)).toContain('CRP 06/12345'));
    paginas.forEach((p, i) => expect(p.replace(/\s+/g, ' '), 'página ' + (i + 1)).toContain('Fulana de Tal'));
  });

  test('equipe, link do dono em PDF: nenhuma página com a Parte 2 nem com "Leitura técnica"', async ({ page }) => {
    await page.setViewportSize({ width: 794, height: 1123 });
    await abrir(page, 'equipe', TOKEN_DONO);
    await page.emulateMedia({ media: 'print' });
    const paginas = paginasDoPdf(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
    if (!paginas) return;
    const tudo = paginas.join(' ').replace(/\s+/g, ' ');
    expect(tudo).not.toMatch(/Leitura técnica|responderam a segunda parte|Fator que os cargos mais pedem/);
    expect(tudo).toContain('liberado só para leitura por psicólogo(a)');
  });

  test('Como liderar: link do dono sem o esforço de adaptação; link técnico com ele e com a leitura', async ({ page }) => {
    const erros = coletarErros(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await abrir(page, 'lideranca', TOKEN_DONO);
    await expect(page.locator('article.doc[data-leitura="dono"]')).toHaveCount(1);
    await expect(page.locator('[data-secao="resumo"] .restrito-doc[data-restrito="esforco"]')).toContainText(RESTRITO);
    await expect(page.locator('.natex, .mapa-rf__seta, [data-leitura-tecnica]')).toHaveCount(0);
    await expect(page.locator('[data-secao="liderar"]')).not.toContainText('Esforço de adaptação ao cargo');
    await semRolagemLateral(page);
    await abrir(page, 'lideranca', TOKEN_TEC);
    await expect(page.locator('article.doc[data-leitura="tecnica"]')).toHaveCount(1);
    await expect(page.locator('[data-secao="resumo"] .natex')).toBeVisible();
    await expect(page.locator('.restrito-doc')).toHaveCount(0);
    const secoes = page.locator('section.secao');
    for (let i = 0; i < await secoes.count(); i++) await expect(secoes.nth(i).locator('.leitura-tec')).toHaveText(LINHA);
    await semRolagemLateral(page);
    expect(erros).toEqual([]);
  });
});

/* ------------------------------------------------------------------ painel (prévia, API simulada) */

async function entrarPrevia(page, context) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await context.route('**/js/config.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8',
    body: 'window.CONFIG = ' + JSON.stringify({ API_URL: 'simulada', WHATSAPP_RECRUTADOR: '', EMPRESA: '', MOSTRAR_RESULTADO_AO_CANDIDATO: false, GRUPOS_DEMONSTRACAO: 0 }) + ';' }));
  await page.goto('/admin.html');
  await expect(page.locator('#form-login')).toBeVisible();
  await page.fill('#campo-email', 'admin@previa.com');
  await page.fill('#campo-senha', 'previa123');
  await page.click('#btn-entrar');
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#contagem')).not.toHaveText('Carregando…');
}

test.describe('Painel: versão técnica (prévia)', () => {
  test('salvar → nome e CRP (validado, com o aviso) → link técnico e histórico; despublicar só o técnico', async ({ page, context }) => {
    const erros = coletarErros(page);
    await entrarPrevia(page, context);
    await page.locator('.aba[data-aba="relatorios"]').click();
    await page.click('#btn-rel-novo');
    await page.click('#assist-modelo-equipe');
    await page.click('#assist-empresa');
    await page.fill('#assist-empresa-busca', 'Clínica Exemplo');
    await page.locator('#assist-empresa-lista [role="option"]', { hasText: 'Clínica Exemplo' }).click();
    await page.click('#btn-assist-gerar');
    await expect(page.locator('#rel-modelo-previa')).toBeVisible();
    // a prévia do painel é a versão do dono (padrão)
    await expect(page.frameLocator('#rel-modelo-previa').locator('article.doc[data-leitura="dono"]')).toHaveCount(1);
    await expect(page.frameLocator('#rel-modelo-previa').locator('.restrito-doc').first()).toBeVisible();
    // ainda não salvo: precisa salvar antes
    await expect(page.locator('#rel-tecnica')).toBeVisible();
    await expect(page.locator('#rel-tec-salvar')).toHaveText('Salve o relatório (rascunho ou publicado) para gerar a versão técnica.');
    await expect(page.locator('#btn-rel-tec-gerar')).toHaveCount(0);

    await page.click('#btn-rel-publicar');
    await expect(page.locator('#rel-modelo-link')).toBeVisible();
    await expect(page.locator('#rel-modelo-versao')).toContainText('Versão do dono/gestor');
    await expect(page.locator('#rel-tec-aviso')).toHaveText(AVISO);
    // CRP fora do formato: erro e nada gerado
    await page.fill('#rel-tec-nome', 'Fulana de Tal');
    await page.fill('#rel-tec-crp', '6/123');
    await page.click('#btn-rel-tec-gerar');
    await expect(page.locator('#rel-tec-erro')).toHaveText('CRP inválido. Use o formato RR/NNNNN: a região com 2 dígitos e o número (ex.: 06/12345).');
    await expect(page.locator('#rel-tec-crp')).toBeFocused();
    await page.fill('#rel-tec-nome', 'Fulana');
    await page.fill('#rel-tec-crp', '06/12345');
    await page.click('#btn-rel-tec-gerar');
    await expect(page.locator('#rel-tec-erro')).toHaveText('Informe o nome completo de quem vai ler (nome e sobrenome, só letras).');
    await expect(page.locator('#rel-tec-link')).toHaveCount(0);
    await page.fill('#rel-tec-nome', 'Fulana de Tal');
    await page.locator('#rel-tecnica').scrollIntoViewIfNeeded();
    await print(page, 'versao-tecnica-painel-formulario');
    await page.click('#btn-rel-tec-gerar');
    await expect(page.locator('#aviso-geral')).toHaveText('Versão técnica gerada. Copie o link e envie para Fulana de Tal.');
    await expect(page.locator('#rel-tec-leitor')).toHaveText(LINHA);
    await expect(page.locator('#rel-tec-link')).toContainText('/relatorio.html?r=');
    await expect(page.locator('#rel-tec-historico > li')).toHaveCount(1);
    await expect(page.locator('#rel-tec-historico > li').first()).toHaveText(/^Gerada para Fulana de Tal \(CRP 06\/12345\) por .+ em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
    await page.locator('#rel-tecnica').scrollIntoViewIfNeeded();
    await print(page, 'versao-tecnica-painel-gerada');

    const linkDono = (await page.locator('#rel-modelo-link').textContent()).trim();
    const linkTec = (await page.locator('#rel-tec-link').textContent()).trim();
    expect(linkTec).not.toBe(linkDono);
    // os dois links abrem cada um a sua versão (mesmo navegador: a "planilha" da prévia é a mesma)
    const aba = await context.newPage();
    await aba.goto(linkDono);
    await expect(aba.locator('#relatorio')).toHaveAttribute('data-estado', 'pronto');
    await expect(aba.locator('article.doc[data-leitura="dono"]')).toHaveCount(1);
    await expect(aba.locator('[data-leitura-tecnica], .liderado-doc__dist, .distancia-doc')).toHaveCount(0);
    await aba.goto(linkTec);
    await expect(aba.locator('#relatorio')).toHaveAttribute('data-estado', 'pronto');
    await expect(aba.locator('article.doc[data-leitura="tecnica"]')).toHaveCount(1);
    await expect(aba.locator('[data-secao="capa"] .leitura-tec')).toHaveText(LINHA);
    await expect(aba.locator('.distancia-doc')).toHaveCount(1);

    // despublicar a técnica: o link técnico para, o do dono continua
    await page.click('#btn-rel-tec-despublicar');
    await expect(page.locator('#confirmar-desc')).toContainText('O link técnico para de abrir na hora');
    await page.click('#confirmar-ok');
    await expect(page.locator('#rel-tec-despublicada')).toBeVisible();
    await expect(page.locator('#rel-tec-historico > li')).toHaveCount(2);
    await expect(page.locator('#rel-tec-historico > li').first()).toContainText('despublicado');
    await aba.goto(linkTec);
    await expect(aba.locator('.doc-erro')).toContainText('Relatório não encontrado ou fora do ar.');
    await aba.goto(linkDono);
    await expect(aba.locator('article.doc[data-leitura="dono"]')).toHaveCount(1);
    await aba.close();
    expect(erros.filter((e) => !/about:srcdoc/.test(e))).toEqual([]);
  });
});
