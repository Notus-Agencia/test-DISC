# Pendências (o que falta o dono decidir ou fazer)

Atualizada em 26/10/2026 pela S0. Cada item tem a recomendação. "Quem" = quem executa. Itens marcados **bloqueia P0** precisam
de resposta para as primeiras sessões abrirem; os outros podem esperar o portão indicado. A mesma lista vai para o ClickUp
(lista "Sistema Painel DISC": "aguardando" = depende do dono; tarefas dele começam com "VOCÊ:").

## A. Antes de abrir as sessões (P0)

| Id | O que falta | Recomendação | Quem | Bloqueia |
| --- | --- | --- | --- | --- |
| D-obj | Confirmar ou corrigir o objetivo de negócio de cada produto (`PLANO.md` §1) | Aprovar como está, ou dizer o que muda | dono | P0 |
| D-ord | Ordem das frentes: fundação + conferência do Vagas primeiro; depois venda direta; depois multiempresa; Clima/360 só se quiser | Aprovar a ordem sugerida | dono | P0 |
| D-sel | **DISC em seleção sem psicólogo(a) responsável** (maior risco apontado no `painel-cientifico/decisao.md` §7.1: Lei 4.119/1962 reserva ao psicólogo os métodos psicológicos de seleção). Hoje o relatório do processo tem "aderência" por finalista, quadro ordenado por aderência e "Encaixe do candidato /100" no relatório de equipe | Já: tirar aderência, ordenação e encaixe e parar de anunciar o DISC como ferramenta de seleção. Depois escolher: ter psicólogo(a) com CRP como responsável técnico(a), ou usar o DISC só depois da contratação (integração, equipe, liderança). Conferir com advogado(a) | dono (decide); S1 f0 (aplica, com prévia aprovada) | P0 e venda de novo processo |
| D-amb | Ambiente de teste do banco. Hoje só existe o de produção; cada push aplica migração nele | Para o multiempresa (mexe em segurança por empresa e separa fichas existentes), usar um ramo do Supabase só para ensaio. Para o resto, o Postgres embutido basta. Decidir antes do P3 | dono | P3 (não bloqueia a 1ª onda) |

## B. Fundação (S1 fase 0)

| Id | O que falta | Recomendação | Quem |
| --- | --- | --- | --- |
| B-bkp | **Backup do banco em pausa até 29/10**: o robô diário não tem os 2 segredos (`SUPABASE_DB_URL` pelo "Session pooler", e `BACKUP_SENHA` com 20 caracteres ou mais, guardada **fora** do GitHub). Passo a passo em `docs/BACKUP.md` | Cadastrar **até 29/10**, rodar "Run workflow" e conferir verde. Sem isso o Vagas não pode receber dado real, e o DISC já guarda dado de candidato | dono cadastra; S1 f0 confere |
| B-actions | **GitHub Actions da organização parou por limite de gastos/pagamento** (aviso do Painel geral, 27/10). Atinge o robô de backup do banco e o "manter ativo" do Supabase (sem ele o plano grátis pode pausar) | Opções: (1) o dono aumenta o limite de gastos no GitHub (só ele faz); (2) mover backup e "manter ativo" para cron no EasyPanel/servidor (o BI já migrou para lá). Sem decisão registrada; o dono escolhe | dono (decide); S1 (executa a opção 2, se escolhida) |
| B-dom | Domínio de e-mail `disc.gestaosemcaos.com.br` na Resend aguardando "Verified". **Conferido em 26/10: já aparece como verificado** (e o domínio raiz também) | Marcar a tarefa como pronta. Decidir o remetente (a tarefa do ClickUp sugere `contato@disc.gestaosemcaos.com.br`; `docs/EMAILS.md` ainda cita o domínio raiz) | dono confere; S1 f0 atualiza o doc |
| B-resend | Chave da Resend do DISC (permissão só de envio): criar e colar como segredo `RESEND_API_KEY` e `EMAIL_REMETENTE` nas funções, e no SMTP do login do Supabase | Fazer logo: destrava convite, recuperar senha, envio do relatório e "Recuperar meu relatório". A sessão nunca vê a chave | dono; S1 f0 testa |
| B-lista | Tarefa "VOCÊ: Listar o que falta no Painel DISC" (pedia onde está o projeto, o que funciona, quais e-mails) | **Respondida por este plano** (repositório, estado, e-mails em `PLANO.md` e `docs/EMAILS.md`). Dono confere se a lista bate e a tarefa vira "revisar" | dono confere |
| B-leg | `EMPRESA_LEGAL` (razão social e CNPJ), `WHATSAPP_SUPORTE`, `CLIMA_BASE_LEGAL`, `F360_BASE_LEGAL` estão vazios em `js/config.js`; `API_URL` ainda aponta para o Apps Script antigo | Dono informa razão social, CNPJ e WhatsApp de suporte; bases legais só depois do(a) advogado(a); S1 f0 propõe aposentar o Apps Script | dono; advogado(a) |

