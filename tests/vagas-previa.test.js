'use strict';
// Vagas sem Caos — prévia (vagas/js/api-previa.js): o "banco" de mentira do navegador precisa ter TODAS as RPCs da migração,
// as MESMAS mensagens e as mesmas regras de privacidade (cartão cego, Combinou, cortar acesso, referência com os vetos
// P1/P2 da psicologia), com dados fictícios de Uruaçu (GO) e nada da marca Notus.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PREVIA = require('../vagas/js/api-previa.js');
const API = require('../vagas/js/api.js');
const R = require('../vagas/js/regras.js');

const RAIZ = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '20261022120000_vagas.sql'), 'utf8') +
  fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '20261024120000_vagas_onda2.sql'), 'utf8');
const AGORA = Date.parse('2026-10-13T15:00:00Z');

function memoria() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}
function novo(op) {
  let t = AGORA;
  const b = PREVIA.criarBackend(Object.assign({ armazenamento: memoria(), agora: () => (t += 1000) }, op || {}));
  return b;
}
async function ok(p) { const r = await p; assert.equal(r.ok, true, r && r.erro); return r; }
async function erro(p, msg) { const r = await p; assert.equal(r.ok, false, JSON.stringify(r)); if (msg instanceof RegExp) assert.match(r.erro, msg); else assert.equal(r.erro, msg); return r; }
const entrar = (b, email) => ok(b.conta.entrar(email, PREVIA.SENHA_PREVIA));

test('semente: 15 empresas, 40 pessoas, 30 vagas + 1 rascunho, 3 confidenciais, 2 em revisão — tudo fictício e sem "Notus"', () => {
  const st = novo().estado();
  assert.equal(st.empresas.length, 15);
  assert.equal(Object.keys(st.pessoas).length, 40);
  assert.equal(st.anuncios.length, 31);
  assert.equal(st.anuncios.filter((a) => a.status === 'rascunho').length, 1);
  assert.equal(st.anuncios.filter((a) => a.confidencial).length, 3);
  assert.equal(st.anuncios.filter((a) => a.status === 'em_revisao').length, 2);
  assert.deepEqual([...new Set(st.anuncios.map((a) => a.modalidade))].sort(), ['clt', 'diaria', 'estagio', 'freelancer', 'temporario']);
  for (const e of st.empresas) {
    assert.ok(e.razaoSocial.endsWith('(prévia)'), e.razaoSocial);
    assert.ok(e.cnpj.startsWith('PV') && R.cnpjValido(e.cnpj), e.cnpj);
  }
  assert.ok(st.anuncios.every((a) => a.valor.minCentavos >= 100), 'salário sempre informado');
  // Praça piloto Uruaçu (GO) aberta na prévia (em produção ela nasce em lista de espera); Campinorte é entorno e Niquelândia
  // está em lista de espera — as duas vizinhas existem SÓ na prévia, para a tela mostrar os dois casos.
  assert.deepEqual(st.cidades.map((c) => [c.slug, c.status, c.praca, c.porte, c.fuso]), [['uruacu-go', 'ativa', null, 'pequena', 'America/Sao_Paulo'],
    ['campinorte-go', 'ativa', 'uruacu-go', null, 'America/Sao_Paulo'], ['niquelandia-go', 'lista_espera', null, null, 'America/Sao_Paulo']]);
  assert.deepEqual(st.cidades.map((c) => c.ibge), ['5221601', '5204706', '5214606']);
  // Zonas de Uruaçu: a lista da operação, inclusive as vazias; toda vaga, empresa e pessoa usa uma zona da própria cidade.
  assert.deepEqual(st.zonas.filter((z) => z.cidade === 'uruacu-go').map((z) => [z.slug, z.bairros.length]),
    [['centro', 4], ['regiao-norte', 1], ['regiao-sul', 2], ['regiao-leste', 0], ['regiao-oeste', 0], ['zona-rural', 3]]);
  const temZona = (cid, z) => z == null || st.zonas.some((x) => x.cidade === cid && x.slug === z);
  for (const a of st.anuncios) assert.ok(temZona(a.cidade, a.zona), a.titulo + ' ' + a.zona);
  for (const e of st.empresas) assert.ok(temZona(e.cidade, e.zona), e.nomeFantasia + ' ' + e.zona);
  for (const uid of Object.keys(st.pessoas)) assert.ok(temZona(st.pessoas[uid].cidade, st.pessoas[uid].zona), uid);
  assert.ok(!/boa vista|boa-vista|roraima|-rr\b/i.test(JSON.stringify(st)), 'nada da cidade fictícia antiga');
  const tudo = JSON.stringify(st);
  assert.ok(!/notus/i.test(tudo));
  for (const r of st.referencias) assert.ok(r.pontosFortes.every((p) => R.PONTOS_FORTES.some((x) => x.id === p)), r.pontosFortes.join());
  assert.ok(!/notus/i.test(fs.readFileSync(path.join(RAIZ, 'vagas', 'js', 'api-previa.js'), 'utf8')));
});

test('a prévia tem TODAS as RPCs públicas da migração (e as do contrato de vagas/js/api.js), com as mesmas mensagens', () => {
  const b = novo();
  const doBanco = [...SQL.matchAll(/create or replace function public\.(vagas_[a-z_0-9]+)/g)].map((m) => m[1])
    .filter((f) => !['vagas_ids_minhas_empresas', 'vagas_ids_minhas_cidades', 'vagas_sou_pessoa', 'vagas_conta_limite', 'vagas_conta_consultar',
      'vagas_conta_registrar', 'vagas_conta_quem', 'vagas_conta_foto', 'vagas_conta_convite_equipe', 'vagas_iniciar_tentativa'].includes(f));
  for (const f of doBanco) assert.ok(b.RPCS.includes(f), 'falta na prévia: ' + f);
  for (const def of Object.values(API.METODOS)) assert.ok(b.RPCS.includes(def.rpc), 'falta na prévia (api.js): ' + def.rpc);
  // Mensagens: cada erro da prévia existe igual no banco, na Edge Function ou no cliente (exceto o do selo, que é da 20261023).
  const fonte = fs.readFileSync(path.join(RAIZ, 'vagas', 'js', 'api-previa.js'), 'utf8');
  const outras = fs.readFileSync(path.join(RAIZ, 'supabase', 'funcoes-compartilhadas', 'vagas-conta.js'), 'utf8') +
    fs.readFileSync(path.join(RAIZ, 'vagas', 'js', 'api.js'), 'utf8');
  const soDosTestes = ['Selo não encontrado. Confira o código.'];
  for (const m of new Set([...fonte.matchAll(/erro\('([^']+)'/g)].map((x) => x[1]))) {
    assert.ok(SQL.includes(m) || outras.includes(m) || soDosTestes.includes(m), 'mensagem só da prévia: ' + m);
  }
});

test('mural público e lista de espera: Uruaçu com o entorno; Niquelândia em lista de espera; vaga pelo código', async () => {
  const b = novo();
  const mural = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go' } }));
  assert.equal(mural.anuncios.length, 20);
  assert.ok(mural.proximo);
  const conf = mural.anuncios.filter((a) => a.empresa.confidencial);
  assert.ok(conf.every((a) => a.empresa.nome === 'Empresa confidencial' && a.empresa.iniciais === ''));
  const espera = await erro(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'niquelandia-go' } }), R.MSG.CIDADE_FECHADA);
  assert.equal(espera.listaEspera, true);
  const hoje = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go', paraHoje: true } }));
  assert.ok(hoje.anuncios.length >= 1 && hoje.anuncios.every((a) => a.modalidade === 'diaria' && a.paraHoje));
  const det = await ok(b.rpc('vagas_anuncio_publico', { p_codigo: mural.anuncios[0].codigo.toLowerCase() }));
  assert.equal(det.anuncio.codigo, mural.anuncios[0].codigo);
  await erro(b.rpc('vagas_anuncio_publico', { p_codigo: 'ZZZZZZ' }), R.MSG.VAGA_FORA);
  // Vista: 1 por navegador por dia.
  assert.equal((await ok(b.rpc('vagas_anuncio_vista', { p_codigo: det.anuncio.codigo }))).contada, true);
  assert.equal((await ok(b.rpc('vagas_anuncio_vista', { p_codigo: det.anuncio.codigo }))).contada, false);
});

