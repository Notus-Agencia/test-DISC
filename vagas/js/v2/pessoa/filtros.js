/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · folhas da lista e da vaga: filtros, bairro ("perto de casa"), todos os setores, selo da empresa,
 * compartilhar, denunciar (vaga ou mensagem), alerta de vaga, aviso de cidade e "não quero ver esta vaga".
 */
(function (root) {
  'use strict';
  const P = root.VSC_P, { $, esc, ic, plural } = P, E = P.est, D = P.D, cod = P.codigo, M = root.VSC_BUSCA;
  const chip = (alvo, campo, modo, valor, rotulo, ligado, extra) =>
    `<button class="chip" type="button" data-alvo="${alvo}" data-campo="${campo}" data-modo="${modo}" data-v="${esc(valor)}" aria-pressed="${!!ligado}"${extra || ''}>${ic('check', 'marca')}${esc(rotulo)}</button>`;
  const campo = (id, rot, val, o) => P.campo(id, rot, val, o);
  const selecao = (id, rot, op, o) => P.selecao(id, rot, op, o);
  const reais = P.reais;

  /* ---------- filtros ---------- */
  let FG = null;
  function corpoFiltros(G) {
    const B = P.B, semSetor = B.filtrar(G, { setores: 1 }), cont = {};
    semSetor.forEach((v) => { cont[v.setorId] = (cont[v.setorId] || 0) + 1; });
    const per = G._per || (G.sal ? G.sal.p : 'mes'), vals = per === 'dia' ? M.SAL_DIA : M.SAL_MES;
    const liga = (k, rot, dica) => `<label class="chave" for="f-${k}"><span>${rot}${dica ? `<small>${dica}</small>` : ''}</span><input type="checkbox" id="f-${k}" data-alvo="f" data-campo="${k}"${G[k] ? ' checked' : ''}><span class="chave-trilho" aria-hidden="true"></span></label>`;
    const cidades = G.onde === 'regiao' ? D.cidades : [D.CID[G.onde]].filter(Boolean);
    return '<h3 id="f-setor">Setor</h3><div class="chips sem-fim">' + D.setores.map((s) => `<button class="chip" type="button" data-alvo="f" data-campo="setores" data-modo="multi" data-v="${esc(s.id)}" aria-pressed="${G.setores.indexOf(s.id) >= 0}">${ic('check', 'marca')}${esc(s.curto || s.nome)} <span class="n">${cont[s.id] || 0}</span></button>`).join('') + '</div>' +
      `<h3 id="f-salario">Salário</h3><div class="segmentado seg-300" role="group" aria-label="Salário por" data-grupo="f-per"><button type="button" data-valor="mes" aria-pressed="${per === 'mes'}">Por mês</button><button type="button" data-valor="dia" aria-pressed="${per === 'dia'}">Por dia</button></div>` +
      `<div class="chips sem-fim mt10"><button class="chip" type="button" data-alvo="f" data-campo="sal" data-modo="sal" data-v="0" aria-pressed="${!G.sal}">${ic('check', 'marca')}Qualquer valor</button>` +
      vals.map((n) => `<button class="chip" type="button" data-alvo="f" data-campo="sal" data-modo="sal" data-v="${n}" aria-pressed="${!!(G.sal && G.sal.p === per && G.sal.min === n)}">${ic('check', 'marca')}A partir de ${reais(n)}</button>`).join('') + '</div>' +
      '<p class="dica mt8">Conta o menor valor da faixa: “R$ 1.700 a R$ 2.600” entra só a partir de R$ 1.700.</p>' +
      `<h3 id="f-turno">Horário</h3><div class="chips sem-fim">${P.TURNOS.map((t) => chip('f', 'turnos', 'multi', t, t, G.turnos.indexOf(t) >= 0)).join('')}</div>` +
      `<h3 id="f-tipo">Tipo</h3><div class="chips sem-fim">${P.TIPOS.map((t) => chip('f', 'tipos', 'multi', t, P.tipoNome(t), G.tipos.indexOf(t) >= 0)).join('')}</div>` +
      '<h3 id="f-mais">Onde</h3><div class="pilha g12">' +
        `<div class="campo"><label for="f-cidade">Cidade</label><div class="selecao"><select class="entrada" id="f-cidade" data-alvo="f" data-campo="onde">${P.opcoesOnde(G.onde)}</select>${ic('chevron')}</div></div>` +
        `<div class="campo"><label for="f-bairro">Bairro</label><div class="selecao"><select class="entrada" id="f-bairro" data-alvo="f" data-campo="bairroCidade"><option value="">Todos os bairros</option>` +
          cidades.map((c) => `<optgroup label="${esc(c.nome)}">${(c.bairros || []).map((b) => `<option value="${esc(c.id)}|${esc(b)}"${G.onde === c.id && G.bairro === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}</optgroup>`).join('') +
          `</select>${ic('chevron')}</div><p class="dica">Escolher o bairro já escolhe a cidade.</p></div></div>` +
      '<h3>Mais</h3><div class="pilha g2">' + liga('semExp', 'Sem experiência', 'Vagas que aceitam quem está começando') + liga('verif', 'Só empresas verificadas', 'CNPJ e responsável conferidos') +
        liga('pcd', 'Vaga também para PcD', 'A empresa abriu a vaga também para pessoa com deficiência') + liga('urgente', 'Urgente', 'A empresa precisa começar logo') + '</div>' +
      '<h3 id="f-pub">Publicada</h3><div class="segmentado seg-cheio" role="group" aria-label="Publicada" data-grupo="f-pub">' +
        [['24', '24 h'], ['72', '3 dias'], ['168', '7 dias'], ['qualquer', 'Todas']].map((p) => `<button type="button" data-valor="${p[0]}" aria-pressed="${G.pub === p[0]}">${p[1]}</button>`).join('') + '</div>';
  }
  const rodapeFiltros = (G) => { const n = P.B.filtrar(G).length; return `<button class="btn fantasma" type="button" data-acao="f-limpar">Limpar</button><button class="btn grande" type="button" data-acao="f-aplicar">${n ? 'Ver ' + plural(n, 'vaga', 'vagas') : 'Nenhuma vaga'}</button>`; };
  function abrirFiltros(secao) {
    FG = JSON.parse(JSON.stringify(E.filtros));
    const dl = P.abrirFolha({ id: 'folha-filtros', titulo: 'Filtros', classe: 'alta', corpo: corpoFiltros(FG), rodape: rodapeFiltros(FG), aoFechar: () => { FG = null; } });
    const alvo = secao && $('#f-' + secao, dl);
    if (alvo) setTimeout(() => { $('.folha-corpo', dl).scrollTop = alvo.offsetTop - 12; }, 30);
  }
  function repintarFiltros() {
    const dl = $('#folha-filtros');
    if (!dl || !FG) return;
    const c = $('.folha-corpo', dl), y = c.scrollTop, foco = root.document.activeElement && root.document.activeElement.id;
    c.innerHTML = corpoFiltros(FG); $('.folha-rodape', dl).innerHTML = rodapeFiltros(FG); c.scrollTop = y;
    if (foco && $('#' + foco, dl)) $('#' + foco, dl).focus({ preventScroll: true });
  }
  P.alvos.f = {
    obj: () => FG,
    sal(v) { const per = FG._per || (FG.sal ? FG.sal.p : 'mes'); FG.sal = v ? { p: per, min: v } : null; },
    aoChip() { repintarFiltros(); },
    aoMudar(t, c) {
      if (c === 'bairroCidade') { const pb = t.value.split('|'); if (pb[1]) { FG.onde = pb[0]; FG.bairro = pb[1]; } else FG.bairro = ''; } else if (c === 'onde') FG.bairro = '';
      repintarFiltros();
    }
  };
  P.grupos['f-per'] = (v) => { FG._per = v; if (FG.sal && FG.sal.p !== v) FG.sal = null; repintarFiltros(); };
  P.grupos['f-pub'] = (v) => { FG.pub = v; repintarFiltros(); };

  /* ---------- bairro e setores ---------- */
  function abrirBairro() {
    const deBusca = P.rota().v === 'busca' || P.split, F = E.filtros, mb = E.meuBairro && D.CID[E.meuBairro.cidade] ? E.meuBairro : null, cont = {};
    D.ABERTAS.forEach((v) => { const k = v.cidade + '|' + v.bairro; cont[k] = (cont[k] || 0) + 1; });
    const corpo = `<p class="soft">${mb ? 'Seu bairro: <b>' + esc(mb.bairro) + ', ' + esc(D.CID[mb.cidade].nome) + '</b>. Toque em outro para trocar.' : 'Escolha onde você mora. Mostramos as vagas desse bairro.'}</p>` +
      D.cidades.filter((c) => (c.bairros || []).length).map((c) => `<h3>${esc(c.nome)}${c.distanciaKmAprox ? ` <span class="muted">· ${c.distanciaKmAprox} km de ${esc(D.cidades[0].nome)}</span>` : ''}</h3><div class="chips sem-fim">` + c.bairros.map((b) => {
        const n = cont[c.id + '|' + b] || 0, lig = deBusca ? (F.onde === c.id && F.bairro === b) : !!(mb && mb.cidade === c.id && mb.bairro === b);
        return `<button class="chip" type="button" data-acao="escolher-bairro" data-cidade="${esc(c.id)}" data-bairro="${esc(b)}" aria-pressed="${lig}">${ic('check', 'marca')}${esc(b)} <span class="n">${n}</span></button>`;
      }).join('') + '</div>').join('');
    P.abrirFolha({ id: 'folha-bairro', titulo: 'Perto de casa', classe: 'alta', corpo, rodape: deBusca && F.bairro ? '<button class="btn sec largo" type="button" data-acao="bairro-todos">Ver todos os bairros</button>' : '' });
  }
  function abrirTodosSetores() {
    const cont = {};
    D.ABERTAS.forEach((v) => { cont[v.setorId] = (cont[v.setorId] || 0) + 1; });
    P.abrirFolha({ id: 'folha-setores', titulo: 'Todos os setores', classe: 'alta', corpo: '<ul class="lista-setores">' + D.setores.map((s) =>
      `<li><button class="setor" type="button" data-acao="setor" data-id="${esc(s.id)}"><span class="setor-ic">${ic('setor-' + s.id)}</span><span><b>${esc(s.nome)}</b><small>${plural(cont[s.id] || 0, 'vaga', 'vagas')}</small></span></button></li>`).join('') + '</ul>' });
  }

  /* ---------- selo, compartilhar ---------- */
  function abrirSelo(eid) {
    const e = D.EMP[eid];
    if (!e) return;
    P.abrirFolha({ id: 'folha-selo', titulo: e.verificada ? 'Empresa verificada' : 'Empresa em verificação',
      corpo: (e.verificada ? `<p><span class="selo verificada sem-cursor">${ic('escudo')}Empresa verificada</span> <span class="selo-data">CNPJ conferido em ${e.verificadaEm ? P.dataCompleta(e.verificadaEm) : 'data não informada'}</span></p><p class="mt12">A equipe do Vagas sem Caos conferiu o CNPJ na Receita Federal e quem responde pela empresa.</p>`
        : `<p><span class="selo verificando sem-cursor">${ic('meio')}Empresa em verificação</span></p><p class="mt12">CNPJ ativo na Receita Federal. A equipe do Vagas sem Caos ainda está conferindo quem responde pela empresa. Até lá, a conversa é pelo site e a empresa vê só o seu primeiro nome e o resumo do seu currículo. O arquivo e o WhatsApp só vão se você liberar.</p>`) +
        `<h3>Como saber se a vaga é segura</h3>${P.listaSegura()}`,
      rodape: '<button class="btn grande largo" type="button" data-fechar>Entendi</button>' });
  }
  function compartilhar(id) {
    const v = D.VAGA[id];
    if (!v) return;
    const e = P.empresaDe(v), base = ((root.VAGAS_CONFIG && root.VAGAS_CONFIG.SITE_URL) || root.location.origin).replace(/\/$/, ''), link = base + '/v/' + v.id;
    const msg = 'Vaga: ' + v.titulo + ' · ' + e.nome + ' · ' + P.salTexto(v.salario) + '. Veja no Vagas sem Caos: ' + link;
    if (root.navigator.share && P.modoPrevia() === false) {
      root.navigator.share({ title: v.titulo, text: msg, url: link }).catch(() => {});
      return;
    }
    P.abrirFolha({ id: 'folha-compartilhar', titulo: 'Compartilhar vaga',
      corpo: `<p class="soft mb8">Mensagem pronta para mandar:</p><p class="faixa calmo bloco-msg">${esc(msg)}</p>`,
      rodape: `<button class="btn sec" type="button" data-acao="copiar-link" data-link="${esc(link)}">${ic('copiar')}Copiar link</button><a class="btn grande" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${ic('conversa')}Compartilhar no WhatsApp</a>` });
  }

  /* ---------- denúncia ---------- */
  const MOTIVOS = [['cobranca', 'Pede dinheiro ou Pix'], ['documento', 'Pede documento antes da entrevista'], ['falsa', 'Parece falsa'], ['dados_errados', 'Salário ou dados errados'], ['discriminacao', 'Discriminação'], ['outro', 'Outro']];
  const MOTIVOS_MSG = [['cobranca', 'Pediu dinheiro ou Pix'], ['documento', 'Pediu documento antes da entrevista'], ['contato', 'Mandou link estranho'], ['ofensa', 'Foi grosseira ou ofensiva'], ['discriminacao', 'Discriminação'], ['outro', 'Outro']];
  let DEN = null;
  P.abrirDenuncia = function (o) {
    DEN = Object.assign({ motivo: '', txt: '', email: '', passo: 'form', mensagemId: '' }, o);
    if (DEN.tipo === 'msg' && DEN.mensagens && DEN.mensagens.length === 1) DEN.mensagemId = DEN.mensagens[0].id;
    P.abrirFolha({ id: 'folha-denuncia', titulo: DEN.tipo === 'msg' ? 'Denunciar mensagem' : 'Denunciar esta vaga', aoFechar: () => { DEN = null; } });
    pintarDenuncia();
  };
  function pintarDenuncia() {
    const dl = $('#folha-denuncia');
    if (!dl || !DEN) return;
    const c = $('.folha-corpo', dl), r = $('.folha-rodape', dl), lista = DEN.tipo === 'msg' ? MOTIVOS_MSG : MOTIVOS;
    if (DEN.passo === 'codigo') {
      c.innerHTML = `<p>Para contar denúncias de pessoas diferentes, confirme seu e-mail. Ele não aparece para a empresa.</p><p class="mt6">Mandamos um código para <b class="num">${esc(cod.ST.den ? cod.ST.den.mascarado : '')}</b>.</p>${cod.html('den')}`;
      r.innerHTML = '<button class="btn grande largo" type="button" data-acao="conferir-codigo" data-codigo="den">Confirmar e enviar denúncia</button>'; r.hidden = false;
      cod.contar('den', DEN.segundos || 30); cod.foco('den');
      return;
    }
    const v = D.VAGA[DEN.vagaId || (P.candPorId(DEN.candId) || {}).vagaId], e = v ? P.empresaDe(v) : { nome: '' };
    const msgs = DEN.tipo === 'msg' && DEN.mensagens && DEN.mensagens.length > 1
      ? `<h3 id="den-msg-r">Qual mensagem?</h3><div class="escolha-msg" role="radiogroup" aria-labelledby="den-msg-r">${DEN.mensagens.map((m, i) => `<label class="opcao" for="den-msg-${i}"><input type="radio" id="den-msg-${i}" name="mensagem" value="${esc(m.id)}" data-den-msg${DEN.mensagemId === m.id ? ' checked' : ''}><span>${esc(String(m.txt).slice(0, 90))}<small>${P.dataHora(m.ts)}</small></span></label>`).join('')}</div>` : '';
    c.innerHTML = `<p class="soft">${v ? esc(v.titulo) + ' · ' + esc(e.nome) : ''}</p>${msgs}<h3 id="den-motivo-r">O que aconteceu?</h3><div class="opcoes-lista" role="radiogroup" aria-labelledby="den-motivo-r">` +
      lista.map((m, i) => `<label class="opcao" for="den-motivo-${i}"><input type="radio" id="den-motivo-${i}" name="motivo" value="${m[0]}" data-den-motivo${DEN.motivo === m[0] ? ' checked' : ''}>${esc(m[1])}</label>`).join('') + '</div>' +
      (DEN.erro ? `<p class="erro-campo mt6">${ic('erro')}<span>${esc(DEN.erro)}</span></p>` : '') +
      `<div class="campo mt12"><label for="den-txt">Conte o que aconteceu <span class="opcional">(opcional)</span></label><textarea class="entrada" id="den-txt" data-alvo="den" data-campo="txt" rows="3" maxlength="600">${esc(DEN.txt)}</textarea></div>` +
      (DEN.tipo === 'msg' ? '<p class="detalhe mt8">A equipe vê só esta conversa. A empresa não fica sabendo quem denunciou.</p>' : '') +
      (E.conta ? '' : `<div class="mt12">${campo('den-email', 'Seu e-mail', DEN.email, { alvo: 'den', k: 'email', erro: DEN.erroEmail, dica: 'Para confirmar que a denúncia é de uma pessoa de verdade.', attrs: ' type="email" inputmode="email" autocomplete="email" placeholder="seu@email.com"' })}</div>`);
    r.innerHTML = '<button class="btn grande largo" type="button" data-acao="den-enviar">Enviar denúncia</button>'; r.hidden = false;
  }
  async function enviarDenuncia() {
    const dl = $('#folha-denuncia');
    const d = { motivo: DEN.motivo, detalhe: DEN.txt.trim() || undefined };
    if (DEN.tipo === 'msg') { if (DEN.mensagemId) d.mensagemId = DEN.mensagemId; else d.candidaturaId = DEN.candId; } else d.vagaId = DEN.vagaId;
    try {
      const r = await P.api('denunciar', d);
      P.fechar(dl);
      P.toast(r.derrubou ? 'Obrigado. Esta vaga saiu do ar.' : 'Denúncia enviada. A equipe vai olhar. Se você já pagou algo, procure seu banco e a polícia.', null, 'bandeira');
    } catch (e) { DEN.erro = P.msgErro(e); DEN.passo = 'form'; pintarDenuncia(); }
  }
  P.alvos.den = { obj: () => DEN };
  P.aoMudarGeral = function (t) {
    if (t.hasAttribute('data-den-motivo') && DEN) { DEN.motivo = t.value; DEN.erro = ''; const er = $('#folha-denuncia .erro-campo'); if (er && !er.closest('.campo')) er.remove(); }
    if (t.hasAttribute('data-den-msg') && DEN) { DEN.mensagemId = t.value; DEN.erro = ''; }
  };

  /* ---------- alerta de vaga ---------- */
  let ALG = null;
  const canais = () => (root.VAGAS_CONFIG && root.VAGAS_CONFIG.CANAL_WHATSAPP ? [['email', 'E-mail'], ['whatsapp', 'WhatsApp']] : [['email', 'E-mail']]);
  function resumoAlerta(a) {
    const cid = a.cidade === 'regiao' || !a.cidade ? ((D.praca && D.praca.nome) || 'Todas as cidades') : (D.CID[a.cidade] ? D.CID[a.cidade].nome : a.cidade);
    const p = [a.setor && D.SET[a.setor] ? D.SET[a.setor].curto || D.SET[a.setor].nome : 'Todos os setores', (a.bairro ? a.bairro + ', ' : '') + cid];
    if (a.sal) p.push('a partir de ' + reais(a.sal));
    if ((a.turnos || []).length) p.push(P.listaTexto(a.turnos.map((x) => x.toLowerCase())));
    if ((a.tipos || []).length) p.push(P.listaTexto(a.tipos.map((x) => P.tipoNome(x).toLowerCase())));
    if (a.semExp) p.push('sem experiência');
    if (a.q) p.unshift('“' + a.q + '”');
    return p.join(' · ');
  }
  P.resumoAlerta = resumoAlerta;
  P.abrirAlerta = function (base) {
    ALG = Object.assign({ setor: '', cidade: 'regiao', bairro: '', sal: 0, q: '', turnos: [], tipos: [], semExp: false, canal: 'email', contato: '', passo: 'form', aceite: false }, base || {});
    P.abrirFolha({ id: 'folha-alerta', titulo: base && base.daBusca ? 'Avisar quando tiver vaga assim' : 'Criar alerta', aoFechar: () => { ALG = null; } });
    pintarAlerta();
  };
  function pintarAlerta() {
    const dl = $('#folha-alerta');
    if (!dl || !ALG) return;
    const c = $('.folha-corpo', dl), r = $('.folha-rodape', dl);
    if (ALG.passo === 'codigo') {
      c.innerHTML = `<p>Mandamos um código para <b class="num">${esc(cod.ST.al ? cod.ST.al.mascarado : '')}</b>.</p>${cod.html('al')}<p class="detalhe mt12">Com o código, sua conta é criada. Não precisa de senha.</p>`;
      r.innerHTML = '<button class="btn grande largo" type="button" data-acao="conferir-codigo" data-codigo="al">Confirmar e criar alerta</button>'; r.hidden = false;
      cod.contar('al', ALG.segundos || 30); cod.foco('al');
      return;
    }
    const resumo = ALG.daBusca ? `<p class="faixa calmo">${ic('sino')}<span>${esc(resumoAlerta(ALG))}</span></p>`
      : '<div class="pilha g14">' + selecao('al-setor', 'Setor', '<option value="">Todos os setores</option>' + D.setores.map((s) => `<option value="${esc(s.id)}"${ALG.setor === s.id ? ' selected' : ''}>${esc(s.nome)}</option>`).join(''), { alvo: 'al', k: 'setor' }) +
        selecao('al-cidade', 'Cidade', P.opcoesOnde(ALG.cidade), { alvo: 'al', k: 'cidade' }) +
        selecao('al-sal', 'Salário a partir de', '<option value="0">Qualquer valor</option>' + M.SAL_MES.map((n) => `<option value="${n}"${+ALG.sal === n ? ' selected' : ''}>${reais(n)}</option>`).join(''), { alvo: 'al', k: 'sal' }) + '</div>';
    const cs = canais();
    c.innerHTML = resumo + (cs.length > 1 ? `<h3 id="al-canal-r">Avisar por</h3><div class="segmentado seg-cheio" role="group" aria-labelledby="al-canal-r" data-grupo="al-canal">${cs.map((x) => `<button type="button" data-valor="${x[0]}" aria-pressed="${ALG.canal === x[0]}">${x[1]}</button>`).join('')}</div>` : '') +
      (E.conta ? '' : `<div class="mt16">${campo('al-contato', 'Seu e-mail', ALG.contato, { alvo: 'al', k: 'contato', erro: ALG.erro, dica: 'Mandamos um código para este e-mail.', attrs: ' type="email" inputmode="email" autocomplete="email" placeholder="seu@email.com"' })}</div>`) +
      '<p class="detalhe mt12">Só avisamos quando entra vaga nova. Nada de propaganda.</p>' + (E.conta ? '' : P.linhaAceite('al-aceite', 'al', ALG.aceite, ALG.erroAceite));
    r.innerHTML = `<button class="btn grande largo" type="button" data-acao="al-criar">${ic('sino')}Criar alerta</button>`; r.hidden = false;
  }
  async function salvarAlerta() {
    const cidade = ALG.cidade === 'regiao' ? (D.praca && D.praca.cidadePrincipal) || (D.cidades[0] || {}).id || '' : ALG.cidade;
    const filtros = {};
    if (ALG.bairro) filtros.bairro = ALG.bairro;
    if (+ALG.sal) filtros.salarioMin = +ALG.sal;
    if ((ALG.turnos || []).length) filtros.turnos = ALG.turnos;
    if ((ALG.tipos || []).length) filtros.tipos = ALG.tipos;
    if (ALG.semExp) filtros.semExperiencia = true;
    try {
      const r = await P.api('alertaSalvar', { funcao: ALG.q || '', setorId: ALG.setor || '', cidade, filtros, canal: ALG.canal });
      E.alertas = r.alertas || E.alertas;
      P.fechar($('#folha-alerta'));
      P.toast('Alerta criado. Avisamos quando entrar vaga assim.', null, 'sino');
      if (P.rota().v === 'alertas' || P.rota().v === 'eu') P.render({ manter: true });
    } catch (e) { ALG.passo = 'form'; ALG.erro = P.msgErro(e); pintarAlerta(); }
  }
  P.alvos.al = { obj: () => ALG, aoMudar(t, c) { if (c === 'aceite' && t.checked) ALG.erroAceite = ''; }, aoDigitar() { ALG.erro = ''; } };
  P.grupos['al-canal'] = (v) => { ALG.canal = v; };
  function alertaDaBusca() {
    const F = E.filtros;
    P.abrirAlerta({ daBusca: true, setor: F.setores[0] || '', cidade: F.onde, bairro: F.bairro || '', sal: F.sal && F.sal.p === 'mes' ? F.sal.min : 0, q: P.B.restoDe(F.q), turnos: F.turnos.slice(), tipos: F.tipos.slice(), semExp: !!F.semExp });
  }

  /* ---------- ações ---------- */
  const A = P.acoes;
  A.filtros = (b) => abrirFiltros(b.getAttribute('data-secao'));
  A['f-limpar'] = () => { FG = P.preset({}); repintarFiltros(); };
  A['f-aplicar'] = (b) => { const G = FG; P.fechar(b.closest('dialog')); P.aplicarFiltros(G); };
  A.bairro = abrirBairro;
  A['escolher-bairro'] = (b) => {
    const c = b.getAttribute('data-cidade'), br = b.getAttribute('data-bairro'), deBusca = P.rota().v === 'busca' || P.split;
    E.meuBairro = { cidade: c, bairro: br };
    if (E.conta && E.conta.nome && E.conta.whats) P.api('perfilSalvar', { nome: E.conta.nome, whatsapp: P.whatsDigitos(E.conta.whats), cidade: c, bairro: br }).catch(() => {});
    else if (!E.conta) P.eu.guardar('bairro', E.meuBairro);
    const F = deBusca ? E.filtros : P.preset({});
    F.onde = c; F.bairro = br;
    P.fechar(b.closest('dialog')); P.aplicarFiltros(F);
  };
  A['bairro-todos'] = (b) => { E.filtros.bairro = ''; P.fechar(b.closest('dialog')); P.aplicarFiltros(E.filtros); };
  A['todos-setores'] = abrirTodosSetores;
  A.selo = (b) => abrirSelo(b.getAttribute('data-id'));
  A.compartilhar = (b) => compartilhar(b.getAttribute('data-id'));
  A['copiar-link'] = (b) => { P.copiar(b.getAttribute('data-link')); P.toast('Link copiado'); };
  A.denunciar = (b) => P.abrirDenuncia({ tipo: 'vaga', vagaId: b.getAttribute('data-id') });
  A['den-enviar'] = async () => {
    DEN.erro = DEN.motivo ? '' : 'Escolha um motivo.';
    if (!DEN.erro && DEN.tipo === 'msg' && DEN.mensagens && DEN.mensagens.length > 1 && !DEN.mensagemId) DEN.erro = 'Escolha a mensagem.';
    DEN.erroEmail = !E.conta && !P.emailOk(DEN.email) ? 'Escreva um e-mail válido.' : '';
    if (DEN.erro || DEN.erroEmail) { pintarDenuncia(); return; }
    if (!E.conta) {
      try {
        const r = await cod.pedir('den', DEN.email.trim().toLowerCase(), { aoOk: enviarDenuncia });
        DEN.segundos = r.reenviarEmSeg || 30; DEN.passo = 'codigo'; pintarDenuncia();
      } catch (e) { DEN.erroEmail = P.msgErro(e); pintarDenuncia(); }
      return;
    }
    enviarDenuncia();
  };
  A['alerta-busca'] = alertaDaBusca;
  A['criar-alerta'] = () => P.abrirAlerta({});
  A['al-criar'] = async () => {
    if (!E.conta) {
      const ok = P.emailOk(ALG.contato);
      ALG.erro = ok ? '' : 'Escreva um e-mail válido.';
      ALG.erroAceite = ALG.aceite ? '' : 'Marque para continuar.';
      if (ALG.erro || ALG.erroAceite) { pintarAlerta(); const x = $(ALG.erro ? '#al-contato' : '#al-aceite'); if (x) { x.focus(); x.scrollIntoView({ block: 'center' }); } return; }
      try {
        const r = await cod.pedir('al', ALG.contato.trim().toLowerCase(), { aoOk: salvarAlerta });
        ALG.segundos = r.reenviarEmSeg || 30; ALG.passo = 'codigo'; pintarAlerta();
      } catch (e) { ALG.erro = P.msgErro(e); pintarAlerta(); }
      return;
    }
    salvarAlerta();
  };
  A['avisar-cidade'] = (b) => P.abrirAlerta({ daBusca: false, cidade: b.getAttribute('data-id') || 'regiao' });
  A.esconder = (b) => {
    const id = b.getAttribute('data-id');
    P.esconderVaga(id, true).then(() => {
      P.toast('Vaga escondida. Você vê as escondidas em Perfil.', () => { P.esconderVaga(id, false).then(() => P.render({ manter: true }), () => {}); }, 'olho');
      P.ir('#/vagas' + P.filtroParaQuery(E.filtros));
    }, (e) => P.toast(P.msgErro(e), null, 'erro'));
  };
})(typeof self !== 'undefined' ? self : this);
