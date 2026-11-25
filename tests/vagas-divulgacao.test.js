'use strict';
// Na recriação (v2) as páginas de venda antigas (emprego.html, empresas.html) saíram: os testes DE PÁGINA delas foram removidos daqui;
// a lógica pura de divulgacao.js (guardada, sem uso nas telas novas) continua testada abaixo.
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

test('pré-abertura (banco 20261024120004): com o recurso e a cidade em espera; preAbertura:false explícito da cidade fica com a lista', () => {
  const R1 = { preAberturaEmpresas: true };
  const espera = { slug: 'nova-xx', nome: 'Cidade Nova', status: 'lista_espera', preAbertura: true, aceitaEmpresas: true };
  assert.equal(D.preAbertura(espera, R1), true);
  assert.equal(D.preAbertura(Object.assign({}, espera, { preAbertura: undefined }), R1), true, 'banco que ainda não manda o campo: vale o recurso');
  assert.equal(D.preAbertura(Object.assign({}, espera, { preAbertura: false }), R1), false);
  assert.equal(D.preAbertura(espera, {}), false);
  assert.equal(D.preAbertura({ slug: 'a-xx', nome: 'A', status: 'ativa', preAbertura: false }, R1), false, 'cidade aberta não é pré-abertura');
  assert.equal(D.preAbertura(null, R1), false);
  assert.deepEqual(D.acoesTopo('empresa', 'espera', Object.assign({}, espera, { preAbertura: false }), R1).map((a) => a.rotulo), ['Entrar na lista de espera']);
  // A prévia "ver como: cidade em espera" sobre uma cidade aberta mostra a pré-abertura; "aberta" tira.
  const aberta = { slug: 'a-xx', nome: 'A', status: 'ativa', preAbertura: false, aceitaEmpresas: true };
  assert.equal(D.preAbertura(D.aplicarVisao(aberta, 'espera'), R1), true);
  assert.equal(D.aplicarVisao(espera, 'ativa').preAbertura, false);
  assert.equal(D.preencher(D.FRASES.preAberturaTexto, { cidade: 'Cidade Nova' }).split('. ')[0], 'Sua vaga entra no ar no dia em que Cidade Nova abrir');
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
    'Ao tocar no botão, você aceita receber o aviso de quando Cidade Nova abrir. Usamos o e-mail e o WhatsApp só para isso: depois do aviso, ou 30 dias após a abertura, apagamos. Você pode sair da lista quando quiser.');
  // Retenção da 20261024120002 (SPEC §7.1): avisada por tudo o que pediu, ou 30 dias depois da abertura. A regra antiga sumiu de tudo.
  for (const t of [D.FRASES.lgpd, D.FRASES.lgpdSoEmail]) assert.match(t, /depois do aviso, ou 30 dias após a abertura, apagamos/);
  const spec = fs.readFileSync(path.join(RAIZ, 'docs/VAGAS-SPEC.md'), 'utf8');
  assert.match(spec, /Lista de espera \(`vagas_lista_espera`\) \| até a pessoa ser avisada da abertura por tudo o que pediu.*ou 30 dias depois da abertura/);
  const priv = fs.readFileSync(path.join(RAIZ, 'conteudo/vagas-textos/aviso-de-privacidade.md'), 'utf8');
  assert.match(priv, /\| Lista de espera \(e-mail, WhatsApp, cidade, perfil, origem\) \| até você ser avisado\(a\) da abertura por tudo o que pediu .*ou 30 dias depois da abertura da cidade/);
  for (const [nome, t] of [['divulgacao.js', ler('js/divulgacao.js')], ['emprego.html', ler('emprego.html')], ['empresas.html', ler('empresas.html')], ['privacidade', priv]]) {
    assert.ok(!/mais 90 dias/.test(t), nome + ': a retenção antiga ("até abrir e mais 90 dias") não aparece mais');
  }
});

