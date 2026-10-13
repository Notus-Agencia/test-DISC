'use strict';
// Vagas sem Caos — prévia (vagas/js/api-previa.js): o "banco" de mentira do navegador precisa ter TODAS as RPCs da migração,
// as MESMAS mensagens e as mesmas regras de privacidade (cartão cego, Combinou, cortar acesso, referência com os vetos
// P1/P2 da psicologia), com dados fictícios de Boa Vista e nada da marca Notus.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PREVIA = require('../vagas/js/api-previa.js');
const API = require('../vagas/js/api.js');
const R = require('../vagas/js/regras.js');

const RAIZ = path.join(__dirname, '..');
const SQL = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '20261022120000_vagas.sql'), 'utf8');
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
  assert.deepEqual(st.cidades.map((c) => [c.slug, c.status]), [['boa-vista-rr', 'ativa'], ['mucajai-rr', 'ativa'], ['canta-rr', 'ativa'],
    ['rorainopolis-rr', 'lista_espera']]);
  const tudo = JSON.stringify(st);
  assert.ok(!/notus/i.test(tudo));
  for (const r of st.referencias) assert.ok(r.pontosFortes.every((p) => R.PONTOS_FORTES.some((x) => x.id === p)), r.pontosFortes.join());
  assert.ok(!/notus/i.test(fs.readFileSync(path.join(RAIZ, 'vagas', 'js', 'api-previa.js'), 'utf8')));
});

test('a prévia tem TODAS as RPCs públicas da migração (e as do contrato de vagas/js/api.js), com as mesmas mensagens', () => {
  const b = novo();
  const doBanco = [...SQL.matchAll(/create or replace function public\.(vagas_[a-z_0-9]+)/g)].map((m) => m[1])
    .filter((f) => !['vagas_ids_minhas_empresas', 'vagas_ids_minhas_cidades', 'vagas_sou_pessoa', 'vagas_conta_limite', 'vagas_conta_consultar',
      'vagas_conta_registrar', 'vagas_conta_quem', 'vagas_conta_foto'].includes(f));
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

test('mural público e lista de espera: Boa Vista com o entorno; Rorainópolis em lista de espera; vaga pelo código', async () => {
  const b = novo();
  const mural = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr' } }));
  assert.equal(mural.anuncios.length, 20);
  assert.ok(mural.proximo);
  const conf = mural.anuncios.filter((a) => a.empresa.confidencial);
  assert.ok(conf.every((a) => a.empresa.nome === 'Empresa confidencial' && a.empresa.iniciais === ''));
  const espera = await erro(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'rorainopolis-rr' } }), R.MSG.CIDADE_FECHADA);
  assert.equal(espera.listaEspera, true);
  const hoje = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr', paraHoje: true } }));
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
  await erro(b.conta.entrar('nova@exemplo.com', 'qualquer'), 'E-mail ou senha incorretos.');
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
  assert.equal(cidades.cidades[0].slug, 'boa-vista-rr');
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
  const todas = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr', limite: 20 } }));
  assert.ok(todas.anuncios.every((a) => a.area && a.area.nome && a.funcao && a.turno && a.experiencia));
  const total = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr', somenteTotal: true } }));
  assert.ok(total.total > 20 && !('anuncios' in total));
  const caixa = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr', areas: ['caixa'] } }));
  assert.ok(caixa.anuncios.length >= 1 && caixa.anuncios.every((a) => a.area.slug === 'caixa'));
  const noite = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr', turno: ['noite'] } }));
  assert.ok(noite.anuncios.length >= 1 && noite.anuncios.every((a) => a.turno === 'noite'));
  const sal = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr', salarioMin: 220000 } }));
  const mensal = (a) => (a.valor.maxCentavos != null ? a.valor.maxCentavos : a.valor.minCentavos) * ({ mes: 1, dia: 22, hora: 220 }[a.valor.unidade] || 0);
  assert.ok(sal.anuncios.length >= 1 && sal.anuncios.every((a) => mensal(a) >= 220000));
  const semExp = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr', semExperiencia: true } }));
  assert.ok(semExp.anuncios.length >= 1 && semExp.anuncios.every((a) => a.experiencia === 'nao_precisa'));
  const proibidos = await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr', limite: 20, nota: 90, selo: 'caixa',
    temReferencia: true, idade: 30, sexo: 'f' } }));
  assert.deepEqual(proibidos.anuncios.map((a) => a.id), todas.anuncios.map((a) => a.id), 'nada de filtro por dado da pessoa');
  // Ana tem áreas no currículo: a lista abre nelas; "areas": [] mostra tudo.
  await entrar(b, 'pessoa@previa.com');
  const eu = await ok(b.rpc('vagas_pessoa_minha', {}));
  assert.deepEqual(eu.pessoa.areas, ['caixa', 'atendimento']);
  const feed = await ok(b.rpc('vagas_feed', { p_filtro: {} }));
  assert.equal(feed.areasPadrao, true);
  assert.ok(feed.anuncios.every((a) => ['caixa', 'atendimento'].indexOf(a.area.slug) >= 0));
  assert.equal((await ok(b.rpc('vagas_anuncios_publicos', { p_filtro: { cidade: 'boa-vista-rr', areas: [], somenteTotal: true } }))).total, total.total);
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
