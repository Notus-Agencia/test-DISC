// Vagas sem Caos — testes de habilidade no celular (projeto vagas-celular, Pixel 5), sobre a PRÉVIA com a prova de
// DEMONSTRAÇÃO (questões escritas só para a prévia; nunca as reais): catálogo, instruções com os textos fixos, prova com uma
// questão por tela, "Responder" explícito, tempo do servidor, "Reconectando…" sem perder a resposta, encerrar com confirmação,
// sinais só registrados, resultado com e sem selo, vagas que pedem o selo e a conferência pública (selo.html).
// Nada aqui depende do nome ou do slug da cidade da semente: as contas de prova são criadas pelo próprio cadastro da prévia.
const { test, expect } = require('@playwright/test');

const BASE = '/vagas/';
// Diretriz da psicologia (onda 2): em toda tela de testes.
const OPCIONAL = 'O teste é opcional: você pode se candidatar sem ele. Se não for bem, a empresa não fica sabendo; ela só vê o selo, se você ganhar.';

// O "banco" da prévia fica no localStorage ('vagas_previa_v<N>'): os testes leem a versão mais nova, sem fixar o número.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__estadoPrevia = function () {
      const chaves = Object.keys(localStorage).filter((k) => /^vagas_previa_v\d+$/.test(k))
        .sort((a, b) => Number(b.split('_v').pop()) - Number(a.split('_v').pop()));
      return chaves.length ? JSON.parse(localStorage.getItem(chaves[0])) : null;
    };
  });
});

function coletarErros(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404 \(Not Found\)/.test(m.text())) erros.push('console: ' + m.text()); });
  return erros;
}
// Conta nova de pessoa pela prévia (cadastro -> link do e-mail): já entra logada.
async function contaNova(page) {
  await page.goto(BASE + 'selo.html');
  const email = await page.evaluate(async () => {
    const email = 'e2e.' + Date.now() + '.' + Math.random().toString(36).slice(2, 8) + '@exemplo.com';
    const r = await VAGAS_API.cadastrar({ email, tipo: 'pessoa', nome: 'Pessoa de Teste' });
    await VAGAS_API.confirmarLink(VAGAS_API.linkDoEndereco({ search: '?' + r.linkPrevia.split('?')[1] }));
    return email;
  });
  return email;
}
// Posição MOSTRADA da alternativa certa (ou de uma errada) na questão atual, lida do "banco" da prévia neste navegador.
async function posicao(page, certo) {
  return page.evaluate((certo) => {
    const st = window.__estadoPrevia();
    const tt = st.provaDemo.tentativas.filter((t) => t.status === 'aberta').pop();
    const item = tt.itens[tt.respondidas];
    const q = VAGAS_PREVIA.TESTES_DEMONSTRACAO.flatMap((t) => t.questoes).find((x) => x.id === item.id);
    const pos = item.alt.indexOf(q.correta);
    return certo ? pos : (pos + 1) % 4;
  }, certo);
}
async function responder(page, numero, certo) {
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', String(numero));
  await page.click('#vg-prova-opcoes button[data-opcao="' + (await posicao(page, certo)) + '"]');
  await page.click('#vg-prova-responder');
}
async function comecar(page, slug) {
  await page.goto(BASE + 'testes.html#teste/' + slug);
  await expect(page.locator('#vg-instrucoes-titulo')).toBeVisible();
  await page.click('#vg-prova-comecar');
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', '1');
}
async function semRolagemLateral(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}
// Ganha um selo pelas próprias RPCs (para a conferência pública).
async function ganharSelo(page, slug) {
  return page.evaluate(async (slug) => {
    const ini = await VAGAS_API.iniciarTentativa(slug);
    const id = ini.tentativa.id;
    await VAGAS_API.proximaQuestao(id);
    const banco = VAGAS_PREVIA.TESTES_DEMONSTRACAO.flatMap((t) => t.questoes);
    for (let n = 1; n <= 15; n++) {
      const tt = window.__estadoPrevia().provaDemo.tentativas.find((t) => t.id === id);
      const item = tt.itens[tt.respondidas];
      await VAGAS_API.responder(id, n, item.alt.indexOf(banco.find((x) => x.id === item.id).correta));
    }
    return (await VAGAS_API.finalizar(id)).resultado.selo.codigo;
  }, slug);
}