test('fluxo: Quero → cartão cego → conversa sem dados → golpe bloqueado → Combinou → contato → quem viu → cortar e liberar', async () => {
  const b = novo();
  const st = b.estado();
  const repositor = st.anuncios.find((a) => a.titulo === 'Repositor(a) de mercadorias');
  await entrar(b, 'pessoa@previa.com');
  const q = await ok(b.rpc('vagas_quero', { p_anuncio: repositor.id }));
  const cand = q.candidatura.id;
  await ok(b.conta.sair());
  await entrar(b, 'empresa@previa.com');
  const cartoes = await ok(b.rpc('vagas_cartoes', { p_anuncio: repositor.id, p_filtro: {} }));
  const meu = cartoes.cartoes.find((c) => c.candidaturaId === cand);
  const txt = JSON.stringify(meu);
  for (const v of ['Ana', 'Ribeiro', 'pessoa@previa.com', 'Empregador fictício', '55959']) assert.ok(!txt.includes(v), v);
  assert.equal(meu.cartao.temReferencia, true, 'Ana tem referência aceita de empresa verificada');
  assert.deepEqual(Object.keys(meu.cartao).filter((k) => /refer/i.test(k)), ['temReferencia']);
  await erro(b.rpc('vagas_contato_pessoa', { p_candidatura: cand }), 'O contato só aparece depois do Combinou.');
  await erro(b.rpc('vagas_mensagem_enviar', { p_candidatura: cand, p_texto: 'Faça um Pix de R$ 20 para garantir a vaga', p_id: null }),
    /^Mensagem bloqueada: ninguém paga/);
  await ok(b.rpc('vagas_mensagem_enviar', { p_candidatura: cand, p_texto: 'Olá! Podemos conversar sobre a vaga?', p_id: null }));
  const conv = await ok(b.rpc('vagas_conversa', { p_candidatura: cand }));
  assert.equal(conv.outroLado, 'Pessoa candidata');
  await ok(b.conta.sair());
  await entrar(b, 'pessoa@previa.com');
  const comb = await ok(b.rpc('vagas_combinar', { p_candidatura: cand }));
  assert.equal(comb.candidatura.status, 'combinou');
  assert.equal(comb.empresa.nome, 'Mercadinho Sol do Norte');
  await ok(b.conta.sair());
  await entrar(b, 'empresa@previa.com');
  const ct = await ok(b.rpc('vagas_contato_pessoa', { p_candidatura: cand }));
  assert.equal(ct.pessoa.nome, 'Ana Clara Ribeiro');
  const numeros = await ok(b.rpc('vagas_anuncio_numeros', { p_anuncio: repositor.id }));
  assert.deepEqual(Object.keys(numeros.numeros), ['vistas', 'quero', 'comSelo', 'conversas', 'combinou', 'contratadas']);
  assert.equal(numeros.numeros.combinou, 1);
  await ok(b.conta.sair());
  await entrar(b, 'pessoa@previa.com');
  let viu = (await ok(b.rpc('vagas_quem_viu_meu_contato', {}))).acessos.find((a) => a.candidaturaId === cand);
  assert.deepEqual([viu.empresa, viu.vezes, viu.podeCortar], ['Mercadinho Sol do Norte', 1, true]);
  const corte = await ok(b.rpc('vagas_cortar_acesso', { p_candidatura: cand }));
  assert.ok(corte.candidatura.contatoCortadoEm);
  await ok(b.conta.sair());
  await entrar(b, 'empresa@previa.com');
  const sem = await erro(b.rpc('vagas_contato_pessoa', { p_candidatura: cand }), 'A pessoa deixou de compartilhar o contato com a sua empresa.');
  assert.equal(sem.contatoCortado, true);
  assert.equal((await ok(b.rpc('vagas_conversa', { p_candidatura: cand }))).podeEscrever, false);
  await ok(b.conta.sair());
  await entrar(b, 'pessoa@previa.com');
  assert.equal((await ok(b.rpc('vagas_combinar', { p_candidatura: cand }))).duplicado, false, 'liberar de novo');
  viu = (await ok(b.rpc('vagas_quem_viu_meu_contato', {}))).acessos.find((a) => a.candidaturaId === cand);
  assert.equal(viu.podeCortar, true);
});

test('referência — veto P2: ocultar e remover não mudam nada do que a empresa autora vê', async () => {
  const b = novo();
  const st = b.estado();
  const restaurante = st.empresas.find((e) => e.nomeFantasia === 'Restaurante Sabor da Terra');
  const ref = st.referencias.find((r) => r.empresaId === restaurante.id);
  const kComb = st.candidaturas.find((k) => k.empresaId === restaurante.id && k.status === 'combinou');
  const foto = async () => {
    await ok(b.conta.sair());
    await entrar(b, 'empresa6@previa.com');
    const f = {
      dadas: await b.rpc('vagas_referencias_empresa', { p_empresa: restaurante.id }),
      cartoes: await b.rpc('vagas_cartoes', { p_anuncio: kComb.anuncioId, p_filtro: {} }),
      contato: await b.rpc('vagas_contato_pessoa', { p_candidatura: kComb.id }),
      oferta: await b.rpc('vagas_referencia_oferecer', { p_dados: { empresaId: restaurante.id, candidaturaId: kComb.id, funcao: 'Cozinheira',
        vinculo: 'clt', inicio: '2024-01', pontosFortes: ['equipe'], declaracao: true } }),
      denuncia: await b.rpc('vagas_denunciar', { p_dados: { alvo: 'referencia', id: ref.id, motivo: 'falsa' } })
    };
    await ok(b.conta.sair());
    await entrar(b, 'pessoa@previa.com');
    return f;
  };
  await entrar(b, 'pessoa@previa.com');
  const antes = await foto();
  assert.equal(antes.dadas.referencias[0].status, 'aceita');
  assert.ok(antes.dadas.referencias[0].aceitaEm);
  assert.ok(!('respondidaEm' in antes.dadas.referencias[0]));
  assert.equal(antes.cartoes.cartoes[0].cartao.temReferencia, true);
  assert.equal(antes.contato.pessoa.referencias.length, 1);
  assert.equal(antes.oferta.erro, 'Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de pedido de referência.');
  assert.equal(antes.denuncia.erro, 'Referência não encontrada.');
  for (const acao of ['ocultar', 'mostrar', 'ocultar', 'remover']) {
    await ok(b.rpc('vagas_referencia_responder', { p_referencia: ref.id, p_acao: acao }));
    assert.deepEqual(await foto(), antes, acao);
  }
  // Para as outras empresas, a ocultação vale.
  await ok(b.conta.sair());
  await entrar(b, 'empresa@previa.com');
  const repositorConf = st.candidaturas.find((k) => k.pessoaId === kComb.pessoaId && k.empresaId !== restaurante.id && k.status === 'conversar');
  const outros = await ok(b.rpc('vagas_cartoes', { p_anuncio: repositorConf.anuncioId, p_filtro: {} }));
  assert.equal(outros.cartoes.find((c) => c.candidaturaId === repositorConf.id).cartao.temReferencia, false);
});

