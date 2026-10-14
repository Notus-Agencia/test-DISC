// Vagas sem Caos — operação da praça (operador.html, computador), sobre a PRÉVIA: fila de moderação (publicar, devolver com motivo
// da lista fechada, liberar/recusar empresa), denúncias (só o conteúdo, nunca quem denunciou), cadastro assistido, boletim do dia,
// números, repasse, zonas, guarda de conta e gaveta. Nenhum teste depende de nome ou endereço de cidade: tudo vem do dado.
const { test, expect } = require('@playwright/test');

const BASE = '/vagas/';

function coletar(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  return erros;
}
async function entrarComo(page, email, rota) {
  await page.goto(BASE + 'entrar.html');
  await page.evaluate((em) => window.VAGAS_API.entrar(em, 'previa123'), email);
  await page.goto(BASE + 'operador.html#' + (rota || 'fila'));
}
async function cidadeAtual(page) {
  return page.evaluate(() => window.VAGAS_API.opResumo().then((r) => r.cidades[0]));
}

test.describe('Operação da praça (prévia)', () => {
  test('fila: menu com contagens, cidade do dado, publicar uma vaga em revisão (some da fila)', async ({ page }) => {
    const erros = coletar(page);
    await entrarComo(page, 'operador@previa.com');
    await expect(page.locator('#vg-op-tela h1')).toHaveText('Fila');
    const c = await cidadeAtual(page);
    await expect(page.locator('#vg-op-tela .sobretitulo')).toHaveText('Moderação · ' + c.nome);
    await expect(page.locator('#vg-menu .menu-grupo__titulo')).toHaveText(['Moderação', 'Praça']);
    await expect(page.locator('#vg-op-registro')).toHaveText('Cada ato fica registrado');
    await expect(page.locator('#vg-op-aba-fila')).toHaveAttribute('aria-current', 'page');
    const esperando = c.contagens.anunciosEmRevisao + c.contagens.anunciosSuspensos + c.contagens.empresasEmAnalise;
    await expect(page.locator('#vg-op-aba-fila .aba__n')).toHaveText(String(esperando));
    const itens = page.locator('#vg-op-fila > li[data-anuncio]');
    await expect(itens.first()).toBeVisible();
    const n = await itens.count();
    expect(n).toBeGreaterThan(0);
    await expect(page.locator('#vg-op-fila-vagas')).toHaveText('Vagas (' + n + ')');
    const titulo = (await itens.first().locator('.t-corpo').innerText()).split(' · ')[0];
    await itens.first().locator('[data-acao="publicar"]').click();
    await expect(page.locator('#vg-aviso-geral')).toContainText('Vaga publicada: "' + titulo + '".');
    await expect(itens).toHaveCount(n - 1);
    await expect(page.locator('#vg-op-fila-vagas')).toHaveText('Vagas (' + (n - 1) + ')');
    await expect(page.locator('#vg-op-aba-fila .aba__n')).toHaveText(esperando - 1 > 0 ? String(esperando - 1) : '');
    // "Decididas hoje" lê o registro de moderação.
    await page.click('#vg-op-fila-decididas');
    await expect(page.locator('#vg-op-fila > li').first()).toContainText('Publicou a vaga');
    expect(erros).toEqual([]);
  });

  test('fila: devolver com ajuste exige um motivo da lista fechada e a empresa recebe a CHAVE do motivo', async ({ page }) => {
    const erros = coletar(page);
    await entrarComo(page, 'operador@previa.com');
    const item = page.locator('#vg-op-fila > li[data-anuncio]').first();
    const id = await item.getAttribute('data-anuncio');
    await item.locator('[data-acao="devolver"]').click();
    const janela = page.locator('#vg-op-confirmar');
    await expect(janela).toBeVisible();
    await expect(janela.locator('h2')).toContainText('com ajuste');
    await page.click('#vg-op-confirmar-sim');
    await expect(page.locator('#vg-op-motivo-erro')).toHaveText('Escolha o motivo.');
    const chips = page.locator('#vg-op-motivo .vg-chip');
    expect(await chips.count()).toBeGreaterThan(3);
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#vg-op-motivo-ajuda')).toContainText('A empresa lê também:');
    await expect(page.locator('#vg-op-motivo-erro')).toBeHidden();
    await page.click('#vg-op-confirmar-sim');
    await expect(janela).toHaveCount(0);
    await expect(page.locator('#vg-aviso-geral')).toContainText('Vaga devolvida');
    await expect(page.locator('#vg-op-fila > li[data-anuncio="' + id + '"]')).toHaveCount(0);
    const motivo = await page.evaluate((x) => window.VAGAS_API.opAnuncios({ status: ['rascunho'] }).then((r) => r.anuncios.filter((a) => a.id === x)[0].statusMotivo), id);
    const chaves = await page.evaluate(() => Object.keys(window.VAGAS_TEXTOS.buscar('moderacao.motivos')));
    expect(chaves).toContain(motivo);
    expect(motivo).toMatch(/^anuncio_/);
    // Esc fecha a janela sem decidir.
    await page.locator('#vg-op-fila > li[data-anuncio]').first().locator('[data-acao="remover"]').click();
    await expect(janela).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(janela).toHaveCount(0);
    expect(erros).toEqual([]);
  });

  test('fila: empresa em análise — liberar depois de conferir o CNPJ (vira verificada); recusar pede motivo', async ({ page }) => {
    const erros = coletar(page);
    await entrarComo(page, 'operador@previa.com');
    await page.click('#vg-op-fila-empresas');
    const item = page.locator('#vg-op-fila > li[data-empresa]').first();
    await expect(item).toBeVisible();
    await expect(item.locator('a[href^="https://solucoes.receita.fazenda.gov.br/"]')).toHaveAttribute('rel', 'noopener noreferrer');
    await item.locator('[data-acao="recusar"]').click();
    await expect(page.locator('#vg-op-motivo .vg-chip')).toHaveCount(2);
    await page.locator('#vg-op-motivo .vg-chip').first().click();
    await page.click('#vg-op-confirmar-sim');
    await expect(page.locator('#vg-aviso-geral')).toContainText('Cadastro recusado com o motivo.');
    await expect(page.locator('#vg-op-fila > li[data-empresa]').first()).toContainText('Último motivo enviado:');
    const id = await page.locator('#vg-op-fila > li[data-empresa]').first().getAttribute('data-empresa');
    await page.locator('#vg-op-fila > li[data-empresa]').first().locator('[data-acao="aprovar"]').click();
    await expect(page.locator('#vg-op-confirmar')).toContainText('Receita Federal');
    await page.click('#vg-op-confirmar-sim');
    await expect(page.locator('#vg-aviso-geral')).toContainText('Empresa liberada');
    await expect(page.locator('#vg-op-fila-empresas')).toHaveText('Empresas (0)');
    await page.click('#vg-op-aba-empresas');
    await expect(page.locator('#vg-op-empresas tr[data-empresa="' + id + '"] .vg-status')).toHaveText('Verificada');
    expect(erros).toEqual([]);
  });

  test('denúncias: chega só o conteúdo, nunca quem denunciou; improcedente e procedente (tira a vaga do ar)', async ({ page }) => {
    const erros = coletar(page);
    await page.goto(BASE + 'entrar.html');
    const ids = await page.evaluate(async () => {
      const A = window.VAGAS_API;
      const op = await A.entrar('operador@previa.com', 'previa123');
      const cidade = op.operador[0].cidade;
      await A.sair();
      await A.entrar('pessoa@previa.com', 'previa123');
      const r = await A.anuncios({ cidade, areas: [], entorno: false });
      const [a, b] = r.anuncios;
      await A.denunciar({ alvo: 'anuncio', id: a.id, motivo: 'golpe', detalhe: 'Pediram Pix para reservar a vaga' });
      await A.denunciar({ alvo: 'anuncio', id: b.id, motivo: 'falsa', detalhe: 'Ninguém responde' });
      await A.sair();
      await A.entrar('operador@previa.com', 'previa123');
      return [a.id, b.id];
    });
    await page.goto(BASE + 'operador.html#denuncias');
    await expect(page.locator('#vg-op-tela h1')).toHaveText('Denúncias');
    const linhas = page.locator('#vg-op-denuncias tbody tr');
    await expect(linhas).toHaveCount(2);
    await expect(page.locator('#vg-op-aba-denuncias .aba__n')).toHaveText('2');
    await expect(page.locator('#vg-op-denuncias')).toContainText('Pede dinheiro');
    await expect(page.locator('#vg-op-denuncias')).toContainText('"Pediram Pix para reservar a vaga"');
    await expect(page.locator('body')).not.toContainText('pessoa@previa.com');
    const linhaFalsa = page.locator('#vg-op-denuncias tbody tr', { hasText: 'Ninguém responde' });
    await linhaFalsa.locator('[data-acao="improcedente"]').click();
    await expect(page.locator('#vg-op-motivo-fixo')).toHaveText('Denúncia revisada, sem problema encontrado');
    await page.click('#vg-op-confirmar-sim');
    await expect(page.locator('#vg-aviso-geral')).toContainText('improcedente');
    await expect(linhas).toHaveCount(1);
    await linhas.first().locator('[data-acao="procedente"]').click();
    await expect(page.locator('#vg-op-den-remover-vaga')).toBeChecked();
    await page.locator('#vg-op-motivo .vg-chip').first().click();
    await page.click('#vg-op-confirmar-sim');
    await expect(page.locator('#vg-aviso-geral')).toContainText('procedente');
    await expect(page.locator('#vg-op-denuncias-corpo')).toContainText('Nenhuma denúncia aberta.');
    await page.click('#vg-op-den-todas');
    await expect(linhas).toHaveCount(2);
    await expect(page.locator('#vg-op-denuncias')).toContainText('Procedente');
    await expect(page.locator('#vg-op-denuncias')).toContainText('Improcedente');
    const status = await page.evaluate((x) => window.VAGAS_API.opAnuncios({ status: ['removido', 'publicado'] }).then((r) => r.anuncios.filter((a) => a.id === x)[0].status), ids[0]);
    expect(status).toBe('removido');
    expect(erros).toEqual([]);
  });

  test('cadastro assistido: obrigatórios, nunca o e-mail do operador, conta pendente com o lembrete do WhatsApp; e-mail que já tem conta', async ({ page }) => {
    const erros = coletar(page);
    await entrarComo(page, 'operador@previa.com', 'assistido');
    await expect(page.locator('#vg-op-tela h1')).toHaveText('Cadastro assistido');
    await page.click('#vg-op-ass-criar');
    await expect(page.locator('#vg-op-ass-email-erro')).toHaveText('Informe o e-mail da pessoa.');
    await expect(page.locator('#vg-op-ass-leu-erro')).toHaveText('Leia o aviso para a pessoa e marque a caixa.');
    await expect(page.locator('#vg-op-ass-email')).toHaveAttribute('aria-invalid', 'true');
    await page.fill('#vg-op-ass-email', 'operador@previa.com');
    await page.check('#vg-op-ass-leu');
    await page.click('#vg-op-ass-criar');
    await expect(page.locator('#vg-op-ass-email-erro')).toHaveText('Use o e-mail da pessoa, nunca o seu.');
    await expect(page.locator('#vg-op-ass-evento')).toHaveValue(/^mutirao-\d{8}$/);
    await page.locator('#vg-op-ass-local .vg-chip', { hasText: 'Balcão' }).click();
    await expect(page.locator('#vg-op-ass-evento')).toHaveValue(/^balcao-\d{8}$/);
    await page.fill('#vg-op-ass-nome', 'Carla Exemplo');
    await page.fill('#vg-op-ass-email', 'carla.exemplo@exemplo.com');
    await page.click('#vg-op-ass-criar');
    await expect(page.locator('#vg-op-ass-ok')).toContainText('Conta criada como pendente para carla.exemplo@exemplo.com.');
    const href = await page.locator('#vg-op-ass-whatsapp').getAttribute('href');
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.split('text=')[1])).toContain('Oi, Carla! Começamos o seu cadastro no Vagas sem Caos.');
    await expect(page.locator('#vg-op-ass-email')).toHaveValue('');
    // Pendentes: a lista traz o e-mail MASCARADO (vagas_op_assistidos); reenviar pede o e-mail completo.
    const pend = page.locator('#vg-op-pendentes');
    const mascaras = await page.evaluate(() => window.VAGAS_API.opAssistidos({}).then((r) => r.contas.map((x) => x.email)));
    expect(mascaras.length).toBeGreaterThan(0);
    expect(mascaras.join(' ')).not.toContain('carla.exemplo@exemplo.com');
    await expect(pend.locator('#vg-op-pendentes-contas > li')).toHaveCount(mascaras.length);
    await expect(pend.locator('.caixa__titulo')).toHaveText('Pendentes de confirmação (' + mascaras.length + ')');
    await expect(pend.locator('#vg-op-pendentes-contas > li').first()).toContainText(mascaras[0]);
    await expect(pend).not.toContainText('carla.exemplo@exemplo.com');
    await pend.locator('#vg-op-pendentes-contas > li').first().locator('[data-acao="reenviar"]').click();
    await expect(page.locator('#vg-op-reenviar-email')).toBeFocused();
    await expect(page.locator('#vg-op-reenviar-email-ajuda')).toHaveText('Digite o e-mail completo de ' + mascaras[0] + '.');
    await page.click('#vg-op-reenviar');
    await expect(page.locator('#vg-op-reenviar-email-erro')).toHaveText('E-mail inválido.');
    await page.fill('#vg-op-reenviar-email', 'carla.exemplo@exemplo.com');
    await page.click('#vg-op-reenviar');
    await expect(page.locator('#vg-aviso-geral')).toContainText('Se a conta ainda estiver pendente, o link foi enviado de novo.');
    await expect(page.locator('#vg-op-reenviar-email')).toHaveValue('');
    await page.fill('#vg-op-ass-email', 'carla.exemplo@exemplo.com');
    await page.check('#vg-op-ass-leu');
    await page.click('#vg-op-ass-criar');
    await expect(page.locator('#vg-op-ass-email-erro')).toContainText('Este e-mail já tem conta.');
    // Empresa no balcão: já nasce verificada, com a conta pendente de quem responde por ela.
    await page.click('#vg-op-ass-empresa');
    await page.fill('#vg-op-ass-cnpj', '11222333000181');
    await page.fill('#vg-op-ass-razao', 'Loja Teste do Balcão Ltda');
    await page.fill('#vg-op-ass-fantasia', 'Loja Teste do Balcão');
    await page.fill('#vg-op-ass-nome', 'Marcos Exemplo');
    await page.fill('#vg-op-ass-email', 'marcos.balcao@exemplo.com');
    await page.check('#vg-op-ass-leu');
    await page.click('#vg-op-ass-criar');
    await expect(page.locator('#vg-op-ass-ok')).toContainText('Empresa Loja Teste do Balcão cadastrada e verificada.');
    await page.click('#vg-op-aba-empresas');
    await page.fill('#vg-op-emp-busca', 'Teste do Balcão');
    await expect(page.locator('#vg-op-empresas tbody tr')).toHaveCount(1);
    await expect(page.locator('#vg-op-empresas tbody tr .vg-status')).toHaveText('Verificada');
    await expect(page.locator('#vg-op-pendentes')).toHaveCount(0);
    expect(erros).toEqual([]);
  });

  test('boletim do dia: texto pronto do modelo, com a cidade do dado e os links curtos; copiar', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const erros = coletar(page);
    await entrarComo(page, 'operador@previa.com', 'boletim');
    const c = await cidadeAtual(page);
    const pre = page.locator('#vg-op-boletim-texto');
    await expect(pre).toContainText('*Vagas sem Caos · ' + c.nome + ' · ');
    await page.locator('#vg-op-boletim-periodo .vg-chip', { hasText: 'Últimos 7 dias' }).click();
    await expect(pre).toContainText('/v/');
    const texto = await pre.innerText();
    const linhas = texto.split('\n').filter((l) => l.startsWith('• '));
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.length).toBeLessThanOrEqual(10);
    for (const l of linhas) expect(l).toMatch(/ · vagas\.gestaosemcaos\.com\.br\/v\/[A-Z0-9]{6}$/);
    expect(texto).toContain('vagas.gestaosemcaos.com.br/' + c.slug + '/');
    expect(texto).toContain('Se alguém pedir em nosso nome, é golpe.');
    await page.click('#vg-op-boletim-copiar');
    await expect(page.locator('#vg-aviso-geral')).toContainText('Boletim copiado');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(texto);
    expect(erros).toEqual([]);
  });

  test('números, repasse e zonas: os 15 indicadores do banco (alvo e cor do dado), as duas situações de repasse e criar/editar/desativar zona', async ({ page }) => {
    const erros = coletar(page);
    await entrarComo(page, 'operador@previa.com', 'numeros');
    await expect(page.locator('#vg-op-tela h1')).toHaveText('Números da praça');
    const c = await cidadeAtual(page);
    const r = await page.evaluate((s) => window.VAGAS_API.opIndicadores(s), c.slug);
    const blocos = page.locator('#vg-op-numeros [data-indicador]');
    await expect(blocos).toHaveCount(r.indicadores.length);
    expect(r.indicadores.length).toBe(15);
    for (const i of r.indicadores) {
      await expect(page.locator('#vg-op-numeros [data-indicador="' + i.chave + '"]')).toHaveAttribute('data-cor', i.cor || '');
      await expect(page.locator('#vg-op-numeros [data-indicador="' + i.chave + '"] .vg-numero__rotulo')).toHaveText(i.nome);
    }
    await expect(page.locator('#vg-op-gatilhos [data-gatilho]')).toHaveCount(r.gatilhos.length);
    await expect(page.locator('#vg-op-selos tbody tr')).toHaveCount(5);
    await expect(page.locator('#vg-op-numeros-breve')).toHaveCount(0);
    // Repasse: o percentual vem de opResumo (linha de quem chama em vagas_operadores). 0 = operação própria.
    await page.click('#vg-op-aba-repasse');
    await expect(page.locator('#vg-op-tela h1')).toHaveText('Repasse do mês');
    expect(c.repassePercentual).toBe(0);
    await expect(page.locator('#vg-op-repasse-propria')).toContainText('Nesta praça não há repasse');
    // Praça com parceiro: a equipe muda o repasse da conta de operação e ela passa a ver a sua parte.
    await page.evaluate(async (slug) => {
      const A = window.VAGAS_API;
      await A.sair();
      await A.entrar('admin@previa.com', 'previa123');
      await A.admOperadorSalvar({ cidade: slug, email: 'operador@previa.com', papel: 'operador', repassePercentual: 30 });
      await A.sair();
      await A.entrar('operador@previa.com', 'previa123');
    }, c.slug);
    await page.reload();
    await expect(page.locator('#vg-op-repasse-blocos')).toContainText('percentual do contrato: 30%');
    await expect(page.locator('#vg-op-repasse-gratis')).toContainText('Grátis no lançamento');
    await expect(page.locator('#vg-op-repasse-propria')).toHaveCount(0);
    await page.click('#vg-op-aba-zonas');
    const zonas = page.locator('#vg-op-zonas > li');
    await expect(zonas.first()).toBeVisible();
    const antes = await zonas.count();
    await page.click('#vg-op-zona-nova');
    await page.click('#vg-op-zona-salvar');
    await expect(page.locator('#vg-op-zona-erro')).toHaveText('Informe o nome da zona.');
    await page.fill('#vg-op-zona-nome', 'Zona de Teste');
    await page.fill('#vg-op-zona-bairros', 'Bairro Um, Bairro Dois');
    await page.click('#vg-op-zona-salvar');
    await expect(page.locator('#vg-aviso-geral')).toContainText('Zona criada.');
    await expect(zonas).toHaveCount(antes + 1);
    const nova = page.locator('#vg-op-zonas > li[data-zona="zona-de-teste"]');
    await expect(nova).toContainText('Bairro Um, Bairro Dois');
    await nova.locator('[data-acao="editar"]').click();
    await page.fill('#vg-op-zona-bairros', 'Bairro Um');
    await page.click('#vg-op-zona-salvar');
    await expect(nova).not.toContainText('Bairro Dois');
    await nova.locator('[data-acao="desativar"]').click();
    await page.click('#vg-op-confirmar-sim');
    await expect(page.locator('#vg-aviso-geral')).toContainText('Zona desativada.');
    await expect(zonas).toHaveCount(antes);
    expect(erros).toEqual([]);
  });

  test('guarda de conta: sem login vai para o entrar; conta de pessoa não opera; a equipe escolhe entre todas as cidades', async ({ page }) => {
    await page.goto(BASE + 'operador.html#boletim');
    await page.waitForURL(/entrar\.html\?.*voltar=operador\.html/);
    await page.evaluate(() => window.VAGAS_API.entrar('pessoa@previa.com', 'previa123'));
    await page.goto(BASE + 'operador.html');
    await expect(page.locator('#vg-op-tela h1')).toHaveText('Sem permissão.');
    await expect(page.locator('#vg-trocar-conta')).toBeVisible();
    await expect(page.locator('#vg-menu')).toHaveCount(0);
    await page.evaluate(async () => { await window.VAGAS_API.sair(); await window.VAGAS_API.entrar('admin@previa.com', 'previa123'); });
    await page.goto(BASE + 'operador.html#fila');
    await page.reload();   // só a âncora mudou: recarrega para a página começar de novo com a conta da equipe
    const todas = await page.evaluate(() => window.VAGAS_API.opResumo().then((r) => r.cidades.map((c) => c.nome)));
    await expect(page.locator('#vg-op-cidade .vg-chip')).toHaveText(todas);
    await page.locator('#vg-op-cidade .vg-chip').nth(1).click();
    await expect(page.locator('#vg-op-tela .sobretitulo')).toHaveText('Moderação · ' + todas[1]);
    await expect(page.locator('#vg-op-papel')).toContainText('Equipe da Gestão sem Caos');
  });

  test('abaixo de 900 px o menu vira gaveta (botão Menu)', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await entrarComo(page, 'operador@previa.com');
    await expect(page.locator('#vg-op-tela h1')).toHaveText('Fila');
    await expect(page.locator('#vg-menu')).not.toBeInViewport();
    await page.click('#vg-menu-abrir');
    await expect(page.locator('#vg-menu')).toBeInViewport();
    await page.click('#vg-op-aba-boletim');
    await expect(page.locator('#vg-op-tela h1')).toHaveText('Boletim do dia');
    await expect(page.locator('#vg-menu')).not.toBeInViewport();
  });
});
