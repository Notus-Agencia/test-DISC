/*
 * Vagas sem Caos v2 · PRÉVIA da empresa (só no modo demonstração: fora do domínio oficial, com ?previa=1).
 *
 * Preenche window.VSC_PREVIA_METODOS com os métodos que o site da empresa usa, com as MESMAS formas de resposta do contrato
 * (vagas/js/v2/contrato.js), a partir da base FICTÍCIA de window.VSC_DADOS (dados.js e dados-mais.js, que o adaptador carrega antes).
 * O estado fica neste navegador, em localStorage 'vsc.previa.empresa.v2'. Nada daqui vai para o banco real.
 * As regras duras do banco (filtro de texto, 3 vagas no ar, 3 por dia, salário obrigatório, diária, etapas, contato só depois de
 * verificar ou liberar) são repetidas aqui para a demonstração se comportar como o site de verdade.
 * Controles da demonstração: window.VSC_PREVIA_EMPRESA (trocar de empresa de exemplo, simular avisos, recomeçar).
 */
(function (root) {
  'use strict';
  var D = root.VSC_DADOS;
  if (!D) return;
  var CHAVE = 'vsc.previa.empresa.v2', CHAVE_SESSAO = 'vagas_sessao';
  var HORA = 3600000, DIA = 24 * HORA, BASE = Date.parse('2026-11-24T12:00:00-03:00');
  var METODOS = root.VSC_PREVIA_METODOS = root.VSC_PREVIA_METODOS || {};
  var CNPJ_EXEMPLO = 'EXEMPLO0000100', CNPJ_INATIVO = 'EXINATI0000100';

  var SETORES = [
    ['atendimento', 'Atendimento e recepção', 'Atendimento'], ['vendas-loja', 'Vendas em loja e balcão', 'Vendas em loja'], ['vendas-externas', 'Vendas externas e representação', 'Vendas externas'],
    ['caixa', 'Caixa e operação de loja', 'Caixa'], ['administrativo', 'Administrativo e escritório', 'Escritório'], ['financeiro', 'Financeiro e contabilidade', 'Financeiro'],
    ['rh', 'Recursos humanos', 'RH'], ['logistica', 'Estoque, logística e entregas', 'Logística'], ['motorista', 'Motorista e transporte', 'Motorista'],
    ['producao', 'Produção e indústria', 'Produção'], ['construcao', 'Construção civil', 'Construção'], ['manutencao', 'Manutenção e reparos', 'Manutenção'],
    ['limpeza', 'Limpeza e conservação', 'Limpeza'], ['cozinha', 'Cozinha e restaurante', 'Cozinha'], ['hotelaria', 'Hotelaria e eventos', 'Hotelaria'],
    ['beleza', 'Beleza e estética', 'Beleza'], ['saude', 'Saúde e farmácia', 'Saúde'], ['educacao', 'Educação e creche', 'Educação'], ['agro', 'Agropecuária e campo', 'Agro'],
    ['seguranca', 'Segurança e portaria', 'Segurança'], ['marketing', 'Marketing, design e redes sociais', 'Marketing'], ['tecnologia', 'Tecnologia e informática', 'Tecnologia'],
    ['domesticos', 'Serviços domésticos e cuidado de pessoas', 'Casa'], ['outros', 'Outros comércios e serviços', 'Outros'], ['comercio', 'Comércio e varejo', 'Comércio'],
    ['supermercado', 'Supermercado', 'Mercado'], ['alimentacao', 'Alimentação e restaurante', 'Alimentação'], ['transporte', 'Transporte e logística', 'Transporte'],
    ['industria', 'Indústria', 'Indústria'], ['vendas', 'Vendas e telemarketing', 'Vendas']
  ].map(function (s) { return { id: s[0], nome: s[1], curto: s[2], icone: 'sacola' }; });
  var SETOR_ID = {}; SETORES.forEach(function (s) { SETOR_ID[s.id] = 1; });

  /* ---------- utilidades ---------- */
  function agora() { return Date.now(); }
  function iso(ms) { return new Date(ms).toISOString(); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function erro(msg, codigo, extra) { var r = { ok: false, erro: msg, codigo: codigo }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function reais(n) { return 'R$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function ler() { try { return JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { return null; } }
  function gravar() { try { localStorage.setItem(CHAVE, JSON.stringify(S)); } catch (e) { /* demonstração sem armazenamento */ } }
  function esperar() { return Promise.resolve(); }

  /* ---------- regras de texto (as mesmas do banco) ---------- */
  var regras = null, promessaRegras = null;
  function carregarRegras() {
    if (root.VAGAS_REGRAS) return Promise.resolve(root.VAGAS_REGRAS);
    if (!promessaRegras) {
      promessaRegras = new Promise(function (res, rej) {
        var base = (document.currentScript && document.currentScript.src) ? document.currentScript.src.replace(/v2\/previa\/empresa\.js(\?.*)?$/, '') : 'js/';
        var s = document.createElement('script'); s.src = base + 'regras.js';
        s.onload = function () { res(root.VAGAS_REGRAS); }; s.onerror = function () { rej(new Error('Não foi possível carregar as regras de texto.')); };
        document.head.appendChild(s);
      });
    }
    return promessaRegras;
  }
  function conferir(texto, ctx) { return regras.conferirLista(texto, ctx); }

  /* ---------- estado ---------- */
  var S = null;
  function vazio() { return { v: 2, cenario: 'nova', logado: false, email: '', empresas: [], vagas: [], cands: [], docs: [], equipe: [], convites: [], seq: 1, criadasHoje: 0, dia: dia(), pediuWhats: {} }; }
  function dia() { return new Date(agora() - 3 * HORA).toISOString().slice(0, 10); }
  function carregar() { var s = ler(); S = s && s.v === 2 ? s : vazio(); if (S.dia !== dia()) { S.dia = dia(); S.criadasHoje = 0; } }

  var PESSOA = {}; D.pessoas.forEach(function (p) { PESSOA[p.id] = p; });
  var CANDS_BASE = D.candidaturas;

  function vagaDeBase(v, empId) {
    var o = {
      id: 'EX' + String(v.id).toUpperCase(), titulo: v.titulo, empresaId: empId, setorId: SETOR_ID[v.setorId] ? v.setorId : 'outros', tipo: v.tipo, turno: v.turno, horario: v.horario || v.turno,
      salario: clone(v.salario || { min: 0 }), beneficios: (v.beneficios || []).slice(), requisitos: (v.requisitos || []).slice(), diferenciais: (v.diferenciais || []).slice(),
      descricao: v.descricao || '', atividades: (v.atividades || []).slice(), perguntas: (v.perguntas || []).slice(), vagasQtd: v.vagasQtd || 1, semExperiencia: !!v.semExperiencia, pcd: !!v.pcd,
      urgente: !!v.urgente, status: 'aberta', cidade: v.cidade, bairro: v.bairro || '', publicadaEm: iso(agora() - (v.publicadaHa || 0) * HORA),
      expiraEm: iso(agora() + (30 * DIA - (v.publicadaHa || 0) * HORA)), repete: !!v.repete, confidencial: false
    };
    if (v.id === 'v38') { o.tipo = 'Diária'; o.repete = true; o.salario = { min: 130, max: 200, periodo: 'dia', aCombinar: false, texto: 'R$ 130 a R$ 200 por dia' }; o.horario = 'Toda sexta, das 9h às 19h'; o.diaria = { data: dataIso(agora() + 3 * DIA), das: '09:00', as: '19:00' }; }
    if (o.salario && !o.salario.texto) o.salario.texto = reais(o.salario.min) + ' por mês';
    return o;
  }
  function dataIso(ms) { return new Date(ms - 3 * HORA).toISOString().slice(0, 10); }
  function semear(tipo) {
    var s = vazio(), eid = tipo === 'studio' ? 'e13' : 'e01', e = D.empresas.filter(function (x) { return x.id === eid; })[0], verif = tipo === 'super';
    s.cenario = tipo; s.logado = true; s.email = 'contato@exemplo.com.br';
    var id = '00000000-0000-4000-8000-000000000' + eid;
    s.empresas = [{
      id: id, nome: e.nome, setor: e.setor, cidade: e.cidade, bairro: e.bairro, descricao: e.descricao, iniciais: e.iniciais, verificada: verif,
      verificadaEm: verif ? iso(agora() - 33 * DIA) : null, estado: verif ? 'verificada' : 'em_verificacao', papel: 'dono', cnpj: 'EXEMPLO' + (verif ? '1' : '2') + '000100',
      cnpjFormatado: 'EX.EMP.LO' + (verif ? '1' : '2') + '/0001-00', razaoSocial: tipo === 'studio' ? 'Rafaela (exemplo), MEI' : 'Vale do Passarinho Comércio de Alimentos (exemplo)',
      nomeFantasia: e.nome, whatsapp: tipo === 'studio' ? '5562900000303' : '5562900000101', email: '', responsavel: tipo === 'studio' ? 'Rafaela' : 'Sérgio',
      lojas: tipo === 'studio' ? [{ id: 'l1', nome: 'Studio', bairro: 'Setor Sul', cidade: 'uruacu-go' }] : [{ id: 'l1', nome: 'Loja do Centro', bairro: 'Centro', cidade: 'uruacu-go' }, { id: 'l2', nome: 'Loja da Vila Santana', bairro: 'Vila Santana', cidade: 'uruacu-go' }],
      prazoAte: verif ? null : iso(agora() + 5 * DIA), motivoAjuste: null, prazoEm: agora() + 5 * DIA
    }];
    D.vagas.filter(function (v) { return v.empresaId === eid; }).forEach(function (v) { s.vagas.push(vagaDeBase(v, id)); });
    var ids = D.vagas.filter(function (v) { return v.empresaId === eid; }).map(function (v) { return v.id; });
    var extras = tipo === 'super' ? [
      { id: 'c90', pessoaId: 'p16', vagaId: 'v02', etapa: 'em conversa', haHoras: 30, respostas: [{ pergunta: 'Pode começar às 6h da manhã?', resposta: 'Sim' }], mensagem: 'Seria meu primeiro emprego. Moro perto e chego cedo.' },
      { id: 'c91', pessoaId: 'p22', vagaId: 'v02', etapa: 'contratada', haHoras: 160, respostas: [{ pergunta: 'Pode começar às 6h da manhã?', resposta: 'Sim' }], mensagem: 'Trabalhei com reposição no laticínio e posso começar já.' },
      { id: 'c92', pessoaId: 'p11', vagaId: 'v02', etapa: 'nova', haHoras: 6, respostas: [{ pergunta: 'Pode começar às 6h da manhã?', resposta: 'Sim' }] }
    ] : [];
    CANDS_BASE.filter(function (c) { return ids.indexOf(c.vagaId) >= 0; }).concat(extras).forEach(function (c) { s.cands.push(candDeBase(c)); });
    s.vagas.forEach(function (v) { if (eid === 'e01') v._loja = 'l1'; });
    s.criadasHoje = 0;
    return s;
  }
  function candDeBase(c) {
    var t = agora() - c.haHoras * HORA, etapa = c.etapa, hist = [{ etapa: 'nova', em: iso(t), por: 'pessoa' }];
    if (etapa !== 'nova') hist.push({ etapa: 'vista', em: iso(t + 2 * HORA), por: 'empresa' });
    if (etapa === 'em conversa' || etapa === 'entrevista marcada' || etapa === 'contratada') hist.push({ etapa: 'em conversa', em: iso(t + 6 * HORA), por: 'empresa' });
    var x = { id: 'EX' + String(c.id).toUpperCase(), pessoaId: c.pessoaId, vagaId: 'EX' + String(c.vagaId).toUpperCase(), etapa: etapa, criadaEm: iso(t), visto: etapa !== 'nova',
      respostas: (c.respostas || []).map(function (r) { return { pergunta: r.pergunta, resposta: r.resposta }; }), mensagem: (c.mensagem || '').replace(/!/g, '.') || null, entrevista: null, historico: hist, liberado: false, conversa: [], naoLidas: 0 };
    if (etapa === 'em conversa') {
      x.conversa.push({ id: 'm1' + x.id, de: 'eu', txt: 'Olá. Vi sua candidatura. Podemos conversar amanhã?', ts: iso(t + 6 * HORA) });
      x.conversa.push({ id: 'm2' + x.id, de: 'ela', txt: 'Podemos sim. Fico livre depois das 14h.', ts: iso(Math.min(agora() - HORA, t + 8 * HORA)) }); x.naoLidas = 1;
    }
    if (etapa === 'entrevista marcada' && c.entrevista) {
      var q = Math.round((Date.parse(c.entrevista.quando) - BASE + agora()) / HORA) * HORA;
      x.entrevista = { quando: iso(q), onde: c.entrevista.onde, confirmada: c.id === 'c11' ? true : null, pediuOutro: false };
      x.historico.push({ etapa: 'entrevista marcada', em: iso(t + 10 * HORA), por: 'empresa' });
    }
    if (etapa === 'contratada') x.historico.push({ etapa: 'contratada', em: iso(t + 72 * HORA), por: 'empresa' });
    if (etapa === 'não seguiu') { x.encerradaPor = c.encerradaPor === 'pessoa' ? 'pessoa' : 'empresa'; x.historico.push({ etapa: 'não seguiu', em: iso(t + 3 * HORA), por: x.encerradaPor }); }
    return x;
  }

  /* ---------- formas do contrato ---------- */
  function emp() { return S.empresas[0] || null; }
  function empJson(e) {
    var o = clone(e); delete o.prazoEm;
    if (o.estado !== 'verificada' && o.estado !== 'suspensa') { o.prazoAte = iso(e.prazoEm); if (o.estado === 'em_verificacao' && e.prazoEm <= agora()) { o.estado = 'vencida'; } }
    o.verificada = o.estado === 'verificada';
    return o;
  }
  function estadoEmp(e) { if (e.estado === 'em_verificacao' && e.prazoEm <= agora()) return 'vencida'; return e.estado; }
  function noAr(v) { return v.status === 'aberta' && (v.repete || Date.parse(v.expiraEm) > agora()); }
  function nNoAr() { return S.vagas.filter(noAr).length; }
  function maxNoAr(e) { return e.estado === 'verificada' ? null : 3; }
  function maxHoje(e) { return e.estado === 'verificada' ? 30 : 3; }
  function vagaJson(v) {
    var o = clone(v), cs = S.cands.filter(function (c) { return c.vagaId === v.id; });
    delete o._loja; delete o._forte; delete o._local;
    o.estado = v.status === 'aberta' ? 'no_ar' : v.status === 'segurada' ? 'revisao_rapida' : v.status === 'pausada' ? 'pausada' : v.status === 'encerrada' ? 'encerrada' : v.status;
    o.candidatos = cs.filter(function (c) { return c.etapa !== 'não seguiu'; }).length; o.novos = cs.filter(function (c) { return c.etapa === 'nova'; }).length; o.motivo = v.motivo || null;
    if (o.motivo === null) delete o.motivo;
    return o;
  }
  function pessoaDoCand(c) { return PESSOA[c.pessoaId]; }
  function cnhLista(p) { var s = String(p.cnh || ''); return /não|nao/i.test(s) ? [] : s.split('').filter(function (x) { return /[A-E]/.test(x); }); }
  function podeVer(c) { var e = emp(); return !!e && c.etapa !== undefined && (estadoEmp(e) === 'verificada' || c.liberado); }
  function candJson(c) {
    var p = pessoaDoCand(c), ver = podeVer(c), tel = '556290' + ('00000' + (parseInt(String(p.id).slice(1), 10) || 0)).slice(-6);
    var o = {
      id: c.id, vagaId: c.vagaId, etapa: c.etapa, criadaEm: c.criadaEm, visto: !!c.visto, nome: ver ? p.nome : String(p.nome).split(' ')[0], nomeCompleto: ver,
      resumo: { funcao: p.funcaoDesejada, cidade: p.cidade, bairro: p.bairro, experiencias: (p.experiencias || []).map(function (x) { return { cargo: x.cargo, empresa: x.empresa, inicio: x.inicio, fim: x.fim || null }; }),
        escolaridade: p.escolaridade, cursos: (p.cursos || []).slice(), cnh: cnhLista(p), turnos: (p.disponibilidade || []).slice(), pretensao: p.pretensao || null, tempo: '', texto: p.resumo },
      arquivo: ver && p.temCurriculoAnexo ? { nome: (p.curriculoArquivo && p.curriculoArquivo.nome) || 'curriculo.pdf', tamanhoKb: (p.curriculoArquivo && p.curriculoArquivo.tamanhoKb) || 180, tipo: 'application/pdf' } : null,
      whatsapp: ver ? tel : null, whatsappLiberado: ver, forma: p.temCurriculoAnexo ? 'anexo' : 'montar', respostas: clone(c.respostas || []), mensagem: c.mensagem || null,
      entrevista: c.entrevista ? clone(c.entrevista) : null, historico: clone(c.historico), naoLidas: c.naoLidas || 0
    };
    return o;
  }
  function achaVaga(id) { for (var i = 0; i < S.vagas.length; i++) if (S.vagas[i].id === id) return S.vagas[i]; return null; }
  function achaCand(id) { for (var i = 0; i < S.cands.length; i++) if (S.cands[i].id === id) return S.cands[i]; return null; }
  function precisa(semEmpresa) { if (!S.logado || (!semEmpresa && !emp())) return erro('Sessão expirada. Entre de novo.', 'sem_sessao', { sessaoExpirada: true }); return null; }
  function estadoVagaApi(v) { return v.status === 'aberta' ? 'no_ar' : v.status === 'segurada' ? 'revisao_rapida' : 'rascunho'; }

  /* ---------- validação da vaga (as mesmas regras do banco) ---------- */
  var TIPO_OK = { 'CLT': 'clt', 'Carteira assinada': 'clt', 'Temporário': 'temporario', 'Diária': 'diaria', 'Freelancer': 'freelancer', 'Por serviço': 'freelancer', 'Estágio': 'estagio', 'PJ': 'freelancer' };
  var TURNO_OK = ['Manhã', 'Tarde', 'Noite', 'Comercial', 'Escala 12x36', 'Fim de semana', 'Madrugada'];
  function lerVaga(p, atual) {
    var d = Object.assign({}, atual ? clone(atual) : {}, p), ctx = {};
    var titulo = String(d.titulo || '').trim().slice(0, 60);
    if (titulo.length < 2) return erro('Informe o título da vaga (ex.: Atendente).', 'titulo');
    if (!SETOR_ID[d.setorId]) return erro('Escolha o setor da vaga.', 'setor');
    var mod = TIPO_OK[d.tipo]; if (!mod) return erro('Escolha o tipo da vaga: carteira assinada, temporário, diária, por serviço, estágio ou PJ.', 'tipo');
    var sal = d.salario || {};
    if (sal.aCombinar === true || !(Number(sal.min) > 0)) return erro('Informe o salário. A vaga precisa mostrar o valor: não vale "a combinar".', 'salario_obrigatorio');
    if (Number(sal.min) > 100000) return erro('Valor do salário inválido. Confira o número.', 'salario_invalido');
    var max = Number(sal.max) > 0 ? Number(sal.max) : null;
    if (max !== null && max < Number(sal.min)) return erro('O valor máximo da faixa não pode ser menor que o mínimo.', 'salario_invalido');
    if (max === Number(sal.min)) max = null;
    var per = sal.periodo || (mod === 'diaria' ? 'dia' : 'mes');
    var okPer = (['clt', 'temporario', 'estagio'].indexOf(mod) >= 0 && ['mes', 'hora'].indexOf(per) >= 0) || (mod === 'diaria' && per === 'dia') || (mod === 'freelancer' && ['mes', 'dia', 'hora', 'servico'].indexOf(per) >= 0);
    if (!okPer) return erro('O período do valor não combina com o tipo da vaga.', 'salario_periodo');
    var desc = String(d.descricao || '').trim();
    if (desc.length > 1500) return erro('A descrição pode ter até 1.500 caracteres.', 'descricao');
    if (desc.length < 40) return erro('Descreva a vaga em pelo menos 40 caracteres.', 'descricao');
    var qtd = Number(d.vagasQtd) || 1; if (qtd < 1 || qtd > 100) return erro('Quantidade de vagas inválida (1 a 100).', 'quantidade');
    var cidade = d.cidade || (emp() && emp().cidade);
    if (!D.cidades.some(function (c) { return c.id === cidade; })) return erro('Cidade não encontrada.', 'cidade');
    var horario = String(d.horario || '').trim(), turno = d.turno;
    var diaria = null;
    if (mod === 'diaria') {
      var dd = d.diaria || {}, hoje = dataIso(agora()), data = String(dd.data || '');
      var hh = function (x) { var m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(x)); return m ? ('0' + m[1]).slice(-2) + ':' + (m[2] || '00') : null; };
      var das = hh(dd.das), as = hh(dd.as);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !das || !as) return erro('Na diária, informe o dia, a hora de começar e a hora de terminar.', 'diaria');
      if (data < hoje && !(d.repete && atual)) return erro('A data da diária já passou. Escolha outra data.', 'data_passada');
      if (Date.parse(data + 'T12:00:00Z') > Date.parse(hoje + 'T12:00:00Z') + 7 * DIA) return erro('A diária precisa ser para os próximos 7 dias.', 'data_longe');
      diaria = { data: data, das: das, as: as };
      if (TURNO_OK.indexOf(turno) < 0) turno = parseInt(das, 10) < 12 ? 'Manhã' : parseInt(das, 10) < 18 ? 'Tarde' : 'Noite';
      if (!horario) horario = 'Dia ' + data.slice(8) + '/' + data.slice(5, 7) + ', das ' + das + ' às ' + as;
    } else if (TURNO_OK.indexOf(turno) < 0) return erro('Escolha o turno da vaga.', 'turno');
    if (d.confidencial && emp().estado !== 'verificada') return erro('Vaga confidencial só para empresa verificada.', 'confidencial_so_verificada');
    var listas = { beneficios: 12, requisitos: 12, diferenciais: 8, atividades: 10, perguntas: 2 };
    var L = {}; Object.keys(listas).forEach(function (k) { L[k] = (Array.isArray(d[k]) ? d[k] : []).map(function (x) { return String(x).trim(); }).filter(Boolean).slice(0, listas[k]); });
    var barra = [], forte = [], fraco = [];
    function olhar(campo, t) { var r = conferir(t, 'vaga'); r.barra.forEach(function (x) { barra.push({ campo: campo, trecho: x.trecho, motivo: x.motivo, mensagem: x.mensagem }); }); forte = forte.concat(r.forte); fraco = fraco.concat(r.fraco); }
    olhar('titulo', titulo); olhar('descricao', desc); olhar('horario', horario); olhar('bairro', d.bairro || ''); olhar('salario', sal.obs || '');
    Object.keys(L).forEach(function (k) { L[k].forEach(function (x) { olhar(k, x); }); });
    if (barra.length) return erro(barra[0].mensagem, 'texto_barrado', { barra: barra });
    var v = {
      titulo: titulo, setorId: d.setorId, tipo: mod === 'clt' ? 'CLT' : mod === 'temporario' ? 'Temporário' : mod === 'diaria' ? 'Diária' : mod === 'estagio' ? 'Estágio' : d.tipo === 'PJ' ? 'PJ' : 'Freelancer',
      turno: turno, horario: horario || turno, salario: { min: Number(sal.min), periodo: per === 'servico' ? 'dia' : per, aCombinar: false }, beneficios: L.beneficios, requisitos: L.requisitos, diferenciais: L.diferenciais,
      descricao: desc, atividades: L.atividades, perguntas: L.perguntas, vagasQtd: qtd, semExperiencia: !!d.semExperiencia, pcd: !!d.pcd || /\bpcd\b|com deficiencia/.test(norm(desc)), urgente: !!d.urgente,
      cidade: cidade, bairro: String(d.bairro || '').trim().slice(0, 80), repete: mod === 'diaria' && !!d.repete, confidencial: !!d.confidencial
    };
    if (max !== null) v.salario.max = max;
    if (sal.obs) v.salario.obs = String(sal.obs).slice(0, 120);
    v.salario.texto = (v.salario.max ? reais(v.salario.min) + ' a ' + reais(v.salario.max) : reais(v.salario.min)) + ' ' + ({ mes: 'por mês', dia: 'por dia', hora: 'por hora' }[v.salario.periodo]);
    if (diaria) v.diaria = diaria;
    return { ok: true, vaga: v, forte: forte.length > 0 };
  }

  /* ---------- métodos públicos ---------- */
  METODOS.base = function () {
    var vagas = D.vagas.filter(function (v) { return v.status === 'aberta' && !achaVaga('EX' + String(v.id).toUpperCase()); }).map(function (v) { return vagaDeBase(v, v.empresaId); });
    S.vagas.forEach(function (v) { if (noAr(v)) vagas.push(vagaJson(v)); });
    var base = vagas.map(function (v) { var o = clone(v); delete o.estado; delete o.candidatos; delete o.novos; return o; });
    var empresas = D.empresas.map(function (e) { return { id: e.id, nome: e.nome, setor: e.setor, cidade: e.cidade, bairro: e.bairro, descricao: e.descricao, iniciais: e.iniciais, verificada: !!e.verificada, verificadaEm: null }; });
    S.empresas.forEach(function (e) { empresas.push({ id: e.id, nome: e.nome, setor: e.setor, cidade: e.cidade, bairro: e.bairro, descricao: e.descricao || '', iniciais: e.iniciais || '', verificada: e.estado === 'verificada', verificadaEm: e.verificadaEm || null }); });
    return carregarRegras().then(function (r) { regras = r; return { ok: true, praca: { id: D.praca.id, nome: D.praca.nome, cidadePrincipal: D.praca.cidadePrincipal, uf: D.praca.uf, regiao: D.praca.regiao },
      cidades: D.cidades.map(function (c) { return { id: c.id, nome: c.nome, uf: c.uf, principal: !!c.principal, status: 'ativa', bairros: c.bairros.slice() }; }), setores: clone(SETORES), vagas: base, empresas: empresas, geradoEm: iso(agora()) }; });
  };
  METODOS.textoChecar = function (d) {
    return carregarRegras().then(function (r) {
      regras = r; var l = conferir(String(d.texto || ''), d.contexto === 'conversa' ? 'conversa' : 'vaga');
      return { ok: true, passa: l.barra.length === 0, barra: l.barra, fraco: l.fraco, forte: l.forte };
    });
  };
  METODOS.cnpjConsultar = function (d) {
    var dg = String(d.cnpj || '').replace(/[^0-9a-z]/gi, '').toUpperCase();
    if (/^\d{11}$/.test(dg)) return erro('Isto parece um CPF. Se você é MEI, use o CNPJ que está no Certificado do MEI (CCMEI).', 'cpf');
    if (dg === CNPJ_INATIVO) return { ok: true, cnpj: dg, tipo: 'empresa', ativa: false, situacao: 'BAIXADA', razaoSocial: 'EMPRESA DE EXEMPLO BAIXADA LTDA', nomeFantasia: '', cidade: 'Uruaçu', uf: 'GO', bairro: 'Centro', abertura: '2015-03-10', mei: false, setor: '' };
    if (dg === CNPJ_EXEMPLO) return { ok: true, cnpj: dg, tipo: 'empresa', ativa: true, situacao: 'ATIVA', razaoSocial: 'MERCEARIA SABIA DO CERRADO LTDA (EXEMPLO)', nomeFantasia: 'MERCEARIA SABIA DO CERRADO', cidade: 'Uruaçu', uf: 'GO', bairro: 'Setor Norte', abertura: '2019-05-20', mei: false, setor: 'Comércio' };
    return erro('Na demonstração, use o CNPJ de exemplo ' + 'EX.EMP.LO0/0001-00' + '.', 'cnpj_nao_encontrado');
  };
  METODOS.codigoPedir = function (d) {
    var em = String(d.destino || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(em)) return erro('Escreva o e-mail com @, como nome@empresa.com.', 'destino');
    var p = em.split('@'); return { ok: true, canal: 'email', destinoMascarado: p[0].slice(0, 1) + '•••@' + p[1], reenviarEmSeg: 30, expiraEmSeg: 600 };
  };
  function gravarSessao(email) {
    try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ access_token: 'previa-demo', refresh_token: '', expires_at: Math.floor(agora() / 1000) + 86400, user: { id: 'previa-empresa', email: email || 'contato@exemplo.com.br' } })); } catch (e) { /* sem armazenamento */ }
  }
  METODOS.codigoConfirmar = function (d) {
    if (String(d.codigo) !== '123456') return erro('Código errado. Confira e tente de novo. (Na demonstração, o código é 123456.)', 'codigo_errado', { restantes: 4 });
    var nova = false;
    if (!S.empresas.length && !d.nome) { var s = semear('super'); var guard = S.pediuWhats; S = s; S.pediuWhats = guard || {}; }
    else nova = !S.logado && !S.empresas.length;
    S.logado = true; S.email = d.destino; gravar();
    return { ok: true, sessao: { access_token: 'previa-demo', refresh_token: '', expires_at: Math.floor(agora() / 1000) + 86400, user: { id: 'previa-empresa', email: d.destino } }, novaConta: nova, tipo: 'empresa' };
  };
  METODOS.minhasEmpresas = function () { var e = precisa(true); if (e) return e; return { ok: true, empresas: S.empresas.map(empJson) }; };
  METODOS.empresaCriar = function (d) {
    var e = precisa(true); if (e) return e;
    var dg = String(d.cnpj || '').replace(/[^0-9a-z]/gi, '').toUpperCase();
    if (S.empresas.length) return erro('Esta conta já tem uma empresa.', 'ja_tem');
    if (dg === CNPJ_INATIVO) return erro('Este CNPJ não está ativo na Receita (situação: baixada).', 'cnpj_inativo', { situacao: 'BAIXADA' });
    if (dg !== CNPJ_EXEMPLO) return erro('Na demonstração, use o CNPJ de exemplo EX.EMP.LO0/0001-00.', 'cnpj_nao_encontrado');
    if (!String(d.responsavel || '').trim()) return erro('Informe o nome do responsável.', 'responsavel');
    if (!/^55[1-9][1-9][0-9]{8,9}$/.test(String(d.whatsapp || ''))) return erro('WhatsApp da empresa inválido.', 'whatsapp');
    var nome = String(d.nomeFantasia || '').trim() || 'Mercearia Sabiá do Cerrado';
    var emp0 = { id: '00000000-0000-4000-8000-000000000001', nome: nome, setor: d.setor || 'Comércio', cidade: d.cidade, bairro: d.bairro || '', descricao: '', iniciais: nome.split(/\s+/).slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase(),
      verificada: false, verificadaEm: null, estado: 'em_verificacao', papel: 'dono', cnpj: dg, cnpjFormatado: 'EX.EMP.LO0/0001-00', razaoSocial: 'MERCEARIA SABIA DO CERRADO LTDA (EXEMPLO)', nomeFantasia: nome, whatsapp: d.whatsapp, email: d.email || '',
      responsavel: String(d.responsavel).trim(), lojas: [{ id: 'l1', nome: 'Endereço principal', bairro: d.bairro || '', cidade: d.cidade }], prazoAte: iso(agora() + 7 * DIA), motivoAjuste: null, prazoEm: agora() + 7 * DIA };
    S.empresas = [emp0]; S.cenario = 'propria'; gravar();
    return { ok: true, empresa: empJson(emp0) };
  };
  METODOS.empresaSalvar = function (d) {
    var e = precisa(); if (e) return e; var x = emp();
    if (d.nomeFantasia !== undefined) { if (String(d.nomeFantasia).trim().length < 2) return erro('Informe o nome da empresa.', 'nome'); x.nome = x.nomeFantasia = String(d.nomeFantasia).trim(); x.iniciais = x.nome.split(/\s+/).slice(0, 2).map(function (y) { return y[0]; }).join('').toUpperCase(); }
    if (d.setor !== undefined) x.setor = d.setor; if (d.descricao !== undefined) x.descricao = String(d.descricao).slice(0, 800);
    if (d.bairro !== undefined) x.bairro = d.bairro; if (d.email !== undefined) x.email = d.email;
    if (d.whatsapp !== undefined) { if (d.whatsapp && !/^55[1-9][1-9][0-9]{8,9}$/.test(d.whatsapp)) return erro('WhatsApp da empresa inválido.', 'whatsapp'); x.whatsapp = d.whatsapp; }
    if (d.lojas !== undefined) {
      if (!Array.isArray(d.lojas) || d.lojas.length > 10) return erro('Informe até 10 lojas.', 'lojas');
      x.lojas = d.lojas.map(function (l, i) { return { id: l.id || 'l' + (i + 1), nome: String(l.nome || '').slice(0, 80), bairro: l.bairro || '', cidade: l.cidade || x.cidade }; });
      if (x.lojas.some(function (l) { return l.nome.length < 2; })) return erro('Informe o nome de cada loja.', 'lojas');
    }
    gravar(); return { ok: true, empresa: empJson(x) };
  };
  METODOS.vagasDaEmpresa = function () {
    var e = precisa(); if (e) return e; var x = emp();
    return { ok: true, vagas: S.vagas.map(vagaJson), empresa: empJson(x), limites: { noAr: nNoAr(), maxNoAr: maxNoAr(x), hoje: S.criadasHoje, maxHoje: maxHoje(x) } };
  };
  function publicarInterno(v, e) {
    var est = estadoEmp(e);
    if (est === 'vencida' || est === 'precisa_ajuste') return { estado: 'rascunho', mensagens: [est === 'vencida' ? 'O prazo de 7 dias para verificar a empresa terminou. Envie o que falta em "Verificação" e peça nova conferência: a vaga fica salva como rascunho.' : 'A equipe pediu um ajuste nos dados da empresa. Corrija em "Verificação" e peça nova conferência: a vaga fica salva como rascunho.'] };
    if (e.estado !== 'verificada' && nNoAr() - (noAr(v) ? 1 : 0) >= 3) return { estado: 'rascunho', mensagens: ['Sua empresa está em verificação e pode ter 3 vagas no ar ao mesmo tempo. Esta vaga ficou salva como rascunho: pause ou encerre outra vaga, ou espere a verificação, e publique de novo.'] };
    if (v._forte) { v.status = 'segurada'; return { estado: 'revisao_rapida', mensagens: ['Sua vaga está em revisão rápida e entra no ar assim que a equipe liberar (meta: 2 horas úteis). Nada se perde.'] }; }
    v.status = 'aberta'; v.publicadaEm = iso(agora()); v.expiraEm = iso(agora() + 30 * DIA);
    return { estado: 'no_ar', mensagens: [e.estado !== 'verificada' ? 'Sua vaga já está no ar com o selo "Empresa em verificação". A equipe confere a empresa em até 7 dias.' : 'Sua vaga já está no ar.'] };
  }
  function novaVaga(l, e, idLocal) {
    var v = Object.assign({ id: 'EX' + ('000' + (S.seq++)).slice(-4).replace(/^0+(?=.)/, function (z) { return 'N' + z.slice(1); }), empresaId: e.id, status: 'rascunho', publicadaEm: iso(agora()), expiraEm: iso(agora() + 30 * DIA), _local: idLocal || '' }, l.vaga);
    v._forte = l.forte; S.vagas.unshift(v); return v;
  }
  METODOS.vagaPublicar = function (d) {
    var er = precisa(); if (er) return er; var e = emp();
    if (d.idLocal) { var ja = S.vagas.filter(function (v) { return v._local === d.idLocal; })[0]; if (ja) return { ok: true, vaga: vagaJson(ja), estado: estadoVagaApi(ja), mensagens: [], duplicado: true }; }
    return carregarRegras().then(function (r) {
      regras = r; var l = lerVaga(d.vaga || {}, null); if (!l.ok) return l;
      if (S.criadasHoje >= maxHoje(e)) return erro('Hoje já foram criadas ' + maxHoje(e) + ' vagas desta empresa. Tente de novo amanhã.', 'limite_dia');
      var v = novaVaga(l, e, d.idLocal); S.criadasHoje++;
      var r2 = publicarInterno(v, e); gravar();
      return { ok: true, vaga: vagaJson(v), estado: r2.estado, mensagens: r2.mensagens };
    });
  };
  METODOS.vagaEditar = function (d) {
    var er = precisa(); if (er) return er; var e = emp(), v = achaVaga(d.id);
    if (!v) return erro('Vaga não encontrada.', 'nao_encontrada');
    return carregarRegras().then(function (r) {
      regras = r; var l = lerVaga(d.vaga || {}, v); if (!l.ok) return l;
      var antes = { id: v.id, status: v.status, publicadaEm: v.publicadaEm, expiraEm: v.expiraEm, empresaId: v.empresaId, _local: v._local };
      Object.keys(v).forEach(function (k) { if (['id', 'status', 'publicadaEm', 'expiraEm', 'empresaId', '_local'].indexOf(k) < 0) delete v[k]; });
      Object.assign(v, l.vaga, antes); v._forte = l.forte;
      if (v.status === 'aberta' && l.forte) v.status = 'segurada';
      gravar(); return { ok: true, vaga: vagaJson(v), estado: estadoVagaApi(v) };
    });
  };
  METODOS.vagaAcao = function (d) {
    var er = precisa(); if (er) return er; var e = emp(), v = achaVaga(d.id), a = d.acao;
    if (!v) return erro('Vaga não encontrada.', 'nao_encontrada');
    var est = estadoEmp(e);
    if (['retomar', 'reabrir', 'renovar', 'publicar', 'duplicar'].indexOf(a) >= 0 && est !== 'verificada' && est !== 'em_verificacao') return erro('Esta empresa não pode anunciar agora. Veja a verificação da empresa.', 'empresa_' + est);
    if (a === 'pausar') { if (v.status !== 'aberta') return erro('Só dá para pausar uma vaga que está no ar.', 'estado_invalido'); v.status = 'pausada'; }
    else if (a === 'retomar') {
      if (v.status !== 'pausada') return erro('Só dá para retomar uma vaga pausada.', 'estado_invalido');
      if (e.estado !== 'verificada' && nNoAr() >= 3) return erro('Sua empresa está em verificação e pode ter 3 vagas no ar. Pause ou encerre outra para retomar esta.', 'limite_no_ar');
      v.status = 'aberta';
    } else if (a === 'encerrar') v.status = 'encerrada';
    else if (a === 'reabrir' || a === 'renovar') {
      if (v.status === 'rascunho' || v.status === 'segurada') return erro('Esta vaga ainda não foi publicada.', 'estado_invalido');
      if (v.tipo === 'Diária' && !v.repete) return erro('Para outra data, duplique a diária e escolha o novo dia.', 'diaria');
      if (v.status !== 'aberta' && e.estado !== 'verificada' && nNoAr() >= 3) return erro('Sua empresa está em verificação e pode ter 3 vagas no ar. Pause ou encerre outra primeiro.', 'limite_no_ar');
      v.status = 'aberta'; v.expiraEm = iso(Math.min(Math.max(Date.parse(v.expiraEm), agora()) + 30 * DIA, agora() + 60 * DIA));
    } else if (a === 'publicar') {
      if (v.status !== 'rascunho') return erro('Só dá para publicar um rascunho.', 'estado_invalido');
      var r2 = publicarInterno(v, e); gravar(); return { ok: true, vaga: vagaJson(v), estado: r2.estado, mensagens: r2.mensagens };
    } else if (a === 'duplicar') {
      if (S.criadasHoje >= maxHoje(e)) return erro('Hoje já foram criadas ' + maxHoje(e) + ' vagas desta empresa. Tente de novo amanhã.', 'limite_dia');
      var c = clone(v); delete c.estado; delete c.candidatos; delete c.novos;
      c.id = 'EX' + ('N' + (S.seq++) + '00').slice(0, 4); c.status = 'rascunho'; c._local = ''; c.publicadaEm = iso(agora()); c.expiraEm = iso(agora() + 30 * DIA);
      if (c.diaria) c.diaria.data = dataIso(agora() + DIA);
      S.vagas.unshift(c); S.criadasHoje++; gravar(); return { ok: true, vaga: vagaJson(c) };
    } else return erro('Ação inválida.', 'acao_invalida');
    gravar(); return { ok: true, vaga: vagaJson(v) };
  };
  var ETAPAS = ['nova', 'vista', 'em conversa', 'entrevista marcada', 'contratada', 'não seguiu'];
  METODOS.candidatos = function (d) {
    var er = precisa(); if (er) return er;
    var l = S.cands.filter(function (c) { return !d.vagaId || c.vagaId === d.vagaId; });
    var tot = { total: l.length, novos: l.filter(function (c) { return c.etapa === 'nova'; }).length, porEtapa: {} };
    ETAPAS.forEach(function (e) { tot.porEtapa[e] = l.filter(function (c) { return c.etapa === e; }).length; });
    if (d.etapa) l = l.filter(function (c) { return c.etapa === d.etapa; });
    l.sort(function (a, b) { return Date.parse(b.criadaEm) - Date.parse(a.criadaEm); });
    return { ok: true, lista: l.map(candJson), totais: tot };
  };
  function msgsDe(c) { return c.conversa.map(function (m) { return { id: m.id, de: m.de, txt: m.txt, ts: m.ts }; }); }
  function mudarEtapa(c, etapa, por) {
    if (c.etapa === etapa) return; c.etapaAnterior = c.etapa; c.etapa = etapa;
    c.historico.push({ etapa: etapa, em: iso(agora()), por: por || 'empresa' });
    if (etapa === 'não seguiu') c.encerradaPor = por || 'empresa';
  }
  METODOS.candidato = function (d) {
    var er = precisa(); if (er) return er; var c = achaCand(d.id);
    if (!c) return erro('Candidatura não encontrada.', 'nao_encontrada');
    if (c.etapa === 'nova') { mudarEtapa(c, 'vista'); c.visto = true; }
    c.naoLidas = 0; gravar();
    return { ok: true, candidato: candJson(c), mensagens: msgsDe(c) };
  };
  METODOS.candidatoMover = function (d) {
    var er = precisa(); if (er) return er; var c = achaCand(d.id);
    if (!c) return erro('Candidatura não encontrada.', 'nao_encontrada');
    if (d.desfazer) {
      if (c.etapa !== 'não seguiu' || c.encerradaPor !== 'empresa') return erro('Só dá para desfazer um "Não seguir" feito pela empresa.', 'sem_desfazer');
      var volta = c.etapaAnterior && c.etapaAnterior !== 'não seguiu' ? c.etapaAnterior : 'nova';
      c.etapa = volta; c.encerradaPor = null; c.historico.push({ etapa: volta, em: iso(agora()), por: 'empresa' }); gravar(); return { ok: true, candidato: candJson(c) };
    }
    if (ETAPAS.indexOf(d.etapa) < 0) return erro('Etapa inválida.', 'etapa_invalida');
    if (c.etapa === 'não seguiu' && c.encerradaPor === 'pessoa') return erro('A pessoa retirou a candidatura.', 'encerrada_pela_pessoa');
    if (d.etapa === 'entrevista marcada' && !c.entrevista) return erro('Para marcar a entrevista, informe quando e onde.', 'entrevista_incompleta');
    mudarEtapa(c, d.etapa); gravar(); return { ok: true, candidato: candJson(c) };
  };
  METODOS.whatsappChamar = function (d) {
    var er = precisa(); if (er) return er; var c = achaCand(d.id);
    if (!c) return erro('Candidatura não encontrada.', 'nao_encontrada');
    if (c.etapa === 'não seguiu') return erro('Esta candidatura foi encerrada.', 'encerrada');
    if (!podeVer(c)) return erro('O WhatsApp aparece quando a empresa é verificada ou quando a pessoa libera. Por enquanto, converse pelo site.', 'whatsapp_nao_liberado');
    var j = candJson(c); if (c.etapa === 'nova' || c.etapa === 'vista') mudarEtapa(c, 'em conversa'); gravar();
    return { ok: true, whatsapp: j.whatsapp, link: 'https://wa.me/' + j.whatsapp };
  };
  METODOS.entrevistaMarcar = function (d) {
    var er = precisa(); if (er) return er; var c = achaCand(d.id);
    if (!c) return erro('Candidatura não encontrada.', 'nao_encontrada');
    if (c.etapa === 'não seguiu') return erro('Esta candidatura foi encerrada.', 'encerrada');
    var q = Date.parse(d.quando); if (isNaN(q)) return erro('Informe o dia e a hora da entrevista.', 'quando');
    var onde = String(d.onde || '').trim(); if (onde.length < 3) return erro('Informe onde será a entrevista.', 'onde');
    return carregarRegras().then(function (r) {
      regras = r; var l = conferir(onde + '\n' + (d.recado || ''), 'conversa');
      if (l.barra.length) return erro(l.barra[0].mensagem, 'texto_barrado', { barra: l.barra });
      c.entrevista = { quando: iso(q), onde: onde, confirmada: null, pediuOutro: false }; if (d.recado) c.entrevista.recado = String(d.recado).slice(0, 300);
      mudarEtapa(c, 'entrevista marcada');
      c.conversa.push({ id: 'm' + (S.seq++), de: 'sistema', txt: 'Entrevista marcada para ' + new Date(q - 3 * HORA).toISOString().slice(8, 10) + '/' + new Date(q - 3 * HORA).toISOString().slice(5, 7) + ', em ' + onde + '.', ts: iso(agora()) });
      gravar(); return { ok: true, candidato: candJson(c) };
    });
  };
  METODOS.mensagemEnviar = function (d) {
    var er = precisa(); if (er) return er; var c = achaCand(d.id);
    if (!c) return erro('Candidatura não encontrada.', 'nao_encontrada');
    var t = String(d.texto || '').trim(); if (!t) return erro('Escreva a mensagem.', 'vazio');
    return carregarRegras().then(function (r) {
      regras = r; var l = conferir(t, 'conversa');
      if (l.barra.length) return erro(l.barra[0].mensagem, 'texto_barrado', { barra: l.barra });
      var m = { id: 'm' + (S.seq++), de: 'eu', txt: t, ts: iso(agora()) }; c.conversa.push(m);
      if (/liberar meu whatsapp/i.test(t)) S.pediuWhats[c.id] = true;
      if (c.etapa === 'nova' || c.etapa === 'vista') mudarEtapa(c, 'em conversa');
      gravar(); return { ok: true, mensagem: { id: m.id, de: 'eu', txt: m.txt, ts: m.ts } };
    });
  };
  METODOS.arquivoLink = function (d) {
    var er = precisa(); if (er) return er; var c = achaCand(d.id);
    if (!c || !podeVer(c)) return erro('O arquivo aparece quando a empresa é verificada ou quando a pessoa libera.', 'sem_acesso');
    return { ok: true, url: URL.createObjectURL(new Blob(['Currículo de exemplo (demonstração).'], { type: 'text/plain' })), expiraEm: iso(agora() + 300000) };
  };
  METODOS.denunciar = function () { return { ok: true, derrubou: false }; };
  METODOS.equipe = function () {
    var er = precisa(); if (er) return er;
    var lista = [{ userId: 'previa-empresa', email: S.email || 'contato@exemplo.com.br', nome: emp().responsavel, papel: 'dono', desde: iso(agora() - 5 * DIA), eu: true, pendente: false, podeRemover: false }];
    S.equipe.forEach(function (m) { lista.push(m); }); S.convites.forEach(function (m) { lista.push({ id: m.id, email: m.email, papel: 'recrutador', desde: m.criadoEm, expiraEm: m.expiraEm, eu: false, pendente: true, podeRemover: true }); });
    return { ok: true, equipe: lista };
  };
  METODOS.equipeConvidar = function (d) {
    var er = precisa(); if (er) return er;
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(d.email || '')) return erro('E-mail inválido.', 'email');
    if (emp().estado !== 'verificada' && S.equipe.length + S.convites.length >= 2) return erro('Enquanto a empresa está em verificação, dá para convidar até 2 pessoas. Depois da verificação, o limite sobe.', 'limite_equipe');
    var cv = { id: 'cv' + (S.seq++), email: d.email, criadoEm: iso(agora()), expiraEm: iso(agora() + 3 * DIA) }; S.convites.push(cv); gravar();
    var tk = ''; for (var i = 0; i < 64; i++) tk += '0123456789abcdef'[Math.floor(Math.random() * 16)];
    return { ok: true, equipe: METODOS.equipe().equipe, convite: { id: cv.id, email: cv.email, expiraEm: cv.expiraEm, token: tk } };
  };
  METODOS.verificacao = function () {
    var er = precisa(); if (er) return er; var e = emp(), est = estadoEmp(e);
    var passos = [
      { id: 'cnpj', titulo: 'CNPJ ativo na Receita Federal', feito: true },
      { id: 'responsavel', titulo: 'Responsável e WhatsApp da empresa', feito: true },
      { id: 'documento', titulo: 'Documento da empresa (quando a equipe pedir)', feito: S.docs.length > 0 || est !== 'precisa_ajuste' },
      { id: 'equipe', titulo: 'Conferência da equipe do Vagas sem Caos', feito: est === 'verificada' }
    ];
    var r = { ok: true, estado: est, passos: passos, documentos: clone(S.docs) };
    if (est === 'em_verificacao' || est === 'vencida') r.prazoAte = iso(e.prazoEm);
    if (est === 'precisa_ajuste') r.motivoAjuste = e.motivoAjuste || 'O nome da empresa não bate com o CNPJ. Corrija e peça nova conferência.';
    if (est === 'verificada') r.verificadaEm = e.verificadaEm;
    return r;
  };
  METODOS.verificacaoDocumento = function (d) {
    var er = precisa(); if (er) return er;
    S.docs.unshift({ id: 'doc' + (S.seq++), nome: d.nome, tipo: d.tipo, enviadoEm: iso(agora()) }); gravar(); return { ok: true, documentos: clone(S.docs) };
  };
  METODOS.verificacaoDocumentoLink = function () {
    var er = precisa(); if (er) return er;
    return { ok: true, url: URL.createObjectURL(new Blob(['Documento de exemplo (demonstração).'], { type: 'text/plain' })), expiraEm: iso(agora() + 300000) };
  };
  METODOS.verificacaoReenviar = function (d) {
    var er = precisa(); if (er) return er; var e = emp(), c = d.dados || {};
    if (estadoEmp(e) === 'verificada') return erro('A empresa já está verificada.', 'ja_verificada');
    if (c.nomeFantasia) e.nome = e.nomeFantasia = c.nomeFantasia; if (c.razaoSocial) e.razaoSocial = c.razaoSocial;
    e.estado = 'em_verificacao'; e.motivoAjuste = null; e.prazoEm = agora() + 7 * DIA; gravar(); return { ok: true, estado: 'em_verificacao' };
  };

  /* ---------- controles da demonstração ---------- */
  var CENARIOS = [
    ['nova', 'Empresa nova (sem conta)', 'Começa em "Anuncie sua vaga grátis".'],
    ['studio', 'Studio Flor de Pequi (exemplo) · em verificação', 'Rafaela, MEI. Vagas, uma diária que repete toda semana. Prazo de 7 dias.'],
    ['super', 'Supermercado Vale do Passarinho (exemplo) · verificada', 'Vagas e candidaturas em todas as etapas, dois endereços.']
  ];
  root.VSC_PREVIA_EMPRESA = {
    CENARIOS: CENARIOS,
    cenario: function () { return S.cenario === 'propria' ? 'propria' : S.cenario; },
    trocar: function (id) {
      if (id === 'nova') { S = vazio(); try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* nada */ } }
      else { S = semear(id); gravarSessao('contato@exemplo.com.br'); }
      gravar(); return Promise.resolve();
    },
    recomecar: function () { S = vazio(); gravar(); try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) { /* nada */ } return Promise.resolve(); },
    simular: function (tipo) {
      var e = emp(); if (!e) return Promise.resolve();
      if (tipo === 'verificada') { e.estado = 'verificada'; e.verificadaEm = iso(agora()); e.prazoAte = null; }
      else if (tipo === 'liberou') {
        S.cands.forEach(function (c) { if (S.pediuWhats[c.id] && !c.liberado) { c.liberado = true; c.conversa.push({ id: 'm' + (S.seq++), de: 'sistema', txt: String(PESSOA[c.pessoaId].nome).split(' ')[0] + ' liberou o WhatsApp.', ts: iso(agora()) }); c.naoLidas = (c.naoLidas || 0) + 1; } });
      } else if (tipo === 'confirmou') {
        var c1 = S.cands.filter(function (c) { return c.etapa === 'entrevista marcada' && c.entrevista && c.entrevista.confirmada !== true; })[0];
        if (c1) { c1.entrevista.confirmada = true; c1.naoLidas = (c1.naoLidas || 0) + 1; }
      } else if (tipo === 'nova') {
        var alvo = S.vagas.filter(noAr)[0]; if (alvo) {
          var ja = S.cands.filter(function (c) { return c.vagaId === alvo.id; }).map(function (c) { return c.pessoaId; });
          var p = D.pessoas.filter(function (x) { return ja.indexOf(x.id) < 0; })[S.seq % 7] || D.pessoas[0];
          S.cands.push({ id: 'EXN' + (S.seq++), pessoaId: p.id, vagaId: alvo.id, etapa: 'nova', criadaEm: iso(agora()), visto: false, respostas: (alvo.perguntas || []).map(function (q) { return { pergunta: q, resposta: 'Sim' }; }),
            mensagem: 'Vi a vaga agora e posso começar logo.', entrevista: null, historico: [{ etapa: 'nova', em: iso(agora()), por: 'pessoa' }], liberado: false, conversa: [], naoLidas: 0 });
        }
      }
      gravar(); return Promise.resolve();
    }
  };

  carregar();
})(typeof window !== 'undefined' ? window : globalThis);
