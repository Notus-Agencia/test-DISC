/*
 * Vagas sem Caos — componente de conversa pela plataforma (VAGAS_CONVERSA), o MESMO para a pessoa (eu.html#conversa/<id>) e para a
 * empresa (empresa.html#conversa/<id>). UMD; carregue depois de regras.js, textos.js, api.js, ui.js, ui-area.js e pecas.js.
 * Sem tempo real: consulta vagas_conversa a cada 20 s com a tela visível. Mensagem com id gerado no aparelho (reenviar não duplica),
 * rascunho no aparelho, mensagem bloqueada pelo filtro mostra o erro como vem do banco e o texto fica no campo para reescrever.
 *
 * CONTRATO (as frentes pessoa e empresa plugam as ações próprias de cada lado pelos ganchos; o componente não chama combinar,
 * recusar, contatoPessoa nem marcarContratada):
 *
 *   var c = VAGAS_CONVERSA.montar(raiz, {
 *     lado: 'pessoa' | 'empresa',            // obrigatório
 *     candidaturaId: '<uuid>',               // obrigatório
 *     voltar: {href: 'eu.html#candidaturas', rotulo: 'Candidaturas'},   // botão de voltar no cabeçalho (opcional)
 *     cabecalho: function (resp) { return {nome, sub, foto: Element} },  // troca nome/linha/foto do cabeçalho (opcional;
 *                                            // padrão: resp.outroLado + vaga + situação; a empresa põe a foto SÓ depois do Combinou)
 *     antes: function (ctx) { return Node },  // bloco acima das mensagens (ex.: o convite da pessoa com "Combinou: liberar meu contato")
 *     acoes: function (ctx) { return Node | [Node] },  // abaixo das mensagens (WhatsApp, contato liberado, Contratada, roteiro…)
 *     whatsapp: {numero, texto},             // atalho: monta #vg-conversa-whatsapp (wa.me só com dígitos)
 *     somenteLeitura: 'texto',               // força só leitura com esta faixa (ex.: empresa suspensa)
 *     aoMudar: function (estado, resp) {},   // a cada mudança de situação (status, modo, podeEscrever)
 *     aoDenunciar: function (mensagem) {},   // padrão: janela de denúncia da última mensagem do outro lado
 *     intervaloMs: 20000, api: VAGAS_API, h1: true (nome do cabeçalho é o h1 da tela)
 *   });
 *   c.atualizar() -> Promise · c.parar() (pare ao sair da rota) · c.estado() · c.resposta() · c.enviar(texto) -> Promise
 *   ctx (dos ganchos) = {lado, estado, resposta, atualizar}
 *
 *   estado = {modo, podeEscrever, faixa, status}; modo: 'sem_conversa' (a empresa ainda não escreveu), 'convite' (status
 *   conversar: a pessoa ainda não liberou o contato), 'aberta' (enviada, lado empresa), 'combinou', 'contratada', 'cortado'
 *   (a pessoa deixou de compartilhar o contato), 'encerrada' (conversa fechada, retirada, recusada, agora não), 'somente_leitura'.
 *
 * Funções puras (testes): estadoDe(resp, lado, {somenteLeitura}) · linhasDe(mensagens) · mesclar(atuais, novas) ·
 *   validarTexto(texto) -> '' | erro (mesmo filtro do banco, VAGAS_REGRAS.conferirTexto 'mensagem').
 * Ids: #vg-conversa, #vg-conversa-nome, #vg-mensagens, #vg-conversa-acoes, #vg-conversa-whatsapp, #vg-form-mensagem,
 *   #vg-mensagem-texto, #vg-mensagem-enviar, #vg-mensagem-rascunho, #vg-mensagem-contador, #vg-conversa-bloqueio, #vg-conversa-faixa.
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var R = nodeJs ? require('./regras.js') : root.VAGAS_REGRAS;
  var MAX = 1000;
  // Linha fixa de proteção na conversa (docs/VAGAS-TELAS.md §2.10, lado da pessoa); a da empresa vem de mensagem.aviso_empresa.
  var BLOQUEIO_PESSOA = 'Pedidos de dinheiro, Pix ou documento não passam por aqui. Algo estranho?';
  var ENCERRADOS = ['retirada', 'recusada', 'agora_nao'];

  function texto(caminho, reserva) {
    var T = root.VAGAS_TEXTOS || (nodeJs ? require('./textos.js') : null);
    var t = T && T.t ? T.t(caminho) : '';
    return t || reserva || '';
  }

  // ------------------------------------------------------------------------------------------------- lógica pura
  function estadoDe(resp, lado, op) {
    op = op || {};
    resp = resp || {};
    var st = resp.status || '';
    var conversa = resp.conversa || null;
    var e = { status: st, modo: 'aberta', podeEscrever: !!resp.podeEscrever, faixa: '' };
    if (op.somenteLeitura) { e.modo = 'somente_leitura'; e.faixa = op.somenteLeitura; }
    else if (resp.contatoCortado) {
      e.modo = 'cortado';
      e.faixa = lado === 'pessoa' ? texto('mensagem.conversa_encerrada_pessoa') : texto('avisos.contato_cortado_conversa');
    } else if ((conversa && conversa.status === 'encerrada') || ENCERRADOS.indexOf(st) >= 0) {
      e.modo = 'encerrada';
      e.faixa = texto('mensagem.conversa_encerrada', 'Conversa encerrada.');
    } else if (!conversa && lado === 'pessoa') {
      e.modo = 'sem_conversa';
      e.faixa = 'A empresa ainda não abriu uma conversa.';
    } else if (st === 'conversar') e.modo = 'convite';
    else if (st === 'combinou') e.modo = 'combinou';
    else if (st === 'contratada') e.modo = 'contratada';
    if (['somente_leitura', 'cortado', 'encerrada', 'sem_conversa'].indexOf(e.modo) >= 0) e.podeEscrever = false;
    return e;
  }
  function linhasDe(mensagens, formatar) {
    var fmt = formatar || function (iso) { return iso; };
    return (mensagens || []).map(function (m) {
      var sistema = m.autor === 'sistema';
      return { id: m.id, texto: String(m.texto || ''), sistema: sistema, minha: !sistema && !!m.minha, pendente: !!m.pendente,
        classe: 'vg-msg' + (sistema ? ' vg-msg--sistema' : m.minha ? ' vg-msg--minha' : '') + (m.pendente ? ' vg-msg--pendente' : ''),
        hora: sistema ? '' : (m.pendente ? (m.semInternet ? 'Sem internet. Vamos enviar assim que voltar.' : 'Enviando…') : fmt(m.em)) };
    });
  }
  // Junta as mensagens do servidor com as que ainda estão saindo deste aparelho (as pendentes ficam no fim até o servidor confirmar).
  function mesclar(servidor, pendentes) {
    var ids = {};
    (servidor || []).forEach(function (m) { ids[m.id] = true; });
    return (servidor || []).concat((pendentes || []).filter(function (p) { return !ids[p.id]; }));
  }
  function validarTexto(t) {
    var s = R.limparMultilinha(t, 2 * MAX);
    if (!s) return 'Escreva a mensagem.';
    if (s.length > MAX) return 'A mensagem pode ter até 1.000 caracteres.';
    var c = R.conferirTexto(s, 'mensagem');
    return c ? c.erro : '';
  }

  // ------------------------------------------------------------------------------------------------- montagem
  function montar(raiz, op) {
    op = op || {};
    var U = root.VAGAS_UI;
    var P = root.VAGAS_PECAS;
    var A = op.api || root.VAGAS_API;
    var el = U.el;
    var lado = op.lado === 'empresa' ? 'empresa' : 'pessoa';
    var candId = String(op.candidaturaId || '');
    var resp = null;
    var est = null;
    var pendentes = [];
    var vivo = true;
    var temporizador = null;
    var rasc = U.rascunho('conversa.' + candId);
    var assinatura = '';
    var assinaturaMsgs = '';

    var nome = el(op.h1 === false ? 'p' : 'h1', { class: 'vg-conversa__nome', id: 'vg-conversa-nome', tabindex: op.h1 === false ? null : '-1' }, '');
    var sub = el('p', { class: 'vg-conversa__vaga' });
    var foto = el('span', {});
    var cab = el('div', { class: 'vg-conversa__cab' }, [
      op.voltar ? el('a', { class: 'botao botao--icone botao--claro', href: op.voltar.href, 'aria-label': 'Voltar para ' + (op.voltar.rotulo || 'a lista') }, U.icone('voltar')) : null,
      foto, el('div', { class: 'vg-conversa__quem' }, [nome, sub])]);
    var antes = el('div', { id: 'vg-conversa-antes' });
    var faixa = el('p', { class: 'aviso vg-conversa__faixa', id: 'vg-conversa-faixa', role: 'status', hidden: true });
    var lista = el('ul', { class: 'vg-mensagens', id: 'vg-mensagens', role: 'log', 'aria-live': 'polite', 'aria-label': 'Mensagens' });
    var acoes = el('div', { class: 'vg-conversa__acoes', id: 'vg-conversa-acoes', hidden: true });
    var campo = el('textarea', { id: 'vg-mensagem-texto', class: 'entrada', rows: '2', maxlength: String(MAX), placeholder: 'Escrever mensagem', autocomplete: 'off',
      'aria-describedby': 'vg-mensagem-contador' });
    var enviarBtn = el('button', { type: 'submit', class: 'botao botao--principal', id: 'vg-mensagem-enviar' }, 'Enviar');
    var rascunhoInfo = el('span', { id: 'vg-mensagem-rascunho', 'aria-live': 'polite' });
    var cont = el('span', { id: 'vg-mensagem-contador' }, '0 de ' + MAX);
    var form = el('form', { class: 'vg-escrever', id: 'vg-form-mensagem', novalidate: true, hidden: true }, [
      el('label', { class: 'visualmente-oculto', for: 'vg-mensagem-texto' }, 'Mensagem'), campo, enviarBtn,
      el('div', { class: 'vg-escrever__info' }, [rascunhoInfo, cont])]);
    var denunciarBtn = el('button', { type: 'button', class: 'botao botao--link', id: 'vg-conversa-denunciar', onclick: denunciar }, 'Denunciar');
    var bloqueio = el('p', { class: 'vg-bloqueio', id: 'vg-conversa-bloqueio' }, [
      lado === 'pessoa' ? BLOQUEIO_PESSOA : texto('mensagem.aviso_empresa'), ' ', denunciarBtn]);
    var secao = el('section', { class: 'caixa caixa--compacta', id: 'vg-conversa', 'aria-labelledby': 'vg-conversa-nome', data: { candidatura: candId, lado: lado } },
      [cab, antes, faixa, lista, acoes, form, bloqueio]);
    U.trocar(raiz, [secao, lado === 'pessoa' ? el('div', { class: 'vg-entrada__golpe' }, P.golpe({ id: 'vg-aviso-golpe' })) : null]);

    // Rascunho: volta o que estava escrito neste aparelho.
    var guardado = rasc.ler();
    if (guardado && guardado.dados && typeof guardado.dados.texto === 'string' && guardado.dados.texto) {
      campo.value = guardado.dados.texto;
      U.mostrarRascunho(rascunhoInfo, U.hora(new Date(guardado.em).toISOString()));
    }
    var salvarRascunho = U.aoParar(function () {
      if (!campo.value.trim()) { rasc.apagar(); U.mostrarRascunho(rascunhoInfo, ''); return; }
      var g = rasc.ler();
      var id = g && g.dados && g.dados.id && g.dados.texto === campo.value ? g.dados.id : null;
      U.mostrarRascunho(rascunhoInfo, rasc.gravar(id ? { texto: campo.value, id: id } : { texto: campo.value }).hora);
    }, 600);
    campo.addEventListener('input', function () {
      cont.textContent = campo.value.length + ' de ' + MAX;
      U.limparErroCampo(campo);
      salvarRascunho();
    });
    campo.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); form.requestSubmit ? form.requestSubmit() : enviarDoCampo(); }
    });
    form.addEventListener('submit', function (ev) { ev.preventDefault(); enviarDoCampo(); });

    function ctx() { return { lado: lado, estado: est, resposta: resp, atualizar: atualizar }; }
    function desenharMensagens() {
      var linhas = linhasDe(mesclar(resp ? resp.mensagens : [], pendentes), U.dataHora);
      U.trocar(lista, linhas.map(function (l) {
        return el('li', { class: l.classe, data: { mensagem: l.id } }, [l.texto, l.hora ? el('span', { class: 'vg-msg__hora' }, l.hora) : null]);
      }));
      var ultimaOutra = (resp && resp.mensagens || []).filter(function (m) { return m.autor !== 'sistema' && !m.minha; }).pop();
      denunciarBtn.hidden = !ultimaOutra;
    }
    function desenharSituacao() {
      var c = op.cabecalho ? op.cabecalho(resp) || {} : {};
      nome.textContent = c.nome || resp.outroLado || '';
      var titulo = resp.anuncio && resp.anuncio.titulo ? resp.anuncio.titulo : '';
      U.trocar(sub, c.sub ? c.sub : [titulo, titulo ? ' · ' : '', P.status('candidatura', resp.status, { lado: lado })]);
      U.trocar(foto, c.foto || (lado === 'pessoa' ? P.iniciais(resp.outroLado, { confidencial: resp.outroLado === 'Empresa confidencial' }) : P.iniciais('', { confidencial: true })));
      faixa.hidden = !est.faixa;
      faixa.textContent = est.faixa || '';
      form.hidden = !est.podeEscrever;
      U.trocar(antes, op.antes ? op.antes(ctx()) : null);
      var extras = [];
      if (op.whatsapp && op.whatsapp.numero && (est.modo === 'combinou' || est.modo === 'contratada')) {
        extras.push(el('a', { class: 'botao botao--principal botao--grande', id: 'vg-conversa-whatsapp', href: U.whatsapp(op.whatsapp.numero, op.whatsapp.texto),
          target: '_blank', rel: 'noopener noreferrer' }, [U.icone('whatsapp'), 'Chamar no WhatsApp']));
      }
      if (op.acoes) extras = extras.concat(op.acoes(ctx()) || []);
      U.trocar(acoes, extras);
      acoes.hidden = !acoes.firstChild;
    }
    // Situação (cabeçalho, faixa, ganchos) só é redesenhada quando muda; as mensagens, quando chegam novas.
    function aplicar(r) {
      resp = r;
      est = estadoDe(r, lado, { somenteLeitura: op.somenteLeitura });
      var sit = JSON.stringify([est.modo, est.podeEscrever, est.status, est.faixa]);
      var msgs = JSON.stringify((r.mensagens || []).map(function (m) { return m.id; }));
      if (sit !== assinatura) {
        assinatura = sit;
        desenharSituacao();
        if (op.aoMudar) op.aoMudar(est, resp);
      }
      if (msgs !== assinaturaMsgs) { assinaturaMsgs = msgs; desenharMensagens(); }
      return r;
    }
    function atualizar() {
      if (!vivo) return Promise.resolve(resp);
      return A.conversa(candId).then(function (r) { U.faixaOffline(false); return aplicar(r); }, function (e) {
        if (e.conexao) { U.faixaOffline(true); return resp; }
        if (!resp) { U.tratarErro(e, { raiz: raiz, aoTentar: atualizar }); return null; }
        if (e.sessaoExpirada || e.suspensa) U.tratarErro(e);
        return resp;
      });
    }
    function enviarDoCampo() {
      var t = campo.value;
      var erro = validarTexto(t);
      if (erro) { U.erroCampo(campo, erro); campo.focus(); return Promise.resolve(false); }
      return enviar(t);
    }
    // Envia com o id gerado no aparelho; se a internet cair, a mensagem fica pendente e sai sozinha quando a conexão voltar.
    function enviar(t, pendenteExistente) {
      var p = pendenteExistente;
      if (!p) {
        // O id do aparelho só é reaproveitado quando o texto é o mesmo de um envio que pode ter chegado (repetir não duplica).
        var g = rasc.ler();
        var limpo = R.limparMultilinha(t, MAX);
        var idAnterior = g && g.dados && g.dados.id && g.dados.texto === limpo ? g.dados.id : '';
        p = { id: idAnterior || U.novoId(), autor: lado, texto: limpo, minha: true, pendente: true };
        pendentes.push(p);
        campo.value = '';
        cont.textContent = '0 de ' + MAX;
        rasc.gravar({ texto: p.texto, id: p.id, enviando: true });
      }
      p.semInternet = false;
      desenharMensagens();
      U.ocupado(enviarBtn, true);
      return A.enviarMensagem(candId, p.texto, p.id).then(function () {
        pendentes = pendentes.filter(function (x) { return x !== p; });
        rasc.apagar();
        U.mostrarRascunho(rascunhoInfo, '');
        U.ocupado(enviarBtn, false);
        U.anunciar('Mensagem enviada.');
        return atualizar().then(function () { return true; });
      }, function (e) {
        U.ocupado(enviarBtn, false);
        if (e.conexao) { p.semInternet = true; desenharMensagens(); return false; }
        pendentes = pendentes.filter(function (x) { return x !== p; });
        desenharMensagens();
        // Bloqueada ou recusada: o texto volta ao campo para reescrever; mensagem bloqueada não vira rascunho.
        campo.value = p.texto;
        cont.textContent = campo.value.length + ' de ' + MAX;
        if (e.bloqueada) rasc.apagar(); else rasc.gravar({ texto: p.texto, id: p.id });
        if (e.sessaoExpirada || e.confirmar) { U.tratarErro(e); return false; }
        if (e.suspensa || e.contatoCortado) { op.somenteLeitura = op.somenteLeitura || (e.suspensa ? e.message : ''); atualizar(); }
        U.erroCampo(campo, e.message);
        campo.focus();
        return false;
      });
    }
    function reenviarPendentes() { pendentes.slice().forEach(function (p) { if (p.semInternet) enviar(p.texto, p); }); }
    function denunciar() {
      var ultima = (resp && resp.mensagens || []).filter(function (m) { return m.autor !== 'sistema' && !m.minha; }).pop();
      if (op.aoDenunciar) { op.aoDenunciar(ultima || null); return; }
      if (ultima) P.janelaDenuncia({ alvo: 'mensagem', id: ultima.id });
    }
    function visivel() { return !root.document || root.document.visibilityState !== 'hidden'; }
    function aoMudarVisibilidade() { if (visivel()) atualizar(); }
    U.aoVoltarInternet(function () { if (vivo) { reenviarPendentes(); atualizar(); } });
    if (root.document) root.document.addEventListener('visibilitychange', aoMudarVisibilidade);
    temporizador = setInterval(function () { if (vivo && visivel()) atualizar(); }, op.intervaloMs || 20000);

    U.trocar(lista, el('li', { class: 'vg-msg vg-msg--sistema', role: 'status' }, 'Carregando…'));
    var primeira = atualizar();
    return {
      atualizar: atualizar,
      enviar: function (t) { return enviar(t); },
      parar: function () {
        vivo = false;
        clearInterval(temporizador);
        if (root.document) root.document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      },
      estado: function () { return est; },
      resposta: function () { return resp; },
      pronto: primeira
    };
  }

  var VAGAS_CONVERSA = { montar: montar, estadoDe: estadoDe, linhasDe: linhasDe, mesclar: mesclar, validarTexto: validarTexto, MAX: MAX, BLOQUEIO_PESSOA: BLOQUEIO_PESSOA };
  if (nodeJs) module.exports = VAGAS_CONVERSA;
  else root.VAGAS_CONVERSA = VAGAS_CONVERSA;
})(typeof self !== 'undefined' ? self : this);
