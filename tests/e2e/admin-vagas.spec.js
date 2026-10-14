'use strict';
// Painel do DISC — grupo "Vagas" (js/admin-vagas.js) na prévia (API simulada). Sem ?vagas=1 a prévia do painel fica exatamente
// como era (sem o grupo); com ?vagas=1: cidades e praças, operadores, moderação geral e números da praça, com dados fictícios do
// próprio módulo. Nenhum teste depende de nome ou endereço de cidade (tudo é lido da tela ou do dado).
const { test, expect } = require('@playwright/test');
const { coletarErros, configurar } = require('./util.js');

async function entrar(page, url) {
  await configurar(page, { API_URL: 'simulada' });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(url || '/admin.html');
  await page.fill('#campo-email', 'admin@previa.com');
  await page.fill('#campo-senha', 'previa123');
  await page.click('#btn-entrar');
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#contagem')).not.toHaveText('Carregando…');
}
const abrir = (page, aba) => page.locator('.aba[data-aba="' + aba + '"]').click();

test('sem ?vagas=1 a prévia do painel continua igual: nenhum item do grupo Vagas', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page);
  await expect(page.locator('.menu-grupo[data-grupo="vagas"]')).toBeHidden();
  await expect(page.locator('.aba[data-aba^="vg-"]:visible')).toHaveCount(0);
  await expect(page.locator('.menu-grupo__titulo:visible')).toHaveText(['Seleção', 'Empresas', 'Vendas', 'Configurações']);
  expect(erros).toEqual([]);
});

test('com ?vagas=1: grupo Vagas entre Empresas e Vendas; cidades e praças com situação do dado; nova cidade e mudança de situação com o efeito', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page, '/admin.html?vagas=1');
  await expect(page.locator('.menu-grupo__titulo:visible')).toHaveText(['Seleção', 'Empresas', 'Vagas', 'Vendas', 'Configurações']);
  await expect(page.locator('.menu-grupo[data-grupo="vagas"] .aba:visible .aba__texto')).toHaveText(['Cidades e praças', 'Aviso de abertura', 'Operadores', 'Moderação geral', 'Números da praça']);
  await abrir(page, 'vg-cidades');
  await expect(page.locator('#vista-vg-cidades h2')).toHaveText('Cidades e praças');
  await expect(page.locator('#vista-vg-cidades h2')).toBeFocused();
  await expect(page.locator('.aba[data-aba="vg-cidades"]')).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveURL(/#vg-cidades$/);
  const cartoes = page.locator('#vg-adm-cidades > li');
  await expect(cartoes.first()).toBeVisible();
  const n = await cartoes.count();
  await expect(page.locator('#vg-adm-cidades > li[data-status="ativa"]').first()).toContainText('Vagas no ar');
  await expect(page.locator('#aba-n-vg-moderacao')).toHaveText(/^\d+$/);
  // Praça com entorno: a cidade-polo lista as vizinhas e a vizinha diz de quem é entorno (tudo do dado).
  await expect(page.locator('#vg-adm-cidades > li', { hasText: 'Praça: ' }).first()).toBeVisible();
  await expect(page.locator('#vg-adm-cidades > li', { hasText: 'Entorno de ' }).first()).toBeVisible();

  // Nova cidade: o endereço é sugerido a partir do nome + UF e ela nasce rascunho.
  await page.click('#vg-adm-nova-cidade');
  await page.fill('#vg-adm-cid-nome', 'Cidade de Teste');
  await page.fill('#vg-adm-cid-uf', 'go');
  await expect(page.locator('#vg-adm-cid-slug')).toHaveValue('cidade-de-teste-go');
  await page.fill('#vg-adm-cid-ibge', '123');
  await page.click('#janela-ok');
  await expect(page.locator('#janela-erro')).toHaveText('O código IBGE tem 7 números.');
  await page.fill('#vg-adm-cid-ibge', '');
  await page.click('#janela-ok');
  await expect(page.locator('#aviso-geral')).toContainText('Cidade criada como rascunho: Cidade de Teste.');
  await expect(cartoes).toHaveCount(n + 1);
  const nova = page.locator('#vg-adm-cidades > li[data-cidade="cidade-de-teste-go"]');
  await expect(nova).toHaveAttribute('data-status', 'rascunho');
  await nova.locator('[data-acao="lista"]').click();
  await expect(page.locator('#confirmar-desc')).toContainText('Abrir a lista de espera de Cidade de Teste');
  await page.click('#confirmar-ok');
  await expect(nova).toHaveAttribute('data-status', 'lista_espera');

  // Pausar mostra o efeito antes (esconde N vagas; nada é apagado) e Reativar volta.
  const ativa = page.locator('#vg-adm-cidades > li[data-status="ativa"]').first();
  const slug = await ativa.getAttribute('data-cidade');
  await ativa.locator('[data-acao="pausar"]').click();
  await expect(page.locator('#confirmar-desc')).toHaveText(/esconde \d+ vagas? e bloqueia cadastros novos; nada é apagado\.$/);
  await page.click('#confirmar-ok');
  const mesma = page.locator('#vg-adm-cidades > li[data-cidade="' + slug + '"]');
  await expect(mesma).toHaveAttribute('data-status', 'pausada');
  await mesma.locator('[data-acao="reativar"]').click();
  await page.click('#confirmar-ok');
  await expect(mesma).toHaveAttribute('data-status', 'ativa');
  // Lista de espera abaixo da meta: "Ativar (faltam N)" desligado.
  await expect(page.locator('#vg-adm-cidades > li[data-status="lista_espera"] [data-acao="ativar"]').first()).toBeDisabled();

  // Zonas da cidade.
  await mesma.locator('[data-acao="zonas"]').click();
  const zonas = await page.locator('#vg-adm-zonas > li').count();
  await page.fill('#vg-adm-zona-nome', 'Zona Teste');
  await page.fill('#vg-adm-zona-bairros', 'Um, Dois');
  await page.click('#janela-ok');
  await expect(page.locator('#aviso-geral')).toContainText('Zona criada');
  await expect(mesma.locator('[data-acao="zonas"]')).toHaveText('Zonas (' + (zonas + 1) + ')');
  expect(erros).toEqual([]);
});

