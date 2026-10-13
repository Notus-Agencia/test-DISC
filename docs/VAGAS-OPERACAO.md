# Vagas sem Caos · Manual de operação ("cidade em caixa")

*Gestão sem Caos · versão 2 · 13/10/2026. **Praça piloto: Uruaçu (GO), só ela por enquanto** (decisão do dono em 13/10; a versão 1 deste manual falava de outra cidade por um erro de premissa). Base: a proposta aprovada do painel (`scratchpad/vagas/proposta.md`), o retrato da cidade (`scratchpad/vagas/uruacu.md`, com fontes) e os relatórios de cidade pequena [Cid], marca [Marca], monetização [Mon] e produto [Prod]. Regras de texto e de selo: `docs/painel-cientifico/vagas/padroes.md`. O que é proposta nova deste manual está marcado como **HIPÓTESE**.*

Este manual é o que uma pessoa recebe para **abrir e tocar uma praça** do Vagas sem Caos. Foi escrito para Uruaçu e vale, sem mudança de lógica, para qualquer praça futura (cidade-polo + entorno), quando o dono decidir abrir outra.

**Uruaçu em 5 números** (fontes em `uruacu.md`): 42.546 habitantes no Censo 2022 e 44.533 estimados em 2025 (IBGE); +1.056 empregos com carteira no 1º semestre de 2026, o 6º melhor saldo de Goiás (Novo Caged, via Portal Contexto); ~5.641 empresas ativas (agregador privado, HIPÓTESE até conferir); às margens da BR-153 e do Lago de Serra da Mesa; ensino superior e técnico público na cidade (IFG Câmpus Uruaçu e UEG Câmpus Norte).

Peças que acompanham este manual (pasta `conteudo/vagas-operacao/`):

| Arquivo | Para quê |
|---|---|
| `contrato-parceiro-MINUTA.md` | Minuta do contrato do parceiro de praça (para o(a) advogado(a) revisar) |
| `script-venda-empresa.md` | Abordagem de 5 minutos para a empresa, porta a porta e por WhatsApp |
| `roteiro-mutirao.md` | Como fazer o mutirão de cadastro e a prova presencial |
| `kit-parcerias.md` | Propostas de 1 página para as entidades de Uruaçu |
| `lista-empresas-modelo.csv` | Modelo da lista das 30 primeiras empresas (por segmento; sem nomes) |
| `boletim-e-radio.md` | Modelos do boletim diário, do post semanal e do spot de rádio |
| `indicadores.json` | Os números do painel da praça (chave, definição, fórmula, alvo) |

Vocabulário fixo (proposta, seções 2 e 7; `padroes.md` §6): **Vagas sem Caos** (sempre por inteiro), **Combinou** (nunca "match", nunca "Tinder"), **Quero / Pular** (pessoa), **Quero conversar / Agora não** (empresa), **selo de habilidade testada** (nunca "currículo verificado", "certificado", "aprovado"), **referência profissional** (nunca "avaliação" ou "nota" da pessoa), **a pessoa** (quem procura emprego), **praça** (cidade-polo + entorno).

---

## 1. Papéis

| Papel | Quem é | O que faz | O que NÃO faz |
|---|---|---|---|
| **Gestão sem Caos (equipe central)** | O dono + quem ele designar | Tecnologia, marca, jurídico, LGPD (é a **controladora** dos dados [Cid]), preços, status da cidade, contrato e troca do parceiro, repasse mensal, decisão final de denúncia grave, incidente de dados | Não delega preço, status da cidade nem decisão sobre o parceiro |
| **Operador(a) da praça de Uruaçu** | **Decisão do dono** (seção 11): uma pessoa da Gestão sem Caos dedicada nos 90 dias, morando ou passando a semana em Uruaçu, **ou** um parceiro local (contador(a), consultor(a), alguém da associação comercial ou de rádio [Cid]) com o contrato da minuta, entrada R$ 0 (proposta, seção 5) | Vende para empresas, confere CNPJ e vaga, modera em até 24 h, faz cadastro assistido, organiza mutirão e prova presencial, publica o boletim, cuida do Canal de WhatsApp, acompanha o painel da praça | Não vê currículo nem contato da pessoa (só o conteúdo denunciado) [Prod]; não mexe em preço; não usa a base para si (se for parceiro, vira controlador pela LGPD [25]) |
| **Advogado(a)** (trabalhista + LGPD) | Contratado(a) pelo dono antes da semana 5 (proposta, 10.3) | Termos, privacidade, RIPD, contrato do parceiro, revisão de cada incidente de dados, orientação em golpe com vítima | Não decide produto |
| **Psicólogo(a)** | Contratado(a) pelo dono agora (proposta, 10.4); o painel científico do projeto já tem padrões (`padroes.md`) | Confirma por escrito que os 5 testes medem só conhecimento prático; revisa o texto do selo e a lista de pontos fortes da referência | Não participa da moderação |
| **Contador(a)** | O(a) da Gestão sem Caos | NFS-e das vendas e do repasse (proposta, 10.5); confere a nota do parceiro; calcula a receita líquida do mês | Não confere CNPJ de cliente (isso é do operador) |

