# Vagas sem Caos — especificação técnica (fundação)

Fonte da verdade para quem constrói as telas do **Vagas sem Caos** (vagas.gestaosemcaos.com.br), uma ferramenta da
**Gestão sem Caos**. Aqui está o contrato entre as telas e o banco: tabelas, estados, cada RPC com chamada, resposta e as
mensagens de erro **exatas**, os fluxos (Quero → conversa → Combinou), as regras de privacidade e a lista de telas previstas.
O desenho das telas está em `docs/VAGAS-TELAS.md`; os textos longos (termos, privacidade, e-mails, WhatsApp) em
`conteudo/vagas-textos/`; a hospedagem em `docs/VAGAS-HOSPEDAGEM.md`; os testes de habilidade em `docs/VAGAS-TESTES.md`.

| Peça | Arquivo |
|---|---|
| Migração (tabelas, RLS, RPCs, cidades iniciais) | `supabase/migrations/20261022120000_vagas.sql` |
| Onda 2 do banco (painel da praça, equipe da empresa, WhatsApp na lista de espera, fuso da cidade) | `supabase/migrations/20261024120000_vagas_onda2.sql` |
| Praça piloto Uruaçu (GO) — dados | `supabase/migrations/20261024120001_vagas_piloto_uruacu.sql` |
| Edge Function de contas (cadastro, links por e-mail) | `supabase/funcoes-fonte/vagas-conta/index.ts` + `supabase/funcoes-compartilhadas/vagas-conta.js` (montada por `scripts/montar-funcoes.mjs`) |
| Cliente das telas (contrato único) | `vagas/js/api.js` (`VAGAS_API`) |
| Prévia sem banco (dados fictícios de Uruaçu, GO) | `vagas/js/api-previa.js` (`VAGAS_PREVIA`) |
| Regras compartilhadas (listas, filtro de textos, CNPJ, WhatsApp, mensagens) | `vagas/js/regras.js` (`VAGAS_REGRAS`) |
| Configuração (modo prévia/supabase, URL e chave PÚBLICA) | `vagas/js/config.js` (`VAGAS_CONFIG`) |
| Endereço certo (disc…/vagas/ → vagas.gestaosemcaos.com.br) | `vagas/js/endereco.js` |
| Peças da marca copiadas para o site | `vagas/comum/` (gerado por `scripts/montar-vagas.mjs`; nunca editar à mão) |
| Testes | `tests/supabase/vagas.test.js` e `tests/supabase/vagas_onda2.test.js` (banco), `tests/vagas-*.test.js`, `tests/funcoes/vagas-conta.test.js` |

---

## 1. Arquitetura

- **Site estático** em `vagas/` (HTML/CSS/JS puro, sem build), publicado no Cloudflare Pages com raiz `vagas/`. Nenhuma tela
  carrega supabase-js: `vagas/js/api.js` fala com o Supabase por `fetch` (RPC `/rest/v1/rpc/<nome>`, Auth `/auth/v1/…`,
  Edge Function `/functions/v1/vagas-conta`). Ordem dos scripts em toda página:
  `js/endereco.js` (no `<head>`, antes de tudo) → `js/config.js` → `js/regras.js` → `js/api.js` → script da tela.
- **Banco:** o MESMO projeto Supabase do DISC. Tudo do Vagas fica em tabelas `public.vagas_*` (RLS ligada em todas) e no
  schema fechado `vagas_interno` (funções auxiliares; ninguém de fora executa). Nada do DISC é alterado, exceto
  `public.garantir_primeiro_admin()` (passa a NUNCA promover conta do Vagas — ver §5) e `public.versao_banco()` (ganha a
  entrada `20261022120000_vagas`).
- **Escrita só por RPC.** Nenhuma tabela `vagas_*` aceita insert/update/delete de `anon`/`authenticated`. As telas usam só
  as RPCs abaixo (via `VAGAS_API`).
- **Contas:** e-mail + senha do Supabase Auth, criadas SEMPRE pela Edge Function `vagas-conta` (nunca pelo cadastro aberto
  do Auth), com `app_metadata.produto = 'vagas'`. O cadastro não recebe senha: a conta nasce com senha aleatória e o link do
  e-mail leva à tela que cria a senha (evita que alguém "reserve" o e-mail de outra pessoa).
- **Prévia:** com `VAGAS_CONFIG.MODO = 'previa'` (padrão até o banco estar pronto) o `VAGAS_API` usa `vagas/js/api-previa.js`:
  mesmo contrato, mesmas mensagens, dados fictícios guardados só no navegador. Fora do domínio oficial (localhost, `*.pages.dev`,
  artefato), `?previa=1` na URL liga a prévia na aba e `?previa=0` desliga; no domínio oficial (`*.gestaosemcaos.com.br`) o
  endereço nunca liga a prévia, só o `MODO`. O `api.js` falha fechado: qualquer `MODO` que não seja exatamente `'previa'` usa
  o Supabase. Na prévia toda tela mostra a faixa "Prévia: dados de exemplo, nada aqui é real" (`VAGAS_UI.faixaPrevia`), a
  senha criada não fica guardada e os telefones e códigos de selo da semente não podem ser reais (DDD 23; códigos sorteados).
- **Dependência do DISC no banco:** as funções do Vagas usam quatro auxiliares do schema `disc_interno` da migração
  `20261005120000_disc`: `texto(jsonb)`, `iso(timestamptz)`, `limpar_texto(text, int)` e `origens_requisicao()` (e, por ela,
  `ip_de_texto`, `ip_publico`, `chave_ip`). Quem mudar a assinatura ou o comportamento dessas funções no DISC quebra o Vagas:
  `tests/supabase/vagas.test.js` aplica as duas migrações em sequência e pega isso. (Copiá-las para `vagas_interno` fica para
  quando o DISC precisar mudá-las.)
- **CSP das telas:** a meta `Content-Security-Policy` de `vagas/index.html` (modelo para as outras telas) libera
  `connect-src 'self' https://tevpqngqzxcswmticjnr.supabase.co` (RPC/Auth/Function por `fetch`) e `img-src 'self' data: blob:
  https://tevpqngqzxcswmticjnr.supabase.co` (foto assinada): só o projeto, nunca `*.supabase.co`, igual ao `_headers` — nunca
  precisa abrir mais do que a meta. Sem a meta, a tela dependeria só do cabeçalho da hospedagem; com ela, uma tela aberta
  fora do Cloudflare (ex.: localmente) continua com a mesma política.

## 2. Convenções do contrato

- Toda RPC devolve JSON `{ok: true, ...}` ou `{ok: false, erro: 'mensagem em português', <marcas>}`. Nunca lança erro para o
  cliente. `VAGAS_API` **resolve** com o `{ok:true}` e **rejeita** com `Error` cuja `message` é o `erro`, com
  `e.resposta` (o JSON) e as marcas copiadas (`e.sessaoExpirada`, `e.contatoCortado`…).
- Marcas (flags) possíveis: `sessaoExpirada` (sem login ou login vencido: mandar para Entrar), `confirmar` (e-mail ainda não
  confirmado), `suspensa`, `semConta` (login de fora do Vagas, ex.: só do painel DISC), `completar` (falta o currículo),
  `bloqueado` (limite anti-abuso), `naoEncontrada`, `listaEspera`, `pausada`, `verEmpresa`, `semCombinou`, `contatoCortado`,
  `bloqueada` + `tipo` (mensagem barrada pelo filtro), `aguardar` (3 mensagens seguidas), `semFoto`, `ativa` (lista de espera de
  cidade que já abriu), `existe` (cadastro assistido de e-mail que já tem conta), `duplicado` (repetição sem efeito, vem em
  respostas `ok:true`). `suspensa` também vem quando a EMPRESA da candidatura está suspensa pela moderação (contato, foto).
  Do cliente: `bancoDesatualizado` (migração não aplicada), `conexao` (sem internet), `naoConfigurado` (Edge Function ou
  e-mail não publicados), `linkExpirado`, `captcha`. Toda marca chega em `e.<marca>` (teste em `tests/vagas-api.test.js`).
- **Dinheiro sempre em CENTAVOS** (inteiro): `162100` = R$ 1.621,00. `VAGAS_REGRAS.reais(c)` e `formatarValor(valor)` formatam.
- **Datas-hora** ISO UTC (`2026-10-13T15:00:00.000Z`); vazio = `''`. **Datas** `AAAA-MM-DD` (no fuso da cidade:
  coluna `vagas_cidades.fuso`; sem cidade ou sem fuso, `America/Sao_Paulo`, UTC−3 — nada fixo em uma cidade). **Horas** `HH:MM`. **Mês de experiência/referência** `AAAA-MM`.
- **Chaves do JSON em camelCase** (como em todo o contrato). As RPCs de vaga também aceitam, na ENTRADA, as chaves em
  snake_case usadas no `docs/VAGAS-TELAS.md` (`salario_de`, `fim_de_semana`, `inicio_data`, `requisito_outro`, `hora_inicio`,
  `prazo_horas`, `horas_dia`…); a resposta vem sempre em camelCase.
- **Cidade, zona e área sempre pelo slug** (`uruacu-go`, `regiao-oeste`, `caixa`). Anúncio: `id` (uuid) nas RPCs internas e `codigo`
  (6 letras/algarismos sem ambíguos, ex.: `K7M2QX`) no link curto `/v/K7M2QX`.
- **Erros de conta** (valem para TODAS as RPCs que exigem login; vêm de `vagas_interno.conta_atual`):

| Situação | `erro` | marca |
|---|---|---|
| Sem login | `Sessão expirada. Entre de novo.` | `sessaoExpirada` |
| Login que não é do Vagas | `Esta conta não é do Vagas sem Caos.` | `semConta` |
| Conta suspensa | `Esta conta está suspensa. Fale com a Gestão sem Caos.` | `suspensa` |
| E-mail não confirmado | `Confirme seu e-mail pelo link que enviamos antes de continuar.` | `confirmar` |
| Área de pessoa com conta de empresa | `Esta área é para quem procura emprego.` | — |
| Área de empresa com conta de pessoa | `Esta área é para empresas.` | — |
| Operação sem papel na cidade | `Sem permissão.` | — |

  Sem login, RPC que não é pública nem chega a rodar (o PostgREST nega): o `VAGAS_API` já devolve
  `Sessão expirada. Entre de novo.` sem ir à rede.

## 3. Papéis

| Papel | Quem | Vê | Não vê nunca |
|---|---|---|---|
| Visitante (anon) | qualquer um | cidades, mural de vagas no ar, vaga pelo código, página pública de referências (com o link), conferência de selo | pessoas, empresas por dentro |
| Pessoa | conta `tipo='pessoa'` | o próprio currículo e cartão, as próprias candidaturas, conversas, quem viu o contato, referências recebidas | dados de outras pessoas |
| Empresa | conta `tipo='empresa'`, membro (`dono` ou `recrutador`) de uma ou mais empresas; quem é `dono` convida e remove a equipe (§8.4a) | as próprias empresas e vagas, **cartões cegos** de quem disse Quero, conversa pela plataforma, contato só depois do Combinou, referências que deu | nome/contato/"sobre"/empregadores antes do Combinou; referências pendentes ou ocultas de outras empresas |
| Operador / moderador | conta `tipo='operador'` + linha em `vagas_operadores` (por cidade). Moderador só modera (não aprova empresa, não suspende, não cadastra) | empresas, vagas, denúncias (com o texto denunciado, sem saber quem denunciou), textos de referência a moderar, registro de moderação, contagens | **pessoa, contato, currículo, candidaturas** (nem pela API nem pelas RPCs) |
| Equipe da Gestão sem Caos | `public.e_admin()` (admins do painel DISC) | tudo o que o operador vê, em todas as cidades; cria cidades/zonas/operadores | pessoa e contato pela API (o mesmo bloqueio do operador) |

`vagas_eu()` diz quem é quem (`conta.tipo`, `empresas[]`, `operador[]`, `admin`).

## 4. Estados

- **Cidade** `rascunho | lista_espera | ativa | pausada`. Só `ativa` mostra vagas e aceita cadastro de pessoa/empresa/vaga;
  `lista_espera` mostra "Ainda não chegamos" + contador; `pausada` mostra aviso; `rascunho` não aparece. Entorno: cidade com
  `praca` = outra cidade entra no mural da praça (`entorno` padrão `true`). **Porte** (20261024): `pequena` | `grande` |
  `null` (não cadastrado) — escolhe o alvo de cada indicador do painel da praça (§8.7); sem porte, sem alvo nem cor.
  **Praça piloto (20261024120001):** `uruacu-go` (Uruaçu, GO, IBGE 5221601, fuso `America/Sao_Paulo`, porte `pequena`,
  ordem 1) nasce em `lista_espera`, com as 6 zonas da operação: `centro` (Centro, Setor Central, Vila Santana, Loteamento
  Santana), `regiao-norte` (Francisco Martins), `regiao-sul` (Setor Sul, Setor Sul I), `regiao-leste` e `regiao-oeste`
  (ainda sem bairros), `zona-rural` "Zona rural e lago" (Zona rural, Geriaçu, Beira do Lago de Serra da Mesa). A equipe abre
  pelo painel (`admCidadeSalvar({slug:'uruacu-go', status:'ativa'})`). A semente fictícia da fundação (20261022: Boa Vista,
  Mucajaí, Cantá, Rorainópolis) passa a `rascunho` UMA vez (marca `piloto_definido` em `vagas_moderacao`; nada é apagado e
  rodar de novo não desfaz o que o painel mudou). Rodar a semente de novo só acrescenta zona nova: zona que já existe fica como
  o painel deixou. Os exemplos JSON abaixo usam a praça piloto.
- **Conta** `pendente` (criada, e-mail não confirmado) → `ativa` (no 1º uso depois de confirmar) | `suspensa`.
  Guarda `termos_versao` + `termos_aceitos_em` (histórico em `vagas_consentimentos`). **O consentimento só é gravado quando a
  conta passa de pendente a ativa (o clique no link)**: antes disso só a versão fica anotada, sem data e sem linha de
  consentimento. Enquanto pendente, sem e-mail confirmado e "solta" (cadastro aberto: sem `assistida_por`, sem vínculo em
  `vagas_empresa_membros` nem `vagas_operadores`), um novo `cadastrar` do mesmo e-mail pode trocar o `tipo` (quem tem o
  e-mail decide; ninguém "reserva" o e-mail de outra pessoa com o tipo errado). Conta assistida, dona pendente de empresa ou
  convite de operação pendente: o tipo NÃO muda (senão quem soubesse o e-mail derrubaria o vínculo e as vagas da empresa);
  a Function mantém o tipo, reenvia o link e responde a mesma frase neutra. Confirmada, o tipo não muda mais.
  Conta assistida (criada pelo operador) nasce sem `termos_versao`: a pessoa aceita no 1º acesso (`vagas_aceitar_termos`).
- **Empresa** `em_analise` (cadastrada pela própria empresa) → `ativa` (= CNPJ conferido pela operação; "verificada") |
  `suspensa`. Cadastrada pelo operador já nasce `ativa`. A operação pode **recusar** o cadastro: continua `em_analise`, com
  `statusMotivo` (chave de `conteudo/vagas-textos/moderacao.json`) para a empresa corrigir e pedir de novo.
- **Anúncio** `rascunho → em_revisao | publicado → pausado | encerrado`; moderação: `suspenso` (3 denúncias de contas
  diferentes), `removido` e **devolver** (volta a `rascunho` com `statusMotivo`; a empresa corrige e publica de novo).
  As **3 primeiras vagas publicadas de cada empresa** (e qualquer vaga de empresa não ativa) vão
  para `em_revisao`. "No ar" = `publicado` + dentro do prazo + empresa ativa + cidade ativa + (diária) data de hoje em diante.
  Empresa que fica sem nenhum membro ativo (o último excluiu a conta): vagas `encerrado` ("A empresa saiu da plataforma.")
  e conversas abertas encerradas com aviso.
  Prazo: 7 a 60 dias (padrão 30); **diária**: `prazoHoras` de 48 a 168 h (padrão 48); depois do dia do trabalho ela sai do ar.
