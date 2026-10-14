# Vagas sem Caos — especificação das telas (UX)

Fonte da verdade para quem vai codificar as telas da onda 2. Base: `scratchpad/vagas/proposta.md` (aprovada), `produto.md`,
`marca.md`, a mesa de equipe (`EQUIPE.md`: contrato de RPCs da fundação, padrão obrigatório da psicologia, acréscimo da
referência profissional) e `docs/IDENTIDADE-VISUAL.md`. Mockups estáticos (HTML + PNG, dados fictícios; a cidade é sempre dado, nunca texto fixo) em
`scratchpad/vagas/telas/` (`pessoa-*.png` a 390 px; `empresa-*`, `operador-*`, `painel-*` a 1280 px); o gerador está em
`scratchpad/vagas/telas-src/` e a proposta de `vagas/assets/vagas.css` na seção 9.

Regras que valem para TODAS as telas (não repetidas em cada uma):

- **Marca:** o Vagas sem Caos tem marca própria. **Topo** de toda tela: só o logo do Vagas sem Caos (`vsc-logo.svg` no claro,
  `vsc-logo-preto.svg` na moldura laranja, `vsc-logo-negativo.svg` no azul-escuro; `alt="Vagas sem Caos"`, 24 px no topo, nunca
  abaixo de 20 px), sem o nome escrito ao lado (o nome já está no logo). A Gestão sem Caos aparece só como **endosso**, no rodapé:
  "Uma empresa do grupo" + `gsc-logo.svg` a 20 px (`.vg-grupo`); na lista pública (`cidade.html`, limite de peso) o endosso é só
  texto, "Uma empresa do grupo Gestão sem Caos". Em frase: "uma empresa do grupo Gestão sem Caos" (nunca "uma ferramenta da
  Gestão sem Caos"). Textos legais continuam com a Gestão sem Caos como responsável e controladora. Regras e arquivos:
  `docs/IDENTIDADE-VISUAL.md`, "Logo (Vagas sem Caos)". Nunca "Notus", nunca a estrela.
- **Palavras proibidas em tela:** "Tinder", "swipe", "match", "aprovado/reprovado" (no selo e na prova), "perfil ideal",
  "compatibilidade", "o teste prevê", "currículo verificado", "ranking", "DISC" (fora da tela "contratada" da empresa).
  O nome público do interesse mútuo é **Combinou**. A pessoa usa **Quero** / **Pular**; a empresa **Quero conversar** / **Agora não**.
- **Onde a tela explica o que o teste mede:** "conhecimento prático da função"; deixar o marcador `[REVISÃO PSICOLOGIA]` até o
  parecer do agente psicologia (marcador visível nos mockups; some antes de publicar).
- **Frase anti-golpe (fixa, igual em tudo):** "Nunca pague para se candidatar. Se alguém pedir dinheiro, Pix ou documento em
  nome do Vagas sem Caos, é golpe." (versão curta do boletim: "Nunca pague para se candidatar. Se alguém pedir em nosso nome,
  é golpe.") Aparece na lista, na vaga, no cadastro, no convite e na conversa.
- **Linguagem:** português simples, sem jargão de RH, sem gênero ("a pessoa", "quem se candidata", "chamada(o)" só quando inevitável).
  Botões com só a primeira letra maiúscula. Toda tela responde "o que eu faço aqui" (título) e "o que acontece depois" (subtítulo ou barra).
- **Visual:** só tokens e peças de `assets/notus.css` (copiado para `vagas/comum/`), sem cor nova. Cards brancos ou `--nevoa`;
  um `caixa--vidro` por tela no máximo; um botão laranja por tela; `.sobretitulo` + título `t-pagina` como no painel; janelas
  quase opacas (`vidro-janela`); sem `<select>` nativo (pílulas `vg-chip`/`escolha`); nada pula de lugar.
- **Acessibilidade:** todo campo com `<label for>`; erro em `.campo__erro` com `role="alert"` e `aria-describedby`; foco visível
  (outline laranja do notus.css); alvos de toque ≥ 44 px (botões `botao--grande` = 48 px; chips 40–44 px; opções da prova 56 px);
  contraste AA (laranja só como `--notus-forte` em texto pequeno); `aria-live` para "salvo", "enviado", "reconectando";
  `h1` por tela com `tabindex="-1"` e foco ao trocar de tela (como `app.js`); `prefers-reduced-motion` respeitado.
- **Celular (pessoa):** 390 px de referência, sem rolagem lateral, campos com 16 px, `.conteudo` com 16 px de margem e
  `max-width: 720px`. Barra fixa inferior (`.barra-nav`, do teste) para a ação principal e `.vg-nav` (4 destinos) quando a pessoa
  está logada; nunca as duas na mesma tela.
- **Computador (empresa, operador, painel):** 1280 px de referência, menu lateral igual ao de `admin.html` (`.menu-lateral`,
  `.aba`, grupos; no alto, o logo do Vagas sem Caos a 22 px + o nome da área, "Painel da empresa" ou "Operação da praça"),
  cabeçalho `.cabecalho` + `.resumo`, tabelas `.vg-tabela`. Abaixo de 900 px o menu some e vira o botão "Menu" ao lado do logo
  no topo (gaveta, como no painel): precisa funcionar para a empresa pequena no celular, sem prioridade. O painel da Gestão sem
  Caos (`admin.html`, inclusive a aba Vagas) continua com o logo da Gestão sem Caos.
- **Estados padrão (todas as telas com dado remoto):** `carregando` (`.giro` + "Carregando…"), `vazio` (`.vazio` com uma frase
  e um botão), `erro` (`.aviso--erro` com "Não deu para carregar. Tentar de novo."), `offline` (`.vg-faixa--offline` + último
  conteúdo em cache do aparelho), `sessaoExpirada` (flag das RPCs → volta para `entrar.html` com `?voltar=`), `confirmar`
  (flag → tela "Confirme seu e-mail" com "Reenviar"), `suspensa` (flag → aviso fixo "Sua conta está suspensa. Fale com a praça.").
- **Rascunho no aparelho:** currículo, nova vaga, mensagem e resposta da prova ficam em `localStorage` (`vg.rascunho.<tela>`)
  a cada mudança; a tela mostra "Rascunho salvo neste aparelho às HH:MM" (`.vg-rascunho`). Ids de envio gerados no aparelho
  (`crypto.randomUUID()`), como no DISC, para repetir sem duplicar.
- **Dinheiro** sempre em centavos no dado; na tela "R$ 1.620" (sem centavos quando for inteiro) e "R$ 14,90". Datas "13/10/2026",
  horas "14:32", relativas "hoje", "ontem", "há 2 h", "há 3 dias".
- **Peso (lista pública, primeira visita):** ≤ 100 KB transferidos: `notus.css` (15 KB) + fonte latin (27 KB, preload; latin-ext só
  por `unicode-range`) + `vagas.css` (≤ 10 KB) + `config.js` + `regras.js` + `api.js` (fetch direto, **sem supabase-js em
  nenhuma tela**) + `vagas-lista.js` (≤ 12 KB) + HTML. Sem fotos nem imagens além do logo SVG; empresa com iniciais
  (`.vg-iniciais`). 20 vagas por página ("Ver mais 20 vagas"). CI confere o peso (gancho em `scripts/montar-vagas.mjs`).

## 1. Mapa de arquivos, rotas e ids de raiz

| Arquivo (em `vagas/`) | Rota pública | Quem | Dispositivo | Carrega |
|---|---|---|---|---|
| `index.html` | `/` | todos | celular | escolha/lembrança da cidade (`vg.cidade` no aparelho) → redireciona para `/<cidade>/` |
| `cidade.html` | `/<slug-da-cidade>/`, ex.: `/uruacu-go/` (302 em `_redirects` para `cidade.html?cidade=<slug>`: com rewrite os caminhos relativos quebrariam) | pessoa, anônimo | celular | lista pública + filtros; estados espera/pausada |
| `vaga.html` | `/v/K7M2QX` (Pages Function monta o HTML da prévia; abre sem JS) | pessoa, anônimo | celular | página da vaga + Quero/Pular |
| `entrar.html` | `/entrar.html?token_hash=…&type=…` | pessoa e empresa | celular/computador | entrar, criar conta, esqueci, confirmação (verifyOtp por fetch) |
| `eu.html` | `#curriculo/1…5`, `#candidaturas`, `#conversa/<id>`, `#quem-viu`, `#dados`, `#referencias`, `#referencia/pedir`, `#referencia/<id>` | pessoa logada | celular | área da pessoa |
| `testes.html` | `#catalogo`, `#teste/<slug>`, `#prova`, `#resultado/<tentativa>` | pessoa logada | celular | motor dos testes (`vagas/js/testes.js`) |
| `selo.html` | `/selo?codigo=Q8V3N2KD` | qualquer pessoa | celular | conferência pública |
| `referencia.html` | `/referencia.html?t=<token>` (convite de referência; empresa logada abre com `vagas_referencia_convite`) | empresa | computador | preencher a referência pedida |
| `referencias.html` | `/referencias.html?t=<token>` (página pública que a pessoa liga) | qualquer pessoa | celular | referências completas da pessoa |
| `empresa.html` | `#inicio`, `#vagas`, `#vaga/nova`, `#vaga/<id>`, `#vaga/<id>/cartoes`, `#conversas`, `#conversa/<id>`, `#referencias`, `#referencia/dar`, `#banco`, `#compras`, `#comprar/<produto>/<vaga>`, `#dados` | empresa logada | computador | painel da empresa |
| `operador.html` | `#fila`, `#denuncias`, `#empresas`, `#assistido`, `#boletim`, `#repasse`, `#zonas` | operador logado (ou equipe) | computador | operação da praça |
| `../admin.html` | aba "Vagas" (`data-aba="vg-cidades" | "vg-operadores" | "vg-moderacao" | "vg-numeros"`) | equipe (`e_admin()`) | computador | painel da Gestão sem Caos |

Ids de raiz comuns: `#app` (celular) / `#conteudo` (computador) com `tabindex="-1"`; `#aviso` (`role="status"`, oculto, para
leitores de tela); `#vg-aviso-geral` (aviso flutuante, como `#aviso-geral` do painel); `#vg-faixa-cidade` (cidade pausada/espera),
`#vg-faixa-offline`; `#vg-cidade` (pílula da cidade no topo); `#vg-nav` com `#vg-nav-vagas|testes|candidaturas|eu`.

Convenção de ids: prefixo `vg-`, tela abreviada, elemento: `vg-cv-avancar`, `vg-prova-responder`, `vg-emp-cadastrar`,
`vg-op-fila`, `vg-adm-cidades`, `vg-ref-aceitar`. Listas geradas usam `data-*` no item (`data-anuncio`, `data-candidatura`,
`data-acao`) em vez de id numerado; os ids numerados dos mockups (`vg-vaga-1`) são só para a prévia.

## 2. Telas da pessoa (celular, 390 px)

### 2.1 Início da cidade (`cidade.html`) — mockup `pessoa-inicio.png`
- **Objetivo:** ver as vagas de hoje da cidade e filtrar em 1 toque; entender que é grátis e seguro.
- **Quem/estado:** anônimo ou logado (logado ganha `.vg-nav`). Cidade lembrada em `localStorage` (`vg.cidade`), sem GPS.
- **Elementos:** `topo` (logo do Vagas sem Caos, `#vg-cidade` → janela `#vg-janela-cidade` com a lista de `vagas_cidades_publicas()`:
  ativas clicáveis, lista de espera com "Avise-me", pausadas com etiqueta); `.sobretitulo` com o nome da cidade vindo do banco (e "e região" só se houver entorno); `h1#vg-titulo`
  "Vagas de hoje"; subtítulo "Empresas daqui, conferidas uma a uma. Candidatar-se é grátis, sempre."; busca `#vg-busca`
  (`type="search"`, placeholder "Buscar por função (ex.: caixa, vendedor)", envia ao parar de digitar 400 ms; busca no título da
  função e no nome da área, nunca no texto livre); **barra de filtros resumida** `#vg-filtros-barra` (pedido do dono, "igual à
  Catho"): botão `#vg-abrir-filtros` "Filtrar" (azul-escuro, com a contagem de filtros ativos em `.vg-chip__n`; abre a folha
  2.1a) + `#vg-filtros-ativos` (chips roláveis do que está ativo, cada um com "✕" e `data-filtro`/`data-valor` para tirar em 1 toque:
  "Vendas em loja ✕", "Caixa ✕", "Comercial ✕", "a partir de R$ 1.600 ✕"); `#vg-contagem` ("12 vagas nas suas áreas" ou "37 vagas em
  <cidade>" + `#vg-limpar-filtros`); `ul#vg-lista` de `.vg-vaga` (com o nome da área na linha de meta); `#vg-mais` "Ver mais N vagas";
  nota "Você recebe aviso por e-mail quando entra vaga nova em <áreas> · Mudar minhas áreas"; `#vg-aviso-golpe`; rodapé ("Uma empresa
  do grupo Gestão sem Caos", só texto, · Termos · Privacidade).
- **Padrão ao abrir:** pessoa logada com áreas no currículo → a lista já abre filtrada nas suas áreas (até 3) e o aviso de vaga nova
  por e-mail segue as mesmas áreas; anônimo → sem filtro, cidade lembrada. Filtros ficam salvos no aparelho (`vg.filtros.<cidade>`) e na
  URL (`?areas=vendas-loja,caixa&turno=comercial&salarioMin=160000`) para compartilhar e voltar.
- **Dados:** `vagas_anuncios_publicos({cidade, entorno, zona, areas[], modalidade[], turno[], salarioMin (centavos), semExperiencia,
  paraHoje, busca, depois, limite:20})`. Chaves dos filtros = chaves dos campos fechados da vaga (seção 3.3).

### 2.1a Folha de filtros — mockup `pessoa-filtros.png`
- `section#vg-filtros` (`role="dialog"`, folha que sobe de baixo, `.vg-folha`, com alça e véu; no computador vira janela):
  cabeçalho "Filtrar vagas" + `#vg-filtros-limpar` "Limpar tudo"; `form#vg-form-filtros` com grupos (`fieldset.vg-folha__grupo`):
  - **Área** `#vg-filtro-areas` (chips, pode marcar várias; 6 visíveis + `#vg-filtro-areas-todas` "Ver todas as 24 áreas" que expande a
    lista fechada abaixo, sem rolagem lateral);
  - **Tipo de contrato** `#vg-filtro-modalidade` (CLT, Temporário, Diária, Freelancer, Estágio; várias);
  - **Turno** `#vg-filtro-turno` (Manhã, Tarde, Noite, Comercial, Escala, A combinar; várias);
  - **Salário a partir de** `#vg-filtro-salario` (campo numérico em reais; ajuda "Vagas com faixa contam pelo valor mais alto. Diária:
    valor do dia × 22."; erro "Digite só o número, como 1600");
  - **Zona** `#vg-filtro-zona` (Todas + zonas da `vagas_zonas`; uma) + `#vg-filtro-entorno` "Incluir <cidades do entorno>" (só aparece se a praça tiver entorno);
  - **Mais**: `#vg-filtro-sem-experiencia` "Aceita sem experiência" (= vaga com `experiencia = nao_precisa`), `#vg-filtro-hoje` "Para
    hoje (diárias e bicos de hoje e amanhã)".
- Barra fixa `#vg-barra-filtros`: dica "Os filtros ficam salvos neste celular." + `#vg-filtros-fechar` + `#vg-filtros-aplicar` **"Ver N
  vagas"** (laranja; N atualiza a cada mudança com `vagas_anuncios_publicos` em modo contagem, ou "Ver vagas" se offline).
- **Não existe filtro** por nota do selo, idade, sexo, "tem referência", nacionalidade, escolaridade da pessoa ou qualquer dado da
  pessoa: os filtros são só atributos da vaga (proibido por lei e pelo padrão da psicologia). "Tem selo" é filtro só da empresa
  sobre os cartões, nunca da pessoa sobre as vagas.

**Lista fechada das 24 áreas (contrato com a fundação; chave → nome exato na tela):** `atendimento` Atendimento e recepção ·
`vendas-loja` Vendas em loja e balcão · `vendas-externas` Vendas externas e representação · `caixa` Caixa e operação de loja ·
`administrativo` Administrativo e escritório · `financeiro` Financeiro e contabilidade · `rh` Recursos humanos · `logistica` Estoque,
logística e entregas · `motorista` Motorista e transporte · `producao` Produção e indústria · `construcao` Construção civil ·
`manutencao` Manutenção e reparos · `limpeza` Limpeza e conservação · `cozinha` Cozinha e restaurante · `hotelaria` Hotelaria e
eventos · `beleza` Beleza e estética · `saude` Saúde e farmácia · `educacao` Educação e creche · `agro` Agropecuária e campo ·
`seguranca` Segurança e portaria · `marketing` Marketing, design e redes sociais · `tecnologia` Tecnologia e informática ·
`domesticos` Serviços domésticos e cuidado de pessoas · `outros` Outros comércios e serviços. (Em `vagas/js/regras.js`:
`VAGAS_REGRAS.AREAS`; a mesma lista no currículo, na vaga, nos filtros e nos cartões.)
- **Estados:** carregando (3 esqueletos `.vg-vaga` em `--nevoa`, sem pulo); vazio ("Nenhuma vaga com esses filtros. Tire um
  filtro ou veja todas." + botão "Ver todas"); erro; offline (`pessoa-offline.png`: faixa + última lista guardada em
  `localStorage` `vg.lista.<cidade>` com data e "Tentar de novo"); cidade em lista de espera (`pessoa-espera.png`);
  cidade pausada (`pessoa-pausada.png`).
- **Não aparece:** nome da empresa confidencial; foto; "Tinder"; contagem de candidatos (evita corrida); nota de selo exigida.

### 2.2 Cidade em lista de espera — `pessoa-espera.png`
- `section#vg-espera.caixa--vidro`: "Ainda não chegamos aqui" + "Estamos reunindo empresas de <cidade>…" + total
  ("112 pessoas já pediram", só o número é público); `form#vg-form-espera`: `#vg-espera-email` (obrigatório; erro "Digite um e-mail
  válido, como nome@exemplo.com"), `#vg-espera-pessoa|empresa` (rádio em pílulas), `#vg-espera-enviar` "Me avise quando abrir"
  (laranja). Sucesso: substitui o formulário por `.aviso--ok` "Pronto. A gente avisa por e-mail quando <cidade> abrir."
  Limite por e-mail: 2ª tentativa mostra o mesmo sucesso (resposta neutra). RPC `vagas_lista_espera_entrar`.
- Card "Enquanto isso": link para a cidade ativa mais próxima (se houver) e para os testes (o selo vale em qualquer cidade).

### 2.3 Cidade pausada — `pessoa-pausada.png`
- `#vg-faixa-cidade` (azul-escuro, âmbar no destaque): "Caracaraí está em pausa. As vagas e os cadastros desta cidade ficam
  guardados e voltam quando a praça reabrir." + `#vg-vazio-cidade` com "Ver vagas de <cidade ativa>" e "Fazer um teste".
  Pessoa logada da cidade pausada entra normalmente em `eu.html` (dados preservados); `vaga.html` de vaga pausada mostra
  "Esta vaga não está no ar" + 3 vagas parecidas.

### 2.4 Página da vaga (`vaga.html`) — `pessoa-vaga.png`, `pessoa-vaga-enviada.png`
- **Objetivo:** decidir em uma tela: "Quero" ou "Pular". Abre sem JS (HTML montado pela Pages Function) com os botões que, sem JS,
  levam para `entrar.html?voltar=/v/K7M2QX`.
- **Elementos:** `#vg-voltar` ("Vagas de <cidade>"); `article#vg-vaga` (`data-anuncio`, `data-codigo`): etiquetas
  (modalidade, "Pede selo: <teste>", "Urgente hoje", "Destaque", "Para hoje"), `h1#vg-vaga-titulo`, bloco da empresa
  (`.vg-iniciais` ou `--confidencial` com "?"; `#vg-vaga-empresa` = nome ou "Empresa confidencial"; `.vg-verificada` "Empresa
  verificada · CNPJ conferido pela Gestão sem Caos. O nome aparece se ela chamar você para conversar."), `#vg-vaga-valor`
  (faixa salarial ou "R$ 120 por dia"), `dl#vg-vaga-dados` (Onde, Horário, Começa, Publicada/fica no ar até; diária: Data,
  Horário, Valor do dia, "Pagamento combinado direto com a empresa"), "O que a pessoa vai fazer" `#vg-vaga-descricao`,
  "O que precisa" `#vg-vaga-requisitos`, bloco do selo pedido (`.vg-selo--mini`: "Você já tem o selo de …" com nota e data, ou
  "Você ainda não tem o selo de …" + `#vg-vaga-fazer-teste` "Fazer o teste agora (de 20 a 25 minutos)"; quem não tem o selo **pode**
  se candidatar), `#vg-aviso-golpe`, links "Denunciar esta vaga" (janela `#vg-janela-denuncia`: motivo em pílulas geradas de
  `VAGAS_REGRAS.MOTIVOS_DENUNCIA` (lista `{chave, texto}`: `golpe`, `documento`/`cobranca`, `discriminacao`, `falsa`, `ofensa`,
  `contato`, `outro` — a tela usa as chaves e textos de `regras.js`, nunca uma lista própria) + `#vg-denuncia-detalhe` ≤ 300 +
  "Enviar denúncia"; anônimo pode denunciar anúncio (`id` = uuid ou código); mensagem e referência só com login;
  RPC `vagas_denunciar({alvo, id, motivo, detalhe})`) e "Compartilhar no WhatsApp" (`https://wa.me/?text=` com cargo, zona, valor e o link curto).
- **Barra fixa `#vg-barra-vaga`:** dica "Você escolhe: nada acontece sem o seu 'Quero'." + `#vg-pular` (claro) + `#vg-quero`
  (laranja, "Quero esta vaga"). Logado sem currículo completo → "Quero" leva ao passo que falta com aviso "Falta terminar
  o currículo (passo 3 de 5). Depois a candidatura é enviada sozinha." Anônimo → `entrar.html?voltar=` (a intenção fica em
  `localStorage` `vg.quero=<anuncio>` e é enviada ao entrar). Já candidatada → barra vira "Candidatura enviada em 12/10 ·
  Retirar". "Pular" (`vagas_pular`) só esconde a vaga da lista desta pessoa; "Desfazer" no `#vg-aviso-geral` por 6 s.
- **Depois do Quero (`pessoa-vaga-enviada.png`):** `#vg-quero-ok`: ícone ok, "Candidatura enviada", texto do que a empresa recebe
  (cartão sem nome/foto) e "Se ela quiser conversar, você recebe um aviso aqui e por e-mail."; "A empresa costuma responder em
  até 7 dias."; `#vg-quero-ok-voltar` "Ver mais vagas" (principal) e `#vg-quero-ok-candidaturas`. Diária: texto "A empresa vê seu
  cartão e, se chamar, libera o WhatsApp dela para combinar o dia."
- **Estados:** vaga encerrada/pausada/suspensa ("Esta vaga não está mais no ar" + parecidas); limite de candidaturas ativas
  (RPC devolve erro → `.aviso--erro` com a mensagem da RPC); offline (página em cache abre; "Quero" guarda a intenção e avisa
  "Sem internet. Vamos enviar assim que voltar.").

### 2.5 Entrar, criar conta, esqueci, confirmação (`entrar.html`) — `pessoa-entrar.png`, `pessoa-esqueci.png`
- **Moldura:** card `moldura-laranja` com `vsc-logo-preto.svg` (36 px) e "Vagas da sua cidade com habilidade testada.
  Grátis para quem procura emprego." (no computador, metade laranja / metade azul-escura como o login do painel).
- **Segmento `#vg-aba-entrar` / `#vg-aba-criar`.** Criar (`form#vg-form-criar`): `#vg-criar-nome` ("Como quer ser chamada(o)",
  obrigatório, 2–60 caracteres; erro "Escreva o seu nome"), `#vg-criar-email` (obrigatório; erro "Esse e-mail parece incompleto.
  Confira se tem o '.com' no fim."; ajuda "Não tem e-mail? Peça ajuda no WhatsApp da praça."), `#vg-criar-termos` (obrigatório: "Tenho 18
  anos ou mais e li os Termos de uso e a Política de privacidade. Sei que candidatar-se é sempre grátis."; erro "Marque a caixa
  para continuar"), `#vg-criar-enviar` "Criar conta" (laranja). **Sem campo de senha no cadastro** (contrato §6.6/§9): a conta é
  criada só com e-mail + nome + tipo (`VAGAS_API.cadastrar({email, tipo:'pessoa', nome, termosVersao})`) e a senha é criada depois
  do clique no link do e-mail. Resposta sempre neutra (a `mensagem` da Edge Function: "Se este e-mail puder ser usado, você vai
  receber um link em instantes. Confira também a caixa de spam.") → tela `#vg-confirmar-email` com essa mensagem + `#vg-reenviar`
  (`reenviarConfirmacao`; bloqueado 60 s com contador) + "Trocar o e-mail". Nota abaixo do botão: "Você cria a senha depois de
  abrir o link do e-mail."
- **Entrar (`form#vg-form-entrar`):** `#vg-entrar-email`, `#vg-entrar-senha`, `#vg-entrar-enviar`, link `#vg-ir-esqueci`
  (`VAGAS_API.entrar(email, senha)`); erro único **"E-mail ou senha não conferem."** (não diz qual; a tela mostra esse texto no lugar do
  `erro` da API); `confirmar` → "Confirme seu e-mail pelo link que enviamos antes de continuar." + reenviar.
- **Esqueci (`#vg-esqueci`, `pessoa-esqueci.png`):** `#vg-esqueci-email` + `#vg-esqueci-enviar`; sempre `.aviso--ok` "Se esse e-mail
  tiver conta, o link chega em alguns minutos. Olhe também a caixa de spam." (botão vira "Enviado", desabilitado 60 s).
- **Volta do link (`?token_hash&type`):** **todo** link (`invite` = cadastro, reenviar, assistido e operador; `magiclink`; `recovery` =
  esqueci) cai na mesma tela **"Crie sua senha"** (`form#vg-form-nova-senha`: `#vg-ns-email` readonly, `#vg-ns-senha`,
  `#vg-ns-confirmar`, `#vg-ns-salvar` "Salvar senha"), com texto neutro "Escolha uma senha de 8 a 72 caracteres para entrar no Vagas
  sem Caos." (não diz se é conta nova ou recuperação). Fluxo: `VAGAS_API.linkDoEndereco(location)` → `confirmarLink(link)`
  (`{ok, tipo, precisaSenha:true}`) → `definirSenha(senha)` (erro da API "A senha precisa ter de 8 a 72 caracteres."; a tela
  acrescenta "As senhas não são iguais") → `eu()` → continua (`voltar`, senão `eu.html#curriculo/1`; cadastro assistido: antes
  aceita os termos em `#vg-aceitar-termos`). Link vencido (`linkExpirado`): "O link expirou ou já foi usado. Peça outro na tela de
  entrada." + botão para o esqueci.
- **Empresa:** o mesmo arquivo com `?tipo=empresa` mostra o cadastro da empresa (seção 3.1).

### 2.6 Currículo em 5 passos (`eu.html#curriculo/<n>`) — `pessoa-curriculo-2.png`, `pessoa-curriculo-5.png`
- **Objetivo:** montar o cartão em 5 telas curtas, no ritmo da pessoa, com rascunho no aparelho.
- **Cabeçalho de passo:** `.progresso-topo` ("2 de 5" com `.progresso-num` + nome do passo), `#vg-cv-passos` (5 segmentos:
  feito azul-escuro, atual laranja, resto trilho), `#vg-cv-rascunho` ("Rascunho salvo neste aparelho às 14:32", `aria-live`).
- **Passos e campos:**
  1. **Onde:** cidades de interesse (`#vg-cv-cidades`, até 2 pílulas; erro "Escolha pelo menos uma cidade"), zona onde mora
     (`#vg-cv-zona`, pílulas da `vagas_zonas`), **foto (opcional)** `#vg-cv-foto-campo` (pedido do dono, regra fechada com a
     psicologia): avatar vazio `#vg-cv-foto-previa` + `#vg-cv-foto-escolher` "Escolher foto" (+ `#vg-cv-foto-tirar` quando houver),
     frase fixa "A empresa só vê sua foto depois que vocês combinarem de conversar. Sem foto não muda nada na sua candidatura."
     (imagem redimensionada no aparelho para 512 px, JPEG, ≤ 200 KB; guardada em bucket privado; **nunca** sai no cartão cego, na
     busca do banco nem para o operador; o mockup mostra o campo no passo 2 porque o passo 1 não tem mockup).
  2. **Áreas e experiência (`pessoa-curriculo-2.png`):** `h1` "Em que áreas você quer trabalhar?" + "Marque até 3. A lista de vagas já
     abre nas suas áreas e você recebe aviso de vaga nova nelas."; `#vg-cv-areas` (chips da lista fechada das 24 áreas, chave
     `areas[]`, mínimo 1 e máximo 3; 8 visíveis + `#vg-cv-areas-todas` "Ver todas as 24 áreas"; ajuda "2 de 3 marcadas: …"; erro
     "Marque pelo menos uma área" / "Só dá para marcar 3"); depois "Onde você já trabalhou?": `#vg-exp-cargo` (obrigatório se
     houver experiência), `#vg-exp-onde`, tempo (`#vg-exp-tempo`, 4 pílulas), carteira assinada (`#vg-exp-carteira`: Sim / Não /
     Prefiro não dizer), `#vg-exp-atual` "Trabalho lá atualmente", `#vg-exp-adicionar` (até 10), `#vg-exp-nenhuma` "Ainda não
     trabalhei" (envia `experiencias: []`).
     **Conversão para `vagas_pessoa_salvar` (`experiencias[]:{funcao, empregador?, inicio:'AAAA-MM', fim?, informal?}`):**
     `funcao` = `#vg-exp-cargo`; `empregador` = `#vg-exp-onde` (vazio → omitido); pílula de tempo → `inicio` = mês atual − N meses
     (AAAA-MM): "Menos de 6 meses" N=3 · "6 meses a 1 ano" N=9 · "1 a 3 anos" N=24 · "Mais de 3 anos" N=48 (a pessoa pode trocar
     para mês/ano exato em "Ajustar datas", `#vg-exp-inicio`/`#vg-exp-fim`); `fim` = `''` se "Trabalho lá atualmente", senão mês
     atual (ou o mês informado); "carteira: Não" → `informal:true`; "Sim" → `informal:false`; "Prefiro não dizer" → chave omitida.
     Ao reabrir, a tela mostra as datas gravadas (meses → pílula mais próxima) sem perder o valor exato.
  3. **Escolaridade e cursos:** `#vg-cv-escolaridade` (pílulas: Fundamental incompleto … Superior completo), `#vg-cv-cursos`
     (texto curto, ≤ 120; `cursos[]` até 10), `#vg-cv-cnh` (Não tem / A / B / AB / C ou mais → `cnh[]`: `[]` / `['A']` / `['B']` /
     `['A','B']` / `['C']`; ao reabrir, qualquer lista com C, D ou E mostra "C ou mais"). Escolaridade → `escolaridade`
     (`fundamental_incompleto|fundamental|medio_incompleto|medio|tecnico|superior_incompleto|superior|pos`).
  4. **Disponibilidade e contato:** `#vg-cv-turnos` (Manhã / Tarde / Noite / Madrugada / Fins de semana; múltipla),
     `#vg-cv-diarias` ("Topo diárias e bicos" sim/não), `#vg-cv-pretensao` ("A partir de R$", inteiro; ajuda "Só aparece como
     faixa para a empresa"), `#vg-cv-whatsapp` (tel, DDD + 9 dígitos; erro "Digite o WhatsApp com DDD, como (95) 99999-0000";
     ajuda "Só aparece para a empresa depois do Combinou. Sem confirmação por código nesta fase.").
  5. **Revisar (`pessoa-curriculo-5.png`):** `#vg-cv-previa` = cartão cego exatamente como a empresa vê (componente
     `.vg-cartao`, "assim a empresa vê o seu cartão · sem foto, sem nome"; **continua sem foto** mesmo que a pessoa tenha enviado),
     linha fixa `#vg-cv-previa-nota` "Sua foto, nome e contato só aparecem depois do Combinou. Antes disso a empresa vê só este
     cartão.", `#vg-cv-banco` (consentimento separado: "Quero entrar no banco de talentos
     por 6 meses…" — opcional; grava `bancoTalentos` em `vagas_aceitar_termos`), nota "Candidatar-se a uma vaga não depende dessa
     autorização.", `#vg-cv-concluir` "Salvar currículo" (laranja).
- **Barra fixa `#vg-barra-cv`:** dica "Você pode parar e continuar depois: fica salvo aqui no celular." + `#vg-cv-voltar` +
  `#vg-cv-avancar` "Continuar". Validação ao avançar; o erro aparece no campo e o foco vai para ele; nada muda de posição.
- **Dados:** `vagas_pessoa_minha()` para preencher; `vagas_pessoa_salvar(p_dados)` a cada passo concluído (idempotente) e no fim.
  Rascunho `vg.rascunho.curriculo` por passo; ao abrir, se houver rascunho mais novo que o servidor: "Você tem um rascunho de
  13/10 às 14:32. Continuar dele?" (Continuar / Descartar).
- **Não existe:** foto, idade (só a caixa "18 anos ou mais" do cadastro), gênero, estado civil, filhos, cor, religião,
  nacionalidade, saúde, antecedentes, CPF/RG.

### 2.7 Testes de habilidade (`testes.html`) — `pessoa-testes.png`, `pessoa-prova-instrucoes.png`, `pessoa-prova.png`, `pessoa-resultado.png`
- **Em toda tela de testes (diretriz da psicologia, onda 2):** "O teste é opcional: você pode se candidatar sem ele. Se não for
  bem, a empresa não fica sabendo; ela só vê o selo, se você ganhar." (`#vg-testes-opcional`, `#vg-instrucoes-opcional`,
  `#vg-prova-opcional`, `#vg-resultado-opcional`, `#vg-testes-vagas-opcional`). Na prévia, faixa `#vg-faixa-demo` "Questões de
  demonstração (a prova real usa outro banco)".
- **Catálogo (`#vg-testes-lista`):** 5 itens `.vg-teste` (`#vg-teste-<slug>`, `data-acao`): nome (+ etiqueta "Selo"), linha de info
  `#vg-teste-<slug>-info` ("15 questões · 20 min · pedido em 9 vagas"; caixa "15 questões · 25 min · pode usar papel e caneta";
  "Selo válido até … · nota 82 (±10) · pode refazer a partir de …"; "Você começou este teste · faltam N questões"), ação
  `#vg-teste-<slug>-acao` ("Fazer o teste" / "Refazer o teste" / "Continuar"; ou "Em 18 dias" sem botão). Subtítulos: padroes.md §6
  "Mostre o que você sabe fazer: faça o teste da função no celular e ganhe o selo de habilidade testada." e "Grátis, no celular,
  de 20 a 25 minutos cada. O selo mostra o teste, a nota e a data, e vale 12 meses. Pode refazer depois de 30 dias." (minutos,
  validade e intervalo lidos do catálogo; nunca fixos). Aviso: `avisos.selo_nao_e_psicologico` + "Nenhuma vaga pode cobrar por eles."
  Sem login, o catálogo e as instruções abrem (o catálogo é público) com "Entrar para começar".
- **Instruções (`#vg-instrucoes`):** linhas com ícone do contrato (`VAGAS_TESTES.instrucoes`: 15 questões uma por vez sem voltar;
  20 min, caixa 25, pelo relógio do servidor; internet cai e a prova espera; encerrar antes conta; o que a prova registra (LGPD);
  nota e selo), caixa: "Pode usar papel e caneta para as contas. Não use calculadora."; texto fixo de padroes.md §5.7
  (`avisos.teste_antes`, `#vg-instrucoes-sozinho`); `#vg-prova-comecar` (laranja: "Começar" / "Continuar o teste") e `#vg-prova-depois`.
- **Prova (`#vg-prova`, `data-questao`):** topo `.vg-prova__topo` com "7 de 15" e `#vg-prova-tempo` (`role="timer"`,
  `#vg-prova-segundos` "12:05": o tempo TOTAL que falta, do servidor; `--pouco` no último minuto; leitor de tela ouve 5 min e 1 min;
  sem som); `.vg-prova__barra`; `.vg-prova__apoio` (texto base); `h1#vg-prova-enunciado`; opções `ul#vg-prova-opcoes`
  (`role="radiogroup"`, `.retrato.vg-opcao` ≥ 56 px, letra A–D, `aria-pressed`; ordem embaralhada pelo servidor); barra fixa
  `#vg-barra-prova` com "Depois de responder não dá para voltar." e `#vg-prova-responder` (desabilitado até escolher);
  `#vg-prova-encerrar` (link discreto, confirmação na página: conta como tentativa). Tempo zerado → envia o que estiver marcado
  (tolerância de 10 s) ou fecha pelo servidor ("tempo esgotado"). Queda de internet: `#vg-prova-reconectando` ("Reconectando… sua
  resposta está guardada."), escolha em `vg.prova.<tentativa>` e reenvio sozinho. Sair da tela: `beforeunload` só avisa; trocar de
  aba e copiar texto viram sinal, não anulam.
- **Resultado (`#vg-resultado`):** "Você ganhou o selo" (componente `#vg-selo` com `#vg-selo-codigo`) ou "Prova concluída" + o texto
  fixo de padroes.md §5.3 ("Ainda sem selo neste teste. Você pode refazer em 30 dias, de graça.") e "Onde você acertou menos: …";
  nota com margem ("Nota 53 (±10)"); "Como você foi em cada parte" (`#vg-resultado-partes`, "5 de 6"); padroes.md §6 sobre limites;
  `#vg-resultado-vagas` "Ver 9 vagas que pedem este selo" (laranja; `#vagas/<slug>`) e `#vg-resultado-compartilhar`
  (`navigator.share` com `selo.html?codigo=`). As palavras "aprovado"/"reprovado" não aparecem nem para negar.
- **Não aparece:** gabarito, ranking, comparação com outras pessoas, "aprovado", percentil.

### 2.8 Conferência pública do selo (`selo.html`) — `pessoa-selo-conferir.png`
- `form#vg-form-conferir`: `#vg-conferir-codigo` (8 caracteres, maiúsculas automáticas, aceita com ou sem hífen; erro "O código
  tem 8 letras e números, como Q8V3N2KD") + `#vg-conferir-enviar`. RPC `vagas_selo_publico(p_codigo)` (agente testes).
- Resultado: `.vg-conferir` (ícone ok + "Selo válido" / relógio + "Selo vencido em 13/10/2026" / "Código não encontrado. Confira as
  letras ou peça o código de novo à pessoa.") + componente `.vg-selo` completo (teste, nota, data, validade, "Online, sem
  supervisão", "Emitido pelo Vagas sem Caos…"). Nunca mostra nome, e-mail ou cidade da pessoa. Aviso fixo "O teste é de conhecimento
  prático da função, feito online e sem supervisão. Ele não confere identidade nem substitui a entrevista. [REVISÃO PSICOLOGIA]".
  Limite de consultas por IP (resposta "Muitas consultas. Tente em alguns minutos.").

### 2.9 Minhas candidaturas (`eu.html#candidaturas`) — `pessoa-candidaturas.png`
- `h1#vg-cand-titulo` "Candidaturas"; segmento `#vg-cand-aba-andando` / `#vg-cand-aba-fechadas`; `ul#vg-cand-lista` de `.vg-linha`
  (`data-candidatura`): iniciais, cargo, "empresa · situação", `.vg-status`. Mapa de status → rótulo: `enviada` "Enviada",
  `conversar` "Responder" (laranja; abre o convite), `combinou` "Combinou", `contratada` "Contratada", `agora_nao` "Encerrada"
  (não exibe "a empresa disse não"), `retirada` "Retirada", `recusada` "Você recusou". Toque: enviada → página da vaga com
  "Retirar candidatura" (confirmação na página); conversar → 2.10; combinou/contratada → conversa.
- Nota "Enviada há mais de 7 dias sem resposta? A vaga pode ter sido preenchida…". Vazio: "Você ainda não se candidatou. As vagas
  da sua cidade estão a um toque." + botão. `.vg-nav` mostra `vg-nav__n` com convites a responder.

### 2.10 Conversa: o convite e o Combinou (`eu.html#conversa/<id>`) — `pessoa-conversa-convite.png`, `pessoa-conversa.png`
- **Momento 1 — convite (`#vg-convite`, status `conversar`):** sobretítulo = cargo; "A empresa quer conversar com você";
  bloco `#vg-convite-empresa` com o **nome real** (mesmo se a vaga era confidencial: "esta era a 'empresa confidencial'") e
  `.vg-verificada`; `#vg-convite-mensagem` (primeira mensagem da empresa, se houver); lista "Se você aceitar:" (nome e currículo
  completo liberados; WhatsApp liberado nos dois sentidos; fica registrado em "quem viu"); "Se recusar, a empresa não vê nada
  além do cartão e a conversa fecha. Nenhuma das duas respostas aparece para outras empresas."; `#vg-convite-recusar` "Agora não"
  (claro) e `#vg-convite-aceitar` "Combinou: liberar meu contato" (laranja). Antes de aceitar a pessoa já vê o nome da empresa
  (RPC `vagas_ver_empresa`); aceitar = `vagas_combinar`; recusar = `vagas_recusar` (confirmação na página: "Recusar o convite da
  Loja Nova Exemplo? A conversa fecha e não dá para reabrir.").
- **Momento 2 — conversa (`#vg-conversa`, status `combinou`/`contratada`):** cabeçalho com voltar, iniciais, `#vg-conversa-nome`,
  cargo + `.vg-status`; `ul#vg-mensagens` (`.vg-msg` da empresa à esquerda, `--minha` à direita em azul-escuro, `--sistema`
  centralizada: "Candidatura enviada em 07/10", "Vocês combinaram em 09/10. Nome e contato liberados para os dois lados.");
  `#vg-conversa-whatsapp` "Chamar no WhatsApp" (`wa.me/<numero da empresa>?text=` com mensagem pronta); `form#vg-form-mensagem`
  (`#vg-mensagem-texto` ≤ 1000, `#vg-mensagem-enviar`); `#vg-conversa-bloqueio` "Pedidos de dinheiro, Pix ou documento não passam
  por aqui. Algo estranho? Denunciar." Mensagem bloqueada: a RPC devolve `{ok:false, bloqueada:true, tipo, erro}` e a tela mostra o
  `erro` como veio (ex.: "Mensagem bloqueada: telefone, e-mail e redes sociais só depois do Combinou…"), mantém o texto no campo
  para reescrever e não grava rascunho; `aguardar` → "Espere a pessoa responder antes de mandar outra mensagem." Antes do Combinou a pessoa também pode
  responder por mensagem (sem liberar contato); o campo some se a conversa fechou ("Conversa encerrada").
- **Dados:** `vagas_conversa(p_candidatura)`, `vagas_mensagem_enviar(p_candidatura, p_texto, p_id)`; atualização por
  consulta a cada 20 s com a tela aberta (sem websocket). Novas mensagens chegam por e-mail (textos do agente textos).

### 2.11 Quem viu meu contato (`eu.html#quem-viu`) — `pessoa-quem-viu.png`
- `#vg-quem-viu-lista`: por empresa (`.vg-item`): nome, cargo, "abriu em 09/10 às 15:18 · Marta E." (primeiro nome + inicial de quem
  abriu) ou "ainda não abriu (você combinou hoje)". Aviso "Ninguém mais tem o seu contato: nem o operador da praça, nem outras
  empresas." Toque na empresa → "Cortar o acesso desta empresa" (confirmação; encerra a candidatura). RPC `vagas_quem_viu_meu_contato`.
  Vazio: "Nenhuma empresa abriu o seu contato ainda. Isso só acontece depois de um Combinou."

### 2.12 Eu: meus dados, baixar e excluir (`eu.html#dados`) — `pessoa-meus-dados.png`, `pessoa-excluir-confirmar.png`
- `h1#vg-eu-titulo` = nome; subtítulo e-mail · cidades. `#vg-eu-lista`: Meu currículo (`#vg-eu-curriculo` Editar), Meus selos
  (`#vg-eu-selos`), Referências (`#vg-eu-referencias`), Banco de talentos (`#vg-eu-banco` "Sair do banco" / "Entrar no banco", com a
  validade), Quem viu meu contato (`#vg-eu-quem-viu`), Cidades (`#vg-eu-cidades`, até 2).
- `section#vg-meus-dados`: "Você pode levar uma cópia de tudo ou apagar a conta. Contas paradas por 24 meses são apagadas sozinhas."
  `#vg-dados-baixar` "Baixar meus dados (arquivo)" (`vagas_exportar_meus_dados()` → JSON baixado como `meus-dados-vagas.json`;
  inclui referências recebidas); `#vg-dados-excluir` (perigo) → janela `#vg-confirmar-excluir`: "Excluir a conta de vez?",
  consequências, campo `#vg-confirmar-excluir-texto` (digitar EXCLUIR habilita `#vg-confirmar-excluir-sim`), `#vg-confirmar-excluir-cancelar`.
  Edge Function `vagas-conta` `excluir` {confirmar:'EXCLUIR'} → tela final "Conta excluída. Obrigado por usar o Vagas sem Caos." e sai.
- `#vg-sair` "Sair da conta" (link).

### 2.13 Referência profissional — lado da pessoa — `pessoa-referencia-pedir.png`, `pessoa-referencia-aceitar.png`, `pessoa-referencias.png`
- **Pedir (`#vg-ref-pedir`, `eu.html#referencia/pedir`):** "Pedir referência"; subtítulo explica (só empresa verificada; só aparece
  depois do aceite); `form#vg-ref-form-pedir`: `#vg-ref-pedir-cnpj` (CNPJ da empresa, opcional; com CNPJ de empresa ativa só ela
  abre o convite) **ou** `#vg-ref-pedir-empresa` (nome livre da empresa; obrigatório se não houver CNPJ) — `VAGAS_API.pedirReferencia({cnpj}
  | {empresaNome})`; função e período NÃO vão no pedido (a empresa preenche); consentimento fixo "É pública…"; `#vg-ref-pedir-enviar`
  "Gerar o convite" (laranja). Resposta `{convite:{caminho:'/referencia.html?t=<token>', expiraEm, empresaNome, empresaNaPlataforma}}` →
  a tela monta o link completo (`location.origin + convite.caminho`), mostra `#vg-ref-convite-link` (readonly + "Copiar") e
  `#vg-ref-pedir-whatsapp` (abre `wa.me/?text=` com a mensagem pronta e o link). Não existe rota `/r/`. Sucesso: "Convite criado.
  Vale 30 dias; você vê aqui quando a empresa responder." Erros da API exibidos como vêm ("CNPJ inválido…", "Você já tem 20 pedidos…").
- **Receber (`#vg-ref-receber`, `eu.html#referencia/<id>`, status `pendente`):** "A Padaria Modelo deu uma referência para você";
  "Só você está vendo."; componente `.vg-ref.vg-ref--pendente` completo; consentimento (o que aparece antes/depois do Combinou;
  pode ocultar/remover **sem avisar a empresa**, veto da psicologia); `#vg-ref-recusar` "Não quero mostrar" e `#vg-ref-aceitar` "Aceitar e
  mostrar" (laranja); "Denunciar a referência" (mesma janela de denúncia, alvo `referencia`); "A empresa não vê se você recusou."
  RPC `vagas_referencia_responder(p_referencia, 'aceitar'|'recusar'|'ocultar'|'mostrar'|'remover')` (`VAGAS_API.responderReferencia`).
- **Lista (`#vg-ref-lista`, `eu.html#referencias`):** "Referências" + "Sem nota, sem estrelas: é uma carta, não uma avaliação.";
  `#vg-ref-novo-pedido`; `ul.vg-refs` com `.vg-ref` e `.vg-ref__acoes` (`.vg-status` Visível/Oculta/Pendente; `data-acao`
  ocultar/mostrar/**remover** — remover com confirmação na página "Remover esta referência? Ela some do seu cartão e do perfil; a
  empresa não é avisada."; ocultar explica "Some do cartão e da página pública; você pode mostrar de novo"); "Pedidos enviados"
  (`convites[]` de `vagas_referencias_minhas`: empresa, status, "Copiar link" com `caminho`, expira em); aviso do que a empresa vê
  antes/depois do Combinou. **Página pública:** `#vg-ref-publicar` ("Mostrar minhas referências numa página pública",
  `vagas_referencias_publicar(true|false)` → `caminhoPublico` `/referencias.html?t=…`, com "Copiar link"; desligar apaga o link).
- **Não existe:** estrelas, média, "nota" de referência, referência negativa, referência de empresa não verificada, referência
  anônima/confidencial, contagem ou pontos fortes no cartão cego (só "sim"). Pontos fortes: chaves e textos de
  `VAGAS_REGRAS.PONTOS_FORTES` (12 comportamentos observáveis da psicologia: `pontualidade`, `atendimento`, `caixa_certo`,
  `organizacao`, `equipe`, `aprende_rapido`, `regras_seguranca`, `comunicacao`, `iniciativa`, `cuidado_material`, `vendas`,
  `situacao_dificil`); a tela mostra o texto da lista, nunca um rótulo próprio.

## 3. Telas da empresa (computador, 1280 px; funciona no celular)

### 3.1 Cadastro CNPJ/MEI e entrar (`entrar.html?tipo=empresa`) — `empresa-cadastro.png`
- Metade laranja: logo preto do Vagas sem Caos (`vsc-logo-preto.svg`, 36 px), frase "Vagas da sua cidade com quem fez o teste da função.", apoio, 3 passos (cadastre o CNPJ ou
  MEI; publique com salário; chame para conversar), "Já é cliente da consultoria? A gente cadastra para você."
- Metade azul-escura (`form#vg-emp-form-cadastro`): `#vg-emp-cnpj` (máscara 00.000.000/0001-00; validação de dígitos de
  `regras.js`; erro "CNPJ inválido. Confira os 14 números."; MEI é CNPJ normal), `#vg-emp-nome` (nome como aparece; 2–60),
  `#vg-emp-responsavel`, `#vg-emp-email`, `#vg-emp-whatsapp` ("aparece só depois do Combinou"), `#vg-emp-termos`
  (Termos para empresas: salário obrigatório, nada de pedir dinheiro/documento, anúncio sem discriminação), `#vg-emp-erro`,
  `#vg-emp-cadastrar` "Cadastrar e confirmar o e-mail" (branco sobre azul-escuro), `#vg-emp-ir-entrar`. Nota: "Depois de confirmar
  o e-mail, a operação confere o CNPJ (em geral no mesmo dia útil). Você já pode escrever a vaga enquanto espera."
  Fluxo: `vagas-conta` `cadastrar` {tipo:'empresa', nome, termosVersao} (**sem senha**) → link do e-mail → "Crie sua senha" (2.5) →
  `vagas_empresa_cadastrar(p_dados)` com CNPJ, nome, responsável, WhatsApp (a tela guarda o rascunho desses campos em
  `localStorage` `vg.rascunho.empresa` até a senha existir) → status `em_analise`.
- Empresa `em_analise` entra no painel com faixa fixa "Seu CNPJ está em conferência pela operação da praça. Dá para escrever vagas;
  elas vão ao ar depois da liberação." Empresa `suspensa`: faixa "Conta suspensa. Motivo: … Fale com a praça." e tudo só leitura.

### 3.2 Painel da empresa (`empresa.html#inicio`) — `empresa-painel.png`
- Cabeçalho "Bom dia, Marcos" (saudação pela hora, sem gênero) + "3 vagas no ar, 2 pessoas esperando sua resposta. O ideal é
  responder em até 7 dias." + `#vg-emp-nova-vaga` (laranja). `#vg-emp-resumo` (4 cards: Vagas no ar; Esperando sua resposta
  em `caixa--destaque`; Combinou; Contratações). `table#vg-emp-vagas-tabela` (Vaga, Status, Quero, Novos, No ar até, ação
  "Ver cartões" / "Editar"). Lateral: "Como funciona" (4 passos) e "Regras da casa". Menu: Início, Minhas vagas (n), Conversas (n),
  Referências, Buscar no banco (fase 2: etiqueta), Compras, Dados da empresa.
- Vazio (sem vagas): card grande "Publique a primeira vaga em 5 minutos" + botão; as 3 primeiras passam por revisão (aviso).

### 3.3 Nova vaga (`#vaga/nova`, `#vaga/<id>` em edição) — `empresa-nova-vaga.png`
- **Princípio (pedido do dono):** a vaga é cadastrada **como produto de marketplace**: campos de lista fechada OBRIGATÓRIOS antes do
  texto livre, porque são eles que os filtros da pessoa (2.1a) encontram. O texto livre não entra na busca. Subtítulo: "Primeiro os
  campos fechados (é por eles que as pessoas acham a vaga nos filtros), depois a descrição. Salário é obrigatório."
- `form#vg-form-vaga` em 4 blocos (`.form-grade`, 2 colunas; 1 no celular). **Chave do campo → id → opções:**
  1. **O que é a vaga:** `area` → `#vg-vaga-area` (escolha em pílula das 24 áreas; obrigatório; ajuda "Lista fechada de 24 áreas: é
     o que a pessoa filtra."); `funcao` → `#vg-vaga-funcao` (título curto ≤ 60, obrigatório, com sugestões por área, ex.: "Vendedor(a)
     de loja"); `modalidade` → `#vg-vaga-modalidade` (`clt|temporario|diaria|freelancer|estagio`, obrigatório); `quantidade` →
     `#vg-vaga-quantidade` (inteiro ≥ 1, padrão 1); `salario_de`/`salario_ate` → `#vg-vaga-salario-de` (obrigatório; centavos no
     dado) / `#vg-vaga-salario-ate` (opcional ≥ de; erro "Informe o salário. Vaga sem salário não vai ao ar." / "O 'até' precisa ser
     maior que o 'de'"; diária = valor do dia; estágio = bolsa); `comissao` → `#vg-vaga-comissao` (caixa "Tem comissão"); `turno` →
     `#vg-vaga-turno` (`manha|tarde|noite|comercial|escala|a_combinar`, obrigatório); `fim_de_semana` → `#vg-vaga-fim-de-semana`
     (caixa "Trabalha fim de semana"); `inicio` → `#vg-vaga-inicio` (`imediato|data`) + `inicio_data` → `#vg-vaga-inicio-data`
     (habilita com "Em uma data"; erro "Use dd/mm/aaaa"); `zona` → `#vg-vaga-zona` (slug da `vagas_zonas`, obrigatório).
  2. **O que a vaga pede:** `experiencia` → `#vg-vaga-experiencia` (`nao_precisa|ate_1|1_a_3|mais_3`; padrão `nao_precisa`;
     alimenta o filtro "Aceita sem experiência"); `escolaridade` → `#vg-vaga-escolaridade` (`nao_exigida|fundamental|medio|tecnico|
     superior`; ajuda "Só marque se a função exige de verdade: cada exigência tira gente boa da lista."); `requisitos[]` →
     `#vg-vaga-requisitos` (checklist `cnh_a|cnh_b|cnh_d|curso_registro|disponibilidade|outro` + `requisito_outro` →
     `#vg-vaga-requisito-outro`, ≤ 80, habilita com "Outro"); `selo` → `#vg-vaga-selo` (`nenhum` ou slug do teste; opcional; some
     nas áreas sem teste; ajuda "Quem não tem o selo ainda pode se candidatar; você vê quem tem. Sem nota mínima.").
  3. **O que a vaga oferece:** `beneficios[]` → `#vg-vaga-beneficios` (checklist `vt|refeicao|saude|moradia|comissao`; "Comissão"
     marca junto `comissao`); `confidencial` → `#vg-vaga-confidencial` (`nao|sim`; ajuda explica).
  4. **Descrição:** `descricao` → `#vg-vaga-descricao` ("O que a pessoa vai fazer no dia a dia", obrigatório, 40–1500) — o único texto
     livre; passa pela recusa de termo proibido (abaixo) e o erro diz "Os requisitos vão nos campos acima."
- **Diária/bico (`modalidade=diaria`):** aparecem `data` → `#vg-vaga-data` (hoje a +7), `hora_inicio`/`hora_fim` →
  `#vg-vaga-hora-inicio`/`-fim`, `valor_dia` (= `salario_de`), `prazo_horas` → `#vg-vaga-prazo` (48–168 h no ar) e o aviso
  "Diarista 3 ou mais dias por semana na mesma casa é emprego doméstico (LC 150/2015)". Estágio: `horas_dia` → `#vg-vaga-horas`
  (até 6 h/dia). Os campos de 1–3 continuam obrigatórios.
- **Lateral "Como a vaga aparece nos filtros"** (`caixa--destaque`): etiquetas geradas ao vivo dos campos fechados (área, contrato,
  turno, fim de semana, salário + comissão, zona, experiência, escolaridade, benefícios) com a nota "Cada campo fechado vira um filtro
  para quem procura. O texto livre não entra na busca." Ajuda a empresa a ver o que está faltando.
- **Cartão da vaga (lista) e página da vaga** mostram os campos fechados como etiquetas/linhas: área na meta, "Sem experiência",
  "CNH B", "Fim de semana", benefícios em "O que a vaga oferece"; `#vg-vaga-requisitos` (página) passa a ser a lista objetiva + a
  escolaridade; os antigos `#vg-vaga-extras|horario|titulo` deixam de existir (`horario` = turno + fim de semana; `titulo` = `funcao`).
- **Recusa de termos proibidos (na hora, no campo):** `regras.js` confere título, descrição e requisitos ao sair do campo e ao enviar:
  (a) discriminação ("boa aparência", "até N anos", "solteira", sexo, "sem filhos", nacionalidade…) → `.campo__erro` "Não dá para
  publicar assim. '<termo>' é critério proibido por lei (Lei 9.029/1995 e CLT art. 373-A). Descreva o que a pessoa vai fazer e o
  que precisa saber; sexo, idade e aparência não podem ser requisito."; (b) golpe ("taxa", "Pix", "investimento", link encurtado,
  telefone) → "Tire '<termo>'. Vagas não podem pedir dinheiro, Pix nem contato fora da plataforma: a conversa acontece aqui."
  `#vg-vaga-publicar` fica desabilitado enquanto houver erro. A lista oficial de termos vem de `regras.js` (fundação) e os
  motivos da operação.
- Ações: `#vg-vaga-salvar-rascunho` (claro; `vagas_anuncio_salvar`), `#vg-vaga-publicar` "Enviar para publicar" (laranja;
  `vagas_anuncio_publicar` → `em_revisao` nas 3 primeiras, senão `publicado`). Sucesso → 3.4. Rascunho local `vg.rascunho.vaga`.
  Lateral: "O que não entra no anúncio" e "Diária ou bico".

### 3.4 Vaga publicada (`#vaga/<id>`) — `empresa-vaga-publicada.png`
- Cabeçalho: sobretítulo "Minhas vagas · <status>" (`.vg-status`: Publicada / Em revisão ("A operação confere em até 1 dia útil") /
  Pausada / Encerrada / Suspensa ("3 denúncias: a operação está analisando") / Removida (com o motivo)), `h1` cargo, texto
  "No ar desde 12/10, até 11/11. Confidencial. 11 pessoas disseram 'Quero'; 2 cartões novos." Ações: `#vg-vaga-ver-cartoes`
  (principal), `#vg-vaga-editar`, `#vg-vaga-pausar`/"Retomar", `#vg-vaga-renovar` (quando faltar ≤ 5 dias), `#vg-vaga-encerrar`
  (perigo; confirmação "Encerrar a vaga? Quem está em conversa continua; os cartões novos param de chegar.").
- "Divulgar": `#vg-vaga-link` (readonly, `.codigo`), `#vg-vaga-copiar` (feedback "Copiado" por 2 s no próprio botão),
  `#vg-vaga-whatsapp` (`wa.me/?text=`), texto da mensagem pronta; "Como aparece para as pessoas" (cartão `.vg-vaga` renderizado).
- Lateral `#vg-vaga-extras` (`caixa--destaque`): Destaque 30 dias (preço local da cidade; "Contratar" → 3.8), Urgente hoje 48 h
  (só diária; senão "só diária"), nota "Preço de fundador… Pago antes, sem renovação automática." Com direito ativo: "Destaque até
  12/11" e sem botão. "Números desta vaga": vistas, Quero, com selo, conversas, Combinou.

### 3.5 Candidatos em cartões cegos (`#vaga/<id>/cartoes`) — `empresa-candidatos.png`
- Cabeçalho "11 pessoas querem esta vaga" + "Por ordem de chegada. Sem nome, foto, idade ou nacionalidade até vocês combinarem.
  Não existe ranking: quem decide é você." Filtros `#vg-cartoes-filtros` (lista fechada): Selo ("Tem selo de <teste pedido>" /
  "Tem algum selo" / "Todos"; sem nota mínima), Zona, Turno, Escolaridade, CNH, Pretensão (faixas), Mostrar (Novos e em conversa /
  Agora não / Todos). Ordem única: chegada.
- `ul#vg-cartoes` de `.vg-cartao` (componente 9.4): ordem ("1º"), "Pessoa candidata" + "chegou em 12/10, 15:40" + `.vg-status`
  (Novo / Você chamou / Combinou / Agora não), `dl` (Zona, Quer trabalhar com, Experiência, Escolaridade, Turnos, CNH,
  Pretensão "A partir de R$ 1.600"), selos (`.vg-etiqueta--selo` com teste · nota · data), referências
  (`#vg-ref-cartao-<n>`: só a linha "Referência de empresa verificada: sim" quando `temReferencia` — sem contagem, sem pontos fortes,
  sem nome da empresa, por veto da psicologia; "A referência completa aparece depois do Combinou"),
  redação (se o teste for português: "Ver redação" abre janela com o texto, sem nota), ações `data-acao="agora_nao"` (claro) /
  `"conversar"` (principal; abre janela `#vg-janela-chamar` com `#vg-chamar-texto` opcional "Escreva a primeira mensagem (ex.: dia e
  hora da entrevista)" e "Chamar para conversar") → status "Você chamou · Esperando a pessoa aceitar". Agora não → cartão
  `--decidido` com "Desfazer". `vagas_cartoes(p_anuncio, p_filtro)`, `vagas_empresa_decidir`.
- Vazio: "Ninguém se candidatou ainda. Compartilhe o link no WhatsApp: é por lá que as pessoas chegam." + botão.
- **Não aparece:** nome, foto, idade, nacionalidade, gênero, e-mail/WhatsApp, DISC, "compatibilidade", pontuação, ordenação por nota.

### 3.6 Conversa, Combinou, contato liberado e "Contratada" (`#conversa/<id>`) — `empresa-conversa.png`
- `#vg-conversa` igual ao da pessoa (lados invertidos). Antes do aceite: cabeçalho "2º · Pessoa candidata · esperando aceitar"
  (sem foto, sem nome); lateral "Contato" em cinza: "O nome e o WhatsApp aparecem quando a pessoa aceitar." Depois do Combinou:
  cabeçalho com a **foto pequena** `#vg-conversa-foto` (`.vg-foto__mini`, 40 px, só se a pessoa enviou; senão iniciais do nome) e o
  nome; lateral `#vg-contato` (`caixa--destaque`): `#vg-contato-foto` (48 px) + nome, WhatsApp, e-mail, nota "Foto, nome e contato
  liberados pela pessoa no Combinou (ela pode cortar o acesso).", `#vg-contato-whatsapp` (mensagem pronta), `#vg-contato-curriculo`
  "Ver currículo completo" (janela com o currículo: experiências, escolaridade, cursos, turnos; ainda sem foto/idade); a abertura
  chama `vagas_contato_pessoa` e fica registrada (aviso "Esta abertura fica registrada para ela").
- Card "Contratou?": `#vg-marcar-contratada` (laranja) → confirmação "Marcar Ana Exemplo como contratada? A vaga pode continuar no
  ar." → `vagas_marcar_contratada`; depois: "Contratada em 15/10" + "Encerrar a vaga" + card "Integração dos 90 dias: a consultoria
  oferece o Mapa DISC de integração (só depois da contratação; nunca na seleção)" com botão "Quero saber mais" (abre WhatsApp da
  consultoria; fase 2 liga ao multiempresa). **Única tela em que "DISC" aparece para a empresa.**
- `#vg-ref-combinou`: referências completas da pessoa (componente `.vg-ref`), com "Liberada com o Combinou".
- "Cartão (como chegou)" para lembrar o contexto.

### 3.7 Busca no banco (`#banco`) — `empresa-banco.png` — **fase 2**
- Faixa "Fase 2. Esta tela abre quando a cidade tiver gente com selo suficiente." No MVP o item do menu leva a esta tela com a faixa
  e os filtros desabilitados. Desenho: selo do passe ("30 contatos · até 12/11"), filtros fechados (área, selo, zona, escolaridade,
  CNH, turno, pretensão), "23 cartões · ordem: mais recentes no banco primeiro (sem ranking por perfil)", cartões cegos com "No
  banco desde 02/10 · autorizou até …" e ação "Convidar para uma vaga" (escolhe a vaga; gasta 1 contato só se a pessoa aceitar).
  Só pessoas com `visivel_banco` e prazo válido. Perfil em evidência (rótulo) só aqui, nunca nas candidaturas.

### 3.8 Compras: pedido com Pix ou cartão (`#comprar/<produto>/<vaga>`) — `empresa-compra.png`
- Reaproveita o checkout do DISC (`checkout.js` puro + `stripe-pagamento.js`): `#vg-pedido` ("O que você está comprando",
  `ul#vg-pedido-produtos` como rádio — Vaga destaque 30 dias / Vaga extra 30 dias / Vaga assistida / Urgente hoje — com preço da
  cidade, preço de fundador riscado, `#vg-pedido-cupom` + `#vg-pedido-cupom-aplicar` (mínimo R$ 0,50 do cupom), `#vg-pedido-cnpj`
  readonly para a NFS-e) e `#vg-pagamento` ("Falta só pagar", total, selo "Pix: aprovado na hora", abas `#vg-pag-pix` /
  `#vg-pag-cartao` (Payment Element com Pix primeiro), `#vg-pagar` "Gerar o Pix de R$ 59" (laranja; muda para "Pagar R$ 59" no
  cartão), "Já paguei" (aparece depois do Pix gerado), `#vg-pedido-trocar`, letra miúda Stripe/Gestão sem Caos/sem renovação/Termos
  para empresas). Depois do pago: "Pronto. A vaga está em destaque até 12/11." e volta à vaga; a tela confere o **direito**, nunca o
  pedido. Lista de compras (`#compras`): tabela com produto, vaga, pago em, válido até, NFS-e (link quando houver).
- Depende do dono: preços finais, NFS-e, data de início da cobrança (até lá a tela mostra "Grátis no lançamento" e os botões
  "Contratar" ficam ocultos).

### 3.9 Referência profissional — lado da empresa — `empresa-referencia-dar.png`, `empresa-referencias.png`
- **Dar (`#referencia/dar`, `form#vg-ref-form-dar`):** `#vg-ref-dar-pessoa` (vem do pedido, readonly; sem pedido: busca por e-mail
  exato da pessoa — "Só pessoas com conta"; nunca lista pessoas), `#vg-ref-dar-funcao` (obrigatório), `#vg-ref-dar-vinculo` (rádio em
  pílulas), `#vg-ref-dar-inicio`/`-fim` (mês/ano; erro "Use mês/ano, como 09/2025"; fim ≥ início) ou `#vg-ref-dar-atual`,
  `#vg-ref-dar-recomenda` (escolha múltipla da lista de funções), `#vg-ref-dar-pontos` (pílulas, lista fechada do agente psicologia;
  mínimo 1, máximo 3 — ao marcar a 4ª, aviso "Escolha até 3"), `#vg-ref-dar-texto` (opcional, ≤ 300, `#vg-ref-dar-contador`;
  passa pelo filtro de `regras.js`: dado sensível, termo discriminatório, contato → erro inline), `#vg-ref-dar-declaro`
  (obrigatório: "Declaro que a pessoa trabalhou nesta empresa no período informado e que esta referência é pública…"),
  `#vg-ref-dar-cancelar`, `#vg-ref-dar-enviar` "Enviar referência" (laranja). Sucesso: "Referência enviada para a moderação da praça
  e depois para a pessoa. Ela decide se aceita; você é avisado." Limites: 1 por pessoa; 20/mês (erro da RPC exibido). RPC
  `vagas_referencia_oferecer`. Lateral: "Como aparece" (contagem + pontos antes; carta inteira depois) e "Regras".
- **Lista (`#referencias`):** `table#vg-ref-tabela` (Pessoa, Função · período, Pontos fortes, Status — Esperando a pessoa aceitar /
  Em moderação / Pública desde … / Ocultada pela pessoa / Removida pela moderação —, Quem deu, Ver); referência recusada/excluída:
  só a linha "Pessoa (recusou/excluiu)" sem nome. Lateral: "Pedidos recebidos (n)" (`.vg-item` + "Responder"; "Não lembra da pessoa
  ou não quer recomendar? Só não responda; ela não é avisada de recusa.") e "Por que vale a pena". `#vg-ref-nova` (laranja).

## 4. Telas do operador da praça (`operador.html`, computador)

Cabeçalho do menu: logo do Vagas sem Caos + "Operação da praça" + cidade(s) do operador (`minhas_cidades()`); selo fixo "Cada ato fica registrado".
O operador **nunca** vê currículo, selos, candidaturas, conversas nem contato de pessoas: nas telas só aparecem e-mail de cadastro
(assistido), conteúdo denunciado, vagas e empresas.

### 4.1 Fila de moderação (`#fila`) — `operador-fila.png`
- Segmento `#vg-op-fila-vagas` (n) / `#vg-op-fila-empresas` (n) / `#vg-op-fila-decididas` (hoje). `ul#vg-op-fila` de `.vg-fila__item`
  (`data-anuncio` ou `data-empresa`): quando chegou + por que está na fila ("1ª vaga da empresa (revisão obrigatória)", "3 denúncias
  de contas diferentes (suspensa automaticamente)", "empresa nova"), título + `.vg-status`, linha da empresa (nome, situação do CNPJ,
  zona, modalidade, valor), trecho com `<mark>` nos sinais encontrados por `regras.js`, `.vg-fila__motivos` (etiquetas: sinal/bloqueio/
  ok), ações `data-acao="publicar"` (principal) / `"devolver"` (claro) / `"remover"` (perigo). Empresas: CNPJ, nome, responsável,
  e-mail, data; ações Aprovar / Pedir documento (devolve com motivo) / Recusar; link "Consultar na Receita" (externo).
- Janela `#vg-op-confirmar` (devolver/recusar): motivo em pílulas `#vg-op-motivo` (lista fechada: pede documento ou dado pessoal;
  telefone ou link no texto; falta salário ou valor; critério discriminatório; CNPJ não confere; empresa não respondeu; outro) +
  `#vg-op-motivo-texto` (recado, ≤ 500) + `#vg-op-confirmar-cancelar` / `#vg-op-confirmar-sim`. Publicar não pede motivo.
  Tudo via `vagas_op_anuncio_decidir(id, 'publicar'|'devolver'|'remover', motivo)` (devolver = volta a rascunho com o motivo, chave de
  `conteudo/vagas-textos/moderacao.json`) / `vagas_op_empresa_decidir(id, 'aprovar'|'recusar'|'suspender'|'reativar', motivo)`
  (recusar = continua em análise com o motivo; moderador não aprova/suspende/reativa); a decisão aparece no `#vg-aviso-geral` com "Desfazer"
  por 8 s (que registra um novo ato de reversão).
- Meta na tela: "decidir em até 24 h"; item com mais de 24 h ganha etiqueta "Atrasada". Vazio: "Fila vazia. Nada esperando você."

### 4.2 Cadastro assistido (`#assistido`) — `operador-assistido.png`
- Segmento Pessoa / Empresa. `form#vg-op-form-assistido`: `#vg-op-ass-nome`, `#vg-op-ass-email` (obrigatório; ajuda "Sem e-mail? Ajude a
  criar um no celular dela… Nunca use o seu."; bloqueia e-mails já usados por operador), `#vg-op-ass-cidade`, "Onde está sendo feito"
  (Mutirão / Balcão / SINE → `codigo_evento`), `#vg-op-ass-leu` (obrigatório: "Li para a pessoa, em voz alta, o aviso: …"),
  `#vg-op-ass-criar` "Criar conta pendente e enviar o link" (laranja). Empresa: CNPJ, nome, responsável, e-mail, WhatsApp
  (`vagas_op_empresa_cadastrar` + `vagas-conta` `assistido` com `empresaId`); "Vincular pessoa já cadastrada" (`vagas_op_vincular_membro`).
- Lateral "Pendentes de confirmação (n)": e-mail, criada quando, origem, "expira em", `Reenviar link` (1 por dia); "Contas não
  confirmadas em 7 dias são apagadas." Card "O que você não vê".

### 4.3 Denúncias (`#denuncias`) — `operador-denuncias.png`
- `table#vg-op-denuncias`: Quando, Alvo (vaga / mensagem / referência, com empresa), Motivo, Trecho (só o conteúdo denunciado),
  Status (Aberta / Suspensa (3 denúncias) / Improcedente · data / Removida), ações por tipo: vaga → Remover / Improcedente; mensagem →
  Avisar a empresa (manda o aviso padrão por e-mail e registra) / Suspender empresa / Improcedente; referência → Remover /
  Improcedente. Nunca mostra quem denunciou. Decisão por `vagas_op_denuncia_decidir(id, {decisao:'procedente'|'improcedente', motivo,
  removerAnuncio?, suspenderEmpresa?, suspenderAutor?, removerReferencia?})` (janela com o motivo obrigatório e as caixas das
  consequências). Golpe confirmado: o botão "Avisar quem liberou contato" (`vagas_op_avisar_contatos`) **fica oculto** até a RPC
  existir (proposta da operação, não está no contrato); o operador não vê a lista de pessoas.
- Filtro Abertas / Todas; meta "decidir em 24 h"; nota "Toda decisão grava o motivo no registro de moderação. A equipe da Gestão sem
  Caos pode reverter."

### 4.4 Empresas (`#empresas`)
- Tabela: nome, CNPJ, status (`em_analise`/`ativa`/`suspensa`), vagas ativas, membros, cadastrada em, último ato; ações Aprovar /
  Suspender (motivo) / Reativar; busca por nome/CNPJ. Detalhe em janela: dados, histórico de moderação, vagas.

### 4.5 Boletim do dia (`#boletim`) — `operador-boletim.png`
- `#vg-op-boletim-periodo` (novas desde ontem / últimas 24 h / semana), `#vg-op-boletim-cidade` (praça inteira ou uma cidade),
  `pre#vg-op-boletim-texto` (texto fixo gerado: cabeçalho, lista numerada "cargo · zona · modalidade · valor" + link curto, link da
  lista completa, frase anti-golpe curta, assinatura), `#vg-op-boletim-copiar` "Copiar boletim" (laranja; feedback "Copiado").
  Modelo de texto: `conteudo/vagas-operacao/boletim-e-radio.md` (operação) com revisão de textos. Lateral "Onde postar" e "Ontem"
  (postado, cliques do link, Quero). Sem disparador: a tela só copia.

### 4.6 Repasse do mês (`#repasse`) — `operador-repasse.png`
- Seletor do mês; 4 cards (receita líquida da praça, seu repasse em destaque + status "aguardando nota / pago em", vendas pelo
  parceiro 50 %, vendas online 20 %; presencial 80 %); `table#vg-op-repasse-tabela` (data, empresa, produto, origem, pago, %, repasse;
  estornos negativos); `#vg-op-repasse-baixar` CSV. Praça com operação própria da Gestão sem Caos (sem parceiro): tela mostra só a receita, sem repasse ("Nesta praça
  não há repasse"). Fase 1: cálculo por função do banco, Pix manual (status muda pela equipe no painel).

### 4.7 Zonas e textos (`#zonas`)
- Lista das zonas da cidade (nome, bairros, ordem) com Adicionar / Editar / Desativar (`vagas_adm_zona_salvar`); textos locais da
  cidade (WhatsApp da praça, endereço do balcão, horário do mutirão) que aparecem nas telas da pessoa. Status e preços: só leitura
  ("Só a equipe muda").

## 5. Aba "Vagas" no painel da Gestão sem Caos (`admin.html`) — `painel-vagas-cidades.png`, `painel-vagas-numeros.png`, `painel-vagas-moderacao.png`

Grupo "Vagas" no menu lateral (entre Empresas e Vendas): **Cidades e praças** (`data-aba="vg-cidades"`), **Operadores**
(`vg-operadores`), **Moderação geral** (`vg-moderacao`, com contagem de pendências), **Números da praça** (`vg-numeros`). Só para
`e_admin()`; some do menu sem a migração `20261022120000_vagas` (como as outras abas fazem com `versaoBanco`).

- **Cidades e praças (`ul#vg-adm-cidades`):** card por cidade (`.vg-cidade-card`, `data-cidade`): nome, `.vg-status` (Rascunho / Lista
  de espera / Ativa / Ativa (entorno) / Pausada), linha da praça (polo + entorno, operador, desde), números (vagas ativas / alvo,
  pessoas com selo, empresas ativas, fila; lista de espera: "112 / 200" com barra), ações Zonas (n) / Preços locais (janela com os
  produtos e preço da cidade) / Pausar / Reativar / "Ativar (faltam 88)" (desabilitado até a meta). `#vg-adm-nova-cidade` (janela:
  nome, slug, IBGE, UF, entorno, status inicial rascunho; `vagas_adm_cidade_salvar`). Mudar status pede confirmação na página com o
  efeito ("Pausar Caracaraí esconde 8 vagas e bloqueia cadastros; nada é apagado.").
- **Operadores (`table#vg-adm-operadores`):** pessoa, cidade, papel (operador/moderador/equipe), contrato (versão · data), repasse
  (20/50/80 ou 0 % para operação própria), último ato, ações Editar / Desligar (confirmação; `vagas_adm_operador_salvar` +
  `vagas-conta` `operador`). "Novo operador": e-mail, cidade, papel, percentuais, versão do contrato.
- **Moderação geral (`table#vg-adm-moderacao`):** todos os atos (`vagas_op_moderacao`) com cidade, quem, ato, alvo, motivo e
  "Reverter" (registra um ato novo); filtros cidade/tipo/busca; pendências de todas as cidades no topo.
- **Números da praça (`#vg-adm-numeros`):** seletor de praça e período; cards `.vg-numero` com valor, alvo e barra (lista fechada de
  `conteudo/vagas-operacao/indicadores.json`, 15 chaves: `vagas_ativas`, `pessoas_com_selo_por_funcao`, `vagas_3_interessados_72h`,
  `vagas_combinou_7d`, `primeira_resposta_empresa_dias`, `contratacoes`, `empresas_ativas_mes`, `empresas_buscando_semana`,
  `empresas_pagantes`, `receita_liquida_centavos`, `denuncia_tempo_decisao_h`, `emails_mes`, `fila_moderacao`, `lista_espera`,
  `cadastros_assistidos_confirmados`); cor pela regra da operação (verde/amarelo/vermelho só como etiqueta `.vg-status`, nunca como
  bloco de cor); `table#vg-adm-selos` (pessoas com selo por função, vagas que pedem, tentativas, nota mediana — acompanhamento do
  teste, nunca aparece para empresa [REVISÃO PSICOLOGIA]); gatilhos da proposta como etiquetas ("Antes de cobrar: 3 de 5 metas").
  Dados: **nesta onda** `vagas_op_resumo()` devolve `{cidades:[{id, slug, nome, status, papel, contagens:{empresasEmAnalise,
  empresasAtivas, anunciosEmRevisao, anunciosSuspensos, anunciosNoAr, denunciasAbertas, pessoas, listaEspera}}]}` — a tela monta
  os cards só com essas 8 contagens (vagas no ar, em revisão, suspensas, empresas ativas/em análise, denúncias abertas, pessoas,
  lista de espera) e deixa os demais `.vg-numero` ocultos. Os 15 indicadores com alvo e cor virão em `vagas_op_indicadores(p_cidade)`
  na onda do painel; até lá a tela mostra "Em breve" nesses cards (nunca número inventado).

## 6. Estados, erros e mensagens (resumo transversal)

| Situação | Onde | Mensagem |
|---|---|---|
| Carregando | todas | "Carregando…" (`.giro`), esqueletos sem pulo |
| Erro de rede | todas | "Não deu para carregar. Tentar de novo." |
| Sem internet | pessoa | faixa "Sem internet. Mostrando o que você viu por último. Suas respostas e rascunhos ficam guardados no celular." |
| Sessão expirada | logadas | volta ao entrar com "Sua sessão venceu. Entre de novo para continuar." |
| E-mail não confirmado | logadas | "Confirme o e-mail para continuar. Não chegou? Reenviar." |
| Conta/empresa suspensa | logadas | "Conta suspensa. Fale com a praça pelo WhatsApp." (só leitura) |
| Cidade em lista de espera | lista, vaga | tela 2.2 |
| Cidade pausada | lista, vaga | tela 2.3 |
| Vaga fora do ar | vaga | "Esta vaga não está mais no ar." + parecidas |
| Campo obrigatório vazio | formulários | "Preencha <o campo>" (sempre nomeando o campo) |
| Termo proibido | nova vaga, mensagem, referência | mensagens da seção 3.3 |
| Limite (candidaturas, tentativas, referências) | RPC | a mensagem da RPC, em `.aviso--erro`, sem código técnico |
| Sucesso de ação | todas | `#vg-aviso-geral` 4 s: "Salvo", "Enviado", "Copiado", "Candidatura retirada" |

## 7. O que NÃO aparece (lista de conferência para o QA)

- Nos filtros da pessoa: nada sobre a pessoa (nota, idade, sexo, "tem referência", escolaridade da pessoa); só atributos da vaga.
- A foto (opcional) da pessoa: nunca no cartão cego, na busca do banco, na prévia do passo 5 nem para o operador; só depois do
  Combinou, junto com nome e contato (`#vg-conversa-foto`, `#vg-contato-foto`).
- No cartão cego e na busca: nome, foto, idade, nacionalidade, gênero, estado civil, filhos, cor, religião, saúde, antecedentes,
  contato, DISC, nota mínima, pontuação, ordenação por nota, "compatibilidade", texto e nome da empresa das referências.
- No selo: "aprovado", "reprovado", percentil, comparação; o selo sempre traz teste, nota, data, validade, "online, sem supervisão"
  (ou "presencial, documento conferido" na fase 2) e código.
- Em toda a plataforma: "Tinder", "swipe", "match", "perfil ideal", "o teste prevê", "currículo verificado", "ranking", "Notus",
  estrela da Notus, estrelas/média em referência, preço para a pessoa (nada é cobrado da pessoa no MVP).
- Para o operador: qualquer dado de pessoa além do e-mail de cadastro assistido e do conteúdo denunciado.

## 8. Fluxos resumidos (o que acontece depois)

1. **Pessoa:** lista → vaga → Quero → (entrar/criar conta → currículo 5 passos) → "Candidatura enviada" → aviso por e-mail → convite
   (nome da empresa aparece) → Combinou (contato liberado) → conversa/WhatsApp → "contratada" (marcada pela empresa) → e-mail
   "Parabéns" (sem DISC para a pessoa).
2. **Teste:** catálogo → instruções → prova (1 questão por tela) → resultado e selo → vagas que pedem o selo.
3. **Empresa:** cadastro → confirmar e-mail → (em análise) nova vaga (rascunho) → liberação do CNPJ → publicar (revisão nas 3 primeiras)
   → link curto/WhatsApp → cartões cegos → Quero conversar → pessoa aceita → contato liberado → Contratada → integração (DISC, fase 2).
4. **Referência:** pessoa pede (ou empresa oferece) → empresa preenche → moderação → pessoa aceita → contagem no cartão cego →
   carta inteira depois do Combinou.
5. **Operador:** fila (vaga/empresa) → decide com motivo → registro; denúncia → decide em 24 h; mutirão → cadastro assistido →
   pessoa confirma pelo link; manhã → copiar boletim → Canal/grupos; mês → repasse.

## 9. Componentes reutilizáveis e classes (`vagas/assets/vagas.css`)

CSS completo proposto (só tokens do `notus.css`) está em `scratchpad/vagas/telas-src/casca.mjs` (`VAGAS_CSS`) e
`telas-referencia.mjs` (`REF_CSS`); o agente das telas copia para `vagas/assets/vagas.css` e ajusta. Peças do teste reaproveitadas
sem mudar: `.topo/.topo-interno`, `.conteudo`, `.acoes`, `.progresso-*`, `.barra-nav/.barra-dica/.barra-botoes`,
`.retrato/.escolha-marca`, `.codigo`, `.rodape`; do painel: `.menu-lateral/.aba/.menu-grupo`, `.cabecalho`, `.resumo`, `.filtros/.escolha`,
`.segmento`, `.vazio`, `.confirmar/.janela__caixa`, `.form-grade`, `.login*`.

| Componente | Classes | Uso |
|---|---|---|
| Pílula da cidade | `.vg-cidade` | topo da pessoa; abre a janela de cidades |
| Navegação inferior | `.vg-nav`, `.vg-nav__item[aria-current]`, `.vg-nav__n` | pessoa logada; 4 destinos; alvo 48 px |
| Faixa de estado | `.vg-faixa`, `.vg-faixa--offline` | cidade pausada/espera, sem internet, empresa em análise/suspensa |
| Chips de filtro | `.vg-chips`, `.vg-chip[aria-pressed|aria-expanded]`, `.vg-busca`, `.vg-contagem` | lista pública; também opções em formulários (`.vg-opcoes`) |
| Barra de filtros resumida | `.vg-filtros-barra`, `.vg-chip--filtrar`, `.vg-chip__n`, `.vg-chips--ativos` | lista: "Filtrar (n)" + chips do que está ativo com ✕ |
| Folha de filtros | `.vg-folha-veu`, `.vg-folha/__cab/__alca/__grupo`, `.vg-checks` | sobe de baixo no celular; janela no computador; botão único "Ver N vagas" na `.barra-nav` |
| Foto opcional | `.vg-foto/__previa[--vazia]/__acoes`, `.vg-foto__mini[--grande]` | currículo (campo); conversa e contato da empresa depois do Combinou |
| Iniciais da empresa | `.vg-iniciais`, `--grande`, `--confidencial` | em vez de foto/logo |
| **Cartão de vaga** | `.vg-vagas > li > .vg-vaga`, `--destaque`, `__corpo/__titulo/__empresa/__valor/__meta/__etiquetas/__quando` | lista, prévia na empresa, boletim visual |
| Etiquetas | `.vg-etiqueta`, `--urgente` (laranja), `--destaque` (contorno), `--hoje` (azul-escuro), `--selo` (nevoa) | modalidade, pede selo, urgente, destaque |
| Empresa verificada | `.vg-verificada` | sempre com o ícone de check laranja; texto "verificada" |
| **Aviso anti-golpe** | `.vg-golpe` | texto fixo; ícone escudo em `--notus-forte` |
| **Selo habilidade testada** | `.vg-selo`, `--destaque`, `--mini`, `__topo/__icone/__rotulo/__nome/__nota/__linha/__codigo` | resultado, catálogo, vaga, conferência; nunca "aprovado" |
| **Cartão cego da pessoa** | `.vg-cartoes > li.caixa.vg-cartao`, `--decidido`, `__topo/__ordem/__quem/__chegou/__linhas(dl)/__selos/__refs/__acoes/__status` | empresa (candidatos, banco), prévia no passo 5 |
| **Barra de progresso da prova** | `.vg-prova__topo`, `.vg-tempo[--pouco]`, `.vg-prova__barra/.vg-prova__feito` (trilho liso), `.vg-prova__enunciado/__apoio/__opcoes`, `.vg-opcao/__letra`, `.vg-reconectando` | prova |
| Catálogo de testes | `.vg-testes`, `.vg-teste/__nome/__info/__acao` | testes.html |
| **Caixa de conversa** | `.vg-conversa__cab/__quem/__nome/__vaga`, `.vg-mensagens`, `.vg-msg`, `--minha`, `--sistema`, `__hora`, `.vg-escrever`, `.vg-bloqueio` | pessoa e empresa |
| Convite (nome aparece) | `.vg-convite/__titulo/__empresa/__lista` | pessoa |
| Linhas com status | `.vg-linhas > li > .vg-linha/__titulo/__sub`, `.vg-status--enviada|conversar|combinou|contratada|agora-nao|retirada|encerrada|revisao|suspensa|removida` | candidaturas, vagas, tabelas |
| Passos do currículo | `.vg-passos > .vg-passo[--feito|--atual]`, `.vg-rascunho` | 5 passos; nova vaga reutiliza `.vg-rascunho` |
| Item com ação | `.vg-item/__texto/__titulo/__sub` | quem viu, meus dados, pendentes |
| Tabela | `.vg-tabela`, `th`, `td.num`, `.vg-tabela__acoes`, `.nao-quebra` | operador e painel |
| Fila de moderação | `.vg-fila > li.caixa.vg-fila__item`, `__motivos`, `__trecho mark`, `__acoes` | operador |
| Grade com lateral | `.vg-grade`, `.vg-lateral`, `.vg-link-curto` | computador; 1 coluna abaixo de 900 px |
| Boletim | `.vg-boletim` (pre) | operador |
| Pedido/pagamento | `.vg-pedido`, `.vg-produtos > .vg-produto[aria-pressed]/__nome/__sub/__preco`, `.vg-pedido__total`, `.vg-pagamento-abas` | compras da empresa (padrão do checkout) |
| Conferência do selo | `.vg-conferir/__ok` | selo.html |
| Números da praça | `.vg-numeros > .caixa.vg-numero/__rotulo/__valor/__alvo/__barra/__feito`, `.vg-cidades > li.vg-cidade-card/__nome/__linha` | painel |
| **Referência profissional** | `.vg-refs > li > .vg-ref[--pendente]/__topo/__quem/__empresa/__meta/__pontos/__recomenda/__texto/__assina/__acoes`, `.vg-ref-contagem`, `.vg-contador` | pessoa, empresa, cartão cego (só contagem + pontos) |

Regras das peças: cores só por token; destaque (`--notus`) apenas em "olhe aqui" (etiqueta urgente, chip selecionado, convite,
contato liberado, número em foco); verde/vermelho só em ok/erro; barras sempre azul-escuro sobre trilho liso; cantos 20–24 px nos
cards e 999 px nas pílulas; `font-variant-numeric: tabular-nums` em listas e tabelas.

## 10. Decisões de UX e por quê

1. **Uma ação principal por tela, na barra fixa inferior (celular).** A pessoa com celular simples não procura botão: Quero/Pular,
   Continuar, Responder ficam sempre no mesmo lugar (padrão do teste DISC).
2. **Cartão cego é literalmente o passo 5 do currículo.** A pessoa vê o que a empresa vê; reduz medo e reclamação de "não me acham".
3. **O nome da empresa confidencial aparece no convite, antes de a pessoa liberar o contato.** Ninguém libera WhatsApp para uma
   empresa que não sabe qual é; a assimetria some no momento certo (acréscimo aprovado na mesa).
4. **"Agora não" não é comunicado como recusa.** A candidatura muda para "Encerrada" sem frase negativa: evita desânimo e evita a
   empresa ter de "rejeitar"; o operador acompanha o tempo de resposta pelo painel.
5. **Prova com confirmação ("Responder") em vez de avançar ao tocar.** Toque acidental em tela pequena é comum; o custo de um toque a
   mais é menor que perder uma questão sem volta.
6. **Filtros em chips com janela, nunca `<select>`.** Regra da identidade; no celular a janela em pílulas é mais fácil de tocar.
7. **Recusa de termo proibido explica a lei em uma frase e diz o que escrever no lugar.** Evita a empresa achar que é censura.
8. **Operador não tem tela de "pessoas".** O desenho garante a regra LGPD (operador = quem não vê currículo) na interface, não só no RLS.
9. **Preços e botões de compra ficam ocultos até o dono liberar** (fase de lançamento grátis): a tela já existe, o direito manda.
10. **Referência é "carta", não "avaliação":** sem estrelas, sem média, só positiva, com aceite da pessoa; no cartão cego só a
    contagem e os pontos fortes (lista fechada da psicologia) para não virar ranking indireto.

## 11. Dúvidas para o dono

1. A pessoa escolhe até 2 cidades: a lista mostra as duas misturadas ou uma de cada vez com a pílula do topo? (desenhado: uma de cada
   vez, com "Incluir <entorno>" quando houver; piloto em Uruaçu-GO, sem entorno por enquanto).
2. "Quero" sem currículo completo: enviar assim mesmo com o que houver ou exigir os 5 passos? (desenhado: exige terminar; a intenção é guardada).
3. A empresa pode escrever a primeira mensagem ao chamar para conversar? (desenhado: sim, opcional).
4. Lista de espera: pedir só e-mail ou também WhatsApp? (desenhado: só e-mail, resposta neutra).
5. Referência pública no perfil público da pessoa: existe perfil público no MVP? (desenhado só o toggle, marcado fase 2).
6. Preços locais por cidade aparecem já na tela de compras do lançamento ou tudo "grátis no lançamento" até a semana 11?