Regra de ouro dos dados (proposta, seção 6.3): a Gestão sem Caos é controladora; o operador só executa instruções escritas; **ninguém da operação vê o currículo ou o contato de uma pessoa**. O sistema não dá esse acesso (as RPCs `vagas_op_*` só devolvem empresa, anúncio, denúncia, referência em moderação e registro de moderação).

---

## 2. Passo a passo para abrir a praça

Ordem fixa (proposta, seção 5, "abrir uma cidade em cerca de 90 dias"): lista de espera → operador definido (e contrato, se for parceiro) → 20 a 30 empresas e vagas **antes** das pessoas → Canal de WhatsApp → parcerias → mutirão de abertura → boletim diário → cobrar só depois da meta.

| # | Passo | Responsável | Prazo | Critério de "pronto" |
|---|---|---|---|---|
| 0 | **Pôr Uruaçu em lista de espera** (cidade `uruacu-go`, status `lista_espera`; as 6 zonas da seção 2.2) | Equipe central | Dia 0 | A cidade aparece no site com "Avise-me quando chegar" e o contador de interessados funciona (`vagas_lista_espera`, com WhatsApp opcional) |
| 1 | **Definir quem opera** (pessoa da Gestão sem Caos ou parceiro local; roteiro da seção 2.1) | Dono | Até dia 15 | Nome escrito; se parceiro, 3 candidatos entrevistados e 1 escolhido |
| 2 | **Contrato e treinamento** (se parceiro: minuta revisada pelo(a) advogado(a)) | Dono + advogado(a) | Até dia 20 | Contrato assinado (se parceiro); conta de operador criada pela função `vagas-conta` (ação `operador`); treinamento de 4 h feito e registrado |
| 3 | **Lista das 30 empresas** (`lista-empresas-modelo.csv`): primeiro os clientes da consultoria em Uruaçu, se houver, cada um autorizando (proposta, 10.9); depois comércio do Centro, serviços na BR-153, saúde, construção, agro | Operador(a) | Semana 1 | 30 linhas com segmento, contato e funções; cada uma com "próximo passo" |
| 4 | **Conferir o mapa das zonas** (as 6 zonas da seção 2.2; distribuir os 10 bairros "a conferir") | Operador(a) | Semana 1 | Zonas editadas no painel (`vagas_adm_zona_salvar`); lista de bairros revisada por 2 moradores |
| 5 | **Cadastrar 20 a 30 empresas e as vagas** (cadastro assistido: `vagas_op_empresa_cadastrar`; faixa salarial ou valor da diária obrigatórios) | Operador(a) | Semana 4 | ≥ 15 vagas `publicado` e ≥ 10 empresas `ativa` (CNPJ conferido), meta mínima "antes de cobrar" (seção 4.1), cobrindo as 6 funções de lançamento: atendimento/recepção, caixa, vendas no balcão, auxiliar administrativo, serviços gerais e entregador(a) [Marca] |
| 6 | **Criar o Canal de WhatsApp de Uruaçu** (Canal, não grupo; só vaga verificada; regras em `boletim-e-radio.md`) | Operador(a) | Semana 4 | Canal "Vagas sem Caos · Uruaçu" com a frase anti-golpe e o link; admins de 3 grupos locais de vagas avisados |
| 7 | **Fechar parcerias** (`kit-parcerias.md`): 1 escola (IFG ou UEG) + 3 grupos/páginas até a semana 4 (proposta, 10.10); rádio, associação comercial, Sebrae, prefeitura, Sindicato Rural, igrejas | Dono (abre a porta) + operador(a) | Semana 4 (mínimo) / semana 8 (resto) | Mínimo: 1 escola com data de prova marcada e 3 grupos repostando o boletim |
| 8 | **Mutirão de abertura** (`roteiro-mutirao.md`) | Operador(a) + 3 voluntários | Semana 5 | ≥ 60 pessoas atendidas, ≥ 45 contas confirmadas, ≥ 30 provas presenciais (HIPÓTESE, proporcional à cidade) e lista de checagem assinada |
| 9 | **Boletim diário no ar** | Operador(a) | Dia seguinte ao mutirão | Boletim todo dia útil até 9h no Canal (teste: 5 dias seguidos sem falhar) |
| 10 | **Primeiras contratações e depoimentos** | Operador(a) | Semanas 7–8 | 3 contratações marcadas pela empresa (`vagas_marcar_contratada`); 2 depoimentos autorizados por escrito |
| 11 | **Abrir para empresas de fora da carteira** (associação comercial, Sebrae, Sindicato Rural) | Operador(a) | Semanas 9–10 | 5 empresas novas `ativa` que não eram clientes da consultoria |
| 12 | **Medir as metas antes de cobrar** (seção 4.1) | Equipe central | Semana 10 | Painel com todos os números da seção 6; decisão escrita "cobrar / não cobrar ainda" |
| 13 | **Piloto pago com 5 empresas** (preços de Uruaçu, HIPÓTESE; preço de fundador 50% por 6 meses; tudo pago antes, sem renovação automática) | Dono + operador(a) + contador(a) | Semanas 11–12 | 5 empresas pagaram ao menos 1 item; NFS-e de cada uma; primeiro cálculo de receita líquida |
| 14 | **Revisão de 13 semanas** | Dono + equipe | Semana 13 | Relatório de 2 páginas: metas × realizado, o que muda; nenhuma decisão de nova cidade antes de Uruaçu estar "viva" (seção 4.3) |