test('catálogo sem login: 5 testes, faixa de demonstração e textos fixos; instruções mandam entrar; a prova pede login', async ({ page }) => {
  const erros = coletarErros(page);
  await page.goto(BASE + 'testes.html');
  await expect(page.locator('#vg-faixa-demo')).toHaveText('Questões de demonstração (a prova real usa outro banco)');
  // Uma faixa só: a das questões entra dentro da faixa geral da prévia.
  await expect(page.locator('.faixa-demo')).toHaveCount(1);
  await expect(page.locator('#vg-faixa-previa #vg-faixa-demo')).toHaveCount(1);
  await expect(page.locator('#vg-testes-lista > li.vg-teste')).toHaveCount(5);
  for (const slug of ['atendimento', 'vendas', 'administrativo', 'caixa', 'portugues']) await expect(page.locator('#vg-teste-' + slug)).toBeVisible();
  await expect(page.locator('#vg-teste-caixa-info')).toContainText('25 min · pode usar papel e caneta');
  await expect(page.locator('#vg-teste-vendas-info')).toContainText('15 questões · 20 min');
  await expect(page.locator('#vg-testes-titulo')).toHaveText('Testes');
  await expect(page.locator('#app')).toContainText('Mostre o que você sabe fazer: faça o teste da função no celular e ganhe o selo de habilidade testada.');
  await expect(page.locator('#vg-testes-aviso')).toContainText('não mede inteligência nem personalidade. Nenhuma vaga pode cobrar por eles.');
  await expect(page.locator('#vg-testes-entrar-aviso')).toContainText('Entre na sua conta para fazer o teste.');
  await expect(page.locator('#vg-testes-subtitulo')).toContainText('Grátis, no celular, de 20 a 25 minutos cada.');
  await expect(page.locator('#vg-testes-opcional')).toHaveText(OPCIONAL);
  await expect(page.locator('#app')).not.toContainText('15 min');
  await expect(page.locator('#vg-nav')).toHaveCount(0);
  expect(await semRolagemLateral(page)).toBe(true);
  await page.click('#vg-teste-caixa-acao');
  await expect(page.locator('#vg-instrucoes-titulo')).toHaveText('Caixa e matemática prática');
  await expect(page.locator('#vg-instrucoes-titulo')).toBeFocused();
  await expect(page.locator('#vg-instrucoes-lista')).toContainText('Pode usar papel e caneta para as contas. Não use calculadora.');
  await expect(page.locator('#vg-instrucoes-opcional')).toHaveText(OPCIONAL);
  await expect(page.locator('#vg-prova-comecar')).toHaveText('Entrar para começar');
  await expect(page.locator('#vg-prova-comecar')).toHaveAttribute('href', 'entrar.html?voltar=' + encodeURIComponent('testes.html#teste/caixa'));
  // "Pular para o conteúdo" (#app) não é rota: a pessoa continua nas instruções.
  await page.focus('.pular');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#teste\/caixa$/);
  await expect(page.locator('#vg-instrucoes-titulo')).toHaveText('Caixa e matemática prática');
  await page.goto(BASE + 'testes.html#prova');
  await page.waitForURL(/entrar\.html\?voltar=testes\.html%23prova/);
  expect(erros).toEqual([]);
});

test('conta de empresa: os testes são para a conta de pessoa', async ({ page }) => {
  await page.goto(BASE + 'entrar.html?voltar=' + encodeURIComponent('testes.html') + '#entrar');
  await page.fill('#vg-entrar-email', 'empresa@previa.com');
  await page.fill('#vg-entrar-senha', 'previa123');
  await page.click('#vg-entrar-enviar');
  await page.waitForURL(/testes\.html$/);
  await expect(page.locator('#app h1')).toHaveText('Esta área é para quem procura emprego.');
  await expect(page.locator('#vg-trocar-conta')).toBeVisible();
});

