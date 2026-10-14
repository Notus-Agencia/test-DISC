/*
 * Vagas sem Caos — candidaturas, convite/conversa e "quem viu meu contato" da pessoa (eu.html), docs/VAGAS-TELAS.md §2.9–§2.11,
 * mockups pessoa-candidaturas, pessoa-conversa-convite, pessoa-conversa e pessoa-quem-viu.
 *   #candidaturas   Andando / Fechadas; rótulos de VAGAS_REGRAS ("Agora não" = "Encerrada", sem frase negativa); retirar com confirmação.
 *   #conversa/<id>  componente VAGAS_CONVERSA (lado pessoa). No convite o nome da empresa aparece ANTES de liberar o contato
 *                   (vagas_ver_empresa); "Combinou: liberar meu contato" pede o aceite pessoa_combinou_contato; "Agora não" recusa
 *                   sem explicar. Depois do Combinou: WhatsApp da empresa (wa.me só com dígitos).
 *   #quem-viu       acessos ao contato + Combinou que ainda não abriram; cortar o acesso (contato, foto e conversa) e voltar a compartilhar.
 */
(function (root) {
  'use strict';
  var TELAS = root.VAGAS_EU_TELAS = root.VAGAS_EU_TELAS || {};
  var NOTA_SETE_DIAS = 'Enviada há mais de 7 dias sem resposta? A vaga pode ter sido preenchida. Você pode retirar a candidatura a qualquer momento.';

  function base() {
    return { U: root.VAGAS_UI, A: root.VAGAS_API, P: root.VAGAS_PECAS, L: root.VAGAS_EU_LOGICA, C: root.VAGAS_CONVERSA, T: root.VAGAS_TEXTOS };
  }

  // ------------------------------------------------------------------------------------------------- candidaturas
  TELAS.candidaturas = function (ctx) {
    var b = base(), U = b.U, A = b.A, P = b.P, L = b.L, el = U.el;
    ctx.titulo('Minhas candidaturas');
    var raiz = el('div', { id: 'vg-cand' });
    U.trocar(ctx.app, [ctx.cabecalho({ titulo: 'Candidaturas', idTitulo: 'vg-cand-titulo', subtitulo: 'O que está andando e o que já fechou.' }), raiz]);
    ctx.nav('candidaturas');
    U.esqueletos(raiz, 3);
    function recarregar() { TELAS.candidaturas(ctx); }
    ctx.recarregarCandidaturas().then(function (lista) { ctx.nav('candidaturas'); desenhar(lista); }, function (e) {
      var guardadas = e.conexao ? ctx.candidaturasGuardadas() : null;
      if (guardadas) { U.faixaOffline(true, { aoTentar: recarregar }); desenhar(guardadas); return; }
      U.tratarErro(e, { raiz: raiz, aoTentar: recarregar });
    });

    function desenhar(lista) {
      if (!lista.length) {
        U.vazio(raiz, { id: 'vg-cand-vazio', texto: 'Você ainda não se candidatou. As vagas da sua cidade estão a um toque.', botao: { rotulo: 'Ver vagas', href: ctx.hrefVagas(), id: 'vg-cand-ver-vagas' } });
        return;
      }
      var g = L.separar(lista);
      var aba = ctx.abaCandidaturas === 'fechadas' && g.fechadas.length ? 'fechadas' : 'andando';
      var ul = el('ul', { class: 'vg-linhas', id: 'vg-cand-lista', 'aria-live': 'polite' });
      var andando = el('button', { type: 'button', class: 'segmento__botao', id: 'vg-cand-aba-andando', onclick: function () { trocarAba('andando'); } });
      var fechadas = el('button', { type: 'button', class: 'segmento__botao', id: 'vg-cand-aba-fechadas', onclick: function () { trocarAba('fechadas'); } });
      function trocarAba(a) {
        aba = a;
        ctx.abaCandidaturas = a;
        andando.setAttribute('aria-pressed', a === 'andando' ? 'true' : 'false');
        fechadas.setAttribute('aria-pressed', a === 'fechadas' ? 'true' : 'false');
        andando.textContent = 'Andando (' + g.andando.length + ')';
        fechadas.textContent = 'Fechadas (' + g.fechadas.length + ')';
        var itens = a === 'andando' ? g.andando : g.fechadas;
        U.trocar(ul, itens.length ? itens.map(linha) : el('li', { class: 'vg-eu-vazio-lista' }, a === 'andando' ? 'Nada andando agora.' : 'Nenhuma candidatura fechada.'));
      }
      U.trocar(raiz, [el('div', { class: 'segmento', role: 'group', 'aria-label': 'Mostrar' }, [andando, fechadas]), ul,
        el('p', { class: 't-nota texto-suave vg-eu-nota-lista', id: 'vg-cand-nota' }, NOTA_SETE_DIAS)]);
      trocarAba(aba);
    }

    function linha(k) {
      var conteudo = [P.iniciais(L.empresaDe(k), { confidencial: L.confidencialDe(k) }),
        el('span', { class: 'vg-linha__corpo' }, [el('span', { class: 'vg-linha__titulo' }, (k.anuncio && k.anuncio.titulo) || 'Vaga'),
          el('span', { class: 'vg-linha__sub' }, L.subtitulo(k, { relativa: function (x) { return U.relativa(x); }, dataCurta: U.dataCurta }))]),
        P.status('candidatura', k.status)];
      if (L.abreConversa(k)) return el('li', {}, el('a', { class: 'vg-linha', href: '#conversa/' + encodeURIComponent(k.id), data: { candidatura: k.id } }, conteudo));
      return el('li', {}, el('button', { type: 'button', class: 'vg-linha vg-eu-linha-botao', data: { candidatura: k.id }, 'aria-haspopup': 'dialog', onclick: function () { detalhe(k); } }, conteudo));
    }

    // Enviada ou fechada: folha com a vaga e, se ainda dá, "Retirar candidatura" (com confirmação na página).
    function detalhe(k) {
      var f = null;
      var acoes = [];
      if (k.anuncio && k.anuncio.noAr && k.anuncio.codigo) {
        acoes.push(el('a', { class: 'botao botao--claro botao--grande', id: 'vg-cand-ver-vaga', href: 'vaga.html?vaga=' + encodeURIComponent(k.anuncio.codigo) }, 'Ver a vaga'));
      }
      if (k.status === 'enviada') {
        acoes.push(el('button', { type: 'button', class: 'botao botao--perigo botao--grande', id: 'vg-cand-retirar', onclick: function () { f.fechar('retirar'); retirar(k); } },
          U.t('botoes.retirar') || 'Retirar candidatura'));
      }
      f = U.folha({ id: 'vg-cand-folha', titulo: (k.anuncio && k.anuncio.titulo) || 'Candidatura', corpo: [
        el('p', { class: 't-rotulo texto-medio' }, L.subtitulo(k, { relativa: function (x) { return U.relativa(x); }, dataCurta: U.dataCurta })),
        k.status === 'enviada' ? el('p', { class: 't-rotulo texto-medio vg-eu-aviso' }, U.t('avisos.quero_enviado')) : null,
        k.anuncio && !k.anuncio.noAr ? el('p', { class: 't-nota texto-suave vg-eu-aviso' }, 'Esta vaga não está mais no ar.') : null,
        acoes.length ? el('div', { class: 'acoes acoes-coluna' }, acoes) : null] });
    }
    function retirar(k) {
      U.confirmar({ id: 'vg-confirmar-retirar', titulo: 'Retirar a candidatura?', texto: 'A empresa deixa de ver o seu cartão. Você pode se candidatar de novo enquanto a vaga estiver no ar.',
        sim: 'Retirar', perigo: true }).then(function (sim) {
        if (!sim) return;
        A.retirar(k.id).then(function () {
          U.avisar(U.t('avisos.candidatura_retirada') || 'Candidatura retirada', { tipo: 'ok' });
          recarregar();
        }, function (e) { U.tratarErro(e); });
      });
    }
    return null;
  };

  // ------------------------------------------------------------------------------------------------- conversa e convite
  TELAS.conversa = function (ctx, id) {
    var b = base(), U = b.U, A = b.A, P = b.P, L = b.L, C = b.C, T = b.T, el = U.el;
    ctx.titulo('Conversa');
    var raiz = el('div', { id: 'vg-eu-conversa' });
    U.trocar(ctx.app, raiz);
    U.carregando(raiz);
    ctx.nav('candidaturas');
    var conversa = null;
    var parado = false;
    ctx.ativo({ parar: function () { parado = true; if (conversa) conversa.parar(); } });
    function recarregar() { if (conversa) conversa.parar(); TELAS.conversa(ctx, id); }

    ctx.recarregarCandidaturas().catch(function (e) {
      if (e.conexao && ctx.candidaturasGuardadas()) return ctx.candidaturasGuardadas();
      throw e;
    }).then(function (lista) {
      var k = (lista || []).filter(function (x) { return x.id === id; })[0];
      if (!k) {
        U.vazio(raiz, { titulo: 'Conversa não encontrada.', h1: true, texto: 'Ela pode ter sido encerrada.', botao: { rotulo: 'Ver candidaturas', href: '#candidaturas', id: 'vg-conversa-voltar-lista' } });
        U.focarTitulo(raiz);
        return null;
      }
      // Convite: o nome da empresa aparece antes de a pessoa decidir (mesmo se a vaga era confidencial).
      var empresa = k.status === 'conversar' ? A.verEmpresa(k.id).then(function (r) { return r.empresa; }, function () { return null; }) : Promise.resolve(null);
      return empresa.then(function (emp) { if (!parado) montar(k, emp); });
    }).catch(function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: recarregar }); });

    function nomeDe(k, emp) { return (emp && emp.nome) || L.empresaDe(k); }
    function montar(k, emp) {
      var nome = nomeDe(k, emp);
      var whats = k.combinou && k.combinou.empresa && k.combinou.empresa.whatsapp;
      conversa = C.montar(raiz, {
        lado: 'pessoa', candidaturaId: k.id, voltar: { href: '#candidaturas', rotulo: 'Candidaturas' },
        whatsapp: whats ? { numero: whats, texto: L.mensagemWhatsappEmpresa(k.anuncio && k.anuncio.titulo) } : null,
        antes: function (cx) { return cx.estado.modo === 'convite' ? convite(k, emp, nome) : null; },
        acoes: function (cx) {
          if (cx.estado.modo === 'convite') return [decidir(k, nome)];
          if (cx.estado.modo === 'contratada') return [el('p', { class: 'aviso aviso--ok', id: 'vg-conversa-contratada' }, U.t('avisos.contratada_pessoa', { empresa_nome: nome, vaga_titulo: k.anuncio && k.anuncio.titulo }))];
          return [];
        },
        // No convite a decisão é a ação da tela (como no mockup, sem a navegação embaixo); na conversa, volta a navegação.
        aoMudar: function (estado, resp) {
          if (estado.modo === 'convite') U.fixar(null); else ctx.nav('candidaturas');
          ctx.titulo(estado.modo === 'convite' ? 'Convite para conversar' : 'Conversa com ' + ((resp && resp.outroLado) || nome));
        }
      });
    }

    function convite(k, emp, nome) {
      var conf = !!(k.anuncio && k.anuncio.empresa && k.anuncio.empresa.confidencial);
      var linha = [P.verificada('Empresa verificada')];
      if (emp && emp.setor) linha.push(' · ' + emp.setor);
      if (conf) linha.push(' · esta era a "empresa confidencial"');
      return el('div', { class: 'vg-convite', id: 'vg-convite' }, [
        el('p', { class: 'sobretitulo' }, (k.anuncio && k.anuncio.titulo) || ''),
        el('h2', { class: 'vg-convite__titulo', id: 'vg-convite-titulo' }, 'A empresa quer conversar com você'),
        el('div', { class: 'vg-convite__empresa', id: 'vg-convite-empresa' }, [P.iniciais(nome, { grande: true }), el('div', {}, [
          el('p', { class: 'seminegrito', id: 'vg-convite-empresa-nome' }, nome),
          el('p', { class: 't-nota texto-suave' }, linha),
          emp && emp.cnpjFormatado ? el('p', { class: 't-nota texto-suave' }, emp.cnpjFormatado + ' · ' + (U.t('avisos.empresa_conferida') || 'CNPJ conferido pela Gestão sem Caos')) : null])])
      ]);
    }
    function decidir(k, nome) {
      return el('div', { class: 'vg-eu-decidir', id: 'vg-convite-decidir' }, [
        el('p', { class: 'seminegrito' }, 'Se você aceitar:'),
        el('ul', { class: 'vg-convite__lista' }, [
          el('li', {}, [nome + ' vê o seu ', el('strong', {}, 'nome'), ' e o seu ', el('strong', {}, 'currículo completo'), ';']),
          el('li', {}, ['o seu ', el('strong', {}, 'WhatsApp'), ' fica liberado para ela, e o dela para você;']),
          el('li', {}, 'fica registrado quem viu o seu contato (você confere em "Eu").')]),
        el('p', { class: 't-rotulo texto-medio' }, 'Se recusar, a empresa não vê nada além do cartão e a conversa fecha. Nenhuma das duas respostas aparece para outras empresas.'),
        el('div', { class: 'acoes acoes-coluna' }, [
          el('button', { type: 'button', class: 'botao botao--laranja botao--grande', id: 'vg-convite-aceitar', onclick: function () { aceitar(k, nome); } }, 'Combinou: liberar meu contato'),
          el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-convite-recusar', onclick: function () { recusar(k, nome); } }, U.t('botoes.agora_nao') || 'Agora não')])
      ]);
    }
    // Aceite expresso (consentimentos.json, pessoa_combinou_contato): o texto exato, com o nome da empresa, antes de liberar.
    function aceitar(k, nome) {
      var c = (T && T.consentimentos && T.consentimentos.aceites && T.consentimentos.aceites.pessoa_combinou_contato) || {};
      var j = null;
      var sim = el('button', { type: 'button', class: 'botao botao--laranja', id: 'vg-confirmar-combinou-sim' }, U.t('botoes.liberar_contato') || 'Liberar meu contato');
      j = U.janela({ id: 'vg-confirmar-combinou', titulo: c.titulo || 'Liberar meu contato para esta empresa', alerta: true, foco: '#vg-confirmar-combinou-nao', corpo: [
        el('p', { class: 't-corpo' }, String(c.texto || '').replace(/\{\{\s*empresa_nome\s*\}\}/g, nome)),
        c.explicacao ? el('p', { class: 't-nota texto-suave' }, b.L.semMarcador(c.explicacao)) : null],
        acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-confirmar-combinou-nao', onclick: function () { j.fechar('nao'); } }, U.t('botoes.cancelar') || 'Cancelar'), sim] });
      sim.addEventListener('click', function () {
        U.ocupado(sim, true, 'Liberando…');
        A.combinar(k.id).then(function () {
          j.fechar('sim');
          U.avisar(U.t('avisos.combinou_pessoa', { empresa_nome: nome }), { tipo: 'ok', ms: 12000 });
          recarregar();
        }, function (e) {
          U.ocupado(sim, false);
          j.fechar('erro');
          if (e.verEmpresa) { recarregar(); return; }
          U.tratarErro(e);
        });
      });
    }
    function recusar(k, nome) {
      U.confirmar({ id: 'vg-confirmar-recusar', titulo: 'Recusar o convite da empresa ' + nome + '?', texto: 'A conversa fecha e não dá para reabrir. A empresa não vê nada além do seu cartão.',
        sim: 'Recusar', perigo: true }).then(function (sim) {
        if (!sim) return;
        A.recusar(k.id).then(function () {
          U.avisar(U.t('avisos.combinou_recusado') || 'Tudo bem.', { tipo: 'ok', ms: 6000 });
          recarregar();
        }, function (e) { U.tratarErro(e); });
      });
    }
    return null;
  };

  // ------------------------------------------------------------------------------------------------- quem viu meu contato
  TELAS.quemViu = function (ctx) {
    var b = base(), U = b.U, A = b.A, P = b.P, L = b.L, el = U.el;
    ctx.titulo('Quem viu meu contato');
    var lista = el('div', { id: 'vg-quem-viu-corpo' });
    U.trocar(ctx.app, [el('a', { class: 'botao botao--link vg-voltar', href: '#dados', id: 'vg-voltar' }, [U.icone('voltar'), 'Eu']),
      el('section', { class: 'caixa', id: 'vg-quem-viu', 'aria-labelledby': 'vg-quem-viu-titulo' }, [
        el('h1', { class: 'titulo-pagina', id: 'vg-quem-viu-titulo', tabindex: '-1' }, 'Quem viu meu contato'),
        el('p', { class: 'subtitulo' }, 'Só empresas com quem você combinou conseguem abrir o seu nome e o seu WhatsApp. Cada abertura fica registrada aqui.'),
        lista])]);
    ctx.nav('eu');
    U.carregando(lista);
    function recarregar() { TELAS.quemViu(ctx); }
    Promise.all([A.quemViuMeuContato(), ctx.recarregarCandidaturas()]).then(function (r) { desenhar(L.quemViu(r[0].acessos, r[1])); },
      function (e) { U.tratarErro(e, { raiz: lista, aoTentar: recarregar }); });

    function desenhar(itens) {
      if (!itens.length) {
        U.trocar(lista, el('p', { class: 'aviso vg-eu-aviso', id: 'vg-quem-viu-vazio' }, 'Nenhuma empresa abriu o seu contato ainda. Isso só acontece depois de um Combinou.'));
        return;
      }
      var algumCortavel = itens.some(function (x) { return x.podeCortar; });
      U.trocar(lista, [el('ul', { class: 'vg-lista-itens', id: 'vg-quem-viu-lista' }, itens.map(item)),
        el('p', { class: 'aviso vg-eu-aviso', id: 'vg-quem-viu-aviso' }, 'Ninguém mais tem o seu contato: nem o operador da praça, nem outras empresas.' +
          (algumCortavel ? ' Quer cortar o acesso de alguma? Toque em "Cortar acesso".' : ''))]);
    }
    function foiHoje(iso) { var r = U.relativa(iso); return r === 'agora' || r === 'hoje' || /^há \d+ (min|h)$/.test(r); }
    function sub(x) {
      var partes = [x.anuncio];
      if (x.cortadoEm) partes.push('você parou de compartilhar em ' + U.dataCurta(x.cortadoEm));
      else if (x.abriuEm) partes.push('abriu em ' + U.dataCurta(x.abriuEm) + ' às ' + U.hora(x.abriuEm) + (x.vezes > 1 ? ' (' + x.vezes + ' vezes)' : ''));
      else partes.push('ainda não abriu (vocês combinaram ' + (foiHoje(x.combinouEm) ? 'hoje' : 'em ' + U.dataCurta(x.combinouEm)) + ')');
      return partes.filter(Boolean).join(' · ');
    }
    function item(x) {
      var acao = null;
      if (x.podeCortar && x.candidaturaId) acao = el('button', { type: 'button', class: 'botao botao--claro', data: { acao: 'cortar' }, onclick: function () { cortar(x); } }, 'Cortar acesso');
      else if (x.podeVoltar && x.candidaturaId) acao = el('button', { type: 'button', class: 'botao botao--claro', data: { acao: 'voltar' }, onclick: function (ev) { voltar(x, ev.currentTarget); } }, 'Voltar a compartilhar');
      return el('li', { class: 'vg-item', data: { candidatura: x.candidaturaId } }, [P.iniciais(x.empresa),
        el('div', { class: 'vg-item__texto' }, [el('p', { class: 'vg-item__titulo' }, x.empresa), el('p', { class: 'vg-item__sub' }, sub(x))]), acao]);
    }
    function cortar(x) {
      U.confirmar({ id: 'vg-confirmar-cortar', titulo: 'Cortar o acesso da empresa ' + x.empresa + '?', texto: U.t('avisos.contato_cortar_pessoa') + ' A conversa com ela fecha.',
        sim: 'Cortar acesso', perigo: true }).then(function (sim) {
        if (!sim) return;
        A.cortarAcesso(x.candidaturaId).then(function () {
          U.avisar(U.t('mensagem.conversa_encerrada_pessoa') || 'Acesso cortado.', { tipo: 'ok', ms: 6000 });
          recarregar();
        }, function (e) { U.tratarErro(e); });
      });
    }
    function voltar(x, botao) {
      U.ocupado(botao, true, 'Liberando…');
      A.combinar(x.candidaturaId).then(function () {
        U.avisar('Contato liberado de novo para ' + x.empresa + '.', { tipo: 'ok' });
        recarregar();
      }, function (e) { U.ocupado(botao, false); U.tratarErro(e); });
    }
    return null;
  };
})(typeof self !== 'undefined' ? self : this);