test('conta na prévia: cadastro sem senha → link → criar senha → entrar; respostas neutras; selo fictício conferível', async () => {
  const b = novo();
  const c = await ok(b.conta.cadastrar({ email: 'nova@exemplo.com', tipo: 'pessoa', termosVersao: R.VERSAO_TERMOS }));
  assert.equal(c.mensagem, 'Se este e-mail puder ser usado, você vai receber um link em instantes. Confira também a caixa de spam.');
  assert.match(c.linkPrevia, /^entrar\.html\?token_hash=previa[0-9a-f]+&type=invite$/);
  const repetido = await ok(b.conta.cadastrar({ email: 'pessoa@previa.com', tipo: 'pessoa' }));
  assert.equal(repetido.mensagem, c.mensagem, 'não revela que o e-mail já existe');
  await erro(b.conta.entrar('nova@exemplo.com', 'qualquer'), 'E-mail ou senha não conferem.');
  const link = API.linkDoEndereco({ search: '?' + c.linkPrevia.split('?')[1] });
  assert.equal((await ok(b.conta.confirmarLink(link))).precisaSenha, true);
  await erro(b.conta.definirSenha('curta'), 'A senha precisa ter de 8 a 72 caracteres.');
  await ok(b.conta.definirSenha('senha-boa-123'));
  await ok(b.conta.sair());
  const eu = await ok(b.conta.entrar('nova@exemplo.com', 'senha-boa-123'));
  assert.equal(eu.conta.tipo, 'pessoa');
  await erro(b.conta.confirmarLink(link), 'O link expirou ou já foi usado. Peça outro na tela de entrada.');
  const selo = await ok(b.rpc('vagas_selo_publico', { p_codigo: 'q8v3-n2kd' }));
  assert.deepEqual([selo.selo.teste, selo.selo.situacao, selo.selo.supervisao], ['atendimento', 'valido', 'online']);
  assert.ok(!('nomePessoa' in selo.selo) && !JSON.stringify(selo).includes('Ana'));
  await erro(b.rpc('vagas_selo_publico', { p_codigo: 'AAAA-AAAA' }), 'Selo não encontrado. Confira o código.');
});

test('adaptador prévia de vagas/js/api.js: mesmos métodos, resolve {ok:true} e rejeita com Error em português', async () => {
  const api = API.criar({ modo: 'previa', backend: novo() });
  assert.equal(api.modo, 'previa');
  for (const m of Object.keys(API.METODOS)) assert.equal(typeof api[m], 'function', m);
  const cidades = await api.cidades();
  assert.equal(cidades.cidades[0].slug, 'uruacu-go');
  await assert.rejects(api.eu(), (e) => e.message === 'Sessão expirada. Entre de novo.' && e.sessaoExpirada === true);
  await api.entrar('pessoa@previa.com', PREVIA.SENHA_PREVIA);
  const minha = await api.minhaPessoa();
  assert.equal(minha.cartao.temReferencia, true);
  await assert.rejects(api.cartoes('x', {}), (e) => e.message === 'Esta área é para empresas.');
  const err = await api.anuncio('ZZZZZZ').catch((e) => e);
  assert.equal(err.naoEncontrada, true);
});

test('vaga como produto na prévia: filtros da lista (áreas, turno, salário mensal, sem experiência, total), áreas do currículo e vaga assistida', async () => {
  const b = novo();
  const todas = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go', limite: 20 } }));
  assert.ok(todas.anuncios.every((a) => a.area && a.area.nome && a.funcao && a.turno && a.experiencia));
  const total = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go', somenteTotal: true } }));
  assert.ok(total.total > 20 && !('anuncios' in total));
  const caixa = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go', areas: ['caixa'] } }));
  assert.ok(caixa.anuncios.length >= 1 && caixa.anuncios.every((a) => a.area.slug === 'caixa'));
  const noite = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go', turno: ['noite'] } }));
  assert.ok(noite.anuncios.length >= 1 && noite.anuncios.every((a) => a.turno === 'noite'));
  const sal = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go', salarioMin: 220000 } }));
  const mensal = (a) => (a.valor.maxCentavos != null ? a.valor.maxCentavos : a.valor.minCentavos) * ({ mes: 1, dia: 22, hora: 220 }[a.valor.unidade] || 0);
  assert.ok(sal.anuncios.length >= 1 && sal.anuncios.every((a) => mensal(a) >= 220000));
  const semExp = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go', semExperiencia: true } }));
  assert.ok(semExp.anuncios.length >= 1 && semExp.anuncios.every((a) => a.experiencia === 'nao_precisa'));
  const proibidos = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go', limite: 20, nota: 90, selo: 'caixa',
    temReferencia: true, idade: 30, sexo: 'f' } }));
  assert.deepEqual(proibidos.anuncios.map((a) => a.id), todas.anuncios.map((a) => a.id), 'nada de filtro por dado da pessoa');
  // Ana tem áreas no currículo: a lista abre nelas; "areas": [] mostra tudo.
  await entrar(b, 'pessoa@previa.com');
  const eu = await ok(b.rpc('vagas_pessoa_minha', {}));
  assert.deepEqual(eu.pessoa.areas, ['caixa', 'atendimento']);
  const feed = await ok(b.rpc('vagas_feed', { p_filtro: {} }));
  assert.equal(feed.areasPadrao, true);
  assert.ok(feed.anuncios.every((a) => ['caixa', 'atendimento'].indexOf(a.area.slug) >= 0));
  assert.equal((await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'uruacu-go', areas: [], somenteTotal: true } }))).total, total.total);
  // Vaga assistida pela operação: mesmos campos, publica direto.
  await ok(b.conta.sair());
  await entrar(b, 'operador@previa.com');
  const emp = b.estado().empresas[0];
  const v = await ok(b.rpc('vagas_op_anuncio_salvar', { p_dados: { empresaId: emp.id, area: 'limpeza', funcao: 'Auxiliar de limpeza', modalidade: 'clt',
    turno: 'manha', experiencia: 'nao_precisa', salarioDe: 162100, descricao: 'Limpeza das áreas da loja e do depósito, com escala combinada.', publicar: true } }));
  assert.deepEqual([v.anuncio.status, v.anuncio.area.slug, v.anuncio.titulo], ['publicado', 'limpeza', 'Auxiliar de limpeza']);
  assert.equal((await ok(b.rpc('vagas_areas_publicas', {}))).areas.length, 24);
});

