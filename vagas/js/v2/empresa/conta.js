/* ==========================================================================
   Site da empresa · E12 Empresa (dados, endereços, equipe) · E13 Verificação
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP, S = E.S, UI = E.UI, TELAS = E.TELAS, PRE = E.PRE, ACOES = E.ACOES;
  var esc = E.esc, ic = E.ic, $ = E.$, $$ = E.$$, abrir = E.abrir, fechar = E.fechar, folhaTopo = E.folhaTopo, toast = E.toast, ir = E.ir, plural = E.plural;
  var V = null, equipe = null;   /* leitura da verificação e da equipe da tela aberta */

  function abasEmpresa(atual) {
    var abas = [['dados', 'Dados', '#/empresa'], ['equipe', 'Equipe', '#/empresa?aba=equipe'], ['verificacao', 'Verificação', '#/verificacao']];
    return '<nav class="abas no-topo" aria-label="Seções da empresa">' + abas.map(function (a) { return '<a class="aba" href="' + a[2] + '"' + (atual === a[0] ? ' aria-current="page"' : '') + '>' + a[1] + '</a>'; }).join('') + '</nav>';
  }
  function cabecalho() {
    var e = S.empresa;
    return '<div class="cab"><div><h1>' + esc(e.nome) + '</h1><p class="empresa-linha">' + E.exemplo() + ' ' + E.seloEmpresa() + '</p></div></div>';
  }
  function dono() { return S.empresa && S.empresa.papel === 'dono'; }

  /* ---------- E12 Empresa ---------- */
  PRE.empresa = function (r) {
    var aba = r.q.aba === 'equipe' ? 'equipe' : 'dados';
    return E.carregarBase().catch(function () { return null; }).then(function () {
      return E.carregarVagas().then(function () {
        if (aba === 'equipe' && dono()) return E.api('equipe', { empresaId: S.empresa.id }).then(function (x) { equipe = x.equipe || []; }, function () { equipe = []; });
        equipe = null;
      });
    });
  };
  TELAS.empresa = function (r) {
    var aba = r.q.aba === 'equipe' ? 'equipe' : 'dados';
    var corpo = aba === 'equipe' ? contaEquipe() : contaDados();
    return { html: cabecalho() + abasEmpresa(aba) + corpo, nav: 'empresa', barra: 'baixo', cinza: true, topoBotao: 'sec', titulo: 'Empresa', depois: function () { ligarConta(aba); } };
  };
  function contaDados() {
    var e = S.empresa, setores = E.setores(), nomes = setores.map(function (s) { return s.nome; });
    var opSetor = '<option value="">Escolha o ramo</option>' + setores.map(function (s) { return '<option value="' + esc(s.nome) + '"' + (s.nome === e.setor ? ' selected' : '') + '>' + esc(s.nome) + '</option>'; }).join('') +
      (e.setor && nomes.indexOf(e.setor) < 0 ? '<option value="' + esc(e.setor) + '" selected>' + esc(e.setor) + '</option>' : '');
    var lojas = E.lojas();
    return '<div class="conta-grade">' +
      '<section class="cartao"><h2>Vindos da Receita</h2><dl class="dl">' +
      '<div><dt>Razão social</dt><dd>' + esc(e.razaoSocial || e.nome) + '</dd></div>' +
      '<div><dt>CNPJ</dt><dd class="num">' + esc(e.cnpjFormatado || e.cnpj || '') + '</dd></div>' +
      '<div><dt>Endereço</dt><dd>' + esc([e.bairro, E.cidadeNome(e.cidade)].filter(Boolean).join(', ')) + '</dd></div>' +
      '<div><dt>Situação</dt><dd><span class="status ok">' + ic('check') + 'Ativa</span> <span class="detalhe">conferida na Receita</span></dd></div>' +
      '</dl><p class="mt-16">' + (e.verificada ? '<span class="detalhe">Para corrigir CNPJ ou razão social, fale com a Gestão sem Caos. ' + E.ajudaHtml('Pedir ajuda', 'Preciso corrigir os dados do CNPJ da minha empresa') + '</span>' : '<a class="link" href="#/verificacao">Corrigir estes dados</a>') + '</p></section>' +
      '<section class="cartao"><h2>Como aparece para as pessoas</h2><form class="pilha" id="form-dados" novalidate>' +
      '<div class="campo"><label for="cd-nome">Nome</label><input class="entrada" id="cd-nome" maxlength="120" value="' + esc(e.nomeFantasia || e.nome) + '"></div>' +
      '<div class="campo"><label for="cd-setor">Ramo</label>' + E.selecao('cd-setor', opSetor) + '</div>' +
      '<div class="campo"><label for="cd-sobre">Sobre a empresa <span class="opcional">(opcional)</span></label><textarea class="entrada" id="cd-sobre" rows="3" maxlength="800" placeholder="Ex.: mercado de bairro aberto todos os dias.">' + esc(e.descricao || '') + '</textarea></div>' +
      '<div class="linha2"><div class="campo"><label for="cd-whats">WhatsApp da empresa</label><input class="entrada" id="cd-whats" type="tel" inputmode="tel" value="' + esc(e.whatsapp ? E.mascararWa(e.whatsapp) : '') + '" placeholder="(62) 9 0000-0000"></div>' +
      '<div class="campo"><label for="cd-email">E-mail <span class="opcional">(opcional)</span></label><input class="entrada" id="cd-email" type="email" value="' + esc(e.email || '') + '" placeholder="nome@empresa.com"></div></div>' +
      '<p class="erro-campo" id="cd-erro" role="alert" hidden></p>' +
      '<div><button class="btn" type="submit">Salvar</button></div></form></section>' +
      '<section class="cartao"><h2>Endereços</h2><p class="soft">Cada vaga escolhe um endereço. Bom para quem tem mais de uma loja.</p><ul class="lojas mt-8">' +
      (lojas.length ? lojas.map(function (l) { return '<li><span class="hoje-ic">' + ic('loja') + '</span><div><b>' + esc(l.nome) + '</b><small>' + esc([l.bairro, E.cidadeNome(E.lojaCidadeSlug(l))].filter(Boolean).join(', ')) + '</small></div><span class="detalhe">' +
        plural(S.vagas.filter(function (v) { var x = E.lojaDe(v); return x && x.id === l.id && v.status === 'aberta'; }).length, 'vaga', 'vagas') + '</span></li>'; }).join('') : '<li><div><b>' + esc([e.bairro, E.cidadeNome(e.cidade)].filter(Boolean).join(', ')) + '</b><small>Endereço da empresa</small></div></li>') + '</ul>' +
      (dono() ? '<details class="mt-12" id="add-loja"><summary class="link">' + ic('mais') + 'Adicionar endereço</summary><form class="pilha mt-12" id="form-loja" novalidate>' +
        '<div class="campo"><label for="lj-nome">Nome do endereço</label><input class="entrada" id="lj-nome" maxlength="80" placeholder="Ex.: Loja do Setor Sul"></div>' +
        '<div class="linha2"><div class="campo"><label for="lj-cidade">Cidade</label>' + E.selecao('lj-cidade', E.opcoesCidade(e.cidade)) + '</div><div class="campo"><label for="lj-bairro">Bairro</label>' + E.selecao('lj-bairro', E.opcoesBairro(e.cidade, '')) + '</div></div>' +
        '<p class="erro-campo" id="lj-erro" role="alert" hidden></p><div><button class="btn sec" type="submit">Adicionar</button></div></form></details>' : '') + '</section>' +
      '<section class="cartao"><h2>Neste aparelho</h2>' +
      (S.empresas.length > 1 ? '<div class="campo"><label for="cd-trocar">Empresa</label>' + E.selecao('cd-trocar', S.empresas.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === e.id ? ' selected' : '') + '>' + esc(x.nome) + '</option>'; }).join('')) + '</div>' : '') +
      '<div class="fila mt-12"><button class="btn sec" type="button" data-acao="aparencia">Aparência</button><button class="btn fantasma" type="button" data-acao="sair-conta">Sair da conta</button></div></section>' +
      '</div>';
  }
  function contaEquipe() {
    var e = S.empresa, lim = E.emVerificacao();
    if (!dono()) return '<div class="conta-grade"><section class="cartao"><h2>Equipe</h2><p class="soft">Só quem é dona(o) da conta da empresa vê e convida a equipe.</p></section></div>';
    return '<div class="conta-grade"><section class="cartao"><h2>Quem usa o painel</h2><ul class="lojas">' +
      (equipe || []).map(function (m) {
        var nome = m.nome || m.email || 'Convidado';
        return '<li><span class="avatar p">' + esc(E.iniciais(nome)) + '</span><div><b>' + esc(nome) + (m.eu ? ' · você' : '') + '</b><small>' + esc(m.email || '') + '</small></div>' +
          '<span class="status ' + (m.pendente ? 'calmo' : 'novo') + '">' + ic(m.pendente ? 'enviar' : 'usuario') + esc(m.pendente ? 'Convite pendente' : m.papel === 'dono' ? 'Dona(o) da conta' : 'Equipe') + '</span></li>'; }).join('') +
      '</ul>' + (lim ? '<p class="dica mt-12">Enquanto sua empresa é verificada, cabem até 2 pessoas na equipe, além de você.</p>' : '') + '</section>' +
      '<section class="cartao"><h2>Convidar pessoa</h2><form class="pilha" id="form-equipe" novalidate>' +
      '<div class="campo"><label for="eq-email">E-mail da pessoa</label><input class="entrada" id="eq-email" type="email" inputmode="email" autocomplete="off" placeholder="nome@email.com"><p class="dica">A pessoa vê e conversa com quem se candidatou, mas não muda os dados da empresa.</p></div>' +
      '<p class="erro-campo" id="eq-erro" role="alert" hidden></p><div><button class="btn" type="submit">Criar convite</button></div></form>' +
      '<div id="eq-convite" aria-live="polite"></div></section></div>';
  }
  function ligarConta(aba) {
    if (aba === 'dados') {
      $('#form-dados').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var nome = $('#cd-nome').value.trim(), er = $('#cd-erro'), w = $('#cd-whats').value.trim(), em = $('#cd-email').value.trim();
        function erro(m, id) { er.hidden = false; er.innerHTML = ic('erro') + esc(m); var i = $('#' + id); if (i) { i.setAttribute('aria-invalid', 'true'); i.focus(); } }
        er.hidden = true; $$('#form-dados [aria-invalid]').forEach(function (x) { x.removeAttribute('aria-invalid'); });
        if (!nome) { erro('Escreva o nome da empresa.', 'cd-nome'); return; }
        var d = { empresaId: S.empresa.id, nomeFantasia: nome, setor: $('#cd-setor').value, descricao: $('#cd-sobre').value.trim(), email: em };
        /* o WhatsApp mascarado na tela só vai ao banco se a pessoa digitou outro */
        if (w && w.indexOf('•') < 0) { if (!E.waValido(w)) { erro('Escreva o WhatsApp com DDD.', 'cd-whats'); return; } d.whatsapp = E.waDigitos(w); }
        if (em && !E.emailValido(em)) { erro('Escreva o e-mail com @, como nome@empresa.com.', 'cd-email'); return; }
        E.api('empresaSalvar', d).then(function (r) { guardarEmpresa(r.empresa); E.pintarTopo('empresa', 'sec'); E.render(); toast('Dados salvos'); }, function (e) { erro(E.msgErro(e), 'cd-nome'); });
      });
      $('#lj-cidade') && $('#lj-cidade').addEventListener('change', function () { $('#lj-bairro').innerHTML = E.opcoesBairro(this.value, ''); });
      var fl = $('#form-loja');
      if (fl) fl.addEventListener('submit', function (ev) {
        ev.preventDefault(); var nome = $('#lj-nome').value.trim(), cid = $('#lj-cidade').value, b = $('#lj-bairro').value, er = $('#lj-erro');
        if (!nome || !b) { er.hidden = false; er.innerHTML = ic('erro') + 'Escreva o nome e escolha o bairro.'; return; }
        E.adicionarLoja({ nome: nome, cidade: cid, bairro: b }).then(function () { E.render(); toast('Endereço adicionado. Já aparece em "Onde" ao anunciar.'); },
          function (e) { er.hidden = false; er.innerHTML = ic('erro') + esc(E.msgErro(e)); });
      });
      var tr = $('#cd-trocar'); if (tr) tr.addEventListener('change', function () { E.trocarEmpresa(tr.value); E.carregarPainel().then(function () { E.render(); }); });
    } else {
      var fe = $('#form-equipe');
      if (!fe) return;
      fe.addEventListener('submit', function (ev) {
        ev.preventDefault(); var em = $('#eq-email').value.trim(), er = $('#eq-erro'); er.hidden = true;
        if (!E.emailValido(em)) { er.hidden = false; er.innerHTML = ic('erro') + 'Escreva o e-mail com @, como nome@email.com.'; return; }
        E.api('equipeConvidar', { empresaId: S.empresa.id, email: em }).then(function (r) {
          equipe = r.equipe || equipe;
          var cv = r.convite || {}, link = String(E.CFG.SITE_URL || location.origin).replace(/\/+$/, '') + '/empresas.html#/entrar?convite=' + encodeURIComponent(cv.token || '');
          $('#eq-convite').innerHTML = '<div class="faixa ok mt-16">' + ic('check') + '<span>Convite criado para ' + esc(cv.email || em) + '. Ele vale por 72 horas.</span></div>' +
            '<p class="soft mt-12">Ainda não enviamos o e-mail do convite. Copie o link e mande para a pessoa pelo WhatsApp ou e-mail:</p>' +
            '<div class="link-curto">' + ic('link') + '<span id="eq-link">' + esc(link) + '</span></div>' +
            '<div class="fila mt-8"><button class="btn sec" type="button" data-acao="copiar-convite">' + ic('copiar') + 'Copiar link do convite</button></div>';
          E.linkConvite = link; $('#eq-email').value = '';
        }, function (e) { er.hidden = false; er.innerHTML = ic('erro') + esc(E.msgErro(e)); });
      });
    }
  }
  function guardarEmpresa(emp) { S.empresa = emp; for (var i = 0; i < S.empresas.length; i++) if (S.empresas[i].id === emp.id) S.empresas[i] = emp; }
  ACOES['copiar-convite'] = function () { E.copiar(E.linkConvite || '').then(function (ok) { toast(ok ? 'Link do convite copiado' : 'Copie o link que está na tela.', null, null, 'copiar'); }); };
  ACOES['sair-conta'] = function () { E.sair(); };

  /* ---------- E13 Verificação ---------- */
  PRE.verificacao = function () {
    return E.carregarVagas().then(function () { return E.api('verificacao', { empresaId: S.empresa.id }); }).then(function (r) { V = r; if (r.estado && S.empresa.estado !== r.estado) S.empresa.estado = r.estado; });
  };
  function listaPassos() {
    var feitoAteAqui = true;
    return '<ol class="etapas mt-16">' + (V.passos || []).map(function (p) {
      var estado = p.feito ? 'feito' : (feitoAteAqui ? 'agora' : 'depois'); if (!p.feito) feitoAteAqui = false;
      var nota = p.feito ? (p.id === 'equipe' && V.verificadaEm ? 'em ' + E.dataBr(E.ms(V.verificadaEm)) : 'feito') : (estado === 'agora' ? 'em andamento' : 'depois');
      return '<li class="etapa" data-estado="' + estado + '"><span class="etapa-marca">' + ic(p.feito ? 'check' : estado === 'agora' ? 'meio' : 'relogio') + '</span><div class="etapa-texto"><b>' + esc(p.titulo) + '</b><span>' + esc(nota) + '</span></div></li>';
    }).join('') + '</ol>';
  }
  function docsEnviados() {
    var ds = V.documentos || [];
    if (!ds.length) return '';
    return '<ul class="arquivos mt-12">' + ds.map(function (d) {
      return '<li class="arquivo" data-estado="pronto"><span class="arquivo-folha" aria-hidden="true"></span><div class="arquivo-info"><span class="arquivo-nome">' + esc(d.nome) + '</span><span class="arquivo-meta">' + ic('check') + 'Recebido em ' + esc(E.dataBr(E.ms(d.enviadoEm))) + '</span></div>' +
        (dono() ? '<button class="btn sec peq" type="button" data-acao="abrir-doc" data-id="' + esc(d.id) + '">Abrir</button>' : '') + '</li>'; }).join('') + '</ul>';
  }
  function blocoUpload() {
    return '<div class="upload" id="vf-area">' + ic('upload') +
      '<p class="upload-titulo">Envie um documento da empresa</p>' +
      '<p class="upload-texto">Cartão do CNPJ, alvará, conta de luz ou água no nome da empresa, ou foto da fachada com o nome.</p>' +
      '<div class="upload-acoes"><label class="btn sec" for="vf-arquivo">' + ic('anexo') + '<span class="so-mouse">Escolher arquivo</span><span class="so-toque">Escolher arquivo ou foto</span></label>' +
      '<input class="sr" type="file" id="vf-arquivo" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"></div>' +
      '<p class="upload-dica">PDF, JPG ou PNG, até 10 MB.</p></div>' +
      '<p class="dica-lgpd mt-8">' + ic('escudo') + '<span>Só a equipe do Vagas sem Caos vê este arquivo. Usamos só para conferir sua empresa e apagamos em até 30 dias depois da verificação.</span></p>' +
      '<ul class="arquivos mt-12" id="vf-lista"></ul><p class="erro-campo mt-8" id="vf-erro" role="alert" hidden></p>' +
      '<div class="mt-16"><button class="btn" type="button" id="vf-enviar" disabled>Enviar documento</button></div>';
  }
  function ligarUpload() {
    var inp = $('#vf-arquivo'), area = $('#vf-area'), arq = null, ok = $('#vf-enviar'), er = $('#vf-erro');
    function mostrar(f) {
      arq = f; er.hidden = true;
      $('#vf-lista').innerHTML = '<li class="arquivo" data-estado="pronto"><span class="arquivo-folha" aria-hidden="true"></span><div class="arquivo-info"><span class="arquivo-nome">' + esc(f.name) + '</span><span class="arquivo-meta">' + Math.max(1, Math.round(f.size / 1024)) + ' KB</span></div></li>';
      ok.disabled = false;
    }
    inp.addEventListener('change', function () { if (inp.files && inp.files[0]) mostrar(inp.files[0]); });
    area.addEventListener('dragover', function (e) { e.preventDefault(); area.setAttribute('data-arrastando', ''); });
    area.addEventListener('dragleave', function () { area.removeAttribute('data-arrastando'); });
    area.addEventListener('drop', function (e) { e.preventDefault(); area.removeAttribute('data-arrastando'); if (e.dataTransfer.files[0]) mostrar(e.dataTransfer.files[0]); });
    ok.addEventListener('click', function () {
      if (!arq) { er.hidden = false; er.innerHTML = ic('erro') + 'Escolha um arquivo primeiro.'; return; }
      ok.disabled = true; ok.textContent = 'Enviando…';
      E.API.verificacaoDocumentoEnviar({ empresaId: S.empresa.id, arquivo: arq }).then(function () {
        toast('Documento enviado. A equipe confere junto com os dados da empresa.', null, null, 'upload');
        return E.api('verificacao', { empresaId: S.empresa.id }).then(function (r) { V = r; E.render(); });
      }, function (e) { ok.disabled = false; ok.textContent = 'Enviar documento'; er.hidden = false; er.innerHTML = ic('erro') + esc(E.msgErro(e)); });
    });
  }
  TELAS.verificacao = function () {
    var e = S.empresa, est = V.estado, html;
    var cab = cabecalho() + abasEmpresa('verificacao');
    if (est === 'verificada') {
      html = '<section class="cartao"><div class="verif-cab"><span class="selo verificada">' + ic('escudo') + 'Empresa verificada</span>' +
        (V.verificadaEm ? '<span class="selo-data">CNPJ conferido em ' + esc(E.dataBr(E.ms(V.verificadaEm))) + '/' + esc(String(new Date(E.ms(V.verificadaEm)).getFullYear())) + '</span>' : '') + '</div>' +
        listaPassos() + '<p class="soft mt-16">Sem limite de vagas no ar. Quem se candidata chega com nome, currículo e WhatsApp, e você chama com 1 toque.</p></section>';
    } else if (est === 'suspensa') {
      html = '<section class="cartao"><div class="verif-cab"><span class="selo verificando">' + ic('alerta') + 'Empresa suspensa</span></div>' +
        '<p class="soft mt-16">Esta empresa está suspensa e as vagas estão fora do ar. Fale com a Gestão sem Caos para entender o que aconteceu. ' + E.ajudaHtml('Pedir ajuda', 'Minha empresa foi suspensa no Vagas sem Caos') + '</p></section>';
    } else {
      var ajuste = est === 'precisa_ajuste', vencida = est === 'vencida';
      html = '<div class="conta-grade"><section class="cartao"><div class="verif-cab"><span class="selo verificando">' + ic(ajuste || vencida ? 'alerta' : 'meio') + (ajuste ? 'Precisa de ajuste' : vencida ? 'Prazo vencido' : 'Empresa em verificação') + '</span></div>' +
        (ajuste ? '<p class="faixa aviso mt-16">' + ic('alerta') + '<span>' + esc(V.motivoAjuste || 'A equipe pediu um ajuste nos dados da empresa.') + '</span></p>' : '') +
        (vencida ? '<p class="faixa aviso mt-16">' + ic('alerta') + '<span>O prazo de 7 dias para verificar a empresa terminou. As vagas ficaram pausadas até a verificação, e nada foi apagado. Corrija o que faltar e peça nova conferência.</span></p>' : '') +
        listaPassos() +
        (!ajuste && !vencida && V.prazoAte ? '<p class="faixa calmo mt-16">' + ic('calendario') + '<span>Prazo: até ' + esc(E.dataBr(E.ms(V.prazoAte))) + '. Depois disso, as vagas pausam até a verificação. Nada é apagado.</span></p>' : '') +
        '<h2 class="mt-24">Até a verificação</h2><ul class="regras">' +
        '<li>' + ic('maleta') + 'Até 3 vagas no ar e 3 vagas novas por dia (hoje: ' + E.noAr() + ' no ar).</li>' +
        '<li>' + ic('conversa') + 'Conversa pelo Vagas sem Caos. O WhatsApp aparece quando a pessoa liberar.</li>' +
        '<li>' + ic('pessoas') + 'Até 2 pessoas na equipe, além de você.</li></ul></section>' +
        '<section class="cartao"><h2>' + (ajuste || vencida ? 'Corrigir e pedir nova conferência' : 'Quer acelerar?') + '</h2>' +
        (ajuste || vencida ? formCorrecao() : '<p class="soft">Envie um destes documentos. É opcional.</p>') +
        '<div class="mt-16">' + blocoUpload() + docsEnviados() + '</div></section></div>';
    }
    return { html: cab + html, nav: 'empresa', barra: 'baixo', cinza: true, topoBotao: 'sec', titulo: 'Verificação', depois: ligarVerificacao };
  };
  function formCorrecao() {
    var e = S.empresa;
    if (!dono()) return '<p class="soft">Só quem é dona(o) da conta pode pedir nova conferência.</p>';
    return '<form class="pilha mt-12" id="form-correcao" novalidate>' +
      '<div class="campo"><label for="co-nome">Nome da empresa</label><input class="entrada" id="co-nome" maxlength="120" value="' + esc(e.nomeFantasia || e.nome) + '"></div>' +
      '<div class="campo"><label for="co-razao">Razão social</label><input class="entrada" id="co-razao" maxlength="160" value="' + esc(e.razaoSocial || '') + '"></div>' +
      '<div class="campo"><label for="co-cnpj">CNPJ</label><input class="entrada num" id="co-cnpj" autocapitalize="characters" value="' + esc(e.cnpjFormatado || e.cnpj || '') + '"></div>' +
      '<p class="erro-campo" id="co-erro" role="alert" hidden></p>' +
      '<div><button class="btn" type="submit" id="co-enviar">Corrigir e pedir nova conferência</button></div></form>';
  }
  function ligarVerificacao() {
    if ($('#vf-arquivo')) ligarUpload();
    var f = $('#form-correcao');
    if (f) f.addEventListener('submit', function (ev) {
      ev.preventDefault(); var er = $('#co-erro'), b = $('#co-enviar'); er.hidden = true; b.disabled = true;
      var d = { nomeFantasia: $('#co-nome').value.trim(), razaoSocial: $('#co-razao').value.trim(), cnpj: $('#co-cnpj').value.replace(/[^0-9a-z]/gi, '').toUpperCase() };
      if (!d.razaoSocial) delete d.razaoSocial; if (!d.cnpj) delete d.cnpj;
      E.api('verificacaoReenviar', { empresaId: S.empresa.id, dados: d }).then(function () {
        return E.carregarVagas().then(function () { return E.api('verificacao', { empresaId: S.empresa.id }); }).then(function (r) { V = r; E.render(); toast('Pedido enviado. A equipe confere de novo, e o prazo recomeça.', null, null, 'escudo'); });
      }, function (e) { b.disabled = false; er.hidden = false; er.innerHTML = ic('erro') + esc(E.msgErro(e)); });
    });
  }
  ACOES['abrir-doc'] = function (el) {
    el.disabled = true;
    E.api('verificacaoDocumentoLink', { id: el.getAttribute('data-id') }).then(function (r) { el.disabled = false; E.abrirEmNovaAba(r.url); }, function (e) { el.disabled = false; toast(E.msgErro(e), null, null, 'erro'); });
  };
})();
