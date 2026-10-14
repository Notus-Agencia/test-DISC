'use strict';
// Vagas sem Caos — páginas de divulgação (vagas/emprego.html, vagas/empresas.html, vagas/js/divulgacao.js,
// vagas/assets/vagas-divulgacao.css): lógica pura (cidade, situação, topo, ações, lista de espera, textos prontos, prévia),
// textos transcritos conferidos com a fonte (avisos.json, padroes.md, pecas.js, VAGAS-TESTES), as regras da revisão da
// psicologia (teste opcional, selo sem "prova", "É golpe?" sem garantia, uma regra só para o contato), palavras proibidas,
// rotas, peso da primeira visita e prévia do WhatsApp.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const TELA = require('./helpers/vagas-tela.js');
const D = require('../vagas/js/divulgacao.js');
const R = require('../vagas/js/regras.js');

const RAIZ = path.join(__dirname, '..');
const VAGAS = path.join(RAIZ, 'vagas');
const ler = (rel) => fs.readFileSync(path.join(VAGAS, rel), 'utf8');
const AVISOS = JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo', 'vagas-textos', 'avisos.json'), 'utf8'));
const PADROES = fs.readFileSync(path.join(RAIZ, 'docs', 'painel-cientifico', 'vagas', 'padroes.md'), 'utf8');
const PAGINAS = { pessoa: 'emprego.html', empresa: 'empresas.html' };

