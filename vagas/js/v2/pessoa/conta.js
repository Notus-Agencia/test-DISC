/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · dados do site (vagas, empresas, cidades) e dados da conta (currículo, salvas, alertas, candidaturas).
 * Tudo vem de window.VSC_API. Sem conta, "salvar" e "esconder" ficam no aparelho (chaves 'vsc.eu.*') e sobem para a conta ao entrar.
 */
(function (root) {
  'use strict';
  const P = root.VSC_P, E = P.est, D = P.D;
  const BUSCA = root.VSC_BUSCA;

  /* ---------- vagas, empresas, cidades ---------- */
  P.prepVaga = function (v) {
    v.horas = P.horasDesde(v.publicadaEm);
    v.salario = v.salario || { aCombinar: true };
    ['beneficios', 'requisitos', 'diferenciais', 'atividades', 'perguntas'].forEach((k) => { if (!Array.isArray(v[k])) v[k] = []; });
    v.horario = v.horario || '';
    v.bairro = v.bairro || '';
    if (v.expiraEm) {
      const dias = Math.ceil((P.ts(v.expiraEm) - Date.now()) / (24 * P.H));
      if (dias >= 0 && dias <= 3) v.saiDoArDias = Math.max(dias, 1);
    }
    return v;
  };
  P.hidratar = function (base) {
    D.praca = base.praca || null;
    D.cidades = base.cidades || [];
    D.setores = base.setores || [];
    D.empresas = base.empresas || [];
    D.vagas = (base.vagas || []).map(P.prepVaga);
    D.geradoEm = base.geradoEm || '';
    D.EMP = {}; D.VAGA = {}; D.SET = {}; D.CID = {};
    D.setores.forEach((s) => { D.SET[s.id] = s; });
    D.cidades.forEach((c) => { D.CID[c.id] = c; });
    D.empresas.forEach((e) => { D.EMP[e.id] = e; });
    D.vagas.forEach((v) => { D.VAGA[v.id] = v; });
    D.ABERTAS = D.vagas.filter((v) => v.status === 'aberta');
    P.B = BUSCA.criar({ vagas: D.ABERTAS, empresas: D.EMP, setores: D.setores, cidades: D.cidades, meuBairro: () => E.meuBairro,
      escondidas: () => E.escondidas, tipoNome: P.tipoNome });
    if (!E.filtros) E.filtros = P.B.filtroVazio();
    return P.B;
  };
  // vaga e empresa que chegaram por link direto ou pela lista de candidaturas (podem não estar na lista pública)
  P.incluir = function (vaga, empresa) {
    if (empresa && !D.EMP[empresa.id]) D.EMP[empresa.id] = empresa;
    if (vaga && !D.VAGA[vaga.id]) D.VAGA[vaga.id] = P.prepVaga(vaga);
  };
  P.carregarBase = function (cidade) { return P.api('base', cidade ? { cidade } : {}).then((r) => { P.hidratar(r); return r; }); };

  /* ---------- salvar e esconder (conta ou aparelho) ---------- */
  function listaLocal(k) { const l = P.eu.ler(k, []); return Array.isArray(l) ? l : []; }
  P.carregarLocais = function () { E.salvas = listaLocal('salvas'); E.escondidas = listaLocal('escondidas'); E.meuBairro = P.eu.ler('bairro', null); };
  function alternar(lista, id, ligar) { const i = lista.indexOf(id); if (ligar && i < 0) lista.unshift(id); if (!ligar && i >= 0) lista.splice(i, 1); return lista; }
  P.marcar = function (campo, metodo, idCampo, id, ligar) {
    const antes = E[campo].slice();
    E[campo] = alternar(E[campo].slice(), id, ligar);
    if (!E.conta) { P.eu.guardar(campo, E[campo]); return Promise.resolve(); }
    return P.api(metodo, { vagaId: id, [idCampo]: ligar }).then((r) => { E[campo] = r[campo] || E[campo]; }, (e) => { E[campo] = antes; throw e; });
  };
  P.salvarVaga = (id, ligar) => P.marcar('salvas', 'vagaSalvar', 'salvar', id, ligar);
  P.esconderVaga = (id, ligar) => P.marcar('escondidas', 'vagaEsconder', 'esconder', id, ligar);

  /* ---------- conta ---------- */
  function normalizarDados(d) {
    d = d || {};
    return { funcao: d.funcao || '', cidade: d.cidade || '', bairro: d.bairro || '', experiencias: d.experiencias || [], escolaridade: d.escolaridade || '', cursos: d.cursos || [],
      cnh: d.cnh || [], turnos: d.turnos || [], pretensao: d.pretensao || '', tempo: d.tempo || '', resumo: d.resumo || '' };
  }
  P.limparConta = function () {
    E.conta = null; E.curriculo = null; E.alertas = []; E.contadores = {}; E.avisos = []; E.cands = []; E.candsCarregadas = false;
    P.carregarLocais();
  };
  P.carregarConta = async function () {
    if (!root.VSC_API.sessao()) { P.limparConta(); return null; }
    const r = await P.api('eu');
    const c = r.conta, a = r.curriculo && r.curriculo.arquivo;
    E.conta = { id: c.id, nome: c.nome || '', whats: c.whatsapp ? P.mascaraWhats(c.whatsapp) : '', email: c.email || '', tipo: c.tipo || 'pessoa' };
    E.curriculo = { arquivo: a ? { nome: a.nome, kb: a.tamanhoKb, tipo: a.tipo, ts: a.enviadoEm } : null, dados: normalizarDados(r.curriculo && r.curriculo.dados) };
    E.salvas = r.salvas || []; E.escondidas = r.escondidas || []; E.alertas = r.alertas || []; E.contadores = r.contadores || {}; E.avisos = r.avisos || [];
    if (!E.meuBairro && E.curriculo.dados.cidade && E.curriculo.dados.bairro) E.meuBairro = { cidade: E.curriculo.dados.cidade, bairro: E.curriculo.dados.bairro };
    return E.conta;
  };
  P.carregarCands = async function () {
    if (!E.conta) { E.cands = []; return []; }
    const r = await P.api('candidaturas');
    E.cands = (r.lista || []).map((c) => { P.incluir(c.vaga, c.empresa); return c; });
    E.candsCarregadas = true;
    return E.cands;
  };
  // sobe para a conta o que a pessoa salvou ou escondeu antes de entrar
  P.subirLocais = async function () {
    const s = listaLocal('salvas'), h = listaLocal('escondidas');
    for (const id of s) { try { await P.api('vagaSalvar', { vagaId: id, salvar: true }); } catch (e) { /* vaga que saiu do ar: segue */ } }
    for (const id of h) { try { await P.api('vagaEsconder', { vagaId: id, esconder: true }); } catch (e) { /* idem */ } }
    P.eu.guardar('salvas', null); P.eu.guardar('escondidas', null);
  };
  P.aposEntrar = async function () {
    await P.subirLocais();
    await P.carregarConta();
    P.carregarCands().then(() => { P.pintarContadores(); if (P.redesenhar) P.redesenhar(); }, () => {});
    P.pintarContadores();
  };
  P.sair = async function () {
    try { await root.VSC_API.sair(); } catch (e) { /* sai do aparelho mesmo assim */ }
    if (P.fila) P.fila.limparTudo();
    P.limparConta();
    if (P.aoSair) P.aoSair();
  };
  P.aoExpirar = function () {
    if (!E.conta || P._expirando) return;
    P._expirando = true;
    root.VSC_API.sair().catch(() => {});
    P.limparConta();
    P.toast('Sua sessão expirou. Entre de novo com um código.', null, 'info');
    if (P.aoSair) P.aoSair();
    setTimeout(() => { P._expirando = false; }, 800);
  };
  P.pintarContadores = function () {
    const n = P.avisosNaBarra();
    P.$$('[data-contador]').forEach((el) => { el.hidden = !n; el.textContent = n; });
  };

  /* dados do perfil no formato do contrato (perfilSalvar e candidatar.dados) */
  P.dadosDoPerfil = function (d) {
    const o = { nome: d.nome, whatsapp: P.whatsDigitos(d.whats), cidade: d.cidade };
    if (d.email) o.email = d.email;
    if (d.bairro) o.bairro = d.bairro;
    if (d.funcao) o.funcao = d.funcao;
    if (d.tempo) o.tempo = d.tempo;
    if (d.escolaridade) o.escolaridade = d.escolaridade;
    if (d.cursos && d.cursos.length) o.cursos = d.cursos;
    if (d.cnh) o.cnh = d.cnh;
    if (d.turnos) o.turnos = d.turnos;
    if (d.experiencias && d.experiencias.length) o.experiencias = d.experiencias;
    if (d.resumo) o.resumo = d.resumo;
    if (d.pretensao) o.pretensao = +d.pretensao;
    return o;
  };
  P.fmtExp = function (x, comEmpresa) {
    const ini = +String(x.inicio || '').slice(0, 4), fim = x.fim ? +String(x.fim).slice(0, 4) : 0;
    const quando = ini ? ini + ' a ' + (fim || 'hoje') : '';
    return [x.cargo, comEmpresa !== false ? x.empresa : '', quando].filter(Boolean).join(' · ');
  };
})(typeof self !== 'undefined' ? self : this);
