#!/usr/bin/env node
// Vagas sem Caos — valida o banco de questões dos TESTES DE HABILIDADE (uma pasta com <teste>.json + <teste>.analise.md) e
// gera, a partir dele, o SQL de carga do banco (catálogo + questões com gabarito) e o RELATORIO.md (sem gabarito).
//
// O CONTEÚDO REAL NÃO FICA NO REPOSITÓRIO (o repositório é público e o site sai dele pelo GitHub Pages): a cópia-mestre é
// privada, fora do GitHub. No repositório fica só um banco FICTÍCIO (tests/fixtures/vagas-testes/, gerado por este script),
// usado pelos testes automáticos, e a migração 20261023120001_vagas_questoes.sql é um ESPELHO só com comentário.
//
//   node scripts/montar-testes.mjs [--conteudo <pasta>]            -> valida a pasta (padrão tests/fixtures/vagas-testes) e
//                                                                     regrava o RELATORIO.md dela; NÃO grava SQL
//   node scripts/montar-testes.mjs --conteudo <pasta privada> --saida <arquivo.sql>
//                                                                  -> também grava o SQL de carga no arquivo indicado (fora do
//                                                                     repositório; nunca em supabase/migrations). Colar no SQL
//                                                                     Editor do Supabase e APAGAR o arquivo. Nunca commitar.
//   node scripts/montar-testes.mjs --checar                        -> só confere (roda no npm test): a pasta de conteúdo é
//                                                                     válida, o RELATORIO.md dela está em dia e o espelho
//                                                                     20261023120001_vagas_questoes.sql continua sem conteúdo
//   node scripts/montar-testes.mjs --revisao [--conteudo <pasta>]  -> imprime (stdout) o caderno de revisão em Markdown: cada
//                                                                     questão com a resposta certa marcada e a explicação. Só
//                                                                     para quem revisa: NUNCA publicar nem salvar no repositório
//   node scripts/montar-testes.mjs --gerar-ficticio                -> (re)cria o banco FICTÍCIO determinístico em
//                                                                     tests/fixtures/vagas-testes/ (5 JSON + 5 .analise.md)
//   import { checarTeste, lerConteudo, gerarSql, gerarFicticio, ... } from './montar-testes.mjs'
//
// Formato de um teste (contrato completo em docs/VAGAS-TESTES.md):
//   { teste, nome, descricao, versao, ativo?, prova: {questoes, minutos}, competencias: [{id, nome}],
//     tarefas: [{id, nome}] (tarefas da função, vindas da análise da função em <teste>.analise.md, na mesma pasta),
//     questoes: [{ id, competencia, tarefa, dificuldade (1–3), grupo? (itens-irmãos: mesma situação-base ou mesmo ponto;
//                  a prova sorteia no máximo 1 por grupo), texto? (aviso/mensagem a interpretar), enunciado,
//                  alternativas: [4 textos], correta (0–3), explicacao (por que a certa é certa e as outras não; só para revisão),
//                  fonte_ou_justificativa (base da resposta: "Prática: …", "Norma: …", "Conta: …" ou "Língua: …"), funcao_alvo (função
//                  a situação foi pensada), conta? (expressão que dá o valor certo) }] }
//
// O RELATORIO.md (SEM gabarito) traz contagens por competência × dificuldade, posição das corretas, a correta mais longa, a
// matriz tarefa × competência e as 10 questões mais longas — para o painel de revisão. O --checar confere que está em dia.
//
// O que o validador confere (o que dá para conferir por código; o resto é a revisão humana do docs/VAGAS-TESTES.md):
//   - os 5 testes, nada além deles; ids estáveis no formato <PREFIXO>-NNN, únicos em todos os testes;
//   - banco ≥ 75 questões e ≥ 5× o tamanho da prova; 3 a 5 competências, todas usadas; cada célula competência × dificuldade
//     com pelo menos 2× o que o sorteio pode tirar dela, contando cada grupo de itens-irmãos uma vez só (o mesmo sorteio
//     do banco: vagas_interno.teste_sortear, prova 40/40/20 por dificuldade = 6/6/3 em 15, estratificada por competência);
//   - 4 alternativas distintas e não vazias, 1 correta (índice 0–3); posições da correta distribuídas por igual (diferença
//     máxima de 2 entre a posição mais e a menos usada); a correta não pode ser a mais longa em mais de 40% das questões;
//   - enunciado curto (até 300 caracteres; texto de apoio até 400; frases de até 30 palavras), alternativas até 180 caracteres,
//     explicação obrigatória;
//   - valores em R$ no formato "R$ 1.234,56"; questão com resposta numérica precisa de "conta", e a conta tem de dar o valor
//     da alternativa correta (e nenhuma errada pode ter o mesmo valor);
//   - nada de "todas/nenhuma das anteriores" nem referência à letra da alternativa (as alternativas são embaralhadas);
//   - redação de itens de Haladyna, Downing & Rodriguez (2002): enunciado completo em forma de pergunta; sem enunciado
//     negativo ("exceto", "incorreta", "qual NÃO"); sem determinantes absolutos nas alternativas ("sempre", "nunca",
//     "jamais"), que viram pista; instrução de CONHECIMENTO ("o que fazer", "o que é correto"), nunca de tendência
//     ("o que você faria", "você costuma"), que mede jeito de ser e não conhecimento (McDaniel et al., 2007);
//   - cobertura: cada tarefa da análise da função com ≥ 3 questões; a análise (<teste>.analise.md) cita todas as tarefas
//     e a matriz dela (linha da tarefa, última coluna) bate com o número de questões do banco;
//   - toda "Norma:" da fonte_ou_justificativa cita o número da lei ou norma (e o artigo, quando houver);
//   - nada de "decoreba" de lei: número de artigo ou de lei não aparece no enunciado nem nas alternativas (fica na
//     fonte_ou_justificativa); a pergunta é sempre uma situação prática;
//   - nada de pergunta de personalidade, raciocínio abstrato/QI ou atenção (terreno do teste psicológico: Lei 4.119/1962,
//     SATEPSI); nada de gíria, marca real, religião, gênero, idade ou origem como rótulo de pessoa; nada de "Notus".
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, sep } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// Pasta de conteúdo padrão: o banco FICTÍCIO dos testes automáticos. O conteúdo real vem por --conteudo <pasta privada>.
export const PASTA_FICTICIA = join(RAIZ, 'tests', 'fixtures', 'vagas-testes');
// Espelho no repositório: só comentário (o SQL de carga nunca é gravado aqui). --checar confere que continua assim.
export const ESPELHO = join(RAIZ, 'supabase', 'migrations', '20261023120001_vagas_questoes.sql');
const PASTA_MIGRACOES = join(RAIZ, 'supabase', 'migrations');

