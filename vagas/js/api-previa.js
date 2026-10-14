/*
 * Vagas sem Caos — PRÉVIA: um "banco" de mentira guardado só neste navegador (chave 'vagas_previa_v4'), com as MESMAS
 * RPCs, regras e mensagens das migrações 20261022120000_vagas.sql e 20261024120000_vagas_onda2.sql. Carregado sob demanda por
 * vagas/js/api.js quando VAGAS_CONFIG.MODO = 'previa' (precisa de vagas/js/regras.js carregado antes). Nada sai do navegador;
 * nenhum e-mail é enviado.
 *
 * Dados fictícios da praça piloto, Uruaçu (GO) (criados na primeira carga; datas relativas a hoje): Uruaçu ativa (porte
 * pequena, fuso America/Sao_Paulo, as 6 zonas da operação), Campinorte no entorno e Niquelândia em lista de espera — as duas
 * vizinhas existem SÓ na prévia, para mostrar "Incluir <entorno>" e a lista de espera; 15 empresas (razão social com
 * "(prévia)" e CNPJ de mentira começando com PV), 30 vagas (CLT, temporário, diária, estágio e freelancer; 3 confidenciais;
 * 2 em revisão; 1 rascunho), 40 pessoas, candidaturas, conversas e referências.
 * Logins da prévia (senha previa123): pessoa@previa.com (Ana Clara Ribeiro, cadastro completo, com conversa numa vaga
 * confidencial e um Combinou) · empresa@previa.com (dona do Mercadinho Sol do Norte, com cartões, conversas, referências, uma
 * recrutadora e um convite de equipe aberto) · recrutador@previa.com (recrutadora do Mercadinho: não convida) ·
 * operador@previa.com (operação de Uruaçu) · admin@previa.com (equipe da Gestão sem Caos).
 * Diferenças da versão real: sem e-mail (cadastrar/esqueci/convidarEquipe devolvem "linkPrevia" para a tela abrir; no convite
 * de equipe o linkPrevia vem vazio quando, no real, nenhum convite que funcione seria enviado), sem limites por origem (IP) e
 * sem Turnstile; os limites por conta (30 "Quero"/dia, 3 mensagens seguidas, 20 referências/30 dias, 10 convites de equipe por
 * empresa por dia) valem. O token do convite de equipe fica em claro neste navegador (no banco, só o hash).
 *
 * No Node (testes): require('./vagas/js/api-previa.js').criarBackend({armazenamento, agora: () => ms, semente: true|false})
 *   -> {rpc(nome, args) -> Promise<json>, conta: {cadastrar, reenviarConfirmacao, esqueciSenha, cadastroAssistido, convidarOperador,
 *   convidarEquipe, excluirConta, entrar, sair, sessao, confirmarLink, definirSenha}, estado(), reiniciar()}
 *
 * Testes de habilidade: a prova da prévia usa um banco de DEMONSTRAÇÃO escrito só para ela (TESTES_DEMONSTRACAO, 18 questões
 * por teste), nunca as questões reais; mesmas regras, tempos, tolerância, 30 dias e mensagens da migração 20261023.
 */
