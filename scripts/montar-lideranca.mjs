#!/usr/bin/env node
// Monta js/lideranca-avancado-dados.js (conteúdo do "Como liderar" avançado) a partir de conteudo/lideranca/<CODIGO>.json.
//
//   node scripts/montar-lideranca.mjs           -> valida cada JSON (regras abaixo) e grava o gerado
//   node scripts/montar-lideranca.mjs --checar  -> só confere; sai com código 1 se algum JSON for inválido ou o gerado
//                                                 estiver desatualizado (roda no npm test)
//   import { checarConteudo, CAMPOS } from './montar-lideranca.mjs'  -> checarConteudo(dados) devolve [mensagens de erro]
//
// Um arquivo por combinação (as mesmas 16 de conteudo/profundo: D, I, S, C, DI, DS, ...). O gerado é UMD:
// global DISC_LIDERANCA_DADOS = { D: {...}, DI: {...} } (ou module.exports no Node).
//
// Regras de conteúdo (quem escreve deve seguir):
//   - todos os capítulos e listas com o mínimo de itens e de palavras (CAMPOS);
//   - linguagem neutra de gênero para a pessoa avaliada ("a pessoa", "quem tem este perfil"): nada de ele/ela/dele/dela
//     nem "o colaborador"/"a funcionária";
//   - DISC descreve estilo, não saúde: nada de rótulo clínico (ansiedade, depressão, burnout, diagnóstico, transtorno...);
//   - nada de linguagem de exclusão (demitir, descartar, eliminar, reprovar, "não contratar");
//   - nada de nomes de perfil de outras metodologias (Executor, Analista, Comunicador...) nem da agência de design;
//   - único marcador aceito: {nome} (trocado pelo nome curto da pessoa ou por "esta pessoa").
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(RAIZ, 'conteudo', 'lideranca');
const SAIDA = join(RAIZ, 'js', 'lideranca-avancado-dados.js');

export const CODIGOS = ['D', 'I', 'S', 'C', 'DI', 'DS', 'DC', 'ID', 'IS', 'IC', 'SD', 'SI', 'SC', 'CD', 'CI', 'CS'];
export const LETRAS = ['D', 'I', 'S', 'C'];
export const MIN_PALAVRAS_TOTAL = 2500;

// Radicais (casam no começo da palavra, com qualquer final) e palavras inteiras proibidas.
export const RADICAIS = /(^|[^a-zà-ÿ])(c[ée]rebr|hemisf|neuro|ansied|ansios|depress|transtorn|diagn[oó]st|patol[oó]g|autoestima|burnout|s[ií]ndrome|doen[çc]|adoec|surto|t[oó]xic|psicopat|narcis|bipolar|demit|descart|elimin|reprov|n[aã]o contrat|notus|whatsapp)/i;
export const PALAVRAS = /\b(cura|QI|IBC|Executor|Comunicador|Planejador|Analista|Inovador|Empreendedor|Comandante|Aconselhador|Especialista|Protetor|Solucionador|Competidor|Articulador|Julgador|Organizador|Integrador|Influenciador|Inventivo|Motivador|Vendedor|Diplomata|Atendente|Professoral|Estrategista|Controlador|Administrador)\b/i;
// Gênero da pessoa avaliada: pronomes e substantivos marcados.
export const GENERO = /(^|[^a-zà-ÿ])(ele|ela|eles|elas|dele|dela|deles|delas|nele|nela|neles|nelas)(?![a-zà-ÿ])|\b(o|a|do|da|ao|à|pelo|pela|no|na|um|uma) (colaborador|colaboradora|funcion[áa]rio|funcion[áa]ria|liderado|liderada|empregado|empregada)\b/i;