test('prova inteira com selo: textos fixos, uma questão por tela, "Responder" só depois de escolher, resultado com selo; depois espera 30 dias', async ({ page }) => {
  const erros = coletarErros(page);
  await contaNova(page);
  await page.goto(BASE + 'testes.html');
  await expect(page.locator('#vg-nav-testes')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#vg-teste-vendas')).toHaveAttribute('data-acao', 'fazer');
  await page.click('#vg-teste-vendas-acao');
  await expect(page.locator('#vg-instrucoes-titulo')).toHaveText('Vendas no varejo');
  // Texto fixo de padroes.md §5.7 (palavra por palavra) e o que a prova registra (LGPD).
  await expect(page.locator('#vg-instrucoes-sozinho')).toHaveText('Faça sozinho(a), sem consultar. A empresa pode pedir a prova presencial. O teste mede o que você sabe hoje do básico da função; não mede inteligência nem personalidade. Pode refazer em 30 dias.');
  await expect(page.locator('#vg-instrucoes-lista')).toContainText('Durante a prova, registramos o tempo de cada questão, a saída da tela e a cópia de texto. Ninguém perde o selo só por isso');
  await expect(page.locator('#vg-instrucoes-lista')).toContainText('Se você encerrar antes de responder tudo, a tentativa conta');
  await expect(page.locator('#vg-instrucoes-lista')).not.toContainText('calculadora');
  expect(await semRolagemLateral(page)).toBe(true);
  await page.click('#vg-prova-comecar');
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', '1');
  await expect(page).toHaveURL(/#prova$/);
  await expect(page.locator('#vg-prova-numero')).toContainText('1 de 15');
  await expect(page.locator('#vg-prova-tempo')).toHaveAttribute('role', 'timer');
  await expect(page.locator('#vg-prova-segundos')).toHaveText(/^(20:00|19:5\d)$/);
  await expect(page.locator('#vg-prova-enunciado')).toBeFocused();
  await expect(page.locator('#vg-prova-opcoes button')).toHaveCount(4);
  await expect(page.locator('#vg-barra-prova .barra-dica')).toHaveText('Depois de responder não dá para voltar.');
  await expect(page.locator('#vg-nav')).toHaveCount(0);
  await expect(page.locator('#vg-prova-responder')).toBeDisabled();
  await expect(page.locator('#vg-prova-opcional')).toHaveText(OPCIONAL);
  expect(await semRolagemLateral(page)).toBe(true);
  // Trocar de alternativa antes de responder pode; só uma fica marcada.
  await page.click('#vg-prova-opcoes button[data-opcao="0"]');
  await page.click('#vg-prova-opcoes button[data-opcao="2"]');
  await expect(page.locator('#vg-prova-opcoes [aria-checked="true"]')).toHaveCount(1);
  await expect(page.locator('#vg-prova-opcoes button[data-opcao="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vg-prova-responder')).toBeEnabled();
  for (let n = 1; n <= 15; n++) await responder(page, n, n <= 12);
  await expect(page.locator('#vg-resultado-titulo')).toHaveText('Você ganhou o selo');
  await expect(page).toHaveURL(/#resultado\//);
  await expect(page.locator('#vg-resultado')).toHaveAttribute('data-selo', 'sim');
  await expect(page.locator('#vg-selo .vg-selo')).toContainText('Habilidade testada');
  await expect(page.locator('#vg-selo .vg-selo')).toContainText('Nota 80 de 100 (15 questões; margem de cerca de ±10 pontos)');
  await expect(page.locator('#vg-selo .vg-selo')).toContainText('online, sem supervisão');
  await expect(page.locator('#vg-selo-codigo')).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await expect(page.locator('#vg-resultado-nota')).toContainText('Você acertou 12 de 15 questões. Nota 80 (±10).');
  await expect(page.locator('#vg-resultado-partes > li')).toHaveCount(5);
  await expect(page.locator('#vg-resultado-partes')).toContainText(/\d de \d/);
  await expect(page.locator('#vg-resultado-limites')).toHaveText('O teste mede conhecimento prático. Não mede inteligência, personalidade nem caráter, e não garante desempenho.');
  await expect(page.locator('#vg-resultado-vagas')).toHaveText(/^Ver (vagas|\d+ vagas? que pedem? este selo)$/);
  await expect(page.locator('#vg-resultado-compartilhar')).toBeVisible();
  await expect(page.locator('#vg-resultado-estudar')).toHaveCount(0);
  await expect(page.locator('#vg-nav-testes')).toBeVisible();
  expect(await semRolagemLateral(page)).toBe(true);
  // Compartilhar sem navigator.share: copia o link da conferência pública.
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }); });
  await page.click('#vg-resultado-compartilhar');
  await expect(page.locator('#vg-aviso-geral')).toContainText(/Copiado|copiar/);
  // De volta ao catálogo: selo e espera de 30 dias; as instruções não deixam começar.
  await page.click('#vg-resultado-voltar');
  await expect(page.locator('#vg-teste-vendas')).toHaveAttribute('data-acao', 'aguardar');
  await expect(page.locator('#vg-teste-vendas')).toContainText('Selo');
  await expect(page.locator('#vg-teste-vendas-acao')).toHaveText('Em 30 dias');
  await expect(page.locator('#vg-teste-vendas-info')).toContainText(/Selo válido até \d{2}\/\d{2}\/\d{4} · nota 80 \(±10\) · pode refazer a partir de \d{2}\/\d{2}\/\d{4}/);
  await page.goto(BASE + 'testes.html#teste/vendas');
  await expect(page.locator('#vg-instrucoes-aguardar')).toContainText(/Você pode fazer de novo a partir de \d{2}\/\d{2}\/\d{4}\./);
  await expect(page.locator('#vg-prova-comecar')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('sem selo: "Prova concluída", texto fixo de padroes.md §5.3, onde acertou menos e quando refazer; nunca "aprovado"', async ({ page }) => {
  await contaNova(page);
  await comecar(page, 'portugues');
  for (let n = 1; n <= 15; n++) await responder(page, n, n <= 3);
  await expect(page.locator('#vg-resultado-titulo')).toHaveText('Prova concluída');
  await expect(page.locator('#vg-resultado-sem-selo')).toHaveText('Ainda sem selo neste teste. Você pode refazer em 30 dias, de graça.');
  await expect(page.locator('#vg-resultado-opcional')).toHaveText(OPCIONAL);
  await expect(page.locator('#vg-resultado-nota')).toContainText('Você acertou 3 de 15 questões. Nota 20 (±10).');
  await expect(page.locator('#vg-resultado-nota')).toContainText('O selo sai a partir da nota 60.');
  await expect(page.locator('#vg-resultado-refazer')).toHaveText(/^Você pode refazer este teste a partir de \d{2}\/\d{2}\/\d{4}, de graça\.$/);
  await expect(page.locator('#vg-resultado-estudar')).toHaveText(/^Onde você acertou menos: .+\.$/);
  await expect(page.locator('#vg-resultado-partes > li')).toHaveCount(4);
  await expect(page.locator('#vg-selo')).toHaveCount(0);
  await expect(page.locator('#vg-resultado-compartilhar')).toHaveCount(0);
  const texto = await page.locator('body').innerText();
  expect(texto).not.toMatch(/aprovad|reprovad|percentil|ranking/i);
  expect(await semRolagemLateral(page)).toBe(true);
});

test('internet cai ao responder: "Reconectando…", a resposta fica guardada e vai sozinha; recarregar volta na mesma questão com a escolha', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await contaNova(page);
  await comecar(page, 'atendimento');
  await page.evaluate(() => {
    const original = VAGAS_API.responder;
    let falhas = 2;
    VAGAS_API.responder = function () {
      if (falhas-- > 0) return Promise.reject(Object.assign(new Error('Não foi possível conectar ao servidor.'), { conexao: true }));
      return original.apply(this, arguments);
    };
  });
  await page.click('#vg-prova-opcoes button[data-opcao="' + (await posicao(page, true)) + '"]');
  await page.click('#vg-prova-responder');
  await expect(page.locator('#vg-prova-reconectando')).toBeVisible();
  await expect(page.locator('#vg-prova-reconectando')).toHaveText('Reconectando… sua resposta está guardada.');
  await expect(page.locator('#vg-prova-responder')).toBeDisabled();
  const guardada = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^vg\.prova\.[0-9a-f-]{36}$/.test(k)).map((k) => JSON.parse(localStorage.getItem(k))));
  expect(guardada).toEqual([expect.objectContaining({ numero: 1, enviar: true })]);
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', '2', { timeout: 15000 });
  await expect(page.locator('#vg-prova-reconectando')).toBeHidden();
  // Escolhe na questão 2 e recarrega a página: a tentativa continua, na mesma questão, com a escolha marcada.
  const pos = await posicao(page, false);
  await page.click('#vg-prova-opcoes button[data-opcao="' + pos + '"]');
  await page.reload();
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', '2');
  await expect(page.locator('#vg-prova-opcoes button[data-opcao="' + pos + '"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vg-prova-responder')).toBeEnabled();
  // Recarregar não é "sair da tela": nenhum sinal registrado.
  expect(await page.evaluate(() => window.__estadoPrevia().provaDemo.tentativas.find((t) => t.status === 'aberta').sinais))
    .toEqual({ trocasAba: 0, copias: 0 });
  // Voltar no navegador não volta questão: começar de novo retoma a mesma tentativa, na mesma questão.
  await page.goto(BASE + 'testes.html#teste/atendimento');
  await expect(page.locator('#vg-prova-comecar')).toHaveText('Continuar o teste');
  await page.click('#vg-prova-comecar');
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', '2');
});

