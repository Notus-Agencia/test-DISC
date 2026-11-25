/*
 * Vagas sem Caos v2 — ADAPTADOR único das telas: window.VSC_API.<metodo>(dados) -> Promise<resposta>.
 *
 * Ordem dos scripts na página: js/config.js, js/v2/contrato.js, js/api.js, js/v2/api-v2.js (o api.js é o cliente de sessão, renovação,
 * erros e envio ao Supabase; este arquivo só traduz os métodos do contrato). Contrato: vagas/js/v2/contrato.js.
 *
 * Modo 'supabase' (VAGAS_CONFIG.MODO): cada método vira
 *   rpc  -> POST /rest/v1/rpc/<rpc>  com {p_dados: dados}  (a sessão vai junto; método com login:true sem sessão rejeita com
 *           erro.sessaoExpirada = true);
 *   edge -> POST /functions/v1/vagas-conta com {acao, ...dados}.
 * Resposta {ok:false, ...} vira Error em português (erro.resposta, erro.codigo e as marcas do api.js: conexao, sessaoExpirada,
 * bancoDesatualizado, bloqueado, captcha...). Nenhum arquivo de previa/ é carregado.
 *
 * Modo 'previa' (demonstração fictícia, só fora do domínio oficial com ?previa=1): cada método vai para
 * window.VSC_PREVIA_METODOS[metodo], preenchido por js/v2/previa/pessoa.js e empresa.js. Os arquivos da prévia são carregados SOB
 * DEMANDA por VSC_API.pronto (dados.js, dados-mais.js e, conforme <meta name="vsc-previa" content="pessoa|empresa">, pessoa.js e/ou
 * empresa.js). Método ausente: Error "Esta função não existe na demonstração.". Espera simulada: VAGAS_CONFIG.PREVIA_LATENCIA (ms).
 * Com VAGAS_CONFIG.PREVIA_VALIDAR = true cada resposta é conferida com VSC_CONTRATO.validar.
 *
 * Também: VSC_API.modo, VSC_API.pronto, VSC_API.sessao() -> {user} | null (síncrono), VSC_API.sair(), VSC_API.curriculoEnviar({arquivo}),
 * VSC_API.verificacaoDocumentoEnviar({empresaId, arquivo}) (também em VSC_API.uploads.*), VSC_API.aoResponder(fn).
 * Dados pessoais guardados no aparelho pelas telas devem usar chaves 'vsc.eu.*' (pessoa) ou 'vsc.emp.*' (empresa): saem sozinhas ao
 * sair ou ao entrar com outra conta.
 *
 * No Node (testes): require('./vagas/js/v2/api-v2.js').criar({modo, config, url, chave, fetch, armazenamento, agora, documento, previaMetodos, nucleo}).
 */