test('foto opcional na prévia: só a pessoa grava; a empresa só vê depois do Combinou (contatoPessoa traz fotoUrl)', async () => {
  const api = API.criar({ modo: 'previa', backend: novo() });
  await api.entrar('pessoa@previa.com', PREVIA.SENHA_PREVIA);
  const FOTO = 'A foto precisa ser JPG, PNG ou WEBP, com até 1 MB.';
  await assert.rejects(api.enviarFoto({ type: 'image/gif', size: 100 }), (e) => e.message === FOTO);
  await assert.rejects(api.enviarFoto({ type: 'image/jpeg', size: 2 * 1024 * 1024 }), (e) => e.message === FOTO);
  assert.equal((await api.enviarFoto({ type: 'image/jpeg', size: 120000, dataUrl: 'data:image/jpeg;base64,AAAA' })).temFoto, true);
  const minha = await api.minhaPessoa();
  assert.equal(minha.pessoa.temFoto, true);
  assert.ok(!/foto/i.test(JSON.stringify(minha.cartao)), 'cartão cego sem foto');
  assert.equal((await api.fotoUrl()).url, 'data:image/jpeg;base64,AAAA');
  await api.sair();
  // Restaurante (Combinou com a Ana) vê; o Mercadinho (só "conversar") não.
  await api.entrar('empresa6@previa.com', PREVIA.SENHA_PREVIA);
  const rest = (await api.minhasEmpresas()).empresas[0];
  const comb = (await api.conversasDaEmpresa(rest.id)).conversas.find((c) => c.status === 'combinou');
  const ct = await api.contatoPessoa(comb.candidaturaId);
  assert.equal(ct.pessoa.temFoto, true);
  assert.equal(ct.pessoa.fotoUrl, 'data:image/jpeg;base64,AAAA');
  await api.sair();
  await api.entrar('empresa@previa.com', PREVIA.SENHA_PREVIA);
  const merc = (await api.minhasEmpresas()).empresas[0];
  const conversar = (await api.conversasDaEmpresa(merc.id)).conversas.find((c) => c.status === 'conversar');
  await assert.rejects(api.fotoUrl(conversar.candidaturaId), (e) => e.message === 'A foto só aparece depois do Combinou.');
  await assert.rejects(api.enviarFoto({ type: 'image/png', size: 1000 }), (e) => e.message === 'Esta área é para quem procura emprego.');
  await api.sair();
  await api.entrar('pessoa@previa.com', PREVIA.SENHA_PREVIA);
  await api.apagarFoto();
  assert.equal((await api.minhaPessoa()).pessoa.temFoto, false);
});

test('correções da revisão na prévia: lista de espera (contador aproximado, sair), devolver/recusar, vincular, empresa suspensa, temSelo ignorado, exportar, consentimento', async () => {
  const b = novo();
  const st = b.estado();
  // Lista de espera: contador aproximado (dezenas, até o dia anterior) — não muda com o e-mail de agora; sair da lista.
  const e1 = await ok(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: 'niquelandia-go', email: 'alvo@exemplo.com' } }));
  const e2 = await ok(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: 'niquelandia-go', email: 'alvo@exemplo.com' } }));
  const e3 = await ok(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: 'niquelandia-go', email: 'novo@exemplo.com' } }));
  assert.deepEqual([e1.interessados, e2.interessados, e3.interessados], [0, 0, 0]);
  const ror = async () => (await ok(b.rpc('vagas_cidades_publicas', {}))).cidades.find((c) => c.slug === 'niquelandia-go').interessados;
  assert.equal(await ror(), 0);
  for (let i = 0; i < 12; i++) st.listaEspera.push({ cidade: 'niquelandia-go', email: 'antiga' + i + '@exemplo.com', perfil: 'pessoa', criadoEm: AGORA - 2 * 86400000 });
  assert.equal(await ror(), 10, 'arredondado para baixo em dezenas');
  const antes = st.listaEspera.length;
  assert.deepEqual(await ok(b.rpc('vagas_lista_espera_sair', { p_dados: { cidade: 'niquelandia-go', email: 'alvo@exemplo.com' } })), { ok: true, cidade: 'niquelandia-go', removido: true });
  assert.deepEqual(await ok(b.rpc('vagas_lista_espera_sair', { p_dados: { cidade: 'niquelandia-go', email: 'ninguem@exemplo.com' } })), { ok: true, cidade: 'niquelandia-go', removido: true });
  assert.equal(st.listaEspera.length, antes - 1);
  // Operação: devolver a vaga (volta a rascunho com o motivo) e recusar a empresa (fica em análise com o motivo).
  await entrar(b, 'operador@previa.com');
  const emRevisao = st.anuncios.find((a) => a.status === 'em_revisao' && a.cidade === 'uruacu-go');
  await erro(b.rpc('vagas_op_anuncio_decidir', { p_anuncio: emRevisao.id, p_acao: 'devolver', p_motivo: '' }), 'Informe o motivo.');
  const dev = await ok(b.rpc('vagas_op_anuncio_decidir', { p_anuncio: emRevisao.id, p_acao: 'devolver', p_motivo: 'anuncio_sem_valor' }));
  assert.deepEqual([dev.anuncio.status, dev.anuncio.statusMotivo], ['rascunho', 'anuncio_sem_valor']);
  await erro(b.rpc('vagas_op_anuncio_decidir', { p_anuncio: emRevisao.id, p_acao: 'devolver', p_motivo: 'x' }), 'Esta vaga não está esperando a moderação.');
  const emAnalise = st.empresas.find((e) => e.status === 'em_analise' && e.cidade === 'uruacu-go');
  const rec = await ok(b.rpc('vagas_op_empresa_decidir', { p_empresa: emAnalise.id, p_acao: 'recusar', p_motivo: 'empresa_cnpj_nao_confere' }));
  assert.deepEqual([rec.empresa.status, rec.empresa.statusMotivo], ['em_analise', 'empresa_cnpj_nao_confere']);
  await erro(b.rpc('vagas_op_empresa_decidir', { p_empresa: st.empresas[0].id, p_acao: 'recusar', p_motivo: 'x' }), 'Só dá para recusar uma empresa em análise.');
  // Vincular membro: só empresa sem ninguém (cadastro assistido).
  await erro(b.rpc('vagas_op_vincular_membro', { p_empresa: st.empresas[0].id, p_email: 'empresa2@previa.com' }),
    'Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.');
  // Empresa suspensa não lê o contato nem a foto e não escreve na conversa.
  const restaurante = st.empresas.find((e) => e.nomeFantasia === 'Restaurante Sabor da Terra');
  const kComb = st.candidaturas.find((k) => k.empresaId === restaurante.id && k.status === 'combinou');
  await ok(b.rpc('vagas_op_empresa_decidir', { p_empresa: restaurante.id, p_acao: 'suspender', p_motivo: 'teste' }));
  await ok(b.conta.sair());
  await entrar(b, 'empresa6@previa.com');
  const ct = await erro(b.rpc('vagas_contato_pessoa', { p_candidatura: kComb.id }), 'Esta empresa está suspensa. Fale com a Gestão sem Caos.');
  assert.equal(ct.suspensa, true);
  await erro(b.conta.fotoUrl(kComb.id), 'Esta empresa está suspensa. Fale com a Gestão sem Caos.');
  assert.equal((await ok(b.rpc('vagas_conversa', { p_candidatura: kComb.id }))).podeEscrever, false);
  await ok(b.conta.sair());
  await entrar(b, 'operador@previa.com');
  await ok(b.rpc('vagas_op_empresa_decidir', { p_empresa: restaurante.id, p_acao: 'reativar', p_motivo: '' }));
  await ok(b.conta.sair());
  await entrar(b, 'empresa6@previa.com');
  assert.ok('temFoto' in (await ok(b.rpc('vagas_contato_pessoa', { p_candidatura: kComb.id }))).pessoa);
  // "temSelo" não filtra os cartões (veto P3): o selo é só informação no cartão.
  await ok(b.conta.sair());
  await entrar(b, 'empresa@previa.com');
  const minhas = (await ok(b.rpc('vagas_minhas_empresas', {}))).empresas[0];
  const anuncios = (await ok(b.rpc('vagas_anuncios_empresa', { p_empresa: minhas.id }))).anuncios;
  let maior = 0;
  for (const a of anuncios) {
    const c = await ok(b.rpc('vagas_cartoes', { p_anuncio: a.id, p_filtro: {} }));
    const comSelo = await ok(b.rpc('vagas_cartoes', { p_anuncio: a.id, p_filtro: { temSelo: true } }));
    assert.equal(comSelo.total, c.total, 'temSelo ignorado em ' + a.titulo);
    maior = Math.max(maior, c.total);
  }
  assert.ok(maior >= 2);
  // Exportar traz pulos e denúncias feitas; motivo "documento" aceito.
  await ok(b.conta.sair());
  await entrar(b, 'pessoa@previa.com');
  const feed = await ok(b.rpc('vagas_feed', { p_filtro: { areas: [] } }));
  await ok(b.rpc('vagas_pular', { p_anuncio: feed.anuncios[0].id }));
  await ok(b.rpc('vagas_denunciar', { p_dados: { alvo: 'anuncio', id: feed.anuncios[1].id, motivo: 'documento' } }));
  const exp = await ok(b.rpc('vagas_exportar_meus_dados', {}));
  assert.ok(exp.pulos.length >= 1 && exp.pulos[0].anuncio.codigo);
  assert.ok(exp.denunciasFeitas.some((d) => d.motivo === 'documento'));
  // Conta nova: o tipo pode ser trocado enquanto pendente; o consentimento só é gravado depois do clique no link.
  await ok(b.conta.sair());
  await ok(b.conta.cadastrar({ email: 'terceiro@exemplo.com', tipo: 'empresa', termosVersao: R.VERSAO_TERMOS }));
  const c2 = await ok(b.conta.cadastrar({ email: 'terceiro@exemplo.com', tipo: 'pessoa', termosVersao: R.VERSAO_TERMOS }));
  const u = st.usuarios.find((x) => x.email === 'terceiro@exemplo.com');
  assert.equal(st.contas[u.id].tipo, 'pessoa');
  assert.equal(st.consentimentos.filter((x) => x.userId === u.id).length, 0, 'nada antes do clique');
  assert.equal(st.contas[u.id].termosAceitosEm, null);
  await ok(b.conta.confirmarLink(API.linkDoEndereco({ search: '?' + c2.linkPrevia.split('?')[1] })));
  const eu = await ok(b.rpc('vagas_eu', {}));
  assert.equal(eu.conta.tipo, 'pessoa');
  assert.ok(eu.conta.termosAceitosEm);
  assert.deepEqual(st.consentimentos.filter((x) => x.userId === u.id).map((x) => x.tipo), ['termos', 'privacidade']);
});