export const TESTES = ['atendimento', 'vendas', 'administrativo', 'caixa', 'portugues'];
export const PREFIXOS = { atendimento: 'ATE', vendas: 'VEN', administrativo: 'ADM', caixa: 'CAI', portugues: 'POR' };
export const MIN_QUESTOES = 75;
export const FATOR_BANCO = 5;          // banco ≥ 5× a prova
export const FATOR_CELULA = 2;         // cada célula ≥ 2× o que o sorteio tira dela (grupos de itens-irmãos contam 1)
export const MAX_ENUNCIADO = 300;
export const MAX_TEXTO = 400;
export const MAX_ALTERNATIVA = 180;
export const MAX_EXPLICACAO = 400;
export const MAX_PALAVRAS_FRASE = 30;
export const MAX_DIFERENCA_POSICOES = 2;
export const MAX_CORRETA_MAIS_LONGA = 0.4;
export const MAX_CORRETA_MAIS_CURTA = 0.4;
export const MIN_POR_TAREFA = 3;
// Proporção da prova por dificuldade (padrões do painel científico, §2.36): 40% fácil, 40% média, 20% difícil (6/6/3 em 15).
export const PROPORCAO_DIFICULDADE = { 1: 0.4, 3: 0.2 };
// Ordem em que as dificuldades são distribuídas entre as competências (a mais escassa primeiro), igual ao SQL.
export const ORDEM_DISTRIBUICAO = [3, 1, 2];

const CHAVES_TESTE = new Set(['teste', 'nome', 'descricao', 'versao', 'ativo', 'prova', 'competencias', 'tarefas', 'questoes']);
const CHAVES_QUESTAO = new Set(['id', 'competencia', 'tarefa', 'dificuldade', 'grupo', 'funcao_alvo', 'texto', 'enunciado', 'alternativas', 'correta', 'explicacao',
  'fonte_ou_justificativa', 'conta']);

// Termos proibidos (casam no começo da palavra). Cada lista tem o motivo na mensagem.
export const PROIBIDOS = [
  ['alternativa que depende de posição ou das outras', /(todas as (anteriores|alternativas|op[çc][õo]es)|nenhuma das (anteriores|alternativas|op[çc][õo]es)|alternativas? [a-d]\b|letra [a-d]\b|(as|os) (duas|dois|tr[êe]s) (primeir|[úu]ltim))/i],
  ['pergunta de personalidade, raciocínio abstrato ou atenção (teste psicológico)', /(personalidade|temperamento|intelig[êe]ncia|racioc[íi]nio|\bQI\b|aten[çc][ãa]o concentrada|voc[êe] se considera|voc[êe] prefere|como voc[êe] se sente|qual (figura|forma) completa|sequ[êe]ncia l[óo]gica|perfil comportamental|\bDISC\b)/i],
  ['gíria', /(^|[^a-zà-ÿ])(mano|parça|véi|tipo assim|show de bola|bagulho|treta|rolê|zap|zapzap|tá ligado|da hora|migué|vacilo|top demais|sextou)(?![a-zà-ÿ])/i],
  ['marca real', /(^|[^a-zà-ÿ])(coca-cola|nike|adidas|samsung|iphone|apple|motorola|xiaomi|mercado livre|mercado pago|magazine luiza|magalu|americanas|casas bahia|nubank|ita[úu]|bradesco|santander|caixa econ[ôo]mica|banco do brasil|sicredi|sicoob|picpay|pagbank|pagseguro|cielo|getnet|mastercard|hipercard|excel|microsoft|gmail|outlook|google|instagram|facebook|tiktok|ifood|shopee|amazon|uber|natura|botic[áa]rio|havaianas|nestl[ée]|sadia|perdig[ãa]o|brahma|skol|ambev|bombril|correios|serasa)(?![a-zà-ÿ])/i],
  ['religião (situação que favorece crença)', /(^|[^a-zà-ÿ])(igreja|culto|evang[ée]lic|cat[óo]lic|pastor|padre|missa|terreiro|umbanda|candombl|esp[íi]rita|crente|deus)/i],
  ['gênero como rótulo de pessoa', /(^|[^a-zà-ÿ])(mulher|mulheres|homem|homens|moças?|rapaz|rapazes|menin[ao]s?|dona de casa|maridos?|esposas?|namorad[oa]s?|feminin[oa]s?|masculin[oa]s?)(?![a-zà-ÿ])/i],
  ['origem ou região como rótulo de pessoa', /(^|[^a-zà-ÿ])(nordestin|sulista|ga[úu]ch|baian|paraíba|carioca|paulist|mineir|nortista|cabocl|índi[oa]|goian|venezuelan|haitian|cuban|gringo|estrangeir|imigrant|migrant)/i],
  ['idade como rótulo de pessoa', /(^|[^a-zà-ÿ])(velh[oa]s?|velhinh[oa]s?|coroas?|novinh[oa]s?|terceira idade|jovenzinh[oa]s?)(?![a-zà-ÿ])/i],
  ['nome da agência de design', /notus/i]
];
// Determinantes absolutos nas alternativas viram pista (Haladyna et al., 2002): quem conhece testes descarta "sempre/nunca".
export const ABSOLUTOS = /(^|[^a-zà-ÿ])(sempre|nunca|jamais)(?![a-zà-ÿ])/i;
// Enunciado negativo ("exceto", "incorreta", "qual NÃO") confunde e mede atenção, não conhecimento.
export const NEGATIVO = /(\b[Ee]xceto\b|\b[Ii]ncorret[ao]s?\b|(^|[^A-Za-zÀ-ÿ])N[ÃA]O(?![A-Za-zÀ-ÿ])|\b[Qq]ua(l|is) (destas|destes|das|dos|delas|deles)\b[^?]*\bn[ãa]o\b|\bn[ãa]o pode faltar\b|\bn[ãa]o deve\b|\b[Pp]or que n[ãa]o\b)/;
// Só no que a pessoa lê (texto, enunciado, alternativas): número de lei ou artigo é "decoreba", não situação prática.
export const DECOREBA = /(\bart(\.|igo)\s*\d|\blei\s+(n[ºo°.]*\s*)?\d|\binciso\b|\bpar[áa]grafo (único|\d)|§)/i;
// Instrução de tendência no enunciado ("o que você faria") mede jeito de ser, não conhecimento (McDaniel et al., 2007).
export const TENDENCIA = /voc[êe] (faria|costuma|gosta|gostaria|tende|agiria|reagiria|sentiria)/i;

const palavras = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
const ehTexto = (s) => typeof s === 'string' && s.trim() !== '' && s === s.trim();

// Quantas questões de cada dificuldade a prova de n questões tem: {1: 40%, 2: o resto, 3: 20%} (15 -> 6/6/3).
export function cotasProva(n) {
  const q1 = Math.round(n * PROPORCAO_DIFICULDADE[1]);
  const q3 = Math.round(n * PROPORCAO_DIFICULDADE[3]);
  return { 1: q1, 2: n - q1 - q3, 3: q3 };
}
// Cotas por competência (na ordem sorteada) × dificuldade: igual a vagas_interno.teste_sortear. Cada competência recebe
// n/C questões (o resto vai às primeiras); as dificuldades (3, depois 1, depois 2) são distribuídas em rodízio.
export function cotasPorCelula(n, C) {
  const k = [];
  for (let i = 0; i < C; i++) k.push(Math.floor(n / C) + (i < n % C ? 1 : 0));
  const resta = k.slice();
  const cel = k.map(() => ({ 1: 0, 2: 0, 3: 0 }));
  const q = cotasProva(n);
  let p = 0;
  for (const d of ORDEM_DISTRIBUICAO) {
    let falta = q[d];
    for (let guarda = 0; falta > 0 && guarda < C * 50; guarda++, p++) {
      const i = p % C;
      if (resta[i] > 0) { cel[i][d]++; resta[i]--; falta--; }
    }
  }
  return cel;
}
// Máximo que o sorteio tira de uma célula (competência × dificuldade) com n questões e C competências.
export function maximoPorCelula(n, C) {
  const m = { 1: 0, 2: 0, 3: 0 };
  for (const c of cotasPorCelula(n, C)) for (const d of [1, 2, 3]) m[d] = Math.max(m[d], c[d]);
  return m;
}
// Unidades sorteáveis de uma lista de questões: cada questão sem grupo conta 1; cada grupo de itens-irmãos conta 1.
export function unidades(questoes) {
  const grupos = new Set();
  let soltas = 0;
  for (const q of questoes) { if (q.grupo) grupos.add(q.grupo); else soltas++; }
  return soltas + grupos.size;
}

