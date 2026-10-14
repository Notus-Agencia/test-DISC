'use strict';
// Feedback 360 da Liderança na prévia (API simulada): a pessoa responde pelo celular (390 px) com o aviso certo para cada
// fonte; o relatório do líder e a visão da chefia abrem no celular; o painel (computador) cria o ciclo a partir do organograma,
// gera os links individuais, mostra só contagens, encerra, modera comentários, registra a devolutiva e publica.
// F360_CAPTURAS=<pasta> salva prints para a revisão do dono (feedback360-*.png).
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { coletarErros } = require('./util');

const CAPTURAS = process.env.F360_CAPTURAS || '';
const CONFIG_PREVIA = 'window.CONFIG = ' + JSON.stringify({ API_URL: 'simulada', BACKEND: 'simulada', WHATSAPP_RECRUTADOR: '', EMPRESA: '',
  MOSTRAR_RESULTADO_AO_CANDIDATO: false, GRUPOS_DEMONSTRACAO: 0 }) + ';';
const PROIBIDAS = ['ponto cego', 'superestim', 'tóxic', 'anônim', 'ranking', 'aprovado', 'validado', 'laudo', 'comprovad', 'científic', 'garante', 'notus'];
const EMP = 'emp_previa_clinica';

async function capturar(page, nome, opcoes) {
  if (!CAPTURAS) return;
  await page.screenshot(Object.assign({ path: path.join(CAPTURAS, 'feedback360-' + nome + '.png') }, opcoes || {}));
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
// Cria um ciclo aberto pela API da prévia (desenho sugerido pelo organograma) e devolve os tokens de Diego por fonte.
async function criarCicloApi(page, opcoes) {
  return page.evaluate(async (op) => {
    const s = await DISC_API.login('admin@previa.com', 'previa123');
    const emp = 'emp_previa_clinica';
    const cl = await DISC_API.climaListar(s.token, emp);
    for (const r of cl.rodadas.filter((x) => x.status === 'aberta')) await DISC_API.climaEncerrar(s.token, r.id);
    const eq = await DISC_API.listarEquipe(s.token, emp);
    const sug = DISC_F360.sugerirDesenho(eq.colaboradores, eq.relacoes, eq.topoIds);
    const r = await DISC_API.f360CriarCiclo(s.token, { empresaId: emp, contatoRelatos: 'Diretoria (contrato)', canalTexto: 'o canal de escuta do RH',
      avaliados: sug.avaliados.map((a) => ({ pessoaId: a.pessoaId, chefia: a.chefia, equipe: a.equipe, colegas: a.colegas, outros: a.outros })) });
    const diego = r.ciclo.avaliados.find((a) => a.nome.startsWith('Diego'));
    const tk = (f) => r.ciclo.convites.filter((c) => c.avaliadoId === diego.id && c.fonte === f).map((c) => c.token);
    if (op && op.encerrar) await DISC_API.f360Encerrar(s.token, r.ciclo.id);
    return { cicloId: r.ciclo.id, auto: tk('auto')[0], chefia: tk('chefia')[0], equipe: tk('equipe'), colegas: tk('colegas') };
  }, opcoes || {});
}
// Responde uma tela de tema inteira com o mesmo valor.
async function responderTela(page, valor) {
  const itens = await page.locator('.f360-pergunta').evaluateAll((els) => els.map((e) => e.getAttribute('data-item')));
  for (const id of itens) await page.click('.f360-opcao[data-item="' + id + '"][data-valor="' + valor + '"]');
}

test.describe('Feedback 360: resposta no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('equipe: aviso confidencial, instrução, 1 tema por tela, "Não tive como observar", pular, comentário com aviso, envio, refazer e apagar', async ({ page, context }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/admin.html');
    const t = await criarCicloApi(page);
    await page.goto('/feedback360.html?t=' + t.equipe[0]);
    await expect(page.locator('h1')).toHaveText('Feedback 360 de Diego E. · Clínica Exemplo');
    await expect(page.locator('#topo-empresa')).toHaveText('Clínica Exemplo');
    await expect(page.locator('.sobretitulo')).toContainText('Confidencial e voluntário');
    await expect(page.locator('.f360-quem')).toHaveText('Você responde sobre Diego E., no grupo Equipe.');
    const aviso = page.locator('.f360-aviso__lista');
    await expect(aviso).toContainText('Sua resposta fica dentro do grupo Equipe:');
    await expect(aviso).toContainText('Seu link é individual só para evitar respostas repetidas.');
    await expect(aviso).not.toContainText('aparece identificada');
    await expect(page.locator('[data-acao="continuar"]')).toBeDisabled();
    await semRolagemLateral(page);
    await capturar(page, 'resposta-aviso', { fullPage: true });
    await page.check('#f360-aceite');
    await page.click('[data-acao="continuar"]');
    // Instrução (quadro de referência) com a escala inteira
    await expect(page.locator('h1')).toHaveText('Como responder');
    await expect(page.locator('.f360-instrucao__texto')).toContainText('Pense no que você viu Diego E. fazer nos últimos 3 meses');
    await expect(page.locator('.f360-legenda li')).toHaveText(['Nunca ou quase nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre ou quase sempre', 'Não tive como observar']);
    await capturar(page, 'resposta-instrucao', { fullPage: true });
    await page.click('[data-acao="comecar"]');
    // Tema 1: 3 frases, 5 opções com rótulo + "Não tive como observar" + "Pular"
    await expect(page.locator('.progresso-topo')).toContainText('Parte 1 de 8');
    await expect(page.locator('.f360-bloco__titulo')).toHaveText('Direção e decisões');
    await expect(page.locator('.f360-pergunta')).toHaveCount(3);
    await expect(page.locator('.f360-pergunta__texto').first()).toHaveText('Diego E. deixa claro quais são as prioridades da equipe para as próximas semanas.');
    await expect(page.locator('.f360-opcoes .f360-opcao[data-item="DIR1"]')).toHaveText(['Nunca ou quase nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Sempre ou quase sempre']);
    await expect(page.locator('.f360-opcao--fora[data-item="DIR1"]')).toHaveText('Não tive como observar');
    const altura = await page.locator('.f360-opcao[data-item="DIR1"]').first().evaluate((e) => e.getBoundingClientRect().height);
    expect(altura).toBeGreaterThanOrEqual(44);
    await page.click('.f360-opcao[data-item="DIR1"][data-valor="4"]');
    await expect(page.locator('.f360-opcao[data-item="DIR1"][data-valor="4"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('.f360-opcao[data-item="DIR2"][data-valor="0"]');
    await page.click('.f360-pular[data-item="DIR3"]');
    await expect(page.locator('.f360-pular[data-item="DIR3"]')).toHaveAttribute('aria-pressed', 'true');
    await semRolagemLateral(page);
    await capturar(page, 'resposta-tema', { fullPage: true });
    for (let i = 0; i < 5; i++) { await page.click('[data-acao="proximo"]'); await responderTela(page, 3 + (i % 2)); }
    await page.click('[data-acao="proximo"]');
    await expect(page.locator('.f360-bloco__titulo')).toHaveText('Para fechar');
    await expect(page.locator('.f360-bloco__topo')).toContainText('não aparece no relatório');
    await page.click('[data-acao="proximo"]');
    // Comentários: aviso logo acima de cada campo
    await expect(page.locator('.f360-bloco__titulo')).toHaveText('Comentários (opcional)');
    await expect(page.locator('.f360-aviso-comentario')).toHaveCount(2);
    await expect(page.locator('.f360-aviso-comentario').first()).toContainText('A Gestão sem Caos revisa os comentários antes de Diego E. ler');
    await page.fill('#f360-AB1', 'Explica bem as prioridades da semana.');
    await capturar(page, 'resposta-comentarios', { fullPage: true });
    await page.click('[data-acao="enviar"]');
    await expect(page.locator('h1')).toHaveText('Respostas enviadas. Obrigado!');
    await expect(page.locator('.subtitulo')).toContainText('Diego E. vê só resultados de grupo');
    await capturar(page, 'resposta-fim');
    // O mesmo link: "Você já respondeu" -> apagar
    await page.goto('/feedback360.html?t=' + t.equipe[0]);
    await expect(page.locator('h1')).toHaveText('Você já respondeu');
    await page.click('[data-acao="apagar"]');
    await page.click('[data-acao="confirmar-apagar"]');
    await expect(page.locator('h1')).toHaveText('Resposta apagada');
    const texto = (await page.locator('body').innerText()).toLowerCase();
    for (const p of PROIBIDAS) expect(texto).not.toContain(p);
    expect(erros).toEqual([]);
  });

  test('chefia identificada e autoavaliação: avisos próprios; sem comentários na autoavaliação; link inválido e ciclo encerrado', async ({ page, context }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/admin.html');
    const t = await criarCicloApi(page);
    await page.goto('/feedback360.html?t=' + t.chefia);
    await expect(page.locator('.sobretitulo')).toContainText('Identificado e voluntário');
    await expect(page.locator('.f360-quem[data-fonte="chefia"]')).toHaveText('Você responde como chefia de Diego E.: sua resposta aparece identificada.');
    await expect(page.locator('.f360-aviso__lista')).toContainText('Sua resposta aparece identificada.');
    await expect(page.locator('.f360-aviso__lista')).not.toContainText('Seu link é individual');
    await capturar(page, 'resposta-aviso-chefia', { fullPage: true });
    await page.goto('/feedback360.html?t=' + t.auto);
    await expect(page.locator('h1')).toHaveText('Feedback 360 da Liderança · Clínica Exemplo');
    await expect(page.locator('.f360-quem')).toHaveText('Autoavaliação: você responde sobre a sua própria liderança.');
    await expect(page.locator('.f360-aviso__lista')).toContainText('Quem vê o seu relatório:');
    await page.check('#f360-aceite');
    await page.click('[data-acao="continuar"]');
    await expect(page.locator('.f360-legenda li').last()).toHaveText('Não se aplica ao meu trabalho');
    await page.click('[data-acao="comecar"]');
    await expect(page.locator('.progresso-topo')).toContainText('Parte 1 de 7');
    await expect(page.locator('.f360-pergunta__texto').first()).toHaveText('Deixo claro quais são as prioridades da equipe para as próximas semanas.');
    await expect(page.locator('.f360-opcao--fora[data-item="DIR1"]')).toHaveText('Não se aplica ao meu trabalho');
    await page.goto('/feedback360.html?t=' + 'f'.repeat(64));
    await expect(page.locator('h1')).toHaveText('Link inválido');
    await page.goto('/feedback360.html');
    await expect(page.locator('h1')).toHaveText('Link inválido');
    await page.goto('/admin.html');
    const t2 = await page.evaluate(async () => {
      const s = await DISC_API.login('admin@previa.com', 'previa123');
      const l = await DISC_API.f360Listar(s.token, 'emp_previa_clinica');
      const c = l.ciclos.find((x) => x.status === 'aberto');
      const tk = c.convites[0].token;
      await DISC_API.f360Encerrar(s.token, c.id);
      return tk;
    });
    await page.goto('/feedback360.html?t=' + t2);
    await expect(page.locator('h1')).toHaveText(/Feedback 360 encerrado|Link inválido/);
    expect(erros).toEqual([]);
  });

  test('relatório do líder de exemplo no celular: 11 capítulos, régua com palavras, marca confidencial; visão da chefia só com o plano', async ({ page, context }) => {
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/relatorio.html#r-exemplo-360');
    await expect(page.locator('#relatorio')).toHaveAttribute('data-estado', 'pronto');
    await expect(page.locator('#relatorio')).toHaveAttribute('data-modelo', 'feedback360');
    await expect(page.locator('.capa__titulo')).toContainText('Marta E.');
    await expect(page.locator('.capa__rodape')).toContainText('Clínica Exemplo');
    const ids = await page.locator('section[data-secao]').evaluateAll((els) => els.map((e) => e.getAttribute('data-secao')));
    expect(ids).toEqual(['capa', 'indice', 'como-ler', 'resumo', 'temas', 'comportamentos', 'diferencas', 'comentarios', 'estilo', 'equipe', 'plano', 'acompanhamento', 'metodo']);
    await expect(page.locator('.pag-cab__dir').first()).toHaveText('Confidencial · desenvolvimento de Marta E. · não usar em decisões de pessoal');
    await expect(page.locator('.f360-tema')).toHaveCount(6);
    await expect(page.locator('.f360-tema[data-tema="DIR"] .f360-linha--outras .f360-linha__leit')).toHaveText(/frequentemente|sempre ou quase sempre/);
    await expect(page.locator('[data-destaques="manter"] li')).toHaveCount(4);
    const texto = (await page.locator('#relatorio').innerText()).replace(/\s+/g, ' ');
    expect(texto).not.toMatch(/\b[1-5],\d\b|\b[1-5]\.\d\b/);
    expect(texto).toContain('Equipe e outros: 6 de 6 convidados responderam');
    for (const p of PROIBIDAS) expect(texto.toLowerCase()).not.toContain(p);
    await semRolagemLateral(page);
    await capturar(page, 'relatorio-celular', { fullPage: true });
    const ch = await context.newPage();
    const errosCh = coletarErros(ch);
    await ch.setViewportSize({ width: 390, height: 844 });
    await ch.goto('/relatorio.html#r-exemplo-360-chefia');
    await expect(ch.locator('#relatorio')).toHaveAttribute('data-estado', 'pronto');
    await expect(ch.locator('.capa__titulo')).toContainText('Diego E.');
    const idsC = await ch.locator('section[data-secao]').evaluateAll((els) => els.map((e) => e.getAttribute('data-secao')));
    expect(idsC).toEqual(['capa', 'plano', 'acompanhamento']);
    await expect(ch.locator('.f360-linha')).toHaveCount(0);
    await expect(ch.locator('#relatorio')).toContainText('Você vê só o plano de desenvolvimento.');
    await semRolagemLateral(ch);
    await capturar(ch, 'chefia-celular', { fullPage: true });
    expect(erros).toEqual([]);
    expect(errosCh).toEqual([]);
  });
});

