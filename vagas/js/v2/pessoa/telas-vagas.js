/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · início, resultados, vaga, salvas e "Como funciona" (a parte que todo visitante vê, sem conta).
 * A busca, os filtros, os sinônimos e a ordem rodam aqui no navegador sobre a lista que veio de VSC_API.base().
 * O filtro inteiro vai para o endereço (#/vagas?q=...): o botão voltar, o recarregar e o link compartilhado funcionam.
 */
(function (root) {
  'use strict';
  const P = root.VSC_P, { esc, ic, plural } = P, E = P.est, D = P.D;
  const M = root.VSC_BUSCA;

  /* ---------- filtro <-> endereço ---------- */
  const csv = (s) => (s ? String(s).split(',').filter(Boolean) : []);
  P.filtroParaQuery = function (F) {
    const q = new root.URLSearchParams();
    if (F.q) q.set('q', F.q);
    if (F.onde && F.onde !== 'regiao') q.set('onde', F.onde);
    if (F.bairro) q.set('bairro', F.bairro);
    if (F.setores.length) q.set('setor', F.setores.join(','));
    if (F.sal) q.set('sal', F.sal.min + ':' + F.sal.p);
    if (F.tipos.length) q.set('tipo', F.tipos.join(','));
    if (F.turnos.length) q.set('turno', F.turnos.join(','));
    if (F.cnh) q.set('cnh', F.cnh);
    ['semExp', 'verif', 'pcd', 'urgente', 'semana'].forEach((k) => { if (F[k]) q.set(k.toLowerCase(), '1'); });
    if (F.pub !== 'qualquer') q.set('pub', F.pub);
    if (F.empresa) q.set('empresa', F.empresa);
    if (F.ordem === 'salario') q.set('ordem', 'salario');
    const s = q.toString();
    return s ? '?' + s : '';
  };
  P.queryParaFiltro = function (qs) {
    const q = new root.URLSearchParams(qs || ''), F = M.filtroVazio();
    F.q = (q.get('q') || '').slice(0, 120);
    const onde = q.get('onde');
    if (onde && D.CID[onde]) F.onde = onde;
    F.bairro = (q.get('bairro') || '').slice(0, 80);
    F.setores = csv(q.get('setor')).filter((s) => D.SET[s]);
    const sal = /^(\d{3,5}):(mes|dia|hora)$/.exec(q.get('sal') || '');
    if (sal) F.sal = { min: +sal[1], p: sal[2] };
    F.tipos = csv(q.get('tipo')).filter((t) => P.TIPOS.indexOf(t) >= 0);
    F.turnos = csv(q.get('turno')).filter((t) => P.TURNOS.indexOf(t) >= 0);
    F.cnh = /^[A-E]$/.test(q.get('cnh') || '') ? q.get('cnh') : '';
    ['semExp', 'verif', 'pcd', 'urgente', 'semana'].forEach((k) => { F[k] = q.get(k.toLowerCase()) === '1'; });
    if (['24', '72', '168'].indexOf(q.get('pub')) >= 0) F.pub = q.get('pub');
    F.empresa = q.get('empresa') && D.EMP[q.get('empresa')] ? q.get('empresa') : '';
    if (q.get('ordem') === 'salario') F.ordem = 'salario';
    return F;
  };
  P.aplicarFiltros = function (F, aviso) {
    delete F._per;
    F.aviso = aviso || '';
    E.filtros = F;
    E.avisoBusca = F.aviso;
    P.rolagem.busca = 0;
    const h = '#/vagas' + P.filtroParaQuery(F);
    if (root.location.hash === h) { P.render({ manter: true }); root.scrollTo(0, 0); } else P.ir(h);
  };
  P.preset = (p) => Object.assign(M.filtroVazio(), { onde: E.filtros.onde }, p);
  P.buscarTexto = function (q, F) {
    const r = P.B.entender(q, F);
    F.q = r.resto;
    P.aplicarFiltros(F, r.aprendiz ? 'aprendiz' : r.pedirBairro ? 'bairro' : '');
  };

  /* ---------- peças das telas ---------- */
  const nomeOnde = (id) => (id === 'regiao' ? (D.praca && D.praca.nome) || 'Todas as cidades' : D.CID[id] ? D.CID[id].nome : '');
  P.opcoesOnde = (sel) => `<option value="regiao"${sel === 'regiao' ? ' selected' : ''}>${esc(nomeOnde('regiao'))}</option>` +
    D.cidades.map((c) => `<option value="${esc(c.id)}"${sel === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  P.chipPerto = function (onde) {
    const mb = E.meuBairro && D.CID[E.meuBairro.cidade] ? E.meuBairro : null;
    if (!mb) return `<button class="chip" type="button" data-acao="bairro" aria-haspopup="dialog">${ic('local')}Perto de casa${ic('chevron', 'seta')}</button>`;
    const n = D.ABERTAS.filter((v) => v.cidade === mb.cidade && v.bairro === mb.bairro).length;
    return `<button class="chip" type="button" data-acao="perto" data-origem="${onde}">${ic('local')}Perto de casa · ${esc(mb.bairro)} <span class="n">${n}</span></button>`;
  };
  P.semVagas = function () {
    const c = D.cidades[0], nome = c ? c.nome : 'sua cidade';
    return `<div class="vazio">${ic('maleta')}<b>Ainda não há vagas aqui</b><p>Avise-me quando chegar. É só deixar seu e-mail: mandamos uma mensagem quando entrar vaga.</p>` +
      `<button class="btn" type="button" data-acao="avisar-cidade" data-id="${esc(c ? c.id : '')}">${ic('sino')}Avisar quando tiver vaga em ${esc(nome)}</button>` +
      `<a class="link" href="empresas.html">Tem empresa e precisa contratar? Anuncie grátis</a></div>`;
  };

  /* ---------- início ---------- */
  P.telas.inicio = function () {
    if (!D.ABERTAS.length) {
      return `<div class="pagina estreita">${P.faixaOffline()}<div class="cab-pagina"><h1>${esc((D.praca && D.praca.nome) ? 'Vagas em ' + D.praca.nome : 'Vagas sem Caos')}</h1></div>${P.semVagas()}<div class="secao">${P.golpe()}</div></div>`;
    }
    const B = P.B, A = D.ABERTAS, ord = (l, o) => B.ordenar(l.slice(), o);
    const hoje = ord(A.filter((v) => v.horas <= 24), 'recentes'), semana = ord(A.filter((v) => v.urgente || v.tipo === 'Diária'), 'recentes');
    const alto = ord(A.filter((v) => v.salario.periodo === 'mes' && v.salario.min >= 2500), 'salario'), semexp = ord(A.filter((v) => v.semExperiencia), 'recentes');
    const novas = hoje.length ? hoje : ord(A, 'recentes').slice(0, 5);
    const cont = {};
    A.forEach((v) => { cont[v.setorId] = (cont[v.setorId] || 0) + 1; });
    const top = D.setores.map((s, i) => ({ s, i })).sort((a, b) => (cont[b.s.id] || 0) - (cont[a.s.id] || 0) || a.i - b.i).slice(0, 8).map((x) => x.s);
    const nPcd = A.filter((v) => v.pcd).length, nDia = A.filter((v) => v.tipo === 'Diária').length, nUrg = A.filter((v) => v.urgente).length;
    let topo = '';
    if (E.conta) {
      const ms = P.minhas(), ent = ms.filter((c) => c.etapa === 'entrevista marcada' && c.entrevista && P.ts(c.entrevista.quando) > Date.now())[0];
      const chamou = ms.filter((c) => c.etapa === 'em conversa' && c.naoLidas > 0);
      if (ent) {
        const v = D.VAGA[ent.vagaId];
        topo += `<a class="cartao-aviso" href="#/candidatura/${esc(ent.id)}">${ic('calendario')}<span><b>${ent.entrevista.confirmada ? 'Presença confirmada · ' : 'Você tem 1 entrevista marcada · '}${esc(P.diaHora(ent.entrevista.quando))}</b>` +
          `<small>${esc(v ? v.titulo : '')} · ${esc(P.empresaDe(v || { empresaId: ent.empresa && ent.empresa.id }).nome)}</small></span>${ic('chevron-dir')}</a>`;
      }
      if (chamou.length) {
        const v = D.VAGA[chamou[0].vagaId];
        topo += `<a class="cartao-aviso info" href="#/candidatura/${esc(chamou[0].id)}">${ic('conversa')}<span><b>${chamou.length === 1 ? 'A empresa chamou você' : chamou.length + ' empresas chamaram você'}</b>` +
          `<small>${esc(P.empresaDe(v || { empresaId: chamou[0].empresa && chamou[0].empresa.id }).nome)} mandou uma mensagem</small></span>${ic('chevron-dir')}</a>`;
      }
    }
    const F = E.filtros;
    const chip = (a, rot, n, icone) => `<button class="chip" type="button" data-acao="atalho" data-atalho="${a}">${icone ? ic(icone) : ''}${rot} <span class="n">${n}</span></button>`;
    const bloco = (id, titulo, sub, ver, atalho, itens, grade) => (itens.length
      ? `<section class="secao" aria-labelledby="${id}"><div class="secao-topo"><h2 id="${id}">${titulo}</h2><span class="n">${sub}</span><button class="link" type="button" data-acao="atalho" data-atalho="${atalho}">${ver}</button></div>` +
        (grade ? `<ul class="grade-vagas limite">${itens.slice(0, 6).map((v) => P.cartao(v)).join('')}</ul>` : `<div class="caixa-lista"><ul class="lista-vagas plana">${itens.slice(0, 5).map((v) => P.cartao(v)).join('')}</ul></div>`) + '</section>'
      : '');
    return `<div class="pagina">${P.faixaOffline()}${topo}` +
      `<section class="hero" aria-labelledby="h-inicio"><div class="hero-grade"><div>` +
        `<h1 id="h-inicio">${esc((D.praca && D.praca.nome) ? 'Vagas em ' + D.praca.nome : 'Vagas sem Caos')}</h1>` +
        `<p class="hero-linha"><span><b class="num">${A.length}</b> ${A.length === 1 ? 'vaga aberta' : 'vagas abertas'} · salário em todas</span>${A.some((v) => v.exemplo) ? '<span class="exemplo">Exemplo</span>' : ''}</p>` +
        '<form class="busca-dupla" data-form="buscar" role="search" autocomplete="off">' +
          `<div class="bd-campo" data-sugere="q-inicio">${ic('busca')}<label class="bd-rotulo" for="q-inicio">Que vaga você procura?</label>` +
            `<input class="bd-entrada" id="q-inicio" name="q" type="search" enterkeyhint="search" placeholder="Ex.: caixa, motorista" value="${esc(F.q)}" aria-autocomplete="list" aria-controls="sug-q-inicio" aria-expanded="false">` +
            '<ul class="sugestoes" id="sug-q-inicio" role="listbox" aria-label="Sugestões" hidden></ul></div>' +
          `<div class="bd-campo">${ic('local')}<label class="bd-rotulo" for="onde-inicio">Onde</label>` +
            `<select class="bd-entrada" id="onde-inicio" name="onde" data-acao-muda="onde">${P.opcoesOnde(F.onde)}</select>${ic('chevron', 'bd-seta')}</div>` +
          `<button class="btn grande" type="submit">${ic('busca')}Buscar vagas</button>` +
        '</form></div>' +
        `<aside class="hero-lado" aria-label="Vaga mais nova"><p class="rotulo-pequeno"><i></i>Entrou ${P.quandoPub(novas[0].horas)}</p><ul class="lista-vagas">${P.cartao(novas[0])}</ul></aside>` +
      '</div>' +
      `<div class="chips atalhos" role="group" aria-label="Atalhos">${P.chipPerto('inicio')}` +
        chip('semexp', 'Sem experiência', semexp.length) + chip('hoje', 'Novas hoje', hoje.length) + chip('urgentes', 'Urgentes', nUrg, 'raio') +
        chip('alto', 'R$ 2.500 ou mais', alto.length) + chip('diarias', 'Diárias', nDia) + chip('pcd', 'Também para PcD', nPcd, 'acessivel') +
      '</div></section>' +
      `<section class="secao" aria-labelledby="h-setor"><div class="secao-topo"><h2 id="h-setor">Procure por setor</h2><button class="link" type="button" data-acao="todos-setores">Ver os ${D.setores.length} setores</button></div>` +
        `<ul class="setores">${top.map((s) => `<li><button class="setor" type="button" data-acao="setor" data-id="${esc(s.id)}"><span class="setor-ic">${ic('setor-' + s.id)}</span><span><b>${esc(s.curto || s.nome)}</b><small>${plural(cont[s.id] || 0, 'vaga', 'vagas')}</small></span></button></li>`).join('')}</ul></section>` +
      bloco('h-hoje', 'Vagas novas hoje', plural(hoje.length, 'vaga', 'vagas'), 'Ver todas', 'hoje', hoje, false) +
      bloco('h-semana', 'Para esta semana', 'urgentes e diárias', 'Ver as ' + semana.length, 'semana', semana, true) +
      bloco('h-alto', 'Salário de R$ 2.500 ou mais', plural(alto.length, 'vaga', 'vagas') + ' por mês', 'Ver todas', 'alto', alto, true) +
      bloco('h-semexp', 'Sem experiência', plural(semexp.length, 'vaga', 'vagas') + ' aceitam quem está começando', 'Ver todas', 'semexp', semexp, true) +
      `<div class="secao">${P.golpe()}</div>` +
      `<section class="secao"><div class="alerta-linha cartao-linha"><span><b>Tem empresa e precisa contratar?</b>Anuncie grátis. A vaga entra no ar na hora e a verificação vem depois.</span><a class="btn sec" href="empresas.html">${ic('predio')}Anunciar vaga grátis</a></div></section>` +
    '</div>';
  };

  /* ---------- resultados ---------- */
  P.chipsFiltro = function (F) {
    const n = (a) => (a ? ` <span class="n">${a}</span>` : '');
    return '<div class="chips" role="group" aria-label="Filtros">' +
      `<button class="chip${F.bairro ? ' ativo' : ''}" type="button" data-acao="bairro" aria-haspopup="dialog">${ic('local')}${F.bairro ? esc(F.bairro) : 'Bairro'}${ic('chevron', 'seta')}</button>` +
      `<button class="chip" type="button" data-acao="alternar" data-f="semExp" aria-pressed="${F.semExp}">${ic('check', 'marca')}Sem experiência</button>` +
      `<button class="chip${F.setores.length ? ' ativo' : ''}" type="button" data-acao="filtros" data-secao="setor" aria-haspopup="dialog">Setor${n(F.setores.length)}${ic('chevron', 'seta')}</button>` +
      `<button class="chip${F.sal ? ' ativo' : ''}" type="button" data-acao="filtros" data-secao="salario" aria-haspopup="dialog">Salário${ic('chevron', 'seta')}</button>` +
      `<button class="chip${F.turnos.length ? ' ativo' : ''}" type="button" data-acao="filtros" data-secao="turno" aria-haspopup="dialog">Horário${n(F.turnos.length)}${ic('chevron', 'seta')}</button>` +
      `<button class="chip${F.tipos.length ? ' ativo' : ''}" type="button" data-acao="filtros" data-secao="tipo" aria-haspopup="dialog">Tipo${n(F.tipos.length)}${ic('chevron', 'seta')}</button>` +
      `<button class="chip" type="button" data-acao="alternar" data-f="verif" aria-pressed="${F.verif}">${ic('check', 'marca')}Só empresas verificadas</button>` +
      `<button class="chip${((F.onde !== 'regiao' && !F.bairro) || F.pcd || F.urgente || F.cnh || F.pub !== 'qualquer') ? ' ativo' : ''}" type="button" data-acao="filtros" data-secao="mais" aria-haspopup="dialog">${ic('filtro')}Mais filtros</button>` +
    '</div>';
  };
  function vazioBusca(F) {
    const B = P.B, rot = B.rotulosFiltro(F);
    let melhor = null;
    if (F.sal) { const n = B.filtrar(F, { sal: 1 }).length; if (n) melhor = { k: 'sal', n, txt: 'salário', botao: 'Tirar o filtro de salário' }; }
    if (!melhor) {
      rot.forEach((r) => {
        const G = JSON.parse(JSON.stringify(F));
        B.tirarFiltro(G, r.k, r.v);
        const m = B.filtrar(G).length;
        if (m && (!melhor || m > melhor.n)) melhor = { k: r.k, v: r.v, n: m, txt: '“' + r.txt + '”', botao: 'Tirar “' + r.txt + '”' };
      });
    }
    const semQ = F.q ? B.filtrar(F, { q: 1 }).length : 0;
    const pergunta = melhor
      ? `<p>Tirar o filtro de ${esc(melhor.txt)}? ${melhor.n === 1 ? 'Aparece 1 vaga.' : 'Aparecem ' + melhor.n + ' vagas.'}</p><button class="btn" type="button" data-acao="tirar" data-k="${melhor.k}"${melhor.v ? ` data-v="${esc(melhor.v)}"` : ''}>${esc(melhor.botao)}</button>`
      : semQ ? `<p>${rot.length ? 'Nenhuma vaga com a palavra “' + esc(F.q) + '”. ' : 'Confira se a palavra está certa ou procure pela função, como “caixa” ou “cozinha”. '}Sem ela, aparecem ${semQ} vagas.</p><button class="btn" type="button" data-acao="tirar-busca">Ver as ${semQ} vagas</button>`
        : '<p>Tire um filtro ou veja vagas parecidas.</p>';
    const base = F.setores.length ? D.ABERTAS.filter((v) => F.setores.indexOf(v.setorId) >= 0) : D.ABERTAS;
    const par = B.ordenar(base.slice(), 'recentes').slice(0, 3), soPalavra = F.q && !rot.length;
    const cidade = F.onde !== 'regiao' && D.CID[F.onde] ? D.CID[F.onde] : D.cidades[0];
    return `<div class="vazio">${ic('busca')}<b>${soPalavra ? 'Nenhuma vaga com a palavra “' + esc(F.q) + '”' : 'Nenhuma vaga com esses filtros.'}</b>${pergunta}` +
      (rot.length ? '<button class="link" type="button" data-acao="limpar">Limpar todos os filtros</button>' : '') +
      (cidade ? `<button class="link" type="button" data-acao="alerta-busca">${ic('sino')}Avisar quando tiver vaga assim em ${esc(cidade.nome)}</button>` : '') + '</div>' +
      (par.length ? `<h2 class="grupo-titulo">Vagas parecidas</h2><ul class="lista-vagas">${par.map((v) => P.cartao(v)).join('')}</ul>` : '');
  }
  function listaBusca(lista, sel) {
    if (!D.ABERTAS.length) return P.semVagas();
    if (!lista.length) return vazioBusca(E.filtros);
    const out = [];
    lista.forEach((v, i) => { out.push(P.cartao(v, { atual: sel && sel === v.id })); if (i === 5 && lista.length > 8) out.push(P.alertaLinha()); });
    out.push(P.alertaLinha());
    return `<ul class="lista-vagas${P.primeiraLista ? ' cascata' : ''}" id="lista-busca">${out.join('')}</ul><div class="mt16">${P.golpe()}</div>`;
  }
  P.primeiraLista = true;
  function cabecaBusca(F, lista, info) {
    const r = P.B.rotulosFiltro(F), dicas = [];
    const onde = F.onde === 'regiao' ? 'em ' + nomeOnde('regiao') : 'em ' + nomeOnde(F.onde) + (F.bairro ? ', ' + F.bairro : '');
    if (F.aviso === 'aprendiz') dicas.push('O Vagas sem Caos é para quem tem 18 anos ou mais e ainda não tem vaga de jovem aprendiz. Estas vagas aceitam quem está começando.');
    if (F.aviso === 'bairro') dicas.push(`Para ver vagas perto de casa, escolha seu bairro.<span class="fila mt10"><button class="chip" type="button" data-acao="bairro">${ic('local')}Escolher bairro</button></span>`);
    (info.trocas || []).forEach((t) => dicas.push(`“${esc(t.de)}” não aparece nas vagas. Mostramos as de “${esc(t.para)}”.`));
    if ((info.ign || []).length && lista.length) dicas.push('Não achamos ' + P.listaTexto(info.ign.map((w) => '“' + esc(w) + '”')) + ' em nenhuma vaga. Mostramos as vagas com as outras palavras.');
    if (info.parcial) dicas.push('Nenhuma vaga tem todas as palavras. Mostramos as que têm parte delas, primeiro as que têm mais.');
    const meio = dicas.map((d) => `<div class="faixa calmo dica-busca">${ic('info')}<span>${d}</span></div>`).join('');
    return meio + `<div class="resultado-topo"><p class="contagem" id="contagem" aria-live="polite"><span class="num">${lista.length}</span> ${lista.length === 1 ? 'vaga' : 'vagas'} <span class="muted">${esc(onde)}</span></p>` +
      `<div class="segmentado" role="group" aria-label="Ordem da lista" data-grupo="ordem"><button type="button" data-valor="recentes" aria-pressed="${F.ordem !== 'salario'}">Mais recentes</button><button type="button" data-valor="salario" aria-pressed="${F.ordem === 'salario'}">Maior salário</button></div></div>` +
      (r.length ? '<div class="filtros-ativos" aria-label="Filtros ligados">' + r.map((x) => `<span class="filtro-ativo">${esc(x.txt)}<button type="button" data-acao="tirar" data-k="${x.k}"${x.v ? ` data-v="${esc(x.v)}"` : ''} aria-label="Tirar o filtro ${esc(x.txt)}">${ic('x')}</button></span>`).join('') +
        '<button class="link" type="button" data-acao="limpar">Limpar filtros</button></div>' : '');
  }
  P.telas.busca = function (selId) {
    const F = E.filtros, info = {}, lista = P.B.filtrar(F, null, info), split = P.largo() && lista.length;
    const det = split ? (selId && lista.some((v) => v.id === selId) ? D.VAGA[selId] : lista[0]) : null;
    return `<div class="pagina">${P.faixaOffline()}<h1 class="sr">Vagas</h1><div class="${split ? 'split' : ''}">` +
      `<div class="split-lista" id="split-lista">${cabecaBusca(F, lista, info)}${listaBusca(lista, det && det.id)}</div>` +
      (split ? `<div class="split-det" id="split-det" aria-live="polite">${P.painelVaga(det)}</div>` : '') + '</div></div>';
  };

  /* ---------- vaga ---------- */
  P.telas.vaga = function (id) {
    const v = D.VAGA[id];
    if (!v) return `<div class="pagina"><div class="vazio">${ic('busca')}<b>Vaga não encontrada</b><p>Ela pode ter saído do ar.</p><a class="btn" href="#/vagas">Ver vagas</a></div></div>`;
    const c = P.candPorVaga(v.id);
    return `<div class="pagina vp">${P.faixaOffline()}<a class="voltar so-largo" href="#/vagas" data-acao="voltar">${ic('voltar')}Vagas</a>` +
      `<div class="vp-grade"><article class="vp-main" aria-labelledby="titulo-vaga"><div class="vp-cabeca">${P.cabecaVaga(v, 'h1', true)}</div>${P.avisoHorario(v)}${P.corpoVaga(v)}</article>` +
      `<aside class="vp-aside" aria-label="Candidatura">${P.barraCand(v, c)}</aside></div></div>`;
  };
  // vaga que chegou por link direto e não está na lista: busca uma a uma
  P.garantirVagas = function (ids) {
    return Promise.all(ids.filter((id) => !D.VAGA[id]).slice(0, 30).map((id) => P.api('vaga', { id }).then((r) => P.incluir(r.vaga, r.empresa), () => null)));
  };

  /* ---------- salvas ---------- */
  P.telas.salvas = function () {
    const l = E.salvas.map((id) => D.VAGA[id]).filter(Boolean), fora = E.salvas.length - l.length;
    return `<div class="pagina estreita"><div class="cab-pagina"><h1>Vagas salvas</h1><p>${E.conta ? 'Ficam na sua conta.' : 'Ficam guardadas neste aparelho, sem precisar de conta.'}</p></div>${P.faixaOffline()}` +
      (l.length ? `<ul class="lista-vagas">${l.map((v) => P.cartao(v, { salvas: true })).join('')}</ul>` : `<div class="vazio">${ic('coracao')}<b>Você ainda não salvou vagas</b><p>Toque no coração de uma vaga para ver depois.</p><a class="btn" href="#/">Ver vagas</a></div>`) +
      (fora > 0 ? `<p class="detalhe mt12">${plural(fora, 'vaga salva saiu', 'vagas salvas saíram')} do ar. <button class="link link-texto" type="button" data-acao="limpar-salvas-fora">Tirar da lista</button></p>` : '') +
      (l.length ? `<div class="mt16">${P.golpe()}</div>` : '') + '</div>';
  };

  /* ---------- como funciona ---------- */
  P.telas['como-funciona'] = function () {
    const nSem = D.ABERTAS.filter((v) => v.semExperiencia).length;
    const q = [
      ['É de graça?', '<p>Sim. Ninguém paga para se candidatar, nem agora nem depois.</p>'],
      ['Quem vê meu currículo?', '<p>Só as empresas das vagas em que você se candidata. Empresa em verificação vê só seu primeiro nome e o resumo, sem o arquivo e sem o WhatsApp, até você liberar. A equipe do Vagas sem Caos não vê seu currículo.</p><p>Em Perfil, “Quem viu meu currículo” mostra cada empresa que abriu, com dia e hora.</p>'],
      ['Preciso de experiência?', `<p>Não. Use o filtro “Sem experiência”${nSem ? ': hoje são ' + nSem + ' vagas que aceitam quem está começando' : ''}.</p>`],
      ['Como sei se a empresa é séria?', `<p><span class="selo verificada sem-cursor">${ic('escudo')}Empresa verificada</span> quer dizer que conferimos o CNPJ e quem responde pela empresa. <span class="selo verificando sem-cursor">${ic('meio')}Empresa em verificação</span> quer dizer que o CNPJ está ativo e a conferência ainda está acontecendo; até lá, a conversa fica no site.</p>` +
        `<h3 class="mt12">Como saber se a vaga é segura</h3>${P.listaSegura()}`],
      ['Não tenho currículo. E agora?', '<p>Tudo bem. Na hora de se candidatar, toque em “Montar agora” (3 perguntas curtas) ou mande só nome, e-mail e WhatsApp.</p>'],
      ['Como apago meus dados?', '<p>Em Perfil, toque em “Apagar minha conta”. Para tirar só o arquivo, vá em Meu currículo e toque em “Apagar”.</p>']
    ];
    return `<div class="pagina estreita"><div class="cab-pagina"><h1>Como funciona</h1><p>Respostas rápidas para quem está procurando emprego.</p></div><div class="perguntas">` +
      q.map((x, i) => `<details${i === 0 ? ' open' : ''}><summary>${x[0]}${ic('chevron')}</summary><div>${x[1]}</div></details>`).join('') + `</div><div class="secao">${P.golpe()}</div><div class="mt20"><a class="btn grande" href="#/">Ver vagas</a></div></div>`;
  };
  P.listaSegura = () => '<ul class="marcadores mt10"><li>Nunca pague nada para se candidatar.</li><li>Não mande documento antes da entrevista.</li><li>Faça a entrevista na empresa ou em lugar público.</li><li>Desconfie de salário alto demais para tarefa simples.</li><li>O Vagas sem Caos só fala com você pelo número oficial.</li></ul>';

  /* ---------- ações desta parte ---------- */
  const A = P.acoes;
  const ATALHOS = { hoje: { pub: '24' }, urgentes: { urgente: true }, alto: { sal: { p: 'mes', min: 2500 }, ordem: 'salario' }, semexp: { semExp: true }, diarias: { tipos: ['Diária'] },
    pcd: { pcd: true }, semana: { semana: true } };
  A.salvar = (b) => {
    const id = b.getAttribute('data-id'), ligar = E.salvas.indexOf(id) < 0, sync = () => { P.$$('.salvar[data-id="' + id + '"]').forEach((x) => { const on = E.salvas.indexOf(id) >= 0; x.setAttribute('aria-pressed', String(on)); x.setAttribute('aria-label', on ? 'Tirar dos salvos' : 'Salvar vaga'); }); };
    const refaz = () => { sync(); if (P.rota().v === 'salvas') P.render({ manter: true }); };
    P.salvarVaga(id, ligar).then(refaz, (e) => { refaz(); P.toast(P.msgErro(e), null, 'erro'); });
    sync();
    P.toast(ligar ? (E.conta ? 'Vaga salva' : 'Vaga salva neste aparelho') : 'Vaga tirada dos salvos', () => { P.salvarVaga(id, !ligar).then(refaz, () => {}); }, 'coracao');
    if (!ligar && P.rota().v === 'salvas') P.render({ manter: true });
  };
  A['limpar-salvas-fora'] = () => {
    const fora = E.salvas.filter((id) => !D.VAGA[id]);
    Promise.all(fora.map((id) => P.salvarVaga(id, false))).then(() => P.render({ manter: true }), () => {});
  };
  A.alternar = (b) => { const k = b.getAttribute('data-f'); E.filtros[k] = !E.filtros[k]; P.aplicarFiltros(E.filtros); };
  A.tirar = (b) => { P.B.tirarFiltro(E.filtros, b.getAttribute('data-k'), b.getAttribute('data-v')); P.aplicarFiltros(E.filtros); };
  A['tirar-busca'] = () => { E.filtros.q = ''; P.aplicarFiltros(E.filtros); };
  A.limpar = () => P.aplicarFiltros(P.preset({}));
  A.atalho = (b) => { P.fecharTodas(); P.aplicarFiltros(P.preset(JSON.parse(JSON.stringify(ATALHOS[b.getAttribute('data-atalho')])))); };
  A.setor = (b) => { P.fecharTodas(); P.aplicarFiltros(P.preset({ setores: [b.getAttribute('data-id')] })); };
  A['empresa-vagas'] = (b) => P.aplicarFiltros(Object.assign(M.filtroVazio(), { empresa: b.getAttribute('data-id') }));
  A['ir-empresa'] = (b) => { const s = root.document.getElementById('sobre-' + b.getAttribute('data-id')); if (s) s.scrollIntoView({ behavior: P.semMovimento() ? 'auto' : 'smooth', block: 'start' }); };
  A.perto = () => { const mb = E.meuBairro; if (!mb) { P.acoes.bairro(); return; } P.aplicarFiltros(P.preset({ onde: mb.cidade, bairro: mb.bairro })); };
  A.turno = (b) => { E.filtros.turnos = M.uniao(E.filtros.turnos, [b.getAttribute('data-v')]); P.aplicarFiltros(E.filtros); };
  A.sugestao = (b) => P.escolherSugestao(+b.getAttribute('data-i'));
  A.voltar = () => { if (P.navegou > 0) root.history.back(); else P.ir(P.rota().v === 'vaga' ? '#/vagas' : '#/'); };
  A.ir = (b) => { P.fecharTodas(); P.ir(b.getAttribute('data-href')); };
  A.privacidade = () => P.abrirFolha({ id: 'folha-priv', titulo: 'Como usamos seus dados', classe: 'alta',
    corpo: '<p>Seguimos a Lei Geral de Proteção de Dados. Em poucas palavras:</p>' +
      '<h3>Quem cuida dos seus dados</h3><p>A Gestão sem Caos é a responsável pelos dados (controladora).</p>' +
      '<h3>Para que</h3><p>Para mandar seu currículo às empresas das vagas em que você se candidata e para preencher o resumo que elas veem.</p>' +
      '<h3>Quem vê</h3><p>Só essas empresas. Empresa em verificação vê só seu primeiro nome e o resumo do seu currículo, sem o arquivo e sem o WhatsApp, até você liberar. A equipe do Vagas sem Caos não vê seu currículo. Cada vez que uma empresa abre, aparece em “Quem viu meu currículo”.</p>' +
      '<h3>O que guardamos</h3><p>Nome, WhatsApp, e-mail, cidade, bairro, funções, experiências, estudo, cursos e CNH. Idade, estado civil, CPF e RG não viram dado nenhum no resumo. O arquivo fica guardado do jeito que você mandou: se ele tiver foto, CPF, data de nascimento ou estado civil, troque por um sem eles em Meu currículo.</p>' +
      '<h3>Por quanto tempo</h3><p>Enquanto sua conta existir. Se você trocar o arquivo, o antigo é apagado.</p>' +
      '<h3>Seus direitos</h3><p>Ver, corrigir, baixar e apagar seus dados quando quiser, em Perfil. Retirar uma candidatura corta o acesso daquela empresa.</p>' +
      '<p class="mt16"><a class="link" href="privacidade.html" target="_blank" rel="noopener">Ler o Aviso de privacidade completo</a></p>',
    rodape: '<button class="btn grande largo" type="button" data-fechar>Entendi</button>' });
  P.grupos.ordem = (v) => { E.filtros.ordem = v; P.aplicarFiltros(E.filtros); };
})(typeof self !== 'undefined' ? self : this);