test('aviso de abertura: resumo só com contagens; e-mail em lotes com confirmação na tela; WhatsApp um contato por vez (abrir, Feito, pular)', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page, '/admin.html?vagas=1');
  // Pela cidade aberta em Cidades e praças ("Avisar a lista"), sem nome fixo.
  await abrir(page, 'vg-cidades');
  const ativa = page.locator('#vg-adm-cidades > li[data-status="ativa"]').first();
  const slug = await ativa.getAttribute('data-cidade');
  await ativa.locator('[data-acao="avisar"]').click();
  await expect(page.locator('#vista-vg-aviso h2')).toHaveText('Aviso de abertura');
  await expect(page.locator('.aba[data-aba="vg-aviso"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#vg-adm-aviso-cidade')).toHaveAttribute('value', slug);
  const resumo = page.locator('#vg-adm-aviso-resumo');
  await expect(resumo).toHaveAttribute('data-status', 'ativa');
  const n = async (k) => Number((await resumo.locator('[data-contagem="' + k + '"] .vg-adm-numero__valor').innerText()).replace(/\D/g, ''));
  const faltaEmail = await n('aAvisarEmail');
  expect(faltaEmail).toBeGreaterThan(0);
  await expect(resumo).toContainText('a lista de espera é apagada em');
  await expect(page.locator('#vista-vg-aviso')).not.toContainText('@', { timeout: 1000 });
  // E-mail: a 1ª vez pede confirmação na própria tela; cancelar não manda nada.
  await page.click('#vg-adm-aviso-enviar');
  await expect(page.locator('#vg-adm-aviso-confirmar')).toContainText('Enviar agora até ' + Math.min(25, faltaEmail) + ' e-mails');
  await expect(page.locator('#vg-adm-aviso-enviar')).toBeHidden();
  await page.click('#vg-adm-aviso-enviar-nao');
  await expect(page.locator('#vg-adm-aviso-confirmar')).toHaveCount(0);
  expect(await n('aAvisarEmail')).toBe(faltaEmail);
  await page.click('#vg-adm-aviso-enviar');
  await page.click('#vg-adm-aviso-enviar-sim');
  await expect(page.locator('#vg-adm-aviso-lote')).toContainText(/Último lote: \d+ enviados · 1 falha · faltam \d+\. Quem falhou volta para a fila/);
  const depois1 = await n('aAvisarEmail');
  expect(depois1).toBeLessThan(faltaEmail);
  // Os lotes seguintes saem direto, até terminar.
  for (let i = 0; i < 5; i++) {
    const antes = await n('aAvisarEmail');
    if (!antes) break;
    await page.click('#vg-adm-aviso-enviar');
    await expect(page.locator('#vg-adm-aviso-confirmar')).toHaveCount(0);
    await expect.poll(() => n('aAvisarEmail')).toBeLessThan(antes);
  }
  await expect(page.locator('#vg-adm-aviso-lote')).toContainText('nenhum e-mail falta.');
  await expect(page.locator('#vg-adm-aviso-enviar')).toBeDisabled();
  await expect(page.locator('#vg-adm-aviso-enviar')).toHaveText('Todos já foram avisados por e-mail');
  // WhatsApp: nada aparece antes de pedir; depois, UM contato com o link wa.me pronto (nova aba) e Feito.
  await expect(page.locator('#vg-adm-aviso-contato')).toHaveCount(0);
  const faltaWa = await n('aAvisarWhatsapp');
  expect(faltaWa).toBeGreaterThan(1);
  await page.click('#vg-adm-aviso-wa-proximo');
  const contato = page.locator('#vg-adm-aviso-contato');
  await expect(contato).toHaveCount(1);
  await expect(page.locator('#vg-adm-aviso-wa-numero')).toHaveText(/^\+55 \d{2} \d{4,5}-\d{4}$/);
  const link = page.locator('#vg-adm-aviso-wa-abrir');
  await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/55\d{10,11}\?text=/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#vg-adm-aviso-wa-texto')).toContainText('Nunca pague para se candidatar.');
  const primeiro = await contato.getAttribute('data-contato');
  // Feito sem abrir = pular: confirma na própria tela; "Voltar" não marca.
  await page.click('#vg-adm-aviso-wa-feito');
  await expect(page.locator('#vg-adm-aviso-wa-pular')).toContainText('Marcar como feito sem abrir no WhatsApp?');
  await page.click('#vg-adm-aviso-wa-pular-nao');
  await expect(page.locator('#vg-adm-aviso-wa-pular')).toHaveCount(0);
  await expect(contato).toHaveAttribute('data-contato', primeiro);
  // Abrir no WhatsApp (nova aba) e Feito: marca e já mostra o próximo.
  const [aba] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await aba.close();
  await page.click('#vg-adm-aviso-wa-feito');
  await expect(page.locator('#aviso-geral')).toContainText('Contato marcado como avisado.');
  await expect(contato).not.toHaveAttribute('data-contato', primeiro);
  expect(await n('aAvisarWhatsapp')).toBe(faltaWa - 1);
  await expect(page.locator('#vista-vg-aviso [data-contato]')).toHaveCount(1);
  // Pular o próximo (número que não é de WhatsApp).
  await page.click('#vg-adm-aviso-wa-feito');
  await page.click('#vg-adm-aviso-wa-pular-sim');
  await expect.poll(() => n('aAvisarWhatsapp')).toBe(faltaWa - 2);
  // Cidade em lista de espera: só o resumo e o aviso de que ainda não abriu.
  await page.click('#vg-adm-aviso-cidade');
  await page.locator('#vg-adm-aviso-cidade-lista [data-valor]').filter({ hasText: 'lista de espera' }).first().click();
  await expect(resumo).toHaveAttribute('data-status', 'lista_espera');
  await expect(page.locator('#vg-adm-aviso-fechada')).toContainText('ainda não está aberta');
  await expect(page.locator('#vg-adm-aviso-enviar, #vg-adm-aviso-wa-proximo')).toHaveCount(0);
  // Tudo no registro, sem o número.
  await abrir(page, 'vg-moderacao');
  await expect(page.locator('#vg-adm-moderacao')).toContainText('Avisou um contato pelo WhatsApp');
  await expect(page.locator('#vg-adm-moderacao')).not.toContainText('556298000');
  expect(erros).toEqual([]);
});