### 2.1 Se o operador for um parceiro local: como escolher (HIPÓTESE de roteiro)

Perfil (proposta, seção 5): rede comercial em Uruaçu e reputação em jogo. Entrevista de 40 minutos, 5 perguntas:
1. "Quantas empresas de Uruaçu você conhece pelo nome do dono?" (meta: ≥ 30).
2. "Você já vendeu algo porta a porta? O quê, para quem?"
3. "Tem local para aplicar uma prova com 10 pessoas sentadas e tomada?"
4. "Você aceita não ver os dados de quem procura emprego, nunca?" (quem hesita, não serve).
5. "Quantas horas por semana você dedica nos 90 primeiros dias?" (mínimo: 15 h, HIPÓTESE).

Eliminatórios: já ter cobrado dinheiro de quem procura emprego; ter agência que cobra taxa de candidato; CNPJ com pendência que impeça nota fiscal.

### 2.2 Zonas de Uruaçu (semente do banco)

Não há mapa oficial de bairros nas fontes encontradas. Ficam 6 zonas, com os bairros cuja posição a fonte indica; os demais bairros confirmados em fonte pública o operador distribui na semana 1 (passo 4). Detalhe e fontes: `scratchpad/vagas/uruacu.md` e a mesa de equipe.

| Ordem | `slug` | Nome | Bairros na semente |
|---|---|---|---|
| 1 | `centro` | Centro | Centro, Setor Central, Vila Santana, Loteamento Santana |
| 2 | `regiao-norte` | Região Norte | Francisco Martins |
| 3 | `regiao-sul` | Região Sul | Setor Sul, Setor Sul I |
| 4 | `regiao-leste` | Região Leste | (a definir) |
| 5 | `regiao-oeste` | Região Oeste | (a definir; "cerca de 12 bairros", Jornal Cidade) |
| 6 | `zona-rural` | Zona rural e lago | Zona rural, Geriaçu, Beira do Lago de Serra da Mesa |

**A conferir pelo operador:** Setor São Sebastião, Setor Aeroporto, Setor Aeroporto II, Vila Guimarães, Setor Santa Helena, Setor Bandeirantes, São Vicente, Vila Primavera I, Vale do Sol, Setor Rosem Parque.

---

## 3. Rotina do(a) operador(a)

### 3.1 Todo dia útil (cerca de 2 h, HIPÓTESE)

| Hora | Tarefa | Como sabe que terminou |
|---|---|---|
| 8h00 | **Moderação** de vagas (`publicar`/`devolver`/`remover`) e empresas (`aprovar`/`recusar`/`suspender`/`reativar`); motivo pela chave de `conteudo/vagas-textos/moderacao.json` | Fila zerada: nada esperando há mais de 24 h |
| 8h30 | **Denúncias** (`vagas_op_denuncias`, filtro `aberta`) | Nenhuma aberta há mais de 24 h (proposta, seção 9: 24 h, HIPÓTESE). Golpe → seção 7 |
| 8h45 | **Referências profissionais** com texto livre esperando moderação (seção 3.3) | Nenhuma esperando há mais de 24 h; cada recusa com motivo da lista |
| 9h00 | **Boletim diário** ("Copiar boletim do dia" no painel → colar no Canal) [Prod] | Boletim no Canal antes das 9h, só com vagas `publicado` |
| 9h15 | **Fila de contato** (WhatsApp da praça) | Toda mensagem recebida até 18h do dia anterior respondida |
| 10h–12h | **Venda**: 3 visitas ou 10 contatos de WhatsApp com empresas (`script-venda-empresa.md`) | Linhas da lista de empresas atualizadas com "próximo passo" e data |
| Fim do dia | **Painel**: vagas sem interessado há 7 dias; empresas sem responder há 5 dias | Empresa sem resposta há 5 dias recebe mensagem ("tem pessoas esperando resposta na sua vaga") |

**Conferência de CNPJ e vaga (critério de publicar):** consulta pública do CNPJ na Receita Federal com situação "ATIVA"; nome e atividade combinam com a vaga; endereço em Uruaçu ou no entorno; sem palavra bloqueada (taxa, Pix, link encurtado, telefone, "boa aparência", "até N anos", "solteira": proposta, seção 6.5); salário ou diária informado. Corrigível → `devolver` com o motivo; golpe ou empresa falsa → `remover`.

### 3.2 Toda semana

| Dia | Tarefa | Pronto quando |
|---|---|---|
| Segunda | Post "vaga da semana" (`boletim-e-radio.md`) | Publicado e repostado por ≥ 3 grupos |
| Terça | Boletim para a rádio (spot de 30 s + 5 vagas) enviado | Enviado até 12h |
| Quarta | Vagas paradas: sem interessado há 7 dias → ligar para a empresa (faixa salarial? zona? exigência demais?) | Cada vaga parada com uma ação anotada |
| Quinta | Contato com 1 escola/parceiro: data da próxima prova presencial | Agenda do mês com ≥ 1 mutirão |
| Sexta | **Números da semana** para a equipe central (os do painel, seção 6) + riscos | Mensagem até 17h; resposta da equipe até segunda |

### 3.3 Referência profissional: moderação e uso pela operação

