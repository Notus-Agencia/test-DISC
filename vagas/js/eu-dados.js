/*
 * Vagas sem Caos — "Eu": meus dados, baixar e excluir (eu.html#dados), docs/VAGAS-TELAS.md §2.12, mockups pessoa-meus-dados e
 * pessoa-excluir-confirmar. Lista: currículo, selos, referências, banco de talentos (aceite pessoa_banco_talentos, separado da
 * candidatura), quem viu o contato, cidades. Baixar = JSON de vagas_exportar_meus_dados salvo no aparelho (meus-dados-vagas.json).
 * Excluir = ação "excluir" da Edge Function vagas-conta (na prévia, simulada), só depois de digitar EXCLUIR. Sair e excluir limpam
 * o que esta conta deixou no aparelho (rascunhos, cache, intenção de "Quero").
 */
(function (root) {
  'use strict';
  var TELAS = root.VAGAS_EU_TELAS = root.VAGAS_EU_TELAS || {};
  var ARQUIVO = 'meus-dados-vagas.json';

  TELAS.dados = function (ctx) {
    var U = root.VAGAS_UI, A = root.VAGAS_API, L = root.VAGAS_EU_LOGICA, R = root.VAGAS_REGRAS, T = root.VAGAS_TEXTOS, el = U.el;
    var doc = root.document;
    var p = ctx.minha && ctx.minha.pessoa;
    var cartao = ctx.minha && ctx.minha.cartao;
    ctx.titulo('Meus dados');
    var cidades = p ? [p.cidade && p.cidade.nome, p.cidade2 && p.cidade2.nome].filter(Boolean) : [];

    function item(id, titulo, sub, acao) {
      var s = el('p', { class: 'vg-item__sub', id: id + '-sub' }, sub);
      return { no: el('li', { class: 'vg-item', id: id }, [el('div', { class: 'vg-item__texto' }, [el('p', { class: 'vg-item__titulo' }, titulo), s]), acao]), sub: s };
    }
    function botaoLink(id, rotulo, href) { return el('a', { class: 'botao botao--claro vg-eu-item-acao', id: id, href: href }, rotulo); }

    var falta = p ? 0 : 1;
    if (!(ctx.minha && ctx.minha.completo)) falta = L.primeiroPassoIncompleto(ctx.cv || L.cvDaPessoa(p), { zonasDe: ctx.zonasDe });
    var curriculo = item('vg-eu-item-curriculo', 'Meu currículo',
      ctx.minha && ctx.minha.completo ? '5 passos completos' + (p && p.atualizadoEm ? ' · editado em ' + U.dataCurta(p.atualizadoEm) : '') : 'Falta terminar (passo ' + Math.min(falta || 1, 5) + ' de 5)',
      botaoLink('vg-eu-curriculo', ctx.minha && ctx.minha.completo ? 'Editar' : 'Continuar', '#curriculo/1'));
    var selos = (cartao && cartao.selos) || [];
    var itemSelos = item('vg-eu-item-selos', 'Meus selos', selos.length ? selos.map(function (s) { return (s.nome || R.rotulo(R.TESTES_SELO, s.teste)) + ' (' + Math.round(s.nota) + ')'; }).join(' · ') : 'Nenhum selo ainda',
      botaoLink('vg-eu-selos', 'Ver', 'testes.html'));
    var refs = item('vg-eu-item-referencias', 'Referências', 'Pedir e decidir o que aparece', botaoLink('vg-eu-referencias', 'Ver', '#referencias'));
    var quem = item('vg-eu-item-quem-viu', 'Quem viu meu contato', 'Empresas que abriram o seu contato', botaoLink('vg-eu-quem-viu', 'Ver', '#quem-viu'));
    var cid = item('vg-eu-item-cidades', 'Cidades', cidades.length ? cidades.join(', ') + ' (até 2)' : 'Escolha no currículo', botaoLink('vg-eu-cidades', 'Trocar', '#curriculo/1'));
    var banco = item('vg-eu-item-banco', 'Banco de talentos', '', null);
    desenharBanco();

    var cabeca = el('div', { class: 'vg-eu-cabecalho' }, [
      el('h1', { class: 'titulo-pagina', id: 'vg-eu-titulo', tabindex: '-1' }, (p && p.nome) || (ctx.eu.conta && ctx.eu.conta.nome) || 'Eu'),
      el('p', { class: 'subtitulo', id: 'vg-eu-subtitulo' }, [ctx.email].concat(cidades.length ? [cidades.join(' e ')] : []).join(' · '))]);
    U.trocar(ctx.app, [cabeca,
      el('section', { class: 'caixa caixa--compacta', 'aria-label': 'Minha conta' }, el('ul', { class: 'vg-lista-itens', id: 'vg-eu-lista' },
        [curriculo.no, itemSelos.no, refs.no, banco.no, quem.no, cid.no])),
      el('section', { class: 'caixa caixa--compacta vg-eu-bloco', id: 'vg-meus-dados', 'aria-labelledby': 'vg-meus-dados-titulo' }, [
        el('h2', { class: 'vg-eu-h2', id: 'vg-meus-dados-titulo' }, 'Meus dados'),
        el('p', { class: 't-rotulo texto-medio' }, 'Você pode levar uma cópia de tudo ou apagar a conta. Contas paradas por 24 meses são apagadas sozinhas.'),
        el('div', { class: 'acoes acoes-coluna' }, [
          el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-dados-baixar', onclick: baixar }, [U.icone('baixar'), 'Baixar meus dados (arquivo)']),
          el('button', { type: 'button', class: 'botao botao--perigo botao--grande', id: 'vg-dados-excluir', onclick: excluir }, [U.icone('lixo'), 'Excluir minha conta'])])]),
      el('p', { class: 'centro-texto vg-eu-bloco' }, el('button', { type: 'button', class: 'botao botao--link', id: 'vg-sair', onclick: sair }, 'Sair da conta'))
    ]);
    ctx.nav('eu');

    // Contagens que dependem de outras consultas: a tela já está de pé; o texto do item muda quando chegarem.
    A.minhasReferencias().then(function (r) {
      var lista = r.referencias || [];
      var visiveis = lista.filter(function (x) { return x.status === 'aceita'; }).length;
      var pend = lista.filter(function (x) { return x.status === 'pendente'; }).length;
      var abertos = (r.convites || []).filter(function (c) { return c.status === 'aberto'; }).length;
      var partes = [visiveis ? visiveis + (visiveis === 1 ? ' aparece' : ' aparecem') + ' para as empresas' : 'Nenhuma aparecendo'];
      if (pend) partes.push(pend + ' esperando você');
      if (abertos) partes.push(abertos + (abertos === 1 ? ' pedido aberto' : ' pedidos abertos'));
      refs.sub.textContent = partes.join(' · ');
      ctx.refsPendentes = pend;
      ctx.nav('eu');
    }, function () { /* fica o texto genérico */ });
    A.quemViuMeuContato().then(function (r) {
      var n = (r.acessos || []).length;
      quem.sub.textContent = n ? n + (n === 1 ? ' empresa abriu' : ' empresas abriram') : 'Nenhuma empresa abriu';
    }, function () { /* fica o texto genérico */ });

    // ----------------------------------------------------------------------------------------------- banco de talentos
    function bancoAte() { return p && p.bancoTalentosAte && Date.parse(p.bancoTalentosAte) > Date.now() ? p.bancoTalentosAte : ''; }
    function desenharBanco() {
      var ate = bancoAte();
      banco.sub.textContent = !p ? 'Disponível depois do currículo' : ate ? 'Autorizado até ' + U.data(ate) : 'Fora do banco';
      var antigo = banco.no.querySelector('.vg-eu-item-acao');
      if (antigo) antigo.remove();
      if (!p) return;
      banco.no.appendChild(el('button', { type: 'button', class: 'botao botao--claro vg-eu-item-acao', id: 'vg-eu-banco', onclick: ate ? sairDoBanco : entrarNoBanco },
        ate ? 'Sair do banco' : 'Entrar no banco'));
    }
    function versao() { return (ctx.eu.conta && ctx.eu.conta.termosVersao) || R.VERSAO_TERMOS; }
    function entrarNoBanco() {
      var c = (T && T.consentimentos && T.consentimentos.aceites && T.consentimentos.aceites.pessoa_banco_talentos) || {};
      var j = null;
      var sim = el('button', { type: 'button', class: 'botao botao--principal', id: 'vg-banco-sim' }, 'Entrar no banco');
      j = U.janela({ id: 'vg-janela-banco', titulo: c.titulo || 'Entrar no banco de talentos', foco: '#vg-banco-nao', corpo: [
        el('p', { class: 't-corpo' }, c.texto || ''), c.explicacao ? el('p', { class: 't-nota texto-suave' }, L.semMarcador(c.explicacao)) : null,
        el('p', { class: 't-nota texto-suave' }, 'Candidatar-se a uma vaga não depende dessa autorização.')],
        acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-banco-nao', onclick: function () { j.fechar('nao'); } }, 'Agora não'), sim] });
      sim.addEventListener('click', function () {
        U.ocupado(sim, true, 'Salvando…');
        A.aceitarTermos({ versao: versao(), bancoTalentos: true }).then(function (r) {
          p.bancoTalentosAte = r.bancoTalentosAte || '';
          j.fechar('sim');
          desenharBanco();
          U.avisar('Salvo', { tipo: 'ok' });
        }, function (e) { U.ocupado(sim, false); j.fechar('erro'); U.tratarErro(e); });
      });
    }
    function sairDoBanco(ev) {
      var b = ev.currentTarget;
      U.ocupado(b, true, 'Saindo…');
      A.aceitarTermos({ versao: versao(), bancoTalentos: false }).then(function () {
        p.bancoTalentosAte = '';
        desenharBanco();
        U.avisar(U.t('avisos.banco_talentos_fora') || 'Você saiu do banco de talentos.', { tipo: 'ok', ms: 6000 });
      }, function (e) { U.ocupado(b, false); U.tratarErro(e); });
    }

    // ----------------------------------------------------------------------------------------------- baixar
    function baixar(ev) {
      var b = ev.currentTarget;
      U.ocupado(b, true, 'Preparando…');
      A.exportarMeusDados().then(function (r) {
        U.ocupado(b, false);
        var dados = Object.assign({}, r);
        delete dados.ok;
        var blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = el('a', { href: url, download: ARQUIVO, class: 'visualmente-oculto' }, ARQUIVO);
        doc.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
        U.avisar('Arquivo salvo no aparelho: ' + ARQUIVO, { tipo: 'ok', ms: 6000 });
      }, function (e) { U.ocupado(b, false); U.tratarErro(e); });
    }

    // ----------------------------------------------------------------------------------------------- excluir
    function excluir() {
      var j = null;
      var campo = el('input', { id: 'vg-confirmar-excluir-texto', class: 'entrada', type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
        'aria-describedby': 'vg-confirmar-excluir-explica' });
      var erro = el('p', { class: 'campo__erro', id: 'vg-confirmar-excluir-erro', role: 'alert', hidden: true });
      var sim = el('button', { type: 'button', class: 'botao botao--perigo', id: 'vg-confirmar-excluir-sim', disabled: true }, 'Excluir minha conta');
      campo.addEventListener('input', function () { sim.disabled = !L.confirmaExcluir(campo.value); erro.hidden = true; });
      campo.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !sim.disabled) { ev.preventDefault(); sim.click(); } });
      j = U.janela({ id: 'vg-confirmar-excluir', titulo: 'Excluir a conta de vez?', alerta: true, foco: '#vg-confirmar-excluir-texto', corpo: [
        el('p', { class: 't-corpo texto-medio', id: 'vg-confirmar-excluir-explica' }, U.t('avisos.excluir_conta')),
        el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-confirmar-excluir-texto' }, ['Para confirmar, digite ', el('strong', {}, 'EXCLUIR')]), campo, erro])],
        acoes: [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-confirmar-excluir-cancelar', onclick: function () { j.fechar('cancelar'); } }, 'Cancelar'), sim] });
      sim.addEventListener('click', function () {
        if (!L.confirmaExcluir(campo.value)) return;
        U.ocupado(sim, true, 'Excluindo…');
        A.excluirConta().then(function () {
          ctx.limparAparelho();
          j.fechar('excluida');
          contaExcluida();
        }, function (e) {
          U.ocupado(sim, false);
          sim.disabled = !L.confirmaExcluir(campo.value);
          if (e.sessaoExpirada) { j.fechar('erro'); U.tratarErro(e); return; }
          erro.textContent = e.message;
          erro.hidden = false;
        });
      });
    }
    function contaExcluida() {
      ctx.titulo('Conta excluída');
      U.fixar(null);
      U.topo({});
      U.trocar(ctx.app, el('section', { class: 'caixa centro surgir', id: 'vg-conta-excluida', 'aria-labelledby': 'vg-conta-excluida-titulo' }, [
        el('span', { class: 'vg-ok-icone' }, U.icone('check')),
        el('h1', { class: 'titulo-pagina', id: 'vg-conta-excluida-titulo', tabindex: '-1' }, 'Conta excluída.'),
        el('p', { class: 'subtitulo' }, 'Obrigado por usar o Vagas sem Caos.'),
        el('div', { class: 'acoes acoes-coluna' }, el('a', { class: 'botao botao--claro botao--grande', href: 'index.html', id: 'vg-conta-excluida-inicio' }, 'Ir para o início'))]));
      U.focarTitulo(ctx.app);
      U.anunciar('Conta excluída.');
    }

    // ----------------------------------------------------------------------------------------------- sair
    function sair(ev) {
      U.ocupado(ev.currentTarget, true, 'Saindo…');
      A.sair().then(function () { ctx.limparAparelho(); U._api.navegar('index.html'); }, function () { ctx.limparAparelho(); U._api.navegar('index.html'); });
    }
    return null;
  };
})(typeof self !== 'undefined' ? self : this);
