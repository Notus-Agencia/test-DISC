/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · tela "Entrar": e-mail -> código de 6 números -> pronto. Sem senha.
 * Primeira vez? A conta nasce quando o código é confirmado; os dados (nome, WhatsApp, currículo) vêm quando a pessoa se candidata.
 */
(function (root) {
  'use strict';
  const P = root.VSC_P, { $, esc, ic } = P, cod = P.codigo;
  let ENT = { passo: 'campo', destino: '', mascarado: '', erro: '' };

  P.telas.entrar = function () {
    if (P.est.conta) {
      return `<div class="pagina estreita"><div class="vazio">${ic('check')}<b>Você já entrou</b><p>${esc(P.est.conta.nome || P.est.conta.email)}</p><a class="btn" href="#/candidaturas">Ver candidaturas</a></div></div>`;
    }
    if (ENT.passo === 'codigo') {
      return `<div class="pagina estreita"><div class="cab-pagina"><h1>Digite o código</h1><p>Mandamos um código de 6 números para <b class="num">${esc(ENT.mascarado)}</b>. Olhe também a caixa de spam.</p></div>` +
        `${cod.html('ent')}<p class="mt4"><button class="link" type="button" data-acao="entrar-trocar">Trocar o e-mail</button></p>` +
        '<label class="chave mt16 larg-360" for="lembrar"><span>Lembrar neste celular<small>Na próxima vez, entra sem código</small></span><input type="checkbox" id="lembrar" checked><span class="chave-trilho" aria-hidden="true"></span></label>' +
        '<div class="mt20 larg-360"><button class="btn grande largo" type="button" data-acao="conferir-codigo" data-codigo="ent">Entrar</button></div></div>';
    }
    return `<div class="pagina estreita"><div class="cab-pagina"><h1>Entrar</h1><p>Sem senha. Mandamos um código para o seu e-mail.</p></div>` +
      '<form class="pilha larg-420" data-form="entrar" novalidate>' +
      '<div class="campo"><label for="ent-destino">Seu e-mail</label>' +
      `<input class="entrada" id="ent-destino" name="destino" type="email" autocomplete="email" inputmode="email" placeholder="seu@email.com" value="${esc(ENT.destino)}"${ENT.erro ? ' aria-invalid="true" aria-describedby="ent-erro"' : ''}>` +
      `<p class="erro-campo" id="ent-erro"${ENT.erro ? '' : ' hidden'}>${ic('erro')}<span>${esc(ENT.erro)}</span></p></div>` +
      '<button class="btn grande largo" type="submit">Receber código</button></form>' +
      '<p class="detalhe mt16 larg-420">Primeira vez? Sua conta é criada quando você se candidata ou cria um alerta. O código vai só por e-mail.</p></div>';
  };
  P.depois.entrar = () => {
    if (ENT.passo === 'codigo' && !P.est.conta) { cod.contar('ent', ENT.segundos || 30); cod.foco('ent'); }
  };
  P.formularios.entrar = async function (f) {
    const email = (f.querySelector('[name="destino"]').value || '').trim().toLowerCase(), campo = $('#ent-destino'), erro = $('#ent-erro');
    if (!P.emailOk(email)) {
      ENT.destino = email; erro.hidden = false; erro.querySelector('span').textContent = 'Escreva um e-mail válido, como seu@email.com.';
      campo.setAttribute('aria-invalid', 'true'); campo.focus(); return;
    }
    const botao = f.querySelector('button[type="submit"]');
    botao.disabled = true;
    try {
      const r = await cod.pedir('ent', email, { aoOk: aoEntrar });
      ENT = { passo: 'codigo', destino: email, mascarado: r.destinoMascarado || P.emailEscondido(email), erro: '', segundos: r.reenviarEmSeg || 30 };
      P.render({ manter: true });
    } catch (e) {
      botao.disabled = false;
      erro.hidden = false; erro.querySelector('span').textContent = P.msgErro(e);
      campo.setAttribute('aria-invalid', 'true'); campo.focus();
    }
  };
  async function aoEntrar() {
    ENT = { passo: 'campo', destino: '', mascarado: '', erro: '' };
    P.toast('Você entrou.');
    P.ir(P.entrarVolta || '#/candidaturas');
    P.entrarVolta = '';
  }
  cod.lembrar = true;
  P.acoes['entrar-trocar'] = () => { ENT.passo = 'campo'; P.render({ manter: true }); };
  // "Lembrar neste celular" é lido do interruptor da tela no momento de confirmar
  const confere = cod.conferir;
  cod.conferir = function (k) { if (k === 'ent') { const l = $('#lembrar'); cod.lembrar = l ? l.checked : true; } else cod.lembrar = true; return confere(k); };
})(typeof self !== 'undefined' ? self : this);
