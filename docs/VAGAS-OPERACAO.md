# Vagas sem Caos · Manual de operação ("cidade em caixa")

*Gestão sem Caos · versão 1 · 13/10/2026. Base: a proposta aprovada do painel (`scratchpad/vagas/proposta.md`) e os relatórios de cidade pequena [Cid], marca [Marca], monetização [Mon] e produto [Prod]. Toda regra e todo número vêm de lá, com a fonte marcada. O que é proposta nova deste manual está marcado como **HIPÓTESE**.*

Este manual é o que uma pessoa recebe para **abrir e tocar uma praça** do Vagas sem Caos. Serve para Boa Vista (operada pela própria Gestão sem Caos) e para as praças seguintes (Rorainópolis, Caracaraí e Pacaraima, com parceiro local). Cada passo diz **quem faz, até quando e como se sabe que terminou**.

Peças que acompanham este manual (pasta `conteudo/vagas-operacao/`):

| Arquivo | Para quê |
|---|---|
| `contrato-parceiro-MINUTA.md` | Minuta do contrato do parceiro de praça (para o(a) advogado(a) revisar) |
| `script-venda-empresa.md` | Abordagem de 5 minutos para a empresa, porta a porta e por WhatsApp |
| `roteiro-mutirao.md` | Como fazer o mutirão de cadastro e a prova presencial |
| `kit-parcerias.md` | Propostas de 1 página para prefeitura/Sine, Sebrae, CDL, escolas, rádio, igrejas e entidades de migrantes |
| `lista-empresas-modelo.csv` | Modelo da lista das 30 primeiras empresas |
| `boletim-e-radio.md` | Modelos do boletim diário, do post semanal e do spot de rádio |
| `indicadores.json` | Os números do painel da praça (chave, definição, fórmula, alvo) |

Vocabulário fixo (proposta, seção 2 e 7): **Vagas sem Caos** (sempre por inteiro), **Combinou** (nunca "match" em tela, nunca "Tinder"), **Quero / Pular** (pessoa), **Quero conversar / Agora não** (empresa), **selo de habilidade** / "habilidade testada" (nunca "currículo verificado"), **a pessoa** (quem procura emprego), **praça** (cidade-polo + entorno).

---

## 1. Papéis

| Papel | Quem é | O que faz | O que NÃO faz |
|---|---|---|---|
| **Gestão sem Caos (equipe central)** | O dono + quem ele designar | Tecnologia, marca, jurídico, LGPD (é a **controladora** dos dados [Cid]), preços, status das cidades, contrato e troca de parceiros, repasse mensal, decisão final de denúncia grave, incidente de dados | Não delega preço, status de cidade nem decisão sobre parceiro |
| **Pessoa dedicada em Boa Vista** ("operador(a) da praça") | Uma pessoa da consultoria, dedicada nos 90 dias (proposta, 10.7) | Vende para empresas, confere CNPJ e vaga, modera em até 24 h, faz cadastro assistido, organiza mutirão e prova presencial, publica o boletim, cuida do canal de WhatsApp, acompanha o painel da praça | Não vê currículo nem contato da pessoa (só o conteúdo denunciado) [Prod]; não mexe em preço nem em outros operadores |
| **Parceiro de praça** (a partir da 2ª praça) | Contador(a), consultor(a), alguém da CDL ou de rádio [Cid] | O mesmo que a pessoa dedicada, na praça dele; é **operador** de dados, com contrato e cada ato registrado [Prod] | Idem acima; além disso não usa a base para si (vira controlador pela LGPD [25]), não subcontrata, não fixa preço |
| **Advogado(a)** (trabalhista + LGPD) | Contratado(a) pelo dono antes da semana 5 (proposta, 10.3) | Termos, privacidade, RIPD, contrato do parceiro, parecer sobre extras pagos pela pessoa, revisão de cada incidente de dados, orientação em golpe com vítima | Não decide produto |
| **Psicólogo(a)** | Contratado(a) pelo dono agora (proposta, 10.4) | Confirma, por escrito, que os 5 testes medem só conhecimento prático; revisa o texto do selo; é responsável técnico(a) só se um dia houver DISC em seleção | Não participa da moderação |
| **Contador(a)** | O(a) da Gestão sem Caos | NFS-e das vendas e do repasse (proposta, 10.5); confere a nota do parceiro; calcula a receita líquida do mês | Não confere CNPJ de cliente (isso é do operador) |

Regra de ouro dos dados (proposta, seção 6.3): a Gestão sem Caos é controladora; operador e parceiro só executam instruções escritas; **ninguém da operação vê o currículo ou o contato de uma pessoa**. O sistema não dá esse acesso (RPCs `vagas_op_*` só devolvem empresa, anúncio, denúncia e moderação).

---

## 2. Passo a passo para abrir uma praça

Ordem fixa (proposta, seção 5, "abrir uma cidade em cerca de 90 dias"): lista de espera → contrato do parceiro → 20 a 30 empresas e vagas **antes** das pessoas → canal de WhatsApp → parcerias → mutirão de abertura → boletim diário → cobrar só depois da meta.

