/*
 * Tela de resposta do Feedback 360 da Liderança · Gestão sem Caos (feedback360.html?t=<token>), celular primeiro.
 *
 * Fluxo: aviso certo para cada formulário (decisao.md 5.1: a = autoavaliação; b = colegas, equipe e outros, "confidencial";
 * b + c = chefia, identificada) com aceite -> tela de instrução (3.1.3) -> 1 tema por tela (3 frases, botões grandes com o
 * rótulo da escala, "Não tive como observar" / "Não se aplica ao meu trabalho", "Pular esta pergunta", barra de progresso) ->
 * "Para fechar" (GLB1) -> comentários AB1/AB2 com o aviso 5.1-d acima de cada campo (não na autoavaliação) -> envio ->
 * agradecimento. Nenhuma resposta é obrigatória. Itens e textos vêm de js/feedback360.js (DISC_F360); a API é
 * DISC_API.f360Publica / f360Enviar / f360ApagarResposta.
 *
 * O link é individual: o servidor sabe se ESTE link já respondeu (até o encerramento) e mostra "Você já respondeu", com
 * "Responder de novo" (a nova resposta substitui a anterior) e "Apagar a minha resposta". As respostas ficam só na memória da
 * aba até o envio; nada vai para o localStorage/sessionStorage.
 *
 * No Node (testes): require('./js/feedback360-resposta.js') -> { tokenDaUrl, montarEnvio, rotuloProgresso }.
 */
