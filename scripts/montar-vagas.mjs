#!/usr/bin/env node
// Monta o que o site do Vagas sem Caos (vagas/, publicado sozinho no Cloudflare Pages) precisa e não enxerga fora da pasta:
//
//   1. vagas/comum/  — cópia das peças da marca (assets/notus.css, a fonte Plus Jakarta Sans + licença OFL e todo assets/marca/).
//   2. vagas/js/textos.js e vagas/js/textos-conta.js — os textos fixos das telas (VAGAS_TEXTOS), GERADOS de conteudo/vagas-textos/.
//      textos.js (todas as telas): botões, validação e os avisos que alguma tela sem conta usa (avisosPublicos) de avisos.json.
//      textos-conta.js (telas com conta e entrar.html): o resto dos avisos, anúncio, referência, mensagem e foto de avisos.json,
//      consentimentos.json e moderacao.json. Só o que as telas usam: sai o que é
//      regra do servidor (expressões de filtro), lista que já tem fonte única em vagas/js/regras.js (pontos fortes, motivos de
//      denúncia) e o que é da fase 2. Dois arquivos para a lista pública caber nos 100 KB da primeira visita.
//   3. vagas/termos.html e vagas/privacidade.html — gerados dos .md de conteudo/vagas-textos/ (com a faixa "Minuta, em revisão
//      jurídica" enquanto o arquivo de origem disser MINUTA).
//
//   node scripts/montar-vagas.mjs           -> grava tudo (e apaga o que sobrar em vagas/comum/)
//   node scripts/montar-vagas.mjs --checar  -> só confere; sai com código 1 se algo faltar, sobrar, estiver desatualizado, ou se a
//                                              lista pública (cidade.html, primeira visita) passar de 100 KB transferidos (roda no npm test)
//
// NUNCA edite vagas/comum/, vagas/js/textos.js, vagas/js/textos-conta.js, vagas/termos.html nem vagas/privacidade.html à mão: edite a origem e rode o script.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'vagas', 'comum');
const CABECALHO_CSS = '/* CÓPIA GERADA por scripts/montar-vagas.mjs a partir de assets/notus.css. NÃO EDITE AQUI: edite assets/notus.css e rode o script. */\n';
export const LIMITE_LISTA_BYTES = 100 * 1024;

// ------------------------------------------------------------------------------------------------------------------------------
// 1. Peças da marca
// ------------------------------------------------------------------------------------------------------------------------------
// [origem relativa à raiz, destino relativo a vagas/comum, transformar?]
export function listaDeCopias(raiz = RAIZ) {
  const lista = [
    ['assets/notus.css', 'notus.css', (b) => Buffer.from(CABECALHO_CSS + b.toString('utf8'), 'utf8')],
    ['assets/fonts/plus-jakarta-sans-latin-wght-normal.woff2', 'fonts/plus-jakarta-sans-latin-wght-normal.woff2'],
    ['assets/fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2', 'fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2'],
    ['assets/fonts/OFL.txt', 'fonts/OFL.txt']
  ];
  const marca = join(raiz, 'assets', 'marca');
  for (const arq of readdirSync(marca).sort()) {
    if (statSync(join(marca, arq)).isFile()) lista.push(['assets/marca/' + arq, 'marca/' + arq]);
  }
  return lista;
}

// O que deve existir em vagas/comum: { 'notus.css': Buffer, ... }
export function esperado(raiz = RAIZ) {
  const saida = {};
  for (const [de, para, transformar] of listaDeCopias(raiz)) {
    const bruto = readFileSync(join(raiz, de));
    saida[para] = transformar ? transformar(bruto) : bruto;
  }
  return saida;
}

function arquivosEm(pasta) {
  if (!existsSync(pasta)) return [];
  const saida = [];
  const andar = (p) => {
    for (const nome of readdirSync(p)) {
      const c = join(p, nome);
      if (statSync(c).isDirectory()) andar(c);
      else saida.push(relative(pasta, c).split('\\').join('/'));
    }
  };
  andar(pasta);
  return saida.sort();
}

