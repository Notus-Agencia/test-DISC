/*
 * Vagas sem Caos — entrar.html: entrar, criar conta SEM senha (pessoa; ?tipo=empresa com o cadastro da empresa), esqueci a senha,
 * volta do link do e-mail (todo link cai em "Crie sua senha"), aceite dos termos (conta assistida, convite de operação) e
 * confirmação de e-mail com "Reenviar". Fluxo e textos: docs/VAGAS-TELAS.md §2.5 e §3.1; contrato: docs/VAGAS-SPEC.md §9.
 *
 * Endereço:   entrar.html[?voltar=<página do site>][&tipo=empresa][&motivo=sessao|confirmar][&termos=1][#entrar|#criar|#esqueci]
 *             entrar.html?token_hash=…&type=invite|magiclink|recovery|signup (link do e-mail; o token sai da barra na hora)
 *             entrar.html?convite=<64 hex>[&token_hash=…&type=invite] (convite de equipe da empresa): depois de entrar ou de criar a
 *             senha, o destino é empresa.html?convite=<token> (a tela de aceite é da frente empresa). O convite fica no endereço
 *             quando o token_hash sai, e no aparelho ('vg.entrar.convite' = {token, em}, 7 dias) para a volta do link de confirmação.
 * ?voltar= só aceita página do próprio site (VAGAS_UI.voltarValido); ele é guardado no aparelho ('vg.entrar.voltar') quando a
 * pessoa pede o link, para voltar ao mesmo lugar depois de criar a senha.
 *
 * Gancho da frente empresa: o cadastro da empresa aqui cria só a CONTA (Edge Function, sem senha) e guarda o resto no aparelho em
 * 'vg.rascunho.empresa' = {dados: {cnpj (só dígitos/letras), nomeFantasia, responsavel, email, whatsapp (55+DDD+número ou ''),
 * cidade (slug lembrado ou '')}, em}. Depois do link e da senha a tela vai para empresa.html#inicio: a frente empresa completa
 * o cadastro (razão social, cidade, zona) com VAGAS_API.cadastrarEmpresa e apaga o rascunho.
 *
 * Funções puras (testes): VAGAS_ENTRAR.destinoDe(eu, voltar, cidade, convite) · conviteValido(token) · conviteDaUrl(location, api) ·
 *   enderecoLimpo({empresa, voltar, convite}) · aceiteDaConta(eu) · validarCriar(d) · validarEmpresa(d) · validarNovaSenha(senha, confirmar)
 */