| # | Passo | Responsável | Prazo | Critério de "pronto" |
|---|---|---|---|---|
| 0 | **Pôr a cidade em lista de espera** (status `lista_espera`; zonas cadastradas) | Equipe central | Dia 0 | A cidade aparece no site com "Avise-me quando chegar" e o contador de interessados funciona (`vagas_lista_espera`) |
| 1 | **Escolher o parceiro** (em Boa Vista: nomear a pessoa dedicada) | Dono | Até dia 15 | 3 candidatos entrevistados com o roteiro da seção 2.1; 1 escolhido por escrito |
| 2 | **Assinar o contrato do parceiro** (minuta em `conteudo/vagas-operacao/contrato-parceiro-MINUTA.md`, revisada pelo(a) advogado(a)) | Dono + advogado(a) | Até dia 20 | Contrato assinado; conta de operador criada pela função `vagas-conta` (ação `operador`); treinamento de 4 h feito e registrado |
| 3 | **Lista das 30 empresas** (`lista-empresas-modelo.csv`); em Boa Vista, os clientes da consultoria são a semente (proposta, 10.9) | Operador(a) | Semana 1 | 30 linhas preenchidas com nome, CNPJ, contato, segmento e funções; cada uma com "próximo passo" marcado |
| 4 | **Cadastrar 20 a 30 empresas e as vagas** (cadastro assistido: `vagas_op_empresa_cadastrar` + `vagas_op_vincular_membro`; vaga com faixa salarial ou valor da diária, obrigatórios) | Operador(a) | Semana 4 (BV) / dia 45 (praça pequena) | ≥ 20 empresas `ativa` (CNPJ conferido) e ≥ 30 vagas `publicado`, cobrindo as 6 funções (proposta: atendimento/recepção, caixa, vendas no balcão, auxiliar administrativo, serviços gerais, entregador(a)) |
| 5 | **Criar o canal de WhatsApp da praça** (Canal, não grupo; só vaga verificada; regras em `boletim-e-radio.md`) | Operador(a) | Semana 4 | Canal criado com nome "Vagas sem Caos · [cidade]", descrição com a frase anti-golpe e link do site; 3 admins dos grupos locais avisados |
| 6 | **Fechar parcerias** (`kit-parcerias.md`): 1 escola + 3 grupos/admins até a semana 4 (proposta, 10.10); rádio, CDL, Sebrae, prefeitura/Sine, igrejas, entidades de migrantes | Dono (abre a porta) + operador(a) (executa) | Semana 4 (mínimo) / semana 8 (resto) | Mínimo: 1 escola com data de prova marcada e 3 grupos repostando o boletim; cada parceria com nome do contato, o que a entidade ganha e o que ela dá, registrados no kit |
| 7 | **Mutirão de abertura** (`roteiro-mutirao.md`; prova de 15 questões, até 20 min, selo com nota 60 ou mais, marcado `presencial`) | Operador(a) + 3 voluntários | Semana 5 (BV) / dia 60 (praça pequena) | ≥ 80 pessoas atendidas (HIPÓTESE), ≥ 60 contas confirmadas por e-mail, ≥ 40 provas presenciais aplicadas, lista de checagem assinada |
| 8 | **Boletim diário no ar** | Operador(a) | A partir do dia seguinte ao mutirão | Boletim publicado todo dia útil até 9h no Canal (teste: 5 dias seguidos sem falhar) |
| 9 | **Primeiras contratações e depoimentos** | Operador(a) | Semanas 7–8 | 10 contratações marcadas pela empresa (`vagas_marcar_contratada`) em BV / 3 na praça pequena; 2 depoimentos autorizados por escrito |
| 10 | **Abrir para empresas de fora da carteira** (CDL, Sebrae) | Operador(a) | Semanas 9–10 | 10 empresas novas `ativa` que não eram clientes da consultoria |
| 11 | **Medir as metas antes de cobrar** (seção 4) | Equipe central | Semana 10 | Painel da praça com todos os números da seção 6 preenchidos; decisão escrita "cobrar / não cobrar ainda" |
| 12 | **Piloto pago com 5 empresas** (preço de fundador, HIPÓTESE: 50% por 6 meses; tudo pago antes, sem renovação automática) | Dono + operador(a) + contador(a) | Semanas 11–12 | 5 empresas pagaram ao menos 1 item (destaque, "urgente hoje" ou vaga assistida); NFS-e emitida para cada uma; primeiro cálculo de receita líquida feito |
| 13 | **Revisão de 13 semanas** | Dono + equipe | Semana 13 | Relatório de 2 páginas: metas × realizado, o que muda, decisão sobre a próxima praça (gatilhos da seção 4) |

### 2.1 Como escolher o parceiro (HIPÓTESE de roteiro)

Perfil (proposta, seção 5): rede comercial na cidade e reputação em jogo. Entrevista de 40 minutos, com 5 perguntas:
1. "Quantas empresas da cidade você conhece pelo nome do dono?" (meta: ≥ 30).
2. "Você já vendeu algo porta a porta? O quê, para quem?"
3. "Tem local para aplicar uma prova com 10 pessoas sentadas e tomada?"
4. "Você aceita não ver os dados de quem procura emprego, nunca?" (quem hesita, não serve).
5. "Quantas horas por semana você dedica nos 90 primeiros dias?" (mínimo: 15 h, HIPÓTESE).

Eliminatórios: já ter cobrado dinheiro de quem procura emprego; ter empresa de "agenciamento" (cobra taxa); CNPJ com pendência que impeça nota fiscal.

---

## 3. Rotina do(a) operador(a)

### 3.1 Todo dia útil (cerca de 2 h, HIPÓTESE)