export function conferir(raiz = RAIZ, destino = DESTINO) {
  const esp = esperado(raiz);
  const problemas = [];
  for (const [rel, conteudo] of Object.entries(esp)) {
    const alvo = join(destino, rel);
    if (!existsSync(alvo)) problemas.push('falta vagas/comum/' + rel);
    else if (!readFileSync(alvo).equals(conteudo)) problemas.push('desatualizado: vagas/comum/' + rel);
  }
  for (const rel of arquivosEm(destino)) if (!esp[rel]) problemas.push('sobrando: vagas/comum/' + rel);
  return problemas;
}

// ------------------------------------------------------------------------------------------------------------------------------
// 2. Textos das telas (VAGAS_TEXTOS)
// ------------------------------------------------------------------------------------------------------------------------------
const lerJson = (raiz, rel) => JSON.parse(readFileSync(join(raiz, 'conteudo', 'vagas-textos', rel), 'utf8'));
const semMeta = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !k.startsWith('_')));

// O que vai para as telas. Fica de fora (com o motivo):
//  - chaves "_..." (notas para quem escreve), avisos._revisao_psicologia (lista de revisão);
//  - anuncio.termos_proibidos / anuncio.bloqueios / mensagem.padroes: são regras (expressões) do servidor; a tela valida com
//    VAGAS_REGRAS.conferirTexto, que é igual ao banco;
//  - avisos.denuncia_motivos e referencia.pontos_fortes: as listas fechadas têm fonte única em VAGAS_REGRAS
//    (MOTIVOS_DENUNCIA_TELA e PONTOS_FORTES), para nunca haver duas versões na tela;
//  - foto._fase2 e as chaves que ele lista (conferência da foto é da fase 2).
export function textosDaTela(raiz = RAIZ) {
  const a = lerJson(raiz, 'avisos.json');
  const fase2 = new Set((a.foto && a.foto._fase2) || []);
  const avisos = semMeta(a.avisos);
  delete avisos.denuncia_motivos;
  const anuncio = semMeta(a.anuncio);
  delete anuncio.termos_proibidos;
  delete anuncio.bloqueios;
  const mensagem = semMeta(a.mensagem);
  delete mensagem.padroes;
  const referencia = semMeta(a.referencia);
  delete referencia.pontos_fortes;
  const foto = Object.fromEntries(Object.entries(semMeta(a.foto)).filter(([k]) => !fase2.has(k)));
  return { versao: a.versao, avisos, botoes: semMeta(a.botoes), validacao: semMeta(a.validacao), mensagem, foto, anuncio, referencia };
}
// Só as telas com conta usam (eu.html e empresa.html carregam textos-conta.js): fora da lista pública, que tem limite de peso.
const SO_DA_CONTA = ['anuncio', 'referencia', 'mensagem', 'foto'];
// avisos.* usados por algum script de página que carrega textos.js SEM textos-conta.js (lista, início, selo, testes): ficam em
// textos.js; os outros vão para textos-conta.js. Chave montada na hora ('avisos.' + x) num desses scripts não dá para conferir.
export function avisosPublicos(raiz = RAIZ) {
  const pasta = join(raiz, 'vagas');
  const chaves = new Set();
  for (const p of readdirSync(pasta).filter((f) => f.endsWith('.html')).sort()) {
    const html = readFileSync(join(pasta, p), 'utf8');
    if (!html.includes('"js/textos.js"') || html.includes('"js/textos-conta.js"')) continue;
    for (const m of html.matchAll(/<script src="(js\/[a-z0-9-]+\.js)"><\/script>/g)) {
      if (/^js\/textos/.test(m[1]) || !existsSync(join(pasta, m[1]))) continue;
      const js = readFileSync(join(pasta, m[1]), 'utf8');
      if (/['"]avisos\.['"]\s*\+/.test(js)) throw new Error(m[1] + ': chave de aviso montada na hora numa tela sem conta; escreva a chave inteira');
      for (const k of js.matchAll(/avisos\.([a-z0-9_]+)/g)) chaves.add(k[1]);
    }
  }
  return chaves;
}
export function textosBasicos(raiz = RAIZ) {
  const t = textosDaTela(raiz);
  for (const k of SO_DA_CONTA) delete t[k];
  const pub = avisosPublicos(raiz);
  t.avisos = Object.fromEntries(Object.entries(t.avisos).filter(([k]) => pub.has(k)));
  return t;
}

export function textosDaConta(raiz = RAIZ) {
  const tela = textosDaTela(raiz);
  const c = lerJson(raiz, 'consentimentos.json');
  const m = lerJson(raiz, 'moderacao.json');
  const CAMPOS_ACEITE = ['versao', 'quem', 'titulo', 'texto', 'explicacao', 'obrigatorio', 'prazo_dias', 'variaveis', 'lembrete_curto'];
  const CAMPOS_MOTIVO = ['alvo', 'acao', 'titulo', 'texto_empresa', 'correcao', 'lei'];
  const aceites = {};
  for (const x of c.aceites || []) aceites[x.chave] = Object.fromEntries(CAMPOS_ACEITE.filter((k) => x[k] !== undefined).map((k) => [k, x[k]]));
  const motivos = {};
  for (const x of m.motivos || []) motivos[x.chave] = Object.fromEntries(CAMPOS_MOTIVO.filter((k) => x[k] !== undefined).map((k) => [k, x[k]]));
  const pub = avisosPublicos(raiz);
  const avisos = Object.fromEntries(Object.entries(tela.avisos).filter(([k]) => !pub.has(k)));
  return { avisos, ...Object.fromEntries(SO_DA_CONTA.map((k) => [k, tela[k]])), consentimentos: { termosVersao: c.termos_versao, aceites }, moderacao: { versao: m.versao, motivos } };
}

const AVISO_GERADO = (origem) => '/*\n * GERADO por scripts/montar-vagas.mjs a partir de ' + origem + '. NÃO EDITE AQUI: edite a origem e rode\n' +
  ' * "node scripts/montar-vagas.mjs" (o npm test confere que está em dia).\n';

function js(dados) { return JSON.stringify(dados, null, 1).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }

export function gerarTextosJs(raiz = RAIZ) {
  return AVISO_GERADO('conteudo/vagas-textos/avisos.json') +
    ' *\n * VAGAS_TEXTOS: textos fixos das telas, por chave estável (avisos.* das telas sem conta, botoes.*, validacao.*).\n' +
    ' *   VAGAS_TEXTOS.t(\'avisos.cidade_pausada\', {cidade: \'…\'}) -> texto com {{variáveis}} preenchidas (\'\' se a chave não existe).\n' +
    ' * Os outros avisos.*, anuncio.*, referencia.*, mensagem.*, foto.*, consentimentos.* e moderacao.* ficam em textos-conta.js (carregue\n' +
    ' * depois deste nas telas que usam).\n */\n' +
    '(function (root) {\n  \'use strict\';\n  var DADOS = ' + js(textosBasicos(raiz)) + ';\n' +
    '  function buscar(caminho) {\n' +
    '    var atual = DADOS;\n' +
    '    var partes = String(caminho || \'\').split(\'.\');\n' +
    '    for (var i = 0; i < partes.length; i++) {\n' +
    '      if (!atual || typeof atual !== \'object\' || !Object.prototype.hasOwnProperty.call(atual, partes[i])) return undefined;\n' +
    '      atual = atual[partes[i]];\n' +
    '    }\n' +
    '    return atual;\n' +
    '  }\n' +
    '  // Texto com {{variavel}} preenchida pelo valor de vars (variável sem valor some, nunca aparece "{{…}}" na tela).\n' +
    '  function t(caminho, vars) {\n' +
    '    var v = buscar(caminho);\n' +
    '    if (typeof v !== \'string\') return \'\';\n' +
    '    return v.replace(/\\{\\{\\s*([a-z0-9_]+)\\s*\\}\\}/gi, function (_, k) { return vars && vars[k] != null ? String(vars[k]) : \'\'; });\n' +
    '  }\n' +
    '  DADOS.t = t;\n  DADOS.buscar = buscar;\n' +
    '  if (typeof module !== \'undefined\' && module.exports) module.exports = DADOS;\n' +
    '  else root.VAGAS_TEXTOS = DADOS;\n' +
    '})(typeof self !== \'undefined\' ? self : this);\n';
}

export function gerarContaJs(raiz = RAIZ) {
  return AVISO_GERADO('conteudo/vagas-textos/avisos.json, consentimentos.json e moderacao.json') +
    ' *\n * Acrescenta a VAGAS_TEXTOS (carregue depois de textos.js), para as telas com conta e entrar.html:\n' +
    ' *   avisos.* que só as telas com conta usam (somados aos de textos.js), anuncio.* (titulo_erro, lei_resumo, campos.*),\n' +
    ' *   referencia.* (vinculos, validacao.*), mensagem.* e foto.* de avisos.json;\n' +
    ' *   consentimentos.termosVersao e consentimentos.aceites[chave] = {versao, quem, titulo, texto, explicacao, obrigatorio, ...};\n' +
    ' *   moderacao.motivos[chave] = {alvo, acao, titulo, texto_empresa, correcao, lei} (a chave é o p_motivo das RPCs vagas_op_*).\n' +
    ' *   VAGAS_TEXTOS.t(\'consentimentos.aceites.pessoa_cadastro.texto\') também funciona.\n */\n' +
    '(function (root) {\n  \'use strict\';\n  var DADOS = ' + js(textosDaConta(raiz)) + ';\n' +
    '  if (typeof module !== \'undefined\' && module.exports) { module.exports = DADOS; return; }\n' +
    '  var T = root.VAGAS_TEXTOS || (root.VAGAS_TEXTOS = {});\n' +
    '  Object.keys(DADOS).forEach(function (k) {\n' +
    '    if (k !== \'avisos\') { T[k] = DADOS[k]; return; }\n' +
    '    T.avisos = T.avisos || {};\n' +
    '    Object.keys(DADOS.avisos).forEach(function (a) { T.avisos[a] = DADOS.avisos[a]; });\n' +
    '  });\n' +
    '})(typeof self !== \'undefined\' ? self : this);\n';
}

// ------------------------------------------------------------------------------------------------------------------------------
// 3. Termos e privacidade: Markdown simples -> HTML (sem script; texto sempre escapado)
// ------------------------------------------------------------------------------------------------------------------------------
export function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function linhaInline(texto) {
  // Escapa primeiro; depois só as marcas conhecidas viram tag. Link só para http(s), mailto e página .html do próprio site.
  let s = escaparHtml(texto);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, rotulo, url) => {
    const u = url.replace(/&amp;/g, '&');
    return /^(https?:\/\/|mailto:)/.test(u) || /^[a-z0-9-]+\.html(#[a-z0-9-]*)?$/.test(u) ? '<a href="' + escaparHtml(u) + '">' + rotulo + '</a>' : rotulo;
  });
  return s;
}
export function markdownParaHtml(md) {
  const linhas = String(md).replace(/\r\n/g, '\n').split('\n');
  const saida = [];
  let i = 0;
  const ehTabela = (l) => /^\s*\|.*\|\s*$/.test(l);
  const celulas = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { const n = m[1].length; saida.push('<h' + n + '>' + linhaInline(m[2]) + '</h' + n + '>'); i++; continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) { saida.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(l)) {
      const bloco = [];
      while (i < linhas.length && /^>\s?/.test(linhas[i])) { bloco.push(linhas[i].replace(/^>\s?/, '')); i++; }
      saida.push('<blockquote><p>' + bloco.map(linhaInline).join('<br>') + '</p></blockquote>');
      continue;
    }
    if (ehTabela(l) && i + 1 < linhas.length && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1])) {
      const cab = celulas(l);
      i += 2;
      const corpo = [];
      while (i < linhas.length && ehTabela(linhas[i])) { corpo.push(celulas(linhas[i])); i++; }
      saida.push('<table><thead><tr>' + cab.map((c) => '<th>' + linhaInline(c) + '</th>').join('') + '</tr></thead><tbody>' +
        corpo.map((r) => '<tr>' + r.map((c) => '<td>' + linhaInline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table>');
      continue;
    }
    if (/^\s*[-*]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
      const ordenada = /^\s*\d+[.)]\s+/.test(l);
      const re = ordenada ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/;
      const itens = [];
      while (i < linhas.length && re.test(linhas[i])) {
        let item = linhas[i].replace(re, '');
        i++;
        while (i < linhas.length && /^\s{2,}\S/.test(linhas[i]) && !re.test(linhas[i])) { item += ' ' + linhas[i].trim(); i++; }
        itens.push('<li>' + linhaInline(item) + '</li>');
      }
      saida.push((ordenada ? '<ol>' : '<ul>') + itens.join('') + (ordenada ? '</ol>' : '</ul>'));
      continue;
    }
    const par = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,4}\s|>|\s*[-*]\s+|\s*\d+[.)]\s+|\s*(---|\*\*\*)\s*$)/.test(linhas[i]) && !ehTabela(linhas[i])) { par.push(linhas[i].trim()); i++; }
    if (par.length) saida.push('<p>' + par.map(linhaInline).join(' ') + '</p>');
    else i++;
  }
  return saida.join('\n');
}

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tevpqngqzxcswmticjnr.supabase.co; font-src 'self'; connect-src 'self' https://tevpqngqzxcswmticjnr.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'";

