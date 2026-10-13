'use strict';
// Subaba "Andamento" da empresa no painel (computador, 1280 px), na prévia (API simulada, Clínica Exemplo): resumo por
// instrumento, quadro por pessoa na ordem do organograma (DISC e parte 2 por pessoa; 360 só como avaliado e em números de
// grupo), lembretes do teste DISC e a pesquisa de clima só por equipe. Confidencialidade: nenhuma célula por pessoa de clima,
// o bloco do clima só com números e nomes de equipe/líder (mesmo numa pesquisa identificada) e, no 360, quem avalia aparece só
// com "N links (confidencial)" — a linha dela não muda quando ela responde.
// ANDAMENTO_CAPTURAS=<pasta> salva os prints para a revisão do dono (andamento-*.png).
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { coletarErros } = require('./util');

const CAPTURAS = process.env.ANDAMENTO_CAPTURAS || '';
const CONFIG_PREVIA = 'window.CONFIG = ' + JSON.stringify({ API_URL: 'simulada', BACKEND: 'simulada', WHATSAPP_RECRUTADOR: '', EMPRESA: '',
  MOSTRAR_RESULTADO_AO_CANDIDATO: false, GRUPOS_DEMONSTRACAO: 0 }) + ';';
const EMP = 'emp_previa_clinica';
const ORDEM = ['Marta Exemplo Diretora', 'Diego Exemplo Simulado', 'Carla Modelo Demonstração', 'Lucas Fictício Exemplo', 'Paulo Modelo Fictício',
  'Renata Exemplo Fictícia', 'Tiago Modelo Sem Teste'];

test.use({ viewport: { width: 1280, height: 900 } });

