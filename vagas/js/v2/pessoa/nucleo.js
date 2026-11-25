/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · núcleo: o objeto único window.VSC_P (estado, dados, ajudantes de texto e data, armazenamento
 * do aparelho, chamada à API e carregamento de módulos sob demanda). Os outros arquivos de js/v2/pessoa/ penduram suas peças aqui.
 *
 * Regras que valem em todos os arquivos desta pasta:
 *  - só window.VSC_API fala com o banco (nunca fetch direto); dado fictício só existe na pasta previa/ (modo demonstração);
 *  - texto que vem do banco, da URL ou da pessoa entra no HTML SEMPRE por P.esc() (ou textContent);
 *  - nada de atributo de estilo inline nem de script inline em HTML montado por JS (CSSOM quando precisar);
 *  - dado pessoal guardado no aparelho usa a chave 'vsc.eu.*' (sai sozinho ao sair da conta).
 */
(function (root) {
  'use strict';
  const doc = root.document;
  const P = root.VSC_P = {
    est: {
      conta: null,          // {id, nome, whats, email} da pessoa que entrou (ou null)
      curriculo: null,      // {arquivo: {nome, kb, tipo, ts}|null, dados: {...}}
      salvas: [], escondidas: [], alertas: [], contadores: {}, avisos: [],
      cands: [], candsCarregadas: false,
      filtros: null, abaCand: 'andamento', meuBairro: null, offline: false
    },
    D: { praca: null, cidades: [], setores: [], empresas: [], vagas: [], EMP: {}, VAGA: {}, SET: {}, CID: {}, ABERTAS: [], geradoEm: '' },
    acoes: {}, grupos: {}, telas: {}, entradas: [], B: null, previa: null
  };
  const H = 3600000;
  P.H = H;
  P.base = (doc.currentScript && doc.currentScript.src ? doc.currentScript.src : 'js/v2/pessoa/nucleo.js').replace(/nucleo\.js(\?.*)?$/, '');

  /* ---------- DOM e texto ---------- */
  P.$ = (s, r) => (r || doc).querySelector(s);
  P.$$ = (s, r) => Array.prototype.slice.call((r || doc).querySelectorAll(s));
  P.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  P.ic = (nome, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
  P.plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
  P.d2 = (n) => (n < 10 ? '0' + n : '' + n);
  P.reais = (n) => 'R$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  P.listaTexto = (a) => (a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);
  P.iniciais = (nome) => { const p = String(nome || '').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
  P.primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';
  P.tituloCaso = (s) => String(s).toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase());
  P.mascaraWhats = (t) => {
    const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '').slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 7) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  };
  P.whatsOk = (t) => /^\(\d{2}\) 9\d{4}-\d{4}$/.test(t || '');
  P.whatsDigitos = (t) => '55' + String(t || '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '');
  P.whatsEscondido = (t) => { const d = String(t || '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, ''); return d.length < 11 ? (t || '') : '(' + d.slice(0, 2) + ') ' + d[2] + ' ••••-' + d.slice(7); };
  P.emailOk = (t) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(t || '').trim());
  P.emailEscondido = (t) => { const m = /^([^@]{1,2})[^@]*(@.+)$/.exec(String(t || '')); return m ? m[1] + '•••' + m[2] : String(t || ''); };

  /* ---------- dinheiro, tipo, turno ---------- */
  const POR = { mes: 'por mês', dia: 'por dia', hora: 'por hora' };
  P.salValor = (s) => (!s || s.aCombinar ? 'A combinar' : s.max ? P.reais(s.min) + ' a ' + P.reais(s.max) : P.reais(s.min));
  P.salPor = (s) => (!s || s.aCombinar ? '' : /por servi[cç]o$/i.test(s.texto || '') ? 'por serviço' : POR[s.periodo] || '');
  P.salTexto = (s) => (!s || s.aCombinar ? 'A combinar' : P.salValor(s) + ' ' + P.salPor(s));
  const TIPO = { CLT: 'Carteira assinada', Freelancer: 'Por serviço', PJ: 'PJ', 'Diária': 'Diária', 'Estágio': 'Estágio', 'Temporário': 'Temporário' };
  P.tipoNome = (t) => TIPO[t] || t;
  P.TIPOS = ['CLT', 'Temporário', 'Diária', 'Freelancer', 'Estágio', 'PJ'];
  P.TURNOS = ['Manhã', 'Tarde', 'Noite', 'Comercial', 'Escala 12x36', 'Fim de semana'];
  P.TURNO_FRASE = { 'Manhã': 'de manhã', Tarde: 'à tarde', Noite: 'à noite', Comercial: 'em horário comercial', 'Escala 12x36': 'na escala 12x36', 'Fim de semana': 'no fim de semana' };
  P.TEMPOS = ['Ainda não', 'Menos de 1 ano', '1 a 3 anos', 'Mais de 3 anos'];
  P.ESCOLAS = ['Ensino fundamental incompleto', 'Ensino fundamental completo', 'Ensino médio incompleto', 'Ensino médio completo', 'Técnico completo', 'Superior em andamento', 'Superior completo'];

  /* ---------- datas (horário do aparelho) ---------- */
  const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const SEM_LONGO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const dt = (x) => (x instanceof Date ? x : new Date(typeof x === 'number' ? x : Date.parse(x)));
  const hora = (d) => d.getHours() + 'h' + (d.getMinutes() ? P.d2(d.getMinutes()) : '');
  P.ts = (x) => (x ? dt(x).getTime() : 0);
  P.horasDesde = (x) => Math.max(0, (Date.now() - dt(x).getTime()) / H);
  P.quandoPub = (h) => (h < 1 ? 'agora há pouco' : h < 24 ? 'há ' + Math.round(h) + ' h' : h < 48 ? 'ontem' : 'há ' + Math.floor(h / 24) + ' dias');
  P.dataCurta = (x) => { const d = dt(x); return P.d2(d.getDate()) + '/' + P.d2(d.getMonth() + 1); };
  P.dataHora = (x) => P.dataCurta(x) + ', ' + hora(dt(x));
  P.diaHora = (x) => { const d = dt(x); return SEM[d.getDay()] + ' ' + P.dataCurta(d) + ', ' + hora(d); };
  P.diaHoraLongo = (x) => { const d = dt(x); return SEM_LONGO[d.getDay()] + ', ' + P.dataCurta(d) + ', às ' + hora(d); };
  P.dataCompleta = (x) => { const d = dt(x); return P.dataCurta(d) + '/' + d.getFullYear(); };
  P.mesAno = (x) => { const d = dt(x); return MESES[d.getMonth()] + ' de ' + d.getFullYear(); };

  /* ---------- armazenamento do aparelho ---------- */
  const mem = {};
  function arm() { try { return root.localStorage; } catch (e) { return null; } }
  P.guardar = (chave, v) => { try { const a = arm(); if (!a) throw 0; if (v === null || v === undefined) a.removeItem(chave); else a.setItem(chave, JSON.stringify(v)); } catch (e) { if (v == null) delete mem[chave]; else mem[chave] = JSON.stringify(v); } };
  P.ler = (chave, padrao) => {
    try { const a = arm(), t = a ? a.getItem(chave) : null; if (t !== null) return JSON.parse(t); } catch (e) { /* cai na memória */ }
    try { return mem[chave] !== undefined ? JSON.parse(mem[chave]) : padrao; } catch (e) { return padrao; }
  };
  // dados pessoais do aparelho: prefixo 'vsc.eu.' (o adaptador apaga ao sair)
  P.eu = { ler: (k, p) => P.ler('vsc.eu.' + k, p), guardar: (k, v) => P.guardar('vsc.eu.' + k, v) };
  P.prefs = () => { const p = P.ler('vsc.prefs', {}); return p && typeof p === 'object' ? p : {}; };
  P.guardarPrefs = (o) => P.guardar('vsc.prefs', Object.assign(P.prefs(), o));

  /* ---------- chamada à API ---------- */
  P.api = function (metodo, dados) {
    const A = root.VSC_API;
    return A.pronto.then(() => A[metodo](dados || {})).catch((e) => {
      if (e && e.sessaoExpirada && P.aoExpirar) P.aoExpirar();
      throw e;
    });
  };
  P.modoPrevia = () => root.VSC_API && root.VSC_API.modo === 'previa';
  P.logada = () => !!P.est.conta;
  P.msgErro = (e, padrao) => (e && e.message ? e.message : padrao || 'Não deu certo. Tente de novo.');
  P.semRede = (e) => !!(e && e.conexao);

  /* ---------- módulos sob demanda ---------- */
  const carregados = {};
  // módulos que precisam de outros antes de rodar
  const DEPS = { entrar: ['codigo'], candidatar: ['codigo', 'texto-curriculo', 'arquivos', 'fila'], filtros: ['codigo'], eu: ['texto-curriculo', 'arquivos', 'filtros'], arquivos: [] };
  P.modulo = function (nome) {
    if (!carregados[nome]) {
      carregados[nome] = Promise.all((DEPS[nome] || []).map((d) => P.modulo(d))).then(() => new Promise((ok, falha) => {
        const s = doc.createElement('script');
        s.src = P.base + nome + '.js';
        s.onload = () => ok();
        s.onerror = () => falha(new Error('Não foi possível carregar uma parte do site. Verifique a internet e tente de novo.'));
        doc.head.appendChild(s);
      })).catch((e) => { delete carregados[nome]; throw e; });
    }
    return carregados[nome];
  };
  P.modulos = (lista) => Promise.all(lista.map((m) => P.modulo(m)));
  // quem precisa de qual módulo: telas (rota) e ações (data-acao)
  P.MOD_TELA = { candidaturas: 'candidaturas', candidatura: 'candidaturas', eu: 'eu', curriculo: 'eu', alertas: 'eu', entrar: 'entrar' };
  P.MOD_ACAO = {};
  const MOD = {
    candidaturas: ['form:mensagem', 'form:outro-horario', 'aba-cand', 'confirmar-presenca', 'outro-horario', 'opcoes-cand', 'retirar', 'liberar-whats', 'liberar-sim', 'denunciar-msg'],
    eu: ['quem-viu', 'baixar-dados', 'apagar-conta', 'sair', 'editar-cv', 'montar-cv', 'ed-salvar', 'ver-arquivo', 'apagar-arquivo', 'apagar-alerta', 'vagas-escondidas', 'mostrar-vaga', 'editar-dados', 'ed-dados-salvar', 'ed-exp-add', 'ed-exp-tirar', 'privacidade-resumo'],
    candidatar: ['candidatar', 'ap-exemplo', 'ap-montar', 'ap-rapido', 'ap-remover', 'ap-tirar-exp', 'ap-tirar-trab', 'ap-novo-trab', 'ap-cancelar-trab', 'ap-salvar-trab', 'ap-ir', 'ap-voltar',
      'ap-continuar', 'ap-enviar', 'ap-enviar-conta', 'ap-alerta', 'ap-mais-vagas'],
    entrar: ['form:entrar', 'conferir-codigo', 'reenviar', 'entrar-trocar'],
    filtros: ['filtros', 'f-limpar', 'f-aplicar', 'bairro', 'escolher-bairro', 'bairro-todos', 'todos-setores', 'selo', 'compartilhar', 'copiar-link', 'copiar-msg', 'denunciar', 'den-enviar',
      'alerta-busca', 'criar-alerta', 'al-criar', 'avisar-cidade', 'esconder', 'form:avisar-cidade']
  };
  Object.keys(MOD).forEach((m) => MOD[m].forEach((a) => { P.MOD_ACAO[a] = m; }));

  /* ---------- aviso para leitor de tela ---------- */
  P.anunciar = (msg) => { const el = P.$('#anuncio'); if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30); } };

  P.largo = () => root.innerWidth >= 981;
  P.medio = () => root.innerWidth >= 761;
  P.semMovimento = () => doc.documentElement.getAttribute('data-fx') === 'off' || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
})(typeof self !== 'undefined' ? self : this);
