'use strict';
// Vagas sem Caos — painel da empresa (frente empresa, onda 2): regras puras (vaga como produto, termos proibidos, WhatsApp, prazos,
// referência sem revelar a decisão da pessoa, cartões sem filtro por dado da pessoa), o roteiro de entrevista igual ao .md da
// psicologia, a vaga montada pela tela aceita pela prévia e as conferências de segurança/texto das páginas e scripts da frente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const R = require('../vagas/js/regras.js');
const ER = require('../vagas/js/empresa-regras.js');
const RO = require('../vagas/js/roteiro-entrevista.js');
const TELA = require('./helpers/vagas-tela.js');
const API = require('../vagas/js/api.js');
const PREVIA = require('../vagas/js/api-previa.js');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const ARQUIVOS_JS = ['js/empresa-regras.js', 'js/roteiro-entrevista.js', 'js/empresa-base.js', 'js/empresa-vaga.js', 'js/empresa-conversa.js',
  'js/empresa-referencias.js', 'js/empresa.js', 'js/referencia.js'];
// "DISC" só na tela Contratada (conversa, depois da contratação) e no roteiro ("Não use o DISC… nesta etapa"), que só aparece ali.
const COM_DISC = ['js/roteiro-entrevista.js', 'js/empresa-conversa.js'];

function armazem() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
function formValido(extra) {
  return Object.assign(ER.formVazio(), { area: 'caixa', funcao: 'Operador(a) de caixa', modalidade: 'clt', salarioDe: '1.620,00', turno: 'comercial',
    zona: 'centro', descricao: 'Atender clientes no caixa, conferir o troco e fechar o caixa no fim do turno.' }, extra || {});
}
const ZONAS = [{ slug: 'centro', nome: 'Centro' }];

test('números e datas da tela: R$ com vírgula/ponto, dd/mm/aaaa, mm/aaaa, saudação pela hora e os 8 dias da diária', () => {
  for (const [entrada, c] of [['R$ 1.620,00', 162000], ['1620', 162000], ['1.620', 162000], ['1620,5', 162050], ['1620.50', 162050], ['120', 12000],
    ['1.234.567,89', 123456789]]) assert.equal(ER.centavosDe(entrada), c, entrada);
  for (const ruim of ['', 'abc', '1,2,3', '12,345', '-5', '1.62.0', null]) assert.equal(ER.centavosDe(ruim), null, String(ruim));
  assert.equal(ER.textoDeCentavos(162000), '1.620,00');
  assert.equal(ER.textoDeCentavos(null), '');
  assert.equal(ER.dataDeTexto('13/10/2026'), '2026-10-13');
  assert.equal(ER.dataDeTexto('1/2/2027'), '2027-02-01');
  assert.equal(ER.dataDeTexto('31/02/2026'), null);
  assert.equal(ER.textoDeData('2026-10-13'), '13/10/2026');
  assert.equal(ER.mesDeTexto('09/2025'), '2025-09');
  assert.equal(ER.mesDeTexto('9/2025'), '2025-09');
  assert.equal(ER.mesDeTexto('13/2025'), null);
  assert.equal(ER.textoDeMes('2025-09'), '09/2025');
  assert.deepEqual([4, 5, 11, 12, 17, 18, 23].map(ER.saudacao), ['Boa noite', 'Bom dia', 'Bom dia', 'Boa tarde', 'Boa tarde', 'Boa noite', 'Boa noite']);
  const dias = ER.proximosDias('2026-10-13', 8);
  assert.equal(dias.length, 8);
  assert.deepEqual(dias.slice(0, 3).map((d) => d.rotulo), ['Hoje', 'Amanhã', 'Qui 15/10']);
  assert.equal(dias[7].data, '2026-10-20');
});