test('operadores: lista com papel, contrato e repasse; convidar, editar o repasse e desligar', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page, '/admin.html?vagas=1');
  await abrir(page, 'vg-operadores');
  await expect(page.locator('#vista-vg-operadores h2')).toHaveText('Operadores');
  const linhas = page.locator('#vg-adm-operadores tbody tr');
  await expect(linhas.first()).toBeVisible();
  const n = await linhas.count();
  await page.click('#vg-adm-novo-operador');
  await expect(page.locator('#vg-adm-op-contrato')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await page.fill('#vg-adm-op-email', 'nao-e-email');
  await page.click('#janela-ok');
  await expect(page.locator('#janela-erro')).toHaveText('E-mail inválido.');
  await page.fill('#vg-adm-op-email', 'nova.operacao@exemplo.com');
  await page.click('#vg-adm-op-papel');
  await page.locator('#vg-adm-op-papel-lista [data-valor="moderador"]').click();
  await page.fill('#vg-adm-op-repasse', '20');
  await page.click('#janela-ok');
  await expect(page.locator('#aviso-geral')).toContainText('Convite enviado para nova.operacao@exemplo.com.');
  await expect(linhas).toHaveCount(n + 1);
  const linha = page.locator('#vg-adm-operadores tr[data-operador="nova.operacao@exemplo.com"]');
  await expect(linha).toContainText('Moderação');
  await expect(linha).toContainText('20%');
  // Conta do convite ainda não confirmada (vagas_adm_operadores.contaStatus = 'pendente').
  await expect(linha).toHaveAttribute('data-conta', 'pendente');
  await expect(linha.locator('.vg-adm-situacao')).toHaveText('aguardando confirmar o e-mail do convite');
  await linha.locator('[data-acao="editar"]').click();
  await expect(page.locator('#vg-adm-op-email')).toHaveAttribute('readonly', '');
  await page.fill('#vg-adm-op-repasse', '0');
  await page.click('#janela-ok');
  await expect(linha).toContainText('0% (própria)');
  await linha.locator('[data-acao="desligar"]').click();
  await expect(page.locator('#confirmar-desc')).toContainText('perde o acesso');
  await page.click('#confirmar-ok');
  await expect(linha).toContainText('desligado');
  await expect(linha.locator('[data-acao="desligar"]')).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('moderação geral: pendências no topo, registro com filtros e "Reverter" onde há volta (registra um ato novo)', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page, '/admin.html?vagas=1');
  await abrir(page, 'vg-moderacao');
  await expect(page.locator('#vista-vg-moderacao h2')).toHaveText('Moderação geral');
  await expect(page.locator('#vg-adm-pendencias .vg-adm-pendencia').first()).toContainText('esperando');
  const linhas = page.locator('#vg-adm-moderacao tbody tr');
  await expect(linhas.first()).toBeVisible();
  const n = await linhas.count();
  await expect(page.locator('#vg-adm-abrir-fila')).toHaveAttribute('href', /\/operador\.html#fila$/);
  await page.click('#vg-adm-mod-tipo');
  await page.locator('#vg-adm-mod-tipo-lista [data-valor="empresa"]').click();
  const empresas = await linhas.count();
  expect(empresas).toBeLessThan(n);
  for (let i = 0; i < empresas; i++) await expect(linhas.nth(i)).toContainText('Empresa');
  const reverter = page.locator('#vg-adm-moderacao tr[data-acao="empresa_suspender"] [data-acao="reverter"]');
  await reverter.click();
  await page.click('#confirmar-ok');
  await expect(page.locator('#aviso-geral')).toContainText('Revertido');
  await expect(linhas.first()).toHaveAttribute('data-acao', 'empresa_reativar');
  await page.fill('#vg-adm-mod-busca', 'xyz sem resultado');
  await expect(page.locator('#vg-adm-moderacao-vazio')).toContainText('Nada com esse filtro.');
  expect(erros).toEqual([]);
});

