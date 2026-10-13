# Vagas sem Caos: textos (termos, privacidade, aceites, avisos, e-mails, WhatsApp, moderação)

Tudo em `conteudo/vagas-textos/`. Português simples, frases curtas, linguagem neutra ("a pessoa", "quem se candidata"),
marca "Gestão sem Caos" (assinatura "uma ferramenta da Gestão sem Caos"). Nunca: nome de agência, nome de app de namoro,
"swipe", promessa ("garante", "perfil ideal", "compatibilidade", "o teste prevê desempenho"), "aprovado/reprovado" em selo,
"DiSC" (sempre "DISC"), "candidato(a)" como substantivo. O teste `tests/vagas-textos.test.js` confere tudo isso e
entra no `npm test` (glob `tests/*.test.js`).

Versão de todos os textos: **2026-10-13** (`termos_versao` da conta; `vagas_aceitar_termos({versao})`). Mudou um texto
publicado? Crie uma versão nova (data), nunca edite a versão que alguém já aceitou.

## 1. Índice

| Arquivo | O que é | Quem usa | Estado |
|---|---|---|---|
| `termos-de-uso.md` | Termos para pessoa, empresa e operador (17 seções) + resumo de 10 linhas para a tela | tela `termos.html` do vagas/, aceite `pessoa_cadastro` e `empresa_cadastro` | MINUTA, advogado(a) |
| `aviso-de-privacidade.md` | LGPD: controladora, bases legais, dados exatos (e o que NÃO coletamos), quem vê o quê, retenção, direitos na tela "Meus dados", compartilhamento, menores, encarregado(a) + resumo de 10 linhas | tela `privacidade.html` | MINUTA, advogado(a); encarregado(a) a preencher |
| `consentimentos.json` | 15 aceites versionados: `chave`, `versao`, `quem`, `quando`, `titulo`, `texto` (rótulo da caixa), `explicacao`, `obrigatorio`, `base_legal`, `prazo_dias`, `variaveis`, `lembrete_curto` | fundacao: `vagas_consentimentos`, `vagas_aceitar_termos`; design: caixas de aceite | MINUTA |
| `avisos.json` | Microtextos: `avisos.*` (anti-golpe, cartão cego, confidencial, `combinou_*`, `selo_*`, `bico_*`, cidade, erros), `botoes.*`, `anuncio.termos_proibidos[]` + `anuncio.bloqueios[]` + `anuncio.campos.*`, `mensagem.*` (bloqueios na conversa + regex), `validacao.*` | design (todas as telas), fundacao (`regras.js`, RPCs), testes | pronto; `_revisao_psicologia` lista o que vai ao parecer |
| `moderacao.json` | 31 motivos padrão (`alvo` anuncio/empresa/mensagem/denuncia; `acao`; `texto_empresa`; `correcao`; `lei`) | operacao e fundacao (`p_motivo` das RPCs `vagas_op_*`); e-mail `vaga-recusada` | MINUTA |
| `whatsapp.json` | 16 mensagens prontas (`uso` wa_me ou copiar, `variaveis`), aviso anti-golpe onde cabe | design (botões), operacao (boletim, mutirão) | pronto |
| `emails/*.html` + `emails/indice.json` | 17 e-mails na moldura da marca (tabela, logo PNG, faixa e botão laranja, sem endereço comprido); índice com assunto, quando é enviado e variáveis `{{ }}` | fundacao (Edge Function `vagas-conta` + Resend) | pronto; `seu-selo` marcado para a psicologia |

### Chaves principais (contrato com os outros agentes)