test('vaga como produto: o formulário vira os dados do contrato e passa na MESMA leitura do banco (VAGAS_REGRAS.lerAnuncio)', () => {
  const v = ER.validarVaga(formValido(), { hoje: '2026-10-13', zonas: ZONAS, empresaId: 'e1' });
  assert.equal(v.ok, true, v.erro);
  assert.equal(v.dados.salarioDe, 162000);
  assert.equal(v.dados.valorUnidade, 'mes');
  assert.equal(v.dados.empresaId, 'e1');
  assert.equal(v.dados.selo, 'nenhum');
  assert.equal(R.lerAnuncio(v.dados, '2026-10-13').ok, true);
  // Comissão anda junto com o benefício "comissão".
  const c = ER.dadosDaVaga(formValido({ comissao: true }));
  assert.deepEqual(c.beneficios, ['comissao']);
  assert.equal(ER.dadosDaVaga(formValido({ comissao: false, beneficios: ['vt', 'comissao'] })).comissao, true);
  // Diária: data, horário, valor do dia e prazo; começa na data.
  const d = ER.validarVaga(formValido({ modalidade: 'diaria', data: '2026-10-14', horaInicio: '07:00', horaFim: '16:00', salarioDe: '120', prazoHoras: '72' }),
    { hoje: '2026-10-13', zonas: ZONAS });
  assert.equal(d.ok, true, d.erro);
  assert.deepEqual([d.dados.valorUnidade, d.dados.inicio, d.dados.inicioData, d.dados.prazoHoras], ['dia', 'data', '2026-10-14', 72]);
  // Estágio: horas por dia; freelancer: por serviço.
  assert.equal(ER.validarVaga(formValido({ modalidade: 'estagio', horasDia: '6' }), { hoje: '2026-10-13', zonas: ZONAS }).ok, true);
  assert.equal(ER.dadosDaVaga(formValido({ modalidade: 'freelancer' })).valorUnidade, 'servico');
  assert.equal(ER.dadosDaVaga(formValido({ modalidade: 'freelancer', unidade: 'hora' })).valorUnidade, 'hora');
  assert.equal(ER.dadosDaVaga(formValido({ modalidade: 'clt', unidade: 'servico' })).valorUnidade, 'mes', 'unidade fora da modalidade volta ao padrão');
});

test('vaga: cada erro aparece NO CAMPO certo (obrigatórios da tela, data dd/mm/aaaa e as mensagens do banco)', () => {
  const casos = [
    [{ area: '' }, 'area', 'Escolha a área da vaga.'], [{ funcao: '' }, 'funcao', 'Informe a função (ex.: Atendente).'],
    [{ modalidade: '' }, 'modalidade', null], [{ salarioDe: '' }, 'salarioDe', 'Informe o salário ou a faixa salarial.'],
    [{ salarioAte: '1.000,00' }, 'salarioAte', 'O valor máximo da faixa não pode ser menor que o mínimo.'], [{ turno: '' }, 'turno', 'Escolha o turno da vaga.'],
    [{ descricao: 'curta' }, 'descricao', 'Descreva a vaga em pelo menos 40 caracteres.'], [{ zona: '' }, 'zona', 'Escolha a zona da cidade onde é o trabalho.'],
    [{ inicio: 'data', inicioData: '2026-10-20' }, 'inicioData', 'Use dd/mm/aaaa'], [{ inicio: 'data', inicioData: '01/10/2026' }, 'inicioData', 'A data de início não pode estar no passado.'],
    [{ requisitos: ['outro'], requisitoOutro: '' }, 'requisitoOutro', 'Escreva qual é o outro requisito.'], [{ quantidade: '0' }, 'quantidade', null],
    [{ modalidade: 'diaria', salarioDe: '120' }, 'data', 'Informe a data, o horário e o valor da diária.'],
    [{ modalidade: 'diaria', data: '2026-10-14', salarioDe: '120' }, 'horaInicio', null],
    [{ modalidade: 'diaria', data: '2026-10-30', horaInicio: '07:00', horaFim: '16:00', salarioDe: '120' }, 'data', 'A diária precisa ser para os próximos 7 dias.'],
    [{ modalidade: 'estagio', horasDia: '8' }, 'horasDia', 'Informe as horas por dia do estágio (até 6).']
  ];
  for (const [mud, campo, msg] of casos) {
    const v = ER.validarVaga(formValido(mud), { hoje: '2026-10-13', zonas: ZONAS });
    assert.equal(v.ok, false, JSON.stringify(mud));
    assert.equal(v.campo, campo, JSON.stringify(mud) + ' -> ' + v.erro);
    if (msg) assert.equal(v.erro, msg);
  }
  // Mensagens que só a RPC devolve também acham o campo.
  assert.equal(ER.campoDoErro('Escolha uma zona da cidade da vaga.'), 'zona');
  assert.equal(ER.campoDoErro('Só empresa com CNPJ conferido pela Gestão sem Caos pode anunciar como confidencial.'), 'confidencial');
  assert.equal(ER.campoDoErro('A diária fica no ar de 48 a 168 horas.'), 'prazoHoras');
  assert.equal(ER.campoDoErro('Escolha um dos testes da plataforma ou "nenhum".'), 'selo');
  assert.equal(ER.campoDoErro('Unidade do valor inválida para este tipo de vaga.'), 'unidade');
});

