/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · arquivo do currículo: confere tipo e tamanho, lê o texto do PDF (pdf.js 3.11.174) ou do Word
 * (mammoth 1.6.0) no próprio navegador e entrega ao leitor simples (texto-curriculo.js). Foto e .doc só são guardados.
 * As duas bibliotecas vêm do cdnjs SÓ quando a pessoa escolhe um arquivo, com integrity (SRI) e crossorigin="anonymous".
 */
(function (root) {
  'use strict';
  const doc = root.document, P = root.VSC_P, { esc, ic } = P;
  const CDN = {
    pdf: { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', sri: 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e' },
    pdfw: { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js', sri: 'sha384-SnzOobpRMLXZ52iJvZm/C0fYw0OQemTXzTjIsdsfMcrCtCEe9qgzxTd3RSklO5x2' },
    docx: { src: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', sri: 'sha384-nFoSjZIoH3CCp8W639jJyQkuPHinJ2NHe7on1xvlUA7SuGfJAfvMldrsoAVm6ECz' }
  };
  const SCRIPTS = {};
  P.ACEITA = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.heic,.heif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,image/jpeg,image/png,image/heic,image/heif';
  P.DICA_ARQ = 'Antes de mandar, tire do arquivo foto, idade, CPF e estado civil. A empresa não precisa disso.';

  function carregarScript(lib) {
    if (SCRIPTS[lib.src]) return SCRIPTS[lib.src];
    SCRIPTS[lib.src] = new Promise((ok, falha) => {
      const s = doc.createElement('script');
      s.src = lib.src; s.integrity = lib.sri; s.crossOrigin = 'anonymous'; s.async = true;
      s.onload = () => ok();
      s.onerror = () => { delete SCRIPTS[lib.src]; falha(new Error('não carregou')); };
      (doc.head || doc.body).appendChild(s);
    });
    return SCRIPTS[lib.src];
  }
  function libPDF() {
    return carregarScript(CDN.pdf).then(() => carregarScript(CDN.pdfw)).then(() => {
      const lib = root.pdfjsLib;
      if (!lib) throw new Error('sem pdf.js');
      try { lib.GlobalWorkerOptions.workerSrc = CDN.pdfw.src; } catch (e) { /* usa o padrão */ }
      return lib;
    });
  }
  P.abrirPDF = (file) => Promise.all([libPDF(), file.arrayBuffer()]).then((r) => r[0].getDocument({ data: new Uint8Array(r[1]), isEvalSupported: false, disableFontFace: true }).promise);
  function textoPDF(file, prog) {
    prog = prog || (() => {});
    return P.abrirPDF(file).then((pdf) => {
      const n = Math.min(pdf.numPages, 3), linhas = [];
      let cadeia = Promise.resolve();
      prog(1, n + 1);
      for (let p = 1; p <= n; p++) {
        cadeia = cadeia.then(() => pdf.getPage(p)).then((pg) => pg.getTextContent()).then((tc) => {
          prog(p + 1, n + 1);
          let linha = '', y0 = null, xFim = null;
          tc.items.forEach((it) => {
            if (typeof it.str !== 'string') return;
            const y = it.transform[5], x = it.transform[4];
            if (y0 !== null && Math.abs(y - y0) > 2) { if (linha.trim()) linhas.push(linha); linha = ''; xFim = null; }
            if (linha && xFim !== null && x - xFim > 1.5 && !/\s$/.test(linha) && !/^\s/.test(it.str)) linha += ' ';
            linha += it.str; y0 = y; xFim = x + (it.width || 0);
            if (it.hasEOL) { if (linha.trim()) linhas.push(linha); linha = ''; y0 = null; xFim = null; }
          });
          if (linha.trim()) linhas.push(linha);
        });
      }
      return cadeia.then(() => linhas.join('\n'));
    });
  }
  P.textoDOCX = (file, prog) => Promise.all([carregarScript(CDN.docx), file.arrayBuffer()]).then((r) => {
    if (!root.mammoth) throw new Error('sem mammoth');
    if (prog) prog(1, 2);
    return root.mammoth.extractRawText({ arrayBuffer: r[1] }).then((x) => x.value || '');
  });
  // pré-carrega a biblioteca do PDF quando a pessoa abre a folha de candidatura (o arquivo ainda não foi escolhido)
  P.prepararLeitor = () => { libPDF().catch(() => {}); };

  /* ---------- tipo, tamanho e dados do arquivo ---------- */
  P.tipoArquivo = function (f) {
    const ext = ((f.name || '').split('.').pop() || '').toLowerCase();
    if (/^image\/(jpeg|jpg|png|heic|heif)$/.test(f.type) || /^(jpe?g|png|heic|heif)$/.test(ext)) return 'foto';
    if (ext === 'pdf' || f.type === 'application/pdf') return 'pdf';
    if (ext === 'docx') return 'docx';
    if (ext === 'doc') return 'doc';
    return '';
  };
  P.validarArquivo = function (f) {
    if (!P.tipoArquivo(f)) return 'Use um arquivo PDF, Word ou uma foto (JPG, PNG ou HEIC).';
    if (f.size > 10 * 1048576) return 'Este arquivo tem mais de 10 MB. Tente um PDF menor ou uma foto.';
    if (!(f.size > 0)) return 'Este arquivo está vazio. Escolha outro.';
    return '';
  };
  P.infoArquivo = (f) => { const tipo = P.tipoArquivo(f); return { nome: f.name, kb: Math.max(1, Math.round(f.size / 1024)), tipo, file: f, url: tipo === 'foto' ? root.URL.createObjectURL(f) : '', ts: new Date().toISOString() }; };
  P.AVISOS_LEITURA = {
    foto: 'Foto guardada. A gente não lê fotos: a empresa vê a imagem do jeito que você mandou. Preencha seus dados abaixo.',
    doc: 'Arquivo .doc guardado. Não deu para ler esse formato antigo, mas ele vai junto do mesmo jeito. Preencha seus dados abaixo.',
    vazio: 'Não achamos texto neste arquivo (parece uma imagem). Ele vai junto do mesmo jeito. Preencha seus dados abaixo.',
    falhou: 'Não deu para ler o arquivo agora. Ele vai junto do mesmo jeito. Preencha seus dados abaixo.'
  };
  P.lerArquivo = function (f, prog) {
    const tipo = P.tipoArquivo(f);
    if (tipo === 'foto' || tipo === 'doc') return Promise.resolve({ dados: null, aviso: tipo });
    const p = tipo === 'pdf' ? textoPDF(f, prog) : P.textoDOCX(f, prog);
    return p.then((txt) => {
      if (!txt || txt.replace(/\s/g, '').length < 20) return { dados: null, aviso: 'vazio' };
      return { dados: root.VSC_CURRICULO_TEXTO.extrair(txt, { cidades: P.D.cidades }), aviso: null };
    }).catch(() => ({ dados: null, aviso: 'falhou' }));
  };

  /* ---------- peças de tela do arquivo ---------- */
  P.erroArquivo = function (er, ctx) {
    if (!er) return '';
    return `<ul class="arquivos" role="alert"><li class="arquivo" data-estado="erro"><span class="arquivo-folha" aria-hidden="true"></span><div class="arquivo-info"><span class="arquivo-nome">${esc(er.nome)}</span>` +
      `<span class="arquivo-meta">${ic('erro')}${esc(er.msg)}</span></div></li></ul>` +
      `<p class="mt8"><label class="btn sec">${ic('upload')}Escolher outro arquivo<input class="sr" type="file" id="arq-${ctx}-outro" accept="${P.ACEITA}" data-arquivo="${ctx}"></label></p>`;
  };
  P.progressoLeitura = function (feito, total) {
    const p = P.$('#ap-prog'), t = P.$('#ap-prog-txt');
    if (p) p.parentNode.style.setProperty('--p', String(Math.min(1, feito / total)));
    if (t) t.textContent = feito >= total ? 'Pronto' : total > 2 ? 'Lendo a página ' + feito + ' de ' + (total - 1) : 'Lendo o texto…';
  };
  P.papelMini = () => '<div class="papel-mini" aria-hidden="true">' + '<i></i><i></i><i></i><i></i><i></i><i></i><i></i>' + '</div>';
  // cada tela que recebe arquivo registra o seu tratador: P.arquivoCtx.ap, .cv, .trocar-ap
  P.arquivoCtx = {};
  P.escolheuArquivo = function (f, ctx) {
    const fn = P.arquivoCtx[ctx];
    if (fn) fn(f, ctx);
  };
})(typeof self !== 'undefined' ? self : this);