(function (root) {
  'use strict';
  var R = (typeof module !== 'undefined' && module.exports) ? require('./regras.js') : root.VAGAS_REGRAS;
  // v4: telefones de exemplo com DDD que não existe (23) e códigos de selo sorteados (revisão G4); a v3 (com senha em texto
  // puro) é apagada ao abrir.
  var CHAVE = 'vagas_previa_v4';
  var CHAVES_ANTIGAS = ['vagas_previa_v3'];
  var SENHA_PREVIA = 'previa123';   // senha PÚBLICA das contas da semente (está neste comentário e na tela de entrar da prévia)
  // Conta criada na prévia: nenhuma senha fica guardada no navegador (revisão G3); qualquer senha de 8 a 72 caracteres entra.
  var SENHA_NAO_GUARDADA = '*';
  var DIA = 86400000;
  var ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  // localStorage -> sessionStorage -> memória: a prévia abre mesmo em navegador que bloqueia o armazenamento (na memória os dados
  // fictícios duram só enquanto a página estiver aberta). Cada backend tem a sua memória.
  function armazenamentoPadrao() {
    var nomes = ['localStorage', 'sessionStorage'];
    for (var i = 0; i < nomes.length; i++) {
      try {
        var s = root[nomes[i]];
        if (s) { s.setItem('vagas.__teste', '1'); s.removeItem('vagas.__teste'); return s; }
      } catch (e) { /* bloqueado: tenta o próximo */ }
    }
    var m = {};
    return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } };
  }

  // ===============================================================================================================================
  // PROVA DE DEMONSTRAÇÃO (frente testes, onda 2) — SÓ PARA A PRÉVIA.
  // As questões abaixo foram escritas para demonstrar as telas. NÃO são as questões da prova real: aquelas são confidenciais e
  // nunca entram no repositório (docs/VAGAS-TESTES.md, "Gabarito fora do repositório"). A tela mostra "Questões de demonstração
  // (a prova real usa outro banco)". Redação no padrão de docs/painel-cientifico/vagas/padroes.md §2 a §4 (o teste de unidade
  // passa cada questão pelo mesmo validador das questões reais, scripts/montar-testes.mjs).
  // 18 por teste (6 fáceis, 6 médias, 6 difíceis), cobrindo as competências do contrato. As regras são as da migração
  // 20261023120000_vagas_testes.sql: 15 questões (6/6/3), 20 min (caixa 25) pelo relógio do "servidor", 10 s de tolerância para a
  // questão que já está na tela, 1 tentativa a cada 30 dias, nota = arredonda(100 × acertos ÷ total), selo com nota ≥ 60 válido
  // por 12 meses, sinais (saiu da tela, copiou texto) só registrados. Sem limite por origem (a prévia não tem IP).
  // ===============================================================================================================================
  var MSG_PROVA = {
    login: 'Entre na sua conta para fazer o teste.',
    so_pessoa: 'Os testes são para a conta de pessoa. Entre com a sua conta de pessoa para fazer o teste.',
    conta_inativa: 'Sua conta não está ativa. Confirme o e-mail ou fale com a equipe da Gestão sem Caos.',
    teste_indisponivel: 'Este teste não está disponível agora.',
    aguarde: 'Você fez este teste há menos de 30 dias. Pode fazer de novo a partir de ',
    tentativa_inexistente: 'Teste não encontrado. Volte à lista de testes.',
    encerrada: 'Este teste já foi encerrado.',
    tempo_esgotado: 'O tempo acabou. As respostas dadas até aqui foram guardadas.',
    fora_de_ordem: 'Esta questão não está disponível. Siga para a questão atual.',
    alternativa_invalida: 'Escolha uma das alternativas.',
    sinal_invalido: 'Sinal inválido.',
    selo_inexistente: 'Selo não encontrado. Confira o código.'
  };
  var REGRAS_PROVA = { questoes: 15, intervaloDias: 30, toleranciaSeg: 10, notaMinima: 60, margem: 10, validadeMeses: 12, rapidaSeg: 3 };
  var ALFABETO_SELO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  // Questão: {id, competencia, dificuldade 1|2|3, texto? (aviso a interpretar), enunciado, alternativas[4], correta 0..3, conta?}.
  function q(id, competencia, dificuldade, enunciado, alternativas, correta, extra) {
    return Object.assign({ id: id, competencia: competencia, dificuldade: dificuldade, enunciado: enunciado, alternativas: alternativas,
      correta: correta }, extra || {});
  }
  var TESTES_DEMONSTRACAO = [
    { slug: 'atendimento', nome: 'Atendimento e recepção', minutos: 20,
      descricao: 'O básico de quem atende o público: receber, telefone e mensagens, agenda, reclamações e cuidado com os dados do cliente.',
      competencias: [{ id: 'receber', nome: 'Receber e informar' }, { id: 'telefone', nome: 'Telefone e WhatsApp' },
        { id: 'agenda', nome: 'Agenda e horários' }, { id: 'reclamacoes', nome: 'Reclamações e situações difíceis' },
        { id: 'sigilo', nome: 'Sigilo e dados do cliente' }],
      questoes: [
        q('DEMO-ATE-01', 'receber', 1, 'Um cliente chega ao balcão enquanto você termina de anotar um recado. O que deve ser feito primeiro?',
          ['Cumprimentar o cliente e pedir um instante para terminar', 'Terminar o recado e só depois olhar para o cliente',
            'Pedir ao cliente que volte em alguns minutos', 'Fazer um sinal com a mão e continuar escrevendo o recado'], 0),
        q('DEMO-ATE-02', 'receber', 1, 'Uma pessoa idosa chega à recepção, e outras pessoas já esperam. Como ela deve ser atendida?',
          ['Na ordem de chegada, como qualquer cliente', 'Depois de quem chegou antes dela', 'Com prioridade, antes de quem não tem prioridade',
            'Com prioridade, só se ela pedir para passar'], 2),
        q('DEMO-ATE-03', 'receber', 2, 'Um cliente pergunta o preço de um serviço, e você não sabe o valor. O que deve ser feito?',
          ['Dar um valor aproximado para o cliente não esperar', 'Dizer que vai confirmar e trazer o preço certo',
            'Dizer que não sabe e encerrar o atendimento', 'Pedir que o cliente procure o preço sozinho'], 1),
        q('DEMO-ATE-04', 'receber', 3, 'Um cliente pede uma informação que só a gerência pode dar. A gerente volta só à tarde. O que deve ser feito?',
          ['Responder do jeito que a gerente provavelmente responderia', 'Pedir que o cliente volte, sem dizer quando',
            'Passar ao cliente o celular pessoal da gerente', 'Anotar nome, contato e pergunta, e combinar o retorno'], 3),
        q('DEMO-ATE-05', 'telefone', 1, 'Ao atender o telefone da empresa, o que deve ser dito primeiro?',
          ['Alô, e depois esperar a pessoa dizer o que quer', 'Quem fala, e de onde está ligando', 'O nome da empresa, o seu nome e um bom-dia',
            'O horário de funcionamento e o endereço da empresa'], 2),
        q('DEMO-ATE-06', 'telefone', 2, 'Um cliente liga e pede para falar com um colega que está em reunião. O que deve ir no recado?',
          ['Nome, telefone e assunto, com o dia e a hora', 'Só o nome de quem ligou, para não esquecer de avisar', 'Só o assunto, sem o telefone de retorno',
            'Nada, porque o cliente pode ligar de novo'], 0),
        q('DEMO-ATE-07', 'telefone', 2, 'Um cliente pergunta, por mensagem, se a loja abre no domingo. A loja fecha no domingo. Qual é a melhor resposta?',
          ['Bom dia! Domingo eu não sei dizer. Pergunte de novo amanhã, que alguém vê para você.',
            'Oi! Domingo é fechado e no fim de semana a gente não responde mensagem, tá?',
            'Bom dia! Pode vir no domingo, que deve ter alguém aqui para atender você.',
            'Bom dia! No domingo a loja fica fechada. Abrimos de segunda a sábado, das 8h às 18h.'], 3),
        q('DEMO-ATE-08', 'telefone', 3, 'Você atende um cliente no balcão, e o telefone toca várias vezes. O que é correto fazer?',
          ['Deixar tocar até parar, sem anotar a ligação', 'Pedir licença, atender, anotar o recado e voltar ao cliente',
            'Atender e resolver tudo pelo telefone, com calma', 'Tirar o telefone do gancho para ele parar de tocar'], 1),
        q('DEMO-ATE-09', 'agenda', 1, 'Um cliente quer marcar horário para quinta-feira, às 10h. O que deve ser conferido antes de confirmar?',
          ['Se o cliente já foi atendido antes', 'Se o horário está livre na agenda', 'Se o cliente prefere outro dia',
            'Se o cliente mora perto da empresa'], 1),
        q('DEMO-ATE-10', 'agenda', 2, 'Cada consulta dura 30 minutos. A última vaga livre é às 17h30, e a clínica fecha às 18h. Um cliente pede 17h45. O que deve ser feito?',
          ['Marcar às 17h45, porque ainda é horário de expediente', 'Marcar às 18h, no fim do expediente',
            'Dizer que não há vaga em nenhum dia da semana', 'Oferecer o horário das 17h30, que ainda está livre'], 3),
        q('DEMO-ATE-11', 'agenda', 3, 'Um cliente desmarcou a consulta de amanhã, às 9h. Outro cliente está na lista de espera para esse dia. O que deve ser feito?',
          ['Liberar o horário e oferecer a vaga a quem está na espera', 'Deixar o horário vazio até o fim do dia',
            'Marcar o cliente da lista de espera, sem avisar a ele antes', 'Manter o horário no nome de quem desmarcou'], 0),
        q('DEMO-ATE-12', 'agenda', 3, 'A agenda mostra dois clientes marcados no mesmo horário, com o mesmo profissional. O que deve ser feito?',
          ['Esperar os dois chegarem e ver quem fica', 'Atender quem chegar primeiro e dispensar o outro',
            'Ligar antes para um deles e combinar outro horário', 'Apagar um dos horários sem avisar o cliente'], 2),
        q('DEMO-ATE-13', 'reclamacoes', 1, 'Um cliente reclama que esperou muito para ser atendido. Qual é a primeira atitude correta?',
          ['Explicar que a culpa é do colega que faltou', 'Dizer que hoje o movimento está assim e não há o que fazer',
            'Pedir que ele fale mais baixo antes de ouvir', 'Ouvir sem interromper e pedir desculpas pela espera'], 3),
        q('DEMO-ATE-14', 'reclamacoes', 2, 'Uma cliente diz que foi cobrada duas vezes pelo mesmo serviço. O que deve ser feito?',
          ['Dizer que o sistema não erra e encerrar a conversa', 'Conferir os pagamentos e corrigir, se houver erro',
            'Devolver o dinheiro na hora, sem conferir nada', 'Pedir que ela reclame no banco dela'], 1),
        q('DEMO-ATE-15', 'reclamacoes', 3, 'Um cliente muito irritado começa a ofender você no balcão. O que deve ser feito?',
          ['Responder no mesmo tom, para ele se acalmar', 'Ignorar o cliente e atender outra pessoa',
            'Manter a calma, sem revidar, e chamar a pessoa responsável', 'Dizer que ele está errado e encerrar o assunto'], 2),
        q('DEMO-ATE-16', 'sigilo', 1, 'Uma pessoa pede, no balcão, o telefone de outro cliente da loja. O que deve ser feito?',
          ['Explicar que o dado é do cliente e oferecer levar um recado', 'Passar o telefone, porque é só um número',
            'Mostrar a ficha do cliente para a pessoa copiar', 'Passar o número, se a pessoa disser que conhece bem o cliente'], 0),
        q('DEMO-ATE-17', 'sigilo', 2, 'Você precisa sair da recepção por alguns minutos. A tela do computador mostra a ficha de um paciente. O que deve ser feito?',
          ['Deixar a ficha aberta para não perder tempo', 'Pedir a um colega de outro setor que olhe a tela',
            'Bloquear a tela ou fechar a ficha antes de sair', 'Deixar a ficha aberta, com um aviso de volto já'], 2),
        q('DEMO-ATE-18', 'sigilo', 3, 'Uma pessoa diz, por mensagem, que é parente de um cliente e pede o endereço dele. O que deve ser feito?',
          ['Passar o endereço, porque a pessoa disse que é parente', 'Explicar que os dados só são passados ao próprio cliente',
            'Pedir a foto de um documento e então passar o endereço', 'Passar só o bairro, sem o nome da rua'], 1)
      ] },
    { slug: 'vendas', nome: 'Vendas no varejo', minutos: 20,
      descricao: 'O básico de quem vende no balcão: entender o que o cliente precisa, apresentar o produto, preço e desconto, troca e pós-venda.',
      competencias: [{ id: 'abordagem', nome: 'Abordagem e necessidade do cliente' }, { id: 'apresentacao', nome: 'Apresentação do produto e fechamento' },
        { id: 'objecoes', nome: 'Objeções, negociação e preço' }, { id: 'troca', nome: 'Troca, devolução e direitos do consumidor' },
        { id: 'posvenda', nome: 'Pós-venda e relacionamento' }],
      questoes: [
        q('DEMO-VEN-01', 'abordagem', 1, 'Um cliente entra na loja e olha as prateleiras. Qual é a forma correta de abordar?',
          ['Cumprimentar e perguntar se pode ajudar a encontrar algo', 'Seguir o cliente de perto, sem dizer nada',
            'Esperar o cliente chamar, mesmo que demore', 'Oferecer logo o produto mais caro da loja, para ganhar tempo'], 0),
        q('DEMO-VEN-02', 'abordagem', 1, 'Para indicar o produto certo, o que deve ser feito primeiro?',
          ['Mostrar o produto que dá mais comissão', 'Falar o preço de todos os produtos parecidos da loja',
            'Perguntar para que o cliente vai usar o produto', 'Pegar o primeiro produto da prateleira'], 2),
        q('DEMO-VEN-03', 'abordagem', 2, 'Uma cliente diz que só está olhando. O que é correto fazer?',
          ['Insistir até ela escolher algum produto da vitrine', 'Dizer que fica à disposição e deixá-la à vontade', 'Sair de perto sem responder nada',
            'Perguntar quanto ela pode gastar hoje'], 1),
        q('DEMO-VEN-04', 'abordagem', 3, 'Um cliente quer uma tinta para pintar o banheiro. Qual informação é mais importante para indicar o produto certo?',
          ['A cor preferida da família', 'Se o cliente já comprou na loja antes', 'Quantas pessoas moram na casa',
            'Se a parede pega vapor e umidade do banho'], 3),
        q('DEMO-VEN-05', 'apresentacao', 1, 'Ao mostrar um produto, o que deve ser explicado ao cliente?',
          ['Quantas unidades a loja vendeu neste mês', 'Quanto a loja pagou ao fornecedor', 'Como o produto atende ao que o cliente precisa',
            'Qual dos produtos dá mais comissão para quem vende'], 2),
        q('DEMO-VEN-06', 'apresentacao', 2, 'O cliente decidiu comprar uma geladeira. O que deve ser confirmado antes de fechar a venda?',
          ['As medidas do lugar onde ela vai ficar', 'Se o cliente gosta de cozinhar', 'A cor das paredes da cozinha',
            'Se o cliente tem outros eletrodomésticos'], 0),
        q('DEMO-VEN-07', 'apresentacao', 2, 'Um cliente pergunta se o produto tem garantia. A etiqueta mostra 12 meses de garantia do fabricante. Qual é a resposta correta?',
          ['Que a garantia é só de 7 dias', 'Que a loja não trabalha com garantia', 'Que só tem garantia se pagar à vista',
            'Que tem 12 meses de garantia do fabricante'], 3),
        q('DEMO-VEN-08', 'apresentacao', 3, 'O produto que o cliente pediu acabou no estoque. Há outro parecido, mais caro. O que é correto fazer?',
          ['Dizer que é o mesmo produto e cobrar o preço novo', 'Avisar que acabou e mostrar a outra opção e o preço',
            'Prometer a entrega sem saber quando o produto chega', 'Encerrar o atendimento, porque o produto acabou'], 1),
        q('DEMO-VEN-09', 'objecoes', 1, 'O cliente diz que achou o preço alto. Qual é a atitude correta?',
          ['Dizer que o cliente não entende nada desse tipo de produto', 'Explicar o que o preço inclui e as formas de pagamento',
            'Baixar o preço sem consultar ninguém', 'Mudar de assunto e mostrar outro setor'], 1),
        q('DEMO-VEN-10', 'objecoes', 2, 'A loja permite 5% de desconto no pagamento à vista. O cliente pede 15%. O que deve ser feito?',
          ['Dar os 15% para não perder a venda', 'Dar 10%, o meio-termo entre os dois', 'Recusar qualquer desconto ao cliente',
            'Oferecer os 5% que a loja permite'], 3),
        q('DEMO-VEN-11', 'objecoes', 3, 'O cliente diz que outra loja vende o mesmo produto mais barato. O que é correto fazer?',
          ['Mostrar as vantagens da loja e consultar se dá para cobrir', 'Dizer que a outra loja vende produto falso',
            'Pedir que ele compre na outra loja, então', 'Baixar o preço por conta própria, sem perguntar à gerência'], 0),
        q('DEMO-VEN-12', 'objecoes', 3, 'O cliente gostou do produto, mas diz que precisa pensar. O que deve ser feito?',
          ['Insistir até ele aceitar levar hoje', 'Dizer que o preço muda amanhã, para ele decidir já',
            'Tirar as dúvidas e passar o contato da loja', 'Deixar o cliente sozinho, sem responder'], 2),
        q('DEMO-VEN-13', 'troca', 1, 'A loja aceita troca em 30 dias, com a etiqueta. Um cliente quer trocar o tamanho de uma camisa comprada há 10 dias. O que deve ser feito?',
          ['Recusar, porque a roupa já foi levada para a casa dele', 'Cobrar uma taxa para fazer a troca', 'Pedir que ele volte só no fim do mês',
            'Fazer a troca, porque está dentro da regra da loja'], 3),
        q('DEMO-VEN-14', 'troca', 2, 'Um produto comprado na loja apresentou defeito dentro da garantia. O que o cliente tem direito de pedir?',
          ['Só um desconto na próxima compra', 'Que o defeito seja consertado no prazo da lei', 'Nada, se ele já usou o produto',
            'Só a troca por um produto mais barato'], 1),
        q('DEMO-VEN-15', 'troca', 3, 'Uma cliente comprou um celular pelo site da loja. Ela quer desistir 5 dias depois de receber. O que diz a regra das compras feitas fora da loja?',
          ['Ela só pode trocar por outro produto da loja', 'Ela perde o dinheiro, porque já abriu a caixa',
            'Ela pode desistir em até 7 dias e receber de volta', 'Ela pode desistir, mas paga uma multa de 50%'], 2),
        q('DEMO-VEN-16', 'posvenda', 1, 'Depois da venda, o que deve ser entregue ao cliente?',
          ['A nota fiscal e as informações da garantia', 'Um cartão com o telefone pessoal de quem vendeu', 'Só o produto, bem embrulhado',
            'Um cupom para indicar amigos'], 0),
        q('DEMO-VEN-17', 'posvenda', 2, 'A loja manda ofertas para clientes que autorizaram. Um cliente pede para sair da lista. O que deve ser feito?',
          ['Continuar enviando, porque ele já comprou antes', 'Mandar só as ofertas mais importantes',
            'Tirar o número da lista e parar de enviar ofertas', 'Pedir que ele bloqueie o número da loja'], 2),
        q('DEMO-VEN-18', 'posvenda', 3, 'Um cliente volta dizendo que não sabe usar o produto que comprou. O que é correto fazer?',
          ['Dizer que o manual explica tudo', 'Explicar com calma como usar e conferir se ficou claro',
            'Cobrar pela explicação, porque a venda acabou', 'Oferecer a troca por outro produto mais simples de usar'], 1)
      ] },
    { slug: 'administrativo', nome: 'Rotina administrativa', minutos: 20,
      descricao: 'O básico da rotina de escritório: documentos, planilha, e-mail, contas a pagar e agenda.',
      competencias: [{ id: 'documentos', nome: 'Organização de documentos' }, { id: 'planilha', nome: 'Planilha básica' },
        { id: 'email', nome: 'E-mail e comunicação escrita' }, { id: 'contas', nome: 'Notas, recibos e contas a pagar' },
        { id: 'rotina', nome: 'Agenda e rotina do escritório' }],
      questoes: [
        q('DEMO-ADM-01', 'documentos', 1, 'Onde devem ficar os documentos de um cliente depois de usados?',
          ['Na pasta certa, no arquivo ou no armário', 'Em cima da mesa, para achar mais rápido depois', 'Na gaveta de quem atendeu o cliente',
            'Junto com os papéis que vão para o lixo'], 0),
        q('DEMO-ADM-02', 'documentos', 1, 'As pastas estão em ordem alfabética pelo nome da empresa. Onde deve entrar a pasta "Mercado Central"?',
          ['Entre "Açougue Boi Bom" e "Bazar Lima"', 'Entre "Padaria Sol" e "Sorveteria Gelo"', 'Entre "Loja Azul" e "Oficina Rápida"',
            'Depois de "Vidraçaria Nova", no fim do arquivo'], 2),
        q('DEMO-ADM-03', 'documentos', 2, 'Um papel com dados pessoais de um funcionário não é mais necessário. O que deve ser feito com ele?',
          ['Jogar o papel inteiro no lixo comum', 'Picar bem o papel antes de jogar fora', 'Usar o verso como papel de rascunho',
            'Deixar na mesa para alguém decidir'], 1),
        q('DEMO-ADM-04', 'documentos', 3, 'As pastas do arquivo são separadas por mês. Qual nome de pasta deixa os meses em ordem, ano após ano?',
          ['Março de 2026', 'Mar-26', '03-2026', '2026-03'], 3),
        q('DEMO-ADM-05', 'planilha', 1, 'Numa planilha de clientes, cada linha é um cliente. O que deve ir na primeira linha?',
          ['O cliente mais antigo da empresa', 'O total de clientes do mês', 'Os títulos das colunas, como nome e telefone',
            'A data em que a planilha foi criada pela empresa'], 2),
        q('DEMO-ADM-06', 'planilha', 2, 'Numa planilha, a célula B2 tem 150 e a célula B3 tem 250. Qual fórmula soma as duas?',
          ['=B2+B3', '=B2*B3', '=B2-B3', '=B2/B3'], 0),
        q('DEMO-ADM-07', 'planilha', 2, 'Uma planilha de vendas tem a coluna "Valor". O que deve ser feito para ver primeiro as maiores vendas?',
          ['Apagar as linhas com valores pequenos', 'Pintar de amarelo as vendas maiores', 'Digitar as vendas de novo, em outra ordem',
            'Ordenar a coluna "Valor" do maior para o menor'], 3),
        q('DEMO-ADM-08', 'planilha', 3, 'A coluna C tem os preços dos produtos, da linha 2 até a linha 31. Qual fórmula soma todos os preços?',
          ['=SOMA(C2;C31)', '=SOMA(C2:C31)', '=MÉDIA(C2:C31)', '=CONT.NÚM(C2:C31)'], 1),
        q('DEMO-ADM-09', 'email', 1, 'Antes de enviar um e-mail de trabalho, o que deve ser conferido?',
          ['Se o texto tem cores e figurinhas', 'O endereço, o assunto e se o anexo foi junto', 'Se o texto está todo escrito em letras maiúsculas',
            'Se o e-mail vai sair antes do almoço'], 1),
        q('DEMO-ADM-10', 'email', 2, 'Qual é o melhor assunto para um e-mail que envia ao cliente a nota fiscal de setembro?',
          ['Oi', 'Urgente!!!', 'Documento', 'Nota fiscal de setembro'], 3),
        q('DEMO-ADM-11', 'email', 3, 'Um e-mail chegou com cópia para cinco pessoas. A resposta interessa só a quem enviou. O que deve ser feito?',
          ['Responder só para quem enviou', 'Responder para todos que estão na cópia', 'Encaminhar para um colega responder',
            'Mandar a resposta por mensagem para todos'], 0),
        q('DEMO-ADM-12', 'email', 3, 'Um e-mail pede para clicar num link e informar a senha do banco da empresa. O que deve ser feito?',
          ['Clicar e informar a senha, se o e-mail parecer do banco', 'Responder o e-mail pedindo mais detalhes',
            'Avisar a pessoa responsável e apagar o e-mail sem clicar', 'Encaminhar aos colegas para ver se é verdade'], 2),
        q('DEMO-ADM-13', 'contas', 1, 'Chegou a conta de luz da empresa. O que deve ser anotado para ela ser paga em dia?',
          ['O nome de quem entregou a conta', 'O consumo do mês anterior', 'A hora em que a conta chegou', 'O valor e a data de vencimento'], 3),
        q('DEMO-ADM-14', 'contas', 2, 'Um cliente pagou R$ 350,00 em dinheiro por um serviço. O que deve ser entregue a ele?',
          ['Só um agradecimento, porque o pagamento foi em dinheiro', 'Um recibo com valor, data, serviço e assinatura', 'Uma cópia do contrato da empresa',
            'Um papel com o valor escrito a lápis'], 1),
        q('DEMO-ADM-15', 'contas', 3, 'Uma conta de R$ 200,00 venceu ontem. A multa por atraso é de 2%, sem juros. Quanto deve ser pago hoje?',
          ['R$ 200,00', 'R$ 202,00', 'R$ 204,00', 'R$ 220,00'], 2, { conta: '200 + 200 * 0.02' }),
        q('DEMO-ADM-16', 'rotina', 1, 'A gerente pediu para você lembrar de uma reunião na sexta, às 14h. Qual é a forma mais segura de não esquecer?',
          ['Anotar na agenda o dia, a hora e o assunto', 'Guardar a informação só de cabeça', 'Escrever num papel solto e deixar em cima da mesa',
            'Pedir a um colega para lembrar você'], 0),
        q('DEMO-ADM-17', 'rotina', 2, 'Chegou uma encomenda para um colega que está de férias. O que deve ser feito?',
          ['Recusar a entrega até o colega voltar', 'Abrir a caixa para saber o que é', 'Receber, conferir e registrar onde ela foi guardada',
            'Deixar a caixa na porta da sala dele'], 2),
        q('DEMO-ADM-18', 'rotina', 3, 'Há três tarefas para hoje: pagar uma conta que vence hoje, arquivar papéis antigos e arrumar a mesa. Qual deve ser feita primeiro?',
          ['Arquivar os papéis antigos', 'Pagar a conta que vence hoje', 'Arrumar a mesa', 'A que for mais rápida de fazer'], 1)
      ] },
    { slug: 'caixa', nome: 'Caixa e matemática prática', minutos: 25,
      descricao: 'O básico do caixa: troco, desconto, parcelas, Pix e cartão, abertura e fechamento.',
      competencias: [{ id: 'troco', nome: 'Troco e contagem de dinheiro' }, { id: 'desconto', nome: 'Porcentagem e desconto' },
        { id: 'parcelamento', nome: 'Juros e parcelamento' }, { id: 'pagamentos', nome: 'Pix, cartão e dinheiro' },
        { id: 'fechamento', nome: 'Abertura, fechamento e conferência do caixa' }],
      questoes: [
        q('DEMO-CAI-01', 'troco', 1, 'No caixa há 3 notas de R$ 20,00, 4 notas de R$ 5,00 e 6 moedas de R$ 1,00. Quanto dinheiro há no caixa?',
          ['R$ 76,00', 'R$ 86,00', 'R$ 96,00', 'R$ 106,00'], 1, { conta: '3 * 20 + 4 * 5 + 6 * 1' }),
        q('DEMO-CAI-02', 'troco', 1, 'A compra deu R$ 36,75. O cliente pagou com R$ 50,00. Qual é o troco?',
          ['R$ 13,25', 'R$ 13,75', 'R$ 14,25', 'R$ 23,25'], 0, { conta: '50 - 36.75' }),
        q('DEMO-CAI-03', 'troco', 2, 'A compra deu R$ 23,00. Para facilitar o troco, o cliente pagou com R$ 53,00. Qual é o troco?',
          ['R$ 20,00', 'R$ 27,00', 'R$ 30,00', 'R$ 33,00'], 2, { conta: '53 - 23' }),
        q('DEMO-CAI-04', 'troco', 3, 'O caixa só tem notas de R$ 10,00 e moedas de R$ 1,00. O troco é R$ 27,00. Qual forma de dar o troco usa menos peças?',
          ['27 moedas de R$ 1,00', '1 nota de R$ 10,00 e 17 moedas de R$ 1,00', '2 notas de R$ 10,00 e 7 moedas de R$ 1,00',
            '3 notas de R$ 10,00 e 3 moedas de R$ 1,00'], 2),
        q('DEMO-CAI-05', 'desconto', 1, 'Um produto custa R$ 100,00 e está com 10% de desconto. Qual é o preço com desconto?',
          ['R$ 80,00', 'R$ 90,00', 'R$ 95,00', 'R$ 110,00'], 1, { conta: '100 - 100 * 0.10' }),
        q('DEMO-CAI-06', 'desconto', 2, 'Uma blusa custa R$ 80,00. No Pix, a loja dá 5% de desconto. Quanto o cliente paga no Pix?',
          ['R$ 72,00', 'R$ 75,00', 'R$ 76,00', 'R$ 78,00'], 2, { conta: '80 - 80 * 0.05' }),
        q('DEMO-CAI-07', 'desconto', 2, 'Um produto de R$ 60,00 tem 25% de desconto. De quanto é o desconto, em reais?',
          ['R$ 6,00', 'R$ 12,00', 'R$ 15,00', 'R$ 25,00'], 2, { conta: '60 * 0.25' }),
        q('DEMO-CAI-08', 'desconto', 3, 'Um produto custava R$ 50,00 e agora custa R$ 40,00. De quantos por cento foi o desconto?',
          ['10%', '20%', '25%', '40%'], 1, { conta: '(50 - 40) / 50 * 100' }),
        q('DEMO-CAI-09', 'parcelamento', 1, 'Uma compra de R$ 300,00 foi dividida em 3 parcelas iguais, sem juros. Qual é o valor de cada parcela?',
          ['R$ 90,00', 'R$ 100,00', 'R$ 110,00', 'R$ 150,00'], 1, { conta: '300 / 3' }),
        q('DEMO-CAI-10', 'parcelamento', 2, 'Um produto custa R$ 240,00 à vista ou 4 parcelas de R$ 65,00. Quanto o cliente paga a mais no parcelado?',
          ['R$ 5,00', 'R$ 15,00', 'R$ 20,00', 'R$ 25,00'], 2, { conta: '4 * 65 - 240' }),
        q('DEMO-CAI-11', 'parcelamento', 3, 'Uma geladeira custa R$ 2.000,00 à vista. No crediário, são 10 parcelas de R$ 230,00. Qual é o total pago no crediário?',
          ['R$ 2.030,00', 'R$ 2.230,00', 'R$ 2.300,00', 'R$ 2.400,00'], 2, { conta: '10 * 230' }),
        q('DEMO-CAI-12', 'parcelamento', 3, 'O cliente quer pagar R$ 450,00 em parcelas iguais, sem juros, de no máximo R$ 100,00. Qual é o menor número de parcelas?',
          ['4 parcelas', '5 parcelas', '6 parcelas', '9 parcelas'], 1, { conta: '(450 + 50) / 100' }),
        q('DEMO-CAI-13', 'pagamentos', 1, 'O cliente vai pagar com Pix. O que deve ser conferido antes de liberar a compra?',
          ['Se o valor entrou na conta da loja', 'Só a tela do celular do cliente', 'Se o cliente guardou o comprovante',
            'Se o aplicativo do banco do cliente está aberto'], 0),
        q('DEMO-CAI-14', 'pagamentos', 2, 'O cliente vai pagar no débito, na maquininha. Quem deve digitar a senha?',
          ['A pessoa do caixa, para ir mais rápido', 'O cliente, falando a senha em voz alta', 'Qualquer pessoa da fila que saiba usar',
            'O próprio cliente, sem ninguém olhar'], 3),
        q('DEMO-CAI-15', 'pagamentos', 3, 'Um cliente paga com uma nota de R$ 100,00 que parece diferente das outras. O que deve ser feito?',
          ['Aceitar, porque recusar pode ofender o cliente', 'Conferir os sinais de segurança antes de aceitar',
            'Aceitar e passar a nota no troco do próximo cliente', 'Guardar a nota e chamar a polícia na hora'], 1),
        q('DEMO-CAI-16', 'fechamento', 1, 'Ao abrir o caixa, o que deve ser feito primeiro?',
          ['Contar o fundo de troco e anotar o valor', 'Começar a atender sem contar o dinheiro', 'Pegar troco emprestado do caixa ao lado',
            'Esperar o primeiro cliente para contar'], 0),
        q('DEMO-CAI-17', 'fechamento', 2, 'O caixa abriu com R$ 100,00 de troco. As vendas em dinheiro somaram R$ 850,00. Quanto deve haver em dinheiro no fechamento?',
          ['R$ 750,00', 'R$ 850,00', 'R$ 950,00', 'R$ 1.050,00'], 2, { conta: '100 + 850' }),
        q('DEMO-CAI-18', 'fechamento', 3, 'No fechamento, o sistema mostra R$ 1.200,00 em dinheiro, mas a contagem deu R$ 1.180,00. O que deve ser feito?',
          ['Completar a diferença com dinheiro do próprio bolso', 'Contar de novo e avisar a diferença ao responsável',
            'Mudar o valor do sistema para R$ 1.180,00', 'Deixar para conferir no dia seguinte'], 1)
      ] },
    { slug: 'portugues', nome: 'Português prático', minutos: 20,
      descricao: 'O básico do português no trabalho: escrita correta, concordância, entender avisos e escrever mensagens.',
      competencias: [{ id: 'ortografia', nome: 'Ortografia e acentuação' }, { id: 'concordancia', nome: 'Concordância e uso correto' },
        { id: 'interpretacao', nome: 'Interpretação de avisos e mensagens' }, { id: 'mensagem', nome: 'Mensagem profissional' }],
      questoes: [
        q('DEMO-POR-01', 'ortografia', 1, 'Qual palavra está escrita da forma correta?', ['Excessão', 'Exceção', 'Esceção', 'Eceção'], 1),
        q('DEMO-POR-02', 'ortografia', 1, 'Qual palavra está acentuada da forma correta?', ['Ônibus', 'Onibús', 'Ônibús', 'Onibus'], 0),
        q('DEMO-POR-03', 'ortografia', 2, 'Qual aviso está escrito da forma correta?',
          ['A loja abre as 9h.', 'A loja abre à 9h.', 'A loja abre às 9h.', 'A loja abre há 9h.'], 2),
        q('DEMO-POR-04', 'ortografia', 3, 'Qual opção completa a frase "O cliente quer saber ___ o pedido atrasou"?',
          ['porque', 'porquê', 'por quê', 'por que'], 3),
        q('DEMO-POR-05', 'ortografia', 3, 'Qual frase de boas-vindas está escrita da forma correta?',
          ['Seja bem-vindo à loja.', 'Seje bem-vindo à loja.', 'Seja bem vindo à loja.', 'Seja bem-vindo a loja.'], 0),
        q('DEMO-POR-06', 'concordancia', 1, 'Qual frase está correta?',
          ['Os produtos chegou hoje.', 'Os produto chegaram hoje.', 'Os produtos chegaram hoje.', 'Os produto chegou hoje.'], 2),
        q('DEMO-POR-07', 'concordancia', 1, 'Qual frase do aviso está correta?',
          ['Nós vai fechar mais cedo hoje.', 'Nós vamos fechar mais cedo hoje.', 'Nós vamo fechar mais cedo hoje.', 'Nós ir fechar mais cedo hoje.'], 1),
        q('DEMO-POR-08', 'concordancia', 2, 'Qual frase está de acordo com a norma da língua?',
          ['Ficou prontas as duas encomendas.', 'Ficaram pronta as duas encomendas.', 'Ficou pronto as duas encomendas.',
            'Ficaram prontas as duas encomendas.'], 3),
        q('DEMO-POR-09', 'concordancia', 3, 'Qual frase está de acordo com a norma da língua, para usar num recado?',
          ['Faz dois meses que o pedido chegou.', 'Fazem dois meses que o pedido chegou.', 'Faz dois meses que o pedido chegaram.',
            'Fazem dois meses que os pedido chegou.'], 0),
        q('DEMO-POR-10', 'interpretacao', 1, 'Segundo o aviso, até que horas a loja funciona hoje?',
          ['Até as 8h', 'Até as 12h', 'Até as 13h', 'Até as 18h'], 2,
          { texto: 'AVISO: Hoje, sábado, a loja fecha às 13h. Na segunda-feira, abrimos no horário normal, às 8h.' }),
        q('DEMO-POR-11', 'interpretacao', 2, 'Um cliente comprou um produto em promoção que veio com defeito. Segundo o aviso, ele pode trocar?',
          ['Sim, porque o produto veio com defeito', 'Sim, mas só depois de 30 dias', 'Não, porque o produto estava em promoção',
            'Não, porque a troca é só sem defeito'], 0,
          { texto: 'Troca só com a nota fiscal, em até 30 dias. Produto em promoção não tem troca, exceto se tiver defeito.' }),
        q('DEMO-POR-12', 'interpretacao', 2, 'Segundo o recado, quando chega a entrega?',
          ['Na quinta-feira, às 10h', 'Na sexta-feira, às 10h', 'Na quinta-feira, às 15h', 'Na sexta-feira, às 15h'], 1,
          { texto: 'Recado: o fornecedor ligou. A entrega de quinta-feira passou para sexta-feira, no mesmo horário, às 10h.' }),
        q('DEMO-POR-13', 'interpretacao', 3, 'Um pedido foi feito no sábado, às 17h. Segundo o aviso, quando ele sai para entrega?',
          ['No sábado, no mesmo dia', 'No domingo', 'Na segunda-feira', 'Na terça-feira'], 2,
          { texto: 'Pedidos feitos até as 16h saem no mesmo dia. Depois disso, saem no dia seguinte. Não fazemos entregas aos domingos.' }),
        q('DEMO-POR-14', 'mensagem', 1, 'Qual é a melhor mensagem para avisar um cliente que o pedido está pronto?',
          ['Bom dia! Seu pedido está pronto. Pode retirar até as 18h.', 'E aí, pedido pronto, vem buscar logo antes que feche.',
            'Seu pedido. Pronto. Retirar. Até 18h. Obrigado.', 'Bom dia! Talvez seu pedido esteja pronto, passe aqui um dia.'], 0),
        q('DEMO-POR-15', 'mensagem', 2, 'Um cliente pergunta por mensagem se o conserto ficou pronto. Ainda falta uma peça. Qual é a melhor resposta?',
          ['Boa tarde! Ainda não ficou pronto, depois a gente vê isso com calma e responde.',
            'Boa tarde! Está quase pronto, pode vir buscar amanhã cedo que deve estar aqui.',
            'Boa tarde! Ainda falta uma peça. Ela chega quinta, e avisamos assim que ficar pronto.',
            'Boa tarde! O técnico é quem sabe, pergunte para ele quando passar aqui na loja.'], 2),
        q('DEMO-POR-16', 'mensagem', 2, 'Qual é a forma mais adequada de começar um e-mail para um cliente que você ainda não conhece?',
          ['Fala, tudo certo? É sobre o seu pedido.', 'Bom dia. Escrevo para confirmar o seu pedido.', 'Oi, querido! Seu pedido, tudo em ordem?',
            'E aí, cliente, bora falar do pedido?'], 1),
        q('DEMO-POR-17', 'mensagem', 3, 'Um cliente reclamou de um atraso por mensagem. Qual é a resposta mais adequada?',
          ['O atraso não foi culpa nossa. A transportadora é que demorou demais desta vez.',
            'Calma, atrasos acontecem. Uma hora o seu pedido vai chegar aí na sua casa.',
            'Pedimos desculpas. Não sabemos quando chega, mas qualquer dia desses ele chega.',
            'Pedimos desculpas pelo atraso. Seu pedido sai hoje e chega amanhã até as 12h.'], 3),
        q('DEMO-POR-18', 'mensagem', 3, 'Qual mensagem informa melhor os clientes sobre a mudança de horário da loja?',
          ['A partir de 1º de dezembro, abrimos de segunda a sábado, das 8h às 18h.',
            'Mudou o horário. Agora abrimos mais cedo e fechamos um pouco mais tarde.',
            'Atenção: horário novo em breve! Fique de olho, que logo avisamos tudo.',
            'Horário novo: abrimos às 8h e fechamos às 18h, mas ainda sem data.'], 0)
      ] }
  ];
  var QUESTAO_DEMO = {};
  TESTES_DEMONSTRACAO.forEach(function (t) { t.questoes.forEach(function (x) { QUESTAO_DEMO[x.id] = x; }); });

  // Motor da prova de demonstração. c = {estado() -> st, agora(), novoId(), usuario(uid), cidade(slug), contaAtual(tipo), R}.
  // Devolve as RPCs (mesmos nomes, argumentos, respostas e erros da migração 20261023) para o criarBackend pôr em H.
  function provaDemonstracao(c) {
    var DIA_MS = 86400000;
    var R = c.R;
    function st() { return c.estado(); }
    function agora() { return c.agora(); }
    function iso(ms) { return ms == null ? null : new Date(ms).toISOString(); }
    function copia(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
    function falha(codigo, extra) { return Object.assign({ ok: false, erro: MSG_PROVA[codigo], codigo: codigo }, extra || {}); }
    function inteiro(v) {
      var n = typeof v === 'number' ? v : (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v) ? Number(v) : NaN);
      return Number.isInteger(n) ? n : null;
    }
    function teste(slug) { return TESTES_DEMONSTRACAO.filter(function (t) { return t.slug === slug; })[0] || null; }
    function sorteio(n) { return Math.floor(Math.random() * n); }
    function embaralhar(lista) {
      var a = lista.slice();
      for (var i = a.length - 1; i > 0; i--) { var j = sorteio(i + 1); var x = a[i]; a[i] = a[j]; a[j] = x; }
      return a;
    }
    // Datas do selo no fuso da cidade da pessoa (reserva America/Sao_Paulo), como a migração da onda 2 do banco.
    function fusoDe(uid) { var p = st().pessoas[uid]; var cid = p ? c.cidade(p.cidade) : null; return (cid && cid.fuso) || 'America/Sao_Paulo'; }
    function diaDe(uid, ms) { return R.hoje(fusoDe(uid), ms == null ? agora() : ms); }
    function dataBR(d) { return d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4); }
    function somarMeses(d, n) {
      var a = Number(d.slice(0, 4)); var m = Number(d.slice(5, 7)) - 1 + n; var dia = Number(d.slice(8, 10));
      a += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
      var ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
      return a + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + Math.min(dia, ultimo)).slice(-2);
    }
    // Estado da prova dentro do "banco" da prévia. Os selos fictícios da semente passam a morar aqui (com a dona); st.selos[uid]
    // continua sendo o que vai no cartão (válido de maior nota por teste, o gancho vagas_interno.selos_cartao).
    function dados() {
      var s = st();
      if (!s.provaDemo) {
        var selos = [];
        Object.keys(s.selos || {}).forEach(function (uid) {
          (s.selos[uid] || []).forEach(function (x) {
            selos.push({ uid: uid, codigo: String(x.codigo || ''), teste: x.teste, tentativa: null, nota: x.nota, questoes: x.questoes || REGRAS_PROVA.questoes,
              data: x.data, validoAte: x.validoAte, supervisao: x.supervisao === 'presencial' ? 'presencial' : 'online', revogado: false, semente: true });
          });
        });
        s.provaDemo = { tentativas: [], selos: selos };
      }
      return s.provaDemo;
    }
    function usuarioAtual() { var uid = st().sessao; return uid && c.usuario(uid) ? uid : null; }
    function tentativasDe(uid, slug) { return dados().tentativas.filter(function (t) { return t.uid === uid && (!slug || t.teste === slug); }); }
    function tentativaDe(uid, id) { return dados().tentativas.filter(function (t) { return t.uid === uid && t.id === String(id == null ? '' : id); })[0] || null; }

    // Prazo: a questão que já está na tela (mostrada e sem resposta) vale até maior(fim, hora em que apareceu) + 10 s.
    function prazo(tt) {
      var item = tt.itens[tt.respondidas];
      if (item && item.exibidaEm != null && item.respondidaEm == null) return Math.max(tt.terminaEm, item.exibidaEm) + REGRAS_PROVA.toleranciaSeg * 1000;
      return tt.terminaEm;
    }
    function vencida(tt) { return tt.status === 'aberta' && agora() > prazo(tt); }
    function segundos(tt) { return Math.max(0, Math.floor((tt.terminaEm - agora()) / 1000)); }

    function seloJson(s) {
      var t = teste(s.teste);
      var revogado = !!s.revogado;
      return { codigo: s.codigo, teste: s.teste, nome: t ? t.nome : s.teste, nota: revogado ? null : s.nota, margem: REGRAS_PROVA.margem,
        questoes: s.questoes || REGRAS_PROVA.questoes, data: s.data, validoAte: s.validoAte, supervisao: s.supervisao,
        situacao: revogado ? 'revogado' : (s.validoAte < diaDe(s.uid) ? 'vencido' : 'valido') };
    }
    function melhorSelo(uid, slug) {
      var hoje = diaDe(uid);
      return dados().selos.filter(function (s) { return s.uid === uid && s.teste === slug && !s.revogado && s.validoAte >= hoje; })
        .sort(function (a, b) { return b.nota - a.nota || (a.data < b.data ? 1 : a.data > b.data ? -1 : 0); })[0] || null;
    }
    // O cartão (st.selos[uid]) recebe só o selo válido de maior nota de cada teste, sem "situacao" (formato de selos_cartao).
    function atualizarCartao(uid) {
      var temAlgum = dados().selos.some(function (s) { return s.uid === uid; });
      if (!temAlgum && !(st().selos && st().selos[uid])) return;
      st().selos = st().selos || {};
      st().selos[uid] = TESTES_DEMONSTRACAO.map(function (t) { return melhorSelo(uid, t.slug); }).filter(Boolean).map(function (s) {
        var j = seloJson(s);
        delete j.situacao;
        return j;
      });
    }
    function novoCodigoSelo() {
      var c8;
      do {
        c8 = '';
        for (var i = 0; i < 8; i++) c8 += ALFABETO_SELO.charAt(sorteio(32));
      } while (dados().selos.some(function (s) { return s.codigo === c8; }));
      return c8;
    }

    // Igual a vagas_interno.teste_fechar: nota, acertos por competência, alertas (só registro) e o selo com nota ≥ 60.
    function fechar(tt) {
      if (tt.status !== 'aberta') return;
      var t = teste(tt.teste);
      var respondidos = tt.itens.filter(function (i) { return i.respondidaEm != null; });
      var acertos = respondidos.filter(function (i) { return i.correta; }).length;
      var rapidas = respondidos.filter(function (i) { return i.respondidaEm - i.exibidaEm < REGRAS_PROVA.rapidaSeg * 1000; }).length;
      var fim = Math.min(agora(), tt.terminaEm + REGRAS_PROVA.toleranciaSeg * 1000);
      tt.porCompetencia = t.competencias.map(function (comp) {
        var itens = tt.itens.filter(function (i) { return QUESTAO_DEMO[i.id].competencia === comp.id; });
        return { id: comp.id, nome: comp.nome, acertos: itens.filter(function (i) { return i.respondidaEm != null && i.correta; }).length, total: itens.length };
      }).filter(function (x) { return x.total > 0; });
      tt.alertas = [];
      if (rapidas * 3 >= tt.total) tt.alertas.push('respostas_rapidas');
      if (tt.sinais.trocasAba >= 3) tt.alertas.push('troca_aba');
      if (tt.sinais.copias >= 1) tt.alertas.push('copiou_texto');
      tt.status = tt.respondidas >= tt.total || agora() <= tt.terminaEm ? 'concluida' : 'tempo_esgotado';
      tt.finalizadaEm = fim;
      tt.acertos = acertos;
      tt.nota = Math.floor((100 * acertos) / tt.total + 0.5 + 1e-9);
      tt.notaMinima = REGRAS_PROVA.notaMinima;
      tt.sinais.respostasRapidas = rapidas;
      tt.sinais.duracaoSeg = Math.max(0, Math.floor((fim - tt.iniciadaEm) / 1000));
      if (tt.nota >= tt.notaMinima) {
        var data = diaDe(tt.uid, fim);
        dados().selos.push({ uid: tt.uid, codigo: novoCodigoSelo(), teste: tt.teste, tentativa: tt.id, nota: tt.nota, questoes: tt.total, data: data,
          validoAte: somarMeses(data, REGRAS_PROVA.validadeMeses), supervisao: 'online', revogado: false, semente: false });
        atualizarCartao(tt.uid);
      }
    }
    function fecharVencidas(uid) { tentativasDe(uid).forEach(function (tt) { if (vencida(tt)) fechar(tt); }); }
    // Início da última tentativa que conta para os 30 dias (ao menos 1 questão mostrada). O selo fictício da semente conta como
    // uma tentativa feita no dia do selo (no banco real ele sempre vem de uma tentativa).
    function ultimoInicio(uid, slug) {
      var ini = null;
      tentativasDe(uid, slug).forEach(function (tt) {
        if (tt.itens.some(function (i) { return i.exibidaEm != null; }) && (ini === null || tt.iniciadaEm > ini)) ini = tt.iniciadaEm;
      });
      dados().selos.forEach(function (s) {
        if (s.uid !== uid || s.teste !== slug || !s.semente) return;
        var t = Date.parse(s.data + 'T12:00:00Z');
        if (isFinite(t) && (ini === null || t > ini)) ini = t;
      });
      return ini;
    }

    // Sorteio igual a vagas_interno.teste_sortear: 15 = 6 fáceis, 6 médias e 3 difíceis, n/C por competência (ordem sorteada), as
    // dificuldades 3, 1 e 2 em rodízio, as difíceis primeiro, as já vistas por último; alternativas embaralhadas em cada prova.
    function cotas(n, C) {
      var q1 = Math.round(n * 0.4);
      var q3 = Math.round(n * 0.2);
      var quer = { 1: q1, 2: n - q1 - q3, 3: q3 };
      var resta = [];
      var cel = [];
      for (var i = 0; i < C; i++) { resta.push(Math.floor(n / C) + (i < n % C ? 1 : 0)); cel.push({ 1: 0, 2: 0, 3: 0 }); }
      var p = 0;
      [3, 1, 2].forEach(function (d) {
        var falta = quer[d];
        for (var guarda = 0; falta > 0 && guarda < C * 50; guarda++, p++) {
          var k = p % C;
          if (resta[k] > 0) { cel[k][d]++; resta[k]--; falta--; }
        }
      });
      return cel;
    }
    function sortear(t, vistas) {
      var n = REGRAS_PROVA.questoes;
      var comps = embaralhar(t.competencias.map(function (x) { return x.id; }));
      var cel = cotas(n, comps.length);
      var escolhidas = [];
      var falta = { 1: 0, 2: 0, 3: 0 };
      function porComp(comp) { return escolhidas.filter(function (x) { return x.competencia === comp; }).length; }
      function candidatas(filtro, equilibrar) {
        return embaralhar(t.questoes.filter(function (x) { return escolhidas.indexOf(x) < 0 && filtro(x); })).sort(function (a, b) {
          var va = vistas.indexOf(a.id) >= 0 ? 1 : 0;
          var vb = vistas.indexOf(b.id) >= 0 ? 1 : 0;
          return va - vb || (equilibrar ? porComp(a.competencia) - porComp(b.competencia) : 0);
        });
      }
      function naoVistaNaDificuldade(d) {
        return t.questoes.some(function (y) { return y.dificuldade === d && escolhidas.indexOf(y) < 0 && vistas.indexOf(y.id) < 0; });
      }
      [3, 1, 2].forEach(function (d) {
        comps.forEach(function (comp, i) {
          for (var j = 0; j < cel[i][d]; j++) {
            var x = candidatas(function (y) { return y.competencia === comp && y.dificuldade === d; }, false)[0];
            // Demonstração: a célula só tem 1 ou 2 questões; se a melhor já foi vista e há outra da mesma dificuldade ainda não
            // vista, deixa para o complemento abaixo (quem refaz quase nunca recebe questão repetida, como na prova real).
            if (x && vistas.indexOf(x.id) >= 0 && naoVistaNaDificuldade(d)) x = null;
            if (x) escolhidas.push(x); else falta[d]++;
          }
        });
      });
      // Demonstração: com só 18 questões a célula quase sempre falta. Completa na MESMA dificuldade (a competência com menos
      // questões escolhidas primeiro), para manter 6/6/3 como na prova real, que tem 80 questões por teste.
      [3, 1, 2].forEach(function (d) {
        for (; falta[d] > 0; falta[d]--) {
          var x = candidatas(function (y) { return y.dificuldade === d; }, true)[0];
          if (x) escolhidas.push(x);
        }
      });
      while (escolhidas.length < n) {
        var resto = candidatas(function () { return true; }, true)[0];
        if (!resto) break;
        escolhidas.push(resto);
      }
      return embaralhar(escolhidas).sort(function (a, b) { return a.dificuldade - b.dificuldade; }).map(function (x) {
        return { id: x.id, alt: embaralhar([0, 1, 2, 3]), exibidaEm: null, respondidaEm: null, alternativa: null, original: null, correta: null };
      });
    }

    function tentativaJson(tt, retomada) {
      var t = teste(tt.teste);
      return { ok: true, demonstracao: true, tentativa: { id: tt.id, teste: tt.teste, nome: t.nome, total: tt.total, respondidas: tt.respondidas,
        minutos: Math.round((tt.terminaEm - tt.iniciadaEm) / 60000), segundosRestantes: segundos(tt), terminaEm: iso(tt.terminaEm), retomada: !!retomada } };
    }
    // Questão atual, sem gabarito; marca a hora em que apareceu só da primeira vez (recarregar não zera o tempo).
    function questaoJson(tt) {
      var item = tt.itens[tt.respondidas];
      if (item.exibidaEm == null) item.exibidaEm = agora();
      var x = QUESTAO_DEMO[item.id];
      return { ok: true, fim: false, demonstracao: true, tentativa: tt.id, numero: tt.respondidas + 1, total: tt.total, segundosRestantes: segundos(tt),
        questao: { texto: x.texto || null, enunciado: x.enunciado, alternativas: item.alt.map(function (i) { return x.alternativas[i]; }) } };
    }
    // Resultado: acertos por competência, nunca quais questões a pessoa errou.
    function resultadoJson(tt) {
      var s = dados().selos.filter(function (x) { return x.tentativa === tt.id; })[0];
      return { tentativa: tt.id, teste: tt.teste, nome: teste(tt.teste).nome, status: tt.status, acertos: tt.acertos, total: tt.total, nota: tt.nota,
        margem: REGRAS_PROVA.margem, notaMinima: tt.notaMinima, porCompetencia: copia(tt.porCompetencia || []), selo: s ? seloJson(s) : null,
        podeIniciarEm: tt.itens.some(function (i) { return i.exibidaEm != null; }) ? iso(tt.iniciadaEm + REGRAS_PROVA.intervaloDias * DIA_MS) : null };
    }
    function minha(uid, t) {
      var ab = tentativasDe(uid, t.slug).filter(function (x) { return x.status === 'aberta' && !vencida(x); })[0] || null;
      var ult = tentativasDe(uid, t.slug).filter(function (x) { return x.status !== 'aberta'; })
        .sort(function (a, b) { return b.iniciadaEm - a.iniciadaEm; })[0] || null;
      var ini = ultimoInicio(uid, t.slug);
      var s = melhorSelo(uid, t.slug);
      var volta = ini === null ? null : ini + REGRAS_PROVA.intervaloDias * DIA_MS;
      return {
        aberta: ab ? { tentativa: ab.id, respondidas: ab.respondidas, total: ab.total, segundosRestantes: segundos(ab) } : null,
        ultima: ult ? { status: ult.status, nota: ult.nota, data: diaDe(uid, ult.finalizadaEm) } : null,
        podeIniciarEm: !ab && volta !== null && volta > agora() ? iso(volta) : null,
        selo: s ? seloJson(s) : null
      };
    }

    var rpcs = {};
    rpcs.vagas_testes_catalogo = function () {
      var uid = usuarioAtual();
      if (uid) { fecharVencidas(uid); atualizarCartao(uid); }
      return { ok: true, demonstracao: true,
        regras: { intervaloDias: REGRAS_PROVA.intervaloDias, toleranciaSegPorQuestao: REGRAS_PROVA.toleranciaSeg, supervisao: 'online' },
        testes: TESTES_DEMONSTRACAO.map(function (t) {
          var item = { slug: t.slug, nome: t.nome, descricao: t.descricao, questoes: REGRAS_PROVA.questoes, minutos: t.minutos,
            validadeMeses: REGRAS_PROVA.validadeMeses, notaMinima: REGRAS_PROVA.notaMinima, margem: REGRAS_PROVA.margem, competencias: copia(t.competencias) };
          if (uid) item.minha = minha(uid, t);
          return item;
        }) };
    };
    rpcs.vagas_iniciar_tentativa = function (a) {
      var uid = usuarioAtual();
      if (!uid) return falha('login', { sessaoExpirada: true });
      c.contaAtual(null);   // promove a conta confirmada de "pendente" para "ativa", como no resto da prévia
      var conta = st().contas[uid];
      if (!conta || conta.tipo !== 'pessoa') return falha('so_pessoa');
      if (conta.status !== 'ativa') return falha('conta_inativa');
      var t = teste(String(a.p_teste == null ? '' : a.p_teste).trim().toLowerCase());
      if (!t) return falha('teste_indisponivel');
      fecharVencidas(uid);
      var aberta = tentativasDe(uid, t.slug).filter(function (x) { return x.status === 'aberta'; })[0];
      if (aberta) return tentativaJson(aberta, true);
      var ini = ultimoInicio(uid, t.slug);
      if (ini !== null && ini + REGRAS_PROVA.intervaloDias * DIA_MS > agora()) {
        var volta = ini + REGRAS_PROVA.intervaloDias * DIA_MS;
        return { ok: false, erro: MSG_PROVA.aguarde + dataBR(diaDe(uid, volta)) + '.', codigo: 'aguarde', podeIniciarEm: iso(volta) };
      }
      var vistas = [];
      tentativasDe(uid, t.slug).forEach(function (x) { x.itens.forEach(function (i) { vistas.push(i.id); }); });
      var t0 = agora();
      var tt = { id: c.novoId(), uid: uid, teste: t.slug, iniciadaEm: t0, terminaEm: t0 + t.minutos * 60000, itens: sortear(t, vistas), respondidas: 0,
        total: REGRAS_PROVA.questoes, status: 'aberta', finalizadaEm: null, acertos: null, nota: null, notaMinima: null, porCompetencia: null,
        sinais: { trocasAba: 0, copias: 0 }, alertas: [] };
      dados().tentativas.push(tt);
      return tentativaJson(tt, false);
    };
    rpcs.vagas_proxima_questao = function (a) {
      var uid = usuarioAtual();
      if (!uid) return falha('login', { sessaoExpirada: true });
      var tt = tentativaDe(uid, a.p_tentativa);
      if (!tt) return falha('tentativa_inexistente');
      if (vencida(tt)) fechar(tt);
      if (tt.status !== 'aberta' || tt.respondidas >= tt.total) {
        return { ok: true, fim: true, tentativa: tt.id, status: tt.status, respondidas: tt.respondidas, total: tt.total };
      }
      return questaoJson(tt);
    };
    rpcs.vagas_responder = function (a) {
      var uid = usuarioAtual();
      if (!uid) return falha('login', { sessaoExpirada: true });
      var tt = tentativaDe(uid, a.p_tentativa);
      if (!tt) return falha('tentativa_inexistente');
      if (tt.status !== 'aberta') return falha('encerrada', { fim: true });
      if (vencida(tt)) { fechar(tt); return falha('tempo_esgotado', { fim: true }); }
      var n = inteiro(a.p_questao);
      if (n === null || n < 1 || n > tt.total) return falha('fora_de_ordem');
      // Reenvio de uma resposta já gravada (internet fraca): devolve o estado atual sem mudar nada (sem voltar).
      if (n <= tt.respondidas) {
        var base = { ok: true, duplicado: true, respondidas: tt.respondidas, total: tt.total, fim: tt.respondidas >= tt.total };
        if (tt.respondidas < tt.total) base.proxima = questaoJson(tt);
        return base;
      }
      if (n > tt.respondidas + 1) return falha('fora_de_ordem');
      var item = tt.itens[tt.respondidas];
      if (item.exibidaEm == null) return falha('fora_de_ordem');
      var alt = inteiro(a.p_alternativa);
      if (alt === null || alt < 0 || alt > 3) return falha('alternativa_invalida');
      item.alternativa = alt;
      item.original = item.alt[alt];
      item.correta = item.original === QUESTAO_DEMO[item.id].correta;
      item.respondidaEm = agora();
      tt.respondidas += 1;
      // Última questão, ou o fim oficial já passou (nenhuma questão nova depois do fim): fecha; a tela chama vagas_finalizar.
      if (tt.respondidas >= tt.total || agora() > tt.terminaEm) {
        fechar(tt);
        return { ok: true, respondidas: tt.respondidas, total: tt.total, fim: true };
      }
      return { ok: true, respondidas: tt.respondidas, total: tt.total, fim: false, proxima: questaoJson(tt) };
    };
    rpcs.vagas_finalizar = function (a) {
      var uid = usuarioAtual();
      if (!uid) return falha('login', { sessaoExpirada: true });
      var tt = tentativaDe(uid, a.p_tentativa);
      if (!tt) return falha('tentativa_inexistente');
      if (tt.status === 'aberta') fechar(tt);
      return { ok: true, resultado: resultadoJson(tt) };
    };
    rpcs.vagas_registrar_sinal = function (a) {
      var uid = usuarioAtual();
      if (!uid) return falha('login', { sessaoExpirada: true });
      var chave = a.p_tipo === 'troca_aba' ? 'trocasAba' : a.p_tipo === 'copiar' ? 'copias' : null;
      if (!chave) return falha('sinal_invalido');
      var tt = tentativaDe(uid, a.p_tentativa);
      if (!tt || tt.status !== 'aberta') return falha('tentativa_inexistente');
      tt.sinais[chave] = Math.min(999, (tt.sinais[chave] || 0) + 1);
      return { ok: true };
    };
    rpcs.vagas_meus_selos = function () {
      var uid = usuarioAtual();
      if (!uid) return falha('login', { sessaoExpirada: true });
      fecharVencidas(uid);
      atualizarCartao(uid);
      var exibidos = TESTES_DEMONSTRACAO.map(function (t) { var s = melhorSelo(uid, t.slug); return s ? s.codigo : null; });
      return { ok: true, selos: dados().selos.filter(function (s) { return s.uid === uid; }).slice().reverse()
        .sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; })
        .map(function (s) { return Object.assign(seloJson(s), { exibido: exibidos.indexOf(s.codigo) >= 0 }); }) };
    };
    // Conferência pública: qualquer selo da prova de demonstração ou da semente, sem dado da pessoa.
    rpcs.seloPublico = function (a, anterior) {
      var cod = String(a.p_codigo == null ? '' : a.p_codigo).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(cod)) return falha('selo_inexistente');
      var s = dados().selos.filter(function (x) { return x.codigo === cod; })[0];
      if (s) return { ok: true, selo: seloJson(s) };
      return anterior ? anterior(a) : falha('selo_inexistente');
    };
    // Exportação (LGPD), igual a vagas_interno.testes_exportar: tentativas em resumo e selos, sem questões nem gabarito.
    rpcs.exportar = function (uid) {
      return {
        tentativas: tentativasDe(uid).slice().sort(function (a, b) { return a.iniciadaEm - b.iniciadaEm; }).map(function (tt) {
          return { teste: tt.teste, status: tt.status, iniciadaEm: iso(tt.iniciadaEm), finalizadaEm: iso(tt.finalizadaEm), respondidas: tt.respondidas,
            total: tt.total, acertos: tt.acertos, nota: tt.nota, porCompetencia: copia(tt.porCompetencia), sinais: copia(tt.sinais), alertas: copia(tt.alertas) };
        }),
        selos: dados().selos.filter(function (s) { return s.uid === uid; }).map(seloJson)
      };
    };
    return rpcs;
  }

  function criarBackend(op) {
    op = op || {};
    var arm = op.armazenamento !== undefined ? op.armazenamento : armazenamentoPadrao();
    var relogio = op.agora || function () { return Date.now(); };
    var st = null;

    // ------------------------------------------------------------------------------------------------- utilidades
    function agora() { return relogio(); }
    function iso(ms) { return ms == null ? '' : new Date(ms).toISOString(); }
    function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
    function salvar() { try { if (arm) arm.setItem(CHAVE, JSON.stringify(st)); } catch (e) { /* sem armazenamento */ } }
    CHAVES_ANTIGAS.forEach(function (k) { try { if (arm) arm.removeItem(k); } catch (e) { /* sem armazenamento */ } });
    function novoId() {
      st.seq += 1;
      var h = st.seq.toString(16);
      while (h.length < 12) h = '0' + h;
      return '00000000-0000-4000-8000-' + h;
    }
    // Token fictício (64 hex) diferente a cada chamada. Conta em 32 bits (Math.imul): a conta antiga passava de 2^53, perdia os
    // bits baixos e quase sempre dava só zeros (tokens e links repetidos na prévia).
    function novoToken() {
      st.seq += 1;
      var s = '';
      var x = Math.imul(st.seq, 2654435761) >>> 0;
      while (s.length < 64) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; s += ((x >>> 24) % 16).toString(16); }
      return s;
    }
    function novoCodigo() {
      var c;
      do {
        st.seq += 1;
        var n = st.seq * 7919 + 104729;
        c = '';
        for (var i = 0; i < 6; i++) { c += ALFABETO.charAt(n % 32); n = Math.floor(n / 32) + (i + 1) * 13; }
      } while (st.anuncios.some(function (a) { return a.codigo === c; }));
      return c;
    }
    function erro(msg, extra) { return Object.assign({ ok: false, erro: msg }, extra || {}); }
    function ok(o) { return Object.assign({ ok: true }, o || {}); }
    function txt(v) { return v == null ? '' : (typeof v === 'object' ? '[object Object]' : String(v)); }
    function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
    function reUuid(v) { return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(String(v || '')); }
    function hoje(fuso) { return R.hoje(fuso || 'America/Sao_Paulo', agora()); }
    function mesAtualIso() { return new Date(agora()).toISOString().slice(0, 7); }
    function contar(tipo, chave, janelaMs) {
      var k = tipo + '|' + chave;
      var lista = (st.limites[k] || []).filter(function (t) { return t > agora() - 8 * DIA; });
      lista.push(agora());
      st.limites[k] = lista;
      return lista.filter(function (t) { return t > agora() - janelaMs; }).length;
    }

    // ------------------------------------------------------------------------------------------------- consultas
    function usuario(id) { return st.usuarios.filter(function (u) { return u.id === id; })[0] || null; }
    function usuarioPorEmail(e) { return st.usuarios.filter(function (u) { return u.email === e; })[0] || null; }
    function cidade(slug) { return st.cidades.filter(function (c) { return c.slug === slug; })[0] || null; }
    function zona(cid, slug) { return st.zonas.filter(function (z) { return z.cidade === cid && z.slug === slug; })[0] || null; }
    function empresa(id) { return st.empresas.filter(function (e) { return e.id === id; })[0] || null; }
    function anuncio(id) { return st.anuncios.filter(function (a) { return a.id === id; })[0] || null; }
    function candidatura(id) { return st.candidaturas.filter(function (k) { return k.id === id; })[0] || null; }
    function conversaDe(candId) { return st.conversas.filter(function (v) { return v.candidaturaId === candId; })[0] || null; }
    function eAdmin() { var u = usuario(st.sessao); return !!(u && u.admin); }
    function contaValida(uid) { var u = usuario(uid); var c = st.contas[uid]; return !!(u && c && c.status !== 'suspensa' && u.confirmada); }

    function contaAtual(tipo) {
      var uid = st.sessao;
      if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var c = st.contas[uid];
      if (!c) return erro(R.MSG.SEM_CONTA, { semConta: true });
      if (c.status === 'suspensa') return erro(R.MSG.SUSPENSA, { suspensa: true });
      if (c.status === 'pendente') {
        if (!usuario(uid).confirmada) return erro(R.MSG.CONFIRMAR, { confirmar: true });
        c.status = 'ativa';
        c.confirmadaEm = c.confirmadaEm || agora();
        // O consentimento vale a partir do clique no link: é gravado aqui (igual ao banco).
        if (c.termosVersao && !c.termosAceitosEm) {
          c.termosAceitosEm = agora();
          st.consentimentos.push({ userId: uid, tipo: 'termos', versao: c.termosVersao, aceito: true, em: agora() });
          st.consentimentos.push({ userId: uid, tipo: 'privacidade', versao: c.termosVersao, aceito: true, em: agora() });
        }
      }
      if (tipo && c.tipo !== tipo) return erro(tipo === 'pessoa' ? R.MSG.SO_PESSOA : tipo === 'empresa' ? R.MSG.SO_EMPRESA : R.MSG.SEM_PERMISSAO);
      return { ok: true, userId: uid, tipo: c.tipo };
    }
    function papelCidade(cid) {
      if (eAdmin()) return 'admin';
      var o = st.operadores.filter(function (x) { return x.userId === st.sessao && x.cidade === cid && x.ativo && contaValida(x.userId); })[0];
      return o ? o.papel : null;
    }
    function cidadesOperadas() {
      if (eAdmin()) return st.cidades.map(function (c) { return c.slug; });
      return st.operadores.filter(function (x) { return x.userId === st.sessao && x.ativo && contaValida(x.userId); }).map(function (x) { return x.cidade; });
    }
    function cidadesDoFiltro(f) {
      var c = txt(f.cidade).trim().toLowerCase();
      return cidadesOperadas().filter(function (s) { return !c || s === c; });
    }
    function membro(empId, dono) {
      return st.membros.some(function (m) { return m.empresaId === empId && m.userId === st.sessao && m.ativo && (!dono || m.papel === 'dono') && contaValida(m.userId); });
    }
    function registrar(cid, papel, acao, alvo, alvoId, motivo, dados) {
      st.moderacao.push({ id: st.moderacao.length + 1, cidade: cid, ator: st.sessao, papel: papel || 'sistema', acao: acao, alvo: alvo, alvoId: alvoId || null,
        motivo: R.limparTexto(motivo, 300), dados: dados || {}, em: agora() });
    }

    // ------------------------------------------------------------------------------------------------- JSON (iguais ao banco)
    function cidadeJson(c) {
      return { id: c.id, slug: c.slug, nome: c.nome, uf: c.uf, status: c.status, fuso: c.fuso, praca: c.praca || null,
        zonas: st.zonas.filter(function (z) { return z.cidade === c.slug && z.ativa; }).sort(function (a, b) { return a.ordem - b.ordem || a.nome.localeCompare(b.nome); })
          .map(function (z) { return { id: z.id, slug: z.slug, nome: z.nome, bairros: z.bairros.slice() }; }),
        interessados: c.status === 'lista_espera' ? interessados(c.slug) : null,
        metaListaEspera: c.metaListaEspera == null ? null : c.metaListaEspera,
        // 20261024120004: a empresa já se cadastra e anuncia na cidade em lista de espera; canal de WhatsApp da cidade.
        preAbertura: c.status === 'lista_espera', aceitaEmpresas: aceitaEmpresas(c), canalWhatsapp: c.canalWhatsapp || null };
    }
    function aceitaEmpresas(c) { return !!c && (c.status === 'ativa' || c.status === 'lista_espera'); }
    // Interessados na lista de espera, APROXIMADO como no banco: só quem entrou até o dia anterior, em dezenas (ninguém
    // descobre pelo contador se um e-mail já estava na lista).
    function interessados(slug) {
      var inicioHoje = new Date(agora()); inicioHoje.setUTCHours(0, 0, 0, 0);
      var n = st.listaEspera.filter(function (l) { return l.cidade === slug && l.criadoEm < inicioHoje.getTime(); }).length;
      return Math.floor(n / 10) * 10;
    }
    function zonaJson(cid, slug) { var z = slug ? zona(cid, slug) : null; return z ? { slug: z.slug, nome: z.nome } : null; }
    function noAr(a) {
      var e = empresa(a.empresaId);
      var c = cidade(a.cidade);
      return a.status === 'publicado' && a.expiraEm > agora() && !!e && e.status === 'ativa' && !!c && c.status === 'ativa' &&
        (a.modalidade !== 'diaria' || a.diaria.data >= hoje(c.fuso));
    }
    function expiraCalculada(a) {
      if (a.modalidade === 'diaria') return agora() + (a.prazoHoras || 48) * 3600000;
      return agora() + a.diasNoAr * DIA;
    }
    function areaJson(slug) {
      var x = R.AREAS.filter(function (z) { return z.id === slug; })[0];
      return { slug: slug, nome: x ? x.rotulo : slug };
    }
    function requisitosLista(a) {
      var l = [];
      R.REQUISITOS_VAGA.forEach(function (r) {
        if (a.requisitos.indexOf(r.id) < 0) return;
        if (r.id === 'outro') { if (a.requisitoOutro) l.push(a.requisitoOutro); } else l.push(r.rotulo);
      });
      return l;
    }
    function anuncioResumo(a, revelar) {
      var e = empresa(a.empresaId);
      var c = cidade(a.cidade);
      var conf = !!e.cnpjConferidoEm;
      return {
        id: a.id, codigo: a.codigo, titulo: a.funcao, funcao: a.funcao, modalidade: a.modalidade, area: areaJson(a.area), turno: a.turno,
        fimDeSemana: a.fimDeSemana, experiencia: a.experiencia, comissao: a.comissao, selo: a.selo || null, valor: clone(a.valor),
        cidade: { slug: c.slug, nome: c.nome }, zona: zonaJson(a.cidade, a.zona),
        empresa: a.confidencial && !revelar ? { nome: 'Empresa confidencial', iniciais: '', confidencial: true, conferida: conf }
          : { nome: e.nomeFantasia, iniciais: R.iniciais(e.nomeFantasia), confidencial: a.confidencial, conferida: conf },
        diaria: a.modalidade === 'diaria' ? clone(a.diaria) : null,
        paraHoje: a.modalidade === 'diaria' && a.diaria.data === hoje(c.fuso),
        quantidade: a.quantidade, publicadoEm: iso(a.publicadoEm), expiraEm: iso(a.expiraEm)
      };
    }
    function anuncioDetalhe(a, revelar) {
      var r = anuncioResumo(a, revelar);
      var e = empresa(a.empresaId);
      r.descricao = a.descricao; r.requisitos = a.requisitos.slice(); r.requisitoOutro = a.requisitoOutro; r.requisitosLista = requisitosLista(a);
      r.beneficios = a.beneficios.slice(); r.escolaridade = a.escolaridade; r.inicio = a.inicio; r.inicioData = a.inicioData || '';
      r.horasDia = a.horasDia == null ? null : a.horasDia;
      r.empresa.setor = a.confidencial && !revelar ? '' : e.setor;
      r.empresa.descricao = a.confidencial && !revelar ? '' : e.descricao;
      return r;
    }
    // Pré-abertura (20261024120004): vaga publicada numa cidade que ainda não abriu fica marcada (a validade conta da abertura).
    function marcarPublicada(an) { an.preAbertura = cidade(an.cidade).status !== 'ativa'; }
    function anuncioEmpresa(a) {
      var r = anuncioDetalhe(a, true);
      var c = cidade(a.cidade);
      var aguarda = !!a.preAbertura && a.status === 'publicado' && c.status !== 'ativa';
      var ks = st.candidaturas.filter(function (k) { return k.anuncioId === a.id; });
      var conta = function (s) { return ks.filter(function (k) { return k.status === s; }).length; };
      return Object.assign(r, { empresaId: a.empresaId, confidencial: a.confidencial, diasNoAr: a.diasNoAr, prazoHoras: a.prazoHoras == null ? null : a.prazoHoras,
        status: a.status, statusMotivo: a.statusMotivo,
        noAr: noAr(a), expirado: a.expiraEm != null && a.expiraEm <= agora() && !aguarda, encerradoEm: iso(a.encerradoEm), criadoEm: iso(a.criadoEm),
        atualizadoEm: iso(a.atualizadoEm), candidaturas: { total: ks.filter(function (k) { return k.status !== 'retirada'; }).length, novas: conta('enviada'),
          conversar: conta('conversar'), combinou: conta('combinou'), contratada: conta('contratada') },
        aguardaAbertura: aguarda, avisoAbertura: aguarda ? 'Sua vaga entra no ar no dia em que ' + c.nome + ' abrir.' : '' });
    }
    function pontosFortesIds() { return R.PONTOS_FORTES.map(function (p) { return p.id; }); }
    function referenciaVisivel(r) { var e = empresa(r.empresaId); return r.status === 'aceita' && !!e && e.status === 'ativa'; }
    // O que a empresa autora (e a operação) vê (veto P2, 20261024120005): 'enviada' ou 'removida' (pela moderação); nada do que
    // a pessoa fez (aceitar, recusar, ocultar, remover, publicar).
    function referenciaStatusEmpresa(r) { return r.status === 'removida' && r.removidaPor === 'moderacao' ? 'removida' : 'enviada'; }
    // No perfil da pessoa, a empresa vê só referência visível de OUTRA empresa (a própria nunca aparece).
    function referenciaParaEmpresa(r, empresas) {
      return referenciaVisivel(r) && (empresas || []).indexOf(r.empresaId) < 0;
    }
    // Cartão cego: só "tem referência de empresa verificada" (veto P1).
    function temReferencia(uid, empId) {
      return st.referencias.some(function (r) { return r.pessoaId === uid && referenciaParaEmpresa(r, empId ? [empId] : []); });
    }
    function minhasEmpresasIds() {
      return st.membros.filter(function (m) { return m.userId === st.sessao && m.ativo && contaValida(m.userId); }).map(function (m) { return m.empresaId; });
    }
    function referenciaJson(r, textoSempre) {
      var e = empresa(r.empresaId);
      return { id: r.id, empresa: { nome: e.nomeFantasia, conferida: !!e.cnpjConferidoEm, cidade: cidade(e.cidade).nome }, funcao: r.funcao, vinculo: r.vinculo,
        inicio: r.inicio, fim: r.fim, atual: !r.fim, pontosFortes: r.pontosFortes.slice(), recomendaPara: r.recomendaPara.slice(),
        texto: textoSempre || r.textoStatus === 'publicado' ? r.texto : '', textoStatus: r.textoStatus, criadoEm: iso(r.criadoEm) };
    }
    function experiencias(uid) { return st.experiencias.filter(function (x) { return x.userId === uid; }).sort(function (a, b) { return a.ordem - b.ordem; }); }
    function selos(uid) { return clone((st.selos || {})[uid] || []); }
    function cartao(uid, empId) {
      var p = st.pessoas[uid];
      if (!p) return null;
      var c = cidade(p.cidade);
      var xs = experiencias(uid);
      return {
        cidade: { slug: c.slug, nome: c.nome }, zona: zonaJson(p.cidade, p.zona), cargos: p.cargos.slice(),
        experiencias: xs.map(function (x) { return { funcao: x.funcao, meses: R.meses(x.inicio, x.fim, agora()), atual: !x.fim, informal: x.informal }; }),
        experienciaTotalMeses: xs.reduce(function (s, x) { return s + R.meses(x.inicio, x.fim, agora()); }, 0),
        escolaridade: p.escolaridade, turnos: p.turnos.slice(), cnh: p.cnh.slice(), modalidades: p.modalidades.slice(),
        pretensaoCentavos: p.pretensaoCentavos, cursos: p.cursos.slice(), selos: selos(uid), temReferencia: temReferencia(uid, empId || null)
      };
    }
    function pessoaJson(uid) {
      var p = st.pessoas[uid];
      if (!p) return null;
      var c = cidade(p.cidade);
      var c2 = p.cidade2 ? cidade(p.cidade2) : null;
      var ct = st.contatos[uid] || {};
      return { cidade: { slug: c.slug, nome: c.nome }, cidade2: c2 ? { slug: c2.slug, nome: c2.nome } : null, zona: zonaJson(p.cidade, p.zona),
        maior18: true, cargos: p.cargos.slice(), escolaridade: p.escolaridade, turnos: p.turnos.slice(), cnh: p.cnh.slice(),
        modalidades: p.modalidades.slice(), pretensaoCentavos: p.pretensaoCentavos, cursos: p.cursos.slice(), areas: (p.areas || []).slice(),
        sobre: p.sobre, temFoto: temFoto(uid),
        nome: ct.nome || '', whatsapp: ct.whatsapp || '', email: ct.email || '',
        experiencias: experiencias(uid).map(function (x) { return { funcao: x.funcao, empregador: x.empregador, inicio: x.inicio, fim: x.fim || '', informal: x.informal }; }),
        bancoTalentosAte: iso(p.bancoAte), atualizadoEm: iso(p.atualizadoEm) };
    }
    function completo(uid) { return !!(st.pessoas[uid] && st.contatos[uid]); }
    function temFoto(uid) { return !!(st.fotos && st.fotos[uid]); }
    function naoLidas(v, lado) {
      if (!v) return 0;
      var lida = lado === 'pessoa' ? v.lidaPessoaEm : v.lidaEmpresaEm;
      return st.mensagens.filter(function (m) { return m.conversaId === v.id && m.autor !== lado && m.criadoEm > (lida == null ? -Infinity : lida); }).length;
    }
    function revelada(k) { var a = anuncio(k.anuncioId); return !a.confidencial || k.empresaReveladaEm != null || k.status === 'combinou' || k.status === 'contratada'; }
    function candidaturaPessoa(k) {
      var a = anuncio(k.anuncioId);
      var e = empresa(k.empresaId);
      var v = conversaDe(k.id);
      var res = anuncioResumo(a, revelada(k));
      res.noAr = noAr(a);
      return { id: k.id, status: k.status, criadoEm: iso(k.criadoEm), atualizadoEm: iso(k.atualizadoEm), empresaRevelada: revelada(k),
        contatoCortadoEm: iso(k.contatoCortadoEm), anuncio: res,
        conversa: v ? { status: v.status, naoLidas: naoLidas(v, 'pessoa'), ultimaEm: iso(v.ultimaEm) } : null,
        combinou: k.status === 'combinou' || k.status === 'contratada' ? { em: iso(k.combinouEm), empresa: { nome: e.nomeFantasia, whatsapp: e.whatsapp, email: e.email } } : null };
    }
    function empresaJson(e) {
      var c = cidade(e.cidade);
      return { id: e.id, cnpj: e.cnpj, cnpjFormatado: R.formatarCnpj(e.cnpj), mei: e.mei, razaoSocial: e.razaoSocial, nomeFantasia: e.nomeFantasia,
        setor: e.setor, descricao: e.descricao, whatsapp: e.whatsapp, email: e.email, status: e.status, statusMotivo: e.statusMotivo,
        cnpjConferidoEm: iso(e.cnpjConferidoEm), cidade: { slug: c.slug, nome: c.nome }, zona: zonaJson(e.cidade, e.zona), criadoEm: iso(e.criadoEm) };
    }
    function tocar(x) { x.atualizadoEm = agora(); }

    // Filtros só sobre a VAGA (iguais a vagas_interno.listar_anuncios); nada de nota, selo, referência, idade ou sexo.
    function listarAnuncios(cids, filtro, pessoaId, areasPadrao) {
      var f = obj(filtro);
      var lim = R.inteiro(f.limite); lim = Math.min(Math.max(lim == null ? 20 : lim, 1), 20);
      var zonas = typeof f.zona === 'string' ? [f.zona] : (Array.isArray(f.zona) ? f.zona : null);
      var mods = R.listaEnum(f.modalidade, R.MODALIDADES);
      var paraHoje = f.paraHoje === true;
      var busca = R.normalizar(txt(f.busca)).slice(0, 60);
      var areas, padrao = false;
      if (Object.prototype.hasOwnProperty.call(f, 'areas')) areas = R.listaEnum(typeof f.areas === 'string' ? [f.areas] : f.areas, R.AREAS);
      else { areas = (areasPadrao || []).slice(); padrao = areas.length > 0; }
      var turnos = R.listaEnum(f.turno, R.TURNOS_VAGA);
      var sal = R.inteiro(f.salarioMin);
      var semExp = f.semExperiencia === true;
      var soTotal = f.somenteTotal === true;
      var dep = soTotal ? null : /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)_([0-9a-f-]{36})$/.exec(txt(f.depois));
      var mult = { mes: 1, dia: 22, hora: 220 };
      var lista = st.anuncios.filter(function (a) {
        var c = cidade(a.cidade);
        if (cids.indexOf(a.cidade) < 0 || !noAr(a)) return false;
        if (zonas && zonas.indexOf(a.zona) < 0) return false;
        if (mods.length && mods.indexOf(a.modalidade) < 0) return false;
        if (paraHoje && !(a.modalidade === 'diaria' && a.diaria.data === hoje(c.fuso))) return false;
        if (areas.length && areas.indexOf(a.area) < 0) return false;
        if (turnos.length && turnos.indexOf(a.turno) < 0) return false;
        if (sal != null && (a.valor.maxCentavos != null ? a.valor.maxCentavos : a.valor.minCentavos) * (mult[a.valor.unidade] || 0) < sal) return false;
        if (semExp && a.experiencia !== 'nao_precisa') return false;
        if (busca && R.normalizar(a.funcao + ' ' + areaJson(a.area).nome).indexOf(busca) < 0) return false;
        if (pessoaId && (st.pulos.some(function (p) { return p.pessoaId === pessoaId && p.anuncioId === a.id; }) ||
          st.candidaturas.some(function (k) { return k.pessoaId === pessoaId && k.anuncioId === a.id; }))) return false;
        if (dep && (a.publicadoEm > Date.parse(dep[1]) || (a.publicadoEm === Date.parse(dep[1]) && a.id >= dep[2]))) return false;
        return true;
      }).sort(function (a, b) { return b.publicadoEm - a.publicadoEm || (a.id < b.id ? 1 : -1); });
      if (soTotal) return { total: lista.length, areasAplicadas: areas, areasPadrao: padrao };
      var pagina = lista.slice(0, lim);
      var ult = pagina[pagina.length - 1];
      return { anuncios: pagina.map(function (a) { return anuncioResumo(a, false); }),
        proximo: lista.length > lim && ult ? iso(ult.publicadoEm).replace(/\.(\d{3})Z$/, '.$1000Z') + '_' + ult.id : '',
        areasAplicadas: areas, areasPadrao: padrao };
    }

    // ------------------------------------------------------------------------------------------------- RPCs
    var H = {};

    H.versao_banco = function () { return ok({ versao: 20261022120000, faltando: [] }); };

    H.vagas_cidades_publicas = function () {
      return ok({ cidades: st.cidades.filter(function (c) { return c.status === 'ativa' || c.status === 'lista_espera'; })
        .sort(function (a, b) { return a.ordem - b.ordem || a.nome.localeCompare(b.nome); }).map(cidadeJson) });
    };

    H.vagas_anuncios_publicos = function (a) {
      var f = obj(a.p_filtro);
      var c = cidade(txt(f.cidade).trim().toLowerCase());
      if (!c || c.status === 'rascunho') return erro('Cidade não encontrada.', { naoEncontrada: true });
      if (c.status === 'lista_espera') return erro(R.MSG.CIDADE_FECHADA, { listaEspera: true, interessados: interessados(c.slug) });
      if (c.status === 'pausada') return erro('As vagas desta cidade estão pausadas no momento.', { pausada: true });
      var cids = [c.slug];
      if (f.entorno !== false) st.cidades.forEach(function (x) { if (x.praca === c.slug && x.status === 'ativa') cids.push(x.slug); });
      var eu = st.sessao && st.pessoas[st.sessao];
      return ok(Object.assign({ cidade: { slug: c.slug, nome: c.nome } }, listarAnuncios(cids, f, null, eu ? eu.areas : [])));
    };

    H.vagas_anuncio_publico = function (a) {
      var cod = txt(a.p_codigo).trim().toUpperCase();
      var an = st.anuncios.filter(function (x) { return x.codigo === cod; })[0];
      if (!/^[A-Z0-9]{6}$/.test(cod) || !an || !noAr(an)) return erro(R.MSG.VAGA_FORA, { naoEncontrada: true });
      var revelar = false;
      var extra = {};
      var k = st.sessao ? st.candidaturas.filter(function (x) { return x.anuncioId === an.id && x.pessoaId === st.sessao; })[0] : null;
      if (k) { revelar = revelada(k); extra.minhaCandidatura = { id: k.id, status: k.status }; }
      return ok({ anuncio: Object.assign(anuncioDetalhe(an, revelar), extra) });
    };

    // 1 vista por "origem" (na prévia: o navegador; com login, a conta) por anúncio por dia; a própria empresa não conta.
    H.vagas_anuncio_vista = function (a) {
      var cod = txt(a.p_codigo).trim().toUpperCase();
      var an = st.anuncios.filter(function (x) { return x.codigo === cod; })[0];
      if (!an || !noAr(an)) return erro(R.MSG.VAGA_FORA, { naoEncontrada: true });
      if (st.sessao && membro(an.empresaId)) return ok({ contada: false });
      var dia = hoje(cidade(an.cidade).fuso);
      if (contar('vista', an.id + ':' + (st.sessao || 'navegador') + ':' + dia, DIA) > 1) return ok({ contada: false });
      st.vistas = st.vistas || {};
      st.vistas[an.id + '|' + dia] = (st.vistas[an.id + '|' + dia] || 0) + 1;
      return ok({ contada: true });
    };

    // Conferência pública do selo (a RPC real é da migração dos testes, 20261023; aqui, os selos fictícios da prévia).
    H.vagas_selo_publico = function (a) {
      var cod = txt(a.p_codigo).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      var achado = null;
      Object.keys(st.selos || {}).forEach(function (uid) {
        (st.selos[uid] || []).forEach(function (x) { if (x.codigo === cod) achado = x; });
      });
      if (!achado) return erro('Selo não encontrado. Confira o código.', { codigo: 'selo_inexistente' });
      return ok({ selo: { codigo: achado.codigo, teste: achado.teste, nome: achado.nome, nota: achado.nota, data: achado.data, validoAte: achado.validoAte,
        supervisao: achado.supervisao || 'online', situacao: achado.validoAte >= hoje() ? 'valido' : 'vencido' } });
    };

    // WhatsApp opcional (celular com DDD); a resposta é a mesma com ou sem ele e não revela se o e-mail já estava; o primeiro
    // número gravado para o e-mail fica. N2 (20261024120002): e-mail que saiu da lista há menos de 24 h entra sem WhatsApp.
    var ORIGENS_LISTA = ['radio', 'cartaz', 'grupo', 'canal', 'escola', 'mutirao', 'indicacao', 'outro'];
    function saidas() { if (!st.listaSaidas) st.listaSaidas = {}; return st.listaSaidas; }
    function marcarSaida(slug, email) { saidas()[slug + '|' + email] = agora(); }
    function saiuHaPouco(slug, email) { var t = saidas()[slug + '|' + email]; return t != null && t > agora() - DIA; }
    H.vagas_lista_espera_entrar = function (a) {
      var d = obj(a.p_dados);
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c || c.status === 'rascunho' || c.status === 'pausada') return erro('Cidade não encontrada.');
      if (c.status === 'ativa') return erro('Esta cidade já está aberta: faça o seu cadastro.', { ativa: true });
      // Isca (20261024120004): campo "site" preenchido = robô; resposta igual à de sucesso, nada gravado.
      if (txt(d.site).trim()) return ok({ cidade: c.slug, interessados: interessados(c.slug) });
      var l = R.lerListaEspera(d);
      if (!l.ok) return l;
      // Origem (20261024120004): lista fechada; o resto vira null; a primeira fica.
      var origem = txt(d.origem).trim().toLowerCase();
      if (ORIGENS_LISTA.indexOf(origem) < 0) origem = null;
      var linha = st.listaEspera.filter(function (x) { return x.cidade === c.slug && x.email === l.campos.email; })[0];
      if (!linha) {
        linha = { cidade: c.slug, email: l.campos.email, perfil: l.campos.perfil, whatsapp: '', whatsappEm: null, criadoEm: agora(), origem: origem };
        st.listaEspera.push(linha);
      } else if (!linha.origem) linha.origem = origem;
      // Sem prova de dono do e-mail, o primeiro WhatsApp gravado fica (revisão de segurança, I5).
      if (l.campos.whatsapp && !linha.whatsapp && !saiuHaPouco(c.slug, l.campos.email)) { linha.whatsapp = l.campos.whatsapp; linha.whatsappEm = agora(); }
      return ok({ cidade: c.slug, interessados: interessados(c.slug) });
    };

    // Link "sair da lista" do e-mail do aviso de abertura (20261024120002): resposta sempre igual.
    H.vagas_lista_espera_sair_link = function (a) {
      var tk = txt(a.p_token).trim().toLowerCase();
      if (/^[0-9a-f]{64}$/.test(tk)) {
        st.listaEspera = st.listaEspera.filter(function (l) { if (l.sairToken !== tk) return true; marcarSaida(l.cidade, l.email); return false; });
      }
      return ok({ removido: true });
    };

    // Sair: pelo e-mail apaga a linha (com o WhatsApp); pelo WhatsApp tira só o número das linhas da cidade.
    H.vagas_lista_espera_sair = function (a) {
      var d = obj(a.p_dados);
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c) return erro('Cidade não encontrada.');
      var temEmail = !!txt(d.email).trim();
      var email = R.normalizarEmail(d.email);
      if (temEmail && !email) return erro('E-mail inválido.');
      var whats = '';
      if (txt(d.whatsapp).trim()) {
        whats = R.normalizarWhatsapp(txt(d.whatsapp));
        if (!R.whatsappCelularValido(whats)) return erro(R.MSG.WHATSAPP_INVALIDO);
      }
      if (!email && !whats) return erro('E-mail inválido.');
      if (email) {
        st.listaEspera = st.listaEspera.filter(function (l) { if (l.cidade !== c.slug || l.email !== email) return true; marcarSaida(c.slug, email); return false; });
      }
      if (whats) st.listaEspera.forEach(function (l) { if (l.cidade === c.slug && l.whatsapp === whats) { l.whatsapp = ''; l.whatsappEm = null; marcarSaida(c.slug, l.email); } });
      return ok({ cidade: c.slug, removido: true });
    };

    H.vagas_denunciar = function (a) {
      var d = obj(a.p_dados);
      var motivo = txt(d.motivo);
      if (R.MOTIVOS_DENUNCIA.map(function (m) { return m.id; }).indexOf(motivo) < 0) return erro('Escolha o motivo da denúncia.');
      var uid = st.sessao;
      if (uid) {
        var c = contaAtual(null);
        if (!c.ok) return c;
        if (contar('denuncia_conta', uid, DIA) > 20) return erro('Muitas denúncias em pouco tempo. Tente de novo amanhã.', { bloqueado: true });
      }
      var id = txt(d.id).trim();
      var detalhe = R.limparTexto(d.detalhe, 600);
      if (d.alvo === 'anuncio') {
        var an = reUuid(id) ? anuncio(id) : st.anuncios.filter(function (x) { return x.codigo === id.toUpperCase(); })[0];
        if (!an || an.status === 'rascunho' || an.status === 'removido') return erro(R.MSG.VAGA_FORA);
        if (uid && st.denuncias.some(function (x) { return x.alvo === 'anuncio' && x.anuncioId === an.id && x.autor === uid; })) return ok({ recebida: true, duplicado: true });
        st.denuncias.push({ id: novoId(), alvo: 'anuncio', anuncioId: an.id, empresaId: an.empresaId, cidade: an.cidade, autor: uid || null, contaNoLimite: !!uid,
          motivo: motivo, detalhe: detalhe, textoDenunciado: '', status: 'aberta', criadoEm: agora() });
        if (uid && an.status === 'publicado') {
          var autores = {};
          st.denuncias.forEach(function (x) { if (x.anuncioId === an.id && x.alvo === 'anuncio' && x.contaNoLimite && x.status === 'aberta') autores[x.autor] = true; });
          if (Object.keys(autores).length >= 3) {
            an.status = 'suspenso'; an.statusMotivo = 'Fora do ar por denúncias, aguardando a moderação.'; tocar(an);
            var sessao = st.sessao; st.sessao = null;
            registrar(an.cidade, 'sistema', 'suspender_por_denuncias', 'anuncio', an.id, '3 denúncias de contas diferentes.');
            st.sessao = sessao;
          }
        }
      } else if (d.alvo === 'mensagem') {
        if (!uid) return erro('Entre na sua conta para denunciar uma mensagem.', { sessaoExpirada: true });
        var m = st.mensagens.filter(function (x) { return x.id === id; })[0];
        if (!m) return erro('Mensagem não encontrada.');
        var v = st.conversas.filter(function (x) { return x.id === m.conversaId; })[0];
        var k = candidatura(v.candidaturaId);
        if (!((k.pessoaId === uid && m.autor === 'empresa') || (m.autor === 'pessoa' && membro(k.empresaId)))) return erro('Mensagem não encontrada.');
        if (st.denuncias.some(function (x) { return x.alvo === 'mensagem' && x.mensagemId === m.id && x.autor === uid; })) return ok({ recebida: true, duplicado: true });
        var an2 = anuncio(k.anuncioId);
        st.denuncias.push({ id: novoId(), alvo: 'mensagem', anuncioId: an2.id, mensagemId: m.id, empresaId: an2.empresaId, cidade: an2.cidade, autor: uid,
          contaNoLimite: true, motivo: motivo, detalhe: detalhe, textoDenunciado: m.texto.slice(0, 1000), autorMensagem: m.autor, autorMensagemUser: m.autorUser,
          status: 'aberta', criadoEm: agora() });
      } else if (d.alvo === 'referencia') {
        if (!uid) return erro('Entre na sua conta para denunciar uma referência.', { sessaoExpirada: true });
        var r = st.referencias.filter(function (x) { return x.id === id && x.status !== 'removida'; })[0];
        // Só a própria pessoa ou quem vê a referência; a empresa autora nunca (a resposta não pode denunciar a ocultação).
        if (!r || minhasEmpresasIds().indexOf(r.empresaId) >= 0 || !(r.pessoaId === uid || referenciaVisivel(r))) return erro('Referência não encontrada.');
        if (st.denuncias.some(function (x) { return x.alvo === 'referencia' && x.referenciaId === r.id && x.autor === uid; })) return ok({ recebida: true, duplicado: true });
        var er = empresa(r.empresaId);
        st.denuncias.push({ id: novoId(), alvo: 'referencia', referenciaId: r.id, empresaId: er.id, cidade: er.cidade, autor: uid, contaNoLimite: false,
          motivo: motivo, detalhe: detalhe, textoDenunciado: r.texto, status: 'aberta', criadoEm: agora() });
      } else {
        return erro('Denúncia inválida.');
      }
      return ok({ recebida: true });
    };

    H.vagas_eu = function () {
      var uid = st.sessao;
      if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var c = contaAtual(null);
      if (!c.ok) {
        if (c.semConta && eAdmin()) {
          return ok({ conta: null, admin: true, pessoa: null, empresas: [],
            operador: st.cidades.slice().sort(function (a, b) { return a.ordem - b.ordem; }).map(function (x) { return { cidade: x.slug, nome: x.nome, papel: 'admin' }; }) });
        }
        return c;
      }
      var ct = st.contas[uid];
      ct.ultimoAcessoEm = agora();
      var p = st.pessoas[uid];
      return ok({
        conta: { tipo: ct.tipo, status: ct.status, email: usuario(uid).email,
          nome: (ct.tipo === 'pessoa' && st.contatos[uid] && st.contatos[uid].nome) || R.limparTexto((usuario(uid).meta && usuario(uid).meta.nome) || '', 120),
          termosVersao: ct.termosVersao || '', termosAceitosEm: iso(ct.termosAceitosEm), criadoEm: iso(ct.criadoEm) },
        admin: eAdmin(),
        pessoa: ct.tipo === 'pessoa' ? { completo: completo(uid), cidades: p ? [p.cidade].concat(p.cidade2 ? [p.cidade2] : []) : [],
          referenciasPendentes: st.referencias.filter(function (r) { return r.pessoaId === uid && r.status === 'pendente'; }).length } : null,
        empresas: st.membros.filter(function (m) { return m.userId === uid && m.ativo; }).map(function (m) {
          var e = empresa(m.empresaId); return { id: e.id, nomeFantasia: e.nomeFantasia, papel: m.papel, status: e.status };
        }).sort(function (a, b) { return a.nomeFantasia.localeCompare(b.nomeFantasia); }),
        operador: st.operadores.filter(function (o) { return o.userId === uid && o.ativo; }).map(function (o) { return { cidade: o.cidade, nome: cidade(o.cidade).nome, papel: o.papel }; })
      });
    };

    H.vagas_aceitar_termos = function (a) {
      var c = contaAtual(null);
      if (!c.ok) return c;
      var d = obj(a.p_dados);
      var v = txt(d.versao).trim();
      if (!/^[A-Za-z0-9._-]{1,40}$/.test(v)) return erro('Versão dos termos inválida.');
      var ct = st.contas[st.sessao];
      ct.termosVersao = v; ct.termosAceitosEm = agora();
      st.consentimentos.push({ userId: st.sessao, tipo: 'termos', versao: v, aceito: true, em: agora() });
      st.consentimentos.push({ userId: st.sessao, tipo: 'privacidade', versao: v, aceito: true, em: agora() });
      var p = st.pessoas[st.sessao];
      if (Object.prototype.hasOwnProperty.call(d, 'bancoTalentos') && ct.tipo === 'pessoa') {
        var ate = d.bancoTalentos === true ? agora() + 180 * DIA : null;
        st.consentimentos.push({ userId: st.sessao, tipo: 'banco_talentos', versao: v, aceito: d.bancoTalentos === true, ate: ate, em: agora() });
        if (p) p.bancoAte = ate;
      }
      return ok({ termosVersao: v, termosAceitosEm: iso(ct.termosAceitosEm), bancoTalentosAte: p ? iso(p.bancoAte) : '' });
    };

    H.vagas_pessoa_minha = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      return ok({ pessoa: pessoaJson(st.sessao), cartao: cartao(st.sessao), completo: completo(st.sessao) });
    };

    H.vagas_pessoa_salvar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var uid = st.sessao;
      var d = obj(a.p_dados);
      var c1 = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c1 || c1.status === 'rascunho') return erro('Escolha a sua cidade.');
      var c2 = null;
      if (txt(d.cidade2).trim()) {
        c2 = cidade(txt(d.cidade2).trim().toLowerCase());
        if (!c2 || c2.status === 'rascunho') return erro('Segunda cidade não encontrada.');
        if (c2.slug === c1.slug) return erro('Escolha duas cidades diferentes.');
      }
      if (!txt(d.zona).trim()) return erro('Escolha a zona onde você mora.');
      var z = zona(c1.slug, txt(d.zona).trim().toLowerCase());
      if (!z || !z.ativa) return erro('Escolha uma zona da sua cidade.');
      var l = R.lerPessoa(d, agora());
      if (!l.ok) return l;
      var antes = st.pessoas[uid];
      if ((!antes || antes.cidade !== c1.slug) && c1.status !== 'ativa') return erro(R.MSG.CIDADE_FECHADA);
      if (c2 && (!antes || antes.cidade2 !== c2.slug) && c2.status !== 'ativa') return erro('A segunda cidade ainda não está aberta. Escolha uma cidade ativa.');
      var f = l.campos;
      st.pessoas[uid] = { cidade: c1.slug, cidade2: c2 ? c2.slug : null, zona: z.slug, cargos: f.cargos, escolaridade: f.escolaridade, turnos: f.turnos,
        cnh: f.cnh, modalidades: f.modalidades, pretensaoCentavos: f.pretensaoCentavos, cursos: f.cursos, sobre: f.sobre,
        areas: f.areas ? f.areas : (antes && antes.areas ? antes.areas : []),
        bancoAte: antes ? antes.bancoAte : null, referenciasToken: antes ? antes.referenciasToken : null, criadoEm: antes ? antes.criadoEm : agora(), atualizadoEm: agora() };
      st.contatos[uid] = { nome: f.nome, whatsapp: f.whatsapp, email: f.email || R.normalizarEmail(usuario(uid).email) };
      st.experiencias = st.experiencias.filter(function (x) { return x.userId !== uid; });
      f.experiencias.forEach(function (x, i) { st.experiencias.push(Object.assign({ id: novoId(), userId: uid, ordem: i + 1 }, x, { fim: x.fim || null })); });
      return ok({ pessoa: pessoaJson(uid), cartao: cartao(uid), completo: true });
    };

    H.vagas_feed = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var p = st.pessoas[st.sessao];
      if (!p) return erro('Complete seu cadastro para ver as vagas.', { completar: true });
      var cids = [p.cidade].concat(p.cidade2 ? [p.cidade2] : []).filter(function (s) { var x = cidade(s); return x && x.status === 'ativa'; });
      return ok(listarAnuncios(cids, a.p_filtro, st.sessao, p.areas || []));
    };

    H.vagas_quero = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var uid = st.sessao;
      if (!completo(uid)) return erro('Complete seu cadastro antes de se candidatar.', { completar: true });
      var an = anuncio(a.p_anuncio);
      if (!an || !noAr(an)) return erro(R.MSG.VAGA_FORA);
      var k = st.candidaturas.filter(function (x) { return x.anuncioId === an.id && x.pessoaId === uid; })[0];
      if (k) {
        if (k.status !== 'retirada') return ok({ candidatura: candidaturaPessoa(k), duplicado: true });
        k.status = 'enviada'; k.pessoaDecidiuEm = null; tocar(k);
      } else {
        if (contar('quero', uid, DIA) > 30) return erro('Você já se candidatou a muitas vagas hoje. Tente de novo amanhã.', { bloqueado: true });
        k = { id: novoId(), anuncioId: an.id, pessoaId: uid, empresaId: an.empresaId, status: 'enviada', criadoEm: agora(), atualizadoEm: agora() };
        st.candidaturas.push(k);
      }
      st.pulos = st.pulos.filter(function (p) { return !(p.pessoaId === uid && p.anuncioId === an.id); });
      return ok({ candidatura: candidaturaPessoa(k) });
    };

    H.vagas_pular = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      if (!st.pessoas[st.sessao]) return erro('Complete seu cadastro para ver as vagas.', { completar: true });
      if (!anuncio(a.p_anuncio)) return erro(R.MSG.VAGA_FORA);
      if (!st.pulos.some(function (p) { return p.pessoaId === st.sessao && p.anuncioId === a.p_anuncio; })) st.pulos.push({ pessoaId: st.sessao, anuncioId: a.p_anuncio, em: agora() });
      return ok();
    };

    function minhaCandidatura(id) { var k = candidatura(id); return k && k.pessoaId === st.sessao ? k : null; }
    function avisarConversa(k, texto, status) {
      var v = conversaDe(k.id);
      if (!v) return;
      st.mensagens.push({ id: novoId(), conversaId: v.id, autor: 'sistema', autorUser: null, texto: texto, criadoEm: agora() });
      v.ultimaEm = agora();
      if (status) v.status = status;
    }

    H.vagas_retirar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status === 'combinou' || k.status === 'contratada') return erro('O contato já foi liberado. Avise a empresa pela conversa.');
      if (k.status !== 'retirada' && k.status !== 'recusada') {
        k.status = 'retirada'; k.pessoaDecidiuEm = agora(); tocar(k);
        avisarConversa(k, 'A pessoa retirou a candidatura.', 'encerrada');
      }
      return ok({ candidatura: candidaturaPessoa(k) });
    };

    H.vagas_minhas_candidaturas = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      return ok({ candidaturas: st.candidaturas.filter(function (k) { return k.pessoaId === st.sessao; })
        .sort(function (x, y) { return y.atualizadoEm - x.atualizadoEm; }).map(candidaturaPessoa) });
    };

    H.vagas_ver_empresa = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (['conversar', 'combinou', 'contratada'].indexOf(k.status) < 0) return erro('A empresa ainda não pediu para conversar.');
      if (k.empresaReveladaEm == null) { k.empresaReveladaEm = agora(); tocar(k); }
      var e = empresa(k.empresaId);
      return ok({ empresa: { nome: e.nomeFantasia, razaoSocial: e.razaoSocial, cnpjFormatado: R.formatarCnpj(e.cnpj), setor: e.setor, descricao: e.descricao,
        cidade: cidade(e.cidade).nome, conferidaEm: iso(e.cnpjConferidoEm) }, candidatura: candidaturaPessoa(k) });
    };

    H.vagas_combinar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      var an = anuncio(k.anuncioId);
      var e = empresa(k.empresaId);
      var dup = false;
      if (k.status === 'combinou' || k.status === 'contratada') {
        dup = k.contatoCortadoEm == null;
        if (!dup) { k.contatoCortadoEm = null; k.pessoaDecidiuEm = agora(); tocar(k); avisarConversa(k, 'A pessoa voltou a compartilhar o contato.', 'aberta'); }
      } else {
        if (k.status === 'enviada') return erro('A empresa ainda não pediu para conversar.');
        if (k.status !== 'conversar') return erro('Esta candidatura foi encerrada.');
        if (an.status === 'suspenso' || an.status === 'removido' || e.status !== 'ativa') return erro('Esta vaga está fora do ar.');
        if (an.confidencial && k.empresaReveladaEm == null) return erro('Veja primeiro qual é a empresa.', { verEmpresa: true });
        k.status = 'combinou'; k.combinouEm = agora(); k.pessoaDecidiuEm = agora(); k.empresaReveladaEm = k.empresaReveladaEm || agora(); tocar(k);
        if (!conversaDe(k.id)) st.conversas.push({ id: novoId(), candidaturaId: k.id, status: 'aberta', criadaEm: agora(), ultimaEm: agora(), empresaSeguidas: 0 });
        avisarConversa(k, 'Combinou! O contato foi liberado para os dois lados.', 'aberta');
      }
      return ok({ candidatura: candidaturaPessoa(k), empresa: { nome: e.nomeFantasia, whatsapp: e.whatsapp, email: e.email }, duplicado: dup });
    };

    H.vagas_recusar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status === 'combinou' || k.status === 'contratada') return erro('O contato já foi liberado. Avise a empresa pela conversa.');
      if (k.status !== 'retirada' && k.status !== 'recusada') {
        k.status = 'recusada'; k.pessoaDecidiuEm = agora(); tocar(k);
        avisarConversa(k, 'A pessoa preferiu não seguir com esta vaga.', 'encerrada');
      }
      return ok({ candidatura: candidaturaPessoa(k) });
    };

    H.vagas_quem_viu_meu_contato = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var grupos = {};
      st.acessos.filter(function (x) { return x.pessoaId === st.sessao; }).forEach(function (x) {
        var g = x.candidaturaId || ('sem-' + x.em);
        if (!grupos[g]) grupos[g] = { candidaturaId: x.candidaturaId || null, empresa: x.empresaNome, anuncio: x.anuncioTitulo, primeira: x.em, ultima: x.em, vezes: 0 };
        grupos[g].vezes += 1;
        grupos[g].primeira = Math.min(grupos[g].primeira, x.em);
        grupos[g].ultima = Math.max(grupos[g].ultima, x.em);
      });
      return ok({ acessos: Object.keys(grupos).map(function (g) { return grupos[g]; }).sort(function (x, y) { return y.ultima - x.ultima; })
        .map(function (g) {
          var k = g.candidaturaId ? minhaCandidatura(g.candidaturaId) : null;
          return { candidaturaId: g.candidaturaId, empresa: g.empresa, anuncio: g.anuncio, primeiraVez: iso(g.primeira), ultimaVez: iso(g.ultima), vezes: g.vezes,
            cortadoEm: iso(k ? k.contatoCortadoEm : null),
            podeCortar: !!k && (k.status === 'combinou' || k.status === 'contratada') && k.contatoCortadoEm == null };
        }) });
    };

    H.vagas_cortar_acesso = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var k = minhaCandidatura(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status !== 'combinou' && k.status !== 'contratada') return erro('Seu contato não foi liberado para esta empresa.');
      var dup = k.contatoCortadoEm != null;
      if (!dup) {
        k.contatoCortadoEm = agora(); k.pessoaDecidiuEm = agora(); tocar(k);
        avisarConversa(k, 'A pessoa encerrou a conversa e deixou de compartilhar o contato.', 'encerrada');
      }
      return ok({ candidatura: candidaturaPessoa(k), duplicado: dup });
    };

    // ---- Empresa
    function inserirEmpresa(campos, cid, zonaSlug, status, criadaPor) {
      var e = { id: novoId(), cidade: cid, zona: zonaSlug || null, cnpj: campos.cnpj, mei: campos.mei, razaoSocial: campos.razaoSocial,
        nomeFantasia: campos.nomeFantasia, setor: campos.setor, descricao: campos.descricao, whatsapp: campos.whatsapp, email: campos.email,
        status: status, statusMotivo: '', cnpjConferidoEm: status === 'ativa' ? agora() : null, criadaPor: criadaPor, criadoEm: agora() };
      st.empresas.push(e);
      return e;
    }
    function lerEmpresaCompleta(d) {
      var l = R.lerEmpresa(d);
      if (!l.ok) return l;
      if (st.empresas.some(function (e) { return e.cnpj === l.campos.cnpj; })) return erro('Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.');
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c || c.status === 'rascunho') return erro('Escolha a cidade da empresa.');
      if (!aceitaEmpresas(c)) return erro(R.MSG.CIDADE_FECHADA);
      var z = null;
      if (txt(d.zona).trim()) { z = zona(c.slug, txt(d.zona).trim().toLowerCase()); if (!z) return erro('Escolha uma zona da cidade da empresa.'); }
      return { ok: true, campos: l.campos, cidade: c.slug, zona: z ? z.slug : null };
    }

    H.vagas_empresa_cadastrar = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      if (st.membros.filter(function (m) { return m.userId === st.sessao && m.papel === 'dono'; }).length >= 5) return erro('Esta conta já cadastrou o máximo de empresas. Fale com a Gestão sem Caos.');
      var l = lerEmpresaCompleta(obj(a.p_dados));
      if (!l.ok) return l;
      var e = inserirEmpresa(l.campos, l.cidade, l.zona, 'em_analise', st.sessao);
      st.membros.push({ empresaId: e.id, userId: st.sessao, papel: 'dono', ativo: true, criadoEm: agora() });
      return ok({ empresa: Object.assign(empresaJson(e), { papel: 'dono' }) });
    };

    H.vagas_empresa_salvar = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var e = empresa(a.p_empresa);
      if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
      if (!membro(e.id, true)) return erro('Só quem é dono(a) da conta da empresa pode alterar estes dados.');
      var d = obj(a.p_dados);
      var n = clone(e);
      var tem = function (k) { return Object.prototype.hasOwnProperty.call(d, k); };
      if (tem('nomeFantasia')) { var nf = R.limparTexto(d.nomeFantasia, 120); if (nf.length < 2) return erro('Informe o nome da empresa.'); n.nomeFantasia = nf; }
      if (tem('setor')) n.setor = R.limparTexto(d.setor, 80);
      if (tem('descricao')) { if (txt(d.descricao).length > 800) return erro('A descrição pode ter até 800 caracteres.'); n.descricao = R.limparMultilinha(d.descricao, 800); }
      if (tem('whatsapp')) {
        if (!txt(d.whatsapp).trim()) n.whatsapp = '';
        else { n.whatsapp = R.normalizarWhatsapp(d.whatsapp); if (!R.whatsappEmpresaValido(n.whatsapp)) return erro('WhatsApp da empresa inválido.'); }
      }
      if (tem('email')) { var em = txt(d.email).trim(); n.email = em ? R.normalizarEmail(em) : ''; if (em && !n.email) return erro('E-mail da empresa inválido.'); }
      if (tem('zona')) {
        if (!txt(d.zona).trim()) n.zona = null;
        else { var z = zona(e.cidade, txt(d.zona).trim().toLowerCase()); if (!z) return erro('Escolha uma zona da cidade da empresa.'); n.zona = z.slug; }
      }
      var conf = R.conferirTexto(n.nomeFantasia, 'cartao') || R.conferirTexto(n.setor, 'cartao') || R.conferirTexto(n.descricao, 'empresa');
      if (conf) return erro(conf.erro);
      ['nomeFantasia', 'setor', 'descricao', 'whatsapp', 'email', 'zona'].forEach(function (k) { e[k] = n[k]; });
      return ok({ empresa: empresaJson(e) });
    };

    H.vagas_minhas_empresas = function () {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      return ok({ empresas: st.membros.filter(function (m) { return m.userId === st.sessao && m.ativo; }).map(function (m) {
        var e = empresa(m.empresaId);
        var as = st.anuncios.filter(function (x) { return x.empresaId === e.id; });
        return Object.assign(empresaJson(e), { papel: m.papel,
          anuncios: { total: as.length, noAr: as.filter(noAr).length, rascunhos: as.filter(function (x) { return x.status === 'rascunho'; }).length,
            emRevisao: as.filter(function (x) { return x.status === 'em_revisao'; }).length },
          candidaturasNovas: st.candidaturas.filter(function (k) { return k.empresaId === e.id && k.status === 'enviada'; }).length });
      }).sort(function (x, y) { return x.nomeFantasia.localeCompare(y.nomeFantasia); }) });
    };

    // Grava a vaga (mesmas regras de vagas_anuncio_salvar / vagas_op_anuncio_salvar). -> {ok, an} | erro
    function gravarAnuncio(d, e, an) {
      var cid = an ? an.cidade : e.cidade;
      if (txt(d.cidade).trim()) {
        var cc = cidade(txt(d.cidade).trim().toLowerCase());
        if (!cc || cc.status === 'rascunho') return erro('Cidade não encontrada.');
        cid = cc.slug;
      }
      var cobj = cidade(cid);
      var h = hoje(cobj.fuso);
      var l = R.lerAnuncio(d, null);
      if (!l.ok) return l;
      var f = l.campos;
      if (f.inicio === 'data' && f.modalidade !== 'diaria' && f.inicioData < h) return erro('A data de início não pode estar no passado.');
      var z = null;
      if (txt(d.zona).trim()) { z = zona(cid, txt(d.zona).trim().toLowerCase()); if (!z) return erro('Escolha uma zona da cidade da vaga.'); }
      if ((!an || an.cidade !== cid) && !aceitaEmpresas(cobj)) return erro(R.MSG.CIDADE_FECHADA);
      if (f.confidencial && !e.cnpjConferidoEm) return erro('Só empresa com CNPJ conferido pela Gestão sem Caos pode anunciar como confidencial.');
      if (f.modalidade === 'diaria' && (!an || !an.diaria || an.diaria.data !== f.diaria.data || an.modalidade !== 'diaria')) {
        if (f.diaria.data < h) return erro('A data da diária já passou. Escolha outra data.');
        if (f.diaria.data > R.somarDias(h, 7)) return erro('A diária precisa ser para os próximos 7 dias.');
      }
      if (!an && contar('anuncio_novo', e.id, DIA) > 30) return erro('Muitas vagas criadas hoje. Tente de novo amanhã.', { bloqueado: true });
      var campos = { cidade: cid, zona: z ? z.slug : null, area: f.area, funcao: f.funcao, titulo: f.funcao, modalidade: f.modalidade,
        descricao: f.descricao, turno: f.turno, fimDeSemana: f.fimDeSemana, comissao: f.comissao, inicio: f.inicio, inicioData: f.inicioData,
        experiencia: f.experiencia, escolaridade: f.escolaridade, requisitos: f.requisitos, requisitoOutro: f.requisitoOutro, selo: f.selo,
        beneficios: f.beneficios, horasDia: f.horasDia, prazoHoras: f.prazoHoras, quantidade: f.quantidade, valor: f.valor, diaria: f.diaria,
        diasNoAr: f.diasNoAr, confidencial: f.confidencial };
      if (!an) {
        an = Object.assign({ id: novoId(), codigo: novoCodigo(), empresaId: e.id, status: 'rascunho', statusMotivo: '', publicadoEm: null, expiraEm: null,
          encerradoEm: null, criadoPor: st.sessao, criadoEm: agora(), atualizadoEm: agora() }, campos);
        st.anuncios.push(an);
      } else {
        Object.assign(an, campos); tocar(an);
      }
      return { ok: true, an: an };
    }

    H.vagas_anuncio_salvar = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var d = obj(a.p_dados);
      var an = null;
      var e;
      if (txt(d.id).trim()) {
        an = anuncio(txt(d.id).trim());
        if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
        if (an.status === 'removido') return erro('Esta vaga foi removida pela moderação e não pode ser editada.');
        if (an.status === 'suspenso') return erro('Esta vaga está fora do ar, aguardando a moderação.');
        e = empresa(an.empresaId);
      } else {
        e = empresa(txt(d.empresaId).trim());
        if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
      }
      if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
      var g = gravarAnuncio(d, e, an);
      if (!g.ok) return g;
      return ok({ anuncio: anuncioEmpresa(g.an) });
    };

    // Vaga assistida pela operação da cidade (mesmos campos; publicar:true já publica, sem a revisão).
    H.vagas_op_anuncio_salvar = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var d = obj(a.p_dados);
      var an = null;
      var e;
      if (txt(d.id).trim()) {
        an = anuncio(txt(d.id).trim());
        if (!an) return erro('Vaga não encontrada.');
        e = empresa(an.empresaId);
      } else {
        e = empresa(txt(d.empresaId).trim());
        if (!e) return erro('Empresa não encontrada.');
      }
      var papel = papelCidade(e.cidade);
      if (!papel) return erro(an ? 'Vaga não encontrada.' : 'Empresa não encontrada.');
      if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      if (an && an.status === 'removido') return erro('Esta vaga foi removida pela moderação e não pode ser editada.');
      if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
      if (d.publicar === true && e.status !== 'ativa' && (!an || (an.status !== 'publicado' && an.status !== 'pausado'))) {
        return erro('Aprove a empresa antes de publicar a vaga.');
      }
      var g = gravarAnuncio(d, e, an);
      if (!g.ok) return g;
      an = g.an;
      if (d.publicar === true && an.status !== 'publicado' && an.status !== 'pausado') {
        an.status = 'publicado'; an.statusMotivo = ''; an.publicadoEm = an.publicadoEm || agora(); an.expiraEm = expiraCalculada(an); an.encerradoEm = null;
        marcarPublicada(an);
      }
      registrar(an.cidade, papel, 'anuncio_assistido', 'anuncio', an.id, '', { publicado: an.status === 'publicado' });
      return ok({ anuncio: anuncioEmpresa(an) });
    };

    H.vagas_areas_publicas = function () {
      return ok({ areas: R.AREAS.map(function (x) { return { slug: x.id, nome: x.rotulo }; }) });
    };

    H.vagas_anuncio_publicar = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var an = anuncio(a.p_anuncio);
      if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
      if (an.status === 'publicado') return ok({ anuncio: anuncioEmpresa(an), emRevisao: false, duplicado: true });
      if (an.status === 'em_revisao') return ok({ anuncio: anuncioEmpresa(an), emRevisao: true, duplicado: true });
      if (an.status === 'suspenso' || an.status === 'removido') return erro('Esta vaga está fora do ar pela moderação.');
      if (an.status !== 'rascunho') return erro('Esta vaga já foi publicada. Use "Retomar" ou "Renovar".');
      var e = empresa(an.empresaId);
      if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
      var cobj = cidade(an.cidade);
      if (!aceitaEmpresas(cobj)) return erro(R.MSG.CIDADE_FECHADA);
      if (an.modalidade === 'diaria' && an.diaria.data < hoje(cobj.fuso)) return erro('A data da diária já passou. Escolha outra data.');
      var revisao = e.status !== 'ativa' || st.anuncios.filter(function (x) { return x.empresaId === e.id && x.publicadoEm != null; }).length < 3;
      if (revisao) { an.status = 'em_revisao'; an.statusMotivo = ''; }
      else { an.status = 'publicado'; an.statusMotivo = ''; an.publicadoEm = agora(); an.expiraEm = expiraCalculada(an); marcarPublicada(an); }
      tocar(an);
      return ok({ anuncio: anuncioEmpresa(an), emRevisao: revisao });
    };

    H.vagas_anuncio_acao = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var an = anuncio(a.p_anuncio);
      if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
      var e = empresa(an.empresaId);
      if (an.status === 'suspenso' || an.status === 'removido') return erro('Esta vaga está fora do ar pela moderação.');
      var acao = a.p_acao;
      if (acao === 'pausar') {
        if (an.status !== 'publicado') return erro('Só dá para pausar uma vaga que está no ar.');
        an.status = 'pausado';
      } else if (acao === 'retomar') {
        if (an.status !== 'pausado') return erro('Só dá para retomar uma vaga pausada.');
        if (an.expiraEm <= agora()) return erro('O prazo desta vaga acabou. Use "Renovar".');
        if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
        an.status = 'publicado'; marcarPublicada(an);
      } else if (acao === 'encerrar') {
        if (an.status !== 'encerrado') { an.status = 'encerrado'; an.encerradoEm = agora(); }
      } else if (acao === 'renovar') {
        if (an.modalidade === 'diaria') return erro('Para outra data, crie uma diária nova.');
        if (['publicado', 'pausado', 'encerrado'].indexOf(an.status) < 0) return erro('Só dá para renovar uma vaga que já foi publicada.');
        if (e.status !== 'ativa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.');
        if (an.status !== 'publicado') marcarPublicada(an);
        an.status = 'publicado'; an.encerradoEm = null; an.expiraEm = expiraCalculada(an);
      } else return erro('Ação inválida.');
      tocar(an);
      return ok({ anuncio: anuncioEmpresa(an) });
    };

    H.vagas_anuncios_empresa = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      if (!membro(a.p_empresa)) return erro('Empresa não encontrada.');
      return ok({ anuncios: st.anuncios.filter(function (x) { return x.empresaId === a.p_empresa; }).sort(function (x, y) { return y.criadoEm - x.criadoEm; }).map(anuncioEmpresa) });
    };

    H.vagas_anuncio_numeros = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var an = anuncio(a.p_anuncio);
      if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
      var ks = st.candidaturas.filter(function (k) { return k.anuncioId === an.id; });
      var vivas = ks.filter(function (k) { return k.status !== 'retirada'; });
      var vistas = 0;
      Object.keys(st.vistas || {}).forEach(function (ch) { if (ch.indexOf(an.id + '|') === 0) vistas += st.vistas[ch]; });
      return ok({ anuncio: { id: an.id, codigo: an.codigo, titulo: an.titulo, status: an.status, publicadoEm: iso(an.publicadoEm) },
        numeros: { vistas: vistas, quero: vivas.length, comSelo: vivas.filter(function (k) { return selos(k.pessoaId).length > 0; }).length,
          conversas: ks.filter(function (k) { return !!conversaDe(k.id); }).length,
          combinou: ks.filter(function (k) { return k.status === 'combinou' || k.status === 'contratada'; }).length,
          contratadas: ks.filter(function (k) { return k.status === 'contratada'; }).length } });
    };

    H.vagas_cartoes = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var an = anuncio(a.p_anuncio);
      if (!an || !membro(an.empresaId)) return erro('Vaga não encontrada.');
      var f = obj(a.p_filtro);
      var status = R.listaEnum(f.status, ['enviada', 'conversar', 'agora_nao', 'combinou', 'contratada', 'recusada']);
      var zonas = R.listaTexto(typeof f.zona === 'string' ? [f.zona] : f.zona, 60);
      var turnos = R.listaEnum(f.turnos, R.TURNOS);
      var cnh = R.listaEnum(f.cnh, R.CNH);
      var pret = R.inteiro(f.pretensaoMaxCentavos);
      var lista = st.candidaturas.filter(function (k) {
        var p = st.pessoas[k.pessoaId];
        if (k.anuncioId !== an.id || k.status === 'retirada' || !p) return false;
        if (status.length && status.indexOf(k.status) < 0) return false;
        if (zonas.length && zonas.indexOf(p.zona) < 0) return false;
        if (turnos.length && !turnos.some(function (t) { return p.turnos.indexOf(t) >= 0; })) return false;
        if (cnh.length && !cnh.every(function (t) { return p.cnh.indexOf(t) >= 0; })) return false;
        if (pret != null && p.pretensaoCentavos != null && p.pretensaoCentavos > pret) return false;
        return true;   // sem filtro por selo, nota ou referência (veto P3), escolaridade nem tempo de experiência (20261024120005)
      }).sort(function (x, y) { return x.criadoEm - y.criadoEm || (x.id < y.id ? -1 : 1); }).map(function (k) {
        var v = conversaDe(k.id);
        return { candidaturaId: k.id, status: k.status, chegouEm: iso(k.criadoEm), contatoCortado: k.contatoCortadoEm != null, cartao: cartao(k.pessoaId, k.empresaId),
          conversa: v ? { status: v.status, naoLidas: naoLidas(v, 'empresa'), ultimaEm: iso(v.ultimaEm) } : null };
      });
      return ok({ anuncio: { id: an.id, codigo: an.codigo, titulo: an.titulo, status: an.status }, cartoes: lista, total: lista.length });
    };

    function candidaturaDaEmpresa(id) { var k = candidatura(id); return k && membro(k.empresaId) ? k : null; }

    H.vagas_empresa_decidir = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var k = candidaturaDaEmpresa(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (a.p_decisao !== 'conversar' && a.p_decisao !== 'agora_nao') return erro('Decisão inválida.');
      if (k.status === 'combinou' || k.status === 'contratada') return erro('O Combinou já aconteceu: a decisão não muda mais.');
      if (k.status === 'retirada' || k.status === 'recusada') return erro('A pessoa encerrou esta candidatura.');
      if (k.status !== a.p_decisao) {
        k.status = a.p_decisao; k.empresaDecidiuEm = agora(); tocar(k);
        if (a.p_decisao === 'agora_nao') avisarConversa(k, 'A empresa seguiu com outras pessoas nesta vaga.', 'encerrada');
        else { var v = conversaDe(k.id); if (v) v.status = 'aberta'; }
      }
      return ok({ candidaturaId: k.id, status: k.status });
    };

    H.vagas_contato_pessoa = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var k = candidaturaDaEmpresa(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status !== 'combinou' && k.status !== 'contratada') return erro('O contato só aparece depois do Combinou.', { semCombinou: true });
      if (k.contatoCortadoEm != null) return erro('A pessoa deixou de compartilhar o contato com a sua empresa.', { contatoCortado: true });
      var e = empresa(k.empresaId);
      if (e.status !== 'ativa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', { suspensa: true });
      if (contar('contato_empresa', k.empresaId, DIA) > 300) return erro('Muitas consultas de contato hoje. Tente de novo amanhã.', { bloqueado: true });
      var an = anuncio(k.anuncioId);
      var ct = st.contatos[k.pessoaId];
      st.acessos.push({ candidaturaId: k.id, pessoaId: k.pessoaId, empresaId: e.id, empresaNome: e.nomeFantasia, anuncioTitulo: an.titulo, userId: st.sessao, em: agora() });
      return ok({ pessoa: { nome: ct.nome, whatsapp: ct.whatsapp, email: ct.email, sobre: st.pessoas[k.pessoaId].sobre, temFoto: temFoto(k.pessoaId),
        cartao: cartao(k.pessoaId, k.empresaId),
        referencias: st.referencias.filter(function (r) { return r.pessoaId === k.pessoaId && referenciaParaEmpresa(r, [k.empresaId]); })
          .sort(function (x, y) { return (y.fim || '9999-99').localeCompare(x.fim || '9999-99') || y.inicio.localeCompare(x.inicio); })
          .map(function (r) { return referenciaJson(r, false); }),
        experiencias: experiencias(k.pessoaId).map(function (x) { return { funcao: x.funcao, empregador: x.empregador, inicio: x.inicio, fim: x.fim || '', informal: x.informal }; }) } });
    };

    H.vagas_marcar_contratada = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var k = candidaturaDaEmpresa(a.p_candidatura);
      if (!k) return erro('Candidatura não encontrada.');
      if (k.status === 'combinou') { k.status = 'contratada'; k.contratadaEm = agora(); tocar(k); }
      else if (k.status !== 'contratada') return erro('Só dá para marcar como contratada depois do Combinou.');
      return ok({ candidaturaId: k.id, status: k.status });
    };

    // ---- Conversa
    function lado(k) { if (!k) return null; if (k.pessoaId === st.sessao) return 'pessoa'; if (membro(k.empresaId)) return 'empresa'; return null; }

    H.vagas_conversa = function (a) {
      var c = contaAtual(null);
      if (!c.ok) return c;
      var k = candidatura(a.p_candidatura);
      var l = lado(k);
      if (!l) return erro('Conversa não encontrada.');
      var an = anuncio(k.anuncioId);
      var v = conversaDe(k.id);
      if (v) { if (l === 'pessoa') v.lidaPessoaEm = agora(); else v.lidaEmpresaEm = agora(); }
      var pode = l === 'empresa' ? ['enviada', 'conversar', 'combinou', 'contratada'].indexOf(k.status) >= 0 && an.status !== 'suspenso' && an.status !== 'removido'
          && k.contatoCortadoEm == null && empresa(k.empresaId).status === 'ativa'
        : !!v && v.status === 'aberta' && ['conversar', 'combinou', 'contratada'].indexOf(k.status) >= 0;
      return ok({ candidaturaId: k.id, status: k.status, lado: l, anuncio: { titulo: an.titulo, codigo: an.codigo },
        conversa: v ? { id: v.id, status: v.status } : null, podeEscrever: pode, contatoCortado: k.contatoCortadoEm != null,
        outroLado: l === 'empresa' ? 'Pessoa candidata' : (revelada(k) ? empresa(k.empresaId).nomeFantasia : 'Empresa confidencial'),
        mensagens: v ? st.mensagens.filter(function (m) { return m.conversaId === v.id; }).sort(function (x, y) { return x.criadoEm - y.criadoEm || (x.id < y.id ? -1 : 1); })
          .map(function (m) { return { id: m.id, autor: m.autor, texto: m.texto, em: iso(m.criadoEm), minha: m.autor === l }; }) : [] });
    };

    H.vagas_mensagem_enviar = function (a) {
      var c = contaAtual(null);
      if (!c.ok) return c;
      var k = candidatura(a.p_candidatura);
      var l = lado(k);
      if (!l) return erro('Conversa não encontrada.');
      if (a.p_id) {
        var ja = st.mensagens.filter(function (m) { return m.id === a.p_id; })[0];
        if (ja) {
          if (ja.autorUser !== st.sessao) return erro('Identificador da mensagem inválido.');
          return ok({ mensagem: { id: ja.id, autor: ja.autor, texto: ja.texto, em: iso(ja.criadoEm), minha: true }, duplicado: true });
        }
      }
      var texto = R.limparMultilinha(a.p_texto, 2000);
      if (!texto) return erro('Escreva a mensagem.');
      if (texto.length > 1000) return erro('A mensagem pode ter até 1.000 caracteres.');
      var t = R.conferirTexto(texto, 'mensagem');
      if (t) return erro(t.erro, { bloqueada: true, tipo: t.tipo });
      var an = anuncio(k.anuncioId);
      var e = empresa(k.empresaId);
      var v = conversaDe(k.id);
      if (l === 'empresa') {
        if (k.status === 'retirada' || k.status === 'recusada') return erro('A pessoa encerrou esta candidatura.');
        if (k.contatoCortadoEm != null) return erro('A pessoa encerrou a conversa e deixou de compartilhar o contato com a sua empresa.', { contatoCortado: true });
        if (k.status === 'agora_nao') return erro('Você marcou "Agora não" para esta pessoa. Mude para "Quero conversar" para escrever.');
        if (an.status === 'suspenso' || an.status === 'removido' || e.status !== 'ativa') return erro('Esta vaga está fora do ar.');
        if (v && v.empresaSeguidas >= 3) return erro('Espere a pessoa responder antes de mandar outra mensagem.', { aguardar: true });
        if (contar('msg_empresa', k.empresaId, DIA) > 300) return erro('Muitas mensagens hoje. Tente de novo amanhã.', { bloqueado: true });
        if (!v) { v = { id: novoId(), candidaturaId: k.id, status: 'aberta', criadaPor: st.sessao, criadaEm: agora(), ultimaEm: agora(), empresaSeguidas: 0 }; st.conversas.push(v); }
        if (k.status === 'enviada') { k.status = 'conversar'; k.empresaDecidiuEm = agora(); tocar(k); }
      } else {
        if (!v) return erro('A empresa ainda não abriu uma conversa.');
        if (v.status !== 'aberta' || ['conversar', 'combinou', 'contratada'].indexOf(k.status) < 0) return erro('Esta conversa foi encerrada.');
        if (contar('msg_pessoa', st.sessao, DIA) > 100) return erro('Muitas mensagens hoje. Tente de novo amanhã.', { bloqueado: true });
      }
      var m = { id: a.p_id || novoId(), conversaId: v.id, autor: l, autorUser: st.sessao, texto: texto, criadoEm: agora() };
      st.mensagens.push(m);
      v.ultimaEm = agora();
      if (l === 'empresa') { v.empresaSeguidas += 1; v.lidaEmpresaEm = agora(); v.status = 'aberta'; } else { v.empresaSeguidas = 0; v.lidaPessoaEm = agora(); }
      return ok({ mensagem: { id: m.id, autor: m.autor, texto: m.texto, em: iso(m.criadoEm), minha: true } });
    };

    function ultimaMensagem(v) {
      var ms = st.mensagens.filter(function (m) { return m.conversaId === v.id; }).sort(function (x, y) { return y.criadoEm - x.criadoEm || (x.id < y.id ? 1 : -1); });
      return ms.length ? ms[0].texto.slice(0, 120) : '';
    }
    H.vagas_conversas_minhas = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      return ok({ conversas: st.conversas.filter(function (v) { var k = candidatura(v.candidaturaId); return k && k.pessoaId === st.sessao; })
        .sort(function (x, y) { return y.ultimaEm - x.ultimaEm; }).map(function (v) {
          var k = candidatura(v.candidaturaId); var an = anuncio(k.anuncioId);
          return { candidaturaId: k.id, status: k.status, conversaStatus: v.status, anuncio: { titulo: an.titulo, codigo: an.codigo },
            empresa: revelada(k) ? empresa(k.empresaId).nomeFantasia : 'Empresa confidencial', naoLidas: naoLidas(v, 'pessoa'), ultimaEm: iso(v.ultimaEm), ultima: ultimaMensagem(v) };
        }) });
    };
    H.vagas_conversas_empresa = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      if (!membro(a.p_empresa)) return erro('Empresa não encontrada.');
      return ok({ conversas: st.conversas.filter(function (v) { var k = candidatura(v.candidaturaId); return k && k.empresaId === a.p_empresa; })
        .sort(function (x, y) { return y.ultimaEm - x.ultimaEm; }).map(function (v) {
          var k = candidatura(v.candidaturaId); var an = anuncio(k.anuncioId);
          return { candidaturaId: k.id, status: k.status, conversaStatus: v.status, anuncio: { id: an.id, titulo: an.titulo, codigo: an.codigo },
            naoLidas: naoLidas(v, 'empresa'), ultimaEm: iso(v.ultimaEm), ultima: ultimaMensagem(v) };
        }) });
    };

    // ---- Referência profissional
    function historico(refId, acao, por) { st.referenciaHistorico.push({ referenciaId: refId, acao: acao, por: por, em: agora() }); }

    H.vagas_referencia_oferecer = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var d = obj(a.p_dados);
      var e = empresa(txt(d.empresaId).trim());
      if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
      if (e.status !== 'ativa' || !e.cnpjConferidoEm) return erro('Só empresa verificada pela Gestão sem Caos pode dar referência.');
      var pessoaId = null, origem, neutro = false, cv = null;
      var tok = txt(d.conviteToken).trim().toLowerCase();
      if (tok) {
        cv = st.convitesReferencia.filter(function (x) { return x.token === tok; })[0];
        if (!cv || cv.status !== 'aberto' || cv.expiraEm <= agora() || (cv.empresaId && cv.empresaId !== e.id)) return erro('Convite inválido ou vencido. Peça um link novo à pessoa.');
        pessoaId = cv.pessoaId; origem = 'convite';
      } else if (txt(d.candidaturaId).trim()) {
        var k = candidatura(txt(d.candidaturaId).trim());
        if (!k || k.empresaId !== e.id || (k.status !== 'combinou' && k.status !== 'contratada') || k.contatoCortadoEm != null) return erro('Candidatura não encontrada.');
        pessoaId = k.pessoaId; origem = 'candidatura';
      } else if (txt(d.email).trim()) {
        var em = R.normalizarEmail(d.email);
        if (!em) return erro('E-mail inválido.');
        if (contar('referencia_email', e.id, DIA) > 30) return erro('Muitos envios por e-mail hoje. Tente de novo amanhã.', { bloqueado: true });
        var u = usuarioPorEmail(em);
        if (u && st.contas[u.id] && st.contas[u.id].tipo === 'pessoa' && st.contas[u.id].status !== 'suspensa') pessoaId = u.id;
        origem = 'email'; neutro = true;
      } else return erro('Informe para quem é a referência.');
      var l = R.lerReferencia(d, agora());
      if (!l.ok) return l;
      // Limite decidido ANTES de saber se o e-mail tem conta: mesma resposta com ou sem conta, inclusive no limite.
      var noLimite = referenciasNoMes(e.id) >= 20;
      if (neutro && noLimite) return ok({ enviada: true });
      // Envio por e-mail conta no limite sempre (com ou sem conta): o contador não revela nada.
      if (neutro) { if (!st.referenciaEnviosEmail) st.referenciaEnviosEmail = []; st.referenciaEnviosEmail.push({ empresaId: e.id, em: agora() }); }
      if (!pessoaId) return ok({ enviada: true });
      var r = st.referencias.filter(function (x) { return x.empresaId === e.id && x.pessoaId === pessoaId; })[0];
      // Mesma resposta antes e depois da resposta da pessoa (veto P2).
      if (r && origem !== 'convite') {
        if (neutro) return ok({ enviada: true });
        return erro('Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de pedido de referência.');
      }
      if (!r && noLimite) return erro('Sua empresa chegou ao limite de 20 referências em 30 dias.', { bloqueado: true });
      var f = l.campos;
      var campos = { autor: st.sessao, funcao: f.funcao, vinculo: f.vinculo, inicio: f.inicio, fim: f.fim || null, pontosFortes: f.pontosFortes,
        recomendaPara: f.recomendaPara, texto: f.texto, textoStatus: f.texto ? 'pendente' : 'sem_texto', textoMotivo: '', status: 'pendente', respondidaEm: null,
        aceitaEm: null, removidaPor: null, atualizadoEm: agora() };
      if (!r) {
        r = Object.assign({ id: novoId(), empresaId: e.id, pessoaId: pessoaId, convite: cv ? cv.id : null, origem: origem, criadoEm: agora() }, campos);
        st.referencias.push(r);
      } else {
        Object.assign(r, campos);
        if (origem !== 'email') r.origem = origem;
      }
      historico(r.id, 'oferecida', 'empresa');
      if (cv) { cv.status = 'usado'; cv.usadoEm = agora(); cv.referenciaId = r.id; }
      if (neutro) return ok({ enviada: true });
      return ok({ referencia: Object.assign(referenciaJson(r, true), { status: referenciaStatusEmpresa(r) }) });
    };

    H.vagas_referencia_pedir = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var d = obj(a.p_dados);
      var cnpj = R.normalizarCnpj(d.cnpj);
      var nome = R.limparTexto(d.empresaNome, 120);
      var e = null;
      if (cnpj) {
        if (!R.cnpjValido(cnpj)) return erro('CNPJ inválido. Confira os números.');
        e = st.empresas.filter(function (x) { return x.cnpj === cnpj && x.status === 'ativa'; })[0] || null;
        if (e) nome = e.nomeFantasia;
      }
      if (nome.length < 2) return erro('Informe o nome da empresa.');
      var t = R.conferirTexto(nome, 'cartao');
      if (t) return erro(t.erro);
      if (contar('referencia_pedir', st.sessao, DIA) > 10) return erro('Muitos pedidos hoje. Tente de novo amanhã.', { bloqueado: true });
      if (st.convitesReferencia.filter(function (x) { return x.pessoaId === st.sessao && x.status === 'aberto' && x.expiraEm > agora(); }).length >= 20) {
        return erro('Você já tem 20 pedidos de referência abertos. Cancele algum antes de pedir outro.');
      }
      var cv = { id: novoId(), pessoaId: st.sessao, empresaId: e ? e.id : null, empresaNome: nome, token: novoToken(), status: 'aberto', expiraEm: agora() + 30 * DIA, criadoEm: agora() };
      st.convitesReferencia.push(cv);
      return ok({ convite: { id: cv.id, token: cv.token, caminho: '/referencia.html?t=' + cv.token, expiraEm: iso(cv.expiraEm), empresaNome: cv.empresaNome, empresaNaPlataforma: !!cv.empresaId } });
    };

    H.vagas_referencia_convite = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      var cv = st.convitesReferencia.filter(function (x) { return x.token === txt(a.p_token).trim().toLowerCase(); })[0];
      if (!cv || cv.status !== 'aberto' || cv.expiraEm <= agora() || (cv.empresaId && !membro(cv.empresaId))) return erro('Convite inválido ou vencido. Peça um link novo à pessoa.');
      var ct = st.contatos[cv.pessoaId];
      var u = usuario(cv.pessoaId);
      return ok({ convite: { pessoa: { nome: (ct && ct.nome) || (u.meta && u.meta.nome) || '' }, empresaNome: cv.empresaNome, empresaId: cv.empresaId,
        expiraEm: iso(cv.expiraEm), status: cv.status } });
    };

    H.vagas_referencia_responder = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var r = st.referencias.filter(function (x) { return x.id === a.p_referencia && x.pessoaId === st.sessao; })[0];
      if (!r) return erro('Referência não encontrada.');
      var mapa = { aceitar: ['pendente', 'aceita'], recusar: ['pendente', 'recusada'], ocultar: ['aceita', 'ocultada'], mostrar: ['ocultada', 'aceita'] };
      var novo = null;
      if (mapa[a.p_acao] && r.status === mapa[a.p_acao][0]) novo = mapa[a.p_acao][1];
      if (a.p_acao === 'remover' && r.status !== 'removida') novo = 'removida';
      if (!novo) return erro('Ação inválida para esta referência.');
      // Veto P2: ocultar/remover não avisam a empresa nem mudam o que ela vê (referenciaStatusEmpresa).
      r.status = novo; r.respondidaEm = agora(); r.atualizadoEm = agora();
      if (a.p_acao === 'aceitar') r.aceitaEm = agora();
      if (novo === 'removida') r.removidaPor = 'pessoa';
      historico(r.id, { aceitar: 'aceita', recusar: 'recusada', ocultar: 'ocultada', mostrar: 'mostrada', remover: 'removida' }[a.p_acao], 'pessoa');
      return ok({ referencia: Object.assign(referenciaJson(r, true), { status: r.status }) });
    };

    H.vagas_referencias_minhas = function () {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      st.convitesReferencia.forEach(function (x) { if (x.pessoaId === st.sessao && x.status === 'aberto' && x.expiraEm <= agora()) x.status = 'expirado'; });
      var p = st.pessoas[st.sessao];
      return ok({
        referencias: st.referencias.filter(function (r) { return r.pessoaId === st.sessao && r.status !== 'removida'; })
          .sort(function (x, y) { return (y.status === 'pendente') - (x.status === 'pendente') || y.criadoEm - x.criadoEm; })
          .map(function (r) { return Object.assign(referenciaJson(r, true), { status: r.status, textoMotivo: r.textoMotivo, visivel: referenciaVisivel(r) }); }),
        convites: st.convitesReferencia.filter(function (x) { return x.pessoaId === st.sessao && (x.status === 'aberto' || x.status === 'usado'); })
          .sort(function (x, y) { return y.criadoEm - x.criadoEm; })
          .map(function (x) { return { id: x.id, empresaNome: x.empresaNome, status: x.status, caminho: x.status === 'aberto' ? '/referencia.html?t=' + x.token : '',
            expiraEm: iso(x.expiraEm), criadoEm: iso(x.criadoEm) }; }),
        caminhoPublico: p && p.referenciasToken ? '/referencias.html?t=' + p.referenciasToken : '' });
    };

    H.vagas_referencias_empresa = function (a) {
      var c = contaAtual('empresa');
      if (!c.ok) return c;
      if (!membro(a.p_empresa)) return erro('Empresa não encontrada.');
      return ok({ referencias: st.referencias.filter(function (r) { return r.empresaId === a.p_empresa && r.origem !== 'email'; })
        .sort(function (x, y) { return y.criadoEm - x.criadoEm; })
        .map(function (r) { return Object.assign(referenciaJson(r, true), { status: referenciaStatusEmpresa(r), textoMotivo: r.textoMotivo, origem: r.origem }); }),
        restantes30Dias: Math.max(0, 20 - referenciasNoMes(a.p_empresa)) });
    };
    // Limite de 20 em 30 dias: as que não vieram por e-mail + cada envio por e-mail (tenha conta ou não; aceite ou não).
    function referenciasNoMes(empId) {
      return st.referencias.filter(function (r) { return r.empresaId === empId && r.criadoEm > agora() - 30 * DIA && r.origem !== 'email'; }).length +
        (st.referenciaEnviosEmail || []).filter(function (x) { return x.empresaId === empId && x.em > agora() - 30 * DIA; }).length;
    }

    H.vagas_referencias_publicar = function (a) {
      var c = contaAtual('pessoa');
      if (!c.ok) return c;
      var p = st.pessoas[st.sessao];
      if (!p) return erro('Complete seu cadastro antes de publicar suas referências.', { completar: true });
      if (a.p_ligar === true) { if (!p.referenciasToken) p.referenciasToken = novoToken(); } else p.referenciasToken = null;
      return ok({ caminho: p.referenciasToken ? '/referencias.html?t=' + p.referenciasToken : '' });
    };

    H.vagas_referencias_publicas = function (a) {
      var tok = txt(a.p_token);
      if (!/^[0-9a-f]{64}$/.test(tok)) return erro('Página não encontrada.');
      var uid = Object.keys(st.pessoas).filter(function (k) { return st.pessoas[k].referenciasToken === tok; })[0];
      if (!uid || !contaValida(uid)) return erro('Página não encontrada.');
      return ok({ pessoa: { nomeExibicao: R.nomeExibicao((st.contatos[uid] || {}).nome) },
        referencias: st.referencias.filter(function (r) { return r.pessoaId === uid && referenciaParaEmpresa(r, st.sessao ? minhasEmpresasIds() : []); })
          .sort(function (x, y) { return (y.fim || '9999') > (x.fim || '9999') ? 1 : -1; }).map(function (r) { return referenciaJson(r, false); }) });
    };

    // ---- Operação e equipe
    function exigirOperacao() {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      if (!cidadesOperadas().length) return erro(R.MSG.SEM_PERMISSAO);
      return null;
    }

    H.vagas_op_resumo = function () {
      var x = exigirOperacao(); if (x) return x;
      var cids = cidadesOperadas();
      return ok({ cidades: st.cidades.filter(function (c) { return cids.indexOf(c.slug) >= 0; }).sort(function (a, b) { return a.ordem - b.ordem; }).map(function (c) {
        var es = st.empresas.filter(function (e) { return e.cidade === c.slug; });
        var as = st.anuncios.filter(function (a) { return a.cidade === c.slug; });
        var minha = st.operadores.filter(function (o) { return o.userId === st.sessao && o.cidade === c.slug && o.ativo; })[0];
        return { id: c.id, slug: c.slug, nome: c.nome, status: c.status, papel: papelCidade(c.slug),
          repassePercentual: minha ? minha.repassePercentual : null, contagens: {
          empresasEmAnalise: es.filter(function (e) { return e.status === 'em_analise'; }).length, empresasAtivas: es.filter(function (e) { return e.status === 'ativa'; }).length,
          anunciosEmRevisao: as.filter(function (a) { return a.status === 'em_revisao'; }).length, anunciosSuspensos: as.filter(function (a) { return a.status === 'suspenso'; }).length,
          anunciosNoAr: as.filter(noAr).length, denunciasAbertas: st.denuncias.filter(function (d) { return d.cidade === c.slug && d.status === 'aberta'; }).length,
          pessoas: Object.keys(st.pessoas).filter(function (k) { return st.pessoas[k].cidade === c.slug || st.pessoas[k].cidade2 === c.slug; }).length,
          listaEspera: st.listaEspera.filter(function (l) { return l.cidade === c.slug; }).length } };
      }) });
    };

    H.vagas_op_empresas = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var status = R.listaEnum(f.status, ['em_analise', 'ativa', 'suspensa']);
      var busca = R.normalizar(txt(f.busca)).slice(0, 60);
      return ok({ empresas: st.empresas.filter(function (e) {
        return cids.indexOf(e.cidade) >= 0 && (!status.length || status.indexOf(e.status) >= 0) &&
          (!busca || R.normalizar(e.nomeFantasia + ' ' + e.razaoSocial + ' ' + e.cnpj).indexOf(busca) >= 0);
      }).sort(function (p, q) { return (q.status === 'em_analise') - (p.status === 'em_analise') || q.criadoEm - p.criadoEm; }).map(function (e) {
        var as = st.anuncios.filter(function (a2) { return a2.empresaId === e.id; });
        return Object.assign(empresaJson(e), { anuncios: { total: as.length, noAr: as.filter(noAr).length },
          denunciasAbertas: st.denuncias.filter(function (d) { return d.empresaId === e.id && d.status === 'aberta'; }).length,
          membros: st.membros.filter(function (m) { return m.empresaId === e.id && m.ativo; }).length });
      }) });
    };

    H.vagas_op_empresa_decidir = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var e = empresa(a.p_empresa);
      if (!e) return erro('Empresa não encontrada.');
      var papel = papelCidade(e.cidade);
      if (!papel) return erro('Empresa não encontrada.');
      var motivo = R.limparTexto(a.p_motivo, 300);
      if (a.p_acao === 'aprovar') {
        if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
        if (e.status === 'suspensa') return erro('Empresa suspensa: use "Reativar".');
        if (e.status !== 'ativa') { e.status = 'ativa'; e.statusMotivo = ''; e.cnpjConferidoEm = e.cnpjConferidoEm || agora(); }
      } else if (a.p_acao === 'suspender') {
        if (!motivo) return erro('Informe o motivo.');
        e.status = 'suspensa'; e.statusMotivo = motivo;
      } else if (a.p_acao === 'recusar') {
        if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
        if (!motivo) return erro('Informe o motivo.');
        if (e.status !== 'em_analise') return erro('Só dá para recusar uma empresa em análise.');
        e.statusMotivo = motivo;
      } else if (a.p_acao === 'reativar') {
        if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
        if (e.status !== 'suspensa') return erro('Esta empresa não está suspensa.');
        e.status = 'ativa'; e.statusMotivo = ''; e.cnpjConferidoEm = e.cnpjConferidoEm || agora();
      } else return erro('Ação inválida.');
      registrar(e.cidade, papel, 'empresa_' + a.p_acao, 'empresa', e.id, motivo);
      return ok({ empresa: empresaJson(e) });
    };

    H.vagas_op_empresa_cadastrar = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var l = lerEmpresaCompleta(obj(a.p_dados));
      if (!l.ok) return l;
      var papel = papelCidade(l.cidade);
      if (!papel || papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      var e = inserirEmpresa(l.campos, l.cidade, l.zona, 'ativa', st.sessao);
      registrar(e.cidade, papel, 'empresa_cadastrar', 'empresa', e.id, '');
      return ok({ empresa: empresaJson(e) });
    };

    H.vagas_op_vincular_membro = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var e = empresa(a.p_empresa);
      if (!e) return erro('Empresa não encontrada.');
      var papel = papelCidade(e.cidade);
      if (!papel) return erro('Empresa não encontrada.');
      if (papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      var u = usuarioPorEmail(R.normalizarEmail(a.p_email));
      if (!u || !st.contas[u.id] || st.contas[u.id].tipo !== 'empresa') {
        return erro('Não há conta de empresa com este e-mail. Peça para a empresa criar a conta (ou faça o cadastro assistido).');
      }
      if (st.membros.some(function (x) { return x.empresaId === e.id && x.ativo && x.userId !== u.id; })) {
        return erro('Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.');
      }
      var m = st.membros.filter(function (x) { return x.empresaId === e.id && x.userId === u.id; })[0];
      if (m) m.ativo = true;
      else {
        m = { empresaId: e.id, userId: u.id, papel: st.membros.some(function (x) { return x.empresaId === e.id && x.papel === 'dono' && x.ativo; }) ? 'recrutador' : 'dono', ativo: true, criadoEm: agora() };
        st.membros.push(m);
      }
      registrar(e.cidade, papel, 'empresa_vincular_membro', 'empresa', e.id, '', { papel: m.papel });
      return ok({ membro: { papel: m.papel } });
    };

    H.vagas_op_anuncios = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var status = R.listaEnum(f.status, ['rascunho', 'em_revisao', 'publicado', 'pausado', 'encerrado', 'suspenso', 'removido']);
      if (!status.length) status = ['em_revisao', 'suspenso'];
      return ok({ anuncios: st.anuncios.filter(function (an) { return cids.indexOf(an.cidade) >= 0 && status.indexOf(an.status) >= 0; })
        .sort(function (p, q) { return q.atualizadoEm - p.atualizadoEm; }).map(function (an) {
          var e = empresa(an.empresaId);
          return Object.assign(anuncioEmpresa(an), { empresa: { id: e.id, nomeFantasia: e.nomeFantasia, status: e.status, cnpjFormatado: R.formatarCnpj(e.cnpj), conferida: !!e.cnpjConferidoEm },
            denunciasAbertas: st.denuncias.filter(function (d) { return d.anuncioId === an.id && d.status === 'aberta'; }).length });
        }) });
    };

    H.vagas_op_anuncio_decidir = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var an = anuncio(a.p_anuncio);
      if (!an) return erro('Vaga não encontrada.');
      var papel = papelCidade(an.cidade);
      if (!papel) return erro('Vaga não encontrada.');
      var e = empresa(an.empresaId);
      var motivo = R.limparTexto(a.p_motivo, 300);
      if (a.p_acao === 'publicar') {
        if (an.status !== 'em_revisao' && an.status !== 'suspenso') return erro('Esta vaga não está esperando a moderação.');
        if (e.status !== 'ativa') return erro('Aprove a empresa antes de publicar a vaga.');
        if (an.modalidade === 'diaria' && an.diaria.data < hoje(cidade(an.cidade).fuso)) return erro('A data da diária já passou.');
        if (an.status === 'em_revisao' || an.expiraEm == null || an.expiraEm <= agora()) { an.publicadoEm = an.publicadoEm || agora(); an.expiraEm = expiraCalculada(an); }
        if (an.status !== 'publicado') marcarPublicada(an);
        an.status = 'publicado'; an.statusMotivo = '';
        st.denuncias.forEach(function (d) {
          if (d.anuncioId === an.id && d.alvo === 'anuncio' && d.status === 'aberta') {
            d.status = 'improcedente'; d.decididaPor = st.sessao; d.decididaEm = agora(); d.decisaoMotivo = motivo || 'Vaga devolvida ao ar pela moderação.';
          }
        });
      } else if (a.p_acao === 'devolver') {
        if (!motivo) return erro('Informe o motivo.');
        if (an.status !== 'em_revisao' && an.status !== 'suspenso') return erro('Esta vaga não está esperando a moderação.');
        an.status = 'rascunho'; an.statusMotivo = motivo;
      } else if (a.p_acao === 'remover') {
        if (!motivo) return erro('Informe o motivo.');
        an.status = 'removido'; an.statusMotivo = motivo;
      } else return erro('Ação inválida.');
      tocar(an);
      registrar(an.cidade, papel, 'anuncio_' + a.p_acao, 'anuncio', an.id, motivo);
      return ok({ anuncio: anuncioEmpresa(an) });
    };

    H.vagas_op_denuncias = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var status = R.listaEnum(f.status, ['aberta', 'procedente', 'improcedente']);
      if (!status.length) status = ['aberta'];
      return ok({ denuncias: st.denuncias.filter(function (d) { return cids.indexOf(d.cidade) >= 0 && status.indexOf(d.status) >= 0; })
        .sort(function (p, q) { return q.criadoEm - p.criadoEm; }).map(function (d) {
          var an = d.anuncioId ? anuncio(d.anuncioId) : null;
          var r = d.referenciaId ? st.referencias.filter(function (y) { return y.id === d.referenciaId; })[0] : null;
          return { id: d.id, alvo: d.alvo, motivo: d.motivo, detalhe: d.detalhe, status: d.status, contaNoLimite: d.contaNoLimite, criadoEm: iso(d.criadoEm),
            decisaoMotivo: d.decisaoMotivo || '', decididaEm: iso(d.decididaEm),
            anuncio: an ? { id: an.id, codigo: an.codigo, titulo: an.titulo, status: an.status, empresa: { id: an.empresaId, nomeFantasia: empresa(an.empresaId).nomeFantasia, status: empresa(an.empresaId).status } } : null,
            mensagem: d.alvo === 'mensagem' ? { texto: d.textoDenunciado, autor: d.autorMensagem } : null,
            referencia: r ? { id: r.id, funcao: r.funcao, texto: r.texto, textoStatus: r.textoStatus, status: referenciaStatusEmpresa(r), empresa: { id: r.empresaId, nomeFantasia: empresa(r.empresaId).nomeFantasia } } : null };
        }) });
    };

    H.vagas_op_denuncia_decidir = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var d = st.denuncias.filter(function (y) { return y.id === a.p_denuncia; })[0];
      if (!d) return erro('Denúncia não encontrada.');
      var papel = papelCidade(d.cidade);
      if (!papel) return erro('Denúncia não encontrada.');
      var o = obj(a.p_dados);
      var dec = txt(o.decisao);
      var motivo = R.limparTexto(o.motivo, 300);
      if (dec !== 'procedente' && dec !== 'improcedente') return erro('Decisão inválida.');
      if (!motivo) return erro('Informe o motivo.');
      if ((o.suspenderEmpresa === true || o.suspenderAutor === true) && papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      d.status = dec; d.decididaPor = st.sessao; d.decididaEm = agora(); d.decisaoMotivo = motivo;
      if (dec === 'procedente') {
        if (o.removerAnuncio === true && d.anuncioId) { var an = anuncio(d.anuncioId); an.status = 'removido'; an.statusMotivo = motivo; registrar(d.cidade, papel, 'anuncio_remover', 'anuncio', an.id, motivo); }
        if ((o.suspenderEmpresa === true || (o.suspenderAutor === true && d.autorMensagem === 'empresa')) && d.empresaId) {
          var e = empresa(d.empresaId); e.status = 'suspensa'; e.statusMotivo = motivo; registrar(d.cidade, papel, 'empresa_suspender', 'empresa', e.id, motivo);
        }
        if (o.removerReferencia === true && d.referenciaId) {
          var r = st.referencias.filter(function (y) { return y.id === d.referenciaId; })[0];
          r.status = 'removida'; r.removidaPor = 'moderacao'; r.texto = ''; r.textoStatus = 'sem_texto'; r.textoMotivo = motivo;
          historico(r.id, 'removida', 'moderacao'); registrar(d.cidade, papel, 'referencia_remover', 'referencia', r.id, motivo);
        }
        if (o.suspenderAutor === true && d.autorMensagem === 'pessoa' && d.autorMensagemUser && st.contas[d.autorMensagemUser]) {
          st.contas[d.autorMensagemUser].status = 'suspensa'; st.contas[d.autorMensagemUser].suspensaMotivo = motivo;
          registrar(d.cidade, papel, 'conta_suspender', 'conta', null, motivo, { denuncia: d.id });
        }
      }
      registrar(d.cidade, papel, 'denuncia_' + dec, 'denuncia', d.id, motivo);
      return ok({ denuncia: { id: d.id, status: d.status, decisaoMotivo: d.decisaoMotivo } });
    };

    H.vagas_op_moderacao = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var lim = R.inteiro(f.limite); lim = Math.min(Math.max(lim == null ? 100 : lim, 1), 200);
      return ok({ registros: st.moderacao.filter(function (m) { return cids.indexOf(m.cidade) >= 0; }).sort(function (p, q) { return q.em - p.em || q.id - p.id; })
        .slice(0, lim).map(function (m) { return { id: m.id, em: iso(m.em), papel: m.papel, acao: m.acao, alvo: m.alvo, alvoId: m.alvoId, motivo: m.motivo, dados: clone(m.dados), cidade: m.cidade }; }) });
    };

    H.vagas_op_referencias = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var f = obj(a.p_filtro);
      var cids = cidadesDoFiltro(f);
      var status = R.listaEnum(f.textoStatus, ['pendente', 'publicado', 'nao_publicado']);
      if (!status.length) status = ['pendente'];
      return ok({ referencias: st.referencias.filter(function (r) { var e = empresa(r.empresaId); return cids.indexOf(e.cidade) >= 0 && status.indexOf(r.textoStatus) >= 0 && referenciaStatusEmpresa(r) !== 'removida'; })
        .sort(function (p, q) { return p.criadoEm - q.criadoEm; }).map(function (r) {
          return { id: r.id, empresa: { id: r.empresaId, nomeFantasia: empresa(r.empresaId).nomeFantasia }, funcao: r.funcao, vinculo: r.vinculo, texto: r.texto,
            textoStatus: r.textoStatus, textoMotivo: r.textoMotivo, status: referenciaStatusEmpresa(r), criadoEm: iso(r.criadoEm) };
        }) });
    };

    H.vagas_op_referencia_decidir = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var r = st.referencias.filter(function (y) { return y.id === a.p_referencia; })[0];
      if (!r) return erro('Referência não encontrada.');
      var cid = empresa(r.empresaId).cidade;
      var papel = papelCidade(cid);
      if (!papel) return erro('Referência não encontrada.');
      var motivo = R.limparTexto(a.p_motivo, 300);
      if (a.p_acao === 'aprovar_texto') {
        if (r.textoStatus !== 'pendente') return erro('Este texto não está esperando a moderação.');
        r.textoStatus = 'publicado'; r.textoMotivo = '';
      } else if (a.p_acao === 'recusar_texto') {
        if (!motivo) return erro('Informe o motivo.');
        if (r.textoStatus !== 'pendente' && r.textoStatus !== 'publicado') return erro('Este texto não está esperando a moderação.');
        r.textoStatus = 'nao_publicado'; r.textoMotivo = motivo;
      } else if (a.p_acao === 'remover') {
        if (!motivo) return erro('Informe o motivo.');
        r.status = 'removida'; r.removidaPor = 'moderacao'; r.texto = ''; r.textoStatus = 'sem_texto'; r.textoMotivo = motivo;
      } else return erro('Ação inválida.');
      historico(r.id, { aprovar_texto: 'texto_publicado', recusar_texto: 'texto_nao_publicado', remover: 'removida' }[a.p_acao], 'moderacao');
      registrar(cid, papel, 'referencia_' + a.p_acao, 'referencia', r.id, motivo);
      return ok({ referencia: { id: r.id, status: referenciaStatusEmpresa(r), textoStatus: r.textoStatus } });
    };

    H.vagas_adm_cidade_salvar = function (a) {
      if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
      var d = obj(a.p_dados);
      var slug = txt(d.slug).trim().toLowerCase();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*-[a-z]{2}$/.test(slug) || slug.length > 60) return erro('Endereço da cidade inválido (ex.: nome-da-cidade-uf).');
      var status = txt(d.status) || 'rascunho';
      if (['rascunho', 'lista_espera', 'ativa', 'pausada'].indexOf(status) < 0) return erro('Status da cidade inválido.');
      var porte = txt(d.porte).trim().toLowerCase() || null;
      if (porte && ['grande', 'pequena'].indexOf(porte) < 0) return erro('Porte da cidade inválido (grande ou pequena).');
      var praca = null;
      if (txt(d.praca).trim()) { praca = cidade(txt(d.praca).trim().toLowerCase()); if (!praca) return erro('Cidade-polo não encontrada.'); }
      var canal = txt(d.canalWhatsapp).trim().replace(/\/+$/, '') || null;
      if (canal && !/^https:\/\/whatsapp\.com\/channel\/[0-9A-Za-z]{10,64}$/.test(canal)) {
        return erro('Link do canal de WhatsApp inválido. Use o link do canal (https://whatsapp.com/channel/...).');
      }
      var c = cidade(slug);
      var tem = function (k) { return Object.prototype.hasOwnProperty.call(d, k); };
      if (!c) {
        if (R.limparTexto(d.nome, 80).length < 2 || !/^[A-Z]{2}$/.test(txt(d.uf).trim().toUpperCase())) return erro('Dados da cidade inválidos. Confira nome, UF e IBGE.');
        c = { id: novoId(), slug: slug, nome: '', uf: '', ibge: null, fuso: 'America/Sao_Paulo', status: 'rascunho', porte: null, praca: null, metaListaEspera: null, ordem: 0 };
        st.cidades.push(c);
        d = Object.assign({ nome: d.nome, uf: d.uf, status: status }, d);
      }
      if (tem('nome')) c.nome = R.limparTexto(d.nome, 80);
      if (tem('uf')) c.uf = txt(d.uf).trim().toUpperCase();
      if (tem('ibge')) c.ibge = txt(d.ibge).trim() || null;
      if (tem('fuso')) c.fuso = txt(d.fuso).trim() || 'America/Sao_Paulo';
      if (tem('status')) {
        if (status === 'ativa' && c.status !== 'ativa') {
          c.abertaEm = agora();
          st.anuncios.forEach(function (an) {
            if (an.cidade === c.slug && an.preAbertura && (an.status === 'publicado' || an.status === 'pausado')) {
              an.publicadoEm = c.abertaEm; an.expiraEm = c.abertaEm + (an.modalidade === 'diaria' ? (an.prazoHoras || 48) * 3600000 : an.diasNoAr * DIA);
              an.preAbertura = false;
            }
          });
        }
        c.status = status;
      }
      if (tem('porte')) c.porte = porte;
      if (tem('praca')) c.praca = praca ? praca.slug : null;
      if (tem('metaListaEspera')) c.metaListaEspera = R.inteiro(d.metaListaEspera);
      if (tem('ordem')) c.ordem = R.inteiro(d.ordem) || 0;
      if (tem('canalWhatsapp')) c.canalWhatsapp = canal;
      registrar(c.slug, 'admin', 'cidade_salvar', 'cidade', c.id, '', { status: c.status, porte: c.porte || null });
      return ok({ cidade: Object.assign(cidadeJson(c), { porte: c.porte || null }) });
    };

    H.vagas_adm_zona_salvar = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var d = obj(a.p_dados);
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c) return erro('Cidade não encontrada.');
      var papel = papelCidade(c.slug);
      if (!papel || papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      var slug = txt(d.slug).trim().toLowerCase();
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return erro('Endereço da zona inválido (ex.: zona-oeste).');
      var z = zona(c.slug, slug);
      var tem = function (k) { return Object.prototype.hasOwnProperty.call(d, k); };
      if (!z) {
        if (R.limparTexto(d.nome, 60).length < 2) return erro('Dados da zona inválidos. Confira o nome.');
        z = { id: novoId(), cidade: c.slug, slug: slug, nome: '', bairros: [], ordem: 0, ativa: true };
        st.zonas.push(z);
        d = Object.assign({ nome: d.nome }, d);
      }
      if (tem('nome')) z.nome = R.limparTexto(d.nome, 60);
      if (tem('bairros')) z.bairros = R.listaTexto(d.bairros, 60);
      if (tem('ordem')) z.ordem = R.inteiro(d.ordem) || 0;
      if (tem('ativa')) z.ativa = d.ativa !== false;
      registrar(c.slug, papel, 'zona_salvar', 'zona', z.id, '');
      return ok({ zona: { id: z.id, slug: z.slug, nome: z.nome, bairros: z.bairros.slice(), ordem: z.ordem, ativa: z.ativa } });
    };

    H.vagas_adm_operador_salvar = function (a) {
      if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
      var d = obj(a.p_dados);
      var c = cidade(txt(d.cidade).trim().toLowerCase());
      if (!c) return erro('Cidade não encontrada.');
      var papel = txt(d.papel) || 'operador';
      if (papel !== 'operador' && papel !== 'moderador') return erro('Papel inválido.');
      var u = usuarioPorEmail(R.normalizarEmail(d.email));
      if (!u || !st.contas[u.id] || st.contas[u.id].tipo !== 'operador') return erro('Não há conta de operação com este e-mail. Use o convite de operador.');
      var o = st.operadores.filter(function (x) { return x.userId === u.id && x.cidade === c.slug; })[0];
      if (!o) { o = { userId: u.id, cidade: c.slug, papel: papel, ativo: true, repassePercentual: 0, contratoVersao: '' }; st.operadores.push(o); }
      o.papel = papel;
      if (Object.prototype.hasOwnProperty.call(d, 'ativo')) o.ativo = d.ativo !== false;
      if (Object.prototype.hasOwnProperty.call(d, 'repassePercentual')) {
        var pct = Number(d.repassePercentual);
        if (!isFinite(pct) || pct < 0 || pct > 100) return erro('Percentual de repasse inválido (0 a 100).');
        o.repassePercentual = pct;
      }
      if (Object.prototype.hasOwnProperty.call(d, 'contratoVersao')) o.contratoVersao = R.limparTexto(d.contratoVersao, 40);
      registrar(c.slug, 'admin', 'operador_salvar', 'operador', null, '', { papel: o.papel, ativo: o.ativo });
      return ok({ operador: { cidade: c.slug, papel: o.papel, ativo: o.ativo, repassePercentual: o.repassePercentual, contratoVersao: o.contratoVersao } });
    };

    // ---- Pedidos da operação (iguais aos da 20261024; só leitura).
    H.vagas_adm_cidades = function () {
      if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
      return ok({ cidades: st.cidades.slice().sort(function (a, b) { return a.ordem - b.ordem || a.nome.localeCompare(b.nome); }).map(function (c) {
        return { id: c.id, slug: c.slug, nome: c.nome, uf: c.uf, ibge: c.ibge || null, fuso: c.fuso, status: c.status, porte: c.porte || null,
          praca: c.praca || null, metaListaEspera: c.metaListaEspera == null ? null : c.metaListaEspera, ordem: c.ordem,
          canalWhatsapp: c.canalWhatsapp || null, abertaEm: iso(c.abertaEm),
          zonas: st.zonas.filter(function (z) { return z.cidade === c.slug; }).sort(function (a, b) { return a.ordem - b.ordem || a.nome.localeCompare(b.nome); })
            .map(function (z) { return { id: z.id, slug: z.slug, nome: z.nome, bairros: z.bairros.slice(), ordem: z.ordem, ativa: z.ativa }; }),
          operadoresAtivos: st.operadores.filter(function (o) { return o.cidade === c.slug && o.ativo; }).length };
      }) });
    };

    H.vagas_adm_operadores = function (a) {
      if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
      var f = obj(a.p_filtro);
      var slug = txt(f.cidade).trim().toLowerCase();
      if (slug && !cidade(slug)) return erro('Cidade não encontrada.');
      var ordem = function (o) { var c = cidade(o.cidade); return c ? c.ordem : 0; };
      return ok({ operadores: st.operadores.filter(function (o) { return !slug || o.cidade === slug; }).slice().sort(function (x, y) {
        var ux = usuario(x.userId) || {}; var uy = usuario(y.userId) || {};
        return ordem(x) - ordem(y) || (y.ativo - x.ativo) || x.papel.localeCompare(y.papel) || String(ux.email).localeCompare(String(uy.email));
      }).map(function (o) {
        var u = usuario(o.userId) || {};
        var ct = st.contas[o.userId] || {};
        var atos = st.moderacao.filter(function (m) { return m.ator === o.userId && m.cidade === o.cidade; });
        var ult = atos.length ? atos[atos.length - 1] : null;
        var c = cidade(o.cidade);
        return { email: u.email || '', cidade: { slug: c.slug, nome: c.nome }, papel: o.papel, ativo: o.ativo, repassePercentual: o.repassePercentual,
          contratoVersao: o.contratoVersao || '', contaStatus: ct.status === 'suspensa' ? 'suspensa' : (u.confirmada ? 'ativa' : 'pendente'),
          contratoAceitoEm: iso(ct.termosAceitosEm), criadoEm: iso(o.criadoEm || ct.criadoEm),
          ultimoAto: ult ? { acao: ult.acao, em: iso(ult.em) } : null };
      }) });
    };

    // Cadastros assistidos ainda pendentes: operador(a) só os que criou, equipe todos; e-mail MASCARADO (a operação nunca
    // lê contato de pessoa); moderador(a) não faz cadastro assistido.
    H.vagas_op_assistidos = function (a) {
      var x = exigirOperacao(); if (x) return x;
      var cids = cidadesDoFiltro(obj(a.p_filtro)).filter(function (s) { var p = papelCidade(s); return p === 'admin' || p === 'operador'; });
      if (!cids.length) return erro(R.MSG.SEM_PERMISSAO);
      var adm = eAdmin();
      return ok({ contas: Object.keys(st.contas).map(function (uid) { return { uid: uid, c: st.contas[uid], u: usuario(uid) }; })
        .filter(function (y) {
          return y.c.status === 'pendente' && y.c.assistidaPor && cids.indexOf(y.c.cidade) >= 0 && (y.c.tipo === 'pessoa' || y.c.tipo === 'empresa')
            && y.c.criadoEm > agora() - 30 * DIA && (adm || y.c.assistidaPor === st.sessao) && y.u && !y.u.confirmada;
        }).sort(function (p, q) { return q.c.criadoEm - p.c.criadoEm; }).slice(0, 200).map(function (y) {
          return { email: mascarar(y.u.email), tipo: y.c.tipo, cidade: y.c.cidade, codigoEvento: y.c.codigoEvento || '', criadoEm: iso(y.c.criadoEm) };
        }) });
    };

    H.vagas_exportar_meus_dados = function () {
      var c = contaAtual(null);
      if (!c.ok) return c;
      var uid = st.sessao;
      var ct = st.contas[uid];
      return ok({ geradoEm: iso(agora()),
        conta: { tipo: ct.tipo, status: ct.status, email: usuario(uid).email, criadoEm: iso(ct.criadoEm), confirmadaEm: iso(ct.confirmadaEm),
          termosVersao: ct.termosVersao || '', termosAceitosEm: iso(ct.termosAceitosEm) },
        consentimentos: st.consentimentos.filter(function (x) { return x.userId === uid; }).map(function (x) { return { tipo: x.tipo, versao: x.versao, aceito: x.aceito, ate: iso(x.ate), em: iso(x.em) }; }),
        pessoa: pessoaJson(uid),
        testes: null,
        foto: temFoto(uid) ? 'Você tem uma foto guardada (só as empresas com Combinou a veem). Baixe pelo seu perfil.' : '',
        candidaturas: st.candidaturas.filter(function (k) { return k.pessoaId === uid; }).map(candidaturaPessoa),
        pulos: st.pulos.filter(function (p) { return p.pessoaId === uid; }).map(function (p) { var an = anuncio(p.anuncioId);
          return { anuncio: { codigo: an ? an.codigo : '', titulo: an ? an.titulo : '' }, em: iso(p.em) }; }),
        denunciasFeitas: st.denuncias.filter(function (d) { return d.autor === uid; }).map(function (d) {
          return { alvo: d.alvo, motivo: d.motivo, detalhe: d.detalhe || '', status: d.status, em: iso(d.criadoEm) }; }),
        mensagensEnviadas: st.mensagens.filter(function (m) { return m.autorUser === uid; }).map(function (m) { return { em: iso(m.criadoEm), texto: m.texto }; }),
        acessosAoContato: st.acessos.filter(function (x) { return x.pessoaId === uid; }).map(function (x) { return { empresa: x.empresaNome, anuncio: x.anuncioTitulo, em: iso(x.em) }; }),
        empresas: st.membros.filter(function (m) { return m.userId === uid; }).map(function (m) { return Object.assign(empresaJson(empresa(m.empresaId)), { papel: m.papel }); }),
        operador: st.operadores.filter(function (o) { return o.userId === uid; }).map(function (o) { return { cidade: o.cidade, papel: o.papel, ativo: o.ativo }; }),
        referenciasRecebidas: st.referencias.filter(function (r) { return r.pessoaId === uid; }).map(function (r) {
          return Object.assign(referenciaJson(r, true), { status: r.status, historico: st.referenciaHistorico.filter(function (h) { return h.referenciaId === r.id; })
            .map(function (h) { return { acao: h.acao, por: h.por, em: iso(h.em) }; }) });
        }),
        pedidosDeReferencia: st.convitesReferencia.filter(function (x) { return x.pessoaId === uid; }).map(function (x) { return { empresaNome: x.empresaNome, status: x.status, criadoEm: iso(x.criadoEm) }; }) });
    };

    // ---- Painel da praça (igual a vagas_op_indicadores da 20261024): só agregados, da cidade + entorno; alvo pelo porte.
    function alvoNumero(o, porte) {
      var v = o && porte ? o[porte] : undefined;
      if (typeof v === 'number') return v;
      if (v && typeof v === 'object' && typeof v.total === 'number') return v.total;
      return null;
    }
    function indicadorJson(chave, porte, valor, extra) {
      var i = R.INDICADORES.filter(function (x) { return x.chave === chave; })[0];
      var alvo = alvoNumero(i.alvo, porte);
      var v = valor === undefined || valor === null || (typeof valor === 'number' && !isFinite(valor)) ? null : valor;
      return Object.assign({ chave: i.chave, nome: i.nome, unidade: i.unidade, periodo: i.periodo, direcao: i.direcao, hipotese: !!i.hipotese,
        valor: v, alvo: alvo, alvoLancamento: alvoNumero(i.alvoLancamento, porte), cor: R.corIndicador(v, alvo, i.direcao), semDado: false,
        detalhe: {} }, extra || {});
    }
    function parteGatilho(descricao, okv, extra) { return Object.assign({ descricao: descricao, ok: okv === undefined ? null : okv }, extra || {}); }
    function gatilhoJson(chave, aplica, partes) {
      var g = R.GATILHOS.filter(function (x) { return x.chave === chave; })[0];
      var atingido = null;
      if (aplica && partes.length) {
        if (partes.some(function (p) { return p.ok === false; })) atingido = false;
        else if (partes.some(function (p) { return p.ok !== true; })) atingido = null;
        else atingido = true;
      }
      return { chave: g.chave, nome: g.nome, hipotese: !!g.hipotese, aplica: !!aplica, atingido: atingido, partes: aplica ? partes : [] };
    }
    function maiorIgual(a, b) { return a === null || a === undefined || b === null || b === undefined ? null : a >= b; }
    function menorIgual(a, b) { return a === null || a === undefined || b === null || b === undefined ? null : a <= b; }
    function mediana(l) {
      if (!l.length) return null;
      var x = l.slice().sort(function (p, q) { return p - q; });
      var m = Math.floor(x.length / 2);
      return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
    }
    function umaCasa(x) { return x === null ? null : Math.round(x * 10) / 10; }
    // Diferença (ms) entre o relógio do fuso e o UTC num instante (Intl); sem Intl de fusos, UTC−3.
    function deslocamento(ms, fuso) {
      try {
        var p = {};
        new Intl.DateTimeFormat('en-US', { timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric',
          minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
        return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
      } catch (e) { return -3 * 3600000; }
    }
    function inicioDoMes(fuso) {
      var base = Date.parse(hoje(fuso).slice(0, 8) + '01T00:00:00Z');
      return base - deslocamento(base, fuso);
    }
    function seloValidoEm(uid, ms, fuso) {
      var dia = R.hoje(fuso, ms);
      return selos(uid).some(function (x) { return x.data <= dia && x.validoAte >= dia; });
    }

    H.vagas_op_indicadores = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var c = cidade(txt(a.p_cidade).trim().toLowerCase());
      if (!c) return erro(eAdmin() ? 'Cidade não encontrada.' : R.MSG.SEM_PERMISSAO);
      if (!papelCidade(c.slug)) return erro(R.MSG.SEM_PERMISSAO);
      var cids = [c.slug].concat(st.cidades.filter(function (x) { return x.praca === c.slug && x.slug !== c.slug; }).map(function (x) { return x.slug; }));
      var naPraca = function (slug) { return cids.indexOf(slug) >= 0; };
      var porte = c.porte || null;
      var fuso = c.fuso || 'America/Sao_Paulo';
      var hj = hoje(fuso);
      var mes = inicioDoMes(fuso);
      var t = agora();
      var janelaTxt = (R.INDICADORES[2].janela || {})[porte];
      var janela = janelaTxt === '72h' ? 72 * 3600000 : 7 * DIA;
      var testes = R.TESTES_SELO.map(function (x) { return x.id; });
      // Números pequenos de PESSOAS protegidos (revisão de segurança, I1): até o fim de ontem no fuso; abaixo de 3, null + poucos.
      var protege = porte !== 'grande';
      var ate = protege ? Date.parse(hj + 'T00:00:00Z') - deslocamento(Date.parse(hj + 'T00:00:00Z'), fuso) : t;
      var ontem = R.somarDias(hj, -1);
      // 1. Vagas no ar.
      var noArLista = st.anuncios.filter(function (an) { return naPraca(an.cidade) && noAr(an); });
      var porTesteVagas = {};
      testes.forEach(function (x) { porTesteVagas[x] = noArLista.filter(function (an) { return an.selo === x; }).length; });
      var areas = {};
      noArLista.forEach(function (an) { areas[an.area] = (areas[an.area] || 0) + 1; });
      var porArea = Object.keys(areas).map(function (k) { return { area: k, nome: areaJson(k).nome, valor: areas[k] }; })
        .sort(function (p, q) { return q.valor - p.valor || R.AREAS.findIndex(function (x) { return x.id === p.area; }) - R.AREAS.findIndex(function (x) { return x.id === q.area; }); });
      // 2. Pessoas da praça com selo válido.
      var daPraca = Object.keys(st.pessoas).filter(function (uid) { var p = st.pessoas[uid]; return naPraca(p.cidade) || (p.cidade2 && naPraca(p.cidade2)); });
      var comSelo = function (uid, teste) {
        return selos(uid).some(function (x) {
          var emitido = x.emitidoEm != null ? x.emitidoEm : Date.parse(x.data + 'T12:00:00Z');
          return (!teste || x.teste === teste) && (protege ? emitido < ate && x.validoAte >= ontem : x.validoAte >= hj);
        });
      };
      var nSelo = daPraca.filter(function (uid) { return comSelo(uid); }).length;
      var porTesteSelo = {};
      testes.forEach(function (x) { porTesteSelo[x] = daPraca.filter(function (uid) { return comSelo(uid, x); }).length; });
      var seloPoucos = protege && (nSelo < 3 || testes.some(function (x) { return porTesteSelo[x] < 3; }));
      if (protege) testes.forEach(function (x) { if (porTesteSelo[x] < 3) porTesteSelo[x] = null; });
      // 3 e 4. Vagas publicadas nos últimos 30 dias (e há pelo menos a janela / 7 dias).
      var base = function (min) {
        return st.anuncios.filter(function (an) { return naPraca(an.cidade) && an.publicadoEm != null && an.status !== 'removido' && an.publicadoEm >= t - 30 * DIA && an.publicadoEm <= t - min; });
      };
      var b3 = base(janela);
      var ok3 = b3.filter(function (an) {
        return st.candidaturas.filter(function (k) {
          return k.anuncioId === an.id && k.status !== 'retirada' && k.criadoEm <= an.publicadoEm + janela && seloValidoEm(k.pessoaId, k.criadoEm, fuso);
        }).length >= 3;
      }).length;
      var b7 = base(7 * DIA);
      var ok7 = b7.filter(function (an) {
        return st.candidaturas.some(function (k) { return k.anuncioId === an.id && (k.status === 'combinou' || k.status === 'contratada') && k.combinouEm <= an.publicadoEm + 7 * DIA; });
      }).length;
      // 5. Primeira resposta (dias): a primeira decisão ou a conversa aberta pela empresa; sem resposta há 7+ dias conta a espera.
      var dias = [];
      st.candidaturas.forEach(function (k) {
        var an = anuncio(k.anuncioId);
        if (!an || !naPraca(an.cidade) || k.criadoEm < t - 30 * DIA) return;
        var v = conversaDe(k.id);
        var marcas = [k.empresaDecidiuEm, v ? v.criadaEm : null].filter(function (x) { return x != null; });
        var primeira = marcas.length ? Math.min.apply(null, marcas) : null;
        if (primeira === null && (k.status === 'retirada' || k.criadoEm > t - 7 * DIA)) return;
        dias.push(((primeira === null ? t : primeira) - k.criadoEm) / DIA);
      });
      // 6. Contratações. 7. Empresas ativas no mês.
      var contratadas = st.candidaturas.filter(function (k) {
        var an = anuncio(k.anuncioId);
        return an && naPraca(an.cidade) && k.status === 'contratada' && (!protege || (k.contratadaEm != null && k.contratadaEm < ate));
      });
      var contrMes = contratadas.filter(function (k) { return k.contratadaEm >= mes; }).length;
      var empMes = st.empresas.filter(function (e) {
        if (!naPraca(e.cidade) || e.status !== 'ativa') return false;
        if (st.anuncios.some(function (an) { return an.empresaId === e.id && an.publicadoEm != null && an.publicadoEm >= mes; })) return true;
        if (st.candidaturas.some(function (k) { return k.empresaId === e.id && k.empresaDecidiuEm != null && k.empresaDecidiuEm >= mes; })) return true;
        return st.mensagens.some(function (m) {
          if (m.autor !== 'empresa' || m.criadoEm < mes) return false;
          var v = st.conversas.filter(function (x) { return x.id === m.conversaId; })[0];
          var k = v ? candidatura(v.candidaturaId) : null;
          return !!k && k.empresaId === e.id;
        });
      }).length;
      // 11. Denúncias. 13. Fila. 14. Lista de espera. 15. Cadastros assistidos.
      var decididas = st.denuncias.filter(function (d) { return naPraca(d.cidade) && d.decididaEm != null; })
        .sort(function (p, q) { return q.decididaEm - p.decididaEm; }).slice(0, 30);
      var abertas24 = st.denuncias.filter(function (d) { return naPraca(d.cidade) && d.status === 'aberta' && d.criadoEm < t - DIA; }).length;
      var filaA = st.anuncios.filter(function (an) { return naPraca(an.cidade) && an.status === 'em_revisao' && an.atualizadoEm < t - DIA; }).length;
      var filaE = st.empresas.filter(function (e) { return naPraca(e.cidade) && e.status === 'em_analise' && e.criadoEm < t - DIA; }).length;
      var filaR = st.referencias.filter(function (r) { var e = empresa(r.empresaId); return e && naPraca(e.cidade) && r.textoStatus === 'pendente' && r.criadoEm < t - DIA; }).length;
      var lista = st.listaEspera.filter(function (l) { return naPraca(l.cidade); });
      // Origem do cadastro na lista (20261024120004): cidade protegida, abaixo de 3 sai null.
      var porOrigem = {};
      ORIGENS_LISTA.concat(['naoInformada']).forEach(function (k) {
        var n = lista.filter(function (l) { return (l.origem || 'naoInformada') === k; }).length;
        porOrigem[k] = protege && n < 3 ? null : n;
      });
      var assistidas = Object.keys(st.contas).map(function (uid) { return { uid: uid, c: st.contas[uid] }; })
        .filter(function (x) { return x.c.assistidaPor && naPraca(x.c.cidade) && (x.c.tipo === 'pessoa' || x.c.tipo === 'empresa'); });
      var alvoMutirao = alvoNumero(R.INDICADORES[14].alvo, porte);
      var eventos = {};
      assistidas.filter(function (x) { return x.c.codigoEvento && x.c.criadoEm >= t - 90 * DIA; }).forEach(function (x) {
        var ev = eventos[x.c.codigoEvento] || (eventos[x.c.codigoEvento] = { codigoEvento: x.c.codigoEvento, criadas: 0, confirmadas: 0, ultimo: 0 });
        ev.criadas += 1;
        if (x.c.confirmadaEm != null) ev.confirmadas += 1;
        ev.ultimo = Math.max(ev.ultimo, x.c.criadoEm);
      });
      var porMutirao = Object.keys(eventos).map(function (k) { return eventos[k]; }).sort(function (p, q) { return q.ultimo - p.ultimo; }).slice(0, 20)
        .map(function (ev) { return { codigoEvento: ev.codigoEvento, criadas: ev.criadas, confirmadas: ev.confirmadas, cor: R.corIndicador(ev.confirmadas, alvoMutirao, 'maior_melhor') }; });

      var p3 = b3.length ? Math.round(100 * ok3 / b3.length) : null;
      var resp = umaCasa(mediana(dias));
      var den = umaCasa(mediana(decididas.map(function (d) { return (d.decididaEm - d.criadoEm) / 3600000; })));
      var lancSelo = ((R.INDICADORES[1].alvo || {})[porte] || {});
      var ind = [
        indicadorJson('vagas_ativas', porte, noArLista.length, { detalhe: { porTeste: porTesteVagas, porArea: porArea } }),
        indicadorJson('pessoas_com_selo_por_funcao', porte, protege && nSelo < 3 ? null : nSelo, { poucos: seloPoucos, ateOntem: protege, detalhe: { porTeste: porTesteSelo,
          alvoPorTeste: lancSelo.porTeste === undefined ? null : lancSelo.porTeste,
          alvoLancamentoPorTeste: (((R.INDICADORES[1].alvoLancamento || {})[porte] || {}).porTeste === undefined ? null : R.INDICADORES[1].alvoLancamento[porte].porTeste) } }),
        indicadorJson('vagas_3_interessados_72h', porte, p3, { semBase: b3.length === 0,
          detalhe: { base: b3.length, comTres: ok3, janelaHoras: Math.round(janela / 3600000) } }),
        indicadorJson('vagas_combinou_7d', porte, b7.length ? Math.round(100 * ok7 / b7.length) : null, { semBase: b7.length === 0,
          detalhe: { base: b7.length, comCombinou: ok7 } }),
        indicadorJson('primeira_resposta_empresa_dias', porte, resp, { semBase: dias.length === 0, detalhe: { base: dias.length,
          semRespostaEm7DiasPct: dias.length ? Math.round(100 * dias.filter(function (x) { return x > 7; }).length / dias.length) : null } }),
        indicadorJson('contratacoes', porte, protege && contratadas.length < 3 ? null : contratadas.length, {
          poucos: protege && (contratadas.length < 3 || contrMes < 3), ateOntem: protege,
          detalhe: { mes: protege && contrMes < 3 ? null : contrMes } }),
        indicadorJson('empresas_ativas_mes', porte, empMes, null),
        indicadorJson('empresas_buscando_semana', porte, null, { semDado: true }),
        indicadorJson('empresas_pagantes', porte, null, { semDado: true }),
        indicadorJson('receita_liquida_centavos', porte, null, { semDado: true }),
        indicadorJson('denuncia_tempo_decisao_h', porte, den, { semBase: decididas.length === 0, detalhe: { base: decididas.length, abertasMais24h: abertas24 } }),
        indicadorJson('emails_mes', porte, null, { semDado: true, alerta: R.INDICADORES[11].alerta }),
        indicadorJson('fila_moderacao', porte, filaA + filaE + filaR, { detalhe: { anuncios: filaA, empresas: filaE, referencias: filaR } }),
        indicadorJson('lista_espera', porte, lista.length, { poucos: protege && ORIGENS_LISTA.concat(['naoInformada']).some(function (k) { return porOrigem[k] === null; }),
          detalhe: { pessoa: lista.filter(function (l) { return l.perfil === 'pessoa'; }).length,
          empresa: lista.filter(function (l) { return l.perfil === 'empresa'; }).length, comWhatsapp: lista.filter(function (l) { return !!l.whatsapp; }).length,
          porOrigem: porOrigem } }),
        indicadorJson('cadastros_assistidos_confirmados', porte, assistidas.filter(function (x) { return x.c.confirmadaEm != null && x.c.confirmadaEm >= mes; }).length,
          { detalhe: { porMutirao: porMutirao } })
      ];
      var al = function (i) { return ind[i].alvo; };
      var lanc = function (i) { return ind[i].alvoLancamento; };
      var semDadoSelo = {};
      var protegido = function (n, alvo) { return protege && n < 3 ? (alvo !== null && alvo !== undefined && alvo >= 3 ? false : null) : maiorIgual(n, alvo); };
      var gat = [gatilhoJson('antes_de_cobrar', lanc(0) !== null, [
        parteGatilho('Vagas no ar: ' + lanc(0) + ' ou mais', maiorIgual(noArLista.length, lanc(0))),
        parteGatilho('Empresas ativas no mês: ' + lanc(6) + ' ou mais', maiorIgual(empMes, lanc(6))),
        parteGatilho('Pessoas com selo: ' + lanc(1) + ' ou mais', protegido(nSelo, lanc(1)), semDadoSelo),
        parteGatilho('Vagas com 3 interessados com selo na janela: ' + al(2) + '% ou mais', maiorIgual(p3, al(2)), semDadoSelo),
        parteGatilho('Contratações: ' + al(5) + ' ou mais', protegido(contratadas.length, al(5)))])];
      var viva = gatilhoJson('praca_viva', al(0) !== null, [
        parteGatilho('Vagas no ar: ' + al(0) + ' ou mais', maiorIgual(noArLista.length, al(0))),
        parteGatilho('Pessoas com selo: ' + al(1) + ' ou mais', protegido(nSelo, al(1)), semDadoSelo),
        parteGatilho('Empresas ativas no mês: ' + al(6) + ' ou mais', maiorIgual(empMes, al(6))),
        parteGatilho('Empresas pagantes no mês: ' + al(8) + ' ou mais', null, { semDado: true }),
        parteGatilho('Primeira resposta da empresa: até ' + al(4) + ' dias', menorIgual(resp, al(4)))]);
      gat.push(viva,
        gatilhoJson('abrir_proxima', al(0) !== null, [
          parteGatilho('Decisão do dono de abrir outra praça', null, { manual: true }),
          parteGatilho('Praça viva em 2 meses seguidos', viva.atingido === false ? false : null, { manual: true }),
          parteGatilho('Lista de espera da próxima cidade: ' + al(13) + ' ou mais (veja o painel dela)', null, { manual: true }),
          parteGatilho('Parceiro local com contrato assinado', null, { manual: true })]),
        gatilhoJson('trocar_parceiro', true, [
          parteGatilho('Praça operada por parceiro: 90 dias de contrato sem concluir os passos 3 a 9 do manual', null, { manual: true }),
          parteGatilho('Falta grave (acesso indevido, cobrança de pessoa, uso da base)', null, { manual: true })]),
        gatilhoJson('pessoa_nao_paga', true, [parteGatilho('Quem procura emprego não paga nada: não existe produto pago para a pessoa', true, { fixa: true })]));
      return ok({ cidade: { slug: c.slug, nome: c.nome, uf: c.uf, status: c.status, porte: porte, fuso: fuso },
        praca: cids.map(function (sl) { var x = cidade(sl); return { slug: x.slug, nome: x.nome, status: x.status }; }),
        mes: hj.slice(0, 7), geradoEm: iso(t), indicadores: ind, gatilhos: gat });
    };

    // ---- Aviso de abertura da lista de espera (igual à 20261024120002): e-mail em lotes pela Function; fila do WhatsApp
    // (um contato por vez) só para a equipe; a linha some quando a pessoa foi avisada pelo que pediu ou 30 dias depois da abertura.
    var MSG_AVISO_FECHADA = 'A cidade ainda não está aberta. Abra a cidade antes de avisar a lista de espera.';
    var TEXTO_AVISO_WHATSAPP = 'Oi! Aqui é a equipe do Vagas sem Caos, da Gestão sem Caos. Você pediu para ser avisado(a) quando abríssemos em {{cidade}}: ' +
      'abrimos! As vagas da cidade já estão no site: {{link_cidade}}\n\nEsta é a única mensagem sobre a lista de espera: depois dela, o seu número sai da lista.\n\n' +
      'Nunca pague para se candidatar. Se alguém pedir em nosso nome, é golpe.';
    // Reforço (20261024120003): sai quem teve o envio confirmado e não espera o WhatsApp (na prévia o envio é na hora; não
    // há lote interrompido); teto de 60 e-mails em 24 h; a fila anda por tentativas (sempre 0 na prévia) e entrada.
    var TETO_AVISO = 60;
    function listaLimpar(slug) {
      st.listaEspera = st.listaEspera.filter(function (l) {
        var c = cidade(l.cidade);
        if (!c || c.status !== 'ativa' || (slug && l.cidade !== slug)) return true;
        if (c.abertaEm != null && c.abertaEm <= agora() - 30 * DIA) return false;
        return !(l.avisoEnviadoEm != null && (!l.whatsapp || l.whatsappAvisadoEm != null));
      });
    }
    function avisoContagens(slug) {
      var ls = st.listaEspera.filter(function (l) { return l.cidade === slug; });
      var conta = function (f) { return ls.filter(f).length; };
      return { naLista: ls.length, aAvisarEmail: conta(function (l) { return l.avisadoEm == null && (l.avisoTentativas || 0) < 3; }),
        avisadosEmail: conta(function (l) { return l.avisoEnviadoEm != null; }),
        emEnvio: conta(function (l) { return l.avisadoEm != null && l.avisoEnviadoEm == null && (l.avisoTentativas || 0) < 3; }),
        semEmail: conta(function (l) { return l.avisoEnviadoEm == null && (l.avisoTentativas || 0) >= 3; }),
        aAvisarWhatsapp: conta(function (l) { return l.whatsapp && l.whatsappAvisadoEm == null; }) };
    }
    function avisosUsados() { if (!st.avisosEnviados) st.avisosEnviados = []; return st.avisosEnviados.filter(function (t) { return t > agora() - DIA; }).length; }
    function avisoTeto(aAvisar) {
      var disp = Math.max(TETO_AVISO - avisosUsados(), 0);
      return { porDia: TETO_AVISO, usados24h: avisosUsados(), disponivel: disp,
        diasPrevistos: !aAvisar ? 0 : aAvisar <= disp ? 1 : (disp > 0 ? 1 : 0) + Math.ceil((aAvisar - disp) / TETO_AVISO) };
    }
    H.vagas_adm_aviso_resumo = function (a) {
      if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
      var c = cidade(txt(a.p_cidade).trim().toLowerCase());
      if (!c) return erro('Cidade não encontrada.');
      return ok({ cidade: { slug: c.slug, nome: c.nome, status: c.status, abertaEm: iso(c.abertaEm),
        listaAte: c.status === 'ativa' && c.abertaEm != null ? iso(c.abertaEm + 30 * DIA) : '' }, contagens: avisoContagens(c.slug),
        teto: avisoTeto(avisoContagens(c.slug).aAvisarEmail) });
    };
    H.vagas_adm_aviso_whatsapp = function (a) {
      if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
      var c = cidade(txt(a.p_cidade).trim().toLowerCase());
      if (!c) return erro('Cidade não encontrada.');
      if (c.status !== 'ativa') return erro(MSG_AVISO_FECHADA);
      listaLimpar(c.slug);
      var l = st.listaEspera.filter(function (x) { return x.cidade === c.slug && x.whatsapp && x.whatsappAvisadoEm == null; })
        .sort(function (p, q) { return p.criadoEm - q.criadoEm; })[0];
      var contato = null;
      if (l) {
        if (!l.id) l.id = novoId();
        var texto = TEXTO_AVISO_WHATSAPP.replace('{{cidade}}', c.nome).replace('{{link_cidade}}', 'https://vagas.gestaosemcaos.com.br/cidade.html?cidade=' + c.slug);
        contato = { id: l.id, whatsapp: l.whatsapp, perfil: l.perfil, texto: texto, link: 'https://wa.me/' + l.whatsapp + '?text=' + encodeURIComponent(texto) };
        registrar(c.slug, 'admin', 'aviso_whatsapp_ver', 'cidade', c.id, '');
      }
      return ok({ cidade: { slug: c.slug, nome: c.nome }, contato: contato, contagens: avisoContagens(c.slug) });
    };
    H.vagas_adm_aviso_whatsapp_feito = function (a) {
      if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
      var l = st.listaEspera.filter(function (x) { return x.id && x.id === a.p_id; })[0];
      if (!l || !l.whatsapp) return erro('Contato não encontrado.');
      var c = cidade(l.cidade);
      if (c.status !== 'ativa') return erro(MSG_AVISO_FECHADA);
      var dup = l.whatsappAvisadoEm != null;
      if (!dup) {
        l.whatsappAvisadoEm = agora();
        registrar(c.slug, 'admin', 'aviso_whatsapp', 'cidade', c.id, '');
        if (l.avisadoEm != null) st.listaEspera = st.listaEspera.filter(function (x) { return x !== l; });
      }
      return ok({ duplicado: dup, contagens: avisoContagens(c.slug) });
    };

    // ---- Equipe da empresa (convite pela própria empresa; igual às RPCs vagas_equipe_* da 20261024).
    var SO_DONO_EQUIPE = 'Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.';
    var VALIDADE_CONVITE = 72 * 3600000;
    function convitesEquipe() { if (!st.convitesEquipe) st.convitesEquipe = []; return st.convitesEquipe; }
    function conviteEquipeJson(cv) {
      return { id: cv.id, email: cv.email, papel: cv.papel,
        status: cv.status === 'aberto' ? (cv.expiraEm <= agora() ? 'vencido' : 'pendente') : cv.status,
        criadoEm: iso(cv.criadoEm), expiraEm: iso(cv.expiraEm) };
    }
    // Convite que ESTA conta pode usar: aberto, no prazo, do mesmo e-mail, de quem ainda é dono(a) ativo(a); senão null.
    function conviteEquipeValido(token, uid) {
      var tk = txt(token).trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(tk) || !uid) return null;
      var cv = convitesEquipe().filter(function (x) { return x.token === tk; })[0];
      if (!cv || cv.status !== 'aberto' || cv.expiraEm <= agora()) return null;
      var u = usuario(uid);
      if (!u || u.email !== cv.email) return null;
      if (!st.membros.some(function (m) { return m.empresaId === cv.empresaId && m.userId === cv.criadoPor && m.ativo && m.papel === 'dono'; })) return null;
      return cv;
    }
    function membroAtivo(empId, uid) { return st.membros.filter(function (m) { return m.empresaId === empId && m.userId === uid && m.ativo; })[0] || null; }

    H.vagas_equipe_empresa = function (a) {
      var c = contaAtual('empresa'); if (!c.ok) return c;
      var e = empresa(a.p_empresa);
      if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
      if (!membro(e.id, true)) return erro(SO_DONO_EQUIPE);
      var ativos = st.membros.filter(function (m) { return m.empresaId === e.id && m.ativo; });
      var donos = ativos.filter(function (m) { return m.papel === 'dono'; }).length;
      return ok({ empresa: { id: e.id, nomeFantasia: e.nomeFantasia, status: e.status },
        membros: ativos.slice().sort(function (p, q) { return (q.papel === 'dono') - (p.papel === 'dono') || p.criadoEm - q.criadoEm; }).map(function (m) {
          var u = usuario(m.userId) || {};
          return { userId: m.userId, email: u.email || '', nome: R.limparTexto((u.meta && u.meta.nome) || '', 120), papel: m.papel, desde: iso(m.criadoEm),
            eu: m.userId === st.sessao, podeRemover: !(m.papel === 'dono' && donos <= 1) };
        }),
        convites: convitesEquipe().filter(function (cv) {
          return cv.empresaId === e.id && (cv.status === 'aberto' || (cv.usadoEm || cv.encerradoEm || cv.criadoEm) > agora() - 30 * DIA);
        }).sort(function (p, q) { return q.criadoEm - p.criadoEm; }).slice(0, 50).map(conviteEquipeJson),
        limites: { convitesPorDia: 10, convitesHoje: (st.limites['equipe_convite_empresa|' + e.id] || []).filter(function (x) { return x > agora() - DIA; }).length,
          membrosMax: 20, convitesAbertosMax: 20, validadeHoras: 72, podeConvidar: e.status === 'ativa' && !!e.cnpjConferidoEm } });
    };

    H.vagas_equipe_convite_cancelar = function (a) {
      var c = contaAtual('empresa'); if (!c.ok) return c;
      var cv = convitesEquipe().filter(function (x) { return x.id === a.p_convite; })[0];
      if (!cv || !membro(cv.empresaId, true)) return erro('Convite não encontrado.');
      if (cv.status === 'cancelado') return ok({ convite: conviteEquipeJson(cv), duplicado: true });
      if (cv.status === 'aceito') return erro('Este convite já foi aceito. Para tirar o acesso, remova a pessoa da equipe.');
      cv.status = 'cancelado'; cv.encerradoEm = agora();
      registrar(empresa(cv.empresaId).cidade, 'empresa', 'equipe_convite_cancelar', 'empresa', cv.empresaId, '');
      return ok({ convite: conviteEquipeJson(cv) });
    };

    H.vagas_equipe_remover = function (a) {
      var c = contaAtual('empresa'); if (!c.ok) return c;
      var e = empresa(a.p_empresa);
      if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
      var uid = st.sessao;
      if (a.p_membro !== uid && !membro(e.id, true)) return erro(SO_DONO_EQUIPE);
      var m = membroAtivo(e.id, a.p_membro);
      if (!m) return erro('Esta pessoa não está na equipe.');
      if (m.papel === 'dono' && st.membros.filter(function (x) { return x.empresaId === e.id && x.ativo && x.papel === 'dono'; }).length <= 1) {
        return erro('A empresa precisa ter pelo menos uma pessoa como dona. Esta pessoa não pode sair da equipe.');
      }
      m.ativo = false;
      convitesEquipe().forEach(function (cv) { if (cv.empresaId === e.id && cv.criadoPor === m.userId && cv.status === 'aberto') { cv.status = 'cancelado'; cv.encerradoEm = agora(); } });
      registrar(e.cidade, 'empresa', a.p_membro === uid ? 'equipe_sair' : 'equipe_remover', 'empresa', e.id, '', { papel: m.papel });
      return ok({ removido: true, saiu: a.p_membro === uid });
    };

    H.vagas_equipe_tornar_dono = function (a) {
      var c = contaAtual('empresa'); if (!c.ok) return c;
      var e = empresa(a.p_empresa);
      if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
      if (!membro(e.id, true)) return erro(SO_DONO_EQUIPE);
      if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', { suspensa: true });
      var m = membroAtivo(e.id, a.p_membro);
      if (!m) return erro('Esta pessoa não está na equipe.');
      if (m.papel === 'dono') return ok({ membro: { userId: m.userId, papel: 'dono' }, duplicado: true });
      m.papel = 'dono';
      registrar(e.cidade, 'empresa', 'equipe_tornar_dono', 'empresa', e.id, '', { papel: 'dono' });
      return ok({ membro: { userId: m.userId, papel: 'dono' }, duplicado: false });
    };

    H.vagas_op_empresa_dono = function (a) {
      if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
      var e = empresa(a.p_empresa);
      if (!e) return erro('Empresa não encontrada.');
      var papel = papelCidade(e.cidade);
      if (!papel || papel === 'moderador') return erro(R.MSG.SEM_PERMISSAO);
      if (papel === 'operador' && st.membros.some(function (d) { return d.empresaId === e.id && d.ativo && d.papel === 'dono' && contaValida(d.userId); })) {
        return erro('A empresa já tem uma pessoa dona. Para trocar, fale com a equipe da Gestão sem Caos.');
      }
      var motivo = R.limparTexto(txt(a.p_motivo), 300);
      if (!motivo) return erro('Informe o motivo.');
      var em = R.normalizarEmail(a.p_email);
      if (!em) return erro('E-mail inválido.');
      var m = st.membros.filter(function (x) { var u = usuario(x.userId); return x.empresaId === e.id && x.ativo && u && u.email === em; })[0];
      if (!m) return erro('Esta pessoa não está na equipe da empresa.');
      if (!contaValida(m.userId)) return erro('Esta pessoa não pode ser dona agora: a conta dela está suspensa ou ainda não confirmou o e-mail.');
      m.papel = 'dono';
      registrar(e.cidade, papel, 'empresa_dono', 'empresa', e.id, motivo, { papel: 'dono' });
      return ok({ empresa: { id: e.id }, membro: { papel: 'dono' } });
    };

    H.vagas_equipe_convite = function (a) {
      var c = contaAtual('empresa'); if (!c.ok) return c;
      var cv = conviteEquipeValido(a.p_token, st.sessao);
      if (!cv) return erro(R.MSG.CONVITE_INVALIDO);
      var e = empresa(cv.empresaId);
      var ce = cidade(e.cidade);
      return ok({ convite: { empresa: { id: e.id, nomeFantasia: e.nomeFantasia, cidade: { slug: ce.slug, nome: ce.nome } }, papel: cv.papel,
        expiraEm: iso(cv.expiraEm), jaMembro: !!membroAtivo(e.id, st.sessao) } });
    };

    H.vagas_equipe_convite_aceitar = function (a) {
      var c = contaAtual('empresa'); if (!c.ok) return c;
      var cv = conviteEquipeValido(a.p_token, st.sessao);
      if (!cv) return erro(R.MSG.CONVITE_INVALIDO);
      var e = empresa(cv.empresaId);
      if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', { suspensa: true });
      var dup = !!membroAtivo(e.id, st.sessao);
      if (!dup) {
        if (st.membros.filter(function (m) { return m.empresaId === e.id && m.ativo; }).length >= 20) return erro('A equipe desta empresa está completa. Fale com quem convidou.');
        var m = st.membros.filter(function (x) { return x.empresaId === e.id && x.userId === st.sessao; })[0];
        if (m) { m.ativo = true; m.papel = 'recrutador'; } else st.membros.push({ empresaId: e.id, userId: st.sessao, papel: 'recrutador', ativo: true, criadoEm: agora() });
      }
      cv.status = 'aceito'; cv.usadoPor = st.sessao; cv.usadoEm = agora();
      registrar(e.cidade, 'empresa', 'equipe_aceitar', 'empresa', e.id, '', { papel: cv.papel });
      return ok({ empresa: { id: e.id, nomeFantasia: e.nomeFantasia, papel: membroAtivo(e.id, st.sessao).papel, status: e.status }, duplicado: dup });
    };

    // ------------------------------------------------------------------------------------------------- conta (Edge Function + Auth)
    var MSG_ENVIADO = 'Se este e-mail puder ser usado, você vai receber um link em instantes. Confira também a caixa de spam.';
    var MSG_CONVITE_EQUIPE = 'Pronto. Se este e-mail puder entrar na equipe, a pessoa recebe o convite em instantes. O convite vale por 3 dias.';
    function mascarar(e) { var m = /^([^@]+)@([^.]+)(\..+)?$/.exec(String(e || '')); return m ? m[1].charAt(0) + '***@' + m[2].charAt(0) + '***' + (m[3] || '') : ''; }
    function novoLink(email, tipo) {
      var t = 'previa' + novoToken().slice(0, 24);
      st.links[t] = { email: email, tipo: tipo, em: agora() };
      return { tokenHash: t, tipo: tipo, caminho: 'entrar.html?token_hash=' + t + '&type=' + tipo };
    }
    // Foto de mentira da prévia (silhueta neutra em SVG) quando a tela não manda a imagem.
    var FOTO_PREVIA = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#eaeef4"/>' +
      '<circle cx="32" cy="24" r="12" fill="#8a97ab"/><rect x="14" y="40" width="36" height="20" rx="10" fill="#8a97ab"/></svg>');
    function neutro(email, link) { return ok({ enviado: true, mensagem: MSG_ENVIADO, email: mascarar(email), linkPrevia: link ? link.caminho : '' }); }
    function criarUsuario(email, tipo, extra) {
      var u = Object.assign({ id: novoId(), email: email, senha: null, confirmada: false, admin: false, app: { produto: 'vagas', tipo: tipo } }, extra || {});
      st.usuarios.push(u);
      return u;
    }

    var conta = {
      cadastrar: function (d) {
        d = obj(d);
        var email = R.normalizarEmail(d.email);
        if (!email) return erro('E-mail inválido.');
        if (d.tipo !== 'pessoa' && d.tipo !== 'empresa') return erro('Escolha se a conta é para procurar emprego ou para uma empresa.');
        var versao = txt(d.termosVersao || R.VERSAO_TERMOS).trim();
        if (!/^[A-Za-z0-9._-]{1,40}$/.test(versao)) return erro('Para criar a conta, aceite os termos de uso e o aviso de privacidade.');
        var u = usuarioPorEmail(email);
        if (!u) {
          // O consentimento (data + linhas) só é gravado quando a pessoa confirma pelo link (contaAtual), como no banco.
          u = criarUsuario(email, d.tipo, { meta: { nome: R.limparTexto(d.nome, 120) } });
          st.contas[u.id] = { tipo: d.tipo, status: 'pendente', termosVersao: versao, termosAceitosEm: null, criadoEm: agora() };
          return neutro(email, novoLink(email, 'invite'));
        }
        if (st.contas[u.id] && !u.confirmada) {
          // Conta pendente "solta" (sem cadastro assistido, sem empresa, sem operação): quem tem o e-mail decide o tipo
          // (um terceiro pode ter "pré-registrado" com outro). Com vínculo, o tipo fica e o link vai de novo (mesma resposta).
          var solta = !st.contas[u.id].assistidaPor && !st.membros.some(function (m) { return m.userId === u.id; })
            && !st.operadores.some(function (o) { return o.userId === u.id; });
          if (st.contas[u.id].tipo !== d.tipo && solta) { st.contas[u.id].tipo = d.tipo; u.app = { produto: 'vagas', tipo: d.tipo }; }
          if (solta) { st.contas[u.id].termosVersao = versao; st.contas[u.id].termosAceitosEm = null; }
          return neutro(email, novoLink(email, 'invite'));
        }
        return neutro(email, null);
      },
      reenviarConfirmacao: function (email) {
        var e = R.normalizarEmail(email);
        if (!e) return erro('E-mail inválido.');
        var u = usuarioPorEmail(e);
        return neutro(e, u && st.contas[u.id] && !u.confirmada ? novoLink(e, 'invite') : null);
      },
      esqueciSenha: function (email) {
        var e = R.normalizarEmail(email);
        if (!e) return erro('E-mail inválido.');
        var u = usuarioPorEmail(e);
        return neutro(e, u && st.contas[u.id] && !u.admin ? novoLink(e, 'recovery') : null);
      },
      cadastroAssistido: function (d) {
        d = obj(d);
        if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        var cid = txt(d.cidade).trim().toLowerCase();
        if (!(eAdmin() || papelCidade(cid) === 'operador')) return erro(R.MSG.SEM_PERMISSAO);
        var email = R.normalizarEmail(d.email);
        if (!email) return erro('E-mail inválido.');
        if (d.tipo !== 'pessoa' && d.tipo !== 'empresa') return erro('Escolha se a conta é para procurar emprego ou para uma empresa.');
        if (usuarioPorEmail(email)) return erro('Este e-mail já tem conta. A pessoa pode entrar ou usar "Esqueci minha senha".', { existe: true });
        // Mesma regra de vagas_op_vincular_membro: o assistido só entra em empresa SEM membro ativo.
        if (d.empresaId && d.tipo === 'empresa' && st.membros.some(function (m) { return m.empresaId === d.empresaId && m.ativo; })) {
          return erro('Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.');
        }
        var u = criarUsuario(email, d.tipo, { meta: { nome: R.limparTexto(d.nome, 120) } });
        st.contas[u.id] = { tipo: d.tipo, status: 'pendente', termosVersao: '', assistidaPor: st.sessao, cidade: cid, codigoEvento: txt(d.codigoEvento).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40), criadoEm: agora() };
        if (d.empresaId && empresa(d.empresaId) && d.tipo === 'empresa') {
          st.membros.push({ empresaId: d.empresaId, userId: u.id, papel: st.membros.some(function (m) { return m.empresaId === d.empresaId && m.papel === 'dono' && m.ativo; }) ? 'recrutador' : 'dono', ativo: true, criadoEm: agora() });
        }
        registrar(cid, eAdmin() ? 'admin' : 'operador', 'cadastro_assistido', 'conta', u.id, '');
        var l = novoLink(email, 'invite');
        return ok({ enviado: true, email: mascarar(email), linkPrevia: l.caminho });
      },
      convidarOperador: function (d) {
        d = obj(d);
        if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
        var email = R.normalizarEmail(d.email);
        if (!email) return erro('E-mail inválido.');
        var cid = txt(d.cidade).trim().toLowerCase();
        var papel = d.papel === 'moderador' ? 'moderador' : 'operador';
        var u = usuarioPorEmail(email);
        if (u) {
          if (!st.contas[u.id] || st.contas[u.id].tipo !== 'operador') return erro('Este e-mail já tem outra conta. Use um e-mail só para a operação.');
          var o = st.operadores.filter(function (x) { return x.userId === u.id && x.cidade === cid; })[0];
          if (o) { o.papel = papel; o.ativo = true; } else st.operadores.push({ userId: u.id, cidade: cid, papel: papel, ativo: true, repassePercentual: 0, contratoVersao: '' });
          return ok({ existente: true, email: mascarar(email) });
        }
        u = criarUsuario(email, 'operador');
        st.contas[u.id] = { tipo: 'operador', status: 'pendente', termosVersao: '', assistidaPor: st.sessao, criadoEm: agora() };
        st.operadores.push({ userId: u.id, cidade: cid, papel: papel, ativo: true, repassePercentual: 0, contratoVersao: '' });
        var l = novoLink(email, 'invite');
        return ok({ enviado: true, email: mascarar(email), linkPrevia: l.caminho });
      },
      // Aviso de abertura por e-mail (Edge Function avisar_lista_espera): só a equipe; um lote por chamada; na prévia nenhum
      // e-mail sai — quem foi "avisado" é marcado como no banco. Resposta: só contagens.
      avisarListaEspera: function (cidadeSlug, limite) {
        if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        if (!eAdmin()) return erro(R.MSG.SEM_PERMISSAO);
        var c = cidade(txt(cidadeSlug).trim().toLowerCase());
        if (!c) return erro('Cidade não encontrada.');
        if (c.status !== 'ativa') return erro(MSG_AVISO_FECHADA);
        var pedido = parseInt(limite, 10);
        var n = Math.min(Math.max(isFinite(pedido) ? pedido : 25, 1), 50, avisoTeto(0).disponivel);
        listaLimpar(c.slug);
        var lote = st.listaEspera.filter(function (l) { return l.cidade === c.slug && l.avisadoEm == null && (l.avisoTentativas || 0) < 3; })
          .sort(function (p, q) { return (p.avisoTentativas || 0) - (q.avisoTentativas || 0) || p.criadoEm - q.criadoEm; }).slice(0, n);
        lote.forEach(function (l) {
          l.avisadoEm = agora(); l.avisoEnviadoEm = agora(); l.sairToken = novoToken(); if (!l.id) l.id = novoId(); st.avisosEnviados.push(agora());
        });
        st.listaEspera = st.listaEspera.filter(function (l) { return lote.indexOf(l) < 0 || l.whatsapp; });
        if (lote.length) registrar(c.slug, 'admin', 'aviso_email', 'cidade', c.id, '', { enviados: lote.length, falhas: 0, invalidos: 0 });
        var ct = avisoContagens(c.slug);
        return ok({ cidade: { slug: c.slug, nome: c.nome }, enviados: lote.length, falhas: 0, invalidos: 0, restantes: ct.aAvisarEmail,
          aAvisarWhatsapp: ct.aAvisarWhatsapp, terminou: ct.aAvisarEmail === 0, travado: false,
          tetoAtingido: ct.aAvisarEmail > 0 && avisoTeto(0).disponivel === 0 });
      },
      // Convite para a equipe (Edge Function convite_equipe + vagas_conta_convite_equipe): só dono(a); resposta neutra.
      convidarEquipe: function (empresaId, email) {
        if (!st.sessao) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        var em = R.normalizarEmail(email);
        if (!em) return erro('E-mail inválido.');
        if (!reUuid(empresaId)) return erro('Empresa não encontrada.');
        var c = contaAtual('empresa'); if (!c.ok) return c;
        var e = empresa(empresaId);
        if (!e || !membro(e.id)) return erro('Empresa não encontrada.');
        if (!membro(e.id, true)) return erro('Só quem é dono(a) da conta da empresa pode convidar pessoas para a equipe.');
        if (e.status === 'suspensa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', { suspensa: true });
        if (e.status !== 'ativa' || !e.cnpjConferidoEm) return erro('Só empresa verificada pela Gestão sem Caos pode convidar pessoas para a equipe.');
        if (st.membros.some(function (m) { var u = usuario(m.userId); return m.empresaId === e.id && m.ativo && u && u.email === em; })) {
          return erro('Esta pessoa já faz parte da equipe.');
        }
        if (contar('equipe_convite_empresa', e.id, DIA) > 10 || contar('equipe_convite_email', e.id + ':' + em, DIA) > 3) {
          return erro('Muitos convites hoje. Tente de novo amanhã.', { bloqueado: true });
        }
        if (st.membros.filter(function (m) { return m.empresaId === e.id && m.ativo; }).length >= 20) {
          return erro('A equipe já tem 20 pessoas. Remova alguém antes de convidar outra.');
        }
        if (convitesEquipe().filter(function (x) { return x.empresaId === e.id && x.status === 'aberto' && x.expiraEm > agora() && x.email !== em; }).length >= 20) {
          return erro('Sua empresa já tem 20 convites abertos. Cancele algum antes de convidar outra pessoa.');
        }
        convitesEquipe().forEach(function (x) { if (x.empresaId === e.id && x.email === em && x.status === 'aberto') { x.status = 'cancelado'; x.encerradoEm = agora(); } });
        var cv = { id: novoId(), empresaId: e.id, email: em, papel: 'recrutador', token: novoToken(), status: 'aberto', criadoPor: st.sessao, criadoEm: agora(),
          expiraEm: agora() + VALIDADE_CONVITE, usadoPor: null, usadoEm: null, encerradoEm: null };
        convitesEquipe().push(cv);
        registrar(e.cidade, 'empresa', 'equipe_convidar', 'empresa', e.id, '', { papel: cv.papel });
        // Destino (como o banco decide); na prévia o "e-mail" vira linkPrevia.
        var u = usuarioPorEmail(em);
        var conta2 = u ? st.contas[u.id] : null;
        var link = '';
        if (!u) {
          u = criarUsuario(em, 'empresa', { app: { produto: 'vagas', tipo: 'empresa', convite: true } });
          st.contas[u.id] = { tipo: 'empresa', status: 'pendente', termosVersao: '', criadoEm: agora() };
          link = novoLink(em, 'invite').caminho + '&convite=' + cv.token;
        } else if (conta2 && conta2.tipo === 'empresa' && conta2.status !== 'suspensa') {
          link = u.confirmada ? 'entrar.html?convite=' + cv.token : novoLink(em, 'invite').caminho + '&convite=' + cv.token;
        }
        return ok({ enviado: true, mensagem: MSG_CONVITE_EQUIPE, email: mascarar(em), convite: conviteEquipeJson(cv), linkPrevia: link });
      },
      excluirConta: function () {
        var uid = st.sessao;
        if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        if (eAdmin()) return erro('Esta conta também acessa o painel DISC. Fale com a Gestão sem Caos para excluir.');
        if (!st.contas[uid]) return erro('Conta não encontrada.');
        var donaUnica = st.membros.some(function (m) {
          return m.userId === uid && m.ativo && m.papel === 'dono' &&
            !st.membros.some(function (d) { return d.empresaId === m.empresaId && d.ativo && d.papel === 'dono' && d.userId !== uid; }) &&
            st.membros.some(function (o) { return o.empresaId === m.empresaId && o.ativo && o.userId !== uid; });
        });
        if (donaUnica) {
          return erro('Você é a única pessoa dona de uma empresa que tem equipe. Antes de excluir a conta, torne outra pessoa da equipe dona (aba Equipe da empresa) ou remova a equipe.');
        }
        var cands = st.candidaturas.filter(function (k) { return k.pessoaId === uid; }).map(function (k) { return k.id; });
        var convs = st.conversas.filter(function (v) { return cands.indexOf(v.candidaturaId) >= 0; }).map(function (v) { return v.id; });
        st.mensagens = st.mensagens.filter(function (m) { return convs.indexOf(m.conversaId) < 0; });
        st.conversas = st.conversas.filter(function (v) { return convs.indexOf(v.id) < 0; });
        st.candidaturas = st.candidaturas.filter(function (k) { return k.pessoaId !== uid; });
        st.acessos = st.acessos.filter(function (x) { return x.pessoaId !== uid; });
        st.referencias = st.referencias.filter(function (r) { return r.pessoaId !== uid; });
        st.convitesReferencia = st.convitesReferencia.filter(function (x) { return x.pessoaId !== uid; });
        st.experiencias = st.experiencias.filter(function (x) { return x.userId !== uid; });
        st.pulos = st.pulos.filter(function (p) { return p.pessoaId !== uid; });
        st.membros = st.membros.filter(function (m) { return m.userId !== uid; });
        st.operadores = st.operadores.filter(function (o) { return o.userId !== uid; });
        st.consentimentos = st.consentimentos.filter(function (x) { return x.userId !== uid; });
        if (st.fotos) delete st.fotos[uid];
        delete st.pessoas[uid]; delete st.contatos[uid]; delete st.contas[uid];
        st.usuarios = st.usuarios.filter(function (u) { return u.id !== uid; });
        st.sessao = null;
        return ok({ excluida: true });
      },
      // Foto opcional (na prévia, guardada como data URL neste navegador; no real, bucket privado do Storage).
      enviarFoto: function (arq) {
        arq = obj(arq);
        var uid = st.sessao;
        if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        if (!st.contas[uid] || st.contas[uid].tipo !== 'pessoa') return erro(R.MSG.SO_PESSOA);
        if (['image/jpeg', 'image/png', 'image/webp'].indexOf(txt(arq.tipo)) < 0 || !(Number(arq.tamanho) > 0) || Number(arq.tamanho) > 1048576) {
          return erro('A foto precisa ser JPG, PNG ou WEBP, com até 1 MB.');
        }
        st.fotos = st.fotos || {};
        st.fotos[uid] = /^data:image\//.test(txt(arq.dataUrl)) && txt(arq.dataUrl).length <= 1500000 ? txt(arq.dataUrl) : FOTO_PREVIA;
        return ok({ temFoto: true });
      },
      apagarFoto: function () {
        var uid = st.sessao;
        if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        if (st.fotos) delete st.fotos[uid];
        return ok({ temFoto: false });
      },
      fotoUrl: function (candId) {
        var uid = st.sessao;
        if (!uid) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        var dono = uid;
        if (candId) {
          var k = candidatura(txt(candId));
          if (!k || !st.membros.some(function (m) { return m.empresaId === k.empresaId && m.userId === uid && m.ativo; })) return erro('Candidatura não encontrada.');
          if (k.status !== 'combinou' && k.status !== 'contratada') return erro('A foto só aparece depois do Combinou.', { semCombinou: true });
          if (k.contatoCortadoEm != null) return erro('A pessoa deixou de compartilhar o contato com a sua empresa.', { contatoCortado: true });
          if (empresa(k.empresaId).status !== 'ativa') return erro('Esta empresa está suspensa. Fale com a Gestão sem Caos.', { suspensa: true });
          if (!temFoto(k.pessoaId)) return erro('Esta pessoa não pôs foto.', { semFoto: true });
          dono = k.pessoaId;
        } else if (!temFoto(uid)) return erro('Sem foto.', { semFoto: true });
        return ok({ url: st.fotos[dono], expiraEm: iso(agora() + 300000) });
      },
      entrar: function (email, senha) {
        var u = usuarioPorEmail(R.normalizarEmail(email));
        var s = String(senha || '');
        var confere = !!u && (u.senha === SENHA_NAO_GUARDADA ? s.length >= 8 && s.length <= 72 : !!u.senha && u.senha === s);
        if (!confere) return erro('E-mail ou senha não conferem.');
        if (!u.confirmada) return erro(R.MSG.CONFIRMAR, { confirmar: true });
        st.sessao = u.id;
        return H.vagas_eu({});
      },
      sair: function () { st.sessao = null; return ok(); },
      sessao: function () {
        var u = usuario(st.sessao);
        if (!u) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        return ok({ usuario: { id: u.id, email: u.email } });
      },
      confirmarLink: function (l) {
        l = obj(l);
        var reg = st.links[l.tokenHash];
        if (!reg || reg.tipo !== l.tipo || reg.em < agora() - DIA) return erro('O link expirou ou já foi usado. Peça outro na tela de entrada.', { linkExpirado: true });
        delete st.links[l.tokenHash];
        var u = usuarioPorEmail(reg.email);
        if (!u) return erro('O link expirou ou já foi usado. Peça outro na tela de entrada.', { linkExpirado: true });
        u.confirmada = true;
        st.sessao = u.id;
        return ok({ tipo: l.tipo, precisaSenha: true });
      },
      definirSenha: function (senha) {
        var s = String(senha || '');
        if (s.length < 8 || s.length > 72) return erro('A senha precisa ter de 8 a 72 caracteres.');
        var u = usuario(st.sessao);
        if (!u) return erro(R.MSG.SESSAO, { sessaoExpirada: true });
        u.senha = SENHA_NAO_GUARDADA;   // a senha digitada nunca fica no navegador
        return ok();
      }
    };

    // ------------------------------------------------------------------------------------------------- semente
    function estadoVazio() {
      return { versao: 2, seq: 0, sessao: null, cidades: [], zonas: [], usuarios: [], contas: {}, consentimentos: [], pessoas: {}, contatos: {}, experiencias: [],
        empresas: [], membros: [], anuncios: [], pulos: [], candidaturas: [], conversas: [], mensagens: [], denuncias: [], moderacao: [], operadores: [],
        listaEspera: [], acessos: [], referencias: [], convitesReferencia: [], referenciaHistorico: [], selos: {}, fotos: {}, limites: {}, links: {} };
    }

    function semear() {
      var t0 = agora();
      function cidadeNova(slug, nome, ibge, status, ordem, praca, porte) {
        st.cidades.push({ id: novoId(), slug: slug, nome: nome, uf: 'GO', ibge: ibge, fuso: 'America/Sao_Paulo', status: status, porte: porte || null,
          praca: praca || null, metaListaEspera: null, ordem: ordem, abertaEm: status === 'ativa' ? t0 - 2 * DIA : null });
      }
      // Praça piloto (dado real: IBGE e fuso) + duas vizinhas SÓ da prévia (entorno e lista de espera, para a tela mostrar os dois casos).
      cidadeNova('uruacu-go', 'Uruaçu', '5221601', 'ativa', 1, null, 'pequena');
      cidadeNova('campinorte-go', 'Campinorte', '5204706', 'ativa', 2, 'uruacu-go', null);
      cidadeNova('niquelandia-go', 'Niquelândia', '5214606', 'lista_espera', 3, null, null);
      // Zonas de Uruaçu: a lista da operação (mesa da equipe), inclusive as vazias.
      [['uruacu-go', 'centro', 'Centro', ['Centro', 'Setor Central', 'Vila Santana', 'Loteamento Santana'], 1],
        ['uruacu-go', 'regiao-norte', 'Região Norte', ['Francisco Martins'], 2],
        ['uruacu-go', 'regiao-sul', 'Região Sul', ['Setor Sul', 'Setor Sul I'], 3],
        ['uruacu-go', 'regiao-leste', 'Região Leste', [], 4],
        ['uruacu-go', 'regiao-oeste', 'Região Oeste', [], 5],
        ['uruacu-go', 'zona-rural', 'Zona rural e lago', ['Zona rural', 'Geriaçu', 'Beira do Lago de Serra da Mesa'], 6],
        ['campinorte-go', 'cidade-toda', 'Campinorte (cidade toda)', [], 1],
        ['niquelandia-go', 'cidade-toda', 'Niquelândia (cidade toda)', [], 1]].forEach(function (z) {
        st.zonas.push({ id: novoId(), cidade: z[0], slug: z[1], nome: z[2], bairros: z[3], ordem: z[4], ativa: true });
      });
      st.listaEspera.push({ cidade: 'niquelandia-go', email: 'interessada@previa.com', perfil: 'pessoa', whatsapp: '5523988887777', whatsappEm: t0 - 3 * DIA,
        criadoEm: t0 - 3 * DIA });

      function usuarioSemente(email, tipo, extra) {
        var u = criarUsuario(email, tipo, Object.assign({ senha: SENHA_PREVIA, confirmada: true }, extra || {}));
        if (tipo) st.contas[u.id] = { tipo: tipo, status: 'ativa', termosVersao: R.VERSAO_TERMOS, termosAceitosEm: t0 - 20 * DIA, criadoEm: t0 - 20 * DIA, confirmadaEm: t0 - 20 * DIA };
        return u;
      }
      var admin = usuarioSemente('admin@previa.com', null, { admin: true, app: {} });
      void admin;
      var op = usuarioSemente('operador@previa.com', 'operador');
      st.operadores.push({ userId: op.id, cidade: 'uruacu-go', papel: 'operador', ativo: true, repassePercentual: 0, contratoVersao: '' });

      // 15 empresas (fictícias, nomes neutros). A primeira é a da empresa@previa.com. A 14ª fica na vizinha (entorno).
      var EMP = [
        ['Mercadinho Sol do Norte', 'Supermercado', 'centro', '552333571001'], ['Padaria Trigo Dourado', 'Padaria', 'regiao-oeste', '552333571002'],
        ['Farmácia Bem Viver', 'Farmácia', 'regiao-sul', '552333571003'], ['Loja Casa & Cor', 'Material de construção', 'regiao-norte', '552333571004'],
        ['Auto Peças Rodovia', 'Autopeças', 'regiao-oeste', '552333571005'], ['Restaurante Sabor da Terra', 'Restaurante', 'centro', '552333571006'],
        ['Clínica Cuidar Bem', 'Saúde', 'centro', '552333571007'], ['Construtora Alicerce Forte', 'Construção civil', 'regiao-sul', '552333571008'],
        ['Pousada Lago Azul', 'Hotelaria', 'zona-rural', '552333571009'], ['Ótica Visão Clara', 'Varejo', 'centro', '552333571010'],
        ['Distribuidora Norte Frio', 'Distribuição', 'regiao-norte', '552333571011'], ['Escola de Idiomas Ponte', 'Educação', 'regiao-norte', '552333571012'],
        ['Pet Shop Amigo Fiel', 'Pet shop', 'regiao-oeste', '552333571013'], ['Eventos Festa Boa', 'Eventos', 'regiao-sul', '552333571014'],
        ['Lava-Jato Brilho Total', 'Serviços automotivos', 'regiao-oeste', '552333571015']];
      var empresas = EMP.map(function (x, i) {
        var base = 'PV' + ('0000000000' + (i + 1)).slice(-10);
        var cnpj = base;
        for (var d1 = 0; d1 <= 99; d1++) { var tenta = base + ('0' + d1).slice(-2); if (R.cnpjValido(tenta)) { cnpj = tenta; break; } }
        var e = { id: novoId(), cidade: i === 13 ? 'campinorte-go' : 'uruacu-go', zona: i === 13 ? 'cidade-toda' : x[2], cnpj: cnpj, mei: i === 14,
          razaoSocial: x[0] + ' Ltda (prévia)', nomeFantasia: x[0], setor: x[1], descricao: 'Empresa fictícia da prévia do Vagas sem Caos.',
          whatsapp: x[3], email: 'contato' + (i + 1) + '@previa.com', status: i === 12 ? 'em_analise' : 'ativa', statusMotivo: '',
          cnpjConferidoEm: i === 12 ? null : t0 - 15 * DIA, criadaPor: null, criadoEm: t0 - 16 * DIA };
        st.empresas.push(e);
        var dono = usuarioSemente(i === 0 ? 'empresa@previa.com' : 'empresa' + (i + 1) + '@previa.com', 'empresa');
        st.membros.push({ empresaId: e.id, userId: dono.id, papel: 'dono', ativo: true, criadoEm: t0 - 16 * DIA });
        return e;
      });
      // Equipe do Mercadinho: uma recrutadora (não convida nem remove) e um convite aberto (sem conta ainda).
      var recrutadora = usuarioSemente('recrutador@previa.com', 'empresa', { meta: { nome: 'Rita Moraes' } });
      st.membros.push({ empresaId: empresas[0].id, userId: recrutadora.id, papel: 'recrutador', ativo: true, criadoEm: t0 - 5 * DIA });
      st.convitesEquipe = [{ id: novoId(), empresaId: empresas[0].id, email: 'convidada@previa.com', papel: 'recrutador', token: novoToken(), status: 'aberto',
        criadoPor: st.membros.filter(function (m) { return m.empresaId === empresas[0].id && m.papel === 'dono'; })[0].userId, criadoEm: t0 - DIA,
        expiraEm: t0 - DIA + VALIDADE_CONVITE, usadoPor: null, usadoEm: null, encerradoEm: null }];

      // 40 pessoas (a primeira é a pessoa@previa.com).
      var NOMES = ['Ana Clara Ribeiro', 'Bruno Souza Lima', 'Carla Alves Pereira', 'Diego Costa Gomes', 'Elaine Martins Araújo', 'Fábio Barbosa Rocha',
        'Gabriela Dias Cardoso', 'Henrique Teixeira Moraes', 'Isabela Freitas Nunes', 'João Pedro Mendes', 'Karen Pinto Vieira', 'Lucas Ribeiro Souza',
        'Mariana Lima Alves', 'Nathan Pereira Costa', 'Olívia Gomes Martins', 'Paulo Araújo Barbosa', 'Quésia Rocha Dias', 'Rafael Cardoso Teixeira',
        'Sabrina Moraes Freitas', 'Thiago Nunes Mendes', 'Úrsula Pinto Ribeiro', 'Vinícius Vieira Souza', 'Wesley Lima Alves', 'Yasmin Pereira Gomes',
        'Zélia Costa Martins', 'Alice Araújo Barbosa', 'Breno Rocha Dias', 'Cíntia Cardoso Freitas', 'Davi Teixeira Nunes', 'Eduarda Moraes Pinto',
        'Felipe Mendes Vieira', 'Giovana Ribeiro Lima', 'Heitor Souza Alves', 'Ingrid Pereira Costa', 'Jéssica Gomes Araújo', 'Kevin Martins Rocha',
        'Larissa Barbosa Dias', 'Matheus Cardoso Teixeira', 'Nicole Freitas Moraes', 'Otávio Nunes Pinto'];
      var CARGOS = [['Atendente', 'Caixa'], ['Repositor', 'Auxiliar de depósito'], ['Recepcionista'], ['Vendedor(a)', 'Atendente'], ['Auxiliar administrativo'],
        ['Cozinheiro(a)', 'Auxiliar de cozinha'], ['Serviços gerais'], ['Ajudante de obra', 'Pedreiro(a)'], ['Garçom/Garçonete'], ['Motorista', 'Entregador(a)']];
      var ZONAS = ['regiao-oeste', 'regiao-sul', 'regiao-norte', 'centro'];
      var ESC = ['medio', 'medio_incompleto', 'fundamental', 'tecnico', 'superior_incompleto', 'medio'];
      var pessoas = NOMES.map(function (nome, i) {
        var u = usuarioSemente(i === 0 ? 'pessoa@previa.com' : 'pessoa' + (i + 1) + '@previa.com', 'pessoa');
        var cg = CARGOS[i % CARGOS.length];
        st.pessoas[u.id] = { cidade: i % 13 === 7 ? 'campinorte-go' : 'uruacu-go', cidade2: i % 9 === 4 ? 'campinorte-go' : null,
          zona: i % 13 === 7 ? 'cidade-toda' : ZONAS[i % ZONAS.length], cargos: cg.slice(), escolaridade: ESC[i % ESC.length],
          turnos: i % 3 === 0 ? ['manha', 'tarde'] : (i % 3 === 1 ? ['tarde', 'noite'] : ['manha', 'fim_de_semana']), cnh: i % 4 === 0 ? ['B'] : (i % 7 === 0 ? ['A', 'B'] : []),
          modalidades: i % 2 === 0 ? ['clt', 'diaria'] : ['clt', 'temporario', 'freelancer'], pretensaoCentavos: i % 5 === 0 ? null : 160000 + (i % 6) * 10000,
          cursos: i % 3 === 0 ? ['Atendimento ao cliente'] : [], sobre: 'Pessoa fictícia da prévia.', bancoAte: null, referenciasToken: null,
          areas: [['caixa', 'atendimento'], ['logistica'], ['atendimento'], ['vendas-loja', 'atendimento'], ['administrativo'], ['cozinha'],
            ['limpeza'], ['construcao'], ['hotelaria', 'cozinha'], ['motorista', 'logistica']][i % 10],
          criadoEm: t0 - (30 - i % 20) * DIA, atualizadoEm: t0 - (10 - i % 10) * DIA };
        st.contatos[u.id] = { nome: nome, whatsapp: '55239' + ('8' + ('0000000' + (1000000 + i * 137)).slice(-7)), email: u.email };
        st.experiencias.push({ id: novoId(), userId: u.id, funcao: cg[0], empregador: 'Empregador fictício ' + (i + 1), inicio: '2023-0' + (1 + i % 9), fim: i % 3 === 0 ? null : '2025-0' + (1 + i % 9), informal: i % 4 === 3, ordem: 1 });
        return u.id;
      });

      // 30 vagas: CLT, temporário, diária (hoje e próximos dias), estágio e freelancer; 3 confidenciais, 2 em revisão, 1 rascunho.
      var hojeBV = hoje('America/Sao_Paulo');   // dia de hoje na praça
      var VAGAS = [
        [0, 'Atendente de caixa', 'Caixa', 'clt', 162100, 180000, 'centro'], [0, 'Repositor(a) de mercadorias', 'Repositor', 'clt', 162100, null, 'centro'],
        [0, 'Diária: organização de estoque', 'Auxiliar de depósito', 'diaria', 12000, null, 'centro', 0], [1, 'Padeiro(a)', 'Padeiro', 'clt', 200000, 230000, 'regiao-oeste'],
        [1, 'Balconista de padaria', 'Balconista', 'clt', 162100, null, 'regiao-oeste'], [2, 'Balconista de farmácia', 'Balconista', 'clt', 170000, 190000, 'regiao-sul'],
        [2, 'Estágio em atendimento', 'Estagiário(a)', 'estagio', 80000, null, 'regiao-sul'], [3, 'Vendedor(a) de loja', 'Vendedor', 'clt', 162100, 250000, 'regiao-norte'],
        [3, 'Diária: descarga de caminhão', 'Ajudante', 'diaria', 15000, null, 'regiao-norte', 1], [4, 'Auxiliar de estoque', 'Estoquista', 'temporario', 162100, null, 'regiao-oeste'],
        [5, 'Cozinheiro(a)', 'Cozinheiro', 'clt', 220000, 260000, 'centro'], [5, 'Garçom/Garçonete (fim de semana)', 'Garçom', 'freelancer', 9000, null, 'centro'],
        [6, 'Recepcionista de clínica', 'Recepcionista', 'clt', 180000, 200000, 'centro'], [6, 'Auxiliar administrativo(a)', 'Auxiliar administrativo', 'clt', 170000, null, 'centro'],
        [7, 'Ajudante de obra', 'Ajudante de obra', 'temporario', 170000, null, 'regiao-sul'], [7, 'Diária: limpeza pós-obra', 'Serviços gerais', 'diaria', 13000, null, 'regiao-sul', 2],
        [8, 'Camareiro(a)', 'Camareira', 'clt', 162100, null, 'centro'], [8, 'Recepcionista noturno(a)', 'Recepcionista', 'clt', 190000, null, 'centro'],
        [9, 'Vendedor(a) de ótica', 'Vendedor', 'clt', 170000, 220000, 'centro'], [10, 'Motorista entregador(a)', 'Motorista', 'clt', 230000, 260000, 'regiao-norte'],
        [10, 'Conferente de carga', 'Conferente', 'clt', 190000, null, 'regiao-norte'], [11, 'Recepcionista de escola', 'Recepcionista', 'clt', 170000, null, 'regiao-norte'],
        [11, 'Estágio em secretaria escolar', 'Estagiário(a)', 'estagio', 70000, null, 'regiao-norte'], [13, 'Diária: garçom em evento', 'Garçom', 'diaria', 14000, null, 'cidade-toda', 3],
        [13, 'Montador(a) de eventos', 'Montador', 'freelancer', 25000, null, 'cidade-toda'], [14, 'Lavador(a) de carros', 'Lavador', 'clt', 162100, null, 'regiao-oeste'],
        [0, 'Vendedor(a) interno(a)', 'Vendedor', 'clt', 180000, 220000, 'centro', null, true], [6, 'Assistente de faturamento', 'Auxiliar administrativo', 'clt', 200000, null, 'centro', null, true],
        [10, 'Supervisor(a) de rota', 'Supervisor', 'clt', 300000, 350000, 'regiao-norte', null, true], [12, 'Banhista e tosador(a)', 'Banhista', 'clt', 162100, null, 'regiao-oeste']];
      var AREA_DO_CARGO = { Caixa: 'caixa', Repositor: 'logistica', 'Auxiliar de depósito': 'logistica', Padeiro: 'cozinha',
        Balconista: 'vendas-loja', 'Estagiário(a)': 'atendimento', Vendedor: 'vendas-loja', Ajudante: 'logistica', Estoquista: 'logistica',
        Cozinheiro: 'cozinha', 'Garçom': 'hotelaria', Recepcionista: 'atendimento', 'Auxiliar administrativo': 'administrativo',
        'Ajudante de obra': 'construcao', 'Serviços gerais': 'limpeza', Camareira: 'hotelaria', Motorista: 'motorista', Conferente: 'logistica',
        Montador: 'hotelaria', Lavador: 'outros', Supervisor: 'vendas-externas', Banhista: 'outros' };
      var anuncios = VAGAS.map(function (v, i) {
        var e = empresas[v[0]];
        var diaria = v[3] === 'diaria' ? { data: R.somarDias(hojeBV, v[7]), inicio: '07:00', fim: '16:00' } : null;
        var vende = v[2] === 'Vendedor' || v[2] === 'Supervisor';
        var ben = v[3] === 'clt' ? ['vt', 'refeicao'] : [];
        if (vende) ben.push('comissao');
        var a = { id: novoId(), codigo: '', empresaId: e.id, cidade: e.cidade, zona: v[6], area: AREA_DO_CARGO[v[2]] || 'outros', funcao: v[1],
          titulo: v[1], modalidade: v[3], descricao: 'Vaga fictícia da prévia: ' + v[1].toLowerCase() + ' em ' + e.nomeFantasia + '. Rotina de trabalho explicada na conversa.',
          turno: ['comercial', 'manha', 'tarde', 'escala', 'noite', 'a_combinar'][i % 6], fimDeSemana: i % 4 === 1, comissao: vende,
          inicio: diaria ? 'data' : 'imediato', inicioData: diaria ? diaria.data : null, experiencia: ['nao_precisa', 'ajuda', '6_meses'][i % 3],
          escolaridade: v[3] === 'estagio' || i % 4 === 0 ? 'medio' : 'nao_exigida',
          requisitos: v[2] === 'Motorista' ? ['cnh_b'] : (i % 5 === 0 ? ['disponibilidade'] : []), requisitoOutro: '',
          selo: v[2] === 'Caixa' ? 'caixa' : (v[2] === 'Recepcionista' ? 'atendimento' : null), beneficios: ben,
          horasDia: v[3] === 'estagio' ? 6 : null, prazoHoras: diaria ? 48 : null, quantidade: 1 + i % 3,
          valor: { minCentavos: v[4], maxCentavos: v[5], unidade: v[3] === 'diaria' ? 'dia' : (v[3] === 'freelancer' ? 'servico' : 'mes') },
          diaria: diaria, diasNoAr: 30, confidencial: !!v[8], status: 'publicado', statusMotivo: '', publicadoEm: t0 - (i % 10) * DIA - i * 60000, expiraEm: null,
          encerradoEm: null, criadoPor: null, criadoEm: t0 - (i % 10) * DIA - i * 60000 - 3600000, atualizadoEm: t0 - (i % 10) * DIA };
        a.codigo = novoCodigo();
        st.anuncios.push(a);
        if (v[0] === 12) { a.status = 'em_revisao'; a.publicadoEm = null; }
        if (a.status === 'publicado') a.expiraEm = a.modalidade === 'diaria' ? t0 + 48 * 3600000 : a.publicadoEm + 30 * DIA;
        return a;
      });
      anuncios[25].status = 'em_revisao'; anuncios[25].publicadoEm = null; anuncios[25].expiraEm = null;
      var rascunho = Object.assign(clone(anuncios[1]), { id: novoId(), codigo: novoCodigo(), titulo: 'Fiscal de loja', funcao: 'Fiscal de loja', area: 'seguranca', status: 'rascunho', publicadoEm: null, expiraEm: null });
      st.anuncios.push(rascunho);

      // Candidaturas, conversas e um Combinou.
      function cand(pIdx, aIdx, status, extra) {
        var a = anuncios[aIdx];
        var k = Object.assign({ id: novoId(), anuncioId: a.id, pessoaId: pessoas[pIdx], empresaId: a.empresaId, status: status, criadoEm: t0 - (8 - pIdx % 8) * 3600000 - aIdx * 60000,
          atualizadoEm: t0 - pIdx * 60000 }, extra || {});
        st.candidaturas.push(k);
        return k;
      }
      function conversa(k, msgs) {
        var v = { id: novoId(), candidaturaId: k.id, status: 'aberta', criadaEm: t0 - 3 * 3600000, ultimaEm: t0 - 3600000, lidaEmpresaEm: t0 - 3600000, empresaSeguidas: 0 };
        st.conversas.push(v);
        msgs.forEach(function (m, i) {
          st.mensagens.push({ id: novoId(), conversaId: v.id, autor: m[0], autorUser: m[0] === 'pessoa' ? k.pessoaId : null, texto: m[1], criadoEm: t0 - 3 * 3600000 + i * 600000 });
        });
        return v;
      }
      for (var p = 1; p <= 9; p++) cand(p, 0, p % 3 === 0 ? 'conversar' : 'enviada');
      for (var q = 10; q <= 14; q++) cand(q, 1, 'enviada');
      cand(15, 2, 'enviada');
      var kConf = cand(0, 26, 'conversar', { empresaDecidiuEm: t0 - 3 * 3600000 });
      conversa(kConf, [['empresa', 'Olá! Gostamos do seu cartão. Você tem disponibilidade para começar na próxima semana?']]);
      var kComb = cand(0, 10, 'combinou', { empresaDecidiuEm: t0 - 2 * DIA, empresaReveladaEm: t0 - DIA, combinouEm: t0 - DIA });
      conversa(kComb, [['empresa', 'Olá! Podemos conversar sobre a vaga de cozinheiro(a)?'], ['pessoa', 'Pode sim! Tenho experiência em cozinha industrial.'],
        ['sistema', 'Combinou! O contato foi liberado para os dois lados.']]);
      st.acessos.push({ candidaturaId: kComb.id, pessoaId: pessoas[0], empresaId: anuncios[10].empresaId, empresaNome: empresas[5].nomeFantasia, anuncioTitulo: anuncios[10].titulo, userId: null, em: t0 - 20 * 3600000 });
      cand(0, 7, 'enviada');
      var k3 = cand(3, 0, 'conversar');
      conversa(k3, [['empresa', 'Olá! Você pode vir fazer uma conversa amanhã às 10h?'], ['pessoa', 'Posso sim, obrigado!']]);

      // Referências (empresas verificadas): uma aceita com texto aprovado, uma pendente.
      st.referencias.push({ id: novoId(), empresaId: empresas[5].id, pessoaId: pessoas[0], autor: null, convite: null, origem: 'candidatura', funcao: 'Auxiliar de cozinha', vinculo: 'clt',
        inicio: '2023-02', fim: '2025-01', pontosFortes: ['pontualidade', 'equipe'], recomendaPara: ['Cozinheiro(a)', 'Auxiliar de cozinha'],
        texto: 'Deixava a cozinha limpa no fim de cada turno e ajudava os colegas na hora do almoço, quando o movimento apertava.', textoStatus: 'publicado',
        textoMotivo: '', status: 'aceita', criadoEm: t0 - 40 * DIA, respondidaEm: t0 - 39 * DIA, aceitaEm: t0 - 39 * DIA, atualizadoEm: t0 - 39 * DIA });
      st.referencias.push({ id: novoId(), empresaId: empresas[0].id, pessoaId: pessoas[0], autor: null, convite: null, origem: 'convite', funcao: 'Atendente', vinculo: 'temporario',
        inicio: '2025-06', fim: '2025-08', pontosFortes: ['atendimento', 'aprende_rapido'], recomendaPara: ['Atendente'], texto: '', textoStatus: 'sem_texto', textoMotivo: '',
        status: 'pendente', criadoEm: t0 - 2 * DIA, respondidaEm: null, aceitaEm: null, atualizadoEm: t0 - 2 * DIA });
      st.referencias.forEach(function (r) { historico(r.id, 'oferecida', 'empresa'); if (r.status === 'aceita') historico(r.id, 'aceita', 'pessoa'); });
      // Selos fictícios (o formato do gancho vagas_interno.selos_cartao da migração dos testes).
      var umAno = R.somarDias(hojeBV, 355);
      // Códigos sorteados (nunca fixos): o código de exemplo das telas não confere como selo válido (revisão G4).
      var codigoSemente = function () { var c; do { c = ''; for (var i = 0; i < 8; i++) c += ALFABETO.charAt(Math.floor(Math.random() * 32)); } while (c === 'Q8V3N2KD'); return c; };
      st.selos[pessoas[0]] = [{ teste: 'atendimento', nome: 'Atendimento e recepção', nota: 80, data: R.somarDias(hojeBV, -10), codigo: codigoSemente(),
        validoAte: umAno, supervisao: 'online' }];
      st.selos[pessoas[4]] = [{ teste: 'caixa', nome: 'Caixa e matemática prática', nota: 73, data: R.somarDias(hojeBV, -10), codigo: codigoSemente(),
        validoAte: umAno, supervisao: 'online' }];
      st.sessao = null;
    }

    function carregar() {
      try { var t = arm && arm.getItem(CHAVE); var s = t ? JSON.parse(t) : null; return s && s.versao === 2 ? s : null; } catch (e) { return null; }
    }

    function reiniciar(semente) {
      st = estadoVazio();
      if (semente !== false) semear();
      salvar();
    }

    st = op.reiniciar ? null : carregar();
    if (!st) reiniciar(op.semente);

    // Testes de habilidade com a prova de DEMONSTRAÇÃO (frente testes, onda 2): as RPCs da migração 20261023 e, por cima das
    // que já existiam, a conferência pública (agora acha também os selos da prova) e a exportação (LGPD) com os testes.
    (function () {
      var prova = provaDemonstracao({ estado: function () { return st; }, agora: agora, novoId: novoId, usuario: usuario, cidade: cidade,
        contaAtual: contaAtual, R: R });
      ['vagas_testes_catalogo', 'vagas_iniciar_tentativa', 'vagas_proxima_questao', 'vagas_responder', 'vagas_finalizar', 'vagas_registrar_sinal',
        'vagas_meus_selos'].forEach(function (nome) { H[nome] = prova[nome]; });
      var seloAntes = H.vagas_selo_publico;
      H.vagas_selo_publico = function (a) { return prova.seloPublico(a, seloAntes); };
      var exportarAntes = H.vagas_exportar_meus_dados;
      if (exportarAntes) {
        H.vagas_exportar_meus_dados = function (a) {
          var r = exportarAntes(a);
          if (r && r.ok && st.sessao) r.testes = prova.exportar(st.sessao);
          return r;
        };
      }
    })();

    function rpc(nome, args) {
      return Promise.resolve().then(function () {
        if (!Object.prototype.hasOwnProperty.call(H, nome)) {
          return erro('O banco de dados ainda não tem o Vagas sem Caos. Peça para aplicar a migração 20261022120000_vagas (docs/SUPABASE.md).', { bancoDesatualizado: true });
        }
        var r = H[nome](obj(args));
        salvar();
        return clone(r);
      });
    }
    var contaPromessas = {};
    Object.keys(conta).forEach(function (m) {
      contaPromessas[m] = function () {
        var args = arguments;
        return Promise.resolve().then(function () { var r = conta[m].apply(null, args); salvar(); return clone(r); });
      };
    });

    return { rpc: rpc, conta: contaPromessas, estado: function () { return st; }, reiniciar: reiniciar, RPCS: Object.keys(H) };
  }

  var VAGAS_PREVIA = { criarBackend: criarBackend, SENHA_PREVIA: SENHA_PREVIA };
  // Prova de demonstração (só a prévia; os testes de unidade e do navegador conferem o banco e respondem com ele).
  VAGAS_PREVIA.TESTES_DEMONSTRACAO = TESTES_DEMONSTRACAO;
  VAGAS_PREVIA.MSG_PROVA = MSG_PROVA;
  VAGAS_PREVIA.REGRAS_PROVA = REGRAS_PROVA;
  if (typeof module !== 'undefined' && module.exports) module.exports = VAGAS_PREVIA;
  else root.VAGAS_PREVIA = VAGAS_PREVIA;
})(typeof self !== 'undefined' ? self : this);
