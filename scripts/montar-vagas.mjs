#!/usr/bin/env node
// Copia as peças compartilhadas da marca para o site do Vagas sem Caos (vagas/comum/), que é publicado sozinho
// (Cloudflare Pages com raiz em vagas/; não enxerga a pasta assets/ do DISC).
//
//   node scripts/montar-vagas.mjs           -> grava vagas/comum/ (e apaga o que sobrar lá dentro)
//   node scripts/montar-vagas.mjs --checar  -> só confere; sai com código 1 se faltar, sobrar ou estiver diferente (roda no npm test)
//
// Fonte da verdade continua em assets/: notus.css (tokens e peças), a fonte Plus Jakarta Sans (+ licença OFL) e todo o
// assets/marca/ (logos e favicons da Gestão sem Caos). NUNCA edite vagas/comum/ à mão: edite em assets/ e rode este script.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'vagas', 'comum');
const CABECALHO_CSS = '/* CÓPIA GERADA por scripts/montar-vagas.mjs a partir de assets/notus.css. NÃO EDITE AQUI: edite assets/notus.css e rode o script. */\n';

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

function montar() {
  const esp = esperado();
  for (const rel of arquivosEm(DESTINO)) if (!esp[rel]) rmSync(join(DESTINO, rel));
  for (const [rel, conteudo] of Object.entries(esp)) {
    const alvo = join(DESTINO, rel);
    mkdirSync(dirname(alvo), { recursive: true });
    if (!existsSync(alvo) || !readFileSync(alvo).equals(conteudo)) writeFileSync(alvo, conteudo);
  }
  console.log('vagas/comum/: ' + Object.keys(esp).length + ' arquivos (notus.css, fonte e assets/marca/).');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--checar')) {
    const problemas = conferir();
    if (problemas.length) {
      console.error('vagas/comum/ desatualizado. Rode: node scripts/montar-vagas.mjs\n  ' + problemas.join('\n  '));
      process.exit(1);
    }
    console.log('vagas/comum/ em dia.');
  } else {
    montar();
  }
}