Acréscimo aprovado pelo dono em 13/10: uma **empresa verificada** pode dar uma **referência profissional pública** sobre uma pessoa que trabalhou nela. É sempre positiva e factual (período, função, vínculo, até 3 pontos fortes da lista fechada, "recomendaria para", texto livre opcional de até 300 caracteres só com situação observada, e a declaração de que a pessoa trabalhou lá). Só aparece depois que **a pessoa autoriza**; ela pode ocultar ou excluir quando quiser, e a empresa **não é avisada nem percebe** a ocultação (decisão P2). Não existe referência negativa, estrela, média, contagem ordenável nem filtro (decisão P3; `padroes.md` §7). No cartão cego aparece só "Referência de empresa verificada: sim" (decisão P1).

**O que o operador modera:** o **texto livre** e a coerência (período, função, vínculo). Os pontos fortes vêm de lista fechada. O operador não vê o restante do perfil da pessoa.

| Regra | Como |
|---|---|
| **Prazo** | Decidir em até **24 h**; a referência só é oferecida à pessoa depois de aprovada |
| **Aprovar** | Texto com situação de trabalho observada; período e função plausíveis para a empresa; nada da lista de recusa |
| **Recusar (motivos fechados; 1 motivo + 1 frase)** | (1) dado sensível ou pessoal (saúde, religião, família, nacionalidade, idade, aparência); (2) contato ou link (telefone, e-mail, @, Pix); (3) comparação com outra pessoa; (4) negativa disfarçada ("apesar de…", "melhorou muito", "quando quer, trabalha"); (5) adjetivo de personalidade isolado, sem situação observada ("é uma pessoa de ouro"); (6) propaganda da empresa; (7) período/função incompatíveis (ex.: período anterior à abertura do CNPJ); (8) texto copiado em série |
| **Recusa não vira informação sobre a pessoa** | A empresa recebe o motivo e pode corrigir; a pessoa nunca soube da referência recusada |
| **Limite** | **1 referência por empresa por pessoa** e **no máximo 20 por empresa por mês** (HIPÓTESE). O operador não abre exceção: registra em Pendências e a equipe central decide |
| **Referência falsa** (pessoa que nunca trabalhou lá, troca de favores entre contas) | Remover (motivo), suspender a empresa ("referência falsa"), registrar e avisar a equipe central no mesmo dia. Sinais: várias referências no mesmo minuto; referência cruzada entre as mesmas contas; empresa `ativa` há menos de 7 dias com 10 referências; período anterior ao CNPJ |
| **Referência coagida** (a pessoa relata pressão para pedir ou aceitar, ou que a empresa condicionou pagamento ou rescisão a isso) | Tratar como denúncia (seção 7, 24 h): a pessoa oculta na hora (ela mesma pode); ouvir a empresa; registrar. Reincidência → suspensão. Nunca pedir "prova" além do relato; nunca contar à empresa quem relatou |
| **Denúncia de referência** | Chega por `vagas_denunciar` com o texto denunciado; mesmo prazo |

**Como a operação usa a referência sem virar "lista de bons e maus":**
1. A referência é da pessoa: o operador nunca monta, guarda ou repassa lista de quem tem ou não tem referência (o sistema nem dá esse acesso).
2. **Mutirão:** a mesa só informa: "Já trabalhou em alguma empresa daqui? Pelo site você pode pedir uma referência profissional a ela." A pessoa decide; a mesa não liga para a empresa nem preenche nada.
3. **Mutirão de empresas** (associação comercial, Sebrae): "Pessoas boas que passaram por aqui? Ofereça uma referência profissional: leva 2 minutos e aparece com o nome da sua empresa, se a pessoa autorizar."
4. **Vaga assistida:** o operador ajuda a empresa a escrever a vaga, divulga no boletim, na rádio e no mutirão, marca uma data de prova presencial e divulga a data na própria vaga (o operador não sabe quem disse "Quero") e lembra a empresa de responder. **Quem lê os cartões e decide é a empresa.** O operador não monta lista curta, não ordena pessoas e não usa referência, selo ou nota para escolher ninguém (decisão P3).
5. Ausência de referência não é critério de nada e nunca é mencionada à empresa.
6. Toda recusa, remoção e suspensão por referência entra no relatório mensal só como **número**.

### 3.4 Todo mês

- **Mutirão de cadastro + prova presencial:** no mínimo 1 por mês (proposta, seção 4). Roteiro em `roteiro-mutirao.md`.
- **Repasse** (só se o operador for parceiro): contador(a) calcula receita líquida = pago − estorno − taxa [Prod]; parceiro emite nota; Pix até o dia 10 (HIPÓTESE).
- **Limpeza:** vaga `publicado` há mais de 30 dias sem renovação → avisar a empresa e encerrar em 7 dias sem resposta.
- **Relatório de 1 página** ao dono: metas × realizado, 3 problemas, 3 pedidos.
- **Julho** (HIPÓTESE de sazonalidade): Exposição Agropecuária e Feira do Agronegócio do Sindicato Rural, férias no lago. Uma semana antes, ligar para comércio, eventos e pousadas oferecendo diárias "para hoje"; boletim com bloco de diárias reforçado.

---

## 4. Metas e gatilhos (cidade pequena)

