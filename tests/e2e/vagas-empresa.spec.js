// Vagas sem Caos — painel da EMPRESA no computador (projeto desktop), sobre a PRÉVIA: guarda de conta, início, nova vaga como
// produto (termo proibido recusado com a lei), vaga publicada (link curto, WhatsApp, pausar/retomar/encerrar), cartões cegos
// (P1, P3: só o filtro "Mostrar"), conversa antes e depois do Combinou (contato, roteiro, "Contratada" com o Mapa DISC só ali),
// referências (P2: a empresa não vê a decisão da pessoa), referencia.html?t=, o cadastro da empresa depois da conta e a equipe
// (listar, convidar, cancelar, remover, sair) — o aceite do convite pelo link roda com o celular (Pixel 5), que é onde o e-mail abre.
// Nada aqui depende do nome nem do slug da cidade: os dados são descobertos pela própria API da prévia.
const { test, expect, devices } = require('@playwright/test');

const BASE = '/vagas/';
const SENHA = 'previa123';

function vigiarErros(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  return erros;
}
async function entrar(page, email, hash) {
  await page.goto(BASE + 'entrar.html?tipo=empresa');
  await page.evaluate(([e, s]) => window.VAGAS_API.entrar(e, s), [email, SENHA]);
  if (hash !== null) await page.goto(BASE + 'empresa.html#' + (hash || 'inicio'));
}
// Nenhum id repetido na página (o leitor de tela e os aria-labelledby dependem disso).
async function semIdsRepetidos(page) {
  const repetidos = await page.evaluate(() => {
    const c = {};
    document.querySelectorAll('[id]').forEach((n) => { c[n.id] = (c[n.id] || 0) + 1; });
    return Object.keys(c).filter((k) => c[k] > 1);
  });
  expect(repetidos).toEqual([]);
}
// Troca a conta da prévia dentro da página (a sessão fica no armazenamento do navegador).
async function como(page, email, fn, arg) {
  await page.evaluate(async ([e, s]) => { await window.VAGAS_API.sair(); await window.VAGAS_API.entrar(e, s); }, [email, SENHA]);
  return fn ? page.evaluate(fn, arg) : true;
}

test('guarda: sem sessão vai para entrar com ?voltar=; conta de pessoa vê "Esta área é para empresas."', async ({ page }) => {
  await page.goto(BASE + 'empresa.html#vagas');
  await page.waitForURL(/entrar\.html\?.*voltar=empresa\.html/);
  await page.evaluate(() => window.VAGAS_API.entrar('pessoa@previa.com', 'previa123'));
  await page.goto(BASE + 'empresa.html#inicio');
  await expect(page.locator('main h1')).toHaveText('Esta área é para empresas.');
  await expect(page.locator('#vg-trocar-conta')).toBeVisible();
});

test('início: saudação, os 4 números, a tabela de vagas e o menu lateral; sem erro no console', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com');
  await expect(page.locator('#vg-emp-saudacao')).toHaveText(/^(Bom dia|Boa tarde|Boa noite)/);
  await expect(page.locator('#vg-emp-resumo .resumo__cartao')).toHaveCount(4);
  await expect(page.locator('#vg-emp-resumo-texto')).toContainText('O ideal é responder em até 7 dias.');
  expect(await page.locator('#vg-emp-vagas-tabela tbody tr').count()).toBeGreaterThan(0);
  await expect(page.locator('#vg-emp-aba-inicio')).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle('Início | Vagas sem Caos');
  await expect(page.locator('#vg-menu .menu-lateral__logo')).toHaveAttribute('alt', 'Vagas sem Caos');
  await expect(page.locator('#vg-menu .menu-lateral__logo')).toHaveAttribute('src', 'comum/marca/vsc-logo.svg');
  await expect(page.locator('#vg-menu')).toContainText('Painel da empresa');
  await page.click('#vg-emp-aba-vagas');
  await expect(page.locator('main h1')).toHaveText('Minhas vagas');
  await expect(page.locator('#vg-emp-aba-vagas')).toHaveAttribute('aria-current', 'page');
  await page.click('#vg-emp-aba-banco');
  await expect(page.locator('#vg-banco-fase2')).toContainText('Fase 2.');
  await page.click('#vg-emp-aba-compras');
  await expect(page.locator('main h1')).toHaveText('Grátis no lançamento');
  await expect(page.locator('main')).not.toContainText('Contratar');
  await expect(page.locator('main')).not.toContainText('R$');
  expect(erros).toEqual([]);
});

