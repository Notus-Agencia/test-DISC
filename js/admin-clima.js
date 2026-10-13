/*
 * Painel (computador): subaba "Pesquisa de clima" da página da empresa. UMD: window.DISC_ADMIN_CLIMA / module.exports.
 *
 * O painel nunca recebe resposta bruta: só contagens agregadas por equipe enquanto a pesquisa está aberta e, depois do
 * encerramento, o resultado já suprimido pelo banco (DISC_API.climaResultado). O consultor lê os comentários (H2) só com 10+
 * respostas e escreve os TEMAS que vão para o relatório (nunca o texto literal).
 *
 * Funções puras (testes em tests/admin-clima.test.js):
 *   linkClima(href, token) -> URL absoluta de clima.html?t=<token>
 *   lideresDoOrganograma(colaboradores, relacoes, topoIds) -> [{pessoaId, nome, cargo, area, liderados}] na ordem do organograma
 *   mensagemConvite(empresa, link, papel) -> texto para WhatsApp (membro: coletivo e anônimo; lider: link do líder)
 *   avisosAberta(rodada) -> [texto] (equipes ainda abaixo do mínimo, adesão baixa, total abaixo de 5)
 *   textoSituacao(equipe, grupos) -> texto da situação da equipe no resultado ("aparece", "fundida em Outras equipes"…)
 *   snapshotPrevia(rodada, resultado, empresa, temas, consultor) -> o MESMO formato do snapshot montado pelo banco
 *   mensagemPessoal(empresa, nome, link, modo) -> texto do link PESSOAL (modos com identificação) para o WhatsApp
 *   avisosPessoais(rodada) -> [texto] (links pessoais sem forma de confirmação)
 * Modos de identificação (migração 20261018120000_clima_identificacao.sql): a janela "Nova pesquisa" escolhe o modo
 * (anônima | identificação opcional | identificada, com o alerta de que as respostas tendem a ser menos sinceras) e as
 * formas de confirmação (e-mail só com o envio configurado; WhatsApp só com provedor). Os links pessoais ficam na equipe
 * ("uso interno da consultoria"), com Copiar, WhatsApp (wa.me com o número do cadastro) e "Novo link". A tela "Uso
 * interno da consultoria" (DISC_API.climaIdentificacao) registra cada abertura (quem e quando) no servidor.
 * camposColaborador(ctx) -> {no, salvar(empresaId, pessoaId)}: e-mail e CPF/data (só hash no servidor) na janela
 *   "Editar colaborador" do js/admin.js.
 * DOM: bloco(ctx) -> <section id="emp-clima">. ctx = { el, botao, api, avisar, falhou, confirmar, abrirJanela, copiar,
 *   formatarData, linkWhatsApp(texto), linkWhatsAppPara(telefone, texto), abrirPrevia(dados), href, consultor, emp, eq,
 *   colabs, redesenhar() }.
 */
