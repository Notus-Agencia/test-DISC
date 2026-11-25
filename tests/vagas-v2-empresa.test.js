'use strict';
// Vagas sem Caos v2 — site da EMPRESA (vagas/empresas.html e vagas/js/v2/empresa/*): casca, segurança (CSP, nada inline), palavras da casa,
// modelos de vaga, adaptador da prévia e redirecionador de empresa.html. Sem rede e sem navegador.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..', 'vagas');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const CON = require('../vagas/js/v2/contrato.js');
const REGRAS = require('../vagas/js/regras.js');
const MOD = require('../vagas/js/v2/empresa/modelos.js');

const CSP = "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://challenges.cloudflare.com; style-src 'self'; font-src 'self'; img-src 'self' data: blob: https://tevpqngqzxcswmticjnr.supabase.co; connect-src 'self' https://tevpqngqzxcswmticjnr.supabase.co https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'";
const PASTA_JS = path.join(RAIZ, 'js', 'v2', 'empresa');
const ARQUIVOS_JS = fs.readdirSync(PASTA_JS).filter((f) => f.endsWith('.js')).map((f) => 'js/v2/empresa/' + f);
const TODOS_JS = ARQUIVOS_JS.concat(['js/v2/previa/empresa.js']);
const AREAS = ['atendimento', 'vendas-loja', 'vendas-externas', 'caixa', 'administrativo', 'financeiro', 'rh', 'logistica', 'motorista', 'producao', 'construcao', 'manutencao',
  'limpeza', 'cozinha', 'hotelaria', 'beleza', 'saude', 'educacao', 'agro', 'seguranca', 'marketing', 'tecnologia', 'domesticos', 'outros', 'comercio', 'supermercado',
  'alimentacao', 'transporte', 'industria', 'vendas'];

function metaCsp(html) { const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html); return m && m[1]; }
function textoVisivel(html) { return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' '); }
// textos entre aspas do JavaScript (o que pode aparecer em tela), sem os comentários
function literais(src) {
  const semComentario = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
  const achados = [];
  const re = /'((?:\\.|[^'\\\n])*)'|"((?:\\.|[^"\\\n])*)"/g;
  let m;
  while ((m = re.exec(semComentario))) achados.push(m[1] !== undefined ? m[1] : m[2]);
  return achados;
}

