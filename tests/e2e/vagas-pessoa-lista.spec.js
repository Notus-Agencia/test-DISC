// Vagas sem Caos — telas públicas no celular (projeto vagas-celular, Pixel 5), sobre a PRÉVIA: escolha da cidade (index.html),
// lista com filtros (cidade.html), lista de espera, cidade pausada, sem internet, página da vaga com Quero/Pular/denunciar e o
// caminho do "Quero" sem conta (intenção guardada -> entrar -> candidatura). As cidades vêm da semente da prévia pelo próprio
// VAGAS_API.cidades() (nenhum nome de cidade fixo no teste).
const { test, expect } = require('@playwright/test');

const BASE = '/vagas/';

function coletarErros(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404 \(Not Found\)|ERR_FAILED|net::/.test(m.text())) erros.push('console: ' + m.text()); });
  return erros;
}
// Cidades da semente: a primeira ativa (sem praça), a primeira em lista de espera.
async function cidadesDaPrevia(page) {
  await page.goto(BASE + 'entrar.html#entrar');
  return page.evaluate(async () => {
    const r = await window.VAGAS_API.cidades();
    const ativa = r.cidades.find((c) => c.status === 'ativa' && !c.praca);
    const espera = r.cidades.find((c) => c.status === 'lista_espera');
    return { ativa: { slug: ativa.slug, nome: ativa.nome }, espera: espera ? { slug: espera.slug, nome: espera.nome } : null };
  });
}
async function vagaSemCandidatura(page, email, cidade, filtro) {
  return page.evaluate(async ([e, c, f]) => {
    let minhas = [];
    if (e) {
      await window.VAGAS_API.entrar(e, 'previa123');
      minhas = (await window.VAGAS_API.minhasCandidaturas()).candidaturas.map((k) => k.anuncio.codigo);
      await window.VAGAS_API.sair();
    }
    const r = await window.VAGAS_API.anuncios({ cidade: c, limite: 20 });
    const a = r.anuncios.filter((x) => minhas.indexOf(x.codigo) < 0 && (!f || x[f])).find((x) => !x.empresa.confidencial) || r.anuncios[0];
    return { codigo: a.codigo, funcao: a.funcao, area: a.area.slug };
  }, [email, cidade, filtro]);
}

test('index: mostra as cidades do banco; escolher uma lembra no aparelho e a próxima visita vai direto para a lista', async ({ page }) => {
  const erros = coletarErros(page);
  const { ativa } = await cidadesDaPrevia(page);
  await page.goto(BASE + 'index.html');
  await expect(page.locator('#vg-cidade-' + ativa.slug)).toContainText(ativa.nome);
  await expect(page.locator('#vg-preparando')).toBeHidden();
  await page.click('#vg-cidade-' + ativa.slug);
  await page.waitForURL(new RegExp('cidade\\.html\\?cidade=' + ativa.slug));
  await expect(page.locator('#vg-titulo')).toHaveText('Vagas de hoje');
  await page.goto(BASE + 'index.html');
  await page.waitForURL(new RegExp('cidade\\.html\\?cidade=' + ativa.slug));
  await page.goto(BASE + 'index.html?escolher=1');
  await expect(page.locator('#vg-cidade-' + ativa.slug)).toBeVisible();
  expect(erros).toEqual([]);
});

test('lista: cidade do dado no topo, cartões de vaga, "Ver mais 20 vagas", sem rolagem lateral a 390 px', async ({ page }) => {
  const erros = coletarErros(page);
  const { ativa } = await cidadesDaPrevia(page);
  await page.goto(BASE + 'cidade.html?cidade=' + ativa.slug);
  await expect(page.locator('#vg-cidade')).toContainText(ativa.nome);
  await expect(page).toHaveTitle('Vagas de ' + ativa.nome + ' | Vagas sem Caos');
  await expect(page.locator('#vg-lista .vg-vaga').first()).toBeVisible();
  const n = await page.locator('#vg-lista .vg-vaga').count();
  expect(n).toBe(20);
  await expect(page.locator('#vg-contagem')).toContainText('vagas em ' + ativa.nome);
  await expect(page.locator('#vg-aviso-golpe')).toContainText('Nunca pague para se candidatar.');
  await page.click('#vg-mais');
  await expect.poll(() => page.locator('#vg-lista .vg-vaga').count()).toBeGreaterThan(20);
  const largura = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(largura[0]).toBeLessThanOrEqual(largura[1]);
  const primeira = page.locator('#vg-lista .vg-vaga').first();
  await expect(primeira).toHaveAttribute('href', /^vaga\.html\?vaga=[A-Z0-9]{6}$/);
  const texto = await page.locator('#vg-lista').innerText();
  expect(texto).not.toMatch(/aprovad|ranking|match|tinder/i);
  expect(erros).toEqual([]);
});