test('reverificação na prévia: assistido só em empresa sem membro; conta assistida não troca de tipo; lista pública com contador aproximado', async () => {
  const b = novo();
  const st = b.estado();
  await entrar(b, 'operador@previa.com');
  await erro(b.conta.cadastroAssistido({ email: 'intrusa@exemplo.com', tipo: 'empresa', cidade: 'uruacu-go', empresaId: st.empresas[0].id }),
    'Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.');
  assert.ok(!st.usuarios.some((u) => u.email === 'intrusa@exemplo.com'), 'nenhuma conta criada pela metade');
  let cnpj = '';
  for (let d = 0; d <= 99 && !cnpj; d++) { const t = 'PV0000000099' + ('0' + d).slice(-2); if (R.cnpjValido(t)) cnpj = t; }
  const nova = (await ok(b.rpc('vagas_op_empresa_cadastrar', { p_dados: { cnpj, razaoSocial: 'Assistida Ltda (prévia)', cidade: 'uruacu-go' } }))).empresa;
  await ok(b.conta.cadastroAssistido({ email: 'dona-assistida@exemplo.com', tipo: 'empresa', cidade: 'uruacu-go', empresaId: nova.id }));
  const vaga = (await ok(b.rpc('vagas_op_anuncio_salvar', { p_dados: { empresaId: nova.id, area: 'atendimento', funcao: 'Balconista', modalidade: 'clt', turno: 'manha',
    experiencia: 'nao_precisa', salarioDe: 162100, descricao: 'Atendimento no balcão e organização da loja, com escala combinada.', publicar: true } }))).anuncio;
  assert.equal(vaga.status, 'publicado');
  await ok(b.conta.sair());
  // Quem souber o e-mail da dona pendente tenta "cadastrar" como pessoa: resposta neutra, tipo e vínculo ficam, vaga continua no ar.
  const r = await ok(b.conta.cadastrar({ email: 'dona-assistida@exemplo.com', tipo: 'pessoa', termosVersao: R.VERSAO_TERMOS }));
  assert.match(r.linkPrevia, /type=invite/);
  const dona = st.usuarios.find((u) => u.email === 'dona-assistida@exemplo.com');
  assert.equal(st.contas[dona.id].tipo, 'empresa');
  assert.ok(st.membros.some((m) => m.userId === dona.id && m.empresaId === nova.id && m.ativo));
  assert.equal(st.anuncios.find((a) => a.id === vaga.id).status, 'publicado');
  // Lista pública de cidade em espera: o contador aproximado não muda ao entrar.
  const antes = await erro(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'niquelandia-go' } }), R.MSG.CIDADE_FECHADA);
  await ok(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: 'niquelandia-go', email: 'sobra@exemplo.com' } }));
  const depois = await erro(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'niquelandia-go' } }), R.MSG.CIDADE_FECHADA);
  assert.equal(depois.interessados, antes.interessados);
  assert.equal(depois.interessados % 10, 0);
});

