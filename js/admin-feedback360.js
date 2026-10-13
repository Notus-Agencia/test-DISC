/*
 * Painel (computador): subaba "Feedback 360" da página da empresa. UMD: window.DISC_ADMIN_F360 / module.exports.
 *
 * Confidencial, não anônimo: cada pessoa recebe um link individual (para evitar respostas repetidas). O painel nunca mostra
 * quem respondeu: enquanto o ciclo está aberto, só as contagens por fonte de cada pessoa avaliada; a ligação link-resposta
 * é apagada no encerramento (public.f360_encerrar). Depois do encerramento, o consultor vê o resultado já calculado pelo
 * banco (com 1 casa, por grupo), modera os comentários, registra a devolutiva e o plano e publica os relatórios
 * (líder: 11 capítulos; chefia: só o plano). Nada aparece para o líder antes da devolutiva.
 *
 * Funções puras (testes em tests/admin-feedback360.test.js):
 *   linkF360(href, token) -> URL absoluta de feedback360.html?t=<token>
 *   linkRelatorio(href, token) -> URL de relatorio.html?r=<token>
 *   mensagemConvite({empresa, avaliado, pessoa, fonte, link, fim}) -> texto para WhatsApp (por fonte: auto, chefia, demais)
 *   contagens(avaliado) -> [{fonte, nome, respondentes, convidados}] (só fontes com convidados)
 *   avisosAberto(ciclo) -> [texto] (pessoa avaliada sem relatório se encerrar agora, grupos que vão se juntar)
 *   situacao(avaliado) -> {liberado, texto} (resumo do resultado congelado)
 *   desenhoInicial(colaboradores, relacoes, topoIds) -> DISC_F360.sugerirDesenho (+ candidatos a "outros": colaboradores ativos)
 *   datasSugeridas(baseIso) -> {conversaEquipe, conversaChefia, checkin, retornos, pulso, reaplicacao} (AAAA-MM-DD)
 *   planoDoFormulario(campos) -> objeto de plano (ou null sem comportamento escolhido) para DISC_F360.validarPlano
 *   snapshotPrevia(ciclo, avaliado, empresa, comentarios, consultor, codigoDisc) -> o MESMO formato de public.f360_gerar_relatorio
 *     (visão do líder), para a prévia em nova aba sem publicar nada
 *   podeConsolidar(ciclo) -> bool (5 ou mais líderes com relatório liberado e devolutiva feita)
 * DOM: bloco(ctx) -> <section id="emp-f360">. ctx = { el, botao, api, avisar, falhou, confirmar, abrirJanela, copiar,
 *   formatarData, linkWhatsApp(texto), abrirPrevia(dados), href, consultor, emp, eq, colabs, redesenhar() }.
 */
