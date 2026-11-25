/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · partida: espera o adaptador, entra na demonstração (só no modo prévia), traz a conta e a lista de
 * vagas e desenha a primeira tela. Se der erro de rede, mostra a tela de "tentar de novo" em vez de ficar em branco.
 */
(function (root) {
  'use strict';
  const doc = root.document, P = root.VSC_P, { $, esc, ic } = P;

  // ajuda: número de WhatsApp só se existir em VAGAS_CONFIG (nunca inventado); senão, o texto de contingência
  P.ajuda = function (texto) { const c = root.VAGAS_CONFIG; return c && c.ajuda ? c.ajuda(texto) : { tipo: 'contingencia', texto: 'O atendimento por WhatsApp ainda não está disponível. Volte em breve.', href: '' }; };
  P.ajudaHTML = function (rotulo) {
    const a = P.ajuda('Oi! Preciso de ajuda no Vagas sem Caos.');
    if (a.tipo === 'whatsapp') return `<a class="link" href="${esc(a.href)}" target="_blank" rel="noopener">${esc(rotulo || 'Falar com a gente no WhatsApp')}</a>`;
    return esc(a.texto || '') + (a.href ? ` <a class="link" href="${esc(a.href)}">Escrever</a>` : '');
  };
  function telaDeErro(e) {
    $('#app').innerHTML = `<div class="pagina estreita"><div class="vazio">${ic('sem-rede')}<b>Não foi possível carregar as vagas</b><p>${esc(P.msgErro(e, 'Verifique a internet e tente de novo.'))}</p>` +
      '<button class="btn" type="button" data-acao="recarregar">Tentar de novo</button></div></div>';
    $('#barra-baixo').hidden = true;
  }
  async function partir() {
    P.aplicarPrefs();
    P.iniciarOuvintes();
    $('#app').innerHTML = '<div class="pagina"><div class="carregando-lista" role="status"><span class="giro" aria-hidden="true"></span><span>Carregando as vagas…</span></div></div>';
    try { await root.VSC_API.pronto; } catch (e) { telaDeErro(e); return; }
    // "Lembrar neste celular" desligado: a sessão vale só até fechar o navegador
    try {
      if (root.localStorage.getItem('vsc.eu.curta') && !root.sessionStorage.getItem('vsc.eu.viva')) await root.VSC_API.sair();
    } catch (e) { /* sem armazenamento: segue */ }
    P.carregarLocais();
    if (P.modoPrevia() && root.VSC_PREVIA_PESSOA) root.VSC_PREVIA_PESSOA.aoIniciar(P);
    const aj = P.ajuda('Oi! Preciso de ajuda no Vagas sem Caos.'), rodape = $('#rodape-ajuda');
    rodape.innerHTML = aj.tipo === 'whatsapp' ? `Ajuda: <a class="link" href="${esc(aj.href)}" target="_blank" rel="noopener">falar com a gente no WhatsApp</a>` : esc(aj.texto || '') + (aj.href ? ` <a class="link" href="${esc(aj.href)}">Escrever</a>` : '');
    const contaPronta = P.carregarConta().catch((e) => { P.toast(P.msgErro(e), null, 'sem-rede'); });
    const cidade = (new root.URLSearchParams(root.location.search).get('cidade') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
    try { await Promise.all([P.carregarBase(cidade), contaPronta]); } catch (e) { telaDeErro(e); return; }
    P.pintarContadores();
    await P.render();
    if (P.eu.ler('fila', []).length) P.modulo('fila').then(() => P.fila.enviarPendentes(), () => {});
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', partir); else partir();
})(typeof self !== 'undefined' ? self : this);
