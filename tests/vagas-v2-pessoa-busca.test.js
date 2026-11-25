'use strict';
// Vagas sem Caos v2 · busca da pessoa (vagas/js/v2/pessoa/busca.js): lógica pura sobre a base FICTÍCIA da prévia.
// Sem acento, feminino, sinônimos, erro de 1 letra, frases que viram filtro, filtros por FATO (nada de nota, ranking ou idade) e ordem
// só por data ou por salário.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../vagas/js/v2/pessoa/busca.js');

function carregarBase() {
  global.window = global;
  delete global.VSC_DADOS;
  const dados = require('../vagas/js/v2/previa/dados.js');
  require('../vagas/js/v2/previa/dados-mais.js');
  const D = global.VSC_DADOS || dados;
  delete global.window;
  return D;
}
const D = carregarBase();
const EMP = {};
D.empresas.forEach((e) => { EMP[e.id] = e; });
const VAGAS = D.vagas.filter((v) => v.status === 'aberta').map((v) => Object.assign({}, v, { horas: v.publicadaHa }));
const SETORES = D.setores;
const CIDADES = D.cidades;
function criar(extra) { return B.criar(Object.assign({ vagas: VAGAS.map((v) => Object.assign({}, v)), empresas: EMP, setores: SETORES, cidades: CIDADES, meuBairro: () => null, tipoNome: (t) => t }, extra || {})); }
const F = (o) => Object.assign(B.filtroVazio(), o || {});

test('norm tira acento, caixa e pontuação; "(a)" some', () => {
  assert.equal(B.norm('  Operador(a) de Caixa — Uruaçu! '), 'operador de caixa uruacu');
  assert.equal(B.norm('Cozinheira'), 'cozinheira');
});

test('a base fictícia tem vagas para os testes', () => {
  assert.ok(VAGAS.length > 100);
  assert.ok(VAGAS.every((v) => v.salario && typeof v.salario.texto === 'string'));
});

test('"cozinheira" acha cozinheiro e auxiliar de cozinha (feminino, sem acento e sinônimo)', () => {
  const b = criar();
  const l = b.filtrar(F({ q: 'cozinheira' }));
  assert.ok(l.length > 0);
  assert.ok(l.every((v) => /cozinh|chapeir|pizzaiol|merendeir/i.test(v.titulo.normalize('NFD').replace(/[̀-ͯ]/g, ''))), l.map((v) => v.titulo).join(' | '));
  assert.deepEqual(b.filtrar(F({ q: 'COZINHEIRA' })).map((v) => v.id), l.map((v) => v.id));
});

test('sinônimos: "bico" são diárias e "estágio" são estágios', () => {
  const b = criar();
  assert.ok(b.filtrar(F({ q: 'bico' })).every((v) => v.tipo === 'Diária' || /diarist/i.test(B.norm(v.titulo))));
  const est = b.filtrar(F({ q: 'estagio' }));
  assert.ok(est.length > 0 && est.every((v) => v.tipo === 'Estágio'));
});

test('erro de 1 letra: "vendedro" acha vendedor e a tela avisa a troca; "cozinhera" já entra pelo sinônimo', () => {
  const b = criar(), info = {};
  const l = b.filtrar(F({ q: 'vendedro' }), null, info);
  assert.ok(l.length > 0);
  assert.ok(l.every((v) => /vendedor/i.test(v.titulo)));
  assert.equal(info.trocas.length, 1);
  assert.equal(info.trocas[0].de, 'vendedro');
  assert.equal(info.trocas[0].para, 'vendedor');
  assert.ok(b.filtrar(F({ q: 'cozinhera' })).length > 0);
});

test('palavra que não existe em nenhuma vaga: lista vazia e a palavra volta em ign', () => {
  const b = criar(), info = {};
  assert.deepEqual(b.filtrar(F({ q: 'xyzqwerty' }), null, info), []);
  assert.deepEqual(info.ign, ['xyzqwerty']);
});

test('frases viram filtro: sem experiência, pcd, urgente, carteira assinada, cnh d, cidade e bairro', () => {
  const b = criar();
  let r = b.entender('caixa sem experiência');
  assert.equal(r.F.semExp, true);
  assert.equal(r.resto, 'caixa');
  r = b.entender('vaga pcd urgente');
  assert.equal(r.F.pcd, true); assert.equal(r.F.urgente, true);
  r = b.entender('carteira assinada');
  assert.deepEqual(r.F.tipos, ['CLT']);
  r = b.entender('motorista cnh d');
  assert.equal(r.F.cnh, 'D');
  const campinorte = CIDADES.filter((c) => /campinorte/i.test(c.nome))[0];
  r = b.entender('atendente em Campinorte');
  assert.equal(r.F.onde, campinorte.id);
  assert.deepEqual(B.tokens(r.resto), ['atendente']);
  const bairro = CIDADES[0].bairros.filter((x) => x !== 'Centro')[0];
  r = b.entender('caixa ' + bairro.toLowerCase());
  assert.equal(r.F.bairro, bairro);
});

