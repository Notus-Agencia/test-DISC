/*
 * Painel (computador): grupo "Vagas" do Vagas sem Caos dentro do painel da Gestão sem Caos. UMD: window.DISC_ADMIN_VAGAS /
 * module.exports. Só para a equipe (e_admin() no banco). Quatro abas (docs/VAGAS-TELAS.md §5):
 *   vg-cidades    cidades e praças: situação, zonas, metas, nova cidade (rascunho), pausar/reativar/abrir lista/ativar
 *   vg-operadores quem opera cada cidade: convidar, editar (papel, repasse, contrato), desligar
 *   vg-moderacao  registro de todos os atos (todas as cidades) com pendências no topo; "Reverter" onde há volta
 *   vg-numeros    os 15 indicadores da praça (vagas_op_indicadores) com alvo e cor; sem a RPC, as 8 contagens do resumo
 *
 * Por que aqui e não em vagas/: o painel está no ar em disc.gestaosemcaos.com.br e a pasta vagas/ NÃO é publicada nele
 * (_config.yml). Este arquivo não carrega nada de vagas/: as listas e a formatação que a tela precisa estão transcritas abaixo,
 * e tests/admin-vagas.test.js confere cada uma com a origem (indicadores.json, moderacao.json, vagas/js/operador-regras.js).
 *
 * De onde vêm os dados:
 *   - Supabase (painel no ar): RPCs vagas_* por fetch em <SUPABASE_URL>/rest/v1/rpc/<nome>, com o token da sessão do painel
 *     (DISC_API.sessaoAtual(): o supabase-js renova sozinho). Convite de operador: Edge Function vagas-conta, ação "operador".
 *     O grupo só aparece com a migração 20261022120000_vagas aplicada (versaoBanco).
 *   - Prévia do painel (API simulada): dados FICTÍCIOS só desta página, em memória (criarSimulada). Para não mudar a
 *     demonstração do DISC, o grupo só aparece na prévia com ?vagas=1 (lembrado na aba) ou CONFIG.VAGAS_PAINEL = true.
 * Privacidade: nenhuma tela aqui mostra dado de pessoa (as RPCs de operação nunca devolvem); só cidades, empresas, vagas,
 * atos de moderação e contagens.
 *
 * Ganchos em js/admin.js: abasDoPapel(…, vagas) põe as 4 abas; mostrarAba chama mostrar(aba, vista, ctx); verificarBanco chama
 * bancoConferido(resp); limparSessao chama esquecer(). ctx = {avisar, falhou, confirmar, abrirJanela, criarEscolha, simulada,
 * supabase, config, discApi, sessaoExpirou, contarPendencias(n)}.
 */
