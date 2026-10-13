/*
 * Tela de resposta da Pesquisa de Clima da Equipe · Gestão sem Caos (clima.html?t=<token>), celular primeiro.
 *
 * Fluxo: aviso ao respondente (decisao.md 6.1; com o texto do líder no link do líder) -> uma tela por bloco
 * (botões grandes com o rótulo da escala, "Pular esta pergunta", barra de progresso) -> envio -> agradecimento.
 * Nenhuma resposta é obrigatória. Itens e textos vêm de js/clima.js (DISC_CLIMA); a API é DISC_API.climaPublica/climaEnviar.
 *
 * Modos de identificação (migração 20261018120000_clima_identificacao.sql): no LINK PESSOAL das pesquisas "identificação
 * opcional" e "identificada" o aviso diz quem vê o nome (só a Gestão sem Caos, nunca a empresa) e há uma última etapa,
 * "Identificação": no modo opcional a pessoa escolhe "Quero me identificar" ou "Prefiro manter o anonimato" (vai como o
 * link coletivo, sem marcar nada); para se identificar, confirma que é ela com um código (e-mail; WhatsApp quando houver
 * provedor: DISC_API.climaPedirCodigo) ou com os 3 últimos dígitos do CPF + dia e mês de nascimento cadastrados pela
 * empresa. Sem nenhuma dessas formas, o link pessoal (de uso único) basta. O código e os dados vão só no envio (o banco
 * confere, com validade e tentativas limitadas) e nunca ficam guardados no aparelho.
 *
 * Privacidade: as respostas ficam só na memória desta aba até o envio (nada em localStorage/sessionStorage). Depois de enviar,
 * o aparelho guarda só uma marca curta do link ("disc_clima_respondido": hash do token, sem o token nem as respostas), para
 * não responder duas vezes no mesmo aparelho. O link de clima não usa nada do teste DISC (sessão ou armazenamento).
 *
 * No Node (testes): require('./js/clima-resposta.js') -> { tokenDaUrl, marcaDoToken, montarEnvio, rotuloProgresso,
 *   montarIdentificacao, mascararNascimento }.
 */
