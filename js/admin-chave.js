/*
 * Chave de acesso do painel (digital ou rosto), só com o Supabase. Duas peças:
 *  - oferecerNaEntrada(campoEmail, aoEntrar): a tela de entrar continua igual (nenhum botão novo). O campo de e-mail ganha
 *    autocomplete="username webauthn" e o navegador oferece a chave na sugestão do campo. Tocou: a função chave-acesso confere a
 *    chave e devolve um token, que vira a MESMA sessão do login por senha (DISC_API.entrarComChave). A senha segue de reserva.
 *  - bloco(): a parte da janela "Segurança" (menu do usuário): criar a chave neste aparelho, a lista dos aparelhos e "Tirar".
 * Usa a SimpleWebAuthn do navegador (assets/vendor/webauthn.js) e DISC_API.chaveAcesso. O nome na tela é sempre "chave de acesso".
 */
(function (root) {
  'use strict';

  function lib() { return root.SimpleWebAuthnBrowser || null; }
  function api() { return root.DISC_API || null; }
  function disponivel() {
    var a = api();
    return !!(lib() && a && a.supabase && typeof a.chaveAcesso === 'function' && typeof a.entrarComChave === 'function');
  }
  function recusada(e) { var n = e && e.name; return n === 'NotAllowedError' || n === 'AbortError'; }

  /* ---------- Entrar ---------- */

  var oferecendo = false;
  var falhas = 0;

  function oferecerNaEntrada(campo, aoEntrar) {
    if (!campo || !disponivel() || oferecendo) return;
    var w = lib();
    Promise.resolve(typeof w.browserSupportsWebAuthnAutofill === 'function' ? w.browserSupportsWebAuthnAutofill() : false).then(function (ok) {
      if (!ok) return null;
      campo.setAttribute('autocomplete', 'username webauthn');
      oferecendo = true;
      return api().chaveAcesso('entrar-opcoes').then(function (o) {
        return w.startAuthentication({ optionsJSON: o, useBrowserAutofill: true });
      }).then(function (resposta) {
        return api().chaveAcesso('entrar', { resposta: resposta });
      }).then(function (r) {
        return api().entrarComChave(r && r.token_hash);
      }).then(function (resp) {
        falhas = 0;
        return aoEntrar(resp);
      });
    }).catch(function (e) {
      // chave que não vale mais, rede fora: a sugestão volta sozinha (até 3 vezes); a senha segue valendo
      if (recusada(e) || ++falhas > 3) return;
      setTimeout(function () { oferecendo = false; if (!campo.closest('[hidden]')) oferecerNaEntrada(campo, aoEntrar); }, 1500);
      return 'novo';
    }).then(function (novo) { if (novo !== 'novo') oferecendo = false; });
  }

  /** Entrou por outro caminho (senha): encerra a sugestão que ficou esperando. */
  function parar() {
    var w = lib();
    try { if (w && w.WebAuthnAbortService) w.WebAuthnAbortService.cancelCeremony(); } catch (e) { /* segue */ }
    oferecendo = false;
  }

  /* ---------- Segurança ---------- */

  function quando(iso) {
    try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function no(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /** O bloco "Chave de acesso" da janela Segurança; some quando o aparelho não tem digital/rosto. */
  function bloco() {
    if (!disponivel()) return null;
    var w = lib();
    var secao = no('section', 'chave');
    secao.hidden = true;
    var criar = no('button', 'botao botao--claro', 'Criar chave de acesso neste aparelho');
    criar.type = 'button';
    criar.id = 'chave-criar';
    var lista = no('ul', 'chave__lista');
    lista.id = 'chave-lista';
    var aviso = no('p', 'chave__aviso t-nota texto-suave');
    aviso.id = 'chave-aviso';
    aviso.setAttribute('role', 'status');
    secao.appendChild(no('h3', 'chave__titulo', 'Chave de acesso'));
    secao.appendChild(no('p', 'texto-medio t-corpo', 'Entre com a digital ou o rosto, sem digitar a senha. Na próxima vez, toque no campo de e-mail e escolha a chave. A senha continua valendo.'));
    secao.appendChild(criar);
    secao.appendChild(lista);
    secao.appendChild(aviso);

    function dizer(t) { aviso.textContent = t || ''; }
    function mostrar(aparelhos) {
      lista.textContent = '';
      (aparelhos || []).forEach(function (a) {
        var li = no('li', 'chave__item');
        var txt = no('span', 'chave__texto');
        txt.appendChild(no('span', 'seminegrito', a.apelido));
        txt.appendChild(no('span', 't-nota texto-suave', 'Criada em ' + quando(a.criado_em) + (a.usado_em ? ' · último uso ' + quando(a.usado_em) : '')));
        var tirar = no('button', 'botao botao--claro botao--pequeno', 'Tirar');
        tirar.type = 'button';
        tirar.setAttribute('data-tirar', String(a.id));
        tirar.setAttribute('aria-label', 'Tirar a chave de acesso de ' + a.apelido);
        li.appendChild(txt);
        li.appendChild(tirar);
        lista.appendChild(li);
      });
    }

    lista.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-tirar]') : null;
      if (!b) return;
      b.disabled = true;
      api().chaveAcesso('tirar', { id: Number(b.getAttribute('data-tirar')) }).then(function (r) {
        mostrar(r.aparelhos); dizer('Chave de acesso tirada.');
      }, function () { b.disabled = false; dizer('Não deu para tirar agora. Tente de novo.'); });
    });

    criar.addEventListener('click', function () {
      criar.disabled = true; dizer('');
      api().chaveAcesso('criar-opcoes').then(function (o) {
        return w.startRegistration({ optionsJSON: o });
      }).then(function (resposta) {
        return api().chaveAcesso('criar', { resposta: resposta });
      }).then(function (r) {
        criar.disabled = false;
        mostrar(r.aparelhos);
        dizer('Chave de acesso criada. Na próxima vez, toque no campo de e-mail e escolha a chave.');
      }).catch(function (x) {
        criar.disabled = false;
        if (recusada(x)) return;
        dizer(x && x.name === 'InvalidStateError' ? 'Este aparelho já tem uma chave de acesso.'
          : x && x.message === 'limite' ? 'Já são 10 aparelhos. Tire um antes de criar outro.'
          : 'Não deu para criar a chave de acesso. Tente de novo. (' + ((x && (x.name || x.message)) || 'erro') + ')');
      });
    });

    var tem = typeof w.platformAuthenticatorIsAvailable === 'function' ? w.platformAuthenticatorIsAvailable() : Promise.resolve(false);
    Promise.resolve(tem).then(function (ok) {
      if (!ok) return;
      secao.hidden = false;
      return api().chaveAcesso('listar').then(function (r) { mostrar(r.aparelhos); });
    }).catch(function () { /* a função ainda não foi publicada: a parte fica escondida ou sem lista */ });
    return secao;
  }

  root.DISC_ADMIN_CHAVE = { oferecerNaEntrada: oferecerNaEntrada, parar: parar, bloco: bloco, disponivel: disponivel };
})(typeof window !== 'undefined' ? window : globalThis);