test('nova vaga: campos fechados com etiquetas ao vivo, termo proibido recusado com a lei, publica e mostra o link curto e o WhatsApp', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com', 'vaga/nova');
  await expect(page.locator('#vg-vaga-titulo')).toHaveText('Nova vaga');
  await page.click('#vg-vaga-area');
  await expect(page.locator('#vg-janela-area')).toBeVisible();
  await page.click('#vg-janela-area-opcoes [data-valor="caixa"]');
  await expect(page.locator('#vg-janela-area')).toHaveCount(0);
  await expect(page.locator('#vg-vaga-area')).toContainText('Caixa e operação de loja');
  await page.fill('#vg-vaga-funcao', 'Operador(a) de caixa');
  await page.click('#vg-vaga-modalidade [data-valor="clt"]');
  await page.fill('#vg-vaga-salario-de', '1620');
  await page.click('#vg-vaga-turno [data-valor="comercial"]');
  if (await page.locator('#vg-vaga-zona').count()) await page.locator('#vg-vaga-zona .vg-chip').first().click();
  await expect(page.locator('#vg-vaga-etiquetas')).toContainText('Caixa e operação de loja');
  await expect(page.locator('#vg-vaga-etiquetas')).toContainText('CLT');
  await expect(page.locator('#vg-vaga-etiquetas')).toContainText('R$ 1.620');
  // Descrição com critério proibido: recusa no campo, explicando a lei; "Enviar para publicar" desliga.
  await page.fill('#vg-vaga-descricao', 'Atender no caixa e conferir o troco. Procuramos pessoa de boa aparência, até 30 anos.');
  await page.locator('#vg-vaga-descricao').blur();
  await expect(page.locator('#vg-vaga-descricao-erro')).toContainText('"até 30 anos"');
  await expect(page.locator('#vg-vaga-descricao-erro')).toContainText('Lei 9.029/1995 e CLT art. 373-A');
  await expect(page.locator('#vg-vaga-descricao')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#vg-vaga-publicar')).toBeDisabled();
  await page.fill('#vg-vaga-descricao', 'Atender no caixa, conferir o troco, embalar as compras e fechar o caixa no fim do turno.');
  await expect(page.locator('#vg-vaga-publicar')).toBeEnabled();
  await expect(page.locator('#vg-vaga-descricao-erro')).toHaveCount(0);
  await expect(page.locator('#vg-vaga-rascunho')).toContainText('Rascunho salvo neste aparelho às');
  await page.click('#vg-vaga-publicar');
  await page.waitForURL(/#vaga\/[0-9a-f-]{36}$/);
  await expect(page.locator('#vg-vaga-h1')).toHaveText('Operador(a) de caixa');
  expect(await page.evaluate(() => localStorage.getItem('vg.rascunho.vaga'))).toBeNull();
  const situacao = (await page.locator('.vg-emp-situacao .vg-status').textContent()).trim();
  expect(['No ar', 'Em revisão']).toContain(situacao);
  if (situacao === 'No ar') {
    const link = await page.locator('#vg-vaga-link').inputValue();
    expect(link).toMatch(/^https:\/\/[^/]+\/v\/[A-Z0-9]{6}$/);
    const href = await page.locator('#vg-vaga-whatsapp').getAttribute('href');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    const texto = decodeURIComponent(href.split('?text=')[1]);
    expect(texto).toContain('Vaga de Operador(a) de caixa · ');
    expect(texto).toContain(link);
    await expect(page.locator('#vg-vaga-como-aparece .vg-vaga__titulo')).toHaveText('Operador(a) de caixa');
  } else {
    await expect(page.locator('#vg-vaga-situacao')).toContainText('Em revisão');
  }
  expect(erros).toEqual([]);
});

// Campos fechados mínimos de uma vaga CLT (a zona só quando a cidade tem zonas).
async function preencherVaga(page, funcao) {
  await page.click('#vg-vaga-area');
  await page.click('#vg-janela-area-opcoes [data-valor="caixa"]');
  await page.fill('#vg-vaga-funcao', funcao);
  await page.click('#vg-vaga-modalidade [data-valor="clt"]');
  await page.fill('#vg-vaga-salario-de', '1620');
  await page.click('#vg-vaga-turno [data-valor="comercial"]');
  if (await page.locator('#vg-vaga-zona').count()) await page.locator('#vg-vaga-zona .vg-chip').first().click();
  await page.fill('#vg-vaga-descricao', 'Atender no caixa, conferir o troco, embalar as compras e fechar o caixa no fim do turno.');
}

test('vaga nova: experiência só até 6 meses (CLT 442-A), "Selo sugerido"; publicar que falha sem internet não duplica a vaga (E1)', async ({ page }) => {
  await entrar(page, 'empresa@previa.com', 'vaga/nova');
  // Nada de "1 a 3 anos" nem "Mais de 3 anos"; o texto de ajuda cita a lei.
  await expect(page.locator('#vg-vaga-experiencia [data-valor="nao_precisa"]')).toHaveText('Não precisa');
  for (const id of ['ate_1', '1_a_3', 'mais_3']) await expect(page.locator('#vg-vaga-experiencia [data-valor="' + id + '"]')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('A lei não deixa exigir mais de 6 meses na mesma função (CLT, art. 442-A).');
  await expect(page.locator('main')).toContainText('Selo sugerido');
  await expect(page.locator('main')).toContainText('O teste é opcional: sem selo não quer dizer que a pessoa não sabe. Sem nota mínima.');
  const antes = await page.evaluate(async () => (await window.VAGAS_API.anunciosDaEmpresa((await window.VAGAS_API.eu()).empresas[0].id)).anuncios.length);
  await preencherVaga(page, 'Caixa sem duplicar');
  // 1ª tentativa: salva o rascunho no banco, mas a publicação cai (sem internet). A 2ª usa o mesmo id.
  await page.evaluate(() => {
    const A = window.VAGAS_API;
    const original = A.publicarAnuncio;
    let vez = 0;
    A.publicarAnuncio = function (id) {
      vez += 1;
      if (vez === 1) { const e = new Error('Sem conexão.'); e.conexao = true; return Promise.reject(e); }
      return original.call(A, id);
    };
  });
  await page.click('#vg-vaga-publicar');
  await expect(page.locator('#vg-vaga-publicar')).toBeEnabled();
  await expect(page).toHaveURL(/#vaga\/nova$/);
  await page.click('#vg-vaga-publicar');
  await page.waitForURL(/#vaga\/[0-9a-f-]{36}$/);
  const depois = await page.evaluate(async () => (await window.VAGAS_API.anunciosDaEmpresa((await window.VAGAS_API.eu()).empresas[0].id)).anuncios
    .filter((a) => a.funcao === 'Caixa sem duplicar').length);
  expect(depois).toBe(1);
  expect(await page.evaluate(async () => (await window.VAGAS_API.anunciosDaEmpresa((await window.VAGAS_API.eu()).empresas[0].id)).anuncios.length)).toBe(antes + 1);
});

test('pré-abertura: /empresas de cidade em lista de espera → cadastrar → publicar → vaga "Aguardando a abertura"', async ({ page }) => {
  const erros = vigiarErros(page);
  await page.goto(BASE + 'empresas.html');
  await page.waitForFunction(() => window.VAGAS_API && window.VAGAS_REGRAS);
  // Uma cidade em lista de espera que já aceita empresa (achada pela situação, não pelo nome); sem nenhuma, a equipe põe uma em espera.
  const cidade = await page.evaluate(async () => {
    const c = (await window.VAGAS_API.cidades()).cidades.filter((x) => x.preAbertura && x.aceitaEmpresas)[0];
    if (c) return c;
    await window.VAGAS_API.entrar('admin@previa.com', 'previa123');
    const todas = (await window.VAGAS_API.cidades()).cidades;
    const alvo = todas[todas.length - 1];
    await window.VAGAS_API.admCidadeSalvar({ slug: alvo.slug, nome: alvo.nome, uf: alvo.uf, status: 'lista_espera', ordem: 0 });
    await window.VAGAS_API.sair();
    return (await window.VAGAS_API.cidades()).cidades.filter((x) => x.slug === alvo.slug)[0];
  });
  expect([cidade.preAbertura, cidade.aceitaEmpresas]).toEqual([true, true]);
  const aviso = 'Sua vaga entra no ar no dia em que ' + cidade.nome + ' abrir.';
  await page.goto(BASE + 'empresas.html?cidade=' + cidade.slug);
  await page.click('#vg-cadastrar-empresa');
  await page.waitForURL(/entrar\.html\?tipo=empresa/);
  await page.fill('#vg-emp-cnpj', '11.222.333/0001-81');
  await page.fill('#vg-emp-nome', 'Loja da Abertura');
  await page.fill('#vg-emp-responsavel', 'Marta Exemplo');
  await page.fill('#vg-emp-email', 'marta@lojaabertura.exemplo');
  await page.fill('#vg-emp-whatsapp', '(11) 99999-0001');
  await page.check('#vg-emp-termos');
  await page.click('#vg-emp-cadastrar');
  await page.click('#vg-abrir-link-previa');
  await page.fill('#vg-ns-senha', 'senha-boa-123');
  await page.fill('#vg-ns-confirmar', 'senha-boa-123');
  await page.click('#vg-ns-salvar');
  await page.waitForURL(/empresa\.html#inicio$/);
  // Cadastro: a cidade em espera aparece (e vem marcada), com o aviso de quando a vaga entra no ar.
  await expect(page.locator('#vg-emp-cad-cidade [aria-checked="true"]')).toHaveText(cidade.nome + ' (' + cidade.uf + ')');
  await expect(page.locator('#vg-emp-cad-pre-abertura')).toHaveText(aviso);
  await expect(page.locator('#vg-emp-cad-enviar')).toBeEnabled();
  await page.fill('#vg-emp-cad-razao', 'Loja da Abertura Ltda');
  await page.click('#vg-emp-cad-enviar');
  await expect(page.locator('#vg-faixa-empresa')).toContainText('Em análise.');
  await expect(page.locator('#vg-emp-pre-abertura')).toContainText('Suas vagas entram no ar no dia em que ' + cidade.nome + ' abrir.');
  // Publicar: o aviso fica junto do botão.
  await page.goto(BASE + 'empresa.html#vaga/nova');
  await preencherVaga(page, 'Caixa da abertura');
  await expect(page.locator('#vg-vaga-pre-abertura')).toHaveText(aviso);
  await page.click('#vg-vaga-publicar');
  await page.waitForURL(/#vaga\/[0-9a-f-]{36}$/);
  const anuncioId = page.url().split('#vaga/')[1];
  const empresaId = await page.evaluate(async () => (await window.VAGAS_API.minhasEmpresas()).empresas[0].id);
  // A operação confere o CNPJ e libera a 1ª vaga (revisão).
  await page.evaluate(async ([e, a]) => {
    await window.VAGAS_API.sair();
    await window.VAGAS_API.entrar('admin@previa.com', 'previa123');
    await window.VAGAS_API.opEmpresaDecidir(e, 'aprovar', '');
    await window.VAGAS_API.opAnuncioDecidir(a, 'publicar', '');
    await window.VAGAS_API.sair();
    await window.VAGAS_API.entrar('marta@lojaabertura.exemplo', 'senha-boa-123');
  }, [empresaId, anuncioId]);
  await page.goto('about:blank');
  await page.goto(BASE + 'empresa.html#vagas');
  const linha = page.locator('#vg-emp-vagas-tabela tr', { hasText: 'Caixa da abertura' });
  await expect(linha.locator('[data-status="aguarda_abertura"]')).toHaveText('Aguardando a abertura');
  await linha.locator('a.vg-emp-link-vaga').click();
  await expect(page.locator('.vg-emp-situacao .vg-status')).toHaveText('Aguardando a abertura');
  await expect(page.locator('#vg-vaga-situacao')).toContainText(aviso);
  await expect(page.locator('#vg-vaga-aguarda')).toContainText(aviso);
  await expect(page.locator('#vg-vaga-link')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('vaga publicada: pausar, retomar e encerrar (com confirmação); depois de encerrar, "Renovar"', async ({ page }) => {
  await entrar(page, 'empresa@previa.com', null);
  const id = await page.evaluate(async () => {
    const eu = await window.VAGAS_API.eu();
    const as = (await window.VAGAS_API.anunciosDaEmpresa(eu.empresas[0].id)).anuncios;
    return as.find((a) => a.status === 'publicado' && !a.expirado && a.modalidade !== 'diaria').id;
  });
  await page.goto(BASE + 'empresa.html#vaga/' + id);
  await expect(page.locator('.vg-emp-situacao .vg-status')).toHaveText('No ar');
  await page.click('#vg-vaga-pausar');
  await expect(page.locator('.vg-emp-situacao .vg-status')).toHaveText('Pausada');
  await page.click('#vg-vaga-retomar');
  await expect(page.locator('.vg-emp-situacao .vg-status')).toHaveText('No ar');
  await page.click('#vg-vaga-encerrar');
  await expect(page.locator('#vg-confirmar-encerrar')).toContainText('Quem está em conversa continua');
  await page.click('#vg-confirmar-encerrar-sim');
  await expect(page.locator('.vg-emp-situacao .vg-status')).toHaveText('Encerrada');
  await expect(page.locator('#vg-vaga-renovar')).toBeVisible();
});

test('cartões cegos: ordem de chegada, só o filtro "Mostrar", sem nome nem contato; "Quero conversar" com 1ª mensagem e "Agora não"', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com', null);
  const id = await page.evaluate(async () => {
    const eu = await window.VAGAS_API.eu();
    const as = (await window.VAGAS_API.anunciosDaEmpresa(eu.empresas[0].id)).anuncios;
    for (const a of as) {
      const c = (await window.VAGAS_API.cartoes(a.id, {})).cartoes;
      if (c.filter((x) => x.status === 'enviada').length >= 2) return a.id;
    }
    return null;
  });
  expect(id).not.toBeNull();
  await page.goto(BASE + 'empresa.html#vaga/' + id + '/cartoes');
  await expect(page.locator('#vg-cartoes-titulo')).toHaveText(/pessoas? quer/);
  await expect(page.locator('#vg-cartoes .vg-cartao__ordem').first()).toHaveText('1º');
  await expect(page.locator('#vg-cartoes-filtros .vg-chip')).toHaveCount(3);
  await expect(page.locator('main .vg-opcoes')).toHaveCount(1);
  for (const quem of await page.locator('#vg-cartoes .vg-cartao__quem').allTextContents()) expect(quem).toBe('Pessoa candidata');
  expect(await page.locator('#vg-cartoes').textContent()).not.toMatch(/@|\(\d{2}\) 9/);
  for (const ref of await page.locator('#vg-cartoes .vg-ref-contagem').allTextContents()) expect(ref.trim()).toBe('Referência de empresa verificada: sim');
  // Como ler o selo no momento da decisão, e o que a pessoa vê no "Agora não" (psicologia, revisão C 3.2 e 3.5).
  await expect(page.locator('#vg-cartoes-selo')).toHaveText('O selo é informação, não requisito: o teste é opcional e nem toda função tem teste. Sem selo não quer dizer que a pessoa não sabe. A nota tem margem de cerca de 10 pontos e não serve para ordenar pessoas.');
  await expect(page.locator('main')).toContainText('Quem você marca como "Agora não" vê a candidatura como encerrada, sem motivo.');
  await expect(page.locator('main')).not.toContainText('A pessoa não é avisada');
  // Quero conversar: a mensagem passa pelo filtro (pedido de documento é bloqueado) e o cartão vira "Você chamou".
  const novo = page.locator('#vg-cartoes li.vg-cartao').filter({ has: page.locator('.vg-status--novo') }).first();
  const cand = await novo.getAttribute('data-candidatura');
  await novo.locator('[data-acao="conversar"]').click();
  await expect(page.locator('#vg-janela-chamar')).toBeVisible();
  await page.fill('#vg-chamar-texto', 'Me manda o seu cpf, por favor.');
  await page.click('#vg-chamar-enviar');
  await expect(page.locator('#vg-chamar-texto-erro')).toContainText('Mensagem bloqueada');
  // E2: a 1ª tentativa chega ao servidor mas a resposta se perde (sem internet); o 2º toque reaproveita o id e não duplica.
  await page.evaluate(() => {
    const A = window.VAGAS_API;
    const original = A.enviarMensagem;
    window.__idsMensagem = [];
    A.enviarMensagem = function (cand, texto, id) {
      window.__idsMensagem.push(id);
      const p = original.call(A, cand, texto, id);
      if (window.__idsMensagem.length > 1) return p;
      return p.then(() => { const e = new Error('Sem conexão.'); e.conexao = true; throw e; });
    };
  });
  await page.fill('#vg-chamar-texto', 'Podemos conversar amanhã às 10h na loja?');
  await page.click('#vg-chamar-enviar');
  await expect(page.locator('#vg-chamar-texto-erro')).toContainText('Sem conexão.');
  await page.click('#vg-chamar-enviar');
  await expect(page.locator('#vg-janela-chamar')).toHaveCount(0);
  const ids = await page.evaluate(() => window.__idsMensagem);
  expect(ids.length).toBe(2);
  expect(ids[0]).toBe(ids[1]);
  expect(await page.evaluate(async (c) => (await window.VAGAS_API.conversa(c)).mensagens.filter((m) => m.texto === 'Podemos conversar amanhã às 10h na loja?').length, cand)).toBe(1);
  const chamado = page.locator('#vg-cartoes li[data-candidatura="' + cand + '"]');
  await expect(chamado.locator('.vg-status')).toHaveText('Você chamou');
  await expect(chamado).toContainText('Esperando a pessoa aceitar.');
  // Agora não: sai de "Novos e em conversa" e aparece em "Agora não", apagado, com o caminho de volta.
  const outro = page.locator('#vg-cartoes li.vg-cartao').filter({ has: page.locator('.vg-status--novo') }).first();
  const cand2 = await outro.getAttribute('data-candidatura');
  await outro.locator('[data-acao="agora_nao"]').click();
  await expect(page.locator('#vg-cartoes li[data-candidatura="' + cand2 + '"]')).toHaveCount(0);
  await page.click('#vg-cartoes-filtros [data-valor="agora_nao"]');
  const decidido = page.locator('#vg-cartoes li[data-candidatura="' + cand2 + '"]');
  await expect(decidido).toHaveClass(/vg-cartao--decidido/);
  await expect(decidido.locator('.vg-status')).toHaveText('Agora não');
  await expect(decidido.locator('[data-acao="mudar"]')).toBeVisible();
  expect(erros).toEqual([]);
});

test('conversa: antes do Combinou sem nome nem contato; depois, contato, roteiro com 8 perguntas e "Contratada" (único lugar do Mapa DISC)', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com', null);
  // Prepara uma candidatura nova da pessoa da prévia numa vaga não confidencial da empresa e a empresa chama para conversar.
  const anuncioId = await page.evaluate(async () => {
    const eu = await window.VAGAS_API.eu();
    const as = (await window.VAGAS_API.anunciosDaEmpresa(eu.empresas[0].id)).anuncios;
    return as.filter((a) => a.noAr && !a.confidencial).map((a) => a.id);
  });
  const prep = await como(page, 'pessoa@previa.com', async (ids) => {
    const A = window.VAGAS_API;
    const minhas = (await A.minhasCandidaturas()).candidaturas.map((k) => k.anuncio.id);
    const alvo = ids.find((id) => !minhas.includes(id));
    const r = await A.quero(alvo);
    const p = await A.minhaPessoa();
    return { cand: r.candidatura.id, nome: p.pessoa.nome };
  }, anuncioId);
  await como(page, 'empresa@previa.com', (c) => window.VAGAS_API.decidir(c, 'conversar'), prep.cand);
  await page.goto(BASE + 'empresa.html#conversa/' + prep.cand);
  await expect(page.locator('#vg-conversa-nome')).toHaveText('Pessoa candidata');
  await expect(page.locator('#vg-contato')).toContainText('O nome e o WhatsApp aparecem quando a pessoa tocar em "Combinou".');
  await expect(page.locator('#vg-cartao-chegou')).toBeVisible();
  await expect(page.locator('#vg-roteiro')).toHaveCount(0);
  await expect(page.locator('#vg-marcar-contratada')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('DISC');
  await page.fill('#vg-mensagem-texto', 'Olá! Podemos conversar amanhã às 10h?');
  await page.click('#vg-mensagem-enviar');
  await expect(page.locator('#vg-mensagens')).toContainText('Podemos conversar amanhã às 10h?');
  // A pessoa libera o contato (Combinou).
  await como(page, 'pessoa@previa.com', (c) => window.VAGAS_API.combinar(c), prep.cand);
  await como(page, 'empresa@previa.com');
  await page.reload();
  await expect(page.locator('#vg-conversa-nome')).toHaveText(prep.nome);
  await expect(page.locator('#vg-contato-nome')).toHaveText(prep.nome);
  expect(await page.locator('#vg-contato-whatsapp').getAttribute('href')).toMatch(/^https:\/\/wa\.me\/55\d{10,11}\?text=Oi%2C%20/);
  await page.click('#vg-contato-curriculo');
  await expect(page.locator('#vg-janela-curriculo')).toContainText('Experiências');
  await page.click('#vg-janela-curriculo-fechar');
  await page.click('#vg-roteiro-abrir');
  await expect(page.locator('#vg-roteiro .vg-emp-pergunta')).toHaveCount(8);
  await expect(page.locator('#vg-roteiro')).toContainText('Não pergunte (Lei 9.029/1995');
  await expect(page.locator('#vg-integracao')).toHaveCount(0);
  await page.click('#vg-marcar-contratada');
  await expect(page.locator('#vg-confirmar-contratada')).toContainText('Marcar a candidatura de ' + prep.nome + ' como contratada?');
  await page.click('#vg-confirmar-contratada-sim');
  await expect(page.locator('#vg-integracao')).toContainText('É opcional para a pessoa, ela recebe o próprio resultado, e o resultado não pode ser usado para decidir se ela fica depois do contrato de experiência.');
  await expect(page.locator('#vg-marcar-contratada')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('referências: dar por e-mail (até 3 pontos fortes, texto filtrado, declaração); a lista não muda quando a pessoa recusa (P2)', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com', 'referencia/dar');
  await expect(page.locator('main h1')).toHaveText('Dar referência profissional');
  await page.fill('#vg-ref-dar-pessoa', 'pessoa@previa.com');
  await page.fill('#vg-ref-dar-funcao', 'Atendente');
  await page.click('#vg-ref-dar-vinculo [data-valor="clt"]');
  await page.fill('#vg-ref-dar-inicio', '01/2024');
  await page.fill('#vg-ref-dar-fim', '06/2025');
  for (const p of ['pontualidade', 'atendimento', 'equipe']) await page.click('#vg-ref-dar-pontos [data-valor="' + p + '"]');
  await page.click('#vg-ref-dar-pontos [data-valor="vendas"]');
  await expect(page.locator('#vg-ref-dar-pontos-erro')).toHaveText('Escolha até 3 pontos fortes.');
  await expect(page.locator('#vg-ref-dar-pontos [aria-pressed="true"]')).toHaveCount(3);
  await page.fill('#vg-ref-dar-texto', 'Moça bonita e solteira.');
  await page.locator('#vg-ref-dar-texto').blur();
  await expect(page.locator('#vg-ref-dar-texto-erro')).toContainText('Lei 9.029/1995');
  await page.fill('#vg-ref-dar-texto', 'Fechou o caixa certo todos os dias e ajudava a repor o estoque no fim do turno.');
  await page.click('#vg-ref-dar-enviar');
  await expect(page.locator('#vg-ref-dar-declaro-erro')).toContainText('declaração');
  await page.check('#vg-ref-dar-declaro');
  await page.click('#vg-ref-dar-enviar');
  await expect(page.locator('#vg-ref-dar-ok')).toContainText('moderação');
  await page.click('#vg-ref-dar-ver');
  await expect(page.locator('#vg-ref-tabela')).toBeVisible();
  const antes = await page.locator('#vg-ref-tabela').textContent();
  for (const proibido of ['Esperando a pessoa aceitar', 'Aceita', 'Não aceita', 'Ocultada', 'recusou', 'Pública desde']) expect(antes).not.toContain(proibido);
  // A pessoa recusa/oculta tudo o que a empresa deu: a tela da empresa continua exatamente igual (veto P2).
  const empresaNome = await page.evaluate(() => window.VAGAS_EMPRESA.ctx.empresa.nomeFantasia);
  await como(page, 'pessoa@previa.com', async (nome) => {
    const A = window.VAGAS_API;
    for (const r of (await A.minhasReferencias()).referencias.filter((x) => x.empresa.nome === nome)) {
      await A.responderReferencia(r.id, r.status === 'pendente' ? 'recusar' : 'ocultar');
    }
  }, empresaNome);
  await como(page, 'empresa@previa.com');
  await page.reload();
  await expect(page.locator('#vg-ref-tabela')).toBeVisible();
  expect(await page.locator('#vg-ref-tabela').textContent()).toBe(antes);
  expect(erros).toEqual([]);
});

test('referencia.html?t=: sem login vai para entrar sem o token no endereço e volta com o pedido aberto; envia; link inválido mostra a mensagem do contrato', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com', null);
  const cnpj = await page.evaluate(async () => (await window.VAGAS_API.minhasEmpresas()).empresas[0].cnpj);
  const pedido = await como(page, 'pessoa@previa.com', async (c) => {
    const r = await window.VAGAS_API.pedirReferencia({ cnpj: c });
    const p = await window.VAGAS_API.minhaPessoa();
    return { token: r.convite.token, nome: p.pessoa.nome };
  }, cnpj);
  // Sem login: o token sai da barra antes de ir para o entrar.html (não vai no ?voltar= nem fica no aparelho).
  await page.evaluate(() => window.VAGAS_API.sair());
  await page.goto(BASE + 'referencia.html?t=' + pedido.token);
  await page.waitForURL(/entrar\.html\?.*voltar=referencia\.html(&|$)/);
  expect(page.url()).not.toContain(pedido.token);
  // Fora a "banco" da prévia (que guarda o pedido, como o banco de verdade), nada no aparelho tem o token.
  expect(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).filter((k) => k.indexOf('vagas_previa') !== 0).map((k) => localStorage.getItem(k))))).not.toContain(pedido.token);
  // Entra e volta para referencia.html: o pedido continua aberto (memória da aba).
  await page.evaluate(([e, s]) => window.VAGAS_API.entrar(e, s), ['empresa@previa.com', SENHA]);
  await page.goto(BASE + 'referencia.html');
  await expect(page.locator('#vg-ref-pedido-titulo')).toHaveText('Dar referência profissional');
  expect(page.url()).not.toContain(pedido.token);
  await expect(page.locator('#vg-ref-dar-pessoa')).toHaveValue(pedido.nome + ' (pediu a referência)');
  await expect(page.locator('#vg-emp-aba-referencias')).toHaveAttribute('href', 'empresa.html#referencias');
  await page.fill('#vg-ref-dar-funcao', 'Atendente');
  await page.click('#vg-ref-dar-vinculo [data-valor="temporario"]');
  await page.fill('#vg-ref-dar-inicio', '06/2025');
  await page.check('#vg-ref-dar-atual');
  await expect(page.locator('#vg-ref-dar-fim')).toBeDisabled();
  await page.click('#vg-ref-dar-pontos [data-valor="aprende_rapido"]');
  await page.click('#vg-ref-dar-recomenda [data-valor="mesma"]');
  await page.check('#vg-ref-dar-declaro');
  await page.click('#vg-ref-dar-enviar');
  await expect(page.locator('#vg-ref-dar-ok')).toContainText('A decisão de mostrar ou não é só dela.');
  // Enviada: o pedido sai da memória da aba.
  await page.goto('about:blank');
  await page.goto(BASE + 'referencia.html');
  await expect(page.locator('main')).toContainText('Convite inválido ou vencido. Peça um link novo à pessoa.');
  await page.goto(BASE + 'referencia.html?t=' + 'a'.repeat(64));
  await expect(page.locator('main')).toContainText('Convite inválido ou vencido. Peça um link novo à pessoa.');
  await page.goto(BASE + 'referencia.html?t=link-cortado');
  await expect(page.locator('main')).toContainText('Convite inválido ou vencido. Peça um link novo à pessoa.');
  expect(erros).toEqual([]);
});

test('cadastro: conta nova de empresa completa o cadastro com o rascunho do entrar.html e entra em análise', async ({ page }) => {
  const erros = vigiarErros(page);
  await page.goto(BASE + 'entrar.html?tipo=empresa');
  await page.fill('#vg-emp-cnpj', '11.222.333/0001-81');
  await page.fill('#vg-emp-nome', 'Loja Nova Exemplo');
  await page.fill('#vg-emp-responsavel', 'Marcos Exemplo');
  await page.fill('#vg-emp-email', 'marcos@lojanova.exemplo');
  await page.fill('#vg-emp-whatsapp', '(11) 99999-0000');
  await page.check('#vg-emp-termos');
  await page.click('#vg-emp-cadastrar');
  await page.click('#vg-abrir-link-previa');
  await page.fill('#vg-ns-senha', 'senha-boa-123');
  await page.fill('#vg-ns-confirmar', 'senha-boa-123');
  await page.click('#vg-ns-salvar');
  await page.waitForURL(/empresa\.html#inicio$/);
  await expect(page.locator('#vg-emp-cad-titulo')).toHaveText('Complete o cadastro da empresa');
  await expect(page.locator('#vg-emp-cad-cnpj')).toHaveValue('11.222.333/0001-81');
  await expect(page.locator('#vg-emp-cad-nome')).toHaveValue('Loja Nova Exemplo');
  await expect(page.locator('#vg-emp-cad-whatsapp')).toHaveValue('11999990000');
  await page.click('#vg-emp-cad-enviar');
  if (await page.locator('#vg-emp-cad-sem-cidade').count()) { await expect(page.locator('#vg-emp-cad-enviar')).toBeDisabled(); return; }
  await expect(page.locator('#vg-emp-cad-razao-erro')).toHaveText('Informe a razão social.');
  await page.fill('#vg-emp-cad-razao', 'Loja Nova Exemplo Ltda');
  if (!(await page.locator('#vg-emp-cad-cidade [aria-checked="true"]').count())) await page.locator('#vg-emp-cad-cidade .vg-chip').first().click();
  await page.click('#vg-emp-cad-enviar');
  await expect(page.locator('#vg-faixa-empresa')).toContainText('Em análise.');
  await expect(page.locator('#vg-emp-saudacao')).toHaveText(/, Marcos$/);
  expect(await page.evaluate(() => localStorage.getItem('vg.rascunho.empresa'))).toBeNull();
  // Em análise dá para escrever a vaga; a confidencial fica desligada (CNPJ ainda não conferido).
  await page.goto(BASE + 'empresa.html#vaga/nova');
  await expect(page.locator('#vg-vaga-confidencial [data-valor="sim"]')).toBeDisabled();
  expect(erros).toEqual([]);
});

test('abaixo de 900 px o menu vira gaveta', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await entrar(page, 'empresa@previa.com');
  await expect(page.locator('#vg-menu-abrir')).toBeVisible();
  await expect(page.locator('#vg-menu')).toBeHidden();
  await page.click('#vg-menu-abrir');
  await expect(page.locator('body')).toHaveClass(/menu-aberto/);
  await page.click('#vg-emp-aba-referencias');
  await expect(page.locator('main h1')).toHaveText('Referências');
  await expect(page.locator('body')).not.toHaveClass(/menu-aberto/);
});

// ------------------------------------------------------------------------------------------------- equipe da empresa
// Painel (computador): a dona lista, convida, cancela convite e remove; a recrutadora não convida e pode sair da equipe.
test('equipe (computador): a dona vê a equipe e os convites, convida com resposta neutra, cancela e remove; recusas do banco aparecem no campo', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com', 'dados');
  const equipe = page.locator('#vg-equipe');
  const membros = page.locator('#vg-equipe-membros');
  await expect(membros).toBeVisible();
  // Quem é dono(a) se vê como "Você" (sem botão de remover a si mesmo); a recrutadora aparece com o nome da conta.
  await expect(membros.locator('tr', { hasText: 'Você' })).toContainText('Dono(a)');
  await expect(membros.locator('tr', { hasText: 'Você' }).locator('[data-acao="remover"]')).toHaveCount(0);
  const rita = membros.locator('tr', { hasText: 'recrutador@previa.com' });
  await expect(rita).toContainText('Recrutador(a)');
  await expect(rita).toContainText('Rita Moraes');
  await expect(page.locator('#vg-equipe-convites tr', { hasText: 'convidada@previa.com' })).toContainText('Esperando o aceite');
  await expect(equipe).toContainText('O convite vale 72 horas.');
  await semIdsRepetidos(page);
  // E-mail inválido para no campo; quem já está na equipe, o banco recusa e a mensagem vai para o campo.
  await page.fill('#vg-equipe-email', 'isto-nao-e-email');
  await page.click('#vg-equipe-convidar');
  await expect(equipe).toContainText('E-mail inválido.');
  await page.fill('#vg-equipe-email', 'recrutador@previa.com');
  await page.click('#vg-equipe-convidar');
  await expect(equipe).toContainText('Esta pessoa já faz parte da equipe.');
  // Convite novo: resposta neutra (não diz se o e-mail tem conta) e a linha "Esperando o aceite".
  await page.fill('#vg-equipe-email', 'colega.nova@previa.com');
  await page.click('#vg-equipe-convidar');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Se este e-mail puder entrar na equipe, a pessoa recebe o convite em instantes.');
  const linha = page.locator('#vg-equipe-convites tr', { hasText: 'colega.nova@previa.com' });
  await expect(linha).toContainText('Esperando o aceite');
  await expect(page.locator('#vg-equipe-abrir-previa')).toHaveAttribute('href', /convite=[0-9a-f]{64}/);
  await linha.locator('[data-acao="cancelar"]').click();
  await expect(page.locator('#vg-equipe-convites tr', { hasText: 'colega.nova@previa.com' })).toContainText('Cancelado');
  await expect(page.locator('#vg-equipe-convites tr', { hasText: 'colega.nova@previa.com' }).locator('[data-acao="cancelar"]')).toHaveCount(0);
  // Tornar a recrutadora dona (com confirmação): com duas donas, quem está logada também pode sair da equipe.
  await expect(page.locator('#vg-equipe-sair')).toHaveCount(0);
  await rita.locator('[data-acao="tornar-dono"]').click();
  await page.click('#vg-confirmar-dono-sim');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Rita Moraes agora é dono(a) da empresa.');
  await expect(rita).toContainText('Dono(a)');
  await expect(rita.locator('[data-acao="tornar-dono"]')).toHaveCount(0);
  await expect(page.locator('#vg-equipe-sair')).toBeVisible();
  // Remover (com confirmação): ela some da lista e perde o acesso ao painel da empresa.
  await rita.locator('[data-acao="remover"]').click();
  await expect(page.locator('#vg-confirmar-remover')).toContainText('Rita Moraes');
  await page.click('#vg-confirmar-remover-sim');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Pessoa removida da equipe.');
  await expect(membros.locator('tr', { hasText: 'recrutador@previa.com' })).toHaveCount(0);
  await expect(page.locator('#vg-equipe-sair')).toHaveCount(0);
  await como(page, 'recrutador@previa.com');
  await page.goto('about:blank');
  await page.goto(BASE + 'empresa.html#inicio');
  await expect(page.locator('#vg-emp-cad-titulo')).toHaveText('Complete o cadastro da empresa');
  expect(erros).toEqual([]);
});

test('equipe (computador): empresa em análise vê a equipe, mas só convida depois de verificada', async ({ page }) => {
  const erros = vigiarErros(page);
  await page.goto(BASE + 'entrar.html?tipo=empresa');
  // A empresa em análise da semente da prévia (achada pela situação, não pelo nome).
  const email = await page.evaluate(async () => {
    for (let i = 2; i <= 20; i += 1) {
      const e = 'empresa' + i + '@previa.com';
      try { await window.VAGAS_API.entrar(e, 'previa123'); } catch (x) { continue; }
      const emp = (await window.VAGAS_API.minhasEmpresas()).empresas[0];
      if (emp && emp.status === 'em_analise') return e;
      await window.VAGAS_API.sair();
    }
    return '';
  });
  expect(email).not.toBe('');
  await page.goto(BASE + 'empresa.html#dados');
  await expect(page.locator('#vg-equipe-membros')).toContainText('Dono(a)');
  await expect(page.locator('#vg-equipe-so-verificada')).toHaveText('Só empresa verificada pela Gestão sem Caos pode convidar pessoas para a equipe.');
  await expect(page.locator('#vg-equipe-email')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('equipe (computador): a recrutadora vê o nome da conta, não convida e pode sair da equipe', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'recrutador@previa.com');
  await expect(page.locator('#vg-emp-saudacao')).toHaveText(/, Rita$/);
  await expect(page.locator('#vg-menu')).toContainText('Rita Moraes');
  await page.click('#vg-emp-aba-dados');
  await expect(page.locator('#vg-equipe')).toContainText('Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.');
  await expect(page.locator('#vg-equipe-email')).toHaveCount(0);
  await expect(page.locator('#vg-emp-form-editar')).toHaveCount(0);
  await page.click('#vg-equipe-sair');
  await page.click('#vg-confirmar-sair-equipe-sim');
  await expect(page.locator('#vg-emp-cad-titulo')).toHaveText('Complete o cadastro da empresa');
  expect(erros).toEqual([]);
});

test('excluir a conta: a única dona de empresa com equipe é recusada e levada à equipe; depois de tornar outra pessoa dona, exclui', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com', 'dados');
  await expect(page.locator('#vg-emp-conta')).toContainText('Conta: empresa@previa.com');
  await page.click('#vg-emp-excluir');
  await expect(page.locator('#vg-confirmar-excluir')).toContainText('Excluir a conta de vez?');
  await expect(page.locator('#vg-confirmar-excluir-sim')).toBeDisabled();
  await page.fill('#vg-confirmar-excluir-texto', 'excluir');
  await expect(page.locator('#vg-confirmar-excluir-sim')).toBeEnabled();
  await page.click('#vg-confirmar-excluir-sim');
  await expect(page.locator('#vg-confirmar-excluir-erro')).toContainText('Você é a única pessoa dona de uma empresa que tem equipe. Antes de excluir a conta, torne outra pessoa da equipe dona');
  await page.click('#vg-confirmar-excluir-equipe');
  await expect(page.locator('#vg-confirmar-excluir')).toHaveCount(0);
  await expect(page.locator('#vg-equipe-titulo')).toBeFocused();
  // Passa a posse (Rita fica dona também) e exclui.
  await page.locator('#vg-equipe-membros tr', { hasText: 'recrutador@previa.com' }).locator('[data-acao="tornar-dono"]').click();
  await page.click('#vg-confirmar-dono-sim');
  await expect(page.locator('#vg-equipe-membros tr', { hasText: 'recrutador@previa.com' })).toContainText('Dono(a)');
  await page.click('#vg-emp-excluir');
  await page.fill('#vg-confirmar-excluir-texto', 'EXCLUIR');
  await page.click('#vg-confirmar-excluir-sim');
  await expect(page.locator('main h1')).toHaveText('Conta excluída.');
  await expect(page.locator('#vg-menu')).toHaveCount(0);
  await expect(page.locator('#vg-emp-excluida-inicio')).toHaveAttribute('href', 'index.html');
  // A empresa continua com a Rita, agora dona.
  await como(page, 'recrutador@previa.com');
  await page.goto('about:blank');
  await page.goto(BASE + 'empresa.html#dados');
  await expect(page.locator('#vg-equipe-membros')).toBeVisible();
  await expect(page.locator('#vg-equipe-membros tr', { hasText: 'empresa@previa.com' })).toHaveCount(0);
  expect(erros).toEqual([]);
});

// Aceite do convite pelo link do e-mail: a tela é de celular (Pixel 5), sem o menu do painel.
const { defaultBrowserType: _tipo, ...CELULAR } = devices['Pixel 5'];
test.describe('equipe: convite pelo link, no celular', () => {
  test.use(CELULAR);

  async function convidar(page, email) {
    await page.goto(BASE + 'entrar.html?tipo=empresa');
    return page.evaluate(async ([e, s, quem]) => {
      await window.VAGAS_API.entrar(e, s);
      const emp = (await window.VAGAS_API.minhasEmpresas()).empresas[0];
      const r = await window.VAGAS_API.convidarEquipe(emp.id, quem);
      await window.VAGAS_API.sair();
      return { link: r.linkPrevia, empresaNome: emp.nomeFantasia };
    }, ['empresa@previa.com', SENHA, email]);
  }
  async function semRolagemLateral(page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  test('conta nova: o link cria a senha, aceita os termos, cai no convite, "Agora não" sai sem aceitar; aceita e entra como recrutador(a); o link não serve de novo', async ({ page }) => {
    const erros = vigiarErros(page);
    const { link, empresaNome } = await convidar(page, 'colega.celular@previa.com');
    expect(link).toMatch(/^entrar\.html\?token_hash=.+&type=invite&convite=[0-9a-f]{64}$/);
    const token = /convite=([0-9a-f]{64})/.exec(link)[1];
    await page.goto(BASE + link);
    await page.fill('#vg-ns-senha', 'senha-boa-123');
    await page.fill('#vg-ns-confirmar', 'senha-boa-123');
    await page.click('#vg-ns-salvar');
    await page.check('#vg-aceite-termos');
    await page.click('#vg-aceite-enviar');
    // O entrar.html leva direto para a tela de aceite (a pessoa não precisa achar o link de novo).
    await expect(page.locator('main h1')).toHaveText('Convite para a equipe');
    await expect(page).toHaveTitle('Convite para a equipe | Vagas sem Caos');
    // O token sai da barra de endereço assim que é lido (fica só na memória da aba).
    await expect(page).toHaveURL(/\/vagas\/empresa\.html$/);
    await expect(page.locator('#vg-convite-texto')).toContainText(empresaNome + ' (');
    await expect(page.locator('#vg-convite-texto')).toContainText('como recrutador(a): publicar vagas, ver quem se candidatou e conversar com as pessoas.');
    await expect(page.locator('#vg-convite')).toContainText('Ao aceitar, quem é dono(a) da empresa vê o seu nome e o seu e-mail na lista da equipe.');
    await expect(page.locator('#vg-convite-regras')).toContainText('Na seleção valem as regras da casa: cartão sem nome, por ordem de chegada;');
    // Tela de uma tarefa: sem menu do painel nem botão de abrir menu; texto de 16 px; alvos de toque de 44 px ou mais.
    await expect(page.locator('#vg-menu')).toHaveCount(0);
    await expect(page.locator('#vg-menu-abrir')).toBeHidden();
    expect(await page.locator('#vg-convite-texto').evaluate((n) => getComputedStyle(n).fontSize)).toBe('16px');
    expect(await page.locator('main').evaluate((m) => [...m.querySelectorAll('a, button')].filter((x) => x.offsetParent)
      .map((x) => Math.round(x.getBoundingClientRect().height)).filter((h) => h < 44))).toEqual([]);
    // Na ordem do código, "Aceitar" vem antes de "Agora não" (igual à tela).
    expect(await page.locator('#vg-convite .vg-emp-acoes-coluna > *').evaluateAll((l) => l.map((x) => x.id))).toEqual(['vg-convite-aceitar', 'vg-convite-agora-nao']);
    await semRolagemLateral(page);
    await semIdsRepetidos(page);
    // "Agora não": sem empresa própria, volta para o início do Vagas sem Caos e o convite continua valendo.
    await page.click('#vg-convite-agora-nao');
    await page.waitForURL(/\/vagas\/index\.html$/);
    await page.goto(BASE + 'empresa.html?convite=' + token);
    // Sem internet no aceite: mensagem desta tela, foco de volta no botão e nenhuma faixa genérica; na 2ª vez, aceita.
    await page.evaluate(() => {
      const A = window.VAGAS_API;
      const original = A.aceitarConviteEquipe;
      let vez = 0;
      A.aceitarConviteEquipe = function (t) {
        vez += 1;
        if (vez === 1) { const e = new Error('Sem conexão.'); e.conexao = true; return Promise.reject(e); }
        return original.call(A, t);
      };
    });
    await page.click('#vg-convite-aceitar');
    await expect(page.locator('#vg-convite-erro')).toHaveText('Sem internet: o convite ainda não foi aceito. Confira a conexão e toque de novo em "Aceitar o convite".');
    await expect(page.locator('#vg-convite-aceitar')).toBeFocused();
    await expect(page.locator('#vg-faixa-offline')).toHaveCount(0);
    await page.click('#vg-convite-aceitar');
    await expect(page.locator('#vg-convite-ok')).toContainText('Pronto. Agora você faz parte da equipe de ' + empresaNome + '.');
    await expect(page.locator('#vg-convite-ok-titulo')).toBeFocused();
    await expect(page.locator('#vg-convite-computador')).toHaveText('O painel funciona melhor no computador.');
    await expect(page.locator('#vg-convite-erro')).toHaveCount(0);
    await page.click('#vg-convite-ir');
    await expect(page.locator('#vg-emp-saudacao')).toBeVisible();
    await expect(page.locator('#vg-menu-abrir')).toBeVisible();
    await page.goto(BASE + 'empresa.html?convite=' + token);
    await expect(page.locator('#vg-convite-invalido')).toHaveText('Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.');
    await expect(page.locator('#vg-convite-painel')).toHaveText('Ir para o painel');
    await semRolagemLateral(page);
    // A dona vê a pessoa nova na equipe e o convite como aceito.
    await como(page, 'empresa@previa.com');
    // O endereço já é empresa.html (o token saiu da barra): sem passar por about:blank, só a âncora mudaria.
    await page.goto('about:blank');
    await page.goto(BASE + 'empresa.html#dados');
    await expect(page.locator('#vg-equipe-membros tr', { hasText: 'colega.celular@previa.com' })).toContainText('Recrutador(a)');
    await expect(page.locator('#vg-equipe-convites tr', { hasText: 'colega.celular@previa.com' })).toContainText('Aceito');
    expect(erros).toEqual([]);
  });

  test('conta que já existe (dona de outra empresa): entra pelo link, aceita e passa a ter as duas empresas', async ({ page }) => {
    const erros = vigiarErros(page);
    const { link, empresaNome } = await convidar(page, 'empresa2@previa.com');
    expect(link).toMatch(/^entrar\.html\?convite=[0-9a-f]{64}$/);
    const token = /convite=([0-9a-f]{64})/.exec(link)[1];
    await page.goto(BASE + link);
    await page.fill('#vg-entrar-email', 'empresa2@previa.com');
    await page.fill('#vg-entrar-senha', SENHA);
    await page.click('#vg-entrar-enviar');
    await expect(page.locator('#vg-convite-texto')).toContainText(empresaNome);
    expect(page.url()).not.toContain(token);
    await expect(page.locator('#vg-convite-agora-nao')).toHaveAttribute('href', 'empresa.html#inicio');
    await semRolagemLateral(page);
    await page.click('#vg-convite-aceitar');
    await page.click('#vg-convite-ir');
    await expect(page.locator('#vg-emp-saudacao')).toBeVisible();
    expect(await page.evaluate(async () => (await window.VAGAS_API.minhasEmpresas()).empresas.length)).toBe(2);
    await page.goto(BASE + 'empresa.html#dados');
    await expect(page.locator('#vg-emp-dados-h1')).toHaveText(empresaNome);
    await expect(page.locator('#vg-emp-trocar .vg-chip')).toHaveCount(2);
    // Na empresa nova a pessoa é recrutador(a): não vê a lista da equipe.
    await expect(page.locator('#vg-equipe')).toContainText('Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.');
    expect(erros).toEqual([]);
  });
});
