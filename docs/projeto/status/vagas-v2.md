# Vagas sem Caos v2 · passa-bastão (25/11/2026)

Ramo `vagas/redesenho-v2` (nasceu de `586c220`). Nada foi publicado: sem push, sem migração aplicada no Supabase, sem mudança na VPS.
Sem segredo, preço ou nome de pessoa neste arquivo. Detalhes do servidor: `vagas-v2-servidor.md`. Contrato técnico: `vagas/js/v2/contrato.js`
e `docs/VAGAS-SPEC.md` (§14 banco, §15 telas).

## 1. O que mudou

- **Pessoa** (`vagas/index.html`, `vagas/js/v2/pessoa/`): início e busca com sugestões, filtros por fato e sinônimos; lista; vaga; candidatura em 3
  caminhos (anexar currículo, montar em poucas perguntas, só nome + e-mail + WhatsApp); entrada sem senha por código de e-mail; Meu currículo;
  candidaturas com linha do tempo real; conversa com alerta de golpe; salvas; alertas; Eu (privacidade, dados). Leitura do currículo no navegador
  (pdf.js 3.11.174 e mammoth 1.6.0 do cdnjs, sob demanda, com SRI); descarta nascimento, idade, estado civil, CPF e RG.
- **Empresa** (`vagas/empresas.html`, `vagas/js/v2/empresa/`): anúncio em 1 tela com 40 modelos por função; conta criada no fim (CNPJ consultado no servidor);
  vaga no ar na hora com selo "Empresa em verificação"; painel por etapas (Novos, Em conversa, Entrevista, Contratados, Não seguiu); chamar no WhatsApp
  (verificada) ou mandar mensagem (em verificação); marcar entrevista; duplicar; várias vagas; equipe; verificação (E13).
- **Banco** (migrações `20261101120000..03`): empresa nasce em verificação (7 dias, calculado na leitura, sem cron); as 3 travas de publicação saíram; limites
  (3 vagas no ar, 3 por dia, 2 denúncias derrubam, 20 liberações de WhatsApp por dia); filtro de texto contextual (banco e JS iguais); currículo em bucket
  privado; fila "Revisar depois"; funções só de servidor. Nada é apagado; produção segue vazia (sem seed novo).
- **Servidor** (migração `20261102120000` + função `vagas-conta`): código de 6 números por e-mail, consulta de CNPJ, criar empresa, links assinados de arquivo.
- **Visual**: cor de ação laranja queimado `#C2410C` (decisão 7B), contrastes conferidos nos dois temas (cabeçalho de `vagas/assets/v2/sistema.css`);
  erro em carmim com ícone e palavra; vidro só em barras e folhas; chave "Efeitos"; `prefers-reduced-motion`.
- **Escondido sem apagar** (6A): Quero/Pular, Combinou, cartão cego, testes e selo, referências, banco de talentos, compras. `testes.html`, `selo.html`
  e `referencia.html` continuam no repositório, sem link nas telas novas.
- **Redirecionadores**: `cidade.html`, `vaga.html`, `eu.html`, `emprego.html`, `empresa.html` levam às telas novas; link curto `/v/<código>` vai para `/#/vaga/<código>`.
  `entrar.html` (e-mail e senha) NÃO é redirecionador: segue só para a equipe/operador e contas antigas.

## 2. Ordem para publicar (só depois do ok do dono)

1. Conferir o ramo e juntar no `main`.
2. Migrações, nesta ordem (a integração do GitHub do Supabase aplica na ordem do nome): `20261101120000_vagas_v2_base`, `..120001_vagas_v2_pessoa`,
   `..120002_vagas_v2_empresa`, `..120003_vagas_v2_equipe`, `20261102120000_vagas_v2_codigos`. Antes delas já devem estar `20261024120005` e `20261027120000`.
   Depois, `versao_banco()` deve devolver `20261101120003` (a migração dos códigos não mexe nessa função).
3. Publicar a Edge Function `vagas-conta` (arquivo gerado por `npm run montar:funcoes`) e cadastrar os segredos (só nomes): `RESEND_API_KEY`,
   `VAGAS_EMAIL_REMETENTE` (domínio verificado; sem ele o código só chega ao dono da conta do Resend) e `VAGAS_SITE_URL`.
4. `vagas/js/config.js`: preencher `WHATSAPP_AJUDA` e `EMAIL_AJUDA` quando existirem (vazios, as telas mostram o texto de contingência). `MODO` já é `supabase`.
5. **VPS (nginx)**: repetir a CSP canônica e os cabeçalhos do `vagas/_headers`, o redirecionamento `/v/<código>` e o cache (modelo pronto em
   `vagas-v2-servidor.md`, §6). A CSP agora libera `cdnjs.cloudflare.com` (pdf.js e mammoth) em script, worker e connect. Quem roda é o dono.