test('empresas.html: CSP canônica na meta, nada inline, scripts na ordem do passa-bastão do servidor e previa=empresa', () => {
  const html = ler('empresas.html');
  assert.equal(metaCsp(html), CSP);
  assert.equal(/<script(?![^>]*\bsrc=)[^>]*>/.test(html), false, 'script inline');
  assert.equal(/<style[\s>]/.test(html), false, '<style> inline');
  assert.equal(/\sstyle=/.test(html), false, 'atributo style');
  assert.equal(/\son[a-z]+\s*=/.test(html), false, 'manipulador inline (onclick...)');
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<meta name="vsc-previa" content="empresa">/);
  assert.match(html, /<noscript>[\s\S]*<h1>[\s\S]*<\/noscript>/);
  assert.equal((html.match(/<h1/g) || []).length, 1, 'um h1 na casca (o das telas vem do JS)');
  assert.match(html, /<link rel="stylesheet" href="assets\/v2\/sistema\.css">\s*<link rel="stylesheet" href="assets\/v2\/empresa\.css">/);
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(scripts[0], 'js/v2/empresa/tema.js', 'script de tema externo no head');
  const ordem = ['js/config.js', 'js/v2/contrato.js', 'js/api.js', 'js/v2/api-v2.js', 'js/v2/icones.js', 'js/v2/empresa/base.js'];
  const pos = ordem.map((s) => scripts.indexOf(s));
  assert.ok(pos.every((p) => p >= 0), 'todos os scripts de base presentes');
  assert.deepEqual(pos, pos.slice().sort((a, b) => a - b), 'ordem config, contrato, api, api-v2, icones, base');
  scripts.forEach((s) => { assert.equal(/^https?:/.test(s), false, 'script de fora ' + s); assert.ok(fs.existsSync(path.join(RAIZ, s)), 'arquivo ' + s + ' não existe'); });
  // nenhum arquivo do modo prévia vai na página: o adaptador os carrega sob demanda
  assert.equal(scripts.some((s) => /previa\//.test(s) || /regras\.js$/.test(s)), false);
  ['assets/v2/sistema.css', 'assets/v2/empresa.css'].forEach((c) => assert.ok(fs.existsSync(path.join(RAIZ, c))));
  assert.match(html, /<footer[\s\S]*Uma empresa do grupo[\s\S]*gsc-logo/);
});

test('empresas.html e os módulos: a frase anti-golpe é a do contrato, palavra por palavra', () => {
  assert.equal(CON.FRASE_GOLPE, 'Nunca pague para se candidatar. Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.');
  const html = ler('empresas.html');
  assert.ok(textoVisivel(html).includes(CON.FRASE_GOLPE));
  assert.match(ler('js/v2/empresa/base.js'), /E\.GOLPE = CON\.FRASE_GOLPE/);
});

test('empresa.html é só um redirecionador curto: meta refresh, link e noscript, sem JavaScript', () => {
  const html = ler('empresa.html');
  assert.match(html, /<meta http-equiv="refresh" content="0; url=empresas\.html#\/inicio">/);
  assert.match(html, /<a href="empresas\.html#\/inicio">/);
  assert.match(html, /<noscript>/);
  assert.equal(/<script/.test(html), false);
  assert.equal(/\sstyle=|<style/.test(html), false);
  assert.equal(metaCsp(html), CSP);
  assert.ok(html.length < 1500);
});

test('módulos da empresa: nada de fetch direto, de dados fictícios fora da prévia, de console.log, TODO nem script ou estilo inline montado por JS', () => {
  ARQUIVOS_JS.forEach((arq) => {
    const src = ler(arq);
    const semComentario = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');
    assert.equal(/\bfetch\s*\(/.test(semComentario), false, arq + ' usa fetch');
    assert.equal(/XMLHttpRequest|navigator\.sendBeacon|new WebSocket/.test(semComentario), false, arq + ' usa rede direta');
    assert.equal(/VSC_DADOS/.test(semComentario), false, arq + ' lê a base fictícia fora da prévia');
    assert.equal(/console\.(log|debug|info)/.test(semComentario), false, arq + ' deixa console.log');
    assert.equal(/\bTODO\b|\bFIXME\b/.test(src), false, arq + ' tem TODO');
    assert.equal(/style="/.test(semComentario.replace(/\.style\./g, '')), false, arq + ' monta style="..."');
    assert.equal(/<script/i.test(semComentario), false, arq + ' monta <script>');
    assert.equal(/\bdocument\.write\b|\beval\s*\(|new Function\s*\(/.test(semComentario), false, arq + ' usa eval/document.write');
  });
  // a prévia é o único lugar que lê VSC_DADOS
  assert.match(ler('js/v2/previa/empresa.js'), /VSC_DADOS/);
});

test('módulos da empresa: só os métodos do contrato são chamados em VSC_API', () => {
  const metodos = new Set(Object.keys(CON.METODOS).concat(['verificacaoDocumentoEnviar', 'curriculoEnviar', 'sessao', 'sair', 'pronto', 'modo']));
  ARQUIVOS_JS.forEach((arq) => {
    const src = ler(arq);
    for (const m of src.matchAll(/E\.api\('([A-Za-z]+)'/g)) assert.ok(metodos.has(m[1]), arq + ' chama método fora do contrato: ' + m[1]);
    for (const m of src.matchAll(/E\.API\.([A-Za-z]+)\(/g)) assert.ok(metodos.has(m[1]), arq + ' chama VSC_API.' + m[1]);
  });
});

test('nenhuma palavra proibida nos textos de tela (HTML, módulos, prévia e modelos)', () => {
  const regs = CON.PROIBIDAS.map((p) => ({ p, re: new RegExp('(^|[^a-zà-úA-ZÀ-Ú0-9_])' + p.replace(/ /g, '\\s+') + '([^a-zà-úA-ZÀ-Ú0-9_]|$)', 'i') }));
  const fontes = [];
  ['empresas.html', 'empresa.html'].forEach((h) => fontes.push([h, textoVisivel(ler(h))]));
  TODOS_JS.forEach((arq) => literais(ler(arq)).forEach((t) => fontes.push([arq, t])));
  MOD.lista.forEach((m) => [m.titulo, m.descricao, m.horario].concat(m.atividades, m.requisitos, m.perguntas, m.termos).forEach((t) => fontes.push(['modelo ' + m.id, t])));
  const achados = [];
  fontes.forEach(([onde, t]) => regs.forEach((r) => { if (r.re.test(t)) achados.push(onde + ': "' + r.p + '" em "' + String(t).slice(0, 70) + '"'); }));
  assert.deepEqual(achados, []);
});

test('nenhum texto promete conferência ANTES de a vaga ir ao ar (a vaga entra na hora e a verificação vem depois)', () => {
  const proibidos = [/confer\w+ antes/i, /antes de (ir|entrar|ficar|subir|ser publicad)[^.]*(ao ar|no ar|publicad)/i, /(aprova|analis|revis|valid)\w* antes/i, /depois d[ea] (aprova|confer)/i, /aguarde a (aprova|confer|an[aá]lise)/i,
    /em at[eé] \d+ (dias? [uú]teis|horas)[^.]*(para|ir ao ar|publicar)/i, /espere a (aprova|an[aá]lise)/i];
  const permitidos = /sem esperar aprova[cç][aã]o/i;
  const fontes = [['empresas.html', textoVisivel(ler('empresas.html'))]];
  TODOS_JS.forEach((arq) => literais(ler(arq)).forEach((t) => fontes.push([arq, t])));
  const achados = [];
  fontes.forEach(([onde, t]) => { if (permitidos.test(t)) return; proibidos.forEach((re) => { if (re.test(t)) achados.push(onde + ': ' + re + ' em "' + String(t).slice(0, 90) + '"'); }); });
  assert.deepEqual(achados, []);
  // e o texto certo está lá
  const e1 = ler('js/v2/empresa/entrada.js');
  assert.match(e1, /No ar na hora\. Verificamos depois\./);
  assert.match(e1, /Grátis no lançamento/);
});

test('texto: só 18+ (nada de jovem aprendiz) e sem preço', () => {
  TODOS_JS.concat(['empresas.html']).forEach((arq) => {
    const t = ler(arq);
    assert.equal(/jovem aprendiz|menor aprendiz/i.test(t), false, arq + ' fala de jovem aprendiz');
  });
  assert.match(ler('js/v2/empresa/form.js'), /18 anos ou mais/);
  ARQUIVOS_JS.forEach((arq) => assert.equal(/R\$\s*\d{2,}/.test(literais(ler(arq)).join('\n')), false, arq + ' tem preço ou salário escrito na tela'));
});

test('modelos: 30 ou mais funções, texto original que passa no filtro de texto, sem salário, telefone nem link', () => {
  assert.ok(MOD.lista.length >= 30, 'modelos: ' + MOD.lista.length);
  const ids = new Set(MOD.lista.map((m) => m.id));
  assert.equal(ids.size, MOD.lista.length, 'ids repetidos');
  const tipos = ['Carteira assinada', 'Temporário', 'Diária', 'Por serviço', 'Estágio', 'PJ'];
  const turnos = ['Manhã', 'Tarde', 'Noite', 'Comercial', 'Escala 12x36', 'Fim de semana', 'Madrugada'];
  ['cozinheiro', 'caixa', 'atendente', 'vendedor', 'auxiliar-servicos-gerais', 'motorista', 'motoboy', 'acougueiro', 'padeiro', 'recepcionista', 'balconista', 'repositor', 'diarista',
    'garcom', 'auxiliar-administrativo', 'pedreiro', 'servente', 'vigia', 'porteiro'].forEach((id) => {
    const existe = MOD.lista.some((m) => m.id === id || m.id.indexOf(id.split('-')[0]) === 0);
    assert.ok(existe, 'falta o modelo de ' + id);
  });
  MOD.lista.forEach((m) => {
    const campos = [m.titulo, m.descricao, m.horario].concat(m.atividades, m.requisitos, m.perguntas);
    campos.forEach((t) => {
      const l = REGRAS.conferirLista(t, 'vaga');
      assert.deepEqual([l.barra.length, l.forte.length, l.fraco.length], [0, 0, 0], m.id + ': "' + t.slice(0, 60) + '" não passa no filtro: ' + JSON.stringify(l));
      assert.equal(REGRAS.conferirTexto(t, 'vaga'), null);
      assert.equal(/R\$|https?:|www\.|@|\b\d{4,}\b/i.test(t), false, m.id + ': salário, link ou número em "' + t.slice(0, 60) + '"');
    });
    const todo = campos.join(' ');
    assert.equal(/\b(r\$|reais|salario|sal[aá]rio de)\b/i.test(todo), false, m.id + ' fala de salário');
    assert.ok(m.descricao.length >= 40 && m.descricao.length <= 1500, m.id + ' descrição fora de 40 a 1500');
    assert.ok(m.perguntas.length >= 1 && m.perguntas.length <= 3, m.id + ' perguntas');
    m.perguntas.forEach((q) => assert.match(q, /\?$/, m.id + ': pergunta sem ?'));
    assert.ok(m.atividades.length >= 3, m.id + ' tarefas');
    assert.ok(AREAS.includes(m.setorId), m.id + ' área ' + m.setorId + ' não existe');
    assert.ok(tipos.includes(m.tipo), m.id + ' tipo ' + m.tipo);
    assert.ok(m.tipo === 'Diária' || turnos.includes(m.turno), m.id + ' turno ' + m.turno);
    assert.equal(/jovem aprendiz/i.test(todo), false);
    assert.ok(/^[A-ZÀ-Ú]/.test(m.titulo));
  });
  assert.equal(MOD.exato('Cozinheira').id, 'cozinheiro');
  assert.equal(MOD.achar('faxineira').id, 'auxiliar-limpeza');
  assert.equal(MOD.exato('xyzxyz'), null);
});

test('prévia da empresa: as respostas têm a forma do contrato e as regras duras do banco valem', async () => {
  // ambiente mínimo de navegador
  const mem = {};
  const sandbox = globalThis;
  sandbox.window = sandbox;
  sandbox.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  sandbox.VAGAS_REGRAS = REGRAS;
  const antes = { VSC_DADOS: sandbox.VSC_DADOS, VSC_PREVIA_METODOS: sandbox.VSC_PREVIA_METODOS };
  try {
    sandbox.VSC_PREVIA_METODOS = {};
    require('../vagas/js/v2/previa/dados.js');
    require('../vagas/js/v2/previa/dados-mais.js');
    require('../vagas/js/v2/previa/empresa.js');
    const M = sandbox.VSC_PREVIA_METODOS, P = sandbox.VSC_PREVIA_EMPRESA;
    const chamar = async (m, d) => M[m](d || {});
    const valido = (m, r) => assert.deepEqual(CON.validar(m, r), [], m + ' fora do contrato');
    // sem conta: a base abre e o texto é conferido com o filtro real
    valido('base', await chamar('base'));
    const barrado = await chamar('textoChecar', { texto: 'Pague uma taxa de inscrição e ligue para 62 99999-1234', contexto: 'vaga' });
    assert.equal(barrado.passa, false);
    assert.ok(barrado.barra.every((b) => b.mensagem && /Tire/.test(b.mensagem)));
    assert.equal((await chamar('textoChecar', { texto: 'Atendimento no balcão da loja, de segunda a sábado.' })).passa, true);
    // CPF vira dica do CCMEI; CNPJ não ativo diz o motivo
    const cpf = await chamar('cnpjConsultar', { cnpj: '12345678901' });
    assert.equal(cpf.ok, false); assert.equal(cpf.codigo, 'cpf'); assert.match(cpf.erro, /CCMEI/);
    const inativo = await chamar('cnpjConsultar', { cnpj: 'EX.INA.TI0/0001-00' });
    assert.equal(inativo.ativa, false); assert.ok(inativo.situacao);
    const ativo = await chamar('cnpjConsultar', { cnpj: 'EX.EMP.LO0/0001-00' });
    assert.equal(ativo.ativa, true);
    // código errado e certo
    assert.equal((await chamar('codigoConfirmar', { destino: 'a@b.com', codigo: '000000', nome: 'Teste', tipo: 'empresa' })).codigo, 'codigo_errado');
    const entrou = await chamar('codigoConfirmar', { destino: 'a@b.com', codigo: '123456', nome: 'Teste', tipo: 'empresa' });
    assert.ok(entrou.sessao.user.email);
    assert.deepEqual((await chamar('minhasEmpresas')).empresas, []);
    // criar a empresa e publicar: a vaga entra no ar com o selo em verificação
    const criada = await chamar('empresaCriar', { cnpj: 'EX.EMP.LO0/0001-00', nomeFantasia: 'Mercearia Exemplo', cidade: 'uruacu-go', bairro: 'Centro', setor: 'Comércio', responsavel: 'Teste', whatsapp: '5562999990000', email: 'a@b.com' });
    assert.equal(criada.ok, true); assert.equal(criada.empresa.verificada, false); assert.equal(criada.empresa.estado, 'em_verificacao');
    const vaga = (t, extra) => Object.assign({ titulo: t, setorId: 'caixa', tipo: 'CLT', turno: 'Comercial', horario: 'Segunda a sábado', salario: { min: 1800, periodo: 'mes' },
      descricao: 'Procuramos pessoa para trabalhar no caixa da loja, atendendo e fechando o caixa no fim do dia.', cidade: 'uruacu-go', bairro: 'Centro' }, extra || {});
    const sem = await chamar('vagaPublicar', { empresaId: criada.empresa.id, vaga: vaga('Caixa', { salario: { min: 0 } }) });
    assert.equal(sem.codigo, 'salario_obrigatorio');
    const comb = await chamar('vagaPublicar', { empresaId: criada.empresa.id, vaga: vaga('Caixa', { salario: { aCombinar: true } }) });
    assert.equal(comb.codigo, 'salario_obrigatorio');
    const barra = await chamar('vagaPublicar', { empresaId: criada.empresa.id, vaga: vaga('Caixa', { descricao: 'Vaga de caixa. Pague taxa de inscrição e ligue 62 99999-1234 para começar a trabalhar.' }) });
    assert.equal(barra.codigo, 'texto_barrado'); assert.ok(barra.barra.length >= 1);
    const periodo = await chamar('vagaPublicar', { empresaId: criada.empresa.id, vaga: vaga('Caixa', { salario: { min: 100, periodo: 'dia' } }) });
    assert.equal(periodo.codigo, 'salario_periodo');
    const a = await chamar('vagaPublicar', { empresaId: criada.empresa.id, vaga: vaga('Caixa'), idLocal: 'x1' });
    valido('vagaPublicar', a); assert.equal(a.estado, 'no_ar');
    const repetida = await chamar('vagaPublicar', { empresaId: criada.empresa.id, vaga: vaga('Caixa'), idLocal: 'x1' });
    assert.equal(repetida.vaga.id, a.vaga.id, 'a mesma idLocal não duplica');
    await chamar('vagaPublicar', { empresaId: criada.empresa.id, vaga: vaga('Repositor') });
    await chamar('vagaPublicar', { empresaId: criada.empresa.id, vaga: vaga('Vendedor') });
    const quarta = await chamar('vagaPublicar', { empresaId: criada.empresa.id, vaga: vaga('Atendente') });
    assert.equal(quarta.codigo, 'limite_dia');
    const lista = await chamar('vagasDaEmpresa', { empresaId: criada.empresa.id });
    valido('vagasDaEmpresa', lista);
    assert.equal(lista.vagas.length, 3);
    assert.deepEqual([lista.limites.noAr, lista.limites.maxNoAr, lista.limites.hoje, lista.limites.maxHoje], [3, 3, 3, 3]);
    const dup = await chamar('vagaAcao', { id: a.vaga.id, acao: 'duplicar' });
    assert.equal(dup.codigo, 'limite_dia');
    const pausada = await chamar('vagaAcao', { id: a.vaga.id, acao: 'pausar' });
    assert.equal(pausada.vaga.status, 'pausada');
    const ret = await chamar('vagaAcao', { id: a.vaga.id, acao: 'retomar' });
    assert.equal(ret.vaga.status, 'aberta');
    // cenário verificado: candidatos nas etapas, contato só para verificada, e o contrato inteiro
    await P.trocar('super');
    const emp = (await chamar('minhasEmpresas')).empresas[0];
    assert.equal(emp.verificada, true);
    const cs = await chamar('candidatos', { empresaId: emp.id });
    valido('candidatos', cs);
    assert.ok(cs.lista.length >= 10);
    assert.deepEqual(cs.lista.map((c) => c.criadaEm), cs.lista.map((c) => c.criadaEm).sort().reverse(), 'ordem só por data');
    assert.ok(cs.lista.every((c) => c.nomeCompleto && c.whatsapp));
    const um = await chamar('candidato', { id: cs.lista.find((c) => c.etapa === 'nova').id });
    valido('candidato', um);
    assert.equal(um.candidato.etapa, 'vista');
    const chamarWa = await chamar('whatsappChamar', { id: um.candidato.id });
    assert.match(chamarWa.link, /^https:\/\/wa\.me\/55\d+$/);
    const nao = await chamar('candidatoMover', { id: um.candidato.id, etapa: 'não seguiu' });
    assert.equal(nao.candidato.etapa, 'não seguiu');
    assert.equal((await chamar('candidatoMover', { id: um.candidato.id, etapa: 'não seguiu', desfazer: true })).candidato.etapa !== 'não seguiu', true);
    assert.equal((await chamar('candidatoMover', { id: um.candidato.id, etapa: 'entrevista marcada' })).codigo, 'entrevista_incompleta');
    const ent = await chamar('entrevistaMarcar', { id: um.candidato.id, quando: new Date(Date.now() + 2 * 86400000).toISOString(), onde: 'Na loja do Centro', recado: 'Traga a carteira de trabalho.' });
    assert.equal(ent.candidato.etapa, 'entrevista marcada');
    assert.equal(ent.candidato.entrevista.confirmada, null);
    // empresa em verificação: só o primeiro nome, sem arquivo nem WhatsApp, até a pessoa liberar
    await P.trocar('studio');
    const emp2 = (await chamar('minhasEmpresas')).empresas[0];
    const cs2 = await chamar('candidatos', { empresaId: emp2.id });
    valido('candidatos', cs2);
    assert.ok(cs2.lista.length >= 1);
    cs2.lista.forEach((c) => { assert.equal(c.nomeCompleto, false); assert.equal(c.whatsapp, null); assert.equal(c.arquivo, null); assert.equal(c.nome.includes(' '), false); });
    const bloq = await chamar('whatsappChamar', { id: cs2.lista[0].id });
    assert.equal(bloq.codigo, 'whatsapp_nao_liberado');
    const msg = await chamar('mensagemEnviar', { id: cs2.lista[0].id, texto: 'Podemos falar pelo WhatsApp? Se puder, toque em "Liberar meu WhatsApp".' });
    assert.equal(msg.ok, true);
    const tel = await chamar('mensagemEnviar', { id: cs2.lista[0].id, texto: 'Me chama no 62 99999-1234' });
    assert.equal(tel.codigo, 'texto_barrado');
    await P.simular('liberou');
    const liberado = await chamar('candidato', { id: cs2.lista[0].id });
    assert.equal(liberado.candidato.whatsappLiberado, true);
    // verificação
    valido('verificacao', await chamar('verificacao', { empresaId: emp2.id }));
    assert.equal((await chamar('verificacaoReenviar', { empresaId: emp2.id, dados: {} })).estado, 'em_verificacao');
    const eq = await chamar('equipeConvidar', { empresaId: emp2.id, email: 'a@b.com' });
    assert.match(eq.convite.token, /^[0-9a-f]{64}$/);
    await chamar('equipeConvidar', { empresaId: emp2.id, email: 'c@d.com' });
    assert.equal((await chamar('equipeConvidar', { empresaId: emp2.id, email: 'e@f.com' })).codigo, 'limite_equipe');
  } finally {
    sandbox.VSC_DADOS = antes.VSC_DADOS; sandbox.VSC_PREVIA_METODOS = antes.VSC_PREVIA_METODOS;
    delete sandbox.window; delete sandbox.VSC_PREVIA_EMPRESA;
  }
});

test('contrato: os métodos que a tela da empresa usa existem e pedem login quando devem', () => {
  const login = ['minhasEmpresas', 'empresaCriar', 'empresaSalvar', 'vagaPublicar', 'vagaEditar', 'vagaAcao', 'vagasDaEmpresa', 'candidatos', 'candidato', 'arquivoLink', 'candidatoMover',
    'whatsappChamar', 'entrevistaMarcar', 'equipeConvidar', 'equipe', 'verificacao', 'verificacaoDocumento', 'verificacaoDocumentoLink', 'verificacaoReenviar', 'mensagemEnviar', 'denunciar'];
  login.forEach((m) => assert.equal(CON.METODOS[m].login, true, m));
  ['base', 'textoChecar', 'cnpjConsultar', 'codigoPedir', 'codigoConfirmar'].forEach((m) => assert.equal(CON.METODOS[m].login, false, m));
});