(function (root) {
  'use strict';

  var cache = {};   // empresaId -> {ciclos, erro}

  function FX() { return root.DISC_F360 || (typeof require === 'function' ? require('./feedback360.js') : null); }

  /* ------------------------------------------------------------------ funções puras */

  function base(href) { return String(href || '').split('#')[0].split('?')[0].replace(/[^/]*$/, ''); }
  function linkF360(href, token) { return base(href) + 'feedback360.html?t=' + encodeURIComponent(String(token || '')); }
  function linkRelatorio(href, token) { return base(href) + 'relatorio.html?r=' + encodeURIComponent(String(token || '')); }

  function dataBr(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? m[3] + '/' + m[2] : ''; }

  // Mensagem do convite (WhatsApp). Chefia: sabe que a resposta aparece identificada. Demais: confidencial, só grupo.
  function mensagemConvite(o) {
    o = o || {};
    var F = FX();
    var emp = String(o.empresa || '').trim();
    var av = String(o.avaliado || '').trim() || 'a pessoa avaliada';
    var quem = String(o.pessoa || '').trim();
    var oi = 'Olá' + (quem ? ', ' + quem.split(' ')[0] : '') + '! ';
    var prazo = o.fim ? ' Dá para responder até ' + dataBr(o.fim) + '.' : '';
    var tempo = ' Leva de ' + F.MINUTOS + ' minutos.';
    var t;
    if (o.fonte === 'auto') {
      t = oi + 'Este é o seu link de autoavaliação no Feedback 360 da Liderança' + (emp ? ' da ' + emp : '') + ', conduzido pela Gestão sem Caos. ' +
        'A sua resposta aparece ao lado da visão das outras pessoas e nunca entra em média nenhuma.' + tempo + prazo + ' Este link é só seu:\n' + o.link;
    } else if (o.fonte === 'chefia') {
      t = oi + 'Você recebeu um convite para responder, como chefia, ao Feedback 360 da Liderança de ' + av + (emp ? ' (' + emp + ')' : '') +
        ', conduzido pela Gestão sem Caos. Atenção: a resposta da chefia aparece identificada no relatório de ' + av + '.' + tempo + prazo + ' Este link é só seu:\n' + o.link;
    } else {
      t = oi + (emp ? 'A ' + emp + ' está' : 'Estamos') + ' fazendo o Feedback 360 da Liderança, conduzido pela Gestão sem Caos. ' +
        'Você recebeu um convite para dizer com que frequência vê alguns comportamentos de liderança de ' + av + '. ' +
        'É voluntário e confidencial: ' + av + ' vê só resultados de grupo, com pelo menos 3 respostas, depois do encerramento.' + tempo + prazo +
        ' Este link é só seu (não repasse):\n' + o.link;
    }
    return String(t).replace(/([^.])\.\.(?!\.)/g, '$1.');
  }

  function contagens(a) {
    var F = FX();
    var conv = (a && a.convidados) || {}, resp = (a && a.respondentes) || {};
    return F.FONTES.filter(function (f) { return (conv[f] || 0) > 0; }).map(function (f) {
      return { fonte: f, nome: F.NOME_FONTE[f], respondentes: resp[f] || 0, convidados: conv[f] || 0 };
    });
  }

  // Enquanto está aberto: o que aconteceria se encerrasse agora (só contagens agregadas).
  function avisosAberto(ciclo) {
    var F = FX();
    var out = [];
    if (!ciclo || ciclo.status !== 'aberto') return out;
    (ciclo.avaliados || []).forEach(function (a) {
      var r = a.respondentes || {};
      var anon = (r.colegas || 0) + (r.equipe || 0) + (r.outros || 0);
      if (anon < F.K_TEMA) {
        out.push(a.nome + ': ' + anon + ' resposta' + (anon === 1 ? '' : 's') + ' de colegas, equipe e outros. Com menos de 3, não há relatório (nem juntando grupos).');
        return;
      }
      var pequenos = ['colegas', 'equipe'].filter(function (f) { var n = (r[f] || 0) + (f === 'colegas' && (r.outros || 0) < F.K_TEMA ? (r.outros || 0) : 0); return n > 0 && n < F.K_TEMA; });
      if (pequenos.length) out.push(a.nome + ': ' + pequenos.map(function (f) { return F.NOME_FONTE[f].toLowerCase(); }).join(' e ') + ' com 1 ou 2 respostas. Se encerrar assim, os grupos se juntam no relatório.');
    });
    return out;
  }

  function situacao(a) {
    var res = a && a.resultado;
    if (!res) return { liberado: false, texto: 'Resultado ainda não calculado.' };
    if (!res.liberado) return { liberado: false, texto: 'Sem relatório: menos de 3 respostas de colegas, equipe e outros convidados, mesmo juntando grupos. Ofereça a conversa estruturada (sem dados de terceiros).' };
    var gs = (res.grupos || []).map(function (g) { return g.nome + ' (' + g.n + ')'; });
    return { liberado: true, texto: 'Aparece no relatório: ' + gs.join(', ') + (res.chefia ? '; chefia à parte (' + res.chefia.n + ')' : '') + '.' };
  }

  // Sugestão do organograma + candidatos a "outros" (qualquer colaborador ativo fora das listas obrigatórias da pessoa).
  function desenhoInicial(colaboradores, relacoes, topoIds) {
    var F = FX();
    var s = F.sugerirDesenho(colaboradores, relacoes, topoIds);
    var ativos = (colaboradores || []).filter(function (c) { return c && c.status !== 'desligado' && c.pessoaId; })
      .slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
    s.avaliados.forEach(function (a) {
      var fora = {}; fora[a.pessoaId] = true;
      a.chefia.concat(a.equipe, a.candidatosColegas).forEach(function (p) { fora[p] = true; });
      var extra = ativos.map(function (c) { return String(c.pessoaId); }).filter(function (p) { return !fora[p] && a.candidatosOutros.indexOf(p) < 0; });
      a.candidatosOutros = a.candidatosOutros.concat(extra);
    });
    return s;
  }

  function somarDias(iso, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  // Datas do acompanhamento a partir da devolutiva (decisao.md 4.6): meio de cada janela.
  function datasSugeridas(baseIso) {
    return { conversaEquipe: somarDias(baseIso, 21), conversaChefia: somarDias(baseIso, 21), checkin: somarDias(baseIso, 45),
      retornos: somarDias(baseIso, 75), pulso: somarDias(baseIso, 105), reaplicacao: somarDias(baseIso, 365) };
  }

  // campos: {comportamentos:[{item, acao}], acoes:[{texto, prazo}], contar, apoio, indicador, datas, andamento}
  function planoDoFormulario(c) {
    c = c || {};
    var comp = (c.comportamentos || []).filter(function (x) { return x && x.item; });
    if (!comp.length) return null;
    return { comportamentos: comp.map(function (x) { return { item: x.item, acao: String(x.acao || '').trim() }; }),
      acoes: (c.acoes || []).filter(function (a) { return a && String(a.texto || '').trim(); }).map(function (a) { return { texto: String(a.texto).trim(), prazo: a.prazo || '' }; }),
      contar: String(c.contar || '').trim(), apoio: String(c.apoio || '').trim(), indicador: String(c.indicador || '').trim(),
      datas: c.datas || {}, andamento: String(c.andamento || '').trim() };
  }

  // O mesmo snapshot de public.f360_gerar_relatorio (visão do líder), sem os guias "Como liderar".
  function snapshotPrevia(ciclo, a, empresa, comentarios, consultor, codigoDisc) {
    var F = FX();
    var c = ciclo || {};
    var lib = (comentarios || []).filter(function (x) { return x && x.elegivel && (x.status === 'mantido' || x.status === 'editado'); });
    function txt(x) { return { pergunta: x.pergunta, texto: x.status === 'editado' ? x.textoModerado : (x.textoModerado || x.texto) }; }
    return {
      modelo: 'feedback360', visao: 'lider', versao: 1, titulo: 'Feedback 360 da Liderança · ' + a.nome, geradoEm: new Date().toISOString(),
      empresa: { nome: String((empresa && empresa.nome) || '') }, consultor: String(consultor || ''),
      ciclo: { nome: c.nome || '', abertoEm: c.abertoEm || '', encerradoEm: c.encerradoEm || '', versaoItens: c.versaoItens || 'v0' },
      avaliado: { nome: a.nome, topo: !!a.topo }, devolutivaEm: a.devolutivaEm || '', resultado: F.visaoLider(a.resultado || {}),
      temas: (a.temas || []).slice(),
      comentarios: lib.filter(function (x) { return !x.chefia; }).map(txt),
      comentariosChefia: lib.filter(function (x) { return x.chefia; }).map(txt),
      foco: a.foco || '', observacao: a.observacao || '', plano: a.plano || null,
      disc: a.discAceito && /^[DISC]{1,2}$/.test(String(codigoDisc || '')) ? { codigo: codigoDisc } : null, guias: []
    };
  }

  function podeConsolidar(ciclo) {
    var F = FX();
    return !!ciclo && ciclo.status === 'encerrado' &&
      (ciclo.avaliados || []).filter(function (a) { return a.resultado && a.resultado.liberado && a.devolutivaEm; }).length >= F.K_CONSOLIDADO;
  }

  /* ------------------------------------------------------------------ DOM */

  function bloco(ctx) {
    var el = ctx.el, botao = ctx.botao;
    var emp = ctx.emp;
    var est = cache[emp.id];
    var sec = el('section', { classe: 'caixa emp-bloco f360p', id: 'emp-f360' }, [
      el('h3', { classe: 'caixa__titulo', texto: 'Feedback 360 da Liderança' }),
      el('p', { classe: 'form-secao__texto', texto: 'Quem lidera alguém no organograma recebe a visão da chefia, da equipe, de colegas e de outros convidados, ao lado da própria autoavaliação. ' +
        'É confidencial (não anônimo): cada pessoa tem um link individual, a ligação entre link e resposta é apagada no encerramento e o líder vê só resultados de grupo (3 ou mais), depois da devolutiva. ' +
        'Uso só para desenvolvimento: nunca para promoção, salário, bônus ou desligamento.' })
    ]);
    if (!est) {
      sec.appendChild(el('p', { classe: 'texto-suave t-rotulo', texto: 'Carregando…' }));
      carregar(ctx);
      return sec;
    }
    if (est.erro) {
      sec.appendChild(el('p', { classe: 'aviso aviso--erro', texto: est.erro }));
      sec.appendChild(el('div', { classe: 'gestao-card__acoes' }, botao('botao--claro botao--pequeno', 'Tentar de novo', function () { delete cache[emp.id]; ctx.redesenhar(); })));
      return sec;
    }
    var aberto = est.ciclos.filter(function (c) { return c.status === 'aberto'; })[0];
    var sug = desenhoInicial(ctx.colabs, ctx.eq.relacoes, ctx.eq.topoIds);
    sec.appendChild(el('div', { classe: 'gestao-card__acoes' }, [
      aberto ? null : botao('botao--principal', 'Novo Feedback 360', function () { janelaNovo(ctx); },
        { id: 'btn-f360-novo', disabled: sug.avaliados.length ? null : true, title: sug.avaliados.length ? null : 'Monte o organograma (quem lidera quem) primeiro' }),
      botao('botao--claro', 'Atualizar', function () { delete cache[emp.id]; ctx.redesenhar(); }, { id: 'btn-f360-atualizar' })
    ]));
    if (!sug.avaliados.length && !aberto) sec.appendChild(el('p', { classe: 'texto-suave t-rotulo', texto: 'Para criar um ciclo, marque no Organograma quem lidera quem: quem lidera alguém pode ser avaliado.' }));
    if (!est.ciclos.length) sec.appendChild(el('p', { classe: 'texto-suave t-rotulo', id: 'f360-vazio', texto: 'Nenhum Feedback 360 nesta empresa ainda.' }));
    est.ciclos.forEach(function (c) { sec.appendChild(c.status === 'aberto' ? cartaoAberto(ctx, c) : cartaoEncerrado(ctx, c)); });
    return sec;
  }

  function carregar(ctx) {
    var id = ctx.emp.id;
    ctx.api('f360Listar', id).then(function (resp) {
      cache[id] = { ciclos: resp.ciclos || [] };
    }, function (e) {
      if (e && e.tratado) return;
      cache[id] = { ciclos: [], erro: (e && e.message) || 'Não foi possível carregar o Feedback 360.' };
    }).then(function () { ctx.redesenhar(); });
  }
  function recarregar(ctx, msg) {
    delete cache[ctx.emp.id];
    if (msg) ctx.avisar(msg, 'ok');
    ctx.redesenhar();
  }

  function cabecalhoCiclo(ctx, c) {
    var el = ctx.el;
    var aberto = c.status === 'aberto';
    return el('div', { classe: 'f360p-ciclo__cab' }, [
      el('div', null, [
        el('p', { classe: 'f360p-ciclo__nome seminegrito', texto: c.nome }),
        el('p', { classe: 'texto-suave t-rotulo tabular', texto: 'Aberto em ' + ctx.formatarData(c.abertoEm) +
          (aberto ? ' · encerramento previsto ' + dataBr(c.encerramentoPrevisto) : ' · encerrado em ' + ctx.formatarData(c.encerradoEm)) +
          ' · avisos de relato: ' + (c.contatoRelatos || '—') })
      ]),
      el('span', { classe: 'selo ' + (aberto ? 'selo--laranja' : 'selo--noite'), texto: aberto ? 'Aberto' : 'Encerrado' })
    ]);
  }

  function linhaContagens(el, a) {
    return el('ul', { classe: 'f360p-contagens' }, contagens(a).map(function (x) {
      return el('li', { classe: 'tabular', 'data-fonte': x.fonte }, [el('span', { classe: 'texto-suave', texto: x.nome + ' ' }), el('strong', { texto: x.respondentes + ' de ' + x.convidados })]);
    }));
  }

  function cartaoAberto(ctx, c) {
    var el = ctx.el, botao = ctx.botao;
    var F = FX();
    var card = el('article', { classe: 'f360p-ciclo', 'data-ciclo': c.id, 'data-status': 'aberto' }, [cabecalhoCiclo(ctx, c)]);
    var tot = 0, conv = 0;
    c.avaliados.forEach(function (a) { contagens(a).forEach(function (x) { tot += x.respondentes; conv += x.convidados; }); });
    card.appendChild(el('p', { classe: 'f360p-total tabular', id: 'f360-total', texto: tot + ' de ' + conv + ' formulários respondidos' }));
    card.appendChild(el('p', { classe: 'texto-suave t-nota', texto: 'Só a contagem por fonte: ninguém (nem a Gestão sem Caos) vê quem respondeu. Nada do resultado aparece antes do encerramento.' }));
    var porAv = {};
    (c.convites || []).forEach(function (x) { (porAv[x.avaliadoId] = porAv[x.avaliadoId] || []).push(x); });
    card.appendChild(el('ul', { classe: 'f360p-avaliados' }, c.avaliados.map(function (a) {
      var convs = porAv[a.id] || [];
      return el('li', { classe: 'f360p-avaliado', 'data-avaliado': a.id }, [
        el('div', { classe: 'f360p-avaliado__topo' }, [el('span', { classe: 'seminegrito', texto: a.nome }), a.topo ? el('span', { classe: 'selo', texto: 'Topo (sem chefia)' }) : null]),
        linhaContagens(el, a),
        el('details', { classe: 'f360p-links' }, [
          el('summary', { classe: 't-rotulo', texto: 'Links individuais (' + convs.length + ')' }),
          el('table', { classe: 'f360p-tabela' }, [
            el('thead', null, el('tr', null, ['Pessoa', 'Responde como', 'Link', ''].map(function (t) { return el('th', { scope: 'col', texto: t }); }))),
            el('tbody', null, convs.map(function (x) {
              var link = linkF360(ctx.href, x.token);
              var msg = mensagemConvite({ empresa: ctx.emp.nome, avaliado: a.nome, pessoa: x.nome, fonte: x.fonte, link: link, fim: c.encerramentoPrevisto });
              return el('tr', { 'data-fonte': x.fonte }, [
                el('td', { texto: x.nome || '—' }),
                el('td', { texto: x.fonte === 'auto' ? 'Autoavaliação' : F.NOME_FONTE[x.fonte] }),
                el('td', null, el('code', { classe: 'av-link f360p-link', 'data-link': x.fonte, texto: link })),
                el('td', { classe: 'f360p-tabela__acoes' }, [
                  botao('botao--claro botao--pequeno', 'Copiar', function () { ctx.copiar(link, 'Link copiado.'); }, { 'data-acao': 'f360-copiar-link' }),
                  el('a', { classe: 'botao botao--claro botao--pequeno', href: ctx.linkWhatsApp(msg), target: '_blank', rel: 'noopener', 'data-acao': 'f360-whatsapp', texto: 'WhatsApp' })
                ])
              ]);
            }))
          ])
        ])
      ]);
    })));
    var avisos = avisosAberto(c);
    if (avisos.length) card.appendChild(el('ul', { classe: 'f360p-avisos' }, avisos.map(function (t) { return el('li', { classe: 't-rotulo', texto: t }); })));
    card.appendChild(el('div', { classe: 'gestao-card__acoes' }, [
      botao('botao--laranja', 'Encerrar coleta', function () {
        ctx.confirmar({ titulo: 'Encerrar a coleta?', texto: 'Ninguém mais consegue responder. O resultado é calculado agora, já com as regras de grupo mínimo, e a ligação entre cada link e a resposta é apagada' +
          (c.manterLista ? '.' : ', junto com a lista de quem foi convidado.') + ' Não dá para desfazer.',
          botao: 'Encerrar coleta', classeBotao: 'botao--principal', botaoVoltar: 'Continuar aberto' }).then(function (ok) {
          if (!ok) return;
          ctx.api('f360Encerrar', c.id).then(function () { recarregar(ctx, 'Coleta encerrada. Modere os comentários e marque a devolutiva antes de publicar.'); }).catch(ctx.falhou);
        });
      }, { 'data-acao': 'f360-encerrar' }),
      botao('botao--perigo botao--pequeno', 'Excluir ciclo', function () { excluir(ctx, c); }, { 'data-acao': 'f360-excluir' })
    ]));
    return card;
  }

  function excluir(ctx, c) {
    ctx.confirmar({ titulo: 'Excluir o ciclo?', texto: 'Apaga o ciclo, as respostas, os comentários e os relatórios dele. Os links deixam de funcionar. Não dá para desfazer.', botao: 'Excluir ciclo' })
      .then(function (ok) {
        if (!ok) return;
        ctx.api('f360ExcluirCiclo', c.id).then(function () { recarregar(ctx, 'Ciclo excluído.'); }).catch(ctx.falhou);
      });
  }

  function cartaoEncerrado(ctx, c) {
    var el = ctx.el, botao = ctx.botao;
    var card = el('article', { classe: 'f360p-ciclo', 'data-ciclo': c.id, 'data-status': 'encerrado' }, [cabecalhoCiclo(ctx, c)]);
    card.appendChild(el('p', { classe: 'texto-suave t-nota', texto: (c.listaApagadaEm ? 'Lista de convites e ligação link-resposta apagadas no encerramento. ' : 'Ligação link-resposta apagada no encerramento; lista de convites mantida (decisão do contrato). ') +
      'Relatos de assédio registrados neste ciclo: ' + (c.relatosRegistrados || 0) + '.' }));
    card.appendChild(el('ul', { classe: 'f360p-pessoas' }, c.avaliados.map(function (a) { return cartaoPessoa(ctx, c, a); })));
    var cons = c.consolidado;
    var urlCons = cons && cons.status === 'publicado' ? (cons.url || linkRelatorio(ctx.href, cons.token)) : '';
    card.appendChild(el('h4', { classe: 'f360p-sub', texto: 'Consolidado da liderança (sem nomes)' }));
    card.appendChild(el('div', { classe: 'gestao-card__acoes' }, podeConsolidar(c) ? [
      botao(urlCons ? 'botao--claro' : 'botao--principal', urlCons ? 'Atualizar consolidado' : 'Publicar consolidado', function () {
        ctx.api('f360GerarConsolidado', c.id, { publicar: true, consultor: ctx.consultor }).then(function () { recarregar(ctx, 'Consolidado publicado.'); }).catch(ctx.falhou);
      }, { 'data-acao': 'f360-consolidado' }),
      urlCons ? el('code', { classe: 'av-link f360p-link', texto: urlCons }) : null,
      urlCons ? botao('botao--claro botao--pequeno', 'Copiar link', function () { ctx.copiar(urlCons, 'Link do consolidado copiado.'); }) : null
    ] : [el('span', { classe: 'texto-suave t-rotulo', texto: 'Só com 5 ou mais líderes com relatório liberado e devolutiva feita. Sem ranking e sem nomes.' })]));
    card.appendChild(el('div', { classe: 'gestao-card__acoes' }, [
      botao('botao--claro botao--pequeno', 'Apagar respostas individuais agora', function () {
        ctx.confirmar({ titulo: 'Apagar as respostas individuais?', texto: 'Apaga as respostas, os comentários e o que sobrou da lista de convites de todas as pessoas deste ciclo. Os relatórios publicados continuam valendo, mas não podem mais ser refeitos. Não dá para desfazer.',
          botao: 'Apagar respostas' }).then(function (ok) {
          if (!ok) return;
          ctx.api('f360ApagarBrutas', { cicloId: c.id, agora: true }).then(function () { recarregar(ctx, 'Respostas individuais apagadas.'); }).catch(ctx.falhou);
        });
      }, { 'data-acao': 'f360-apagar-brutas' }),
      el('span', { classe: 'texto-suave t-nota', texto: 'Retenção: as respostas individuais são apagadas ' + c.retencaoDias + ' dias depois da devolutiva de cada pessoa (ou do encerramento, sem devolutiva).' }),
      botao('botao--perigo botao--pequeno', 'Excluir ciclo', function () { excluir(ctx, c); }, { 'data-acao': 'f360-excluir' })
    ]));
    return card;
  }

  function num(v) { return typeof v === 'number' && isFinite(v) ? v.toFixed(1).replace('.', ',') : '—'; }

  // Quadro do consultor: tema × fonte, com 1 casa (o líder vê só a régua com as palavras).
  function quadroConsultor(el, res) {
    var F = FX();
    var cols = (res.grupos || []).map(function (g) { return { rot: g.nome, tipo: 'grupo', g: g }; });
    if (res.outras && cols.length > 1) cols.push({ rot: 'Outras pessoas', tipo: 'outras', g: res.outras });
    if (res.chefia) cols.push({ rot: 'Chefia', tipo: 'chefia', g: res.chefia });
    if (res.auto) cols.push({ rot: 'Autoavaliação', tipo: 'auto', g: res.auto });
    function cel(col, chave, item) {
      var x = item ? col.g.itens[chave] : col.g.temas[chave];
      if (col.tipo === 'chefia' || col.tipo === 'auto') return el('td', { classe: 'tabular', texto: x === 'nao' ? 'não obs.' : num(x) });
      if (!x) return el('td', { classe: 'tabular texto-suave', texto: '—', title: item ? 'Menos de 5 respostas (ou escondida para proteger outro grupo)' : 'Menos de 3 respostas' });
      if (x.pouco) return el('td', { classe: 'tabular texto-suave', texto: 'pouco obs.' });
      return el('td', { classe: 'tabular', texto: num(x.media) + ' (' + x.n + ')' + (x.variadas ? ' · variadas' : '') });
    }
    var cab = el('tr', null, [el('th', { scope: 'col', texto: 'Tema / frase' })].concat(cols.map(function (c) { return el('th', { scope: 'col', texto: c.rot + (c.g.n ? ' (' + c.g.n + ')' : '') }); })));
    var linhas = [];
    F.TEMAS.forEach(function (t) {
      linhas.push(el('tr', { classe: 'f360p-tabela__tema', 'data-tema': t.id }, [el('th', { scope: 'row', texto: t.nome })].concat(cols.map(function (c) { return cel(c, t.id, false); }))));
      t.itens.forEach(function (it) {
        linhas.push(el('tr', { 'data-item': it.id }, [el('th', { scope: 'row', classe: 'f360p-tabela__item', texto: it.id + ' · ' + F.textoItem(it.id, 'equipe', '[Nome]') })].concat(cols.map(function (c) { return cel(c, it.id, true); }))));
      });
    });
    return el('div', { classe: 'f360p-rolagem' }, el('table', { classe: 'f360p-tabela f360p-quadro' }, [el('thead', null, cab), el('tbody', null, linhas)]));
  }

  function cartaoPessoa(ctx, c, a) {
    var el = ctx.el, botao = ctx.botao;
    var F = FX();
    var s = situacao(a);
    var res = a.resultado || {};
    var apagadas = !!a.brutasApagadasEm;
    var li = el('li', { classe: 'f360p-pessoa', 'data-avaliado': a.id, 'data-liberado': s.liberado ? 'sim' : 'nao' }, [
      el('div', { classe: 'f360p-avaliado__topo' }, [
        el('span', { classe: 'seminegrito', texto: a.nome }),
        el('span', { classe: 'selo ' + (s.liberado ? 'selo--noite' : ''), texto: s.liberado ? 'Relatório liberado' : 'Sem relatório' }),
        a.devolutivaEm ? el('span', { classe: 'selo', 'data-devolutiva': 'feita', texto: 'Devolutiva em ' + ctx.formatarData(a.devolutivaEm) }) : null,
        apagadas ? el('span', { classe: 'selo', texto: 'Respostas apagadas' }) : null
      ]),
      linhaContagens(el, a),
      el('p', { classe: 't-rotulo f360p-situacao', texto: s.texto })
    ]);
    if (s.liberado) {
      li.appendChild(el('details', { classe: 'f360p-resultado' }, [el('summary', { classe: 't-rotulo', texto: 'Resultado por tema e por frase (só para o consultor)' }), quadroConsultor(el, res),
        el('p', { classe: 'texto-suave t-nota', texto: 'O líder vê só a régua com as palavras (nunca, raramente, às vezes, frequentemente, sempre). Sem nota, sem semáforo, sem comparação com outros líderes.' })]));
    }
    // Qualidade: respostas sinalizadas só saem por decisão do consultor, por fonte anônima inteira.
    var sin = res.sinalizadas || {};
    var anon = F.ANONIMAS.filter(function (f) { return (sin[f] || 0) > 0 || (a.excluir || []).indexOf(f) >= 0; });
    if (anon.length && !apagadas) {
      var marcas = anon.map(function (f) {
        return el('input', { type: 'checkbox', id: 'f360-excluir-' + a.id + '-' + f, 'data-fonte': f, checked: (a.excluir || []).indexOf(f) >= 0 ? true : null });
      });
      li.appendChild(el('div', { classe: 'f360p-qualidade' }, [
        el('p', { classe: 't-rotulo', texto: 'Respostas sinalizadas (rápidas demais ou com a mesma resposta em todas as frases): ' +
          anon.map(function (f) { return F.NOME_FONTE[f].toLowerCase() + ' ' + (sin[f] || 0); }).join(' · ') + '. Tirar só se houver motivo claro:' }),
        el('div', { classe: 'f360p-qualidade__marcas' }, marcas.map(function (m, i) {
          return el('label', { classe: 'marcar', for: m.id }, [m, el('span', { texto: 'Tirar as sinalizadas de ' + F.NOME_FONTE[anon[i]].toLowerCase() })]);
        })),
        botao('botao--claro botao--pequeno', 'Recalcular', function () {
          var ex = marcas.filter(function (m) { return m.checked; }).map(function (m) { return m.getAttribute('data-fonte'); });
          ctx.api('f360Recalcular', a.id, ex).then(function () { recarregar(ctx, 'Resultado recalculado.'); }).catch(ctx.falhou);
        }, { 'data-acao': 'f360-recalcular' })
      ]));
    }
    var cm = a.comentarios || {};
    li.appendChild(el('div', { classe: 'gestao-card__acoes' }, [
      el('span', { classe: 't-rotulo tabular', 'data-comentarios': cm.pendentes ? 'pendentes' : 'ok',
        texto: cm.total + ' comentário' + (cm.total === 1 ? '' : 's') + (cm.pendentes ? ' · ' + cm.pendentes + ' para moderar'
          : (!cm.total ? '' : (cm.elegiveis ? ' · moderados' : ' · de grupo que não aparece: não vão para o líder'))) }),
      botao('botao--claro botao--pequeno', 'Moderar comentários', function () { janelaModerar(ctx, c, a); },
        { 'data-acao': 'f360-moderar', disabled: cm.total && !apagadas ? null : true }),
      botao(a.devolutivaEm ? 'botao--claro botao--pequeno' : 'botao--principal botao--pequeno', 'Devolutiva e plano', function () { janelaDevolutiva(ctx, c, a); },
        { 'data-acao': 'f360-devolutiva' })
    ]));
    // Relatórios
    var rl = (a.relatorios && a.relatorios.lider) || null, rc = (a.relatorios && a.relatorios.chefia) || null;
    var urlL = rl && rl.status === 'publicado' ? (rl.url || linkRelatorio(ctx.href, rl.token)) : '';
    var urlC = rc && rc.status === 'publicado' ? (rc.url || linkRelatorio(ctx.href, rc.token)) : '';
    function gerar(visao, publicar, msg) {
      ctx.api('f360GerarRelatorio', a.id, { visao: visao, publicar: publicar, consultor: ctx.consultor }).then(function () { recarregar(ctx, msg); }).catch(ctx.falhou);
    }
    function linhaLink(url, rot, visao) {
      if (!url) return [];
      var msg = visao === 'lider' ? 'Olá! Segue o seu relatório do Feedback 360 da Liderança, preparado pela Gestão sem Caos. É confidencial e serve só para o seu desenvolvimento:\n' + url
        : 'Olá! Segue o plano de desenvolvimento de ' + a.nome + ' (Feedback 360 da Liderança, Gestão sem Caos). Você vê só o plano:\n' + url;
      return [el('code', { classe: 'av-link f360p-link', 'data-link': 'relatorio-' + visao, texto: url }),
        botao('botao--claro botao--pequeno', 'Copiar link', function () { ctx.copiar(url, rot + ' copiado.'); }, { 'data-acao': 'f360-copiar-' + visao }),
        el('a', { classe: 'botao botao--claro botao--pequeno', href: ctx.linkWhatsApp(msg), target: '_blank', rel: 'noopener', texto: 'WhatsApp' }),
        el('a', { classe: 'botao botao--claro botao--pequeno', href: url, target: '_blank', rel: 'noopener', 'data-acao': 'f360-abrir-' + visao, texto: 'Abrir' }),
        botao('botao--claro botao--pequeno', 'Despublicar', function () { gerar(visao, false, 'Relatório voltou para rascunho: o link não abre mais.'); }, { 'data-acao': 'f360-despublicar-' + visao })];
    }
    var semDevolutiva = !a.devolutivaEm;
    li.appendChild(el('div', { classe: 'gestao-card__acoes f360p-relatorio', 'data-visao': 'lider' }, (s.liberado ? [
      botao('botao--claro botao--pequeno', 'Prévia do relatório do líder', function () { previa(ctx, c, a); }, { 'data-acao': 'f360-previa' }),
      botao(urlL ? 'botao--claro botao--pequeno' : 'botao--laranja botao--pequeno', urlL ? 'Atualizar relatório do líder' : 'Publicar relatório do líder', function () {
        gerar('lider', true, urlL ? 'Relatório do líder atualizado.' : 'Relatório do líder publicado. Entregue na conversa de devolutiva.');
      }, { 'data-acao': 'f360-publicar-lider', disabled: semDevolutiva || apagadas ? true : null, title: semDevolutiva ? 'Marque a devolutiva como feita antes' : null })
    ] : [el('span', { classe: 'texto-suave t-rotulo', texto: 'Sem relatório do líder neste ciclo.' })]).concat(linhaLink(urlL, 'Link do relatório', 'lider'))));
    if (a.chefias) {
      li.appendChild(el('div', { classe: 'gestao-card__acoes f360p-relatorio', 'data-visao': 'chefia' }, [
        botao(urlC ? 'botao--claro botao--pequeno' : 'botao--claro botao--pequeno', urlC ? 'Atualizar visão da chefia' : 'Publicar visão da chefia (só o plano)', function () {
          gerar('chefia', true, 'Visão da chefia publicada: só o plano.');
        }, { 'data-acao': 'f360-publicar-chefia', disabled: semDevolutiva || !a.plano ? true : null, title: !a.plano ? 'Registre o plano na devolutiva antes' : null })
      ].concat(linhaLink(urlC, 'Link da visão da chefia', 'chefia'))));
    }
    return li;
  }

  function previa(ctx, c, a) {
    var colab = (ctx.colabs || []).filter(function (x) { return String(x.pessoaId) === String(a.pessoaId); })[0];
    var codigo = colab && colab.resultado && colab.resultado.codigo;
    var pegar = a.comentarios && a.comentarios.total && !a.brutasApagadasEm ? ctx.api('f360Comentarios', a.id) : Promise.resolve({ comentarios: [] });
    pegar.then(function (resp) {
      ctx.abrirPrevia(snapshotPrevia(c, a, ctx.emp, resp.comentarios || [], ctx.consultor, codigo));
    }).catch(ctx.falhou);
  }

  /* ----- moderação ----- */

  function janelaModerar(ctx, c, a) {
    var el = ctx.el, botao = ctx.botao;
    var F = FX();
    ctx.api('f360Comentarios', a.id).then(function (resp) {
      var lista = resp.comentarios || [];
      var itens = lista.map(function (x) {
        var estado = el('span', { classe: 'selo f360p-mod__estado', 'data-estado': x.status, texto: rotuloStatus(x) });
        var area = el('textarea', { classe: 'entrada f360p-mod__edicao', rows: '3', maxlength: String(F.MAX_COMENTARIO), hidden: true, 'aria-label': 'Texto editado' });
        var motivo = el('select', { classe: 'entrada f360p-mod__motivo', hidden: true, 'aria-label': 'Motivo do descarte' },
          [el('option', { value: '', texto: 'Motivo do descarte…' })].concat(Object.keys(F.MOTIVOS_DESCARTE).map(function (k) { return el('option', { value: k, texto: F.MOTIVOS_DESCARTE[k] }); })));
        var salvarEd = botao('botao--principal botao--pequeno', 'Salvar edição', function () { mod('editado', { texto: area.value }); }, { hidden: true, 'data-acao': 'mod-salvar-edicao' });
        var salvarDesc = botao('botao--perigo botao--pequeno', 'Descartar', function () { mod('descartado', { motivo: motivo.value }); }, { hidden: true, 'data-acao': 'mod-confirmar-descarte' });
        function mod(status, extra) {
          var d = { status: status };
          for (var k in extra || {}) d[k] = extra[k];
          return ctx.api('f360Moderar', x.id, d).then(function () {
            x.status = status;
            if (status === 'editado') x.textoModerado = String(d.texto || '').trim();
            if (status === 'descartado') x.motivo = d.motivo;
            estado.textContent = rotuloStatus(x);
            estado.setAttribute('data-estado', status);
            area.hidden = true; salvarEd.hidden = true; motivo.hidden = true; salvarDesc.hidden = true;
          }).catch(ctx.falhou);
        }
        return el('li', { classe: 'f360p-mod', 'data-comentario': x.id, 'data-elegivel': x.elegivel ? 'sim' : 'nao' }, [
          el('div', { classe: 'f360p-mod__cab' }, [
            el('span', { classe: 't-rotulo seminegrito', texto: x.pergunta === 'AB1' ? 'Continuar fazendo' : 'Fazer diferente' }),
            x.chefia ? el('span', { classe: 'selo', texto: 'Chefia (identificada)' }) : null,
            x.elegivel ? null : el('span', { classe: 'selo', texto: 'Grupo não aparece: não vai para o líder' }),
            estado
          ]),
          el('p', { classe: 'f360p-mod__texto', texto: x.texto }),
          x.status === 'editado' && x.textoModerado ? el('p', { classe: 'texto-suave t-nota', texto: 'Editado: ' + x.textoModerado }) : null,
          el('div', { classe: 'gestao-card__acoes' }, [
            x.elegivel ? botao('botao--claro botao--pequeno', 'Manter', function () { mod('mantido'); }, { 'data-acao': 'mod-manter' }) : null,
            x.elegivel ? botao('botao--claro botao--pequeno', 'Editar', function () {
              area.value = x.textoModerado || x.texto; area.hidden = false; salvarEd.hidden = false; area.focus();
            }, { 'data-acao': 'mod-editar' }) : null,
            botao('botao--claro botao--pequeno', 'Descartar…', function () { motivo.hidden = false; salvarDesc.hidden = false; motivo.focus(); }, { 'data-acao': 'mod-descartar' }),
            botao('botao--claro botao--pequeno', '[trecho removido]', function () {
              if (area.hidden) { area.value = x.textoModerado || x.texto; area.hidden = false; salvarEd.hidden = false; }
              var i = area.selectionStart || 0, f = area.selectionEnd || 0;
              area.value = area.value.slice(0, i) + '[trecho removido]' + area.value.slice(f);
              area.focus();
            }, { 'data-acao': 'mod-trecho', disabled: x.elegivel ? null : true, title: 'Troca o trecho selecionado por [trecho removido]' })
          ]),
          area, salvarEd, el('div', { classe: 'f360p-mod__descarte' }, [motivo, salvarDesc])
        ]);
      });
      ctx.abrirJanela({ id: 'janela-f360-moderar', titulo: 'Comentários de ' + a.nome, botao: 'Concluir',
        texto: 'Em ordem sorteada, sem dizer de qual grupo vieram (a chefia aparece primeiro, identificada). Não copie, não exporte e não mande o texto bruto a ninguém.',
        corpo: [
          el('details', { classe: 'f360p-roteiro', open: true }, [el('summary', { classe: 't-rotulo seminegrito', texto: 'Roteiro de moderação' }),
            el('ul', { classe: 't-rotulo' }, F.ROTEIRO_MODERACAO.map(function (t) { return el('li', { texto: t }); }))]),
          el('details', { classe: 'f360p-roteiro' }, [el('summary', { classe: 't-rotulo seminegrito', texto: 'Protocolo de relatos (assédio, discriminação, violência)' }),
            el('ol', { classe: 't-rotulo' }, F.PROTOCOLO_RELATOS.map(function (t) { return el('li', { texto: t }); })),
            el('p', { classe: 'texto-suave t-nota', texto: 'Contato do contrato para os avisos: ' + (c.contatoRelatos || '—') + '.' })]),
          lista.length ? el('ol', { classe: 'f360p-mods' }, itens) : el('p', { classe: 'texto-suave', texto: resp.apagados ? 'As respostas já foram apagadas (retenção).' : 'Nenhum comentário.' })
        ],
        aoConfirmar: function () { recarregar(ctx); return true; } });
    }).catch(ctx.falhou);
  }
  function rotuloStatus(x) {
    var F = FX();
    if (x.status === 'mantido') return 'Mantido';
    if (x.status === 'editado') return 'Editado';
    if (x.status === 'descartado') return 'Descartado' + (x.motivo ? ': ' + (F.MOTIVOS_DESCARTE[x.motivo] || '').toLowerCase() : '');
    return x.elegivel ? 'Pendente' : 'Não vai para o líder';
  }

  /* ----- devolutiva e plano ----- */

  function janelaDevolutiva(ctx, c, a) {
    var el = ctx.el, botao = ctx.botao;
    var F = FX();
    var p = a.plano || {};
    var pid = 'f360-dev-';
    function campo(id, rotulo, no, ajuda) {
      return el('label', { classe: 'campo', for: id }, [el('span', { classe: 'campo__rotulo', texto: rotulo }), no, ajuda ? el('span', { classe: 'campo__ajuda', texto: ajuda }) : null]);
    }
    function entrada(id, valor, extra) {
      var at = { id: id, classe: 'entrada', type: 'text', maxlength: '300', autocomplete: 'off', value: valor || '' };
      for (var k in extra || {}) at[k] = extra[k];
      return el('input', at);
    }
    function seletorItem(id, valor) {
      return el('select', { id: id, classe: 'entrada' }, [el('option', { value: '', texto: '— nenhum —' })].concat(F.TEMAS.map(function (t) {
        return el('optgroup', { label: t.nome }, t.itens.map(function (it) {
          return el('option', { value: it.id, selected: it.id === valor ? true : null, texto: F.textoItem(it.id, 'equipe', a.nome) });
        }));
      })));
    }
    var temas = el('textarea', { id: pid + 'temas', classe: 'entrada f360p-texto', rows: '4', placeholder: 'Um tema por linha (até 6), com as suas palavras, sem trechos literais e sem nomes.' });
    temas.value = (a.temas || []).join('\n');
    var foco = entrada(pid + 'foco', a.foco);
    var comps = [0, 1].map(function (i) {
      var x = (p.comportamentos || [])[i] || {};
      return { item: seletorItem(pid + 'item-' + i, x.item), acao: entrada(pid + 'acao-' + i, x.acao, { placeholder: 'Escrito como ação: o que vai fazer, com que frequência' }) };
    });
    var acoes = [0, 1, 2].map(function (i) {
      var x = (p.acoes || [])[i] || {};
      return { texto: entrada(pid + 'acoes-' + i, x.texto, { placeholder: 'Ação ' + (i + 1) + ' (do menu ou própria)' }), prazo: el('input', { id: pid + 'prazo-' + i, classe: 'entrada f360p-data', type: 'date', value: x.prazo || '', 'aria-label': 'Prazo da ação ' + (i + 1) }) };
    });
    var contar = entrada(pid + 'contar', p.contar), apoio = entrada(pid + 'apoio', p.apoio), indicador = entrada(pid + 'indicador', p.indicador), andamento = entrada(pid + 'andamento', p.andamento);
    var datasP = p.datas || {};
    var datas = F.MOMENTOS_PLANO.map(function (m) { return { m: m, no: el('input', { id: pid + 'data-' + m.id, classe: 'entrada f360p-data', type: 'date', value: datasP[m.id] || '' }) }; });
    var observacao = el('textarea', { id: pid + 'observacao', classe: 'entrada f360p-texto', rows: '3', maxlength: '600', placeholder: 'Opcional: o que o líder quer registrar (concordâncias, discordâncias, contexto).' });
    observacao.value = a.observacao || '';
    var disc = el('input', { type: 'checkbox', id: pid + 'disc', checked: a.discAceito ? true : null });
    var feita = el('input', { type: 'checkbox', id: pid + 'feita', checked: a.devolutivaEm ? true : null, disabled: a.devolutivaEm ? true : null });
    var menu = el('div', { classe: 'f360p-menu' });
    function atualizarMenu() {
      while (menu.firstChild) menu.removeChild(menu.firstChild);
      var ts = {};
      comps.forEach(function (x) { var it = F.item(x.item.value); if (it) ts[it.tema] = true; });
      Object.keys(ts).forEach(function (t) {
        var m = F.MENU_ACOES[t];
        menu.appendChild(el('div', { classe: 'f360p-menu__tema' }, [el('p', { classe: 't-rotulo seminegrito', texto: 'Ideias de ação · ' + F.tema(t).nome }),
          el('ul', { classe: 't-rotulo' }, m.acoes.map(function (x) { return el('li', { texto: x }); })),
          el('p', { classe: 'texto-suave t-nota', texto: 'Base: ' + m.base + '.' })]));
      });
    }
    comps.forEach(function (x) { x.item.addEventListener('change', atualizarMenu); });
    atualizarMenu();
    var sugerir = botao('botao--claro botao--pequeno', 'Sugerir datas a partir de hoje', function () {
      var hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
      var s = datasSugeridas((a.devolutivaEm || '').slice(0, 10) || hoje);
      datas.forEach(function (d) { if (!d.no.value) d.no.value = s[d.m.id]; });
    }, { 'data-acao': 'f360-sugerir-datas' });
    ctx.abrirJanela({ id: 'janela-f360-devolutiva', titulo: 'Devolutiva e plano · ' + a.nome, botao: 'Salvar',
      texto: 'Preencha na conversa de devolutiva (45 a 60 minutos, só o líder e o consultor). O plano é a única parte que a chefia vê.',
      corpo: [
        campo(temas.id, 'Temas dos comentários (vão para o relatório do líder)', temas),
        campo(foco.id, 'Foco que quero conversar (resumo do relatório)', foco),
        el('fieldset', { classe: 'f360p-grupo' }, [el('legend', { classe: 'campo__rotulo', texto: 'Plano: 1 ou 2 comportamentos (entre as 18 frases)' })].concat(comps.map(function (x, i) {
          return el('div', { classe: 'f360p-comp' }, [campo(x.item.id, 'Comportamento ' + (i + 1) + (i ? ' (opcional)' : ''), x.item), campo(x.acao.id, 'Como ação', x.acao)]);
        })).concat([menu])),
        el('fieldset', { classe: 'f360p-grupo' }, [el('legend', { classe: 'campo__rotulo', texto: 'Ações (até 3) e prazos' })].concat(acoes.map(function (x) {
          return el('div', { classe: 'f360p-acao' }, [x.texto, x.prazo]);
        }))),
        campo(contar.id, 'O que vai contar à equipe e aos colegas', contar, 'Agradecer, contar 1 ou 2 focos e pedir ajuda. Nunca discutir notas nem perguntar quem disse o quê.'),
        campo(apoio.id, 'Quem apoia', apoio),
        campo(indicador.id, 'Como vai saber que melhorou', indicador),
        el('fieldset', { classe: 'f360p-grupo' }, [el('legend', { classe: 'campo__rotulo', texto: 'Acompanhamento' })].concat(datas.map(function (d) {
          return el('label', { classe: 'f360p-data-linha', for: d.no.id }, [el('span', { classe: 't-rotulo', texto: d.m.rotulo }), d.no]);
        })).concat([sugerir])),
        campo(andamento.id, 'Andamento (atualize nos check-ins)', andamento),
        campo(observacao.id, 'Observação do líder', observacao),
        el('label', { classe: 'marcar', for: disc.id }, [disc, el('span', { texto: 'O líder quer ver as hipóteses de estilo (DISC) no relatório. Desligado por padrão; só com o perfil DISC respondido. São hipóteses para conversa, nunca conclusão.' })]),
        el('label', { classe: 'marcar', for: feita.id }, [feita, el('span', { texto: a.devolutivaEm ? 'Devolutiva feita em ' + ctx.formatarData(a.devolutivaEm) + '.' : 'A conversa de devolutiva aconteceu (libera a publicação do relatório).' })])
      ],
      aoConfirmar: function () {
        var plano = planoDoFormulario({
          comportamentos: comps.map(function (x) { return { item: x.item.value, acao: x.acao.value }; }),
          acoes: acoes.map(function (x) { return { texto: x.texto.value, prazo: x.prazo.value }; }),
          contar: contar.value, apoio: apoio.value, indicador: indicador.value, andamento: andamento.value,
          datas: datas.reduce(function (o, d) { o[d.m.id] = d.no.value; return o; }, {})
        });
        var d = { temas: temas.value.split(/\n+/).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 6), foco: foco.value.trim(),
          observacao: observacao.value.trim(), discAceito: disc.checked };
        if (plano) {
          var v = F.validarPlano(plano);
          if (!v.ok) throw new Error(v.erro);
          d.plano = plano;
        }
        if (feita.checked && !a.devolutivaEm) d.devolutivaFeita = true;
        return ctx.api('f360SalvarDevolutiva', a.id, d).then(function () { recarregar(ctx, 'Devolutiva salva.'); });
      } });
  }

  /* ----- novo ciclo ----- */

  function janelaNovo(ctx) {
    var el = ctx.el;
    var F = FX();
    var s = desenhoInicial(ctx.colabs, ctx.eq.relacoes, ctx.eq.topoIds);
    var nomes = {};
    (ctx.colabs || []).forEach(function (c) { nomes[String(c.pessoaId)] = c.nome; });
    function nm(id) { return F.nomeCurto(nomes[id] || ''); }
    var agora = new Date(Date.now() - 3 * 3600000);
    var hoje = agora.toISOString().slice(0, 10);
    var nome = el('input', { id: 'f360-nome', classe: 'entrada', type: 'text', maxlength: '120', autocomplete: 'off',
      value: 'Feedback 360 · ' + ('0' + (agora.getUTCMonth() + 1)).slice(-2) + '/' + agora.getUTCFullYear() });
    var fim = el('input', { id: 'f360-fim', classe: 'entrada f360p-data', type: 'date', value: somarDias(hoje, 14), min: hoje, max: somarDias(hoje, 60) });
    var relatos = el('input', { id: 'f360-relatos', classe: 'entrada', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Ex.: diretoria administrativa (como está no contrato)' });
    var canal = el('input', { id: 'f360-canal', classe: 'entrada', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Ex.: canal de escuta do RH (opcional)' });
    var canalUrl = el('input', { id: 'f360-canal-url', classe: 'entrada', type: 'text', maxlength: '300', autocomplete: 'off', placeholder: 'https://… ou mailto:… (opcional)' });
    var contato = el('input', { id: 'f360-contato', classe: 'entrada', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Ex.: rh@empresa.com.br (opcional)' });
    var ret = el('input', { id: 'f360-retencao', classe: 'entrada f360p-num', type: 'number', min: '30', max: '90', value: '90' });
    var manter = el('input', { type: 'checkbox', id: 'f360-manter-lista' });
    var validacao = el('div', { classe: 'f360p-validacao', id: 'f360-validacao', role: 'status', 'aria-live': 'polite' });

    var linhas = s.avaliados.map(function (a, i) {
      var marca = el('input', { type: 'checkbox', id: 'f360-av-' + i, checked: true, 'data-pessoa': a.pessoaId });
      function caixas(tipo, cands, marcados) {
        return cands.map(function (p, j) {
          var cb = el('input', { type: 'checkbox', id: 'f360-' + tipo + '-' + i + '-' + j, 'data-pessoa': p, 'data-tipo': tipo, checked: marcados.indexOf(p) >= 0 ? true : null });
          return { cb: cb, no: el('label', { classe: 'marcar f360p-escolha', for: cb.id }, [cb, el('span', { texto: nm(p) })]) };
        });
      }
      var col = caixas('colega', a.candidatosColegas, a.colegas);
      var out = caixas('outro', a.candidatosOutros, a.outros);
      var contOut = el('span', { classe: 'texto-suave' });
      function contar() { contOut.textContent = ' (' + out.filter(function (x) { return x.cb.checked; }).length + ' marcados)'; }
      out.forEach(function (x) { x.cb.addEventListener('change', contar); });
      contar();
      var no = el('li', { classe: 'f360p-des', 'data-pessoa': a.pessoaId }, [
        el('label', { classe: 'marcar', for: marca.id }, [marca, el('span', null, [el('strong', { texto: nm(a.pessoaId) }), el('span', { classe: 'texto-suave', texto: a.topo ? ' · topo do organograma (sem chefia)' : '' })])]),
        el('p', { classe: 't-rotulo f360p-des__fixos' }, [
          el('span', { classe: 'texto-suave', texto: 'Chefia: ' }), a.chefia.length ? a.chefia.map(nm).join(', ') : '—',
          el('span', { classe: 'texto-suave', texto: ' · Equipe (' + a.equipe.length + '): ' }), a.equipe.map(nm).join(', ')
        ]),
        el('div', { classe: 'f360p-des__grupo' }, [el('span', { classe: 't-rotulo texto-suave', texto: 'Colegas (até 6)' }),
          col.length ? el('div', { classe: 'f360p-escolhas' }, col.map(function (x) { return x.no; })) : el('span', { classe: 't-rotulo texto-suave', texto: 'nenhum colega sugerido pelo organograma' })]),
        el('details', { classe: 'f360p-des__grupo' }, [el('summary', { classe: 't-rotulo texto-suave' }, ['Outros convidados (até 4)', contOut]),
          el('div', { classe: 'f360p-escolhas f360p-escolhas--rolagem' }, out.map(function (x) { return x.no; }))])
      ]);
      return { a: a, marca: marca, col: col, out: out, no: no };
    });
    function desenho() {
      return linhas.filter(function (x) { return x.marca.checked; }).map(function (x) {
        return { pessoaId: x.a.pessoaId, chefia: x.a.chefia.slice(), equipe: x.a.equipe.slice(),
          colegas: x.col.filter(function (y) { return y.cb.checked; }).map(function (y) { return y.cb.getAttribute('data-pessoa'); }),
          outros: x.out.filter(function (y) { return y.cb.checked; }).map(function (y) { return y.cb.getAttribute('data-pessoa'); }) };
      });
    }
    function conferir() {
      var v = F.validarDesenho(desenho(), ctx.colabs, ctx.eq.relacoes);
      while (validacao.firstChild) validacao.removeChild(validacao.firstChild);
      var maior = null;
      Object.keys(v.carga || {}).forEach(function (p) { var t = v.carga[p].obrigatorios + v.carga[p].opcionais; if (!maior || t > maior.t) maior = { p: p, t: t }; });
      if (!v.ok) validacao.appendChild(el('p', { classe: 'aviso aviso--erro', 'data-validacao': 'erro', texto: v.erro }));
      else validacao.appendChild(el('p', { classe: 't-rotulo', 'data-validacao': 'ok', texto: 'Desenho dentro das regras: ' + desenho().length + ' pessoa(s) avaliada(s)' + (maior ? '; quem mais responde: ' + nm(maior.p) + ', ' + maior.t + ' formulário(s).' : '.') }));
      if ((v.avisos || []).length) validacao.appendChild(el('ul', { classe: 'f360p-avisos' }, v.avisos.map(function (t) { return el('li', { classe: 't-rotulo', texto: t }); })));
      return v;
    }
    var lista = el('ul', { classe: 'f360p-desenho', id: 'f360-desenho' }, linhas.map(function (x) { return x.no; }));
    lista.addEventListener('change', conferir);
    conferir();
    ctx.abrirJanela({ id: 'janela-f360-novo', titulo: 'Novo Feedback 360', botao: 'Criar e gerar os links',
      texto: 'A sugestão vem do organograma: quem lidera alguém é avaliado; a chefia e toda a equipe direta são convidadas; colegas e outros completam o grupo. ' +
        'Cada pessoa responde no máximo 4 formulários (a chefia responde por todos os seus liderados diretos). Confira e ajuste colegas e outros.',
      corpo: [
        el('label', { classe: 'campo', for: nome.id }, [el('span', { classe: 'campo__rotulo', texto: 'Nome do ciclo' }), nome]),
        el('div', { classe: 'f360p-linha' }, [
          el('label', { classe: 'campo', for: fim.id }, [el('span', { classe: 'campo__rotulo', texto: 'Encerramento previsto' }), fim, el('span', { classe: 'campo__ajuda', texto: 'Padrão: 2 semanas (até 60 dias).' })]),
          el('label', { classe: 'campo', for: ret.id }, [el('span', { classe: 'campo__rotulo', texto: 'Apagar respostas individuais (dias depois da devolutiva)' }), ret, el('span', { classe: 'campo__ajuda', texto: 'De 30 a 90 dias. O relatório publicado fica até 24 meses.' })])
        ]),
        el('label', { classe: 'campo', for: relatos.id }, [el('span', { classe: 'campo__rotulo', texto: 'Quem recebe os avisos do protocolo de relatos (obrigatório)' }), relatos,
          el('span', { classe: 'campo__ajuda', texto: 'O contato definido no contrato. Nunca um líder avaliado neste ciclo.' })]),
        el('div', { classe: 'f360p-linha' }, [
          el('label', { classe: 'campo', for: canal.id }, [el('span', { classe: 'campo__rotulo', texto: 'Canal de denúncia da empresa' }), canal]),
          el('label', { classe: 'campo', for: canalUrl.id }, [el('span', { classe: 'campo__rotulo', texto: 'Link do canal' }), canalUrl])
        ]),
        el('label', { classe: 'campo', for: contato.id }, [el('span', { classe: 'campo__rotulo', texto: 'Contato da empresa para dúvidas sobre dados (opcional)' }), contato]),
        el('label', { classe: 'marcar', for: manter.id }, [manter, el('span', { texto: 'Manter a lista de quem foi convidado depois do encerramento. Deixe desmarcado: só marque com aprovação do advogado e cláusula no contrato.' })]),
        el('div', { classe: 'campo' }, [el('span', { classe: 'campo__rotulo', texto: 'Quem é avaliado e quem avalia' }), lista]),
        validacao
      ],
      aoConfirmar: function () {
        var v = conferir();
        if (!v.ok) throw new Error(v.erro);
        if (!relatos.value.trim()) throw new Error('Informe quem recebe os avisos do protocolo de relatos.');
        var r = Number(ret.value);
        return ctx.api('f360CriarCiclo', { empresaId: ctx.emp.id, nome: nome.value.trim(), encerramentoPrevisto: fim.value || null,
          contatoRelatos: relatos.value.trim(), canalTexto: canal.value.trim(), canalUrl: canalUrl.value.trim(), contatoDados: contato.value.trim(),
          retencaoDias: isFinite(r) ? Math.floor(r) : 90, manterLista: manter.checked, avaliados: desenho() }).then(function () {
          recarregar(ctx, 'Ciclo criado. Envie a cada pessoa o link dela (copiar ou WhatsApp).');
        });
      } });
  }

  function esquecer(empresaId) { if (empresaId) delete cache[empresaId]; else cache = {}; }

  var DISC_ADMIN_F360 = { linkF360: linkF360, linkRelatorio: linkRelatorio, mensagemConvite: mensagemConvite, contagens: contagens, avisosAberto: avisosAberto,
    situacao: situacao, desenhoInicial: desenhoInicial, datasSugeridas: datasSugeridas, planoDoFormulario: planoDoFormulario,
    snapshotPrevia: snapshotPrevia, podeConsolidar: podeConsolidar, bloco: bloco, esquecer: esquecer };

  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_ADMIN_F360;
  else root.DISC_ADMIN_F360 = DISC_ADMIN_F360;
})(typeof self !== 'undefined' ? self : this);
