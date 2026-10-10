/*
 * Página pública do relatório do processo seletivo (relatorio.html?r=TOKEN ou relatorio.html#r-TOKEN).
 *
 * Desenha o JSON "relatorio" (contrato em docs/SPEC.md / js/relatorio-motor.js) num documento editorial:
 * capa, índice, 01 sumário, 02 atração, 03 avaliação técnica, 04 DISC, 05 ranking, 06 encerramento, rodapé.
 * Com dados.modelo = 'equipe' | 'lideranca' | 'pessoa' (js/relatorio-modelos.js) desenha o modelo correspondente.
 * Equipe: equipeV2(dados) converte um snapshot v1 (já publicado, com harmonia/notas/"tensão") no formato v2 antes de
 * desenhar; nenhum relatório de equipe mostra nota de harmonia, de dupla ou de encaixe, nem "tensão".
 * 'clima' (Pesquisa de Clima da Equipe; snapshot montado pelo banco, textos de js/clima.js) desenha o relatório de clima.
 * organogramaHtml(organograma, {focoId?, rotulo?}) é exportado para o painel reutilizar (estilos: bloco ".org" de relatorio.css).
 *
 * Segurança:
 *   - todo texto que vem do relatório passa por esc() antes de entrar no HTML;
 *   - só campos conhecidos são lidos (lista branca). Telefone, e-mail, idade individual e dados
 *     sensíveis nunca são desenhados, mesmo que venham no JSON por engano.
 *
 * Uso no navegador: carregue config.js, api.js, api-simulada.js e este arquivo; ele procura #relatorio,
 * lê o token da URL e chama DISC_API.relatorioPublico(token).
 * No Node (testes): require('./js/relatorio-view.js') -> { montarHtml, render, esc, numero, ... }.
 */