- `avisos.nunca_pague` = "Nunca pague para se candidatar. Se alguém pedir em nosso nome, é golpe." (texto exato; aparece no rodapé de toda tela da pessoa e nos e-mails dela).
- `avisos.cartao_cego`, `avisos.cartao_cego_empresa`, `avisos.empresa_confidencial`, `avisos.combinou_convite`, `avisos.combinou_convite_confidencial`, `avisos.combinou_revelada`, `avisos.combinou_pessoa`, `avisos.combinou_empresa`.
- `avisos.selo_descricao`, `selo_emitido`, `selo_sem_selo`, `selo_supervisao` ("online, sem supervisão"), `selo_empresa`, `selo_filtro_empresa`.
- `avisos.bico_mural`, `bico_contratante`, `bico_diarista`, `bico_valor_obrigatorio`, `bico_para_hoje`.
- `avisos.cidade_lista_espera`, `cidade_pausada`, `sem_internet`, `erro_generico`, `sessao_expirada`, `confirme_email`, `conta_suspensa`.
- `botoes.quero` / `pular` / `quero_conversar` / `agora_nao` / `ver_empresa` / `liberar_contato` / `denunciar` / `copiar_boletim`.
- `anuncio.termos_proibidos[].{chave, termos[], padroes[]?, explicacao}`: termos sem acento e minúsculos, comparados como **palavra inteira**; `padroes` são regex (sem acento). `anuncio.bloqueios[].{chave, padrao, explicacao}`: telefone, link encurtado, e-mail, DISC/teste psicológico.
- `mensagem.padroes.{dinheiro, documento, link}` (regex) e `mensagem.bloqueada_{dinheiro, documento, link, generica}`: a RPC `vagas_mensagem_enviar` devolve `{ok:false, erro: <bloqueada_*>, bloqueio:'dinheiro'|'documento'|'link'}`.
- Aceites: `pessoa_cadastro`, `pessoa_novidades` (opcional), `pessoa_candidatura` (+ `lembrete_curto`), `pessoa_banco_talentos` (opcional, 180 dias), `pessoa_combinou_contato` (`{{empresa_nome}}`), `pessoa_cadastro_assistido`, `empresa_cadastro`, `empresa_vaga_confidencial`, `empresa_diaria_domestica`, `operador_contrato`.
- Moderação: `anuncio_discriminatorio`, `anuncio_sem_valor`, `anuncio_cobranca`, `anuncio_contato_fora`, `anuncio_falso`, `anuncio_fora_do_tema`, `anuncio_teste_psicologico`, `anuncio_diaria_irregular`, `anuncio_denuncias`, `anuncio_ok_apos_revisao`, `empresa_cnpj_nao_confere`, `empresa_sem_representacao`, `empresa_suspensa_{golpe, discriminacao, retaliacao}`, `empresa_dados_fora_da_finalidade`, `empresa_reativada`, `mensagem_pedido_{dinheiro, documento}`, `mensagem_assedio`, `denuncia_{improcedente, procedente}`.
- **Referência profissional** (acréscimo do dono, 13/10; marcado `[REVISÃO JURÍDICA]`): aceites `pessoa_referencia_aceitar` (`{{empresa_nome}}`, `{{total}}`), `pessoa_referencia_pedir`, `pessoa_perfil_publico` (opcional), `empresa_referencia_declaracao` (`{{limite_mes}}`; texto começa com "Declaro que a pessoa trabalhou nesta empresa no período informado"); `avisos.referencia_*` (`o_que_e`, `so_se_aceitar`, `publica`, `cartao_cego`, `cartao_cego_empresa`, `recebida`, `aceita`, `recusada`, `ocultada`, `excluida`, `pedir`, `pedido_enviado`, `pedido_recebido`, `empresa_*`, `texto_regras`, `sem_ranking`); `botoes.referencia_*`, `botoes.perfil_publico_*`; `referencia.pontos_fortes[]` (10 comportamentos observáveis, `[REVISÃO PSICOLOGIA]`), `referencia.vinculos`, `referencia.validacao.*`; moderação `referencia_{dado_sensivel, discriminatoria, contato, negativa, periodo_improvavel, denunciada, ok}` (alvo `referencia`); WhatsApp `pessoa_pedir_referencia`, `empresa_avisar_referencia`; e-mails `referencia-recebida` (pessoa), `referencia-pedido` (empresa), `referencia-decidida` (empresa); termos §6.3; privacidade §2.1, §3, §4, §5, §6.
- **Pedidos da operação** (mesa, 13/10): `avisos.golpe_vaga_fora_do_ar`, `avisos.denuncia_resposta_golpe` (= moderação `denuncia_golpe_confirmado`), `avisos.vaga_pausada_pessoa`, `vaga_encerrada_pessoa`, `vaga_interessados_lembrete`, `incidente_dados_resumo`, `referencia_mutirao` (frase da mesa do mutirão); WhatsApp `alerta_golpe_canal`; aceite `voluntario_mutirao_sigilo` (termo de sigilo do voluntário, `[REVISÃO JURÍDICA]`); moderação `referencia_limite` e `frase_curta` (1 frase) em todos os motivos de referência; e-mails `vaga-interessados-lembrete` (empresa), `vaga-pausada` (pessoa), `incidente-de-dados` (modelo LGPD art. 48, `[REVISÃO JURÍDICA]`). Boletim, posts, rádio e script de venda continuam como modelos em `conteudo/vagas-operacao/` (texto de marketing, não de plataforma); o boletim de plataforma é `whatsapp.boletim_do_dia`.
- E-mails (`emails/indice.json`): `confirmar-cadastro`, `cadastro-assistido`, `redefinir-senha`, `empresa-quer-conversar`, `combinou`, `combinou-empresa`, `vaga-aprovada`, `vaga-recusada`, `nova-candidatura` (resumo diário), `vaga-interessados-lembrete`, `vaga-pausada`, `seu-selo`, `referencia-recebida`, `referencia-pedido`, `referencia-decidida`, `incidente-de-dados`, `conta-sera-apagada`. Variáveis: `{{nome}}`, `{{email}}`, `{{link}}`, `{{empresa_nome}}`, `{{vaga_titulo}}`, `{{responsavel_nome}}`, `{{pessoa_nome}}`, `{{link_curto}}`, `{{motivo_titulo}}`, `{{motivo_texto}}`, `{{correcao}}`, `{{total}}`, `{{resumo}}`, `{{teste_nome}}`, `{{nota}}`, `{{data}}`, `{{codigo}}`, `{{valido_ate}}`, `{{data_exclusao}}`, `{{cidade}}`. Quem envia substitui cada `{{x}}` pelo valor **já escapado para HTML** (`escaparHtml` de `supabase/funcoes-compartilhadas/email.js`); `{{resumo}}` e `{{motivo_texto}}` podem conter `<br>`. O logo é o PNG de `assets/marca/gsc-logo-email.png` servido por `disc.gestaosemcaos.com.br` (trocar para `vagas.` quando o site estiver no ar).

