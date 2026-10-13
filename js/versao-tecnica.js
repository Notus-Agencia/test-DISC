/*
 * Versão técnica dos relatórios de equipe e "Como liderar" — módulo PURO (sem DOM, sem rede), UMD:
 * window.DISC_VERSAO_TECNICA / module.exports.
 *
 * Decisão (docs/painel-cientifico/decisao.md, seção 4, linha 12, combinada com o dono): a distância entre o estilo
 * natural e o que o cargo pede (Parte 2 do teste) é a parte que mais se aproxima de avaliação psicológica.
 *   - Versão do dono/gestor (padrão, o link de sempre): sai SEM esse conteúdo; no lugar fica TEXTO_RESTRITO.
 *       equipe:    capítulo "Distância entre o estilo natural e o que o cargo pede" (dados.pressao, com as barras por
 *                  pessoa do guia por líder), o exigido de cada colaborador e os círculos do exigido no mapa;
 *       lideranca: "Esforço de adaptação ao cargo" (dados.exigido, seção 'esforco', item do plano que cita a seção)
 *                  e o exigido no mapa.
 *   - Versão técnica (outro link, outro token): completa, com "Leitura técnica: <nome> · CRP <RR/NNNNN>" em todas as
 *     páginas. Só existe se alguém informar no painel o nome e o CRP de quem vai ler (fica registrado).
 * A MESMA regra roda no banco: disc_interno.relatorio_versao_dono (supabase/migrations/20261019120000_versao_tecnica.sql;
 * tests/supabase/versao_tecnica.test.js confere que os dois dão o mesmo resultado). O banco nunca entrega o conteúdo
 * restrito pelo link do dono; esta cópia serve à prévia (api-simulada), à página (defesa extra) e ao painel.
 *
 * API:
 *   MODELOS                      ['equipe', 'lideranca'] (os modelos que têm versão técnica)
 *   TEXTO_RESTRITO               'Este capítulo é liberado só para leitura por psicólogo(a).'
 *   AVISO_CRP                    aviso do painel ao informar o CRP
 *   MSG_CRP, MSG_NOME            mensagens de erro da validação
 *   normalizarCrp(v)          -> 'RR/NNNNN' | ''   (aceita "CRP 06/12345", "crp-06/12345", "06 - 12345"; região 01–99,
 *                                                  número de 3 a 6 dígitos; sem consulta a site externo)
 *   normalizarNomeLeitor(v)   -> nome | ''         (nome e sobrenome; letras, espaço, ponto, hífen e apóstrofo; 5–120)
 *   validarLeitor({nome, crp}) -> {ok:true, nome, crp} | {ok:false, erro, campo:'nome'|'crp'}
 *   leituraValida(x)          -> {nome, crp} normalizados | null
 *   linhaLeitura(x)           -> 'Leitura técnica: Fulana de Tal · CRP 06/12345' ('' se inválida)
 *   temRestrito(dados)        -> true quando o snapshot traz conteúdo que a versão do dono esconde
 *   versaoDono(dados)         -> cópia sem o conteúdo restrito e sem leituraTecnica; restrito: true quando havia
 *   versaoTecnica(dados, x)   -> cópia completa com leituraTecnica = {nome, crp} (sem "restrito"); x inválido -> versaoDono
 */
