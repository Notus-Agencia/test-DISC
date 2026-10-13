'use strict';
// Vagas sem Caos — regras compartilhadas das telas (vagas/js/regras.js): listas fechadas, filtro de textos, CNPJ (inclusive
// o alfanumérico de 2026), WhatsApp, leitura dos formulários e as MESMAS mensagens das RPCs do banco. A conferência
// linha a linha do filtro contra o Postgres fica em tests/supabase/vagas.test.js (npm run test:supabase).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../vagas/js/regras.js');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261022120000_vagas.sql'), 'utf8');
const FONTE = fs.readFileSync(path.join(__dirname, '..', 'vagas', 'js', 'regras.js'), 'utf8');
const AGORA = Date.parse('2026-10-13T15:00:00Z');

test('listas fechadas: modalidades, vínculos e os 12 pontos fortes da psicologia (iguais aos do banco)', () => {
  assert.deepEqual(R.MODALIDADES.map((m) => m.id), ['clt', 'temporario', 'diaria', 'freelancer', 'estagio']);
  const ids = R.PONTOS_FORTES.map((p) => p.id);
  assert.deepEqual(ids, ['pontualidade', 'atendimento', 'caixa_certo', 'organizacao', 'equipe', 'aprende_rapido', 'regras_seguranca',
    'comunicacao', 'iniciativa', 'cuidado_material', 'vendas', 'situacao_dificil']);
  assert.equal(R.PONTOS_FORTES.find((p) => p.id === 'caixa_certo').rotulo, 'Caixa fecha certo');
  assert.ok(!JSON.stringify(R.PONTOS_FORTES).toLowerCase().includes('honest'), 'nada de "honestidade" (traço, não comportamento)');
  // A mesma lista, na mesma ordem, na função do banco e na restrição da tabela.
  const funcao = /function vagas_interno\.pontos_fortes\(\)[\s\S]*?select array\[([^\]]+)\]/.exec(SQL)[1];
  assert.deepEqual(funcao.match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1)), ids);
  const restricao = /pontos_fortes <@ array\[([^\]]+)\]/.exec(SQL)[1];
  assert.deepEqual(restricao.match(/'([a-z_]+)'/g).map((x) => x.slice(1, -1)), ids);
  // Para a empresa, "ocultada" não existe (veto P2).
  assert.ok(!R.STATUS_REFERENCIA_EMPRESA.some((s) => s.id === 'ocultada'));
  assert.equal(R.STATUS_CANDIDATURA.find((s) => s.id === 'agora_nao').rotulo, 'Encerrada');
});

test('textos de marca: "Gestão sem Caos", nunca "Notus"; frase anti-golpe exata', () => {
  assert.ok(!/notus/i.test(FONTE));
  assert.equal(R.MSG.NUNCA_PAGUE, 'Nunca pague para se candidatar. Se alguém pedir em nosso nome, é golpe.');
  assert.match(R.MSG.SUSPENSA, /Gestão sem Caos/);
});