test('onda 2 na prévia: lista de espera com WhatsApp opcional (celular com DDD); sair pelo WhatsApp apaga só o número', async () => {
  const b = novo();
  const st = b.estado();
  const cid = 'niquelandia-go';
  const linha = () => st.listaEspera.find((l) => l.cidade === cid && l.email === 'zap@exemplo.com');
  await erro(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: cid, email: 'zap@exemplo.com', whatsapp: '62 3333-4444' } }), R.MSG.WHATSAPP_INVALIDO);
  assert.equal(linha(), undefined, 'nada gravado com WhatsApp inválido');
  const sem = await ok(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: cid, email: 'zap@exemplo.com' } }));
  const com = await ok(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: cid, email: 'ZAP@exemplo.com', whatsapp: '(62) 98888-1111' } }));
  assert.deepEqual(com, sem, 'mesma resposta com ou sem WhatsApp, e-mail novo ou repetido');
  assert.equal(linha().whatsapp, '5562988881111');
  assert.ok(linha().whatsappEm);
  await ok(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: cid, email: 'zap@exemplo.com' } }));
  assert.equal(linha().whatsapp, '5562988881111', 'sem o campo, o número fica');
  await erro(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: 'uruacu-go', email: 'zap@exemplo.com', whatsapp: '62988881111' } }),
    'Esta cidade já está aberta: faça o seu cadastro.');
  await erro(b.rpc('vagas_lista_espera_sair', { p_dados: { cidade: cid, whatsapp: '123' } }), R.MSG.WHATSAPP_INVALIDO);
  await erro(b.rpc('vagas_lista_espera_sair', { p_dados: { cidade: cid } }), 'E-mail inválido.');
  assert.deepEqual(await ok(b.rpc('vagas_lista_espera_sair', { p_dados: { cidade: cid, whatsapp: '62988881111' } })), { ok: true, cidade: cid, removido: true });
  assert.deepEqual([linha().whatsapp, linha().whatsappEm], ['', null], 'sair pelo WhatsApp tira só o número; o e-mail continua na lista');
  await ok(b.rpc('vagas_lista_espera_entrar', { p_dados: { cidade: cid, email: 'zap@exemplo.com', whatsapp: '62988881111' } }));
  await ok(b.rpc('vagas_lista_espera_sair', { p_dados: { cidade: cid, email: 'zap@exemplo.com' } }));
  assert.equal(linha(), undefined, 'sair pelo e-mail apaga a linha inteira (com o número)');
});

test('painel da praça na prévia: 15 indicadores e 5 gatilhos do arquivo, só agregados, operador só na própria cidade', async () => {
  const b = novo();
  await erro(b.rpc('vagas_op_indicadores', { p_cidade: 'uruacu-go' }), 'Sessão expirada. Entre de novo.');
  await entrar(b, 'empresa@previa.com');
  await erro(b.rpc('vagas_op_indicadores', { p_cidade: 'uruacu-go' }), 'Sem permissão.');
  await ok(b.conta.sair());
  await entrar(b, 'operador@previa.com');
  await erro(b.rpc('vagas_op_indicadores', { p_cidade: 'niquelandia-go' }), 'Sem permissão.');
  await erro(b.rpc('vagas_op_indicadores', { p_cidade: 'nao-existe-go' }), 'Sem permissão.', 'não revela se a cidade existe');
  const r = await ok(b.rpc('vagas_op_indicadores', { p_cidade: 'URUACU-GO' }));
  assert.deepEqual(Object.keys(r).sort(), ['cidade', 'gatilhos', 'geradoEm', 'indicadores', 'mes', 'ok', 'praca']);
  assert.deepEqual(r.cidade, { slug: 'uruacu-go', nome: 'Uruaçu', uf: 'GO', status: 'ativa', porte: 'pequena', fuso: 'America/Sao_Paulo' });
  assert.deepEqual(r.praca.map((p) => p.slug), ['uruacu-go', 'campinorte-go']);
  assert.equal(r.mes, '2026-10');
  assert.deepEqual(r.indicadores.map((i) => i.chave), R.INDICADORES.map((i) => i.chave));
  assert.equal(r.indicadores.length, 15);
  assert.deepEqual(r.gatilhos.map((g) => g.chave), R.GATILHOS.map((g) => g.chave));
  const por = Object.fromEntries(r.indicadores.map((i) => [i.chave, i]));
  for (const i of r.indicadores) {
    assert.deepEqual(Object.keys(i).slice(0, 12), ['chave', 'nome', 'unidade', 'periodo', 'direcao', 'hipotese', 'valor', 'alvo', 'alvoLancamento', 'cor', 'semDado', 'detalhe'], i.chave);
    assert.equal(i.cor, R.corIndicador(i.valor, i.alvo, i.direcao), i.chave);
    assert.ok(i.cor === null || R.CORES_INDICADOR.some((c) => c.id === i.cor), i.chave);
  }
  for (const k of ['empresas_buscando_semana', 'empresas_pagantes', 'receita_liquida_centavos', 'emails_mes']) {
    assert.deepEqual([por[k].valor, por[k].semDado, por[k].cor], [null, true, null], k);
  }
  assert.ok(por.vagas_ativas.valor >= 20);
  assert.equal(por.vagas_ativas.detalhe.porArea.reduce((t, a) => t + a.valor, 0), por.vagas_ativas.valor);
  assert.equal(por.vagas_ativas.alvo, R.INDICADORES[0].alvo.pequena);
  assert.equal(por.lista_espera.valor, 0, 'a lista de Niquelândia não é desta praça');
  assert.ok(por.fila_moderacao.valor >= 0 && 'anuncios' in por.fila_moderacao.detalhe);
  const pnp = r.gatilhos.find((g) => g.chave === 'pessoa_nao_paga');
  assert.deepEqual([pnp.aplica, pnp.atingido], [true, true]);
  // Só agregados: nenhum e-mail, id, nome de empresa ou de pessoa.
  const txt = JSON.stringify(r);
  assert.ok(!/@/.test(txt), 'sem e-mail');
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(txt), 'sem id');
  const st = b.estado();
  for (const e of st.empresas) assert.ok(!txt.includes(e.nomeFantasia), e.nomeFantasia);
  for (const u of Object.keys(st.contatos)) assert.ok(!txt.includes(st.contatos[u].whatsapp || 'x-x'), 'sem WhatsApp');
  // Equipe da Gestão sem Caos vê qualquer cidade; cidade sem porte não tem alvo nem cor.
  await ok(b.conta.sair());
  await entrar(b, 'admin@previa.com');
  const n = await ok(b.rpc('vagas_op_indicadores', { p_cidade: 'niquelandia-go' }));
  assert.equal(n.cidade.porte, null);
  assert.ok(n.indicadores.every((i) => i.alvo === null && i.cor === null));
  assert.deepEqual(n.indicadores.find((i) => i.chave === 'lista_espera').detalhe, { pessoa: 1, empresa: 0, comWhatsapp: 1 });
  assert.ok(n.gatilhos.filter((g) => g.chave !== 'trocar_parceiro' && g.chave !== 'pessoa_nao_paga').every((g) => g.aplica === false && g.atingido === null && g.partes.length === 0));
  await erro(b.rpc('vagas_op_indicadores', { p_cidade: 'nao-existe-go' }), 'Cidade não encontrada.');
});

