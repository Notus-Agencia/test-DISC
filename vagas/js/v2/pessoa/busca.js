/*
 * Vagas sem Caos v2 · BUSCA da pessoa (lógica pura, roda no navegador e no Node).
 * Sem acento, no feminino, com sinônimos, com erro de 1 letra e com frases que viram filtro ("sem experiência", "pcd", cidade, bairro,
 * "cnh d", "perto de casa"). Só FATOS da vaga: nada de nota, ranking nem "compatibilidade". Ordem só por data ou por salário.
 *
 *   const B = VSC_BUSCA.criar({ vagas, empresas, setores, cidades, meuBairro });
 *     vagas     lista das vagas abertas ({id, titulo, setorId, empresaId, cidade, bairro, tipo, turno, salario, horas, ...}; horas = há quantas horas saiu)
 *     empresas  { [id]: {id, nome, verificada} }
 *     setores   [{id, nome, curto}]       cidades  [{id, nome, bairros:[...]}]  (a primeira é a principal)
 *     meuBairro função que devolve {cidade, bairro} ou null (para "perto de casa")
 */
(function (root) {
  'use strict';

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\((a|o|as|os|es)\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'para', 'pra', 'com', 'a', 'o', 'as', 'os', 'um', 'uma', 'vaga', 'vagas',
    'emprego', 'empregos', 'trabalho', 'trabalhar', 'servico', 'ou', 'quero', 'procuro', 'preciso', 'tem', 'algum', 'alguma', 'por', 'que']);
  function raiz(w) { return w.length > 4 ? w.replace(/(oes|aes|as|os|es|a|o|s)$/, '') : w; }
  function tokens(q) { return norm(q).split(' ').filter((w) => w && w.length > 1 && !PARADAS.has(w)); }

  const SIN = [
    { k: ['motorist', 'caminha', 'caminhoneir', 'onibus', 'van'], t: ['motorist'] },
    { k: ['motoboy', 'entregador', 'entrega', 'moto', 'delivery'], t: ['motoboy', 'entregador'] },
    { k: ['cozinheir', 'cozinh', 'cozinhar', 'merendeir', 'merend', 'chapeir', 'pizzaiol'], t: ['cozinheir', 'cozinha', 'chapeir', 'pizzaiol', 'merendeir'] },
    { k: ['atendent', 'atendiment', 'balconist', 'balca'], t: ['atendent', 'recepcionist', 'balconist', 'telemarketing'] },
    { k: ['vendedor', 'vend', 'venda'], t: ['vendedor'] },
    { k: ['diarist', 'diari', 'bico'], tipo: 'Diária', t: ['diarist'] },
    { k: ['domestic', 'empregad', 'faxineir', 'faxin', 'limpez', 'limpar'], t: ['limpez', 'domestic', 'diarist', 'servicos gerai'] },
    { k: ['garconet', 'garcom', 'garcon'], t: ['garcom'] },
    { k: ['enfermeir', 'enfermag'], t: ['enfermag'] },
    { k: ['professor'], t: ['professor'] },
    { k: ['caix'], t: ['caix'] },
    { k: ['porteir', 'portari', 'vigi', 'vigia', 'seguranc'], t: ['porteir', 'vigilant'] },
    { k: ['pedreir', 'obra', 'servent'], t: ['pedreir', 'servent'] },
    { k: ['estagi', 'estagiari'], tipo: 'Estágio' },
    { k: ['manicur', 'unha', 'pedicur'], t: ['manicur'] },
    { k: ['cabeleireir', 'cabel'], t: ['cabeleireir'] },
    { k: ['fazend', 'roca', 'ordenh', 'rural'], setor: 'agro' },
    { k: ['frentist', 'posto', 'combustivel', 'gasolin'], t: ['frentist'] },
    { k: ['baba', 'bab', 'crianc'], t: ['baba'] },
    { k: ['cuidador', 'idos'], t: ['cuidador'] },
    { k: ['repositor', 'reposic', 'repor'], t: ['repositor'] },
    { k: ['estoquist', 'estoqu'], t: ['estoquist'] },
    { k: ['padeir', 'padaria'], t: ['padeir', 'padaria'] },
    { k: ['acougueir', 'acougu'], t: ['acougueir'] },
    { k: ['recepcionist', 'recepca'], t: ['recepcionist'] }
  ];
  function grupoDe(w) {
    for (const g of SIN) for (const k of g.k) if (w === k || (k.length >= 5 && w.indexOf(k) === 0)) return g;
    return null;
  }
  // erro de 1 letra (troca, falta, sobra ou duas letras trocadas de lugar)
  function perto1(a, b) {
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0;
    while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
    return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
  }
  function uniao(a, b) { const x = a || []; return x.concat(b.filter((i) => x.indexOf(i) < 0)); }

  // Categoria de CNH que a vaga pede, lida do texto (requisitos, perguntas ou título): "CNH D", "CNH categoria B".
  function cnhDaVaga(v) {
    const t = [v.titulo].concat(v.requisitos || [], v.perguntas || []).join(' ');
    const m = /\bCNH(?:\s+categoria)?\s+([A-E])\b/i.exec(t);
    return m ? m[1].toUpperCase() : '';
  }

  function filtroVazio() {
    return { q: '', onde: 'regiao', bairro: '', setores: [], sal: null, tipos: [], turnos: [], cnh: '', semExp: false, verif: false, pcd: false, urgente: false,
      pub: 'qualquer', empresa: '', semana: false, ordem: 'recentes' };
  }
  const SAL_MES = [1500, 2000, 2500, 3000, 4000], SAL_DIA = [120, 150, 200];
  const PUB = [['24', 'Últimas 24 h'], ['72', 'Últimos 3 dias'], ['168', 'Últimos 7 dias'], ['qualquer', 'Qualquer data']];
  function reais(n) { return 'R$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  const POR = { mes: 'por mês', dia: 'por dia', hora: 'por hora' };

  function criar(op) {
    const vagas = op.vagas || [], EMP = op.empresas || {}, setores = op.setores || [], cidades = op.cidades || [];
    const SET = {}, CID = {};
    setores.forEach((s) => { SET[s.id] = s; });
    cidades.forEach((c) => { CID[c.id] = c; });
    const principal = cidades[0] || null;
    const meuBairro = typeof op.meuBairro === 'function' ? op.meuBairro : () => null;

    const TIT = {}, HAY = {};
    vagas.forEach((v) => {
      if (v.cnh === undefined) v.cnh = cnhDaVaga(v);
      TIT[v.id] = norm(v.titulo);
      HAY[v.id] = norm([v.titulo, SET[v.setorId] ? SET[v.setorId].nome : '', v.descricao, (v.atividades || []).join(' '), (v.requisitos || []).join(' '),
        EMP[v.empresaId] ? EMP[v.empresaId].nome : ''].join(' '));
    });

    // quanto a palavra casa com a vaga: 2 no título (ou sinônimo), 1 só no texto, 0 nada
    function casaPalavra(v, w) {
      const g = grupoDe(w);
      if (g) {
        if (g.t && g.t.some((t) => TIT[v.id].indexOf(t) >= 0)) return 2;
        if (g.tipo && v.tipo === g.tipo) return 2;
        if (g.setor && v.setorId === g.setor) return 2;
        return 0;
      }
      if (TIT[v.id].indexOf(w) >= 0) return 2;
      if (HAY[v.id].indexOf(w) >= 0) return 1;
      return 0;
    }
    const PAL_CACHE = {};
    function palavraUtil(w) {
      if (PAL_CACHE[w] === undefined) PAL_CACHE[w] = vagas.some((v) => casaPalavra(v, w) > 0);
      return PAL_CACHE[w];
    }
    const VOCAB = (function () {
      const m = {}, l = [];
      vagas.forEach((v) => TIT[v.id].split(' ').forEach((w) => { if (w.length >= 4 && !PARADAS.has(w) && !m[w]) { m[w] = 1; l.push({ w, r: raiz(w), mostra: w }); } }));
      SIN.forEach((g) => g.k.forEach((k) => { if (k.length >= 4 && !m[k]) { m[k] = 1; l.push({ w: k, r: k, mostra: k }); } }));
      return l;
    })();
    function corrigir(cru, w) {
      if (cru.length < 4) return null;
      for (const c of VOCAB) if ((perto1(w, c.r) || perto1(cru, c.w)) && palavraUtil(c.r)) return c;
      return null;
    }
    const PREP = {};
    function prepararPalavras(q) {
      if (PREP[q]) return PREP[q];
      const r = { ws: [], ign: [], trocas: [] };
      tokens(q).forEach((cru) => {
        const w = raiz(cru);
        if (palavraUtil(w)) { r.ws.push(w); return; }
        const c = corrigir(cru, w);
        if (c) { r.ws.push(c.r); r.trocas.push({ de: cru, para: c.mostra }); } else r.ign.push(cru);
      });
      PREP[q] = r;
      return r;
    }

    // frases que viram filtro
    const FRASES = [
      { re: /\b(sem experiencia|sem pratica|primeiro emprego|nunca trabalhei)\b/, f(F) { F.semExp = true; } },
      { re: /\b(jovem )?aprendiz(es)?\b/, f(F, r) { F.semExp = true; r.aprendiz = true; } },
      { re: /\b(pcd|pessoa com deficiencia|deficiencia|deficiente)\b/, f(F) { F.pcd = true; } },
      { re: /\burgentes?\b/, f(F) { F.urgente = true; } },
      { re: /\b(carteira assinada|registrad[oa]|clt)\b/, f(F) { F.tipos = uniao(F.tipos, ['CLT']); } },
      { re: /\b(perto de casa|perto da minha casa|perto de mim|no meu bairro|meu bairro)\b/,
        f(F, r) { const mb = meuBairro(); if (mb && CID[mb.cidade]) { F.onde = mb.cidade; F.bairro = mb.bairro; } else r.pedirBairro = true; } },
      { re: /\b(?:cnh|categoria|carteira)\s+(?:categoria\s+)?([a-e])\b/, f(F, r, m) { F.cnh = m[1].toUpperCase(); } }
    ];
    function entender(q, F) {
      F = F || filtroVazio();
      let t = ' ' + norm(q) + ' ';
      const r = { F, aprendiz: false, pedirBairro: false, achou: [] };
      FRASES.forEach((x) => { const m = t.match(x.re); if (m) { x.f(F, r, m); r.achou.push(m[0].trim()); t = t.replace(m[0], ' '); } });
      let cid = null;
      cidades.forEach((c) => { const re = new RegExp('\\b' + norm(c.nome) + '\\b'); if (!cid && re.test(t)) { cid = c; t = t.replace(re, ' '); } });
      if (cid) { F.onde = cid.id; F.bairro = ''; }
      (cid ? [cid] : cidades).some((c) => (c.bairros || []).some((b) => {
        const re = new RegExp('\\b' + norm(b) + '\\b');
        if (re.test(t)) { F.onde = c.id; F.bairro = b; t = t.replace(re, ' '); return true; }
        return false;
      }));
      r.resto = t.replace(/\s+/g, ' ').trim();
      return r;
    }
    function restoDe(q) { return entender(q || '').resto; }
    function rankPeriodo(s) { return s.aCombinar ? 9 : s.periodo === 'mes' ? 0 : s.periodo === 'dia' ? 1 : 2; }
    function ordenar(lista, ordem) {
      return lista.sort((a, b) => {
        if (ordem === 'salario') {
          const r = rankPeriodo(a.salario) - rankPeriodo(b.salario);
          if (r) return r;
          return (b.salario.min || 0) - (a.salario.min || 0) || a.horas - b.horas;
        }
        return a.horas - b.horas;
      });
    }
    // sem: filtros a ignorar (para contar "se eu tirasse este filtro")
    function filtrar(F, sem, info) {
      sem = sem || {}; info = info || {};
      const P = sem.q ? { ws: [], ign: [], trocas: [] } : prepararPalavras(restoDe(F.q)), ws = P.ws;
      info.ign = P.ign; info.trocas = P.trocas; info.parcial = false;
      let lista = vagas.filter((v) => {
        const e = EMP[v.empresaId] || {};
        if (!sem.onde && F.onde !== 'regiao' && v.cidade !== F.onde) return false;
        if (!sem.bairro && F.bairro && v.bairro !== F.bairro) return false;
        if (!sem.setores && F.setores.length && F.setores.indexOf(v.setorId) < 0) return false;
        if (!sem.sal && F.sal && (v.salario.aCombinar || v.salario.periodo !== F.sal.p || v.salario.min < F.sal.min)) return false;
        if (!sem.tipos && F.tipos.length && F.tipos.indexOf(v.tipo) < 0) return false;
        if (!sem.turnos && F.turnos.length && F.turnos.indexOf(v.turno) < 0) return false;
        if (!sem.cnh && F.cnh && v.cnh !== F.cnh) return false;
        if (!sem.semExp && F.semExp && !v.semExperiencia) return false;
        if (!sem.verif && F.verif && !e.verificada) return false;
        if (!sem.pcd && F.pcd && !v.pcd) return false;
        if (!sem.urgente && F.urgente && !v.urgente) return false;
        if (!sem.pub && F.pub !== 'qualquer' && v.horas > +F.pub) return false;
        if (!sem.empresa && F.empresa && v.empresaId !== F.empresa) return false;
        if (!sem.semana && F.semana && !(v.urgente || v.tipo === 'Diária')) return false;
        if (op.escondidas && op.escondidas().indexOf(v.id) >= 0) return false;
        return true;
      });
      // só palavras que não acham nada: nenhuma vaga (a tela diz qual palavra)
      if (!ws.length && P.ign.length) return [];
      if (ws.length) {
        lista.forEach((v) => {
          let n = 0, s = 0;
          ws.forEach((w) => { const c = casaPalavra(v, w); if (c) { n++; s += c; } });
          v._n = n; v._casa = s;
        });
        const todas = lista.filter((v) => v._n === ws.length);
        if (todas.length || ws.length === 1) lista = todas;
        else { lista = lista.filter((v) => v._n > 0); info.parcial = lista.length > 0; }
      }
      lista = ordenar(lista, F.ordem);
      if (ws.length) lista.sort((a, b) => (b._n - a._n) || (b._casa - a._casa));
      return lista;
    }
    function rotulosFiltro(F) {
      const r = [];
      if (F.empresa) r.push({ k: 'empresa', txt: (EMP[F.empresa] || {}).nome || 'Empresa' });
      if (F.semana) r.push({ k: 'semana', txt: 'Para esta semana' });
      if (F.onde !== 'regiao' && CID[F.onde]) r.push({ k: 'onde', txt: CID[F.onde].nome });
      if (F.bairro) r.push({ k: 'bairro', txt: F.bairro });
      F.setores.forEach((s) => r.push({ k: 'setores', v: s, txt: SET[s] ? SET[s].curto : s }));
      if (F.sal) r.push({ k: 'sal', txt: 'A partir de ' + reais(F.sal.min) + ' ' + POR[F.sal.p] });
      F.tipos.forEach((t) => r.push({ k: 'tipos', v: t, txt: op.tipoNome ? op.tipoNome(t) : t }));
      F.turnos.forEach((t) => r.push({ k: 'turnos', v: t, txt: t }));
      if (F.cnh) r.push({ k: 'cnh', txt: 'Pede CNH ' + F.cnh });
      if (F.semExp) r.push({ k: 'semExp', txt: 'Sem experiência' });
      if (F.verif) r.push({ k: 'verif', txt: 'Só empresas verificadas' });
      if (F.pcd) r.push({ k: 'pcd', txt: 'Vaga também para PcD' });
      if (F.urgente) r.push({ k: 'urgente', txt: 'Urgente' });
      if (F.pub !== 'qualquer') r.push({ k: 'pub', txt: PUB.filter((p) => p[0] === F.pub)[0][1] });
      return r;
    }
    function tirarFiltro(F, k, v) {
      if (k === 'setores' || k === 'tipos' || k === 'turnos') F[k] = (F[k] || []).filter((x) => x !== v);
      else if (k === 'onde') { F.onde = 'regiao'; F.bairro = ''; }
      else if (k === 'sal') F.sal = null;
      else if (k === 'pub') F.pub = 'qualquer';
      else if (k === 'bairro' || k === 'empresa' || k === 'cnh') F[k] = '';
      else F[k] = false;
    }
    function sugestoes(q, ondeAtual, maximo) {
      const out = [], r = entender(q, Object.assign(filtroVazio(), { onde: ondeAtual || 'regiao' })), ws = prepararPalavras(r.resto).ws, max = maximo || 5;
      if (norm(q).length < 2) return out;
      r.F.q = r.resto;
      const nTodas = filtrar(r.F).length;
      if (nTodas) out.push({ tipo: 'todas', txt: q.trim(), n: nTodas });
      if (!ws.length) return out;
      const cont = {};
      filtrar(r.F).forEach((v) => {
        if (v._n !== ws.length) return;
        const t = v.titulo.replace(/\s*\(.*?(diária|laticínio|cerâmica|hospital)[^)]*\)/i, '');
        if (ws.every((w) => casaPalavra(v, w) === 2 || norm(t).split(' ').some((p) => p.indexOf(w) === 0))) cont[t] = (cont[t] || 0) + 1;
      });
      Object.keys(cont).sort((a, b) => cont[b] - cont[a]).slice(0, max).forEach((t) => { if (norm(t) !== norm(q)) out.push({ tipo: 'funcao', txt: t, n: cont[t] }); });
      setores.forEach((s) => {
        const n = norm(s.nome + ' ' + (s.curto || ''));
        if (ws.every((w) => n.split(' ').some((p) => p.indexOf(w) === 0))) {
          const c = vagas.filter((v) => v.setorId === s.id).length;
          if (c) out.push({ tipo: 'setor', id: s.id, txt: s.nome, n: c });
        }
      });
      return out.slice(0, max + 1);
    }
    return { filtroVazio, filtrar, entender, restoDe, sugestoes, rotulosFiltro, tirarFiltro, ordenar, prepararPalavras, casaPalavra, principal };
  }

  const API = { criar, norm, raiz, tokens, perto1, uniao, cnhDaVaga, filtroVazio, SAL_MES, SAL_DIA, PUB, SIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.VSC_BUSCA = API;
})(typeof self !== 'undefined' ? self : this);
