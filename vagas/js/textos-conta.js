/*
 * GERADO por scripts/montar-vagas.mjs a partir de conteudo/vagas-textos/avisos.json, consentimentos.json e moderacao.json. NÃO EDITE AQUI: edite a origem e rode
 * "node scripts/montar-vagas.mjs" (o npm test confere que está em dia).
 *
 * Acrescenta a VAGAS_TEXTOS (carregue depois de textos.js), para as telas com conta e entrar.html:
 *   avisos.* que só as telas com conta usam (somados aos de textos.js), anuncio.* (titulo_erro, lei_resumo, campos.*),
 *   referencia.* (vinculos, validacao.*), mensagem.* e foto.* de avisos.json;
 *   consentimentos.termosVersao e consentimentos.aceites[chave] = {versao, quem, titulo, texto, explicacao, obrigatorio, ...};
 *   moderacao.motivos[chave] = {alvo, acao, titulo, texto_empresa, correcao, lei} (a chave é o p_motivo das RPCs vagas_op_*).
 *   VAGAS_TEXTOS.t('consentimentos.aceites.pessoa_cadastro.texto') também funciona.
 */
(function (root) {
  'use strict';
  var DADOS = {
 "avisos": {
  "nunca_pague_longo": "Concorrer é grátis, sempre. Ninguém pode cobrar de você para se candidatar: nem taxa, nem curso, nem exame, nem uniforme. Documento, só na contratação, depois de conhecer a empresa. Nunca passe código que chegou por SMS. Se alguém pedir em nosso nome, é golpe: denuncie aqui.",
  "gratis_para_sempre": "Grátis para quem procura trabalho. Sempre.",
  "cartao_cego": "A empresa vê só este cartão: sem nome, sem foto, sem idade, sem contato. Seu nome (e a sua foto, se você enviou) aparece só se você aceitar conversar.",
  "cartao_cego_empresa": "Cartão sem nome e sem contato, por ordem de chegada. Nome e WhatsApp aparecem quando a pessoa aceitar conversar.",
  "cartao_cego_ordem": "Os cartões aparecem por ordem de chegada, sem ordem do melhor para o pior: quem decide é você.",
  "empresa_confidencial": "Vaga confidencial: o nome da empresa aparece para você quando você aceitar conversar, antes de o seu contato ser liberado. Você pode recusar sem que a empresa veja nada.",
  "empresa_confidencial_cartao": "Empresa confidencial · CNPJ conferido pela Gestão sem Caos",
  "empresa_confidencial_empresa": "Seu nome fica escondido no anúncio e aparece para a pessoa no momento em que ela aceita conversar. Só empresa com CNPJ conferido pode usar.",
  "empresa_conferida": "CNPJ conferido pela Gestão sem Caos",
  "empresa_em_analise": "Sua empresa está em análise. Conferimos o CNPJ em até 2 dias úteis e avisamos por e-mail. Enquanto isso você já pode escrever as vagas.",
  "vaga_em_revisao": "Suas 3 primeiras vagas passam por uma revisão rápida antes de ir ao ar (até 1 dia útil). Avisamos por e-mail.",
  "quero_enviado": "Candidatura enviada. A empresa recebeu o seu cartão sem nome. Se ela quiser conversar, você recebe um aviso.",
  "pular_feito": "Vaga pulada. Ela não aparece mais para você.",
  "candidatura_retirada": "Candidatura retirada. A empresa deixa de ver o seu cartão.",
  "combinou_pessoa": "Combinou! {{empresa_nome}} quer conversar com você. Agora os dois lados veem nome e contato. Ninguém pode cobrar de você para se candidatar. Documento, só na contratação. Nunca passe código que chegou por SMS.",
  "combinou_empresa": "Combinou! {{pessoa_nome}} aceitou conversar. Agora você vê o currículo completo e o contato. Use os dados só para esta vaga.",
  "combinou_convite": "{{empresa_nome}} quer conversar com você sobre a vaga de {{vaga_titulo}}. Se você aceitar, seu nome e seu WhatsApp aparecem para essa empresa, só para esta vaga.",
  "combinou_convite_confidencial": "Uma empresa quer conversar com você sobre a vaga de {{vaga_titulo}}. Ao tocar em \"Quero conversar\", você vê o nome da empresa e decide se libera o seu contato.",
  "combinou_revelada": "A empresa é {{empresa_nome}}. Quer liberar o seu contato para ela?",
  "combinou_recusado": "Tudo bem. A empresa não vê o seu nome nem o seu contato.",
  "combinou_agora_nao_empresa": "Marcado como \"Agora não\". A pessoa não é avisada e você pode mudar de ideia enquanto a vaga estiver no ar.",
  "combinou_contratada": "Marcada como contratada. Isso encerra a candidatura. Se quiser, a Gestão sem Caos oferece a integração de 90 dias, com o Mapa DISC, só depois da contratação.",
  "combinou_aguardando": "A empresa quer conversar. Falta você confirmar.",
  "combinou_quem_viu": "{{empresa_nome}} abriu o seu contato em {{data}}.",
  "combinou_ninguem_viu": "Nenhuma empresa abriu o seu contato ainda. Seu contato só aparece depois do Combinou.",
  "selo_descricao": "Selo: mostra o teste, a data, a nota com a margem e um código. É um teste de conhecimento prático da função, feito online, sem supervisão. Vale 12 meses.",
  "selo_emitido": "Selo emitido: {{teste_nome}}, {{data}}. Nota {{nota}} de 100 (15 questões; margem de cerca de ±{{margem}} pontos). Código {{codigo}}. Vale até {{valido_ate}}. Ele já aparece no seu cartão.",
  "selo_validade": "Vale 12 meses. Depois é só refazer, de graça.",
  "selo_refazer": "Você pode refazer o teste de graça 30 dias depois da última tentativa.",
  "selo_filtro_empresa": "Filtrar por \"tem selo\" mostra quem fez o teste da função. Não há nota mínima nem ordem por nota: quem lê e decide é você.",
  "selo_presencial": "Selo presencial: a mesma prova de conhecimento prático, feita no ponto da Gestão sem Caos, com documento conferido na hora (não guardamos cópia). Grátis nos mutirões.",
  "bico_mural": "Diária e bico: a plataforma é só um mural. Valor, horário e pagamento são combinados direto entre você e o contratante. Não pagamos nem cobramos nada.",
  "bico_contratante": "A plataforma não fixa valor, escala nem punição, não recebe pagamento e não fornece mão de obra temporária. O contrato é direto entre você e a pessoa.",
  "bico_diarista": "Diarista em casa mais de 2 dias por semana para a mesma família é empregado(a) doméstico(a), com carteira assinada (LC 150/2015).",
  "bico_valor_obrigatorio": "Informe a data, o horário e o valor do dia. Sem isso a diária não é publicada.",
  "bico_para_hoje": "Para hoje",
  "bico_prazo": "A diária fica no ar de 48 horas a 7 dias.",
  "bico_um_toque": "Diária não pede teste: é só tocar em \"Quero\". Se combinar, o contato aparece para os dois.",
  "bico_so_cnpj": "Nesta versão, só empresa ou MEI pode anunciar diária. Contratante pessoa física entra em breve.",
  "cidade_entorno": "Vagas de {{cidade}} e cidades vizinhas ({{vizinhas}}).",
  "mural_vazio": "Ainda não há vagas de {{funcao}} em {{cidade}}. Deixe o alerta ligado: avisamos quando aparecer.",
  "mural_vazio_empresa": "Ainda sem candidaturas. As pessoas estão vendo a vaga. Se quiser, compartilhe o link curto no WhatsApp.",
  "sessao_expirada": "Sua sessão venceu. Entre de novo para continuar. Nada do que você fez se perdeu.",
  "confirme_email": "Confirme seu e-mail para continuar. Mandamos um link para {{email}}. Não chegou? Veja o spam ou peça outro.",
  "conta_pendente_assistida": "Conta iniciada no mutirão. Ela só vale depois que você confirmar pelo link do e-mail.",
  "meus_dados": "Aqui você vê, corrige, exporta e apaga tudo que está na sua conta. Não precisa pedir a ninguém.",
  "excluir_conta": "Apagar a conta é imediato e não tem volta: currículo, candidaturas, conversas e selos somem. Para confirmar, digite EXCLUIR.",
  "excluir_conta_feito": "Conta apagada. Obrigado por ter usado o Vagas sem Caos.",
  "exportar_dados": "Baixe um arquivo com tudo que está na sua conta (portabilidade, LGPD art. 18).",
  "banco_talentos_fora": "Você saiu do banco de talentos. Seu cartão não aparece mais na busca das empresas.",
  "banco_talentos_vence": "Sua autorização do banco de talentos vence em {{dias}} dias. Quer renovar por mais 6 meses?",
  "conta_parada": "Conta sem uso há {{meses}} meses. Contas paradas por 24 meses são apagadas, com aviso 30 dias antes.",
  "whatsapp_opcional": "Até o Combinou, a conversa é só por aqui, sem número. No Combinou, a empresa vê seu nome, WhatsApp e e-mail (e a foto, se houver) e você vê os dela. Você pode cortar o acesso depois.",
  "whatsapp_nao_confirmado": "Nesta versão, o WhatsApp é informado por você e não é confirmado por código. Confira o número antes de salvar.",
  "disc_fora": "O Mapa DISC não entra na seleção. Ele é oferecido só depois da contratação, para a integração da pessoa na equipe.",
  "assinatura": "uma empresa do grupo Gestão sem Caos",
  "rodape_legal": "Vagas sem Caos · uma empresa do grupo Gestão sem Caos · Termos de uso · Aviso de privacidade · Denunciar",
  "referencia_o_que_e": "Referência profissional: uma empresa com CNPJ conferido diz, com o nome dela, que você trabalhou lá e o que recomenda. É sempre uma recomendação, nunca uma crítica. Sem estrelas, sem nota, sem média.",
  "referencia_so_se_aceitar": "A referência só aparece se você aceitar. Até lá, só você vê. Depois, você pode ocultar ou excluir quando quiser, e a empresa que deixou a referência não fica sabendo.",
  "referencia_publica": "Referência é pública: depois do Combinou, a empresa da vaga vê a referência completa, com o nome da empresa que a deixou.",
  "referencia_cartao_cego": "Antes do Combinou, a empresa vê só \"Referência de empresa verificada: sim\". Nem o nome da empresa, nem os pontos fortes, nem o texto.",
  "referencia_recebida": "{{empresa_nome}} deixou uma referência profissional para você. Leia e decida: aceitar e publicar, ou recusar. Ninguém vê antes de você aceitar.",
  "referencia_aceita": "Referência publicada. No seu cartão aparece só \"Referência de empresa verificada: sim\"; depois do Combinou, a empresa da vaga vê a referência completa, com o nome de {{empresa_nome}}.",
  "referencia_recusada": "Referência recusada. Ela não aparece para ninguém, e a empresa que deixou a referência não fica sabendo.",
  "referencia_ocultada": "Referência ocultada. Ela some para as empresas, e a empresa que deixou a referência não fica sabendo. Você pode mostrar de novo quando quiser.",
  "referencia_excluida": "Referência excluída. Isso não tem volta, e a empresa que deixou a referência não fica sabendo. Ela só pode deixar outra se você pedir.",
  "referencia_pedir": "Peça referência a uma empresa em que você trabalhou. Ela recebe um convite e decide se dá. Só aparece se você aceitar depois.",
  "referencia_pedido_enviado": "Pedido enviado a {{empresa_nome}}. Se a empresa deixar a referência, você recebe um aviso para ler e aceitar.",
  "referencia_empresa_como_funciona": "Dê uma referência profissional para alguém que trabalhou na sua empresa. Ela é pública, com o nome da empresa, e só aparece se a pessoa quiser. É uma recomendação: aqui não existe referência negativa. Quem não quer recomendar, não dá referência.",
  "referencia_empresa_so_verificada": "Só empresa com CNPJ conferido dá referência, por um membro logado.",
  "referencia_empresa_limite": "Uma referência por pessoa. Até {{limite_mes}} referências por mês.",
  "referencia_empresa_em_moderacao": "Referência enviada. Ela passa por moderação (até 1 dia útil) e depois vai para a pessoa. A decisão de mostrar ou não é só dela.",
  "referencia_texto_regras": "Descreva uma situação de trabalho que você viu (o que a pessoa fez). Não escreva qualidades pessoais. Até 300 letras. Sem dado sensível, sem telefone ou e-mail, sem crítica. Passa por moderação.",
  "referencia_sem_ordem": "Referências não geram nota, média, estrela nem ordem. Quem lê e decide é a empresa, na entrevista.",
  "referencia_pedido_recebido": "{{pessoa_nome}} pediu uma referência profissional à sua empresa sobre o período {{periodo}} como {{funcao}}. Você decide se dá. Se preferir não dar, é só ignorar.",
  "referencia_mutirao": "Trabalhou em alguma empresa da cidade? Dá para pedir uma referência profissional a ela aqui mesmo: a empresa decide se dá, e a referência só aparece se você aceitar. É pública, com o nome da empresa, e é sempre uma recomendação.",
  "golpe_vaga_fora_do_ar": "A vaga \"{{vaga_titulo}}\" saiu do ar por suspeita de golpe. Se alguém falou com você em nome dela e pediu dinheiro, Pix ou documento, não mande nada e denuncie. Nunca pague para se candidatar. Se alguém pedir em nosso nome, é golpe.",
  "denuncia_resposta_golpe": "Obrigado por denunciar. Confirmamos o problema: a vaga saiu do ar e a empresa foi suspensa. Se você mandou dinheiro ou documento, registre um boletim de ocorrência (pode ser online) e, se quiser, fale com a gente para orientação. Não mostramos a quem foi denunciado quem denunciou.",
  "vaga_pausada_pessoa": "A empresa pausou a vaga \"{{vaga_titulo}}\". Sua candidatura continua guardada; se a vaga voltar, você é avisada(o).",
  "vaga_encerrada_pessoa": "A vaga \"{{vaga_titulo}}\" foi encerrada pela empresa. Sua candidatura fica no seu histórico e some do painel da empresa em 90 dias.",
  "vaga_interessados_lembrete": "Sua vaga \"{{vaga_titulo}}\" tem {{total}} pessoas esperando resposta há {{dias}} dias. Responder em até 7 dias mantém a vaga viva: marque \"Quero conversar\" ou \"Agora não\".",
  "incidente_dados_resumo": "Houve um incidente de segurança que pode ter exposto alguns dados seus. Explicamos o que aconteceu, o que fizemos e o que você pode fazer.",
  "teste_antes_tempo": "São {{total}} questões e você tem {{minutos}} minutos. O relógio não para, nem se a internet cair. Se cair, entre de novo e continue de onde parou.",
  "combinou_roteiro_entrevista": "Quer uma entrevista mais justa e mais rápida? Use o roteiro de entrevista (20 a 30 minutos): 8 perguntas iguais para todo mundo, o que não perguntar e uma ficha para anotar. A plataforma não calcula nota nem ordena.",
  "contratada_pessoa": "{{empresa_nome}} marcou você como contratada(o) na vaga de {{vaga_titulo}}. Parabéns! A candidatura foi encerrada. Se algo não bater, fale com a empresa ou com a gente.",
  "contato_cortado_empresa": "A pessoa deixou de compartilhar o contato com a sua empresa.",
  "contato_cortado_conversa": "A pessoa encerrou a conversa e deixou de compartilhar o contato.",
  "contato_voltou_empresa": "A pessoa voltou a compartilhar o contato.",
  "contato_nao_liberado": "Seu contato não foi liberado para esta empresa.",
  "contato_cortar_pessoa": "Você pode parar de compartilhar o seu contato com esta empresa quando quiser. Ela é avisada, sem motivo, e deixa de ver o seu WhatsApp e a sua foto.",
  "referencia_ja_dada": "Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de pedido de referência.",
  "teste_lgpd_registro": "Durante a prova, registramos o tempo de cada questão, a saída da tela e a cópia de texto. Ninguém perde o selo só por isso: uma pessoa da equipe revisa antes de qualquer decisão.",
  "teste_so_pessoa": "Os testes são para a conta de pessoa. Entre com a sua conta de pessoa para fazer o teste.",
  "teste_conta_inativa": "Sua conta não está ativa. Confirme o e-mail ou fale com a equipe da Gestão sem Caos.",
  "empresa_ja_tem_acesso": "Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.",
  "empresa_so_recusar_em_analise": "Só dá para recusar uma empresa em análise.",
  "empresa_saiu": "A empresa saiu da plataforma.",
  "empresa_saiu_conversa": "A empresa saiu da plataforma. Esta conversa foi encerrada.",
  "empresa_suspensa_contato": "Esta empresa está suspensa. Fale com a Gestão sem Caos."
 },
 "anuncio": {
  "titulo_erro": "O anúncio precisa de ajuste antes de ir ao ar",
  "lei_resumo": "A lei proíbe anúncio ou exigência por sexo, idade, cor, raça, origem, estado civil, situação familiar, gravidez, deficiência, religião ou aparência (Lei 9.029/1995; CLT, art. 373-A). Descreva a função, não a pessoa.",
  "campos": {
   "salario_obrigatorio": "Informe a faixa salarial. Vaga sem valor não é publicada.",
   "diaria_obrigatoria": "Informe a data, o horário e o valor do dia.",
   "titulo_funcao": "Escreva a função, não a pessoa. Exemplo: \"Atendimento no balcão\", não \"Moça para o balcão\".",
   "zona_obrigatoria": "Escolha a zona da cidade onde é o trabalho.",
   "modalidade_obrigatoria": "Escolha a modalidade: CLT, temporário, diária, autônomo ou estágio.",
   "titulo_curto": "O título precisa ter entre 5 e 60 letras.",
   "descricao_curta": "Descreva a vaga em pelo menos 40 caracteres.",
   "selo_sugerido": "Quer pedir o selo de {{teste_nome}}? A pessoa faz o teste de conhecimento prático no celular e você vê a nota com a margem. Não é obrigatório e não substitui a entrevista.",
   "area_obrigatoria": "Escolha a área da vaga.",
   "turno_obrigatorio": "Escolha o turno da vaga.",
   "experiencia_obrigatoria": "Escolha a experiência que a vaga pede.",
   "outro_requisito": "Escreva qual é o outro requisito.",
   "teste_obrigatorio": "Escolha um dos testes da plataforma ou \"nenhum\".",
   "estagio_horas": "Informe as horas por dia do estágio (até 6).",
   "diaria_prazo": "A diária fica no ar de 48 a 168 horas."
  }
 },
 "referencia": {
  "vinculos": {
   "clt": "Carteira assinada",
   "temporario": "Temporário",
   "diaria": "Diária",
   "estagio": "Estágio",
   "freelancer": "Autônomo"
  },
  "validacao": {
   "periodo_obrigatorio": "Informe o mês/ano de início e de fim (ou marque \"trabalha aqui atualmente\").",
   "funcao_obrigatoria": "Informe a função que a pessoa exercia.",
   "pontos_maximo": "Escolha até 3 pontos fortes.",
   "texto_longo": "O texto passou de 300 letras.",
   "texto_negativo": "A referência é só recomendação. Tire a crítica ou a ressalva: quem não quer recomendar, não dá referência.",
   "texto_sensivel": "Tire do texto o dado sensível (saúde, família, religião, origem, gravidez). Isso não entra em referência.",
   "texto_contato": "Tire o telefone, e-mail ou link do texto. O contato aparece pela plataforma depois do Combinou.",
   "ja_existe": "Sua empresa já deixou uma referência para esta pessoa. Dá para editar só se ela pedir.",
   "limite_mes": "Sua empresa chegou ao limite de {{limite_mes}} referências neste mês.",
   "pessoa_sem_conta": "Referência só para quem tem conta. Convide a pessoa a se cadastrar: ela recebe o seu convite e, depois, você deixa a referência.",
   "declaracao_obrigatoria": "Para enviar, marque a declaração de que a pessoa trabalhou na empresa no período informado.",
   "texto_qualidade_pessoal": "Troque a qualidade pessoal por um fato: o que a pessoa fez, numa situação que você viu. Exemplo: em vez de \"responsável\", \"fechou o caixa certo todos os dias\"."
  },
  "texto_status": {
   "pendente": "Texto em revisão",
   "publicado": "Texto publicado",
   "nao_publicado": "Texto não publicado"
  }
 },
 "mensagem": {
  "bloqueada_dinheiro": "Mensagem não enviada. Pedir dinheiro, Pix, transferência, boleto ou pagamento de taxa não é permitido aqui. Concorrer é grátis, sempre, e isso vale para os dois lados.",
  "bloqueada_documento": "Mensagem não enviada. Pedir foto ou cópia de documento (CPF, RG, CNH, comprovante), senha ou código não é permitido antes da contratação. Documentos são conferidos pessoalmente, na admissão.",
  "bloqueada_link": "Mensagem não enviada. Links encurtados não são permitidos aqui. Escreva o endereço completo ou combine pelo WhatsApp depois do Combinou.",
  "bloqueada_generica": "Mensagem não enviada. Ela tem um trecho que não é permitido aqui. Reescreva sem pedir pagamento, documento ou link.",
  "aviso_pessoa": "Esta conversa fica registrada. Se a empresa pedir dinheiro, Pix, documento ou senha, não mande: denuncie.",
  "aviso_empresa": "Esta conversa fica registrada. Combine entrevista e detalhes da vaga. Documentos só na admissão, pessoalmente.",
  "recebeu_pedido_suspeito": "Esta mensagem foi bloqueada antes de chegar a você porque pedia pagamento ou documento. Você pode denunciar a empresa.",
  "conversa_encerrada": "Conversa encerrada. A outra parte não pode mais escrever aqui.",
  "conversa_encerrada_pessoa": "Você encerrou. A empresa não vê mais o seu contato e não pode escrever aqui."
 },
 "foto": {
  "explicacao": "A empresa só vê sua foto depois que vocês combinarem de conversar. Sem foto não muda nada na sua candidatura.",
  "opcional": "Foto é opcional. Se quiser, envie uma foto do rosto, simples, sem outras pessoas.",
  "quem_ve": "Nunca aparece no cartão cego, na busca das empresas nem no seu perfil público. Só a empresa com quem você combinou de conversar vê, enquanto a conversa estiver aberta.",
  "removida": "Foto removida. O arquivo foi apagado e nenhuma empresa vê mais a sua foto.",
  "empresa": "A foto da pessoa aparece só depois do Combinou, para esta vaga. Ela é opcional: quem não enviou foto está em igualdade com quem enviou. Não use a foto para decidir.",
  "limites": "Arquivo JPG, PNG ou WEBP, com até 1 MB.",
  "denunciar_empresa": "Foto imprópria, de outra pessoa ou com documento? Denuncie: a foto some para você e a equipe apura.",
  "formato": "A foto precisa ser JPG, PNG ou WEBP, com até 1 MB.",
  "so_apos_combinou": "A foto só aparece depois do Combinou.",
  "sem_foto_empresa": "Esta pessoa não pôs foto."
 },
 "consentimentos": {
  "termosVersao": "2026-10-13",
  "aceites": {
   "pessoa_cadastro": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Criar minha conta",
    "texto": "Li e aceito os Termos de uso e o Aviso de privacidade do Vagas sem Caos. Tenho 18 anos ou mais.",
    "explicacao": "Seus dados servem só para você concorrer a vagas. Até o Combinou, a empresa vê um cartão sem nome, sem foto e sem contato. Concorrer é grátis, sempre: nunca pague para se candidatar. Você pode ver, exportar e apagar tudo na tela \"Meus dados\".",
    "obrigatorio": true
   },
   "pessoa_novidades": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Novidades por e-mail",
    "texto": "Quero receber por e-mail as novidades do Vagas sem Caos (vagas novas na minha cidade e mutirões).",
    "explicacao": "Opcional. Você sai quando quiser, pelo link no fim de cada e-mail ou em \"Meus dados\". Os e-mails de serviço (confirmar conta, Combinou, selo) chegam de qualquer jeito.",
    "obrigatorio": false
   },
   "pessoa_candidatura": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Enviar minha candidatura",
    "texto": "Entendi: ao tocar em \"Quero\", a empresa recebe o meu cartão sem nome e sem contato. Meu nome e meu WhatsApp só aparecem se eu aceitar conversar.",
    "explicacao": "A candidatura usa a base legal de procedimento preliminar de contrato (LGPD, art. 7º, V): você não precisa autorizar de novo a cada vaga. Você pode retirar a candidatura a qualquer momento, antes do Combinou. A empresa se comprometeu a usar o seu cartão só para esta vaga.",
    "obrigatorio": true,
    "lembrete_curto": "Ao tocar em \"Quero\", a empresa recebe o seu cartão sem nome. Seu contato só aparece se você aceitar conversar."
   },
   "pessoa_banco_talentos": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Entrar no banco de talentos",
    "texto": "Autorizo que empresas da(s) minha(s) cidade(s) vejam o meu cartão sem nome e sem contato na busca do banco de talentos, por 6 meses.",
    "explicacao": "É opcional e separado da candidatura. A empresa que se interessar manda um convite; o seu nome e o seu contato só aparecem se você aceitar conversar. Avisamos antes de os 6 meses acabarem. Você sai quando quiser em \"Meus dados\", e o cartão some da busca na hora.",
    "obrigatorio": false,
    "prazo_dias": 180
   },
   "pessoa_combinou_contato": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Liberar meu contato para esta empresa",
    "texto": "Quero conversar com {{empresa_nome}}. Libero meu nome, meu WhatsApp, meu e-mail, meu currículo completo e a minha foto (se eu enviei) só para esta empresa, só para esta vaga.",
    "explicacao": "A empresa aparece agora com o nome dela: se for uma vaga confidencial, é a primeira vez que você vê quem é. Você passa a ver o WhatsApp e o e-mail dela. Se não quiser, toque em \"Agora não\" e nada é liberado. Depois do Combinou, em \"Quem viu meu contato\", você vê quando ela abriu os seus dados e pode cortar o acesso. Nunca pague nada para se candidatar. Documento, só na contratação, depois de conhecer a empresa. Nunca passe código que chegou por SMS.",
    "obrigatorio": true,
    "variaveis": [
     "empresa_nome"
    ]
   },
   "pessoa_cadastro_assistido": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Confirmar a conta que abriram para mim",
    "texto": "Fui eu que pedi esta conta no mutirão do Vagas sem Caos. Li e aceito os Termos de uso e o Aviso de privacidade. Tenho 18 anos ou mais.",
    "explicacao": "A conta só passa a valer agora, com a sua confirmação. Até aqui, nada foi mostrado a empresa alguma. Quem fez o cadastro com você não vê o seu currículo nem o seu contato. Se não foi você, ignore o e-mail: a conta é apagada em 7 dias.",
    "obrigatorio": true
   },
   "empresa_cadastro": {
    "versao": "2026-10-13",
    "quem": "empresa",
    "titulo": "Cadastrar minha empresa",
    "texto": "Declaro que represento a empresa deste CNPJ e que ela está ativa. Li e aceito os Termos de uso e o Aviso de privacidade. A empresa vai usar os dados das pessoas só para preencher as vagas anunciadas e vai apagá-los quando o processo terminar.",
    "explicacao": "A empresa se compromete a: não cobrar nada de quem se candidata; não anunciar com exigência de aparência, idade, sexo, estado civil ou qualquer outra discriminação (Lei 9.029/1995; CLT, art. 373-A); não retaliar quem denunciar, recusar conversa ou disser \"agora não\"; não repassar nem guardar dados fora do processo. O operador confere o CNPJ antes de a primeira vaga ir ao ar.",
    "obrigatorio": true
   },
   "empresa_vaga_confidencial": {
    "versao": "2026-10-13",
    "quem": "empresa",
    "titulo": "Publicar sem mostrar o nome da empresa",
    "texto": "Entendi: o nome da empresa fica escondido no anúncio e aparece para a pessoa no momento em que ela aceita conversar, antes de o contato dela ser liberado. Ela pode recusar sem que eu veja nada.",
    "explicacao": "Só empresa com CNPJ conferido pode publicar vaga confidencial. O anúncio mostra setor, porte e zona, para a pessoa saber do que se trata.",
    "obrigatorio": true
   },
   "empresa_diaria_domestica": {
    "versao": "2026-10-13",
    "quem": "empresa",
    "titulo": "Diária em casa",
    "texto": "Entendi: quem trabalha em residência mais de 2 dias por semana para a mesma pessoa ou família é empregado(a) doméstico(a), com carteira assinada (LC 150/2015). A plataforma é só um mural: preço, dia e pagamento são combinados direto entre nós.",
    "explicacao": "A plataforma não fixa valor, escala nem punição, não recebe pagamento e não fornece mão de obra temporária (Lei 6.019/1974).",
    "obrigatorio": true
   },
   "operador_contrato": {
    "versao": "2026-10-13",
    "quem": "operador",
    "titulo": "Contrato de operador",
    "texto": "Li e aceito o Contrato de operador local e o Aviso de privacidade. Vou tratar dados só por instrução da Gestão sem Caos, para operar a cidade. Não vou ver, copiar nem usar currículo ou contato de pessoa, nem usar a base para fim próprio. Sei que cada ação minha fica registrada.",
    "explicacao": "Para a LGPD, a Gestão sem Caos é a controladora e você é operador(a) de dados (art. 39 e 42, §1º). Usar dados para fim próprio torna você controlador(a) e responsável. O cadastro assistido que você começa só vale quando a própria pessoa confirma.",
    "obrigatorio": true
   },
   "pessoa_referencia_aceitar": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Aceitar e publicar esta referência",
    "texto": "Aceito que a referência profissional de {{empresa_nome}} apareça, com o nome da empresa, para as empresas com quem eu combinar de conversar. Sei que posso ocultar ou excluir quando quiser.",
    "explicacao": "Antes do Combinou, a empresa que vê o seu cartão enxerga só \"Referência de empresa verificada: sim\", sem o nome da empresa, sem os pontos fortes e sem o texto. Depois do Combinou, aparece a referência completa, com o nome da empresa. Se você ocultar ou excluir, a empresa que deixou a referência não fica sabendo. A referência é informação de terceiro sobre você: sai junto com a conta e vai no arquivo de \"Baixar meus dados\". [REVISÃO JURÍDICA]",
    "obrigatorio": true,
    "variaveis": [
     "empresa_nome"
    ]
   },
   "pessoa_referencia_pedir": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Pedir referência a uma empresa",
    "texto": "Quero pedir uma referência profissional a {{empresa_nome}}. Sei que a empresa decide se dá, que a referência só aparece se eu aceitar depois e que ela será pública, com o nome da empresa.",
    "explicacao": "A empresa recebe o seu nome e a função/período que você informou, só para preencher. Ela pode simplesmente não responder: aqui não existe referência negativa, só recomendação.",
    "obrigatorio": true,
    "variaveis": [
     "empresa_nome"
    ]
   },
   "pessoa_perfil_publico": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Tornar meu perfil público",
    "texto": "Quero uma página pública com o meu primeiro nome, as minhas funções, os meus selos e as referências que eu aceitei. Sei que qualquer pessoa com o link pode ver e que posso desligar quando quiser.",
    "explicacao": "A página não mostra contato, e-mail, zona, pretensão nem nada que não exista na plataforma (idade, foto, documento). Desligar tira a página do ar na hora.",
    "obrigatorio": false
   },
   "empresa_referencia_declaracao": {
    "versao": "2026-10-13",
    "quem": "empresa",
    "titulo": "Declaração da empresa",
    "texto": "Declaro que a pessoa trabalhou nesta empresa no período informado. A referência é pública e aparece com o nome da empresa. Ela é uma recomendação: não contém crítica, dado sensível, termo discriminatório nem contato.",
    "explicacao": "A empresa responde pela veracidade do que declara. A referência passa por moderação e só aparece se a pessoa quiser; a decisão é só dela e a empresa não é informada. Limite: 1 referência por pessoa; até {{limite_mes}} por mês. [REVISÃO JURÍDICA]",
    "obrigatorio": true,
    "variaveis": [
     "limite_mes"
    ]
   },
   "voluntario_mutirao_sigilo": {
    "versao": "2026-10-13",
    "quem": "voluntário(a) de mutirão",
    "titulo": "Termo de sigilo do(a) voluntário(a)",
    "texto": "Como voluntário(a) do mutirão do Vagas sem Caos, vou só ajudar a pessoa a usar o próprio celular. Não vou copiar, fotografar, anotar, guardar nem repassar nome, contato, documento ou qualquer dado de ninguém, nem usar o que vir para fim próprio. Sei que cada pessoa confirma a própria conta e que a Gestão sem Caos responde pelos dados.",
    "explicacao": "[REVISÃO JURÍDICA] Quem descumprir responde pessoalmente (LGPD, art. 42 e 43; Código Civil, art. 186). Vale durante o mutirão e depois dele.",
    "obrigatorio": true
   },
   "foto_opcional": {
    "versao": "2026-10-13",
    "quem": "pessoa",
    "titulo": "Mostrar minha foto depois do Combinou",
    "texto": "Autorizo mostrar a minha foto só às empresas com quem eu combinar de conversar. Posso remover a foto a qualquer hora.",
    "explicacao": "A foto é opcional. Ela nunca aparece no cartão cego, na busca do banco nem no perfil público: só depois do Combinou, para aquela empresa. Sem foto, nada muda na sua candidatura. Remover a foto apaga o arquivo na hora; apagar a conta também apaga. [REVISÃO JURÍDICA]",
    "obrigatorio": false
   }
  }
 },
 "moderacao": {
  "versao": "2026-10-13",
  "motivos": {
   "anuncio_discriminatorio": {
    "alvo": "anuncio",
    "acao": "remover",
    "titulo": "Anúncio com exigência discriminatória",
    "texto_empresa": "Sua vaga \"{{vaga_titulo}}\" foi recusada porque o anúncio pede ou exclui por {{detalhe}}. A lei proíbe anúncio ou exigência por sexo, idade, cor, raça, origem, estado civil, situação familiar, gravidez, deficiência, religião ou aparência.",
    "correcao": "Edite o anúncio descrevendo a função e as tarefas, não a pessoa. Exemplo: troque \"moça de boa aparência até 30 anos\" por \"atendimento no balcão, turno da tarde\". Depois é só publicar de novo.",
    "lei": "Lei 9.029/1995; CLT, art. 373-A, I"
   },
   "anuncio_sem_valor": {
    "alvo": "anuncio",
    "acao": "recusar",
    "titulo": "Sem faixa salarial ou valor da diária",
    "texto_empresa": "Sua vaga \"{{vaga_titulo}}\" ainda não foi publicada porque falta a faixa salarial (ou o valor do dia, na diária). Aqui toda vaga mostra o valor: isso evita candidatura perdida para os dois lados.",
    "correcao": "Informe a faixa (por exemplo, R$ 1.600 a R$ 1.900) ou o valor do dia e publique de novo.",
    "lei": "regra da plataforma (termos de uso, seção 5.2)"
   },
   "anuncio_cobranca": {
    "alvo": "anuncio",
    "acao": "remover",
    "titulo": "Anúncio cobra ou pede pagamento de quem se candidata",
    "texto_empresa": "Sua vaga \"{{vaga_titulo}}\" foi removida porque pede pagamento, taxa, compra de material ou curso de quem se candidata. Concorrer é grátis, sempre. A Justiça do Trabalho já considerou ilícita a cobrança de quem procura emprego.",
    "correcao": "Tire qualquer exigência de pagamento. Se a função exige curso ou uniforme, isso é tratado na contratação e pago pela empresa, não como condição para concorrer. Reincidência suspende a conta.",
    "lei": "TRT-4, 5ª Turma (2025), ação do MPT; Convenção 181 da OIT, art. 7º (fonte subsidiária); termos de uso, seção 3"
   },
   "anuncio_contato_fora": {
    "alvo": "anuncio",
    "acao": "recusar",
    "titulo": "Telefone, e-mail ou link no anúncio",
    "texto_empresa": "Sua vaga \"{{vaga_titulo}}\" ainda não foi publicada porque tem telefone, e-mail ou link no texto. A candidatura é pela plataforma: isso protege a sua empresa de golpe feito em seu nome e a pessoa de pedidos indevidos.",
    "correcao": "Tire o contato e o link do texto. Depois do Combinou, o contato aparece para os dois lados e o botão de WhatsApp fica disponível.",
    "lei": "regra da plataforma (termos de uso, seção 8.3)"
   },
   "anuncio_falso": {
    "alvo": "anuncio",
    "acao": "remover",
    "titulo": "Vaga que parece não existir",
    "texto_empresa": "Sua vaga \"{{vaga_titulo}}\" foi removida porque não conseguimos confirmar que ela existe ({{detalhe}}). Vaga falsa é a porta de entrada do golpe do emprego e coloca em risco a reputação da sua empresa.",
    "correcao": "Se a vaga é real, responda este e-mail com uma confirmação da pessoa responsável pela empresa e o operador revisa em até 1 dia útil.",
    "lei": "termos de uso, seção 8.3; Código Penal, art. 171 (quando houver fraude)"
   },
   "anuncio_fora_do_tema": {
    "alvo": "anuncio",
    "acao": "remover",
    "titulo": "Não é uma vaga de trabalho",
    "texto_empresa": "Sua publicação \"{{vaga_titulo}}\" foi removida porque não é uma vaga de trabalho (parece venda, captação de clientes, curso, marketing multinível ou promessa de ganho). O mural é só para vagas de emprego, estágio, diária e serviço.",
    "correcao": "Publique só vaga real, com função, tarefas, modalidade e valor.",
    "lei": "termos de uso, seção 8.5"
   },
   "anuncio_teste_psicologico": {
    "alvo": "anuncio",
    "acao": "recusar",
    "titulo": "Pede teste de personalidade ou DISC para concorrer",
    "texto_empresa": "Sua vaga \"{{vaga_titulo}}\" ainda não foi publicada porque pede teste de personalidade, de perfil ou DISC como condição para concorrer. Só psicólogo(a) pode usar esse tipo de teste em seleção.",
    "correcao": "Tire a exigência. Se quiser, peça o selo do teste da função (conhecimento prático, feito online sem supervisão; mede o que a pessoa sabe hoje do básico da função, não personalidade). O Mapa DISC é oferecido depois da contratação, na integração.",
    "lei": "Lei 4.119/1962, art. 13, §1º; Resolução CFP 31/2022"
   },
   "anuncio_diaria_irregular": {
    "alvo": "anuncio",
    "acao": "recusar",
    "titulo": "Diária sem data, horário ou valor, ou com cara de emprego fixo",
    "texto_empresa": "Sua diária \"{{vaga_titulo}}\" ainda não foi publicada porque {{detalhe}}. Diária precisa de data, horário e valor do dia. Se o trabalho é toda semana, na mesma casa ou no mesmo lugar, não é diária: é vaga (CLT ou doméstico).",
    "correcao": "Complete data, horário e valor, ou mude a modalidade para CLT. Lembre: em residência, mais de 2 dias por semana para a mesma família é emprego doméstico, com carteira assinada.",
    "lei": "LC 150/2015, art. 1º; CLT, art. 3º"
   },
   "anuncio_denuncias": {
    "alvo": "anuncio",
    "acao": "suspender",
    "titulo": "Suspensa por denúncias",
    "texto_empresa": "Sua vaga \"{{vaga_titulo}}\" saiu do ar porque recebeu 3 denúncias de contas diferentes. Ela fica suspensa até a revisão do operador, em até 24 horas.",
    "correcao": "Não precisa fazer nada agora. Se a revisão não achar problema, a vaga volta ao ar e você é avisado(a). Se achar, você recebe o motivo e a orientação.",
    "lei": "termos de uso, seção 10.2"
   },
   "anuncio_ok_apos_revisao": {
    "alvo": "anuncio",
    "acao": "publicar",
    "titulo": "Revisada e publicada",
    "texto_empresa": "Sua vaga \"{{vaga_titulo}}\" foi revisada e está no ar. Link curto para compartilhar: {{link_curto}}.",
    "correcao": "",
    "lei": ""
   },
   "empresa_cnpj_nao_confere": {
    "alvo": "empresa",
    "acao": "recusar",
    "titulo": "CNPJ não confere ou está inativo",
    "texto_empresa": "Não conseguimos conferir o CNPJ {{cnpj}} ({{detalhe}}). Enquanto isso, a empresa não publica.",
    "correcao": "Confira o número no cartão CNPJ da Receita Federal. Se a situação cadastral está diferente de \"ativa\", regularize e peça nova análise.",
    "lei": "termos de uso, seção 2.2"
   },
   "empresa_sem_representacao": {
    "alvo": "empresa",
    "acao": "recusar",
    "titulo": "Não foi possível confirmar quem responde pela empresa",
    "texto_empresa": "Não conseguimos confirmar que a pessoa responsável cadastrada responde pela empresa {{empresa_nome}}. Enquanto isso, a empresa não publica.",
    "correcao": "Responda este e-mail a partir de um e-mail do domínio da empresa, ou peça ao operador da sua cidade uma conferência por telefone com o número do cartão CNPJ.",
    "lei": "termos de uso, seção 2.2"
   },
   "empresa_suspensa_golpe": {
    "alvo": "empresa",
    "acao": "suspender",
    "titulo": "Suspensa por pedido de dinheiro ou documento",
    "texto_empresa": "A conta da empresa {{empresa_nome}} foi suspensa porque pediu dinheiro, Pix, documento ou senha de quem se candidatou ({{detalhe}}). Isso é proibido aqui e pode ser crime.",
    "correcao": "Se discorda, peça revisão em até 30 dias respondendo este e-mail. Em caso de fraude confirmada, a suspensão é definitiva e o caso pode ser comunicado às autoridades.",
    "lei": "termos de uso, seções 3, 7 e 10; Código Penal, art. 171"
   },
   "empresa_suspensa_discriminacao": {
    "alvo": "empresa",
    "acao": "suspender",
    "titulo": "Suspensa por discriminação reincidente",
    "texto_empresa": "A conta da empresa {{empresa_nome}} foi suspensa porque, mesmo depois de avisada, publicou anúncio ou recusou pessoas por motivo discriminatório ({{detalhe}}).",
    "correcao": "Peça revisão em até 30 dias, com o compromisso de seguir a regra. A reativação depende do operador e da equipe.",
    "lei": "Lei 9.029/1995; CLT, art. 373-A"
   },
   "empresa_suspensa_retaliacao": {
    "alvo": "empresa",
    "acao": "suspender",
    "titulo": "Suspensa por retaliar quem denunciou ou recusou",
    "texto_empresa": "A conta da empresa {{empresa_nome}} foi suspensa porque houve retaliação contra uma pessoa que denunciou, recusou conversa ou retirou a candidatura.",
    "correcao": "Peça revisão em até 30 dias respondendo este e-mail.",
    "lei": "termos de uso, seção 5.6"
   },
   "empresa_dados_fora_da_finalidade": {
    "alvo": "empresa",
    "acao": "suspender",
    "titulo": "Suspensa por usar dados fora da vaga",
    "texto_empresa": "A conta da empresa {{empresa_nome}} foi suspensa porque usou dados de pessoas fora do processo da vaga (por exemplo, para marketing, repasse ou outra finalidade).",
    "correcao": "Apague os dados recebidos, confirme por escrito e peça revisão em até 30 dias. A empresa responde como controladora pelo uso que fez.",
    "lei": "LGPD, art. 6º, I a III, e art. 42; termos de uso, seção 5.5"
   },
   "empresa_reativada": {
    "alvo": "empresa",
    "acao": "reativar",
    "titulo": "Conta reativada",
    "texto_empresa": "A conta da empresa {{empresa_nome}} foi reativada depois da revisão. Suas vagas pausadas podem ser retomadas no painel.",
    "correcao": "",
    "lei": ""
   },
   "mensagem_pedido_dinheiro": {
    "alvo": "mensagem",
    "acao": "bloquear",
    "titulo": "Mensagem pedia dinheiro ou pagamento",
    "texto_empresa": "Uma mensagem sua na conversa da vaga \"{{vaga_titulo}}\" foi bloqueada porque pedia dinheiro, Pix, transferência ou pagamento de taxa. Concorrer é grátis, sempre.",
    "correcao": "Reescreva sem pedido de pagamento. Reincidência suspende a conta.",
    "lei": "termos de uso, seção 7.2"
   },
   "mensagem_pedido_documento": {
    "alvo": "mensagem",
    "acao": "bloquear",
    "titulo": "Mensagem pedia documento, senha ou código",
    "texto_empresa": "Uma mensagem sua na conversa da vaga \"{{vaga_titulo}}\" foi bloqueada porque pedia foto ou cópia de documento, senha ou código de confirmação. Documentos são conferidos pessoalmente, na admissão.",
    "correcao": "Combine a entrevista e peça os documentos só na admissão, presencialmente.",
    "lei": "termos de uso, seção 7.2; LGPD, art. 6º, III (necessidade)"
   },
   "mensagem_assedio": {
    "alvo": "mensagem",
    "acao": "suspender",
    "titulo": "Assédio, ameaça ou ofensa",
    "texto_empresa": "Sua conta foi suspensa porque uma mensagem na conversa da vaga \"{{vaga_titulo}}\" tinha assédio, ameaça ou ofensa. A outra pessoa foi protegida e a conversa foi encerrada.",
    "correcao": "Peça revisão em até 30 dias. Em caso grave, o registro pode ser entregue às autoridades a pedido da pessoa atingida.",
    "lei": "termos de uso, seção 7.4; Código Penal, arts. 140, 147 e 216-A"
   },
   "denuncia_improcedente": {
    "alvo": "denuncia",
    "acao": "arquivar",
    "titulo": "Denúncia revisada, sem problema encontrado",
    "texto_empresa": "Revisamos a denúncia sobre \"{{alvo_descricao}}\" e não encontramos descumprimento das regras. Nada muda. Obrigado por denunciar: é assim que o mural fica seguro.",
    "correcao": "",
    "lei": ""
   },
   "denuncia_procedente": {
    "alvo": "denuncia",
    "acao": "acatar",
    "titulo": "Denúncia revisada e acatada",
    "texto_empresa": "Revisamos a denúncia sobre \"{{alvo_descricao}}\" e tomamos uma providência ({{detalhe}}). Não mostramos a quem foi denunciado quem denunciou. Obrigado.",
    "correcao": "",
    "lei": ""
   },
   "referencia_dado_sensivel": {
    "alvo": "referencia",
    "acao": "recusar",
    "titulo": "Referência com dado sensível",
    "texto_empresa": "A referência que a sua empresa deixou para {{pessoa_nome}} foi recusada porque o texto traz dado sensível ({{detalhe}}): saúde, família, gravidez, religião, origem, orientação ou situação financeira não entram em referência.",
    "correcao": "Edite o texto deixando só fatos do trabalho e a recomendação. Reenvie e a pessoa recebe para aceitar.",
    "lei": "LGPD art. 11; Lei 9.029/1995"
   },
   "referencia_discriminatoria": {
    "alvo": "referencia",
    "acao": "recusar",
    "titulo": "Referência com termo discriminatório",
    "texto_empresa": "A referência que a sua empresa deixou para {{pessoa_nome}} foi recusada porque o texto tem termo ligado a aparência, idade, sexo, cor, origem ou estado civil ({{detalhe}}). Isso não entra em referência, mesmo como elogio.",
    "correcao": "Descreva o que a pessoa fazia e como, não quem ela é. Exemplo: troque \"moça bonita e educada\" por \"atendia bem as pessoas\".",
    "lei": "Lei 9.029/1995; CLT, art. 373-A"
   },
   "referencia_contato": {
    "alvo": "referencia",
    "acao": "recusar",
    "titulo": "Referência com telefone, e-mail ou link",
    "texto_empresa": "A referência que a sua empresa deixou para {{pessoa_nome}} foi recusada porque o texto tem telefone, e-mail ou link. Referência é pública: contato ali expõe a pessoa e a empresa.",
    "correcao": "Tire o contato e reenvie. Quem quiser confirmar a referência fala com a empresa pelo canal público dela.",
    "lei": "termos de uso, seção 8.3"
   },
   "referencia_negativa": {
    "alvo": "referencia",
    "acao": "recusar",
    "titulo": "Referência com crítica, ressalva ou ofensa",
    "texto_empresa": "A referência que a sua empresa deixou para {{pessoa_nome}} foi recusada porque contém crítica, ressalva ou ofensa. Aqui a referência é só recomendação, pública e com o nome da empresa. Referência negativa pública pode gerar dano moral e caracterizar \"lista\" de pessoas, o que é ilegal.",
    "correcao": "Se você recomenda a pessoa, reescreva só com os pontos positivos e os fatos do período. Se não recomenda, não dê referência: isso basta.",
    "lei": "[REVISÃO JURÍDICA] Código Civil, arts. 186 e 927; Constituição, art. 5º, X; Lei 9.029/1995 (listas discriminatórias)"
   },
   "referencia_periodo_improvavel": {
    "alvo": "referencia",
    "acao": "recusar",
    "titulo": "Período ou vínculo que não confere",
    "texto_empresa": "A referência que a sua empresa deixou para {{pessoa_nome}} foi recusada porque o período ou o vínculo informado não confere ({{detalhe}}). A empresa responde pela veracidade da declaração.",
    "correcao": "Confira as datas e a função no registro da empresa e reenvie.",
    "lei": "declaração da empresa (aceite empresa_referencia_declaracao)"
   },
   "referencia_denunciada": {
    "alvo": "referencia",
    "acao": "remover",
    "titulo": "Removida por denúncia",
    "texto_empresa": "A referência que a sua empresa deixou para {{pessoa_nome}} foi removida depois de denúncia ({{detalhe}}).",
    "correcao": "Se discorda, responda este e-mail em até 30 dias.",
    "lei": "termos de uso, seção 10"
   },
   "referencia_ok": {
    "alvo": "referencia",
    "acao": "liberar",
    "titulo": "Referência revisada e enviada à pessoa",
    "texto_empresa": "A referência que a sua empresa deixou para {{pessoa_nome}} foi revisada e enviada para a pessoa. A decisão de mostrar ou não é só dela.",
    "correcao": "",
    "lei": ""
   },
   "referencia_limite": {
    "alvo": "referencia",
    "acao": "recusar",
    "titulo": "Limite de referências",
    "texto_empresa": "A referência para {{pessoa_nome}} não foi enviada porque a sua empresa chegou ao limite deste mês ({{limite_mes}}) ou já deixou uma referência para esta pessoa.",
    "correcao": "Espere o mês virar ou, se a pessoa pediu uma nova, edite a que já existe.",
    "lei": "termos de uso, seção 6.3"
   },
   "denuncia_golpe_confirmado": {
    "alvo": "denuncia",
    "acao": "acatar",
    "titulo": "Golpe confirmado: resposta a quem denunciou",
    "texto_empresa": "Obrigado por denunciar. Confirmamos o problema: a vaga saiu do ar e a empresa foi suspensa. Se você mandou dinheiro ou documento, registre um boletim de ocorrência (pode ser online) e, se quiser, fale com a gente para orientação. Não mostramos a quem foi denunciado quem denunciou.",
    "correcao": "",
    "lei": "termos de uso, seção 10.5; protocolo de golpe em docs/VAGAS-OPERACAO.md"
   },
   "foto_indevida": {
    "alvo": "foto",
    "acao": "recusar",
    "titulo": "Foto não aceita",
    "texto_empresa": "Sua foto não foi aceita ({{detalhe}}). A foto precisa ser sua, do rosto, sem outras pessoas, sem documento, sem texto, sem símbolo e sem conteúdo impróprio.",
    "correcao": "Envie outra foto ou siga sem foto: nada muda na sua candidatura. Foto é opcional e só aparece depois do Combinou.",
    "lei": "LGPD art. 11 (inferência de dado sensível); Lei 9.029/1995; termos de uso, seção 4.7"
   },
   "referencia_qualidade_pessoal": {
    "alvo": "referencia",
    "acao": "recusar",
    "titulo": "Qualidade pessoal em vez de fato",
    "texto_empresa": "A referência que a sua empresa deixou para {{pessoa_nome}} foi recusada porque o texto traz qualidade pessoal (\"{{detalhe}}\") em vez de um fato. Referência aqui descreve o que a pessoa fez, numa situação que você viu.",
    "correcao": "Troque a qualidade pela situação: em vez de \"responsável\", \"fechou o caixa certo todos os dias durante 8 meses\". Os pontos fortes marcados na lista já cobrem o resto.",
    "lei": "padrão da psicologia (evidencias.md §4A.4): comportamento observável, não traço"
   }
  }
 }
};
  if (typeof module !== 'undefined' && module.exports) { module.exports = DADOS; return; }
  var T = root.VAGAS_TEXTOS || (root.VAGAS_TEXTOS = {});
  Object.keys(DADOS).forEach(function (k) {
    if (k !== 'avisos') { T[k] = DADOS[k]; return; }
    T.avisos = T.avisos || {};
    Object.keys(DADOS.avisos).forEach(function (a) { T.avisos[a] = DADOS.avisos[a]; });
  });
})(typeof self !== 'undefined' ? self : this);