test('equipe da empresa na prévia: só a dona convida; resposta neutra; convite de uso único, só do e-mail convidado; a última dona não sai', async () => {
  const relogio = { t: AGORA };
  const b = novo({ agora: () => (relogio.t += 1000) });
  const st = b.estado();
  const merc = st.empresas[0];
  const NEUTRA = 'Pronto. Se este e-mail puder entrar na equipe, a pessoa recebe o convite em instantes. O convite vale por 3 dias.';
  await erro(b.conta.convidarEquipe(merc.id, 'nova.recrutadora@exemplo.com'), 'Sessão expirada. Entre de novo.');
  await entrar(b, 'recrutador@previa.com');
  await erro(b.conta.convidarEquipe(merc.id, 'x@exemplo.com'), 'Só quem é dono(a) da conta da empresa pode convidar pessoas para a equipe.');
  await erro(b.rpc('vagas_equipe_empresa', { p_empresa: merc.id }), 'Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.');
  await ok(b.conta.sair());
  await entrar(b, 'pessoa@previa.com');
  await erro(b.conta.convidarEquipe(merc.id, 'x@exemplo.com'), 'Esta área é para empresas.');
  await ok(b.conta.sair());
  await entrar(b, 'empresa@previa.com');
  const eq = await ok(b.rpc('vagas_equipe_empresa', { p_empresa: merc.id }));
  assert.deepEqual(eq.membros.map((m) => [m.email, m.papel, m.eu, m.podeRemover]),
    [['empresa@previa.com', 'dono', true, false], ['recrutador@previa.com', 'recrutador', false, true]]);
  assert.equal(eq.membros[1].nome, 'Rita Moraes');
  assert.deepEqual(eq.convites.map((c) => [c.email, c.status]), [['convidada@previa.com', 'pendente']]);
  assert.ok(!JSON.stringify(eq).includes('token'), 'o token nunca volta');
  assert.deepEqual(eq.limites, { convitesPorDia: 10, convitesHoje: 0, membrosMax: 20, convitesAbertosMax: 20, validadeHoras: 72 });
  await erro(b.conta.convidarEquipe(merc.id, 'recrutador@previa.com'), 'Esta pessoa já faz parte da equipe.');
  await erro(b.conta.convidarEquipe(merc.id, 'sem-arroba'), 'E-mail inválido.');
  await erro(b.conta.convidarEquipe(st.empresas[1].id, 'x@exemplo.com'), 'Empresa não encontrada.');
  // Resposta neutra: e-mail sem conta, conta de pessoa (outro tipo) e conta de empresa recebem a mesma resposta.
  const nova = await ok(b.conta.convidarEquipe(merc.id, 'Nova.Recrutadora@Exemplo.com'));
  const pessoa = await ok(b.conta.convidarEquipe(merc.id, 'pessoa@previa.com'));
  const outra = await ok(b.conta.convidarEquipe(merc.id, 'empresa2@previa.com'));
  for (const r of [nova, pessoa, outra]) {
    assert.equal(r.mensagem, NEUTRA);
    assert.deepEqual(Object.keys(r).sort(), ['convite', 'email', 'enviado', 'linkPrevia', 'mensagem', 'ok']);
    assert.deepEqual([r.enviado, r.convite.status, r.convite.papel], [true, 'pendente', 'recrutador']);
  }
  assert.equal(nova.convite.email, 'nova.recrutadora@exemplo.com');
  assert.match(nova.linkPrevia, /^entrar\.html\?token_hash=previa[0-9a-f]+&type=invite&convite=[0-9a-f]{64}$/);
  assert.equal(pessoa.linkPrevia, '', 'conta de outro tipo: nenhum convite que funcione');
  assert.match(outra.linkPrevia, /^entrar\.html\?convite=[0-9a-f]{64}$/);
  assert.equal((await ok(b.rpc('vagas_equipe_empresa', { p_empresa: merc.id }))).limites.convitesHoje, 3);
  const tokOutra = API.conviteDoEndereco({ search: '?' + outra.linkPrevia.split('?')[1] });
  assert.match(tokOutra, /^[0-9a-f]{64}$/);
  // A dona (outro e-mail) não usa o convite.
  await erro(b.rpc('vagas_equipe_convite', { p_token: tokOutra }), R.MSG.CONVITE_INVALIDO);
  await ok(b.conta.sair());
  await entrar(b, 'empresa2@previa.com');
  await erro(b.rpc('vagas_equipe_convite', { p_token: 'abc' }), R.MSG.CONVITE_INVALIDO);
  const ver = await ok(b.rpc('vagas_equipe_convite', { p_token: tokOutra.toUpperCase() }));
  assert.deepEqual([ver.convite.empresa.nomeFantasia, ver.convite.empresa.cidade.slug, ver.convite.papel, ver.convite.jaMembro],
    ['Mercadinho Sol do Norte', 'uruacu-go', 'recrutador', false]);
  const ac = await ok(b.rpc('vagas_equipe_convite_aceitar', { p_token: tokOutra }));
  assert.deepEqual([ac.empresa.id, ac.empresa.papel, ac.duplicado], [merc.id, 'recrutador', false]);
  await erro(b.rpc('vagas_equipe_convite_aceitar', { p_token: tokOutra }), R.MSG.CONVITE_INVALIDO);
  assert.ok((await ok(b.rpc('vagas_minhas_empresas', {}))).empresas.some((e) => e.id === merc.id));
  await erro(b.rpc('vagas_equipe_empresa', { p_empresa: merc.id }), 'Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.');
  // Conta nova: o link do e-mail confirma o e-mail, cria a senha e só então o convite pode ser aceito.
  await ok(b.conta.sair());
  const busca = { search: '?' + nova.linkPrevia.split('?')[1] };
  await ok(b.conta.confirmarLink(API.linkDoEndereco(busca)));
  await ok(b.conta.definirSenha('senha-boa-123'));
  assert.equal((await ok(b.rpc('vagas_equipe_convite_aceitar', { p_token: API.conviteDoEndereco(busca) }))).empresa.papel, 'recrutador');
  // Recrutador(a) pode sair sozinho(a); não remove ninguém.
  const dona = st.usuarios.find((u) => u.email === 'empresa@previa.com');
  const novaU = st.usuarios.find((u) => u.email === 'nova.recrutadora@exemplo.com');
  await erro(b.rpc('vagas_equipe_remover', { p_empresa: merc.id, p_membro: dona.id }), 'Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.');
  assert.deepEqual(await ok(b.rpc('vagas_equipe_remover', { p_empresa: merc.id, p_membro: novaU.id })), { ok: true, removido: true, saiu: true });
  await ok(b.conta.sair());
  await entrar(b, 'empresa@previa.com');
  await erro(b.rpc('vagas_equipe_remover', { p_empresa: merc.id, p_membro: dona.id }),
    'A empresa precisa ter pelo menos uma pessoa como dona. Esta pessoa não pode sair da equipe.');
  const e2 = st.usuarios.find((u) => u.email === 'empresa2@previa.com');
  assert.deepEqual(await ok(b.rpc('vagas_equipe_remover', { p_empresa: merc.id, p_membro: e2.id })), { ok: true, removido: true, saiu: false });
  await erro(b.rpc('vagas_equipe_remover', { p_empresa: merc.id, p_membro: e2.id }), 'Esta pessoa não está na equipe.');
  // Cancelar: aberto cancela (repetir é duplicado); aceito não cancela; de outra empresa não aparece.
  assert.equal((await ok(b.rpc('vagas_equipe_convite_cancelar', { p_convite: pessoa.convite.id }))).convite.status, 'cancelado');
  assert.equal((await ok(b.rpc('vagas_equipe_convite_cancelar', { p_convite: pessoa.convite.id }))).duplicado, true);
  await erro(b.rpc('vagas_equipe_convite_cancelar', { p_convite: outra.convite.id }), 'Este convite já foi aceito. Para tirar o acesso, remova a pessoa da equipe.');
  await erro(b.rpc('vagas_equipe_convite_cancelar', { p_convite: '00000000-0000-4000-8000-000000000000' }), 'Convite não encontrado.');
  // Vencimento: 72 h depois, o convite aberto da semente aparece como vencido.
  relogio.t += 3 * 86400000;
  const depois = await ok(b.rpc('vagas_equipe_empresa', { p_empresa: merc.id }));
  assert.equal(depois.convites.find((c) => c.email === 'convidada@previa.com').status, 'vencido');
  assert.deepEqual(st.moderacao.filter((m) => /^equipe_/.test(m.acao)).map((m) => m.acao),
    ['equipe_convidar', 'equipe_convidar', 'equipe_convidar', 'equipe_aceitar', 'equipe_aceitar', 'equipe_sair', 'equipe_remover', 'equipe_convite_cancelar']);
  assert.ok(st.moderacao.filter((m) => /^equipe_/.test(m.acao)).every((m) => !JSON.stringify(m).includes('@')), 'moderação sem e-mail');
});

