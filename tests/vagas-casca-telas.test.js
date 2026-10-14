'use strict';
// Vagas sem Caos — telas públicas da casca (marco 2): index.html (escolha da cidade), cidade.html (lista e filtros),
// vaga.html (Quero/Pular) — lógica pura, conferências de segurança/texto e o peso da primeira visita da lista (≤ 100 KB).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const U = require('../vagas/js/ui.js');
const CID = require('../vagas/js/cidade.js');
const VAGA = require('../vagas/js/vaga.js');
const R = require('../vagas/js/regras.js');
const TELA = require('./helpers/vagas-tela.js');

test('cidade: filtros da URL só com chaves e valores conhecidos; ida e volta pela URL', () => {
  const f = CID.filtrosDaUrl('?cidade=x&areas=caixa,inventada,vendas-loja&modalidade=clt&turno=noite&salarioMin=160000&zona=centro&entorno=1&semExperiencia=1&paraHoje=0&busca=  caixa  &nota=90&idade=20', U.parametro);
  assert.deepEqual(f, { areas: ['vendas-loja', 'caixa'], modalidade: ['clt'], turno: ['noite'], salarioMin: 160000, zona: 'centro', entorno: true, semExperiencia: true, paraHoje: false, busca: 'caixa' });
  assert.equal(CID.filtrosDaUrl('?cidade=x', U.parametro), null, 'sem filtro na URL: usa o que está guardado');
  assert.deepEqual(CID.filtrosDaUrl('?zona=<script>&salarioMin=-5', U.parametro), {});
  const ida = CID.filtrosParaUrl(f);
  assert.equal(ida, 'areas=vendas-loja%2Ccaixa&modalidade=clt&turno=noite&salarioMin=160000&zona=centro&entorno=1&semExperiencia=1&busca=caixa');
  assert.deepEqual(CID.filtrosDaUrl('?' + ida, U.parametro), { areas: ['vendas-loja', 'caixa'], modalidade: ['clt'], turno: ['noite'], salarioMin: 160000, zona: 'centro', entorno: true, semExperiencia: true, busca: 'caixa' });
});

test('cidade: filtro da API só com atributos da vaga (P3), entorno desligado por padrão, "todas as áreas" explícito', () => {
  const o = CID.filtroDaApi('uruacu-go', { areas: ['caixa'], salarioMin: 160000, paraHoje: true, busca: 'caixa' });
  assert.deepEqual(o, { cidade: 'uruacu-go', entorno: false, limite: 20, areas: ['caixa'], salarioMin: 160000, paraHoje: true, busca: 'caixa' });
  assert.equal(CID.filtroDaApi('x', {}).areas, undefined, 'sem áreas: o banco usa as do currículo (pessoa logada)');
  assert.deepEqual(CID.filtroDaApi('x', { areasTodas: true }).areas, [], 'Ver todas: lista vazia explícita');
  assert.equal(CID.filtroDaApi('x', { entorno: true }).entorno, true);
  assert.deepEqual(CID.filtroDaApi('x', {}, { somenteTotal: true }).somenteTotal, true);
  for (const proibido of ['nota', 'selo', 'temSelo', 'referencia', 'idade', 'sexo']) {
    assert.equal(CID.filtroDaApi('x', { [proibido]: 1 })[proibido], undefined, proibido);
  }
  assert.equal(CID.quantosFiltros({ areas: ['a', 'b'], turno: ['manha'], salarioMin: 1, zona: 'z', semExperiencia: true, paraHoje: true, entorno: true, busca: 'x' }), 8);
});

test('cidade: salário digitado e contador aproximado da lista de espera (nunca o número exato)', () => {
  assert.equal(CID.lerSalario('1600'), 160000);
  assert.equal(CID.lerSalario('R$ 1.600'), 160000);
  assert.equal(CID.lerSalario('1.600,00'), 160000);
  assert.equal(CID.lerSalario(''), null);
  assert.ok(Number.isNaN(CID.lerSalario('mil')));
  assert.equal(CID.interessadosTexto(0), '');
  assert.equal(CID.interessadosTexto(7), '');
  assert.equal(CID.interessadosTexto(10), 'Mais de 10');
  assert.equal(CID.interessadosTexto(118), 'Mais de 110');
  assert.equal(CID.listaEsperaComWhatsapp({}), false, 'sem o recurso no cliente, só e-mail');
  assert.equal(CID.listaEsperaComWhatsapp({ RECURSOS: { listaEsperaWhatsapp: true } }), true);
});

