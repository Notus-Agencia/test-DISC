'use strict';
// Pesquisa de Clima da Equipe na prévia (API simulada): painel (computador) cria a pesquisa, gera os links, acompanha só a
// taxa agregada, encerra e publica o relatório; a pessoa responde pelo celular (390 px); o relatório de clima abre no celular.
// CLIMA_CAPTURAS=<pasta> salva prints para a revisão do dono (clima-*.png).
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { coletarErros } = require('./util');

const CAPTURAS = process.env.CLIMA_CAPTURAS || '';
const CONFIG_PREVIA = 'window.CONFIG = ' + JSON.stringify({ API_URL: 'simulada', BACKEND: 'simulada', WHATSAPP_RECRUTADOR: '', EMPRESA: '',
  MOSTRAR_RESULTADO_AO_CANDIDATO: false, GRUPOS_DEMONSTRACAO: 0 }) + ';';
const PROIBIDAS = ['burnout', 'adoecimento', 'depressão', 'ansiedade', 'tóxic', 'assédio', 'risco grave', 'crítico', 'harmonia', 'validado',
  'laudo', 'comprovad', 'científic', 'garante', 'notus'];

async function capturar(page, nome, opcoes) {
  if (!CAPTURAS) return;
  await page.screenshot(Object.assign({ path: path.join(CAPTURAS, 'clima-' + nome + '.png') }, opcoes || {}));
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
// Cria uma pesquisa aberta pela API da prévia (na página do painel) e devolve os tokens. Apaga a aberta que houver.
async function criarRodadaApi(page, opcoes) {
  return page.evaluate(async (op) => {
    const s = await DISC_API.login('admin@previa.com', 'previa123');
    const eq = await DISC_API.listarEquipe(s.token, 'emp_previa_clinica');
    const id = (n) => eq.colaboradores.find((c) => c.nome.startsWith(n)).pessoaId;
    const lista = await DISC_API.climaListar(s.token, 'emp_previa_clinica');
    for (const r of lista.rodadas.filter((x) => x.status === 'aberta')) await DISC_API.climaExcluirRodada(s.token, r.id);
    const r = await DISC_API.climaCriarRodada(s.token, { empresaId: 'emp_previa_clinica', complemento: true, canalTexto: 'o RH da Clínica Exemplo',
      canalUrl: 'mailto:escuta@exemplo.com', equipes: [{ liderId: id('Marta') }, { liderId: id('Diego'), convidados: 12 }, { liderId: id('Paulo') }] });
    if (op && op.encerrar) await DISC_API.climaEncerrar(s.token, r.rodada.id);
    return { rodadaId: r.rodada.id, membro: r.rodada.equipes[1].tokenEquipe, lider: r.rodada.equipes[1].tokenLider };
  }, opcoes || {});
}

test.describe('Pesquisa de clima: resposta no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('aviso anônimo, uma tela por bloco com rótulos, "Pular esta pergunta", N4 com o canal, envio e nada guardado além da marca', async ({ page, context }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/admin.html');
    const t = await criarRodadaApi(page);
    await page.goto('/clima.html?t=' + t.membro);
    // Aviso 6.1 (versão anônima) + aceite
    await expect(page.locator('h1')).toHaveText('Pesquisa de Clima da Equipe · Clínica Exemplo');
    await expect(page.locator('#topo-empresa')).toHaveText('Clínica Exemplo');
    const aviso = page.locator('.clima-aviso__lista');
    await expect(aviso).toContainText('A Gestão sem Caos cuida da coleta e do relatório em nome dela.');
    await expect(aviso).toContainText('Um grupo só aparece no relatório com pelo menos 5 respostas.');
    await expect(aviso).toContainText('não guardamos nome, telefone, e-mail nem endereço de internet');
    await expect(aviso).toContainText('(NR-1)');
    await expect(page.locator('.clima-equipe')).toHaveText('Você responde sobre a Equipe de Diego E.');
    await expect(page.locator('.clima-lider')).toHaveCount(0);
    await expect(page.locator('[data-acao="comecar"]')).toBeDisabled();
    await semRolagemLateral(page);
    await capturar(page, 'resposta-aviso', { fullPage: true });
    await page.check('#clima-aceite');
    await page.click('[data-acao="comecar"]');
    // Bloco A: 5 perguntas, 5 botões com rótulo cada, progresso "Parte 1 de 9"
    await expect(page.locator('.progresso-topo')).toContainText('Parte 1 de 9');
    await expect(page.locator('.clima-bloco__titulo')).toHaveText('Liberdade para falar');
    await expect(page.locator('.clima-pergunta')).toHaveCount(5);
    await expect(page.locator('.clima-opcao[data-item="A1"]')).toHaveText(['Discordo totalmente', 'Discordo', 'Nem concordo nem discordo', 'Concordo', 'Concordo totalmente']);
    const altura = await page.locator('.clima-opcao[data-item="A1"]').first().evaluate((e) => e.getBoundingClientRect().height);
    expect(altura).toBeGreaterThanOrEqual(44);
    await page.click('.clima-opcao[data-item="A1"][data-valor="4"]');
    await expect(page.locator('.clima-opcao[data-item="A1"][data-valor="4"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('.clima-pular[data-item="A3"]');
    await expect(page.locator('.clima-pular[data-item="A3"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('.clima-opcao[data-item="A3"][data-valor="2"]');
    await expect(page.locator('.clima-pular[data-item="A3"]')).toHaveAttribute('aria-pressed', 'false');
    await semRolagemLateral(page);
    await page.locator('.clima-pergunta').first().scrollIntoViewIfNeeded();
    await capturar(page, 'resposta-bloco');
    // A barra Voltar/Continuar fica fixa embaixo da tela (fora do cartão)
    const barra = await page.locator('.barra-nav').boundingBox();
    expect(Math.round(barra.y + barra.height)).toBeLessThanOrEqual(844);
    expect(barra.y).toBeGreaterThan(600);
    // Bloco F com a frase do topo
    for (let i = 0; i < 5; i++) await page.click('[data-acao="proximo"]');
    await expect(page.locator('.clima-bloco__titulo')).toHaveText('Apoio da liderança');
    await expect(page.locator('.clima-bloco__topo')).toHaveText('Seu líder é a pessoa a quem você responde no dia a dia.');
    await page.click('.clima-opcao[data-item="F1"][data-valor="5"]');
    await page.click('[data-acao="proximo"]');
    await page.click('[data-acao="proximo"]');
    // H: H1 + comentário opcional
    await expect(page.locator('.clima-bloco__titulo')).toHaveText('Para fechar');
    await page.click('.clima-opcao[data-item="H1"][data-valor="4"]');
    await expect(page.locator('label[for="clima-comentario"]')).toHaveText('Se você pudesse mudar uma coisa no trabalho da equipe, o que seria?');
    await expect(page.locator('#clima-comentario-ajuda')).toContainText('Não escreva nomes nem informações de saúde.');
    await page.fill('#clima-comentario', 'Reuniões mais curtas.');
    await page.click('[data-acao="proximo"]');
    // N (complemento com canal): N4 com frequência e o texto do canal logo depois
    await expect(page.locator('.progresso-topo')).toContainText('Parte 9 de 9');
    await expect(page.locator('.clima-opcao[data-item="N4"]')).toHaveText(['Nunca', 'Uma ou duas vezes', 'Três vezes ou mais', 'Prefiro não responder']);
    const canal = page.locator('[data-canal="n4"]');
    await expect(canal).toContainText('Se você está passando por isso, procure o RH da Clínica Exemplo. Esta pesquisa não é canal de denúncia e não identifica quem respondeu.');
    await expect(canal.locator('a')).toHaveAttribute('href', 'mailto:escuta@exemplo.com');
    await page.click('.clima-opcao[data-item="N4"][data-valor="1"]');
    await page.locator('[data-canal="n4"]').scrollIntoViewIfNeeded();
    await capturar(page, 'resposta-n4');
    // Nada das respostas no armazenamento do navegador antes do envio
    const antes = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)));
    expect(antes).not.toContain('Reuniões mais curtas');
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('h1')).toHaveText('Respostas enviadas. Obrigado!');
    await capturar(page, 'resposta-fim');
    // Guardou só a marca curta do link (sem o token e sem respostas)
    const marca = await page.evaluate(() => localStorage.getItem('disc_clima_respondido'));
    expect(marca).toMatch(/^\["[0-9a-f]{8}"\]$/);
    expect(await page.evaluate(() => JSON.stringify(Object.assign({}, sessionStorage)))).toBe('{}');
    // Abrir de novo no mesmo aparelho: "Você já respondeu" (com a opção para outra pessoa)
    await page.reload();
    await expect(page.locator('h1')).toHaveText('Você já respondeu');
    await page.click('[data-acao="outra-pessoa"]');
    await expect(page.locator('[data-acao="comecar"]')).toBeVisible();
    expect(erros).toEqual([]);
  });

  test('link do líder: aviso do líder, A–E + autopercepção (FL) + H1, sem carga e sem complemento', async ({ page, context }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/admin.html');
    const t = await criarRodadaApi(page);
    await page.goto('/clima.html?t=' + t.lider);
    await expect(page.locator('.clima-lider')).toContainText('A sua resposta não entra na média da equipe.');
    await expect(page.locator('.clima-equipe')).toHaveText('Você responde como líder da Equipe de Diego E.');
    await page.check('#clima-aceite');
    await page.click('[data-acao="comecar"]');
    await expect(page.locator('.progresso-topo')).toContainText('Parte 1 de 7');
    for (let i = 0; i < 5; i++) await page.click('[data-acao="proximo"]');
    await expect(page.locator('.clima-bloco__titulo')).toHaveText('O seu jeito de liderar');
    await expect(page.locator('.clima-pergunta[data-item="FL1"]')).toBeVisible();
    await page.click('.clima-opcao[data-item="FL1"][data-valor="4"]');
    await page.click('[data-acao="proximo"]');
    await expect(page.locator('#clima-comentario')).toHaveCount(0);
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('h1')).toHaveText('Respostas enviadas. Obrigado!');
    expect(erros).toEqual([]);
  });

  test('link inválido e pesquisa encerrada', async ({ page, context }) => {
    await previa(context);
    await page.goto('/clima.html?t=' + 'f'.repeat(64));
    await expect(page.locator('h1')).toHaveText('Link inválido');
    await expect(page.locator('.subtitulo')).toHaveText('Link inválido ou pesquisa encerrada. Fale com quem enviou o link.');
    await page.goto('/clima.html');
    await expect(page.locator('h1')).toHaveText('Link inválido');
    await page.goto('/admin.html');
    const t = await criarRodadaApi(page, { encerrar: true });
    await page.goto('/clima.html?t=' + t.membro);
    await expect(page.locator('h1')).toHaveText('Pesquisa encerrada');
  });

  test('relatório de clima de exemplo no celular: capítulos, textos fixos, sem rolagem lateral e sem palavras proibidas', async ({ page, context }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/relatorio.html#r-exemplo-clima');
    await expect(page.locator('#relatorio')).toHaveAttribute('data-estado', 'pronto');
    await expect(page.locator('#relatorio')).toHaveAttribute('data-modelo', 'clima');
    await expect(page.locator('.capa__titulo')).toContainText('Clínica Exemplo');
    const ids = await page.locator('section[data-secao]').evaluateAll((els) => els.map((e) => e.getAttribute('data-secao')));
    expect(ids).toEqual(['capa', 'indice', 'como-ler', 'resumo', 'grupos', 'fatores', 'comentarios', 'plano', 'pgr', 'metodo']);
    const texto = (await page.locator('#relatorio').innerText()).replace(/\s+/g, ' ');
    expect(texto).toContain('Clima é a percepção coletiva do ambiente de trabalho. Este relatório não avalia pessoas, não faz diagnóstico de saúde e não é avaliação psicológica.');
    expect(texto).toContain('Faixas de referência provisórias, definidas pela escala de resposta. Não são normas nem comparação com outras empresas.');
    expect(texto).toContain('Não use este relatório para decidir contratação, promoção, desligamento, remanejamento, salário ou bônus.');
    expect(texto).toContain('Em validação.');
    // "Outras equipes" e as equipes que não aparecem sozinhas (só nomes, sem contagem)
    await expect(page.locator('[data-grupo="outras:empresa"]')).toContainText('Reúne: Equipe de Marta E., Equipe de Paulo M.');
    await expect(page.locator('[data-grupo="clq_previa_diego"]')).toContainText('11 de 12 responderam');
    expect(texto).not.toMatch(/2 de 3 responderam|6 de 8 responderam/);
    // Sem índice geral e sem ranking; N4 só no total; temas sem trecho literal
    expect(texto.toLowerCase()).not.toContain('índice geral');
    await expect(page.locator('[data-n4="1"]')).toHaveCount(1);
    for (const p of PROIBIDAS) expect(texto.toLowerCase()).not.toContain(p);
    await semRolagemLateral(page);
    await capturar(page, 'relatorio-celular', { fullPage: true });
    expect(erros).toEqual([]);
  });
});