export const palavras = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// Mínimos por capítulo: [campo, tipo, mínimo de itens, mínimo de palavras (por item ou do texto)].
//   tipo: 'texto' | 'lista' (strings) | 'pares' ([{situacao, frase}]) | 'topicos' ([{titulo, texto}])
export const CAMPOS = {
  feedback: [['texto', 'texto', 0, 70], ['funciona', 'lista', 4, 8], ['da_errado', 'lista', 4, 8], ['frases', 'pares', 5, 12]],
  delegacao: [['texto', 'texto', 0, 60], ['autonomia', 'texto', 0, 30], ['combinar', 'lista', 4, 8], ['acompanhar', 'texto', 0, 25],
    ['exemplo', 'texto', 0, 40], ['armadilhas', 'lista', 3, 8]],
  motivacao: [['texto', 'texto', 0, 60], ['autonomia', 'texto', 0, 25], ['competencia', 'texto', 0, 25], ['vinculo', 'texto', 0, 25],
    ['reconhecer', 'lista', 4, 8], ['desmotiva', 'lista', 4, 6]],
  retencao: [['texto', 'texto', 0, 60], ['fica', 'lista', 4, 6], ['sai', 'lista', 4, 6], ['sinais', 'lista', 3, 6], ['perguntas', 'lista', 3, 6]],
  desgaste: [['texto', 'texto', 0, 60], ['demandas', 'lista', 3, 6], ['recursos', 'lista', 3, 6], ['sinais_iniciais', 'lista', 4, 6],
    ['sinais_fortes', 'lista', 3, 6], ['como_agir', 'lista', 4, 8], ['conversa', 'texto', 0, 20]],
  mudanca: [['texto', 'texto', 0, 60], ['antes', 'lista', 3, 8], ['durante', 'lista', 3, 8], ['depois', 'lista', 3, 8], ['frase', 'texto', 0, 20]],
  conflito: [['texto', 'texto', 0, 60], ['gatilhos', 'lista', 4, 6], ['como_aparece', 'texto', 0, 30], ['mediar', 'lista', 5, 8], ['frase', 'texto', 0, 20]],
  um_a_um: [['frequencia', 'texto', 0, 20], ['pauta', 'topicos', 5, 12], ['perguntas', 'lista', 5, 6], ['evite', 'lista', 3, 6]],
  plano_90: [['texto', 'texto', 0, 30], ['dias_30', 'lista', 4, 10], ['dias_60', 'lista', 4, 10], ['dias_90', 'lista', 4, 10], ['sinais_bons', 'lista', 3, 6]]
};

function checarCampo(erro, cap, obj, [campo, tipo, minItens, minPal]) {
  const v = obj[campo];
  const nome = cap + '.' + campo;
  if (tipo === 'texto') { if (palavras(v) < minPal) erro(nome + ': ' + minPal + '+ palavras'); return; }
  if (!Array.isArray(v) || v.length < minItens) { erro(nome + ': ' + minItens + '+ itens'); return; }
  v.forEach((it, i) => {
    if (tipo === 'lista' && (typeof it !== 'string' || palavras(it) < minPal)) erro(nome + '[' + i + ']: texto de ' + minPal + '+ palavras');
    if (tipo === 'pares' && (!it || !String(it.situacao || '').trim() || palavras(it.frase) < minPal)) erro(nome + '[' + i + ']: {situacao, frase ' + minPal + '+ palavras}');
    if (tipo === 'topicos' && (!it || !String(it.titulo || '').trim() || palavras(it.texto) < minPal)) erro(nome + '[' + i + ']: {titulo, texto ' + minPal + '+ palavras}');
  });
}

// Erros de formato/tamanho/termos de UMA combinação (lista vazia = ok).
export function checarConteudo(d) {
  const erros = [];
  const erro = (m) => erros.push(m);
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['não é um objeto'];
  if (!CODIGOS.includes(d.codigo)) erro('codigo');
  const textos = [];
  (function juntar(v) {
    if (typeof v === 'string') textos.push(v);
    else if (Array.isArray(v)) v.forEach(juntar);
    else if (v && typeof v === 'object') Object.values(v).forEach(juntar);
  })(d);
  for (const t of textos) {
    let m = RADICAIS.exec(t); if (m) erro('termo proibido: ' + m[2] + '… em "' + t.slice(0, 60) + '"');
    m = PALAVRAS.exec(t); if (m) erro('termo proibido: ' + m[0] + ' em "' + t.slice(0, 60) + '"');
    m = GENERO.exec(t); if (m) erro('linguagem marcada por gênero: "' + m[0].trim() + '" em "' + t.slice(0, 60) + '"');
    if (/\{(?!nome\})[^}]*\}/.test(t)) erro('marcador desconhecido em "' + t.slice(0, 60) + '" (só {nome})');
    if (/@/.test(t)) erro('arroba no texto: "' + t.slice(0, 60) + '"');
  }
  if (!Array.isArray(d.retrato) || d.retrato.length < 3 || d.retrato.some((p) => palavras(p) < 50)) erro('retrato: 3+ parágrafos de 50+ palavras');
  for (const cap of Object.keys(CAMPOS)) {
    const obj = d[cap];
    if (!obj || typeof obj !== 'object') { erro(cap + ': capítulo ausente'); continue; }
    CAMPOS[cap].forEach((c) => checarCampo(erro, cap, obj, c));
  }
  const v = d.voce_e_esta_pessoa || {};
  for (const l of LETRAS) {
    const x = v[l];
    if (!x || palavras(x.texto) < 40) erro('voce_e_esta_pessoa.' + l + '.texto: 40+ palavras');
    if (!x || !Array.isArray(x.ajustes) || x.ajustes.length < 3 || x.ajustes.some((a) => palavras(a) < 8)) erro('voce_e_esta_pessoa.' + l + '.ajustes: 3+ de 8+ palavras');
  }
  if (!erros.length && contarPalavras(d) < MIN_PALAVRAS_TOTAL) erro('conteúdo curto: ' + contarPalavras(d) + ' palavras (mínimo ' + MIN_PALAVRAS_TOTAL + ')');
  return erros;
}

