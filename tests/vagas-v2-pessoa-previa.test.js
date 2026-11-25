'use strict';
// Vagas sem Caos v2 · demonstração da pessoa (vagas/js/v2/previa/pessoa.js): cada resposta tem a MESMA forma do contrato
// (VSC_CONTRATO.validar), a base fictícia não vaza campo proibido e o fluxo da conta (código, perfil, candidatura, conversa) funciona.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const CONTRATO = require('../vagas/js/v2/contrato.js');

const RAIZ = path.join(__dirname, '..', 'vagas', 'js', 'v2', 'previa');
const ler = (n) => fs.readFileSync(path.join(RAIZ, n), 'utf8');

// Um "navegador" mínimo: window, localStorage em memória e VSC_API.sessao() controlável.
function criar(email, guardado) {
  const mem = guardado || {};
  const ctx = vm.createContext({ console, Date, JSON, Math, URL, Promise, setTimeout, clearTimeout });
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  ctx.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  const estado = { email: email || '' };
  ctx.VSC_API = { sessao: () => (estado.email ? { user: { id: 'x', email: estado.email } } : null), modo: 'previa' };
  vm.runInContext(ler('dados.js'), ctx);
  vm.runInContext(ler('dados-mais.js'), ctx);
  vm.runInContext(ler('pessoa.js'), ctx);
  const M = ctx.VSC_PREVIA_METODOS;
  const chamar = (m, d) => JSON.parse(JSON.stringify(M[m](d || {})));
  return { M, chamar, estado, ctx, mem };
}
const ok = (r) => assert.equal(r.ok, true, JSON.stringify(r));
const valida = (m, r) => assert.deepEqual(CONTRATO.validar(m, r), [], m);

test('base: formas do contrato, só vagas abertas, salário em todas, sem número de candidatos nem campo de nota', () => {
  const { chamar } = criar();
  const r = chamar('base');
  ok(r); valida('base', r);
  assert.ok(r.vagas.length > 100 && r.empresas.length > 20 && r.cidades.length >= 2 && r.setores.length >= 10);
  assert.ok(r.vagas.every((v) => v.status === 'aberta'));
  assert.ok(r.vagas.every((v) => v.salario && v.salario.aCombinar === false && v.salario.min > 0), 'salário em todas as vagas');
  assert.ok(r.vagas.every((v) => !('candidatos' in v) && !('jornada' in v)));
  assert.ok(r.vagas.every((v) => Date.parse(v.publicadaEm) <= Date.now()));
  assert.ok(r.vagas.every((v) => v.exemplo === true));
  assert.ok(r.empresas.filter((e) => e.verificada).every((e) => /^\d{4}-/.test(e.verificadaEm)));
  assert.ok(r.empresas.filter((e) => !e.verificada).every((e) => e.verificadaEm === null));
  const chaves = JSON.stringify(r).match(/"[a-zA-Z]+":/g).map((k) => k.slice(1, -2).toLowerCase());
  chaves.forEach((k) => assert.ok(!/^(nota|ranking|compatibilidade|idade|sexo|estadocivil|foto|nacionalidade|pontuacao|aderencia|encaixe)$/.test(k), k));
});

test('vaga: link direto devolve vaga e empresa; id que não existe vira erro em português', () => {
  const { chamar } = criar();
  const b = chamar('base'), id = b.vagas[0].id;
  const r = chamar('vaga', { id });
  ok(r); valida('vaga', r);
  assert.equal(r.vaga.id, id);
  const e = chamar('vaga', { id: 'nao-existe' });
  assert.equal(e.ok, false);
  assert.match(e.erro, /não encontrada/);
});