Números da proposta (seções 4, 5 e 9) para a cidade de 20–40 mil habitantes; Uruaçu tem 44,5 mil (estimativa 2025). O que é HIPÓTESE lá continua HIPÓTESE aqui.

### 4.1 Antes de cobrar a empresa (HIPÓTESE da proposta)

Todas ao mesmo tempo: **15 vagas ativas**, **10 empresas ativas**, **150 pessoas com selo**, **70% das vagas com 3 interessados com selo em 7 dias** e **3 contratações**. Só então o piloto pago com 5 empresas (semanas 11–12). Enquanto não bater, a mensagem para a empresa é "grátis no lançamento".

### 4.2 Praça "viva" em 6 meses [Cid]

**20 vagas ativas**, **400 pessoas com selo**, **15 empresas ativas por mês**, **5 empresas pagantes** e **primeira resposta da empresa em até 7 dias**, no mesmo mês.

### 4.3 Abrir outra praça (só quando o dono quiser)

O dono decidiu "por enquanto, só Uruaçu". A regra da proposta fica guardada para o futuro (HIPÓTESE): praça atual "viva" por 2 meses seguidos **e** 200 pessoas na lista de espera da próxima cidade **e** parceiro assinado. Nenhuma cidade candidata está escolhida.

### 4.4 Trocar o parceiro (se o operador for parceiro)

**90 dias sem entrega, troca** [Cid]. "Entrega" = os passos 3 a 9 da seção 2 no prazo **ou** a meta 4.1 atingida. Aviso formal aos 60 dias; aos 90, rescisão (minuta, cláusula 7). Troca imediata: acesso indevido a dado de pessoa, cobrança de quem procura emprego, uso da base para fins próprios.

### 4.5 A pessoa não paga nada

Em Uruaçu, **quem procura emprego não paga nada, nunca** (proposta, seção 4, regra da cidade pequena). Ninguém da operação vende nada para a pessoa: nem destaque, nem prova, nem curso.

---

## 5. Limites que a operação nunca cruza

1. **Nunca pedir dinheiro a quem procura emprego**, em nenhum canal, a título nenhum (proposta, seção 6.1; decisões do TRT-4 [10][11]).
2. Nunca criar conta de uma pessoa sem ela confirmar pelo e-mail dela (a conta nasce `pendente`) [Prod].
3. Nunca pedir foto, idade, gênero, estado civil, filhos, gravidez, cor, religião, nacionalidade, saúde ou antecedentes (proposta, seção 6.4).
4. Nunca usar disparador não oficial de WhatsApp [Prod]; nunca mandar lista de pessoas para empresa.
5. Nunca prometer emprego, prazo, "perfil ideal" ou "compatibilidade"; nunca dizer "aprovado", "reprovado", "certificado" ou "o selo garante" (`padroes.md` §6). Forma aceita: "o selo mostra quem já sabe o básico; a entrevista e a experiência fazem o resto".
6. Nunca falar em DISC antes de "contratada" (proposta, seção 6.7).
7. Nunca escrever "Notus" em nada que cliente ou pessoa veja (CLAUDE.md).

---

## 6. O painel da praça

Lista fechada (proposta, seção 9), com a origem de cada número. Definição, fórmula e alvo em `conteudo/vagas-operacao/indicadores.json` (chaves abaixo; alvo em `alvo.cidadePequena`, que é o de Uruaçu). RPC pedida ao banco: `vagas_op_indicadores(p_cidade)`.

| # | Chave | Número | De onde sai | Alvo em Uruaçu |
|---|---|---|---|---|
| 1 | `vagas_ativas` | Vagas ativas | `vagas_anuncios` `publicado` e no prazo (CLT, temporário, diária, freelancer, estágio) | 15 para cobrar; 20 "viva" |
| 2 | `pessoas_com_selo_por_funcao` | Pessoas com selo, por teste e no total | `vagas_selos` válidos (12 meses), pessoas da praça | 150 para cobrar; 400 "viva" |
| 3 | `vagas_3_interessados_72h` | % de vagas com 3 interessados com selo (janela de **7 dias** na cidade pequena; o nome da chave ficou da versão 1) | candidaturas até 7 dias após `publicado_em`, de quem tinha selo válido | 70% |
| 4 | `vagas_combinou_7d` | % de vagas com Combinou em 7 dias | candidatura `combinou`/`contratada` até 7 dias após a publicação | medir (HIPÓTESE: 60%) |
| 5 | `primeira_resposta_empresa_dias` | Primeira resposta da empresa (mediana, dias) | `enviada` → primeira decisão (`conversar` ou `agora_nao`) | ≤ 7 dias |
| 6 | `contratacoes` | Contratações | candidaturas `contratada` | 3 para cobrar |
| 7 | `empresas_ativas_mes` | Empresas ativas no mês | empresa `ativa` com ≥ 1 ação no mês | 10 para cobrar; 15 "viva" |
| 8 | `empresas_buscando_semana` | Empresas buscando no banco por semana | fase 2 (passe do banco); até lá, "ainda não existe" | sem alvo no piloto |
| 9 | `empresas_pagantes` | Empresas pagantes no mês | pedidos pagos da praça | 5 "viva" |
| 10 | `receita_liquida_centavos` | Receita líquida do mês | pago − estorno − taxa [Prod] | acompanhar |
| 11 | `denuncia_tempo_decisao_h` | Tempo para decidir denúncia (mediana, horas) | `vagas_denuncias` | ≤ 24 h (HIPÓTESE) |
| 12 | `emails_mes` | E-mails no mês | `envios_email` do produto vagas | < ~3.000 (plano grátis) [Prod] |
| 13 | `fila_moderacao` | Esperando moderação há > 24 h | vagas em revisão + empresas em análise + referências com texto pendente | 0 |
| 14 | `lista_espera` | Pessoas na lista de espera | `vagas_lista_espera` | antes de abrir: medir |
| 15 | `cadastros_assistidos_confirmados` | Cadastros assistidos confirmados | contas da ação `assistido` que viraram `ativa` | ≥ 45 por mutirão (HIPÓTESE) |