test('números da praça: 15 indicadores com alvo, etiqueta de cor e gatilhos; trocar a praça; o endereço #vg-numeros abre direto', async ({ page }) => {
  const erros = coletarErros(page);
  await entrar(page, '/admin.html?vagas=1');
  await abrir(page, 'vg-numeros');
  await expect(page.locator('#vista-vg-numeros h2')).toHaveText('Números da praça');
  await expect(page.locator('#vg-adm-numeros [data-indicador]')).toHaveCount(15);
  await expect(page.locator('#vg-adm-numeros [data-indicador="vagas_ativas"] .vg-adm-numero__alvo')).toContainText('alvo ');
  const comCor = page.locator('#vg-adm-numeros [data-indicador][data-cor]:not([data-cor=""])');
  expect(await comCor.count()).toBeGreaterThan(0);
  await expect(comCor.first().locator('.selo')).toHaveText(/^(No alvo|Perto do alvo|Longe do alvo)$/);
  await expect(page.locator('#vg-adm-numeros [data-indicador="receita_liquida_centavos"]')).toContainText('Grátis no lançamento');
  await expect(page.locator('#vg-adm-selos tbody tr')).toHaveCount(5);
  await expect(page.locator('#vg-adm-gatilhos > ul > li')).toHaveCount(5);
  // Números pequenos de pessoas protegidos (cidade pequena): "menos de 3" e "contado até ontem", nunca 0.
  await expect(page.locator('#vg-adm-numeros-protegidos')).toContainText('até ontem');
  await expect(page.locator('#vg-adm-numeros [data-indicador="contratacoes"] .vg-adm-numero__valor')).toHaveText('menos de 3');
  await expect(page.locator('#vg-adm-numeros [data-indicador="contratacoes"]')).toContainText('contado até ontem');
  await expect(page.locator('#vg-adm-selos tbody')).toContainText('menos de 3');
  const sobre = page.locator('#vista-vg-numeros .sobretitulo');
  const antes = await sobre.innerText();
  await page.click('#vg-adm-num-cidade');
  const opcoes = page.locator('#vg-adm-num-cidade-lista [role="option"]');
  expect(await opcoes.count()).toBeGreaterThan(1);
  await opcoes.nth(1).click();
  await expect(sobre).not.toHaveText(antes);
  await page.reload();
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#vista-vg-numeros h2')).toHaveText('Números da praça');
  await expect(page.locator('#vg-adm-numeros [data-indicador]')).toHaveCount(15);
  expect(erros).toEqual([]);
});

