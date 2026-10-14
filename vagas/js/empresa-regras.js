/*
 * Vagas sem Caos — regras puras do painel da EMPRESA (sem rede, sem DOM). UMD como os outros arquivos de vagas/js: window.
 * VAGAS_EMPRESA_REGRAS / module.exports. Usado por empresa*.js e referencia.js e pelos testes (tests/vagas-empresa.test.js).
 *
 *   centavosDe('1.620,00') -> 162000 | null · textoDeCentavos(162000) -> '1.620,00'
 *   dataDeTexto('13/10/2026') -> '2026-10-13' | null · textoDeData('2026-10-13') -> '13/10/2026'
 *   mesDeTexto('09/2025') -> '2025-09' | null · textoDeMes('2025-09') -> '09/2025'
 *   saudacao(hora 0-23) -> 'Bom dia' | 'Boa tarde' | 'Boa noite' · primeiroNome(nome)
 *   proximosDias(hojeIso, n) -> [{data, rotulo}] (diária: hoje até +7)
 *   formDeAnuncio(anuncio) -> estado do formulário · dadosDaVaga(form, {empresaId?, id?}) -> dados de VAGAS_API.salvarAnuncio
 *   unidadesDaModalidade(mod) -> ['mes','hora'] … · unidadePadrao(mod)
 *   validarVaga(form, {hoje, zonas}) -> {ok, dados} | {ok:false, campo, erro} (mesmas mensagens do banco + o campo do erro)
 *   termosProibidos(texto, ctx) -> [{tipo, trecho (como a empresa escreveu)}] · mensagemTermos(lista, {descricao})
 *   campoDoErro(mensagem, form) -> chave do campo (para pôr o erro da RPC no campo certo)
 *   etiquetasFiltro(form, {zonas}) -> ['Vendas em loja e balcão', 'CLT', …] (lateral "Como a vaga aparece nos filtros")
 *   linkCurto(codigo, siteUrl) · textoWhatsappVaga({titulo, confidencial, empresaNome, zona, valor, link})
 *   textoWhatsappCombinou({pessoaNome, responsavelNome, empresaNome, vagaTitulo})
 *   diasRestantes(expiraIso, agoraMs) · podeRenovar(anuncio, agoraMs)
 *   andamentoReferencia(ref) -> {rotulo, classe, motivo} (veto P2: nunca diz se a pessoa aceitou, ocultou, recusou ou removeu)
 *   motivoModeracao(chave, vars, motivos) -> {titulo, texto, correcao} | null (texto de moderacao.json; motivo livre fica como veio)
 *   FILTROS_CARTOES / filtrarCartoes(cartoes, chave) -> só pela SITUAÇÃO da candidatura (veto P3: nada por dado da pessoa)
 *   lerReferenciaForm(form, agoraMs) -> {ok, dados} | {ok:false, campo, erro} · lerEmpresaForm(form) -> idem
 *
 * Textos de WhatsApp: transcritos de conteudo/vagas-textos/whatsapp.json (o site não enxerga conteudo/; o teste confere que
 * são iguais aos de lá).
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var R = nodeJs ? require('./regras.js') : root.VAGAS_REGRAS;

  // whatsapp.json: "vaga_compartilhar" e "empresa_para_pessoa_combinou" (palavra por palavra; tests/vagas-empresa.test.js).
  var WHATSAPP = {
    vaga_compartilhar: 'Vaga de {{vaga_titulo}} · {{empresa_nome_ou_confidencial}} · {{zona}} · {{valor}}. Candidatura grátis pelo celular: {{link_curto}} (Vagas sem Caos, uma ferramenta da Gestão sem Caos)',
    empresa_para_pessoa_combinou: 'Oi, {{pessoa_primeiro_nome}}! Aqui é {{responsavel_nome}}, da {{empresa_nome}}. Vi a sua candidatura à vaga de {{vaga_titulo}} no Vagas sem Caos e deu Combinou. Podemos conversar sobre a vaga? Me diz um horário bom para você. (Nunca pedimos dinheiro, Pix ou documento para a vaga: só na admissão, pessoalmente.)'
  };
  var DIA = 86400000;
  var SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function texto(v) { return v == null ? '' : String(v); }
  function preencher(modelo, vars) {
    return String(modelo).replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, function (_, k) { return vars && vars[k] != null ? String(vars[k]) : ''; });
  }

  // ------------------------------------------------------------------------------------------------- números e datas
  // "R$ 1.620,00", "1620", "1.620", "1620,5", "1620.50" -> centavos. Vazio ou inválido -> null.
  function centavosDe(v) {
    var s = texto(v).replace(/R\$/gi, '').replace(/\s+/g, '');
    if (!s) return null;
    if (!/^[0-9.,]+$/.test(s)) return null;
    var inteiro, frac = '';
    if (s.indexOf(',') >= 0) {
      var p = s.split(',');
      if (p.length !== 2 || !/^\d{0,2}$/.test(p[1])) return null;
      inteiro = p[0]; frac = p[1];
      if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(inteiro)) return null;
      inteiro = inteiro.replace(/\./g, '');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      inteiro = s.replace(/\./g, '');
    } else if (/^\d+\.\d{1,2}$/.test(s)) {
      var q = s.split('.'); inteiro = q[0]; frac = q[1];
    } else if (/^\d+$/.test(s)) {
      inteiro = s;
    } else return null;
    if (inteiro.length > 9) return null;
    return Number(inteiro || '0') * 100 + Number((frac + '00').slice(0, 2));
  }
  function textoDeCentavos(c) {
    if (c == null || c === '' || !isFinite(Number(c))) return '';
    return R.reais(Number(c)).replace(/^R\$\s*/, '');
  }
  function dataValida(a, m, d) {
    var dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function dataDeTexto(v) {
    var m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(texto(v));
    if (!m) return null;
    var d = +m[1], mes = +m[2], a = +m[3];
    if (!dataValida(a, mes, d)) return null;
    return a + '-' + (mes < 10 ? '0' : '') + mes + '-' + (d < 10 ? '0' : '') + d;
  }
  function textoDeData(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto(iso)); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; }
  function mesDeTexto(v) {
    var m = /^\s*(\d{1,2})\/(\d{4})\s*$/.exec(texto(v));
    if (!m || +m[1] < 1 || +m[1] > 12) return null;
    return m[2] + '-' + (+m[1] < 10 ? '0' : '') + (+m[1]);
  }
  function textoDeMes(v) { var m = /^(\d{4})-(\d{2})$/.exec(texto(v)); return m ? m[2] + '/' + m[1] : ''; }
  function saudacao(hora) {
    var h = Number(hora);
    if (!isFinite(h)) return 'Olá';
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
  }
  function primeiroNome(nome) { return texto(nome).trim().split(/\s+/)[0] || ''; }
  function proximosDias(hojeIso, n) {
    var lista = [];
    for (var i = 0; i < (n || 8); i++) {
      var d = R.somarDias(hojeIso, i);
      var sem = SEMANA[new Date(d + 'T12:00:00Z').getUTCDay()];
      lista.push({ data: d, rotulo: i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : sem + ' ' + d.slice(8, 10) + '/' + d.slice(5, 7) });
    }
    return lista;
  }

  // ------------------------------------------------------------------------------------------------- vaga: formulário <-> contrato
  function unidadesDaModalidade(mod) {
    if (mod === 'diaria') return ['dia'];
    if (mod === 'freelancer') return ['servico', 'hora', 'dia'];
    return ['mes', 'hora'];
  }
  function unidadePadrao(mod) { return unidadesDaModalidade(mod)[0]; }
  function formVazio() {
    return { area: '', funcao: '', modalidade: '', quantidade: '1', salarioDe: '', salarioAte: '', unidade: '', comissao: false, turno: '',
      fimDeSemana: false, inicio: 'imediato', inicioData: '', zona: '', experiencia: 'nao_precisa', escolaridade: 'nao_exigida', requisitos: [],
      requisitoOutro: '', selo: 'nenhum', beneficios: [], confidencial: false, descricao: '', data: '', horaInicio: '', horaFim: '',
      prazoHoras: '48', horasDia: '' };
  }
  // Anúncio da empresa (resposta de vagas_anuncios_empresa) -> estado do formulário de edição.
  function formDeAnuncio(a) {
    a = a || {};
    var f = formVazio();
    var v = a.valor || {};
    f.area = (a.area && a.area.slug) || texto(a.area);
    f.funcao = texto(a.funcao || a.titulo);
    f.modalidade = texto(a.modalidade);
    f.quantidade = a.quantidade != null ? String(a.quantidade) : '1';
    f.salarioDe = textoDeCentavos(v.minCentavos);
    f.salarioAte = v.maxCentavos != null ? textoDeCentavos(v.maxCentavos) : '';
    f.unidade = texto(v.unidade) || unidadePadrao(f.modalidade);
    f.comissao = !!a.comissao;
    f.turno = texto(a.turno);
    f.fimDeSemana = !!a.fimDeSemana;
    f.inicio = a.inicio === 'data' && a.modalidade !== 'diaria' ? 'data' : 'imediato';
    f.inicioData = a.inicio === 'data' && a.modalidade !== 'diaria' ? textoDeData(a.inicioData) : '';
    f.zona = (a.zona && a.zona.slug) || '';
    f.experiencia = texto(a.experiencia) || 'nao_precisa';
    f.escolaridade = texto(a.escolaridade) || 'nao_exigida';
    f.requisitos = (a.requisitos || []).slice();
    f.requisitoOutro = texto(a.requisitoOutro);
    f.selo = a.selo || 'nenhum';
    f.beneficios = (a.beneficios || []).slice();
    f.confidencial = !!a.confidencial;
    f.descricao = texto(a.descricao);
    if (a.diaria) { f.data = texto(a.diaria.data); f.horaInicio = texto(a.diaria.inicio); f.horaFim = texto(a.diaria.fim); }
    f.prazoHoras = a.prazoHoras != null ? String(a.prazoHoras) : '48';
    f.horasDia = a.horasDia != null ? String(a.horasDia) : '';
    return f;
  }
  // Estado do formulário -> dados de VAGAS_API.salvarAnuncio (chaves do contrato, VAGAS-SPEC §8.4).
  function dadosDaVaga(f, op) {
    f = f || {};
    op = op || {};
    var mod = texto(f.modalidade);
    var unidades = unidadesDaModalidade(mod);
    var d = {
      area: texto(f.area), funcao: texto(f.funcao), modalidade: mod,
      quantidade: /^\s*\d+\s*$/.test(texto(f.quantidade)) ? Number(f.quantidade) : (texto(f.quantidade).trim() ? texto(f.quantidade) : 1),
      salarioDe: centavosDe(f.salarioDe), salarioAte: centavosDe(f.salarioAte),
      valorUnidade: unidades.indexOf(f.unidade) >= 0 ? f.unidade : unidades[0],
      comissao: !!f.comissao || (f.beneficios || []).indexOf('comissao') >= 0,
      turno: texto(f.turno), fimDeSemana: !!f.fimDeSemana,
      experiencia: texto(f.experiencia), escolaridade: texto(f.escolaridade) || 'nao_exigida',
      requisitos: (f.requisitos || []).slice(), requisitoOutro: (f.requisitos || []).indexOf('outro') >= 0 ? texto(f.requisitoOutro) : '',
      selo: f.selo && f.selo !== 'nenhum' ? f.selo : 'nenhum',
      beneficios: (f.beneficios || []).slice(), confidencial: !!f.confidencial, descricao: texto(f.descricao), zona: texto(f.zona)
    };
    if (d.comissao && d.beneficios.indexOf('comissao') < 0) d.beneficios.push('comissao');
    if (!d.comissao) d.beneficios = d.beneficios.filter(function (b) { return b !== 'comissao'; });
    if (mod === 'diaria') {
      d.data = texto(f.data); d.horaInicio = texto(f.horaInicio); d.horaFim = texto(f.horaFim);
      d.prazoHoras = /^\d+$/.test(texto(f.prazoHoras)) ? Number(f.prazoHoras) : 48;
      d.inicio = 'data'; d.inicioData = d.data;
    } else {
      d.inicio = f.inicio === 'data' ? 'data' : 'imediato';
      if (d.inicio === 'data') d.inicioData = dataDeTexto(f.inicioData) || texto(f.inicioData);
    }
    if (mod === 'estagio') d.horasDia = /^\s*\d+\s*$/.test(texto(f.horasDia)) ? Number(f.horasDia) : null;
    if (op.empresaId) d.empresaId = op.empresaId;
    if (op.id) d.id = op.id;
    return d;
  }

  // Termos proibidos com o trecho COMO A EMPRESA ESCREVEU (o filtro do banco devolve o trecho sem acento): até 5, na ordem.
  function mapaNormalizado(t) {
    // Para cada caractere do texto: a sua forma normalizada (sem acento, minúscula; o que não é letra/número vira espaço).
    var chars = [];
    var idx = [];
    for (var i = 0; i < t.length; i++) {
      var n = R.normalizar(t.charAt(i));
      var c = n ? n : ' ';
      if (c === ' ' && chars.length && chars[chars.length - 1] === ' ') continue;
      for (var j = 0; j < c.length; j++) { chars.push(c.charAt(j)); idx.push(i); }
    }
    return { texto: chars.join(''), idx: idx };
  }
  function trechoOriginal(t, trecho) {
    var alvo = R.normalizar(trecho);
    if (!alvo) return trecho;
    var m = mapaNormalizado(t);
    var p = m.texto.indexOf(alvo);
    if (p < 0) return trecho;
    var ini = m.idx[p];
    var fim = m.idx[p + alvo.length - 1];
    return t.slice(ini, fim + 1);
  }
  function termosProibidos(t, ctx) {
    var resto = texto(t);
    var achados = [];
    for (var i = 0; i < 5; i++) {
      var c = R.conferirTexto(resto, ctx || 'anuncio');
      if (!c) break;
      var orig = c.tipo === 'contato' || c.tipo === 'link' ? c.trecho : trechoOriginal(resto, c.trecho);
      achados.push({ tipo: c.tipo, trecho: orig, erro: c.erro });
      var pos = resto.toLowerCase().indexOf(orig.toLowerCase());
      if (pos < 0) break;   // não achou o trecho para tirar: para aqui (o primeiro erro já basta)
      resto = resto.slice(0, pos) + new Array(orig.length + 1).join(' ') + resto.slice(pos + orig.length);
    }
    return achados;
  }
  function juntar(lista) {
    var q = lista.map(function (x) { return '"' + x + '"'; });
    return q.length <= 1 ? q.join('') : q.slice(0, -1).join(', ') + ' e ' + q[q.length - 1];
  }
  // Recusa na hora, explicando a lei em uma frase e dizendo o que escrever (textos de docs/VAGAS-TELAS.md §3.3).
  function mensagemTermos(lista, op) {
    op = op || {};
    if (!lista || !lista.length) return '';
    var disc = lista.filter(function (x) { return x.tipo === 'discriminacao'; }).map(function (x) { return x.trecho; });
    var golpe = lista.filter(function (x) { return x.tipo !== 'discriminacao'; }).map(function (x) { return x.trecho; });
    var partes = [];
    if (disc.length) {
      partes.push('Não dá para publicar assim. ' + juntar(disc) + (disc.length > 1 ? ' são critérios proibidos' : ' é critério proibido') +
        ' por lei (Lei 9.029/1995 e CLT art. 373-A). Descreva o que a pessoa vai fazer e o que precisa saber; sexo, idade e aparência não podem ser requisito.' +
        (op.descricao ? ' Os requisitos vão nos campos acima.' : ''));
    }
    if (golpe.length) partes.push('Tire ' + juntar(golpe) + '. Vagas não podem pedir dinheiro, Pix nem contato fora da plataforma: a conversa acontece aqui.');
    return partes.join(' ');
  }

  // Erro de vagas_anuncio_salvar / VAGAS_REGRAS.lerAnuncio -> campo do formulário (para mostrar o erro no lugar certo).
  var CAMPOS_DO_ERRO = [
    [/Unidade do valor/, 'unidade'], [/área da vaga/, 'area'], [/Informe a função/, 'funcao'], [/tipo de vaga/, 'modalidade'], [/Quantidade de vagas/, 'quantidade'],
    [/turno da vaga/, 'turno'], [/experiência que a vaga pede/, 'experiencia'], [/Escolaridade mínima/, 'escolaridade'],
    [/requisito "Outro"|outro requisito/, 'requisitoOutro'], [/testes da plataforma/, 'selo'], [/valor máximo da faixa/, 'salarioAte'],
    [/salário|bolsa|valor do serviço|Valor alto/, 'salarioDe'], [/descrição|Descreva a vaga/, 'descricao'],
    [/horas por dia do estágio/, 'horasDia'], [/diária fica no ar/, 'prazoHoras'], [/data da diária|próximos 7 dias/, 'data'],
    [/quando a pessoa começa/, 'inicio'], [/data de início/, 'inicioData'], [/zona/, 'zona'], [/confidencial/, 'confidencial']
  ];
  function campoDoErro(msg, f) {
    var m = texto(msg);
    f = f || {};
    if (/data, o horário e o valor da diária/.test(m)) {
      if (!f.data) return 'data';
      if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(texto(f.horaInicio))) return 'horaInicio';
      if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(texto(f.horaFim))) return 'horaFim';
      return 'salarioDe';
    }
    if (/^Tire /.test(m)) {
      var campos = [['funcao', 'cartao'], ['descricao', 'anuncio'], ['requisitoOutro', 'anuncio'], ['funcao', 'anuncio']];
      for (var i = 0; i < campos.length; i++) if (R.conferirTexto(f[campos[i][0]], 'anuncio')) return campos[i][0];
      return 'descricao';
    }
    for (var j = 0; j < CAMPOS_DO_ERRO.length; j++) if (CAMPOS_DO_ERRO[j][0].test(m)) return CAMPOS_DO_ERRO[j][1];
    return '';
  }
  // Validação antes de enviar: obrigatórios da tela (zona quando a cidade tem zonas; data dd/mm/aaaa), termos proibidos com o
  // texto da tela e o resto com a MESMA leitura do banco (VAGAS_REGRAS.lerAnuncio).
  function validarVaga(f, op) {
    op = op || {};
    f = f || {};
    var MSG_ZONA = 'Escolha a zona da cidade onde é o trabalho.';
    var ordem = ['funcao', 'requisitoOutro', 'descricao'];
    for (var i = 0; i < ordem.length; i++) {
      var k = ordem[i];
      if (k === 'requisitoOutro' && (f.requisitos || []).indexOf('outro') < 0) continue;
      var l = termosProibidos(f[k], 'anuncio');
      if (l.length) return { ok: false, campo: k, erro: mensagemTermos(l, { descricao: k === 'descricao' }), termo: true };
    }
    if (f.modalidade !== 'diaria' && f.inicio === 'data' && !dataDeTexto(f.inicioData)) return { ok: false, campo: 'inicioData', erro: 'Use dd/mm/aaaa' };
    var dados = dadosDaVaga(f, op);
    var l2 = R.lerAnuncio(dados, op.hoje || null);
    if (!l2.ok) return { ok: false, campo: campoDoErro(l2.erro, f) || 'descricao', erro: l2.erro };
    if ((op.zonas || []).length && !f.zona) return { ok: false, campo: 'zona', erro: MSG_ZONA };
    return { ok: true, dados: dados };
  }

  // Lateral "Como a vaga aparece nos filtros": o que cada campo fechado vira na busca de quem procura.
  function rotulo(lista, id) { return R.rotulo(lista, id) || ''; }
  function etiquetasFiltro(f, op) {
    op = op || {};
    f = f || {};
    var e = [];
    if (f.area) e.push(rotulo(R.AREAS, f.area));
    if (f.modalidade) e.push(rotulo(R.MODALIDADES, f.modalidade).replace(/\s*\(.*\)$/, ''));
    if (f.turno && f.modalidade !== 'diaria') e.push(rotulo(R.TURNOS_VAGA, f.turno));
    if (f.fimDeSemana) e.push('Fim de semana');
    var c = centavosDe(f.salarioDe);
    if (c) {
      var u = { hora: ' por hora', dia: ' por dia', servico: ' por serviço' }[f.unidade || unidadePadrao(f.modalidade)] || '';
      var ate = centavosDe(f.salarioAte);
      e.push(R.reais(c).replace(/,00$/, '') + (ate && ate !== c ? ' a ' + R.reais(ate).replace(/,00$/, '') : '') + u +
        (f.comissao || (f.beneficios || []).indexOf('comissao') >= 0 ? ' + comissão' : ''));
    }
    var z = (op.zonas || []).filter(function (x) { return x.slug === f.zona; })[0];
    if (z) e.push(z.nome);
    if (f.experiencia === 'nao_precisa') e.push('Sem experiência');
    else if (f.experiencia) e.push(rotulo(R.EXPERIENCIAS_VAGA, f.experiencia));
    if (f.escolaridade && f.escolaridade !== 'nao_exigida') e.push(rotulo(R.ESCOLARIDADES_VAGA, f.escolaridade));
    (f.beneficios || []).forEach(function (b) { if (b !== 'comissao') e.push(rotulo(R.BENEFICIOS, b)); });
    if (f.modalidade === 'diaria' && f.data && f.data === op.hoje) e.push('Para hoje');
    return e.filter(Boolean);
  }

  // ------------------------------------------------------------------------------------------------- divulgar
  function linkCurto(codigo, siteUrl) {
    var c = texto(codigo).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    var base = texto(siteUrl || 'https://vagas.gestaosemcaos.com.br').replace(/\/+$/, '');
    return c ? base + '/v/' + c : '';
  }
  function textoWhatsappVaga(o) {
    o = o || {};
    return preencher(WHATSAPP.vaga_compartilhar, { vaga_titulo: o.titulo, empresa_nome_ou_confidencial: o.confidencial ? 'Empresa confidencial' : o.empresaNome,
      zona: o.zona, valor: o.valor, link_curto: o.link });
  }
  function textoWhatsappCombinou(o) {
    o = o || {};
    return preencher(WHATSAPP.empresa_para_pessoa_combinou, { pessoa_primeiro_nome: primeiroNome(o.pessoaNome), responsavel_nome: o.responsavelNome,
      empresa_nome: o.empresaNome, vaga_titulo: o.vagaTitulo }).replace(/Aqui é , da /, 'Aqui é da ');
  }

  // ------------------------------------------------------------------------------------------------- prazos
  function diasRestantes(expiraIso, agoraMs) {
    var e = Date.parse(texto(expiraIso));
    if (!isFinite(e)) return null;
    return Math.ceil((e - (agoraMs == null ? Date.now() : agoraMs)) / DIA);
  }
  function podeRenovar(a, agoraMs) {
    if (!a || a.modalidade === 'diaria') return false;
    if (['publicado', 'pausado', 'encerrado'].indexOf(a.status) < 0) return false;
    if (a.status === 'encerrado' || a.expirado) return true;
    var d = diasRestantes(a.expiraEm, agoraMs);
    return d === null || d <= 5;
  }

  // ------------------------------------------------------------------------------------------------- referências dadas (P2)
  // O que a empresa vê de uma referência que deu: só o que ELA escreveu e o andamento da MODERAÇÃO. A situação vinda do banco
  // (pendente/aceita/recusada) não entra na tela: assim a empresa não percebe se a pessoa aceitou, ocultou, recusou ou removeu.
  function andamentoReferencia(r) {
    r = r || {};
    if (r.status === 'removida') return { rotulo: 'Removida pela moderação', classe: 'removida', motivo: texto(r.textoMotivo) };
    var ts = { sem_texto: 'sem_texto', pendente: 'pendente', publicado: 'publicado', nao_publicado: 'nao_publicado' }[r.textoStatus] || 'sem_texto';
    var classes = { sem_texto: 'rascunho', pendente: 'revisao', publicado: 'publicado', nao_publicado: 'encerrada' };
    return { rotulo: rotulo(R.TEXTO_STATUS, ts), classe: classes[ts], motivo: ts === 'nao_publicado' ? texto(r.textoMotivo) : '' };
  }

  // Motivo da moderação (chave de moderacao.json em statusMotivo/textoMotivo) com o texto para a empresa. Motivo livre (sem
  // chave) volta como veio. Variável sem valor some, e o "()" que sobraria some junto.
  function motivoModeracao(chave, vars, motivos) {
    var k = texto(chave).trim();
    if (!k) return null;
    var m = motivos && Object.prototype.hasOwnProperty.call(motivos, k) ? motivos[k] : null;
    if (!m) return { titulo: '', texto: k, correcao: '' };
    function limpo(t) { return preencher(t, vars).replace(/\s*\(\s*(["“”]\s*["“”])?\s*\)/g, '').replace(/\s+([.,;:])/g, '$1').replace(/\s{2,}/g, ' ').trim(); }
    return { titulo: texto(m.titulo), texto: limpo(m.texto_empresa), correcao: limpo(m.correcao) };
  }

  // ------------------------------------------------------------------------------------------------- cartões (P3)
  // O único filtro dos cartões é o "Mostrar" pela SITUAÇÃO da candidatura (decisão da própria empresa). Nada por zona, turno,
  // escolaridade, CNH, pretensão, selo, nota ou referência: a ordem é sempre a de chegada.
  var FILTROS_CARTOES = [
    { id: 'novos', rotulo: 'Novos e em conversa', status: ['enviada', 'conversar', 'combinou', 'contratada'] },
    { id: 'agora_nao', rotulo: 'Agora não', status: ['agora_nao'] },
    { id: 'todos', rotulo: 'Todos', status: null }
  ];
  function filtrarCartoes(cartoes, chave) {
    var f = FILTROS_CARTOES.filter(function (x) { return x.id === chave; })[0] || FILTROS_CARTOES[0];
    return (cartoes || []).map(function (c, i) { return { cartao: c, ordem: i + 1 }; })
      .filter(function (x) { return !f.status || f.status.indexOf(x.cartao.status) >= 0; });
  }

  // ------------------------------------------------------------------------------------------------- referência: formulário
  var CAMPOS_REFERENCIA = [[/para quem/, 'email'], [/E-mail inválido/, 'email'], [/função que a pessoa/, 'funcao'], [/vínculo/, 'vinculo'],
    [/mês de início|início não pode/, 'inicio'], [/saída/, 'fim'], [/pontos fortes/, 'pontos'], [/Recomendaria para/, 'recomenda'],
    [/texto pode ter|^Tire /, 'texto'], [/declaração/, 'declaro']];
  function campoDoErroReferencia(msg) {
    for (var i = 0; i < CAMPOS_REFERENCIA.length; i++) if (CAMPOS_REFERENCIA[i][0].test(texto(msg))) return CAMPOS_REFERENCIA[i][1];
    return '';
  }
  // form: {email?, funcao, vinculo, inicio:'MM/AAAA', fim:'MM/AAAA', atual, pontos[], recomenda[], texto, declaro}
  function lerReferenciaForm(f, agoraMs, op) {
    f = f || {};
    op = op || {};
    if (op.porEmail && !R.normalizarEmail(f.email)) return { ok: false, campo: 'email', erro: 'E-mail inválido.' };
    var ini = mesDeTexto(f.inicio);
    if (texto(f.inicio).trim() && !ini) return { ok: false, campo: 'inicio', erro: 'Use mês/ano, como 09/2025' };
    var fim = f.atual ? '' : mesDeTexto(f.fim);
    if (!f.atual && texto(f.fim).trim() && !fim) return { ok: false, campo: 'fim', erro: 'Use mês/ano, como 09/2025' };
    if (!f.atual && !texto(f.fim).trim() && ini) return { ok: false, campo: 'fim', erro: 'Informe o mês/ano de início e de fim (ou marque "trabalha aqui atualmente").' };
    var dados = { funcao: texto(f.funcao), vinculo: texto(f.vinculo), inicio: ini || texto(f.inicio), fim: fim || '', pontosFortes: (f.pontos || []).slice(),
      recomendaPara: (f.recomenda || []).slice(), texto: texto(f.texto), declaracao: f.declaro === true };
    var termos = termosProibidos(f.texto, 'referencia');
    if (termos.length) return { ok: false, campo: 'texto', erro: termos[0].erro };
    var l = R.lerReferencia(dados, agoraMs);
    if (!l.ok) return { ok: false, campo: campoDoErroReferencia(l.erro) || 'funcao', erro: l.erro };
    if (op.porEmail) dados.email = R.normalizarEmail(f.email);
    return { ok: true, dados: dados };
  }

  // ------------------------------------------------------------------------------------------------- cadastro da empresa
  var CAMPOS_EMPRESA = [[/CNPJ/, 'cnpj'], [/razão social/, 'razao'], [/cidade/, 'cidade'], [/zona/, 'zona'], [/descrição/, 'descricao'],
    [/WhatsApp/, 'whatsapp'], [/E-mail/, 'email'], [/^Tire /, 'nome']];
  function campoDoErroEmpresa(msg) {
    for (var i = 0; i < CAMPOS_EMPRESA.length; i++) if (CAMPOS_EMPRESA[i][0].test(texto(msg))) return CAMPOS_EMPRESA[i][1];
    return '';
  }
  // form: {cnpj, mei, razao, nome, setor, cidade, zona, whatsapp, email, descricao}
  function lerEmpresaForm(f) {
    f = f || {};
    var dados = { cnpj: R.normalizarCnpj(f.cnpj), mei: f.mei === true, razaoSocial: texto(f.razao), nomeFantasia: texto(f.nome), setor: texto(f.setor),
      whatsapp: texto(f.whatsapp), email: texto(f.email), descricao: texto(f.descricao), cidade: texto(f.cidade), zona: texto(f.zona) };
    var l = R.lerEmpresa(dados);
    if (!l.ok) return { ok: false, campo: campoDoErroEmpresa(l.erro) || 'razao', erro: l.erro };
    if (!dados.cidade) return { ok: false, campo: 'cidade', erro: 'Escolha a cidade da empresa.' };
    return { ok: true, dados: dados };
  }

  var VAGAS_EMPRESA_REGRAS = {
    WHATSAPP: WHATSAPP, centavosDe: centavosDe, textoDeCentavos: textoDeCentavos, dataDeTexto: dataDeTexto, textoDeData: textoDeData,
    mesDeTexto: mesDeTexto, textoDeMes: textoDeMes, saudacao: saudacao, primeiroNome: primeiroNome, proximosDias: proximosDias,
    unidadesDaModalidade: unidadesDaModalidade, unidadePadrao: unidadePadrao, formVazio: formVazio, formDeAnuncio: formDeAnuncio,
    dadosDaVaga: dadosDaVaga, termosProibidos: termosProibidos, trechoOriginal: trechoOriginal, mensagemTermos: mensagemTermos,
    campoDoErro: campoDoErro, validarVaga: validarVaga, etiquetasFiltro: etiquetasFiltro, linkCurto: linkCurto,
    textoWhatsappVaga: textoWhatsappVaga, textoWhatsappCombinou: textoWhatsappCombinou, diasRestantes: diasRestantes, podeRenovar: podeRenovar,
    andamentoReferencia: andamentoReferencia, motivoModeracao: motivoModeracao, FILTROS_CARTOES: FILTROS_CARTOES, filtrarCartoes: filtrarCartoes,
    lerReferenciaForm: lerReferenciaForm, campoDoErroReferencia: campoDoErroReferencia, lerEmpresaForm: lerEmpresaForm, campoDoErroEmpresa: campoDoErroEmpresa,
    preencher: preencher
  };
  if (nodeJs) module.exports = VAGAS_EMPRESA_REGRAS;
  else root.VAGAS_EMPRESA_REGRAS = VAGAS_EMPRESA_REGRAS;
})(typeof self !== 'undefined' ? self : this);
