/*
 * Vagas sem Caos — operação da praça, telas de MODERAÇÃO (registradas em VAGAS_OP_TELAS; a casca é operador.js):
 *   #fila       vagas em revisão ou fora do ar (publicar / devolver / remover), empresas em análise (aprovar / recusar) e textos de
 *               referência (publicar o texto / não publicar / remover); "Decididas hoje" lê o registro de moderação.
 *   #denuncias  só o conteúdo denunciado, nunca quem denunciou; procedente (com as consequências) ou improcedente.
 *   #empresas   empresas da cidade com busca e situação; aprovar, recusar, suspender, reativar; detalhe com vagas e histórico.
 * Todo motivo é uma CHAVE de conteudo/vagas-textos/moderacao.json (p_motivo): a empresa vê o texto dela (statusMotivo).
 * Ids e classes: docs/VAGAS-TELAS.md §4.1, §4.3 e §4.4.
 */
(function (root) {
  'use strict';
  var U = root.VAGAS_UI;
  var A = root.VAGAS_API;
  var O = root.VAGAS_OPERADOR;
  var P = root.VAGAS_PECAS;
  var R = root.VAGAS_REGRAS;
  var doc = root.document;
  var el = U.el;
  var TELAS = root.VAGAS_OP_TELAS = root.VAGAS_OP_TELAS || {};

  function rotulo(lista, id) { return R.rotulo(lista, id) || ''; }
  function botao(classe, texto, aoClicar, extra) {
    return el('button', Object.assign({ type: 'button', class: 'botao ' + classe, onclick: aoClicar }, extra || {}), texto);
  }
  function etiqueta(texto, classe) { return el('span', { class: 'vg-etiqueta' + (classe ? ' ' + classe : '') }, texto); }
  // "hoje, 09:12" / "ontem, 17:40" / "há 3 dias" (a hora só quando ajuda a decidir a ordem do dia).
  function quando(iso) {
    if (!iso) return '';
    var r = U.relativa(iso);
    return r === 'hoje' || r === 'ontem' ? r + ', ' + U.hora(iso) : r;
  }
  function trechoMarcado(texto, trecho) {
    return el('div', { class: 'vg-fila__trecho' }, O.marcarTrecho(texto, trecho).map(function (p) { return p.marcado ? el('mark', {}, p.texto) : p.texto; }));
  }
  function tabela(id, cabecas, linhas) {
    return el('div', { class: 'caixa vg-op-tabela vg-rolagem' }, el('table', { class: 'vg-tabela', id: id }, [
      el('thead', {}, el('tr', {}, cabecas.map(function (c) { return el('th', { scope: 'col', class: c.num ? 'num' : null }, c.texto || c); }))),
      el('tbody', {}, linhas)
    ]));
  }

  // ------------------------------------------------------------------------------------------------- #fila
  var DECISOES = { anuncio_publicar: 'Publicou a vaga', anuncio_devolver: 'Devolveu a vaga com ajuste', anuncio_remover: 'Removeu a vaga',
    empresa_aprovar: 'Conferiu e liberou a empresa', empresa_recusar: 'Recusou o cadastro da empresa', empresa_suspender: 'Suspendeu a empresa',
    empresa_reativar: 'Reativou a empresa', referencia_aprovar_texto: 'Publicou o texto da referência', referencia_recusar_texto: 'Não publicou o texto da referência',
    referencia_remover: 'Removeu a referência', denuncia_procedente: 'Denúncia procedente', denuncia_improcedente: 'Denúncia improcedente',
    empresa_dono: 'Nomeou a pessoa dona da empresa', dono_automatico: 'A pessoa mais antiga da equipe virou dona',
    equipe_tornar_dono: 'A empresa tornou outra pessoa dona', equipe_convidar: 'A empresa convidou alguém para a equipe',
    equipe_convite_cancelar: 'A empresa cancelou um convite', equipe_aceitar: 'Uma pessoa entrou na equipe da empresa',
    equipe_remover: 'A empresa tirou alguém da equipe', equipe_sair: 'Uma pessoa saiu da equipe da empresa',
    empresa_vincular_membro: 'Deu acesso à empresa', empresa_cadastrar: 'Cadastrou a empresa no balcão' };

  TELAS.fila = function (raiz, ctx) {
    var c = ctx.cidade();
    var aba = TELAS.fila.aba || 'vagas';
    var dados = { anuncios: [], empresas: [], referencias: [], decididas: [] };
    var seg = ctx.segmento({ rotulo: 'O que está esperando', valor: aba, aoMudar: function (v) { aba = TELAS.fila.aba = v; desenhar(); }, opcoes: [
      { id: 'vagas', idBotao: 'vg-op-fila-vagas', rotulo: 'Vagas' }, { id: 'empresas', idBotao: 'vg-op-fila-empresas', rotulo: 'Empresas' },
      { id: 'referencias', idBotao: 'vg-op-fila-referencias', rotulo: 'Referências' }, { id: 'decididas', idBotao: 'vg-op-fila-decididas', rotulo: 'Decididas hoje' }] });
    var lista = el('ul', { class: 'vg-fila', id: 'vg-op-fila', 'aria-live': 'polite' });
    U.trocar(raiz, [ctx.cabecalho({ sobre: 'Moderação', titulo: 'Fila',
      texto: 'Vagas, empresas e textos de referência esperando conferência. Meta: decidir em até 24 h. Você não vê currículo nem contato de ninguém.' }),
    seg, lista]);
    U.esqueletos(lista, 3);

    function contar() {
      var n = { vagas: dados.anuncios.length, empresas: dados.empresas.length, referencias: dados.referencias.length, decididas: dados.decididas.length };
      Array.prototype.forEach.call(seg.children, function (b) {
        var v = b.getAttribute('data-valor');
        b.textContent = { vagas: 'Vagas', empresas: 'Empresas', referencias: 'Referências', decididas: 'Decididas hoje' }[v] + ' (' + n[v] + ')';
      });
    }
    function carregar() {
      var hoje = R.hoje(U.fuso());
      return Promise.all([
        A.opAnuncios({ cidade: c.slug }), A.opEmpresas({ cidade: c.slug, status: ['em_analise'] }), A.opReferencias({ cidade: c.slug }),
        A.opModeracao({ cidade: c.slug, limite: 200 })
      ]).then(function (r) {
        dados.anuncios = r[0].anuncios || [];
        dados.empresas = r[1].empresas || [];
        dados.referencias = r[2].referencias || [];
        dados.decididas = (r[3].registros || []).filter(function (x) { return DECISOES[x.acao] && R.hoje(U.fuso(), Date.parse(x.em)) === hoje; });
        contar();
        desenhar();
      });
    }
    function desenhar() {
      U.limpar(lista);
      var itens = aba === 'empresas' ? dados.empresas.map(itemEmpresa) : aba === 'referencias' ? dados.referencias.map(itemReferencia)
        : aba === 'decididas' ? dados.decididas.map(itemDecidida) : dados.anuncios.map(itemAnuncio);
      if (!itens.length) {
        lista.appendChild(el('li', { class: 'caixa vazio', id: 'vg-op-fila-vazia' }, [el('p', { class: 'vazio__titulo' },
          aba === 'decididas' ? 'Nenhuma decisão hoje.' : 'Fila vazia. Nada esperando você.')]));
        return;
      }
      itens.forEach(function (i) { lista.appendChild(i); });
    }
    function depois(msg) {
      U.avisar(msg, { tipo: 'ok', ms: 6000 });
      return Promise.all([carregar(), ctx.atualizarContagens()]);
    }

    function itemAnuncio(a) {
      var e = a.empresa || {};
      var sinais = O.sinaisDoAnuncio(a);
      var marca = sinais.filter(function (s) { return s.trecho; })[0];
      var suspensa = a.status === 'suspenso';
      var meta = [e.nomeFantasia + ' (CNPJ ' + (e.cnpjFormatado || '') + (e.conferida ? ', conferido' : ', em análise') + ')',
        (a.zona && a.zona.nome) || '', P.modalidadeCurta(a.modalidade), P.valorVaga(a)].filter(Boolean).join(' · ');
      var acoes = suspensa
        ? [botao('botao--principal', 'Publicar de novo', function () { publicar(a); }, { data: { acao: 'publicar' } }),
          botao('botao--perigo', 'Remover', function () { remover(a); }, { data: { acao: 'remover' } }),
          el('a', { class: 'botao botao--claro', href: '#denuncias', data: { acao: 'ver' } }, 'Ver denúncias')]
        : [botao('botao--principal', 'Publicar', function () { publicar(a); }, { data: { acao: 'publicar' } }),
          botao('botao--claro', 'Devolver com ajuste', function () { devolver(a); }, { data: { acao: 'devolver' } }),
          botao('botao--perigo', 'Remover', function () { remover(a); }, { data: { acao: 'remover' } })];
      return el('li', { class: 'caixa caixa--compacta vg-fila__item', data: { anuncio: a.id } }, [
        el('div', {}, [
          el('p', { class: 't-nota texto-suave' }, ['Enviada ' + quando(a.atualizadoEm || a.criadoEm) + ' · ' + O.porQueNaFila(a) + ' ',
            O.atrasada(a.atualizadoEm || a.criadoEm) ? etiqueta('Atrasada', 'vg-etiqueta--urgente') : null]),
          el('p', { class: 't-corpo seminegrito' }, [(a.funcao || a.titulo) + ' · ', P.status('anuncio', a.status)]),
          el('p', { class: 't-rotulo texto-medio' }, meta),
          trechoMarcado(a.descricao || '', marca && marca.trecho),
          el('div', { class: 'vg-fila__motivos' }, sinais.map(function (s) { return etiqueta(s.texto, s.forte ? 'vg-etiqueta--urgente' : (s.tipo === 'ok' ? '' : 'vg-etiqueta--selo')); }))
        ]),
        el('div', { class: 'vg-fila__acoes' }, acoes)
      ]);
    }
    function publicar(a) {
      var m = O.motivosPara(ctx.motivos(), 'anuncio', 'publicar');
      A.opAnuncioDecidir(a.id, 'publicar', m[0] ? m[0].chave : '').then(function () {
        return depois('Vaga publicada: "' + (a.funcao || a.titulo) + '".');
      }, ctx.falhou);
    }
    function devolver(a) {
      ctx.decidir({ titulo: 'Devolver "' + (a.funcao || a.titulo) + '" com ajuste', sim: 'Devolver com ajuste',
        texto: 'A vaga volta para a empresa como rascunho, com o motivo na tela dela; ela corrige e publica de novo. Escolha um motivo da lista: o texto vai como está.',
        motivos: O.motivosPara(ctx.motivos(), 'anuncio', 'devolver') }).then(function (r) {
        if (!r) return;
        A.opAnuncioDecidir(a.id, 'devolver', r.motivo).then(function () { return depois('Vaga devolvida para a empresa ajustar.'); }, ctx.falhou);
      });
    }
    function remover(a) {
      ctx.decidir({ titulo: 'Remover "' + (a.funcao || a.titulo) + '"', sim: 'Remover a vaga', perigo: true,
        texto: 'A vaga sai do ar e não volta. A empresa vê o motivo. Use para golpe, discriminação ou vaga que não existe; para o resto, devolva com ajuste.',
        motivos: O.motivosPara(ctx.motivos(), 'anuncio', 'remover') }).then(function (r) {
        if (!r) return;
        A.opAnuncioDecidir(a.id, 'remover', r.motivo).then(function () { return depois('Vaga removida.'); }, ctx.falhou);
      });
    }

    function itemEmpresa(e) {
      var pode = ctx.podeTudo();
      return el('li', { class: 'caixa caixa--compacta vg-fila__item', data: { empresa: e.id } }, [
        el('div', {}, [
          el('p', { class: 't-nota texto-suave' }, ['Cadastrada ' + quando(e.criadoEm) + ' · empresa nova ', O.atrasada(e.criadoEm) ? etiqueta('Atrasada', 'vg-etiqueta--urgente') : null]),
          el('p', { class: 't-corpo seminegrito' }, [e.nomeFantasia + ' · ', P.status('empresa', e.status)]),
          el('p', { class: 't-rotulo texto-medio' }, ['CNPJ ' + (e.cnpjFormatado || '') + (e.mei ? ' (MEI)' : ''), e.razaoSocial ? ' · ' + e.razaoSocial : '',
            e.setor ? ' · ' + e.setor : '', (e.zona && e.zona.nome) ? ' · ' + e.zona.nome : ''].join('')),
          e.statusMotivo ? el('p', { class: 't-nota texto-suave' }, 'Último motivo enviado: ' + tituloMotivo(ctx, e.statusMotivo)) : null,
          el('p', { class: 't-nota' }, el('a', { href: 'https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp', target: '_blank', rel: 'noopener noreferrer' },
            'Consultar o CNPJ na Receita Federal'))
        ]),
        el('div', { class: 'vg-fila__acoes' }, pode ? [
          botao('botao--principal', 'Conferi o CNPJ: liberar', function () { decidirEmpresa(ctx, e, 'aprovar', depois); }, { data: { acao: 'aprovar' } }),
          botao('botao--claro', 'Recusar com motivo', function () { decidirEmpresa(ctx, e, 'recusar', depois); }, { data: { acao: 'recusar' } })
        ] : [el('p', { class: 't-nota texto-suave' }, 'Só a operação da praça confere empresas.')])
      ]);
    }
    function itemReferencia(r) {
      return el('li', { class: 'caixa caixa--compacta vg-fila__item', data: { referencia: r.id } }, [
        el('div', {}, [
          el('p', { class: 't-nota texto-suave' }, ['Enviada ' + quando(r.criadoEm) + ' · texto livre de referência ', O.atrasada(r.criadoEm) ? etiqueta('Atrasada', 'vg-etiqueta--urgente') : null]),
          el('p', { class: 't-corpo seminegrito' }, [r.empresa ? r.empresa.nomeFantasia : '', ' · ', el('span', { class: 'vg-status vg-status--revisao' }, rotulo(R.TEXTO_STATUS, r.textoStatus))]),
          el('p', { class: 't-rotulo texto-medio' }, [r.funcao, rotulo(R.VINCULOS, r.vinculo)].filter(Boolean).join(' · ')),
          trechoMarcado(r.texto || '', (R.conferirTexto(r.texto, 'referencia') || {}).trecho),
          el('p', { class: 't-nota texto-suave' }, 'Confira só fatos do trabalho: sem dado sensível, crítica, contato ou qualidade pessoal no lugar de um fato.')
        ]),
        el('div', { class: 'vg-fila__acoes' }, [
          botao('botao--principal', 'Publicar o texto', function () {
            var m = O.motivosPara(ctx.motivos(), 'referencia', 'aprovar_texto');
            A.opReferenciaDecidir(r.id, 'aprovar_texto', m[0] ? m[0].chave : '').then(function () { return depois('Texto publicado. A referência segue para a pessoa.'); }, ctx.falhou);
          }, { data: { acao: 'aprovar_texto' } }),
          botao('botao--claro', 'Não publicar o texto', function () {
            ctx.decidir({ titulo: 'Não publicar o texto', sim: 'Não publicar', motivos: O.motivosPara(ctx.motivos(), 'referencia', 'recusar_texto'),
              texto: 'A referência continua (pontos fortes e recomendação), sem o texto livre. A empresa vê o motivo e pode reescrever.' }).then(function (x) {
              if (!x) return;
              A.opReferenciaDecidir(r.id, 'recusar_texto', x.motivo).then(function () { return depois('Texto não publicado.'); }, ctx.falhou);
            });
          }, { data: { acao: 'recusar_texto' } })
        ])
      ]);
    }
    function itemDecidida(m) {
      return el('li', { class: 'caixa caixa--compacta vg-fila__item vg-fila__item--decidida', data: { registro: m.id } }, [
        el('div', {}, [
          el('p', { class: 't-nota texto-suave' }, U.hora(m.em) + ' · ' + O.rotuloPapel(m.papel)),
          el('p', { class: 't-corpo seminegrito' }, DECISOES[m.acao]),
          m.motivo ? el('p', { class: 't-rotulo texto-medio' }, 'Motivo: ' + tituloMotivo(ctx, m.motivo)) : null
        ])
      ]);
    }
    return carregar();
  };

  function tituloMotivo(ctx, chave) { var m = ctx.motivos()[chave]; return m ? m.titulo : chave; }

  // Decisão sobre a empresa (fila e #empresas). Aprovar não pede motivo; o resto, motivo da lista fechada.
  function decidirEmpresa(ctx, e, acao, depois) {
    if (acao === 'aprovar') {
      return U.confirmar({ id: 'vg-op-confirmar', titulo: 'Liberar "' + e.nomeFantasia + '"?', sim: 'Liberar a empresa',
        texto: 'Confirme antes na Receita Federal que o CNPJ ' + (e.cnpjFormatado || '') + ' está ativo e que o nome confere. A empresa passa a aparecer como verificada e pode publicar.' })
        .then(function (sim) {
          if (!sim) return;
          return A.opEmpresaDecidir(e.id, 'aprovar', '').then(function () { return depois('Empresa liberada: ' + e.nomeFantasia + '.'); }, ctx.falhou);
        });
    }
    var textos = {
      recusar: ['Recusar o cadastro de "' + e.nomeFantasia + '"', 'Recusar', 'A empresa continua em análise, com o motivo na tela dela, para corrigir e pedir de novo.'],
      suspender: ['Suspender "' + e.nomeFantasia + '"', 'Suspender a empresa', 'As vagas saem do ar e a empresa fica só leitura até a reativação. Ela vê o motivo.'],
      reativar: ['Reativar "' + e.nomeFantasia + '"', 'Reativar a empresa', 'A empresa volta a publicar; as vagas pausadas podem ser retomadas por ela.']
    }[acao];
    return ctx.decidir({ titulo: textos[0], sim: textos[1], texto: textos[2], perigo: acao === 'suspender',
      motivos: O.motivosPara(ctx.motivos(), 'empresa', acao) }).then(function (r) {
      if (!r) return;
      return A.opEmpresaDecidir(e.id, acao, r.motivo).then(function () {
        return depois({ recusar: 'Cadastro recusado com o motivo.', suspender: 'Empresa suspensa.', reativar: 'Empresa reativada.' }[acao]);
      }, ctx.falhou);
    });
  }

  // ------------------------------------------------------------------------------------------------- #denuncias
  var ALVO = { anuncio: 'Vaga', mensagem: 'Mensagem', referencia: 'Referência' };
  TELAS.denuncias = function (raiz, ctx) {
    var c = ctx.cidade();
    var filtro = TELAS.denuncias.filtro || 'abertas';
    var corpo = el('div', { id: 'vg-op-denuncias-corpo' });
    var seg = ctx.segmento({ rotulo: 'Quais denúncias', valor: filtro, aoMudar: function (v) { filtro = TELAS.denuncias.filtro = v; carregar(); },
      opcoes: [{ id: 'abertas', idBotao: 'vg-op-den-abertas', rotulo: 'Abertas' }, { id: 'todas', idBotao: 'vg-op-den-todas', rotulo: 'Todas' }] });
    U.trocar(raiz, [ctx.cabecalho({ sobre: 'Moderação', titulo: 'Denúncias',
      texto: 'Chega só o conteúdo denunciado, nunca quem denunciou. Meta: decidir em 24 h. 3 denúncias de contas diferentes já tiram a vaga do ar.' }),
    seg, corpo, el('p', { class: 't-nota texto-suave vg-op-nota' }, 'Toda decisão grava o motivo no registro de moderação. A equipe da Gestão sem Caos pode reverter.')]);

    function carregar() {
      U.carregando(corpo);
      return A.opDenuncias({ cidade: c.slug, status: filtro === 'todas' ? ['aberta', 'procedente', 'improcedente'] : ['aberta'] }).then(function (r) {
        var ds = r.denuncias || [];
        if (!ds.length) { U.vazio(corpo, { titulo: filtro === 'todas' ? 'Nenhuma denúncia nesta cidade.' : 'Nenhuma denúncia aberta.', texto: 'Quando alguém denunciar uma vaga, mensagem ou referência, ela aparece aqui.' }); return; }
        U.trocar(corpo, tabela('vg-op-denuncias', ['Quando', 'Alvo', 'Motivo', 'Trecho', 'Situação', { texto: 'Ações' }], ds.map(linha)));
      }).catch(function (e) { U.tratarErro(e, { raiz: corpo, aoTentar: carregar }); });
    }
    function situacao(d) {
      if (d.status === 'aberta') return d.anuncio && d.anuncio.status === 'suspenso' ? el('span', { class: 'vg-status vg-status--suspensa' }, 'Aberta · vaga fora do ar')
        : el('span', { class: 'vg-status vg-status--revisao' }, 'Aberta');
      var txt = (d.status === 'procedente' ? 'Procedente' : 'Improcedente') + (d.decididaEm ? ' · ' + U.dataCurta(d.decididaEm) : '');
      return el('span', { class: 'vg-status ' + (d.status === 'procedente' ? 'vg-status--removida' : 'vg-status--agora-nao') }, txt);
    }
    function linha(d) {
      var alvo = d.alvo === 'mensagem' ? ['Mensagem', d.anuncio ? ' · conversa da vaga "' + d.anuncio.titulo + '"' : '']
        : d.alvo === 'referencia' ? ['Referência', d.referencia ? ' · ' + d.referencia.funcao : ''] : ['Vaga', d.anuncio ? ' · ' + d.anuncio.titulo : ''];
      var empresa = d.anuncio && d.anuncio.empresa ? d.anuncio.empresa.nomeFantasia : d.referencia && d.referencia.empresa ? d.referencia.empresa.nomeFantasia : '';
      var trecho = d.alvo === 'mensagem' ? (d.mensagem && d.mensagem.texto) : d.alvo === 'referencia' ? (d.referencia && d.referencia.texto) : d.detalhe;
      var motivo = rotulo(R.MOTIVOS_DENUNCIA, d.motivo) || d.motivo;
      var acoes = d.status !== 'aberta' ? [d.decisaoMotivo ? el('span', { class: 't-nota texto-suave' }, tituloMotivo(ctx, d.decisaoMotivo)) : null] : [
        botao(d.alvo === 'mensagem' ? 'botao--principal botao--pequeno' : 'botao--perigo botao--pequeno', d.alvo === 'mensagem' ? 'Procedente' : 'Remover',
          function () { procedente(d); }, { data: { acao: 'procedente' } }),
        botao('botao--claro botao--pequeno', 'Improcedente', function () { improcedente(d); }, { data: { acao: 'improcedente' } })];
      return el('tr', { data: { denuncia: d.id } }, [
        el('td', { class: 'nao-quebra' }, quando(d.criadoEm)),
        el('td', {}, [alvo[0] + alvo[1], empresa ? el('br') : null, empresa ? el('span', { class: 't-nota texto-suave' }, empresa + (d.alvo === 'mensagem' && d.mensagem ? ' · escrita por ' + (d.mensagem.autor === 'empresa' ? 'empresa' : 'quem se candidatou') : '')) : null]),
        el('td', {}, motivo),
        el('td', { class: 't-nota' }, trecho ? '"' + trecho + '"' : '—'),
        el('td', {}, situacao(d)),
        el('td', {}, el('div', { class: 'vg-tabela__acoes' }, acoes))
      ]);
    }
    function procedente(d) {
      var caixas = [];
      if (d.alvo === 'anuncio') {
        caixas.push({ id: 'vg-op-den-remover-vaga', chave: 'removerAnuncio', rotulo: 'Tirar a vaga do ar (removida)', marcada: true });
        if (ctx.podeTudo()) caixas.push({ id: 'vg-op-den-suspender-empresa', chave: 'suspenderEmpresa', rotulo: 'Suspender a empresa também (golpe ou reincidência)' });
      } else if (d.alvo === 'mensagem' && ctx.podeTudo()) {
        caixas.push({ id: 'vg-op-den-suspender-autor', chave: 'suspenderAutor', rotulo: 'Suspender a conta de quem escreveu' });
      } else if (d.alvo === 'referencia') {
        caixas.push({ id: 'vg-op-den-remover-ref', chave: 'removerReferencia', rotulo: 'Remover a referência', marcada: true });
      }
      ctx.decidir({ titulo: 'Denúncia procedente', sim: 'Confirmar decisão', perigo: d.alvo !== 'mensagem', caixas: caixas,
        texto: 'Escolha o motivo da lista. Quem foi denunciado não sabe quem denunciou.', motivos: O.motivosDenuncia(ctx.motivos(), d.alvo) }).then(function (r) {
        if (!r) return;
        var dados = Object.assign({ decisao: 'procedente', motivo: r.motivo }, r.marcas);
        A.opDenunciaDecidir(d.id, dados).then(function () {
          U.avisar('Denúncia decidida: procedente.', { tipo: 'ok', ms: 6000 });
          return Promise.all([carregar(), ctx.atualizarContagens()]);
        }, ctx.falhou);
      });
    }
    function improcedente(d) {
      ctx.decidir({ titulo: 'Denúncia improcedente', sim: 'Marcar improcedente', motivos: O.motivosPara(ctx.motivos(), 'denuncia', 'improcedente'),
        texto: 'Nada muda no conteúdo denunciado. A decisão fica no registro de moderação.' }).then(function (r) {
        if (!r) return;
        A.opDenunciaDecidir(d.id, { decisao: 'improcedente', motivo: r.motivo }).then(function () {
          U.avisar('Denúncia decidida: improcedente.', { tipo: 'ok', ms: 6000 });
          return Promise.all([carregar(), ctx.atualizarContagens()]);
        }, ctx.falhou);
      });
    }
    return carregar();
  };

  // ------------------------------------------------------------------------------------------------- #empresas
  var FILTROS_EMPRESA = [{ id: '', rotulo: 'Todas' }, { id: 'em_analise', rotulo: 'Em análise' }, { id: 'ativa', rotulo: 'Verificadas' }, { id: 'suspensa', rotulo: 'Suspensas' }];
  TELAS.empresas = function (raiz, ctx) {
    var c = ctx.cidade();
    var status = '';
    var busca = el('input', { class: 'entrada', type: 'search', id: 'vg-op-emp-busca', placeholder: 'Nome, razão social ou CNPJ', autocomplete: 'off' });
    var corpo = el('div', { id: 'vg-op-empresas-corpo' });
    U.trocar(raiz, [ctx.cabecalho({ sobre: 'Moderação', titulo: 'Empresas', texto: 'Empresas da cidade, com a situação do cadastro. Para cadastrar uma empresa no balcão, use o cadastro assistido.',
      acoes: [el('a', { class: 'botao botao--claro', href: '#assistido', id: 'vg-op-emp-assistido' }, 'Cadastrar empresa')] }),
    el('div', { class: 'filtros' }, [el('label', { class: 'filtros__busca vg-op-busca' }, [el('span', { class: 'visualmente-oculto' }, 'Buscar empresa'), U.icone('lupa'), busca]),
      ctx.pilulas({ id: 'vg-op-emp-status', rotulo: 'Situação', valor: '', opcoes: FILTROS_EMPRESA, aoMudar: function (v) { status = v; carregar(); } })]),
    corpo]);
    busca.addEventListener('input', U.aoParar(function () { carregar(); }, 300));

    function depois(msg) { U.avisar(msg, { tipo: 'ok', ms: 6000 }); return Promise.all([carregar(), ctx.atualizarContagens()]); }
    function carregar() {
      U.carregando(corpo);
      return A.opEmpresas({ cidade: c.slug, status: status ? [status] : [], busca: busca.value.trim() }).then(function (r) {
        var es = r.empresas || [];
        if (!es.length) { U.vazio(corpo, { titulo: 'Nenhuma empresa encontrada.', texto: 'Mude a busca ou a situação.' }); return; }
        U.trocar(corpo, tabela('vg-op-empresas', ['Empresa', 'CNPJ', 'Situação', { texto: 'Vagas no ar', num: true }, { texto: 'Acessos', num: true }, ''],
          es.map(linha)));
      }).catch(function (e) { U.tratarErro(e, { raiz: corpo, aoTentar: carregar }); });
    }
    function linha(e) {
      var pode = ctx.podeTudo();
      var acoes = [];
      if (pode && e.status === 'em_analise') {
        acoes.push(botao('botao--principal botao--pequeno', 'Liberar', function () { decidirEmpresa(ctx, e, 'aprovar', depois); }, { data: { acao: 'aprovar' } }));
        acoes.push(botao('botao--claro botao--pequeno', 'Recusar', function () { decidirEmpresa(ctx, e, 'recusar', depois); }, { data: { acao: 'recusar' } }));
      }
      if (pode && e.status === 'ativa') acoes.push(botao('botao--perigo botao--pequeno', 'Suspender', function () { decidirEmpresa(ctx, e, 'suspender', depois); }, { data: { acao: 'suspender' } }));
      if (pode && e.status === 'suspensa') acoes.push(botao('botao--principal botao--pequeno', 'Reativar', function () { decidirEmpresa(ctx, e, 'reativar', depois); }, { data: { acao: 'reativar' } }));
      return el('tr', { data: { empresa: e.id } }, [
        el('td', { class: 'vg-op-empresa-nome' }, [el('button', { type: 'button', class: 'seminegrito vg-op-link', data: { acao: 'ver' }, onclick: function () { detalhe(e); },
          'aria-label': 'Ver ' + e.nomeFantasia }, e.nomeFantasia), el('br'),
          el('span', { class: 't-nota texto-suave' }, [e.razaoSocial, e.criadoEm ? 'desde ' + U.data(e.criadoEm) : ''].filter(Boolean).join(' · '))]),
        el('td', { class: 'nao-quebra' }, e.cnpjFormatado || ''),
        el('td', {}, P.status('empresa', e.status)),
        el('td', { class: 'num' }, (e.anuncios ? e.anuncios.noAr : 0) + ' de ' + (e.anuncios ? e.anuncios.total : 0)),
        el('td', { class: 'num' }, String(e.membros || 0)),
        el('td', {}, el('div', { class: 'vg-tabela__acoes' }, acoes))
      ]);
    }
    function detalhe(e) {
      var corpoJ = el('div', { class: 'vg-op-detalhe' }, U.carregando(el('div')));
      var j = U.janela({ id: 'vg-op-empresa', titulo: e.nomeFantasia, corpo: corpoJ,
        acoes: [botao('botao--claro', 'Fechar', function () { j.fechar(); }, { id: 'vg-op-empresa-fechar' })] });
      Promise.all([A.opAnuncios({ cidade: c.slug, status: ['rascunho', 'em_revisao', 'publicado', 'pausado', 'encerrado', 'suspenso', 'removido'] }),
        A.opModeracao({ cidade: c.slug, limite: 200 })]).then(function (r) {
        var vagas = (r[0].anuncios || []).filter(function (a) { return a.empresaId === e.id || (a.empresa && a.empresa.id === e.id); });
        var hist = (r[1].registros || []).filter(function (m) { return m.alvoId === e.id || vagas.some(function (a) { return a.id === m.alvoId; }); });
        var vincular = e.membros ? formDona(ctx, e, function () { j.fechar(); carregar(); }) : formVincular(ctx, e, function () { j.fechar(); carregar(); });
        U.trocar(corpoJ, [
          el('dl', { class: 'vg-op-dl' }, [el('dt', {}, 'CNPJ'), el('dd', {}, (e.cnpjFormatado || '') + (e.mei ? ' (MEI)' : '')),
            el('dt', {}, 'Razão social'), el('dd', {}, e.razaoSocial || '—'), el('dt', {}, 'Setor'), el('dd', {}, e.setor || '—'),
            el('dt', {}, 'Situação'), el('dd', {}, P.status('empresa', e.status)),
            el('dt', {}, 'Contato da empresa'), el('dd', {}, [e.email || '', e.whatsapp ? ' · WhatsApp ' + e.whatsapp : ''].join(''))]),
          el('h3', { class: 'caixa__titulo' }, 'Vagas (' + vagas.length + ')'),
          vagas.length ? el('ul', { class: 'vg-op-lista' }, vagas.map(function (a) { return el('li', {}, [a.funcao || a.titulo, ' · ', P.status('anuncio', a.status)]); }))
            : el('p', { class: 't-nota texto-suave' }, 'Nenhuma vaga ainda.'),
          el('h3', { class: 'caixa__titulo' }, 'Histórico de moderação'),
          hist.length ? el('ul', { class: 'vg-op-lista' }, hist.slice(0, 12).map(function (m) {
            return el('li', {}, U.data(m.em) + ' · ' + (DECISOES[m.acao] || m.acao.replace(/_/g, ' ')) + (m.motivo ? ' · ' + tituloMotivo(ctx, m.motivo) : ''));
          })) : el('p', { class: 't-nota texto-suave' }, 'Nenhum ato registrado.'),
          vincular
        ]);
      }).catch(function (er) { U.tratarErro(er, { raiz: corpoJ }); });
    }
    return carregar();
  };

  // Empresa sem ninguém com acesso (cadastrada pelo balcão): ligar a conta de empresa que a dona/o dono já criou.
  function formVincular(ctx, e, depois) {
    if (!ctx.podeTudo()) return null;
    var campo = el('input', { class: 'entrada', type: 'email', id: 'vg-op-vincular-email', inputmode: 'email', autocomplete: 'off' });
    var b = el('button', { type: 'button', class: 'botao botao--claro', id: 'vg-op-vincular' }, 'Dar acesso a esta conta');
    b.addEventListener('click', function () {
      U.limparErroCampo(campo);
      var email = R.normalizarEmail(campo.value);
      if (!email) { U.erroCampo(campo, 'E-mail inválido.'); return; }
      U.ocupado(b, true, 'Ligando…');
      A.opVincularMembro(e.id, email).then(function () {
        U.avisar('Pronto: a conta ' + email + ' agora acessa ' + e.nomeFantasia + '.', { tipo: 'ok', ms: 6000 });
        depois();
      }, function (er) { U.ocupado(b, false); U.erroCampo(campo, er.message); });
    });
    return el('div', { class: 'campo vg-op-vincular' }, [
      el('label', { class: 'campo__rotulo', for: 'vg-op-vincular-email' }, 'Ninguém acessa esta empresa ainda. E-mail da conta de empresa que a pessoa responsável já criou'),
      campo, el('div', { class: 'acoes' }, b)]);
  }

  // Empresa com equipe mas SEM pessoa dona (vagas_op_empresa_dono): nomear alguém que JÁ está na equipe, com motivo (fica no
  // registro). O operador só consegue quando a empresa está sem dona (o banco responde se já tiver); a equipe, em qualquer uma.
  // O resumo das empresas não diz se há dona: o formulário fica recolhido atrás de um botão.
  function formDona(ctx, e, depois) {
    if (!ctx.podeTudo() || typeof A.opEmpresaDono !== 'function') return null;
    var caixa = el('section', { class: 'vg-op-dona', id: 'vg-op-dona' });
    var abrir = el('button', { type: 'button', class: 'botao botao--claro botao--pequeno', id: 'vg-op-dona-abrir', 'aria-expanded': 'false' }, 'A empresa ficou sem pessoa dona?');
    abrir.addEventListener('click', function () {
      abrir.setAttribute('aria-expanded', 'true');
      U.trocar(caixa, formulario());
      var c = doc.getElementById('vg-op-dona-email');
      if (c) c.focus();
    });
    function formulario() {
      var email = el('input', { class: 'entrada', type: 'email', id: 'vg-op-dona-email', inputmode: 'email', autocomplete: 'off', maxlength: '254' });
      var motivo = el('textarea', { class: 'entrada', id: 'vg-op-dona-motivo', rows: '3', maxlength: '300', 'aria-describedby': 'vg-op-dona-motivo-ajuda' });
      var erro = el('div', { id: 'vg-op-dona-resultado', 'aria-live': 'polite' });
      var b = el('button', { type: 'button', class: 'botao botao--principal', id: 'vg-op-dona-salvar' }, 'Nomear pessoa dona');
      b.addEventListener('click', function () {
        [email, motivo].forEach(U.limparErroCampo);
        U.limpar(erro);
        var em = R.normalizarEmail(email.value);
        var mt = motivo.value.replace(/\s+/g, ' ').trim();
        var ok = true;
        if (!em) { U.erroCampo(email, 'E-mail inválido.'); ok = false; }
        if (!mt) { U.erroCampo(motivo, 'Informe o motivo.'); ok = false; }
        if (!ok) return;
        U.ocupado(b, true, 'Salvando…');
        A.opEmpresaDono(e.id, em, mt).then(function () {
          U.avisar('Pronto: ' + em + ' agora é a pessoa dona de ' + e.nomeFantasia + '.', { tipo: 'ok', ms: 6000 });
          depois();
        }, function (er) {
          U.ocupado(b, false);
          if (er.sessaoExpirada || er.conexao) { U.tratarErro(er); return; }
          U.trocar(erro, el('p', { class: 'aviso aviso--erro', role: 'alert', id: 'vg-op-dona-erro' }, er.message));
        });
      });
      return [el('h3', { class: 'caixa__titulo' }, 'Nomear a pessoa dona'),
        el('p', { class: 't-rotulo texto-medio' }, 'A pessoa dona convida e tira pessoas da equipe da empresa. Use só quando a empresa ficou sem ' +
          'ninguém nesse papel. Precisa ser alguém que já está na equipe.'),
        el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-op-dona-email' }, 'E-mail de quem já está na equipe'), email]),
        el('div', { class: 'campo' }, [el('label', { class: 'campo__rotulo', for: 'vg-op-dona-motivo' }, 'Motivo'), motivo,
          el('span', { class: 'campo__ajuda', id: 'vg-op-dona-motivo-ajuda' }, 'Fica no registro de moderação. Até 300 caracteres.')]),
        erro, el('div', { class: 'acoes' }, b)];
    }
    U.trocar(caixa, el('div', { class: 'acoes' }, abrir));
    return caixa;
  }
})(typeof self !== 'undefined' ? self : this);