6. Teste de fumaça com um e-mail de teste: pedir código, entrar, candidatar-se com um PDF, anunciar uma vaga com um CNPJ de verdade, ver o painel.
7. No lançamento, tirar o `noindex` de `index.html` e `empresas.html` (hoje ficam fora do Google até o dono liberar) e conferir os textos legais.
8. Aplicação do Supabase Auth: o código usa link mágico trocado dentro da função; não precisa de URL de redirecionamento nova.

## 3. O que o dono ainda precisa fazer

- Número único de WhatsApp da Gestão sem Caos (`WHATSAPP_AJUDA`) e e-mail de ajuda (`EMAIL_AJUDA`). Não foi inventado nenhum.
- **WhatsApp como canal do código (Marcelo, via API do WAHA)**: decisão do dono de 25/11: hoje o código sai SÓ por e-mail. O ponto de encaixe é a função
  isolada `enviarCodigoWhatsappVagas` (`supabase/funcoes-compartilhadas/vagas-conta.js`), atrás de `VAGAS_CANAL_WHATSAPP=ligado` e de `CANAL_WHATSAPP` no `config.js`.
  Falta: endereço, chave e sessão do WAHA (variáveis `VAGAS_WHATSAPP_PROVEDOR_*`), e o login por telefone (usuário do Auth por telefone).
  Enquanto isso, **pessoa sem e-mail não entra** (alternativa: cadastro assistido, que também pede e-mail).
- Encarregado(a) de dados e advogado(a): termos e aviso de privacidade foram ajustados como MINUTA (`conteudo/vagas-textos/`, ainda com os marcadores
  `[REVISÃO JURÍDICA]` e campos `[a preencher]`). Itens para o(a) advogado(a): 1A (nome, currículo e WhatsApp juntos para empresa verificada, art. 7º, V),
  LGPD do currículo anexado e prazos de guarda, responsabilidade por vaga publicada antes da verificação, texto do selo, CNPJ público, fornecedor da leitura.
- Remetente de e-mail com domínio verificado no Resend, DNS e certificado do domínio (como no S2).
- Decidir quando tirar o `noindex`.

## 4. Testes (no MacBook Pro)

- `npm test`: **1241 passam, 0 falham** (inclui as checagens `montar-*`).
- Banco (Postgres embutido, `npm run test:supabase`): **276 passam, 1 falha**. A falha é de `vagas_onda2` ("fuso: os testes de habilidade...") e já falhava
  no commit-base: depende da hora do dia. Os testes novos do banco (`vagas_v2*.test.js`, `vagas_codigos_v2.test.js`) passam.
- E2E Playwright: pessoa 23, empresa 15, operação 11 e painel do DISC/vagas passam (58 no total nas 4 specs). Rodar no Pro com poucos workers (vários navegadores juntos derrubam o ssh).
- Os testes antigos das telas trocadas foram ajustados ou removidos (e2e de lista, entrar, eu, testes, divulgação e cadastro antigos; testes de página das vendas antigas).
  A operação (`vagas-operador.spec.js`) agora abre com `?previa=1` (já dependia da prévia antes de esta rodada).
- Capturas 390x844 e 1280x800, claro e escuro, sem rolagem lateral e sem erro de console, foram vistas pelos construtores (fora do repositório).
- NÃO testado contra Supabase real nem com Resend real. As telas rodam em modo prévia nos testes; banco e função têm testes próprios; a ligação
  tela ↔ banco é garantida só pelo contrato (`VSC_CONTRATO.validar` nos dois lados).

## 5. O que ficou para depois

- Tela da equipe para a fila "Revisar depois" e "Seguradas" (o banco já tem `opRevisarDepois`, `opRevisarDecidir`, `opAvisarCandidatos`; `operador.html` não mudou).
- `entrar.html` (senha) deveria virar "Entrada da equipe" (esconder "criar conta"); hoje fica só sem link nas telas novas.
- Exportar e apagar dados v2 (`experiencias_v2`, arquivo do currículo): as funções antigas podem não cobrir; falta RPC v2. Falta também link assinado para a
  pessoa rever o PRÓPRIO arquivo.
- Aceitar convite de equipe pela tela nova (existe tentativa pelo método antigo, não testada); o convite não envia e-mail, só link copiável.
- Filtro "meio período", alerta com frequência, "minha cidade não está aqui" e anotações do candidato saíram por falta de campo no banco.
- Marcação JobPosting, site instalável, aviso de candidatura 30 dias, testes e referências de volta sem nota, destaque pago (proposta §7 DEPOIS).
- Lista de espera antiga: há função de migração de inscritos para alertas (`vagas_v2_migrar_lista_espera_servidor`), não executada.
- Limitações conhecidas: pessoa nova sem internet na hora de enviar não consegue criar a conta (fica o rascunho); diária só para os próximos 7 dias.
