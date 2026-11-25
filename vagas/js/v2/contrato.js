/*
 * Vagas sem Caos v2 — CONTRATO ÚNICO entre as telas, os adaptadores e o banco (24/11/2026).
 *
 * Quem usa este arquivo:
 *   - as telas (vagas/js/v2/pessoa/*, vagas/js/v2/empresa/*) chamam SEMPRE window.VSC_API.<metodo>(dados) -> Promise<resposta>;
 *   - o adaptador Supabase (vagas/js/v2/api-v2.js) leva cada método à RPC "rpc" (corpo {p_dados: dados}) ou à Edge Function
 *     vagas-conta ("edge": corpo {acao, ...dados}) e devolve o JSON da resposta SEM mudar nada (camelCase);
 *   - o adaptador de prévia (vagas/js/v2/previa/*) devolve respostas com a MESMA forma, com dados fictícios neste navegador;
 *   - o banco (supabase/migrations/2026110*) devolve exatamente estas formas; os testes validam banco e prévia com validar().
 *
 * Toda resposta é {ok:true, ...} ou {ok:false, erro:'texto em português', codigo?:'...'}; o adaptador transforma {ok:false} em
 * erro lançado (Error com .resposta), como o api.js atual. Datas em ISO 8601 UTC; valores em reais (número, sem centavos soltos).
 * Nenhum campo de nota, ranking, compatibilidade, idade, sexo, estado civil, foto ou nacionalidade existe em NENHUMA forma.
 *
 * Tipos nas formas: 's' texto, 'n' número, 'b' booleano, 'a' lista, 'o' objeto; sufixo '?' = pode ser null/ausente.
 */