export function paginaDocumento({ titulo, descricao, md }) {
  const minuta = /MINUTA/.test(md.split('\n').slice(0, 5).join('\n'));
  // A nota de minuta do arquivo vira a faixa da página (não aparece duas vezes).
  const corpo = markdownParaHtml(md.replace(/^>\s*\*\*MINUTA[^\n]*\n/, ''));
  return '<!doctype html>\n<!-- GERADO por scripts/montar-vagas.mjs a partir de conteudo/vagas-textos/. NÃO EDITE AQUI. -->\n' +
    '<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n' +
    '  <meta http-equiv="Content-Security-Policy" content="' + CSP + '">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    '  <title>' + escaparHtml(titulo) + ' | Vagas sem Caos</title>\n' +
    '  <meta name="description" content="' + escaparHtml(descricao) + '">\n' +
    (minuta ? '  <meta name="robots" content="noindex">\n' : '') +
    '  <meta name="color-scheme" content="light">\n  <meta name="theme-color" content="#13283f">\n' +
    '  <script src="js/endereco.js"></script>\n' +
    '  <link rel="icon" type="image/svg+xml" href="comum/marca/gsc-favicon.svg">\n' +
    '  <link rel="icon" type="image/png" sizes="32x32" href="comum/marca/gsc-favicon-32.png">\n' +
    '  <link rel="preload" href="comum/fonts/plus-jakarta-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>\n' +
    '  <link rel="stylesheet" href="comum/notus.css">\n  <link rel="stylesheet" href="assets/vagas.css">\n</head>\n<body>\n' +
    '  <a class="pular" href="#app">Pular para o conteúdo</a>\n' +
    '  <header class="topo vidro-cabecalho" id="vg-topo"><div class="topo-interno"><a href="index.html" class="vg-topo__marca" aria-label="Vagas sem Caos, início">' +
    '<img class="logo-gsc topo-logo" src="comum/marca/vsc-logo.svg" alt="Vagas sem Caos" width="160" height="24"></a></div></header>\n' +
    (minuta ? '  <div class="vg-faixa" id="vg-faixa-minuta" role="note"><p><strong>Minuta, em revisão jurídica.</strong> Este texto ainda pode mudar antes de o site abrir.</p></div>\n' : '') +
    '  <main id="app" class="conteudo" tabindex="-1">\n    <article class="caixa vg-doc">\n' + corpo.split('\n').map((x) => '      ' + x).join('\n') + '\n    </article>\n' +
    '    <footer class="rodape"><p class="rodape-nota vg-grupo">Uma empresa do grupo <img class="logo-gsc" src="comum/marca/gsc-logo.svg" alt="Gestão sem Caos" width="142" height="20"></p>' +
    '<p class="rodape-nota"><a href="termos.html">Termos de uso</a> · <a href="privacidade.html">Aviso de privacidade</a></p></footer>\n' +
    '  </main>\n</body>\n</html>\n';
}