## C. Venda direta e conta de pagamento (S1 fase 1)

| Id | O que falta | Recomendação | Quem |
| --- | --- | --- | --- |
| C-stripe | **A conta do Stripe ainda é da agência de marketing**: o dinheiro e a nota fiscal do recebimento caem no CNPJ dela. Decidir quando trocar para a conta da Gestão sem Caos | Trocar **antes de anunciar** a venda ao público: a troca são 3 chaves, sem mudar código; depois disso, cada venda já cai no CNPJ certo e a conta fiscal fica simples. Até lá, só compras-teste | dono |
| C-jur | Termos, privacidade e política de reembolso revisados por advogado(a); checklist de `docs/VENDAS.md` | Contratar o(a) advogado(a) uma vez só para Vendas, Clima/360 e Vagas | dono |
| C-nf | Nota fiscal de serviço com o contador | Combinar antes da primeira venda real | dono; contador(a) |

## D. Multiempresa (S1 fase 2, depois do P3)

| Id | O que falta | Recomendação | Quem |
| --- | --- | --- | --- |
| M1 | **Consultor agora ou depois?** (papel intermediário: vê todas as empresas, não vê vendas nem Conexões) | **Depois.** Na versão 1, só dono, admin da empresa e leitor: menos código e menos risco | dono |
| M2 | **Validade do link de convite** | **24 horas**, com "Gerar novo link" enquanto a pessoa nunca entrou | dono |
| M3 | **LGPD: quem é controlador e quem é operador** | A empresa cliente é controladora dos dados dos colaboradores dela; a Gestão sem Caos é operadora (contrato de tratamento). Na venda direta, a Gestão sem Caos é controladora. Confirmar com advogado(a) | dono + advogado(a) |
| M4 | O que o cliente vê (observações internas, rascunhos de relatório, nota da empresa); se o membro cria processos na v1; qual é o cliente piloto | Cliente **não** vê observações internas nem rascunhos (a nota interna sai do alcance dele); membro **não** cria processos na v1; piloto: um cliente de confiança | dono |

## E. Vagas sem Caos (S2)

| Id | O que falta | Recomendação | Quem |
| --- | --- | --- | --- |
| V-painel | **Mostrar ou não o grupo "Vagas" no painel** (hoje escondido; `?vagas=1` mostra só para quem sabe) | Manter escondido até o dono ver a prévia do painel e aprovar; a S2 f0 publica a prévia (artefato) para isso | dono |
| V-oper | Quem opera Uruaçu: pessoa da Gestão sem Caos ou parceiro local (se parceiro, o(a) advogado(a) revisa a minuta do contrato) | Começar com pessoa da Gestão sem Caos no piloto, para aprender a rotina antes de contratar parceiro | dono |
| V-adv | Advogado(a): termos, privacidade, RIPD, aviso de incidente | O mesmo da C-jur; precisa estar antes da semana 5 (abrir a praça) | dono |
| V-psi | Psicólogo(a) para o parecer dos testes de habilidade | Contratar já: é o prazo mais longo do calendário | dono |
| V-priv | Onde guardar a cópia privada do banco de questões (com o gabarito) e quem tem acesso | Repositório privado da organização, só o dono e a S2 com ok dele | dono |
| V-pago | Plano pago do banco (backup com restauração por botão) no dia da abertura em Uruaçu | Contratar na semana de abrir; o robô de backup continua como segunda cópia | dono |
| V-nome | Nome definitivo (busca no INPI), encarregado de dados, conferir endereços e contatos das entidades de Uruaçu | Pedir a busca no INPI agora | dono |

## F. Clima e Feedback 360 (S3, só se o dono quiser)

| Id | O que falta | Recomendação | Quem |
| --- | --- | --- | --- |
| K-quer | Quer vender Clima e 360 agora? | **Não agora.** Os dois estão como versão 1 "em validação" e dependem de advogado(a) e psicólogo(a). Abrir a S3 depois da venda direta e do Vagas | dono |
| K-prof | Psicólogo(a) com CRP (itens do clima e do 360, textos), psicometrista, advogado(a) de dados, consultor(a) facilitador(a) | Seguir o quadro de `painel-cientifico/decisao.md` §7 e `360/decisao.md` §7 | dono |
| K-autor | Pedir autorização por escrito para os questionários científicos com versão brasileira (e-mails prontos em `decisao.md` §3.2) | Enviar os e-mails; só muda a versão 2 | dono |
| K-id | Revisão jurídica dos avisos dos modos "identificação opcional" e "identificada" do clima | Antes de vender esses modos, vender só o modo anônimo | advogado(a) |