test('sair da lista pelo link do e-mail (?sair=<token>#sair): token de 64 hexadecimais, tirado do endereço; #sair sem token abre o formulário', () => {
  const tk = 'ab'.repeat(32);
  assert.equal(D.lerTokenSair(tk.toUpperCase()), tk, 'maiúsculas e minúsculas tanto faz');
  for (const ruim of ['', 'ab', 'g'.repeat(64), tk + 'a', ' ', null, '<script>']) assert.equal(D.lerTokenSair(ruim), '', JSON.stringify(ruim));
  assert.deepEqual(D.pedidoSair('?cidade=uruacu-go&sair=' + tk, '#sair'), { token: tk, noEndereco: true, abrirFormulario: false });
  assert.deepEqual(D.pedidoSair('?sair=' + tk, ''), { token: tk, noEndereco: true, abrirFormulario: false }, 'sem o #sair também vale');
  assert.deepEqual(D.pedidoSair('?cidade=uruacu-go', '#sair'), { token: '', noEndereco: false, abrirFormulario: true }, '#sair sem token: formulário com e-mail');
  assert.deepEqual(D.pedidoSair('?sair=estragado', '#sair'), { token: '', noEndereco: true, abrirFormulario: true }, 'token estragado: formulário, e sai do endereço');
  assert.deepEqual(D.pedidoSair('?sair', ''), { token: '', noEndereco: true, abrirFormulario: true });
  assert.deepEqual(D.pedidoSair('?cidade=uruacu-go&de=radio', ''), { token: '', noEndereco: false, abrirFormulario: false });
  assert.deepEqual(D.pedidoSair('', '#vg-chamada'), { token: '', noEndereco: false, abrirFormulario: false });
  assert.equal(D.buscaSemSair('?cidade=uruacu-go&sair=' + tk), '?cidade=uruacu-go', 'o resto do endereço fica');
  assert.equal(D.buscaSemSair('?sair=' + tk + '&cidade=uruacu-go&de=radio'), '?cidade=uruacu-go&de=radio');
  assert.equal(D.buscaSemSair('?sair=' + tk), '');
  assert.equal(D.buscaSemSair('?%73air=' + tk), '', 'nome codificado também sai');
  assert.equal(D.buscaSemSair(''), '');
  // O link que o e-mail do aviso monta (função compartilhada da vagas-conta) é o que a página entende.
  const fn = fs.readFileSync(path.join(RAIZ, 'supabase/funcoes-compartilhadas/vagas-conta.js'), 'utf8');
  assert.match(fn, /'\/emprego\.html\?cidade=' \+ c \+ t \+ '#sair'/);
  assert.match(fn, /'\/empresas\.html\?cidade=' \+ c \+ t \+ '#sair'/);
  assert.match(fn, /'&sair=' \+ sairToken/);
  // A página nunca guarda o token: nada de armazenamento com ele, e o endereço é trocado com replaceState.
  const js = ler('js/divulgacao.js');
  assert.match(js, /history\.replaceState\(/);
  assert.ok(!/(localStorage|sessionStorage)[^;\n]*tokenSair|tokenSair[^;\n]*(localStorage|sessionStorage)/.test(js), 'token fora do armazenamento');
  // Um toque antes de sair (robôs de segurança de e-mail abrem links): a chamada ao banco só existe dentro do clique.
  assert.equal((js.match(/\bAPI\.listaEsperaSairLink\(tokenSair\)/g) || []).length, 1);
  assert.equal((js.replace(/^\s*(\/\/|\*).*$/gm, '').match(/listaEsperaSairLink\(/g) || []).length, 1, 'nenhuma outra chamada fora do clique');
  assert.match(js, /function confirmar\(\) \{[\s\S]{0,200}API\.listaEsperaSairLink\(tokenSair\)/);
  assert.match(js, /botao\.addEventListener\('click', confirmar\)/);
  assert.equal(D.FRASES.sairConfirmar, 'Sair da lista de espera');
  for (const k of ['saiuTitulo', 'saiuTexto', 'sairPedirTitulo', 'sairPedirTexto', 'sairConfirmar']) assert.deepEqual(TELA.conferirTexto(D.FRASES[k], k), []);
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
