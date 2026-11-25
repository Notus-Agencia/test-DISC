/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · "Eu": perfil (dados, privacidade, preferências, vagas escondidas, apagar, baixar meus dados),
 * meu currículo (arquivo + o que as empresas veem) e alertas de vaga. Sem conta, só aparece o convite para entrar.
 */
(function (root) {
  'use strict';
  const doc = root.document, P = root.VSC_P, { $, $$, esc, ic, plural } = P, E = P.est, D = P.D;
  let ERRO_CV = null, ED = null;
  const ARQ_MEM = {};   // arquivo escolhido nesta visita (para o botão "Ver")

  const cabPagina = (t, p) => `<div class="cab-pagina"><h1>${t}</h1>${p ? `<p>${p}</p>` : ''}</div>`;
  const linhaLink = (href, icone, tit, sub) => `<li><a class="linha" href="${href}">${ic(icone)}<span class="linha-corpo"><b>${tit}</b><small>${sub}</small></span>${ic('chevron-dir')}</a></li>`;
  const linhaBotao = (acao, icone, tit, sub, cls, seta) => `<li><button class="linha${cls ? ' ' + cls : ''}" type="button" data-acao="${acao}">${ic(icone)}<span class="linha-corpo"><b>${tit}</b><small>${sub}</small></span>${seta === false ? '' : ic('chevron-dir')}</button></li>`;
  const segTema = (id) => `<div class="segmentado" role="group" aria-labelledby="${id}" data-grupo="tema"><button type="button" data-valor="auto">Automático</button><button type="button" data-valor="light">Claro</button><button type="button" data-valor="dark">Escuro</button></div>`;
  const segFx = (id) => `<div class="segmentado" role="group" aria-labelledby="${id}" data-grupo="efeitos"><button type="button" data-valor="auto">Automático</button><button type="button" data-valor="on">Completos</button><button type="button" data-valor="off">Reduzidos</button></div>`;
  const blocoPrefs = () => `<h2 class="grupo-titulo">Preferências</h2><div class="prefs"><div><p class="rotulo mb8" id="p-tema">Tema</p>${segTema('p-tema')}</div>` +
    `<div><p class="rotulo mb8" id="p-fx">Efeitos</p>${segFx('p-fx')}<p class="dica mt8">Reduzidos tira o vidro e o movimento. Automático tira o vidro em aparelho mais simples.</p></div></div>`;
  const temPerfil = () => !!(E.conta && E.conta.nome && E.conta.whats && E.curriculo && E.curriculo.dados.cidade);

  /* ---------- perfil ---------- */
  P.telas.eu = function () {
    if (!E.conta) {
      return `<div class="pagina estreita">${cabPagina('Perfil')}<div class="vazio vazio-topo">${ic('usuario')}<b>Você ainda não tem conta</b><p>Sua conta é criada quando você se candidata ou cria um alerta. Não precisa de senha.</p><a class="btn" href="#/entrar">Entrar</a></div>` +
        `<ul class="linhas">${linhaLink('#/como-funciona', 'ajuda', 'Como funciona', 'É de graça? Quem vê meu currículo?')}${linhaLink('#/salvas', 'coracao', 'Vagas salvas', plural(E.salvas.length, 'vaga', 'vagas') + ' neste aparelho')}</ul>${blocoPrefs()}</div>`;
    }
    const cv = E.curriculo, c = E.conta, esc_ = E.escondidas.length;
    const ajuda = P.ajuda('Oi! Preciso de ajuda no Vagas sem Caos.');
    return `<div class="pagina estreita"><div class="pessoa-cab"><span class="avatar g" aria-hidden="true">${c.nome ? esc(P.iniciais(c.nome)) : ic('usuario', 's24')}</span><div><b>${esc(c.nome || 'Sua conta')}</b>` +
      `<small>${c.whats ? `<span class="num">${esc(c.whats)}</span>` : ''}${c.whats && c.email ? ' · ' : ''}${esc(c.email)}</small></div></div>` +
      (temPerfil() ? '' : `<div class="faixa calmo mt12">${ic('info')}<span>Falta completar seus dados (nome, WhatsApp e cidade). <button class="link link-texto" type="button" data-acao="editar-dados">Completar agora</button></span></div>`) +
      `<ul class="linhas mt12">` +
        linhaBotao('editar-dados', 'nome', 'Meus dados', 'Nome, WhatsApp, e-mail, cidade e bairro') +
        linhaLink('#/curriculo', 'documento', 'Meu currículo', cv && cv.arquivo ? esc(cv.arquivo.nome) + ' · ' + cv.arquivo.kb + ' KB' : cv && cv.dados.funcao ? 'Montado aqui no site' : 'Ainda sem currículo') +
        linhaLink('#/alertas', 'sino', 'Alertas de vaga', plural(E.alertas.length, 'alerta', 'alertas')) +
        linhaLink('#/salvas', 'coracao', 'Vagas salvas', plural(E.salvas.length, 'vaga', 'vagas')) +
        linhaLink('#/candidaturas', 'maleta', 'Candidaturas', plural(P.minhas().length, 'candidatura', 'candidaturas')) +
        (esc_ ? linhaBotao('vagas-escondidas', 'olho', 'Vagas escondidas', plural(esc_, 'vaga', 'vagas') + ' que você não quer ver') : '') + '</ul>' +
      '<h2 class="grupo-titulo">Privacidade</h2><ul class="linhas">' +
        linhaBotao('quem-viu', 'olho', 'Quem viu meu currículo', 'Cada empresa que abriu, com dia e hora') + linhaBotao('privacidade', 'cadeado', 'Como usamos seus dados', 'Para que serve, quem vê e por quanto tempo') +
        linhaBotao('baixar-dados', 'baixar', 'Baixar meus dados', 'Uma cópia de tudo o que guardamos', '', false) +
        linhaBotao('apagar-conta', 'lixo', 'Apagar minha conta', 'Apaga o currículo, as candidaturas e os alertas', 'perigo', false) + '</ul>' +
      blocoPrefs() +
      `<h2 class="grupo-titulo">Ajuda</h2><ul class="linhas"><li><div class="linha sem-cursor">${ic('conversa')}<span class="linha-corpo"><b>Ajuda</b><small>${ajuda.tipo === 'whatsapp' ? P.ajudaHTML('Falar com a gente no WhatsApp') : esc(ajuda.texto)}</small></span></div></li>` +
        `${linhaLink('#/como-funciona', 'ajuda', 'Como funciona', 'Respostas rápidas sobre o site')}${linhaBotao('sair', 'sair', 'Sair', 'Neste aparelho', '', false)}</ul></div>`;
  };

  /* ---------- meu currículo ---------- */
  const linhaArquivo = (a) => `<ul class="arquivos"><li class="arquivo" data-estado="pronto"><span class="arquivo-folha" aria-hidden="true"></span><div class="arquivo-info"><span class="arquivo-nome">${esc(a.nome)}</span>` +
    `<span class="arquivo-meta">${ic('check')}${a.kb} KB · Enviado em ${P.dataCurta(a.ts)}</span></div></li></ul>`;
  function dadosCV(d) {
    const linha = (t, v, vazio) => `<div><dt>${t}</dt><dd>${v ? esc(v) : `<span class="muted">${vazio || 'Não informado'}</span>`}</dd></div>`;
    const cid = D.CID[d.cidade];
    return '<dl class="ve-dados">' + linha('Quer trabalhar com', d.funcao) + linha('Experiência nisso', d.tempo === 'Ainda não' ? 'Sem experiência ainda' : d.tempo) +
      `<div><dt>Experiências</dt><dd>${(d.experiencias || []).length ? '<ul class="marcadores">' + d.experiencias.map((x) => `<li>${esc(P.fmtExp(x))}</li>`).join('') + '</ul>' : `<span class="muted">${d.tempo === 'Ainda não' ? 'Primeiro emprego' : 'Não informado'}</span>`}</dd></div>` +
      linha('Estudo', d.escolaridade) + linha('Cursos', (d.cursos || []).join(', ')) + linha('CNH', (d.cnh || []).length ? d.cnh.join(', ') : '', 'Em branco: a empresa não vê nada sobre CNH') +
      linha('Horários', (d.turnos || []).join(', ')) + linha('Onde mora', d.bairro ? d.bairro + ', ' + (cid ? cid.nome : '') : (cid ? cid.nome : '')) +
      linha('Quanto quer ganhar', d.pretensao ? P.reais(d.pretensao) + ' por mês' : '', 'Em branco') + (d.resumo ? linha('Sobre mim', d.resumo) : '') + '</dl>';
  }
  const blocoUpload = (ctx, er) => `<div class="upload" data-upload="${ctx}">${ic('upload')}<p class="upload-titulo">Envie seu currículo</p><p class="upload-texto">A gente lê o arquivo e preenche seus dados. Você só confere.<span class="so-mouse"> Ou arraste o arquivo para cá.</span></p>` +
    `<p class="upload-dica">${P.DICA_ARQ}</p><div class="upload-acoes"><label class="btn grande">${ic('anexo')}Anexar currículo<input class="sr" type="file" id="arq-${ctx}" accept="${P.ACEITA}" data-arquivo="${ctx}"></label>` +
    `<label class="btn sec so-toque">${ic('camera')}Tirar foto do currículo<input class="sr" type="file" id="foto-${ctx}" accept="image/*" capture="environment" data-arquivo="${ctx}"></label></div>` +
    `<p class="upload-dica">PDF, Word ou foto · até 10 MB. A foto do papel vai inteira, do jeito que sair.</p>${P.erroArquivo(er, ctx)}</div>`;
  P.telas.curriculo = function () {
    if (!E.conta) {
      return `<div class="pagina estreita">${cabPagina('Meu currículo', 'Seu currículo fica guardado na sua conta. Entre com o seu e-mail para guardar o arquivo.')}<div class="vazio">${ic('documento')}<b>Entre para guardar seu currículo</b>` +
        '<p>Mandamos um código para o seu e-mail. Não precisa de senha.</p><a class="btn" href="#/entrar">Entrar</a></div></div>';
    }
    if (!temPerfil()) {
      return `<div class="pagina estreita">${cabPagina('Meu currículo', 'Só as empresas das vagas em que você se candidata veem o currículo.')}<div class="vazio">${ic('nome')}<b>Complete seus dados primeiro</b>` +
        `<p>Precisamos do seu nome, WhatsApp e cidade para guardar o currículo.</p><button class="btn" type="button" data-acao="editar-dados">Completar meus dados</button></div></div>`;
    }
    const cv = E.curriculo, d = cv.dados, a = cv.arquivo, temDados = !!(d.funcao || (d.experiencias || []).length);
    const resumo = temDados ? `<section class="bloco"><div class="fila entre mb12"><h2 class="mt0">O que as empresas veem</h2><button class="btn sec peq" type="button" data-acao="editar-cv">${ic('lapis')}Editar</button></div>${dadosCV(d)}</section>` : '';
    const arquivo = a ? `<section class="bloco"><h2>Arquivo do currículo</h2>${linhaArquivo(a)}<div class="fila mt10"><button class="btn sec" type="button" data-acao="ver-arquivo">${ic('olho')}Ver</button>` +
        `<label class="btn sec">${ic('upload')}Trocar arquivo<input class="sr" type="file" id="arq-trocar" accept="${P.ACEITA}" data-arquivo="trocar"></label>` +
        `<button class="btn fantasma" type="button" data-acao="apagar-arquivo">${ic('lixo')}Apagar</button></div>${P.erroArquivo(ERRO_CV, 'trocar')}<p class="dica mt12">${P.DICA_ARQ}</p></section>`
      : temDados ? `<section class="bloco"><h2>Arquivo do currículo <span class="opcional">(opcional)</span></h2><p class="soft mb12">Se você tiver o currículo em PDF, Word ou foto, pode juntar aqui.</p>` +
        `<label class="btn sec">${ic('anexo')}Anexar arquivo<input class="sr" type="file" id="arq-cv" accept="${P.ACEITA}" data-arquivo="cv"></label>${P.erroArquivo(ERRO_CV, 'cv')}<p class="dica mt12">${P.DICA_ARQ}</p></section>`
        : blocoUpload('cv', ERRO_CV) + '<p class="centro mt10"><button class="link" type="button" data-acao="montar-cv">Não tenho o arquivo: montar aqui</button></p>';
    return `<div class="pagina estreita">${cabPagina('Meu currículo', 'Só as empresas das vagas em que você se candidata veem o currículo.')}<div class="pilha g12">${resumo}${arquivo}</div></div>`;
  };
  function toDados(extra) {
    const c = E.conta, d = Object.assign({}, E.curriculo.dados, extra || {});
    return P.dadosDoPerfil(Object.assign({}, d, { nome: c.nome, whats: c.whats, email: c.email }));
  }
  async function lerNoCurriculo(f, ctx) {
    const erro = P.validarArquivo(f);
    if (erro) { ERRO_CV = { nome: f.name, msg: erro }; P.render({ manter: true }); const o = $('.arquivo[data-estado="erro"]'); if (o) o.scrollIntoView({ block: 'center' }); return; }
    ERRO_CV = null;
    const info = P.infoArquivo(f);
    const dl = P.abrirFolha({ id: 'folha-ler', titulo: 'Lendo seu currículo', corpo: `<div class="leitura" role="status">${P.papelMini()}<b>${info.tipo === 'foto' ? 'Guardando a foto…' : 'Lendo seu currículo…'}</b><p class="num">${esc(info.nome)} · ${info.kb} KB</p>` +
      '<span class="progresso" role="progressbar" aria-label="Leitura do arquivo"><i id="ap-prog"></i></span><p class="detalhe" id="ap-prog-txt">Abrindo o arquivo…</p></div>' });
    try {
      const res = await P.lerArquivo(f, P.progressoLeitura);
      await P.api('curriculoEnviar', { arquivo: f });
      const x = res.dados, extra = {};
      if (x) {
        if (x.funcao) extra.funcao = x.funcao;
        if (x.experiencias.length) extra.experiencias = x.experiencias;
        if (x.escolaridade) extra.escolaridade = x.escolaridade;
        if (x.cursos.length) extra.cursos = x.cursos;
        if (x.cnh.length) extra.cnh = x.cnh;
        if (x.tempo) extra.tempo = x.tempo;
        if (x.cidade) { extra.cidade = x.cidade; if (x.bairro) extra.bairro = x.bairro; }
        if (x.outras.length && !E.curriculo.dados.resumo) extra.resumo = x.outras.join('. ').slice(0, 580);
      }
      if (Object.keys(extra).length) await P.api('perfilSalvar', toDados(extra));
      await P.carregarConta();
      ARQ_MEM.atual = f;
      P.fechar(dl);
      P.render({ manter: true });
      P.toast(res.aviso ? P.AVISOS_LEITURA[res.aviso].split('.')[0] + '.' : ctx === 'cv' ? 'Currículo anexado. Confira o que as empresas veem.' : 'Arquivo trocado. Confira o que as empresas veem.');
    } catch (e) { P.fechar(dl); ERRO_CV = { nome: f.name, msg: P.msgErro(e) }; P.render({ manter: true }); }
  }
  P.arquivoCtx.cv = lerNoCurriculo;
  P.arquivoCtx.trocar = lerNoCurriculo;
  function verArquivo() {
    const a = E.curriculo && E.curriculo.arquivo, f = ARQ_MEM.atual;
    const dl = P.abrirFolha({ id: 'folha-ver', titulo: a ? esc(a.nome) : 'Currículo', classe: 'alta', corpo: `<div class="visualizar" id="visualizar"><p class="carregando-ver"><span class="giro" aria-hidden="true"></span>Abrindo…</p></div>` });
    const box = $('#visualizar', dl);
    const papel = () => {
      const d = E.curriculo.dados, c = E.conta, cid = D.CID[d.cidade];
      box.innerHTML = `<div class="papel"><h4>${esc(c.nome)}</h4><p class="papel-sub">${esc([d.bairro, cid ? cid.nome : ''].filter(Boolean).join(', '))}${c.whats ? ' · ' + esc(c.whats) : ''}</p>` +
        (d.funcao ? `<h5>Objetivo</h5><p>${esc(d.funcao)}</p>` : '') + (d.resumo ? `<h5>Resumo</h5><p>${esc(d.resumo)}</p>` : '') +
        ((d.experiencias || []).length ? '<h5>Experiência</h5><ul>' + d.experiencias.map((x) => `<li>${esc(P.fmtExp(x))}</li>`).join('') + '</ul>' : '') +
        (d.escolaridade ? `<h5>Formação</h5><p>${esc(d.escolaridade)}</p>` : '') + ((d.cursos || []).length ? `<h5>Cursos</h5><p>${esc(d.cursos.join(', '))}</p>` : '') + '</div>' +
        '<p class="detalhe centro mt10">O arquivo fica guardado com segurança. Aqui vai o resumo do que as empresas veem.</p>';
    };
    if (!f) { papel(); return; }
    const tipo = P.tipoArquivo(f);
    if (tipo === 'foto') { const im = doc.createElement('img'); im.src = root.URL.createObjectURL(f); im.alt = 'Foto do seu currículo'; box.innerHTML = ''; box.appendChild(im); return; }
    if (tipo === 'pdf') {
      P.abrirPDF(f).then((pdf) => pdf.getPage(1)).then((pg) => {
        const w = Math.min(560, box.clientWidth || 360), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: (w / vp0.width) * (root.devicePixelRatio || 1) });
        const cv = doc.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height; cv.style.width = w + 'px';
        return pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise.then(() => { box.innerHTML = ''; box.appendChild(cv); });
      }).catch(papel);
      return;
    }
    if (tipo === 'docx') { P.textoDOCX(f).then((t) => { box.innerHTML = '<div class="papel pre"></div>'; box.firstChild.textContent = t.slice(0, 4000); }).catch(papel); return; }
    papel();
  }

  /* ---------- editar currículo e meus dados ---------- */
  const chipEd = (alvo, k, modo, v, rot, lig) => `<button class="chip" type="button" data-alvo="${alvo}" data-campo="${k}" data-modo="${modo}" data-v="${esc(v)}" aria-pressed="${!!lig}">${ic('check', 'marca')}${esc(rot)}</button>`;
  function corpoEditar() {
    const d = ED;
    return '<div class="pilha g16">' + P.campo('ed-funcao', 'Quer trabalhar com', d.funcao, { alvo: 'ed', k: 'funcao' }) +
      `<div><p class="rotulo mb8">Experiência nisso</p><div class="chips sem-fim">${P.TEMPOS.map((x) => chipEd('ed', 'tempo', 'uma', x, x, d.tempo === x)).join('')}</div></div>` +
      `<div class="pilha g12"><p class="rotulo">Onde você já trabalhou</p>${d.experiencias.length ? '<ul class="experiencias-lidas">' + d.experiencias.map((x, i) => `<li><span>${esc(P.fmtExp(x))}</span><button class="btn-icone peq" type="button" data-acao="ed-exp-tirar" data-i="${i}" aria-label="Tirar esta experiência">${ic('x')}</button></li>`).join('') + '</ul>' : '<p class="dica">Nenhuma experiência registrada.</p>'}` +
        `<details class="mais"><summary>Adicionar experiência${ic('chevron')}</summary><div class="pilha g12">${P.campo('ed-x-cargo', 'Cargo', ED._nx.cargo, { alvo: 'ed', k: 'nx-cargo' })}${P.campo('ed-x-emp', 'Onde', ED._nx.empresa, { alvo: 'ed', k: 'nx-empresa', opc: true })}` +
        `<div class="dois-campos">${P.campo('ed-x-ini', 'Início', ED._nx.inicio, { alvo: 'ed', k: 'nx-inicio', attrs: ' type="month" max="' + new Date().toISOString().slice(0, 7) + '"' })}${P.campo('ed-x-fim', 'Saída', ED._nx.fim, { alvo: 'ed', k: 'nx-fim', opc: true, attrs: ' type="month" max="' + new Date().toISOString().slice(0, 7) + '"' })}</div>` +
        `<button class="btn sec" type="button" data-acao="ed-exp-add">Adicionar</button></div></details></div>` +
      `<div class="dois-campos">${P.selecao('ed-cidade', 'Cidade', P.opcoesCidade(d.cidade), { alvo: 'ed', k: 'cidade' })}${P.bairrosDe(d.cidade).length ? P.selecao('ed-bairro', 'Bairro', P.opcoesBairro(d.cidade, d.bairro), { alvo: 'ed', k: 'bairro' }) : ''}</div>` +
      `<div><p class="rotulo mb8">Horários</p><div class="chips sem-fim">${P.TURNOS.map((x) => chipEd('ed', 'turnos', 'multi', x, x, d.turnos.indexOf(x) >= 0)).join('')}</div></div>` +
      P.selecao('ed-escola', 'Estudo', '<option value="">Escolha</option>' + P.ESCOLAS.concat(['Pós-graduação']).map((x) => `<option${d.escolaridade === x ? ' selected' : ''}>${esc(x)}</option>`).join(''), { alvo: 'ed', k: 'escolaridade' }) +
      P.campo('ed-cursos', 'Cursos', d.cursosTxt, { alvo: 'ed', k: 'cursosTxt', opc: true, dica: 'Separe por vírgula.' }) +
      `<div><p class="rotulo mb8">CNH <span class="opcional">(opcional)</span></p><div class="chips sem-fim">${['A', 'B', 'C', 'D', 'E'].map((x) => chipEd('ed', 'cnh', 'multi', x, x, d.cnh.indexOf(x) >= 0)).join('')}</div></div>` +
      P.campo('ed-pret', 'Quanto quer ganhar por mês', d.pretensao, { alvo: 'ed', k: 'pretensao', opc: true, attrs: ' inputmode="numeric" placeholder="Ex.: 1800"', dica: 'Só a empresa da vaga vê. Pode deixar em branco.' }) +
      `<div class="campo"><label for="ed-resumo">Sobre mim <span class="opcional">(opcional)</span></label><textarea class="entrada" id="ed-resumo" data-alvo="ed" data-campo="resumo" rows="3" maxlength="600">${esc(d.resumo)}</textarea></div></div>`;
  }
  function abrirEditarCV() {
    const d = JSON.parse(JSON.stringify(E.curriculo ? E.curriculo.dados : {}));
    ED = Object.assign({ funcao: '', tempo: '', cidade: (D.cidades[0] || {}).id || '', bairro: '', turnos: [], cnh: [], escolaridade: '', cursos: [], resumo: '', pretensao: '', experiencias: [] }, d);
    ED.cursosTxt = (ED.cursos || []).join(', ');
    ED._nx = { cargo: '', empresa: '', inicio: '', fim: '' };
    P.abrirFolha({ id: 'folha-editar', titulo: 'Editar currículo', classe: 'alta', corpo: corpoEditar(), rodape: '<button class="btn fantasma" type="button" data-fechar>Cancelar</button><button class="btn grande" type="button" data-acao="ed-salvar">Salvar</button>', aoFechar: () => { ED = null; } });
  }
  const repintarEditar = () => { const dl = $('#folha-editar'); if (!dl || !ED) return; const c = $('.folha-corpo', dl), y = c.scrollTop; c.innerHTML = corpoEditar(); c.scrollTop = y; };
  P.alvos.ed = {
    obj: () => ED,
    set(k, v) { if (k.indexOf('nx-') === 0) ED._nx[k.slice(3)] = v; else ED[k] = v; },
    aoMudar(t, c) { if (c === 'cidade') { ED.bairro = ''; if (ED._dados) repintarDados(); else repintarEditar(); } }
  };
  async function salvarCV() {
    const d = ED, erro = $('#folha-editar .erro-campo');
    if (erro) erro.remove();
    const o = { funcao: d.funcao.trim(), tempo: d.tempo, cidade: d.cidade, bairro: d.bairro, turnos: d.turnos, escolaridade: d.escolaridade, cnh: d.cnh, experiencias: d.experiencias,
      cursos: String(d.cursosTxt || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10), resumo: d.resumo.trim(), pretensao: String(d.pretensao || '').replace(/\D/g, '') };
    try {
      const dados = toDados(o);
      if (!o.pretensao) dados.pretensao = null;
      await P.api('perfilSalvar', dados);
      await P.carregarConta();
      P.fechar($('#folha-editar')); P.render({ manter: true }); P.toast('Currículo atualizado');
    } catch (e) { const c = $('#folha-editar .folha-corpo'); c.insertAdjacentHTML('afterbegin', `<p class="erro-campo mb12" role="alert">${ic('erro')}<span>${esc(P.msgErro(e))}</span></p>`); c.scrollTop = 0; }
  }
  function abrirEditarDados() {
    const c = E.conta, d = E.curriculo ? E.curriculo.dados : {};
    ED = { nome: c.nome, whats: c.whats, email: c.email, cidade: d.cidade || (D.cidades[0] || {}).id || '', bairro: d.bairro || '', _dados: true };
    P.abrirFolha({ id: 'folha-dados', titulo: 'Meus dados', classe: 'alta', corpo: corpoDados(), rodape: '<button class="btn fantasma" type="button" data-fechar>Cancelar</button><button class="btn grande" type="button" data-acao="ed-dados-salvar">Salvar</button>', aoFechar: () => { ED = null; } });
  }
  function corpoDados() {
    const d = ED;
    return '<div class="pilha g16">' + P.campo('dd-nome', 'Nome', d.nome, { alvo: 'ed', k: 'nome', attrs: ' autocomplete="name" autocapitalize="words"' }) +
      P.campo('dd-whats', 'WhatsApp', d.whats, { alvo: 'ed', k: 'whats', attrs: ' inputmode="tel" autocomplete="tel-national" placeholder="(62) 99999-9999" data-mascara-whats' }) +
      P.campo('dd-email', 'E-mail', d.email, { alvo: 'ed', k: 'email', attrs: ' type="email" inputmode="email" autocomplete="email"', dica: 'É o e-mail que recebe o código para entrar.' }) +
      P.selecao('dd-cidade', 'Cidade onde você mora', P.opcoesCidade(d.cidade), { alvo: 'ed', k: 'cidade' }) +
      (P.bairrosDe(d.cidade).length ? P.selecao('dd-bairro', 'Bairro <span class="opcional">(opcional)</span>', P.opcoesBairro(d.cidade, d.bairro), { alvo: 'ed', k: 'bairro' }) : '') + '</div>';
  }
  const repintarDados = () => { const dl = $('#folha-dados'); if (!dl || !ED) return; const c = $('.folha-corpo', dl), y = c.scrollTop; c.innerHTML = corpoDados(); c.scrollTop = y; };
  async function salvarDados() {
    const d = ED, dl = $('#folha-dados'), er = $('.erro-campo.geral', dl);
    if (er) er.remove();
    const falhas = [];
    if (!d.nome.trim() || d.nome.trim().length < 3) falhas.push('Escreva seu nome.');
    if (!P.whatsOk(d.whats)) falhas.push('Use o WhatsApp no formato (62) 99999-9999.');
    if (d.email && !P.emailOk(d.email)) falhas.push('Escreva um e-mail válido.');
    const cont = $('.folha-corpo', dl);
    if (falhas.length) { cont.insertAdjacentHTML('afterbegin', `<p class="erro-campo geral mb12" role="alert">${ic('erro')}<span>${esc(falhas[0])}</span></p>`); cont.scrollTop = 0; return; }
    try {
      await P.api('perfilSalvar', { nome: P.tituloCaso(d.nome.trim()), whatsapp: P.whatsDigitos(d.whats), email: d.email || undefined, cidade: d.cidade, bairro: d.bairro || '' });
      await P.carregarConta();
      if (d.bairro) { E.meuBairro = { cidade: d.cidade, bairro: d.bairro }; }
      P.fechar(dl); P.render({ manter: true }); P.toast('Dados atualizados');
    } catch (e) { cont.insertAdjacentHTML('afterbegin', `<p class="erro-campo geral mb12" role="alert">${ic('erro')}<span>${esc(P.msgErro(e))}</span></p>`); cont.scrollTop = 0; }
  }

  /* ---------- alertas ---------- */
  const resumoDoAlerta = (a) => { const f = a.filtros || {}; return P.resumoAlerta({ q: a.funcao, setor: a.setorId, cidade: a.cidade, bairro: f.bairro, sal: f.salarioMin, turnos: f.turnos, tipos: f.tipos, semExp: f.semExperiencia }); };
  P.telas.alertas = function () {
    if (!E.conta) {
      return `<div class="pagina estreita">${cabPagina('Alertas de vaga', 'Só avisamos quando entra vaga nova. Nada de propaganda.')}<div class="vazio">${ic('sino')}<b>Entre para criar alertas</b><p>Mandamos um código para o seu e-mail. Não precisa de senha.</p><button class="btn" type="button" data-acao="criar-alerta">${ic('mais')}Criar alerta</button></div></div>`;
    }
    return `<div class="pagina estreita">${cabPagina('Alertas de vaga', 'Só avisamos quando entra vaga nova. Nada de propaganda.')}` +
      (E.alertas.length ? '<ul class="linhas">' + E.alertas.map((a) => `<li><div class="linha sem-cursor">${ic('sino')}<span class="linha-corpo"><b>${esc(resumoDoAlerta(a))}</b><small>${a.canal === 'whatsapp' ? 'Pelo WhatsApp' : 'Por e-mail'}</small>` +
        `<button class="link link-apagar" type="button" data-acao="apagar-alerta" data-id="${esc(a.id)}">Apagar</button></span></div></li>`).join('') + '</ul>'
        : `<div class="vazio">${ic('sino')}<b>Nenhum alerta ainda</b><p>Escolha setor, cidade e salário. Avisamos quando entrar vaga assim.</p></div>`) +
      `<div class="mt16"><button class="btn grande largo" type="button" data-acao="criar-alerta">${ic('mais')}Criar alerta</button></div></div>`;
  };

  /* ---------- ações ---------- */
  const A = P.acoes;
  A['editar-cv'] = abrirEditarCV;
  A['montar-cv'] = abrirEditarCV;
  A['editar-dados'] = abrirEditarDados;
  A['ed-dados-salvar'] = salvarDados;
  A['ed-salvar'] = salvarCV;
  A['ed-exp-tirar'] = (b) => { ED.experiencias.splice(+b.getAttribute('data-i'), 1); repintarEditar(); };
  A['ed-exp-add'] = () => {
    const x = ED._nx;
    if (!x.cargo.trim() || !/^\d{4}-\d{2}$/.test(x.inicio)) { P.toast('Escreva o cargo e o mês de início.', null, 'info'); return; }
    ED.experiencias.push({ cargo: x.cargo.trim(), empresa: x.empresa.trim(), inicio: x.inicio, fim: /^\d{4}-\d{2}$/.test(x.fim) ? x.fim : null });
    ED._nx = { cargo: '', empresa: '', inicio: '', fim: '' };
    repintarEditar();
  };
  A['ver-arquivo'] = verArquivo;
  A['apagar-arquivo'] = () => P.janela('Apagar seu currículo?', 'O arquivo sai do site e das candidaturas abertas. A cópia que uma empresa já baixou fica com ela.', 'Apagar', 'perigo', async () => {
    try { await P.api('curriculoApagar'); E.curriculo.arquivo = null; delete ARQ_MEM.atual; P.render({ manter: true }); P.toast('Currículo apagado', null, 'lixo'); } catch (e) { P.toast(P.msgErro(e), null, 'erro'); }
  });
  A['apagar-alerta'] = async (b) => {
    const id = b.getAttribute('data-id'), a = E.alertas.filter((x) => x.id === id)[0];
    try {
      const r = await P.api('alertaApagar', { id });
      E.alertas = r.alertas || [];
      P.render({ manter: true });
      P.toast('Alerta apagado', async () => {
        try { const n = await P.api('alertaSalvar', { funcao: a.funcao, setorId: a.setorId, cidade: a.cidade, filtros: a.filtros, canal: a.canal }); E.alertas = n.alertas || E.alertas; P.render({ manter: true }); } catch (e) { P.toast(P.msgErro(e), null, 'erro'); }
      }, 'sino');
    } catch (e) { P.toast(P.msgErro(e), null, 'erro'); }
  };
  A['quem-viu'] = async () => {
    const dl = P.abrirFolha({ id: 'folha-quem', titulo: 'Quem viu meu currículo', corpo: '<p class="carregando-ver"><span class="giro" aria-hidden="true"></span>Abrindo…</p>' });
    try {
      const r = await P.api('quemViu'), l = r.lista || [], c = $('.folha-corpo', dl);
      const o = { 'currículo': 'Abriu seu currículo', contato: 'Abriu seu contato', arquivo: 'Abriu seu arquivo' };
      c.innerHTML = l.length ? '<ul class="linhas">' + l.map((x) => `<li><div class="linha">${ic(x.o === 'contato' ? 'conversa' : 'olho')}<span class="linha-corpo"><b>${esc(x.empresa)}</b><small>${esc(o[x.o] || 'Abriu seu currículo')} em ${P.dataHora(x.em)} · ${esc(x.vaga)}</small></span></div></li>`).join('') + '</ul><p class="detalhe mt12">Só aparecem empresas das vagas em que você se candidatou.</p>'
        : `<div class="vazio">${ic('olho')}<b>Nenhuma empresa abriu ainda</b><p>Quando uma empresa abrir seu currículo, aparece aqui com dia e hora.</p></div>`;
    } catch (e) { $('.folha-corpo', dl).innerHTML = `<p class="erro-campo">${ic('erro')}<span>${esc(P.msgErro(e))}</span></p>`; }
  };
  A['vagas-escondidas'] = async () => {
    const dl = P.abrirFolha({ id: 'folha-escondidas', titulo: 'Vagas escondidas', classe: 'alta', corpo: '<p class="carregando-ver"><span class="giro" aria-hidden="true"></span>Abrindo…</p>' });
    await P.garantirVagas(E.escondidas);
    const l = E.escondidas.map((id) => D.VAGA[id]).filter(Boolean), c = $('.folha-corpo', dl);
    c.innerHTML = l.length ? '<ul class="linhas">' + l.map((v) => `<li><div class="linha"><span class="linha-corpo"><b>${esc(v.titulo)}</b><small>${esc(P.empresaDe(v).nome)}</small></span><button class="btn sec peq" type="button" data-acao="mostrar-vaga" data-id="${esc(v.id)}">Mostrar de novo</button></div></li>`).join('') + '</ul>'
      : `<div class="vazio">${ic('olho')}<b>Nenhuma vaga escondida</b></div>`;
  };
  A['mostrar-vaga'] = (b) => {
    const id = b.getAttribute('data-id');
    P.esconderVaga(id, false).then(() => { const li = b.closest('li'); if (li) li.remove(); P.toast('Vaga volta a aparecer na lista.', null, 'olho'); P.render({ manter: true }); }, (e) => P.toast(P.msgErro(e), null, 'erro'));
  };
  A['baixar-dados'] = async () => {
    try {
      const r = P.modoPrevia() ? await root.VSC_PREVIA_PESSOA.exportar() : await root.VAGAS_API.exportarMeusDados();
      const blob = new root.Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }), a = doc.createElement('a');
      a.href = root.URL.createObjectURL(blob); a.download = 'meus-dados-vagas-sem-caos.json';
      doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => root.URL.revokeObjectURL(a.href), 4000);
      P.toast('Pronto. O arquivo com seus dados foi baixado.', null, 'baixar');
    } catch (e) { P.toast(P.msgErro(e), null, 'erro'); }
  };
  A['apagar-conta'] = () => P.janela('Apagar sua conta?', 'Apaga seu currículo, suas candidaturas e seus alertas. Não dá para desfazer.', 'Apagar conta', 'perigo', async () => {
    try {
      if (P.modoPrevia()) await root.VSC_PREVIA_PESSOA.excluirConta(); else await root.VAGAS_API.excluirConta();
      await P.sair();
      P.ir('#/'); P.toast('Conta apagada');
    } catch (e) { P.toast(P.msgErro(e), null, 'erro'); }
  });
  A.sair = async () => { await P.sair(); P.ir('#/'); P.toast('Você saiu neste aparelho'); };
})(typeof self !== 'undefined' ? self : this);
