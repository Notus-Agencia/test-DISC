/*
 * Vagas sem Caos — área da pessoa (eu.html): lógica pura, sem DOM e sem rede (VAGAS_EU_LOGICA). UMD como os outros arquivos de
 * vagas/js. As telas (eu-*.js) só desenham; tudo o que dá para testar no Node fica aqui (tests/vagas-pessoa-eu.test.js).
 *
 *   Currículo (docs/VAGAS-TELAS.md §2.6; contrato vagas_pessoa_salvar em docs/VAGAS-SPEC.md §8.3):
 *     cvVazio({cidade}) · cvDaPessoa(pessoa, agora) -> estado do formulário · pessoaDoCv(cv, {sobre, email}) -> p_dados
 *     validarPasso(n, cv, {zonasDe, agora}) -> [{campo, msg}] · primeiroPassoIncompleto(cv, op) -> 1..5 (6 = tudo certo)
 *     cartaoLocal(cv, {cidades, cartao, agora}) -> o MESMO cartão cego que o banco monta (prévia do passo 5)
 *     TEMPOS (pílulas de tempo), inicioDoTempo(id, agora), tempoDoPeriodo(inicio, fim, agora), carteiraDe(informal),
 *     informalDe(carteira), CNH_OPCOES, cnhDe(lista), listaCnh(id), centavosDe(texto), reaisDe(centavos), formatarWhatsapp(d)
 *   Candidaturas (§2.9): grupo(k) 'andando'|'fechada' · separar(lista) · subtitulo(k, fmt) · empresaDe(k) · convitesPendentes(lista)
 *   Quem viu (§2.11): quemViu(acessos, candidaturas)
 *   Referências (§2.13): statusReferencia(r) -> {texto, classe} · linkCompleto(caminho, href) · mensagemPedido(empresa, link)
 *   Outros: mensagemWhatsappEmpresa(titulo) · confirmaExcluir(texto) · semMarcador(texto) · rascunhoDaConta(r, email)
 *
 * Decisões (ver o registro da frente pessoa na mesa): o contrato pede `cargos` (1 a 5) e `modalidades` (1+), que o desenho do
 * currículo não mostra. `cargos` sai das áreas marcadas (o cartão diz "Quer trabalhar com: <áreas>"); `modalidades` vira as pílulas
 * "Tipo de vaga que você aceita" no passo 4 (cobre o "Topo diárias e bicos" do desenho).
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var R = nodeJs ? require('./regras.js') : root.VAGAS_REGRAS;

  // ------------------------------------------------------------------------------------------------- textos de validação
  // Os que existem no contrato/textos vêm de lá (validacao.* e as mensagens do banco em regras.js); os demais seguem o padrão
  // "Preencha <o campo>" do docs/VAGAS-TELAS.md §6.
  function texto(caminho, reserva) {
    var T = root.VAGAS_TEXTOS || (nodeJs ? require('./textos.js') : null);
    var t = T && T.t ? T.t(caminho) : '';
    return t || reserva || '';
  }
  var MSG = {
    CIDADE: function () { return texto('validacao.cidade_obrigatoria', 'Escolha pelo menos uma cidade.'); },
    CIDADE_MAX: function () { return texto('validacao.cidade_maximo', 'Você pode escolher até 2 cidades.'); },
    ZONA: function () { return texto('validacao.zona_obrigatoria', 'Escolha a zona onde você mora ou pode trabalhar.'); },
    AREA: 'Marque pelo menos uma área',
    AREA_MAX: 'Só dá para marcar 3',
    EXP_CARGO: 'Preencha o que você fazia',
    EXP_NENHUMA: 'Preencha o que você fazia ou toque em "Ainda não trabalhei"',
    EXP_TEMPO: 'Escolha por quanto tempo',
    EXP_MAX: 'Informe até 10 experiências.',
    ESCOLARIDADE: 'Escolha a sua escolaridade.',
    CURSOS_MAX: 'Informe até 10 cursos.',
    TURNO: 'Marque pelo menos um turno em que pode trabalhar.',
    MODALIDADE: 'Marque pelo menos um tipo de vaga (CLT, temporário, diária, freelancer ou estágio).',
    PRETENSAO: function () { return texto('validacao.pretensao_invalida', 'Escreva a pretensão em reais, só números.'); },
    NOME: 'Informe seu nome e sobrenome.',
    WHATSAPP: function () { return texto('validacao.whatsapp_invalido', 'Escreva o WhatsApp com DDD e o número do celular, só os números (11 dígitos).'); }
  };
  function msg(m) { return typeof m === 'function' ? m() : m; }

  // ------------------------------------------------------------------------------------------------- meses
  function mesAtual(agora) {
    var d = new Date(agora == null ? Date.now() : agora);   // UTC, igual a regras.js (o banco confere o mês do mesmo jeito)
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
  }
  function mesMenos(aaaamm, n) {
    var m = R.lerMes(aaaamm);
    if (!m) return '';
    var total = m.ano * 12 + (m.mes - 1) - n;
    return Math.floor(total / 12) + '-' + ('0' + (total % 12 + 1)).slice(-2);
  }

  // Pílulas de tempo da experiência -> mês de início (docs/VAGAS-TELAS.md §2.6: N = 3, 9, 24, 48 meses antes do mês atual).
  var TEMPOS = [{ id: 'menos6', rotulo: 'Menos de 6 meses', meses: 3 }, { id: '6a12', rotulo: '6 meses a 1 ano', meses: 9 },
    { id: '1a3', rotulo: '1 a 3 anos', meses: 24 }, { id: 'mais3', rotulo: 'Mais de 3 anos', meses: 48 }];
  function inicioDoTempo(id, agora) {
    var t = TEMPOS.filter(function (x) { return x.id === id; })[0];
    return t ? mesMenos(mesAtual(agora), t.meses) : '';
  }
  // Datas gravadas -> pílula mais próxima (meses contados como no cartão: início e fim inclusive).
  function tempoDoPeriodo(inicio, fim, agora) {
    var m = R.meses(inicio, fim || null, agora);
    if (!m) return '';
    if (m < 6) return 'menos6';
    if (m < 12) return '6a12';
    if (m <= 36) return '1a3';
    return 'mais3';
  }
  // Carteira assinada: Sim -> informal:false · Não -> informal:true · Prefiro não dizer -> sem a chave. O banco guarda só
  // true/false, então ao reabrir "false" volta sem pílula marcada (não dá para saber se era "Sim" ou "Prefiro não dizer").
  var CARTEIRA = [{ id: 'sim', rotulo: 'Sim' }, { id: 'nao', rotulo: 'Não' }, { id: 'nd', rotulo: 'Prefiro não dizer' }];
  function informalDe(carteira) { return carteira === 'sim' ? false : carteira === 'nao' ? true : undefined; }
  function carteiraDe(informal) { return informal === true ? 'nao' : ''; }

  // CNH: Não tem / A / B / AB / C ou mais.
  var CNH_OPCOES = [{ id: 'nao', rotulo: 'Não tem', lista: [] }, { id: 'A', rotulo: 'A', lista: ['A'] }, { id: 'B', rotulo: 'B', lista: ['B'] },
    { id: 'AB', rotulo: 'AB', lista: ['A', 'B'] }, { id: 'C', rotulo: 'C ou mais', lista: ['C'] }];
  function cnhDe(lista) {
    var l = (lista || []).map(String);
    if (l.some(function (x) { return x === 'C' || x === 'D' || x === 'E'; })) return 'C';
    if (l.indexOf('A') >= 0 && l.indexOf('B') >= 0) return 'AB';
    if (l.indexOf('A') >= 0) return 'A';
    if (l.indexOf('B') >= 0) return 'B';
    return 'nao';
  }
  function listaCnh(id) { var o = CNH_OPCOES.filter(function (x) { return x.id === id; })[0]; return o ? o.lista.slice() : []; }

  // Pretensão: a pessoa escreve reais ("1600", "1.600", "R$ 1.600,00"); o contrato guarda centavos. null = em branco; NaN = inválido.
  function centavosDe(t) {
    var s = String(t == null ? '' : t).replace(/R\$/gi, '').trim();
    if (!s) return null;
    if (!/^[\d.\s]*(,\d{0,2})?$/.test(s)) return NaN;
    var inteiro = s.split(',')[0].replace(/[.\s]/g, '');
    if (!/^\d{1,6}$/.test(inteiro)) return NaN;
    var c = Number(inteiro) * 100;
    return c > 10000000 ? NaN : c;
  }
  function reaisDe(c) { return c == null || c === '' ? '' : String(Math.round(Number(c) / 100)); }

  function formatarWhatsapp(d) {
    var s = String(d || '').replace(/\D/g, '');
    if ((s.length === 12 || s.length === 13) && s.slice(0, 2) === '55') s = s.slice(2);
    if (s.length === 11) return '(' + s.slice(0, 2) + ') ' + s.slice(2, 7) + '-' + s.slice(7);
    if (s.length === 10) return '(' + s.slice(0, 2) + ') ' + s.slice(2, 6) + '-' + s.slice(6);
    return s;
  }

  // ------------------------------------------------------------------------------------------------- estado do currículo
  function expVazia() { return { cargo: '', onde: '', tempo: '', inicio: '', fim: '', atual: false, carteira: '', datas: false }; }
  function cvVazio(op) {
    op = op || {};
    return { cidades: op.cidade ? [op.cidade] : [], zona: '', areas: [], experiencias: [expVazia()], semExperiencia: false, escolaridade: '',
      cursos: [], cnh: '', turnos: [], modalidades: [], pretensao: '', nome: '', whatsapp: '', banco: false };
  }
  function ordenar(lista, ids) { return (ids || []).filter(function (x) { return (lista || []).indexOf(x) >= 0; }); }
  function idsDe(l) { return l.map(function (x) { return x.id; }); }
  function cvDaPessoa(p, agora) {
    if (!p) return cvVazio();
    var exps = (p.experiencias || []).map(function (x) {
      return { cargo: x.funcao || '', onde: x.empregador || '', inicio: x.inicio || '', fim: x.fim || '', atual: !x.fim,
        tempo: tempoDoPeriodo(x.inicio, x.fim, agora), carteira: carteiraDe(x.informal), datas: false };
    });
    return { cidades: [p.cidade && p.cidade.slug].concat(p.cidade2 && p.cidade2.slug ? [p.cidade2.slug] : []).filter(Boolean),
      zona: p.zona ? p.zona.slug : '', areas: ordenar(p.areas, idsDe(R.AREAS)),
      experiencias: exps.length ? exps : [expVazia()], semExperiencia: !exps.length,
      escolaridade: p.escolaridade || '', cursos: (p.cursos || []).slice(), cnh: cnhDe(p.cnh), turnos: ordenar(p.turnos, idsDe(R.TURNOS)),
      modalidades: ordenar(p.modalidades, idsDe(R.MODALIDADES)), pretensao: reaisDe(p.pretensaoCentavos), nome: p.nome || '',
      whatsapp: formatarWhatsapp(p.whatsapp), banco: !!(p.bancoTalentosAte && Date.parse(p.bancoTalentosAte) > (agora == null ? Date.now() : agora)) };
  }
  // Experiência preenchida (as vazias somem do envio; a validação decide se falta algo).
  function expPreenchida(x) { return !!(x && (String(x.cargo || '').trim() || String(x.onde || '').trim() || x.tempo || x.inicio)); }
  function areasDe(cv) { return ordenar(cv.areas, idsDe(R.AREAS)); }
  function cargosDe(cv) { return areasDe(cv).map(function (a) { return R.rotulo(R.AREAS, a); }); }
  function fimDe(x, agora) { return x.atual ? '' : (x.fim || mesAtual(agora)); }
  function experienciasDe(cv, agora) {
    if (cv.semExperiencia) return [];
    return (cv.experiencias || []).filter(expPreenchida).map(function (x) {
      var e = { funcao: R.limparTexto(x.cargo, 80), inicio: x.inicio, fim: fimDe(x, agora) };
      var onde = R.limparTexto(x.onde, 120);
      if (onde) e.empregador = onde;
      var inf = informalDe(x.carteira);
      if (inf !== undefined) e.informal = inf;
      return e;
    });
  }
  // p_dados de vagas_pessoa_salvar. `sobre` e `email` não estão no desenho: voltam como estavam (o salvar troca a ficha inteira).
  function pessoaDoCv(cv, op) {
    op = op || {};
    var d = { cidade: cv.cidades[0] || '', cidade2: cv.cidades[1] || '', zona: cv.zona || '', maior18: true, cargos: cargosDe(cv), areas: areasDe(cv),
      escolaridade: cv.escolaridade || '', turnos: ordenar(cv.turnos, idsDe(R.TURNOS)), cnh: listaCnh(cv.cnh),
      modalidades: ordenar(cv.modalidades, idsDe(R.MODALIDADES)), pretensaoCentavos: centavosDe(cv.pretensao),
      cursos: (cv.cursos || []).slice(), sobre: op.sobre || '', nome: R.limparTexto(cv.nome, 120),
      whatsapp: String(cv.whatsapp || '').replace(/\D/g, ''), experiencias: experienciasDe(cv, op.agora) };
    if (op.email) d.email = op.email;
    return d;
  }

  // ------------------------------------------------------------------------------------------------- validação por passo
  // Ids dos campos: o primeiro trabalho usa os ids do desenho (#vg-exp-cargo…); os seguintes ganham -2, -3…
  function sufixo(i) { return i === 0 ? '' : '-' + (i + 1); }
  function validarPasso(n, cv, op) {
    op = op || {};
    var erros = [];
    function erro(campo, m) { erros.push({ campo: campo, msg: msg(m) }); }
    if (n === 1) {
      if (!cv.cidades.length) erro('vg-cv-cidades', MSG.CIDADE);
      else if (cv.cidades.length > 2) erro('vg-cv-cidades', MSG.CIDADE_MAX);
      var zonas = cv.cidades[0] && op.zonasDe ? op.zonasDe(cv.cidades[0]) : null;
      if (!cv.zona || (zonas && zonas.map(function (z) { return z.slug; }).indexOf(cv.zona) < 0)) erro('vg-cv-zona', MSG.ZONA);
    } else if (n === 2) {
      if (!areasDe(cv).length) erro('vg-cv-areas', MSG.AREA);
      if (!cv.semExperiencia) {
        var atual = R.lerMes(mesAtual(op.agora));
        var num = function (m) { return m.ano * 12 + m.mes; };
        var preenchidas = 0;
        (cv.experiencias || []).forEach(function (x, i) {
          if (!expPreenchida(x)) return;
          preenchidas += 1;
          var s = sufixo(i);
          var cargo = R.limparTexto(x.cargo, 80);
          if (cargo.length < 2) erro('vg-exp-cargo' + s, MSG.EXP_CARGO);
          else { var c1 = R.conferirTexto(cargo, 'cartao'); if (c1) erro('vg-exp-cargo' + s, c1.erro); }
          var c2 = R.conferirTexto(R.limparTexto(x.onde, 120), 'perfil');
          if (c2) erro('vg-exp-onde' + s, c2.erro);
          var ini = R.lerMes(x.inicio);
          if (!ini) { erro(x.datas ? 'vg-exp-inicio' + s : 'vg-exp-tempo' + s, x.datas ? 'Informe o mês de início de cada experiência (AAAA-MM).' : MSG.EXP_TEMPO); return; }
          if (num(ini) > num(atual)) { erro('vg-exp-inicio' + s, 'O início de uma experiência não pode estar no futuro.'); return; }
          if (!x.atual && x.fim) {
            var fim = R.lerMes(x.fim);
            if (!fim) erro('vg-exp-fim' + s, 'Mês de saída inválido (AAAA-MM).');
            else if (num(fim) < num(ini)) erro('vg-exp-fim' + s, 'A saída não pode ser antes do início.');
            else if (num(fim) > num(atual)) erro('vg-exp-fim' + s, 'A saída não pode estar no futuro.');
          }
        });
        if (!preenchidas) erro('vg-exp-cargo', MSG.EXP_NENHUMA);
        if (preenchidas > 10) erro('vg-exp-adicionar', MSG.EXP_MAX);
      }
    } else if (n === 3) {
      if (R.ESCOLARIDADES.map(function (e) { return e.id; }).indexOf(cv.escolaridade) < 0) erro('vg-cv-escolaridade', MSG.ESCOLARIDADE);
      if ((cv.cursos || []).length > 10) erro('vg-cv-cursos', MSG.CURSOS_MAX);
      (cv.cursos || []).some(function (c) { var x = R.conferirTexto(c, 'cartao'); if (x) erro('vg-cv-cursos', x.erro); return !!x; });
    } else if (n === 4) {
      if (!ordenar(cv.turnos, idsDe(R.TURNOS)).length) erro('vg-cv-turnos', MSG.TURNO);
      if (!ordenar(cv.modalidades, idsDe(R.MODALIDADES)).length) erro('vg-cv-modalidades', MSG.MODALIDADE);
      if (isNaN(centavosDe(cv.pretensao))) erro('vg-cv-pretensao', MSG.PRETENSAO);
      if (!R.nomeValido(R.limparTexto(cv.nome, 120))) erro('vg-cv-nome', MSG.NOME);
      if (!R.whatsappCelularValido(R.normalizarWhatsapp(cv.whatsapp))) erro('vg-cv-whatsapp', MSG.WHATSAPP);
    }
    return erros;
  }
  function primeiroPassoIncompleto(cv, op) {
    for (var n = 1; n <= 4; n++) if (validarPasso(n, cv, op).length) return n;
    return 5;
  }
  // Pronto para o banco: os 4 passos sem erro e a mesma leitura de regras.js (lerPessoa) aceita.
  function prontoParaSalvar(cv, op) {
    if (primeiroPassoIncompleto(cv, op) < 5) return false;
    return R.lerPessoa(pessoaDoCv(cv, op), op && op.agora).ok;
  }

  // ------------------------------------------------------------------------------------------------- prévia do cartão cego
  // O mesmo objeto que vagas_pessoa_minha().cartao devolve (api-previa.js cartao()): a tela mostra a prévia com a MESMA peça
  // (VAGAS_PECAS.cartaoCego) antes de salvar. Selos e "tem referência" vêm do cartão já gravado (não mudam no currículo).
  function cartaoLocal(cv, op) {
    op = op || {};
    var cid = (op.cidades || []).filter(function (c) { return c.slug === cv.cidades[0]; })[0] || null;
    var z = cid ? (cid.zonas || []).filter(function (x) { return x.slug === cv.zona; })[0] : null;
    var d = pessoaDoCv(cv, op);
    var l = R.lerPessoa(d, op.agora);
    var f = l.ok ? l.campos : { cargos: d.cargos, experiencias: d.experiencias, escolaridade: d.escolaridade, turnos: d.turnos, cnh: d.cnh,
      modalidades: d.modalidades, pretensaoCentavos: isNaN(d.pretensaoCentavos) ? null : d.pretensaoCentavos, cursos: R.listaTexto(d.cursos, 80) };
    var exps = (f.experiencias || []).map(function (x) {
      return { funcao: x.funcao, meses: R.meses(x.inicio, x.fim || null, op.agora), atual: !x.fim, informal: x.informal === true };
    });
    var antes = op.cartao || {};
    return { cidade: cid ? { slug: cid.slug, nome: cid.nome } : null, zona: z ? { slug: z.slug, nome: z.nome } : null, cargos: f.cargos.slice(),
      experiencias: exps, experienciaTotalMeses: exps.reduce(function (s, x) { return s + x.meses; }, 0),
      escolaridade: f.escolaridade, turnos: f.turnos.slice(), cnh: f.cnh.slice(), modalidades: f.modalidades.slice(),
      pretensaoCentavos: f.pretensaoCentavos, cursos: f.cursos.slice(), selos: (antes.selos || []).slice(), temReferencia: !!antes.temReferencia };
  }

  // ------------------------------------------------------------------------------------------------- candidaturas
  var FECHADAS = ['contratada', 'agora_nao', 'retirada', 'recusada'];
  function grupo(k) { return FECHADAS.indexOf(k.status) >= 0 || (k.status === 'combinou' && k.contatoCortadoEm) ? 'fechada' : 'andando'; }
  function separar(lista) {
    var g = { andando: [], fechadas: [] };
    (lista || []).forEach(function (k) { (grupo(k) === 'fechada' ? g.fechadas : g.andando).push(k); });
    return g;
  }
  function empresaDe(k) {
    if (k.combinou && k.combinou.empresa && k.combinou.empresa.nome) return k.combinou.empresa.nome;
    var e = k.anuncio && k.anuncio.empresa;
    return e && e.nome ? e.nome : 'Empresa confidencial';
  }
  function confidencialDe(k) { var e = k.anuncio && k.anuncio.empresa; return !!(e && e.confidencial && !k.empresaRevelada && !k.combinou); }
  // "empresa · situação" (docs/VAGAS-TELAS.md §2.9). "Agora não" aparece só como "candidatura encerrada", sem frase negativa.
  function subtitulo(k, fmt) {
    fmt = fmt || {};
    var rel = fmt.relativa || function (x) { return x; };
    var dia = fmt.dataCurta || function (x) { return x; };
    var s;
    if (k.status === 'enviada') s = 'enviada ' + rel(k.criadoEm);
    else if (k.status === 'conversar') s = 'chamou você para conversar';
    else if (k.status === 'combinou') s = k.contatoCortadoEm ? 'você parou de compartilhar o contato em ' + dia(k.contatoCortadoEm) : 'contato liberado em ' + dia(k.combinou && k.combinou.em);
    else if (k.status === 'contratada') s = 'contratação marcada em ' + dia(k.atualizadoEm);
    else if (k.status === 'retirada') s = 'você retirou em ' + dia(k.atualizadoEm);
    else if (k.status === 'recusada') s = 'você recusou o convite';
    else s = 'candidatura encerrada';
    var n = k.conversa && k.conversa.naoLidas ? k.conversa.naoLidas : 0;
    if (n && grupo(k) === 'andando') s += ' · ' + n + (n === 1 ? ' mensagem nova' : ' mensagens novas');
    return empresaDe(k) + ' · ' + s;
  }
  function abreConversa(k) { return ['conversar', 'combinou', 'contratada'].indexOf(k.status) >= 0; }
  function convitesPendentes(lista) { return (lista || []).filter(function (k) { return k.status === 'conversar'; }).length; }

  // ------------------------------------------------------------------------------------------------- quem viu
  // Junta os acessos (vagas_quem_viu_meu_contato) com os Combinou que ainda não abriram o contato ("ainda não abriu").
  function quemViu(acessos, candidaturas) {
    var porCand = {};
    (candidaturas || []).forEach(function (k) { porCand[k.id] = k; });
    var vistos = {};
    var itens = (acessos || []).map(function (a) {
      if (a.candidaturaId) vistos[a.candidaturaId] = true;
      var k = a.candidaturaId ? porCand[a.candidaturaId] : null;
      return { candidaturaId: a.candidaturaId || null, empresa: a.empresa, anuncio: a.anuncio, abriuEm: a.ultimaVez, vezes: a.vezes || 1,
        combinouEm: k && k.combinou ? k.combinou.em : '', cortadoEm: a.cortadoEm || '', podeCortar: !!a.podeCortar,
        podeVoltar: !!(a.cortadoEm && k && (k.status === 'combinou' || k.status === 'contratada')) };
    });
    (candidaturas || []).forEach(function (k) {
      if (vistos[k.id] || (k.status !== 'combinou' && k.status !== 'contratada')) return;
      itens.push({ candidaturaId: k.id, empresa: empresaDe(k), anuncio: k.anuncio ? k.anuncio.titulo : '', abriuEm: '', vezes: 0,
        combinouEm: k.combinou ? k.combinou.em : '', cortadoEm: k.contatoCortadoEm || '', podeCortar: !k.contatoCortadoEm, podeVoltar: !!k.contatoCortadoEm });
    });
    return itens;
  }

  // ------------------------------------------------------------------------------------------------- referências
  // Rótulos da lista da pessoa (docs/VAGAS-TELAS.md §2.13: Visível / Oculta / Pendente). As classes são as de .vg-status.
  function statusReferencia(r) {
    if (r.status === 'pendente') return { texto: 'Pendente', classe: 'conversar' };
    if (r.status === 'aceita') return r.visivel === false ? { texto: 'Oculta', classe: 'encerrada' } : { texto: 'Visível', classe: 'combinou' };
    if (r.status === 'ocultada') return { texto: 'Oculta', classe: 'encerrada' };
    if (r.status === 'recusada') return { texto: 'Você recusou', classe: 'recusada' };
    return { texto: R.rotulo(R.STATUS_REFERENCIA, r.status) || r.status, classe: 'encerrada' };
  }
  // O convite vem como "/referencia.html?t=…": vira link completo a partir DESTA página (funciona na raiz do site, em /vagas/ e no
  // artefato de prévia; nada de location.origin + caminho, que quebraria fora da raiz).
  function linkCompleto(caminho, href) {
    var c = String(caminho || '').replace(/^\/+/, '');
    if (!/^[a-z0-9-]+\.html(\?[^\s]*)?$/.test(c)) return '';
    try { return new URL(c, href).href; } catch (e) { return c; }
  }
  function mensagemPedido(empresa, link) {
    return 'Oi! Estou no Vagas sem Caos e queria pedir uma referência profissional da empresa ' + String(empresa || '').trim() + '. Leva 2 minutos: ' + link;
  }
  function mensagemWhatsappEmpresa(titulo) {
    return 'Olá! Combinamos de conversar pelo Vagas sem Caos sobre a vaga de ' + String(titulo || '').trim() + '.';
  }

  // ------------------------------------------------------------------------------------------------- outros
  function confirmaExcluir(t) { return String(t || '').trim().toUpperCase() === 'EXCLUIR'; }
  // Marcadores de revisão ([REVISÃO JURÍDICA], [REVISÃO PSICOLOGIA]) são nota da equipe, não texto para a pessoa.
  function semMarcador(t) { return String(t || '').replace(/\s*\[REVIS[ÃA]O [^\]]*\]/g, '').trim(); }
  // Rascunho do currículo é do aparelho, mas em cidade pequena o celular é dividido: só vale para a mesma conta.
  function rascunhoDaConta(r, email) {
    return r && r.dados && r.dados.cv && String(r.dados.conta || '') === String(email || '').toLowerCase() ? r : null;
  }

  var VAGAS_EU_LOGICA = {
    MSG: MSG, TEMPOS: TEMPOS, CARTEIRA: CARTEIRA, CNH_OPCOES: CNH_OPCOES, FECHADAS: FECHADAS,
    mesAtual: mesAtual, mesMenos: mesMenos, inicioDoTempo: inicioDoTempo, tempoDoPeriodo: tempoDoPeriodo, informalDe: informalDe, carteiraDe: carteiraDe,
    cnhDe: cnhDe, listaCnh: listaCnh, centavosDe: centavosDe, reaisDe: reaisDe, formatarWhatsapp: formatarWhatsapp,
    expVazia: expVazia, cvVazio: cvVazio, cvDaPessoa: cvDaPessoa, pessoaDoCv: pessoaDoCv, cargosDe: cargosDe, expPreenchida: expPreenchida,
    sufixo: sufixo, validarPasso: validarPasso, primeiroPassoIncompleto: primeiroPassoIncompleto, prontoParaSalvar: prontoParaSalvar, cartaoLocal: cartaoLocal,
    grupo: grupo, separar: separar, empresaDe: empresaDe, confidencialDe: confidencialDe, subtitulo: subtitulo, abreConversa: abreConversa,
    convitesPendentes: convitesPendentes, quemViu: quemViu, statusReferencia: statusReferencia, linkCompleto: linkCompleto,
    mensagemPedido: mensagemPedido, mensagemWhatsappEmpresa: mensagemWhatsappEmpresa, confirmaExcluir: confirmaExcluir, semMarcador: semMarcador,
    rascunhoDaConta: rascunhoDaConta
  };
  if (nodeJs) module.exports = VAGAS_EU_LOGICA;
  else root.VAGAS_EU_LOGICA = VAGAS_EU_LOGICA;
})(typeof self !== 'undefined' ? self : this);