## 2. Decisões de redação e jurídicas

| Decisão | Por quê | Fonte |
|---|---|---|
| A plataforma é **mural**, não agência nem intermediadora; contrato direto entre as partes; não fornece temporário | tira a plataforma do regime de agência de emprego e de trabalho temporário | Lei 6.019/1974; `cidade-pequena.md` §4 |
| **Concorrer é grátis para sempre**, em todos os textos e e-mails da pessoa; extras futuros só com parecer, avulsos, pagos antes, sem renovação, nunca exigidos por vaga | cobrança de quem procura emprego já foi declarada ilícita; mercado de golpe "taxa do processo" | TRT-4, 5ª Turma (2025, ação do MPT); Convenção 181 OIT art. 7º (subsidiária); `proposta.md` §6 |
| Pagos antes, sem renovação automática, devolução em 7 dias se não usado | principal queixa contra concorrentes; CDC | CDC art. 49; `monetizacao.md` |
| **Vaga confidencial**: só CNPJ conferido; nome aparece quando a pessoa aceita conversar, antes de liberar o contato dela | acréscimo aprovado pelo dono (mesa) | mesa de equipe |
| **Mensagens** pela plataforma com bloqueio de dinheiro/Pix/documento/link e registro; leitura só para denúncia ou ordem legal | golpe e assédio; LGPD necessidade | LGPD art. 6º, III; Marco Civil art. 15 |
| **Anúncio discriminatório** recusado com explicação por termo; exame de gravidez é crime | lista `termos_proibidos` | Lei 9.029/1995 arts. 1º e 2º; CLT art. 373-A, I; Lei 13.146/2015; STF ADO 26 (orientação sexual) |
| **Bicos**: mural, sem preço, escala ou punição fixados, sem comissão nem pagamento pela plataforma; aviso LC 150 ao contratante de diarista | vínculo e trabalho temporário | CLT arts. 3º e 9º; LC 150/2015 art. 1º; Lei 6.019/1974 |
| **DISC fora da seleção**; anúncio que pede teste psicológico é recusado; o Mapa DISC só depois da contratação | técnica psicológica em seleção é privativa de psicólogo(a); DISC sem parecer SATEPSI | Lei 4.119/1962 art. 13 §1º; Resolução CFP 31/2022; `docs/painel-cientifico/decisao.md` |
| **Testes e selo** descritos só como "conhecimento prático da função, feito online, sem supervisão"; nunca "aprovado", capacidade, potencial, perfil; selo não confere identidade nem substitui entrevista; sem nota mínima nem ordem por nota | padrão do agente psicologia (mesa); testes de conhecimento do trabalho e amostra de trabalho têm validade de conteúdo ligada à análise da função, o que não autoriza frases sobre "capacidade" da pessoa | Schmidt & Hunter (1998), *Psychological Bulletin*, 124(2), 262–274; Sackett, Zhang, Berry & Lievens (2022), *Journal of Applied Psychology*, 107(11), 2040–2068 (reanálise, estimativas menores); trechos marcados `[REVISÃO PSICOLOGIA]` |
| **Sem ranking**: cartões por ordem de chegada; quem decide é uma pessoa | decisão automatizada | LGPD art. 20 |
| **Referência profissional**: só empresa verificada, com nome; só recomendação (sem negativa, nota, estrela, média); só aparece com o aceite da pessoa, que oculta/exclui sem motivo; no cartão cego só contagem + pontos fortes; empresa declara veracidade; proibida "lista" de não recomendados; pontos fortes como comportamentos observáveis | acréscimo do dono (mesa); referência negativa pública = dano moral e lista discriminatória; dado de terceiro exige consentimento para publicar | LGPD art. 7º, I e 8º; Código Civil arts. 186 e 927; Constituição art. 5º, X; Lei 9.029/1995; `[REVISÃO JURÍDICA]` e `[REVISÃO PSICOLOGIA]` |
| **LGPD**: controladora Gestão sem Caos; operador local = operador de dados sem acesso a currículo/contato; empresa = controladora do que recebe, só para a vaga | guia da ANPD (quem decide finalidade) | LGPD arts. 7º, 8º, 39, 42 §1º; guia orientativo ANPD (agentes de tratamento) |
| Base legal da **candidatura** = art. 7º, V (sem consentimento por vaga); **banco de talentos** = consentimento específico, 180 dias, revogável; antifraude = legítimo interesse + exercício de direitos; registros = obrigação legal | | LGPD art. 7º, I, II, V, VI, IX; art. 8º; art. 16 |
| **Retenção**: conta parada 24 meses (aviso 30 dias antes), candidatura visível 90 dias após encerrar a vaga, conversas 12 meses, registros de acesso 6 meses, moderação e aceites 5 anos, compras 5 anos | lei não fixa prazo para currículo; prática 12–24 meses | LGPD art. 15 e 16; Marco Civil art. 15; `cidade-pequena.md` §4 |
| **Campos que não existem**: idade (só "18+"), gênero, estado civil, filhos, gravidez, cor, religião, foto, nacionalidade, saúde, antecedentes, CPF/RG | discriminação e minimização | Lei 9.029/1995; LGPD art. 6º, III e art. 11 |
| **Só 18+**; cadastro assistido só vale com confirmação da própria pessoa; a empresa não digita dados de terceiros | aceite é do titular | LGPD art. 8º §§1º e 2º; art. 14 (menores: fora do MVP) |
| Foro de Boa Vista/RR, salvo foro do consumidor | | CDC art. 101, I |
| Transferência internacional (hospedagem) com cláusulas contratuais | | LGPD art. 33 |