Os números 1 a 12 são da proposta; 13 a 15 são **HIPÓTESE** deste manual. Cor: verde (bateu), amarelo (≥ 70% do alvo), vermelho.

---

## 7. Protocolo de golpe e denúncia

Contexto: mais de 600 mil tentativas de golpe de vaga falsa em 6 meses, a maioria cobrando "taxa do processo" ou colhendo CPF e dados bancários [23]. O sistema já bloqueia "taxa", Pix, link encurtado e telefone no anúncio, exige CNPJ ativo e tira a vaga do ar com 3 denúncias de contas diferentes (proposta, seção 6.5).

| Prazo | O que fazer | Quem | Pronto quando |
|---|---|---|---|
| **Até 1 h** (horário comercial) | Se há pedido de dinheiro, Pix, "taxa", documento ou dado bancário: **remover o anúncio** e **suspender a empresa** (motivo "suspeita de golpe"). Responder a quem denunciou: "Recebemos. A vaga saiu do ar. Não pague nada a ninguém." | Operador(a) | Anúncio fora do ar; empresa suspensa; resposta enviada |
| **Até 24 h** | Apurar: CNPJ na Receita; o contato do anúncio bate com a empresa? Ligar para o número oficial da empresa (não o do anúncio). Decidir a denúncia com motivo. Engano: reativar e pedir desculpa por escrito. Golpe: manter suspenso; **avisar as pessoas que tiveram contato liberado** com essa vaga (aviso enviado pelo sistema a partir de `vagas_acessos_contato`; o operador não vê quem são; pedido ao banco); alerta no Canal ("A vaga X saiu do ar. Se alguém pediu dinheiro em nome dela, não pague."); avisar a equipe central | Operador(a) + equipe central | Denúncia decidida; pessoas avisadas; alerta publicado |
| **Até 7 dias** | Registro de 1 página: o que houve, quantas pessoas afetadas (sem nomes), o que foi feito, o que muda (palavra nova na lista de bloqueio? conferência extra?) | Equipe central | Registro arquivado; mudança aplicada |

**Quando acionar polícia, Procon ou MPT**
- **Polícia Civil de Goiás:** sempre que **alguém pagou** ou entregou documento/dado bancário, ou quando o nome "Gestão sem Caos"/"Vagas sem Caos" foi usado em golpe. A **Delegacia Virtual** da Polícia Civil de Goiás (site `goias.gov.br/policiacivil`) aceita registro de estelionato, com a mesma validade do boletim feito na delegacia; denúncia anônima pelo 197 ou WhatsApp (62) 98581-8197 (dados do site oficial em 13/10/2026; conferir antes de divulgar). Quem registra o boletim é a **vítima**; a operação ajuda com prints, datas, CNPJ e texto do anúncio. Pagamento por Pix: orientar a pessoa a pedir ao banco dela a devolução pelo Mecanismo Especial de Devolução (MED) do Banco Central, no mesmo dia. A Gestão sem Caos registra boletim próprio quando a marca foi usada (decisão do dono com o(a) advogado(a)).
- **Procon:** quando a queixa é de **consumo** (empresa cobrou "curso obrigatório", "kit", "uniforme" para contratar), não de crime. Procon Goiás ou o órgão municipal de Uruaçu, se existir (conferir).
- **Ministério Público do Trabalho (MPT):** quando uma empresa ou agência cobra da pessoa para concorrer, com indício de prática contínua (padrão da ação do TRT-4 [11]). Decisão do dono com o(a) advogado(a).
- A operação **nunca** acusa a empresa em público pelo nome antes da apuração de 24 h.

**Denúncia contra pessoa** (empresa denuncia alguém): chega só com o conteúdo denunciado [Prod]. Ofensa ou ameaça → suspender a conta da pessoa em 24 h e registrar. A operação não vê o restante do perfil.

---

## 8. Protocolo de incidente de dados (LGPD)

**O que é incidente:** acesso indevido, vazamento, perda ou alteração de dado pessoal: chave exposta, lista enviada por engano, celular do operador perdido com WhatsApp aberto, invasão, pessoa recebendo dado de outra. Em dúvida, é incidente.

**Papéis:** a Gestão sem Caos é a controladora; o encarregado (DPO) é quem o dono nomear (HIPÓTESE: o próprio dono até ter alguém); o(a) advogado(a) revisa; o operador só **avisa e executa**, nunca comunica para fora.

