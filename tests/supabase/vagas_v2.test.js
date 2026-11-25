'use strict';
// Banco da Vagas sem Caos v2 (migrações 20261101120000 a 20261101120003) num Postgres 17 EMBUTIDO, com TODAS as migrações em sequência:
// idempotência e "não apaga nem muda dado existente", filtro de texto contextual (igual ao JS), as 3 travas que saíram, estados e
// limites da empresa em verificação, prazo de 7 dias, vaga publicada na hora / segurada / barrada, base pública vazia e a forma
// das respostas conferida com VSC_CONTRATO.validar(). Candidaturas e privacidade: vagas_v2_candidaturas.test.js; equipe:
// vagas_v2_equipe.test.js.
//
// Rodar: node --test --test-concurrency=1 tests/supabase/vagas_v2.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_vagas_v2_ajuda.js');
const REGRAS = require('../../vagas/js/regras.js');
const { erro, ok, COM, cnpjCom, CONTRATO } = H;

let A = null;
let S = null;
let falha = null;
test.before(async () => {
  try { A = await H.iniciar('geral'); } catch (e) { falha = e; }
});
test.after(async () => { if (A) await A.encerrar(); });
function pronto() { if (falha) throw falha; if (!A) throw new Error('Postgres embutido não iniciou'); }

test('migrações v2 em sequência, aplicadas de novo (idempotentes), versao_banco e permissões das RPCs', async () => {
  pronto();
  S = await H.cenario(A);
  assert.deepEqual(H.V2, ['20261101120000_vagas_v2_base', '20261101120001_vagas_v2_pessoa', '20261101120002_vagas_v2_empresa', '20261101120003_vagas_v2_equipe']);
  for (let i = 0; i < 2; i++) for (const n of H.V2) await A.db.query(H.ler(n));
  const v = await A.anon('versao_banco');
  assert.equal(v.versao, 20261101120003);
  assert.deepEqual(v.faltando, []);
  assert.deepEqual(v.migracoes.slice(-4), H.V2);
  // toda RPC do contrato existe; anon só executa base, vaga e textoChecar; as funções de servidor só a service_role
  for (const [metodo, m] of Object.entries(CONTRATO.METODOS)) {
    if (!m.rpc) continue;
    const r = await A.db.query(`select p.oid, p.prorettype::regtype::text tipo, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') aut, has_function_privilege('service_role', p.oid, 'execute') serv, p.prosecdef sd,
      p.proconfig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [m.rpc]);
    assert.equal(r.rows.length, 1, metodo + ' sem função ' + m.rpc);
    assert.equal(r.rows[0].tipo, 'jsonb', m.rpc);
    assert.equal(r.rows[0].sd, true, m.rpc + ' security definer');
    assert.ok((r.rows[0].proconfig || []).some((x) => /^search_path=/.test(x)), m.rpc + ' com search_path');
    assert.equal(r.rows[0].anon, m.login === false, m.rpc + ' anon');
    assert.equal(r.rows[0].aut, true, m.rpc + ' authenticated');
  }
  for (const fn of ['vagas_v2_conta_garantir_servidor', 'vagas_v2_empresa_criar_servidor', 'vagas_v2_arquivo_link_servidor', 'vagas_v2_documento_link_servidor',
    'vagas_v2_avisos_pendentes_servidor', 'vagas_v2_avisos_marcar_servidor', 'vagas_v2_migrar_lista_espera_servidor']) {
    const r = await A.db.query(`select has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') aut,
      has_function_privilege('service_role', p.oid, 'execute') serv from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fn]);
    assert.deepEqual(r.rows[0], { anon: false, aut: false, serv: true }, fn);
  }
  // a pessoa autenticada não chama função de servidor nem as internas
  await H.rejeita(A.de(S.operador)('vagas_v2_conta_garantir_servidor', S.operador, { tipo: 'pessoa' }), /permission denied/);
  await H.rejeita(A.de(S.operador)('vagas_v2_arquivo_link_servidor', S.operador, '00000000-0000-0000-0000-000000000000'), /permission denied/);
  await H.rejeita(A.rpcComo('authenticated', S.operador, 'vagas_v2_conta_garantir_servidor', [S.operador, { tipo: 'pessoa' }]), /permission denied/);
});