test('código: só 123456 entra; conta de persona vem com currículo e candidaturas; e-mail novo cria conta vazia', () => {
  const { chamar, estado } = criar();
  const p = chamar('codigoPedir', { destino: 'ana.paula@exemplo.com' });
  ok(p); assert.equal(p.canal, 'email'); assert.equal(p.reenviarEmSeg, 30); assert.match(p.dicaDemonstracao, /123456/);
  assert.equal(chamar('codigoPedir', { destino: 'sem-arroba' }).ok, false);
  const errado = chamar('codigoConfirmar', { destino: 'ana.paula@exemplo.com', codigo: '000000' });
  assert.equal(errado.ok, false); assert.equal(errado.codigo, 'codigo_errado');
  const c = chamar('codigoConfirmar', { destino: 'ana.paula@exemplo.com', codigo: '123456' });
  ok(c); assert.equal(c.novaConta, false); assert.ok(c.sessao.access_token && c.sessao.user.email === 'ana.paula@exemplo.com');
  estado.email = 'ana.paula@exemplo.com';
  const eu = chamar('eu');
  ok(eu); valida('eu', eu);
  assert.equal(eu.conta.email, 'ana.paula@exemplo.com');
  assert.ok(eu.curriculo.arquivo && eu.curriculo.dados.experiencias.length >= 1);
  assert.match(eu.conta.whatsapp, /^55\d{11}$/);
  const l = chamar('candidaturas');
  ok(l); valida('candidaturas', l);
  assert.equal(l.lista.length, 5);
  const etapas = l.lista.map((k) => k.etapa).sort();
  assert.deepEqual(etapas, ['em conversa', 'entrevista marcada', 'nova', 'não seguiu', 'vista']);
  const nova = chamar('codigoConfirmar', { destino: 'quem.chegou@exemplo.com', codigo: '123456', nome: 'Pessoa Nova' });
  assert.equal(nova.novaConta, true);
});

test('sem sessão: método de pessoa responde sessão expirada (a tela pede novo código)', () => {
  const { chamar } = criar();
  ['eu', 'candidaturas', 'quemViu', 'alertaApagar'].forEach((m) => { const r = chamar(m, { id: 'x' }); assert.equal(r.ok, false, m); assert.equal(r.sessaoExpirada, true, m); });
});

test('marcos reais: a ordem das datas da candidatura é crescente e nunca no futuro', () => {
  const { chamar, estado } = criar('ana.paula@exemplo.com');
  chamar('codigoConfirmar', { destino: estado.email, codigo: '123456' });
  chamar('candidaturas').lista.forEach((k) => {
    const m = k.marcos, ts = ['enviada', 'vista', 'conversa', 'marcada', 'fim'].map((n) => m[n]).filter(Boolean).map(Date.parse);
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i] >= ts[i - 1], k.id);
    assert.ok(ts.every((t) => t <= Date.now() + 1000), k.id);
    if (k.etapa === 'entrevista marcada') { assert.ok(k.entrevista && Date.parse(k.entrevista.quando) > Date.now()); assert.equal(k.entrevista.confirmada, null); }
  });
});

test('perfil: valida nome, WhatsApp (11 dígitos), cidade e experiências como o banco', () => {
  const { chamar, estado } = criar('novo@exemplo.com');
  chamar('codigoConfirmar', { destino: 'novo@exemplo.com', codigo: '123456' });
  const cidade = chamar('base').cidades[0].id;
  assert.equal(chamar('perfilSalvar', { nome: 'A', whatsapp: '5562999990000', cidade }).codigo, 'nome_invalido');
  assert.equal(chamar('perfilSalvar', { nome: 'Maria Souza', whatsapp: '123', cidade }).codigo, 'whatsapp_invalido');
  assert.equal(chamar('perfilSalvar', { nome: 'Maria Souza', whatsapp: '5562999990000', cidade: 'lugar-nenhum' }).codigo, 'cidade_invalida');
  assert.equal(chamar('perfilSalvar', { nome: 'Maria Souza', whatsapp: '5562999990000', cidade, experiencias: [{ cargo: 'Caixa', inicio: '2020' }] }).codigo, 'experiencias_invalidas');
  ok(chamar('perfilSalvar', { nome: 'Maria Souza', whatsapp: '5562999990000', cidade, bairro: 'Centro', funcao: 'Caixa', experiencias: [{ cargo: 'Caixa', empresa: 'Mercado', inicio: '2021-03', fim: null }] }));
  const eu = chamar('eu');
  assert.equal(eu.conta.nome, 'Maria Souza'); assert.equal(eu.curriculo.dados.experiencias[0].cargo, 'Caixa');
  valida('eu', eu);
});