export function contarPalavras(d) {
  let n = 0;
  (function contar(v) {
    if (typeof v === 'string') n += palavras(v);
    else if (Array.isArray(v)) v.forEach(contar);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (k !== 'codigo') contar(x); });
  })(d);
  return n;
}

export function lerConteudo(pasta = PASTA) {
  const erros = [];
  const dados = {}, resumo = [];
  const arquivos = existsSync(pasta) ? readdirSync(pasta).filter((a) => a.endsWith('.json')).sort() : [];
  for (const arq of arquivos) {
    let d;
    try { d = JSON.parse(readFileSync(join(pasta, arq), 'utf8')); } catch (e) { erros.push(arq + ': JSON inválido: ' + e.message); continue; }
    const problemas = checarConteudo(d);
    problemas.forEach((m) => erros.push(arq + ': ' + m));
    if (problemas.length) continue;
    if (arq !== d.codigo + '.json') { erros.push(arq + ': o nome do arquivo deve ser ' + d.codigo + '.json'); continue; }
    dados[d.codigo] = d;
    resumo.push({ arquivo: arq, codigo: d.codigo, palavras: contarPalavras(d) });
  }
  const ordenado = {};
  for (const c of CODIGOS) if (dados[c]) ordenado[c] = dados[c];
  return { dados: ordenado, erros, resumo };
}

export function gerar(dados) {
  const codigos = Object.keys(dados);
  return [
    '// ARQUIVO GERADO AUTOMATICAMENTE — NÃO EDITE. Fonte: conteudo/lideranca/<CODIGO>.json. Rode: node scripts/montar-lideranca.mjs',
    '// Conteúdo do "Como liderar" avançado por combinação DISC (' + (codigos.length ? codigos.join(', ') : 'nenhuma') + ').',
    '// UMD: global DISC_LIDERANCA_DADOS = { <codigo>: { codigo, retrato, feedback, delegacao, motivacao, retencao, desgaste, mudanca,',
    '//   conflito, um_a_um, plano_90, voce_e_esta_pessoa } }. Montado por js/lideranca-avancado.js.',
    '(function (root) {',
    '  \'use strict\';',
    '  var DADOS = ' + JSON.stringify(dados, null, 1).replace(/\n/g, '\n  ') + ';',
    '  if (typeof module !== \'undefined\' && module.exports) module.exports = DADOS;',
    '  else root.DISC_LIDERANCA_DADOS = DADOS;',
    '})(typeof self !== \'undefined\' ? self : this);',
    ''
  ].join('\n');
}

function principal() {
  const checar = process.argv.includes('--checar');
  const { dados, erros, resumo } = lerConteudo();
  if (erros.length) {
    console.error('montar-lideranca: ' + erros.length + ' problema(s) no conteúdo\n' + erros.map((e) => '  ✗ ' + e).join('\n'));
    process.exit(1);
  }
  const novo = gerar(dados);
  const atual = existsSync(SAIDA) ? readFileSync(SAIDA, 'utf8').replace(/\r\n/g, '\n') : '';
  const lista = resumo.map((r) => r.codigo + ' ' + r.palavras).join(', ');
  if (checar) {
    if (atual !== novo) {
      console.error('montar-lideranca: js/lideranca-avancado-dados.js desatualizado. Rode: node scripts/montar-lideranca.mjs');
      process.exit(1);
    }
    console.log('montar-lideranca: ok (' + Object.keys(dados).length + ' combinações' + (lista ? ': ' + lista : '') + ')');
    return;
  }
  if (atual !== novo) writeFileSync(SAIDA, novo);
  console.log('montar-lideranca: ' + (atual !== novo ? 'gravado' : 'sem mudanças') + ' js/lideranca-avancado-dados.js (' + Object.keys(dados).length + ' combinações' + (lista ? ': ' + lista : '') + ')');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