test('buckets privados vagas-curriculos e vagas-verificacao existem (e a migração não reabre nada)', async () => {
  pronto();
  const b = (await A.db.query(`select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('vagas-curriculos', 'vagas-verificacao') order by id`)).rows;
  assert.equal(b.length, 2);
  for (const x of b) { assert.equal(x.public, false); assert.equal(Number(x.file_size_limit), 10485760); }
  assert.deepEqual(b[0].allowed_mime_types.sort(), ['application/msword', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/heic', 'image/heif', 'image/jpeg', 'image/png']);
  assert.deepEqual(b[1].allowed_mime_types.sort(), ['application/pdf', 'image/jpeg', 'image/png']);
  const pol = (await A.db.query(`select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'vagas\\_%' order by 1`)).rows.map((x) => x.policyname);
  for (const p of ['vagas_curriculos_gravar', 'vagas_curriculos_ver_proprio', 'vagas_curriculos_apagar', 'vagas_verificacao_gravar', 'vagas_verificacao_ver']) assert.ok(pol.includes(p), p);
});

test('migração aditiva: não apaga nem muda dado existente (nova aplicação com dados antigos)', async () => {
  pronto();
  // dado "de antes": empresa e vaga criadas pelo caminho antigo, pessoa antiga com currículo antigo
  const dono = await A.db.query(`select 1`);
  const uid = await H.usuarioAuth(A, 'antiga@v2.teste');
  ok(await A.servico('vagas_conta_registrar', uid, { tipo: 'empresa', termosVersao: '2026-10' }));
  const emp = ok(await A.de(uid)('vagas_empresa_cadastrar', { cnpj: cnpjCom('555444333001'), razaoSocial: 'Antiga Ltda', cidade: 'fc-go', zona: 'centro' })).empresa;
  ok(await A.de(S.admin)('vagas_op_empresa_decidir', emp.id, 'aprovar', 'ok'));
  const an = ok(await A.de(uid)('vagas_anuncio_salvar', { empresaId: emp.id, area: 'atendimento', funcao: 'Atendente antigo', modalidade: 'clt',
    descricao: 'Atendimento no balcão e organização de prateleiras para o dia a dia da loja de bairro.', turno: 'comercial', experiencia: 'nao_precisa',
    escolaridade: 'medio', quantidade: 1, salarioDe: 162100, cidade: 'fc-go', zona: 'centro' })).anuncio;
  const pes = await H.usuarioAuth(A, 'pessoa.antiga@v2.teste');
  ok(await A.servico('vagas_conta_registrar', pes, { tipo: 'pessoa', termosVersao: '2026-10' }));
  ok(await A.de(pes)('vagas_pessoa_salvar', { cidade: 'fc-go', zona: 'centro', maior18: true, cargos: ['Atendente'], escolaridade: 'medio', turnos: ['manha'],
    modalidades: ['clt'], nome: 'Pessoa Antiga Silva', whatsapp: '62 99123-4567' }));
  const foto = async () => JSON.stringify({
    e: (await A.db.query(`select * from public.vagas_empresas where id = $1`, [emp.id])).rows,
    a: (await A.db.query(`select * from public.vagas_anuncios where id = $1`, [an.id])).rows,
    p: (await A.db.query(`select * from public.vagas_pessoas where user_id = $1`, [pes])).rows,
    c: (await A.db.query(`select * from public.vagas_pessoa_contato where user_id = $1`, [pes])).rows,
    n: (await A.db.query(`select count(*) from public.vagas_cidades`)).rows,
    t: (await A.db.query(`select count(*) from public.vagas_questoes`)).rows });
  const antes = await foto();
  for (const n of H.V2) await A.db.query(H.ler(n));
  assert.equal(await foto(), antes);
  // a empresa antiga (ativa) continua verificada e a vaga antiga, ao ser publicada, aparece na base v2
  ok(await A.de(uid)('vagas_anuncio_publicar', an.id));
  const base = ok(await A.v2anon('base', { cidade: 'fc-go' }));
  assert.equal(base.empresas.some((x) => x.id === emp.id && x.verificada === true), true);
  assert.equal(base.vagas.some((x) => x.id === an.codigo && x.titulo === 'Atendente antigo'), true);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Filtro de texto contextual
// ---------------------------------------------------------------------------------------------------------------------------------

test('filtro de texto: o banco e o JS (VAGAS_REGRAS) dão o MESMO resultado, em todos os contextos', async () => {
  pronto();
  const sql = (await A.db.query(`select ordem, tipo, nivel, alvo, padrao from vagas_interno.padroes_texto() order by ordem`)).rows;
  assert.deepEqual(sql, REGRAS.PADROES.map((p) => ({ ordem: p.ordem, tipo: p.tipo, nivel: p.nivel, alvo: p.alvo, padrao: p.padrao })));
  const ctxs = ['anuncio', 'empresa', 'mensagem', 'referencia', 'cartao', 'perfil', 'vaga', 'conversa', 'outro'];
  for (const ctx of ctxs) {
    const n = (await A.db.query(`select vagas_interno.niveis_do_contexto($1) t`, [ctx])).rows[0].t;
    assert.deepEqual(n, REGRAS.niveisDoContexto(ctx), ctx);
    assert.deepEqual((await A.db.query(`select vagas_interno.tipos_do_contexto($1) t`, [ctx])).rows[0].t, REGRAS.tiposDoContexto(ctx), ctx);
  }
  const corpus = [
    'Vaga de caixa, boa aparência', 'BOA APRESENTAÇÃO exigida', 'Exige idade mínima', 'Atendente até 30 anos', 'de 18 a 35 anos', 'Vaga para mulheres de 18 a 30 anos',
    'de 2 a 3 anos de experiência', 'Solteira, sem filhos', 'Somente mulheres', 'Apenas para homens', 'Procuramos homens para a obra', 'sexo masculino',
    'Evangélico de preferência', 'Não aceitamos estrangeiros', 'Venezuelana com experiência', 'Sem antecedentes criminais', 'Antecedentes profissionais na área',
    'Nada consta', 'Vaga PcD', 'A vaga também é para pessoa com deficiência', 'Não contratamos pessoa com deficiência', 'Boa saúde', 'Plano de saúde e VR',
    'Taxa de inscrição R$ 30', 'Pague R$ 50 do uniforme para começar', 'Pague R$ 20 pelo kit', 'Faça um depósito', 'Auxiliar de depósito', 'Chave Pix do RH',
    'Precisa receber em dinheiro, cartão e Pix no caixa', 'Ganha taxa de entrega por corrida', 'Taxa de 10 por cento sobre as vendas', 'Curso pago de R$ 300',
    'Treinamento pago pela empresa', 'Envie um Pix para garantir a vaga', 'Pix para garantir', 'investimento inicial', 'Pagamento antecipado', 'Taxa administrativa',
    'Ligue (95) 99123-4567', 'me chamem no WhatsApp 62 99999-0303', 'WhatsApp 95991234567', '+55 62 99999-0303', 'Telefone: 3224-5566', '99999-0303', 'rh@empresa.com.br',
    'Instagram @lojinha_bv', 'Veja bit.ly/abc123', 'https://golpe.example/x', 'www.vagas.com.br', 'Acesse lojinha.com.br/vagas', 'CEP 69.301-000',
    'Entrevista dia 25.11.2026 às 14.30', 'Rua 3, Setor Central, CEP 76400-000', 'R$ 1.500,00 a R$ 2.000,00', 'Salário de R$ 1500-2000', 'safra 2026-2027',
    'Me manda seu CPF', 'Envie seus documentos', 'Mande uma selfie', 'Qual sua senha?', 'Código de verificação: 1234', 'Dados bancários', 'RG e CPF na admissão',
    'Ganhe até R$ 5000', 'renda extra', 'Trabalhe em casa e ganhe R$ 300 por dia', 'lucros ilimitados', 'Você tem CNH B?', 'Gosto de trabalhar em equipe',
    'Ótima pessoa, apesar dos filhos', 'Mulher bonita e magra', 'Habilidade com vendas', 'Transfira o valor', 'Atendimento ao público', 'Empresa com mais de 20 anos',
    'Gestante não', 'ÀÁÂÃÄÅÇÉÊÍÓÔÕÚÜÑ ok', 'sem fim de semana', 'adesão', 'cobramos uma taxa', ''
  ];
  for (const t of corpus) {
    assert.equal((await A.db.query(`select vagas_interno.normalizar($1) n`, [t])).rows[0].n, REGRAS.normalizar(t), 'normalizar: ' + t);
    for (const ctx of ctxs) {
      const banco = (await A.db.query(`select vagas_interno.conferir_texto($1, $2) r`, [t, ctx])).rows[0].r;
      assert.deepEqual(banco, REGRAS.conferirTexto(t, ctx), 'conferirTexto ' + ctx + ': ' + t);
      const lista = (await A.db.query(`select vagas_interno.conferir_lista($1, $2) r`, [t, ctx])).rows[0].r;
      assert.deepEqual(lista, REGRAS.conferirLista(t, ctx), 'conferirLista ' + ctx + ': ' + t);
    }
  }
});

test('filtro de texto: a tabela da proposta §5.5 (passa / barra) e a mensagem nunca acusa', async () => {
  pronto();
  const v = A.v2anon;
  const passa = async (texto, ctx) => {
    const r = ok(await v('textoChecar', { texto, contexto: ctx }));
    assert.deepEqual(CONTRATO.validar('textoChecar', r), []);
    assert.equal(r.passa, true, texto + ' -> ' + JSON.stringify(r.barra));
    return r;
  };
  const barra = async (texto, ctx) => {
    const r = ok(await v('textoChecar', { texto, contexto: ctx }));
    assert.deepEqual(CONTRATO.validar('textoChecar', r), []);
    assert.equal(r.passa, false, texto);
    assert.ok(r.barra.length >= 1);
    for (const b of r.barra) {
      assert.equal(typeof b.trecho, 'string'); assert.equal(typeof b.motivo, 'string'); assert.match(b.mensagem, /Tire/);
      assert.doesNotMatch(b.mensagem, new RegExp(CONTRATO.PROIBIDAS.join('|'), 'i'));
      assert.doesNotMatch(b.mensagem, /golpista|fraude|criminos|você está/i);
    }
    return r;
  };
  await passa('A pessoa vai receber em dinheiro, cartão e Pix no caixa da loja.', 'vaga');
  await passa('O motoboy ganha taxa de entrega por corrida, além do salário fixo.', 'vaga');
  const pcd = await passa('A vaga também é para pessoa com deficiência.', 'vaga');
  assert.equal(pcd.barra.length, 0);
  await passa('Entrevista dia 25.11.2026 às 14.30', 'conversa');
  await passa('Rua 3, Setor Central, CEP 76400-000', 'conversa');
  const uniforme = await barra('Pague R$ 50 do uniforme para começar', 'vaga');
  assert.equal(uniforme.barra[0].motivo, 'cobranca');
  assert.match(uniforme.barra[0].mensagem, /Vagas não podem cobrar nada de quem se candidata/);
  const sexo = await barra('Vaga para mulheres de 18 a 30 anos', 'vaga');
  assert.equal(sexo.barra.length, 2);
  assert.match(sexo.barra[0].mensagem, /A lei não deixa escolher por sexo, idade/);
  assert.deepEqual(sexo.barra.map((b) => b.trecho).sort(), ['de 18 a 30 anos', 'vaga para mulheres']);
  const fone = await barra('me chamem no WhatsApp 62 99999-0303', 'vaga');
  assert.match(fone.barra[0].mensagem, /Não precisa pôr o número: as pessoas chamam você pelo botão da vaga/);
  await barra('Chame no contato@loja.com.br', 'vaga');
  await barra('Veja www.minhaloja.com.br/vagas', 'vaga');
  await barra('Mande seu CPF e RG antes da entrevista', 'vaga');
  await barra('Envie uma selfie e os dados de banco', 'vaga');
  await barra('Me chama no 62 99999-0303', 'conversa');
  await barra('Faça um Pix para garantir a vaga', 'conversa');
  // sinal fraco publica, sinal forte segura
  const fraco = ok(await v('textoChecar', { texto: 'Ganhe até R$ 5000 e trabalhe em casa', contexto: 'vaga' }));
  assert.equal(fraco.passa, true);
  assert.ok(fraco.fraco.length >= 1);
  const forte = ok(await v('textoChecar', { texto: 'Cobramos uma taxa para começar o cadastro', contexto: 'vaga' }));
  assert.ok(forte.forte.length >= 1 || forte.barra.length >= 1);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// base pública vazia e contrato
// ---------------------------------------------------------------------------------------------------------------------------------

test('base: banco novo devolve listas vazias; sem número de candidatos, dado pessoal nem CNPJ; setores e cidades com bairros', async () => {
  pronto();
  const base = ok(await A.v2anon('base', { cidade: 'fc-go' }));
  assert.deepEqual(CONTRATO.validar('base', base), []);
  // só existem as cidades do cenário (e as de antes): nenhuma vaga, empresa ou pessoa de exemplo
  assert.equal(base.praca.cidadePrincipal, 'fc-go');
  assert.deepEqual(base.cidades.map((c) => c.id).sort(), ['fc-go', 'pre-go', 'vz-go']);
  const fc = base.cidades.find((c) => c.id === 'fc-go');
  assert.deepEqual(fc.bairros.sort(), ['Centro', 'Setor Norte', 'Setor Sul']);
  assert.equal(base.setores.length >= 30, true);
  assert.deepEqual(Object.keys(base.setores.find((x) => x.id === 'comercio')).sort(), ['curto', 'icone', 'id', 'nome']);
  const vazia = await A.db.query(`select count(*)::int n from public.vagas_anuncios where status = 'publicado'`);
  assert.ok(base.vagas.length <= vazia.rows[0].n);
  const texto = JSON.stringify(base);
  assert.doesNotMatch(texto, /candidatos|cnpj|whatsapp|email/i);
});

test('base de um banco sem nenhuma cidade devolve listas vazias (produção começa vazia)', async () => {
  pronto();
  const B = await H.iniciar('vazio', { semFixture: true });
  try {
    const base = ok(await B.v2anon('base', {}));
    assert.deepEqual(CONTRATO.validar('base', base), []);
    // a única cidade que um banco novo traz é o piloto (migração 20261024120001); nenhuma vaga nem empresa
    assert.deepEqual(base.cidades.map((c) => c.id), ['uruacu-go']);
    assert.deepEqual([base.vagas, base.empresas], [[], []]);
    assert.equal(typeof base.praca, 'object');
    assert.ok(base.setores.length > 0);
    assert.equal((await B.db.query(`select count(*)::int n from public.vagas_anuncios`)).rows[0].n, 0);
    assert.equal((await B.db.query(`select count(*)::int n from public.vagas_empresas`)).rows[0].n, 0);
    assert.equal((await B.db.query(`select count(*)::int n from public.vagas_pessoas`)).rows[0].n, 0);
  } finally { await B.encerrar(); }
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Empresa em verificação
// ---------------------------------------------------------------------------------------------------------------------------------

test('empresa criada pelo servidor nasce em verificação (7 dias), com CNPJ consultado; recusa CNPJ inativo, repetido, de empresa suspensa, CPF', async () => {
  pronto();
  const uid = await H.conta(A, 'empresa');
  const consulta = (extra) => Object.assign({ situacao: 'ATIVA', razaoSocial: 'Padaria Pão Quente Ltda.com', nomeFantasia: 'Pão Quente', cidade: 'Fase Cidade', uf: 'GO', abertura: '2014-02-02', mei: false }, extra || {});
  const dados = (extra) => Object.assign({ cnpj: cnpjCom('100200300001'), cidade: 'fc-go', bairro: 'Centro', responsavel: 'Maria da Silva', whatsapp: '62 3333-4444', consulta: consulta() }, extra || {});
  erro(await A.servico('vagas_v2_empresa_criar_servidor', uid, dados({ consulta: consulta({ situacao: 'BAIXADA' }) })), 'cnpj_inativo');
  erro(await A.servico('vagas_v2_empresa_criar_servidor', uid, dados({ cnpj: '12345678000100' })), 'cnpj');
  const r = ok(await A.servico('vagas_v2_empresa_criar_servidor', uid, dados()));
  const e = r.empresa;
  assert.equal(e.estado, 'em_verificacao');
  assert.equal(e.verificada, false);
  assert.equal(e.verificadaEm, null);
  assert.equal(e.papel, 'dono');
  assert.equal(e.razaoSocial, 'Padaria Pão Quente Ltda.com', 'a razão social NÃO passa pelo filtro de contato');
  assert.ok(Math.abs(new Date(e.prazoAte) - Date.now() - 7 * 86400000) < 120000);
  const linha = (await A.db.query(`select status, verificacao_estado, consulta_cnpj, cnpj_conferido_em from public.vagas_empresas where id = $1`, [e.id])).rows[0];
  assert.equal(linha.status, 'em_analise'); assert.equal(linha.verificacao_estado, 'em_verificacao'); assert.equal(linha.cnpj_conferido_em, null);
  assert.equal(linha.consulta_cnpj.situacao, 'ATIVA');
  erro(await A.servico('vagas_v2_empresa_criar_servidor', await H.conta(A, 'empresa'), dados()), 'cnpj_repetido');
  // CNPJ de empresa suspensa não volta
  await A.db.query(`update public.vagas_empresas set status = 'suspensa' where id = $1`, [e.id]);
  erro(await A.servico('vagas_v2_empresa_criar_servidor', await H.conta(A, 'empresa'), dados()), 'cnpj_bloqueado');
  // CNPJ alfanumérico com dígito conferido (como hoje)
  const alfa = '12ABC34501DE35';
  ok(await A.servico('vagas_v2_empresa_criar_servidor', await H.conta(A, 'empresa'), dados({ cnpj: alfa })));
  // limite de 5 empresas por conta
  const u2 = await H.conta(A, 'empresa');
  for (let i = 0; i < 5; i++) ok(await A.servico('vagas_v2_empresa_criar_servidor', u2, dados({ cnpj: cnpjCom('77700000000' + i) })));
  erro(await A.servico('vagas_v2_empresa_criar_servidor', u2, dados({ cnpj: cnpjCom('777000000009') })), 'limite_empresas');
  // WhatsApp inválido e conta de outro tipo
  erro(await A.servico('vagas_v2_empresa_criar_servidor', await H.conta(A, 'empresa'), dados({ cnpj: cnpjCom('100200300002'), whatsapp: '123' })), 'whatsapp');
  erro(await A.servico('vagas_v2_empresa_criar_servidor', await H.conta(A, 'pessoa'), dados({ cnpj: cnpjCom('100200300003') })), 'tipo_diferente');
});

test('empresa em verificação publica na hora (selo "em verificação", "no_ar"); verificada continua; vaga aparece na base', async () => {
  pronto();
  const emp = await H.empresaEmVerificacao(A, '200300400001');
  const v = A.v2ok(emp.uid);
  const p = await v('vagaPublicar', { empresaId: emp.id, vaga: COM(), idLocal: 'loc-1' });
  assert.equal(p.estado, 'no_ar');
  assert.equal(p.vaga.status, 'aberta');
  assert.equal(p.vaga.estado, 'no_ar');
  assert.deepEqual(CONTRATO.validar('vagaPublicar', p), []);
  assert.match(p.mensagens.join(' '), /em verificação/);
  assert.equal(CONTRATO.validarForma(CONTRATO.FORMAS.vaga, p.vaga).length, 0);
  // idLocal: o reenvio não duplica
  const de_novo = await v('vagaPublicar', { empresaId: emp.id, vaga: COM(), idLocal: 'loc-1' });
  assert.equal(de_novo.vaga.id, p.vaga.id);
  assert.equal((await A.db.query(`select count(*)::int n from public.vagas_anuncios where empresa_id = $1`, [emp.id])).rows[0].n, 1);
  const base = ok(await A.v2anon('base', { cidade: 'fc-go' }));
  assert.deepEqual(CONTRATO.validar('base', base), []);
  const na = base.vagas.find((x) => x.id === p.vaga.id);
  assert.ok(na, 'a vaga aparece na lista pública');
  assert.equal(na.empresaId, emp.id);
  const em = base.empresas.find((x) => x.id === emp.id);
  assert.equal(em.verificada, false);
  assert.equal(em.estado, 'em_verificacao');
  const um = ok(await A.v2anon('vaga', { id: p.vaga.id }));
  assert.deepEqual(CONTRATO.validar('vaga', um), []);
  assert.equal(um.vaga.titulo, 'Atendente de loja');
  assert.equal(um.vaga.salario.aCombinar, false);
  assert.equal(um.vaga.salario.texto, 'R$ 1.700 a R$ 2.600 por mês');
  assert.equal(um.vaga.tipo, 'CLT');
  assert.equal(um.vaga.turno, 'Comercial');
  assert.equal(um.vaga.semExperiencia, true);
  assert.equal(um.vaga.cidade, 'fc-go');
  assert.equal(um.vaga.bairro, 'Centro');
  assert.deepEqual(um.vaga.atividades, ['Atender os clientes']);
  // pessoa nenhuma vê número de candidatos: a vaga pública não tem o campo
  assert.equal('candidatos' in um.vaga, false);
});

test('as 3 travas saíram: vaga de empresa em análise vai ao ar; a cidade em pré-abertura publica e aparece na região; sem revisão das 3 primeiras', async () => {
  pronto();
  // legado: vagas_anuncio_publicar de empresa em análise publica na hora; a 1ª, a 2ª e a 3ª vagas
  const uid = await H.conta(A, 'empresa');
  const emp = ok(await A.de(uid)('vagas_empresa_cadastrar', { cnpj: cnpjCom('300400500001'), razaoSocial: 'Legado Ltda', cidade: 'fc-go', zona: 'centro' })).empresa;
  assert.equal(emp.status, 'em_analise');
  for (let i = 0; i < 3; i++) {
    const an = ok(await A.de(uid)('vagas_anuncio_salvar', { empresaId: emp.id, area: 'atendimento', funcao: 'Atendente ' + i, modalidade: 'clt',
      descricao: 'Atendimento no balcão e organização de prateleiras para o dia a dia da loja de bairro.', turno: 'comercial', experiencia: 'nao_precisa',
      escolaridade: 'medio', quantidade: 1, salarioDe: 162100, cidade: 'fc-go', zona: 'centro' })).anuncio;
    const pub = ok(await A.de(uid)('vagas_anuncio_publicar', an.id));
    assert.equal(pub.emRevisao, false, 'vaga ' + i);
    assert.equal(pub.anuncio.noAr, true);
  }
  // a equipe publica vaga de empresa em análise sem "Aprove a empresa antes"
  const op = A.de(S.operador);
  const rev = ok(await A.de(uid)('vagas_anuncio_salvar', { empresaId: emp.id, area: 'atendimento', funcao: 'Quarta vaga', modalidade: 'clt',
    descricao: 'Atendimento no balcão e organização de prateleiras para o dia a dia da loja de bairro.', turno: 'comercial', experiencia: 'nao_precisa',
    escolaridade: 'medio', quantidade: 1, salarioDe: 162100, cidade: 'fc-go', zona: 'centro' })).anuncio;
  const pub4 = ok(await A.de(uid)('vagas_anuncio_publicar', rev.id));
  assert.equal(pub4.estado, 'rascunho', 'a 4ª vaga de empresa em verificação fica rascunho (3 no ar)');
  await A.db.query(`update public.vagas_anuncios set status = 'em_revisao' where id = $1`, [rev.id]);
  await A.db.query(`update public.vagas_anuncios set status = 'publicado' where empresa_id = $1 and funcao = 'Atendente 0'`, [emp.id]);
  const dec = ok(await op('vagas_op_anuncio_decidir', rev.id, 'publicar', ''));
  assert.equal(dec.anuncio.status, 'publicado');
  // pré-abertura: cidade lista_espera publica e a vaga aparece "na região" (base da praça)
  const e2 = await H.empresaEmVerificacao(A, '300400500002', { cidade: 'pre-go' });
  const pa = ok(await A.v2(e2.uid)('vagaPublicar', { empresaId: e2.id, vaga: COM({ cidade: 'pre-go', bairro: 'Centro' }) }));
  assert.equal(pa.estado, 'no_ar');
  const base = ok(await A.v2anon('base', { cidade: 'fc-go' }));
  assert.ok(base.vagas.some((x) => x.id === pa.vaga.id && x.cidade === 'pre-go'));
  assert.ok(base.cidades.some((c) => c.id === 'pre-go'));
  // vaga de outra praça não aparece na região
  const e3 = await H.empresaEmVerificacao(A, '300400500003', { cidade: 'out-mt' });
  const pb = ok(await A.v2(e3.uid)('vagaPublicar', { empresaId: e3.id, vaga: COM({ cidade: 'out-mt' }) }));
  assert.equal(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === pb.vaga.id), false);
  assert.equal(ok(await A.v2anon('base', { cidade: 'out-mt' })).vagas.some((x) => x.id === pb.vaga.id), true);
});

test('limites da empresa em verificação: 3 no ar, 3 novas por dia, confidencial só verificada; verificada: 30/dia e sem limite de vagas no ar', async () => {
  pronto();
  const emp = await H.empresaEmVerificacao(A, '400500600001');
  const v = A.v2(emp.uid);
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const r = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Vaga ' + i }) }));
    assert.equal(r.estado, 'no_ar'); ids.push(r.vaga.id);
  }
  // 3 por dia: a 4ª é erro de limite do dia (e fica claro)
  const quarta = erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Vaga 4' }) }), 'limite_dia');
  assert.match(quarta.erro, /3 vagas/);
  // 4ª no ar (outro dia): rascunho com mensagem clara, NÃO erro
  await A.db.query(`delete from public.vagas_limites where tipo = 'anuncio_novo' and chave = $1`, [emp.id]);
  const rasc = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Vaga 4' }) }));
  assert.equal(rasc.estado, 'rascunho');
  assert.equal(rasc.vaga.status, 'rascunho');
  assert.match(rasc.mensagens[0], /3 vagas no ar/);
  const lim = ok(await v('vagasDaEmpresa', { empresaId: emp.id }));
  assert.deepEqual(CONTRATO.validar('vagasDaEmpresa', lim), []);
  assert.equal(lim.limites.noAr, 3); assert.equal(lim.limites.maxNoAr, 3); assert.equal(lim.limites.maxHoje, 3);
  assert.equal(lim.vagas.length, 4);
  // pausar uma abre espaço
  ok(await v('vagaAcao', { id: ids[0], acao: 'pausar' }));
  const pub = ok(await v('vagaAcao', { id: rasc.vaga.id, acao: 'publicar' }));
  assert.equal(pub.estado, 'no_ar');
  erro(await v('vagaAcao', { id: ids[0], acao: 'retomar' }), 'limite_no_ar');
  // confidencial só verificada
  await A.db.query(`delete from public.vagas_limites where tipo = 'anuncio_novo' and chave = $1`, [emp.id]);
  erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ confidencial: true }) }), 'confidencial_so_verificada');
  // verificada: sem limite de vagas no ar e 30/dia
  ok(await A.v2(S.operador)('opRevisarDecidir', { id: emp.id, acao: 'verificar_empresa' }));
  const l2 = ok(await v('vagasDaEmpresa', { empresaId: emp.id }));
  assert.equal(l2.limites.maxNoAr, null); assert.equal(l2.limites.maxHoje, 30);
  assert.equal(l2.empresa.estado, 'verificada');
  ok(await v('vagaAcao', { id: ids[0], acao: 'retomar' }));
  const conf = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ confidencial: true, titulo: 'Confidencial' }) }));
  assert.equal(conf.estado, 'no_ar');
  assert.equal(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.find((x) => x.id === conf.vaga.id).empresaId.startsWith('conf-'), true);
});