test('"jovem aprendiz" não vira vaga de aprendiz: marca sem experiência e avisa (só 18+)', () => {
  const r = criar().entender('jovem aprendiz');
  assert.equal(r.aprendiz, true);
  assert.equal(r.F.semExp, true);
});

test('"perto de casa" usa o bairro guardado; sem bairro, pede o bairro', () => {
  const mb = { cidade: CIDADES[0].id, bairro: CIDADES[0].bairros[1] };
  assert.equal(criar({ meuBairro: () => mb }).entender('perto de casa').F.bairro, mb.bairro);
  assert.equal(criar().entender('perto de casa').pedirBairro, true);
});

test('filtros por fato: só verificadas, sem experiência, tipo, turno, salário por mês, urgente, pcd, publicada', () => {
  const b = criar();
  assert.ok(b.filtrar(F({ verif: true })).every((v) => EMP[v.empresaId].verificada));
  assert.ok(b.filtrar(F({ semExp: true })).every((v) => v.semExperiencia));
  assert.ok(b.filtrar(F({ tipos: ['Diária'] })).every((v) => v.tipo === 'Diária'));
  assert.ok(b.filtrar(F({ turnos: ['Noite'] })).every((v) => v.turno === 'Noite'));
  assert.ok(b.filtrar(F({ sal: { p: 'mes', min: 2500 } })).every((v) => v.salario.periodo === 'mes' && v.salario.min >= 2500));
  assert.ok(b.filtrar(F({ urgente: true })).every((v) => v.urgente));
  assert.ok(b.filtrar(F({ pcd: true })).every((v) => v.pcd));
  assert.ok(b.filtrar(F({ pub: '24' })).every((v) => v.horas <= 24));
  const cn = b.filtrar(F({ cnh: 'D' }));
  assert.ok(cn.length > 0 && cn.every((v) => v.cnh === 'D'));
});

test('ordem: mais recentes por data e maior salário por valor (mês antes de dia)', () => {
  const b = criar();
  const rec = b.filtrar(F({}));
  for (let i = 1; i < rec.length; i++) assert.ok(rec[i - 1].horas <= rec[i].horas);
  const sal = b.filtrar(F({ ordem: 'salario' }));
  const meses = sal.filter((v) => v.salario.periodo === 'mes');
  for (let i = 1; i < meses.length; i++) assert.ok(meses[i - 1].salario.min >= meses[i].salario.min);
});

test('vagas escondidas não aparecem na lista', () => {
  const alvo = VAGAS[0].id;
  const b = criar({ escondidas: () => [alvo] });
  assert.ok(b.filtrar(F({})).every((v) => v.id !== alvo));
});

test('rótulos e remoção de filtro: tirar volta ao vazio', () => {
  const b = criar();
  const f = F({ semExp: true, setores: [SETORES[0].id], tipos: ['CLT'], sal: { p: 'mes', min: 2000 } });
  const r = b.rotulosFiltro(f);
  assert.ok(r.length >= 4);
  r.forEach((x) => b.tirarFiltro(f, x.k, x.v));
  assert.equal(b.rotulosFiltro(f).length, 0);
});

test('sugestões: "caix" traz as vagas de caixa com a contagem', () => {
  const b = criar();
  const s = b.sugestoes('caix', 'regiao', 5);
  assert.ok(s.some((x) => x.tipo === 'todas' && x.n > 0));
  assert.ok(s.some((x) => x.tipo === 'funcao' && /caix/i.test(x.txt)));
  assert.deepEqual(b.sugestoes('c', 'regiao'), []);
});

test('cnhDaVaga lê a categoria no requisito ou na pergunta, sem confundir palavras', () => {
  assert.equal(B.cnhDaVaga({ titulo: 'Motorista', requisitos: ['CNH categoria D'], perguntas: [] }), 'D');
  assert.equal(B.cnhDaVaga({ titulo: 'Entregador', requisitos: [], perguntas: ['Tem CNH A?'] }), 'A');
  assert.equal(B.cnhDaVaga({ titulo: 'Caixa', requisitos: ['Carteira de trabalho'], perguntas: [] }), '');
});

test('nenhum filtro nem rótulo fala de idade, sexo, estado civil, foto ou nacionalidade', () => {
  const F0 = B.filtroVazio();
  const campos = Object.keys(F0).join(' ');
  assert.ok(!/idade|sexo|genero|civil|foto|nacionalidade|nota|ranking/i.test(campos), campos);
});
