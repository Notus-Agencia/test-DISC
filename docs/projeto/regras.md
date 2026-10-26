# Regras e decisões do dono

Regras que não se quebram. Decisão nova do dono entra aqui pela S0, com a data. As regras do código estão no `CLAUDE.md` da
raiz; aqui ficam as de trabalho, produto e texto. Origem: `CLAUDE.md`, `docs/`, o histórico de commits e as regras gerais do dono
para todos os projetos. As datas dos itens do repositório são as dos commits.

## Como trabalhar

- **26/10/2026** · Projeto em sessões: a S0 coordena e não constrói; uma sessão nova por frente e por fase; a SV valida entre as
  fases e nunca valida o que construiu; no máximo 3 sessões construindo ao mesmo tempo.
- **26/10/2026** · Cada sessão trabalha na própria cópia isolada (git worktree) e nunca troca o ramo da pasta principal.
- **26/10/2026** · Português simples e direto. Todo termo técnico explicado. Fazer o que der sem pedir; pedir ao dono só o
  indispensável, dizendo onde clicar. Poucos pedidos de permissão.
- **26/10/2026** · Documentos de execução (esta pasta) sem preço, custo, valor cobrado nem comentário de escopo. Comercial em
  arquivo separado, só do dono. Custos, quando aparecerem para ele, sempre em reais e fora do repositório.
- **26/10/2026** · Funções, nunca nomes de pessoa, em áreas, tarefas e documentos de execução (dono, consultor, operador de
  praça, advogado(a), psicólogo(a), contador(a)).
- **26/10/2026** · Testar tudo antes de mostrar, celular incluído (375 px). Nada de pop-up.
- **26/10/2026** · ClickUp: lista "Sistema Painel DISC" (pasta Projetos Ativos). Status "aguardando" = depende do dono;
  "revisar" = o dono confere. Tarefas dele começam com "VOCÊ:". A S0 atualiza sozinha a cada avanço.

## Publicação e código

- **CLAUDE.md** · Mudança visual: prévia (artefato) primeiro; **só fazer push depois que o dono aprovar**.
- **26/10/2026** · A branch `claude/disc-test-selection-system-61ot0f` é a produção: cada push publica o DISC (GitHub Pages),
  aplica as migrações novas no Supabase e reimplanta as funções. Mudança entra por ramo próprio e PR; o PR só junta com o
  "pode publicar" do dono. Nunca envio forçado nela.
- **26/10/2026** · Migração: aditiva, idempotente, ensaiada no Postgres embutido (`npm run test:supabase`) e conferida pela SV
  antes de juntar. Migração rodada à mão no SQL Editor não aparece no histórico da integração.
- **26/10/2026** · O repositório é público. Nunca entram nele: senha, chave, token, `BACKUP_SENHA`, URI do banco, gabarito dos
  testes de habilidade do Vagas, dado pessoal de candidato, de pessoa do Vagas ou de colaborador.
- `npm test` precisa passar antes de qualquer PR. Não quebre os seletores de `tests/e2e`.
- A estrutura de arquivos e a ordem de scripts de cada página seguem o `docs/SPEC.md`; módulos JS em UMD (testáveis com
  `node --test`).

## Marca e texto

- O sistema e os produtos são da **Gestão sem Caos**. **Notus** é a agência de marketing que fez o design: nunca aparece em tela,
  e-mail ou relatório de cliente, candidato, colaborador ou contratante. A estrela `assets/icone.svg` é da Notus: não usar em tela pública.
- **Vagas sem Caos** tem marca própria (logo `assets/marca/vsc-logo*.svg`), com a Gestão sem Caos só como endosso ("Uma empresa
  do grupo"); os textos legais identificam a Gestão sem Caos como responsável.
- Visual: `docs/IDENTIDADE-VISUAL.md` à risca (laranja `#F34405` e azul-escuro `#13283F`); nada de cor fora dos tokens; mudança de
  cor só com aprovação do dono.
- Nada técnico para cliente final (sem "Supabase", "RLS", "migração" em tela ou e-mail).
- Sem garantia nos textos de venda ("pode ajudar", nunca "garante"). Sem promessa clínica: o DISC descreve estilo de
  comportamento, não diagnóstico, capacidade, inteligência nem saúde. Não usar "validado", "laudo" nem "conformidade NR-1" no
  Clima e no 360 (`docs/painel-cientifico/`).
- Vocabulário fixo do Vagas: **Vagas sem Caos** (por inteiro), **Combinou** (nunca "match"), **Quero / Pular** (pessoa),
  **Quero conversar / Agora não** (empresa), **selo de habilidade testada** (nunca "certificado" nem "aprovado").

## Produto

- **Celular × computador:** celular é prioridade só para quem RESPONDE (teste, pesquisa, avaliação) e para quem LÊ o relatório.
  O painel é para computador.
- **Privacidade (SPEC):** o relatório ao contratante mostra só primeiro nome e inicial; nunca telefone, e-mail, idade individual
  ou dado sensível. A idade aparece só nos detalhes, de propósito, para não influenciar a triagem. Campos sensíveis do ClickUp são
  sempre ignorados.
- **DISC:** nunca como único critério de decisão. A situação do DISC em seleção está em aberto (`pendencias.md`, D-sel).
- **Clima:** anônimo por padrão; grupo só aparece com 5 respostas ou mais (10 para detalhe, comentário e recorte). Sem perguntas de
  saúde. **Feedback 360:** só para desenvolvimento, nunca para promoção, salário, bônus ou desligamento; confidencial, não anônimo;
  grupo com menos de 3 some. Os 360 e a seleção nunca são vendidos juntos.
- **Vagas:** a pessoa que procura emprego não paga nada, nunca, em Uruaçu. Piloto só em Uruaçu-GO até o dono abrir outra praça.
  Cartão cego (sem nome nem foto) até o Combinou. O grupo "Vagas" do painel fica escondido (`CONFIG.VAGAS_PAINEL = false`)
  até o dono aprovar a prévia.

## Decisões deste plano (esperando o ok do dono)

- Os quatro produtos viram três frentes (S1, S2, S3) mais a SV; S3 só abre se o dono quiser.
- Ordem sugerida: fundação (S1 f0) e conferência do Vagas (S2 f0) primeiro; depois venda direta; depois multiempresa; Clima/360 por último.
- A sessão antiga da nuvem não recebe mais trabalho novo depois que S1 e S2 abrirem.