test('vaga: código, intenção de "Quero" guardada (só desta vaga e por 7 dias) e linhas da vaga', () => {
  assert.equal(VAGA.codigoValido(' k7m2qx '), 'K7M2QX');
  assert.equal(VAGA.codigoValido('K7M2QX"><b>'), '');
  const agora = Date.parse('2026-10-13T15:00:00Z');
  assert.equal(VAGA.intencaoValida({ codigo: 'K7M2QX', em: agora - 3600000 }, 'K7M2QX', agora), true);
  assert.equal(VAGA.intencaoValida({ codigo: 'OUTRA1', em: agora }, 'K7M2QX', agora), false);
  assert.equal(VAGA.intencaoValida({ codigo: 'K7M2QX', em: agora - 8 * 86400000 }, 'K7M2QX', agora), false);
  assert.equal(VAGA.intencaoValida(null, 'K7M2QX', agora), false);
  U.definirFuso('America/Sao_Paulo');
  const a = { cidade: { nome: 'Cidade Teste' }, zona: { nome: 'Centro' }, modalidade: 'clt', turno: 'comercial', fimDeSemana: true, inicio: 'imediato',
    quantidade: 2, publicadoEm: '2026-10-12T15:00:00Z', expiraEm: '2026-11-11T15:00:00Z', valor: { minCentavos: 162100, maxCentavos: null, unidade: 'mes' } };
  assert.deepEqual(VAGA.dadosDaVaga(a, U), [['Onde', 'Centro, Cidade Teste'], ['Horário', 'Horário comercial, com fim de semana'], ['Começa', 'Imediato'],
    ['Vagas', '2'], ['Publicada', '12/10/2026 · fica no ar até 11/11']]);
  const d = { cidade: { nome: 'Cidade Teste' }, zona: null, modalidade: 'diaria', diaria: { data: '2026-10-14', inicio: '07:00', fim: '16:00' }, quantidade: 1,
    valor: { minCentavos: 12000, maxCentavos: null, unidade: 'dia' } };
  assert.deepEqual(VAGA.dadosDaVaga(d, U).slice(0, 4), [['Onde', 'Cidade Teste'], ['Data', '14/10/2026'], ['Horário', '07:00 às 16:00'], ['Valor do dia', 'R$ 120 por dia']]);
  assert.deepEqual(VAGA.requisitosDaVaga({ requisitosLista: ['CNH categoria B'], experiencia: '6_meses', escolaridade: 'medio' }),
    ['CNH categoria B', 'Experiência: pelo menos 6 meses na função', 'Escolaridade mínima: Médio']);
  assert.deepEqual(VAGA.requisitosDaVaga({ experiencia: 'nao_precisa', escolaridade: 'nao_exigida' }), [R.rotulo(R.EXPERIENCIAS_VAGA, 'nao_precisa')]);
});

test('páginas públicas: CSP, scripts em ordem, nada inline, sem innerHTML, sem palavra proibida nem cidade fixa', () => {
  for (const p of ['index.html', 'cidade.html', 'vaga.html']) assert.deepEqual(TELA.conferirPagina(p), [], p);
  for (const s of ['js/inicio.js', 'js/cidade.js', 'js/cidade-filtros.js', 'js/vaga.js']) assert.deepEqual(TELA.conferirScript(s), [], s);
  const lista = fs.readFileSync(path.join(TELA.VAGAS, 'cidade.html'), 'utf8');
  const scripts = [...lista.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['js/endereco.js', 'js/config.js', 'js/regras.js', 'js/textos.js', 'js/api.js', 'js/ui.js', 'js/pecas.js', 'js/cidade.js'],
    'a lista carrega só o mínimo (a folha de filtros vem sob demanda)');
});

test('peso da lista pública (cidade.html, 1ª visita, gzip): até 100 KB, medido pelo montar-vagas --checar', async () => {
  const M = await import('../scripts/montar-vagas.mjs');
  const p = M.pesoDaLista();
  assert.ok(p, 'cidade.html existe');
  assert.deepEqual(p.itens.filter((x) => x.falta), []);
  assert.ok(p.total <= p.limite, 'lista com ' + (p.total / 1024).toFixed(1) + ' KB');
  assert.ok(p.itens.some((x) => x.arquivo === 'comum/fonts/plus-jakarta-sans-latin-wght-normal.woff2'), 'a fonte entra na conta');
  assert.ok(!p.itens.some((x) => /api-previa|cidade-filtros|ui-area|pecas-pessoa|textos-conta/.test(x.arquivo)), 'só o que a 1ª visita carrega');
});

test('_redirects: /<cidade>/ vai para cidade.html (302), raiz sem cidade fixa', () => {
  const txt = fs.readFileSync(path.join(TELA.VAGAS, '_redirects'), 'utf8');
  const regras = txt.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/).join(' '));
  // A dinâmica da cidade é a última; antes dela, as estáticas das páginas de divulgação e do selo (com a barra no fim), que ela
  // engoliria, e o endereço curto da conferência do selo (/selo/<código>).
  assert.deepEqual(regras, ['/emprego/ /emprego 301', '/empresas/ /empresas 301', '/selo/ /selo 301',
    '/selo/:codigo /selo.html?codigo=:codigo 302', '/:cidade/ /cidade.html?cidade=:cidade 302']);
});