test('candidatar: 3 caminhos, idLocal não duplica, empresa verificada recebe tudo e a em verificação só o resumo', () => {
  const { chamar } = criar('nova.pessoa@exemplo.com');
  chamar('codigoConfirmar', { destino: 'nova.pessoa@exemplo.com', codigo: '123456' });
  const base = chamar('base'), cidade = base.cidades[0].id;
  const verificada = base.vagas.filter((v) => base.empresas.filter((e) => e.id === v.empresaId)[0].verificada)[0];
  const emVerif = base.vagas.filter((v) => !base.empresas.filter((e) => e.id === v.empresaId)[0].verificada)[0];
  const dados = { nome: 'João Pereira', whatsapp: '5562988887777', email: 'nova.pessoa@exemplo.com', cidade, funcao: 'Atendente' };
  assert.equal(chamar('candidatar', { vagaId: verificada.id, caminho: 'minimo' }).codigo, 'perfil_incompleto');
  const a = chamar('candidatar', { vagaId: verificada.id, caminho: 'minimo', dados, idLocal: 'l-1' });
  ok(a); assert.equal(a.contatoSegue, 'completo'); assert.equal(a.etapa, 'nova');
  const b = chamar('candidatar', { vagaId: verificada.id, caminho: 'minimo', dados, idLocal: 'l-1' });
  assert.equal(b.duplicado, true); assert.equal(b.candidaturaId, a.candidaturaId);
  const c = chamar('candidatar', { vagaId: emVerif.id, caminho: 'montar', dados });
  ok(c); assert.equal(c.contatoSegue, 'so_resumo');
  assert.equal(chamar('candidatar', { vagaId: emVerif.id, caminho: 'anexo' }).ok, true, 'já existe: duplicado');
  assert.equal(chamar('candidatar', { vagaId: 'nao-existe', caminho: 'minimo' }).codigo, 'vaga_indisponivel');
  const l = chamar('candidaturas');
  valida('candidaturas', l);
  assert.equal(l.lista.length, 2);
  const kv = l.lista.filter((k) => k.vagaId === verificada.id)[0], ke = l.lista.filter((k) => k.vagaId === emVerif.id)[0];
  assert.equal(kv.whatsappLiberado, true); assert.equal(ke.whatsappLiberado, false);
  ok(chamar('whatsappLiberar', { id: ke.id }));
  assert.equal(chamar('candidaturas').lista.filter((k) => k.id === ke.id)[0].whatsappLiberado, true);
});

test('retirar, entrevista, conversa e alerta de golpe', () => {
  const { chamar, estado } = criar('ana.paula@exemplo.com');
  chamar('codigoConfirmar', { destino: estado.email, codigo: '123456' });
  const lista = chamar('candidaturas').lista;
  const ent = lista.filter((k) => k.etapa === 'entrevista marcada')[0], conv = lista.filter((k) => k.etapa === 'em conversa')[0], nova = lista.filter((k) => k.etapa === 'nova')[0];
  ok(chamar('entrevistaResponder', { id: ent.id, acao: 'confirmar' }));
  assert.equal(chamar('candidaturas').lista.filter((k) => k.id === ent.id)[0].entrevista.confirmada, true);
  ok(chamar('entrevistaResponder', { id: ent.id, acao: 'outro_horario', texto: 'sexta à tarde' }));
  const c1 = chamar('conversa', { id: ent.id });
  ok(c1); assert.ok(c1.mensagens.some((m) => m.de === 'ela')); assert.equal(c1.alertaGolpe, false);
  assert.ok(c1.mensagens.some((m) => /sexta à tarde/.test(m.txt)));
  assert.equal(chamar('entrevistaResponder', { id: nova.id, acao: 'confirmar' }).codigo, 'sem_entrevista');
  const m = chamar('mensagemEnviar', { id: conv.id, texto: 'Posso ir amanhã.', mid: 'm1' });
  ok(m); assert.equal(m.mensagem.de, 'eu');
  assert.equal(chamar('mensagemEnviar', { id: conv.id, texto: '   ' }).codigo, 'texto_vazio');
  ok(chamar('candidaturaRetirar', { id: nova.id }));
  const r = chamar('candidaturas').lista.filter((k) => k.id === nova.id)[0];
  assert.equal(r.etapa, 'não seguiu'); assert.equal(r.encerradaPor, 'pessoa');
  assert.equal(chamar('conversa', { id: nova.id }).podeEscrever, false);
  const q = chamar('quemViu');
  ok(q); assert.ok(q.lista.length >= 1 && q.lista.every((x) => x.empresa && x.vaga && ['currículo', 'contato', 'arquivo'].indexOf(x.o) >= 0));
  assert.equal(chamar('denunciar', { vagaId: lista[0].vagaId, motivo: 'cobranca' }).derrubou, false);
});

