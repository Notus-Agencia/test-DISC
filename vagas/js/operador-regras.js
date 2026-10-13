/*
 * Vagas sem Caos — regras PURAS das telas do operador da praça (VAGAS_OPERADOR). UMD como os outros arquivos de vagas/js; o Node
 * testa sem DOM (tests/vagas-operador.test.js). Carregue depois de regras.js, textos.js, textos-conta.js, ui.js e pecas.js.
 *
 *   MSG_ASSISTIDO                              mensagem "operador_cadastro_assistido" de whatsapp.json (lembrete por WhatsApp)
 *   BOLETIM {texto, item}                      modelo "boletim_do_dia" de conteudo/vagas-textos/whatsapp.json (transcrito; o teste confere)
 *   preencher(modelo, vars) -> texto            ({{x}} sem valor some, como VAGAS_TEXTOS.t)
 *   enderecoCurto(url) -> 'vagas.gestaosemcaos.com.br/v/K7M2QX' (sem https:// nem barra no fim: é o que cabe no WhatsApp)
 *   selecionarBoletim(anuncios, periodo: 'ontem'|'24h'|'semana', {agora, fuso}) -> {vagas (até 10, mais novas antes), reaproveitadas}
 *   montarBoletim({cidade, data, vagas, total, site, slug}) -> texto pronto para colar
 *   motivosPara(motivos, alvo, decisao) -> [{chave, titulo, correcao}] (lista fechada de moderacao.json; decisões sem escolha: 1 item)
 *   porQueNaFila(anuncio) · sinaisDoAnuncio(anuncio) -> [{texto, tipo}] · marcarTrecho(texto, trecho) -> [{texto, marcado}]
 *   atrasada(iso, agoraMs) (> 24 h esperando) · rotuloPapel(papel) · codigoEvento(local, diaIso) · REPASSE(percentual)
 *   formatarIndicador(ind) / formatarGatilho(g) / contagensResumo(contagens): números da praça (vagas_op_indicadores e vagas_op_resumo).
 *     A MESMA formatação está em js/admin-vagas.js (o painel do DISC não enxerga vagas/): o teste compara as duas.
 * Nada aqui mostra dado de pessoa: o operador só vê vaga, empresa, conteúdo denunciado e o e-mail do cadastro assistido.
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var R = nodeJs ? require('./regras.js') : root.VAGAS_REGRAS;
  var P = function () { return nodeJs ? require('./pecas.js') : root.VAGAS_PECAS; };

  // conteudo/vagas-textos/whatsapp.json -> mensagens[chave = "boletim_do_dia"] (texto e formato_item), palavra por palavra.
  var BOLETIM = {
    texto: '*Vagas sem Caos · {{cidade}} · {{data}}*\n\n{{lista_vagas}}\n\n{{total_vagas}} vagas abertas hoje. Veja todas e candidate-se pelo ' +
      'celular: {{link_cidade}}\n\nÉ grátis para quem procura trabalho. A Gestão sem Caos nunca pede dinheiro, Pix ou documento para você se ' +
      'candidatar. Se alguém pedir em nosso nome, é golpe.',
    item: '• {{vaga_titulo}} · {{zona}} · {{valor}} · {{link_curto}}'
  };
  // conteudo/vagas-textos/whatsapp.json -> mensagens[chave = "operador_cadastro_assistido"] (palavra por palavra; o teste confere).
  var MSG_ASSISTIDO = 'Oi, {{pessoa_primeiro_nome}}! Começamos o seu cadastro no Vagas sem Caos. Para ele valer, confirme pelo link que foi para o ' +
    'e-mail {{email}} (olhe o spam se não achar). Só depois disso o seu cartão aparece para as empresas. Eu não vejo o seu currículo nem o seu ' +
    'contato. É grátis: se alguém pedir dinheiro em nosso nome, é golpe.';
  var MAX_BOLETIM = 10;          // conteudo/vagas-operacao/boletim-e-radio.md: até 10 vagas novas (as outras ficam no site)
  var REAPROVEITAR = 3;          // sem vaga nova: "3 vagas ainda abertas" (nunca "nada hoje")
  var HORAS_META = 24;           // meta da moderação: decidir em até 24 h (docs/VAGAS-OPERACAO.md §3.1)

  function texto(v) { return v == null ? '' : String(v); }
  function preencher(modelo, vars) {
    vars = vars || {};
    return texto(modelo).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function (m, k) { return vars[k] == null ? '' : String(vars[k]); });
  }
  function enderecoCurto(url) { return texto(url).replace(/^https?:\/\//, '').replace(/\/+$/, ''); }

  // ------------------------------------------------------------------------------------------------- boletim do dia
  function msDe(iso) { var n = Date.parse(texto(iso)); return isFinite(n) ? n : NaN; }
  function selecionarBoletim(anuncios, periodo, op) {
    op = op || {};
    var agora = op.agora == null ? Date.now() : op.agora;
    var hoje = R.hoje(op.fuso, agora);
    var desde = periodo === 'semana' ? R.somarDias(hoje, -6) : R.somarDias(hoje, -1);
    var lista = (anuncios || []).filter(function (a) { return a && isFinite(msDe(a.publicadoEm)); })
      .sort(function (a, b) { return msDe(b.publicadoEm) - msDe(a.publicadoEm); });
    var novas = lista.filter(function (a) {
      var ms = msDe(a.publicadoEm);
      if (periodo === '24h') return agora - ms <= 24 * 3600000;
      return R.hoje(op.fuso, ms) >= desde;
    });
    if (novas.length) return { vagas: novas.slice(0, MAX_BOLETIM), reaproveitadas: false, novas: novas.length };
    return { vagas: lista.slice(0, REAPROVEITAR), reaproveitadas: lista.length > 0, novas: 0 };
  }
  function itemBoletim(a, site) {
    return preencher(BOLETIM.item, {
      vaga_titulo: a.funcao || a.titulo || '',
      zona: (a.zona && a.zona.nome) || (a.cidade && a.cidade.nome) || '',
      valor: P().valorVaga(a),
      link_curto: enderecoCurto(texto(site).replace(/\/+$/, '') + '/v/' + texto(a.codigo))
    });
  }
  function montarBoletim(d) {
    d = d || {};
    var site = texto(d.site).replace(/\/+$/, '');
    return preencher(BOLETIM.texto, {
      cidade: d.cidade || '',
      data: d.data || '',
      lista_vagas: (d.vagas || []).map(function (a) { return itemBoletim(a, site); }).join('\n'),
      total_vagas: d.total == null ? (d.vagas || []).length : d.total,
      link_cidade: enderecoCurto(site + '/' + texto(d.slug)) + '/'
    });
  }

  // ------------------------------------------------------------------------------------------------- moderação
  // Motivo é SEMPRE uma chave de conteudo/vagas-textos/moderacao.json (vai em p_motivo; a empresa vê o texto dela).
  var ACOES_MOTIVO = {
    anuncio: { devolver: ['recusar', 'remover'], remover: ['remover', 'recusar'], publicar: ['publicar'] },
    empresa: { recusar: ['recusar'], suspender: ['suspender'], reativar: ['reativar'], aprovar: [] },
    referencia: { aprovar_texto: ['liberar'], recusar_texto: ['recusar'], remover: ['remover', 'recusar'] },
    denuncia: { improcedente: ['arquivar'] },
    mensagem: { procedente: ['bloquear', 'suspender'] }
  };
  var FORA_DA_LISTA = { anuncio_denuncias: 1, referencia_limite: 1 };   // automático (3 denúncias) e limite: não é decisão do operador
  function motivosPara(motivos, alvo, decisao) {
    var acoes = (ACOES_MOTIVO[alvo] && ACOES_MOTIVO[alvo][decisao]) || [];
    var todos = Object.keys(motivos || {}).map(function (k) { return Object.assign({ chave: k }, motivos[k]); })
      .filter(function (m) { return m.alvo === alvo && !FORA_DA_LISTA[m.chave] && !m.fase; });
    var saida = [];
    acoes.forEach(function (a) { todos.forEach(function (m) { if (m.acao === a) saida.push({ chave: m.chave, titulo: m.titulo, correcao: m.correcao || '' }); }); });
    return saida;
  }
  // Denúncia procedente: os motivos vêm do tipo do conteúdo denunciado (a consequência usa o mesmo motivo).
  function motivosDenuncia(motivos, alvoDenuncia) {
    if (alvoDenuncia === 'mensagem') return motivosPara(motivos, 'mensagem', 'procedente').concat(motivosPara(motivos, 'empresa', 'suspender'));
    if (alvoDenuncia === 'referencia') return motivosPara(motivos, 'referencia', 'remover');
    return motivosPara(motivos, 'anuncio', 'remover');
  }

  function porQueNaFila(a) {
    a = a || {};
    if (a.status === 'suspenso') {
      var n = Number(a.denunciasAbertas) || 0;
      return (n >= 3 ? n + ' denúncias de contas diferentes' : 'Denúncias de contas diferentes') + ' (saiu do ar sozinha)';
    }
    if (a.empresa && a.empresa.status && a.empresa.status !== 'ativa') return 'Empresa ainda em análise: confira o CNPJ antes de publicar';
    return 'Revisão obrigatória (primeiras vagas da empresa)';
  }
  var SINAL = { golpe: 'Bloqueio: pede dinheiro', contato: 'Sinal: telefone ou e-mail no texto', link: 'Sinal: link no texto',
    documento: 'Sinal: pede documento no texto', discriminacao: 'Sinal: critério discriminatório' };
  function sinaisDoAnuncio(a) {
    a = a || {};
    var s = [];
    var achado = R.conferirTexto([a.funcao || a.titulo, a.descricao, a.requisitoOutro].filter(Boolean).join(' · '), 'mensagem');
    if (achado) s.push({ texto: SINAL[achado.tipo] || 'Sinal no texto', tipo: achado.tipo, trecho: achado.trecho, forte: achado.tipo === 'golpe' });
    if (a.valor && a.valor.minCentavos > 0) s.push({ texto: a.modalidade === 'diaria' ? 'Valor do dia informado' : 'Salário informado', tipo: 'ok' });
    if (a.modalidade === 'diaria') s.push({ texto: a.diaria && a.diaria.data ? 'Data da diária informada' : 'Diária sem data', tipo: a.diaria && a.diaria.data ? 'ok' : 'sinal' });
    var n = Number(a.denunciasAbertas) || 0;
    if (n) s.push({ texto: n + (n === 1 ? ' denúncia aberta' : ' denúncias abertas'), tipo: 'denuncia' });
    return s;
  }
  // Marca o trecho achado pelo filtro dentro do texto original (sem diferença de maiúsculas e acentos).
  function semAcento(c) { return c.normalize ? c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() : c.toLowerCase(); }
  function marcarTrecho(t, trecho) {
    t = texto(t);
    var alvo = texto(trecho).trim();
    if (!alvo) return [{ texto: t, marcado: false }];
    var plano = '';
    var mapa = [];
    for (var i = 0; i < t.length; i++) { var c = semAcento(t.charAt(i)); for (var j = 0; j < c.length; j++) { plano += c.charAt(j); mapa.push(i); } }
    var busca = semAcento(alvo).replace(/\s+/g, ' ');
    var corrido = plano.replace(/\s/g, ' ');
    // Primeira ocorrência como palavra inteira ("RG" não marca o meio de "Jorge").
    var achou = -1;
    for (var k = corrido.indexOf(busca); k >= 0; k = corrido.indexOf(busca, k + 1)) {
      if (!/[a-z0-9]/.test(corrido.charAt(k - 1) || ' ') && !/[a-z0-9]/.test(corrido.charAt(k + busca.length) || ' ')) { achou = k; break; }
    }
    if (achou < 0) return [{ texto: t, marcado: false }];
    var ini = mapa[achou];
    var fim = mapa[Math.min(achou + busca.length, mapa.length) - 1] + 1;
    return [{ texto: t.slice(0, ini), marcado: false }, { texto: t.slice(ini, fim), marcado: true }, { texto: t.slice(fim), marcado: false }]
      .filter(function (p) { return p.texto; });
  }
  function atrasada(iso, agoraMs) {
    var ms = msDe(iso);
    return isFinite(ms) && (agoraMs == null ? Date.now() : agoraMs) - ms > HORAS_META * 3600000;
  }
  var PAPEIS = { operador: 'Operação', moderador: 'Moderação', admin: 'Equipe da Gestão sem Caos' };
  function rotuloPapel(p) { return PAPEIS[p] || 'Operação'; }
  // Endereço da zona a partir do nome ("Zona rural e lago" -> "zona-rural-e-lago"), no formato que vagas_adm_zona_salvar aceita.
  function slugZona(nome) { return R.normalizar(nome).replace(/ /g, '-').slice(0, 60).replace(/-+$/, ''); }
  // Código do evento do cadastro assistido (vai para vagas_contas.codigo_evento): lugar + dia, para o painel contar por mutirão.
  var LOCAIS = [{ id: 'mutirao', rotulo: 'Mutirão' }, { id: 'balcao', rotulo: 'Balcão' }, { id: 'sine', rotulo: 'SINE' }];
  function codigoEvento(local, diaIso) {
    var l = LOCAIS.some(function (x) { return x.id === local; }) ? local : 'balcao';
    return (l + '-' + texto(diaIso).replace(/-/g, '')).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  }
  // Repasse do operador na praça: número > 0 = praça com parceiro; 0 = operação própria da Gestão sem Caos; null = o banco não disse.
  function REPASSE(p) {
    if (p === null || p === undefined || p === '' || !isFinite(Number(p))) return { tipo: 'desconhecido' };
    var n = Number(p);
    return n > 0 ? { tipo: 'parceiro', percentual: n } : { tipo: 'propria', percentual: 0 };
  }

  // ------------------------------------------------------------------------------------------------- números da praça
  // >>> MESMO CÓDIGO em js/admin-vagas.js (o teste compara as saídas). Entrada: um item de vagas_op_indicadores().indicadores.
  var CORES_PADRAO = { ok: 'No alvo', atencao: 'Perto do alvo', alerta: 'Longe do alvo' };
  var SEM_DADO = {
    empresas_buscando_semana: 'Fase 2: a busca no banco de talentos ainda não existe.',
    empresas_pagantes: 'Grátis no lançamento: ainda não há vendas.',
    receita_liquida_centavos: 'Grátis no lançamento: ainda não há vendas.',
    emails_mes: 'O banco ainda não conta os e-mails do Vagas.',
    pessoas_com_selo_por_funcao: 'Os testes de habilidade ainda não estão no banco.',
    vagas_3_interessados_72h: 'Os testes de habilidade ainda não estão no banco.'
  };
  function numeroBr(n, casas) {
    var v = Number(n);
    if (!isFinite(v)) return '—';
    var f = Math.round(v * Math.pow(10, casas || 0)) / Math.pow(10, casas || 0);
    var partes = Math.abs(f).toFixed(casas || 0).split('.');
    var inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var dec = partes[1] && /[1-9]/.test(partes[1]) ? ',' + partes[1].replace(/0+$/, '') : '';
    return (f < 0 ? '−' : '') + inteiro + dec;
  }
  // Centavos -> "R$ 1.620" (inteiro) ou "R$ 14,90" (regra de dinheiro de docs/VAGAS-TELAS.md).
  function reaisBr(c) {
    var v = Math.round(Number(c));
    if (!isFinite(v)) return '—';
    var neg = v < 0;
    v = Math.abs(v);
    var cent = v % 100;
    return (neg ? '−' : '') + 'R$ ' + String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (cent ? ',' + ('0' + cent).slice(-2) : '');
  }
  function valorComUnidade(v, unidade) {
    if (v === null || v === undefined || !isFinite(Number(v))) return '—';
    if (unidade === '%') return numeroBr(v, 0) + '%';
    if (unidade === 'dias') return numeroBr(v, 1) + (Number(v) === 1 ? ' dia' : ' dias');
    if (unidade === 'horas') return numeroBr(v, 1) + ' h';
    if (unidade === 'centavos') return reaisBr(v);
    return numeroBr(v, 0);
  }
  function detalheIndicador(ind) {
    var d = ind.detalhe || {};
    var c = ind.chave;
    if (c === 'vagas_ativas' && Array.isArray(d.porArea) && d.porArea.length) {
      return 'Mais vagas: ' + d.porArea.slice(0, 3).map(function (x) { return x.nome + ' (' + numeroBr(x.valor) + ')'; }).join(', ');
    }
    if ((c === 'vagas_3_interessados_72h' || c === 'vagas_combinou_7d') && ind.semBase) return 'Ainda não há vaga com 7 dias no ar no período.';
    if (c === 'vagas_3_interessados_72h' && d.base != null) return d.comTres + ' de ' + d.base + ' vagas (últimos 30 dias)';
    if (c === 'vagas_combinou_7d' && d.base != null) return d.comCombinou + ' de ' + d.base + ' vagas (últimos 30 dias)';
    if (c === 'primeira_resposta_empresa_dias') {
      if (ind.semBase) return 'Ainda não há candidatura no período.';
      return 'mediana' + (d.semRespostaEm7DiasPct != null ? ' · ' + numeroBr(d.semRespostaEm7DiasPct) + '% sem resposta em 7 dias' : '');
    }
    if (c === 'contratacoes' && d.mes != null) return numeroBr(d.mes) + ' no mês · desde a abertura';
    if (c === 'denuncia_tempo_decisao_h') {
      var abertas = d.abertasMais24h != null ? numeroBr(d.abertasMais24h) + ' aberta(s) há mais de 24 h' : '';
      return ind.semBase ? ('Nenhuma denúncia decidida ainda.' + (abertas ? ' ' + abertas : '')) : 'mediana das últimas 30' + (abertas ? ' · ' + abertas : '');
    }
    if (c === 'fila_moderacao' && d.anuncios != null) return 'vagas ' + d.anuncios + ' · empresas ' + d.empresas + ' · referências ' + d.referencias;
    if (c === 'lista_espera' && d.pessoa != null) return 'pessoas ' + d.pessoa + ' · empresas ' + d.empresa + ' · com WhatsApp ' + d.comWhatsapp;
    if (c === 'cadastros_assistidos_confirmados' && Array.isArray(d.porMutirao) && d.porMutirao.length) {
      var u = d.porMutirao[0];
      return 'no mês · último evento: ' + u.confirmadas + ' de ' + u.criadas + ' confirmadas';
    }
    if (c === 'cadastros_assistidos_confirmados') return 'no mês';
    return '';
  }
  function formatarIndicador(ind, cores) {
    ind = ind || {};
    var rotulosCor = cores || CORES_PADRAO;
    var temValor = !ind.semDado && ind.valor !== null && ind.valor !== undefined && isFinite(Number(ind.valor));
    var temAlvo = ind.alvo !== null && ind.alvo !== undefined && isFinite(Number(ind.alvo));
    var menor = ind.direcao === 'menor_melhor';
    var alvo = '';
    if (temAlvo) {
      alvo = 'alvo ' + (menor ? 'até ' : '') + valorComUnidade(ind.alvo, ind.unidade);
      if (ind.alvoLancamento !== null && ind.alvoLancamento !== undefined && isFinite(Number(ind.alvoLancamento))) {
        alvo += ' · lançamento ' + valorComUnidade(ind.alvoLancamento, ind.unidade);
      }
    } else alvo = 'sem alvo definido';
    if (ind.hipotese) alvo += ' (hipótese)';
    var barra = null;
    if (temValor && temAlvo) {
      var v = Number(ind.valor), a = Number(ind.alvo);
      if (menor) barra = a <= 0 ? (v <= 0 ? 100 : 0) : (v <= a ? 100 : Math.round(100 * a / v));
      else barra = a <= 0 ? 100 : Math.min(100, Math.round(100 * v / a));
    }
    var cor = temValor && temAlvo && ind.cor ? ind.cor : null;
    return {
      chave: ind.chave || '', nome: ind.nome || '', valor: temValor ? valorComUnidade(ind.valor, ind.unidade) : '—', alvo: alvo,
      cor: cor, corRotulo: cor ? (rotulosCor[cor] || '') : '', barra: barra, hipotese: !!ind.hipotese, semDado: !temValor,
      nota: ind.semDado ? (SEM_DADO[ind.chave] || 'Ainda sem dado.') : detalheIndicador(ind)
    };
  }
  var SITUACAO_GATILHO = { sim: 'Atingido', nao: 'Ainda não', conferir: 'Falta conferir', fora: 'Não se aplica', fixa: 'Regra fixa' };
  function formatarGatilho(g) {
    g = g || {};
    var partes = (g.partes || []).map(function (p) {
      var estado = p.fixa ? 'fixa' : p.ok === true ? 'ok' : p.ok === false ? 'nao' : (p.manual ? 'manual' : 'sem_dado');
      return { descricao: p.descricao || '', estado: estado };
    });
    var feitas = partes.filter(function (p) { return p.estado === 'ok'; }).length;
    var fixa = partes.length > 0 && partes.every(function (p) { return p.estado === 'fixa'; });
    var sit = fixa ? 'fixa' : g.aplica === false ? 'fora' : g.atingido === true ? 'sim' : g.atingido === false ? 'nao' : 'conferir';
    return { chave: g.chave || '', nome: g.nome || '', situacao: sit, rotulo: SITUACAO_GATILHO[sit], hipotese: !!g.hipotese,
      contagem: fixa || g.aplica === false ? '' : feitas + ' de ' + partes.length, partes: partes };
  }
  // vagas_op_resumo().cidades[].contagens (as 8 contagens que existem sem a migração dos indicadores).
  var CONTAGENS = [['anunciosNoAr', 'Vagas no ar'], ['anunciosEmRevisao', 'Vagas em revisão'], ['anunciosSuspensos', 'Vagas fora do ar (denúncias)'],
    ['empresasAtivas', 'Empresas verificadas'], ['empresasEmAnalise', 'Empresas em análise'], ['denunciasAbertas', 'Denúncias abertas'],
    ['pessoas', 'Pessoas cadastradas'], ['listaEspera', 'Lista de espera']];
  function contagensResumo(c) {
    c = c || {};
    return CONTAGENS.map(function (x) { return { chave: x[0], rotulo: x[1], valor: numeroBr(Number(c[x[0]]) || 0) }; });
  }
  // <<< fim do trecho igual ao de js/admin-vagas.js

  var VAGAS_OPERADOR = {
    BOLETIM: BOLETIM, MSG_ASSISTIDO: MSG_ASSISTIDO, MAX_BOLETIM: MAX_BOLETIM, LOCAIS: LOCAIS, HORAS_META: HORAS_META,
    preencher: preencher, enderecoCurto: enderecoCurto, selecionarBoletim: selecionarBoletim, itemBoletim: itemBoletim, montarBoletim: montarBoletim,
    motivosPara: motivosPara, motivosDenuncia: motivosDenuncia, porQueNaFila: porQueNaFila, sinaisDoAnuncio: sinaisDoAnuncio, marcarTrecho: marcarTrecho,
    atrasada: atrasada, rotuloPapel: rotuloPapel, slugZona: slugZona, codigoEvento: codigoEvento, REPASSE: REPASSE,
    numeroBr: numeroBr, valorComUnidade: valorComUnidade, formatarIndicador: formatarIndicador, formatarGatilho: formatarGatilho,
    contagensResumo: contagensResumo, CORES_PADRAO: CORES_PADRAO
  };
  if (nodeJs) module.exports = VAGAS_OPERADOR;
  else root.VAGAS_OPERADOR = VAGAS_OPERADOR;
})(typeof self !== 'undefined' ? self : this);