| Hora | Tarefa | Como sabe que terminou |
|---|---|---|
| 8h00 | **Moderação** (`vagas_op_anuncios` com filtro `em_revisao`; `vagas_op_empresas` com `em_analise`) | Fila zerada: nenhuma vaga ou empresa esperando há mais de 24 h. Para cada decisão, motivo em uma frase (fica em `vagas_moderacao`) |
| 8h30 | **Denúncias** (`vagas_op_denuncias`, filtro `aberta`) | Nenhuma denúncia aberta há mais de 24 h (proposta, seção 9: 24 h, HIPÓTESE). Golpe → protocolo da seção 7 |
| 8h45 | **Referências profissionais** com texto livre esperando moderação (seção 3.3) | Nenhuma referência esperando há mais de 24 h; cada recusa com motivo da lista |
| 9h00 | **Boletim diário** ("Copiar boletim do dia" no painel → colar no Canal) [Prod] | Boletim no Canal antes das 9h, só com vagas `publicado` |
| 9h15 | **Fila de contato** (WhatsApp da praça): perguntas de empresa e de pessoas | Toda mensagem recebida até 18h do dia anterior respondida |
| 10h–12h | **Venda**: 3 visitas ou 10 contatos de WhatsApp com empresas (`script-venda-empresa.md`) | Linhas atualizadas na lista de empresas com "próximo passo" e data |
| Fim do dia | **Olhar o painel**: vagas sem interessado há 72 h; empresas sem responder há 5 dias | Empresa sem resposta há 5 dias recebe mensagem ("tem 4 pessoas esperando resposta na sua vaga") |

**Conferência de CNPJ e vaga (critério de aprovar):** consulta pública do CNPJ na Receita Federal com situação "ATIVA"; nome e atividade combinam com a vaga; endereço na praça; sem palavra bloqueada no anúncio (taxa, Pix, link encurtado, telefone, "boa aparência", "até N anos", "solteira" — proposta, seção 6.5); salário ou diária informado. Qualquer falha → `remover` com motivo claro (a empresa pode corrigir e reenviar).

### 3.2 Toda semana

| Dia | Tarefa | Responsável | Pronto quando |
|---|---|---|---|
| Segunda | Post "vaga da semana" (modelo em `boletim-e-radio.md`) | Operador(a) | Publicado no Instagram/Facebook da Gestão sem Caos e repostado por ≥ 3 grupos |
| Terça | Boletim para a rádio (texto de 30 s + lista de 5 vagas) enviado | Operador(a) | E-mail/WhatsApp enviado até 12h |
| Quarta | Revisão das vagas paradas: sem interessado há 7 dias → ligar para a empresa (faixa salarial? zona? exigência demais?) | Operador(a) | Cada vaga parada com uma ação anotada |
| Quinta | Contato com 1 escola/parceiro: data da próxima prova presencial | Operador(a) | Agenda do mês com ≥ 1 mutirão marcado |
| Sexta | **Números da semana** para a equipe central (os 10 do painel, seção 6) + lista de riscos | Operador(a) | Mensagem enviada até 17h; equipe central responde até segunda |

### 3.3 Referência profissional: moderação e uso pela operação

Acréscimo aprovado pelo dono em 13/10 (registrado na mesa de equipe): uma **empresa verificada** pode dar uma **referência profissional pública** sobre uma pessoa que trabalhou nela. É sempre positiva e factual (período, função, vínculo, até 3 pontos fortes de lista fechada, "recomendaria para", texto livre opcional de até 300 caracteres e a declaração de que a pessoa trabalhou lá). Só aparece depois que **a pessoa aceita**; ela pode ocultar ou excluir a qualquer hora. Não existe referência negativa, estrela, média ou ranking.

**O que o operador modera.** Só o **texto livre** e a coerência dos dados (período, função, vínculo). Os pontos fortes vêm de lista fechada e não passam por moderação. O operador vê a referência pelo painel de moderação sem ver o restante do perfil da pessoa (continua valendo: nada de currículo nem contato).

| Regra | Como |
|---|---|
| **Prazo** | Decidir em até **24 h** da entrada na fila (mesma regra das vagas); a referência só é oferecida à pessoa depois de aprovada, para ela não aceitar algo que depois será removido |
| **Aprovar** | Texto factual sobre trabalho; período e função plausíveis para a empresa; sem nada da lista de recusa |
| **Recusar (motivos fechados; escolher 1 e escrever 1 frase)** | (1) dado sensível ou pessoal (saúde, religião, família, "mãe solteira", nacionalidade, idade, "boa aparência"); (2) contato ou link (telefone, e-mail, @, Pix); (3) comparação ou julgamento sobre outra pessoa; (4) linguagem negativa disfarçada ("apesar de…", "melhorou muito", "quando quer, trabalha"); (5) promessa ou propaganda da empresa; (6) período/função incompatíveis (ex.: empresa aberta em 2025 e referência de 2022; função que a empresa não tem); (7) texto copiado em série (mesmo texto para várias pessoas); (8) conteúdo que não é sobre trabalho |
| **Recusa não é "nota"** | A empresa recebe o motivo e pode corrigir e reenviar; a pessoa **não** é avisada de uma referência recusada antes de aceitar (ela nunca soube que existia) |
| **Limite** | **1 referência por empresa por pessoa** e **no máximo 20 referências por empresa por mês** (HIPÓTESE). O sistema bloqueia; se uma empresa pedir mais, o operador **não** abre exceção: registra em Pendências e a equipe central decide (empresa com 200 funcionários legítimos pode ter limite maior em aditivo) |
| **Referência falsa** (empresa que não existe de verdade, pessoa que nunca trabalhou lá, "troca de favores" entre contas) | Remover a referência (`removida`, motivo), suspender a empresa (`suspender`, "referência falsa"), registrar na moderação e avisar a equipe central no mesmo dia. Sinais: várias referências no mesmo minuto; referências cruzadas entre a mesma dupla de contas; empresa `ativa` há menos de 7 dias dando 10 referências; período anterior à abertura do CNPJ. A pessoa que aceitou referência que sabia ser falsa: conta `suspensa` após apuração (24 h) |
| **Referência coagida** (a pessoa relata que foi pressionada a pedir/aceitar, ou que a empresa condicionou pagamento, rescisão ou "carta" à aceitação) | Tratar como denúncia (seção 7, prazo 24 h): ocultar a referência de imediato a pedido da pessoa (ela mesma pode), ouvir a empresa, registrar. Reincidência → suspensão da empresa. Nunca pedir à pessoa "prova" além do relato dela; nunca contar à empresa quem relatou |
| **Denúncia de referência** | Chega por `vagas_denunciar` (alvo: referência) com o texto denunciado; mesmo prazo e registro |

