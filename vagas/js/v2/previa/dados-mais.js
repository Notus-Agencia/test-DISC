/* Vagas sem Caos: MAIS empresas e vagas de exemplo, só para a prévia do candidato (24/11/2026).
   Tudo inventado: nenhuma empresa real, nenhuma pessoa real. Todo registro leva exemplo:true.
   Também: v05 deixa de ser "Jovem aprendiz" (a regra de hoje é 18 anos ou mais) e toda vaga ganha o campo "jornada". */
(function(D){
  'use strict';
  var BASE = Date.parse('2026-11-24T12:00:00-03:00');
  function reais(n){ return 'R$ ' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  var POR = {mes:'por mês', dia:'por dia', hora:'por hora'};
  function S(min, max, p){
    if (typeof max === 'string'){ p = max; max = null; }
    p = p || 'mes';
    return {min:min, max:max || null, periodo:p, aCombinar:false, texto:(max ? reais(min) + ' a ' + reais(max) : reais(min)) + ' ' + POR[p]};
  }

  /* ---------- v05: sai o jovem aprendiz, entra uma vaga de meio período para maiores de 18 ---------- */
  D.vagas.forEach(function(v){
    if (v.id !== 'v05') return;
    v.titulo = 'Empacotador(a)'; v.tipo = 'CLT'; v.turno = 'Tarde';
    v.horario = 'Segunda a sexta, das 14h às 18h';
    v.salario = S(980); v.salario.obs = 'meio período, 4 horas por dia';
    v.beneficios = ['Vale-transporte', 'Lanche no intervalo'];
    v.requisitos = []; v.diferenciais = [];
    v.descricao = 'Vaga de meio período à tarde, com 4 horas por dia. A pessoa ajuda a empacotar as compras, organiza os carrinhos e repõe sacolas nos caixas. Para muita gente aqui foi o primeiro emprego, e já tivemos empacotador que virou caixa e depois fiscal de loja.';
    v.perguntas = ['Pode trabalhar das 14h às 18h?'];
  });

  /* ---------- 29 empresas novas (inventadas) ---------- */
  function E(id, nome, setor, porte, cidade, bairro, descricao, iniciais, verificada, desde, fundadaEm){
    return {id:id, nome:nome, setor:setor, porte:porte, cidade:cidade, bairro:bairro, descricao:descricao, iniciais:iniciais, cor:'#6B7280',
      verificada:verificada, desde:desde, fundadaEm:fundadaEm, exemplo:true};
  }
  var U = 'uruacu-go', CA = 'campinorte-go', SL = 'sao-luiz-do-norte-go', NI = 'niquelandia-go', PO = 'porangatu-go';
  var novas = [
    E('e23', 'Supermercado Sabiá do Cerrado', 'supermercado', 'média', U, 'Vila Santana', 'Supermercado de bairro na Vila Santana, com padaria, açougue e entrega pelo WhatsApp.', 'SC', true, '2026-11-06', 2012),
    E('e24', 'Mercado Lobeira', 'supermercado', 'pequena', U, 'Setor Norte', 'Mercado do Setor Norte, aberto todos os dias das 7h às 21h.', 'ML', true, '2026-11-09', 2017),
    E('e25', 'Supermercado Ponte Velha', 'supermercado', 'média', NI, 'Centro', 'Supermercado no Centro de Niquelândia, com rotisseria e entrega nos bairros.', 'PV', true, '2026-11-02', 2004),
    E('e26', 'Mercearia Cajueiro Torto', 'supermercado', 'MEI', CA, 'Vila Nova', 'Mercearia de bairro em Campinorte, com frios, hortifrúti e pão de queijo.', 'CT', false, '2026-11-22', 2023),
    E('e27', 'Supermercado Chapada Alta', 'supermercado', 'média', PO, 'Setor Sul', 'Supermercado no Setor Sul de Porangatu, com estacionamento e açougue.', 'CA', true, '2026-10-30', 2010),
    E('e28', 'Auto Posto Lobo-Guará', 'comercio', 'média', U, 'Setor Aeroporto', 'Posto na saída para a BR-153, com loja de conveniência aberta 24 horas.', 'LG', true, '2026-11-04', 2008),
    E('e29', 'Posto Tucano Azul', 'comercio', 'pequena', U, 'Setor Sul', 'Posto de combustível com lava-jato e troca de óleo no Setor Sul.', 'TA', true, '2026-11-11', 2015),
    E('e30', 'Posto Ipê Florido', 'comercio', 'pequena', SL, 'Centro', 'Posto no Centro de São Luiz do Norte, com loja de conveniência.', 'IF', false, '2026-11-21', 2024),
    E('e31', 'Posto Garça Branca', 'comercio', 'média', PO, 'Setor Norte', 'Posto na BR-153, em Porangatu, com restaurante para caminhoneiros.', 'GB', true, '2026-11-01', 2002),
    E('e32', 'Restaurante Panela de Ferro', 'alimentacao', 'pequena', U, 'Setor Central', 'Restaurante self-service no almoço, de segunda a sábado, e marmitex para empresas.', 'PF', true, '2026-10-28', 2014),
    E('e33', 'Padaria Grão do Norte', 'alimentacao', 'pequena', U, 'Vila Nova', 'Padaria e lanchonete na Vila Nova, aberta das 5h30 às 20h.', 'GN', true, '2026-11-03', 2011),
    E('e34', 'Pizzaria Forno de Barro', 'alimentacao', 'MEI', NI, 'Beira do lago', 'Pizzaria na beira do lago, aberta de quinta a domingo, à noite.', 'FB', false, '2026-11-19', 2025),
    E('e35', 'Lanchonete Seriema Gulosa', 'alimentacao', 'pequena', CA, 'Centro', 'Lanches, açaí e porções no Centro de Campinorte, de terça a domingo.', 'SG', true, '2026-11-07', 2019),
    E('e36', 'Magazine Cata-Vento', 'comercio', 'média', U, 'Centro', 'Loja de roupas, calçados e utilidades no Centro de Uruaçu.', 'CV', true, '2026-10-25', 2006),
    E('e37', 'Bazar Três Ipês', 'comercio', 'pequena', PO, 'Centro', 'Bazar de presentes, papelaria e utilidades no Centro de Porangatu.', 'TI', true, '2026-11-08', 2013),
    E('e38', 'Lar em Dia Serviços Domésticos', 'limpeza', 'pequena', U, 'Setor Oeste', 'Agência que contrata diaristas, babás e trabalho doméstico para casas de família em Uruaçu.', 'LD', true, '2026-11-05', 2018),
    E('e39', 'Ninho Feliz Cuidados Infantis', 'educacao', 'MEI', U, 'Jardim Goiás', 'Serviço de babá para famílias, por mês ou por dia.', 'NF', false, '2026-11-20', 2025),
    E('e40', 'Condomínio Residencial Buritizal', 'limpeza', 'média', U, 'Setor Norte', 'Condomínio de 120 casas no Setor Norte, com portaria 24 horas.', 'RB', true, '2026-11-10', 2016),
    E('e41', 'Brilho do Lago Limpeza e Conservação', 'limpeza', 'média', NI, 'Setor Sul', 'Limpeza e conservação para comércio, escolas e casas em Niquelândia.', 'BL', true, '2026-11-04', 2012),
    E('e42', 'Entregas Ligeirinho Norte', 'transporte', 'pequena', U, 'Francisco Martins', 'Entregas de encomendas e documentos em Uruaçu e cidades vizinhas.', 'LN', true, '2026-11-06', 2020),
    E('e43', 'Expresso Serra Dourada', 'transporte', 'média', U, 'Setor Aeroporto', 'Ônibus de linha rural, fretamento e viagens para Goiânia.', 'SD', true, '2026-10-27', 1999),
    E('e44', 'Distribuidora Água da Serra', 'transporte', 'média', PO, 'Setor Sul', 'Distribuidora de água, gás e bebidas para mercados e casas do norte de Goiás.', 'AS', true, '2026-10-31', 2009),
    E('e45', 'Casa de Repouso Jardim das Acácias', 'saude', 'pequena', U, 'Setor Oeste', 'Casa de repouso com 24 moradores, equipe de enfermagem e cozinha própria.', 'JA', true, '2026-11-02', 2015),
    E('e46', 'Colégio Vereda Nova', 'educacao', 'pequena', CA, 'Centro', 'Escola particular do infantil ao 9º ano, com van para a zona rural.', 'VN', true, '2026-11-09', 2008),
    E('e47', 'Doces Fruta do Cerrado', 'industria', 'média', SL, 'Vila Nova', 'Fábrica de doces de leite, de buriti e de caju, com venda para todo o estado.', 'FC', true, '2026-11-12', 2001),
    E('e48', 'Farmácia Bem-te-vi', 'saude', 'pequena', PO, 'Centro', 'Farmácia no Centro de Porangatu, aberta até as 22h.', 'BT', false, '2026-11-18', 2024),
    E('e49', 'Loja Sinal Cheio Celulares', 'comercio', 'pequena', NI, 'Centro', 'Venda de celulares, capas, chips e conserto de aparelhos.', 'SC', true, '2026-11-05', 2016),
    E('e50', 'Hortifrúti Colheita do Dia', 'supermercado', 'MEI', U, 'Francisco Martins', 'Frutas, verduras e ovos de produtores da região, com entrega.', 'CD', false, '2026-11-23', 2025),
    E('e51', 'Casa em Ordem Serviços Residenciais', 'limpeza', 'pequena', PO, 'Vila Nova', 'Diaristas, babás e serviços gerais para casas e escritórios em Porangatu.', 'CO', true, '2026-11-03', 2017)
  ];
  novas.forEach(function(e){ D.empresas.push(e); });
  var EMP = {}; D.empresas.forEach(function(e){ EMP[e.id] = e; });
  var CID = {}; D.cidades.forEach(function(c){ CID[c.id] = c; });

  /* ---------- modelos de texto por função (frases simples, sem jargão) ---------- */
  var TF = {'Manhã':'de manhã', 'Tarde':'à tarde', 'Noite':'à noite', 'Comercial':'em horário comercial', 'Escala 12x36':'na escala 12x36', 'Fim de semana':'no fim de semana'};
  function lugarFrase(v){ var c = CID[v.cidade]; return (/^(Vila|Zona|Beira)/.test(v.bairro) ? 'na ' + v.bairro : 'no ' + v.bairro) + (c && c.id !== U ? ', em ' + c.nome : ''); }
  var M = {
    caixa:{d:['Vaga de caixa {turno}. O serviço é passar as compras, receber em dinheiro, cartão e Pix e fechar o caixa no fim do turno. Quem nunca foi caixa pode se candidatar: a primeira semana é junto com alguém da equipe.',
        'Precisamos de caixa {turno}. A loja fica {lugar} e o movimento é maior no começo do mês. A pessoa passa as compras, confere o troco e ajuda a empacotar quando a fila cresce.',
        'Estamos reforçando a equipe para o fim de ano. O horário é {horario}. Ensinamos o sistema do caixa nos primeiros dias.'],
      a:['Passar as compras e conferir o preço', 'Receber em dinheiro, cartão e Pix', 'Fechar o caixa no fim do turno', 'Ajudar a empacotar quando a fila aumenta'],
      r:[['Ensino médio completo'], ['Saber fazer conta de troco'], ['Ensino médio completo', 'Saber fazer conta de troco']],
      x:[['Ter trabalhado com caixa'], ['Prática com Pix e máquina de cartão']],
      b:[['Vale-alimentação de R$ 250', 'Cesta básica'], ['Vale-transporte', 'Desconto nas compras'], ['Cesta básica', 'Lanche no intervalo']],
      p:[['Já trabalhou com caixa?'], ['Pode trabalhar um domingo por mês?'], ['Já trabalhou com caixa?', 'Pode trabalhar aos sábados?']]},
    atendente:{d:['Vaga para atender os clientes no balcão {turno}. O horário é {horario}. A pessoa atende, anota o pedido, recebe e deixa o balcão organizado.',
        'Procuramos atendente com paciência e boa conversa. O trabalho é {lugar}, {horarioMin}. Não precisa de experiência: a equipe ensina no dia a dia.',
        'Precisamos de reforço no atendimento {turno}. Quem gosta de lidar com gente se dá bem aqui. O movimento aumenta no fim do mês e nas datas comemorativas.'],
      a:['Atender os clientes no balcão', 'Anotar pedidos e tirar dúvidas', 'Receber em dinheiro, cartão e Pix', 'Manter o balcão limpo e arrumado'],
      r:[[], ['Gostar de atender o público'], ['Ensino médio completo']],
      x:[['Ter trabalhado com atendimento'], ['Saber usar máquina de cartão']],
      b:[['Vale-transporte', 'Lanche no intervalo'], ['Vale-alimentação de R$ 200'], ['Folga durante a semana', 'Vale-transporte']],
      p:[['Já trabalhou com atendimento ao público?'], ['Pode trabalhar aos sábados?'], ['Pode trabalhar aos fins de semana?']]},
    vendedor:{d:['Vaga para vender no salão da loja, {horarioMin}. O salário tem uma parte fixa e comissão sobre as vendas. Dezembro é o mês mais forte.',
        'Procuramos quem goste de conversar e ajudar o cliente a escolher. A loja fica {lugar}. Ensinamos os produtos e o sistema.',
        'Vaga de vendas {turno}. A pessoa atende no balcão e no WhatsApp da loja, separa os pedidos e acompanha a entrega.'],
      a:['Atender os clientes e mostrar os produtos', 'Fechar a venda e emitir o pedido', 'Arrumar vitrine e prateleiras', 'Responder os clientes no WhatsApp da loja'],
      r:[['Gostar de atender o público'], [], ['Ensino médio completo']],
      x:[['Ter trabalhado com vendas'], ['Saber mandar foto de produto pelo celular']],
      b:[['Comissão sobre as vendas', 'Vale-transporte'], ['Comissão de 2% sobre as vendas', 'Desconto nas compras'], ['Comissão por meta', 'Folga no domingo']],
      p:[['Já trabalhou com vendas?'], ['Pode trabalhar aos sábados?']]},
    auxcozinha:{d:['Vaga de auxiliar de cozinha {turno}, {horarioMin}. A pessoa ajuda no pré-preparo, lava a louça e mantém a cozinha limpa. Ensinamos as receitas da casa.',
        'Precisamos de ajuda na cozinha no horário de mais movimento. O trabalho é cortar legumes, montar pratos e marmitas e deixar tudo organizado.',
        'Cozinha movimentada {lugar}. Procuramos quem tenha agilidade e cuidado com a limpeza. Não precisa ter trabalhado em restaurante.'],
      a:['Cortar legumes, verduras e carnes', 'Montar pratos e marmitas', 'Lavar louças e panelas', 'Limpar a cozinha no fim do turno'],
      r:[[], ['Cuidado com higiene e limpeza'], ['Poder começar cedo']],
      x:[['Curso de boas práticas na manipulação de alimentos'], ['Ter trabalhado em cozinha']],
      b:[['Almoço no serviço', 'Vale-transporte'], ['Refeição no serviço'], ['Almoço no serviço', 'Folga durante a semana']],
      p:[['Já trabalhou em cozinha?'], ['Pode trabalhar aos sábados?']]},
    cozinheiro:{d:['Procuramos cozinheiro(a) para o almoço, {horarioMin}. A pessoa prepara arroz, feijão, carnes e saladas para cerca de 120 refeições por dia, com duas pessoas de apoio.',
        'Vaga de cozinha para comida caseira {lugar}. O cardápio é simples e muda todo dia. A cozinha é nova e tem tudo à mão.'],
      a:['Preparar o almoço do dia', 'Temperar e cozinhar carnes, arroz e feijão', 'Montar as saladas e as marmitas', 'Controlar o que falta na despensa'],
      r:[['Experiência com cozinha de restaurante ou de casa de repouso']], x:[['Curso de boas práticas na manipulação de alimentos']],
      b:[['Almoço no serviço', 'Vale-transporte'], ['Cesta básica', 'Uniforme']], p:[['Já trabalhou como cozinheiro(a)?']]},
    pizzaiolo:{d:['Pizzaria de quinta a domingo, à noite, {lugar}. A pessoa abre a massa, monta e assa as pizzas no forno a lenha. O valor é por noite trabalhada.'],
      a:['Preparar e abrir a massa', 'Montar e assar as pizzas', 'Cuidar do forno a lenha', 'Deixar a bancada limpa no fim da noite'],
      r:[['Experiência com pizza ou forno a lenha']], x:[[]], b:[['Jantar no serviço']], p:[['Já trabalhou com forno a lenha?']]},
    merendeiro:{d:['A escola precisa de merendeiro(a) de manhã, de segunda a sexta. A pessoa prepara o lanche e o almoço das crianças com cardápio pronto da nutricionista.'],
      a:['Preparar o lanche e o almoço das crianças', 'Seguir o cardápio da semana', 'Lavar louças e panelas', 'Manter a cozinha limpa'],
      r:[[]], x:[['Curso de boas práticas na manipulação de alimentos']], b:[['Vale-transporte', 'Recesso em janeiro']], p:[['Já trabalhou em cozinha?']]},
    servgerais:{d:['Vaga de serviços gerais {turno}, {horarioMin}. O trabalho é limpar e organizar os ambientes, cuidar do lixo e ajudar em pequenos reparos.',
        'Procuramos pessoa caprichosa para a limpeza e a conservação {lugar}. Os produtos e o uniforme são da empresa.',
        'Precisamos de auxiliar de serviços gerais para a equipe. A rotina é limpar salas, banheiros e áreas comuns, com escala definida no começo do mês.'],
      a:['Limpar salas, banheiros e áreas comuns', 'Recolher e separar o lixo', 'Repor papel, sabonete e material de limpeza', 'Ajudar na organização e em pequenos reparos'],
      r:[[], ['Poder trabalhar em pé boa parte do dia']], x:[['Ter trabalhado com limpeza'], ['Curso de limpeza profissional']],
      b:[['Vale-transporte', 'Uniforme'], ['Cesta básica', 'Vale-transporte'], ['Vale-alimentação de R$ 220', 'Uniforme']],
      p:[['Já trabalhou com limpeza?'], ['Pode trabalhar aos sábados?']]},
    motoristaB:{d:['Vaga de motorista para entregas na cidade e nos distritos, com carro da empresa. A pessoa carrega, entrega e confere os pedidos com o cliente.',
        'Precisamos de motorista com CNH B para as entregas da semana. As rotas saem {lugar} e voltam no mesmo dia.'],
      a:['Fazer as entregas na cidade e nos distritos', 'Conferir os pedidos com o cliente', 'Cuidar da limpeza do carro', 'Avisar a empresa de qualquer problema na rota'],
      r:[['CNH categoria B']], x:[['Conhecer as ruas da cidade']], b:[['Vale-alimentação de R$ 250', 'Almoço no serviço'], ['Vale-alimentação de R$ 300']], p:[['Tem CNH categoria B?']]},
    motoristaC:{d:['Procuramos motorista com CNH C para o caminhão baú das entregas da região. As rotas saem cedo e voltam no mesmo dia.'],
      a:['Dirigir o caminhão baú nas rotas', 'Conferir a carga com o ajudante', 'Fazer a checagem do caminhão antes de sair', 'Entregar as notas no fim do dia'],
      r:[['CNH categoria C']], x:[['Ter dirigido caminhão de entrega']], b:[['Vale-alimentação de R$ 300', 'Diária de viagem']], p:[['Tem CNH categoria C?']]},
    motoristaD:{d:['Vaga de motorista de ônibus. As rotas saem {lugar}, e a empresa faz a revisão do ônibus toda semana.',
        'Precisamos de motorista com CNH D e curso de transporte de passageiros. O horário é {horario}.'],
      a:['Dirigir nas rotas da empresa', 'Conferir passageiros e horários', 'Fazer a checagem do veículo antes de sair', 'Avisar a empresa de qualquer problema na rota'],
      r:[['CNH categoria D', 'Curso de transporte de passageiros em dia']], x:[['Ter dirigido ônibus ou van']], b:[['Vale-alimentação de R$ 350', 'Plano de saúde'], ['Vale-alimentação de R$ 300']], p:[['Tem CNH categoria D?'], ['Tem CNH categoria D?', 'O curso de transporte de passageiros está em dia?']]},
    motoristaE:{d:['Vaga de motorista de caminhão para rotas entre Porangatu, Uruaçu e o Tocantins. Volta para casa no fim de semana.'],
      a:['Dirigir nas rotas da empresa', 'Conferir a carga e as notas', 'Fazer a checagem do caminhão antes de sair', 'Avisar a empresa de qualquer problema na rota'],
      r:[['CNH categoria E']], x:[['Curso MOPP']], b:[['Diária de viagem', 'Plano de saúde']], p:[['Tem CNH categoria E?', 'Pode viajar durante a semana?']]},
    repositor:{d:['Precisamos de repositor(a) para deixar as prateleiras cheias e organizadas antes da loja encher. O horário é {horario}.',
        'Vaga para repor mercadoria, conferir a validade e arrumar o depósito. A loja fica {lugar}. Ensinamos o jeito de organizar cada corredor.',
        'Vaga de reposição {turno}. O trabalho envolve carregar caixas, repor geladeiras e ajudar a receber os fornecedores.'],
      a:['Repor prateleiras e geladeiras', 'Conferir a validade dos produtos', 'Organizar o depósito', 'Ajudar a receber mercadoria'],
      r:[[], ['Poder carregar caixas'], ['Poder começar cedo']], x:[['Ter trabalhado em mercado ou depósito']],
      b:[['Cesta básica', 'Vale-transporte'], ['Vale-alimentação de R$ 250', 'Desconto nas compras']], p:[['Já trabalhou com reposição?'], ['Pode começar às 6h da manhã?']]},
    diarista:{d:['Diária de limpeza em casas de família {lugar}. O serviço é limpar, passar pano, organizar e cuidar dos banheiros. A diária é paga no mesmo dia.',
        'Precisamos de diarista para casas de família, {horarioMin}. Os produtos de limpeza são das casas. Os endereços são combinados com você na semana anterior.'],
      a:['Limpar e organizar os cômodos', 'Limpar cozinha e banheiros', 'Passar pano e tirar o pó', 'Lavar a roupa quando a família pedir'],
      r:[[]], x:[['Ter trabalhado como diarista']], b:[['Diária paga no mesmo dia', 'Vale-transporte nos dias de serviço']], p:[['Já trabalhou com limpeza de casa?']]},
    domestico:{d:['Trabalho doméstico com carteira assinada, em casa de família atendida pela empresa. O horário é {horario}. O serviço é limpar a casa, lavar e passar roupa e preparar o almoço.',
        'Vaga de trabalho doméstico {lugar}. A família tem dois adultos e uma criança. O horário é {horario}.'],
      a:['Limpar a casa e organizar os cômodos', 'Lavar e passar roupa', 'Preparar refeições simples', 'Cuidar da limpeza da cozinha e dos banheiros'],
      r:[[]], x:[['Ter trabalhado em casa de família']], b:[['Carteira assinada', 'Vale-transporte'], ['Almoço no serviço', 'Vale-transporte']], p:[['Já trabalhou em casa de família?']]},
    frentista:{d:['Vaga de frentista {turno}. O trabalho é abastecer, receber o pagamento, conferir óleo e calibrar pneus. Ensinamos tudo nos primeiros dias.',
        'Posto movimentado {lugar}. Procuramos frentista com boa conversa e atenção no troco. O horário é {horario}.',
        'Precisamos de frentista para a escala da noite. O posto tem segurança e câmera em toda a pista.'],
      a:['Abastecer os veículos', 'Receber em dinheiro, cartão e Pix', 'Conferir óleo e água e calibrar pneus', 'Manter a pista limpa e organizada'],
      r:[['Ensino fundamental completo'], [], ['Poder trabalhar em escala']], x:[['Ter trabalhado em posto'], ['Saber fazer conta de troco']],
      b:[['Adicional de periculosidade', 'Vale-alimentação de R$ 250'], ['Adicional de periculosidade', 'Uniforme e bota'], ['Adicional de periculosidade', 'Adicional noturno']],
      p:[['Já trabalhou em posto de combustível?'], ['Pode trabalhar à noite?']]},
    baba:{d:['Vaga de babá para cuidar de criança em casa de família, {horarioMin}. O trabalho é dar banho e comida, brincar e acompanhar as tarefas da escola.',
        'Procuramos babá com paciência e carinho para cuidar de duas crianças, de 3 e 6 anos. A família mora {lugar}.',
        'Babá para os fins de semana, em casa de família. O valor é por dia trabalhado.'],
      a:['Cuidar da alimentação e do banho', 'Brincar e acompanhar as tarefas da escola', 'Levar e buscar na escola', 'Organizar o quarto e os brinquedos'],
      r:[[], ['Ter cuidado de criança antes']], x:[['Curso de primeiros socorros'], ['Ter trabalhado em creche ou escola']],
      b:[['Vale-transporte', 'Almoço no serviço'], ['Vale-transporte']], p:[['Já cuidou de criança antes?'], ['Pode trabalhar aos sábados?']]},
    motoboy:{d:['Vaga de entregas {turno}, com moto própria. O horário é {horario}. A empresa ajuda com o combustível.',
        'Precisamos de motoboy para as entregas {lugar}. As entregas são perto e o movimento é maior no começo da noite.'],
      a:['Fazer as entregas dos pedidos', 'Receber o pagamento na entrega', 'Conferir o pedido com o cliente', 'Cuidar da caixa térmica'],
      r:[['CNH categoria A', 'Moto própria']], x:[['Conhecer as ruas da cidade']], b:[['Ajuda de combustível'], ['Ajuda de combustível', 'Lanche no serviço']], p:[['Tem CNH categoria A?', 'Tem moto própria?']]},
    bicicleta:{d:['Precisamos de entregador(a) de bicicleta para pedidos perto da loja. A bicicleta e a caixa de entrega são da empresa.'],
      a:['Fazer as entregas perto da loja', 'Conferir o pedido com o cliente', 'Receber o pagamento na entrega', 'Cuidar da bicicleta'],
      r:[[]], x:[['Conhecer as ruas da cidade']], b:[['Lanche no serviço']], p:[['Pode trabalhar das 9h às 14h?']]},
    garcom:{d:['Vaga para atender as mesas {turno}. O trabalho é anotar os pedidos, servir e fechar a conta. Ensinamos o cardápio e o sistema.',
        'Precisamos de garçom ou garçonete {lugar}. O movimento é maior nos fins de semana.'],
      a:['Atender as mesas e anotar os pedidos', 'Servir pratos e bebidas', 'Fechar a conta e receber', 'Arrumar o salão'],
      r:[[]], x:[['Ter trabalhado em restaurante ou bar']], b:[['Gorjeta dividida pela equipe', 'Refeição no serviço'], ['Refeição no serviço']], p:[['Já trabalhou como garçom ou garçonete?'], ['Pode trabalhar aos fins de semana?']]},
    producao:{d:['Vaga na linha de produção {turno}. A pessoa ajuda a preparar, embalar e etiquetar os produtos. Ensinamos cada etapa e damos o uniforme.',
        'Precisamos de reforço na produção para os pedidos de fim de ano. O trabalho é em pé, com pausas, e o ambiente é limpo e organizado.'],
      a:['Ajudar a preparar os produtos', 'Embalar e etiquetar', 'Separar os pedidos', 'Limpar o setor no fim do turno'],
      r:[[], ['Poder trabalhar em pé']], x:[['Ter trabalhado em fábrica']], b:[['Vale-transporte', 'Almoço no serviço'], ['Cesta básica', 'Uniforme']], p:[['Já trabalhou em fábrica?'], ['Pode trabalhar no turno da tarde?']]},
    cuidador:{d:['Vaga de cuidador(a) de idosos na casa de repouso, {horarioMin}. A pessoa ajuda no banho, na alimentação e nos remédios, junto com a enfermagem.'],
      a:['Ajudar no banho e na troca de roupa', 'Acompanhar as refeições', 'Dar os remédios no horário, com a enfermagem', 'Fazer companhia e atividades simples'],
      r:[['Curso de cuidador(a) de idosos']], x:[['Ter cuidado de idoso antes']], b:[['Refeição no serviço', 'Vale-transporte']], p:[['Tem curso de cuidador(a)?']]},
    recepcionista:{d:['Vaga de recepção {turno}. A pessoa atende as famílias, marca as visitas e atende o telefone e o WhatsApp.'],
      a:['Atender as famílias e as visitas', 'Atender o telefone e o WhatsApp', 'Organizar a agenda de visitas', 'Arquivar documentos'],
      r:[['Ensino médio completo']], x:[['Saber usar computador']], b:[['Vale-transporte', 'Almoço no serviço']], p:[['Sabe usar computador?']]},
    ajudante:{d:['Vaga de ajudante para carregar e descarregar as entregas. O trabalho é em dupla com o motorista, {horarioMin}.'],
      a:['Carregar e descarregar as mercadorias', 'Conferir a carga com o motorista', 'Organizar o depósito', 'Ajudar nas entregas'],
      r:[['Poder carregar peso']], x:[[]], b:[['Vale-alimentação de R$ 250', 'Almoço no serviço']], p:[['Pode carregar peso?']]},
    estoquista:{d:['Vaga para cuidar do estoque: receber as mercadorias, conferir as notas e manter tudo organizado. O horário é {horario}.'],
      a:['Receber e conferir mercadorias', 'Organizar as prateleiras do estoque', 'Separar os pedidos', 'Avisar o que está acabando'],
      r:[[]], x:[['Ter trabalhado com estoque']], b:[['Vale-transporte'], ['Desconto nas compras']], p:[['Já trabalhou com estoque?']]},
    padeiro:{d:['A padaria começa cedo: o turno é {horario}. Procuramos quem já faça pão francês, pão de queijo e rosca.'],
      a:['Preparar a massa e assar o pão francês', 'Fazer pão de queijo e rosca', 'Controlar a farinha e o fermento', 'Deixar os fornos limpos'],
      r:[['Experiência com pão francês']], x:[['Saber fazer bolo']], b:[['Café da manhã no serviço', 'Adicional noturno na primeira hora']], p:[['Já fez pão francês em padaria?']]},
    acougueiro:{d:['Nosso açougue precisa de mais uma pessoa que já tenha prática com corte e desossa. O horário é {horario}.'],
      a:['Atender no balcão', 'Cortar e desossar carne', 'Montar as bandejas da vitrine', 'Limpar a câmara fria'],
      r:[['Experiência com corte de carne']], x:[['Saber desossar']], b:[['Cesta básica', 'Roupa térmica fornecida']], p:[['Tem experiência com desossa?']]},
    adm:{d:['Vaga no escritório, {horarioMin}. A pessoa lança notas, confere pagamentos e atende fornecedores por telefone e WhatsApp.'],
      a:['Lançar notas e conferir pagamentos', 'Atender fornecedores', 'Organizar documentos', 'Montar planilhas simples'],
      r:[['Ensino médio completo', 'Saber usar computador']], x:[['Saber usar planilha']], b:[['Vale-alimentação de R$ 300', 'Vale-transporte']], p:[['Sabe usar planilha no computador?']]},
    tecenf:{d:['Vaga de técnico(a) de enfermagem para o plantão da noite na casa de repouso. A equipe tem enfermeira responsável e médico que visita duas vezes por semana.'],
      a:['Dar os remédios no horário', 'Medir pressão e glicose', 'Fazer curativos', 'Anotar tudo no prontuário'],
      r:[['Curso técnico de enfermagem', 'Registro no conselho de enfermagem']], x:[['Ter trabalhado com idosos']], b:[['Adicional noturno', 'Refeição no serviço']], p:[['Tem registro no conselho de enfermagem?']]},
    lavador:{d:['Vaga no lava-jato do posto, {horarioMin}. A pessoa lava carros e motos por fora e por dentro e cuida dos produtos.'],
      a:['Lavar carros e motos', 'Aspirar e limpar por dentro', 'Cuidar dos produtos e das máquinas', 'Manter o lava-jato organizado'],
      r:[[]], x:[['Ter trabalhado em lava-jato']], b:[['Comissão por lavagem', 'Uniforme e bota']], p:[['Já trabalhou em lava-jato?']]},
    jardineiro:{d:['Diária de jardinagem no condomínio, às terças e quintas de manhã. A pessoa corta grama, poda e cuida dos canteiros das áreas comuns.'],
      a:['Cortar grama', 'Podar árvores e cercas vivas', 'Cuidar dos canteiros', 'Recolher folhas e galhos'],
      r:[[]], x:[['Ter trabalhado com jardinagem']], b:[['Diária paga no mesmo dia']], p:[['Já trabalhou com jardinagem?']]},
    porteiro:{d:['Vaga de portaria na escala 12x36, das 19h às 7h. A pessoa controla a entrada de moradores, visitas e entregas.'],
      a:['Controlar a entrada de moradores e visitas', 'Receber entregas', 'Fazer a ronda nas áreas comuns', 'Anotar tudo no livro da portaria'],
      r:[['Ensino fundamental completo']], x:[['Curso de porteiro']], b:[['Adicional noturno', 'Vale-transporte']], p:[['Pode trabalhar na escala da noite?']]},
    limpeza:{d:['Vaga de limpeza {turno}, {horarioMin}. O trabalho é limpar e arrumar os ambientes e repor o material de higiene.'],
      a:['Limpar e arrumar os ambientes', 'Limpar banheiros', 'Repor material de higiene', 'Recolher o lixo'],
      r:[[]], x:[['Ter trabalhado com limpeza']], b:[['Vale-transporte', 'Uniforme']], p:[['Já trabalhou com limpeza?']]}
  };
  var SETOR = {caixa:'supermercado', repositor:'supermercado', acougueiro:'supermercado', auxcozinha:'alimentacao', cozinheiro:'alimentacao', pizzaiolo:'alimentacao', merendeiro:'alimentacao',
    garcom:'alimentacao', padeiro:'alimentacao', servgerais:'limpeza', diarista:'limpeza', domestico:'limpeza', limpeza:'limpeza', jardineiro:'limpeza', porteiro:'seguranca',
    motoristaB:'transporte', motoristaC:'transporte', motoristaD:'transporte', motoristaE:'transporte', motoboy:'transporte', bicicleta:'transporte', ajudante:'transporte',
    frentista:'comercio', lavador:'comercio', vendedor:'comercio', estoquista:'comercio', atendente:'comercio', baba:'educacao', cuidador:'saude', tecenf:'saude', recepcionista:'saude',
    producao:'industria', adm:'administrativo'};
  var CNH = {motoristaB:'B', motoristaC:'C', motoristaD:'D', motoristaE:'E', motoboy:'A'};
  var n = 0;
  function V(id, fn, e, titulo, o){
    var m = M[fn], k = n++, em = EMP[e];
    var v = {id:id, titulo:titulo, empresaId:e, setorId:o.setor || (fn === 'atendente' ? ({supermercado:'supermercado', alimentacao:'alimentacao', saude:'saude', transporte:'transporte'}[em.setor] || 'comercio') : SETOR[fn]),
      tipo:o.tipo || 'CLT', turno:o.turno, jornada:o.jornada || 'Integral', horario:o.h, salario:o.sal,
      beneficios:m.b[k % m.b.length].slice(), requisitos:m.r[k % m.r.length].slice(), diferenciais:m.x[k % m.x.length].slice(),
      atividades:m.a.slice(), perguntas:(o.perg || m.p[k % m.p.length]).slice(),
      vagasQtd:o.qtd || 1, semExperiencia:!!o.semExp, pcd:!!o.pcd, publicadaHa:o.pub, urgente:!!o.urg, candidatos:(k * 7) % 23 + 2, status:'aberta',
      cidade:em.cidade, bairro:o.b || em.bairro, exemplo:true};
    if (o.obs) v.salario.obs = o.obs;
    if (CNH[fn]) v.cnh = CNH[fn];
    if (v.semExperiencia) v.requisitos = v.requisitos.filter(function(r){ return !/^Experi|^Ter /.test(r); });
    var d = o.d || m.d[k % m.d.length];
    v.descricao = d.replace('{turno}', TF[v.turno] || '').replace('{lugar}', lugarFrase(v)).replace('{horario}', v.horario.charAt(0).toLowerCase() + v.horario.slice(1))
      .replace('{horarioMin}', v.horario.charAt(0).toLowerCase() + v.horario.slice(1)) + (o.nota ? ' ' + o.nota : '');
    v.publicadaEm = new Date(BASE - v.publicadaHa * 3600000).toISOString();
    D.vagas.push(v);
  }
  // Operador(a) de caixa (8)
  V('v58', 'caixa', 'e23', 'Operador(a) de caixa', {turno:'Manhã', h:'Segunda a sábado, das 7h às 15h20', sal:S(1720, 1850), semExp:1, urg:1, pub:3, nota:'Fica a cinco minutos a pé da praça da Vila Santana.'});
  V('v59', 'caixa', 'e23', 'Operador(a) de caixa', {turno:'Tarde', h:'Segunda a sábado, das 13h às 21h20', sal:S(1720, 1850), semExp:1, pub:20, qtd:2});
  V('v60', 'caixa', 'e24', 'Operador(a) de caixa', {turno:'Comercial', h:'Segunda a sexta, das 8h às 17h, e sábado até as 12h', sal:S(1680), semExp:1, pub:46});
  V('v61', 'caixa', 'e25', 'Operador(a) de caixa', {turno:'Tarde', h:'Segunda a sábado, das 14h às 22h', sal:S(1700, 1800), semExp:1, pub:70});
  V('v62', 'caixa', 'e27', 'Operador(a) de caixa', {turno:'Manhã', h:'Segunda a sábado, das 6h40 às 15h', sal:S(1750), semExp:1, pcd:1, pub:9, nota:'A vaga também é para pessoa com deficiência: o caixa tem altura ajustável.'});
  V('v63', 'caixa', 'e26', 'Operador(a) de caixa', {turno:'Tarde', jornada:'Meio período', h:'Segunda a sábado, das 15h às 20h', sal:S(1050), semExp:1, pub:30, obs:'meio período, 5 horas por dia'});
  V('v64', 'caixa', 'e28', 'Operador(a) de caixa da conveniência', {turno:'Escala 12x36', h:'Escala 12x36, das 19h às 7h', sal:S(1850, 1950), pub:100, setor:'comercio', nota:'Tem adicional noturno e segurança no posto a noite toda.'});
  V('v65', 'caixa', 'e48', 'Operador(a) de caixa', {turno:'Comercial', h:'Segunda a sábado, das 8h às 18h', sal:S(1680, 1750), semExp:1, pub:150, setor:'saude'});
  // Atendente (9)
  V('v66', 'atendente', 'e33', 'Atendente de padaria', {turno:'Manhã', h:'Segunda a sábado, das 5h30 às 13h50', sal:S(1680, 1780), semExp:1, urg:1, pub:5});
  V('v67', 'atendente', 'e33', 'Atendente de padaria', {turno:'Tarde', jornada:'Meio período', h:'Segunda a sexta, das 15h às 20h', sal:S(1000), semExp:1, pub:28, obs:'meio período, 5 horas por dia'});
  V('v68', 'atendente', 'e36', 'Atendente de loja', {turno:'Comercial', h:'Segunda a sexta, das 8h às 18h, e sábado até as 13h', sal:S(1700), semExp:1, pub:52});
  V('v69', 'atendente', 'e35', 'Atendente de lanchonete', {turno:'Noite', h:'Terça a domingo, das 17h às 23h20', sal:S(1650, 1800), semExp:1, pub:12});
  V('v70', 'atendente', 'e48', 'Atendente de farmácia', {turno:'Tarde', h:'Segunda a sábado, das 13h às 21h', sal:S(1700, 1850), pub:80});
  V('v71', 'atendente', 'e34', 'Atendente de pizzaria', {turno:'Noite', jornada:'Meio período', h:'Quinta a domingo, das 18h às 23h', sal:S(1100), semExp:1, pub:36, obs:'meio período, 4 noites por semana'});
  V('v72', 'atendente', 'e29', 'Atendente de loja de conveniência', {turno:'Escala 12x36', h:'Escala 12x36, das 7h às 19h', sal:S(1720, 1800), semExp:1, pub:60});
  V('v73', 'atendente', 'e50', 'Atendente de hortifrúti', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sábado, das 7h às 12h', sal:S(1000, 1100), semExp:1, pub:22, obs:'meio período, 5 horas por dia'});
  V('v74', 'atendente', 'e43', 'Atendente de guichê da rodoviária', {turno:'Manhã', h:'Segunda a sábado, das 6h às 14h20, em escala', sal:S(1750), semExp:1, pub:110, setor:'transporte', d:'Vaga para vender passagens e informar horários no guichê da rodoviária. Ensinamos o sistema de venda na primeira semana.'});
  // Vendedor(a) (6)
  V('v75', 'vendedor', 'e36', 'Vendedor(a) de loja', {turno:'Comercial', h:'Segunda a sexta, das 8h às 18h, e sábado até as 13h', sal:S(1700, 2600), obs:'com comissão, ganho médio', pub:18});
  V('v76', 'vendedor', 'e37', 'Vendedor(a) de loja', {turno:'Comercial', h:'Segunda a sábado, das 8h às 18h', sal:S(1650, 2300), obs:'com comissão, ganho médio', semExp:1, pub:40});
  V('v77', 'vendedor', 'e49', 'Vendedor(a) de celulares', {turno:'Comercial', h:'Segunda a sábado, das 9h às 19h', sal:S(1800, 3000), obs:'com comissão, ganho médio', pub:7});
  V('v78', 'vendedor', 'e44', 'Vendedor(a) interno(a) de bebidas', {turno:'Comercial', h:'Segunda a sexta, das 8h às 18h', sal:S(2000, 2800), obs:'com comissão, ganho médio', pub:90, setor:'vendas', d:'Vaga para vender por telefone e WhatsApp para os mercados e bares da região. A carteira de clientes já existe: a pessoa liga, tira o pedido e acompanha a entrega.'});
  V('v79', 'vendedor', 'e37', 'Vendedor(a) temporário(a) de Natal', {tipo:'Temporário', turno:'Comercial', h:'Até 31/12, de segunda a sábado, das 9h às 21h', sal:S(1700), semExp:1, urg:1, pub:4, d:'Vaga temporária para o movimento de Natal. A pessoa atende no salão, embrulha presentes e ajuda no caixa quando a fila cresce.'});
  V('v80', 'vendedor', 'e36', 'Vendedor(a) de calçados', {turno:'Tarde', h:'Segunda a sábado, das 12h às 20h', sal:S(1700, 2400), obs:'com comissão, ganho médio', semExp:1, pub:130});
  // Auxiliar de cozinha (8)
  V('v81', 'auxcozinha', 'e32', 'Auxiliar de cozinha', {turno:'Manhã', h:'Segunda a sábado, das 6h às 14h20', sal:S(1700), semExp:1, urg:1, pub:2});
  V('v82', 'auxcozinha', 'e32', 'Auxiliar de cozinha', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sexta, das 10h às 15h', sal:S(1050), semExp:1, pub:26, obs:'meio período, 5 horas por dia', nota:'É o horário do almoço, que é quando a cozinha mais precisa de ajuda.'});
  V('v83', 'auxcozinha', 'e33', 'Auxiliar de cozinha', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sábado, das 5h às 10h', sal:S(1000), semExp:1, pub:44, obs:'meio período, 5 horas por dia'});
  V('v84', 'auxcozinha', 'e34', 'Auxiliar de cozinha', {turno:'Noite', h:'Terça a domingo, das 17h às 0h', sal:S(1680, 1750), semExp:1, pub:58});
  V('v85', 'auxcozinha', 'e35', 'Auxiliar de cozinha', {turno:'Tarde', h:'Terça a domingo, das 15h às 23h', sal:S(1650), semExp:1, pub:96});
  V('v86', 'auxcozinha', 'e22', 'Auxiliar de cozinha', {turno:'Manhã', h:'Escala 6x1, das 5h às 13h20', sal:S(1700, 1800), semExp:1, pub:120, setor:'hotelaria', d:'A cozinha do hotel serve café da manhã e almoço. A pessoa ajuda a montar o café, prepara saladas e cuida da louça.'});
  V('v87', 'auxcozinha', 'e45', 'Auxiliar de cozinha', {turno:'Escala 12x36', h:'Escala 12x36, das 6h às 18h', sal:S(1750), semExp:1, pub:34});
  V('v88', 'auxcozinha', 'e25', 'Auxiliar de cozinha da rotisseria', {turno:'Manhã', h:'Segunda a sábado, das 7h às 15h20', sal:S(1700), semExp:1, pub:160, setor:'supermercado', d:'A rotisseria do supermercado faz frango assado, lasanha e saladas para o almoço. A pessoa ajuda no preparo e no balcão.'});
  // Cozinha (4)
  V('v89', 'cozinheiro', 'e32', 'Cozinheiro(a)', {turno:'Manhã', h:'Segunda a sábado, das 6h às 14h20', sal:S(2100, 2400), pub:15});
  V('v90', 'cozinheiro', 'e45', 'Cozinheiro(a)', {turno:'Comercial', h:'Segunda a sexta, das 7h às 16h', sal:S(2000, 2200), pub:75, setor:'saude'});
  V('v91', 'pizzaiolo', 'e34', 'Pizzaiolo(a)', {tipo:'Diária', jornada:'Diária', turno:'Noite', h:'Quinta a domingo, das 17h às 0h', sal:S(130, 160, 'dia'), pub:50});
  V('v92', 'merendeiro', 'e46', 'Merendeiro(a)', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sexta, das 6h30 às 11h30', sal:S(1100), semExp:1, pub:64, obs:'meio período, 5 horas por dia', setor:'educacao'});
  // Serviços gerais (9)
  V('v93', 'servgerais', 'e40', 'Auxiliar de serviços gerais', {turno:'Comercial', h:'Segunda a sexta, das 7h às 16h', sal:S(1700), semExp:1, pub:8});
  V('v94', 'servgerais', 'e41', 'Auxiliar de serviços gerais', {turno:'Manhã', h:'Segunda a sábado, das 6h às 14h20', sal:S(1680), semExp:1, pcd:1, pub:16});
  V('v95', 'servgerais', 'e41', 'Auxiliar de serviços gerais', {turno:'Tarde', jornada:'Meio período', h:'Segunda a sexta, das 13h às 17h', sal:S(980), semExp:1, pub:54, obs:'meio período, 4 horas por dia'});
  V('v96', 'servgerais', 'e46', 'Auxiliar de serviços gerais', {turno:'Tarde', h:'Segunda a sexta, das 11h às 20h', sal:S(1650), semExp:1, pub:88});
  V('v97', 'servgerais', 'e45', 'Auxiliar de serviços gerais', {turno:'Escala 12x36', h:'Escala 12x36, das 7h às 19h', sal:S(1720), semExp:1, pub:42});
  V('v98', 'servgerais', 'e23', 'Auxiliar de serviços gerais', {turno:'Manhã', h:'Segunda a sábado, das 6h às 14h20', sal:S(1680), semExp:1, pub:100});
  V('v99', 'servgerais', 'e43', 'Auxiliar de serviços gerais da garagem', {turno:'Noite', h:'Segunda a sexta, das 22h às 6h', sal:S(1800, 1900), semExp:1, pub:140, d:'Vaga para limpar os ônibus na garagem durante a noite, por dentro e por fora. Tem adicional noturno.'});
  V('v100', 'servgerais', 'e47', 'Auxiliar de serviços gerais', {turno:'Comercial', h:'Segunda a sexta, das 7h às 17h', sal:S(1700), semExp:1, pcd:1, pub:190});
  V('v101', 'servgerais', 'e51', 'Auxiliar de serviços gerais', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sexta, das 7h às 11h', sal:S(950), semExp:1, pub:72, obs:'meio período, 4 horas por dia'});
  // Motorista (8)
  V('v102', 'motoristaB', 'e42', 'Motorista entregador(a)', {turno:'Comercial', h:'Segunda a sábado, das 8h às 17h', sal:S(1900, 2100), urg:1, pub:6});
  V('v103', 'motoristaD', 'e43', 'Motorista de ônibus da linha rural', {turno:'Manhã', h:'Segunda a sexta, das 5h às 13h', sal:S(3200, 3500), pub:24, nota:'A linha passa pelos distritos e pelas fazendas da região.'});
  V('v104', 'motoristaD', 'e43', 'Motorista de ônibus intermunicipal', {turno:'Escala 12x36', h:'Escala de revezamento, viagens de Uruaçu a Goiânia', sal:S(3800, 4200), pub:84});
  V('v105', 'motoristaE', 'e44', 'Motorista de caminhão', {turno:'Comercial', h:'Segunda a sábado, com viagens durante a semana', sal:S(3000, 3400), pub:32});
  V('v106', 'motoristaD', 'e46', 'Motorista de van escolar', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sexta, das 6h às 7h30 e das 11h às 13h30', sal:S(1600, 1800), pub:66, obs:'meio período, 4 horas por dia', d:'O colégio precisa de motorista para a van que busca e leva os alunos da zona rural. São duas rotas por dia.'});
  V('v107', 'motoristaC', 'e25', 'Motorista de caminhão baú', {turno:'Manhã', h:'Segunda a sábado, das 6h às 15h', sal:S(2600, 2900), pub:102});
  V('v108', 'motoristaB', 'e44', 'Motorista entregador(a) de água e gás', {turno:'Comercial', h:'Segunda a sábado, das 7h às 17h', sal:S(2000, 2300), pub:12});
  V('v109', 'motoristaB', 'e50', 'Motorista entregador(a) de hortifrúti', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sábado, das 5h às 10h', sal:S(1300), pub:38, obs:'meio período, 5 horas por dia'});
  // Repositor(a) (7)
  V('v110', 'repositor', 'e23', 'Repositor(a) de mercadorias', {turno:'Manhã', h:'Segunda a sábado, das 6h às 14h20', sal:S(1680), semExp:1, pub:10});
  V('v111', 'repositor', 'e24', 'Repositor(a) de mercadorias', {turno:'Tarde', h:'Segunda a sábado, das 13h às 21h20', sal:S(1680), semExp:1, pub:48});
  V('v112', 'repositor', 'e25', 'Repositor(a) de mercadorias', {turno:'Manhã', h:'Segunda a sábado, das 6h às 14h20', sal:S(1650, 1700), semExp:1, pcd:1, pub:78});
  V('v113', 'repositor', 'e27', 'Repositor(a) de mercadorias', {turno:'Noite', h:'Segunda a sexta, das 21h às 5h', sal:S(1900, 2000), semExp:1, pub:56, nota:'Tem adicional noturno.'});
  V('v114', 'repositor', 'e50', 'Repositor(a) de hortifrúti', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sábado, das 6h às 11h', sal:S(1000), semExp:1, pub:14, obs:'meio período, 5 horas por dia'});
  V('v115', 'repositor', 'e44', 'Repositor(a) de bebidas', {turno:'Comercial', h:'Segunda a sexta, das 8h às 17h, em mercados da região', sal:S(1800), semExp:1, pub:118, d:'Vaga para repor as bebidas da distribuidora nos mercados da região, com carro da empresa e motorista.'});
  V('v116', 'repositor', 'e24', 'Repositor(a) de fim de semana', {tipo:'Diária', jornada:'Fim de semana', turno:'Fim de semana', h:'Sábados e domingos, das 7h às 15h', sal:S(120, 'dia'), semExp:1, pub:4});
  // Diarista e trabalho doméstico (7)
  V('v117', 'diarista', 'e38', 'Diarista', {tipo:'Diária', jornada:'Diária', turno:'Comercial', h:'Terças e sextas, das 8h às 16h', sal:S(150, 'dia'), semExp:1, pub:3, b:'Setor Sul'});
  V('v118', 'diarista', 'e38', 'Diarista', {tipo:'Diária', jornada:'Diária', turno:'Comercial', h:'Segundas, quartas e sextas, das 8h às 16h', sal:S(160, 'dia'), pub:21, b:'Jardim Goiás'});
  V('v119', 'diarista', 'e38', 'Diarista de sábado', {tipo:'Diária', jornada:'Diária', turno:'Fim de semana', h:'Sábados, das 7h às 13h', sal:S(120, 'dia'), semExp:1, pub:40, b:'Vila Santana'});
  V('v120', 'domestico', 'e38', 'Empregado(a) doméstico(a)', {turno:'Comercial', h:'Segunda a sexta, das 8h às 17h', sal:S(1650, 1750), pub:30, b:'Setor Central'});
  V('v121', 'domestico', 'e51', 'Empregado(a) doméstico(a)', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sexta, das 7h às 12h', sal:S(1000), semExp:1, pub:60, obs:'meio período, 5 horas por dia'});
  V('v122', 'diarista', 'e41', 'Diarista', {tipo:'Diária', jornada:'Diária', turno:'Comercial', h:'Às quintas, a cada 15 dias, das 8h às 16h', sal:S(150, 'dia'), pub:90});
  V('v123', 'limpeza', 'e38', 'Auxiliar de limpeza residencial', {turno:'Tarde', jornada:'Meio período', h:'Segunda a sexta, das 13h às 17h', sal:S(980), semExp:1, pub:76, b:'Vila Nova', obs:'meio período, 4 horas por dia'});
  // Frentista (6)
  V('v124', 'frentista', 'e28', 'Frentista', {turno:'Manhã', h:'Escala 6x1, das 6h às 14h20', sal:S(1750, 1850), semExp:1, urg:1, pub:5});
  V('v125', 'frentista', 'e28', 'Frentista', {turno:'Escala 12x36', h:'Escala 12x36, das 19h às 7h', sal:S(1950, 2100), pub:50});
  V('v126', 'frentista', 'e29', 'Frentista', {turno:'Tarde', h:'Escala 6x1, das 14h às 22h20', sal:S(1750, 1850), semExp:1, pub:32});
  V('v127', 'frentista', 'e30', 'Frentista', {turno:'Manhã', h:'Escala 6x1, das 6h às 14h20', sal:S(1700, 1800), semExp:1, pub:18});
  V('v128', 'frentista', 'e30', 'Frentista', {turno:'Noite', h:'Escala 6x1, das 22h às 6h', sal:S(1900, 2000), pub:18});
  V('v129', 'frentista', 'e31', 'Frentista', {turno:'Escala 12x36', h:'Escala 12x36, das 7h às 19h', sal:S(1800, 1900), semExp:1, pub:96});
  // Babá (5)
  V('v130', 'baba', 'e39', 'Babá', {turno:'Comercial', h:'Segunda a sexta, das 7h às 17h', sal:S(1700, 1900), pub:7});
  V('v131', 'baba', 'e39', 'Babá', {turno:'Tarde', jornada:'Meio período', h:'Segunda a sexta, das 13h às 18h', sal:S(1100, 1200), semExp:1, pub:28, obs:'meio período, 5 horas por dia'});
  V('v132', 'baba', 'e39', 'Babá de fim de semana', {tipo:'Diária', jornada:'Fim de semana', turno:'Fim de semana', h:'Sábados e domingos, das 8h às 18h', sal:S(140, 'dia'), pub:44});
  V('v133', 'baba', 'e38', 'Babá', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sexta, das 7h às 12h', sal:S(1000, 1100), semExp:1, pub:66, b:'Francisco Martins', obs:'meio período, 5 horas por dia'});
  V('v134', 'baba', 'e51', 'Babá', {turno:'Comercial', h:'Segunda a sexta, das 8h às 17h', sal:S(1650, 1800), pub:110});
  // Entregas (4)
  V('v135', 'motoboy', 'e35', 'Motoboy entregador(a)', {tipo:'Freelancer', jornada:'Meio período', turno:'Noite', h:'Terça a domingo, das 18h às 23h', sal:S(80, 120, 'dia'), obs:'fixo por noite mais taxa por entrega', pub:20});
  V('v136', 'motoboy', 'e48', 'Motoboy entregador(a)', {turno:'Comercial', h:'Segunda a sábado, das 8h às 18h', sal:S(1800, 2000), pub:46, setor:'saude'});
  V('v137', 'motoboy', 'e33', 'Motoboy entregador(a)', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sábado, das 6h às 11h', sal:S(1100), pub:58, obs:'meio período, 5 horas por dia'});
  V('v138', 'bicicleta', 'e42', 'Entregador(a) de bicicleta', {turno:'Comercial', jornada:'Meio período', h:'Segunda a sexta, das 9h às 14h', sal:S(950), semExp:1, pub:86, obs:'meio período, 5 horas por dia'});
  // Outras funções
  V('v139', 'garcom', 'e32', 'Garçom ou garçonete', {turno:'Comercial', h:'Segunda a sábado, das 9h às 17h20', sal:S(1700, 1850), semExp:1, pub:11});
  V('v140', 'garcom', 'e35', 'Garçom ou garçonete de fim de semana', {tipo:'Diária', jornada:'Fim de semana', turno:'Fim de semana', h:'Sextas, sábados e domingos, das 18h às 0h', sal:S(110, 'dia'), semExp:1, pub:33});
  V('v141', 'garcom', 'e22', 'Garçom ou garçonete', {turno:'Noite', h:'Segunda a sábado, das 17h às 23h20', sal:S(1700), semExp:1, pub:70, setor:'hotelaria'});
  V('v142', 'producao', 'e47', 'Auxiliar de produção', {turno:'Manhã', h:'Segunda a sexta, das 6h às 15h', sal:S(1720, 1800), semExp:1, pcd:1, pub:9});
  V('v143', 'producao', 'e47', 'Auxiliar de produção na embalagem', {turno:'Tarde', h:'Segunda a sexta, das 14h às 23h', sal:S(1750, 1850), semExp:1, pub:52});
  V('v144', 'producao', 'e21', 'Ajudante de produção', {turno:'Comercial', h:'Segunda a sexta, das 7h às 17h', sal:S(1700), semExp:1, pub:130});
  V('v145', 'cuidador', 'e45', 'Cuidador(a) de idosos', {turno:'Escala 12x36', h:'Escala 12x36, das 7h às 19h', sal:S(1800, 1950), pub:13, qtd:2});
  V('v146', 'cuidador', 'e45', 'Cuidador(a) de idosos da noite', {turno:'Noite', h:'Escala 12x36, das 19h às 7h', sal:S(1900, 2050), pub:13});
  V('v147', 'recepcionista', 'e45', 'Recepcionista', {turno:'Comercial', h:'Segunda a sexta, das 8h às 17h', sal:S(1700, 1800), semExp:1, pub:80});
  V('v148', 'ajudante', 'e44', 'Ajudante de entregas', {turno:'Comercial', h:'Segunda a sábado, das 7h às 16h', sal:S(1650, 1750), semExp:1, pub:26});
  V('v149', 'ajudante', 'e42', 'Ajudante de carga e descarga', {turno:'Manhã', h:'Segunda a sábado, das 6h às 14h20', sal:S(1700), semExp:1, pub:62});
  V('v150', 'estoquista', 'e36', 'Estoquista', {turno:'Comercial', h:'Segunda a sábado, das 8h às 17h', sal:S(1700), semExp:1, pub:70});
  V('v151', 'estoquista', 'e49', 'Estoquista', {turno:'Tarde', jornada:'Meio período', h:'Segunda a sábado, das 14h às 19h', sal:S(1000), semExp:1, pub:100, obs:'meio período, 5 horas por dia'});
  V('v152', 'padeiro', 'e33', 'Padeiro(a)', {turno:'Manhã', h:'Segunda a sábado, das 3h30 às 11h50', sal:S(2200, 2500), pub:40});
  V('v153', 'acougueiro', 'e24', 'Açougueiro(a)', {turno:'Comercial', h:'Segunda a sábado, das 7h às 15h20', sal:S(2300, 2700), pub:92});
  V('v154', 'adm', 'e44', 'Auxiliar administrativo(a)', {turno:'Comercial', h:'Segunda a sexta, das 8h às 18h', sal:S(1800, 2000), pub:36});
  V('v155', 'adm', 'e43', 'Auxiliar administrativo(a)', {turno:'Comercial', h:'Segunda a sexta, das 8h às 17h', sal:S(1850), pub:144});
  V('v156', 'tecenf', 'e45', 'Técnico(a) de enfermagem', {turno:'Escala 12x36', h:'Escala 12x36, das 19h às 7h', sal:S(2300, 2500), pub:22});
  V('v157', 'lavador', 'e29', 'Lavador(a) de carros', {turno:'Comercial', h:'Segunda a sábado, das 8h às 17h', sal:S(1650, 1800), obs:'com comissão, ganho médio', semExp:1, pub:54});
  V('v158', 'jardineiro', 'e40', 'Jardineiro(a)', {tipo:'Diária', jornada:'Diária', turno:'Manhã', h:'Terças e quintas, das 7h às 12h', sal:S(130, 'dia'), pub:120});
  V('v159', 'porteiro', 'e40', 'Porteiro(a) de condomínio', {turno:'Escala 12x36', h:'Escala 12x36, das 19h às 7h', sal:S(1850, 1950), pub:66});
  V('v160', 'limpeza', 'e22', 'Auxiliar de limpeza', {turno:'Manhã', h:'Escala 6x1, das 7h às 15h20', sal:S(1680), semExp:1, pub:30, setor:'hotelaria'});
  V('v161', 'limpeza', 'e27', 'Auxiliar de limpeza', {turno:'Manhã', jornada:'Meio período', h:'Segunda a sábado, das 6h às 10h', sal:S(950), semExp:1, pub:84, obs:'meio período, 4 horas por dia', setor:'supermercado'});

  /* ---------- jornada nas vagas antigas (as novas já vêm com ela) ---------- */
  function horas(h){
    var m = String(h).replace(/meia-noite/g, '0h').match(/das (\d{1,2})h(\d{2})? (?:às|à|as) (\d{1,2})h(\d{2})?/);
    if (!m) return null;
    var a = +m[1] + (+m[2] || 0) / 60, b = +m[3] + (+m[4] || 0) / 60;
    return (b - a + 24) % 24 || 24;
  }
  D.vagas.forEach(function(v){
    if (!v.cnh){ var c = (v.requisitos || []).join(' ').match(/CNH\s*(?:categoria\s*)?([A-E])\b/); if (c) v.cnh = c[1]; }
    if (v.jornada) return;
    if (v.tipo === 'Diária') v.jornada = 'Diária';
    else if (v.turno === 'Fim de semana') v.jornada = 'Fim de semana';
    else { var hh = horas(v.horario); v.jornada = hh && hh <= 6.4 ? 'Meio período' : 'Integral'; }
  });
})(window.VSC_DADOS);