test('termo proibido: recusa na hora, mostra o trecho como a empresa escreveu, explica a lei em uma frase e diz o que escrever', () => {
  const t = 'Atender quem entra na loja e fechar o caixa. Procuramos pessoa de boa aparência, até 30 anos.';
  const l = ER.termosProibidos(t, 'anuncio');
  assert.deepEqual(l.map((x) => [x.tipo, x.trecho]), [['discriminacao', 'aparência'], ['discriminacao', 'até 30 anos']]);
  const m = ER.mensagemTermos(l, { descricao: true });
  assert.match(m, /^Não dá para publicar assim\. "aparência" e "até 30 anos" são critérios proibidos por lei \(Lei 9\.029\/1995 e CLT art\. 373-A\)\./);
  assert.match(m, /Descreva o que a pessoa vai fazer e o que precisa saber; sexo, idade e aparência não podem ser requisito\. Os requisitos vão nos campos acima\.$/);
  const g = ER.mensagemTermos(ER.termosProibidos('Taxa de inscrição paga no Pix', 'anuncio'));
  assert.match(g, /^Tire "Taxa", "Pix" e "inscrição paga"\. Vagas não podem pedir dinheiro, Pix nem contato fora da plataforma: a conversa acontece aqui\.$/);
  const v = ER.validarVaga(formValido({ descricao: t }), { hoje: '2026-10-13', zonas: ZONAS });
  assert.equal(v.campo, 'descricao');
  assert.equal(v.termo, true);
  assert.equal(ER.validarVaga(formValido({ funcao: 'Atendente até 25 anos' }), { hoje: '2026-10-13', zonas: ZONAS }).campo, 'funcao');
  assert.equal(ER.trechoOriginal('Pessoa de BOA APARÊNCIA!', 'boa aparencia'), 'BOA APARÊNCIA');
  assert.deepEqual(ER.termosProibidos('Atender bem o cliente e organizar o estoque todos os dias.', 'anuncio'), []);
});

test('lateral "Como a vaga aparece nos filtros": só os campos fechados viram etiqueta (o texto livre não entra)', () => {
  const e = ER.etiquetasFiltro(formValido({ fimDeSemana: true, comissao: true, beneficios: ['vt', 'comissao'], escolaridade: 'medio', experiencia: 'nao_precisa' }),
    { zonas: ZONAS });
  assert.deepEqual(e, ['Caixa e operação de loja', 'CLT', 'Horário comercial', 'Fim de semana', 'R$ 1.620 + comissão', 'Centro', 'Sem experiência', 'Médio', 'Vale-transporte']);
  assert.ok(!e.some((x) => /troco|caixa no fim/.test(x)), 'a descrição não vira etiqueta');
  assert.deepEqual(ER.etiquetasFiltro(ER.formVazio()), ['Sem experiência']);
  assert.ok(ER.etiquetasFiltro(formValido({ modalidade: 'diaria', data: '2026-10-13', salarioDe: '120', unidade: 'dia' }), { hoje: '2026-10-13' }).includes('Para hoje'));
});