**Como o operador usa a referência sem virar "lista de bons e maus"** (regras fixas):
1. A referência é da pessoa, não da operação: o operador **nunca** monta, guarda ou compartilha lista de "quem tem referência" ou "quem não tem"; o sistema nem dá esse acesso.
2. **Mutirão:** a mesa só informa e oferece: "Você já trabalhou em alguma empresa daqui? Dá para pedir uma referência profissional a ela pelo site; a empresa escreve, você aceita se quiser e ela fica pública no seu perfil." A pessoa decide; a mesa não liga para a empresa nem preenche nada. No mutirão de empresas (CDL/Sebrae), a fala é: "Pessoas boas que passaram por aqui? Ofereça uma referência: leva 2 minutos e ela aparece com o nome da sua empresa."
3. **Vaga assistida:** a lista curta que a operação entrega segue **só** os filtros fechados da vaga (selo, zona, experiência, escolaridade, turno, CNH, pretensão) em ordem de chegada; "tem referência" pode ser um filtro **se a empresa pedir**, como "tem selo" (contagem ≥ 1), nunca ordenação por quantidade, nunca leitura do texto pelo operador para escolher.
4. Não existe lista de "sem referência", "referência recusada" ou "referência ocultada" para ninguém; ausência de referência não é critério de nada e nunca é mencionada à empresa.
5. O operador não dá referência (não é empresa) e não pede referência em nome de ninguém.
6. Toda recusa, remoção e suspensão por referência fica em `vagas_moderacao` e entra no relatório mensal só como **número** (ex.: "14 referências moderadas, 2 recusadas, 0 falsas").

### 3.4 Todo mês

- **Mutirão de cadastro + prova presencial:** no mínimo 1 por mês por praça (proposta, seção 4, decisão do painel). Roteiro em `roteiro-mutirao.md`.
- **Fechamento do repasse** (a partir da 2ª praça): contador(a) calcula receita líquida = pago − estorno − taxa [Prod]; parceiro emite nota; Pix até o dia 10 (HIPÓTESE).
- **Limpeza**: vagas `publicado` há mais de 30 dias sem renovação → avisar a empresa e encerrar em 7 dias se não responder.
- **Relatório de 1 página** ao dono: metas × realizado, 3 problemas, 3 pedidos.

---

## 4. Metas e gatilhos

Todos os números são da proposta (seções 4, 5 e 9). O que está marcado como HIPÓTESE lá continua HIPÓTESE aqui.

### 4.1 Antes de cobrar a empresa

| | Boa Vista [Marca] | Cidade de 20–40 mil (HIPÓTESE) |
|---|---|---|
| Por função | 40 pessoas com selo e 5 vagas ativas | — |
| Empresas ativas | 30 | 10 |
| Vagas ativas | (5 por função × 6 funções = 30) | 15 |
| Pessoas com selo | (40 × 5 testes = 200) | 150 |
| Vagas com 3 interessados testados | 70% em 72 h | 70% em 7 dias |
| Contratações | 10 | 3 |

**Gatilho:** só quando **todas** as linhas forem atingidas e o painel da semana 10 estiver fechado. Em Boa Vista, a cobrança começa nas semanas 11–12, com 5 empresas e preço de fundador. Enquanto não bater, continua grátis e a mensagem para a empresa é "grátis no lançamento".

### 4.2 Praça "viva" (em 6 meses) [Cid]

| | Boa Vista | Cidade de 20–40 mil |
|---|---|---|
| Vagas ativas | 150 | 20 |
| Pessoas com selo | 3.000 | 400 |
| Empresas ativas por mês | 80 | 15 |
| Empresas pagantes | 25 | 5 |
| Primeira resposta da empresa | até 7 dias | até 7 dias |

### 4.3 Abrir a próxima praça (HIPÓTESE da proposta)

Os três ao mesmo tempo:
1. praça atual "viva" por 2 meses seguidos;
2. 200 pessoas na lista de espera da próxima;
3. parceiro assinado.

Ordem: Boa Vista (com Mucajaí e Cantá) → Rorainópolis → Caracaraí → Pacaraima (só com tela em espanhol e reforço anti-golpe).

### 4.4 Trocar o parceiro