- **Candidatura** `enviada` (Quero) → `conversar` (empresa quer conversar ou escreveu) | `agora_nao` → `combinou` (a pessoa
  liberou o contato) → `contratada`; a pessoa pode `retirada` (antes do Combinou) ou `recusada` (recusa o convite).
  Depois do Combinou a pessoa pode **cortar o acesso** (`contatoCortadoEm`), e liberar de novo.
  Rótulos para a pessoa (`VAGAS_REGRAS.STATUS_CANDIDATURA`): Enviada · Responder · Encerrada (agora_nao; nunca "a empresa
  disse não") · Combinou · Contratada · Você recusou · Retirada.
- **Conversa** `aberta | encerrada` (uma por candidatura; aberta pela empresa).
- **Convite de equipe** (20261024) `pendente` (aberto, no prazo) | `vencido` (72 h) | `aceito` | `cancelado` (pela dona/pelo dono,
  por um convite novo para o mesmo e-mail ou porque quem convidou saiu da equipe). Rótulos em `VAGAS_REGRAS.STATUS_CONVITE_EQUIPE`.
- **Referência** (visão da pessoa) `pendente → aceita ⇄ ocultada`, `pendente → recusada`, qualquer → `removida`.
  Visão da EMPRESA AUTORA (veto P2): `pendente | aceita | recusada | removida` — ocultada e removida pela pessoa depois do
  aceite aparecem como **aceita**; removida antes do aceite = **recusada**; `removida` só quando foi a moderação.
  Texto livre: `sem_texto | pendente | publicado | nao_publicado` (aparece para terceiros só `publicado`; rótulos em
  `VAGAS_REGRAS.TEXTO_STATUS`). Nenhuma RPC devolve a palavra "aprovado": o texto é publicado ou não.
- **Denúncia** `aberta → procedente | improcedente`.

## 5. Regras de privacidade (cada uma tem teste no banco: `tests/supabase/vagas.test.js`)

1. **Cartão cego.** Antes do Combinou a empresa vê só: cidade, zona, funções procuradas, experiências (função, meses, atual,
   informal — **sem empregador**), tempo total, escolaridade, turnos, CNH, modalidades, pretensão, cursos, selos e
   `temReferencia`. Nunca nome, contato, "sobre você", foto, idade, empregadores.
2. **Campos proibidos não existem.** Nenhuma coluna de idade, nascimento, gênero/sexo, estado civil, filhos, gravidez,
   cor/raça, religião, nacionalidade, saúde/deficiência, antecedentes, CPF/RG, foto. Só "tenho 18 anos ou mais"
   (`maior_18 = true`). Chaves desconhecidas enviadas pelas telas são ignoradas.
3. **Contato só depois do Combinou** (`vagas_contato_pessoa`), e cada leitura fica em `vagas_acessos_contato`
   ("Quem viu meu contato"). A pessoa pode **cortar** o acesso depois.
4. **Vaga confidencial:** o nome da empresa aparece para a pessoa quando ela abre o convite ("ver a empresa"), ANTES de
   liberar o contato; o Combinou exige ter visto. Só empresa com CNPJ conferido anuncia como confidencial.
5. **Conversa sem dados:** mensagens passam pelo filtro (telefone, e-mail, rede social, link, Pix/taxa/depósito, pedido de
   documento/senha/código, perguntas discriminatórias) — o banco recusa até se alguém tentar gravar direto. A empresa manda
   no máximo 3 mensagens seguidas sem resposta.
6. **Salário obrigatório** (centavos); diária com data, horário e valor; termos discriminatórios e de golpe recusados pelo
   banco (mesma lista em `VAGAS_REGRAS.PADROES` e `vagas_interno.padroes_proibidos()`; teste compara um a um).
7. **3 denúncias de contas diferentes** tiram a vaga do ar (`suspenso`) até a moderação decidir; denúncia sem login conta
   para a moderação mas não para a regra das 3.
8. **Operação e equipe não leem pessoa nem contato** (nem tabela, nem RPC). A moderação de mensagem vê só o texto e o lado
   (empresa/pessoa), nunca quem denunciou.
9. **Referência:** só aparece depois do aceite da pessoa; pendente/oculta de uma empresa nunca aparece para outra empresa,
   para o operador ou para a equipe pela API; no cartão cego só `temReferencia` (P1); ocultar/remover não chega à empresa
   autora por nenhum caminho (P2; teste compara TODAS as respostas que a empresa consegue pedir antes e depois); nenhuma
   RPC filtra por "tem referência" (P3).
10. **Conta do Vagas nunca vira administradora do painel DISC** (`garantir_primeiro_admin` recusa `app_metadata.produto =
    'vagas'` ou linha em `vagas_contas`, mesmo sendo o primeiro login do projeto).
11. **Anti-enumeração:** cadastro, reenviar e esqueci respondem sempre a mesma frase neutra; referência por e-mail responde
    `{ok:true, enviada:true}` exista ou não a pessoa (inclusive quando a empresa está no limite de 20), só aparece para a
    empresa depois do aceite e **não entra em `restantes30Dias` nem no limite** enquanto pendente (o contador conta só o que a
    empresa consegue ver). Lista de espera: `interessados` é aproximado (dezenas, até o dia anterior) e não muda com o
    e-mail de agora.
12. **Foto opcional:** bucket PRIVADO `vagas-fotos` do Storage (`<user_id>/foto.jpg`, até 1 MB, jpg/png/webp). A pessoa grava,
    troca, vê e apaga só a própria; ninguém mais lê direto (nem operador, nem equipe, nem anon). Nunca vai para o cartão
    cego, a busca, a prévia do cartão nem a operação. Depois do Combinou (e sem corte de acesso), a empresa DAQUELA
    candidatura recebe uma URL assinada de 5 minutos pela Edge Function (o banco confere em `vagas_conta_foto`). Excluir a
    conta apaga o arquivo.
13. **Nenhum filtro por dado da pessoa na lista de vagas nem nos cartões:** `vagas_anuncios_publicos`/`vagas_feed` não leem
    nota, selo, referência, idade nem sexo (as chaves são ignoradas; teste no banco olha até o código-fonte da função), e
    `vagas_cartoes` ignora `temSelo` (veto P3: o selo é só informação no cartão). O `selo` da vaga é só informativo ("esta
    vaga valoriza o selo X"), nunca filtro nem corte.
14. **Empresa suspensa pela moderação** não lê mais o contato nem a foto de ninguém (`suspensa`) e não escreve na conversa
    (`podeEscrever:false`), mesmo depois do Combinou — a pessoa não fica sabendo da suspensão para cortar o acesso.
15. **Operação:** `vagas_op_vincular_membro` só liga uma conta a empresa SEM membro ativo (cadastro assistido); empresa com
    membro convida pelo painel dela (onda do painel). Na denúncia, a operação lê só o conteúdo: `autor`, `origem` (chave do
    IP) e `autor_mensagem_user` ficam fora do alcance de qualquer leitura (privilégio por coluna, só a `service_role`).
16. **Toques duplos e erros crus:** Quero, Combinou e oferta de referência em dobro não lançam erro nem duplicam (uma
    candidatura, uma mensagem de sistema, uma referência); cursor impossível e número gigante viram `{ok:false}`.
17. **Limite por origem** (`vagas_interno.origens_de`): usa `cf-connecting-ip` e o primeiro IP público de `x-forwarded-for`.
    PRESSUPÕE o Cloudflare na frente do Supabase (é assim no projeto, `cf-connecting-ip` sempre presente); sem ele, o
    `x-forwarded-for` é forjável e sobram só os tetos totais (300/h) e por e-mail (3/h).

## 6. Fluxos

### 6.1 Quero → conversa → Combinou (a espinha do produto)

```
Pessoa: vagas_quero(anuncioId) ........................ candidatura 'enviada'
Empresa: vagas_cartoes(anuncioId, filtro) ............. cartão cego, ordem de chegada (sem ranking)
Empresa: vagas_empresa_decidir(cand, 'conversar') ..... 'conversar'   (ou 'agora_nao' → conversa encerrada)
   ou    vagas_mensagem_enviar(cand, texto, id) ....... escrever já vale como "Quero conversar"
Pessoa: vagas_conversa(cand) / vagas_mensagem_enviar .. conversa pela plataforma, sem dados
Pessoa: vagas_ver_empresa(cand) ....................... (vaga confidencial) mostra a empresa ANTES do contato
Pessoa: vagas_combinar(cand) .......................... 'combinou': contato liberado para os dois lados
Empresa: vagas_contato_pessoa(cand) ................... nome, WhatsApp, e-mail, "sobre", experiências com empregador,
                                                        referências completas — cada leitura registrada
Pessoa: vagas_quem_viu_meu_contato() .................. empresa, vaga, quando, quantas vezes
Pessoa: vagas_cortar_acesso(cand) ..................... (opcional) a empresa perde o contato e a conversa
Empresa: vagas_marcar_contratada(cand) ................ 'contratada'
```

A pessoa sai antes do Combinou com `vagas_retirar` (Quero desfeito) ou `vagas_recusar` (convite recusado). Depois do Combinou
ela não "retira": avisa pela conversa (ou corta o acesso).

### 6.2 Diária e "para hoje"

Modalidade `diaria` exige `data` (hoje até +7 dias), `horaInicio`, `horaFim` e `salarioDe` (o valor do dia; unidade `dia`).
Fica no ar `prazoHoras` (48 a 168 h). O mural filtra `paraHoje: true` (diárias com data de hoje no fuso da cidade). Renovar
diária não existe ("Para outra data, crie uma diária nova.").

### 6.2a Vaga "como produto" (campos fechados) e a busca da pessoa

A empresa preenche listas fechadas antes do texto livre (chaves e valores na §8.4, `vagas_anuncio_salvar`); a pessoa filtra
por área (até várias, OU entre elas), turno, salário mensal mínimo, "sem experiência", modalidade, zona, entorno e "para hoje",
e vê só o total quando a tela pede (`somenteTotal`, botão "Ver N vagas"). Com login, a lista abre nas áreas de interesse do
currículo (`areas`, até 3); `areas: []` mostra todas. O índice `vagas_pessoas_areas_idx` prepara o aviso de vaga nova por área
(envio na fase 2).

### 6.3 Publicação e revisão

`vagas_anuncio_salvar` grava rascunho (ou edita) → `vagas_anuncio_publicar` → `em_revisao` (empresa em análise ou < 3 vagas
já publicadas) ou `publicado`. A operação publica/remove (`vagas_op_anuncio_decidir`). A empresa pausa, retoma, encerra e
renova (`vagas_anuncio_acao`).

### 6.4 Denúncia

`vagas_denunciar({alvo:'anuncio'|'mensagem'|'referencia', id, motivo, detalhe})`. Motivos (`VAGAS_REGRAS.MOTIVOS_DENUNCIA`,
itens `{id, rotulo, chave, texto}`): `golpe` (Pede dinheiro), `documento` (Pede documento), `discriminacao` (Discriminação),
`falsa` (Parece falsa), `ofensa` (Assédio ou ofensa), `contato` (Pede contato fora da plataforma), `outro` (Outro); `cobranca`
continua aceito por compatibilidade (é "pede dinheiro"; fora de `MOTIVOS_DENUNCIA_TELA`). Anúncio aceita `id` = uuid ou
código. Mensagem e referência só com login.

### 6.5 Referência profissional (pública, positiva, factual)

- Empresa **verificada** (ativa, CNPJ conferido) dá: por pedido da pessoa (link `/referencia.html?t=<token>`), depois do
  Combinou (`candidaturaId`) ou por e-mail (resposta neutra). 1 por empresa por pessoa; 20 por empresa a cada 30 dias.
- Conteúdo: função, vínculo (`clt|temporario|diaria|estagio|freelancer`), início/fim por mês (fim vazio = trabalha lá),
  **1 a 3 pontos fortes da lista fechada da psicologia**, "recomendaria para" (até 5 funções), texto opcional ≤ 300
  (filtrado e moderado pela operação da cidade da empresa), declaração obrigatória.
- Pontos fortes (chave → texto na tela, `VAGAS_REGRAS.PONTOS_FORTES`): `pontualidade` Chega no horário e avisa quando não
  pode · `atendimento` Atende bem o cliente · `caixa_certo` Caixa fecha certo · `organizacao` Mantém o posto organizado ·
  `equipe` Ajuda os colegas quando precisa · `aprende_rapido` Aprende uma tarefa nova em poucos dias · `regras_seguranca`
  Segue as regras e a segurança do trabalho · `comunicacao` Passa recado e informação de forma clara · `iniciativa` Resolve o
  que vê sem esperar ordem · `cuidado_material` Cuida do material, do equipamento e do ambiente · `vendas` Vende bem e oferece
  o produto certo · `situacao_dificil` Resolve reclamação ou situação difícil com calma.
- A pessoa aceita/recusa (pendente), oculta/mostra, remove. **Cartão cego: só "Referência de empresa verificada: sim"**
  (`temReferencia`). Completa (com nome da empresa e texto aprovado) em `vagas_contato_pessoa` e na página pública que a
  pessoa liga (`/referencias.html?t=<token>`).
- Depois que a pessoa respondeu, a empresa só muda a referência se a pessoa pedir de novo (convite). Moderação pode remover
  (fraude/abuso) — aí sim a empresa vê "removida" e o motivo.
- Limitação conhecida: quem abre a página pública SEM login não é identificado; se alguém da empresa autora abrir o link sem
  entrar, a referência oculta não aparece. A tela de "Ocultar" deve explicar à pessoa que a referência some do perfil
  público e do cartão.

### 6.6 Contas (Edge Function `vagas-conta`, §9)

Cadastro (`cadastrar`, sem senha) → e-mail com link `…/entrar.html?token_hash=…&type=invite` → `confirmarLink` →
"Crie sua senha" (`definirSenha`) → `entrar`. Esqueci: `esqueci` → link `type=recovery` → mesma tela. Cadastro assistido
(operador, no mutirão): `assistido` → a pessoa recebe o link e cria a senha; no 1º acesso aceita os termos.
Convite de equipe (20261024): a dona/o dono chama `convidarEquipe(empresaId, email)` → e-mail com `…/entrar.html?convite=<token>`
(quem já tem conta de empresa) ou `…/entrar.html?token_hash=…&type=invite&convite=<token>` (quem não tem conta: o mesmo link
confirma o e-mail e cria a senha) → a tela lê `conviteDoEndereco(location)`, mostra `conviteEquipe(token)` e só depois do
clique em "Aceitar" chama `aceitarConviteEquipe(token)` (§8.4a).

### 6.7 Aviso de "a cidade abriu" para a lista de espera (20261024120002, reforçado pela 20261024120003)

Só a **equipe da Gestão sem Caos** (`public.e_admin()`) avisa. A operação da cidade não vê esta fila: ela nunca lê contato de
pessoa, e a lista de espera é contato. Nenhuma tela recebe a lista de e-mails.

1. **Abrir a cidade:** `admCidadeSalvar({slug, status:'ativa'})`. Um gatilho grava `vagas_cidades.aberta_em` cada vez que a
   cidade passa a `ativa` (cidade que já estava aberta quando a migração rodou conta a partir da migração).
2. **Conferir antes de disparar:** `admAvisoResumo(cidade)` (item 6) mostra quantos estão na fila, quanto ainda cabe no
   teto de hoje e em quantos dias o e-mail termina (`teto.diasPrevistos`). Lista grande demais para os 30 dias da retenção:
   aumente o teto (plano pago do Resend) antes de começar.
3. **E-mail, em lotes:** a tela da equipe chama `VAGAS_API.avisarListaEspera(cidade, limite?)` (ação `avisar_lista_espera`
   da `vagas-conta`, §9) e repete enquanto `terminou`, `travado` e `tetoAtingido` vierem `false`. Em cada chamada o banco
   reserva até `limite` pessoas (padrão 25, de 1 a 50, e nunca mais do que ainda cabe no teto) e grava `avisado_em` na
   reserva: ninguém recebe duas vezes, nem rodando de novo, nem com duas abas. A fila anda primeiro por tentativas
   (quem nunca falhou vai antes) e depois pela ordem de entrada. A Function manda um e-mail por pessoa (cerca de 2 por
   segundo), com o modelo `conteudo/vagas-textos/emails/cidade-abriu.html` (pessoa ou empresa) e dois links: criar a conta
   (`entrar.html#criar` ou `entrar.html?tipo=empresa#criar`) e sair da lista (`emprego.html?cidade=<slug>&sair=<token>#sair` para
   pessoa, `empresas.html?…` para empresa). Depois ela confirma no banco quem recebeu (`aviso_enviado_em`). Quem falhou no
   envio volta para o FIM da fila; na 3ª falha, a fila do e-mail desiste da pessoa (ela continua na lista, para o WhatsApp
   e até a retenção). E-mail que a Function recusa não volta para a fila. A resposta tem só números:
   `{ok, cidade:{slug, nome}, enviados, falhas, invalidos, restantes, aAvisarWhatsapp, terminou, travado, tetoAtingido}`.
   `travado:true` = o lote não avisou ninguém e só teve falhas (pare e tente mais tarde); `tetoAtingido:true` = acabou a cota
   de 24 h com gente na fila (continue no dia seguinte).
   **Teto (20261024120003, A2):** no máximo 60 e-mails de aviso em 24 horas, somando todas as cidades. O plano grátis do
   Resend manda 100 por dia; sobram 40 para confirmar conta, criar senha e convites. Muda no SQL Editor (só o dono):
   `insert into vagas_interno.ajustes (chave, valor) values ('aviso_teto_diario', '60') on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();`
   Uma falha de envio não devolve a cota.
   **Lote interrompido (A4):** se a Function cair entre reservar e confirmar, quem ficou reservado sem confirmação volta para
   a fila UMA vez, uma hora depois (no fim dela). Se cair de novo com a mesma pessoa, ela não volta mais (no máximo dois
   e-mails; nunca para quem teve o envio confirmado).
4. **Sair pelo e-mail (token):** cada e-mail leva um token próprio de 64 algarismos hexadecimais (no banco só fica o hash). A
   página de divulgação lê o `sair` do endereço e chama `VAGAS_API.listaEsperaSairLink(token)` (§8.1): a linha sai inteira
   (e-mail e WhatsApp), sem pedir o e-mail, com resposta sempre igual. A saída pela página com o e-mail (`listaEsperaSair`)
   continua.
5. **WhatsApp, sem envio automático:** a equipe abre a fila "Avisar pelo WhatsApp" (`admAvisoWhatsapp(cidade)`). Ela mostra um
   contato por vez, só de quem deixou o número e ainda não foi avisado por ele, com o texto fixo de
   `conteudo/vagas-textos/whatsapp.json` (`lista_espera_cidade_abriu`) e o link `https://wa.me/<número>?text=…` pronto. A pessoa
   da equipe abre o link no WhatsApp da Gestão sem Caos, envia e marca "feito" (`admAvisoWhatsappFeito(id)`). O mesmo "feito"
   serve para pular um número que não é de WhatsApp. Cada número mostrado (`aviso_whatsapp_ver`) e cada "feito"
   (`aviso_whatsapp`) ficam no registro de moderação, sem o número. Nada sai sozinho, e nenhuma lista de números aparece de uma vez.
6. **Situação:** `admAvisoResumo(cidade)` devolve status, `abertaEm`, `listaAte` (abertura + 30 dias), as contagens
   `{naLista, aAvisarEmail, avisadosEmail, emEnvio, semEmail, aAvisarWhatsapp}` e o teto
   `{porDia, usados24h, disponivel, diasPrevistos}` (`diasPrevistos` conta hoje só se ainda cabe algum; `null` com teto 0).
7. **Retenção:** a linha some quando a pessoa já foi avisada por tudo o que pediu. Quem deixou só o e-mail sai assim que o
   envio é confirmado. Quem deixou também o WhatsApp sai quando a equipe marca "feito". Em todo caso, a lista inteira da
   cidade some 30 dias depois da abertura, avisada ou não (§7.1).

### 6.8 Pré-abertura para empresas (20261024120004)

Na cidade em **lista de espera** a empresa já entra antes de a cidade abrir, para que no dia da abertura haja vagas no ar:

1. A empresa se cadastra (`cadastrarEmpresa`, ou a operação por ela: `opEmpresaCadastrar`); a operação confere o CNPJ
   (`opEmpresaDecidir`) como em cidade aberta. Pessoa continua sem cadastro em cidade fechada.
2. A empresa cria e publica vagas (`salvarAnuncio`, `publicarAnuncio`); as primeiras passam pela revisão da moderação
   (`opAnuncioDecidir`), como sempre.
3. A vaga aprovada fica **pronta e invisível**: nenhuma leitura pública a mostra (mural, feed, vaga pelo código, `/v/<código>`,
   vista, contagens do painel), porque todas exigem cidade ativa (`vagas_interno.no_ar`), e ninguém se candidata (o Quero também
   exige). A empresa vê a vaga com `aguardaAbertura:true` e o texto `avisoAbertura`: "Sua vaga entra no ar no dia em que
   {cidade} abrir." (e `expirado:false`, mesmo que a data de validade antiga tenha passado).
4. A validade não corre antes da abertura: a vaga publicada com a cidade fechada fica marcada (`vagas_anuncios.pre_abertura`).
   Quando a cidade passa a `ativa`, na mesma transação, cada vaga marcada (publicada ou pausada) ganha `publicado_em` = abertura e
   `expira_em` = abertura + a validade normal (`dias_no_ar`; diária: `prazo_horas`), e a marca sai. Abrir de novo (ou salvar
   `ativa` outra vez) não estende nada.
5. Para as telas: a cidade traz `preAbertura:true` (lista de espera) e `aceitaEmpresas:true` (ativa ou lista de espera) em
   `vagas_cidades_publicas`; `VAGAS_API.RECURSOS.preAberturaEmpresas` diz que o banco já aceita.

## 7. Tabelas (resumo; detalhes e restrições na migração)

| Tabela | Principais colunas |
|---|---|
| `vagas_cidades` | slug, nome, uf, ibge, fuso (padrão `America/Sao_Paulo`), status, porte `pequena|grande|null`, praca_id, meta_lista_espera, ordem, aberta_em (gatilho: quando passou a `ativa`; 20261024120002), canal_whatsapp (só `https://whatsapp.com/channel/<id>`; 20261024120004) |
| `vagas_zonas` | cidade_id, slug, nome, bairros[], ordem, ativa |
| `vagas_areas` | slug, nome, ordem, ativa (24 áreas; leitura pública) |
| `vagas_contas` | user_id (PK → auth.users), tipo `pessoa|empresa|operador`, status, termos_versao, termos_aceitos_em, assistida_por, assistida_cidade_id, codigo_evento, confirmada_em, ultimo_acesso_em |
| `vagas_consentimentos` | user_id, tipo, versao, aceito, ate, em (só inclusão) |
| `vagas_pessoas` | user_id, cidade_id, cidade2_id, zona_id, maior_18, cargos[1..5], escolaridade, turnos[], cnh[], modalidades[], pretensao_centavos, cursos[], areas_interesse[≤3], sobre ≤ 600, banco_ate, referencias_token (a foto não é coluna: é o arquivo no Storage) |
| `vagas_pessoa_contato` | user_id, nome, whatsapp, email (separada: só sai no Combinou) |
| `vagas_experiencias` | user_id, funcao, empregador, inicio, fim, informal, ordem |
| `vagas_empresas` | cnpj (14, alfanumérico), mei, razao_social, nome_fantasia, setor, descricao, whatsapp, email, cidade_id, zona_id, status, cnpj_conferido_em |
| `vagas_empresa_membros` | empresa_id, user_id, papel `dono|recrutador`, ativo |
| `vagas_anuncios` | codigo, empresa_id, cidade_id, zona_id, area, funcao, titulo (= funcao, gerada), modalidade, descricao (40–1500), turno, fim_de_semana, comissao, inicio + inicio_data, experiencia, escolaridade, requisitos[] + requisito_outro, selo, beneficios[], horas_dia (estágio), prazo_horas (diária), quantidade, valor_min/max_centavos, valor_unidade `mes|hora|dia|servico`, data_trabalho, hora_inicio/fim, dias_no_ar, confidencial, status, publicado_em, expira_em, pre_abertura (publicada com a cidade ainda fechada; 20261024120004) |
| `vagas_anuncio_vistas` | anuncio_id, dia, total (só o número) |
| `vagas_pulos` | pessoa_id, anuncio_id |
| `vagas_candidaturas` | anuncio_id, pessoa_id, empresa_id, status, criado_em, empresa_decidiu_em, empresa_revelada_em, combinou_em, contratada_em, pessoa_decidiu_em, contato_cortado_em |
| `vagas_conversas` / `vagas_mensagens` | uma conversa por candidatura; mensagens com autor `empresa|pessoa|sistema` (id gerado no aparelho) |
| `vagas_denuncias` / `vagas_moderacao` | denúncias (alvo anuncio/mensagem/referencia) e registro de moderação (só inclusão; papel `empresa` para as ações de equipe) |
| `vagas_operadores` | user_id, cidade_id, papel `operador|moderador`, ativo, repasse_percentual, contrato_versao |
| `vagas_lista_espera` | cidade_id, email, perfil, whatsapp (`''` ou celular `55DD9XXXXXXXX`), whatsapp_em (quando foi dado); aviso de abertura (20261024120002): avisado_em (reserva do e-mail), whatsapp_avisado_em, sair_token_hash (sha256 do token do link "sair" do e-mail); reforço (20261024120003): aviso_enviado_em (envio confirmado), aviso_tentativas (falhas; 3 = desiste do e-mail; 99 = e-mail recusado), aviso_devolvido (o lote interrompido já voltou uma vez); origem (lista fechada ou null; 20261024120004) |
| `vagas_equipe_convites` | empresa_id, email, papel `recrutador`, token_hash (sha256 do token; o token nunca fica no banco), status `aberto|aceito|cancelado`, criado_por, criado_em, expira_em (72 h), usado_por, usado_em, encerrado_em (sem acesso direto: só pelas RPCs) |
| `vagas_acessos_contato` | candidatura, pessoa, empresa (nome guardado), anúncio (título guardado), quem abriu, quando |
| `vagas_referencias` / `vagas_referencia_convites` / `vagas_referencia_historico` | referência profissional (§6.5) |
| `vagas_limites` | contador dos limites anti-abuso (limpa sozinho em 8 dias) |

Leitura direta (RLS) existe só para cidades/zonas e dados da própria conta; as telas devem usar as RPCs.

### 7.1 Retenção e exclusão (LGPD) — hipóteses, a confirmar com o(a) advogado(a)

Hoje o banco apaga sozinho só `vagas_limites` (8 dias) e expira o banco de talentos (`banco_ate`, 180 dias do aceite). Os prazos
abaixo são a PROPOSTA da fundação; quem decide é o dono com o(a) advogado(a), e a limpeza (job ou `pg_cron`) entra depois
da decisão. Até lá, tudo fica enquanto a conta existir.

| Dado | Proposta de prazo | Como sai |
|---|---|---|
| Candidaturas, conversas e mensagens | 12 meses depois do fim da vaga (encerrada/expirada) | job mensal; a pessoa apaga tudo excluindo a conta |
| Contas inativas (sem acesso) | aviso aos 18 meses, exclusão aos 24 meses | job mensal + e-mail pela `vagas-conta` |
| Denúncias (com `autor`, `origem`) | decididas: 12 meses; `origem` (chave do IP) apagada em 30 dias | job mensal |
| Registro de moderação (`vagas_moderacao`) | 5 anos (defesa em disputa) | só inclusão; limpeza anual |
| `vagas_acessos_contato` ("quem viu meu contato") | enquanto a candidatura existir | cascata da candidatura |
| Lista de espera (`vagas_lista_espera`) | até a pessoa ser avisada da abertura por tudo o que pediu (§6.7), ou 30 dias depois da abertura da cidade, o que vier primeiro; antes, a pedido (`vagas_lista_espera_sair`, ou o link com token do e-mail do aviso: `vagas_lista_espera_sair_link`) | `vagas_conta_aviso_marcar` e `vagas_adm_aviso_whatsapp_feito` apagam quem terminou; `vagas_interno.lista_espera_limpar()` roda a cada lote e a cada contato da fila, e é agendável (`pg_cron`, uma vez por dia); reserva de e-mail sem confirmação (a Function caiu) volta para a fila UMA vez depois de 1 hora (20261024120003) |
| WhatsApp da lista de espera (opcional) | o mesmo da linha; sai antes se a pessoa pedir (sair pelo e-mail ou pelo link apaga a linha toda; sair pelo WhatsApp apaga só o número). Consentimento implícito: o campo diz para que serve ("só para avisar quando abrir") e `whatsapp_em` guarda quando foi dado. Usado UMA vez: a mensagem do aviso, mandada à mão pela equipe | RPCs acima; a operação vê só contagens; a equipe vê um número por vez na fila do aviso (registrado) |
| Convites de equipe (`vagas_equipe_convites`) | aberto: 72 h; encerrado ou vencido: apagado depois de 30 dias | a própria `vagas_conta_convite_equipe` limpa a cada convite novo; cascata da empresa |
| Conta criada pelo convite de equipe e nunca confirmada (sem pedido da própria pessoa) | apagada 30 dias depois de o último convite para aquele e-mail vencer (33 dias da criação, no mínimo); só conta pendente, sem vínculo nenhum | `vagas_interno.contas_convite_limpar()`, a cada convite novo e agendável (`pg_cron`) |
| Referências profissionais | enquanto a conta da pessoa existir (ela remove quando quiser) | cascata / `vagas_referencia_responder('remover')` |
| Foto (Storage) | enquanto a conta existir | **só pela ação `excluir` da Function** (apaga o arquivo antes da conta) |
| Contadores (`vagas_limites`, `vagas_anuncio_vistas`) | 8 dias / só totais por dia | automático |

Exclusão da conta: `VAGAS_API.excluirConta()` (ação `excluir` da `vagas-conta`) apaga a foto e depois o usuário do Auth; a
cascata leva tudo das tabelas `vagas_*`, menos `vagas_denuncias.autor` (uuid sem chave estrangeira) e `assistida_por`/`ator`
da moderação (registro). **Nunca apagar pelo painel do Supabase** (a foto ficaria órfã no bucket). Exportação:
`vagas_exportar_meus_dados` (§8.2) traz tudo o que é da pessoa, inclusive pulos e denúncias que ela fez.

---

## 8. RPCs

Formato de cada item: **quem** · chamada no `VAGAS_API` (e o JSON que vai para `/rest/v1/rpc/<nome>`) · resposta de
exemplo · erros (texto exato). Os erros de conta da §2 não são repetidos.

### 8.1 Públicas (anon e logado)

#### `vagas_cidades_publicas()` — `VAGAS_API.cidades()`
```json
{"ok":true,"cidades":[{"id":"…","slug":"uruacu-go","nome":"Uruaçu","uf":"GO","status":"ativa","fuso":"America/Sao_Paulo",
  "praca":null,"zonas":[{"id":"…","slug":"centro","nome":"Centro","bairros":["Centro","Setor Central","…"]}],
  "interessados":null,"metaListaEspera":null,"preAbertura":false,"aceitaEmpresas":true,"canalWhatsapp":null},
 {"slug":"outra-cidade-go","status":"lista_espera","praca":null,"zonas":[…],"interessados":10,"metaListaEspera":null,
  "preAbertura":true,"aceitaEmpresas":true,"canalWhatsapp":"https://whatsapp.com/channel/0029Va…"}]}
```
`preAbertura`/`aceitaEmpresas` (20261024120004, §6.8): a empresa já se cadastra e anuncia na cidade em lista de espera.
`canalWhatsapp` (20261024120004): o canal de WhatsApp da cidade (só `https://whatsapp.com/channel/<id>`) ou `null`.
Sem erros. `interessados` é APROXIMADO: quem entrou até o dia anterior, arredondado para baixo em dezenas (0 nos primeiros
dias) — a tela mostra "mais de 10 pessoas" ou esconde quando 0; nunca "N pessoas" exato.

#### `vagas_areas_publicas()` — `VAGAS_API.areas()`
`{"ok":true,"areas":[{"slug":"atendimento","nome":"Atendimento e recepção"},…]}` — as 24 (mesma lista em `VAGAS_REGRAS.AREAS`):
`atendimento` Atendimento e recepção · `vendas-loja` Vendas em loja e balcão · `vendas-externas` Vendas externas e
representação · `caixa` Caixa e operação de loja · `administrativo` Administrativo e escritório · `financeiro` Financeiro e
contabilidade · `rh` Recursos humanos · `logistica` Estoque, logística e entregas · `motorista` Motorista e transporte ·
`producao` Produção e indústria · `construcao` Construção civil · `manutencao` Manutenção e reparos · `limpeza` Limpeza e
conservação · `cozinha` Cozinha e restaurante · `hotelaria` Hotelaria e eventos · `beleza` Beleza e estética · `saude` Saúde e
farmácia · `educacao` Educação e creche · `agro` Agropecuária e campo · `seguranca` Segurança e portaria · `marketing`
Marketing, design e redes sociais · `tecnologia` Tecnologia e informática · `domesticos` Serviços domésticos e cuidado de
pessoas · `outros` Outros comércios e serviços.

#### `vagas_anuncios_publicos(p_filtro)` — `VAGAS_API.anuncios({cidade, entorno?, zona?, modalidade?, areas?, turno?, salarioMin?, semExperiencia?, paraHoje?, busca?, somenteTotal?, depois?, limite?})`
Mural da cidade, do mais novo para o mais antigo (sem ranking), 20 por página. `zona`, `modalidade`, `areas` e `turno`
aceitam texto ou lista (OU dentro de cada filtro); `entorno` (padrão `true`) inclui as cidades da praça; `salarioMin` em
centavos POR MÊS (a vaga com faixa conta pelo teto; diária = valor do dia × 22; por hora × 220; "por serviço" fica de fora);
`semExperiencia: true` = só `experiencia: 'nao_precisa'`; `busca` procura na função e no nome da área; `depois` = o `proximo`
da página anterior; `somenteTotal: true` devolve só `{ok, cidade, total, areasAplicadas, areasPadrao}`. Com login de pessoa e
sem a chave `areas`, usa as áreas do currículo (`areasPadrao: true`); `areas: []` mostra todas. Qualquer outra chave é
ignorada (nada de nota, selo, referência, idade, sexo). "3 parecidas" (vaga fora do ar): `{cidade, areas: [<área>], limite: 3}`.
```json
{"ok":true,"cidade":{"slug":"uruacu-go","nome":"Uruaçu"},"proximo":"2026-10-12T14:00:00.000000Z_6f1c…",
 "areasAplicadas":["caixa"],"areasPadrao":true,
 "anuncios":[{"id":"…","codigo":"K7M2QX","titulo":"Operador(a) de caixa","funcao":"Operador(a) de caixa","modalidade":"clt",
   "area":{"slug":"caixa","nome":"Caixa e operação de loja"},"turno":"manha","fimDeSemana":false,"experiencia":"nao_precisa",
   "comissao":false,"selo":"caixa","valor":{"minCentavos":162100,"maxCentavos":180000,"unidade":"mes"},
   "cidade":{"slug":"uruacu-go","nome":"Uruaçu"},"zona":{"slug":"centro","nome":"Centro"},
   "empresa":{"nome":"Mercadinho Sol do Norte","iniciais":"MS","confidencial":false,"conferida":true},
   "diaria":null,"paraHoje":false,"quantidade":2,"publicadoEm":"…","expiraEm":"…"}]}
```
Vaga confidencial: `empresa = {"nome":"Empresa confidencial","iniciais":"","confidencial":true,"conferida":true}`.
Diária: `"diaria":{"data":"2026-10-14","inicio":"07:00","fim":"16:00"}`, `"paraHoje":true|false`.
Erros: `Cidade não encontrada.` (`naoEncontrada`) · `Ainda não chegamos a esta cidade. Entre na lista de espera.`
(`listaEspera`, `interessados` aproximado como em `vagas_cidades_publicas`) · `As vagas desta cidade estão pausadas no momento.` (`pausada`).

#### `vagas_anuncio_publico(p_codigo)` — `VAGAS_API.anuncio('K7M2QX')`
Resumo acima + `descricao`, `requisitos` (lista: `cnh_a|cnh_b|cnh_d|curso_registro|disponibilidade|outro`), `requisitoOutro`,
`requisitosLista` (frases prontas: "CNH categoria B", "Curso com registro na área", "Disponibilidade de horário", o texto do
"outro"), `beneficios` (`vt|refeicao|saude|moradia|comissao`), `escolaridade` (`nao_exigida|fundamental|medio|tecnico|superior`),
`inicio` (`imediato|data`) + `inicioData`, `horasDia` (estágio) e `empresa.setor/descricao` (vazios se confidencial). Com login de pessoa que já disse Quero: `minhaCandidatura:{id, status}`
(e o nome real da empresa se já revelada). Lido também pela Pages Function do link curto `/v/<codigo>`.
Erro (qualquer vaga fora do ar, inclusive rascunho, vencida, empresa suspensa, cidade pausada):
`Vaga não encontrada ou já encerrada.` (`naoEncontrada`).

#### `vagas_anuncio_vista(p_codigo)` — `VAGAS_API.anuncioVista('K7M2QX')`
A TELA chama quando uma pessoa abre a vaga (não chamar na prévia de link do WhatsApp). Conta 1 por origem (ou conta) por
anúncio por dia; membro da própria empresa não conta. `{"ok":true,"contada":true}` · erro `Vaga não encontrada ou já
encerrada.` (`naoEncontrada`).

#### `vagas_lista_espera_entrar(p_dados)` — `VAGAS_API.listaEspera({cidade, email, perfil:'pessoa'|'empresa', whatsapp?, origem?, site?, captcha?})`
`{"ok":true,"cidade":"uruacu-go","interessados":10}` (repetir o e-mail não duplica; `interessados` aproximado como em
`vagas_cidades_publicas` — a resposta não revela se o e-mail já estava na lista, nem se veio WhatsApp).
`whatsapp` (20261024) é OPCIONAL: celular com DDD (`(62) 98888-1111`, `62988881111` ou `5562988881111`; guardado como
`5562988881111`). Ninguém prova ser dono do e-mail, então o PRIMEIRO número gravado para aquele e-mail fica: um número
diferente depois não troca (a resposta é a mesma); quem quiser trocar sai da lista e entra de novo no dia seguinte. E-mail
que saiu da lista daquela cidade há menos de 24 h (pelo e-mail, pelo WhatsApp ou pelo link do aviso) entra SEM WhatsApp, com a
mesma resposta (2ª revisão de segurança, N2, 20261024120002): sair e entrar de novo com o e-mail de outra pessoa não troca o
número dela. A marca da saída guarda só um hash do e-mail com o sal secreto desta instalação (20261024120003, A5), na tabela
de limites. **E-mail aceito (20261024120003, A1):** só caracteres ASCII visíveis (`!` a `~`), o mesmo do `emailVagas` da Function
e do `VAGAS_REGRAS.normalizarEmail`; espaço sem quebra, BOM, U+2028, espaço ideográfico, letra acentuada etc. dão `E-mail inválido.` A tela explica no campo para que serve
("só para avisar quando abrir"). Validação igual na tela: `VAGAS_REGRAS.lerListaEspera(d)`.
**Origem (20261024120004, `RECURSOS.origemListaEspera`):** `origem` opcional, lista fechada: `radio`, `cartaz`, `grupo`, `canal`,
`escola`, `mutirao`, `indicacao`, `outro` (a tela mostra os rótulos). Qualquer outra coisa vira `null`, nunca erro; a primeira
origem gravada para o e-mail fica. Não se guarda URL, IP nem navegador. **Isca (honeypot):** o campo `site` fica escondido na
tela; preenchido, a resposta é igual à de sucesso e nada é gravado (nem o e-mail é conferido).
**Limites (20261024120004):** 30 por hora por origem (IP); 5 por hora por e-mail e 5 por hora por WhatsApp (chaves só com o
hash com sal), exista ou não na lista — a resposta não revela quem está; sem o Turnstile, 1000 por hora no total.
**Turnstile:** com `TURNSTILE_SITE_KEY` no site, a tela manda `captcha` e o `VAGAS_API.listaEspera` vai pela `vagas-conta`
(ação `lista_espera`, §9), que confere o captcha (com `TURNSTILE_SECRET`) e grava com o limite de 300 por hora por origem
(mutirão, escola, Wi-Fi da praça) e sem o teto total. Depois de o site mandar o captcha, ligue no SQL Editor
`insert into vagas_interno.ajustes (chave, valor) values ('lista_espera_captcha', 'sim') on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();`
e a RPC pública passa a recusar com `Confirme que você não é um robô e tente de novo.` (`captcha`).
Erros: `Cidade não encontrada.` · `Esta cidade já está aberta: faça o seu cadastro.` (`ativa`) · `E-mail inválido.` ·
`WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).` ·
`Muitas tentativas. Tente de novo mais tarde.` (`bloqueado`) · `Confirme que você não é um robô e tente de novo.` (`captcha`; só
com o ajuste ligado).

#### `vagas_lista_espera_sair(p_dados)` — `VAGAS_API.listaEsperaSair({cidade, email?, whatsapp?})`
Sair da lista (LGPD; link "não quero mais receber" do aviso). Limite próprio, separado do entrar (20261024120004): 10 por hora
por origem. Com `email`: apaga a linha (com o WhatsApp dela). Só com
`whatsapp`: tira esse número de todas as linhas da cidade (o e-mail continua na lista). `{"ok":true,"cidade":"uruacu-go","removido":true}`
sempre, exista ou não na lista. Erros: `Cidade não encontrada.` · `E-mail inválido.` (e-mail inválido, ou nem e-mail nem
WhatsApp) · `WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).` · `Muitas tentativas…` (`bloqueado`).

#### `vagas_lista_espera_sair_link(p_token)` — `VAGAS_API.listaEsperaSairLink(token)` (20261024120002)
O link "sair da lista de espera" do e-mail do aviso de abertura (§6.7): `…/emprego.html?cidade=<slug>&sair=<token>#sair` (ou
`empresas.html`). Apaga a linha daquele token (e-mail e WhatsApp), sem pedir o e-mail. Resposta SEMPRE
`{"ok":true,"removido":true}` (token certo, errado, já usado ou vazio; maiúsculas e minúsculas tanto faz). Sem erros.

#### `vagas_denunciar(p_dados)` — `VAGAS_API.denunciar({alvo, id, motivo, detalhe?})`
`{"ok":true,"recebida":true}` (repetida pela mesma conta: `+ "duplicado":true`).
Erros: `Escolha o motivo da denúncia.` · `Muitas denúncias em pouco tempo. Tente de novo amanhã.` (`bloqueado`; 20/dia por
conta, 5/dia por origem sem login) · `Vaga não encontrada ou já encerrada.` · `Entre na sua conta para denunciar uma
mensagem.` (`sessaoExpirada`) · `Mensagem não encontrada.` (só quem participa da conversa denuncia mensagem do outro lado) ·
`Entre na sua conta para denunciar uma referência.` (`sessaoExpirada`) · `Referência não encontrada.` (só a própria pessoa ou
quem vê a referência; a empresa autora nunca) · `Denúncia inválida.`

#### `vagas_referencias_publicas(p_token)` — `VAGAS_API.referenciasPublicas(token)`
```json
{"ok":true,"pessoa":{"nomeExibicao":"Ana S."},"referencias":[{"id":"…","empresa":{"nome":"Mercado Bom Dia","conferida":true,
  "cidade":"Uruaçu"},"funcao":"Atendente","vinculo":"clt","inicio":"2024-01","fim":"2025-06","atual":false,
  "pontosFortes":["pontualidade","caixa_certo"],"recomendaPara":["Atendente","Caixa"],"texto":"(só se aprovado)",
  "textoStatus":"aprovado","criadoEm":"…"}]}
```
Erro: `Página não encontrada.` (token inválido, página desligada ou conta suspensa).

#### `vagas_selo_publico(p_codigo)` — `VAGAS_API.seloPublico('K7M2-QX9A')`
Da migração dos testes (20261023; contrato em `docs/VAGAS-TESTES.md`). Sem nome da pessoa. A prévia simula.

#### `versao_banco()` — `VAGAS_API.versaoBanco()`
`{"ok":true,"versao":20261024120001,"migracoes":[…],"faltando":[…]}` (do DISC; a 20261022, as duas da 20261023 e as
duas da 20261024 entram na lista: `20261024120000_vagas_onda2` sonda a tabela `vagas_equipe_convites`, a função
`vagas_op_indicadores(text)` e a coluna `vagas_lista_espera.whatsapp`; `20261024120001_vagas_piloto_uruacu` sonda a cidade
`uruacu-go`).

### 8.2 Conta (qualquer tipo, logado)

#### `vagas_eu()` — `VAGAS_API.eu()`
```json
{"ok":true,"conta":{"tipo":"pessoa","status":"ativa","email":"ana@exemplo.com","nome":"Ana Souza","termosVersao":"2026-10-13","termosAceitosEm":"…","criadoEm":"…"},
 "admin":false,"pessoa":{"completo":true,"cidades":["uruacu-go"],"referenciasPendentes":1},"empresas":[],"operador":[]}
```
`conta.nome` (20261024): o nome da própria conta, para a saudação — o do currículo (pessoa) ou o do cadastro; `''` sem nome.
Empresa: `"empresas":[{"id","nomeFantasia","papel":"dono","status":"ativa"}]`. Operador: `"operador":[{"cidade","nome","papel"}]`.
Admin do DISC sem conta do Vagas: `{"conta":null,"admin":true,"operador":[todas as cidades com papel 'admin']}`.
Conta assistida com `termosVersao:''` → a tela pede o aceite (`vagas_aceitar_termos`).

#### `vagas_aceitar_termos(p_dados)` — `VAGAS_API.aceitarTermos({versao, bancoTalentos?})`
`{"ok":true,"termosVersao":"2026-10-13","termosAceitosEm":"…","bancoTalentosAte":"…|''"}`. `bancoTalentos:true` autoriza
o banco de talentos por 180 dias (texto em `conteudo/vagas-textos/consentimentos.json`, `pessoa_banco_talentos`).
Erro: `Versão dos termos inválida.`

#### `vagas_exportar_meus_dados()` — `VAGAS_API.exportarMeusDados()`
Tudo da conta (LGPD): conta, consentimentos, pessoa, testes/selos (`testes`, pela migração dos testes), aviso da foto,
candidaturas, `pulos` (`[{anuncio:{codigo, titulo}, em}]`), `denunciasFeitas` (`[{alvo, motivo, detalhe, status, em}]`),
mensagens enviadas, acessos ao contato, empresas, operador, referências recebidas (com histórico) e pedidos de referência.
`geradoEm` ISO.

Excluir a conta é pela Edge Function (`VAGAS_API.excluirConta()`, §9).

### 8.3 Pessoa

#### `vagas_pessoa_minha()` — `VAGAS_API.minhaPessoa()`
`{"ok":true,"pessoa":<ficha completa>|null,"cartao":<cartão cego>|null,"completo":true|false}` — `cartao` é a prévia de
como as empresas a veem.
Ficha: `{cidade:{slug,nome}, cidade2, zona, maior18, cargos, escolaridade, turnos, cnh, modalidades, pretensaoCentavos,
cursos, areas (até 3 slugs), sobre, temFoto, nome, whatsapp, email, experiencias:[{funcao, empregador, inicio, fim, informal}],
bancoTalentosAte, atualizadoEm}`.
Cartão cego:
```json
{"cidade":{"slug":"uruacu-go","nome":"Uruaçu"},"zona":{"slug":"regiao-oeste","nome":"Região Oeste"},"cargos":["Atendente","Caixa"],
 "experiencias":[{"funcao":"Atendente","meses":18,"atual":false,"informal":false}],"experienciaTotalMeses":33,
 "escolaridade":"medio","turnos":["manha","tarde"],"cnh":["B"],"modalidades":["clt","diaria"],"pretensaoCentavos":180000,
 "cursos":["Atendimento ao cliente (Senac)"],"selos":[],"temReferencia":false}
```

#### `vagas_pessoa_salvar(p_dados)` — `VAGAS_API.salvarPessoa({...})`
Salva tudo de uma vez (5 passos na tela). Campos: `cidade`, `cidade2?`, `zona`, `maior18:true`, `cargos[1..5]`,
`escolaridade` (`fundamental_incompleto|fundamental|medio_incompleto|medio|tecnico|superior_incompleto|superior|pos`),
`turnos[]` (`manha|tarde|noite|madrugada|fim_de_semana|escala`), `cnh[]` (`A..E`), `modalidades[]`, `pretensaoCentavos?`,
`cursos[≤10]`, `areas?` (0 a 3 slugs; a tela pede pelo menos 1; sem a chave, fica como estava; área fora da lista é
ignorada), `sobre ≤ 600`, `nome`, `whatsapp` (celular), `email?` (sem ele, usa o do login),
`experiencias[≤10]:{funcao, empregador?, inicio:'AAAA-MM', fim?:'AAAA-MM'|'' , informal?}`.
Resposta: igual a `vagas_pessoa_minha` (`completo:true`).
Erros: `Escolha a sua cidade.` · `Segunda cidade não encontrada.` · `Escolha duas cidades diferentes.` · `Escolha a zona onde
você mora.` · `Escolha uma zona da sua cidade.` · `Para se cadastrar é preciso ter 18 anos ou mais.` · `Escolha de 1 a 5
funções que você procura.` · `Escolha a sua escolaridade.` · `Marque pelo menos um turno em que pode trabalhar.` · `Escolha até 3 áreas de interesse.` ·
`Marque pelo menos um tipo de vaga (CLT, temporário, diária, freelancer ou estágio).` · `Pretensão salarial inválida.` ·
`Informe até 10 cursos.` · `O texto "Sobre você" pode ter até 600 caracteres.` · `Informe seu nome e sobrenome.` ·
`WhatsApp inválido. Use DDD + número de celular, só os números (11 dígitos).` (20261024; sem DDD de exemplo) · `E-mail de contato inválido.` ·
`Experiências inválidas.` · `Informe até 10 experiências.` · `Informe a função de cada experiência.` · `Informe o mês de
início de cada experiência (AAAA-MM).` · `O início de uma experiência não pode estar no futuro.` · `Mês de saída inválido
(AAAA-MM).` · `A saída não pode ser antes do início.` · `A saída não pode estar no futuro.` · `Ainda não chegamos a esta
cidade. Entre na lista de espera.` · `A segunda cidade ainda não está aberta. Escolha uma cidade ativa.` · filtro de textos
(ex.: `Tire o telefone, e-mail ou perfil de rede social ("…"): o contato acontece pela plataforma, depois do Combinou.`,
`Tire o link "…": o contato acontece pela plataforma.`) · `Dados inválidos. Confira os campos.`

#### `vagas_feed(p_filtro)` — `VAGAS_API.feed({mesmos filtros do mural, sem cidade})`
Igual ao mural, nas cidades da pessoa, sem as vagas que ela pulou ou já pediu; abre nas áreas do currículo. Erro: `Complete seu cadastro para ver as
vagas.` (`completar`).

#### `vagas_quero(p_anuncio)` — `VAGAS_API.quero(anuncioId)`
`{"ok":true,"candidatura":<candidatura>}` (de novo: `+ "duplicado":true`; depois de retirar, volta a `enviada`).
Candidatura (como a pessoa vê):
```json
{"id":"…","status":"enviada","criadoEm":"…","atualizadoEm":"…","empresaRevelada":false,"contatoCortadoEm":"",
 "anuncio":{<resumo do anúncio>,"noAr":true},"conversa":{"status":"aberta","naoLidas":1,"ultimaEm":"…"}|null,
 "combinou":{"em":"…","empresa":{"nome":"…","whatsapp":"5595…","email":"…"}}|null}
```
Erros: `Complete seu cadastro antes de se candidatar.` (`completar`) · `Vaga não encontrada ou já encerrada.` · `Esta vaga é
da sua empresa.` · `Você já se candidatou a muitas vagas hoje. Tente de novo amanhã.` (`bloqueado`; 30/dia).

#### `vagas_pular(p_anuncio)` — `VAGAS_API.pular(anuncioId)`
`{"ok":true}` · erros `Complete seu cadastro para ver as vagas.` · `Vaga não encontrada ou já encerrada.`

#### `vagas_minhas_candidaturas()` — `VAGAS_API.minhasCandidaturas()`
`{"ok":true,"candidaturas":[<candidatura>…]}` (mais recente primeiro).

#### `vagas_retirar(p_candidatura)` / `vagas_recusar(p_candidatura)` — `VAGAS_API.retirar(id)` / `recusar(id)`
`{"ok":true,"candidatura":…}` (`retirada` / `recusada`; a conversa recebe uma mensagem do sistema e fecha).
Erros: `Candidatura não encontrada.` · `O contato já foi liberado. Avise a empresa pela conversa.`

#### `vagas_ver_empresa(p_candidatura)` — `VAGAS_API.verEmpresa(id)`
```json
{"ok":true,"empresa":{"nome":"Mercado Bom Dia","razaoSocial":"…","cnpjFormatado":"11.222.333/0001-81","setor":"…","descricao":"…",
  "cidade":"Uruaçu","conferidaEm":"…"},"candidatura":…}
```
Erros: `Candidatura não encontrada.` · `A empresa ainda não pediu para conversar.`

#### `vagas_combinar(p_candidatura)` — `VAGAS_API.combinar(id)`
`{"ok":true,"candidatura":…,"empresa":{"nome","whatsapp","email"},"duplicado":false}`. Também desfaz o "cortar acesso"
(volta a liberar; `duplicado:false`). Já combinado e sem corte: `duplicado:true`.
Erros: `Candidatura não encontrada.` · `A empresa ainda não pediu para conversar.` · `Esta candidatura foi encerrada.` ·
`Esta vaga está fora do ar.` · `Veja primeiro qual é a empresa.` (`verEmpresa`; vaga confidencial).

#### `vagas_quem_viu_meu_contato()` — `VAGAS_API.quemViuMeuContato()`
```json
{"ok":true,"acessos":[{"candidaturaId":"…","empresa":"Mercado Bom Dia","anuncio":"Atendente de caixa","primeiraVez":"…",
  "ultimaVez":"…","vezes":2,"cortadoEm":"","podeCortar":true}]}
```

#### `vagas_cortar_acesso(p_candidatura)` — `VAGAS_API.cortarAcesso(id)`
A empresa deixa de abrir o contato e de escrever; a conversa fecha com a mensagem do sistema "A pessoa encerrou a conversa e
deixou de compartilhar o contato."; "quem viu" continua com o histórico. Desfazer: `vagas_combinar`.
`{"ok":true,"candidatura":{…,"contatoCortadoEm":"…"},"duplicado":false}`.
Erros: `Candidatura não encontrada.` · `Seu contato não foi liberado para esta empresa.`

### 8.4 Empresa

#### `vagas_empresa_cadastrar(p_dados)` — `VAGAS_API.cadastrarEmpresa({cnpj, razaoSocial, nomeFantasia?, mei?, setor?, descricao?, whatsapp?, email?, cidade, zona?})`
Nasce `em_analise`; quem cadastrou vira `dono`. CNPJ numérico ou alfanumérico (14), com dígitos verificadores; MEI é CNPJ.
Cidade `ativa` ou em `lista_espera` (pré-abertura, §6.8; 20261024120004).
`{"ok":true,"empresa":{"id","cnpj","cnpjFormatado","mei","razaoSocial","nomeFantasia","setor","descricao","whatsapp","email",
"status":"em_analise","statusMotivo":"","cnpjConferidoEm":"","cidade":{…},"zona":{…}|null,"criadoEm","papel":"dono"}}`.
Erros: `Esta conta já cadastrou o máximo de empresas. Fale com a Gestão sem Caos.` · `CNPJ inválido. Confira os números.` ·
`Este CNPJ já tem cadastro. Peça acesso a quem cadastrou ou fale com a Gestão sem Caos.` · `Informe a razão social.` ·
`Escolha a cidade da empresa.` · `Ainda não chegamos a esta cidade. Entre na lista de espera.` · `Escolha uma zona da
cidade da empresa.` · `A descrição pode ter até 800 caracteres.` · `WhatsApp da empresa inválido.` · `E-mail da empresa
inválido.` · filtro de textos · `Dados inválidos. Confira os campos.`

#### `vagas_empresa_salvar(p_empresa, p_dados)` — `VAGAS_API.salvarEmpresa(id, {nomeFantasia?, setor?, descricao?, whatsapp?, email?, zona?})`
Só o dono; CNPJ e razão social não mudam. `{"ok":true,"empresa":…}`.
Erros: `Empresa não encontrada.` · `Só quem é dono(a) da conta da empresa pode alterar estes dados.` · `Informe o nome da
empresa.` · `A descrição pode ter até 800 caracteres.` · `WhatsApp da empresa inválido.` · `E-mail da empresa inválido.` ·
`Escolha uma zona da cidade da empresa.` · `Dados inválidos. Confira os campos.`

#### `vagas_minhas_empresas()` — `VAGAS_API.minhasEmpresas()`
`{"ok":true,"empresas":[{<empresa>,"papel":"dono","anuncios":{"total":4,"noAr":2,"rascunhos":1,"emRevisao":1},"candidaturasNovas":3}]}`

#### `vagas_anuncio_salvar(p_dados)` — `VAGAS_API.salvarAnuncio({...})`
Cria (com `empresaId`) ou edita (com `id`) um rascunho/vaga. Campos (chaves do design; snake_case também aceito):

| Chave | Valores | Obrigatório |
|---|---|---|
| `area` | um dos 24 slugs | sim |
| `funcao` | texto 2–60 (é também o título da vaga) | sim |
| `modalidade` | `clt|temporario|diaria|freelancer|estagio` | sim |
| `quantidade` | 1–100 | padrão 1 |
| `salarioDe` / `salarioAte` | centavos (diária = valor do dia; estágio = bolsa; freelancer = serviço) | `salarioDe` sim |
| `valorUnidade` | `mes|hora` (CLT, temporário, estágio), `dia` (diária), `servico|hora|dia` (freelancer) | padrão pela modalidade |
| `comissao` | boolean (anda junto com o benefício `comissao`) | não |
| `turno` | `manha|tarde|noite|comercial|escala|a_combinar` | sim |
| `fimDeSemana` | boolean | não |
| `inicio` / `inicioData` | `imediato|data` + `AAAA-MM-DD` (hoje em diante) | padrão `imediato` |
| `cidade` / `zona` | slugs (cidade padrão: a da empresa) | não |
| `experiencia` | `nao_precisa|ate_1|1_a_3|mais_3` | sim |
| `escolaridade` | `nao_exigida|fundamental|medio|tecnico|superior` | padrão `nao_exigida` |
| `requisitos` / `requisitoOutro` | lista `cnh_a|cnh_b|cnh_d|curso_registro|disponibilidade|outro` + texto ≤ 80 (filtrado) | não |
| `selo` | `atendimento|vendas|administrativo|caixa|portugues` ou `nenhum`/null (informativo; NUNCA filtro nem corte) | não |
| `beneficios` | lista `vt|refeicao|saude|moradia|comissao` | não |
| `confidencial` | boolean (só empresa com CNPJ conferido) | não |
| `descricao` | texto 40–1500 (o único texto livre, filtrado) | sim |
| `diasNoAr` | 7–60 (não vale para diária) | padrão 30 |
| diária: `data`, `horaInicio`, `horaFim`, `prazoHoras` | `AAAA-MM-DD` (hoje até +7), `HH:MM`, 48–168 h | sim (prazo padrão 48) |
| estágio: `horasDia` | 1–6 | sim |

Resposta `{"ok":true,"anuncio":<anúncio da empresa>}` = detalhe + `empresaId, confidencial, diasNoAr, prazoHoras, status,
statusMotivo, noAr, expirado, encerradoEm, criadoEm, atualizadoEm, candidaturas:{total, novas, conversar, combinou, contratada}`.
Erros: `Vaga não encontrada.` · `Esta vaga foi removida pela moderação e não pode ser editada.` · `Esta vaga está fora do
ar, aguardando a moderação.` · `Empresa não encontrada.` · `Muitas vagas criadas hoje. Tente de novo amanhã.` (`bloqueado`) ·
`Esta empresa está suspensa. Fale com a Gestão sem Caos.` · `Escolha a área da vaga.` · `Informe a função (ex.: Atendente).` ·
`Escolha o tipo de vaga: CLT, temporário, diária, freelancer ou estágio.` · `Quantidade de vagas inválida (1 a 100).` ·
`Escolha o turno da vaga.` · `Escolha a experiência que a vaga pede.` · `Escolaridade mínima inválida.` · `O requisito
"Outro" pode ter até 80 caracteres.` · `Escreva qual é o outro requisito.` · `Escolha um dos testes da plataforma ou
"nenhum".` · `Informe o salário ou a faixa salarial.` · `Informe o valor da bolsa.` · `Informe a data, o horário e o valor
da diária.` · `Informe o valor do serviço.` · `Valor alto demais. Confira o salário.` · `O valor máximo da faixa não pode
ser menor que o mínimo.` · `Unidade do valor inválida para este tipo de vaga.` · `A descrição pode ter até 1.500
caracteres.` · `Descreva a vaga em pelo menos 40 caracteres.` · `Cidade não encontrada.` · `Escolha uma zona da cidade da
vaga.` · `Informe as horas por dia do estágio (até 6).` · `A diária fica no ar de 48 a 168 horas.` · `Escolha de 7 a 60
dias no ar.` · `Escolha quando a pessoa começa.` · `Informe a data de início (AAAA-MM-DD).` · `A data de início não pode
estar no passado.` · `A data da diária já passou. Escolha outra data.` · `A diária precisa ser para os próximos 7 dias.` ·
`Só empresa com CNPJ conferido pela Gestão sem Caos pode anunciar como confidencial.` · `Ainda não chegamos a esta cidade.
Entre na lista de espera.` · filtro de textos (ex.: `Tire o trecho "boa aparencia": o texto não pode pedir aparência,
idade, sexo, estado civil, filhos, religião, cor, nacionalidade, deficiência, saúde ou antecedentes (Lei 9.029/1995 e CLT,
art. 373-A).`; mensagens completas em `VAGAS_REGRAS.mensagemTexto`) · `Dados inválidos. Confira os campos.`

#### `vagas_anuncio_publicar(p_anuncio)` — `VAGAS_API.publicarAnuncio(id)`
`{"ok":true,"anuncio":…,"emRevisao":true|false}` (já publicada/em revisão: `duplicado:true`). Cidade em lista de espera
(20261024120004, §6.8): publica do mesmo jeito; a vaga fica com `aguardaAbertura:true`, `avisoAbertura:"Sua vaga entra no ar
no dia em que {cidade} abrir."` e não está no ar até a abertura. Todo anúncio visto pela empresa traz esses dois campos.
Erros: `Vaga não encontrada.` · `Esta vaga está fora do ar pela moderação.` · `Esta vaga já foi publicada. Use "Retomar" ou
"Renovar".` · `Esta empresa está suspensa. Fale com a Gestão sem Caos.` · `Ainda não chegamos a esta cidade. Entre na lista
de espera.` · `A data da diária já passou. Escolha outra data.`

#### `vagas_anuncio_acao(p_anuncio, p_acao)` — `VAGAS_API.acaoAnuncio(id, 'pausar'|'retomar'|'encerrar'|'renovar')`
`{"ok":true,"anuncio":…}`. Renovar recalcula `expiraEm` (não muda `publicadoEm`).
Erros: `Vaga não encontrada.` · `Esta vaga está fora do ar pela moderação.` · `Só dá para pausar uma vaga que está no ar.` ·
`Só dá para retomar uma vaga pausada.` · `O prazo desta vaga acabou. Use "Renovar".` · `Esta empresa está suspensa. Fale
com a Gestão sem Caos.` · `Para outra data, crie uma diária nova.` · `Só dá para renovar uma vaga que já foi publicada.` ·
`Ação inválida.`

#### `vagas_anuncios_empresa(p_empresa)` — `VAGAS_API.anunciosDaEmpresa(empresaId)`
`{"ok":true,"anuncios":[<anúncio da empresa>…]}` · erro `Empresa não encontrada.`

#### `vagas_anuncio_numeros(p_anuncio)` — `VAGAS_API.anuncioNumeros(id)`
Só totais, nunca quem.
```json
{"ok":true,"anuncio":{"id":"…","codigo":"K7M2QX","titulo":"…","status":"publicado","publicadoEm":"…"},
 "numeros":{"vistas":57,"quero":12,"comSelo":5,"conversas":4,"combinou":2,"contratadas":1}}
```
`quero` não conta as retiradas; `combinou` inclui as contratadas; `comSelo` = quem disse Quero e tem selo válido.
Erro: `Vaga não encontrada.`

#### `vagas_cartoes(p_anuncio, p_filtro)` — `VAGAS_API.cartoes(anuncioId, {status?, zona?, escolaridadeMin?, experienciaMinMeses?, turnos?, cnh?, pretensaoMaxCentavos?})`
Cartões cegos por ORDEM DE CHEGADA (sem ranking). Filtros só da lista fechada; qualquer outra chave é ignorada (inclusive
"tem referência" e `temSelo` — veto P3: o selo é só informação no cartão). `status` = o filtro "Mostrar" da tela
(`enviada|conversar|agora_nao|combinou|contratada|recusada`).
```json
{"ok":true,"anuncio":{"id","codigo","titulo","status"},"total":1,
 "cartoes":[{"candidaturaId":"…","status":"enviada","chegouEm":"…","contatoCortado":false,"cartao":<cartão cego>,
   "conversa":{"status":"aberta","naoLidas":0,"ultimaEm":"…"}|null}]}
```
Erro: `Vaga não encontrada.`

#### `vagas_empresa_decidir(p_candidatura, p_decisao)` — `VAGAS_API.decidir(id, 'conversar'|'agora_nao')`
`{"ok":true,"candidaturaId":"…","status":"conversar"}` ("agora_nao" fecha a conversa com "A empresa seguiu com outras pessoas
nesta vaga."; dá para voltar a "conversar" antes do Combinou).
Erros: `Candidatura não encontrada.` · `Decisão inválida.` · `O Combinou já aconteceu: a decisão não muda mais.` · `A pessoa
encerrou esta candidatura.`

#### `vagas_contato_pessoa(p_candidatura)` — `VAGAS_API.contatoPessoa(id)`
Só depois do Combinou; cada chamada fica registrada para a pessoa ("quem viu").
```json
{"ok":true,"pessoa":{"nome":"Maria Fernanda Souza","whatsapp":"5595991234567","email":"…","sobre":"…","temFoto":true,
  "fotoUrl":"https://…supabase.co/storage/v1/object/sign/vagas-fotos/…?token=… (acrescentada pelo VAGAS_API; '' sem foto)","cartao":<cartão>,
  "referencias":[<referência completa, texto só aprovado>],
  "experiencias":[{"funcao":"Atendente","empregador":"Loja Antiga Ltda","inicio":"2024-01","fim":"2025-06","informal":false}]}}
```
Erros: `Candidatura não encontrada.` · `O contato só aparece depois do Combinou.` (`semCombinou`) · `A pessoa deixou de
compartilhar o contato com a sua empresa.` (`contatoCortado`) · `Esta empresa está suspensa. Fale com a Gestão sem Caos.`
(`suspensa`; empresa suspensa pela moderação) · `Muitas consultas de contato hoje. Tente de novo amanhã.`
(`bloqueado`; 300/dia por empresa).

#### `vagas_marcar_contratada(p_candidatura)` — `VAGAS_API.marcarContratada(id)`
`{"ok":true,"candidaturaId":"…","status":"contratada"}` · erros `Candidatura não encontrada.` · `Só dá para marcar como
contratada depois do Combinou.`

### 8.4a Equipe da empresa (20261024; só conta de empresa)

Quem é **dono(a)** convida por e-mail (papel `recrutador`), vê a equipe, cancela convite e remove membro; nunca a última
pessoa dona. Recrutador(a) vê e usa a empresa (vagas, cartões, conversas), mas não vê nem muda a equipe; pode sair sozinho(a).
Só **empresa verificada** (`ativa`, CNPJ conferido pela operação) convida: o convite sai por e-mail com o domínio da
plataforma, e empresa em análise não manda e-mail a ninguém (revisão de segurança, B1). O nome de quem convida só entra no
e-mail se passar no mesmo filtro de contato e link dos outros textos; se não passar, o e-mail cita só a empresa.
O convite (`convidarEquipe`, ação `convite_equipe` da `vagas-conta`, §9) é um token de 64 algarismos hexadecimais, de uso
único, que vale 72 h, só para a conta com AQUELE e-mail, confirmada, e só vira membro depois do aceite. No banco fica só o
sha256 do token. Limites: 10 convites por empresa por dia, 3 por dia para o mesmo e-mail, 30 por hora por origem; até 20
pessoas na equipe e 20 convites abertos. Tudo vai para `vagas_moderacao` (papel `empresa`, ações `equipe_convidar`,
`equipe_convite_cancelar`, `equipe_aceitar`, `equipe_remover`, `equipe_sair`; sem e-mail no registro).
Erros comuns: os de conta (§2; conta de pessoa → `Esta área é para empresas.`) · `Empresa não encontrada.` (não é membro) ·
`Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.`

#### `vagas_equipe_empresa(p_empresa)` — `VAGAS_API.equipeDaEmpresa(empresaId)`
Só dono(a). Membros ativos (donos primeiro) e convites (abertos + os encerrados nos últimos 30 dias, até 50):
```json
{"ok":true,"empresa":{"id":"…","nomeFantasia":"Mercadinho Sol do Norte","status":"ativa"},
 "membros":[{"userId":"…","email":"dona@exemplo.com","nome":"Maria Souza","papel":"dono","desde":"…","eu":true,"podeRemover":false},
            {"userId":"…","email":"rita@exemplo.com","nome":"Rita Moraes","papel":"recrutador","desde":"…","eu":false,"podeRemover":true}],
 "convites":[{"id":"…","email":"nova@exemplo.com","papel":"recrutador","status":"pendente","criadoEm":"…","expiraEm":"…"}],
 "limites":{"convitesPorDia":10,"convitesHoje":1,"membrosMax":20,"convitesAbertosMax":20,"validadeHoras":72,"podeConvidar":true}}
```
`podeRemover:false` só para a única pessoa dona. O token nunca volta.

#### `vagas_equipe_convite_cancelar(p_convite)` — `VAGAS_API.cancelarConvite(conviteId)`
Só dono(a). `{"ok":true,"convite":{…,"status":"cancelado"}}` (de novo: `+ "duplicado":true`).
Erros: `Convite não encontrado.` · `Este convite já foi aceito. Para tirar o acesso, remova a pessoa da equipe.`

#### `vagas_equipe_remover(p_empresa, p_membro)` — `VAGAS_API.removerMembro(empresaId, userId)`
Dono(a) remove qualquer membro; qualquer membro pode sair (`p_membro` = o próprio id). Os convites abertos de quem sai são
cancelados. `{"ok":true,"removido":true,"saiu":false}` (`saiu:true` quando foi a própria pessoa).
Erros: `Esta pessoa não está na equipe.` · `A empresa precisa ter pelo menos uma pessoa como dona. Esta pessoa não pode sair da equipe.`

#### `vagas_equipe_tornar_dono(p_empresa, p_membro)` — `VAGAS_API.tornarDono(empresaId, userId)`
Só dono(a): torna outra pessoa da equipe dona também (as duas ficam donas; depois uma pode sair ou excluir a conta).
`{"ok":true,"membro":{"userId":"…","papel":"dono"},"duplicado":false}` (já era: `duplicado:true`). Registro `equipe_tornar_dono`.
Erros: `Só quem é dono(a) da conta da empresa pode ver e mudar a equipe.` · `Esta pessoa não está na equipe.` · `Esta empresa
está suspensa. Fale com a Gestão sem Caos.` (`suspensa`).
**A empresa nunca fica sem dona** (revisão de segurança, I2): a última pessoa dona de uma empresa que tem equipe não exclui a
conta (§9, `excluir`) nem sai da equipe; e, se a conta dela sumir por fora da Function (painel do Supabase), um gatilho faz a
pessoa mais antiga da equipe virar dona, com registro `dono_automatico` (papel `sistema`). Desde a 20261024120002 (2ª
revisão, N1), "tem dona" e "quem vira dona" contam só **conta válida** (não suspensa, e-mail confirmado): a mais antiga
VÁLIDA vira dona; sem ninguém válido, ninguém vira dona sozinho e a operação/equipe nomeia (`vagas_op_empresa_dono`).

#### `vagas_equipe_convite(p_token)` — `VAGAS_API.conviteEquipe(token)`
A tela de aceite (logada com o e-mail convidado) mostra de quem é o convite ANTES do aceite:
`{"ok":true,"convite":{"empresa":{"id":"…","nomeFantasia":"Mercadinho Sol do Norte","cidade":{"slug":"uruacu-go","nome":"Uruaçu"}},"papel":"recrutador","expiraEm":"…","jaMembro":false}}`.
Erro (token errado, usado, cancelado, vencido, de outro e-mail, ou quem convidou deixou de ser dono(a)) — sempre o mesmo:
`Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.`

#### `vagas_equipe_convite_aceitar(p_token)` — `VAGAS_API.aceitarConviteEquipe(token)`
Só depois do clique em "Aceitar" (conta de empresa, e-mail confirmado). `{"ok":true,"empresa":{"id":"…","nomeFantasia":"…","papel":"recrutador","status":"ativa"},"duplicado":false}`
(já era membro: `duplicado:true`, papel mantido). O token não vale de novo.
Erros: `Convite inválido ou vencido. Peça um convite novo a quem é dono(a) da empresa.` · `Esta empresa está suspensa. Fale com a
Gestão sem Caos.` (`suspensa`) · `A equipe desta empresa está completa. Fale com quem convidou.`

### 8.5 Conversa (pessoa e empresa)

#### `vagas_conversa(p_candidatura)` — `VAGAS_API.conversa(id)`
Marca como lidas para quem abriu.
```json
{"ok":true,"candidaturaId":"…","status":"conversar","lado":"pessoa","anuncio":{"titulo":"…","codigo":"…"},
 "conversa":{"id":"…","status":"aberta"},"podeEscrever":true,"outroLado":"Empresa confidencial","contatoCortado":false,
 "mensagens":[{"id":"…","autor":"empresa","texto":"Olá! …","em":"…","minha":false},{"autor":"sistema","texto":"Combinou! O contato foi liberado para os dois lados.",…}]}
```
Para a empresa, `outroLado` é sempre `Pessoa candidata`; `podeEscrever` é `false` quando a vaga está fora do ar, o acesso foi
cortado ou a EMPRESA está suspensa. Erro: `Conversa não encontrada.`

#### `vagas_mensagem_enviar(p_candidatura, p_texto, p_id)` — `VAGAS_API.enviarMensagem(id, texto, idGeradoNoAparelho)`
`p_id` (uuid gerado no aparelho) torna o reenvio seguro (`duplicado:true`). A empresa abre a conversa (vale como "Quero
conversar"); a pessoa só responde.
`{"ok":true,"mensagem":{"id","autor":"pessoa","texto","em","minha":true}}`.
Erros: `Conversa não encontrada.` · `Identificador da mensagem inválido.` · `Escreva a mensagem.` · `A mensagem pode ter até
1.000 caracteres.` · `A pessoa encerrou esta candidatura.` · `A pessoa encerrou a conversa e deixou de compartilhar o
contato com a sua empresa.` (`contatoCortado`) · `Você marcou "Agora não" para esta pessoa. Mude para "Quero conversar" para
escrever.` · `Esta vaga está fora do ar.` · `Espere a pessoa responder antes de mandar outra mensagem.` (`aguardar`) ·
`Muitas mensagens hoje. Tente de novo amanhã.` (`bloqueado`; empresa 300/dia, pessoa 100/dia) · `A empresa ainda não abriu
uma conversa.` · `Esta conversa foi encerrada.` · filtro (`bloqueada:true`, `tipo`):
`Mensagem bloqueada: ninguém paga para concorrer a uma vaga. Pedido de taxa, Pix ou depósito é golpe; se alguém pedir,
denuncie.` · `Mensagem bloqueada: telefone, e-mail e redes sociais só depois do Combinou, que libera o contato com
segurança.` · `Mensagem bloqueada: não dá para mandar links por aqui.` · `Mensagem bloqueada: não peça nem mande documento,
senha, código ou dados de banco por aqui. Se alguém pedir, denuncie.` · `Mensagem bloqueada: aqui não se pergunta nem se
conta idade, aparência, estado civil, filhos, religião, cor, nacionalidade, saúde ou antecedentes (Lei 9.029/1995).`

#### `vagas_conversas_minhas()` / `vagas_conversas_empresa(p_empresa)` — `VAGAS_API.minhasConversas()` / `conversasDaEmpresa(empresaId)`
`{"ok":true,"conversas":[{"candidaturaId","status","conversaStatus","anuncio":{…},"empresa":"…" (só pessoa),"naoLidas","ultimaEm","ultima":"(120 caracteres)"}]}`.
A lista da empresa não traz nenhum dado da pessoa. Erro (empresa): `Empresa não encontrada.`

### 8.6 Referência profissional

#### `vagas_referencia_oferecer(p_dados)` — `VAGAS_API.oferecerReferencia({...})`
Membro de empresa ATIVA. Para quem: `conviteToken` (pedido da pessoa) | `candidaturaId` (depois do Combinou, sem corte de
acesso) | `email` (resposta neutra). Conteúdo: `empresaId, funcao, vinculo, inicio, fim?, pontosFortes[1..3],
recomendaPara[≤5], texto? (≤300), declaracao:true`.
`{"ok":true,"referencia":{<referência completa>,"status":"pendente","textoStatus":"pendente"}}` · por e-mail sempre
`{"ok":true,"enviada":true}`. Enquanto a pessoa não responde, oferecer de novo corrige a mesma referência.
Erros: `Empresa não encontrada.` · `Só empresa verificada pela Gestão sem Caos pode dar referência.` · `Convite inválido ou
vencido. Peça um link novo à pessoa.` · `Candidatura não encontrada.` · `E-mail inválido.` · `Muitos envios por e-mail hoje.
Tente de novo amanhã.` (`bloqueado`) · `Informe para quem é a referência.` · `Informe a função que a pessoa exercia.` ·
`Escolha o tipo de vínculo.` · `Informe o mês de início (AAAA-MM).` · `O início não pode estar no futuro.` · `Mês de saída
inválido (AAAA-MM).` · `A saída não pode ser antes do início.` · `A saída não pode estar no futuro.` · `Escolha de 1 a 3
pontos fortes.` · `Escolha até 5 funções em "Recomendaria para".` · `O texto pode ter até 300 caracteres.` · `Confirme a
declaração de que a pessoa trabalhou na empresa no período informado.` · filtro (ex.: `Tire o trecho "…": a referência não
pode falar de aparência, idade, sexo, estado civil, filhos, religião, cor, nacionalidade, deficiência, saúde ou antecedentes
(Lei 9.029/1995).`) · `Sua empresa já deu referência para esta pessoa. Para mudar, ela precisa pedir de novo pelo link de
pedido de referência.` · `Sua empresa chegou ao limite de 20 referências em 30 dias.` (`bloqueado`) · `Dados inválidos.
Confira os campos.`

#### `vagas_referencia_pedir(p_dados)` — `VAGAS_API.pedirReferencia({cnpj?} | {empresaNome})`
`{"ok":true,"convite":{"id","token","caminho":"/referencia.html?t=<64 hex>","expiraEm","empresaNome","empresaNaPlataforma":true}}`
(30 dias; com CNPJ de empresa ativa, só ela abre).
Erros: `CNPJ inválido. Confira os números.` · `Informe o nome da empresa.` · `Muitos pedidos hoje. Tente de novo amanhã.`
(`bloqueado`) · `Você já tem 20 pedidos de referência abertos. Cancele algum antes de pedir outro.`

#### `vagas_referencia_convite(p_token)` — `VAGAS_API.conviteReferencia(token)`
Empresa logada abre o pedido: `{"ok":true,"convite":{"pessoa":{"nome":"Maria Fernanda Souza"},"empresaNome","empresaId","expiraEm","status":"aberto"}}`.
Erro: `Convite inválido ou vencido. Peça um link novo à pessoa.`

#### `vagas_referencia_responder(p_referencia, p_acao)` — `VAGAS_API.responderReferencia(id, 'aceitar'|'recusar'|'ocultar'|'mostrar'|'remover')`
Pessoa. `{"ok":true,"referencia":{…,"status":"aceita"}}`. Ocultar/remover NÃO avisam a empresa (veto P2).
Erros: `Referência não encontrada.` · `Ação inválida para esta referência.`

#### `vagas_referencias_minhas()` — `VAGAS_API.minhasReferencias()`
`{"ok":true,"referencias":[{<completa>,"status","textoMotivo","visivel"}],"convites":[{"id","empresaNome","status","caminho","expiraEm","criadoEm"}],"caminhoPublico":"/referencias.html?t=…"|""}`
(removidas não aparecem; pendentes primeiro).

#### `vagas_referencias_empresa(p_empresa)` — `VAGAS_API.referenciasDaEmpresa(empresaId)`
"Referências dadas". `status` pela visão da empresa (`VAGAS_REGRAS.STATUS_REFERENCIA_EMPRESA`), `aceitaEm` (não muda ao
ocultar), sem dados da pessoa. As enviadas por e-mail só aparecem depois do aceite, e `restantes30Dias` conta só o que a
empresa vê (as pendentes por e-mail não entram: o contador não revela se um e-mail tem conta).
`{"ok":true,"referencias":[{<completa com texto>,"status":"aceita","textoMotivo":"","origem":"candidatura","aceitaEm":"…"}],"restantes30Dias":19}`
Erro: `Empresa não encontrada.`

#### `vagas_referencias_publicar(p_ligar)` — `VAGAS_API.publicarReferencias(true|false)`
`{"ok":true,"caminho":"/referencias.html?t=…"}` (desligar: `""`; ligar de novo gera o mesmo link até desligar).
Erro: `Complete seu cadastro antes de publicar suas referências.` (`completar`).

### 8.7 Operação (operador/moderador da cidade; equipe em todas)

Filtro comum `{cidade?}` (slug, dentro das cidades que a pessoa opera). Erros comuns: `Sessão expirada. Entre de novo.`
(`sessaoExpirada`) · `Sem permissão.`

| RPC (VAGAS_API) | Entrada | Resposta |
|---|---|---|
| `vagas_op_resumo()` (`opResumo`) | — | `{cidades:[{id, slug, nome, status, papel, repassePercentual, contagens:{empresasEmAnalise, empresasAtivas, anunciosEmRevisao, anunciosSuspensos, anunciosNoAr, denunciasAbertas, pessoas, listaEspera}}]}` — `repassePercentual` (20261024): o da linha de quem chama em `vagas_operadores` (> 0: praça com parceiro; 0: operação própria); `null` para a equipe |
| `vagas_op_assistidos(p_filtro)` (`opAssistidos`; 20261024) | `{cidade?}` | `{contas:[{email:'r***@e***.com', tipo:'pessoa'|'empresa', cidade, codigoEvento, criadoEm}]}` — cadastros assistidos ainda pendentes (e-mail não confirmado) dos últimos 30 dias, até 200, mais novos primeiro. Operador(a) vê só os que criou; equipe, todos. E-mail MASCARADO (a operação nunca lê contato de pessoa): para mandar o link de novo, a tela pede o e-mail completo (`cadastroAssistido` / `reenviarConfirmacao`). Sem `expiraEm` (a validade do link é do Auth, não do banco). Erros `Sem permissão.` (moderador(a), ou cidade fora das operadas) |
| `vagas_op_empresas(p_filtro)` (`opEmpresas`) | `{cidade?, status?[], busca?}` | `{empresas:[<empresa> + anuncios:{total,noAr}, denunciasAbertas, membros]}` (em análise primeiro) |
| `vagas_op_empresa_decidir(p_empresa, p_acao, p_motivo)` (`opEmpresaDecidir`) | `'aprovar'|'recusar'|'suspender'|'reativar'` (`recusar`: continua `em_analise` com `statusMotivo` = chave de `moderacao.json`, para a empresa corrigir) | `{empresa}` · erros `Empresa não encontrada.` · `Sem permissão.` (moderador não aprova/recusa/reativa) · `Empresa suspensa: use "Reativar".` · `Informe o motivo.` · `Só dá para recusar uma empresa em análise.` · `Esta empresa não está suspensa.` · `Ação inválida.` |
| `vagas_op_empresa_cadastrar(p_dados)` (`opEmpresaCadastrar`) | como `vagas_empresa_cadastrar` | `{empresa}` já `ativa` (CNPJ conferido na hora) |
| `vagas_op_vincular_membro(p_empresa, p_email)` (`opVincularMembro`) | e-mail de conta `empresa`; SÓ empresa sem membro ativo (cadastro assistido) | `{membro:{papel:'dono'}}` · erros `Não há conta de empresa com este e-mail. Peça para a empresa criar a conta (ou faça o cadastro assistido).` · `Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.` |
| `vagas_op_anuncios(p_filtro)` (`opAnuncios`) | `{cidade?, status?[]}` (padrão `em_revisao`+`suspenso`) | `{anuncios:[<anúncio da empresa> + empresa:{id, nomeFantasia, status, cnpjFormatado, conferida}, denunciasAbertas]}` |
| `vagas_op_anuncio_salvar(p_dados)` (`opAnuncioSalvar`) | vaga assistida: os MESMOS campos de `vagas_anuncio_salvar` + `empresaId` (ou `id`) + `publicar?: true` (a operação já é a revisão) | `{anuncio}` · registro `anuncio_assistido` · erros de `vagas_anuncio_salvar` + `Sem permissão.` (moderador) · `Aprove a empresa antes de publicar a vaga.` |
| `vagas_op_anuncio_decidir(p_anuncio, p_acao, p_motivo)` (`opAnuncioDecidir`) | `'publicar'|'devolver'|'remover'` (motivo = chave de `conteudo/vagas-textos/moderacao.json`; `devolver`: de `em_revisao`/`suspenso` volta a `rascunho` com `statusMotivo`, a empresa corrige e publica de novo) | `{anuncio}` · erros `Vaga não encontrada.` · `Esta vaga não está esperando a moderação.` · `Aprove a empresa antes de publicar a vaga.` · `A data da diária já passou.` · `Informe o motivo.` · `Ação inválida.` (publicar uma suspensa fecha as denúncias abertas como improcedentes) |
| `vagas_op_denuncias(p_filtro)` (`opDenuncias`) | `{cidade?, status?[]}` (padrão `aberta`) | `{denuncias:[{id, alvo, motivo, detalhe, status, contaNoLimite, criadoEm, decisaoMotivo, decididaEm, anuncio:{…empresa}|null, mensagem:{texto, autor}|null, referencia:{id, funcao, texto, textoStatus, status (visão da empresa), empresa}|null}]}` (nunca quem denunciou) |
| `vagas_op_denuncia_decidir(p_denuncia, p_dados)` (`opDenunciaDecidir`) | `{decisao:'procedente'|'improcedente', motivo, removerAnuncio?, suspenderEmpresa?, suspenderAutor?, removerReferencia?}` | `{denuncia:{id, status, decisaoMotivo}}` · erros `Denúncia não encontrada.` · `Decisão inválida.` · `Informe o motivo.` · `Sem permissão.` (moderador não suspende) |
| `vagas_op_empresa_dono(p_empresa, p_email, p_motivo)` (`opEmpresaDono`; revisão de segurança, I2) | e-mail de login de quem JÁ está na equipe; motivo obrigatório | `{empresa:{id}, membro:{papel:'dono'}}` · registro `empresa_dono` com o motivo · operador(a) só em empresa SEM dona ativa com conta válida (`A empresa já tem uma pessoa dona. Para trocar, fale com a equipe da Gestão sem Caos.`; dona suspensa ou sem e-mail confirmado não conta — N1, 20261024120002); a equipe em qualquer uma · `Sem permissão.` (moderador ou outra cidade) · `Empresa não encontrada.` · `Informe o motivo.` · `E-mail inválido.` · `Esta pessoa não está na equipe da empresa.` · `Esta pessoa não pode ser dona agora: a conta dela está suspensa ou ainda não confirmou o e-mail.` |
| `vagas_op_moderacao(p_filtro)` (`opModeracao`) | `{cidade?, limite? ≤200}` | `{registros:[{id, em, papel, acao, alvo, alvoId, motivo, dados, cidade}]}` |
| `vagas_op_referencias(p_filtro)` (`opReferencias`) | `{cidade?, textoStatus?[]}` (padrão `pendente`) | `{referencias:[{id, empresa:{id, nomeFantasia}, funcao, vinculo, texto, textoStatus, textoMotivo, status, criadoEm}]}` (nada da pessoa) |
| `vagas_op_referencia_decidir(p_referencia, p_acao, p_motivo)` (`opReferenciaDecidir`) | `'aprovar_texto'|'recusar_texto'|'remover'` | `{referencia:{id, status, textoStatus}}` · erros `Referência não encontrada.` · `Este texto não está esperando a moderação.` · `Informe o motivo.` · `Ação inválida.` |

#### `vagas_op_indicadores(p_cidade)` — `VAGAS_API.indicadores('uruacu-go')` (20261024; painel da praça)
Operador(a)/moderador(a) só da própria cidade; equipe em todas (até `rascunho`). Lê só (stable). A praça = a cidade pedida +
as cidades do entorno dela. Os 15 indicadores e 5 gatilhos de `conteudo/vagas-operacao/indicadores.json` (versão 2; o mesmo
catálogo em `vagas_interno.indicadores_catalogo()` e em `VAGAS_REGRAS.INDICADORES`/`GATILHOS`). **Só agregados**: contagens,
porcentagens, medianas e totais por teste/área/mutirão — nenhum nome, contato, e-mail ou id de pessoa ou empresa.
`alvo` vem do **porte** da cidade (`pequena` = `alvo.cidadePequena` do arquivo; `grande` e `null` ficam sem alvo e sem cor);
`cor` pela regra do arquivo (`VAGAS_REGRAS.corIndicador`): maior é melhor — `ok` ≥ alvo, `atencao` ≥ 70% do alvo, `alerta`;
menor é melhor — `ok` ≤ alvo, `atencao` ≤ 1,3 × alvo, `alerta`; sem valor ou sem alvo, `null`. O que o banco ainda não guarda
(empresas buscando, pagantes, receita, e-mails) volta `valor:null, semDado:true`. `hipotese:true` = alvo ainda a confirmar na operação.
```json
{"ok":true,"cidade":{"slug":"uruacu-go","nome":"Uruaçu","uf":"GO","status":"ativa","porte":"pequena","fuso":"America/Sao_Paulo"},
 "praca":[{"slug":"uruacu-go","nome":"Uruaçu","status":"ativa"}],"mes":"2026-10","geradoEm":"…",
 "indicadores":[
  {"chave":"vagas_ativas","nome":"Vagas ativas","unidade":"vagas","periodo":"agora","direcao":"maior_melhor","hipotese":false,
   "valor":28,"alvo":20,"alvoLancamento":15,"cor":"ok","semDado":false,
   "detalhe":{"porTeste":{"atendimento":3,"vendas":0,"administrativo":0,"caixa":1,"portugues":0},"porArea":[{"area":"atendimento","nome":"Atendimento e recepção","valor":6}]}},
  {"chave":"vagas_3_interessados_72h","valor":0,"alvo":70,"cor":"alerta","semBase":false,"detalhe":{"base":8,"comTres":0,"janelaHoras":168}, "…":"…"},
  {"chave":"empresas_pagantes","valor":null,"alvo":5,"cor":null,"semDado":true, "…":"…"},
  {"chave":"lista_espera","valor":0,"detalhe":{"pessoa":0,"empresa":0,"comWhatsapp":0}, "…":"…"}],
 "gatilhos":[
  {"chave":"antes_de_cobrar","nome":"…","hipotese":true,"aplica":true,"atingido":false,
   "partes":[{"descricao":"Vagas no ar: 15 ou mais","ok":true},{"descricao":"Contratações: 3 ou mais","ok":false}]},
  {"chave":"pessoa_nao_paga","aplica":true,"atingido":true,"partes":[{"descricao":"Quem procura emprego não paga nada: não existe produto pago para a pessoa","ok":true,"fixa":true}], "…":"…"}]}
```
**Números pequenos protegidos** (revisão de segurança, I1): em cidade de porte `pequena` (ou sem porte), quem operou o mutirão
sabe quem fez a prova e quando; um contador de pessoas que sobe (ou não) em tempo real revelaria o resultado de alguém. Por isso
as contagens de PESSOAS — com selo (total e `porTeste`) e contratações (total e `mes`) — são calculadas até o fim de ontem no
fuso da cidade (`ateOntem:true`) e, abaixo de 3, saem `null` com `poucos:true` (a tela mostra "menos de 3"). Gatilho com número
protegido: a parte só vem `false` quando o alvo é 3 ou mais (nada além do que "menos de 3" já diz). Cidade `grande`: na hora e sem
esconder.
Detalhes por indicador: `vagas_ativas` {porTeste, porArea}; `pessoas_com_selo_por_funcao` {porTeste, alvoPorTeste,
alvoLancamentoPorTeste}; `vagas_3_interessados_72h` {base, comTres, janelaHoras} (janela do arquivo pelo porte: 7 dias na cidade
pequena); `vagas_combinou_7d` {base, comCombinou}; `primeira_resposta_empresa_dias` (mediana em dias; candidatura sem resposta
há 7+ dias conta a espera) {base, semRespostaEm7DiasPct}; `contratacoes` (acumulado) {mes}; `denuncia_tempo_decisao_h` (mediana
das últimas 30 decididas) {base, abertasMais24h}; `fila_moderacao` (parados há mais de 24 h) {anuncios, empresas, referencias};
`lista_espera` {pessoa, empresa, comWhatsapp, porOrigem:{radio, cartaz, grupo, canal, escola, mutirao, indicacao, outro,
naoInformada}} (20261024120004; na cidade protegida, origem com menos de 3 sai `null` e o indicador traz `poucos:true`); `cadastros_assistidos_confirmados` (no mês) {porMutirao:[{codigoEvento, criadas,
confirmadas, cor}]} (90 dias, até 20). `semBase:true` = sem vaga/candidatura no período (valor `null`). Gatilho: `aplica:false`
quando a cidade não tem porte com alvo; `atingido` = `false` se alguma parte é `false`, `null` se falta conferir alguma
(`manual:true` = decisão do dono/operação; `semDado:true`), `true` só com todas `true`.
Erros: `Sessão expirada. Entre de novo.` (`sessaoExpirada`) · `Sem permissão.` (sem papel na cidade, ou cidade que não existe
para quem não é da equipe) · `Cidade não encontrada.` (só para a equipe).

### 8.8 Equipe da Gestão sem Caos (`public.e_admin()`; zona também operador da cidade)

| RPC | Entrada | Resposta / erros |
|---|---|---|
| `vagas_adm_cidade_salvar(p_dados)` (`admCidadeSalvar`) | `{slug:'nova-cidade-uf', nome, uf, ibge, fuso?, status?, porte?, praca?, metaListaEspera?, ordem?, canalWhatsapp?}` (cria ou altera só o que vier; cidade nova sem `fuso` fica `America/Sao_Paulo`; `porte`: `pequena`, `grande` ou `''`/`null` para tirar — 20261024; `canalWhatsapp`: `https://whatsapp.com/channel/<id>` ou `''`/`null` para tirar — 20261024120004; passar a `ativa` põe no ar as vagas da pré-abertura, §6.8) | `{cidade}` (+ `porte`) · `Sem permissão.` · `Endereço da cidade inválido (ex.: nome-da-cidade-uf).` · `Status da cidade inválido.` · `Porte da cidade inválido (grande ou pequena).` · `Cidade-polo não encontrada.` · `Fuso horário inválido.` · `Dados da cidade inválidos. Confira nome, UF e IBGE.` · `Link do canal de WhatsApp inválido. Use o link do canal (https://whatsapp.com/channel/...).` |
| `vagas_adm_zona_salvar(p_dados)` (`admZonaSalvar`) | `{cidade, slug, nome, bairros[], ordem?, ativa?}` | `{zona:{id, slug, nome, bairros, ordem, ativa}}` · `Cidade não encontrada.` · `Sem permissão.` · `Endereço da zona inválido (ex.: zona-oeste).` · `Dados da zona inválidos. Confira o nome.` |
| `vagas_adm_cidades()` (`admCidades`; 20261024) | — | `{cidades:[{id, slug, nome, uf, ibge, fuso, status, porte, praca, metaListaEspera, ordem, canalWhatsapp, abertaEm (20261024120004), zonas:[{id, slug, nome, bairros, ordem, ativa}], operadoresAtivos}]}` — TODAS as cidades (inclusive `rascunho` e `pausada`) e todas as zonas (inclusive desligadas) · `Sem permissão.` |
| `vagas_adm_operadores(p_filtro)` (`admOperadores`; 20261024) | `{cidade?}` | `{operadores:[{email, cidade:{slug, nome}, papel, ativo, repassePercentual, contratoVersao, contaStatus:'pendente'|'ativa'|'suspensa', contratoAceitoEm, criadoEm, ultimoAto:{acao, em}|null}]}` (`pendente` = ainda não confirmou o e-mail do convite; `contratoAceitoEm` = aceite do 1º acesso da conta de operação; `ultimoAto` = último registro dela na moderação daquela cidade) · `Sem permissão.` · `Cidade não encontrada.` |
| `vagas_adm_aviso_resumo(p_cidade)` (`admAvisoResumo`; 20261024120002 e 20261024120003) | slug da cidade | `{cidade:{slug, nome, status, abertaEm, listaAte}, contagens:{naLista, aAvisarEmail, avisadosEmail, emEnvio, semEmail, aAvisarWhatsapp}, teto:{porDia, usados24h, disponivel, diasPrevistos}}` (`abertaEm`/`listaAte` `''` enquanto não abriu) · `Sem permissão.` · `Cidade não encontrada.` |
| `vagas_adm_aviso_whatsapp(p_cidade)` (`admAvisoWhatsapp`; 20261024120002) | slug da cidade ATIVA | o próximo contato a avisar pelo WhatsApp, UM por vez (o mesmo até marcar): `{cidade:{slug, nome}, contato:{id, whatsapp:'5562988881111', perfil, texto, link:'https://wa.me/5562988881111?text=…'}|null, contagens}` · registro `aviso_whatsapp_ver` (sem o número) · `Sem permissão.` · `Cidade não encontrada.` · `A cidade ainda não está aberta. Abra a cidade antes de avisar a lista de espera.` |
| `vagas_adm_aviso_whatsapp_feito(p_id)` (`admAvisoWhatsappFeito`; 20261024120002) | `contato.id` | `{duplicado:false, contagens}` (de novo: `duplicado:true`) · marca `whatsapp_avisado_em`; se o e-mail já foi, a linha sai · registro `aviso_whatsapp` · `Sem permissão.` · `Contato não encontrado.` (já saiu da lista ou não tem WhatsApp) · `A cidade ainda não está aberta…` |
| `vagas_adm_operador_salvar(p_dados)` (`admOperadorSalvar`) | `{cidade, email, papel:'operador'|'moderador', ativo?, repassePercentual?, contratoVersao?}` (a conta vem do convite da Edge Function) | `{operador:{cidade, papel, ativo, repassePercentual, contratoVersao}}` · `Sem permissão.` · `Cidade não encontrada.` · `Papel inválido.` · `Não há conta de operação com este e-mail. Use o convite de operador.` · `Percentual de repasse inválido (0 a 100).` |

### 8.9 Só para a Edge Function (service_role; nem anon nem authenticated executam)

`vagas_conta_limite(p_acao, p_cf, p_xff, p_email, p_ator)` (limites por origem/e-mail/ator: cadastrar 5/h e 20/dia por
origem, 3/h por e-mail, 300/h no total; erro `Muitas tentativas. Tente de novo mais tarde.`), `vagas_conta_consultar(p_email)`,
`vagas_conta_registrar(p_user, p_dados)`, `vagas_conta_quem(p_user)`, `vagas_conta_foto(p_user, p_candidatura)` (pode ver
a foto? sem candidatura = a própria; com candidatura = membro ativo da empresa dela, depois do Combinou, sem corte →
`{ok, caminho:'<pessoa>/foto.jpg'}`; erros `Sessão expirada. Entre de novo.` · `Candidatura não encontrada.` · `A foto só
aparece depois do Combinou.` (`semCombinou`) · `A pessoa deixou de compartilhar o contato com a sua empresa.`
(`contatoCortado`) · `Esta empresa está suspensa. Fale com a Gestão sem Caos.` (`suspensa`) · `Esta pessoa não pôs foto.` /
`Sem foto.` (`semFoto`)).
`vagas_conta_convite_equipe(p_user, p_empresa, p_email, p_cf, p_xff)` (20261024; confere por dentro que quem chama não é
anon/authenticated): decide tudo do convite de equipe e devolve à Function `{ok, convite, token, destino, empresaNome,
cidadeNome, convidadoPor}`, com `destino` = `nova` (e-mail sem conta: a Function cria a conta de empresa pendente) |
`empresa_pendente` | `empresa` | `outro_tipo` (conta de pessoa/operação: e-mail que explica, sem convite que funcione) |
`nenhum` (conta só do painel DISC ou suspensa: nada é enviado). Erros: os de conta · `Empresa não encontrada.` · `Só quem é
dono(a) da conta da empresa pode convidar pessoas para a equipe.` · `Esta empresa está suspensa. Fale com a Gestão sem Caos.`
(`suspensa`) · `Só empresa verificada pela Gestão sem Caos pode convidar pessoas para a equipe.` · `E-mail inválido.` · `Esta pessoa já faz parte da equipe.` · `Muitos convites hoje. Tente de novo amanhã.`
(`bloqueado`) · `A equipe já tem 20 pessoas. Remova alguém antes de convidar outra.` · `Sua empresa já tem 20 convites
abertos. Cancele algum antes de convidar outra pessoa.` · `Sem permissão.` (`convidadoPor` vem `''` quando o nome do cadastro
não passa no filtro de contato e link.)
`vagas_conta_exclusao_conferir(p_user)` (revisão de segurança, I2; ação `excluir`): `{ok:true}` ou `Você é a única pessoa dona
de uma empresa que tem equipe. Antes de excluir a conta, torne outra pessoa da equipe dona (aba Equipe da empresa) ou remova a
equipe.`
`vagas_conta_aviso_lote(p_user, p_cidade, p_limite)` (20261024120002; ação `avisar_lista_espera`): só `public.admins`; cidade
`ativa`; reserva até `p_limite` (1 a 50, e no máximo o que cabe no teto de 24 h — 20261024120003) pessoas da fila
(menos tentativas primeiro), grava `avisado_em` na hora e gera o token de saída de cada uma →
`{ok, cidade:{slug, nome}, lote:[{id, email, perfil, sairToken}], contagens, teto}` (o WhatsApp nunca vem). Erros: `Sem permissão.` ·
`Sessão expirada. Entre de novo.` · `Cidade não encontrada.` · `A cidade ainda não está aberta. Abra a cidade antes de avisar a
lista de espera.` `vagas_conta_aviso_marcar(p_user, p_cidade, p_enviados, p_falhas, p_invalidos)` (20261024120003; a versão
de 4 parâmetros continua, para a Function antiga): `p_enviados` ganham `aviso_enviado_em` (quem não espera o WhatsApp sai
da lista); `p_falhas` voltam para o fim da fila (até a 3ª); `p_invalidos` não voltam (sem WhatsApp a avisar, a linha sai)
→ `{ok, enviados, falhas, invalidos, contagens}`. Marcar de novo não conta duas vezes.
`vagas_conta_lista_espera(p_dados, p_cf, p_xff, p_humano)` (20261024120004; ação `lista_espera`): as mesmas regras e respostas
de `vagas_lista_espera_entrar`, com a origem vinda dos cabeçalhos do pedido original; `p_humano` (Turnstile conferido) sobe
o limite por origem para 300 por hora e tira o teto total; ignora o ajuste `lista_espera_captcha`. Registros `aviso_email_lote` e
`aviso_email` (só números).

## 9. Edge Function `vagas-conta`

`POST /functions/v1/vagas-conta` (Verify JWT **desligado**; quem precisa de login manda `Authorization: Bearer <token>` e a
função confere). Corpo `{acao, ...}`; resposta sempre HTTP 200 com `{ok, ...}` (405 para outro método). CORS só para
`VAGAS_SITE_URL`, o painel do DISC (`SITE_URL`; sem ele, `https://disc.gestaosemcaos.com.br` — 20261024, para o convite de
operador pela aba "Vagas") e localhost. CORS não é a proteção: as ações com login continuam exigindo o token.

| Ação (`VAGAS_API`) | Corpo | Resposta |
|---|---|---|
| `cadastrar` (`cadastrar({email, tipo, nome?, termosVersao?, captcha?})`) | `{acao:'cadastrar', email, tipo:'pessoa'|'empresa', nome?, termosVersao, captcha?}` — **sem senha** | sempre `{ok:true, enviado:true, mensagem:'Se este e-mail puder ser usado, você vai receber um link em instantes. Confira também a caixa de spam.', email:'a***@e***.com'}` |
| `reenviar` (`reenviarConfirmacao(email, captcha?)`) | `{acao:'reenviar', email}` | a mesma resposta neutra |
| `esqueci` (`esqueciSenha(email, captcha?)`) | `{acao:'esqueci', email}` | a mesma resposta neutra (nunca mexe em conta do painel DISC) |
| `assistido` (`cadastroAssistido({...})`, JWT de operador da cidade ou equipe) | `{email, tipo, cidade, empresaId?, nome?, codigoEvento?}` (`empresaId` só de empresa SEM membro ativo) | `{ok:true, enviado:true, email}` · `Este e-mail já tem conta. A pessoa pode entrar ou usar "Esqueci minha senha".` (`existe`) · `Esta empresa já tem acesso. Peça a quem é dono(a) para convidar pelo painel da empresa.` · `Empresa não encontrada.` |
| `operador` (`convidarOperador({...})`, JWT da equipe) | `{email, cidade, papel, cidadeNome?}` | `{ok:true, enviado:true, email}` ou `{ok:true, existente:true}` · `Este e-mail já tem outra conta. Use um e-mail só para a operação.` |
| `excluir` (`excluirConta()`, JWT) | `{confirmar:'EXCLUIR'}` | `{ok:true, excluida:true}` (apaga também a foto) · `Para excluir, digite EXCLUIR.` · `Esta conta também acessa o painel DISC. Fale com a Gestão sem Caos para excluir.` · `Conta não encontrada.` · `Você é a única pessoa dona de uma empresa que tem equipe. Antes de excluir a conta, torne outra pessoa da equipe dona (aba Equipe da empresa) ou remova a equipe.` (nada é apagado) |
| `foto` (`fotoUrl(candidaturaId?)`, JWT) | `{candidatura?}` | `{ok:true, url:'<URL assinada de 5 min>', expiraEm}` · erros de `vagas_conta_foto` (§8.9) |
| `avisar_lista_espera` (`avisarListaEspera(cidade, limite?)`, JWT da equipe; 20261024120002 e 20261024120003) | `{acao:'avisar_lista_espera', cidade, limite?}` (padrão 25, de 1 a 50) | um lote do aviso de abertura (§6.7): `{ok:true, cidade:{slug, nome}, enviados, falhas, invalidos, restantes, aAvisarWhatsapp, terminou, travado, tetoAtingido}` — só números, nunca um e-mail; a tela repete só enquanto `terminou`, `travado` e `tetoAtingido` forem `false` · `Sem permissão.` (operação e contas comuns) · `Cidade não encontrada.` · erros de `vagas_conta_aviso_lote` (§8.9) · `naoConfigurado` (sem `RESEND_API_KEY`, ninguém é reservado) |
| `lista_espera` (`listaEspera({…, captcha})`, sem login; 20261024120004) | `{acao:'lista_espera', cidade, email, perfil?, whatsapp?, origem?, site?, captcha}` (só esses campos seguem para o banco, texto até 300) | a resposta de `vagas_lista_espera_entrar` (§8.1) · `Confirme que você não é um robô e tente de novo.` (`captcha`; só com `TURNSTILE_SECRET`) |
| `convite_equipe` (`convidarEquipe(empresaId, email)`, JWT de quem é dono(a); 20261024) | `{acao:'convite_equipe', empresaId, email}` | sempre a MESMA resposta para qualquer e-mail (tenha conta ou não, de qualquer tipo): `{ok:true, enviado:true, mensagem:'Pronto. Se este e-mail puder entrar na equipe, a pessoa recebe o convite em instantes. O convite vale por 3 dias.', email:'n***@e***.com', convite:{id, email, papel, status:'pendente', criadoEm, expiraEm}}` · erros de `vagas_conta_convite_equipe` (§8.9; só `erro` e as marcas) · `Empresa não encontrada.` (id inválido) |

Erros comuns: `E-mail inválido.` · `Escolha se a conta é para procurar emprego ou para uma empresa.` · `Para criar a conta,
aceite os termos de uso e o aviso de privacidade.` · `Confirme que você não é um robô e tente de novo.` (`captcha`; só com
`TURNSTILE_SECRET`) · `O envio de e-mail ainda não está configurado. Fale com a Gestão sem Caos.` (`naoConfigurado`) ·
`Muitas tentativas. Tente de novo mais tarde.` (`bloqueado`) · `Sessão expirada. Entre de novo.` · `Sem permissão.` ·
`Ação desconhecida.` · `Erro interno no servidor. Tente novamente em instantes.`

**Links do e-mail** (todos na tela `entrar.html` do site): `https://vagas.gestaosemcaos.com.br/entrar.html?token_hash=<hash>&type=invite`
(cadastro, reenviar, assistido, operador; `magiclink` se o convite não puder ser gerado) ou `…&type=recovery` (esqueci).
A tela faz: `const link = VAGAS_API.linkDoEndereco(location)` → `VAGAS_API.confirmarLink(link)` (`{ok, tipo, precisaSenha:true}`)
→ formulário "Crie sua senha" → `VAGAS_API.definirSenha(senha)` (8 a 72 caracteres; `A senha precisa ter de 8 a 72
caracteres.`) → `VAGAS_API.eu()`. Link vencido/usado: `O link expirou ou já foi usado. Peça outro na tela de entrada.`
(`linkExpirado`). Login: `VAGAS_API.entrar(email, senha)` (resolve com a resposta de `vagas_eu`; erro `E-mail ou senha
não conferem.` ou `Confirme seu e-mail pelo link que enviamos antes de continuar.`). Sair: `VAGAS_API.sair()`.
Cadastro de e-mail já pendente (não confirmado): o link vai de novo e o `tipo` passa a ser o pedido agora (banco +
`app_metadata`); o consentimento só é gravado no clique do link (§4, Conta).

Convite de equipe: e-mail `conteudo/vagas-textos/emails/convite-equipe.html` com `…/entrar.html?convite=<token>` (conta de
empresa confirmada) ou `…/entrar.html?token_hash=<hash>&type=invite&convite=<token>` (sem conta: a Function cria a conta de
empresa pendente, com `app_metadata.convite = true`; conta de empresa pendente: link novo); conta de outro tipo recebe
`convite-equipe-outra-conta.html` (sem convite que funcione). A tela lê o token com `VAGAS_API.conviteDoEndereco(location)`.

Aviso de abertura: e-mail `conteudo/vagas-textos/emails/cidade-abriu.html` (assunto `O Vagas sem Caos chegou a <cidade>`), com
`…/entrar.html#criar` (pessoa) ou `…/entrar.html?tipo=empresa#criar` (empresa) e o link de saída
`…/emprego.html?cidade=<slug>&sair=<token>#sair` / `…/empresas.html?cidade=<slug>&sair=<token>#sair` (§8.1).

Segredos (Supabase → Edge Functions → Secrets): `RESEND_API_KEY` (o mesmo do DISC), `VAGAS_SITE_URL`
(`https://vagas.gestaosemcaos.com.br`), `VAGAS_EMAIL_REMETENTE` (sugestão: `Vagas sem Caos
<vagas@gestaosemcaos.com.br>`; sem ele, usa o `EMAIL_REMETENTE` do DISC), `TURNSTILE_SECRET` (opcional). Detalhes em `docs/SUPABASE.md`.

## 10. Cliente JS para as telas

```html
<script src="js/endereco.js"></script>   <!-- no <head> -->
<script src="js/config.js"></script>
<script src="js/regras.js"></script>
<script src="js/api.js"></script>
<script src="js/<tela>.js"></script>
```

```js
VAGAS_API.anuncios({ cidade: 'uruacu-go', paraHoje: true })
  .then(function (r) { /* r.anuncios, r.proximo */ })
  .catch(function (e) {
    if (e.sessaoExpirada) return irPara('entrar.html');
    if (e.listaEspera) return mostrarListaEspera(e.resposta.interessados);
    mostrarAviso(e.message);                 // já em português
  });
```

- `VAGAS_REGRAS`: listas fechadas com rótulos (`MODALIDADES`, `VINCULOS`, `TURNOS`, `ESCOLARIDADES`, `CNH`, `UNIDADES`,
  `PONTOS_FORTES`, `MOTIVOS_DENUNCIA`, `STATUS_*`), `VERSAO_TERMOS`, `MSG` (inclui `NUNCA_PAGUE`), validação igual à do
  banco para mostrar o erro antes de enviar (`lerPessoa`, `lerEmpresa`, `lerAnuncio(d, hojeIso)`, `lerReferencia`,
  `conferirTexto(texto, contexto)`), formatação (`reais`, `formatarValor`, `formatarCnpj`, `nomeExibicao`, `iniciais`,
  `hoje(fuso?, agora?)` (sem fuso: `America/Sao_Paulo`), `somarDias`, `meses`). Onda 2: `lerListaEspera(d)`, `corIndicador(valor,
  alvo, direcao)`, `INDICADORES`, `GATILHOS`, `PORTES`, `CORES_INDICADOR`, `PAPEIS_EMPRESA`, `STATUS_CONVITE_EQUIPE`,
  `MSG.WHATSAPP_INVALIDO`, `MSG.CONVITE_INVALIDO`.
- `VAGAS_API.RECURSOS` = `{listaEsperaWhatsapp: true, preAberturaEmpresas: true, origemListaEspera: true}`: a lista da cidade
  liga o campo opcional de WhatsApp (20261024) e o campo de origem (20261024120004); as telas da empresa aceitam cidade em
  lista de espera (pré-abertura, §6.8). No modo supabase, publique o site só depois de aplicar a migração de cada recurso
  (antes dela o banco ignoraria o campo). Na prévia os três estão ligados; nenhuma cidade da prévia tem canal de WhatsApp
  (`canalWhatsapp: null`).
- Prévia: logins `pessoa@previa.com` (Ana Clara Ribeiro: currículo completo, conversa numa vaga confidencial, um Combinou,
  uma referência aceita e uma pendente, selo fictício `Q8V3-N2KD`), `empresa@previa.com` (Mercadinho Sol do Norte),
  `empresa6@previa.com` (Restaurante Sabor da Terra, que deu a referência), `recrutador@previa.com` (Rita Moraes,
  recrutadora do Mercadinho: não vê a equipe), `operador@previa.com` (Uruaçu), `admin@previa.com` (equipe) — senha
  `previa123`. Cidades da prévia: `uruacu-go` (ATIVA na prévia, porte pequena, as 6 zonas), `campinorte-go` (entorno) e
  `niquelandia-go` (lista de espera) — as duas vizinhas existem só na prévia. O Mercadinho tem um convite de equipe aberto
  (`convidada@previa.com`). Na prévia, `cadastrar`/`esqueciSenha`/`convidarEquipe` devolvem `linkPrevia` (a tela abre o link
  em vez de esperar o e-mail; no convite vem `''` quando, no real, nenhum convite que funcione seria enviado). Nada sai do navegador.
- Foto: `VAGAS_API.enviarFoto(arquivo)` (File/Blob jpg|png|webp ≤ 1 MB, gravado direto no Storage com o login da pessoa;
  a tela reduz para ~512 px antes) → `{ok, temFoto:true}`; `apagarFoto()`; `fotoUrl(candidaturaId?)`. Erro de arquivo:
  `A foto precisa ser JPG, PNG ou WEBP, com até 1 MB.`; falha no envio: `Não foi possível guardar a foto. Tente de novo.`
  A URL assinada é de `https://<projeto>.supabase.co`: a CSP do site precisa liberar esse endereço em `img-src`.
- No Node (testes): `require('./vagas/js/api.js').criar({modo:'previa', backend: require('./vagas/js/api-previa.js').criarBackend({armazenamento, agora})})`.

## 11. Telas previstas (desenho em `docs/VAGAS-TELAS.md`)

| Tela | Para | RPCs principais |
|---|---|---|
| `index.html` (hoje: "em construção") → escolha/lembrança da cidade | todos | `cidades` |
| `cidade.html` (`/uruacu-go/`, abre `?vaga=<código>`) | pessoa no celular | `anuncios`, `anuncio`, `anuncioVista`, `quero`, `pular`, `listaEspera`, `denunciar` |
| `vaga.html` (`/v/<código>`, montada pela Pages Function) | todos | `anuncio` |
| `entrar.html` (pessoa e `?tipo=empresa`; volta do link do e-mail; `?convite=` do convite de equipe) | todos | `cadastrar`, `entrar`, `esqueciSenha`, `reenviarConfirmacao`, `linkDoEndereco`, `confirmarLink`, `definirSenha`, `aceitarTermos`, `conviteDoEndereco`, `conviteEquipe`, `aceitarConviteEquipe` |
| `eu.html` (currículo, candidaturas, conversa, quem viu, dados, referências) | pessoa no celular | `minhaPessoa`, `salvarPessoa`, `feed`, `minhasCandidaturas`, `verEmpresa`, `combinar`, `recusar`, `retirar`, `conversa`, `enviarMensagem`, `quemViuMeuContato`, `cortarAcesso`, `minhasReferencias`, `pedirReferencia`, `responderReferencia`, `publicarReferencias`, `exportarMeusDados`, `excluirConta` |
| `testes.html`, `selo.html` | pessoa / todos | RPCs da 20261023 (`docs/VAGAS-TESTES.md`), `seloPublico` |
| `referencia.html?t=` (empresa abre o pedido) e `referencias.html?t=` (página pública) | empresa / todos | `conviteReferencia`, `oferecerReferencia`, `referenciasPublicas` |
| `empresa.html` (vagas, cartões, conversas, referências, dados) | empresa no computador | `minhasEmpresas`, `cadastrarEmpresa`, `salvarEmpresa`, `salvarAnuncio`, `publicarAnuncio`, `acaoAnuncio`, `anunciosDaEmpresa`, `anuncioNumeros`, `cartoes`, `decidir`, `contatoPessoa`, `marcarContratada`, `conversasDaEmpresa`, `oferecerReferencia`, `referenciasDaEmpresa`; aba Equipe (só dono(a)): `equipeDaEmpresa`, `convidarEquipe`, `cancelarConvite`, `removerMembro` (e "Sair da equipe" para recrutador(a)) |
| `operador.html` (fila, denúncias, empresas, cadastro assistido, zonas) | operador no computador | `opResumo`, `opEmpresas`, `opEmpresaDecidir`, `opEmpresaCadastrar`, `opVincularMembro`, `opAnuncios`, `opAnuncioDecidir`, `opDenuncias`, `opDenunciaDecidir`, `opModeracao`, `opReferencias`, `opReferenciaDecidir`, `cadastroAssistido`, `opAssistidos`, `admZonaSalvar`; painel da praça: `indicadores` (= `opIndicadores`) |
| `admin.html` (painel DISC) grupo "Vagas" | equipe | `admCidades`, `admCidadeSalvar` (com `porte`), `admZonaSalvar`, `admOperadores`, `admOperadorSalvar`, `convidarOperador`, `indicadores` (qualquer cidade), `op*`; aviso de abertura (§6.7): `admAvisoResumo`, `avisarListaEspera` (botão "Avisar por e-mail", repetido até terminar), `admAvisoWhatsapp` + `admAvisoWhatsappFeito` (fila "Avisar pelo WhatsApp") |
| `emprego.html` / `empresas.html` (divulgação da cidade em lista de espera) | todos, no celular | `listaEspera`, `listaEsperaSair`; com `?sair=<token>` no endereço (link do e-mail do aviso): `listaEsperaSairLink(token)` e a confirmação "Pronto, você saiu da lista" |

## 12. Ganchos e combinados com outras partes

- **Selos (migração 20261023):** se existir `vagas_interno.selos_cartao(p_user uuid) returns jsonb` (lista de selos VÁLIDOS:
  `[{teste, nome, nota, data, codigo, validoAte, supervisao}]`), o cartão (`selos`; nunca filtro) e
  `vagas_anuncio_numeros.comSelo` passam a usá-la; sem ela, `[]`. A 20261023 deve copiar a `versao_banco()` desta e
  acrescentar as suas entradas.
- **Hospedagem:** a Pages Function de `/v/<código>` lê `vagas_anuncio_publico` (formato §8.1) e a chave pública de
  `vagas/js/config.js` (`SUPABASE_ANON_KEY: '…'`). Não chama `vagas_anuncio_vista`. Logos em `vagas/comum/marca/`.
  `titulo` continua vindo (= função); `requisitos` agora é LISTA de chaves: para o texto, use `requisitosLista.join(' · ')`.
  A foto (URL assinada) precisa de `img-src https://<projeto>.supabase.co` na CSP das telas da empresa (a meta de
  `vagas/index.html` libera só o projeto em `img-src` e `connect-src`, como o `_headers` — §1).
- **Limite por origem:** pressupõe `cf-connecting-ip` (Cloudflare na frente do Supabase, como no projeto); sem ele o
  `x-forwarded-for` é forjável (§5, item 17).
- **Avisos de moderação por e-mail (devolver vaga, recusar empresa):** o banco grava o motivo em `statusMotivo` (chave de
  `conteudo/vagas-textos/moderacao.json`) e a tela da empresa mostra o texto; o e-mail com o mesmo texto entra na onda do
  painel (Edge Function, junto de `vagas_op_avisar_contatos`).
- **Avisos para as telas:** (a) os textos livres do cartão (`cargos`, `cursos`, `experiencias.funcao`) só passam pelo filtro
  de contato/link — a tela deve avisar a pessoa para não escrever idade, sexo, religião etc. (o que a lei não deixa pedir);
  (b) `vagas_mensagem_enviar` com `p_id` de mensagem alheia responde `Identificador da mensagem inválido.` (só confirma que
  o uuid existe; uuid não se adivinha — aceitável).
- **Testes de habilidade (20261023):** `vagas_exportar_meus_dados.testes` chama `vagas_interno.testes_exportar(p_user)` se
  existir (mesmo padrão dos selos); o `selo` da vaga usa os 5 slugs dos testes (`vagas_interno.testes_selo()`).
- **Endereço:** `vagas/js/endereco.js` manda quem abrir `disc.gestaosemcaos.com.br/vagas/…` (GitHub Pages do DISC) para
  `https://vagas.gestaosemcaos.com.br/…` com o mesmo caminho, parâmetros e âncora (não age em `vagas.gestaosemcaos.com.br`,
  `*.pages.dev` nem localhost).
- **Peças da marca:** `node scripts/montar-vagas.mjs` copia `assets/notus.css`, a fonte Plus Jakarta Sans e todo
  `assets/marca/` para `vagas/comum/`; `npm test` falha se a cópia estiver desatualizada.
- **Textos:** termos/privacidade/consentimentos/e-mails/WhatsApp vêm de `conteudo/vagas-textos/` (versão =
  `termos_versao`). As mensagens de erro desta especificação são fixas no banco (as telas mostram `e.message`).
- **Onda 2 (20261024):**
  - **Aviso de "a cidade abriu" (20261024120002, §6.7):** o e-mail sai pela `vagas-conta` (lotes, só a equipe) e o WhatsApp
    pela fila da equipe (um por vez, link `wa.me`). Nenhuma RPC devolve a lista de e-mails para uma tela; a operação continua
    vendo só contagens (`opResumo.listaEspera` e o indicador `lista_espera.detalhe.comWhatsapp`). As páginas de divulgação
    (`emprego.html`, `empresas.html`) precisam tratar `?sair=<token>#sair` (chamar `listaEsperaSairLink(token)` e confirmar) e
    `#sair` sem token (formulário com o e-mail, `listaEsperaSair`); no cadastro, o campo `origem` (lista fechada, §8.1), a isca
    `site` escondida e, com `TURNSTILE_SITE_KEY`, o `captcha`. As telas da empresa mostram `avisoAbertura` na vaga que aguarda a
    abertura; a lista da cidade mostra `canalWhatsapp` quando houver. Os textos `cidade-abriu.html` e
    `lista_espera_cidade_abriu` (whatsapp.json) estão marcados para revisão da psicologia/jurídico.
  - **Indicadores aproximados:** "primeira resposta" usa `empresa_decidiu_em` (a ÚLTIMA decisão da empresa) ou a abertura da
    conversa, o que vier antes; vaga renovada conta pela `publicado_em` atual; pessoas com selo contam por `vagas_pessoas.cidade_id`
    ou `cidade2_id` na praça. Empresas buscando, pagantes, receita e e-mails do mês: `semDado` até existir a fonte.
  - **Operação do entorno:** o painel de uma cidade do entorno só abre para quem opera aquela cidade (linha própria em
    `vagas_operadores`) ou para a equipe; o operador da cidade-polo vê o entorno dentro do painel da praça dele.
  - **Fuso:** testes de habilidade (20261023) passam a usar `vagas_interno.fuso_conta(user)` (cidade da pessoa → da empresa →
    da operação → da conta assistida → `America/Sao_Paulo`); `vagas/js/testes.js` (`hoje(agora, fuso?)`, `dataDoIso(iso, fuso?)`)
    faz a mesma conta na tela, com a mesma reserva.
  - **Ordem:** rodar a 20261022 ou a 20261023 de novo depois da 20261024 volta as funções redefinidas à versão antiga
    (inclusive `vagas_op_resumo` sem `repassePercentual`); rode a 20261024 em seguida. Do mesmo jeito, a 20261024120002
    redefine `vagas_lista_espera_entrar`, `vagas_lista_espera_sair`, `vagas_op_empresa_dono` e o gatilho
    `membros_sem_dono` (N1, N2): rodar a 20261024120000 de novo depois dela pede rodar a 20261024120002 em seguida.
  - **Riscos aceitos (revisão de segurança da onda 2):** I4 — no `convite_equipe` (como no `cadastrar`), quando nenhum e-mail
    é enviado (conta só do painel DISC ou suspensa) a resposta volta mais rápido; quem medir o tempo pode inferir algo do
    e-mail. Mesma classe já aceita no cadastro; correção possível depois: enviar fora da resposta (`EdgeRuntime.waitUntil`)
    ou atraso fixo. A2 (3ª revisão, decisão de produto) — a lista de espera NÃO confirma o e-mail na entrada (o atrito
    afastaria o público do piloto): alguém pode pôr e-mails de outras pessoas, endereços que não existem ou armadilhas de
    spam. Mitigações: teto diário do aviso (60 em 24 h, §6.7), um e-mail só por pessoa, link de saída com token em todo
    e-mail, e-mail só ASCII visível, fila que desiste depois de 3 falhas e limpeza 30 dias depois da abertura. A6 — rodar
    a 20261022 de novo depois da 20261024120002 tira o EXECUTE do anon em `vagas_lista_espera_sair_link` (e volta outras
    funções à versão antiga): rode a 20261024120002 e as seguintes em seguida. N3 (2ª revisão, aceito para o piloto) — mesmo com o corte em "até ontem" e o "menos de 3", acima de 3
    ainda dá para deduzir resultado: se só uma pessoa fez o teste X ontem, `porTeste` indo de 3 para 4 revela que ela passou.
    Mitigação futura, se a operação pedir: foto semanal (contagem até o fim da semana anterior) ou arredondar `porTeste` para
    múltiplos de 5 em cidade `pequena`.
  - **Pedidos da operação ainda abertos:** "reverter um ato" (`vagas_op_reverter`) precisa de regra por ação (o que volta, quem
    pode, se avisa a empresa) decidida com a operação/psicologia antes de existir; textos locais da cidade (WhatsApp da praça,
    endereço do balcão, horário do mutirão) ficam para a fase 2 (coluna/tabela nova).

## 13. Para colocar no ar (depende do dono)

1. Aplicar a migração `20261022120000_vagas.sql` no Supabase (SQL Editor; é idempotente e não apaga nada do DISC). Ela
   cria também o bucket PRIVADO `vagas-fotos` e as políticas do Storage (confira em Storage → Buckets).
2. Publicar a Edge Function `vagas-conta` com **Verify JWT desligado** e cadastrar os segredos (§9).
3. Auth → URL Configuration: acrescentar `https://vagas.gestaosemcaos.com.br/**` em Redirect URLs.
4. Resend: o domínio `gestaosemcaos.com.br` já verificado serve (remetente `vagas@…`).
5. Turnstile (opcional, recomendado): chave pública em `vagas/js/config.js` (`TURNSTILE_SITE_KEY`) e `TURNSTILE_SECRET`.
6. DNS + Cloudflare Pages (guia em `docs/VAGAS-HOSPEDAGEM.md`) e, na semana de abrir, plano Pro do Supabase.
7. Aplicar `20261024120000_vagas_onda2.sql` e `20261024120001_vagas_piloto_uruacu.sql` (nesta ordem, depois das 20261023;
   idempotentes) e publicar de novo a Edge Function `vagas-conta` (ação `convite_equipe`). Conferir em `versao_banco()`.
7b. Aplicar `20261024120002_vagas_aviso_abertura.sql` (depois da 20261024120001; idempotente), publicar de novo a
   `vagas-conta` (ação `avisar_lista_espera`) e agendar no `pg_cron` `select vagas_interno.lista_espera_limpar();` uma vez por dia.
7c. ANTES do primeiro aviso real: aplicar `20261024120003_vagas_aviso_reforco.sql` e publicar de novo a `vagas-conta`
   (e-mail só ASCII visível, `invalidos`, `travado`, `tetoAtingido`). Teto do aviso: 60 por dia (ajuste `aviso_teto_diario`).
7d. Aplicar `20261024120004_vagas_pre_abertura.sql` (depois da 20261024120003; idempotente) e publicar de novo a `vagas-conta`
   (ação `lista_espera`). Canal de WhatsApp de Uruaçu, quando existir: `admCidadeSalvar({slug:'uruacu-go', canalWhatsapp:'https://whatsapp.com/channel/…'})`.
   Turnstile na lista de espera: chave no site, `TURNSTILE_SECRET` na função e o ajuste `lista_espera_captcha` (§8.1).
8. Abrir a praça piloto quando for a hora: `admCidadeSalvar({slug:'uruacu-go', status:'ativa'})` (nasce em `lista_espera`).
   Depois, avisar a lista de espera (§6.7): "Avisar por e-mail" até terminar e a fila do WhatsApp, em até 30 dias.
   Bairros das zonas `regiao-leste` e `regiao-oeste` com a operação (`admZonaSalvar`).
9. Trocar `MODO: 'previa'` por `'supabase'` em `vagas/js/config.js`.
10. Revisar: zonas/bairros de Uruaçu com a operação; textos jurídicos com advogado(a) (inclusive o WhatsApp opcional da lista
   de espera e a retenção dos convites, §7.1); lista de pontos fortes e textos com a psicologia (inclusive os e-mails
   `convite-equipe.html` e `convite-equipe-outra-conta.html`).