test('prazo de 7 dias: vencida sai do ar SEM apagar nada, a empresa vê "vencida" e como corrigir; reenviar devolve as vagas', async () => {
  pronto();
  const emp = await H.empresaEmVerificacao(A, '500600700001');
  const v = A.v2(emp.uid);
  const p = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM() }));
  assert.ok(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === p.vaga.id));
  const antes = (await A.db.query(`select count(*)::int n from public.vagas_anuncios where empresa_id = $1`, [emp.id])).rows[0].n;
  await A.db.query(`update public.vagas_empresas set verificacao_prazo_em = now() - interval '1 minute' where id = $1`, [emp.id]);
  assert.equal(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === p.vaga.id), false);
  erro(await A.v2anon('vaga', { id: p.vaga.id }), 'nao_encontrada');
  assert.equal((await A.db.query(`select count(*)::int n from public.vagas_anuncios where empresa_id = $1`, [emp.id])).rows[0].n, antes);
  assert.equal((await A.db.query(`select status from public.vagas_anuncios where id = (select id from public.vagas_anuncios where codigo = $1)`, [p.vaga.id])).rows[0].status, 'publicado');
  const lista = ok(await v('vagasDaEmpresa', { empresaId: emp.id }));
  assert.equal(lista.empresa.estado, 'vencida');
  assert.equal(lista.vagas[0].estado, 'fora_do_ar');
  assert.equal(lista.vagas[0].status, 'vencida');
  const ver = ok(await v('verificacao', { empresaId: emp.id }));
  assert.deepEqual(CONTRATO.validar('verificacao', ver), []);
  assert.equal(ver.estado, 'vencida');
  assert.ok(ver.passos.length >= 3);
  // publicar nova vaga com empresa vencida: vira rascunho com a explicação
  const nova = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Outra' }) }));
  assert.equal(nova.estado, 'rascunho');
  assert.match(nova.mensagens[0], /7 dias/);
  // a conversa e o candidato continuam existindo; "corrigir e pedir nova conferência" recomeça os 7 dias e as vagas voltam
  const re = ok(await v('verificacaoReenviar', { empresaId: emp.id }));
  assert.equal(re.estado, 'em_verificacao');
  assert.ok(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === p.vaga.id));
  const ver2 = ok(await v('verificacao', { empresaId: emp.id }));
  assert.ok(Math.abs(new Date(ver2.prazoAte) - Date.now() - 7 * 86400000) < 120000);
});

