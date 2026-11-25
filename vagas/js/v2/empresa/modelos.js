/* Modelos de vaga por função (conteúdo fixo, escrito para o Vagas sem Caos).
   Cada modelo traz descrição, tarefas, o que precisa e até 3 perguntas de sim ou não. Nunca traz salário: o valor é sempre da empresa.
   Os textos passam no filtro de texto da vaga (sem telefone, link, cobrança, pedido de documento ou exigência de sexo, idade ou aparência).
   Uso: VSC_MODELOS.lista, VSC_MODELOS.achar(texto), VSC_MODELOS.sugerir(texto, max), VSC_MODELOS.chave(titulo). */
(function (root) {
  'use strict';

  function M(id, titulo, termos, setorId, tipo, turno, horario, descricao, atividades, requisitos, perguntas, semExp) {
    return { id: id, titulo: titulo, termos: termos, setorId: setorId, tipo: tipo, turno: turno, horario: horario,
      descricao: descricao, atividades: atividades, requisitos: requisitos, perguntas: perguntas, semExperiencia: !!semExp };
  }

  var LISTA = [
    M('caixa', 'Caixa', ['operador de caixa', 'operadora de caixa', 'caixa de loja'], 'caixa', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Procuramos pessoa para trabalhar no caixa da nossa loja. O dia a dia é atender quem chega, registrar as compras, receber em dinheiro, cartão e Pix e fechar o caixa no fim do turno. Quem tem prática ou quer aprender, com treinamento no começo, também pode se candidatar.',
      ['Registrar as compras e receber o pagamento', 'Conferir o troco e o valor do caixa', 'Atender com educação quem está na fila', 'Fechar o caixa no fim do turno'],
      ['Ter prática com caixa ou querer aprender'], ['Já trabalhou em caixa?', 'Pode trabalhar aos sábados?'], true),
    M('atendente', 'Atendente', ['atendimento', 'atendente de loja', 'atendente de balcao'], 'atendimento', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Vaga de atendente para receber quem chega, tirar dúvidas, anotar pedidos e ajudar a manter o espaço organizado. O treinamento é feito no começo, junto com a equipe. É importante ter boa comunicação e vontade de aprender.',
      ['Receber e orientar quem chega', 'Anotar pedidos e passar para o setor', 'Manter o balcão organizado', 'Ajudar a equipe no que for preciso'],
      ['Saber ler e escrever bem'], ['Já trabalhou com atendimento ao público?', 'Pode trabalhar aos sábados?'], true),
    M('vendedor', 'Vendedor(a)', ['vendedor', 'vendedora', 'vendas', 'vendedor de loja'], 'vendas-loja', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Procuramos vendedor ou vendedora para atender os clientes na loja, apresentar os produtos e fechar as vendas. A pessoa também ajuda a organizar a vitrine e as prateleiras. Quem gosta de conversar e tem vontade de crescer aprende rápido aqui.',
      ['Atender e apresentar os produtos', 'Fechar a venda e registrar o pedido', 'Organizar a vitrine e as prateleiras', 'Avisar quando um produto estiver acabando'],
      ['Gostar de atender pessoas'], ['Já trabalhou com vendas?', 'Pode trabalhar aos sábados?'], true),
    M('balconista', 'Balconista', ['balconista de loja', 'balcao'], 'comercio', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Vaga de balconista para atender no balcão, separar os produtos pedidos e manter tudo em ordem. A pessoa aprende o catálogo da loja com a equipe e conta com treinamento no começo.',
      ['Atender no balcão e separar os produtos', 'Informar os valores e as condições', 'Organizar o estoque do balcão', 'Receber as mercadorias que chegam'],
      ['Saber fazer contas simples'], ['Já trabalhou como balconista?', 'Pode começar logo?'], true),
    M('repositor', 'Repositor(a)', ['repositor', 'reposicao', 'repositora', 'reposicao de mercadoria'], 'supermercado', 'Carteira assinada', 'Manhã', 'Segunda a sábado, a partir das 6h',
      'Procuramos repositor ou repositora para abastecer as prateleiras, conferir validade e manter os corredores organizados. O trabalho começa cedo e exige disposição para carregar caixas e ficar em pé.',
      ['Abastecer as prateleiras com as mercadorias', 'Conferir a validade dos produtos', 'Etiquetar e organizar os corredores', 'Ajudar a descarregar as entregas'],
      ['Disposição para carregar peso'], ['Pode começar às 6h da manhã?', 'Já trabalhou com reposição?'], true),
    M('empacotador', 'Empacotador(a)', ['empacotador', 'empacotadora', 'embalador'], 'supermercado', 'Carteira assinada', 'Tarde', 'Segunda a sexta, no período da tarde',
      'Vaga de empacotador ou empacotadora para ajudar a embalar as compras no caixa, organizar os carrinhos e manter o espaço limpo. É um bom começo para quem quer o primeiro emprego e aprender o dia a dia de um mercado.',
      ['Embalar as compras com cuidado', 'Organizar os carrinhos e cestas', 'Repor sacolas nos caixas', 'Ajudar quem precisa levar as compras'],
      [], ['Pode trabalhar à tarde?'], true),
    M('acougueiro', 'Açougueiro(a)', ['acougueiro', 'acougueira', 'cortador de carne'], 'supermercado', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Procuramos açougueiro ou açougueira para cortar, preparar e atender no balcão de carnes. É preciso ter prática com facas e cuidado com a higiene e a conservação dos produtos.',
      ['Cortar e porcionar as carnes', 'Atender os clientes no balcão', 'Manter a bancada e as facas limpas', 'Conferir a temperatura e a validade'],
      ['Ter prática em açougue'], ['Já trabalhou em açougue?', 'Sabe desossar?'], false),
    M('padeiro', 'Padeiro(a)', ['padeiro', 'padeira', 'ajudante de padaria', 'confeiteiro'], 'alimentacao', 'Carteira assinada', 'Manhã', 'Segunda a sábado, começando de madrugada',
      'Vaga de padeiro ou padeira para preparar pães, salgados e bolos. O turno começa de madrugada para que tudo esteja quentinho na abertura. Quem já tem prática com massa e forno é bem-vindo.',
      ['Preparar as massas e assar os pães', 'Organizar a produção do dia', 'Manter o forno e a bancada limpos', 'Controlar o que sobra e o que falta'],
      ['Ter prática com panificação'], ['Já trabalhou em padaria?', 'Pode começar de madrugada?'], false),
    M('cozinheiro', 'Cozinheiro(a)', ['cozinheiro', 'cozinheira', 'cozinha', 'cozinha industrial'], 'cozinha', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Procuramos cozinheiro ou cozinheira para preparar as refeições do dia com capricho e cuidado com a higiene. A pessoa organiza a produção, confere os ingredientes e trabalha junto com o auxiliar de cozinha.',
      ['Preparar as refeições do cardápio', 'Conferir os ingredientes e a validade', 'Organizar a produção do dia', 'Manter a cozinha limpa e em ordem'],
      ['Ter prática com comida caseira ou em restaurante'], ['Já trabalhou como cozinheiro(a)?', 'Pode trabalhar aos fins de semana?'], false),
    M('auxiliar-cozinha', 'Auxiliar de cozinha', ['ajudante de cozinha', 'auxiliar de cozinha', 'copeiro'], 'cozinha', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Vaga de auxiliar de cozinha para ajudar no preparo das refeições: lavar, cortar e separar os ingredientes, montar os pratos e deixar a cozinha limpa. Quem quer aprender o ofício e tem disposição vai bem.',
      ['Lavar, cortar e separar os ingredientes', 'Ajudar a montar os pratos', 'Lavar as louças e os utensílios', 'Manter a cozinha limpa'],
      [], ['Já trabalhou em cozinha?', 'Pode trabalhar aos fins de semana?'], true),
    M('garcom', 'Garçom ou garçonete', ['garcom', 'garconete', 'garcon', 'atendente de mesa'], 'alimentacao', 'Carteira assinada', 'Noite', 'Quarta a domingo, à noite',
      'Procuramos garçom ou garçonete para atender as mesas, anotar os pedidos e levar os pratos com atenção. O movimento é maior à noite e nos fins de semana. A pessoa trabalha em equipe e aprende o cardápio no começo.',
      ['Receber e acomodar os clientes', 'Anotar os pedidos e levar à cozinha', 'Servir as mesas', 'Fechar a conta e organizar o salão'],
      ['Ter paciência e boa comunicação'], ['Já trabalhou como garçom ou garçonete?', 'Pode trabalhar à noite?'], true),
    M('chapeiro', 'Chapeiro(a)', ['chapeiro', 'chapeira', 'lanchonete', 'hamburgueiro'], 'alimentacao', 'Carteira assinada', 'Noite', 'Terça a domingo, à noite',
      'Vaga de chapeiro ou chapeira para preparar lanches na chapa, montar os pedidos e manter a bancada limpa. O ritmo é rápido nos horários de pico e é importante cuidar da higiene.',
      ['Preparar os lanches na chapa', 'Montar os pedidos com capricho', 'Manter a chapa e a bancada limpas', 'Avisar quando faltar ingrediente'],
      ['Ter prática em lanchonete'], ['Já trabalhou em lanchonete?', 'Pode trabalhar à noite?'], false),
    M('servicos-gerais', 'Auxiliar de serviços gerais', ['servicos gerais', 'asg', 'auxiliar de servicos gerais', 'zelador'], 'limpeza', 'Carteira assinada', 'Comercial', 'Segunda a sexta, em horário comercial',
      'Procuramos auxiliar de serviços gerais para cuidar da limpeza e da organização do local de trabalho, além de ajudar em pequenas tarefas do dia a dia. É uma vaga para quem é caprichoso e gosta de deixar tudo em ordem.',
      ['Limpar salas, banheiros e áreas comuns', 'Repor material de limpeza e de uso comum', 'Recolher e separar o lixo', 'Ajudar em pequenas tarefas da equipe'],
      [], ['Já trabalhou com limpeza?', 'Pode começar logo?'], true),
    M('auxiliar-limpeza', 'Auxiliar de limpeza', ['limpeza', 'faxineiro', 'faxineira', 'auxiliar de limpeza'], 'limpeza', 'Carteira assinada', 'Comercial', 'Segunda a sexta, em horário comercial',
      'Vaga de auxiliar de limpeza para cuidar da limpeza de escritórios, lojas ou escolas. A pessoa recebe orientação sobre os produtos e os horários de cada área.',
      ['Varrer, passar pano e limpar superfícies', 'Limpar banheiros e repor materiais', 'Recolher o lixo', 'Avisar quando faltar material'],
      [], ['Já trabalhou com limpeza?', 'Pode trabalhar em locais diferentes?'], true),
    M('diarista', 'Diarista', ['diarista', 'faxina', 'faxina por dia', 'domestica'], 'domesticos', 'Diária', 'Comercial', '',
      'Procuramos diarista para a limpeza completa de uma casa em um dia combinado. A pessoa cuida de pisos, banheiros, cozinha e quartos e deixa tudo em ordem. Se der certo, o serviço pode se repetir toda semana.',
      ['Limpar cômodos, pisos e banheiros', 'Lavar louça e organizar a cozinha', 'Trocar roupa de cama quando pedido', 'Deixar a casa em ordem no fim do dia'],
      ['Ter experiência com limpeza de casa'], ['Já trabalhou como diarista?', 'Pode repetir toda semana?'], true),
    M('motorista', 'Motorista', ['motorista', 'motorista de caminhao', 'motorista de van', 'motorista entregador'], 'motorista', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Vaga de motorista para fazer entregas e rotas combinadas. A pessoa cuida do veículo, confere a carga e cumpre os horários com segurança. É preciso ter a habilitação na categoria do veículo e conhecer bem as ruas da região.',
      ['Fazer as entregas e rotas do dia', 'Conferir a carga na saída e na chegada', 'Cuidar da limpeza e da manutenção básica do veículo', 'Registrar as entregas feitas'],
      ['CNH na categoria do veículo', 'Conhecer bem a cidade e a região'], ['Tem CNH na categoria exigida?', 'Já trabalhou como motorista?'], false),
    M('motoboy', 'Motoboy', ['motoboy', 'entregador', 'entregador de moto', 'moto entregador'], 'logistica', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Procuramos motoboy para fazer entregas na cidade. A pessoa recebe os pedidos, confere as informações do endereço e entrega com cuidado e dentro do prazo. É preciso ter CNH A e conhecer bem os bairros.',
      ['Retirar e entregar os pedidos', 'Conferir o endereço e o pedido antes de sair', 'Cuidar da moto e do capacete', 'Avisar a loja sobre qualquer problema na entrega'],
      ['CNH categoria A', 'Moto em boas condições'], ['Tem CNH A?', 'Tem moto própria?'], false),
    M('ajudante-motorista', 'Ajudante de motorista', ['ajudante de caminhao', 'ajudante de entrega', 'ajudante de carga'], 'logistica', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Vaga de ajudante de motorista para acompanhar as rotas de entrega, carregar e descarregar mercadorias e conferir as notas. É preciso ter disposição para trabalhar em pé e carregar peso.',
      ['Carregar e descarregar as mercadorias', 'Conferir os pedidos com o motorista', 'Entregar e colher a assinatura do cliente', 'Manter o baú organizado'],
      ['Disposição para carregar peso'], ['Pode carregar peso?', 'Já trabalhou com entregas?'], true),
    M('auxiliar-administrativo', 'Auxiliar administrativo', ['administrativo', 'auxiliar de escritorio', 'assistente administrativo', 'office'], 'administrativo', 'Carteira assinada', 'Comercial', 'Segunda a sexta, em horário comercial',
      'Procuramos auxiliar administrativo para ajudar na rotina do escritório: atender ligações, organizar pastas e arquivos, lançar informações em planilhas e apoiar a equipe. É importante ter organização e noções de computador.',
      ['Atender ligações e mensagens', 'Organizar pastas e arquivos', 'Lançar informações em planilhas', 'Apoiar a equipe nas tarefas do dia'],
      ['Ensino médio completo', 'Noções de computador'], ['Sabe usar planilha no computador?', 'Já trabalhou em escritório?'], true),
    M('recepcionista', 'Recepcionista', ['recepcao', 'recepcionista de clinica', 'recepcionista de consultorio'], 'atendimento', 'Carteira assinada', 'Comercial', 'Segunda a sexta, em horário comercial',
      'Vaga de recepcionista para receber as pessoas, atender o telefone, organizar a agenda e orientar quem chega. É importante ter boa comunicação, paciência e noções de computador.',
      ['Receber e orientar quem chega', 'Atender o telefone e as mensagens', 'Organizar a agenda do dia', 'Manter a recepção organizada'],
      ['Noções de computador'], ['Já trabalhou como recepcionista?', 'Sabe usar o computador?'], true),
    M('pedreiro', 'Pedreiro(a)', ['pedreiro', 'pedreira', 'oficial de obras', 'meia colher'], 'construcao', 'Por serviço', 'Comercial', 'Segunda a sexta, no horário da obra',
      'Procuramos pedreiro para trabalhar em obra, levantando paredes, assentando piso e fazendo reboco e acabamentos. É preciso ter experiência em obra e saber ler uma planta simples.',
      ['Levantar paredes e fazer o reboco', 'Assentar piso e revestimentos', 'Ler plantas e medidas simples', 'Manter a área de trabalho organizada'],
      ['Ter experiência em obra'], ['Tem experiência como pedreiro?', 'Tem as próprias ferramentas?'], false),
    M('servente', 'Servente de obras', ['servente', 'servente de pedreiro', 'ajudante de pedreiro'], 'construcao', 'Carteira assinada', 'Comercial', 'Segunda a sexta, no horário da obra',
      'Vaga de servente para ajudar o pedreiro na obra: misturar massa, carregar material, limpar o local e dar apoio nas tarefas do dia. Quem tem disposição e vontade de aprender o ofício pode crescer na função.',
      ['Misturar massa e carregar material', 'Ajudar o pedreiro em cada etapa', 'Limpar e organizar o local da obra', 'Usar os equipamentos de proteção'],
      ['Disposição para trabalhar ao ar livre'], ['Pode carregar peso?', 'Já trabalhou em obra?'], true),
    M('ajudante-obra-dia', 'Ajudante de obra (diária)', ['ajudante de obra', 'ajudante geral', 'bracal'], 'construcao', 'Diária', 'Comercial', '',
      'Precisamos de ajudante para um dia de trabalho em obra. A pessoa ajuda a carregar material, limpar o local e dar apoio ao pedreiro. O pagamento é por dia trabalhado.',
      ['Carregar e levar o material', 'Limpar e organizar o local', 'Apoiar o pedreiro nas tarefas do dia'],
      ['Disposição para trabalhar ao ar livre'], ['Pode carregar peso?', 'Pode começar cedo?'], true),
    M('eletricista', 'Eletricista', ['eletricista', 'eletrica', 'eletricista predial', 'instalador eletrico'], 'manutencao', 'Por serviço', 'Comercial', 'Segunda a sexta, conforme os serviços',
      'Vaga de eletricista para instalações e manutenção elétrica em casas, lojas e obras. É preciso ter experiência, conhecer as normas de segurança e usar os equipamentos de proteção.',
      ['Instalar tomadas, fiação e quadros', 'Fazer reparos e manutenção elétrica', 'Seguir as regras de segurança', 'Registrar os serviços feitos'],
      ['Ter experiência em instalação elétrica'], ['Tem experiência como eletricista?', 'Tem as próprias ferramentas?'], false),
    M('mecanico', 'Mecânico(a)', ['mecanico', 'mecanica', 'mecanico de moto', 'mecanico de carro', 'auxiliar de mecanico'], 'manutencao', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em horário comercial',
      'Procuramos mecânico ou mecânica para fazer revisões, trocas e reparos nos veículos da oficina. A pessoa diagnostica o problema, orienta o cliente e mantém as ferramentas organizadas.',
      ['Fazer revisões, trocas e reparos', 'Identificar o defeito e orientar o cliente', 'Manter a oficina e as ferramentas organizadas', 'Registrar os serviços feitos'],
      ['Ter experiência em oficina'], ['Tem experiência em oficina?', 'Tem as próprias ferramentas?'], false),
    M('vigia', 'Vigia', ['vigia', 'vigilante', 'vigia noturno', 'ronda'], 'seguranca', 'Carteira assinada', 'Noite', 'Escala 12x36, à noite',
      'Vaga de vigia para o período da noite. A pessoa faz a ronda nos horários combinados, controla quem entra e sai, e anota as ocorrências do plantão. É preciso estar atento e ter responsabilidade.',
      ['Fazer a ronda nos horários combinados', 'Controlar a entrada e a saída de pessoas', 'Anotar as ocorrências do plantão', 'Avisar a empresa sobre qualquer problema'],
      ['Poder trabalhar à noite'], ['Pode trabalhar à noite?', 'Já trabalhou como vigia?'], true),
    M('porteiro', 'Porteiro(a)', ['porteiro', 'porteira', 'portaria', 'controlador de acesso'], 'seguranca', 'Carteira assinada', 'Escala 12x36', 'Escala 12x36, em turnos de 12 horas',
      'Procuramos porteiro ou porteira para a portaria de um condomínio ou empresa. A pessoa recebe visitantes e encomendas, controla o acesso e anota o que acontece no plantão, sempre com educação e atenção.',
      ['Receber visitantes e encomendas', 'Controlar a entrada e a saída', 'Anotar as ocorrências do plantão', 'Atender o interfone com educação'],
      ['Ter boa comunicação'], ['Pode trabalhar na escala 12x36?', 'Já trabalhou em portaria?'], true),
    M('estoquista', 'Estoquista', ['estoquista', 'auxiliar de estoque', 'almoxarife', 'conferente'], 'logistica', 'Carteira assinada', 'Comercial', 'Segunda a sexta, em horário comercial',
      'Vaga de estoquista para receber, conferir e organizar as mercadorias do estoque. A pessoa faz o controle do que entra e sai, separa os pedidos e mantém o local limpo e seguro.',
      ['Receber e conferir as mercadorias', 'Organizar o estoque por área', 'Separar os pedidos para entrega', 'Fazer a contagem do estoque'],
      ['Noções de computador'], ['Já trabalhou com estoque?', 'Pode carregar peso?'], true),
    M('operador-producao', 'Operador(a) de produção', ['operador de producao', 'producao', 'operador de maquina', 'linha de producao'], 'producao', 'Carteira assinada', 'Comercial', 'Segunda a sexta, em turnos combinados',
      'Procuramos operador ou operadora de produção para trabalhar na linha da fábrica, operando as máquinas, conferindo a qualidade e seguindo as regras de segurança. O treinamento é feito no começo.',
      ['Operar as máquinas da linha', 'Conferir a qualidade do que sai', 'Seguir as regras de segurança', 'Manter o posto de trabalho limpo'],
      ['Disposição para trabalhar em pé'], ['Já trabalhou em fábrica?', 'Pode trabalhar em turnos?'], true),
    M('auxiliar-producao', 'Auxiliar de produção', ['auxiliar de producao', 'ajudante de producao', 'ajudante de fabrica'], 'industria', 'Carteira assinada', 'Comercial', 'Segunda a sexta, em turnos combinados',
      'Vaga de auxiliar de produção para ajudar na fábrica: abastecer a linha, embalar os produtos, organizar o material e manter o local limpo. É uma boa chance para quem quer começar na indústria.',
      ['Abastecer a linha com material', 'Embalar e etiquetar os produtos', 'Organizar o material e as caixas', 'Manter o local limpo'],
      [], ['Já trabalhou em fábrica?', 'Pode trabalhar em turnos?'], true),
    M('cabeleireiro', 'Cabeleireiro(a)', ['cabeleireiro', 'cabeleireira', 'cabelereiro', 'salao', 'barbeiro'], 'beleza', 'Por serviço', 'Comercial', 'Terça a sábado, em horário comercial',
      'Procuramos cabeleireiro ou cabeleireira para atender no salão: cortes, escovas, colorações e tratamentos. A pessoa cuida da agenda, dos materiais e da limpeza do seu espaço de trabalho.',
      ['Atender e fazer os serviços agendados', 'Cuidar da agenda e dos materiais', 'Manter o espaço limpo e organizado', 'Orientar o cliente sobre cuidados'],
      ['Ter experiência em salão'], ['Já trabalhou em salão?', 'Tem as próprias ferramentas?'], false),
    M('manicure', 'Manicure', ['manicure', 'pedicure', 'nail designer', 'esmaltaria'], 'beleza', 'Por serviço', 'Comercial', 'Terça a sábado, em horário comercial',
      'Vaga de manicure e pedicure para atender no salão ou studio. A pessoa cuida das unhas dos clientes com higiene, esteriliza os materiais e organiza a própria agenda.',
      ['Atender os clientes agendados', 'Esterilizar e organizar os materiais', 'Manter a bancada limpa', 'Orientar sobre o cuidado com as unhas'],
      ['Ter experiência com unhas'], ['Já trabalhou como manicure?', 'Tem o próprio material?'], false),
    M('balconista-farmacia', 'Balconista de farmácia', ['balconista de farmacia', 'atendente de farmacia', 'farmacia', 'drogaria'], 'saude', 'Carteira assinada', 'Comercial', 'Segunda a sábado, em escala combinada',
      'Procuramos balconista de farmácia para atender no balcão, orientar sobre os produtos de perfumaria e higiene, repor as prateleiras e receber as mercadorias. As vendas de medicamentos seguem a orientação do farmacêutico.',
      ['Atender no balcão e no caixa', 'Repor e organizar as prateleiras', 'Conferir as mercadorias que chegam', 'Seguir as orientações do farmacêutico'],
      ['Ter paciência e atenção'], ['Já trabalhou em farmácia?', 'Pode trabalhar aos sábados?'], true),
    M('frentista', 'Frentista', ['frentista', 'posto de gasolina', 'posto', 'abastecedor'], 'comercio', 'Carteira assinada', 'Comercial', 'Escala combinada, com folgas na semana',
      'Vaga de frentista para abastecer os veículos, receber o pagamento, calibrar pneus e atender com educação. A pessoa trabalha em escala e recebe treinamento sobre as normas de segurança do posto.',
      ['Abastecer os veículos', 'Receber o pagamento e conferir o troco', 'Calibrar pneus e conferir o óleo quando pedido', 'Manter a pista limpa e organizada'],
      ['Ter atenção às regras de segurança'], ['Já trabalhou em posto?', 'Pode trabalhar em escala?'], true),
    M('tratorista', 'Tratorista', ['tratorista', 'operador de trator', 'operador agricola', 'operador de maquina agricola'], 'agro', 'Carteira assinada', 'Manhã', 'Segunda a sábado, a partir das 6h',
      'Vaga de tratorista para operar trator e implementos no preparo da terra e no plantio. É preciso ter prática, cuidar das máquinas e seguir as orientações de segurança da propriedade.',
      ['Operar o trator e os implementos', 'Fazer a manutenção básica das máquinas', 'Seguir o plano de plantio e preparo da terra', 'Registrar as horas de trabalho da máquina'],
      ['Ter experiência com trator'], ['Tem experiência como tratorista?', 'Pode trabalhar na zona rural?'], false),
    M('trabalhador-rural', 'Trabalhador(a) rural', ['trabalhador rural', 'peao', 'lavoura', 'ordenhador', 'campo'], 'agro', 'Carteira assinada', 'Manhã', 'Segunda a sábado, a partir das 6h',
      'Procuramos trabalhador ou trabalhadora rural para cuidar da lavoura ou do gado: plantar, colher, tratar dos animais e manter as cercas e os cochos. O trabalho é ao ar livre e começa cedo.',
      ['Plantar, colher e cuidar da lavoura', 'Tratar e cuidar dos animais', 'Manter cercas, cochos e currais', 'Seguir as orientações do responsável'],
      ['Disposição para trabalhar ao ar livre'], ['Já trabalhou no campo?', 'Pode trabalhar na zona rural?'], true),
    M('telemarketing', 'Atendente de telemarketing', ['telemarketing', 'televendas', 'call center', 'atendente de central'], 'vendas', 'Carteira assinada', 'Comercial', 'Segunda a sexta, em turnos de 6 horas',
      'Vaga de atendente de telemarketing para falar com clientes por telefone e mensagens, tirar dúvidas e registrar os atendimentos no sistema. É importante ter boa dicção, paciência e facilidade com o computador.',
      ['Atender e fazer chamadas', 'Tirar dúvidas e registrar o atendimento', 'Seguir o roteiro de conversa', 'Cumprir os horários de cada turno'],
      ['Boa comunicação', 'Noções de computador'], ['Já trabalhou com telemarketing?', 'Sabe usar o computador?'], true),
    M('auxiliar-creche', 'Auxiliar de sala (creche)', ['auxiliar de creche', 'auxiliar de sala', 'monitor escolar', 'cuidador infantil', 'recreador'], 'educacao', 'Carteira assinada', 'Comercial', 'Segunda a sexta, em horário comercial',
      'Vaga de auxiliar de sala para ajudar a professora no cuidado das crianças: acompanhar as brincadeiras, ajudar na alimentação e na higiene e manter a sala organizada. É preciso ter carinho, paciência e responsabilidade.',
      ['Acompanhar as crianças nas atividades', 'Ajudar na alimentação e na higiene', 'Manter a sala organizada', 'Avisar a professora sobre qualquer ocorrência'],
      ['Gostar de trabalhar com crianças'], ['Já trabalhou com crianças?', 'Pode trabalhar em horário comercial?'], true),
    M('camareiro', 'Camareiro(a)', ['camareiro', 'camareira', 'arrumadeira', 'hotel', 'pousada'], 'hotelaria', 'Carteira assinada', 'Comercial', 'Segunda a domingo, em escala combinada',
      'Procuramos camareiro ou camareira para arrumar os quartos de um hotel ou pousada: trocar a roupa de cama, limpar banheiros e repor os itens de cada quarto. É importante ter capricho e agilidade.',
      ['Arrumar e limpar os quartos', 'Trocar a roupa de cama e as toalhas', 'Repor os itens de cada quarto', 'Avisar sobre qualquer dano ou falta'],
      ['Ter capricho e agilidade'], ['Já trabalhou em hotel ou pousada?', 'Pode trabalhar aos fins de semana?'], true),
    M('jardineiro', 'Jardineiro(a)', ['jardineiro', 'jardineira', 'jardinagem', 'podador'], 'limpeza', 'Por serviço', 'Manhã', 'Segunda a sexta, no período da manhã',
      'Vaga de jardineiro ou jardineira para cuidar de áreas verdes: roçar, podar, plantar e regar. A pessoa mantém o jardim bem cuidado durante o ano todo e zela pelas ferramentas.',
      ['Roçar e aparar a grama', 'Podar plantas e árvores pequenas', 'Plantar e adubar canteiros', 'Cuidar da irrigação'],
      ['Saber usar roçadeira'], ['Sabe usar roçadeira?', 'Já trabalhou com jardinagem?'], true)
  ];

  function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  // Chave de comparação de uma função: sem acento, sem "(a)" e sem espaços extras.
  function chave(titulo) { return norm(String(titulo || '').replace(/\([^)]*\)/g, ' ')); }

  LISTA.forEach(function (m) {
    m.chaves = [chave(m.titulo)].concat(m.termos.map(chave)).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  });

  var porId = {};
  LISTA.forEach(function (m) { porId[m.id] = m; });

  // Os modelos mais parecidos com o que a pessoa digitou (nome igual > começo do nome > termo parecido > trecho no meio).
  function sugerir(texto, max) {
    var n = chave(texto);
    if (!n) return LISTA.slice(0, max || 6);
    var achados = [];
    LISTA.forEach(function (m) {
      var peso = 0;
      m.chaves.forEach(function (k) {
        if (k === n) peso = Math.max(peso, 4);
        else if (k.indexOf(n) === 0) peso = Math.max(peso, 3);
        else if (k.indexOf(' ' + n) >= 0) peso = Math.max(peso, 2);
        else if (n.length > 3 && n.indexOf(k) === 0) peso = Math.max(peso, 2.5);
        else if (n.length >= 3 && k.indexOf(n) >= 0) peso = Math.max(peso, 1);
      });
      if (peso) achados.push({ m: m, peso: peso });
    });
    achados.sort(function (a, b) { return b.peso - a.peso; });
    return achados.slice(0, max || 6).map(function (x) { return x.m; });
  }

  // Só o modelo cujo nome ou termo é igual ao texto.
  function exato(texto) {
    var n = chave(texto);
    if (!n) return null;
    for (var i = 0; i < LISTA.length; i++) if (LISTA[i].chaves.indexOf(n) >= 0) return LISTA[i];
    return null;
  }

  // O modelo exato, senão o melhor palpite.
  function achar(texto) { return exato(texto) || sugerir(texto, 1)[0] || null; }

  var API = { lista: LISTA, porId: porId, achar: achar, exato: exato, sugerir: sugerir, chave: chave, norm: norm,
    RAPIDOS: ['caixa', 'repositor', 'vendedor', 'cozinheiro', 'auxiliar-limpeza', 'motorista', 'manicure', 'garcom'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.VSC_MODELOS = API;
})(typeof self !== 'undefined' ? self : this);
