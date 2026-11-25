/* ==========================================================================
   Site da empresa · E10 gaveta do candidato (Resumo · Currículo · Conversa · Histórico) · E11 marcar entrevista · Não seguir · Chamar no WhatsApp
   Empresa VERIFICADA: nome, currículo e WhatsApp juntos, "Chamar no WhatsApp" com 1 toque.
   Empresa EM VERIFICAÇÃO: primeiro nome e resumo; "Mandar mensagem"; arquivo e WhatsApp só se a pessoa liberar.
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP, S = E.S, UI = E.UI, TELAS = E.TELAS, PRE = E.PRE, ACOES = E.ACOES;
  var esc = E.esc, ic = E.ic, $ = E.$, $$ = E.$$, abrir = E.abrir, fechar = E.fechar, folhaTopo = E.folhaTopo, toast = E.toast, ir = E.ir, plural = E.plural;
  var G = { id: '', mensagens: [], carregando: false };

  /* a rota #/candidato/<id> precisa dos dados do painel; se a pessoa chegou direto, busca também a candidatura */
  PRE.candidato = function (r) {
    var base = S.painelEm ? Promise.resolve() : E.carregarPainel(UI.listaVaga || '');
    return base.then(function () { return E.candPor(r.arg) ? null : E.api('candidato', { id: r.arg }).then(function (x) { E.trocaCand(x.candidato); G.mensagens = x.mensagens || []; }); });
  };
  TELAS.candidato = function () { return { html: '' }; };
  PRE.candidatos = function (r) {
    var v = r.q.vaga || '';
    return E.carregarPainel(v).catch(function (e) { if (v && e && e.codigo === 'nao_encontrada') return E.carregarPainel(''); throw e; });
  };

  function livre(c) { return !!c.whatsapp; }
  function ehDiaria(c) { var v = E.vagaPor(c.vagaId); return !!(v && v.tipo === 'Diária'); }
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function mesAno(s) { if (!s) return ''; var p = String(s).split('-'); return MESES[parseInt(p[1], 10) - 1] + '/' + p[0]; }
  function periodo(x) { return mesAno(x.inicio) + ' a ' + (x.fim ? mesAno(x.fim) : 'hoje'); }

  /* ---------- abrir e fechar ---------- */
  E.gavetaAbrir = function (id) {
    var gv = $('#gaveta');
    if (gv.getAttribute('data-cand') !== id) G = { id: id, mensagens: [], carregando: true };
    gv.setAttribute('data-cand', id);
    var c = E.candPor(id);
    if (!c) { toast('Não achamos esta candidatura.', null, null, 'erro'); ir('#/candidatos'); return; }
    E.pintarGaveta(c);
    E.mostrarModal(gv);
    E.api('candidato', { id: id }).then(function (r) {
      var novo = E.trocaCand(r.candidato); G.mensagens = r.mensagens || []; G.carregando = false;
      if (gv.open && gv.getAttribute('data-cand') === id) E.pintarGaveta(novo);
      E.carregarVagas().then(function () { E.pintarTopo('candidatos'); E.pintarBarra('candidatos'); if (/^candidatos/.test(E.telaAtual())) E.montar('candidatos', { tela: 'candidatos', arg: '', arg2: '', q: { vaga: UI.listaVaga || '' }, bruto: 'candidatos' }); });
    }, function (e) { G.carregando = false; toast(E.msgErro(e), null, null, 'erro'); });
  };
  E.fecharGaveta = function () {
    var gv = $('#gaveta'); UI.gvAba = 'resumo';
    fechar(gv, function () { gv.removeAttribute('data-cand'); var h = '#/candidatos' + (UI.listaVaga ? '?vaga=' + encodeURIComponent(UI.listaVaga) : ''); if (location.hash !== h && /^#\/candidato\//.test(location.hash)) location.hash = h; });
  };

  /* ---------- as quatro abas ---------- */
  function resumoDoCv(c) {
    var r = c.resumo || {};
    return '<div class="a4" role="img" aria-label="Resumo do currículo de ' + esc(c.nome) + '"><span class="a4-selo">' + (c.forma === 'anexo' ? 'Resumo do currículo' : 'Montado no site') + '</span>' +
      '<p class="a4-nome">' + esc(c.nome) + '</p><p class="a4-sub">' + esc([r.funcao, r.bairro, E.cidadeNome(r.cidade)].filter(Boolean).join(' · ')) + '</p><hr>' +
      (r.texto ? '<h5>Resumo</h5><p>' + esc(r.texto) + '</p>' : '') +
      '<h5>Experiência</h5><ul>' + ((r.experiencias || []).length ? r.experiencias.map(function (x) { return '<li><b>' + esc(x.cargo) + '</b>, ' + esc(x.empresa) + ' (' + esc(periodo(x)) + ')</li>'; }).join('') : '<li>Primeiro emprego ou não informou</li>') + '</ul>' +
      '<h5>Estudo e cursos</h5><ul>' + (r.escolaridade ? '<li>' + esc(r.escolaridade) + '</li>' : '') + (r.cursos || []).map(function (k) { return '<li>' + esc(k) + '</li>'; }).join('') + '</ul>' +
      '<h5>Disponibilidade</h5><p>' + esc((r.turnos || []).join(', ') || 'Não informou') + ' · CNH: ' + esc(E.cnhTxt(r.cnh)) + '</p></div>';
  }
  function gvResumo(c) {
    var r = c.resumo || {}, nm = E.primeiroNome(c.nome);
    var x = '<div class="bloco-g"><h3>Quer trabalhar com</h3><p><b>' + esc(r.funcao || 'Não informou') + '</b></p>' + (r.texto ? '<p class="citacao">' + esc(r.texto) + '</p>' : '') + '</div>';
    if (c.mensagem) x += '<div class="bloco-g"><h3>Mensagem que mandou</h3><p class="citacao">' + esc(c.mensagem) + '</p></div>';
    var rs = E.respostas(c);
    if (rs.length) x += '<div class="bloco-g"><h3>Respostas</h3>' + rs.map(function (a) { return '<div class="resposta"><span>' + esc(a.pergunta) + '</span><b>' + esc(a.resposta || 'sem resposta') + '</b></div>'; }).join('') + '</div>';
    if (c.entrevista) {
      var en = c.entrevista, t = E.ms(en.quando);
      x += '<div class="bloco-g"><h3>' + (ehDiaria(c) ? 'Diária' : 'Entrevista') + '</h3><p><b>' + esc(E.quando(t)) + '</b> · ' + esc(en.onde) + '</p><p class="detalhe">' +
        (en.pediuOutro ? esc(nm) + ' pediu outro horário. Marque de novo ou converse pela aba Conversa.' : en.confirmada === true ? 'Confirmada pela pessoa.' : 'Esperando a pessoa confirmar. Ela recebeu o convite no Vagas sem Caos.') + '</p></div>';
    }
    if (c.etapa === 'contratada') x += '<div class="faixa calmo">' + ic('info') + '<span>A Gestão sem Caos pode ajudar na chegada da pessoa na equipe. ' + E.ajudaHtml('Saber como', 'Quero ajuda para receber ' + nm + ' na equipe') + '</span></div>';
    x += '<div class="bloco-g"><h3>Dados que a pessoa informou</h3><dl class="dl dl-2">' +
      '<div><dt>Mora em</dt><dd>' + esc([r.bairro, E.cidadeNome(r.cidade)].filter(Boolean).join(', ') || 'Não informou') + '</dd></div>' +
      '<div><dt>Pode trabalhar</dt><dd>' + esc((r.turnos || []).join(', ') || 'Não informou') + '</dd></div>' +
      '<div><dt>CNH</dt><dd>' + esc(E.cnhTxt(r.cnh)) + '</dd></div>' +
      '<div><dt>Estudo</dt><dd>' + esc(r.escolaridade || 'Não informou') + '</dd></div>' +
      '<div><dt>Quer ganhar</dt><dd>' + (r.pretensao ? 'A partir de ' + esc(E.reais(r.pretensao)) : 'A combinar') + '</dd></div>' +
      '<div><dt>WhatsApp</dt><dd>' + (c.whatsapp ? esc(E.mascararWa(c.whatsapp)) : 'Aparece quando a pessoa liberar') + '</dd></div>' +
      ((r.cursos || []).length ? '<div class="span-todos"><dt>Cursos</dt><dd>' + esc(r.cursos.join(' · ')) + '</dd></div>' : '') +
      '</dl></div>';
    x += '<div class="bloco-g"><h3>Experiência</h3>' + ((r.experiencias || []).length ? r.experiencias.map(function (e) {
      return '<div class="exp"><b>' + esc(e.cargo) + '</b><span class="soft">' + esc(e.empresa) + '</span><small>' + esc(periodo(e)) + '</small></div>';
    }).join('') : '<p class="soft">Não informou experiência.</p>') + '</div>';
    x += E.golpe();
    return x;
  }
  function gvCurriculo(c) {
    var a = c.arquivo, aviso = '<p class="dica-lgpd mt-8">' + ic('escudo') + '<span>Baixou? A cópia é responsabilidade da empresa. Use só para esta seleção e não repasse a outras pessoas.</span></p>';
    if (a) {
      return '<ul class="arquivos"><li class="arquivo" data-estado="pronto"><span class="arquivo-folha" aria-hidden="true"></span><div class="arquivo-info"><span class="arquivo-nome">' + esc(a.nome) + '</span>' +
        '<span class="arquivo-meta">' + esc(String(a.tipo || '').replace(/^application\//, '').replace(/^image\//, '').toUpperCase()) + ' · ' + esc(a.tamanhoKb) + ' KB</span></div>' +
        '<button class="btn sec peq" type="button" data-acao="abrir-arquivo" data-id="' + esc(c.id) + '">Abrir</button></li></ul>' + aviso +
        '<div class="a4-caixa mt-16">' + resumoDoCv(c) + '</div>' +
        '<p class="dica mt-12">' + ic('olho') + ' Cada abertura fica registrada para a pessoa ver.</p>';
    }
    if (c.forma === 'anexo') {
      return '<div class="faixa calmo">' + ic('info') + '<span>A pessoa anexou um arquivo. Ele aparece quando sua empresa for verificada ou quando ' + esc(E.primeiroNome(c.nome)) + ' liberar o contato.</span></div><div class="a4-caixa mt-16">' + resumoDoCv(c) + '</div>';
    }
    return '<div class="faixa calmo">' + ic('info') + '<span>Esta pessoa montou o currículo no site, sem anexar arquivo.</span></div><div class="a4-caixa mt-16">' + resumoDoCv(c) + '</div>';
  }
  function horaMsg(m) { var t = E.ms(m.ts); return E.ha(t); }
  var PRONTAS = ['Podemos conversar?', 'Quero marcar uma entrevista', 'Pode me mandar mais detalhes?', 'A vaga foi preenchida. Obrigado pelo interesse.'];
  function gvConversa(c) {
    var nm = E.primeiroNome(c.nome);
    return '<p class="golpe golpe-ambar" role="note">' + ic('escudo') + '<span>' + esc(E.GOLPE) + '</span></p><div class="chat mt-16" id="gv-chat">' +
      (G.mensagens.length ? G.mensagens.map(function (m) {
        var minha = m.de === 'eu', sis = m.de === 'sistema';
        return '<p class="msg ' + (sis ? 'sistema' : minha ? 'minha' : 'dela') + '">' + esc(m.txt) + (sis ? '' : '<small>' + (minha ? 'Você' : esc(nm)) + ' · ' + esc(horaMsg(m)) + '</small>') +
          (!minha && !sis ? '<button class="link link-peq" type="button" data-acao="den-msg" data-m="' + esc(m.id) + '">Denunciar</button>' : '') + '</p>';
      }).join('') : '<p class="msg sistema">Nenhuma mensagem ainda. A pessoa vê sua mensagem no Vagas sem Caos.</p>') + '</div>' +
      '<div class="chips mt-16" aria-label="Mensagens prontas">' + PRONTAS.map(function (t) { return '<button class="chip" type="button" data-acao="msg-pronta" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>';
  }
  function rotuloHistorico(h, c) {
    if (h.etapa === 'nova') return 'Candidatou-se';
    if (h.etapa === 'vista') return 'Você viu';
    if (h.etapa === 'em conversa') return 'Foi para Em conversa';
    if (h.etapa === 'entrevista marcada') return 'Entrevista marcada';
    if (h.etapa === 'contratada') return 'Contratação confirmada';
    if (h.etapa === 'não seguiu') return h.por === 'pessoa' ? 'A pessoa retirou a candidatura' : 'Você não seguiu';
    return h.etapa;
  }
  function gvHistorico(c) {
    var h = (c.historico || []).slice();
    if (!h.length) h = [{ etapa: 'nova', em: c.criadaEm, por: 'pessoa' }];
    return '<ol class="etapas">' + h.map(function (e) { var t = E.ms(e.em); return '<li class="etapa" data-estado="feito"><span class="etapa-marca">' + ic('check') + '</span><div class="etapa-texto"><b>' + esc(rotuloHistorico(e, c)) + '</b><span>' + esc(E.dataBr(t) + ', ' + E.horaBr(t)) + '</span></div></li>'; }).join('') + '</ol>' +
      '<p class="dica mt-16">O histórico guarda cada passo com data. A pessoa vê a situação da candidatura.</p>';
  }

  /* ---------- a gaveta inteira ---------- */
  E.pintarGaveta = function (c) {
    var v = E.vagaPor(c.vagaId), aba = UI.gvAba || 'resumo', lv = livre(c), nm = E.primeiroNome(c.nome), diaria = ehDiaria(c);
    var fim = E.retirou(c) && c.etapa === 'não seguiu';
    var abas = [['resumo', 'Resumo'], ['curriculo', 'Currículo'], ['conversa', 'Conversa'], ['historico', 'Histórico']];
    var corpo = aba === 'curriculo' ? gvCurriculo(c) : aba === 'conversa' ? gvConversa(c) : aba === 'historico' ? gvHistorico(c) : gvResumo(c);
    var rodape;
    if (fim) rodape = '<p class="detalhe">A pessoa retirou a candidatura em ' + E.dataBr(E.ms((c.historico[c.historico.length - 1] || {}).em || c.criadaEm)) + '.</p>';
    else if (aba === 'conversa') {
      rodape = '<form class="chat-campo" id="gv-form"><label class="sr" for="gv-msg">Mensagem</label><textarea class="entrada" id="gv-msg" rows="1" maxlength="1000" placeholder="Escreva uma mensagem"></textarea>' +
        '<button class="btn-icone" type="submit" aria-label="Enviar mensagem">' + ic('enviar') + '</button></form><p class="erro-campo" id="gv-erro" role="alert" hidden></p>';
    } else {
      rodape = (lv ? '<button class="btn" type="button" data-acao="gv-whats">' + ic('conversa') + 'Chamar no WhatsApp</button>' : '<button class="btn" type="button" data-acao="gv-mensagem">' + ic('conversa') + 'Mandar mensagem</button>') +
        (diaria ? '<button class="btn sec" type="button" data-acao="gv-agendar">' + ic('calendario') + (c.etapa === 'entrevista marcada' ? 'Mudar a diária' : 'Chamar para a diária') + '</button>'
          : '<button class="btn sec" type="button" data-acao="gv-agendar">' + ic('calendario') + (c.etapa === 'entrevista marcada' ? 'Mudar entrevista' : 'Marcar entrevista') + '</button>') +
        (c.etapa === 'não seguiu' ? '<button class="btn fantasma" type="button" data-acao="gv-voltar-seguir">Voltar a seguir</button>' : (c.etapa !== 'contratada' ? '<button class="btn fantasma" type="button" data-acao="gv-naoseguir">Não seguir</button>' : '')) +
        (!lv ? '<p class="gv-whats-linha">Para chamar no WhatsApp: <button class="link" type="button" data-acao="gv-pedir-whats">Pedir o WhatsApp</button> (a pessoa libera com 1 toque) ou <a class="link" href="#/verificacao">verifique a empresa</a>.</p>' : '');
    }
    var gv = $('#gaveta'), t = E.toastVivo() && gv.contains(E.toastVivo()) ? E.toastVivo() : null;
    gv.innerHTML =
      '<div class="gv-topo"><span class="avatar g">' + esc(E.iniciais(c.nome)) + '</span><div><h2 id="gv-nome">' + esc(c.nome) + '</h2>' +
      '<p>Candidatou-se em ' + E.dataBr(c.t) + ' · ' + esc(v ? E.tituloLocal(v) : '') + '</p><div class="fila">' + E.statusCand(c) + E.exemplo() + '</div></div>' +
      '<button class="btn-icone" type="button" data-acao="gv-menu" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações">' + ic('opcoes') + '</button>' +
      '<button class="btn-icone" type="button" data-acao="fechar-dialogo" aria-label="Fechar">' + ic('x') + '</button></div>' +
      '<div class="gv-abas"><div class="abas" role="tablist">' + abas.map(function (a) { return '<button class="aba" type="button" role="tab" data-acao="gv-aba" data-aba="' + a[0] + '" aria-selected="' + (aba === a[0]) + '">' + a[1] + (a[0] === 'conversa' && c.naoLidas ? ' <span class="contador" aria-label="' + c.naoLidas + ' nova">' + c.naoLidas + '</span>' : '') + '</button>'; }).join('') + '</div></div>' +
      '<div class="gv-corpo" id="gv-corpo">' + (G.carregando && aba === 'conversa' ? '<p class="soft">Carregando…</p>' : corpo) + '</div>' +
      '<div class="gv-rodape' + (aba === 'conversa' && !fim ? ' gv-rodape-chat' : '') + '">' + rodape + '</div>';
    if (t) gv.appendChild(t);
    var f = $('#gv-form'); if (f) {
      f.addEventListener('submit', function (e) { e.preventDefault(); enviarMsg(c, $('#gv-msg').value); });
      var gc = $('#gv-corpo'); if (gc) gc.scrollTop = gc.scrollHeight;
    }
  };
  function gc() { return E.candPor($('#gaveta').getAttribute('data-cand')); }
  ACOES['gv-aba'] = function (el) { UI.gvAba = el.getAttribute('data-aba'); E.pintarGaveta(gc()); };
  ACOES['abrir-arquivo'] = function (el) {
    var id = el.getAttribute('data-id'); el.disabled = true;
    E.api('arquivoLink', { id: id }).then(function (r) { el.disabled = false; E.abrirEmNovaAba(r.url); toast('O arquivo abriu em outra aba.', null, null, 'anexo'); }, function (e) { el.disabled = false; toast(E.msgErro(e), null, null, 'erro'); });
  };
  ACOES['gv-menu'] = function (el) {
    var c = gc(), atual = E.COL_DA_ETAPA[c.etapa], extra = [];
    if (!E.retirou(c)) extra.push({ txt: ehDiaria(c) ? 'Chamar para a diária' : (c.etapa === 'entrevista marcada' ? 'Mudar entrevista' : 'Marcar entrevista'), ic: 'calendario', fn: function () { E.abrirAgendar(c); } });
    E.abrirMenu(el, [{ titulo: 'Mover para' }].concat(E.COLUNAS.map(function (col) {
      return { txt: col.nome, ic: col.id === atual ? 'check' : null, marcado: col.id === atual, fn: function () { if (col.id !== atual) E.moverPara(c, col.id); } };
    }), ['-'], extra, [{ txt: 'Denunciar', ic: 'alerta', perigo: true, fn: function () { abrirDenuncia({ candidaturaId: c.id }); } }]));
  };
  ACOES['msg-pronta'] = function (el) { var t = $('#gv-msg'); t.value = el.getAttribute('data-t'); t.focus(); };
  ACOES['gv-mensagem'] = function () { UI.gvAba = 'conversa'; E.pintarGaveta(gc()); var t = $('#gv-msg'); if (t) t.focus(); };
  ACOES['gv-agendar'] = function () { E.abrirAgendar(gc()); };
  ACOES['gv-naoseguir'] = function () { E.abrirNaoSeguir([gc()]); };
  ACOES['gv-voltar-seguir'] = function () {
    var c = gc(); mover(c, null, { desfazer: true }).then(function (n) { E.atualizarTudo(n); toast(E.primeiroNome(n.nome) + ' voltou para a lista.'); }, function (e) { toast(E.msgErro(e), null, null, 'erro'); });
  };
  function mover(c, etapa, extra) {
    return E.api('candidatoMover', Object.assign({ id: c.id }, etapa ? { etapa: etapa } : {}, extra || {})).then(function (r) { return E.trocaCand(r.candidato); });
  }

  /* ---------- conversa ---------- */
  function enviarMsg(c, txt) {
    txt = String(txt || '').trim(); if (!txt) return;
    var er = $('#gv-erro'); if (er) er.hidden = true;
    var btn = $('#gv-form button'); if (btn) btn.disabled = true;
    return E.api('mensagemEnviar', { id: c.id, texto: txt, mid: E.uuid() }).then(function (r) {
      G.mensagens.push(r.mensagem || { id: E.uuid(), de: 'eu', txt: txt, ts: new Date().toISOString() });
      return E.api('candidato', { id: c.id });
    }).then(function (r) {
      var n = E.trocaCand(r.candidato); G.mensagens = r.mensagens || G.mensagens; E.atualizarTudo(n); var m = $('#gv-msg'); if (m) m.focus();
    }, function (e) {
      if (btn) btn.disabled = false;
      var er2 = $('#gv-erro'); if (!er2) return;
      var barra = e && e.resposta && e.resposta.barra;
      er2.hidden = false; er2.innerHTML = ic('erro') + esc(barra && barra.length ? barra[0].mensagem : E.msgErro(e));
    });
  }
  ACOES['gv-pedir-whats'] = function () {
    var c = gc(), nm = E.primeiroNome(c.nome);
    E.api('mensagemEnviar', { id: c.id, texto: 'Podemos falar pelo WhatsApp? Se puder, toque em "Liberar meu WhatsApp".', mid: E.uuid() }).then(function () {
      return E.api('candidato', { id: c.id });
    }).then(function (r) { var n = E.trocaCand(r.candidato); G.mensagens = r.mensagens || G.mensagens; E.atualizarTudo(n); toast('Pedido enviado. ' + nm + ' libera o WhatsApp com 1 toque.', null, null, 'conversa'); },
      function (e) { toast(E.msgErro(e), null, null, 'erro'); });
  };

  /* ---------- Chamar no WhatsApp: 2 toques (Chamar → Abrir o WhatsApp) ---------- */
  ACOES['gv-whats'] = function () {
    var c = gc(), v = E.vagaPor(c.vagaId), nm = E.primeiroNome(c.nome);
    abrir('folha-curta', folhaTopo('folha-curta-titulo', 'Chamar ' + nm + ' no WhatsApp') +
      '<div class="folha-corpo" id="wa-corpo"><div class="campo"><label for="wa-msg">Mensagem</label><textarea class="entrada" id="wa-msg" rows="4" maxlength="500">Olá, ' + esc(nm) + '. Aqui é do ' + esc(S.empresa.nome) + '. Vi sua candidatura para ' + esc(v ? v.titulo : 'a vaga') + ' no Vagas sem Caos. Podemos conversar?</textarea>' +
      '<p class="dica">Vai para ' + esc(E.mascararWa(c.whatsapp)) + '. Dá para mudar o texto.</p><p class="erro-campo" id="wa-erro" role="alert" hidden></p></div>' +
      '<div class="mt-12">' + E.golpe() + '</div></div>' +
      '<div class="folha-rodape" id="wa-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Cancelar</button><button class="btn" type="button" id="wa-abrir">' + ic('conversa') + 'Abrir o WhatsApp</button></div>');
    $('#wa-abrir').addEventListener('click', function () {
      var msg = $('#wa-msg').value.trim(), b = $('#wa-abrir'); b.disabled = true;
      var antes = c.etapa;
      E.api('whatsappChamar', { id: c.id }).then(function (r) {
        var url = r.link + (msg ? (r.link.indexOf('?') >= 0 ? '&' : '?') + 'text=' + encodeURIComponent(msg) : '');
        E.copiar(msg);
        fechar('folha-curta', function () {
          E.abrirEmNovaAba(url);
          E.api('candidato', { id: c.id }).then(function (x) {
            var n = E.trocaCand(x.candidato); G.mensagens = x.mensagens || G.mensagens; E.atualizarTudo(n);
            if (n.etapa !== antes) toast(nm + ' foi para Em conversa', 'Desfazer', function () { mover(n, antes).then(E.atualizarTudo, function (e) { toast(E.msgErro(e), null, null, 'erro'); }); }, 'conversa');
          });
        });
      }, function (e) { b.disabled = false; var er = $('#wa-erro'); er.hidden = false; er.innerHTML = ic('erro') + esc(E.msgErro(e)); });
    });
  };

  /* ---------- Marcar entrevista e chamar para a diária ---------- */
  E.abrirAgendar = function (c) { if (ehDiaria(c)) abrirDiaria(c); else abrirEntrevista(c); };
  function enderecoDe(v) {
    var l = (v && E.lojaDe(v)) || E.lojas()[0];
    if (l) return [l.nome, l.bairro, E.cidadeNome(E.lojaCidadeSlug(l))].filter(Boolean).join(', ');
    return [v && v.bairro || S.empresa.bairro, E.cidadeNome(v ? v.cidade : S.empresa.cidade)].filter(Boolean).join(', ');
  }
  function isoBr(msVal) { var d = E.brt(msVal), dd2 = function (n) { return ('0' + n).slice(-2); }; return d.getUTCFullYear() + '-' + dd2(d.getUTCMonth() + 1) + '-' + dd2(d.getUTCDate()) + 'T' + dd2(d.getUTCHours()) + ':' + dd2(d.getUTCMinutes()) + ':00-03:00'; }
  function abrirDiaria(c) {
    var v = E.vagaPor(c.vagaId), nm = E.primeiroNome(c.nome), onde = enderecoDe(v);
    var dia = v.diaria || {}, das = String(dia.das || '08:00'), t = Date.parse(dia.data + 'T' + das + ':00-03:00');
    var txt = v.horario || (E.quando(t));
    var msg = 'O ' + S.empresa.nome + ' quer chamar você para a diária de ' + v.titulo + ': ' + txt + '. Onde: ' + onde + '. Confirme pelo Vagas sem Caos.';
    abrir('folha', folhaTopo('folha-titulo', 'Chamar ' + nm + ' para a diária') +
      '<div class="folha-corpo"><p>Dia e hora vêm da vaga. ' + esc(nm) + ' confirma pelo Vagas sem Caos.</p>' +
      '<dl class="dl dl-2 mt-16"><div><dt>Quando</dt><dd>' + esc(txt) + '</dd></div><div><dt>Onde</dt><dd>' + esc(onde) + '</dd></div></dl>' +
      '<h3>Mensagem que ' + esc(nm) + ' recebe</h3><p class="msg-pronta" id="dia-previa">' + esc(msg) + '</p><p class="erro-campo mt-8" id="dia-erro" role="alert" hidden></p>' +
      '<p class="dica mt-8">Para mudar o dia ou a hora, edite a vaga.</p></div>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Cancelar</button><button class="btn" type="button" id="dia-enviar">Enviar chamado</button></div>');
    $('#dia-enviar').addEventListener('click', function () {
      var b = $('#dia-enviar'); b.disabled = true;
      if (isNaN(t)) { b.disabled = false; var e0 = $('#dia-erro'); e0.hidden = false; e0.innerHTML = ic('erro') + 'Esta vaga não tem dia marcado. Edite a vaga e escolha o dia.'; return; }
      E.api('entrevistaMarcar', { id: c.id, quando: isoBr(t), onde: onde, recado: '' }).then(function (r) {
        var n = E.trocaCand(r.candidato);
        fechar('folha', function () { E.atualizarTudo(n); toast('Chamado enviado. ' + nm + ' confirma pelo Vagas sem Caos.', null, null, 'calendario'); });
      }, function (e) { b.disabled = false; var er = $('#dia-erro'); er.hidden = false; er.innerHTML = ic('erro') + esc(erroEntrevista(e)); });
    });
  }
  function erroEntrevista(e) { var b = e && e.resposta && e.resposta.barra; return b && b.length ? b[0].mensagem : E.msgErro(e); }
  function diasEntrevista() { return E.diasProximos(12).filter(function (d) { return E.diaSemana(d.ms) !== 0; }).slice(0, 10); }
  function abrirEntrevista(c) {
    var v = E.vagaPor(c.vagaId), nm = E.primeiroNome(c.nome), endereco = enderecoDe(v);
    var X = { dia: null, hora: null, outra: '', onde: 'empresa', outro: '', recado: '' };
    var dias = diasEntrevista();
    abrir('folha', folhaTopo('folha-titulo', (c.etapa === 'entrevista marcada' ? 'Mudar entrevista com ' : 'Marcar entrevista com ') + nm) +
      '<form class="folha-corpo" id="form-ent" novalidate>' +
      '<h3>Dia</h3><div class="dias" id="ent-dias" role="group" aria-label="Dia">' + dias.map(function (d) { return '<button class="chip" type="button" data-dia="' + d.i + '" aria-pressed="false">' + esc(d.rot) + '<small>' + d.data + '</small></button>'; }).join('') + '</div>' +
      '<h3>Hora</h3><div class="horas" id="ent-horas" role="group" aria-label="Hora"></div>' +
      '<div class="campo mt-8" id="ent-outra-c" hidden><label for="ent-outra">Outro horário</label>' + E.selecao('ent-outra', (function () { var o = ''; for (var h = 6; h <= 21; h++) ['00', '30'].forEach(function (m) { o += '<option value="' + h + ':' + m + '">' + h + 'h' + (m === '00' ? '' : m) + '</option>'; }); return o; })()) + '</div>' +
      '<h3>Onde</h3><div class="grupo-filtro">' +
      '<label class="opcao" for="ent-onde-empresa"><input type="radio" name="ent-onde" id="ent-onde-empresa" value="empresa" checked> Na empresa: ' + esc(endereco) + '</label>' +
      '<label class="opcao" for="ent-onde-fone"><input type="radio" name="ent-onde" id="ent-onde-fone" value="fone"> Por telefone ou vídeo</label>' +
      '<label class="opcao" for="ent-onde-outro"><input type="radio" name="ent-onde" id="ent-onde-outro" value="outro"> Outro lugar</label></div>' +
      '<div class="campo" id="ent-outro-c" hidden><label for="ent-outro">Onde vai ser</label><input class="entrada" id="ent-outro" maxlength="200" placeholder="Ex.: na loja da Vila Santana"></div>' +
      '<div class="campo mt-16"><label for="ent-recado">Recado <span class="opcional">(opcional)</span></label><textarea class="entrada" id="ent-recado" rows="2" maxlength="300" placeholder="Ex.: traga sua carteira de trabalho."></textarea></div>' +
      '<details class="perguntas mt-16"><summary>Perguntas sugeridas para a conversa' + ic('chevron') + '</summary><ul class="regras">' +
      ['Conte como era um dia no seu último trabalho.', 'O que você faz quando o movimento aumenta?', 'Como você chega ao trabalho?', 'Que dias e horários você pode?', 'Tem alguma dúvida sobre a vaga?'].map(function (q) { return '<li>' + ic('conversa') + esc(q) + '</li>'; }).join('') +
      '</ul><p>Anote só o que a pessoa contou. O Vagas sem Caos não dá nota nem classifica ninguém.</p></details>' +
      '<h3>Mensagem que ' + esc(nm) + ' recebe</h3><p class="msg-pronta" id="ent-previa"></p><p class="dica mt-8" id="ent-aviso">' + ic('info') + ' Escolha o dia e a hora para enviar.</p><p class="erro-campo mt-8" id="ent-erro" role="alert" hidden></p>' +
      '</form><div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Cancelar</button><button class="btn" type="button" id="ent-enviar" disabled>Enviar convite</button></div>');
    function horas() {
      var d = dias.filter(function (x) { return x.i === X.dia; })[0], hs = '', agoraH = parseInt(E.horaBr(E.agora()), 10);
      for (var h = 8; h <= 18; h++) { var passou = d && d.i === 0 && h <= agoraH; hs += '<button class="chip" type="button" data-h="' + h + '" aria-pressed="' + (X.hora === h && !X.outra) + '"' + (passou ? ' disabled aria-disabled="true"' : '') + '>' + h + 'h</button>'; }
      hs += '<button class="chip" type="button" data-h="outra" aria-pressed="' + !!X.outra + '">Outro</button>';
      $('#ent-horas').innerHTML = hs;
    }
    function msTotal() {
      if (X.dia == null) return null; var d = dias.filter(function (x) { return x.i === X.dia; })[0]; if (!d) return null;
      var hm = X.outra ? X.outra.split(':') : [X.hora, '0']; if (hm[0] == null) return null;
      return Date.parse(d.iso + 'T' + ('0' + parseInt(hm[0], 10)).slice(-2) + ':' + ('0' + parseInt(hm[1], 10)).slice(-2) + ':00-03:00');
    }
    function ondeTxt() { return X.onde === 'empresa' ? endereco : X.onde === 'fone' ? 'por telefone ou vídeo' : (X.outro || 'local a combinar'); }
    function previa() {
      var t = msTotal();
      $('#ent-previa').textContent = 'Olá, ' + nm + '. O ' + S.empresa.nome + ' quer conversar com você sobre a vaga de ' + (v ? v.titulo : 'emprego') + '. Entrevista: ' + (t ? E.quando(t) : '(escolha o dia e a hora)') + '. Onde: ' + ondeTxt() + '.' + (X.recado ? ' Recado: ' + X.recado : '') + ' Confirme pelo Vagas sem Caos.';
      $('#ent-enviar').disabled = !t; $('#ent-aviso').hidden = !!t;
    }
    horas(); previa();
    var f = $('#form-ent');
    f.addEventListener('click', function (e) {
      var d = e.target.closest('[data-dia]'), h = e.target.closest('[data-h]');
      if (d) { X.dia = parseInt(d.getAttribute('data-dia'), 10); $$('#ent-dias .chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === d)); }); horas(); previa(); }
      if (h && !h.disabled) { var val = h.getAttribute('data-h'); if (val === 'outra') { X.outra = $('#ent-outra').value; $('#ent-outra-c').hidden = false; } else { X.hora = parseInt(val, 10); X.outra = ''; $('#ent-outra-c').hidden = true; } horas(); previa(); }
    });
    f.addEventListener('change', function (e) {
      if (e.target.name === 'ent-onde') { X.onde = e.target.value; $('#ent-outro-c').hidden = X.onde !== 'outro'; }
      if (e.target.id === 'ent-outra') X.outra = e.target.value;
      previa();
    });
    f.addEventListener('input', function (e) { if (e.target.id === 'ent-recado') X.recado = e.target.value.trim(); if (e.target.id === 'ent-outro') X.outro = e.target.value.trim(); previa(); });
    $('#ent-enviar').addEventListener('click', function () {
      var t = msTotal(); if (!t) { $('#ent-aviso').hidden = false; return; }
      var b = $('#ent-enviar'); b.disabled = true;
      E.api('entrevistaMarcar', { id: c.id, quando: isoBr(t), onde: ondeTxt(), recado: X.recado }).then(function (r) {
        var n = E.trocaCand(r.candidato);
        fechar('folha', function () { E.atualizarTudo(n); toast('Convite enviado. ' + nm + ' confirma pelo Vagas sem Caos.', null, null, 'calendario'); });
      }, function (e) { b.disabled = false; var er = $('#ent-erro'); er.hidden = false; er.innerHTML = ic('erro') + esc(erroEntrevista(e)); });
    });
  }

  /* ---------- Não seguir (mensagem respeitosa pronta; dá para desfazer) ---------- */
  E.abrirNaoSeguir = function (cs) {
    cs = cs.filter(Boolean); if (!cs.length) return;
    var um = cs.length === 1, c0 = cs[0], nm = um ? E.primeiroNome(c0.nome) : '', v = E.vagaPor(c0.vagaId);
    var mesma = cs.every(function (c) { return c.vagaId === c0.vagaId; });
    var texto = (um ? 'Olá, ' + nm + '. ' : 'Olá. ') + 'Obrigado pelo interesse na vaga de ' + (mesma && v ? v.titulo : 'nossa empresa') + '. Desta vez vamos seguir com outras pessoas. Seu currículo continua no Vagas sem Caos para outras vagas. Boa sorte.';
    abrir('folha-curta', folhaTopo('folha-curta-titulo', um ? 'Não seguir com ' + nm : 'Não seguir com ' + cs.length + ' pessoas') +
      '<div class="folha-corpo"><p>' + (um ? esc(nm) + ' vê "Encerrada" na candidatura.' : 'Cada pessoa vê "Encerrada" na candidatura.') + ' Ninguém vê o motivo.</p>' +
      '<label class="opcao mt-8"><input type="checkbox" id="ns-enviar" checked> Mandar esta mensagem</label>' +
      '<div class="campo"><label class="sr" for="ns-msg">Mensagem</label><textarea class="entrada" id="ns-msg" rows="4" maxlength="1000">' + esc(texto) + '</textarea></div>' +
      '<p class="erro-campo" id="ns-erro" role="alert" hidden></p></div>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Cancelar</button><button class="btn" type="button" id="ns-ok">Não seguir</button></div>');
    $('#ns-ok').addEventListener('click', function () {
      var manda = $('#ns-enviar').checked, msg = $('#ns-msg').value.trim(), b = $('#ns-ok'), er = $('#ns-erro'); b.disabled = true;
      var seq = Promise.resolve(), feitos = [], falha = null;
      cs.forEach(function (c) {
        seq = seq.then(function () {
          if (falha) return null;
          var p = manda && msg ? E.api('mensagemEnviar', { id: c.id, texto: msg, mid: E.uuid() }) : Promise.resolve();
          return p.then(function () { return mover(c, 'não seguiu'); }).then(function (n) { feitos.push(n); }, function (e) { falha = e; });
        });
      });
      seq.then(function () {
        if (falha) { b.disabled = false; er.hidden = false; er.innerHTML = ic('erro') + esc(erroEntrevista(falha)); if (!feitos.length) return; }
        UI.sel = {};
        fechar('folha-curta', function () {
          E.atualizarTudo(c0);
          E.carregarVagas();
          toast((um ? nm + ' foi' : feitos.length + ' pessoas foram') + ' para Não seguiu', 'Desfazer', function () {
            Promise.all(feitos.map(function (c) { return mover(c, null, { desfazer: true }); })).then(function () { E.atualizarTudo(c0); E.carregarVagas(); }, function (e) { toast(E.msgErro(e), null, null, 'erro'); });
          });
        });
      });
    });
  };

  /* ---------- denúncia (de mensagem ou da candidatura) ---------- */
  var MOTIVOS = { cobranca: 'Pediu dinheiro ou Pix', documento: 'Pediu documento', falsa: 'Perfil ou currículo falso', dados_errados: 'Dados errados', discriminacao: 'Ofensa ou discriminação', outro: 'Outro motivo' };
  function abrirDenuncia(alvo) {
    abrir('folha-curta', folhaTopo('folha-curta-titulo', 'Denunciar') +
      '<form class="folha-corpo" id="form-den" novalidate><p>A equipe do Vagas sem Caos olha em até 24 horas. A pessoa não vê quem denunciou.</p>' +
      '<div class="campo mt-12"><label for="den-motivo">O que aconteceu</label>' + E.selecao('den-motivo', E.CON.MOTIVOS_DENUNCIA.map(function (m) { return '<option value="' + m + '">' + esc(MOTIVOS[m] || m) + '</option>'; }).join('')) + '</div>' +
      '<div class="campo mt-12"><label for="den-detalhe">Quer contar mais? <span class="opcional">(opcional)</span></label><textarea class="entrada" id="den-detalhe" rows="3" maxlength="500"></textarea></div>' +
      '<p class="erro-campo" id="den-erro" role="alert" hidden></p></form>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Cancelar</button><button class="btn perigo" type="button" id="den-enviar">Enviar denúncia</button></div>');
    $('#den-enviar').addEventListener('click', function () {
      var b = $('#den-enviar'); b.disabled = true;
      var d = { motivo: $('#den-motivo').value, detalhe: $('#den-detalhe').value.trim() };
      if (alvo.mensagemId) d.mensagemId = alvo.mensagemId; if (alvo.candidaturaId) d.candidaturaId = alvo.candidaturaId;
      E.api('denunciar', d).then(function () { fechar('folha-curta', function () { toast('Denúncia enviada. A equipe olha em até 24 horas.', null, null, 'alerta'); }); },
        function (e) { b.disabled = false; var er = $('#den-erro'); er.hidden = false; er.innerHTML = ic('erro') + esc(E.msgErro(e)); });
    });
  }
  ACOES['den-msg'] = function (el) { var c = gc(); abrirDenuncia({ mensagemId: el.getAttribute('data-m'), candidaturaId: c.id }); };
})();