test.describe('Feedback 360: painel (computador)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('criar pelo organograma, links individuais, só contagens, encerrar, moderar, devolutiva e publicar', async ({ page, context }) => {
    // O ciclo inteiro (criar → responder → encerrar → moderar → publicar) passa de 60 s em máquina carregada.
    test.slow();
    const erros = coletarErros(page);
    await previa(context);
    await page.goto('/admin.html#empresa/' + EMP + '/feedback360');
    await entrar(page);
    await expect(page.locator('#emp-subaba-feedback360')).toHaveAttribute('aria-current', 'page');
    // Ciclo de exemplo encerrado: Marta e Diego liberados, Paulo sem relatório
    const exemplo = page.locator('.f360p-ciclo[data-status="encerrado"]');
    await expect(exemplo).toHaveCount(1);
    await expect(exemplo.locator('.f360p-pessoa')).toHaveCount(3);
    await expect(exemplo.locator('.f360p-pessoa[data-liberado="nao"]')).toContainText('Paulo M.');
    await expect(exemplo.locator('[data-link="relatorio-lider"]').first()).toContainText('relatorio.html?r=exemplo-360');
    await exemplo.locator('.f360p-pessoa').first().locator('.f360p-resultado summary').click();
    await expect(exemplo.locator('.f360p-quadro').first().locator('thead th')).toHaveText(['Tema / frase', 'Equipe e outros (6)', 'Autoavaliação']);
    await capturar(page, 'painel-encerrado', { fullPage: true });
    // A pesquisa de clima de exemplo precisa estar encerrada (nunca os dois abertos na mesma empresa)
    await page.evaluate(async () => {
      const s = await DISC_API.login('admin@previa.com', 'previa123');
      const cl = await DISC_API.climaListar(s.token, 'emp_previa_clinica');
      for (const r of cl.rodadas.filter((x) => x.status === 'aberta')) await DISC_API.climaEncerrar(s.token, r.id);
    });

    // Novo ciclo: sugestão do organograma, conferência do teto
    await page.click('#btn-f360-novo');
    await expect(page.locator('#janela-f360-novo')).toBeVisible();
    await expect(page.locator('#f360-desenho .f360p-des')).toHaveCount(3);
    await expect(page.locator('#f360-validacao [data-validacao="ok"]')).toContainText('3 pessoa(s) avaliada(s)');
    await capturar(page, 'painel-novo');
    await page.click('#janela-ok');
    await expect(page.locator('#janela-erro')).toContainText('protocolo de relatos');
    await page.fill('#f360-relatos', 'Diretoria administrativa (contrato)');
    await page.click('#janela-ok');
    await expect(page.locator('#janela-f360-novo')).toHaveCount(0);
    const aberto = page.locator('.f360p-ciclo[data-status="aberto"]');
    await expect(aberto).toHaveCount(1);
    await expect(page.locator('#btn-f360-novo')).toHaveCount(0);
    await expect(aberto.locator('#f360-total')).toHaveText(/^0 de \d+ formulários respondidos$/);
    await expect(aberto.locator('.f360p-avisos')).toContainText('não há relatório');
    const diego = aberto.locator('.f360p-avaliado', { hasText: 'Diego E.' });
    await diego.locator('.f360p-links summary').click();
    const links = await diego.locator('tr[data-fonte="equipe"] [data-link="equipe"], tr[data-fonte="colegas"] [data-link="colegas"]').allInnerTexts();
    expect(links.length).toBe(3);
    links.forEach((l) => expect(l).toMatch(/\/feedback360\.html\?t=[0-9a-f]{64}$/));
    const wa = await diego.locator('tr[data-fonte="chefia"] [data-acao="f360-whatsapp"]').getAttribute('href');
    expect(decodeURIComponent(wa)).toContain('aparece identificada');
    await capturar(page, 'painel-aberto', { fullPage: true });

    // 3 respostas (2 da equipe e 1 colega), uma com comentário, num celular
    const cel = await context.newPage();
    await cel.setViewportSize({ width: 390, height: 844 });
    for (let i = 0; i < links.length; i++) {
      await cel.goto(links[i].replace(/^https?:\/\/[^/]+/, ''));
      await cel.check('#f360-aceite');
      await cel.click('[data-acao="continuar"]');
      await cel.click('[data-acao="comecar"]');
      for (let k = 0; k < 6; k++) { await responderTela(cel, 3 + ((i + k) % 3)); await cel.click('[data-acao="proximo"]'); }
      await cel.click('[data-acao="proximo"]');
      if (i === 0) await cel.fill('#f360-AB2', 'Poderia combinar o prazo ao passar uma tarefa.');
      await cel.click('[data-acao="enviar"]');
      await expect(cel.locator('h1')).toHaveText('Respostas enviadas. Obrigado!');
    }
    await cel.close();
    await page.click('#btn-f360-atualizar');
    await expect(diego.locator('[data-fonte="equipe"] strong')).toHaveText('2 de 2');
    await expect(diego.locator('[data-fonte="colegas"] strong')).toHaveText('1 de 1');
    await expect(aberto).not.toContainText('Poderia combinar o prazo');

    // Encerrar
    await aberto.locator('[data-acao="f360-encerrar"]').click();
    await page.click('#confirmar-ok');
    const novo = page.locator('.f360p-ciclo').first();
    await expect(novo).toHaveAttribute('data-status', 'encerrado');
    const pd = novo.locator('.f360p-pessoa', { hasText: 'Diego E.' });
    await expect(pd).toHaveAttribute('data-liberado', 'sim');
    await expect(pd.locator('.f360p-situacao')).toContainText('Colegas e equipe (3)');
    await expect(pd.locator('[data-comentarios="pendentes"]')).toContainText('1 para moderar');
    await expect(pd.locator('[data-acao="f360-publicar-lider"]')).toBeDisabled();
    // Moderar: roteiro + manter
    await pd.locator('[data-acao="f360-moderar"]').click();
    await expect(page.locator('#janela-f360-moderar')).toBeVisible();
    await expect(page.locator('.f360p-roteiro').first()).toContainText('[trecho removido]');
    await expect(page.locator('.f360p-mod')).toHaveCount(1);
    await capturar(page, 'painel-moderar');
    await page.locator('.f360p-mod [data-acao="mod-manter"]').click();
    await expect(page.locator('.f360p-mod__estado')).toHaveText('Mantido');
    await page.click('#janela-ok');
    await expect(pd.locator('[data-comentarios="ok"]')).toBeVisible();
    // Devolutiva e plano
    await pd.locator('[data-acao="f360-devolutiva"]').click();
    await expect(page.locator('#janela-f360-devolutiva')).toBeVisible();
    await page.fill('#f360-dev-temas', 'Combinar prazos ao delegar');
    await page.selectOption('#f360-dev-item-0', 'DIR2');
    await page.fill('#f360-dev-acao-0', 'Ao delegar, combinar o resultado e o prazo');
    await expect(page.locator('.f360p-menu')).toContainText('Ideias de ação · Direção e decisões');
    await page.click('[data-acao="f360-sugerir-datas"]');
    await page.check('#f360-dev-feita');
    await capturar(page, 'painel-devolutiva');
    await page.click('#janela-ok');
    await expect(page.locator('#janela-f360-devolutiva')).toHaveCount(0);
    await expect(pd.locator('[data-devolutiva="feita"]')).toBeVisible();
    // Publicar o relatório do líder e a visão da chefia e abrir pelos links
    await pd.locator('[data-acao="f360-publicar-lider"]').click();
    const linkL = pd.locator('[data-link="relatorio-lider"]');
    await expect(linkL).toContainText('relatorio.html?r=');
    await pd.locator('[data-acao="f360-publicar-chefia"]').click();
    const linkC = pd.locator('[data-link="relatorio-chefia"]');
    await expect(linkC).toContainText('relatorio.html?r=');
    await capturar(page, 'painel-publicado', { fullPage: true });
    const rel = await context.newPage();
    await rel.goto((await linkL.innerText()).replace(/^https?:\/\/[^/]+/, ''));
    await expect(rel.locator('#relatorio')).toHaveAttribute('data-modelo', 'feedback360');
    await expect(rel.locator('#relatorio')).toContainText('Poderia combinar o prazo ao passar uma tarefa.');
    await expect(rel.locator('#relatorio')).toContainText('Combinar prazos ao delegar');
    await expect(rel.locator('[data-destaques="manter"]')).toContainText('Frase por frase só aparece com 5 respostas ou mais');
    await rel.goto((await linkC.innerText()).replace(/^https?:\/\/[^/]+/, ''));
    await expect(rel.locator('#relatorio')).toContainText('Ao delegar, combinar o resultado e o prazo');
    await expect(rel.locator('#relatorio')).not.toContainText('Poderia combinar o prazo');
    await rel.close();
    expect(erros).toEqual([]);
  });
});