// Texto visível de um trecho de HTML (sem tags, entidades básicas, espaços normalizados).
function visivel(html) {
  return String(html).replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
function corpo(html) { return html.slice(html.indexOf('<body')); }
// Elementos com um atributo: devolve [{valor, texto}] (o elemento termina no fechamento da mesma tag, sem aninhar igual).
function marcados(html, atributo) {
  const re = new RegExp('<(p|span|div|li)\\b[^>]*\\s' + atributo + '="([^"]+)"[^>]*>([\\s\\S]*?)</\\1>', 'g');
  return [...html.matchAll(re)].map((m) => ({ valor: m[2], texto: visivel(m[3]) }));
}
function buscar(obj, caminho) { return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function frasePadrao(rotulo) {
  const m = new RegExp('^- ' + rotulo + ': "(.+)"', 'm').exec(PADROES);
  assert.ok(m, 'frase modelo "' + rotulo + '" existe em padroes.md');
  return m[1];
}
// Todo o texto que alguém lê: corpo da página + metas (prévia do WhatsApp).
function textoTodo(pagina) {
  const html = ler(pagina);
  return visivel(corpo(html)) + ' ' + visivel((html.match(/content="[^"]*"/g) || []).join(' '));
}
const TEXTO_JS = Object.values(D.FRASES).join(' ') + ' ' + Object.values(D.TEXTOS).join(' ');

// ------------------------------------------------------------------------------------------------- lógica pura
test('escolherCidade: a pedida, depois a lembrada, depois a 1ª cidade-polo; só ativa ou lista de espera; nunca nome fixo', () => {
  const cidades = [
    { slug: 'polo-a-xx', nome: 'Polo A', status: 'ativa', praca: null },
    { slug: 'vizinha-xx', nome: 'Vizinha', status: 'ativa', praca: 'polo-a-xx' },
    { slug: 'nova-xx', nome: 'Nova', status: 'lista_espera', praca: null },
    { slug: 'rascunho-xx', nome: 'Rascunho', status: 'rascunho', praca: null },
    { slug: 'pausada-xx', nome: 'Pausada', status: 'pausada', praca: null }
  ];
  assert.equal(D.escolherCidade(cidades, 'nova-xx', 'polo-a-xx').slug, 'nova-xx');
  assert.equal(D.escolherCidade(cidades, ' NOVA-XX ', '').slug, 'nova-xx', 'endereço sem caixa nem espaço');
  assert.equal(D.escolherCidade(cidades, 'nao-existe', 'vizinha-xx').slug, 'vizinha-xx', 'cai na lembrada');
  assert.equal(D.escolherCidade(cidades, '', '').slug, 'polo-a-xx', 'sem pedido: a primeira cidade-polo na ordem do banco');
  assert.equal(D.escolherCidade(cidades, 'rascunho-xx', 'pausada-xx').slug, 'polo-a-xx', 'rascunho e pausada não aparecem');
  assert.equal(D.escolherCidade([cidades[1]], '', '').slug, 'vizinha-xx');
  assert.equal(D.escolherCidade([], 'x', 'y'), null);
  assert.deepEqual(D.outrasCidades(cidades, cidades[0]).map((c) => c.slug), ['nova-xx']);
  assert.equal(D.situacao(cidades[0]), 'ativa');
  assert.equal(D.situacao(cidades[2]), 'espera');
  assert.equal(D.situacao(null), 'sem_cidade');
});

test('prévia "ver como": só espera|ativa; muda o que a tela mostra numa cópia (a cidade do banco fica igual)', () => {
  const c = { slug: 'a-xx', nome: 'A', status: 'ativa' };
  assert.equal(D.visaoPrevia('espera'), 'espera');
  assert.equal(D.visaoPrevia('ativa'), 'ativa');
  assert.equal(D.visaoPrevia('<x>'), '');
  const vista = D.aplicarVisao(c, 'espera');
  assert.equal(vista.status, 'lista_espera');
  assert.equal(c.status, 'ativa', 'não muda o objeto do banco');
  assert.equal(D.aplicarVisao(c, ''), c);
  assert.equal(D.aplicarVisao(null, 'ativa'), null);
});

test('topo diz a situação da cidade (com o nome do dado) e as ações vêm na ordem certa para cada público', () => {
  const c = { slug: 'nova-xx', nome: 'Cidade Nova' };
  assert.deepEqual(D.textosTopo('pessoa', 'espera', c), { sobre: 'Chegando em Cidade Nova',
    texto: 'Vagas de carteira assinada, bico e diária de empresas de Cidade Nova, num lugar só.',
    situacao: 'Ainda não abriu: deixe seu contato e avisamos.', comoTitulo: 'Como vai funcionar' });
  assert.equal(D.textosTopo('pessoa', 'ativa', c).sobre, 'Vagas em Cidade Nova');
  assert.equal(D.textosTopo('pessoa', 'ativa', c).situacao, 'Já abriu: veja as vagas e toque em "Quero".');
  assert.equal(D.textosTopo('pessoa', 'sem_cidade', null).texto, 'Vagas de carteira assinada, bico e diária de empresas da sua cidade, num lugar só.');
  assert.equal(D.textosTopo('empresa', 'espera', c).sobre, 'Para empresas de Cidade Nova');
  // Cidade aberta: primeiro ver as vagas, depois criar a conta.
  assert.deepEqual(D.acoesTopo('pessoa', 'ativa', c, {}).map((a) => [a.rotulo, a.href]),
    [['Ver as vagas de Cidade Nova', 'cidade.html?cidade=nova-xx'], ['Criar minha conta', 'entrar.html#criar']]);
  assert.deepEqual(D.acoesTopo('pessoa', 'espera', c, {}).map((a) => [a.rotulo, a.href]), [['Me avise quando abrir', '#vg-chamada']]);
  assert.deepEqual(D.acoesTopo('empresa', 'espera', c, {}).map((a) => a.rotulo), ['Entrar na lista de espera']);
  assert.deepEqual(D.acoesTopo('empresa', 'espera', c, { preAberturaEmpresas: true }).map((a) => [a.rotulo, a.href]),
    [['Cadastrar minha empresa', 'entrar.html?tipo=empresa']], 'pré-abertura (C1): cadastro antes de a cidade abrir');
  assert.deepEqual(D.acoesTopo('empresa', 'espera', c, { preAberturaEmpresas: 'sim' }).map((a) => a.rotulo), ['Entrar na lista de espera'], 'só com true');
  assert.deepEqual(D.acoesTopo('empresa', 'ativa', c, {}).map((a) => a.href), ['entrar.html?tipo=empresa']);
  assert.deepEqual(D.acoesTopo('pessoa', 'sem_cidade', null, {}), [{ rotulo: 'Começar', href: '#vg-chamada' }]);
});

test('lista de espera: confere e-mail e WhatsApp de uma vez; WhatsApp opcional; origem só da lista fechada', () => {
  assert.deepEqual(D.lerEspera({ cidade: 'Nova-XX', email: '  Ana@Exemplo.COM ', perfil: 'pessoa' }),
    { ok: true, dados: { cidade: 'nova-xx', email: 'ana@exemplo.com', perfil: 'pessoa' } }, 'sem WhatsApp: a chave nem vai');
  assert.deepEqual(D.lerEspera({ cidade: 'nova-xx', email: 'a@b.co', whatsapp: '(62) 98888-1111', perfil: 'empresa', origem: 'RADIO' }).dados,
    { cidade: 'nova-xx', email: 'a@b.co', perfil: 'empresa', whatsapp: '5562988881111', origem: 'radio' });
  assert.equal(D.lerEspera({ email: 'a@b.co', origem: 'facebook' }).dados.origem, undefined, 'origem fora da lista é ignorada');
  const dois = D.lerEspera({ email: 'ana@exemplo', whatsapp: '(62) 3333-1111' });
  assert.deepEqual(dois.erros, { email: AVISOS.validacao.email_invalido, whatsapp: AVISOS.validacao.whatsapp_invalido }, 'os dois erros juntos');
  assert.deepEqual([dois.ok, dois.campo], [false, 'email'], 'o foco vai para o primeiro');
  assert.equal(D.lerEspera({ email: 'a@b.co', whatsapp: '   ' }).ok, true);
  assert.deepEqual(D.ORIGENS, ['radio', 'cartaz', 'grupo', 'canal', 'escola', 'mutirao', 'indicacao', 'outro']);
  for (const o of D.ORIGENS) assert.equal(D.lerOrigem(o), o);
  assert.equal(D.lerOrigem('<script>'), '');
});

test('leitura do e-mail e do WhatsApp: igual à de vagas/js/regras.js (as páginas não carregam regras.js)', () => {
  const emails = ['', '  ', 'a@b.co', ' A@B.CO ', 'a@b', 'a b@c.d', 'x'.repeat(250) + '@b.co', 'ana.silva+vagas@exemplo.com.br', null, undefined, 42];
  for (const e of emails) assert.equal(D.normalizarEmail(e), R.normalizarEmail(e), 'e-mail ' + JSON.stringify(e));
  const numeros = ['', '62988881111', '(62) 98888-1111', '+55 62 98888-1111', '5562988881111', '6233331111', '556233331111', '988881111',
    '00062988881111', '55 0 62 98888 1111', '11 91234-5678', null];
  for (const n of numeros) {
    assert.equal(D.normalizarWhatsapp(n), R.normalizarWhatsapp(n), 'whatsapp ' + JSON.stringify(n));
    assert.equal(D.whatsappCelularValido(D.normalizarWhatsapp(n)), R.whatsappCelularValido(R.normalizarWhatsapp(n)), 'celular ' + JSON.stringify(n));
  }
});

test('textos da lista: total só a partir de 10 (o banco devolve em dezenas); cidade sempre do dado; nota de consentimento', () => {
  const c = { slug: 'nova-xx', nome: 'Cidade Nova', status: 'lista_espera', interessados: 120 };
  assert.equal(D.textoEspera(c), 'O Vagas sem Caos ainda não chegou em Cidade Nova. Deixe seu e-mail e avisamos quando abrir. 120 pessoas já estão na lista.');
  assert.equal(D.textoEspera(Object.assign({}, c, { interessados: 0 })), 'O Vagas sem Caos ainda não chegou em Cidade Nova. Entre na lista e avisamos quando chegar.');
  assert.equal(D.preencher(D.FRASES.lgpd, { cidade: 'Cidade Nova' }),
    'Ao tocar no botão, você aceita receber o aviso de quando Cidade Nova abrir. Usamos o e-mail e o WhatsApp só para isso. Guardamos até a cidade abrir e mais 90 dias, e você pode sair da lista quando quiser.');
});

test('"Mandar no WhatsApp": novidade local curta, com o link (origem indicação) e o aviso anti-golpe', () => {
  const c = { slug: 'nova-xx', nome: 'Cidade Nova' };
  assert.equal(D.linkPagina('pessoa', c, false, 'indicacao'), 'https://vagas.gestaosemcaos.com.br/emprego?de=indicacao');
  assert.equal(D.linkPagina('pessoa', c, true, 'indicacao'), 'https://vagas.gestaosemcaos.com.br/emprego?cidade=nova-xx&de=indicacao');
  assert.equal(D.linkPagina('empresa', null, true, 'qualquer'), 'https://vagas.gestaosemcaos.com.br/empresas');
  const L = 'https://vagas.gestaosemcaos.com.br/emprego?de=indicacao';
  assert.match(D.textoAmigo('espera', c, L), /^Vai abrir o Vagas sem Caos em Cidade Nova: /);
  assert.match(D.textoAmigo('ativa', c, L), /^Já tem vaga no Vagas sem Caos em Cidade Nova: /);
  for (const sit of ['ativa', 'espera', 'sem_cidade']) {
    const t = D.textoAmigo(sit, sit === 'sem_cidade' ? null : c, L);
    assert.match(t, / · Nunca pague para se candidatar\.$/);
    assert.ok(t.includes(L));
    assert.match(t, /de graça/);
    assert.deepEqual(TELA.conferirTexto(t, 'amigo ' + sit), []);
  }
  assert.equal(D.textoContato('empresa', c), 'Oi! Tenho uma empresa em Cidade Nova e quero saber como anunciar vagas no Vagas sem Caos.');
  assert.equal(D.textoContato('pessoa', c), 'Oi! Moro em Cidade Nova e quero ajuda com o Vagas sem Caos.');
  assert.equal(D.textoContato('pessoa', null), 'Oi! Quero ajuda com o Vagas sem Caos.');
});

test('WhatsApp da Gestão sem Caos: botão só com número; sem número, marcador só na prévia e nada fora dela', () => {
  assert.equal(D.WHATSAPP_GESTAO, '[NÚMERO DA GESTÃO SEM CAOS]', 'pendência do dono: o número ainda é o marcador');
  assert.equal(D.numeroGestao(D.WHATSAPP_GESTAO), '');
  assert.equal(D.numeroGestao('55 (62) 3333-4444'), '556233334444', 'fixo com DDD serve (é a empresa que atende)');
  assert.equal(D.numeroGestao('62988881111'), '', 'sem o 55: a constante precisa vir completa');
  assert.equal(D.mostrarWhatsapp('previa', D.WHATSAPP_GESTAO), 'marcador');
  assert.equal(D.mostrarWhatsapp('supabase', D.WHATSAPP_GESTAO), '', 'no ar sem número: sem botão e sem marcador');
  assert.equal(D.mostrarWhatsapp(undefined, D.WHATSAPP_GESTAO), '');
  assert.equal(D.mostrarWhatsapp('supabase', '5562988881111'), 'link');
  assert.equal(D.MARCADOR_EMPRESA, '[RAZÃO SOCIAL E CNPJ DA GESTÃO SEM CAOS]');
  // Canal da cidade (C2): só canal do próprio WhatsApp, por https.
  assert.equal(D.canalValido('https://whatsapp.com/channel/0029VaABCdef12'), 'https://whatsapp.com/channel/0029VaABCdef12');
  assert.equal(D.canalValido('https://www.whatsapp.com/channel/0029VaABCdef12'), 'https://www.whatsapp.com/channel/0029VaABCdef12');
  for (const ruim of ['http://whatsapp.com/channel/0029VaABCdef12', 'https://whatsapp.com.golpe.io/channel/0029VaABCdef12', 'javascript:alert(1)',
    'https://chat.whatsapp.com/abcdef123456', '', null]) assert.equal(D.canalValido(ruim), '', String(ruim));
});

test('destinos: sempre relativos; pessoa cria a conta em entrar.html#criar; empresa em entrar.html?tipo=empresa', () => {
  const c = { slug: 'nova-xx', nome: 'Cidade Nova' };
  assert.deepEqual(D.destinos('pessoa', c), { criar: 'entrar.html#criar', entrar: 'entrar.html#entrar', vagas: 'cidade.html?cidade=nova-xx' });
  assert.deepEqual(D.destinos('empresa', c), { criar: 'entrar.html?tipo=empresa', entrar: 'entrar.html?tipo=empresa#entrar', vagas: 'cidade.html?cidade=nova-xx' });
  for (const d of [D.destinos('pessoa', c), D.destinos('empresa', null)]) for (const v of Object.values(d)) assert.ok(!v.startsWith('/'), v);
});

// ------------------------------------------------------------------------------------------------- textos conferidos com a fonte
test('textos transcritos em divulgacao.js: iguais a conteudo/vagas-textos/avisos.json (palavra por palavra)', () => {
  assert.deepEqual(D.TEXTOS, {
    cidade_lista_espera: AVISOS.avisos.cidade_lista_espera, cidade_lista_espera_vazia: AVISOS.avisos.cidade_lista_espera_vazia,
    cidade_lista_espera_ok: AVISOS.avisos.cidade_lista_espera_ok, email_invalido: AVISOS.validacao.email_invalido,
    whatsapp_invalido: AVISOS.validacao.whatsapp_invalido, lista_espera: AVISOS.botoes.lista_espera, gratis_para_sempre: AVISOS.avisos.gratis_para_sempre
  });
});

test('páginas: data-texto = avisos.json; data-padrao = frases modelo de padroes.md; aviso anti-golpe começa pela frase fixa de pecas.js', () => {
  const ROTULOS = { pessoa: 'Para quem procura', empresa: 'Para a empresa', limites: 'Sobre limites', combinou: 'Sobre o Combinou',
    refazer: 'Sobre refazer', entrevista: 'Sobre a entrevista' };
  let total = 0;
  for (const pagina of Object.values(PAGINAS)) {
    const html = ler(pagina);
    for (const m of marcados(html, 'data-texto')) {
      const esperado = buscar(AVISOS, m.valor);
      assert.equal(typeof esperado, 'string', pagina + ': chave ' + m.valor + ' existe');
      assert.equal(m.texto, esperado, pagina + ': ' + m.valor);
      total++;
    }
    for (const m of marcados(html, 'data-padrao')) {
      assert.ok(ROTULOS[m.valor], 'rótulo conhecido ' + m.valor);
      assert.equal(m.texto, frasePadrao(ROTULOS[m.valor]), pagina + ': frase modelo ' + m.valor);
      total++;
    }
  }
  assert.ok(total >= 7, 'textos conferidos: ' + total);
  const pecas = fs.readFileSync(path.join(VAGAS, 'js', 'pecas.js'), 'utf8');
  const fixa = /GOLPE_FORTE = '([^']+)'/.exec(pecas)[1] + ' ' + /GOLPE_TEXTO = '([^']+)'/.exec(pecas)[1];
  const golpe = /<div class="vg-golpe[^"]*" id="vg-aviso-golpe" role="note">([\s\S]*?)<\/div>/.exec(ler(PAGINAS.pessoa));
  assert.ok(golpe, 'emprego.html tem o aviso anti-golpe fixo');
  assert.ok(visivel(golpe[1]).startsWith(fixa + ' '), 'começa pela frase fixa das telas');
  assert.match(visivel(golpe[1]), /Empresa nenhuma pode cobrar de você: nem taxa, nem curso, nem exame, nem uniforme\.$/);
});

test('teste do tamanho real: 15 questões e de 20 a 25 minutos, conferidos com docs/VAGAS-TESTES.md', () => {
  const doc = fs.readFileSync(path.join(RAIZ, 'docs', 'VAGAS-TESTES.md'), 'utf8');
  const linhas = doc.split('\n').filter((l) => /^\| [^|]+\(`[a-z]+`\) \|/.test(l) && /\d+ min/.test(l));
  assert.ok(linhas.length >= 5, 'catálogo dos testes');
  const questoes = new Set(linhas.map((l) => (/\| (\d+)(?: questões)?, \**\d+ min/.exec(l) || [])[1]));
  const minutos = linhas.map((l) => Number(/(\d+) min/.exec(l)[1]));
  assert.deepEqual([...questoes], ['15']);
  assert.equal(Math.min(...minutos), 20);
  assert.equal(Math.max(...minutos), 25);
  assert.match(textoTodo(PAGINAS.pessoa), /15 questões, de 20 a 25 minutos, de graça/);
});

// ------------------------------------------------------------------------------------------------- regras da revisão
test('A1: o teste é opcional e do tamanho real em todo lugar da página de emprego; nada de "ganhe o selo"', () => {
  const t = textoTodo(PAGINAS.pessoa);
  assert.match(t, /Se quiser, faça o teste da sua função e tente o selo\./);
  assert.match(t, /Não é obrigatório para se candidatar\./);
  assert.match(t, /Em qualquer vaga, é só tocar em "Quero": o teste nunca é obrigatório\./);
  assert.match(t, /Se não for bem, a empresa não fica sabendo: ela só vê o selo\./);
  assert.match(t, /Se parar no meio, conta como tentativa: o próximo teste só em 30 dias\./);
  assert.match(t, /com margem de cerca de 10 pontos/);
  for (const re of [/ganhe o selo/i, /teste rápido/i, /Diária não pede teste/i, /Faça o teste da sua função e/]) assert.doesNotMatch(t, re);
});

test('A2: na página de empresas o selo não é "prova" nem peneira; nota sempre com a margem; sem selo ≠ não sabe', () => {
  const t = textoTodo(PAGINAS.empresa);
  for (const re of [/já provou/i, /provou o básico/i, /Pare de entrevistar/i, /quem já sabe o básico/i]) assert.doesNotMatch(t, re);
  assert.match(t, /Veja o que a pessoa sabe antes da entrevista\./);
  assert.match(t, /Sem selo não quer dizer que a pessoa não sabe/);
  assert.match(t, /A decisão de contratar continua sendo sua\./);
  // Toda frase que fala da nota do teste traz a margem.
  // ("Use a nota para conversar…" é a continuação da frase da margem, no mesmo parágrafo.)
  const frases = t.split(/(?<=[.!?])\s+/).filter((f) => /\bnota\b/i.test(f) && !/notas por pergunta|régua de nota|^Use a nota para conversar/.test(f));
  assert.ok(frases.length >= 2);
  for (const f of frases) assert.match(f, /margem/, 'nota sem margem: ' + f);
  assert.match(ler(PAGINAS.empresa), /<meta property="og:title" content="Veja o que a pessoa sabe antes da entrevista \| Vagas sem Caos">/);
});

test('A3: "É golpe?" não vende garantia; empresa nenhuma pode cobrar; documento só na contratação; código de SMS', () => {
  const t = textoTodo(PAGINAS.pessoa);
  assert.match(t, /É golpe\? Toda vaga é de empresa com CNPJ conferido pela Gestão sem Caos\. Mesmo assim, empresa nenhuma pode cobrar de você\./);
  assert.match(t, /Nenhuma empresa pode cobrar para contratar: nem taxa, nem curso, nem exame, nem uniforme\. Documento, só na contratação, depois de conhecer a empresa\. Nunca passe código que chegou por SMS\./);
});

test('B2: uma regra só para o contato, igual nas duas páginas: a pessoa toca em "Combinou" e os dois veem nome, WhatsApp e e-mail', () => {
  const regra = /tocar em "Combinou", os dois passam a ver nome, WhatsApp e e-mail/;
  assert.match(textoTodo(PAGINAS.pessoa), regra);
  assert.match(textoTodo(PAGINAS.empresa), regra);
  for (const p of Object.values(PAGINAS)) {
    const t = textoTodo(p);
    for (const re of [/quando você liberar/, /Aí aparecem o nome e o WhatsApp/, /Você escolhe quando liberar/, /Vão ver minha cara\? Não\./, /onde estudou/]) {
      assert.doesNotMatch(t, re, p + ': ' + re);
    }
  }
  const p = textoTodo(PAGINAS.pessoa);
  assert.match(p, /Antes do Combinou, não: a empresa não vê seu nome nem sua foto\./);
  assert.match(p, /Seu nome, sua foto e seu contato, não\./);
  assert.match(p, /seu nível de escolaridade e seus cursos/);
  assert.match(p, /Idade e nome das empresas onde você trabalhou: não aparecem/);
  assert.match(p, /Quem já salvou seu número continua com ele\./);
});

// Palavras e promessas que não entram em texto de divulgação (BRIEF §2, padroes.md §4 e §6, pedido do dono, revisão).
const PROMESSAS = [/comprova/i, /\bprev[eê]\b|\bprever\b/i, /garantid/i, /emprego garantido/i, /vai ser contratad/i, /consiga (um )?emprego/i,
  /\bmatch\b/i, /os melhores/i, /\branking\b/i, /curr[ií]culo verificado/i, /perfil ideal/i, /cient[ií]fic/i, /\bcertificad/i,
  /Menos risco com a lei/i, /protege a sua empresa/i, /Mapa DISC/i, /\bDISC\b/, /um amigo/i];
const RH = [/processo seletivo/i, /compet[eê]ncia/i, /\bperfil\b/i, /\bcandidato\b/i, /recrutamento/i];

test('páginas: CSP, scripts em ordem, nada inline, sem palavra proibida, sem DISC, sem promessa e sem nome de cidade', () => {
  for (const p of Object.values(PAGINAS)) assert.deepEqual(TELA.conferirPagina(p), [], p);
  assert.deepEqual(TELA.conferirScript('js/divulgacao.js'), []);
  for (const pagina of Object.values(PAGINAS)) {
    const t = textoTodo(pagina) + ' ' + TEXTO_JS;
    for (const re of PROMESSAS) assert.doesNotMatch(t, re, pagina + ': ' + re);
    // "garante" só na pergunta "O teste garante…?" e na negação da frase modelo ("não garante desempenho").
    assert.doesNotMatch(t.replace(/O teste garante que a pessoa é boa\?/g, '').replace(/não garante desempenho/g, ''), /garant/i, pagina);
    assert.doesNotMatch(t, /Urua[cç]u|Goi[aá]s|\bGO\b/, pagina + ': cidade do piloto só vem do dado');
    assert.doesNotMatch(ler(pagina), /icone\.svg|estrela/i, pagina + ': nunca a estrela');
    assert.doesNotMatch(ler(pagina), /name="robots" content="noindex"/, pagina + ': página de divulgação aparece na busca');
  }
  const js = TELA.semComentarios(ler('js/divulgacao.js'));
  assert.doesNotMatch(js, /Urua[cç]u|uruacu/i, 'divulgacao.js sem cidade fixa');
  assert.doesNotMatch(js, /localStorage/, 'nada de localStorage direto (a origem ?de= nunca fica no aparelho)');
  const pessoa = visivel(corpo(ler(PAGINAS.pessoa)));
  for (const re of RH) assert.doesNotMatch(pessoa, re, 'emprego.html: termo de RH ' + re);
});

test('páginas: um h1, botão de ação no HTML (sem esperar o banco), um vidro, ids que os testes de navegador usam', () => {
  for (const [tipo, pagina] of Object.entries(PAGINAS)) {
    const html = ler(pagina);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, pagina + ': um h1');
    assert.ok((html.match(/botao--laranja/g) || []).length <= 1, pagina + ': no máximo um botão laranja fixo no HTML');
    assert.match(html, new RegExp('<body class="vg-div vg-div--' + tipo + '" data-divulgacao="' + tipo + '">'));
    assert.match(html, /<a class="botao botao--(principal|laranja) botao--grande" id="vg-topo-acao" href="#vg-chamada" data-divulgacao-acao>Começar<\/a>/,
      pagina + ': o botão principal existe no HTML e leva à chamada');
    for (const id of ['vg-chamada', 'vg-chamada-corpo', 'vg-div-titulo', 'conteudo', 'vg-div-sobre', 'vg-div-rodape']) assert.match(html, new RegExp('id="' + id + '"'), pagina + ': #' + id);
    assert.equal((html.match(/caixa--vidro/g) || []).length, 1, pagina + ': um vidro por página');
    const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(scripts, ['js/endereco.js', 'js/config.js', 'js/api.js', 'js/ui.js', 'js/divulgacao.js'], pagina);
    assert.doesNotMatch(html, /\[NÚMERO DA GESTÃO SEM CAOS\]|\[RAZÃO SOCIAL/, pagina + ': marcadores só pelo script, só na prévia');
  }
  const p = ler(PAGINAS.pessoa);
  assert.match(p, /id="vg-amigo" data-amigo/);
  assert.match(p, />Mandar no WhatsApp<\/a>/);
  assert.match(p, /id="vg-div-situacao"/);
  assert.match(p, /<section class="caixa caixa--suave vg-div-ajuda" id="vg-div-ajuda"[^>]* hidden>/, 'ajuda humana só aparece com canal');
  // A chamada vem logo depois de "Como funciona" (antes dos detalhes).
  assert.ok(p.indexOf('id="vg-chamada"') < p.indexOf('id="vg-div-tipos-titulo"'));
});

test('primeira visita: até 100 KB transferidos (gzip), medida igual à da lista pública', async () => {
  const { pesoDaLista } = await import('../scripts/montar-vagas.mjs');
  for (const pagina of Object.values(PAGINAS)) {
    const p = pesoDaLista(RAIZ, pagina);
    assert.ok(p && !p.itens.some((x) => x.falta), pagina + ': todos os arquivos existem');
    assert.ok(p.total <= 100 * 1024, pagina + ': ' + (p.total / 1024).toFixed(1) + ' KB');
  }
});

test('prévia no WhatsApp: og com o endereço final e imagem PNG 1200x630', () => {
  const ROTA = { pessoa: '/emprego', empresa: '/empresas' };
  for (const [tipo, pagina] of Object.entries(PAGINAS)) {
    const html = ler(pagina);
    const meta = (p) => { const m = new RegExp('<meta property="' + p + '" content="([^"]+)">').exec(html); return m ? m[1] : ''; };
    assert.ok(meta('og:title').length > 10 && meta('og:description').length > 40, pagina);
    assert.equal(meta('og:url'), 'https://vagas.gestaosemcaos.com.br' + ROTA[tipo]);
    assert.match(html, new RegExp('<link rel="canonical" href="https://vagas.gestaosemcaos.com.br' + ROTA[tipo] + '">'));
    const img = meta('og:image');
    assert.match(img, /^https:\/\/vagas\.gestaosemcaos\.com\.br\/assets\/divulgacao-(emprego|empresas)\.png$/);
    const b = fs.readFileSync(path.join(VAGAS, img.replace('https://vagas.gestaosemcaos.com.br/', '')));
    assert.equal(b.slice(1, 4).toString(), 'PNG', 'PNG (o WhatsApp não mostra SVG)');
    assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [1200, 630]);
    assert.ok(b.length < 300 * 1024, 'imagem leve para a prévia: ' + b.length);
  }
  assert.match(ler(PAGINAS.pessoa), /<meta property="og:title" content="Vagas de emprego da sua cidade, de graça \| Vagas sem Caos">/);
});

test('vagas-divulgacao.css: só cores, tamanhos e pesos da identidade; foco do campo visível; contraste; movimento reduzido', () => {
  const css = TELA.semComentarios(ler('assets/vagas-divulgacao.css'));
  const liberadas = new Set(['#f34405', '#f2762e', '#ff9f40', '#324e73', '#13283f', '#141414', '#f2f2f2', '#c43803', '#eaeef4', '#e2e6ec', '#6b7586',
    '#46546a', '#e9ecef', '#8a97ab', '#5d7699', '#c5ccd6', '#fff', '#ffffff', '#dc2626', '#fef2f2', '#fca5a5', '#047857', '#065f46', '#ecfdf5', '#b91c1c']);
  for (const m of css.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) assert.ok(liberadas.has(m[0].toLowerCase()), 'cor fora da paleta: ' + m[0]);
  for (const m of css.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+)/g)) assert.ok(['255,255,255', '243,68,5', '19,40,63'].includes([m[1], m[2], m[3]].join()), 'rgba ' + m[0]);
  for (const m of css.matchAll(/font-size\s*:\s*([0-9.]+)px/g)) assert.ok([11, 12, 13, 15, 16, 18, 24, 28, 32, 44].includes(Number(m[1])), 'fonte ' + m[1]);
  for (const m of css.matchAll(/font-weight\s*:\s*(\w+)/g)) assert.ok(['400', '600', '700', 'inherit'].includes(m[1]), 'peso ' + m[1]);
  assert.doesNotMatch(css, /repeating-(linear|radial)-gradient/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.vg-div \.entrada:focus, \.vg-div \.entrada:focus-visible \{ border-color: var\(--tinta\); box-shadow: 0 0 0 1px var\(--tinta\); \}/);
  assert.match(css, /\.vg-div-rodape__interno \{[^}]*color: var\(--medio\)/, 'rodapé com contraste AA');
  assert.match(css, /\.vg-div-barra \.barra-dica \{ color: var\(--medio\); \}/);
});

test('_redirects: /emprego/ e /empresas/ vão para o endereço divulgado ANTES de /:cidade/; /emprego e /empresas sem regra; /empresa intocada', () => {
  const regras = ler('_redirects').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/));
  const casa = (origem, caminho) => new RegExp('^' + origem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[a-z]+/g, '[^/]+')
    .replace(/\\\*/g, '.*') + '$').test(caminho);
  const primeira = (c) => regras.find((r) => casa(r[0], c));
  assert.deepEqual(primeira('/emprego/'), ['/emprego/', '/emprego', '301']);
  assert.deepEqual(primeira('/empresas/'), ['/empresas/', '/empresas', '301']);
  for (const c of [D.ENDERECO.pessoa, D.ENDERECO.empresa, '/emprego.html', '/empresas.html', '/empresa', '/empresa.html']) {
    assert.equal(primeira(c), undefined, c + ' não é desviado');
  }
  assert.deepEqual(primeira('/cidade-teste-xx/'), ['/:cidade/', '/cidade.html?cidade=:cidade', '302'], 'cidade continua com a regra da casca');
  const origens = new Set(regras.map((r) => r[0]));
  for (const r of regras.slice(0, 2)) assert.ok(!origens.has(r[1]), 'sem laço');
});