// Arquivos gerados: { 'vagas/js/textos.js': texto, ... }
export function gerados(raiz = RAIZ) {
  const md = (a) => readFileSync(join(raiz, 'conteudo', 'vagas-textos', a), 'utf8');
  return {
    'vagas/js/textos.js': gerarTextosJs(raiz),
    'vagas/js/textos-conta.js': gerarContaJs(raiz),
    'vagas/termos.html': paginaDocumento({ titulo: 'Termos de uso', descricao: 'Termos de uso do Vagas sem Caos, uma empresa do grupo Gestão sem Caos.', md: md('termos-de-uso.md') }),
    'vagas/privacidade.html': paginaDocumento({ titulo: 'Aviso de privacidade', descricao: 'Aviso de privacidade do Vagas sem Caos, uma empresa do grupo Gestão sem Caos.', md: md('aviso-de-privacidade.md') })
  };
}

export function conferirGerados(raiz = RAIZ) {
  const problemas = [];
  for (const [rel, texto] of Object.entries(gerados(raiz))) {
    const alvo = join(raiz, rel);
    if (!existsSync(alvo)) problemas.push('falta ' + rel);
    else if (readFileSync(alvo, 'utf8') !== texto) problemas.push('desatualizado: ' + rel);
  }
  return problemas;
}

