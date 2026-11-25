/* ==========================================================================
   Site da empresa · E2 Nova vaga (uma tela, com prévia ao vivo) · E3 "Falta só sua empresa" · E4 Sua vaga está no ar
   A conta só é criada no FIM (código por e-mail): até lá o rascunho fica neste aparelho (vsc.emp.rascunho).
   ========================================================================== */
(function () {
  'use strict';
  var E = window.VSC_EMP, S = E.S, UI = E.UI, TELAS = E.TELAS, PRE = E.PRE, ACOES = E.ACOES, MOD = window.VSC_MODELOS;
  var esc = E.esc, ic = E.ic, $ = E.$, $$ = E.$$, abrir = E.abrir, fechar = E.fechar, folhaTopo = E.folhaTopo, toast = E.toast, ir = E.ir, norm = E.norm, num = E.num, milhar = E.milhar;
  var CHAVE_RASC = 'vsc.emp.rascunho';
  var F = null, tentou = false, timerTexto = null, timerRasc = null, timerDoc = null, publicando = false, checagem = 0, textoOk = null;
  var LISTAS = { 'f-ativ': 'atividades', 'f-req': 'requisitos', 'f-perg': 'perguntas' };
  E.form = function () { return F; };
  E.limparForm = function () { F = null; };

  /* ---------- o formulário ---------- */
  function emVazia() { return { doc: '', ok: false, nome: '', resp: '', whats: '', email: '', consultado: '', consulta: null }; }
  function formVazio() {
    var l = E.lojas()[0];
    return {
      modo: 'nova', id: null, idLocal: E.uuid(), origem: null, modelo: null, titulo: '', setorId: '', qtd: 1,
      sal: { de: '', ate: '', por: 'mes', comissao: false }, tipo: '', diaria: { dia: 0, das: 8, as: 17, repetir: false },
      turno: '', horario: '', lojaId: l ? l.id : '', cidade: S.empresa ? S.empresa.cidade : E.cidadePrincipal(), bairro: S.empresa ? S.empresa.bairro : '',
      descricao: '', atividades: [], requisitos: [], beneficios: [], semExp: false, pcd: false, confidencial: false, perguntas: [], sugPerguntas: [], emp: emVazia()
    };
  }
  function chipBeneficio(b) { var n = norm(b); for (var i = 0; i < E.BENEFICIOS.length; i++) if (n.indexOf(norm(E.BENEFICIOS[i])) === 0) return E.BENEFICIOS[i]; return b; }
  function aplicarModelo(f, m) {
    f.modelo = m.id; f.titulo = m.titulo; f.setorId = m.setorId; f.qtd = 1;
    f.tipo = m.tipo; f.turno = m.tipo === 'Diária' ? '' : m.turno; f.horario = m.tipo === 'Diária' ? '' : (m.horario || '');
    f.descricao = m.descricao; f.atividades = m.atividades.slice(); f.requisitos = m.requisitos.slice();
    f.perguntas = m.perguntas.slice(0, 2); f.sugPerguntas = m.perguntas.slice(); f.semExp = !!m.semExperiencia; f.pcd = false;
    if (m.tipo === 'Diária') f.diaria = { dia: 0, das: 8, as: 17, repetir: false };
    ajustarPeriodo(f);
    return f;
  }
  function ajustarPeriodo(f) {
    var ok = E.periodosDoTipo(f.tipo);
    if (ok.indexOf(f.sal.por) < 0) f.sal.por = ok[0];
  }
  function indiceDoDia(iso) { var ds = E.diasProximos(8); for (var i = 0; i < ds.length; i++) if (ds[i].iso === iso) return i; return 0; }
  function formDaVaga(v) {
    var f = formVazio(), s = v.salario || {};
    f.titulo = v.titulo; f.setorId = v.setorId; f.qtd = v.vagasQtd || 1;
    f.sal = { de: s.min ? String(s.min) : '', ate: s.max ? String(s.max) : '', por: s.periodo || 'mes', comissao: /comiss/i.test(s.obs || '') };
    f.tipo = E.tipoTela(v.tipo); f.turno = v.turno || ''; f.horario = v.tipo === 'Diária' ? '' : (v.horario && v.horario !== v.turno ? v.horario : '');
    f.cidade = v.cidade; f.bairro = v.bairro || ''; f.descricao = v.descricao || '';
    f.atividades = (v.atividades || []).slice(); f.requisitos = (v.requisitos || []).slice(); f.beneficios = (v.beneficios || []).map(chipBeneficio);
    f.perguntas = (v.perguntas || []).slice(); f.sugPerguntas = f.perguntas.slice(); f.semExp = !!v.semExperiencia; f.pcd = !!v.pcd; f.confidencial = !!v.confidencial;
    if (v.diaria) {
      f.diaria = { dia: indiceDoDia(v.diaria.data), das: parseInt(String(v.diaria.das).slice(0, 2), 10) || 8, as: parseInt(String(v.diaria.as).slice(0, 2), 10) || 17, repetir: !!v.repete };
    }
    var l = E.lojaDe(v); f.lojaId = l ? l.id : (E.lojas().length ? 'outro' : '');
    return f;
  }
  function temConteudo(f) { return !!(f && ((f.titulo || '').trim() || (f.descricao || '').trim() || num(f.sal && f.sal.de))); }
  function rascunhoValido() {
    var r = E.lerJSON(CHAVE_RASC);
    return r && r.modo === 'nova' && temConteudo(r) ? r : null;
  }
  function usarRascunho(r) { F = r; F.continuando = true; F.sujo = false; if (!F.idLocal) F.idLocal = E.uuid(); if (!F.emp) F.emp = emVazia(); }

  /* abre o formulário de uma vaga nova (com o rascunho guardado, se houver) */
  E.iniciarForm = function (o) {
    o = o || {};
    var r = rascunhoValido(), m = o.modelo ? MOD.porId[o.modelo] : null;
    var novo = function () { F = formVazio(); if (m) aplicarModelo(F, m); else if (o.titulo) F.titulo = o.titulo; };
    var vai = function () { tentou = false; textoOk = null; if (E.lerRota().tela === 'vaga' && E.lerRota().arg === 'nova') E.render(); else ir('#/vaga/nova'); };
    var pedido = m ? m.titulo : (o.titulo || '');
    if (r && !pedido) { usarRascunho(r); vai(); return; }
    if (r && norm(r.titulo) !== norm(pedido)) {
      janela2Rascunho(r, pedido, function () { usarRascunho(r); vai(); }, function () { E.apagar(CHAVE_RASC); novo(); vai(); });
      return;
    }
    if (r) { usarRascunho(r); vai(); return; }
    novo(); vai();
  };
  function janela2Rascunho(r, pedido, continuar, novo) {
    E.janela2('Você tem um rascunho guardado', 'O rascunho de ' + (r.titulo || 'vaga') + ' está neste aparelho. Continuar com ele ou começar ' + (pedido || 'uma vaga nova') + ' do zero? Começar do zero apaga o rascunho.',
      { rot: 'Continuar o rascunho', fn: continuar }, { rot: 'Começar ' + (pedido || 'do zero'), fn: novo });
  }

  /* ---------- cálculo da dica de salário (vagas reais parecidas, só com 3 ou mais) ---------- */
  function dicaSalario() {
    if (!F) return '';
    var m = MOD.exato(F.titulo) || (F.modelo ? MOD.porId[F.modelo] : null);
    if (!m) return 'Confira o piso da sua categoria.';
    var base = S.base && S.base.vagas ? S.base.vagas : [];
    var par = base.filter(function (v) {
      var s = v.salario; if (!s || s.aCombinar || !(Number(s.min) > 0) || s.periodo !== F.sal.por) return false;
      var k = MOD.chave(v.titulo);
      return m.chaves.some(function (c) { return k === c || k.indexOf(c + ' ') === 0; });
    });
    if (par.length < 3) return 'Confira o piso da sua categoria.';
    var mins = par.map(function (v) { return Number(v.salario.min); }), maxs = par.map(function (v) { return Number(v.salario.max) || Number(v.salario.min); });
    var praca = (S.base.praca && S.base.praca.nome) || 'sua região';
    return 'Vagas parecidas em ' + praca + ' pagam de ' + E.reais(Math.min.apply(null, mins)) + ' a ' + E.reais(Math.max.apply(null, maxs)) + ' ' + E.POR_TXT[F.sal.por] + '.';
  }

  /* ---------- auxiliares de campos ---------- */
  function opcoesHora(sel) { var o = ''; for (var h = 6; h <= 22; h++) o += '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + h + 'h</option>'; return o; }
  function selecao(id, opcoes, extra) { return '<div class="selecao"><select class="entrada" id="' + id + '"' + (extra || '') + '>' + opcoes + '</select>' + ic('chevron') + '</div>'; }
  function opcoesCidade(sel) { return E.cidades().map(function (c) { return '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.nome) + '</option>'; }).join(''); }
  function opcoesBairro(cid, sel) {
    var c = E.cidadePor(cid), lista = c ? c.bairros.slice() : [];
    if (sel && lista.indexOf(sel) < 0) lista.push(sel);
    return '<option value="">Escolha o bairro</option>' + lista.map(function (b) { return '<option' + (b === sel ? ' selected' : '') + '>' + esc(b) + '</option>'; }).join('');
  }
  function opcoesSetor(sel) {
    return '<option value="">Escolha a área</option>' + E.setores().map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.nome) + '</option>'; }).join('');
  }
  E.selecao = selecao; E.opcoesCidade = opcoesCidade; E.opcoesBairro = opcoesBairro;
  function chipsGrupo(id, grupo, lista, atual, multi) {
    return '<div class="chips sem-fim" id="' + id + '" data-grupo="' + grupo + '"' + (multi ? ' data-multi' : '') + ' role="group">' + lista.map(function (x) {
      var on = multi ? atual.indexOf(x) >= 0 : atual === x;
      return '<button class="chip" type="button" aria-pressed="' + on + '" data-valor="' + esc(x) + '">' + ic('check', 'marca') + esc(x) + '</button>';
    }).join('') + '</div>';
  }
  function itensLista(id, lista, rot) {
    return lista.map(function (t, i) {
      return '<li><label class="sr" for="' + id + '-' + i + '">' + esc(rot) + ' ' + (i + 1) + '</label><input class="entrada" id="' + id + '-' + i + '" data-lista="' + id + '" data-i="' + i + '" value="' + esc(t) + '">' +
        '<button class="btn-icone" type="button" data-acao="item-tirar" data-lista="' + id + '" data-i="' + i + '" aria-label="Tirar ' + esc(rot.toLowerCase()) + ' ' + (i + 1) + '">' + ic('x') + '</button></li>';
    }).join('');
  }
  function chipsBenef() {
    var todos = E.BENEFICIOS.slice(); F.beneficios.forEach(function (b) { if (todos.indexOf(b) < 0) todos.push(b); });
    return chipsGrupo('f-benef', 'beneficios', todos, F.beneficios, true);
  }
  function porBotoes() {
    var ok = E.periodosDoTipo(F.tipo);
    return E.PERIODOS.filter(function (o) { return ok.indexOf(o[0]) >= 0; }).map(function (o) {
      return '<button type="button" data-valor="' + o[0] + '" aria-pressed="' + (F.sal.por === o[0]) + '">' + o[1] + '</button>'; }).join('');
  }

  /* ---------- rotas da tela ---------- */
  PRE.vaga = function (r) {
    return E.carregarBase().then(function () {
      if (r.arg === 'editar') {
        var pronto = E.vagaPor(r.arg2) ? Promise.resolve() : E.carregarVagas();
        return pronto.then(function () {
          var v = E.vagaPor(r.arg2);
          if (!v) throw new Error('Não achamos esta vaga.');
          if (!F || F.origem !== 'editar/' + v.id) {
            F = formDaVaga(v); F.modo = 'editar'; F.origem = 'editar/' + v.id; F.id = v.id; F.copiaDe = r.q.copia || '';
            F.rascunhoVaga = v.status === 'rascunho'; F.idLocal = '';
            tentou = false; textoOk = null;
          }
        });
      }
      if (r.q.modelo && MOD.porId[r.q.modelo] && (!F || F.modo !== 'nova' || F.modelo !== r.q.modelo)) {
        F = formVazio(); aplicarModelo(F, MOD.porId[r.q.modelo]); tentou = false; textoOk = null;
        try { history.replaceState(null, '', location.pathname + location.search + '#/vaga/nova'); } catch (e) { /* segue com a query */ }
      }
    });
  };
  TELAS.vaga = function (r) {
    if (r.arg === 'editar') { if (!F || F.modo !== 'editar') { setTimeout(function () { ir('#/vagas'); }); return { html: '' }; } }
    else if (!F || F.modo !== 'nova') {
      var rs = rascunhoValido();
      if (rs) usarRascunho(rs); else F = formVazio();
      tentou = false; textoOk = null;
    }
    if (!F.cidade) F.cidade = E.cidadePrincipal();
    var novaEmp = !S.empresa, edit = F.modo === 'editar';
    var titulo = edit ? (F.rascunhoVaga ? (F.copiaDe ? 'Nova vaga (cópia de ' + F.copiaDe + ')' : 'Rascunho de vaga') : 'Editar vaga') : 'Nova vaga';
    var dias = E.diasProximos(8), lojas = E.lojas(), diaria = F.tipo === 'Diária';
    var botao = edit && !F.rascunhoVaga ? 'Salvar alterações' : novaEmp ? 'Publicar agora' : 'Publicar vaga';
    var html =
      '<div class="form-grade">' +
      '<form class="form-col" id="form-vaga" novalidate>' +
      '<header class="form-cab">' +
      '<a class="link voltar" href="' + (edit ? '#/vagas' : S.empresa ? '#/inicio' : '#/anunciar') + '" data-acao="sair-form">' + ic('voltar') + (edit ? 'Vagas' : 'Voltar') + '</a>' +
      '<h1>' + esc(titulo) + '</h1>' +
      '<p>Tudo numa tela só. ' + (novaEmp ? 'No fim, diga quem está anunciando e a vaga entra no ar na hora.' : 'Ao publicar, a vaga entra no ar na hora. Verificamos depois.') + '</p>' +
      '</header>' +
      '<div id="form-erros" aria-live="polite"></div>' +
      '<div id="faixa-modelo"></div>' +

      '<section class="secao" id="sec-vaga"><h2>A vaga</h2>' +
      '<div class="campo combo" id="c-titulo"><label for="f-titulo">Função</label>' +
      '<div class="busca">' + ic('busca') + '<input id="f-titulo" class="entrada" type="text" autocomplete="off" placeholder="Ex.: caixa, repositor, manicure" role="combobox" aria-expanded="false" aria-controls="f-titulo-lista" aria-autocomplete="list" maxlength="60" value="' + esc(F.titulo) + '"></div>' +
      '<ul class="sugestoes" id="f-titulo-lista" role="listbox" hidden></ul>' +
      '<p class="dica">Escolha uma sugestão e a descrição, as tarefas e as perguntas vêm prontas.</p></div>' +
      '<div class="campo" id="c-setor"><label for="f-setor">Área</label>' + selecao('f-setor', opcoesSetor(F.setorId)) + '</div>' +
      '<div class="campo" id="c-qtd"><span class="rotulo" id="r-qtd">Quantas pessoas você precisa</span>' +
      '<div class="campo-num" role="group" aria-labelledby="r-qtd"><button type="button" data-acao="qtd" data-d="-1" aria-label="Menos uma">' + ic('menos') + '</button>' +
      '<input id="f-qtd" type="number" min="1" max="50" inputmode="numeric" value="' + F.qtd + '" aria-label="Quantidade de vagas"><button type="button" data-acao="qtd" data-d="1" aria-label="Mais uma">' + ic('mais') + '</button></div></div>' +
      '</section>' +

      '<section class="secao" id="sec-salario"><h2>Salário</h2>' +
      '<span class="rotulo rotulo-por" id="r-por">Pago por</span><div class="segmentado largo" id="f-por" role="group" aria-labelledby="r-por">' + porBotoes() + '</div>' +
      '<div id="f-sal-valores">' +
      '<div class="linha2"><div class="campo" id="c-de"><label for="f-de">De</label><div class="prefixo"><span>R$</span><input id="f-de" class="entrada num" inputmode="numeric" autocomplete="off" placeholder="1.700" value="' + esc(F.sal.de ? milhar(num(F.sal.de)) : '') + '"></div></div>' +
      '<div class="campo"><label for="f-ate">Até <span class="opcional">(opcional)</span></label><div class="prefixo"><span>R$</span><input id="f-ate" class="entrada num" inputmode="numeric" autocomplete="off" placeholder="1.900" value="' + esc(F.sal.ate ? milhar(num(F.sal.ate)) : '') + '"></div></div></div>' +
      '<p class="dica mt-8" id="f-sal-dica"></p>' +
      '<label class="chave mt-8"><input type="checkbox" role="switch" id="f-comissao"' + (F.sal.comissao ? ' checked' : '') + '><span>Tem comissão<small>Informe o ganho médio de quem já trabalha na função, com a comissão.</small></span></label>' +
      '</div></section>' +

      '<section class="secao" id="sec-tipo"><h2>Tipo de contrato</h2>' + chipsGrupo('f-tipo', 'tipo', E.TIPOS, F.tipo) +
      '<div class="sub" id="f-diaria"' + (diaria ? '' : ' hidden') + '>' +
      '<span class="rotulo">Que dia?</span><div class="dias" id="f-dia" role="group" aria-label="Dia da diária">' + dias.map(function (d) {
        return '<button class="chip" type="button" data-dia="' + d.i + '" aria-pressed="' + (F.diaria.dia === d.i) + '">' + esc(d.rot) + '<small>' + d.data + '</small></button>';
      }).join('') + '</div>' +
      '<div class="linha2"><div class="campo"><label for="f-das">Das</label>' + selecao('f-das', opcoesHora(F.diaria.das)) + '</div>' +
      '<div class="campo"><label for="f-as">Às</label>' + selecao('f-as', opcoesHora(F.diaria.as)) + '</div></div>' +
      '<label class="chave"><input type="checkbox" role="switch" id="f-repetir"' + (F.diaria.repetir ? ' checked' : '') + '><span>Repetir toda semana<small>A vaga volta sozinha no mesmo dia da semana.</small></span></label>' +
      '</div></section>' +

      '<section class="secao" id="sec-turno"><h2>Turno</h2>' +
      '<div id="f-turno-escolha"' + (diaria ? ' hidden' : '') + '>' + chipsGrupo('f-turno', 'turno', E.TURNOS, F.turno) + '</div>' +
      '<p class="dica" id="f-turno-calc"' + (diaria ? '' : ' hidden') + '></p>' +
      '<div class="campo" id="c-horario"' + (diaria ? ' hidden' : '') + '><label for="f-horario">Horário <span class="opcional">(opcional)</span></label><input id="f-horario" class="entrada" maxlength="160" placeholder="Ex.: segunda a sábado, das 13h às 21h20" value="' + esc(F.horario) + '"></div>' +
      '</section>' +

      '<section class="secao" id="sec-onde"><h2>Onde</h2>' +
      (lojas.length ? '<div class="campo"><label for="f-loja">Endereço</label>' + selecao('f-loja', lojas.map(function (l) {
        return '<option value="' + esc(l.id) + '"' + (F.lojaId === l.id ? ' selected' : '') + '>' + esc(l.nome + (l.bairro ? ' · ' + l.bairro : '') + (l.cidade ? ', ' + E.cidadeNome(E.lojaCidadeSlug(l)) : '')) + '</option>';
      }).join('') + '<option value="outro"' + (F.lojaId === 'outro' ? ' selected' : '') + '>Outro endereço</option>') + '</div>' : '') +
      '<div class="linha2" id="f-onde-livre"' + (lojas.length && F.lojaId !== 'outro' ? ' hidden' : '') + '>' +
      '<div class="campo"><label for="f-cidade">Cidade</label>' + selecao('f-cidade', opcoesCidade(F.cidade)) + '</div>' +
      '<div class="campo" id="c-bairro"><label for="f-bairro">Bairro</label>' + selecao('f-bairro', opcoesBairro(F.cidade, F.bairro)) + '</div></div>' +
      '</section>' +

      '<section class="secao" id="sec-desc"><h2>Como é o trabalho</h2>' +
      '<div class="campo" id="c-desc"><label for="f-desc">Descrição</label><textarea id="f-desc" class="entrada" rows="6" maxlength="1500" placeholder="Conte o dia a dia: o que a pessoa faz, com quem trabalha e o que é bom saber antes.">' + esc(F.descricao) + '</textarea>' +
      '<div class="desc-rodape"><span class="check-texto" id="f-desc-check" aria-live="polite"></span><span class="dica num" id="f-desc-n"></span></div></div>' +
      '<div class="campo"><span class="rotulo">O que a pessoa vai fazer</span><ul class="itens" id="f-ativ">' + itensLista('f-ativ', F.atividades, 'Tarefa') + '</ul>' +
      '<div><button class="link" type="button" data-acao="item-add" data-lista="f-ativ">' + ic('mais') + 'Adicionar tarefa</button></div></div>' +
      '<div class="campo"><span class="rotulo">O que precisa ter <span class="opcional">(opcional)</span></span><ul class="itens" id="f-req">' + itensLista('f-req', F.requisitos, 'Requisito') + '</ul>' +
      '<div><button class="link" type="button" data-acao="item-add" data-lista="f-req">' + ic('mais') + 'Adicionar requisito</button></div></div>' +
      '</section>' +

      '<section class="secao" id="sec-benef"><h2>Benefícios <span class="opcional">(opcional)</span></h2>' +
      '<div id="f-benef-caixa">' + chipsBenef() + '</div>' +
      '<div class="fila-add"><label class="sr" for="f-benef-outro">Outro benefício</label><input id="f-benef-outro" class="entrada" maxlength="90" placeholder="Outro benefício, ex.: café da manhã"><button class="btn sec" type="button" data-acao="benef-add">Adicionar</button></div>' +
      '</section>' +

      '<section class="secao" id="sec-quem"><h2>Quem pode se candidatar</h2>' +
      '<p class="dica">A vaga é para pessoas com 18 anos ou mais.</p>' +
      '<label class="chave"><input type="checkbox" role="switch" id="f-semexp"' + (F.semExp ? ' checked' : '') + '><span>Aceita sem experiência</span></label>' +
      '<label class="chave"><input type="checkbox" role="switch" id="f-pcd"' + (F.pcd ? ' checked' : '') + '><span>Vaga também para pessoa com deficiência (PcD)</span></label>' +
      (E.verificada() ? '<label class="chave"><input type="checkbox" role="switch" id="f-conf"' + (F.confidencial ? ' checked' : '') + '><span>Vaga confidencial<small>Esconde o nome da empresa na lista de vagas.</small></span></label>' : '') +
      '</section>' +

      '<section class="secao" id="sec-perg"><h2>Perguntas para quem se candidata <span class="opcional">(opcional)</span></h2>' +
      '<p class="dica">Até 2 perguntas de sim ou não. Depois você filtra quem respondeu sim.</p>' +
      '<ul class="itens" id="f-perg">' + itensLista('f-perg', F.perguntas, 'Pergunta') + '</ul>' +
      '<div id="f-perg-sug"></div>' +
      '<div class="fila-add" id="f-perg-add"><label class="sr" for="f-perg-nova">Escrever outra pergunta</label><input id="f-perg-nova" class="entrada" maxlength="120" placeholder="Escreva outra pergunta"><button class="btn sec" type="button" data-acao="perg-add">Adicionar</button></div>' +
      '</section>' +

      (novaEmp ? '<section class="secao" id="sec-empresa"><h2>Sua empresa</h2>' +
        '<p class="soft">Falta só sua empresa. Para a vaga ir ao ar, diga quem está anunciando. Leva 1 minuto.</p>' + E.blocoEmpresa(F.emp) + '</section>' : '') +
      '</form>' +
      '<aside class="previa-col" id="previa-vaga" aria-label="Como as pessoas veem"><h2>' + ic('olho') + 'Como as pessoas veem</h2><div class="previa-moldura" id="previa-corpo"></div></aside>' +
      '</div>' +
      '<div class="barra-publicar vidro" id="barra-publicar"><div class="pagina bp-in"><span class="detalhe" id="rascunho-info">' + (F.continuando ? 'Rascunho guardado neste aparelho' : '') + '</span>' +
      '<button class="btn fantasma bp-ver" type="button" data-acao="ver-previa" id="btn-ver-previa">' + ic('olho') + 'Ver como fica</button>' +
      '<button class="btn fantasma" type="button" data-acao="sair-form" id="btn-sair-form">Sair</button>' +
      '<button class="btn grande" type="button" data-acao="publicar" id="btn-publicar">' + esc(botao) + '</button></div></div>';
    return { html: html, nav: S.empresa ? 'vagas' : null, barra: 'publicar', topoBotao: false, semRodape: true, titulo: titulo, depois: ligarForm };
  };

  /* ---------- ligações ---------- */
  function ligarForm() {
    var form = $('#form-vaga');
    E.EMPX = F.emp;
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    E.ligarCombo($('#f-titulo'), $('#f-titulo-lista'), function (m, txt) {
      if (m) {
        var guarda = { lojaId: F.lojaId, cidade: F.cidade, bairro: F.bairro, emp: F.emp, modo: F.modo, id: F.id, idLocal: F.idLocal, origem: F.origem, copiaDe: F.copiaDe, rascunhoVaga: F.rascunhoVaga, sal: { de: F.sal.de, ate: F.sal.ate, por: F.sal.por, comissao: F.sal.comissao }, confidencial: F.confidencial };
        aplicarModelo(F, m); for (var k in guarda) F[k] = guarda[k];
        ajustarPeriodo(F);
        F.continuando = false; F.sujo = true;
        $('#f-titulo').value = F.titulo;
        E.render(); agendarRascunho(); toast('Modelo de ' + m.titulo + ' aplicado. Ajuste o que quiser.');
      } else { F.titulo = txt; F.modelo = null; mudou(); }
    });
    form.addEventListener('input', aoDigitar);
    form.addEventListener('change', aoDigitar);
    form.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip[data-valor]'), g = chip && chip.closest('[data-grupo]');
      if (g) {
        var grupo = g.getAttribute('data-grupo'), val = chip.getAttribute('data-valor');
        if (g.hasAttribute('data-multi')) {
          var i = F[grupo].indexOf(val); if (i >= 0) F[grupo].splice(i, 1); else F[grupo].push(val);
          chip.setAttribute('aria-pressed', String(i < 0));
        } else {
          F[grupo] = F[grupo] === val ? '' : val;
          $$('.chip', g).forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-valor') === F[grupo])); });
          g.removeAttribute('aria-invalid');
          if (grupo === 'tipo') {
            var ehDiaria = F.tipo === 'Diária';
            $('#f-diaria').hidden = !ehDiaria; $('#f-turno-escolha').hidden = ehDiaria; $('#f-turno-calc').hidden = !ehDiaria; $('#c-horario').hidden = ehDiaria;
            ajustarPeriodo(F); $('#f-por').innerHTML = porBotoes(); atualizarDica();
          }
        }
        mudou(); return;
      }
      var dia = e.target.closest('[data-dia]');
      if (dia) { F.diaria.dia = parseInt(dia.getAttribute('data-dia'), 10); $$('#f-dia .chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c === dia)); }); mudou(); return; }
      var por = e.target.closest('#f-por>button');
      if (por) { F.sal.por = por.getAttribute('data-valor'); $$('#f-por>button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === por)); }); atualizarDica(); mudou(); }
    });
    pintarModelo(); pintarSugPerg(); checarAgora(); atualizarPrevia(); atualizarDica(); pintarTurnoDiaria();
    var cr = $('#form-vaga'); if (cr) E.ligarEmpresa(cr, F.emp, function () { mudou(); });
    if (F.origem && F.modo === 'editar' && F.copiaDe) { var alvo = $('#f-loja') || $('#f-bairro'); if (alvo) { alvo.scrollIntoView({ block: 'center' }); alvo.focus({ preventScroll: true }); } }
    else if (!F.titulo && !E.ehCelular()) $('#f-titulo').focus();
    if (F.emp.ok) E.pintarEmpresaAchada();
    if (tentou) revisarFaltas();
  }
  function pintarModelo() {
    var c = $('#faixa-modelo'); if (!c) return;
    if (F.continuando && F.modo === 'nova') {
      c.innerHTML = '<div class="faixa calmo">' + ic('documento') + '<span>Continuando o rascunho' + (F.titulo ? ' de ' + esc(F.titulo) : '') + '.</span><button class="link" type="button" data-acao="do-zero">Começar do zero</button></div>';
      return;
    }
    c.innerHTML = F.modelo && MOD.porId[F.modelo] && F.modo === 'nova' ? '<div class="faixa calmo">' + ic('documento') + '<span>Usamos o modelo de ' + esc(MOD.porId[F.modelo].titulo) + '. Ajuste o que quiser.</span><button class="link" type="button" data-acao="do-zero">Começar do zero</button></div>' : '';
  }
  function pintarTurnoDiaria() {
    var el = $('#f-turno-calc'); if (!el || F.tipo !== 'Diária') return;
    var d = E.diasProximos(8)[F.diaria.dia] || {};
    el.textContent = 'Horário: ' + E.textoDiaria(F.diaria) + '. Turno: ' + E.turnoPelaHora(F.diaria.das, F.diaria.as, d.fds) + '.';
  }
  var CAMPOS_FALTA = ['c-titulo', 'c-setor', 'c-de', 'f-tipo', 'f-turno', 'c-bairro', 'c-desc', 'c-doc', 'c-empnome', 'c-resp', 'c-whats', 'c-email'];
  function revisarFaltas() {
    var caixa = $('#form-erros'); if (!caixa || !caixa.querySelector('[data-faltas]')) return;
    var f = faltas(), ids = f.map(function (x) { return x[0]; });
    CAMPOS_FALTA.forEach(function (cid) { if (ids.indexOf(cid) < 0) limparErro(cid); });
    caixa.innerHTML = f.length ? caixaFaltas(f, false) : '';
  }
  function pintarSugPerg() {
    var c = $('#f-perg-sug'); if (!c) return;
    var sug = (F.sugPerguntas || []).filter(function (p) { return F.perguntas.indexOf(p) < 0; });
    var cid = F.cidade ? E.cidadeNome(F.cidade) : '';
    ['Pode começar na próxima semana?', cid ? 'Mora em ' + cid + ' ou perto?' : ''].forEach(function (p) { if (p && sug.indexOf(p) < 0 && F.perguntas.indexOf(p) < 0) sug.push(p); });
    c.innerHTML = F.perguntas.length >= 2 ? '<p class="dica">Já tem 2 perguntas. Tire uma para trocar.</p>' :
      '<span class="rotulo">Sugestões</span><div class="chips sem-fim mt-8">' + sug.slice(0, 4).map(function (p) { return '<button class="chip" type="button" data-acao="perg-sug" data-p="' + esc(p) + '">' + ic('mais') + esc(p) + '</button>'; }).join('') + '</div>';
    $('#f-perg-add').hidden = F.perguntas.length >= 2;
  }
  function sincronizarOnde() {
    var c = $('#f-cidade'), b = $('#f-bairro');
    if (c) c.value = F.cidade; if (b) b.innerHTML = opcoesBairro(F.cidade, F.bairro);
    if (F.bairro) limparErro('c-bairro');
  }
  E.sincronizarOnde = function () { if (F) sincronizarOnde(); };
  function aoDigitar(e) {
    if (!F) return;
    var el = e.target, id = el.id, v = el.value;
    if (el.hasAttribute('data-lista') && el.tagName === 'INPUT') { F[LISTAS[el.getAttribute('data-lista')]][parseInt(el.getAttribute('data-i'), 10)] = v; agendarTexto(); mudou(); return; }
    if (E.aoDigitarEmpresa && E.aoDigitarEmpresa(e)) { mudou(); return; }
    switch (id) {
      case 'f-titulo': F.titulo = v; break;
      case 'f-setor': F.setorId = v; limparErro('c-setor'); break;
      case 'f-qtd': F.qtd = Math.max(1, Math.min(50, num(v) || 1)); break;
      case 'f-de': F.sal.de = String(num(v) || ''); if (e.type === 'change') el.value = F.sal.de ? milhar(num(F.sal.de)) : ''; limparErro('c-de'); atualizarDica(); break;
      case 'f-ate': F.sal.ate = String(num(v) || ''); if (e.type === 'change') el.value = F.sal.ate ? milhar(num(F.sal.ate)) : ''; break;
      case 'f-comissao': F.sal.comissao = el.checked; break;
      case 'f-das': F.diaria.das = parseInt(v, 10); break;
      case 'f-as': F.diaria.as = parseInt(v, 10); break;
      case 'f-repetir': F.diaria.repetir = el.checked; break;
      case 'f-horario': F.horario = v; agendarTexto(); break;
      case 'f-loja': F.lojaId = v; $('#f-onde-livre').hidden = v !== 'outro'; break;
      case 'f-cidade': if (e.type !== 'change') return; F.cidade = v; F.bairro = ''; sincronizarOnde(); break;
      case 'f-bairro': if (e.type !== 'change') return; F.bairro = v; sincronizarOnde(); break;
      case 'f-desc': F.descricao = v; agendarTexto(); limparErro('c-desc'); break;
      case 'f-semexp': F.semExp = el.checked; break;
      case 'f-pcd': F.pcd = el.checked; break;
      case 'f-conf': F.confidencial = el.checked; break;
      default: return;
    }
    if (id === 'f-titulo') { limparErro('c-titulo'); atualizarDica(); }
    mudou();
  }
  function mudou() {
    if (!F) return;
    F.sujo = true;
    atualizarPrevia(); pintarTurnoDiaria();
    if (tentou) revisarFaltas();
    agendarRascunho();
  }
  function agendarRascunho() {
    clearTimeout(timerRasc);
    timerRasc = setTimeout(function () {
      if (!F) return;
      if (F.modo === 'nova') E.gravarJSON(CHAVE_RASC, F);
      var r = $('#rascunho-info'); if (r) r.textContent = F.modo === 'editar' ? 'Alterações não salvas' : 'Rascunho salvo às ' + E.relogio();
    }, 400);
  }
  function pararTimers() { clearTimeout(timerRasc); clearTimeout(timerTexto); clearTimeout(timerDoc); }
  E.pararTimersForm = pararTimers;
  function atualizarDica() { var el = $('#f-sal-dica'); if (!el) return; var d = dicaSalario(); el.textContent = d; el.hidden = !d; }
  function limparErro(cid) { var c = document.getElementById(cid); if (!c) return; c.removeAttribute('data-erro'); c.removeAttribute('aria-invalid'); $$('[aria-invalid]', c).forEach(function (x) { x.removeAttribute('aria-invalid'); }); var er = c.querySelector(':scope > .erro-campo'); if (er) er.remove(); }
  E.limparErro = limparErro;

  /* ---------- conferência do texto: o banco diz o que tirar e o que escrever no lugar ---------- */
  function textoTodo() { return [F.titulo, F.descricao, F.horario].concat(F.atividades, F.requisitos, F.perguntas, F.beneficios).filter(Boolean).join('\n'); }
  function agendarTexto() { clearTimeout(timerTexto); timerTexto = setTimeout(checarAgora, 600); }
  function mostrarCheck(r) {
    var el = $('#f-desc-check'); if (!el) return;
    $('#f-desc-n').textContent = milhar(F.descricao.length) + ' de 1.500';
    if (!F.descricao.trim() || !r) { el.className = 'check-texto'; el.innerHTML = ''; return; }
    var msgs = (r.barra || []).map(function (x) { return x.mensagem; });
    el.className = 'check-texto ' + (msgs.length ? 'erro' : 'ok');
    el.innerHTML = msgs.length ? ic('erro') + '<span>' + msgs.map(esc).join('<br>') + '</span>' : ic('check') + 'Texto ok';
  }
  function checarAgora() {
    if (!F || !$('#f-desc-check')) return Promise.resolve(null);
    $('#f-desc-n').textContent = milhar(F.descricao.length) + ' de 1.500';
    var texto = textoTodo(), n = ++checagem;
    if (!texto.trim()) { textoOk = null; mostrarCheck(null); return Promise.resolve(null); }
    return E.api('textoChecar', { texto: texto, contexto: 'vaga' }).then(function (r) {
      if (n !== checagem || !F) return r;
      textoOk = r; mostrarCheck(r); return r;
    }, function () { return null; });
  }

  /* ---------- botões do formulário ---------- */
  ACOES['qtd'] = function (el) { F.qtd = Math.max(1, Math.min(50, F.qtd + parseInt(el.getAttribute('data-d'), 10))); $('#f-qtd').value = F.qtd; mudou(); };
  ACOES['do-zero'] = function () {
    pararTimers();
    var rasc = F.continuando, guarda = { lojaId: F.lojaId, cidade: F.cidade, bairro: F.bairro, emp: F.emp }, t = F.titulo;
    F = formVazio(); for (var k in guarda) F[k] = guarda[k];
    if (rasc) E.apagar(CHAVE_RASC); else F.titulo = t;
    tentou = false; textoOk = null; E.render();
    toast(rasc ? 'Rascunho apagado. Comece a vaga do zero.' : 'Modelo tirado. Escreva do seu jeito.', null, null, 'lapis');
  };
  ACOES['item-add'] = function (el) {
    var id = el.getAttribute('data-lista'), lista = F[LISTAS[id]]; lista.push('');
    $('#' + id).innerHTML = itensLista(id, lista, id === 'f-ativ' ? 'Tarefa' : 'Requisito');
    $('#' + id + '-' + (lista.length - 1)).focus(); mudou();
  };
  ACOES['item-tirar'] = function (el) {
    var id = el.getAttribute('data-lista'), lista = F[LISTAS[id]]; lista.splice(parseInt(el.getAttribute('data-i'), 10), 1);
    $('#' + id).innerHTML = itensLista(id, lista, id === 'f-ativ' ? 'Tarefa' : id === 'f-req' ? 'Requisito' : 'Pergunta');
    if (id === 'f-perg') pintarSugPerg(); agendarTexto(); mudou();
  };
  ACOES['benef-add'] = function () {
    var inp = $('#f-benef-outro'), t = inp.value.trim(); if (!t) { inp.focus(); return; }
    if (F.beneficios.indexOf(t) < 0) F.beneficios.push(t); inp.value = ''; $('#f-benef-caixa').innerHTML = chipsBenef(); agendarTexto(); mudou();
  };
  ACOES['perg-sug'] = function (el) { if (F.perguntas.length >= 2) return; F.perguntas.push(el.getAttribute('data-p')); $('#f-perg').innerHTML = itensLista('f-perg', F.perguntas, 'Pergunta'); pintarSugPerg(); mudou(); };
  ACOES['perg-add'] = function () {
    var inp = $('#f-perg-nova'), t = inp.value.trim(); if (!t) { inp.focus(); return; }
    if (F.perguntas.length >= 2) return; if (!/\?$/.test(t)) t += '?';
    F.perguntas.push(t); inp.value = ''; $('#f-perg').innerHTML = itensLista('f-perg', F.perguntas, 'Pergunta'); pintarSugPerg(); agendarTexto(); mudou();
  };
  ACOES['ver-previa'] = function () {
    abrir('folha', folhaTopo('folha-titulo', 'Como as pessoas veem') + '<div class="folha-corpo"><div class="previa-moldura">' + htmlPrevia() + '</div></div>' +
      '<div class="folha-rodape"><button class="btn" type="button" data-acao="fechar-dialogo">Voltar ao formulário</button></div>');
  };
  ACOES['sair-form'] = function () {
    if (!F) { ir(S.empresa ? '#/inicio' : '#/anunciar'); return; }
    pararTimers();
    var m = F.modo, aq = S.empresa ? '#/inicio' : '#/anunciar';
    if (m === 'nova') {
      var tem = temConteudo(F);
      if (tem) E.gravarJSON(CHAVE_RASC, F);
      F = null; if (tem) toast('Rascunho guardado neste aparelho'); ir(aq); return;
    }
    var descartar = function () { F = null; ir('#/vagas'); toast('Alterações descartadas', null, null, 'x'); };
    if (!F.sujo) { F = null; ir('#/vagas'); return; }
    E.janela2('Sair sem salvar?', 'Você mudou esta vaga e ainda não salvou.', { rot: 'Descartar', fn: descartar }, { rot: F.rascunhoVaga ? 'Guardar o rascunho' : 'Salvar', fn: function () { ACOES['publicar'](null, F.rascunhoVaga ? { guardar: true } : null); } });
  };

  /* ---------- prévia ao vivo ---------- */
  function lojaEscolhida() {
    if (!F.lojaId || F.lojaId === 'outro') return null;
    var ls = E.lojas(); for (var i = 0; i < ls.length; i++) if (ls[i].id === F.lojaId) return ls[i];
    return null;
  }
  function ondeDoForm() {
    var l = lojaEscolhida();
    if (l) return { cidade: E.lojaCidadeSlug(l), bairro: l.bairro || '' };
    return { cidade: F.cidade, bairro: F.bairro };
  }
  /* o que o formulário vira para o banco (forma de vagaPublicar / vagaEditar) */
  function vagaParaApi() {
    var onde = ondeDoForm(), dias = E.diasProximos(8), d = dias[F.diaria.dia] || dias[0], diaria = F.tipo === 'Diária';
    var sal = { min: num(F.sal.de), periodo: F.sal.por };
    if (num(F.sal.ate) > num(F.sal.de)) sal.max = num(F.sal.ate);
    if (F.sal.comissao) sal.obs = 'ganho médio com comissão';
    var v = {
      titulo: F.titulo.trim(), setorId: F.setorId, tipo: E.tipoApi(F.tipo), turno: diaria ? E.turnoPelaHora(F.diaria.das, F.diaria.as, d.fds) : F.turno,
      horario: diaria ? E.textoDiaria(F.diaria) : F.horario.trim(), salario: sal, beneficios: F.beneficios.slice(), requisitos: F.requisitos.map(function (x) { return x.trim(); }).filter(Boolean),
      descricao: F.descricao.trim(), atividades: F.atividades.map(function (x) { return x.trim(); }).filter(Boolean), perguntas: F.perguntas.map(function (x) { return x.trim(); }).filter(Boolean),
      vagasQtd: F.qtd, semExperiencia: F.semExp, pcd: F.pcd, cidade: onde.cidade, bairro: onde.bairro, repete: diaria && F.diaria.repetir
    };
    if (diaria) v.diaria = { data: d.iso, das: E.hh(F.diaria.das), as: E.hh(F.diaria.as) };
    if (F.confidencial && E.verificada()) v.confidencial = true;
    return v;
  }
  function empresaDaPrevia() {
    if (S.empresa) return S.empresa;
    return { nome: F.emp.nome || 'Sua empresa', verificada: false };
  }
  function atualizarPrevia() { var c = $('#previa-corpo'); if (c && F) c.innerHTML = htmlPrevia(); }
  function htmlPrevia() {
    var v = vagaParaApi(), emp = empresaDaPrevia(); v.publicadaEm = new Date(E.agora()).toISOString();
    var onde = [v.bairro, E.cidadeNome(v.cidade)].filter(Boolean).join(', ');
    var horaTxt = [v.turno, v.horario && v.horario !== v.turno ? v.horario : ''].filter(Boolean).join(' · ');
    return '<p class="detalhe">Na lista de vagas</p>' + E.cartaoVaga(v, emp) +
      '<p class="detalhe">Na página da vaga</p>' +
      '<div class="pv">' +
      '<div><h3>' + (v.titulo ? esc(v.titulo) : '<span class="pv-vazio">Função</span>') + '</h3><p class="soft">' + esc(emp.nome) + (onde ? ' · ' + esc(onde) : '') + '</p></div>' +
      (emp.verificada ? '<span class="selo verificada">' + ic('escudo') + 'Empresa verificada</span>' : '<span class="selo verificando">' + ic('meio') + 'Empresa em verificação</span>') +
      '<p class="pv-sal">' + E.salHtml(v.salario) + '</p>' +
      '<ul class="lista-fatos">' +
      (F.tipo ? '<li>' + ic('maleta') + esc(F.tipo) + (v.vagasQtd > 1 ? ' · ' + v.vagasQtd + ' vagas' : '') + '</li>' : '') +
      (v.turno || v.horario ? '<li>' + ic('relogio') + esc(horaTxt) + (v.repete ? ' · repete toda semana' : '') + '</li>' : '') +
      (onde ? '<li>' + ic('local') + esc(onde) + '</li>' : '') +
      (v.semExperiencia ? '<li>' + ic('check') + 'Aceita sem experiência</li>' : '') + (v.pcd ? '<li>' + ic('check') + 'Vaga também para PcD</li>' : '') +
      '</ul>' +
      (v.descricao ? '<p class="texto">' + esc(v.descricao.length > 320 ? v.descricao.slice(0, 317) + '…' : v.descricao) + '</p>' : '<p class="texto pv-vazio">A descrição aparece aqui.</p>') +
      (v.atividades.length ? '<h4>O que vai fazer</h4><ul class="pts">' + v.atividades.slice(0, 4).map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul>' : '') +
      (v.beneficios.length ? '<h4>Benefícios</h4><div class="fila">' + v.beneficios.map(function (b) { return '<span class="etiqueta">' + esc(b) + '</span>'; }).join('') + '</div>' : '') +
      (v.perguntas.length ? '<h4>A empresa pergunta</h4><ul class="pts">' + v.perguntas.map(function (p) { return '<li>' + esc(p) + ' (sim ou não)</li>'; }).join('') + '</ul>' : '') +
      E.golpe() + '<span class="pv-cta" aria-hidden="true">Candidatar-me</span>' +
      '</div>';
  }

  /* ---------- E3 · "Falta só sua empresa": CNPJ, nome, responsável, WhatsApp e e-mail ---------- */
  E.blocoEmpresa = function (emp) {
    return '<div class="campo" id="c-doc"><label for="f-doc">CNPJ da empresa</label><input id="f-doc" class="entrada num" inputmode="text" autocomplete="off" autocapitalize="characters" placeholder="00.000.000/0000-00" value="' + esc(emp.doc) + '">' +
      '<p class="dica">MEI usa o CNPJ do Certificado do MEI (CCMEI). A gente confere na Receita na hora.</p>' +
      (E.previa ? '<p class="dica">Na demonstração: <button class="link" type="button" data-acao="cnpj-exemplo">Usar CNPJ de exemplo</button> · <button class="link" type="button" data-acao="cnpj-inativo">Ver CNPJ não ativo</button></p>' : '') +
      '<div class="doc-res" id="f-doc-res" aria-live="polite"></div></div>' +
      '<div class="campo" id="c-empnome"><label for="f-emp-nome">Nome da empresa</label><input id="f-emp-nome" class="entrada" autocomplete="organization" maxlength="120" value="' + esc(emp.nome) + '"><p class="dica">É o nome que as pessoas veem na vaga.</p></div>' +
      '<div class="campo" id="c-resp"><label for="f-resp">Seu nome</label><input id="f-resp" class="entrada" autocomplete="name" maxlength="120" value="' + esc(emp.resp) + '"></div>' +
      '<div class="campo" id="c-whats"><label for="f-whats">WhatsApp da empresa</label><input id="f-whats" class="entrada" type="tel" inputmode="tel" autocomplete="tel" placeholder="(62) 9 0000-0000" value="' + esc(emp.whats) + '"><p class="dica">Não aparece na vaga. É o contato da empresa com a equipe do Vagas sem Caos.</p></div>' +
      '<div class="campo" id="c-email"><label for="f-email">E-mail</label><input id="f-email" class="entrada" type="email" inputmode="email" autocomplete="email" autocapitalize="none" placeholder="nome@empresa.com" value="' + esc(emp.email) + '"><p class="dica">Mandamos um código de 6 números para este e-mail. É assim que você entra, sem senha.</p></div>' +
      '<p class="detalhe">Ao publicar, você aceita os <a class="link" href="termos.html" target="_blank" rel="noopener">Termos de uso</a> e o <a class="link" href="privacidade.html" target="_blank" rel="noopener">Aviso de privacidade</a>.</p>';
  };
  function mascaraDoc(v) {
    if (/[a-z]/i.test(v)) return v.toUpperCase();
    var d = v.replace(/\D/g, '').slice(0, 14);
    if (d.length <= 11) return d.slice(0, 3) + (d.length > 3 ? '.' + d.slice(3, 6) : '') + (d.length > 6 ? '.' + d.slice(6, 9) : '') + (d.length > 9 ? '-' + d.slice(9) : '');
    return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + (d.length > 12 ? '-' + d.slice(12) : '');
  }
  function alnum(s) { return String(s || '').replace(/[^0-9a-z]/gi, '').toUpperCase(); }
  function titulo(s) {
    var peq = ['de', 'da', 'do', 'das', 'dos', 'e'];
    return String(s || '').toLowerCase().replace(/(^|\s)([a-zà-ú])([a-zà-ú]*)/g, function (m, a, b, c) { var w = b + c; return a + (peq.indexOf(w) >= 0 && a ? w : b.toUpperCase() + c); }).replace(/\s+/g, ' ').trim();
  }
  /* liga os campos da empresa dentro de um contêiner (formulário ou "várias vagas") */
  E.ligarEmpresa = function (raiz, emp, aoMudar) {
    E.EMPX = emp; E.empMudou = aoMudar || function () {};
  };
  E.aoDigitarEmpresa = function (e) {
    var el = e.target, v = el.value, emp = E.EMPX; if (!emp) return false;
    switch (el.id) {
      case 'f-doc':
        if (e.type === 'input') { var fm = mascaraDoc(v); if (fm !== v) { var noFim = el.selectionStart === v.length; el.value = fm; if (noFim) try { el.setSelectionRange(fm.length, fm.length); } catch (x) { /* sem seleção */ } } v = el.value; }
        if (e.type === 'change' && v === emp.consultado) return true;
        if (v !== emp.doc && emp.ok) { emp.ok = false; var rr = $('#f-doc-res'); if (rr) rr.innerHTML = ''; }
        emp.doc = v;
        var dg = alnum(v);
        clearTimeout(timerDoc);
        if (e.type === 'change' || dg.length === 11 || dg.length >= 14) consultarDoc();
        else { var r2 = $('#f-doc-res'); if (r2) r2.innerHTML = ''; emp.consultado = ''; emp.consulta = null; }
        limparErro('c-doc'); return true;
      case 'f-emp-nome': emp.nome = v; limparErro('c-empnome'); return true;
      case 'f-resp': emp.resp = v; limparErro('c-resp'); return true;
      case 'f-whats': emp.whats = v; limparErro('c-whats'); return true;
      case 'f-email': emp.email = v; limparErro('c-email'); return true;
    }
    return false;
  };
  function consultarDoc() {
    var emp = E.EMPX, res = $('#f-doc-res'); if (!emp || !res) return;
    var d = emp.doc.trim(), dg = alnum(d);
    emp.ok = false; emp.consultado = emp.doc; emp.consulta = null;
    if (!dg) { res.innerHTML = ''; return; }
    if (dg.length < 11 || (dg.length > 11 && dg.length < 14)) { res.innerHTML = '<p class="erro-campo">' + ic('erro') + 'O CNPJ tem 14 números ou letras. Confira o que você digitou.</p>'; return; }
    res.innerHTML = '<p class="consultando"><span class="giro" aria-hidden="true"></span>Consultando a Receita Federal…</p>';
    var tk = emp.consultado;
    E.api('cnpjConsultar', { cnpj: dg }).then(function (r) {
      if (!$('#f-doc-res') || emp.consultado !== tk) return;
      if (!r.ativa) {
        res.innerHTML = '<p class="erro-campo">' + ic('erro') + 'Este CNPJ não está ativo na Receita' + (r.situacao ? ' (situação: ' + esc(String(r.situacao).toLowerCase()) + ')' : '') + '. Só empresas ativas podem anunciar.</p>';
        return;
      }
      emp.consulta = r;
      var nome = titulo(r.nomeFantasia || r.razaoSocial), desde = r.abertura ? ' · ativa desde ' + String(r.abertura).slice(0, 4) : '';
      res.innerHTML = '<div class="empresa-achada"><div class="fila"><span class="vaga-logo" aria-hidden="true">' + esc(E.iniciais(nome)) + '</span><div><b>' + esc(nome) + '</b>' +
        '<p class="detalhe">' + esc([E.cidadeNome(E.cidadePorNome(r.cidade) ? E.cidadePorNome(r.cidade).id : r.cidade) || titulo(r.cidade), r.uf, r.bairro ? titulo(r.bairro) : ''].filter(Boolean).join(' · ')) + esc(desde) + '</p></div></div>' +
        '<p>É esta empresa?</p><div class="fila"><button class="btn sec" type="button" data-acao="doc-sim">Sim</button><button class="link" type="button" data-acao="doc-nao">Não, corrigir</button></div></div>';
    }, function (e) {
      if (!$('#f-doc-res') || emp.consultado !== tk) return;
      var cpf = e && e.codigo === 'cpf';
      res.innerHTML = cpf ? '<div class="faixa calmo">' + ic('info') + '<span>' + esc(E.msgErro(e)) + '</span></div>' : '<p class="erro-campo">' + ic('erro') + esc(E.msgErro(e)) + '</p>';
    });
  }
  E.pintarEmpresaAchada = function () {
    var res = $('#f-doc-res'), emp = E.EMPX; if (!res || !emp) return;
    res.innerHTML = '<div class="faixa ok">' + ic('check') + '<span>' + esc(emp.nome || 'Empresa') + ' · CNPJ ativo na Receita Federal.</span></div>';
  };
  ACOES['doc-sim'] = function () {
    var emp = E.EMPX, r = emp.consulta; emp.ok = true;
    if (r && !emp.nome.trim()) { emp.nome = titulo(r.nomeFantasia || r.razaoSocial); var n = $('#f-emp-nome'); if (n) n.value = emp.nome; }
    if (F && r && !F.bairro) {   /* o bairro e a cidade vêm do endereço da Receita, quando batem com a lista */
      var c = E.cidadePorNome(r.cidade);
      if (c) { F.cidade = c.id; var b = c.bairros.filter(function (x) { return norm(x) === norm(r.bairro); })[0]; if (b) F.bairro = b; sincronizarOnde(); }
    }
    E.pintarEmpresaAchada(); limparErro('c-doc'); limparErro('c-empnome');
    if (F) mudou(); else if (E.empMudou) E.empMudou();
    var rs = $('#f-resp'); if (rs) rs.focus();
  };
  function trocarDoc(valor) { var emp = E.EMPX, i = $('#f-doc'); if (!emp || !i) return; i.value = valor; emp.doc = valor; emp.ok = false; limparErro('c-doc'); consultarDoc(); }
  ACOES['cnpj-exemplo'] = function () { trocarDoc('EX.EMP.LO0/0001-00'); };
  ACOES['cnpj-inativo'] = function () { trocarDoc('EX.INA.TI0/0001-00'); };
  ACOES['doc-nao'] = function () { var emp = E.EMPX; emp.ok = false; emp.consulta = null; $('#f-doc-res').innerHTML = ''; var i = $('#f-doc'); i.value = ''; emp.doc = ''; emp.consultado = ''; i.focus(); };

  /* ---------- o que falta antes de publicar ---------- */
  function faltas() {
    var f = [];
    if (!F.titulo.trim()) f.push(['c-titulo', 'função', 'f-titulo', 'Escreva a função.']);
    if (!F.setorId) f.push(['c-setor', 'área', 'f-setor', 'Escolha a área da vaga.']);
    if (!num(F.sal.de)) f.push(['c-de', 'salário', 'f-de', 'Informe o salário. A vaga precisa mostrar o valor.']);
    if (!F.tipo) f.push(['f-tipo', 'tipo de contrato', 'f-tipo', '']);
    if (F.tipo !== 'Diária' && !F.turno) f.push(['f-turno', 'turno', 'f-turno', '']);
    if (!ondeDoForm().bairro) f.push(['c-bairro', 'bairro', 'f-bairro', 'Escolha o bairro.']);
    if (F.descricao.trim().length < 40) f.push(['c-desc', 'descrição', 'f-desc', 'Descreva a vaga em pelo menos 40 letras.']);
    if (!S.empresa) faltasEmpresa(F.emp, f);
    return f;
  }
  function faltasEmpresa(emp, f) {
    if (!emp.ok) f.push(['c-doc', 'CNPJ', 'f-doc', 'Confirme o CNPJ.']);
    if (!emp.nome.trim()) f.push(['c-empnome', 'nome da empresa', 'f-emp-nome', 'Escreva o nome da empresa.']);
    if (!emp.resp.trim()) f.push(['c-resp', 'seu nome', 'f-resp', 'Escreva seu nome.']);
    if (!E.waValido(emp.whats)) f.push(['c-whats', 'WhatsApp', 'f-whats', 'Escreva o WhatsApp com DDD.']);
    if (!E.emailValido(emp.email)) f.push(['c-email', 'e-mail', 'f-email', 'Escreva o e-mail com @, como nome@empresa.com.']);
    return f;
  }
  E.faltasEmpresa = faltasEmpresa;
  function caixaFaltas(f, alerta) {
    var nomes = f.map(function (x) { return x[1]; });
    var frase = nomes.length === 1 ? 'Falta 1 coisa: ' + nomes[0] + '.' : 'Faltam ' + nomes.length + ' coisas: ' + nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1] + '.';
    return '<div class="caixa-erro" data-faltas' + (alerta ? ' role="alert"' : '') + '>' + ic('erro') + '<div><b>' + esc(frase) + '</b><ul>' +
      f.map(function (x) { return '<li><button class="link" type="button" data-acao="ir-campo" data-campo="' + x[2] + '">' + esc(x[1].replace(/^./, function (c) { return c.toUpperCase(); })) + '</button></li>'; }).join('') + '</ul></div></div>';
  }
  E.caixaFaltas = caixaFaltas;
  function marcarFaltas(f) {
    f.forEach(function (x) {
      var c = document.getElementById(x[0]); if (!c) return;
      if (c.classList.contains('chips')) { c.setAttribute('aria-invalid', 'true'); return; }
      c.setAttribute('data-erro', ''); var inp = document.getElementById(x[2]); if (inp) inp.setAttribute('aria-invalid', 'true');
      if (x[3] && !c.querySelector(':scope > .erro-campo')) c.insertAdjacentHTML('beforeend', '<p class="erro-campo">' + ic('erro') + esc(x[3]) + '</p>');
    });
  }
  E.marcarFaltas = marcarFaltas;
  function mostrarFaltas(f) {
    $('#form-erros').innerHTML = caixaFaltas(f, true);
    marcarFaltas(f);
    $('#form-erros').scrollIntoView({ block: 'center', behavior: E.movimentoReduzido() ? 'auto' : 'smooth' });
  }
  ACOES['ir-campo'] = function (el) { var i = document.getElementById(el.getAttribute('data-campo')); if (!i) return; i.scrollIntoView({ block: 'center' }); var foco = i.matches('input,select,textarea') ? i : i.querySelector('button'); if (foco) foco.focus({ preventScroll: true }); };

  /* ---------- publicar ---------- */
  function mostrarErroTexto(e) {
    var barra = (e.resposta && e.resposta.barra) || [];
    var lista = barra.length ? barra.map(function (b) { return b.mensagem; }) : [E.msgErro(e)];
    $('#form-erros').innerHTML = '<div class="caixa-erro" role="alert">' + ic('erro') + '<div><b>Ajuste o texto antes de publicar</b><ul>' + lista.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div></div>';
    var campo = barra[0] && barra[0].campo, alvo = { titulo: '#f-titulo', descricao: '#f-desc', horario: '#f-horario', atividades: '#f-ativ', requisitos: '#f-req', perguntas: '#f-perg', beneficios: '#f-benef-caixa' }[campo] || '#f-desc';
    var a = $(alvo); if (a) a.scrollIntoView({ block: 'center' });
    mostrarCheck({ barra: barra });
  }
  var CODIGO_CAMPO = { titulo: 'c-titulo', setor: 'c-setor', salario_obrigatorio: 'c-de', salario_invalido: 'c-de', salario_periodo: 'c-de', descricao: 'c-desc', turno: 'f-turno', tipo: 'f-tipo', quantidade: 'c-qtd', cidade: 'c-bairro' };
  function tratarErro(e) {
    publicando = false; var b = $('#btn-publicar'); if (b) { b.disabled = false; b.textContent = botaoRotulo(); }
    if (!$('#form-erros')) { toast(E.msgErro(e), null, null, 'erro'); return; }
    var cod = e && e.codigo;
    if (cod === 'texto_barrado') { mostrarErroTexto(e); return; }
    if (cod === 'limite_dia') { abrirLimiteDia(E.msgErro(e)); return; }
    var cid = CODIGO_CAMPO[cod];
    $('#form-erros').innerHTML = '<div class="caixa-erro" role="alert">' + ic('erro') + '<div><b>' + esc(E.msgErro(e)) + '</b>' + (cod === 'cnpj_repetido' ? '<p>' + E.ajudaHtml('Falar com a Gestão sem Caos', 'Meu CNPJ já tem cadastro no Vagas sem Caos') + '</p>' : '') + '</div></div>';
    if (cid) marcarFaltas([[cid, '', cid === 'c-de' ? 'f-de' : cid === 'c-desc' ? 'f-desc' : cid === 'c-titulo' ? 'f-titulo' : cid === 'c-setor' ? 'f-setor' : 'f-bairro', '']]);
    $('#form-erros').scrollIntoView({ block: 'center' });
  }
  function botaoRotulo() { return F && F.modo === 'editar' && !F.rascunhoVaga ? 'Salvar alterações' : (!S.empresa ? 'Publicar agora' : 'Publicar vaga'); }
  function travar(sim) { publicando = sim; var b = $('#btn-publicar'); if (b) { b.disabled = sim; b.textContent = sim ? 'Publicando…' : botaoRotulo(); } }

  ACOES['publicar'] = function (el, op) {
    if (!F || publicando) return;
    op = op || {};
    tentou = true;
    var f = faltas();
    if (f.length) { mostrarFaltas(f); return; }
    $('#form-erros').innerHTML = '';
    travar(true);
    clearTimeout(timerTexto);
    var tx = textoTodo();
    E.api('textoChecar', { texto: tx, contexto: 'vaga' }).then(function (r) {
      if (r && r.barra && r.barra.length) { travar(false); mostrarErroTexto({ resposta: { barra: r.barra } }); throw null; }
      return r;
    }, function () { return null; }).then(function () {
      if (F.modo === 'editar') return salvarEdicao(op);
      if (!S.empresa) return garantirEmpresa().then(function (emp) { if (!emp) { travar(false); return; } return enviarNova(); });
      return enviarNova();
    }).catch(function (e) { if (e === null) return; tratarErro(e); });
  };

  function enviarNova() {
    return E.api('vagaPublicar', { empresaId: S.empresa.id, vaga: vagaParaApi(), idLocal: F.idLocal }).then(function (r) {
      aposPublicar(r);
    });
  }
  function salvarEdicao(op) {
    var id = F.id, rasc = F.rascunhoVaga;
    return E.api('vagaEditar', { id: id, vaga: vagaParaApi() }).then(function (r) {
      E.trocaVaga(r.vaga);
      if (rasc && !op.guardar) {
        return E.api('vagaAcao', { id: id, acao: 'publicar' }).then(function (r2) { aposPublicar(r2); });
      }
      pararTimers(); F = null; publicando = false;
      E.esquecerTela();
      ir('#/vagas');
      toast(rasc ? 'Rascunho guardado.' : (r.estado === 'revisao_rapida' ? 'Alterações salvas. A vaga ficou em revisão rápida.' : 'Alterações salvas. A vaga continua no ar.'));
    });
  }
  function aposPublicar(r) {
    pararTimers(); publicando = false;
    E.apagar(CHAVE_RASC); F = null;
    if (r.vaga) E.trocaVaga(r.vaga);
    E.ultimoResultado = { estado: r.estado, mensagens: r.mensagens || [] };
    if (r.estado === 'rascunho') { E.esquecerTela(); abrirRascunho(r); return; }
    E.esquecerTela();
    ir('#/publicada/' + encodeURIComponent(r.vaga.id));
  }
  function abrirRascunho(r) {
    var msg = (r.mensagens && r.mensagens[0]) || 'Esta vaga ficou salva como rascunho.';
    abrir('folha-curta', folhaTopo('folha-curta-titulo', 'Sua vaga ficou como rascunho') +
      '<div class="folha-corpo"><p>' + esc(msg) + '</p>' +
      '<p class="dica mt-12">Para liberar: pause ou encerre outra vaga e toque em "Publicar" no rascunho, ou espere a verificação da empresa.</p></div>' +
      '<div class="folha-rodape"><button class="btn fantasma" type="button" data-acao="ir" data-para="#/verificacao">Ver a verificação</button><button class="btn" type="button" data-acao="ir-rascunhos">Ver minhas vagas</button></div>');
    var dl = $('#folha-curta'); dl.onfechou = function () { ir('#/vagas?aba=rascunho'); };
  }
  ACOES['ir-rascunhos'] = function () { var dl = $('#folha-curta'); dl.onfechou = null; fechar('folha-curta', function () { UI.aba = 'rascunho'; ir('#/vagas?aba=rascunho'); }); };
  function abrirLimiteDia(msg) {
    abrir('folha-curta', folhaTopo('folha-curta-titulo', 'Limite de vagas do dia') +
      '<div class="folha-corpo"><p>' + esc(msg) + '</p><p class="dica mt-12">Seu texto continua guardado neste aparelho. Volte amanhã e publique. Depois da verificação da empresa, o limite sobe. ' + E.ajudaHtml('Falar com a gente', 'Preciso de ajuda com o limite de vagas') + '</p></div>' +
      '<div class="folha-rodape"><button class="btn" type="button" data-acao="fechar-dialogo">Entendi</button></div>');
  }

  /* cria a conta da empresa no fim: código por e-mail, depois a empresa. Devolve a empresa (ou null se a pessoa voltou).
     ctx: {cidade, bairro, setorId, ocupado(sim)} */
  E.criarContaEmpresa = function (emp, ctx) {
    return new Promise(function (resolve, reject) {
      function criar() {
        var setor = E.setorPor(ctx.setorId);
        var dados = { cnpj: alnum(emp.doc), nomeFantasia: emp.nome.trim(), cidade: ctx.cidade, bairro: ctx.bairro, setor: setor ? setor.nome : (emp.consulta && emp.consulta.setor) || '',
          responsavel: emp.resp.trim(), whatsapp: E.waDigitos(emp.whats), email: emp.email.trim() };
        return E.api('empresaCriar', dados).then(function (r) {
          E.definirEmpresas([r.empresa], r.empresa.id); S.vagas = []; S.cands = []; S.limites = null;
          resolve(r.empresa);
        });
      }
      E.abrirCodigo({
        email: emp.email.trim(), nome: emp.resp.trim(), titulo: 'Confirme seu e-mail', botao: 'Confirmar e publicar', tipo: 'empresa',
        aoVoltar: function () { resolve(null); },
        aoConfirmar: function () {
          if (ctx.ocupado) ctx.ocupado(true);
          E.carregarConta().then(function () {
            if (S.empresa) { toast('Você já tem conta: as vagas vão para ' + S.empresa.nome + '.', null, null, 'info'); resolve(S.empresa); return; }
            return criar();
          }).catch(reject);
        }
      });
    });
  };
  function garantirEmpresa() {
    var onde = ondeDoForm();
    return E.criarContaEmpresa(F.emp, { cidade: onde.cidade, bairro: onde.bairro, setorId: F.setorId, ocupado: travar });
  }

  /* ---------- E4 · Sua vaga está no ar ---------- */
  PRE.publicada = function (r) {
    if (E.vagaPor(r.arg) && S.painelEm && Date.now() - S.painelEm < 30000) return null;
    return E.carregarPainel().then(function () { if (!E.vagaPor(r.arg)) throw new Error('Não achamos esta vaga na sua empresa.'); });
  };
  TELAS.publicada = function (r) {
    var v = E.vagaPor(r.arg); if (!v) { setTimeout(function () { ir('#/vagas'); }); return { html: '' }; }
    var verif = E.verificada(), msg = E.mensagemCompartilhar(v), res = E.ultimoResultado || {}, rapida = v.status === 'segurada' || v.status === 'revisao' || res.estado === 'revisao_rapida';
    var noAr = v.status === 'aberta';
    var html = '<div class="e4">' +
      '<div class="e4-ok">' + ic(rapida ? 'relogio' : 'check') + '</div>' +
      '<h1>' + (rapida ? 'Sua vaga está em revisão rápida' : 'Sua vaga está no ar') + '</h1>' +
      '<p class="sub-linha">' + esc(E.tituloLocal(v)) + (noAr ? ' · fica no ar até ' + esc(E.noArAte(v)) : '') + '</p>' +
      '<div class="fila mt-12">' + (verif ? '<span class="selo verificada">' + ic('escudo') + 'Empresa verificada</span>' : '<span class="selo verificando">' + ic('meio') + 'Empresa em verificação</span>') + E.exemplo() + '</div>' +
      (rapida ? '<p class="faixa calmo mt-16">' + ic('relogio') + '<span>' + esc((res.mensagens && res.mensagens[0]) || 'Sua vaga entra no ar assim que a equipe liberar. Nada se perde.') + '</span></p>' : '') +
      '<section class="e4-bloco"><h2>Compartilhe para chegar mais rápido</h2>' +
      '<p class="msg-pronta" id="msg-compartilhar">' + esc(msg) + '</p>' +
      '<div class="link-curto">' + ic('link') + '<span>' + esc(E.linkCurto(v)) + '</span></div>' +
      '<div class="fila"><button class="btn grande" type="button" data-acao="compartilhar" data-id="' + esc(v.id) + '">' + ic('conversa') + 'Compartilhar no WhatsApp</button>' +
      '<button class="btn sec grande" type="button" data-acao="copiar-link" data-id="' + esc(v.id) + '">' + ic('copiar') + 'Copiar link</button></div>' +
      '</section>' +
      (verif ? '' :
        '<section class="e4-bloco"><div class="fila"><span class="selo verificando">' + ic('meio') + 'Empresa em verificação</span></div>' +
        '<p>No ar na hora. Verificamos depois: a equipe do Vagas sem Caos confere sua empresa em até 7 dias. Suas vagas já aparecem para as pessoas. Até lá:</p>' +
        '<ul class="regras">' +
        '<li>' + ic('maleta') + 'Cabem até ' + (E.maxNoAr() == null ? 3 : E.maxNoAr()) + ' vagas no ar e ' + (E.maxHoje() == null ? 3 : E.maxHoje()) + ' vagas novas por dia.</li>' +
        '<li>' + ic('conversa') + 'A conversa com quem se candidata é pelo Vagas sem Caos. O WhatsApp aparece quando a pessoa liberar ou quando sua empresa for verificada.</li>' +
        '<li>' + ic('escudo') + 'Não peça dinheiro nem documento a quem se candidata. Duas denúncias tiram a vaga do ar.</li>' +
        (E.prazoVerificacao() ? '<li>' + ic('calendario') + 'Prazo para verificar: até ' + esc(E.prazoVerificacao()) + '. Depois disso, as vagas pausam até a verificação.</li>' : '') +
        '</ul>' +
        '<div class="fila"><a class="btn sec" href="#/verificacao">' + ic('upload') + 'Ver o que falta</a><span class="detalhe">Dá para enviar um documento agora ou depois.</span></div>' +
        '</section>') +
      '<section class="e4-bloco"><h2>E agora?</h2><p class="soft">Cada candidatura chega no painel, com o resumo do currículo e as respostas.</p>' +
      '<div class="fila"><a class="btn sec" href="#/vaga/nova" data-acao="nova-vaga">' + ic('mais') + 'Anunciar outra vaga</a>' +
      '<button class="link" type="button" data-acao="duplicar" data-id="' + esc(v.id) + '">Duplicar esta vaga</button><a class="link" href="#/inicio">Ir para o painel</a></div></section>' +
      '<div class="mt-24">' + E.golpe() + '</div>' +
      '</div>';
    return { html: html, nav: 'vagas', barra: 'baixo', topoBotao: 'sec', titulo: 'Vaga publicada' };
  };
  ACOES['compartilhar'] = function (el) {
    var v = E.vagaPor(el.getAttribute('data-id')); if (!v) return;
    var msg = E.mensagemCompartilhar(v);
    E.copiar(msg);
    E.abrirEmNovaAba(E.linkWhatsAppCompartilhar(msg));
    toast(E.previa ? 'Na demonstração, a mensagem também foi copiada.' : 'Abrindo o WhatsApp com a mensagem pronta.', null, null, 'conversa');
  };
  ACOES['copiar-link'] = function (el) { var v = E.vagaPor(el.getAttribute('data-id')); if (!v) return; E.copiar(E.linkCurto(v)).then(function (ok) { toast(ok ? 'Link copiado' : 'Copie o link que está na tela.', null, null, 'copiar'); }); };
})();