(function (root) {
  'use strict';

  var MSG_LINK = 'Link inválido ou Feedback 360 encerrado. Fale com quem enviou o link.';

  /* ------------------------------------------------------------------ funções puras */

  // Token do link: ?t=<64 hex> ou #t-<64 hex>.
  function tokenDaUrl(search, hash) {
    var m = /[?&]t=([0-9a-fA-F]{64})(?:&|$)/.exec(String(search || ''));
    if (m) return m[1].toLowerCase();
    m = /^#t-([0-9a-fA-F]{64})$/.exec(String(hash || ''));
    return m ? m[1].toLowerCase() : '';
  }

  // Corpo do envio: só o que foi respondido (pulado = fora); comentários só de quem avalia.
  function montarEnvio(respostas, comentarios, segundos, fonte) {
    var itens = {};
    Object.keys(respostas || {}).forEach(function (k) {
      var v = respostas[k];
      if (typeof v === 'number' && isFinite(v)) itens[k] = v;
    });
    var c = { itens: itens };
    if (fonte !== 'auto') {
      var com = {};
      ['AB1', 'AB2'].forEach(function (k) { var t = String((comentarios || {})[k] || '').trim(); if (t) com[k] = t; });
      if (Object.keys(com).length) c.comentarios = com;
    }
    if (typeof segundos === 'number' && isFinite(segundos) && segundos >= 0) c.segundos = Math.round(segundos);
    return c;
  }

  function rotuloProgresso(i, total) { return 'Parte ' + (i + 1) + ' de ' + total; }

  /* ------------------------------------------------------------------ tela */

  function iniciar() {
    var doc = root.document;
    var app = doc.getElementById('app');
    if (!app) return;
    var F = root.DISC_F360;
    var api = root.DISC_API;
    var token = tokenDaUrl(root.location.search, root.location.hash);
    var estado = { info: null, telas: [], tela: -1, respostas: {}, pulados: {}, comentarios: { AB1: '', AB2: '' }, inicio: 0, enviando: false };

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
    function telaMensagem(titulo, texto, extra) {
      trocar(el('section', { classe: 'caixa f360-mensagem surgir' }, [
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
    function nome() { return String((estado.info && estado.info.avaliadoNome) || '').trim(); }
    function fonte() { return estado.info ? estado.info.fonte : ''; }
    function opcoesAviso() {
      var i = estado.info;
      return { empresa: i.empresaNome, nome: i.avaliadoNome, fonte: i.fonte, retencaoDias: i.retencaoDias, contatoDados: i.contatoDados,
        canalTexto: i.canalTexto, encerramentoPrevisto: i.encerramentoPrevisto, duasChefias: i.duasChefias === true,
        baseLegal: root.CONFIG && root.CONFIG.F360_BASE_LEGAL };
    }
    function fimPrevisto() { return F.dataBr(estado.info && estado.info.encerramentoPrevisto); }

    // 1) dados do link
    if (!F || !api || typeof api.f360Publica !== 'function') { telaMensagem('Questionário indisponível', 'Não foi possível abrir o questionário agora. Tente de novo mais tarde.'); return; }
    if (!token) { telaMensagem('Link inválido', MSG_LINK); return; }
    carregar();

    function carregar() {
      Promise.resolve().then(function () { return api.f360Publica(token); }).then(function (info) {
        estado.info = info;
        estado.telas = F.telas(info.fonte);
        selo(info.empresaNome);
        if (info.respondido) return telaJaRespondeu();
        telaAviso();
      }, function (e) {
        var r = e && e.resposta;
        if (r && r.encerrado) telaMensagem('Feedback 360 encerrado', 'Este Feedback 360 já foi encerrado. Obrigado!');
        else telaMensagem('Link inválido', (e && e.message) || MSG_LINK);
      });
    }

    function telaJaRespondeu() {
      var erro = el('p', { classe: 'campo__erro f360-erro', role: 'alert' });
      var confirmar = el('div', { classe: 'f360-confirmar', hidden: true }, [
        el('p', { classe: 'f360-nota', texto: 'Apagar a sua resposta e os seus comentários? Não dá para desfazer.' }),
        el('div', { classe: 'acoes' }, [
          el('button', { type: 'button', classe: 'botao botao--claro', 'data-acao': 'cancelar-apagar', texto: 'Manter a resposta',
            onclick: function () { confirmar.hidden = true; } }),
          el('button', { type: 'button', classe: 'botao botao--principal', 'data-acao': 'confirmar-apagar', texto: 'Apagar a minha resposta',
            onclick: function (ev) {
              var b = ev.currentTarget; b.disabled = true;
              Promise.resolve().then(function () { return api.f360ApagarResposta(token); }).then(function () {
                telaMensagem('Resposta apagada', 'A sua resposta e os seus comentários foram apagados. Se quiser, você ainda pode responder até o encerramento da coleta.', [
                  el('div', { classe: 'acoes' }, el('button', { type: 'button', classe: 'botao botao--principal', 'data-acao': 'refazer', texto: 'Responder agora',
                    onclick: function () { estado.info.respondido = false; telaAviso(); } }))
                ]);
              }, function (e) { b.disabled = false; erro.textContent = (e && e.message) || 'Não foi possível apagar agora. Tente de novo.'; });
            } })
        ])
      ]);
      var fim = fimPrevisto();
      telaMensagem('Você já respondeu', 'Sua resposta por este link já foi registrada. Obrigado!', [
        el('p', { classe: 'f360-nota', texto: 'Até o encerramento da coleta' + (fim ? ' (previsto para ' + fim + ')' : '') +
          ', você pode responder de novo (a nova resposta substitui a anterior) ou apagar a sua resposta. Depois disso, ela deixa de estar ligada a este link.' }),
        el('div', { classe: 'acoes' }, [
          el('button', { type: 'button', classe: 'botao botao--claro', 'data-acao': 'apagar', texto: 'Apagar a minha resposta', onclick: function () { confirmar.hidden = false; } }),
          el('button', { type: 'button', classe: 'botao botao--principal', 'data-acao': 'refazer', texto: 'Responder de novo', onclick: function () { telaAviso(); } })
        ]),
        confirmar,
        erro
      ]);
    }

    // 2) aviso (5.1-a, b ou c) + aceite
    function telaAviso() {
      var f = fonte();
      var aviso = f === 'auto' ? F.avisoLider(opcoesAviso()) : (f === 'chefia' ? F.avisoChefia(opcoesAviso()) : F.avisoAvaliador(opcoesAviso()));
      var marcar = el('input', { id: 'f360-aceite', type: 'checkbox' });
      var seguir = el('button', { type: 'button', classe: 'botao botao--principal botao--grande', 'data-acao': 'continuar', disabled: true, texto: 'Continuar' });
      marcar.addEventListener('change', function () { seguir.disabled = !marcar.checked; });
      seguir.addEventListener('click', function () { if (marcar.checked) telaInstrucao(); });
      var quem = f === 'auto' ? 'Autoavaliação: você responde sobre a sua própria liderança.'
        : (f === 'chefia' ? 'Você responde como chefia de ' + nome() + ': sua resposta aparece identificada.'
          : 'Você responde sobre ' + nome() + ', no grupo ' + F.grupoDaFonte(f) + '.');
      trocar(el('section', { classe: 'caixa f360-aviso surgir', 'aria-labelledby': 'f360-aviso-titulo' }, [
        el('p', { classe: 'sobretitulo', texto: (f === 'chefia' ? 'Identificado' : 'Confidencial') + ' e voluntário · cerca de ' + F.MINUTOS + ' minutos' }),
        el('h1', { classe: 'titulo-pagina', id: 'f360-aviso-titulo', texto: aviso.titulo }),
        el('p', { classe: 'f360-quem', 'data-fonte': f, texto: quem }),
        el('ul', { classe: 'f360-aviso__lista' }, aviso.paragrafos.map(function (p) {
          return el('li', null, [el('strong', { texto: p.rotulo + ' ' }), p.texto]);
        })),
        el('p', { classe: 'f360-nota' }, [el('a', { href: 'privacidade.html', target: '_blank', rel: 'noopener', texto: 'Aviso de privacidade completo' })]),
        el('div', { classe: 'campo consentimento' }, el('label', { classe: 'marcar', for: 'f360-aceite' }, [marcar, el('span', null, el('strong', { texto: aviso.aceite }))])),
        el('div', { classe: 'acoes' }, seguir)
      ]), 'aviso');
    }

    // 3) instrução (treino mínimo de quadro de referência)
    function telaInstrucao() {
      var f = fonte();
      var escala = F.ESCALA.map(function (x) { return x.rotulo; }).concat([(f === 'auto' ? F.OPCAO_FORA_AUTO : F.OPCAO_FORA).rotulo]);
      var comecar = el('button', { type: 'button', classe: 'botao botao--principal botao--grande', 'data-acao': 'comecar', texto: 'Começar' });
      comecar.addEventListener('click', function () { if (!estado.inicio) estado.inicio = Date.now(); irPara(0); });
      var voltar = el('button', { type: 'button', classe: 'botao botao--claro botao--grande', 'data-acao': 'voltar', texto: 'Voltar', onclick: telaAviso });
      trocar(el('section', { classe: 'caixa f360-instrucao surgir', 'aria-labelledby': 'f360-instrucao-titulo' }, [
        el('p', { classe: 'sobretitulo', texto: 'Antes de começar' }),
        el('h1', { classe: 'titulo-pagina', id: 'f360-instrucao-titulo', texto: 'Como responder' }),
        el('p', { classe: 'f360-instrucao__texto', texto: F.INSTRUCAO(f, nome()) }),
        el('div', { classe: 'f360-guia' }, [el('span', { classe: 't-rotulo texto-suave', texto: 'Em cada frase, a pergunta é:' }), el('strong', { texto: F.PERGUNTA_GUIA })]),
        el('ol', { classe: 'f360-legenda', 'aria-label': 'Opções de resposta' }, escala.map(function (r) { return el('li', { texto: r }); })),
        el('p', { classe: 'f360-nota', texto: 'Nenhuma pergunta é obrigatória. Se preferir, toque em "Pular esta pergunta".' }),
        el('div', { classe: 'acoes f360-acoes-instrucao' }, [voltar, comecar])
      ]), 'instrucao');
    }

    // 4) telas (1 tema por tela; "Para fechar"; comentários)
    function irPara(i) { estado.tela = i; telaBloco(); }

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
        el('div', { classe: 'progresso-barra', role: 'progressbar', 'aria-label': 'Progresso do questionário', 'aria-valuemin': '0', 'aria-valuemax': String(total),
          'aria-valuenow': String(i), 'aria-valuetext': rotuloProgresso(i, total) }, [el('span', { classe: 'progresso-trilho trilho' }), feito, ponto])
      ]);
    }

    function pergunta(id) {
      var f = fonte();
      var glb = id === 'GLB1';
      var escala = glb ? F.ESCALA_GLB : F.ESCALA;
      var fora = glb ? null : (f === 'auto' ? F.OPCAO_FORA_AUTO : F.OPCAO_FORA);
      var idTitulo = 'f360-q-' + id;
      var botoes = [];
      var pular;
      function atualizar() {
        botoes.forEach(function (b) { b.setAttribute('aria-pressed', String(estado.respostas[id] === Number(b.getAttribute('data-valor')))); });
        pular.setAttribute('aria-pressed', String(!!estado.pulados[id]));
      }
      function botao(op, classeExtra) {
        var b = el('button', { type: 'button', classe: 'f360-opcao' + (classeExtra ? ' ' + classeExtra : ''), 'data-item': id, 'data-valor': String(op.valor), 'aria-pressed': 'false' }, [
          el('span', { classe: 'escolha-marca', 'aria-hidden': 'true' }),
          el('span', { classe: 'f360-opcao__texto', texto: op.rotulo })
        ]);
        b.addEventListener('click', function () { estado.respostas[id] = op.valor; delete estado.pulados[id]; atualizar(); });
        botoes.push(b);
        return b;
      }
      var grade = el('div', { classe: 'f360-opcoes', role: 'group', 'aria-labelledby': idTitulo }, escala.map(function (op) { return botao(op); }));
      var foraNo = fora ? botao(fora, 'f360-opcao--fora') : null;
      pular = el('button', { type: 'button', classe: 'f360-pular', 'data-acao': 'pular', 'data-item': id, 'aria-pressed': 'false', texto: 'Pular esta pergunta' });
      pular.addEventListener('click', function () { delete estado.respostas[id]; estado.pulados[id] = true; atualizar(); });
      atualizar();
      return el('li', { classe: 'f360-pergunta', 'data-item': id }, [
        el('p', { classe: 'f360-pergunta__texto', id: idTitulo, texto: F.textoItem(id, f, nome()) }),
        grade,
        foraNo ? el('div', { classe: 'f360-fora', role: 'group', 'aria-label': 'Fora da escala' }, foraNo) : null,
        pular
      ]);
    }

    function campoComentario(id) {
      var area = el('textarea', { id: 'f360-' + id, classe: 'entrada f360-comentario', rows: '4', maxlength: String(F.MAX_COMENTARIO),
        'aria-describedby': 'f360-' + id + '-aviso', 'data-comentario': id });
      area.value = estado.comentarios[id] || '';
      area.addEventListener('input', function () { estado.comentarios[id] = area.value; });
      return el('div', { classe: 'campo f360-campo-comentario' }, [
        el('label', { classe: 'campo__rotulo', for: 'f360-' + id, texto: F.textoItem(id, fonte(), nome()) }),
        el('p', { classe: 'f360-aviso-comentario', id: 'f360-' + id + '-aviso', texto: F.AVISO_COMENTARIO(opcoesAviso()) }),
        area
      ]);
    }

    function telaBloco() {
      var i = estado.tela;
      var t = estado.telas[i];
      var ultimo = i === estado.telas.length - 1;
      var conteudo;
      if (t.comentarios) {
        conteudo = el('div', { classe: 'f360-comentarios' }, t.comentarios.map(campoComentario));
      } else {
        conteudo = el('ol', { classe: 'f360-perguntas' }, t.itens.map(pergunta));
      }
      var erro = el('p', { classe: 'campo__erro f360-erro', id: 'f360-erro', role: 'alert' });
      var voltar = el('button', { type: 'button', classe: 'botao botao--claro botao--grande', 'data-acao': 'voltar', texto: 'Voltar' });
      var seguir = el('button', { type: 'button', classe: 'botao botao--principal botao--grande', 'data-acao': ultimo ? 'enviar' : 'proximo', texto: ultimo ? 'Enviar respostas' : 'Continuar' });
      voltar.addEventListener('click', function () { if (i === 0) telaInstrucao(); else irPara(i - 1); });
      seguir.addEventListener('click', function () { if (ultimo) enviar(seguir, erro); else irPara(i + 1); });
      var topo = t.id === 'GLB' ? 'Uma pergunta geral, só para estudar a qualidade do questionário. Ela não aparece no relatório.'
        : (t.comentarios ? 'Opcional. Escreva só o que você diria com respeito, numa conversa.' : F.PERGUNTA_GUIA);
      // Sem a animação "surgir" aqui: o transform que ela deixa prenderia a barra fixa (Voltar/Continuar) dentro do cartão.
      trocar(el('section', { classe: 'caixa f360-bloco', 'data-tela': t.id, 'aria-labelledby': 'f360-bloco-titulo' }, [
        progresso(i),
        el('h1', { classe: 'f360-bloco__titulo', id: 'f360-bloco-titulo', texto: t.titulo }),
        el('p', { classe: 'f360-bloco__topo', texto: topo }),
        conteudo,
        erro,
        el('div', { classe: 'barra-nav' }, [
          el('p', { classe: 'barra-dica', texto: ultimo ? 'Confira e envie quando quiser.' : 'Suas respostas ficam só neste aparelho até o envio.' }),
          el('div', { classe: 'barra-botoes' }, [voltar, seguir])
        ])
      ]), 'bloco');
      avisarLeitor(rotuloProgresso(i, estado.telas.length) + ': ' + t.titulo);
    }

    // 5) envio
    function enviar(botaoEnviar, erro) {
      if (estado.enviando) return;
      var segundos = estado.inicio ? (Date.now() - estado.inicio) / 1000 : null;
      var corpo = montarEnvio(estado.respostas, estado.comentarios, segundos, fonte());
      if (!Object.keys(corpo.itens).length && !corpo.comentarios) {
        erro.textContent = 'Responda pelo menos uma pergunta antes de enviar.';
        return;
      }
      estado.enviando = true;
      botaoEnviar.disabled = true;
      botaoEnviar.textContent = 'Enviando…';
      erro.textContent = '';
      Promise.resolve().then(function () { return api.f360Enviar(token, corpo); }).then(function () {
        estado.respostas = {}; estado.pulados = {}; estado.comentarios = { AB1: '', AB2: '' }; estado.enviando = false; estado.inicio = 0;
        estado.info.respondido = true;
        var fim = fimPrevisto();
        telaMensagem('Respostas enviadas. Obrigado!', fonte() === 'chefia'
          ? 'A sua resposta aparece identificada para ' + nome() + ', depois do encerramento e da conversa com o consultor.'
          : (fonte() === 'auto' ? 'Você vai receber o relatório numa conversa com o consultor da Gestão sem Caos, depois do encerramento.'
            : 'Sua resposta é confidencial: ' + nome() + ' vê só resultados de grupo, depois do encerramento.'), [
          el('p', { classe: 'f360-nota', texto: 'Até o encerramento da coleta' + (fim ? ' (previsto para ' + fim + ')' : '') + ', você pode refazer ou apagar a sua resposta por este mesmo link. Pode fechar esta página.' })
        ]);
        doc.body.setAttribute('data-etapa', 'fim');
      }, function (e) {
        estado.enviando = false;
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = 'Tentar enviar de novo';
        var r = e && e.resposta;
        if (r && r.encerrado) { telaMensagem('Feedback 360 encerrado', 'Este Feedback 360 já foi encerrado antes do envio. Obrigado!'); return; }
        erro.textContent = (e && e.message) || 'Não foi possível enviar. Verifique a internet e tente de novo.';
      });
    }
  }

  var DISC_F360_RESPOSTA = { tokenDaUrl: tokenDaUrl, montarEnvio: montarEnvio, rotuloProgresso: rotuloProgresso, iniciar: iniciar };

  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_F360_RESPOSTA;
  else {
    root.DISC_F360_RESPOSTA = DISC_F360_RESPOSTA;
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', iniciar);
      else iniciar();
    }
  }
})(typeof self !== 'undefined' ? self : this);
