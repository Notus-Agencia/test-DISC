/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · "Candidatar-me" (folha). Três caminhos: anexar o currículo (a gente lê e preenche), montar em 3
 * perguntas, ou só nome, e-mail e WhatsApp. Pessoa nova: confere os dados -> confirma o e-mail com um código -> a conta nasce e a
 * candidatura sai (anexo sobe com curriculoEnviar; depois candidatar com idLocal, que não duplica se repetir). Pessoa com conta e dados:
 * um toque em "Enviar". Sem internet: a candidatura fica na fila do aparelho (fila.js) e sai quando a rede voltar.
 */
(function (root) {
  'use strict';
  const P = root.VSC_P, { $, $$, esc, ic } = P, E = P.est, D = P.D;
  const cod = P.codigo, B = root.VSC_BUSCA;
  let AP = null;
  const SUG_FUNCOES = ['Atendente', 'Operador(a) de caixa', 'Auxiliar de cozinha', 'Vendedor(a)', 'Auxiliar de limpeza', 'Repositor(a)', 'Servente de obra', 'Motorista', 'Recepcionista'];
  const TEXTO_ACEITE = 'Li e aceito os Termos de uso e o Aviso de privacidade do Vagas sem Caos. Tenho 18 anos ou mais.';
  const AVISO_IDADE = `<p class="idade">${ic('info')}<span>Precisa ter 18 anos ou mais. Vale também para estágio.</span></p>`;
  const TEMPO_FRASE = { 'Ainda não': 'sem experiência ainda', 'Menos de 1 ano': 'menos de 1 ano de experiência', '1 a 3 anos': '1 a 3 anos de experiência', 'Mais de 3 anos': 'mais de 3 anos de experiência' };
  const VOLTA = { lendo: 'inicio', m1: 'inicio', m2: 'm1', m3: 'm2' };
  P.ganchos = P.ganchos || {};

  /* ---------- peças de formulário ---------- */
  const aberta = (p) => /^(em que|que |qual|quais|quanto)/i.test(p);
  const chip = (alvo, campo, modo, valor, rotulo, ligado, extra) =>
    `<button class="chip" type="button" data-alvo="${alvo}" data-campo="${campo}" data-modo="${modo}" data-v="${esc(valor)}" aria-pressed="${!!ligado}"${extra || ''}>${ic('check', 'marca')}${esc(rotulo)}</button>`;
  P.campo = function (id, rot, val, o) {
    o = o || {};
    const erro = o.erro ? `<p class="erro-campo" id="${id}-erro">${ic('erro')}<span>${o.erro}</span></p>` : '';
    return `<div class="campo"><label for="${id}">${rot}${o.opc ? ' <span class="opcional">(opcional)</span>' : ''}</label>` +
      `<input class="entrada" id="${id}" data-alvo="${o.alvo || 'ap'}" data-campo="${o.k}" value="${esc(val || '')}"${o.attrs || ''}${o.erro ? ` aria-invalid="true" aria-describedby="${id}-erro"` : ''}>` +
      (o.dica ? `<p class="dica${o.falta ? ' falta' : ''}">${o.dica}</p>` : '') + erro + '</div>';
  };
  P.selecao = function (id, rot, opcoes, o) {
    o = o || {};
    return `<div class="campo"><label for="${id}">${rot}</label><div class="selecao"><select class="entrada" id="${id}" data-alvo="${o.alvo || 'ap'}" data-campo="${o.k}"${o.erro ? ` aria-invalid="true" aria-describedby="${id}-erro"` : ''}>${opcoes}</select>${ic('chevron')}</div>` +
      (o.erro ? `<p class="erro-campo" id="${id}-erro">${ic('erro')}<span>${o.erro}</span></p>` : '') + '</div>';
  };
  P.opcoesCidade = (sel) => D.cidades.map((c) => `<option value="${esc(c.id)}"${sel === c.id ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
  const bairrosDe = (cid) => { const c = D.CID[cid]; if (!c) return []; const b = c.bairros || []; return b.indexOf('Zona rural') >= 0 || !b.length ? b : b.concat(['Zona rural']); };
  P.bairrosDe = bairrosDe;
  P.opcoesBairro = (cid, sel) => '<option value="">Escolha</option>' + bairrosDe(cid).map((b) => `<option${sel === b ? ' selected' : ''}>${esc(b)}</option>`).join('');
  P.linhaAceite = (id, alvo, marcado, erro) =>
    `<div class="aceite-bloco"><label class="aceite" for="${id}"><input type="checkbox" id="${id}" data-alvo="${alvo}" data-campo="aceite"${marcado ? ' checked' : ''}${erro ? ` aria-invalid="true" aria-describedby="${id}-erro"` : ''}><span>${TEXTO_ACEITE}</span></label>` +
    (erro ? `<p class="erro-campo" id="${id}-erro">${ic('erro')}<span>${erro}</span></p>` : '') +
    '<p class="aceite-links"><a class="link" href="termos.html" target="_blank" rel="noopener">Ler os Termos de uso</a><a class="link" href="privacidade.html" target="_blank" rel="noopener">Ler o Aviso de privacidade</a></p></div>';

  function dadosVazios(v) {
    const mb = E.meuBairro;
    return { nome: '', whats: '', email: '', cidade: (mb && D.CID[mb.cidade] ? mb.cidade : v && D.CID[v.cidade] ? v.cidade : (D.cidades[0] || {}).id) || '', bairro: '', funcao: '', tempo: '', experiencias: [],
      outras: [], cnh: [], escolaridade: '', cursos: '', turnos: [], trabalhos: [], onde: '', aceite: false };
  }
  const temPerfil = () => !!(E.conta && E.conta.nome && E.conta.whats && E.curriculo && E.curriculo.dados && E.curriculo.dados.cidade);
  const tituloFuncao = (v) => v.titulo.replace(/\s*\((?!a\)|o\))[^)]*\)\s*$/, '');
  const apVaga = (v) => `<div class="ap-vaga"><b>${esc(v.titulo)}</b><span>${esc(P.empresaDe(v).nome)} · ${esc(P.salTexto(v.salario))}</span></div>`;
  const passosBarra = (n) => `<div class="passos" aria-label="Passo ${n} de 3"><div class="passos-barras">${[1, 2, 3].map((i) => `<i${i <= n ? ' data-feito' : ''}></i>`).join('')}</div><span class="passos-texto">${n} de 3</span></div>`;
  const caixaIc = (n) => `<span class="setor-ic">${ic(n)}</span>`;
  const precisaCNH = (v, funcao) => !!B.cnhDaVaga(v) || /motorist|motoboy|entregador|caminh|tratorist|operador de (pa|maquina)/.test(B.norm((funcao || '') + ' ' + v.titulo));

  function perguntasHTML(v, resp, erro) {
    if (!v.perguntas.length) return '';
    return '<h3>A empresa pergunta</h3>' + v.perguntas.map((p, i) => {
      const r = resp[i] || '', falta = erro && !r, pre = AP && AP.pre && AP.pre[i] && r === 'Sim';
      if (aberta(p)) return `<div class="pergunta">${P.campo('ap-resp-' + i, esc(p), r, { k: 'resp-' + i, erro: falta ? 'Responda as perguntas da empresa.' : '' })}</div>`;
      return `<fieldset class="pergunta"${falta ? ' aria-invalid="true"' : ''}><legend>${esc(p)}</legend><div class="segmentado" role="group" data-grupo="ap-resp" data-i="${i}">` +
        `<button type="button" data-valor="Sim" aria-pressed="${r === 'Sim'}">Sim</button><button type="button" data-valor="Não" aria-pressed="${r === 'Não'}">Não</button></div>` +
        (pre ? `<p class="dica mt6">${ic('documento')} Marcado pelo seu currículo. Confira.</p>` : '') +
        (falta ? `<p class="erro-campo">${ic('erro')}<span>Responda as perguntas da empresa.</span></p>` : '') + '</fieldset>';
    }).join('');
  }
  // pergunta "Tem CNH categoria D?" já vem marcada quando o currículo responde (a pessoa confere)
  function preMarcar(v, cnh) {
    AP.pre = AP.pre || {};
    v.perguntas.forEach((p, i) => {
      const m = p.match(/CNH(?:\s+categoria)?\s+([A-E])\b/i);
      if (m && (cnh || []).indexOf(m[1].toUpperCase()) >= 0 && !AP.resp[i]) { AP.resp[i] = 'Sim'; AP.pre[i] = true; }
    });
  }
  // 6.2: o que a empresa recebe, em uma linha acima do botão
  function avisoEnvio(e, temCv) {
    const nome = esc(e.nome);
    const txt = e.verificada
      ? 'Ao enviar, a empresa ' + nome + ' recebe ' + P.listaTexto(['seu nome'].concat(temCv ? ['seu currículo'] : []).concat(['seu WhatsApp'])) + '.'
      : 'Ao enviar, a empresa ' + nome + ' vê seu primeiro nome' + (temCv ? ' e o resumo do seu currículo. O arquivo e o WhatsApp só vão se você liberar.' : '. Seu WhatsApp só vai se você liberar.');
    return `<p class="aviso-envio">${txt} <button class="link link-texto" type="button" data-acao="privacidade">Como usamos seus dados</button></p>`;
  }
  const dicaFoto = `<p class="dica mt12">${P.DICA_ARQ} A foto do papel vai inteira, do jeito que sair.</p>`;

  /* ---------- os passos ---------- */
  const PASSO = {
    inicio() {
      const v = D.VAGA[AP.vagaId];
      return { titulo: 'Candidatar-me a esta vaga', corpo: apVaga(v) + AVISO_IDADE +
        '<h3>Como você quer se candidatar?</h3><div class="caminhos">' +
          `<label class="caminho" data-upload="ap">${caixaIc('anexo')}<span><b>Tenho o currículo</b><small>Arquivo ou foto do papel. A gente lê e preenche para você.</small></span>${ic('chevron-dir')}` +
            `<input class="sr" type="file" id="arq-ap" accept="${P.ACEITA}" data-arquivo="ap"></label>` +
          `<button class="caminho" type="button" data-acao="ap-montar">${caixaIc('lapis')}<span><b>Montar agora</b><small>3 perguntas, com sugestões para tocar</small></span>${ic('chevron-dir')}</button>` +
          `<button class="caminho" type="button" data-acao="ap-rapido">${caixaIc('conversa')}<span><b>Só nome, e-mail e WhatsApp</b><small>A empresa chama você para conversar</small></span>${ic('chevron-dir')}</button>` +
        `</div>${P.erroArquivo(AP.erroArq, 'ap')}${dicaFoto}${P.golpe()}${P.ganchos.apInicio ? P.ganchos.apInicio() : ''}` };
    },
    lendo() {
      const a = AP.arq, foto = a.tipo === 'foto';
      return { titulo: foto ? 'Guardando a foto' : 'Lendo seu currículo', corpo: `<div class="leitura" role="status" aria-live="polite">${P.papelMini()}` +
        `<b>${foto ? 'Guardando a foto…' : 'Lendo seu currículo…'}</b><p class="num">${esc(a.nome)} · ${a.kb} KB</p>` +
        '<span class="progresso" role="progressbar" aria-label="Leitura do arquivo" aria-valuemin="0" aria-valuemax="100"><i id="ap-prog"></i></span><p class="detalhe" id="ap-prog-txt">Abrindo o arquivo…</p>' +
        '<p class="detalhe larg-36ch">No resumo, só nome, contato, cidade, função e experiências. O arquivo vai como está: se tiver CPF ou data de nascimento, você pode trocar por um sem eles.</p></div>' };
    },
    conferir() {
      const v = D.VAGA[AP.vagaId], e = P.empresaDe(v), d = AP.dados, c = AP.caminho, er = AP.erros, L = AP.lidos || {}, h = [];
      const lidos = c === 'anexo' && !AP.aviso, tudo = !!e.verificada;
      const falta = (k) => (lidos && !d[k] ? 'Não achamos no arquivo. Preencha aqui.' : '');
      if (AP.erroEnvio) h.push(`<div class="faixa erro" role="alert">${ic('erro')}<span><b>Erro:</b> ${esc(AP.erroEnvio)}</span></div>`);
      if (c === 'anexo' && AP.arq) {
        h.push(`<ul class="arquivos"><li class="arquivo" data-estado="pronto"><span class="arquivo-folha" aria-hidden="true"></span><div class="arquivo-info"><span class="arquivo-nome">${esc(AP.arq.nome)}</span>` +
          `<span class="arquivo-meta">${ic('check')}${AP.arq.kb} KB · Guardado</span></div>` +
          `<label class="btn sec peq">Trocar<input class="sr" type="file" id="arq-ap-trocar" accept="${P.ACEITA}" data-arquivo="ap"></label>` +
          `<button class="btn-icone peq" type="button" data-acao="ap-remover" aria-label="Remover arquivo">${ic('x')}</button></li></ul>`);
        h.push(P.erroArquivo(AP.erroArq, 'ap'));
        if (AP.arq.tipo === 'foto' && AP.arq.url) h.push('<img class="foto-previa" src="' + esc(AP.arq.url) + '" alt="Foto do currículo que você mandou">');
        h.push(AP.aviso ? `<div class="faixa calmo mt12">${ic('info')}<span>${P.AVISOS_LEITURA[AP.aviso]}</span></div>` : `<p class="dica lido">${ic('documento')} Preenchido a partir do seu arquivo. Confira.</p>`);
        if ((L.sensiveis || []).length) {
          h.push(`<div class="faixa aviso mt12">${ic('alerta')}<span>Seu arquivo mostra ${esc(P.listaTexto(L.sensiveis))}. A empresa não precisa disso. Se quiser, troque por um arquivo sem esses dados.` +
            `<span class="fila mt10"><label class="btn sec peq">${ic('upload')}Trocar arquivo<input class="sr" type="file" id="arq-ap-trocar-aviso" accept="${P.ACEITA}" data-arquivo="ap"></label></span></span></div>`);
        }
        if (!tudo && (L.temContato || AP.arq.tipo === 'foto')) {
          h.push(`<p class="dica mt10">${ic('cadeado')} ${AP.arq.tipo === 'foto' ? 'Se a foto tiver seu telefone, ela só vai para esta empresa quando você liberar.'
            : 'Seu arquivo tem seu ' + esc(P.listaTexto([L.whats ? 'telefone' : '', L.email ? 'e-mail' : ''].filter(Boolean))) + '. O arquivo só vai para esta empresa quando você liberar.'}</p>`);
        }
      }
      if (c === 'montar') h.push(`<div class="faixa calmo">${ic('check')}<span>Currículo montado: <b>${esc(d.funcao)}</b>${d.tempo ? ', ' + TEMPO_FRASE[d.tempo] : ''}${d.escolaridade ? ', ' + esc(d.escolaridade.toLowerCase()) : ''}. <button class="link link-texto" type="button" data-acao="ap-ir" data-passo="m1">Mudar</button></span></div>`);
      if (c === 'rapido') h.push('<p class="soft">A empresa recebe seu nome e chama você para conversar. Dá para anexar o currículo depois.</p>');
      const exps = d.experiencias, outras = d.outras;
      h.push('<div class="pilha g16 mt16">' +
        P.campo('ap-nome', 'Nome', d.nome, { k: 'nome', erro: er.nome, dica: falta('nome'), falta: !!falta('nome'), attrs: ' autocomplete="name" autocapitalize="words" enterkeyhint="next"' }) +
        P.campo('ap-whats', 'WhatsApp', d.whats, { k: 'whats', erro: er.whats, dica: falta('whats') || 'A empresa chama você por aqui. Só vai quando a empresa for verificada ou você liberar.', falta: !!falta('whats'), attrs: ' inputmode="tel" autocomplete="tel-national" placeholder="(62) 99999-9999" data-mascara-whats' }) +
        P.campo('ap-email', 'E-mail', d.email, { k: 'email', erro: er.email, dica: E.conta ? '' : 'Mandamos um código para este e-mail. Não precisa de senha.', attrs: ' type="email" inputmode="email" autocomplete="email" placeholder="seu@email.com"' }) +
        P.selecao('ap-cidade', 'Cidade onde você mora', P.opcoesCidade(d.cidade), { k: 'cidade' }) +
        (bairrosDe(d.cidade).length ? P.selecao('ap-bairro', 'Bairro <span class="opcional">(opcional)</span>', P.opcoesBairro(d.cidade, d.bairro), { k: 'bairro' }) : '') +
        (c !== 'rapido' && c !== 'montar' ? P.campo('ap-funcao', 'O que você quer fazer', d.funcao, { k: 'funcao', dica: falta('funcao'), falta: !!falta('funcao'), attrs: ' placeholder="Ex.: auxiliar de cozinha"' }) : '') +
        ((exps.length || outras.length) && c === 'anexo' ? '<div class="campo"><p class="rotulo">Experiências que achamos no arquivo</p><ul class="experiencias-lidas">' +
          exps.map((x, i) => `<li><span>${esc(P.fmtExp(x, tudo))}</span><button class="btn-icone peq" type="button" data-acao="ap-tirar-exp" data-i="${i}" aria-label="Tirar esta experiência">${ic('x')}</button></li>`).join('') +
          outras.map((x, i) => `<li><span>${esc(x)}</span><button class="btn-icone peq" type="button" data-acao="ap-tirar-exp" data-i="${exps.length + i}" aria-label="Tirar esta experiência">${ic('x')}</button></li>`).join('') + '</ul>' +
          (tudo ? '' : '<p class="dica mt6">A empresa vê a função e o tempo, sem o nome dos lugares, até você liberar.</p>') + '</div>' : '') +
        (c === 'anexo' ? `<div><p class="rotulo mb8">Experiência nisso</p><div class="chips sem-fim">${P.TEMPOS.map((x) => chip('ap', 'tempo', 'uma', x, x, d.tempo === x)).join('')}</div></div>` +
          `<div><p class="rotulo mb8">CNH <span class="opcional">(opcional)</span>${L.cnh && L.cnh.length ? ' <span class="dica">· lida do arquivo</span>' : ''}</p><div class="chips sem-fim">${['A', 'B', 'C', 'D', 'E'].map((x) => chip('ap', 'cnh', 'multi', x, x, d.cnh.indexOf(x) >= 0)).join('')}</div>` +
          '<p class="dica mt6">Se deixar em branco, a empresa não vê nada sobre CNH.</p></div>' : '') +
      '</div>');
      h.push(perguntasHTML(v, AP.resp, er.resp));
      h.push(avisoEnvio(e, c !== 'rapido'));
      if (!E.conta) h.push(P.linhaAceite('ap-aceite', 'ap', d.aceite, er.aceite));
      h.push(P.golpe());
      return { titulo: c === 'rapido' ? 'Seus dados' : 'Confira seus dados', voltar: true, corpo: h.join(''), rodape: `<button class="btn grande largo" type="button" data-acao="ap-enviar"${AP.enviando ? ' disabled' : ''}>${ic('enviar')}${E.conta ? 'Enviar candidatura' : 'Continuar'}</button>` };
    },
    m1() {
      const v = D.VAGA[AP.vagaId], d = AP.dados, tv = tituloFuncao(v), ntv = B.norm(tv);
      const sug = [tv].concat(SUG_FUNCOES.filter((x) => { const n = B.norm(x); return ntv.indexOf(n) !== 0 && n.indexOf(ntv) !== 0; })).slice(0, 9);
      return { titulo: 'Montar currículo', voltar: true, corpo: passosBarra(1) + '<h3>O que você quer fazer?</h3>' +
        P.campo('m-funcao', '<span class="sr">Função</span>', d.funcao, { k: 'funcao', erro: AP.erros.funcao, attrs: ' placeholder="Ex.: auxiliar de cozinha" autocapitalize="sentences"' }) +
        `<p class="dica mt10 mb8">Ou toque numa sugestão:</p><div class="chips sem-fim">${sug.map((x) => chip('ap', 'funcao', 'texto', x, x, d.funcao === x)).join('')}</div>`,
        rodape: '<button class="btn grande largo" type="button" data-acao="ap-continuar">Continuar</button>' };
    },
    m2() {
      const d = AP.dados;
      return { titulo: 'Montar currículo', voltar: true, corpo: passosBarra(2) + `<h3>Já trabalhou com isso?</h3><p class="soft mb8">${esc(d.funcao)}</p>` +
        `<div class="chips sem-fim">${P.TEMPOS.map((x) => chip('ap', 'tempo', 'uma', x, x, d.tempo === x)).join('')}</div>` +
        (AP.erros.tempo ? `<p class="erro-campo mt8">${ic('erro')}<span>${AP.erros.tempo}</span></p>` : '') +
        (d.tempo && d.tempo !== 'Ainda não' ? `<div class="mt16">${P.campo('m-onde', 'Onde?', d.onde, { k: 'onde', opc: true, attrs: ' placeholder="Ex.: Mercearia do bairro"' })}</div>` : '') +
        (d.trabalhos.length ? '<h3>Outros trabalhos</h3><ul class="experiencias-lidas">' + d.trabalhos.map((x, i) => `<li><span>${esc(x)}</span><button class="btn-icone peq" type="button" data-acao="ap-tirar-trab" data-i="${i}" aria-label="Tirar este trabalho">${ic('x')}</button></li>`).join('') + '</ul>' : '') +
        (AP.novoTrab
          ? `<div class="trabalho-novo pilha g12">${P.campo('m-t-funcao', 'Que trabalho?', AP.novoTrab.funcao, { k: 'nt-funcao', attrs: ' placeholder="Ex.: Caixa"' })}${P.campo('m-t-onde', 'Onde?', AP.novoTrab.onde, { k: 'nt-onde', opc: true })}` +
            `<div class="chips sem-fim">${P.TEMPOS.slice(1).map((x) => chip('ap', 'nt-tempo', 'uma', x, x, AP.novoTrab.tempo === x)).join('')}</div><div class="fila"><button class="btn sec" type="button" data-acao="ap-salvar-trab">Salvar trabalho</button><button class="btn fantasma" type="button" data-acao="ap-cancelar-trab">Cancelar</button></div></div>`
          : `<p class="mt12"><button class="link" type="button" data-acao="ap-novo-trab">${ic('mais')}Adicionar outro trabalho</button></p>`),
        rodape: '<button class="btn grande largo" type="button" data-acao="ap-continuar">Continuar</button>' };
    },
    // estudo e horário numa tela só; a CNH só aparece quando a função ou a vaga pede
    m3() {
      const d = AP.dados, v = D.VAGA[AP.vagaId], pede = precisaCNH(v, d.funcao);
      return { titulo: 'Montar currículo', voltar: true, corpo: passosBarra(3) + `<h3>Até onde você estudou? <span class="opcional">(opcional)</span></h3><div class="chips sem-fim">${P.ESCOLAS.map((x) => chip('ap', 'escolaridade', 'uma', x, x, d.escolaridade === x)).join('')}</div>` +
        `<h3>Quando você pode trabalhar? <span class="opcional">(opcional)</span></h3><div class="chips sem-fim">${P.TURNOS.map((x) => chip('ap', 'turnos', 'multi', x, x, d.turnos.indexOf(x) >= 0)).join('')}</div>` +
        (pede ? `<h3>CNH <span class="opcional">(opcional)</span></h3><div class="chips sem-fim">${['A', 'B', 'C', 'D', 'E'].map((x) => chip('ap', 'cnh', 'multi', x, x, d.cnh.indexOf(x) >= 0)).join('')}</div><p class="dica mt8">Se deixar em branco, a empresa não vê nada sobre CNH.</p>` : '') +
        `<div class="mt16">${P.campo('m-cursos', 'Cursos', d.cursos, { k: 'cursos', opc: true, attrs: ' placeholder="Ex.: Informática básica"' })}</div>`,
        rodape: '<button class="btn grande largo" type="button" data-acao="ap-continuar">Continuar</button>' };
    },
    enviando() {
      return { titulo: 'Enviando', corpo: `<div class="leitura" role="status" aria-live="polite"><span class="giro" aria-hidden="true"></span><b>Enviando sua candidatura…</b><p class="detalhe">Isso leva só um instante.</p></div>` };
    },
    codigo() {
      return { titulo: 'Confirme seu e-mail', voltar: true, corpo: `<p>Mandamos um código de 6 números para <b class="num">${esc(cod.ST.ap ? cod.ST.ap.mascarado : '')}</b>. Olhe também a caixa de spam.</p>${cod.html('ap')}` +
        '<p class="mt8"><button class="link" type="button" data-acao="ap-voltar">Trocar o e-mail</button></p><p class="detalhe mt12">Com o código, sua conta é criada. Não precisa de senha.</p>',
        rodape: '<button class="btn grande largo" type="button" data-acao="conferir-codigo" data-codigo="ap">Confirmar e enviar</button>' };
    },
    conta() {
      const v = D.VAGA[AP.vagaId], e = P.empresaDe(v), cv = E.curriculo, a = AP.arq || (cv && cv.arquivo), temCv = !!(a || (cv && cv.dados && cv.dados.funcao));
      const nomeArq = a ? a.nome : '', tudo = !!e.verificada;
      const vai = tudo ? 'Vai junto: ' + (a ? `<b>${esc(nomeArq)}</b>, ` : temCv ? 'o currículo que você montou, ' : '') + 'seu nome e seu WhatsApp.'
        : 'Vai junto: seu primeiro nome' + (temCv ? ' e o resumo do seu currículo' : '') + '. ' + (a ? 'O arquivo e o WhatsApp só vão se você liberar.' : 'Seu WhatsApp só vai se você liberar.');
      return { titulo: 'Enviar candidatura?', corpo: (AP.erroEnvio ? `<div class="faixa erro mb12" role="alert">${ic('erro')}<span><b>Erro:</b> ${esc(AP.erroEnvio)}</span></div>` : '') +
        `<p class="b">${esc(v.titulo)} · ${esc(e.nome)}</p><p class="soft mt4">${esc(P.salTexto(v.salario))}</p>` +
        `<div class="faixa calmo vai-junto mt14">${ic(a ? 'anexo' : 'usuario')}<span>${vai}</span>` +
          (a ? `<label class="link link-texto">Trocar<input class="sr" type="file" id="arq-trocar-ap" accept="${P.ACEITA}" data-arquivo="trocar-ap"></label>` : '') + '</div>' + P.erroArquivo(AP.erroArq, 'trocar-ap') +
        (!temCv ? '<p class="detalhe mt8">Você ainda não tem currículo. <button class="link link-texto" type="button" data-acao="ir" data-href="#/curriculo">Anexar agora</button></p>' : '') +
        perguntasHTML(v, AP.resp, AP.erros.resp) + avisoEnvio(e, temCv) + P.golpe(),
        rodape: `<button class="btn grande largo" type="button" data-acao="ap-enviar-conta"${AP.enviando ? ' disabled' : ''}>${ic('enviar')}Enviar candidatura</button>` };
    },
    sucesso() {
      const v = D.VAGA[AP.vagaId], e = P.empresaDe(v), espera = AP.espera, tudo = AP.contatoSegue ? AP.contatoSegue === 'completo' : !!e.verificada, rapido = AP.caminho === 'rapido';
      const item2 = tudo ? 'Se ela chamar, você conversa aqui ou no WhatsApp.'
        : !e.verificada ? 'Esta empresa está em verificação: ela vê só o primeiro nome e o resumo do seu currículo, e a conversa é pelo site. O arquivo e o WhatsApp só vão se você liberar.'
          : 'Ela vê só o resumo. Seu nome, o arquivo e o WhatsApp só vão se você liberar.';
      return { titulo: v.titulo, corpo: `<div class="sucesso${espera ? ' espera' : ''}" role="status"><span class="sucesso-marca" aria-hidden="true">${ic(espera ? 'sem-rede' : 'check')}</span>` +
        `<h3>${espera ? 'Esperando internet' : 'Candidatura enviada'}</h3><p>${espera ? 'Sem conexão agora. Sua candidatura para ' + esc(v.titulo) + ' sai sozinha quando a internet voltar.'
          : 'A empresa ' + esc(e.nome) + ' recebeu ' + (!tudo ? 'sua candidatura' : rapido ? 'seu nome e seu contato' : 'seu currículo') + '. Quando ela abrir ou chamar você, avisamos por e-mail e aqui no site.'}</p></div>` +
        `<h3>O que acontece agora</h3><ol class="passos-depois"><li>A empresa vê ${rapido ? 'sua candidatura' : tudo ? 'seu currículo' : 'o resumo do seu currículo'}.</li><li>${item2}</li><li>Se marcar entrevista, você confirma com 1 toque.</li></ol>` +
        (rapido && !(E.curriculo && (E.curriculo.arquivo || E.curriculo.dados.funcao)) ? `<div class="caixa-vazia"><b>Seu currículo está vazio.</b>Com ele, a empresa conhece você melhor.<br><button class="btn sec" type="button" data-acao="ir" data-href="#/curriculo">${ic('anexo')}Anexar currículo</button></div>` : '') +
        P.golpe() + `<p class="centro mt8"><button class="link" type="button" data-acao="ap-alerta">${ic('sino')}Avisar quando tiver vaga assim</button></p>`,
        rodape: `<button class="btn sec" type="button" data-acao="ap-mais-vagas">Mais vagas</button><button class="btn grande" type="button" data-acao="ir" data-href="#/candidaturas">Minhas candidaturas</button>` };
    }
  };
  function renderAP() {
    if (!AP || !AP.dl) return;
    const dl = AP.dl;
    if (AP.passo === 'conferir' || AP.passo === 'conta') preMarcar(D.VAGA[AP.vagaId], AP.passo === 'conta' ? (E.curriculo && E.curriculo.dados.cnh) : AP.dados.cnh);
    const r = PASSO[AP.passo](), corpo = $('.folha-corpo', dl), rod = $('.folha-rodape', dl), volta = $('[data-acao="ap-voltar"]', dl);
    $('.folha-topo h2', dl).textContent = r.titulo;
    if (volta) volta.hidden = !r.voltar;
    corpo.innerHTML = r.corpo; rod.innerHTML = r.rodape || ''; rod.hidden = !r.rodape;
    corpo.scrollTop = 0; corpo.classList.remove('troca'); void corpo.offsetWidth; corpo.classList.add('troca');
    if (AP.passo === 'codigo') { cod.contar('ap', AP.segundos || 30); cod.foco('ap'); }
  }
  function renderAPmanter() { const c = $('.folha-corpo', AP.dl), y = c.scrollTop; renderAP(); $('.folha-corpo', AP.dl).scrollTop = y; }

  P.abrirCandidatura = function (vid) {
    const v = D.VAGA[vid];
    if (!v || v.status !== 'aberta') return;
    const ja = P.candPorVaga(vid);
    if (ja) { P.ir('#/candidatura/' + ja.id); return; }
    if (E.conta && temPerfil()) {
      AP = { vagaId: vid, passo: 'conta', caminho: 'conta', resp: [], erros: {}, dados: dadosVazios(v), arq: null };
      AP.dl = P.abrirFolha({ id: 'folha-cand', titulo: 'Enviar candidatura?', aoFechar: () => { AP = null; } });
    } else {
      const rasc = E.conta ? null : P.eu.ler('rascunho', null);
      AP = { vagaId: vid, passo: 'inicio', caminho: null, arq: null, aviso: null, resp: [], erros: {}, dados: Object.assign(dadosVazios(v), rasc && rasc.dados ? rasc.dados : {}) };
      if (E.conta) Object.assign(AP.dados, { nome: AP.dados.nome || E.conta.nome, whats: AP.dados.whats || E.conta.whats, email: AP.dados.email || E.conta.email });
      AP.dl = P.abrirFolha({ id: 'folha-cand', titulo: 'Candidatar-me a esta vaga', classe: 'alta', voltar: true, aoFechar: () => { AP = null; } });
    }
    renderAP();
  };
  const guardarRascunho = () => { if (AP && AP.dados && AP.caminho !== 'conta' && !E.conta) P.eu.guardar('rascunho', { dados: Object.assign({}, AP.dados, { aceite: false }) }); };

  /* ---------- leitura do arquivo ---------- */
  function aplicarLidos(x) {
    if (!x) return;
    const d = AP.dados;
    ['nome', 'email', 'funcao', 'tempo', 'escolaridade'].forEach((k) => { if (x[k]) d[k] = x[k]; });
    if (x.whats) d.whats = x.whats;
    if (x.cursos && x.cursos.length) d.cursos = x.cursos.join(', ');
    if (x.cidade) { d.cidade = x.cidade; d.bairro = x.bairro || ''; }
    d.experiencias = x.experiencias || []; d.outras = x.outras || []; d.cnh = x.cnh || [];
    AP.lidos = x;
  }
  function lerNoAP(f) {
    const erro = P.validarArquivo(f);
    if (erro) { AP.erroArq = { nome: f.name, msg: erro }; if (AP.passo !== 'conferir') AP.passo = 'inicio'; renderAP(); const o = $('.arquivo[data-estado="erro"]', AP.dl); if (o) o.scrollIntoView({ block: 'center' }); return; }
    AP.erroArq = null; AP.caminho = 'anexo'; AP.arq = P.infoArquivo(f); AP.aviso = null; AP.lidos = null; AP.passo = 'lendo'; AP.erroEnvio = '';
    renderAP();
    P.lerArquivo(f, P.progressoLeitura).then((res) => {
      if (!AP || AP.passo !== 'lendo') return;
      aplicarLidos(res.dados); AP.aviso = res.aviso; AP.passo = 'conferir'; renderAP();
    });
  }
  P.arquivoCtx.ap = (f) => { if (AP) lerNoAP(f); };
  P.arquivoCtx['trocar-ap'] = (f) => {
    if (!AP) return;
    const erro = P.validarArquivo(f);
    if (erro) { AP.erroArq = { nome: f.name, msg: erro }; renderAPmanter(); return; }
    AP.erroArq = null; AP.arq = P.infoArquivo(f); renderAPmanter();
    P.toast('Arquivo trocado. Ele vai com esta candidatura.');
  };

  /* ---------- validar e enviar ---------- */
  function validarAP() {
    const v = D.VAGA[AP.vagaId], d = AP.dados, er = {};
    if (AP.caminho !== 'conta') {
      if (!d.nome.trim() || d.nome.trim().length < 3) er.nome = 'Escreva seu nome.';
      if (!P.whatsOk(d.whats)) er.whats = 'Use o formato (62) 99999-9999.';
      if (!P.emailOk(d.email)) er.email = 'Escreva um e-mail válido, como seu@email.com.';
      if (!E.conta && !d.aceite) er.aceite = 'Marque para continuar.';
    }
    if (v.perguntas.some((p, i) => !(AP.resp[i] || '').trim())) er.resp = 'Responda as perguntas da empresa.';
    AP.erros = er;
    return !Object.keys(er).length;
  }
  function focarErro() {
    const ordem = [['#ap-nome', 'nome'], ['#ap-whats', 'whats'], ['#ap-email', 'email'], ['.pergunta[aria-invalid] button', 'resp'], ['[id^="ap-resp-"][aria-invalid]', 'resp'], ['#ap-aceite', 'aceite']];
    for (const [sel, k] of ordem) { if (!AP.erros[k]) continue; const el = $(sel, AP.dl); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); return; } }
  }
  // dados do perfil e jeito da candidatura, no formato do contrato
  function montarEnvio() {
    const v = D.VAGA[AP.vagaId], d = AP.dados;
    const resp = v.perguntas.map((p, i) => ({ pergunta: p, resposta: String(AP.resp[i] || '').slice(0, 200) }));
    let caminho, dados;
    if (AP.caminho === 'conta') {
      const cv = E.curriculo;
      caminho = AP.arq || (cv && cv.arquivo) ? 'anexo' : cv && cv.dados && cv.dados.funcao ? 'montar' : 'minimo';
    } else {
      caminho = AP.caminho === 'anexo' ? 'anexo' : AP.caminho === 'montar' ? 'montar' : 'minimo';
      const o = { nome: P.tituloCaso(d.nome.trim()), whats: d.whats, email: d.email.trim().toLowerCase(), cidade: d.cidade, bairro: d.bairro };
      if (AP.caminho === 'anexo') {
        Object.assign(o, { funcao: d.funcao.trim(), tempo: d.tempo, escolaridade: d.escolaridade, cnh: d.cnh, experiencias: d.experiencias,
          cursos: d.cursos ? d.cursos.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10) : [],
          resumo: d.outras.length ? d.outras.join('. ').slice(0, 580) : '' });
      } else if (AP.caminho === 'montar') {
        const partes = [];
        if (d.tempo && d.tempo !== 'Ainda não') partes.push([d.funcao, d.onde, d.tempo.toLowerCase()].filter(Boolean).join(' · '));
        d.trabalhos.forEach((x) => partes.push(x));
        Object.assign(o, { funcao: d.funcao.trim(), tempo: d.tempo, escolaridade: d.escolaridade, cnh: d.cnh, turnos: d.turnos,
          cursos: d.cursos ? d.cursos.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10) : [], resumo: partes.join('. ').slice(0, 580) });
      }
      dados = P.dadosDoPerfil(o);
    }
    if (!AP.idLocal) AP.idLocal = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return { vagaId: AP.vagaId, caminho, respostas: resp, dados, idLocal: AP.idLocal };
  }
  function erroDoServidor(e) {
    const c = e && e.codigo, msg = P.msgErro(e), er = {};
    if (c === 'whatsapp_invalido') er.whats = msg; else if (c === 'nome_invalido') er.nome = msg; else if (c === 'email_invalido') er.email = msg;
    else if (e && e.resposta && e.resposta.barra && e.resposta.barra[0]) AP.erroEnvio = e.resposta.barra[0].mensagem || msg;
    else AP.erroEnvio = msg;
    AP.erros = Object.assign(AP.erros || {}, er);
  }
  async function enviarAgora() {
    const v = D.VAGA[AP.vagaId], envio = montarEnvio(), arquivo = AP.arq && AP.arq.file ? AP.arq.file : null;
    const voltaPara = AP.caminho === 'conta' ? 'conta' : 'conferir';
    AP.enviando = true; AP.erroEnvio = ''; AP.passo = 'enviando'; renderAP();
    try {
      if (arquivo) await P.api('curriculoEnviar', { arquivo });
      const r = await P.api('candidatar', envio);
      AP.cand = r.candidaturaId; AP.contatoSegue = r.contatoSegue; AP.espera = false;
      P.eu.guardar('rascunho', null);
      AP.passo = 'sucesso'; AP.enviando = false;
      renderAP();
      await Promise.all([P.carregarConta().catch(() => null), P.carregarCands().catch(() => null)]);
      P.pintarContadores(); P.render({ manter: true });
    } catch (e) {
      AP.enviando = false;
      if (P.semRede(e) && E.conta) {
        await P.fila.adicionar(envio, arquivo, v.titulo);
        AP.espera = true; AP.passo = 'sucesso'; E.offline = true;
        AP.enviando = false;
        renderAP(); P.render({ manter: true });
        return;
      }
      erroDoServidor(e);
      AP.passo = voltaPara;
      renderAP();
      focarErro();
    }
  }
  P.acoesAP = {
    enviar() {
      if (!validarAP()) { renderAPmanter(); focarErro(); return; }
      if (E.conta) { enviarAgora(); return; }
      // pessoa nova: confirma o e-mail antes (a conta nasce no código)
      const botao = $('[data-acao="ap-enviar"]', AP.dl);
      if (botao) botao.disabled = true;
      cod.pedir('ap', AP.dados.email.trim().toLowerCase(), { nome: P.tituloCaso(AP.dados.nome.trim()), aoOk: () => enviarAgora() }).then((r) => {
        AP.segundos = r.reenviarEmSeg || 30; AP.passo = 'codigo'; renderAP();
      }, (e) => { AP.erroEnvio = P.msgErro(e); renderAPmanter(); });
    }
  };

  /* ---------- alvos do formulário (chips, campos, selects) ---------- */
  P.alvos.ap = {
    obj: () => AP && AP.dados,
    sub: () => AP.novoTrab,
    set(k, v) {
      if (k.indexOf('resp-') === 0) AP.resp[+k.slice(5)] = v;
      else if (k.indexOf('nt-') === 0 && AP.novoTrab) AP.novoTrab[k.slice(3)] = v;
      else AP.dados[k] = v;
    },
    aoChip(ch, k) {
      guardarRascunho();
      if (k === 'tempo' && AP.passo === 'm2') { delete AP.erros.tempo; renderAPmanter(); }
    },
    aoDigitar(t, k) { if (AP.erros) delete AP.erros[k]; guardarRascunho(); },
    aoMudar(t, c) {
      if (c === 'cidade') { AP.dados.bairro = ''; guardarRascunho(); renderAPmanter(); const cs = $('#ap-cidade'); if (cs) cs.focus({ preventScroll: true }); return; }
      if (c === 'aceite') { if (t.checked) { t.removeAttribute('aria-invalid'); const ea = P.$('#' + t.id + '-erro'); if (ea) ea.hidden = true; delete AP.erros.aceite; } return; }
      if (c === 'bairro') { delete AP.erros.bairro; t.removeAttribute('aria-invalid'); }
      guardarRascunho();
    }
  };
  P.grupos['ap-resp'] = (v, g) => {
    AP.resp[+g.getAttribute('data-i')] = v;
    if (AP.erros.resp && AP.dl) {
      const ok = D.VAGA[AP.vagaId].perguntas.every((p, i) => (AP.resp[i] || '').trim());
      if (ok) { delete AP.erros.resp; renderAPmanter(); }
    }
  };

  /* ---------- ações ---------- */
  const A = P.acoes;
  A.candidatar = (b) => P.abrirCandidatura(b.getAttribute('data-id'));
  A['ap-montar'] = () => { AP.caminho = 'montar'; AP.arq = null; AP.erros = {}; AP.erroArq = null; if (!AP.dados.funcao) AP.dados.funcao = tituloFuncao(D.VAGA[AP.vagaId]); AP.passo = 'm1'; renderAP(); };
  A['ap-rapido'] = () => { AP.caminho = 'rapido'; AP.arq = null; AP.erros = {}; AP.erroArq = null; AP.passo = 'conferir'; renderAP(); const n = $('#ap-nome'); if (n) n.focus(); };
  A['ap-remover'] = () => {
    const a = AP.arq;
    AP.arq = null; AP.caminho = null; AP.passo = 'inicio'; renderAP();
    P.toast('Arquivo removido', () => { if (!AP) return; AP.arq = a; AP.caminho = 'anexo'; AP.passo = 'conferir'; renderAP(); }, 'x');
  };
  A['ap-tirar-exp'] = (b) => {
    const i = +b.getAttribute('data-i'), n = AP.dados.experiencias.length;
    if (i < n) AP.dados.experiencias.splice(i, 1); else AP.dados.outras.splice(i - n, 1);
    renderAPmanter();
  };
  A['ap-tirar-trab'] = (b) => { AP.dados.trabalhos.splice(+b.getAttribute('data-i'), 1); guardarRascunho(); renderAPmanter(); };
  A['ap-novo-trab'] = () => { AP.novoTrab = { funcao: '', onde: '', tempo: '' }; renderAPmanter(); const x = $('#m-t-funcao'); if (x) x.focus(); };
  A['ap-cancelar-trab'] = () => { AP.novoTrab = null; renderAPmanter(); };
  A['ap-salvar-trab'] = () => {
    const t = AP.novoTrab;
    if (!t.funcao.trim()) { const x = $('#m-t-funcao'); if (x) { x.setAttribute('aria-invalid', 'true'); x.focus(); } return; }
    AP.dados.trabalhos.push([t.funcao.trim(), t.onde.trim(), t.tempo ? t.tempo.toLowerCase() : ''].filter(Boolean).join(' · '));
    AP.novoTrab = null; guardarRascunho(); renderAPmanter();
  };
  A['ap-ir'] = (b) => { AP.passo = b.getAttribute('data-passo'); renderAP(); };
  A['ap-voltar'] = () => {
    if (!AP) return;
    const p = AP.passo;
    if (p === 'codigo') AP.passo = 'conferir';
    else if (p === 'conferir') AP.passo = AP.caminho === 'montar' ? 'm3' : 'inicio';
    else AP.passo = VOLTA[p] || 'inicio';
    AP.erros = {}; renderAP();
  };
  A['ap-continuar'] = () => {
    const d = AP.dados, p = AP.passo;
    AP.erros = {};
    if (p === 'm1' && !d.funcao.trim()) { AP.erros.funcao = 'Escreva ou escolha uma função.'; renderAP(); $('#m-funcao').focus(); return; }
    if (p === 'm2' && !d.tempo) { AP.erros.tempo = 'Escolha uma opção.'; renderAP(); return; }
    AP.passo = { m1: 'm2', m2: 'm3', m3: 'conferir' }[p]; guardarRascunho(); renderAP();
  };
  A['ap-enviar'] = P.acoesAP.enviar;
  A['ap-enviar-conta'] = () => {
    if (!validarAP()) { renderAPmanter(); const q = $('.pergunta[aria-invalid] button', AP.dl) || $('[id^="ap-resp-"][aria-invalid]', AP.dl); if (q) { q.focus(); q.scrollIntoView({ block: 'center' }); } return; }
    enviarAgora();
  };
  A['ap-alerta'] = () => {
    const v = D.VAGA[AP.vagaId];
    P.fechar(AP.dl);
    P.modulo('filtros').then(() => setTimeout(() => P.abrirAlerta({ daBusca: true, setor: v.setorId, cidade: v.cidade }), 140));
  };
  A['ap-mais-vagas'] = () => { const v = D.VAGA[AP.vagaId]; P.fechar(AP.dl); P.aplicarFiltros(P.preset({ setores: [v.setorId] })); };
  // gancho da demonstração: preencher a partir de um texto de exemplo
  P.apPreencherExemplo = function (nomeArq, kb, texto) {
    AP.caminho = 'anexo'; AP.erroArq = null; AP.arq = { nome: nomeArq, kb, tipo: 'pdf', exemplo: true, file: null, url: '', ts: new Date().toISOString() }; AP.aviso = null;
    aplicarLidos(root.VSC_CURRICULO_TEXTO.extrair(texto, { cidades: D.cidades })); AP.passo = 'conferir'; renderAP();
  };
})(typeof self !== 'undefined' ? self : this);