test('sair limpa as telas do Vagas (o próximo login não vê nada do anterior)', async ({ page }) => {
  await entrar(page, '/admin.html?vagas=1');
  await abrir(page, 'vg-cidades');
  await expect(page.locator('#vg-adm-cidades > li').first()).toBeVisible();
  await page.click('#btn-usuario');
  await page.click('#btn-sair');
  await expect(page.locator('#form-login')).toBeVisible();
  await expect(page.locator('#vista-vg-cidades')).toBeHidden();
  expect(await page.locator('#vista-vg-cidades').evaluate((n) => n.childElementCount)).toBe(0);
});

// Supabase (sem rede): DISC_API falso no modo supabase e as RPCs do Vagas respondidas por page.route. O grupo só aparece quando o
// versaoBanco declara a migração do Vagas; as chamadas levam a chave pública e o token da sessão do painel.
const API_SUPABASE_VAGAS = `
(function () {
  var dona = { id: 'u1', nome: 'Equipe Teste', email: 'equipe@empresa.com', papel: 'admin' };
  function ok(x) { return Promise.resolve(Object.assign({ ok: true }, x || {})); }
  window.DISC_API = Object.assign({}, window.DISC_API, {
    MODO: 'supabase', listarPedidos: undefined,
    configurado: function () { return true; },
    login: function () { window.__logado = true; return ok({ token: 'tk-painel', usuario: dona }); },
    sair: function () { window.__logado = false; return ok(); },
    // Antes do login não há sessão guardada (a página abre na tela de entrada, como no painel de verdade).
    sessaoAtual: function () {
      if (!window.__logado) { var e = new Error('Sessão expirada. Entre de novo.'); e.sessaoExpirada = true; return Promise.reject(e); }
      return ok({ token: 'tk-sessao-renovada', usuario: dona });
    },
    listar: function () { return ok({ itens: [] }); },
    processosListar: function () { return ok({ processos: [] }); },
    listarUsuarios: function () { return ok({ usuarios: [] }); },
    listarEmpresas: function () { return ok({ empresas: [] }); },
    clickupStatus: function () { return ok({ configurado: false }); },
    versaoBanco: function () { return ok({ versao: window.__versaoBanco || 20261022120000, faltando: [] }); }
  });
})();
`;
async function simularSupabaseVagas(page, versao) {
  await configurar(page, { BACKEND: 'supabase', API_URL: 'https://projeto-teste.supabase.co', SUPABASE_URL: 'https://projeto-teste.supabase.co', SUPABASE_ANON_KEY: 'anon-publica', VAGAS_PAINEL: true });
  if (versao) await page.addInitScript((v) => { window.__versaoBanco = v; }, versao);
  await page.route('**/assets/vendor/supabase.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: '/* sem supabase-js */' }));
  await page.route('**/js/api-supabase.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: API_SUPABASE_VAGAS }));
  const chamadas = [];
  const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  await page.route('https://projeto-teste.supabase.co/**', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const nome = new URL(req.url()).pathname.replace('/rest/v1/rpc/', '');
    chamadas.push({ nome, headers: req.headers(), corpo: req.postDataJSON() });
    const resp = (status, corpo) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(corpo) });
    if (nome === 'vagas_op_resumo') {
      return resp(200, { ok: true, cidades: [{ id: 'c1', slug: 'praca-um-go', nome: 'Praça Um', status: 'ativa', papel: 'admin',
        contagens: { anunciosNoAr: 3, anunciosEmRevisao: 1, anunciosSuspensos: 0, empresasAtivas: 2, empresasEmAnalise: 0, denunciasAbertas: 0, pessoas: 9, listaEspera: 0 } }] });
    }
    if (nome === 'vagas_cidades_publicas') {
      return resp(200, { ok: true, cidades: [{ slug: 'praca-um-go', nome: 'Praça Um', uf: 'GO', status: 'ativa', fuso: 'America/Sao_Paulo', praca: null,
        zonas: [{ slug: 'centro', nome: 'Centro', bairros: [] }], interessados: null, metaListaEspera: null }] });
    }
    return resp(404, { code: 'PGRST202', message: 'Could not find the function public.' + nome });
  });
  return chamadas;
}
async function entrarSupabase(page) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/admin.html');
  await page.fill('#campo-email', 'equipe@empresa.com');
  await page.fill('#campo-senha', 'qualquer-1');
  await page.click('#btn-entrar');
  await expect(page.locator('#tela-painel')).toBeVisible({ timeout: 15000 });
}