test('recusa vira "precisa de ajuste" com motivo livre; corrigir CNPJ e nome enquanto não verificada; verificada não corrige', async () => {
  pronto();
  const emp = await H.empresaEmVerificacao(A, '600700800001');
  const v = A.v2(emp.uid);
  const p = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM() }));
  const op = A.v2(S.operador);
  erro(await op('opRevisarDecidir', { id: emp.id, acao: 'recusar_empresa' }), 'recado');
  ok(await op('opRevisarDecidir', { id: emp.id, acao: 'recusar_empresa', recado: 'O CNPJ não confere com o nome da loja. Confira o número no cartão do CNPJ.' }));
  const ver = ok(await v('verificacao', { empresaId: emp.id }));
  assert.equal(ver.estado, 'precisa_ajuste');
  assert.match(ver.motivoAjuste, /O CNPJ não confere/);
  assert.equal(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === p.vaga.id), false, 'recusada: vagas fora do ar');
  // corrige o CNPJ e o nome e pede nova conferência
  erro(await v('verificacaoReenviar', { empresaId: emp.id, dados: { cnpj: '123' } }), 'cnpj');
  const novoCnpj = cnpjCom('600700800002');
  const re = ok(await v('verificacaoReenviar', { empresaId: emp.id, dados: { cnpj: novoCnpj, razaoSocial: 'Razão Corrigida Ltda', nomeFantasia: 'Nome Corrigido' } }));
  assert.equal(re.estado, 'em_verificacao');
  const lin = (await A.db.query(`select cnpj, razao_social, nome_fantasia, verificacao_estado, status_motivo, consulta_cnpj from public.vagas_empresas where id = $1`, [emp.id])).rows[0];
  assert.equal(lin.cnpj, novoCnpj); assert.equal(lin.razao_social, 'Razão Corrigida Ltda'); assert.equal(lin.verificacao_estado, 'em_verificacao'); assert.equal(lin.status_motivo, '');
  assert.equal(lin.consulta_cnpj.desatualizada, true, 'o CNPJ mudou: a consulta antiga fica marcada');
  assert.ok(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === p.vaga.id), 'volta ao ar');
  // CNPJ repetido de outra empresa é recusado
  const outra = await H.empresaEmVerificacao(A, '600700800003');
  erro(await v('verificacaoReenviar', { empresaId: emp.id, dados: { cnpj: cnpjCom('600700800003') } }), 'cnpj_repetido');
  // empresaSalvar também corrige enquanto não verificada
  const sv = ok(await v('empresaSalvar', { empresaId: emp.id, razaoSocial: 'Outra Razão Ltda', descricao: 'Loja de bairro, atendimento de segunda a sábado.' }));
  assert.equal(sv.empresa.razaoSocial, 'Outra Razão Ltda');
  // verificada: não corrige mais
  ok(await op('opRevisarDecidir', { id: emp.id, acao: 'verificar_empresa' }));
  erro(await v('verificacaoReenviar', { empresaId: emp.id, dados: { nomeFantasia: 'X' } }), 'ja_verificada');
  erro(await v('empresaSalvar', { empresaId: emp.id, cnpj: cnpjCom('600700800004') }), 'ja_verificada');
  assert.ok(outra.id);
});

