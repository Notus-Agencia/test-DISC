/* ==========================================================================
   Site da empresa · E1 Anunciar vaga grátis · Entrar por código · Avisos · Aparência · cartão de vaga
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP, S = E.S, UI = E.UI, TELAS = E.TELAS, PRE = E.PRE, ACOES = E.ACOES;
  var esc = E.esc, ic = E.ic, $ = E.$, $$ = E.$$, abrir = E.abrir, fechar = E.fechar, folhaTopo = E.folhaTopo, toast = E.toast, ir = E.ir, MOD = window.VSC_MODELOS;

  /* ---------- combobox de função (E1 e formulário) ---------- */
  E.ligarCombo = function (input, lista, aoEscolher) {
    var idx = -1, itens = [];
    function pintar() {
      var q = input.value;
      itens = q.trim() ? MOD.sugerir(q, E.ehCelular() ? 3 : 6) : [];
      if (!itens.length && !q.trim()) { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      lista.innerHTML = itens.map(function (m, i) {
        var st = E.setorPor(m.setorId);
        return '<li role="option" id="' + lista.id + '-' + i + '" data-i="' + i + '"' + (i === idx ? ' aria-selected="true"' : '') + '>' +
          E.icSetor(m.setorId) + '<b>' + esc(m.titulo) + '</b><small>' + esc(st ? st.curto : '') + '</small></li>';
      }).join('') + (q.trim() ? '<li role="option" class="sug-nova" data-i="-2">' + ic('lapis') + '<b>Usar "' + esc(q.trim()) + '" e escrever do zero</b></li>' : '');
      lista.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    function escolher(i) {
      lista.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
      if (i === -2) { aoEscolher(null, input.value.trim()); return; }
      if (!itens[i]) return;
      input.value = itens[i].titulo;
      aoEscolher(itens[i], itens[i].titulo);
    }
    input.addEventListener('input', function () { idx = -1; pintar(); });
    input.addEventListener('focus', function () { if (input.value.trim()) pintar(); });
    input.addEventListener('keydown', function (e) {
      if (lista.hidden) return;
      var n = itens.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(n - 1, idx + 1); pintar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(-1, idx - 1); pintar(); }
      else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); escolher(idx); }
      else if (e.key === 'Escape') { lista.hidden = true; }
      if (idx >= 0) input.setAttribute('aria-activedescendant', lista.id + '-' + idx); else input.removeAttribute('aria-activedescendant');
    });
    lista.addEventListener('pointerdown', function (e) { var li = e.target.closest('li'); if (!li) return; e.preventDefault(); escolher(parseInt(li.getAttribute('data-i'), 10)); });
    function fora(e) {
      if (!document.body.contains(input)) { document.removeEventListener('pointerdown', fora); return; }   /* a tela mudou: solta o ouvinte */
      if (e.target !== input && !lista.contains(e.target)) { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    }
    document.addEventListener('pointerdown', fora);
  };

  /* ---------- cartão de vaga (como as pessoas veem) ---------- */
  /* v tem a forma da vaga do contrato (titulo, salario, tipo, turno, horario, bairro, cidade, urgente, publicadaEm, diaria) */
  E.cartaoVaga = function (v, emp) {
    emp = emp || S.empresa || {};
    var onde = [v.bairro, E.cidadeNome(v.cidade)].filter(Boolean).join(', ');
    var tipo = E.tipoTela(v.tipo);
    var fatos = [tipo, v.tipo === 'Diária' ? E.diariaCurta(v) : (v.turno || '')].filter(Boolean).slice(0, 2);
    var pub = v.publicadaEm ? E.ms(v.publicadaEm) : E.agora();
    return '<article class="vaga">' +
      '<span class="vaga-logo" aria-hidden="true">' + esc(E.iniciais(emp.nome || 'Sua empresa')) + '</span>' +
      '<div class="vaga-corpo">' +
      '<h3 class="vaga-titulo">' + (v.titulo ? esc(v.titulo) : '<span class="pv-vazio">Função</span>') + '</h3>' +
      '<p class="vaga-empresa">' + (emp.verificada ? ic('escudo') : '') + '<span>' + esc(emp.nome || 'Sua empresa') + (onde ? ' · ' + esc(onde) : '') + '</span></p>' +
      '<p class="vaga-salario">' + E.salHtml(v.salario) + '</p>' +
      '<ul class="vaga-fatos">' + fatos.map(function (f) { return '<li class="etiqueta">' + esc(f) + '</li>'; }).join('') + '</ul>' +
      '<p class="vaga-data">' + esc(E.agora() - pub < E.HORA ? 'Publicada agora' : 'Publicada ' + E.ha(pub)) +
      (v.urgente ? ' <span class="status aviso">' + ic('relogio') + 'Urgente</span>' : '') +
      (!emp.verificada ? ' <span class="status calmo">' + ic('meio') + 'Empresa em verificação</span>' : '') + ' ' + E.exemplo() + '</p>' +
      '</div></article>';
  };

  function pergunta(t, r) { return '<details><summary>' + esc(t) + ic('chevron') + '</summary><p>' + esc(r) + '</p></details>'; }
  function nomePraca() { return (S.base && S.base.praca && S.base.praca.nome) || ''; }

  /* ---------- E1 · Anunciar vaga grátis ---------- */
  PRE.anunciar = function () { return E.carregarBase().catch(function () { /* a tela abre sem os números da região */ }); };
  TELAS.anunciar = function () {
    var praca = nomePraca(), nVagas = S.base && S.base.vagas ? S.base.vagas.length : 0, nEmp = S.base && S.base.empresas ? S.base.empresas.length : 0;
    var vazioCard = { titulo: '', salario: { min: 0 }, tipo: '', turno: '', horario: '', bairro: '', cidade: E.cidadePrincipal() };
    var html =
      '<section class="e1-hero">' +
      '<div>' +
      '<h1>Anuncie sua vaga grátis</h1>' +
      '<p class="e1-linha">Fica no ar na hora. Quem procura emprego ' + (praca ? 'em ' + esc(praca) : 'na sua região') + ' vê o salário e fala com você.</p>' +
      '<form class="e1-form" id="e1-form" novalidate>' +
      '<div class="e1-campo combo"><label for="e1-funcao" class="sr">Que função você precisa?</label>' +
      '<div class="busca">' + ic('busca') + '<input id="e1-funcao" class="entrada" type="text" autocomplete="off" enterkeyhint="go" placeholder="Que função você precisa? Ex.: caixa" role="combobox" aria-expanded="false" aria-controls="e1-lista" aria-autocomplete="list"></div>' +
      '<ul class="sugestoes" id="e1-lista" role="listbox" hidden></ul></div>' +
      '<button class="btn grande" type="submit" id="e1-anunciar">Anunciar vaga</button>' +
      '<p class="dica">Escolha a função e a descrição já vem escrita. Você só ajusta.</p>' +
      '</form>' +
      '<div class="e1-rapidos"><span class="rotulo">Mais anunciadas na região</span><div class="chips sem-fim">' +
      MOD.RAPIDOS.map(function (id) { var m = MOD.porId[id]; return '<button class="chip" type="button" data-acao="modelo" data-modelo="' + id + '">' + E.icSetor(m.setorId) + esc(m.titulo) + '</button>'; }).join('') +
      '</div></div>' +
      '<div class="e1-varias"><a class="btn sec" href="#/vagas/varias" id="e1-varias">' + ic('tabela') + 'Tenho várias vagas</a><span class="detalhe">Uma linha por vaga, numa tabela. Os dados da empresa vêm no fim.</span></div>' +
      '</div>' +
      '<div class="e1-mock" aria-label="Como a vaga aparece">' +
      '<span class="mock-rotulo">' + ic('olho') + 'Como a pessoa vê sua vaga</span>' +
      E.cartaoVaga(vazioCard, { nome: 'Sua empresa', verificada: false }) +
      '<span class="mock-rotulo">' + ic('pessoas') + 'O que chega para você</span>' +
      '<p class="soft">Cada candidatura chega no painel com o resumo do currículo e as respostas. Você chama a pessoa pelo WhatsApp quando a empresa estiver verificada ou quando ela liberar.</p>' +
      '</div>' +
      '</section>' +
      '<ol class="e1-passos">' +
      '<li><span class="n">1</span><b>Escreva a vaga</b><span>Função, salário, turno e bairro. O resto vem do modelo.</span></li>' +
      '<li><span class="n">2</span><b>Ela entra no ar na hora</b><span>Sem esperar aprovação. Verificamos sua empresa depois.</span></li>' +
      '<li><span class="n">3</span><b>Receba currículos e chame no WhatsApp</b><span>Cada candidatura chega com resumo, arquivo e respostas.</span></li>' +
      '</ol>' +
      (nVagas ? '<p class="e1-prova">' + ic('local') + '<span>' + E.plural(nVagas, 'vaga aberta', 'vagas abertas') + ' de ' + E.plural(nEmp, 'empresa', 'empresas') + (praca ? ' em ' + esc(praca) : '') + '. ' + E.exemplo() + '</span></p>' : '') +
      '<section class="e1-confianca">' +
      '<div><h2>Grátis no lançamento</h2><p>No ar na hora. Verificamos depois.</p>' +
      '<div class="mt-16">' + E.golpe() + '</div></div>' +
      '<div class="perguntas">' +
      pergunta('Preciso ter CNPJ?', 'Sim, o CNPJ precisa estar ativo na Receita. MEI usa o CNPJ que está no Certificado do MEI (CCMEI). Confirmamos o CNPJ na hora, pela base pública da Receita.') +
      pergunta('Como as pessoas falam comigo?', 'Pelo próprio site. Cada candidatura chega no painel. Depois que sua empresa for verificada, você chama a pessoa no WhatsApp com 1 toque. Até lá, a conversa é pelo site e o WhatsApp aparece quando a pessoa liberar.') +
      pergunta('Quanto tempo a vaga fica no ar?', '30 dias. Dá para pausar, editar, encerrar ou deixar mais 30 dias no ar quando quiser.') +
      pergunta('Posso anunciar várias vagas?', 'Pode. Toque em "Tenho várias vagas" para cadastrar várias funções numa tabela. Enquanto sua empresa está em verificação, cabem 3 vagas no ar e 3 vagas novas por dia. Depois da verificação, o limite sobe.') +
      '</div></section>';
    return {
      html: html, nav: null, barra: null, titulo: 'Anuncie vagas grátis',
      depois: function () {
        var inp = $('#e1-funcao'), escolhido = null;
        E.ligarCombo(inp, $('#e1-lista'), function (m, txt) { escolhido = m; inp.value = txt; E.iniciarForm({ modelo: m ? m.id : null, titulo: txt }); });
        $('#e1-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var txt = inp.value.trim(), m = escolhido && escolhido.titulo === txt ? escolhido : MOD.exato(txt);
          E.iniciarForm({ modelo: m ? m.id : null, titulo: m ? m.titulo : txt });
        });
      }
    };
  };
  ACOES['modelo'] = function (el) { E.iniciarForm({ modelo: el.getAttribute('data-modelo') }); };
  ACOES['nova-vaga'] = function (el, e) { E.iniciarForm({}); };

  /* ---------- Entrar (sem senha: código de 6 números por e-mail) ---------- */
  TELAS.entrar = function (r) {
    var base = TELAS.anunciar();
    base.depois = function () {
      var inp = $('#e1-funcao');
      E.ligarCombo(inp, $('#e1-lista'), function (m, txt) { E.iniciarForm({ modelo: m ? m.id : null, titulo: txt }); });
      $('#e1-form').addEventListener('submit', function (e) { e.preventDefault(); E.iniciarForm({ titulo: inp.value.trim() }); });
      setTimeout(function () { E.abrirEntrar(r.q.convite); }, 0);
    };
    return base;
  };
  PRE.entrar = PRE.anunciar;
  ACOES['entrar'] = function () { ir('#/entrar'); };
  E.abrirEntrar = function (convite) {
    var dl = abrir('folha-curta', folhaTopo('folha-curta-titulo', 'Entrar') +
      '<form class="folha-corpo" id="form-entrar" novalidate>' +
      '<p>Sem senha: mandamos um código de 6 números para o seu e-mail.</p>' +
      '<div class="campo mt-16" id="c-ent-email"><label for="ent-email">E-mail da empresa</label><input class="entrada" id="ent-email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" placeholder="nome@empresa.com" autofocus></div>' +
      '<p class="erro-campo" id="ent-erro" role="alert" hidden></p>' +
      (E.previa ? '<p class="dica mt-12">Na demonstração, use qualquer e-mail. O código é 123456 e você entra como uma empresa de exemplo.</p>' : '') +
      '</form><div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Cancelar</button><button class="btn" type="submit" form="form-entrar" id="ent-botao">Receber código</button></div>');
    dl.onfechou = function () { if (!S.empresa && E.lerRota().tela === 'entrar') ir('#/anunciar'); };
    $('#form-entrar').addEventListener('submit', function (e) {
      e.preventDefault();
      var inp = $('#ent-email'), em = inp.value.trim(), er = $('#ent-erro');
      if (!E.emailValido(em)) { inp.setAttribute('aria-invalid', 'true'); er.hidden = false; er.innerHTML = ic('erro') + 'Escreva o e-mail com @, como nome@empresa.com.'; inp.focus(); return; }
      dl.onfechou = null;
      E.abrirCodigo({
        email: em, titulo: 'Confirme seu e-mail', botao: 'Entrar', tipo: 'empresa', aoVoltar: function () { ir('#/anunciar'); },
        aoConfirmar: function () {
          E.carregarConta().then(function () {
            if (convite && E.CFG && window.VAGAS_API && window.VAGAS_API.aceitarConviteEquipe) {
              return window.VAGAS_API.aceitarConviteEquipe(convite).then(function () { return E.carregarConta(); }, function (x) { toast(E.msgErro(x), null, null, 'erro'); });
            }
          }).then(function () {
            if (S.empresa) { E.esquecerTela(); ir('#/inicio'); toast('Você entrou como ' + S.empresa.nome); }
            else { toast('Não achamos uma empresa neste e-mail. Anuncie sua primeira vaga para criar a conta.', null, null, 'info'); ir('#/anunciar'); }
          }, function (x) { toast(E.msgErro(x), null, null, 'erro'); ir('#/anunciar'); });
        }
      });
    });
  };

  /* ---------- código de 6 números (entrar e publicar a primeira vaga) ---------- */
  function mascaraEmail(e) { var p = String(e).split('@'); return p.length === 2 ? (p[0].slice(0, 1) + '•••@' + p[1]) : e; }
  /* cfg: {email, titulo, botao, nome, tipo, aoConfirmar(resposta), aoVoltar} */
  E.abrirCodigo = function (cfg) {
    var mascarado = mascaraEmail(cfg.email), esperar = 30, timer = null, enviado = false;
    abrir('folha-curta', folhaTopo('folha-curta-titulo', cfg.titulo || 'Confirme seu e-mail') +
      '<form class="folha-corpo" id="form-codigo" novalidate><p id="cod-texto" role="status">Enviando o código para ' + esc(mascarado) + '…</p>' +
      '<div class="campo mt-16" id="c-codigo"><label for="codigo">Código de 6 números</label><input class="entrada num" id="codigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code" autofocus></div>' +
      '<p class="erro-campo" id="cod-erro" role="alert" hidden></p>' +
      (E.previa ? '<p class="dica mt-8">Na demonstração, o código é 123456.</p>' : '') +
      '<p class="detalhe mt-12" id="reenviar"></p></form>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Voltar</button><button class="btn" type="submit" form="form-codigo" id="cod-ok">' + esc(cfg.botao || 'Confirmar') + '</button></div>');
    var dl = $('#folha-curta');
    dl.onfechou = function () { clearInterval(timer); if (cfg.aoVoltar) cfg.aoVoltar(); };
    function erro(msg) { var er = $('#cod-erro'); if (!er) return; er.hidden = !msg; er.innerHTML = msg ? ic('erro') + esc(msg) : ''; }
    function contar() {
      clearInterval(timer);
      timer = setInterval(function () {
        var r = $('#reenviar'); if (!r || !$('#folha-curta').open) { clearInterval(timer); return; }
        esperar--;
        if (esperar <= 0) { clearInterval(timer); r.innerHTML = '<button class="link" type="button" data-acao="reenviar-codigo">Reenviar código</button>'; }
        else r.textContent = 'Reenviar em ' + esperar + ' s';
      }, 1000);
      var r0 = $('#reenviar'); if (r0) r0.textContent = 'Reenviar em ' + esperar + ' s';
    }
    function pedir() {
      var t = $('#cod-texto'); if (t) t.textContent = 'Enviando o código para ' + mascarado + '…';
      erro('');
      return E.api('codigoPedir', { destino: cfg.email, canal: 'email' }).then(function (r) {
        enviado = true; esperar = Math.max(5, r.reenviarEmSeg || 30);
        var tt = $('#cod-texto'); if (tt) tt.textContent = 'Mandamos um código para ' + (r.destinoMascarado || mascarado) + '. Ele vale por ' + Math.round((r.expiraEmSeg || 600) / 60) + ' minutos.';
        contar();
      }, function (e) {
        var tt = $('#cod-texto'); if (tt) tt.textContent = 'Não enviamos o código.';
        erro(E.msgErro(e));
        if (e && e.resposta && e.resposta.reenviarEmSeg) { esperar = e.resposta.reenviarEmSeg; contar(); }
        else { var r = $('#reenviar'); if (r) r.innerHTML = '<button class="link" type="button" data-acao="reenviar-codigo">Tentar de novo</button>'; }
      });
    }
    ACOES['reenviar-codigo'] = function () { esperar = 30; pedir(); };
    $('#form-codigo').addEventListener('submit', function (e) {
      e.preventDefault();
      var c = $('#codigo'), v = c.value.replace(/\D/g, '');
      if (v.length !== 6) { c.setAttribute('aria-invalid', 'true'); erro('O código tem 6 números.'); c.focus(); return; }
      c.removeAttribute('aria-invalid'); erro('');
      var ok = $('#cod-ok'); ok.disabled = true;
      var d = { destino: cfg.email, codigo: v, tipo: cfg.tipo || 'empresa' }; if (cfg.nome) d.nome = cfg.nome;
      E.api('codigoConfirmar', d).then(function (r) {
        clearInterval(timer); dl.onfechou = null;
        S.sessao = true;
        fechar('folha-curta', function () { cfg.aoConfirmar(r); });
      }, function (e2) {
        ok.disabled = false; c.setAttribute('aria-invalid', 'true'); erro(E.msgErro(e2)); c.select();
      });
    });
    pedir();
    setTimeout(function () { var c = $('#codigo'); if (c && document.activeElement !== c) c.focus(); }, 40);
  };

  /* ---------- Avisos (o que pede atenção agora) ---------- */
  E.listaAvisos = function () {
    var l = [];
    S.vagas.forEach(function (v) {
      if (v.novos > 0) l.push({ ic: 'pessoas', txt: E.plural(v.novos, 'candidato novo', 'candidatos novos') + ' em ' + E.tituloLocal(v), ir: '#/candidatos?vaga=' + encodeURIComponent(v.id) });
    });
    S.cands.forEach(function (c) {
      if (c.etapa !== 'nova' && c.naoLidas > 0) l.push({ ic: 'conversa', txt: 'Mensagem nova de ' + E.primeiroNome(c.nome), ir: '#/candidato/' + encodeURIComponent(c.id), aba: 'conversa' });
      if (c.etapa === 'entrevista marcada' && c.entrevista && c.entrevista.confirmada === true && E.ms(c.entrevista.quando) > E.agora()) l.push({ ic: 'calendario', txt: E.primeiroNome(c.nome) + ' confirmou a entrevista de ' + E.quando(E.ms(c.entrevista.quando)), ir: '#/candidato/' + encodeURIComponent(c.id) });
    });
    if (E.emVerificacao() && E.estadoEmpresa() === 'precisa_ajuste') l.unshift({ ic: 'alerta', txt: 'A equipe pediu um ajuste nos dados da empresa', ir: '#/verificacao' });
    return l;
  };
  ACOES['avisos'] = function () {
    var l = E.listaAvisos();
    abrir('folha', folhaTopo('folha-titulo', 'Avisos') + '<div class="folha-corpo">' +
      (l.length ? '<ul class="avisos">' + l.map(function (a, i) {
        return '<li data-novo><span class="hoje-ic">' + ic(a.ic) + '</span><div><b>' + esc(a.txt) + '</b><button class="link" type="button" data-acao="aviso-ir" data-i="' + i + '">Abrir</button></div></li>';
      }).join('') + '</ul>' : '<div class="vazio">' + ic('sino') + '<b>Nenhum aviso por enquanto</b><p>Quando alguém se candidatar ou mandar mensagem, aparece aqui.</p></div>') + '</div>');
    ACOES['aviso-ir'] = function (el) { var a = l[parseInt(el.getAttribute('data-i'), 10)]; if (a.aba) UI.gvAba = a.aba; fechar('folha', function () { ir(a.ir); }); };
  };

  /* ---------- Aparência (tema e efeitos, só neste aparelho) e controles da demonstração ---------- */
  function seg(k, val, ops) {
    return '<div class="segmentado largo" role="group" aria-labelledby="ctl-' + k + '" data-pref="' + k + '">' + ops.map(function (o) {
      return '<button type="button" data-valor="' + o[0] + '" aria-pressed="' + (val === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
  }
  function ligarPref(raiz) {
    $$('[data-pref]', raiz).forEach(function (g) {
      g.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        $$('button', g).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        E.PREF[g.getAttribute('data-pref')] = b.getAttribute('data-valor'); E.gravarJSON(E.CHAVE_PREF, E.PREF); E.aplicarPref();
      });
    });
  }
  function blocoAparencia() {
    return '<h3 id="ctl-tema">Tema</h3>' + seg('tema', E.PREF.tema || 'auto', [['auto', 'Do aparelho'], ['light', 'Claro'], ['dark', 'Escuro']]) +
      '<h3 id="ctl-fx">Efeitos</h3>' + seg('fx', E.PREF.fx || 'auto', [['auto', 'Automático'], ['on', 'Completos'], ['off', 'Reduzidos']]) +
      '<p class="dica mt-8">Reduzidos: sem vidro, sem sombra e sem movimento. Automático tira o vidro em aparelho mais simples.</p>';
  }
  ACOES['aparencia'] = function () {
    abrir('folha', folhaTopo('folha-titulo', 'Aparência') + '<div class="folha-corpo">' + blocoAparencia() + '</div>' +
      '<div class="folha-rodape"><button class="btn sec" type="button" data-acao="fechar-dialogo">Fechar</button></div>');
    ligarPref($('#folha'));
  };
  ACOES['controles'] = function () {
    var P = window.VSC_PREVIA_EMPRESA;
    if (!P) { ACOES['aparencia'](); return; }
    var est = P.cenario(), emVerif = E.emVerificacao();
    var op = P.CENARIOS;
    abrir('folha', folhaTopo('folha-titulo', 'Controles da prévia') + '<div class="folha-corpo">' +
      '<h3>Ver como</h3><div class="controle-estado">' + op.map(function (o) {
        return '<label for="est-' + o[0] + '"><input type="radio" name="estado" id="est-' + o[0] + '" value="' + o[0] + '"' + (est === o[0] ? ' checked' : '') + '><span><b>' + esc(o[1]) + '</b><small>' + esc(o[2]) + '</small></span></label>';
      }).join('') + '</div>' +
      '<h3>Simular</h3><div class="controle-simular">' +
      (S.empresa ? (emVerif ? '<button class="btn sec" type="button" data-acao="sim-verificada">' + ic('escudo') + 'Simular: empresa verificada</button>' : '') +
        '<button class="btn sec" type="button" data-acao="sim-liberou">' + ic('conversa') + 'Simular: a pessoa liberou o WhatsApp</button>' +
        '<button class="btn sec" type="button" data-acao="sim-confirmou">' + ic('calendario') + 'Simular: a pessoa confirmou a entrevista</button>' +
        '<button class="btn sec" type="button" data-acao="sim-nova">' + ic('pessoas') + 'Simular: chegou candidatura nova</button>' : '<p class="dica">Entre como uma empresa de exemplo para simular avisos.</p>') +
      '</div>' + blocoAparencia() + '</div>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="recomecar">Recomeçar a prévia</button><button class="btn sec" type="button" data-acao="fechar-dialogo">Fechar</button></div>');
    ligarPref($('#folha'));
    $$('#folha input[name="estado"]').forEach(function (r) {
      r.addEventListener('change', function () { fechar('folha', function () { P.trocar(r.value).then(function () { return E.carregarConta(); }).then(function () { E.esquecerTela(); ir(S.empresa ? '#/inicio' : '#/anunciar'); E.render(); }); }); });
    });
  };
  function simular(tipo, msg) {
    var P = window.VSC_PREVIA_EMPRESA;
    fechar('folha', function () {
      P.simular(tipo).then(function () { return S.empresa ? E.carregarPainel(UI.listaVaga) : null; }).then(function () { E.render(); toast(msg, null, null, 'check'); });
    });
  }
  ACOES['sim-verificada'] = function () {
    var P = window.VSC_PREVIA_EMPRESA;
    fechar('folha', function () { P.simular('verificada').then(function () { return E.carregarConta(); }).then(function () { return E.carregarPainel(UI.listaVaga); }).then(function () { E.render(); toast('Sua empresa foi verificada', null, null, 'escudo'); }); });
  };
  ACOES['sim-liberou'] = function () { simular('liberou', 'A pessoa liberou o WhatsApp'); };
  ACOES['sim-confirmou'] = function () { simular('confirmou', 'A pessoa confirmou a entrevista'); };
  ACOES['sim-nova'] = function () { simular('nova', 'Chegou uma candidatura nova'); };
  ACOES['recomecar'] = function () {
    var P = window.VSC_PREVIA_EMPRESA;
    fechar('folha', function () { P.recomecar().then(function () { E.zerarConta(); E.apagar('vsc.emp.rascunho'); E.apagar('vsc.emp.lote'); E.apagar('vsc.emp.atual'); E.esquecerTela(); ir('#/anunciar'); E.render(); toast('Prévia recomeçada'); }); });
  };
})();