test('Supabase: o grupo aparece com a migração do Vagas no banco e as RPCs levam a chave pública e o token da sessão do painel', async ({ page }) => {
  const erros = coletarErros(page);
  const chamadas = await simularSupabaseVagas(page);
  await entrarSupabase(page);
  await expect(page.locator('.aba[data-aba="vg-cidades"]')).toBeVisible();
  await abrir(page, 'vg-cidades');
  await expect(page.locator('#vg-adm-cidades > li')).toHaveCount(1);
  await expect(page.locator('#vg-adm-cidades > li [data-acao="zonas"]')).toHaveText('Zonas (1)');
  const resumo = chamadas.filter((c) => c.nome === 'vagas_op_resumo')[0];
  expect(resumo.headers.authorization).toBe('Bearer tk-sessao-renovada');
  expect(resumo.headers.apikey).toBe('anon-publica');
  expect(chamadas.some((c) => c.nome === 'vagas_adm_cidades')).toBe(true);
  // Sem vagas_adm_operadores (pedido ao banco): a lista fica indisponível; convidar continua.
  await abrir(page, 'vg-operadores');
  await expect(page.locator('#vg-adm-operadores-indisponivel')).toBeVisible();
  // Sem vagas_op_indicadores: as 8 contagens e o aviso "Em breve".
  await abrir(page, 'vg-numeros');
  await expect(page.locator('#vg-adm-numeros [data-contagem]')).toHaveCount(8);
  await expect(page.locator('#vg-adm-numeros-breve')).toContainText('Em breve');
  expect(chamadas.every((c) => /^vagas_(op|adm)_|^vagas_cidades_publicas$/.test(c.nome))).toBe(true);
  expect(erros.filter((e) => !/404/.test(e))).toEqual([]);
});

test('Supabase: banco de antes do Vagas (versão anterior) não mostra o grupo nem chama as RPCs do Vagas', async ({ page }) => {
  const chamadas = await simularSupabaseVagas(page, 20261010120000);
  await entrarSupabase(page);
  await expect(page.locator('.aba[data-aba="usuarios"]')).toBeVisible();
  await expect(page.locator('.menu-grupo[data-grupo="vagas"]')).toBeHidden();
  expect(chamadas).toEqual([]);
});