## 3. O que o(a) advogado(a) precisa validar (lista objetiva)

1. **Termos §1**: a descrição "mural, não agência nem intermediadora" é suficiente para afastar a Lei 6.019/1974 e o regime de agência de emprego (Decreto 3.048/1999? Convenção 181)? Confirmar a redação.
2. **Termos §3.4 e §12**: extras pagos pela pessoa (Perfil em evidência, selo presencial avulso) podem existir um dia sem ferir a jurisprudência do TRT-4 (2025)? Parecer escrito antes de ativar (condição do `proposta.md` §4).
3. **Termos §9 e aceite `empresa_diaria_domestica`**: o aviso da LC 150/2015 e a ausência de preço/escala bastam para a plataforma não ser tomada como empregadora ou fornecedora de temporário? Revisar "pessoa física contratante" (fase 2) separadamente.
4. **Termos §10.5 e moderação**: comunicar suspeita de crime à polícia/MPT com registros de conversa: base legal e procedimento (Marco Civil art. 10 §§).
5. **Termos §12.4**: devolução em 7 dias (CDC art. 49) para empresa compradora: o CDC se aplica a empresa pequena/MEI nesse caso?
6. **Termos §15**: 15 dias de aviso de mudança e "quem continuar usando aceita": é suficiente? Precisa de novo aceite ativo?
7. **Privacidade §1**: razão social, CNPJ, endereço e **encarregado(a)** (placeholders). Decidir se o(a) encarregado(a) é pessoa interna ou serviço terceirizado.
8. **Privacidade §3**: bases legais por finalidade, especialmente (a) candidatura em art. 7º, V sem consentimento por vaga; (b) antifraude e leitura de mensagens em legítimo interesse (precisa de LIA documentado) e art. 7º, VI; (c) e-mails de serviço em execução de contrato.
9. **Privacidade §5**: todos os prazos de retenção são HIPÓTESES do redator; confirmar cada linha (sobretudo 24 meses para conta parada, 5 anos para moderação/aceites, 90 dias de candidatura pós-vaga).
10. **Privacidade §7**: Supabase, Resend, Cloudflare, Stripe, InfinitePay: confirmar a lista final, DPAs/cláusulas e transferência internacional (art. 33); redigir o aviso de transferência se exigido.
11. **Privacidade**: RIPD (relatório de impacto): este aviso cita? O `proposta.md` §6 prevê RIPD; produzir junto com o advogado.
12. **Consentimento `pessoa_combinou_contato`**: a liberação de nome/contato à empresa é "execução de contrato/procedimento preliminar" ou precisa ser consentimento? Confirmar a base e se o texto da caixa é suficiente como manifestação.
13. **Consentimento `empresa_cadastro`**: a declaração de representação e os compromissos (não discriminar, não retaliar, não repassar) valem como cláusula contratual da empresa? Prever penalidade?
14. **`operador_contrato`** (aceite na tela) × contrato de operador em papel (agente operacao): o aceite na tela deve apenas remeter ao contrato assinado? Alinhar com a minuta do parceiro.
15. **`anuncio.termos_proibidos`**: revisar a lista (sobretudo `nacionalidade`, `antecedentes`, `aparencia_fisica`) para não barrar exigência legítima e específica (ex.: certidão para funções previstas em lei; exigência física comprovadamente inerente à função).
16. **E-mail `conta-sera-apagada`**: um único aviso 30 dias antes basta? Precisa de segundo aviso?
17. **WhatsApp**: mensagens enviadas pelo próprio usuário (wa.me) e boletim copiado à mão: confirmar que não configuram comunicação de marketing que exija opt-in (consentimento `pessoa_novidades` cobre só e-mail).
18. **Cidade de fronteira (Pacaraima)**: textos em espanhol (fase 2) precisarão de revisão própria; não traduzir por conta.
19. **Referência profissional** (`[REVISÃO JURÍDICA]`, termos §6.3, privacidade §2.1/§3/§4/§5/§6, aceites `pessoa_referencia_aceitar` e `empresa_referencia_declaracao`, moderação `referencia_negativa`): (a) referência é dado de terceiro sobre a pessoa publicado com consentimento (art. 7º, I): a base e a redação do aceite bastam? (b) responsabilidade da empresa pela veracidade (Código Civil arts. 186 e 927) e a declaração na tela como prova; (c) proibição de referência negativa e de "lista" de pessoas (Constituição art. 5º, X; Lei 9.029/1995): confirmar as fontes e se a plataforma precisa de cláusula de indenização; (d) perfil público opcional: cabe aviso extra sobre indexação por buscadores? (e) retenção do registro da decisão (5 anos) após exclusão da referência.