test('encerrar antes do fim pede confirmação (sem confirm do navegador) e conta como tentativa', async ({ page }) => {
  page.on('dialog', (d) => { throw new Error('diálogo do navegador: ' + d.message()); });
  await contaNova(page);
  await comecar(page, 'administrativo');
  await responder(page, 1, true);
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', '2');
  await page.click('#vg-prova-encerrar');
  await expect(page.locator('#vg-confirmar-encerrar')).toBeVisible();
  await expect(page.locator('#vg-confirmar-encerrar')).toContainText('Se você encerrar antes do fim, a tentativa conta: o próximo teste só em 30 dias.');
  await page.click('#vg-confirmar-encerrar-nao');
  await expect(page.locator('#vg-confirmar-encerrar')).toHaveCount(0);
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', '2');
  await page.click('#vg-prova-encerrar');
  await page.click('#vg-confirmar-encerrar-sim');
  await expect(page.locator('#vg-resultado-titulo')).toHaveText('Prova concluída');
  await expect(page.locator('#vg-resultado-nota')).toContainText('Você acertou 1 de 15 questões. Nota 7 (±10).');
  await expect(page.locator('#vg-resultado-refazer')).toBeVisible();
});

test('tempo do servidor: relógio laranja no último minuto; quando acaba, o resultado diz que o tempo acabou', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-13T12:00:00Z') });
  await contaNova(page);
  await comecar(page, 'vendas');
  await responder(page, 1, true);
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', '2');
  await expect(page.locator('#vg-prova-tempo')).not.toHaveClass(/vg-tempo--pouco/);
  await page.clock.fastForward('19:10');
  await expect(page.locator('#vg-prova-tempo')).toHaveClass(/vg-tempo--pouco/);
  await expect(page.locator('#vg-prova-segundos')).toHaveText(/^0:[0-5]\d$/);
  await page.clock.fastForward('01:00');
  await page.clock.runFor(3000);
  await expect(page.locator('#vg-resultado-titulo')).toHaveText('Prova concluída');
  await expect(page.locator('#vg-resultado')).toHaveAttribute('data-status', 'tempo_esgotado');
  await expect(page.locator('#vg-resultado-nota')).toContainText('O tempo acabou antes do fim; as questões sem resposta contaram como erro.');
});