(function (root) {
  'use strict';

  var CHAVE_FEITO = 'disc_clima_respondido';
  var MAX_MARCAS = 50;
  var MSG_LINK = 'Link inválido ou pesquisa encerrada. Fale com quem enviou o link.';

  /* ------------------------------------------------------------------ funções puras */

  // Token do link: ?t=<64 hex> ou #t-<64 hex>.
  function tokenDaUrl(search, hash) {
    var m = /[?&]t=([0-9a-fA-F]{64})(?:&|$)/.exec(String(search || ''));
    if (m) return m[1].toLowerCase();
    m = /^#t-([0-9a-fA-F]{64})$/.exec(String(hash || ''));
    return m ? m[1].toLowerCase() : '';
  }

  // Marca curta do link (FNV-1a 32 bits, 8 hex): basta para "já respondi por aqui" sem guardar o token.
  function marcaDoToken(token) {
    var h = 0x811c9dc5;
    var s = String(token || '');
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // Corpo do envio a partir do estado da tela: só o que foi respondido (pulado = fora).
  function montarEnvio(respostas, comentario, segundos, chave) {
    var itens = {};
    Object.keys(respostas || {}).forEach(function (k) {
      var v = respostas[k];
      if (typeof v === 'number' && isFinite(v)) itens[k] = v;
    });
    var c = { itens: itens, chave: chave };
    var txt = String(comentario || '').trim();
    if (txt) c.comentario = txt;
    if (typeof segundos === 'number' && isFinite(segundos) && segundos >= 0) c.segundos = Math.round(segundos);
    return c;
  }

  // Parte da identificação no corpo do envio (link pessoal). id = {modo, metodos, escolha:'identificar'|'anonimo'|'',
  // metodo, codigo, cpf3, nascimento} -> {ok, extra:{identificar?, confirmacao?}} | {ok:false, erro}. Confere só o formato
  // (o banco confere o resto); no modo opcional sem escolha pede a escolha.
  function montarIdentificacao(id) {
    id = id || {};
    var metodos = Array.isArray(id.metodos) ? id.metodos : [];
    if (id.modo === 'opcional') {
      if (id.escolha === 'anonimo') return { ok: true, extra: { identificar: false } };
      if (id.escolha !== 'identificar') return { ok: false, erro: 'Escolha se quer se identificar ou manter o anonimato.' };
    } else if (id.modo !== 'identificada') {
      return { ok: true, extra: {} };
    }
    var extra = { identificar: true };
    if (!metodos.length) return { ok: true, extra: extra };
    var metodo = metodos.indexOf(id.metodo) >= 0 ? id.metodo : '';
    if (!metodo) return { ok: false, erro: 'Escolha como confirmar que é você.' };
    if (metodo === 'dados') {
      var C = root.DISC_CLIMA || (typeof require === 'function' ? require('./clima.js') : null);
      var n = C.normalizarConferencia(id.cpf3, id.nascimento);
      if (!n.ok) return { ok: false, erro: n.erro };
      extra.confirmacao = { metodo: 'dados', cpf3: String(id.cpf3).trim(), nascimento: String(id.nascimento).trim() };
      return { ok: true, extra: extra };
    }
    var cod = String(id.codigo == null ? '' : id.codigo).replace(/\D/g, '');
    if (!id.codigoPedido) return { ok: false, erro: 'Peça o código e digite os 6 números que chegarem.' };
    if (!/^[0-9]{6}$/.test(cod)) return { ok: false, erro: 'Digite os 6 números do código.' };
    extra.confirmacao = { metodo: metodo, codigo: cod };
    return { ok: true, extra: extra };
  }

  // "1508" -> "15/08" enquanto a pessoa digita (só números; no máximo DD/MM).
  function mascararNascimento(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 4);
    return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  }

  function rotuloProgresso(i, total) { return 'Parte ' + (i + 1) + ' de ' + total; }

  /* ------------------------------------------------------------------ tela */

  function iniciar() {
    var doc = root.document;
    var app = doc.getElementById('app');
    if (!app) return;
    var CL = root.DISC_CLIMA;
    var api = root.DISC_API;
    var token = tokenDaUrl(root.location.search, root.location.hash);
    var estado = { info: null, telas: [], tela: -1, respostas: {}, pulados: {}, comentario: '', inicio: 0, chave: gerarChave(), enviando: false,
      pessoal: false, id: { escolha: '', metodo: '', codigo: '', codigoPedido: false, codigoPrevia: '', destino: '', cpf3: '', nascimento: '' } };

    function el(tag, attrs, filhos) {
      var n = doc.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'texto') n.textContent = v;
        else if (k === 'classe') n.className = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
      [].concat(filhos || []).forEach(function (f) {
        if (f === null || f === undefined || f === false) return;
        n.appendChild(typeof f === 'string' ? doc.createTextNode(f) : f);
      });
      return n;
    }
    function trocar(conteudo, etapa) {
      doc.body.setAttribute('data-etapa', etapa);
      while (app.firstChild) app.removeChild(app.firstChild);
      [].concat(conteudo).forEach(function (n) { if (n) app.appendChild(n); });
      root.scrollTo(0, 0);
      var foco = app.querySelector('h1');
      if (foco) { foco.setAttribute('tabindex', '-1'); foco.focus({ preventScroll: true }); }
    }
    function avisarLeitor(msg) { var a = doc.getElementById('aviso'); if (a) a.textContent = msg; }
    function gerarChave() {
      var b = new Uint8Array(16);
      try { root.crypto.getRandomValues(b); } catch (e) { for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
      return Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    }
    function marcas() {
      try { var l = JSON.parse(root.localStorage.getItem(CHAVE_FEITO) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
    }
    function jaRespondeu() { return marcas().indexOf(marcaDoToken(token)) >= 0; }
    function marcarRespondido() {
      try {
        var l = marcas().filter(function (x) { return x !== marcaDoToken(token); });
        l.push(marcaDoToken(token));
        root.localStorage.setItem(CHAVE_FEITO, JSON.stringify(l.slice(-MAX_MARCAS)));
      } catch (e) { /* sem armazenamento: segue */ }
    }
    function esquecerRespondido() {
      try { root.localStorage.setItem(CHAVE_FEITO, JSON.stringify(marcas().filter(function (x) { return x !== marcaDoToken(token); }))); } catch (e) { /* ignora */ }
    }

    function telaMensagem(titulo, texto, extra) {
      trocar(el('section', { classe: 'caixa clima-mensagem surgir' }, [
        el('h1', { classe: 'titulo-pagina', texto: titulo }),
        el('p', { classe: 'subtitulo', texto: texto })
      ].concat(extra || [])), 'mensagem');
    }

    function selo(texto) {
      var s = doc.getElementById('topo-empresa');
      if (!s) return;
      s.textContent = texto || '';
      s.hidden = !texto;
    }

    // 1) dados do link
    if (!CL || !api || typeof api.climaPublica !== 'function') { telaMensagem('Pesquisa indisponível', 'Não foi possível abrir a pesquisa agora. Tente de novo mais tarde.'); return; }
    if (!token) { telaMensagem('Link inválido', MSG_LINK); return; }
    Promise.resolve().then(function () { return api.climaPublica(token); }).then(function (info) {
      estado.info = info;
      estado.telas = CL.telas(info.papel, { complemento: info.complemento === true, n4: info.n4 === true });
      estado.pessoal = info.pessoal === true && CL.comIdentificacao(info.modo);
      var metodos = Array.isArray(info.metodos) ? info.metodos : [];
      estado.id.metodo = metodos.length === 1 ? metodos[0] : '';
      selo(info.empresaNome);
      if (jaRespondeu()) return telaJaRespondeu();
      telaAviso();
    }, function (e) {
      var r = e && e.resposta;
      if (r && r.encerrada) telaMensagem('Pesquisa encerrada', 'Esta pesquisa já foi encerrada. Obrigado pelo interesse!');
      else if (r && r.usado && jaRespondeu()) telaMensagem('Você já respondeu', 'Suas respostas já foram enviadas por este aparelho. Obrigado!');
      else if (r && r.usado) telaMensagem('Link já usado', 'Este link pessoal já foi usado para responder. Obrigado!');
      else telaMensagem('Link inválido', (e && e.message) || MSG_LINK);
    });

    function totalPartes() { return estado.telas.length + (estado.pessoal ? 1 : 0); }

    function telaJaRespondeu() {
      if (estado.pessoal) {
        telaMensagem('Você já respondeu', 'Suas respostas já foram enviadas por este aparelho. Obrigado!');
        return;
      }
      telaMensagem('Você já respondeu', 'Suas respostas já foram enviadas por este aparelho. Obrigado!', [
        el('p', { classe: 'clima-nota', texto: 'A resposta não fica ligada a você: nem quem conduz a pesquisa sabe quem respondeu.' }),
        el('div', { classe: 'acoes' }, el('button', { type: 'button', classe: 'botao botao--claro', 'data-acao': 'outra-pessoa', texto: 'Outra pessoa vai responder neste aparelho',
          onclick: function () { esquecerRespondido(); telaAviso(); } }))
      ]);
    }

    // 2) aviso (6.1, conforme o modo) + aceite
    function telaAviso() {
      var info = estado.info;
      var aviso = CL.avisoRespondente({ empresa: info.empresaNome, complemento: info.complemento, retencaoDias: info.retencaoDias,
        contatoDados: info.contatoDados, baseLegal: root.CONFIG && root.CONFIG.CLIMA_BASE_LEGAL, modo: info.modo, pessoal: info.pessoal === true });
      var lider = info.papel === 'lider';
      var marcar = el('input', { id: 'clima-aceite', type: 'checkbox' });
      var comecar = el('button', { type: 'button', classe: 'botao botao--principal botao--grande', 'data-acao': 'comecar', disabled: true, texto: 'Começar' });
      marcar.addEventListener('change', function () { comecar.disabled = !marcar.checked; });
      comecar.addEventListener('click', function () {
        if (!marcar.checked) return;
        if (!estado.inicio) estado.inicio = Date.now();
        irPara(0);
      });
      trocar(el('section', { classe: 'caixa clima-aviso surgir', 'aria-labelledby': 'clima-aviso-titulo', 'data-modo': estado.pessoal ? info.modo : 'anonima' }, [
        el('p', { classe: 'sobretitulo', texto: aviso.sobretitulo }),
        el('h1', { classe: 'titulo-pagina', id: 'clima-aviso-titulo', texto: aviso.titulo }),
        el('p', { classe: 'clima-equipe', texto: (lider ? 'Você responde como líder da ' : 'Você responde sobre a ') + String(info.equipeNome || '').replace(/\.$/, '') + '.' }),
        aviso.destaque ? el('div', { classe: 'clima-quem-ve', 'data-quem-ve': '1' }, [el('strong', { texto: 'Quem vê o seu nome. ' }), aviso.destaque]) : null,
        lider ? el('div', { classe: 'clima-lider' }, [el('strong', { texto: 'Sua parte como líder. ' }), CL.AVISO_LIDER.replace(/^Sua parte como líder\.\s*/, '')]) : null,
        el('ul', { classe: 'clima-aviso__lista' }, aviso.paragrafos.map(function (p) {
          return el('li', null, [el('strong', { texto: p.rotulo + ' ' }), p.texto]);
        })),
        el('p', { classe: 'clima-nota' }, [el('a', { href: 'privacidade.html', target: '_blank', rel: 'noopener', texto: 'Aviso de privacidade completo' })]),
        el('div', { classe: 'campo consentimento' }, el('label', { classe: 'marcar', for: 'clima-aceite' }, [marcar, el('span', null, el('strong', { texto: aviso.aceite }))])),
        el('div', { classe: 'acoes' }, comecar)
      ]), 'aviso');
    }

    // 3) blocos
    function irPara(i) {
      estado.tela = i;
      telaBloco();
    }

    function progresso(i) {
      var total = totalPartes();
      var pct = Math.round((i / total) * 100);
      var visivel = Math.max(pct, 6);
      var feito = el('span', { classe: 'progresso-feito' });
      feito.style.width = visivel + '%';
      var ponto = el('span', { classe: 'progresso-ponto vidro-claro' });
      ponto.style.left = 'clamp(22px, ' + (visivel - 0.5) + '%, calc(100% - 22px))';
      return el('div', { classe: 'progresso' }, [
        el('div', { classe: 'progresso-topo' }, [
          el('span', { classe: 'progresso-texto' }, ['Parte ', el('strong', { classe: 'progresso-num', texto: String(i + 1) }), ' de ' + total]),
          el('span', { classe: 'progresso-pct texto-suave', texto: pct + '%' })
        ]),
        el('div', { classe: 'progresso-barra', role: 'progressbar', 'aria-label': 'Progresso da pesquisa', 'aria-valuemin': '0', 'aria-valuemax': String(total),
          'aria-valuenow': String(i), 'aria-valuetext': rotuloProgresso(i, total) }, [el('span', { classe: 'progresso-trilho trilho' }), feito, ponto])
      ]);
    }

    function pergunta(id) {
      var it = CL.item(id);
      var freq = it.escala === 'frequencia';
      var escala = freq ? CL.ESCALA_N4 : CL.ESCALA;
      var idTitulo = 'clima-q-' + id;
      var botoes = [];
      var pular;
      function atualizar() {
        botoes.forEach(function (b) { b.setAttribute('aria-pressed', String(estado.respostas[id] === Number(b.getAttribute('data-valor')))); });
        pular.setAttribute('aria-pressed', String(!!estado.pulados[id]));
      }
      escala.forEach(function (op) {
        var b = el('button', { type: 'button', classe: 'clima-opcao', 'data-item': id, 'data-valor': String(op.valor), 'aria-pressed': 'false' }, [
          el('span', { classe: 'escolha-marca', 'aria-hidden': 'true' }),
          el('span', { classe: 'clima-opcao__texto', texto: op.rotulo })
        ]);
        b.addEventListener('click', function () { estado.respostas[id] = op.valor; delete estado.pulados[id]; atualizar(); });
        botoes.push(b);
      });
      pular = el('button', { type: 'button', classe: 'clima-pular', 'data-acao': 'pular', 'data-item': id, 'aria-pressed': 'false', texto: 'Pular esta pergunta' });
      pular.addEventListener('click', function () { delete estado.respostas[id]; estado.pulados[id] = true; atualizar(); });
      atualizar();
      var extra = null;
      if (id === 'N4') {
        var info = estado.info;
        var canal = String(info.canalTexto || '').trim();
        var url = String(info.canalUrl || '').trim();
        extra = el('p', { classe: 'clima-canal', 'data-canal': 'n4' }, [CL.textoN4(canal, estado.pessoal)]);
        if (/^(https:\/\/|mailto:|tel:)/.test(url)) {
          extra.appendChild(doc.createTextNode(' '));
          extra.appendChild(el('a', { href: url, target: '_blank', rel: 'noopener', texto: 'Abrir o canal' }));
        }
      }
      return el('li', { classe: 'clima-pergunta', 'data-item': id }, [
        el('p', { classe: 'clima-pergunta__texto', id: idTitulo, texto: it.texto }),
        el('div', { classe: 'clima-opcoes', role: 'group', 'aria-labelledby': idTitulo }, botoes),
        pular,
        extra
      ]);
    }

    function barraNav(dica, voltar, seguir) {
      return el('div', { classe: 'barra-nav' }, [
        el('p', { classe: 'barra-dica', texto: dica }),
        el('div', { classe: 'barra-botoes' }, [voltar, seguir])
      ]);
    }

    function telaBloco() {
      var i = estado.tela;
      var t = estado.telas[i];
      var ultimo = i === estado.telas.length - 1;
      var enviaAqui = ultimo && !estado.pessoal;
      var lista = el('ol', { classe: 'clima-perguntas' }, t.itens.map(pergunta));
      var comentario = null;
      if (t.comentario) {
        var area = el('textarea', { id: 'clima-comentario', classe: 'entrada clima-comentario', rows: '4', maxlength: String(CL.MAX_COMENTARIO),
          'aria-describedby': 'clima-comentario-ajuda' });
        area.value = estado.comentario;
        area.addEventListener('input', function () { estado.comentario = area.value; });
        comentario = el('div', { classe: 'campo clima-campo-comentario' }, [
          el('label', { classe: 'campo__rotulo', for: 'clima-comentario', texto: CL.ITEM_H2.texto }),
          el('p', { classe: 'campo__ajuda', id: 'clima-comentario-ajuda', texto: CL.ITEM_H2.ajuda + ' Até ' + CL.MAX_COMENTARIO + ' caracteres.' }),
          area
        ]);
      }
      var erro = el('p', { classe: 'campo__erro clima-erro', id: 'clima-erro', role: 'alert' });
      var voltar = el('button', { type: 'button', classe: 'botao botao--claro botao--grande', 'data-acao': 'voltar', texto: 'Voltar' });
      var seguir = el('button', { type: 'button', classe: 'botao botao--principal botao--grande', 'data-acao': enviaAqui ? 'enviar' : 'proximo', texto: enviaAqui ? 'Enviar respostas' : 'Continuar' });
      voltar.addEventListener('click', function () { if (i === 0) telaAviso(); else irPara(i - 1); });
      seguir.addEventListener('click', function () {
        if (enviaAqui) enviar(seguir, erro, {});
        else if (ultimo) telaIdentificacao();
        else irPara(i + 1);
      });
      // Sem a animação "surgir" aqui: o transform que ela deixa prenderia a barra fixa (Voltar/Continuar) dentro do cartão.
      trocar(el('section', { classe: 'caixa clima-bloco', 'data-tela': t.id, 'aria-labelledby': 'clima-bloco-titulo' }, [
        progresso(i),
        el('h1', { classe: 'clima-bloco__titulo', id: 'clima-bloco-titulo', texto: t.titulo }),
        t.topo ? el('p', { classe: 'clima-bloco__topo', texto: t.topo }) : null,
        el('p', { classe: 'clima-nota', texto: 'Nenhuma pergunta é obrigatória. Se preferir, toque em "Pular esta pergunta".' }),
        lista,
        comentario,
        erro,
        barraNav(enviaAqui ? 'Confira e envie quando quiser.' : 'Suas respostas ficam só neste aparelho até o envio.', voltar, seguir)
      ]), 'bloco');
      avisarLeitor(rotuloProgresso(i, totalPartes()) + ': ' + t.titulo);
    }

    // 4) identificação (só no link pessoal dos modos opcional e identificado)
    function telaIdentificacao() {
      var info = estado.info;
      var TI = CL.TEXTOS_IDENTIFICACAO;
      var opcional = info.modo === 'opcional';
      var i = estado.telas.length;
      var erro = el('p', { classe: 'campo__erro clima-erro', id: 'clima-erro', role: 'alert' });
      var confirmar = el('div', { classe: 'clima-confirmar', id: 'clima-confirmar' });
      var escolhas = [];
      function escolha(valor, titulo, ajuda) {
        var b = el('button', { type: 'button', classe: 'clima-opcao clima-opcao--larga', 'data-escolha': valor, 'aria-pressed': String(estado.id.escolha === valor) }, [
          el('span', { classe: 'escolha-marca', 'aria-hidden': 'true' }),
          el('span', { classe: 'clima-opcao__texto' }, [el('strong', { texto: titulo }), el('span', { classe: 'clima-opcao__ajuda', texto: ajuda })])
        ]);
        b.addEventListener('click', function () {
          estado.id.escolha = valor;
          erro.textContent = '';
          escolhas.forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-escolha') === valor)); });
          montarConfirmacao();
        });
        escolhas.push(b);
        return b;
      }
      function montarConfirmacao() {
        while (confirmar.firstChild) confirmar.removeChild(confirmar.firstChild);
        confirmar.hidden = opcional && estado.id.escolha !== 'identificar';
        if (confirmar.hidden) return;
        var metodos = Array.isArray(info.metodos) ? info.metodos : [];
        if (opcional) confirmar.appendChild(el('h2', { classe: 'clima-confirmar__titulo', texto: TI.confirmar }));
        if (!metodos.length) {
          confirmar.appendChild(el('p', { classe: 'clima-nota', 'data-confirmar': 'link', texto: TI.soLink }));
          return;
        }
        if (metodos.length > 1) {
          var botoes = [];
          confirmar.appendChild(el('div', { classe: 'clima-opcoes clima-opcoes--metodos', role: 'group', 'aria-label': 'Como confirmar' }, metodos.map(function (m) {
            var sub = m === 'email' ? (info.emailMascarado || 'e-mail do cadastro') : (m === 'whatsapp' ? 'número com final ' + (info.whatsappFinal || '••')
              : 'dados que a empresa cadastrou');
            var b = el('button', { type: 'button', classe: 'clima-opcao clima-opcao--larga', 'data-metodo': m, 'aria-pressed': String(estado.id.metodo === m) }, [
              el('span', { classe: 'escolha-marca', 'aria-hidden': 'true' }),
              el('span', { classe: 'clima-opcao__texto' }, [el('strong', { texto: CL.METODOS_INFO[m].rotulo }), el('span', { classe: 'clima-opcao__ajuda', texto: sub })])
            ]);
            b.addEventListener('click', function () {
              if (estado.id.metodo !== m) { estado.id.metodo = m; estado.id.codigoPedido = false; estado.id.codigo = ''; estado.id.codigoPrevia = ''; }
              erro.textContent = '';
              montarConfirmacao();
            });
            botoes.push(b);
            return b;
          })));
        }
        var m = estado.id.metodo;
        var area = el('div', { classe: 'clima-confirmar__campos', 'data-metodo-ativo': m || '' });
        confirmar.appendChild(area);
        if (!m) return;
        if (m === 'dados') {
          var cpf = el('input', { id: 'clima-cpf3', classe: 'entrada clima-entrada-curta', type: 'text', inputmode: 'numeric', maxlength: '3', autocomplete: 'off',
            'aria-describedby': 'clima-dados-ajuda' });
          cpf.value = estado.id.cpf3;
          cpf.addEventListener('input', function () { cpf.value = cpf.value.replace(/\D/g, '').slice(0, 3); estado.id.cpf3 = cpf.value; });
          var nasc = el('input', { id: 'clima-nascimento', classe: 'entrada clima-entrada-curta', type: 'text', inputmode: 'numeric', maxlength: '5', autocomplete: 'off',
            placeholder: 'DD/MM' });
          nasc.value = estado.id.nascimento;
          nasc.addEventListener('input', function () { nasc.value = mascararNascimento(nasc.value); estado.id.nascimento = nasc.value; });
          area.appendChild(el('p', { classe: 'clima-nota', id: 'clima-dados-ajuda', texto: 'Os mesmos dados que a empresa informou no seu cadastro. Eles só servem para conferir que é você e não ficam guardados neste aparelho.' }));
          area.appendChild(el('div', { classe: 'clima-campos' }, [
            el('label', { classe: 'campo', for: 'clima-cpf3' }, [el('span', { classe: 'campo__rotulo', texto: '3 últimos dígitos do CPF' }), cpf]),
            el('label', { classe: 'campo', for: 'clima-nascimento' }, [el('span', { classe: 'campo__rotulo', texto: 'Dia e mês de nascimento' }), nasc])
          ]));
          return;
        }
        // código por e-mail ou WhatsApp
        var destino = estado.id.destino || (m === 'email' ? info.emailMascarado : 'final ' + (info.whatsappFinal || ''));
        var pedir = el('button', { type: 'button', classe: 'botao ' + (estado.id.codigoPedido ? 'botao--claro botao--pequeno' : 'botao--contorno'), 'data-acao': 'pedir-codigo',
          texto: estado.id.codigoPedido ? 'Pedir outro código' : 'Enviar código' });
        pedir.addEventListener('click', function () { pedirCodigo(pedir, erro); });
        if (!estado.id.codigoPedido) {
          area.appendChild(el('p', { classe: 'clima-nota', texto: 'Vamos enviar um código de 6 números ' + (m === 'email' ? 'para o e-mail ' : 'pelo WhatsApp, para o número com ') + destino + '.' }));
          area.appendChild(el('div', { classe: 'acoes' }, pedir));
          return;
        }
        var cod = el('input', { id: 'clima-codigo', classe: 'entrada clima-entrada-curta clima-codigo', type: 'text', inputmode: 'numeric', maxlength: '7',
          autocomplete: 'one-time-code', 'aria-describedby': 'clima-codigo-ajuda' });
        cod.value = estado.id.codigo;
        cod.addEventListener('input', function () { cod.value = cod.value.replace(/[^0-9 ]/g, '').slice(0, 7); estado.id.codigo = cod.value; });
        area.appendChild(el('label', { classe: 'campo', for: 'clima-codigo' }, [el('span', { classe: 'campo__rotulo', texto: 'Código de 6 números' }), cod]));
        area.appendChild(el('p', { classe: 'clima-nota', id: 'clima-codigo-ajuda', texto: 'Enviado para ' + destino + '. Vale por ' + CL.CODIGO_MINUTOS +
          ' minutos. Não chegou? Confira a caixa de spam ou peça outro.' }));
        if (estado.id.codigoPrevia) {
          area.appendChild(el('p', { classe: 'clima-previa-codigo', 'data-codigo-previa': estado.id.codigoPrevia,
            texto: 'Prévia: nenhum e-mail é enviado. Use o código ' + estado.id.codigoPrevia + '.' }));
        }
        area.appendChild(el('div', { classe: 'acoes' }, pedir));
      }
      function pedirCodigo(botao, erroEl) {
        if (botao.disabled) return;
        botao.disabled = true;
        erroEl.textContent = '';
        var canal = estado.id.metodo;
        Promise.resolve().then(function () { return api.climaPedirCodigo(token, canal); }).then(function (r) {
          estado.id.codigoPedido = true;
          estado.id.codigo = '';
          estado.id.destino = r.destino || '';
          estado.id.codigoPrevia = r.simulado && r.codigoPrevia ? String(r.codigoPrevia) : '';
          montarConfirmacao();
          var c = doc.getElementById('clima-codigo');
          if (c) c.focus();
          avisarLeitor('Código enviado.');
        }, function (e) {
          botao.disabled = false;
          erroEl.textContent = (e && e.message) || 'Não foi possível enviar o código agora. Tente de novo em instantes.';
        });
      }
      var voltar = el('button', { type: 'button', classe: 'botao botao--claro botao--grande', 'data-acao': 'voltar', texto: 'Voltar' });
      var seguir = el('button', { type: 'button', classe: 'botao botao--principal botao--grande', 'data-acao': 'enviar', texto: 'Enviar respostas' });
      voltar.addEventListener('click', function () { irPara(estado.telas.length - 1); });
      seguir.addEventListener('click', function () {
        var r = montarIdentificacao({ modo: info.modo, metodos: info.metodos, escolha: estado.id.escolha, metodo: estado.id.metodo, codigo: estado.id.codigo,
          codigoPedido: estado.id.codigoPedido, cpf3: estado.id.cpf3, nascimento: estado.id.nascimento });
        if (!r.ok) { erro.textContent = r.erro; return; }
        enviar(seguir, erro, r.extra);
      });
      trocar(el('section', { classe: 'caixa clima-bloco clima-identificacao', 'data-tela': 'identificacao', 'data-modo': info.modo, 'aria-labelledby': 'clima-bloco-titulo' }, [
        progresso(i),
        el('h1', { classe: 'clima-bloco__titulo', id: 'clima-bloco-titulo', texto: opcional ? 'Você quer se identificar?' : 'Confirme que é você' }),
        el('p', { classe: 'clima-bloco__topo', texto: opcional ? TI.escolher
          : 'Esta pesquisa é identificada. O seu nome fica só com a consultoria (Gestão sem Caos); a empresa só vê resultados de grupo.' }),
        opcional ? el('div', { classe: 'clima-opcoes clima-opcoes--escolha', role: 'group', 'aria-label': 'Identificação' }, [
          escolha('identificar', TI.quero, TI.queroAjuda),
          escolha('anonimo', TI.anonimo, TI.anonimoAjuda)
        ]) : null,
        confirmar,
        erro,
        barraNav('O código e os dados servem só para conferir que é você.', voltar, seguir)
      ]), 'identificacao');
      montarConfirmacao();
      avisarLeitor(rotuloProgresso(i, totalPartes()) + ': identificação');
    }

    // 5) envio
    function enviar(botaoEnviar, erro, extra) {
      if (estado.enviando) return;
      var segundos = estado.inicio ? (Date.now() - estado.inicio) / 1000 : null;
      var corpo = montarEnvio(estado.respostas, estado.comentario, segundos, estado.chave);
      if (!Object.keys(corpo.itens).length && !corpo.comentario) {
        erro.textContent = 'Responda pelo menos uma pergunta antes de enviar.';
        return;
      }
      Object.keys(extra || {}).forEach(function (k) { corpo[k] = extra[k]; });
      estado.enviando = true;
      botaoEnviar.disabled = true;
      botaoEnviar.textContent = 'Enviando…';
      erro.textContent = '';
      Promise.resolve().then(function () { return api.climaEnviar(token, corpo); }).then(function (r) {
        marcarRespondido();
        estado.respostas = {}; estado.pulados = {}; estado.comentario = '';
        estado.id.codigo = ''; estado.id.cpf3 = ''; estado.id.nascimento = '';
        var identificada = !!(r && r.identificada) || corpo.identificar === true;
        var TI = CL.TEXTOS_IDENTIFICACAO;
        telaMensagem('Respostas enviadas. Obrigado!', identificada ? TI.fimIdentificada : TI.fimAnonima, [
          el('p', { classe: 'clima-nota', texto: 'Pode fechar esta página.' })
        ]);
        doc.body.setAttribute('data-etapa', 'fim');
        doc.body.setAttribute('data-identificada', identificada ? 'sim' : 'nao');
      }, function (e) {
        estado.enviando = false;
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = 'Tentar enviar de novo';
        var r = e && e.resposta;
        if (r && r.encerrada) { telaMensagem('Pesquisa encerrada', 'Esta pesquisa já foi encerrada antes do envio. Obrigado pelo interesse!'); return; }
        if (r && r.usado) { telaMensagem('Link já usado', 'Este link pessoal já foi usado para responder. Obrigado!'); return; }
        erro.textContent = (e && e.message) || 'Não foi possível enviar. Verifique a internet e tente de novo.';
      });
    }
  }

  var DISC_CLIMA_RESPOSTA = { tokenDaUrl: tokenDaUrl, marcaDoToken: marcaDoToken, montarEnvio: montarEnvio, rotuloProgresso: rotuloProgresso,
    montarIdentificacao: montarIdentificacao, mascararNascimento: mascararNascimento, CHAVE_FEITO: CHAVE_FEITO, iniciar: iniciar };

  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_CLIMA_RESPOSTA;
  else {
    root.DISC_CLIMA_RESPOSTA = DISC_CLIMA_RESPOSTA;
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', iniciar);
      else iniciar();
    }
  }
})(typeof self !== 'undefined' ? self : this);
