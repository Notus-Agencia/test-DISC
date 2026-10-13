/*
 * Painel (computador): subaba "Andamento" da página da empresa. UMD: window.DISC_ADMIN_ANDAMENTO / module.exports.
 *
 * Quem já fez o quê e o que falta mandar, numa tela só: o teste DISC por pessoa, a pesquisa de clima por equipe e a
 * situação de cada líder avaliado no Feedback 360. Regra de confidencialidade (a mesma prometida a quem responde):
 *   - Teste DISC é identificado (a pessoa é avisada de que o resultado vai para a empresa): aparece por pessoa
 *     (respondeu em dd/mm, falta, parte 2).
 *   - Pesquisa de clima: NUNCA por pessoa. Só as contagens por rodada e por equipe que DISC_API.climaListar já devolve
 *     (convidados e respondentes). Nada dos links pessoais (convites) nem da contagem de identificadas é lido aqui
 *     (modeloClima copia só os campos agregados). Nos modos com identificação, quem respondeu com nome só aparece na
 *     tela "Identificação (uso interno)" da subaba Pesquisa de clima, com registro de acesso: aqui, no máximo um botão
 *     para ir até lá.
 *   - Feedback 360: como avaliado(a), a situação agregada do ciclo dele (coleta aberta/encerrada, respostas de colegas,
 *     equipe e outros somadas, relatório liberado, devolutiva, relatório publicado). Chefia e autoavaliação (uma pessoa
 *     cada) ficam fora deste quadro. Como avaliador(a), NUNCA se respondeu: só "recebe N links (confidencial)", e só com
 *     o ciclo aberto (a lista de convites some no encerramento).
 *
 * Funções puras (testes em tests/admin-andamento.test.js):
 *   nomeCurto(nome) -> "Marta E." (mesma regra de DISC_CLIMA.nomeCurto)
 *   ordemOrganograma(colaboradores, relacoes, topoIds) -> [{c, nivel, liderId, liderados, semPosicao}] (ativos; topo
 *     primeiro, cada equipe abaixo do líder, em ordem alfabética dentro do nível; sem posição no fim, por nome)
 *   parte2Ligada(processo) -> bool (formulario.parte2 === 'ligada' no link da equipe)
 *   situacaoDisc(colaborador, processo) -> {respondeu, em, codigo, parte2: 'feita'|'falta'|'refazer'|'nao_pedida'|'sem_link'}
 *   resumoDisc(colaboradores, processo) -> {total, responderam, faltam:[colaborador], parte2Ligada, parte2Feitas}
 *   textoResumoDisc(resumo, processo) -> "6 de 7 colaboradores responderam · falta 1"
 *   modeloClima(rodada) -> {id, nome, status, modo, convidados, respondentes, taxa, equipes:[{id, nome, area, convidados, respondentes, taxa}]}
 *   rodadaEmFoco(rodadas) / cicloEmFoco(ciclos) -> a aberta, senão a mais recente (ou null)
 *   textoResumoClima(modelo) -> "Pesquisa de clima · set/2026: encerrada · 19 de 23 responderam (83%) · anônima"
 *   modeloF360(ciclo) -> {id, nome, status, aberto, encerramentoPrevisto, respondidos, formularios, nAvaliados, comRelatorio,
 *     devolutivas, avaliados: {pessoaId: situação}, links: {pessoaId: n} (só aberto)}
 *   textoResumoF360(modelo) -> "Feedback 360 · ago/2026: encerrado · 2 de 3 líderes com relatório liberado · 2 devolutivas feitas"
 *   mensagemLembrete({empresa, link, nomes, minutos}) -> texto para o grupo (nomes = primeiro nome + inicial de quem falta)
 *   mensagemPessoal({empresa, nome, link, minutos}) -> texto para a pessoa que falta
 *   montarQuadro({colaboradores, relacoes, topoIds, processo, rodadas, ciclos, agora}) -> o modelo inteiro da tela
 * DOM: bloco(ctx) -> <div id="emp-andamento">. ctx = { el, botao, api, copiar, avisar, href, emp, eq, colabs, proc, linkTeste,
 *   minutos, metodoApi(nome), linkWhatsApp(texto), linkWhatsAppPara(telefone, texto), criarLinkEquipe(), abrirProcesso(), irParaSubaba(sub),
 *   recarregarEquipe() -> Promise, redesenhar() }.
 */
