/*
 * Vagas sem Caos — PRÉVIA: um "banco" de mentira guardado só neste navegador (localStorage 'vagas_previa_v2'), com as MESMAS
 * RPCs, regras e mensagens da migração 20261022120000_vagas.sql. Carregado sob demanda por vagas/js/api.js quando
 * VAGAS_CONFIG.MODO = 'previa' (precisa de vagas/js/regras.js carregado antes). Nada sai do navegador; nenhum e-mail é enviado.
 *
 * Dados fictícios de Boa Vista (criados na primeira carga; datas relativas a hoje): 15 empresas (razão social com "(prévia)" e
 * CNPJ de mentira começando com PV), 30 vagas (CLT, temporário, diária, estágio e freelancer; 3 confidenciais; 2 em revisão;
 * 1 rascunho), 40 pessoas, candidaturas, conversas e referências.
 * Logins da prévia (senha previa123): pessoa@previa.com (Ana Clara Ribeiro, cadastro completo, com conversa numa vaga
 * confidencial e um Combinou) · empresa@previa.com (dona do Mercadinho Sol do Norte, com cartões, conversas e referências) ·
 * operador@previa.com (operação de Boa Vista) · admin@previa.com (equipe da Gestão sem Caos).
 * Diferenças da versão real: sem e-mail (cadastrar/esqueci devolvem "linkPrevia" para a tela abrir), sem limites por origem
 * (IP) e sem Turnstile; os limites por conta (30 "Quero"/dia, 3 mensagens seguidas, 20 referências/30 dias) valem.
 *
 * No Node (testes): require('./vagas/js/api-previa.js').criarBackend({armazenamento, agora: () => ms, semente: true|false})
 *   -> {rpc(nome, args) -> Promise<json>, conta: {cadastrar, reenviarConfirmacao, esqueciSenha, cadastroAssistido, convidarOperador,
 *   excluirConta, entrar, sair, sessao, confirmarLink, definirSenha}, estado(), reiniciar()}
 */
