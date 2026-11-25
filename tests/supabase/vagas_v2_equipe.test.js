'use strict';
// Banco da Vagas sem Caos v2: equipe da cidade ("Revisar depois", decisões, aviso a quem se candidatou), verificação com documentos, equipe da
// empresa, funções só de servidor e o registro de moderação (só inclusão). A equipe NUNCA vê dado de pessoa.
//
// Rodar: node --test --test-concurrency=1 tests/supabase/vagas_v2_equipe.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const H = require('./_vagas_v2_ajuda.js');
const { erro, ok, COM, CONTRATO } = H;

let A = null;
let S = null;
let falha = null;
test.before(async () => {
  try { A = await H.iniciar('equipe'); S = await H.cenario(A); } catch (e) { falha = e; }
});
test.after(async () => { if (A) await A.encerrar(); });
function pronto() { if (falha) throw falha; if (!A) throw new Error('Postgres embutido não iniciou'); }
const antiga = async (codigo, minutos) => {
  await A.db.query(`update public.vagas_anuncios set revisar_depois_em = now() - make_interval(mins => $2) where codigo = $1`, [codigo, minutos]);
};

test('Revisar depois: vagas de empresas em verificação, da mais antiga para a mais nova; segurada e sinal fraco no topo; consulta do CNPJ, sinais e denúncias; nunca dado de pessoa', async () => {
  pronto();
  const op = A.v2(S.operador);
  const e1 = await H.empresaEmVerificacao(A, '121212121001');
  const e2 = await H.empresaEmVerificacao(A, '121212121002');
  const e3 = await H.empresaEmVerificacao(A, '121212121003');
  const v1 = ok(await A.v2(e1.uid)('vagaPublicar', { empresaId: e1.id, vaga: COM({ titulo: 'Primeira vaga', descricao: 'Receber a mercadoria, conferir com o pedido e guardar cada caixa no estoque da loja de bairro.' }) })).vaga;
  const v2 = ok(await A.v2(e2.uid)('vagaPublicar', { empresaId: e2.id, vaga: COM({ titulo: 'Segunda vaga', descricao: 'Atender ao telefone da clínica, marcar consultas e receber os pacientes na recepção.' }) })).vaga;
  const v3 = ok(await A.v2(e3.uid)('vagaPublicar', { empresaId: e3.id, vaga: COM({ titulo: 'Terceira vaga',
    descricao: 'Ganhe até R$ 9000 por mês em vendas externas, com carro da empresa e treinamento completo.' }) })).vaga;
  const v4 = ok(await A.v2(e3.uid)('vagaPublicar', { empresaId: e3.id, vaga: COM({ titulo: 'Vaga segurada',
    descricao: 'Pedimos adesão e investimento no começo. Atendimento ao público na loja do centro da cidade.' }) })).vaga;
  await antiga(v1.id, 300); await antiga(v2.id, 100); await antiga(v3.id, 50); await antiga(v4.id, 10);
  const fila = ok(await op('opRevisarDepois', { cidade: 'fc-go' }));
  assert.deepEqual(CONTRATO.validar('opRevisarDepois', fila), []);
  const ids = fila.lista.map((x) => x.vaga.id);
  assert.deepEqual(ids.filter((i) => [v1.id, v2.id, v3.id, v4.id].includes(i)), [v4.id, v3.id, v1.id, v2.id]);
  const it = fila.lista.find((x) => x.vaga.id === v3.id);
  assert.equal(it.empresa.estado, 'em_verificacao'); assert.equal(it.empresa.verificada, false);
  assert.equal(it.empresa.consultaCnpj.situacao, 'ATIVA'); assert.equal(it.empresa.cnpjFormatado.length, 18);
  assert.ok(it.sinais.some((s) => s.tipo === 'fraco')); assert.equal(it.denuncias, 0);
  assert.ok(fila.totais.total >= 4); assert.ok(fila.totais.seguradas >= 1);
  assert.equal(fila.lista.find((x) => x.vaga.id === v4.id).vaga.status, 'segurada');
  assert.doesNotMatch(JSON.stringify(fila), /pessoaId|"cpf"|candidat/i);
  // filtros
  assert.ok(ok(await op('opRevisarDepois', { filtro: 'seguradas' })).lista.every((x) => x.vaga.status === 'segurada'));
  assert.ok(ok(await op('opRevisarDepois', { filtro: 'sinais' })).lista.every((x) => x.sinais.length > 0));
  erro(await op('opRevisarDepois', { filtro: 'qualquer' }), 'filtro_invalido');
  // quem não é da equipe não vê
  erro(await A.v2(e1.uid)('opRevisarDepois', {}), 'sem_permissao');
  erro(await A.v2(await H.pessoa(A, 'Pessoa Comum'))('opRevisarDepois', {}), 'sem_permissao');
  // a equipe de outra cidade não vê as vagas desta
  const outraOp = await H.usuarioAuth(A, 'op.outra@v2.teste');
  ok(await A.servico('vagas_conta_registrar', outraOp, { tipo: 'operador', termosVersao: '2026-11', operador: { cidade: 'out-mt', papel: 'operador' } }));
  assert.equal(ok(await A.v2(outraOp)('opRevisarDepois', {})).lista.some((x) => x.vaga.id === v1.id), false);
  erro(await A.v2(outraOp)('opRevisarDecidir', { id: v1.id, acao: 'liberar' }), 'nao_encontrada');
  // denúncia aberta entra na fila e aparece contada, sem dizer quem denunciou
  const p = await H.pessoa(A, 'Denunciante Um');
  ok(await A.v2(p)('denunciar', { vagaId: v2.id, motivo: 'dados_errados', detalhe: 'valor errado' }));
  const it2 = ok(await op('opRevisarDepois', { filtro: 'denuncias' })).lista.find((x) => x.vaga.id === v2.id);
  assert.equal(it2.denuncias, 1); assert.deepEqual(it2.denunciasDetalhe.map((d) => d.motivo), ['dados_errados']);
  assert.doesNotMatch(JSON.stringify(it2), new RegExp(p));
});

