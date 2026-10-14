'use strict';
// Vagas sem Caos — base comum das telas (frente casca, onda 2): VAGAS_UI (ui.js + ui-area.js, lógica pura), VAGAS_CONVERSA
// (estado, mensagens, filtro), VAGAS_ENTRAR (destino, aceite, validações), o gerador de textos/termos de scripts/montar-vagas.mjs
// e as conferências de segurança e de texto das páginas e scripts da casca (tests/helpers/vagas-tela.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const U = require('../vagas/js/ui-area.js');   // ui.js + ui-area.js
const C = require('../vagas/js/conversa.js');
const E = require('../vagas/js/entrar.js');
const T = require('../vagas/js/textos.js');
const TC = require('../vagas/js/textos-conta.js');
const R = require('../vagas/js/regras.js');
const TELA = require('./helpers/vagas-tela.js');

const AGORA = Date.parse('2026-10-13T15:00:00Z');

function armazem(falha) {
  const m = {};
  return { getItem: (k) => { if (falha) throw new Error('bloqueado'); return k in m ? m[k] : null; },
    setItem: (k, v) => { if (falha) throw new Error('bloqueado'); m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}

test('voltar: só página do próprio site (arquivo .html com busca/âncora); o resto vai para a página padrão', () => {
  for (const ok of ['vaga.html?vaga=K7M2QX', 'eu.html#curriculo/1', 'cidade.html?cidade=boa-vista-rr&areas=caixa', 'entrar.html']) {
    assert.equal(U.voltarValido(ok, 'x'), ok, ok);
  }
  for (const ruim of ['https://golpe.com/x.html', '//golpe.com/a.html', '/eu.html', 'javascript:alert(1)', '../admin.html', 'eu.html?x=1 2',
    'EU.HTML', 'eu.htm', 'pasta/eu.html', 'eu.html\\x', 'data:text/html,oi', '', null, undefined]) {
    assert.equal(U.voltarValido(ruim, 'index.html'), 'index.html', String(ruim));
  }
  assert.equal(U.voltarValido('eu.html?v=//x'), '', 'nada de // nem na busca');
});

test('parametro e paginaAtual: lê a busca sem quebrar e tira token, tipo e voltar do link do e-mail', () => {
  assert.equal(U.parametro('voltar', '?a=1&voltar=vaga.html%3Fvaga%3DK7M2QX'), 'vaga.html?vaga=K7M2QX');
  assert.equal(U.parametro('tipo', '?tipo=empresa'), 'empresa');
  assert.equal(U.parametro('nada', '?a=1'), null);
  assert.equal(U.parametro('x', '?x=%E0%A4%A'), '', 'codificação quebrada não lança');
  assert.equal(U.paginaAtual({ pathname: '/vagas/vaga.html', search: '?vaga=K7M2QX', hash: '#topo' }), 'vaga.html?vaga=K7M2QX#topo');
  assert.equal(U.paginaAtual({ pathname: '/eu.html', search: '?token_hash=abc&type=invite&voltar=x.html', hash: '' }), 'eu.html');
  assert.equal(U.paginaAtual({ pathname: '/', search: '', hash: '' }), 'index.html');
  assert.equal(U.linkEntrar('vaga.html?vaga=K7M2QX'), 'entrar.html?voltar=vaga.html%3Fvaga%3DK7M2QX');
  assert.equal(U.linkEntrar('https://golpe.com'), 'entrar.html');
  assert.equal(U.linkEntrar('eu.html', 'motivo=sessao'), 'entrar.html?motivo=sessao&voltar=eu.html');
});

test('rotaPara: a chave mais longa que serve; "conversa/" pega o id; padrão e coringa', () => {
  const rotas = { inicio: 1, 'curriculo/': 1, conversa: 1, 'conversa/': 1, '*': 1 };
  assert.deepEqual(U.rotaPara(rotas, '#curriculo/3', 'inicio'), { chave: 'curriculo/', resto: '3', hash: 'curriculo/3' });
  assert.deepEqual(U.rotaPara(rotas, '#conversa/abc-1', 'inicio'), { chave: 'conversa/', resto: 'abc-1', hash: 'conversa/abc-1' });
  assert.equal(U.rotaPara(rotas, '#conversa', 'inicio').chave, 'conversa');
  assert.equal(U.rotaPara(rotas, '', 'inicio').chave, 'inicio');
  assert.equal(U.rotaPara(rotas, '#xyz', 'inicio').chave, '*');
  assert.equal(U.rotaPara({ a: 1 }, '#b').chave, null);
  assert.equal(U.rotaPara(rotas, '#conversa%2F9').resto, '9', 'âncora codificada');
});

test('armazenamento: localStorage -> sessionStorage -> memória; JSON seguro; rascunho com hora', () => {
  const ambos = U.criarArmazenamento({ localStorage: armazem(), sessionStorage: armazem() });
  assert.equal(ambos.tipo, 'local');
  const soSessao = U.criarArmazenamento({ get localStorage() { throw new Error('SecurityError'); }, sessionStorage: armazem() });
  assert.equal(soSessao.tipo, 'sessao');
  const nada = U.criarArmazenamento({ localStorage: armazem(true), sessionStorage: armazem(true) });
  assert.equal(nada.tipo, 'memoria');
  nada.gravar('vg.x', { a: [1, 2] });
  assert.deepEqual(nada.ler('vg.x'), { a: [1, 2] });
  nada.apagar('vg.x');
  assert.equal(nada.ler('vg.x', 'padrão'), 'padrão');
  const sessao = armazem();
  const a = U.criarArmazenamento({ sessionStorage: sessao });
  sessao.setItem('vg.ruim', '{nao é json');
  assert.equal(a.ler('vg.ruim'), null, 'JSON quebrado vira null');
  U.definirFuso('America/Sao_Paulo');
  const r = U.rascunho('curriculo', { armazenamento: a, agora: () => AGORA });
  assert.equal(r.chave, 'vg.rascunho.curriculo');
  assert.equal(r.ler(), null);
  assert.deepEqual(r.gravar({ passo: 2 }), { em: AGORA, hora: '12:00' });
  assert.deepEqual(r.ler(), { dados: { passo: 2 }, em: AGORA });
  assert.equal(U.textoRascunho('12:00'), 'Rascunho salvo neste aparelho às 12:00');
  r.apagar();
  assert.equal(r.ler(), null);
});

test('novoId: uuid v4 (com ou sem crypto.randomUUID)', () => {
  for (let i = 0; i < 20; i++) assert.match(U.novoId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('formatação: reais sem ",00", valor com unidade, datas e horas no fuso da cidade (reserva America/Sao_Paulo)', () => {
  assert.equal(U.reais(162000), 'R$ 1.620');
  assert.equal(U.reais(1490), 'R$ 14,90');
  assert.equal(U.valor({ minCentavos: 190000, maxCentavos: 220000, unidade: 'mes' }), 'R$ 1.900 a R$ 2.200');
  assert.equal(U.valor({ minCentavos: 12000, maxCentavos: null, unidade: 'dia' }), 'R$ 120 por dia');
  assert.equal(U.valor({ minCentavos: 2500, maxCentavos: 2500, unidade: 'hora' }), 'R$ 25 por hora');
  assert.equal(U.valor(null), '');
  assert.equal(U.definirFuso('nada'), 'America/Sao_Paulo', 'fuso inválido cai na reserva');
  assert.equal(U.data('2026-10-13T15:00:00Z'), '13/10/2026');
  assert.equal(U.hora('2026-10-13T15:00:00Z'), '12:00');
  assert.equal(U.dataHora('2026-10-13T15:00:00Z'), '13/10, 12:00');
  assert.equal(U.data('2026-10-14'), '14/10/2026', 'data sem hora não muda de dia com o fuso');
  assert.equal(U.dataCurta('2026-10-14'), '14/10');
  U.definirFuso('America/Manaus');
  assert.equal(U.fuso(), 'America/Manaus');
  assert.equal(U.hora('2026-10-13T15:00:00Z'), '11:00', 'o fuso vem da cidade');
  U.definirFuso('America/Sao_Paulo');
  assert.equal(U.mesAno('2025-06'), 'jun/2025');
  assert.equal(U.mesAno('2025-13'), '');
});

test('relativa: agora, minutos, horas, hoje, ontem, dias e data', () => {
  U.definirFuso('America/Sao_Paulo');
  const ag = Date.parse('2026-10-13T23:00:00Z');   // 20:00 no fuso
  assert.equal(U.relativa(new Date(ag - 20000).toISOString(), ag), 'agora');
  assert.equal(U.relativa(new Date(ag - 5 * 60000).toISOString(), ag), 'há 5 min');
  assert.equal(U.relativa(new Date(ag - 2 * 3600000).toISOString(), ag), 'há 2 h');
  assert.equal(U.relativa('2026-10-13T10:00:00Z', ag), 'hoje');
  assert.equal(U.relativa('2026-10-12T20:00:00Z', ag), 'ontem');
  assert.equal(U.relativa('2026-10-10T20:00:00Z', ag), 'há 3 dias');
  assert.equal(U.relativa('2026-08-01T20:00:00Z', ag), '01/08/2026');
  assert.equal(U.relativa('', ag), '');
});

test('WhatsApp: wa.me só com dígitos e texto codificado', () => {
  assert.equal(U.whatsapp('+55 (95) 99123-4567', 'Olá, tudo bem? & mais'), 'https://wa.me/5595991234567?text=Ol%C3%A1%2C%20tudo%20bem%3F%20%26%20mais');
  assert.equal(U.whatsapp('', 'x'), '');
  assert.equal(U.whatsapp('javascript:alert(1)'), 'https://wa.me/1');
  assert.equal(U.compartilharWhatsapp('Vaga: caixa'), 'https://wa.me/?text=Vaga%3A%20caixa');
});

test('textos gerados: t() preenche variáveis, chave ausente vira texto vazio, nada de "{{" na tela', () => {
  assert.equal(T.t('avisos.nunca_pague'), 'Nunca pague para se candidatar. Se alguém pedir em nosso nome, é golpe.');
  assert.equal(T.t('avisos.selo_nota', { nota: 82, margem: 10 }), 'Nota 82 de 100 (15 questões; margem de cerca de ±10 pontos)');
  assert.equal(T.t('avisos.nao_existe'), '');
  assert.equal(T.t('avisos'), '', 'só texto');
  assert.doesNotMatch(T.t('avisos.cidade_pausada', {}), /\{\{/);
  assert.equal(U.t('botoes.quero'), 'Quero');
  assert.ok(TC.consentimentos.aceites.pessoa_cadastro.texto.includes('18 anos'));
  assert.equal(TC.consentimentos.termosVersao, R.VERSAO_TERMOS);
  assert.ok(TC.moderacao.motivos.anuncio_sem_valor.texto_empresa);
  assert.ok(TC.anuncio.campos && TC.referencia.vinculos);
});

test('textos gerados: só o que as telas usam (sem regra do servidor, sem lista duplicada, sem fase 2)', async () => {
  const M = await import('../scripts/montar-vagas.mjs');
  const basicos = M.textosBasicos();
  assert.deepEqual(Object.keys(basicos).sort(), ['avisos', 'botoes', 'validacao', 'versao'], 'mensagem.* e foto.* só nas telas com conta (peso da lista)');
  assert.equal(basicos.avisos.denuncia_motivos, undefined, 'motivos de denúncia: fonte única em VAGAS_REGRAS');
  const conta = M.textosDaConta();
  assert.equal(conta.mensagem.padroes, undefined, 'expressões do filtro ficam no servidor e em regras.js');
  assert.ok(conta.mensagem.aviso_empresa && conta.foto.explicacao);
  assert.equal(conta.foto.em_moderacao, undefined, 'fase 2');
  assert.equal(conta.foto.recusada_moderacao, undefined, 'fase 2');
  assert.equal(conta.anuncio.termos_proibidos, undefined);
  assert.equal(conta.anuncio.bloqueios, undefined);
  assert.equal(conta.referencia.pontos_fortes, undefined, 'pontos fortes: VAGAS_REGRAS.PONTOS_FORTES');
  for (const a of Object.values(conta.consentimentos.aceites)) assert.equal(a.base_legal, undefined);
  for (const k of Object.keys(basicos.avisos)) assert.ok(!k.startsWith('_'), k);
  assert.deepEqual(M.conferirGerados(), [], 'textos.js, textos-conta.js, termos.html e privacidade.html em dia');
});

test('Markdown dos termos: tudo escapado; link só http(s), mailto ou página do site; tabela, lista, títulos', async () => {
  const M = await import('../scripts/montar-vagas.mjs');
  const html = M.markdownParaHtml('# Título <b>\n\nTexto **forte** e `código` <script>alert(1)</script>.\n\n- um\n- [dois](javascript:alert(1))\n\n1. [três](termos.html)\n\n| A | B |\n|---|---|\n| <i>x</i> | y |\n\n> nota\n\n---');
  assert.match(html, /<h1>Título &lt;b&gt;<\/h1>/);
  assert.match(html, /<strong>forte<\/strong>/);
  assert.match(html, /<code>código<\/code>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|javascript:|<i>/);
  assert.match(html, /<li>dois\)?<\/li>/, 'link perigoso vira texto');
  assert.match(html, /<a href="termos.html">três<\/a>/);
  assert.match(html, /<table><thead><tr><th>A<\/th><th>B<\/th><\/tr><\/thead><tbody><tr><td>&lt;i&gt;x&lt;\/i&gt;<\/td><td>y<\/td><\/tr><\/tbody><\/table>/);
  assert.match(html, /<blockquote><p>nota<\/p><\/blockquote>/);
  assert.match(html, /<hr>/);
  const pag = M.paginaDocumento({ titulo: 'Termos de uso', descricao: 'd', md: '> **MINUTA · para revisão do(a) advogado(a) antes de publicar**\n\n# Termos\n\nTexto.' });
  assert.match(pag, /Minuta, em revisão jurídica\./);
  assert.match(pag, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(pag, /<blockquote>.*MINUTA/, 'a nota vira a faixa (não aparece duas vezes)');
  const final = M.paginaDocumento({ titulo: 'T', descricao: 'd', md: '# Termos\n\nTexto.' });
  assert.doesNotMatch(final, /Minuta, em revisão jurídica/, 'sem MINUTA no arquivo, sem faixa');
});

test('termos.html e privacidade.html gerados: CSP, marca, sem script além do endereço, faixa de minuta enquanto for minuta', () => {
  for (const rel of ['termos.html', 'privacidade.html']) {
    assert.deepEqual(TELA.conferirPagina(rel).filter((p) => !/nome de cidade/.test(p)), [], rel);
    const html = fs.readFileSync(path.join(TELA.VAGAS, rel), 'utf8');
    assert.match(html, /Minuta, em revisão jurídica/);
    assert.match(html, /alt="Gestão sem Caos"/);
    assert.deepEqual([...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]), ['js/endereco.js']);
  }
});

test('conversa: situação de cada momento (convite, Combinou, cortado, encerrada, só leitura) e quem pode escrever', () => {
  const base = { conversa: { id: 'v', status: 'aberta' }, podeEscrever: true, contatoCortado: false };
  assert.deepEqual(C.estadoDe(Object.assign({}, base, { status: 'conversar' }), 'pessoa'), { status: 'conversar', modo: 'convite', podeEscrever: true, faixa: '' });
  assert.equal(C.estadoDe(Object.assign({}, base, { status: 'combinou' }), 'empresa').modo, 'combinou');
  assert.equal(C.estadoDe(Object.assign({}, base, { status: 'contratada' }), 'empresa').modo, 'contratada');
  assert.equal(C.estadoDe(Object.assign({}, base, { status: 'enviada' }), 'empresa').modo, 'aberta');
  const cortado = C.estadoDe(Object.assign({}, base, { status: 'combinou', contatoCortado: true, podeEscrever: false }), 'empresa');
  assert.equal(cortado.modo, 'cortado');
  assert.equal(cortado.faixa, 'A pessoa encerrou a conversa e deixou de compartilhar o contato.');
  assert.equal(C.estadoDe(Object.assign({}, base, { status: 'combinou', contatoCortado: true }), 'pessoa').podeEscrever, false);
  for (const st of ['retirada', 'recusada', 'agora_nao']) {
    const e = C.estadoDe(Object.assign({}, base, { status: st }), 'pessoa');
    assert.equal(e.modo, 'encerrada', st);
    assert.equal(e.podeEscrever, false, st);
  }
  assert.equal(C.estadoDe(Object.assign({}, base, { status: 'combinou', conversa: { status: 'encerrada' } }), 'pessoa').modo, 'encerrada');
  assert.equal(C.estadoDe({ status: 'enviada', conversa: null, podeEscrever: false }, 'pessoa').modo, 'sem_conversa');
  const leitura = C.estadoDe(Object.assign({}, base, { status: 'combinou' }), 'empresa', { somenteLeitura: 'Esta empresa está suspensa. Fale com a Gestão sem Caos.' });
  assert.equal(leitura.modo, 'somente_leitura');
  assert.equal(leitura.podeEscrever, false);
});

test('conversa: linhas (minha/sistema/outra, hora), pendentes no fim até o servidor confirmar, filtro igual ao do banco', () => {
  const ms = [{ id: '1', autor: 'empresa', texto: 'Oi', em: '2026-10-13T15:00:00Z', minha: false }, { id: '2', autor: 'sistema', texto: 'Combinou!', em: 'x' },
    { id: '3', autor: 'pessoa', texto: 'Olá', em: '2026-10-13T15:05:00Z', minha: true }];
  const l = C.linhasDe(ms, (iso) => 'h:' + iso.slice(11, 16));
  assert.deepEqual(l.map((x) => x.classe), ['vg-msg', 'vg-msg vg-msg--sistema', 'vg-msg vg-msg--minha']);
  assert.deepEqual(l.map((x) => x.hora), ['h:15:00', '', 'h:15:05']);
  const pend = [{ id: '3', texto: 'Olá', minha: true, pendente: true }, { id: '4', texto: 'Tudo bem?', minha: true, pendente: true, semInternet: true }];
  const junto = C.mesclar(ms, pend);
  assert.deepEqual(junto.map((m) => m.id), ['1', '2', '3', '4'], 'a pendente já confirmada não duplica');
  assert.equal(C.linhasDe(junto)[3].hora, 'Sem internet. Vamos enviar assim que voltar.');
  assert.match(C.linhasDe(junto)[3].classe, /vg-msg--pendente/);
  assert.equal(C.validarTexto('   '), 'Escreva a mensagem.');
  assert.equal(C.validarTexto('x'.repeat(1001)), 'A mensagem pode ter até 1.000 caracteres.');
  assert.equal(C.validarTexto('Me manda o Pix da taxa'), R.conferirTexto('Me manda o Pix da taxa', 'mensagem').erro);
  assert.match(C.validarTexto('me chama no 95 99123-4567'), /^Mensagem bloqueada: telefone/);
  assert.equal(C.validarTexto('Podemos conversar amanhã às 9h?'), '');
});

test('entrar: destino (voltar validado, currículo incompleto, empresa, operação) e aceite do 1º acesso', () => {
  const pessoa = (completo) => ({ conta: { tipo: 'pessoa', termosVersao: '2026-10-13' }, pessoa: { completo } });
  assert.equal(E.destinoDe(pessoa(true), 'vaga.html?vaga=K7M2QX', 'boa-vista-rr'), 'vaga.html?vaga=K7M2QX');
  assert.equal(E.destinoDe(pessoa(true), 'https://golpe.com', 'boa-vista-rr'), 'cidade.html?cidade=boa-vista-rr');
  assert.equal(E.destinoDe(pessoa(true), 'entrar.html', ''), 'index.html', 'nunca volta para o próprio entrar');
  assert.equal(E.destinoDe(pessoa(false), '', 'boa-vista-rr'), 'eu.html#curriculo/1');
  assert.equal(E.destinoDe({ conta: { tipo: 'empresa', termosVersao: 'x' } }, ''), 'empresa.html#inicio');
  assert.equal(E.destinoDe({ conta: { tipo: 'operador', termosVersao: 'x' } }, ''), 'operador.html#fila');
  assert.equal(E.destinoDe({ conta: null, admin: true }, ''), 'operador.html#fila');
  assert.equal(E.aceiteDaConta({ conta: { tipo: 'pessoa', termosVersao: '' } }), 'pessoa_cadastro_assistido');
  assert.equal(E.aceiteDaConta({ conta: { tipo: 'empresa', termosVersao: '' } }), 'empresa_cadastro');
  assert.equal(E.aceiteDaConta({ conta: { tipo: 'operador', termosVersao: '' } }), 'operador_contrato');
  assert.equal(E.aceiteDaConta({ conta: { tipo: 'pessoa', termosVersao: '2026-10-13' } }), '');
  for (const k of ['pessoa_cadastro', 'pessoa_cadastro_assistido', 'empresa_cadastro', 'operador_contrato']) assert.ok(TC.consentimentos.aceites[k], k);
});

test('entrar: convite de equipe (?convite=<64 hex>) leva para o aceite da empresa e sobrevive à limpeza do token_hash', () => {
  const tk = 'ab'.repeat(32);
  assert.equal(E.conviteValido(tk.toUpperCase()), tk);
  for (const ruim of ['', 'abc', 'g'.repeat(64), tk + '0', null, 42, tk + '"><b>']) assert.equal(E.conviteValido(ruim), '', String(ruim));
  assert.equal(E.conviteDaUrl({ search: '?convite=' + tk }), tk);
  assert.equal(E.conviteDaUrl({ search: '?token_hash=abcdefgh12&type=invite&convite=' + tk.toUpperCase() }), tk);
  assert.equal(E.conviteDaUrl({ search: '?convite=' + tk + 'x' }), '');
  assert.equal(E.conviteDaUrl({ search: '?convite=' + tk }, { conviteDoEndereco: () => 'zz' }), '', 'o da API também passa pela validação');
  assert.equal(E.conviteDaUrl({ search: '' }, { conviteDoEndereco: () => tk }), tk, 'usa VAGAS_API.conviteDoEndereco quando existe');
  const empresa = { conta: { tipo: 'empresa', termosVersao: 'x' } };
  assert.equal(E.destinoDe(empresa, '', '', tk), 'empresa.html?convite=' + tk);
  assert.equal(E.destinoDe(empresa, 'vaga.html?vaga=K7M2QX', '', tk), 'empresa.html?convite=' + tk, 'o convite vale sobre o voltar');
  assert.equal(E.destinoDe(empresa, '', '', 'nao-e-token'), 'empresa.html#inicio');
  assert.equal(E.destinoDe({ conta: null, admin: true }, '', '', tk), 'operador.html#fila');
  assert.equal(E.enderecoLimpo({ empresa: true, voltar: 'vaga.html?vaga=K7M2QX', convite: tk }), 'entrar.html?tipo=empresa&voltar=vaga.html%3Fvaga%3DK7M2QX&convite=' + tk);
  assert.equal(E.enderecoLimpo({ convite: tk }), 'entrar.html?convite=' + tk);
  assert.equal(E.enderecoLimpo({ convite: 'x' }), 'entrar.html');
});

test('entrar: validação de criar conta, cadastro da empresa e senha nova (mensagens da tela)', () => {
  assert.deepEqual(E.validarCriar({ nome: 'Ana', email: 'ana@exemplo.com', termos: true }), {});
  assert.deepEqual(E.validarCriar({ nome: 'A', email: 'ana@exemplo', termos: false }),
    { nome: 'Escreva o seu nome', email: 'Esse e-mail parece incompleto. Confira se tem o ".com" no fim.', termos: 'Marque a caixa para continuar' });
  const cnpj = '11.222.333/0001-81';
  assert.ok(R.cnpjValido(cnpj));
  assert.deepEqual(E.validarEmpresa({ cnpj, nome: 'Loja Nova', responsavel: 'Marcos', email: 'm@loja.com', whatsapp: '(95) 99999-0000', termos: true }), {});
  const e = E.validarEmpresa({ cnpj: '11.222.333/0001-00', nome: '', responsavel: '', email: 'x', whatsapp: '123', termos: false });
  assert.deepEqual(Object.keys(e).sort(), ['cnpj', 'email', 'nome', 'responsavel', 'termos', 'whatsapp']);
  assert.equal(e.cnpj, 'CNPJ inválido. Confira os 14 números.');
  assert.equal(E.validarEmpresa({ cnpj, nome: 'Loja', responsavel: 'M', email: 'm@l.com', whatsapp: '', termos: true }).whatsapp, undefined, 'WhatsApp é opcional');
  assert.equal(E.mascaraCnpj('11222333000181'), '11.222.333/0001-81');
  assert.equal(E.mascaraCnpj('1122'), '11.22');
  assert.deepEqual(E.validarNovaSenha('1234567', '1234567'), { campo: 'senha', erro: 'A senha precisa ter de 8 a 72 caracteres.' });
  assert.deepEqual(E.validarNovaSenha('12345678', '12345679'), { campo: 'confirmar', erro: 'As senhas não são iguais.' });
  assert.equal(E.validarNovaSenha('12345678', '12345678'), null);
  assert.equal(E.validarNovaSenha('x'.repeat(73), 'x'.repeat(73)).campo, 'senha');
});

test('páginas e scripts da casca: CSP, ordem dos scripts, nada inline, sem innerHTML, sem palavra proibida nem cidade fixa', () => {
  for (const p of ['entrar.html']) assert.deepEqual(TELA.conferirPagina(p), [], p);
  for (const s of ['js/ui.js', 'js/ui-area.js', 'js/pecas.js', 'js/pecas-pessoa.js', 'js/conversa.js', 'js/entrar.js']) {
    assert.deepEqual(TELA.conferirScript(s), [], s);
  }
  // Os textos gerados trazem "DISC" só nos avisos da tela Contratada (avisos.combinou_contratada, avisos.disc_fora).
  for (const s of ['js/textos.js', 'js/textos-conta.js']) assert.deepEqual(TELA.conferirScript(s, { permitirDisc: true }), [], s);
  const css = TELA.semComentarios(fs.readFileSync(path.join(TELA.VAGAS, 'assets/vagas.css'), 'utf8') + fs.readFileSync(path.join(TELA.VAGAS, 'assets/vagas-pc.css'), 'utf8'));
  const liberadas = new Set(['#f34405', '#f2762e', '#ff9f40', '#324e73', '#13283f', '#141414', '#f2f2f2', '#c43803', '#eaeef4', '#e2e6ec', '#6b7586',
    '#46546a', '#e9ecef', '#8a97ab', '#5d7699', '#c5ccd6', '#fff', '#ffffff', '#dc2626', '#fef2f2', '#fca5a5', '#047857', '#065f46', '#ecfdf5', '#b91c1c']);
  for (const m of css.matchAll(/#([0-9a-fA-F]{3,8})\b/g)) assert.ok(liberadas.has(m[0].toLowerCase()), 'cor fora da paleta: ' + m[0]);
  for (const m of css.matchAll(/font-size\s*:\s*([0-9.]+)px/g)) assert.ok([11, 12, 13, 15, 16, 18, 24, 28, 32, 44].includes(Number(m[1])), 'fonte ' + m[1]);
  for (const m of css.matchAll(/font-weight\s*:\s*(\w+)/g)) assert.ok(['400', '600', '700', 'inherit'].includes(m[1]), 'peso ' + m[1]);
});

test('o cartão cego e as peças não leem nome, foto nem contato; P1 só "sim"; selo com a margem e sem "aprovado"', () => {
  const src = TELA.semComentarios(fs.readFileSync(path.join(TELA.VAGAS, 'js/pecas-pessoa.js'), 'utf8'));
  const cego = src.slice(src.indexOf('function cartaoCego'), src.indexOf('function vinculo'));
  assert.ok(cego.length > 200);
  assert.doesNotMatch(cego, /\bc\.(nome|foto|fotoUrl|whatsapp|email|idade|sobre|referencias)\b/, 'cartão cego só lê campos permitidos');
  assert.match(src, /Referência de empresa verificada: sim/);
  assert.doesNotMatch(src, /pontosFortes[^;]*cartaoCego|referencias\.total/);
});
