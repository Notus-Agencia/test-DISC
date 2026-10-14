/*
 * Vagas sem Caos — referência profissional, lado da pessoa (eu.html), docs/VAGAS-TELAS.md §2.13, mockups pessoa-referencias,
 * pessoa-referencia-pedir e pessoa-referencia-aceitar. Regras da psicologia (padroes.md §7) e decisões P1/P2 do dono:
 *   - carta sem estrelas, sem nota, sem média; pontos fortes só da lista fechada (peça VAGAS_PECAS.cartaReferencia);
 *   - aceitar / recusar / ocultar / mostrar / remover NUNCA avisam a empresa (a tela diz isso);
 *   - "Mostrar minhas referências numa página pública" é fase 2 (decisão 5): interruptor desligado, "em breve", sem link.
 *   #referencias        lista (pendentes primeiro), pedidos enviados (copiar link), aviso do que a empresa vê antes/depois do Combinou
 *   #referencia/pedir   CNPJ ou nome da empresa -> convite (link completo a partir desta página) para copiar ou mandar no WhatsApp
 *   #referencia/<id>    ler e decidir (pendente) com o aceite pessoa_referencia_aceitar; denunciar a referência
 */
(function (root) {
  'use strict';
  var TELAS = root.VAGAS_EU_TELAS = root.VAGAS_EU_TELAS || {};

  function base() { return { U: root.VAGAS_UI, A: root.VAGAS_API, P: root.VAGAS_PECAS, L: root.VAGAS_EU_LOGICA, R: root.VAGAS_REGRAS, T: root.VAGAS_TEXTOS }; }
  function aceite(T, chave) { return (T && T.consentimentos && T.consentimentos.aceites && T.consentimentos.aceites[chave]) || {}; }
  function preencher(t, nome) { return String(t || '').replace(/\{\{\s*empresa_nome\s*\}\}/g, nome); }

  // ------------------------------------------------------------------------------------------------- lista
  TELAS.referencias = function (ctx) {
    var b = base(), U = b.U, A = b.A, P = b.P, L = b.L, el = U.el;
    ctx.titulo('Referências');
    var corpo = el('div', { id: 'vg-ref-corpo' });
    U.trocar(ctx.app, [ctx.cabecalho({ voltar: { href: '#dados', rotulo: 'Eu' }, titulo: 'Referências', idTitulo: 'vg-ref-lista-titulo', subtitulo: U.t('avisos.referencia_o_que_e') }),
      el('a', { class: 'botao botao--principal botao--grande botao--bloco', href: '#referencia/pedir', id: 'vg-ref-novo-pedido' }, [U.icone('mais'), 'Pedir referência a uma empresa']),
      corpo]);
    ctx.nav('eu');
    U.carregando(corpo);
    function recarregar() { TELAS.referencias(ctx); }
    A.minhasReferencias().then(function (r) {
      ctx.refsPendentes = (r.referencias || []).filter(function (x) { return x.status === 'pendente'; }).length;
      ctx.nav('eu');
      desenhar(r);
    }, function (e) { U.tratarErro(e, { raiz: corpo, aoTentar: recarregar }); });

    function desenhar(r) {
      var refs = r.referencias || [];
      var convites = r.convites || [];
      U.trocar(corpo, [
        el('section', { id: 'vg-ref-lista', 'aria-labelledby': 'vg-ref-lista-titulo', class: 'vg-eu-bloco' }, refs.length
          ? el('ul', { class: 'vg-refs' }, refs.map(function (x) { return el('li', {}, carta(x)); }))
          : el('p', { class: 'aviso', id: 'vg-ref-vazio' }, 'Você ainda não tem referência. ' + U.t('avisos.referencia_pedir'))),
        convites.length ? el('section', { class: 'caixa caixa--compacta vg-eu-bloco', id: 'vg-ref-convites', 'aria-labelledby': 'vg-ref-convites-titulo' }, [
          el('h2', { class: 'vg-eu-h2', id: 'vg-ref-convites-titulo' }, 'Pedidos enviados'),
          el('ul', { class: 'vg-lista-itens' }, convites.map(convite))]) : null,
        el('p', { class: 't-rotulo texto-medio vg-eu-bloco', id: 'vg-ref-aviso-combinou' }, U.t('avisos.referencia_cartao_cego')),
        publicar()
      ]);
    }
    function carta(x) {
      var st = L.statusReferencia(x);
      var acoes = [el('span', { class: 'vg-status vg-status--' + st.classe, data: { status: x.status } }, st.texto)];
      if (x.textoStatus === 'pendente' || x.textoStatus === 'nao_publicado') {
        acoes.push(el('p', { class: 't-nota texto-suave vg-eu-largura-toda' }, (U.t('referencia.texto_status.' + x.textoStatus) || '') + (x.textoMotivo ? ': ' + x.textoMotivo : '')));
      }
      if (x.status === 'pendente') {
        acoes.push(el('a', { class: 'botao botao--principal', href: '#referencia/' + encodeURIComponent(x.id), data: { acao: 'ler' } }, 'Ler e decidir'));
      } else {
        if (x.status === 'aceita') acoes.push(el('button', { type: 'button', class: 'botao botao--claro', data: { acao: 'ocultar' }, onclick: function (ev) { responder(x, 'ocultar', ev.currentTarget); } }, U.t('botoes.referencia_ocultar') || 'Ocultar'));
        if (x.status === 'ocultada') acoes.push(el('button', { type: 'button', class: 'botao botao--claro', data: { acao: 'mostrar' }, onclick: function (ev) { responder(x, 'mostrar', ev.currentTarget); } }, U.t('botoes.referencia_mostrar') || 'Mostrar de novo'));
        acoes.push(el('button', { type: 'button', class: 'botao botao--perigo', data: { acao: 'remover' }, onclick: function () { remover(x); } }, 'Remover'));
      }
      return P.cartaReferencia(x, { pendente: x.status === 'pendente', acoes: acoes });
    }
    function responder(x, acao, botao) {
      U.ocupado(botao, true);
      A.responderReferencia(x.id, acao).then(function () {
        U.avisar(acao === 'ocultar' ? U.t('avisos.referencia_ocultada') : 'Referência visível de novo para as empresas com quem você combinar.', { tipo: 'ok', ms: 6000 });
        recarregar();
      }, function (e) { U.ocupado(botao, false); U.tratarErro(e); });
    }
    function remover(x) {
      U.confirmar({ id: 'vg-confirmar-remover-ref', titulo: 'Remover esta referência?', texto: 'Ela some do seu cartão e do perfil; a empresa não é avisada.', sim: 'Remover', perigo: true })
        .then(function (sim) {
          if (!sim) return;
          A.responderReferencia(x.id, 'remover').then(function () {
            U.avisar(U.t('avisos.referencia_excluida'), { tipo: 'ok', ms: 6000 });
            recarregar();
          }, function (e) { U.tratarErro(e); });
        });
    }
    function convite(c) {
      var link = c.caminho ? L.linkCompleto(c.caminho, root.location.href) : '';
      var sub = c.status === 'aberto' ? 'esperando a empresa · pedido em ' + U.dataCurta(c.criadoEm) + ' · vale até ' + U.dataCurta(c.expiraEm)
        : c.status === 'usado' ? 'a empresa respondeu' : 'pedido vencido';
      return el('li', { class: 'vg-item', data: { convite: c.id } }, [
        el('div', { class: 'vg-item__texto' }, [el('p', { class: 'vg-item__titulo' }, c.empresaNome), el('p', { class: 'vg-item__sub' }, sub)]),
        link ? el('button', { type: 'button', class: 'botao botao--claro', data: { acao: 'copiar' }, onclick: function () {
          U.copiar(link).then(function () { U.avisar('Copiado', { tipo: 'ok' }); }, function (e) { U.avisar(e.message, { tipo: 'erro' }); });
        } }, [U.icone('copiar'), 'Copiar link']) : null]);
    }
    // Fase 2 (decisão 5 do dono): só o interruptor desligado, sem link e sem chamar vagas_referencias_publicar.
    function publicar() {
      return el('div', { class: 'consentimento vg-eu-bloco', id: 'vg-ref-publicar-campo' }, [
        el('label', { class: 'marcar', for: 'vg-ref-publicar' }, [el('input', { type: 'checkbox', id: 'vg-ref-publicar', disabled: true, 'aria-describedby': 'vg-ref-publicar-nota' }),
          el('span', { class: 't-rotulo' }, ['Mostrar minhas referências numa página pública ', el('span', { class: 'vg-etiqueta' }, 'em breve')])]),
        el('p', { class: 'consentimento__explicacao', id: 'vg-ref-publicar-nota' }, 'Fica para a próxima fase. Por enquanto, as referências aparecem só para as empresas com quem você combinar.')]);
    }
    return null;
  };

  // ------------------------------------------------------------------------------------------------- pedir
  TELAS.pedirReferencia = function (ctx) {
    var b = base(), U = b.U, A = b.A, L = b.L, R = b.R, T = b.T, el = U.el;
    ctx.titulo('Pedir referência');
    var c = aceite(T, 'pessoa_referencia_pedir');
    var empresa = el('input', { id: 'vg-ref-pedir-empresa', class: 'entrada', type: 'text', maxlength: '120', autocomplete: 'organization', 'aria-describedby': 'vg-ref-pedir-empresa-ajuda' });
    var cnpj = el('input', { id: 'vg-ref-pedir-cnpj', class: 'entrada', type: 'text', inputmode: 'numeric', maxlength: '18', autocomplete: 'off', placeholder: '00.000.000/0001-00', 'aria-describedby': 'vg-ref-pedir-cnpj-ajuda' });
    var textoAceite = el('p', { class: 't-rotulo', id: 'vg-ref-pedir-aceite' });
    function atualizarAceite() { textoAceite.textContent = preencher(c.texto, R.limparTexto(empresa.value, 120) || 'esta empresa'); }
    empresa.addEventListener('input', function () { U.limparErroCampo(empresa); atualizarAceite(); });
    cnpj.addEventListener('input', function () { U.limparErroCampo(cnpj); });
    atualizarAceite();
    var enviar = el('button', { type: 'submit', class: 'botao botao--laranja botao--grande botao--bloco', id: 'vg-ref-pedir-enviar' }, 'Gerar o convite');
    var resultado = el('div', { id: 'vg-ref-convite', class: 'vg-eu-bloco', hidden: true, 'aria-live': 'polite' });
    var form = el('form', { class: 'formulario', id: 'vg-ref-form-pedir', novalidate: true }, [
      el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-ref-pedir-empresa' }, 'Empresa'), empresa,
        el('span', { class: 'campo__ajuda', id: 'vg-ref-pedir-empresa-ajuda' }, 'A empresa preenche função e período. Se ela ainda não estiver no Vagas sem Caos, se cadastra pelo próprio convite.')]),
      el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-ref-pedir-cnpj' }, ['CNPJ da empresa', el('span', { class: 'obrigatorio' }, ' (se souber)')]), cnpj,
        el('span', { class: 'campo__ajuda', id: 'vg-ref-pedir-cnpj-ajuda' }, 'Com o CNPJ, só essa empresa consegue abrir o convite.')]),
      el('div', { class: 'consentimento', id: 'vg-ref-pedir-consentimento' }, textoAceite),
      enviar]);
    U.trocar(ctx.app, [el('a', { class: 'botao botao--link vg-voltar', href: '#referencias', id: 'vg-voltar' }, [U.icone('voltar'), 'Referências']),
      el('section', { class: 'caixa', id: 'vg-ref-pedir', 'aria-labelledby': 'vg-ref-pedir-titulo' }, [
        el('p', { class: 'sobretitulo' }, 'Referência profissional'),
        el('h1', { class: 'titulo-pagina', id: 'vg-ref-pedir-titulo', tabindex: '-1' }, 'Pedir referência'),
        el('p', { class: 'subtitulo' }, U.t('avisos.referencia_pedir')),
        form, resultado])]);
    ctx.nav('eu');

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var nome = R.limparTexto(empresa.value, 120);
      var numero = R.normalizarCnpj(cnpj.value);
      var erro = false;
      if (numero && !R.cnpjValido(numero)) { U.erroCampo(cnpj, 'CNPJ inválido. Confira os números.'); erro = true; }
      if (!numero && nome.length < 2) { U.erroCampo(empresa, 'Informe o nome da empresa.'); erro = true; }
      if (erro) { form.querySelector('[aria-invalid="true"]').focus(); return; }
      var dados = {};
      if (numero) dados.cnpj = numero;
      if (nome) dados.empresaNome = nome;
      U.ocupado(enviar, true, 'Gerando…');
      A.pedirReferencia(dados).then(function (r) {
        U.ocupado(enviar, false);
        mostrar(r.convite);
        empresa.value = ''; cnpj.value = ''; atualizarAceite();
      }, function (e) {
        U.ocupado(enviar, false);
        if (e.sessaoExpirada || e.confirmar || e.suspensa) { U.tratarErro(e); return; }
        U.erroCampo(/CNPJ/.test(e.message) ? cnpj : empresa, e.message);
        (/CNPJ/.test(e.message) ? cnpj : empresa).focus();
      });
    });
    function mostrar(cv) {
      var link = L.linkCompleto(cv.caminho, root.location.href);
      var msg = L.mensagemPedido(cv.empresaNome, link);
      var campoLink = el('input', { id: 'vg-ref-convite-link', class: 'entrada vg-eu-link', type: 'text', readOnly: true, value: link });
      campoLink.addEventListener('focus', function () { campoLink.select(); });
      U.trocar(resultado, el('div', { class: 'aviso aviso--ok' }, [
        el('p', { class: 'seminegrito' }, 'Convite criado. Vale 30 dias; você vê aqui quando a empresa responder.'),
        el('div', { class: 'campo vg-eu-aviso' }, [el('label', { class: 'campo__rotulo', for: 'vg-ref-convite-link' }, 'Link do convite para ' + cv.empresaNome),
          el('div', { class: 'vg-eu-linha-dupla' }, [campoLink, el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-ref-convite-copiar', onclick: function () {
            U.copiar(link).then(function () { U.avisar('Copiado', { tipo: 'ok' }); }, function (e) { U.avisar(e.message, { tipo: 'erro' }); });
          } }, [U.icone('copiar'), 'Copiar'])]),
          el('span', { class: 'campo__ajuda' }, 'Vale até ' + U.data(cv.expiraEm) + '.')]),
        el('div', { class: 'acoes acoes-coluna' }, el('a', { class: 'botao botao--claro botao--grande', id: 'vg-ref-pedir-whatsapp', href: U.compartilharWhatsapp(msg), target: '_blank', rel: 'noopener noreferrer' },
          [U.icone('whatsapp'), 'Mandar o convite por WhatsApp'])),
        el('p', { class: 't-nota texto-suave', id: 'vg-ref-pedir-mensagem' }, 'Mensagem pronta: "' + msg + '"')]));
      resultado.hidden = false;
      U.anunciar('Convite criado.');
      var ok = root.document.getElementById('vg-ref-convite-copiar');
      if (ok) ok.focus();
    }
    return null;
  };

  // ------------------------------------------------------------------------------------------------- ler e decidir
  TELAS.referencia = function (ctx, id) {
    var b = base(), U = b.U, A = b.A, P = b.P, L = b.L, T = b.T, el = U.el;
    ctx.titulo('Referência');
    var raiz = el('div', { id: 'vg-ref-receber-raiz' });
    U.trocar(ctx.app, [el('a', { class: 'botao botao--link vg-voltar', href: '#referencias', id: 'vg-voltar' }, [U.icone('voltar'), 'Referências']), raiz]);
    ctx.nav('eu');
    U.carregando(raiz);
    A.minhasReferencias().then(function (r) {
      var x = (r.referencias || []).filter(function (y) { return y.id === id; })[0];
      if (!x) { U.vazio(raiz, { titulo: 'Referência não encontrada.', h1: true, texto: 'Ela pode ter sido removida.', botao: { rotulo: 'Ver referências', href: '#referencias' } }); U.focarTitulo(raiz); return; }
      desenhar(x);
    }, function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { TELAS.referencia(ctx, id); } }); });

    function desenhar(x) {
      var nome = (x.empresa && x.empresa.nome) || 'A empresa';
      var pendente = x.status === 'pendente';
      var c = aceite(T, 'pessoa_referencia_aceitar');
      var st = L.statusReferencia(x);
      U.trocar(raiz, el('section', { id: 'vg-ref-receber', 'aria-labelledby': 'vg-ref-receber-titulo' }, [
        el('p', { class: 'sobretitulo' }, 'Referência profissional'),
        el('h1', { class: 'titulo-pagina', id: 'vg-ref-receber-titulo', tabindex: '-1' }, pendente ? nome + ' deu uma referência para você' : 'Referência de ' + nome),
        el('p', { class: 'subtitulo' }, pendente ? U.t('avisos.referencia_so_se_aceitar') : 'Situação: ' + st.texto + '.'),
        el('div', { class: 'vg-eu-bloco' }, P.cartaReferencia(x, { pendente: pendente, id: 'vg-ref-carta' })),
        pendente ? el('div', { class: 'consentimento vg-eu-bloco', id: 'vg-ref-aceite' }, [el('p', { class: 't-rotulo' }, preencher(c.texto, nome)),
          c.explicacao ? el('p', { class: 'consentimento__explicacao vg-eu-sem-recuo' }, L.semMarcador(c.explicacao)) : null]) : null,
        pendente ? el('div', { class: 'acoes acoes-coluna' }, [
          el('button', { type: 'button', class: 'botao botao--laranja botao--grande', id: 'vg-ref-aceitar', onclick: function (ev) { aceitar(x, nome, ev.currentTarget); } }, 'Aceitar e mostrar'),
          el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-ref-recusar', onclick: function () { recusar(x); } }, 'Não quero mostrar')])
          : el('div', { class: 'acoes acoes-coluna' }, el('a', { class: 'botao botao--claro botao--grande', href: '#referencias' }, 'Ver todas as referências')),
        el('p', { class: 't-nota texto-suave vg-eu-bloco centro-texto', id: 'vg-ref-denunciar-linha' }, ['Algo errado no texto? ',
          el('button', { type: 'button', class: 'botao botao--link vg-eu-link-inline', id: 'vg-ref-denunciar', onclick: function () { P.janelaDenuncia({ alvo: 'referencia', id: x.id }); } }, 'Denunciar a referência'),
          '. A empresa não vê se você recusou.'])
      ]));
      U.focarTitulo(raiz);
    }
    function aceitar(x, nome, botao) {
      U.ocupado(botao, true, 'Salvando…');
      A.responderReferencia(x.id, 'aceitar').then(function () {
        U.avisar(U.t('avisos.referencia_aceita', { empresa_nome: nome }), { tipo: 'ok', ms: 8000 });
        ctx.recarregarConta().catch(function () { return null; }).then(function () { ctx.ir('referencias'); });
      }, function (e) { U.ocupado(botao, false); U.tratarErro(e); });
    }
    function recusar(x) {
      U.confirmar({ id: 'vg-confirmar-recusar-ref', titulo: 'Não mostrar esta referência?', texto: 'Ela não aparece para ninguém, e a empresa que deixou a referência não fica sabendo. Não dá para aceitar depois.',
        sim: 'Não quero mostrar', perigo: true }).then(function (sim) {
        if (!sim) return;
        A.responderReferencia(x.id, 'recusar').then(function () {
          U.avisar(U.t('avisos.referencia_recusada'), { tipo: 'ok', ms: 6000 });
          ctx.recarregarConta().catch(function () { return null; }).then(function () { ctx.ir('referencias'); });
        }, function (e) { U.tratarErro(e); });
      });
    }
    return null;
  };
})(typeof self !== 'undefined' ? self : this);
