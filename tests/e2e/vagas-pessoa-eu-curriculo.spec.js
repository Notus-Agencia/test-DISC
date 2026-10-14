// Vagas sem Caos — área da pessoa: currículo em 5 passos (eu.html#curriculo/1…5), no celular (projeto vagas-celular), sobre a PRÉVIA.
// Conta nova do zero (erros nos campos, rascunho no aparelho, cartão cego sem nome e sem foto, "Currículo salvo"), "Quero" guardado
// (abre no passo que falta e volta para a vaga ao salvar), edição de quem já tem currículo (rascunho mais novo: continuar/descartar),
// foto opcional (reduzida para JPEG, aceite separado, nunca no cartão). A cidade vem de VAGAS_API.cidades(): nada de nome fixo.
const { test, expect } = require('@playwright/test');
const zlib = require('node:zlib');

const BASE = '/vagas/';
const SENHA = 'previa123';
// PNG liso de w x h (a tela reduz para 512 px no lado maior e converte para JPEG no aparelho).
function png(w, h) {
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, dados])) >>> 0);
    return Buffer.concat([tam, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linhas = [];
  for (let y = 0; y < h; y++) { linhas.push(Buffer.from([0])); linhas.push(Buffer.alloc(w * 3, 0x80)); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(Buffer.concat(linhas))), bloco('IEND', Buffer.alloc(0))]);
}
const PNG = png(800, 600);

function coletarErros(page) {
  const erros = [];
  page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404 \(Not Found\)/.test(m.text())) erros.push('console: ' + m.text()); });
  return erros;
}
async function entrarComo(page, email, destino) {
  await page.goto(BASE + 'entrar.html');
  await page.evaluate(([e, s]) => window.VAGAS_API.entrar(e, s), [email, SENHA]);
  await page.goto(BASE + 'eu.html#' + destino);
}
// Conta de pessoa nova (cadastro sem senha -> link da prévia -> senha), já logada.
async function contaNova(page, email, nome) {
  await page.goto(BASE + 'entrar.html');
  await page.evaluate(async ([e, n]) => {
    const r = await window.VAGAS_API.cadastrar({ email: e, tipo: 'pessoa', nome: n || 'Pessoa Teste', termosVersao: window.VAGAS_REGRAS.VERSAO_TERMOS });
    const link = window.VAGAS_API.linkDoEndereco({ search: '?' + r.linkPrevia.split('?')[1] });
    await window.VAGAS_API.confirmarLink(link);
    await window.VAGAS_API.definirSenha('senha-boa-123');
  }, [email, nome]);
}
// Cidade ativa da semente (com zonas): o teste não sabe qual é, pergunta à API.
async function cidadeAtiva(page) {
  return page.evaluate(async () => {
    const r = await window.VAGAS_API.cidades();
    const c = r.cidades.find((x) => x.status === 'ativa' && x.zonas.length);
    return { slug: c.slug, nome: c.nome, zona: c.zonas[0].slug, zonaNome: c.zonas[0].nome };
  });
}
async function passo(page, n) { await expect(page.locator('#vg-curriculo')).toHaveAttribute('data-passo', String(n)); await expect(page.locator('#vg-cv-passo-num')).toHaveText(String(n)); }
async function escolherCidade(page, c) {
  const chip = page.locator('#vg-cv-cidade-' + c.slug);
  if ((await chip.getAttribute('aria-pressed')) !== 'true') {
    await page.click('#vg-cv-avancar');
    await expect(page.locator('#vg-cv-cidades-erro')).toHaveText('Escolha pelo menos uma cidade.');
    await chip.click();
  }
  await page.click('#vg-cv-avancar');
  await expect(page.locator('#vg-cv-zona-erro')).toHaveText('Escolha a zona onde você mora ou pode trabalhar.');
  await expect(page.locator('#vg-cv-zona')).toHaveAttribute('aria-invalid', 'true');
  await page.click('#vg-cv-zona-' + c.zona);
  await expect(page.locator('#vg-cv-zona-erro')).toHaveCount(0);
}
async function passo2(page) {
  await page.click('#vg-cv-avancar');
  await expect(page.locator('#vg-cv-areas-erro')).toHaveText('Marque pelo menos uma área');
  await expect(page.locator('#vg-exp-cargo-erro')).toHaveText('Preencha o que você fazia ou toque em "Ainda não trabalhei"');
  await expect(page.locator('#vg-exp-cargo')).toHaveAttribute('aria-describedby', /vg-exp-cargo-erro/);
  for (const a of ['atendimento', 'caixa', 'vendas-loja']) await page.click('#vg-cv-area-' + a);
  await expect(page.locator('#vg-cv-areas-ajuda')).toHaveText('3 de 3 marcadas: Atendimento e recepção, Vendas em loja e balcão, Caixa e operação de loja.');
  await page.click('#vg-cv-area-administrativo');
  await expect(page.locator('#vg-cv-areas-erro')).toHaveText('Só dá para marcar 3');
  await expect(page.locator('#vg-cv-area-administrativo')).toHaveAttribute('aria-pressed', 'false');
  await page.click('#vg-cv-area-vendas-loja');
  await expect(page.locator('#vg-cv-area-tecnologia')).toHaveCount(0);
  await page.click('#vg-cv-areas-todas');
  await expect(page.locator('#vg-cv-areas .vg-chip')).toHaveCount(24);
  await page.fill('#vg-exp-cargo', 'Atendente de loja');
  await page.click('#vg-cv-avancar');
  await expect(page.locator('#vg-exp-tempo-erro')).toHaveText('Escolha por quanto tempo');
  await page.click('#vg-exp-tempo-1a3');
  await page.click('#vg-exp-carteira-nao');
  await page.click('#vg-cv-avancar');
}