## 4. O que o(a) psicólogo(a) precisa validar

- Os trechos marcados `[REVISÃO PSICOLOGIA]`: termos §4.1, §4.2, §6.1, §8.8; `avisos.json → _revisao_psicologia` (chaves `selo_*`, `teste_antes`, `disc_fora`, `anuncio.campos.selo_sugerido`, `anuncio.bloqueios.disc`); `moderacao.json → anuncio_teste_psicologico`; `emails/seu-selo.html`.
- Em particular: a frase "não mede personalidade, inteligência, caráter, potencial nem perfil" e "ele não mede quem você é nem o que você pode vir a aprender" (`selo_sem_selo`); o nome "selo" sem "de habilidade" (o `proposta.md` usa "habilidade testada": decidir se a palavra volta e com que ressalva).

## 5. Fontes legais citadas

- LGPD, Lei 13.709/2018: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm (arts. 6º, 7º, 8º, 11, 12, 14, 15, 16, 18, 20, 33, 39, 42, 48).
- Guia orientativo da ANPD sobre agentes de tratamento (controlador/operador): https://www.conjur.com.br/2022-jun-23/limae-salgado-guia-orientativo-20-anpd//?print=1
- Lei 9.029/1995 (práticas discriminatórias na relação de trabalho): https://planalto.gov.br/ccivil_03/leis/l9029.htm
- CLT (Decreto-Lei 5.452/1943), arts. 3º, 9º e 373-A: https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm
- Lei 6.019/1974 (trabalho temporário): https://blog.grupogen.com.br/juridico/2018/07/10/terceirizacao-ilicita-na-reforma-trabalhista/
- LC 150/2015 (trabalho doméstico), art. 1º: https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp150.htm
- Lei 4.119/1962 (profissão de psicólogo), art. 13 §1º: https://www2.camara.leg.br/legin/fed/lei/1960-1969/lei-4119-27-agosto-1962-353841-normaatualizada-pl.html
- Resolução CFP 31/2022 (avaliação psicológica / SATEPSI): https://site.cfp.org.br/nova-resolucao-do-cfp-destaca-diretrizes-para-a-avaliacao-psicologica/
- TRT-4, 5ª Turma (2025), ação do MPT, cobrança de quem procura emprego: https://www.lex.com.br/empresas-de-selecao-nao-podem-cobrar-taxas-de-candidatos-a-emprego-decide-5a-turma-do-trt-rs/ · https://jurinews.com.br/destaque-nacional/ofensa-a-dignidade-da-pessoa-humana-trt-4-decide-que-empresas-de-rh-nao-podem-cobrar-candidatos-por-entrevistas-de-emprego/
- TRT-4 (dano coletivo, acesso pago a vagas): https://www.trt4.jus.br/portais/trt4/modulos/noticias/439976
- Convenção 181 da OIT (art. 7º; Brasil não ratificou, fonte subsidiária): https://www2.camara.leg.br/atividade-legislativa/comissoes/comissoes-permanentes/cdhm/noticias/adesao-pelo-brasil-aos-normativos-da-oit · https://jus.com.br/artigos/30294/agencias-de-emprego
- Vínculo em plataformas (subordinação algorítmica): https://www.galiciaeducacao.com.br/blog/subordinacao-algoritmica-o-vinculo-de-emprego-em-debate/
- Marco Civil da Internet, Lei 12.965/2014, arts. 10 e 15; CDC, Lei 8.078/1990, arts. 49 e 101; Lei 13.146/2015 (inclusão da pessoa com deficiência); Código Penal arts. 140, 147, 171, 216-A (citados sem link; conferir no Planalto).
- Golpes de vaga falsa (contexto do aviso anti-golpe): https://www.suno.com.br/noticias/golpe-do-emprego-segundos/
- Marcas "DiSC" da Wiley (por que escrever "DISC"): https://discprofile.com/blog/which-disc-is-disc
- Evidência sobre testes de conhecimento do trabalho e amostra de trabalho (base para descrever os testes como conhecimento prático, sem promessa): Schmidt, F. L., & Hunter, J. E. (1998). The validity and utility of selection methods in personnel psychology. *Psychological Bulletin*, 124(2), 262–274. Sackett, P. R., Zhang, C., Berry, C. M., & Lievens, F. (2022). Revisiting meta-analytic estimates of validity in personnel selection. *Journal of Applied Psychology*, 107(11), 2040–2068.

## 6. Como manter

- Texto novo: acrescente a chave no JSON, documente aqui e no teste. Não renomeie chave publicada.
- E-mail novo: mesma moldura (copie um existente), registre em `emails/indice.json` com assunto e variáveis; o teste exige que toda `{{variavel}}` esteja no índice e que os e-mails da pessoa tenham o `nunca_pague`.
- Rode `node --test tests/vagas-textos.test.js` (ou `npm test`).