// "R$ 1.234,56" | "12,5%" | "15" -> número (o primeiro valor do texto); null se não houver.
export function valorDe(s) {
  const t = String(s || '');
  const m = /R\$ ?(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/.exec(t) || /(-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|-?\d+(?:,\d+)?)/.exec(t);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '').replace(',', '.'));
}
// Alternativa que é só um número (com ou sem R$, %, "parcelas de", "meses"...).
export function ehNumerica(s) {
  return /^(R\$ )?\d{1,3}(\.\d{3})*(,\d+)?( ?%| reais| meses| dias| horas| minutos| parcelas| cédulas| moedas)?$/.test(String(s || '').trim())
    || /^\d+ (parcelas|vezes) de R\$ \d{1,3}(\.\d{3})*,\d{2}$/.test(String(s || '').trim());
}
// Conta da questão: só números, + - * / ( ) e espaços. Devolve o valor ou null.
export function avaliarConta(expr) {
  const e = String(expr || '');
  if (!/^[\d\s.+\-*/()]+$/.test(e) || !/\d/.test(e)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const v = Function('"use strict"; return (' + e + ');')();
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch (err) {
    return null;
  }
}

function frases(s) {
  return String(s || '').split(/(?<=[.!?:;])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
}

// Problemas de UMA questão (lista vazia = ok). comps = ids das competências do teste.
export function checarQuestao(q, prefixo, comps, tarefas) {
  const erros = [];
  const erro = (m) => erros.push(m);
  if (!q || typeof q !== 'object' || Array.isArray(q)) return ['não é um objeto'];
  for (const k of Object.keys(q)) if (!CHAVES_QUESTAO.has(k)) erro('campo desconhecido: ' + k);
  if (!new RegExp('^' + prefixo + '-\\d{3}$').test(String(q.id))) erro('id deve ser ' + prefixo + '-NNN');
  if (!comps.includes(q.competencia)) erro('competência desconhecida: ' + q.competencia);
  if (q.grupo !== undefined && !/^[a-z][a-z0-9_]{1,29}$/.test(String(q.grupo))) erro('grupo inválido (letras minúsculas, algarismos e _)');
  if (tarefas && !tarefas.includes(q.tarefa)) erro('tarefa desconhecida: ' + q.tarefa);
  if (![1, 2, 3].includes(q.dificuldade)) erro('dificuldade deve ser 1, 2 ou 3');
  if (q.texto !== undefined && (!ehTexto(q.texto) || q.texto.length > MAX_TEXTO)) erro('texto de apoio: até ' + MAX_TEXTO + ' caracteres, sem espaço nas pontas');
  if (!ehTexto(q.enunciado) || q.enunciado.length > MAX_ENUNCIADO) erro('enunciado: até ' + MAX_ENUNCIADO + ' caracteres, sem espaço nas pontas');
  for (const f of [...frases(q.texto), ...frases(q.enunciado)]) {
    if (palavras(f) > MAX_PALAVRAS_FRASE) erro('frase longa (' + palavras(f) + ' palavras): "' + f.slice(0, 50) + '…"');
  }
  if (!Array.isArray(q.alternativas) || q.alternativas.length !== 4) {
    erro('precisa de exatamente 4 alternativas');
  } else {
    q.alternativas.forEach((a, i) => {
      if (!ehTexto(a) || a.length > MAX_ALTERNATIVA) erro('alternativa ' + i + ': até ' + MAX_ALTERNATIVA + ' caracteres, sem espaço nas pontas');
    });
    const vistas = new Set(q.alternativas.map((a) => String(a || '').toLowerCase().replace(/\s+/g, ' ').trim()));
    if (vistas.size !== 4) erro('alternativas repetidas');
    q.alternativas.forEach((a, i) => {
      const m = ABSOLUTOS.exec(String(a || ''));
      if (m) erro('alternativa ' + i + ' com determinante absoluto ("' + m[2] + '"), que vira pista');
    });
  }
  if (!Number.isInteger(q.correta) || q.correta < 0 || q.correta > 3) erro('correta deve ser o índice 0–3 da alternativa certa');
  if (!ehTexto(q.explicacao) || q.explicacao.length > MAX_EXPLICACAO || palavras(q.explicacao) < 5) erro('explicação: de 5 palavras a ' + MAX_EXPLICACAO + ' caracteres');
  if (!ehTexto(q.fonte_ou_justificativa) || q.fonte_ou_justificativa.length > 300 || !/^(Prática|Norma|Conta|Língua): ./.test(q.fonte_ou_justificativa)) {
    erro('fonte_ou_justificativa: começa com "Prática: ", "Norma: ", "Conta: " ou "Língua: " e tem até 300 caracteres');
  }
  if (!ehTexto(q.funcao_alvo) || q.funcao_alvo.length > 80) erro('funcao_alvo: até 80 caracteres');
  if (typeof q.fonte_ou_justificativa === 'string') {
    for (const trecho of q.fonte_ou_justificativa.split(/(?=(?:Prática|Norma|Conta|Língua): )/)) {
      if (trecho.startsWith('Norma: ') && !/\d/.test(trecho)) erro('"Norma:" sem número de lei ou norma: "' + trecho.slice(0, 60) + '"');
    }
  }
  for (const t of [q.texto, q.enunciado].filter((x) => typeof x === 'string')) {
    const m = TENDENCIA.exec(t);
    if (m) erro('instrução de tendência ("' + m[0] + '"): pergunte o que é correto fazer, não o que a pessoa faria');
  }
  if (typeof q.enunciado === 'string') {
    const m = NEGATIVO.exec(q.enunciado);
    if (m) erro('enunciado negativo ("' + m[0] + '"): escreva a pergunta na forma positiva');
    if (!/\?$/.test(q.enunciado)) erro('enunciado deve ser uma pergunta completa (terminar com "?")');
  }
  for (const t of [q.texto, q.enunciado, ...(Array.isArray(q.alternativas) ? q.alternativas : [])].filter((x) => typeof x === 'string')) {
    const m = DECOREBA.exec(t);
    if (m) erro('número de lei/artigo no que a pessoa lê ("' + m[0] + '"): leve para fonte_ou_justificativa');
  }

  const textos = [q.texto, q.enunciado, ...(Array.isArray(q.alternativas) ? q.alternativas : []), q.explicacao, q.funcao_alvo]
    .filter((t) => typeof t === 'string');
  for (const t of textos) {
    for (const [motivo, re] of PROIBIDOS) {
      const m = re.exec(t);
      if (m) erro(motivo + ': "' + m[0].trim() + '" em "' + t.slice(0, 60) + '"');
    }
    for (const m of t.matchAll(/R\$\s*\d[\d.]*(,\d*)?/g)) {
      if (!/^R\$ \d{1,3}(\.\d{3})*,\d{2}$/.test(m[0])) erro('valor fora do formato "R$ 1.234,56": "' + m[0] + '"');
    }
    if (/\s{2,}/.test(t)) erro('espaço duplo em "' + t.slice(0, 60) + '"');
  }

  // Resposta numérica: a conta é obrigatória e fecha com a alternativa correta.
  if (Array.isArray(q.alternativas) && q.alternativas.length === 4 && Number.isInteger(q.correta) && q.correta >= 0 && q.correta <= 3) {
    const certa = q.alternativas[q.correta];
    if (ehNumerica(certa) && q.conta === undefined) erro('resposta numérica sem "conta" (expressão que dá o valor certo)');
    if (q.conta !== undefined) {
      const v = avaliarConta(q.conta);
      const alvo = valorDe(certa);
      if (v === null) erro('conta inválida: ' + q.conta);
      else if (alvo === null || Math.abs(v - alvo) > 0.005) erro('a conta (' + q.conta + ' = ' + v + ') não dá o valor da alternativa correta (' + certa + ')');
      const valores = q.alternativas.map(valorDe);
      if (alvo !== null && valores.filter((x, i) => i !== q.correta && x !== null && Math.abs(x - alvo) < 0.005).length) erro('alternativa errada com o mesmo valor da correta');
    }
  }
  return erros;
}

// Problemas de UM teste (lista vazia = ok).
export function checarTeste(d) {
  const erros = [];
  const erro = (m) => erros.push(m);
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['não é um objeto'];
  for (const k of Object.keys(d)) if (!CHAVES_TESTE.has(k)) erro('campo desconhecido: ' + k);
  if (!TESTES.includes(d.teste)) { erro('teste desconhecido: ' + d.teste + ' (use ' + TESTES.join(', ') + ')'); return erros; }
  const prefixo = PREFIXOS[d.teste];
  if (!ehTexto(d.nome) || d.nome.length > 80) erro('nome: até 80 caracteres');
  if (!ehTexto(d.descricao) || d.descricao.length > 400) erro('descricao: até 400 caracteres');
  if (!/^[0-9]{4}-[0-9]{2}-v[0-9]{1,3}$/.test(String(d.versao))) erro('versao no formato AAAA-MM-vN');
  if (d.ativo !== undefined && typeof d.ativo !== 'boolean') erro('ativo: true ou false');
  const p = d.prova || {};
  if (!Number.isInteger(p.questoes) || p.questoes < 5 || p.questoes > 40) erro('prova.questoes: 5 a 40');
  if (!Number.isInteger(p.minutos) || p.minutos < 5 || p.minutos > 120) erro('prova.minutos: 5 a 120');
  if (!Array.isArray(d.competencias) || d.competencias.length < 3 || d.competencias.length > 5) { erro('competencias: 3 a 5'); return erros; }
  const comps = d.competencias.map((c) => c && c.id);
  d.competencias.forEach((c, i) => {
    if (!c || !/^[a-z][a-z0-9_]{1,29}$/.test(String(c.id))) erro('competencias[' + i + '].id inválido');
    if (!c || !ehTexto(c.nome) || c.nome.length > 60) erro('competencias[' + i + '].nome: até 60 caracteres');
  });
  if (new Set(comps).size !== comps.length) erro('competências repetidas');
  if (!Array.isArray(d.tarefas) || d.tarefas.length < 3 || d.tarefas.length > 15) { erro('tarefas: 3 a 15 (da análise da função)'); return erros; }
  const tarefas = d.tarefas.map((t) => t && t.id);
  d.tarefas.forEach((t, i) => {
    if (!t || !/^[a-z][a-z0-9_]{1,29}$/.test(String(t.id))) erro('tarefas[' + i + '].id inválido');
    if (!t || !ehTexto(t.nome) || t.nome.length > 120) erro('tarefas[' + i + '].nome: até 120 caracteres');
  });
  if (new Set(tarefas).size !== tarefas.length) erro('tarefas repetidas');
  for (const textoLivre of [d.nome, d.descricao, ...d.competencias.map((c) => c && c.nome), ...d.tarefas.map((t) => t && t.nome)]) {
    for (const [motivo, re] of PROIBIDOS) { const m = re.exec(String(textoLivre || '')); if (m) erro(motivo + ': "' + m[0].trim() + '"'); }
  }
  if (!Array.isArray(d.questoes)) { erro('questoes: lista'); return erros; }

  const ids = new Set();
  const enunciados = new Map();
  d.questoes.forEach((q, i) => {
    const rot = (q && q.id) || '#' + i;
    checarQuestao(q, prefixo, comps, tarefas).forEach((m) => erro(rot + ': ' + m));
    if (q && ids.has(q.id)) erro(rot + ': id repetido');
    if (q) ids.add(q.id);
    const chave = normal((q && q.texto) || '') + '|' + normal(q && q.enunciado) + '|' + (Array.isArray(q && q.alternativas) ? q.alternativas.map(normal).sort().join('|') : '');
    if (enunciados.has(chave)) erro(rot + ': questão repetida (igual a ' + enunciados.get(chave) + ')');
    enunciados.set(chave, rot);
  });
  if (erros.length) return erros;

  const n = d.questoes.length;
  const prova = p.questoes;
  if (n < MIN_QUESTOES) erro('banco com ' + n + ' questões (mínimo ' + MIN_QUESTOES + ')');
  if (n < FATOR_BANCO * prova) erro('banco com ' + n + ' questões para uma prova de ' + prova + ' (mínimo ' + FATOR_BANCO + '×)');
  const maxCel = maximoPorCelula(prova, comps.length);
  for (const c of comps) {
    const daComp = d.questoes.filter((q) => q.competencia === c);
    if (!daComp.length) { erro('competência sem questões: ' + c); continue; }
    for (const dif of [1, 2, 3]) {
      const tem = unidades(daComp.filter((q) => q.dificuldade === dif));
      const precisa = FATOR_CELULA * maxCel[dif];
      if (tem < precisa) erro('célula ' + c + ' × dificuldade ' + dif + ': ' + tem + ' unidades sorteáveis (mínimo ' + precisa + '; grupo de itens-irmãos conta 1)');
    }
  }
  const porGrupo = {};
  d.questoes.forEach((q) => { if (q.grupo) porGrupo[q.grupo] = (porGrupo[q.grupo] || 0) + 1; });
  for (const [g, nq] of Object.entries(porGrupo)) if (nq < 2) erro('grupo ' + g + ' com 1 questão só (grupo é para itens-irmãos)');
  for (const t of tarefas) {
    const tem = d.questoes.filter((q) => q.tarefa === t).length;
    if (tem < MIN_POR_TAREFA) erro('tarefa ' + t + ' com ' + tem + ' questões (mínimo ' + MIN_POR_TAREFA + ')');
  }
  const pos = [0, 0, 0, 0];
  d.questoes.forEach((q) => { pos[q.correta]++; });
  if (Math.max(...pos) - Math.min(...pos) > MAX_DIFERENCA_POSICOES) erro('posições da correta desequilibradas: ' + pos.join('/') + ' (diferença máxima ' + MAX_DIFERENCA_POSICOES + ')');
  // Tamanho da correta entre as 4 (Haladyna et al., 2002: alternativas de tamanho parecido; a correta não pode se destacar).
  const t = tamanhoDaCorreta(d);
  if (t.longa / n > MAX_CORRETA_MAIS_LONGA) erro('a correta é a alternativa mais longa em ' + t.longa + ' de ' + n + ' questões (máximo ' + Math.round(MAX_CORRETA_MAIS_LONGA * 100) + '%)');
  if (t.curta / n > MAX_CORRETA_MAIS_CURTA) erro('a correta é a alternativa mais curta em ' + t.curta + ' de ' + n + ' questões (máximo ' + Math.round(MAX_CORRETA_MAIS_CURTA * 100) + '%)');
  return erros;
}

// Tamanho da correta frente às 3 erradas: {curta: estritamente mais curta que todas, longa: estritamente mais longa que
// todas, meio: o resto (no meio ou empatada — empate não é pista)}.
export function tamanhoDaCorreta(d) {
  const t = { curta: 0, meio: 0, longa: 0 };
  for (const q of d.questoes) {
    const l = q.alternativas.map((a) => a.length);
    const outras = l.filter((_, i) => i !== q.correta);
    if (outras.every((x) => x < l[q.correta])) t.longa++;
    else if (outras.every((x) => x > l[q.correta])) t.curta++;
    else t.meio++;
  }
  return t;
}

// Resumo de um teste válido (para o terminal e o relatório).
export function resumir(d) {
  const porComp = {};
  for (const c of d.competencias) porComp[c.id] = { 1: 0, 2: 0, 3: 0, total: 0 };
  for (const q of d.questoes) { porComp[q.competencia][q.dificuldade]++; porComp[q.competencia].total++; }
  const pos = [0, 0, 0, 0];
  d.questoes.forEach((q) => { pos[q.correta]++; });
  const tam = tamanhoDaCorreta(d);
  return { teste: d.teste, questoes: d.questoes.length, porCompetencia: porComp, posicoes: pos, tamanho: tam, corretaMaisLonga: tam.longa };
}

export function lerConteudo(pasta = PASTA_FICTICIA) {
  const erros = [];
  const dados = {};
  const arquivos = existsSync(pasta) ? readdirSync(pasta).filter((a) => a.endsWith('.json')).sort() : [];
  const idsGlobais = new Map();
  for (const arq of arquivos) {
    let d;
    try { d = JSON.parse(readFileSync(join(pasta, arq), 'utf8')); } catch (e) { erros.push(arq + ': JSON inválido: ' + e.message); continue; }
    const problemas = checarTeste(d);
    problemas.forEach((m) => erros.push(arq + ': ' + m));
    if (problemas.length) continue;
    if (arq !== d.teste + '.json') { erros.push(arq + ': o nome do arquivo deve ser ' + d.teste + '.json'); continue; }
    const analise = join(pasta, d.teste + '.analise.md');
    if (!existsSync(analise)) { erros.push(d.teste + '.analise.md: análise da função ausente'); continue; }
    const txtAnalise = readFileSync(analise, 'utf8');
    const semTarefa = d.tarefas.filter((t) => !txtAnalise.includes('`' + t.id + '`'));
    if (semTarefa.length) { erros.push(d.teste + '.analise.md: não cita as tarefas ' + semTarefa.map((t) => '`' + t.id + '`').join(', ')); continue; }
    // A matriz da análise (linha da tarefa, última coluna = nº de questões) precisa bater com o banco.
    const linhas = txtAnalise.split('\n');
    const desatualizadas = d.tarefas.filter((t) => {
      const linha = linhas.find((l) => l.startsWith('|') && l.includes('(`' + t.id + '`)'));
      const total = linha ? Number((linha.trim().replace(/\|$/, '').split('|').pop() || '').trim()) : NaN;
      return total !== d.questoes.filter((q) => q.tarefa === t.id).length;
    });
    if (desatualizadas.length) {
      erros.push(d.teste + '.analise.md: matriz tarefa × competência desatualizada (linha com o total de questões) em ' +
        desatualizadas.map((t) => '`' + t.id + '`').join(', '));
      continue;
    }
    for (const q of d.questoes) {
      if (idsGlobais.has(q.id)) erros.push(arq + ': id ' + q.id + ' repetido em ' + idsGlobais.get(q.id));
      idsGlobais.set(q.id, arq);
    }
    dados[d.teste] = d;
  }
  for (const t of TESTES) if (!dados[t] && !erros.some((e) => e.startsWith(t + '.json'))) erros.push(t + '.json: arquivo ausente');
  const ordenado = {};
  for (const t of TESTES) if (dados[t]) ordenado[t] = dados[t];
  return { dados: ordenado, erros };
}

// ---------------------------------------------------------------------------------------------------------------------
// SQL gerado
// ---------------------------------------------------------------------------------------------------------------------
const TABELA_QUESTOES = 'public.vagas_questoes';
const sq = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const sj = (v) => sq(JSON.stringify(v)) + '::jsonb';

export function gerarSql(dados) {
  const testes = TESTES.filter((t) => dados[t]).map((t) => dados[t]);
  const total = testes.reduce((s, d) => s + d.questoes.length, 0);
  const L = [];
  L.push('-- =============================================================================');
  L.push('-- ARQUIVO GERADO por scripts/montar-testes.mjs a partir da cópia PRIVADA do conteúdo (<teste>.json). TEM O GABARITO:');
  L.push('-- NUNCA commitar, publicar nem deixar no repositório. Colar no SQL Editor do Supabase e apagar o arquivo.');
  L.push('-- Vagas sem Caos — banco de questões dos testes de habilidade (' + testes.length + ' testes, ' + total + ' questões).');
  L.push('-- Requer 20261023120000_vagas_testes.sql (tabelas, funções e regras).');
  L.push('-- Idempotente: grava/atualiza o catálogo e as questões pelo id estável; questão que saiu do conteúdo fica INATIVA (nunca é');
  L.push('-- apagada: tentativas antigas apontam para ela). A coluna do gabarito só é lida pelas funções do banco; a');
  L.push('-- explicação de cada questão fica só no conteúdo (revisão humana) e não vem para o banco.');
  L.push('-- =============================================================================');
  L.push('');
  L.push('insert into public.vagas_testes as t (slug, nome, descricao, competencias, questoes_prova, minutos, versao, ordem, ativo)');
  L.push('values');
  L.push(testes.map((d, i) => '  (' + [sq(d.teste), sq(d.nome), sq(d.descricao), sj(d.competencias.map((c) => ({ id: c.id, nome: c.nome }))),
    d.prova.questoes, d.prova.minutos, sq(d.versao), i + 1, d.ativo === false ? 'false' : 'true'].join(', ') + ')').join(',\n'));
  L.push('on conflict (slug) do update set nome = excluded.nome, descricao = excluded.descricao, competencias = excluded.competencias,');
  L.push('  questoes_prova = excluded.questoes_prova, minutos = excluded.minutos, versao = excluded.versao, ordem = excluded.ordem,');
  L.push('  ativo = excluded.ativo, atualizado_em = now()');
  L.push('where (t.nome, t.descricao, t.competencias, t.questoes_prova, t.minutos, t.versao, t.ordem, t.ativo)');
  L.push('  is distinct from (excluded.nome, excluded.descricao, excluded.competencias, excluded.questoes_prova, excluded.minutos,');
  L.push('    excluded.versao, excluded.ordem, excluded.ativo);');
  for (const d of testes) {
    L.push('');
    L.push('-- ' + d.teste + ': ' + d.nome + ' (' + d.questoes.length + ' questões, versão ' + d.versao + ')');
    L.push('insert into ' + TABELA_QUESTOES + ' as q (id, teste, competencia, dificuldade, grupo, texto, enunciado, alternativas, correta)');
    L.push('values');
    L.push(d.questoes.map((q) => '  (' + [sq(q.id), sq(d.teste), sq(q.competencia), q.dificuldade, sq(q.grupo || ''), sq(q.texto || ''),
      sq(q.enunciado), sj(q.alternativas), q.correta].join(', ') + ')').join(',\n'));
    L.push('on conflict (id) do update set teste = excluded.teste, competencia = excluded.competencia, dificuldade = excluded.dificuldade,');
    L.push('  grupo = excluded.grupo, texto = excluded.texto, enunciado = excluded.enunciado, alternativas = excluded.alternativas,');
    L.push('  correta = excluded.correta, ativa = true, atualizada_em = now()');
    L.push('where (q.teste, q.competencia, q.dificuldade, q.grupo, q.texto, q.enunciado, q.alternativas, q.correta, q.ativa)');
    L.push('  is distinct from (excluded.teste, excluded.competencia, excluded.dificuldade, excluded.grupo, excluded.texto,');
    L.push('    excluded.enunciado, excluded.alternativas, excluded.correta, true);');
    L.push('update ' + TABELA_QUESTOES + ' set ativa = false, atualizada_em = now()');
    L.push('where teste = ' + sq(d.teste) + ' and ativa and id <> all (array[');
    for (let i = 0; i < d.questoes.length; i += 10) {
      L.push('  ' + d.questoes.slice(i, i + 10).map((q) => sq(q.id)).join(', ') + (i + 10 < d.questoes.length ? ',' : ''));
    }
    L.push(']);');
  }
  L.push('');
  L.push('-- O PostgREST relê o esquema.');
  L.push("notify pgrst, 'reload schema';");
  L.push('');
  return L.join('\n');
}

// Caderno de revisão (Markdown) — inclui o gabarito: só para quem revisa, nunca publicar.
export function gerarRevisao(dados) {
  const L = ['# Caderno de revisão — testes de habilidade (Vagas sem Caos)', '',
    '> CONFIDENCIAL: tem o gabarito. Não publicar, não mandar para candidato(a). Gerado por `node scripts/montar-testes.mjs --revisao`.', ''];
  for (const t of TESTES) {
    const d = dados[t];
    if (!d) continue;
    const r = resumir(d);
    L.push('## ' + d.nome + ' (`' + d.teste + '`, versão ' + d.versao + ')', '', d.descricao, '',
      'Prova: ' + d.prova.questoes + ' questões sorteadas, ' + d.prova.minutos + ' minutos. Banco: ' + r.questoes + ' questões.', '');
    L.push('| Competência | Fácil | Média | Difícil | Total |', '|---|---|---|---|---|');
    for (const c of d.competencias) {
      const x = r.porCompetencia[c.id];
      L.push('| ' + c.nome + ' (`' + c.id + '`) | ' + x[1] + ' | ' + x[2] + ' | ' + x[3] + ' | ' + x.total + ' |');
    }
    L.push('');
    for (const c of d.competencias) {
      L.push('### ' + c.nome, '');
      for (const q of d.questoes.filter((x) => x.competencia === c.id)) {
        L.push('**' + q.id + '** · dificuldade ' + q.dificuldade + ' · tarefa: ' + q.tarefa + (q.grupo ? ' · grupo: ' + q.grupo : '') +
          ' · função: ' + q.funcao_alvo, '');
        if (q.texto) L.push('> ' + q.texto.replace(/\n/g, '\n> '), '');
        L.push(q.enunciado, '');
        q.alternativas.forEach((a, i) => L.push('- ' + (i === q.correta ? '**[certa]** ' : '') + a));
        L.push('', '_Por quê:_ ' + q.explicacao + (q.conta ? ' (conta: `' + q.conta + '`)' : ''), '',
          '_Base:_ ' + q.fonte_ou_justificativa, '');
      }
    }
  }
  return L.join('\n');
}

// Relatório para o painel de revisão (Markdown, SEM gabarito): contagens, posição das corretas e as questões mais longas.
export function gerarRelatorio(dados) {
  const testes = TESTES.filter((t) => dados[t]).map((t) => dados[t]);
  const total = testes.reduce((s, d) => s + d.questoes.length, 0);
  const L = ['# Testes de habilidade — relatório do banco de questões', '',
    '> ARQUIVO GERADO por `node scripts/montar-testes.mjs` a partir dos `<teste>.json` desta pasta (não edite).',
    '> Não tem gabarito. O caderno com as respostas e as explicações sai só no terminal: `node scripts/montar-testes.mjs --revisao`.', '',
    '| Teste | Questões | Prova | Minutos | Competências | Versão |', '|---|---|---|---|---|---|'];
  for (const d of testes) {
    L.push('| ' + d.nome + ' (`' + d.teste + '`) | ' + d.questoes.length + ' | ' + d.prova.questoes + ' | ' + d.prova.minutos + ' | ' +
      d.competencias.length + ' | ' + d.versao + ' |');
  }
  L.push('| **Total** | **' + total + '** | | | | |', '');
  L.push('Sorteio da prova (igual ao banco): 40% fácil, 40% média, 20% difícil (6/6/3 em 15), estratificado por competência; ' +
    'no máximo 1 questão por grupo de itens-irmãos; as que a pessoa já viu ficam por último.', '');
  L.push('Regras conferidas por código: banco ≥ ' + MIN_QUESTOES + ' e ≥ ' + FATOR_BANCO + '× a prova; cada célula competência × dificuldade com ≥ ' +
    FATOR_CELULA + '× o que o sorteio tira dela (grupo de itens-irmãos conta 1); 4 alternativas distintas e 1 correta; posição da correta equilibrada (diferença ≤ ' +
    MAX_DIFERENCA_POSICOES + '); correta mais longa e mais curta, cada uma, em ≤ ' + Math.round(MAX_CORRETA_MAIS_LONGA * 100) + '% das questões; enunciado ≤ ' +
    MAX_ENUNCIADO + ' caracteres, frases ≤ ' + MAX_PALAVRAS_FRASE + ' palavras; contas que fecham; sem número de lei/artigo no que a pessoa lê; ' +
    'sem termos proibidos (personalidade, raciocínio, gíria, marca, religião, gênero, idade, origem).', '');
  for (const d of testes) {
    const r = resumir(d);
    L.push('## ' + d.nome + ' (`' + d.teste + '`)', '', d.descricao, '');
    L.push('| Competência | Fácil (1) | Média (2) | Difícil (3) | Total |', '|---|---|---|---|---|');
    for (const c of d.competencias) {
      const x = r.porCompetencia[c.id];
      L.push('| ' + c.nome + ' (`' + c.id + '`) | ' + x[1] + ' | ' + x[2] + ' | ' + x[3] + ' | ' + x.total + ' |');
    }
    const soma = (dif) => d.competencias.reduce((s, c) => s + r.porCompetencia[c.id][dif], 0);
    L.push('| **Total** | ' + soma(1) + ' | ' + soma(2) + ' | ' + soma(3) + ' | ' + r.questoes + ' |', '');
    const cotas = cotasProva(d.prova.questoes);
    const maxCel = maximoPorCelula(d.prova.questoes, d.competencias.length);
    L.push('- Prova: ' + cotas[1] + ' fáceis, ' + cotas[2] + ' médias e ' + cotas[3] + ' difíceis; no máximo ' + maxCel[1] + '/' + maxCel[2] + '/' +
      maxCel[3] + ' de uma mesma competência por dificuldade.');
    const grupos = {};
    d.questoes.forEach((q) => { if (q.grupo) (grupos[q.grupo] = grupos[q.grupo] || []).push(q.id); });
    const lg = Object.keys(grupos).sort();
    L.push('- Grupos de itens-irmãos (no máximo 1 por prova): ' + (lg.length ? lg.map((g) => '`' + g + '` (' + grupos[g].join(', ') + ')').join('; ') : 'nenhum') + '.');
    L.push('- Posição da correta no arquivo (1ª/2ª/3ª/4ª; na prova as alternativas são embaralhadas): ' + r.posicoes.join(' / ') + '.');
    L.push('- Tamanho da correta frente às 3 erradas: mais curta em ' + r.tamanho.curta + ', no meio ou empatada em ' + r.tamanho.meio +
      ', mais longa em ' + r.tamanho.longa + ' (' + Math.round(100 * r.tamanho.longa / r.questoes) + '%; o limite é ' +
      Math.round(MAX_CORRETA_MAIS_LONGA * 100) + '%).');
    L.push('', 'Matriz tarefa × competência (nº de questões; análise da função em `' + d.teste + '.analise.md`):', '',
      '| Tarefa | ' + d.competencias.map((c) => c.nome).join(' | ') + ' | Total |',
      '|---|' + d.competencias.map(() => '---|').join('') + '---|');
    for (const t of d.tarefas) {
      const linha = d.competencias.map((c) => d.questoes.filter((q) => q.tarefa === t.id && q.competencia === c.id).length);
      L.push('| ' + t.nome + ' (`' + t.id + '`) | ' + linha.map((x) => (x ? String(x) : '·')).join(' | ') + ' | ' + linha.reduce((a, b) => a + b, 0) + ' |');
    }
    L.push('');
    const funcoes = {};
    d.questoes.forEach((q) => { funcoes[q.funcao_alvo] = (funcoes[q.funcao_alvo] || 0) + 1; });
    L.push('- Função-alvo: ' + Object.entries(funcoes).sort((a, b) => b[1] - a[1]).map(([f, n]) => f + ' (' + n + ')').join('; ') + '.');
    const tam = (q) => (q.texto ? q.texto.length + 1 : 0) + q.enunciado.length + q.alternativas.reduce((s, a) => s + a.length, 0);
    const longas = d.questoes.slice().sort((a, b) => tam(b) - tam(a) || (a.id < b.id ? -1 : 1)).slice(0, 10);
    L.push('', '10 questões mais longas (caracteres de texto + enunciado + alternativas; leitura no celular):', '',
      '| Questão | Caracteres | Enunciado |', '|---|---|---|');
    for (const q of longas) L.push('| ' + q.id + ' | ' + tam(q) + ' | ' + q.enunciado.replace(/\|/g, '\\|') + ' |');
    L.push('');
  }
  return L.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------------
// Banco FICTÍCIO (tests/fixtures/vagas-testes): determinístico, 80 itens triviais por teste, rotulados "FICTÍCIO", que
// cumprem as mesmas regras do validador (células, posições, tamanho da correta, grupos, tarefas, contas). Serve só para os
// testes automáticos do motor; nenhum item tem significado.
// ---------------------------------------------------------------------------------------------------------------------
const NOMES_FICTICIOS = {
  atendimento: 'Atendimento (FICTÍCIO)', vendas: 'Vendas (FICTÍCIO)', administrativo: 'Administrativo (FICTÍCIO)',
  caixa: 'Caixa (FICTÍCIO)', portugues: 'Português (FICTÍCIO)'
};
const LETRAS = ['a', 'b', 'c', 'd', 'e'];
const ALTERNATIVAS_FICTICIAS = [
  'Resposta fictícia 1 (curta).',
  'Resposta fictícia 2 (um pouco maior).',
  'Resposta fictícia 3 (maior ainda, para variar o tamanho).',
  'Resposta fictícia 4 (a maior das quatro, para equilibrar o tamanho da certa).'
];
const reais = (v) => 'R$ ' + v.toFixed(2).replace('.', ',');

export function gerarFicticio() {
  const dados = {};
  const analises = {};
  for (const teste of TESTES) {
    const nc = teste === 'portugues' ? 4 : 5;
    const competencias = LETRAS.slice(0, nc).map((l) => ({ id: 'fic_' + l, nome: 'Competência fictícia ' + l.toUpperCase() }));
    const tarefas = LETRAS.slice(0, 4).map((l) => ({ id: 'tarefa_' + l, nome: 'Tarefa fictícia ' + l.toUpperCase() }));
    const porComp = 80 / nc;                       // 16 (5 competências) ou 20 (4)
    const faceis = Math.round(porComp * 0.375);    // 6 ou 8 fáceis, o mesmo de médias, o resto (4) difíceis
    const questoes = [];
    for (let n = 0; n < 80; n++) {
      const ic = n % nc;
      const k = Math.floor(n / nc);                 // posição dentro da competência
      const id = PREFIXOS[teste] + '-' + String(n + 1).padStart(3, '0');
      const q = {
        id, competencia: competencias[ic].id, tarefa: tarefas[n % 4].id,
        dificuldade: k < faceis ? 1 : k < 2 * faceis ? 2 : 3,
        funcao_alvo: 'função fictícia (testes automáticos)'
      };
      // Dois pares de itens-irmãos por teste (fáceis, na mesma competência): o sorteio tira no máximo 1 de cada.
      if (ic === 0 && k < 2) q.grupo = 'fic_par_a';
      if (ic === 1 && k >= 2 && k < 4) q.grupo = 'fic_par_b';
      if (k === 5) q.texto = 'FICTÍCIO: texto de apoio do item ' + id + ', só para exercitar o campo.';
      const pos = n % 4;                            // posição da correta: 20/20/20/20
      if (teste === 'caixa' && ic === 0) {
        // Item de conta (o validador exige "conta" quando a resposta é um número): troco de uma nota de R$ 50,00.
        const compra = 10 + k * 2.5;
        const troco = 50 - compra;
        const outras = [troco + 1, troco - 1, troco + 2];
        q.enunciado = 'FICTÍCIO ' + id + ': a compra deu ' + reais(compra) + ' e a pessoa pagou com ' + reais(50) + '. Qual é o troco?';
        q.alternativas = [];
        for (let i = 0; i < 4; i++) q.alternativas.push(reais(i === pos ? troco : outras.shift()));
        q.correta = pos;
        q.conta = '50 - ' + compra;
        q.explicacao = 'FICTÍCIO: ' + reais(50) + ' menos ' + reais(compra) + ' dá ' + reais(troco) + '.';
        q.fonte_ou_justificativa = 'Conta: 50 − ' + String(compra).replace('.', ',') + '.';
      } else {
        const giro = Math.floor(n / 4) % 4;         // gira os textos: a correta é a mais longa em 25% e a mais curta em 25%
        q.enunciado = 'FICTÍCIO ' + id + ': neste item de teste automático, qual é a resposta marcada como certa?';
        q.alternativas = ALTERNATIVAS_FICTICIAS.map((_, i) => ALTERNATIVAS_FICTICIAS[(i + giro) % 4]);
        q.correta = pos;
        q.explicacao = 'FICTÍCIO: item de teste automático; a resposta marcada como certa não tem significado.';
        q.fonte_ou_justificativa = 'Prática: item FICTÍCIO para os testes automáticos do motor.';
      }
      questoes.push(q);
    }
    dados[teste] = {
      teste, nome: NOMES_FICTICIOS[teste],
      descricao: 'Banco FICTÍCIO para os testes automáticos do motor. Não é o conteúdo real: nenhum item tem significado.',
      versao: '2026-10-v0', ativo: true, prova: { questoes: 15, minutos: teste === 'caixa' ? 25 : 20 },
      competencias, tarefas, questoes
    };
    const L = ['# Análise da função · FICTÍCIO (`' + teste + '`)', '',
      '> Banco FICTÍCIO gerado por `node scripts/montar-testes.mjs --gerar-ficticio`, só para os testes automáticos do motor.',
      '> Não é a análise da função real (essa fica na cópia privada do conteúdo, fora do repositório).', '',
      '## Matriz tarefa × competência', '',
      '| Tarefa (`id`) | F | I | T | ' + competencias.map((c) => c.nome).join(' | ') + ' | Questões |',
      '|---|---|---|---|' + competencias.map(() => '---|').join('') + '---|'];
    for (const t of tarefas) {
      const linha = competencias.map((c) => questoes.filter((q) => q.tarefa === t.id && q.competencia === c.id).length);
      L.push('| ' + t.nome + ' (`' + t.id + '`) | 1 | 1 | 1 | ' + linha.join(' | ') + ' | ' + linha.reduce((a, b) => a + b, 0) + ' |');
    }
    L.push('| **Total** | | | | ' + competencias.map((c) => questoes.filter((q) => q.competencia === c.id).length).join(' | ') + ' | **80** |', '');
    analises[teste] = L.join('\n');
  }
  return { dados, analises };
}

// Problemas do espelho 20261023120001_vagas_questoes.sql (lista vazia = ok): precisa existir e não pode ter carga nenhuma.
export function checarEspelho(texto) {
  const erros = [];
  if (typeof texto !== 'string' || !texto.trim()) { erros.push('espelho vazio ou ausente'); return erros; }
  const semComentarios = texto.split('\n').filter((l) => !/^\s*(--.*)?$/.test(l));
  if (semComentarios.length) erros.push('espelho com linha que não é comentário: "' + semComentarios[0].trim().slice(0, 60) + '"');
  if (/insert/i.test(texto)) erros.push('espelho menciona insert');
  if (/correta/i.test(texto)) erros.push('espelho menciona a coluna do gabarito');
  if (!/ESPELHO/.test(texto)) erros.push('espelho sem o aviso "ESPELHO"');
  return erros;
}

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

function principal() {
  const checar = process.argv.includes('--checar');
  const revisao = process.argv.includes('--revisao');
  const ficticio = process.argv.includes('--gerar-ficticio');
  const pasta = resolve(argumento('--conteudo') || PASTA_FICTICIA);
  const saida = argumento('--saida');
  const rel = (arq) => relative(RAIZ, arq) || arq;
  const ler = (arq) => (existsSync(arq) ? readFileSync(arq, 'utf8').replace(/\r\n/g, '\n') : '');
  const falhar = (msg) => { console.error('montar-testes: ' + msg); process.exit(1); };

  if (ficticio) {
    if (checar || revisao) falhar('--gerar-ficticio não combina com --checar nem --revisao');
    const { dados, analises } = gerarFicticio();
    mkdirSync(pasta, { recursive: true });
    for (const t of TESTES) {
      writeFileSync(join(pasta, t + '.json'), JSON.stringify(dados[t], null, 2) + '\n');
      writeFileSync(join(pasta, t + '.analise.md'), analises[t] + '\n');
    }
    console.log('montar-testes: banco FICTÍCIO gravado em ' + rel(pasta));
  }

  const { dados, erros } = lerConteudo(pasta);
  if (erros.length) falhar(erros.length + ' problema(s) no conteúdo de ' + rel(pasta) + '\n' + erros.map((e) => '  ✗ ' + e).join('\n'));
  if (revisao) { process.stdout.write(gerarRevisao(dados) + '\n'); return; }
  const lista = Object.values(dados).map((d) => d.teste + ' ' + d.questoes.length).join(', ');
  const relatorio = join(pasta, 'RELATORIO.md');
  const novoRelatorio = gerarRelatorio(dados);

  if (checar) {
    if (ler(relatorio) !== novoRelatorio) falhar('desatualizado: ' + rel(relatorio) + '. Rode: node scripts/montar-testes.mjs --conteudo ' + rel(pasta));
    const problemas = checarEspelho(ler(ESPELHO));
    if (problemas.length) falhar(rel(ESPELHO) + ' precisa ser só um espelho com comentário: ' + problemas.join('; '));
    console.log('montar-testes: ok (' + rel(pasta) + ': ' + lista + '; espelho sem conteúdo)');
    return;
  }

  const mudou = ler(relatorio) !== novoRelatorio;
  if (mudou) writeFileSync(relatorio, novoRelatorio);
  console.log('montar-testes: ' + (mudou ? 'gravado' : 'sem mudanças') + ' ' + rel(relatorio));
  if (saida) {
    const destino = resolve(saida);
    if (!destino.endsWith('.sql')) falhar('--saida precisa terminar em .sql');
    if (destino.startsWith(PASTA_MIGRACOES + sep) || destino === ESPELHO) falhar('--saida não pode apontar para supabase/migrations (o SQL de carga nunca entra no repositório)');
    writeFileSync(destino, gerarSql(dados));
    console.log('montar-testes: SQL de carga gravado em ' + destino + ' — TEM O GABARITO: cole no SQL Editor e apague o arquivo; nunca commite.');
  } else {
    console.log('montar-testes: SQL de carga não gravado (use --saida <arquivo.sql> fora do repositório)');
  }
  console.log('montar-testes: ' + lista);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) principal();
