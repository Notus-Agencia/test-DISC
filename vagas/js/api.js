/*
 * Vagas sem Caos — cliente único do site (VAGAS_API). Contrato completo (parâmetros, respostas e mensagens): docs/VAGAS-SPEC.md.
 *
 * Dois adaptadores com os MESMOS métodos, argumentos e respostas:
 *   - Supabase (VAGAS_CONFIG.MODO = 'supabase'): fetch direto nas RPCs (/rest/v1/rpc/<nome>) e no Auth (/auth/v1/...), sem o
 *     supabase-js (páginas leves para celular simples). A sessão (access/refresh token) fica no localStorage ('vagas_sessao') e é
 *     renovada sozinha. As contas são criadas pela Edge Function vagas-conta (/functions/v1/vagas-conta).
 *   - Prévia (VAGAS_CONFIG.MODO = 'previa'): vagas/js/api-previa.js (carregado sob demanda), dados fictícios de Boa Vista neste
 *     navegador, com as mesmas regras e mensagens do banco.
 *
 * Todo método devolve uma Promise que RESOLVE com o JSON {ok:true, ...} da RPC ou REJEITA com Error em português, com:
 *   erro.resposta (o JSON {ok:false, erro, ...}), erro.sessaoExpirada, erro.confirmar (e-mail não confirmado),
 *   erro.bancoDesatualizado (migração não aplicada), erro.conexao (sem internet / servidor fora).
 *
 * Métodos (nome -> RPC; ver METODOS): públicos — cidades, areas, anuncios(filtro), anuncio(codigo), anuncioVista(codigo), listaEspera(dados), listaEsperaSair(dados),
 *   denunciar(dados), referenciasPublicas(token), seloPublico(codigo) (RPC da migração dos testes), versaoBanco; conta — eu,
 *   aceitarTermos(dados), exportarMeusDados; pessoa — minhaPessoa, salvarPessoa(dados), feed(filtro), quero(anuncioId), pular(anuncioId),
 *   retirar(candId), minhasCandidaturas, verEmpresa(candId), combinar(candId), recusar(candId), quemViuMeuContato, cortarAcesso(candId);
 *   empresa — cadastrarEmpresa(dados), salvarEmpresa(empresaId, dados), minhasEmpresas, salvarAnuncio(dados), publicarAnuncio(anuncioId),
 *   acaoAnuncio(anuncioId, acao), anunciosDaEmpresa(empresaId), anuncioNumeros(anuncioId), cartoes(anuncioId, filtro),
 *   decidir(candId, decisao), contatoPessoa(candId), marcarContratada(candId); conversa — conversa(candId),
 *   enviarMensagem(candId, texto, idCliente?), minhasConversas, conversasDaEmpresa(empresaId); referência — oferecerReferencia(dados),
 *   pedirReferencia(dados), conviteReferencia(token), responderReferencia(refId, acao), minhasReferencias, referenciasDaEmpresa(empresaId),
 *   publicarReferencias(ligar); operação — opResumo, opEmpresas(filtro), opEmpresaDecidir(id, acao, motivo), opEmpresaCadastrar(dados),
 *   opVincularMembro(empresaId, email), opAnuncios(filtro), opAnuncioSalvar(dados) (vaga assistida), opAnuncioDecidir(id, acao, motivo), opDenuncias(filtro),
 *   opDenunciaDecidir(id, dados), opModeracao(filtro), opReferencias(filtro), opReferenciaDecidir(id, acao, motivo);
 *   equipe — admCidadeSalvar(dados), admZonaSalvar(dados), admOperadorSalvar(dados).
 * Conta e sessão: cadastrar({email, tipo, nome?, termosVersao?, captcha?}), reenviarConfirmacao(email, captcha?),
 *   esqueciSenha(email, captcha?), cadastroAssistido({email, tipo, cidade, empresaId?, nome?, codigoEvento?}),
 *   convidarOperador({email, cidade, papel, cidadeNome?}), excluirConta(), entrar(email, senha) -> resposta de eu(),
 *   sair(), sessao() -> {ok, usuario:{id, email}}, linkDoEndereco(location) -> {tokenHash, tipo} | null,
 *   confirmarLink({tokenHash, tipo}) -> {ok, tipo, precisaSenha:true}, definirSenha(senha) -> {ok}.
 * Foto OPCIONAL da pessoa (bucket privado 'vagas-fotos' do Storage): enviarFoto(arquivo File/Blob jpg|png|webp ≤ 1 MB) -> {ok, temFoto},
 *   apagarFoto() -> {ok, temFoto:false}, fotoUrl(candidaturaId?) -> {ok, url, expiraEm} (URL assinada de 5 min pela Edge Function:
 *   sem candidatura = a própria; com candidatura = só a empresa daquela candidatura, depois do Combinou). contatoPessoa(candId)
 *   já devolve pessoa.fotoUrl ('' quando não há foto ou não deu para assinar).
 * Testes de habilidade (docs/VAGAS-TESTES.md): testesCatalogo() (público), iniciarTentativa(teste), proximaQuestao(tentativa),
 *   responder(tentativa, numero 1..total, posição mostrada 0..3), registrarSinal(tentativa, 'troca_aba'|'copiar'),
 *   finalizar(tentativa), meusSelos(); a conferência pública é seloPublico(codigo). Na prévia, a prova usa questões de DEMONSTRAÇÃO.
 *
 * No Node (testes): require('./vagas/js/api.js').criar({modo:'supabase', url, chave, fetch, armazenamento, agora}) ou
 *   criar({modo:'previa', backend: require('./vagas/js/api-previa.js').criarBackend({...})}).
 */
