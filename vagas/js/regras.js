/*
 * Vagas sem Caos — regras puras (sem rede, sem DOM), as MESMAS do banco (supabase/migrations/20261022120000_vagas.sql).
 * Usadas pela prévia (vagas/js/api-previa.js), pelas telas (validação antes de enviar e rótulos) e pelos testes.
 * tests/supabase/vagas.test.js confere que conferirTexto, normalizar, cnpjValido e normalizarWhatsapp dão o MESMO resultado
 * que vagas_interno.conferir_texto / normalizar / cnpj_valido / normalizar_whatsapp.
 *
 *   Listas fechadas (id + rótulo): MODALIDADES, TURNOS, ESCOLARIDADES, CNH, UNIDADES, PONTOS_FORTES, VINCULOS, MOTIVOS_DENUNCIA (+ _TELA), TEXTO_STATUS,
 *     STATUS_CANDIDATURA, STATUS_ANUNCIO, STATUS_EMPRESA, STATUS_REFERENCIA, STATUS_REFERENCIA_EMPRESA; da vaga ("como produto"):
 *     AREAS (24), TURNOS_VAGA, EXPERIENCIAS_VAGA, ESCOLARIDADES_VAGA, REQUISITOS_VAGA, BENEFICIOS, TESTES_SELO.
 *   Filtro de textos: PADROES, tiposDoContexto(ctx), mensagemTexto(tipo, trecho, ctx), conferirTexto(texto, ctx) -> null | {tipo, trecho, erro}
 *     ctx: 'anuncio' | 'empresa' | 'mensagem' | 'referencia' | 'cartao' | 'perfil'.
 *   normalizar(texto) · normalizarCnpj · cnpjValido · formatarCnpj · normalizarWhatsapp · whatsappCelularValido · whatsappEmpresaValido
 *   normalizarEmail(texto) -> '' se inválido · nomeValido(nome) · nomeExibicao(nome) ('Ana Souza' -> 'Ana S.') · iniciais(nome)
 *   lerMes('AAAA-MM') -> {ano, mes} | null · meses(inicio, fim, agora) · hoje(fuso, agora) -> 'AAAA-MM-DD'
 *   formatarValor({minCentavos, maxCentavos, unidade}) -> 'R$ 1.621,00 a R$ 1.900,00 por mês'
 *   lerPessoa(dados) / lerEmpresa(dados) / lerAnuncio(dados, hoje) / lerReferencia(dados, mesAtual) -> {ok:true, campos} | {ok:false, erro}
 *     (mesmas mensagens das RPCs vagas_pessoa_salvar, vagas_empresa_cadastrar, vagas_anuncio_salvar, vagas_referencia_oferecer).
 *   MSG: mensagens fixas compartilhadas.
 *   Onda 2 (migração 20261024120000_vagas_onda2): lerListaEspera(dados) (e-mail + WhatsApp opcional), PORTES, INDICADORES e GATILHOS
 *     (catálogo do painel, alvos por porte), corIndicador(valor, alvo, direcao) -> 'ok' | 'atencao' | 'alerta' | null, CORES_INDICADOR,
 *     PAPEIS_EMPRESA, STATUS_CONVITE_EQUIPE (equipe da empresa).
 * Textos longos (termos, privacidade, consentimentos, e-mails): texto final em conteudo/vagas-textos/ (aqui só a versão).
 */