test('WhatsApp: os textos são os de conteudo/vagas-textos/whatsapp.json, palavra por palavra; link curto do site', () => {
  const w = JSON.parse(ler('conteudo/vagas-textos/whatsapp.json')).mensagens;
  for (const k of Object.keys(ER.WHATSAPP)) assert.equal(ER.WHATSAPP[k], w.find((x) => x.chave === k).texto, k);
  const link = ER.linkCurto('k7m2qx', 'https://vagas.gestaosemcaos.com.br/');
  assert.equal(link, 'https://vagas.gestaosemcaos.com.br/v/K7M2QX');
  assert.equal(ER.textoWhatsappVaga({ titulo: 'Operador(a) de caixa', confidencial: true, empresaNome: 'Mercado X', zona: 'Centro', valor: 'R$ 1.620', link }),
    'Vaga de Operador(a) de caixa · Empresa confidencial · Centro · R$ 1.620. Candidatura grátis pelo celular: https://vagas.gestaosemcaos.com.br/v/K7M2QX (Vagas sem Caos, uma ferramenta da Gestão sem Caos)');
  assert.match(ER.textoWhatsappVaga({ titulo: 'Caixa', empresaNome: 'Mercado X', zona: 'Centro', valor: 'R$ 1.620', link }), / · Mercado X · /);
  assert.match(ER.textoWhatsappCombinou({ pessoaNome: 'Ana Clara Ribeiro', responsavelNome: 'Marcos', empresaNome: 'Mercado X', vagaTitulo: 'Caixa' }),
    /^Oi, Ana! Aqui é Marcos, da Mercado X\. Vi a sua candidatura à vaga de Caixa no Vagas sem Caos e deu Combinou\./);
  assert.match(ER.textoWhatsappCombinou({ pessoaNome: 'Ana', empresaNome: 'Mercado X', vagaTitulo: 'Caixa' }), /^Oi, Ana! Aqui é da Mercado X\. /);
});

test('prazos: renovar aparece faltando 5 dias ou menos (nunca na diária); a encerrada pode renovar', () => {
  const agora = Date.parse('2026-10-13T15:00:00Z');
  const em = (d) => new Date(agora + d * 86400000).toISOString();
  assert.equal(ER.diasRestantes(em(3), agora), 3);
  assert.equal(ER.podeRenovar({ modalidade: 'clt', status: 'publicado', expiraEm: em(4) }, agora), true);
  assert.equal(ER.podeRenovar({ modalidade: 'clt', status: 'publicado', expiraEm: em(20) }, agora), false);
  assert.equal(ER.podeRenovar({ modalidade: 'clt', status: 'encerrado', expiraEm: em(20) }, agora), true);
  assert.equal(ER.podeRenovar({ modalidade: 'diaria', status: 'encerrado' }, agora), false);
  assert.equal(ER.podeRenovar({ modalidade: 'clt', status: 'rascunho' }, agora), false);
  assert.equal(ER.podeRenovar({ modalidade: 'clt', status: 'publicado', expirado: true, expiraEm: em(-1) }, agora), true);
});

test('P2: "referências dadas" mostram só o andamento da MODERAÇÃO; aceitar, recusar, ocultar ou remover pela pessoa não muda nada na tela', () => {
  for (const ts of ['sem_texto', 'pendente', 'publicado', 'nao_publicado']) {
    const vistos = ['pendente', 'aceita', 'recusada', 'ocultada'].map((status) => JSON.stringify(ER.andamentoReferencia({ status, textoStatus: ts, textoMotivo: '', aceitaEm: 'x' })));
    assert.equal(new Set(vistos).size, 1, ts);
  }
  assert.deepEqual(ER.andamentoReferencia({ status: 'aceita', textoStatus: 'pendente' }), { rotulo: 'Texto em revisão', classe: 'revisao', motivo: '' });
  assert.equal(ER.andamentoReferencia({ status: 'removida', textoStatus: 'publicado', textoMotivo: 'referencia_denunciada' }).rotulo, 'Removida pela moderação');
  assert.equal(ER.andamentoReferencia({ status: 'pendente', textoStatus: 'nao_publicado', textoMotivo: 'referencia_negativa' }).motivo, 'referencia_negativa');
  // O código da tela nunca lê a situação vinda do banco nem a data de aceite.
  const js = TELA.semComentarios(ler('vagas/js/empresa-referencias.js'));
  assert.ok(!/STATUS_REFERENCIA|aceitaEm|ocultad|recusad/.test(js), 'a tela de referências dadas não usa a decisão da pessoa');
});