Regra da proposta: **90 dias sem entrega, troca** [Cid]. "Entrega" na praça pequena = os passos 3 a 8 da seção 2 feitos no prazo **ou** a meta "antes de cobrar" atingida. Aviso formal aos 60 dias com o que falta; aos 90, rescisão conforme o contrato (cláusula de prazo e rescisão da minuta). Também é motivo de troca imediata: acesso indevido a dado de pessoa, cobrança de quem procura emprego, uso da base para fins próprios.

### 4.5 Liberar extras pagos pela pessoa (só Boa Vista; proposta, seção 4)

Não antes do mês 9 (HIPÓTESE) e só com: parecer escrito do(a) advogado(a); 150 vagas ativas; 20 empresas buscando no banco por semana durante 8 semanas; tela "quem viu meu contato" no ar. Até lá, **ninguém da operação vende nada para a pessoa**.

---

## 5. Limites que a operação nunca cruza

1. **Nunca pedir dinheiro a quem procura emprego**, em nenhum canal, nem "para o certificado" (proposta, seção 6.1; decisões do TRT-4 [10][11]).
2. Nunca cadastrar uma pessoa sem ela confirmar pelo e-mail dela (a conta nasce `pendente`) [Prod].
3. Nunca pedir foto, idade, gênero, estado civil, filhos, gravidez, cor, religião, nacionalidade, saúde ou antecedentes (proposta, seção 6.4).
4. Nunca usar disparador não oficial de WhatsApp [Prod]; nunca mandar lista de pessoas para empresa por WhatsApp.
5. Nunca prometer emprego, prazo, "perfil ideal" ou "compatibilidade"; nunca dizer "aprovado/reprovado" sobre teste [Marca].
6. Nunca falar em DISC antes de "contratada" (proposta, seção 6.7).
7. Nunca escrever "Notus" em nada que cliente ou pessoa veja (CLAUDE.md).

---

## 6. O painel da praça

Lista fechada dos números (proposta, seção 9), com a origem de cada um. A definição exata, a fórmula e os alvos estão em `conteudo/vagas-operacao/indicadores.json` (chaves abaixo), para a equipe de banco e de telas usarem. Tudo sai das tabelas `vagas_*` filtradas por `cidade_id` da praça; a RPC esperada é `vagas_op_resumo()` (contrato da fundação).

| # | Chave | Número | De onde sai | Alvo BV / pequena |
|---|---|---|---|---|
| 1 | `vagas_ativas` | Vagas ativas | `vagas_anuncios` com status `publicado` (CLT + diária + bico + estágio) | 150 / 20 |
| 2 | `pessoas_com_selo_por_funcao` | Pessoas com selo, por teste | `vagas_selos` válidos (12 meses), contados por teste e por pessoa, na praça | 40 por função no lançamento; 3.000 / 400 no total aos 6 meses |
| 3 | `vagas_3_interessados_72h` | % de vagas com 3 interessados testados em 72 h | Para cada anúncio publicado há ≥ 72 h: conta `vagas_candidaturas` criadas até 72 h após `publicado_em` cujo autor tem selo válido; vaga "ok" se ≥ 3 | 70% (72 h BV; 7 dias praça pequena) |
| 4 | `vagas_combinou_7d` | % de vagas com Combinou em 7 dias | Anúncios publicados há ≥ 7 dias que têm ≥ 1 candidatura `combinou` (ou `contratada`) até 7 dias após `publicado_em` | Medir (HIPÓTESE: 60%) |
| 5 | `primeira_resposta_empresa_dias` | Primeira resposta da empresa (mediana, em dias) | Por candidatura: tempo entre `enviada` e a primeira mudança para `conversar` ou `agora_nao`; mediana da praça nos últimos 30 dias | ≤ 7 dias |
| 6 | `contratacoes` | Contratações | `vagas_candidaturas` com status `contratada` (data da marcação), acumulado e no mês | 10 no lançamento / 3 |
| 7 | `empresas_ativas_mes` | Empresas ativas por mês | Empresas `ativa` com ≥ 1 ação no mês (publicar, decidir candidatura, mensagem) | 80 / 15 |
| 8 | `empresas_buscando_semana` | Empresas buscando no banco por semana | Empresas distintas que usaram a busca do banco na semana (fase 2; até lá, zero) | 20 (BV) |
| 9 | `empresas_pagantes` | Empresas pagantes (mês) | Pedidos pagos no mês, por empresa distinta, com `cidade_id` da praça | 25 / 5 |
| 10 | `receita_liquida_centavos` | Receita líquida (mês) | pago − estorno − taxa, em centavos [Prod] | Acompanhar; base do repasse |
| 11 | `denuncia_tempo_decisao_h` | Tempo para decidir uma denúncia (mediana, horas) | `vagas_denuncias`: `decidida_em` − `criada_em`, últimas 30 | ≤ 24 h (HIPÓTESE) |
| 12 | `emails_mes` | E-mails enviados no mês | Tabela de envios de e-mail (`envios_email`), filtrada pelo produto vagas | < ~3.000 (limite do plano grátis) [Prod] |
| 13 | `fila_moderacao` | Itens esperando moderação há > 24 h | Anúncios `em_revisao` + empresas `em_analise` + referências profissionais com texto esperando moderação, com mais de 24 h | 0 |
| 14 | `lista_espera` | Pessoas na lista de espera (praça seguinte) | `vagas_lista_espera` por cidade | 200 para abrir a próxima |
| 15 | `cadastros_assistidos_confirmados` | Cadastros assistidos confirmados (mutirão) | Contas criadas pela ação `assistido` que passaram de `pendente` a `ativa` | ≥ 60 por mutirão (HIPÓTESE) |