test('sinais: sair da tela e copiar texto viram só registro na tentativa (a prova segue)', async ({ page }) => {
  await contaNova(page);
  await comecar(page, 'caixa');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('copy'));
  });
  await expect.poll(() => page.evaluate(() => {
    const tt = window.__estadoPrevia().provaDemo.tentativas.find((t) => t.status === 'aberta');
    return [tt.sinais.trocasAba, tt.sinais.copias];
  })).toEqual([1, 1]);
  await expect(page.locator('#vg-prova')).toHaveAttribute('data-questao', '1');
  await expect(page.locator('#vg-aviso-geral')).toBeHidden();
});

test('vagas que pedem o selo: só as vagas da cidade com o selo do teste (o selo é informação da vaga, não filtro de pessoa)', async ({ page }) => {
  await page.goto(BASE + 'testes.html');
  const esperado = await page.evaluate(async () => {
    const cidade = (await VAGAS_API.cidades()).cidades.find((c) => c.status === 'ativa');
    localStorage.setItem('vg.cidade', JSON.stringify(cidade.slug));
    let lista = [];
    let depois = '';
    for (let i = 0; i < 5; i++) {
      const r = await VAGAS_API.anuncios({ cidade: cidade.slug, areas: [], limite: 20, depois: depois || undefined });
      lista = lista.concat(r.anuncios);
      if (!r.proximo) break;
      depois = r.proximo;
    }
    return { nome: cidade.nome, codigos: lista.filter((a) => a.selo === 'caixa').map((a) => a.codigo).sort() };
  });
  await page.goto(BASE + 'testes.html?cidade=1#vagas/caixa');
  await expect(page.locator('#vg-testes-vagas-titulo')).toHaveText('Vagas que pedem este selo');
  await expect(page.locator('#vg-testes-vagas-opcional')).toHaveText(OPCIONAL);
  await expect(page.locator('#vg-cidade')).toContainText(esperado.nome);
  if (esperado.codigos.length) {
    await expect(page.locator('#vg-testes-vagas > li')).toHaveCount(esperado.codigos.length);
    const codigos = await page.locator('#vg-testes-vagas a.vg-vaga').evaluateAll((as) => as.map((a) => a.getAttribute('data-codigo')).sort());
    expect(codigos).toEqual(esperado.codigos);
    await expect(page.locator('#vg-testes-vagas > li').first()).toContainText('Pede selo: Caixa e matemática prática');
    await page.goto(BASE + 'testes.html?cidade=2#catalogo');
    await expect(page.locator('#vg-teste-caixa-info')).toContainText('pedido em ' + esperado.codigos.length + (esperado.codigos.length === 1 ? ' vaga' : ' vagas'));
  } else {
    await expect(page.locator('#vg-testes-vagas-vazio')).toContainText('Nenhuma vaga pede este selo agora');
  }
  expect(await semRolagemLateral(page)).toBe(true);
});