(function (root) {
  'use strict';
  var nodeJs = typeof module !== 'undefined' && module.exports;
  var R = nodeJs ? require('./regras.js') : root.VAGAS_REGRAS;

  // Textos fixos desta tela (docs/VAGAS-TELAS.md §2.5 e §3.1; os de aceite vêm de consentimentos.json).
  var TXT = {
    frase: 'Vagas da sua cidade com habilidade testada. Grátis para quem procura emprego.',
    emailIncompleto: 'Esse e-mail parece incompleto. Confira se tem o ".com" no fim.',
    nome: 'Escreva o seu nome',
    marcar: 'Marque a caixa para continuar',
    semSenha: 'Você cria a senha depois de abrir o link do e-mail.',
    esqueciOk: 'Se esse e-mail tiver conta, o link chega em alguns minutos. Olhe também a caixa de spam.',
    novaSenha: 'Escolha uma senha de 8 a 72 caracteres para entrar no Vagas sem Caos.',
    linkExpirado: 'O link expirou ou já foi usado. Peça outro na tela de entrada.',
    cnpj: 'CNPJ inválido. Confira os 14 números.',
    empresaTitulo: 'Vagas da sua cidade com quem fez o teste da função.',
    empresaApoio: 'Você publica em 5 minutos, recebe cartões sem nome por ordem de chegada e conversa só com quem também quer a vaga. Uma empresa do grupo Gestão sem Caos.',
    empresaNota: 'Sem senha agora: você cria a senha ao abrir o link do e-mail. Depois disso, a operação confere o CNPJ (em geral no mesmo dia útil). Você já pode escrever a vaga enquanto espera.'
  };
  var ESPERA_REENVIO = 60;
  var CHAVE_CONVITE = 'vg.entrar.convite';
  var VALIDADE_CONVITE_MS = 7 * 86400000;

  // ------------------------------------------------------------------------------------------------- lógica pura
  // Token do convite de equipe: 64 hex (mesmo formato de VAGAS_API.conviteDoEndereco). Qualquer outra coisa é ignorada.
  function conviteValido(t) { return typeof t === 'string' && /^[0-9a-fA-F]{64}$/.test(t) ? t.toLowerCase() : ''; }
  function conviteDaUrl(loc, api) {
    if (api && typeof api.conviteDoEndereco === 'function') return conviteValido(api.conviteDoEndereco(loc));
    var m = /[?&]convite=([0-9a-fA-F]{64})(?:&|$)/.exec(String((loc && loc.search) || ''));
    return m ? m[1].toLowerCase() : '';
  }
  // Endereço sem o token_hash do link do e-mail (mantém tipo=empresa, voltar e convite).
  function enderecoLimpo(o) {
    var q = [];
    if (o.empresa) q.push('tipo=empresa');
    if (o.voltar) q.push('voltar=' + encodeURIComponent(o.voltar));
    if (conviteValido(o.convite)) q.push('convite=' + conviteValido(o.convite));
    return 'entrar.html' + (q.length ? '?' + q.join('&') : '');
  }
  function destinoDe(eu, voltar, cidade, convite) {
    var U = root.VAGAS_UI || (nodeJs ? require('./ui.js') : null);
    var cv = conviteValido(convite);
    if (cv && eu && (eu.conta || !eu.admin)) return 'empresa.html?convite=' + cv;   // convite de equipe: a tela de aceite da empresa
    var v = U.voltarValido(voltar, '');
    if (v && !/^entrar\.html/.test(v)) return v;
    var c = eu && eu.conta;
    if (!c) return eu && eu.admin ? 'operador.html#fila' : 'index.html';
    if (c.tipo === 'empresa') return 'empresa.html#inicio';
    if (c.tipo === 'operador') return 'operador.html#fila';
    if (eu.pessoa && !eu.pessoa.completo) return 'eu.html#curriculo/1';
    return cidade ? 'cidade.html?cidade=' + encodeURIComponent(cidade) : 'index.html';
  }
  // Conta criada pela operação (mutirão) ou convite: aceita os termos no 1º acesso, com o texto do tipo de conta.
  function aceiteDaConta(eu) {
    var c = eu && eu.conta;
    if (!c || c.termosVersao) return '';
    return c.tipo === 'empresa' ? 'empresa_cadastro' : c.tipo === 'operador' ? 'operador_contrato' : 'pessoa_cadastro_assistido';
  }
  function validarCriar(d) {
    var e = {};
    var nome = R.limparTexto(d.nome, 120);
    if (nome.length < 2 || nome.length > 60) e.nome = TXT.nome;
    if (!R.normalizarEmail(d.email)) e.email = TXT.emailIncompleto;
    if (!d.termos) e.termos = TXT.marcar;
    return e;
  }
  function validarEmpresa(d) {
    var e = {};
    if (!R.cnpjValido(d.cnpj)) e.cnpj = TXT.cnpj;
    var nome = R.limparTexto(d.nome, 120);
    if (nome.length < 2 || nome.length > 60) e.nome = 'Preencha o nome da empresa';
    if (R.limparTexto(d.responsavel, 120).length < 2) e.responsavel = 'Preencha o seu nome';
    if (!R.normalizarEmail(d.email)) e.email = TXT.emailIncompleto;
    if (String(d.whatsapp || '').trim() && !R.whatsappEmpresaValido(R.normalizarWhatsapp(d.whatsapp))) e.whatsapp = textoFixo('validacao.whatsapp_invalido') || 'WhatsApp inválido.';
    if (!d.termos) e.termos = TXT.marcar;
    return e;
  }
  function validarNovaSenha(senha, confirmar) {
    var s = String(senha || '');
    if (s.length < 8 || s.length > 72) return { campo: 'senha', erro: 'A senha precisa ter de 8 a 72 caracteres.' };
    if (s !== String(confirmar || '')) return { campo: 'confirmar', erro: textoFixo('validacao.senha_diferente') || 'As senhas não são iguais.' };
    return null;
  }
  function textoFixo(c, v) { var T = root.VAGAS_TEXTOS || (nodeJs ? require('./textos.js') : null); return T && T.t ? T.t(c, v) : ''; }
  function mascaraCnpj(v) {
    var c = R.normalizarCnpj(v).slice(0, 14);
    var p = [c.slice(0, 2), c.slice(2, 5), c.slice(5, 8), c.slice(8, 12), c.slice(12, 14)];
    return p[0] + (c.length > 2 ? '.' + p[1] : '') + (c.length > 5 ? '.' + p[2] : '') + (c.length > 8 ? '/' + p[3] : '') + (c.length > 12 ? '-' + p[4] : '');
  }

  // ------------------------------------------------------------------------------------------------- tela
  function iniciar() {
    var U = root.VAGAS_UI;
    var A = root.VAGAS_API;
    var P = root.VAGAS_PECAS;
    var cfg = root.VAGAS_CONFIG || {};
    var el = U.el;
    var app = root.document.getElementById('app');
    var empresa = U.parametro('tipo') === 'empresa';
    var link = A.linkDoEndereco(root.location);
    var senhaPendente = U.armazenamento.ler('vg.entrar.senha');
    // O ?voltar= guardado quando a pessoa pediu o link só vale na volta do link (ou se ela recarregar antes de criar a senha).
    var voltar = U.voltarValido(U.parametro('voltar'), '') || (link || senhaPendente ? U.voltarValido(U.armazenamento.ler('vg.entrar.voltar'), '') : '');
    // Convite de equipe: do endereço (e guardado no aparelho para a volta do link); do aparelho só na volta do link ou com a senha pendente.
    var convite = conviteDaUrl(root.location, A);
    if (convite) U.armazenamento.gravar(CHAVE_CONVITE, { token: convite, em: Date.now() });
    else if (link || senhaPendente) {
      var cg = U.armazenamento.ler(CHAVE_CONVITE);
      convite = cg && typeof cg.em === 'number' && Date.now() - cg.em < VALIDADE_CONVITE_MS ? conviteValido(cg.token) : '';
    }
    var captchaToken = '';
    var emailPendente = '';
    var contagem = null;

    // Tira o token do endereço na hora: um recarregar não reaproveita o link e ele não fica no histórico.
    if (link && root.history && root.history.replaceState) {
      try { root.history.replaceState(null, '', enderecoLimpo({ empresa: empresa, voltar: voltar, convite: convite })); } catch (e) { /* segue */ }
    }

    // --------------------------------------------------------------------------- moldura
    var lado;
    if (empresa) {
      app.className = 'login';
      lado = el('div', { class: 'login__noite moldura-noite' });
      U.trocar(app, [
        el('div', { class: 'login__laranja moldura-laranja' }, [
          el('img', { class: 'logo-gsc logo-gsc--grande', src: 'comum/marca/vsc-logo-preto.svg', alt: 'Vagas sem Caos', width: '240', height: '36' }),
          el('div', {}, [el('p', { class: 'login__titulo' }, TXT.empresaTitulo), el('p', { class: 'login__apoio' }, TXT.empresaApoio),
            el('ol', { class: 'login__passos', 'aria-label': 'Como funciona' }, [
              el('li', { class: 'login__passo login__passo--noite' }, [el('span', { class: 'login__num' }, '1'), el('span', {}, 'Cadastre o CNPJ ou MEI')]),
              el('li', { class: 'login__passo' }, [el('span', { class: 'login__num' }, '2'), el('span', {}, 'Publique a vaga com o salário')]),
              el('li', { class: 'login__passo' }, [el('span', { class: 'login__num' }, '3'), el('span', {}, 'Chame quem interessa para conversar')])])]),
          el('p', { class: 'login__pe' }, 'Já é cliente da consultoria? A gente cadastra para você: fale no WhatsApp da praça.')
        ]),
        lado
      ]);
    } else {
      app.className = 'vg-entrada';
      lado = el('div', { class: 'vg-entrada__lado' });
      U.trocar(app, [
        el('section', { class: 'vg-entrada__moldura moldura-laranja', 'aria-label': 'Vagas sem Caos' }, [
          el('img', { class: 'logo-gsc logo-gsc--grande', src: 'comum/marca/vsc-logo-preto.svg', alt: 'Vagas sem Caos', width: '240', height: '36' }),
          el('p', { class: 'vg-entrada__frase' }, TXT.frase)]),
        lado
      ]);
    }
    function mostrar(conteudo) {
      if (contagem) { clearInterval(contagem); contagem = null; }
      U.trocar(lado, empresa ? el('div', { class: 'login__form' }, conteudo)
        : [el('section', { class: 'caixa surgir' }, conteudo), el('div', { class: 'vg-entrada__golpe' }, P.golpe({ id: 'vg-aviso-golpe' }))]);
      U.focarTitulo(lado);
    }
    function titulo(id, texto) { return el('h1', { id: id, class: empresa ? 'login__h' : 't-titulo', tabindex: '-1' }, texto); }
    function apoio(texto, id) { return el('p', { class: empresa ? 'login__texto' : 'subtitulo', id: id }, texto); }
    function rotulo(paraId, texto, extra) { return el('label', { class: empresa ? 'login__rotulo' : 'campo__rotulo', for: paraId }, [texto, extra ? [' ', el('span', { class: 'obrigatorio' }, extra)] : null]); }
    function campo(id, tipo, atributos) {
      return el('input', Object.assign({ id: id, class: 'entrada', type: tipo }, atributos || {}));
    }
    function grupo(filhos) { return empresa ? filhos : el('div', { class: 'campo' }, filhos); }
    function erroGeral(id) { return el('p', { class: empresa ? 'login__erro' : 'aviso aviso--erro', id: id, role: 'alert', hidden: true }); }
    function mostrarErroGeral(alvo, texto) { alvo.textContent = texto; alvo.hidden = !texto; }
    function botao(id, texto, classe, tipo) { return el('button', { type: tipo || 'submit', class: 'botao botao--grande ' + (classe || (empresa ? 'botao--branco botao--bloco login__botao' : 'botao--laranja')), id: id }, texto); }
    function linkBotao(id, texto, aoClicar) { return el('button', { type: 'button', class: empresa ? 'login__link' : 'botao botao--link', id: id, onclick: aoClicar }, texto); }
    function acoes(filhos) { return empresa ? filhos : el('div', { class: 'acoes' }, filhos); }
    // Texto de aceite com os nomes dos documentos virando link (abre em outra aba para não perder o que foi digitado).
    function textoComLinks(t) {
      var partes = String(t || '').split(/(Termos de uso|Termos para empresas|Aviso de privacidade|Política de privacidade|Contrato de operador local)/);
      return partes.map(function (p) {
        if (/^Termos/.test(p)) return el('a', { href: 'termos.html', target: '_blank', rel: 'noopener' }, p);
        if (/privacidade$/.test(p)) return el('a', { href: 'privacidade.html', target: '_blank', rel: 'noopener' }, p);
        return p;
      });
    }
    function aceite(chave, idCaixa) {
      var a = (root.VAGAS_TEXTOS && root.VAGAS_TEXTOS.consentimentos && root.VAGAS_TEXTOS.consentimentos.aceites[chave]) || {};
      var caixa = el('input', { type: 'checkbox', id: idCaixa });
      return {
        caixa: caixa,
        no: el('div', { class: empresa ? '' : 'consentimento' }, [
          el('label', { class: 'marcar' }, [caixa, el('span', { class: 't-rotulo' }, textoComLinks(a.texto))]),
          a.explicacao && !empresa ? el('p', { class: 'consentimento__explicacao', id: idCaixa + '-explicacao' }, a.explicacao) : null])
      };
    }
    function irPara(url) { U._api.navegar(url); }
    function seguir(eu) {
      var chave = aceiteDaConta(eu);
      if (chave) { telaAceite(eu, chave); return; }
      U.armazenamento.apagar('vg.entrar.voltar');
      U.armazenamento.apagar('vg.entrar.senha');
      U.armazenamento.apagar(CHAVE_CONVITE);
      irPara(destinoDe(eu, voltar, U.cidadeLembrada(), convite));
    }
    function erroDaApi(e, alvo) {
      if (e.sessaoExpirada) { telaEntrar(); return; }
      mostrarErroGeral(alvo, e.message);
    }

    // Turnstile ("não sou robô"), só quando a chave pública estiver em config.js.
    function captcha(alvo) {
      var chave = cfg.TURNSTILE_SITE_KEY;
      if (!chave) return null;
      var caixa = el('div', { id: 'vg-captcha', class: 'vg-captcha' });
      alvo.appendChild(caixa);
      function desenhar() { try { root.turnstile.render(caixa, { sitekey: chave, language: 'pt-BR', callback: function (t) { captchaToken = t; } }); } catch (e) { /* sem captcha */ } }
      if (root.turnstile) desenhar();
      else if (!root.document.getElementById('vg-turnstile')) {
        var s = root.document.createElement('script');
        s.id = 'vg-turnstile';
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.onload = desenhar;
        root.document.head.appendChild(s);
      }
      return caixa;
    }

    // --------------------------------------------------------------------------- entrar
    function segmento(atual) {
      if (empresa) return null;
      return el('div', { class: 'segmento', role: 'group', 'aria-label': 'Entrar ou criar conta' }, [
        el('button', { type: 'button', class: 'segmento__botao', id: 'vg-aba-entrar', 'aria-pressed': atual === 'entrar' ? 'true' : 'false', onclick: telaEntrar }, 'Já tenho conta'),
        el('button', { type: 'button', class: 'segmento__botao', id: 'vg-aba-criar', 'aria-pressed': atual === 'criar' ? 'true' : 'false', onclick: telaCriar }, 'Criar conta')]);
    }
    function telaEntrar(mensagem) {
      if (typeof mensagem !== 'string') mensagem = '';
      var email = campo('vg-entrar-email', 'email', { inputmode: 'email', autocomplete: 'username', placeholder: 'voce@exemplo.com', value: emailPendente || null });
      var senha = campo('vg-entrar-senha', 'password', { autocomplete: 'current-password' });
      var erro = erroGeral('vg-entrar-erro');
      var enviar = botao('vg-entrar-enviar', 'Entrar', empresa ? null : 'botao--principal');
      var form = el('form', { class: empresa ? 'login__form' : 'formulario', id: 'vg-form-entrar', novalidate: true }, [
        grupo([rotulo('vg-entrar-email', 'E-mail'), email]), grupo([rotulo('vg-entrar-senha', 'Senha'), senha]), erro,
        acoes([enviar]), linkBotao('vg-ir-esqueci', 'Esqueci minha senha', telaEsqueci),
        empresa ? linkBotao('vg-emp-ir-cadastro', 'Ainda não tem conta: cadastrar a empresa', telaEmpresa) : null]);
      mostrar([segmento('entrar'), titulo('vg-entrar-titulo', empresa ? 'Entrar na empresa' : 'Entrar na minha conta'),
        mensagem ? el('p', { class: empresa ? 'login__texto' : 'aviso', id: 'vg-entrar-motivo', role: 'status' }, mensagem) : apoio('Use o e-mail e a senha que você criou.'), form]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        mostrarErroGeral(erro, '');
        if (!R.normalizarEmail(email.value)) { U.erroCampo(email, TXT.emailIncompleto); email.focus(); return; }
        U.limparErroCampo(email);
        if (!senha.value) { U.erroCampo(senha, 'Preencha a senha'); senha.focus(); return; }
        U.limparErroCampo(senha);
        U.ocupado(enviar, true, 'Entrando…');
        A.entrar(email.value, senha.value).then(function (eu) { emailPendente = ''; seguir(eu); }, function (e) {
          U.ocupado(enviar, false);
          if (e.confirmar) { emailPendente = R.normalizarEmail(email.value); telaConfirmar(e.message); return; }
          // Erro único de login (não diz se o e-mail existe); falta de internet e excesso de tentativas aparecem como vêm.
          mostrarErroGeral(erro, e.conexao || e.bloqueado ? e.message : (textoFixo('validacao.login_invalido') || 'E-mail ou senha não conferem.'));
        });
      });
    }

    // --------------------------------------------------------------------------- criar conta (pessoa)
    function telaCriar() {
      var nome = campo('vg-criar-nome', 'text', { autocomplete: 'name', placeholder: 'Nome e sobrenome', maxlength: '60' });
      var email = campo('vg-criar-email', 'email', { inputmode: 'email', autocomplete: 'email', placeholder: 'voce@exemplo.com', 'aria-describedby': 'vg-criar-email-ajuda', value: emailPendente || null });
      var termos = aceite('pessoa_cadastro', 'vg-criar-termos');
      var erro = erroGeral('vg-criar-erro');
      var enviar = botao('vg-criar-enviar', 'Criar conta');
      var form = el('form', { class: 'formulario', id: 'vg-form-criar', novalidate: true }, [
        grupo([rotulo('vg-criar-nome', 'Como quer ser chamada(o)', '(obrigatório)'), nome]),
        grupo([rotulo('vg-criar-email', 'E-mail', '(obrigatório)'), email,
          el('span', { class: 'campo__ajuda', id: 'vg-criar-email-ajuda' }, 'É por ele que você entra e recebe os avisos. Não tem e-mail? Peça ajuda no WhatsApp da praça.')]),
        termos.no, erro, acoes([enviar]), el('p', { class: 'vg-entrada__nota' }, TXT.semSenha)]);
      mostrar([segmento('criar'), titulo('vg-criar-titulo', 'Criar minha conta'), apoio('Leva 2 minutos. Depois você monta o currículo em 5 passos, no seu ritmo.'), form]);
      var cap = captcha(form);
      if (cap) form.insertBefore(cap, erro);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        mostrarErroGeral(erro, '');
        var d = { nome: nome.value, email: email.value, termos: termos.caixa.checked };
        var e = validarCriar(d);
        [[nome, 'nome'], [email, 'email'], [termos.caixa, 'termos']].forEach(function (x) { if (e[x[1]]) U.erroCampo(x[0], e[x[1]]); else U.limparErroCampo(x[0]); });
        var primeiro = e.nome ? nome : e.email ? email : e.termos ? termos.caixa : null;
        if (primeiro) { primeiro.focus(); return; }
        U.ocupado(enviar, true, 'Criando…');
        emailPendente = R.normalizarEmail(d.email);
        if (voltar) U.armazenamento.gravar('vg.entrar.voltar', voltar);
        A.cadastrar({ email: emailPendente, tipo: 'pessoa', nome: R.limparTexto(d.nome, 60), termosVersao: termosVersao(), captcha: captchaToken })
          .then(function (r) { telaConfirmar(r.mensagem, r.linkPrevia); }, function (er) { U.ocupado(enviar, false); erroDaApi(er, erro); });
      });
    }
    function termosVersao() {
      var c = root.VAGAS_TEXTOS && root.VAGAS_TEXTOS.consentimentos;
      return (c && c.termosVersao) || cfg.VERSAO_TERMOS || R.VERSAO_TERMOS;
    }

    // --------------------------------------------------------------------------- cadastro da empresa (só a conta; o resto fica no rascunho)
    function telaEmpresa() {
      var guardado = U.armazenamento.ler('vg.rascunho.empresa');
      var g = guardado && guardado.dados ? guardado.dados : {};
      var cnpj = campo('vg-emp-cnpj', 'text', { inputmode: 'numeric', autocomplete: 'off', placeholder: '00.000.000/0001-00', maxlength: '18', value: g.cnpj ? mascaraCnpj(g.cnpj) : null });
      var nome = campo('vg-emp-nome', 'text', { maxlength: '60', autocomplete: 'organization', value: g.nomeFantasia || null });
      var resp = campo('vg-emp-responsavel', 'text', { autocomplete: 'name', maxlength: '60', value: g.responsavel || null });
      var email = campo('vg-emp-email', 'email', { inputmode: 'email', autocomplete: 'username', value: g.email || emailPendente || null });
      var whats = campo('vg-emp-whatsapp', 'tel', { inputmode: 'tel', autocomplete: 'tel', placeholder: '(DDD) 99999-0000', value: g.whatsapp ? String(g.whatsapp).replace(/^55/, '') : null });
      var termos = aceite('empresa_cadastro', 'vg-emp-termos');
      var erro = erroGeral('vg-emp-erro');
      var enviar = botao('vg-emp-cadastrar', 'Cadastrar e confirmar o e-mail');
      cnpj.addEventListener('input', function () { var p = cnpj.selectionStart === cnpj.value.length; cnpj.value = mascaraCnpj(cnpj.value); if (p) cnpj.selectionStart = cnpj.selectionEnd = cnpj.value.length; });
      var form = el('form', { class: 'login__form', id: 'vg-emp-form-cadastro', novalidate: true }, [
        rotulo('vg-emp-cnpj', 'CNPJ'), cnpj, rotulo('vg-emp-nome', 'Nome da empresa como aparece para as pessoas'), nome,
        rotulo('vg-emp-responsavel', 'Seu nome'), resp, rotulo('vg-emp-email', 'E-mail de acesso'), email,
        rotulo('vg-emp-whatsapp', 'WhatsApp da empresa (aparece só depois do Combinou)'), whats,
        termos.no, erro, enviar, linkBotao('vg-emp-ir-entrar', 'Já tenho conta: entrar', telaEntrar),
        el('p', { class: 'login__nota' }, TXT.empresaNota)]);
      mostrar([titulo('vg-emp-titulo', 'Cadastrar empresa'), apoio('Só CNPJ ativo (MEI vale). A operação confere antes de liberar.'), form]);
      var cap = captcha(form);
      if (cap) form.insertBefore(cap, erro);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        mostrarErroGeral(erro, '');
        var d = { cnpj: cnpj.value, nome: nome.value, responsavel: resp.value, email: email.value, whatsapp: whats.value, termos: termos.caixa.checked };
        var e = validarEmpresa(d);
        var campos = [[cnpj, 'cnpj'], [nome, 'nome'], [resp, 'responsavel'], [email, 'email'], [whats, 'whatsapp'], [termos.caixa, 'termos']];
        campos.forEach(function (x) { if (e[x[1]]) U.erroCampo(x[0], e[x[1]]); else U.limparErroCampo(x[0]); });
        var primeiro = campos.filter(function (x) { return e[x[1]]; })[0];
        if (primeiro) { primeiro[0].focus(); return; }
        emailPendente = R.normalizarEmail(d.email);
        U.armazenamento.gravar('vg.rascunho.empresa', { dados: { cnpj: R.normalizarCnpj(d.cnpj), nomeFantasia: R.limparTexto(d.nome, 60),
          responsavel: R.limparTexto(d.responsavel, 60), email: emailPendente, whatsapp: R.normalizarWhatsapp(d.whatsapp), cidade: U.cidadeLembrada() }, em: Date.now() });
        if (voltar) U.armazenamento.gravar('vg.entrar.voltar', voltar);
        U.ocupado(enviar, true, 'Enviando…');
        A.cadastrar({ email: emailPendente, tipo: 'empresa', nome: R.limparTexto(d.responsavel, 60), termosVersao: termosVersao(), captcha: captchaToken })
          .then(function (r) { telaConfirmar(r.mensagem, r.linkPrevia); }, function (er) { U.ocupado(enviar, false); erroDaApi(er, erro); });
      });
    }

    // --------------------------------------------------------------------------- confirme seu e-mail (com reenviar)
    function telaConfirmar(mensagem, linkPrevia) {
      var reenviar = el('button', { type: 'button', class: 'botao ' + (empresa ? 'botao--branco botao--bloco' : 'botao--claro botao--grande'), id: 'vg-reenviar' }, 'Reenviar e-mail');
      var status = el('p', { class: empresa ? 'login__texto' : 'vg-entrada__nota', id: 'vg-reenviar-status', role: 'status', 'aria-live': 'polite' });
      var email = emailPendente ? null : campo('vg-confirmar-email-campo', 'email', { inputmode: 'email', autocomplete: 'email', placeholder: 'voce@exemplo.com' });
      var previa = U.voltarValido(linkPrevia, '');
      mostrar([titulo('vg-confirmar-titulo', 'Confirme seu e-mail'),
        el('section', { id: 'vg-confirmar-email', class: empresa ? 'login__form' : 'vg-pilha' }, [
          el('p', { class: empresa ? 'login__texto' : 'aviso aviso--ok', role: 'status' }, mensagem || textoFixo('avisos.confirme_email', { email: emailPendente })),
          email ? grupo([rotulo('vg-confirmar-email-campo', 'E-mail da conta'), email]) : null,
          previa ? el('div', { class: empresa ? '' : 'aviso', id: 'vg-previa-link' }, [
            el('p', { class: empresa ? 'login__texto' : '' }, 'Prévia: nenhum e-mail sai daqui. Abra o link que o e-mail traria.'),
            el('a', { class: 'botao botao--laranja', id: 'vg-abrir-link-previa', href: previa }, 'Abrir o link (prévia)')]) : null,
          el('div', { class: empresa ? 'login__form' : 'acoes acoes-coluna' }, [reenviar,
            linkBotao('vg-trocar-email', 'Trocar o e-mail', empresa ? telaEmpresa : telaCriar),
            linkBotao('vg-confirmar-entrar', 'Já confirmei: entrar', telaEntrar)]),
          status])]);
      function esperar() {
        var falta = ESPERA_REENVIO;
        reenviar.disabled = true;
        reenviar.textContent = 'Reenviar em ' + falta + ' s';
        contagem = setInterval(function () {
          falta -= 1;
          if (falta <= 0) { clearInterval(contagem); contagem = null; reenviar.disabled = false; reenviar.textContent = 'Reenviar e-mail'; return; }
          reenviar.textContent = 'Reenviar em ' + falta + ' s';
        }, 1000);
      }
      if (mensagem) esperar();
      reenviar.addEventListener('click', function () {
        var alvo = emailPendente || R.normalizarEmail(email && email.value);
        if (!alvo) { if (email) { U.erroCampo(email, TXT.emailIncompleto); email.focus(); } return; }
        U.ocupado(reenviar, true, 'Enviando…');
        A.reenviarConfirmacao(alvo, captchaToken).then(function (r) {
          U.ocupado(reenviar, false);
          status.textContent = r.mensagem || 'Enviado.';
          esperar();
          if (r.linkPrevia && U.voltarValido(r.linkPrevia, '')) telaConfirmar(r.mensagem, r.linkPrevia);
        }, function (e) { U.ocupado(reenviar, false); status.textContent = e.message; });
      });
    }

    // --------------------------------------------------------------------------- esqueci a senha
    function telaEsqueci() {
      var email = campo('vg-esqueci-email', 'email', { inputmode: 'email', autocomplete: 'email', value: emailPendente || null });
      var enviar = botao('vg-esqueci-enviar', 'Enviar o link', empresa ? null : 'botao--principal');
      var ok = el('p', { class: empresa ? 'login__texto' : 'aviso aviso--ok', id: 'vg-esqueci-ok', role: 'status', hidden: true });
      var previa = el('div', { id: 'vg-previa-link', hidden: true });
      var form = el('form', { class: empresa ? 'login__form' : 'formulario', id: 'vg-form-esqueci', novalidate: true }, [
        grupo([rotulo('vg-esqueci-email', 'E-mail'), email]), ok, previa, acoes([enviar]), linkBotao('vg-esqueci-voltar', 'Voltar para entrar', telaEntrar)]);
      mostrar([el('section', { id: 'vg-esqueci' }, [titulo('vg-esqueci-titulo', 'Esqueci a senha'),
        apoio('Digite o e-mail da sua conta. Se ele estiver cadastrado, mandamos um link para criar uma senha nova.'), form])]);
      var cap = captcha(form);
      if (cap) form.insertBefore(cap, ok);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var e = R.normalizarEmail(email.value);
        if (!e) { U.erroCampo(email, TXT.emailIncompleto); email.focus(); return; }
        U.limparErroCampo(email);
        emailPendente = e;
        if (voltar) U.armazenamento.gravar('vg.entrar.voltar', voltar);
        U.ocupado(enviar, true, 'Enviando…');
        A.esqueciSenha(e, captchaToken).then(function (r) {
          ok.textContent = TXT.esqueciOk;
          ok.hidden = false;
          enviar.textContent = 'Enviado';
          enviar.disabled = true;
          setTimeout(function () { U.ocupado(enviar, false); enviar.textContent = 'Enviar o link'; }, ESPERA_REENVIO * 1000);
          var lp = U.voltarValido(r.linkPrevia, '');
          if (lp) {
            U.trocar(previa, [el('p', { class: empresa ? 'login__texto' : 't-nota texto-suave' }, 'Prévia: nenhum e-mail sai daqui. Abra o link que o e-mail traria.'),
              el('a', { class: 'botao botao--laranja', id: 'vg-abrir-link-previa', href: lp }, 'Abrir o link (prévia)')]);
            previa.hidden = false;
          }
        }, function (er) { U.ocupado(enviar, false); ok.hidden = false; ok.className = empresa ? 'login__erro' : 'aviso aviso--erro'; ok.textContent = er.message; });
      });
    }

    // --------------------------------------------------------------------------- volta do link: "Crie sua senha"
    function telaNovaSenha(emailConta) {
      var email = campo('vg-ns-email', 'email', { readOnly: true, value: emailConta || '', autocomplete: 'username' });
      var senha = campo('vg-ns-senha', 'password', { autocomplete: 'new-password', minlength: '8', maxlength: '72', 'aria-describedby': 'vg-ns-ajuda' });
      var conf = campo('vg-ns-confirmar', 'password', { autocomplete: 'new-password', maxlength: '72' });
      var erro = erroGeral('vg-ns-erro');
      var salvar = botao('vg-ns-salvar', 'Salvar senha', empresa ? null : 'botao--laranja');
      var form = el('form', { class: empresa ? 'login__form' : 'formulario', id: 'vg-form-nova-senha', novalidate: true }, [
        grupo([rotulo('vg-ns-email', 'E-mail'), email]),
        grupo([rotulo('vg-ns-senha', 'Senha nova'), senha, el('span', { class: 'campo__ajuda', id: 'vg-ns-ajuda' }, 'De 8 a 72 caracteres. Dica: junte três palavras que você lembra.')]),
        grupo([rotulo('vg-ns-confirmar', 'Repita a senha'), conf]), erro, acoes([salvar])]);
      mostrar([titulo('vg-ns-titulo', 'Crie sua senha'), apoio(TXT.novaSenha), form]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        mostrarErroGeral(erro, '');
        var v = validarNovaSenha(senha.value, conf.value);
        U.limparErroCampo(senha); U.limparErroCampo(conf);
        if (v) { var c = v.campo === 'senha' ? senha : conf; U.erroCampo(c, v.erro); c.focus(); return; }
        U.ocupado(salvar, true, 'Salvando…');
        A.definirSenha(senha.value).then(function () {
          U.armazenamento.apagar('vg.entrar.senha');
          U.anunciar('Senha salva.');
          return A.eu();
        }).then(seguir, function (e) { U.ocupado(salvar, false); erroDaApi(e, erro); });
      });
    }
    function telaLinkExpirado(mensagem) {
      mostrar([titulo('vg-link-titulo', 'Link vencido'),
        el('section', { id: 'vg-link-expirado', class: empresa ? 'login__form' : 'vg-pilha' }, [el('p', { class: empresa ? 'login__texto' : 'aviso aviso--erro', role: 'alert' }, mensagem || TXT.linkExpirado),
          el('div', { class: empresa ? 'login__form' : 'acoes' }, [botao('vg-link-pedir', 'Pedir outro link', empresa ? 'botao--branco botao--bloco' : 'botao--principal', 'button'),
            linkBotao('vg-link-entrar', 'Voltar para entrar', telaEntrar)])])]);
      lado.querySelector('#vg-link-pedir').addEventListener('click', telaEsqueci);
    }

    // --------------------------------------------------------------------------- aceite no 1º acesso (conta assistida, convite)
    function telaAceite(eu, chave) {
      var termos = aceite(chave, 'vg-aceite-termos');
      var erro = erroGeral('vg-aceite-erro');
      var ir = botao('vg-aceite-enviar', 'Continuar', empresa ? null : 'botao--laranja');
      var info = (root.VAGAS_TEXTOS && root.VAGAS_TEXTOS.consentimentos && root.VAGAS_TEXTOS.consentimentos.aceites[chave]) || {};
      var form = el('form', { class: empresa ? 'login__form' : 'formulario', id: 'vg-aceitar-termos', novalidate: true }, [termos.no, erro, acoes([ir])]);
      mostrar([titulo('vg-aceite-titulo', info.titulo || 'Termos de uso'), apoio('Para continuar, leia e aceite. É só desta vez.'), form]);
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (!termos.caixa.checked) { U.erroCampo(termos.caixa, TXT.marcar); termos.caixa.focus(); return; }
        U.limparErroCampo(termos.caixa);
        U.ocupado(ir, true, 'Salvando…');
        A.aceitarTermos({ versao: termosVersao() }).then(function () { return A.eu(); }).then(seguir, function (e) { U.ocupado(ir, false); erroDaApi(e, erro); });
      });
    }

    // --------------------------------------------------------------------------- já entrou
    function telaJaEntrou(eu) {
      var email = eu.conta ? eu.conta.email : '';
      mostrar([titulo('vg-ja-titulo', 'Você já entrou'), el('section', { id: 'vg-ja-entrou', class: empresa ? 'login__form' : 'vg-pilha' }, [
        apoio(email ? 'Conta: ' + email : 'Sua sessão está aberta neste aparelho.'),
        el('div', { class: empresa ? 'login__form' : 'acoes' }, [
          el('button', { type: 'button', class: 'botao botao--grande ' + (empresa ? 'botao--branco botao--bloco' : 'botao--principal'), id: 'vg-ja-continuar', onclick: function () { seguir(eu); } }, 'Continuar'),
          linkBotao('vg-ja-sair', 'Sair e entrar com outra conta', function () { A.sair().then(function () { empresa ? telaEmpresa() : telaEntrar(); }); })])])]);
    }

    // --------------------------------------------------------------------------- começo
    function porHash() {
      var h = (root.location.hash || '').replace(/^#/, '');
      if (h === 'esqueci') telaEsqueci();
      else if (h === 'entrar') telaEntrar();
      else if (h === 'criar') { if (empresa) telaEmpresa(); else telaCriar(); }
    }
    root.addEventListener('hashchange', porHash);
    var motivo = U.parametro('motivo');
    if (link) {
      U.carregando(lado, 'Conferindo o link…');
      A.confirmarLink(link).then(function () {
        return A.sessao().then(function (s) { return s.usuario.email; }, function () { return ''; });
      }).then(function (email) {
        // Marca (com o e-mail) que falta criar a senha: se recarregar antes de salvar, a tela volta aqui só para esta conta.
        U.armazenamento.gravar('vg.entrar.senha', email || '?');
        if (voltar) U.armazenamento.gravar('vg.entrar.voltar', voltar);
        telaNovaSenha(email);
      }, function (e) {
        if (e.linkExpirado) telaLinkExpirado(e.message);
        else U.tratarErro(e, { raiz: lado, aoTentar: function () { root.location.reload(); } });
      });
      return;
    }
    if (motivo === 'confirmar' || U.parametro('confirmar') === '1') { telaConfirmar(''); return; }
    U.carregando(lado);
    A.eu().then(function (eu) {
      if (senhaPendente && eu.conta && (senhaPendente === '?' || senhaPendente === eu.conta.email)) { telaNovaSenha(eu.conta.email); return; }
      if (aceiteDaConta(eu)) { telaAceite(eu, aceiteDaConta(eu)); return; }
      telaJaEntrou(eu);
    }, function () {
      if (motivo === 'sessao') { telaEntrar(textoFixo('avisos.sessao_expirada') || U.MSG.SESSAO); return; }
      var h = (root.location.hash || '').replace(/^#/, '');
      if (h === 'esqueci') telaEsqueci();
      else if (convite && h !== 'criar') telaEntrar();   // quem recebeu o convite e já tem conta: entra e segue para o aceite
      else if (empresa) { if (h === 'entrar') telaEntrar(); else telaEmpresa(); }
      else if (h === 'entrar' || U.parametro('termos') === '1') telaEntrar();
      else telaCriar();
    });
  }

  var VAGAS_ENTRAR = { destinoDe: destinoDe, conviteValido: conviteValido, conviteDaUrl: conviteDaUrl, enderecoLimpo: enderecoLimpo, aceiteDaConta: aceiteDaConta, validarCriar: validarCriar, validarEmpresa: validarEmpresa,
    validarNovaSenha: validarNovaSenha, mascaraCnpj: mascaraCnpj, TXT: TXT, iniciar: iniciar };
  if (nodeJs) module.exports = VAGAS_ENTRAR;
  else { root.VAGAS_ENTRAR = VAGAS_ENTRAR; iniciar(); }
})(typeof self !== 'undefined' ? self : this);
