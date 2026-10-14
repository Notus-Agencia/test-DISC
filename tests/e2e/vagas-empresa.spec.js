// Vagas sem Caos — painel da EMPRESA no computador (projeto desktop), sobre a PRÉVIA: guarda de conta, início, nova vaga como
// produto (termo proibido recusado com a lei), vaga publicada (link curto, WhatsApp, pausar/retomar/encerrar), cartões cegos
// (P1, P3: só o filtro "Mostrar"), conversa antes e depois do Combinou (contato, roteiro, "Contratada" com o Mapa DISC só ali),
// referências (P2: a empresa não vê a decisão da pessoa), referencia.html?t= e o cadastro da empresa depois da conta.
// Nada aqui depende do nome nem do slug da cidade: os dados são descobertos pela própria API da prévia.
const { test, expect } = require('@playwright/test');

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
  await expect(page.locator('#vg-menu')).toContainText('Vagas sem Caos · Empresa');
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
  // Quero conversar: a mensagem passa pelo filtro (pedido de documento é bloqueado) e o cartão vira "Você chamou".
  const novo = page.locator('#vg-cartoes li.vg-cartao').filter({ has: page.locator('.vg-status--novo') }).first();
  const cand = await novo.getAttribute('data-candidatura');
  await novo.locator('[data-acao="conversar"]').click();
  await expect(page.locator('#vg-janela-chamar')).toBeVisible();
  await page.fill('#vg-chamar-texto', 'Me manda o seu cpf, por favor.');
  await page.click('#vg-chamar-enviar');
  await expect(page.locator('#vg-chamar-texto-erro')).toContainText('Mensagem bloqueada');
  await page.fill('#vg-chamar-texto', 'Podemos conversar amanhã às 10h na loja?');
  await page.click('#vg-chamar-enviar');
  await expect(page.locator('#vg-janela-chamar')).toHaveCount(0);
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
  await expect(page.locator('#vg-contato')).toContainText('O nome e o WhatsApp aparecem quando a pessoa aceitar.');
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
  await expect(page.locator('#vg-confirmar-contratada')).toContainText('Marcar ' + prep.nome + ' como contratada?');
  await page.click('#vg-confirmar-contratada-sim');
  await expect(page.locator('#vg-integracao')).toContainText('Mapa DISC de integração (só depois da contratação; nunca na seleção)');
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

test('referencia.html?t=: a empresa abre o pedido da pessoa e envia; link inválido mostra a mensagem do contrato; sem login vai para entrar', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com', null);
  const cnpj = await page.evaluate(async () => (await window.VAGAS_API.minhasEmpresas()).empresas[0].cnpj);
  const pedido = await como(page, 'pessoa@previa.com', async (c) => {
    const r = await window.VAGAS_API.pedirReferencia({ cnpj: c });
    const p = await window.VAGAS_API.minhaPessoa();
    return { token: r.convite.token, nome: p.pessoa.nome };
  }, cnpj);
  await como(page, 'empresa@previa.com');
  await page.goto(BASE + 'referencia.html?t=' + pedido.token);
  await expect(page.locator('#vg-ref-pedido-titulo')).toHaveText('Dar referência profissional');
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
  await page.goto(BASE + 'referencia.html?t=' + 'a'.repeat(64));
  await expect(page.locator('main')).toContainText('Convite inválido ou vencido. Peça um link novo à pessoa.');
  await page.evaluate(() => window.VAGAS_API.sair());
  await page.goto(BASE + 'referencia.html?t=' + pedido.token);
  await page.waitForURL(/entrar\.html\?.*voltar=referencia\.html%3Ft%3D[0-9a-f]{64}/);
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

test('equipe: a dona convida (resposta neutra), cancela, convida de novo; quem foi convidado aceita em empresa.html?convite= e entra como recrutador(a)', async ({ page }) => {
  const erros = vigiarErros(page);
  await entrar(page, 'empresa@previa.com', null);
  test.skip(!(await page.evaluate(() => typeof window.VAGAS_API.equipeDaEmpresa === 'function')), 'RPCs da equipe (banco-onda2) ainda não integradas');
  const empresaNome = await page.evaluate(async () => (await window.VAGAS_API.minhasEmpresas()).empresas[0].nomeFantasia);
  await page.goto(BASE + 'empresa.html#dados');
  await expect(page.locator('#vg-equipe-membros')).toBeVisible();
  await expect(page.locator('#vg-equipe-membros')).toContainText('Você');
  await page.fill('#vg-equipe-email', 'colega.nova@previa.com');
  await page.click('#vg-equipe-convidar');
  const linha = page.locator('#vg-equipe-convites tr', { hasText: 'colega.nova@previa.com' });
  await expect(linha).toContainText('Esperando o aceite');
  await linha.locator('[data-acao="cancelar"]').click();
  await expect(page.locator('#vg-equipe-convites tr', { hasText: 'colega.nova@previa.com' }).first()).toContainText('Cancelado');
  await page.fill('#vg-equipe-email', 'colega.nova@previa.com');
  await page.click('#vg-equipe-convidar');
  const link = await page.locator('#vg-equipe-abrir-previa').getAttribute('href');
  const token = /convite=([0-9a-f]{64})/.exec(link)[1];
  // Quem foi convidado não tinha conta: o link confirma o e-mail e cria a senha.
  await page.evaluate(() => window.VAGAS_API.sair());
  await page.goto(BASE + link);
  await page.fill('#vg-ns-senha', 'senha-boa-123');
  await page.fill('#vg-ns-confirmar', 'senha-boa-123');
  await page.click('#vg-ns-salvar');
  await page.waitForURL(/(empresa\.html|entrar\.html)/);
  if (await page.locator('#vg-aceite-termos').count()) { await page.check('#vg-aceite-termos'); await page.click('#vg-aceite-enviar'); }
  await page.waitForURL(/empresa\.html/);
  await page.goto(BASE + 'empresa.html?convite=' + token);
  await expect(page.locator('#vg-convite-texto')).toContainText(empresaNome);
  await expect(page.locator('#vg-convite-texto')).toContainText('recrutador(a)');
  await page.click('#vg-convite-aceitar');
  await expect(page.locator('#vg-convite-ok')).toContainText('Agora você faz parte da equipe de ' + empresaNome);
  await page.click('#vg-convite-ir');
  await expect(page.locator('#vg-emp-saudacao')).toBeVisible();
  await page.goto(BASE + 'empresa.html?convite=' + token);
  await expect(page.locator('#vg-convite-invalido')).toHaveText('Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.');
  await page.goto(BASE + 'empresa.html#dados');
  await expect(page.locator('#vg-equipe')).toContainText('Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.');
  await expect(page.locator('#vg-equipe-sair')).toBeVisible();
  // A dona vê a nova pessoa e pode tirá-la da equipe.
  await page.evaluate(async () => { await window.VAGAS_API.sair(); await window.VAGAS_API.entrar('empresa@previa.com', 'previa123'); });
  await page.reload();
  const membro = page.locator('#vg-equipe-membros tr', { hasText: 'colega.nova@previa.com' });
  await expect(membro).toContainText('Recrutador(a)');
  await membro.locator('[data-acao="remover"]').click();
  await page.click('#vg-confirmar-remover-sim');
  await expect(page.locator('#vg-equipe-membros tr', { hasText: 'colega.nova@previa.com' })).toHaveCount(0);
  expect(erros).toEqual([]);
});