test.describe('Pesquisa de clima: painel (computador)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('criar pela subaba, links da equipe e do líder, taxa agregada, avisos de mínimo, encerrar e publicar', async ({ page, context }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/admin.html#empresa/emp_previa_clinica/clima');
    await entrar(page);
    await expect(page.locator('#emp-subaba-clima')).toHaveAttribute('aria-current', 'page');
    const encerrada = page.locator('.clima-rodada[data-status="encerrada"]');
    await expect(encerrada).toHaveCount(1);
    // Rodada de exemplo: avisos "fundida em Outras equipes" (mínimo e complemento), quadro e visão do líder
    await expect(encerrada.locator('[data-situacao="outras"]')).toHaveCount(2);
    await expect(encerrada.locator('.clima-situacao', { hasText: 'Equipe de Marta E.' })).toContainText('Fundida em "Outras equipes": menos de 5 respostas.');
    await expect(encerrada.locator('.clima-situacao', { hasText: 'Equipe de Paulo M.' })).toContainText('para proteger o anonimato de uma equipe pequena');
    await expect(encerrada.locator('.clima-quadro--temas thead th')).toHaveText(['Tema', 'Toda a empresa (19)', 'Equipe de Diego E. (11)', 'Outras equipes (8)']);
    await expect(encerrada.locator('.clima-quadro--lider')).toHaveCount(1);
    await expect(encerrada.locator('.clima-link-relatorio')).toContainText('relatorio.html?r=exemplo-clima');
    await capturar(page, 'painel-encerrada', { fullPage: true });

    // Nova pesquisa: janela com as equipes do organograma (quem lidera alguém)
    await page.click('#btn-clima-nova');
    await expect(page.locator('#janela-clima-nova')).toBeVisible();
    await expect(page.locator('#clima-escolhas .clima-escolha')).toHaveCount(3);
    await expect(page.locator('#clima-escolhas')).toContainText('Equipe de Marta E.');
    await expect(page.locator('#clima-total-convidados')).toHaveText('Total de convidados: 6');
    await page.locator('#clima-escolhas .clima-escolha', { hasText: 'Diego' }).locator('.clima-conv').fill('12');
    await expect(page.locator('#clima-total-convidados')).toHaveText('Total de convidados: 16');
    await page.check('#clima-complemento');
    await page.fill('#clima-canal', 'o RH da Clínica Exemplo');
    await capturar(page, 'painel-nova');
    await page.click('#janela-ok');
    await expect(page.locator('#janela-clima-nova')).toHaveCount(0);
    const aberta = page.locator('.clima-rodada[data-status="aberta"]');
    await expect(aberta).toHaveCount(1);
    await expect(page.locator('#btn-clima-nova')).toHaveCount(0);
    await expect(aberta.locator('.clima-equipe')).toHaveCount(3);
    await expect(aberta.locator('.clima-taxa-total')).toHaveText('0 de 16 convidados responderam (0%)');
    await expect(aberta.locator('.clima-avisos')).toContainText('Com menos de 5, a equipe não aparece sozinha');
    const linkEquipe = await aberta.locator('.clima-equipe', { hasText: 'Diego' }).locator('[data-link="equipe"]').innerText();
    const linkLider = await aberta.locator('.clima-equipe', { hasText: 'Diego' }).locator('[data-link="lider"]').innerText();
    expect(linkEquipe).toMatch(/\/clima\.html\?t=[0-9a-f]{64}$/);
    expect(linkLider).not.toBe(linkEquipe);
    const wa = await aberta.locator('.clima-equipe', { hasText: 'Diego' }).locator('[data-acao="whatsapp-equipe"]').getAttribute('href');
    expect(decodeURIComponent(wa)).toContain('anônima e voluntária');
    expect(decodeURIComponent(wa)).toContain(linkEquipe);

    // 6 respostas pela tela de resposta (link da equipe), num celular
    const cel = await context.newPage();
    await cel.setViewportSize({ width: 390, height: 844 });
    const token = linkEquipe.split('t=')[1];
    for (let i = 0; i < 6; i++) {
      await cel.goto('/clima.html?t=' + token);
      await cel.locator('[data-acao="comecar"], [data-acao="outra-pessoa"]').first().waitFor();
      if (await cel.locator('[data-acao="outra-pessoa"]').count()) await cel.click('[data-acao="outra-pessoa"]');
      await cel.check('#clima-aceite');
      await cel.click('[data-acao="comecar"]');
      await cel.click('.clima-opcao[data-item="A1"][data-valor="' + (1 + (i % 5)) + '"]');
      await cel.click('.clima-opcao[data-item="A2"][data-valor="4"]');
      await cel.click('.clima-opcao[data-item="A4"][data-valor="4"]');
      for (let k = 0; k < 8; k++) await cel.click('[data-acao="proximo"]');
      await cel.click('[data-acao="enviar"]');
      await expect(cel.locator('h1')).toHaveText('Respostas enviadas. Obrigado!');
    }
    await cel.close();
    await page.click('#btn-clima-atualizar');
    await expect(aberta.locator('.clima-taxa-total')).toHaveText('6 de 16 convidados responderam (38%)');
    await expect(aberta.locator('[data-taxa]').nth(1)).toHaveText('6 de 12 (50%)');
    await expect(aberta.locator('.clima-avisos')).toContainText('Adesão de 38% (abaixo de 60%)');
    // O painel nunca mostra resposta individual nem comentário enquanto aberta
    await expect(aberta).not.toContainText('Liberdade para falar');
    await capturar(page, 'painel-aberta', { fullPage: true });

    // Encerrar: resultado com as regras de anonimato
    await aberta.locator('[data-acao="clima-encerrar"]').click();
    await page.click('#confirmar-ok');
    const fechada = page.locator('.clima-rodada').first();
    await expect(fechada).toHaveAttribute('data-status', 'encerrada');
    await expect(fechada.locator('.clima-quadro--temas thead th')).toHaveText(['Tema', 'Toda a empresa (6)', 'Equipe de Diego E. (6)']);
    await expect(fechada.locator('.clima-situacao', { hasText: 'Equipe de Marta E.' })).toContainText('Não aparece: nenhuma resposta.');
    await expect(fechada).toContainText('Comentários e temas só com 10 ou mais respostas no total.');
    // Publicar o relatório e abrir pelo link
    await fechada.locator('[data-acao="clima-publicar"]').click();
    const linkRel = fechada.locator('.clima-link-relatorio');
    await expect(linkRel).toContainText('relatorio.html?r=');
    const url = await linkRel.innerText();
    const rel = await context.newPage();
    await rel.goto(url.replace(/^https?:\/\/[^/]+/, ''));
    await expect(rel.locator('#relatorio')).toHaveAttribute('data-modelo', 'clima');
    await expect(rel.locator('[data-grupo="clq_previa_diego"], .clima-grupo')).toHaveCount(1);
    await expect(rel.locator('#relatorio')).toContainText('Estimativa com margem ampla');
    await expect(rel.locator('#relatorio')).toContainText('Baixa adesão (38% responderam): leia com cautela.');
    await rel.close();
    expect(erros).toEqual([]);
  });
});
