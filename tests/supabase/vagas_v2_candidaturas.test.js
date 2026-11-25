'use strict';
// Banco da Vagas sem Caos v2: pessoa (perfil mínimo, currículo, salvas, escondidas, alertas), candidatura (anexo | montar | minimo), regra 1A de
// privacidade (empresa em verificação x verificada), "quem viu meu currículo", etapas, entrevista, conversa, denúncia e storage. A equipe/operador
// NUNCA lê pessoa, currículo, contato nem candidatura. Roda num Postgres 17 EMBUTIDO com todas as migrações.
//
// Rodar: node --test --test-concurrency=1 tests/supabase/vagas_v2_candidaturas.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const H = require('./_vagas_v2_ajuda.js');
const { erro, ok, COM, cnpjCom, CONTRATO } = H;

let A = null;
let S = null;
const X = {};
let falha = null;
test.before(async () => {
  try {
    A = await H.iniciar('cand');
    S = await H.cenario(A);
    X.verif = await H.empresaVerificada(A, S, '111222333001');
    X.emv = await H.empresaEmVerificacao(A, '111222333002');
    X.vV = ok(await A.v2(X.verif.uid)('vagaPublicar', { empresaId: X.verif.id, vaga: COM({ titulo: 'Vendedor da loja verificada' }) })).vaga;
    X.vE = ok(await A.v2(X.emv.uid)('vagaPublicar', { empresaId: X.emv.id, vaga: COM({ titulo: 'Vendedor da loja em verificação' }) })).vaga;
  } catch (e) { falha = e; }
});
test.after(async () => { if (A) await A.encerrar(); });
function pronto() { if (falha) throw falha; if (!A) throw new Error('Postgres embutido não iniciou'); }
const arquivo = async (uid, nome) => {
  const caminho = uid + '/' + crypto.randomUUID() + (nome || '.pdf');
  await A.db.query(`insert into storage.objects (bucket_id, name) values ('vagas-curriculos', $1)`, [caminho]);
  return caminho;
};
const PERFIL = (extra) => Object.assign({ nome: 'Ana Paula Rezende', whatsapp: '(62) 99123-4567', email: 'ana@exemplo.teste', cidade: 'fc-go', bairro: 'Vila Santana' }, extra || {});
const CHAVES_PROIBIDAS = /(^| )(nota|score|pontuacao|ranking|compatibilidade|aderencia|idade|nascimento|estadoCivil|sexo|genero|foto|cpf|rg|nacionalidade|encaixe)( |$)/i;

test('perfilSalvar: a pessoa mínima (nome, WhatsApp, e-mail, cidade) existe; nome com 2 letras vale; 1 letra não; eu() devolve tudo na forma do contrato', async () => {
  pronto();
  const uid = await H.conta(A, 'pessoa', 'ana@exemplo.teste');
  const v = A.v2(uid);
  erro(await v('perfilSalvar', PERFIL({ nome: 'A' })), 'nome_invalido');
  erro(await v('perfilSalvar', PERFIL({ whatsapp: '123' })), 'whatsapp_invalido');
  erro(await v('perfilSalvar', PERFIL({ cidade: 'nao-existe-go' })), 'cidade_invalida');
  erro(await v('perfilSalvar', PERFIL({ nome: 'Ana www.golpe.com.br' })), 'texto_barrado');
  ok(await v('perfilSalvar', PERFIL({ nome: 'Jo' })));
  const eu0 = ok(await v('eu'));
  assert.deepEqual(CONTRATO.validar('eu', eu0), []);
  assert.equal(eu0.conta.nome, 'Jo'); assert.equal(eu0.conta.tipo, 'pessoa'); assert.equal(eu0.conta.whatsapp, '5562991234567'); assert.equal(eu0.conta.id, uid);
  assert.deepEqual(eu0.salvas, []); assert.deepEqual(eu0.escondidas, []); assert.deepEqual(eu0.alertas, []); assert.equal(eu0.curriculo.arquivo, null);
  // currículo completo: o que não vem fica como está
  ok(await v('perfilSalvar', PERFIL({ funcao: 'Operador(a) de caixa', escolaridade: 'Ensino médio completo', cursos: ['Atendimento ao cliente'], cnh: ['B'],
    turnos: ['Manhã', 'Tarde'], pretensao: 1800, tempo: '3 anos', resumo: 'Trabalhei como caixa em mercearia.',
    experiencias: [{ cargo: 'Caixa', empresa: 'Mercearia Dois Coqueiros', inicio: '2022-03', fim: '2024-08' }] })));
  ok(await v('perfilSalvar', { nome: 'Ana Paula Rezende', whatsapp: '62991234567', cidade: 'fc-go', bairro: 'Vila Santana' }));
  const eu = ok(await v('eu'));
  const d = eu.curriculo.dados;
  assert.equal(d.funcao, 'Operador(a) de caixa'); assert.equal(d.escolaridade, 'Ensino médio completo'); assert.deepEqual(d.cnh, ['B']);
  assert.deepEqual(d.turnos, ['Manhã', 'Tarde']); assert.equal(d.pretensao, 1800); assert.equal(d.tempo, '3 anos'); assert.equal(d.bairro, 'Vila Santana');
  assert.deepEqual(d.experiencias, [{ cargo: 'Caixa', empresa: 'Mercearia Dois Coqueiros', inicio: '2022-03', fim: '2024-08' }]);
  assert.equal(d.cidade, 'fc-go'); assert.deepEqual(d.cursos, ['Atendimento ao cliente']);
  // nenhum campo de dado proibido
  assert.doesNotMatch(Object.keys(d).join(' '), CHAVES_PROIBIDAS);
  erro(await v('perfilSalvar', PERFIL({ experiencias: [{ cargo: 'Caixa', inicio: '2090-01' }] })), 'experiencias_invalidas');
  erro(await v('perfilSalvar', PERFIL({ escolaridade: 'Doutorado em nada' })), 'escolaridade_invalida');
  // empresa não usa as RPCs da pessoa
  erro(await A.v2(X.verif.uid)('perfilSalvar', PERFIL()));
  erro(await A.v2anon('eu', {}).catch((e) => ({ ok: false, erro: String(e.message) })));
});