// ------------------------------------------------------------------------------------------------------------------------------
// 4. Peso da lista pública (cidade.html, primeira visita, modo supabase): HTML + CSS + fonte latin + scripts + logo + favicon,
//    medido como transferência gzip (-9). A prévia (api-previa.js) e as respostas das RPCs ficam de fora.
// ------------------------------------------------------------------------------------------------------------------------------
export function pesoDaLista(raiz = RAIZ, pagina = 'cidade.html') {
  const pasta = join(raiz, 'vagas');
  const html = join(pasta, pagina);
  if (!existsSync(html)) return null;
  const texto = readFileSync(html, 'utf8');
  const arquivos = new Set([pagina]);
  for (const m of texto.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) arquivos.add(m[1]);
  for (const m of texto.matchAll(/<link[^>]*rel="(?:stylesheet|preload)"[^>]*href="([^"]+)"|<link[^>]*href="([^"]+)"[^>]*rel="(?:stylesheet|preload)"/g)) arquivos.add(m[1] || m[2]);
  const icone = /<link[^>]*rel="icon"[^>]*type="image\/svg\+xml"[^>]*href="([^"]+)"/.exec(texto);
  if (icone) arquivos.add(icone[1]);
  for (const m of texto.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)) arquivos.add(m[1]);
  arquivos.add('comum/marca/vsc-logo.svg');   // o topo montado pelo VAGAS_UI.topo
  const itens = [];
  for (const rel of arquivos) {
    const c = join(pasta, rel.replace(/[?#].*$/, ''));
    if (!existsSync(c)) { itens.push({ arquivo: rel, bytes: 0, falta: true }); continue; }
    const b = readFileSync(c);
    itens.push({ arquivo: rel, bruto: b.length, bytes: /\.(woff2|png|jpg|webp)$/.test(rel) ? b.length : gzipSync(b, { level: 9 }).length });
  }
  return { pagina, total: itens.reduce((s, x) => s + x.bytes, 0), limite: LIMITE_LISTA_BYTES, itens };
}

function montar() {
  const esp = esperado();
  for (const rel of arquivosEm(DESTINO)) if (!esp[rel]) rmSync(join(DESTINO, rel));
  for (const [rel, conteudo] of Object.entries(esp)) {
    const alvo = join(DESTINO, rel);
    mkdirSync(dirname(alvo), { recursive: true });
    if (!existsSync(alvo) || !readFileSync(alvo).equals(conteudo)) writeFileSync(alvo, conteudo);
  }
  const g = gerados();
  for (const [rel, texto] of Object.entries(g)) {
    const alvo = join(RAIZ, rel);
    if (!existsSync(alvo) || readFileSync(alvo, 'utf8') !== texto) writeFileSync(alvo, texto);
  }
  console.log('vagas/comum/: ' + Object.keys(esp).length + ' arquivos (notus.css, fonte e assets/marca/); gerados: ' + Object.keys(g).join(', ') + '.');
  const p = pesoDaLista();
  if (p) console.log('Peso da lista (' + p.pagina + ', 1ª visita): ' + (p.total / 1024).toFixed(1) + ' KB de ' + (p.limite / 1024) + ' KB.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--checar')) {
    const problemas = conferir().concat(conferirGerados());
    const p = pesoDaLista();
    if (p) {
      for (const x of p.itens) if (x.falta) problemas.push('a lista pública carrega ' + x.arquivo + ', que não existe');
      if (p.total > p.limite) problemas.push('lista pública pesada demais: ' + (p.total / 1024).toFixed(1) + ' KB (limite ' + (p.limite / 1024) + ' KB): ' +
        p.itens.map((x) => x.arquivo + ' ' + (x.bytes / 1024).toFixed(1)).join(', '));
    }
    if (problemas.length) {
      console.error('vagas/ desatualizado. Rode: node scripts/montar-vagas.mjs\n  ' + problemas.join('\n  '));
      process.exit(1);
    }
    console.log('vagas/comum/ e textos gerados em dia.' + (p ? ' Lista pública: ' + (p.total / 1024).toFixed(1) + ' KB de ' + (p.limite / 1024) + ' KB.' : ''));
  } else {
    montar();
  }
}