(function (root) {
  'use strict';

  var MENSAGEM_NAO_ENCONTRADO = 'Relatório não encontrado ou fora do ar.';
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var LETRAS = ['D', 'I', 'S', 'C'];
  var NOMES_DISC = {
    D: { nome: 'Dominância', txt: 'Decide rápido, encara desafio e busca resultado.' },
    I: { nome: 'Influência', txt: 'Comunica, engaja pessoas e cria clima.' },
    S: { nome: 'Estabilidade', txt: 'Paciência, constância e cuidado com o outro.' },
    C: { nome: 'Conformidade', txt: 'Rigor, método e atenção a regra e detalhe.' }
  };
  var SECOES = [
    { n: '01', id: 'sumario', titulo: 'Sumário executivo', meta: 'Recomendação · Leituras' },
    { n: '02', id: 'atracao', titulo: 'Painel de atração', meta: 'Funil · Salários · Perfil do público' },
    { n: '03', id: 'tecnica', titulo: 'Avaliação técnica', meta: 'Pesos · Cortes · Resultados por etapa' },
    { n: '04', id: 'disc', titulo: 'Análise comportamental DISC', curto: 'Análise DISC', meta: 'Perfil ideal · Quadro · Achados' },
    { n: '05', id: 'ranking', titulo: 'Ranking final', meta: 'Fórmula · Tabela mestre · Posição a posição' },
    { n: '06', id: 'encerramento', titulo: 'Encerramento e próximos passos', curto: 'Encerramento', meta: 'Decisão · Próximos passos' }
  ];

  /* ------------------------------------------------------------------ formatação (funções puras) */

  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ehNumero(n) { return typeof n === 'number' && isFinite(n); }

  function milhar(inteiro) {
    return String(inteiro).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // numero(87.94) -> '87,9'; numero(8, 0) -> '8'; null -> '—'
  function numero(n, casas) {
    if (!ehNumero(n)) return '—';
    var c = casas === undefined ? 1 : casas;
    var neg = n < 0;
    var partes = Math.abs(n).toFixed(c).split('.');
    var txt = milhar(partes[0]) + (partes[1] ? ',' + partes[1] : '');
    return (neg ? '−' : '') + txt;
  }

  // inteiro sem casas e decimal com 1 casa: 8 -> '8', 7.5 -> '7,5'
  function numeroCurto(n) {
    if (!ehNumero(n)) return '—';
    return Math.round(n) === n ? numero(n, 0) : numero(n, 1);
  }

  function moeda(n) {
    if (!ehNumero(n)) return '—';
    return 'R$ ' + numero(Math.round(n), 0);
  }

  function pct(n) {
    if (!ehNumero(n)) return '—';
    return numeroCurto(Math.round(n * 10) / 10) + '%';
  }

  function partesData(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    var mes = Number(m[2]);
    if (mes < 1 || mes > 12) return null;
    return { ano: m[1], mes: MESES[mes - 1], dia: m[3] };
  }

  // '2026-08-03' -> '03 ago 2026'
  function data(iso) {
    var p = partesData(iso);
    return p ? p.dia + ' ' + p.mes + ' ' + p.ano : '';
  }

  // {inicio:'2026-08-03', fim:'2026-10-02'} -> '03 ago — 02 out 2026'
  function periodo(p) {
    if (!p) return '';
    var a = partesData(p.inicio);
    var b = partesData(p.fim);
    if (a && b) return (a.ano === b.ano ? a.dia + ' ' + a.mes : data(p.inicio)) + ' — ' + data(p.fim);
    return data(p.inicio) || data(p.fim);
  }

  var ROTULO_SITUACAO = { aprovado: 'Aprovado', avaliar: 'Avaliar', nao_recomendado: 'Não recomendado' };
  var ROTULO_ADERENCIA = { ideal: 'Ideal', boa: 'Boa', media: 'Média', baixa: 'Baixa', indefinida: 'Indefinida' };
  var ROTULO_CONFIABILIDADE = { alta: 'Confiável', media: 'Atenção', baixa: 'Pouco confiável', indisponivel: 'Sem validação' };

  function rotuloSituacao(s) { return ROTULO_SITUACAO[s] || '—'; }
  function rotuloAderencia(a) { return ROTULO_ADERENCIA[a] || '—'; }
  function rotuloConfiabilidade(c) { return ROTULO_CONFIABILIDADE[c] || '—'; }
  function classeSegura(v) { return String(v || '').replace(/[^a-z_]/g, ''); }

  // Token da URL: ?r=TOKEN ou #r-TOKEN. Só letras, números, _ e - (8 a 200).
  function tokenDaUrl(search, hash) {
    var t = '';
    var m = /[?&]r=([^&#]*)/.exec(String(search || ''));
    if (m) { try { t = decodeURIComponent(m[1]); } catch (e) { t = ''; } }
    if (!t) {
      var h = /^#r-(.+)$/.exec(String(hash || ''));
      if (h) { try { t = decodeURIComponent(h[1]); } catch (e2) { t = ''; } }
    }
    t = String(t).trim();
    return /^[A-Za-z0-9_-]{8,200}$/.test(t) ? t : '';
  }

  // Prévia antes de publicar (painel -> "Abrir prévia em nova aba"): relatorio.html#previa-<id>. O painel guarda o
  // snapshot em localStorage ("disc_previa_<id>"); aqui ele é lido UMA vez, apagado e copiado para o sessionStorage
  // desta aba (recarregar continua funcionando). Vale 1 hora. Nada vai ao servidor.
  var PREFIXO_PREVIA = 'disc_previa_';
  var PREVIA_VALIDADE_MS = 3600000;
  var MENSAGEM_PREVIA = 'Prévia expirada ou já aberta em outra aba.';
  function previaDaUrl(hash) {
    var m = /^#previa-([a-z0-9]{16,64})$/.exec(String(hash || ''));
    return m ? m[1] : '';
  }
  function armazem(nome) { try { return root[nome] || null; } catch (e) { return null; } }
  // op (testes): {sessao, local} no lugar do sessionStorage/localStorage da página.
  function lerPrevia(id, agora, op) {
    var chave = PREFIXO_PREVIA + id, bruto = null;
    var sessao = op ? op.sessao || null : armazem('sessionStorage'), local = op ? op.local || null : armazem('localStorage');
    try { bruto = sessao ? sessao.getItem(chave) : null; } catch (e) { bruto = null; }
    if (!bruto && local) {
      try { bruto = local.getItem(chave); local.removeItem(chave); } catch (e2) { bruto = null; }
      if (bruto && sessao) { try { sessao.setItem(chave, bruto); } catch (e3) { /* sem cópia: recarregar não reabre */ } }
    }
    if (!bruto) return null;
    var obj = null;
    try { obj = JSON.parse(bruto); } catch (e4) { obj = null; }
    if (!obj || typeof obj !== 'object' || !obj.relatorio || typeof obj.relatorio !== 'object') return null;
    var em = Number(obj.em) || 0;
    if (!em || (agora || Date.now()) - em > PREVIA_VALIDADE_MS) {
      try { if (sessao) sessao.removeItem(chave); } catch (e5) { /* ignora */ }
      return null;
    }
    return obj.relatorio;
  }
  // Botão "Salvar em PDF" (a mensagem enviada ao cliente promete que dá para salvar): fixo no canto, fora da impressão.
  function botaoPdfHtml() {
    return '<div class="doc-pdf nao-imprimir" id="doc-pdf"><button type="button" class="botao botao--laranja doc-pdf__botao" id="btn-salvar-pdf" ' +
      'title="Abre a janela de impressão: escolha &quot;Salvar como PDF&quot;">Salvar em PDF</button></div>';
  }
  function ligarBotaoPdf(elemento) {
    var b = elemento && elemento.querySelector ? elemento.querySelector('#btn-salvar-pdf') : null;
    if (b) b.addEventListener('click', function () { if (typeof root.print === 'function') root.print(); });
  }
  // Título da aba: "Relatório de equipe — X" fica como está (sem "Relatório · Relatório…").
  function tituloDaAba(titulo) {
    var t = String(titulo || '').trim();
    if (!t) return 'Relatório · Gestão sem Caos';
    return /^relat[óo]rio\b/i.test(t) ? t : 'Relatório · ' + t;
  }

  function faixaPreviaHtml() {
    return '<div class="doc-previa-faixa" id="doc-previa-faixa" role="note">Prévia — ainda não publicado</div>';
  }

  function texto(rel, id) {
    var t = rel && rel.textos && id ? rel.textos[id] : null;
    return t && t.texto ? String(t.texto) : '';
  }

  function lista(v) { return Array.isArray(v) ? v : []; }

  /* ------------------------------------------------------------------ fotos (rodada 3b)
   * Só data URL JPEG em base64, até 40 000 caracteres. Qualquer outra coisa (URL externa, SVG, PNG, javascript:)
   * é ignorada: no lugar entram as iniciais no círculo. Nunca <img> com URL externa. */
  var FOTO_MAX = 40000;
  var RE_FOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  function fotoValida(f) { return typeof f === 'string' && f.length <= FOTO_MAX && RE_FOTO.test(f); }
  function iniciais(nome) {
    var partes = String(nome || '').replace(/[^A-Za-zÀ-ÿ\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    var a = partes[0].charAt(0), b = partes.length > 1 ? partes[partes.length - 1].charAt(0) : '';
    return (a + b).toUpperCase();
  }
  // Avatar redondo: foto válida ou iniciais. tam em px (estilo inline: funciona também no painel, sem relatorio.css).
  function avatarHtml(nome, foto, tam, classe) {
    var t = tam || 40;
    var base = 'display:inline-flex;align-items:center;justify-content:center;flex:none;width:' + t + 'px;height:' + t + 'px;border-radius:50%;overflow:hidden;';
    if (fotoValida(foto)) {
      return '<span class="avatar avatar--foto' + (classe ? ' ' + classe : '') + '" style="' + base + '"><img src="' + foto + '" alt="" width="' + t + '" height="' + t + '" style="width:100%;height:100%;object-fit:cover;display:block"></span>';
    }
    return '<span class="avatar avatar--iniciais' + (classe ? ' ' + classe : '') + '" style="' + base + '" aria-hidden="true">' + esc(iniciais(nome)) + '</span>';
  }
  // No relatório de processo, sem foto nada muda (só desenha quando há foto válida).
  function avatarSeFoto(nome, foto, tam, classe) { return fotoValida(foto) ? avatarHtml(nome, foto, tam, classe) : ''; }

  /* ------------------------------------------------------------------ peças */

  function paragrafos(t, classe) {
    if (!t) return '';
    return String(t).split(/\n{2,}/).map(function (p) {
      return '<p' + (classe ? ' class="' + classe + '"' : '') + '>' + esc(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  function cabecalhoPagina(secao, direita, escuro) {
    return '<div class="pag-cab' + (escuro ? ' pag-cab--escuro' : '') + '">' +
      '<span class="pag-cab__num">' + esc(secao.n + ' · ' + secao.titulo) + '</span>' +
      '<span class="pag-cab__regua" aria-hidden="true"></span>' +
      (direita ? '<span class="pag-cab__dir">' + esc(direita) + '</span>' : '') +
      '</div>';
  }

  function divisor(secao, alt) {
    return '<div class="divisor' + (alt ? ' divisor--alt' : '') + '" aria-hidden="true">' +
      '<span class="divisor__num">' + esc(secao.n) + '</span>' +
      '<span class="divisor__titulo">' + esc(secao.curto || secao.titulo) + '</span>' +
      '<span class="divisor__meta">' + esc(secao.meta) + '</span>' +
      '</div>';
  }

  function selo(classe, rotulo) {
    return '<span class="selo-doc selo-doc--' + classeSegura(classe) + '">' + esc(rotulo) + '</span>';
  }

  function barra(valor, maximo, classe, rotulo) {
    var p = maximo > 0 && ehNumero(valor) ? Math.max(0, Math.min(100, valor / maximo * 100)) : 0;
    return '<span class="barra' + (classe ? ' ' + classe : '') + '"' + (rotulo ? ' role="img" aria-label="' + esc(rotulo) + '"' : ' aria-hidden="true"') + '>' +
      '<span class="barra__feito" style="width:' + p.toFixed(1) + '%"></span></span>';
  }

  function nota(tipo, titulo, corpo) {
    return '<div class="obs obs--' + classeSegura(tipo || 'info') + '">' +
      '<div class="obs__tit">' + esc(titulo) + '</div>' + paragrafos(corpo) + '</div>';
  }

  /* ------------------------------------------------------------------ capa e índice */

  function capa(rel, ctx) {
    var p = rel.processo || {};
    var c = rel.capa || {};
    var rec = rel.sumario && rel.sumario.recomendacao;
    var titulo = esc(c.titulo || 'Relatório do processo seletivo').replace(/\bDISC\b/g, '<em>DISC</em>');
    var numeros = lista(c.numeros).slice(0, 4).map(function (n, i, arr) {
      var v = n.valor;
      var vTxt;
      if (ehNumero(v)) vTxt = esc(numeroCurto(v)) + (n.sufixo ? '<small>' + esc(n.sufixo) + '</small>' : '');
      else {
        var mm = /^\s*([\d.,]+)\s*%\s*$/.exec(String(v === undefined || v === null ? '' : v));
        vTxt = mm ? esc(mm[1]) + '<small>%</small>' : esc(v === undefined || v === null ? '—' : v);
      }
      return '<div class="capa__num' + (i === arr.length - 1 ? ' capa__num--destaque' : '') + '">' +
        '<div class="capa__num-valor">' + vTxt + '</div>' +
        '<div class="capa__num-rotulo">' + esc(n.rotulo) + '</div>' +
        (n.nota ? '<div class="capa__num-nota">' + esc(n.nota) + '</div>' : '') + '</div>';
    }).join('');
    var lider = rec ?
      '<div class="capa__lider">' + (ctx.pendente ? '<span class="capa__lider-obs">Preliminar · etapa em aberto</span>' : '') +
      '<strong>' + esc(rec.nome) + '</strong><span class="pilula-nota">' + esc(numero(rec.score)) + '<small>/100</small></span></div>' :
      '<div class="capa__rod-valor">Ainda sem ranking</div>';
    return '<section class="capa" id="capa" data-secao="capa" aria-label="Capa">' +
      '<div class="capa__grade" aria-hidden="true"></div>' +
      '<header class="capa__topo">' +
        marcaDoc('capa') +
        '<span class="capa__meta"><span>Relatório do processo</span>' + (p.cidade ? '<span>' + esc(p.cidade) + '</span>' : '') + '</span>' +
      '</header>' +
      '<div class="capa__miolo">' +
        '<div class="capa__sobre"><span class="ponto" aria-hidden="true"></span>Relatório executivo · ' + esc(p.vaga || p.nome || 'Processo seletivo') + '</div>' +
        '<h1 class="capa__titulo">' + titulo + '</h1>' +
        (c.subtitulo ? '<p class="capa__subtitulo">' + esc(c.subtitulo) + '</p>' : '') +
        (numeros ? '<div class="capa__numeros">' + numeros + '</div>' : '') +
      '</div>' +
      '<footer class="capa__rodape">' +
        '<div><div class="capa__rod-rotulo">Cliente</div><div class="capa__rod-valor">' + esc(p.empresa || '—') + (p.contratante ? '<br>' + esc(p.contratante) : '') + '</div></div>' +
        '<div><div class="capa__rod-rotulo">Consultoria</div><div class="capa__rod-valor">Gestão sem Caos' + (p.consultor ? '<br>' + esc(p.consultor) : '') + '</div></div>' +
        '<div><div class="capa__rod-rotulo">Período</div><div class="capa__rod-valor">' + esc(periodo(p.periodo) || '—') + (rel.geradoEm ? '<br>Emitido em ' + esc(data(rel.geradoEm)) : '') + '</div></div>' +
        '<div class="capa__rod-lider"><div class="capa__rod-rotulo">Líder preliminar</div>' + lider + '</div>' +
      '</footer>' +
    '</section>';
  }

  function indice(rel, ctx) {
    var n = ctx.linhas.length;
    var tit = n ? (n === 1 ? 'Um finalista' : numeroPorExtenso(n) + ' finalistas') + '. ' +
      (ctx.etapasFeitas === 1 ? 'Uma etapa' : numeroPorExtenso(ctx.etapasFeitas, true) + ' etapas') + ' concluída' + (ctx.etapasFeitas === 1 ? '' : 's') + '.' +
      (ctx.pendente ? ' Uma decisão em aberto.' : ' Uma decisão.') : 'O processo, do anúncio à decisão.';
    return '<section class="pagina pagina--creme" id="indice" data-secao="indice" aria-labelledby="indice-tit">' +
      '<div class="pag-cab"><span class="pag-cab__num">Índice</span><span class="pag-cab__regua" aria-hidden="true"></span></div>' +
      '<div class="indice">' +
        '<div class="indice__tit"><h2 id="indice-tit">' + esc(tit) + '</h2>' +
        '<p>Seis seções, da atração de candidatos ao ranking consolidado' + (ctx.pendente ? ', com as etapas que ainda faltam no fim.' : '.') + '</p></div>' +
        '<ol class="indice__lista">' + SECOES.map(function (s) {
          return '<li><a href="#' + s.id + '"><span class="indice__n">' + s.n + '</span><span class="indice__t">' + esc(s.titulo) + '</span><span class="indice__seta" aria-hidden="true">→</span></a></li>';
        }).join('') + '</ol>' +
      '</div></section>';
  }

  function numeroPorExtenso(n, feminino) {
    var nomes = ['Zero', 'Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez', 'Onze', 'Doze'];
    if (feminino && n === 1) return 'Uma';
    if (feminino && n === 2) return 'Duas';
    return nomes[n] || String(n);
  }

  /* ------------------------------------------------------------------ 01 sumário */

  function sumario(rel, ctx) {
    var s = SECOES[0];
    var rec = rel.sumario && rel.sumario.recomendacao;
    var p = rel.processo || {};
    var corte = rel.config && rel.config.corte;
    var h = '';
    var lede = 'Este relatório consolida o processo seletivo conduzido pela Gestão sem Caos para ' + (p.empresa || 'o cliente') +
      ': da atração de ' + numeroCurto(ctx.total) + ' candidatos à avaliação de ' + numeroCurto(ctx.linhas.length) + ' finalistas, com ' +
      ctx.etapasFeitas + (ctx.etapasFeitas === 1 ? ' etapa técnica' : ' etapas técnicas') + ' e a análise comportamental DISC.' +
      (ctx.pendente ? ' ' + (ctx.etapasPendentes.length === 1 ? 'A etapa ' : 'As etapas ') + ctx.etapasPendentes.join(', ') + (ctx.etapasPendentes.length === 1 ? ' ainda não foi aplicada.' : ' ainda não foram aplicadas.') : '');
    h += '<p class="lede">' + esc(lede) + '</p>';
    if (rec) {
      var seg = ctx.linhas[1];
      var margem = seg && ehNumero(rec.score) && ehNumero(seg.total) ? rec.score - seg.total : null;
      h += '<div class="rec">' +
        '<div class="rec__topo"><span class="rec__etiqueta">Recomendação ' + (ctx.pendente ? 'preliminar' : 'técnica') + '</span>' +
        '<span class="rec__nota"><span class="rec__nota-num">' + esc(numero(rec.score)) + '</span><span class="rec__nota-den">/100</span></span></div>' +
        '<div class="rec__nome">' + avatarSeFoto(rec.nome, rec.foto, 44, 'avatar--rec') + esc(rec.nome) + ' ' + selo(rec.situacao, rotuloSituacao(rec.situacao)) + '</div>' +
        '<div class="rec__texto">' + paragrafos(texto(rel, rec.textoId)) + '</div>' +
        (margem !== null ? '<div class="rec__margem"><span class="rec__margem-num">+' + esc(numero(margem)) + ' pts</span> sobre ' + esc(seg.nome) + ' (' + esc(numero(seg.total)) + ')' + (ehNumero(corte) ? ' · corte em ' + esc(numeroCurto(corte)) + ' pts' : '') + '</div>' : '') +
        '</div>';
    } else {
      h += '<div class="obs obs--info"><div class="obs__tit">Sem recomendação ainda</div><p>Nenhum finalista tem nota suficiente para formar o ranking.</p></div>';
    }
    if (ctx.linhas.length) {
      h += '<ol class="ranklista">' + ctx.linhas.slice(0, 4).map(function (l) {
        return '<li class="' + (l.posicao === 1 ? 'eh-topo' : '') + '">' +
          '<span class="ranklista__pos">' + esc(l.posicao) + 'º</span>' +
          '<span class="ranklista__nome">' + avatarSeFoto(l.nome, l.foto, 32, 'avatar--rank') + '<strong>' + esc(l.nome) + '</strong>' + selo(l.situacao, rotuloSituacao(l.situacao)) + '</span>' +
          '<span class="ranklista__nota">' + esc(numero(l.total)) + '<small>/100</small></span></li>';
      }).join('') + '</ol>';
    }
    var leituras = lista(rel.sumario && rel.sumario.leituras);
    if (leituras.length) {
      h += '<h3 class="h3 mt48">' + (leituras.length === 1 ? 'Uma leitura que resume o processo' : numeroPorExtenso(leituras.length, true) + ' leituras que resumem o processo') + '</h3>' +
        '<div class="leituras' + (leituras.length % 2 === 0 ? ' leituras--par' : '') + '">' + leituras.map(function (l, i) {
          return '<article class="leitura"><div class="leitura__n">' + (i < 9 ? '0' : '') + (i + 1) + '</div>' +
            '<h4>' + esc(l.titulo) + '</h4>' + paragrafos(texto(rel, l.textoId)) + '</article>';
        }).join('') + '</div>';
    }
    return secao(s, false, cabecalhoPagina(s, p.empresa) + h);
  }

  function secao(s, alt, conteudo, classe) {
    return '<section class="secao" id="' + s.id + '" data-secao="' + s.id + '" aria-labelledby="' + s.id + '-tit">' +
      '<h2 class="visualmente-oculto" id="' + s.id + '-tit">' + esc(s.n + ' · ' + s.titulo) + '</h2>' +
      divisor(s, alt) +
      '<div class="pagina' + (classe ? ' ' + classe : '') + '">' + conteudo + '</div></section>';
  }

  /* ------------------------------------------------------------------ 02 atração */

  function barrasHorizontais(itens, total, classe) {
    var max = 0;
    itens.forEach(function (it) { if (it.qtd > max) max = it.qtd; });
    return '<ul class="barras' + (classe ? ' ' + classe : '') + '">' + itens.map(function (it) {
      var p = ehNumero(it.pct) ? it.pct : (total ? it.qtd / total * 100 : null);
      return '<li><span class="barras__rot">' + esc(it.rotulo) + '</span>' +
        barra(it.qtd, max, '', it.rotulo + ': ' + it.qtd) +
        '<span class="barras__val"><strong>' + esc(numeroCurto(it.qtd)) + '</strong>' + (p !== null ? ' · ' + esc(pct(p)) : '') + '</span></li>';
    }).join('') + '</ul>';
  }

  // Colunas verticais em SVG (faixas de idade). Sem cores no JS: tudo por classe.
  function colunasSvg(itens, titulo) {
    var max = 0;
    itens.forEach(function (it) { if (it.qtd > max) max = it.qtd; });
    var L = 320, A = 180, base = 150, topo = 22, n = itens.length || 1;
    var passo = L / n, larg = Math.min(44, passo * 0.56);
    var partes = itens.map(function (it, i) {
      var h = max ? (it.qtd / max) * (base - topo) : 0;
      var x = i * passo + (passo - larg) / 2;
      var cx = i * passo + passo / 2;
      return '<rect class="svg-col' + (it.qtd === max && max > 0 ? ' svg-col--max' : '') + '" x="' + x.toFixed(1) + '" y="' + (base - h).toFixed(1) + '" width="' + larg.toFixed(1) + '" height="' + Math.max(h, 0).toFixed(1) + '" rx="2"></rect>' +
        '<text class="svg-val" x="' + cx.toFixed(1) + '" y="' + (base - h - 6).toFixed(1) + '" text-anchor="middle">' + esc(numeroCurto(it.qtd)) + '</text>' +
        '<text class="svg-eixo" x="' + cx.toFixed(1) + '" y="' + (base + 18) + '" text-anchor="middle">' + esc(it.faixa) + '</text>';
    }).join('');
    return '<svg class="grafico-svg" viewBox="0 0 ' + L + ' ' + A + '" role="img" aria-label="' + esc(titulo) + '">' +
      '<line class="svg-base" x1="0" x2="' + L + '" y1="' + base + '" y2="' + base + '"></line>' + partes + '</svg>';
  }

  function atracao(rel, ctx) {
    var s = SECOES[1];
    var a = rel.atracao || {};
    var total = ehNumero(a.total) ? a.total : ctx.total;
    var h = '<h3 class="h2doc">Dados de atração</h3>' +
      '<p class="lede lede--curta">Números da lista de candidatos do processo, do primeiro contato até a fase final.</p>';
    h += '<div class="mini-nums">' +
      '<div class="mini-num"><div class="mini-num__valor">' + esc(numeroCurto(total)) + '</div><div class="mini-num__rot">candidatos no total</div></div>' +
      '<div class="mini-num"><div class="mini-num__valor">' + esc(moeda(a.pretensaoMedia)) + '</div><div class="mini-num__rot">pretensão salarial média</div></div>' +
      '<div class="mini-num"><div class="mini-num__valor">' + esc(moeda(a.ultimoSalarioMedio)) + '</div><div class="mini-num__rot">último salário médio</div></div>' +
      '</div>';
    var porStatus = lista(a.porStatus).map(function (x) { return { rotulo: x.status, qtd: x.qtd, pct: x.pct }; });
    if (porStatus.length) {
      h += '<div class="cartao-doc mt32"><div class="rotulo-doc">Funil por status</div>' + barrasHorizontais(porStatus, total, 'barras--funil') +
        (texto(rel, a.textoId) ? '<div class="nota-doc"><span class="nota-doc__tag">Leitura</span>' + paragrafos(texto(rel, a.textoId)) + '</div>' : '') + '</div>';
    }
    // Pretensão × último salário
    if (ehNumero(a.pretensaoMedia) || ehNumero(a.ultimoSalarioMedio)) {
      var maxS = Math.max(a.pretensaoMedia || 0, a.ultimoSalarioMedio || 0);
      var dif = ehNumero(a.pretensaoMedia) && ehNumero(a.ultimoSalarioMedio) ? a.pretensaoMedia - a.ultimoSalarioMedio : null;
      var leitura = dif === null ? '' : Math.abs(dif) <= Math.max(50, (a.ultimoSalarioMedio || 0) * 0.03) ?
        'Pretensão e último salário praticamente iguais: a expectativa está ancorada na trajetória real, o que facilita a proposta.' :
        dif > 0 ? 'Em média, os candidatos pedem ' + moeda(dif) + ' a mais do que recebiam. É o espaço normal de uma troca de emprego.' :
          'Em média, a pretensão fica ' + moeda(-dif) + ' abaixo do último salário: sinal de pressão por recolocação.';
      h += '<div class="cartao-doc mt24"><div class="rotulo-doc">Pretensão salarial × último salário (média)</div>' +
        '<ul class="barras barras--duplas">' +
          '<li><span class="barras__rot"><span class="legenda legenda--s1" aria-hidden="true"></span>Pretensão</span>' + barra(a.pretensaoMedia, maxS, 'barra--s1', 'Pretensão média ' + moeda(a.pretensaoMedia)) + '<span class="barras__val"><strong>' + esc(moeda(a.pretensaoMedia)) + '</strong></span></li>' +
          '<li><span class="barras__rot"><span class="legenda legenda--s2" aria-hidden="true"></span>Último salário</span>' + barra(a.ultimoSalarioMedio, maxS, 'barra--s2', 'Último salário médio ' + moeda(a.ultimoSalarioMedio)) + '<span class="barras__val"><strong>' + esc(moeda(a.ultimoSalarioMedio)) + '</strong></span></li>' +
        '</ul>' + (leitura ? '<p class="nota-curta">' + esc(leitura) + '</p>' : '') + '</div>';
    }
    var faixas = lista(a.idadeFaixas).filter(function (f) { return f && ehNumero(f.qtd); });
    var trab = lista(a.statusTrabalho).map(function (x) { return { rotulo: x.rotulo, qtd: x.qtd }; });
    if (faixas.length || trab.length) {
      h += '<h3 class="h3 mt48">Perfil do público</h3><p class="nota-curta">Retrato de quem se inscreveu. Serve para entender o mercado; não é critério de escolha.</p><div class="duas mt24">';
      if (faixas.length) h += '<div class="cartao-doc"><div class="rotulo-doc">Faixa de idade</div>' + colunasSvg(faixas, 'Candidatos por faixa de idade') + '</div>';
      if (trab.length) {
        var tt = 0; trab.forEach(function (x) { tt += x.qtd || 0; });
        h += '<div class="cartao-doc"><div class="rotulo-doc">Situação de trabalho</div>' + barrasHorizontais(trab, tt) + '</div>';
      }
      h += '</div>';
    }
    return secao(s, true, cabecalhoPagina(s, numeroCurto(total) + ' candidatos') + h);
  }

  /* ------------------------------------------------------------------ 03 avaliação técnica */

  function tecnica(rel, ctx) {
    var s = SECOES[2];
    var etapas = lista(rel.etapas);
    var cfg = rel.config || {};
    var h = '<h3 class="h2doc">' + (etapas.length === 1 ? 'Uma etapa' : numeroPorExtenso(etapas.length, true) + ' etapas') + ', pesos definidos</h3>';
    var pend = ctx.etapasPendentes;
    h += '<p class="lede lede--curta">' + esc(ctx.etapasFeitas === etapas.length ? 'Todas as etapas foram aplicadas.' :
      'As etapas já aplicadas somam ' + numeroCurto(100 - ctx.pesoPendentePct) + '% do peso. ' + (pend.length === 1 ? 'A etapa ' + pend[0] + ' ainda está' : 'As etapas ' + pend.join(', ') + ' ainda estão') + ' em aberto.') + '</p>';
    h += '<div class="pesos">' + etapas.map(function (e, i) {
      var pctPeso = ctx.somaPesos ? e.peso / ctx.somaPesos * 100 : 0;
      return '<div class="peso' + (e.pendente ? ' peso--pendente' : '') + '">' +
        barra(pctPeso, 100, 'barra--fina') +
        '<div class="peso__cab"><span class="peso__n">' + (i < 9 ? '0' : '') + (i + 1) + '</span><span class="peso__pct">' + esc(numeroCurto(Math.round(pctPeso * 10) / 10)) + '%</span></div>' +
        '<h4>' + esc(e.nome) + '</h4><p>' + esc(e.descricao || '') + '</p>' +
        (e.pendente ? '<p class="peso__aberto">Peso em aberto · ainda não aplicada</p>' : '') + '</div>';
    }).join('') + '</div>';
    if (ehNumero(cfg.corte)) {
      h += '<div class="cortes">' +
        '<div class="corte corte--aprovado"><div class="rotulo-doc">Aprovação direta</div><div class="corte__val">' + esc(numeroCurto(cfg.corte)) + '+ pts</div></div>' +
        (ehNumero(cfg.faixaAvaliar) ? '<div class="corte corte--avaliar"><div class="rotulo-doc">Avaliar individualmente</div><div class="corte__val">' + esc(numeroCurto(cfg.faixaAvaliar)) + '–' + esc(numeroCurto(cfg.corte)) + ' pts</div></div>' +
        '<div class="corte corte--nao"><div class="rotulo-doc">Não recomendado</div><div class="corte__val">&lt; ' + esc(numeroCurto(cfg.faixaAvaliar)) + ' pts</div></div>' : '') +
        '</div>';
    }
    etapas.forEach(function (e, i) {
      h += '<article class="etapa" data-etapa="' + esc(e.id) + '">' +
        '<div class="etapa__cab"><span class="etapa__n">' + (i < 9 ? '0' : '') + (i + 1) + '</span><div><h3 class="h3">' + esc(e.nome) + '</h3>' +
        '<p class="etapa__desc">' + esc(e.descricao || '') + (e.pendente ? '' : ' Peso: ' + esc(numeroCurto(e.pesoNormalizado)) + '% da nota técnica.') + '</p></div></div>';
      if (e.pendente) {
        h += '<div class="obs obs--info"><div class="obs__tit">Etapa pendente</div><p>Ainda não aplicada. O peso dela (' + esc(numeroCurto(e.peso)) + ' de ' + esc(numeroCurto(ctx.somaPesos)) + ') fica em aberto e o ranking pode mudar.</p></div>';
      } else {
        var res = lista(e.resultados);
        var melhor = null, pior = null;
        res.forEach(function (r) {
          if (!ehNumero(r.nota)) return;
          if (melhor === null || r.nota > melhor) melhor = r.nota;
          if (pior === null || r.nota < pior) pior = r.nota;
        });
        if (melhor === pior) melhor = null; // todos iguais: ninguém em destaque
        h += '<table class="tabela-doc tabela-notas"><thead><tr><th scope="col">Candidato</th><th scope="col" class="col-barra"><span class="visualmente-oculto">Barra</span></th><th scope="col" class="num">Nota</th></tr></thead><tbody>' +
          res.map(function (r) {
            var top = melhor !== null && ehNumero(r.nota) && r.nota === melhor && melhor > 0;
            var baixa = ehNumero(r.nota) && r.nota < 4;
            return '<tr' + (top ? ' class="hl"' : '') + '><td>' + esc(r.nome) + '</td><td class="col-barra">' + barra(r.nota, 10, baixa ? 'barra--baixa' : top ? 'barra--top' : '') + '</td>' +
              '<td class="num">' + (ehNumero(r.nota) ? esc(numero(r.nota)) : '<span class="tracinho" title="Sem nota">—</span>') + '</td></tr>';
          }).join('') + '</tbody></table>';
        var dest = lista(e.destaques);
        if (dest.length) h += '<div class="obs-grade' + (dest.length % 2 === 0 ? ' obs-grade--par' : '') + '">' + dest.map(function (d) { return nota(d.tipo, d.titulo, texto(rel, d.textoId)); }).join('') + '</div>';
      }
      h += '</article>';
    });
    return secao(s, false, cabecalhoPagina(s, ctx.etapasFeitas + ' de ' + etapas.length + ' etapas') + h);
  }

  /* ------------------------------------------------------------------ 04 DISC */

  function barraDisc(q) {
    var soma = 0;
    LETRAS.forEach(function (L) { soma += ehNumero(q[L]) ? q[L] : 0; });
    if (!soma) return '';
    return '<span class="disc-pilha" role="img" aria-label="' + esc(LETRAS.map(function (L) { return L + ' ' + numeroCurto(q[L] || 0) + '%'; }).join(', ')) + '">' +
      LETRAS.map(function (L) {
        var v = ehNumero(q[L]) ? q[L] : 0;
        if (!v) return '';
        return '<span class="disc-pilha__seg disc-seg-' + L + '" style="width:' + (v / soma * 100).toFixed(1) + '%">' + (v >= 12 ? '<b>' + L + '</b> ' + esc(numeroCurto(v)) : '') + '</span>';
      }).join('') + '</span>';
  }

  function disc(rel, ctx) {
    var s = SECOES[3];
    var d = rel.disc || {};
    var ideal = String(d.perfilIdeal || (rel.config && rel.config.perfilIdeal) || '').toUpperCase().replace(/[^DISC]/g, '');
    var explic = texto(rel, d.explicacaoTextoId) || (rel.config && rel.config.explicacaoPerfil) || '';
    var h = '<h3 class="h2doc">Perfil ideal para a vaga: <span class="perfil-ideal">' + esc(ideal || '—') + '</span></h3>' +
      (explic ? '<p class="lede lede--curta">' + esc(explic) + '</p>' : '');
    h += '<div class="disc-defs">' + LETRAS.map(function (L) {
      var no = ideal.indexOf(L) >= 0;
      return '<div class="disc-def' + (no ? ' disc-def--ideal' : '') + '"><div class="disc-def__letra disc-letra-' + L + '">' + L + '</div>' +
        '<div class="disc-def__nome">' + esc(NOMES_DISC[L].nome) + (no ? ' <span class="disc-def__tag">' + (ideal[0] === L ? 'principal' : 'secundário') + '</span>' : '') + '</div>' +
        '<p>' + esc(NOMES_DISC[L].txt) + '</p></div>';
    }).join('') + '</div>';
    var quadro = lista(d.quadro);
    if (quadro.length) {
      h += '<h3 class="h3 mt48">Quadro dos finalistas</h3><p class="nota-curta">Barra = distribuição do perfil (soma 100%). Letras: <b>D</b> Dominância · <b>I</b> Influência · <b>S</b> Estabilidade · <b>C</b> Conformidade.</p>' +
        '<ul class="quadro-disc">' + quadro.map(function (q) {
          return '<li class="quadro-disc__item">' +
            '<div class="quadro-disc__cab">' + avatarSeFoto(q.nome, q.foto, 32, 'avatar--quadro') + '<strong>' + esc(q.nome) + '</strong><span class="quadro-disc__cod">' + esc(q.codigo || '—') + '</span>' +
            '<span class="quadro-disc__selos">' + selo('ad-' + classeSegura(q.aderencia), 'Aderência ' + rotuloAderencia(q.aderencia).toLowerCase()) +
            selo('cf-' + classeSegura(q.confiabilidade), rotuloConfiabilidade(q.confiabilidade)) + '</span></div>' +
            barraDisc(q) + '</li>';
        }).join('') + '</ul>';
    } else {
      h += '<div class="obs obs--info mt24"><div class="obs__tit">Sem DISC</div><p>Nenhum finalista respondeu ao teste DISC até agora.</p></div>';
    }
    var ach = lista(d.achados);
    if (ach.length) h += '<h3 class="h3 mt48">Achados</h3><div class="obs-grade' + (ach.length % 2 === 0 ? ' obs-grade--par' : '') + '">' + ach.map(function (a) { return nota(a.tipo, a.titulo, texto(rel, a.textoId)); }).join('') + '</div>';
    return secao(s, true, cabecalhoPagina(s, 'Perfil ideal ' + ideal) + h);
  }

  /* ------------------------------------------------------------------ 05 ranking */

  function ranking(rel, ctx) {
    var s = SECOES[4];
    var r = rel.ranking || {};
    var etapas = lista(rel.etapas);
    var cfg = rel.config || {};
    var formula = lista(r.formula);
    var h = '<h3 class="h2doc">Score consolidado</h3>' +
      '<p class="lede lede--curta">Total = nota técnica (0 a 100, pela média ponderada das etapas aplicadas) + bônus.' +
      (ehNumero(r.pesoPendente) && r.pesoPendente > 0 ? ' Ainda há ' + esc(numeroCurto(r.pesoPendente)) + ' de peso em aberto.' : '') + '</p>';
    if (formula.length) {
      h += '<ul class="formula">' + formula.map(function (f) {
        return '<li class="' + (f.pendente ? 'formula--pendente' : '') + '"><span class="formula__peso">' + (f.pendente ? 'em aberto' : esc(numeroCurto(f.pesoNormalizado)) + '%') + '</span><span class="formula__nome">' + esc(f.etapa) + '</span></li>';
      }).join('') + '<li class="formula--bonus"><span class="formula__peso">+ bônus</span><span class="formula__nome">por fora</span></li></ul>';
    }
    var ativas = etapas.filter(function (e) { return !e.pendente; });
    if (ctx.linhas.length) {
      h += '<div class="tabela-mestre-caixa"><table class="tabela-doc tabela-mestre"><thead><tr>' +
        '<th scope="col">#</th><th scope="col">Candidato</th>' +
        ativas.map(function (e) { return '<th scope="col" class="num">' + esc(e.nome) + '</th>'; }).join('') +
        '<th scope="col" class="num">Técnico</th><th scope="col" class="num">Bônus</th><th scope="col" class="num">Total</th><th scope="col">Situação</th><th scope="col">DISC</th>' +
        '</tr></thead><tbody>' + ctx.linhas.map(function (l) {
          var notas = l.notas || {};
          return '<tr class="' + (l.posicao === 1 ? 'hl ' : '') + 'sit-' + classeSegura(l.situacao) + '">' +
            '<td class="pos" data-rotulo="Posição">' + esc(l.posicao) + 'º</td>' +
            '<td class="nome" data-rotulo="Candidato">' + esc(l.nome) + (l.incompleto ? ' <span class="incompleto" title="Faltou nota em alguma etapa (conta como zero)">nota faltando</span>' : '') + '</td>' +
            ativas.map(function (e) { return '<td class="num nota-etapa" data-rotulo="' + esc(e.nome) + '">' + esc(numero(notas[e.id])) + '</td>'; }).join('') +
            '<td class="num" data-rotulo="Técnico">' + esc(numero(l.tecnico)) + '</td>' +
            '<td class="num" data-rotulo="Bônus">' + (ehNumero(l.bonus) && l.bonus > 0 ? '+' : '') + esc(numero(l.bonus)) + '</td>' +
            '<td class="num total" data-rotulo="Total">' + esc(numero(l.total)) + '</td>' +
            '<td class="sit" data-rotulo="Situação">' + selo(l.situacao, rotuloSituacao(l.situacao)) + '</td>' +
            '<td class="disc-cod" data-rotulo="DISC">' + esc(l.disc || '—') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      h += '<h3 class="h3 mt48">Análise posição a posição</h3>' + (ehNumero(cfg.corte) ? '<p class="nota-curta">Barra = total de 0 a 100. O traço verde marca o corte de ' + esc(numeroCurto(cfg.corte)) + ' pontos.</p>' : '') + '<ol class="analise">' + ctx.linhas.map(function (l) {
        return '<li class="analise__item sit-' + classeSegura(l.situacao) + '">' +
          '<div class="analise__pos">' + esc(l.posicao) + 'º</div>' +
          '<div class="analise__corpo"><div class="analise__cab">' + avatarSeFoto(l.nome, l.foto, 36, 'avatar--analise') + '<strong>' + esc(l.nome) + '</strong>' + selo(l.situacao, rotuloSituacao(l.situacao)) +
          '<span class="analise__nota">' + esc(numero(l.total)) + '</span></div>' +
          '<div class="analise__trilho">' + barra(l.total, 100, l.posicao === 1 ? 'barra--top' : '', 'Total ' + numero(l.total) + ' de 100') +
          (ehNumero(cfg.corte) ? '<span class="analise__corte" style="left:' + Math.max(0, Math.min(100, cfg.corte)) + '%" title="Corte ' + esc(numeroCurto(cfg.corte)) + '"></span>' : '') + '</div>' +
          paragrafos(texto(rel, l.analiseTextoId)) + '</div></li>';
      }).join('') + '</ol>';
    }
    return secao(s, false, cabecalhoPagina(s, ctx.linhas.length + ' finalistas') + h);
  }

  /* ------------------------------------------------------------------ 06 encerramento + rodapé */

  function encerramento(rel, ctx) {
    var s = SECOES[5];
    var e = rel.encerramento || {};
    var rec = rel.sumario && rel.sumario.recomendacao;
    var p = rel.processo || {};
    var h = '';
    if (rec) {
      h += '<div class="final">' +
        '<span class="final__chip">' + (ctx.pendente ? 'Recomendação preliminar' : 'Recomendação') + '</span>' +
        '<div class="final__nome">' + esc(rec.nome) + '</div>' +
        '<div class="final__nota"><span class="final__nota-num">' + esc(numero(rec.score)) + '</span><span class="final__nota-den">pontos de 100</span></div>' +
        '</div>';
    }
    h += '<div class="final__texto">' + paragrafos(texto(rel, e.textoId)) + '</div>';
    var passos = lista(e.proximosPassos).map(function (id) { return texto(rel, id); }).filter(Boolean);
    if (passos.length) {
      h += '<div class="passos-cab">Próximos passos</div><ol class="passos">' + passos.map(function (t, i) {
        return '<li><span class="passos__n">' + (i < 9 ? '0' : '') + (i + 1) + '</span><span class="passos__t">' + esc(t) + '</span></li>';
      }).join('') + '</ol>';
    }
    h += '<div class="assina"><div class="assina__linha" aria-hidden="true"></div>' +
      '<div class="assina__nome">' + esc(p.consultor || 'Gestão sem Caos') + '</div>' +
      '<div class="assina__papel">Consultoria · Gestão sem Caos</div>' +
      (rel.geradoEm ? '<div class="assina__data">' + esc(data(rel.geradoEm)) + '</div>' : '') + '</div>';
    return '<section class="secao secao--escura" id="' + s.id + '" data-secao="' + s.id + '" aria-labelledby="' + s.id + '-tit">' +
      '<h2 class="visualmente-oculto" id="' + s.id + '-tit">' + esc(s.n + ' · ' + s.titulo) + '</h2>' +
      '<div class="pagina pagina--escura">' + cabecalhoPagina(s, p.empresa, true) + h + '</div></section>';
  }

  // Logo da Gestão sem Caos (assets/marca/). Capa e rodapé são moldura azul-escura: versão negativa.
  function marcaDoc(onde) {
    var alt = onde === 'capa' ? 32 : 24;
    return '<span class="marca-doc marca-doc--' + onde + '"><img class="marca-doc__logo" src="assets/marca/gsc-logo-negativo.svg" alt="Gestão sem Caos" width="' +
      Math.round(alt * 7.1) + '" height="' + alt + '"></span>';
  }

  function rodape(rel) {
    var p = rel.processo || {};
    return '<footer class="rodape-doc" data-secao="rodape">' +
      marcaDoc('rodape') +
      '<span class="rodape-doc__meta">' + esc([p.consultor ? 'Consultor: ' + p.consultor : '', p.empresa, p.vaga].filter(Boolean).join(' · ')) +
      '<br>Documento confidencial, para uso do contratante. Sem dados de contato dos candidatos.</span></footer>';
  }

  /* ================================================================== MODELOS DA FASE 2 (equipe · liderança · pessoa)
   * Desenhados por dados.modelo (js/relatorio-modelos.js). Mesmo padrão editorial: capa azul-escura, divisores,
   * páginas de papel, encerramento escuro e rodapé. Só campos conhecidos; todo texto passa por esc(). */

  var ROTULO_NIVEL = { fluido: 'Fluido', atencao: 'Atenção', tensao: 'Tensão', indefinido: 'Sem leitura' };
  var ROTULO_TIPO = { lidera: 'lidera', direto: 'trabalha com', indireto: 'cruza com' };
  var LIMITE_HORIZONTAL = 4; // até 4 liderados diretos do topo: linha horizontal (computador e A4)

  function rotuloNivel(n) { return ROTULO_NIVEL[n] || ROTULO_NIVEL.indefinido; }
  function nivelSeguro(n) { return ROTULO_NIVEL[n] ? n : 'indefinido'; }
  function letraDisc(codigo) {
    var l = String(codigo || '').toUpperCase().charAt(0);
    return LETRAS.indexOf(l) >= 0 ? l : '';
  }
  function codigoSeguro(c) { return String(c || '').toUpperCase().replace(/[^DISC]/g, '').slice(0, 2); }
  function seloNivel(n, pontuacao) {
    var nv = nivelSeguro(n);
    return '<span class="selo-doc selo-doc--nv-' + nv + '">' + esc(rotuloNivel(nv)) + (ehNumero(pontuacao) ? ' · ' + esc(numeroCurto(pontuacao)) : '') + '</span>';
  }
  function listaItens(itens, classe) {
    var l = lista(itens).filter(function (t) { return typeof t === 'string' && t; });
    if (!l.length) return '';
    return '<ul class="itens-doc' + (classe ? ' ' + classe : '') + '">' + l.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
  }
  function n2(i) { return (i < 9 ? '0' : '') + (i + 1); }

  // Cartão de uma pessoa (organograma e listas): quadrado com a letra DISC na cor do fator.
  function cartaoPessoa(no) {
    var l = letraDisc(no.codigo || no.primario);
    var cod = codigoSeguro(no.codigo);
    var comFoto = fotoValida(no.foto);
    var letra = comFoto ?
      '<span class="org-cartao__letra org-cartao__letra--foto" style="position:relative">' + avatarHtml(no.nome, no.foto, 36, 'org-cartao__foto') +
        '<b class="org-cartao__selo' + (l ? ' disc-fundo-' + l : '') + '" aria-hidden="true">' + (l || '–') + '</b></span>' :
      '<span class="org-cartao__letra' + (l ? ' disc-fundo-' + l : '') + '" aria-hidden="true">' + (l || '–') + '</span>';
    return '<div class="org-cartao' + (l ? ' org-cartao--' + l : ' org-cartao--sem') + (no.foco ? ' org-cartao--foco' : '') + (comFoto ? ' org-cartao--com-foto' : '') + '">' + letra +
      '<span class="org-cartao__txt"><strong class="org-cartao__nome">' + esc(no.nome) + '</strong>' +
      (no.cargo ? '<span class="org-cartao__cargo">' + esc(no.cargo) + '</span>' : '') +
      '<span class="org-cartao__cod">' + (cod ? 'Perfil ' + esc(cod) : 'Sem teste') + (no.foco ? ' · em integração' : '') + '</span></span></div>';
  }

  // Organograma: árvore de cartões ligados por linhas (CSS). Celular: lista recuada por nível.
  // Computador e A4: os liderados diretos do topo ficam lado a lado (até 4); níveis abaixo descem em lista.
  // Aceita o organograma do DISC_COMPATIBILIDADE.montar ou o snapshot dos modelos: { raizes: [{nome, cargo, codigo, filhos}] }.
  function organogramaHtml(organograma, opcoes) {
    var op = opcoes || {};
    var raizes = lista(organograma && organograma.raizes);
    var focoId = op.focoId != null ? String(op.focoId) : null;
    function marcar(no) { return focoId !== null && String(no.id) === focoId ? Object.assign({}, no, { foco: true }) : no; }
    function ramo(no, nivel) {
      var filhos = lista(no.filhos);
      var linha = nivel === 0 && filhos.length > 1 && filhos.length <= LIMITE_HORIZONTAL;
      return '<li class="org__no">' + cartaoPessoa(marcar(no)) +
        (filhos.length ? '<ul class="org__filhos' + (linha ? ' org__filhos--linha' : '') + (filhos.length === 1 ? ' org__filhos--um' : '') + '">' +
          filhos.map(function (f) { return ramo(f, nivel + 1); }).join('') + '</ul>' : '') + '</li>';
    }
    var arvores = raizes.filter(function (r) { return lista(r.filhos).length; });
    var soltos = raizes.filter(function (r) { return !lista(r.filhos).length; });
    if (!raizes.length) return '<div class="org org--vazio"><p class="nota-curta">Nenhum colaborador no organograma.</p></div>';
    var rotulo = op.rotulo || 'Organograma';
    return '<div class="org" role="group" aria-label="' + esc(rotulo) + '">' +
      arvores.map(function (r) { return '<ul class="org__arvore">' + ramo(r, 0) + '</ul>'; }).join('') +
      (soltos.length ? '<div class="org__soltos">' + (arvores.length ? '<div class="org__soltos-tit">Sem liderança registrada</div>' : '') +
        '<ul class="org__grade">' + soltos.map(function (r) { return '<li>' + cartaoPessoa(marcar(r)) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<p class="org__legenda"><span class="disc-fundo-D">D</span> Dominância <span class="disc-fundo-I">I</span> Influência <span class="disc-fundo-S">S</span> Estabilidade <span class="disc-fundo-C">C</span> Conformidade</p>' +
      '</div>';
  }

  function capaModelo(c) {
    var numeros = lista(c.numeros).map(function (n) {
      return '<div class="capa__num' + (n.destaque ? ' capa__num--destaque' : '') + (n.texto ? ' capa__num--texto' : '') + '">' +
        '<div class="capa__num-valor">' + esc(n.valor) + (n.sufixo ? '<small>' + esc(n.sufixo) + '</small>' : '') + '</div>' +
        '<div class="capa__num-rotulo">' + esc(n.rotulo) + '</div></div>';
    }).join('');
    var rodape = lista(c.rodape).map(function (r) {
      return '<div><div class="capa__rod-rotulo">' + esc(r.rotulo) + '</div><div class="capa__rod-valor">' +
        lista(r.linhas).filter(Boolean).map(esc).join('<br>') + '</div></div>';
    }).join('');
    return '<section class="capa capa--modelo" id="capa" data-secao="capa" aria-label="Capa">' +
      '<div class="capa__grade" aria-hidden="true"></div>' +
      '<header class="capa__topo">' +
        marcaDoc('capa') +
        '<span class="capa__meta"><span>' + esc(c.meta) + '</span></span>' +
      '</header>' +
      '<div class="capa__miolo">' +
        (c.retrato ? '<div class="capa__retrato">' + avatarHtml(c.retrato.nome, c.retrato.foto, 96, 'avatar--capa') + '</div>' : '') +
        '<div class="capa__sobre"><span class="ponto" aria-hidden="true"></span>' + esc(c.sobre) + '</div>' +
        '<h1 class="capa__titulo">' + c.tituloHtml + '</h1>' +
        (c.subtitulo ? '<p class="capa__subtitulo">' + esc(c.subtitulo) + '</p>' : '') +
        (numeros ? '<div class="capa__numeros">' + numeros + '</div>' : '') +
      '</div>' +
      '<footer class="capa__rodape">' + rodape + '</footer>' +
    '</section>';
  }

  function indiceModelo(secoes, titulo, sub) {
    return '<section class="pagina pagina--creme" id="indice" data-secao="indice" aria-labelledby="indice-tit">' +
      '<div class="pag-cab"><span class="pag-cab__num">Índice</span><span class="pag-cab__regua" aria-hidden="true"></span></div>' +
      '<div class="indice"><div class="indice__tit"><h2 id="indice-tit">' + esc(titulo) + '</h2><p>' + esc(sub) + '</p></div>' +
      '<ol class="indice__lista">' + secoes.map(function (s) {
        return '<li><a href="#' + s.id + '"><span class="indice__n">' + s.n + '</span><span class="indice__t">' + esc(s.titulo) + '</span><span class="indice__seta" aria-hidden="true">→</span></a></li>';
      }).join('') + '</ol></div></section>';
  }

  function encerramentoModelo(s, cab, corpo, assinatura, data_) {
    return '<section class="secao secao--escura" id="' + s.id + '" data-secao="' + s.id + '" aria-labelledby="' + s.id + '-tit">' +
      '<h2 class="visualmente-oculto" id="' + s.id + '-tit">' + esc(s.n + ' · ' + s.titulo) + '</h2>' +
      '<div class="pagina pagina--escura">' + cabecalhoPagina(s, cab, true) + corpo +
      '<div class="assina"><div class="assina__linha" aria-hidden="true"></div>' +
      '<div class="assina__nome">' + esc(assinatura || 'Gestão sem Caos') + '</div>' +
      '<div class="assina__papel">Consultoria · Gestão sem Caos</div>' +
      (data_ ? '<div class="assina__data">' + esc(data(data_)) + '</div>' : '') + '</div></div></section>';
  }

  function rodapeModelo(meta, nota) {
    return '<footer class="rodape-doc" data-secao="rodape">' +
      marcaDoc('rodape') +
      '<span class="rodape-doc__meta">' + esc(meta.filter(Boolean).join(' · ')) + '<br>' + esc(nota) + '</span></footer>';
  }

  function pilhaDe(percentuais) { return percentuais && typeof percentuais === 'object' ? barraDisc(percentuais) : ''; }

  /* ------------------------------------------------------------------ MAPA RITMO × FOCO (rodada 3)
   * mapaRitmoFocoHtml(pontos, opcoes) -> <figure class="mapa-rf"> com um SVG autossuficiente (cores nos atributos,
   * funciona também no painel, sem relatorio.css).
   *   pontos: [{ id, nome, natural: {ritmo, foco}, exigido?: {ritmo, foco}, destaque?: bool, codigo? }]
   *     ritmo e foco em −100..100, na convenção de DISC_EXIGIDO.eixos / js/compatibilidade.js:
   *     ritmo + = acelerado (D+I) · foco + = TAREFAS (D+C). Também aceita os percentuais {D,I,S,C} no lugar dos eixos.
   *     Com opcoes.focoPessoas = true, foco + = pessoas (DISC_EXIGIDO.paraPessoas).
   *   opcoes: { rotulo?: aria-label, numerar?: bool (padrão: mais de 8 pontos), legenda?: bool (padrão true),
   *             rotuloExigido?: texto do ponto exigido quando há um só ponto (padrão 'Trabalho') }
   * Eixos: horizontal = foco (tarefas à esquerda, pessoas à direita); vertical = ritmo (acelerado em cima).
   * Quadrantes: D (acelerado + tarefas), I (acelerado + pessoas), S (cauteloso + pessoas), C (cauteloso + tarefas).
   * Pontos pequenos com rótulo (sem bolhas); o rótulo procura um lugar livre; com muitos pontos vira número + lista.
   * Seta tracejada laranja do natural ao exigido. Escala fixa ±60 (o máximo prático dos percentuais 10–40). */

  var MAPA = { W: 360, H: 360, X0: 34, Y0: 30, L: 292, DOM: 60 };
  var COR = { tinta: '#13283f', notus: '#f34405', forte: '#c43803', ambar: '#ff9f40', ardosia: '#324e73', clara: '#8a97ab', fio: '#d6cfc1', mudo: '#6b6960', branco: '#ffffff', papel: '#f5f1ea' };
  var COR_DISC = { D: COR.tinta, I: COR.ambar, S: COR.clara, C: COR.ardosia };

  function r1(n) { return Math.round(n * 10) / 10; }
  // Normaliza para { ritmo, foco } com foco + = tarefas. Aceita eixos ou percentuais {D,I,S,C}.
  function eixoValido(e, focoPessoas) {
    if (!e || typeof e !== 'object') return null;
    if (ehNumero(e.ritmo) && ehNumero(e.foco)) return { ritmo: e.ritmo, foco: focoPessoas ? -e.foco : e.foco };
    var soma = 0, ok = true;
    LETRAS.forEach(function (L) { if (!ehNumero(e[L]) || e[L] < 0) ok = false; else soma += e[L]; });
    if (!ok || soma <= 0) return null;
    var p = {};
    LETRAS.forEach(function (L) { p[L] = e[L] * 100 / soma; });
    return { ritmo: r1(p.D + p.I - p.S - p.C), foco: r1(p.D + p.C - p.I - p.S) };
  }
  function posMapa(e) {
    var lim = MAPA.DOM - 3, meio = MAPA.L / 2;
    var f = Math.max(-lim, Math.min(lim, e.foco)), r = Math.max(-lim, Math.min(lim, e.ritmo));
    // tarefas (foco +) à esquerda, pessoas à direita
    return { x: r1(MAPA.X0 + meio - f / MAPA.DOM * meio), y: r1(MAPA.Y0 + meio - r / MAPA.DOM * meio) };
  }
  function descreverEixos(e) {
    return (e.ritmo >= 0 ? 'ritmo acelerado' : 'ritmo cauteloso') + ' (' + Math.abs(Math.round(e.ritmo)) + ') e foco em ' + (e.foco >= 0 ? 'tarefas' : 'pessoas') + ' (' + Math.abs(Math.round(e.foco)) + ')';
  }

  function mapaRitmoFocoHtml(pontos, opcoes) {
    var op = opcoes || {};
    var M = MAPA, meio = M.L / 2, cx = M.X0 + meio, cy = M.Y0 + meio;
    var fp = !!op.focoPessoas;
    var ps = lista(pontos).filter(function (p) { return p && eixoValido(p.natural, fp); }).map(function (p, i) {
      var nat = eixoValido(p.natural, fp), exi = eixoValido(p.exigido, fp);
      return { n: i + 1, id: p.id == null ? String(i + 1) : p.id, nome: String(p.nome || ''), codigo: codigoSeguro(p.codigo), destaque: !!p.destaque,
        nat: posMapa(nat), exi: exi ? posMapa(exi) : null, natural: nat, exigido: exi };
    });
    var numerar = op.numerar != null ? !!op.numerar : ps.length > 8;
    var temExigido = ps.some(function (p) { return p.exi; });
    var legenda = op.legenda !== false;
    var H = M.H + (legenda ? 28 : 0);

    // Pontos coincidentes: abre um leque pequeno (determinístico) para nenhum esconder o outro.
    var originais = [];
    ps.forEach(function (p) {
      var k = 0;
      originais.forEach(function (q) { if (Math.abs(q.x - p.nat.x) < 6 && Math.abs(q.y - p.nat.y) < 6) k++; });
      originais.push(p.nat);
      if (k) { var ang = k * 2.4, raio = 8 * Math.sqrt(k); p.nat = { x: r1(Math.max(M.X0 + 6, Math.min(M.X0 + M.L - 6, p.nat.x + Math.cos(ang) * raio))), y: r1(Math.max(M.Y0 + 6, Math.min(M.Y0 + M.L - 6, p.nat.y + Math.sin(ang) * raio))) }; }
    });

    var s = '';
    // Quadrantes: fundo branco com fio, cruz central e as letras nos cantos.
    s += '<rect x="' + M.X0 + '" y="' + M.Y0 + '" width="' + M.L + '" height="' + M.L + '" rx="2" fill="' + COR.branco + '" stroke="' + COR.fio + '"/>';
    s += '<line x1="' + cx + '" y1="' + M.Y0 + '" x2="' + cx + '" y2="' + (M.Y0 + M.L) + '" stroke="' + COR.fio + '"/>';
    s += '<line x1="' + M.X0 + '" y1="' + cy + '" x2="' + (M.X0 + M.L) + '" y2="' + cy + '" stroke="' + COR.fio + '"/>';
    var QUADS = [
      { L: 'D', x: M.X0 + 12, y: M.Y0 + 30, a: 'start' }, { L: 'I', x: M.X0 + M.L - 12, y: M.Y0 + 30, a: 'end' },
      { L: 'C', x: M.X0 + 12, y: M.Y0 + M.L - 24, a: 'start' }, { L: 'S', x: M.X0 + M.L - 12, y: M.Y0 + M.L - 24, a: 'end' }
    ];
    s += QUADS.map(function (q) {
      return '<g class="mapa-rf__quad" aria-hidden="true"><text x="' + q.x + '" y="' + q.y + '" text-anchor="' + q.a + '" font-size="28" font-weight="700" fill="' + COR_DISC[q.L] + '" class="mapa-rf__letra">' + q.L + '</text>' +
        '<text x="' + q.x + '" y="' + (q.y + 15) + '" text-anchor="' + q.a + '" font-size="11" fill="' + COR.mudo + '" class="mapa-rf__mono">' + esc(NOMES_DISC[q.L].nome) + '</text></g>';
    }).join('');
    // Eixos
    s += '<g class="mapa-rf__eixos" font-size="11" fill="' + COR.mudo + '" aria-hidden="true">' +
      '<text x="' + cx + '" y="' + (M.Y0 - 10) + '" text-anchor="middle" class="mapa-rf__mono">↑ ACELERADO</text>' +
      '<text x="' + cx + '" y="' + (M.Y0 + M.L + 20) + '" text-anchor="middle" class="mapa-rf__mono">↓ CAUTELOSO</text>' +
      '<text transform="translate(' + (M.X0 - 12) + ' ' + cy + ') rotate(-90)" text-anchor="middle" class="mapa-rf__mono">TAREFAS</text>' +
      '<text transform="translate(' + (M.X0 + M.L + 18) + ' ' + cy + ') rotate(90)" text-anchor="middle" class="mapa-rf__mono">PESSOAS</text></g>';

    // Setas (por baixo dos pontos)
    ps.forEach(function (p) {
      if (!p.exi) return;
      var dx = p.exi.x - p.nat.x, dy = p.exi.y - p.nat.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 14) return; // perto demais: os dois círculos já se tocam
      var ux = dx / d, uy = dy / d;
      var x1 = r1(p.nat.x + ux * 7), y1 = r1(p.nat.y + uy * 7), xb = p.exi.x - ux * 8, yb = p.exi.y - uy * 8;
      var x2 = r1(xb - ux * 6), y2 = r1(yb - uy * 6);
      var ponta = [[r1(xb), r1(yb)], [r1(xb - ux * 8 - uy * 4.5), r1(yb - uy * 8 + ux * 4.5)], [r1(xb - ux * 8 + uy * 4.5), r1(yb - uy * 8 - ux * 4.5)]];
      s += '<g class="mapa-rf__seta" data-id="' + esc(p.id) + '"><line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + COR.notus + '" stroke-width="1.75" stroke-dasharray="4 3" stroke-linecap="round"/>' +
        '<polygon points="' + ponta.map(function (q) { return q.join(','); }).join(' ') + '" fill="' + COR.notus + '"/></g>';
    });

    // Rótulos: procura uma posição livre (direita, esquerda, cima, baixo, diagonais) sem cobrir outro rótulo ou ponto.
    var ocupados = [];
    ps.forEach(function (p) {
      ocupados.push({ x: p.nat.x - 6, y: p.nat.y - 6, w: 12, h: 12 });
      if (p.exi) ocupados.push({ x: p.exi.x - 7, y: p.exi.y - 7, w: 14, h: 14 });
    });
    function cruza(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
    function dentro(b) { return b.x >= M.X0 + 2 && b.x + b.w <= M.X0 + M.L - 2 && b.y >= M.Y0 + 2 && b.y + b.h <= M.Y0 + M.L - 2; }
    function rotular(txt, x, y, peso) {
      var w = Math.max(8, txt.length * (numerar ? 7 : 6.6)), h = 14;
      var cands = [
        { x: x + 9, y: y - 7, a: 'start' }, { x: x - 9 - w, y: y - 7, a: 'end' },
        { x: x - w / 2, y: y - 22, a: 'middle' }, { x: x - w / 2, y: y + 8, a: 'middle' },
        { x: x + 7, y: y - 20, a: 'start' }, { x: x + 7, y: y + 6, a: 'start' },
        { x: x - 7 - w, y: y - 20, a: 'end' }, { x: x - 7 - w, y: y + 6, a: 'end' }
      ];
      var escolhido = null;
      for (var i = 0; i < cands.length && !escolhido; i++) {
        var b = { x: cands[i].x, y: cands[i].y, w: w, h: h };
        if (!dentro(b)) continue;
        var livre = true;
        for (var j = 0; j < ocupados.length; j++) {
          var o = ocupados[j];
          // o próprio ponto não conta (é ele que o rótulo acompanha)
          if (Math.abs(o.x + o.w / 2 - x) < 0.5 && Math.abs(o.y + o.h / 2 - y) < 0.5) continue;
          if (cruza(b, o)) { livre = false; break; }
        }
        if (livre) escolhido = cands[i];
      }
      if (!escolhido) { escolhido = x > cx ? cands[1] : cands[0]; }
      ocupados.push({ x: escolhido.x, y: escolhido.y, w: w, h: h });
      var tx = escolhido.a === 'start' ? escolhido.x : escolhido.a === 'end' ? escolhido.x + w : escolhido.x + w / 2;
      return '<text x="' + r1(tx) + '" y="' + r1(escolhido.y + 11) + '" text-anchor="' + escolhido.a + '" font-size="12" font-weight="' + (peso || 600) + '" fill="' + COR.tinta + '" class="mapa-rf__rot" paint-order="stroke" stroke="' + COR.branco + '" stroke-width="3" stroke-linejoin="round">' + esc(txt) + '</text>';
    }

    var rotuloExigido = op.rotuloExigido || 'Trabalho';
    // Camadas: círculos do exigido por baixo; pontos naturais e rótulos por cima (nenhum ponto some sob um círculo).
    s += ps.filter(function (p) { return p.exi; }).map(function (p) {
      return '<circle class="mapa-rf__exigido" data-id="' + esc(p.id) + '" cx="' + p.exi.x + '" cy="' + p.exi.y + '" r="5.5" fill="' + COR.branco + '" stroke="' + COR.notus + '" stroke-width="2"/>';
    }).join('');
    s += ps.map(function (p) {
      var titulo = p.nome + (p.codigo ? ' (' + p.codigo + ')' : '') + ': ' + descreverEixos(p.natural) + (p.exigido ? '; o trabalho pede ' + descreverEixos(p.exigido) : '');
      var g = '<g class="mapa-rf__ponto' + (p.destaque ? ' mapa-rf__ponto--destaque' : '') + '" data-id="' + esc(p.id) + '"><title>' + esc(titulo) + '</title>';
      if (p.destaque) g += '<circle cx="' + p.nat.x + '" cy="' + p.nat.y + '" r="9" fill="none" stroke="' + COR.notus + '" stroke-width="1.5"/>';
      g += '<circle class="mapa-rf__natural" cx="' + p.nat.x + '" cy="' + p.nat.y + '" r="5" fill="' + COR.tinta + '" stroke="' + COR.branco + '" stroke-width="1.5"/>';
      g += rotular(numerar ? String(p.n) : p.nome, p.nat.x, p.nat.y, p.destaque ? 700 : 600);
      if (p.exi && ps.length === 1) g += rotular(rotuloExigido, p.exi.x, p.exi.y, 500);
      return g + '</g>';
    }).join('');

    if (legenda) {
      var ly = M.H + 14;
      s += '<g class="mapa-rf__legenda" font-size="11" fill="' + COR.mudo + '" aria-hidden="true">' +
        '<circle cx="' + (M.X0 + 5) + '" cy="' + (ly - 4) + '" r="5" fill="' + COR.tinta + '"/><text x="' + (M.X0 + 15) + '" y="' + ly + '">Jeito natural</text>' +
        (temExigido ? '<circle cx="' + (M.X0 + 112) + '" cy="' + (ly - 4) + '" r="5" fill="' + COR.branco + '" stroke="' + COR.notus + '" stroke-width="2"/><text x="' + (M.X0 + 122) + '" y="' + ly + '">Exigido pelo trabalho</text>' +
          '<line x1="' + (M.X0 + 248) + '" y1="' + (ly - 4) + '" x2="' + (M.X0 + 270) + '" y2="' + (ly - 4) + '" stroke="' + COR.notus + '" stroke-width="1.75" stroke-dasharray="4 3"/><polygon points="' + (M.X0 + 278) + ',' + (ly - 4) + ' ' + (M.X0 + 270) + ',' + (ly - 8.5) + ' ' + (M.X0 + 270) + ',' + (ly + 0.5) + '" fill="' + COR.notus + '"/>' : '') +
        '</g>';
    }

    var aria = (op.rotulo || 'Mapa de ritmo e foco') + '. Eixo vertical: ritmo, de cauteloso a acelerado. Eixo horizontal: foco, de tarefas a pessoas. ' +
      (ps.length ? ps.map(function (p) { return p.nome + ': ' + descreverEixos(p.natural) + (p.exigido ? ', trabalho pede ' + descreverEixos(p.exigido) : ''); }).join('; ') + '.' : 'Sem pontos.');
    var svg = '<svg class="mapa-rf__svg" viewBox="0 0 ' + M.W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(aria) + '" style="display:block;max-width:100%;height:auto">' + s + '</svg>';
    var listaNum = numerar && ps.length ? '<ol class="mapa-rf__lista">' + ps.map(function (p) {
      return '<li><span class="mapa-rf__n">' + p.n + '</span> ' + esc(p.nome) + (p.codigo ? ' <span class="mapa-rf__cod">' + esc(p.codigo) + '</span>' : '') + '</li>';
    }).join('') + '</ol>' : '';
    return '<figure class="mapa-rf' + (temExigido ? ' mapa-rf--exigido' : '') + '" style="margin:0 auto;max-width:440px">' + svg + listaNum + '</figure>';
  }

  /* ------------------------------------------------------------------ RÉGUA DE INTENSIDADE
   * reguaHtml(fatores, regua) — uma linha por fator com 5 faixas (muito baixa → muito alta) e o marcador no percentual.
   *   fatores: [{ letra, nome, pct, faixa?, faixaRotulo?, texto?: {resumo, comportamento, excesso, falta} }]
   *   regua:   { limites: [15, 22, 29, 36], min: 10, max: 40, rotulos: {muito_baixa: ..., ...} } (snapshot; padrão abaixo) */
  var REGUA_PADRAO = { limites: [15, 22, 29, 36], min: 10, max: 40,
    rotulos: { muito_baixa: 'Muito baixa', baixa: 'Baixa', media: 'Média', alta: 'Alta', muito_alta: 'Muito alta' } };
  var FAIXAS = ['muito_baixa', 'baixa', 'media', 'alta', 'muito_alta'];
  function reguaDe(r) {
    var x = r && typeof r === 'object' ? r : {};
    var lim = lista(x.limites).filter(ehNumero);
    if (lim.length !== 4) lim = REGUA_PADRAO.limites;
    var min = ehNumero(x.min) ? x.min : REGUA_PADRAO.min, max = ehNumero(x.max) ? x.max : REGUA_PADRAO.max;
    if (!(max > min)) { min = REGUA_PADRAO.min; max = REGUA_PADRAO.max; }
    var rot = {};
    FAIXAS.forEach(function (f) { rot[f] = (x.rotulos && typeof x.rotulos[f] === 'string' && x.rotulos[f]) || REGUA_PADRAO.rotulos[f]; });
    return { limites: lim, min: min, max: max, rotulos: rot };
  }
  function faixaDe(pctv, rg) {
    for (var i = 0; i < 4; i++) if (pctv < rg.limites[i]) return FAIXAS[i];
    return FAIXAS[4];
  }
  function reguaHtml(fatores, regua) {
    var rg = reguaDe(regua);
    var span = rg.max - rg.min;
    function posPct(v) { return Math.max(0, Math.min(100, (v - rg.min) / span * 100)); }
    var cortes = [rg.min].concat(rg.limites, [rg.max]);
    return '<ul class="regua-doc">' + lista(fatores).map(function (f) {
      var L = letraDisc(f.letra);
      if (!L || !ehNumero(f.pct)) return '';
      var fx = FAIXAS.indexOf(f.faixa) >= 0 ? f.faixa : faixaDe(f.pct, rg);
      var t = f.texto && typeof f.texto === 'object' ? f.texto : {};
      return '<li class="regua-doc__item" data-letra="' + L + '" data-faixa="' + fx + '">' +
        '<div class="regua-doc__cab"><span class="disc-def__letra disc-letra-' + L + ' regua-doc__letra">' + L + '</span>' +
        '<span class="regua-doc__nome">' + esc(f.nome || NOMES_DISC[L].nome) + '</span>' +
        '<span class="regua-doc__faixa regua-doc__faixa--' + fx + '">' + esc(f.faixaRotulo || rg.rotulos[fx]) + ' · ' + esc(pct(f.pct)) + '</span></div>' +
        '<div class="regua-doc__trilho" role="img" aria-label="' + esc((f.nome || NOMES_DISC[L].nome) + ': ' + pct(f.pct) + ', intensidade ' + (f.faixaRotulo || rg.rotulos[fx]).toLowerCase()) + '">' +
          FAIXAS.map(function (nome, i) {
            return '<span class="regua-doc__faixa-seg' + (nome === fx ? ' regua-doc__faixa-seg--ativa' : '') + '" style="left:' + posPct(cortes[i]).toFixed(1) + '%;width:' + (posPct(cortes[i + 1]) - posPct(cortes[i])).toFixed(1) + '%"></span>';
          }).join('') +
          '<span class="regua-doc__marca disc-fundo-' + L + '" style="left:' + posPct(f.pct).toFixed(1) + '%"></span></div>' +
        '<div class="regua-doc__escala" aria-hidden="true"><span>Muito baixa</span><span>Média</span><span>Muito alta</span></div>' +
        (t.resumo ? '<p class="regua-doc__resumo"><strong>' + esc(t.resumo) + '</strong>' + (t.comportamento ? ' ' + esc(t.comportamento) : '') + '</p>' : (t.comportamento ? '<p class="regua-doc__resumo">' + esc(t.comportamento) + '</p>' : '')) +
        (t.excesso ? '<p class="regua-doc__nota"><span class="rotulo-doc">Quando exagerado</span> ' + esc(t.excesso) + '</p>' : '') +
        (t.falta ? '<p class="regua-doc__nota"><span class="rotulo-doc">Quando falta</span> ' + esc(t.falta) + '</p>' : '') +
        '</li>';
    }).join('') + '</ul>';
  }

  // Natural × exigido: barras lado a lado por fator + índice de esforço. x = snapshot.exigido (modelos).
  var ROTULO_FAIXA_ESFORCO = { baixa: 'Esforço baixo', moderada: 'Esforço moderado', alta: 'Esforço alto', muito_alta: 'Esforço muito alto' };
  function naturalExigidoHtml(natural, x) {
    if (!x || typeof x !== 'object' || !x.percentuais) return '';
    var nat = natural || {}, ex = x.percentuais || {};
    var fx = ROTULO_FAIXA_ESFORCO[x.faixa] ? x.faixa : null;
    return '<div class="natex">' +
      '<div class="natex__indice cartao-doc"><div class="rotulo-doc">Esforço de adaptação</div>' +
        '<div class="natex__num">' + (ehNumero(x.indice) ? esc(numeroCurto(x.indice)) + '<small>/100</small>' : '—') + '</div>' +
        (fx ? '<span class="selo-doc selo-doc--esf-' + fx + '">' + esc(ROTULO_FAIXA_ESFORCO[fx]) + '</span>' : '') +
        '<p class="nota-curta">Quanto o jeito que o trabalho pede se afasta do jeito natural (metade da soma das diferenças por fator).</p></div>' +
      '<ul class="natex__fatores cartao-doc">' + LETRAS.map(function (L) {
        var a = ehNumero(nat[L]) ? nat[L] : null, b = ehNumero(ex[L]) ? ex[L] : null;
        var dif = a !== null && b !== null ? Math.round((b - a) * 10) / 10 : null;
        return '<li class="natex__fator"><span class="barras__rot"><span class="legenda disc-fundo-' + L + '" aria-hidden="true"></span>' + esc(NOMES_DISC[L].nome) + '</span>' +
          '<span class="natex__barras">' + barra(a, 50, 'barra--disc-' + L, 'Natural ' + pct(a)) + barra(b, 50, 'barra--exigido', 'Exigido ' + pct(b)) + '</span>' +
          '<span class="natex__val"><strong>' + esc(pct(a)) + '</strong> → <strong>' + esc(pct(b)) + '</strong>' +
          (dif !== null && dif !== 0 ? ' <span class="natex__dif natex__dif--' + (dif > 0 ? 'mais' : 'menos') + '">' + (dif > 0 ? '+' : '−') + esc(numeroCurto(Math.abs(dif))) + '</span>' : '') + '</span></li>';
      }).join('') + '<li class="natex__leg nota-curta"><span class="natex__leg-item"><span class="natex__amostra natex__amostra--nat"></span> natural</span><span class="natex__leg-item"><span class="natex__amostra natex__amostra--ex"></span> exigido pelo trabalho</span><span class="natex__leg-item">escala 0 a 50%</span></li></ul>' +
      '</div>';
  }

  function combinacaoHtml(cb) {
    if (!cb || typeof cb !== 'object' || !cb.nome) return '';
    return '<div class="combinacao-doc"><div class="rotulo-doc">Sua combinação' + (cb.codigo ? ' · ' + esc(codigoSeguro(cb.codigo)) : '') + '</div>' +
      '<div class="combinacao-doc__nome">' + esc(cb.nome) + '</div>' +
      (cb.frase ? '<p class="combinacao-doc__frase">' + esc(cb.frase) + '</p>' : '') +
      (cb.descricao ? '<p>' + esc(cb.descricao) + '</p>' : '') + '</div>';
  }

  /* ------------------------------------------------------------------ EQUIPE
   * Versão 2 do snapshot (js/relatorio-modelos.js, VERSAO_EQUIPE; decisão do painel científico,
   * docs/painel-cientifico/decisao.md, seção 4): sem nota de harmonia, de dupla ou de encaixe, sem "tensão", sem média
   * por fator. Relatórios v1 já publicados guardam esses campos no banco: equipeV2() os converte na exibição (nada
   * deles aparece), com os mesmos textos do motor (tests/relatorio-view.test.js confere que são iguais). */

  var LEITURA_EQUIPE = { fluido: 'fluido', atencao: 'combinados', tensao: 'combinados', combinados: 'combinados' };
  var ROTULO_LEITURA = { fluido: 'Tende a fluir', combinados: 'Pede combinados', indefinido: 'Sem leitura' };
  var ORDEM_TIPO = { lidera: 0, direto: 1, indireto: 2 };
  // Iguais a js/compatibilidade.js (FALTA, EXCESSO, AVISOS[1]) e js/relatorio-modelos.js (ROTULOS_ESTILOS, textos).
  var TEXTO_FALTA = {
    D: 'Ninguém do time descreveu Dominância como estilo forte. Vale conferir: quem destrava decisões e cobra prazos quando a equipe empaca?',
    I: 'Ninguém do time descreveu Influência como estilo forte. Vale conferir: quem cuida de engajar clientes e outras áreas?',
    S: 'Ninguém do time descreveu Estabilidade como estilo forte. Vale conferir: quem garante que as rotinas combinadas sejam mantidas até o fim?',
    C: 'Ninguém do time descreveu Conformidade como estilo forte. Vale conferir se processos, padrões e qualidade têm dono claro.'
  };
  var TEXTO_EXCESSO = {
    D: 'Boa parte do time descreve Dominância como estilo principal. Vale combinar como decidir quando houver divergência e quem dá a palavra final.',
    I: 'Boa parte do time descreve Influência como estilo principal. Vale combinar como registrar acordos e acompanhar prazos.',
    S: 'Boa parte do time descreve Estabilidade como estilo principal. Vale combinar como a equipe se prepara para mudanças e urgências.',
    C: 'Boa parte do time descreve Conformidade como estilo principal. Vale combinar quando uma decisão pode ser tomada sem todos os dados.'
  };
  var ROTULO_ESTILOS = {
    'sem-dados': 'Sem dados', equilibrado: 'Estilos variados', lacunas: 'Algum estilo pouco presente',
    excesso: 'Um estilo predomina', 'lacunas-excesso': 'Um estilo predomina e outro está pouco presente'
  };
  var TEXTO_DISTANCIA = {
    baixa: 'Em média, o que os cargos pedem fica perto do estilo natural de quem respondeu.',
    moderada: 'Em média, os cargos pedem alguns ajustes em relação ao estilo natural de quem respondeu.',
    alta: 'Em média, os cargos pedem um estilo bem diferente do natural de quem respondeu: vale conversar sobre papéis, rotinas e apoios.'
  };
  var ROTULO_DISTANCIA = { baixa: 'Pequena', moderada: 'Moderada', alta: 'Grande', muito_alta: 'Muito grande' };
  var AVISO_RELACOES = 'As sugestões por relação indicam onde a convivência pode pedir combinados. Não medem a qualidade da relação nem preveem desempenho; qualquer dupla pode trabalhar bem com papéis e acordos claros.';
  var TEXTO_EQUIPE = {
    subtitulo: 'Organograma com perfis DISC, estilos do time, combinados sugeridos entre as pessoas e como liderar cada uma.',
    percentuais: 'Os percentuais do DISC são relativos dentro de cada pessoa e somam 100%: mostram o que cada um prioriza, não quanto tem de cada característica. Estilo não é competência.',
    relacoes: 'Sugestões de estilo para cada relação registrada, a partir do DISC de cada pessoa. Não medem a qualidade da relação nem preveem desempenho: confirme em conversa.',
    distancia: 'Mostra quanto cada pessoa diz adaptar o próprio estilo ao cargo. Não mede estresse, saúde nem risco psicossocial e não deve ser usado no PGR.',
    integracao: 'Este capítulo ajuda a receber bem quem foi contratado(a). Não serve para decidir a contratação.',
    naoUse: 'Não use este relatório para decidir contratação, promoção, desligamento, remanejamento, salário ou bônus.',
    noventa: 'Conversa dos 90 dias com metas e retorno nos dois sentidos, com base no trabalho do dia a dia, não no perfil.'
  };
  // O que nunca pode aparecer num relatório de equipe (nem vindo de dados antigos).
  var RE_PROIBIDO_EQUIPE = /\/\s*100|tens[aã]o|harmonia|pedem atenção/i;
  var RE_COMBINAR_CEDO = /^Com .+, vale combinar desde cedo/;
  function textoSemTeste(nomes) {
    return nomes.length + ' pessoa' + (nomes.length > 1 ? 's' : '') + ' sem teste (' + nomes.join(', ') + '): as relações ' + (nomes.length > 1 ? 'delas' : 'dela') + ' ficam sem sugestões.';
  }

  function leituraEquipe(n) { return LEITURA_EQUIPE[n] || 'indefinido'; }
  function seloLeitura(n) {
    var l = leituraEquipe(n);
    return '<span class="selo-doc selo-doc--nv-' + l + '">' + esc(ROTULO_LEITURA[l]) + '</span>';
  }
  function objeto(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function textos(v) { return lista(v).filter(function (t) { return typeof t === 'string' && t; }); }
  function juntarNomes(nomes, conj) { return nomes.length > 1 ? nomes.slice(0, -1).join(', ') + ' ' + (conj || 'e') + ' ' + nomes[nomes.length - 1] : nomes.join(''); }
  function textoEstilos(status, falta, excesso, comum) {
    if (status === 'sem-dados') return 'Ainda não há colaboradores com o teste concluído; os estilos do time aparecem quando as respostas chegarem.';
    var nomesF = falta.map(function (f) { return f.nome; }), nomesE = excesso.map(function (f) { return f.nome; });
    var t;
    if (status === 'equilibrado') t = 'Os quatro estilos do DISC aparecem como fortes em alguém do time, e nenhum é o estilo principal da maior parte das pessoas.';
    else if (status === 'lacunas') t = 'Ninguém do time descreveu ' + juntarNomes(nomesF, 'nem') + ' como estilo forte; os outros estilos aparecem em ao menos uma pessoa.';
    else if (status === 'excesso') t = 'Os quatro estilos aparecem como fortes em alguém do time, e boa parte das pessoas descreve ' + juntarNomes(nomesE) + ' como estilo principal.';
    else t = 'Ninguém do time descreveu ' + juntarNomes(nomesF, 'nem') + ' como estilo forte, e boa parte das pessoas descreve ' + juntarNomes(nomesE) + ' como estilo principal.';
    if (comum) t += ' Estilo principal mais comum: ' + comum.nome + ' (' + comum.qtd + ' de ' + comum.de + ' pessoa' + (comum.de > 1 ? 's' : '') + ').';
    return t;
  }
  // "Com X, vale combinar desde cedo: <dica>." a partir do "como conduzir" do liderado (dados v1).
  function combinarCedo(nomeLiderado, nomeLider, dicas) {
    var deLider = nomeLider + ': ', deLiderado = nomeLiderado + ': ';
    var l = textos(dicas);
    var doLider = l.filter(function (t) { return t.indexOf(deLider) === 0; })[0];
    var daDupla = l.filter(function (t) { return t.indexOf(deLider) !== 0 && t.indexOf(deLiderado) !== 0; })[0];
    var dica = doLider ? doLider.slice(deLider.length) : daDupla || 'combinem papéis, prioridades e a forma de comunicação.';
    dica = dica.replace(/: /, ', ');
    return 'Com ' + nomeLiderado + ', vale combinar desde cedo: ' + dica.charAt(0).toLowerCase() + dica.slice(1);
  }
  // Ordem pelo tipo de relação (lidera → direto → indireto); dentro do tipo, a ordem registrada.
  function porTipo(itens) {
    return itens.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) {
      var ta = ORDEM_TIPO[a.p && a.p.tipo], tb = ORDEM_TIPO[b.p && b.p.tipo];
      return ((ta === undefined ? 3 : ta) - (tb === undefined ? 3 : tb)) || (a.i - b.i);
    }).map(function (x) { return x.p; });
  }

  // Snapshot de equipe pronto para desenhar. v2: como veio (só a ordem dos pares). v1 (sem versao ou versao < 2):
  // tira harmonia, notas, níveis "atenção/tensão", média por fator, rótulos de encaixe e reescreve os textos que mudaram.
  function equipeV2(dados) {
    var d;
    try { d = JSON.parse(JSON.stringify(objeto(dados))); } catch (e) { d = {}; }
    d.pares = porTipo(lista(d.pares).filter(function (p) { return p && typeof p === 'object'; }));
    if (ehNumero(d.versao) && d.versao >= 2) return d;

    var eqb = d.equilibrio = objeto(d.equilibrio);
    var dist = objeto(eqb.distribuicao);
    var comTeste = ehNumero(eqb.comTeste) ? eqb.comTeste : 0;
    var antigos = lista(eqb.falta).concat(lista(eqb.excesso)).map(function (f) { return f && f.texto; });
    eqb.falta = lista(eqb.falta).filter(function (f) { return f && TEXTO_FALTA[f.fator]; })
      .map(function (f) { return { fator: f.fator, nome: NOMES_DISC[f.fator].nome, texto: TEXTO_FALTA[f.fator] }; });
    // "Predomina" passou a ser só contagem: estilo principal de 60% ou mais do time, com 3 ou mais pessoas.
    eqb.excesso = lista(eqb.excesso).filter(function (f) {
      return f && TEXTO_EXCESSO[f.fator] && comTeste >= 3 && ehNumero(dist[f.fator]) && dist[f.fator] / comTeste >= 0.6;
    }).map(function (f) { return { fator: f.fator, nome: NOMES_DISC[f.fator].nome, texto: TEXTO_EXCESSO[f.fator], pessoas: dist[f.fator], total: comTeste }; });
    var status = !comTeste ? 'sem-dados' : eqb.falta.length && eqb.excesso.length ? 'lacunas-excesso' : eqb.falta.length ? 'lacunas' : eqb.excesso.length ? 'excesso' : 'equilibrado';
    var pred = null;
    LETRAS.forEach(function (l) { if (ehNumero(dist[l]) && dist[l] > 0 && (!pred || dist[l] > dist[pred])) pred = l; });
    eqb.status = status;
    eqb.rotulo = ROTULO_ESTILOS[status];
    eqb.texto = textoEstilos(status, eqb.falta, eqb.excesso, pred ? { nome: NOMES_DISC[pred].nome, qtd: dist[pred], de: comTeste } : null);
    delete eqb.media;

    var num = d.numeros = objeto(d.numeros);
    delete num.harmonia;
    num.estilosPresentes = comTeste ? LETRAS.length - eqb.falta.length : null;

    d.pares.forEach(function (p) { p.nivel = leituraEquipe(p.nivel); delete p.pontuacao; });
    d.liderancas = lista(d.liderancas).filter(function (l) { return l && typeof l === 'object'; });
    d.liderancas.forEach(function (l) {
      var lids = lista(l.liderados).filter(function (x) { return x && typeof x === 'object'; });
      l.liderados = lids;
      lids.forEach(function (x) {
        x.nivel = leituraEquipe(x.nivel);
        delete x.pontuacao;
        if (typeof x.tendencia === 'string') x.tendencia = x.tendencia.replace(/ ?A relação tende a ter tensão sem acordos explícitos\./, ' A relação pede combinados claros.').trim();
      });
      l.alertas = textos(l.alertas).map(function (a) {
        var m = /^Relação com (.+?) em tensão \(/.exec(a);
        if (!m) return a;
        var x = lids.filter(function (y) { return y.nome === m[1]; })[0];
        return combinarCedo(m[1], String(l.nome || ''), x && x.comoConduzir);
      });
    });

    // Pontos para conversar: estilos menos e mais presentes, avisos dos líderes (sem os de relação) e quem não fez o
    // teste — a mesma ordem do motor. Nada sobre duplas.
    var sum = objeto(d.sumario);
    var conversar = [];
    function conv(t) { if (t && conversar.indexOf(t) < 0 && !RE_PROIBIDO_EQUIPE.test(t)) conversar.push(t); }
    eqb.falta.concat(eqb.excesso).forEach(function (f) { conv(f.texto); });
    textos(sum.alertas).forEach(function (t) { if (antigos.indexOf(t) < 0 && !/^Ninguém com |^\S+ em excesso: /.test(t)) conv(t); });
    d.liderancas.forEach(function (l) {
      textos(l.alertas).forEach(function (a) { if (!RE_COMBINAR_CEDO.test(a)) conv(a.indexOf(l.nome) === 0 ? a : l.nome + ': ' + a.charAt(0).toLowerCase() + a.slice(1)); });
    });
    var semT = lista(eqb.semTeste).filter(function (x) { return x && x.nome; }).map(function (x) { return x.nome; });
    if (semT.length) conv(textoSemTeste(semT));
    d.sumario = {
      equilibrio: { status: status, rotulo: eqb.rotulo, texto: eqb.texto },
      destaques: textos(sum.destaques).filter(function (t) { return !RE_PROIBIDO_EQUIPE.test(t) && !/tende a fluir com toda/.test(t); }).slice(0, 3),
      alertas: conversar.slice(0, 3)
    };

    if (d.foco && typeof d.foco === 'object') {
      var f = d.foco;
      d.foco = {
        nome: f.nome, cargo: f.cargo, foto: f.foto, codigo: f.codigo, percentuais: f.percentuais, organograma: f.organograma,
        observacoes: f.codigo ? [] : [String(f.nome || 'A pessoa') + ' ainda não respondeu ao DISC: o plano de integração aparece quando houver resposta.'],
        recomendacoes90: lista(f.recomendacoes90).map(function (e) {
          e = objeto(e);
          return { periodo: e.periodo, itens: textos(e.itens).map(function (t) { return /revisar o encaixe/.test(t) ? TEXTO_EQUIPE.noventa : t; }) };
        })
      };
    }

    if (d.pressao && typeof d.pressao === 'object') {
      var pr = d.pressao;
      var fx = TEXTO_DISTANCIA[pr.faixa] ? pr.faixa : pr.faixa === 'muito_alta' ? 'alta' : null;
      pr.textos = (fx ? [TEXTO_DISTANCIA[fx]] : []).concat(NOMES_DISC[pr.maisCobrado] ? ['Fator que os cargos mais pedem: ' + NOMES_DISC[pr.maisCobrado].nome + '.'] : []);
    }

    var av = d.avisos = objeto(d.avisos);
    av.limites = textos(av.limites).map(function (t) { return /^Compatibilidade indica/.test(t) ? AVISO_RELACOES : t; });
    return d;
  }

  function secoesEquipe(d) {
    var s = [
      { id: 'sumario', titulo: 'Sumário executivo', meta: 'Estilos · Destaques · Pontos para conversar' },
      { id: 'organograma', titulo: 'Organograma com perfis', curto: 'Organograma', meta: 'Quem lidera quem · Perfil DISC de cada pessoa' },
      { id: 'equilibrio', titulo: 'Estilos do time', meta: 'Estilo principal · Menos e mais presentes' },
      { id: 'ritmo', titulo: 'Ritmo, foco e decisão', curto: 'Ritmo e foco', meta: 'Mapa do time · Como o grupo decide' + (d.pressao ? ' · Natural × cargo' : '') },
      { id: 'relacoes', titulo: 'Combinados sugeridos por relação', curto: 'Combinados', meta: 'Tende a fluir · Pede combinados' },
      { id: 'lideres', titulo: 'Guia por líder', meta: 'Como conduzir cada liderado' },
      { id: 'pessoas', titulo: 'Como liderar cada pessoa', curto: 'Como liderar', meta: 'Comunicação · Delegação · Feedback · Motivação' }
    ];
    if (d.foco) s.push({ id: 'foco', titulo: 'Plano de integração', curto: 'Integração', meta: 'Organograma · Plano de 90 dias' });
    s.push({ id: 'encerramento', titulo: 'Limites e próximos passos', curto: 'Limites', meta: 'Como usar este relatório' });
    s.forEach(function (x, i) { x.n = n2(i); });
    return s;
  }

  function equipeHtml(dados) {
    var d = equipeV2(dados);
    var emp = objeto(d.empresa);
    var num = objeto(d.numeros);
    var sum = objeto(d.sumario);
    var eqb = objeto(d.equilibrio);
    var S = secoesEquipe(d);
    function sec(id) { return S.filter(function (x) { return x.id === id; })[0]; }
    var presentes = ehNumero(num.estilosPresentes) ? num.estilosPresentes : null;
    var h = capaModelo({
      meta: 'Relatório de equipe', sobre: 'Relatório de equipe · ' + (emp.nome || 'Empresa'),
      tituloHtml: 'Mapa da <em>equipe</em>' + (emp.nome ? '<br>' + esc(emp.nome) : ''),
      subtitulo: TEXTO_EQUIPE.subtitulo,
      numeros: [
        { valor: numeroCurto(num.pessoas), rotulo: 'pessoas no time' },
        { valor: numeroCurto(num.comTeste), rotulo: 'com teste DISC' },
        { valor: numeroCurto(num.relacoes), rotulo: 'relações registradas' },
        { valor: presentes === null ? '—' : numeroCurto(presentes), sufixo: presentes === null ? '' : ' de 4', rotulo: 'estilos presentes', destaque: true }
      ],
      rodape: [
        { rotulo: 'Empresa', linhas: [emp.nome || '—', emp.cidade] },
        { rotulo: 'Consultoria', linhas: ['Gestão sem Caos', d.consultor] },
        { rotulo: 'Emitido em', linhas: [data(d.geradoEm) || '—'] },
        { rotulo: 'Estilos', linhas: [eqb.rotulo || '—'] }
      ]
    });
    h += indiceModelo(S, 'Quem é o time, que estilos ele reúne e como liderar cada pessoa.', 'Leitura comportamental (DISC) da equipe: use para conversar, combinar e desenvolver, não para rotular.');

    // 01 Sumário
    var c = '<p class="lede">' + esc((sum.equilibrio && sum.equilibrio.texto) || eqb.texto || '') + '</p>';
    c += '<div class="mini-nums">' +
      '<div class="mini-num"><div class="mini-num__valor mini-num__valor--texto">' + esc(eqb.rotulo || '—') + '</div><div class="mini-num__rot">estilos do time</div></div>' +
      '<div class="mini-num"><div class="mini-num__valor">' + (presentes === null ? '—' : esc(numeroCurto(presentes)) + '<small> de 4</small>') + '</div><div class="mini-num__rot">estilos presentes</div></div>' +
      '<div class="mini-num"><div class="mini-num__valor">' + esc(numeroCurto(num.relacoes || 0)) + '</div><div class="mini-num__rot">relações registradas</div></div>' +
      '</div>';
    var dest = textos(sum.destaques), conv = textos(sum.alertas);
    c += '<div class="duas mt32"><div><h3 class="h3">Destaques</h3><div class="obs-pilha">' +
      (dest.length ? dest.map(function (t, i) { return '<div class="obs obs--destaque"><div class="obs__tit">' + n2(i) + '</div><p>' + esc(t) + '</p></div>'; }).join('') : '<p class="nota-curta">Sem destaques até aqui.</p>') +
      '</div></div><div><h3 class="h3">Pontos para conversar</h3><div class="obs-pilha">' +
      (conv.length ? conv.map(function (t, i) { return '<div class="obs obs--alerta"><div class="obs__tit">' + n2(i) + '</div><p>' + esc(t) + '</p></div>'; }).join('') : '<p class="nota-curta">Nenhum ponto para conversar até aqui.</p>') +
      '</div></div></div>';
    h += secao(sec('sumario'), false, cabecalhoPagina(sec('sumario'), emp.nome) + c);

    // 02 Organograma
    c = '<h3 class="h2doc">Quem lidera quem</h3><p class="lede lede--curta">Cada cartão traz a letra principal do perfil DISC na cor do fator. Quem ainda não fez o teste aparece com traço.</p>' +
      '<div class="cartao-doc">' + organogramaHtml(d.organograma) + '</div>';
    h += secao(sec('organograma'), true, cabecalhoPagina(sec('organograma'), numeroCurto(num.pessoas) + ' pessoas') + c);

    // 03 Estilos do time (só contagens: os percentuais do DISC são relativos dentro de cada pessoa)
    var dist = objeto(eqb.distribuicao);
    c = '<h3 class="h2doc">' + esc(eqb.rotulo || 'Estilos do time') + '</h3><p class="lede lede--curta">' + esc(eqb.texto || '') + '</p>';
    c += '<div class="cartao-doc"><div class="rotulo-doc">Estilo principal das pessoas</div><ul class="barras">' + LETRAS.map(function (L) {
      return '<li><span class="barras__rot"><span class="legenda disc-fundo-' + L + '" aria-hidden="true"></span>' + esc(NOMES_DISC[L].nome) + '</span>' +
        barra(dist[L] || 0, eqb.comTeste || 1, 'barra--disc-' + L, NOMES_DISC[L].nome + ': ' + (dist[L] || 0)) + '<span class="barras__val"><strong>' + esc(numeroCurto(dist[L] || 0)) + '</strong> de ' + esc(numeroCurto(eqb.comTeste || 0)) + '</span></li>';
    }).join('') + (dist.equilibrado ? '<li><span class="barras__rot">Perfil equilibrado</span>' + barra(dist.equilibrado, eqb.comTeste || 1, '') + '<span class="barras__val"><strong>' + esc(numeroCurto(dist.equilibrado)) + '</strong></span></li>' : '') +
      '</ul><p class="nota-curta">' + esc(TEXTO_EQUIPE.percentuais) + '</p></div>';
    var estilos = lista(eqb.falta).filter(function (f) { return f && f.nome; }).map(function (f) { return nota('alerta', 'Pouco presente: ' + f.nome, f.texto); })
      .concat(lista(eqb.excesso).filter(function (f) { return f && f.nome; }).map(function (f) {
        return nota('alerta', 'Predomina: ' + f.nome + (ehNumero(f.pessoas) && ehNumero(f.total) ? ' (' + f.pessoas + ' de ' + f.total + ' pessoas)' : ''), f.texto);
      }));
    c += '<h3 class="h3 mt48">Estilos menos e mais presentes</h3>' + (estilos.length ? '<div class="obs-grade">' + estilos.join('') + '</div>' :
      '<div class="obs obs--destaque mt24"><div class="obs__tit">Estilos variados</div><p>Cada estilo aparece como forte em ao menos uma pessoa, e nenhum é o estilo principal da maior parte do time.</p></div>');
    var sem = lista(eqb.semTeste).filter(function (x) { return x && x.nome; });
    if (sem.length) c += '<div class="obs obs--info mt24"><div class="obs__tit">Sem teste (' + esc(sem.length) + ')</div><p>' + esc(sem.map(function (x) { return x.nome + (x.cargo ? ' (' + x.cargo + ')' : ''); }).join(', ')) + '. Aplicar o teste completa a leitura do time.</p></div>';
    h += secao(sec('equilibrio'), false, cabecalhoPagina(sec('equilibrio'), numeroCurto(eqb.comTeste) + ' com teste') + c);

    // 04 Ritmo, foco e decisão
    var pts = lista(d.mapa && d.mapa.pontos);
    var dec = d.decisao && typeof d.decisao === 'object' ? d.decisao : null;
    var prs = d.pressao && typeof d.pressao === 'object' ? d.pressao : null;
    c = '<h3 class="h2doc">Onde cada pessoa fica no ritmo e no foco</h3><p class="lede lede--curta">Cada ponto é uma pessoa: em cima, quem acelera; embaixo, quem prefere cautela. À esquerda, o olhar para a tarefa; à direita, para as pessoas.' +
      (pts.some(function (x) { return x && x.exigido; }) ? ' O círculo laranja mostra o que o trabalho pede de quem respondeu a segunda parte do teste.' : '') + '</p>';
    c += pts.length ? '<div class="cartao-doc mapa-cartao">' + mapaRitmoFocoHtml(pts, { rotulo: 'Mapa de ritmo e foco do time' }) + '</div>' :
      '<div class="obs obs--info"><div class="obs__tit">Sem pontos no mapa</div><p>O mapa aparece quando os colaboradores concluírem o teste.</p></div>';
    if (dec) {
      var maxB = 0;
      lista(dec.bases).forEach(function (b) { if (b && ehNumero(b.qtd) && b.qtd > maxB) maxB = b.qtd; });
      c += '<h3 class="h3 mt48">Como o grupo decide</h3><div class="duas"><div class="cartao-doc"><div class="mini-nums mini-nums--2">' +
        '<div class="mini-num"><div class="mini-num__valor mini-num__valor--texto">' + esc(dec.ritmoRotulo || '—') + '</div><div class="mini-num__rot">ritmo de decisão</div></div>' +
        '<div class="mini-num"><div class="mini-num__valor mini-num__valor--texto">' + esc(dec.focoRotulo || '—') + '</div><div class="mini-num__rot">olhar principal</div></div></div>' +
        '<div class="rotulo-doc mt24">Base de decisão (pelo fator principal)</div><ul class="barras">' + lista(dec.bases).filter(Boolean).map(function (b) {
          return '<li><span class="barras__rot">' + esc(b.nome) + '</span>' + barra(b.qtd, maxB || 1, '', b.nome + ': ' + b.qtd) + '<span class="barras__val"><strong>' + esc(numeroCurto(b.qtd || 0)) + '</strong></span></li>';
        }).join('') + '</ul></div><div class="cartao-doc">' + listaItens(dec.textos) + '</div></div>';
    }
    // Distância natural × cargo: só o retrato do grupo; o detalhe por pessoa fica no guia do líder.
    if (prs) {
      c += '<h3 class="h3 mt48">Distância entre o estilo natural e o que o cargo pede</h3>' +
        '<div class="obs obs--info"><p>' + esc(TEXTO_EQUIPE.distancia) + '</p></div>' +
        '<div class="cartao-doc mt24 distancia-doc">' + listaItens(prs.textos) +
        '<p class="nota-curta">' + esc(numeroCurto(prs.comExigido)) + ' de ' + esc(numeroCurto(prs.total)) + ' pessoas responderam a segunda parte do teste. O detalhe por pessoa fica no guia de cada líder.</p></div>';
    }
    h += secao(sec('ritmo'), true, cabecalhoPagina(sec('ritmo'), pts.length + ' no mapa') + c);

    // 05 Combinados sugeridos por relação (sem nota; dois rótulos; ordem pelo tipo de relação)
    var pares = lista(d.pares);
    var cont = { fluido: 0, combinados: 0, indefinido: 0 };
    pares.forEach(function (p) { cont[leituraEquipe(p.nivel)]++; });
    c = '<h3 class="h2doc">Como as relações tendem a funcionar</h3><p class="lede lede--curta">' + esc(TEXTO_EQUIPE.relacoes) + '</p>';
    c += '<div class="niveis-doc niveis-doc--2">' + ['fluido', 'combinados'].map(function (n) {
      return '<div class="nivel-doc nivel-doc--' + n + '"><div class="nivel-doc__valor">' + esc(cont[n]) + '</div><div class="nivel-doc__rot">' + esc(ROTULO_LEITURA[n]) + '</div></div>';
    }).join('') + '</div>';
    if (pares.length) {
      c += '<ol class="pares-doc">' + pares.map(function (p) {
        var nv = leituraEquipe(p.nivel);
        var cods = lista(p.codigos);
        return '<li class="par-doc par-doc--' + nv + '">' +
          '<div class="par-doc__cab"><span class="par-doc__nomes"><strong>' + esc(p.deNome) + '</strong> <span class="par-doc__tipo">' + esc(ROTULO_TIPO[p.tipo] || 'com') + '</span> <strong>' + esc(p.paraNome) + '</strong></span>' +
          seloLeitura(nv) + '</div>' +
          (cods.length === 2 ? '<div class="par-doc__cods">' + esc(codigoSeguro(cods[0]) + ' × ' + codigoSeguro(cods[1])) + '</div>' : '') +
          '<div class="par-doc__grade">' +
          (textos(p.sinergias).length ? '<div><div class="rotulo-doc">Sinergias</div>' + listaItens(p.sinergias) + '</div>' : '') +
          (textos(p.riscos).length ? '<div><div class="rotulo-doc">Pontos para combinar</div>' + listaItens(p.riscos) + '</div>' : '') +
          (textos(p.dicas).length ? '<div><div class="rotulo-doc">Dicas</div>' + listaItens(p.dicas) + '</div>' : '') +
          '</div></li>';
      }).join('') + '</ol>';
    } else c += '<div class="obs obs--info mt24"><div class="obs__tit">Sem relações registradas</div><p>Registre quem lidera quem e quem trabalha com quem para ver as sugestões.</p></div>';
    h += secao(sec('relacoes'), false, cabecalhoPagina(sec('relacoes'), pares.length + ' relações') + c);

    // 06 Guia por líder (aqui fica a distância natural × cargo de cada liderado)
    var lids = lista(d.liderancas).filter(function (l) { return l && typeof l === 'object'; });
    var distPorId = {};
    lista(prs && prs.pessoas).forEach(function (x) { if (x && x.id != null && ehNumero(x.indice)) distPorId[String(x.id)] = x; });
    var temDist = lids.some(function (l) { return lista(l.liderados).some(function (x) { return x && distPorId[String(x.id)]; }); });
    c = '<h3 class="h2doc">Como cada líder pode conduzir a equipe</h3><p class="lede lede--curta">Estilo provável de cada líder e, para cada liderado, a tendência da relação e sugestões para o dia a dia.</p>' +
      (temDist ? '<p class="nota-curta">Distância entre o estilo natural e o que o cargo pede: ' + esc(TEXTO_EQUIPE.distancia.charAt(0).toLowerCase() + TEXTO_EQUIPE.distancia.slice(1)) + '</p>' : '');
    c += lids.length ? lids.map(function (l) {
      return '<article class="lider-doc">' +
        '<div class="lider-doc__cab">' + cartaoPessoa({ nome: l.nome, cargo: l.cargo, codigo: l.codigo, foto: l.foto }) + '</div>' +
        (l.estilo ? '<p class="lider-doc__estilo">' + esc(l.estilo) + '</p>' : '') +
        (textos(l.alertas).length ? '<div class="obs obs--alerta"><div class="obs__tit">Para combinar</div>' + listaItens(l.alertas) + '</div>' : '') +
        '<ul class="liderados-doc">' + lista(l.liderados).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) {
          var dx = distPorId[String(x.id)];
          var fx = dx && ROTULO_DISTANCIA[dx.faixa] ? dx.faixa : null;
          return '<li class="liderado-doc"><div class="liderado-doc__cab"><strong>' + esc(x.nome) + '</strong>' +
            (x.codigo ? '<span class="quadro-disc__cod">' + esc(codigoSeguro(x.codigo)) + '</span>' : '') +
            (x.estiloLiderado ? '<span class="liderado-doc__estilo">' + esc(x.estiloLiderado) + '</span>' : '') + seloLeitura(x.nivel) + '</div>' +
            (x.tendencia ? '<p>' + esc(x.tendencia) + '</p>' : '') +
            (dx && fx ? '<div class="liderado-doc__dist"><span class="rotulo-doc">Distância do natural ao que o cargo pede</span>' +
              barra(dx.indice, 50, 'barra--dist', 'Distância ' + ROTULO_DISTANCIA[fx].toLowerCase()) +
              '<span class="liderado-doc__dist-rot">' + esc(ROTULO_DISTANCIA[fx]) + '</span></div>' : '') +
            (textos(x.comoConduzir).length ? '<div class="rotulo-doc mt16">Como conduzir · sugestão de estilo</div>' + listaItens(x.comoConduzir) : '') + '</li>';
        }).join('') + '</ul></article>';
    }).join('') : '<div class="obs obs--info"><div class="obs__tit">Sem lideranças registradas</div><p>Registre as relações "lidera" para ver o guia por líder.</p></div>';
    h += secao(sec('lideres'), true, cabecalhoPagina(sec('lideres'), lids.length + ' líderes') + c);

    // 07 Como liderar cada pessoa
    var cols = lista(d.colaboradores).filter(function (p) { return p && typeof p === 'object'; });
    c = '<h3 class="h2doc">Como liderar cada pessoa</h3><p class="lede lede--curta">Resumo prático do guia de liderança de cada colaborador. O guia completo pode ser enviado ao líder em um relatório individual.</p>';
    c += '<div class="pessoas-doc">' + cols.map(function (p) {
      return '<article class="pessoa-doc">' + cartaoPessoa(p) +
        (p.codigo ? pilhaDe(p.percentuais) : '') +
        (p.combinacao && p.combinacao.nome ? '<div class="pessoa-doc__comb">' + esc(p.combinacao.nome) + '</div>' : '') +
        (p.estilo ? '<div class="pessoa-doc__estilo">' + esc(p.estilo) + '</div>' : '') +
        (p.resumo ? '<p class="pessoa-doc__resumo">' + esc(p.resumo) + '</p>' : '') +
        (lista(p.secoes).length ? lista(p.secoes).filter(Boolean).map(function (s) {
          return '<div class="pessoa-doc__sec"><div class="rotulo-doc">' + esc(s.titulo) + '</div>' + listaItens(s.itens) + '</div>';
        }).join('') : '<p class="nota-curta">Ainda sem teste: o guia aparece quando a pessoa responder.</p>') +
        '</article>';
    }).join('') + '</div>';
    h += secao(sec('pessoas'), false, cabecalhoPagina(sec('pessoas'), cols.length + ' pessoas') + c);

    // 08 Plano de integração de quem foi contratado(a): sem nota, nível ou rótulo de encaixe
    if (d.foco) {
      var f = objeto(d.foco);
      c = '<p class="lede lede--curta">' + esc(TEXTO_EQUIPE.integracao) + '</p>' +
        '<div class="rec"><div class="rec__topo"><span class="rec__etiqueta">Plano de integração</span></div>' +
        '<div class="rec__nome">' + avatarSeFoto(f.nome, f.foto, 44, 'avatar--rec') + esc(f.nome) + '</div>' +
        '<div class="rec__texto"><p>' + esc((f.cargo ? 'Cargo: ' + f.cargo + '. ' : '') + (f.codigo ? 'Perfil ' + codigoSeguro(f.codigo) + '.' : 'Ainda sem teste DISC.')) + '</p></div></div>';
      if (f.percentuais) c += '<div class="mt24">' + pilhaDe(f.percentuais) + '</div>';
      if (f.organograma) c += '<h3 class="h3 mt48">Onde entra no organograma</h3><div class="cartao-doc">' + organogramaHtml(f.organograma, { rotulo: 'Organograma com a pessoa que está chegando' }) + '</div>';
      if (textos(f.observacoes).length) c += '<div class="obs obs--info mt24"><div class="obs__tit">Observações</div>' + listaItens(f.observacoes) + '</div>';
      var etapas = lista(f.recomendacoes90).filter(function (e) { return e && typeof e === 'object'; });
      if (etapas.length) {
        c += '<h3 class="h3 mt48">Plano para os primeiros 90 dias</h3><div class="etapas90">' + etapas.map(function (e) {
          return '<div class="cartao-doc"><div class="rotulo-doc">' + esc(e.periodo) + '</div>' + listaItens(e.itens) + '</div>';
        }).join('') + '</div>';
      }
      h += secao(sec('foco'), true, cabecalhoPagina(sec('foco'), f.nome) + c);
    }

    // Encerramento: uso proibido, limites e observações
    var av = objeto(d.avisos);
    c = '<div class="final__texto"><p>Este relatório mostra tendências de comportamento para orientar conversas, combinados e o desenvolvimento do time.</p></div>' +
      '<p class="final__aviso">' + esc(TEXTO_EQUIPE.naoUse) + '</p>' +
      '<div class="passos-cab">Limites do DISC</div><ol class="passos">' + textos(av.limites).map(function (t, i) {
        return '<li><span class="passos__n">' + n2(i) + '</span><span class="passos__t passos__t--texto">' + esc(t) + '</span></li>';
      }).join('') + '</ol>' +
      (textos(av.observacoes).length ? '<div class="passos-cab">Observações sobre os dados</div>' + listaItens(av.observacoes, 'itens-doc--escuro') : '');
    h += encerramentoModelo(sec('encerramento'), emp.nome, c, d.consultor, d.geradoEm);
    h += rodapeModelo([d.consultor ? 'Consultor: ' + d.consultor : '', emp.nome, 'Relatório de equipe'], 'Documento confidencial, para uso da direção. Sem dados de contato dos colaboradores.');
    return '<article class="doc doc--equipe" data-modelo="equipe">' + h + '</article>';
  }

  /* ------------------------------------------------------------------ LIDERANÇA (individual)
   * Versão 1 (snapshots antigos, já publicados): capa, "Quem é", guia em cartões e limites.
   * Versão 2 (dados.avancado com capítulos, js/lideranca-avancado.js): capa, índice, "Quem é" + retrato, guia rápido,
   * um capítulo por tema (feedback, delegação, motivação, retenção, desgaste, mudanças, conflito, 1:1, 90 dias,
   * você e esta pessoa) e "Limites e fundamentos". Cada capítulo é uma .secao (página nova no PDF). */

  // Bloco "Quem é" (01): o mesmo nas duas versões; na avançada ganha o retrato para quem lidera.
  function quemEHtml(d, av) {
    var p = d.pessoa || {};
    var c = '<p class="lede">' + esc(d.resumo || '') + '</p>' + pilhaDe(p.percentuais);
    // Na avançada, só nome e frase da combinação (a descrição é escrita para a própria pessoa, em "você").
    var cbx = av && d.combinacao && typeof d.combinacao === 'object' ? { codigo: d.combinacao.codigo, nome: d.combinacao.nome, frase: d.combinacao.frase } : d.combinacao;
    var comb = combinacaoHtml(cbx).replace('Sua combinação', 'Combinação');
    if (av) {
      c += comb;
      if (p.equilibrado) c += nota('info', 'Resultado equilibrado', 'Os quatro fatores apareceram em doses parecidas. Os capítulos descrevem a combinação ' + codigoSeguro(d.combinacao && d.combinacao.codigo) + ', mas as preferências desta pessoa podem variar mais conforme a situação: confirme na prática.');
      var ret = lista(av.retrato).filter(function (t) { return typeof t === 'string' && t; });
      if (ret.length) c += '<h3 class="h3 mt48">Retrato para quem lidera</h3><div class="texto-doc">' + ret.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') + '</div>';
    }
    if (d.relacao) {
      var r = d.relacao;
      // Como no relatório de equipe (decisão do painel científico): leitura sem nota, "Tende a fluir" / "Pede combinados".
      c += '<h3 class="h3 mt48">Você e ' + esc(p.nome) + '</h3><div class="par-doc par-doc--' + leituraEquipe(r.nivel) + '">' +
        '<div class="par-doc__cab"><span class="par-doc__nomes"><strong>' + esc(d.lider && d.lider.nome) + '</strong> <span class="par-doc__tipo">lidera</span> <strong>' + esc(p.nome) + '</strong></span>' + seloLeitura(r.nivel) + '</div>' +
        '<div class="par-doc__grade">' +
        (lista(r.sinergias).length ? '<div><div class="rotulo-doc">Sinergias</div>' + listaItens(r.sinergias) + '</div>' : '') +
        (lista(r.riscos).length ? '<div><div class="rotulo-doc">Pontos para combinar</div>' + listaItens(r.riscos) + '</div>' : '') +
        (lista(r.dicas).length ? '<div><div class="rotulo-doc">Dicas</div>' + listaItens(r.dicas) + '</div>' : '') + '</div></div>';
    }
    // Combinação, mapa ritmo × foco e esforço de adaptação ao cargo (Parte 2)
    var ex = d.exigido && typeof d.exigido === 'object' && d.exigido.percentuais ? d.exigido : null;
    var secEsforco = lista(d.secoes).filter(function (s) { return s && typeof s === 'object'; }).filter(ehSecaoExigido)[0] || null;
    if (!av) c += comb;
    if (d.mapa && lista(d.mapa.pontos).length) {
      var pt0 = lista(d.mapa.pontos)[0];
      c += '<h3 class="h3 mt48">Ritmo e foco</h3><div class="mapa-bloco">' + mapaRitmoFocoHtml(d.mapa.pontos, { rotulo: 'Ritmo e foco de ' + (p.nome || 'esta pessoa'), rotuloExigido: 'Cargo' }) +
        '<div class="mapa-bloco__txt"><p>' + esc(textoMapaPessoa(d, false)) + '</p>' +
        (ex && pt0 && eixoValido(pt0.exigido) ? '<p>O círculo laranja mostra o que o cargo pede, na percepção de ' + esc(p.nome || 'esta pessoa') + '; a seta indica a direção do ajuste diário.</p>' : '') +
        '<p class="nota-curta">Em cima, ritmo acelerado; embaixo, cauteloso. À esquerda, foco em tarefas; à direita, em pessoas.</p></div></div>';
    }
    if (ex) {
      c += '<h3 class="h3 mt48">Esforço de adaptação ao cargo</h3>' + naturalExigidoHtml(p.percentuais, ex) + (secEsforco ? '' : textosExigido(ex, null));
    }
    return c;
  }

  // Seções do guia em cartões (versão 1: todas; versão 2: só as do "guia rápido").
  function guiaCartoesHtml(secs) {
    return '<div class="guia-doc">' + secs.map(function (s, i) {
      var corpo = lista(s.etapas).length ? lista(s.etapas).map(function (e) {
        return '<div class="guia-doc__etapa"><div class="rotulo-doc">' + esc(e.periodo) + '</div>' + listaItens(e.itens) + '</div>';
      }).join('') : listaItens(s.itens);
      if (lista(s.exemplos).length) corpo += '<div class="rotulo-doc mt16">Exemplos</div>' + listaItens(lista(s.exemplos).map(function (e) { return typeof e === 'string' ? e : e && (e.texto || e.frase) ? String(e.texto || e.frase) : ''; }), 'itens-doc--exemplos');
      var larga = s.chave === 'plano' || s.chave === 'voceEEla' || ehSecaoExigido(s);
      return '<article class="guia-doc__sec' + (larga ? ' guia-doc__sec--larga' : '') + '"><div class="leitura__n">' + n2(i) + '</div><h3 class="h4doc">' + esc(s.titulo) + '</h3>' + corpo + '</article>';
    }).join('') + '</div>';
  }

  // O avançado só é desenhado com capítulos válidos; qualquer outra coisa cai na versão 1.
  function avancadoDe(d) {
    var av = d && d.avancado;
    if (!av || typeof av !== 'object' || !Array.isArray(av.capitulos)) return null;
    var caps = av.capitulos.filter(function (c) { return c && typeof c === 'object' && typeof c.id === 'string' && c.titulo; });
    return caps.length ? { retrato: lista(av.retrato), capitulos: caps, fundamentos: lista(av.fundamentos) } : null;
  }

  function idCapitulo(id) { return String(id || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40) || 'capitulo'; }

  function textoBloco(t) { return t ? '<div class="texto-doc">' + paragrafos(t) + '</div>' : ''; }
  function so(itens) { return lista(itens).filter(function (t) { return typeof t === 'string' && t; }); }
  function objs(itens) { return lista(itens).filter(function (x) { return x && typeof x === 'object'; }); }

  // Um bloco de capítulo (lista branca de tipos; desconhecido = nada).
  function blocoCapituloHtml(b) {
    if (!b || typeof b !== 'object') return '';
    var t = b.tipo;
    if (t === 'texto') return textoBloco(b.texto);
    if (t === 'destaques') {
      var ds = objs(b.itens).filter(function (x) { return x.titulo || x.texto; });
      if (!ds.length) return '';
      return '<div class="leituras mt24' + (ds.length === 1 ? ' leituras--um' : ds.length % 2 === 0 ? ' leituras--par' : '') + '">' + ds.map(function (x) {
        return '<article class="leitura">' + (x.titulo ? '<h4>' + esc(x.titulo) + '</h4>' : '') + paragrafos(x.texto) + '</article>';
      }).join('') + '</div>';
    }
    if (t === 'grupos') {
      var gs = objs(b.itens).filter(function (g) { return so(g.itens).length; });
      if (!gs.length) return '';
      var cartoes = gs.map(function (g) { return '<div class="cartao-doc">' + (g.titulo ? '<div class="rotulo-doc">' + esc(g.titulo) + '</div>' : '') + listaItens(so(g.itens)) + '</div>'; });
      return gs.length === 1 ? '<div class="mt24">' + cartoes[0] + '</div>' : '<div class="duas mt24">' + cartoes.join('') + '</div>';
    }
    if (t === 'frases') {
      var fs = objs(b.itens).filter(function (x) { return typeof x.frase === 'string' && x.frase; });
      if (!fs.length) return '';
      return '<div class="frases-doc mt32' + (fs.length === 1 ? ' frases-doc--um' : '') + '">' + (b.titulo ? '<h3 class="h4doc">' + esc(b.titulo) + '</h3>' : '') + '<ul class="frases-doc__lista">' + fs.map(function (x) {
        return '<li class="frase-doc">' + (x.situacao ? '<span class="frase-doc__sit">' + esc(x.situacao) + '</span>' : '') + '<blockquote class="frase-doc__txt">“' + esc(x.frase) + '”</blockquote></li>';
      }).join('') + '</ul></div>';
    }
    if (t === 'etapas') {
      var es = objs(b.itens).filter(function (e) { return so(e.itens).length; });
      if (!es.length) return '';
      return '<div class="etapas90 mt24">' + es.map(function (e) { return '<div class="cartao-doc"><div class="rotulo-doc">' + esc(e.titulo) + '</div>' + listaItens(so(e.itens)) + '</div>'; }).join('') + '</div>';
    }
    if (t === 'passos') {
      var ps = objs(b.itens).filter(function (x) { return x.texto; });
      if (!ps.length) return '';
      return '<div class="mt32">' + (b.titulo ? '<h3 class="h4doc">' + esc(b.titulo) + '</h3>' : '') + '<ol class="plano-doc passos-doc">' + ps.map(function (x, k) {
        return '<li><span class="plano-doc__prazo">' + n2(k) + '</span><span>' + (x.titulo ? '<strong>' + esc(x.titulo) + '</strong>' : '') + '<span class="plano-doc__txt">' + esc(x.texto) + '</span></span></li>';
      }).join('') + '</ol></div>';
    }
    if (t === 'perguntas') {
      var qs = so(b.itens);
      if (!qs.length) return '';
      return '<div class="cartao-doc mt24">' + (b.titulo ? '<div class="rotulo-doc">' + esc(b.titulo) + '</div>' : '') + '<ol class="perguntas-doc">' + qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol></div>';
    }
    if (t === 'exemplo') {
      return b.texto ? '<div class="nota-doc">' + (b.titulo ? '<span class="nota-doc__tag">' + esc(b.titulo) + '</span>' : '') + paragrafos(b.texto) + '</div>' : '';
    }
    if (t === 'alerta') {
      if (!b.texto && !so(b.itens).length) return '';
      return '<div class="obs ' + (b.leve ? 'obs--destaque' : 'obs--alerta') + ' mt24">' + (b.titulo ? '<div class="obs__tit">' + esc(b.titulo) + '</div>' : '') +
        paragrafos(b.texto) + listaItens(so(b.itens)) + '</div>';
    }
    if (t === 'estilos') {
      var st = objs(b.itens).filter(function (x) { return x.texto || so(x.ajustes).length; });
      if (!st.length) return '';
      return '<div class="estilos-doc mt24' + (st.length === 1 ? ' estilos-doc--um' : '') + '">' + st.map(function (x) {
        var L = letraDisc(x.letra);
        return '<article class="estilo-doc' + (x.atual ? ' estilo-doc--atual' : '') + '" data-letra="' + L + '"><div class="estilo-doc__cab"><span class="disc-def__letra disc-letra-' + L + '">' + (L || '–') + '</span>' +
          '<h4 class="h4doc">' + esc(x.nome) + (x.atual ? ' <span class="disc-def__tag">seu estilo</span>' : '') + '</h4></div>' +
          (x.texto ? '<p>' + esc(x.texto) + '</p>' : '') + (so(x.ajustes).length ? '<div class="rotulo-doc mt16">Ajustes que ajudam</div>' + listaItens(so(x.ajustes)) : '') + '</article>';
      }).join('') + '</div>';
    }
    return '';
  }

  function capituloLiderancaHtml(c) {
    var cc = c.intro ? '<p class="lede lede--curta">' + esc(c.intro) + '</p>' : '';
    lista(c.blocos).forEach(function (b) { cc += blocoCapituloHtml(b); });
    if (c.base) cc += '<p class="base-doc">' + esc(c.base) + '</p>';
    return cc;
  }

  // Seções da versão 1 que entram no "guia rápido" da versão 2 (as outras viraram capítulos).
  var GUIA_RAPIDO = ['comunicacao', 'precisa', 'evita', 'cobrar', 'rendeMais', 'riscos'];

  function liderancaAvancadoHtml(d, av) {
    var p = d.pessoa || {};
    var emp = d.empresa || {};
    var cod = codigoSeguro(p.codigo);
    var secsRL = lista(d.secoes).filter(function (s) { return s && typeof s === 'object'; });
    var rapidas = secsRL.filter(function (s) { return GUIA_RAPIDO.indexOf(s.chave) >= 0 || ehSecaoExigido(s); });
    var S = [{ id: 'resumo', titulo: 'Quem é ' + (p.nome || 'esta pessoa'), curto: 'Quem é', meta: 'Perfil · Retrato · Ritmo e foco' + (d.relacao ? ' · Relação com o líder' : '') }];
    if (rapidas.length) S.push({ id: 'liderar', titulo: 'Guia rápido do dia a dia', curto: 'Guia rápido', meta: 'Comunicação · Do que precisa · Cobrança · Riscos' });
    av.capitulos.forEach(function (c) { S.push({ id: idCapitulo(c.id), titulo: String(c.titulo), curto: c.curto ? String(c.curto) : '', meta: c.meta ? String(c.meta) : '', cap: c }); });
    S.push({ id: 'encerramento', titulo: 'Limites e fundamentos', curto: 'Limites', meta: 'Como usar · Estudos de base' });
    S.forEach(function (x, i) { x.n = n2(i); });
    var cb = d.combinacao && d.combinacao.nome ? d.combinacao.nome : '';
    var h = capaModelo({
      retrato: { nome: p.nome, foto: p.foto },
      meta: 'Guia de liderança · avançado', sobre: 'Guia de liderança' + (emp.nome ? ' · ' + emp.nome : ''),
      tituloHtml: 'Como liderar <em>' + esc(p.nome || 'esta pessoa') + '</em>',
      subtitulo: 'Um guia completo para quem lidera: feedback, delegação, motivação, retenção, sinais de desgaste, mudanças, conflitos, reuniões individuais e os primeiros 90 dias.',
      numeros: [
        { valor: codigoSeguro(d.combinacao && d.combinacao.codigo) || cod || '—', rotulo: 'perfil DISC' },
        { valor: cb || p.estilo || '—', rotulo: 'estilo', destaque: true, texto: true }
      ],
      rodape: [
        { rotulo: 'Pessoa', linhas: [p.nome, p.cargo] },
        { rotulo: 'Líder', linhas: [d.lider ? d.lider.nome : '—'] },
        { rotulo: 'Empresa', linhas: [emp.nome || '—'] },
        { rotulo: 'Emitido em', linhas: [data(d.geradoEm) || '—'] }
      ]
    });
    h += indiceModelo(S, 'Como liderar ' + (p.nome || 'esta pessoa') + ', capítulo a capítulo.', 'Leia na ordem ou vá direto ao tema do momento. Cada capítulo traz o que costuma funcionar com este perfil, exemplos do dia a dia e frases prontas.');
    S.slice(0, -1).forEach(function (s, k) {
      var corpo;
      if (s.id === 'resumo') corpo = quemEHtml(d, av);
      else if (s.id === 'liderar') corpo = '<p class="lede lede--curta">O essencial para o dia a dia, em cartões. Os capítulos seguintes aprofundam cada tema.</p>' + guiaCartoesHtml(rapidas);
      else corpo = capituloLiderancaHtml(s.cap);
      h += secao(s, k % 2 === 1, cabecalhoPagina(s, s.id === 'resumo' ? p.cargo : (p.nome || '')) + corpo);
    });
    var fund = so(av.fundamentos);
    var fim = S[S.length - 1];
    var corpoFim = '<div class="final__texto"><p>' + esc(d.aviso || '') + '</p></div>' +
      '<div class="passos-cab">Um ajuste de cada vez</div><p class="final__dica">Escolha um capítulo por semana, teste uma ou duas ideias com ' + esc(p.nome || 'esta pessoa') + ' e converse sobre o que funcionou. Liderar bem é ajustar no caminho.</p>' +
      (fund.length ? '<div class="passos-cab">Fundamentos</div><ol class="fundamentos-doc">' + fund.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ol>' : '');
    h += encerramentoModelo(fim, emp.nome, corpoFim, d.consultor, d.geradoEm);
    return '<article class="doc doc--lideranca doc--lideranca-avancado" data-modelo="lideranca" data-versao="avancado">' + h +
      rodapeModelo([emp.nome, 'Guia de liderança', p.nome], 'Documento confidencial, para o líder direto. Sem dados de contato.') + '</article>';
  }

  function liderancaHtml(d) {
    var av = avancadoDe(d);
    if (av) return liderancaAvancadoHtml(d, av);
    var p = d.pessoa || {};
    var emp = d.empresa || {};
    var S = [
      { id: 'resumo', titulo: 'Quem é ' + (p.nome || 'esta pessoa'), curto: 'Quem é', meta: 'Perfil · Ritmo e foco · Relação com o líder' },
      { id: 'liderar', titulo: 'Como liderar no dia a dia', curto: 'Como liderar', meta: 'Comunicação · Delegação · Feedback · Plano' },
      { id: 'encerramento', titulo: 'Limites deste guia', curto: 'Limites', meta: 'Como usar' }
    ];
    S.forEach(function (x, i) { x.n = n2(i); });
    var cod = codigoSeguro(p.codigo);
    var h = capaModelo({
      retrato: { nome: p.nome, foto: p.foto },
      meta: 'Guia de liderança', sobre: 'Guia de liderança' + (emp.nome ? ' · ' + emp.nome : ''),
      tituloHtml: 'Como liderar <em>' + esc(p.nome || 'esta pessoa') + '</em>',
      subtitulo: ('Um guia curto para o líder: como se comunicar, delegar, dar feedback e acompanhar ' + (p.nome || 'esta pessoa') + '.').replace(/\.\.$/, '.'),
      numeros: [
        { valor: cod || '—', rotulo: 'perfil DISC' },
        { valor: p.estilo || '—', rotulo: 'estilo', destaque: true, texto: true }
      ],
      rodape: [
        { rotulo: 'Colaborador(a)', linhas: [p.nome, p.cargo] },
        { rotulo: 'Líder', linhas: [d.lider ? d.lider.nome : '—'] },
        { rotulo: 'Empresa', linhas: [emp.nome || '—'] },
        { rotulo: 'Emitido em', linhas: [data(d.geradoEm) || '—'] }
      ]
    });
    // 01
    var h1 = secao(S[0], false, cabecalhoPagina(S[0], p.cargo) + quemEHtml(d, null));
    // 02
    var secsRL = lista(d.secoes).filter(function (s) { return s && typeof s === 'object'; });
    var h2 = secao(S[1], true, cabecalhoPagina(S[1], cod ? 'Perfil ' + cod : '') + guiaCartoesHtml(secsRL));
    var h3 = encerramentoModelo(S[2], emp.nome, '<div class="final__texto"><p>' + esc(d.aviso || '') + '</p></div>', d.consultor, d.geradoEm);
    return '<article class="doc doc--lideranca" data-modelo="lideranca">' + h + h1 + h2 + h3 +
      rodapeModelo([emp.nome, 'Guia de liderança', p.nome], 'Documento confidencial, para o líder direto. Sem dados de contato.') + '</article>';
  }

  /* ------------------------------------------------------------------ PESSOA (desenvolvimento) */

  // Corpo genérico de uma seção do relatório da pessoa (DISC_RELATORIO_PESSOA): intro, características, sinais,
  // perfis, itens ({titulo, texto} | {prazo, titulo, texto} | string), paragrafos/texto e listas [{titulo, itens}].
  function corpoSecaoPessoa(x) {
    var cc = (x.intro ? '<p class="lede lede--curta">' + esc(x.intro) + '</p>' : '');
    if (typeof x.texto === 'string' && x.texto) cc += paragrafos(x.texto);
    lista(x.paragrafos).forEach(function (t) { if (typeof t === 'string') cc += '<p>' + esc(t) + '</p>'; });
    if (lista(x.caracteristicas).length) cc += '<ul class="chips-doc">' + lista(x.caracteristicas).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    if (lista(x.sinais).length) cc += '<div class="cartao-doc mt24"><div class="rotulo-doc">Sinais de que a pressão chegou</div>' + listaItens(x.sinais) + '</div>';
    if (lista(x.perfis).length) {
      cc += '<div class="disc-defs disc-defs--3 mt24">' + lista(x.perfis).map(function (pf) {
        var L = letraDisc(pf.letra);
        return '<div class="disc-def"><div class="disc-def__letra disc-letra-' + L + '">' + L + '</div><div class="disc-def__nome">' + esc(pf.nome) + (pf.rotulo ? ' <span class="disc-def__tag">' + esc(pf.rotulo) + '</span>' : '') + '</div><p>' + esc(pf.texto) + '</p></div>';
      }).join('') + '</div>';
    }
    var itens = lista(x.itens);
    var objs = itens.filter(function (it) { return it && typeof it === 'object'; });
    var strs = itens.filter(function (it) { return typeof it === 'string' && it; });
    if (objs.length) {
      var plano = objs.some(function (it) { return it.prazo; });
      cc += (plano ? '<ol class="plano-doc mt24">' : '<div class="leituras leituras--par mt24">') + objs.map(function (it, k) {
        if (plano) return '<li><span class="plano-doc__prazo">' + esc(it.prazo) + '</span><span><strong>' + esc(it.titulo) + '</strong><span class="plano-doc__txt">' + esc(it.texto) + '</span></span></li>';
        return '<article class="leitura"><div class="leitura__n">' + n2(k) + '</div>' + (it.titulo ? '<h4>' + esc(it.titulo) + '</h4>' : '') + '<p>' + esc(it.texto) + '</p></article>';
      }).join('') + (plano ? '</ol>' : '</div>');
    }
    if (strs.length) cc += '<div class="cartao-doc mt24">' + listaItens(strs) + '</div>';
    var grupos = lista(x.listas).concat(lista(x.grupos)).filter(function (g) { return g && typeof g === 'object'; });
    if (grupos.length) {
      cc += '<div class="duas mt24">' + grupos.map(function (g) {
        return '<div class="cartao-doc">' + (g.titulo ? '<div class="rotulo-doc">' + esc(g.titulo) + '</div>' : '') + (listaItens(g.itens) || (g.texto ? '<p>' + esc(g.texto) + '</p>' : '')) + '</div>';
      }).join('') + '</div>';
    }
    return cc;
  }

  // Seção do RP que já traz os textos da Parte 2 ("Onde você está se esticando"): é desenhada junto com os números.
  function ehSecaoExigido(sx) { return /estic|exig|adapta|esforc/i.test(String((sx && (sx.id || sx.chave)) || '')); }

  var CURTO_PESSOA = { fortes: 'Pontos fortes', atencao: 'Pontos de atenção', pressao: 'Sob pressão', comunicacao: 'Comunicação', plano: 'Seu plano' };

  function textoMapaPessoa(d, voce) {
    var pt = d.mapa && lista(d.mapa.pontos)[0];
    var e = pt && eixoValido(pt.natural);
    if (!e) return '';
    var r = e.ritmo >= 10 ? 'mais acelerado' : e.ritmo <= -10 ? 'mais cauteloso' : 'equilibrado entre acelerado e cauteloso';
    var f = e.foco >= 10 ? 'mais voltado a tarefas' : e.foco <= -10 ? 'mais voltado a pessoas' : 'equilibrado entre tarefas e pessoas';
    return voce ? 'O ponto azul mostra o seu jeito natural: ritmo ' + r + ' e foco ' + f + '.' : 'Jeito natural: ritmo ' + r + ' e foco ' + f + '.';
  }

  function capaPessoa(d, simples) {
    var p = d.pessoa || {};
    var pri = p.primario || {}, sec2 = p.secundario || {};
    var fat = lista(d.fatores);
    var cb = d.combinacao && d.combinacao.nome ? d.combinacao.nome : '';
    return capaModelo({
      retrato: { nome: p.nome, foto: p.foto },
      meta: simples ? 'Relatório de desenvolvimento · resumo' : 'Relatório de desenvolvimento', sobre: simples ? 'Seu perfil em duas páginas' : 'Relatório de desenvolvimento pessoal',
      tituloHtml: 'Olá, ' + esc(p.primeiroNome || p.nome || '') + '. Este é o seu <em>jeito de trabalhar</em>.',
      subtitulo: d.frase,
      numeros: fat.map(function (f) { return { valor: numeroCurto(f.pct), sufixo: '%', rotulo: f.nome, destaque: f.letra === pri.letra }; }),
      rodape: [
        { rotulo: 'Para', linhas: [p.nome] },
        { rotulo: 'Seu estilo', linhas: [codigoSeguro(p.codigo) + (cb ? ' · ' + cb : pri.nome ? ' · ' + pri.nome + (sec2.nome ? ' e ' + sec2.nome : '') : '')] },
        { rotulo: 'Consultoria', linhas: ['Gestão sem Caos', d.consultor] },
        { rotulo: 'Emitido em', linhas: [data(d.geradoEm) || '—'] }
      ]
    });
  }

  function textosExigido(x, rpSec) {
    if (rpSec) return corpoSecaoPessoa(rpSec);
    var t = lista(x && x.textos).filter(function (v) { return typeof v === 'string' && v; });
    return t.length ? '<div class="obs-pilha mt24">' + t.map(function (v) { return '<div class="obs obs--info"><p>' + esc(v) + '</p></div>'; }).join('') + '</div>' : '';
  }

  function pessoaHtml(d) {
    if (d.variante === 'simples') return pessoaSimplesHtml(d);
    var p = d.pessoa || {};
    var pri = p.primario || {};
    var secs = lista(d.secoes).filter(function (x) { return x && typeof x === 'object'; });
    var rpExigido = secs.filter(ehSecaoExigido)[0] || null;
    var ex = d.exigido && typeof d.exigido === 'object' && d.exigido.percentuais ? d.exigido : null;
    var fat = lista(d.fatores);
    var temRegua = fat.some(function (f) { return ehNumero(f.pct); });
    var temMapa = d.mapa && lista(d.mapa.pontos).length;
    var S = [{ id: 'perfil', titulo: 'Seu perfil', meta: 'Os quatro fatores do DISC' }];
    if (temRegua || temMapa) S.push({ id: 'intensidade', titulo: 'Intensidade, ritmo e foco', curto: 'Intensidade', meta: 'Régua de cada fator · Mapa ritmo × foco', tipo: 'intensidade' });
    if (ex) S.push({ id: 'esticando', titulo: (rpExigido && rpExigido.titulo) || 'Onde você está se esticando', curto: 'Seu trabalho', meta: 'Jeito natural × o que o trabalho pede', tipo: 'exigido' });
    var usados = {};
    S.forEach(function (x) { usados[x.id] = 1; });
    secs.forEach(function (sx) {
      if (ex && sx === rpExigido) return;
      if (!ex && ehSecaoExigido(sx)) return;
      var id = String(sx.id || '').replace(/[^a-z]/g, '') || 'secao';
      while (usados[id]) id += 'x';
      usados[id] = 1;
      S.push({ id: id, titulo: sx.titulo, curto: CURTO_PESSOA[id] || sx.curto, meta: '', dados: sx });
    });
    S.push({ id: 'encerramento', titulo: 'Para levar com você', curto: 'Para levar', meta: '' });
    S.forEach(function (x, i) { x.n = n2(i); });
    var h = capaPessoa(d, false);

    // 01 Seu perfil
    var c = '<p class="lede">' + esc(d.frase || '') + '</p>' + combinacaoHtml(d.combinacao) + pilhaDe(fat.reduce(function (o, f) { o[f.letra] = f.pct; return o; }, {})) +
      '<div class="disc-defs mt32">' + fat.map(function (f) {
        var L = letraDisc(f.letra);
        return '<div class="disc-def' + (L === pri.letra ? ' disc-def--ideal' : '') + '"><div class="disc-def__letra disc-letra-' + L + '">' + L + '</div>' +
          '<div class="disc-def__nome">' + esc(f.nome) + ' <span class="disc-def__tag">' + esc(pct(f.pct)) + '</span></div><p>' + esc(f.descricao) + '</p></div>';
      }).join('') + '</div>' +
      '<p class="nota-curta mt24">Todo mundo tem um pouco dos quatro fatores. O que muda é a dose de cada um, e isso não é certo nem errado.</p>';
    h += secao(S[0], false, cabecalhoPagina(S[0], p.nome) + c);

    S.slice(1, -1).forEach(function (s, i) {
      var cc = '';
      if (s.tipo === 'intensidade') {
        cc = '<p class="lede lede--curta">Quanto de cada fator aparece no seu jeito de trabalhar, de muito baixa a muito alta. Faixas altas mostram forças evidentes; faixas baixas, comportamentos que você usa menos, não falhas.</p>' +
          (temRegua ? reguaHtml(fat, d.regua) : '');
        if (temMapa) {
          cc += '<h3 class="h3 mt48">Seu ritmo e seu foco</h3><div class="mapa-bloco">' +
            mapaRitmoFocoHtml(d.mapa.pontos, { rotulo: 'Seu mapa de ritmo e foco', rotuloExigido: 'Trabalho' }) +
            '<div class="mapa-bloco__txt"><p>' + esc(textoMapaPessoa(d, true)) + '</p>' +
            (ex ? '<p>O círculo laranja mostra como você percebe o que o seu trabalho pede; a seta indica a direção do ajuste que você faz no dia a dia.</p>' : '') +
            '<p class="nota-curta">Em cima, ritmo acelerado; embaixo, cauteloso. À esquerda, foco em tarefas; à direita, em pessoas. As letras mostram onde cada fator do DISC costuma ficar.</p></div></div>';
        }
      } else if (s.tipo === 'exigido') {
        cc = '<p class="lede lede--curta">Na segunda parte do teste você respondeu como o seu trabalho pede que você seja. A comparação mostra onde você está se esticando: comportamentos que usa mais (ou menos) do que seria natural.</p>' +
          naturalExigidoHtml(fat.reduce(function (o, f) { o[f.letra] = f.pct; return o; }, {}), ex) + textosExigido(ex, rpExigido);
      } else cc = corpoSecaoPessoa(s.dados);
      h += secao(s, i % 2 === 0, cabecalhoPagina(s, p.nome) + cc);
    });
    h += encerramentoModelo(S[S.length - 1], p.nome, '<div class="final__texto"><p>' + esc(d.aviso || '') + '</p></div>' +
      '<div class="passos-cab">Um passo de cada vez</div><p class="final__dica">Escolha um hábito do seu plano, pratique por algumas semanas e observe o que muda. Crescer é isso: pequenas escolhas repetidas.</p>', d.consultor, d.geradoEm);
    return '<article class="doc doc--pessoa" data-modelo="pessoa" data-variante="completo">' + h +
      rodapeModelo(['Relatório de desenvolvimento', p.nome], 'Documento pessoal. Compartilhe só se quiser.') + '</article>';
  }

  // Variante simples (2 páginas): frase, 4 fatores com faixa, 3 forças, 3 cuidados, 3 hábitos (+ mapa e esforço se houver).
  function pessoaSimplesHtml(d) {
    var p = d.pessoa || {};
    var fat = lista(d.fatores);
    var ex = d.exigido && typeof d.exigido === 'object' && d.exigido.percentuais ? d.exigido : null;
    var S = [
      { id: 'resumo', titulo: 'Seu perfil em resumo', curto: 'Seu perfil', meta: 'Fatores · Forças · Cuidados' },
      { id: 'habitos', titulo: 'Para praticar', meta: 'Três hábitos · Ritmo e foco' },
      { id: 'encerramento', titulo: 'Para levar com você', curto: 'Para levar', meta: '' }
    ];
    S.forEach(function (x, i) { x.n = n2(i); });
    function cartoes(itens, classe) {
      var l = lista(itens).filter(function (it) { return it && (it.titulo || it.texto); });
      if (!l.length) return '<p class="nota-curta">—</p>';
      return '<ol class="simples-doc__lista' + (classe ? ' ' + classe : '') + '">' + l.map(function (it, k) {
        return '<li><span class="simples-doc__n">' + n2(k) + '</span><span>' + (it.titulo ? '<strong>' + esc(it.titulo) + '</strong> ' : '') + (it.texto ? esc(it.texto) : '') + '</span></li>';
      }).join('') + '</ol>';
    }
    var h = capaPessoa(d, true);
    var c = '<p class="lede">' + esc(d.frase || '') + '</p>' + combinacaoHtml(d.combinacao) +
      '<div class="simples-doc__fatores">' + reguaHtml(fat, d.regua) + '</div>' +
      '<div class="duas mt32"><div class="cartao-doc"><div class="rotulo-doc">Suas forças</div>' + cartoes(d.forcas) + '</div>' +
      '<div class="cartao-doc"><div class="rotulo-doc">Cuidados</div>' + cartoes(d.cuidados) + '</div></div>';
    h += secao(S[0], false, cabecalhoPagina(S[0], p.nome) + c, 'simples-doc');
    c = '<h3 class="h2doc">Três hábitos para os próximos meses</h3>' + cartoes(d.habitos, 'simples-doc__lista--habitos');
    if (d.mapa && lista(d.mapa.pontos).length) {
      c += '<h3 class="h3 mt48">Seu ritmo e seu foco</h3><div class="mapa-bloco">' + mapaRitmoFocoHtml(d.mapa.pontos, { rotulo: 'Seu mapa de ritmo e foco' }) +
        '<div class="mapa-bloco__txt"><p>' + esc(textoMapaPessoa(d, true)) + '</p>' +
        (ex ? '<p>O círculo laranja mostra o que o seu trabalho pede' + (ehNumero(ex.indice) ? ' (esforço de adaptação ' + esc(numeroCurto(ex.indice)) + '/100)' : '') + '.</p>' + textosExigido(ex, null) : '') + '</div></div>';
    }
    h += secao(S[1], true, cabecalhoPagina(S[1], p.nome) + c, 'simples-doc');
    h += encerramentoModelo(S[2], p.nome, '<div class="final__texto"><p>' + esc(d.aviso || '') + '</p></div>', d.consultor, d.geradoEm);
    return '<article class="doc doc--pessoa doc--simples" data-modelo="pessoa" data-variante="simples">' + h +
      rodapeModelo(['Relatório de desenvolvimento · resumo', p.nome], 'Documento pessoal. Compartilhe só se quiser.') + '</article>';
  }


  /* ------------------------------------------------------------------ RELATÓRIO DE CLIMA (modelo 'clima')
   * Snapshot montado pelo banco (public.clima_gerar_relatorio): só agregados já suprimidos (k >= 5; distribuição,
   * comentários e complemento com k >= 10; N4 só na empresa). Os textos (faixas, intervenções, plano, avisos) vêm de
   * js/clima.js (DISC_CLIMA). Ordem fixa do organograma, sem ranking, sem índice geral. Capítulos: decisao.md 5.3. */

  function CLIMA() {
    if (root.DISC_CLIMA) return root.DISC_CLIMA;
    if (typeof require === 'function') { try { return require('./clima.js'); } catch (e) { return null; } }
    return null;
  }
  var FAIXAS_CLIMA = ['favoravel', 'intermediario', 'atencao'];
  function comPonto(t) { t = String(t || ''); return /[.!?]$/.test(t) ? t : t + '.'; }
  function faixaSegura(f) { return FAIXAS_CLIMA.indexOf(f) >= 0 ? f : 'intermediario'; }
  function seloFaixa(C, f) { return selo('fx-' + faixaSegura(f), C.rotuloFaixa(faixaSegura(f))); }
  // Barra 0–100 com marcas em 50 e 75 (os cortes das faixas); trilho liso.
  function barraClima(escore, rotulo) {
    var v = ehNumero(escore) ? Math.max(0, Math.min(100, escore)) : 0;
    return '<span class="barra barra--clima" role="img" aria-label="' + esc(rotulo) + '">' +
      '<span class="barra__feito" style="width:' + v + '%"></span><span class="barra-clima__marca" style="left:50%"></span>' +
      '<span class="barra-clima__marca" style="left:75%"></span></span>';
  }
  function linhaDimensao(C, nome, d, comDistribuicao) {
    if (!d) {
      return '<li class="clima-dim clima-dim--vazia"><span class="barras__rot">' + esc(nome) + '</span>' +
        '<span class="barras__val">não aparece</span></li>';
    }
    var h = '<li class="clima-dim clima-dim--' + faixaSegura(d.faixa) + '"><span class="barras__rot">' + esc(nome) + '</span>' +
      '<span class="barras__val"><strong>' + esc(numeroCurto(d.escore)) + '</strong> ' + seloFaixa(C, d.faixa) + '</span>' +
      barraClima(d.escore, nome + ': ' + d.escore + ' de 100, ' + C.rotuloFaixa(faixaSegura(d.faixa)));
    var extra = [];
    if (d.alinhamento) extra.push(C.rotuloAlinhamento(d.alinhamento));
    if (comDistribuicao && d.distribuicao) {
      extra.push(d.distribuicao.favoravel + '% favorável · ' + d.distribuicao.intermediario + '% intermediário · ' + d.distribuicao.atencao + '% ponto de atenção');
    }
    if (extra.length) h += '<span class="clima-dim__extra">' + esc(extra.join(' · ')) + '</span>';
    if (d.alinhamento === 'divididas') h += '<span class="clima-dim__extra clima-dim__extra--aviso">' + esc(C.TEXTOS.divididas) + '</span>';
    return h + '</li>';
  }
  function listaDimensoes(C, g, comDistribuicao) {
    return '<ul class="barras clima-dims">' + C.DIMENSOES.map(function (dim) {
      return linhaDimensao(C, C.bloco(dim).nome, g.dimensoes ? g.dimensoes[dim] : null, comDistribuicao);
    }).join('') + '</ul>';
  }

  function secoesClima(d, res) {
    var s = [
      { id: 'como-ler', titulo: 'Como ler este relatório', curto: 'Como ler', meta: 'O que é e o que não é · Faixas · Limites' },
      { id: 'resumo', titulo: 'Resumo da empresa', curto: 'Resumo', meta: 'Temas no total · Adesão · O que priorizar' },
      { id: 'grupos', titulo: 'Por área e equipe', curto: 'Por equipe', meta: 'Ordem do organograma · Sem ranking' }
    ];
    if (d.rodada && d.rodada.complemento) s.push({ id: 'fatores', titulo: 'Fatores psicossociais do trabalho', curto: 'Fatores psicossociais', meta: 'Apoio ao GRO · Total da empresa e áreas' });
    if (res.comentarios && res.comentarios.disponivel) s.push({ id: 'comentarios', titulo: 'Temas dos comentários', curto: 'Comentários', meta: 'Escritos pela consultoria · Sem trechos literais' });
    s.push({ id: 'plano', titulo: 'Plano da empresa', curto: 'Plano', meta: 'Ações recomendadas · 30/60/90 dias' });
    if (d.rodada && d.rodada.complemento) s.push({ id: 'pgr', titulo: 'Anexo para o responsável pelo PGR', curto: 'Anexo PGR', meta: 'Fatores · Sinais · Campos para preencher' });
    s.push({ id: 'metodo', titulo: 'Método', curto: 'Método', meta: 'Perguntas · Cálculo · Anonimato · Referências' });
    s.forEach(function (x, i) { x.n = n2(i); });
    return s;
  }

  function climaHtml(d) {
    var C = CLIMA();
    if (!C) return erroHtml('Não foi possível carregar o relatório de clima.');
    var res = d.resultado && typeof d.resultado === 'object' ? d.resultado : {};
    var emp = d.empresa || {};
    var rod = d.rodada || {};
    var grupos = lista(res.grupos);
    var empresa = grupos.filter(function (g) { return g.tipo === 'empresa'; })[0] || null;
    var S = secoesClima(d, res);
    function sec(id) { return S.filter(function (x) { return x.id === id; })[0]; }
    function alt(id) { return S.indexOf(sec(id)) % 2 === 1; }
    var taxa = ehNumero(res.taxa) ? res.taxa : 0;
    var nGrupos = grupos.filter(function (g) { return g.tipo !== 'empresa'; }).length;
    var periodo = [data(rod.abertaEm), data(rod.encerradaEm)].filter(Boolean).join(' a ');

    var h = capaModelo({
      meta: 'Pesquisa de clima', sobre: 'Pesquisa de Clima da Equipe · ' + (emp.nome || 'Empresa'),
      tituloHtml: 'Clima da <em>equipe</em>' + (emp.nome ? '<br>' + esc(emp.nome) : ''),
      subtitulo: 'Como as pessoas percebem o trabalho, por tema e por equipe, e o que fazer a partir daqui.',
      numeros: [
        { valor: numeroCurto(res.respondentes || 0), rotulo: 'respostas' },
        { valor: numeroCurto(taxa), sufixo: '%', rotulo: 'de adesão', destaque: true },
        { valor: numeroCurto(C.DIMENSOES.length), rotulo: 'temas' },
        { valor: numeroCurto(nGrupos), rotulo: nGrupos === 1 ? 'recorte além do total' : 'recortes além do total' }
      ],
      rodape: [
        { rotulo: 'Empresa', linhas: [emp.nome || '—', emp.cidade] },
        { rotulo: 'Consultoria', linhas: ['Gestão sem Caos', d.consultor] },
        { rotulo: 'Período', linhas: [periodo || '—'] },
        { rotulo: 'Emitido em', linhas: [data(d.geradoEm) || '—'] }
      ]
    });
    h += indiceModelo(S, 'Como a equipe percebe o trabalho e por onde começar.', C.TEXTOS.abertura);

    // 01 Como ler
    var c = '<p class="lede">' + esc(C.TEXTOS.abertura) + '</p>';
    c += '<div class="duas mt32"><div class="cartao-doc"><div class="rotulo-doc">O que é</div><ul class="itens-doc">' +
      '<li>' + esc('A percepção coletiva de ' + numeroCurto(res.respondentes || 0) + ' de ' + numeroCurto(res.convidados || 0) + ' pessoas convidadas (' + taxa + '%), sobre 7 temas do dia a dia da equipe.') + '</li>' +
      '<li>' + esc('Período da pesquisa: ' + (periodo || '—') + '. Nada foi mostrado enquanto ela estava aberta.') + '</li>' +
      '<li>' + esc('Escala de 0 a 100 por tema (média das respostas de concordância). Não existe nota geral do clima.') + '</li>' +
      '</ul></div><div class="cartao-doc"><div class="rotulo-doc">O que não é</div><ul class="itens-doc">' +
      '<li>' + esc('Não avalia pessoas, não é avaliação psicológica e não faz diagnóstico de saúde.') + '</li>' +
      '<li>' + esc(C.TEXTOS.usoProibido) + '</li>' +
      '<li>' + esc('Ninguém vê a resposta de ninguém. Um grupo só aparece com 5 respostas ou mais; detalhes e comentários, com 10 ou mais.') + '</li>' +
      '</ul></div></div>';
    c += '<h3 class="h3 mt48">Faixas de leitura</h3><ul class="clima-faixas">' + FAIXAS_CLIMA.map(function (f) {
      var faixaTxt = f === 'favoravel' ? '75 a 100' : (f === 'intermediario' ? '50 a 74' : '0 a 49');
      return '<li>' + seloFaixa(C, f) + '<span class="clima-faixas__val">' + esc(faixaTxt) + '</span><span>' + esc(C.leituraFaixa(f)) + '</span></li>';
    }).join('') + '</ul><p class="nota-curta mt16">' + esc(C.TEXTOS.faixas) + '</p>';
    c += '<h3 class="h3 mt48">Alinhamento da equipe</h3><ul class="itens-doc">' + ['alinhada', 'variadas', 'divididas'].map(function (a) {
      return '<li><strong>' + esc(C.rotuloAlinhamento(a)) + ':</strong> ' + esc(C.textoAlinhamento(a)) + '</li>';
    }).join('') + '</ul>';
    var avisos = [];
    if ((res.respondentes || 0) > 0 && (res.respondentes || 0) < 10) avisos.push(nota('alerta', 'Margem ampla', C.TEXTOS.margem));
    if ((res.convidados || 0) > 0 && taxa < C.TAXA_MINIMA) avisos.push(nota('alerta', 'Adesão', C.TEXTOS.adesao(taxa)));
    avisos.push(nota('info', 'Origem das perguntas', C.TEXTOS.origem));
    c += '<div class="obs-grade">' + avisos.join('') + '</div>';
    h += secao(sec('como-ler'), alt('como-ler'), cabecalhoPagina(sec('como-ler'), emp.nome) + c);

    // 02 Resumo
    if (res.suprimido || !empresa) {
      c = '<div class="obs obs--alerta"><div class="obs__tit">Respostas insuficientes</div><p>' +
        esc('Com menos de 5 respostas no total, nenhum resultado pode aparecer sem expor quem respondeu. A consultoria propõe uma conversa facilitada com a equipe.') + '</p></div>';
    } else {
      var temas = C.temasOrdenados(empresa);
      c = '<p class="lede lede--curta">' + esc('Resultado de toda a empresa, por tema. Cada barra vai de 0 a 100; as marcas mostram os cortes de 50 e 75.') + '</p>';
      c += '<div class="cartao-doc">' + listaDimensoes(C, empresa, true) + '</div>';
      c += '<div class="duas mt32"><div><h3 class="h3">Temas mais bem avaliados</h3><div class="obs-pilha">' +
        (temas.melhores.length ? temas.melhores.map(function (dim) {
          var x = empresa.dimensoes[dim];
          return '<div class="obs obs--info"><div class="obs__tit">' + esc(C.bloco(dim).nome + ' · ' + x.escore) + '</div><p>' + esc(C.leituraFaixa(x.faixa)) + '</p></div>';
        }).join('') : '<p class="nota-curta">Poucos temas com respostas suficientes para comparar.</p>') +
        '</div></div><div><h3 class="h3">Temas para priorizar na conversa</h3><div class="obs-pilha">' +
        (temas.priorizar.length ? temas.priorizar.map(function (dim) {
          var x = empresa.dimensoes[dim];
          return '<div class="obs ' + (x.faixa === 'atencao' ? 'obs--destaque' : 'obs--alerta') + '"><div class="obs__tit">' + esc(C.bloco(dim).nome + ' · ' + x.escore) + '</div><p>' + esc(C.leituraFaixa(x.faixa)) + '</p></div>';
        }).join('') : '<p class="nota-curta">Poucos temas com respostas suficientes para comparar.</p>') + '</div></div></div>';
      if (empresa.h1) {
        c += '<div class="cartao-doc mt32"><div class="rotulo-doc">Indicador de 1 pergunta, à parte dos temas</div><ul class="barras clima-dims">' +
          linhaDimensao(C, '"No geral, esta equipe consegue entregar o que se espera dela."', empresa.h1, false) + '</ul></div>';
      }
    }
    h += secao(sec('resumo'), alt('resumo'), cabecalhoPagina(sec('resumo'), numeroCurto(res.respondentes || 0) + ' respostas') + c);

    // 03 Por área e equipe
    var outros = grupos.filter(function (g) { return g.tipo !== 'empresa'; });
    c = '<p class="lede lede--curta">' + esc(C.TEXTOS.naoRanking) + '</p>';
    if (!outros.length) {
      c += '<div class="obs obs--info"><div class="obs__tit">Só o total da empresa</div><p>' +
        esc('Nenhuma equipe ou área alcançou o mínimo de respostas para aparecer sozinha sem expor um grupo pequeno. O resultado vale para a empresa toda.') + '</p></div>';
    }
    c += outros.map(function (g) {
      var tit = g.tipo === 'outras' ? 'Outras equipes' : g.nome;
      var sub = [];
      if (g.tipo === 'area') sub.push('Área');
      if (g.tipo !== 'outras' && ehNumero(g.taxa)) sub.push(numeroCurto(g.n) + ' de ' + numeroCurto(g.convidados) + ' responderam (' + g.taxa + '%)');
      else sub.push(numeroCurto(g.n) + ' respostas');
      if (g.n < 10) sub.push('margem ampla');
      return '<article class="cartao-doc clima-grupo clima-grupo--' + classeSegura(g.tipo) + ' clima-grupo--nivel' + (g.nivel === 2 ? '2' : '1') + '" data-grupo="' + esc(g.id) + '">' +
        '<h3 class="h3">' + esc(tit) + '</h3><p class="nota-curta">' + esc(sub.join(' · ')) + '</p>' +
        (g.tipo === 'outras' || g.tipo === 'area' ? '<p class="nota-curta">' + esc(comPonto((g.tipo === 'outras' ? 'Reúne: ' : 'Equipes: ') + lista(g.equipes).join(', '))) + '</p>' : '') +
        listaDimensoes(C, g, true) + '</article>';
    }).join('');
    var fora = lista(res.equipes).filter(function (e) { return e.situacao !== 'aparece'; });
    if (fora.length) {
      c += '<div class="obs obs--info mt32"><div class="obs__tit">Equipes que não aparecem sozinhas</div><p>' +
        esc(comPonto(fora.map(function (e) { return e.nome + (e.situacao === 'outras' ? ' (em "Outras equipes")' : (e.motivo === 'sem_respostas' ? ' (sem respostas)' : ' (só no total)')); }).join('; '))) +
        '</p><p>' + esc('Para proteger o anonimato, uma equipe só aparece com 5 respostas ou mais, e nenhuma comparação entre recortes pode isolar menos de 5 pessoas.') + '</p></div>';
    }
    h += secao(sec('grupos'), alt('grupos'), cabecalhoPagina(sec('grupos'), numeroCurto(outros.length) + ' recortes') + c);

    // 04 Fatores psicossociais (complemento)
    if (sec('fatores')) {
      var comp = res.complemento || {};
      c = '<p class="lede lede--curta">' + esc(C.TEXTOS.nr1) + '</p>';
      var gruposN = lista(comp.grupos);
      if (!gruposN.length) {
        c += '<div class="obs obs--info"><div class="obs__tit">Sem resultado</div><p>' + esc('O complemento só aparece com 10 respostas ou mais.') + '</p></div>';
      }
      c += gruposN.map(function (g) {
        return '<div class="cartao-doc mt24"><div class="rotulo-doc">' + esc(g.id === 'empresa' ? 'Toda a empresa' : 'Área: ' + g.nome) + '</div><ul class="barras clima-dims">' +
          C.N_INDICADORES.map(function (id) {
            var it = C.ITENS_N.filter(function (x) { return x.id === id; })[0];
            return linhaDimensao(C, it.nome + ' (1 pergunta)', g.itens ? g.itens[id] : null, false);
          }).join('') + '</ul></div>';
      }).join('');
      if (rod.n4Ligado) {
        var n4 = comp.n4;
        c += '<div class="obs obs--alerta mt32" data-n4="1"><div class="obs__tit">Relato de tratamento ofensivo (últimos 6 meses)</div>' +
          (n4 ? '<p>' + esc(n4.pct + '% de quem respondeu a esta pergunta (' + n4.n + ' pessoas) relatou ter sido tratado(a) com grosseria, humilhação ou ameaça uma vez ou mais. É um relato agregado: a apuração é da empresa, pelo próprio canal.') + '</p>'
            : '<p>' + esc('Menos de 10 respostas a esta pergunta: o resultado não aparece.') + '</p>') +
          '<p>' + esc('Canal indicado às pessoas: ' + (rod.canalTexto || '—') + '. A pesquisa não é canal de denúncia e não identifica quem respondeu.') + '</p></div>';
      }
      h += secao(sec('fatores'), alt('fatores'), cabecalhoPagina(sec('fatores'), 'Apoio ao GRO') + c);
    }

    // 05 Temas dos comentários
    if (sec('comentarios')) {
      var tm = lista(d.temas).filter(function (t) { return typeof t === 'string' && t; });
      c = '<p class="lede lede--curta">' + esc('Os comentários foram lidos pela consultoria e resumidos por tema. O texto original não é entregue à empresa.') + '</p>';
      c += tm.length ? '<ol class="plano-doc clima-temas">' + tm.map(function (t, i) {
        return '<li><span class="plano-doc__prazo">' + n2(i) + '</span><div><p>' + esc(t) + '</p></div></li>';
      }).join('') + '</ol>' : '<p class="nota-curta">Sem temas registrados pela consultoria.</p>';
      h += secao(sec('comentarios'), alt('comentarios'), cabecalhoPagina(sec('comentarios'), numeroCurto(tm.length) + ' temas') + c);
    }

    // 06 Plano da empresa
    var iv = C.intervencoes(res);
    c = '<p class="lede lede--curta">' + esc('Ações escolhidas a partir do resultado da empresa, com base em pesquisas sobre equipes. Os responsáveis e as datas são combinados na devolutiva.') + '</p>';
    c += iv.length ? '<ol class="plano-doc clima-acoes">' + iv.map(function (x, i) {
      return '<li data-intervencao="' + esc(x.id) + '"><span class="plano-doc__prazo">' + n2(i) + '</span><div><strong>' + esc(x.titulo) + '</strong>' +
        '<p class="nota-curta">' + esc('Por quê: ' + x.motivo) + '</p><p>' + esc(x.comoFazer) + '</p>' +
        (x.base ? '<p class="nota-curta">' + esc('Base: ' + x.base + '.') + '</p>' : '') + '</div></li>';
    }).join('') + '</ol>' : '<div class="obs obs--info"><div class="obs__tit">Manter o que funciona</div><p>' +
      esc('Nenhum tema da empresa ficou abaixo de 75. Mantenha as rotinas que sustentam esse resultado (por exemplo, a conversa curta depois das entregas) e reaplique no prazo.') + '</p></div>';
    c += '<p class="nota-curta mt16">' + esc(C.TEXTOS.naoRecomendar) + '</p>';
    c += '<h3 class="h3 mt48">Plano de 30, 60 e 90 dias</h3><div class="clima-tabela-rolagem"><table class="tabela-doc clima-plano"><thead><tr><th scope="col">Quando</th><th scope="col">O quê</th>' +
      '<th scope="col">Quem</th><th scope="col">Indicador</th><th scope="col">Responsável e data</th></tr></thead><tbody>' +
      C.PLANO_30_60_90.map(function (p) {
        return '<tr><td data-rotulo="Quando"><strong>' + esc(p.momento) + '</strong></td><td data-rotulo="O quê">' + esc(p.oque) + '</td><td data-rotulo="Quem">' + esc(p.quem) +
          '</td><td data-rotulo="Indicador">' + esc(p.indicador || '—') + '</td><td data-rotulo="Responsável e data" class="clima-preencher"></td></tr>';
      }).join('') + '</tbody></table></div>';
    c += '<p class="nota-curta mt16">' + esc('A devolutiva para a equipe faz parte da pesquisa: sem ela, a pesquisa perde o sentido para quem respondeu.') + '</p>';
    h += secao(sec('plano'), alt('plano'), cabecalhoPagina(sec('plano'), numeroCurto(iv.length) + ' ações') + c);

    // 07 Anexo PGR
    if (sec('pgr')) {
      var compl = res.complemento || {};
      var ce = lista(compl.grupos).filter(function (g) { return g.id === 'empresa'; })[0];
      function sinal(ind) {
        if (/^N/.test(ind)) {
          if (ind === 'N4') return compl.n4 ? compl.n4.pct + '% relatam' : 'sem resultado (menos de 10)';
          var x = ce && ce.itens ? ce.itens[ind] : null;
          return x ? x.escore + ' · ' + C.rotuloFaixa(x.faixa) : 'sem resultado';
        }
        var y = empresa && empresa.dimensoes ? empresa.dimensoes[ind] : null;
        return y ? y.escore + ' · ' + C.rotuloFaixa(y.faixa) : 'sem resultado';
      }
      c = '<p class="lede lede--curta">' + esc(C.TEXTOS.nr1) + '</p>';
      c += '<div class="clima-tabela-rolagem"><table class="tabela-doc clima-pgr"><thead><tr><th scope="col">Indicador</th><th scope="col">Fator (Guia MTE)</th><th scope="col">Sinal (empresa)</th>' +
        '<th scope="col">Severidade</th><th scope="col">Probabilidade</th><th scope="col">Responsável</th><th scope="col">Prazo</th></tr></thead><tbody>' +
        C.MAPA_PGR.map(function (m) {
          return '<tr><td data-rotulo="Indicador"><strong>' + esc(m.nome) + '</strong></td><td data-rotulo="Fator">' + esc(m.fator) + '</td><td data-rotulo="Sinal">' + esc(sinal(m.indicador)) +
            '</td><td data-rotulo="Severidade" class="clima-preencher"></td><td data-rotulo="Probabilidade" class="clima-preencher"></td><td data-rotulo="Responsável" class="clima-preencher"></td><td data-rotulo="Prazo" class="clima-preencher"></td></tr>';
        }).join('') + '</tbody></table></div>';
      c += '<h3 class="h3 mt48">O que este material não cobre (fica com a empresa e o responsável técnico)</h3><ul class="itens-doc">' +
        C.FALTA_PGR.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      h += secao(sec('pgr'), alt('pgr'), cabecalhoPagina(sec('pgr'), 'Para preencher') + c);
    }

    // 08 Método
    c = '<p class="lede lede--curta">' + esc(C.TEXTOS.origem + ' Versão das perguntas: ' + (rod.versaoItens || 'v0') + '.') + '</p>';
    c += '<div class="duas">' + C.BLOCOS.map(function (b) {
      return '<div class="cartao-doc"><div class="rotulo-doc">' + esc(b.nome) + '</div><ul class="itens-doc">' + b.itens.map(function (it) {
        return '<li>' + esc(it.texto + (it.invertido ? ' (frase negativa: conta ao contrário)' : '')) + '</li>';
      }).join('') + '</ul></div>';
    }).join('') + '</div>';
    c += '<h3 class="h3 mt48">Como o número é calculado</h3><ul class="itens-doc">' +
      ['Escala de 5 pontos, todos com rótulo (de "Discordo totalmente" a "Concordo totalmente"). Nenhuma pergunta é obrigatória.',
        'Frases negativas contam ao contrário (6 − resposta). O tema de cada pessoa é a média das perguntas respondidas, se ela respondeu pelo menos metade delas; depois vira 0 a 100 ((média − 1) × 25).',
        'O número do grupo é a média das pessoas, sem a resposta da liderança. Alinhamento: concordância dentro do grupo (rwg, com 0,70 e 0,50 como cortes de convenção).',
        'Anonimato: um grupo só aparece com 5 respostas ou mais; distribuição, comentários e o complemento de fatores psicossociais, com 10 ou mais; o relato de tratamento ofensivo, só no total da empresa. Nenhuma diferença entre recortes isola menos de 5 pessoas; equipes pequenas entram em "Outras equipes". Os grupos foram congelados no encerramento.',
        'As respostas brutas são apagadas ou viram números de grupo no prazo combinado depois da entrega. A empresa nunca recebe respostas individuais nem a lista de quem respondeu.'
      ].map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    c += '<h3 class="h3 mt48">Referências dos temas</h3><ul class="itens-doc clima-refs">' + C.REFERENCIAS.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
    h += secao(sec('metodo'), alt('metodo'), cabecalhoPagina(sec('metodo'), 'Versão ' + (rod.versaoItens || 'v0')) + c);

    return '<article class="doc doc--clima" data-modelo="clima">' + h +
      rodapeModelo(['Pesquisa de Clima da Equipe', emp.nome], C.TEXTOS.usoProibido) + '</article>';
  }

  var MODELOS = { equipe: equipeHtml, lideranca: liderancaHtml, pessoa: pessoaHtml, clima: climaHtml };

  /* ------------------------------------------------------------------ montagem */

  function contexto(rel) {
    var etapas = lista(rel.etapas);
    var linhas = lista(rel.ranking && rel.ranking.linhas).slice().sort(function (a, b) { return (a.posicao || 0) - (b.posicao || 0); });
    var somaPesos = 0, pesoPend = 0;
    etapas.forEach(function (e) { somaPesos += ehNumero(e.peso) ? e.peso : 0; if (e.pendente) pesoPend += ehNumero(e.peso) ? e.peso : 0; });
    var pendentes = etapas.filter(function (e) { return e.pendente; }).map(function (e) { return e.nome; });
    return {
      linhas: linhas,
      total: rel.atracao && ehNumero(rel.atracao.total) ? rel.atracao.total : 0,
      somaPesos: somaPesos,
      pesoPendentePct: somaPesos ? Math.round(pesoPend / somaPesos * 1000) / 10 : 0,
      etapasPendentes: pendentes,
      etapasFeitas: etapas.length - pendentes.length,
      pendente: pendentes.length > 0
    };
  }

  // Sem dados.modelo (ou 'processo'): relatório do processo seletivo. Modelos novos: equipe, lideranca, pessoa.
  function montarHtml(rel) {
    if (!rel || typeof rel !== 'object') return erroHtml(MENSAGEM_NAO_ENCONTRADO);
    if (rel.modelo && rel.modelo !== 'processo') {
      return Object.prototype.hasOwnProperty.call(MODELOS, rel.modelo) ? MODELOS[rel.modelo](rel) : erroHtml(MENSAGEM_NAO_ENCONTRADO);
    }
    var ctx = contexto(rel);
    return '<article class="doc">' + capa(rel, ctx) + indice(rel, ctx) + sumario(rel, ctx) + atracao(rel, ctx) +
      tecnica(rel, ctx) + disc(rel, ctx) + ranking(rel, ctx) + encerramento(rel, ctx) + rodape(rel) + '</article>';
  }

  function erroHtml(msg) {
    return '<div class="doc-erro" role="alert">' +
      '<h1 class="doc-erro__tit">' + esc(msg) + '</h1><p>Confira o link recebido ou fale com a consultoria.</p></div>';
  }

  function render(rel, elemento) {
    if (!elemento) return;
    elemento.innerHTML = montarHtml(rel);
    elemento.setAttribute('aria-busy', 'false');
  }

  function mostrarErro(elemento, msg) {
    if (!elemento) return;
    elemento.innerHTML = erroHtml(msg || MENSAGEM_NAO_ENCONTRADO);
    elemento.setAttribute('aria-busy', 'false');
    elemento.setAttribute('data-estado', 'erro');
  }

  // Busca pelo DISC_API.relatorioPublico (api.js / api-simulada.js). Sem o método: "não encontrado".
  function buscarRelatorio(token) {
    if (!token) return null;
    var api = root.DISC_API;
    if (!api || typeof api.relatorioPublico !== 'function') return null;
    return Promise.resolve().then(function () { return api.relatorioPublico(token); });
  }

  function iniciar() {
    var doc = root.document;
    var el = doc && doc.getElementById('relatorio');
    if (!el) return;
    var idPrevia = previaDaUrl(root.location && root.location.hash);
    if (idPrevia) {
      var relPrevia = lerPrevia(idPrevia);
      if (!relPrevia) { mostrarErro(el, MENSAGEM_PREVIA); return; }
      render(relPrevia, el);
      el.insertAdjacentHTML('afterbegin', faixaPreviaHtml());
      el.insertAdjacentHTML('beforeend', botaoPdfHtml());
      ligarBotaoPdf(el);
      el.setAttribute('data-estado', 'pronto');
      el.setAttribute('data-previa', 'sim');
      doc.title = 'Prévia · ' + (relPrevia.titulo || (relPrevia.processo && (relPrevia.processo.vaga || relPrevia.processo.nome)) || 'Relatório');
      return;
    }
    var token = tokenDaUrl(root.location && root.location.search, root.location && root.location.hash);
    var busca = buscarRelatorio(token);
    if (!busca) { mostrarErro(el); return; }
    busca.then(function (resp) {
      var rel = resp && resp.relatorio;
      if (!resp || resp.ok === false || !rel || typeof rel !== 'object') { mostrarErro(el); return; }
      // relatorio_publico também devolve `modelo` ao lado do snapshot.
      if (!rel.modelo && resp.modelo && resp.modelo !== 'processo') rel = Object.assign({}, rel, { modelo: resp.modelo });
      render(rel, el);
      el.insertAdjacentHTML('beforeend', botaoPdfHtml());
      ligarBotaoPdf(el);
      el.setAttribute('data-estado', 'pronto');
      if (rel.modelo && rel.modelo !== 'processo') {
        el.setAttribute('data-modelo', String(rel.modelo).replace(/[^a-z]/g, ''));
        doc.title = tituloDaAba(rel.titulo);
        return;
      }
      var p = rel.processo || {};
      doc.title = 'Relatório · ' + (p.vaga || p.nome || 'Processo seletivo') + (p.empresa ? ' · ' + p.empresa : '');
    }, function () { mostrarErro(el); });
  }

  var DISC_RELATORIO_VIEW = {
    MENSAGEM_NAO_ENCONTRADO: MENSAGEM_NAO_ENCONTRADO,
    esc: esc,
    numero: numero,
    numeroCurto: numeroCurto,
    moeda: moeda,
    pct: pct,
    data: data,
    periodo: periodo,
    rotuloSituacao: rotuloSituacao,
    rotuloAderencia: rotuloAderencia,
    rotuloConfiabilidade: rotuloConfiabilidade,
    tokenDaUrl: tokenDaUrl,
    previaDaUrl: previaDaUrl,
    lerPrevia: lerPrevia,
    PREFIXO_PREVIA: PREFIXO_PREVIA,
    PREVIA_VALIDADE_MS: PREVIA_VALIDADE_MS,
    texto: texto,
    montarHtml: montarHtml,
    organogramaHtml: organogramaHtml,
    mapaRitmoFocoHtml: mapaRitmoFocoHtml,
    reguaHtml: reguaHtml,
    naturalExigidoHtml: naturalExigidoHtml,
    avatarHtml: avatarHtml,
    fotoValida: fotoValida,
    iniciais: iniciais,
    rotuloNivel: rotuloNivel,
    equipeV2: equipeV2,
    TEXTOS_EQUIPE: { falta: TEXTO_FALTA, excesso: TEXTO_EXCESSO, estilos: ROTULO_ESTILOS, distancia: TEXTO_DISTANCIA, avisoRelacoes: AVISO_RELACOES, fixos: TEXTO_EQUIPE },
    render: render,
    mostrarErro: mostrarErro,
    iniciar: iniciar,
    tituloDaAba: tituloDaAba,
    botaoPdfHtml: botaoPdfHtml
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_RELATORIO_VIEW;
  else {
    root.DISC_RELATORIO_VIEW = DISC_RELATORIO_VIEW;
    if (root.document) {
      if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', iniciar);
      else iniciar();
    }
  }
})(typeof self !== 'undefined' ? self : this);