(function (root) {
  'use strict';

  var K = 5;
  var TAXA_MINIMA = 60;
  var cache = {};   // empresaId -> {rodadas, resultados: {id: resultado}, erro}

  function CL() { return root.DISC_CLIMA || (typeof require === 'function' ? require('./clima.js') : null); }

  /* ------------------------------------------------------------------ funções puras */

  function linkClima(href, token) {
    var base = String(href || '').split('#')[0].split('?')[0].replace(/[^/]*$/, '');
    return base + 'clima.html?t=' + encodeURIComponent(String(token || ''));
  }

  // Quem lidera alguém (relação "lidera" entre colaboradores ativos), em pré-ordem a partir do topo do organograma.
  function lideresDoOrganograma(colaboradores, relacoes, topoIds) {
    var ativos = {};
    (colaboradores || []).forEach(function (c) { if (c && c.status !== 'desligado') ativos[String(c.pessoaId)] = c; });
    var filhos = {}, temLider = {};
    (relacoes || []).forEach(function (r) {
      if (!r || r.tipo !== 'lidera' || !ativos[r.de] || !ativos[r.para]) return;
      (filhos[r.de] = filhos[r.de] || []).push(String(r.para));
      temLider[r.para] = true;
    });
    function porNome(a, b) { return String(ativos[a].nome).localeCompare(String(ativos[b].nome), 'pt-BR'); }
    var topo = (topoIds || []).map(String).filter(function (id) { return ativos[id] && !temLider[id]; });
    var raizes = topo.concat(Object.keys(ativos).filter(function (id) { return !temLider[id] && topo.indexOf(id) === -1; }).sort(porNome));
    var saida = [], visto = {};
    function visitar(id) {
      if (visto[id]) return;
      visto[id] = true;
      var fs = (filhos[id] || []).slice().sort(porNome);
      if (fs.length) {
        var c = ativos[id];
        saida.push({ pessoaId: id, nome: c.nome, cargo: c.cargo || '', area: c.area || '', liderados: fs.length });
      }
      fs.forEach(visitar);
    }
    raizes.forEach(visitar);
    Object.keys(filhos).sort(porNome).forEach(visitar); // ciclos ou sobras: entram no fim
    return saida;
  }

  function mensagemConvite(empresa, link, papel) {
    var emp = String(empresa || '').trim();
    if (papel === 'lider') {
      return 'Olá! Este é o seu link de líder na Pesquisa de Clima da Equipe' + (emp ? ' da ' + emp : '') + ', conduzida pela Gestão sem Caos. ' +
        'Você responde sobre a sua equipe e sobre o seu jeito de liderar; a sua resposta não entra na média da equipe. ' +
        'Este link é só seu (não envie para a equipe):\n' + link;
    }
    return 'Olá! ' + (emp ? 'A ' + emp + ' está' : 'Estamos') + ' fazendo a Pesquisa de Clima da Equipe, conduzida pela Gestão sem Caos. ' +
      'É anônima e voluntária: ninguém vê a sua resposta, só resultados de grupo, depois que a pesquisa terminar. Leva cerca de 5 minutos.\n' + link;
  }

  // Link PESSOAL (modos com identificação): diz quem vê o nome (só a Gestão sem Caos) e que o link não se encaminha.
  function mensagemPessoal(empresa, nome, link, modo) {
    var emp = String(empresa || '').trim();
    var primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
    var quem = modo === 'identificada'
      ? 'Esta pesquisa é identificada: só a Gestão sem Caos vê o seu nome junto com as respostas; a empresa só recebe resultados de grupo.'
      : 'No fim, você escolhe se quer se identificar (só a Gestão sem Caos vê o seu nome; a empresa só recebe resultados de grupo) ou manter o anonimato.';
    return 'Olá' + (primeiro ? ', ' + primeiro : '') + '! Este é o seu link pessoal da Pesquisa de Clima da Equipe' + (emp ? ' da ' + emp : '') +
      ', conduzida pela Gestão sem Caos. ' + quem + ' Leva cerca de 5 minutos. O link é só seu: não encaminhe.\n' + link;
  }

  function avisosPessoais(r) {
    var semForma = 0;
    (r && r.equipes || []).forEach(function (e) { (e.convites || []).forEach(function (c) { if (!(c.metodos || []).length) semForma += 1; }); });
    if (!semForma) return [];
    return [semForma + (semForma === 1 ? ' link pessoal sem forma de confirmação' : ' links pessoais sem forma de confirmação') +
      ' (sem e-mail e sem CPF/data no cadastro): o link sozinho identifica a pessoa. Mande só para ela.'];
  }

  function pct(n, d) { return d ? Math.min(100, Math.round(100 * n / d)) : 0; }

  // Avisos enquanto a pesquisa está aberta (o painel só vê contagens agregadas).
  function avisosAberta(r) {
    var out = [];
    if (!r || r.status !== 'aberta') return out;
    if ((r.respondentes || 0) < K) out.push('Até agora, menos de 5 respostas no total: se encerrar assim, nenhum resultado aparece no relatório.');
    (r.equipes || []).forEach(function (e) {
      if ((e.respondentes || 0) < K) {
        out.push(e.nome + ': ' + (e.respondentes || 0) + ' resposta' + (e.respondentes === 1 ? '' : 's') + '. Com menos de 5, a equipe não aparece sozinha: é fundida em "Outras equipes" ou conta só no total.');
      }
    });
    var t = pct(r.respondentes || 0, r.convidados || 0);
    if (r.convidados && t < TAXA_MINIMA) out.push('Adesão de ' + t + '% (abaixo de 60%): o relatório vai pedir leitura com cautela.');
    return out;
  }

  function nomeGrupo(grupos, id) {
    var g = (grupos || []).filter(function (x) { return x.id === id; })[0];
    return g ? (g.tipo === 'empresa' ? 'toda a empresa' : g.nome) : '';
  }
  function textoSituacao(e, grupos) {
    if (!e) return '';
    if (e.situacao === 'aparece') return 'Aparece no relatório.';
    if (e.motivo === 'sem_respostas') return 'Não aparece: nenhuma resposta.';
    if (e.motivo === 'empresa') return 'Não aparece: a empresa teve menos de 5 respostas no total.';
    if (e.situacao === 'outras') {
      return e.motivo === 'minimo' ? 'Fundida em "Outras equipes": menos de 5 respostas.'
        : 'Fundida em "Outras equipes" para proteger o anonimato de uma equipe pequena (regra do complemento).';
    }
    var onde = nomeGrupo(grupos, e.grupo);
    return (e.motivo === 'minimo' ? 'Não aparece sozinha: menos de 5 respostas' : 'Não aparece sozinha, para proteger o anonimato de outra equipe') +
      (onde ? ' (conta só no total de ' + onde + ').' : '.');
  }

  // O mesmo snapshot de public.clima_gerar_relatorio (para a prévia em nova aba, sem publicar nada).
  function snapshotPrevia(rodada, resultado, empresa, temas, consultor) {
    var c = CL();
    var r = rodada || {};
    var disponivel = !!(resultado && resultado.comentarios && resultado.comentarios.disponivel);
    return {
      modelo: 'clima', versao: 1, titulo: 'Pesquisa de clima · ' + String((empresa && empresa.nome) || ''), geradoEm: new Date().toISOString(),
      empresa: { nome: String((empresa && empresa.nome) || ''), cidade: String((empresa && empresa.cidade) || '') }, consultor: String(consultor || ''),
      rodada: { nome: r.nome || '', abertaEm: r.abertaEm || '', encerradaEm: r.encerradaEm || '', complemento: !!r.complemento, n4Ligado: !!r.n4,
        canalTexto: r.canalTexto || '', canalUrl: r.canalUrl || '', versaoItens: r.versaoItens || 'v0', modo: r.modo || 'anonima' },
      resultado: c.visaoCliente(resultado || {}),
      temas: disponivel ? (temas || []).filter(function (t) { return String(t).trim(); }).slice(0, 6) : []
    };
  }

  /* ------------------------------------------------------------------ DOM */

  function bloco(ctx) {
    var el = ctx.el, botao = ctx.botao;
    var emp = ctx.emp;
    var est = cache[emp.id];
    var sec = el('section', { classe: 'caixa emp-bloco clima-painel', id: 'emp-clima' }, [
      el('h3', { classe: 'caixa__titulo', texto: 'Pesquisa de Clima da Equipe' }),
      el('p', { classe: 'form-secao__texto', texto: 'Perguntas próprias da Gestão sem Caos sobre o clima de cada equipe do organograma (o líder e quem ele lidera direto). ' +
        'Em qualquer modo, a empresa só vê resultados de grupo, com 5 ou mais respostas, e só depois do encerramento.' })
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
    var aberta = est.rodadas.filter(function (r) { return r.status === 'aberta'; })[0];
    var lideres = lideresDoOrganograma(ctx.colabs, ctx.eq.relacoes, ctx.eq.topoIds);
    sec.appendChild(el('div', { classe: 'gestao-card__acoes' }, [
      aberta ? null : botao('botao--principal', 'Nova pesquisa de clima', function () { janelaNova(ctx, lideres); },
        { id: 'btn-clima-nova', disabled: lideres.length ? null : true, title: lideres.length ? null : 'Monte o organograma (quem lidera quem) primeiro' }),
      botao('botao--claro', 'Atualizar', function () { delete cache[emp.id]; ctx.redesenhar(); }, { id: 'btn-clima-atualizar' })
    ]));
    if (!lideres.length && !aberta) sec.appendChild(el('p', { classe: 'texto-suave t-rotulo', texto: 'Para criar uma pesquisa, marque no Organograma quem lidera quem: cada líder com seus liderados diretos vira uma equipe.' }));
    if (!est.rodadas.length) sec.appendChild(el('p', { classe: 'texto-suave t-rotulo', id: 'clima-vazio', texto: 'Nenhuma pesquisa de clima nesta empresa ainda.' }));
    est.rodadas.forEach(function (r) { sec.appendChild(r.status === 'aberta' ? cartaoAberta(ctx, r) : cartaoEncerrada(ctx, r)); });
    return sec;
  }

  function carregar(ctx) {
    var id = ctx.emp.id;
    // O que está ligado para mandar código (e-mail/WhatsApp): sem a função publicada, as duas formas ficam desligadas.
    var envios = Promise.resolve().then(function () { return ctx.api('climaEnvios'); })
      .then(function (r) { return { email: r.email === true, whatsapp: r.whatsapp === true, simulado: r.simulado === true }; },
        function () { return { email: false, whatsapp: false, falhou: true }; });
    Promise.all([ctx.api('climaListar', id), envios]).then(function (res) {
      cache[id] = { rodadas: res[0].rodadas || [], resultados: {}, envios: res[1] };
    }, function (e) {
      if (e && e.tratado) return;
      cache[id] = { rodadas: [], resultados: {}, erro: (e && e.message) || 'Não foi possível carregar as pesquisas de clima.' };
    }).then(function () { ctx.redesenhar(); });
  }

  function cabecalhoRodada(ctx, r) {
    var el = ctx.el;
    var aberta = r.status === 'aberta';
    return el('div', { classe: 'clima-rodada__cab' }, [
      el('div', null, [
        el('p', { classe: 'clima-rodada__nome seminegrito', texto: r.nome }),
        el('p', { classe: 'texto-suave t-rotulo tabular', texto: 'Aberta em ' + ctx.formatarData(r.abertaEm) + (r.encerradaEm ? ' · encerrada em ' + ctx.formatarData(r.encerradaEm) : '') +
          (r.complemento ? ' · complemento NR-1' + (r.n4 ? ' (com canal de escuta)' : ' (sem canal: sem a pergunta de tratamento ofensivo)') : '') })
      ]),
      el('div', { classe: 'clima-rodada__selos' }, [
        el('span', { classe: 'selo clima-selo-modo', 'data-modo': r.modo || 'anonima', texto: CL().MODOS_INFO[CL().modoValido(r.modo)].curto }),
        el('span', { classe: 'selo ' + (aberta ? 'selo--laranja' : 'selo--noite'), texto: aberta ? 'Aberta' : 'Encerrada' })
      ])
    ]);
  }

  function barraTaxa(el, n, d) {
    var p = pct(n, d);
    var feito = el('span', { classe: 'clima-barra__feito' });
    feito.style.width = p + '%';
    return el('span', { classe: 'clima-barra', role: 'img', 'aria-label': n + ' de ' + d + ' responderam (' + p + '%)' }, feito);
  }

  function cartaoAberta(ctx, r) {
    var el = ctx.el, botao = ctx.botao;
    var c = el('article', { classe: 'clima-rodada', 'data-rodada': r.id, 'data-status': 'aberta' }, [cabecalhoRodada(ctx, r)]);
    c.appendChild(el('p', { classe: 'clima-total clima-taxa-total tabular', texto: (r.respondentes || 0) + ' de ' + (r.convidados || 0) + ' convidados responderam (' + pct(r.respondentes, r.convidados) + '%)' }));
    var modo = CL().modoValido(r.modo);
    var comId = CL().comIdentificacao(modo);
    c.appendChild(el('p', { classe: 'texto-suave t-nota', texto: comId
      ? 'Só a contagem por equipe. ' + (r.identificadas || 0) + (r.identificadas === 1 ? ' resposta veio' : ' respostas vieram') + ' com identificação até agora (os nomes só na tela de uso interno). Os resultados aparecem depois do encerramento.'
      : 'Só a contagem por equipe: ninguém (nem a Gestão sem Caos) vê quem respondeu. Os resultados aparecem depois do encerramento.' }));
    c.appendChild(el('ul', { classe: 'clima-equipes' }, r.equipes.map(function (e) {
      var lEq = linkClima(ctx.href, e.tokenEquipe), lLi = linkClima(ctx.href, e.tokenLider);
      return el('li', { classe: 'clima-equipe', 'data-equipe': e.id }, [
        el('div', { classe: 'clima-equipe__topo' }, [
          el('span', { classe: 'seminegrito', texto: e.nome }),
          e.area ? el('span', { classe: 'texto-suave t-rotulo', texto: e.area }) : null,
          el('span', { classe: 'clima-equipe__taxa tabular', 'data-taxa': e.id, texto: (e.respondentes || 0) + ' de ' + e.convidados + ' (' + pct(e.respondentes, e.convidados) + '%)' }),
          barraTaxa(el, e.respondentes || 0, e.convidados)
        ]),
        modo === 'identificada' ? null : el('div', { classe: 'clima-links' }, [
          el('span', { classe: 't-rotulo texto-suave', texto: modo === 'opcional' ? 'Equipe (link coletivo e anônimo, para quem preferir)' : 'Equipe (link coletivo e anônimo)' }),
          el('code', { classe: 'av-link clima-link', 'data-link': 'equipe', texto: lEq }),
          botao('botao--claro botao--pequeno', 'Copiar link', function () { ctx.copiar(lEq, 'Link da equipe copiado.'); }, { 'data-acao': 'copiar-link-equipe' }),
          el('a', { classe: 'botao botao--claro botao--pequeno', href: ctx.linkWhatsApp(mensagemConvite(ctx.emp.nome, lEq, 'membro')), target: '_blank', rel: 'noopener', 'data-acao': 'whatsapp-equipe', texto: 'WhatsApp' })
        ]),
        el('div', { classe: 'clima-links' }, [
          el('span', { classe: 't-rotulo texto-suave', texto: 'Líder (só para quem lidera)' }),
          el('code', { classe: 'av-link clima-link', 'data-link': 'lider', texto: lLi }),
          botao('botao--claro botao--pequeno', 'Copiar link', function () { ctx.copiar(lLi, 'Link do líder copiado.'); }, { 'data-acao': 'copiar-link-lider' }),
          el('a', { classe: 'botao botao--claro botao--pequeno', href: ctx.linkWhatsApp(mensagemConvite(ctx.emp.nome, lLi, 'lider')), target: '_blank', rel: 'noopener', 'data-acao': 'whatsapp-lider', texto: 'WhatsApp' })
        ]),
        comId ? linksPessoais(ctx, r, e) : null
      ]);
    })));
    var avisos = avisosAberta(r).concat(comId ? avisosPessoais(r) : []);
    if (avisos.length) c.appendChild(el('ul', { classe: 'clima-avisos' }, avisos.map(function (t) { return el('li', { classe: 't-rotulo', texto: t }); })));
    c.appendChild(el('div', { classe: 'gestao-card__acoes' }, [
      comId ? botao('botao--claro', 'Identificação (uso interno)', function () { abrirIdentificacao(ctx, r); }, { 'data-acao': 'clima-uso-interno' }) : null,
      botao('botao--laranja', 'Encerrar pesquisa', function () {
        ctx.confirmar({ titulo: 'Encerrar a pesquisa?', texto: 'Ninguém mais consegue responder e as equipes ficam congeladas. O resultado é calculado agora, já com as regras de anonimato.',
          botao: 'Encerrar pesquisa', classeBotao: 'botao--principal', botaoVoltar: 'Continuar aberta' }).then(function (ok) {
          if (!ok) return;
          ctx.api('climaEncerrar', r.id).then(function (resp) {
            var est = cache[ctx.emp.id];
            if (est) est.resultados[r.id] = resp.resultado;
            delete cache[ctx.emp.id];
            ctx.avisar('Pesquisa encerrada. O resultado já está pronto.', 'ok');
            ctx.redesenhar();
          }).catch(ctx.falhou);
        });
      }, { 'data-acao': 'clima-encerrar' }),
      botao('botao--perigo botao--pequeno', 'Excluir pesquisa', function () { excluir(ctx, r); }, { 'data-acao': 'clima-excluir' })
    ]));
    return c;
  }

  function excluir(ctx, r) {
    ctx.confirmar({ titulo: 'Excluir a pesquisa?', texto: 'Apaga a pesquisa, as respostas e o relatório dela. Os links deixam de funcionar. Não dá para desfazer.', botao: 'Excluir pesquisa' })
      .then(function (ok) {
        if (!ok) return;
        ctx.api('climaExcluirRodada', r.id).then(function () { delete cache[ctx.emp.id]; ctx.avisar('Pesquisa excluída.', 'ok'); ctx.redesenhar(); }).catch(ctx.falhou);
      });
  }

  function cartaoEncerrada(ctx, r) {
    var el = ctx.el;
    var c = el('article', { classe: 'clima-rodada', 'data-rodada': r.id, 'data-status': 'encerrada' }, [cabecalhoRodada(ctx, r)]);
    var est = cache[ctx.emp.id];
    var res = est.resultados[r.id];
    if (res === undefined) {
      c.appendChild(el('p', { classe: 'texto-suave t-rotulo', texto: 'Carregando o resultado…' }));
      est.resultados[r.id] = null;
      ctx.api('climaResultado', r.id).then(function (resp) { est.resultados[r.id] = resp.resultado || {}; }, function (e) {
        if (e && e.tratado) return;
        est.resultados[r.id] = { erro: (e && e.message) || 'Não foi possível carregar o resultado.' };
      }).then(function () { ctx.redesenhar(); });
      return c;
    }
    if (res === null) { c.appendChild(el('p', { classe: 'texto-suave t-rotulo', texto: 'Carregando o resultado…' })); return c; }
    if (res.erro) { c.appendChild(el('p', { classe: 'aviso aviso--erro', texto: res.erro })); return c; }
    if (CL().comIdentificacao(r.modo)) {
      c.appendChild(el('div', { classe: 'gestao-card__acoes clima-acoes-interno' }, [
        ctx.botao('botao--claro', 'Respostas identificadas (uso interno)', function () { abrirIdentificacao(ctx, r); }, { 'data-acao': 'clima-uso-interno' }),
        el('span', { classe: 'texto-suave t-nota', texto: (r.identificadas || 0) + (r.identificadas === 1 ? ' resposta identificada' : ' respostas identificadas') +
          '. Só para a consultoria; o relatório da empresa não muda.' })
      ]));
    }
    resultadoHtml(ctx, c, r, res);
    return c;
  }

  // Links pessoais de uma equipe (modos com identificação): uso interno da consultoria; cada um vai só para a pessoa.
  function linksPessoais(ctx, r, e) {
    var el = ctx.el, botao = ctx.botao;
    var tel = {};
    (ctx.colabs || []).forEach(function (c) { tel[String(c.pessoaId)] = c.telefone || ''; });
    var convites = e.convites || [];
    var info = CL().METODOS_INFO;
    return el('details', { classe: 'clima-pessoais', 'data-pessoais': e.id }, [
      el('summary', { classe: 't-rotulo seminegrito', texto: 'Links pessoais (' + convites.length + ') · uso interno da consultoria' }),
      el('p', { classe: 'texto-suave t-nota', texto: 'Um link por pessoa, de uso único. Mande cada um só para a própria pessoa (o botão WhatsApp abre a conversa com o número do cadastro).' }),
      el('ul', { classe: 'clima-pessoais__lista' }, convites.map(function (cv) {
        var link = linkClima(ctx.href, cv.token);
        var msg = mensagemPessoal(ctx.emp.nome, cv.nome, link, r.modo);
        var wa = ctx.linkWhatsAppPara ? ctx.linkWhatsAppPara(tel[String(cv.pessoaId)], msg) : ctx.linkWhatsApp(msg);
        return el('li', { classe: 'clima-pessoal', 'data-convite': cv.id }, [
          el('div', { classe: 'clima-pessoal__quem' }, [
            el('span', { classe: 'seminegrito clima-pessoal__nome', texto: cv.nome }),
            el('span', { classe: 'clima-pessoal__metodos t-nota texto-suave', texto: (cv.metodos || []).length
              ? 'Confirma por: ' + cv.metodos.map(function (m) { return info[m] ? info[m].curto : m; }).join(' ou ') : 'Sem forma de confirmação: só o link' })
          ]),
          el('code', { classe: 'av-link clima-link', 'data-link': 'pessoal', texto: link }),
          el('div', { classe: 'clima-pessoal__acoes' }, [
          botao('botao--claro botao--pequeno', 'Copiar link', function () { ctx.copiar(link, 'Link pessoal copiado.'); }, { 'data-acao': 'copiar-link-pessoal' }),
          el('a', { classe: 'botao botao--claro botao--pequeno', href: wa, target: '_blank', rel: 'noopener', 'data-acao': 'whatsapp-pessoal', texto: 'WhatsApp' }),
          botao('botao--claro botao--pequeno', 'Novo link', function () {
            ctx.confirmar({ titulo: 'Gerar um novo link para ' + cv.nome + '?', texto: 'O link atual deixa de funcionar (use se ele foi perdido, encaminhado por engano ou bloqueado por tentativas). Só vale para quem ainda não respondeu com identificação.',
              botao: 'Gerar novo link', classeBotao: 'botao--principal', botaoVoltar: 'Voltar' }).then(function (ok) {
              if (!ok) return;
              ctx.api('climaRenovarConvite', cv.id).then(function () { delete cache[ctx.emp.id]; ctx.avisar('Novo link gerado. Envie de novo para a pessoa.', 'ok'); ctx.redesenhar(); }).catch(ctx.falhou);
            });
          }, { 'data-acao': 'renovar-link-pessoal' })
          ])
        ]);
      }))
    ]);
  }

  var ROTULO_ACESSO = { abrir: 'abriu esta tela', desidentificar: 'tirou o nome de uma resposta' };
  var ROTULO_N4 = { 0: 'Prefiro não responder', 1: 'Nunca', 2: 'Uma ou duas vezes', 3: 'Três vezes ou mais' };

  // Tela "Uso interno da consultoria": cada abertura fica registrada no servidor (quem e quando).
  function abrirIdentificacao(ctx, r) {
    var el = ctx.el;
    var C = CL();
    ctx.api('climaIdentificacao', r.id).then(function (d) {
      var ultimo = (d.acessos || [])[0];
      var corpo = [el('p', { classe: 'clima-interno-aviso', 'data-uso-interno': '1' }, [
        el('strong', { texto: 'Uso interno da consultoria. ' }),
        'Só administradores da Gestão sem Caos. Não mostre, não copie e não envie à empresa: ela só recebe resultados de grupo.' +
        (ultimo ? ' Este acesso ficou registrado: ' + (ultimo.nome || 'administrador') + ' em ' + ctx.formatarData(ultimo.em) + '.' : '')
      ])];
      if (!d.respostasDisponiveis) {
        corpo.push(el('p', { classe: 'texto-suave t-rotulo', texto: d.motivo === 'apagadas'
          ? 'As respostas brutas e as identificações já foram apagadas (retenção).'
          : 'As respostas identificadas aparecem depois do encerramento. Por enquanto, só quem já respondeu com identificação (para lembrar quem falta).' }));
        if ((d.convites || []).length) {
          corpo.push(el('table', { classe: 'clima-quadro clima-quadro--pessoais' }, [
            el('thead', null, el('tr', null, ['Pessoa', 'Equipe', 'Confirmação', 'Situação'].map(function (t) { return el('th', { scope: 'col', texto: t }); }))),
            el('tbody', null, d.convites.map(function (cv) {
              return el('tr', { 'data-convite': cv.id }, [
                el('th', { scope: 'row', texto: cv.nome }), el('td', { texto: cv.equipeNome }),
                el('td', { texto: (cv.metodos || []).length ? cv.metodos.map(function (m) { return C.METODOS_INFO[m].curto; }).join(', ') : 'só o link' }),
                el('td', { texto: cv.usado ? 'Resposta identificada' : (d.rodada.modo === 'opcional' ? 'Sem resposta identificada' : 'Ainda não respondeu') })
              ]);
            }))
          ]));
        }
      } else if (!(d.respostas || []).length) {
        corpo.push(el('p', { classe: 'texto-suave t-rotulo', texto: 'Nenhuma resposta veio com identificação.' }));
      } else {
        corpo.push(el('div', { classe: 'clima-identificadas' }, d.respostas.map(function (x) {
          var dims = C.DIMENSOES.map(function (dim) {
            var v = x.escores ? x.escores[dim] : null;
            return el('tr', null, [el('th', { scope: 'row', texto: C.bloco(dim).nome }), el('td', { classe: 'tabular', texto: v === null || v === undefined ? '—' : String(v) })]);
          });
          dims.push(el('tr', null, [el('th', { scope: 'row', texto: 'Entrega da equipe (1 pergunta)' }), el('td', { classe: 'tabular', texto: x.escores && x.escores.H1 !== null && x.escores.H1 !== undefined ? String(x.escores.H1) : '—' })]));
          var comp = Object.keys(x.complemento || {});
          var cartao = el('article', { classe: 'clima-identificada', 'data-resposta': x.respostaId }, [
            el('p', { classe: 'seminegrito', texto: x.nome }),
            el('p', { classe: 'texto-suave t-nota', texto: x.equipeNome + ' · confirmou por ' + (C.METODOS_INFO[x.confirmadoPor] ? C.METODOS_INFO[x.confirmadoPor].curto : x.confirmadoPor) }),
            el('table', { classe: 'clima-quadro clima-quadro--pessoa' }, [el('thead', null, el('tr', null, [el('th', { scope: 'col', texto: 'Tema' }), el('th', { scope: 'col', texto: '0 a 100' })])), el('tbody', null, dims)]),
            comp.length ? el('p', { classe: 't-nota clima-identificada__compl', texto: 'Condições de trabalho: ' + comp.map(function (k) {
              var it = C.ITENS_N.filter(function (n) { return n.id === k; })[0];
              var v = x.complemento[k];
              return (it ? it.nome : k) + ': ' + (k === 'N4' ? (ROTULO_N4[v] || v) : (C.ESCALA[v - 1] ? C.ESCALA[v - 1].rotulo : v));
            }).join(' · ') }) : null,
            x.comentario ? el('p', { classe: 't-rotulo clima-identificada__comentario', texto: 'Comentário: ' + x.comentario }) : null,
            ctx.botao('botao--perigo botao--pequeno', 'Tirar o nome desta resposta', function () {
              ctx.confirmar({ titulo: 'Tirar o nome desta resposta?', texto: 'Use quando a pessoa pedir. A resposta continua nos resultados de grupo, sem nome. Não dá para desfazer.',
                botao: 'Tirar o nome' }).then(function (ok) {
                if (!ok) return;
                ctx.api('climaDesidentificar', r.id, x.respostaId).then(function () {
                  if (cartao.parentNode) cartao.parentNode.removeChild(cartao);
                  delete cache[ctx.emp.id];
                  ctx.avisar('Nome tirado da resposta.', 'ok');
                }).catch(ctx.falhou);
              });
            }, { 'data-acao': 'clima-desidentificar' })
          ]);
          return cartao;
        })));
      }
      corpo.push(el('h4', { classe: 'clima-sub', texto: 'Acessos registrados' }));
      corpo.push(el('ul', { classe: 'clima-acessos' }, (d.acessos || []).map(function (a) {
        return el('li', { classe: 't-nota tabular', texto: (a.nome || 'administrador') + ' ' + (ROTULO_ACESSO[a.acao] || a.acao) + ' em ' + ctx.formatarData(a.em) });
      })));
      ctx.abrirJanela({ id: 'janela-clima-identificacao', titulo: 'Uso interno da consultoria', botao: 'Fechar',
        texto: r.nome + ' · ' + C.MODOS_INFO[C.modoValido(r.modo)].rotulo, corpo: corpo, aoConfirmar: function () { return true; } });
    }).catch(ctx.falhou);
  }

  function celulaDim(el, d) {
    if (!d) return el('td', { classe: 'clima-cel clima-cel--vazia', texto: '—', title: 'Não aparece (mínimo de respostas ou proteção do anonimato)' });
    var c = CL();
    return el('td', { classe: 'clima-cel clima-cel--' + d.faixa, title: c.rotuloFaixa(d.faixa) + (d.alinhamento ? ' · ' + c.rotuloAlinhamento(d.alinhamento) : '') + ' · ' + d.n + ' respostas' }, [
      el('strong', { classe: 'tabular', texto: String(d.escore) }),
      el('span', { classe: 'clima-cel__faixa', texto: c.rotuloFaixa(d.faixa) }),
      d.alinhamento ? el('span', { classe: 'clima-cel__alinh', texto: c.rotuloAlinhamento(d.alinhamento) }) : null
    ]);
  }

  function resultadoHtml(ctx, c, r, res) {
    var el = ctx.el, botao = ctx.botao;
    var C = CL();
    c.appendChild(el('p', { classe: 'clima-total tabular', texto: res.respondentes + ' de ' + res.convidados + ' convidados responderam (' + res.taxa + '%)' }));
    if (res.suprimido) {
      c.appendChild(el('p', { classe: 'aviso clima-suprimido', texto: 'Menos de 5 respostas no total: nenhum resultado pode aparecer (anonimato). Ofereça uma conversa facilitada pela consultoria.' }));
    }
    // Situação de cada equipe (avisos de mínimo e de complemento).
    c.appendChild(el('h4', { classe: 'clima-sub', texto: 'Equipes' }));
    c.appendChild(el('ul', { classe: 'clima-situacoes' }, (res.equipes || []).map(function (e) {
      return el('li', { classe: 'clima-situacao clima-situacao--' + e.situacao, 'data-equipe': e.id, 'data-situacao': e.situacao }, [
        el('span', { classe: 'seminegrito', texto: e.nome }),
        el('span', { classe: 'texto-suave t-rotulo tabular', texto: e.respondentes + ' de ' + e.convidados }),
        el('span', { classe: 't-rotulo clima-situacao__texto', texto: textoSituacao(e, res.grupos) })
      ]);
    })));
    if (!res.suprimido) {
      // Quadro: temas × grupos que aparecem (ordem do organograma; sem ranking).
      var grupos = res.grupos || [];
      c.appendChild(el('h4', { classe: 'clima-sub', texto: 'Resultado por tema (0 a 100)' }));
      c.appendChild(el('p', { classe: 'texto-suave t-nota', texto: C.TEXTOS.faixas }));
      var cab = el('tr', null, [el('th', { scope: 'col', texto: 'Tema' })].concat(grupos.map(function (g) {
        return el('th', { scope: 'col', texto: (g.tipo === 'empresa' ? 'Toda a empresa' : g.nome) + ' (' + g.n + ')' });
      })));
      var linhas = C.DIMENSOES.map(function (d) {
        return el('tr', { 'data-dim': d }, [el('th', { scope: 'row', texto: C.bloco(d).nome })].concat(grupos.map(function (g) { return celulaDim(el, g.dimensoes[d]); })));
      });
      linhas.push(el('tr', { 'data-dim': 'H1' }, [el('th', { scope: 'row', texto: 'Entrega da equipe (1 pergunta)' })].concat(grupos.map(function (g) { return celulaDim(el, g.h1); }))));
      c.appendChild(el('div', { classe: 'clima-quadro-rolagem' }, el('table', { classe: 'clima-quadro clima-quadro--temas' }, [el('thead', null, cab), el('tbody', null, linhas)])));
      // Visão líder × equipe (só consultor e o próprio líder).
      if ((res.lideres || []).length) {
        c.appendChild(el('h4', { classe: 'clima-sub', texto: 'Visão do líder × equipe (só para o consultor e o próprio líder)' }));
        res.lideres.forEach(function (l) {
          var g = grupos.filter(function (x) { return x.id === l.equipeId; })[0];
          if (!g) return;
          c.appendChild(el('table', { classe: 'clima-quadro clima-quadro--lider', 'data-lider': l.equipeId }, [
            el('thead', null, el('tr', null, [el('th', { scope: 'col', texto: g.nome }), el('th', { scope: 'col', texto: 'Equipe' }), el('th', { scope: 'col', texto: 'Líder' })])),
            el('tbody', null, C.DIMENSOES.filter(function (d) { return d !== 'G'; }).map(function (d) {
              var eq = g.dimensoes[d];
              return el('tr', null, [el('th', { scope: 'row', texto: C.bloco(d).nome + (d === 'F' ? ' (líder: autopercepção)' : '') }),
                el('td', { classe: 'tabular', texto: eq ? String(eq.escore) : '—' }), el('td', { classe: 'tabular', texto: l.dimensoes[d] === null ? '—' : String(l.dimensoes[d]) })]);
            }))
          ]));
        });
        c.appendChild(el('p', { classe: 'texto-suave t-nota', texto: 'Serve para o desenvolvimento do líder; não pode ser usada em avaliação de desempenho, bônus ou ranking de líderes. Não vai para o relatório da empresa.' }));
      } else if (res.lideresApagados) {
        c.appendChild(el('p', { classe: 'texto-suave t-nota', texto: 'A visão individual dos líderes foi apagada junto com as respostas brutas (retenção).' }));
      }
      // Complemento.
      if (res.complemento && res.complemento.ligado) {
        var ce = (res.complemento.grupos || [])[0];
        var partes = C.N_INDICADORES.map(function (id) { var x = ce && ce.itens[id]; return id + ' ' + (x ? x.escore : '—'); });
        c.appendChild(el('p', { classe: 't-rotulo clima-res-complemento', texto: 'Fatores psicossociais (toda a empresa, mínimo de 10): ' + partes.join(' · ') +
          (res.complemento.n4 ? ' · relatos de tratamento ofensivo: ' + res.complemento.n4.pct + '% de ' + res.complemento.n4.n : (res.complemento.n4Ligado ? ' · tratamento ofensivo: menos de 10 respostas' : '')) }));
      }
    }
    var q = res.qualidade || {};
    c.appendChild(el('p', { classe: 'texto-suave t-nota', texto: 'Qualidade (só para análise, nada sai do relatório): ' + (q.rapidas || 0) + ' resposta(s) rápidas demais · ' + (q.linhaReta || 0) + ' em "linha reta".' }));

    // Comentários e relatório.
    var com = res.comentarios || {};
    var temas = el('textarea', { id: 'clima-temas-' + r.id, classe: 'entrada clima-temas', rows: '4', placeholder: 'Um tema por linha. Escreva com as suas palavras, sem trechos literais e sem nomes.' });
    var digitados = cache[ctx.emp.id].temas && cache[ctx.emp.id].temas[r.id];
    // Sem nada digitado nesta tela, começa com os temas do relatório já gerado (para não perdê-los ao atualizar).
    temas.value = typeof digitados === 'string' ? digitados : ((r.relatorio && r.relatorio.temas) || []).join('\n');
    temas.addEventListener('input', function () { var e = cache[ctx.emp.id]; e.temas = e.temas || {}; e.temas[r.id] = temas.value; });
    function listaTemas() { return temas.value.split(/\n+/).map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 6); }
    c.appendChild(el('h4', { classe: 'clima-sub', texto: 'Comentários e relatório' }));
    if (r.brutasApagadasEm) c.appendChild(el('p', { classe: 'texto-suave t-rotulo', texto: 'Respostas brutas apagadas em ' + ctx.formatarData(r.brutasApagadasEm) + ' (retenção).' }));
    if (com.disponivel && !r.brutasApagadasEm) {
      c.appendChild(el('div', { classe: 'gestao-card__acoes' }, [
        el('span', { classe: 't-rotulo', texto: com.quantidade + ' comentário' + (com.quantidade === 1 ? '' : 's') + '.' }),
        botao('botao--claro botao--pequeno', 'Ler comentários', function () { lerComentarios(ctx, r); }, { 'data-acao': 'clima-comentarios', disabled: com.quantidade ? null : true })
      ]));
    } else if (!com.disponivel) {
      c.appendChild(el('p', { classe: 'texto-suave t-rotulo', texto: 'Comentários e temas só com 10 ou mais respostas no total.' }));
    }
    if (com.disponivel) {
      c.appendChild(el('label', { classe: 'campo', for: temas.id }, [el('span', { classe: 'campo__rotulo', texto: 'Temas dos comentários para o relatório (até 6)' }), temas]));
    }
    var rel = r.relatorio;
    function gerar(publicar, msg) {
      var guardados = (cache[ctx.emp.id] && cache[ctx.emp.id].temas) || null;
      return ctx.api('climaGerarRelatorio', r.id, { publicar: publicar, consultor: ctx.consultor, temas: listaTemas() }).then(function () {
        ctx.avisar(msg, 'ok');
        carregarDepois(ctx, guardados);   // relê a lista (status e link do relatório), mantendo os temas digitados
      }).catch(ctx.falhou);
    }
    var url = rel && rel.status === 'publicado' ? (rel.url || linkRelatorio(ctx.href, rel.token)) : '';
    c.appendChild(el('div', { classe: 'gestao-card__acoes clima-acoes-relatorio' }, [
      botao('botao--claro', 'Abrir prévia em nova aba', function () { ctx.abrirPrevia(snapshotPrevia(r, res, ctx.emp, listaTemas(), ctx.consultor)); }, { 'data-acao': 'clima-previa' }),
      res.suprimido ? null : botao(url ? 'botao--claro' : 'botao--laranja', url ? 'Atualizar relatório publicado' : 'Publicar relatório', function () {
        gerar(true, url ? 'Relatório atualizado.' : 'Relatório publicado. Copie o link para enviar.');
      }, { 'data-acao': 'clima-publicar' }),
      url ? el('code', { classe: 'av-link clima-link clima-link-relatorio', texto: url }) : null,
      url ? botao('botao--claro botao--pequeno', 'Copiar link', function () { ctx.copiar(url, 'Link do relatório copiado.'); }, { 'data-acao': 'clima-copiar-relatorio' }) : null,
      url ? el('a', { classe: 'botao botao--claro botao--pequeno', href: ctx.linkWhatsApp('Olá! Segue o relatório da Pesquisa de Clima da Equipe da ' + ctx.emp.nome + ', preparado pela Gestão sem Caos:\n' + url), target: '_blank', rel: 'noopener', texto: 'WhatsApp' }) : null,
      url ? el('a', { classe: 'botao botao--claro botao--pequeno', href: url, target: '_blank', rel: 'noopener', 'data-acao': 'clima-abrir-relatorio', texto: 'Abrir' }) : null,
      url ? botao('botao--claro botao--pequeno', 'Despublicar', function () { gerar(false, 'Relatório voltou para rascunho: o link não abre mais.'); }, { 'data-acao': 'clima-despublicar' }) : null
    ]));
    c.appendChild(el('div', { classe: 'gestao-card__acoes' }, [
      r.brutasApagadasEm ? null : botao('botao--claro botao--pequeno', 'Apagar respostas brutas agora', function () {
        ctx.confirmar({ titulo: 'Apagar as respostas brutas?', texto: 'Ficam só os números de grupo (com 5 ou mais respostas). Os comentários e a visão individual dos líderes são apagados. Não dá para desfazer.',
          botao: 'Apagar respostas' }).then(function (ok) {
          if (!ok) return;
          ctx.api('climaApagarBrutas', { rodadaId: r.id, agora: true }).then(function () { delete cache[ctx.emp.id]; ctx.avisar('Respostas brutas apagadas.', 'ok'); ctx.redesenhar(); }).catch(ctx.falhou);
        });
      }, { 'data-acao': 'clima-apagar-brutas' }),
      el('span', { classe: 'texto-suave t-nota', texto: r.brutasApagadasEm ? '' : 'Retenção: apagar até ' + r.retencaoDias + ' dias depois da entrega' + (r.entregueEm ? ' (entregue em ' + ctx.formatarData(r.entregueEm) + ')' : '') + '.' }),
      botao('botao--perigo botao--pequeno', 'Excluir pesquisa', function () { excluir(ctx, r); }, { 'data-acao': 'clima-excluir' })
    ]));
  }

  function carregarDepois(ctx, temas) {
    var id = ctx.emp.id;
    ctx.api('climaListar', id).then(function (resp) {
      cache[id] = { rodadas: resp.rodadas || [], resultados: {}, temas: temas };
    }, function () { /* a próxima abertura recarrega */ }).then(function () { ctx.redesenhar(); });
  }

  function linkRelatorio(href, token) {
    var base = String(href || '').split('#')[0].split('?')[0].replace(/[^/]*$/, '');
    return base + 'relatorio.html?r=' + encodeURIComponent(String(token || ''));
  }

  function lerComentarios(ctx, r) {
    var el = ctx.el;
    ctx.api('climaComentarios', r.id).then(function (resp) {
      var lista = resp.comentarios || [];
      ctx.abrirJanela({ id: 'janela-clima-comentarios', titulo: 'Comentários (texto bruto)', botao: 'Fechar',
        texto: 'Só para o consultor escrever os temas. Não copie, não exporte e não mande trechos literais ao cliente. Em ordem aleatória, sem equipe.',
        corpo: [lista.length ? el('ol', { classe: 'clima-comentarios' }, lista.map(function (t) { return el('li', { classe: 't-rotulo', texto: t }); }))
          : el('p', { classe: 'texto-suave', texto: resp.apagados ? 'As respostas brutas já foram apagadas.' : 'Nenhum comentário.' })],
        aoConfirmar: function () { return true; } });
    }).catch(ctx.falhou);
  }

  function janelaNova(ctx, lideres) {
    var el = ctx.el;
    var agora = new Date();
    var nome = el('input', { id: 'clima-nome', classe: 'entrada', type: 'text', maxlength: '120', autocomplete: 'off',
      value: 'Pesquisa de clima · ' + ('0' + (agora.getMonth() + 1)).slice(-2) + '/' + agora.getFullYear() });
    var total = el('p', { classe: 't-rotulo seminegrito tabular', id: 'clima-total-convidados' });
    var linhas = lideres.map(function (l, i) {
      var marca = el('input', { type: 'checkbox', id: 'clima-eq-' + i, checked: true, 'data-lider': l.pessoaId });
      var conv = el('input', { type: 'number', classe: 'entrada clima-conv', id: 'clima-conv-' + i, min: String(l.liderados), max: '500', value: String(l.liderados),
        'aria-label': 'Pessoas convidadas na equipe de ' + l.nome, 'data-lider': l.pessoaId });
      marca.addEventListener('change', atualizar);
      conv.addEventListener('input', atualizar);
      return { l: l, marca: marca, conv: conv, no: el('li', { classe: 'clima-escolha' }, [
        el('label', { classe: 'marcar', for: marca.id }, [marca, el('span', null, [el('strong', { texto: 'Equipe de ' + CL().nomeCurto(l.nome) }),
          el('span', { classe: 'texto-suave', texto: ' · ' + (l.area || 'sem área') + ' · ' + l.liderados + ' liderado' + (l.liderados === 1 ? '' : 's') + ' no organograma' })])]),
        el('label', { classe: 'clima-conv-campo', for: conv.id }, [el('span', { classe: 't-rotulo texto-suave', texto: 'Convidados' }), conv])
      ]) };
    });
    // Modo de identificação (travado depois de criada) e formas de confirmação.
    var C = CL();
    var envios = (cache[ctx.emp.id] && cache[ctx.emp.id].envios) || { email: false, whatsapp: false };
    var modos = C.MODOS.map(function (m) {
      var info = C.MODOS_INFO[m];
      var radio = el('input', { type: 'radio', name: 'clima-modo', id: 'clima-modo-' + m, value: m, checked: m === 'anonima' });
      radio.addEventListener('change', atualizarModo);
      return { m: m, radio: radio, no: el('label', { classe: 'clima-modo', for: radio.id, 'data-modo': m }, [radio, el('span', null, [
        el('strong', { texto: info.rotulo + (info.recomendado ? ' (recomendado)' : '') }), el('span', { classe: 'clima-modo__texto', texto: info.texto })])]) };
    });
    var alerta = el('p', { classe: 'clima-alerta-modo', id: 'clima-alerta-modo', role: 'note', hidden: true, texto: C.ALERTA_IDENTIFICACAO });
    function metodoCheck(m, ligado, rotulo, ajuda) {
      var ck = el('input', { type: 'checkbox', id: 'clima-metodo-' + m, 'data-metodo': m, checked: ligado ? true : null, disabled: ligado ? null : true });
      return { m: m, ck: ck, no: el('label', { classe: 'marcar clima-metodo', for: ck.id }, [ck, el('span', null, [el('strong', { texto: rotulo }), ajuda ? el('span', { classe: 'texto-suave t-nota', texto: ' ' + ajuda }) : null])]) };
    }
    var metodosUi = [metodoCheck('email', envios.email, 'Código de 6 números por e-mail', envios.email ? 'Para quem tem e-mail no cadastro.'
      : 'O envio de e-mail não está configurado (veja Conexões); por enquanto esta forma fica desligada.')];
    if (envios.whatsapp) metodosUi.push(metodoCheck('whatsapp', true, 'Código de 6 números pelo WhatsApp', 'Para o número do cadastro.'));
    metodosUi.push(metodoCheck('dados', true, '3 últimos dígitos do CPF + dia e mês de nascimento', 'Informados pela empresa em cada colaborador (Editar colaborador); guardados só como código, nunca o número.'));
    var blocoMetodos = el('div', { classe: 'clima-metodos', id: 'clima-metodos', hidden: true }, [
      el('span', { classe: 'campo__rotulo', texto: 'Como cada pessoa confirma que é ela' }),
      el('div', { classe: 'clima-metodos__lista' }, metodosUi.map(function (x) { return x.no; })),
      el('span', { classe: 'campo__ajuda', texto: 'Quem não tiver nenhuma dessas formas responde só com o link pessoal (de uso único). Fraco contra quem já conhece a pessoa: é uma barreira contra troca casual.' })
    ]);
    function modoEscolhido() { var x = modos.filter(function (y) { return y.radio.checked; })[0]; return x ? x.m : 'anonima'; }
    function atualizarModo() {
      var m = modoEscolhido();
      alerta.hidden = m === 'anonima';
      blocoMetodos.hidden = m === 'anonima';
      linhas.forEach(function (x) {
        if (m === 'identificada') { x.conv.value = String(x.l.liderados); x.conv.disabled = true; }
        else x.conv.disabled = false;
      });
      notaIdentificada.hidden = m !== 'identificada';
      atualizar();
    }
    var notaIdentificada = el('p', { classe: 'texto-suave t-nota', id: 'clima-nota-identificada', hidden: true,
      texto: 'Na pesquisa identificada só responde quem está no cadastro: cada liderado direto recebe um link pessoal (sem link coletivo).' });
    var compl = el('input', { type: 'checkbox', id: 'clima-complemento' });
    var canal = el('input', { id: 'clima-canal', classe: 'entrada', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Ex.: o RH da empresa pelo canal de escuta' });
    var url = el('input', { id: 'clima-canal-url', classe: 'entrada', type: 'text', maxlength: '300', autocomplete: 'off', placeholder: 'https://… ou mailto:… (opcional)' });
    var contato = el('input', { id: 'clima-contato', classe: 'entrada', type: 'text', maxlength: '200', autocomplete: 'off', placeholder: 'Ex.: rh@empresa.com.br (opcional)' });
    var ret = el('input', { id: 'clima-retencao', classe: 'entrada clima-conv', type: 'number', min: '30', max: '365', value: '90' });
    var blocoCanal = el('div', { classe: 'clima-canal-campos', hidden: true }, [
      el('label', { classe: 'campo', for: canal.id }, [el('span', { classe: 'campo__rotulo', texto: 'Canal de escuta ou denúncia da empresa' }), canal,
        el('span', { classe: 'campo__ajuda', texto: 'Sem canal informado, a pergunta sobre tratamento ofensivo (N4) não entra. O texto aparece logo depois dela.' })]),
      el('label', { classe: 'campo', for: url.id }, [el('span', { classe: 'campo__rotulo', texto: 'Link do canal (opcional)' }), url])
    ]);
    compl.addEventListener('change', function () { blocoCanal.hidden = !compl.checked; });
    function escolhidas() {
      return linhas.filter(function (x) { return x.marca.checked; }).map(function (x) {
        var n = Number(x.conv.value);
        return { liderId: x.l.pessoaId, convidados: isFinite(n) && n > 0 ? Math.floor(n) : x.l.liderados };
      });
    }
    function atualizar() {
      var t = 0;
      escolhidas().forEach(function (e) { t += e.convidados; });
      total.textContent = 'Total de convidados: ' + t + (t < K ? ' (mínimo 5: com menos, ninguém teria anonimato)' : '');
    }
    atualizar();
    ctx.abrirJanela({ id: 'janela-clima-nova', titulo: 'Nova pesquisa de clima', botao: 'Criar e gerar os links',
      texto: 'Cada líder com quem ele lidera direto vira uma equipe. Convidados = liderados no organograma; aumente se a equipe tiver gente que ainda não está no cadastro.',
      corpo: [
        el('label', { classe: 'campo', for: nome.id }, [el('span', { classe: 'campo__rotulo', texto: 'Nome da pesquisa' }), nome]),
        el('fieldset', { classe: 'campo clima-modos', id: 'clima-modos' }, [
          el('legend', { classe: 'campo__rotulo', texto: 'Como as pessoas respondem' }),
          el('div', { classe: 'clima-modos__lista' }, modos.map(function (x) { return x.no; })),
          alerta,
          el('span', { classe: 'campo__ajuda', texto: 'Em todos os modos a empresa só vê resultados de grupo (mínimo de 5; detalhes com 10) e nunca nomes. O modo não muda depois de criada.' })
        ]),
        blocoMetodos,
        el('div', { classe: 'campo' }, [el('span', { classe: 'campo__rotulo', texto: 'Equipes do organograma' }), el('ul', { classe: 'clima-escolhas', id: 'clima-escolhas' }, linhas.map(function (x) { return x.no; })), notaIdentificada, total]),
        el('label', { classe: 'marcar', for: compl.id }, [compl, el('span', { texto: 'Incluir o complemento "Pesquisa de Fatores Psicossociais do Trabalho (apoio ao GRO)": 5 perguntas a mais, mostradas só no total da empresa ou da área, com 10 ou mais respostas.' })]),
        blocoCanal,
        el('label', { classe: 'campo', for: contato.id }, [el('span', { classe: 'campo__rotulo', texto: 'Contato da empresa para dúvidas sobre dados (opcional)' }), contato]),
        el('label', { classe: 'campo', for: ret.id }, [el('span', { classe: 'campo__rotulo', texto: 'Apagar as respostas brutas quantos dias depois da entrega' }), ret,
          el('span', { classe: 'campo__ajuda', texto: 'Padrão 90 dias (de 30 a 365). Depois disso ficam só os números de grupo.' })])
      ],
      aoConfirmar: function () {
        var eqs = escolhidas();
        if (!eqs.length) throw new Error('Escolha pelo menos uma equipe do organograma.');
        var r = Number(ret.value);
        var modoNovo = modoEscolhido();
        var metodosNovos = modoNovo === 'anonima' ? [] : metodosUi.filter(function (x) { return x.ck.checked && !x.ck.disabled; }).map(function (x) { return x.m; });
        return ctx.api('climaCriarRodada', { empresaId: ctx.emp.id, nome: nome.value.trim(), equipes: eqs, complemento: compl.checked,
          canalTexto: compl.checked ? canal.value.trim() : '', canalUrl: compl.checked ? url.value.trim() : '', contatoDados: contato.value.trim(),
          retencaoDias: isFinite(r) ? Math.floor(r) : 90, modo: modoNovo, metodos: metodosNovos }).then(function () {
          delete cache[ctx.emp.id];
          ctx.avisar(modoNovo === 'anonima' ? 'Pesquisa criada. Envie o link de cada equipe e o link de cada líder.'
            : 'Pesquisa criada. Envie a cada pessoa o link pessoal dela e o link de cada líder.', 'ok');
          ctx.redesenhar();
        });
      } });
  }

  // E-mail (para o código) e CPF/data (só hash com sal no servidor) do colaborador. ctx = {el, api, empresaId, pessoaId}.
  function camposColaborador(ctx) {
    var el = ctx.el;
    var email = el('input', { id: 'colab-email-clima', classe: 'entrada', type: 'email', maxlength: '120', autocomplete: 'off', placeholder: 'nome@empresa.com.br' });
    var cpf = el('input', { id: 'colab-cpf3', classe: 'entrada clima-conv', type: 'text', inputmode: 'numeric', maxlength: '3', autocomplete: 'off', placeholder: '000' });
    var nasc = el('input', { id: 'colab-nascimento', classe: 'entrada clima-conv', type: 'text', inputmode: 'numeric', maxlength: '5', autocomplete: 'off', placeholder: 'DD/MM' });
    var apagar = el('input', { type: 'checkbox', id: 'colab-conf-apagar' });
    var situacao = el('p', { classe: 'texto-suave t-nota', id: 'colab-conf-situacao', texto: 'Carregando…' });
    var linhaApagar = el('label', { classe: 'marcar', for: apagar.id, hidden: true }, [apagar, el('span', { texto: 'Apagar os dados de confirmação cadastrados' })]);
    var emailOriginal = null;
    cpf.addEventListener('input', function () { cpf.value = cpf.value.replace(/\D/g, '').slice(0, 3); });
    nasc.addEventListener('input', function () { var d = nasc.value.replace(/\D/g, '').slice(0, 4); nasc.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d; });
    Promise.resolve().then(function () { return ctx.api('climaColaboradoresDados', ctx.empresaId); }).then(function (r) {
      var p = (r.pessoas || []).filter(function (x) { return String(x.pessoaId) === String(ctx.pessoaId); })[0] || { email: '', conferencia: false };
      emailOriginal = p.email || '';
      if (!email.value) email.value = emailOriginal;
      situacao.textContent = p.conferencia ? 'CPF e data já cadastrados (guardados só como código). Preencha de novo para trocar.' : 'Nenhum CPF/data cadastrado.';
      linhaApagar.hidden = !p.conferencia;
    }, function () { situacao.textContent = 'Não foi possível ver o que já está cadastrado.'; });
    var no = el('fieldset', { classe: 'form-secao clima-conf', id: 'colab-clima-conf' }, [
      el('legend', { classe: 'campo__rotulo', texto: 'Pesquisa de clima com identificação (opcional)' }),
      el('p', { classe: 'texto-suave t-nota', texto: 'Servem só para a pessoa confirmar que é ela no link pessoal da pesquisa de clima. O CPF e a data viram um código (hash) no servidor, nunca ficam guardados como número, e são apagados junto com as respostas da pesquisa.' }),
      el('label', { classe: 'campo', for: email.id }, [el('span', { classe: 'campo__rotulo', texto: 'E-mail (para o código de confirmação)' }), email]),
      el('div', { classe: 'form-grade' }, [
        el('label', { classe: 'campo', for: cpf.id }, [el('span', { classe: 'campo__rotulo', texto: '3 últimos dígitos do CPF' }), cpf]),
        el('label', { classe: 'campo', for: nasc.id }, [el('span', { classe: 'campo__rotulo', texto: 'Dia e mês de nascimento' }), nasc])
      ]),
      situacao,
      linhaApagar
    ]);
    function salvar() {
      var d = { empresaId: ctx.empresaId, pessoaId: ctx.pessoaId };
      var mudou = false;
      if (emailOriginal !== null && email.value.trim().toLowerCase() !== emailOriginal) { d.email = email.value.trim(); mudou = true; }
      if (apagar.checked) { d.apagarConferencia = true; mudou = true; }
      else if (cpf.value || nasc.value) {
        var n = CL().normalizarConferencia(cpf.value, nasc.value);
        if (!n.ok) return Promise.reject(new Error(n.erro));
        d.cpf3 = cpf.value; d.nascimento = nasc.value; mudou = true;
      }
      if (!mudou) return Promise.resolve({ ok: true, semMudanca: true });
      return ctx.api('climaSalvarColaborador', d);
    }
    return { no: no, salvar: salvar };
  }

  function esquecer(empresaId) { if (empresaId) delete cache[empresaId]; else cache = {}; }

  var DISC_ADMIN_CLIMA = { linkClima: linkClima, lideresDoOrganograma: lideresDoOrganograma, mensagemConvite: mensagemConvite,
    mensagemPessoal: mensagemPessoal, avisosAberta: avisosAberta, avisosPessoais: avisosPessoais, textoSituacao: textoSituacao,
    snapshotPrevia: snapshotPrevia, camposColaborador: camposColaborador, bloco: bloco, esquecer: esquecer };

  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_ADMIN_CLIMA;
  else root.DISC_ADMIN_CLIMA = DISC_ADMIN_CLIMA;
})(typeof self !== 'undefined' ? self : this);