Os números 1 a 12 são os da proposta; 13 a 15 são **HIPÓTESE** deste manual (ajudam a tocar a rotina). O painel mostra os números com o alvo ao lado e a cor: verde (bateu), amarelo (≥ 70% do alvo), vermelho.

---

## 7. Protocolo de golpe e denúncia

Contexto: mais de 600 mil tentativas de golpe de vaga falsa em 6 meses, a maioria cobrando "taxa do processo" ou colhendo CPF e dados bancários [23]. O sistema já bloqueia "taxa", Pix, link encurtado e telefone no anúncio, exige CNPJ ativo e tira a vaga do ar com 3 denúncias de contas diferentes (proposta, seção 6.5). O que segue é o que a **pessoa** da operação faz.

**Entrada:** botão "Denunciar" (anúncio ou mensagem → `vagas_denunciar`), mensagem no WhatsApp da praça, aviso de parceiro ou notícia.

| Prazo | O que fazer | Quem | Pronto quando |
|---|---|---|---|
| **Até 1 h** (horário comercial) | Ler a denúncia. Se há pedido de dinheiro, Pix, "taxa", documento ou dado bancário: **remover o anúncio** (`vagas_op_anuncio_decidir` → `remover`) e **suspender a empresa** (`vagas_op_empresa_decidir` → `suspender`, motivo "suspeita de golpe"). Responder a quem denunciou: "Recebemos. A vaga saiu do ar. Não pague nada a ninguém." | Operador(a) | Anúncio fora do ar; empresa suspensa; resposta enviada |
| **Até 24 h** | Apurar: CNPJ na Receita; telefone/WhatsApp do anúncio bate com a empresa? Ligar para o número oficial da empresa (não o do anúncio). Decidir a denúncia (`vagas_op_denuncia_decidir`) com motivo. Se foi engano: reativar e pedir desculpa por escrito. Se foi golpe: manter suspenso, avisar **todas** as pessoas que tiveram contato liberado com essa vaga (a lista sai de `vagas_acessos_contato`; o aviso é enviado pelo sistema, não pelo operador, porque ele não vê quem são) e publicar o alerta no Canal ("Atenção: a vaga X, da empresa Y, foi retirada. Se alguém pediu dinheiro em nome dela, não pague e denuncie."). Avisar a equipe central. | Operador(a) + equipe central | Denúncia decidida; pessoas avisadas; alerta publicado |
| **Até 7 dias** | Registro escrito (1 página): o que houve, quem foi afetado (só números, sem nomes), o que foi feito, o que muda (palavra nova na lista de bloqueio? conferência extra?). Equipe central decide se outras praças precisam do aviso. | Equipe central | Registro no arquivo de incidentes; mudança aplicada |

**Quando acionar polícia ou Procon**
- **Polícia Civil de Roraima** (Delegacia Virtual em `pc.rr.gov.br`, com login gov.br, aceita estelionato; conferir antes se ainda é assim): sempre que **alguém pagou** ou entregou documento/dado bancário, ou quando houver uso do nome "Gestão sem Caos" / "Vagas sem Caos" em golpe. Quem registra o boletim é a **vítima**; a operação ajuda com prints, datas, o CNPJ e o texto do anúncio, e a Gestão sem Caos registra um boletim próprio quando a marca foi usada (decisão do dono com o(a) advogado(a)).
- **Procon** (estadual, municipal de Boa Vista ou o da Assembleia): quando a reclamação é de **consumo** (empresa cobrou algo da pessoa por "curso obrigatório", "kit", "certificado"), não de crime.
- **Ministério Público do Trabalho (MPT)**: quando uma empresa ou agência cobra da pessoa para concorrer, com indício de prática contínua (é o padrão da ação do TRT-4 [11]). Decisão do dono com o(a) advogado(a).
- **Nunca** a operação acusa a empresa em público pelo nome antes da apuração de 24 h; o alerta do Canal diz "a vaga X saiu do ar", e só depois do boletim diz o nome.

**Denúncia contra pessoa** (empresa denuncia candidato): chega só com o conteúdo denunciado [Prod]. Mensagem com ofensa ou ameaça → suspender a conta da pessoa (`suspensa`) em 24 h e registrar. A operação **não** vê o restante do perfil dela.

---

## 8. Protocolo de incidente de dados (LGPD)

**O que é incidente:** acesso indevido, vazamento, perda ou alteração de dado pessoal: por exemplo, chave de API exposta, lista de contatos enviada por engano, celular do operador perdido com WhatsApp aberto, invasão, pessoa recebendo dado de outra. Em dúvida, trate como incidente.

**Papéis:** a Gestão sem Caos é a controladora e o encarregado (DPO) é quem o dono nomear (**HIPÓTESE:** o próprio dono até ter alguém); o(a) advogado(a) revisa tudo; o parceiro/operador só **avisa e executa**, nunca comunica para fora.

**Prazo legal:** o controlador comunica à ANPD **e** às pessoas afetadas em **3 dias úteis** a partir do momento em que soube que o incidente envolveu dados pessoais, quando houver risco ou dano relevante (Resolução CD/ANPD nº 15/2024; informações complementares em até 20 dias úteis). Confirmar com o(a) advogado(a) se o prazo dobra para agente de pequeno porte; **a operação trabalha sempre com 3 dias**.