(function (root) {
  'use strict';

  var ABAS = ['vg-cidades', 'vg-operadores', 'vg-moderacao', 'vg-numeros'];
  var MIGRACAO = '20261022120000_vagas';
  var SITE_VAGAS = 'https://vagas.gestaosemcaos.com.br';
  var CHAVE_PREVIA = 'disc_vagas_previa';
  // Versão do contrato de operador em vigor (conteudo/vagas-textos/consentimentos.json, aceite "operador_contrato").
  var CONTRATO_OPERADOR = '2026-10-13';

  // Títulos dos motivos (conteudo/vagas-textos/moderacao.json): o registro guarda a CHAVE; a tela mostra o título.
  var MOTIVOS = {
    anuncio_discriminatorio: 'Anúncio com exigência discriminatória',
    anuncio_sem_valor: 'Sem faixa salarial ou valor da diária',
    anuncio_cobranca: 'Anúncio cobra ou pede pagamento de quem se candidata',
    anuncio_contato_fora: 'Telefone, e-mail ou link no anúncio',
    anuncio_falso: 'Vaga que parece não existir',
    anuncio_fora_do_tema: 'Não é uma vaga de trabalho',
    anuncio_teste_psicologico: 'Pede teste de personalidade ou DISC para concorrer',
    anuncio_diaria_irregular: 'Diária sem data, horário ou valor, ou com cara de emprego fixo',
    anuncio_denuncias: 'Suspensa por denúncias',
    anuncio_ok_apos_revisao: 'Revisada e publicada',
    empresa_cnpj_nao_confere: 'CNPJ não confere ou está inativo',
    empresa_sem_representacao: 'Não foi possível confirmar quem responde pela empresa',
    empresa_suspensa_golpe: 'Suspensa por pedido de dinheiro ou documento',
    empresa_suspensa_discriminacao: 'Suspensa por discriminação reincidente',
    empresa_suspensa_retaliacao: 'Suspensa por retaliar quem denunciou ou recusou',
    empresa_dados_fora_da_finalidade: 'Suspensa por usar dados fora da vaga',
    empresa_reativada: 'Conta reativada',
    mensagem_pedido_dinheiro: 'Mensagem pedia dinheiro ou pagamento',
    mensagem_pedido_documento: 'Mensagem pedia documento, senha ou código',
    mensagem_assedio: 'Assédio, ameaça ou ofensa',
    denuncia_improcedente: 'Denúncia revisada, sem problema encontrado',
    denuncia_procedente: 'Denúncia revisada e acatada',
    referencia_dado_sensivel: 'Referência com dado sensível',
    referencia_discriminatoria: 'Referência com termo discriminatório',
    referencia_contato: 'Referência com telefone, e-mail ou link',
    referencia_negativa: 'Referência com crítica, ressalva ou ofensa',
    referencia_periodo_improvavel: 'Período ou vínculo que não confere',
    referencia_denunciada: 'Removida por denúncia',
    referencia_ok: 'Referência revisada e enviada à pessoa',
    referencia_limite: 'Limite de referências',
    denuncia_golpe_confirmado: 'Golpe confirmado: resposta a quem denunciou',
    foto_indevida: 'Foto não aceita',
    referencia_qualidade_pessoal: 'Qualidade pessoal em vez de fato'
  };

  // Catálogo dos 15 indicadores (conteudo/vagas-operacao/indicadores.json, versão 2; alvo = "cidadePequena"). Usado pela prévia
  // do painel e para dar nome/unidade quando o banco ainda não manda; o teste compara com o arquivo.
  var INDICADORES = [
    ['vagas_ativas', 'Vagas ativas', 'vagas', 'agora', 'maior_melhor', 20, 15, false],
    ['pessoas_com_selo_por_funcao', 'Pessoas com selo, por teste', 'pessoas', 'agora', 'maior_melhor', 400, 150, false],
    ['vagas_3_interessados_72h', 'Vagas com 3 interessados com selo em 7 dias', '%', '30 dias', 'maior_melhor', 70, null, false],
    ['vagas_combinou_7d', 'Vagas com Combinou em 7 dias', '%', '30 dias', 'maior_melhor', 60, null, true],
    ['primeira_resposta_empresa_dias', 'Primeira resposta da empresa', 'dias', '30 dias', 'menor_melhor', 7, null, false],
    ['contratacoes', 'Contratações', 'contratações', 'acumulado e mês', 'maior_melhor', 3, null, false],
    ['empresas_ativas_mes', 'Empresas ativas por mês', 'empresas', 'mês', 'maior_melhor', 15, 10, false],
    ['empresas_buscando_semana', 'Empresas buscando no banco por semana', 'empresas', 'semana', 'maior_melhor', null, null, false],
    ['empresas_pagantes', 'Empresas pagantes (mês)', 'empresas', 'mês', 'maior_melhor', 5, null, false],
    ['receita_liquida_centavos', 'Receita líquida (mês)', 'centavos', 'mês', 'maior_melhor', null, null, false],
    ['denuncia_tempo_decisao_h', 'Tempo para decidir uma denúncia', 'horas', 'últimas 30', 'menor_melhor', 24, null, true],
    ['emails_mes', 'E-mails enviados no mês', 'e-mails', 'mês', 'menor_melhor', 3000, null, false],
    ['fila_moderacao', 'Esperando moderação há mais de 24 h', 'itens', 'agora', 'menor_melhor', 0, null, true],
    ['lista_espera', 'Pessoas na lista de espera', 'pessoas', 'agora', 'maior_melhor', 200, null, true],
    ['cadastros_assistidos_confirmados', 'Cadastros assistidos confirmados', 'contas', 'por mutirão e mês', 'maior_melhor', 45, null, true]
  ].map(function (x) {
    return { chave: x[0], nome: x[1], unidade: x[2], periodo: x[3], direcao: x[4], alvo: x[5], alvoLancamento: x[6], hipotese: x[7] };
  });
  // Os 5 testes de habilidade (vagas/js/regras.js, TESTES_SELO).
  var TESTES = [['atendimento', 'Atendimento e recepção'], ['vendas', 'Vendas'], ['administrativo', 'Rotinas administrativas'],
    ['caixa', 'Operação de caixa'], ['portugues', 'Português para o trabalho']];

  var STATUS_CIDADE = { rascunho: 'Rascunho', lista_espera: 'Lista de espera', ativa: 'Ativa', pausada: 'Pausada' };
  var PAPEIS = { operador: 'Operação', moderador: 'Moderação', admin: 'Equipe', sistema: 'Sistema', empresa: 'Empresa' };
  var ATOS = {
    anuncio_publicar: 'Publicou a vaga', anuncio_devolver: 'Devolveu a vaga com ajuste', anuncio_remover: 'Removeu a vaga',
    anuncio_assistido: 'Publicou vaga assistida', suspender_por_denuncias: 'Tirou a vaga do ar (3 denúncias)',
    empresa_aprovar: 'Conferiu e liberou a empresa', empresa_recusar: 'Recusou o cadastro da empresa', empresa_suspender: 'Suspendeu a empresa',
    empresa_reativar: 'Reativou a empresa', empresa_cadastrar: 'Cadastrou empresa no balcão', empresa_vincular_membro: 'Deu acesso à empresa',
    referencia_aprovar_texto: 'Publicou o texto da referência', referencia_recusar_texto: 'Não publicou o texto da referência',
    referencia_remover: 'Removeu a referência', denuncia_procedente: 'Denúncia procedente', denuncia_improcedente: 'Denúncia improcedente',
    conta_suspender: 'Suspendeu uma conta', cadastro_assistido: 'Cadastro assistido', cidade_salvar: 'Alterou a cidade',
    zona_salvar: 'Alterou uma zona', operador_salvar: 'Alterou um operador'
  };
  var ALVOS = { anuncio: 'Vaga', empresa: 'Empresa', denuncia: 'Denúncia', referencia: 'Referência', conta: 'Conta', cidade: 'Cidade',
    zona: 'Zona', operador: 'Operador' };
  var TIPOS_ATO = [{ valor: '', rotulo: 'Todos os atos' }, { valor: 'anuncio', rotulo: 'Vagas' }, { valor: 'empresa', rotulo: 'Empresas' },
    { valor: 'denuncia', rotulo: 'Denúncias' }, { valor: 'referencia', rotulo: 'Referências' }, { valor: 'conta', rotulo: 'Contas e cadastros' },
    { valor: 'cidade', rotulo: 'Cidades, zonas e operadores' }];

  /* ------------------------------------------------------------------------------------------------- funções puras */

  function texto(v) { return v == null ? '' : String(v); }
  function semAcento(s) { return texto(s).normalize ? texto(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '') : texto(s); }

  // Na prévia do painel o grupo só aparece quando pedido (?vagas=1, lembrado na aba; ?vagas=0 desliga) ou CONFIG.VAGAS_PAINEL.
  function previaLigada(config, loc, ss) {
    if (config && config.VAGAS_PAINEL === true) return true;
    var busca = texto(loc && loc.search);
    try {
      if (/[?&]vagas=0\b/.test(busca)) { if (ss) ss.removeItem(CHAVE_PREVIA); return false; }
      if (/[?&]vagas=(1|sim)\b/.test(busca)) { if (ss) ss.setItem(CHAVE_PREVIA, '1'); return true; }
      return !!(ss && ss.getItem(CHAVE_PREVIA) === '1');
    } catch (e) { return /[?&]vagas=(1|sim)\b/.test(busca); }
  }
  // O banco tem o Vagas? Só quando o versao_banco declara uma versão igual ou posterior à migração do Vagas E não a lista como
  // faltando (banco antigo sem versao_banco, versão anterior ou migração faltando: não). null = ainda não conferido.
  function bancoTemVagas(resp) {
    if (!resp || resp.ok !== true || resp.semFuncao) return false;
    if (!(Number(resp.versao) >= Number(MIGRACAO.slice(0, 14)))) return false;
    var falt = Array.isArray(resp.faltando) ? resp.faltando.map(String) : [];
    return falt.indexOf(MIGRACAO) === -1;
  }
  // As 4 abas aparecem? op: {simulada, supabase, config, discApi, banco (true|false|null), local, sessionStorage}
  function disponivel(op) {
    op = op || {};
    if (op.simulada) return previaLigada(op.config, op.local, op.sessionStorage);
    if (!op.supabase) return false;
    var api = op.discApi;
    var cfg = op.config || {};
    return !!(api && typeof api.sessaoAtual === 'function' && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && op.banco === true);
  }

  function rotuloStatusCidade(c) {
    if (!c) return '';
    var s = STATUS_CIDADE[c.status] || c.status || '';
    return c.praca && c.status === 'ativa' ? s + ' (entorno)' : s;
  }
  // "Praça: Uruaçu + Fulana · operação própria · desde 20/10/2026" (sem cidade fixa: tudo do dado).
  function linhaPraca(c, cidades, operadores) {
    if (!c) return '';
    var partes = [];
    if (c.praca) {
      var polo = (cidades || []).filter(function (x) { return x.slug === c.praca; })[0];
      partes.push('Entorno de ' + (polo ? polo.nome : c.praca) + ': aparece em "incluir entorno"');
    } else {
      var entorno = (cidades || []).filter(function (x) { return x.praca === c.slug; }).map(function (x) { return x.nome; });
      if (entorno.length) partes.push('Praça: ' + [c.nome].concat(entorno).join(' + '));
    }
    var ops = (operadores || []).filter(function (o) { return o.cidade && (o.cidade.slug || o.cidade) === c.slug && o.ativo !== false; });
    if (ops.length) {
      var parceiro = ops.some(function (o) { return Number(o.repassePercentual) > 0; });
      partes.push(parceiro ? 'operada por parceiro' : 'operação própria');
    } else if (operadores) partes.push('sem operador');
    return partes.join(' · ');
  }
  // Mudança de situação: o efeito em uma frase (confirmação na página, VAGAS-TELAS §5).
  function efeitoStatus(c, novo) {
    var k = (c && c.contagens) || {};
    var n = Number(k.anunciosNoAr) || 0;
    var nome = c ? c.nome : '';
    if (novo === 'pausada') return 'Pausar ' + nome + ' esconde ' + n + (n === 1 ? ' vaga' : ' vagas') + ' e bloqueia cadastros novos; nada é apagado.';
    if (novo === 'ativa' && c && c.status === 'pausada') return 'Reativar ' + nome + ' volta a mostrar as vagas que estão no prazo e libera os cadastros.';
    if (novo === 'ativa') return 'Ativar ' + nome + ' abre o mural e os cadastros de pessoas, empresas e vagas. Quem está na lista de espera pode ser avisado.';
    if (novo === 'lista_espera') return 'Abrir a lista de espera de ' + nome + ' mostra a cidade como "ainda não chegamos" e recebe e-mails de interessados.';
    return '';
  }
  // Ativar uma cidade em lista de espera: só quando a meta de interessados foi batida (sem meta, liberado).
  function faltamParaAtivar(c) {
    if (!c || c.status !== 'lista_espera' || c.metaListaEspera == null) return 0;
    var na = Number((c.contagens || {}).listaEspera) || 0;
    return Math.max(0, Number(c.metaListaEspera) - na);
  }
  function slugCidade(nome, uf) {
    var base = semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    var u = semAcento(uf).toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
    return base && u.length === 2 ? (base + '-' + u).slice(0, 60) : '';
  }
  // Conferência da janela "Nova cidade"/"Editar" antes de ir ao banco (o banco confere de novo).
  function lerCidade(d, nova) {
    d = d || {};
    var nome = texto(d.nome).replace(/\s+/g, ' ').trim();
    var uf = texto(d.uf).trim().toUpperCase();
    var slug = texto(d.slug).trim().toLowerCase();
    var ibge = texto(d.ibge).replace(/\D/g, '');
    if (nome.length < 2 || nome.length > 80) return { ok: false, erro: 'Informe o nome da cidade.' };
    if (!/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: 'Informe a UF com 2 letras.' };
    if (nova && (!/^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$/.test(slug) || slug.length > 60)) {
      return { ok: false, erro: 'Endereço inválido: só letras sem acento, números e hífen, terminando com a UF.' };
    }
    if (ibge && ibge.length !== 7) return { ok: false, erro: 'O código IBGE tem 7 números.' };
    var meta = texto(d.metaListaEspera).trim();
    if (meta && !/^\d{1,6}$/.test(meta)) return { ok: false, erro: 'A meta da lista de espera é um número inteiro.' };
    var dados = { slug: slug, nome: nome, uf: uf, ibge: ibge || null };
    if (d.praca !== undefined) dados.praca = texto(d.praca) || null;
    if (d.porte !== undefined) dados.porte = d.porte === 'pequena' || d.porte === 'grande' ? d.porte : null;
    if (meta) dados.metaListaEspera = Number(meta);
    if (nova) dados.status = 'rascunho';
    return { ok: true, dados: dados };
  }
  function lerOperador(d) {
    d = d || {};
    var email = texto(d.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { ok: false, erro: 'E-mail inválido.' };
    if (!texto(d.cidade)) return { ok: false, erro: 'Escolha a cidade.' };
    var papel = d.papel === 'moderador' ? 'moderador' : d.papel === 'operador' ? 'operador' : '';
    if (!papel) return { ok: false, erro: 'Escolha o papel.' };
    var rp = texto(d.repassePercentual).replace(',', '.').trim();
    var n = rp === '' ? 0 : Number(rp);
    if (!isFinite(n) || n < 0 || n > 100) return { ok: false, erro: 'Percentual de repasse inválido (0 a 100).' };
    return { ok: true, dados: { cidade: texto(d.cidade), email: email, papel: papel, repassePercentual: n, contratoVersao: texto(d.contratoVersao).trim().slice(0, 40) } };
  }
  function rotuloAto(acao) {
    if (ATOS[acao]) return ATOS[acao];
    var t = texto(acao).replace(/_/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function tituloMotivo(m) { return MOTIVOS[m] || texto(m); }
  // Volta que as RPCs atuais já permitem (o resto espera vagas_op_reverter, pedido ao banco).
  function reversao(r) {
    if (!r || !r.alvoId) return null;
    if (r.acao === 'empresa_suspender') return { rpc: 'vagas_op_empresa_decidir', args: { p_empresa: r.alvoId, p_acao: 'reativar', p_motivo: 'empresa_reativada' }, rotulo: 'Reativar a empresa' };
    if (r.acao === 'suspender_por_denuncias') return { rpc: 'vagas_op_anuncio_decidir', args: { p_anuncio: r.alvoId, p_acao: 'publicar', p_motivo: 'anuncio_ok_apos_revisao' }, rotulo: 'Publicar a vaga de novo' };
    return null;
  }
  function pendencias(c) {
    var k = (c && c.contagens) || {};
    return (Number(k.anunciosEmRevisao) || 0) + (Number(k.anunciosSuspensos) || 0) + (Number(k.empresasEmAnalise) || 0) + (Number(k.denunciasAbertas) || 0);
  }
  function filtrarAtos(registros, f) {
    f = f || {};
    var busca = semAcento(f.busca).toLowerCase().trim();
    return (registros || []).filter(function (r) {
      if (f.cidade && r.cidade !== f.cidade) return false;
      if (f.tipo) {
        var alvo = r.alvo === 'zona' || r.alvo === 'operador' ? 'cidade' : r.alvo;
        if (alvo !== f.tipo) return false;
      }
      if (!busca) return true;
      return semAcento([rotuloAto(r.acao), r.alvoNome, tituloMotivo(r.motivo), PAPEIS[r.papel], r.quem].join(' ')).toLowerCase().indexOf(busca) >= 0;
    });
  }

  // >>> MESMO CÓDIGO de vagas/js/operador-regras.js (o painel não enxerga vagas/; tests/admin-vagas.test.js compara as saídas).
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
  // <<< fim do trecho igual ao de vagas/js/operador-regras.js

  /* ------------------------------------------------------------------------------------------------- fontes de dados */

  function erroDe(json, extra) {
    var e = new Error((json && json.erro) || 'O servidor recusou a solicitação.');
    e.resposta = json || null;
    ['sessaoExpirada', 'bancoDesatualizado', 'semConta', 'suspensa', 'existe'].forEach(function (k) { if (json && json[k]) e[k] = true; });
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  var MSG_BANCO = 'O banco ainda não tem esta parte do Vagas sem Caos. Peça para aplicar as migrações do Vagas (docs/SUPABASE.md).';
  var MSG_CONEXAO = 'Não foi possível conectar ao servidor. Verifique a internet e tente de novo.';

  // Supabase: RPC por fetch com o token da sessão do painel (renovado pelo supabase-js do DISC_API).
  function criarSupabase(op) {
    var url = texto(op.url).replace(/\/+$/, '');
    var chave = texto(op.chave);
    var buscar = op.fetch || (root.fetch && root.fetch.bind(root));
    function token() {
      return Promise.resolve().then(function () { return op.sessao(); }).then(function (s) {
        if (!s || !s.token) throw erroDe({ erro: 'Sessão expirada. Entre de novo.', sessaoExpirada: true });
        return s.token;
      }, function (e) { if (e && e.sessaoExpirada) throw e; throw erroDe({ erro: 'Sessão expirada. Entre de novo.', sessaoExpirada: true }); });
    }
    function postar(caminho, corpo) {
      return token().then(function (t) {
        return buscar(url + caminho, { method: 'POST', headers: { apikey: chave, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo || {}) }).catch(function () { throw erroDe({ erro: MSG_CONEXAO }, { conexao: true }); });
      }).then(function (r) {
        return r.text().then(function (txt) {
          var json = null;
          try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
          if (r.status === 401) throw erroDe({ erro: 'Sessão expirada. Entre de novo.', sessaoExpirada: true });
          if (!r.ok) {
            if (json && (json.code === 'PGRST202' || json.code === '42883')) throw erroDe({ erro: MSG_BANCO, bancoDesatualizado: true });
            throw erroDe({ erro: (json && (json.erro || json.message)) || 'O servidor recusou a solicitação.' });
          }
          if (typeof json === 'string') { try { json = JSON.parse(json); } catch (e) { json = null; } }
          if (!json || json.ok !== true) throw erroDe(json && typeof json === 'object' ? json : null);
          return json;
        });
      });
    }
    return {
      tipo: 'supabase',
      rpc: function (nome, args) {
        if (!/^vagas_(op|adm)_[a-z_]+$|^vagas_cidades_publicas$/.test(nome)) return Promise.reject(erroDe({ erro: 'Função não permitida.' }));
        return postar('/rest/v1/rpc/' + nome, args || {});
      },
      conta: function (acao, corpo) { return postar('/functions/v1/vagas-conta', Object.assign({ acao: acao }, corpo || {})); }
    };
  }

  // Prévia do painel: dados FICTÍCIOS em memória (somem ao recarregar). A cidade do piloto é a da semente da prévia do Vagas.
  function criarSimulada(op) {
    op = op || {};
    var agora = op.agora || function () { return Date.now(); };
    var H = 3600000, D = 24 * H;
    var t0 = agora();
    function iso(ms) { return new Date(ms).toISOString(); }
    function contagens(n) {
      return { anunciosNoAr: n[0], anunciosEmRevisao: n[1], anunciosSuspensos: n[2], empresasAtivas: n[3], empresasEmAnalise: n[4], denunciasAbertas: n[5], pessoas: n[6], listaEspera: n[7] };
    }
    var st = {
      cidades: [
        { id: 'cid-1', slug: 'uruacu-go', nome: 'Uruaçu', uf: 'GO', ibge: '5221601', fuso: 'America/Sao_Paulo', status: 'ativa', porte: 'pequena', praca: null,
          metaListaEspera: null, ordem: 1, contagens: contagens([14, 2, 1, 11, 1, 1, 163, 0]),
          zonas: [['centro', 'Centro', ['Centro', 'Setor Central', 'Vila Santana', 'Loteamento Santana']], ['regiao-norte', 'Região Norte', ['Francisco Martins']],
            ['regiao-sul', 'Região Sul', ['Setor Sul', 'Setor Sul I']], ['regiao-leste', 'Região Leste', []], ['regiao-oeste', 'Região Oeste', []],
            ['zona-rural', 'Zona rural e lago', ['Zona rural', 'Geriaçu', 'Beira do Lago de Serra da Mesa']]] },
        { id: 'cid-2', slug: 'cidade-exemplo-a-go', nome: 'Cidade Exemplo A', uf: 'GO', ibge: null, fuso: 'America/Sao_Paulo', status: 'lista_espera', porte: 'pequena',
          praca: null, metaListaEspera: 200, ordem: 2, contagens: contagens([0, 0, 0, 0, 0, 0, 0, 64]), zonas: [] },
        { id: 'cid-3', slug: 'cidade-exemplo-b-go', nome: 'Cidade Exemplo B', uf: 'GO', ibge: null, fuso: 'America/Sao_Paulo', status: 'rascunho', porte: null,
          praca: null, metaListaEspera: null, ordem: 3, contagens: contagens([0, 0, 0, 0, 0, 0, 0, 0]), zonas: [] }
      ].map(function (c) {
        c.zonas = c.zonas.map(function (z, i) { return { slug: z[0], nome: z[1], bairros: z[2], ordem: i + 1, ativa: true }; });
        return c;
      }),
      operadores: [
        { email: 'operador@previa.com', cidade: 'uruacu-go', papel: 'operador', ativo: true, repassePercentual: 0, contratoVersao: CONTRATO_OPERADOR,
          contratoAceitoEm: iso(t0 - 19 * D), criadoEm: iso(t0 - 20 * D), ultimoAto: { acao: 'cadastro_assistido', em: iso(t0 - 2 * H) } },
        { email: 'moderacao@previa.com', cidade: 'uruacu-go', papel: 'moderador', ativo: true, repassePercentual: 0, contratoVersao: CONTRATO_OPERADOR,
          contratoAceitoEm: iso(t0 - 12 * D), criadoEm: iso(t0 - 12 * D), ultimoAto: { acao: 'anuncio_publicar', em: iso(t0 - 26 * H) } },
        { email: 'parceiro@exemplo.com', cidade: 'cidade-exemplo-a-go', papel: 'operador', ativo: true, repassePercentual: 50, contratoVersao: '',
          contratoAceitoEm: null, criadoEm: iso(t0 - 3 * D), ultimoAto: null }
      ],
      moderacao: [
        [2 * H, 'operador', 'cadastro_assistido', 'conta', null, '', 'Conta pendente (mutirão)'],
        [3 * H, 'operador', 'anuncio_devolver', 'anuncio', 'anu-1', 'anuncio_contato_fora', 'Auxiliar de limpeza · Clínica Exemplo'],
        [20 * H, 'sistema', 'suspender_por_denuncias', 'anuncio', 'anu-2', '', 'Digitador(a) em casa · Empresa Suspeita (prévia)'],
        [26 * H, 'moderador', 'anuncio_publicar', 'anuncio', 'anu-3', 'anuncio_ok_apos_revisao', 'Atendente de loja · Loja Exemplo'],
        [30 * H, 'operador', 'empresa_aprovar', 'empresa', 'emp-1', '', 'Clínica Exemplo'],
        [50 * H, 'operador', 'empresa_suspender', 'empresa', 'emp-2', 'empresa_suspensa_golpe', 'Empresa Suspeita (prévia)'],
        [4 * D, 'admin', 'cidade_salvar', 'cidade', 'cid-2', '', 'Cidade Exemplo A']
      ].map(function (x, i) {
        return { id: i + 1, em: iso(t0 - x[0]), papel: x[1], acao: x[2], alvo: x[3], alvoId: x[4], motivo: x[5], dados: {}, cidade: i === 6 ? 'cidade-exemplo-a-go' : 'uruacu-go', alvoNome: x[6] };
      }),
      seq: 100
    };
    function ok(o) { return Promise.resolve(Object.assign({ ok: true }, JSON.parse(JSON.stringify(o)))); }
    function erro(msg) { return Promise.reject(erroDe({ erro: msg })); }
    function cidade(slug) { return st.cidades.filter(function (c) { return c.slug === slug; })[0] || null; }
    function registrar(cid, acao, alvo, alvoId, motivo, nome) {
      st.moderacao.unshift({ id: ++st.seq, em: iso(agora()), papel: 'admin', acao: acao, alvo: alvo, alvoId: alvoId, motivo: motivo || '', dados: {}, cidade: cid, alvoNome: nome || '' });
    }
    function indicadores(c) {
      var porte = c.porte;
      var k = c.contagens;
      var aberta = c.status === 'ativa';
      var valores = {
        vagas_ativas: [k.anunciosNoAr, 'ok', { porTeste: { atendimento: 3, vendas: 2, administrativo: 1, caixa: 2, portugues: 0 },
          porArea: aberta ? [{ area: 'atendimento', nome: 'Atendimento e recepção', valor: 4 }, { area: 'caixa', nome: 'Caixa e operação de loja', valor: 3 }, { area: 'cozinha', nome: 'Cozinha e restaurante', valor: 2 }] : [] }],
        pessoas_com_selo_por_funcao: [aberta ? 58 : 0, null, { porTeste: aberta ? { atendimento: 24, vendas: 12, administrativo: 9, caixa: 10, portugues: 3 } : {} }],
        vagas_3_interessados_72h: [aberta ? 33 : null, null, aberta ? { base: 9, comTres: 3, janelaHoras: 168 } : {}, !aberta],
        vagas_combinou_7d: [aberta ? 44 : null, null, aberta ? { base: 9, comCombinou: 4 } : {}, !aberta],
        primeira_resposta_empresa_dias: [aberta ? 2.4 : null, null, aberta ? { base: 41, semRespostaEm7DiasPct: 12 } : {}, !aberta],
        contratacoes: [aberta ? 2 : 0, null, { mes: aberta ? 2 : 0 }],
        empresas_ativas_mes: [k.empresasAtivas ? 8 : 0, null, {}],
        empresas_buscando_semana: [null, null, {}, false, true],
        empresas_pagantes: [null, null, {}, false, true],
        receita_liquida_centavos: [null, null, {}, false, true],
        denuncia_tempo_decisao_h: [aberta ? 9 : null, null, { base: aberta ? 6 : 0, abertasMais24h: 0 }, !aberta],
        emails_mes: [null, null, {}, false, true],
        fila_moderacao: [aberta ? 1 : 0, null, { anuncios: aberta ? 1 : 0, empresas: 0, referencias: 0 }],
        lista_espera: [k.listaEspera, null, { pessoa: k.listaEspera, empresa: 0, comWhatsapp: Math.floor(k.listaEspera / 2) }],
        cadastros_assistidos_confirmados: [aberta ? 21 : 0, null, { porMutirao: aberta ? [{ codigoEvento: 'mutirao-exemplo', criadas: 26, confirmadas: 21 }] : [] }]
      };
      function cor(v, alvo, dir) {
        if (v === null || alvo === null) return null;
        if (dir === 'menor_melhor') return v <= alvo ? 'ok' : (v <= alvo * 1.3 ? 'atencao' : 'alerta');
        return v >= alvo ? 'ok' : (v >= alvo * 0.7 ? 'atencao' : 'alerta');
      }
      var lista = INDICADORES.map(function (i) {
        var x = valores[i.chave];
        var alvo = porte === 'pequena' ? i.alvo : null;
        var lanc = porte === 'pequena' ? i.alvoLancamento : null;
        return { chave: i.chave, nome: i.nome, unidade: i.unidade, periodo: i.periodo, direcao: i.direcao, hipotese: i.hipotese, valor: x[0],
          alvo: alvo, alvoLancamento: lanc, cor: x[4] ? null : cor(x[0], alvo, i.direcao), semDado: !!x[4], semBase: !!x[3], detalhe: x[2] };
      });
      var v = function (ch) { return lista.filter(function (i) { return i.chave === ch; })[0]; };
      var aplica = porte === 'pequena';
      var parte = function (desc, okv, extra) { return Object.assign({ descricao: desc, ok: okv }, extra || {}); };
      var gat = [
        { chave: 'antes_de_cobrar', nome: 'Pode começar a cobrar a empresa', hipotese: true, aplica: aplica, partes: aplica ? [
          parte('Vagas no ar: 15 ou mais', v('vagas_ativas').valor >= 15), parte('Empresas ativas no mês: 10 ou mais', v('empresas_ativas_mes').valor >= 10),
          parte('Pessoas com selo: 150 ou mais', v('pessoas_com_selo_por_funcao').valor >= 150), parte('Vagas com 3 interessados com selo na janela: 70% ou mais', (v('vagas_3_interessados_72h').valor || 0) >= 70),
          parte('Contratações: 3 ou mais', v('contratacoes').valor >= 3)] : [] },
        { chave: 'praca_viva', nome: 'Praça viva (6 meses)', hipotese: false, aplica: aplica, partes: aplica ? [
          parte('Vagas no ar: 20 ou mais', v('vagas_ativas').valor >= 20), parte('Pessoas com selo: 400 ou mais', v('pessoas_com_selo_por_funcao').valor >= 400),
          parte('Empresas ativas no mês: 15 ou mais', v('empresas_ativas_mes').valor >= 15), parte('Empresas pagantes no mês: 5 ou mais', null, { semDado: true }),
          parte('Primeira resposta da empresa: até 7 dias', (v('primeira_resposta_empresa_dias').valor || 99) <= 7)] : [] },
        { chave: 'abrir_proxima', nome: 'Abrir outra praça (só quando o dono decidir; nenhuma cidade escolhida)', hipotese: true, aplica: aplica, partes: aplica ? [
          parte('Decisão do dono de abrir outra praça', null, { manual: true }), parte('Praça viva em 2 meses seguidos', false, { manual: true }),
          parte('Lista de espera da próxima cidade: 200 ou mais (veja o painel dela)', null, { manual: true }), parte('Parceiro local com contrato assinado', null, { manual: true })] : [] },
        { chave: 'trocar_parceiro', nome: 'Trocar o parceiro', hipotese: false, aplica: true, partes: [
          parte('Praça operada por parceiro: 90 dias de contrato sem concluir os passos 3 a 9 do manual', null, { manual: true }),
          parte('Falta grave (acesso indevido, cobrança de pessoa, uso da base)', null, { manual: true })] },
        { chave: 'pessoa_nao_paga', nome: 'A pessoa não paga nada', hipotese: false, aplica: true, partes: [
          parte('Quem procura emprego não paga nada: não existe produto pago para a pessoa', true, { fixa: true })] }
      ].map(function (g) {
        var ps = g.partes;
        g.atingido = !g.aplica || !ps.length ? null : ps.some(function (p) { return p.ok === false; }) ? false : ps.some(function (p) { return typeof p.ok !== 'boolean'; }) ? null : true;
        return g;
      });
      return { cidade: { slug: c.slug, nome: c.nome, uf: c.uf, status: c.status, porte: c.porte, fuso: c.fuso },
        praca: [{ slug: c.slug, nome: c.nome, status: c.status }].concat(st.cidades.filter(function (x) { return x.praca === c.slug; }).map(function (x) { return { slug: x.slug, nome: x.nome, status: x.status }; })),
        mes: iso(agora()).slice(0, 7), geradoEm: iso(agora()), indicadores: lista, gatilhos: gat };
    }
    var H_ = {
      vagas_op_resumo: function () {
        return ok({ cidades: st.cidades.map(function (c) { return { id: c.id, slug: c.slug, nome: c.nome, status: c.status, papel: 'admin', contagens: c.contagens }; }) });
      },
      vagas_cidades_publicas: function () {
        return ok({ cidades: st.cidades.filter(function (c) { return c.status === 'ativa' || c.status === 'lista_espera'; }).map(function (c) {
          return { id: c.id, slug: c.slug, nome: c.nome, uf: c.uf, status: c.status, fuso: c.fuso, praca: c.praca,
            zonas: c.zonas.filter(function (z) { return z.ativa; }).map(function (z) { return { slug: z.slug, nome: z.nome, bairros: z.bairros }; }),
            interessados: c.status === 'lista_espera' ? Math.floor(c.contagens.listaEspera / 10) * 10 : null, metaListaEspera: c.metaListaEspera };
        }) });
      },
      vagas_adm_cidades: function () { return ok({ cidades: st.cidades }); },
      vagas_adm_cidade_salvar: function (a) {
        var d = a.p_dados || {};
        var c = cidade(d.slug);
        if (!c) {
          if (!/^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$/.test(texto(d.slug))) return erro('Endereço da cidade inválido.');
          c = { id: 'cid-' + (++st.seq), slug: d.slug, nome: '', uf: '', ibge: null, fuso: 'America/Sao_Paulo', status: 'rascunho', porte: null, praca: null,
            metaListaEspera: null, ordem: st.cidades.length + 1, contagens: contagens([0, 0, 0, 0, 0, 0, 0, 0]), zonas: [] };
          st.cidades.push(c);
        }
        if (d.praca && !cidade(d.praca)) return erro('Cidade-polo não encontrada.');
        ['nome', 'uf', 'ibge', 'status', 'porte', 'praca', 'metaListaEspera'].forEach(function (k) { if (Object.prototype.hasOwnProperty.call(d, k)) c[k] = d[k]; });
        registrar(c.slug, 'cidade_salvar', 'cidade', c.id, '', c.nome);
        return ok({ cidade: c });
      },
      vagas_adm_zona_salvar: function (a) {
        var d = a.p_dados || {};
        var c = cidade(d.cidade);
        if (!c) return erro('Cidade não encontrada.');
        if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(texto(d.slug))) return erro('Endereço da zona inválido.');
        if (texto(d.nome).trim().length < 2) return erro('Dados da zona inválidos. Confira o nome.');
        var z = c.zonas.filter(function (x) { return x.slug === d.slug; })[0];
        if (!z) { z = { slug: d.slug, ordem: c.zonas.length + 1 }; c.zonas.push(z); }
        z.nome = texto(d.nome).trim(); z.bairros = (d.bairros || []).slice(0, 60); z.ativa = d.ativa !== false;
        if (d.ordem != null) z.ordem = Number(d.ordem) || z.ordem;
        registrar(c.slug, 'zona_salvar', 'zona', null, '', z.nome);
        return ok({ zona: z });
      },
      vagas_adm_operadores: function () {
        return ok({ operadores: st.operadores.map(function (o) { var c = cidade(o.cidade); return Object.assign({}, o, { cidade: { slug: o.cidade, nome: c ? c.nome : o.cidade } }); }) });
      },
      vagas_adm_operador_salvar: function (a) {
        var d = a.p_dados || {};
        if (!cidade(d.cidade)) return erro('Cidade não encontrada.');
        var o = st.operadores.filter(function (x) { return x.email === d.email && x.cidade === d.cidade; })[0];
        if (!o) return erro('Não há conta de operação com este e-mail. Use o convite de operador.');
        if (d.papel) o.papel = d.papel;
        if (d.ativo !== undefined) o.ativo = d.ativo !== false;
        if (d.repassePercentual !== undefined) o.repassePercentual = Number(d.repassePercentual) || 0;
        if (d.contratoVersao !== undefined) o.contratoVersao = d.contratoVersao;
        registrar(o.cidade, 'operador_salvar', 'operador', null, '', o.email);
        return ok({ operador: { cidade: o.cidade, papel: o.papel, ativo: o.ativo, repassePercentual: o.repassePercentual, contratoVersao: o.contratoVersao } });
      },
      vagas_op_moderacao: function (a) {
        var f = a.p_filtro || {};
        return ok({ registros: st.moderacao.filter(function (m) { return !f.cidade || m.cidade === f.cidade; }).slice(0, Math.min(Number(f.limite) || 100, 200)) });
      },
      vagas_op_indicadores: function (a) {
        var c = cidade(a.p_cidade);
        return c ? ok(indicadores(c)) : erro('Cidade não encontrada.');
      },
      vagas_op_empresa_decidir: function (a) {
        if (a.p_acao !== 'reativar') return erro('Ação inválida.');
        var r = st.moderacao.filter(function (m) { return m.alvoId === a.p_empresa; })[0];
        registrar(r ? r.cidade : '', 'empresa_reativar', 'empresa', a.p_empresa, a.p_motivo, r ? r.alvoNome : '');
        return ok({ empresa: { id: a.p_empresa, status: 'ativa' } });
      },
      vagas_op_anuncio_decidir: function (a) {
        if (a.p_acao !== 'publicar') return erro('Ação inválida.');
        var r = st.moderacao.filter(function (m) { return m.alvoId === a.p_anuncio; })[0];
        registrar(r ? r.cidade : '', 'anuncio_publicar', 'anuncio', a.p_anuncio, a.p_motivo, r ? r.alvoNome : '');
        return ok({ anuncio: { id: a.p_anuncio, status: 'publicado' } });
      }
    };
    return {
      tipo: 'simulada',
      rpc: function (nome, args) {
        if (!H_[nome]) return Promise.reject(erroDe({ erro: MSG_BANCO, bancoDesatualizado: true }));
        return Promise.resolve().then(function () { return H_[nome](args || {}); });
      },
      conta: function (acao, corpo) {
        if (acao !== 'operador') return erro('Ação desconhecida.');
        var email = texto(corpo && corpo.email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erro('E-mail inválido.');
        if (!cidade(corpo.cidade)) return erro('Cidade não encontrada.');
        var existe = st.operadores.filter(function (x) { return x.email === email && x.cidade === corpo.cidade; })[0];
        if (existe) { existe.ativo = true; existe.papel = corpo.papel === 'moderador' ? 'moderador' : 'operador'; return ok({ existente: true, email: email }); }
        st.operadores.push({ email: email, cidade: corpo.cidade, papel: corpo.papel === 'moderador' ? 'moderador' : 'operador', ativo: true, repassePercentual: 0,
          contratoVersao: '', contratoAceitoEm: null, criadoEm: iso(agora()), ultimoAto: null });
        return ok({ enviado: true, email: email });
      },
      estado: function () { return st; }
    };
  }

  /* ------------------------------------------------------------------------------------------------- tela */

  var est = { banco: null, fonte: null, cache: {}, num: { cidade: '' }, mod: { busca: '', cidade: '', tipo: '' } };

  function bancoConferido(resp) { est.banco = bancoTemVagas(resp); }
  function esquecer() { est.fonte = null; est.cache = {}; est.num = { cidade: '' }; est.mod = { busca: '', cidade: '', tipo: '' }; }
  function fonte(ctx) {
    if (est.fonte) return est.fonte;
    if (ctx.simulada) est.fonte = criarSimulada({});
    else {
      var api = ctx.discApi;
      est.fonte = criarSupabase({ url: ctx.config.SUPABASE_URL, chave: ctx.config.SUPABASE_ANON_KEY, sessao: function () { return api.sessaoAtual(); } });
    }
    return est.fonte;
  }

  var doc = root.document || null;
  function el(tag, a, filhos) {
    var n = doc.createElement(tag);
    Object.keys(a || {}).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === 'classe') n.className = v;
      else if (k === 'texto') n.textContent = String(v);
      else if (/^on[a-z]+$/.test(k) && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'largura') n.style.width = v;
      else n.setAttribute(k, v === true ? '' : String(v));
    });
    (Array.isArray(filhos) ? filhos : [filhos]).forEach(function (f) {
      if (f == null || f === false) return;
      n.appendChild(typeof f === 'string' || typeof f === 'number' ? doc.createTextNode(String(f)) : f);
    });
    return n;
  }
  function limpar(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function trocar(n, filhos) { limpar(n); (Array.isArray(filhos) ? filhos : [filhos]).forEach(function (f) { if (f) n.appendChild(f); }); }
  function botao(classe, rotulo, fn, extra) { return el('button', Object.assign({ type: 'button', classe: 'botao ' + classe, onclick: fn }, extra || {}), rotulo); }
  function selo(texto2, classe, extra) { return el('span', Object.assign({ classe: 'selo vg-adm-selo' + (classe ? ' ' + classe : '') }, extra || {}), texto2); }
  function cabecalho(sobre, titulo, txt, acoes) {
    return el('div', { classe: 'cabecalho' }, [
      el('div', { classe: 'cabecalho__texto-area' }, [el('p', { classe: 'sobretitulo' }, sobre), el('h2', { classe: 'cabecalho__titulo t-pagina seminegrito' }, titulo),
        txt ? el('p', { classe: 'cabecalho__texto' }, txt) : null]),
      acoes && acoes.length ? el('div', { classe: 'cabecalho__acoes' }, acoes) : null]);
  }
  function carregando(alvo) { trocar(alvo, el('p', { classe: 'vg-adm-estado', role: 'status' }, [el('span', { classe: 'giro', 'aria-hidden': 'true' }), ' Carregando…'])); }
  function vazio(alvo, titulo, txt, id) { trocar(alvo, el('div', { classe: 'caixa vazio', id: id }, [el('p', { classe: 'seminegrito' }, titulo), txt ? el('p', { classe: 'vazio__texto' }, txt) : null])); }
  function erroNaTela(alvo, e, tentar, ctx) {
    if (e && e.sessaoExpirada && ctx && ctx.sessaoExpirou) { ctx.sessaoExpirou(); return; }
    trocar(alvo, el('div', { classe: 'aviso aviso--erro', role: 'alert' }, [el('p', {}, (e && e.message) || 'Não deu para carregar.'),
      tentar ? botao('botao--claro botao--pequeno', 'Tentar de novo', tentar, { id: 'vg-adm-tentar' }) : null]));
  }
  function falhou(ctx, e) {
    if (e && e.sessaoExpirada && ctx.sessaoExpirou) { ctx.sessaoExpirou(); return; }
    ctx.avisar((e && e.message) || 'Não foi possível concluir.', 'erro');
  }
  function quando(isoTxt) {
    var ms = Date.parse(texto(isoTxt));
    if (!isFinite(ms)) return '—';
    var d = new Date(ms);
    var hoje = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    var hora = p(d.getHours()) + ':' + p(d.getMinutes());
    var ontem = new Date(hoje.getTime() - 86400000);
    if (d.toDateString() === hoje.toDateString()) return 'hoje ' + hora;
    if (d.toDateString() === ontem.toDateString()) return 'ontem ' + hora;
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + (d.getFullYear() !== hoje.getFullYear() ? '/' + d.getFullYear() : '') + ' ' + hora;
  }
  function campo(id, rotulo, entrada, ajuda) {
    return el('label', { classe: 'campo', for: id }, [el('span', { classe: 'campo__rotulo' }, rotulo), entrada, ajuda ? el('span', { classe: 'campo__ajuda' }, ajuda) : null]);
  }
  function entrada(id, valor, extra) { var i = el('input', Object.assign({ id: id, classe: 'entrada', type: 'text', autocomplete: 'off' }, extra || {})); i.value = valor == null ? '' : String(valor); return i; }
  function escolha(ctx, id, rotulo, opcoes, valor, prefixo) {
    return ctx.criarEscolha({ id: id, rotulo: rotulo, prefixo: prefixo, opcoes: opcoes, valor: valor, classe: 'escolha--campo' });
  }
  function barraDe(pct) {
    return el('div', { classe: 'vg-adm-barra', role: 'img', 'aria-label': pct + '% do alvo' }, el('span', { classe: 'vg-adm-barra__feito', largura: Math.max(0, Math.min(100, pct)) + '%' }));
  }

  // Cidades (todas) com zonas: vagas_adm_cidades quando existir; senão o resumo + a lista pública (só ativa e lista de espera).
  function carregarCidades(ctx) {
    var f = fonte(ctx);
    return f.rpc('vagas_adm_cidades', {}).then(function (r) { return { cidades: r.cidades || [], completas: true }; }, function (e) {
      if (!e.bancoDesatualizado) throw e;
      return Promise.all([f.rpc('vagas_op_resumo', {}), f.rpc('vagas_cidades_publicas', {})]).then(function (rr) {
        var pub = {};
        (rr[1].cidades || []).forEach(function (c) { pub[c.slug] = c; });
        return { completas: false, cidades: (rr[0].cidades || []).map(function (c) {
          var p = pub[c.slug] || {};
          return Object.assign({}, c, { uf: p.uf || '', fuso: p.fuso || '', praca: p.praca || null, zonas: p.zonas || null,
            metaListaEspera: p.metaListaEspera == null ? null : p.metaListaEspera });
        }) };
      });
    }).then(function (r) {
      // Contagens do resumo (vagas_adm_cidades pode não trazer).
      return f.rpc('vagas_op_resumo', {}).then(function (res) {
        var k = {};
        (res.cidades || []).forEach(function (c) { k[c.slug] = c.contagens; });
        r.cidades.forEach(function (c) { if (!c.contagens) c.contagens = k[c.slug] || {}; });
        est.cache.cidades = r;
        if (ctx.contarPendencias) ctx.contarPendencias(r.cidades.reduce(function (s, c) { return s + pendencias(c); }, 0));
        return r;
      });
    });
  }
  function carregarOperadores(ctx) {
    return fonte(ctx).rpc('vagas_adm_operadores', {}).then(function (r) { return r.operadores || []; }, function (e) {
      if (e.bancoDesatualizado) return null;   // sem a RPC (pedido ao banco): a lista fica indisponível, convidar continua
      throw e;
    });
  }

  // ------------------------------------------------------------------------------------------------- vg-cidades
  function telaCidades(vista, ctx) {
    var lista = el('div', { id: 'vg-adm-cidades-corpo' });
    var nova = botao('botao--laranja', '+ Nova cidade (rascunho)', function () { janelaCidade(ctx, null, recarregar); }, { id: 'vg-adm-nova-cidade' });
    trocar(vista, [cabecalho('Vagas sem Caos', 'Cidades e praças', 'Situação de cada cidade, zonas, operação e metas. Só a equipe muda a situação.', [nova]), lista]);
    function recarregar() { carregando(lista); return Promise.all([carregarCidades(ctx), carregarOperadores(ctx).catch(function () { return null; })]).then(desenhar, function (e) { erroNaTela(lista, e, recarregar, ctx); }); }
    function desenhar(rr) {
      var cidades = rr[0].cidades, ops = rr[1];
      if (!cidades.length) { vazio(lista, 'Nenhuma cidade cadastrada.', 'Crie a primeira cidade como rascunho.', 'vg-adm-cidades-vazio'); return; }
      trocar(lista, el('ul', { classe: 'vg-adm-cidades', id: 'vg-adm-cidades' }, cidades.slice().sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); }).map(function (c) {
        return cartaoCidade(ctx, c, cidades, ops, recarregar);
      })));
    }
    return recarregar();
  }
  function linhaNumero(rotulo, valor) { return el('div', { classe: 'vg-adm-linha' }, [el('span', {}, rotulo), el('strong', { classe: 'tabular' }, valor)]); }
  function cartaoCidade(ctx, c, cidades, ops, recarregar) {
    var k = c.contagens || {};
    var linhas = [];
    if (c.status === 'lista_espera') {
      var meta = c.metaListaEspera;
      linhas.push(linhaNumero('Na lista de espera', numeroBr(k.listaEspera || 0) + (meta != null ? ' / ' + numeroBr(meta) : '')));
      if (meta) linhas.push(barraDe(Math.round(100 * (Number(k.listaEspera) || 0) / meta)));
    } else if (c.status !== 'rascunho') {
      linhas.push(linhaNumero('Vagas no ar', numeroBr(k.anunciosNoAr || 0)));
      linhas.push(linhaNumero('Empresas verificadas', numeroBr(k.empresasAtivas || 0)));
      linhas.push(linhaNumero('Pessoas cadastradas', numeroBr(k.pessoas || 0)));
      linhas.push(linhaNumero('Esperando moderação', numeroBr(pendencias(c))));
    }
    var acoes = [];
    var nz = c.zonas ? c.zonas.filter(function (z) { return z.ativa !== false; }).length : null;
    acoes.push(botao('botao--claro botao--pequeno', nz == null ? 'Zonas' : 'Zonas (' + nz + ')', function () { janelaZonas(ctx, c, recarregar); }, { 'data-acao': 'zonas' }));
    acoes.push(botao('botao--claro botao--pequeno', 'Editar', function () { janelaCidade(ctx, c, recarregar, cidades); }, { 'data-acao': 'editar' }));
    if (c.status === 'ativa') acoes.push(botao('botao--claro botao--pequeno', 'Pausar', function () { mudarStatus(ctx, c, 'pausada', recarregar); }, { 'data-acao': 'pausar' }));
    if (c.status === 'pausada') acoes.push(botao('botao--principal botao--pequeno', 'Reativar', function () { mudarStatus(ctx, c, 'ativa', recarregar); }, { 'data-acao': 'reativar' }));
    if (c.status === 'rascunho') acoes.push(botao('botao--principal botao--pequeno', 'Abrir lista de espera', function () { mudarStatus(ctx, c, 'lista_espera', recarregar); }, { 'data-acao': 'lista' }));
    if (c.status === 'lista_espera') {
      var faltam = faltamParaAtivar(c);
      acoes.push(botao('botao--principal botao--pequeno', faltam ? 'Ativar (faltam ' + numeroBr(faltam) + ')' : 'Ativar', function () { mudarStatus(ctx, c, 'ativa', recarregar); },
        { 'data-acao': 'ativar', disabled: faltam > 0 ? true : null, title: faltam ? 'Libera quando a lista de espera bater a meta' : null }));
    }
    var classe = c.status === 'ativa' ? 'selo--noite' : c.status === 'pausada' ? 'vg-adm-selo--pausada' : '';
    return el('li', { classe: 'caixa caixa--compacta vg-adm-cidade', 'data-cidade': c.slug, 'data-status': c.status }, [
      el('div', { classe: 'vg-adm-cidade__topo' }, [el('p', { classe: 'vg-adm-cidade__nome' }, c.nome + (c.uf ? ' · ' + c.uf : '')), selo(rotuloStatusCidade(c), classe)]),
      el('p', { classe: 't-nota texto-suave' }, linhaPraca(c, cidades, ops) || (c.status === 'rascunho' ? 'Ainda não aparece no site.' : '')),
      linhas.length ? el('div', { classe: 'vg-adm-linhas' }, linhas) : null,
      el('div', { classe: 'vg-adm-acoes' }, acoes)
    ]);
  }
  function mudarStatus(ctx, c, novo, depois) {
    var titulo = { pausada: 'Pausar ' + c.nome + '?', ativa: (c.status === 'pausada' ? 'Reativar ' : 'Ativar ') + c.nome + '?', lista_espera: 'Abrir a lista de espera de ' + c.nome + '?' }[novo];
    ctx.confirmar({ titulo: titulo, texto: efeitoStatus(c, novo), botao: { pausada: 'Pausar', ativa: c.status === 'pausada' ? 'Reativar' : 'Ativar', lista_espera: 'Abrir a lista' }[novo],
      classeBotao: novo === 'pausada' ? 'botao--perigo' : 'botao--principal' }).then(function (sim) {
      if (!sim) return;
      fonte(ctx).rpc('vagas_adm_cidade_salvar', { p_dados: { slug: c.slug, status: novo } }).then(function () {
        ctx.avisar('Situação de ' + c.nome + ': ' + STATUS_CIDADE[novo] + '.', 'ok');
        depois();
      }, function (e) { falhou(ctx, e); });
    });
  }
  function janelaCidade(ctx, c, depois, cidades) {
    var nova = !c;
    var nome = entrada('vg-adm-cid-nome', c ? c.nome : '', { maxlength: '80' });
    var uf = entrada('vg-adm-cid-uf', c ? c.uf : '', { maxlength: '2', autocapitalize: 'characters' });
    var slug = entrada('vg-adm-cid-slug', c ? c.slug : '', { maxlength: '60', readonly: nova ? null : true });
    var ibge = entrada('vg-adm-cid-ibge', c && c.ibge ? c.ibge : '', { inputmode: 'numeric', maxlength: '7' });
    var meta = entrada('vg-adm-cid-meta', c && c.metaListaEspera != null ? c.metaListaEspera : '', { inputmode: 'numeric', maxlength: '6' });
    var tocouSlug = false;
    slug.addEventListener('input', function () { tocouSlug = true; });
    function sugerir() { if (nova && !tocouSlug) slug.value = slugCidade(nome.value, uf.value); }
    nome.addEventListener('input', sugerir);
    uf.addEventListener('input', sugerir);
    var porte = escolha(ctx, 'vg-adm-cid-porte', 'Porte', [{ valor: '', rotulo: 'Sem porte (sem alvos)' }, { valor: 'pequena', rotulo: 'Cidade pequena (20 a 40 mil)' },
      { valor: 'grande', rotulo: 'Cidade grande' }], c && c.porte ? c.porte : (nova ? 'pequena' : ''));
    var outras = (cidades || (est.cache.cidades && est.cache.cidades.cidades) || []).filter(function (x) { return !c || x.slug !== c.slug; });
    var polo = escolha(ctx, 'vg-adm-cid-praca', 'Cidade-polo', [{ valor: '', rotulo: 'Nenhuma (é a própria praça)' }].concat(outras.map(function (x) { return { valor: x.slug, rotulo: x.nome }; })),
      c && c.praca ? c.praca : '');
    ctx.abrirJanela({ id: 'vg-adm-janela-cidade', titulo: nova ? 'Nova cidade (rascunho)' : 'Editar ' + c.nome, botao: nova ? 'Criar rascunho' : 'Salvar',
      texto: nova ? 'A cidade nasce como rascunho: não aparece no site até você abrir a lista de espera ou ativar.' : null,
      corpo: [el('div', { classe: 'form-grade' }, [campo('vg-adm-cid-nome', 'Nome da cidade', nome), campo('vg-adm-cid-uf', 'UF', uf),
        campo('vg-adm-cid-slug', 'Endereço no site', slug, nova ? 'Ex.: nome-da-cidade-uf. Não muda depois.' : 'Não muda depois de criado.'),
        campo('vg-adm-cid-ibge', 'Código IBGE (opcional)', ibge), el('div', { classe: 'campo' }, [el('span', { classe: 'campo__rotulo' }, 'Porte (escolhe os alvos)'), porte.caixa]),
        el('div', { classe: 'campo' }, [el('span', { classe: 'campo__rotulo' }, 'Entorno de outra cidade?'), polo.caixa]),
        campo('vg-adm-cid-meta', 'Meta da lista de espera para ativar (opcional)', meta)])],
      aoConfirmar: function () {
        var r = lerCidade({ nome: nome.value, uf: uf.value, slug: slug.value, ibge: ibge.value, metaListaEspera: meta.value, porte: porte.botao.value, praca: polo.botao.value }, nova);
        if (!r.ok) throw new Error(r.erro);
        if (!nova) r.dados.slug = c.slug;
        return fonte(ctx).rpc('vagas_adm_cidade_salvar', { p_dados: r.dados }).then(function () {
          ctx.avisar(nova ? 'Cidade criada como rascunho: ' + r.dados.nome + '.' : 'Cidade salva.', 'ok');
          depois();
        }, function (e) { if (e.sessaoExpirada && ctx.sessaoExpirou) { ctx.sessaoExpirou(); e.tratado = true; } throw e; });
      } });
  }
  function janelaZonas(ctx, c, depois) {
    var zonas = (c.zonas || []).slice().sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });
    var lista = el('ul', { classe: 'vg-adm-zonas', id: 'vg-adm-zonas' }, zonas.length ? zonas.map(function (z) {
      return el('li', { 'data-zona': z.slug, classe: z.ativa === false ? 'vg-adm-zona--inativa' : null }, [el('span', { classe: 'seminegrito' }, z.nome + (z.ativa === false ? ' (desativada)' : '')),
        el('span', { classe: 't-nota texto-suave' }, z.bairros && z.bairros.length ? ' · ' + z.bairros.join(', ') : '')]);
    }) : el('li', { classe: 'texto-suave' }, c.zonas == null ? 'As zonas desta cidade aparecem quando ela estiver aberta ou em lista de espera.' : 'Nenhuma zona ainda.'));
    var nome = entrada('vg-adm-zona-nome', '', { maxlength: '60' });
    var bairros = el('textarea', { id: 'vg-adm-zona-bairros', classe: 'entrada', rows: '3' });
    ctx.abrirJanela({ id: 'vg-adm-janela-zonas', titulo: 'Zonas de ' + c.nome, botao: 'Acrescentar zona',
      texto: 'As zonas aparecem no filtro de quem procura vaga e no anúncio. Para editar ou desativar uma zona, use a tela de operação da cidade.',
      corpo: [lista, el('div', { classe: 'form-grade' }, [campo('vg-adm-zona-nome', 'Nome da zona nova', nome), campo('vg-adm-zona-bairros', 'Bairros (separe por vírgula)', bairros)])],
      aoConfirmar: function () {
        var n = nome.value.trim();
        if (n.length < 2) throw new Error('Informe o nome da zona.');
        var s = semAcento(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
        return fonte(ctx).rpc('vagas_adm_zona_salvar', { p_dados: { cidade: c.slug, slug: s, nome: n, ordem: zonas.length + 1, ativa: true,
          bairros: bairros.value.split(/[,\n;]/).map(function (b) { return b.trim(); }).filter(Boolean) } }).then(function () {
          ctx.avisar('Zona criada em ' + c.nome + ': ' + n + '.', 'ok');
          depois();
        });
      } });
  }

  // ------------------------------------------------------------------------------------------------- vg-operadores
  function telaOperadores(vista, ctx) {
    var corpo = el('div', { id: 'vg-adm-operadores-corpo' });
    var novo = botao('botao--laranja', '+ Novo operador', function () { janelaOperador(ctx, null, recarregar); }, { id: 'vg-adm-novo-operador' });
    trocar(vista, [cabecalho('Vagas sem Caos', 'Operadores', 'Quem opera cada cidade, com papel, contrato e repasse. O operador nunca vê currículo, contato ou conversa.', [novo]), corpo]);
    function recarregar() {
      carregando(corpo);
      return Promise.all([carregarOperadores(ctx), est.cache.cidades ? Promise.resolve(est.cache.cidades) : carregarCidades(ctx)]).then(function (rr) {
        var ops = rr[0];
        if (ops === null) {
          vazio(corpo, 'A lista de operadores ainda não está disponível neste banco.', 'Você já pode convidar um operador e mudar papel, repasse ou contrato pelo e-mail dele.', 'vg-adm-operadores-indisponivel');
          return;
        }
        if (!ops.length) { vazio(corpo, 'Nenhum operador ainda.', 'Convide quem vai operar a primeira cidade.', 'vg-adm-operadores-vazio'); return; }
        trocar(corpo, el('div', { classe: 'caixa vg-adm-tabela-caixa' }, el('table', { classe: 'vg-adm-tabela', id: 'vg-adm-operadores' }, [
          el('thead', {}, el('tr', {}, ['Pessoa', 'Cidade', 'Papel', 'Contrato', 'Repasse', 'Último ato', ''].map(function (t, i) { return el('th', { scope: 'col', classe: i === 4 ? 'num' : null }, t); }))),
          el('tbody', {}, ops.map(function (o) { return linhaOperador(ctx, o, recarregar); }))])));
      }, function (e) { erroNaTela(corpo, e, recarregar, ctx); });
    }
    return recarregar();
  }
  function linhaOperador(ctx, o, depois) {
    var cid = o.cidade && o.cidade.slug ? o.cidade : { slug: o.cidade, nome: o.cidade };
    var contrato = o.contratoAceitoEm ? 'versão ' + (o.contratoVersao || '?') + ' · aceito ' + quando(o.contratoAceitoEm).replace(/ \d\d:\d\d$/, '') : (o.contratoVersao ? 'versão ' + o.contratoVersao + ' · falta aceitar' : '—');
    var rp = Number(o.repassePercentual) || 0;
    return el('tr', { 'data-operador': o.email, 'data-cidade': cid.slug, classe: o.ativo === false ? 'vg-adm-inativo' : null }, [
      el('td', {}, [el('span', { classe: 'seminegrito' }, o.email), o.ativo === false ? el('span', { classe: 't-nota texto-suave' }, ' · desligado') : null]),
      el('td', {}, cid.nome),
      el('td', {}, PAPEIS[o.papel] || o.papel),
      el('td', {}, contrato),
      el('td', { classe: 'num' }, rp > 0 ? rp + '%' : '0% (própria)'),
      el('td', {}, o.ultimoAto ? quando(o.ultimoAto.em) + ' · ' + rotuloAto(o.ultimoAto.acao).toLowerCase() : '—'),
      el('td', {}, el('div', { classe: 'vg-adm-acoes vg-adm-acoes--fim' }, [
        botao('botao--claro botao--pequeno', 'Editar', function () { janelaOperador(ctx, Object.assign({}, o, { cidade: cid }), depois); }, { 'data-acao': 'editar' }),
        o.ativo === false ? null : botao('botao--perigo botao--pequeno', 'Desligar', function () { desligar(ctx, o, cid, depois); }, { 'data-acao': 'desligar' })]))
    ]);
  }
  function desligar(ctx, o, cid, depois) {
    ctx.confirmar({ titulo: 'Desligar ' + o.email + '?', texto: 'A conta perde o acesso à operação de ' + cid.nome + ' na hora. O registro do que ela fez continua.',
      botao: 'Desligar', classeBotao: 'botao--perigo' }).then(function (sim) {
      if (!sim) return;
      fonte(ctx).rpc('vagas_adm_operador_salvar', { p_dados: { cidade: cid.slug, email: o.email, papel: o.papel, ativo: false } }).then(function () {
        ctx.avisar('Acesso desligado: ' + o.email + '.', 'ok');
        depois();
      }, function (e) { falhou(ctx, e); });
    });
  }
  function janelaOperador(ctx, o, depois) {
    var novo = !o;
    var cidades = (est.cache.cidades && est.cache.cidades.cidades) || [];
    var email = entrada('vg-adm-op-email', o ? o.email : '', { type: 'email', inputmode: 'email', readonly: novo ? null : true });
    var cidade = escolha(ctx, 'vg-adm-op-cidade', 'Cidade', cidades.map(function (c) { return { valor: c.slug, rotulo: c.nome }; }),
      o ? o.cidade.slug : (cidades[0] ? cidades[0].slug : ''));
    if (!novo) cidade.botao.disabled = true;
    var papel = escolha(ctx, 'vg-adm-op-papel', 'Papel', [{ valor: 'operador', rotulo: 'Operação (tudo da praça)' }, { valor: 'moderador', rotulo: 'Moderação (só modera)' }], o ? o.papel : 'operador');
    var repasse = entrada('vg-adm-op-repasse', o ? (Number(o.repassePercentual) || 0) : 0, { inputmode: 'decimal', maxlength: '5' });
    var contrato = entrada('vg-adm-op-contrato', o ? (o.contratoVersao || '') : CONTRATO_OPERADOR, { maxlength: '40' });
    ctx.abrirJanela({ id: 'vg-adm-janela-operador', titulo: novo ? 'Novo operador' : 'Editar ' + o.email, botao: novo ? 'Convidar' : 'Salvar',
      texto: novo ? 'Use um e-mail só para a operação. A pessoa recebe o convite, cria a senha e aceita o contrato de operador no primeiro acesso.' : null,
      corpo: [el('div', { classe: 'form-grade' }, [campo('vg-adm-op-email', 'E-mail', email),
        el('div', { classe: 'campo' }, [el('span', { classe: 'campo__rotulo' }, 'Cidade'), cidade.caixa]),
        el('div', { classe: 'campo' }, [el('span', { classe: 'campo__rotulo' }, 'Papel'), papel.caixa]),
        campo('vg-adm-op-repasse', 'Repasse (%)', repasse, '0 = operação própria da Gestão sem Caos, sem repasse.'),
        campo('vg-adm-op-contrato', 'Versão do contrato', contrato)])],
      aoConfirmar: function () {
        var r = lerOperador({ email: email.value, cidade: cidade.botao.value, papel: papel.botao.value, repassePercentual: repasse.value, contratoVersao: contrato.value });
        if (!r.ok) throw new Error(r.erro);
        var f = fonte(ctx);
        var c = cidades.filter(function (x) { return x.slug === r.dados.cidade; })[0];
        var convite = novo ? f.conta('operador', { email: r.dados.email, cidade: r.dados.cidade, papel: r.dados.papel, cidadeNome: c ? c.nome : '' }).catch(function (e) {
          if (e.conexao && !ctx.simulada) throw new Error('Não deu para enviar o convite a partir deste painel: o serviço de contas do Vagas ainda precisa liberar este endereço.');
          throw e;
        }) : Promise.resolve(null);
        return convite.then(function (cv) {
          return f.rpc('vagas_adm_operador_salvar', { p_dados: r.dados }).then(function () {
            ctx.avisar(novo ? (cv && cv.existente ? 'A conta já existia: o acesso a ' + (c ? c.nome : r.dados.cidade) + ' foi ligado.' : 'Convite enviado para ' + r.dados.email + '.') : 'Operador salvo.', 'ok');
            depois();
          });
        });
      } });
  }

  // ------------------------------------------------------------------------------------------------- vg-moderacao
  function telaModeracao(vista, ctx) {
    var topo = el('div', { id: 'vg-adm-pendencias' });
    var corpo = el('div', { id: 'vg-adm-moderacao-corpo' });
    var busca = el('input', { id: 'vg-adm-mod-busca', classe: 'entrada', type: 'search', placeholder: 'Buscar por empresa, vaga, ato ou motivo', autocomplete: 'off', 'aria-label': 'Buscar no registro' });
    busca.value = est.mod.busca;
    var filtros = el('form', { classe: 'filtros', role: 'search', onsubmit: function (e) { e.preventDefault(); } }, [
      el('label', { classe: 'filtros__busca' }, [el('span', { classe: 'visualmente-oculto' }, 'Buscar'), lupa(), busca])]);
    var abrir = el('a', { classe: 'botao botao--claro', id: 'vg-adm-abrir-fila', href: SITE_VAGAS + '/operador.html#fila', target: '_blank', rel: 'noopener noreferrer' }, 'Abrir a fila no site do Vagas');
    trocar(vista, [cabecalho('Vagas sem Caos · todas as cidades', 'Moderação geral', 'Registro de cada ato dos operadores (só inclusão). A equipe decide a fila pelo site do Vagas, com a mesma conta.', [abrir]),
      topo, filtros, corpo]);
    var registros = [];
    function desenhar() {
      var lista = filtrarAtos(registros, est.mod);
      if (!lista.length) { vazio(corpo, registros.length ? 'Nada com esse filtro.' : 'Nenhum ato registrado ainda.', '', 'vg-adm-moderacao-vazio'); return; }
      var cidades = {};
      ((est.cache.cidades && est.cache.cidades.cidades) || []).forEach(function (c) { cidades[c.slug] = c.nome; });
      trocar(corpo, el('div', { classe: 'caixa vg-adm-tabela-caixa' }, el('table', { classe: 'vg-adm-tabela', id: 'vg-adm-moderacao' }, [
        el('thead', {}, el('tr', {}, ['Quando', 'Cidade', 'Quem', 'Ato', 'Alvo', 'Motivo', ''].map(function (t) { return el('th', { scope: 'col' }, t); }))),
        el('tbody', {}, lista.map(function (r) {
          var volta = reversao(r);
          return el('tr', { 'data-registro': r.id, 'data-acao': r.acao }, [
            el('td', { classe: 'nao-quebra' }, quando(r.em)), el('td', {}, cidades[r.cidade] || r.cidade || '—'),
            el('td', {}, r.quem || PAPEIS[r.papel] || r.papel), el('td', {}, rotuloAto(r.acao)),
            el('td', {}, [ALVOS[r.alvo] || r.alvo || '—', r.alvoNome ? el('span', { classe: 'texto-suave' }, ' · ' + r.alvoNome) : null]),
            el('td', {}, r.motivo ? tituloMotivo(r.motivo) : '—'),
            el('td', {}, volta ? botao('botao--claro botao--pequeno', 'Reverter', function () { reverter(r, volta); }, { 'data-acao': 'reverter', title: volta.rotulo }) : null)
          ]);
        }))])));
    }
    function reverter(r, volta) {
      ctx.confirmar({ titulo: volta.rotulo + '?', texto: 'Fica registrado um ato novo de reversão, com a equipe como autora. O ato original continua no registro.',
        botao: 'Reverter', classeBotao: 'botao--principal' }).then(function (sim) {
        if (!sim) return;
        fonte(ctx).rpc(volta.rpc, volta.args).then(function () { ctx.avisar('Revertido: ' + volta.rotulo.toLowerCase() + '.', 'ok'); recarregar(); }, function (e) { falhou(ctx, e); });
      });
    }
    function recarregar() {
      carregando(corpo);
      return Promise.all([carregarCidades(ctx), fonte(ctx).rpc('vagas_op_moderacao', { p_filtro: { limite: 200 } })]).then(function (rr) {
        registros = rr[1].registros || [];
        desenharPendencias(rr[0].cidades);
        montarFiltros(rr[0].cidades);
        desenhar();
      }, function (e) { erroNaTela(corpo, e, recarregar, ctx); });
    }
    function desenharPendencias(cidades) {
      var com = cidades.filter(function (c) { return pendencias(c) > 0; });
      if (!com.length) { trocar(topo, el('p', { classe: 't-nota texto-suave vg-adm-pend-vazio' }, 'Nenhuma pendência em nenhuma cidade.')); return; }
      trocar(topo, el('ul', { classe: 'vg-adm-pendencias' }, com.map(function (c) {
        var k = c.contagens || {};
        var partes = [];
        if (k.anunciosEmRevisao) partes.push(k.anunciosEmRevisao + ' vaga(s) em revisão');
        if (k.anunciosSuspensos) partes.push(k.anunciosSuspensos + ' fora do ar por denúncias');
        if (k.empresasEmAnalise) partes.push(k.empresasEmAnalise + ' empresa(s) em análise');
        if (k.denunciasAbertas) partes.push(k.denunciasAbertas + ' denúncia(s) aberta(s)');
        return el('li', { classe: 'caixa caixa--compacta vg-adm-pendencia', 'data-cidade': c.slug }, [el('p', { classe: 'seminegrito' }, c.nome + ': ' + pendencias(c) + ' esperando'),
          el('p', { classe: 't-nota texto-suave' }, partes.join(' · '))]);
      })));
    }
    var filtrosMontados = false;
    function montarFiltros(cidades) {
      if (filtrosMontados) return;
      filtrosMontados = true;
      var escCid = ctx.criarEscolha({ id: 'vg-adm-mod-cidade', rotulo: 'Cidade', prefixo: 'Cidade', valor: est.mod.cidade,
        opcoes: [{ valor: '', rotulo: 'Todas' }].concat(cidades.map(function (c) { return { valor: c.slug, rotulo: c.nome }; })) });
      var escTipo = ctx.criarEscolha({ id: 'vg-adm-mod-tipo', rotulo: 'Tipo', prefixo: 'Tipo', valor: est.mod.tipo, opcoes: TIPOS_ATO });
      escCid.botao.addEventListener('change', function () { est.mod.cidade = escCid.botao.value; desenhar(); });
      escTipo.botao.addEventListener('change', function () { est.mod.tipo = escTipo.botao.value; desenhar(); });
      filtros.appendChild(el('div', { classe: 'filtros__escolhas' }, [escCid.caixa, escTipo.caixa]));
    }
    busca.addEventListener('input', function () { est.mod.busca = busca.value; desenhar(); });
    return recarregar();
  }
  function lupa() {
    var s = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'filtros__lupa'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    var c = doc.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '7');
    var p = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', 'm20 20-3.5-3.5');
    s.appendChild(c); s.appendChild(p);
    return s;
  }

  // ------------------------------------------------------------------------------------------------- vg-numeros
  var CLASSE_COR = { ok: 'selo--verde', atencao: '', alerta: 'selo--vermelho' };
  function telaNumeros(vista, ctx) {
    var corpo = el('div', { id: 'vg-adm-numeros-corpo' });
    var acoes = el('div', { classe: 'vg-adm-num-escolha' });
    var sobre = el('p', { classe: 'sobretitulo' }, 'Vagas sem Caos');
    trocar(vista, [el('div', { classe: 'cabecalho' }, [el('div', { classe: 'cabecalho__texto-area' }, [sobre, el('h2', { classe: 'cabecalho__titulo t-pagina seminegrito' }, 'Números da praça'),
      el('p', { classe: 'cabecalho__texto' }, 'Os alvos da proposta para o porte da cidade. A cor aparece só como etiqueta: no alvo, perto do alvo ou longe do alvo.')]),
    el('div', { classe: 'cabecalho__acoes' }, acoes)]), corpo]);
    carregando(corpo);
    return carregarCidades(ctx).then(function (r) {
      var cidades = r.cidades.filter(function (c) { return c.status !== 'rascunho'; });
      if (!cidades.length) { vazio(corpo, 'Nenhuma cidade aberta ainda.', 'Os números aparecem quando a primeira cidade abrir a lista de espera.', 'vg-adm-numeros-vazio'); return; }
      if (!cidades.some(function (c) { return c.slug === est.num.cidade; })) {
        var ativa = cidades.filter(function (c) { return c.status === 'ativa' && !c.praca; })[0];
        est.num.cidade = (ativa || cidades[0]).slug;
      }
      var esc = ctx.criarEscolha({ id: 'vg-adm-num-cidade', rotulo: 'Praça', prefixo: 'Praça', valor: est.num.cidade,
        opcoes: cidades.map(function (c) { return { valor: c.slug, rotulo: c.nome }; }) });
      esc.botao.addEventListener('change', function () { est.num.cidade = esc.botao.value; mostrar(); });
      trocar(acoes, esc.caixa);
      function mostrar() {
        var c = cidades.filter(function (x) { return x.slug === est.num.cidade; })[0];
        sobre.textContent = 'Vagas sem Caos · ' + c.nome;
        carregando(corpo);
        return fonte(ctx).rpc('vagas_op_indicadores', { p_cidade: c.slug }).then(function (ind) {
          trocar(corpo, desenharIndicadores(ind));
        }, function (e) {
          if (!e.bancoDesatualizado) { erroNaTela(corpo, e, mostrar, ctx); return; }
          trocar(corpo, [el('div', { classe: 'vg-adm-numeros', id: 'vg-adm-numeros' }, contagensResumo(c.contagens).map(function (x) {
            return el('div', { classe: 'caixa caixa--compacta vg-adm-numero', 'data-contagem': x.chave }, [el('p', { classe: 'vg-adm-numero__rotulo' }, x.rotulo),
              el('p', { classe: 'vg-adm-numero__valor tabular' }, x.valor)]);
          })), el('p', { classe: 'aviso vg-adm-nota', id: 'vg-adm-numeros-breve' }, 'Em breve: os 15 indicadores com alvo e cor (falta a atualização do banco do Vagas). Até lá, estas são as contagens de agora.')]);
        });
      }
      return mostrar();
    }, function (e) { erroNaTela(corpo, e, function () { telaNumeros(vista, ctx); }, ctx); });
  }
  function desenharIndicadores(r) {
    var inds = (r.indicadores || []).map(function (i) { return { bruto: i, f: formatarIndicador(i) }; });
    var cartoes = el('div', { classe: 'vg-adm-numeros', id: 'vg-adm-numeros' }, inds.map(function (x) {
      var f = x.f;
      return el('div', { classe: 'caixa caixa--compacta vg-adm-numero', 'data-indicador': f.chave, 'data-cor': f.cor || '' }, [
        el('p', { classe: 'vg-adm-numero__rotulo' }, f.nome),
        el('p', { classe: 'vg-adm-numero__valor tabular' }, f.valor),
        el('p', { classe: 'vg-adm-numero__alvo' }, [f.alvo, f.cor ? ' ' : null, f.cor ? selo(f.corRotulo, CLASSE_COR[f.cor], { 'data-cor': f.cor }) : null]),
        f.barra != null ? barraDe(f.barra) : null,
        f.nota ? el('p', { classe: 't-nota texto-suave' }, f.nota) : null
      ]);
    }));
    var selos = inds.filter(function (x) { return x.bruto.chave === 'pessoas_com_selo_por_funcao'; })[0];
    var ativas = inds.filter(function (x) { return x.bruto.chave === 'vagas_ativas'; })[0];
    var tabela = null;
    if (selos && !selos.f.semDado) {
      var porTeste = (selos.bruto.detalhe || {}).porTeste || {};
      var pedem = ((ativas && ativas.bruto.detalhe) || {}).porTeste || {};
      tabela = el('section', { classe: 'caixa vg-adm-secao' }, [el('h3', { classe: 'caixa__titulo' }, 'Pessoas com selo, por teste'),
        el('table', { classe: 'vg-adm-tabela', id: 'vg-adm-selos' }, [
          el('thead', {}, el('tr', {}, [el('th', { scope: 'col' }, 'Teste'), el('th', { scope: 'col', classe: 'num' }, 'Com selo'), el('th', { scope: 'col', classe: 'num' }, 'Vagas no ar que citam o teste')])),
          el('tbody', {}, TESTES.map(function (t) { return el('tr', {}, [el('td', {}, t[1]), el('td', { classe: 'num' }, numeroBr(porTeste[t[0]] || 0)), el('td', { classe: 'num' }, numeroBr(pedem[t[0]] || 0))]); }))]),
        el('p', { classe: 't-nota texto-suave' }, 'Contagem de selos válidos, para acompanhar a praça. Nunca aparece para empresa.')]);
    }
    var gat = (r.gatilhos || []).map(formatarGatilho);
    var gatilhos = gat.length ? el('section', { classe: 'caixa vg-adm-secao', id: 'vg-adm-gatilhos' }, [el('h3', { classe: 'caixa__titulo' }, 'Gatilhos da proposta'),
      el('ul', { classe: 'vg-adm-gatilhos' }, gat.map(function (g) {
        return el('li', { 'data-gatilho': g.chave }, [
          el('p', { classe: 'seminegrito' }, [g.nome + ' ', selo(g.rotulo + (g.contagem ? ' · ' + g.contagem : ''), g.situacao === 'sim' || g.situacao === 'fixa' ? 'selo--verde' : '')]),
          el('ul', { classe: 'vg-adm-partes t-nota' }, g.partes.map(function (p) {
            var marca = { ok: '✓', fixa: '✓', nao: '✗', manual: '·', sem_dado: '·' }[p.estado];
            return el('li', { 'data-estado': p.estado }, marca + ' ' + p.descricao + (p.estado === 'manual' ? ' (conferência da equipe)' : p.estado === 'sem_dado' ? ' (ainda sem dado)' : ''));
          }))]);
      }))]) : null;
    var praca = (r.praca || []).length > 1 ? el('p', { classe: 't-nota texto-suave' }, 'Praça: ' + r.praca.map(function (x) { return x.nome; }).join(', ') + '.') : null;
    var semPorte = r.cidade && !r.cidade.porte ? el('p', { classe: 'aviso vg-adm-nota', id: 'vg-adm-sem-porte' }, 'Esta cidade ainda não tem porte cadastrado: os números saem sem alvo e sem cor. Defina o porte em Cidades e praças > Editar.') : null;
    return [semPorte, praca, cartoes, tabela, gatilhos];
  }

  // ------------------------------------------------------------------------------------------------- entrada
  var TELAS = { 'vg-cidades': telaCidades, 'vg-operadores': telaOperadores, 'vg-moderacao': telaModeracao, 'vg-numeros': telaNumeros };
  function mostrar(aba, vista, ctx) {
    if (!TELAS[aba] || !vista) return Promise.resolve();
    return Promise.resolve(TELAS[aba](vista, ctx)).catch(function (e) { erroNaTela(vista, e, null, ctx); });
  }

  var DISC_ADMIN_VAGAS = {
    ABAS: ABAS, MIGRACAO: MIGRACAO, MOTIVOS: MOTIVOS, INDICADORES: INDICADORES, TESTES: TESTES, CONTRATO_OPERADOR: CONTRATO_OPERADOR, SITE_VAGAS: SITE_VAGAS,
    previaLigada: previaLigada, bancoTemVagas: bancoTemVagas, disponivel: disponivel, rotuloStatusCidade: rotuloStatusCidade, linhaPraca: linhaPraca,
    efeitoStatus: efeitoStatus, faltamParaAtivar: faltamParaAtivar, slugCidade: slugCidade, lerCidade: lerCidade, lerOperador: lerOperador,
    rotuloAto: rotuloAto, tituloMotivo: tituloMotivo, reversao: reversao, pendencias: pendencias, filtrarAtos: filtrarAtos,
    numeroBr: numeroBr, valorComUnidade: valorComUnidade, formatarIndicador: formatarIndicador, formatarGatilho: formatarGatilho, contagensResumo: contagensResumo,
    criarSimulada: criarSimulada, criarSupabase: criarSupabase,
    bancoConferido: bancoConferido, banco: function () { return est.banco; }, esquecer: esquecer, mostrar: mostrar
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_ADMIN_VAGAS;
  else root.DISC_ADMIN_VAGAS = DISC_ADMIN_VAGAS;
})(typeof self !== 'undefined' ? self : this);