(function (root) {
  'use strict';
  var R = (typeof module !== 'undefined' && module.exports) ? require('./regras.js') : root.VAGAS_REGRAS;
  var CHAVE = 'vagas_previa_v2';
  var SENHA_PREVIA = 'previa123';
  var DIA = 86400000;
  var ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function criarBackend(op) {
    op = op || {};
    var arm = op.armazenamento !== undefined ? op.armazenamento : (function () { try { return root.localStorage || null; } catch (e) { return null; } })();
    var relogio = op.agora || function () { return Date.now(); };
    var st = null;

    // ------------------------------------------------------------------------------------------------- utilidades
    function agora() { return relogio(); }
    function iso(ms) { return ms == null ? '' : new Date(ms).toISOString(); }
    function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
    function salvar() { try { if (arm) arm.setItem(CHAVE, JSON.stringify(st)); } catch (e) { /* sem armazenamento */ } }
    function novoId() {
      st.seq += 1;
      var h = st.seq.toString(16);
      while (h.length < 12) h = '0' + h;
      return '00000000-0000-4000-8000-' + h;
    }
    function novoToken() {
      st.seq += 1;
      var s = '';
      var x = st.seq * 2654435761 % 4294967296;
      while (s.length < 64) { x = (x * 1103515245 + 12345) % 2147483648; s += (x % 16).toString(16); }
      return s;
    }
    function novoCodigo() {
      var c;
      do {
        st.seq += 1;
        var n = st.seq * 7919 + 104729;
        c = '';
        for (var i = 0; i < 6; i++) { c += ALFABETO.charAt(n % 32); n = Math.floor(n / 32) + (i + 1) * 13; }
      } while (st.anuncios.some(function (a) { return a.codigo === c; }));
      return c;
    }
    function erro(msg, extra) { return Object.assign({ ok: false, erro: msg }, extra || {}); }
    function ok(o) { return Object.assign({ ok: true }, o || {}); }
    function txt(v) { return v == null ? '' : (typeof v === 'object' ? '[object Object]' : String(v)); }
    function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    function reUuid(v) { return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(v || '')); }
    function hoje(fuso) { return R.hoje(fuso || 'America/Boa_Vista', agora()); }
    function mesAtualIso() { return new Date(agora()).toISOString().slice(0, 7); }
    function contar(tipo, chave, janelaMs) {
      var k = tipo + '|' + chave;
      var lista = (st.limites[k] || []).filter(function (t) { return t > agora() - 8 * DIA; });
      lista.push(agora());
      st.limites[k] = lista;
      return lista.filter(function (t) { return t > agora() - janelaMs; }).length;
    }

    // ------------------------------------------------------------------------------------------------- consultas
    function usuario(id) { return st.usuarios.filter(function (u) { return u.id === id; })[0] || null; }
    function usuarioPorEmail(e) { return st.usuarios.filter(function (u) { return u.email === e; })[0] || null; }
    function cidade(slug) { return st.cidades.filter(function (c) { return c.slug === slug; })[0] || null; }
    function zona(cid, slug) { return st.zonas.filter(function (z) { return z.cidade === cid && z.slug === slug; })[0] || null; }
    function empresa(id) { return st.empresas.filter(function (e) { return e.id === id; })[0] || null; }
    function anuncio(id) { return st.anuncios.filter(function (a) { return a.id === id; })[0] || null; }
    function candidatura(id) { return st.candidaturas.filter(function (k) { return k.id === id; })[0] || null; }
    function conversaDe(candId) { return st.conversas.filter(function (v) { return v.candidaturaId === candId; })[0] || null; }
    function eAdmin() { var u = usuario(st.sessao); return !!(u && u.admin); }
    function contaValida(uid) { var u = usuario(uid); var c = st.contas[uid]; return !!(u && c && c.status !== 'suspensa' && u.confirmada); }

    function contaAtual(tipo) {
      var uid = st.sessao;
      if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var c = st.contas[uid];
      if (!c) return erro(R.MSG.SEM_CONTA, { semConta: true });
      if (c.status === 'suspensa') return erro(R.MSG.SUSPENSA, { suspensa: true });
      if (c.status === 'pendente') {
        if (!usuario(uid).confirmada) return erro(R.MSG.CONFIRMAR, { confirmar: true });
        c.status = 'ativa';
        c.confirmadaEm = c.confirmadaEm || agora();
        // O consentimento vale a partir do clique no link: é gravado aqui (igual ao banco).
        if (c.termosVersao && !c.termosAceitosEm) {
          c.termosAceitosEm = agora();
          st.consentimentos.push({ userId: uid, tipo: 'termos', versao: c.termosVersao, aceito: true, em: agora() });
          st.consentimentos.push({ userId: uid, tipo: 'privacidade', versao: c.termosVersao, aceito: true, em: agora() });
        }
      }
      if (tipo && c.tipo !== tipo) return erro(tipo === 'pessoa' ? R.MSG.SO_PESSOA : tipo === 'empresa' ? R.MSG.SO_EMPRESA : R.MSG.SEM_PERMISSAO);
      return { ok: true, userId: uid, tipo: c.tipo };
    }
    function papelCidade(cid) {
      if (eAdmin()) return 'admin';
      var o = st.operadores.filter(function (x) { return x.userId === st.sessao && x.cidade === cid && x.ativo && contaValida(x.userId); })[0];
      return o ? o.papel : null;
    }
    function cidadesOperadas() {
      if (eAdmin()) return st.cidades.map(function (c) { return c.slug; });
      return st.operadores.filter(function (x) { return x.userId === st.sessao && x.ativo && contaValida(x.userId); }).map(function (x) { return x.cidade; });
    }
    function cidadesDoFiltro(f) {
      var c = txt(f.cidade).trim().toLowerCase();
      return cidadesOperadas().filter(function (s) { return !c || s === c; });
    }
    function membro(empId, dono) {
      return st.membros.some(function (m) { return m.empresaId === empId && m.userId === st.sessao && m.ativo && (!dono || m.papel === 'dono') && contaValida(m.userId); });
    }
    function registrar(cid, papel, acao, alvo, alvoId, motivo, dados) {
      st.moderacao.push({ id: st.moderacao.length + 1, cidade: cid, ator: st.sessao, papel: papel || 'sistema', acao: acao, alvo: alvo, alvoId: alvoId || null,
        motivo: R.limparTexto(motivo, 300), dados: dados || {}, em: agora() });
    }

    // ------------------------------------------------------------------------------------------------- JSON (iguais ao banco)
    function cidadeJson(c) {
      return { id: c.id, slug: c.slug, nome: c.nome, uf: c.uf, status: c.status, fuso: c.fuso, praca: c.praca || null,
        zonas: st.zonas.filter(function (z) { return z.cidade === c.slug && z.ativa; }).sort(function (a, b) { return a.ordem - b.ordem || a.nome.localeCompare(b.nome); })
          .map(function (z) { return { id: z.id, slug: z.slug, nome: z.nome, bairros: z.bairros.slice() }; }),
        interessados: c.status === 'lista_espera' ? interessados(c.slug) : null,
        metaListaEspera: c.metaListaEspera == null ? null : c.metaListaEspera };
    }
    // Interessados na lista de espera, APROXIMADO como no banco: só quem entrou até o dia anterior, em dezenas (ninguém
    // descobre pelo contador se um e-mail já estava na lista).
    function interessados(slug) {
      var inicioHoje = new Date(agora()); inicioHoje.setUTCHours(0, 0, 0, 0);
      var n = st.listaEspera.filter(function (l) { return l.cidade === slug && l.criadoEm < inicioHoje.getTime(); }).length;
      return Math.floor(n / 10) * 10;
    }
    function zonaJson(cid, slug) { var z = slug ? zona(cid, slug) : null; return z ? { slug: z.slug, nome: z.nome } : null; }
    function noAr(a) {
      var e = empresa(a.empresaId);
      var c = cidade(a.cidade);
      return a.status === 'publicado' && a.expiraEm > agora() && !!e && e.status === 'ativa' && !!c && c.status === 'ativa' &&
        (a.modalidade !== 'diaria' || a.diaria.data >= hoje(c.fuso));
    }
    function expiraCalculada(a) {
      if (a.modalidade === 'diaria') return agora() + (a.prazoHoras || 48) * 3600000;
      return agora() + a.diasNoAr * DIA;
    }
    function areaJson(slug) {
      var x = R.AREAS.filter(function (z) { return z.id === slug; })[0];
      return { slug: slug, nome: x ? x.rotulo : slug };
    }
    function requisitosLista(a) {
      var l = [];
      R.REQUISITOS_VAGA.forEach(function (r) {
        if (a.requisitos.indexOf(r.id) < 0) return;
        if (r.id === 'outro') { if (a.requisitoOutro) l.push(a.requisitoOutro); } else l.push(r.rotulo);
      });
      return l;
    }
    function anuncioResumo(a, revelar) {
      var e = empresa(a.empresaId);
      var c = cidade(a.cidade);
      var conf = !!e.cnpjConferidoEm;
      return {
        id: a.id, codigo: a.codigo, titulo: a.funcao, funcao: a.funcao, modalidade: a.modalidade, area: areaJson(a.area), turno: a.turno,
        fimDeSemana: a.fimDeSemana, experiencia: a.experiencia, comissao: a.comissao, selo: a.selo || null, valor: clone(a.valor),
        cidade: { slug: c.slug, nome: c.nome }, zona: zonaJson(a.cidade, a.zona),
        empresa: a.confidencial && !revelar ? { nome: 'Empresa confidencial', iniciais: '', confidencial: true, conferida: conf }
          : { nome: e.nomeFantasia, iniciais: R.iniciais(e.nomeFantasia), confidencial: a.confidencial, conferida: conf },
        diaria: a.modalidade === 'diaria' ? clone(a.diaria) : null,
        paraHoje: a.modalidade === 'diaria' && a.diaria.data === hoje(c.fuso),
        quantidade: a.quantidade, publicadoEm: iso(a.publicadoEm), expiraEm: iso(a.expiraEm)
      };
    }
    function anuncioDetalhe(a, revelar) {
      var r = anuncioResumo(a, revelar);
      var e = empresa(a.empresaId);
      r.descricao = a.descricao; r.requisitos = a.requisitos.slice(); r.requisitoOutro = a.requisitoOutro; r.requisitosLista = requisitosLista(a);
      r.beneficios = a.beneficios.slice(); r.escolaridade = a.escolaridade; r.inicio = a.inicio; r.inicioData = a.inicioData || '';
      r.horasDia = a.horasDia == null ? null : a.horasDia;
      r.empresa.setor = a.confidencial && !revelar ? '' : e.setor;
      r.empresa.descricao = a.confidencial && !revelar ? '' : e.descricao;
      return r;
    }
    function anuncioEmpresa(a) {
      var r = anuncioDetalhe(a, true);
      var ks = st.candidaturas.filter(function (k) { return k.anuncioId === a.id; });
      var conta = function (s) { return ks.filter(function (k) { return k.status === s; }).length; };
      return Object.assign(r, { empresaId: a.empresaId, confidencial: a.confidencial, diasNoAr: a.diasNoAr, prazoHoras: a.prazoHoras == null ? null : a.prazoHoras,
        status: a.status, statusMotivo: a.statusMotivo,
        noAr: noAr(a), expirado: a.expiraEm != null && a.expiraEm <= agora(), encerradoEm: iso(a.encerradoEm), criadoEm: iso(a.criadoEm),
        atualizadoEm: iso(a.atualizadoEm), candidaturas: { total: ks.filter(function (k) { return k.status !== 'retirada'; }).length, novas: conta('enviada'),
          conversar: conta('conversar'), combinou: conta('combinou'), contratada: conta('contratada') } });
    }
    function pontosFortesIds() { return R.PONTOS_FORTES.map(function (p) { return p.id; }); }
    function referenciaVisivel(r) { var e = empresa(r.empresaId); return r.status === 'aceita' && !!e && e.status === 'ativa'; }
    // O que a empresa autora (e a operação) vê: ocultar/remover pela pessoa não aparece (veto P2 da psicologia).
    function referenciaStatusEmpresa(r) {
      if (r.status === 'aceita' || r.status === 'ocultada') return 'aceita';
      if (r.status === 'removida' && r.removidaPor === 'pessoa') return r.aceitaEm != null ? 'aceita' : 'recusada';
      return r.status;
    }
    function referenciaParaEmpresa(r, empresas) {
      return referenciaVisivel(r) || ((empresas || []).indexOf(r.empresaId) >= 0 && referenciaStatusEmpresa(r) === 'aceita');
    }
    // Cartão cego: só "tem referência de empresa verificada" (veto P1).
    function temReferencia(uid, empId) {
      return st.referencias.some(function (r) { return r.pessoaId === uid && referenciaParaEmpresa(r, empId ? [empId] : []); });
    }
    function minhasEmpresasIds() {
      return st.membros.filter(function (m) { return m.userId === st.sessao && m.ativo && contaValida(m.userId); }).map(function (m) { return m.empresaId; });
    }
    function referenciaJson(r, textoSempre) {
      var e = empresa(r.empresaId);
      return { id: r.id, empresa: { nome: e.nomeFantasia, conferida: !!e.cnpjConferidoEm, cidade: cidade(e.cidade).nome }, funcao: r.funcao, vinculo: r.vinculo,
        inicio: r.inicio, fim: r.fim, atual: !r.fim, pontosFortes: r.pontosFortes.slice(), recomendaPara: r.recomendaPara.slice(),
        texto: textoSempre || r.textoStatus === 'publicado' ? r.texto : '', textoStatus: r.textoStatus, criadoEm: iso(r.criadoEm) };
    }
    function experiencias(uid) { return st.experiencias.filter(function (x) { return x.userId === uid; }).sort(function (a, b) { return a.ordem - b.ordem; }); }
    function selos(uid) { return clone((st.selos || {})[uid] || []); }
    function cartao(uid, empId) {
      var p = st.pessoas[uid];
      if (!p) return null;
      var c = cidade(p.cidade);
      var xs = experiencias(uid);
      return {
        cidade: { slug: c.slug, nome: c.nome }, zona: zonaJson(p.cidade, p.zona), cargos: p.cargos.slice(),
        experiencias: xs.map(function (x) { return { funcao: x.funcao, meses: R.meses(x.inicio, x.fim, agora()), atual: !x.fim, informal: x.informal }; }),
        experienciaTotalMeses: xs.reduce(function (s, x) { return s + R.meses(x.inicio, x.fim, agora()); }, 0),
        escolaridade: p.escolaridade, turnos: p.turnos.slice(), cnh: p.cnh.slice(), modalidades: p.modalidades.slice(),
        pretensaoCentavos: p.pretensaoCentavos, cursos: p.cursos.slice(), selos: selos(uid), temReferencia: temReferencia(uid, empId || null)
      };
    }
    function pessoaJson(uid) {
      var p = st.pessoas[uid];
      if (!p) return null;
      var c = cidade(p.cidade);
      var c2 = p.cidade2 ? cidade(p.cidade2) : null;
      var ct = st.contatos[uid] || {};
      return { cidade: { slug: c.slug, nome: c.nome }, cidade2: c2 ? { slug: c2.slug, nome: c2.nome } : null, zona: zonaJson(p.cidade, p.zona),
        maior18: true, cargos: p.cargos.slice(), escolaridade: p.escolaridade, turnos: p.turnos.slice(), cnh: p.cnh.slice(),
        modalidades: p.modalidades.slice(), pretensaoCentavos: p.pretensaoCentavos, cursos: p.cursos.slice(), areas: (p.areas || []).slice(),
        sobre: p.sobre, temFoto: temFoto(uid),
        nome: ct.nome || '', whatsapp: ct.whatsapp || '', email: ct.email || '',
        experiencias: experiencias(uid).map(function (x) { return { funcao: x.funcao, empregador: x.empregador, inicio: x.inicio, fim: x.fim || '', informal: x.informal }; }),
        bancoTalentosAte: iso(p.bancoAte), atualizadoEm: iso(p.atualizadoEm) };
    }
    function completo(uid) { return !!(st.pessoas[uid] && st.contatos[uid]); }
    function temFoto(uid) { return !!(st.fotos && st.fotos[uid]); }
    function naoLidas(v, lado) {
      if (!v) return 0;
      var lida = lado === 'pessoa' ? v.lidaPessoaEm : v.lidaEmpresaEm;
      return st.mensagens.filter(function (m) { return m.conversaId === v.id && m.autor !== lado && m.criadoEm > (lida == null ? -Infinity : lida); }).length;
    }
    function revelada(k) { var a = anuncio(k.anuncioId); return !a.confidencial || k.empresaReveladaEm != null || k.status === 'combinou' || k.status === 'contratada'; }
    function candidaturaPessoa(k) {
      var a = anuncio(k.anuncioId);
      var e = empresa(k.empresaId);
      var v = conversaDe(k.id);
      var res = anuncioResumo(a, revelada(k));
      res.noAr = noAr(a);
      return { id: k.id, status: k.status, criadoEm: iso(k.criadoEm), atualizadoEm: iso(k.atualizadoEm), empresaRevelada: revelada(k),
        contatoCortadoEm: iso(k.contatoCortadoEm), anuncio: res,
        conversa: v ? { status: v.status, naoLidas: naoLidas(v, 'pessoa'), ultimaEm: iso(v.ultimaEm) } : null,
        combinou: k.status === 'combinou' || k.status === 'contratada' ? { em: iso(k.combinouEm), empresa: { nome: e.nomeFantasia, whatsapp: e.whatsapp, email: e.email } } : null };
    }
    function empresaJson(e) {
      var c = cidade(e.cidade);
      return { id: e.id, cnpj: e.cnpj, cnpjFormatado: R.formatarCnpj(e.cnpj), mei: e.mei, razaoSocial: e.razaoSocial, nomeFantasia: e.nomeFantasia,
        setor: e.setor, descricao: e.descricao, whatsapp: e.whatsapp, email: e.email, status: e.status, statusMotivo: e.statusMotivo,
        cnpjConferidoEm: iso(e.cnpjConferidoEm), cidade: { slug: c.slug, nome: c.nome }, zona: zonaJson(e.cidade, e.zona), criadoEm: iso(e.criadoEm) };
    }
    function tocar(x) { x.atualizadoEm = agora(); }

    // Filtros só sobre a VAGA (iguais a vagas_interno.listar_anuncios); nada de nota, selo, referência, idade ou sexo.
    function listarAnuncios(cids, filtro, pessoaId, areasPadrao) {
      var f = obj(filtro);
      var lim = R.inteiro(f.limite); lim = Math.min(Math.max(lim == null ? 20 : lim, 1), 20);
      var zonas = typeof f.zona === 'string' ? [f.zona] : (Array.isArray(f.zona) ? f.zona : null);
      var mods = R.listaEnum(f.modalidade, R.MODALIDADES);
      var paraHoje = f.paraHoje === true;
      var busca = R.normalizar(txt(f.busca)).slice(0, 60);
      var areas, padrao = false;
      if (Object.prototype.hasOwnProperty.call(f, 'areas')) areas = R.listaEnum(typeof f.areas === 'string' ? [f.areas] : f.areas, R.AREAS);
      else { areas = (areasPadrao || []).slice(); padrao = areas.length > 0; }
      var turnos = R.listaEnum(f.turno, R.TURNOS_VAGA);
      var sal = R.inteiro(f.salarioMin);
      var semExp = f.semExperiencia === true;
      var soTotal = f.somenteTotal === true;
      var dep = soTotal ? null : /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([0-9a-f-]{36})$/.exec(txt(f.depois));
      var mult = { mes: 1, dia: 22, hora: 220 };
      var lista = st.anuncios.filter(function (a) {
        var c = cidade(a.cidade);
        if (cids.indexOf(a.cidade) < 0 || !noAr(a)) return false;
        if (zonas && zonas.indexOf(a.zona) < 0) return false;
        if (mods.length && mods.indexOf(a.modalidade) < 0) return false;
        if (paraHoje && !(a.modalidade === 'diaria' && a.diaria.data === hoje(c.fuso))) return false;
        if (areas.length && areas.indexOf(a.area) < 0) return false;
        if (turnos.length && turnos.indexOf(a.turno) < 0) return false;
        if (sal != null && (a.valor.maxCentavos != null ? a.valor.maxCentavos : a.valor.minCentavos) * (mult[a.valor.unidade] || 0) < sal) return false;
        if (semExp && a.experiencia !== 'nao_precisa') return false;
        if (busca && R.normalizar(a.funcao + ' ' + areaJson(a.area).nome).indexOf(busca) < 0) return false;
        if (pessoaId && (st.pulos.some(function (p) { return p.pessoaId === pessoaId && p.anuncioId === a.id; }) ||
          st.candidaturas.some(function (k) { return k.pessoaId === pessoaId && k.anuncioId === a.id; }))) return false;
        if (dep && (a.publicadoEm > Date.parse(dep[1]) || (a.publicadoEm === Date.parse(dep[1]) && a.id >= dep[2]))) return false;
        return true;
      }).sort(function (a, b) { return b.publicadoEm - a.publicadoEm || (a.id < b.id ? 1 : -1); });
      if (soTotal) return { total: lista.length, areasAplicadas: areas, areasPadrao: padrao };
      var pagina = lista.slice(0, lim);
      var ult = pagina[pagina.length - 1];
      return { anuncios: pagina.map(function (a) { return anuncioResumo(a, false); }),
        proximo: lista.length > lim && ult ? iso(ult.publicadoEm).replace(/\.(\d{3})Z$/, '.$1000Z') + '_' + ult.id : '',
        areasAplicadas: areas, areasPadrao: padrao };
    }

    // ------------------------------------------------------------------------------------------------- RPCs
    var H = {};

    H.versao_banco = function () { return ok({ versao: 20261022120000, faltando: [] }); };

    H.vagas_cidades_publicas = function () {
      return ok({ cidades: st.cidades.filter(function (c) { return c.status === 'ativa' || c.status === 'lista_espera'; })
        .sort(function (a, b) { return a.ordem - b.ordem || a.nome.localeCompare(b.nome); }).map(cidadeJson) });
    };

    H.vagas_anuncios_publicos = function (a) {
      var f = obj(a.p_filtro);
      var c = cidade(txt(f.cidade).trim().toLowerCase());
      if (!c || c.status === 'rascunho') return erro('Cidade não encontrada.', { naoEncontrada: true });
      if (c.status === 'lista_espera') return erro(R.MSG.CIDADE_FECHADA, { listaEspera: true, interessados: interessados(c.slug) });
      if (c.status === 'pausada') return erro('As vagas desta cidade estão pausadas no momento.', { pausada: true });
      var cids = [c.slug];
      if (f.entorno !== false) st.cidades.forEach(function (x) { if (x.praca === c.slug && x.status === 'ativa') cids.push(x.slug); });
      var eu = st.sessao && st.pessoas[st.sessao];
      return ok(Object.assign({ cidade: { slug: c.slug, nome: c.nome } }, listarAnuncios(cids, f, null, eu ? eu.areas : [])));
    };

    H.vagas_anuncio_publico = function (a) {
      var cod = txt(a.p_codigo).trim().toUpperCase();
      var an = st.anuncios.filter(function (x) { return x.codigo === cod; })[0];
      if (!/^[A-Z0-9]{6}$/.test(cod) || !an || !noAr(an)) return erro(R.MSG.VAGA_FORA, { naoEncontrada: true });
      var revelar = false;
      var extra = {};
      var k = st.sessao ? st.candidaturas.filter(function (x) { return x.anuncioId === an.id && x.pessoaId === st.sessao; })[0] : null;
      if (k) { revelar = revelada(k); extra.minhaCandidatura = { id: k.id, status: k.status }; }
      return ok({ anuncio: Object.assign(anuncioDetalhe(an, revelar), extra) });
    };

    // 1 vista por "origem" (na prévia: o navegador; com login, a conta) por anúncio por dia; a própria empresa não conta.
    H.vagas_anuncio_vista = function (a) {
      var cod = txt(a.p_codigo).trim().toUpperCase();
      var an = st.anuncios.filter(function (x) { return x.codigo === cod; })[0];
      if (!an || !noAr(an)) return erro(R.MSG.VAGA_FORA, { naoEncontrada: true });
      if (st.sessao && membro(an.empresaId)) return ok({ contada: false });
      var dia = hoje(cidade(an.cidade).fuso);
      if (contar('vista', an.id + ':' + (st.sessao || 'navegador') + ':' + dia, DIA) > 1) return ok({ contada: false });
      st.vistas = st.vistas || {};
      st.vistas[an.id + '|' + dia] = (st.vistas[an.id + '|' + dia] || 0) + 1;
      return ok({ contada: true });
    };

    // Conferência pública do selo (a RPC real é da migração dos testes, 20261023; aqui, os selos fictícios da prévia).
    H.vagas_selo_publico = function (a) {
      var cod = txt(a.p_codigo).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      var achado = null;
      Object.keys(st.selos || {}).forEach(function (uid) {
        (st.selos[uid] || []).forEach(function (x) { if (x.codigo === cod) achado = x; });
      });
      if (!achado) return erro('Selo não encontrado. Confira o código.', { codigo: 'selo_inexistente' });
      return ok({ selo: { codigo: achado.codigo, teste: achado.teste, nome: achado.nome, nota: achado.nota, data: achado.data, validoAte: achado.validoAte,
        supervisao: achado.supervisao || 'online', situacao: achado.validoAte >= hoje() ? 'valido' : 'vencido' } });
    };

    H.vagas_lista_espera_entrar = function (a) {
      var d = obj(a.p_dados);
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c || c.status === 'rascunho' || c.status === 'pausada') return erro('Cidade não encontrada.');
      if (c.status === 'ativa') return erro('Esta cidade já está aberta: faça o seu cadastro.', { ativa: true });
      var email = R.normalizarEmail(d.email);
      if (!email) return erro('E-mail inválido.');
      if (!st.listaEspera.some(function (l) { return l.cidade === c.slug && l.email === email; })) {
        st.listaEspera.push({ cidade: c.slug, email: email, perfil: d.perfil === 'empresa' ? 'empresa' : 'pessoa', criadoEm: agora() });
      }
      return ok({ cidade: c.slug, interessados: interessados(c.slug) });
    };

    H.vagas_lista_espera_sair = function (a) {
      var d = obj(a.p_dados);
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c) return erro('Cidade não encontrada.');
      var email = R.normalizarEmail(d.email);
      if (!email) return erro('E-mail inválido.');
      st.listaEspera = st.listaEspera.filter(function (l) { return !(l.cidade === c.slug && l.email === email); });
      return ok({ cidade: c.slug, removido: true });
    };

    H.vagas_denunciar = function (a) {
      var d = obj(a.p_dados);
      var motivo = txt(d.motivo);
      if (R.MOTIVOS_DENUNCIA.map(function (m) { return m.id; }).indexOf(motivo) < 0) return erro('Escolha o motivo da denúncia.');
      var uid = st.sessao;
      if (uid) {
        var c = contaAtual(null);
        if (!c.ok) return c;
        if (contar('denuncia_conta', uid, DIA) > 20) return erro('Muitas denúncias em pouco tempo. Tente de novo amanhã.', { bloqueado: true });
      }
      var id = txt(d.id).trim();
      var detalhe = R.limparTexto(d.detalhe, 600);
      if (d.alvo === 'anuncio') {
        var an = reUuid(id) ? anuncio(id) : st.anuncios.filter(function (x) { return x.codigo === id.toUpperCase(); })[0];
        if (!an || an.status === 'rascunho' || an.status === 'removido') return erro(R.MSG.VAGA_FORA);
        if (uid && st.denuncias.some(function (x) { return x.alvo === 'anuncio' && x.anuncioId === an.id && x.autor === uid; })) return ok({ recebida: true, duplicado: true });
        st.denuncias.push({ id: novoId(), alvo: 'anuncio', anuncioId: an.id, empresaId: an.empresaId, cidade: an.cidade, autor: uid || null, contaNoLimite: !!uid,
          motivo: motivo, detalhe: detalhe, textoDenunciado: '', status: 'aberta', criadoEm: agora() });
        if (uid && an.status === 'publicado') {
          var autores = {};
          st.denuncias.forEach(function (x) { if (x.anuncioId === an.id && x.alvo === 'anuncio' && x.contaNoLimite && x.status === 'aberta') autores[x.autor] = true; });
          if (Object.keys(autores).length >= 3) {
            an.status = 'suspenso'; an.statusMotivo = 'Fora do ar por denúncias, aguardando a moderação.'; tocar(an);
            var sessao = st.sessao; st.sessao = null;
            registrar(an.cidade, 'sistema', 'suspender_por_denuncias', 'anuncio', an.id, '3 denúncias de contas diferentes.');
            st.sessao = sessao;
          }
        }
      } else if (d.alvo === 'mensagem') {
        if (!uid) return erro('Entre na sua conta para denunciar uma mensagem.', { sessaoExpirada: true });
        var m = st.mensagens.filter(function (x) { return x.id === id; })[0];
        if (!m) return erro('Mensagem não encontrada.');
        var v = st.conversas.filter(function (x) { return x.id === m.conversaId; })[0];
        var k = candidatura(v.candidaturaId);
        if (!((k.pessoaId === uid && m.autor === 'empresa') || (m.autor === 'pessoa' && membro(k.empresaId)))) return erro('Mensagem não encontrada.');
        if (st.denuncias.some(function (x) { return x.alvo === 'mensagem' && x.mensagemId === m.id && x.autor === uid; })) return ok({ recebida: true, duplicado: true });
        var an2 = anuncio(k.anuncioId);
        st.denuncias.push({ id: novoId(), alvo: 'mensagem', anuncioId: an2.id, mensagemId: m.id, empresaId: an2.empresaId, cidade: an2.cidade, autor: uid,
          contaNoLimite: true, motivo: motivo, detalhe: detalhe, textoDenunciado: m.texto.slice(0, 1000), autorMensagem: m.autor, autorMensagemUser: m.autorUser,
          status: 'aberta', criadoEm: agora() });
      } else if (d.alvo === 'referencia') {
        if (!uid) return erro('Entre na sua conta para denunciar uma referência.', { sessaoExpirada: true });
        var r = st.referencias.filter(function (x) { return x.id === id && x.status !== 'removida'; })[0];
        // Só a própria pessoa ou quem vê a referência; a empresa autora nunca (a resposta não pode denunciar a ocultação).
        if (!r || minhasEmpresasIds().indexOf(r.empresaId) >= 0 || !(r.pessoaId === uid || referenciaVisivel(r))) return erro('Referência não encontrada.');
        if (st.denuncias.some(function (x) { return x.alvo === 'referencia' && x.referenciaId === r.id && x.autor === uid; })) return ok({ recebida: true, duplicado: true });
        var er = empresa(r.empresaId);
        st.denuncias.push({ id: novoId(), alvo: 'referencia', referenciaId: r.id, empresaId: er.id, cidade: er.cidade, autor: uid, contaNoLimite: false,
          motivo: motivo, detalhe: detalhe, textoDenunciado: r.texto, status: 'aberta', criadoEm: agora() });
      } else {
        return erro('Denúncia inválida.');
      }
      return ok({ recebida: true });
    };

    H.vagas_eu = function () {
      var uid = st.sessao;
      if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var c = contaAtual(null);
      if (!c.ok) {
        if (c.semConta && eAdmin()) {
          return ok({ conta: null, admin: true, pessoa: null, empresas: [],
            operador: st.cidades.slice().sort(function (a, b) { return a.ordem - b.ordem; }).map(function (x) { return { cidade: x.slug, nome: x.nome, papel: 'admin' }; }) });
        }
        return c;
      }
      var ct = st.contas[uid];
      ct.ultimoAcessoEm = agora();
      var p = st.pessoas[uid];
      return ok({
        conta: { tipo: ct.tipo, status: ct.status, email: usuario(uid).email, termosVersao: ct.termosVersao || '', termosAceitosEm: iso(ct.termosAceitosEm), criadoEm: iso(ct.criadoEm) },
        admin: eAdmin(),
        pessoa: ct.tipo === 'pessoa' ? { completo: completo(uid), cidades: p ? [p.cidade].concat(p.cidade2 ? [p.cidade2] : []) : [],
          referenciasPendentes: st.referencias.filter(function (r) { return r.pessoaId === uid && r.status === 'pendente'; }).length } : null,
        empresas: st.membros.filter(function (m) { return m.userId === uid && m.ativo; }).map(function (m) {
          var e = empresa(m.empresaId); return { id: e.id, nomeFantasia: e.nomeFantasia, papel: m.papel, status: e.status };
        }).sort(function (a, b) { return a.nomeFantasia.localeCompare(b.nomeFantasia); }),
        operador: st.operadores.filter(function (o) { return o.userId === uid && o.ativo; }).map(function (o) { return { cidade: o.cidade, nome: cidade(o.cidade).nome, papel: o.papel }; })
      });
    };

    H.vagas_aceitar_termos = function (a) {
      var c = contaAtual(null);
      if (!c.ok) return c;
      var d = obj(a.p_dados);
      var v = txt(d.versao).trim();
      if (!/^[A-Za-z0-9._-]{1,40}$/.test(v)) return erro('Versão dos termos inválida.');
      var ct = st.contas[st.sessao];
      ct.termosVersao = v; ct.termosAceitosEm = agora();
      st.consentimentos.push({ userId: st.sessao, tipo: 'termos', versao: v, aceito: true, em: agora() });
      st.consentimentos.push({ userId: st.sessao, tipo: 'privacidade', versao: v, aceito: true, em: agora() });
      var p = st.pessoas[st.sessao];
      if (Object.prototype.hasOwnProperty.call(d, 'bancoTalentos') && ct.tipo === 'pessoa') {
        var ate = d.bancoTalentos === true ? agora() + 180 * DIA : null;
        st.consentimentos.push({ userId: st.sessao, tipo: 'banco_talentos', versao: v, aceito: d.bancoTalentos === true, ate: ate, em: agora() });
        if (p) p.bancoAte = ate;
      }
      return ok({ termosVersao: v, termosAceitosEm: iso(ct.termosAceitosEm), bancoTalentosAte: p ? iso(p.bancoAte) : '' });
    };

    H.vagas_pessoa_minha = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      return ok({ pessoa: pessoaJson(st.sessao), cartao: cartao(st.sessao), completo: completo(st.sessao) });
    };

    H.vagas_pessoa_salvar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var uid = st.sessao;
      var d = obj(a.p_dados);
      var c1 = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c1 || c1.status === 'rascunho') return erro('Escolha a sua cidade.');
      var c2 = null;
      if (txt(d.cidade2).trim()) {
        c2 = cidade(txt(d.cidade2).trim().toLowerCase());
        if (!c2 || c2.status === 'rascunho') return erro('Segunda cidade não encontrada.');
        if (c2.slug === c1.slug) return erro('Escolha duas cidades diferentes.');
      }
      if (!txt(d.zona).trim()) return erro('Escolha a zona onde você mora.');
      var z = zona(c1.slug, txt(d.zona).trim().toLowerCase());
      if (!z || !z.ativa) return erro('Escolha uma zona da sua cidade.');
      var l = R.lerPessoa(d, agora());
      if (!l.ok) return l;
      var antes = st.pessoas[uid];
      if ((!antes || antes.cidade !== c1.slug) && c1.status !== 'ativa') return erro(R.MSG.CIDADE_FECHADA);
      if (c2 && (!antes || antes.cidade2 !== c2.slug) && c2.status !== 'ativa') return erro('A segunda cidade ainda não está aberta. Escolha uma cidade ativa.');
      var f = l.campos;
      st.pessoas[uid] = { cidade: c1.slug, cidade2: c2 ? c2.slug : null, zona: z.slug, cargos: f.cargos, escolaridade: f.escolaridade, turnos: f.turnos,
        cnh: f.cnh, modalidades: f.modalidades, pretensaoCentavos: f.pretensaoCentavos, cursos: f.cursos, sobre: f.sobre,
        areas: f.areas ? f.areas : (antes && antes.areas ? antes.areas : []),
        bancoAte: antes ? antes.bancoAte : null, referenciasToken: antes ? antes.referenciasToken : null, criadoEm: antes ? antes.criadoEm : agora(), atualizadoEm: agora() };
      st.contatos[uid] = { nome: f.nome, whatsapp: f.whatsapp, email: f.email || R.normalizarEmail(usuario(uid).email) };
      st.experiencias = st.experiencias.filter(function (x) { return x.userId !== uid; });
      f.experiencias.forEach(function (x, i) { st.experiencias.push(Object.assign({ id: novoId(), userId: uid, ordem: i + 1 }, x, { fim: x.fim || null })); });
      return ok({ pessoa: pessoaJson(uid), cartao: cartao(uid), completo: true });
    };

    H.vagas_feed = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var p = st.pessoas[st.sessao];
      if (!p) return erro('Complete seu cadastro para ver as vagas.', { completar: true });
      var cids = [p.cidade].concat(p.cidade2 ? [p.cidade2] : []).filter(function (s) { var x = cidade(s); return x && x.status === 'ativa'; });
      return ok(listarAnuncios(cids, a.p_filtro, st.sessao, p.areas || []));
    };

    H.vagas_quero = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var uid = st.sessao;
      if (!completo(uid)) return erro('Complete seu cadastro antes de se candidatar.', { completar: true });
      var an = anuncio(a.p_anuncio);
      if (!an || !noAr(an)) return erro(R.MSG.VAGA_FORA);
      var k = st.candidaturas.filter(function (x) { return x.anuncioId === an.id && x.pessoaId === uid; })[0];
      if (k) {
        if (k.status !== 'retirada') return ok({ candidatura: candidaturaPessoa(k), duplicado: true });
        k.status = 'enviada'; k.pessoaDecidiuEm = null; tocar(k);
      } else {
        if (contar('quero', uid, DIA) > 30) return erro('Você já se candidatou a muitas vagas hoje. Tente de novo amanhã.', { bloqueado: true });
        k = { id: novoId(), anuncioId: an.id, pessoaId: uid, empresaId: an.empresaId, status: 'enviada', criadoEm: agora(), atualizadoEm: agora() };
        st.candidaturas.push(k);
      }
      st.pulos = st.pulos.filter(function (p) { return !(p.pessoaId === uid && p.anuncioId === an.id); });
      return ok({ candidatura: candidaturaPessoa(k) });
    };

    H.vagas_pular = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      if (!st.pessoas[st.sessao]) return erro('Complete seu cadastro para ver as vagas.', { completar: true });
      if (!anuncio(a.p_anuncio)) return erro(R.MSG.VAGA_FORA);
      if (!st.pulos.some(function (p) { return p.pessoaId === st.sessao && p.anuncioId === a.p_anuncio; })) st.pulos.push({ pessoaId: st.sessao, anuncioId: a.p_anuncio, em: agora() });
      return ok();
    };

    function minhaCandidatura(id) { var k = candidatura(id); return k && k.pessoaId === st.sessao ? k : null; }
    function avisarConversa(k, texto, status) {
      var v = conversaDe(k.id);
      if (!v) return;
      st.mensagens.push({ id: novoId(), conversaId: v.id, autor: 'sistema', autorUser: null, texto: texto, criadoEm: agora() });
      v.ultimaEm = agora();
      if (status) v.status = status;
    }

    H.vagas_retirar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status === 'combinou' || k.status === 'contratada') return erro('O contato já foi liberado. Avise a empresa pela conversa.');
      if (k.status !== 'retirada' && k.status !== 'recusada') {
        k.status = 'retirada'; k.pessoaDecidiuEm = agora(); tocar(k);
        avisarConversa(k, 'A pessoa retirou a candidatura.', 'encerrada');
      }
      return ok({ candidatura: candidaturaPessoa(k) });
    };

    H.vagas_minhas_candidaturas = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      return ok({ candidaturas: st.candidaturas.filter(function (k) { return k.pessoaId === st.sessao; })
        .sort(function (x, y) { return y.atualizadoEm - x.atualizadoEm; }).map(candidaturaPessoa) });
    };

    H.vagas_ver_empresa = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (['conversar', 'combinou', 'contratada'].indexOf(k.status) < 0) return erro('A empresa ainda não pediu para conversar.');
      if (k.empresaReveladaEm == null) { k.empresaReveladaEm = agora(); tocar(k); }
      var e = empresa(k.empresaId);
      return ok({ empresa: { nome: e.nomeFantasia, razaoSocial: e.razaoSocial, cnpjFormatado: R.formatarCnpj(e.cnpj), setor: e.setor, descricao: e.descricao,
        cidade: cidade(e.cidade).nome, conferidaEm: iso(e.cnpjConferidoEm) }, candidatura: candidaturaPessoa(k) });
    };

    H.vagas_combinar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      var an = anuncio(k.anuncioId);
      var e = empresa(k.empresaId);
      var dup = false;
      if (k.status === 'combinou' || k.status === 'contratada') {
        dup = k.contatoCortadoEm == null;
        if (!dup) { k.contatoCortadoEm = null; k.pessoaDecidiuEm = agora(); tocar(k); avisarConversa(k, 'A pessoa voltou a compartilhar o contato.', 'aberta'); }
      } else {
        if (k.status === 'enviada') return erro('A empresa ainda não pediu para conversar.');
        if (k.status !== 'conversar') return erro('Esta candidatura foi encerrada.');
        if (an.status === 'suspenso' || an.status === 'removido' || e.status !== 'ativa') return erro('Esta vaga está fora do ar.');
        if (an.confidencial && k.empresaReveladaEm == null) return erro('Veja primeiro qual é a empresa.', { verEmpresa: true });
        k.status = 'combinou'; k.combinouEm = agora(); k.pessoaDecidiuEm = agora(); k.empresaReveladaEm = k.empresaReveladaEm || agora(); tocar(k);
        if (!conversaDe(k.id)) st.conversas.push({ id: novoId(), candidaturaId: k.id, status: 'aberta', criadaEm: agora(), ultimaEm: agora(), empresaSeguidas: 0 });
        avisarConversa(k, 'Combinou! O contato foi liberado para os dois lados.', 'aberta');
      }
      return ok({ candidatura: candidaturaPessoa(k), empresa: { nome: e.nomeFantasia, whatsapp: e.whatsapp, email: e.email }, duplicado: dup });
    };

    H.vagas_recusar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status === 'combinou' || k.status === 'contratada') return erro('O contato já foi liberado. Avise a empresa pela conversa.');
      if (k.status !== 'retirada' && k.status !== 'recusada') {
        k.status = 'recusada'; k.pessoaDecidiuEm = agora(); tocar(k);
        avisarConversa(k, 'A pessoa preferiu não seguir com esta vaga.', 'encerrada');
      }
      return ok({ candidatura: candidaturaPessoa(k) });
    };

    H.vagas_quem_viu_meu_contato = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var grupos = {};
      st.acessos.filter(function (x) { return x.pessoaId === st.sessao; }).forEach(function (x) {
        var g = x.candidaturaId || ('sem-' + x.em);
        if (!grupos[g]) grupos[g] = { candidaturaId: x.candidaturaId || null, empresa: x.empresaNome, anuncio: x.anuncioTitulo, primeira: x.em, ultima: x.em, vezes: 0 };
        grupos[g].vezes += 1;
        grupos[g].primeira = Math.min(grupos[g].primeira, x.em);
        grupos[g].ultima = Math.max(grupos[g].ultima, x.em);
      });
      return ok({ acessos: Object.keys(grupos).map(function (g) { return grupos[g]; }).sort(function (x, y) { return y.ultima - x.ultima; })
        .map(function (g) {
          var k = g.candidaturaId ? minhaCandidatura(g.candidaturaId) : null;
          return { candidaturaId: g.candidaturaId, empresa: g.empresa, anuncio: g.anuncio, primeiraVez: iso(g.primeira), ultimaVez: iso(g.ultima), vezes: g.vezes,
            cortadoEm: iso(k ? k.contatoCortadoEm : null),
            podeCortar: !!k && (k.status === 'combinou' || k.status === 'contratada') && k.contatoCortadoEm == null };
        }) });
    };

    H.vagas_cortar_acesso = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status !== 'combinou' && k.status !== 'contratada') return erro('Seu contato não foi liberado para esta empresa.');
      var dup = k.contatoCortadoEm != null;
      if (!dup) {
        k.contatoCortadoEm = agora(); k.pessoaDecidiuEm = agora(); tocar(k);
        avisarConversa(k, 'A pessoa encerrou a conversa e deixou de compartilhar o contato.', 'encerrada');
      }
      return ok({ candidatura: candidaturaPessoa(k), duplicado: dup });
    };

    // ---- Empresa
    function inserirEmpresa(campos, cid, zonaSlug, status, criadaPor) {
      var e = { id: novoId(), cidade: cid, zona: zonaSlug || null, cnpj: campos.cnpj, mei: campos.mei, razaoSocial: campos.razaoSocial,
        nomeFantasia: campos.nomeFantasia, setor: campos.setor, descricao: campos.descricao, whatsapp: campos.whatsapp, email: campos.email,
        status: status, statusMotivo: '', cnpjConferidoEm: status === 'ativa' ? agora() : null, criadaPor: criadaPor, criadoEm: agora() };
      st.empresas.push(e);
      return e;
    }
    function lerEmpresaCompleta(d) {
      var l = R.lerEmpresa(d);
      if (!l.ok) return l;
      if (st.empresas.some(function (e) { return e.cnpj === l.campos.cnpj; })) return erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.');
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c || c.status === 'rascunho') return erro('Escolha a cidade da empresa.');
      if (c.status !== 'ativa') return erro(R.MSG.CIDADE_FECHADA);
      var z = null;
      if (txt(d.zona).trim()) { z = zona(c.slug, txt(d.zona).trim().toLowerCase()); if (!z) return erro('Escolha uma zona da cidade da empresa.'); }
      return { ok: true, campos: l.campos, cidade: c.slug, zona: z ? z.slug : null };
    }

    H.vagas_empresa_cadastrar = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      if (st.membros.filter(function (m) { return m.userId === st.sessao && m.papel === 'dono'; }).length >= 5) return erro('Esta conta já cadastrou o máximo de empresas. Fale com a Gestão sem Caos.');
      var l = lerEmpresaCompleta(obj(a.p_dados));
      if (!l.ok) return l;
      var e = inserirEmpresa(l.campos, l.cidade, l.zona, 'em_analise', st.sessao);
      st.membros.push({ empresaId: e.id, userId: st.sessao, papel: 'dono', ativo: true, criadoEm: agora() });
      return ok({ empresa: Object.assign(empresaJson(e), { papel: 'dono' }) });
    };

    H.vagas_empresa_salvar = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var e = empresa(a.p_empresa);
      if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
      if (!membro(e.id, true)) return erro('Só quem é dono(a) da conta da empresa pode alterar estes dados.');
      var d = obj(a.p_dados);
      var n = clone(e);
      var tem = function (k) { return Object.prototype.hasOwnProperty.call(d, k); };
      if (tem('nomeFantasia')) { var nf = R.limparTexto(d.nomeFantasia, 120); if (nf.length < 2) return erro('Informe o nome da empresa.'); n.nomeFantasia = nf; }
      if (tem('setor')) n.setor = R.limparTexto(d.setor, 80);
      if (tem('descricao')) { if (txt(d.descricao).length > 800) return erro('A descrição pode ter até 800 caracteres.'); n.descricao = R.limparMultilinha(d.descricao, 800); }
      if (tem('whatsapp')) {
        if (!txt(d.whatsapp).trim()) n.whatsapp = '';
        else { n.whatsapp = R.normalizarWhatsapp(d.whatsapp); if (!R.whatsappEmpresaValido(n.whatsapp)) return erro('WhatsApp da empresa inválido.'); }
      }
      if (tem('email')) { var em = txt(d.email).trim(); n.email = em ? R.normalizarEmail(em) : ''; if (em && !n.email) return erro('E-mail da empresa inválido.'); }
      if (tem('zona')) {
        if (!txt(d.zona).trim()) n.zona = null;
        else { var z = zona(e.cidade, txt(d.zona).trim().toLowerCase()); if (!z) return erro('Escolha uma zona da cidade da empresa.'); n.zona = z.slug; }
      }
      var conf = R.conferirTexto(n.nomeFantasia, 'cartao') || R.conferirTexto(n.setor, 'cartao') || R.conferirTexto(n.descricao, 'empresa');
      if (conf) return erro(conf.erro);
      ['nomeFantasia', 'setor', 'descricao', 'whatsapp', 'email', 'zona'].forEach(function (k) { e[k] = n[k]; });
      return ok({ empresa: empresaJson(e) });
    };

    H.vagas_minhas_empresas = function () {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      return ok({ empresas: st.membros.filter(function (m) { return m.userId === st.sessao && m.ativo; }).map(function (m) {
        var e = empresa(m.empresaId);
        var as = st.anuncios.filter(function (x) { return x.empresaId === e.id; });
        return Object.assign(empresaJson(e), { papel: m.papel,
          anuncios: { total: as.length, noAr: as.filter(noAr).length, rascunhos: as.filter(function (x) { return x.status === 'rascunho'; }).length,
            emRevisao: as.filter(function (x) { return x.status === 'em_revisao'; }).length },
          candidaturasNovas: st.candidaturas.filter(function (k) { return k.empresaId === e.id && k.status === 'enviada'; }).length });
      }).sort(function (x, y) { return x.nomeFantasia.localeCompare(y.nomeFantasia); }) });
    };

    // Grava a vaga (mesmas regras de vagas_anuncio_salvar / vagas_op_anuncio_salvar). -> {ok, an} | erro
    function gravarAnuncio(d, e, an) {
      var cid = an ? an.cidade : e.cidade;
      if (txt(d.cidade).trim()) {
        var cc = cidade(txt(d.cidade).trim().toLowerCase());
        if (!cc || cc.status === 'rascunho') return erro('Cidade não encontrada.');
        cid = cc.slug;
      }
      var cobj = cidade(cid);
      var h = hoje(cobj.fuso);
      var l = R.lerAnuncio(d, null);
      if (!l.ok) return l;
      var f = l.campos;
      if (f.inicio === 'data' && f.modalidade !== 'diaria' && f.inicioData < h) return erro('A data de início não pode estar no passado.');
      var z = null;
      if (txt(d.zona).trim()) { z = zona(cid, txt(d.zona).trim().toLowerCase()); if (!z) return erro('Escolha uma zona da cidade da vaga.'); }
      if ((!an || an.cidade !== cid) && cobj.status !== 'ativa') return erro(R.MSG.CIDADE_FECHADA);
      if (f.confidencial && !e.cnpjConferidoEm) return erro('Só empresa com CNPJ conferido pela Gestão sem Caos pode anunciar como confidencial.');
      if (f.modalidade === 'diaria' && (!an || !an.diaria || an.diaria.data !== f.diaria.data || an.modalidade !== 'diaria')) {
        if (f.diaria.data < h) return erro('A data da diária já passou. Escolha outra data.');
        if (f.diaria.data > R.somarDias(h, 7)) return erro('A diária precisa ser para os próximos 7 dias.');
      }
      if (!an && contar('anuncio_novo', e.id, DIA) > 30) return erro('Muitas vagas criadas hoje. Tente de novo amanhã.', { bloqueado: true });
      var campos = { cidade: cid, zona: z ? z.slug : null, area: f.area, funcao: f.funcao, titulo: f.funcao, modalidade: f.modalidade,
        descricao: f.descricao, turno: f.turno, fimDeSemana: f.fimDeSemana, comissao: f.comissao, inicio: f.inicio, inicioData: f.inicioData,
        experiencia: f.experiencia, escolaridade: f.escolaridade, requisitos: f.requisitos, requisitoOutro: f.requisitoOutro, selo: f.selo,
        beneficios: f.beneficios, horasDia: f.horasDia, prazoHoras: f.prazoHoras, quantidade: f.quantidade, valor: f.valor, diaria: f.diaria,
        diasNoAr: f.diasNoAr, confidencial: f.confidencial };
      if (!an) {
        an = Object.assign({ id: novoId(), codigo: novoCodigo(), empresaId: e.id, status: 'rascunho', statusMotivo: '', publicadoEm: null, expiraEm: null,
          encerradoEm: null, criadoPor: st.sessao, criadoEm: agora(), atualizadoEm: agora() }, campos);
        st.anuncios.push(an);
      } else {
        Object.assign(an, campos); tocar(an);
      }
      return { ok: true, an: an };
    }

    H.vagas_anuncio_salvar = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var d = obj(a.p_dados);
      var an = null;
      var e;
      if (txt(d.id).trim()) {
        an = anuncio(txt(d.id).trim());
        if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
        if (an.status === 'removido') return erro('Esta vaga foi removida pela moderação e não pode ser editada.');
        if (an.status === 'suspenso') return erro('Esta vaga está fora do ar, aguardando a moderação.');
        e = empresa(an.empresaId);
      } else {
        e = empresa(txt(d.empresaId).trim());
        if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
      }
      if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
      var g = gravarAnuncio(d, e, an);
      if (!g.ok) return g;
      return ok({ anuncio: anuncioEmpresa(g.an) });
    };

    // Vaga assistida pela operação da cidade (mesmos campos; publicar:true já publica, sem a revisão).
    H.vagas_op_anuncio_salvar = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var d = obj(a.p_dados);
      var an = null;
      var e;
      if (txt(d.id).trim()) {
        an = anuncio(txt(d.id).trim());
        if (!an) return erro('Vaga não encontrada.');
        e = empresa(an.empresaId);
      } else {
        e = empresa(txt(d.empresaId).trim());
        if (!e) return erro('Empresa não encontrada.');
      }
      var papel = papelCidade(e.cidade);
      if (!papel) return erro(an ? 'Vaga não encontrada.' : 'Empresa não encontrada.');
      if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      if (an && an.status === 'removido') return erro('Esta vaga foi removida pela moderação e não pode ser editada.');
      if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
      if (d.publicar === true && e.status !== 'ativa' && (!an || (an.status !== 'publicado' && an.status !== 'pausado'))) {
        return erro('Aprove a empresa antes de publicar a vaga.');
      }
      var g = gravarAnuncio(d, e, an);
      if (!g.ok) return g;
      an = g.an;
      if (d.publicar === true && an.status !== 'publicado' && an.status !== 'pausado') {
        an.status = 'publicado'; an.statusMotivo = ''; an.publicadoEm = an.publicadoEm || agora(); an.expiraEm = expiraCalculada(an); an.encerradoEm = null;
      }
      registrar(an.cidade, papel, 'anuncio_assistido', 'anuncio', an.id, '', { publicado: an.status === 'publicado' });
      return ok({ anuncio: anuncioEmpresa(an) });
    };

    H.vagas_areas_publicas = function () {
      return ok({ areas: R.AREAS.map(function (x) { return { slug: x.id, nome: x.rotulo }; }) });
    };

    H.vagas_anuncio_publicar = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var an = anuncio(a.p_anuncio);
      if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
      if (an.status === 'publicado') return ok({ anuncio: anuncioEmpresa(an), emRevisao: false, duplicado: true });
      if (an.status === 'em_revisao') return ok({ anuncio: anuncioEmpresa(an), emRevisao: true, duplicado: true });
      if (an.status === 'suspenso' || an.status === 'removido') return erro('Esta vaga está fora do ar pela moderação.');
      if (an.status !== 'rascunho') return erro('Esta vaga já foi publicada. Use "Retomar" ou "Renovar".');
      var e = empresa(an.empresaId);
      if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
      var cobj = cidade(an.cidade);
      if (cobj.status !== 'ativa') return erro(R.MSG.CIDADE_FECHADA);
      if (an.modalidade === 'diaria' && an.diaria.data < hoje(cobj.fuso)) return erro('A data da diária já passou. Escolha outra data.');
      var revisao = e.status !== 'ativa' || st.anuncios.filter(function (x) { return x.empresaId === e.id && x.publicadoEm != null; }).length < 3;
      if (revisao) { an.status = 'em_revisao'; an.statusMotivo = ''; }
      else { an.status = 'publicado'; an.statusMotivo = ''; an.publicadoEm = agora(); an.expiraEm = expiraCalculada(an); }
      tocar(an);
      return ok({ anuncio: anuncioEmpresa(an), emRevisao: revisao });
    };

    H.vagas_anuncio_acao = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var an = anuncio(a.p_anuncio);
      if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
      var e = empresa(an.empresaId);
      if (an.status === 'suspenso' || an.status === 'removido') return erro('Esta vaga está fora do ar pela moderação.');
      var acao = a.p_acao;
      if (acao === 'pausar') {
        if (an.status !== 'publicado') return erro('Só dá para pausar uma vaga que está no ar.');
        an.status = 'pausado';
      } else if (acao === 'retomar') {
        if (an.status !== 'pausado') return erro('Só dá para retomar uma vaga pausada.');
        if (an.expiraEm <= agora()) return erro('O prazo desta vaga acabou. Use "Renovar".');
        if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
        an.status = 'publicado';
      } else if (acao === 'encerrar') {
        if (an.status !== 'encerrado') { an.status = 'encerrado'; an.encerradoEm = agora(); }
      } else if (acao === 'renovar') {
        if (an.modalidade === 'diaria') return erro('Para outra data, crie uma diária nova.');
        if (['publicado', 'pausado', 'encerrado'].indexOf(an.status) < 0) return erro('Só dá para renovar uma vaga que já foi publicada.');
        if (e.status !== 'ativa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
        an.status = 'publicado'; an.encerradoEm = null; an.expiraEm = expiraCalculada(an);
      } else return erro('Ação inválida.');
      tocar(an);
      return ok({ anuncio: anuncioEmpresa(an) });
    };

    H.vagas_anuncios_empresa = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      if (!membro(a.p_empresa)) return erro('Empresa não encontrada.');
      return ok({ anuncios: st.anuncios.filter(function (x) { return x.empresaId === a.p_empresa; }).sort(function (x, y) { return y.criadoEm - x.criadoEm; }).map(anuncioEmpresa) });
    };

    H.vagas_anuncio_numeros = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var an = anuncio(a.p_anuncio);
      if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
      var ks = st.candidaturas.filter(function (k) { return k.anuncioId === an.id; });
      var vivas = ks.filter(function (k) { return k.status !== 'retirada'; });
      var vistas = 0;
      Object.keys(st.vistas || {}).forEach(function (ch) { if (ch.indexOf(an.id + '|') === 0) vistas += st.vistas[ch]; });
      return ok({ anuncio: { id: an.id, codigo: an.codigo, titulo: an.titulo, status: an.status, publicadoEm: iso(an.publicadoEm) },
        numeros: { vistas: vistas, quero: vivas.length, comSelo: vivas.filter(function (k) { return selos(k.pessoaId).length > 0; }).length,
          conversas: ks.filter(function (k) { return !!conversaDe(k.id); }).length,
          combinou: ks.filter(function (k) { return k.status === 'combinou' || k.status === 'contratada'; }).length,
          contratadas: ks.filter(function (k) { return k.status === 'contratada'; }).length } });
    };

    H.vagas_cartoes = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var an = anuncio(a.p_anuncio);
      if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
      var f = obj(a.p_filtro);
      var status = R.listaEnum(f.status, ['enviada', 'conversar', 'agora_nao', 'combinou', 'contratada', 'recusada']);
      var zonas = R.listaTexto(typeof f.zona === 'string' ? [f.zona] : f.zona, 60);
      var escIds = R.ESCOLARIDADES.map(function (x) { return x.id; });
      var esc = escIds.indexOf(txt(f.escolaridadeMin));
      var exp = R.inteiro(f.experienciaMinMeses);
      var turnos = R.listaEnum(f.turnos, R.TURNOS);
      var cnh = R.listaEnum(f.cnh, R.CNH);
      var pret = R.inteiro(f.pretensaoMaxCentavos);
      var lista = st.candidaturas.filter(function (k) {
        var p = st.pessoas[k.pessoaId];
        if (k.anuncioId !== an.id || k.status === 'retirada' || !p) return false;
        if (status.length && status.indexOf(k.status) < 0) return false;
        if (zonas.length && zonas.indexOf(p.zona) < 0) return false;
        if (esc >= 0 && escIds.indexOf(p.escolaridade) < esc) return false;
        if (exp != null && cartao(k.pessoaId).experienciaTotalMeses < exp) return false;
        if (turnos.length && !turnos.some(function (t) { return p.turnos.indexOf(t) >= 0; })) return false;
        if (cnh.length && !cnh.every(function (t) { return p.cnh.indexOf(t) >= 0; })) return false;
        if (pret != null && p.pretensaoCentavos != null && p.pretensaoCentavos > pret) return false;
        return true;   // sem filtro por selo, nota ou referência (veto P3): "temSelo" é ignorado
      }).sort(function (x, y) { return x.criadoEm - y.criadoEm || (x.id < y.id ? -1 : 1); }).map(function (k) {
        var v = conversaDe(k.id);
        return { candidaturaId: k.id, status: k.status, chegouEm: iso(k.criadoEm), contatoCortado: k.contatoCortadoEm != null, cartao: cartao(k.pessoaId, k.empresaId),
          conversa: v ? { status: v.status, naoLidas: naoLidas(v, 'empresa'), ultimaEm: iso(v.ultimaEm) } : null };
      });
      return ok({ anuncio: { id: an.id, codigo: an.codigo, titulo: an.titulo, status: an.status }, cartoes: lista, total: lista.length });
    };

    function candidaturaDaEmpresa(id) { var k = candidatura(id); return k && membro(k.empresaId) ? k : null; }

    H.vagas_empresa_decidir = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var k = candidaturaDaEmpresa(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (a.p_decisao !== 'conversar' && a.p_decisao !== 'agora_nao') return erro('Decisão inválida.');
      if (k.status === 'combinou' || k.status === 'contratada') return erro('O Combinou já aconteceu: a decisão não muda mais.');
      if (k.status === 'retirada' || k.status === 'recusada') return erro('A pessoa encerrou esta candidatura.');
      if (k.status !== a.p_decisao) {
        k.status = a.p_decisao; k.empresaDecidiuEm = agora(); tocar(k);
        if (a.p_decisao === 'agora_nao') avisarConversa(k, 'A empresa seguiu com outras pessoas nesta vaga.', 'encerrada');
        else { var v = conversaDe(k.id); if (v) v.status = 'aberta'; }
      }
      return ok({ candidaturaId: k.id, status: k.status });
    };

    H.vagas_contato_pessoa = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var k = candidaturaDaEmpresa(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status !== 'combinou' && k.status !== 'contratada') return erro('O contato só aparece depois do Combinou.', { semCombinou: true });
      if (k.contatoCortadoEm != null) return erro('A pessoa deixou de compartilhar o contato com a sua empresa.', { contatoCortado: true });
      var e = empresa(k.empresaId);
      if (e.status !== 'ativa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', { suspensa: true });
      if (contar('contato_empresa', k.empresaId, DIA) > 300) return erro('Muitas consultas de contato hoje. Tente de novo amanhã.', { bloqueado: true });
      var an = anuncio(k.anuncioId);
      var ct = st.contatos[k.pessoaId];
      st.acessos.push({ candidaturaId: k.id, pessoaId: k.pessoaId, empresaId: e.id, empresaNome: e.nomeFantasia, anuncioTitulo: an.titulo, userId: st.sessao, em: agora() });
      return ok({ pessoa: { nome: ct.nome, whatsapp: ct.whatsapp, email: ct.email, sobre: st.pessoas[k.pessoaId].sobre, temFoto: temFoto(k.pessoaId),
        cartao: cartao(k.pessoaId, k.empresaId),
        referencias: st.referencias.filter(function (r) { return r.pessoaId === k.pessoaId && referenciaParaEmpresa(r, [k.empresaId]); })
          .sort(function (x, y) { return (y.fim || '9999-99').localeCompare(x.fim || '9999-99') || y.inicio.localeCompare(x.inicio); })
          .map(function (r) { return referenciaJson(r, false); }),
        experiencias: experiencias(k.pessoaId).map(function (x) { return { funcao: x.funcao, empregador: x.empregador, inicio: x.inicio, fim: x.fim || '', informal: x.informal }; }) } });
    };

    H.vagas_marcar_contratada = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var k = candidaturaDaEmpresa(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status === 'combinou') { k.status = 'contratada'; k.contratadaEm = agora(); tocar(k); }
      else if (k.status !== 'contratada') return erro('Só dá para marcar como contratada depois do Combinou.');
      return ok({ candidaturaId: k.id, status: k.status });
    };

    // ---- Conversa
    function lado(k) { if (!k) return null; if (k.pessoaId === st.sessao) return 'pessoa'; if (membro(k.empresaId)) return 'empresa'; return null; }

    H.vagas_conversa = function (a) {
      var c = contaAtual(null);
      if (!c.ok) return c;
      var k = candidatura(a.p_candidatura);
      var l = lado(k);
      if (!l) return erro('Conversa não encontrada.');
      var an = anuncio(k.anuncioId);
      var v = conversaDe(k.id);
      if (v) { if (l === 'pessoa') v.lidaPessoaEm = agora(); else v.lidaEmpresaEm = agora(); }
      var pode = l === 'empresa' ? ['enviada', 'conversar', 'combinou', 'contratada'].indexOf(k.status) >= 0 && an.status !== 'suspenso' && an.status !== 'removido'
          && k.contatoCortadoEm == null && empresa(k.empresaId).status === 'ativa'
        : !!v && v.status === 'aberta' && ['conversar', 'combinou', 'contratada'].indexOf(k.status) >= 0;
      return ok({ candidaturaId: k.id, status: k.status, lado: l, anuncio: { titulo: an.titulo, codigo: an.codigo },
        conversa: v ? { id: v.id, status: v.status } : null, podeEscrever: pode, contatoCortado: k.contatoCortadoEm != null,
        outroLado: l === 'empresa' ? 'Pessoa candidata' : (revelada(k) ? empresa(k.empresaId).nomeFantasia : 'Empresa confidencial'),
        mensagens: v ? st.mensagens.filter(function (m) { return m.conversaId === v.id; }).sort(function (x, y) { return x.criadoEm - y.criadoEm || (x.id < y.id ? -1 : 1); })
          .map(function (m) { return { id: m.id, autor: m.autor, texto: m.texto, em: iso(m.criadoEm), minha: m.autor === l }; }) : [] });
    };

    H.vagas_mensagem_enviar = function (a) {
      var c = contaAtual(null);
      if (!c.ok) return c;
      var k = candidatura(a.p_candidatura);
      var l = lado(k);
      if (!l) return erro('Conversa não encontrada.');
      if (a.p_id) {
        var ja = st.mensagens.filter(function (m) { return m.id === a.p_id; })[0];
        if (ja) {
          if (ja.autorUser !== st.sessao) return erro('Identificador da mensagem inválido.');
          return ok({ mensagem: { id: ja.id, autor: ja.autor, texto: ja.texto, em: iso(ja.criadoEm), minha: true }, duplicado: true });
        }
      }
      var texto = R.limparMultilinha(a.p_texto, 2000);
      if (!texto) return erro('Escreva a mensagem.');
      if (texto.length > 1000) return erro('A mensagem pode ter até 1.000 caracteres.');
      var t = R.conferirTexto(texto, 'mensagem');
      if (t) return erro(t.erro, { bloqueada: true, tipo: t.tipo });
      var an = anuncio(k.anuncioId);
      var e = empresa(k.empresaId);
      var v = conversaDe(k.id);
      if (l === 'empresa') {
        if (k.status === 'retirada' || k.status === 'recusada') return erro('A pessoa encerrou esta candidatura.');
        if (k.contatoCortadoEm != null) return erro('A pessoa encerrou a conversa e deixou de compartilhar o contato com a sua empresa.', { contatoCortado: true });
        if (k.status === 'agora_nao') return erro('Você marcou "Agora não" para esta pessoa. Mude para "Quero conversar" para escrever.');
        if (an.status === 'suspenso' || an.status === 'removido' || e.status !== 'ativa') return erro('Esta vaga está fora do ar.');
        if (v && v.empresaSeguidas >= 3) return erro('Espere a pessoa responder antes de mandar outra mensagem.', { aguardar: true });
        if (contar('msg_empresa', k.empresaId, DIA) > 300) return erro('Muitas mensagens hoje. Tente de novo amanhã.', { bloqueado: true });
        if (!v) { v = { id: novoId(), candidaturaId: k.id, status: 'aberta', criadaPor: st.sessao, criadaEm: agora(), ultimaEm: agora(), empresaSeguidas: 0 }; st.conversas.push(v); }
        if (k.status === 'enviada') { k.status = 'conversar'; k.empresaDecidiuEm = agora(); tocar(k); }
      } else {
        if (!v) return erro('A empresa ainda não abriu uma conversa.');
        if (v.status !== 'aberta' || ['conversar', 'combinou', 'contratada'].indexOf(k.status) < 0) return erro('Esta conversa foi encerrada.');
        if (contar('msg_pessoa', st.sessao, DIA) > 100) return erro('Muitas mensagens hoje. Tente de novo amanhã.', { bloqueado: true });
      }
      var m = { id: a.p_id || novoId(), conversaId: v.id, autor: l, autorUser: st.sessao, texto: texto, criadoEm: agora() };
      st.mensagens.push(m);
      v.ultimaEm = agora();
      if (l === 'empresa') { v.empresaSeguidas += 1; v.lidaEmpresaEm = agora(); v.status = 'aberta'; } else { v.empresaSeguidas = 0; v.lidaPessoaEm = agora(); }
      return ok({ mensagem: { id: m.id, autor: m.autor, texto: m.texto, em: iso(m.criadoEm), minha: true } });
    };

    function ultimaMensagem(v) {
      var ms = st.mensagens.filter(function (m) { return m.conversaId === v.id; }).sort(function (x, y) { return y.criadoEm - x.criadoEm || (x.id < y.id ? 1 : -1); });
      return ms.length ? ms[0].texto.slice(0, 120) : '';
    }
    H.vagas_conversas_minhas = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      return ok({ conversas: st.conversas.filter(function (v) { var k = candidatura(v.candidaturaId); return k && k.pessoaId === st.sessao; })
        .sort(function (x, y) { return y.ultimaEm - x.ultimaEm; }).map(function (v) {
          var k = candidatura(v.candidaturaId); var an = anuncio(k.anuncioId);
          return { candidaturaId: k.id, status: k.status, conversaStatus: v.status, anuncio: { titulo: an.titulo, codigo: an.codigo },
            empresa: revelada(k) ? empresa(k.empresaId).nomeFantasia : 'Empresa confidencial', naoLidas: naoLidas(v, 'pessoa'), ultimaEm: iso(v.ultimaEm), ultima: ultimaMensagem(v) };
        }) });
    };
    H.vagas_conversas_empresa = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      if (!membro(a.p_empresa)) return erro('Empresa não encontrada.');
      return ok({ conversas: st.conversas.filter(function (v) { var k = candidatura(v.candidaturaId); return k && k.empresaId === a.p_empresa; })
        .sort(function (x, y) { return y.ultimaEm - x.ultimaEm; }).map(function (v) {
          var k = candidatura(v.candidaturaId); var an = anuncio(k.anuncioId);
          return { candidaturaId: k.id, status: k.status, conversaStatus: v.status, anuncio: { id: an.id, titulo: an.titulo, codigo: an.codigo },
            naoLidas: naoLidas(v, 'empresa'), ultimaEm: iso(v.ultimaEm), ultima: ultimaMensagem(v) };
        }) });
    };

    // ---- Referência profissional
    function historico(refId, acao, por) { st.referenciaHistorico.push({ referenciaId: refId, acao: acao, por: por, em: agora() }); }

    H.vagas_referencia_oferecer = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var d = obj(a.p_dados);
      var e = empresa(txt(d.empresaId).trim());
      if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
      if (e.status !== 'ativa' || !e.cnpjConferidoEm) return erro('Só empresa verificada pela Gestão sem Caos pode dar referência.');
      var pessoaId = null, origem, neutro = false, cv = null;
      var tok = txt(d.conviteToken).trim().toLowerCase();
      if (tok) {
        cv = st.convitesReferencia.filter(function (x) { return x.token === tok; })[0];
        if (!cv || cv.status !== 'aberto' || cv.expiraEm <= agora() || (cv.empresaId && cv.empresaId !== e.id)) return erro('Convite inválido ou vencido. Peça um link novo à pessoa.');
        pessoaId = cv.pessoaId; origem = 'convite';
      } else if (txt(d.candidaturaId).trim()) {
        var k = candidatura(txt(d.candidaturaId).trim());
        if (!k || k.empresaId !== e.id || (k.status !== 'combinou' && k.status !== 'contratada') || k.contatoCortadoEm != null) return erro('Candidatura não encontrada.');
        pessoaId = k.pessoaId; origem = 'candidatura';
      } else if (txt(d.email).trim()) {
        var em = R.normalizarEmail(d.email);
        if (!em) return erro('E-mail inválido.');
        if (contar('referencia_email', e.id, DIA) > 30) return erro('Muitos envios por e-mail hoje. Tente de novo amanhã.', { bloqueado: true });
        var u = usuarioPorEmail(em);
        if (u && st.contas[u.id] && st.contas[u.id].tipo === 'pessoa' && st.contas[u.id].status !== 'suspensa') pessoaId = u.id;
        origem = 'email'; neutro = true;
      } else return erro('Informe para quem é a referência.');
      var l = R.lerReferencia(d, agora());
      if (!l.ok) return l;
      // Limite decidido ANTES de saber se o e-mail tem conta: mesma resposta com ou sem conta, inclusive no limite.
      var noLimite = referenciasNoMes(e.id) >= 20;
      if (neutro && noLimite) return ok({ enviada: true });
      if (!pessoaId) return ok({ enviada: true });
      var r = st.referencias.filter(function (x) { return x.empresaId === e.id && x.pessoaId === pessoaId; })[0];
      if (r && r.status !== 'pendente' && origem !== 'convite') {
        if (neutro) return ok({ enviada: true });
        return erro('Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de pedido de referência.');
      }
      if (!r && noLimite) return erro('Sua empresa chegou ao limite de 20 referências em 30 dias.', { bloqueado: true });
      var f = l.campos;
      var campos = { autor: st.sessao, funcao: f.funcao, vinculo: f.vinculo, inicio: f.inicio, fim: f.fim || null, pontosFortes: f.pontosFortes,
        recomendaPara: f.recomendaPara, texto: f.texto, textoStatus: f.texto ? 'pendente' : 'sem_texto', textoMotivo: '', status: 'pendente', respondidaEm: null,
        aceitaEm: null, removidaPor: null, atualizadoEm: agora() };
      if (!r) {
        r = Object.assign({ id: novoId(), empresaId: e.id, pessoaId: pessoaId, convite: cv ? cv.id : null, origem: origem, criadoEm: agora() }, campos);
        st.referencias.push(r);
      } else {
        Object.assign(r, campos);
        if (origem !== 'email') r.origem = origem;
      }
      historico(r.id, 'oferecida', 'empresa');
      if (cv) { cv.status = 'usado'; cv.usadoEm = agora(); cv.referenciaId = r.id; }
      if (neutro) return ok({ enviada: true });
      return ok({ referencia: Object.assign(referenciaJson(r, true), { status: r.status }) });
    };

    H.vagas_referencia_pedir = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var d = obj(a.p_dados);
      var cnpj = R.normalizarCnpj(d.cnpj);
      var nome = R.limparTexto(d.empresaNome, 120);
      var e = null;
      if (cnpj) {
        if (!R.cnpjValido(cnpj)) return erro('CNPJ inválido. Confira os números.');
        e = st.empresas.filter(function (x) { return x.cnpj === cnpj && x.status === 'ativa'; })[0] || null;
        if (e) nome = e.nomeFantasia;
      }
      if (nome.length < 2) return erro('Informe o nome da empresa.');
      var t = R.conferirTexto(nome, 'cartao');
      if (t) return erro(t.erro);
      if (contar('referencia_pedir', st.sessao, DIA) > 10) return erro('Muitos pedidos hoje. Tente de novo amanhã.', { bloqueado: true });
      if (st.convitesReferencia.filter(function (x) { return x.pessoaId === st.sessao && x.status === 'aberto' && x.expiraEm > agora(); }).length >= 20) {
        return erro('Você já tem 20 pedidos de referência abertos. Cancele algum antes de pedir outro.');
      }
      var cv = { id: novoId(), pessoaId: st.sessao, empresaId: e ? e.id : null, empresaNome: nome, token: novoToken(), status: 'aberto', expiraEm: agora() + 30 * DIA, criadoEm: agora() };
      st.convitesReferencia.push(cv);
      return ok({ convite: { id: cv.id, token: cv.token, caminho: '/referencia.html?t=' + cv.token, expiraEm: iso(cv.expiraEm), empresaNome: cv.empresaNome, empresaNaPlataforma: !!cv.empresaId } });
    };

    H.vagas_referencia_convite = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var cv = st.convitesReferencia.filter(function (x) { return x.token === txt(a.p_token).trim().toLowerCase(); })[0];
      if (!cv || cv.status !== 'aberto' || cv.expiraEm <= agora() || (cv.empresaId && !membro(cv.empresaId))) return erro('Convite inválido ou vencido. Peça um link novo à pessoa.');
      var ct = st.contatos[cv.pessoaId];
      var u = usuario(cv.pessoaId);
      return ok({ convite: { pessoa: { nome: (ct && ct.nome) || (u.meta && u.meta.nome) || '' }, empresaNome: cv.empresaNome, empresaId: cv.empresaId,
        expiraEm: iso(cv.expiraEm), status: cv.status } });
    };

    H.vagas_referencia_responder = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var r = st.referencias.filter(function (x) { return x.id === a.p_referencia && x.pessoaId === st.sessao; })[0];
      if (!r) return erro('Referência não encontrada.');
      var mapa = { aceitar: ['pendente', 'aceita'], recusar: ['pendente', 'recusada'], ocultar: ['aceita', 'ocultada'], mostrar: ['ocultada', 'aceita'] };
      var novo = null;
      if (mapa[a.p_acao] && r.status === mapa[a.p_acao][0]) novo = mapa[a.p_acao][1];
      if (a.p_acao === 'remover' && r.status !== 'removida') novo = 'removida';
      if (!novo) return erro('Ação inválida para esta referência.');
      // Veto P2: ocultar/remover não avisam a empresa nem mudam o que ela vê (referenciaStatusEmpresa).
      r.status = novo; r.respondidaEm = agora(); r.atualizadoEm = agora();
      if (a.p_acao === 'aceitar') r.aceitaEm = agora();
      if (novo === 'removida') r.removidaPor = 'pessoa';
      historico(r.id, { aceitar: 'aceita', recusar: 'recusada', ocultar: 'ocultada', mostrar: 'mostrada', remover: 'removida' }[a.p_acao], 'pessoa');
      return ok({ referencia: Object.assign(referenciaJson(r, true), { status: r.status }) });
    };

    H.vagas_referencias_minhas = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      st.convitesReferencia.forEach(function (x) { if (x.pessoaId === st.sessao && x.status === 'aberto' && x.expiraEm <= agora()) x.status = 'expirado'; });
      var p = st.pessoas[st.sessao];
      return ok({
        referencias: st.referencias.filter(function (r) { return r.pessoaId === st.sessao && r.status !== 'removida'; })
          .sort(function (x, y) { return (y.status === 'pendente') - (x.status === 'pendente') || y.criadoEm - x.criadoEm; })
          .map(function (r) { return Object.assign(referenciaJson(r, true), { status: r.status, textoMotivo: r.textoMotivo, visivel: referenciaVisivel(r) }); }),
        convites: st.convitesReferencia.filter(function (x) { return x.pessoaId === st.sessao && (x.status === 'aberto' || x.status === 'usado'); })
          .sort(function (x, y) { return y.criadoEm - x.criadoEm; })
          .map(function (x) { return { id: x.id, empresaNome: x.empresaNome, status: x.status, caminho: x.status === 'aberto' ? '/referencia.html?t=' + x.token : '',
            expiraEm: iso(x.expiraEm), criadoEm: iso(x.criadoEm) }; }),
        caminhoPublico: p && p.referenciasToken ? '/referencias.html?t=' + p.referenciasToken : '' });
    };

    H.vagas_referencias_empresa = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      if (!membro(a.p_empresa)) return erro('Empresa não encontrada.');
      return ok({ referencias: st.referencias.filter(function (r) { return r.empresaId === a.p_empresa && (r.origem !== 'email' || referenciaStatusEmpresa(r) === 'aceita'); })
        .sort(function (x, y) { return y.criadoEm - x.criadoEm; })
        .map(function (r) { return Object.assign(referenciaJson(r, true), { status: referenciaStatusEmpresa(r), textoMotivo: r.textoMotivo, origem: r.origem, aceitaEm: iso(r.aceitaEm) }); }),
        restantes30Dias: Math.max(0, 20 - referenciasNoMes(a.p_empresa)) });
    };
    // Referências que contam no limite de 20 em 30 dias: só as que a empresa consegue ver (nunca a pendente por e-mail).
    function referenciasNoMes(empId) {
      return st.referencias.filter(function (r) {
        return r.empresaId === empId && r.criadoEm > agora() - 30 * DIA && (r.origem !== 'email' || referenciaStatusEmpresa(r) === 'aceita');
      }).length;
    }

    H.vagas_referencias_publicar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var p = st.pessoas[st.sessao];
      if (!p) return erro('Complete seu cadastro antes de publicar suas referências.', { completar: true });
      if (a.p_ligar === true) { if (!p.referenciasToken) p.referenciasToken = novoToken(); } else p.referenciasToken = null;
      return ok({ caminho: p.referenciasToken ? '/referencias.html?t=' + p.referenciasToken : '' });
    };

    H.vagas_referencias_publicas = function (a) {
      var tok = txt(a.p_token);
      if (!/^[0-9a-f]{64}$/.test(tok)) return erro('Página não encontrada.');
      var uid = Object.keys(st.pessoas).filter(function (k) { return st.pessoas[k].referenciasToken === tok; })[0];
      if (!uid || !contaValida(uid)) return erro('Página não encontrada.');
      return ok({ pessoa: { nomeExibicao: R.nomeExibicao((st.contatos[uid] || {}).nome) },
        referencias: st.referencias.filter(function (r) { return r.pessoaId === uid && referenciaParaEmpresa(r, st.sessao ? minhasEmpresasIds() : []); })
          .sort(function (x, y) { return (y.fim || '9999') > (x.fim || '9999') ? 1 : -1; }).map(function (r) { return referenciaJson(r, false); }) });
    };

    // ---- Operação e equipe
    function exigirOperacao() {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      if (!cidadesOperadas().length) return erro(R.MSG.SEM_PERMISSAO);
      return null;
    }

    H.vagas_op_resumo = function () {
      var x = exigirOperacao(); if (x) return x;
      var cids = cidadesOperadas();
      return ok({ cidades: st.cidades.filter(function (c) { return cids.indexOf(c.slug) >= 0; }).sort(function (a, b) { return a.ordem - b.ordem; }).map(function (c) {
        var es = st.empresas.filter(function (e) { return e.cidade === c.slug; });
        var as = st.anuncios.filter(function (a) { return a.cidade === c.slug; });
        return { id: c.id, slug: c.slug, nome: c.nome, status: c.status, papel: papelCidade(c.slug), contagens: {
          empresasEmAnalise: es.filter(function (e) { return e.status === 'em_analise'; }).length, empresasAtivas: es.filter(function (e) { return e.status === 'ativa'; }).length,
          anunciosEmRevisao: as.filter(function (a) { return a.status === 'em_revisao'; }).length, anunciosSuspensos: as.filter(function (a) { return a.status === 'suspenso'; }).length,
          anunciosNoAr: as.filter(noAr).length, denunciasAbertas: st.denuncias.filter(function (d) { return d.cidade === c.slug && d.status === 'aberta'; }).length,
          pessoas: Object.keys(st.pessoas).filter(function (k) { return st.pessoas[k].cidade === c.slug || st.pessoas[k].cidade2 === c.slug; }).length,
          listaEspera: st.listaEspera.filter(function (l) { return l.cidade === c.slug; }).length } };
      }) });
    };

    H.vagas_op_empresas = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var status = R.listaEnum(f.status, ['em_analise', 'ativa', 'suspensa']);
      var busca = R.normalizar(txt(f.busca)).slice(0, 60);
      return ok({ empresas: st.empresas.filter(function (e) {
        return cids.indexOf(e.cidade) >= 0 && (!status.length || status.indexOf(e.status) >= 0) &&
          (!busca || R.normalizar(e.nomeFantasia + ' ' + e.razaoSocial + ' ' + e.cnpj).indexOf(busca) >= 0);
      }).sort(function (p, q) { return (q.status === 'em_analise') - (p.status === 'em_analise') || q.criadoEm - p.criadoEm; }).map(function (e) {
        var as = st.anuncios.filter(function (a2) { return a2.empresaId === e.id; });
        return Object.assign(empresaJson(e), { anuncios: { total: as.length, noAr: as.filter(noAr).length },
          denunciasAbertas: st.denuncias.filter(function (d) { return d.empresaId === e.id && d.status === 'aberta'; }).length,
          membros: st.membros.filter(function (m) { return m.empresaId === e.id && m.ativo; }).length });
      }) });
    };

    H.vagas_op_empresa_decidir = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var e = empresa(a.p_empresa);
      if (!e) return erro('Empresa não encontrada.');
      var papel = papelCidade(e.cidade);
      if (!papel) return erro('Empresa não encontrada.');
      var motivo = R.limparTexto(a.p_motivo, 300);
      if (a.p_acao === 'aprovar') {
        if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
        if (e.status === 'suspensa') return erro('Empresa suspensa: use "Reativar".');
        if (e.status !== 'ativa') { e.status = 'ativa'; e.statusMotivo = ''; e.cnpjConferidoEm = e.cnpjConferidoEm || agora(); }
      } else if (a.p_acao === 'suspender') {
        if (!motivo) return erro('Informe o motivo.');
        e.status = 'suspensa'; e.statusMotivo = motivo;
      } else if (a.p_acao === 'recusar') {
        if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
        if (!motivo) return erro('Informe o motivo.');
        if (e.status !== 'em_analise') return erro('Só dá para recusar uma empresa em análise.');
        e.statusMotivo = motivo;
      } else if (a.p_acao === 'reativar') {
        if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
        if (e.status !== 'suspensa') return erro('Esta empresa não está suspensa.');
        e.status = 'ativa'; e.statusMotivo = ''; e.cnpjConferidoEm = e.cnpjConferidoEm || agora();
      } else return erro('Ação inválida.');
      registrar(e.cidade, papel, 'empresa_' + a.p_acao, 'empresa', e.id, motivo);
      return ok({ empresa: empresaJson(e) });
    };

    H.vagas_op_empresa_cadastrar = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var l = lerEmpresaCompleta(obj(a.p_dados));
      if (!l.ok) return l;
      var papel = papelCidade(l.cidade);
      if (!papel || papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      var e = inserirEmpresa(l.campos, l.cidade, l.zona, 'ativa', st.sessao);
      registrar(e.cidade, papel, 'empresa_cadastrar', 'empresa', e.id, '');
      return ok({ empresa: empresaJson(e) });
    };

    H.vagas_op_vincular_membro = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var e = empresa(a.p_empresa);
      if (!e) return erro('Empresa não encontrada.');
      var papel = papelCidade(e.cidade);
      if (!papel) return erro('Empresa não encontrada.');
      if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      var u = usuarioPorEmail(R.normalizarEmail(a.p_email));
      if (!u || !st.contas[u.id] || st.contas[u.id].tipo !== 'empresa') {
        return erro('Não há conta de empresa com este e-mail. Peça para a empresa criar a conta (ou faça o cadastro assistido).');
      }
      if (st.membros.some(function (x) { return x.empresaId === e.id && x.ativo && x.userId !== u.id; })) {
        return erro('Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.');
      }
      var m = st.membros.filter(function (x) { return x.empresaId === e.id && x.userId === u.id; })[0];
      if (m) m.ativo = true;
      else {
        m = { empresaId: e.id, userId: u.id, papel: st.membros.some(function (x) { return x.empresaId === e.id && x.papel === 'dono' && x.ativo; }) ? 'recrutador' : 'dono', ativo: true, criadoEm: agora() };
        st.membros.push(m);
      }
      registrar(e.cidade, papel, 'empresa_vincular_membro', 'empresa', e.id, '', { papel: m.papel });
      return ok({ membro: { papel: m.papel } });
    };

    H.vagas_op_anuncios = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var status = R.listaEnum(f.status, ['rascunho', 'em_revisao', 'publicado', 'pausado', 'encerrado', 'suspenso', 'removido']);
      if (!status.length) status = ['em_revisao', 'suspenso'];
      return ok({ anuncios: st.anuncios.filter(function (an) { return cids.indexOf(an.cidade) >= 0 && status.indexOf(an.status) >= 0; })
        .sort(function (p, q) { return q.atualizadoEm - p.atualizadoEm; }).map(function (an) {
          var e = empresa(an.empresaId);
          return Object.assign(anuncioEmpresa(an), { empresa: { id: e.id, nomeFantasia: e.nomeFantasia, status: e.status, cnpjFormatado: R.formatarCnpj(e.cnpj), conferida: !!e.cnpjConferidoEm },
            denunciasAbertas: st.denuncias.filter(function (d) { return d.anuncioId === an.id && d.status === 'aberta'; }).length });
        }) });
    };

    H.vagas_op_anuncio_decidir = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var an = anuncio(a.p_anuncio);
      if (!an) return erro('Vaga não encontrada.');
      var papel = papelCidade(an.cidade);
      if (!papel) return erro('Vaga não encontrada.');
      var e = empresa(an.empresaId);
      var motivo = R.limparTexto(a.p_motivo, 300);
      if (a.p_acao === 'publicar') {
        if (an.status !== 'em_revisao' && an.status !== 'suspenso') return erro('Esta vaga não está esperando a moderação.');
        if (e.status !== 'ativa') return erro('Aprove a empresa antes de publicar a vaga.');
        if (an.modalidade === 'diaria' && an.diaria.data < hoje(cidade(an.cidade).fuso)) return erro('A data da diária já passou.');
        if (an.status === 'em_revisao' || an.expiraEm == null || an.expiraEm <= agora()) { an.publicadoEm = an.publicadoEm || agora(); an.expiraEm = expiraCalculada(an); }
        an.status = 'publicado'; an.statusMotivo = '';
        st.denuncias.forEach(function (d) {
          if (d.anuncioId === an.id && d.alvo === 'anuncio' && d.status === 'aberta') {
            d.status = 'improcedente'; d.decididaPor = st.sessao; d.decididaEm = agora(); d.decisaoMotivo = motivo || 'Vaga devolvida ao ar pela moderação.';
          }
        });
      } else if (a.p_acao === 'devolver') {
        if (!motivo) return erro('Informe o motivo.');
        if (an.status !== 'em_revisao' && an.status !== 'suspenso') return erro('Esta vaga não está esperando a moderação.');
        an.status = 'rascunho'; an.statusMotivo = motivo;
      } else if (a.p_acao === 'remover') {
        if (!motivo) return erro('Informe o motivo.');
        an.status = 'removido'; an.statusMotivo = motivo;
      } else return erro('Ação inválida.');
      tocar(an);
      registrar(an.cidade, papel, 'anuncio_' + a.p_acao, 'anuncio', an.id, motivo);
      return ok({ anuncio: anuncioEmpresa(an) });
    };

    H.vagas_op_denuncias = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var status = R.listaEnum(f.status, ['aberta', 'procedente', 'improcedente']);
      if (!status.length) status = ['aberta'];
      return ok({ denuncias: st.denuncias.filter(function (d) { return cids.indexOf(d.cidade) >= 0 && status.indexOf(d.status) >= 0; })
        .sort(function (p, q) { return q.criadoEm - p.criadoEm; }).map(function (d) {
          var an = d.anuncioId ? anuncio(d.anuncioId) : null;
          var r = d.referenciaId ? st.referencias.filter(function (y) { return y.id === d.referenciaId; })[0] : null;
          return { id: d.id, alvo: d.alvo, motivo: d.motivo, detalhe: d.detalhe, status: d.status, contaNoLimite: d.contaNoLimite, criadoEm: iso(d.criadoEm),
            decisaoMotivo: d.decisaoMotivo || '', decididaEm: iso(d.decididaEm),
            anuncio: an ? { id: an.id, codigo: an.codigo, titulo: an.titulo, status: an.status, empresa: { id: an.empresaId, nomeFantasia: empresa(an.empresaId).nomeFantasia, status: empresa(an.empresaId).status } } : null,
            mensagem: d.alvo === 'mensagem' ? { texto: d.textoDenunciado, autor: d.autorMensagem } : null,
            referencia: r ? { id: r.id, funcao: r.funcao, texto: r.texto, textoStatus: r.textoStatus, status: referenciaStatusEmpresa(r), empresa: { id: r.empresaId, nomeFantasia: empresa(r.empresaId).nomeFantasia } } : null };
        }) });
    };

    H.vagas_op_denuncia_decidir = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var d = st.denuncias.filter(function (y) { return y.id === a.p_denuncia; })[0];
      if (!d) return erro('Denúncia não encontrada.');
      var papel = papelCidade(d.cidade);
      if (!papel) return erro('Denúncia não encontrada.');
      var o = obj(a.p_dados);
      var dec = txt(o.decisao);
      var motivo = R.limparTexto(o.motivo, 300);
      if (dec !== 'procedente' && dec !== 'improcedente') return erro('Decisão inválida.');
      if (!motivo) return erro('Informe o motivo.');
      if ((o.suspenderEmpresa === true || o.suspenderAutor === true) && papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      d.status = dec; d.decididaPor = st.sessao; d.decididaEm = agora(); d.decisaoMotivo = motivo;
      if (dec === 'procedente') {
        if (o.removerAnuncio === true && d.anuncioId) { var an = anuncio(d.anuncioId); an.status = 'removido'; an.statusMotivo = motivo; registrar(d.cidade, papel, 'anuncio_remover', 'anuncio', an.id, motivo); }
        if ((o.suspenderEmpresa === true || (o.suspenderAutor === true && d.autorMensagem === 'empresa')) && d.empresaId) {
          var e = empresa(d.empresaId); e.status = 'suspensa'; e.statusMotivo = motivo; registrar(d.cidade, papel, 'empresa_suspender', 'empresa', e.id, motivo);
        }
        if (o.removerReferencia === true && d.referenciaId) {
          var r = st.referencias.filter(function (y) { return y.id === d.referenciaId; })[0];
          r.status = 'removida'; r.removidaPor = 'moderacao'; r.texto = ''; r.textoStatus = 'sem_texto'; r.textoMotivo = motivo;
          historico(r.id, 'removida', 'moderacao'); registrar(d.cidade, papel, 'referencia_remover', 'referencia', r.id, motivo);
        }
        if (o.suspenderAutor === true && d.autorMensagem === 'pessoa' && d.autorMensagemUser && st.contas[d.autorMensagemUser]) {
          st.contas[d.autorMensagemUser].status = 'suspensa'; st.contas[d.autorMensagemUser].suspensaMotivo = motivo;
          registrar(d.cidade, papel, 'conta_suspender', 'conta', null, motivo, { denuncia: d.id });
        }
      }
      registrar(d.cidade, papel, 'denuncia_' + dec, 'denuncia', d.id, motivo);
      return ok({ denuncia: { id: d.id, status: d.status, decisaoMotivo: d.decisaoMotivo } });
    };

    H.vagas_op_moderacao = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var lim = R.inteiro(f.limite); lim = Math.min(Math.max(lim == null ? 100 : lim, 1), 200);
      return ok({ registros: st.moderacao.filter(function (m) { return cids.indexOf(m.cidade) >= 0; }).sort(function (p, q) { return q.em - p.em || q.id - p.id; })
        .slice(0, lim).map(function (m) { return { id: m.id, em: iso(m.em), papel: m.papel, acao: m.acao, alvo: m.alvo, alvoId: m.alvoId, motivo: m.motivo, dados: clone(m.dados), cidade: m.cidade }; }) });
    };

    H.vagas_op_referencias = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var status = R.listaEnum(f.textoStatus, ['pendente', 'publicado', 'nao_publicado']);
      if (!status.length) status = ['pendente'];
      return ok({ referencias: st.referencias.filter(function (r) { var e = empresa(r.empresaId); return cids.indexOf(e.cidade) >= 0 && status.indexOf(r.textoStatus) >= 0 && referenciaStatusEmpresa(r) !== 'removida'; })
        .sort(function (p, q) { return p.criadoEm - q.criadoEm; }).map(function (r) {
          return { id: r.id, empresa: { id: r.empresaId, nomeFantasia: empresa(r.empresaId).nomeFantasia }, funcao: r.funcao, vinculo: r.vinculo, texto: r.texto,
            textoStatus: r.textoStatus, textoMotivo: r.textoMotivo, status: referenciaStatusEmpresa(r), criadoEm: iso(r.criadoEm) };
        }) });
    };

    H.vagas_op_referencia_decidir = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var r = st.referencias.filter(function (y) { return y.id === a.p_referencia; })[0];
      if (!r) return erro('Referência não encontrada.');
      var cid = empresa(r.empresaId).cidade;
      var papel = papelCidade(cid);
      if (!papel) return erro('Referência não encontrada.');
      var motivo = R.limparTexto(a.p_motivo, 300);
      if (a.p_acao === 'aprovar_texto') {
        if (r.textoStatus !== 'pendente') return erro('Este texto não está esperando a moderação.');
        r.textoStatus = 'publicado'; r.textoMotivo = '';
      } else if (a.p_acao === 'recusar_texto') {
        if (!motivo) return erro('Informe o motivo.');
        if (r.textoStatus !== 'pendente' && r.textoStatus !== 'publicado') return erro('Este texto não está esperando a moderação.');
        r.textoStatus = 'nao_publicado'; r.textoMotivo = motivo;
      } else if (a.p_acao === 'remover') {
        if (!motivo) return erro('Informe o motivo.');
        r.status = 'removida'; r.removidaPor = 'moderacao'; r.texto = ''; r.textoStatus = 'sem_texto'; r.textoMotivo = motivo;
      } else return erro('Ação inválida.');
      historico(r.id, { aprovar_texto: 'texto_publicado', recusar_texto: 'texto_nao_publicado', remover: 'removida' }[a.p_acao], 'moderacao');
      registrar(cid, papel, 'referencia_' + a.p_acao, 'referencia', r.id, motivo);
      return ok({ referencia: { id: r.id, status: referenciaStatusEmpresa(r), textoStatus: r.textoStatus } });
    };

    H.vagas_adm_cidade_salvar = function (a) {
      if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
      var d = obj(a.p_dados);
      var slug = txt(d.slug).trim().toLowerCase();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$/.test(slug) || slug.length > 60) return erro('Endereço da cidade inválido (ex.: boa-vista-rr).');
      var status = txt(d.status) || 'rascunho';
      if (['rascunho', 'lista_espera', 'ativa', 'pausada'].indexOf(status) < 0) return erro('Status da cidade inválido.');
      var praca = null;
      if (txt(d.praca).trim()) { praca = cidade(txt(d.praca).trim().toLowerCase()); if (!praca) return erro('Cidade-polo não encontrada.'); }
      var c = cidade(slug);
      var tem = function (k) { return Object.prototype.hasOwnProperty.call(d, k); };
      if (!c) {
        if (R.limparTexto(d.nome, 80).length < 2 || !/^[A-Z]{2}$/.test(txt(d.uf).trim().toUpperCase())) return erro('Dados da cidade inválidos. Confira nome, UF e IBGE.');
        c = { id: novoId(), slug: slug, nome: '', uf: '', ibge: null, fuso: 'America/Boa_Vista', status: 'rascunho', praca: null, metaListaEspera: null, ordem: 0 };
        st.cidades.push(c);
        d = Object.assign({ nome: d.nome, uf: d.uf, status: status }, d);
      }
      if (tem('nome')) c.nome = R.limparTexto(d.nome, 80);
      if (tem('uf')) c.uf = txt(d.uf).trim().toUpperCase();
      if (tem('ibge')) c.ibge = txt(d.ibge).trim() || null;
      if (tem('fuso')) c.fuso = txt(d.fuso).trim() || 'America/Boa_Vista';
      if (tem('status')) c.status = status;
      if (tem('praca')) c.praca = praca ? praca.slug : null;
      if (tem('metaListaEspera')) c.metaListaEspera = R.inteiro(d.metaListaEspera);
      if (tem('ordem')) c.ordem = R.inteiro(d.ordem) || 0;
      registrar(c.slug, 'admin', 'cidade_salvar', 'cidade', c.id, '', { status: c.status });
      return ok({ cidade: cidadeJson(c) });
    };

    H.vagas_adm_zona_salvar = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var d = obj(a.p_dados);
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c) return erro('Cidade não encontrada.');
      var papel = papelCidade(c.slug);
      if (!papel || papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      var slug = txt(d.slug).trim().toLowerCase();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return erro('Endereço da zona inválido (ex.: zona-oeste).');
      var z = zona(c.slug, slug);
      var tem = function (k) { return Object.prototype.hasOwnProperty.call(d, k); };
      if (!z) {
        if (R.limparTexto(d.nome, 60).length < 2) return erro('Dados da zona inválidos. Confira o nome.');
        z = { id: novoId(), cidade: c.slug, slug: slug, nome: '', bairros: [], ordem: 0, ativa: true };
        st.zonas.push(z);
        d = Object.assign({ nome: d.nome }, d);
      }
      if (tem('nome')) z.nome = R.limparTexto(d.nome, 60);
      if (tem('bairros')) z.bairros = R.listaTexto(d.bairros, 60);
      if (tem('ordem')) z.ordem = R.inteiro(d.ordem) || 0;
      if (tem('ativa')) z.ativa = d.ativa !== false;
      registrar(c.slug, papel, 'zona_salvar', 'zona', z.id, '');
      return ok({ zona: { id: z.id, slug: z.slug, nome: z.nome, bairros: z.bairros.slice(), ordem: z.ordem, ativa: z.ativa } });
    };

    H.vagas_adm_operador_salvar = function (a) {
      if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
      var d = obj(a.p_dados);
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c) return erro('Cidade não encontrada.');
      var papel = txt(d.papel) || 'operador';
      if (papel !== 'operador' && papel !== 'moderador') return erro('Papel inválido.');
      var u = usuarioPorEmail(R.normalizarEmail(d.email));
      if (!u || !st.contas[u.id] || st.contas[u.id].tipo !== 'operador') return erro('Não há conta de operação com este e-mail. Use o convite de operador.');
      var o = st.operadores.filter(function (x) { return x.userId === u.id && x.cidade === c.slug; })[0];
      if (!o) { o = { userId: u.id, cidade: c.slug, papel: papel, ativo: true, repassePercentual: 0, contratoVersao: '' }; st.operadores.push(o); }
      o.papel = papel;
      if (Object.prototype.hasOwnProperty.call(d, 'ativo')) o.ativo = d.ativo !== false;
      if (Object.prototype.hasOwnProperty.call(d, 'repassePercentual')) {
        var pct = Number(d.repassePercentual);
        if (!isFinite(pct) || pct < 0 || pct > 100) return erro('Percentual de repasse inválido (0 a 100).');
        o.repassePercentual = pct;
      }
      if (Object.prototype.hasOwnProperty.call(d, 'contratoVersao')) o.contratoVersao = R.limparTexto(d.contratoVersao, 40);
      registrar(c.slug, 'admin', 'operador_salvar', 'operador', null, '', { papel: o.papel, ativo: o.ativo });
      return ok({ operador: { cidade: c.slug, papel: o.papel, ativo: o.ativo, repassePercentual: o.repassePercentual, contratoVersao: o.contratoVersao } });
    };

    H.vagas_exportar_meus_dados = function () {
      var c = contaAtual(null);
      if (!c.ok) return c;
      var uid = st.sessao;
      var ct = st.contas[uid];
      return ok({ geradoEm: iso(agora()),
        conta: { tipo: ct.tipo, status: ct.status, email: usuario(uid).email, criadoEm: iso(ct.criadoEm), confirmadaEm: iso(ct.confirmadaEm),
          termosVersao: ct.termosVersao || '', termosAceitosEm: iso(ct.termosAceitosEm) },
        consentimentos: st.consentimentos.filter(function (x) { return x.userId === uid; }).map(function (x) { return { tipo: x.tipo, versao: x.versao, aceito: x.aceito, ate: iso(x.ate), em: iso(x.em) }; }),
        pessoa: pessoaJson(uid),
        testes: null,
        foto: temFoto(uid) ? 'Você tem uma foto guardada (só as empresas com Combinou a veem). Baixe pelo seu perfil.' : '',
        candidaturas: st.candidaturas.filter(function (k) { return k.pessoaId === uid; }).map(candidaturaPessoa),
        pulos: st.pulos.filter(function (p) { return p.pessoaId === uid; }).map(function (p) { var an = anuncio(p.anuncioId);
          return { anuncio: { codigo: an ? an.codigo : '', titulo: an ? an.titulo : '' }, em: iso(p.em) }; }),
        denunciasFeitas: st.denuncias.filter(function (d) { return d.autor === uid; }).map(function (d) {
          return { alvo: d.alvo, motivo: d.motivo, detalhe: d.detalhe || '', status: d.status, em: iso(d.criadoEm) }; }),
        mensagensEnviadas: st.mensagens.filter(function (m) { return m.autorUser === uid; }).map(function (m) { return { em: iso(m.criadoEm), texto: m.texto }; }),
        acessosAoContato: st.acessos.filter(function (x) { return x.pessoaId === uid; }).map(function (x) { return { empresa: x.empresaNome, anuncio: x.anuncioTitulo, em: iso(x.em) }; }),
        empresas: st.membros.filter(function (m) { return m.userId === uid; }).map(function (m) { return Object.assign(empresaJson(empresa(m.empresaId)), { papel: m.papel }); }),
        operador: st.operadores.filter(function (o) { return o.userId === uid; }).map(function (o) { return { cidade: o.cidade, papel: o.papel, ativo: o.ativo }; }),
        referenciasRecebidas: st.referencias.filter(function (r) { return r.pessoaId === uid; }).map(function (r) {
          return Object.assign(referenciaJson(r, true), { status: r.status, historico: st.referenciaHistorico.filter(function (h) { return h.referenciaId === r.id; })
            .map(function (h) { return { acao: h.acao, por: h.por, em: iso(h.em) }; }) });
        }),
        pedidosDeReferencia: st.convitesReferencia.filter(function (x) { return x.pessoaId === uid; }).map(function (x) { return { empresaNome: x.empresaNome, status: x.status, criadoEm: iso(x.criadoEm) }; }) });
    };

    // ------------------------------------------------------------------------------------------------- conta (Edge Function + Auth)
    var MSG_ENVIADO = 'Se este e-mail puder ser usado, você vai receber um link em instantes. Confira também a caixa de spam.';
    function mascarar(e) { var m = /^([^@]+)@([^.]+)(\..+)?$/.exec(String(e || '')); return m ? m[1].charAt(0) + '***@' + m[2].charAt(0) + '***' + (m[3] || '') : ''; }
    function novoLink(email, tipo) {
      var t = 'previa' + novoToken().slice(0, 24);
      st.links[t] = { email: email, tipo: tipo, em: agora() };
      return { tokenHash: t, tipo: tipo, caminho: 'entrar.html?token_hash=' + t + '&type=' + tipo };
    }
    // Foto de mentira da prévia (silhueta neutra em SVG) quando a tela não manda a imagem.
    var FOTO_PREVIA = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#eaeef4"/>' +
      '<circle cx="32" cy="24" r="12" fill="#8a97ab"/><rect x="14" y="40" width="36" height="20" rx="10" fill="#8a97ab"/></svg>');
    function neutro(email, link) { return ok({ enviado: true, mensagem: MSG_ENVIADO, email: mascarar(email), linkPrevia: link ? link.caminho : '' }); }
    function criarUsuario(email, tipo, extra) {
      var u = Object.assign({ id: novoId(), email: email, senha: null, confirmada: false, admin: false, app: { produto: 'vagas', tipo: tipo } }, extra || {});
      st.usuarios.push(u);
      return u;
    }

    var conta = {
      cadastrar: function (d) {
        d = obj(d);
        var email = R.normalizarEmail(d.email);
        if (!email) return erro('E-mail inválido.');
        if (d.tipo !== 'pessoa' && d.tipo !== 'empresa') return erro('Escolha se a conta é para procurar emprego ou para uma empresa.');
        var versao = txt(d.termosVersao || R.VERSAO_TERMOS).trim();
        if (!/^[A-Za-z0-9._-]{1,40}$/.test(versao)) return erro('Para criar a conta, aceite os termos de uso e o aviso de privacidade.');
        var u = usuarioPorEmail(email);
        if (!u) {
          // O consentimento (data + linhas) só é gravado quando a pessoa confirma pelo link (contaAtual), como no banco.
          u = criarUsuario(email, d.tipo, { meta: { nome: R.limparTexto(d.nome, 120) } });
          st.contas[u.id] = { tipo: d.tipo, status: 'pendente', termosVersao: versao, termosAceitosEm: null, criadoEm: agora() };
          return neutro(email, novoLink(email, 'invite'));
        }
        if (st.contas[u.id] && !u.confirmada) {
          // Conta pendente "solta" (sem cadastro assistido, sem empresa, sem operação): quem tem o e-mail decide o tipo
          // (um terceiro pode ter "pré-registrado" com outro). Com vínculo, o tipo fica e o link vai de novo (mesma resposta).
          var solta = !st.contas[u.id].assistidaPor && !st.membros.some(function (m) { return m.userId === u.id; })
            && !st.operadores.some(function (o) { return o.userId === u.id; });
          if (st.contas[u.id].tipo !== d.tipo && solta) { st.contas[u.id].tipo = d.tipo; u.app = { produto: 'vagas', tipo: d.tipo }; }
          if (solta) { st.contas[u.id].termosVersao = versao; st.contas[u.id].termosAceitosEm = null; }
          return neutro(email, novoLink(email, 'invite'));
        }
        return neutro(email, null);
      },
      reenviarConfirmacao: function (email) {
        var e = R.normalizarEmail(email);
        if (!e) return erro('E-mail inválido.');
        var u = usuarioPorEmail(e);
        return neutro(e, u && st.contas[u.id] && !u.confirmada ? novoLink(e, 'invite') : null);
      },
      esqueciSenha: function (email) {
        var e = R.normalizarEmail(email);
        if (!e) return erro('E-mail inválido.');
        var u = usuarioPorEmail(e);
        return neutro(e, u && st.contas[u.id] && !u.admin ? novoLink(e, 'recovery') : null);
      },
      cadastroAssistido: function (d) {
        d = obj(d);
        if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        var cid = txt(d.cidade).trim().toLowerCase();
        if (!(eAdmin() || papelCidade(cid) === 'operador')) return erro(R.MSG.SEM_PERMISSAO);
        var email = R.normalizarEmail(d.email);
        if (!email) return erro('E-mail inválido.');
        if (d.tipo !== 'pessoa' && d.tipo !== 'empresa') return erro('Escolha se a conta é para procurar emprego ou para uma empresa.');
        if (usuarioPorEmail(email)) return erro('Este e-mail já tem conta. A pessoa pode entrar ou usar "Esqueci minha senha".', { existe: true });
        // Mesma regra de vagas_op_vincular_membro: o assistido só entra em empresa SEM membro ativo.
        if (d.empresaId && d.tipo === 'empresa' && st.membros.some(function (m) { return m.empresaId === d.empresaId && m.ativo; })) {
          return erro('Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.');
        }
        var u = criarUsuario(email, d.tipo, { meta: { nome: R.limparTexto(d.nome, 120) } });
        st.contas[u.id] = { tipo: d.tipo, status: 'pendente', termosVersao: '', assistidaPor: st.sessao, cidade: cid, codigoEvento: txt(d.codigoEvento).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), criadoEm: agora() };
        if (d.empresaId && empresa(d.empresaId) && d.tipo === 'empresa') {
          st.membros.push({ empresaId: d.empresaId, userId: u.id, papel: st.membros.some(function (m) { return m.empresaId === d.empresaId && m.papel === 'dono' && m.ativo; }) ? 'recrutador' : 'dono', ativo: true, criadoEm: agora() });
        }
        registrar(cid, eAdmin() ? 'admin' : 'operador', 'cadastro_assistido', 'conta', u.id, '');
        var l = novoLink(email, 'invite');
        return ok({ enviado: true, email: mascarar(email), linkPrevia: l.caminho });
      },
      convidarOperador: function (d) {
        d = obj(d);
        if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
        var email = R.normalizarEmail(d.email);
        if (!email) return erro('E-mail inválido.');
        var cid = txt(d.cidade).trim().toLowerCase();
        var papel = d.papel === 'moderador' ? 'moderador' : 'operador';
        var u = usuarioPorEmail(email);
        if (u) {
          if (!st.contas[u.id] || st.contas[u.id].tipo !== 'operador') return erro('Este e-mail já tem outra conta. Use um e-mail só para a operação.');
          var o = st.operadores.filter(function (x) { return x.userId === u.id && x.cidade === cid; })[0];
          if (o) { o.papel = papel; o.ativo = true; } else st.operadores.push({ userId: u.id, cidade: cid, papel: papel, ativo: true, repassePercentual: 0, contratoVersao: '' });
          return ok({ existente: true, email: mascarar(email) });
        }
        u = criarUsuario(email, 'operador');
        st.contas[u.id] = { tipo: 'operador', status: 'pendente', termosVersao: '', assistidaPor: st.sessao, criadoEm: agora() };
        st.operadores.push({ userId: u.id, cidade: cid, papel: papel, ativo: true, repassePercentual: 0, contratoVersao: '' });
        var l = novoLink(email, 'invite');
        return ok({ enviado: true, email: mascarar(email), linkPrevia: l.caminho });
      },
      excluirConta: function () {
        var uid = st.sessao;
        if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        if (eAdmin()) return erro('Esta conta também acessa o painel DISC. Fale com a Gestão sem Caos para excluir.');
        if (!st.contas[uid]) return erro('Conta não encontrada.');
        var cands = st.candidaturas.filter(function (k) { return k.pessoaId === uid; }).map(function (k) { return k.id; });
        var convs = st.conversas.filter(function (v) { return cands.indexOf(v.candidaturaId) >= 0; }).map(function (v) { return v.id; });
        st.mensagens = st.mensagens.filter(function (m) { return convs.indexOf(m.conversaId) < 0; });
        st.conversas = st.conversas.filter(function (v) { return convs.indexOf(v.id) < 0; });
        st.candidaturas = st.candidaturas.filter(function (k) { return k.pessoaId !== uid; });
        st.acessos = st.acessos.filter(function (x) { return x.pessoaId !== uid; });
        st.referencias = st.referencias.filter(function (r) { return r.pessoaId !== uid; });
        st.convitesReferencia = st.convitesReferencia.filter(function (x) { return x.pessoaId !== uid; });
        st.experiencias = st.experiencias.filter(function (x) { return x.userId !== uid; });
        st.pulos = st.pulos.filter(function (p) { return p.pessoaId !== uid; });
        st.membros = st.membros.filter(function (m) { return m.userId !== uid; });
        st.operadores = st.operadores.filter(function (o) { return o.userId !== uid; });
        st.consentimentos = st.consentimentos.filter(function (x) { return x.userId !== uid; });
        if (st.fotos) delete st.fotos[uid];
        delete st.pessoas[uid]; delete st.contatos[uid]; delete st.contas[uid];
        st.usuarios = st.usuarios.filter(function (u) { return u.id !== uid; });
        st.sessao = null;
        return ok({ excluida: true });
      },
      // Foto opcional (na prévia, guardada como data URL neste navegador; no real, bucket privado do Storage).
      enviarFoto: function (arq) {
        arq = obj(arq);
        var uid = st.sessao;
        if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        if (!st.contas[uid] || st.contas[uid].tipo !== 'pessoa') return erro(R.MSG.SO_PESSOA);
        if (['image/jpeg', 'image/png', 'image/webp'].indexOf(txt(arq.tipo)) < 0 || !(Number(arq.tamanho) > 0) || Number(arq.tamanho) > 1048576) {
          return erro('A foto precisa ser JPG, PNG ou WEBP, com até 1 MB.');
        }
        st.fotos = st.fotos || {};
        st.fotos[uid] = /^data:image\//.test(txt(arq.dataUrl)) && txt(arq.dataUrl).length <= 1500000 ? txt(arq.dataUrl) : FOTO_PREVIA;
        return ok({ temFoto: true });
      },
      apagarFoto: function () {
        var uid = st.sessao;
        if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        if (st.fotos) delete st.fotos[uid];
        return ok({ temFoto: false });
      },
      fotoUrl: function (candId) {
        var uid = st.sessao;
        if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        var dono = uid;
        if (candId) {
          var k = candidatura(txt(candId));
          if (!k || !st.membros.some(function (m) { return m.empresaId === k.empresaId && m.userId === uid && m.ativo; })) return erro('Candidatura não encontrada.');
          if (k.status !== 'combinou' && k.status !== 'contratada') return erro('A foto só aparece depois do Combinou.', { semCombinou: true });
          if (k.contatoCortadoEm != null) return erro('A pessoa deixou de compartilhar o contato com a sua empresa.', { contatoCortado: true });
          if (empresa(k.empresaId).status !== 'ativa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', { suspensa: true });
          if (!temFoto(k.pessoaId)) return erro('Esta pessoa não pôs foto.', { semFoto: true });
          dono = k.pessoaId;
        } else if (!temFoto(uid)) return erro('Sem foto.', { semFoto: true });
        return ok({ url: st.fotos[dono], expiraEm: iso(agora() + 300000) });
      },
      entrar: function (email, senha) {
        var u = usuarioPorEmail(R.normalizarEmail(email));
        if (!u || !u.senha || u.senha !== String(senha || '')) return erro('E-mail ou senha não conferem.');
        if (!u.confirmada) return erro(R.MSG.CONFIRMAR, { confirmar: true });
        st.sessao = u.id;
        return H.vagas_eu({});
      },
      sair: function () { st.sessao = null; return ok(); },
      sessao: function () {
        var u = usuario(st.sessao);
        if (!u) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        return ok({ usuario: { id: u.id, email: u.email } });
      },
      confirmarLink: function (l) {
        l = obj(l);
        var reg = st.links[l.tokenHash];
        if (!reg || reg.tipo !== l.tipo || reg.em < agora() - DIA) return erro('O link expirou ou já foi usado. Peça outro na tela de entrada.', { linkExpirado: true });
        delete st.links[l.tokenHash];
        var u = usuarioPorEmail(reg.email);
        if (!u) return erro('O link expirou ou já foi usado. Peça outro na tela de entrada.', { linkExpirado: true });
        u.confirmada = true;
        st.sessao = u.id;
        return ok({ tipo: l.tipo, precisaSenha: true });
      },
      definirSenha: function (senha) {
        var s = String(senha || '');
        if (s.length < 8 || s.length > 72) return erro('A senha precisa ter de 8 a 72 caracteres.');
        var u = usuario(st.sessao);
        if (!u) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        u.senha = s;
        return ok();
      }
    };

    // ------------------------------------------------------------------------------------------------- semente
    function estadoVazio() {
      return { versao: 2, seq: 0, sessao: null, cidades: [], zonas: [], usuarios: [], contas: {}, consentimentos: [], pessoas: {}, contatos: {}, experiencias: [],
        empresas: [], membros: [], anuncios: [], pulos: [], candidaturas: [], conversas: [], mensagens: [], denuncias: [], moderacao: [], operadores: [],
        listaEspera: [], acessos: [], referencias: [], convitesReferencia: [], referenciaHistorico: [], selos: {}, fotos: {}, limites: {}, links: {} };
    }

    function semear() {
      var t0 = agora();
      function cidadeNova(slug, nome, ibge, status, ordem, praca) {
        st.cidades.push({ id: novoId(), slug: slug, nome: nome, uf: 'RR', ibge: ibge, fuso: 'America/Boa_Vista', status: status, praca: praca || null, metaListaEspera: null, ordem: ordem });
      }
      cidadeNova('boa-vista-rr', 'Boa Vista', '1400100', 'ativa', 1);
      cidadeNova('mucajai-rr', 'Mucajaí', '1400308', 'ativa', 2, 'boa-vista-rr');
      cidadeNova('canta-rr', 'Cantá', '1400175', 'ativa', 3, 'boa-vista-rr');
      cidadeNova('rorainopolis-rr', 'Rorainópolis', '1400472', 'lista_espera', 4);
      [['boa-vista-rr', 'centro-leste', 'Centro e Zona Leste', ['Centro', 'São Pedro', 'São Francisco', 'Aparecida', '31 de Março', 'Canarinho', 'Caçari', 'Paraviana', 'Bairro dos Estados'], 1],
        ['boa-vista-rr', 'zona-norte', 'Zona Norte', ['Aeroporto', 'Cauamé', 'Jardim Floresta', 'Mecejana', 'Pricumã', 'Jóquei Clube'], 2],
        ['boa-vista-rr', 'zona-sul', 'Zona Sul', ['Calungá', 'São Vicente', 'Treze de Setembro', 'Marechal Rondon', 'Centenário', 'Distrito Industrial'], 3],
        ['boa-vista-rr', 'zona-oeste', 'Zona Oeste', ['Pintolândia', 'Senador Hélio Campos', 'Cidade Satélite', 'Jardim Primavera', 'Tancredo Neves', 'Asa Branca', 'Buritis',
          'Cambará', 'Caimbé', 'Liberdade', 'Raiar do Sol', 'Nova Cidade', 'Doutor Sílvio Botelho', 'Santa Tereza', 'Alvorada'], 4],
        ['mucajai-rr', 'cidade-toda', 'Mucajaí (cidade toda)', [], 1], ['canta-rr', 'cidade-toda', 'Cantá (cidade toda)', [], 1],
        ['rorainopolis-rr', 'cidade-toda', 'Rorainópolis (cidade toda)', [], 1]].forEach(function (z) {
        st.zonas.push({ id: novoId(), cidade: z[0], slug: z[1], nome: z[2], bairros: z[3], ordem: z[4], ativa: true });
      });
      st.listaEspera.push({ cidade: 'rorainopolis-rr', email: 'interessada@previa.com', perfil: 'pessoa', criadoEm: t0 - 3 * DIA });

      function usuarioSemente(email, tipo, extra) {
        var u = criarUsuario(email, tipo, Object.assign({ senha: SENHA_PREVIA, confirmada: true }, extra || {}));
        if (tipo) st.contas[u.id] = { tipo: tipo, status: 'ativa', termosVersao: R.VERSAO_TERMOS, termosAceitosEm: t0 - 20 * DIA, criadoEm: t0 - 20 * DIA, confirmadaEm: t0 - 20 * DIA };
        return u;
      }
      var admin = usuarioSemente('admin@previa.com', null, { admin: true, app: {} });
      void admin;
      var op = usuarioSemente('operador@previa.com', 'operador');
      st.operadores.push({ userId: op.id, cidade: 'boa-vista-rr', papel: 'operador', ativo: true, repassePercentual: 0, contratoVersao: '' });

      // 15 empresas (fictícias). A primeira é a da empresa@previa.com.
      var EMP = [
        ['Mercadinho Sol do Norte', 'Supermercado', 'centro-leste', '559532241001'], ['Padaria Trigo Dourado', 'Padaria', 'zona-oeste', '559532241002'],
        ['Farmácia Bem Viver', 'Farmácia', 'zona-sul', '559532241003'], ['Loja Casa & Cor', 'Material de construção', 'zona-norte', '559532241004'],
        ['Auto Peças Rodovia', 'Autopeças', 'zona-oeste', '559532241005'], ['Restaurante Sabor da Terra', 'Restaurante', 'centro-leste', '559532241006'],
        ['Clínica Cuidar Bem', 'Saúde', 'centro-leste', '559532241007'], ['Construtora Alicerce Forte', 'Construção civil', 'zona-sul', '559532241008'],
        ['Pousada Lavrado Azul', 'Hotelaria', 'centro-leste', '559532241009'], ['Ótica Visão Clara', 'Varejo', 'centro-leste', '559532241010'],
        ['Distribuidora Norte Frio', 'Distribuição', 'zona-norte', '559532241011'], ['Escola de Idiomas Ponte', 'Educação', 'zona-norte', '559532241012'],
        ['Pet Shop Amigo Fiel', 'Pet shop', 'zona-oeste', '559532241013'], ['Eventos Festa Boa', 'Eventos', 'zona-sul', '559532241014'],
        ['Lava-Jato Brilho Total', 'Serviços automotivos', 'zona-oeste', '559532241015']];
      var empresas = EMP.map(function (x, i) {
        var base = 'PV' + ('0000000000' + (i + 1)).slice(-10);
        var cnpj = base;
        for (var d1 = 0; d1 <= 99; d1++) { var tenta = base + ('0' + d1).slice(-2); if (R.cnpjValido(tenta)) { cnpj = tenta; break; } }
        var e = { id: novoId(), cidade: i === 13 ? 'mucajai-rr' : 'boa-vista-rr', zona: i === 13 ? 'cidade-toda' : x[2], cnpj: cnpj, mei: i === 14,
          razaoSocial: x[0] + ' Ltda (prévia)', nomeFantasia: x[0], setor: x[1], descricao: 'Empresa fictícia da prévia do Vagas sem Caos.',
          whatsapp: x[3], email: 'contato' + (i + 1) + '@previa.com', status: i === 12 ? 'em_analise' : 'ativa', statusMotivo: '',
          cnpjConferidoEm: i === 12 ? null : t0 - 15 * DIA, criadaPor: null, criadoEm: t0 - 16 * DIA };
        st.empresas.push(e);
        var dono = usuarioSemente(i === 0 ? 'empresa@previa.com' : 'empresa' + (i + 1) + '@previa.com', 'empresa');
        st.membros.push({ empresaId: e.id, userId: dono.id, papel: 'dono', ativo: true, criadoEm: t0 - 16 * DIA });
        return e;
      });

      // 40 pessoas (a primeira é a pessoa@previa.com).
      var NOMES = ['Ana Clara Ribeiro', 'Bruno Souza Lima', 'Carla Alves Pereira', 'Diego Costa Gomes', 'Elaine Martins Araújo', 'Fábio Barbosa Rocha',
        'Gabriela Dias Cardoso', 'Henrique Teixeira Moraes', 'Isabela Freitas Nunes', 'João Pedro Mendes', 'Karen Pinto Vieira', 'Lucas Ribeiro Souza',
        'Mariana Lima Alves', 'Nathan Pereira Costa', 'Olívia Gomes Martins', 'Paulo Araújo Barbosa', 'Quésia Rocha Dias', 'Rafael Cardoso Teixeira',
        'Sabrina Moraes Freitas', 'Thiago Nunes Mendes', 'Úrsula Pinto Ribeiro', 'Vinícius Vieira Souza', 'Wesley Lima Alves', 'Yasmin Pereira Gomes',
        'Zélia Costa Martins', 'Alice Araújo Barbosa', 'Breno Rocha Dias', 'Cíntia Cardoso Freitas', 'Davi Teixeira Nunes', 'Eduarda Moraes Pinto',
        'Felipe Mendes Vieira', 'Giovana Ribeiro Lima', 'Heitor Souza Alves', 'Ingrid Pereira Costa', 'Jéssica Gomes Araújo', 'Kevin Martins Rocha',
        'Larissa Barbosa Dias', 'Matheus Cardoso Teixeira', 'Nicole Freitas Moraes', 'Otávio Nunes Pinto'];
      var CARGOS = [['Atendente', 'Caixa'], ['Repositor', 'Auxiliar de depósito'], ['Recepcionista'], ['Vendedor(a)', 'Atendente'], ['Auxiliar administrativo'],
        ['Cozinheiro(a)', 'Auxiliar de cozinha'], ['Serviços gerais'], ['Ajudante de obra', 'Pedreiro(a)'], ['Garçom/Garçonete'], ['Motorista', 'Entregador(a)']];
      var ZONAS = ['zona-oeste', 'zona-sul', 'zona-norte', 'centro-leste'];
      var ESC = ['medio', 'medio_incompleto', 'fundamental', 'tecnico', 'superior_incompleto', 'medio'];
      var pessoas = NOMES.map(function (nome, i) {
        var u = usuarioSemente(i === 0 ? 'pessoa@previa.com' : 'pessoa' + (i + 1) + '@previa.com', 'pessoa');
        var cg = CARGOS[i % CARGOS.length];
        st.pessoas[u.id] = { cidade: i % 13 === 7 ? 'mucajai-rr' : 'boa-vista-rr', cidade2: i % 9 === 4 ? 'canta-rr' : null,
          zona: i % 13 === 7 ? 'cidade-toda' : ZONAS[i % ZONAS.length], cargos: cg.slice(), escolaridade: ESC[i % ESC.length],
          turnos: i % 3 === 0 ? ['manha', 'tarde'] : (i % 3 === 1 ? ['tarde', 'noite'] : ['manha', 'fim_de_semana']), cnh: i % 4 === 0 ? ['B'] : (i % 7 === 0 ? ['A', 'B'] : []),
          modalidades: i % 2 === 0 ? ['clt', 'diaria'] : ['clt', 'temporario', 'freelancer'], pretensaoCentavos: i % 5 === 0 ? null : 160000 + (i % 6) * 10000,
          cursos: i % 3 === 0 ? ['Atendimento ao cliente'] : [], sobre: 'Pessoa fictícia da prévia.', bancoAte: null, referenciasToken: null,
          areas: [['caixa', 'atendimento'], ['logistica'], ['atendimento'], ['vendas-loja', 'atendimento'], ['administrativo'], ['cozinha'],
            ['limpeza'], ['construcao'], ['hotelaria', 'cozinha'], ['motorista', 'logistica']][i % 10],
          criadoEm: t0 - (30 - i % 20) * DIA, atualizadoEm: t0 - (10 - i % 10) * DIA };
        st.contatos[u.id] = { nome: nome, whatsapp: '55959' + ('8' + ('0000000' + (1000000 + i * 137)).slice(-7)), email: u.email };
        st.experiencias.push({ id: novoId(), userId: u.id, funcao: cg[0], empregador: 'Empregador fictício ' + (i + 1), inicio: '2023-0' + (1 + i % 9), fim: i % 3 === 0 ? null : '2025-0' + (1 + i % 9), informal: i % 4 === 3, ordem: 1 });
        return u.id;
      });

      // 30 vagas: CLT, temporário, diária (hoje e próximos dias), estágio e freelancer; 3 confidenciais, 2 em revisão, 1 rascunho.
      var hojeBV = hoje('America/Boa_Vista');
      var VAGAS = [
        [0, 'Atendente de caixa', 'Caixa', 'clt', 162100, 180000, 'centro-leste'], [0, 'Repositor(a) de mercadorias', 'Repositor', 'clt', 162100, null, 'centro-leste'],
        [0, 'Diária: organização de estoque', 'Auxiliar de depósito', 'diaria', 12000, null, 'centro-leste', 0], [1, 'Padeiro(a)', 'Padeiro', 'clt', 200000, 230000, 'zona-oeste'],
        [1, 'Balconista de padaria', 'Balconista', 'clt', 162100, null, 'zona-oeste'], [2, 'Balconista de farmácia', 'Balconista', 'clt', 170000, 190000, 'zona-sul'],
        [2, 'Estágio em atendimento', 'Estagiário(a)', 'estagio', 80000, null, 'zona-sul'], [3, 'Vendedor(a) de loja', 'Vendedor', 'clt', 162100, 250000, 'zona-norte'],
        [3, 'Diária: descarga de caminhão', 'Ajudante', 'diaria', 15000, null, 'zona-norte', 1], [4, 'Auxiliar de estoque', 'Estoquista', 'temporario', 162100, null, 'zona-oeste'],
        [5, 'Cozinheiro(a)', 'Cozinheiro', 'clt', 220000, 260000, 'centro-leste'], [5, 'Garçom/Garçonete (fim de semana)', 'Garçom', 'freelancer', 9000, null, 'centro-leste'],
        [6, 'Recepcionista de clínica', 'Recepcionista', 'clt', 180000, 200000, 'centro-leste'], [6, 'Auxiliar administrativo(a)', 'Auxiliar administrativo', 'clt', 170000, null, 'centro-leste'],
        [7, 'Ajudante de obra', 'Ajudante de obra', 'temporario', 170000, null, 'zona-sul'], [7, 'Diária: limpeza pós-obra', 'Serviços gerais', 'diaria', 13000, null, 'zona-sul', 2],
        [8, 'Camareiro(a)', 'Camareira', 'clt', 162100, null, 'centro-leste'], [8, 'Recepcionista noturno(a)', 'Recepcionista', 'clt', 190000, null, 'centro-leste'],
        [9, 'Vendedor(a) de ótica', 'Vendedor', 'clt', 170000, 220000, 'centro-leste'], [10, 'Motorista entregador(a)', 'Motorista', 'clt', 230000, 260000, 'zona-norte'],
        [10, 'Conferente de carga', 'Conferente', 'clt', 190000, null, 'zona-norte'], [11, 'Recepcionista de escola', 'Recepcionista', 'clt', 170000, null, 'zona-norte'],
        [11, 'Estágio em secretaria escolar', 'Estagiário(a)', 'estagio', 70000, null, 'zona-norte'], [13, 'Diária: garçom em evento', 'Garçom', 'diaria', 14000, null, 'cidade-toda', 3],
        [13, 'Montador(a) de eventos', 'Montador', 'freelancer', 25000, null, 'cidade-toda'], [14, 'Lavador(a) de carros', 'Lavador', 'clt', 162100, null, 'zona-oeste'],
        [0, 'Vendedor(a) interno(a)', 'Vendedor', 'clt', 180000, 220000, 'centro-leste', null, true], [6, 'Assistente de faturamento', 'Auxiliar administrativo', 'clt', 200000, null, 'centro-leste', null, true],
        [10, 'Supervisor(a) de rota', 'Supervisor', 'clt', 300000, 350000, 'zona-norte', null, true], [12, 'Banhista e tosador(a)', 'Banhista', 'clt', 162100, null, 'zona-oeste']];
      var AREA_DO_CARGO = { Caixa: 'caixa', Repositor: 'logistica', 'Auxiliar de depósito': 'logistica', Padeiro: 'cozinha',
        Balconista: 'vendas-loja', 'Estagiário(a)': 'atendimento', Vendedor: 'vendas-loja', Ajudante: 'logistica', Estoquista: 'logistica',
        Cozinheiro: 'cozinha', 'Garçom': 'hotelaria', Recepcionista: 'atendimento', 'Auxiliar administrativo': 'administrativo',
        'Ajudante de obra': 'construcao', 'Serviços gerais': 'limpeza', Camareira: 'hotelaria', Motorista: 'motorista', Conferente: 'logistica',
        Montador: 'hotelaria', Lavador: 'outros', Supervisor: 'vendas-externas', Banhista: 'outros' };
      var anuncios = VAGAS.map(function (v, i) {
        var e = empresas[v[0]];
        var diaria = v[3] === 'diaria' ? { data: R.somarDias(hojeBV, v[7]), inicio: '07:00', fim: '16:00' } : null;
        var vende = v[2] === 'Vendedor' || v[2] === 'Supervisor';
        var ben = v[3] === 'clt' ? ['vt', 'refeicao'] : [];
        if (vende) ben.push('comissao');
        var a = { id: novoId(), codigo: '', empresaId: e.id, cidade: e.cidade, zona: v[6], area: AREA_DO_CARGO[v[2]] || 'outros', funcao: v[1],
          titulo: v[1], modalidade: v[3], descricao: 'Vaga fictícia da prévia: ' + v[1].toLowerCase() + ' em ' + e.nomeFantasia + '. Rotina de trabalho explicada na conversa.',
          turno: ['comercial', 'manha', 'tarde', 'escala', 'noite', 'a_combinar'][i % 6], fimDeSemana: i % 4 === 1, comissao: vende,
          inicio: diaria ? 'data' : 'imediato', inicioData: diaria ? diaria.data : null, experiencia: ['nao_precisa', 'ate_1', '1_a_3'][i % 3],
          escolaridade: v[3] === 'estagio' || i % 4 === 0 ? 'medio' : 'nao_exigida',
          requisitos: v[2] === 'Motorista' ? ['cnh_b'] : (i % 5 === 0 ? ['disponibilidade'] : []), requisitoOutro: '',
          selo: v[2] === 'Caixa' ? 'caixa' : (v[2] === 'Recepcionista' ? 'atendimento' : null), beneficios: ben,
          horasDia: v[3] === 'estagio' ? 6 : null, prazoHoras: diaria ? 48 : null, quantidade: 1 + i % 3,
          valor: { minCentavos: v[4], maxCentavos: v[5], unidade: v[3] === 'diaria' ? 'dia' : (v[3] === 'freelancer' ? 'servico' : 'mes') },
          diaria: diaria, diasNoAr: 30, confidencial: !!v[8], status: 'publicado', statusMotivo: '', publicadoEm: t0 - (i % 10) * DIA - i * 60000, expiraEm: null,
          encerradoEm: null, criadoPor: null, criadoEm: t0 - (i % 10) * DIA - i * 60000 - 3600000, atualizadoEm: t0 - (i % 10) * DIA };
        a.codigo = novoCodigo();
        st.anuncios.push(a);
        if (v[0] === 12) { a.status = 'em_revisao'; a.publicadoEm = null; }
        if (a.status === 'publicado') a.expiraEm = a.modalidade === 'diaria' ? t0 + 48 * 3600000 : a.publicadoEm + 30 * DIA;
        return a;
      });
      anuncios[25].status = 'em_revisao'; anuncios[25].publicadoEm = null; anuncios[25].expiraEm = null;
      var rascunho = Object.assign(clone(anuncios[1]), { id: novoId(), codigo: novoCodigo(), titulo: 'Fiscal de loja', funcao: 'Fiscal de loja', area: 'seguranca', status: 'rascunho', publicadoEm: null, expiraEm: null });
      st.anuncios.push(rascunho);

      // Candidaturas, conversas e um Combinou.
      function cand(pIdx, aIdx, status, extra) {
        var a = anuncios[aIdx];
        var k = Object.assign({ id: novoId(), anuncioId: a.id, pessoaId: pessoas[pIdx], empresaId: a.empresaId, status: status, criadoEm: t0 - (8 - pIdx % 8) * 3600000 - aIdx * 60000,
          atualizadoEm: t0 - pIdx * 60000 }, extra || {});
        st.candidaturas.push(k);
        return k;
      }
      function conversa(k, msgs) {
        var v = { id: novoId(), candidaturaId: k.id, status: 'aberta', criadaEm: t0 - 3 * 3600000, ultimaEm: t0 - 3600000, lidaEmpresaEm: t0 - 3600000, empresaSeguidas: 0 };
        st.conversas.push(v);
        msgs.forEach(function (m, i) {
          st.mensagens.push({ id: novoId(), conversaId: v.id, autor: m[0], autorUser: m[0] === 'pessoa' ? k.pessoaId : null, texto: m[1], criadoEm: t0 - 3 * 3600000 + i * 600000 });
        });
        return v;
      }
      for (var p = 1; p <= 9; p++) cand(p, 0, p % 3 === 0 ? 'conversar' : 'enviada');
      for (var q = 10; q <= 14; q++) cand(q, 1, 'enviada');
      cand(15, 2, 'enviada');
      var kConf = cand(0, 26, 'conversar', { empresaDecidiuEm: t0 - 3 * 3600000 });
      conversa(kConf, [['empresa', 'Olá! Gostamos do seu cartão. Você tem disponibilidade para começar na próxima semana?']]);
      var kComb = cand(0, 10, 'combinou', { empresaDecidiuEm: t0 - 2 * DIA, empresaReveladaEm: t0 - DIA, combinouEm: t0 - DIA });
      conversa(kComb, [['empresa', 'Olá! Podemos conversar sobre a vaga de cozinheiro(a)?'], ['pessoa', 'Pode sim! Tenho experiência em cozinha industrial.'],
        ['sistema', 'Combinou! O contato foi liberado para os dois lados.']]);
      st.acessos.push({ candidaturaId: kComb.id, pessoaId: pessoas[0], empresaId: anuncios[10].empresaId, empresaNome: empresas[5].nomeFantasia, anuncioTitulo: anuncios[10].titulo, userId: null, em: t0 - 20 * 3600000 });
      cand(0, 7, 'enviada');
      var k3 = cand(3, 0, 'conversar');
      conversa(k3, [['empresa', 'Olá! Você pode vir fazer uma conversa amanhã às 10h?'], ['pessoa', 'Posso sim, obrigado!']]);

      // Referências (empresas verificadas): uma aceita com texto aprovado, uma pendente.
      st.referencias.push({ id: novoId(), empresaId: empresas[5].id, pessoaId: pessoas[0], autor: null, convite: null, origem: 'candidatura', funcao: 'Auxiliar de cozinha', vinculo: 'clt',
        inicio: '2023-02', fim: '2025-01', pontosFortes: ['pontualidade', 'equipe'], recomendaPara: ['Cozinheiro(a)', 'Auxiliar de cozinha'],
        texto: 'Deixava a cozinha limpa no fim de cada turno e ajudava os colegas na hora do almoço, quando o movimento apertava.', textoStatus: 'publicado',
        textoMotivo: '', status: 'aceita', criadoEm: t0 - 40 * DIA, respondidaEm: t0 - 39 * DIA, aceitaEm: t0 - 39 * DIA, atualizadoEm: t0 - 39 * DIA });
      st.referencias.push({ id: novoId(), empresaId: empresas[0].id, pessoaId: pessoas[0], autor: null, convite: null, origem: 'convite', funcao: 'Atendente', vinculo: 'temporario',
        inicio: '2025-06', fim: '2025-08', pontosFortes: ['atendimento', 'aprende_rapido'], recomendaPara: ['Atendente'], texto: '', textoStatus: 'sem_texto', textoMotivo: '',
        status: 'pendente', criadoEm: t0 - 2 * DIA, respondidaEm: null, aceitaEm: null, atualizadoEm: t0 - 2 * DIA });
      st.referencias.forEach(function (r) { historico(r.id, 'oferecida', 'empresa'); if (r.status === 'aceita') historico(r.id, 'aceita', 'pessoa'); });
      // Selos fictícios (o formato do gancho vagas_interno.selos_cartao da migração dos testes).
      var umAno = R.somarDias(hojeBV, 355);
      st.selos[pessoas[0]] = [{ teste: 'atendimento', nome: 'Atendimento e recepção', nota: 80, data: R.somarDias(hojeBV, -10), codigo: 'Q8V3N2KD',
        validoAte: umAno, supervisao: 'online' }];
      st.selos[pessoas[4]] = [{ teste: 'caixa', nome: 'Operação de caixa', nota: 73, data: R.somarDias(hojeBV, -10), codigo: 'K7M2QX9A',
        validoAte: umAno, supervisao: 'online' }];
      st.sessao = null;
    }

    function carregar() {
      try { var t = arm && arm.getItem(CHAVE); var s = t ? JSON.parse(t) : null; return s && s.versao === 2 ? s : null; } catch (e) { return null; }
    }

    function reiniciar(semente) {
      st = estadoVazio();
      if (semente !== false) semear();
      salvar();
    }

    st = op.reiniciar ? null : carregar();
    if (!st) reiniciar(op.semente);

    function rpc(nome, args) {
      return Promise.resolve().then(function () {
        if (!Object.prototype.hasOwnProperty.call(H, nome)) {
          return erro('O banco de dados ainda não tem o Vagas sem Caos. Peça para aplicar a migração 20261022120000_vagas (docs/SUPABASE.md).', { bancoDesatualizado: true });
        }
        var r = H[nome](obj(args));
        salvar();
        return clone(r);
      });
    }
    var contaPromessas = {};
    Object.keys(conta).forEach(function (m) {
      contaPromessas[m] = function () {
        var args = arguments;
        return Promise.resolve().then(function () { var r = conta[m].apply(null, args); salvar(); return clone(r); });
      };
    });

    return { rpc: rpc, conta: contaPromessas, estado: function () { return st; }, reiniciar: reiniciar, RPCS: Object.keys(H) };
  }

  var VAGAS_PREVIA = { criarBackend: criarBackend, SENHA_PREVIA: SENHA_PREVIA };
  if (typeof module !== 'undefined' && module.exports) module.exports = VAGAS_PREVIA;
  else root.VAGAS_PREVIA = VAGAS_PREVIA;
})(typeof self !== 'undefined' ? self : this);
