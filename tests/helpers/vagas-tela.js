'use strict';
// Conferências comuns das telas do Vagas sem Caos (vagas/*.html e vagas/js/*.js), para os testes de CADA frente usarem:
//   const { conferirPagina, conferirScript, PALAVRAS_PROIBIDAS } = require('./helpers/vagas-tela.js');
//   assert.deepEqual(conferirPagina('eu.html'), []);   assert.deepEqual(conferirScript('js/eu.js'), []);
// Cada função devolve a lista de problemas (vazia = ok). Regras: docs/VAGAS-TELAS.md (regras para todas as telas), o briefing
// da onda 2 (segurança do cliente, palavras proibidas, sem nome de cidade fixo) e padroes.md §6.
const fs = require('node:fs');
const path = require('node:path');

const VAGAS = path.join(__dirname, '..', '..', 'vagas');
const ler = (rel) => fs.readFileSync(path.join(VAGAS, rel), 'utf8');

// Palavras e frases que nunca aparecem em tela (decisão do dono + padroes.md §6). "DISC" só na tela "Contratada" da empresa.
const PALAVRAS_PROIBIDAS = [/\btinder\b/i, /\bswipe\b/i, /\bmatch\b/i, /\baprovad[oa]s?\b/i, /\breprovad[oa]s?\b/i, /perfil ideal/i,
  /compatibilidade/i, /o teste prev[eê]/i, /curr[ií]culo verificado/i, /\bvalidad[oa]s?\b/i, /cient[ií]fic/i, /\bcertificad/i,
  /\branking\b/i, /os melhores/i, /teste psicol[oó]gico/i, /avalia[cç][aã]o/i, /\bnotus\b/i];
const DISC = /\bDISC\b/;
// Nenhum nome de cidade, estado ou fuso fixo nas telas (a cidade do piloto vem do banco; integrador, 13/10).
const CIDADE_FIXA = [/Boa Vista/i, /Roraima/i, /Mucaja[ií]/i, /\bCant[aá]\b/, /Rorain[oó]polis/i, /Caracara[ií]/i, /America\/Boa_Vista/];
const CSP_MINIMA = ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "connect-src 'self' https://tevpqngqzxcswmticjnr.supabase.co"];

function semComentarios(texto) {
  return String(texto)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}
function politica(html) {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  return m ? m[1] : '';
}

// Texto que aparece para quem usa: palavras proibidas e cidade fixa. opcoes.permitirDisc libera "DISC" (só a tela Contratada).
function conferirTexto(texto, nome, opcoes) {
  const op = opcoes || {};
  const t = semComentarios(texto);
  const problemas = [];
  for (const re of PALAVRAS_PROIBIDAS) { const m = t.match(re); if (m) problemas.push(nome + ': palavra proibida "' + m[0] + '"'); }
  if (!op.permitirDisc && DISC.test(t)) problemas.push(nome + ': "DISC" fora da tela Contratada');
  for (const re of CIDADE_FIXA) { const m = t.match(re); if (m) problemas.push(nome + ': nome de cidade/fuso fixo "' + m[0] + '"'); }
  return problemas;
}

// Página HTML: CSP com o mínimo, endereco.js no <head> antes de tudo, scripts só do próprio site e em ordem, nada inline.
function conferirPagina(rel, opcoes) {
  const html = ler(rel);
  // Nomes de arquivo (comum/notus.css) não são texto de tela: as tags <link>/<script src> saem da conferência de palavras.
  const problemas = conferirTexto(html.replace(/<link[^>]*>/g, '').replace(/<script[^>]*><\/script>/g, ''), rel, opcoes);
  const csp = politica(html);
  if (!csp) problemas.push(rel + ': falta a meta Content-Security-Policy');
  for (const d of CSP_MINIMA) if (!csp.includes(d)) problemas.push(rel + ': CSP sem ' + d);
  if (/script-src[^;]*'unsafe-(inline|eval)'/.test(csp)) problemas.push(rel + ': CSP libera script inline');
  if (!/<html lang="pt-BR">/.test(html)) problemas.push(rel + ': sem lang="pt-BR"');
  if (/<script(?![^>]*\ssrc=)[^>]*>/.test(html)) problemas.push(rel + ': <script> inline');
  if (/\son[a-z]+=/i.test(html)) problemas.push(rel + ': atributo on* no HTML');
  if (/\sstyle="/.test(html)) problemas.push(rel + ': atributo style (a CSP bloqueia)');
  if (/<select\b/i.test(html)) problemas.push(rel + ': <select> nativo');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts) {
    if (/^(https?:)?\/\//.test(s) || s.startsWith('/')) problemas.push(rel + ': script de fora ou com caminho absoluto: ' + s);
    else if (!fs.existsSync(path.join(VAGAS, s))) problemas.push(rel + ': falta ' + s);
  }
  if (scripts.length && scripts[0] !== 'js/endereco.js') problemas.push(rel + ': js/endereco.js precisa ser o primeiro script');
  if (html.indexOf('js/endereco.js') > html.indexOf('</head>')) problemas.push(rel + ': js/endereco.js fora do <head>');
  const ordem = ['js/config.js', 'js/regras.js', 'js/textos.js', 'js/api.js', 'js/ui.js'].map((s) => scripts.indexOf(s));
  const presentes = ordem.filter((i) => i >= 0);
  if (presentes.join() !== presentes.slice().sort((a, b) => a - b).join()) problemas.push(rel + ': ordem dos scripts fora do padrão (config, regras, textos, api, ui)');
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    const u = m[1];
    if (/^(https?:|mailto:)/.test(u)) continue;
    if (u.startsWith('/')) problemas.push(rel + ': caminho absoluto ' + u + ' (use relativo)');
  }
  return problemas;
}

// Script de tela: nada de innerHTML/insertAdjacentHTML/outerHTML/document.write/eval, nem confirm/alert/prompt do navegador.
function conferirScript(rel, opcoes) {
  const js = ler(rel);
  const t = semComentarios(js);
  const problemas = conferirTexto(js, rel, opcoes);
  if (/\.(innerHTML|outerHTML)\s*[+]?=/.test(t)) problemas.push(rel + ': innerHTML/outerHTML');
  if (/insertAdjacentHTML\s*\(/.test(t)) problemas.push(rel + ': insertAdjacentHTML');
  if (/document\.write\s*\(/.test(t)) problemas.push(rel + ': document.write');
  if (/\beval\s*\(|new Function\s*\(/.test(t)) problemas.push(rel + ': eval/new Function');
  if (/(^|[^.\w])(window\.)?(confirm|prompt|alert)\s*\(/.test(t)) problemas.push(rel + ': confirm/prompt/alert do navegador');
  if (/['"]\/(?!\/)[a-z]/.test(t.replace(/\/\^?[^/\n]*\/[gimsuy]*/g, ''))) {
    // Caminho começando com "/" em string (ex.: '/entrar.html'): só relativo funciona em /vagas/ e no artefato de prévia.
    const m = t.match(/['"]\/[a-z][^'"]*\.html/);
    if (m) problemas.push(rel + ': caminho absoluto ' + m[0].slice(1));
  }
  return problemas;
}

module.exports = { conferirPagina, conferirScript, conferirTexto, semComentarios, politica, PALAVRAS_PROIBIDAS, CIDADE_FIXA, VAGAS };