(function (root) {
  'use strict';

  var MODELOS = ['equipe', 'lideranca'];
  var TEXTO_RESTRITO = 'Este capítulo é liberado só para leitura por psicólogo(a).';
  var AVISO_CRP = 'Ao informar o CRP, você declara que o relatório será lido por esse(a) profissional; a informação fica registrada.';
  var MSG_CRP = 'CRP inválido. Use o formato RR/NNNNN: a região com 2 dígitos e o número (ex.: 06/12345).';
  var MSG_NOME = 'Informe o nome completo de quem vai ler (nome e sobrenome, só letras).';
  // Seção do "Como liderar" que traz a Parte 2 (mesma regra de js/relatorio-view.js, ehSecaoExigido).
  var RE_SECAO = /estic|exig|adapta|esforc/i;
  // Item de outra seção que remete à seção restrita (o plano dos 60 dias: 'veja "Esforço de adaptação ao cargo"').
  // (letras com acento nas duas caixas: o banco, em locale C, não iguala Ç/ç sozinho)
  var RE_ITEM = /esfor[çÇ]o de adapta[çÇ][ãÃ]o ao cargo/i;
  var RE_NOME = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’. -]*$/;
  var RE_PALAVRA = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/;

  function objeto(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function copia(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }
  function temValor(v) { return v !== null && v !== undefined; }

  function normalizarCrp(v) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().replace(/^crp\s*[-:]?\s*/i, '');
    var m = /^(\d{2}) ?[/-] ?(\d{3,6})$/.exec(s);
    if (!m || m[1] === '00' || /^0+$/.test(m[2])) return '';
    return m[1] + '/' + m[2];
  }

  function normalizarNomeLeitor(v) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (s.length < 5 || s.length > 120 || !RE_NOME.test(s)) return '';
    return s.split(' ').filter(function (p) { return RE_PALAVRA.test(p); }).length >= 2 ? s : '';
  }

  function validarLeitor(x) {
    x = objeto(x) ? x : {};
    var nome = normalizarNomeLeitor(x.nome);
    if (!nome) return { ok: false, erro: MSG_NOME, campo: 'nome' };
    var crp = normalizarCrp(x.crp);
    if (!crp) return { ok: false, erro: MSG_CRP, campo: 'crp' };
    return { ok: true, nome: nome, crp: crp };
  }

  function leituraValida(x) {
    var v = validarLeitor(x);
    return v.ok ? { nome: v.nome, crp: v.crp } : null;
  }

  function linhaLeitura(x) {
    var l = leituraValida(x);
    return l ? 'Leitura técnica: ' + l.nome + ' · CRP ' + l.crp : '';
  }

  // Tira "exigido" dos itens (objetos) de uma lista; devolve true se algum tinha valor.
  function semExigido(lista) {
    var tinha = false;
    if (!Array.isArray(lista)) return false;
    lista.forEach(function (e) {
      if (!objeto(e) || !Object.prototype.hasOwnProperty.call(e, 'exigido')) return;
      if (temValor(e.exigido)) tinha = true;
      delete e.exigido;
    });
    return tinha;
  }
  // Itens de texto que remetem ao esforço de adaptação saem; devolve [lista nova, tinha].
  function semItens(lista) {
    var tinha = false;
    var nova = lista.filter(function (t) {
      var fora = typeof t === 'string' && RE_ITEM.test(t);
      if (fora) tinha = true;
      return !fora;
    });
    return [nova, tinha];
  }
  function chaveSecao(s) {
    if (typeof s.id === 'string' && s.id) return s.id;
    return temValor(s.chave) ? String(s.chave) : '';
  }

  function versaoDono(dados) {
    if (!objeto(dados)) return copia(dados);
    var d = copia(dados);
    delete d.leituraTecnica;
    delete d.restrito;
    if (MODELOS.indexOf(d.modelo) < 0) return d;
    var tinha = false;
    if (objeto(d.mapa) && semExigido(d.mapa.pontos)) tinha = true;
    if (d.modelo === 'equipe') {
      if (Object.prototype.hasOwnProperty.call(d, 'pressao')) {
        if (temValor(d.pressao)) tinha = true;
        delete d.pressao;
      }
      if (semExigido(d.colaboradores)) tinha = true;
    } else {
      if (Object.prototype.hasOwnProperty.call(d, 'exigido')) {
        if (temValor(d.exigido)) tinha = true;
        delete d.exigido;
      }
      if (Array.isArray(d.secoes)) {
        d.secoes = d.secoes.filter(function (s) {
          var fora = objeto(s) && RE_SECAO.test(chaveSecao(s));
          if (fora) tinha = true;
          return !fora;
        });
        d.secoes.forEach(function (s) {
          if (!objeto(s)) return;
          if (Array.isArray(s.itens)) { var r = semItens(s.itens); s.itens = r[0]; if (r[1]) tinha = true; }
          if (Array.isArray(s.etapas)) {
            s.etapas.forEach(function (e) {
              if (!objeto(e) || !Array.isArray(e.itens)) return;
              var r2 = semItens(e.itens);
              e.itens = r2[0];
              if (r2[1]) tinha = true;
            });
          }
        });
      }
    }
    if (tinha) d.restrito = true;
    return d;
  }

  function temRestrito(dados) { var d = versaoDono(dados); return !!(d && d.restrito === true); }

  function versaoTecnica(dados, leitura) {
    var l = leituraValida(leitura);
    if (!l || !objeto(dados)) return versaoDono(dados);
    var d = copia(dados);
    delete d.restrito;
    d.leituraTecnica = l;
    return d;
  }

  var DISC_VERSAO_TECNICA = {
    MODELOS: MODELOS.slice(),
    TEXTO_RESTRITO: TEXTO_RESTRITO,
    AVISO_CRP: AVISO_CRP,
    MSG_CRP: MSG_CRP,
    MSG_NOME: MSG_NOME,
    normalizarCrp: normalizarCrp,
    normalizarNomeLeitor: normalizarNomeLeitor,
    validarLeitor: validarLeitor,
    leituraValida: leituraValida,
    linhaLeitura: linhaLeitura,
    temRestrito: temRestrito,
    versaoDono: versaoDono,
    versaoTecnica: versaoTecnica
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DISC_VERSAO_TECNICA;
  else root.DISC_VERSAO_TECNICA = DISC_VERSAO_TECNICA;
})(typeof self !== 'undefined' ? self : this);