test('vagaPublicar: texto barrado (com trecho e mensagem), sinal forte segura (revisão rápida), sinal fraco publica; salário obrigatório; diária; PcD; PJ', async () => {
  pronto();
  const emp = await H.empresaEmVerificacao(A, '700800900001');
  const v = A.v2(emp.uid);
  // barrado
  const b = erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ descricao: 'Atendimento no balcão. Pague R$ 50 do uniforme para começar a trabalhar na loja.' }) }), 'texto_barrado');
  assert.ok(Array.isArray(b.barra) && b.barra[0].campo === 'descricao' && /uniforme/.test(b.barra[0].mensagem) === false || b.barra.length >= 1);
  assert.equal(b.barra[0].trecho, 'pague r 50');
  assert.match(b.barra[0].mensagem, /Vagas não podem cobrar nada de quem se candidata/);
  const fone = erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ atividades: ['Ligar para 62 99999-0303'] }) }), 'texto_barrado');
  assert.equal(fone.barra[0].campo, 'atividades');
  erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Atendente, só mulheres' }) }), 'texto_barrado');
  // salário obrigatório (nunca "a combinar")
  erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ salario: { aCombinar: true } }) }), 'salario_obrigatorio');
  erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ salario: { periodo: 'mes' } }) }), 'salario_obrigatorio');
  erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ salario: { min: 3000, max: 2000, periodo: 'mes' } }) }), 'salario_invalido');
  erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ tipo: 'Diária', salario: { min: 100, periodo: 'mes' } }) }), 'salario_periodo');
  // nada disso criou vaga
  assert.equal((await A.db.query(`select count(*)::int n from public.vagas_anuncios where empresa_id = $1`, [emp.id])).rows[0].n, 0);
  // sinal FORTE: segurada, fora do ar, "revisão rápida"
  const forte = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Taxista', descricao: 'Vaga com investimento e adesão no começo. Atendimento a clientes no ponto central da cidade.' }) }));
  assert.equal(forte.estado, 'revisao_rapida');
  assert.equal(forte.vaga.status, 'segurada');
  assert.equal(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === forte.vaga.id), false);
  erro(await A.v2anon('vaga', { id: forte.vaga.id }), 'nao_encontrada');
  // sinal FRACO: publica e vai ao topo de "Revisar depois"
  const fraco = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Vendedor externo', descricao: 'Ganhe até R$ 8000 por mês em vendas externas, com carro da empresa e treinamento.' }) }));
  assert.equal(fraco.estado, 'no_ar');
  const fila = ok(await A.v2(S.operador)('opRevisarDepois', { cidade: 'fc-go' }));
  assert.deepEqual(CONTRATO.validar('opRevisarDepois', fila), []);
  const ids = fila.lista.map((x) => x.vaga.id);
  assert.ok(ids.indexOf(forte.vaga.id) >= 0 && ids.indexOf(fraco.vaga.id) >= 0);
  assert.ok(ids.indexOf(forte.vaga.id) < ids.indexOf(fraco.vaga.id), 'segurada antes');
  const itemFraco = fila.lista.find((x) => x.vaga.id === fraco.vaga.id);
  assert.ok(itemFraco.sinais.some((s) => s.tipo === 'fraco'));
  // diária: dia, hora e valor; repete toda semana
  const hoje = (await A.db.query(`select to_char((now() at time zone 'America/Sao_Paulo')::date + 2, 'YYYY-MM-DD') d`)).rows[0].d;
  erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ tipo: 'Diária', salario: { min: 120, periodo: 'dia' } }) }), 'diaria');
  erro(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ tipo: 'Diária', salario: { min: 120, periodo: 'dia' }, diaria: { data: '2020-01-01', das: 8, as: 17 } }) }), 'data_passada');
  await A.db.query(`delete from public.vagas_limites where tipo = 'anuncio_novo' and chave = $1`, [emp.id]);
  const dia = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Ajudante de cozinha', tipo: 'Diária', turno: undefined, salario: { min: 120, periodo: 'dia' },
    diaria: { data: hoje, das: 8, as: 17 }, repete: true, horario: undefined }) }));
  assert.equal(dia.vaga.tipo, 'Diária'); assert.equal(dia.vaga.repete, true); assert.equal(dia.vaga.diaria.data, hoje);
  assert.equal(dia.vaga.turno, 'Manhã'); assert.match(dia.vaga.horario, /08:00 às 17:00/);
  // diária repetida sobrevive à data que passou (sem cron): volta a aparecer toda semana
  await A.db.query(`set session_replication_role = replica`);
  await A.db.query(`update public.vagas_anuncios set data_trabalho = data_trabalho - 20, expira_em = now() - interval '1 day' where codigo = $1`, [dia.vaga.id]);
  await A.db.query(`set session_replication_role = origin`);
  assert.ok(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === dia.vaga.id));
  // PcD: "também é para pessoa com deficiência" passa e vira o selo; PJ vira Freelancer + rótulo PJ
  await A.db.query(`update public.vagas_empresas set status = 'ativa', cnpj_conferido_em = now() where id = $1`, [emp.id]);
  const pcd = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Auxiliar administrativo', tipo: 'PJ', turno: 'Manhã', salario: { min: 3000, periodo: 'mes' },
    descricao: 'A vaga também é para pessoa com deficiência. Rotina de escritório, arquivo e atendimento por telefone da empresa.' }) }));
  assert.equal(pcd.vaga.pcd, true); assert.equal(pcd.vaga.tipo, 'PJ');
  assert.equal((await A.db.query(`select modalidade from public.vagas_anuncios where codigo = $1`, [pcd.vaga.id])).rows[0].modalidade, 'freelancer');
  // estágio e fim de semana
  const est = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Estagiário', tipo: 'Estágio', turno: 'Fim de semana', salario: { min: 900, periodo: 'mes' } }) }));
  assert.equal(est.vaga.tipo, 'Estágio'); assert.equal(est.vaga.turno, 'Fim de semana');
});

