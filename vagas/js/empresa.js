/*
 * Vagas sem Caos — painel da EMPRESA no computador (empresa.html). Carregue por último, depois de empresa-base.js, empresa-vaga.js,
 * empresa-conversa.js e empresa-referencias.js. Desenho: docs/VAGAS-TELAS.md §3; contrato: docs/VAGAS-SPEC.md §8.4–8.6.
 *
 * Rotas (âncora): #inicio · #vagas · #vaga/nova · #vaga/<id> (rascunho = formulário; senão a vaga publicada) · #vaga/<id>/editar ·
 *   #vaga/<id>/cartoes · #conversas · #conversa/<candidatura> · #referencias · #referencia/dar[/candidatura/<id>] · #banco (fase 2) ·
 *   #compras e #comprar/… (grátis no lançamento: compras ocultas, decisão 6 do dono) · #dados (dados da empresa e equipe) ·
 *   #cadastro (conta sem empresa: completa o cadastro com o rascunho que entrar.html guardou em vg.rascunho.empresa).
 * Guarda: VAGAS_UI.exigirConta({tipo: 'empresa'}). Empresa em análise: faixa (dá para escrever vagas). Suspensa: só leitura.
 * Equipe da empresa (convidar 2ª pessoa, listar, cancelar convite, remover): RPCs do banco-onda2; sem elas no VAGAS_API, a seção
 * mostra "em breve" (typeof VAGAS_API.<método> === 'function').
 */
