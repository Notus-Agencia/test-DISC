/*
 * Tela de resposta da Pesquisa de Clima da Equipe · Gestão sem Caos (clima.html?t=<token>), celular primeiro.
 *
 * Fluxo: aviso ao respondente (decisao.md 6.1, versão anônima; com o texto do líder no link do líder) -> uma tela por bloco
 * (botões grandes com o rótulo da escala, "Pular esta pergunta", barra de progresso) -> envio -> agradecimento.
 * Nenhuma resposta é obrigatória. Itens e textos vêm de js/clima.js (DISC_CLIMA); a API é DISC_API.climaPublica/climaEnviar.
 *
 * Privacidade: as respostas ficam só na memória desta aba até o envio (nada em localStorage/sessionStorage). Depois de enviar,
 * o aparelho guarda só uma marca curta do link ("disc_clima_respondido": hash do token, sem o token nem as respostas), para
 * não responder duas vezes no mesmo aparelho. O link de clima não usa nada do teste DISC (sessão ou armazenamento).
 *
 * No Node (testes): require('./js/clima-resposta.js') -> { tokenDaUrl, marcaDoToken, montarEnvio, rotuloProgresso }.
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

  function rotuloProgresso(i, total) { return 'Parte ' + (i + 1) + ' de ' + total; }

  /* ------------------------------------------------------------------ tela */

  function iniciar() {
    var doc = root.document;
    var app = doc.getElementById('app');
    if (!app) return;
    var CL = root.DISC_CLIMA;
    var api = root.DISC_API;
    var token = tokenDaUrl(root.location.search, root.location.hash);
    var estado = { info: null, telas: [], tela: -1, respostas: {}, pulados: {}, comentario: '', inicio: 0, chave: gerarChave(), enviando: false };

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
      selo(info.empresaNome);
      if (jaRespondeu()) return telaJaRespondeu();
      telaAviso();
    }, function (e) {
      var r = e && e.resposta;
      if (r && r.encerrada) telaMensagem('Pesquisa encerrada', 'Esta pesquisa já foi encerrada. Obrigado pelo interesse!');
      else telaMensagem('Link inválido', (e && e.message) || MSG_LINK);
    });

    function telaJaRespondeu() {
      telaMensagem('Você já respondeu', 'Suas respostas já foram enviadas por este aparelho. Obrigado!', [
        el('p', { classe: 'clima-nota', texto: 'A resposta não fica ligada a você: nem quem conduz a pesquisa sabe quem respondeu.' }),
        el('div', { classe: 'acoes' }, el('button', { type: 'button', classe: 'botao botao--claro', 'data-acao': 'outra-pessoa', texto: 'Outra pessoa vai responder neste aparelho',
          onclick: function () { esquecerRespondido(); telaAviso(); } }))
      ]);
    }

    // 2) aviso (6.1) + aceite
    function telaAviso() {
      var info = estado.info;
      var aviso = CL.avisoRespondente({ empresa: info.empresaNome, complemento: info.complemento, retencaoDias: info.retencaoDias,
        contatoDados: info.contatoDados, baseLegal: root.CONFIG && root.CONFIG.CLIMA_BASE_LEGAL });
      var lider = info.papel === 'lider';
      var marcar = el('input', { id: 'clima-aceite', type: 'checkbox' });
      var comecar = el('button', { type: 'button', classe: 'botao botao--principal botao--grande', 'data-acao': 'comecar', disabled: true, texto: 'Começar' });
      marcar.addEventListener('change', function () { comecar.disabled = !marcar.checked; });
      comecar.addEventListener('click', function () {
        if (!marcar.checked) return;
        if (!estado.inicio) estado.inicio = Date.now();
        irPara(0);
      });
      trocar(el('section', { classe: 'caixa clima-aviso surgir', 'aria-labelledby': 'clima-aviso-titulo' }, [
        el('p', { classe: 'sobretitulo', texto: 'Anônima e voluntária · cerca de 5 minutos' }),
        el('h1', { classe: 'titulo-pagina', id: 'clima-aviso-titulo', texto: aviso.titulo }),
        el('p', { classe: 'clima-equipe', texto: (lider ? 'Você responde como líder da ' : 'Você responde sobre a ') + String(info.equipeNome || '').replace(/\.$/, '') + '.' }),
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
      var total = estado.telas.length;
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
        extra = el('p', { classe: 'clima-canal', 'data-canal': 'n4' }, [CL.textoN4(canal)]);
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

    function telaBloco() {
      var i = estado.tela;
      var t = estado.telas[i];
      var ultimo = i === estado.telas.length - 1;
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
      var seguir = el('button', { type: 'button', classe: 'botao botao--principal botao--grande', 'data-acao': ultimo ? 'enviar' : 'proximo', texto: ultimo ? 'Enviar respostas' : 'Continuar' });
      voltar.addEventListener('click', function () { if (i === 0) telaAviso(); else irPara(i - 1); });
      seguir.addEventListener('click', function () { if (ultimo) enviar(seguir, erro); else irPara(i + 1); });
      // Sem a animação "surgir" aqui: o transform que ela deixa prenderia a barra fixa (Voltar/Continuar) dentro do cartão.
      trocar(el('section', { classe: 'caixa clima-bloco', 'data-tela': t.id, 'aria-labelledby': 'clima-bloco-titulo' }, [
        progresso(i),
        el('h1', { classe: 'clima-bloco__titulo', id: 'clima-bloco-titulo', texto: t.titulo }),
        t.topo ? el('p', { classe: 'clima-bloco__topo', texto: t.topo }) : null,
        el('p', { classe: 'clima-nota', texto: 'Nenhuma pergunta é obrigatória. Se preferir, toque em "Pular esta pergunta".' }),
        lista,
        comentario,
        erro,
        el('div', { classe: 'barra-nav' }, [
          el('p', { classe: 'barra-dica', texto: ultimo ? 'Confira e envie quando quiser.' : 'Suas respostas ficam só neste aparelho até o envio.' }),
          el('div', { classe: 'barra-botoes' }, [voltar, seguir])
        ])
      ]), 'bloco');
      avisarLeitor(rotuloProgresso(i, estado.telas.length) + ': ' + t.titulo);
    }

    // 4) envio
    function enviar(botaoEnviar, erro) {
      if (estado.enviando) return;
      var segundos = estado.inicio ? (Date.now() - estado.inicio) / 1000 : null;
      var corpo = montarEnvio(estado.respostas, estado.comentario, segundos, estado.chave);
      if (!Object.keys(corpo.itens).length && !corpo.comentario) {
        erro.textContent = 'Responda pelo menos uma pergunta antes de enviar.';
        return;
      }
      estado.enviando = true;
      botaoEnviar.disabled = true;
      botaoEnviar.textContent = 'Enviando…';
      erro.textContent = '';
      Promise.resolve().then(function () { return api.climaEnviar(token, corpo); }).then(function () {
        marcarRespondido();
        estado.respostas = {}; estado.pulados = {}; estado.comentario = '';
        telaMensagem('Respostas enviadas. Obrigado!', 'Sua resposta não fica ligada a você. A empresa só vê resultados de grupo, depois que a pesquisa terminar.', [
          el('p', { classe: 'clima-nota', texto: 'Pode fechar esta página.' })
        ]);
        doc.body.setAttribute('data-etapa', 'fim');
      }, function (e) {
        estado.enviando = false;
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = 'Tentar enviar de novo';
        var r = e && e.resposta;
        if (r && r.encerrada) { telaMensagem('Pesquisa encerrada', 'Esta pesquisa já foi encerrada antes do envio. Obrigado pelo interesse!'); return; }
        erro.textContent = (e && e.message) || 'Não foi possível enviar. Verifique a internet e tente de novo.';
      });
    }
  }

  var DISC_CLIMA_RESPOSTA = { tokenDaUrl: tokenDaUrl, marcaDoToken: marcaDoToken, montarEnvio: montarEnvio, rotuloProgresso: rotuloProgresso,
    CHAVE_FEITO: CHAVE_FEITO, iniciar: iniciar };

  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_CLIMA_RESPOSTA;
  else {
    root.DISC_CLIMA_RESPOSTA = DISC_CLIMA_RESPOSTA;
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', iniciar);
      else iniciar();
    }
  }
})(typeof self !== 'undefined' ? self : this);