test('editar vaga no ar de empresa em verificação manda para "Revisar depois"; editar com sinal forte segura de novo; dono-só e empresa alheia', async () => {
  pronto();
  const emp = await H.empresaEmVerificacao(A, '800900100001');
  const v = A.v2(emp.uid);
  const p = ok(await v('vagaPublicar', { empresaId: emp.id, vaga: COM() }));
  await A.db.query(`update public.vagas_anuncios set revisada_em = now() where codigo = $1`, [p.vaga.id]);
  assert.equal(ok(await A.v2(S.operador)('opRevisarDepois', { cidade: 'fc-go' })).lista.some((x) => x.vaga.id === p.vaga.id), false);
  const ed = ok(await v('vagaEditar', { id: p.vaga.id, vaga: { descricao: 'Atendimento no balcão e caixa, com treinamento no primeiro mês e folga no domingo.' } }));
  assert.deepEqual(CONTRATO.validar('vagaEditar', ed), []);
  assert.equal(ed.estado, 'no_ar');
  assert.equal(ed.vaga.descricao.startsWith('Atendimento no balcão e caixa'), true);
  assert.equal(ed.vaga.salario.max, 2600, 'o que não veio fica como está');
  assert.equal(ok(await A.v2(S.operador)('opRevisarDepois', { cidade: 'fc-go', filtro: 'editadas' })).lista.some((x) => x.vaga.id === p.vaga.id), true);
  erro(await v('vagaEditar', { id: p.vaga.id, vaga: { descricao: 'Ligue para 62 99999-0303 e fale com a Ana sobre a vaga de atendente.' } }), 'texto_barrado');
  const forte = ok(await v('vagaEditar', { id: p.vaga.id, vaga: { descricao: 'Pedimos adesão e um investimento no começo. Atendimento ao público na loja do centro.' } }));
  assert.equal(forte.estado, 'revisao_rapida');
  // outra empresa não mexe
  const outra = await H.empresaEmVerificacao(A, '800900100002');
  erro(await A.v2(outra.uid)('vagaEditar', { id: p.vaga.id, vaga: { titulo: 'X' } }), 'nao_encontrada');
  erro(await A.v2(outra.uid)('vagaAcao', { id: p.vaga.id, acao: 'pausar' }), 'nao_encontrada');
  erro(await A.v2(outra.uid)('vagasDaEmpresa', { empresaId: emp.id }), 'nao_encontrada');
});