test('selo.html: formato do código, código inexistente, selo válido sem dado da pessoa, ?codigo= confere sozinho e vencido mostra a data', async ({ page }) => {
  const erros = coletarErros(page);
  await page.clock.install({ time: new Date('2026-10-13T12:00:00Z') });
  const email = await contaNova(page);
  await page.goto(BASE + 'testes.html');
  await expect(page.locator('#vg-testes-lista')).toBeVisible();
  const codigo = await ganharSelo(page, 'atendimento');
  await page.evaluate(() => VAGAS_API.sair());
  await page.goto(BASE + 'selo.html');
  await expect(page.locator('#vg-conferir-h1')).toHaveText('Conferir um selo');
  await page.click('#vg-conferir-enviar');
  await expect(page.locator('#vg-conferir-codigo-erro')).toHaveText('O código tem 8 letras e números, como Q8V3N2KD');
  await expect(page.locator('#vg-conferir-codigo')).toHaveAttribute('aria-invalid', 'true');
  await page.fill('#vg-conferir-codigo', 'zzzz-zzzz');
  await expect(page.locator('#vg-conferir-codigo')).toHaveValue('ZZZZ-ZZZZ');
  await page.click('#vg-conferir-enviar');
  await expect(page.locator('#vg-conferir-erro')).toHaveText('Selo não encontrado. Confira o código.');
  await page.fill('#vg-conferir-codigo', codigo.toLowerCase());
  await page.press('#vg-conferir-codigo', 'Enter');
  await expect(page.locator('#vg-conferir-titulo')).toHaveText('Selo válido');
  await expect(page.locator('#vg-selo .vg-selo')).toContainText('Atendimento e recepção');
  await expect(page.locator('#vg-selo .vg-selo')).toContainText('Nota 100 de 100 (15 questões; margem de cerca de ±10 pontos)');
  await expect(page).toHaveURL(new RegExp('selo\\.html\\?codigo=' + codigo + '$'));
  await expect(page.locator('#vg-conferir-aviso')).toContainText('Não confere identidade e não substitui a entrevista.');
  const texto = await page.locator('body').innerText();
  expect(texto).not.toContain(email);
  expect(texto).not.toContain('Pessoa de Teste');
  expect(await semRolagemLateral(page)).toBe(true);
  // 13 meses depois: vencido, só com a data (nunca "reprovado").
  await page.clock.setSystemTime(new Date('2027-11-20T12:00:00Z'));
  await page.goto(BASE + 'selo.html?codigo=' + codigo.slice(0, 4) + '-' + codigo.slice(4));
  await expect(page.locator('#vg-conferir-titulo')).toHaveText(/^Selo vencido em \d{2}\/\d{2}\/2027$/);
  await expect(page.locator('#vg-conferir-situacao')).toHaveAttribute('data-situacao', 'vencido');
  expect(await page.locator('body').innerText()).not.toMatch(/aprovad|reprovad/i);
  expect(erros).toEqual([]);
});