test('opRevisarDecidir: verificar empresa, pedir documento (recado livre), tirar do ar, liberar a segurada, suspender e recusar — tudo registrado só por inclusão', async () => {
  pronto();
  const op = A.v2(S.operador);
  const e = await H.empresaEmVerificacao(A, '131313131001');
  const v = A.v2(e.uid);
  const normal = ok(await v('vagaPublicar', { empresaId: e.id, vaga: COM({ titulo: 'Vaga normal' }) })).vaga;
  const segurada = ok(await v('vagaPublicar', { empresaId: e.id, vaga: COM({ titulo: 'Vaga segurada', descricao: 'Pedimos adesão e investimento no começo. Atendimento ao público na loja do centro.' }) })).vaga;
  assert.equal(segurada.status, 'segurada');
  erro(await op('opRevisarDecidir', { id: normal.id, acao: 'faz_tudo' }), 'acao_invalida');
  erro(await op('opRevisarDecidir', { id: 'ZZZZZZ', acao: 'liberar' }), 'nao_encontrada');
  // liberar a segurada: vai ao ar e some da fila
  ok(await op('opRevisarDecidir', { id: segurada.id, acao: 'liberar' }));
  assert.equal(ok(await A.v2anon('vaga', { id: segurada.id })).vaga.status, 'aberta');
  assert.equal(ok(await op('opRevisarDepois', {})).lista.some((x) => x.vaga.id === segurada.id), false);
  // pedir documento com recado livre (exige o recado); a empresa vê o que pediram; a vaga continua no ar
  erro(await op('opRevisarDecidir', { id: e.id, acao: 'pedir_documento' }), 'recado');
  ok(await op('opRevisarDecidir', { id: normal.id, acao: 'pedir_documento', recado: 'Mande o cartão do CNPJ ou o contrato social, em PDF.' }));
  const ver = ok(await v('verificacao', { empresaId: e.id }));
  assert.equal(ver.estado, 'em_verificacao'); assert.match(ver.motivoAjuste, /cartão do CNPJ/);
  assert.equal(ver.passos.find((x) => x.id === 'documento').feito, false);
  assert.equal(ok(await A.v2anon('vaga', { id: normal.id })).vaga.status, 'aberta');
  // a empresa envia o documento (bucket vagas-verificacao, pasta da empresa)
  const caminho = e.id + '/' + crypto.randomUUID() + '.pdf';
  erro(await v('verificacaoDocumento', { empresaId: e.id, caminho, nome: 'cartao.pdf', tipo: 'application/pdf' }), 'arquivo_ausente');
  await A.db.query(`insert into storage.objects (bucket_id, name) values ('vagas-verificacao', $1)`, [caminho]);
  erro(await v('verificacaoDocumento', { empresaId: e.id, caminho: 'outra/pasta.pdf', nome: 'x.pdf', tipo: 'application/pdf' }), 'arquivo_invalido');
  erro(await v('verificacaoDocumento', { empresaId: e.id, caminho, nome: 'x.exe', tipo: 'application/x-msdownload' }), 'arquivo_invalido');
  const dd = ok(await v('verificacaoDocumento', { empresaId: e.id, caminho, nome: 'cartao.pdf', tipo: 'application/pdf' }));
  assert.deepEqual(CONTRATO.validar('verificacaoDocumento', dd), []);
  assert.equal(dd.documentos.length, 1);
  const docId = dd.documentos[0].id;
  assert.equal(ok(await v('verificacao', { empresaId: e.id })).passos.find((x) => x.id === 'documento').feito, true);
  // link do documento (função de servidor): dono, equipe da cidade e admin; ninguém mais
  assert.equal(ok(await A.servico('vagas_v2_documento_link_servidor', e.uid, docId)).caminho, caminho);
  const ver2 = ok(await A.servico('vagas_v2_documento_link_servidor', S.operador, docId));
  assert.equal(ver2.bucket, 'vagas-verificacao');
  ok(await A.servico('vagas_v2_documento_link_servidor', S.admin, docId));
  erro(await A.servico('vagas_v2_documento_link_servidor', await H.pessoa(A, 'Curiosa Pessoa'), docId), 'nao_encontrado');
  erro(await A.servico('vagas_v2_documento_link_servidor', (await H.empresaEmVerificacao(A, '131313131002')).uid, docId), 'nao_encontrado');
  assert.ok((await A.db.query(`select 1 from public.vagas_moderacao where acao = 'ver_documento' and alvo_id = $1`, [e.id])).rowCount >= 1);
  // tirar do ar: motivo + recado, vaga fora do ar, empresa vê o motivo, não edita
  erro(await op('opRevisarDecidir', { id: normal.id, acao: 'tirar_do_ar' }), 'recado');
  ok(await op('opRevisarDecidir', { id: normal.id, acao: 'tirar_do_ar', recado: 'O anúncio repete texto de outra empresa. Reescreva com as suas palavras.' }));
  erro(await A.v2anon('vaga', { id: normal.id }), 'nao_encontrada');
  const lista = ok(await v('vagasDaEmpresa', { empresaId: e.id }));
  const vn = lista.vagas.find((x) => x.id === normal.id);
  assert.equal(vn.estado, 'suspensa'); assert.match(vn.motivo, /repete texto de outra empresa/);
  erro(await v('vagaEditar', { id: normal.id, vaga: { titulo: 'Novo' } }), 'suspensa');
  // liberar de volta (a equipe errou)
  ok(await op('opRevisarDecidir', { id: normal.id, acao: 'liberar', recado: 'Conferido, pode ficar.' }));
  assert.equal(ok(await A.v2anon('vaga', { id: normal.id })).vaga.status, 'aberta');
  // recusar: precisa de ajuste; vagas saem do ar
  ok(await op('opRevisarDecidir', { id: e.id, acao: 'recusar_empresa', recado: 'O CNPJ não confere com o nome da loja.' }));
  assert.equal(ok(await v('verificacao', { empresaId: e.id })).estado, 'precisa_ajuste');
  erro(await A.v2anon('vaga', { id: normal.id }), 'nao_encontrada');
  // verificar: volta ao normal e a empresa vira verificada com a data
  ok(await op('opRevisarDecidir', { id: e.id, acao: 'verificar_empresa' }));
  const vf = ok(await v('verificacao', { empresaId: e.id }));
  assert.equal(vf.estado, 'verificada'); assert.ok(vf.verificadaEm); assert.equal(vf.prazoAte, undefined);
  assert.equal(ok(await A.v2anon('vaga', { id: normal.id })).empresa.verificada, true);
  erro(await op('opRevisarDecidir', { id: e.id, acao: 'recusar_empresa', recado: 'x depois de verificada' }), 'estado_invalido');
  // suspender: todas as vagas fora do ar; nada é apagado
  ok(await op('opRevisarDecidir', { id: e.id, acao: 'suspender_empresa', recado: 'Denúncias de cobrança confirmadas.' }));
  erro(await A.v2anon('vaga', { id: normal.id }), 'nao_encontrada');
  erro(await op('opRevisarDecidir', { id: normal.id, acao: 'liberar' }), 'empresa_suspensa');
  assert.equal((await A.db.query(`select count(*)::int n from public.vagas_anuncios where empresa_id = $1`, [e.id])).rows[0].n, 2);
  // registro de moderação só por inclusão
  const acoes = (await A.db.query(`select acao from public.vagas_moderacao where alvo_id in ($1, (select id from public.vagas_anuncios where codigo = $2)) order by id`, [e.id, normal.id])).rows.map((x) => x.acao);
  for (const a of ['pedir_documento', 'tirar_do_ar', 'liberar_vaga', 'recusar_empresa', 'verificar_empresa', 'suspender_empresa']) assert.ok(acoes.includes(a), a);
  await H.rejeita(A.db.query(`update public.vagas_moderacao set motivo = 'x'`), /só|inclus|append|não pode/i);
  await H.rejeita(A.db.query(`delete from public.vagas_moderacao`), /só|inclus|append|não pode/i);
});