test('motivo da moderação: texto de moderacao.json para a empresa, sem {{…}} nem "()" sobrando; motivo livre aparece como veio', () => {
  const motivos = {};
  for (const m of JSON.parse(ler('conteudo/vagas-textos/moderacao.json')).motivos) motivos[m.chave] = m;
  const m = ER.motivoModeracao('anuncio_sem_valor', { vaga_titulo: 'Caixa' }, motivos);
  assert.equal(m.titulo, 'Sem faixa salarial ou valor da diária');
  assert.match(m.texto, /^Sua vaga "Caixa" ainda não foi publicada porque falta a faixa salarial/);
  const c = ER.motivoModeracao('empresa_cnpj_nao_confere', { cnpj: '11.222.333/0001-81' }, motivos);
  assert.equal(c.texto, 'Não conseguimos conferir o CNPJ 11.222.333/0001-81. Enquanto isso, a empresa não publica.');
  for (const k of Object.keys(motivos)) {
    const x = ER.motivoModeracao(k, {}, motivos);
    assert.ok(!/\{\{|\(\s*\)/.test(x.texto + x.correcao), k);
  }
  assert.deepEqual(ER.motivoModeracao('Documento ilegível', {}, motivos), { titulo: '', texto: 'Documento ilegível', correcao: '' });
  assert.equal(ER.motivoModeracao('', {}, motivos), null);
});

test('P3: cartões só se filtram pela SITUAÇÃO da candidatura e mantêm a ordem de chegada; o código nunca pede filtro por dado da pessoa', () => {
  const lista = [{ status: 'enviada' }, { status: 'agora_nao' }, { status: 'conversar' }, { status: 'recusada' }, { status: 'combinou' }];
  assert.deepEqual(ER.filtrarCartoes(lista, 'novos').map((x) => x.ordem), [1, 3, 5]);
  assert.deepEqual(ER.filtrarCartoes(lista, 'agora_nao').map((x) => x.ordem), [2]);
  assert.deepEqual(ER.filtrarCartoes(lista, 'todos').map((x) => x.ordem), [1, 2, 3, 4, 5]);
  assert.deepEqual(ER.FILTROS_CARTOES.map((f) => f.id), ['novos', 'agora_nao', 'todos']);
  for (const rel of ARQUIVOS_JS) {
    const js = TELA.semComentarios(ler('vagas/' + rel));
    assert.ok(!/escolaridadeMin|experienciaMinMeses|pretensaoMaxCentavos|temSelo|\.sort\(/.test(js), rel + ': filtro/ordem por dado da pessoa');
    for (const m of js.matchAll(/A\.cartoes\(([^)]*)\)/g)) assert.match(m[1], /,\s*\{\s*\}$/, rel + ': cartoes() só com filtro vazio');
  }
});

test('referência e cadastro: o formulário da tela vira os dados do contrato, com o erro no campo certo', () => {
  const agora = Date.parse('2026-10-13T15:00:00Z');
  const base = { funcao: 'Atendente', vinculo: 'clt', inicio: '09/2025', fim: '01/2026', pontos: ['pontualidade'], recomenda: ['Atendente'], texto: '', declaro: true };
  const ok = ER.lerReferenciaForm(base, agora);
  assert.equal(ok.ok, true, ok.erro);
  assert.deepEqual([ok.dados.inicio, ok.dados.fim, ok.dados.declaracao], ['2025-09', '2026-01', true]);
  assert.equal(ER.lerReferenciaForm(Object.assign({}, base, { atual: true, fim: '' }), agora).dados.fim, '');
  const casos = [[{ funcao: '' }, 'funcao'], [{ vinculo: '' }, 'vinculo'], [{ inicio: '2025-09' }, 'inicio'], [{ fim: '' }, 'fim'], [{ fim: '2026' }, 'fim'],
    [{ pontos: [] }, 'pontos'], [{ pontos: ['pontualidade', 'atendimento', 'equipe', 'vendas'] }, 'pontos'], [{ declaro: false }, 'declaro'],
    [{ texto: 'Muito bonita e solteira.' }, 'texto'], [{ texto: 'x'.repeat(301) }, 'texto'], [{ recomenda: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'recomenda']];
  for (const [mud, campo] of casos) assert.equal(ER.lerReferenciaForm(Object.assign({}, base, mud), agora).campo, campo, JSON.stringify(mud));
  assert.equal(ER.lerReferenciaForm(Object.assign({}, base, { email: 'x' }), agora, { porEmail: true }).campo, 'email');
  assert.equal(ER.lerReferenciaForm(Object.assign({}, base, { email: 'Ana@Exemplo.com ' }), agora, { porEmail: true }).dados.email, 'ana@exemplo.com');
  const emp = { cnpj: '11.222.333/0001-81', razao: 'Loja Nova Exemplo Ltda', nome: 'Loja Nova', cidade: 'cidade-x', whatsapp: '(62) 99999-0000' };
  assert.equal(ER.lerEmpresaForm(emp).ok, true);
  assert.equal(ER.lerEmpresaForm(Object.assign({}, emp, { cnpj: '11.222.333/0001-00' })).campo, 'cnpj');
  assert.equal(ER.lerEmpresaForm(Object.assign({}, emp, { razao: '' })).campo, 'razao');
  assert.equal(ER.lerEmpresaForm(Object.assign({}, emp, { cidade: '' })).campo, 'cidade');
  assert.equal(ER.lerEmpresaForm(Object.assign({}, emp, { whatsapp: '123' })).campo, 'whatsapp');
});

test('a vaga montada pela tela é aceita pela prévia (mesmo contrato do banco) e volta igual para a edição', async () => {
  const agora = Date.now();
  const api = API.criar({ modo: 'previa', backend: PREVIA.criarBackend({ armazenamento: armazem(), agora: () => agora }) });
  const eu = await api.entrar('empresa@previa.com', 'previa123');
  const emp = (await api.minhasEmpresas()).empresas.find((e) => e.id === eu.empresas[0].id);
  const cidade = (await api.cidades()).cidades.find((c) => c.slug === emp.cidade.slug);
  const zonas = cidade.zonas;
  const hoje = R.hoje(cidade.fuso, agora);
  const f = formValido({ zona: zonas.length ? zonas[0].slug : '', comissao: true, beneficios: ['vt'], requisitos: ['outro'], requisitoOutro: 'Saber usar a maquininha',
    selo: 'caixa', escolaridade: 'medio', experiencia: '6_meses', fimDeSemana: true, quantidade: '2', salarioAte: '1.900,00' });
  const v = ER.validarVaga(f, { hoje, zonas, empresaId: emp.id });
  assert.equal(v.ok, true, v.erro);
  const r = await api.salvarAnuncio(v.dados);
  assert.equal(r.anuncio.status, 'rascunho');
  const volta = ER.formDeAnuncio(r.anuncio);
  for (const k of ['area', 'funcao', 'modalidade', 'quantidade', 'salarioDe', 'salarioAte', 'turno', 'fimDeSemana', 'zona', 'experiencia', 'escolaridade',
    'requisitoOutro', 'selo', 'descricao']) assert.deepEqual(volta[k], f[k], k);
  assert.deepEqual(volta.requisitos, ['outro']);
  assert.deepEqual(volta.beneficios.sort(), ['comissao', 'vt']);
  assert.equal(volta.comissao, true);
  // Edição: os mesmos dados com o id regravam a vaga.
  const v2 = ER.validarVaga(Object.assign(volta, { funcao: 'Caixa de loja' }), { hoje, zonas, id: r.anuncio.id });
  assert.equal(v2.ok, true, v2.erro);
  assert.equal((await api.salvarAnuncio(v2.dados)).anuncio.funcao, 'Caixa de loja');
});

test('equipe: os nomes que a tela chama existem na API (§8.4a) e o ciclo convidar → aceitar → listar → remover funciona na prévia', async () => {
  // A tela lê os nomes do mapa EQUIPE de empresa.js e chama conviteEquipe/aceitarConviteEquipe/conviteDoEndereco no aceite.
  const fonte = ler('vagas/js/empresa.js');
  const mapa = /var EQUIPE = \{([^}]+)\}/.exec(fonte)[1];
  const nomes = [...mapa.matchAll(/'(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(nomes, ['equipeDaEmpresa', 'convidarEquipe', 'cancelarConvite', 'removerMembro']);
  for (const m of ['equipeDaEmpresa', 'cancelarConvite', 'removerMembro', 'conviteEquipe', 'aceitarConviteEquipe']) assert.ok(API.METODOS[m], m + ' em METODOS');
  for (const m of ['conviteEquipe', 'aceitarConviteEquipe', 'conviteDoEndereco']) assert.match(fonte, new RegExp('A\\.' + m + '\\('), m + ' chamado pela tela');
  assert.equal(R.MSG.CONVITE_INVALIDO, 'Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.');
  for (const [lista, ids] of [[R.PAPEIS_EMPRESA, ['dono', 'recrutador']], [R.STATUS_CONVITE_EQUIPE, ['pendente', 'vencido', 'aceito', 'cancelado']]]) {
    assert.deepEqual(lista.map((x) => x.id), ids);
  }

  const agora = Date.now();
  const api = API.criar({ modo: 'previa', backend: PREVIA.criarBackend({ armazenamento: armazem(), agora: () => agora }) });
  assert.equal(typeof api.convidarEquipe, 'function');
  await api.entrar('empresa@previa.com', 'previa123');
  const emp = (await api.minhasEmpresas()).empresas[0];
  const c = await api.convidarEquipe(emp.id, 'empresa2@previa.com');
  assert.match(c.mensagem, /^Pronto\. Se este e-mail puder entrar na equipe/);
  const token = api.conviteDoEndereco({ search: '?' + c.linkPrevia.split('?')[1] });
  assert.match(token, /^[0-9a-f]{64}$/);
  await api.sair();
  await api.entrar('empresa2@previa.com', 'previa123');
  const cv = (await api.conviteEquipe(token)).convite;
  assert.equal(cv.empresa.nomeFantasia, emp.nomeFantasia);
  assert.equal(cv.papel, 'recrutador');
  assert.equal(cv.jaMembro, false);
  const ac = await api.aceitarConviteEquipe(token);
  assert.equal(ac.empresa.id, emp.id);
  await assert.rejects(api.aceitarConviteEquipe(token), { message: R.MSG.CONVITE_INVALIDO });
  // Recrutador(a) não lista a equipe; dono(a) lista e remove.
  await assert.rejects(api.equipeDaEmpresa(emp.id), /Só quem é dono\(a\)/);
  await api.sair();
  await api.entrar('empresa@previa.com', 'previa123');
  const eq = await api.equipeDaEmpresa(emp.id);
  const novo = eq.membros.find((m) => m.email === 'empresa2@previa.com');
  assert.equal(novo.papel, 'recrutador');
  assert.equal(eq.convites.find((x) => x.email === 'empresa2@previa.com').status, 'aceito');
  await api.removerMembro(emp.id, novo.userId);
  assert.ok(!(await api.equipeDaEmpresa(emp.id)).membros.some((m) => m.email === 'empresa2@previa.com'));
});

test('roteiro de entrevista: transcrição IGUAL a docs/painel-cientifico/vagas/entrevista-estruturada.md (8 perguntas, âncoras, o que não perguntar)', () => {
  const md = ler('docs/painel-cientifico/vagas/entrevista-estruturada.md');
  const limpo = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1').trim();
  const perguntas = [...md.matchAll(/^### (★ )?(\d)\. (.+?) \((.+?)\)\n"(.+?)"\n((?:- \*\*\d\*\* .+\n?)+)/gm)].map((m) => ({
    numero: Number(m[2]), nucleo: !!m[1], titulo: m[3], tipo: m[4], texto: m[5],
    ancoras: [...m[6].matchAll(/- \*\*(\d)\*\* (.+)/g)].map((a) => [Number(a[1]), a[2].trim()])
  }));
  assert.equal(perguntas.length, 8);
  assert.deepEqual(RO.perguntas, perguntas);
  const bloco = (re) => re.exec(md)[1].trim().split('\n');
  assert.deepEqual(RO.antes, bloco(/## Antes de começar \(2 min\)\n\n((?:- .+\n)+)/).map((x) => limpo(x.slice(2))));
  assert.deepEqual(RO.especificas, bloco(/### Perguntas específicas da função \(opcional, 1 ou 2\)\n((?:- .+\n)+)/).map((x) => limpo(x.slice(2))));
  assert.deepEqual(RO.depois, bloco(/## Depois \(5 min\)\n\n((?:\d\. .+\n)+)/).map((x) => limpo(x.slice(3))));
  assert.equal(RO.instrucao, limpo('Para cada pergunta: ' + /\nPara cada pergunta: (.+)\n/.exec(md)[1]));
  assert.equal(RO.aviso, limpo(/\n(\*\*Este roteiro não substitui.+)\n/.exec(md)[1]));
  assert.equal(RO.paraQuem, limpo(/\n\*\*Para quem:\*\* (.+)\n/.exec(md)[1]));
  assert.ok(md.includes('(' + RO.escolha + ')'));
  assert.ok(md.includes('### ' + RO.especificasTitulo));
  assert.ok(RO.antes.some((x) => /^Não pergunte \(Lei 9\.029\/1995/.test(x)), 'lista do que não perguntar');
});

test('páginas e scripts da empresa: CSP, ordem dos scripts, nada inline, sem innerHTML/confirm, sem palavra proibida nem cidade fixa', () => {
  for (const p of ['empresa.html', 'referencia.html']) assert.deepEqual(TELA.conferirPagina(p), [], p);
  for (const rel of ARQUIVOS_JS) assert.deepEqual(TELA.conferirScript(rel, { permitirDisc: COM_DISC.includes(rel) }), [], rel);
  // "DISC" na conversa: só o cartão "Integração dos 90 dias", que aparece depois de "Contratada".
  const conv = TELA.semComentarios(ler('vagas/js/empresa-conversa.js'));
  assert.deepEqual([...conv.matchAll(/[^\n]*\bDISC\b[^\n]*/g)].map((m) => /Mapa DISC de integração \(só depois da contratação; nunca na seleção\)/.test(m[0])), [true]);
  assert.match(conv, /if \(modo === 'contratada'\) \{[\s\S]*Mapa DISC/);
  // CSS da frente: só tokens (nenhuma cor escrita à mão).
  const css = ler('vagas/assets/vagas-empresa.css');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'cor fora dos tokens');
  // As páginas carregam os arquivos da frente na ordem certa (a base antes das telas, o roteador por último).
  const html = ler('vagas/empresa.html');
  const ordem = ['js/conversa.js', 'js/empresa-regras.js', 'js/roteiro-entrevista.js', 'js/empresa-base.js', 'js/empresa-vaga.js', 'js/empresa-conversa.js',
    'js/empresa-referencias.js', 'js/empresa.js'].map((s) => html.indexOf('src="' + s + '"'));
  assert.ok(ordem.every((i, k) => i > 0 && (k === 0 || i > ordem[k - 1])), 'ordem dos scripts de empresa.html');
});