async function capturar(page, nome, opcoes) {
  if (!CAPTURAS) return;
  await page.screenshot(Object.assign({ path: path.join(CAPTURAS, 'andamento-' + nome + '.png') }, opcoes || {}));
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
function linha(page, nome) { return page.locator('#and-tabela tbody tr', { has: page.locator('.and-pessoa__nome', { hasText: nome }) }); }
function erroSemSrcdoc(erros) { return erros.filter((e) => !/Blocked script execution in 'about:srcdoc'/.test(e)); }

// Nada de clima por pessoa: nenhuma coluna/célula de clima na tabela; o bloco do clima só com números e "Equipe de X Y.".
async function conferirClimaSemPessoas(page) {
  await expect(page.locator('#and-tabela [data-col*="clima"]')).toHaveCount(0);
  await expect(page.locator('#and-tabela thead')).not.toContainText(/clima/i);
  await expect(page.locator('#and-tabela tbody')).not.toContainText(/clima/i);
  const texto = await page.locator('#and-clima').innerText();
  const semEquipes = texto.replace(/Equipe de [A-ZÀ-Ú][a-zà-ú]+ [A-Z]\./g, '');
  for (const nome of ORDEM) {
    expect(texto, nome).not.toContain(nome);
    expect(semEquipes, 'nome fora do nome da equipe: ' + nome).not.toContain(nome.split(' ')[0]);
  }
  // Por equipe, só "N de M" e a barra.
  for (const n of await page.locator('#and-clima .and-clima-equipe__n').allInnerTexts()) expect(n).toMatch(/^\d+ de \d+$/);
}

test('prévia: resumo, quadro por pessoa na ordem do organograma, lembretes do DISC e clima só por equipe', async ({ page, context }) => {
  const erros = coletarErros(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await previa(context);
  await page.goto('/admin.html#empresa/' + EMP + '/andamento');
  await entrar(page);
  await expect(page.locator('#emp-subaba-andamento')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#emp-subabas .subaba')).toHaveText([/^Colaboradores\s*7$/, 'Andamento', 'Organograma', 'Compatibilidade', 'Relatórios', 'Pesquisa de clima', 'Feedback 360', /^Histórico\s*1$/]);
  // As 8 subabas cabem numa linha a 1280 px, com folga para a barra de rolagem do Windows (15 px).
  await page.evaluate(() => document.fonts.ready);
  const [altura, sobra] = await page.locator('#emp-subabas').evaluate((n) => [n.getBoundingClientRect().height,
    n.parentElement.getBoundingClientRect().width - [...n.children].reduce((t, b) => t + b.getBoundingClientRect().width + 2, 8)]);
  expect(altura).toBeLessThan(60);
  expect(sobra).toBeGreaterThan(15);

  // Resumo: uma linha por instrumento
  const resumo = page.locator('#and-resumo');
  await expect(resumo.locator('[data-instrumento="disc"]')).toContainText('Teste DISC (Equipe comercial): 6 de 7 colaboradores responderam · falta 1 · parte 2: 6 de 7');
  await expect(resumo.locator('[data-instrumento="clima"]')).toContainText('Pesquisa de clima · set/2026: encerrada · 19 de 23 responderam (83%) · anônima');
  await expect(resumo.locator('[data-instrumento="f360"]')).toContainText('Feedback 360 · ago/2026: encerrado · 2 de 3 líderes com relatório liberado · 2 devolutivas feitas');

  // Quadro por pessoa: ordem do organograma (topo, equipe de Diego, equipe de Paulo)
  await expect(page.locator('#and-tabela thead th')).toHaveText(['Pessoa', 'Cargo', 'Equipe', 'Teste DISC', 'Parte 2', 'Feedback 360 como avaliado(a)']);
  await expect(page.locator('#and-tabela tbody .and-pessoa__nome')).toHaveText(ORDEM);
  await expect(linha(page, 'Marta').locator('[data-col="equipe"]')).toContainText('Topo');
  await expect(linha(page, 'Carla').locator('[data-col="equipe"]')).toContainText('Equipe de Diego E.');
  await expect(linha(page, 'Diego').locator('[data-col="equipe"]')).toContainText('lidera 2');
  await expect(linha(page, 'Carla').locator('[data-col="disc"]')).toContainText(/✓ Respondeu\s*em \d{2}\/\d{2}/);
  await expect(linha(page, 'Carla').locator('[data-col="parte2"]')).toContainText('✓ Respondeu');
  // 360 como avaliado(a): só os 3 líderes; quem só avalia tem "—"
  await expect(linha(page, 'Marta').locator('[data-col="f360"]')).toContainText('Relatório liberado');
  await expect(linha(page, 'Marta').locator('[data-col="f360"]')).toContainText(/Devolutiva em \d{2}\/\d{2} · relatório do líder publicado/);
  await expect(linha(page, 'Paulo').locator('[data-col="f360"]')).toContainText('Sem relatório');
  for (const nome of ['Carla', 'Lucas', 'Renata', 'Tiago']) await expect(linha(page, nome).locator('[data-col="f360"]')).toHaveText('—');
  await expect(page.locator('#and-tabela [data-col="links360"]')).toHaveCount(0); // ciclo encerrado: nada de "recebe links"

  // Tiago ainda não fez o teste: Falta, WhatsApp com o número do cadastro e a mensagem pronta, Copiar link
  const tiago = linha(page, 'Tiago');
  await expect(tiago).toHaveAttribute('data-disc', 'falta');
  await expect(tiago.locator('[data-col="disc"] .and-selo--falta')).toHaveText('Falta');
  await expect(tiago.locator('[data-col="parte2"]')).toContainText('vem junto com o teste');
  const wa = await tiago.locator('[data-acao="and-whatsapp"]').getAttribute('href');
  expect(wa).toMatch(/^https:\/\/wa\.me\/5511900000010\?text=/);
  const msg = decodeURIComponent(wa.split('?text=')[1]);
  expect(msg).toMatch(/^Olá, Tiago! Lembrete: a Clínica Exemplo está fazendo uma avaliação de perfil da equipe, conduzida pela Gestão sem Caos/);
  expect(msg).toMatch(/index\.html\?a=EQP1\n\nLeva cerca de 15 minutos/);
  await expect(page.locator('#and-clima .and-clima-rodada')).toHaveCount(1);
  await capturar(page, 'tela');   // antes de copiar (sem o aviso flutuante por cima)
  await capturar(page, 'pagina', { fullPage: true });
  await tiago.locator('[data-acao="and-copiar-link"]').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/index\.html\?a=EQP1$/);
  await page.click('#btn-and-lembrete');
  const lembrete = await page.evaluate(() => navigator.clipboard.readText());
  expect(lembrete).toContain('Ainda falta a resposta de: Tiago M. Responda pelo link abaixo:');
  expect(lembrete).toMatch(/index\.html\?a=EQP1/);
  for (const nome of ORDEM.filter((n) => !n.startsWith('Tiago'))) expect(lembrete).not.toContain(nome.split(' ')[0]);

  // Clima por equipe: só contagens e o aviso de anonimato
  const rodada = page.locator('#and-clima .and-clima-rodada');
  await expect(rodada).toHaveCount(1);
  await expect(rodada).toHaveAttribute('data-modo', 'anonima');
  await expect(rodada.locator('.and-clima-equipe')).toHaveText([/Equipe de Marta E\..*2 de 3/s, /Equipe de Diego E\..*11 de 12/s, /Equipe de Paulo M\..*6 de 8/s]);
  await expect(rodada.locator('.and-clima-nota')).toHaveText('Anônima: o painel não mostra quem respondeu, só a contagem por equipe.');
  await conferirClimaSemPessoas(page);
  await expect(page.locator('#and-legenda')).toContainText('Por que a pesquisa de clima e quem avalia no Feedback 360 não aparecem por pessoa');
  await expect(page.locator('#vista-empresas')).not.toContainText(/notus/i);
  const larg = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(larg[0]).toBeLessThanOrEqual(larg[1]);

  // Atalhos: "Ver pesquisa de clima" leva à subaba; Voltar do navegador volta ao Andamento
  await resumo.locator('[data-instrumento="clima"] [data-acao="and-ir-clima"]').click();
  await expect(page.locator('#emp-subaba-clima')).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/#empresa\/emp_previa_clinica\/clima$/);
  await page.goBack();
  await expect(page.locator('#emp-subaba-andamento')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#and-tabela')).toBeVisible();
  expect(erroSemSrcdoc(erros)).toEqual([]);
});

test('pesquisa de clima identificada com respostas identificadas: o quadro não mostra quem respondeu (só o caminho para o uso interno)', async ({ page, context }) => {
  const erros = coletarErros(page);
  await previa(context);
  await page.goto('/admin.html#empresa/' + EMP + '/andamento');
  // Rodada identificada (só links pessoais); Carla e Renata respondem COM identificação.
  await page.evaluate(async () => {
    const s = await DISC_API.login('admin@previa.com', 'previa123');
    const eq = await DISC_API.listarEquipe(s.token, 'emp_previa_clinica');
    const id = (n) => eq.colaboradores.find((c) => c.nome.startsWith(n)).pessoaId;
    const r = await DISC_API.climaCriarRodada(s.token, { empresaId: 'emp_previa_clinica', nome: 'Pesquisa de clima · out/2026', modo: 'identificada', metodos: [],
      equipes: [{ liderId: id('Marta') }, { liderId: id('Diego') }, { liderId: id('Paulo') }] });
    const tk = {};
    r.rodada.equipes.forEach((e) => e.convites.forEach((c) => { tk[c.nome.split(' ')[0]] = c.token; }));
    let n = 0;
    for (const quem of ['Carla', 'Renata']) {
      n += 1;
      await DISC_API.climaEnviar(tk[quem], { itens: { A1: 4, A2: 4, B1: 3 }, chave: String(n).repeat(32), identificar: true });
    }
  });
  await entrar(page);
  await expect(page.locator('#emp-subaba-andamento')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#and-resumo [data-instrumento="clima"]')).toContainText('Pesquisa de clima · out/2026: aberta · 2 de 6 responderam (33%) · identificada');
  const aberta = page.locator('#and-clima .and-clima-rodada[data-status="aberta"]');
  await expect(aberta).toHaveAttribute('data-modo', 'identificada');
  await expect(aberta.locator('.and-clima-equipe')).toHaveText([/Equipe de Marta E\..*0 de 2/s, /Equipe de Diego E\..*1 de 2/s, /Equipe de Paulo M\..*1 de 2/s]);
  await expect(aberta.locator('.and-clima-nota')).toContainText('Os nomes de quem se identificou ficam só na tela "Identificação (uso interno)"');
  await expect(page.locator('#and-clima')).not.toContainText(/com identificação|identificadas/i); // nem a contagem de identificadas
  await conferirClimaSemPessoas(page);
  await capturar(page, 'clima-identificada', { fullPage: true });
  // Linhas de Carla e Renata (responderam com nome) e de Lucas e Tiago (não responderam) têm as mesmas colunas e nada de clima.
  for (const nome of ['Carla', 'Renata', 'Lucas', 'Tiago']) {
    const cels = await linha(page, nome).locator('th, td').evaluateAll((ns) => ns.map((n) => n.getAttribute('data-col')));
    expect(cels).toEqual(['pessoa', 'cargo', 'equipe', 'disc', 'parte2', 'f360']);
  }
  // O único caminho é a subaba Pesquisa de clima (a tela de uso interno registra cada abertura).
  await aberta.locator('[data-acao="and-ir-clima"]').click();
  await expect(page.locator('#emp-subaba-clima')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-acao="clima-uso-interno"]').first()).toBeVisible();
  expect(erroSemSrcdoc(erros)).toEqual([]);
});

test('Feedback 360 aberto: líder avaliado com números de grupo; quem avalia só "N links (confidencial)" e a linha não muda quando responde', async ({ page, context }) => {
  const erros = coletarErros(page);
  await previa(context);
  await page.goto('/admin.html#empresa/' + EMP + '/andamento');
  const tokens = await page.evaluate(async () => {
    const s = await DISC_API.login('admin@previa.com', 'previa123');
    const emp = 'emp_previa_clinica';
    const eq = await DISC_API.listarEquipe(s.token, emp);
    const sug = DISC_F360.sugerirDesenho(eq.colaboradores, eq.relacoes, eq.topoIds);
    const r = await DISC_API.f360CriarCiclo(s.token, { empresaId: emp, nome: 'Feedback 360 · out/2026', contatoRelatos: 'Diretoria (contrato)',
      avaliados: sug.avaliados.map((a) => ({ pessoaId: a.pessoaId, chefia: a.chefia, equipe: a.equipe, colegas: a.colegas, outros: a.outros })) });
    const carla = eq.colaboradores.find((c) => c.nome.startsWith('Carla')).pessoaId;
    const diego = r.ciclo.avaliados.find((a) => a.nome.startsWith('Diego'));
    const deCarla = r.ciclo.convites.find((c) => c.pessoaId === carla && c.avaliadoId === diego.id);
    const porPessoa = {};
    r.ciclo.convites.forEach((c) => { porPessoa[c.pessoaId] = (porPessoa[c.pessoaId] || 0) + 1; });
    return { carla: deCarla.token, linksCarla: porPessoa[carla] };
  });
  await entrar(page);
  await expect(page.locator('#and-resumo [data-instrumento="f360"]')).toContainText(/Feedback 360 · out\/2026: coleta aberta · 0 de \d+ formulários respondidos · encerramento previsto \d{2}\/\d{2}/);
  await expect(page.locator('#and-tabela thead th')).toHaveText(['Pessoa', 'Cargo', 'Equipe', 'Teste DISC', 'Parte 2', 'Feedback 360 como avaliado(a)', 'Links do 360 que recebe']);
  const diego = linha(page, 'Diego');
  await expect(diego.locator('[data-col="f360"]')).toContainText('Coleta aberta');
  await expect(diego.locator('[data-col="f360"]')).toContainText('Colegas, equipe e outros: 0 de 3');
  await expect(linha(page, 'Carla').locator('[data-col="f360"]')).toHaveText('—');
  await expect(linha(page, 'Carla').locator('[data-col="links360"]')).toHaveText(tokens.linksCarla + (tokens.linksCarla === 1 ? ' link' : ' links') + 'confidencial');
  for (const t of await page.locator('#and-tabela tbody [data-col="links360"]').allInnerTexts()) expect(t.replace(/\s+/g, ' ').trim()).toMatch(/^(\d+ links? confidencial|—)$/);
  for (const t of await page.locator('#and-tabela tbody [data-col="links360"], #and-tabela tbody [data-col="f360"]').allInnerTexts()) expect(t).not.toMatch(/respond/i);
  const antes = await linha(page, 'Carla').innerText();
  await capturar(page, 'f360-aberto', { fullPage: true });

  // Carla responde sobre Diego: só o número de grupo de Diego muda; a linha dela continua igual.
  await page.evaluate(async (t) => { await DISC_API.f360Enviar(t, { itens: { DIR1: 4, DIR2: 4, FBK1: 3 }, segundos: 300 }); }, tokens.carla);
  await page.click('#btn-and-atualizar');
  await expect(diego.locator('[data-col="f360"]')).toContainText('Colegas, equipe e outros: 1 de 3');
  await expect(page.locator('#and-resumo [data-instrumento="f360"]')).toContainText(/coleta aberta · 1 de \d+ formulários respondidos/);
  expect(await linha(page, 'Carla').innerText()).toBe(antes);
  await expect(page.locator('#and-legenda')).toContainText('nunca se respondeu');
  expect(erroSemSrcdoc(erros)).toEqual([]);
});

test('estados vazios: sem link da equipe ("Crie o link do teste da equipe"), sem clima e sem 360', async ({ page, context }) => {
  const erros = coletarErros(page);
  await previa(context);
  await page.goto('/admin.html');
  const empId = await page.evaluate(async () => {
    const s = await DISC_API.login('admin@previa.com', 'previa123');
    const e = (await DISC_API.salvarEmpresa(s.token, { nome: 'Padaria Modelo', cidade: 'Boa Vista / RR', observacoes: 'Empresa fictícia da prévia, sem link de equipe.', ativo: true })).empresa;
    await DISC_API.salvarColaborador(s.token, { empresaId: e.id, nome: 'Joana Exemplo Prévia', telefone: '11955550001', cargo: 'Padeira', area: 'Produção' });
    await DISC_API.salvarColaborador(s.token, { empresaId: e.id, nome: 'Rui Modelo Fictício', telefone: '11955550002', cargo: 'Atendente', area: 'Loja' });
    return e.id;
  });
  await page.goto('/admin.html#empresa/' + empId + '/andamento');
  await entrar(page);
  await expect(page.locator('#emp-subaba-andamento')).toHaveAttribute('aria-current', 'page');
  const resumo = page.locator('#and-resumo');
  await expect(resumo.locator('[data-instrumento="disc"]')).toContainText('Teste DISC: 0 de 2 colaboradores responderam · faltam 2 · ainda não há link do teste da equipe');
  await expect(page.locator('#btn-and-lembrete')).toHaveCount(0);
  await expect(resumo.locator('[data-instrumento="clima"]')).toContainText('Pesquisa de clima: nenhuma pesquisa nesta empresa ainda');
  await expect(resumo.locator('[data-instrumento="f360"]')).toContainText('Feedback 360: nenhum ciclo nesta empresa ainda');
  await expect(page.locator('#and-clima-vazio')).toContainText('Nenhuma pesquisa de clima nesta empresa ainda.');
  await expect(page.locator('#and-tabela tbody .and-pessoa__nome')).toHaveText(['Joana Exemplo Prévia', 'Rui Modelo Fictício']);
  await expect(linha(page, 'Joana').locator('[data-col="equipe"]')).toHaveText('Sem posição no organograma');
  await expect(linha(page, 'Joana').locator('[data-col="disc"]')).toHaveText('Falta');
  await expect(linha(page, 'Joana').locator('[data-acao="and-whatsapp"]')).toHaveCount(0);
  await expect(linha(page, 'Joana').locator('[data-col="parte2"]')).toHaveText('—');
  await capturar(page, 'vazio', { fullPage: true });
  // O atalho é o mesmo da aba Colaboradores: formulário do processo já como avaliação de equipe desta empresa
  await page.click('#btn-and-criar-link');
  await expect(page.locator('#form-processo')).toBeVisible();
  await expect(page.locator('#proc-tipo')).toHaveAttribute('value', 'equipe');
  await expect(page.locator('#proc-empresa')).toHaveValue('Padaria Modelo');
  expect(erroSemSrcdoc(erros)).toEqual([]);
});