test('conta nova: 5 passos com erro no campo certo, rascunho no aparelho, cartão cego sem nome e sem foto, "Currículo salvo"', async ({ page }) => {
  const erros = coletarErros(page);
  await contaNova(page, 'curriculo.novo@exemplo.com', 'Joana');   // "Como quer ser chamada(o)": só o primeiro nome
  const c = await cidadeAtiva(page);
  await page.goto(BASE + 'eu.html');
  await expect(page).toHaveURL(/eu\.html#curriculo\/1$/);
  await passo(page, 1);
  await expect(page.locator('#vg-nav')).toHaveCount(0);
  await expect(page.locator('#vg-barra-cv')).toContainText('Você pode parar e continuar depois: fica salvo aqui no celular.');
  await expect(page.locator('#vg-cv-foto-ajuda')).toHaveText('A empresa só vê sua foto depois que vocês combinarem de conversar. Sem foto não muda nada na sua candidatura.');
  await escolherCidade(page, c);
  await expect(page.locator('#vg-cv-rascunho')).toContainText('Rascunho salvo neste aparelho às');
  await page.click('#vg-cv-avancar');
  await passo(page, 2);
  await expect(page.locator('#vg-cv-titulo')).toBeFocused();
  await passo2(page);
  await passo(page, 3);

  // Rascunho no aparelho: recarregar a página não perde nada (conta sem currículo no banco: segue do rascunho sem perguntar).
  await page.reload();
  await passo(page, 3);
  await expect(page.locator('#vg-cv-rascunho-pergunta')).toHaveCount(0);
  await page.click('#vg-cv-voltar');
  await passo(page, 2);
  await expect(page.locator('#vg-exp-cargo')).toHaveValue('Atendente de loja');
  await expect(page.locator('#vg-exp-tempo-1a3')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#vg-cv-avancar');

  await passo(page, 3);
  await page.click('#vg-cv-avancar');
  await expect(page.locator('#vg-cv-escolaridade-erro')).toHaveText('Escolha a sua escolaridade.');
  await page.click('#vg-cv-escolaridade-medio');
  await page.fill('#vg-cv-cursos', 'Atendimento ao cliente');
  await page.click('#vg-cv-cursos-adicionar');
  await expect(page.locator('#vg-cv-cursos-lista .vg-chip')).toHaveText(['Atendimento ao cliente']);
  await page.fill('#vg-cv-cursos', 'Informática básica');   // digitado e não adicionado: entra ao continuar
  await page.click('#vg-cv-cnh-B');
  await page.click('#vg-cv-avancar');

  await passo(page, 4);
  await page.click('#vg-cv-avancar');
  await expect(page.locator('#vg-cv-turnos-erro')).toHaveText('Marque pelo menos um turno em que pode trabalhar.');
  await expect(page.locator('#vg-cv-modalidades-erro')).toHaveText('Marque pelo menos um tipo de vaga (CLT, temporário, diária, freelancer ou estágio).');
  await expect(page.locator('#vg-cv-nome')).toHaveValue('Joana');   // nome do cadastro (vagas_eu) já vem preenchido
  await expect(page.locator('#vg-cv-nome-erro')).toHaveText('Informe seu nome e sobrenome.');
  await expect(page.locator('#vg-cv-whatsapp-erro')).toHaveText('Escreva o WhatsApp com DDD e o número do celular, só os números (11 dígitos).');
  await expect(page.locator('#vg-cv-turnos .vg-chip').first()).toBeFocused();
  await page.click('#vg-cv-turnos-manha');
  await page.click('#vg-cv-turnos-tarde');
  await page.click('#vg-cv-modalidades-clt');
  await page.click('#vg-cv-modalidades-diaria');
  await page.fill('#vg-cv-pretensao', '1.700');
  await page.fill('#vg-cv-nome', 'Pessoa Teste Nova');
  await page.fill('#vg-cv-whatsapp', '62 9912-345');
  await page.click('#vg-cv-avancar');
  await expect(page.locator('#vg-cv-whatsapp-erro')).toBeVisible();
  await expect(page.locator('#vg-cv-nome-erro')).toHaveCount(0);
  await page.fill('#vg-cv-whatsapp', '(62) 99123-4567');
  await page.click('#vg-cv-avancar');

  await passo(page, 5);
  const previa = page.locator('#vg-cv-previa');
  await expect(previa).toContainText('Pessoa candidata');
  await expect(previa).toContainText(c.zonaNome + ', ' + c.nome);
  await expect(previa).toContainText('Atendimento e recepção, Caixa e operação de loja');
  await expect(previa).toContainText('Atendente de loja, 2 anos e 1 mês');
  await expect(previa).toContainText('Médio completo');
  await expect(previa).toContainText('Manhã, Tarde');
  await expect(previa).toContainText('A partir de R$ 1.700');
  await expect(previa).toContainText('Atendimento ao cliente, Informática básica');
  await expect(previa).not.toContainText('Pessoa Teste Nova');
  await expect(previa).not.toContainText('99123');
  await expect(previa.locator('img')).toHaveCount(0);
  await expect(page.locator('#vg-cv-previa-nota')).toContainText('Sua foto, nome e contato só aparecem depois do Combinou.');
  await expect(page.locator('#vg-cv-banco')).not.toBeChecked();
  await expect(page.locator('#vg-cv-concluir')).toHaveClass(/botao--laranja/);
  await page.click('#vg-cv-concluir');
  await expect(page.locator('#vg-cv-pronto-titulo')).toHaveText('Currículo salvo');
  await expect(page.locator('#vg-cv-pronto')).toContainText('Mostre o que você sabe fazer: faça o teste da função no celular e ganhe o selo de habilidade testada.');
  await expect(page.locator('#vg-nav-eu')).toHaveAttribute('aria-current', 'page');
  const banco = await page.evaluate(async () => ({ m: await window.VAGAS_API.minhaPessoa(), r: localStorage.getItem('vg.rascunho.curriculo') }));
  expect(banco.m.completo).toBe(true);
  expect(banco.m.pessoa.areas).toEqual(['atendimento', 'caixa']);
  expect(banco.m.pessoa.experiencias[0]).toMatchObject({ funcao: 'Atendente de loja', informal: true, fim: expect.stringMatching(/^\d{4}-\d{2}$/) });
  expect(banco.m.pessoa.whatsapp).toBe('5562991234567');
  expect(banco.r).toBeNull();
  expect(erros).toEqual([]);
});

test('"Quero" guardado pela vaga: abre no passo que falta com o aviso e, ao salvar, volta para a vaga (que envia sozinha)', async ({ page }) => {
  await contaNova(page, 'quero.guardado@exemplo.com');
  const c = await cidadeAtiva(page);
  await page.goto(BASE + 'eu.html#curriculo/1');
  await passo(page, 1);
  await escolherCidade(page, c);
  await page.click('#vg-cv-avancar');
  await passo(page, 2);
  await passo2(page);
  await passo(page, 3);
  const codigo = await page.evaluate(async (cidade) => {
    const r = await window.VAGAS_API.anuncios({ cidade });
    const a = r.anuncios[0];
    localStorage.setItem('vg.quero', JSON.stringify({ codigo: a.codigo, id: a.id, em: Date.now() }));
    return a.codigo;
  }, c.slug);
  await page.goto(BASE + 'eu.html#curriculo/1');
  await page.waitForURL(/#curriculo\/3$/);
  await expect(page.locator('#vg-cv-intencao')).toHaveText('Falta terminar o currículo (passo 3 de 5). Depois a candidatura é enviada sozinha.');
  await page.click('#vg-cv-escolaridade-fundamental');
  await page.click('#vg-cv-avancar');
  await passo(page, 4);
  await page.click('#vg-cv-turnos-noite');
  await page.click('#vg-cv-modalidades-temporario');
  await page.fill('#vg-cv-nome', 'Pessoa Com Intencao');
  await page.fill('#vg-cv-whatsapp', '62991234567');
  await page.click('#vg-cv-avancar');
  await passo(page, 5);
  await page.click('#vg-cv-concluir');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Currículo salvo. Enviando a sua candidatura…');
  await page.waitForURL(new RegExp('vaga\\.html\\?vaga=' + codigo + '$'));
  // A página da vaga (casca) envia sozinha: 1ª candidatura pede o aceite pessoa_candidatura e mostra "Candidatura enviada".
  await expect(page.locator('#vg-janela-candidatura')).toBeVisible();
  await page.check('#vg-aceite-candidatura');
  await page.click('#vg-aceite-enviar');
  await expect(page.locator('#vg-quero-ok-titulo')).toHaveText('Candidatura enviada');
  const k = await page.evaluate(async () => ({ lista: (await window.VAGAS_API.minhasCandidaturas()).candidaturas.map((x) => [x.anuncio.codigo, x.status]),
    quero: localStorage.getItem('vg.quero') }));
  expect(k.lista).toEqual([[codigo, 'enviada']]);
  expect(k.quero).toBeNull();
});

test('editar o currículo (pessoa da semente): rascunho mais novo pergunta "Continuar dele?"; continuar, descartar e salvar', async ({ page }) => {
  await entrarComo(page, 'pessoa@previa.com', 'curriculo/4');
  await passo(page, 4);
  await expect(page.locator('#vg-cv-nome')).not.toHaveValue('');
  await page.fill('#vg-cv-pretensao', '1900');
  await expect(page.locator('#vg-cv-rascunho')).toContainText('Rascunho salvo neste aparelho às');
  await page.reload();
  await passo(page, 4);
  await expect(page.locator('#vg-cv-rascunho-pergunta')).toContainText('Continuar dele?');
  await expect(page.locator('#vg-cv-pretensao')).toHaveValue('');
  await page.click('#vg-cv-rascunho-continuar');
  await expect(page.locator('#vg-cv-pretensao')).toHaveValue('1900');
  await page.click('#vg-cv-avancar');   // já completo: grava a cada passo
  await passo(page, 5);
  await expect(page.locator('#vg-cv-previa')).toContainText('A partir de R$ 1.900');
  await page.click('#vg-cv-concluir');
  await page.waitForURL(/#dados$/);
  await expect(page.locator('#vg-aviso-geral')).toContainText('Salvo');
  expect(await page.evaluate(async () => (await window.VAGAS_API.minhaPessoa()).pessoa.pretensaoCentavos)).toBe(190000);

  await page.goto(BASE + 'eu.html#curriculo/4');
  await page.fill('#vg-cv-pretensao', '2500');
  await expect(page.locator('#vg-cv-rascunho')).toContainText('Rascunho salvo');
  await page.reload();
  await page.click('#vg-cv-rascunho-descartar');
  await expect(page.locator('#vg-cv-rascunho-pergunta')).toHaveCount(0);
  await expect(page.locator('#vg-cv-pretensao')).toHaveValue('1900');
  expect(await page.evaluate(() => localStorage.getItem('vg.rascunho.curriculo'))).toBeNull();
});

test('rascunho de outra conta no mesmo celular não aparece', async ({ page }) => {
  await entrarComo(page, 'pessoa@previa.com', 'curriculo/4');
  await page.fill('#vg-cv-pretensao', '3100');
  await expect(page.locator('#vg-cv-rascunho')).toContainText('Rascunho salvo');
  await contaNova(page, 'outra.pessoa@exemplo.com');
  await page.goto(BASE + 'eu.html#curriculo/4');
  await passo(page, 4);
  await expect(page.locator('#vg-cv-pretensao')).toHaveValue('');
  await expect(page.locator('#vg-cv-rascunho-pergunta')).toHaveCount(0);
});

test('foto opcional: reduz para JPEG no aparelho, pede o aceite separado, guarda; nunca vai para o cartão do passo 5; remover apaga', async ({ page }) => {
  const erros = coletarErros(page);
  await entrarComo(page, 'pessoa@previa.com', 'curriculo/1');
  await passo(page, 1);
  await expect(page.locator('#vg-cv-foto-escolher')).toHaveText('Escolher foto');
  await page.setInputFiles('#vg-cv-foto-arquivo', { name: 'rosto.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#vg-cv-foto-consentimento')).toContainText('Autorizo mostrar a minha foto só às empresas com quem eu combinar de conversar.');
  await expect(page.locator('#vg-cv-foto-consentimento')).not.toContainText('[REVISÃO');
  await expect(page.locator('#vg-cv-foto-aceite')).not.toBeChecked();
  await page.click('#vg-cv-foto-enviar');
  await expect(page.locator('#vg-cv-foto-aceite-erro')).toHaveText('Marque a caixa para continuar');
  await page.check('#vg-cv-foto-aceite');
  await page.click('#vg-cv-foto-enviar');
  await expect(page.locator('#vg-cv-foto-previa img')).toBeVisible();
  await expect(page.locator('#vg-cv-foto-remover')).toBeVisible();
  const foto = await page.evaluate(async () => {
    const url = (await window.VAGAS_API.fotoUrl()).url;
    const img = new Image();
    await new Promise((ok) => { img.onload = ok; img.src = url; });
    return { tipo: url.slice(0, 15), w: img.naturalWidth, h: img.naturalHeight };
  });
  expect(foto).toEqual({ tipo: 'data:image/jpeg', w: 512, h: 384 });
  await page.reload();
  await expect(page.locator('#vg-cv-foto-previa img')).toHaveAttribute('src', /^data:image\/jpeg/);
  await page.goto(BASE + 'eu.html#curriculo/5');
  await passo(page, 5);
  await expect(page.locator('#vg-cv-previa img')).toHaveCount(0);
  await expect(page.locator('#vg-cv-previa')).not.toContainText('Ana Clara');
  await page.goto(BASE + 'eu.html#curriculo/1');
  await page.click('#vg-cv-foto-remover');
  await expect(page.locator('#vg-aviso-geral')).toContainText('Foto removida.');
  await expect(page.locator('#vg-cv-foto-escolher')).toHaveText('Escolher foto');
  const semFoto = await page.evaluate(() => window.VAGAS_API.fotoUrl().then(() => 'tem', (e) => (e.semFoto ? 'semFoto' : e.message)));
  expect(semFoto).toBe('semFoto');
  expect(erros).toEqual([]);
});