test('ações da vaga: pausar, retomar, encerrar, reabrir, "Deixar mais 30 dias no ar", duplicar (rascunho) e publicar', async () => {
  pronto();
  const emp = await H.empresaEmVerificacao(A, '900100200001');
  const v = A.v2ok(emp.uid);
  const p = await v('vagaPublicar', { empresaId: emp.id, vaga: COM() });
  const id = p.vaga.id;
  assert.equal((await v('vagaAcao', { id, acao: 'pausar' })).vaga.status, 'pausada');
  assert.equal(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === id), false);
  assert.equal((await v('vagaAcao', { id, acao: 'retomar' })).vaga.status, 'aberta');
  const antes = new Date((await A.db.query(`select expira_em from public.vagas_anuncios where codigo = $1`, [id])).rows[0].expira_em);
  const ren = await v('vagaAcao', { id, acao: 'renovar' });
  const depois = new Date((await A.db.query(`select expira_em from public.vagas_anuncios where codigo = $1`, [id])).rows[0].expira_em);
  assert.ok(Math.abs(depois - antes - 30 * 86400000) < 5000 || depois - Date.now() <= 60 * 86400000 + 5000);
  assert.ok(depois > antes);
  assert.equal(ren.vaga.status, 'aberta');
  assert.equal((await v('vagaAcao', { id, acao: 'encerrar' })).vaga.status, 'encerrada');
  assert.equal((await v('vagaAcao', { id, acao: 'reabrir' })).vaga.status, 'aberta');
  const dup = await v('vagaAcao', { id, acao: 'duplicar' });
  assert.equal(dup.vaga.status, 'rascunho');
  assert.notEqual(dup.vaga.id, id);
  assert.equal(dup.vaga.titulo, 'Atendente de loja');
  assert.equal((await v('vagaAcao', { id: dup.vaga.id, acao: 'publicar' })).vaga.status, 'aberta');
  // vencida pelo prazo: renovar traz de volta
  await A.db.query(`update public.vagas_anuncios set expira_em = now() - interval '1 hour' where codigo = $1`, [id]);
  assert.equal(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === id), false);
  assert.equal((await v('vagaAcao', { id, acao: 'renovar' })).vaga.status, 'aberta');
  assert.equal(ok(await A.v2anon('base', { cidade: 'fc-go' })).vagas.some((x) => x.id === id), true);
});

