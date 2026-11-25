/* ==========================================================================
   Site da empresa · E5 Início · E6 Vagas (ações sempre visíveis) · E7 Anunciar várias vagas
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP, S = E.S, UI = E.UI, TELAS = E.TELAS, PRE = E.PRE, ACOES = E.ACOES, MOD = window.VSC_MODELOS;
  var esc = E.esc, ic = E.ic, $ = E.$, $$ = E.$$, abrir = E.abrir, fechar = E.fechar, folhaTopo = E.folhaTopo, toast = E.toast, ir = E.ir, norm = E.norm, num = E.num, milhar = E.milhar, plural = E.plural;

  /* ---------- peças ---------- */
  function faixaVerificacao() {
    var est = E.estadoEmpresa(), p = E.prazoVerificacao();
    if (E.verificada()) return '';
    if (est === 'precisa_ajuste') {
      return '<div class="faixa aviso mt-16">' + ic('alerta') + '<span>A equipe pediu um ajuste nos dados da empresa' + (S.empresa.motivoAjuste ? ': ' + esc(S.empresa.motivoAjuste) : '') + '. Corrija e peça nova conferência. <a class="link link-texto" href="#/verificacao">Ver o que falta</a></span></div>';
    }
    if (est === 'vencida') {
      return '<div class="faixa aviso mt-16">' + ic('alerta') + '<span>O prazo para verificar a empresa terminou, e as vagas estão pausadas até a verificação. Nada foi apagado. <a class="link link-texto" href="#/verificacao">Ver o que enviar</a></span></div>';
    }
    return '<div class="faixa calmo mt-16">' + ic('meio') + '<span>Sua empresa está em verificação. Suas vagas já estão no ar. Até a verificação: até ' + (E.maxNoAr() == null ? 3 : E.maxNoAr()) + ' vagas no ar e conversa pelo site.' +
      (p ? ' Prazo: ' + esc(p) + '.' : '') + ' <a class="link link-texto" href="#/verificacao">Ver o que falta</a></span></div>';
  }
  E.faixaVerificacao = faixaVerificacao;
  E.seloEmpresa = function () {
    var e = S.empresa;
    if (e.verificada) return '<span class="selo verificada">' + ic('escudo') + 'Empresa verificada</span>' + (e.verificadaEm ? '<span class="selo-data">CNPJ conferido em ' + esc(E.dataBr(E.ms(e.verificadaEm))) + '/' + esc(String(new Date(E.ms(e.verificadaEm)).getFullYear())) + '</span>' : '');
    var est = E.estadoEmpresa();
    if (est === 'precisa_ajuste') return '<span class="selo verificando">' + ic('alerta') + 'Precisa de ajuste</span>';
    if (est === 'vencida') return '<span class="selo verificando">' + ic('alerta') + 'Prazo vencido</span>';
    return '<span class="selo verificando">' + ic('meio') + 'Empresa em verificação</span>';
  };
  function statusVaga(v) {
    var g = E.grupoVaga(v);
    if (g === 'aberta') return '<span class="status ok">' + ic('ponto') + 'No ar</span>';
    if (g === 'pausada') return '<span class="status fim">' + ic('pausa') + 'Pausada</span>';
    if (g === 'rascunho') return '<span class="status calmo">' + ic('lapis') + 'Rascunho</span>';
    if (g === 'revisao') return '<span class="status calmo">' + ic('relogio') + 'Em revisão rápida</span>';
    return '<span class="status fim">' + ic('arquivo') + (v.status === 'vencida' ? 'Venceu' : 'Encerrada') + '</span>';
  }
  function entrevistasSemana() {
    var ate = E.agora() + 7 * E.DIA;
    return S.cands.filter(function (c) { var t = c.entrevista ? E.ms(c.entrevista.quando) : 0; return c.etapa === 'entrevista marcada' && t >= E.agora() - 12 * E.HORA && t <= ate; })
      .sort(function (a, b) { return E.ms(a.entrevista.quando) - E.ms(b.entrevista.quando); });
  }

  /* ---------- ações de uma vaga (todas pelo banco: vagaAcao) ---------- */
  function abrirLimite(msg) {
    abrir('folha-curta', folhaTopo('folha-curta-titulo', 'Limite de vagas no ar') +
      '<div class="folha-corpo"><p>' + esc(msg || E.textoLimites()) + '</p><p class="dica mt-12">Para abrir espaço: pause ou encerre outra vaga. Depois da verificação, o limite sobe. ' + E.ajudaHtml('Falar com a gente', 'Preciso de ajuda com o limite de vagas') + '</p></div>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="ir" data-para="#/verificacao">Ver a verificação</button><button class="btn" type="button" data-acao="fechar-dialogo">Entendi</button></div>');
  }
  E.abrirLimite = abrirLimite;
  function acaoVaga(v, acao) {
    return E.api('vagaAcao', { id: v.id, acao: acao }).then(function (r) { if (r.vaga) E.trocaVaga(r.vaga); return r; });
  }
  function refazerTelaDeVagas() { E.esquecerTela(); E.carregarVagas().then(function () { E.render(); }, function () { E.render(); }); }
  function erroAcao(e) {
    if (e && (e.codigo === 'limite_no_ar' || e.codigo === 'limite_dia')) { abrirLimite(E.msgErro(e)); return; }
    toast(E.msgErro(e), null, null, 'erro');
  }
  function pausar(v) {
    var volta = v.status === 'pausada';
    acaoVaga(v, volta ? 'retomar' : 'pausar').then(function () {
      refazerTelaDeVagas();
      toast(volta ? v.titulo + ' voltou ao ar' : 'Vaga pausada. Ela não aparece na busca.', 'Desfazer', function () { acaoVaga(v, volta ? 'pausar' : 'retomar').then(refazerTelaDeVagas, erroAcao); }, volta ? 'play' : 'pausa');
    }, erroAcao);
  }
  function encerrar(v) {
    E.janela('Encerrar a vaga ' + v.titulo + '?', 'Ela sai do ar e as pessoas veem "Encerrada". Quem se candidatou continua na sua lista.', 'Encerrar', true, function () {
      acaoVaga(v, 'encerrar').then(function () {
        refazerTelaDeVagas();
        toast('Vaga encerrada', 'Desfazer', function () { acaoVaga(v, 'renovar').then(refazerTelaDeVagas, erroAcao); }, 'arquivo');
      }, erroAcao);
    });
  }
  function maisTrintaDias(v) {
    acaoVaga(v, 'renovar').then(function () { refazerTelaDeVagas(); toast('A vaga ficou mais 30 dias no ar', null, null, 'play'); }, erroAcao);
  }
  function duplicar(v) {
    acaoVaga(v, 'duplicar').then(function (r) {
      if (!r.vaga) throw new Error('Não deu para duplicar a vaga.');
      E.limparForm(); E.esquecerTela();
      ir('#/vaga/editar/' + encodeURIComponent(r.vaga.id) + '?copia=' + encodeURIComponent(v.titulo));
    }, erroAcao);
  }
  function publicarRascunho(v) {
    acaoVaga(v, 'publicar').then(function (r) {
      E.ultimoResultado = { estado: r.estado, mensagens: r.mensagens || [] };
      E.esquecerTela();
      if (r.estado === 'rascunho') { E.carregarVagas().then(E.render); abrirLimite((r.mensagens && r.mensagens[0]) || ''); return; }
      ir('#/publicada/' + encodeURIComponent(v.id));
    }, erroAcao);
  }
  function compartilhar(v) { var msg = E.mensagemCompartilhar(v); E.copiar(msg); E.abrirEmNovaAba(E.linkWhatsAppCompartilhar(msg)); toast(E.previa ? 'Na demonstração, a mensagem também foi copiada.' : 'Abrindo o WhatsApp com a mensagem pronta.', null, null, 'conversa'); }

  function menuVaga(btn, v) {
    var itens = [{ txt: 'Ver candidatos', ic: 'pessoas', fn: function () { ir('#/candidatos?vaga=' + encodeURIComponent(v.id)); } }];
    if (v.status !== 'encerrada' && v.status !== 'vencida') itens.push({ txt: v.status === 'rascunho' ? 'Terminar o rascunho' : 'Editar', ic: 'lapis', fn: function () { E.limparForm(); ir('#/vaga/editar/' + encodeURIComponent(v.id)); } });
    itens.push({ txt: 'Duplicar', ic: 'copiar', fn: function () { duplicar(v); } });
    if (E.variasLojas()) itens.push({ txt: 'Publicar também em outro endereço', ic: 'loja', fn: function () { duplicar(v); } });
    if (v.status === 'aberta') itens.push({ txt: 'Compartilhar', ic: 'compartilhar', fn: function () { compartilhar(v); } });
    itens.push('-');
    if (v.status === 'aberta') itens.push({ txt: 'Pausar', ic: 'pausa', fn: function () { pausar(v); } });
    if (v.status === 'pausada') itens.push({ txt: 'Voltar ao ar', ic: 'play', fn: function () { pausar(v); } });
    if (v.status === 'aberta' || v.status === 'pausada') itens.push({ txt: 'Deixar mais 30 dias no ar', ic: 'play', fn: function () { maisTrintaDias(v); } });
    if (v.status === 'encerrada' || v.status === 'vencida') itens.push({ txt: 'Deixar mais 30 dias no ar', ic: 'play', fn: function () { maisTrintaDias(v); } });
    if (v.status !== 'encerrada' && v.status !== 'vencida') itens.push({ txt: 'Encerrar', ic: 'arquivo', perigo: true, fn: function () { encerrar(v); } });
    E.abrirMenu(btn, itens);
  }
  ACOES['menu-vaga'] = function (el) { menuVaga(el, E.vagaPor(el.getAttribute('data-id'))); };
  ACOES['pausar'] = function (el) { pausar(E.vagaPor(el.getAttribute('data-id'))); };
  ACOES['encerrar'] = function (el) { encerrar(E.vagaPor(el.getAttribute('data-id'))); };
  ACOES['mais-30'] = function (el) { maisTrintaDias(E.vagaPor(el.getAttribute('data-id'))); };
  ACOES['editar'] = function (el) { E.limparForm(); ir('#/vaga/editar/' + encodeURIComponent(el.getAttribute('data-id'))); };
  ACOES['duplicar'] = function (el) { duplicar(E.vagaPor(el.getAttribute('data-id'))); };
  ACOES['publicar-rascunho'] = function (el) { publicarRascunho(E.vagaPor(el.getAttribute('data-id'))); };
  ACOES['compartilhar-vaga'] = function (el) { compartilhar(E.vagaPor(el.getAttribute('data-id'))); };

  function acoesRapidas(v) {
    var b = function (acao, icn, txt) { return '<button class="btn fantasma peq" type="button" data-acao="' + acao + '" data-id="' + esc(v.id) + '">' + ic(icn) + txt + '</button>'; };
    var g = E.grupoVaga(v);
    if (g === 'encerrada') return b('mais-30', 'play', 'Deixar mais 30 dias no ar') + b('duplicar', 'copiar', 'Duplicar');
    if (g === 'rascunho') return b('publicar-rascunho', 'play', 'Publicar') + b('editar', 'lapis', 'Editar') + b('duplicar', 'copiar', 'Duplicar');
    if (g === 'revisao') return b('editar', 'lapis', 'Editar') + b('duplicar', 'copiar', 'Duplicar');
    return b('editar', 'lapis', 'Editar') + b('duplicar', 'copiar', 'Duplicar') + (g === 'pausada' ? b('pausar', 'play', 'Voltar ao ar') : b('pausar', 'pausa', 'Pausar')) + b('mais-30', 'play', 'Mais 30 dias') + b('encerrar', 'arquivo', 'Encerrar');
  }
  function cartaoVagaPainel(v) {
    var onde = [E.variasLojas() && E.lojaDe(v) ? E.lojaDe(v).nome : v.bairro, E.cidadeNome(v.cidade)].filter(Boolean).join(', ');
    var quando = v.tipo === 'Diária' ? E.diariaCurta(v) : '';
    return '<article class="vc"><div class="vc-topo"><div><h3><a href="#/candidatos?vaga=' + encodeURIComponent(v.id) + '">' + esc(v.titulo) + '</a></h3>' +
      '<p class="vc-sub">' + E.salHtml(v.salario) + '</p><p class="vc-sub">' + esc(onde) + ' · ' + esc(E.tipoTela(v.tipo)) + (quando ? ' · ' + esc(quando) : '') + '</p></div>' +
      '<button class="btn-icone" type="button" data-acao="menu-vaga" data-id="' + esc(v.id) + '" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações de ' + esc(E.tituloLocal(v)) + '">' + ic('opcoes') + '</button></div>' +
      '<div class="fila">' + statusVaga(v) + (v.repete ? '<span class="etiqueta">' + ic('relogio') + 'Repete toda semana</span>' : '') + E.exemplo() + '</div>' +
      (E.grupoVaga(v) === 'revisao' ? '<p class="detalhe">' + esc(v.motivo || 'Entra no ar assim que a equipe liberar (meta: 2 horas úteis).') + '</p>' : '') +
      '<p class="vc-nums"><span><b>' + (v.candidatos || 0) + '</b> ' + ((v.candidatos || 0) === 1 ? 'candidato' : 'candidatos') + '</span>' + (v.novos ? '<span><b>' + v.novos + '</b> ' + (v.novos === 1 ? 'novo' : 'novos') + '</span>' : '') +
      (v.status === 'aberta' && E.noArAte(v) ? '<span>No ar até ' + esc(E.noArAte(v)) + '</span>' : '') + '</p>' +
      '<a class="btn sec peq" href="#/candidatos?vaga=' + encodeURIComponent(v.id) + '">' + ic('pessoas') + 'Ver candidatos</a>' +
      '<div class="vc-acoes">' + acoesRapidas(v) + '</div></article>';
  }

  /* ---------- E5 Início ---------- */
  PRE.inicio = function () { return E.carregarPainel().then(function () { return E.carregarBase().catch(function () { /* o início abre sem a base */ }); }); };
  TELAS.inicio = function () {
    var e = S.empresa, ab = E.abertas(), novos = S.cands.filter(function (c) { return c.etapa === 'nova'; });
    var ent = entrevistasSemana(), hoje = [];
    novos.slice().sort(function (a, b) { return b.t - a.t; }).slice(0, 3).forEach(function (c) {
      var v = E.vagaPor(c.vagaId); hoje.push({ ic: 'pessoas', b: E.primeiroNome(c.nome) + ' se candidatou', s: (v ? E.tituloLocal(v) + ' · ' : '') + E.ha(c.t), h: '#/candidato/' + encodeURIComponent(c.id) });
    });
    ent.forEach(function (c) {
      var v = E.vagaPor(c.vagaId), t = E.ms(c.entrevista.quando);
      hoje.push({ ic: 'calendario', b: (v && v.tipo === 'Diária' ? 'Diária ' : 'Entrevista ') + E.quando(t), s: E.primeiroNome(c.nome) + ' · ' + (v ? E.tituloLocal(v) + ' · ' : '') + (c.entrevista.confirmada === true ? 'confirmada' : 'esperando confirmação'), h: '#/candidato/' + encodeURIComponent(c.id) });
    });
    S.cands.filter(function (c) { return c.etapa !== 'nova' && c.naoLidas > 0; }).forEach(function (c) {
      var v = E.vagaPor(c.vagaId); hoje.push({ ic: 'conversa', b: 'Mensagem de ' + E.primeiroNome(c.nome), s: v ? E.tituloLocal(v) : '', h: '#/candidato/' + encodeURIComponent(c.id), aba: 'conversa' });
    });
    var visiveis = S.vagas.filter(function (v) { var g = E.grupoVaga(v); return g !== 'encerrada'; });
    var max = E.maxNoAr();
    var html =
      '<div class="ola"><h1>Início</h1>' +
      '<a class="btn so-cel" href="#/vaga/nova" data-acao="nova-vaga">' + ic('mais') + 'Anunciar vaga</a></div>' +
      '<p class="empresa-linha">' + esc(e.nome) + ' ' + E.exemplo() + ' ' + E.seloEmpresa() + '</p>' +
      faixaVerificacao() +
      '<div class="indicadores">' +
      '<a class="indicador" href="#/vagas"><span>Vagas no ar</span><b class="numero-grande">' + ab.length + '</b><small>' + (max != null ? 'de ' + max + ' enquanto verificamos' : plural(S.vagas.length, 'vaga no total', 'vagas no total')) + '</small></a>' +
      '<a class="indicador" href="#/candidatos?etapa=novos" data-acao="ir-novos"><span>Candidatos novos</span><b class="numero-grande">' + novos.length + '</b><small>' + plural(S.cands.length, 'candidatura no total', 'candidaturas no total') + '</small></a>' +
      '<a class="indicador" href="#/candidatos?etapa=entrevista" data-acao="ir-entrevistas"><span>Entrevistas da semana</span><b class="numero-grande">' + ent.length + '</b><small>' + (ent.length ? 'próxima: ' + E.quando(E.ms(ent[0].entrevista.quando)) : 'nenhuma marcada') + '</small></a>' +
      '</div>' +
      '<div class="secao-titulo"><h2>Hoje</h2></div>' +
      (hoje.length ? '<ul class="hoje">' + hoje.map(function (x) {
        return '<li><a href="' + x.h + '"' + (x.aba ? ' data-gv-aba="' + x.aba + '"' : '') + '><span class="hoje-ic">' + ic(x.ic) + '</span><div><b>' + esc(x.b) + '</b><small>' + esc(x.s) + '</small></div>' + ic('chevron-dir', 'ir') + '</a></li>';
      }).join('') + '</ul>' : '<div class="cartao vazio">' + ic('sino') + '<b>Nada novo hoje</b><p>Quando alguém se candidatar, aparece aqui.</p></div>') +
      '<div class="secao-titulo"><h2>Suas vagas</h2><a class="link" href="#/vagas">Ver todas</a></div>' +
      (visiveis.length ? '<div class="vagas-cartoes cascata">' + visiveis.slice(0, 6).map(cartaoVagaPainel).join('') + '</div>'
        : '<div class="cartao vazio">' + ic('maleta') + '<b>Você ainda não tem vagas</b><p>Escolha a função e a descrição já vem escrita. Fica no ar na hora.</p><a class="btn" href="#/vaga/nova" data-acao="nova-vaga">Anunciar vaga grátis</a></div>') +
      '<div class="secao-titulo"><h2>Atalhos</h2></div>' +
      '<div class="atalhos">' +
      '<a class="atalho" href="#/vagas/varias"><span class="hoje-ic">' + ic('tabela') + '</span><div><b>Anunciar várias vagas</b><small>Várias funções de uma vez, numa tabela</small></div></a>' +
      '<a class="atalho" href="#/empresa"><span class="hoje-ic">' + ic('predio') + '</span><div><b>Dados da empresa</b><small>Endereços, equipe e verificação</small></div></a>' +
      '</div>' +
      '<p class="plano-linha">Grátis no lançamento.</p>';
    return { html: html, nav: 'inicio', barra: 'baixo', cinza: true, titulo: 'Início' };
  };
  ACOES['ir-novos'] = function () { UI.filtros = { etapa: 'novos' }; UI.visao = 'lista'; ir('#/candidatos?etapa=novos'); };
  ACOES['ir-entrevistas'] = function () { UI.filtros = { etapa: 'entrevista' }; UI.visao = 'lista'; ir('#/candidatos?etapa=entrevista'); };
  document.addEventListener('click', function (e) { var a = e.target.closest('[data-gv-aba]'); if (a) UI.gvAba = a.getAttribute('data-gv-aba'); }, true);

  /* ---------- E6 Vagas ---------- */
  PRE.vagas = function (r) { return r.arg === 'varias' ? E.carregarBase().then(function () { return S.empresa ? E.carregarVagas() : null; }) : E.carregarVagas(); };
  var GRUPOS = [['aberta', 'No ar'], ['pausada', 'Pausadas'], ['rascunho', 'Rascunhos'], ['revisao', 'Em revisão rápida'], ['encerrada', 'Encerradas'], ['pronta', 'Prontas neste aparelho']];
  TELAS.vagas = function (r) {
    if (r.arg === 'varias') return telaVarias();
    var lote = E.lerLote(), cont = {};
    GRUPOS.forEach(function (g) { cont[g[0]] = g[0] === 'pronta' ? lote.length : S.vagas.filter(function (v) { return E.grupoVaga(v) === g[0]; }).length; });
    if (r.q.aba && cont[r.q.aba] !== undefined) UI.aba = r.q.aba;
    if (!cont[UI.aba] && UI.aba !== 'aberta') UI.aba = 'aberta';
    var lista = UI.aba === 'pronta' ? [] : S.vagas.filter(function (v) { return E.grupoVaga(v) === UI.aba; });
    var max = E.maxNoAr();
    var html =
      '<div class="cab"><div><h1>Vagas</h1><p>' + plural(cont.aberta, 'vaga no ar', 'vagas no ar') + (max != null ? ' de ' + max + ' enquanto verificamos sua empresa' : '') + '</p></div>' +
      '<div class="acoes"><a class="btn so-cel" href="#/vaga/nova" data-acao="nova-vaga">' + ic('mais') + 'Anunciar vaga</a><a class="btn sec" href="#/vagas/varias">' + ic('tabela') + 'Anunciar várias vagas</a></div></div>' +
      faixaVerificacao().replace('mt-16', '') +
      (E.emVerificacao() && S.limites ? '<p class="nota-data">' + ic('info') + E.esc(E.textoLimites()) + ' Hoje: ' + S.limites.hoje + ' de ' + S.limites.maxHoje + ' vagas novas. ' + (E.restanteNoAr() === 0 ? 'Para publicar outra, pause ou encerre uma vaga no ar.' : '') + '</p>' : '') +
      '<div class="abas no-topo" role="tablist" aria-label="Situação das vagas">' + GRUPOS.filter(function (g) { return g[0] === 'aberta' || cont[g[0]]; }).map(function (g) {
        return '<button class="aba" type="button" role="tab" data-acao="aba-vagas" data-aba="' + g[0] + '" aria-selected="' + (UI.aba === g[0]) + '">' + g[1] + ' <span class="n">' + cont[g[0]] + '</span></button>';
      }).join('') + '</div>' +
      (UI.aba === 'pronta' ? listaLote(lote) : lista.length ?
        '<div class="tabela-caixa so-pc"><table class="tabela"><thead><tr><th>Vaga</th><th>Situação</th><th class="n">Candidatos</th><th>No ar até</th><th class="n">Ações</th></tr></thead><tbody>' +
        lista.map(function (v) {
          var g = E.grupoVaga(v), st = E.salTexto(v.salario);
          return '<tr><td><div class="vaga-cel"><a href="#/candidatos?vaga=' + encodeURIComponent(v.id) + '">' + esc(E.tituloLocal(v)) + '</a><small>' + esc(st.v) + ' ' + esc(st.p) + ' · ' + esc([v.bairro, E.cidadeNome(v.cidade)].filter(Boolean).join(', ')) + (v.tipo === 'Diária' ? ' · ' + esc(E.diariaCurta(v)) : '') + '</small></div></td>' +
            '<td>' + statusVaga(v) + '</td>' +
            '<td class="n num-cel"><b>' + (v.candidatos || 0) + '</b>' + (v.novos ? '<small>' + v.novos + (v.novos === 1 ? ' novo' : ' novos') + '</small>' : '') + '</td>' +
            '<td class="data">' + (v.status === 'aberta' ? esc(E.noArAte(v)) : '·') + '</td>' +
            '<td class="acoes"><div class="acoes-cel">' + acoesTabela(v, g) + '<button class="btn-icone" type="button" data-acao="menu-vaga" data-id="' + esc(v.id) + '" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações de ' + esc(E.tituloLocal(v)) + '" title="Mais ações">' + ic('opcoes') + '</button></div></td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="vagas-cartoes so-cel">' + lista.map(cartaoVagaPainel).join('') + '</div>'
        : '<div class="cartao vazio">' + ic('maleta') + '<b>' + (UI.aba === 'aberta' ? 'Nenhuma vaga no ar' : 'Nada por aqui') + '</b><p>Escolha a função e a descrição já vem escrita. Fica no ar na hora.</p><a class="btn" href="#/vaga/nova" data-acao="nova-vaga">Anunciar vaga grátis</a></div>') +
      '<p class="nota-data">' + ic('info') + 'Cada vaga fica 30 dias no ar. Antes de vencer, dá para deixar mais 30 dias no ar com 1 toque.</p>';
    return { html: html, nav: 'vagas', barra: 'baixo', cinza: true, titulo: 'Vagas' };
  };
  function acoesTabela(v, g) {
    var bt = function (acao, icn, rot) { return '<button class="btn-icone" type="button" data-acao="' + acao + '" data-id="' + esc(v.id) + '" aria-label="' + rot + '" title="' + rot + '">' + ic(icn) + '</button>'; };
    if (g === 'encerrada') return bt('mais-30', 'play', 'Deixar mais 30 dias no ar') + bt('duplicar', 'copiar', 'Duplicar');
    if (g === 'rascunho') return bt('publicar-rascunho', 'play', 'Publicar') + bt('editar', 'lapis', 'Editar') + bt('duplicar', 'copiar', 'Duplicar');
    if (g === 'revisao') return bt('editar', 'lapis', 'Editar') + bt('duplicar', 'copiar', 'Duplicar');
    return bt('editar', 'lapis', 'Editar') + bt('duplicar', 'copiar', 'Duplicar') + bt('pausar', g === 'pausada' ? 'play' : 'pausa', g === 'pausada' ? 'Voltar ao ar' : 'Pausar') + bt('mais-30', 'play', 'Deixar mais 30 dias no ar') + bt('encerrar', 'arquivo', 'Encerrar');
  }
  function listaLote(lote) {
    return '<p class="nota-data">' + ic('info') + 'Estas vagas ficaram prontas neste aparelho porque passaram do limite do dia. Publique quando o limite liberar (amanhã ou depois da verificação).</p>' +
      '<ul class="revisao mt-16">' + lote.map(function (it, i) {
        return '<li><div class="vc"><div class="vc-topo"><div><h3>' + esc(it.vaga.titulo) + '</h3><p class="vc-sub">' + E.salHtml(it.vaga.salario) + '</p><p class="vc-sub">' + esc([it.vaga.bairro, E.cidadeNome(it.vaga.cidade)].filter(Boolean).join(', ')) + ' · ' + esc(E.tipoTela(it.vaga.tipo)) + '</p></div></div>' +
          '<div class="fila"><span class="status calmo">' + ic('relogio') + 'Pronta · não publicada</span></div>' +
          '<div class="vc-acoes"><button class="btn peq" type="button" data-acao="lote-publicar" data-i="' + i + '">' + ic('play') + 'Publicar agora</button><button class="btn fantasma peq" type="button" data-acao="lote-apagar" data-i="' + i + '">' + ic('lixo') + 'Apagar</button></div></div></li>';
      }).join('') + '</ul>';
  }
  ACOES['aba-vagas'] = function (el) { UI.aba = el.getAttribute('data-aba'); E.render(); };
  ACOES['lote-apagar'] = function (el) { var l = E.lerLote(); l.splice(parseInt(el.getAttribute('data-i'), 10), 1); E.gravarLote(l); E.render(); toast('Vaga pronta apagada.', null, null, 'lixo'); };
  ACOES['lote-publicar'] = function (el) {
    var i = parseInt(el.getAttribute('data-i'), 10), l = E.lerLote(), it = l[i]; if (!it) return;
    el.disabled = true;
    E.api('vagaPublicar', { empresaId: S.empresa.id, vaga: it.vaga, idLocal: it.idLocal }).then(function (r) {
      l.splice(i, 1); E.gravarLote(l);
      E.ultimoResultado = { estado: r.estado, mensagens: r.mensagens || [] };
      if (r.vaga) E.trocaVaga(r.vaga); E.esquecerTela();
      if (r.estado === 'rascunho') { E.carregarVagas().then(E.render); abrirLimite((r.mensagens && r.mensagens[0]) || ''); return; }
      ir('#/publicada/' + encodeURIComponent(r.vaga.id));
    }, function (e) { el.disabled = false; erroAcao(e); });
  };

  /* ---------- E7 Anunciar várias vagas ----------
     Também para empresa nova (botão "Tenho várias vagas" do E1): a tabela vem primeiro e os dados da empresa no fim. */
  var VR = null;
  var TIPOS_VR = ['Carteira assinada', 'Temporário', 'Por serviço', 'Estágio', 'PJ'];
  function linhaVazia() { var l = E.lojas()[0]; return { titulo: '', de: '', ate: '', por: 'mes', tipo: 'Carteira assinada', turno: '', loja: l ? l.id : '', idLocal: E.uuid() }; }
  function temModelo(r) { return MOD.exato(r.titulo); }
  function aplicarLinhaModelo(r) {
    var m = temModelo(r); r.modelo = m ? m.id : null; if (!m) return;
    if (m.tipo !== 'Diária') r.tipo = m.tipo;
    if (!r.turno && m.tipo !== 'Diária') r.turno = m.turno;
    var ok = E.periodosDoTipo(r.tipo); if (ok.indexOf(r.por) < 0) r.por = ok[0];
  }
  function restanteAgora() { return VR && VR.nova ? E.CON.LIMITES.vagasNoAr : Math.min(E.restanteNoAr(), E.restanteHoje()); }
  function textoLimiteVR() {
    var t = 'Enquanto sua empresa é verificada, cabem ' + (E.maxNoAr() == null ? 3 : E.maxNoAr()) + ' vagas no ar e ' + (E.maxHoje() == null ? 3 : E.maxHoje()) + ' vagas novas por dia.';
    return t + ' As que passarem do limite ficam prontas neste aparelho, e você publica quando liberar.';
  }
  function ondeDaLinha(r) {
    var l = E.lojas().filter(function (x) { return x.id === r.loja; })[0] || E.lojas()[0];
    if (l) return { cidade: E.lojaCidadeSlug(l), bairro: l.bairro || (S.empresa ? S.empresa.bairro : '') };
    if (VR.nova) return { cidade: VR.onde.cidade, bairro: VR.onde.bairro };
    return { cidade: S.empresa.cidade, bairro: S.empresa.bairro };
  }
  function vagaDeLinha(r) {
    var m = temModelo(r), on = ondeDaLinha(r), diariaModelo = m && m.tipo === 'Diária';
    var sal = { min: num(r.de), periodo: r.por }; if (num(r.ate) > num(r.de)) sal.max = num(r.ate);
    var desc = r.descricao || (m && !diariaModelo ? m.descricao : 'Vaga de ' + r.titulo.trim() + ' em ' + (on.bairro ? on.bairro + ', ' : '') + E.cidadeNome(on.cidade) + '. Turno: ' + (r.turno || 'a combinar') + '. Os detalhes são combinados na conversa com a empresa.');
    return {
      titulo: r.titulo.trim(), setorId: m ? m.setorId : (S.empresa && E.setorPor(norm(S.empresa.setor)) ? norm(S.empresa.setor) : 'outros'), tipo: E.tipoApi(r.tipo), turno: r.turno,
      horario: m && !diariaModelo ? m.horario : '', salario: sal, beneficios: [], requisitos: m ? m.requisitos.slice() : [], descricao: desc,
      atividades: m ? m.atividades.slice() : [], perguntas: m ? m.perguntas.slice(0, 2) : [], vagasQtd: 1, semExperiencia: m ? m.semExperiencia : false, pcd: false,
      cidade: on.cidade, bairro: on.bairro
    };
  }
  function telaVarias() {
    var nova = !S.empresa;
    if (!VR || VR.nova !== nova) {
      VR = { nova: nova, fase: 'editar', erros: {}, agora: null, linhas: [], emp: { doc: '', ok: false, nome: '', resp: '', whats: '', email: '', consultado: '', consulta: null }, onde: { cidade: E.cidadePrincipal(), bairro: '' } };
      VR.linhas = [linhaVazia(), linhaVazia(), linhaVazia()];
    }
    var lojas = E.lojas();
    var sel = function (id, ops, atual, rot) {
      return '<div class="selecao"><select class="entrada" id="' + id + '" aria-label="' + esc(rot) + '">' + ops.map(function (o) { var val = Array.isArray(o) ? o[0] : o, txt = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(val) + '"' + (val === atual ? ' selected' : '') + '>' + esc(txt) + '</option>'; }).join('') + '</select>' + ic('chevron') + '</div>';
    };
    var voltar = nova ? '<a class="link voltar" href="#/anunciar">' + ic('voltar') + 'Voltar</a>' : '<a class="link voltar" href="#/vagas">' + ic('voltar') + 'Vagas</a>';
    var html;
    if (VR.fase === 'editar') {
      html = '<div class="cab"><div>' + voltar + '<h1>Anunciar várias vagas</h1><p>Uma linha por vaga. A descrição vem do modelo de cada função; dá para ajustar depois.' + (nova ? ' Os dados da empresa vêm no fim.' : '') + '</p></div></div>' +
        (nova || E.emVerificacao() ? '<div class="faixa calmo">' + ic('meio') + '<span>' + esc(textoLimiteVR()) + '</span></div>' : '') +
        '<form id="form-varias" class="mt-16" novalidate>' +
        (nova ? '<section class="cartao vr-end"><h2>Onde fica sua empresa</h2><p class="soft">É o endereço das vagas.</p>' +
          '<div class="linha2 mt-12"><div class="campo"><label for="vr-end-cidade">Cidade</label>' + E.selecao('vr-end-cidade', E.opcoesCidade(VR.onde.cidade)) + '</div>' +
          '<div class="campo" id="c-vr-end-bairro"><label for="vr-end-bairro">Bairro</label>' + E.selecao('vr-end-bairro', E.opcoesBairro(VR.onde.cidade, VR.onde.bairro), VR.erroEnd ? ' aria-invalid="true"' : '') + '</div></div>' +
          '<p class="erro-campo mt-8" id="vr-end-erro"' + (VR.erroEnd ? '' : ' hidden') + '>' + ic('erro') + 'Escolha o bairro.</p></section>' : '') +
        '<div class="vr-cab" aria-hidden="true"><span>Função</span><span>Salário de</span><span>até</span><span>por</span><span>Tipo</span><span>Turno</span><span>Onde</span><span></span></div>' +
        '<ul class="vr-lista">' + VR.linhas.map(function (r, i) {
          var p = 'vr-' + i, err = VR.erros[i], semModelo = r.titulo.trim() && !temModelo(r);
          var sug = semModelo ? MOD.sugerir(r.titulo, 3).filter(function (m) { return norm(m.titulo) !== norm(r.titulo); })[0] : null;
          var pers = E.PERIODOS.filter(function (o) { return E.periodosDoTipo(r.tipo).indexOf(o[0]) >= 0; }).map(function (o) { return [o[0], o[1].toLowerCase().replace('mês', 'mês')]; });
          return '<li class="vr-linha"' + (err ? ' aria-invalid="true"' : '') + '>' +
            '<div class="campo c-titulo"><label class="vr-rot" for="' + p + '-titulo">Função</label><input class="entrada" id="' + p + '-titulo" list="lista-funcoes" autocomplete="off" placeholder="Ex.: repositor" maxlength="60" value="' + esc(r.titulo) + '" data-i="' + i + '" data-k="titulo"></div>' +
            '<div class="campo c-de"><label class="vr-rot" for="' + p + '-de">Salário de</label><input class="entrada num" id="' + p + '-de" inputmode="numeric" placeholder="R$" value="' + esc(r.de ? milhar(num(r.de)) : '') + '" data-i="' + i + '" data-k="de"></div>' +
            '<div class="campo c-ate"><label class="vr-rot" for="' + p + '-ate">até</label><input class="entrada num" id="' + p + '-ate" inputmode="numeric" placeholder="opcional" value="' + esc(r.ate ? milhar(num(r.ate)) : '') + '" data-i="' + i + '" data-k="ate"></div>' +
            '<div class="campo c-por"><label class="vr-rot" for="' + p + '-por">por</label>' + sel(p + '-por', pers, r.por, 'Período do salário').replace('<select', '<select data-i="' + i + '" data-k="por"') + '</div>' +
            '<div class="campo c-tipo"><label class="vr-rot" for="' + p + '-tipo">Tipo</label>' + sel(p + '-tipo', TIPOS_VR, r.tipo, 'Tipo de contrato').replace('<select', '<select data-i="' + i + '" data-k="tipo"') + '</div>' +
            '<div class="campo c-turno"><label class="vr-rot" for="' + p + '-turno">Turno</label>' + sel(p + '-turno', [['', 'Escolha']].concat(E.TURNOS), r.turno, 'Turno').replace('<select', '<select data-i="' + i + '" data-k="turno"') + '</div>' +
            '<div class="campo c-onde"><label class="vr-rot" for="' + p + '-loja">Onde</label>' + (lojas.length ? sel(p + '-loja', lojas.map(function (l) { return [l.id, l.nome]; }).concat([['novo', 'Novo endereço…']]), r.loja, 'Endereço').replace('<select', '<select data-i="' + i + '" data-k="loja"') : '<span class="detalhe">Endereço da empresa</span>') + '</div>' +
            '<div class="c-tirar"><button class="btn-icone" type="button" data-acao="vr-tirar" data-i="' + i + '" aria-label="Tirar a linha ' + (i + 1) + '"' + (VR.linhas.length === 1 ? ' disabled' : '') + '>' + ic('lixo') + '</button></div>' +
            (semModelo ? '<p class="vr-aviso">' + ic('info') + '<span>Sem modelo para esta função: a descrição fica curta e dá para escrever na revisão.' + (sug ? ' Parece com <button class="link" type="button" data-acao="vr-usar-modelo" data-i="' + i + '" data-m="' + sug.id + '">' + esc(sug.titulo) + '</button>?' : '') + '</span></p>' : '') +
            (err ? '<p class="erro-campo vr-erro">' + ic('erro') + esc(err) + '</p>' : '') + '</li>';
        }).join('') + '</ul>' +
        '<div class="vr-rodape"><button class="btn sec" type="button" data-acao="vr-add">' + ic('mais') + 'Adicionar vaga</button>' +
        '<span class="detalhe">Dica: escreva a função e escolha da lista. Tipo e turno vêm do modelo. Diária: anuncie uma de cada vez.</span>' +
        (VR.temErro ? '<p class="erro-campo vr-erro-geral" role="alert">' + ic('erro') + 'Confira o que está marcado em vermelho.</p>' : '') +
        '<button class="btn grande" type="submit">Revisar ' + plural(VR.linhas.length, 'vaga', 'vagas') + '</button></div></form>';
    } else {
      var cabem = restanteAgora();
      var vs = VR.linhas.map(function (r, i) { var v = vagaDeLinha(r); v.publicadaEm = new Date(E.agora()).toISOString(); v._i = i; v._sem = !temModelo(r) && !r.descricao; return v; });
      var escolher = vs.length > cabem;
      if (!VR.agora || VR.agora.length !== vs.length) VR.agora = vs.map(function (v, k) { return k < cabem; });
      var marcadas = 0; VR.agora = VR.agora.map(function (a) { if (a && marcadas < cabem) { marcadas++; return true; } return false; });
      VR.cabemRender = cabem;
      var algumSem = vs.some(function (v) { return v._sem; });
      var empPrev = nova ? { nome: VR.emp.nome.trim() || 'Sua empresa', verificada: false } : S.empresa;
      html = '<div class="cab"><div><button class="link voltar" type="button" data-acao="vr-voltar">' + ic('voltar') + 'Voltar e editar</button><h1>Revise as ' + plural(vs.length, 'vaga', 'vagas') + '</h1>' +
        '<p>É assim que as pessoas vão ver. ' + (algumSem ? 'A descrição veio do modelo de cada função. As marcadas "Sem modelo" estão com descrição curta.' : 'A descrição veio do modelo de cada função.') + '</p></div></div>' +
        (escolher ? '<div class="faixa calmo">' + ic('relogio') + '<span>' + (cabem ? 'Cabem ' + cabem + ' no ar agora. Marque quais entram já; as outras ficam prontas neste aparelho e você publica quando o limite liberar.' : 'Nenhuma cabe no ar agora. Todas ficam prontas neste aparelho e você publica quando o limite liberar.') + '</span></div>' : '') +
        '<ul class="revisao mt-16">' + vs.map(function (v, k) {
          var on = VR.agora[k];
          return '<li>' + E.cartaoVaga(v, empPrev) +
            (v._sem ? '<p class="vr-aviso">' + ic('info') + '<span>Sem modelo: a descrição está curta. <button class="link" type="button" data-acao="vr-descricao" data-i="' + v._i + '">Escrever agora</button></span></p>' : '') +
            '<div class="fila">' + (escolher && cabem ? '<label class="opcao" for="vr-agora-' + k + '"><input type="checkbox" id="vr-agora-' + k + '" data-agora="' + k + '"' + (on ? ' checked' : '') + (!on && marcadas >= cabem ? ' disabled' : '') + '> Pôr no ar agora</label>'
              : '<span>' + (on ? '<span class="status ok">' + ic('ponto') + 'Entra no ar</span>' : '<span class="status calmo">' + ic('relogio') + 'Fica pronta</span>') + '</span>') +
            '<button class="link" type="button" data-acao="vr-editar" data-i="' + v._i + '">Editar</button></div></li>';
        }).join('') + '</ul>' +
        (nova ? '<section class="cartao mt-24" id="vr-empresa"><h2>Sua empresa</h2><p class="soft">Falta só sua empresa. Para as vagas irem ao ar, diga quem está anunciando. Leva 1 minuto.</p>' +
          '<form class="pilha mt-12" id="form-vr-emp" novalidate>' + E.blocoEmpresa(VR.emp) + '</form></section><div class="mt-16" id="vr-emp-erros" aria-live="polite"></div>' : '') +
        '<div id="vr-resultado" aria-live="polite"></div>' +
        '<div class="vr-rodape"><span class="detalhe">Depois de publicar, dá para editar cada uma na lista de vagas.</span><button class="btn grande" type="button" id="vr-publicar" data-acao="vr-publicar">Publicar ' + plural(vs.length, 'vaga', 'vagas') + '</button></div>' +
        '<div class="mt-24">' + E.golpe() + '</div>';
    }
    return { html: html, nav: nova ? null : 'vagas', barra: nova ? null : 'baixo', cinza: true, topoBotao: false, manterRolagem: VR.manter, titulo: 'Anunciar várias vagas', depois: ligarVarias };
  }
  function ligarVarias() {
    VR.manter = false;
    var fe = $('#form-vr-emp');
    if (fe) {
      E.EMPX = VR.emp;
      fe.addEventListener('submit', function (e) { e.preventDefault(); });
      var h = function (e) { if (E.aoDigitarEmpresa(e)) revisarEmpVR(); };
      fe.addEventListener('input', h); fe.addEventListener('change', h);
      E.empMudou = revisarEmpVR;
      if (VR.emp.ok) E.pintarEmpresaAchada();
    }
    $$('[data-agora]').forEach(function (cb) { cb.addEventListener('change', function () { VR.agora[+cb.getAttribute('data-agora')] = cb.checked; VR.manter = true; E.render(); var n = document.getElementById(cb.id); if (n) n.focus({ preventScroll: true }); }); });
    var f = $('#form-varias'); if (!f) return;
    var ec = $('#vr-end-cidade'), eb = $('#vr-end-bairro');
    if (ec) ec.addEventListener('change', function () { VR.onde.cidade = ec.value; VR.onde.bairro = ''; eb.innerHTML = E.opcoesBairro(ec.value, ''); });
    if (eb) eb.addEventListener('change', function () { VR.onde.bairro = eb.value; if (eb.value) { VR.erroEnd = false; $('#vr-end-erro').hidden = true; eb.removeAttribute('aria-invalid'); } });
    f.addEventListener('input', function (e) {
      var el = e.target, i = el.getAttribute('data-i'); if (i == null) return; var k = el.getAttribute('data-k');
      if (k === 'loja' && el.value === 'novo') return;
      VR.linhas[i][k] = k === 'de' || k === 'ate' ? String(num(el.value) || '') : el.value;
    });
    f.addEventListener('change', function (e) {
      var el = e.target, i = el.getAttribute('data-i'); if (i == null) return; var k = el.getAttribute('data-k'), r = VR.linhas[i];
      if (k === 'loja' && el.value === 'novo') { el.value = r.loja; abrirNovoEndereco(+i); return; }
      if (k === 'titulo') { aplicarLinhaModelo(r); VR.manter = true; var foco = el.id; E.render(); var n = document.getElementById(foco.replace('titulo', 'de')); if (n) n.focus(); }
      if (k === 'tipo') { var ok = E.periodosDoTipo(r.tipo); if (ok.indexOf(r.por) < 0) r.por = ok[0]; VR.manter = true; E.render(); }
      if (k === 'de' || k === 'ate') el.value = r[k] ? milhar(num(r[k])) : '';
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault(); VR.erros = {}; VR.erroEnd = !!(VR.nova && !VR.onde.bairro);
      VR.linhas.forEach(function (r, i) {
        var falta = [];
        if (!r.titulo.trim()) falta.push('função'); if (!num(r.de)) falta.push('salário'); if (!r.turno) falta.push('turno');
        if (falta.length) VR.erros[i] = 'Falta ' + falta.join(', ') + '.';
      });
      VR.temErro = !!(Object.keys(VR.erros).length || VR.erroEnd);
      if (VR.temErro) {
        VR.manter = true; E.render();
        var alvo = VR.erroEnd ? $('#vr-end-bairro') : $('.vr-linha[aria-invalid="true"] input'); if (alvo) { alvo.scrollIntoView({ block: 'center' }); alvo.focus({ preventScroll: true }); }
        return;
      }
      VR.fase = 'revisar'; VR.agora = null; E.render(); window.scrollTo(0, 0);
    });
  }
  function revisarEmpVR() {
    if (!VR || !VR.nova || VR.fase !== 'revisar') return;
    if (!VR.tentouEmp) return;
    var f = E.faltasEmpresa(VR.emp, []), ids = f.map(function (x) { return x[0]; });
    ['c-doc', 'c-empnome', 'c-resp', 'c-whats', 'c-email'].forEach(function (cid) { if (ids.indexOf(cid) < 0) E.limparErro(cid); });
    var cx = $('#vr-emp-erros'); if (cx) cx.innerHTML = f.length ? E.caixaFaltas(f, false) : '';
  }
  function abrirNovoEndereco(i) {
    abrir('folha-curta', folhaTopo('folha-curta-titulo', 'Novo endereço') + '<form class="folha-corpo" id="form-vr-loja" novalidate>' +
      '<div class="campo"><label for="nl-nome">Nome do endereço</label><input class="entrada" id="nl-nome" maxlength="80" placeholder="Ex.: Loja do Setor Sul" autofocus></div>' +
      '<div class="linha2 mt-12"><div class="campo"><label for="nl-cidade">Cidade</label>' + E.selecao('nl-cidade', E.opcoesCidade(S.empresa.cidade)) + '</div><div class="campo"><label for="nl-bairro">Bairro</label>' + E.selecao('nl-bairro', E.opcoesBairro(S.empresa.cidade, '')) + '</div></div>' +
      '<p class="erro-campo mt-8" id="nl-erro" role="alert" hidden></p></form>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Cancelar</button><button class="btn" type="submit" form="form-vr-loja">Adicionar endereço</button></div>');
    $('#nl-cidade').addEventListener('change', function () { $('#nl-bairro').innerHTML = E.opcoesBairro(this.value, ''); });
    $('#form-vr-loja').addEventListener('submit', function (e) {
      e.preventDefault();
      var nome = $('#nl-nome').value.trim(), cid = $('#nl-cidade').value, b = $('#nl-bairro').value, er = $('#nl-erro');
      if (!nome || !b) { er.hidden = false; er.innerHTML = ic('erro') + 'Escreva o nome e escolha o bairro.'; return; }
      E.adicionarLoja({ nome: nome, cidade: cid, bairro: b }).then(function (l) {
        VR.linhas[i].loja = l.id;
        fechar('folha-curta', function () { VR.manter = true; E.render(); toast('Endereço adicionado: ' + nome); });
      }, function (x) { er.hidden = false; er.innerHTML = ic('erro') + esc(E.msgErro(x)); });
    });
  }
  /* guarda um endereço novo na empresa (empresaSalvar) e devolve o endereço salvo */
  E.adicionarLoja = function (l) {
    var lojas = E.lojas().map(function (x) { return { id: x.id, nome: x.nome, bairro: x.bairro, cidade: x.cidade }; });
    var id = 'l' + (lojas.length + 1); while (lojas.some(function (x) { return x.id === id; })) id += 'x';
    lojas.push({ id: id, nome: l.nome, bairro: l.bairro, cidade: l.cidade });
    return E.api('empresaSalvar', { empresaId: S.empresa.id, lojas: lojas }).then(function (r) {
      S.empresa = r.empresa; for (var i = 0; i < S.empresas.length; i++) if (S.empresas[i].id === r.empresa.id) S.empresas[i] = r.empresa;
      return { id: id, nome: l.nome };
    });
  };
  ACOES['vr-add'] = function () { VR.linhas.push(linhaVazia()); VR.manter = true; E.render(); var i = document.getElementById('vr-' + (VR.linhas.length - 1) + '-titulo'); if (i) i.focus(); };
  ACOES['vr-tirar'] = function (el) { var i = parseInt(el.getAttribute('data-i'), 10), r = VR.linhas.splice(i, 1)[0]; VR.erros = {}; VR.manter = true; E.render(); toast('Linha tirada', 'Desfazer', function () { VR.linhas.splice(i, 0, r); VR.manter = true; E.render(); }, 'lixo'); };
  ACOES['vr-voltar'] = function () { VR.fase = 'editar'; E.render(); };
  ACOES['vr-editar'] = function (el) { VR.fase = 'editar'; E.render(); var i = document.getElementById('vr-' + el.getAttribute('data-i') + '-titulo'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } };
  ACOES['vr-usar-modelo'] = function (el) {
    var r = VR.linhas[+el.getAttribute('data-i')], m = MOD.porId[el.getAttribute('data-m')]; if (!r || !m) return;
    r.titulo = m.titulo; aplicarLinhaModelo(r); VR.manter = true; E.render(); toast('Modelo de ' + m.titulo + ' aplicado na linha');
  };
  ACOES['vr-descricao'] = function (el) {
    var i = +el.getAttribute('data-i'), r = VR.linhas[i];
    abrir('folha', folhaTopo('folha-titulo', 'Como é o trabalho: ' + r.titulo) + '<form class="folha-corpo" id="form-vr-desc" novalidate><div class="campo"><label for="vr-desc">Descrição</label>' +
      '<textarea class="entrada" id="vr-desc" rows="6" maxlength="1500" placeholder="Conte o dia a dia: o que a pessoa faz, com quem trabalha e o que é bom saber antes.">' + esc(r.descricao || '') + '</textarea>' +
      '<p class="erro-campo" id="vr-desc-erro" role="alert" hidden></p></div></form>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Cancelar</button><button class="btn" type="button" id="vr-desc-ok">Salvar descrição</button></div>');
    $('#vr-desc-ok').addEventListener('click', function () {
      var t = $('#vr-desc').value.trim(), er = $('#vr-desc-erro');
      if (t.length < 40) { er.hidden = false; er.innerHTML = ic('erro') + 'Descreva a vaga em pelo menos 40 letras.'; return; }
      E.api('textoChecar', { texto: t, contexto: 'vaga' }).then(function (c) {
        if (c.barra && c.barra.length) { er.hidden = false; er.innerHTML = ic('erro') + esc(c.barra.map(function (b) { return b.mensagem; }).join(' ')); return; }
        r.descricao = t; fechar('folha', function () { VR.manter = true; E.render(); toast('Descrição salva'); });
      }, function (x) { er.hidden = false; er.innerHTML = ic('erro') + esc(E.msgErro(x)); });
    });
  };
  ACOES['vr-publicar'] = function () {
    var btn = $('#vr-publicar');
    if (VR.nova) {
      VR.tentouEmp = true;
      var f = E.faltasEmpresa(VR.emp, []);
      if (f.length) { var cx = $('#vr-emp-erros'); cx.innerHTML = E.caixaFaltas(f, true); E.marcarFaltas(f); cx.scrollIntoView({ block: 'center', behavior: E.movimentoReduzido() ? 'auto' : 'smooth' }); return; }
      var m0 = VR.linhas.map(temModelo).filter(Boolean)[0];
      btn.disabled = true;
      E.criarContaEmpresa(VR.emp, { cidade: VR.onde.cidade, bairro: VR.onde.bairro, setorId: m0 ? m0.setorId : 'outros', ocupado: function () { btn.disabled = true; } }).then(function (emp) {
        if (!emp) { btn.disabled = false; return; }
        publicarLinhas();
      }, function (e) { btn.disabled = false; toast(E.msgErro(e), null, null, 'erro'); });
      return;
    }
    btn.disabled = true; publicarLinhas();
  };
  function publicarLinhas() {
    var cabem = restanteAgora(), escolher = VR.linhas.length > cabem, usadas = 0, vagasOk = 0, prontas = [], falhas = [];
    var lote = E.lerLote();
    var fila = VR.linhas.map(function (r, k) { return { r: r, quer: escolher ? !!(VR.agora && VR.agora[k]) : true }; });
    var seq = Promise.resolve();
    fila.forEach(function (it) {
      seq = seq.then(function () {
        var v = vagaDeLinha(it.r);
        if (!it.quer || usadas >= cabem) { prontas.push({ idLocal: it.r.idLocal, vaga: v }); return null; }
        return E.api('vagaPublicar', { empresaId: S.empresa.id, vaga: v, idLocal: it.r.idLocal }).then(function (res) {
          if (res.estado === 'no_ar' || res.estado === 'revisao_rapida') { usadas++; vagasOk++; } else prontas.push({ idLocal: it.r.idLocal, vaga: v });
        }, function (e) {
          if (e && e.codigo === 'limite_dia') { prontas.push({ idLocal: it.r.idLocal, vaga: v }); return; }
          falhas.push(it.r.titulo + ': ' + E.msgErro(e));
        });
      });
    });
    seq.then(function () {
      E.gravarLote(lote.concat(prontas));
      return E.carregarVagas();
    }).then(function () {
      var res = $('#vr-resultado');
      if (falhas.length && res) { res.innerHTML = '<div class="caixa-erro" role="alert">' + ic('erro') + '<div><b>Algumas vagas não foram publicadas</b><ul>' + falhas.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div></div>'; var b = $('#vr-publicar'); if (b) b.disabled = false; if (vagasOk) { VR.linhas = []; } }
      if (falhas.length) return;
      VR = null; E.esquecerTela(); UI.aba = vagasOk ? 'aberta' : 'pronta';
      ir('#/vagas?aba=' + UI.aba);
      toast(plural(vagasOk, 'vaga no ar', 'vagas no ar') + (prontas.length ? ' · ' + plural(prontas.length, 'pronta', 'prontas') + ' neste aparelho' : ''));
    }, function (e) { toast(E.msgErro(e), null, null, 'erro'); var b2 = $('#vr-publicar'); if (b2) b2.disabled = false; });
  }
})();