test('salvar, esconder e alertas: respostas com a lista inteira, como o banco', () => {
  const { chamar, estado } = criar('marcos@exemplo.com');
  chamar('codigoConfirmar', { destino: estado.email, codigo: '123456' });
  const id = chamar('base').vagas[3].id;
  const s = chamar('vagaSalvar', { vagaId: id, salvar: true });
  ok(s); assert.ok(s.salvas.indexOf(id) >= 0);
  const h = chamar('vagaEsconder', { vagaId: id, esconder: true });
  ok(h); assert.ok(h.escondidas.indexOf(id) >= 0);
  assert.ok(chamar('eu').salvas.indexOf(id) < 0, 'esconder tira dos salvos');
  ok(chamar('vagaEsconder', { vagaId: id, esconder: false }));
  assert.equal(chamar('alertaSalvar', {}).codigo, 'alerta_vazio');
  const a = chamar('alertaSalvar', { funcao: 'caixa', cidade: chamar('base').cidades[0].id, filtros: { salarioMin: 1500 }, canal: 'email' });
  ok(a); assert.equal(a.alerta.canal, 'email'); assert.ok(a.alertas.length >= 1);
  const del = chamar('alertaApagar', { id: a.alerta.id });
  assert.ok(!del.alertas.some((x) => x.id === a.alerta.id));
});

test('currículo: enviar guarda o arquivo, apagar tira; com "sem internet" ligada, candidatar e enviar falham com a marca conexao', () => {
  const { chamar, estado, mem } = criar('arq@exemplo.com');
  chamar('codigoConfirmar', { destino: estado.email, codigo: '123456' });
  const e = chamar('curriculoEnviar', { nome: 'meu.pdf', tamanhoKb: 120, tipo: 'application/pdf' });
  ok(e); assert.equal(chamar('eu').curriculo.arquivo.nome, 'meu.pdf');
  ok(chamar('curriculoApagar'));
  assert.equal(chamar('eu').curriculo.arquivo, null);
  const salvo = JSON.parse(mem['vsc.previa.pessoa.v2']);
  salvo.offline = true;
  const off = criar('arq@exemplo.com', { 'vsc.previa.pessoa.v2': JSON.stringify(salvo) });
  const vaga = off.chamar('base').vagas[0].id;
  assert.equal(off.chamar('candidatar', { vagaId: vaga, caminho: 'minimo' }).conexao, true);
  assert.equal(off.chamar('curriculoEnviar', { nome: 'x.pdf', tamanhoKb: 1, tipo: 'application/pdf' }).conexao, true);
  assert.equal(off.chamar('codigoPedir', { destino: 'a@b.com' }).conexao, true);
  assert.equal(off.chamar('base').ok, true, 'ler continua funcionando');
});

test('exportar e excluir conta existem para a demonstração', async () => {
  const { chamar, estado, ctx } = criar('apagar@exemplo.com');
  chamar('codigoConfirmar', { destino: estado.email, codigo: '123456' });
  const ex = ctx.VSC_PREVIA_PESSOA.exportar();
  assert.equal(ex.ok, true); assert.equal(ex.conta.email, 'apagar@exemplo.com');
  await ctx.VSC_PREVIA_PESSOA.excluirConta();
  assert.equal(chamar('eu').sessaoExpirada, true);
});