(function (root) {
  'use strict';

  var ETAPAS = ['nova', 'vista', 'em conversa', 'entrevista marcada', 'contratada', 'não seguiu'];
  var TIPOS = ['CLT', 'Temporário', 'Diária', 'Freelancer', 'Estágio', 'PJ'];           // rótulo de tela: "Carteira assinada", "Por serviço"
  var TURNOS = ['Manhã', 'Tarde', 'Noite', 'Comercial', 'Escala 12x36', 'Fim de semana'];
  var STATUS_VAGA = ['aberta', 'pausada', 'encerrada', 'revisao', 'segurada', 'rascunho', 'vencida'];
  var ESTADO_EMPRESA = ['em_verificacao', 'verificada', 'precisa_ajuste', 'suspensa', 'vencida'];
  var MOTIVOS_DENUNCIA = ['cobranca', 'documento', 'falsa', 'dados_errados', 'discriminacao', 'outro'];
  var LIMITES = { vagasNoAr: 3, vagasPorDia: 3, denunciasQueDerrubam: 2, denunciasQueDerrubamVerificada: 3, diasParaVerificar: 7,
    liberacoesWhatsappPorDia: 20, equipeEmVerificacao: 2, mensagensSeguidas: 3, mensagensPorDiaEmVerificacao: 100 };

  // ----- formas reutilizadas -----
  var VAGA = { id: 's', titulo: 's', empresaId: 's', setorId: 's', tipo: 's', turno: 's', horario: 's',
    salario: 'o', beneficios: 'a', requisitos: 'a', diferenciais: 'a', descricao: 's', atividades: 'a', perguntas: 'a',
    vagasQtd: 'n', semExperiencia: 'b', pcd: 'b', urgente: 'b', status: 's', cidade: 's', bairro: 's', publicadaEm: 's', expiraEm: 's?', repete: 'b' };
  // salario: {min:n, max:n?, periodo:'mes'|'dia'|'hora', aCombinar:false, texto:s, obs:s?}   (aCombinar é sempre false)
  var EMPRESA = { id: 's', nome: 's', setor: 's', cidade: 's', bairro: 's', descricao: 's', iniciais: 's', verificada: 'b', verificadaEm: 's?' };
  var CANDIDATURA_PESSOA = { id: 's', vagaId: 's', etapa: 's', criadaEm: 's', marcos: 'o', entrevista: 'o?', encerradaPor: 's?',
    whatsappLiberado: 'b', empresaVerificada: 'b', naoLidas: 'n', forma: 's', respostas: 'a', mensagem: 's?' };
  // marcos: {enviada, vista?, conversa?, marcada?, fim?} (ISO); entrevista: {quando, onde, recado?, confirmada:b|null, pediuOutro:b}
  // encerradaPor: 'pessoa' | 'empresa' | 'prazo' | null
  var CANDIDATO_EMPRESA = { id: 's', vagaId: 's', etapa: 's', criadaEm: 's', visto: 'b', nome: 's', nomeCompleto: 'b',
    resumo: 'o', arquivo: 'o?', whatsapp: 's?', whatsappLiberado: 'b', forma: 's', respostas: 'a', mensagem: 's?', entrevista: 'o?',
    historico: 'a', naoLidas: 'n' };
  // resumo: {funcao, cidade, bairro, experiencias:[{cargo, empresa, inicio:'AAAA-MM', fim:'AAAA-MM'|null}], escolaridade, cursos:[s], cnh:[s],
  //          turnos:[s], pretensao:n?, tempo:s, texto:s}  -- só FATOS que a pessoa declarou (nada de nota).
  // nome: nome completo quando nomeCompleto=true (empresa verificada, ou pessoa liberou), senão só o primeiro nome.
  // whatsapp: dígitos '55DDNNNNNNNNN' só quando a empresa pode chamar (verificada, ou pessoa liberou); senão null.
  // arquivo: {nome, tamanhoKb, tipo} (o link vem de arquivoLink); null quando a pessoa não anexou OU a empresa ainda não pode ver.

  var METODOS = {
    // ---------------- públicos (sem login) ----------------
    base: { rpc: 'vagas_v2_base', login: false, req: { cidade: 's?' },
      res: { praca: 'o', cidades: 'a', setores: 'a', vagas: 'a', empresas: 'a', geradoEm: 's' } },        // vagas: [VAGA]; empresas: [EMPRESA]; até 500 vagas abertas
    vaga: { rpc: 'vagas_v2_vaga', login: false, req: { id: 's' }, res: { vaga: 'o', empresa: 'o' } },
    textoChecar: { rpc: 'vagas_v2_texto_checar', login: false, req: { texto: 's', contexto: 's?' },     // contexto 'vaga' (padrão) | 'conversa'
      res: { passa: 'b', barra: 'a', fraco: 'a' } },                                                       // barra/fraco: [{trecho, motivo, mensagem}]
    cnpjConsultar: { edge: 'cnpj', login: false, req: { cnpj: 's' },
      res: { cnpj: 's', tipo: 's', ativa: 'b', situacao: 's', razaoSocial: 's', nomeFantasia: 's', cidade: 's', uf: 's', bairro: 's', abertura: 's?', mei: 'b', setor: 's' } },
    codigoPedir: { edge: 'codigo_pedir', login: false, req: { destino: 's', canal: 's?' },                 // canal 'email' (único ligado) | 'whatsapp' (desligado por config)
      res: { canal: 's', destinoMascarado: 's', reenviarEmSeg: 'n', expiraEmSeg: 'n' } },
    codigoConfirmar: { edge: 'codigo_confirmar', login: false, req: { destino: 's', codigo: 's', nome: 's?', tipo: 's?' },
      res: { sessao: 'o', novaConta: 'b' } },                                                              // sessao: {access_token, refresh_token, expires_at, user:{id,email}}

    // ---------------- pessoa (login) ----------------
    eu: { rpc: 'vagas_v2_eu', login: true, req: {},
      res: { conta: 'o', curriculo: 'o', salvas: 'a', escondidas: 'a', alertas: 'a', contadores: 'o' } },    // conta {id,nome,whatsapp,email?,criadaEm,tipo}; curriculo {arquivo:{nome,tamanhoKb,tipo,enviadoEm}|null, dados:{funcao,cidade,bairro,experiencias,escolaridade,cursos,cnh,turnos,pretensao,tempo,resumo}}
    perfilSalvar: { rpc: 'vagas_v2_perfil_salvar', login: true, req: { nome: 's', whatsapp: 's', email: 's?', cidade: 's', bairro: 's', funcao: 's?', experiencias: 'a?', escolaridade: 's?', cursos: 'a?', cnh: 'a?', turnos: 'a?', pretensao: 'n?', tempo: 's?', resumo: 's?' }, res: {} },
    curriculoGuardar: { rpc: 'vagas_v2_curriculo_guardar', login: true, req: { caminho: 's', nome: 's', tamanhoKb: 'n', tipo: 's' }, res: { arquivo: 'o' } },
    curriculoApagar: { rpc: 'vagas_v2_curriculo_apagar', login: true, req: {}, res: {} },
    vagaSalvar: { rpc: 'vagas_v2_vaga_salvar', login: true, req: { vagaId: 's', salvar: 'b' }, res: { salvas: 'a' } },
    vagaEsconder: { rpc: 'vagas_v2_vaga_esconder', login: true, req: { vagaId: 's', esconder: 'b' }, res: { escondidas: 'a' } },
    alertaSalvar: { rpc: 'vagas_v2_alerta_salvar', login: true, req: { funcao: 's?', setorId: 's?', cidade: 's?', filtros: 'o?', canal: 's?' }, res: { alerta: 'o', alertas: 'a' } },
    alertaApagar: { rpc: 'vagas_v2_alerta_apagar', login: true, req: { id: 's' }, res: { alertas: 'a' } },
    candidatar: { rpc: 'vagas_v2_candidatar', login: true,
      req: { vagaId: 's', caminho: 's', respostas: 'a?', mensagem: 's?', dados: 'o?', idLocal: 's?' },       // caminho 'anexo'|'montar'|'minimo'; dados: perfil como em perfilSalvar; idLocal = id gerado no aparelho (reenviar não duplica)
      res: { candidaturaId: 's', etapa: 's', contatoSegue: 's' } },                                          // contatoSegue 'completo' (empresa verificada) | 'so_resumo' (em verificação)
    candidaturas: { rpc: 'vagas_v2_candidaturas', login: true, req: {}, res: { lista: 'a' } },               // [CANDIDATURA_PESSOA + {vaga: VAGA, empresa: EMPRESA}]
    candidaturaRetirar: { rpc: 'vagas_v2_candidatura_retirar', login: true, req: { id: 's' }, res: {} },
    entrevistaResponder: { rpc: 'vagas_v2_entrevista_responder', login: true, req: { id: 's', acao: 's', texto: 's?' }, res: {} },   // acao 'confirmar' | 'outro_horario'
    whatsappLiberar: { rpc: 'vagas_v2_whatsapp_liberar', login: true, req: { id: 's' }, res: {} },
    conversa: { rpc: 'vagas_v2_conversa', login: true, req: { id: 's' }, res: { mensagens: 'a', alertaGolpe: 'b' } },   // mensagens: [{id, de:'eu'|'ela'|'sistema', txt, ts}] (visão da pessoa); a empresa lê a sua em candidato()
    mensagemEnviar: { rpc: 'vagas_v2_mensagem_enviar', login: true, req: { id: 's', texto: 's', mid: 's?' }, res: { mensagem: 'o' } },   // vale para pessoa e para empresa (o banco sabe quem é); aplica textoChecar('conversa')
    quemViu: { rpc: 'vagas_v2_quem_viu', login: true, req: {}, res: { lista: 'a' } },                        // [{empresa, vaga, em, o:'currículo'|'contato'|'arquivo'}]
    denunciar: { rpc: 'vagas_v2_denunciar', login: true, req: { vagaId: 's?', mensagemId: 's?', candidaturaId: 's?', motivo: 's', detalhe: 's?' }, res: { derrubou: 'b' } },

    // ---------------- envio de arquivo (o adaptador sobe para o Storage com a sessão da pessoa e depois chama a RPC de registro) ----------------
    //   curriculoEnviar({arquivo: File}) -> {ok, arquivo:{nome,tamanhoKb,tipo,enviadoEm}}   bucket privado 'vagas-curriculos', caminho '<user_id>/<uuid>.<ext>', ≤ 10 MB, pdf/doc/docx/jpg/png/heic
    //   verificacaoDocumentoEnviar({empresaId, arquivo: File}) -> {ok, documentos}           bucket privado 'vagas-verificacao', caminho '<empresa_id>/<uuid>.<ext>', ≤ 10 MB, pdf/jpg/png
    // (no contrato como UPLOADS; não têm rpc próprio: usam curriculoGuardar / verificacaoDocumento depois do envio)

    // ---------------- empresa (login) ----------------
    empresaCriar: { edge: 'empresa_criar', login: true,                                                      // consulta o CNPJ no servidor e cria a empresa em verificação; quem chama vira dono
      req: { cnpj: 's', nomeFantasia: 's?', cidade: 's', bairro: 's?', setor: 's?', responsavel: 's', whatsapp: 's', email: 's?' },
      res: { empresa: 'o' } },
    minhasEmpresas: { rpc: 'vagas_v2_minhas_empresas', login: true, req: {}, res: { empresas: 'a' } },       // [EMPRESA_DONA]
    empresaSalvar: { rpc: 'vagas_v2_empresa_salvar', login: true, req: { empresaId: 's', nomeFantasia: 's?', descricao: 's?', setor: 's?', bairro: 's?', whatsapp: 's?', email: 's?', lojas: 'a?', cnpj: 's?', razaoSocial: 's?' }, res: { empresa: 'o' } },
    vagaPublicar: { rpc: 'vagas_v2_vaga_publicar', login: true, req: { empresaId: 's', vaga: 'o', idLocal: 's?' },
      res: { vaga: 'o', estado: 's', mensagens: 'a' } },                                                      // estado 'no_ar' | 'revisao_rapida' (sinal forte: segurada) | 'rascunho' (passou do limite de 3); {ok:false, codigo:'texto_barrado', barra:[...]} quando barra
    vagaEditar: { rpc: 'vagas_v2_vaga_editar', login: true, req: { id: 's', vaga: 'o' }, res: { vaga: 'o', estado: 's' } },
    vagaAcao: { rpc: 'vagas_v2_vaga_acao', login: true, req: { id: 's', acao: 's', dados: 'o?' }, res: { vaga: 'o?' } },   // 'pausar'|'retomar'|'encerrar'|'reabrir'|'renovar'|'duplicar'(devolve a cópia em rascunho) |'publicar'(rascunho)
    vagasDaEmpresa: { rpc: 'vagas_v2_vagas_da_empresa', login: true, req: { empresaId: 's' },
      res: { vagas: 'a', empresa: 'o', limites: 'o' } },                                                       // vagas: [VAGA + {estado, candidatos, novos, motivo?}]; empresa: EMPRESA_DONA; limites {noAr, maxNoAr:n|null, hoje, maxHoje:n|null}
    candidatos: { rpc: 'vagas_v2_candidatos', login: true, req: { empresaId: 's', vagaId: 's?', etapa: 's?', filtros: 'o?' },
      res: { lista: 'a', totais: 'o' } },                                                                     // lista: [CANDIDATO_EMPRESA] ordenada por data (mais nova primeiro); filtros por FATO: bairro, cnh, escolaridade, turno, pretensaoAte, comArquivo
    candidato: { rpc: 'vagas_v2_candidato', login: true, req: { id: 's' }, res: { candidato: 'o', mensagens: 'a' } },
    arquivoLink: { edge: 'arquivo_link', login: true, req: { id: 's' }, res: { url: 's', expiraEm: 's' } },   // só empresa verificada ou com liberação; a função de servidor chama vagas_v2_arquivo_link_servidor (registra "quem viu") e assina o link de 5 min
    candidatoMover: { rpc: 'vagas_v2_candidato_mover', login: true, req: { id: 's', etapa: 's', desfazer: 'b?' }, res: { candidato: 'o' } },   // etapa de ETAPAS; 'não seguiu' aceita desfazer (volta à etapa anterior)
    whatsappChamar: { rpc: 'vagas_v2_whatsapp_chamar', login: true, req: { id: 's' }, res: { whatsapp: 's', link: 's' } },   // só verificada ou liberado; registra acesso; marca "em conversa"
    entrevistaMarcar: { rpc: 'vagas_v2_entrevista_marcar', login: true, req: { id: 's', quando: 's', onde: 's', recado: 's?' }, res: { candidato: 'o' } },
    equipeConvidar: { rpc: 'vagas_v2_equipe_convidar', login: true, req: { empresaId: 's', email: 's' }, res: { equipe: 'a' } },
    equipe: { rpc: 'vagas_v2_equipe', login: true, req: { empresaId: 's' }, res: { equipe: 'a' } },
    verificacao: { rpc: 'vagas_v2_verificacao', login: true, req: { empresaId: 's' }, res: { estado: 's', passos: 'a', prazoAte: 's?', motivoAjuste: 's?', verificadaEm: 's?', documentos: 'a' } },
    verificacaoDocumento: { rpc: 'vagas_v2_verificacao_documento', login: true, req: { empresaId: 's', caminho: 's', nome: 's', tipo: 's' }, res: { documentos: 'a' } },
    verificacaoDocumentoLink: { edge: 'documento_link', login: true, req: { id: 's' }, res: { url: 's', expiraEm: 's' } },   // dono da empresa ou equipe da cidade; chama vagas_v2_documento_link_servidor
    verificacaoReenviar: { rpc: 'vagas_v2_verificacao_reenviar', login: true, req: { empresaId: 's', dados: 'o?' }, res: { estado: 's' } },   // "Corrigir e pedir nova conferência"

    // ---------------- equipe da cidade (operador; nunca vê pessoa, currículo nem contato) ----------------
    opRevisarDepois: { rpc: 'vagas_v2_op_revisar_depois', login: true, req: { cidade: 's?', filtro: 's?' }, res: { lista: 'a', totais: 'o' } },   // [{vaga, empresa:{...+consultaCnpj}, sinais:[{tipo:'forte'|'fraco', texto}], denuncias, criadaEm}]
    opRevisarDecidir: { rpc: 'vagas_v2_op_revisar_decidir', login: true, req: { id: 's', acao: 's', recado: 's?' }, res: {} },   // 'verificar_empresa'|'pedir_documento'|'tirar_do_ar'|'suspender_empresa'|'liberar'(segurada vai ao ar)|'recusar_empresa'
    opAvisarCandidatos: { rpc: 'vagas_v2_op_avisar_candidatos', login: true, req: { vagaId: 's', mensagem: 's' }, res: { avisados: 'n' } }
  };

  var UPLOADS = {
    curriculoEnviar: { bucket: 'vagas-curriculos', depois: 'curriculoGuardar', max: 10485760, tipos: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'] },
    verificacaoDocumentoEnviar: { bucket: 'vagas-verificacao', depois: 'verificacaoDocumento', max: 10485760, tipos: ['application/pdf', 'image/jpeg', 'image/png'] }
  };

  function tipoOk(t, v) {
    var opcional = /\?$/.test(t), base = t.replace('?', '');
    if (v === undefined || v === null) return opcional;
    if (base === 's') return typeof v === 'string';
    if (base === 'n') return typeof v === 'number' && isFinite(v);
    if (base === 'b') return typeof v === 'boolean';
    if (base === 'a') return Array.isArray(v);
    if (base === 'o') return typeof v === 'object' && !Array.isArray(v);
    return true;
  }
  function validarForma(forma, obj, prefixo) {
    var erros = [];
    if (!obj || typeof obj !== 'object') return [(prefixo || 'valor') + ': não é objeto'];
    Object.keys(forma).forEach(function (k) {
      if (!tipoOk(forma[k], obj[k])) erros.push((prefixo || '') + k + ': esperado ' + forma[k] + ', veio ' + (obj[k] === null ? 'null' : typeof obj[k]));
    });
    return erros;
  }
  // validar('base', resposta) -> lista de problemas (vazia = ok). Confere também os itens das listas principais.
  function validar(metodo, resposta) {
    var m = METODOS[metodo];
    if (!m) return ['método desconhecido: ' + metodo];
    if (!resposta || resposta.ok !== true) return ['resposta sem ok:true'];
    var erros = validarForma(m.res, resposta, '');
    function itens(lista, forma, rot) {
      (lista || []).slice(0, 50).forEach(function (x, i) { erros = erros.concat(validarForma(forma, x, rot + '[' + i + '].')); });
    }
    if (metodo === 'base') { itens(resposta.vagas, VAGA, 'vagas'); itens(resposta.empresas, EMPRESA, 'empresas'); }
    if (metodo === 'vaga') { erros = erros.concat(validarForma(VAGA, resposta.vaga, 'vaga.'), validarForma(EMPRESA, resposta.empresa, 'empresa.')); }
    if (metodo === 'candidaturas') itens(resposta.lista, CANDIDATURA_PESSOA, 'lista');
    if (metodo === 'candidatos') itens(resposta.lista, CANDIDATO_EMPRESA, 'lista');
    if (metodo === 'candidato') erros = erros.concat(validarForma(CANDIDATO_EMPRESA, resposta.candidato, 'candidato.'));
    return erros;
  }
  // Palavras que NUNCA podem aparecer em texto visível (testes varrem telas e textos).
  var PROIBIDAS = ['tinder', 'swipe', 'match', 'aprovado', 'reprovado', 'perfil ideal', 'compatibilidade', 'ranking', 'disc',
    'currículo verificado', 'pontuação', 'aderência', 'encaixe', 'notus'];
  var FRASE_GOLPE = 'Nunca pague para se candidatar. Se alguém pedir dinheiro, Pix ou documento em nome do Vagas sem Caos, é golpe.';

  var API = { ETAPAS: ETAPAS, TIPOS: TIPOS, TURNOS: TURNOS, STATUS_VAGA: STATUS_VAGA, ESTADO_EMPRESA: ESTADO_EMPRESA, MOTIVOS_DENUNCIA: MOTIVOS_DENUNCIA,
    LIMITES: LIMITES, METODOS: METODOS, UPLOADS: UPLOADS, FORMAS: { vaga: VAGA, empresa: EMPRESA, candidaturaPessoa: CANDIDATURA_PESSOA, candidatoEmpresa: CANDIDATO_EMPRESA },
    validar: validar, validarForma: validarForma, PROIBIDAS: PROIBIDAS, FRASE_GOLPE: FRASE_GOLPE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.VSC_CONTRATO = API;
})(typeof self !== 'undefined' ? self : this);