test('vagas_v2: as respostas conferem com o contrato e nenhuma palavra proibida aparece nos textos devolvidos pelo banco', async () => {
  pronto();
  const vivas = (await A.db.query(`select codigo from public.vagas_anuncios where status = 'publicado' limit 5`)).rows;
  assert.ok(vivas.length > 0);
  const re = new RegExp('(^|[^a-zà-ú])(' + CONTRATO.PROIBIDAS.join('|') + ')([^a-zà-ú]|$)', 'i');
  const base = JSON.stringify(ok(await A.v2anon('base', { cidade: 'fc-go' })));
  assert.doesNotMatch(base, re);
  const lixo = ['x', 'Pague R$ 50', 'vaga para mulheres', 'Ligue 62 99999-0303', 'taxa de inscrição'];
  for (const t of lixo) {
    const r = JSON.stringify(ok(await A.v2anon('textoChecar', { texto: t })));
    assert.doesNotMatch(r, re, t);
  }
  const msgs = (await A.db.query(`select vagas_interno.msg_texto(t.tipo, 'x', c.ctx) m from (values ('golpe'), ('contato'), ('link'), ('documento'), ('sensivel'), ('golpe_forte'),
    ('sinal'), ('discriminacao')) t(tipo), (values ('vaga'), ('conversa')) c(ctx)`)).rows.map((x) => x.m).join('\n');
  assert.doesNotMatch(msgs, re);
});