(function (root) {
  'use strict';

  // Texto final dos termos/privacidade: conteudo/vagas-textos/ (aqui só a versão aceita).
  var VERSAO_TERMOS = '2026-10-13';

  function lista(pares) { return pares.map(function (p) { return { id: p[0], rotulo: p[1] }; }); }
  var MODALIDADES = lista([['clt', 'CLT (carteira assinada)'], ['temporario', 'Temporário'], ['diaria', 'Diária'],
    ['freelancer', 'Freelancer'], ['estagio', 'Estágio']]);
  var VINCULOS = MODALIDADES;
  var TURNOS = lista([['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite'], ['madrugada', 'Madrugada'],
    ['fim_de_semana', 'Fim de semana'], ['escala', 'Escala']]);
  var ESCOLARIDADES = lista([['fundamental_incompleto', 'Fundamental incompleto'], ['fundamental', 'Fundamental completo'],
    ['medio_incompleto', 'Médio incompleto'], ['medio', 'Médio completo'], ['tecnico', 'Técnico'],
    ['superior_incompleto', 'Superior incompleto'], ['superior', 'Superior completo'], ['pos', 'Pós-graduação']]);
  var CNH = ['A', 'B', 'C', 'D', 'E'];
  var UNIDADES = { mes: 'por mês', hora: 'por hora', dia: 'por dia', servico: 'por serviço' };
  // Vaga "como produto de marketplace" (chaves do design; as mesmas do banco: vagas_areas e restrições de vagas_anuncios).
  var AREAS = lista([['atendimento', 'Atendimento e recepção'], ['vendas-loja', 'Vendas em loja e balcão'],
    ['vendas-externas', 'Vendas externas e representação'], ['caixa', 'Caixa e operação de loja'], ['administrativo', 'Administrativo e escritório'],
    ['financeiro', 'Financeiro e contabilidade'], ['rh', 'Recursos humanos'], ['logistica', 'Estoque, logística e entregas'],
    ['motorista', 'Motorista e transporte'], ['producao', 'Produção e indústria'], ['construcao', 'Construção civil'],
    ['manutencao', 'Manutenção e reparos'], ['limpeza', 'Limpeza e conservação'], ['cozinha', 'Cozinha e restaurante'],
    ['hotelaria', 'Hotelaria e eventos'], ['beleza', 'Beleza e estética'], ['saude', 'Saúde e farmácia'], ['educacao', 'Educação e creche'],
    ['agro', 'Agropecuária e campo'], ['seguranca', 'Segurança e portaria'], ['marketing', 'Marketing, design e redes sociais'],
    ['tecnologia', 'Tecnologia e informática'], ['domesticos', 'Serviços domésticos e cuidado de pessoas'], ['outros', 'Outros comércios e serviços']]);
  var TURNOS_VAGA = lista([['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite'], ['comercial', 'Horário comercial'], ['escala', 'Escala'],
    ['a_combinar', 'A combinar']]);
  // CLT art. 442-A: no máximo 6 meses na função (os ids antigos ate_1, 1_a_3 e mais_3 viram 6_meses no lerAnuncio).
  var EXPERIENCIAS_VAGA = lista([['nao_precisa', 'Não precisa de experiência'], ['ajuda', 'Ajuda ter, mas não é obrigatória'],
    ['6_meses', 'Pelo menos 6 meses na função']]);
  var ESCOLARIDADES_VAGA = lista([['nao_exigida', 'Não exigida'], ['fundamental', 'Fundamental'], ['medio', 'Médio'], ['tecnico', 'Técnico'],
    ['superior', 'Superior']]);
  var REQUISITOS_VAGA = lista([['cnh_a', 'CNH categoria A'], ['cnh_b', 'CNH categoria B'], ['cnh_d', 'CNH categoria D'],
    ['curso_registro', 'Curso com registro na área'], ['disponibilidade', 'Disponibilidade de horário'], ['outro', 'Outro']]);
  var BENEFICIOS = lista([['vt', 'Vale-transporte'], ['refeicao', 'Refeição ou vale-refeição'], ['saude', 'Plano de saúde'],
    ['moradia', 'Moradia'], ['comissao', 'Comissão']]);
  // Testes que a vaga pode citar ("valoriza o selo"): informativo, NUNCA filtro nem corte.
  // Rótulos = nomes do catálogo dos testes (docs/VAGAS-TESTES.md), para o "Selo sugerido: …" da vaga e o selo dizerem o mesmo.
  var TESTES_SELO = lista([['atendimento', 'Atendimento e recepção'], ['vendas', 'Vendas no varejo'], ['administrativo', 'Rotina administrativa'],
    ['caixa', 'Caixa e matemática prática'], ['portugues', 'Português prático']]);
  // Lista fechada de pontos fortes da referência profissional: os 12 comportamentos observáveis da psicologia (evidencias.md
  // §4A.4; a empresa marca até 3). Mesma lista, na mesma ordem, em vagas_interno.pontos_fortes() (o teste do banco confere).
  var PONTOS_FORTES = lista([['pontualidade', 'Chega no horário e avisa quando não pode'], ['atendimento', 'Atende bem o cliente'],
    ['caixa_certo', 'Caixa fecha certo'], ['organizacao', 'Mantém o posto organizado'], ['equipe', 'Ajuda os colegas quando precisa'],
    ['aprende_rapido', 'Aprende uma tarefa nova em poucos dias'], ['regras_seguranca', 'Segue as regras e a segurança do trabalho'],
    ['comunicacao', 'Passa recado e informação de forma clara'], ['iniciativa', 'Resolve o que vê sem esperar ordem'],
    ['cuidado_material', 'Cuida do material, do equipamento e do ambiente'], ['vendas', 'Vende bem e oferece o produto certo'],
    ['situacao_dificil', 'Resolve reclamação ou situação difícil com calma']]);
  // Motivos da denúncia (mesma lista fechada da migração; rótulos do design/textos). "cobranca" fica por compatibilidade
  // com "golpe" (os dois são "pede dinheiro"); as telas mostram só os da lista MOTIVOS_DENUNCIA_TELA.
  var MOTIVOS_DENUNCIA = lista([['golpe', 'Pede dinheiro'], ['cobranca', 'Pede dinheiro (taxa ou cobrança)'], ['documento', 'Pede documento'],
    ['discriminacao', 'Discriminação'], ['falsa', 'Parece falsa'], ['ofensa', 'Assédio ou ofensa'], ['contato', 'Pede contato fora da plataforma'],
    ['outro', 'Outro']]).map(function (m) { return { id: m.id, rotulo: m.rotulo, chave: m.id, texto: m.rotulo }; });   // chave/texto: formato dos textos
  var MOTIVOS_DENUNCIA_TELA = MOTIVOS_DENUNCIA.filter(function (m) { return m.id !== 'cobranca'; });
  // Situação do texto livre da referência (moderação). Nunca "aprovado/reprovado" em tela: o texto é publicado ou não.
  var TEXTO_STATUS = lista([['sem_texto', 'Sem texto'], ['pendente', 'Texto em revisão'], ['publicado', 'Texto publicado'],
    ['nao_publicado', 'Texto não publicado']]);
  // Rótulos para a PESSOA (docs/VAGAS-TELAS.md): "agora_nao" aparece como "Encerrada" (nunca "a empresa disse não").
  var STATUS_CANDIDATURA = lista([['enviada', 'Enviada'], ['conversar', 'Responder'], ['agora_nao', 'Encerrada'],
    ['combinou', 'Combinou'], ['contratada', 'Contratada'], ['recusada', 'Você recusou'], ['retirada', 'Retirada']]);
  var STATUS_ANUNCIO = lista([['rascunho', 'Rascunho'], ['em_revisao', 'Em revisão'], ['publicado', 'No ar'], ['pausado', 'Pausada'],
    ['encerrado', 'Encerrada'], ['suspenso', 'Fora do ar (denúncias)'], ['removido', 'Removida pela moderação']]);
  var STATUS_EMPRESA = lista([['em_analise', 'Em análise'], ['ativa', 'Verificada'], ['suspensa', 'Suspensa']]);
  var STATUS_REFERENCIA = lista([['pendente', 'Esperando o seu aceite'], ['aceita', 'Aparece no seu perfil'], ['ocultada', 'Oculta'],
    ['recusada', 'Recusada'], ['removida', 'Removida']]);
  // Para a EMPRESA ("Referências dadas"): o banco nunca devolve "ocultada" para ela (veto P2 da psicologia).
  // Veto P2: a empresa nunca sabe o que a pessoa fez com a referência (20261024120005).
  var STATUS_REFERENCIA_EMPRESA = lista([['enviada', 'Enviada'], ['removida', 'Removida pela moderação']]);
  // Equipe da empresa (convite feito por quem é dono(a); migração 20261024120000_vagas_onda2). "vencido" = aberto e fora do prazo.
  var PAPEIS_EMPRESA = lista([['dono', 'Dono(a)'], ['recrutador', 'Recrutador(a)']]);
  var STATUS_CONVITE_EQUIPE = lista([['pendente', 'Esperando o aceite'], ['vencido', 'Venceu'], ['aceito', 'Aceito'], ['cancelado', 'Cancelado']]);
  // Porte da cidade: escolhe o alvo de cada indicador do painel ('pequena' = os alvos "cidadePequena" do arquivo; 'grande' ainda
  // não tem alvo no arquivo). Sem porte cadastrado, os indicadores saem sem alvo e sem cor.
  var PORTES = lista([['pequena', 'Cidade pequena'], ['grande', 'Cidade grande']]);
  var CORES_INDICADOR = lista([['ok', 'No alvo'], ['atencao', 'Perto do alvo'], ['alerta', 'Longe do alvo']]);
  // Os 15 indicadores e os 5 gatilhos de conteudo/vagas-operacao/indicadores.json (versão 2), com os alvos por porte. O MESMO
  // catálogo de vagas_interno.indicadores_catalogo() (tests/supabase/vagas_onda2.test.js compara o arquivo, o banco e esta lista).
  var INDICADORES = [
    { chave: 'vagas_ativas', nome: 'Vagas ativas', unidade: 'vagas', periodo: 'agora', direcao: 'maior_melhor',
      alvo: { pequena: 20 }, alvoLancamento: { pequena: 15 }, hipotese: false },
    { chave: 'pessoas_com_selo_por_funcao', nome: 'Pessoas com selo, por teste', unidade: 'pessoas', periodo: 'agora', direcao: 'maior_melhor',
      alvo: { pequena: { porTeste: null, total: 400 } }, alvoLancamento: { pequena: { total: 150 } }, hipotese: false },
    { chave: 'vagas_3_interessados_72h', nome: 'Vagas com 3 interessados com selo em 7 dias', unidade: '%', periodo: '30 dias',
      direcao: 'maior_melhor', alvo: { pequena: 70 }, janela: { pequena: '7d' }, hipotese: false },
    { chave: 'vagas_combinou_7d', nome: 'Vagas com Combinou em 7 dias', unidade: '%', periodo: '30 dias', direcao: 'maior_melhor',
      alvo: { pequena: 60 }, hipotese: true },
    { chave: 'primeira_resposta_empresa_dias', nome: 'Primeira resposta da empresa', unidade: 'dias', periodo: '30 dias', direcao: 'menor_melhor',
      alvo: { pequena: 7 }, hipotese: false },
    { chave: 'contratacoes', nome: 'Contratações', unidade: 'contratações', periodo: 'acumulado e mês', direcao: 'maior_melhor',
      alvo: { pequena: 3 }, hipotese: false },
    { chave: 'empresas_ativas_mes', nome: 'Empresas ativas por mês', unidade: 'empresas', periodo: 'mês', direcao: 'maior_melhor',
      alvo: { pequena: 15 }, alvoLancamento: { pequena: 10 }, hipotese: false },
    { chave: 'empresas_buscando_semana', nome: 'Empresas buscando no banco por semana', unidade: 'empresas', periodo: 'semana', direcao: 'maior_melhor',
      alvo: { pequena: null }, hipotese: false },
    { chave: 'empresas_pagantes', nome: 'Empresas pagantes (mês)', unidade: 'empresas', periodo: 'mês', direcao: 'maior_melhor',
      alvo: { pequena: 5 }, hipotese: false },
    { chave: 'receita_liquida_centavos', nome: 'Receita líquida (mês)', unidade: 'centavos', periodo: 'mês', direcao: 'maior_melhor',
      alvo: { pequena: null }, hipotese: false },
    { chave: 'denuncia_tempo_decisao_h', nome: 'Tempo para decidir uma denúncia', unidade: 'horas', periodo: 'últimas 30', direcao: 'menor_melhor',
      alvo: { pequena: 24 }, hipotese: true },
    { chave: 'emails_mes', nome: 'E-mails enviados no mês', unidade: 'e-mails', periodo: 'mês', direcao: 'menor_melhor',
      alvo: { pequena: 3000 }, alerta: 2500, hipotese: false },
    { chave: 'fila_moderacao', nome: 'Esperando moderação há mais de 24 h', unidade: 'itens', periodo: 'agora', direcao: 'menor_melhor',
      alvo: { pequena: 0 }, hipotese: true },
    { chave: 'lista_espera', nome: 'Pessoas na lista de espera', unidade: 'pessoas', periodo: 'agora', direcao: 'maior_melhor',
      alvo: { pequena: 200 }, hipotese: true },
    { chave: 'cadastros_assistidos_confirmados', nome: 'Cadastros assistidos confirmados', unidade: 'contas', periodo: 'por mutirão e mês',
      direcao: 'maior_melhor', alvo: { pequena: 45 }, hipotese: true }
  ];
  var GATILHOS = [
    { chave: 'antes_de_cobrar', nome: 'Pode começar a cobrar a empresa', hipotese: true },
    { chave: 'praca_viva', nome: 'Praça viva (6 meses)', hipotese: false },
    { chave: 'abrir_proxima', nome: 'Abrir outra praça (só quando o dono decidir; nenhuma cidade escolhida)', hipotese: true },
    { chave: 'trocar_parceiro', nome: 'Trocar o parceiro', hipotese: false },
    { chave: 'pessoa_nao_paga', nome: 'A pessoa não paga nada', hipotese: false }
  ];

  var MSG = {
    SESSAO: 'Sessão expirada. Entre de novo.',
    CONFIRMAR: 'Confirme seu e-mail pelo link que enviamos antes de continuar.',
    SUSPENSA: 'Esta conta está suspensa. Fale com a Gestão sem Caos.',
    SEM_CONTA: 'Esta conta não é do Vagas sem Caos.',
    SO_PESSOA: 'Esta área é para quem procura emprego.',
    SO_EMPRESA: 'Esta área é para empresas.',
    SEM_PERMISSAO: 'Sem permissão.',
    CIDADE_FECHADA: 'Ainda não chegamos a esta cidade. Entre na lista de espera.',
    VAGA_FORA: 'Vaga não encontrada ou já encerrada.',
    BLOQUEADO: 'Muitas tentativas. Tente de novo mais tarde.',
    DADOS_INVALIDOS: 'Dados inválidos. Confira os campos.',
    NUNCA_PAGUE: 'Nunca pague para se candidatar. Se alguém pedir em nosso nome, é golpe.',
    // Sem DDD de exemplo (nenhuma cidade fixa em texto): a mesma do banco e de conteudo/vagas-textos (validacao.whatsapp_invalido).
    WHATSAPP_INVALIDO: 'WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).',
    CONVITE_INVALIDO: 'Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.'
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Filtro de textos (igual a vagas_interno.padroes_proibidos / tipos_do_contexto / msg_texto / conferir_texto)
  // ---------------------------------------------------------------------------------------------------------------

  var PADROES = [
    [10, 'golpe', 'normal', ' taxas? '],
    [11, 'golpe', 'normal', ' pix '],
    [12, 'golpe', 'normal', ' (?:deposite|depositem|depositar|faca um deposito|fazer um deposito|transfira|transferencia bancaria) '],
    [13, 'golpe', 'normal', ' (?:pague|paguem|pagar (?:a|uma) (?:taxa|inscricao|matricula|mensalidade)|pagamento antecipado|valor da inscricao|inscricao paga|cadastro pago|curso pago|kit pago|investimento inicial) '],
    [20, 'contato', 'bruto', '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}'],
    [21, 'contato', 'bruto', '(?:\\d[\\s().-]*){8,}'],
    [22, 'contato', 'bruto', '(?:^|[\\s(])@[a-z0-9_.]{3,}'],
    [30, 'link', 'bruto', '(?:https?://|www\\.)[^\\s]*'],
    [31, 'link', 'bruto', '[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:com|net|org|br|ly|me|gl|gd|co|io|to|info|biz|xyz|site|online|app|link|click|top|vip|tk|page|lat|shop|store)(?![a-z0-9])(?:/[^\\s]*)?'],
    [40, 'documento', 'normal', ' (?:cpf|rg|identidade|selfie|senha|titulo de eleitor|dados bancarios|conta bancaria|cartao de credito|numero do cartao|foto (?:do|da|de) (?:documento|identidade|rosto)|comprovante de (?:residencia|endereco|renda)|codigo de (?:verificacao|seguranca|confirmacao|acesso)|(?:manda|mande|envie|enviar|mandar) (?:seus|seu|os|o|teus|teu) documentos?) '],
    [50, 'discriminacao', 'normal', ' (?:aparencia|boa apresentacao|bonit[ao]s?|magr[ao]s?) '],
    [51, 'discriminacao', 'normal', ' (?:idade|faixa etaria) '],
    [52, 'discriminacao', 'normal', ' ate (?:1[6-9]|[2-6][0-9]) anos '],
    [53, 'discriminacao', 'normal', ' (?:entre|de) (?:1[6-9]|[2-6][0-9]) (?:a|e) (?:1[6-9]|[2-7][0-9]) anos '],
    [54, 'discriminacao', 'normal', ' (?:solteir[ao]s?|casad[ao]s?|divorciad[ao]s?|viuv[ao]s?|estado civil) '],
    [55, 'discriminacao', 'normal', ' (?:filh[ao]s?|gravid[ao]s?|gravidez|gestante) '],
    [56, 'discriminacao', 'normal', ' (?:sexo|genero|(?:somente|apenas|so) (?:para )?(?:mulher|mulheres|homem|homens|moca|mocas|rapaz|rapazes)) '],
    [57, 'discriminacao', 'normal', ' (?:religi[a-z]*|evangelic[ao]s?|catolic[ao]s?|cor da pele|raca|etnia) '],
    [58, 'discriminacao', 'normal', ' (?:nacionalidade|estrangeir[ao]s?|venezuelan[ao]s?|(?:somente|apenas|so) (?:para )?brasileir[ao]s?) '],
    [59, 'discriminacao', 'normal', ' (?:antecedentes?|nada consta|ficha limpa|ficha criminal|certidao criminal) '],
    [60, 'discriminacao', 'normal', ' (?:deficien[a-z]*|pcd) '],
    [61, 'discriminacao', 'normal', ' (?:boa saude|saude perfeita|doenc[a-z]*|hiv) ']
  ].map(function (p) {
    // \s do Postgres (locale C) = espaços ASCII; no JS o \s também pega espaços Unicode: troca pelos mesmos 6.
    return { ordem: p[0], tipo: p[1], alvo: p[2], padrao: p[3], re: new RegExp(p[3].replace(/\\s/g, ' \\t\\n\\r\\f\\v')) };
  });

  var CONTEXTOS = {
    anuncio: ['golpe', 'contato', 'link', 'discriminacao'],
    empresa: ['golpe', 'contato', 'link', 'discriminacao'],
    mensagem: ['golpe', 'contato', 'link', 'documento', 'discriminacao'],
    referencia: ['golpe', 'contato', 'link', 'discriminacao'],
    cartao: ['contato', 'link'],
    perfil: ['link']
  };
  function tiposDoContexto(ctx) { return Object.prototype.hasOwnProperty.call(CONTEXTOS, ctx) ? CONTEXTOS[ctx].slice() : []; }

  function mensagemTexto(tipo, trecho, ctx) {
    if (ctx === 'mensagem') {
      if (tipo === 'golpe') return 'Mensagem bloqueada: ninguém paga para concorrer a uma vaga. Pedido de taxa, Pix ou depósito é golpe; se alguém pedir, denuncie.';
      if (tipo === 'contato') return 'Mensagem bloqueada: telefone, e-mail e redes sociais só depois do Combinou, que libera o contato com segurança.';
      if (tipo === 'link') return 'Mensagem bloqueada: não dá para mandar links por aqui.';
      if (tipo === 'documento') return 'Mensagem bloqueada: não peça nem mande documento, senha, código ou dados de banco por aqui. Se alguém pedir, denuncie.';
      return 'Mensagem bloqueada: aqui não se pergunta nem se conta idade, aparência, estado civil, filhos, religião, cor, nacionalidade, saúde ou antecedentes (Lei 9.029/1995).';
    }
    if (tipo === 'golpe') return 'Tire o trecho "' + trecho + '": ninguém paga para concorrer a uma vaga, então taxa, Pix e depósito não podem aparecer.';
    if (tipo === 'contato') return 'Tire o telefone, e-mail ou perfil de rede social ("' + trecho + '"): o contato acontece pela plataforma, depois do Combinou.';
    if (tipo === 'link') return 'Tire o link "' + trecho + '": o contato acontece pela plataforma.';
    if (tipo === 'documento') return 'Tire o pedido de documento ("' + trecho + '").';
    if (ctx === 'referencia') {
      return 'Tire o trecho "' + trecho + '": a referência não pode falar de aparência, idade, sexo, estado civil, filhos, religião, cor, nacionalidade, deficiência, saúde ou antecedentes (Lei 9.029/1995).';
    }
    return 'Tire o trecho "' + trecho + '": o texto não pode pedir aparência, idade, sexo, estado civil, filhos, religião, cor, nacionalidade, deficiência, saúde ou antecedentes (Lei 9.029/1995 e CLT, art. 373-A).';
  }

  var ACENTOS_DE = 'ÁÀÂÃÄÅáàâãäåÇçÉÈÊËéèêëÍÌÎÏíìîïÑñÓÒÔÕÖóòôõöÚÙÛÜúùûüÝýÿ';
  var ACENTOS_PARA = 'aaaaaaaaaaaacceeeeeeeeiiiiiiiinnoooooooooouuuuuuuuyyy';
  var MAPA_ACENTOS = {};
  for (var ia = 0; ia < ACENTOS_DE.length; ia++) MAPA_ACENTOS[ACENTOS_DE.charAt(ia)] = ACENTOS_PARA.charAt(ia);

  // Minúsculas só em A-Z (como o lower() do Postgres no locale C).
  function minusculasAscii(s) { return s.replace(/[A-Z]/g, function (c) { return c.toLowerCase(); }); }

  function normalizar(p) {
    var s = String(p == null ? '' : p).replace(/[\s\S]/g, function (c) { return MAPA_ACENTOS[c] || c; });
    return minusculasAscii(s).replace(/[^a-z0-9]+/g, ' ').replace(/^ +| +$/g, '');
  }

  function conferirTexto(p, ctx) {
    var t = String(p == null ? '' : p);
    if (!t.replace(/^ +| +$/g, '')) return null;
    var n = ' ' + normalizar(t) + ' ';
    var b = minusculasAscii(t);
    var tipos = tiposDoContexto(ctx);
    for (var i = 0; i < PADROES.length; i++) {
      var pd = PADROES[i];
      if (tipos.indexOf(pd.tipo) < 0) continue;
      var m = (pd.alvo === 'bruto' ? b : n).match(pd.re);
      if (m) {
        var trecho = m[0].replace(/^[ ()\-.]+|[ ()\-.]+$/g, '').slice(0, 60);
        return { tipo: pd.tipo, trecho: trecho, erro: mensagemTexto(pd.tipo, trecho, ctx) };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Documentos e contatos
  // ---------------------------------------------------------------------------------------------------------------

  function normalizarCnpj(p) { return String(p == null ? '' : p).replace(/[^0-9A-Za-z]/g, '').toUpperCase(); }

  // CNPJ numérico ou alfanumérico (IN RFB 2.229/2024): valor de cada caractere = código ASCII − 48; módulo 11.
  function cnpjValido(p) {
    var c = normalizarCnpj(p);
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
    function dv(s, pesos) {
      var soma = 0;
      for (var i = 0; i < pesos.length; i++) soma += (s.charCodeAt(i) - 48) * pesos[i];
      var r = soma % 11;
      return r < 2 ? 0 : 11 - r;
    }
    var d1 = dv(c, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (d1 !== Number(c.charAt(12))) return false;
    return dv(c, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(c.charAt(13));
  }

  function formatarCnpj(p) {
    var c = normalizarCnpj(p);
    if (c.length !== 14) return c;
    return c.slice(0, 2) + '.' + c.slice(2, 5) + '.' + c.slice(5, 8) + '/' + c.slice(8, 12) + '-' + c.slice(12);
  }

  function normalizarWhatsapp(p) {
    var d = String(p == null ? '' : p).replace(/[^0-9]/g, '');
    if (d.length === 10 || d.length === 11) return '55' + d;
    if ((d.length === 12 || d.length === 13) && d.slice(0, 2) === '55') return d;
    return '';
  }
  function whatsappCelularValido(d) { return /^55[1-9][1-9]9[0-9]{8}$/.test(String(d || '')); }
  function whatsappEmpresaValido(d) { return /^55[1-9][1-9][0-9]{8,9}$/.test(String(d || '')); }

  function normalizarEmail(p) {
    var e = String(p == null ? '' : p).replace(/^\s+|\s+$/g, '').toLowerCase();
    return e.length <= 254 && /^[!-?A-~]+@[!-?A-~]+\.[!-?A-~]+$/.test(e) ? e : '';   // só ASCII visível, igual ao banco
  }

  // Igual a disc_interno.nome_valido: pelo menos 2 palavras com letra e no mínimo 5 letras.
  function letras(s) { var m = String(s || '').match(/\p{L}/gu); return m ? m.length : 0; }
  function nomeValido(p) {
    var palavras = String(p || '').split(' ').filter(function (w) { return letras(w) > 0; });
    return palavras.length >= 2 && letras(p) >= 5;
  }
  function nomeExibicao(p) {
    var w = String(p || '').replace(/^\s+|\s+$/g, '').split(/\s+/).filter(Boolean);
    if (!w.length) return '';
    if (w.length === 1) return w[0];
    return w[0] + ' ' + w[w.length - 1].charAt(0).toUpperCase() + '.';
  }
  function iniciais(p) {
    return normalizar(p).split(' ').filter(function (w) { return /^[a-z]/.test(w) && ['de', 'da', 'do', 'das', 'dos', 'e'].indexOf(w) < 0; })
      .slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('');
  }
  // limpar_texto do banco: controles viram espaço, espaços juntos, apara e corta.
  function limparTexto(p, max) {
    var s = String(p == null ? '' : p).replace(/[\u0001-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').replace(/^ +| +$/g, '');
    return max && s.length > max ? s.slice(0, max).replace(/ +$/, '') : s;
  }
  function limparMultilinha(p, max) {
    var s = String(p == null ? '' : p).replace(/\r\n/g, '\n').replace(/[\u0001-\u0009\u000B-\u001F\u007F]/g, ' ')
      .replace(/ {2,}/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^[ \n]+|[ \n]+$/g, '');
    return s.slice(0, max);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Datas e valores
  // ---------------------------------------------------------------------------------------------------------------

  function lerMes(p) {
    var m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(p == null ? '' : p).trim());
    return m ? { ano: Number(m[1]), mes: Number(m[2]), texto: m[0] } : null;
  }
  function numeroMes(m) { return m.ano * 12 + m.mes; }
  function mesAtual(agora) { var d = new Date(agora == null ? Date.now() : agora); return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 }; }
  // Meses de uma experiência, contando início e fim (sem fim = até o mês atual), mínimo 1.
  function meses(inicio, fim, agora) {
    var a = typeof inicio === 'string' ? lerMes(inicio) : inicio;
    var b = fim ? (typeof fim === 'string' ? lerMes(fim) : fim) : mesAtual(agora);
    if (!a || !b) return 0;
    return Math.max(1, numeroMes(b) - numeroMes(a) + 1);
  }
  // Data no fuso da cidade (o campo "fuso" dela); sem fuso, o horário de Brasília (America/Sao_Paulo, UTC−3), como o banco.
  function hoje(fuso, agora) {
    var d = new Date(agora == null ? Date.now() : agora);
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: fuso || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch (e) {
      return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
    }
  }
  function somarDias(dataIso, n) {
    var d = new Date(dataIso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function reais(c) {
    var v = (Number(c) || 0) / 100;
    var partes = v.toFixed(2).split('.');
    return 'R$ ' + partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + partes[1];
  }
  function formatarValor(v) {
    if (!v) return '';
    var base = reais(v.minCentavos) + (v.maxCentavos != null && v.maxCentavos !== v.minCentavos ? ' a ' + reais(v.maxCentavos) : '');
    return base + (UNIDADES[v.unidade] ? ' ' + UNIDADES[v.unidade] : '');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Leitura dos formulários (mesmas mensagens das RPCs)
  // ---------------------------------------------------------------------------------------------------------------

  function ids(l) { return l.map(function (x) { return typeof x === 'string' ? x : x.id; }); }
  function texto(v) { return v == null ? '' : (typeof v === 'object' ? '[object Object]' : String(v)); }
  function inteiro(v) {
    if (typeof v === 'number' && Number.isInteger(v) && Math.abs(v) < 1e9) return v;
    if (typeof v === 'string' && /^-?\d{1,9}$/.test(v.trim())) return Number(v.trim());
    return null;
  }
  function listaEnum(v, permitidos) {
    var arr = Array.isArray(v) ? v.map(String) : (typeof v === 'string' ? [v] : []);
    return ids(permitidos).filter(function (p) { return arr.indexOf(p) >= 0; });
  }
  function listaTexto(v, max) {
    var vistos = {};
    var saida = [];
    (Array.isArray(v) ? v : []).forEach(function (e) {
      if (typeof e !== 'string') return;
      var t = limparTexto(e, max);
      var k = t.toLowerCase();
      if (t && !vistos[k]) { vistos[k] = true; saida.push(t); }
    });
    return saida;
  }
  function falha(erro) { return { ok: false, erro: erro }; }

  // vagas_pessoa_salvar (sem as consultas a cidade/zona, que dependem dos dados: feitas por quem chama).
  function lerPessoa(d, agora) {
    d = d && typeof d === 'object' ? d : {};
    if (d.maior18 !== true) return falha('Para se cadastrar é preciso ter 18 anos ou mais.');
    var cargos = listaTexto(d.cargos, 60);
    if (cargos.length < 1 || cargos.length > 5) return falha('Escolha de 1 a 5 funções que você procura.');
    if (ids(ESCOLARIDADES).indexOf(texto(d.escolaridade)) < 0) return falha('Escolha a sua escolaridade.');
    var turnos = listaEnum(d.turnos, TURNOS);
    if (!turnos.length) return falha('Marque pelo menos um turno em que pode trabalhar.');
    var mods = listaEnum(d.modalidades, MODALIDADES);
    if (!mods.length) return falha('Marque pelo menos um tipo de vaga (CLT, temporário, diária, freelancer ou estágio).');
    var pret = null;
    if (d.pretensaoCentavos != null && texto(d.pretensaoCentavos) !== '') {
      pret = inteiro(d.pretensaoCentavos);
      if (pret === null || pret < 0 || pret > 10000000) return falha('Pretensão salarial inválida.');
    }
    var cursos = listaTexto(d.cursos, 80);
    if (cursos.length > 10) return falha('Informe até 10 cursos.');
    var areasIn = chave(d, 'areas', 'areasInteresse');
    var areas = areasIn === undefined ? null : listaEnum(areasIn, AREAS);
    if (areas && areas.length > 3) return falha('Escolha até 3 áreas de interesse.');
    var sobre = texto(d.sobre);
    if (sobre.length > 600) return falha('O texto "Sobre você" pode ter até 600 caracteres.');
    var nome = limparTexto(texto(d.nome), 120);
    if (!nomeValido(nome)) return falha('Informe seu nome e sobrenome.');
    var whats = normalizarWhatsapp(texto(d.whatsapp));
    if (!whatsappCelularValido(whats)) return falha(MSG.WHATSAPP_INVALIDO);
    var email = '';
    if (texto(d.email).trim()) {
      email = normalizarEmail(d.email);
      if (!email) return falha('E-mail de contato inválido.');
    }
    var exps = d.experiencias == null ? [] : d.experiencias;
    if (!Array.isArray(exps)) return falha('Experiências inválidas.');
    if (exps.length > 10) return falha('Informe até 10 experiências.');
    var atual = mesAtual(agora);
    var lidas = [];
    for (var i = 0; i < exps.length; i++) {
      var x = exps[i];
      if (!x || typeof x !== 'object') return falha('Experiências inválidas.');
      var funcao = limparTexto(texto(x.funcao), 80);
      if (funcao.length < 2) return falha('Informe a função de cada experiência.');
      var ini = lerMes(texto(x.inicio));
      if (!ini) return falha('Informe o mês de início de cada experiência (AAAA-MM).');
      if (numeroMes(ini) > numeroMes(atual)) return falha('O início de uma experiência não pode estar no futuro.');
      var fim = null;
      if (texto(x.fim).trim()) {
        fim = lerMes(texto(x.fim));
        if (!fim) return falha('Mês de saída inválido (AAAA-MM).');
        if (numeroMes(fim) < numeroMes(ini)) return falha('A saída não pode ser antes do início.');
        if (numeroMes(fim) > numeroMes(atual)) return falha('A saída não pode estar no futuro.');
      }
      lidas.push({ funcao: funcao, empregador: limparTexto(texto(x.empregador), 120), inicio: ini.texto, fim: fim ? fim.texto : '',
        informal: x.informal === true ? true : x.informal === null ? null : false });   // null = prefiro não dizer; sem a chave, false
    }
    var campos = { cargos: cargos, escolaridade: texto(d.escolaridade), turnos: turnos, cnh: listaEnum(d.cnh, CNH), modalidades: mods,
      pretensaoCentavos: pret, cursos: cursos, areas: areas, sobre: limparMultilinha(sobre, 600), nome: nome, whatsapp: whats, email: email, experiencias: lidas };
    var conf = null;
    cargos.concat(cursos).concat(lidas.map(function (e) { return e.funcao; })).some(function (t) { conf = conferirTexto(t, 'cartao'); return conf; });
    if (!conf) lidas.some(function (e) { conf = conferirTexto(e.empregador, 'perfil'); return conf; });
    if (!conf) conf = conferirTexto(campos.sobre, 'perfil');
    if (conf) return falha(conf.erro);
    return { ok: true, campos: campos };
  }

  // vagas_lista_espera_entrar (sem a consulta da cidade): e-mail obrigatório; WhatsApp opcional (celular com DDD, só algarismos).
  function lerListaEspera(d) {
    d = d && typeof d === 'object' ? d : {};
    var email = normalizarEmail(d.email);
    if (!email) return falha('E-mail inválido.');
    var whats = '';
    if (texto(d.whatsapp).trim()) {
      whats = normalizarWhatsapp(texto(d.whatsapp));
      if (!whatsappCelularValido(whats)) return falha(MSG.WHATSAPP_INVALIDO);
    }
    return { ok: true, campos: { cidade: texto(d.cidade).trim().toLowerCase(), email: email, perfil: d.perfil === 'empresa' ? 'empresa' : 'pessoa',
      whatsapp: whats } };
  }

  // Cor de um indicador pela regra de conteudo/vagas-operacao/indicadores.json (igual a vagas_interno.indicador_cor):
  // maior é melhor — 'ok' (atingiu), 'atencao' (70% ou mais do alvo), 'alerta'; menor é melhor — 'ok' (até o alvo),
  // 'atencao' (até 1,3 vez), 'alerta'. Sem valor ou sem alvo: null.
  function corIndicador(valor, alvo, direcao) {
    if (valor === null || valor === undefined || alvo === null || alvo === undefined) return null;
    var v = Number(valor);
    var a = Number(alvo);
    if (direcao === 'menor_melhor') return v <= a ? 'ok' : (v <= a * 1.3 ? 'atencao' : 'alerta');
    return v >= a ? 'ok' : (v >= a * 0.7 ? 'atencao' : 'alerta');
  }

  // vagas_interno.ler_empresa (sem a consulta de CNPJ repetido e da cidade).
  function lerEmpresa(d) {
    d = d && typeof d === 'object' ? d : {};
    var cnpj = normalizarCnpj(texto(d.cnpj));
    if (!cnpjValido(cnpj)) return falha('CNPJ inválido. Confira os números.');
    var razao = limparTexto(texto(d.razaoSocial), 160);
    if (razao.length < 2) return falha('Informe a razão social.');
    var fant = limparTexto(texto(d.nomeFantasia), 120);
    if (fant.length < 2) fant = razao.slice(0, 120);
    var desc = texto(d.descricao);
    if (desc.length > 800) return falha('A descrição pode ter até 800 caracteres.');
    var whats = '';
    if (texto(d.whatsapp).trim()) {
      whats = normalizarWhatsapp(texto(d.whatsapp));
      if (!whatsappEmpresaValido(whats)) return falha('WhatsApp da empresa inválido.');
    }
    var email = '';
    if (texto(d.email).trim()) {
      email = normalizarEmail(d.email);
      if (!email) return falha('E-mail da empresa inválido.');
    }
    var campos = { cnpj: cnpj, mei: d.mei === true, razaoSocial: razao, nomeFantasia: fant, setor: limparTexto(texto(d.setor), 80),
      descricao: limparMultilinha(desc, 800), whatsapp: whats, email: email };
    var conf = conferirTexto(fant, 'cartao') || conferirTexto(razao, 'cartao') || conferirTexto(campos.setor, 'cartao') ||
      conferirTexto(campos.descricao, 'empresa');
    if (conf) return falha(conf.erro);
    return { ok: true, campos: campos };
  }

  // vagas_interno.ler_anuncio + as regras do gatilho (diária nos próximos 7 dias e filtro de textos). hojeIso = hoje na cidade.
  // Chaves do contrato (camelCase); aceita também as do design em snake_case (salario_de, fim_de_semana, inicio_data...).
  function chave(d) {
    // Como no banco (o JSON não leva chave com undefined): a primeira chave presente com valor definido.
    for (var i = 1; i < arguments.length; i++) if (Object.prototype.hasOwnProperty.call(d, arguments[i]) && d[arguments[i]] !== undefined) return d[arguments[i]];
    return undefined;
  }
  function lerAnuncio(d, hojeIso) {
    d = d && typeof d === 'object' ? d : {};
    var area = texto(d.area).trim().toLowerCase();
    if (ids(AREAS).indexOf(area) < 0) return falha('Escolha a área da vaga.');
    var funcao = limparTexto(texto(d.funcao), 60);
    if (funcao.length < 2) return falha('Informe a função (ex.: Atendente).');
    var mod = texto(d.modalidade);
    if (ids(MODALIDADES).indexOf(mod) < 0) return falha('Escolha o tipo de vaga: CLT, temporário, diária, freelancer ou estágio.');
    var qtd = inteiro(d.quantidade); if (qtd === null) qtd = 1;
    if (qtd < 1 || qtd > 100) return falha('Quantidade de vagas inválida (1 a 100).');
    var turno = texto(d.turno);
    if (ids(TURNOS_VAGA).indexOf(turno) < 0) return falha('Escolha o turno da vaga.');
    var exp = texto(d.experiencia);
    if (/^(ate_1|1_a_3|mais_3)$/.test(exp)) exp = '6_meses';
    if (ids(EXPERIENCIAS_VAGA).indexOf(exp) < 0) return falha('Escolha a experiência que a vaga pede.');
    var esc = texto(d.escolaridade).trim() || 'nao_exigida';
    if (ids(ESCOLARIDADES_VAGA).indexOf(esc) < 0) return falha('Escolaridade mínima inválida.');
    var req = listaEnum(d.requisitos, REQUISITOS_VAGA);
    var outro = texto(chave(d, 'requisitoOutro', 'requisito_outro'));
    if (outro.length > 80) return falha('O requisito "Outro" pode ter até 80 caracteres.');
    outro = limparTexto(outro, 80);
    if (req.indexOf('outro') >= 0 && !outro) return falha('Escreva qual é o outro requisito.');
    if (outro && req.indexOf('outro') < 0) req = listaEnum(req.concat('outro'), REQUISITOS_VAGA);
    var selo = texto(d.selo).trim().toLowerCase();
    if (selo === '' || selo === 'nenhum') selo = null;
    if (selo && ids(TESTES_SELO).indexOf(selo) < 0) return falha('Escolha um dos testes da plataforma ou "nenhum".');
    var ben = listaEnum(d.beneficios, BENEFICIOS);
    if (d.comissao === true && ben.indexOf('comissao') < 0) ben = listaEnum(ben.concat('comissao'), BENEFICIOS);
    var comissao = ben.indexOf('comissao') >= 0;
    var uni = texto(chave(d, 'valorUnidade', 'valor_unidade')).trim() || (mod === 'diaria' ? 'dia' : mod === 'freelancer' ? 'servico' : 'mes');
    var min = inteiro(chave(d, 'salarioDe', 'salario_de'));
    var max = inteiro(chave(d, 'salarioAte', 'salario_ate'));
    if (min === null || min < 100) {
      return falha(mod === 'estagio' ? 'Informe o valor da bolsa.' : mod === 'diaria' ? 'Informe a data, o horário e o valor da diária.'
        : mod === 'freelancer' ? 'Informe o valor do serviço.' : 'Informe o salário ou a faixa salarial.');
    }
    if (min > 10000000 || (max || 0) > 10000000) return falha('Valor alto demais. Confira o salário.');
    if (max !== null && max < min) return falha('O valor máximo da faixa não pode ser menor que o mínimo.');
    var uniOk = (['clt', 'temporario', 'estagio'].indexOf(mod) >= 0 && (uni === 'mes' || uni === 'hora')) || (mod === 'diaria' && uni === 'dia') ||
      (mod === 'freelancer' && ['servico', 'hora', 'dia'].indexOf(uni) >= 0);
    if (!uniOk) return falha('Unidade do valor inválida para este tipo de vaga.');
    var desc = texto(d.descricao);
    if (desc.length > 1500) return falha('A descrição pode ter até 1.500 caracteres.');
    desc = limparMultilinha(desc, 1500);
    if (desc.length < 40) return falha('Descreva a vaga em pelo menos 40 caracteres.');
    var horas = null;
    if (mod === 'estagio') {
      horas = inteiro(chave(d, 'horasDia', 'horas_dia'));
      if (horas === null || horas < 1 || horas > 6) return falha('Informe as horas por dia do estágio (até 6).');
    }
    var reData = function (v) {
      var t = texto(v).trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(Date.parse(t + 'T00:00:00Z')) && new Date(t + 'T00:00:00Z').toISOString().slice(0, 10) === t ? t : null;
    };
    var dias = inteiro(chave(d, 'diasNoAr', 'dias_no_ar')); if (dias === null) dias = 30;
    var prazo = null, data = null, hi = null, hf = null;
    var inicio = texto(d.inicio).trim() || 'imediato';
    var inicioData = null;
    if (mod === 'diaria') {
      data = reData(chave(d, 'data', 'dataTrabalho'));
      var reH = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
      var h1 = texto(chave(d, 'horaInicio', 'hora_inicio')).trim();
      var h2 = texto(chave(d, 'horaFim', 'hora_fim')).trim();
      if (reH.test(h1)) hi = h1;
      if (reH.test(h2)) hf = h2;
      if (!data || !hi || !hf) return falha('Informe a data, o horário e o valor da diária.');
      prazo = inteiro(chave(d, 'prazoHoras', 'prazo_horas')); if (prazo === null) prazo = 48;
      if (prazo < 48 || prazo > 168) return falha('A diária fica no ar de 48 a 168 horas.');
      if (hojeIso) {
        if (data < hojeIso) return falha('A data da diária já passou. Escolha outra data.');
        if (data > somarDias(hojeIso, 7)) return falha('A diária precisa ser para os próximos 7 dias.');
      }
      inicio = 'data';
      inicioData = data;
      dias = 30;
    } else {
      if (dias < 7 || dias > 60) return falha('Escolha de 7 a 60 dias no ar.');
      if (inicio !== 'imediato' && inicio !== 'data') return falha('Escolha quando a pessoa começa.');
      if (inicio === 'data') {
        inicioData = reData(chave(d, 'inicioData', 'inicio_data'));
        if (!inicioData) return falha('Informe a data de início (AAAA-MM-DD).');
        if (hojeIso && inicioData < hojeIso) return falha('A data de início não pode estar no passado.');
      }
    }
    var campos = { area: area, funcao: funcao, titulo: funcao, modalidade: mod, quantidade: qtd, turno: turno,
      fimDeSemana: chave(d, 'fimDeSemana', 'fim_de_semana') === true, comissao: comissao, inicio: inicio, inicioData: inicioData,
      experiencia: exp, escolaridade: esc, requisitos: req, requisitoOutro: outro, selo: selo, beneficios: ben, descricao: desc,
      valor: { minCentavos: min, maxCentavos: max, unidade: uni }, diasNoAr: dias, prazoHoras: prazo, horasDia: horas,
      diaria: data ? { data: data, inicio: hi, fim: hf } : null, confidencial: d.confidencial === true };
    var conf = null;
    [funcao, desc, outro].some(function (t) { conf = conferirTexto(t, 'anuncio'); return conf; });
    if (conf) return falha(conf.erro);
    return { ok: true, campos: campos };
  }

  // vagas_referencia_oferecer (só o conteúdo).
  function lerReferencia(d, agora) {
    d = d && typeof d === 'object' ? d : {};
    var funcao = limparTexto(texto(d.funcao), 80);
    if (funcao.length < 2) return falha('Informe a função que a pessoa exercia.');
    if (ids(VINCULOS).indexOf(texto(d.vinculo)) < 0) return falha('Escolha o tipo de vínculo.');
    var ini = lerMes(texto(d.inicio));
    if (!ini) return falha('Informe o mês de início (AAAA-MM).');
    var atual = mesAtual(agora);
    if (numeroMes(ini) > numeroMes(atual)) return falha('O início não pode estar no futuro.');
    var fim = null;
    if (texto(d.fim).trim()) {
      fim = lerMes(texto(d.fim));
      if (!fim) return falha('Mês de saída inválido (AAAA-MM).');
      if (numeroMes(fim) < numeroMes(ini)) return falha('A saída não pode ser antes do início.');
      if (numeroMes(fim) > numeroMes(atual)) return falha('A saída não pode estar no futuro.');
    }
    var pontos = listaEnum(d.pontosFortes, PONTOS_FORTES);
    if (pontos.length < 1 || pontos.length > 3) return falha('Escolha de 1 a 3 pontos fortes.');
    var rec = listaTexto(d.recomendaPara, 60);
    if (rec.length > 5) return falha('Escolha até 5 funções em "Recomendaria para".');
    var tx = texto(d.texto);
    if (tx.length > 300) return falha('O texto pode ter até 300 caracteres.');
    tx = limparTexto(tx, 300);
    if (d.declaracao !== true) return falha('Confirme a declaração de que a pessoa trabalhou na empresa no período informado.');
    var conf = null;
    [funcao].concat(rec).some(function (t) { conf = conferirTexto(t, 'cartao'); return conf; });
    if (!conf) conf = conferirTexto(tx, 'referencia');
    if (conf) return falha(conf.erro);
    return { ok: true, campos: { funcao: funcao, vinculo: texto(d.vinculo), inicio: ini.texto, fim: fim ? fim.texto : '', pontosFortes: pontos,
      recomendaPara: rec, texto: tx } };
  }

  var VAGAS_REGRAS = {
    VERSAO_TERMOS: VERSAO_TERMOS, MODALIDADES: MODALIDADES, VINCULOS: VINCULOS, TURNOS: TURNOS, ESCOLARIDADES: ESCOLARIDADES, CNH: CNH,
    UNIDADES: UNIDADES, AREAS: AREAS, TURNOS_VAGA: TURNOS_VAGA, EXPERIENCIAS_VAGA: EXPERIENCIAS_VAGA,
    ESCOLARIDADES_VAGA: ESCOLARIDADES_VAGA, REQUISITOS_VAGA: REQUISITOS_VAGA, BENEFICIOS: BENEFICIOS, TESTES_SELO: TESTES_SELO,
    PONTOS_FORTES: PONTOS_FORTES, MOTIVOS_DENUNCIA: MOTIVOS_DENUNCIA, MOTIVOS_DENUNCIA_TELA: MOTIVOS_DENUNCIA_TELA, TEXTO_STATUS: TEXTO_STATUS,
    STATUS_CANDIDATURA: STATUS_CANDIDATURA,
    STATUS_ANUNCIO: STATUS_ANUNCIO, STATUS_EMPRESA: STATUS_EMPRESA, STATUS_REFERENCIA: STATUS_REFERENCIA,
    STATUS_REFERENCIA_EMPRESA: STATUS_REFERENCIA_EMPRESA, MSG: MSG, PAPEIS_EMPRESA: PAPEIS_EMPRESA,
    STATUS_CONVITE_EQUIPE: STATUS_CONVITE_EQUIPE, PORTES: PORTES, CORES_INDICADOR: CORES_INDICADOR, INDICADORES: INDICADORES, GATILHOS: GATILHOS,
    lerListaEspera: lerListaEspera, corIndicador: corIndicador,
    PADROES: PADROES, tiposDoContexto: tiposDoContexto, mensagemTexto: mensagemTexto, conferirTexto: conferirTexto, normalizar: normalizar,
    normalizarCnpj: normalizarCnpj, cnpjValido: cnpjValido, formatarCnpj: formatarCnpj, normalizarWhatsapp: normalizarWhatsapp,
    whatsappCelularValido: whatsappCelularValido, whatsappEmpresaValido: whatsappEmpresaValido, normalizarEmail: normalizarEmail,
    nomeValido: nomeValido, nomeExibicao: nomeExibicao, iniciais: iniciais, limparTexto: limparTexto, limparMultilinha: limparMultilinha,
    lerMes: lerMes, meses: meses, hoje: hoje, somarDias: somarDias, reais: reais, formatarValor: formatarValor, inteiro: inteiro,
    listaEnum: listaEnum, listaTexto: listaTexto, lerPessoa: lerPessoa, lerEmpresa: lerEmpresa, lerAnuncio: lerAnuncio, lerReferencia: lerReferencia,
    rotulo: function (lista, id) { for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i].rotulo; return ''; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = VAGAS_REGRAS;
  else root.VAGAS_REGRAS = VAGAS_REGRAS;
})(typeof self !== 'undefined' ? self : this);