test('mensagens: toda mensagem de erro das regras existe, igual, na migração do banco', () => {
  const literais = [...FONTE.matchAll(/falha\('([^']+)'\)/g)].map((m) => m[1]);
  literais.push(...Object.values(R.MSG).filter((m) => m !== R.MSG.NUNCA_PAGUE));
  assert.ok(literais.length > 40);
  for (const m of new Set(literais)) assert.ok(SQL.includes(m), 'falta no banco: ' + m);
});

test('filtro de textos: golpe, contato, link, documento e discriminação, por contexto', () => {
  assert.equal(R.conferirTexto('Atendimento no balcão e organização de prateleiras.', 'anuncio'), null);
  assert.equal(R.conferirTexto('Taxa de inscrição R$ 30', 'anuncio').tipo, 'golpe');
  assert.equal(R.conferirTexto('Faça um Pix para garantir', 'mensagem').tipo, 'golpe');
  assert.equal(R.conferirTexto('Ligue (95) 99123-4567', 'anuncio').tipo, 'contato');
  assert.equal(R.conferirTexto('Veja bit.ly/abc123', 'anuncio').tipo, 'link');
  assert.equal(R.conferirTexto('Me manda seu CPF', 'mensagem').tipo, 'documento');
  assert.equal(R.conferirTexto('Me manda seu CPF', 'anuncio'), null, 'documento só é bloqueado na conversa');
  for (const t of ['Boa aparência', 'Atendente até 30 anos', 'Solteira, sem filhos', 'Somente mulheres', 'Evangélico de preferência',
    'Não aceitamos estrangeiros', 'Nada consta criminal', 'Boa saúde']) {
    assert.equal(R.conferirTexto(t, 'anuncio').tipo, 'discriminacao', t);
  }
  assert.equal(R.conferirTexto('de 2 a 3 anos de experiência', 'anuncio'), null);
  assert.equal(R.conferirTexto('Auxiliar de depósito', 'anuncio'), null);
  assert.match(R.conferirTexto('Ótima, apesar dos filhos.', 'referencia').erro, /a referência não pode falar de/);
  assert.match(R.conferirTexto('Qual a sua idade?', 'mensagem').erro, /^Mensagem bloqueada: aqui não se pergunta/);
  assert.equal(R.conferirTexto('www.meusite.com', 'perfil').tipo, 'link');
  assert.equal(R.conferirTexto('Boa aparência', 'perfil'), null, 'perfil só bloqueia link');
});

test('CNPJ e MEI: dígitos verificadores (numérico e alfanumérico), formatação', () => {
  assert.equal(R.cnpjValido('11.222.333/0001-81'), true);
  assert.equal(R.cnpjValido('11.222.333/0001-82'), false);
  assert.equal(R.cnpjValido('00000000000000'), false);
  assert.equal(R.cnpjValido('12.ABC.345/01DE-35'), true, 'CNPJ alfanumérico (IN RFB 2.229/2024)');
  assert.equal(R.cnpjValido('12ABC34501DE36'), false);
  assert.equal(R.formatarCnpj('12abc34501de35'), '12.ABC.345/01DE-35');
  assert.equal(R.normalizarCnpj(' 11.222.333/0001-81 '), '11222333000181');
});

test('WhatsApp, e-mail, nomes', () => {
  assert.equal(R.normalizarWhatsapp('(95) 99123-4567'), '5595991234567');
  assert.equal(R.whatsappCelularValido('5595991234567'), true);
  assert.equal(R.whatsappCelularValido('559532245566'), false, 'fixo não serve para a pessoa');
  assert.equal(R.whatsappEmpresaValido('559532245566'), true);
  assert.equal(R.normalizarWhatsapp('123'), '');
  assert.equal(R.normalizarEmail(' Ana@Exemplo.COM '), 'ana@exemplo.com');
  assert.equal(R.normalizarEmail('ana@'), '');
  assert.equal(R.nomeValido('Maria'), false);
  assert.equal(R.nomeValido('Maria Souza'), true);
  assert.equal(R.nomeExibicao('Ana Souza Lima'), 'Ana L.');
  assert.equal(R.iniciais('Mercado Bom Dia'), 'MB');
});

test('anúncio: salário obrigatório, diária com data/horário/valor nos próximos 7 dias, 7 a 60 dias no ar, termos proibidos', () => {
  const base = { titulo: 'Atendente de loja', cargo: 'Atendente', modalidade: 'clt', descricao: 'Atendimento no balcão e organização de prateleiras.',
    valorMinCentavos: 162100 };
  assert.equal(R.lerAnuncio(base, '2026-10-13').ok, true);
  assert.equal(R.lerAnuncio(Object.assign({}, base, { valorMinCentavos: null }), '2026-10-13').erro, 'Informe o salário ou a faixa salarial.');
  assert.equal(R.lerAnuncio(Object.assign({}, base, { modalidade: 'estagio', valorMinCentavos: 0 }), '2026-10-13').erro, 'Informe o valor da bolsa.');
  assert.equal(R.lerAnuncio(Object.assign({}, base, { valorMaxCentavos: 100000 }), '2026-10-13').erro, 'O valor máximo da faixa não pode ser menor que o mínimo.');
  assert.equal(R.lerAnuncio(Object.assign({}, base, { diasNoAr: 90 }), '2026-10-13').erro, 'Escolha de 7 a 60 dias no ar.');
  const diaria = Object.assign({}, base, { modalidade: 'diaria', valorMinCentavos: 12000, dataTrabalho: '2026-10-14', horaInicio: '07:00', horaFim: '16:00' });
  const lida = R.lerAnuncio(diaria, '2026-10-13');
  assert.deepEqual([lida.ok, lida.campos.valor.unidade, lida.campos.diaria], [true, 'dia', { data: '2026-10-14', inicio: '07:00', fim: '16:00' }]);
  assert.equal(R.lerAnuncio(Object.assign({}, diaria, { horaFim: '' }), '2026-10-13').erro, 'Informe a data, o horário e o valor da diária.');
  assert.equal(R.lerAnuncio(Object.assign({}, diaria, { dataTrabalho: '2026-10-12' }), '2026-10-13').erro, 'A data da diária já passou. Escolha outra data.');
  assert.equal(R.lerAnuncio(Object.assign({}, diaria, { dataTrabalho: '2026-10-21' }), '2026-10-13').erro, 'A diária precisa ser para os próximos 7 dias.');
  assert.match(R.lerAnuncio(Object.assign({}, base, { requisitos: 'Boa aparência' }), '2026-10-13').erro, /aparencia|aparência/i);
});

test('pessoa: 18+, sem campos proibidos (idade, foto, gênero… não existem no resultado)', () => {
  const d = { maior18: true, cargos: ['Atendente'], escolaridade: 'medio', turnos: ['manha'], modalidades: ['clt'], nome: 'Maria Souza',
    whatsapp: '95 99123-4567', idade: 30, genero: 'x', foto: 'data:', estadoCivil: 'x', nacionalidade: 'x' };
  const r = R.lerPessoa(d, AGORA);
  assert.equal(r.ok, true);
  for (const k of ['idade', 'genero', 'foto', 'estadoCivil', 'nacionalidade']) assert.ok(!(k in r.campos), k);
  assert.equal(R.lerPessoa(Object.assign({}, d, { maior18: false }), AGORA).erro, 'Para se cadastrar é preciso ter 18 anos ou mais.');
});

test('referência: 1 a 3 pontos fortes da lista fechada, declaração obrigatória, texto filtrado', () => {
  const d = { funcao: 'Caixa', vinculo: 'clt', inicio: '2024-01', fim: '2025-06', pontosFortes: ['caixa_certo', 'pontualidade'], declaracao: true };
  assert.deepEqual(R.lerReferencia(d, AGORA).campos.pontosFortes, ['pontualidade', 'caixa_certo'], 'na ordem da lista');
  assert.equal(R.lerReferencia(Object.assign({}, d, { pontosFortes: ['honestidade'] }), AGORA).erro, 'Escolha de 1 a 3 pontos fortes.');
  assert.equal(R.lerReferencia(Object.assign({}, d, { pontosFortes: ['pontualidade', 'atendimento', 'equipe', 'vendas'] }), AGORA).erro,
    'Escolha de 1 a 3 pontos fortes.');
  assert.equal(R.lerReferencia(Object.assign({}, d, { declaracao: false }), AGORA).erro,
    'Confirme a declaração de que a pessoa trabalhou na empresa no período informado.');
  assert.equal(R.lerReferencia(Object.assign({}, d, { fim: '2099-01' }), AGORA).erro, 'A saída não pode estar no futuro.');
});

test('valores e datas: reais, faixa por unidade, meses de experiência, hoje em Boa Vista', () => {
  assert.equal(R.reais(162100), 'R$ 1.621,00');
  assert.equal(R.formatarValor({ minCentavos: 162100, maxCentavos: 190000, unidade: 'mes' }), 'R$ 1.621,00 a R$ 1.900,00 por mês');
  assert.equal(R.formatarValor({ minCentavos: 12000, maxCentavos: null, unidade: 'dia' }), 'R$ 120,00 por dia');
  assert.equal(R.meses('2024-01', '2025-06'), 18);
  assert.equal(R.hoje('America/Boa_Vista', Date.parse('2026-10-14T02:00:00Z')), '2026-10-13', 'UTC−4');
  assert.equal(R.somarDias('2026-10-13', 7), '2026-10-20');
});