**Prazo legal:** o controlador comunica à ANPD **e** às pessoas afetadas em **3 dias úteis** a partir de quando soube que o incidente envolveu dados pessoais, se houver risco ou dano relevante (Resolução CD/ANPD nº 15/2024; complemento em até 20 dias úteis). Confirmar com o(a) advogado(a) se o prazo dobra para agente de pequeno porte; **a operação trabalha sempre com 3 dias**.

| Prazo | O que fazer | Quem avisa quem |
|---|---|---|
| **Hora 0** | Parar o vazamento: trocar senha/chave, revogar acesso, apagar o envio errado, pausar a cidade (`pausada`) se precisar. Anotar data, hora e o que viu. **Não apagar registros** | Quem percebeu → operador(a) → dono, por telefone, na hora |
| **Até 4 h** | Avaliar: quais dados, quantas pessoas, que risco. Abrir o registro de incidente | Dono → advogado(a) |
| **Até 24 h** | Decidir com o(a) advogado(a) se há risco ou dano relevante; preparar o aviso e o formulário da ANPD | Advogado(a) ↔ dono |
| **Até 3 dias úteis** | Comunicar a ANPD (formulário no site) e as pessoas afetadas (e-mail pelo sistema + aviso no site) | Dono (ou encarregado) → ANPD e pessoas |
| **Até 20 dias úteis** | Complementar à ANPD; relatório final; mudança de processo | Dono + advogado(a) |

**Registro de incidente:** quando ocorreu; quando soubemos; como; dados envolvidos; número de pessoas; causa; o que foi feito; risco; quem foi avisado e quando; o que muda.

**Modelo de aviso às pessoas (base; o(a) advogado(a) ajusta):**

> **Assunto:** Aviso sobre os seus dados no Vagas sem Caos
>
> Olá. Em [data], descobrimos que [descrição simples]. Os dados envolvidos foram: [lista]. Já fizemos isto: [ação]. Recomendamos: [ex.: "desconfie de contato de empresa que você não escolheu; nunca pague nada para concorrer a vaga"]. Comunicamos o caso à Autoridade Nacional de Proteção de Dados. Dúvidas ou exclusão da conta: [e-mail do encarregado]. Pedimos desculpa. Gestão sem Caos.

**Celular do operador:** WhatsApp Business com senha e bloqueio; nenhuma lista de pessoas no aparelho; nunca fotografar tela.

---

## 9. Calendário das 13 semanas de Uruaçu

Base: proposta, seção 8 ("Calendário" [Marca]), com as metas de cidade pequena. "Dono" = decisão do dono; "Oper." = operador(a) da praça; "Equipe" = quem constrói o sistema; "Adv.", "Psic.", "Cont." = advogado(a), psicólogo(a), contador(a).

| Semana | Tarefa | Dono da tarefa | Pronto quando |
|---|---|---|---|
| **1** | Definir quem opera Uruaçu (pessoa da Gestão sem Caos ou parceiro); aprovar nomes e pedir busca no INPI | Dono | Nome escrito; pedido do INPI protocolado |
| 1 | Contratar psicólogo(a) para o parecer dos testes | Dono | Contrato assinado; parecer até a semana 4 |
| 1 | Lista das 30 empresas por segmento; clientes da consultoria em Uruaçu primeiro, se houver | Oper. | CSV com 30 linhas |
| 1 | Conferir as zonas e baixar o Novo Caged de Uruaçu (12 meses, por setor) para escolher as funções que mais contratam | Oper. | Zonas editadas; tabela de setores pronta |
| **2** | Contratar advogado(a) (termos, privacidade, RIPD, contrato do parceiro se houver) | Dono | Contrato assinado; termos até a semana 4 |
| 2 | Primeiras 10 autorizações de empresas | Oper. | 10 "sim" por escrito (WhatsApp vale) |
| 2 | Plano Pro e endereço `vagas.` aprovados | Dono | Aprovado |
| **3** | Cadastro assistido das 10 primeiras empresas e 10 vagas | Oper. | 10 `ativa`, 10 `publicado` (cidade ainda em lista de espera) |
| 3 | Reuniões com IFG e UEG, associação comercial e 3 admins de grupos/páginas | Oper. (dono abre a porta) | 5 reuniões marcadas |
| **4** | 15 vagas e 10 empresas no ar | Oper. | Meta do passo 5 |
| 4 | Termos e privacidade publicados; RIPD iniciado | Adv. + Equipe | Textos com versão no site |
| 4 | 1 escola + 3 grupos fechados; mutirão marcado; local reservado | Oper. | Kit de parcerias com os 4 registros |
| 4 | Parecer do(a) psicólogo(a) | Psic. | Parecer escrito |
| **5** | **Abrir Uruaçu** (status `ativa`) | Dono + Equipe | Site no ar; Canal criado |
| 5 | **1º mutirão** de cadastro + prova | Oper. + 3 voluntários | Critério do passo 8 |
| 5 | Boletim diário começa | Oper. | 5 dias seguidos |
| **6** | Post "vaga da semana"; rádio: proposta entregue | Oper. | Post publicado; rádio com data |
| 6 | Vagas sem interessado → ligar para a empresa | Oper. | Todas com ação |
| **7** | Primeiras entrevistas; cobrar resposta em até 7 dias | Oper. | Mediana ≤ 7 dias |
| 7 | Rádio: boletim semanal no ar | Oper. | 1ª veiculação |
| **8** | 3 contratações; 2 depoimentos autorizados | Oper. | Contador = 3 |
| 8 | 2º mutirão (bairro diferente do 1º) | Oper. | Critério do passo 8 |
| **9** | Empresas de fora da carteira (associação comercial, Sebrae, Sindicato Rural) | Oper. | 5 novas `ativa` |
| 9 | NFS-e pronta (teste com R$ 1) | Cont. | Nota de teste emitida e cancelada |
| **10** | Medir as metas (4.1); decidir "cobrar ou não" | Dono + Oper. | Decisão escrita |
| **11** | Piloto pago: oferecer a 5 empresas (preço de fundador) | Dono + Oper. | 5 propostas entregues |
| 11 | 3º mutirão | Oper. | Critério do passo 8 |
| **12** | 5 empresas pagaram; notas emitidas; receita líquida calculada | Oper. + Cont. | 5 pedidos `pago` + 5 NFS-e |
| **13** | Revisão: metas × realizado; plano dos meses 4–6; nome definitivo | Dono + todos | Relatório de 2 páginas |