test('curriculoGuardar / curriculoApagar: confere o objeto no bucket privado, o prefixo da pessoa, o tipo e o tamanho; apaga registro e objeto', async () => {
  pronto();
  const uid = await H.pessoa(A, 'Beatriz Lima');
  const v = A.v2(uid);
  const outro = await H.pessoa(A, 'Carlos Dias');
  erro(await v('curriculoGuardar', { caminho: outro + '/x.pdf', nome: 'x.pdf', tamanhoKb: 10, tipo: 'application/pdf' }), 'arquivo_invalido');
  erro(await v('curriculoGuardar', { caminho: uid + '/nao-enviado.pdf', nome: 'x.pdf', tamanhoKb: 10, tipo: 'application/pdf' }), 'arquivo_ausente');
  const c1 = await arquivo(uid);
  erro(await v('curriculoGuardar', { caminho: c1, nome: 'x.exe', tamanhoKb: 10, tipo: 'application/x-msdownload' }), 'arquivo_invalido');
  erro(await v('curriculoGuardar', { caminho: c1, nome: 'x.pdf', tamanhoKb: 20000, tipo: 'application/pdf' }), 'arquivo_grande');
  const g = ok(await v('curriculoGuardar', { caminho: c1, nome: 'Meu currículo.pdf', tamanhoKb: 123.4, tipo: 'application/pdf' }));
  assert.deepEqual(CONTRATO.validar('curriculoGuardar', g), []);
  assert.deepEqual([g.arquivo.nome, g.arquivo.tamanhoKb, g.arquivo.tipo], ['Meu currículo.pdf', 124, 'application/pdf']);
  assert.equal(ok(await v('eu')).curriculo.arquivo.nome, 'Meu currículo.pdf');
  // trocar de arquivo tira o antigo
  const c2 = await arquivo(uid, '.docx');
  ok(await v('curriculoGuardar', { caminho: c2, nome: 'novo.docx', tamanhoKb: 50, tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  assert.equal((await A.db.query(`select count(*)::int n from storage.objects where name = $1`, [c1])).rows[0].n, 0);
  assert.equal((await A.db.query(`select count(*)::int n from storage.objects where name = $1`, [c2])).rows[0].n, 1);
  const ap = ok(await v('curriculoApagar'));
  assert.equal(ap.removido, c2);
  assert.equal(ok(await v('eu')).curriculo.arquivo, null);
  assert.equal((await A.db.query(`select count(*)::int n from storage.objects where name = $1`, [c2])).rows[0].n, 0);
  ok(await v('curriculoApagar'));
});

test('storage (RLS): a pessoa grava, lê e apaga só o próprio prefixo; a empresa NÃO lê currículo; membro grava documento só na pasta da empresa', async () => {
  pronto();
  const a = await H.pessoa(A, 'Daniela Matos');
  const b = await H.pessoa(A, 'Eduardo Pinto');
  const nome = (u) => u + '/' + crypto.randomUUID() + '.pdf';
  const ins = (uid, bucket, name) => A.como('authenticated', uid, `insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, name]);
  const proprio = nome(a);
  await ins(a, 'vagas-curriculos', proprio);
  await H.rejeita(ins(a, 'vagas-curriculos', nome(b)), /row-level security/);
  await H.rejeita(ins(X.verif.uid, 'vagas-curriculos', nome(X.verif.uid)), /row-level security/);
  const ver = (uid, name) => A.como('authenticated', uid, `select count(*)::int n from storage.objects where bucket_id = 'vagas-curriculos' and name = $1`, [name]);
  assert.equal((await ver(a, proprio)).rows[0].n, 1);
  assert.equal((await ver(b, proprio)).rows[0].n, 0, 'outra pessoa não lê');
  assert.equal((await ver(X.verif.uid, proprio)).rows[0].n, 0, 'a empresa não lê o currículo direto (só pelo link assinado do servidor)');
  assert.equal((await ver(S.operador, proprio)).rows[0].n, 0, 'a equipe não lê');
  assert.equal((await A.como('authenticated', b, `delete from storage.objects where bucket_id = 'vagas-curriculos' and name = $1`, [proprio])).rowCount, 0);
  assert.equal((await A.como('authenticated', a, `delete from storage.objects where bucket_id = 'vagas-curriculos' and name = $1`, [proprio])).rowCount, 1);
  await H.rejeita(A.como('anon', null, `insert into storage.objects (bucket_id, name) values ('vagas-curriculos', $1)`, [nome(a)]), /row-level security|permission denied/);
  // verificação: só membro, na pasta da empresa
  const doc = X.emv.id + '/' + crypto.randomUUID() + '.pdf';
  await ins(X.emv.uid, 'vagas-verificacao', doc);
  await H.rejeita(ins(X.verif.uid, 'vagas-verificacao', X.emv.id + '/' + crypto.randomUUID() + '.pdf'), /row-level security/);
  await H.rejeita(ins(a, 'vagas-verificacao', X.emv.id + '/' + crypto.randomUUID() + '.pdf'), /row-level security/);
  await H.rejeita(ins(X.emv.uid, 'vagas-verificacao', 'nao-e-uuid/x.pdf'), /row-level security/);
  const ve = (uid) => A.como('authenticated', uid, `select count(*)::int n from storage.objects where bucket_id = 'vagas-verificacao' and name = $1`, [doc]);
  assert.equal((await ve(X.emv.uid)).rows[0].n, 1);
  assert.equal((await ve(X.verif.uid)).rows[0].n, 0);
  assert.equal((await ve(a)).rows[0].n, 0);
});

test('vagaSalvar, vagaEsconder (os "pulos" antigos viram escondidas) e alertas; a lista de espera antiga vira alertas sem enviar nada', async () => {
  pronto();
  const uid = await H.pessoa(A, 'Fabiana Rocha');
  const v = A.v2ok(uid);
  assert.deepEqual((await v('vagaSalvar', { vagaId: X.vV.id, salvar: true })).salvas, [X.vV.id]);
  assert.deepEqual((await v('vagaSalvar', { vagaId: X.vV.id, salvar: true })).salvas, [X.vV.id], 'idempotente');
  erro(await A.v2(uid)('vagaSalvar', { vagaId: 'ZZZZZZ', salvar: true }), 'nao_encontrada');
  assert.deepEqual((await v('vagaEsconder', { vagaId: X.vE.id, esconder: true })).escondidas, [X.vE.id]);
  assert.deepEqual((await v('vagaSalvar', { vagaId: X.vV.id, salvar: false })).salvas, []);
  // esconder tira das salvas; mostrar de novo desfaz
  await v('vagaSalvar', { vagaId: X.vE.id, salvar: true });
  assert.deepEqual((await v('vagaEsconder', { vagaId: X.vE.id, esconder: true })).escondidas, [X.vE.id]);
  assert.deepEqual(ok(await A.v2(uid)('eu')).salvas, []);
  assert.deepEqual((await v('vagaEsconder', { vagaId: X.vE.id, esconder: false })).escondidas, []);
  // pulo antigo (legado) aparece como escondida na leitura; e some ao mostrar de novo
  const an = (await A.db.query(`select id from public.vagas_anuncios where codigo = $1`, [X.vV.id])).rows[0].id;
  await A.db.query(`insert into public.vagas_pulos (pessoa_id, anuncio_id) select user_id, $2 from public.vagas_pessoas where user_id = $1`, [uid, an]);
  assert.deepEqual(ok(await A.v2(uid)('eu')).escondidas, [X.vV.id]);
  assert.deepEqual((await v('vagaEsconder', { vagaId: X.vV.id, esconder: false })).escondidas, []);
  // alertas
  erro(await A.v2(uid)('alertaSalvar', {}), 'alerta_vazio');
  erro(await A.v2(uid)('alertaSalvar', { cidade: 'nao-existe-go' }), 'cidade_invalida');
  const al = await v('alertaSalvar', { funcao: 'Caixa', setorId: 'comercio', cidade: 'fc-go', canal: 'email' });
  assert.equal(al.alerta.funcao, 'Caixa'); assert.equal(al.alertas.length, 1);
  assert.equal((await v('alertaSalvar', { funcao: 'Caixa', setorId: 'comercio', cidade: 'fc-go' })).alertas.length, 1, 'igual não duplica');
  assert.equal((await v('alertaApagar', { id: al.alerta.id })).alertas.length, 0);
  // lista de espera antiga: o mesmo e-mail com conta de pessoa ganha alerta; nada é enviado; a lista fica
  const cidade = (await A.db.query(`select id from public.vagas_cidades where slug = 'pre-go'`)).rows[0].id;
  await A.db.query(`insert into public.vagas_lista_espera (cidade_id, email, perfil) values ($1, 'esperando@lista.teste', 'pessoa'), ($1, 'sem.conta@lista.teste', 'pessoa')`, [cidade]);
  const ja = await H.usuarioAuth(A, 'esperando@lista.teste');
  ok(await A.servico('vagas_v2_conta_garantir_servidor', ja, { tipo: 'pessoa', termosVersao: '2026-11' }));
  assert.deepEqual(ok(await A.v2(ja)('eu')).alertas.map((x) => x.cidade), ['pre-go']);
  const m = ok(await A.servico('vagas_v2_migrar_lista_espera_servidor'));
  assert.equal(m.migrados, 0, 'idempotente');
  assert.equal(m.semConta, 1);
  assert.equal((await A.db.query(`select count(*)::int n from public.vagas_lista_espera where cidade_id = $1`, [cidade])).rows[0].n, 2);
});

test('candidatar: caminhos anexo | montar | minimo; pessoa nova mínima; idLocal idempotente; sem duplicar; só vaga no ar; contatoSegue', async () => {
  pronto();
  const uid = await H.conta(A, 'pessoa');
  const v = A.v2(uid);
  // sem perfil nem dados: pede o mínimo
  erro(await v('candidatar', { vagaId: X.vV.id, caminho: 'minimo' }), 'perfil_incompleto');
  erro(await v('candidatar', { vagaId: X.vV.id, caminho: 'xx' }), 'caminho_invalido');
  // pessoa nova mínima: o perfil vem em "dados"
  const r1 = ok(await v('candidatar', { vagaId: X.vV.id, caminho: 'minimo', dados: PERFIL(), idLocal: 'cand-1', mensagem: 'Posso começar segunda-feira.',
    respostas: [{ pergunta: 'Já trabalhou com vendas em loja?', resposta: 'sim' }] }));
  assert.deepEqual(CONTRATO.validar('candidatar', r1), []);
  assert.equal(r1.etapa, 'nova'); assert.equal(r1.contatoSegue, 'completo');
  const r1b = ok(await v('candidatar', { vagaId: X.vV.id, caminho: 'minimo', idLocal: 'cand-1' }));
  assert.equal(r1b.candidaturaId, r1.candidaturaId); assert.equal(r1b.duplicado, true);
  const r1c = ok(await v('candidatar', { vagaId: X.vV.id, caminho: 'minimo', idLocal: 'outro-id' }));
  assert.equal(r1c.candidaturaId, r1.candidaturaId, 'mesma vaga: não duplica');
  assert.equal((await A.db.query(`select count(*)::int n from public.vagas_candidaturas where pessoa_id = $1`, [uid])).rows[0].n, 1);
  // anexo sem arquivo; montar sem nada
  erro(await v('candidatar', { vagaId: X.vE.id, caminho: 'anexo' }), 'sem_arquivo');
  const u2 = await H.conta(A, 'pessoa');
  erro(await A.v2(u2)('candidatar', { vagaId: X.vE.id, caminho: 'montar', dados: PERFIL({ nome: 'Gustavo Prado', whatsapp: '62992223333' }) }), 'curriculo_vazio');
  const r2 = ok(await A.v2(u2)('candidatar', { vagaId: X.vE.id, caminho: 'montar',
    dados: PERFIL({ nome: 'Gustavo Prado', whatsapp: '62992223333', funcao: 'Vendedor', resumo: 'Trabalho com vendas há anos.' }) }));
  assert.equal(r2.contatoSegue, 'so_resumo');
  const c = await arquivo(u2);
  ok(await A.v2(u2)('curriculoGuardar', { caminho: c, nome: 'gustavo.pdf', tamanhoKb: 30, tipo: 'application/pdf' }));
  const r3 = ok(await A.v2(u2)('candidatar', { vagaId: X.vV.id, caminho: 'anexo' }));
  assert.equal(r3.contatoSegue, 'completo');
  const row = (await A.db.query(`select status, etapa, forma, v2, respostas, mensagem from public.vagas_candidaturas where id = $1`, [r1.candidaturaId])).rows[0];
  assert.equal(row.status, 'enviada'); assert.equal(row.etapa, 'nova'); assert.equal(row.forma, 'minimo'); assert.equal(row.v2, true);
  assert.equal(row.mensagem, 'Posso começar segunda-feira.'); assert.deepEqual(row.respostas, [{ pergunta: 'Já trabalhou com vendas em loja?', resposta: 'sim' }]);
  // mensagem com contato/cobrança é barrada com a mensagem do filtro de conversa
  erro(await A.v2(u2)('candidatar', { vagaId: X.vE.id, caminho: 'minimo', idLocal: 'zz', mensagem: 'Me ligue no 62 99999-0303' }).then((r) => r.codigo === 'texto_barrado' ? r : r), 'texto_barrado');
  // só em vaga no ar: pausada, vencida, empresa vencida
  const u3 = await H.pessoa(A, 'Helena Souza');
  await A.db.query(`update public.vagas_anuncios set status = 'pausado' where codigo = $1`, [X.vE.id]);
  erro(await A.v2(u3)('candidatar', { vagaId: X.vE.id, caminho: 'minimo' }), 'vaga_indisponivel');
  await A.db.query(`update public.vagas_anuncios set status = 'publicado' where codigo = $1`, [X.vE.id]);
  await A.db.query(`update public.vagas_empresas set verificacao_prazo_em = now() - interval '1 minute' where id = $1`, [X.emv.id]);
  erro(await A.v2(u3)('candidatar', { vagaId: X.vE.id, caminho: 'minimo' }), 'vaga_indisponivel');
  await A.db.query(`update public.vagas_empresas set verificacao_prazo_em = now() + interval '5 days' where id = $1`, [X.emv.id]);
  // a empresa não se candidata à própria vaga; empresa não usa candidatar
  erro(await A.v2(X.verif.uid)('candidatar', { vagaId: X.vV.id, caminho: 'minimo' }));
  // limite de 30 por dia (como hoje)
  const u4 = await H.pessoa(A, 'Igor Campos');
  await A.db.query(`insert into public.vagas_limites (tipo, chave) select 'quero', $1 from generate_series(1, 30)`, [u4]);
  erro(await A.v2(u4)('candidatar', { vagaId: X.vV.id, caminho: 'minimo' }), 'limite_dia');
  // candidaturas() da pessoa na forma do contrato; retirar
  const lista = ok(await A.v2(uid)('candidaturas'));
  assert.deepEqual(CONTRATO.validar('candidaturas', lista), []);
  assert.equal(lista.lista.length, 1);
  const k = lista.lista[0];
  assert.equal(k.etapa, 'nova'); assert.equal(k.empresaVerificada, true); assert.equal(k.vaga.id, X.vV.id); assert.equal(k.empresa.verificada, true);
  assert.equal(k.forma, 'minimo'); assert.deepEqual(Object.keys(k.marcos), ['enviada']);
  ok(await A.v2(uid)('candidaturaRetirar', { id: k.id }));
  const k2 = ok(await A.v2(uid)('candidaturas')).lista[0];
  assert.equal(k2.etapa, 'não seguiu'); assert.equal(k2.encerradaPor, 'pessoa');
  // pode se candidatar de novo depois de retirar
  const rr = ok(await A.v2(uid)('candidatar', { vagaId: X.vV.id, caminho: 'minimo' }));
  assert.equal(rr.etapa, 'nova'); assert.equal(rr.candidaturaId, k.id);
  // candidatura de uma pessoa não aparece para outra
  assert.equal(ok(await A.v2(u3)('candidaturas')).lista.length, 0);
  erro(await A.v2(u3)('candidaturaRetirar', { id: k.id }), 'nao_encontrada');
});

test('REGRA 1A: empresa em verificação vê só o primeiro nome e o resumo; arquivo e WhatsApp só se a pessoa liberar (até 20/dia); verificada vê tudo junto', async () => {
  pronto();
  const uid = await H.conta(A, 'pessoa');
  ok(await A.v2(uid)('perfilSalvar', PERFIL({ nome: 'Marina Albuquerque Costa', whatsapp: '62995556666', funcao: 'Caixa', resumo: 'Dois anos de caixa.', escolaridade: 'Ensino médio completo', cnh: ['B'], turnos: ['Manhã'], pretensao: 1700 })));
  const c = await arquivo(uid);
  ok(await A.v2(uid)('curriculoGuardar', { caminho: c, nome: 'marina.pdf', tamanhoKb: 80, tipo: 'application/pdf' }));
  const kE = ok(await A.v2(uid)('candidatar', { vagaId: X.vE.id, caminho: 'anexo' }));
  const kV = ok(await A.v2(uid)('candidatar', { vagaId: X.vV.id, caminho: 'anexo' }));
  assert.equal(kE.contatoSegue, 'so_resumo'); assert.equal(kV.contatoSegue, 'completo');
  // empresa EM VERIFICAÇÃO
  const lista = ok(await A.v2(X.emv.uid)('candidatos', { empresaId: X.emv.id }));
  assert.deepEqual(CONTRATO.validar('candidatos', lista), []);
  const cand = lista.lista.find((x) => x.id === kE.candidaturaId);
  assert.equal(cand.nome, 'Marina'); assert.equal(cand.nomeCompleto, false); assert.equal(cand.arquivo, null); assert.equal(cand.whatsapp, null); assert.equal(cand.whatsappLiberado, false);
  assert.equal(cand.resumo.funcao, 'Caixa'); assert.equal(cand.resumo.escolaridade, 'Ensino médio completo'); assert.deepEqual(cand.resumo.cnh, ['B']);
  const bruto = JSON.stringify(lista);
  assert.doesNotMatch(bruto, /Albuquerque|Costa|5562995556666|62995556666|marina\.pdf/);
  assert.doesNotMatch(Object.keys(cand).concat(Object.keys(cand.resumo)).join(' '), CHAVES_PROIBIDAS);
  const det = ok(await A.v2(X.emv.uid)('candidato', { id: kE.candidaturaId }));
  assert.deepEqual(CONTRATO.validar('candidato', det), []);
  assert.doesNotMatch(JSON.stringify(det), /Albuquerque|5562995556666|marina\.pdf/);
  erro(await A.v2(X.emv.uid)('whatsappChamar', { id: kE.candidaturaId }), 'whatsapp_nao_liberado');
  erro(await A.servico('vagas_v2_arquivo_link_servidor', X.emv.uid, kE.candidaturaId), 'arquivo_nao_liberado');
  // a pessoa libera o WhatsApp (só para esta candidatura)
  ok(await A.v2(uid)('whatsappLiberar', { id: kE.candidaturaId }));
  const apos = ok(await A.v2(X.emv.uid)('candidato', { id: kE.candidaturaId })).candidato;
  assert.equal(apos.nome, 'Marina Albuquerque Costa'); assert.equal(apos.nomeCompleto, true); assert.equal(apos.whatsapp, '5562995556666'); assert.equal(apos.whatsappLiberado, true);
  assert.deepEqual(apos.arquivo, { nome: 'marina.pdf', tamanhoKb: 80, tipo: 'application/pdf' });
  const link = ok(await A.servico('vagas_v2_arquivo_link_servidor', X.emv.uid, kE.candidaturaId));
  assert.deepEqual([link.caminho, link.bucket], [c, 'vagas-curriculos']);
  erro(await A.servico('vagas_v2_arquivo_link_servidor', X.verif.uid, kE.candidaturaId), 'nao_encontrada');   // outra empresa
  erro(await A.servico('vagas_v2_arquivo_link_servidor', uid, kE.candidaturaId), 'nao_encontrada');           // a própria pessoa não passa por aqui
  const ch = ok(await A.v2(X.emv.uid)('whatsappChamar', { id: kE.candidaturaId }));
  assert.deepEqual(CONTRATO.validar('whatsappChamar', ch), []);
  assert.equal(ch.whatsapp, '5562995556666'); assert.equal(ch.link, 'https://wa.me/5562995556666');
  assert.equal(ok(await A.v2(X.emv.uid)('candidato', { id: kE.candidaturaId })).candidato.etapa, 'em conversa');
  // a outra candidatura (empresa verificada): nome, arquivo e WhatsApp juntos, sem liberar nada
  const dV = ok(await A.v2(X.verif.uid)('candidato', { id: kV.candidaturaId })).candidato;
  assert.equal(dV.nome, 'Marina Albuquerque Costa'); assert.equal(dV.nomeCompleto, true); assert.equal(dV.whatsapp, '5562995556666'); assert.equal(dV.arquivo.nome, 'marina.pdf');
  ok(await A.servico('vagas_v2_arquivo_link_servidor', X.verif.uid, kV.candidaturaId));
  assert.equal(ok(await A.v2(X.verif.uid)('whatsappChamar', { id: kV.candidaturaId })).link, 'https://wa.me/5562995556666');
  // "quem viu meu currículo" lista cada abertura
  const qv = ok(await A.v2(uid)('quemViu'));
  assert.deepEqual(CONTRATO.validar('quemViu', qv), []);
  const por = qv.lista.map((x) => x.empresa + '|' + x.o).sort();
  assert.ok(por.includes('Loja Boa Compra|currículo') && por.includes('Loja Boa Compra|arquivo') && por.includes('Loja Boa Compra|contato'));
  assert.ok(qv.lista.every((x) => x.vaga && x.em));
  // outra pessoa não vê o "quem viu" de ninguém
  assert.equal(ok(await A.v2(await H.pessoa(A, 'Natália Reis'))('quemViu')).lista.length, 0);
  // empresa verificada depois: tudo junto, mesmo para quem não liberou
  const outra = await H.conta(A, 'pessoa');
  ok(await A.v2(outra)('candidatar', { vagaId: X.vE.id, caminho: 'minimo', dados: PERFIL({ nome: 'Otávio Mendes Lima', whatsapp: '62994443333' }) }));
  const antesV = ok(await A.v2(X.emv.uid)('candidatos', { empresaId: X.emv.id })).lista.find((x) => x.nome === 'Otávio');
  assert.ok(antesV); assert.equal(antesV.whatsapp, null);
  ok(await A.v2(S.operador)('opRevisarDecidir', { id: X.emv.id, acao: 'verificar_empresa' }));
  const depoisV = ok(await A.v2(X.emv.uid)('candidatos', { empresaId: X.emv.id })).lista.find((x) => x.id === antesV.id);
  assert.equal(depoisV.nome, 'Otávio Mendes Lima'); assert.equal(depoisV.whatsapp, '5562994443333'); assert.equal(depoisV.nomeCompleto, true);
});

test('candidatura ANTIGA (fluxo "Quero"/"Combinou"): a empresa só vê o primeiro nome até o Combinou, mesmo sendo verificada; e as RPCs antigas continuam intactas', async () => {
  pronto();
  const uid = await H.usuarioAuth(A, 'antiga.quero@v2.teste');
  ok(await A.servico('vagas_conta_registrar', uid, { tipo: 'pessoa', termosVersao: '2026-10' }));
  ok(await A.de(uid)('vagas_pessoa_salvar', { cidade: 'fc-go', zona: 'centro', maior18: true, cargos: ['Atendente'], escolaridade: 'medio', turnos: ['manha'],
    modalidades: ['clt'], nome: 'Luiza Fernanda Antunes', whatsapp: '62 99888-7766' }));
  const an = (await A.db.query(`select id from public.vagas_anuncios where codigo = $1`, [X.vV.id])).rows[0].id;
  const q = ok(await A.de(uid)('vagas_quero', an));
  const k = q.candidatura.id;
  const antes = ok(await A.v2(X.verif.uid)('candidato', { id: k })).candidato;
  assert.equal(antes.nome, 'Luiza'); assert.equal(antes.nomeCompleto, false); assert.equal(antes.whatsapp, null); assert.equal(antes.arquivo, null);
  assert.doesNotMatch(JSON.stringify(antes), /Antunes|5562998887766/);
  erro(await A.v2(X.verif.uid)('whatsappChamar', { id: k }), 'whatsapp_nao_liberado');
  erro(await A.servico('vagas_v2_arquivo_link_servidor', X.verif.uid, k));
  // o caminho antigo continua: conversar e Combinou liberam o contato (a pessoa decide)
  ok(await A.de(X.verif.uid)('vagas_empresa_decidir', k, 'conversar'));
  ok(await A.de(uid)('vagas_combinar', k));
  const depois = ok(await A.v2(X.verif.uid)('candidato', { id: k })).candidato;
  assert.equal(depois.nome, 'Luiza Fernanda Antunes'); assert.equal(depois.whatsapp, '5562998887766');
});

test('liberações de WhatsApp: até 20 por dia por empresa em verificação', async () => {
  pronto();
  const emp = await H.empresaEmVerificacao(A, '222333444001');
  const p = ok(await A.v2(emp.uid)('vagaPublicar', { empresaId: emp.id, vaga: COM() })).vaga;
  const ks = [];
  for (let i = 0; i < 21; i++) {
    const u = await H.conta(A, 'pessoa');
    const r = ok(await A.v2(u)('candidatar', { vagaId: p.id, caminho: 'minimo', dados: PERFIL({ nome: 'Pessoa Numero' + String.fromCharCode(65 + i), whatsapp: '629' + String(90000000 + i) }) }));
    ks.push({ u, id: r.candidaturaId });
  }
  for (let i = 0; i < 20; i++) ok(await A.v2(ks[i].u)('whatsappLiberar', { id: ks[i].id }));
  erro(await A.v2(ks[20].u)('whatsappLiberar', { id: ks[20].id }), 'limite_empresa');
  ok(await A.v2(ks[0].u)('whatsappLiberar', { id: ks[0].id }));   // quem já liberou continua liberado
  // no dia seguinte volta a valer
  await A.db.query(`update public.vagas_limites set em = now() - interval '2 days' where tipo = 'whatsapp_liberacao'`);
  ok(await A.v2(ks[20].u)('whatsappLiberar', { id: ks[20].id }));
});

test('candidatos: ordem SEMPRE por data (mais nova primeiro) e filtros só por FATO (bairro, CNH, escolaridade, turno, pretensão, com arquivo); nada de nota', async () => {
  pronto();
  const emp = await H.empresaVerificada(A, S, '333444555001');
  const vaga = ok(await A.v2(emp.uid)('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Vaga de filtros' }) })).vaga;
  const mk = async (nome, perfil, arq, minutosAtras) => {
    const u = await H.conta(A, 'pessoa');
    ok(await A.v2(u)('perfilSalvar', PERFIL(Object.assign({ nome, whatsapp: '6298' + String(Math.floor(Math.random() * 9000000) + 10000000).slice(1) }, perfil))));
    if (arq) { const c = await arquivo(u); ok(await A.v2(u)('curriculoGuardar', { caminho: c, nome: 'a.pdf', tamanhoKb: 5, tipo: 'application/pdf' })); }
    const r = ok(await A.v2(u)('candidatar', { vagaId: vaga.id, caminho: 'minimo' }));
    await A.db.query(`set session_replication_role = replica`);
    await A.db.query(`update public.vagas_candidaturas set criado_em = now() - make_interval(mins => $2) where id = $1`, [r.candidaturaId, minutosAtras]);
    await A.db.query(`set session_replication_role = origin`);
    return r.candidaturaId;
  };
  const a = await mk('Ana Um', { bairro: 'Centro', cnh: ['B'], escolaridade: 'Ensino médio completo', turnos: ['Manhã'], pretensao: 1800 }, true, 30);
  const b = await mk('Beto Dois', { bairro: 'Setor Sul', cnh: ['A', 'B'], escolaridade: 'Superior completo', turnos: ['Noite', 'Fim de semana'], pretensao: 3000 }, false, 10);
  const c = await mk('Cris Três', { bairro: 'Centro', escolaridade: 'Ensino fundamental completo', turnos: ['Tarde'] }, true, 50);
  const ids = (r) => r.lista.map((x) => x.id);
  const v = A.v2ok(emp.uid);
  assert.deepEqual(ids(await v('candidatos', { empresaId: emp.id, vagaId: vaga.id })), [b, a, c]);
  assert.deepEqual(ids(await v('candidatos', { empresaId: emp.id, filtros: { bairro: 'Centro' } })), [a, c]);
  assert.deepEqual(ids(await v('candidatos', { empresaId: emp.id, filtros: { cnh: ['A'] } })), [b]);
  assert.deepEqual(ids(await v('candidatos', { empresaId: emp.id, filtros: { cnh: 'AB' } })), [b]);
  assert.deepEqual(ids(await v('candidatos', { empresaId: emp.id, filtros: { escolaridade: 'Ensino médio completo' } })), [b, a]);
  assert.deepEqual(ids(await v('candidatos', { empresaId: emp.id, filtros: { turno: ['Noite'] } })), [b]);
  assert.deepEqual(ids(await v('candidatos', { empresaId: emp.id, filtros: { pretensaoAte: 2000 } })), [a]);
  assert.deepEqual(ids(await v('candidatos', { empresaId: emp.id, filtros: { comArquivo: true } })), [a, c]);
  assert.deepEqual(ids(await v('candidatos', { empresaId: emp.id, filtros: { bairro: 'Centro', comArquivo: true, turno: 'Manhã' } })), [a]);
  const tot = (await v('candidatos', { empresaId: emp.id })).totais;
  assert.equal(tot.total, 3); assert.equal(tot.novos, 3); assert.equal(tot.porEtapa.nova, 3);
  erro(await A.v2(emp.uid)('candidatos', { empresaId: emp.id, etapa: 'ótima' }), 'etapa_invalida');
  // qualquer chave de nota, idade, sexo etc.: nenhuma, em lugar nenhum
  const todo = JSON.stringify(await v('candidatos', { empresaId: emp.id }));
  assert.doesNotMatch(todo, /"(nota|score|pontuacao|ranking|compatibilidade|idade|nascimento|sexo|genero|estadoCivil|foto|cpf|rg|nacionalidade)"/i);
  // outra empresa não vê estes candidatos
  erro(await A.v2(X.emv.uid)('candidatos', { empresaId: emp.id }), 'nao_encontrada');
  erro(await A.v2(X.emv.uid)('candidato', { id: a }), 'nao_encontrada');
  erro(await A.v2(X.emv.uid)('candidatoMover', { id: a, etapa: 'vista' }), 'nao_encontrada');
});

test('A EQUIPE/OPERADOR e o admin NUNCA leem pessoa, currículo, contato nem candidatura (nem pelas RPCs, nem pelas tabelas)', async () => {
  pronto();
  const uid = await H.pessoa(A, 'Paula Teixeira');
  const c = await arquivo(uid);
  ok(await A.v2(uid)('curriculoGuardar', { caminho: c, nome: 'paula.pdf', tamanhoKb: 5, tipo: 'application/pdf' }));
  const k = ok(await A.v2(uid)('candidatar', { vagaId: X.vE.id, caminho: 'anexo' }));
  const op = A.v2(S.operador);
  const mod = A.v2(S.moderador);
  for (const quem of [op, mod, A.v2(S.admin)]) {
    erro(await quem('candidatos', { empresaId: X.emv.id }));
    erro(await quem('candidato', { id: k.candidaturaId }));
    erro(await quem('whatsappChamar', { id: k.candidaturaId }));
    erro(await quem('candidatoMover', { id: k.candidaturaId, etapa: 'vista' }));
    erro(await quem('entrevistaMarcar', { id: k.candidaturaId, quando: '2030-01-01T10:00:00-03:00', onde: 'Rua A' }));
    erro(await quem('conversa', { id: k.candidaturaId }));
    erro(await quem('mensagemEnviar', { id: k.candidaturaId, texto: 'oi' }));
    erro(await quem('quemViu'));
    erro(await quem('candidaturas'));
    erro(await quem('curriculoGuardar', { caminho: uid + '/x.pdf', nome: 'x', tamanhoKb: 1, tipo: 'application/pdf' }));
  }
  for (const quem of [S.operador, S.moderador, S.admin]) {
    for (const t of ['vagas_pessoas', 'vagas_pessoa_contato', 'vagas_candidaturas', 'vagas_curriculos', 'vagas_conversas', 'vagas_mensagens', 'vagas_experiencias',
      'vagas_salvas', 'vagas_escondidas', 'vagas_alertas', 'vagas_avisos_pessoa', 'vagas_candidatura_historico', 'vagas_acessos_contato']) {
      let n = 0;
      try { n = (await A.como('authenticated', quem, `select count(*)::int n from public.${t}`)).rows[0].n; } catch (e) { assert.match(String(e.message), /permission denied/); }
      assert.equal(n, 0, t);
    }
    assert.equal((await A.como('authenticated', quem, `select count(*)::int n from storage.objects where bucket_id = 'vagas-curriculos'`)).rows[0].n, 0);
  }
  // a fila "Revisar depois" não leva dado de pessoa
  const fila = JSON.stringify(ok(await op('opRevisarDepois', {})));
  assert.doesNotMatch(fila, /Paula|Teixeira|5562991234567|paula\.pdf/);
  // nem o aviso de golpe mostra quem recebeu
  assert.doesNotMatch(JSON.stringify(ok(await op('opRevisarDepois', {}))), /user_id|pessoaId|userId/);
});

test('etapas: nova -> vista -> em conversa -> entrevista marcada -> contratada; "não seguiu" com desfazer; status antigo coerente (NUNCA "combinou")', async () => {
  pronto();
  const uid = await H.pessoa(A, 'Renata Lopes');
  const k = ok(await A.v2(uid)('candidatar', { vagaId: X.vE.id, caminho: 'minimo' })).candidaturaId;
  const e = A.v2(X.emv.uid);
  const st = async () => (await A.db.query(`select status, etapa, visto_em, conversa_em, marcada_em, contratada_em, fim_em, encerrada_por from public.vagas_candidaturas where id = $1`, [k])).rows[0];
  assert.equal((await st()).etapa, 'nova');
  assert.equal(ok(await e('candidato', { id: k })).candidato.etapa, 'vista', 'abrir marca "vista"');
  assert.equal((await st()).status, 'enviada');
  const pe = ok(await A.v2(uid)('candidaturas')).lista[0];
  assert.equal(pe.etapa, 'vista'); assert.ok(pe.marcos.vista);
  erro(await e('candidatoMover', { id: k, etapa: 'entrevista marcada' }), 'entrevista_incompleta');
  erro(await e('candidatoMover', { id: k, etapa: 'qualquer' }), 'etapa_invalida');
  assert.equal(ok(await e('candidatoMover', { id: k, etapa: 'em conversa' })).candidato.etapa, 'em conversa');
  assert.equal((await st()).status, 'conversar');
  // entrevista: marcar, a pessoa confirma ou pede outro horário
  erro(await e('entrevistaMarcar', { id: k, quando: 'amanhã cedo', onde: 'Loja' }), 'quando');
  erro(await e('entrevistaMarcar', { id: k, quando: '2030-03-04T14:00:00-03:00', onde: 'Me ligue 62 99999-0303' }), 'texto_barrado');
  const m = ok(await e('entrevistaMarcar', { id: k, quando: '2030-03-04T14:00:00-03:00', onde: 'Rua 3, Setor Central, CEP 76400-000', recado: 'Traga um documento com foto' }));
  assert.deepEqual(CONTRATO.validarForma(CONTRATO.FORMAS.candidatoEmpresa, m.candidato), []);
  assert.equal(m.candidato.etapa, 'entrevista marcada');
  assert.deepEqual([m.candidato.entrevista.onde, m.candidato.entrevista.confirmada, m.candidato.entrevista.pediuOutro], ['Rua 3, Setor Central, CEP 76400-000', null, false]);
  const pe2 = ok(await A.v2(uid)('candidaturas')).lista[0];
  assert.equal(pe2.etapa, 'entrevista marcada'); assert.equal(pe2.entrevista.recado, 'Traga um documento com foto');
  erro(await A.v2(uid)('entrevistaResponder', { id: k, acao: 'talvez' }), 'acao_invalida');
  ok(await A.v2(uid)('entrevistaResponder', { id: k, acao: 'outro_horario', texto: 'Só posso depois das 16h' }));
  assert.equal(ok(await e('candidato', { id: k })).candidato.entrevista.pediuOutro, true);
  ok(await A.v2(uid)('entrevistaResponder', { id: k, acao: 'confirmar' }));
  const conf = ok(await e('candidato', { id: k }));
  assert.equal(conf.candidato.entrevista.confirmada, true);
  assert.ok(conf.mensagens.some((x) => x.de === 'sistema' && /Entrevista marcada/.test(x.txt)));
  // contratada
  assert.equal(ok(await e('candidatoMover', { id: k, etapa: 'contratada' })).candidato.etapa, 'contratada');
  assert.notEqual((await st()).status, 'combinou');
  // não seguiu / desfazer
  const k2 = ok(await A.v2(await H.pessoa(A, 'Sérgio Alves'))('candidatar', { vagaId: X.vE.id, caminho: 'minimo' })).candidaturaId;
  ok(await e('candidatoMover', { id: k2, etapa: 'em conversa' }));
  const ns = ok(await e('candidatoMover', { id: k2, etapa: 'não seguiu' }));
  assert.equal(ns.candidato.etapa, 'não seguiu');
  assert.equal(ns.candidato.historico.at(-1).etapa, 'não seguiu');
  const des = ok(await e('candidatoMover', { id: k2, etapa: 'em conversa', desfazer: true }));
  assert.equal(des.candidato.etapa, 'em conversa', 'desfazer volta à etapa anterior');
  erro(await e('candidatoMover', { id: k2, etapa: 'em conversa', desfazer: true }), 'sem_desfazer');
  // a pessoa que retirou: a empresa não reabre
  const k3p = await H.pessoa(A, 'Tiago Nunes');
  const k3 = ok(await A.v2(k3p)('candidatar', { vagaId: X.vE.id, caminho: 'minimo' })).candidaturaId;
  ok(await A.v2(k3p)('candidaturaRetirar', { id: k3 }));
  erro(await e('candidatoMover', { id: k3, etapa: 'em conversa' }), 'encerrada_pela_pessoa');
  // as RPCs antigas não abrem o contato de uma candidatura v2, mesmo contratada
  erro(await A.de(X.emv.uid)('vagas_contato_pessoa', k).then((r) => r), null);
  const n = await A.db.query(`select count(*)::int n from public.vagas_candidaturas where v2 and status = 'combinou'`);
  assert.equal(n.rows[0].n, 0);
});

test('conversa e mensagens: só pelo site, 3 seguidas, 100/dia em verificação (300 verificada), filtro permissivo (data/CEP/endereço passam), alerta âmbar, idempotência por mid', async () => {
  pronto();
  const E = await H.empresaEmVerificacao(A, '555666777001');
  const vagaE = ok(await A.v2(E.uid)('vagaPublicar', { empresaId: E.id, vaga: COM({ titulo: 'Vaga da conversa' }) })).vaga;
  const uid = await H.pessoa(A, 'Úrsula Pires');
  const k = ok(await A.v2(uid)('candidatar', { vagaId: vagaE.id, caminho: 'minimo' })).candidaturaId;
  const e = A.v2(E.uid);
  const p = A.v2(uid);
  erro(await p('mensagemEnviar', { id: k, texto: 'Oi, posso falar?' }), 'sem_conversa');
  erro(await e('mensagemEnviar', { id: k, texto: '' }), 'texto_vazio');
  const m1 = ok(await e('mensagemEnviar', { id: k, texto: 'Oi, tudo bem? Entrevista dia 25.11.2026 às 14.30. Rua 3, Setor Central, CEP 76400-000', mid: 'm-1' }));
  assert.deepEqual(CONTRATO.validar('mensagemEnviar', m1), []);
  assert.deepEqual([m1.mensagem.de, typeof m1.mensagem.id, typeof m1.mensagem.ts], ['eu', 'string', 'string']);
  const dup = ok(await e('mensagemEnviar', { id: k, texto: 'Oi, tudo bem? Entrevista dia 25.11.2026 às 14.30. Rua 3, Setor Central, CEP 76400-000', mid: 'm-1' }));
  assert.equal(dup.mensagem.id, m1.mensagem.id); assert.equal(dup.duplicado, true);
  assert.equal(ok(await A.v2(E.uid)('candidato', { id: k })).candidato.etapa, 'em conversa');
  // barradas: telefone, e-mail, link, Pix para garantir
  for (const t of ['Me chama no 62 99999-0303', 'escreve para rh@loja.com.br', 'veja www.loja.com.br/vaga', 'Faça um Pix para garantir a vaga', 'Quantos anos você tem? Qual a sua idade?']) {
    const r = erro(await e('mensagemEnviar', { id: k, texto: t }), 'texto_barrado');
    assert.ok(r.barra.length >= 1);
  }
  // 3 seguidas sem resposta
  ok(await e('mensagemEnviar', { id: k, texto: 'Segunda mensagem' }));
  ok(await e('mensagemEnviar', { id: k, texto: 'Terceira mensagem' }));
  erro(await e('mensagemEnviar', { id: k, texto: 'Quarta mensagem' }), 'aguardar');
  const resp = ok(await p('mensagemEnviar', { id: k, texto: 'Oi! Posso ir sim.' }));
  assert.equal(resp.mensagem.de, 'eu');
  ok(await e('mensagemEnviar', { id: k, texto: 'Perfeito' }));
  // as duas visões da conversa
  const cp = ok(await p('conversa', { id: k }));
  assert.deepEqual(CONTRATO.validar('conversa', cp), []);
  assert.equal(cp.mensagens.length, 5);
  assert.deepEqual(cp.mensagens.map((x) => x.de), ['ela', 'ela', 'ela', 'eu', 'ela']);
  const ce = ok(await e('conversa', { id: k }));
  assert.deepEqual(ce.mensagens.map((x) => x.de), ['eu', 'eu', 'eu', 'ela', 'eu']);
  assert.equal(cp.alertaGolpe, false);
  // alerta âmbar: a empresa fala em documento (passa com alerta, não é barrado)
  const doc = ok(await e('mensagemEnviar', { id: k, texto: 'Traga seu CPF e RG na entrevista' }));
  assert.equal(doc.alerta, true);
  assert.equal(ok(await p('conversa', { id: k })).alertaGolpe, true);
  // 100 por dia em verificação
  await A.db.query(`delete from public.vagas_limites where tipo = 'msg_empresa'`);
  await A.db.query(`insert into public.vagas_limites (tipo, chave) select 'msg_empresa', $1 from generate_series(1, 100)`, [E.id]);
  ok(await p('mensagemEnviar', { id: k, texto: 'Obrigada' }));
  erro(await e('mensagemEnviar', { id: k, texto: 'De nada' }), 'limite_dia');
  // a empresa verificada ainda passa de 100 (até 300)
  const kv = ok(await A.v2(uid)('candidatar', { vagaId: X.vV.id, caminho: 'minimo' })).candidaturaId;
  await A.db.query(`insert into public.vagas_limites (tipo, chave) select 'msg_empresa', $1 from generate_series(1, 150)`, [X.verif.id]);
  ok(await A.v2(X.verif.uid)('mensagemEnviar', { id: kv, texto: 'Olá, tudo bem?' }));
  // outras pessoas não leem esta conversa
  erro(await A.v2(await H.pessoa(A, 'Vera Luz'))('conversa', { id: k }), 'nao_encontrada');
  erro(await A.v2(X.verif.uid)('conversa', { id: k }), 'nao_encontrada');
  // encerrada: não escreve
  ok(await e('candidatoMover', { id: k, etapa: 'não seguiu' }));
  erro(await p('mensagemEnviar', { id: k, texto: 'Ainda aí?' }), 'encerrada');
});

test('denunciar: exige login; 2 contas diferentes tiram a vaga de empresa em verificação, 3 a de empresa verificada; "dados_errados"; "pede dinheiro" com sinal suspende a empresa', async () => {
  pronto();
  erro(await A.v2anon('denunciar', { vagaId: X.vE.id, motivo: 'falsa' }).then((r) => r, (e) => ({ ok: false, erro: String(e.message) })));
  const emp = await H.empresaEmVerificacao(A, '444555666001');
  const vaga = ok(await A.v2(emp.uid)('vagaPublicar', { empresaId: emp.id, vaga: COM({ titulo: 'Vaga denunciada' }) })).vaga;
  const p1 = await H.pessoa(A, 'Wagner Dias'); const p2 = await H.pessoa(A, 'Xênia Prado'); const p3 = await H.pessoa(A, 'Yara Melo');
  erro(await A.v2(p1)('denunciar', { vagaId: vaga.id, motivo: 'inexistente' }), 'motivo_invalido');
  erro(await A.v2(emp.uid)('denunciar', { vagaId: vaga.id, motivo: 'falsa' }), 'vaga_propria');
  const d1 = ok(await A.v2(p1)('denunciar', { vagaId: vaga.id, motivo: 'dados_errados', detalhe: 'O salário não confere' }));
  assert.deepEqual(CONTRATO.validar('denunciar', d1), []);
  assert.equal(d1.derrubou, false);
  assert.equal(ok(await A.v2(p1)('denunciar', { vagaId: vaga.id, motivo: 'falsa' })).duplicado, true, 'a mesma conta não conta duas vezes');
  assert.equal(ok(await A.v2anon('vaga', { id: vaga.id })).vaga.status, 'aberta');
  const d2 = ok(await A.v2(p2)('denunciar', { vagaId: vaga.id, motivo: 'falsa' }));
  assert.equal(d2.derrubou, true, '2 contas diferentes derrubam a vaga de empresa em verificação');
  erro(await A.v2anon('vaga', { id: vaga.id }), 'nao_encontrada');
  assert.equal((await A.db.query(`select status from public.vagas_anuncios where codigo = $1`, [vaga.id])).rows[0].status, 'suspenso');
  // verificada: 3
  const ev = await H.empresaVerificada(A, S, '444555666002');
  const vv = ok(await A.v2(ev.uid)('vagaPublicar', { empresaId: ev.id, vaga: COM({ titulo: 'Vaga verificada denunciada' }) })).vaga;
  assert.equal(ok(await A.v2(p1)('denunciar', { vagaId: vv.id, motivo: 'falsa' })).derrubou, false);
  assert.equal(ok(await A.v2(p2)('denunciar', { vagaId: vv.id, motivo: 'falsa' })).derrubou, false);
  assert.equal(ok(await A.v2anon('vaga', { id: vv.id })).vaga.status, 'aberta');
  assert.equal(ok(await A.v2(p3)('denunciar', { vagaId: vv.id, motivo: 'falsa' })).derrubou, true);
  // "pede dinheiro" + sinal na conversa suspende a empresa toda
  const e3 = await H.empresaEmVerificacao(A, '444555666003');
  const v3 = ok(await A.v2(e3.uid)('vagaPublicar', { empresaId: e3.id, vaga: COM({ titulo: 'Vaga do golpe' }) })).vaga;
  const v3b = ok(await A.v2(e3.uid)('vagaPublicar', { empresaId: e3.id, vaga: COM({ titulo: 'Outra vaga do golpe' }) })).vaga;
  const k = ok(await A.v2(p1)('candidatar', { vagaId: v3.id, caminho: 'minimo' })).candidaturaId;
  ok(await A.v2(e3.uid)('mensagemEnviar', { id: k, texto: 'Para começar mande seu CPF e RG hoje mesmo' }));
  const conv = ok(await A.v2(p1)('conversa', { id: k }));
  assert.equal(conv.alertaGolpe, true);
  const den = ok(await A.v2(p1)('denunciar', { mensagemId: conv.mensagens[0].id, motivo: 'cobranca' }));
  assert.equal(den.derrubou, true);
  assert.equal((await A.db.query(`select status from public.vagas_empresas where id = $1`, [e3.id])).rows[0].status, 'suspensa');
  erro(await A.v2anon('vaga', { id: v3b.id }), 'nao_encontrada');
  erro(await A.v2(e3.uid)('vagaPublicar', { empresaId: e3.id, vaga: COM() }), 'empresa_suspensa');
  assert.equal((await A.db.query(`select count(*)::int n from public.vagas_anuncios where empresa_id = $1`, [e3.id])).rows[0].n, 2, 'nada foi apagado');
  assert.ok((await A.db.query(`select 1 from public.vagas_moderacao where acao = 'suspender_empresa_por_denuncia' and alvo_id = $1`, [e3.id])).rowCount === 1);
  // denunciar mensagem que não é sua não vale
  erro(await A.v2(p2)('denunciar', { mensagemId: conv.mensagens[0].id, motivo: 'cobranca' }), 'nao_encontrada');
});

test('respostas da pessoa e da empresa respeitam o contrato e não trazem palavra proibida', async () => {
  pronto();
  const re = new RegExp('(^|[^a-zà-ú])(' + CONTRATO.PROIBIDAS.join('|') + ')([^a-zà-ú]|$)', 'i');
  const uid = await H.pessoa(A, 'Zélia Moura');
  const k = ok(await A.v2(uid)('candidatar', { vagaId: X.vV.id, caminho: 'minimo' })).candidaturaId;
  const tudo = [
    await A.v2ok(uid)('eu'), await A.v2ok(uid)('candidaturas'), await A.v2ok(uid)('quemViu'),
    await A.v2ok(X.verif.uid)('candidatos', { empresaId: X.verif.id }), await A.v2ok(X.verif.uid)('candidato', { id: k }),
    await A.v2ok(X.verif.uid)('vagasDaEmpresa', { empresaId: X.verif.id }), await A.v2ok(X.verif.uid)('minhasEmpresas'),
    await A.v2ok(X.verif.uid)('verificacao', { empresaId: X.verif.id }), await A.v2ok(X.verif.uid)('equipe', { empresaId: X.verif.id })
  ];
  assert.doesNotMatch(JSON.stringify(tudo), re);
  assert.deepEqual(CONTRATO.validar('minhasEmpresas', tudo[6]), []);
});