(function (root) {
  'use strict';
  var U = root.VAGAS_UI;
  var A = root.VAGAS_API;
  var R = root.VAGAS_REGRAS;
  var P = root.VAGAS_PECAS;
  var ER = root.VAGAS_EMPRESA_REGRAS;
  var E = root.VAGAS_EMPRESA;
  var el = U.el;
  var ctx = E.ctx;
  function t(c, v) { return U.t(c, v); }
  // Métodos da equipe da empresa (banco-onda2, docs/VAGAS-SPEC.md §8.4a). Se faltarem, a seção Equipe fica "em breve".
  var EQUIPE = { listar: 'equipeDaEmpresa', convidar: 'convidarEquipe', cancelar: 'cancelarConvite', remover: 'removerMembro' };
  var CONVITE_INVALIDO = 'Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.';
  function temEquipe() { return Object.keys(EQUIPE).every(function (k) { return typeof A[EQUIPE[k]] === 'function'; }); }

  // ------------------------------------------------------------------------------------------------- início
  function numeroCartao(id, rotuloTexto, valor, nota, destaque) {
    return el('section', { class: 'caixa caixa--compacta resumo__cartao' + (destaque ? ' caixa--destaque' : ''), id: id }, [
      el('p', { class: 'resumo__rotulo' }, rotuloTexto), el('p', { class: 'vg-numero__valor tabular' + (destaque && valor ? ' valor-destaque' : '') }, String(valor)),
      el('p', { class: 'resumo__nota' }, nota)]);
  }
  function telaInicio(raiz) {
    U.carregando(raiz);
    // O início relê a empresa: a situação (em análise, liberada, suspensa) e os números do menu mudam pela operação.
    return E.carregar().then(function () {
      E.menu({ atual: 'inicio' });
      E.faixas();
      E.contarConversas();
      return E.vagas.anuncios();
    }).then(function (lista) {
      var soma = function (k) { return lista.reduce(function (s, a) { return s + ((a.candidaturas && a.candidaturas[k]) || 0); }, 0); };
      var noAr = lista.filter(function (a) { return a.noAr; }).length;
      var revisao = lista.filter(function (a) { return a.status === 'em_revisao'; }).length;
      var novos = soma('novas');
      var hora = Number(U.hora(new Date().toISOString()).slice(0, 2));
      var nome = ER.primeiroNome(E.nomeResponsavel());
      var cab = E.cabecalho({ sobre: ctx.empresa.nomeFantasia + (ctx.empresa.cidade ? ' · ' + ctx.empresa.cidade.nome : ''), titulo: ER.saudacao(hora) + (nome ? ', ' + nome : ''),
        idTitulo: 'vg-emp-saudacao', idTexto: 'vg-emp-resumo-texto',
        texto: (noAr === 1 ? '1 vaga no ar' : noAr + ' vagas no ar') + ', ' + (novos === 1 ? '1 pessoa esperando sua resposta' : novos + ' pessoas esperando sua resposta') + '. O ideal é responder em até 7 dias.',
        acoes: [E.suspensa() ? null : el('a', { class: 'botao botao--laranja botao--grande', id: 'vg-emp-nova-vaga', href: '#vaga/nova' }, [U.icone('mais'), 'Nova vaga'])] });
      var resumo = el('div', { class: 'resumo', id: 'vg-emp-resumo' }, [
        numeroCartao('vg-emp-resumo-no-ar', 'Vagas no ar', noAr, revisao ? (revisao === 1 ? '1 em revisão' : revisao + ' em revisão') : 'no mural da cidade'),
        numeroCartao('vg-emp-resumo-esperando', 'Esperando sua resposta', novos, 'cartões novos', true),
        numeroCartao('vg-emp-resumo-combinou', 'Combinou', soma('combinou'), 'contatos liberados'),
        numeroCartao('vg-emp-resumo-contratacoes', 'Contratações', soma('contratada'), 'marque ao contratar')]);
      var vagas = lista.length ? E.caixa({ id: 'vg-emp-minhas-vagas', titulo: 'Minhas vagas', classe: 'caixa--ampla' }, [
        E.vagas.tabela(lista.slice(0, 8)),
        lista.length > 8 ? el('p', { class: 'vg-emp-nota' }, el('a', { href: '#vagas', id: 'vg-emp-ver-todas' }, 'Ver todas as ' + lista.length + ' vagas')) : null,
        el('p', { class: 't-nota texto-suave vg-emp-nota' }, t('avisos.vaga_em_revisao'))]) : E.vagas.vazioPrimeiraVaga();
      var lateral = el('aside', { class: 'vg-lateral', 'aria-label': 'Como funciona' }, [
        E.caixa({ id: 'vg-emp-como-funciona', titulo: 'Como funciona' }, [el('ol', { class: 'vg-emp-lista' }, [
          el('li', {}, ['Quem se candidata chega como ', el('strong', {}, 'cartão sem nome, foto, idade ou nacionalidade'), ', por ordem de chegada.']),
          el('li', {}, ['Você marca ', el('strong', {}, 'Quero conversar'), ' ou ', el('strong', {}, 'Agora não'), '.']),
          el('li', {}, ['Se a pessoa aceitar, é o ', el('strong', {}, 'Combinou'), ': nome, currículo e WhatsApp liberados para os dois.']),
          el('li', {}, ['Contratou? Marque ', el('strong', {}, 'Contratada'), ': ajuda a praça e libera a integração com a consultoria.'])])]),
        E.caixa({ id: 'vg-emp-regras', titulo: 'Regras da casa' }, [el('p', { class: 't-rotulo texto-medio' },
          'Salário ou valor da diária sempre no anúncio. Nunca peça dinheiro, Pix ou documento a quem se candidata. ' + t('avisos.cartao_cego_ordem'))])]);
      E.tela(raiz, [cab, resumo, el('div', { class: 'vg-grade' }, [vagas, lateral])]);
    }, function (e) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { telaInicio(raiz); } }); });
  }

  // ------------------------------------------------------------------------------------------------- cadastro da empresa (depois da conta)
  function mascaraCnpj(v) {
    var c = R.normalizarCnpj(v).slice(0, 14);
    var p = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8), c.slice(8, 12), c.slice(12, 14)];
    return p[0] + (c.length > 2 ? '.' + p[1] : '') + (c.length > 5 ? '.' + p[2] : '') + (c.length > 8 ? '/' + p[3] : '') + (c.length > 12 ? '-' + p[4] : '');
  }
  function telaCadastro(raiz) {
    var rasc = U.rascunho('empresa');
    var g = (rasc.ler() || {}).dados || {};
    var abertas = (ctx.cidades || []).filter(function (c) { return c.status === 'ativa'; });
    var cidadeAtual = abertas.some(function (c) { return c.slug === g.cidade; }) ? g.cidade : (abertas.length === 1 ? abertas[0].slug : '');
    var campos = {};
    var enviado = false;   // depois do envio, o rascunho atrasado (aoParar) não volta a gravar
    function guardar() {
      if (enviado) return;
      rasc.gravar(Object.assign({}, g, { cnpj: R.normalizarCnpj(campos.cnpj.value), mei: campos.mei.checked, razaoSocial: campos.razao.value, nomeFantasia: campos.nome.value,
        setor: campos.setor.value, cidade: cidade ? cidade.valor() : '', zona: zona ? zona.valor() : '', whatsapp: R.normalizarWhatsapp(campos.whatsapp.value) || campos.whatsapp.value,
        email: campos.email.value, descricao: campos.descricao.value }));
    }
    var guardarDepois = U.aoParar(guardar, 500);
    var cnpj = E.campo({ id: 'vg-emp-cad-cnpj', rotulo: 'CNPJ', obrigatorio: true, valor: g.cnpj ? mascaraCnpj(g.cnpj) : '', atributos: { inputmode: 'numeric', maxlength: '18', placeholder: '00.000.000/0001-00', autocomplete: 'off' },
      ajuda: 'MEI também é CNPJ.' });
    cnpj.campo.addEventListener('input', function () { cnpj.campo.value = mascaraCnpj(cnpj.campo.value); });
    var mei = E.marcar({ id: 'vg-emp-cad-mei', rotulo: 'É MEI', marcado: !!g.mei, aoMudar: guardarDepois });
    var razao = E.campo({ id: 'vg-emp-cad-razao', rotulo: 'Razão social', obrigatorio: true, valor: g.razaoSocial, atributos: { maxlength: '160', autocomplete: 'organization' } });
    var nome = E.campo({ id: 'vg-emp-cad-nome', rotulo: 'Nome da empresa como aparece para as pessoas', valor: g.nomeFantasia, atributos: { maxlength: '60' } });
    var setor = E.campo({ id: 'vg-emp-cad-setor', rotulo: 'Setor', opcional: true, valor: g.setor, atributos: { maxlength: '80', placeholder: 'Ex.: Supermercado' } });
    var whatsapp = E.campo({ id: 'vg-emp-cad-whatsapp', rotulo: 'WhatsApp da empresa (aparece só depois do Combinou)', tipo: 'tel', valor: g.whatsapp ? String(g.whatsapp).replace(/^55/, '') : '',
      atributos: { inputmode: 'tel', autocomplete: 'tel', placeholder: '(DDD) 99999-0000' } });
    var email = E.campo({ id: 'vg-emp-cad-email', rotulo: 'E-mail da empresa', opcional: true, tipo: 'email', valor: g.email, atributos: { inputmode: 'email', autocomplete: 'email' } });
    var descricao = E.campo({ id: 'vg-emp-cad-descricao', rotulo: 'Sobre a empresa', opcional: true, multilinha: true, linhas: '3', valor: g.descricao, atributos: { maxlength: '800' }, largo: true });
    campos = { cnpj: cnpj.campo, mei: mei.caixa, razao: razao.campo, nome: nome.campo, setor: setor.campo, whatsapp: whatsapp.campo, email: email.campo, descricao: descricao.campo };
    Object.keys(campos).forEach(function (k) { campos[k].addEventListener('input', guardarDepois); });
    var zonaLugar = el('div', { id: 'vg-emp-cad-zona-lugar' });
    var zona = null;
    function desenharZonas(slug) {
      var c = abertas.filter(function (x) { return x.slug === slug; })[0];
      zona = c && c.zonas.length ? E.chips({ id: 'vg-emp-cad-zona', rotulo: 'Zona', opcional: true, opcoes: c.zonas.map(function (z) { return { id: z.slug, rotulo: z.nome }; }),
        valor: g.zona && c.zonas.some(function (z) { return z.slug === g.zona; }) ? g.zona : '', aoMudar: guardarDepois }) : null;
      U.trocar(zonaLugar, zona ? zona.no : null);
      campos.zona = zona ? zona.grupo : null;
    }
    var cidade = abertas.length ? E.chips({ id: 'vg-emp-cad-cidade', rotulo: 'Cidade', obrigatorio: true, largo: true, opcoes: abertas.map(function (c) { return { id: c.slug, rotulo: c.nome + ' (' + c.uf + ')' }; }),
      valor: cidadeAtual, aoMudar: function (v) { g.zona = ''; desenharZonas(v); guardarDepois(); } }) : null;
    campos.cidade = cidade ? cidade.grupo : null;
    var erro = el('p', { class: 'aviso aviso--erro', id: 'vg-emp-cad-erro', role: 'alert', hidden: true });
    var enviar = el('button', { type: 'submit', class: 'botao botao--laranja botao--grande', id: 'vg-emp-cad-enviar', disabled: !abertas.length }, 'Enviar para conferência');
    var form = el('form', { class: 'caixa caixa--ampla vg-emp-form', id: 'vg-emp-form-dados', novalidate: true }, [
      el('div', { class: 'form-grade' }, [cnpj.no, el('div', { class: 'campo vg-emp-marcar-linha' }, mei.no), razao.no, nome.no, setor.no, whatsapp.no,
        cidade ? cidade.no : el('p', { class: 'aviso campo--largo', id: 'vg-emp-cad-sem-cidade', role: 'note' }, 'Nenhuma cidade aberta para cadastro de empresa agora.'),
        zonaLugar, email.no, descricao.no]),
      erro, el('div', { class: 'vg-emp-acoes-form' }, enviar)]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      erro.hidden = true;
      var l = ER.lerEmpresaForm({ cnpj: campos.cnpj.value, mei: campos.mei.checked, razao: campos.razao.value, nome: campos.nome.value, setor: campos.setor.value,
        cidade: cidade ? cidade.valor() : '', zona: zona ? zona.valor() : '', whatsapp: campos.whatsapp.value, email: campos.email.value, descricao: campos.descricao.value });
      if (!l.ok) { var c = campos[l.campo] || campos.razao; U.erroCampo(c, l.campo === 'cnpj' ? 'CNPJ inválido. Confira os 14 números.' : l.erro); if (c.focus) c.focus(); return; }
      U.ocupado(enviar, true, 'Enviando…');
      A.cadastrarEmpresa(l.dados).then(function (r) {
        enviado = true;
        E.lembrarResponsavel(g.responsavel);
        E.escolher(r.empresa.id);
        rasc.apagar();
        return E.carregar();
      }).then(function () {
        E.menu({ atual: 'inicio' });
        E.faixas();
        U.avisar(t('avisos.empresa_em_analise'), { tipo: 'ok', ms: 8000 });
        E.irPara('inicio');
      }, function (e) {
        U.ocupado(enviar, false);
        if (e.sessaoExpirada || e.confirmar || e.conexao) { U.tratarErro(e); return; }
        var c = ER.campoDoErroEmpresa(e.message);
        if (c && campos[c]) { U.erroCampo(campos[c], e.message); if (campos[c].focus) campos[c].focus(); }
        else { erro.textContent = e.message; erro.hidden = false; }
      });
    });
    E.tela(raiz, [E.cabecalho({ sobre: 'Dados da empresa', titulo: 'Complete o cadastro da empresa', idTitulo: 'vg-emp-cad-titulo',
      texto: 'Depois do envio, a operação da praça confere o CNPJ (em geral no mesmo dia útil). Você já pode escrever a vaga enquanto espera.' }),
    el('div', { class: 'vg-grade' }, [form, el('aside', { class: 'vg-lateral' }, [E.caixa({ id: 'vg-emp-cad-ajuda', titulo: 'Por que pedimos' }, [
      E.lista(['O CNPJ conferido mostra para quem procura que a empresa existe: é a marca "verificada".', 'O WhatsApp só aparece para a pessoa depois do Combinou.',
        'A vaga confidencial só é possível com o CNPJ conferido.']),
      P.golpe({ id: 'vg-aviso-golpe' })])])])]);
    if (cidadeAtual) desenharZonas(cidadeAtual);
  }

  // ------------------------------------------------------------------------------------------------- dados da empresa e equipe
  function telaDados(raiz) {
    var e = ctx.empresa;
    var podeEditar = E.dono() && !E.suspensa();
    var cad = E.caixa({ id: 'vg-emp-dados', titulo: 'Cadastro' }, [el('dl', { class: 'vg-dados' }, [
      el('dt', {}, 'Razão social'), el('dd', {}, e.razaoSocial), el('dt', {}, 'CNPJ'), el('dd', {}, e.cnpjFormatado + (e.mei ? ' (MEI)' : '')),
      el('dt', {}, 'Cidade'), el('dd', {}, e.cidade ? e.cidade.nome : ''),
      el('dt', {}, 'Situação'), el('dd', {}, [P.status('empresa', e.status), e.cnpjConferidoEm ? ' CNPJ conferido em ' + U.data(e.cnpjConferidoEm) : ''])]),
      el('p', { class: 't-nota texto-suave vg-emp-nota' }, 'CNPJ e razão social não mudam por aqui. Para corrigir, fale com a operação da praça.')]);
    var principal = [cad, formDados(podeEditar), equipe()];
    var lateral = [];
    if (ctx.empresas.length > 1) {
      var troca = E.chips({ id: 'vg-emp-trocar', rotulo: 'Empresa que você está usando', opcoes: ctx.empresas.map(function (x) { return { id: x.id, rotulo: x.nomeFantasia }; }), valor: e.id,
        aoMudar: function (v) { E.escolher(v); root.location.hash = 'inicio'; root.location.reload(); } });
      lateral.push(E.caixa({ id: 'vg-emp-suas-empresas', titulo: 'Suas empresas' }, [troca.no]));
    }
    lateral.push(E.caixa({ id: 'vg-emp-dados-ajuda', titulo: 'Quem vê o quê' }, [E.lista(['Nome, setor e descrição aparecem na vaga (menos na confidencial).',
      'WhatsApp e e-mail aparecem para a pessoa só depois do Combinou.'])]));
    E.tela(raiz, [E.cabecalho({ sobre: 'Dados da empresa', titulo: e.nomeFantasia, idTitulo: 'vg-emp-dados-titulo' }),
      el('div', { class: 'vg-grade' }, [el('div', { class: 'vg-lateral' }, principal), el('aside', { class: 'vg-lateral' }, lateral)])]);
  }
  function formDados(podeEditar) {
    var e = ctx.empresa;
    if (!podeEditar) {
      return E.caixa({ id: 'vg-emp-dados-publicos', titulo: 'Dados que aparecem' }, [el('dl', { class: 'vg-dados' }, [
        el('dt', {}, 'Nome'), el('dd', {}, e.nomeFantasia), el('dt', {}, 'Setor'), el('dd', {}, e.setor || '—'), el('dt', {}, 'WhatsApp'), el('dd', {}, e.whatsapp ? String(e.whatsapp).replace(/^55/, '') : '—'),
        el('dt', {}, 'E-mail'), el('dd', {}, e.email || '—'), el('dt', {}, 'Zona'), el('dd', {}, e.zona ? e.zona.nome : '—')]),
        E.suspensa() ? null : el('p', { class: 't-nota texto-suave vg-emp-nota' }, 'Só quem é dono(a) da conta da empresa pode alterar estes dados.')]);
    }
    var nome = E.campo({ id: 'vg-emp-dados-nome', rotulo: 'Nome da empresa como aparece para as pessoas', obrigatorio: true, valor: e.nomeFantasia, atributos: { maxlength: '60' } });
    var setor = E.campo({ id: 'vg-emp-dados-setor', rotulo: 'Setor', opcional: true, valor: e.setor, atributos: { maxlength: '80' } });
    var whats = E.campo({ id: 'vg-emp-dados-whatsapp', rotulo: 'WhatsApp da empresa', tipo: 'tel', valor: e.whatsapp ? String(e.whatsapp).replace(/^55/, '') : '', atributos: { inputmode: 'tel' } });
    var email = E.campo({ id: 'vg-emp-dados-email', rotulo: 'E-mail da empresa', opcional: true, tipo: 'email', valor: e.email, atributos: { inputmode: 'email' } });
    var desc = E.campo({ id: 'vg-emp-dados-descricao', rotulo: 'Sobre a empresa', opcional: true, multilinha: true, linhas: '3', valor: e.descricao, atributos: { maxlength: '800' }, largo: true });
    var zonas = E.zonas();
    var zona = zonas.length ? E.chips({ id: 'vg-emp-dados-zona', rotulo: 'Zona', opcional: true, opcoes: zonas.map(function (z) { return { id: z.slug, rotulo: z.nome }; }), valor: e.zona ? e.zona.slug : '', largo: true }) : null;
    var erro = el('p', { class: 'aviso aviso--erro', id: 'vg-emp-dados-erro', role: 'alert', hidden: true });
    var salvar = el('button', { type: 'submit', class: 'botao botao--principal', id: 'vg-emp-dados-salvar' }, 'Salvar');
    var campos = { nome: nome.campo, setor: setor.campo, whatsapp: whats.campo, email: email.campo, descricao: desc.campo, zona: zona ? zona.grupo : null };
    var form = el('form', { class: 'caixa caixa--compacta vg-emp-form', id: 'vg-emp-form-editar', novalidate: true, 'aria-labelledby': 'vg-emp-form-editar-titulo' }, [
      el('h2', { class: 'caixa__titulo', id: 'vg-emp-form-editar-titulo' }, 'Dados que aparecem'),
      el('div', { class: 'form-grade' }, [nome.no, setor.no, whats.no, email.no, zona ? zona.no : null, desc.no]), erro, el('div', { class: 'vg-emp-acoes-form' }, salvar)]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      erro.hidden = true;
      var dados = { nomeFantasia: nome.campo.value, setor: setor.campo.value, whatsapp: whats.campo.value, email: email.campo.value, descricao: desc.campo.value };
      if (zona) dados.zona = zona.valor();
      U.ocupado(salvar, true, 'Salvando…');
      A.salvarEmpresa(e.id, dados).then(function () { return E.carregar(); }).then(function () {
        U.ocupado(salvar, false);
        U.avisar('Salvo', { tipo: 'ok' });
        E.menu({ atual: 'dados' });
      }, function (er) {
        U.ocupado(salvar, false);
        if (er.sessaoExpirada || er.confirmar || er.suspensa || er.conexao) { U.tratarErro(er); return; }
        var c = /nome da empresa/i.test(er.message) ? 'nome' : ER.campoDoErroEmpresa(er.message);
        if (c && campos[c]) U.erroCampo(campos[c], er.message);
        else { erro.textContent = er.message; erro.hidden = false; }
      });
    });
    return form;
  }

  // Equipe da empresa: quem é dono(a) convida por e-mail (papel recrutador), vê a equipe e os convites, cancela e remove.
  function equipe() {
    var caixaEquipe = E.caixa({ id: 'vg-equipe', titulo: 'Equipe da empresa' }, []);
    if (!temEquipe()) {
      caixaEquipe.appendChild(el('p', { class: 't-rotulo texto-medio', id: 'vg-equipe-em-breve' }, 'Em breve: convidar outra pessoa da empresa para publicar vagas e responder às pessoas.'));
      return caixaEquipe;
    }
    var corpo = el('div', { id: 'vg-equipe-corpo' });
    caixaEquipe.appendChild(corpo);
    if (!E.dono()) {
      U.trocar(corpo, [el('p', { class: 't-rotulo texto-medio' }, 'Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.'),
        E.suspensa() ? null : el('button', { type: 'button', class: 'botao botao--perigo', id: 'vg-equipe-sair', onclick: sairDaEquipe }, 'Sair da equipe')]);
      return caixaEquipe;
    }
    carregarEquipe(corpo);
    return caixaEquipe;
  }
  function sairDaEquipe() {
    U.confirmar({ id: 'vg-confirmar-sair-equipe', titulo: 'Sair da equipe?', texto: 'Você deixa de ver as vagas e as conversas de ' + ctx.empresa.nomeFantasia + '.', sim: 'Sair da equipe', perigo: true })
      .then(function (sim) {
        if (!sim) return;
        A.sessao().then(function (s) { return A[EQUIPE.remover](ctx.empresa.id, s.usuario.id); }).then(function () {
          U.armazenamento.apagar('vg.empresa.atual');
          root.location.hash = 'inicio';
          root.location.reload();
        }, function (e) { U.tratarErro(e); });
      });
  }
  // Rótulos de VAGAS_REGRAS (PAPEIS_EMPRESA, STATUS_CONVITE_EQUIPE, do banco-onda2); a reserva é igual.
  function papel(id) { return (R.PAPEIS_EMPRESA && R.rotulo(R.PAPEIS_EMPRESA, id)) || { dono: 'Dono(a)', recrutador: 'Recrutador(a)' }[id] || id; }
  function situacaoConvite(id) { return (R.STATUS_CONVITE_EQUIPE && R.rotulo(R.STATUS_CONVITE_EQUIPE, id)) || { pendente: 'Esperando o aceite', vencido: 'Venceu', aceito: 'Aceito', cancelado: 'Cancelado' }[id] || id; }
  var linkPreviaConvite = '';   // prévia: o "e-mail" do convite vira um link para abrir aqui mesmo
  function carregarEquipe(corpo) {
    U.carregando(corpo);
    A[EQUIPE.listar](ctx.empresa.id).then(function (r) {
      var membros = r.membros || [];
      var convites = r.convites || [];
      var lim = r.limites || {};
      var so = E.suspensa();
      var email = el('input', { id: 'vg-equipe-email', class: 'entrada', type: 'email', inputmode: 'email', autocomplete: 'off', placeholder: 'colega@empresa.com', 'aria-describedby': 'vg-equipe-ajuda' });
      var convidar = el('button', { type: 'submit', class: 'botao botao--principal', id: 'vg-equipe-convidar' }, 'Convidar');
      var form = so ? null : el('form', { class: 'vg-emp-equipe-form', id: 'vg-equipe-form', novalidate: true }, [
        el('label', { class: 'campo__rotulo', for: 'vg-equipe-email' }, 'Convidar uma pessoa da empresa (e-mail)'),
        el('div', { class: 'vg-link-curto' }, [email, convidar]),
        el('span', { class: 'campo__ajuda', id: 'vg-equipe-ajuda' }, 'Ela entra como recrutador(a): publica vagas, vê os cartões e conversa.' +
          (lim.validadeHoras ? ' O convite vale ' + lim.validadeHoras + ' horas.' : '') + (lim.membrosMax ? ' Até ' + lim.membrosMax + ' pessoas na equipe.' : ''))]);
      if (form) form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = R.normalizarEmail(email.value);
        if (!v) { U.erroCampo(email, 'E-mail inválido.'); email.focus(); return; }
        U.ocupado(convidar, true, 'Enviando…');
        A[EQUIPE.convidar](ctx.empresa.id, v).then(function (x) {
          U.avisar((x && x.mensagem) || 'Convite enviado.', { tipo: 'ok', ms: 6000 });
          linkPreviaConvite = x && x.linkPrevia ? U.voltarValido(x.linkPrevia, '') : '';
          carregarEquipe(corpo);
        }, function (e) { U.ocupado(convidar, false); if (e.sessaoExpirada || e.confirmar) { U.tratarErro(e); return; } U.erroCampo(email, e.message); });
      });
      U.trocar(corpo, [
        el('div', { class: 'vg-rolagem' }, el('table', { class: 'vg-tabela', id: 'vg-equipe-membros' }, [
          el('thead', {}, el('tr', {}, ['Pessoa', 'E-mail', 'Papel', 'Desde', ''].map(function (h) { return el('th', { scope: 'col' }, h || el('span', { class: 'visualmente-oculto' }, 'Ação')); }))),
          el('tbody', {}, membros.map(function (m) {
            return el('tr', { data: { membro: m.userId } }, [el('td', {}, m.nome || '—'), el('td', {}, m.email), el('td', {}, papel(m.papel)), el('td', { class: 'nao-quebra' }, U.data(m.desde)),
              el('td', {}, el('div', { class: 'vg-tabela__acoes' }, m.eu ? el('span', { class: 't-nota texto-suave' }, 'Você') : (m.podeRemover && !so
                ? el('button', { type: 'button', class: 'botao botao--perigo', data: { acao: 'remover' }, onclick: function () { remover(m, corpo); } }, 'Remover') : null)))]);
          }))])),
        convites.length ? el('div', { class: 'vg-rolagem' }, el('table', { class: 'vg-tabela', id: 'vg-equipe-convites' }, [
          el('thead', {}, el('tr', {}, ['Convite', 'Situação', 'Vale até', ''].map(function (h) { return el('th', { scope: 'col' }, h || el('span', { class: 'visualmente-oculto' }, 'Ação')); }))),
          el('tbody', {}, convites.map(function (c) {
            return el('tr', { data: { convite: c.id } }, [el('td', {}, c.email), el('td', {}, situacaoConvite(c.status)), el('td', { class: 'nao-quebra' }, c.status === 'pendente' ? U.dataHora(c.expiraEm) : '—'),
              el('td', {}, el('div', { class: 'vg-tabela__acoes' }, c.status === 'pendente' && !so
                ? el('button', { type: 'button', class: 'botao botao--claro', data: { acao: 'cancelar' }, onclick: function (ev) { cancelar(c, ev.currentTarget, corpo); } }, 'Cancelar convite') : null))]);
          }))])) : null,
        form,
        linkPreviaConvite ? el('div', { class: 'aviso vg-emp-nota', id: 'vg-equipe-previa' }, [el('p', {}, 'Prévia: nenhum e-mail sai daqui. Abra o link que o convite traria.'),
          el('a', { class: 'botao botao--claro', id: 'vg-equipe-abrir-previa', href: linkPreviaConvite }, 'Abrir o convite (prévia)')]) : null]);
    }, function (e) { U.tratarErro(e, { raiz: corpo, aoTentar: function () { carregarEquipe(corpo); } }); });
  }
  function remover(m, corpo) {
    U.confirmar({ id: 'vg-confirmar-remover', titulo: 'Remover ' + (m.nome || m.email) + ' da equipe?', texto: 'A pessoa deixa de ver as vagas e as conversas da empresa. As vagas continuam.', sim: 'Remover', perigo: true })
      .then(function (sim) {
        if (!sim) return;
        A[EQUIPE.remover](ctx.empresa.id, m.userId).then(function () { U.avisar('Pessoa removida da equipe.', { tipo: 'ok' }); carregarEquipe(corpo); }, function (e) { U.tratarErro(e); });
      });
  }
  function cancelar(c, botao, corpo) {
    U.ocupado(botao, true);
    A[EQUIPE.cancelar](c.id).then(function () { U.avisar('Convite cancelado.', { tipo: 'ok' }); carregarEquipe(corpo); }, function (e) { U.ocupado(botao, false); U.tratarErro(e); });
  }

  // ------------------------------------------------------------------------------------------------- convite para a equipe (quem recebeu)
  // O e-mail leva a entrar.html?convite=<token>; depois de entrar (ou de criar a senha) a pessoa chega aqui com ?convite=. Mostra de
  // quem é o convite ANTES do aceite e só aceita no clique (docs/VAGAS-SPEC.md §8.4a).
  function tokenDoConvite() {
    if (typeof A.conviteDoEndereco === 'function') return A.conviteDoEndereco(root.location);
    var m = /[?&]convite=([0-9a-fA-F]{64})(?:&|$)/.exec(String(root.location.search || ''));
    return m ? m[1].toLowerCase() : '';
  }
  function telaConvite(raiz, token) {
    var cab = E.cabecalho({ sobre: 'Equipe da empresa', titulo: 'Convite para a equipe', idTitulo: 'vg-convite-titulo' });
    var painel = el('a', { class: 'botao botao--claro', href: 'empresa.html#inicio', id: 'vg-convite-painel' }, ctx.empresa ? 'Ir para o painel' : 'Continuar');
    if (typeof A.conviteEquipe !== 'function') {
      E.tela(raiz, [cab, el('p', { class: 'aviso', role: 'note', id: 'vg-convite-em-breve' }, 'Em breve: aceitar o convite para a equipe por aqui.'), el('div', { class: 'acoes' }, painel)]);
      return Promise.resolve();
    }
    U.carregando(raiz);
    return A.conviteEquipe(token).then(function (r) {
      var cv = r.convite || {};
      var emp = cv.empresa || {};
      var nome = emp.nomeFantasia + (emp.cidade && emp.cidade.nome ? ' (' + emp.cidade.nome + ')' : '');
      if (cv.jaMembro) {
        E.tela(raiz, [cab, el('p', { class: 't-corpo texto-medio', id: 'vg-convite-texto' }, 'Você já faz parte da equipe de ' + nome + '.'), el('div', { class: 'acoes' }, painel)]);
        return;
      }
      var aceitar = el('button', { type: 'button', class: 'botao botao--laranja botao--grande', id: 'vg-convite-aceitar' }, 'Aceitar o convite');
      var agoraNao = el('a', { class: 'botao botao--claro botao--grande', href: 'empresa.html#inicio', id: 'vg-convite-agora-nao' }, 'Agora não');
      var erro = el('p', { class: 'aviso aviso--erro', id: 'vg-convite-erro', role: 'alert', hidden: true });
      var caixaConvite = E.caixa({ id: 'vg-convite', classe: 'caixa--ampla caixa--destaque' }, [
        el('p', { class: 't-corpo', id: 'vg-convite-texto' }, [el('strong', {}, nome), ' convidou você para a equipe da empresa no Vagas sem Caos, como ' + papel(cv.papel).toLowerCase() +
          ': publicar vagas, ver os cartões e conversar com as pessoas.']),
        el('p', { class: 't-rotulo texto-medio' }, 'O convite vale até ' + U.data(cv.expiraEm) + ', ' + U.hora(cv.expiraEm) + '. Ao aceitar, quem é dono(a) da empresa vê o seu nome e o seu e-mail na lista da equipe.'),
        erro, el('div', { class: 'acoes' }, [agoraNao, aceitar])]);
      aceitar.addEventListener('click', function () {
        erro.hidden = true;
        U.ocupado(aceitar, true, 'Aceitando…');
        A.aceitarConviteEquipe(token).then(function (x) {
          E.escolher(x.empresa.id);
          E.tela(raiz, [cab, el('section', { class: 'caixa caixa--ampla', id: 'vg-convite-ok', role: 'status' }, [el('div', { class: 'vg-ok-icone' }, U.icone('check')),
            el('h2', { class: 't-titulo', tabindex: '-1' }, 'Pronto. Agora você faz parte da equipe de ' + x.empresa.nomeFantasia + '.'),
            el('div', { class: 'acoes' }, el('a', { class: 'botao botao--principal', href: 'empresa.html#inicio', id: 'vg-convite-ir' }, 'Ir para o painel'))])]);
          U.focarTitulo(raiz.querySelector('#vg-convite-ok'));
        }, function (e) {
          U.ocupado(aceitar, false);
          if (e.sessaoExpirada || e.confirmar || e.conexao) { U.tratarErro(e); return; }
          erro.textContent = e.message; erro.hidden = false;
        });
      });
      E.tela(raiz, [cab, caixaConvite, P.golpe({ id: 'vg-aviso-golpe' })]);
    }, function (e) {
      if (e.sessaoExpirada || e.confirmar || e.conexao) { U.tratarErro(e, { raiz: raiz, aoTentar: function () { root.location.reload(); } }); return; }
      E.tela(raiz, [cab, el('p', { class: 'aviso aviso--erro', role: 'alert', id: 'vg-convite-invalido' }, e.message || CONVITE_INVALIDO), el('div', { class: 'acoes' }, painel)]);
    });
  }

  // ------------------------------------------------------------------------------------------------- compras (ocultas) e banco (fase 2)
  function telaCompras(raiz) {
    var a = ctx.empresa.anuncios || {};
    E.tela(raiz, [E.cabecalho({ sobre: 'Compras', titulo: 'Grátis no lançamento', idTitulo: 'vg-compras-titulo',
      texto: 'No lançamento, publicar vagas, receber cartões, conversar e dar referência não têm custo.' }),
    el('div', { class: 'vg-grade' }, [E.caixa({ id: 'vg-compras-tem', titulo: 'O que sua empresa tem agora', classe: 'caixa--ampla' }, [
      el('dl', { class: 'vg-dados vg-emp-numeros' }, [el('dt', {}, 'Vagas no ar'), el('dd', { class: 'tabular' }, String(a.noAr || 0)),
        el('dt', {}, 'Em revisão'), el('dd', { class: 'tabular' }, String(a.emRevisao || 0)), el('dt', {}, 'Rascunhos'), el('dd', { class: 'tabular' }, String(a.rascunhos || 0)),
        el('dt', {}, 'Compras'), el('dd', {}, 'Nenhuma')])]), el('div')])]);
  }
  function telaBanco(raiz) {
    E.tela(raiz, [E.cabecalho({ sobre: 'Fase 2', titulo: 'Buscar no banco de talentos', idTitulo: 'vg-banco-titulo' }),
      el('div', { class: 'vg-faixa vg-emp-faixa-fase2', id: 'vg-banco-fase2', role: 'status' }, [U.icone('alerta'),
        el('p', {}, [el('strong', {}, 'Fase 2. '), 'Esta tela abre quando a cidade tiver gente com selo suficiente.'])]),
      el('p', { class: 't-corpo texto-medio vg-emp-nota' }, 'Até lá, as pessoas chegam pelas suas vagas: publique e compartilhe o link no WhatsApp.'),
      el('div', { class: 'acoes' }, el('a', { class: 'botao botao--principal', href: '#vagas', id: 'vg-banco-vagas' }, 'Minhas vagas'))]);
  }

  // ------------------------------------------------------------------------------------------------- roteador
  var TITULOS = { inicio: 'Início', vagas: 'Minhas vagas', vaga: 'Vaga', conversas: 'Conversas', conversa: 'Conversa', referencias: 'Referências',
    referencia: 'Dar referência', banco: 'Buscar no banco', compras: 'Compras', comprar: 'Compras', dados: 'Dados da empresa', cadastro: 'Cadastro da empresa' };
  var MENU = { inicio: 'inicio', vagas: 'vagas', vaga: 'vagas', conversas: 'conversas', conversa: 'conversas', referencias: 'referencias', referencia: 'referencias',
    banco: 'banco', compras: 'compras', comprar: 'compras', dados: 'dados', cadastro: 'dados' };
  function iniciar() {
    var doc = root.document;
    var raiz = doc.getElementById('conteudo');
    // O "Pular para o conteúdo" não pode virar rota (a âncora é o roteador): leva o foco ao conteúdo sem trocar o endereço.
    var pular = doc.querySelector('.pular');
    if (pular) pular.addEventListener('click', function (ev) { ev.preventDefault(); raiz.focus(); });
    var parar = null;
    U.exigirConta({ tipo: 'empresa', raiz: raiz }).then(function (eu) {
      ctx.eu = eu;
      return E.carregar();
    }).then(function () {
      E.menu({});
      E.faixas();
      E.contarConversas();
      // Convite para a equipe (?convite=): vem antes do cadastro (quem foi convidado pode não ter empresa própria) e do roteador.
      var token = tokenDoConvite();
      if (token) {
        doc.title = 'Convite para a equipe | Vagas sem Caos';
        return telaConvite(raiz, token).then(function () { U.focarTitulo(raiz); });
      }
      function rota(fn) {
        return function (resto) {
          if (parar) { parar(); parar = null; }
          if (!ctx.empresa) return telaCadastro(raiz);
          var r = fn(raiz, resto);
          if (r && typeof r.parar === 'function') { parar = r.parar; return r.pronto; }
          return r;
        };
      }
      function vaga(raizV, resto) {
        var p = String(resto || '').split('/');
        if (p[0] === 'nova') return E.telas.vagaNova(raizV);
        if (p[1] === 'cartoes') return E.telas.cartoes(raizV, p[0]);
        if (p[1] === 'editar') return E.telas.vagaEditar(raizV, p[0]);
        return E.telas.vaga(raizV, p[0]);
      }
      U.roteador({ raiz: raiz, padrao: 'inicio', rotas: {
        inicio: rota(telaInicio), vagas: rota(E.telas.vagas), 'vaga/': rota(vaga), conversas: rota(E.telas.conversas), 'conversa/': rota(E.telas.conversa),
        referencias: rota(E.telas.referencias), 'referencia/dar': rota(E.telas.referenciaDar), 'referencia/dar/': rota(E.telas.referenciaDar),
        banco: rota(telaBanco), compras: rota(telaCompras), 'comprar/': rota(telaCompras), dados: rota(telaDados),
        cadastro: function () { if (parar) { parar(); parar = null; } return ctx.empresa ? telaDados(raiz) : telaCadastro(raiz); }, '*': rota(telaInicio) },
      aoTrocar: function (r) {
        var base = String(r.hash || 'inicio').split('/')[0];
        if (!ctx.empresa) base = 'cadastro';
        U.marcarMenu(MENU[base] || 'inicio');
        doc.title = (TITULOS[base] || 'Painel da empresa') + ' | Vagas sem Caos';
      } });
    });
  }

  E.telas.inicio = telaInicio;
  E.telas.cadastro = telaCadastro;
  E.telas.dados = telaDados;
  E.EQUIPE = EQUIPE;
  root.VAGAS_EMPRESA = E;
  iniciar();
})(typeof self !== 'undefined' ? self : this);