(function (root) {
  'use strict';

  var TIMEOUT_MS = 20000;
  var CHAVE_SESSAO = 'vagas_sessao';
  var MSG_CONEXAO = 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.';
  var MSG_DEMORA = 'O servidor demorou demais para responder. Verifique sua conexão e tente novamente.';
  var MSG_SESSAO = 'Sessão expirada. Entre de novo.';
  var MSG_RECUSA = 'O servidor recusou a solicitação.';
  var MSG_BANCO = 'O banco de dados ainda não tem o Vagas sem Caos. Peça para aplicar a migração 20261022120000_vagas (docs/SUPABASE.md).';
  var MSG_LOGIN = 'E-mail ou senha não conferem.';
  var MSG_CONFIRMAR = 'Confirme seu e-mail pelo link que enviamos antes de continuar.';
  var MSG_LINK = 'O link expirou ou já foi usado. Peça outro na tela de entrada.';
  var MSG_SENHA = 'A senha precisa ter de 8 a 72 caracteres.';
  var MSG_MUITAS = 'Muitas tentativas. Tente de novo em alguns minutos.';
  var MSG_FUNCAO = 'O cadastro ainda não está disponível. Tente de novo mais tarde.';
  var MSG_FOTO = 'A foto precisa ser JPG, PNG ou WEBP, com até 1 MB.';
  var MSG_FOTO_FALHA = 'Não foi possível guardar a foto. Tente de novo.';
  var TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
  var LIMITE_FOTO = 1048576;
  var CAMINHO_FOTOS = '/storage/v1/object/vagas-fotos';

  // Método -> RPC. p = nomes dos parâmetros, na ordem dos argumentos. publico = funciona sem login (manda a sessão se houver).
  var METODOS = {
    cidades: { rpc: 'vagas_cidades_publicas', p: [], publico: true },
    areas: { rpc: 'vagas_areas_publicas', p: [], publico: true },
    anuncios: { rpc: 'vagas_anuncios_publicos', p: ['p_filtro'], publico: true },
    anuncio: { rpc: 'vagas_anuncio_publico', p: ['p_codigo'], publico: true },
    anuncioVista: { rpc: 'vagas_anuncio_vista', p: ['p_codigo'], publico: true },
    seloPublico: { rpc: 'vagas_selo_publico', p: ['p_codigo'], publico: true },
    // Testes de habilidade (migração 20261023120000_vagas_testes.sql; contrato em docs/VAGAS-TESTES.md). O catálogo é público
    // (com login traz "minha" em cada teste); o resto é da pessoa logada. Erro de regra vem com {codigo, fim?, podeIniciarEm?}.
    testesCatalogo: { rpc: 'vagas_testes_catalogo', p: [], publico: true },
    iniciarTentativa: { rpc: 'vagas_iniciar_tentativa', p: ['p_teste'] },
    proximaQuestao: { rpc: 'vagas_proxima_questao', p: ['p_tentativa'] },
    responder: { rpc: 'vagas_responder', p: ['p_tentativa', 'p_questao', 'p_alternativa'] },
    registrarSinal: { rpc: 'vagas_registrar_sinal', p: ['p_tentativa', 'p_tipo'] },
    finalizar: { rpc: 'vagas_finalizar', p: ['p_tentativa'] },
    meusSelos: { rpc: 'vagas_meus_selos', p: [] },
    listaEspera: { rpc: 'vagas_lista_espera_entrar', p: ['p_dados'], publico: true },
    listaEsperaSair: { rpc: 'vagas_lista_espera_sair', p: ['p_dados'], publico: true },
    denunciar: { rpc: 'vagas_denunciar', p: ['p_dados'], publico: true },
    referenciasPublicas: { rpc: 'vagas_referencias_publicas', p: ['p_token'], publico: true },
    versaoBanco: { rpc: 'versao_banco', p: [], publico: true },
    eu: { rpc: 'vagas_eu', p: [] },
    aceitarTermos: { rpc: 'vagas_aceitar_termos', p: ['p_dados'] },
    exportarMeusDados: { rpc: 'vagas_exportar_meus_dados', p: [] },
    minhaPessoa: { rpc: 'vagas_pessoa_minha', p: [] },
    salvarPessoa: { rpc: 'vagas_pessoa_salvar', p: ['p_dados'] },
    feed: { rpc: 'vagas_feed', p: ['p_filtro'] },
    quero: { rpc: 'vagas_quero', p: ['p_anuncio'] },
    pular: { rpc: 'vagas_pular', p: ['p_anuncio'] },
    retirar: { rpc: 'vagas_retirar', p: ['p_candidatura'] },
    minhasCandidaturas: { rpc: 'vagas_minhas_candidaturas', p: [] },
    verEmpresa: { rpc: 'vagas_ver_empresa', p: ['p_candidatura'] },
    combinar: { rpc: 'vagas_combinar', p: ['p_candidatura'] },
    recusar: { rpc: 'vagas_recusar', p: ['p_candidatura'] },
    quemViuMeuContato: { rpc: 'vagas_quem_viu_meu_contato', p: [] },
    cortarAcesso: { rpc: 'vagas_cortar_acesso', p: ['p_candidatura'] },
    cadastrarEmpresa: { rpc: 'vagas_empresa_cadastrar', p: ['p_dados'] },
    salvarEmpresa: { rpc: 'vagas_empresa_salvar', p: ['p_empresa', 'p_dados'] },
    minhasEmpresas: { rpc: 'vagas_minhas_empresas', p: [] },
    salvarAnuncio: { rpc: 'vagas_anuncio_salvar', p: ['p_dados'] },
    publicarAnuncio: { rpc: 'vagas_anuncio_publicar', p: ['p_anuncio'] },
    acaoAnuncio: { rpc: 'vagas_anuncio_acao', p: ['p_anuncio', 'p_acao'] },
    anunciosDaEmpresa: { rpc: 'vagas_anuncios_empresa', p: ['p_empresa'] },
    anuncioNumeros: { rpc: 'vagas_anuncio_numeros', p: ['p_anuncio'] },
    cartoes: { rpc: 'vagas_cartoes', p: ['p_anuncio', 'p_filtro'] },
    decidir: { rpc: 'vagas_empresa_decidir', p: ['p_candidatura', 'p_decisao'] },
    contatoPessoa: { rpc: 'vagas_contato_pessoa', p: ['p_candidatura'] },
    marcarContratada: { rpc: 'vagas_marcar_contratada', p: ['p_candidatura'] },
    conversa: { rpc: 'vagas_conversa', p: ['p_candidatura'] },
    enviarMensagem: { rpc: 'vagas_mensagem_enviar', p: ['p_candidatura', 'p_texto', 'p_id'] },
    minhasConversas: { rpc: 'vagas_conversas_minhas', p: [] },
    conversasDaEmpresa: { rpc: 'vagas_conversas_empresa', p: ['p_empresa'] },
    oferecerReferencia: { rpc: 'vagas_referencia_oferecer', p: ['p_dados'] },
    pedirReferencia: { rpc: 'vagas_referencia_pedir', p: ['p_dados'] },
    conviteReferencia: { rpc: 'vagas_referencia_convite', p: ['p_token'] },
    responderReferencia: { rpc: 'vagas_referencia_responder', p: ['p_referencia', 'p_acao'] },
    minhasReferencias: { rpc: 'vagas_referencias_minhas', p: [] },
    referenciasDaEmpresa: { rpc: 'vagas_referencias_empresa', p: ['p_empresa'] },
    publicarReferencias: { rpc: 'vagas_referencias_publicar', p: ['p_ligar'] },
    opResumo: { rpc: 'vagas_op_resumo', p: [] },
    opEmpresas: { rpc: 'vagas_op_empresas', p: ['p_filtro'] },
    opEmpresaDecidir: { rpc: 'vagas_op_empresa_decidir', p: ['p_empresa', 'p_acao', 'p_motivo'] },
    opEmpresaCadastrar: { rpc: 'vagas_op_empresa_cadastrar', p: ['p_dados'] },
    opVincularMembro: { rpc: 'vagas_op_vincular_membro', p: ['p_empresa', 'p_email'] },
    opAnuncios: { rpc: 'vagas_op_anuncios', p: ['p_filtro'] },
    opAnuncioSalvar: { rpc: 'vagas_op_anuncio_salvar', p: ['p_dados'] },
    opAnuncioDecidir: { rpc: 'vagas_op_anuncio_decidir', p: ['p_anuncio', 'p_acao', 'p_motivo'] },
    opDenuncias: { rpc: 'vagas_op_denuncias', p: ['p_filtro'] },
    opDenunciaDecidir: { rpc: 'vagas_op_denuncia_decidir', p: ['p_denuncia', 'p_dados'] },
    opModeracao: { rpc: 'vagas_op_moderacao', p: ['p_filtro'] },
    opReferencias: { rpc: 'vagas_op_referencias', p: ['p_filtro'] },
    opReferenciaDecidir: { rpc: 'vagas_op_referencia_decidir', p: ['p_referencia', 'p_acao', 'p_motivo'] },
    admCidadeSalvar: { rpc: 'vagas_adm_cidade_salvar', p: ['p_dados'] },
    admZonaSalvar: { rpc: 'vagas_adm_zona_salvar', p: ['p_dados'] },
    admOperadorSalvar: { rpc: 'vagas_adm_operador_salvar', p: ['p_dados'] }
  };
  // Valores padrão quando o argumento não vem (as RPCs recebem objeto, nunca null).
  var PADRAO = { p_filtro: {}, p_dados: {}, p_motivo: '', p_id: null };

  function erroDe(json, extra) {
    var e = new Error((json && json.erro) ? String(json.erro) : MSG_RECUSA);
    e.resposta = json || null;
    ['sessaoExpirada', 'confirmar', 'bloqueado', 'suspensa', 'semConta', 'completar', 'naoConfigurado', 'captcha', 'bancoDesatualizado',
      'naoEncontrada', 'listaEspera', 'pausada', 'verEmpresa', 'semCombinou', 'contatoCortado', 'bloqueada', 'aguardar', 'semFoto',
      'linkExpirado', 'existe', 'ativa'].forEach(function (k) {
      if (json && json[k]) e[k] = true;
    });
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  function argumentos(def, args) {
    var o = {};
    def.p.forEach(function (nome, i) {
      var v = args[i];
      if (v === undefined || v === null) v = Object.prototype.hasOwnProperty.call(PADRAO, nome) ? PADRAO[nome] : null;
      o[nome] = v;
    });
    return o;
  }

  // Link do e-mail (?token_hash=…&type=…) lido do endereço atual.
  function linkDoEndereco(loc) {
    var busca = String((loc && loc.search) || '');
    var p = {};
    busca.replace(/^\?/, '').split('&').forEach(function (par) {
      if (!par) return;
      var i = par.indexOf('=');
      var k = decodeURIComponent(i < 0 ? par : par.slice(0, i));
      var v = i < 0 ? '' : decodeURIComponent(par.slice(i + 1).replace(/\+/g, ' '));
      p[k] = v;
    });
    var tipo = p.type;
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(String(p.token_hash || '')) || ['invite', 'recovery', 'magiclink', 'signup', 'email'].indexOf(tipo) < 0) return null;
    return { tokenHash: String(p.token_hash), tipo: tipo };
  }

  // localStorage -> sessionStorage -> memória (a sessão abre mesmo em navegador que bloqueia o armazenamento; na memória ela dura
  // só enquanto a página estiver aberta). Cada chamada tem a sua memória: dois clientes não se misturam.
  function armazenamentoPadrao() {
    var nomes = ['localStorage', 'sessionStorage'];
    for (var i = 0; i < nomes.length; i++) {
      try {
        var s = root[nomes[i]];
        if (s) { s.setItem('vagas.__teste', '1'); s.removeItem('vagas.__teste'); return s; }
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

  // ---------------------------------------------------------------------------------------------------------------
  // Adaptador Supabase (fetch)
  // ---------------------------------------------------------------------------------------------------------------
  function criarSupabase(op) {
    var url = String(op.url || '').replace(/\/+$/, '');
    var chave = String(op.chave || '');
    var buscar = op.fetch || (typeof fetch === 'function' ? function (u, o) { return fetch(u, o); } : null);
    var arm = op.armazenamento === undefined ? armazenamentoPadrao() : op.armazenamento;
    var agora = op.agora || function () { return Date.now(); };
    var limite = op.timeoutMs || TIMEOUT_MS;
    var versaoTermos = op.versaoTermos || '2026-10-13';
    var renovando = null;

    function sessaoGuardada() { return lerJson(arm, CHAVE_SESSAO); }
    function guardarSessao(s) {
      if (!s) { gravarJson(arm, CHAVE_SESSAO, null); return null; }
      var exp = s.expires_at ? Number(s.expires_at) : Math.floor(agora() / 1000) + Number(s.expires_in || 3600);
      var v = { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: exp,
        user: { id: (s.user && s.user.id) || '', email: (s.user && s.user.email) || '' } };
      gravarJson(arm, CHAVE_SESSAO, v);
      return v;
    }

    function pedir(caminho, opcoes) {
      if (!url || !buscar) return Promise.reject(erroDe({ ok: false, erro: MSG_CONEXAO }, { conexao: true }));
      var controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      var expirou = false;
      var o = Object.assign({ method: 'POST' }, opcoes || {});
      if (controle) o.signal = controle.signal;
      var tempo = new Promise(function (_, rej) {
        timer = setTimeout(function () { expirou = true; if (controle) controle.abort(); rej(erroDe({ ok: false, erro: MSG_DEMORA }, { conexao: true })); }, limite);
      });
      return Promise.race([buscar(url + caminho, o), tempo]).then(function (resp) {
        clearTimeout(timer);
        return resp.text().then(function (texto) {
          var json = null;
          try { json = texto ? JSON.parse(texto) : null; } catch (e) { json = null; }
          return { status: resp.status, json: json };
        });
      }, function (err) {
        clearTimeout(timer);
        if (err && err.resposta) throw err;
        throw erroDe({ ok: false, erro: expirou ? MSG_DEMORA : MSG_CONEXAO }, { conexao: true });
      });
    }

    function cabecalhos(token) {
      var h = { apikey: chave, 'Content-Type': 'application/json' };
      if (token) h.Authorization = 'Bearer ' + token;
      return h;
    }

    // Erro do Auth (GoTrue) em português.
    function erroAuth(r) {
      var j = r.json || {};
      var codigo = String(j.error_code || j.code || j.error || '');
      var texto = String(j.msg || j.message || j.error_description || '');
      if (r.status === 429) return erroDe({ ok: false, erro: MSG_MUITAS, bloqueado: true });
      if (/email_not_confirmed/.test(codigo) || /not confirmed/i.test(texto)) return erroDe({ ok: false, erro: MSG_CONFIRMAR, confirmar: true });
      if (/otp_expired|otp_disabled|flow_state/.test(codigo) || /expired|invalid.*(otp|token|link)/i.test(texto)) return erroDe({ ok: false, erro: MSG_LINK, linkExpirado: true });
      if (/weak_password|same_password/.test(codigo) || /password/i.test(texto) && r.status === 422) return erroDe({ ok: false, erro: MSG_SENHA });
      if (/invalid_credentials|invalid_grant/.test(codigo) || /invalid login/i.test(texto)) return erroDe({ ok: false, erro: MSG_LOGIN });
      return erroDe({ ok: false, erro: MSG_RECUSA });
    }

    function renovar(s) {
      if (renovando) return renovando;
      renovando = pedir('/auth/v1/token?grant_type=refresh_token', { headers: cabecalhos(null), body: JSON.stringify({ refresh_token: s.refresh_token }) })
        .then(function (r) {
          renovando = null;
          if (r.status >= 200 && r.status < 300 && r.json && r.json.access_token) return guardarSessao(r.json);
          guardarSessao(null);
          throw erroDe({ ok: false, erro: MSG_SESSAO, sessaoExpirada: true });
        }, function (err) { renovando = null; throw err; });
      return renovando;
    }

    // Token válido (renova se faltar menos de 60 s). obrigatorio=false: sem sessão devolve null.
    function token(obrigatorio) {
      var s = sessaoGuardada();
      if (!s || !s.access_token) {
        if (obrigatorio) return Promise.reject(erroDe({ ok: false, erro: MSG_SESSAO, sessaoExpirada: true }));
        return Promise.resolve(null);
      }
      if (Number(s.expires_at || 0) - 60 > agora() / 1000) return Promise.resolve(s.access_token);
      return renovar(s).then(function (n) { return n.access_token; }, function (err) {
        if (!obrigatorio && err.sessaoExpirada) return null;
        throw err;
      });
    }

    function rpc(nome, args, publico) {
      return token(!publico).then(function (tk) {
        var tentar = function (t, deNovo) {
          return pedir('/rest/v1/rpc/' + nome, { headers: cabecalhos(t), body: JSON.stringify(args || {}) }).then(function (r) {
            var j = r.json;
            if (r.status === 401 && t && !deNovo) {
              var s = sessaoGuardada();
              if (s && s.refresh_token) return renovar(s).then(function (n) { return tentar(n.access_token, true); });
              guardarSessao(null);
              throw erroDe({ ok: false, erro: MSG_SESSAO, sessaoExpirada: true });
            }
            if (r.status === 401) { guardarSessao(null); throw erroDe({ ok: false, erro: MSG_SESSAO, sessaoExpirada: true }); }
            if (r.status === 404 || (j && j.code === 'PGRST202')) throw erroDe({ ok: false, erro: MSG_BANCO, bancoDesatualizado: true });
            if (r.status < 200 || r.status >= 300 || !j) throw erroDe({ ok: false, erro: MSG_RECUSA });
            if (j.ok !== true) {
              if (j.sessaoExpirada) guardarSessao(null);
              throw erroDe(j);
            }
            return j;
          });
        };
        return tentar(tk, false);
      });
    }

    function funcao(corpo, comSessao) {
      return (comSessao ? token(true) : Promise.resolve(null)).then(function (tk) {
        return pedir('/functions/v1/vagas-conta', { headers: cabecalhos(tk), body: JSON.stringify(corpo) }).then(function (r) {
          if (r.status === 404) throw erroDe({ ok: false, erro: MSG_FUNCAO, naoConfigurado: true });
          if (!r.json) throw erroDe({ ok: false, erro: MSG_RECUSA });
          if (r.json.ok !== true) throw erroDe(r.json);
          return r.json;
        });
      });
    }

    var api = {};
    Object.keys(METODOS).forEach(function (m) {
      var def = METODOS[m];
      api[m] = function () { return rpc(def.rpc, argumentos(def, Array.prototype.slice.call(arguments)), !!def.publico); };
    });

    api.cadastrar = function (d) {
      d = d || {};
      return funcao({ acao: 'cadastrar', email: d.email, tipo: d.tipo, nome: d.nome || '', termosVersao: d.termosVersao || versaoTermos, captcha: d.captcha || '' }, false);
    };
    api.reenviarConfirmacao = function (email, captcha) { return funcao({ acao: 'reenviar', email: email, captcha: captcha || '' }, false); };
    api.esqueciSenha = function (email, captcha) { return funcao({ acao: 'esqueci', email: email, captcha: captcha || '' }, false); };
    api.cadastroAssistido = function (d) { return funcao(Object.assign({ acao: 'assistido' }, d || {}), true); };
    api.convidarOperador = function (d) { return funcao(Object.assign({ acao: 'operador' }, d || {}), true); };
    api.excluirConta = function () {
      return funcao({ acao: 'excluir', confirmar: 'EXCLUIR' }, true).then(function (r) { guardarSessao(null); return r; });
    };

    api.entrar = function (email, senha) {
      return pedir('/auth/v1/token?grant_type=password', { headers: cabecalhos(null),
        body: JSON.stringify({ email: String(email || '').trim().toLowerCase(), password: String(senha || '') }) }).then(function (r) {
        if (r.status < 200 || r.status >= 300 || !r.json || !r.json.access_token) throw erroAuth(r);
        guardarSessao(r.json);
        return api.eu();
      });
    };
    api.sair = function () {
      var s = sessaoGuardada();
      guardarSessao(null);
      if (!s || !s.access_token) return Promise.resolve({ ok: true });
      return pedir('/auth/v1/logout', { headers: cabecalhos(s.access_token) }).then(function () { return { ok: true }; }, function () { return { ok: true }; });
    };
    api.sessao = function () {
      return token(true).then(function () {
        var s = sessaoGuardada();
        return { ok: true, usuario: { id: s.user.id, email: s.user.email } };
      });
    };
    api.linkDoEndereco = linkDoEndereco;
    api.confirmarLink = function (link) {
      if (!link || !link.tokenHash) return Promise.reject(erroDe({ ok: false, erro: MSG_LINK, linkExpirado: true }));
      return pedir('/auth/v1/verify', { headers: cabecalhos(null), body: JSON.stringify({ type: link.tipo, token_hash: link.tokenHash }) }).then(function (r) {
        if (r.status < 200 || r.status >= 300 || !r.json || !r.json.access_token) throw erroAuth(r);
        guardarSessao(r.json);
        return { ok: true, tipo: link.tipo, precisaSenha: true };
      });
    };
    api.definirSenha = function (senha) {
      var s = String(senha || '');
      if (s.length < 8 || s.length > 72) return Promise.reject(erroDe({ ok: false, erro: MSG_SENHA }));
      return token(true).then(function (tk) {
        return pedir('/auth/v1/user', { method: 'PUT', headers: cabecalhos(tk), body: JSON.stringify({ password: s }) }).then(function (r) {
          if (r.status < 200 || r.status >= 300) throw erroAuth(r);
          return { ok: true };
        });
      });
    };
    // Foto: grava/apaga direto no Storage com o login da pessoa (as políticas só deixam o próprio <id>/foto.jpg); a URL para ver
    // vem assinada pela Edge Function (o banco confere o Combinou).
    api.enviarFoto = function (arquivo) {
      if (!arquivo || TIPOS_FOTO.indexOf(arquivo.type) < 0 || !(arquivo.size > 0) || arquivo.size > LIMITE_FOTO) {
        return Promise.reject(erroDe({ ok: false, erro: MSG_FOTO }));
      }
      return token(true).then(function (tk) {
        var uid = sessaoGuardada().user.id;
        return pedir(CAMINHO_FOTOS + '/' + uid + '/foto.jpg', { headers: { apikey: chave, Authorization: 'Bearer ' + tk, 'Content-Type': arquivo.type,
          'x-upsert': 'true', 'cache-control': '60' }, body: arquivo }).then(function (r) {
          if (r.status === 413) throw erroDe({ ok: false, erro: MSG_FOTO });
          if (r.status < 200 || r.status >= 300) throw erroDe({ ok: false, erro: MSG_FOTO_FALHA });
          return { ok: true, temFoto: true };
        });
      });
    };
    api.apagarFoto = function () {
      return token(true).then(function (tk) {
        var uid = sessaoGuardada().user.id;
        return pedir(CAMINHO_FOTOS, { method: 'DELETE', headers: cabecalhos(tk), body: JSON.stringify({ prefixes: [uid + '/foto.jpg'] }) }).then(function (r) {
          if (r.status < 200 || r.status >= 300) throw erroDe({ ok: false, erro: MSG_FOTO_FALHA });
          return { ok: true, temFoto: false };
        });
      });
    };
    api.fotoUrl = function (candidaturaId) { return funcao({ acao: 'foto', candidatura: candidaturaId || '' }, true); };
    comFotoNoContato(api);
    api.modo = 'supabase';
    return api;
  }

  // contatoPessoa(candId) devolve também pessoa.fotoUrl (assinada; '' sem foto ou se não der para assinar).
  function comFotoNoContato(api) {
    var contato = api.contatoPessoa;
    api.contatoPessoa = function (candId) {
      return contato(candId).then(function (r) {
        if (!r.pessoa) return r;
        if (!r.pessoa.temFoto) { r.pessoa.fotoUrl = ''; return r; }
        return api.fotoUrl(candId).then(function (f) { r.pessoa.fotoUrl = f.url || ''; return r; }, function () { r.pessoa.fotoUrl = ''; return r; });
      });
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Adaptador prévia: os mesmos métodos sobre o backend de vagas/js/api-previa.js (carregado sob demanda no navegador)
  // ---------------------------------------------------------------------------------------------------------------
  function criarPrevia(op) {
    var pronto = null;
    function backend() {
      if (op.backend) return Promise.resolve(op.backend);
      if (!pronto) {
        pronto = new Promise(function (res, rej) {
          if (root.VAGAS_PREVIA) { res(root.VAGAS_PREVIA.criarBackend({})); return; }
          var doc = root.document;
          if (!doc) { rej(erroDe({ ok: false, erro: MSG_CONEXAO })); return; }
          var s = doc.createElement('script');
          s.src = op.caminhoPrevia || 'js/api-previa.js';
          s.onload = function () { res(root.VAGAS_PREVIA.criarBackend({})); };
          s.onerror = function () { pronto = null; rej(erroDe({ ok: false, erro: MSG_CONEXAO }, { conexao: true })); };
          doc.head.appendChild(s);
        });
      }
      return pronto;
    }
    function resultado(j) {
      if (!j || j.ok !== true) throw erroDe(j);
      return JSON.parse(JSON.stringify(j));
    }
    var api = {};
    Object.keys(METODOS).forEach(function (m) {
      var def = METODOS[m];
      api[m] = function () {
        var args = argumentos(def, Array.prototype.slice.call(arguments));
        return backend().then(function (b) { return b.rpc(def.rpc, args); }).then(resultado);
      };
    });
    ['cadastrar', 'reenviarConfirmacao', 'esqueciSenha', 'cadastroAssistido', 'convidarOperador', 'excluirConta', 'entrar', 'sair', 'sessao',
      'confirmarLink', 'definirSenha', 'apagarFoto', 'fotoUrl'].forEach(function (m) {
      api[m] = function () {
        var args = Array.prototype.slice.call(arguments);
        return backend().then(function (b) { return b.conta[m].apply(null, args); }).then(resultado);
      };
    });
    // Na prévia a foto fica neste navegador (data URL); valida igual ao Storage.
    api.enviarFoto = function (arquivo) {
      if (!arquivo || TIPOS_FOTO.indexOf(arquivo.type) < 0 || !(arquivo.size > 0) || arquivo.size > LIMITE_FOTO) {
        return Promise.reject(erroDe({ ok: false, erro: MSG_FOTO }));
      }
      var ler = typeof FileReader !== 'undefined' && typeof Blob !== 'undefined' && arquivo instanceof Blob
        ? new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result || '')); }; fr.onerror = function () { res(''); }; fr.readAsDataURL(arquivo); })
        : Promise.resolve(typeof arquivo.dataUrl === 'string' ? arquivo.dataUrl : '');
      return Promise.all([backend(), ler]).then(function (x) {
        return x[0].conta.enviarFoto({ tipo: arquivo.type, tamanho: arquivo.size, dataUrl: x[1] });
      }).then(resultado);
    };
    comFotoNoContato(api);
    api.linkDoEndereco = linkDoEndereco;
    api.modo = 'previa';
    return api;
  }

  function criar(op) {
    op = op || {};
    if (op.modo === 'previa') return criarPrevia(op);
    return criarSupabase(op);
  }

  var exportado = { criar: criar, METODOS: METODOS, linkDoEndereco: linkDoEndereco, CHAVE_SESSAO: CHAVE_SESSAO,
    MSG: { CONEXAO: MSG_CONEXAO, SESSAO: MSG_SESSAO, BANCO: MSG_BANCO, LOGIN: MSG_LOGIN, CONFIRMAR: MSG_CONFIRMAR, LINK: MSG_LINK, SENHA: MSG_SENHA } };
  if (typeof module !== 'undefined' && module.exports) { module.exports = exportado; return; }
  var cfg = root.VAGAS_CONFIG || {};
  var atual = (root.document && root.document.currentScript && root.document.currentScript.src) || '';
  root.VAGAS_API = criar({ modo: cfg.MODO === 'supabase' ? 'supabase' : 'previa', url: cfg.SUPABASE_URL, chave: cfg.SUPABASE_ANON_KEY,
    versaoTermos: cfg.VERSAO_TERMOS, caminhoPrevia: atual ? atual.replace(/api\.js(\?.*)?$/, 'api-previa.js') : 'js/api-previa.js' });
  root.VAGAS_API.criar = criar;
  root.VAGAS_API.METODOS = METODOS;
})(typeof self !== 'undefined' ? self : this);