test('folha de filtros: foco no título, "Ver N vagas" conta, aplicar põe chips com ✕, URL e aparelho guardam, Esc fecha', async ({ page }) => {
  const erros = coletarErros(page);
  const { ativa } = await cidadesDaPrevia(page);
  await page.goto(BASE + 'cidade.html?cidade=' + ativa.slug);
  await expect(page.locator('#vg-lista .vg-vaga').first()).toBeVisible();
  await page.click('#vg-abrir-filtros');
  await expect(page.locator('#vg-filtros')).toHaveAttribute('role', 'dialog');
  await expect(page.locator('#vg-filtros-titulo')).toBeFocused();
  await expect(page.locator('#vg-abrir-filtros')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#vg-filtros-aplicar')).toHaveText(/^Ver \d+ vagas?$/);
  await expect(page.locator('#vg-filtro-areas .vg-chip:visible')).toHaveCount(6);
  await page.click('#vg-filtro-areas-todas');
  await expect(page.locator('#vg-filtro-areas .vg-chip:visible')).toHaveCount(24);
  const antes = await page.textContent('#vg-filtros-aplicar');
  await page.click('#vg-filtro-area-caixa');
  await expect(page.locator('#vg-filtro-area-caixa')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#vg-filtros-aplicar')).not.toHaveText(antes);
  await page.fill('#vg-filtro-salario', 'mil reais');
  await expect(page.locator('#vg-filtro-salario-erro')).toHaveText('Digite só o número, como 1600');
  await page.fill('#vg-filtro-salario', '1500');
  await expect(page.locator('#vg-filtro-salario-erro')).toHaveCount(0);
  for (const id of ['#vg-filtro-modalidade', '#vg-filtro-turno', '#vg-filtro-zona', '#vg-filtro-sem-experiencia', '#vg-filtro-hoje']) await expect(page.locator(id)).toBeAttached();
  // P3: nenhum filtro por dado da pessoa
  expect(await page.locator('#vg-filtros').innerText()).not.toMatch(/\b(nota|selos?|referências?|idade|sexo)\b/i);
  await page.click('#vg-filtros-aplicar');
  await expect(page.locator('#vg-filtros')).toHaveCount(0);
  await expect(page).toHaveURL(/areas=caixa/);
  await expect(page).toHaveURL(/salarioMin=150000/);
  await expect(page.locator('#vg-filtros-ativos .vg-chip')).toHaveCount(2);
  await expect(page.locator('#vg-filtros-ativos [data-filtro="areas"][data-valor="caixa"]')).toContainText('✕');
  await expect(page.locator('#vg-abrir-filtros .vg-chip__n')).toHaveText('2');
  for (const area of await page.locator('#vg-lista .vg-vaga__meta').allTextContents()) expect(area).toContain('Caixa e operação de loja');
  await page.reload();
  await expect(page.locator('#vg-filtros-ativos .vg-chip')).toHaveCount(2);
  await page.click('#vg-filtros-ativos [data-filtro="salarioMin"]');
  await expect(page.locator('#vg-filtros-ativos .vg-chip')).toHaveCount(1);
  await expect(page).not.toHaveURL(/salarioMin/);
  await page.goto(BASE + 'cidade.html?cidade=' + ativa.slug + '&de-novo=1');
  await expect(page.locator('#vg-filtros-ativos .vg-chip')).toHaveCount(1);   // guardado no aparelho
  await page.click('#vg-abrir-filtros');
  await expect(page.locator('#vg-filtros-titulo')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#vg-filtros')).toHaveCount(0);
  await expect(page.locator('#vg-abrir-filtros')).toBeFocused();
  await page.click('#vg-limpar-filtros');
  await expect(page.locator('#vg-filtros-ativos .vg-chip')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('cidade em lista de espera: e-mail obrigatório, resposta de sucesso e "Enquanto isso" com a cidade ativa', async ({ page }) => {
  const { ativa, espera } = await cidadesDaPrevia(page);
  test.skip(!espera, 'a semente não tem cidade em lista de espera');
  await page.goto(BASE + 'cidade.html?cidade=' + espera.slug);
  await expect(page.locator('#vg-espera-titulo')).toHaveText('Ainda não chegamos aqui');
  await expect(page.locator('#vg-espera-texto')).toContainText(espera.nome);
  await expect(page.locator('#vg-espera-texto')).not.toContainText(/\d+ pessoas/);
  // WhatsApp opcional: o campo aparece quando o cliente anuncia o recurso (banco-onda2, migração 20261024).
  const comWhats = await page.evaluate(() => !!(window.VAGAS_API.RECURSOS && window.VAGAS_API.RECURSOS.listaEsperaWhatsapp));
  await expect(page.locator('#vg-espera-whatsapp')).toHaveCount(comWhats ? 1 : 0);
  await expect(page.locator('#vg-espera-outra')).toHaveText('Ver as vagas de ' + ativa.nome);
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-email-erro')).toHaveText('Digite um e-mail válido, como nome@exemplo.com');
  await page.fill('#vg-espera-email', 'quero.saber@exemplo.com');
  await page.click('#vg-espera-empresa');
  await expect(page.locator('#vg-espera-empresa')).toHaveAttribute('aria-checked', 'true');
  await page.click('#vg-espera-enviar');
  await expect(page.locator('#vg-espera-ok')).toContainText(espera.nome);
});

test('cidade pausada: fora da lista pública, o mural responde "pausada"; faixa (com o nome guardado no aparelho) e caminhos para os testes', async ({ page }) => {
  const erros = coletarErros(page);
  const { ativa } = await cidadesDaPrevia(page);
  await page.evaluate(async (slug) => {
    await window.VAGAS_API.entrar('admin@previa.com', 'previa123');
    await window.VAGAS_API.admCidadeSalvar({ slug, status: 'pausada' });
    await window.VAGAS_API.sair();
  }, ativa.slug);
  // aparelho sem a lista guardada: a faixa usa o texto do banco, sem nome de cidade
  await page.goto(BASE + 'cidade.html?cidade=' + ativa.slug);
  await expect(page.locator('#vg-faixa-cidade')).toContainText('pausad');
  await expect(page.locator('#vg-vazio-cidade h1')).toHaveText('Sem vagas por enquanto');
  await expect(page.locator('#vg-pausada-testes')).toHaveAttribute('href', 'testes.html');
  await expect(page.locator('#vg-escolher-cidade')).toHaveCount(0);
  // com a última lista guardada: a faixa diz o nome da cidade
  await page.evaluate((slug) => localStorage.setItem('vg.lista.' + slug, JSON.stringify({ em: Date.now(), nome: 'Cidade Guardada', anuncios: [], filtros: {} })), ativa.slug);
  await page.reload();
  await expect(page.locator('#vg-faixa-cidade')).toContainText('O mural de Cidade Guardada está pausado');
  // cidade lembrada no aparelho e pausada: o início leva para a tela dela (não para a escolha)
  await page.evaluate((slug) => localStorage.setItem('vg.cidade', JSON.stringify(slug)), ativa.slug);
  await page.goto(BASE + 'index.html');
  await expect(page).toHaveURL(new RegExp('cidade\\.html\\?cidade=' + ativa.slug));
  await expect(page.locator('#vg-faixa-cidade')).toBeVisible();
  // endereço inventado e lembrado: "Cidade não encontrada" e o aparelho esquece essa cidade
  await page.evaluate(() => localStorage.setItem('vg.cidade', JSON.stringify('nao-existe-xx')));
  await page.goto(BASE + 'cidade.html?cidade=nao-existe-xx');
  await expect(page.locator('#vg-escolher-cidade')).toHaveAttribute('href', 'index.html?escolher=1');
  expect(await page.evaluate(() => localStorage.getItem('vg.cidade'))).toBeNull();
  expect(erros).toEqual([]);
});

test('sem internet: faixa e a última lista guardada no aparelho, com "Tentar de novo"', async ({ page }) => {
  const { ativa } = await cidadesDaPrevia(page);
  await page.goto(BASE + 'cidade.html?cidade=' + ativa.slug);
  await expect(page.locator('#vg-lista .vg-vaga').first()).toBeVisible();
  const n = await page.locator('#vg-lista .vg-vaga').count();
  await page.route('**/js/api-previa.js', (r) => r.abort());   // sem o "banco" da prévia = sem conexão
  await page.reload();
  await expect(page.locator('#vg-faixa-offline')).toContainText('Sem internet.');
  await expect(page.locator('#vg-lista .vg-vaga')).toHaveCount(n);
  await expect(page.locator('#vg-lista-de')).toContainText('Lista de ');
  await expect(page.locator('#vg-tentar-de-novo')).toBeVisible();
  // A faixa sai sozinha quando a internet volta (evento online) e quando o servidor volta a responder.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#vg-faixa-offline')).toHaveCount(0);
  await page.click('#vg-tentar-de-novo');
  await expect(page.locator('#vg-faixa-offline')).toBeVisible();
  await page.unroute('**/js/api-previa.js');
  await page.click('#vg-tentar-de-novo');
  await expect(page.locator('#vg-faixa-offline')).toHaveCount(0);
  await expect(page.locator('#vg-lista .vg-vaga').first()).toBeVisible();
  // Prévia: uma faixa no alto da tela, uma só.
  await expect(page.locator('#vg-faixa-previa')).toHaveCount(1);
  await expect(page.locator('#vg-faixa-previa')).toHaveText('Versão beta: dados de exemplo, nada aqui é real. Não use sua senha de verdade.');
});

test('vaga: dados, aviso anti-golpe, denúncia anônima com motivo da lista; "Quero" sem conta guarda a intenção e volta com a candidatura', async ({ page }) => {
  const erros = coletarErros(page);
  const { ativa } = await cidadesDaPrevia(page);
  const v = await vagaSemCandidatura(page, 'pessoa@previa.com', ativa.slug);
  await page.goto(BASE + 'cidade.html?cidade=' + ativa.slug + '&vaga=' + v.codigo);   // botão do link curto /v/<código>
  await page.waitForURL(new RegExp('vaga\\.html\\?vaga=' + v.codigo + '$'));
  await expect(page.locator('#vg-vaga-titulo')).toHaveText(v.funcao);
  await expect(page.locator('#vg-vaga-titulo')).toBeFocused();
  await expect(page.locator('#vg-vaga')).toHaveAttribute('data-codigo', v.codigo);
  await expect(page.locator('#vg-voltar')).toHaveText('Vagas de ' + ativa.nome);
  await expect(page.locator('#vg-vaga-dados')).toContainText('Onde');
  await expect(page.locator('#vg-barra-vaga')).toContainText('Você escolhe: nada acontece sem o seu "Quero".');
  await expect(page.locator('#vg-aviso-golpe')).toContainText('Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.');
  await expect(page.locator('#vg-compartilhar')).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=/);
  // denúncia anônima
  await page.click('#vg-denunciar');
  await expect(page.locator('#vg-janela-denuncia')).toBeVisible();
  await page.click('#vg-denuncia-enviar');
  await expect(page.locator('#vg-denuncia-erro')).toHaveText('Escolha o motivo da denúncia.');
  const motivos = await page.locator('#vg-denuncia-motivos .vg-chip').allTextContents();
  expect(motivos).toEqual(['Pede dinheiro', 'Pede documento', 'Discriminação', 'Parece falsa', 'Assédio ou ofensa', 'Pede contato fora da plataforma', 'Outro']);
  await page.click('#vg-denuncia-motivos [data-motivo="falsa"]');
  await page.fill('#vg-denuncia-detalhe', 'Teste de denúncia.');
  await page.click('#vg-denuncia-enviar');
  await expect(page.locator('#vg-janela-denuncia')).toHaveCount(0);
  await expect(page.locator('#vg-aviso-geral')).toContainText('Denúncia recebida.');
  // Quero sem conta -> entrar -> volta e envia (1º Quero pede o aceite)
  await page.click('#vg-quero');
  await page.waitForURL(/entrar\.html\?voltar=vaga\.html/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vg.quero')).codigo)).toBe(v.codigo);
  await page.click('#vg-aba-entrar');
  await page.fill('#vg-entrar-email', 'pessoa@previa.com');
  await page.fill('#vg-entrar-senha', 'previa123');
  await page.click('#vg-entrar-enviar');
  await page.waitForURL(new RegExp('vaga\\.html\\?vaga=' + v.codigo + '$'));
  await expect(page.locator('#vg-janela-candidatura')).toBeVisible();
  await page.click('#vg-aceite-enviar');
  await expect(page.locator('#vg-aceite-candidatura-erro')).toHaveText('Marque a caixa para continuar');
  await page.check('#vg-aceite-candidatura');
  await page.click('#vg-aceite-enviar');
  await expect(page.locator('#vg-quero-ok-titulo')).toHaveText('Candidatura enviada');
  await expect(page.locator('#vg-quero-ok')).toContainText('recebe o seu cartão sem nome e sem foto');
  await expect(page.locator('#vg-nav-vagas')).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => localStorage.getItem('vg.quero'))).toBeNull();
  // voltando à vaga: candidatura enviada, retirar com confirmação na página
  await page.goto(BASE + 'vaga.html?vaga=' + v.codigo);
  await expect(page.locator('#vg-barra-vaga')).toContainText('Candidatura enviada.');
  await page.click('#vg-retirar');
  await expect(page.locator('#vg-confirmar-retirar-nao')).toBeFocused();
  await page.click('#vg-confirmar-retirar-sim');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Candidatura retirada.');
  await expect(page.locator('#vg-quero')).toBeVisible();
  expect(erros).toEqual([]);
});

test('vaga: "Pular" com "Desfazer" (6 s) e conta nova sem currículo vai para o currículo com a intenção guardada', async ({ page }) => {
  const { ativa } = await cidadesDaPrevia(page);
  const v = await vagaSemCandidatura(page, 'pessoa@previa.com', ativa.slug);
  await page.evaluate(() => window.VAGAS_API.entrar('pessoa@previa.com', 'previa123'));
  await page.goto(BASE + 'vaga.html?vaga=' + v.codigo);
  await page.click('#vg-pular');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Vaga pulada.');
  await page.click('#vg-aviso-geral button');
  await page.waitForTimeout(6500);
  await expect(page).toHaveURL(new RegExp('vaga\\.html\\?vaga=' + v.codigo + '$'), { timeout: 1000 });

  // conta nova (currículo incompleto)
  await page.evaluate(() => window.VAGAS_API.sair());
  await page.goto(BASE + 'entrar.html');
  await page.fill('#vg-criar-nome', 'Pessoa Nova');
  await page.fill('#vg-criar-email', 'nova.lista@exemplo.com');
  await page.check('#vg-criar-termos');
  await page.click('#vg-criar-enviar');
  await page.click('#vg-abrir-link-previa');
  await page.fill('#vg-ns-senha', 'senha-boa-123');
  await page.fill('#vg-ns-confirmar', 'senha-boa-123');
  await page.click('#vg-ns-salvar');
  await page.waitForURL(/eu\.html#curriculo\/1$/);
  await page.goto(BASE + 'vaga.html?vaga=' + v.codigo);
  await page.click('#vg-quero');
  await page.waitForURL(/eu\.html#curriculo\/1$/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('vg.quero')).codigo)).toBe(v.codigo);
});

test('vaga fora do ar: mensagem e até 3 parecidas da cidade lembrada', async ({ page }) => {
  const { ativa } = await cidadesDaPrevia(page);
  await page.goto(BASE + 'cidade.html?cidade=' + ativa.slug);
  await expect(page.locator('#vg-lista .vg-vaga').first()).toBeVisible();
  await page.goto(BASE + 'vaga.html?vaga=ZZZZZZ');
  await expect(page.locator('#vg-vaga-fora h1')).toHaveText('Esta vaga não está mais no ar.');
  await expect(page.locator('#vg-parecidas .vg-vaga')).toHaveCount(3);
  await expect(page.locator('#vg-fora-lista')).toHaveAttribute('href', 'cidade.html?cidade=' + ativa.slug);
});
