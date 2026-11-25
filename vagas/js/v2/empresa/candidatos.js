/* ==========================================================================
   Site da empresa · E9 Candidatos (quadro e lista, filtros só por fato, ordem só por data)
   Sem nota, sem classificação, sem "compatibilidade": a ordem é por data e só.
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP, S = E.S, UI = E.UI, TELAS = E.TELAS, PRE = E.PRE, ACOES = E.ACOES;
  var esc = E.esc, ic = E.ic, $ = E.$, $$ = E.$$, abrir = E.abrir, fechar = E.fechar, folhaTopo = E.folhaTopo, toast = E.toast, ir = E.ir, norm = E.norm, plural = E.plural;

  /* ---------- leitura do candidato (forma CANDIDATO_EMPRESA do contrato) ---------- */
  function r0(c) { return c.resumo || {}; }
  E.cnhTxt = function (l) { l = (l || []).filter(Boolean); return l.length ? l.join(', ') : 'não tem'; };
  E.fatosPessoa = function (c) {
    var r = r0(c), onde = [r.bairro, r.cidade && r.cidade !== (S.empresa && S.empresa.cidade) ? E.cidadeNome(r.cidade) : ''].filter(Boolean).join(', ');
    return [onde, 'CNH: ' + E.cnhTxt(r.cnh), (r.turnos || []).slice(0, 3).join(', ')].filter(Boolean);
  };
  function perguntaDe(c, i, r) {
    if (r && typeof r === 'object' && r.pergunta) return r.pergunta;
    var v = E.vagaPor(c.vagaId); return v && v.perguntas && v.perguntas[i] ? v.perguntas[i] : 'Pergunta ' + (i + 1);
  }
  function respostaDe(r) {
    var t = r && typeof r === 'object' && !Array.isArray(r) ? r.resposta : r;
    if (t === true) return 'Sim'; if (t === false) return 'Não';
    t = String(t == null ? '' : t); var n = norm(t);
    return n === 'sim' ? 'Sim' : n === 'nao' ? 'Não' : t;
  }
  E.respostas = function (c) { return (c.respostas || []).map(function (r, i) { return { pergunta: perguntaDe(c, i, r), resposta: respostaDe(r) }; }); };
  function rotuloPergunta(p) { return String(p).replace(/\?$/, ''); }
  E.statusCand = function (c) {
    var e = c.etapa;
    if (e === 'nova') return '<span class="status novo">' + ic('ponto') + 'Novo</span>';
    if (e === 'vista') return '<span class="status calmo">' + ic('olho') + 'Visto</span>';
    if (e === 'em conversa') return c.naoLidas > 0 ? '<span class="status info">' + ic('conversa') + 'Mensagem nova</span>' : '<span class="status calmo">' + ic('conversa') + 'Em conversa</span>';
    if (e === 'entrevista marcada') {
      var en = c.entrevista, v = E.vagaPor(c.vagaId), rot = v && v.tipo === 'Diária' ? 'Diária ' : 'Entrevista ';
      if (!en) return '<span class="status ok">' + ic('calendario') + 'Entrevista</span>';
      var q = esc(E.quando(E.ms(en.quando)));
      if (en.pediuOutro) return '<span class="status aviso">' + ic('calendario') + rot + q + ' · pediu outro horário</span>';
      return en.confirmada === true ? '<span class="status ok">' + ic('calendario') + rot + q + ' · confirmada</span>' : '<span class="status aviso">' + ic('calendario') + rot + q + ' · a confirmar</span>';
    }
    if (e === 'contratada') return '<span class="status ok">' + ic('check2') + 'Contratado</span>';
    return '<span class="status fim">' + ic('x') + (E.retirou(c) ? 'Retirou a candidatura' : 'Não seguiu') + '</span>';
  };
  /* a pessoa retirou a candidatura: a última linha do histórico diz "por: pessoa" */
  E.retirou = function (c) {
    var h = c.historico || [];
    for (var i = h.length - 1; i >= 0; i--) if (h[i].etapa === 'não seguiu') return h[i].por === 'pessoa';
    return false;
  };

  /* ---------- filtros: só fatos que a própria pessoa informou ---------- */
  function filtrosVazios() { var f = UI.filtros; return !(f.anexo || f.simTodas || (f.sim && Object.keys(f.sim).some(function (k) { return f.sim[k]; })) || (f.bairros && f.bairros.length) || (f.turnos && f.turnos.length) || (f.cnh && f.cnh.length) || (f.esc && f.esc.length) || f.data); }
  function ehSim(r) { return r.resposta === 'Sim'; }
  function aplicarFiltros(lista) {
    var f = UI.filtros;
    return lista.filter(function (c) {
      var r = r0(c), rs = E.respostas(c);
      if (f.anexo && c.forma !== 'anexo') return false;
      if (f.simTodas && rs.some(function (x) { return !ehSim(x); })) return false;
      if (f.sim) for (var k in f.sim) if (f.sim[k] && (!rs[k] || !ehSim(rs[k]))) return false;
      if (f.bairros && f.bairros.length && f.bairros.indexOf(r.bairro + '|' + r.cidade) < 0) return false;
      if (f.turnos && f.turnos.length && !f.turnos.some(function (d) { return (r.turnos || []).indexOf(d) >= 0; })) return false;
      if (f.cnh && f.cnh.length && !f.cnh.some(function (d) { return (r.cnh || []).indexOf(d) >= 0; })) return false;
      if (f.esc && f.esc.length && f.esc.indexOf(r.escolaridade) < 0) return false;
      if (f.data === '24h' && E.agora() - c.t > 24 * E.HORA) return false;
      if (f.data === '7d' && E.agora() - c.t > 7 * E.DIA) return false;
      return true;
    });
  }
  function ordenarData(l) { return l.sort(function (a, b) { return UI.ordem === 'antigos' ? a.t - b.t : b.t - a.t; }); }

  function cartaoCand(c, mostraVaga) {
    var v = E.vagaPor(c.vagaId), rs = E.respostas(c);
    var resp = rs.map(function (r) { return esc(rotuloPergunta(r.pergunta)) + ': <b>' + esc(r.resposta || 'sem resposta') + '</b>'; }).join(' · ');
    return '<li><article class="cartao-candidato" data-cand="' + esc(c.id) + '"' + (E.ehMouse() ? ' draggable="true"' : '') + '>' +
      '<div class="cc-topo"><span class="avatar p">' + esc(E.iniciais(c.nome)) + '</span><div class="cc-nome"><a class="cc-link" href="#/candidato/' + encodeURIComponent(c.id) + '">' + esc(c.nome) + '</a>' +
      '<small>' + (mostraVaga && v ? esc(E.tituloLocal(v)) + ' · ' : '') + esc(E.ha(c.t)) + ' ' + E.exemplo() + '</small></div>' +
      '<button class="btn-icone peq" type="button" data-acao="mover-menu" data-id="' + esc(c.id) + '" aria-haspopup="menu" aria-expanded="false" aria-label="Mover ' + esc(E.primeiroNome(c.nome)) + ' para outra etapa">' + ic('opcoes') + '</button></div>' +
      '<p class="cc-fatos-txt">' + E.fatosPessoa(c).map(esc).join(' · ') + '</p>' +
      (resp ? '<p class="cc-resp">' + resp + '</p>' : '') +
      '<div class="cc-rodape">' + E.statusCand(c) + (c.forma === 'anexo' ? '<span>' + ic('anexo') + 'Currículo anexado</span>' : '<span class="muted">Montado no site</span>') + '</div>' +
      '</article></li>';
  }

  /* ---------- tela ---------- */
  TELAS.candidatos = function (r) {
    var arg = r.q.vaga || ''; if (arg && !E.vagaPor(arg)) arg = '';
    var chaveQ = (r.q.vaga || '') + '|' + (r.q.etapa || '');
    if (UI.queryAplicada !== chaveQ) {
      UI.queryAplicada = chaveQ;
      if (UI.listaVaga !== arg) { UI.filtros = {}; UI.sel = {}; }
      if (r.q.etapa) { UI.filtros.etapa = E.COL_DA_ETAPA[r.q.etapa] || r.q.etapa; UI.visao = 'lista'; }   /* aceita a etapa do banco ou a coluna da tela */
    }
    UI.listaVaga = arg;
    if (!UI.visao) UI.visao = E.ehCelular() ? 'lista' : 'quadro';
    var f = UI.filtros, lojasMult = E.variasLojas();
    if (!lojasMult || arg) UI.filtroLoja = '';
    var daLoja = function (c) { if (!UI.filtroLoja) return true; var vv = E.vagaPor(c.vagaId), l = vv && E.lojaDe(vv); return !!l && l.id === UI.filtroLoja; };
    var v = arg ? E.vagaPor(arg) : null, todos = E.candsDa(arg).filter(daLoja), lista = ordenarData(aplicarFiltros(todos));
    var vagasCom = S.vagas.filter(function (x) { return E.grupoVaga(x) !== 'rascunho' && E.grupoVaga(x) !== 'revisao' || x.candidatos; });
    var chips = '<button class="chip" type="button" data-acao="filtro-toggle" data-k="anexo" aria-pressed="' + !!f.anexo + '">' + ic('check', 'marca') + 'Com currículo anexado</button>';
    if (v && v.perguntas && v.perguntas.length) v.perguntas.forEach(function (q, i) { chips += '<button class="chip" type="button" data-acao="filtro-sim" data-i="' + i + '" aria-pressed="' + !!(f.sim && f.sim[i]) + '">' + ic('check', 'marca') + 'Respondeu sim: ' + esc(rotuloPergunta(q)) + '</button>'; });
    else chips += '<button class="chip" type="button" data-acao="filtro-toggle" data-k="simTodas" aria-pressed="' + !!f.simTodas + '">' + ic('check', 'marca') + 'Respondeu sim a todas as perguntas</button>';
    [['bairros', 'Onde mora'], ['turnos', 'Pode trabalhar'], ['cnh', 'CNH'], ['esc', 'Estudo'], ['data', 'Data']].forEach(function (x) {
      var n = x[0] === 'data' ? (f.data ? 1 : 0) : (f[x[0]] || []).length;
      chips += '<button class="chip" type="button" data-acao="filtros" data-sec="' + x[0] + '" aria-pressed="' + (n > 0) + '">' + esc(x[1]) + (n ? ' <span class="contador">' + n + '</span>' : '') + ic('chevron', 'seta') + '</button>';
    });
    var ativos = [];
    if (f.anexo) ativos.push(['anexo', '', 'Com currículo anexado']);
    if (f.simTodas) ativos.push(['simTodas', '', 'Sim a todas as perguntas']);
    if (f.sim) Object.keys(f.sim).forEach(function (i) { if (f.sim[i] && v && v.perguntas[i]) ativos.push(['sim', i, 'Sim: ' + rotuloPergunta(v.perguntas[i])]); });
    (f.bairros || []).forEach(function (b) { var p = b.split('|'); ativos.push(['bairros', b, p[0]]); });
    (f.turnos || []).forEach(function (d) { ativos.push(['turnos', d, d]); });
    (f.cnh || []).forEach(function (d) { ativos.push(['cnh', d, 'CNH ' + d]); });
    (f.esc || []).forEach(function (d) { ativos.push(['esc', d, d]); });
    if (f.data) ativos.push(['data', '', f.data === '24h' ? 'Últimas 24 horas' : 'Últimos 7 dias']);
    var corpo;
    if (!todos.length) {
      corpo = '<div class="cartao vazio">' + ic('pessoas') + '<b>Ainda não chegou ninguém</b><p>Compartilhe a vaga no WhatsApp para chegar mais rápido.</p>' +
        (v && v.status === 'aberta' ? '<button class="btn sec" type="button" data-acao="compartilhar-vaga" data-id="' + esc(v.id) + '">' + ic('compartilhar') + 'Compartilhar</button>' : '') + '</div>';
    } else if (!lista.length) {
      corpo = '<div class="cartao vazio">' + ic('filtro') + '<b>Ninguém com estes filtros</b><p>Tire algum filtro para ver mais pessoas.</p><button class="btn sec" type="button" data-acao="limpar-filtros">Limpar filtros</button></div>';
    } else if (UI.visao === 'quadro') {
      corpo = '<div class="quadro" id="quadro">' + E.COLUNAS.map(function (col) {
        var cs = lista.filter(function (c) { return col.etapas.indexOf(c.etapa) >= 0; });
        return '<section class="coluna" data-col="' + col.id + '" aria-label="' + col.nome + '"><div class="coluna-topo"><h3>' + col.nome + '</h3><span class="coluna-n">' + cs.length + '</span></div>' +
          '<ul class="coluna-lista">' + (cs.length ? cs.map(function (c) { return cartaoCand(c, !v); }).join('') : '<li class="vazio-col">' + (E.ehMouse() ? 'Arraste alguém para cá' : 'Ninguém nesta etapa') + '</li>') + '</ul></section>';
      }).join('') + '</div>';
    } else {
      var et = f.etapa || '';
      var porCol = function (id) { return lista.filter(function (c) { return !id || E.COL_DA_ETAPA[c.etapa] === id; }); };
      var lst = porCol(et), selN = Object.keys(UI.sel).filter(function (k) { return UI.sel[k]; }).length;
      corpo = '<div class="abas no-topo" role="tablist" aria-label="Etapa">' + [['', 'Todos']].concat(E.COLUNAS.map(function (c) { return [c.id, c.nome]; })).map(function (x) {
        return '<button class="aba" type="button" role="tab" data-acao="lista-etapa" data-e="' + x[0] + '" aria-selected="' + (et === x[0]) + '">' + x[1] + ' <span class="n">' + porCol(x[0]).length + '</span></button>';
      }).join('') + '</div>' +
        (lst.length ?
          '<div class="tabela-caixa so-pc"><table class="tabela"><thead><tr><th class="marcar"><input type="checkbox" id="sel-todos" aria-label="Marcar todos"' + (selN && selN === lst.length ? ' checked' : '') + '></th>' +
          '<th aria-sort="' + (UI.ordem === 'antigos' ? 'ascending' : 'descending') + '"><button class="ordenar" type="button" data-acao="inverter-ordem">Pessoa e data' + ic('chevron') + '</button></th><th>Fatos que a pessoa informou</th><th>Currículo</th><th>Etapa</th></tr></thead><tbody>' +
          lst.map(function (c) {
            var vv = E.vagaPor(c.vagaId), rs = E.respostas(c);
            return '<tr data-cand="' + esc(c.id) + '"' + (UI.sel[c.id] ? ' aria-selected="true"' : '') + '><td class="marcar"><input type="checkbox" id="sel-' + esc(c.id) + '" data-sel="' + esc(c.id) + '" aria-label="Marcar ' + esc(c.nome) + '"' + (UI.sel[c.id] ? ' checked' : '') + '></td>' +
              '<td><div class="pessoa"><span class="avatar p">' + esc(E.iniciais(c.nome)) + '</span><div><a href="#/candidato/' + encodeURIComponent(c.id) + '">' + esc(c.nome) + '</a> ' + E.exemplo() + '<small>' + (!v && vv ? esc(E.tituloLocal(vv)) + ' · ' : '') + esc(E.ha(c.t)) + '</small></div></div></td>' +
              '<td class="fatos-cel">' + esc(E.fatosPessoa(c).join(' · ')) +
              (rs.length ? '<small>' + rs.map(function (r) { return esc(rotuloPergunta(r.pergunta)) + ': <b>' + esc(r.resposta) + '</b>'; }).join(' · ') + '</small>' : '') + '</td>' +
              '<td class="nowrap">' + (c.forma === 'anexo' ? ic('anexo') + ' Anexado' : 'Montado no site') + '</td><td>' + E.statusCand(c) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          '<ul class="lista-cands so-cel">' + lst.map(function (c) { return cartaoCand(c, !v); }).join('') + '</ul>' +
          (selN ? '<div class="barra-selecao so-pc" role="region" aria-label="Selecionados"><b>' + plural(selN, 'selecionado', 'selecionados') + '</b>' +
            '<button class="btn sec peq" type="button" data-acao="sel-mover" aria-haspopup="menu" aria-expanded="false">Mover para' + ic('chevron') + '</button>' +
            '<button class="btn sec peq" type="button" data-acao="sel-mensagem">' + ic('conversa') + 'Mandar mensagem</button>' +
            '<button class="btn fantasma peq" type="button" data-acao="sel-naoseguir">Não seguir</button>' +
            '<button class="btn fantasma peq" type="button" data-acao="sel-limpar">Limpar</button></div>' : '')
          : '<div class="cartao vazio">' + ic('pessoas') + '<b>Ninguém nesta etapa</b><p>Escolha outra etapa acima.</p></div>');
    }
    var html =
      '<div class="cab"><div><h1>Candidatos</h1><p>' + (v ? esc(E.tituloLocal(v)) + ' · ' : '') + plural(todos.length, 'pessoa se candidatou', 'pessoas se candidataram') + '</p></div></div>' +
      '<div class="cand-cab">' +
      (lojasMult && !arg ? '<label class="sr" for="filtro-loja">Loja ou endereço</label><div class="selecao selecao-loja"><select class="entrada" id="filtro-loja"><option value="">Todas as lojas</option>' +
        E.lojas().map(function (l) { return '<option value="' + esc(l.id) + '"' + (l.id === UI.filtroLoja ? ' selected' : '') + '>' + esc(l.nome) + '</option>'; }).join('') + '</select>' + ic('chevron') + '</div>' : '') +
      '<label class="sr" for="filtro-vaga">Vaga</label><div class="selecao"><select class="entrada" id="filtro-vaga"><option value="">Todas as vagas</option>' +
      vagasCom.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === arg ? ' selected' : '') + '>' + esc(E.tituloLocal(x)) + (x.candidatos != null ? ' (' + x.candidatos + ')' : '') + '</option>'; }).join('') + '</select>' + ic('chevron') + '</div>' +
      '<div class="segmentado" role="group" aria-label="Como ver"><button type="button" data-acao="visao" data-v="quadro" aria-pressed="' + (UI.visao === 'quadro') + '">' + ic('quadro') + ' Quadro</button><button type="button" data-acao="visao" data-v="lista" aria-pressed="' + (UI.visao === 'lista') + '">' + ic('lista') + ' Lista</button></div>' +
      '</div>' +
      '<div class="filtros-linha"><div class="chips" id="chips-filtro">' + chips + '</div>' +
      (ativos.length ? '<div class="filtros-ativos">' + ativos.map(function (a) { return '<span class="filtro-ativo">' + esc(a[2]) + '<button type="button" data-acao="tirar-filtro" data-k="' + a[0] + '" data-v="' + esc(a[1]) + '" aria-label="Tirar filtro ' + esc(a[2]) + '">' + ic('x') + '</button></span>'; }).join('') + '<button class="link" type="button" data-acao="limpar-filtros">Limpar filtros</button></div>' : '') +
      '<div class="ordem-linha"><span class="detalhe">' + (filtrosVazios() ? plural(lista.length, 'pessoa', 'pessoas') : plural(lista.length, 'pessoa', 'pessoas') + ' com estes filtros') + (UI.visao === 'quadro' ? ' · mude a etapa pelo ⋯ do cartão' + (E.ehMouse() ? ' ou arrastando' : '') : '') + '</span>' +
      '<label class="sr" for="ordem">Ordem</label><div class="selecao"><select class="entrada" id="ordem"><option value="recentes"' + (UI.ordem !== 'antigos' ? ' selected' : '') + '>Mais recentes primeiro</option><option value="antigos"' + (UI.ordem === 'antigos' ? ' selected' : '') + '>Mais antigos primeiro</option></select>' + ic('chevron') + '</div></div>' +
      '</div>' + corpo +
      '<p class="nota-data rodape-fixo-nota">' + ic('info') + 'A ordem é por data. O Vagas sem Caos não dá nota nem classifica pessoas.</p>' +
      '<div class="mt-16">' + E.golpe() + '</div>';
    return { html: html, nav: 'candidatos', barra: 'baixo', cinza: true, titulo: 'Candidatos', depois: ligarCandidatos };
  };
  function ligarCandidatos() {
    var sv = $('#filtro-vaga'); if (sv) sv.addEventListener('change', function () { UI.filtros = {}; ir(sv.value ? '#/candidatos?vaga=' + encodeURIComponent(sv.value) : '#/candidatos'); });
    var sl = $('#filtro-loja'); if (sl) sl.addEventListener('change', function () { UI.filtroLoja = sl.value; UI.sel = {}; E.render(); });
    var so = $('#ordem'); if (so) so.addEventListener('change', function () { UI.ordem = so.value; E.render(); });
    var app = $('#app');
    app.onclick = function (e) {
      var card = e.target.closest('.cartao-candidato'), tr = e.target.closest('tr[data-cand]');
      if (e.target.closest('button,input,a')) return;
      if (card) ir('#/candidato/' + encodeURIComponent(card.getAttribute('data-cand')));
      else if (tr) ir('#/candidato/' + encodeURIComponent(tr.getAttribute('data-cand')));
    };
    app.onchange = function (e) {
      var cb = e.target;
      if (cb.id === 'sel-todos') { $$('[data-sel]').forEach(function (x) { UI.sel[x.getAttribute('data-sel')] = cb.checked; }); E.render(); }
      else if (cb.hasAttribute('data-sel')) { UI.sel[cb.getAttribute('data-sel')] = cb.checked; E.render(); }
    };
    var q = $('#quadro'); if (!q || !E.ehMouse()) return;
    var arrastando = null;
    q.addEventListener('dragstart', function (e) { var c = e.target.closest('.cartao-candidato'); if (!c) return; arrastando = c.getAttribute('data-cand'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', arrastando); } catch (x) { /* sem dados */ } setTimeout(function () { c.classList.add('fantasma-arrasto'); }, 0); });
    q.addEventListener('dragend', function (e) { var c = e.target.closest('.cartao-candidato'); if (c) c.classList.remove('fantasma-arrasto'); $$('.coluna[data-alvo]').forEach(function (x) { x.removeAttribute('data-alvo'); }); });
    q.addEventListener('dragover', function (e) { var col = e.target.closest('.coluna'); if (!col || !arrastando) return; e.preventDefault(); $$('.coluna[data-alvo]').forEach(function (x) { if (x !== col) x.removeAttribute('data-alvo'); }); col.setAttribute('data-alvo', ''); });
    q.addEventListener('dragleave', function (e) { var col = e.target.closest('.coluna'); if (col && !col.contains(e.relatedTarget)) col.removeAttribute('data-alvo'); });
    q.addEventListener('drop', function (e) { var col = e.target.closest('.coluna'); if (!col || !arrastando) return; e.preventDefault(); col.removeAttribute('data-alvo'); var c = E.candPor(arrastando); arrastando = null; if (c && E.COL_DA_ETAPA[c.etapa] !== col.getAttribute('data-col')) E.moverPara(c, col.getAttribute('data-col')); });
  }
  ACOES['visao'] = function (el) { UI.visao = el.getAttribute('data-v'); E.render(); };
  ACOES['lista-etapa'] = function (el) { UI.filtros.etapa = el.getAttribute('data-e'); UI.sel = {}; E.render(); };
  ACOES['inverter-ordem'] = function () { UI.ordem = UI.ordem === 'antigos' ? 'recentes' : 'antigos'; E.render(); };
  ACOES['filtro-toggle'] = function (el) { var k = el.getAttribute('data-k'); UI.filtros[k] = !UI.filtros[k]; E.render(); };
  ACOES['filtro-sim'] = function (el) { var i = el.getAttribute('data-i'); UI.filtros.sim = UI.filtros.sim || {}; UI.filtros.sim[i] = !UI.filtros.sim[i]; E.render(); };
  ACOES['tirar-filtro'] = function (el) {
    var k = el.getAttribute('data-k'), v = el.getAttribute('data-v'), f = UI.filtros;
    if (k === 'sim') delete f.sim[v]; else if (Array.isArray(f[k])) f[k] = f[k].filter(function (x) { return x !== v; }); else f[k] = k === 'data' ? '' : false;
    E.render();
  };
  ACOES['limpar-filtros'] = function () { UI.filtros = { etapa: UI.filtros.etapa }; E.render(); };

  /* folha de filtros */
  function opcoesFiltro(lista, campo) {
    var cont = {};
    lista.forEach(function (c) {
      var r = r0(c), vals = campo === 'bairros' ? (r.bairro ? [r.bairro + '|' + r.cidade] : []) : campo === 'turnos' ? (r.turnos || []) : campo === 'cnh' ? (r.cnh || []) : (r.escolaridade ? [r.escolaridade] : []);
      vals.forEach(function (x) { cont[x] = (cont[x] || 0) + 1; });
    });
    return Object.keys(cont).sort().map(function (k) { return [k, cont[k]]; });
  }
  function rotuloOpcao(campo, k) { if (campo === 'bairros') return k.split('|')[0]; if (campo === 'cnh') return 'CNH ' + k; return k; }
  ACOES['filtros'] = function (el) {
    var sec = el.getAttribute('data-sec'), base = E.candsDa(UI.listaVaga);
    var f = JSON.parse(JSON.stringify(UI.filtros)); f.data = f.data || '';
    var nomes = { bairros: 'Onde mora', turnos: 'Pode trabalhar', cnh: 'CNH', esc: 'Estudo', data: 'Data da candidatura' };
    var html = folhaTopo('folha-titulo', 'Filtrar') + '<form class="folha-corpo" id="form-filtros">' +
      '<p class="dica">Só fatos que a própria pessoa informou. Nunca idade, sexo, estado civil, foto ou nacionalidade.</p>' +
      ['bairros', 'turnos', 'cnh', 'esc', 'data'].map(function (campo) {
        if (campo === 'data') return '<h3 id="fs-data">' + nomes.data + '</h3><div class="grupo-filtro">' + [['', 'Qualquer data', 'todas'], ['24h', 'Últimas 24 horas', '24h'], ['7d', 'Últimos 7 dias', '7d']].map(function (o) {
          return '<label class="opcao" for="ff-data-' + o[2] + '"><input type="radio" name="f-data" id="ff-data-' + o[2] + '" value="' + o[0] + '"' + (f.data === o[0] ? ' checked' : '') + '> ' + o[1] + '</label>'; }).join('') + '</div>';
        var ops = opcoesFiltro(base, campo); f[campo] = f[campo] || [];
        return '<h3 id="fs-' + campo + '">' + nomes[campo] + '</h3><div class="grupo-filtro">' + (ops.length ? ops.map(function (o, i) {
          return '<label class="opcao" for="ff-' + campo + '-' + i + '"><input type="checkbox" id="ff-' + campo + '-' + i + '" data-campo="' + campo + '" value="' + esc(o[0]) + '"' + (f[campo].indexOf(o[0]) >= 0 ? ' checked' : '') + '> ' + esc(rotuloOpcao(campo, o[0])) + ' <span class="muted num">(' + o[1] + ')</span></label>'; }).join('') : '<p class="dica">Ninguém informou ainda.</p>') + '</div>';
      }).join('') + '</form>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" id="ff-limpar">Limpar</button><button class="btn" type="button" id="ff-ver"></button></div>';
    abrir('folha', html);
    function ler() {
      ['bairros', 'turnos', 'cnh', 'esc'].forEach(function (k) { f[k] = $$('#form-filtros input[data-campo="' + k + '"]:checked').map(function (x) { return x.value; }); });
      var rd = $('#form-filtros input[name="f-data"]:checked'); f.data = rd ? rd.value : '';
      var guarda = UI.filtros; UI.filtros = f; var n = aplicarFiltros(base).length; UI.filtros = guarda;
      $('#ff-ver').textContent = 'Ver ' + plural(n, 'pessoa', 'pessoas');
    }
    $('#form-filtros').addEventListener('change', ler); ler();
    var s = document.getElementById('fs-' + sec); if (s) setTimeout(function () { s.scrollIntoView({ block: 'start' }); }, 40);
    $('#ff-limpar').addEventListener('click', function () { $$('#form-filtros input[type="checkbox"]').forEach(function (x) { x.checked = false; }); var r0b = $('#form-filtros input[name="f-data"][value=""]'); if (r0b) r0b.checked = true; ler(); });
    $('#ff-ver').addEventListener('click', function () { fechar('folha', function () { f.etapa = UI.filtros.etapa; f.sim = UI.filtros.sim; f.anexo = UI.filtros.anexo; f.simTodas = UI.filtros.simTodas; UI.filtros = f; E.render(); }); });
  };

  /* ---------- mover de etapa (tudo pelo banco: candidatoMover) ---------- */
  E.nomeDe = function (c) { return E.primeiroNome(c.nome); };
  function mover(c, etapa, extra) {
    return E.api('candidatoMover', Object.assign({ id: c.id, etapa: etapa }, extra || {})).then(function (r) { return E.trocaCand(r.candidato); });
  }
  E.moverPara = function (c, col, silencioso) {
    if (col === 'entrevista') { E.abrirAgendar(c); return; }
    if (col === 'naoseguiu') { E.abrirNaoSeguir([c]); return; }
    var antes = c.etapa, nome = E.nomeDe(c);
    mover(c, E.ETAPA_DA_COL[col]).then(function (novo) {
      E.atualizarTudo(novo);
      if (!silencioso) toast(nome + ' foi para ' + E.COLUNAS.filter(function (x) { return x.id === col; })[0].nome, 'Desfazer', function () { mover(novo, antes).then(E.atualizarTudo, function (e) { toast(E.msgErro(e), null, null, 'erro'); }); });
    }, function (e) { toast(E.msgErro(e), null, null, 'erro'); });
  };
  function menuMover(btn, c) {
    var atual = E.COL_DA_ETAPA[c.etapa];
    E.abrirMenu(btn, [{ titulo: 'Mover para' }].concat(E.COLUNAS.map(function (col) {
      return { txt: col.nome, marcado: col.id === atual, ic: col.id === atual ? 'check' : null, fn: function () { if (col.id !== atual) E.moverPara(c, col.id); } };
    })));
  }
  ACOES['mover-menu'] = function (el) { menuMover(el, E.candPor(el.getAttribute('data-id'))); };
  E.atualizarTudo = function (c) {
    if (c) c = E.candPor(c.id) || c;
    var r = E.lerRota();
    if (r.tela === 'candidatos' || r.tela === 'candidato') E.montar('candidatos', { tela: 'candidatos', arg: '', arg2: '', q: { vaga: UI.listaVaga || '' }, bruto: 'candidatos' });
    var gv = $('#gaveta'); if (gv.open && c && gv.getAttribute('data-cand') === c.id) E.pintarGaveta(c);
    E.pintarTopo('candidatos'); E.pintarBarra(document.body.classList.contains('tem-barra-baixo') ? 'candidatos' : null);
  };

  /* seleção de vários (computador) */
  function selecionados() { return Object.keys(UI.sel).filter(function (k) { return UI.sel[k]; }).map(E.candPor).filter(Boolean); }
  ACOES['sel-limpar'] = function () { UI.sel = {}; E.render(); };
  ACOES['sel-mover'] = function (el) {
    var cs = selecionados();
    E.abrirMenu(el, [{ titulo: 'Mover ' + plural(cs.length, 'pessoa', 'pessoas') + ' para' }].concat(['novos', 'conversa', 'contratado'].map(function (id) {
      var col = E.COLUNAS.filter(function (x) { return x.id === id; })[0];
      return { txt: col.nome, fn: function () {
        var antes = cs.map(function (c) { return [c, c.etapa]; });
        Promise.all(cs.map(function (c) { return mover(c, E.ETAPA_DA_COL[id]); })).then(function () {
          UI.sel = {}; E.render();
          toast(plural(cs.length, 'pessoa foi', 'pessoas foram') + ' para ' + col.nome, 'Desfazer', function () { Promise.all(antes.map(function (a) { return mover(a[0], a[1]); })).then(function () { E.render(); }); });
        }, function (e) { toast(E.msgErro(e), null, null, 'erro'); });
      } };
    })));
  };
  ACOES['sel-mensagem'] = function () {
    var cs = selecionados();
    abrir('folha-curta', folhaTopo('folha-curta-titulo', 'Mensagem para ' + plural(cs.length, 'pessoa', 'pessoas')) +
      '<div class="folha-corpo"><div class="campo"><label for="sm-msg">Mensagem</label><textarea class="entrada" id="sm-msg" rows="4" maxlength="1000">Olá. Aqui é do ' + esc(S.empresa.nome) + '. Vi sua candidatura no Vagas sem Caos. Podemos conversar?</textarea>' +
      '<p class="dica">Cada pessoa recebe pelo Vagas sem Caos.</p><p class="erro-campo" id="sm-erro" role="alert" hidden></p></div></div>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="fechar-dialogo">Cancelar</button><button class="btn" type="button" id="sm-enviar">Enviar para ' + plural(cs.length, 'pessoa', 'pessoas') + '</button></div>');
    $('#sm-enviar').addEventListener('click', function () {
      var t = $('#sm-msg').value.trim(), er = $('#sm-erro'); if (!t) return;
      $('#sm-enviar').disabled = true;
      var erros = [], seq = Promise.resolve();
      cs.forEach(function (c) { seq = seq.then(function () { return E.api('mensagemEnviar', { id: c.id, texto: t, mid: E.uuid() }).catch(function (e) { erros.push(e); }); }); });
      seq.then(function () {
        if (erros.length) { $('#sm-enviar').disabled = false; er.hidden = false; er.innerHTML = ic('erro') + esc(E.msgErro(erros[0])); return; }
        UI.sel = {}; fechar('folha-curta', function () { E.carregarCands(UI.listaVaga).then(E.render); toast('Mensagem enviada para ' + plural(cs.length, 'pessoa', 'pessoas')); });
      });
    });
  };
  ACOES['sel-naoseguir'] = function () { E.abrirNaoSeguir(selecionados()); };
})();