| Prazo | O que fazer | Quem avisa quem |
|---|---|---|
| **Hora 0** (ao perceber) | Parar o vazamento: trocar a senha/chave, revogar o acesso, apagar o envio errado, pausar a cidade (`pausada`) se precisar. Anotar data, hora e o que viu. **Não apagar registros** (logs) | Quem percebeu → operador(a) → dono, por telefone, na hora |
| **Até 4 h** | Equipe central avalia: quais dados, quantas pessoas, risco (contato? currículo? senha?). Abre o registro de incidente (modelo abaixo) | Dono → advogado(a) |
| **Até 24 h** | Decidir com o(a) advogado(a) se há "risco ou dano relevante". Preparar o aviso às pessoas e o formulário da ANPD | Advogado(a) ↔ dono |
| **Até 3 dias úteis** | Comunicar a ANPD (formulário no site da ANPD) e as pessoas afetadas (e-mail pelo sistema + aviso no site). O parceiro só é informado do que fazer na praça | Dono (ou encarregado) → ANPD e pessoas |
| **Até 20 dias úteis** | Complementar à ANPD; relatório final; mudança de processo | Dono + advogado(a) |

**Registro de incidente (preencher sempre):** data/hora em que ocorreu; data/hora em que soubemos; como soubemos; dados envolvidos; número de pessoas; causa; o que já foi feito; risco para as pessoas; quem foi avisado e quando; o que muda.

**Modelo de aviso às pessoas (texto base; o(a) advogado(a) ajusta):**

> **Assunto:** Aviso sobre os seus dados no Vagas sem Caos
>
> Olá. Em [data], identificamos que [descrição simples: ex. "uma mensagem com o seu nome e telefone foi enviada por engano para uma empresa que não era a da sua candidatura"]. Os dados envolvidos foram: [lista]. Já [o que foi feito: ex. "pedimos a exclusão da mensagem e confirmamos por escrito que ela foi apagada"]. O que recomendamos: [ex. "desconfie de contato de empresa que você não escolheu; nunca pague nada para concorrer a vaga"]. Comunicamos o caso à Autoridade Nacional de Proteção de Dados. Para dúvidas ou para excluir a sua conta: [e-mail do encarregado]. Pedimos desculpa. Gestão sem Caos.

**Celular do operador:** só WhatsApp Business com senha e bloqueio; nada de lista de pessoas salva no aparelho; os cartões cegos nunca são fotografados.

---

## 9. Calendário das 13 semanas de Boa Vista

Base: proposta, seção 8 ("Calendário" [Marca]). "Dono" = decisão do dono; "Oper." = pessoa dedicada; "Equipe" = quem constrói o sistema; "Adv." = advogado(a); "Psic." = psicólogo(a); "Cont." = contador(a).

| Semana | Tarefa | Dono da tarefa | Pronto quando |
|---|---|---|---|
| **1** | Nomear a pessoa dedicada; aprovar nomes e pedir busca no INPI | Dono | Nome escrito; pedido do INPI protocolado |
| 1 | Contratar psicólogo(a) para o parecer dos testes | Dono | Contrato assinado; prazo do parecer: semana 4 |
| 1 | Lista das 30 empresas (clientes como semente) | Oper. | CSV com 30 linhas e "autorização pedida" |
| 1 | Escolher as 6 funções e conferir os 5 testes com a equipe | Oper. + Equipe | Lista das funções fechada; testes em revisão |
| **2** | Contratar advogado(a) (termos, privacidade, RIPD, contrato do parceiro) | Dono | Contrato assinado; termos prontos até a semana 4 |
| 2 | Primeiras 10 autorizações de empresas | Oper. | 10 "sim" por escrito (WhatsApp vale) |
| 2 | Pedir o plano Pro e o endereço `vagas.` | Dono | Aprovado |
| **3** | Cadastro assistido das 10 primeiras empresas e 15 vagas | Oper. | 10 `ativa`, 15 `publicado` (ninguém vê ainda: cidade em `lista_espera`) |
| 3 | Abrir conversa com 1 escola (Senac/IFRR/faculdade) e 3 admins de grupos de vagas | Oper. (Dono abre a porta) | 4 reuniões marcadas |
| **4** | 20 empresas e 30 vagas no ar | Oper. | Meta do passo 4 batida |
| 4 | Termos e privacidade publicados; RIPD iniciado | Adv. + Equipe | Textos no site com versão |
| 4 | 1 escola + 3 grupos fechados; data do mutirão marcada; local reservado | Oper. | Kit de parcerias com os 4 registros |
| 4 | Parecer do(a) psicólogo(a) sobre os testes | Psic. | Parecer escrito recebido |
| **5** | **Abrir a cidade** (status `ativa`) | Dono + Equipe | Site no ar; Canal criado |
| 5 | **1º mutirão** de cadastro + prova | Oper. + 3 voluntários | Critério do passo 7 |
| 5 | Boletim diário começa | Oper. | 5 dias seguidos |
| **6** | Post "vaga da semana" começa; rádio: primeiro contato | Oper. | Post publicado; rádio com data |
| 6 | Revisão da semana: vagas sem interessado → ligar para a empresa | Oper. | Todas as vagas paradas com ação |
| **7** | Primeiras entrevistas; cobrar resposta das empresas em até 7 dias | Oper. | Mediana de primeira resposta ≤ 7 dias |
| 7 | Rádio: boletim semanal no ar (spot de 30 s) | Oper. | 1ª veiculação confirmada |
| **8** | 10 contratações marcadas; 2 depoimentos autorizados | Oper. | Contador de contratações = 10 |
| 8 | 2º mutirão | Oper. | Critério do passo 7 |
| **9** | Abrir para empresas de fora da carteira (CDL, Sebrae) | Oper. | 5 novas `ativa` |
| 9 | NFS-e pronta para emitir (teste com R$ 1) | Cont. | Nota de teste emitida e cancelada |
| **10** | Medir as metas (seção 4.1); decisão "cobrar ou não" | Dono + Oper. | Decisão escrita |
| 10 | 10 empresas novas `ativa` fora da carteira | Oper. | Contador = 10 |
| **11** | Piloto pago: oferecer a 5 empresas (preço de fundador) | Dono + Oper. | 5 propostas entregues |
| 11 | 3º mutirão | Oper. | Critério do passo 7 |
| **12** | 5 empresas pagaram; notas emitidas; receita líquida calculada | Oper. + Cont. | 5 pedidos `pago` + 5 NFS-e |
| 12 | Conversa inicial com candidato a parceiro de Rorainópolis (só conversa; assinar só com BV "viva") | Dono | Reunião feita; nada assinado |
| **13** | Revisão: metas × realizado; decidir sobre extras da pessoa (não antes do mês 9) e nome definitivo | Dono + todos | Relatório de 2 páginas; plano dos meses 4–6 |