---

## 10. Riscos e planos B

| Risco | Sinal (no painel) | Plano B | Quem decide |
|---|---|---|---|
| **Mural vazio** | `vagas_ativas` < 10 na semana 5 | Puxar diárias e bicos (só CNPJ/MEI) de comércio, eventos e serviços na BR-153; ligar de novo para os 30 da lista; adiar a abertura 2 semanas em vez de abrir com 5 vagas [Marca][Cid] | Dono |
| **Poucas pessoas** | < 150 com selo na semana 10 | Mutirão no IFG/UEG e em salão de igreja de outro bairro; boletim em 5 grupos; rádio | Oper. |
| **Cidade pequena, todo mundo se conhece** (medo de a empresa atual descobrir que a pessoa procura emprego) | Pessoas desistem no meio do cadastro | Reforçar: o cartão é cego, sem nome nem foto, até o Combinou; vaga confidencial para a empresa | Oper. |
| **Empresa não responde** | `primeira_resposta_empresa_dias` > 7 | Ligar; 2 avisos sem resposta → pausar a vaga e avisar as pessoas | Oper. |
| **Golpe usando a marca** | Denúncia ou notícia | Seção 7; alerta no Canal e no site no mesmo dia; boletim de ocorrência | Dono + Adv. |
| **Operador não entrega** | Passos 3–9 atrasados aos 60 dias | Aviso formal; troca aos 90; a Gestão sem Caos assume à distância até o novo | Dono |
| **Operador acessa dado indevido** | Registro de moderação ou denúncia | Suspender o acesso na hora; seção 8; rescisão | Dono + Adv. |
| **Pressão para cobrar da pessoa** | Pedido de cliente ou parceiro | Não. A pessoa não paga nada em Uruaçu (4.5) | Dono |
| **Julho esvazia ou lota** (exposição, férias no lago) | Vagas de diária sobem ou somem | Bloco "diárias" no boletim; mutirão fora de julho | Oper. |
| **Limite de e-mails** | `emails_mes` > 2.500 | Resumo diário em vez de aviso por candidatura; plano pago do e-mail [Prod] | Equipe |
| **Fraude no teste** | Notas altas com tempo baixo; mesmo padrão no mesmo IP | Prova presencial no mutirão; selo diz "online, sem supervisão"; 1 tentativa a cada 30 dias [Prod] | Equipe |
| **Rádio ou associação pedem exclusividade ou dinheiro** | Na negociação | Sem exclusividade; crédito "Vagas sem Caos, da Gestão sem Caos" e vaga destaque grátis por 3 meses (HIPÓTESE) | Dono |

---

## 11. O que depende do dono

Os 12 pontos da proposta (seção 10) continuam valendo. Para este manual, os que travam a operação:
1. **Quem opera Uruaçu:** pessoa da Gestão sem Caos ou parceiro local (se parceiro, revisar a minuta com o(a) advogado(a)).
2. Advogado(a) antes da semana 5 (termos, contrato, modelo de aviso de incidente).
3. Psicólogo(a) agora.
4. NFS-e com o contador; preços de Uruaçu e preço de fundador para o piloto.
5. Nomear o encarregado de dados.
6. Abrir as portas das parcerias (prefeitura, associação comercial, Sebrae, IFG/UEG, rádio).
7. Confirmar o slug `uruacu-go` e as zonas; conferir endereços e contatos das entidades antes de qualquer material impresso.

## 12. Fontes

Números entre colchetes seguem a numeração da proposta (`scratchpad/vagas/proposta.md`, seção 11): [10][11] decisões do TRT-4; [23] golpes de vaga (PSafe); [25] guia da ANPD (controlador e operador). Dados de Uruaçu: `scratchpad/vagas/uruacu.md` (IBGE Cidades; Novo Caged via Portal Contexto; MTE; IFG; UEG; Sebrae Goiás; rádios; jornais locais). Polícia Civil de Goiás, Delegacia Virtual: `goias.gov.br/policiacivil/delegacia-virtual/`. ANPD, Resolução CD/ANPD nº 15/2024.