(function (root) {
  'use strict';

  var K_RELATORIO_360 = 3;  // respostas de colegas, equipe e outros (somadas) para haver relatório (DISC_F360.K_TEMA)
  var ANONIMAS_360 = ['colegas', 'equipe', 'outros'];
  var MAX_RODADAS = 3;
  var MODO_TEXTO = { anonima: 'anônima', opcional: 'identificação opcional', identificada: 'identificada' };
  var MODO_SELO = { anonima: 'Anônima', opcional: 'Identificação opcional', identificada: 'Identificada' };
  var cache = {};   // empresaId -> {clima: {rodadas}|{erro}|{indisponivel}, f360: {ciclos}|{erro}|{indisponivel}}

  /* ------------------------------------------------------------------ funções puras */

  function nomeCurto(nome) {
    var PART = { de: 1, da: 1, do: 1, das: 1, dos: 1, e: 1 };
    var partes = String(nome || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    if (!partes.length) return 'Sem nome';
    var primeiro = partes[0].charAt(0).toUpperCase() + partes[0].slice(1);
    for (var i = 1; i < partes.length; i++) {
      if (!PART[partes[i].toLowerCase()]) return primeiro + ' ' + partes[i].charAt(0).toUpperCase() + '.';
    }
    return primeiro;
  }
  function primeiroNome(nome) { return String(nome || '').trim().split(/\s+/)[0] || ''; }
  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  function pct(n, d) { return d ? Math.min(100, Math.round(100 * n / d)) : 0; }
  function porNomeDe(mapa) {
    return function (a, b) { return String(mapa[a].nome || '').localeCompare(String(mapa[b].nome || ''), 'pt-BR'); };
  }

  // Pré-ordem do organograma (relação "lidera" entre ativos): topo salvo, depois os outros sem líder que lideram alguém,
  // cada equipe logo abaixo do seu líder (por nome). Quem não tem líder, não lidera e não está no topo vem no fim.
  function ordemOrganograma(colaboradores, relacoes, topoIds) {
    var ativos = {};
    (colaboradores || []).forEach(function (c) { if (c && c.status !== 'desligado' && c.pessoaId) ativos[String(c.pessoaId)] = c; });
    var filhos = {}, lider = {};
    (relacoes || []).forEach(function (r) {
      if (!r || r.tipo !== 'lidera') return;
      var de = String(r.de), para = String(r.para);
      if (!ativos[de] || !ativos[para] || de === para || lider[para]) return;
      (filhos[de] = filhos[de] || []).push(para);
      lider[para] = de;
    });
    var porNome = porNomeDe(ativos);
    var topo = [];
    (topoIds || []).map(String).forEach(function (id) { if (ativos[id] && !lider[id] && topo.indexOf(id) === -1) topo.push(id); });
    var raizes = topo.concat(Object.keys(ativos).filter(function (id) { return !lider[id] && filhos[id] && topo.indexOf(id) === -1; }).sort(porNome));
    var saida = [], visto = {};
    function visitar(id, nivel) {
      if (visto[id]) return;
      visto[id] = true;
      var fs = (filhos[id] || []).slice().sort(porNome);
      saida.push({ c: ativos[id], nivel: nivel, liderId: lider[id] || '', liderados: fs.length, semPosicao: false });
      fs.forEach(function (f) { visitar(f, nivel + 1); });
    }
    raizes.forEach(function (id) { visitar(id, 0); });
    // Ciclo no "lidera" (não deveria existir): entra no fim, sem quebrar.
    Object.keys(filhos).sort(porNome).forEach(function (id) { if (!visto[id]) visitar(id, 0); });
    Object.keys(ativos).filter(function (id) { return !visto[id]; }).sort(porNome).forEach(function (id) {
      visto[id] = true;
      saida.push({ c: ativos[id], nivel: 0, liderId: lider[id] || '', liderados: 0, semPosicao: !lider[id] });
    });
    return saida;
  }

  function parte2Ligada(proc) {
    return !!(proc && proc.config && proc.config.formulario && proc.config.formulario.parte2 === 'ligada');
  }

  // Teste DISC de um colaborador (resultado = resposta mais recente da pessoa, como em listarEquipe).
  function situacaoDisc(c, proc) {
    var res = c && c.resultado && c.resultado.percentuais ? c.resultado : null;
    var exigido = !!(c && c.exigido && c.exigido.percentuais);
    var parte2;
    if (exigido) parte2 = 'feita';
    else if (!proc) parte2 = 'sem_link';
    else if (!parte2Ligada(proc)) parte2 = 'nao_pedida';
    else parte2 = res ? 'refazer' : 'falta';
    return { respondeu: !!res, em: res ? String(c.respondidoEm || '') : '', codigo: res ? String(res.codigo || '') : '', parte2: parte2 };
  }

  function resumoDisc(colaboradores, proc) {
    var ativos = (colaboradores || []).filter(function (c) { return c && c.status !== 'desligado'; });
    var faltam = [], feitas = 0, responderam = 0;
    ativos.forEach(function (c) {
      var s = situacaoDisc(c, proc);
      if (s.respondeu) responderam += 1; else faltam.push(c);
      if (s.parte2 === 'feita') feitas += 1;
    });
    return { total: ativos.length, responderam: responderam, faltam: faltam, parte2Ligada: parte2Ligada(proc), parte2Feitas: feitas };
  }

  function textoResumoDisc(r, proc) {
    if (!r.total) return 'nenhum colaborador cadastrado ainda';
    var n = r.faltam.length;
    var t = r.responderam + ' de ' + r.total + (r.total === 1 ? ' colaborador respondeu' : ' colaboradores responderam') +
      (n ? ' · falta' + (n === 1 ? '' : 'm') + ' ' + n : ' · todos responderam');
    if (!proc) return t + ' · ainda não há link do teste da equipe';
    if (r.parte2Ligada) t += ' · parte 2: ' + r.parte2Feitas + ' de ' + r.total;
    return proc.ativa === false ? t + ' · o link do teste da equipe está desativado' : t;
  }

  // Só os campos agregados da rodada (nada de convites, tokens nem contagem de identificadas).
  function modeloClima(r) {
    r = r || {};
    var modo = MODO_TEXTO[r.modo] ? r.modo : 'anonima';
    var conv = num(r.convidados), resp = num(r.respondentes);
    return {
      id: String(r.id || ''), nome: String(r.nome || 'Pesquisa de clima'), status: r.status === 'aberta' ? 'aberta' : 'encerrada', modo: modo,
      convidados: conv, respondentes: resp, taxa: pct(resp, conv),
      equipes: (r.equipes || []).map(function (e) {
        var c = num(e && e.convidados), n = num(e && e.respondentes);
        return { id: String((e && e.id) || ''), nome: String((e && e.nome) || ''), area: String((e && e.area) || ''), convidados: c, respondentes: n, taxa: pct(n, c) };
      })
    };
  }

  function maisRecente(lista, campo) {
    return (lista || []).slice().sort(function (a, b) { return String((b && b[campo]) || '').localeCompare(String((a && a[campo]) || '')); });
  }
  function rodadaEmFoco(rodadas) {
    var l = maisRecente(rodadas, 'abertaEm');
    return l.filter(function (r) { return r && r.status === 'aberta'; })[0] || l[0] || null;
  }
  function cicloEmFoco(ciclos) {
    var l = maisRecente(ciclos, 'abertoEm');
    return l.filter(function (c) { return c && c.status === 'aberto'; })[0] || l[0] || null;
  }

  function comInstrumento(nome, re, prefixo) { var n = String(nome || '').trim(); return re.test(n) ? n : prefixo + (n ? ' · ' + n : ''); }

  function textoResumoClima(m) {
    if (!m) return '';
    return m.status + ' · ' + m.respondentes + ' de ' + m.convidados + ' responderam (' + m.taxa + '%) · ' + MODO_TEXTO[m.modo];
  }

  function dataCurta(iso, agora) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var d = new Date(iso);
    var dia, mes, ano;
    if (/T/.test(String(iso)) && !isNaN(d.getTime())) { dia = d.getDate(); mes = d.getMonth() + 1; ano = d.getFullYear(); }
    else { dia = +m[3]; mes = +m[2]; ano = +m[1]; }
    var hoje = agora ? new Date(agora) : new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(dia) + '/' + p(mes) + (ano !== hoje.getFullYear() ? '/' + ano : '');
  }

  // Situação de um líder avaliado: só números de grupo e o que já é do ciclo (nunca quem respondeu).
  function situacaoAvaliado(a, aberto) {
    var conv = (a && a.convidados) || {}, resp = (a && a.respondentes) || {};
    var nConv = 0, nResp = 0;
    ANONIMAS_360.forEach(function (f) { nConv += num(conv[f]); nResp += num(resp[f]); });
    var rl = a && a.relatorios && a.relatorios.lider;
    return {
      aberto: !!aberto, respostas: nResp, convidados: nConv, minimo: K_RELATORIO_360,
      liberado: !aberto && !!(a && a.resultado && a.resultado.liberado),
      devolutivaEm: !aberto && a && a.devolutivaEm ? String(a.devolutivaEm) : '',
      publicado: !aberto && !!(rl && rl.status === 'publicado')
    };
  }

  function modeloF360(c) {
    c = c || {};
    var aberto = c.status === 'aberto';
    var avaliados = {}, links = {};
    var respondidos = 0, formularios = 0, comRelatorio = 0, devolutivas = 0;
    (c.avaliados || []).forEach(function (a) {
      if (!a) return;
      var s = situacaoAvaliado(a, aberto);
      if (a.pessoaId) avaliados[String(a.pessoaId)] = s;
      var conv = a.convidados || {}, resp = a.respondentes || {};
      Object.keys(conv).forEach(function (f) { formularios += num(conv[f]); respondidos += num(resp[f]); });
      if (s.liberado) comRelatorio += 1;
      if (s.devolutivaEm) devolutivas += 1;
    });
    // Como avaliador(a): só QUANTOS links a pessoa recebeu, e só com o ciclo aberto.
    if (aberto) (c.convites || []).forEach(function (x) { if (x && x.pessoaId) links[String(x.pessoaId)] = (links[String(x.pessoaId)] || 0) + 1; });
    return { id: String(c.id || ''), nome: String(c.nome || 'Feedback 360'), status: aberto ? 'aberto' : 'encerrado', aberto: aberto,
      encerramentoPrevisto: aberto ? String(c.encerramentoPrevisto || '') : '', respondidos: respondidos, formularios: formularios,
      nAvaliados: (c.avaliados || []).length, comRelatorio: comRelatorio, devolutivas: devolutivas, avaliados: avaliados, links: links };
  }

  function textoResumoF360(m, agora) {
    if (!m) return '';
    if (m.aberto) {
      var prazo = m.encerramentoPrevisto ? ' · encerramento previsto ' + dataCurta(m.encerramentoPrevisto, agora) : '';
      return 'coleta aberta · ' + m.respondidos + ' de ' + m.formularios + ' formulários respondidos' + prazo;
    }
    return 'encerrado · ' + m.comRelatorio + ' de ' + m.nAvaliados + (m.nAvaliados === 1 ? ' líder' : ' líderes') + ' com relatório liberado · ' +
      (m.devolutivas === 1 ? '1 devolutiva feita' : m.devolutivas + ' devolutivas feitas');
  }

  function listaNomes(nomes) {
    var l = (nomes || []).filter(Boolean);
    if (l.length <= 1) return l.join('');
    return l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1];
  }
  function rodapeTempo(minutos) {
    return '\n\nLeva cerca de ' + (num(minutos) || 10) + ' minutos e não existe resposta certa ou errada. Faça com calma, num lugar tranquilo.';
  }

  // Lembrete para o grupo da equipe: o link coletivo e só os nomes de quem ainda não fez o teste DISC (dado identificado).
  function mensagemLembrete(o) {
    o = o || {};
    var emp = String(o.empresa || '').trim();
    var nomes = listaNomes((o.nomes || []).map(nomeCurto));
    return 'Olá, pessoal! Lembrete da avaliação de perfil da equipe' + (emp ? ' da ' + emp : '') + ', conduzida pela Gestão sem Caos. ' +
      (nomes ? 'Ainda falta a resposta de: ' + nomes + (/\.$/.test(nomes) ? ' ' : '. ') : '') + 'Responda pelo link abaixo:\n' + String(o.link || '') + rodapeTempo(o.minutos);
  }

  function mensagemPessoal(o) {
    o = o || {};
    var emp = String(o.empresa || '').trim();
    var p = primeiroNome(o.nome);
    return 'Olá' + (p ? ', ' + p : '') + '! Lembrete: ' + (emp ? 'a ' + emp + ' está' : 'estamos') + ' fazendo uma avaliação de perfil da equipe, ' +
      'conduzida pela Gestão sem Caos, e ainda falta a sua resposta. Responda pelo link abaixo:\n' + String(o.link || '') + rodapeTempo(o.minutos);
  }

  // Estado de uma fonte de dados carregada: null (carregando) | {rodadas|ciclos} | {erro} | {indisponivel}.
  function listaOuNada(x, campo) { return x && Array.isArray(x[campo]) ? x[campo] : null; }

  // O modelo inteiro da tela. A pesquisa de clima entra só por modeloClima (agregados) e o 360 só por modeloF360.
  function montarQuadro(d) {
    d = d || {};
    var ativos = (d.colaboradores || []).filter(function (c) { return c && c.status !== 'desligado'; });
    var nomes = {};
    ativos.forEach(function (c) { nomes[String(c.pessoaId)] = c.nome; });
    var rodadas = listaOuNada(d.clima, 'rodadas');
    var ciclos = listaOuNada(d.f360, 'ciclos');
    var ciclo = ciclos ? cicloEmFoco(ciclos) : null;
    var f = ciclo ? modeloF360(ciclo) : null;
    var linhas = ordemOrganograma(ativos, d.relacoes, d.topoIds).map(function (x) {
      var c = x.c, pid = String(c.pessoaId);
      return {
        pessoaId: pid, nome: String(c.nome || ''), telefone: String(c.telefone || ''), cargo: String(c.cargo || ''), area: String(c.area || ''),
        nivel: Math.min(x.nivel, 3), equipe: x.liderId ? 'Equipe de ' + nomeCurto(nomes[x.liderId]) : (x.semPosicao ? '' : 'Topo'),
        semPosicao: x.semPosicao, liderados: x.liderados, disc: situacaoDisc(c, d.processo),
        f360: f && f.avaliados[pid] ? f.avaliados[pid] : null,
        links360: f && f.aberto ? (f.links[pid] || 0) : null
      };
    });
    var focoClima = rodadas ? rodadaEmFoco(rodadas) : null;
    return {
      disc: resumoDisc(ativos, d.processo),
      linhas: linhas,
      clima: rodadas ? {
        foco: focoClima ? modeloClima(focoClima) : null,
        rodadas: maisRecente(rodadas, 'abertaEm').sort(function (a, b) { return (b.status === 'aberta') - (a.status === 'aberta'); })
          .slice(0, MAX_RODADAS).map(modeloClima),
        outras: Math.max(0, rodadas.length - MAX_RODADAS)
      } : null,
      f360: f
    };
  }

  /* ------------------------------------------------------------------ DOM */

  function carregar(ctx) {
    var id = ctx.emp.id;
    function buscar(metodo, campo) {
      if (!ctx.metodoApi(metodo)) return Promise.resolve({ indisponivel: true });
      return Promise.resolve().then(function () { return ctx.api(metodo, id); }).then(function (r) {
        var o = {}; o[campo] = (r && r[campo]) || []; return o;
      }, function (e) {
        if (e && e.tratado) return null;
        return { erro: (e && e.message) || 'Não foi possível carregar.' };
      });
    }
    cache[id] = { carregando: true };
    Promise.all([buscar('climaListar', 'rodadas'), buscar('f360Listar', 'ciclos')]).then(function (res) {
      if (res[0] === null || res[1] === null) { delete cache[id]; return; }   // sessão expirada: já voltou ao login
      cache[id] = { clima: res[0], f360: res[1] };
      ctx.redesenhar();
    });
  }

  function barra(el, n, d, rotulo) {
    var p = pct(n, d);
    var feito = el('span', { classe: 'and-barra__feito' });
    feito.style.width = p + '%';
    return el('span', { classe: 'and-barra', role: 'img', 'aria-label': rotulo || (n + ' de ' + d + ' (' + p + '%)') }, feito);
  }
  function seloFeito(el, texto) { return el('span', { classe: 'selo selo--verde', texto: '✓ ' + texto }); }
  function seloFalta(el, texto) { return el('span', { classe: 'selo and-selo--falta', texto: texto || 'Falta' }); }
  function nota(el, texto) { return el('span', { classe: 'and-cel__nota t-nota texto-suave', texto: texto }); }

  function bloco(ctx) {
    var el = ctx.el;
    var box = el('div', { classe: 'and-painel', id: 'emp-andamento' });
    var est = cache[ctx.emp.id];
    if (!est) { carregar(ctx); est = cache[ctx.emp.id]; }
    if (est.carregando) {
      box.appendChild(el('section', { classe: 'caixa emp-bloco' }, [
        el('h3', { classe: 'caixa__titulo', texto: 'Andamento da empresa' }),
        el('p', { classe: 'texto-suave t-rotulo', texto: 'Carregando…' })
      ]));
      return box;
    }
    var q = montarQuadro({ colaboradores: ctx.colabs, relacoes: ctx.eq.relacoes, topoIds: ctx.eq.topoIds, processo: ctx.proc, clima: est.clima, f360: est.f360 });
    box.appendChild(blocoResumo(ctx, q, est));
    box.appendChild(blocoPessoas(ctx, q));
    box.appendChild(blocoClima(ctx, q, est));
    box.appendChild(legenda(ctx));
    return box;
  }

  function atualizar(ctx) {
    delete cache[ctx.emp.id];
    ctx.redesenhar();   // "Carregando…" já, enquanto a equipe, o clima e o 360 voltam do servidor
    Promise.resolve().then(function () { return ctx.recarregarEquipe ? ctx.recarregarEquipe() : null; })
      .catch(function () { /* a equipe continua a de antes; o resto recarrega */ })
      .then(function () { ctx.redesenhar(); });
  }

  function blocoResumo(ctx, q, est) {
    var el = ctx.el, botao = ctx.botao;
    var r = q.disc;
    var sec = el('section', { classe: 'caixa emp-bloco and-resumo-caixa', id: 'and-resumo-caixa' }, [
      el('div', { classe: 'and-cab' }, [
        el('div', null, [
          el('h3', { classe: 'caixa__titulo', texto: 'Andamento da empresa' }),
          el('p', { classe: 'form-secao__texto and-cab__texto', texto: 'Quem já fez o quê e o que falta mandar. O teste DISC aparece por pessoa; a pesquisa de clima e quem avalia no Feedback 360, não (veja a legenda no fim da página).' })
        ]),
        botao('botao--claro botao--pequeno', 'Atualizar', function () { atualizar(ctx); }, { id: 'btn-and-atualizar' })
      ])
    ]);
    var lista = el('ul', { classe: 'and-resumo', id: 'and-resumo' });
    sec.appendChild(lista);

    // Teste DISC
    var nomes = r.faltam.map(function (c) { return c.nome; });
    var acoesDisc = ctx.proc && ctx.proc.ativa === false ? [
      botao('botao--contorno botao--pequeno', 'Abrir o processo para ativar o link', function () { ctx.abrirProcesso(); }, { id: 'btn-and-abrir-processo' })
    ] : ctx.proc ? [
      botao('botao--principal botao--pequeno', 'Copiar lembrete para quem falta', function () {
        ctx.copiar(mensagemLembrete({ empresa: nomeEmpresa(ctx), link: ctx.linkTeste, nomes: nomes, minutos: ctx.minutos }), 'Lembrete copiado. Cole no grupo da equipe no WhatsApp.');
      }, { id: 'btn-and-lembrete', disabled: nomes.length ? null : true, title: nomes.length ? null : 'Todos os colaboradores já responderam' }),
      botao('botao--claro botao--pequeno', 'Copiar link do teste', function () { ctx.copiar(ctx.linkTeste, 'Link do teste copiado.'); }, { id: 'btn-and-copiar-link' })
    ] : [
      botao('botao--contorno botao--pequeno', 'Crie o link do teste da equipe', function () { ctx.criarLinkEquipe(); }, { id: 'btn-and-criar-link' })
    ];
    lista.appendChild(itemResumo(el, 'disc', 'Teste DISC' + (ctx.proc && ctx.proc.nome ? ' (' + ctx.proc.nome + ')' : ''), textoResumoDisc(r, ctx.proc),
      r.total && ctx.proc ? barra(el, r.responderam, r.total, r.responderam + ' de ' + r.total + ' responderam') : null, acoesDisc));

    // Pesquisa de clima
    var irClima = botao('botao--claro botao--pequeno', 'Ver pesquisa de clima', function () { ctx.irParaSubaba('clima'); }, { 'data-acao': 'and-ir-clima' });
    if (est.clima && est.clima.indisponivel) lista.appendChild(itemResumo(el, 'clima', 'Pesquisa de clima', 'indisponível neste painel', null, []));
    else if (est.clima && est.clima.erro) lista.appendChild(itemResumo(el, 'clima', 'Pesquisa de clima', est.clima.erro, null, [irClima]));
    else if (!q.clima || !q.clima.foco) lista.appendChild(itemResumo(el, 'clima', 'Pesquisa de clima', 'nenhuma pesquisa nesta empresa ainda', null, [irClima]));
    else {
      var m = q.clima.foco;
      lista.appendChild(itemResumo(el, 'clima', comInstrumento(m.nome, /clima/i, 'Pesquisa de clima'), textoResumoClima(m),
        barra(el, m.respondentes, m.convidados, m.respondentes + ' de ' + m.convidados + ' responderam'), [irClima]));
    }

    // Feedback 360
    var ir360 = botao('botao--claro botao--pequeno', 'Ver Feedback 360', function () { ctx.irParaSubaba('feedback360'); }, { 'data-acao': 'and-ir-f360' });
    if (est.f360 && est.f360.indisponivel) lista.appendChild(itemResumo(el, 'f360', 'Feedback 360', 'indisponível neste painel', null, []));
    else if (est.f360 && est.f360.erro) lista.appendChild(itemResumo(el, 'f360', 'Feedback 360', est.f360.erro, null, [ir360]));
    else if (!q.f360) lista.appendChild(itemResumo(el, 'f360', 'Feedback 360', 'nenhum ciclo nesta empresa ainda', null, [ir360]));
    else {
      var f = q.f360;
      lista.appendChild(itemResumo(el, 'f360', comInstrumento(f.nome, /360/, 'Feedback 360'), textoResumoF360(f),
        f.aberto ? barra(el, f.respondidos, f.formularios, f.respondidos + ' de ' + f.formularios + ' formulários respondidos')
          : barra(el, f.comRelatorio, f.nAvaliados, f.comRelatorio + ' de ' + f.nAvaliados + ' com relatório'), [ir360]));
    }
    return sec;
  }
  function nomeEmpresa(ctx) { return ctx.emp ? String(ctx.emp.nome || '') : ''; }
  // Link do teste da equipe que dá para mandar (existe e está ativo): sem ele, nada de WhatsApp nem lembrete.
  function linkAtivo(ctx) { return !!(ctx.proc && ctx.proc.ativa !== false && ctx.linkTeste); }

  function itemResumo(el, id, rotulo, texto, barraNo, acoes) {
    return el('li', { classe: 'and-resumo__item' + (barraNo ? '' : ' and-resumo__item--sem-barra'), 'data-instrumento': id }, [
      el('p', { classe: 'and-resumo__texto' }, [el('strong', { classe: 'seminegrito', texto: rotulo + ': ' }), el('span', { classe: 'and-resumo__situacao', texto: texto })]),
      barraNo ? el('span', { classe: 'and-resumo__barra' }, barraNo) : null,
      el('div', { classe: 'and-resumo__acoes' }, acoes)
    ]);
  }

  function blocoPessoas(ctx, q) {
    var el = ctx.el, botao = ctx.botao;
    var f = q.f360;
    var comLinks = !!(f && f.aberto);
    var sec = el('section', { classe: 'caixa emp-bloco and-pessoas', id: 'and-pessoas' }, [
      el('h3', { classe: 'caixa__titulo', texto: 'Por pessoa (' + q.linhas.length + ')' }),
      el('p', { classe: 'texto-suave t-rotulo', texto: 'Na ordem do organograma: quem está no topo e, abaixo de cada líder, a equipe dele em ordem alfabética. Quem ainda não tem posição no organograma vem no fim.' })
    ]);
    if (!q.linhas.length) {
      sec.appendChild(el('div', { classe: 'vazio and-vazio', id: 'and-sem-colaboradores' }, [
        el('p', { classe: 'vazio__texto', texto: 'Nenhum colaborador ainda. Adicione na aba Colaboradores ou envie o link do teste da equipe.' }),
        el('div', { classe: 'gestao-card__acoes and-vazio__acoes' }, botao('botao--claro botao--pequeno', 'Ir para Colaboradores', function () { ctx.irParaSubaba('colaboradores'); }))
      ]));
      return sec;
    }
    var cab = ['Pessoa', 'Cargo', 'Equipe', 'Teste DISC', 'Parte 2', 'Feedback 360 como avaliado(a)'];
    if (comLinks) cab.push('Links do 360 que recebe');
    var tabela = el('table', { classe: 'and-tabela', id: 'and-tabela' }, [
      el('thead', null, el('tr', null, cab.map(function (t, i) {
        return el('th', { scope: 'col', 'data-col': ['pessoa', 'cargo', 'equipe', 'disc', 'parte2', 'f360', 'links360'][i], texto: t });
      }))),
      el('tbody', null, q.linhas.map(function (l) { return linhaPessoa(ctx, l, f, comLinks); }))
    ]);
    sec.appendChild(el('div', { classe: 'and-rolagem' }, tabela));
    if (comLinks) sec.appendChild(el('p', { classe: 'texto-suave t-nota and-nota-links', texto: 'Links do 360: quantos formulários a pessoa recebeu para responder neste ciclo (inclui a autoavaliação de quem é avaliado). O painel não mostra se ela respondeu.' }));
    return sec;
  }

  function linhaPessoa(ctx, l, f, comLinks) {
    var el = ctx.el, botao = ctx.botao;
    var s = l.disc;
    // Teste DISC
    var celDisc;
    if (s.respondeu) {
      celDisc = [seloFeito(el, 'Respondeu'), s.em ? el('span', { classe: 'and-cel__data t-nota texto-suave tabular', texto: 'em ' + dataCurta(s.em) }) : null];
    } else {
      var msg = mensagemPessoal({ empresa: nomeEmpresa(ctx), nome: l.nome, link: ctx.linkTeste, minutos: ctx.minutos });
      celDisc = [seloFalta(el), linkAtivo(ctx) ? el('span', { classe: 'and-acoes' }, [
        el('a', { classe: 'botao botao--claro botao--pequeno', href: ctx.linkWhatsAppPara(l.telefone, msg), target: '_blank', rel: 'noopener', 'data-acao': 'and-whatsapp', texto: 'WhatsApp' }),
        botao('botao--claro botao--pequeno', 'Copiar link', function () { ctx.copiar(ctx.linkTeste, 'Link do teste copiado. Envie para ' + primeiroNome(l.nome) + '.'); }, { 'data-acao': 'and-copiar-link' })
      ]) : null];
    }
    // Parte 2
    var celP2;
    if (s.parte2 === 'feita') celP2 = [seloFeito(el, 'Respondeu')];
    else if (s.parte2 === 'falta') celP2 = [seloFalta(el), nota(el, 'vem junto com o teste')];
    else if (s.parte2 === 'refazer') celP2 = [seloFalta(el), nota(el, 'responder o link de novo')];
    else if (s.parte2 === 'nao_pedida') celP2 = [el('span', { classe: 'texto-suave', texto: 'Não pedida no link' })];
    else celP2 = [el('span', { classe: 'texto-suave', texto: '—' })];
    // Feedback 360 como avaliado(a): só agregados
    var celF;
    var a = l.f360;
    if (!a) celF = [el('span', { classe: 'texto-suave', texto: '—' })];
    else if (a.aberto) {
      var faltam = Math.max(0, a.minimo - a.respostas);
      celF = [el('span', { classe: 'selo', texto: 'Coleta aberta' }),
        nota(el, 'Colegas, equipe e outros: ' + a.respostas + ' de ' + a.convidados),
        faltam ? nota(el, (faltam === 1 ? 'falta 1 resposta' : 'faltam ' + faltam + ' respostas') + ' para ter relatório') : null];
    } else {
      celF = [el('span', { classe: 'selo ' + (a.liberado ? 'selo--noite' : ''), texto: a.liberado ? 'Relatório liberado' : 'Sem relatório' }),
        nota(el, a.liberado ? (a.devolutivaEm ? 'Devolutiva em ' + dataCurta(a.devolutivaEm) : 'Devolutiva pendente') + (a.publicado ? ' · relatório do líder publicado' : '')
          : 'Menos de ' + a.minimo + ' respostas de colegas, equipe e outros')];
    }
    var tds = [
      el('th', { scope: 'row', classe: 'and-pessoa and-nivel-' + l.nivel, 'data-col': 'pessoa' }, el('span', { classe: 'and-pessoa__nome', texto: l.nome })),
      el('td', { 'data-col': 'cargo' }, [el('span', { texto: l.cargo || '—' }), l.area ? nota(el, l.area) : null]),
      el('td', { 'data-col': 'equipe' }, [
        el('span', { classe: l.semPosicao ? 'texto-suave' : 'and-equipe__nome', texto: l.semPosicao ? 'Sem posição no organograma' : l.equipe }),
        l.liderados ? nota(el, 'lidera ' + l.liderados) : null
      ]),
      el('td', { 'data-col': 'disc', classe: 'and-cel' }, celDisc),
      el('td', { 'data-col': 'parte2', classe: 'and-cel' }, celP2),
      el('td', { 'data-col': 'f360', classe: 'and-cel' }, celF)
    ];
    if (comLinks) {
      var n = l.links360 || 0;
      tds.push(el('td', { 'data-col': 'links360', classe: 'tabular' }, n ? [el('span', { texto: n + (n === 1 ? ' link' : ' links') }), nota(el, 'confidencial')]
        : el('span', { classe: 'texto-suave', texto: '—' })));
    }
    return el('tr', { 'data-pessoa': l.pessoaId, 'data-disc': s.respondeu ? 'respondeu' : 'falta', 'data-parte2': s.parte2 }, tds);
  }

  function blocoClima(ctx, q, est) {
    var el = ctx.el, botao = ctx.botao;
    var sec = el('section', { classe: 'caixa emp-bloco and-clima', id: 'and-clima' }, [
      el('h3', { classe: 'caixa__titulo', texto: 'Pesquisa de clima por equipe' }),
      el('p', { classe: 'texto-suave t-rotulo', texto: 'Só quantas pessoas responderam em cada equipe. O painel não mostra quem respondeu.' })
    ]);
    var irClima = function () { return botao('botao--claro botao--pequeno', 'Ir para a Pesquisa de clima', function () { ctx.irParaSubaba('clima'); }, { 'data-acao': 'and-ir-clima' }); };
    if (est.clima && est.clima.indisponivel) { sec.appendChild(el('p', { classe: 'texto-suave t-rotulo', texto: 'Pesquisa de clima indisponível neste painel.' })); return sec; }
    if (est.clima && est.clima.erro) { sec.appendChild(el('p', { classe: 'aviso aviso--erro', texto: est.clima.erro })); return sec; }
    if (!q.clima || !q.clima.rodadas.length) {
      sec.appendChild(el('div', { classe: 'and-vazio-linha', id: 'and-clima-vazio' }, [
        el('p', { classe: 'texto-suave t-rotulo', texto: 'Nenhuma pesquisa de clima nesta empresa ainda.' }), irClima()]));
      return sec;
    }
    q.clima.rodadas.forEach(function (m) {
      var aberta = m.status === 'aberta';
      var art = el('article', { classe: 'and-clima-rodada', 'data-rodada': m.id, 'data-status': m.status, 'data-modo': m.modo }, [
        el('div', { classe: 'and-clima-rodada__cab' }, [
          el('p', { classe: 'seminegrito and-clima-rodada__nome', texto: m.nome }),
          el('span', { classe: 'and-clima-rodada__selos' }, [
            el('span', { classe: 'selo and-selo-modo', 'data-modo': m.modo, texto: MODO_SELO[m.modo] }),
            el('span', { classe: 'selo ' + (aberta ? 'selo--laranja' : 'selo--noite'), texto: aberta ? 'Aberta' : 'Encerrada' })
          ])
        ]),
        el('p', { classe: 't-rotulo tabular and-clima-total', texto: m.respondentes + ' de ' + m.convidados + ' convidados responderam (' + m.taxa + '%)' }),
        el('ul', { classe: 'and-clima-equipes' }, m.equipes.map(function (e) {
          return el('li', { classe: 'and-clima-equipe', 'data-equipe': e.id }, [
            el('span', { classe: 'seminegrito', texto: e.nome }),
            el('span', { classe: 'texto-suave t-rotulo', texto: e.area || '' }),
            el('span', { classe: 't-rotulo tabular and-clima-equipe__n', texto: e.respondentes + ' de ' + e.convidados }),
            barra(el, e.respondentes, e.convidados)
          ]);
        })),
        m.modo === 'anonima'
          ? el('p', { classe: 'and-clima-nota t-nota', texto: 'Anônima: o painel não mostra quem respondeu, só a contagem por equipe.' })
          : el('div', { classe: 'and-clima-nota and-clima-nota--interno' }, [
            el('p', { classe: 't-nota', texto: MODO_SELO[m.modo] + ': este quadro não mostra quem respondeu. Os nomes de quem se identificou ficam só na tela "Identificação (uso interno)" da subaba Pesquisa de clima, e cada abertura dela fica registrada.' }),
            irClima()
          ])
      ]);
      sec.appendChild(art);
    });
    if (q.clima.outras) sec.appendChild(el('p', { classe: 'texto-suave t-nota', texto: (q.clima.outras === 1 ? 'Mais 1 pesquisa anterior' : 'Mais ' + q.clima.outras + ' pesquisas anteriores') + ' na subaba Pesquisa de clima.' }));
    return sec;
  }

  function legenda(ctx) {
    var el = ctx.el;
    return el('aside', { classe: 'and-legenda', id: 'and-legenda', 'aria-label': 'Por que a pesquisa de clima e o Feedback 360 não aparecem por pessoa' }, [
      el('p', { classe: 'seminegrito and-legenda__titulo', texto: 'Por que a pesquisa de clima e quem avalia no Feedback 360 não aparecem por pessoa' }),
      el('ul', { classe: 'and-legenda__lista' }, [
        el('li', null, [el('strong', { texto: 'Pesquisa de clima: ' }), 'prometemos a quem responde que ninguém vê a resposta de uma pessoa. O painel recebe só quantas pessoas responderam em cada equipe. Nos modos com identificação, os nomes ficam só na tela "Identificação (uso interno)", com registro de cada acesso.']),
        el('li', null, [el('strong', { texto: 'Feedback 360: ' }), 'quem avalia um líder responde de forma confidencial. Aqui aparece só quantos links cada pessoa recebeu, enquanto a coleta está aberta, nunca se respondeu. Do líder avaliado, só números de grupo; chefia e autoavaliação (uma pessoa cada) ficam só na subaba Feedback 360.']),
        el('li', null, [el('strong', { texto: 'Teste DISC: ' }), 'é identificado (antes de começar, a pessoa é avisada de que o resultado é compartilhado com a empresa), por isso aparece por pessoa.'])
      ])
    ]);
  }

  function esquecer(empresaId) { if (empresaId) delete cache[empresaId]; else cache = {}; }

  var DISC_ADMIN_ANDAMENTO = {
    nomeCurto: nomeCurto, ordemOrganograma: ordemOrganograma, parte2Ligada: parte2Ligada, situacaoDisc: situacaoDisc, resumoDisc: resumoDisc,
    textoResumoDisc: textoResumoDisc, modeloClima: modeloClima, rodadaEmFoco: rodadaEmFoco, cicloEmFoco: cicloEmFoco, textoResumoClima: textoResumoClima,
    modeloF360: modeloF360, textoResumoF360: textoResumoF360, dataCurta: dataCurta, mensagemLembrete: mensagemLembrete, mensagemPessoal: mensagemPessoal,
    montarQuadro: montarQuadro, bloco: bloco, esquecer: esquecer
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_ADMIN_ANDAMENTO;
  else root.DISC_ADMIN_ANDAMENTO = DISC_ADMIN_ANDAMENTO;
})(typeof self !== 'undefined' ? self : this);