---

## 10. Riscos e planos B

| Risco | Sinal (no painel) | Plano B | Quem decide |
|---|---|---|---|
| **Mural vazio** (poucas vagas) | `vagas_ativas` < 20 na semana 6 | Puxar diárias e bicos de clientes (só CNPJ/MEI); ligar para os 30 da lista de novo; adiar o mutirão 2 semanas em vez de abrir com 10 vagas [Marca][Cid] | Dono |
| **Poucas pessoas** | < 40 com selo por função na semana 8 | 2º mutirão em escola/entidade de migrantes; boletim em 5 grupos; rádio; "vaga da semana" com link curto | Oper. |
| **Empresa não responde** | `primeira_resposta_empresa_dias` > 7 | Ligar; se 2 avisos sem resposta, pausar a vaga e avisar as pessoas ("a empresa pausou a vaga") | Oper. |
| **Golpe usando a marca** | Denúncia ou notícia | Seção 7; alerta no Canal e no site no mesmo dia; boletim de ocorrência | Dono + Adv. |
| **Parceiro não entrega** | Passos 3–8 atrasados aos 60 dias | Aviso formal aos 60; troca aos 90; a Gestão sem Caos assume a praça de forma remota até o novo parceiro | Dono |
| **Parceiro acessa dado indevido** | Registro de moderação ou denúncia | Suspender o acesso na hora; incidente de dados (seção 8); rescisão por justa causa | Dono + Adv. |
| **Pressão para cobrar da pessoa** | Pedido de cliente ou de parceiro | Não. Regra pública "concorrer é grátis" (seção 5); extras só com parecer e metas (4.5) | Dono |
| **Limite de e-mails** | `emails_mes` > 2.500 | Resumo diário em vez de aviso por candidatura; trocar para o plano pago do e-mail [Prod] | Equipe |
| **Fraude no teste** | Notas altas com tempo baixo; mesmo padrão no mesmo IP | Prova presencial no mutirão; o selo diz "online, sem supervisão"; 1 tentativa a cada 30 dias [Prod] | Equipe |
| **Rádio/CDL pedem exclusividade ou dinheiro** | Na negociação | Sem exclusividade; oferecer crédito ("vagas por Vagas sem Caos, da Gestão sem Caos") e vaga destaque grátis por 3 meses (HIPÓTESE) | Dono |
| **Pacaraima: golpe com migrantes** | Antes de abrir a 4ª praça | Só abrir com tela em espanhol, parceiro ligado a entidade de acolhida e reforço do aviso anti-golpe nos dois idiomas (proposta, seção 5) | Dono |

---

## 11. O que depende do dono (resumo)

Os 12 pontos da proposta (seção 10) continuam valendo. Para este manual, os que travam a operação: (1) nomear a pessoa dedicada; (2) advogado(a) antes da semana 5, revisar a minuta do contrato do parceiro e o modelo de aviso de incidente; (3) psicólogo(a) agora; (4) NFS-e com o contador; (5) preços e preço de fundador para o piloto; (6) nomear o encarregado de dados; (7) abrir as portas das parcerias (prefeitura/Sine, Sebrae, CDL, rádio).

## 12. Fontes

Os números entre colchetes seguem a numeração da proposta (`scratchpad/vagas/proposta.md`, seção 11): [10][11] decisões do TRT-4; [23] golpes de vaga (PSafe); [25] guia da ANPD sobre controlador e operador. Nomes e endereços públicos conferidos por busca na web em 13/10/2026 (confirmar no site oficial antes de usar):
- Setrabes / Sine-RR: Departamento de Emprego, av. Mário Homem de Melo, bairro Mecejana, Boa Vista (notícias da Folha BV).
- ANPD, Resolução CD/ANPD nº 15/2024 (comunicação de incidente: 3 dias úteis; complemento em 20 dias úteis).
- Polícia Civil de Roraima, Delegacia Virtual (`pc.rr.gov.br`), com login gov.br; aceitava estelionato em 2021 (Serpro).