test('adaptador da prévia: convidarEquipe e os métodos de equipe e do painel passam pelo mesmo contrato', async () => {
  const api = API.criar({ modo: 'previa', backend: novo() });
  for (const m of ['indicadores', 'equipeDaEmpresa', 'cancelarConvite', 'removerMembro', 'conviteEquipe', 'aceitarConviteEquipe', 'convidarEquipe', 'conviteDoEndereco']) {
    assert.equal(typeof api[m], 'function', m);
  }
  assert.equal(api.conviteDoEndereco({ search: '?convite=' + 'A'.repeat(64) }), 'a'.repeat(64));
  assert.equal(api.conviteDoEndereco({ search: '?convite=123' }), '');
  await api.entrar('empresa@previa.com', PREVIA.SENHA_PREVIA);
  const emp = (await api.minhasEmpresas()).empresas[0];
  const r = await api.convidarEquipe(emp.id, 'outra.pessoa@exemplo.com');
  assert.equal(r.convite.email, 'outra.pessoa@exemplo.com');
  assert.ok((await api.equipeDaEmpresa(emp.id)).convites.some((c) => c.id === r.convite.id));
  await assert.rejects(api.indicadores('uruacu-go'), (e) => e.message === 'Sem permissão.');
  await assert.rejects(api.aceitarConviteEquipe('0'.repeat(64)), (e) => e.message === R.MSG.CONVITE_INVALIDO);
});

test('pedidos da operação na prévia: resumo com repasse, cidades e operadores só para a equipe, assistidos pendentes mascarados', async () => {
  const b = novo();
  await entrar(b, 'operador@previa.com');
  assert.deepEqual((await ok(b.rpc('vagas_op_resumo', {}))).cidades.map((c) => [c.slug, c.papel, c.repassePercentual]), [['uruacu-go', 'operador', 0]]);
  await erro(b.rpc('vagas_adm_cidades', {}), 'Sem permissão.');
  await erro(b.rpc('vagas_adm_operadores', { p_filtro: {} }), 'Sem permissão.');
  assert.deepEqual((await ok(b.rpc('vagas_op_assistidos', { p_filtro: {} }))).contas, []);
  await ok(b.conta.cadastroAssistido({ email: 'rosa.alves@exemplo.com', tipo: 'pessoa', cidade: 'uruacu-go', codigoEvento: 'MUTIRAO-01' }));
  const ass = (await ok(b.rpc('vagas_op_assistidos', { p_filtro: {} }))).contas;
  assert.deepEqual(ass.map((c) => [c.email, c.tipo, c.cidade, c.codigoEvento]), [['r***@e***.com', 'pessoa', 'uruacu-go', 'MUTIRAO-01']]);
  assert.deepEqual(Object.keys(ass[0]).sort(), ['cidade', 'codigoEvento', 'criadoEm', 'email', 'tipo']);
  await erro(b.rpc('vagas_op_assistidos', { p_filtro: { cidade: 'niquelandia-go' } }), 'Sem permissão.');
  await ok(b.conta.sair());
  await entrar(b, 'empresa@previa.com');
  await erro(b.rpc('vagas_op_assistidos', { p_filtro: {} }), 'Sem permissão.');
  await ok(b.conta.sair());
  await entrar(b, 'admin@previa.com');
  const cids = (await ok(b.rpc('vagas_adm_cidades', {}))).cidades;
  assert.deepEqual(cids.map((c) => [c.slug, c.uf, c.ibge, c.status, c.porte, c.praca]), [['uruacu-go', 'GO', '5221601', 'ativa', 'pequena', null],
    ['campinorte-go', 'GO', '5204706', 'ativa', null, 'uruacu-go'], ['niquelandia-go', 'GO', '5214606', 'lista_espera', null, null]]);
  assert.deepEqual(cids[0].zonas.map((z) => [z.slug, z.ativa]).slice(0, 2), [['centro', true], ['regiao-norte', true]]);
  assert.equal(cids[0].operadoresAtivos, 1);
  const ops = (await ok(b.rpc('vagas_adm_operadores', { p_filtro: { cidade: 'uruacu-go' } }))).operadores;
  assert.deepEqual(ops.map((o) => [o.email, o.cidade.slug, o.papel, o.ativo, o.repassePercentual, o.contaStatus]),
    [['operador@previa.com', 'uruacu-go', 'operador', true, 0, 'ativa']]);
  assert.deepEqual(Object.keys(ops[0]).sort(), ['ativo', 'cidade', 'contaStatus', 'contratoAceitoEm', 'contratoVersao', 'criadoEm', 'email', 'papel',
    'repassePercentual', 'ultimoAto']);
  await erro(b.rpc('vagas_adm_operadores', { p_filtro: { cidade: 'nao-existe-go' } }), 'Cidade não encontrada.');
  assert.ok((await ok(b.rpc('vagas_op_resumo', {}))).cidades.every((c) => c.repassePercentual === null && c.papel === 'admin'));
  assert.equal((await ok(b.rpc('vagas_op_assistidos', { p_filtro: { cidade: 'uruacu-go' } }))).contas.length, 1, 'a equipe vê os de todos');
  const api = API.criar({ modo: 'previa', backend: b });
  assert.equal(typeof api.opIndicadores, 'function');
  assert.deepEqual((await api.opIndicadores('uruacu-go')).indicadores.map((i) => i.chave), (await api.indicadores('uruacu-go')).indicadores.map((i) => i.chave));
});