(function (root) {
  'use strict';

  var CHAVE_SESSAO = 'vagas_sessao';
  var PREFIXOS_PESSOAIS = ['vsc.eu.', 'vsc.emp.'];
  var MSG_SEM_METODO = 'Esta função não existe na demonstração.';
  var MSG_SESSAO = 'Sessão expirada. Entre de novo.';
  var MSG_CONEXAO = 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.';
  var MSG_API = 'O Vagas sem Caos não carregou direito. Atualize a página e tente de novo.';
  var MSG_ARQUIVO_VAZIO = 'Escolha um arquivo.';
  var MSG_ARQUIVO_GRANDE = 'O arquivo passa de 10 MB. Escolha um arquivo menor.';
  var MSG_ARQUIVO_FALHA = 'Não foi possível guardar o arquivo. Tente de novo.';
  var MSG_EMPRESA = 'Empresa não encontrada.';
  var MSG_TIPO = {
    curriculoEnviar: 'O currículo precisa ser PDF, Word, JPG, PNG ou HEIC.',
    verificacaoDocumentoEnviar: 'O documento precisa ser PDF, JPG ou PNG.'
  };
  var MARCAS = ['sessaoExpirada', 'confirmar', 'bloqueado', 'suspensa', 'semConta', 'naoConfigurado', 'captcha', 'bancoDesatualizado', 'naoEncontrada',
    'aguardar', 'existe', 'conexao'];
  var EXTENSAO = { 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heic' };
  var TIPO_POR_EXTENSAO = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif' };
  var ARQUIVOS_PREVIA = ['dados.js', 'dados-mais.js'];
  var RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function carregar(nome) {
    if (typeof module !== 'undefined' && module.exports) return require(nome);
    return null;
  }
  var CONTRATO_NODE = carregar('./contrato.js');

  function erroDe(json, extra) {
    var e = new Error(json && json.erro ? String(json.erro) : 'O servidor recusou a solicitação.');
    e.resposta = json || null;
    if (json && json.codigo) e.codigo = String(json.codigo);
    MARCAS.forEach(function (k) { if (json && json[k]) e[k] = true; });
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  // Erro que veio do api.js (já tem .resposta e as marcas): só acrescenta o código.
  function decorar(e) {
    if (e && e.resposta && e.resposta.codigo && !e.codigo) e.codigo = String(e.resposta.codigo);
    throw e;
  }

  function uuidNovo() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // localStorage -> sessionStorage -> memória (quem bloqueia o armazenamento ainda usa o site enquanto a página estiver aberta).
  function armazenamentoPadrao() {
    var nomes = ['localStorage', 'sessionStorage'];
    for (var i = 0; i < nomes.length; i++) {
      try {
        var s = root[nomes[i]];
        if (s) { s.setItem('vsc.__teste', '1'); s.removeItem('vsc.__teste'); return s; }
      } catch (e) { /* bloqueado: tenta o próximo */ }
    }
    var m = {};
    return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } };
  }

  function lerJson(arm, chave) {
    try { var t = arm && arm.getItem(chave); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }
  function gravarJson(arm, chave, v) {
    try { if (!arm) return; if (v === null) arm.removeItem(chave); else arm.setItem(chave, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ }
  }

  // Tira do aparelho os dados pessoais das telas ('vsc.eu.*' e 'vsc.emp.*').
  function limparPessoais(armazenamentos) {
    armazenamentos.forEach(function (a) {
      try {
        if (!a || typeof a.key !== 'function') return;
        var ks = [];
        for (var i = 0; i < a.length; i++) ks.push(a.key(i));
        ks.forEach(function (k) {
          if (PREFIXOS_PESSOAIS.some(function (p) { return k.indexOf(p) === 0; })) a.removeItem(k);
        });
      } catch (e) { /* bloqueado */ }
    });
  }

  function tipoDoArquivo(arquivo) {
    var t = String((arquivo && arquivo.type) || '').toLowerCase();
    if (t === 'image/jpg') t = 'image/jpeg';
    if (t && t !== 'application/octet-stream') return t;
    var m = /\.([A-Za-z0-9]{2,5})$/.exec(String((arquivo && arquivo.name) || ''));
    return (m && TIPO_POR_EXTENSAO[m[1].toLowerCase()]) || '';
  }

  function nomeDoArquivo(arquivo, tipo) {
    var n = String((arquivo && arquivo.name) || '').replace(/^.*[\\/]/, '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
    return (n || 'arquivo.' + EXTENSAO[tipo]).slice(0, 120);
  }

  function criar(op) {
    op = op || {};
    var cfg = op.config || root.VAGAS_CONFIG || {};
    var contrato = op.contrato || CONTRATO_NODE || root.VSC_CONTRATO;
    var modo = op.modo === 'previa' ? 'previa' : 'supabase';
    var METODOS = contrato.METODOS;
    var UPLOADS = contrato.UPLOADS;
    var api = {};
    var arm = op.armazenamento === undefined ? null : op.armazenamento;
    var nucleoCache = op.nucleo || null;

    // ---------- núcleo do api.js (sessão, renovação, erros) ----------
    function nucleo() {
      if (nucleoCache) return nucleoCache;
      var legado = typeof module !== 'undefined' && module.exports ? require('../api.js') : root.VAGAS_API;
      var n = null;
      if (legado && typeof legado.criar === 'function' && !legado._nucleo) {
        n = legado.criar({ modo: 'supabase', url: op.url || cfg.SUPABASE_URL, chave: op.chave || cfg.SUPABASE_ANON_KEY, fetch: op.fetch,
          armazenamento: op.armazenamento, agora: op.agora, versaoTermos: cfg.VERSAO_TERMOS })._nucleo;
      } else if (legado) {
        n = legado._nucleo;
      }
      if (!n) throw erroDe({ ok: false, erro: MSG_API });
      nucleoCache = n;
      return n;
    }
    function armazem() {
      if (modo === 'supabase') { try { return nucleo().armazenamento; } catch (e) { return null; } }
      if (!arm) arm = armazenamentoPadrao();
      return arm;
    }
    function aparelhos() {
      var lista = [armazem()];
      ['localStorage', 'sessionStorage'].forEach(function (n) { try { if (root[n]) lista.push(root[n]); } catch (e) { /* bloqueado */ } });
      return lista.filter(function (a, i) { return a && lista.indexOf(a) === i; });
    }

    // ---------- sessão ----------
    function sessaoGuardada() { return lerJson(armazem(), CHAVE_SESSAO); }
    function guardarSessao(s) {
      var antes = sessaoGuardada();
      var idAntes = (antes && antes.user && antes.user.id) || '';
      if (modo === 'supabase') {
        var n = nucleo();
        var r = n.guardarSessao(s);
        if (!s || (idAntes && s.user && s.user.id && s.user.id !== idAntes)) limparPessoais(aparelhos());
        return r;
      }
      if (!s) { gravarJson(armazem(), CHAVE_SESSAO, null); if (antes) limparPessoais(aparelhos()); return null; }
      var v = { access_token: s.access_token || '', refresh_token: s.refresh_token || '', expires_at: Number(s.expires_at) || Math.floor(Date.now() / 1000) + 3600,
        user: { id: (s.user && s.user.id) || '', email: (s.user && s.user.email) || '' } };
      if (idAntes && v.user.id && v.user.id !== idAntes) limparPessoais(aparelhos());
      gravarJson(armazem(), CHAVE_SESSAO, v);
      return v;
    }
    api.sessao = function () {
      var s = sessaoGuardada();
      return s && s.access_token && s.user ? { user: { id: s.user.id, email: s.user.email } } : null;
    };
    api.sair = function () {
      var s = sessaoGuardada();
      guardarSessao(null);
      limparPessoais(aparelhos());
      if (modo !== 'supabase' || !s || !s.access_token) return Promise.resolve({ ok: true });
      var n = nucleo();
      var feito = function () { return { ok: true }; };
      return n.pedir('/auth/v1/logout', { headers: n.cabecalhos(s.access_token) }).then(feito, feito);
    };
    api.aoResponder = function (fn) { try { var n = nucleo(); if (n.aoResponder) n.aoResponder(fn); } catch (e) { /* sem núcleo: sem aviso */ } };

    // ---------- modo prévia ----------
    function esperar(ms) { return ms > 0 ? new Promise(function (res) { setTimeout(res, ms); }) : Promise.resolve(); }
    function metodosPrevia() { return op.previaMetodos || root.VSC_PREVIA_METODOS || {}; }

    function carregarPrevia() {
      if (op.previaMetodos) return Promise.resolve();
      var doc = op.documento || root.document;
      if (!doc) return Promise.reject(erroDe({ ok: false, erro: MSG_CONEXAO }, { conexao: true }));
      var base = op.baseUrlPrevia || '';
      if (!base && doc.currentScript && doc.currentScript.src) base = doc.currentScript.src.replace(/api-v2\.js(\?.*)?$/, 'previa/');
      if (!base) base = 'js/v2/previa/';
      function quais() {
        var meta = doc.querySelector('meta[name="vsc-previa"]');
        var quer = meta ? String(meta.getAttribute('content') || '').toLowerCase() : '';
        var lista = ARQUIVOS_PREVIA.slice();
        if (/pessoa/.test(quer)) lista.push('pessoa.js');
        if (/empresa/.test(quer)) lista.push('empresa.js');
        return lista;
      }
      function injetar(arquivo) {
        return new Promise(function (res, rej) {
          if (doc.querySelector('script[src$="previa/' + arquivo + '"]')) { res(); return; }
          var s = doc.createElement('script');
          s.src = base + arquivo;
          s.onload = function () { res(); };
          s.onerror = function () { rej(erroDe({ ok: false, erro: MSG_CONEXAO }, { conexao: true })); };
          doc.head.appendChild(s);
        });
      }
      function sequencia() { return quais().reduce(function (p, a) { return p.then(function () { return injetar(a); }); }, Promise.resolve()); }
      if (doc.readyState === 'loading' && typeof doc.addEventListener === 'function') {
        return new Promise(function (res) { doc.addEventListener('DOMContentLoaded', function () { res(); }); }).then(sequencia);
      }
      return sequencia();
    }

    function conferirPrevia(nome, r) {
      if (!r || typeof r !== 'object') throw new Error('Demonstração fora do contrato em ' + nome + ': sem resposta.');
      if (r.ok === false) throw erroDe(r);
      if (cfg.PREVIA_VALIDAR && contrato.validar && METODOS[nome]) {
        var p;
        try { p = contrato.validar(nome, r); } catch (e) { p = [String(e && e.message ? e.message : e)]; }
        if (p.length) throw new Error('Demonstração fora do contrato em ' + nome + ': ' + p.join('; '));
      }
      return JSON.parse(JSON.stringify(r));
    }

    function previa(nome, dados) {
      return api.pronto.then(function () {
        var f = metodosPrevia()[nome];
        if (typeof f !== 'function') throw new Error(MSG_SEM_METODO);
        return esperar(cfg.PREVIA_LATENCIA === undefined ? 120 : Number(cfg.PREVIA_LATENCIA) || 0).then(function () { return f(dados, { modo: 'previa' }); });
      }).then(function (r) { return conferirPrevia(nome, r); });
    }

    // ---------- modo supabase ----------
    function supabase(nome, dados) {
      var def = METODOS[nome];
      var n = nucleo();
      if (def.rpc) return n.rpc(def.rpc, { p_dados: dados }, !def.login);
      return n.funcao(Object.assign({}, dados, { acao: def.edge }), def.login ? true : false);
    }

    // Entrar por código: a sessão vem da função; é guardada como o api.js guarda (e renovada por ele) e os tokens não voltam à tela.
    function sessaoDaResposta(r) {
      var s = guardarSessao(r.sessao);
      return { ok: true, novaConta: !!r.novaConta, tipo: r.tipo || '', sessao: { user: { id: s.user.id, email: s.user.email } } };
    }

    function chamar(nome, dados) {
      dados = dados && typeof dados === 'object' && !Array.isArray(dados) ? dados : {};
      if (modo === 'previa') {
        return previa(nome, dados).then(function (r) { return nome === 'codigoConfirmar' && r.sessao ? sessaoDaResposta(r) : r; });
      }
      var corpo = nome === 'codigoConfirmar' ? Object.assign({}, dados, { termosVersao: cfg.VERSAO_TERMOS || '' }) : dados;
      var p;
      try { p = supabase(nome, corpo); } catch (e) { return Promise.reject(e); }
      return p.then(function (r) { return nome === 'codigoConfirmar' ? sessaoDaResposta(r) : r; }).catch(decorar);
    }

    Object.keys(METODOS).forEach(function (nome) {
      api[nome] = function (dados) { return chamar(nome, dados); };
    });

    // ---------- envio de arquivos ----------
    function validarArquivo(nome, dados) {
      var def = UPLOADS[nome];
      var arquivo = dados && dados.arquivo;
      if (!arquivo || !(arquivo.size > 0)) throw erroDe({ ok: false, erro: MSG_ARQUIVO_VAZIO });
      var tipo = tipoDoArquivo(arquivo);
      if (def.tipos.indexOf(tipo) < 0) throw erroDe({ ok: false, erro: MSG_TIPO[nome] });
      if (arquivo.size > def.max) throw erroDe({ ok: false, erro: MSG_ARQUIVO_GRANDE });
      if (nome === 'verificacaoDocumentoEnviar' && !RE_UUID.test(String(dados.empresaId || ''))) throw erroDe({ ok: false, erro: MSG_EMPRESA });
      return { def: def, arquivo: arquivo, tipo: tipo, nome: nomeDoArquivo(arquivo, tipo), tamanhoKb: Math.max(1, Math.ceil(arquivo.size / 1024)) };
    }

    function registro(nome, v, dados, caminho) {
      return nome === 'curriculoEnviar'
        ? api.curriculoGuardar({ caminho: caminho, nome: v.nome, tamanhoKb: v.tamanhoKb, tipo: v.tipo })
        : api.verificacaoDocumento({ empresaId: dados.empresaId, caminho: caminho, nome: v.nome, tipo: v.tipo });
    }

    function enviarPrevia(nome, v, dados) {
      var f = metodosPrevia()[nome];
      if (typeof f !== 'function') return registro(nome, v, dados, 'previa/' + uuidNovo() + '.' + EXTENSAO[v.tipo]);
      return previa(nome, { arquivo: v.arquivo, nome: v.nome, tamanhoKb: v.tamanhoKb, tipo: v.tipo, empresaId: dados.empresaId });
    }

    function enviarSupabase(nome, v, dados) {
      var n = nucleo();
      return n.token(true).then(function (tk) {
        var prefixo = nome === 'curriculoEnviar' ? n.sessaoGuardada().user.id : String(dados.empresaId).toLowerCase();
        var caminho = prefixo + '/' + uuidNovo() + '.' + EXTENSAO[v.tipo];
        var rota = '/storage/v1/object/' + v.def.bucket + '/' + caminho;
        return n.pedir(rota, { headers: { apikey: n.chave, Authorization: 'Bearer ' + tk, 'Content-Type': v.tipo, 'x-upsert': 'false', 'cache-control': '3600' },
          body: v.arquivo }).then(function (r) {
          if (r.status === 401) throw erroDe({ ok: false, erro: MSG_SESSAO, sessaoExpirada: true });
          if (r.status === 413) throw erroDe({ ok: false, erro: MSG_ARQUIVO_GRANDE });
          if (r.status < 200 || r.status >= 300) throw erroDe({ ok: false, erro: MSG_ARQUIVO_FALHA });
          return registro(nome, v, dados, caminho).catch(function (e) {
            // O arquivo subiu e o registro falhou: tenta tirar o arquivo solto do armazenamento (se não der, o banco limpa depois).
            var tira = function () { throw e; };
            return n.pedir('/storage/v1/object/' + v.def.bucket, { method: 'DELETE', headers: n.cabecalhos(tk), body: JSON.stringify({ prefixes: [caminho] }) }).then(tira, tira);
          });
        });
      });
    }

    function enviar(nome, dados) {
      var v;
      try { v = validarArquivo(nome, dados || {}); } catch (e) { return Promise.reject(e); }
      return (modo === 'previa' ? enviarPrevia(nome, v, dados) : enviarSupabase(nome, v, dados)).catch(decorar);
    }
    api.curriculoEnviar = function (dados) { return enviar('curriculoEnviar', dados); };
    api.verificacaoDocumentoEnviar = function (dados) { return enviar('verificacaoDocumentoEnviar', dados); };
    api.uploads = { curriculoEnviar: api.curriculoEnviar, verificacaoDocumentoEnviar: api.verificacaoDocumentoEnviar };

    api.modo = modo;
    api.CHAVE_SESSAO = CHAVE_SESSAO;
    api.PREFIXOS_PESSOAIS = PREFIXOS_PESSOAIS;
    api.pronto = modo === 'previa' ? carregarPrevia() : Promise.resolve();
    api.pronto.catch(function () { /* quem espera por "pronto" recebe o erro; aqui só não vira aviso solto */ });
    return api;
  }

  var exportado = { criar: criar, CHAVE_SESSAO: CHAVE_SESSAO, PREFIXOS_PESSOAIS: PREFIXOS_PESSOAIS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = exportado; return; }
  var cfg = root.VAGAS_CONFIG || {};
  var atual = root.document && root.document.currentScript;
  var base = atual && atual.src ? atual.src.replace(/api-v2\.js(\?.*)?$/, 'previa/') : '';
  root.VSC_API = criar({ modo: cfg.MODO === 'previa' ? 'previa' : 'supabase', config: cfg, baseUrlPrevia: base || undefined });
  root.VSC_API.criar = criar;
})(typeof self !== 'undefined' ? self : this);
