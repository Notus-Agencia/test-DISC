/*
 * Vagas sem Caos — currículo em 5 passos (eu.html#curriculo/1…5), docs/VAGAS-TELAS.md §2.6, mockups pessoa-curriculo-2/5.
 * 1 Onde (cidades, zona, foto opcional) · 2 Áreas e experiência · 3 Escolaridade, cursos e CNH · 4 Disponibilidade e contato ·
 * 5 Revisar (o cartão cego exato, peça VAGAS_PECAS.cartaoCego, sem foto e sem nome) + banco de talentos.
 * Rascunho no aparelho a cada mudança (vg.rascunho.curriculo, só da mesma conta). Salva no banco a cada passo quando o currículo
 * já está completo (vagas_pessoa_salvar é idempotente) e no fim. Com um "Quero" guardado pela página da vaga, ao salvar volta para
 * a vaga, que envia a candidatura sozinha (contrato da casca em vaga.js) e mostra "Candidatura enviada".
 * A foto vai direto para o armazenamento (reduzida no aparelho para 512 px), com o aceite separado foto_opcional.
 */
(function (root) {
  'use strict';
  var TELAS = root.VAGAS_EU_TELAS = root.VAGAS_EU_TELAS || {};
  var doc = root.document;
  var NOMES = ['', 'Onde', 'Áreas e experiência', 'Escolaridade e cursos', 'Disponibilidade e contato', 'Revisar'];
  var TITULOS = ['', 'Onde você quer trabalhar?', 'Em que áreas você quer trabalhar?', 'Até onde você estudou?', 'Quando você pode trabalhar?',
    'É assim que a empresa vê você'];
  var SUBTITULOS = ['', 'Escolha a cidade e a zona onde você mora. A foto é opcional.',
    'Marque até 3. A lista de vagas já abre nas suas áreas e você recebe aviso de vaga nova nelas.',
    'Conte até onde estudou e os cursos que fez. Só o que ajuda na vaga.',
    'Turnos, tipo de vaga, pretensão e o seu contato.', ''];
  var AREAS_VISIVEIS = 8;
  var AVISO_TEXTO_LIVRE = 'Não escreva idade, sexo, estado civil, filhos, religião, cor, saúde ou documento nos campos de texto: isso não entra no cartão.';
  var FOTO_LADO = 512;
  var FOTO_MAX = 200 * 1024;

  TELAS.curriculo = function (ctx, resto) {
    var U = root.VAGAS_UI;
    var A = root.VAGAS_API;
    var P = root.VAGAS_PECAS;
    var R = root.VAGAS_REGRAS;
    var L = root.VAGAS_EU_LOGICA;
    var T = root.VAGAS_TEXTOS;
    var el = U.el;
    var app = ctx.app;
    var n = parseInt(resto, 10);
    if (!(n >= 1 && n <= 5) || String(n) !== String(resto)) { ctx.ir('curriculo/1'); return null; }
    ctx.antesDeAvancar = null;   // só o passo 3 usa (curso digitado e ainda não adicionado)
    var rasc = U.rascunho('curriculo');
    function opV() { return { zonasDe: ctx.zonasDe, agora: Date.now(), sobre: pessoa() ? pessoa().sobre : '', email: pessoa() ? pessoa().email : '' }; }
    function pessoa() { return ctx.minha && ctx.minha.pessoa; }
    function aceite(chave) { return (T && T.consentimentos && T.consentimentos.aceites && T.consentimentos.aceites[chave]) || {}; }

    // ------------------------------------------------------------------------------------------------- estado (uma vez por visita)
    var pergunta = null;
    if (!ctx.cv) pergunta = carregar();
    function cidadePadrao() {
      var ativas = ctx.cidades.filter(function (c) { return c.status === 'ativa'; });
      var lembrada = ctx.cidadeDe(U.cidadeLembrada());
      if (lembrada && lembrada.status === 'ativa') return lembrada.slug;
      return ativas.length === 1 ? ativas[0].slug : '';
    }
    function completar(cv) {
      var b = L.cvVazio();
      Object.keys(b).forEach(function (k) { if (cv[k] === undefined || (Array.isArray(b[k]) && !Array.isArray(cv[k]))) cv[k] = b[k]; });
      if (!cv.experiencias.length) cv.experiencias = [L.expVazia()];
      return cv;
    }
    function carregar() {
      var p = pessoa();
      var base = p ? L.cvDaPessoa(p) : L.cvVazio({ cidade: cidadePadrao() });
      var g = L.rascunhoDaConta(rasc.ler(), ctx.email);
      ctx.cv = base;
      // Completo ao COMEÇAR: os passos gravam no banco quando tudo já está certo, então "completo" vira true antes do fim.
      ctx.cvEraCompleto = !!(ctx.minha && ctx.minha.completo);
      ctx.foto = { tem: !!(p && p.temFoto), url: '', pendente: null, pendenteUrl: '' };
      if (!g) return null;
      var doRascunho = completar(JSON.parse(JSON.stringify(g.dados.cv)));
      if (!p) { ctx.cv = doRascunho; return null; }   // ainda sem currículo no banco: segue do rascunho
      if (g.em > (Date.parse(p.atualizadoEm) || 0) && JSON.stringify(doRascunho) !== JSON.stringify(base)) return { em: g.em, cv: doRascunho };
      rasc.apagar();
      return null;
    }

    // Com "Quero" guardado e o currículo pela metade: abre no passo que falta (uma vez), com o aviso.
    var intencao = ctx.intencao();
    var falta = L.primeiroPassoIncompleto(ctx.cv, opV());
    if (intencao && !(ctx.minha && ctx.minha.completo) && n === 1 && falta > 1 && falta < 5 && !ctx.pulouParaFalta) {
      ctx.pulouParaFalta = true;
      ctx.ir('curriculo/' + falta);
      return null;
    }

    // ------------------------------------------------------------------------------------------------- moldura do passo
    ctx.titulo('Currículo, passo ' + n + ' de 5');
    var rascInfo = el('p', { class: 'vg-rascunho', id: 'vg-cv-rascunho', 'aria-live': 'polite' });
    var guardado = L.rascunhoDaConta(rasc.ler(), ctx.email);
    if (guardado && !pergunta) U.mostrarRascunho(rascInfo, U.hora(new Date(guardado.em).toISOString()));
    // Pílula, trabalho acrescentado e troca de passo gravam na hora; digitação grava 0,4 s depois de parar (e ao sair da página).
    var pendente = false;
    function gravarAgora() {
      pendente = false;
      if (!ctx.cv) return;
      var g = rasc.gravar({ conta: ctx.email, cv: ctx.cv });
      U.mostrarRascunho(rascInfo, g.hora);
    }
    var guardar = U.aoParar(function () { if (pendente) gravarAgora(); }, 400);
    function mudou(digitando) { if (digitando) { pendente = true; guardar(); } else gravarAgora(); }
    ctx.gravarRascunhoPendente = function () { if (pendente) gravarAgora(); };
    var erroGeral = el('div', { class: 'aviso aviso--erro vg-eu-aviso', id: 'vg-cv-erro', role: 'alert', hidden: true });
    function mostrarErroGeral(t) { erroGeral.textContent = t || ''; erroGeral.hidden = !t; if (t) erroGeral.scrollIntoView && erroGeral.scrollIntoView({ block: 'center' }); }

    var avisos = [];
    if (intencao && !ctx.cvEraCompleto) {
      avisos.push(el('div', { class: 'aviso vg-eu-aviso', id: 'vg-cv-intencao', role: 'status' },
        'Falta terminar o currículo (passo ' + Math.min(falta, 5) + ' de 5). Depois a candidatura é enviada sozinha.'));
    }
    if (pergunta) {
      var caixaPergunta = el('div', { class: 'aviso vg-eu-aviso', id: 'vg-cv-rascunho-pergunta', role: 'status' }, [
        el('p', {}, 'Você tem um rascunho de ' + U.dataCurta(new Date(pergunta.em).toISOString()) + ' às ' + U.hora(new Date(pergunta.em).toISOString()) + '. Continuar dele?'),
        el('div', { class: 'acoes' }, [
          el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-cv-rascunho-descartar', onclick: function () {
            rasc.apagar(); U.mostrarRascunho(rascInfo, ''); caixaPergunta.remove(); U.anunciar('Rascunho descartado.');
          } }, 'Descartar'),
          el('button', { type: 'button', class: 'botao botao--principal', id: 'vg-cv-rascunho-continuar', onclick: function () {
            ctx.cv = pergunta.cv; pergunta = null; TELAS.curriculo(ctx, String(n)); U.focarTitulo(app);
          } }, 'Continuar')])]);
      avisos.push(caixaPergunta);
    }

    var form = el('form', { class: 'formulario', id: 'vg-form-cv-' + n, novalidate: true });
    form.addEventListener('submit', function (ev) { ev.preventDefault(); if (n < 5) avancar(); else concluir(); });
    var secao = el('section', { class: 'caixa vg-eu-cv', id: 'vg-curriculo', 'aria-labelledby': 'vg-cv-titulo', data: { passo: n } }, [
      el('div', { class: 'progresso-topo' }, [el('span', {}, [el('span', { class: 'progresso-num', id: 'vg-cv-passo-num' }, String(n)), ' de 5']),
        el('span', { class: 'progresso-pct' }, NOMES[n])]),
      el('div', { class: 'vg-passos', id: 'vg-cv-passos', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map(function (i) {
        return el('span', { class: 'vg-passo' + (i < n ? ' vg-passo--feito' : i === n ? ' vg-passo--atual' : '') });
      })),
      rascInfo
    ].concat(avisos).concat([
      el('h1', { id: 'vg-cv-titulo', class: 't-indicador seminegrito vg-eu-cv__titulo', tabindex: '-1' }, TITULOS[n]),
      SUBTITULOS[n] ? el('p', { class: 'subtitulo' }, SUBTITULOS[n]) : null,
      erroGeral, form
    ]));
    U.trocar(app, secao);
    var montar = [null, passo1, passo2, passo3, passo4, passo5][n];
    montar(form);
    U.fixar(U.barra({ id: 'vg-barra-cv', dica: n < 5 ? 'Você pode parar e continuar depois: fica salvo aqui no celular.' : 'Você pode editar depois em "Eu".', botoes: [
      el('button', { type: 'button', class: 'botao botao--claro botao--grande', id: 'vg-cv-voltar', onclick: function () { ctx.gravarRascunhoPendente(); ctx.ir(n === 1 ? 'dados' : 'curriculo/' + (n - 1)); } }, 'Voltar'),
      n < 5 ? el('button', { type: 'button', class: 'botao botao--principal botao--grande', id: 'vg-cv-avancar', onclick: avancar }, 'Continuar')
        : el('button', { type: 'button', class: 'botao botao--laranja botao--grande', id: 'vg-cv-concluir', onclick: concluir }, 'Salvar currículo')] }));
    // Veio do "Salvar currículo" com algo faltando neste passo: os erros já aparecem.
    if (ctx.errosNoPasso === n) { ctx.errosNoPasso = 0; setTimeout(function () { mostrarErros(L.validarPasso(n, ctx.cv, opV())); }, 0); }

    // ------------------------------------------------------------------------------------------------- peças de formulário
    function nota(t) { return t ? el('span', { class: 'obrigatorio' }, ' ' + t) : null; }
    // Pílulas (sem <select>): escolha única ou múltipla, com máximo. aria-pressed como nos mockups.
    function pilulas(op) {
      var grupo = el('div', { class: 'vg-opcoes', id: op.id, role: 'group', 'aria-labelledby': op.id + '-rotulo' });
      function marcados() { var v = op.ler(); return Array.isArray(v) ? v : (v ? [v] : []); }
      function desenhar() {
        var m = marcados();
        U.trocar(grupo, op.opcoes.filter(function (o, i) { return !op.visivel || op.visivel(o, i, m); }).map(function (o) {
          return el('button', { type: 'button', class: 'vg-chip', id: (op.prefixo || op.id + '-') + o.id, 'aria-pressed': m.indexOf(o.id) >= 0 ? 'true' : 'false',
            data: { valor: o.id }, onclick: function () { tocar(o.id); } }, o.rotulo);
        }));
      }
      function tocar(id) {
        var m = marcados().slice();
        U.limparErroCampo(grupo);
        if (op.multi) {
          var i = m.indexOf(id);
          if (i >= 0) m.splice(i, 1);
          else if (op.max && m.length >= op.max) { U.erroCampo(grupo, op.msgMax); return; }
          else m.push(id);
          op.gravar(m);
        } else op.gravar(m[0] === id && op.desmarcar ? '' : id);
        // O grupo é redesenhado: quem usa teclado continua na mesma pílula.
        var ativo = doc.activeElement && grupo.contains(doc.activeElement) ? doc.activeElement.id : '';
        desenhar();
        if (ativo && doc.getElementById(ativo)) doc.getElementById(ativo).focus();
        if (op.aoMudar) op.aoMudar();
        mudou();
      }
      desenhar();
      var campo = el('fieldset', { class: 'campo campo--grupo', id: op.id + '-campo' }, [
        el('legend', { class: 'campo__rotulo', id: op.id + '-rotulo' }, [op.legenda, nota(op.nota)]), grupo].concat(op.depois || []));
      campo.redesenhar = desenhar;
      return campo;
    }
    function campoTexto(op) {
      var atrib = Object.assign({ id: op.id, class: 'entrada', type: op.tipo || 'text', value: op.valor == null ? '' : String(op.valor),
        'aria-describedby': op.ajuda ? op.id + '-ajuda' : null }, op.atributos || {});
      var entrada = el('input', atrib);
      entrada.addEventListener('input', function () { U.limparErroCampo(entrada); op.aoMudar(entrada.value); mudou(true); });
      return el('div', { class: 'campo', id: op.id + '-campo' }, [el('label', { class: 'campo__rotulo', for: op.id }, [op.rotulo, nota(op.nota)]), entrada,
        op.ajuda ? el('span', { class: 'campo__ajuda', id: op.id + '-ajuda' }, op.ajuda) : null]);
    }

    // ------------------------------------------------------------------------------------------------- passo 1: onde + foto
    function passo1(f) {
      var cv = ctx.cv;
      var ativas = ctx.cidades.filter(function (c) { return c.status === 'ativa'; });
      var opcoesCidade = ativas.map(function (c) { return { id: c.slug, rotulo: c.nome }; });
      cv.cidades.forEach(function (s) { if (!opcoesCidade.some(function (o) { return o.id === s; })) { var c = ctx.cidadeDe(s) || (pessoa() && pessoa().cidade && pessoa().cidade.slug === s ? pessoa().cidade : null); opcoesCidade.push({ id: s, rotulo: c ? c.nome : s }); } });
      var bairros = el('span', { class: 'campo__ajuda', id: 'vg-cv-zona-bairros' });
      var zonaCampo = null;
      var cidades = pilulas({ id: 'vg-cv-cidades', prefixo: 'vg-cv-cidade-', legenda: 'Cidade', nota: opcoesCidade.length > 1 ? '(até 2)' : '', opcoes: opcoesCidade, multi: true, max: 2,
        msgMax: L.MSG.CIDADE_MAX(), ler: function () { return cv.cidades; }, gravar: function (v) { cv.cidades = v; },
        aoMudar: function () {
          if (!ctx.zonasDe(cv.cidades[0]).some(function (z) { return z.slug === cv.zona; })) cv.zona = '';
          trocarZona();
        },
        depois: opcoesCidade.length > 1 ? [el('span', { class: 'campo__ajuda' }, 'A primeira que você marcar é onde você mora; a zona é dela.')] : [] });
      var lugarZona = el('div', {});
      function textoBairros() {
        var z = ctx.zonasDe(cv.cidades[0]).filter(function (x) { return x.slug === cv.zona; })[0];
        bairros.textContent = z && z.bairros && z.bairros.length ? 'Bairros: ' + z.bairros.join(', ') + '.' : '';
      }
      function trocarZona() {
        var zonas = ctx.zonasDe(cv.cidades[0]);
        if (!cv.cidades.length) { U.trocar(lugarZona, el('p', { class: 'campo__ajuda', id: 'vg-cv-zona' }, 'Escolha a cidade primeiro.')); return; }
        zonaCampo = pilulas({ id: 'vg-cv-zona', legenda: 'Zona onde você mora', opcoes: zonas.map(function (z) { return { id: z.slug, rotulo: z.nome }; }),
          ler: function () { return cv.zona; }, gravar: function (v) { cv.zona = v; }, aoMudar: textoBairros, depois: [bairros] });
        U.trocar(lugarZona, zonaCampo);
        textoBairros();
      }
      trocarZona();
      U.acrescentar(f, [cidades, lugarZona, blocoFoto()]);
    }

    // Foto opcional: reduzida no aparelho, aceite foto_opcional (nunca marcado por padrão), enviada na hora (não espera o "Salvar").
    function blocoFoto() {
      var foto = ctx.foto || (ctx.foto = { tem: !!(pessoa() && pessoa().temFoto), url: '', pendente: null, pendenteUrl: '' });
      var previa = el('span', { class: 'vg-foto__previa', id: 'vg-cv-foto-previa', 'aria-hidden': 'true' });
      var acoes = el('div', { class: 'vg-foto__acoes' });
      var erro = el('p', { class: 'campo__erro', id: 'vg-cv-foto-erro', role: 'alert', hidden: true });
      var lugarAceite = el('div', {});
      var arquivo = el('input', { type: 'file', id: 'vg-cv-foto-arquivo', class: 'visualmente-oculto', accept: 'image/jpeg,image/png,image/webp', tabindex: '-1' });
      var camera = el('input', { type: 'file', id: 'vg-cv-foto-camera', class: 'visualmente-oculto', accept: 'image/*', capture: 'user', tabindex: '-1' });
      var temCamera = 'capture' in doc.createElement('input');
      function mostrarErro(t) { erro.textContent = t || ''; erro.hidden = !t; }
      function desenhar() {
        var url = foto.pendenteUrl || foto.url;
        previa.className = 'vg-foto__previa' + (url ? '' : ' vg-foto__previa--vazia');
        U.trocar(previa, url ? el('img', { src: url, alt: '', width: '64', height: '64' }) : U.icone('pessoa'));
        if (foto.pendente) {
          U.trocar(acoes, null);
          var caixa = el('input', { type: 'checkbox', id: 'vg-cv-foto-aceite' });
          var c = aceite('foto_opcional');
          U.trocar(lugarAceite, el('div', { class: 'consentimento vg-eu-aviso', id: 'vg-cv-foto-consentimento' }, [
            el('label', { class: 'marcar', for: 'vg-cv-foto-aceite' }, [caixa, el('span', { class: 't-rotulo' }, [el('strong', {}, (c.titulo || 'Mostrar minha foto depois do Combinou') + '. '), c.texto || ''])]),
            c.explicacao ? el('p', { class: 'consentimento__explicacao' }, L.semMarcador(c.explicacao)) : null,
            el('div', { class: 'acoes' }, [
              el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-cv-foto-cancelar', onclick: function () { descartarPendente(); desenhar(); } }, 'Cancelar'),
              el('button', { type: 'button', class: 'botao botao--principal', id: 'vg-cv-foto-enviar', onclick: function (ev) { enviar(ev.currentTarget, caixa); } }, 'Enviar foto')])]));
          return;
        }
        U.trocar(lugarAceite, null);
        if (foto.tem) {
          U.trocar(acoes, [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-cv-foto-escolher', onclick: function () { arquivo.click(); } }, U.t('botoes.foto_trocar') || 'Trocar foto'),
            el('button', { type: 'button', class: 'botao botao--link', id: 'vg-cv-foto-remover', onclick: remover }, U.t('botoes.foto_remover') || 'Remover foto')]);
        } else {
          U.trocar(acoes, [el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-cv-foto-escolher', onclick: function () { arquivo.click(); } }, 'Escolher foto'),
            temCamera ? el('button', { type: 'button', class: 'botao botao--link', id: 'vg-cv-foto-tirar', onclick: function () { camera.click(); } }, 'Tirar a foto') : null]);
        }
      }
      function descartarPendente() {
        if (foto.pendenteUrl && root.URL && URL.revokeObjectURL) URL.revokeObjectURL(foto.pendenteUrl);
        foto.pendente = null; foto.pendenteUrl = '';
      }
      function escolhido(ev) {
        var f = ev.target.files && ev.target.files[0];
        ev.target.value = '';
        mostrarErro('');
        if (!f) return;
        if (!/^image\//.test(f.type || '')) { mostrarErro(U.t('validacao.foto_formato')); return; }
        U.anunciar('Preparando a foto…');
        reduzirFoto(f).then(function (blob) {
          descartarPendente();
          foto.pendente = blob;
          foto.pendenteUrl = URL.createObjectURL(blob);
          desenhar();
          var c = doc.getElementById('vg-cv-foto-aceite');
          if (c) c.focus();
        }, function () { mostrarErro(U.t('validacao.foto_formato')); });
      }
      function enviar(botao, caixa) {
        if (!caixa.checked) { U.erroCampo(caixa, 'Marque a caixa para continuar'); caixa.focus(); return; }
        U.ocupado(botao, true, 'Enviando…');
        A.enviarFoto(foto.pendente).then(function () {
          if (foto.url && foto.url.indexOf('blob:') === 0) URL.revokeObjectURL(foto.url);
          foto.tem = true; foto.url = foto.pendenteUrl; foto.pendente = null; foto.pendenteUrl = '';
          if (pessoa()) pessoa().temFoto = true;
          desenhar();
          U.avisar('Salvo', { tipo: 'ok' });
        }, function (e) {
          U.ocupado(botao, false);
          if (e.sessaoExpirada || e.confirmar || e.suspensa) { U.tratarErro(e); return; }
          mostrarErro(e.message);
        });
      }
      function remover(ev) {
        var b = ev.currentTarget;
        U.ocupado(b, true, 'Removendo…');
        A.apagarFoto().then(function () {
          if (foto.url && foto.url.indexOf('blob:') === 0) URL.revokeObjectURL(foto.url);
          foto.tem = false; foto.url = '';
          if (pessoa()) pessoa().temFoto = false;
          desenhar();
          U.avisar(U.t('foto.removida') || 'Foto removida.', { tipo: 'ok' });
        }, function (e) { U.ocupado(b, false); if (e.sessaoExpirada) { U.tratarErro(e); return; } mostrarErro(e.message); });
      }
      arquivo.addEventListener('change', escolhido);
      camera.addEventListener('change', escolhido);
      desenhar();
      if (foto.tem && !foto.url) {
        A.fotoUrl().then(function (r) { foto.url = r.url || ''; desenhar(); }, function () { /* sem a imagem, fica o ícone: a foto continua guardada */ });
      }
      return el('div', { class: 'campo', id: 'vg-cv-foto-campo' }, [
        el('span', { class: 'campo__rotulo' }, ['Foto', nota('(opcional)')]),
        el('div', { class: 'vg-foto' }, [previa, acoes]),
        el('p', { class: 'campo__ajuda', id: 'vg-cv-foto-ajuda' }, U.t('foto.explicacao')),
        erro, lugarAceite,
        el('label', { class: 'visualmente-oculto', for: 'vg-cv-foto-arquivo' }, 'Escolher foto'), arquivo,
        el('label', { class: 'visualmente-oculto', for: 'vg-cv-foto-camera' }, 'Tirar a foto'), camera
      ]);
    }
    // 512 px no lado maior, JPEG, até ~200 KB (a qualidade desce até caber). Desenha sobre branco (PNG com transparência).
    function reduzirFoto(arquivo) {
      return new Promise(function (ok, falhou) {
        var url = URL.createObjectURL(arquivo);
        var img = new Image();
        img.onload = function () {
          var escala = Math.min(1, FOTO_LADO / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          var w = Math.max(1, Math.round(img.naturalWidth * escala));
          var h = Math.max(1, Math.round(img.naturalHeight * escala));
          var tela = doc.createElement('canvas');
          tela.width = w; tela.height = h;
          var g = tela.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, w, h);
          g.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          var qualidades = [0.85, 0.75, 0.65, 0.5];
          (function tentar(i) {
            tela.toBlob(function (b) {
              if (!b) { falhou(new Error('foto')); return; }
              if (b.size <= FOTO_MAX || i === qualidades.length - 1) ok(b); else tentar(i + 1);
            }, 'image/jpeg', qualidades[i]);
          })(0);
        };
        img.onerror = function () { URL.revokeObjectURL(url); falhou(new Error('foto')); };
        img.src = url;
      });
    }

    // ------------------------------------------------------------------------------------------------- passo 2: áreas e experiência
    function passo2(f) {
      var cv = ctx.cv;
      var ajuda = el('span', { class: 'campo__ajuda', id: 'vg-cv-areas-ajuda', 'aria-live': 'polite' });
      var todas = cv.areas.some(function (a) { return R.AREAS.map(function (x) { return x.id; }).indexOf(a) >= AREAS_VISIVEIS; });
      var botaoTodas = el('button', { type: 'button', class: 'botao botao--link vg-eu-link-esquerda', id: 'vg-cv-areas-todas', 'aria-expanded': todas ? 'true' : 'false',
        'aria-controls': 'vg-cv-areas', onclick: function () { todas = !todas; botaoTodas.setAttribute('aria-expanded', todas ? 'true' : 'false'); botaoTodas.textContent = todas ? 'Ver menos áreas' : 'Ver todas as 24 áreas'; areas.redesenhar(); } },
        todas ? 'Ver menos áreas' : 'Ver todas as 24 áreas');
      function textoAjuda() {
        var m = R.AREAS.filter(function (a) { return cv.areas.indexOf(a.id) >= 0; }).map(function (a) { return a.rotulo; });
        ajuda.textContent = m.length ? m.length + ' de 3 marcadas: ' + m.join(', ') + '.' : 'Marque de 1 a 3.';
      }
      var areas = pilulas({ id: 'vg-cv-areas', prefixo: 'vg-cv-area-', legenda: 'Áreas', nota: '(até 3)', opcoes: R.AREAS.map(function (a) { return { id: a.id, rotulo: a.rotulo }; }),
        multi: true, max: 3, msgMax: L.MSG.AREA_MAX, ler: function () { return cv.areas; }, gravar: function (v) { cv.areas = v; }, aoMudar: textoAjuda,
        visivel: function (o, i, m) { return todas || i < AREAS_VISIVEIS || m.indexOf(o.id) >= 0; }, depois: [botaoTodas, ajuda] });
      textoAjuda();
      var lista = el('div', { class: 'vg-eu-exps', id: 'vg-exp-lista' });
      var lugarBotoes = el('div', { class: 'vg-eu-exp-botoes' });
      function desenharExps() {
        U.trocar(lista, cv.semExperiencia
          ? el('p', { class: 'aviso', id: 'vg-exp-nenhuma-nota', role: 'status' }, 'Tudo bem. O cartão vai mostrar "Ainda sem experiência registrada". Se mudar de ideia, adicione um trabalho.')
          : cv.experiencias.map(blocoExp));
        U.trocar(lugarBotoes, [
          cv.semExperiencia || cv.experiencias.length < 10 ? el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-exp-adicionar', onclick: function () {
            if (cv.semExperiencia) { cv.semExperiencia = false; if (!cv.experiencias.length) cv.experiencias = [L.expVazia()]; }
            else cv.experiencias.push(L.expVazia());
            desenharExps(); mudou();
            var novo = doc.getElementById('vg-exp-cargo' + L.sufixo(cv.experiencias.length - 1));
            if (novo) novo.focus();
          } }, [U.icone('mais'), cv.semExperiencia ? 'Adicionar um trabalho' : 'Adicionar outro trabalho']) : null,
          cv.semExperiencia ? null : el('button', { type: 'button', class: 'botao botao--link', id: 'vg-exp-nenhuma', onclick: function () {
            cv.semExperiencia = true; desenharExps(); mudou(); U.anunciar('Marcado: ainda não trabalhei.');
          } }, 'Ainda não trabalhei')]);
      }
      function blocoExp(x, i) {
        var s = L.sufixo(i);
        var datas = el('div', { class: 'vg-eu-exp__datas', hidden: !x.datas });
        function desenharDatas() {
          U.trocar(datas, [campoTexto({ id: 'vg-exp-inicio' + s, rotulo: 'Começou em', nota: '(mês e ano)', tipo: 'month', valor: x.inicio, atributos: { placeholder: 'AAAA-MM', max: L.mesAtual() },
            aoMudar: function (v) { x.inicio = v; x.tempo = L.tempoDoPeriodo(x.inicio, x.atual ? '' : (x.fim || L.mesAtual()), Date.now()); tempo.redesenhar(); } }),
            x.atual ? null : campoTexto({ id: 'vg-exp-fim' + s, rotulo: 'Saiu em', nota: '(mês e ano)', tipo: 'month', valor: x.fim || L.mesAtual(), atributos: { placeholder: 'AAAA-MM', max: L.mesAtual() },
              aoMudar: function (v) { x.fim = v; x.tempo = L.tempoDoPeriodo(x.inicio, x.fim, Date.now()); tempo.redesenhar(); } })]);
        }
        var tempo = pilulas({ id: 'vg-exp-tempo' + s, legenda: 'Por quanto tempo', opcoes: L.TEMPOS, ler: function () { return x.tempo; },
          gravar: function (v) { x.tempo = v; x.inicio = L.inicioDoTempo(v, Date.now()); x.fim = ''; if (x.datas) desenharDatas(); } });
        var carteira = pilulas({ id: 'vg-exp-carteira' + s, legenda: 'Com carteira assinada?', nota: '(opcional)', opcoes: L.CARTEIRA, desmarcar: true,
          ler: function () { return x.carteira; }, gravar: function (v) { x.carteira = v; } });
        var atual = el('input', { type: 'checkbox', id: 'vg-exp-atual' + s, checked: !!x.atual });
        atual.addEventListener('change', function () {
          x.atual = atual.checked;
          if (!x.atual && !x.fim && x.datas) x.fim = L.mesAtual();
          if (x.datas) desenharDatas();
          x.tempo = x.inicio ? L.tempoDoPeriodo(x.inicio, x.atual ? '' : (x.fim || L.mesAtual()), Date.now()) : x.tempo;
          tempo.redesenhar();
          mudou();
        });
        var botaoDatas = el('button', { type: 'button', class: 'botao botao--link vg-eu-link-esquerda', id: 'vg-exp-datas' + s, 'aria-expanded': x.datas ? 'true' : 'false', onclick: function () {
          x.datas = !x.datas; datas.hidden = !x.datas; botaoDatas.setAttribute('aria-expanded', x.datas ? 'true' : 'false');
          if (x.datas) { desenharDatas(); var c = doc.getElementById('vg-exp-inicio' + s); if (c) c.focus(); }
        } }, 'Ajustar datas');
        if (x.datas) desenharDatas();
        var quantas = cv.experiencias.length;
        return el('div', { class: 'vg-eu-exp', data: { exp: i } }, [
          quantas > 1 ? el('div', { class: 'vg-eu-exp__cab' }, [el('p', { class: 'seminegrito' }, 'Trabalho ' + (i + 1)),
            el('button', { type: 'button', class: 'botao botao--link', data: { acao: 'remover-exp' }, 'aria-label': 'Tirar o trabalho ' + (i + 1), onclick: function () {
              cv.experiencias.splice(i, 1); desenharExps(); mudou(); U.anunciar('Trabalho tirado.');
            } }, 'Tirar')]) : null,
          campoTexto({ id: 'vg-exp-cargo' + s, rotulo: 'O que você fazia', valor: x.cargo, atributos: { maxlength: '80', autocomplete: 'off' }, aoMudar: function (v) { x.cargo = v; } }),
          campoTexto({ id: 'vg-exp-onde' + s, rotulo: 'Onde', nota: '(opcional)', valor: x.onde, atributos: { maxlength: '120', autocomplete: 'off' }, aoMudar: function (v) { x.onde = v; } }),
          tempo,
          el('label', { class: 'marcar', for: 'vg-exp-atual' + s }, [atual, el('span', {}, 'Trabalho lá atualmente')]),
          botaoDatas, datas, carteira
        ]);
      }
      desenharExps();
      U.acrescentar(f, [areas,
        el('div', { class: 'vg-eu-secao' }, [el('h2', { class: 'vg-eu-h2', id: 'vg-exp-titulo' }, 'Onde você já trabalhou?'),
          el('p', { class: 't-rotulo texto-medio' }, 'Com ou sem carteira, bico ou negócio próprio. Se nunca trabalhou, toque em "Ainda não trabalhei".')]),
        lista, lugarBotoes,
        el('p', { class: 't-nota texto-suave', id: 'vg-cv-aviso-texto' }, AVISO_TEXTO_LIVRE)]);
    }

    // ------------------------------------------------------------------------------------------------- passo 3: escolaridade, cursos, CNH
    function passo3(f) {
      var cv = ctx.cv;
      var escolaridade = pilulas({ id: 'vg-cv-escolaridade', legenda: 'Escolaridade', opcoes: R.ESCOLARIDADES, ler: function () { return cv.escolaridade; },
        gravar: function (v) { cv.escolaridade = v; } });
      var entrada = el('input', { id: 'vg-cv-cursos', class: 'entrada', type: 'text', maxlength: '80', autocomplete: 'off', 'aria-describedby': 'vg-cv-cursos-ajuda',
        placeholder: 'Ex.: Atendimento ao cliente' });
      var lista = el('ul', { class: 'vg-opcoes vg-eu-cursos', id: 'vg-cv-cursos-lista', 'aria-label': 'Cursos que você colocou' });
      function desenharCursos() {
        U.trocar(lista, cv.cursos.map(function (c, i) {
          return el('li', {}, el('button', { type: 'button', class: 'vg-chip', data: { curso: i }, 'aria-label': 'Tirar o curso ' + c, onclick: function () {
            cv.cursos.splice(i, 1); desenharCursos(); mudou(); entrada.focus();
          } }, [c, U.icone('fechar')]));
        }));
        lista.hidden = !cv.cursos.length;
      }
      function adicionar() {
        var t = R.limparTexto(entrada.value, 80);
        if (!t) return true;
        U.limparErroCampo(entrada);
        if (cv.cursos.length >= 10) { U.erroCampo(entrada, L.MSG.CURSOS_MAX); return false; }
        var x = R.conferirTexto(t, 'cartao');
        if (x) { U.erroCampo(entrada, x.erro); return false; }
        if (cv.cursos.map(function (c) { return c.toLowerCase(); }).indexOf(t.toLowerCase()) < 0) cv.cursos.push(t);
        entrada.value = '';
        desenharCursos(); mudou();
        return true;
      }
      ctx.antesDeAvancar = adicionar;   // curso digitado e não adicionado entra ao tocar em "Continuar"
      entrada.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); adicionar(); } });
      entrada.addEventListener('input', function () { U.limparErroCampo(entrada); });
      desenharCursos();
      var cnh = pilulas({ id: 'vg-cv-cnh', legenda: 'Carteira de motorista (CNH)', opcoes: L.CNH_OPCOES, ler: function () { return cv.cnh; }, gravar: function (v) { cv.cnh = v; } });
      U.acrescentar(f, [escolaridade,
        el('div', { class: 'campo', id: 'vg-cv-cursos-campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-cv-cursos' }, ['Cursos', nota('(opcional, até 10)')]),
          el('div', { class: 'vg-eu-linha-dupla' }, [entrada, el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-cv-cursos-adicionar', onclick: adicionar }, 'Adicionar')]),
          el('span', { class: 'campo__ajuda', id: 'vg-cv-cursos-ajuda' }, 'Escreva um curso e toque em "Adicionar".'), lista]),
        cnh,
        el('p', { class: 't-nota texto-suave', id: 'vg-cv-aviso-texto' }, AVISO_TEXTO_LIVRE)]);
    }

    // ------------------------------------------------------------------------------------------------- passo 4: disponibilidade e contato
    function passo4(f) {
      var cv = ctx.cv;
      U.acrescentar(f, [
        pilulas({ id: 'vg-cv-turnos', legenda: 'Turnos em que você pode trabalhar', opcoes: R.TURNOS, multi: true, ler: function () { return cv.turnos; }, gravar: function (v) { cv.turnos = v; } }),
        pilulas({ id: 'vg-cv-modalidades', legenda: 'Tipo de vaga que você aceita', opcoes: R.MODALIDADES, multi: true, ler: function () { return cv.modalidades; }, gravar: function (v) { cv.modalidades = v; } }),
        campoTexto({ id: 'vg-cv-pretensao', rotulo: 'Pretensão: a partir de R$', nota: '(opcional)', valor: cv.pretensao, atributos: { inputmode: 'numeric', autocomplete: 'off', maxlength: '12', placeholder: 'Ex.: 1600' },
          ajuda: 'A empresa vê no cartão "A partir de R$ …".', aoMudar: function (v) { cv.pretensao = v; } }),
        el('div', { class: 'vg-eu-secao' }, [el('h2', { class: 'vg-eu-h2' }, 'Seu contato'),
          el('p', { class: 't-rotulo texto-medio' }, 'Só aparece para a empresa depois do Combinou.')]),
        campoTexto({ id: 'vg-cv-nome', rotulo: 'Nome e sobrenome', valor: cv.nome, atributos: { autocomplete: 'name', maxlength: '120' }, aoMudar: function (v) { cv.nome = v; } }),
        campoTexto({ id: 'vg-cv-whatsapp', rotulo: 'WhatsApp com DDD', tipo: 'tel', valor: cv.whatsapp, atributos: { inputmode: 'tel', autocomplete: 'tel-national', maxlength: '20' },
          ajuda: 'Só aparece para a empresa depois do Combinou. Sem confirmação por código nesta fase.', aoMudar: function (v) { cv.whatsapp = v; } })
      ]);
    }

    // ------------------------------------------------------------------------------------------------- passo 5: revisar
    function passo5(f) {
      var cv = ctx.cv;
      var cartao = L.cartaoLocal(cv, { cidades: ctx.cidades, cartao: ctx.minha && ctx.minha.cartao, agora: Date.now() });
      var c = aceite('pessoa_banco_talentos');
      var banco = el('input', { type: 'checkbox', id: 'vg-cv-banco', checked: !!cv.banco });
      banco.addEventListener('change', function () { cv.banco = banco.checked; mudou(); });
      U.acrescentar(f, [
        el('p', { class: 't-rotulo texto-medio' }, U.t('avisos.cartao_cego')),
        el('div', { class: 'vg-eu-previa', id: 'vg-cv-previa' }, [
          el('p', { class: 't-nota texto-suave' }, 'Assim a empresa vê o seu cartão · sem foto, sem nome'),
          el('ul', { class: 'vg-cartoes' }, P.cartaoCego(cartao, { previa: true, ordem: 1, id: 'vg-cv-cartao' }))]),
        el('p', { class: 't-rotulo texto-medio vg-eu-nota', id: 'vg-cv-previa-nota' }, [U.icone('bloqueio'),
          el('span', {}, [el('strong', {}, 'Sua foto, nome e contato só aparecem depois do Combinou.'), ' Antes disso a empresa vê só este cartão.'])]),
        el('div', { class: 'consentimento' }, [
          el('label', { class: 'marcar', for: 'vg-cv-banco' }, [banco, el('span', { class: 't-rotulo' }, [el('strong', {}, (c.titulo || 'Entrar no banco de talentos') + ' (opcional). '), c.texto || ''])]),
          c.explicacao ? el('p', { class: 'consentimento__explicacao' }, L.semMarcador(c.explicacao)) : null]),
        el('p', { class: 't-nota texto-suave' }, 'Candidatar-se a uma vaga não depende dessa autorização.')
      ]);
    }

    // ------------------------------------------------------------------------------------------------- avançar e salvar
    function limparErros() {
      Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid="true"]'), function (c) { U.limparErroCampo(c); });
      mostrarErroGeral('');
    }
    function mostrarErros(erros) {
      limparErros();
      erros.forEach(function (e) {
        var c = doc.getElementById(e.campo);
        if (c) U.erroCampo(c, e.msg); else mostrarErroGeral(e.msg);
      });
      if (!erros.length) return false;
      var alvo = doc.getElementById(erros[0].campo);
      if (alvo) {
        var foco = alvo.matches && alvo.matches('.vg-opcoes') ? alvo.querySelector('button') : alvo;
        if (foco) { foco.focus(); if (foco.scrollIntoView) foco.scrollIntoView({ block: 'center' }); }
      }
      return true;
    }
    function bancoAtivo() { var p = pessoa(); return !!(p && p.bancoTalentosAte && Date.parse(p.bancoTalentosAte) > Date.now()); }
    function salvarNoBanco() {
      return A.salvarPessoa(L.pessoaDoCv(ctx.cv, opV())).then(function (r) {
        var temFoto = pessoa() ? pessoa().temFoto : false;
        var bancoAte = pessoa() ? pessoa().bancoTalentosAte : '';
        ctx.minha = r;
        if (r.pessoa) { r.pessoa.temFoto = r.pessoa.temFoto || temFoto; r.pessoa.bancoTalentosAte = r.pessoa.bancoTalentosAte || bancoAte; }
        if (ctx.eu.pessoa) ctx.eu.pessoa.completo = true;
        return r;
      });
    }
    function erroDoBanco(e) {
      if (e.sessaoExpirada || e.confirmar || e.suspensa) { U.tratarErro(e); return false; }
      mostrarErroGeral(e.message);
      return false;
    }
    function avancar() {
      if (ctx.antesDeAvancar && ctx.antesDeAvancar() === false) return;
      if (mostrarErros(L.validarPasso(n, ctx.cv, opV()))) return;
      var botao = doc.getElementById('vg-cv-avancar');
      var seguir = function () { gravarAgora(); ctx.antesDeAvancar = null; ctx.ir('curriculo/' + (n + 1)); };
      // Currículo já completo (edição): grava a cada passo, como pede o desenho. Pela metade: só o rascunho no aparelho.
      if (!L.prontoParaSalvar(ctx.cv, opV())) { seguir(); return; }
      U.ocupado(botao, true, 'Salvando…');
      salvarNoBanco().then(function () { U.ocupado(botao, false); seguir(); }, function (e) {
        U.ocupado(botao, false);
        if (e.conexao) { U.avisar('Sem internet. O que você fez ficou salvo neste aparelho.', { tipo: 'erro', ms: 5000 }); seguir(); return; }
        erroDoBanco(e);
      });
    }
    function concluir() {
      var falta2 = L.primeiroPassoIncompleto(ctx.cv, opV());
      if (falta2 < 5) { ctx.errosNoPasso = falta2; ctx.ir('curriculo/' + falta2); return; }
      var botao = doc.getElementById('vg-cv-concluir');
      var eraCompleto = !!ctx.cvEraCompleto;
      var bancoAntes = bancoAtivo();
      U.ocupado(botao, true, 'Salvando…');
      salvarNoBanco().then(function () {
        if (ctx.cv.banco === bancoAntes) return null;
        return A.aceitarTermos({ versao: (ctx.eu.conta && ctx.eu.conta.termosVersao) || R.VERSAO_TERMOS, bancoTalentos: ctx.cv.banco }).then(function (t) {
          if (pessoa()) pessoa().bancoTalentosAte = t.bancoTalentosAte || '';
        });
      }).then(function () {
        pendente = false;
        rasc.apagar();
        U.mostrarRascunho(rascInfo, '');
        ctx.cv = null;   // a próxima visita lê o que ficou no banco
        var i = ctx.intencao();
        if (i) {
          U.avisar('Currículo salvo. Enviando a sua candidatura…', { tipo: 'ok' });
          setTimeout(function () { U._api.navegar('vaga.html?vaga=' + encodeURIComponent(i.codigo)); }, 700);
          return;
        }
        if (eraCompleto) { U.avisar('Salvo', { tipo: 'ok' }); ctx.ir('dados'); return; }
        pronto();
      }, function (e) {
        U.ocupado(botao, false);
        if (e.conexao) { mostrarErroGeral(U.t('avisos.sem_internet')); return; }
        erroDoBanco(e);
      });
    }
    // Primeira vez: tela de "pronto" com o próximo passo (vagas) e a frase modelo dos testes (padroes.md §6).
    function pronto() {
      ctx.titulo('Currículo salvo');
      U.trocar(app, el('section', { class: 'caixa centro surgir', id: 'vg-cv-pronto', 'aria-labelledby': 'vg-cv-pronto-titulo' }, [
        el('span', { class: 'vg-ok-icone' }, U.icone('check')),
        el('h1', { id: 'vg-cv-pronto-titulo', class: 'titulo-pagina', tabindex: '-1' }, 'Currículo salvo'),
        el('p', { class: 'subtitulo' }, 'Agora é só tocar em "Quero" nas vagas que você escolher. A empresa recebe o seu cartão sem nome.'),
        el('p', { class: 't-rotulo texto-medio' }, 'Mostre o que você sabe fazer: faça o teste da função no celular e ganhe o selo de habilidade testada.'),
        el('div', { class: 'acoes acoes-coluna' }, [
          el('a', { class: 'botao botao--principal botao--grande', href: ctx.hrefVagas(), id: 'vg-cv-pronto-vagas' }, 'Ver vagas'),
          el('a', { class: 'botao botao--claro botao--grande', href: 'testes.html', id: 'vg-cv-pronto-testes' }, 'Ver os testes')])
      ]));
      ctx.nav('eu');
      U.focarTitulo(app);
      U.anunciar('Currículo salvo.');
    }
    return null;
  };
})(typeof self !== 'undefined' ? self : this);
