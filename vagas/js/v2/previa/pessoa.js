/*
 * Vagas sem Caos v2 · DEMONSTRAÇÃO da pessoa (só no modo prévia, fora do domínio oficial, com ?previa=1).
 * Preenche window.VSC_PREVIA_METODOS com os métodos que as telas da pessoa usam, com as MESMAS formas do contrato
 * (vagas/js/v2/contrato.js), em cima de window.VSC_DADOS (base FICTÍCIA) e de um estado guardado neste navegador
 * ('vsc.previa.pessoa.v2'). Código de entrada: 123456. Personas de exemplo: Ana Paula (caixa) e Marcos (motorista).
 * Nada daqui é carregado no modo supabase.
 */
(function (root) {
  'use strict';
  const D = root.VSC_DADOS, M = (root.VSC_PREVIA_METODOS = root.VSC_PREVIA_METODOS || {});
  const CHAVE = 'vsc.previa.pessoa.v2', CODIGO = '123456';
  const H = 3600000, BASE = Date.parse('2026-11-24T12:00:00-03:00'), T0 = Date.now();
  const SRC = (root.document && root.document.currentScript && root.document.currentScript.src) || '';
  const iso = (ts) => new Date(ts).toISOString();
  const ha = (horas) => iso(T0 - horas * H);                 // "há N horas", contado a partir de agora
  const abs = (ts) => iso(T0 + (ts - BASE));                 // data marcada na base (24/11/2026), levada para o dia de hoje

  const PERSONAS = {
    nova: { rotulo: 'Pessoa nova (sem conta)', detalhe: 'Vê tudo sem cadastro; a conta nasce na 1ª candidatura' },
    ana: { rotulo: 'Ana Paula (exemplo)', detalhe: 'Com conta, currículo anexado e 5 candidaturas', email: 'ana.paula@exemplo.com', pessoa: 'p01', cands: ['c01', 'c14', 'c32', 'c29', 'c24'], salvas: ['v16', 'v56', 'v08'] },
    marcos: { rotulo: 'Marcos (exemplo), motorista', detalhe: 'Com conta e 2 candidaturas de motorista', email: 'marcos@exemplo.com', pessoa: 'p02', cands: ['c42', 'c43'], salvas: ['v32'] }
  };
  const RESPOSTAS_EMPRESA = {
    c01: 'Oi, Ana. Gostamos do seu currículo. Pode vir para uma conversa na quinta, 26/11, às 9h? Leva uns 20 minutos.',
    c32: 'Olá, Ana. Recebemos seu currículo para recepcionista. Você teria como começar na primeira semana de dezembro?',
    c42: 'Bom dia, Marcos. A rota é Uruaçu a Palmas, saindo na segunda e voltando na quinta. Podemos conversar amanhã?'
  };

  /* ---------- ajustes da base fictícia (como a prévia aprovada) ---------- */
  D.vagas.forEach((v) => {
    if (v.id === 'v10') { v.salario = { min: 2000, max: 4500, periodo: 'mes', aCombinar: false, texto: 'R$ 2.000 a R$ 4.500 por mês', obs: 'ganho médio com comissão' };
      v.descricao = 'Procuramos representante para visitar oficinas e frotas em Campinorte, Alto Horizonte e Nova Iguaçu de Goiás. O ganho é por comissão e fica, em média, entre R$ 2.000 e R$ 4.500 por mês, conforme a carteira de clientes. Damos a tabela de preços, o catálogo no celular e ajuda com o combustível.'; }
    if (v.id === 'v38') { v.tipo = 'Diária'; v.salario = { min: 130, max: 200, periodo: 'dia', aCombinar: false, texto: 'R$ 130 a R$ 200 por dia' }; v.horario = 'Sextas e sábados, das 9h às 19h'; v.repete = true; }
  });
  const EMP = {}, VAGA = {}, CID = {};
  D.empresas.forEach((e) => { EMP[e.id] = e; });
  D.vagas.forEach((v) => { VAGA[v.id] = v; });
  D.cidades.forEach((c) => { CID[c.id] = c; });

  const vagaJson = (v) => {
    const o = JSON.parse(JSON.stringify(v));
    ['candidatos', 'jornada', 'publicadaHa', 'saiDoArDias', 'pessoaId'].forEach((k) => { delete o[k]; });
    o.publicadaEm = ha(v.publicadaHa || 1);
    o.expiraEm = v.id === 'v08' ? iso(T0 + 2 * 24 * H - 3 * H) : null;
    o.confidencial = false;
    o.repete = !!v.repete;
    return o;
  };
  const empresaJson = (e) => {
    const o = JSON.parse(JSON.stringify(e));
    ['porte', 'cor', 'fundadaEm', 'desde'].forEach((k) => { delete o[k]; });
    o.verificadaEm = e.verificada ? iso(Date.parse(e.desde + 'T12:00:00-03:00') + (T0 - BASE)) : null;
    return o;
  };

  /* ---------- estado ---------- */
  function ler() { try { const t = root.localStorage.getItem(CHAVE); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  let S = ler();
  if (!S || S.versao !== 2) S = { versao: 2, contas: {}, offline: false, seq: 0 };
  const salvar = () => { try { root.localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (e) { /* sem armazenamento: vale só nesta visita */ } };
  const erro = (msg, codigo, extra) => Object.assign({ ok: false, erro: msg, codigo }, extra || {});
  const semRede = () => ({ ok: false, erro: 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.', conexao: true });
  const cnhLista = (c) => (!c || c === 'Não tem' ? [] : String(c).replace(/[^A-E]/g, '').split(''));
  const dadosVazios = () => ({ funcao: '', cidade: '', bairro: '', experiencias: [], escolaridade: '', cursos: [], cnh: [], turnos: [], pretensao: null, tempo: '', resumo: '' });
  const emailDe = () => { const s = root.VSC_API && root.VSC_API.sessao(); return s && s.user ? String(s.user.email).toLowerCase() : ''; };
  const conta = () => S.contas[emailDe()] || null;
  const SEM_SESSAO = () => erro('Sessão expirada. Entre de novo.', 'sessao', { sessaoExpirada: true });
  const idDe = (email) => 'u-' + Array.prototype.reduce.call(email, (h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16);

  function semearConta(email) {
    const per = Object.keys(PERSONAS).map((k) => PERSONAS[k]).filter((p) => p.email === email)[0];
    const c = { id: idDe(email), nome: '', whatsapp: '', email, criadaEm: iso(T0), curriculo: { arquivo: null, dados: dadosVazios() }, salvas: [], escondidas: [], alertas: [], candidaturas: [], msgs: {}, liberados: {}, lidas: {} };
    if (per) {
      const p = D.pessoas.filter((x) => x.id === per.pessoa)[0];
      const anos = p.experiencias.reduce((t, x) => t + Math.max(0, (x.fim ? +x.fim.slice(0, 4) + +x.fim.slice(5, 7) / 12 : 2026.9) - (+x.inicio.slice(0, 4) + +x.inicio.slice(5, 7) / 12)), 0);
      c.nome = p.nome; c.whatsapp = '5562900004821'.replace(/.{4}$/, p.id === 'p01' ? '4821' : '3377'); c.criadaEm = ha(400);
      c.curriculo = { arquivo: p.curriculoArquivo ? { nome: p.curriculoArquivo.nome, tamanhoKb: p.curriculoArquivo.tamanhoKb, tipo: 'application/pdf', enviadoEm: ha(p.atualizadoHa) } : null,
        dados: { funcao: p.funcaoDesejada, cidade: p.cidade, bairro: p.bairro, experiencias: p.experiencias.map((x) => Object.assign({}, x)), escolaridade: p.escolaridade, cursos: (p.cursos || []).slice(),
          cnh: cnhLista(p.cnh), turnos: (p.disponibilidade || []).slice(), pretensao: p.pretensao || null, tempo: anos > 3 ? 'Mais de 3 anos' : anos >= 1 ? '1 a 3 anos' : 'Menos de 1 ano', resumo: p.resumo } };
      c.salvas = per.salvas.slice();
      c.candidaturas = per.cands.map((id) => candDaBase(D.candidaturas.filter((x) => x.id === id)[0]));
    }
    return c;
  }
  // mantém a hora marcada na base (9h continua 9h), só leva o DIA para perto de hoje
  function horaDoDia(isoDia, original) {
    const m = /T(\d\d):(\d\d)/.exec(original), d = new Date(isoDia);
    if (m) d.setHours(+m[1], +m[2], 0, 0);
    return d.toISOString();
  }
  // candidatura semeada: os marcos são espaçados entre o envio e agora (a prévia não tem relógio de empresa de verdade)
  function candDaBase(b) {
    const ordem = ['nova', 'vista', 'em conversa', 'entrevista marcada', 'contratada'], alvo = b.etapa === 'não seguiu' ? 2 : ordem.indexOf(b.etapa);
    const criada = T0 - b.haHoras * H, passo = Math.max(H, Math.min(5 * H, (T0 - H - criada) / (alvo + 1))), m = { enviada: iso(criada) }, nomes = ['vista', 'conversa', 'marcada'];
    for (let i = 0; i < Math.min(alvo, 3); i++) m[nomes[i]] = iso(Math.min(criada + passo * (i + 1), T0 - (alvo - i) * 0.5 * H));
    if (b.etapa === 'não seguiu') m.fim = iso(Math.min(T0 - H, (m.vista ? Date.parse(m.vista) : criada) + 6 * H));
    return { id: b.id, vagaId: b.vagaId, etapa: b.etapa, criadaEm: iso(criada), marcos: m, entrevista: b.entrevista ? { quando: horaDoDia(abs(Date.parse(b.entrevista.quando)), b.entrevista.quando), onde: b.entrevista.onde, confirmada: null, pediuOutro: false } : null,
      encerradaPor: b.encerradaPor || null, forma: b.forma, respostas: b.respostas.map((r) => ({ pergunta: r.pergunta, resposta: r.resposta })), mensagem: b.mensagem || null, naoLidas: b.etapa === 'em conversa' ? 1 : 0, semeada: true };
  }
  const candJson = (k, c) => {
    const v = VAGA[k.vagaId], e = EMP[v.empresaId];
    const verificada = !!e.verificada, liberado = !!c.liberados[k.id];
    return { id: k.id, vagaId: k.vagaId, etapa: k.etapa, criadaEm: k.criadaEm, marcos: k.marcos, entrevista: k.entrevista, encerradaPor: k.encerradaPor || null, whatsappLiberado: verificada || liberado,
      empresaVerificada: verificada, naoLidas: c.lidas[k.id] ? 0 : k.naoLidas || 0, forma: k.forma, respostas: k.respostas, mensagem: k.mensagem, vaga: vagaJson(v), empresa: empresaJson(e) };
  };
  const exigirConta = () => conta() || null;

  /* ---------- públicos ---------- */
  M.base = () => {
    const pr = D.praca;
    return { ok: true, praca: { id: pr.id, nome: pr.nome, cidadePrincipal: pr.cidadePrincipal, uf: pr.uf, regiao: pr.regiao },
      cidades: D.cidades.map((c) => ({ id: c.id, nome: c.nome, uf: c.uf, principal: !!c.principal, status: 'ativa', bairros: c.bairros.slice(), distanciaKmAprox: c.distanciaKmAprox })),
      setores: D.setores.map((s) => ({ id: s.id, nome: s.nome, curto: s.curto, icone: s.icone })),
      vagas: D.vagas.filter((v) => v.status === 'aberta').map(vagaJson), empresas: D.empresas.map(empresaJson), geradoEm: iso(T0) };
  };
  M.vaga = (d) => {
    const v = VAGA[String(d.id || '')];
    if (!v) return erro('Vaga não encontrada ou já encerrada.', 'nao_encontrada');
    return { ok: true, vaga: vagaJson(v), empresa: empresaJson(EMP[v.empresaId]) };
  };
  M.codigoPedir = (d) => {
    if (S.offline) return semRede();
    const e = String(d.destino || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return erro('Escreva um e-mail válido.', 'destino_invalido');
    const m = /^([^@]{1,2})[^@]*(@.+)$/.exec(e);
    return { ok: true, canal: 'email', destinoMascarado: m ? m[1] + '•••' + m[2] : e, reenviarEmSeg: 30, expiraEmSeg: 600, dicaDemonstracao: 'Na demonstração, o código é ' + CODIGO };
  };
  M.codigoConfirmar = (d) => {
    const e = String(d.destino || '').trim().toLowerCase();
    if (String(d.codigo || '') !== CODIGO) return erro('Código errado. Confira os 6 números.', 'codigo_errado', { restantes: 4 });
    let nova = false;
    if (!S.contas[e]) { S.contas[e] = semearConta(e); nova = !Object.keys(PERSONAS).some((k) => PERSONAS[k].email === e); }
    if (d.nome && !S.contas[e].nome) S.contas[e].nome = String(d.nome).slice(0, 120);
    salvar();
    return { ok: true, novaConta: nova, tipo: 'pessoa', sessao: { access_token: 'demonstracao', refresh_token: 'demonstracao', expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: S.contas[e].id, email: e } } };
  };
  M.textoChecar = () => ({ ok: true, passa: true, barra: [], fraco: [] });

  /* ---------- pessoa ---------- */
  M.eu = () => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    return { ok: true, conta: { id: c.id, nome: c.nome, whatsapp: c.whatsapp, email: c.email, criadaEm: c.criadaEm, tipo: 'pessoa' }, curriculo: JSON.parse(JSON.stringify(c.curriculo)), salvas: c.salvas.slice(),
      escondidas: c.escondidas.slice(), alertas: JSON.parse(JSON.stringify(c.alertas)), avisos: [],
      contadores: { candidaturas: c.candidaturas.length, ativas: c.candidaturas.filter((k) => k.etapa !== 'não seguiu').length, naoLidas: c.candidaturas.filter((k) => k.naoLidas && !c.lidas[k.id]).length,
        salvas: c.salvas.length, escondidas: c.escondidas.length, alertas: c.alertas.length, avisos: 0 } };
  };
  M.perfilSalvar = (d) => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    if ('nome' in d) { if (String(d.nome).replace(/[^A-Za-zÀ-ÿ]/g, '').length < 2) return erro('Informe seu nome.', 'nome_invalido'); c.nome = String(d.nome).trim().slice(0, 120); }
    if (!c.nome) return erro('Informe seu nome.', 'nome_invalido');
    if ('whatsapp' in d) { const w = String(d.whatsapp).replace(/\D/g, ''); if (!/^55[1-9][1-9]9\d{8}$/.test(w)) return erro('WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).', 'whatsapp_invalido'); c.whatsapp = w; }
    if (!c.whatsapp) return erro('Informe seu WhatsApp.', 'whatsapp_invalido');
    if (d.email) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return erro('E-mail inválido.', 'email_invalido'); }
    if ('cidade' in d) { if (!CID[d.cidade]) return erro('Escolha a sua cidade.', 'cidade_invalida'); c.curriculo.dados.cidade = d.cidade; }
    if (!c.curriculo.dados.cidade) return erro('Escolha a sua cidade.', 'cidade_invalida');
    const dd = c.curriculo.dados;
    ['bairro', 'funcao', 'escolaridade', 'tempo', 'resumo'].forEach((k) => { if (k in d) dd[k] = String(d[k] == null ? '' : d[k]); });
    ['cursos', 'cnh', 'turnos'].forEach((k) => { if (k in d) dd[k] = Array.isArray(d[k]) ? d[k].slice() : []; });
    if ('pretensao' in d) dd.pretensao = d.pretensao === null || d.pretensao === '' ? null : +d.pretensao;
    if ('experiencias' in d) {
      for (const x of d.experiencias || []) { if (!x || String(x.cargo || '').length < 2) return erro('Informe o cargo de cada experiência.', 'experiencias_invalidas'); if (!/^\d{4}-\d{2}$/.test(x.inicio || '')) return erro('Informe o mês de início de cada experiência (AAAA-MM).', 'experiencias_invalidas'); }
      dd.experiencias = (d.experiencias || []).map((x) => ({ cargo: x.cargo, empresa: x.empresa || '', inicio: x.inicio, fim: x.fim || null }));
    }
    salvar();
    return { ok: true };
  };
  M.curriculoEnviar = (d) => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    if (S.offline) return semRede();
    c.curriculo.arquivo = { nome: d.nome, tamanhoKb: d.tamanhoKb, tipo: d.tipo, enviadoEm: iso(Date.now()) };
    salvar();
    return { ok: true, arquivo: c.curriculo.arquivo };
  };
  M.curriculoGuardar = (d) => { const c = exigirConta(); if (!c) return SEM_SESSAO(); c.curriculo.arquivo = { nome: d.nome, tamanhoKb: d.tamanhoKb, tipo: d.tipo, enviadoEm: iso(Date.now()) }; salvar(); return { ok: true, arquivo: c.curriculo.arquivo }; };
  M.curriculoApagar = () => { const c = exigirConta(); if (!c) return SEM_SESSAO(); c.curriculo.arquivo = null; salvar(); return { ok: true }; };
  const marcar = (campo, outro) => (d) => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    const id = String(d.vagaId), liga = campo === 'salvas' ? d.salvar !== false : d.esconder !== false;
    if (!VAGA[id]) return erro('Vaga não encontrada.', 'nao_encontrada');
    c[campo] = c[campo].filter((x) => x !== id);
    if (liga) { c[campo].unshift(id); if (outro) c[outro] = c[outro].filter((x) => x !== id); }
    salvar();
    return { ok: true, [campo]: c[campo].slice() };
  };
  M.vagaSalvar = marcar('salvas');
  M.vagaEsconder = marcar('escondidas', 'salvas');
  M.alertaSalvar = (d) => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    if (!d.funcao && !d.setorId && !d.cidade) return erro('Escolha uma função, um setor ou uma cidade para o alerta.', 'alerta_vazio');
    const a = { id: 'a' + (++S.seq), funcao: d.funcao || '', setorId: d.setorId || '', cidade: d.cidade || '', filtros: d.filtros || {}, canal: d.canal || 'email', criadoEm: iso(Date.now()) };
    c.alertas.unshift(a); salvar();
    return { ok: true, alerta: a, alertas: JSON.parse(JSON.stringify(c.alertas)) };
  };
  M.alertaApagar = (d) => { const c = exigirConta(); if (!c) return SEM_SESSAO(); c.alertas = c.alertas.filter((a) => a.id !== d.id); salvar(); return { ok: true, alertas: JSON.parse(JSON.stringify(c.alertas)) }; };
  M.candidatar = (d) => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    if (S.offline) return semRede();
    const dup = c.candidaturas.filter((k) => (d.idLocal && k.idLocal === d.idLocal) || (k.vagaId === d.vagaId && !(k.etapa === 'não seguiu' && k.encerradaPor === 'pessoa')))[0];
    const v = VAGA[d.vagaId];
    if (!v || v.status !== 'aberta') return erro('Esta vaga não está mais no ar.', 'vaga_indisponivel');
    const e = EMP[v.empresaId], segue = e.verificada ? 'completo' : 'so_resumo';
    if (dup) return { ok: true, candidaturaId: dup.id, etapa: dup.etapa, contatoSegue: segue, duplicado: true };
    if (['anexo', 'montar', 'minimo'].indexOf(d.caminho) < 0) return erro('Escolha como enviar o seu currículo.', 'caminho_invalido');
    if (d.dados) { const r = M.perfilSalvar(d.dados); if (!r.ok) return r; }
    if (!c.nome || !c.whatsapp || !c.curriculo.dados.cidade) return erro('Informe nome, WhatsApp, e-mail e cidade para se candidatar.', 'perfil_incompleto');
    if (d.caminho === 'anexo' && !c.curriculo.arquivo) {
      if (!d.dados) return erro('Anexe o seu currículo antes de enviar.', 'sem_arquivo');
      c.curriculo.arquivo = { nome: 'curriculo-exemplo.pdf', tamanhoKb: 182, tipo: 'application/pdf', enviadoEm: iso(Date.now()) };
    }
    if (d.caminho === 'montar' && !c.curriculo.dados.funcao) return erro('Conte um pouco da sua experiência para montar o currículo.', 'curriculo_vazio');
    const agora = iso(Date.now());
    const k = { id: 'n' + (++S.seq) + Math.floor(Date.now() % 1000), vagaId: v.id, etapa: 'nova', criadaEm: agora, marcos: { enviada: agora }, entrevista: null, encerradaPor: null, forma: d.caminho, respostas: d.respostas || [], mensagem: null, naoLidas: 0, idLocal: d.idLocal || '' };
    c.candidaturas.unshift(k); salvar();
    return { ok: true, candidaturaId: k.id, etapa: 'nova', contatoSegue: segue };
  };
  M.candidaturas = () => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    return { ok: true, lista: c.candidaturas.slice().sort((a, b) => Date.parse(b.criadaEm) - Date.parse(a.criadaEm)).map((k) => candJson(k, c)) };
  };
  const acharCand = (c, id) => c.candidaturas.filter((k) => k.id === id)[0];
  M.candidaturaRetirar = (d) => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    const k = acharCand(c, d.id);
    if (!k) return erro('Candidatura não encontrada.', 'nao_encontrada');
    k.etapa = 'não seguiu'; k.encerradaPor = 'pessoa'; k.marcos.fim = iso(Date.now()); salvar();
    return { ok: true };
  };
  M.entrevistaResponder = (d) => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    const k = acharCand(c, d.id);
    if (!k) return erro('Candidatura não encontrada.', 'nao_encontrada');
    if (k.etapa !== 'entrevista marcada' || !k.entrevista) return erro('Não há entrevista marcada nesta candidatura.', 'sem_entrevista');
    if (d.acao === 'confirmar') { k.entrevista.confirmada = true; k.entrevista.pediuOutro = false; } else if (d.acao === 'outro_horario') {
      k.entrevista.confirmada = false; k.entrevista.pediuOutro = true;
      (c.msgs[k.id] = c.msgs[k.id] || []).push({ id: 'm' + (++S.seq), de: 'eu', txt: 'Posso em outro horário? ' + String(d.texto || ''), ts: iso(Date.now()) });
    } else return erro('Ação inválida.', 'acao_invalida');
    salvar();
    return { ok: true };
  };
  M.whatsappLiberar = (d) => { const c = exigirConta(); if (!c) return SEM_SESSAO(); if (!acharCand(c, d.id)) return erro('Candidatura não encontrada.', 'nao_encontrada'); c.liberados[d.id] = true; salvar(); return { ok: true }; };
  M.conversa = (d) => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    const k = acharCand(c, d.id);
    if (!k) return erro('Conversa não encontrada.', 'nao_encontrada');
    const m = Date.parse(k.marcos.conversa || k.marcos.vista || k.criadaEm), l = [];
    if (k.mensagem) l.push({ id: 'i-' + k.id, de: 'eu', txt: k.mensagem, ts: k.criadaEm });
    if (RESPOSTAS_EMPRESA[k.id]) l.push({ id: 'r-' + k.id, de: 'ela', txt: RESPOSTAS_EMPRESA[k.id], ts: iso(m) });
    const msgs = l.concat(c.msgs[k.id] || []);
    c.lidas[k.id] = true; salvar();
    return { ok: true, mensagens: msgs, alertaGolpe: msgs.some((x) => x.de === 'ela' && /\b(pix|taxa|dep[oó]sito|boleto|pagar|pagamento)\b/i.test(x.txt)), lado: 'pessoa', podeEscrever: msgs.some((x) => x.de === 'ela') && k.etapa !== 'não seguiu', etapa: k.etapa };
  };
  M.mensagemEnviar = (d) => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    const k = acharCand(c, d.id);
    if (!k) return erro('Conversa não encontrada.', 'nao_encontrada');
    const t = String(d.texto || '').trim();
    if (!t) return erro('Escreva a mensagem.', 'texto_vazio');
    const m = { id: 'm' + (++S.seq), de: 'eu', txt: t, ts: iso(Date.now()) };
    (c.msgs[k.id] = c.msgs[k.id] || []).push(m); salvar();
    return { ok: true, mensagem: m, alerta: false };
  };
  M.quemViu = () => {
    const c = exigirConta();
    if (!c) return SEM_SESSAO();
    return { ok: true, lista: c.candidaturas.filter((k) => k.etapa !== 'nova').map((k) => ({ empresa: EMP[VAGA[k.vagaId].empresaId].nome, vaga: VAGA[k.vagaId].titulo, em: k.marcos.vista || k.criadaEm, o: c.liberados[k.id] ? 'contato' : 'currículo' })) };
  };
  M.denunciar = () => { if (!conta()) return SEM_SESSAO(); return { ok: true, derrubou: false, recebida: true }; };

  /* ---------- demonstração: faixa, ajustes e exemplo ---------- */
  const EXEMPLO_TXT = ['JOANA RIBEIRO', 'Currículo', 'Uruaçu - GO · Bairro Vila Nova', 'WhatsApp: (62) 90000-0182 · joana.ribeiro@example.com', '', 'Objetivo', 'Cozinheira ou auxiliar de cozinha', '',
    'Experiência profissional', 'Auxiliar de cozinha – Restaurante Beira do Lago (exemplo)', '2021 a 2024', '- Pré-preparo, saladas e lavagem de louça', 'Cozinheira – Marmitaria Panela de Barro (exemplo)', '2024 a hoje', '- Arroz, feijão, carnes e 80 marmitex por dia', '',
    'Formação', 'Ensino médio completo', '', 'Cursos', 'Boas práticas na manipulação de alimentos (16 h)'].join('\n');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;

  root.VSC_PREVIA_PESSOA = {
    persona: () => { const e = emailDe(); const k = Object.keys(PERSONAS).filter((x) => PERSONAS[x].email === e)[0]; return k || 'nova'; },
    exportar: () => { const c = conta(); return { ok: true, aviso: 'Dados de demonstração guardados só neste navegador.', conta: c ? { nome: c.nome, email: c.email, whatsapp: c.whatsapp } : null, curriculo: c ? c.curriculo : null, candidaturas: c ? c.candidaturas : [], salvas: c ? c.salvas : [] }; },
    excluirConta: () => { const e = emailDe(); delete S.contas[e]; salvar(); return Promise.resolve({ ok: true }); },
    aoIniciar(P) {
      const css = root.document.createElement('link');
      css.rel = 'stylesheet';
      css.href = SRC ? SRC.replace(/js\/v2\/previa\/pessoa\.js(\?.*)?$/, 'assets/v2/pessoa-previa.css') : 'assets/v2/pessoa-previa.css';
      root.document.head.appendChild(css);
      root.document.getElementById('faixa-previa').innerHTML = `<div class="faixa-demo" role="note"><span>${ic('info')}Demonstração com empresas e vagas fictícias</span>` +
        `<button type="button" data-acao="ajustes" aria-haspopup="dialog" aria-label="Ajustes da demonstração">${ic('filtro')}<span class="faixa-rot">Ajustes da demonstração</span></button></div>`;
      P.ganchos = P.ganchos || {};
      P.ganchos.apInicio = () => `<p class="demo-exemplo"><span class="exemplo">Demonstração</span><button class="link" type="button" data-acao="ap-exemplo">${ic('documento')}Testar com um currículo de exemplo</button></p>`;
      P.acoes['ap-exemplo'] = () => P.apPreencherExemplo('curriculo-joana.pdf', 182, EXEMPLO_TXT);
      P.acoes.ajustes = () => abrirAjustes(P);
      P.acoes.recomecar = async () => {
        P.fecharTodas();
        try { await root.VSC_API.sair(); } catch (e) { /* segue */ }
        S = { versao: 2, contas: {}, offline: false, seq: 0 }; salvar();
        P.limparConta(); P.est.offline = false; P.est.filtros = P.B.filtroVazio(); P.primeiraLista = true;
        P.ir('#/'); P.render(); P.toast('Demonstração recomeçada');
      };
      root.document.addEventListener('change', (e) => {
        const t = e.target;
        if (t.hasAttribute && t.hasAttribute('data-persona')) trocarPersona(P, t.value);
        if (t.hasAttribute && t.hasAttribute('data-offline')) {
          S.offline = t.checked; salvar(); P.est.offline = t.checked;
          if (!t.checked) { P.modulo('fila').then(() => P.fila.enviarPendentes()).then(() => P.render({ manter: true })); P.toast('Internet de volta'); } else { P.render({ manter: true }); P.toast('Simulando sem internet', null, 'sem-rede'); }
        }
      });
      if (S.offline) P.est.offline = true;
    }
  };
  async function trocarPersona(P, k) {
    P.fecharTodas();
    try {
      if (k === 'nova') { await root.VSC_API.sair(); P.limparConta(); } else {
        await root.VSC_API.codigoConfirmar({ destino: PERSONAS[k].email, codigo: CODIGO, tipo: 'pessoa' });
        await P.aposEntrar();
        await P.carregarCands().catch(() => null);
      }
      P.ir('#/'); P.render(); P.toast('Agora: ' + PERSONAS[k].rotulo);
    } catch (e) { P.toast(P.msgErro(e), null, 'erro'); }
  }
  function abrirAjustes(P) {
    const atual = root.VSC_PREVIA_PESSOA.persona(), c = conta();
    const corpo = '<h3 id="aj-quem">Quem está usando</h3><div class="opcoes-lista" role="radiogroup" aria-labelledby="aj-quem">' + Object.keys(PERSONAS).map((k) =>
      `<label class="opcao" for="persona-${k}"><input type="radio" id="persona-${k}" name="persona" value="${k}" data-persona${atual === k && !(k === 'nova' && c) ? ' checked' : ''}><span><span class="b">${esc(PERSONAS[k].rotulo)}</span><br><span class="detalhe">${esc(PERSONAS[k].detalhe)}</span></span></label>`).join('') + '</div>' +
      (atual === 'nova' && c ? `<p class="dica">Agora: a conta criada nesta demonstração (${esc(c.nome || c.email)}).</p>` : '') +
      '<h3>Internet</h3><label class="chave" for="aj-offline"><span>Simular sem internet<small>A candidatura fica guardada e sai quando a conexão volta</small></span>' +
      `<input type="checkbox" id="aj-offline" data-offline${S.offline ? ' checked' : ''}><span class="chave-trilho" aria-hidden="true"></span></label>` +
      '<h3>Recomeçar</h3><p class="dica mb12">Apaga o que foi feito nesta demonstração, inclusive as contas criadas. Fica tudo só neste aparelho.</p>' +
      `<button class="btn sec" type="button" data-acao="recomecar">${ic('desfazer')}Recomeçar a demonstração</button>`;
    P.abrirFolha({ id: 'folha-ajustes', titulo: 'Ajustes da demonstração', classe: 'alta', corpo });
  }
})(typeof window !== 'undefined' ? window : globalThis);
