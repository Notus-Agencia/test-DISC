/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · candidaturas (lista), candidatura (andamento, entrevista, conversa) e as ações da pessoa:
 * confirmar presença, pedir outro horário, retirar, liberar o WhatsApp. O andamento vem dos marcos REAIS que o banco devolve
 * (enviada, vista, conversa, marcada, fim): nada é inventado na tela. A conversa mostra o alerta âmbar quando o banco avisa de golpe.
 */
(function (root) {
  'use strict';
  const doc = root.document, P = root.VSC_P, { $, $$, esc, ic } = P, E = P.est, D = P.D;
  const CONV = {};
  let POLL = null;

  const vagaDe = (c) => D.VAGA[c.vagaId] || c.vaga;
  const empDe = (c) => { const v = vagaDe(c); return (c.empresa && D.EMP[c.empresa.id]) || c.empresa || (v ? P.empresaDe(v) : { nome: 'Empresa', iniciais: '' }); };

  /* ---------- lista ---------- */
  P.telas.candidaturas = function () {
    const todas = P.minhas();
    if (!todas.length) {
      return `<div class="pagina estreita"><div class="cab-pagina"><h1>Candidaturas</h1></div>${P.faixaOffline()}<div class="vazio">${ic('maleta')}<b>Você ainda não se candidatou</b>` +
        '<p>Quando você se candidatar, a vaga aparece aqui com cada passo da empresa.</p><a class="btn" href="#/">Ver vagas</a>' +
        (E.conta ? '' : '<a class="link" href="#/entrar">Já se candidatou antes? Entrar</a>') + `</div>${P.golpe()}</div>`;
    }
    const and = todas.filter((c) => !P.encerrada(c)), enc = todas.filter(P.encerrada), aba = E.abaCand === 'encerradas' ? 'encerradas' : 'andamento', lista = aba === 'encerradas' ? enc : and;
    return `<div class="pagina estreita"><div class="cab-pagina"><h1>Candidaturas</h1><p>Cada passo da empresa aparece aqui. Avisamos por e-mail quando algo mudar.</p></div>${P.faixaOffline()}` +
      '<div class="abas" role="tablist" aria-label="Candidaturas">' +
        `<button class="aba" role="tab" type="button" aria-selected="${aba === 'andamento'}" data-acao="aba-cand" data-aba="andamento">Em andamento <span class="n">(${and.length})</span></button>` +
        `<button class="aba" role="tab" type="button" aria-selected="${aba === 'encerradas'}" data-acao="aba-cand" data-aba="encerradas">Encerradas <span class="n">(${enc.length})</span></button></div>` +
      (lista.length ? '<ul class="linhas">' + lista.map((c) => {
        const v = vagaDe(c), e = empDe(c), st = P.situacao(c), novo = c.etapa === 'em conversa' && c.naoLidas > 0;
        return `<li><a class="linha" href="#/candidatura/${esc(c.id)}"><span class="vaga-logo" aria-hidden="true">${esc(e.iniciais)}</span><span class="linha-corpo"><b>${esc(v ? v.titulo : 'Vaga')}` +
          `${novo ? '<span class="ponto-novo" role="img" aria-label="Mensagem nova"></span>' : ''}</b><small>${esc(e.nome)} · ${P.quandoPub(P.horasDesde(c.criadaEm))}</small>` +
          `<span class="status ${st.cls}">${ic(st.ic)}${esc(st.txt)}</span></span>${ic('chevron-dir')}</a></li>`;
      }).join('') + '</ul>' : `<div class="vazio">${ic('maleta')}<b>${aba === 'encerradas' ? 'Nenhuma candidatura encerrada' : 'Nenhuma candidatura em andamento'}</b><a class="btn" href="#/">Ver vagas</a></div>`) +
      `<div class="secao mt20">${P.golpe()}</div></div>`;
  };

  /* ---------- candidatura ---------- */
  P.prepararCandidatura = async function (id) {
    const c = P.candPorId(id);
    if (!c || c.offline) return;
    try {
      CONV[id] = await P.api('conversa', { id });
      c.naoLidas = 0;
    } catch (e) { CONV[id] = { mensagens: [], alertaGolpe: false, podeEscrever: false, erro: P.msgErro(e) }; }
  };
  function linhaDoTempo(c) {
    const m = c.marcos || {}, ordem = { nova: 0, vista: 1, 'em conversa': 2, 'entrevista marcada': 3, contratada: 4 }, idx = ordem[c.etapa], itens = [];
    const passos = [
      { t: 'Enviada', d: m.enviada }, { t: 'Vista pela empresa', d: m.vista }, { t: 'Em conversa', d: m.conversa, sub: 'A empresa chamou você' },
      { t: 'Entrevista marcada', d: m.marcada, sub: c.entrevista ? P.diaHora(c.entrevista.quando) : '' }, { t: 'Contratação confirmada', d: null }
    ];
    if (c.etapa === 'não seguiu') {
      itens.push({ t: 'Enviada', s: P.dataHora(m.enviada || c.criadaEm), e: 'feito' });
      if (m.vista) itens.push({ t: 'Vista pela empresa', s: P.dataHora(m.vista), e: 'feito' });
      const quem = c.encerradaPor === 'pessoa' ? 'Você retirou esta candidatura' : c.encerradaPor === 'prazo' ? 'A candidatura venceu sem resposta' : 'A empresa não seguiu com esta candidatura';
      itens.push({ t: 'Encerrada', s: quem + (m.fim ? ' em ' + P.dataCurta(m.fim) : '') + '.', e: 'fim' });
      return itens;
    }
    passos.forEach((p, i) => {
      let e = idx <= 1 ? (i <= idx ? 'feito' : i === idx + 1 ? 'agora' : 'depois') : (i < idx ? 'feito' : i === idx ? (idx === 4 ? 'feito' : 'agora') : 'depois');
      let s = e === 'feito' ? (p.d ? P.dataHora(p.d) : '') + (p.sub && i >= 2 && p.d ? ' · ' + p.sub : '') : e === 'agora' ? (i === idx ? p.sub || '' : 'Esperando a empresa') : '';
      if (i === 0 && c.offline) { s = 'Esperando internet'; e = 'agora'; }
      if (i === 3 && e === 'agora') s = (c.entrevista && c.entrevista.confirmada ? 'Presença confirmada · ' : 'Confirme sua presença · ') + p.sub;
      itens.push({ t: p.t, s, e });
    });
    return itens;
  }
  function htmlMensagens(c, e) {
    const conv = CONV[c.id] || { mensagens: [] };
    if (!conv.mensagens.length) return '<p class="msg-sistema">Nenhuma mensagem ainda. Quando a empresa escrever, avisamos por e-mail.</p>';
    return conv.mensagens.map((x) => (x.de === 'sistema' ? `<p class="msg-sistema">${esc(x.txt)}</p>`
      : `<div class="msg ${x.de === 'eu' ? 'eu' : 'ela'}"><span class="autor">${x.de === 'eu' ? 'Você' : esc(e.nome)}</span>${esc(x.txt)}<small>${P.dataHora(x.ts)}</small></div>`)).join('');
  }
  P.telas.candidatura = function (id) {
    const c = P.candPorId(id);
    if (!c) return `<div class="pagina estreita"><div class="vazio">${ic('maleta')}<b>Candidatura não encontrada</b><a class="btn" href="#/candidaturas">Ver candidaturas</a></div></div>`;
    const v = vagaDe(c) || { titulo: 'Vaga', salario: { aCombinar: true }, setorId: '', id: c.vagaId }, e = empDe(c), st = P.situacao(c), conv = CONV[id] || { mensagens: [], podeEscrever: false };
    const itens = linhaDoTempo(c);
    const tl = '<ol class="etapas">' + itens.map((x) => `<li class="etapa" data-estado="${x.e}"><span class="etapa-marca" aria-hidden="true">${x.e === 'feito' ? ic('check') : x.e === 'fim' ? ic('x') : ''}</span><div class="etapa-texto"><b>${x.t}</b>${x.s ? `<span>${esc(x.s)}</span>` : ''}</div></li>`).join('') + '</ol>';
    const en = c.entrevista, conf = !!(en && en.confirmada);
    const entrevista = c.etapa === 'entrevista marcada' && en
      ? `<section class="bloco entrevista" aria-labelledby="h-ent"><h2 id="h-ent">Entrevista</h2><p class="quando">${esc(P.diaHoraLongo(en.quando))}</p><p class="onde">${ic('local')}<span>${esc(en.onde)}</span></p>` +
        (en.recado ? `<p class="detalhe mt8">${esc(en.recado)}</p>` : '') +
        (en.pediuOutro ? '<p class="detalhe mt8">Você pediu outro horário. A empresa responde aqui.</p>' : '') +
        `<div class="fila">${conf ? `<span class="status ok">${ic('checks')}Presença confirmada</span>` : `<button class="btn grande" type="button" data-acao="confirmar-presenca" data-id="${esc(c.id)}">${ic('check')}Confirmar presença</button>`}` +
        `<button class="btn sec" type="button" data-acao="outro-horario" data-id="${esc(c.id)}">Pedir outro horário</button></div></section>` : '';
    const podeConversar = !c.offline && (conv.podeEscrever !== false) && c.etapa !== 'não seguiu';
    const liberar = !c.empresaVerificada && !P.encerrada(c) && !c.offline
      ? (c.whatsappLiberado ? `<p class="status ok mt12">${ic('check')}Seu WhatsApp e seu currículo foram liberados para esta empresa</p>`
        : `<p class="detalhe mt12">Esta empresa está em verificação: ela vê só o seu primeiro nome e o resumo do seu currículo, e a conversa fica aqui. O arquivo e o WhatsApp só vão se você liberar.</p>` +
          `<button class="btn sec largo mt10" type="button" data-acao="liberar-whats" data-id="${esc(c.id)}">${ic('conversa')}Liberar meu WhatsApp e meu currículo</button>`) : '';
    const chat = c.offline ? `<section class="bloco"><p>Sua candidatura está esperando a internet. Ela sai sozinha e a conversa começa quando a empresa responder.</p></section>`
      : `<section class="bloco" aria-labelledby="h-conv"><h2 id="h-conv">Conversa com a empresa</h2>${P.golpe()}<div class="conversa" id="conversa">${htmlMensagens(c, e)}</div>` +
        (conv.erro ? `<p class="erro-campo mt8">${ic('erro')}<span>${esc(conv.erro)}</span></p>` : '') +
        (conv.alertaGolpe ? `<div class="faixa aviso mt12" id="faixa-golpe" role="alert">${ic('alerta')}<span>Atenção: a empresa falou em dinheiro, documento ou pagamento. Ninguém pode cobrar nem pedir documento para você se candidatar. <button class="link link-texto" type="button" data-acao="denunciar-msg" data-id="${esc(c.id)}">Denunciar esta mensagem</button></span></div>` : '') +
        (podeConversar
          ? `<form class="escrever" data-form="mensagem" data-id="${esc(c.id)}" novalidate><div class="campo"><label class="sr" for="msg-${esc(c.id)}">Escreva uma mensagem</label><textarea class="entrada" id="msg-${esc(c.id)}" name="txt" rows="1" maxlength="1000" placeholder="Escreva uma mensagem" data-golpe aria-describedby="msg-dica-${esc(c.id)}"></textarea></div>` +
            `<button class="btn sec" type="submit" aria-label="Enviar mensagem">${ic('enviar')}</button></form><p class="dica msg-dica" id="msg-dica-${esc(c.id)}" aria-live="polite" hidden></p>`
          : (c.etapa !== 'não seguiu' ? '<p class="detalhe mt12">Você poderá responder quando a empresa escrever.</p>' : '')) +
        (conv.mensagens.some((x) => x.de === 'ela') ? `<p class="denunciar-msg"><button class="link" type="button" data-acao="denunciar-msg" data-id="${esc(c.id)}">${ic('bandeira')}Denunciar uma mensagem</button></p>` : '') + liberar + '</section>';
    const fim = c.etapa === 'não seguiu' ? `<section class="bloco cand-fim"><p>${c.encerradaPor === 'pessoa' ? 'Você retirou esta candidatura' : 'A empresa encerrou esta candidatura'}${c.marcos && c.marcos.fim ? ' em ' + P.dataCurta(c.marcos.fim) : ''}.</p>` +
      `<button class="link" type="button" data-acao="setor" data-id="${esc(v.setorId)}">Ver vagas parecidas</button></section>` : '';
    return `<div class="pagina estreita">${P.faixaOffline()}<a class="voltar so-largo" href="#/candidaturas">${ic('voltar')}Candidaturas</a>` +
      `<div class="cand-cab"><span class="vaga-logo" aria-hidden="true">${esc(e.iniciais)}</span><div><h1>${esc(v.titulo)}</h1>` +
        `<p class="vaga-empresa"><span>${esc(e.nome)}</span>${c.empresaVerificada ? '<svg class="ic" role="img" aria-label="Empresa verificada"><use href="#i-escudo"/></svg>' : ''}${P.exemploSelo(e)}</p>` +
        `<p class="vaga-salario"><b>${esc(P.salValor(v.salario))}</b> ${esc(P.salPor(v.salario))}</p><p class="mt10"><span class="status ${st.cls}">${ic(st.ic)}${esc(st.txt)}</span></p></div>` +
        (c.offline ? '' : `<button class="btn-icone" type="button" data-acao="opcoes-cand" data-id="${esc(c.id)}" aria-label="Mais opções" aria-haspopup="dialog">${ic('opcoes')}</button>`) + '</div>' +
      `${entrevista}<section class="bloco" aria-labelledby="h-and"><h2 id="h-and">Andamento</h2>${tl}</section>${fim}${chat}</div>`;
  };
  function atualizarConversa(id) {
    const c = P.candPorId(id), el = $('#conversa');
    if (!c || !el) return;
    const antes = (CONV[id] || { mensagens: [] }).mensagens.length;
    P.api('conversa', { id }).then((r) => {
      CONV[id] = r;
      if (r.mensagens.length !== antes || r.alertaGolpe) {
        const ta = $('textarea[data-golpe]'), tx = ta ? ta.value : '', foco = ta && doc.activeElement === ta;
        P.render({ manter: true });
        const n = $('textarea[data-golpe]');
        if (n) { n.value = tx; if (foco) n.focus(); }
      }
    }, () => {});
  }
  P.depois.candidatura = function (r, o) {
    clearInterval(POLL);
    const c = P.candPorId(r.id);
    if (c && !c.offline) POLL = setInterval(() => { if (!doc.hidden && P.rota().v === 'candidatura') atualizarConversa(r.id); else if (P.rota().v !== 'candidatura') clearInterval(POLL); }, 20000);
    const conv = $('#conversa');
    if (conv && !(o && o.manter) && conv.lastElementChild) conv.lastElementChild.scrollIntoView({ block: 'nearest' });
    const ta = $('textarea[data-golpe]');
    if (ta && P.checarGolpe) P.checarGolpe(ta);
  };

  /* ---------- conversa: lembretes ao digitar ---------- */
  const RE_GOLPE = /\b(pix|taxa|dep[oó]sito|depositar|curso pago|boleto|pagar|pagamento|cpf|documentos?|link)\b/i;
  // telefone, e-mail, link e rede social não vão pela conversa (o contato vai pelo "Liberar WhatsApp")
  P.contatoNaMensagem = function (t) {
    if (/\(?\b\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}\b/.test(t)) return 'telefone';
    if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(t)) return 'e-mail';
    if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|br|net|org|me)\b)/i.test(t)) return 'link';
    if (/\b(instagram|insta|facebook|tiktok|telegram)\b|(^|\s)@[a-z0-9_.]{3,}/i.test(t)) return 'rede social';
    return '';
  };
  P.checarGolpe = function (t) {
    const id = (t.id || '').replace(/^msg-/, ''), d = $('#msg-dica-' + id);
    if (!d) return;
    if (t.getAttribute('aria-invalid') === 'true' && !P.contatoNaMensagem(t.value)) t.removeAttribute('aria-invalid');
    if (RE_GOLPE.test(t.value)) { d.hidden = false; d.className = 'dica msg-dica'; d.innerHTML = ic('escudo') + ' Lembrete: ninguém pode cobrar nem pedir documento para você se candidatar.'; } else if (!t.getAttribute('aria-invalid')) d.hidden = true;
  };
  P.formularios.mensagem = async function (f) {
    const id = f.getAttribute('data-id'), ta = f.querySelector('textarea'), txt = ta.value.trim(), c = P.candPorId(id);
    if (!txt || !c) return;
    const ct = P.contatoNaMensagem(txt), dic = $('#msg-dica-' + id);
    if (ct) {
      dic.hidden = false; dic.className = 'erro-campo msg-dica';
      dic.innerHTML = ic('erro') + '<span>' + (c.whatsappLiberado ? 'Não mande ' + ct + ' pela conversa. A empresa já pode chamar você.' : 'Para mandar seu WhatsApp, use “Liberar meu WhatsApp e meu currículo”. Assim fica registrado quem viu.') + '</span>';
      ta.setAttribute('aria-invalid', 'true'); ta.focus();
      return;
    }
    const botao = f.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      const r = await P.api('mensagemEnviar', { id, texto: txt, mid: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) });
      const conv = CONV[id] || (CONV[id] = { mensagens: [] });
      conv.mensagens.push(r.mensagem);
      if (r.alerta) conv.alertaGolpe = true;
      P.render({ manter: true });
      const nt = $('textarea[data-golpe]');
      if (nt) nt.focus();
      const lista = $('#conversa');
      if (lista && lista.lastElementChild) lista.lastElementChild.scrollIntoView({ block: 'nearest' });
    } catch (e) {
      botao.disabled = false;
      const br = e.resposta && e.resposta.barra && e.resposta.barra[0];
      dic.hidden = false; dic.className = 'erro-campo msg-dica';
      dic.innerHTML = ic('erro') + '<span>' + esc(br ? br.mensagem || P.msgErro(e) : P.msgErro(e)) + '</span>';
      ta.setAttribute('aria-invalid', 'true'); ta.focus();
    }
  };
  P.formularios['outro-horario'] = async function (f) {
    const id = f.getAttribute('data-id'), ta = f.querySelector('textarea'), tx = ta.value.trim();
    if (!tx) { ta.setAttribute('aria-invalid', 'true'); ta.focus(); return; }
    try {
      await P.api('entrevistaResponder', { id, acao: 'outro_horario', texto: tx });
      P.fechar(f.closest('dialog'));
      await P.carregarCands(); await P.prepararCandidatura(id);
      P.render({ manter: true }); P.toast('Pedido enviado. A empresa responde na conversa.');
    } catch (e) { P.toast(P.msgErro(e), null, 'erro'); }
  };

  /* ---------- ações ---------- */
  const A = P.acoes;
  A['aba-cand'] = (b) => { E.abaCand = b.getAttribute('data-aba'); P.render({ manter: true }); const a = $('.aba[data-aba="' + E.abaCand + '"]'); if (a) a.focus(); };
  A['confirmar-presenca'] = async (b) => {
    const id = b.getAttribute('data-id');
    b.disabled = true;
    try {
      await P.api('entrevistaResponder', { id, acao: 'confirmar' });
      await P.carregarCands(); await P.prepararCandidatura(id);
      P.render({ manter: true }); P.pintarContadores(); P.toast('Presença confirmada. A empresa foi avisada.');
    } catch (e) { b.disabled = false; P.toast(P.msgErro(e), null, 'erro'); }
  };
  A['outro-horario'] = (b) => {
    const id = b.getAttribute('data-id');
    P.abrirFolha({ id: 'folha-horario', titulo: 'Pedir outro horário',
      corpo: `<form data-form="outro-horario" data-id="${esc(id)}" id="form-horario" novalidate><div class="campo"><label for="oh-txt">Qual dia e hora ficam melhor?</label><textarea class="entrada" id="oh-txt" name="txt" rows="3" maxlength="300" placeholder="Ex.: sexta à tarde, depois das 14h"></textarea></div></form>`,
      rodape: '<button class="btn grande largo" type="submit" form="form-horario">Enviar</button>', foco: '#oh-txt' });
  };
  A['opcoes-cand'] = (b) => {
    const id = b.getAttribute('data-id'), c = P.candPorId(id), v = vagaDe(c);
    P.abrirFolha({ id: 'folha-opcoes', titulo: 'Opções', classe: 'vidro denso',
      corpo: `<ul class="linhas"><li><button class="linha" type="button" data-acao="ir" data-href="#/vaga/${esc(v ? v.id : c.vagaId)}">${ic('documento')}<span class="linha-corpo"><b>Ver a vaga</b></span>${ic('chevron-dir')}</button></li>` +
        (P.encerrada(c) ? '' : `<li><button class="linha perigo" type="button" data-acao="retirar" data-id="${esc(id)}">${ic('x')}<span class="linha-corpo"><b>Retirar candidatura</b><small>A empresa deixa de ver seu currículo</small></span></button></li>`) + '</ul>' });
  };
  A.retirar = (b) => {
    const id = b.getAttribute('data-id');
    P.fechar(b.closest('dialog'));
    setTimeout(() => P.janela('Retirar sua candidatura?', 'A empresa deixa de ver seu currículo.', 'Retirar', 'perigo', async () => {
      try {
        await P.api('candidaturaRetirar', { id });
        await P.carregarCands(); await P.prepararCandidatura(id);
        P.render({ manter: true }); P.pintarContadores(); P.toast('Candidatura retirada. A empresa deixou de ver seu currículo.', null, 'x');
      } catch (e) { P.toast(P.msgErro(e), null, 'erro'); }
    }), 120);
  };
  A['liberar-whats'] = (b) => {
    const id = b.getAttribute('data-id'), c = P.candPorId(id), e = empDe(c);
    P.abrirFolha({ id: 'folha-liberar', titulo: 'Liberar seu WhatsApp e seu currículo?', classe: 'vidro denso',
      corpo: `<p>A empresa ${esc(e.nome)} vai ver seu nome, seu WhatsApp e o arquivo do seu currículo.${c.empresaVerificada ? '' : ' Ela ainda está em verificação.'}</p><p class="detalhe mt8">Fica registrado em “Quem viu meu currículo”. Se alguém pedir dinheiro, Pix ou documento, denuncie.</p>`,
      rodape: `<button class="btn fantasma" type="button" data-fechar>Agora não</button><button class="btn grande" type="button" data-acao="liberar-sim" data-id="${esc(id)}">Liberar</button>` });
  };
  A['liberar-sim'] = async (b) => {
    const id = b.getAttribute('data-id');
    b.disabled = true;
    try {
      await P.api('whatsappLiberar', { id });
      P.fechar(b.closest('dialog'));
      await P.carregarCands(); await P.prepararCandidatura(id);
      P.render({ manter: true }); P.toast('WhatsApp e currículo liberados para esta empresa');
    } catch (e) { b.disabled = false; P.toast(P.msgErro(e), null, 'erro'); }
  };
  A['denunciar-msg'] = (b) => {
    const id = b.getAttribute('data-id');
    P.modulo('filtros').then(() => P.abrirDenuncia({ tipo: 'msg', candId: id, mensagens: ((CONV[id] || {}).mensagens || []).filter((x) => x.de === 'ela') }));
  };
})(typeof self !== 'undefined' ? self : this);