test('moderador (papel menor) tira do ar e libera vaga, mas não verifica, recusa nem suspende empresa', async () => {
  pronto();
  const e = await H.empresaEmVerificacao(A, '141414141001');
  const p = ok(await A.v2(e.uid)('vagaPublicar', { empresaId: e.id, vaga: COM({ titulo: 'Vaga do moderador' }) })).vaga;
  const mod = A.v2(S.moderador);
  for (const acao of ['verificar_empresa', 'recusar_empresa', 'suspender_empresa']) erro(await mod('opRevisarDecidir', { id: e.id, acao, recado: 'tentativa' }), 'sem_permissao');
  ok(await mod('opRevisarDecidir', { id: p.id, acao: 'tirar_do_ar', recado: 'Texto confuso, reescreva.' }));
  ok(await mod('opRevisarDecidir', { id: p.id, acao: 'liberar' }));
  ok(await mod('opRevisarDecidir', { id: e.id, acao: 'pedir_documento', recado: 'Envie o cartão do CNPJ.' }));
});

test('opAvisarCandidatos: só depois de tirar a vaga do ar; grava um aviso por pessoa; a equipe recebe só a contagem; o gancho de envio não envia nada', async () => {
  pronto();
  const op = A.v2(S.operador);
  const e = await H.empresaEmVerificacao(A, '151515151001');
  const vaga = ok(await A.v2(e.uid)('vagaPublicar', { empresaId: e.id, vaga: COM({ titulo: 'Vaga do golpe confirmado' }) })).vaga;
  const ps = [await H.pessoa(A, 'Aviso Um'), await H.pessoa(A, 'Aviso Dois'), await H.pessoa(A, 'Aviso Tres')];
  for (const u of ps) ok(await A.v2(u)('candidatar', { vagaId: vaga.id, caminho: 'minimo' }));
  const msg = 'Esta vaga foi retirada do ar. Nunca pague para se candidatar. Se alguém pedir dinheiro ou documento, não responda.';
  erro(await op('opAvisarCandidatos', { vagaId: vaga.id, mensagem: msg }), 'vaga_no_ar');
  erro(await op('opAvisarCandidatos', { vagaId: vaga.id, mensagem: 'curto' }), 'mensagem');
  erro(await op('opAvisarCandidatos', { vagaId: vaga.id, mensagem: 'Veja www.golpe.com.br para saber mais sobre isto' }), 'texto_barrado');
  ok(await op('opRevisarDecidir', { id: vaga.id, acao: 'tirar_do_ar', recado: 'Cobrança de taxa confirmada.' }));
  const r = ok(await op('opAvisarCandidatos', { vagaId: vaga.id, mensagem: msg }));
  assert.deepEqual(CONTRATO.validar('opAvisarCandidatos', r), []);
  assert.equal(r.avisados, 3);
  assert.equal(ok(await op('opAvisarCandidatos', { vagaId: vaga.id, mensagem: msg })).avisados, 0, 'não duplica');
  // cada pessoa recebe o seu; ninguém vê o aviso de outra
  const eu = ok(await A.v2(ps[0])('eu'));
  assert.equal(eu.avisos.length, 1); assert.equal(eu.avisos[0].mensagem, msg); assert.equal(eu.avisos[0].vagaId, vaga.id); assert.equal(eu.contadores.avisos, 1);
  assert.equal(ok(await A.v2(await H.pessoa(A, 'Sem Aviso'))('eu')).avisos.length, 0);
  // a equipe não lê a tabela
  assert.equal((await A.como('authenticated', S.operador, `select count(*)::int n from public.vagas_avisos_pessoa`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n, 0);
  // gancho de envio: só a função de servidor lê (com e-mail e WhatsApp) e marca; nada é enviado aqui
  const pend = ok(await A.servico('vagas_v2_avisos_pendentes_servidor', 100));
  assert.ok(pend.avisos.length >= 3);
  assert.ok(pend.avisos.every((x) => x.mensagem && x.userId && 'email' in x && 'whatsapp' in x));
  const mk = ok(await A.servico('vagas_v2_avisos_marcar_servidor', pend.avisos.map((x) => x.id)));
  assert.equal(mk.marcados, pend.avisos.length);
  assert.equal(ok(await A.servico('vagas_v2_avisos_pendentes_servidor', 100)).avisos.length, 0);
  await H.rejeita(A.de(S.operador)('vagas_v2_avisos_pendentes_servidor', 10), /permission denied/);
  // empresa suspensa também libera o aviso
  const e2 = await H.empresaEmVerificacao(A, '151515151002');
  const v2 = ok(await A.v2(e2.uid)('vagaPublicar', { empresaId: e2.id, vaga: COM({ titulo: 'Outra vaga' }) })).vaga;
  ok(await A.v2(ps[0])('candidatar', { vagaId: v2.id, caminho: 'minimo' }));
  ok(await op('opRevisarDecidir', { id: e2.id, acao: 'suspender_empresa', recado: 'Empresa suspensa por golpe.' }));
  assert.equal(ok(await op('opAvisarCandidatos', { vagaId: v2.id, mensagem: msg })).avisados, 1);
});

test('equipe da empresa: convite já vale em verificação (até 2 pessoas); depois de verificada o limite sobe; só o dono convida', async () => {
  pronto();
  const e = await H.empresaEmVerificacao(A, '161616161001');
  const v = A.v2ok(e.uid);
  const c1 = await v('equipeConvidar', { empresaId: e.id, email: 'um@equipe.teste' });
  assert.equal(c1.equipe.length, 2); assert.equal(c1.equipe.filter((x) => x.pendente).length, 1); assert.equal(c1.convite.email, 'um@equipe.teste'); assert.equal(typeof c1.convite.token, 'string');
  ok(await A.v2(e.uid)('equipeConvidar', { empresaId: e.id, email: 'um@equipe.teste' }));   // o mesmo e-mail só renova
  await v('equipeConvidar', { empresaId: e.id, email: 'dois@equipe.teste' });
  erro(await A.v2(e.uid)('equipeConvidar', { empresaId: e.id, email: 'tres@equipe.teste' }), 'limite_equipe');
  erro(await A.v2(e.uid)('equipeConvidar', { empresaId: e.id, email: 'invalido' }), 'email');
  const eq = await v('equipe', { empresaId: e.id });
  assert.equal(eq.equipe.length, 3);
  assert.equal(eq.equipe[0].papel, 'dono'); assert.equal(eq.equipe[0].eu, true);
  ok(await A.v2(S.operador)('opRevisarDecidir', { id: e.id, acao: 'verificar_empresa' }));
  ok(await A.v2(e.uid)('equipeConvidar', { empresaId: e.id, email: 'tres@equipe.teste' }));
  erro(await A.v2(await H.conta(A, 'empresa'))('equipe', { empresaId: e.id }), 'nao_encontrada');
  // a função de servidor do convite (e-mail) também libera em verificação, com o mesmo limite
  const e2 = await H.empresaEmVerificacao(A, '161616161002');
  const s1 = ok(await A.servico('vagas_conta_convite_equipe', e2.uid, e2.id, 'a@equipe.teste', null, null));
  assert.equal(s1.destino, 'nova'); assert.equal(typeof s1.token, 'string');
  ok(await A.servico('vagas_conta_convite_equipe', e2.uid, e2.id, 'b@equipe.teste', null, null));
  assert.equal((await A.servico('vagas_conta_convite_equipe', e2.uid, e2.id, 'c@equipe.teste', null, null)).ok, false);
});

test('conta_garantir_servidor: cria a conta ativa e confirma o e-mail; idempotente; registra o aceite dos termos; tipo diferente e suspensa recusados', async () => {
  pronto();
  const id = crypto.randomUUID();
  await A.db.query(`insert into auth.users (id, email) values ($1, 'novo.login@v2.teste')`, [id]);
  const r1 = ok(await A.servico('vagas_v2_conta_garantir_servidor', id, { tipo: 'pessoa', termosVersao: '2026-11' }));
  assert.equal(r1.novaConta, true);
  const r2 = ok(await A.servico('vagas_v2_conta_garantir_servidor', id, { tipo: 'pessoa', termosVersao: '2026-11' }));
  assert.equal(r2.novaConta, false);
  const c = (await A.db.query(`select tipo, status, confirmada_em, termos_versao, termos_aceitos_em from public.vagas_contas where user_id = $1`, [id])).rows[0];
  assert.equal(c.tipo, 'pessoa'); assert.equal(c.status, 'ativa'); assert.ok(c.confirmada_em); assert.equal(c.termos_versao, '2026-11'); assert.ok(c.termos_aceitos_em);
  assert.equal((await A.db.query(`select count(*)::int n from public.vagas_consentimentos where user_id = $1`, [id])).rows[0].n, 2, 'o aceite é gravado uma vez só');
  assert.ok((await A.db.query(`select email_confirmed_at from auth.users where id = $1`, [id])).rows[0].email_confirmed_at);
  // a conta já pode usar as RPCs da pessoa
  ok(await A.v2(id)('perfilSalvar', { nome: 'Nova Pessoa', whatsapp: '62991112222', email: 'novo.login@v2.teste', cidade: 'fc-go', bairro: 'Centro' }));
  erro(await A.servico('vagas_v2_conta_garantir_servidor', id, { tipo: 'empresa' }), 'tipo_diferente');
  erro(await A.servico('vagas_v2_conta_garantir_servidor', id, { tipo: 'operador' }), 'tipo_invalido');
  erro(await A.servico('vagas_v2_conta_garantir_servidor', crypto.randomUUID(), { tipo: 'pessoa' }), 'sem_usuario');
  await A.db.query(`update public.vagas_contas set status = 'suspensa' where user_id = $1`, [id]);
  erro(await A.servico('vagas_v2_conta_garantir_servidor', id, { tipo: 'pessoa' }), 'conta_suspensa');
  erro(await A.v2(id)('eu'), 'conta_suspensa');
});

test('sem sessão: toda RPC que exige login responde "sessão expirada" (nunca erro de banco)', async () => {
  pronto();
  for (const [metodo, m] of Object.entries(CONTRATO.METODOS)) {
    if (!m.rpc || m.login === false) continue;
    const r = await A.rpcComo('authenticated', null, m.rpc, [{}]);
    assert.equal(r.ok, false, metodo);
    assert.ok(['sessao_expirada', 'sem_conta'].includes(r.codigo), metodo + ' ' + JSON.stringify(r));
    assert.equal(typeof r.erro, 'string');
  }
});
