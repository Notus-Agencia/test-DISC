/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · peças de HTML repetidas nas telas (cartão de vaga, selos, cabeça e corpo da vaga, situação da
 * candidatura, frase anti-golpe). Texto de fora sempre passa por P.esc().
 */
(function (root) {
  'use strict';
  const P = root.VSC_P, { esc, ic } = P;
  const C = root.VSC_CONTRATO;

  /* ---------- anti-golpe: a frase é a do contrato, palavra por palavra ---------- */
  const PRIMEIRA = C.FRASE_GOLPE.slice(0, C.FRASE_GOLPE.indexOf('.') + 1);
  const RESTO = C.FRASE_GOLPE.slice(PRIMEIRA.length);
  P.golpe = () => `<p class="golpe">${ic('escudo')}<span><b>${esc(PRIMEIRA)}</b>${esc(RESTO)}</span></p>`;
  P.golpeCurto = () => `<p class="golpe-curto so-largo">${ic('escudo')}<span>${esc(C.FRASE_GOLPE)}</span></p>`;
  P.exemploSelo = (x) => (x && x.exemplo ? '<span class="exemplo">Exemplo</span>' : '');

  /* ---------- fatos da vaga ---------- */
  P.lugar = (v) => { const c = P.D.CID[v.cidade]; return (v.bairro ? v.bairro + ', ' : '') + (c ? c.nome : ''); };
  P.distancia = (v) => {
    const c = P.D.CID[v.cidade], pr = P.D.cidades[0];
    return c && c.distanciaKmAprox && pr ? c.distanciaKmAprox + ' km de ' + pr.nome : '';
  };
  P.empresaDe = (v) => P.D.EMP[v.empresaId] || { id: v.empresaId, nome: 'Empresa', iniciais: '', verificada: false, descricao: '' };
  P.vagasDaEmpresa = (eid) => P.D.ABERTAS.filter((v) => v.empresaId === eid);

  /* ---------- candidaturas da pessoa (as do banco + as que esperam a internet) ---------- */
  P.minhas = () => P.est.cands.concat(P.filaComoCands ? P.filaComoCands() : []).sort((a, b) => P.ts(b.criadaEm) - P.ts(a.criadaEm));
  P.candPorVaga = (vid) => P.minhas().filter((c) => c.vagaId === vid && !(c.etapa === 'não seguiu' && c.encerradaPor === 'pessoa'))[0] || null;
  P.candPorId = (id) => P.minhas().filter((c) => c.id === id)[0] || null;
  P.encerrada = (c) => c.etapa === 'não seguiu' || c.etapa === 'contratada';
  P.situacao = (c) => {
    if (c.offline) return { cls: 'aviso', ic: 'sem-rede', txt: 'Esperando internet' };
    switch (c.etapa) {
      case 'nova': return { cls: 'calmo', ic: 'enviar', txt: 'Enviada' };
      case 'vista': return { cls: 'calmo', ic: 'olho', txt: 'Vista pela empresa' };
      case 'em conversa': return { cls: 'info', ic: 'conversa', txt: 'A empresa chamou você' };
      case 'entrevista marcada': return { cls: 'ok', ic: 'calendario', txt: (c.entrevista && c.entrevista.confirmada ? 'Presença confirmada · ' : 'Entrevista marcada · ') + (c.entrevista ? P.diaHora(c.entrevista.quando) : '') };
      case 'contratada': return { cls: 'ok', ic: 'checks', txt: 'Contratação confirmada' };
      default: return { cls: 'fim', ic: 'x', txt: 'Encerrada' };
    }
  };
  // quantas candidaturas pedem a atenção da pessoa (mensagem nova ou entrevista sem confirmar)
  P.avisosNaBarra = () => {
    const de = P.est.cands.filter((c) => (c.etapa === 'em conversa' && c.naoLidas > 0) || (c.etapa === 'entrevista marcada' && c.entrevista && !c.entrevista.confirmada)).length;
    return Math.max(de, 0);
  };

  /* ---------- peças pequenas ---------- */
  P.faixaOffline = () => (P.est.offline ? `<div class="faixa aviso faixa-offline" role="status">${ic('sem-rede')}<span>Sem conexão. Sua candidatura sai quando a internet voltar.</span></div>` : '');
  P.salvaBotao = (v, extra) => {
    const salva = P.est.salvas.indexOf(v.id) >= 0;
    return `<button class="btn-icone salvar${extra ? ' ' + extra : ''}" type="button" data-acao="salvar" data-id="${esc(v.id)}" aria-pressed="${salva}" aria-label="${salva ? 'Tirar dos salvos' : 'Salvar vaga'}">${ic('coracao')}</button>`;
  };
  P.seloTexto = (e) => (e.verificada ? `<span class="verif ok">${ic('escudo')}verificada</span>` : `<span class="verif">${ic('meio')}em verificação</span>`);
  P.seloBotao = (e) => (e.verificada
    ? `<button type="button" class="selo verificada" data-acao="selo" data-id="${esc(e.id)}" aria-haspopup="dialog">${ic('escudo')}Empresa verificada</button>`
    : `<button type="button" class="selo verificando" data-acao="selo" data-id="${esc(e.id)}" aria-haspopup="dialog">${ic('meio')}Empresa em verificação</button>`);

  P.cartao = (v, o) => {
    o = o || {};
    const e = P.empresaDe(v), c = P.candPorVaga(v.id), dist = P.distancia(v);
    const urg = v.urgente ? ` · <span class="urg">${ic('raio')}Urgente</span>` : '';
    let data = c ? `<span class="status ok">${ic('check')}Você se candidatou</span>` : `<span>${P.quandoPub(v.horas)}${urg}</span>`;
    if (v.status === 'pausada') data = `<span class="status fim">${ic('pausa')}Pausada</span>`;
    if (o.salvas && v.saiDoArDias) data += `<span class="status aviso">${ic('relogio')}Sai do ar em ${v.saiDoArDias} ${v.saiDoArDias === 1 ? 'dia' : 'dias'}</span>`;
    return `<li class="vaga" data-id="${esc(v.id)}"${o.atual ? ' aria-current="true"' : ''}>` +
      `<span class="vaga-logo" aria-hidden="true">${esc(e.iniciais)}</span>` +
      '<div class="vaga-corpo">' +
        `<h3 class="vaga-titulo"><a href="#/vaga/${esc(v.id)}">${esc(v.titulo)}</a></h3>` +
        `<p class="vaga-empresa"><span class="nome">${esc(e.nome)}</span> ${P.seloTexto(e)}</p>` +
        `<p class="vaga-local">${ic('local')}<span>${esc(P.lugar(v))}${dist ? ' · ' + esc(dist) : ''}</span></p>` +
        `<p class="vaga-salario"><b>${esc(P.salValor(v.salario))}</b> ${esc(P.salPor(v.salario))}${v.salario.obs ? `<span class="obs">${esc(v.salario.obs)}</span>` : ''}</p>` +
        `<ul class="vaga-fatos"><li class="etiqueta">${esc(P.tipoNome(v.tipo))}</li><li class="etiqueta">${esc(v.turno)}</li></ul>` +
        `<p class="vaga-data">${data}${P.exemploSelo(v)}</p>` +
      `</div>${P.salvaBotao(v)}</li>`;
  };
  P.alertaLinha = () => `<li class="alerta-linha"><span><b>Quer saber quando entrar vaga assim?</b>Avisamos por e-mail. Só vaga nova.</span><button class="btn sec" type="button" data-acao="alerta-busca">${ic('sino')}Avisar quando tiver vaga assim</button></li>`;

  /* ---------- a vaga (página e painel do computador) ---------- */
  P.tagsVaga = (v) => {
    const t = [`<li class="etiqueta">${ic('maleta')}${esc(P.tipoNome(v.tipo))}</li>`, `<li class="etiqueta">${ic('relogio')}${esc(v.turno)}</li>`];
    if (v.semExperiencia) t.push('<li class="etiqueta">Aceita sem experiência</li>');
    if (v.vagasQtd > 1) t.push(`<li class="etiqueta">${v.vagasQtd} vagas</li>`);
    if (v.pcd) t.push(`<li class="etiqueta">${ic('acessivel')}Vaga também para PcD</li>`);
    if (v.repete) t.push(`<li class="etiqueta">${ic('calendario')}Repete toda semana</li>`);
    if (v.urgente) t.push(`<li class="etiqueta">${ic('raio')}Urgente</li>`);
    if (v.exemplo) t.push('<li class="exemplo">Exemplo</li>');
    return `<ul class="vp-tags">${t.join('')}</ul>`;
  };
  P.cabecaVaga = (v, nivel, comAcoes) => {
    const e = P.empresaDe(v), h = nivel || 'h1', dist = P.distancia(v);
    const acoes = comAcoes ? `<div class="vp-acoes so-largo">${P.salvaBotao(v)}<button class="btn-icone" type="button" data-acao="compartilhar" data-id="${esc(v.id)}" aria-label="Compartilhar vaga">${ic('compartilhar')}</button></div>` : '';
    return `${acoes}<${h} id="titulo-vaga">${esc(v.titulo)}</${h}>` +
      `<div class="vp-empresa"><button type="button" class="link vp-emp-nome" data-acao="ir-empresa" data-id="${esc(v.id)}">${esc(e.nome)}</button>${P.seloBotao(e)}</div>` +
      `<p class="vp-local">${ic('local')}<span>${esc(P.lugar(v))}${dist ? ' · ' + esc(dist) : ''} · <span class="muted">Publicada ${P.quandoPub(v.horas)}</span></span></p>` +
      `<p class="vp-salario"><b>${esc(P.salValor(v.salario))}</b>${esc(P.salPor(v.salario))}${v.salario.obs ? ' · ' + esc(v.salario.obs) : ''}</p>` + P.tagsVaga(v);
  };
  const lista = (a) => `<ul class="marcadores">${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  const secao = (titulo, html, id) => `<section class="vp-secao"${id ? ` id="${id}"` : ''}><h2>${titulo}</h2>${html}</section>`;
  P.parecidas = (v, n) => P.B.ordenar(P.D.ABERTAS.filter((x) => x.setorId === v.setorId && x.id !== v.id), 'recentes').slice(0, n || 3);
  P.avisoHorario = (v) => {
    const cv = P.est.curriculo, t = cv && cv.dados && cv.dados.turnos;
    if (!t || !t.length || v.status !== 'aberta' || P.candPorVaga(v.id)) return '';
    const ok = t.indexOf(v.turno) >= 0 || (v.turno === 'Comercial' && (t.indexOf('Manhã') >= 0 || t.indexOf('Tarde') >= 0));
    return ok ? '' : `<p class="aviso-horario">${ic('relogio')}<span>Esta vaga é ${P.TURNO_FRASE[v.turno] || esc(v.turno)}. Você marcou ${esc(P.listaTexto(t.map((x) => x.toLowerCase())))}.</span></p>`;
  };
  P.fraseVerif = (e) => (e.verificada
    ? `<p class="verif-frase">${ic('escudo')} Empresa verificada${e.verificadaEm ? ' · CNPJ conferido em ' + P.dataCompleta(e.verificadaEm) : ''}</p>`
    : `<p class="verif-frase">${ic('meio')} <b>Empresa em verificação:</b> o CNPJ está ativo e nossa equipe ainda confere quem responde por ela. Até lá, a conversa fica aqui no site e a empresa vê só o primeiro nome e o resumo do seu currículo.</p>`);
  P.corpoVaga = (v) => {
    const e = P.empresaDe(v), s = [], nEmp = P.vagasDaEmpresa(e.id).length, par = P.parecidas(v, 3);
    const parHtml = par.length ? secao('Vagas parecidas', `<ul class="lista-vagas">${par.map((x) => P.cartao(x)).join('')}</ul>`) : '';
    if (v.status === 'pausada') s.push(`<div class="faixa calmo pausada">${ic('pausa')}<span>Esta vaga não está recebendo candidaturas agora.</span></div>${parHtml}`);
    if (v.status === 'encerrada' || v.status === 'vencida') s.push(`<div class="faixa calmo pausada">${ic('x')}<span>Esta vaga foi encerrada.</span></div>`);
    s.push(secao('Sobre a vaga', `<div class="texto"><p>${esc(v.descricao)}</p></div>`));
    s.push(secao('Horário', `<ul class="lista-fatos"><li>${ic('relogio')}<span>${esc(v.horario)}${v.repete ? ' · repete toda semana' : ''}</span></li>` +
      `<li>${ic('maleta')}<span>${esc(P.tipoNome(v.tipo))}${v.vagasQtd > 1 ? ' · ' + v.vagasQtd + ' vagas' : ' · 1 vaga'}</span></li>` +
      `<li>${ic('local')}<span>${esc(P.lugar(v))}</span></li></ul>`));
    if ((v.atividades || []).length) s.push(secao('O que você vai fazer', lista(v.atividades)));
    s.push(secao('O que precisa', (v.requisitos || []).length ? lista(v.requisitos) : '<p class="soft">Não pede experiência nem curso.</p>'));
    if ((v.diferenciais || []).length) s.push(secao('Conta a favor', lista(v.diferenciais)));
    if ((v.beneficios || []).length) s.push(secao('Benefícios', lista(v.beneficios)));
    if ((v.perguntas || []).length) {
      s.push(secao('A empresa vai perguntar', '<p class="secao-texto">Você responde na hora de se candidatar.</p><ul class="perguntas-previas">' +
        v.perguntas.map((p) => `<li>${ic('ajuda')}<span>${esc(p)}</span></li>`).join('') + '</ul>'));
    }
    s.push(`<div class="vp-secao vp-golpe">${P.golpe()}</div>`);
    s.push(secao('Sobre a empresa', `<div class="empresa-bloco"><span class="vaga-logo" aria-hidden="true">${esc(e.iniciais)}</span><div>` +
      `<p class="b">${esc(e.nome)} ${P.exemploSelo(e)}</p>` +
      (e.descricao ? `<p class="texto mt4">${esc(e.descricao)}</p>` : '') + P.fraseVerif(e) +
      (nEmp > 1 ? `<button type="button" class="link" data-acao="empresa-vagas" data-id="${esc(e.id)}">Ver as ${nEmp} vagas desta empresa</button>` : '<p class="detalhe mt8">Esta é a única vaga desta empresa agora.</p>') +
      '</div></div>', 'sobre-' + esc(v.id)));
    if (v.status !== 'pausada') s.push(parHtml);
    s.push(`<div class="denunciar"><button type="button" class="link" data-acao="denunciar" data-id="${esc(v.id)}">${ic('bandeira')}Denunciar esta vaga</button>` +
      `<button type="button" class="link" data-acao="esconder" data-id="${esc(v.id)}">${ic('olho')}Não quero ver esta vaga</button></div>`);
    return s.join('');
  };
  P.avisoDoEnvio = (e) => (!P.est.conta ? 'Sem senha. Você confirma seu e-mail com um código.'
    : e.verificada ? 'Seu currículo e seu WhatsApp vão junto.' : 'A empresa vê o resumo do seu currículo. O arquivo e o WhatsApp só vão se você liberar.');
  P.barraCand = (v, c) => {
    if (v.status !== 'aberta') return '';
    const e = P.empresaDe(v);
    if (c) {
      return `<div class="barra-candidatar vidro" id="barra-cand"><div class="resumo"><b>Você se candidatou em ${P.dataCurta(c.criadaEm)}</b><span>${esc(P.situacao(c).txt)}</span></div>` +
        `<a class="btn grande" href="#/candidatura/${esc(c.id)}">Ver andamento</a></div>`;
    }
    return `<div class="barra-candidatar vidro" id="barra-cand"><div class="resumo"><b>${esc(P.salValor(v.salario))}</b><span>${esc(P.salPor(v.salario))} · ${esc(P.tipoNome(v.tipo))}</span>` +
      `<p class="extra">${esc(P.avisoDoEnvio(e))}</p></div>` +
      `<button class="btn grande" type="button" data-acao="candidatar" data-id="${esc(v.id)}">Candidatar-me</button>${P.golpeCurto()}</div>`;
  };
  P.painelVaga = (v) => {
    const c = P.candPorVaga(v.id);
    const acao = v.status !== 'aberta' ? `<span class="status fim">${ic('pausa')}Não recebe candidaturas agora</span>`
      : c ? `<div class="resumo"><b>Você se candidatou em ${P.dataCurta(c.criadaEm)}</b><span>${esc(P.situacao(c).txt)}</span></div><a class="btn grande" href="#/candidatura/${esc(c.id)}">Ver andamento</a>`
        : `<div class="resumo"><b>${esc(P.salValor(v.salario))}</b><span>${esc(P.salPor(v.salario))} · ${esc(P.tipoNome(v.tipo))}</span></div><button class="btn grande" type="button" data-acao="candidatar" data-id="${esc(v.id)}">Candidatar-me</button>`;
    return `<article aria-labelledby="titulo-vaga"><div class="det-cabeca estatica"><div class="fila acoes-det">${P.salvaBotao(v)}` +
      `<button class="btn-icone" type="button" data-acao="compartilhar" data-id="${esc(v.id)}" aria-label="Compartilhar vaga">${ic('compartilhar')}</button></div>` +
      `${P.cabecaVaga(v, 'h2')}${P.avisoHorario(v)}</div><div class="det-corpo">${P.corpoVaga(v)}</div><div class="det-barra vidro">${acao}</div></article>`;
  };
})(typeof self !== 'undefined' ? self : this);
