/*
 * GERADO por scripts/montar-vagas.mjs a partir de conteudo/vagas-textos/avisos.json. NÃO EDITE AQUI: edite a origem e rode
 * "node scripts/montar-vagas.mjs" (o npm test confere que está em dia).
 *
 * VAGAS_TEXTOS: textos fixos das telas, por chave estável (avisos.* das telas sem conta, botoes.*, validacao.*).
 *   VAGAS_TEXTOS.t('avisos.cidade_pausada', {cidade: '…'}) -> texto com {{variáveis}} preenchidas ('' se a chave não existe).
 * Os outros avisos.*, anuncio.*, referencia.*, mensagem.*, foto.*, consentimentos.* e moderacao.* ficam em textos-conta.js (carregue
 * depois deste nas telas que usam).
 */
(function (root) {
  'use strict';
  var DADOS = {
 "versao": "2026-10-13",
 "avisos": {
  "nunca_pague": "Nunca pague para se candidatar. Se alguém pedir em nosso nome, é golpe.",
  "selo_sem_selo": "Ainda sem selo neste teste. A empresa não fica sabendo.",
  "selo_supervisao": "online, sem supervisão",
  "selo_nao_e_psicologico": "Os testes são de conhecimento prático da função, feitos online, sem supervisão. O teste mede o que você sabe hoje do básico da função; não mede inteligência nem personalidade.",
  "selo_empresa": "Selo: teste de conhecimento prático da função, feito online, sem supervisão. Mostra teste, data, nota com margem e código. Não confere identidade e não substitui a entrevista.",
  "selo_conferir_empresa": "Para quem contrata: a nota tem margem de cerca de 10 pontos, para mais ou para menos, e não serve para ordenar pessoas. Sem selo não quer dizer que a pessoa não sabe: o teste é opcional. A decisão de contratar continua sendo sua.",
  "selo_conferir": "Confira um selo pelo código em vagas.gestaosemcaos.com.br/selo/{{codigo}}.",
  "teste_antes": "Faça sozinho(a), sem consultar. O teste mede o que você sabe hoje do básico da função; não mede inteligência nem personalidade.",
  "teste_opcional": "O teste é opcional: você pode se candidatar sem ele. Se não for bem, a empresa não fica sabendo: ela só vê o selo, se você ganhar.",
  "teste_reconectando": "Reconectando… sua tentativa está salva.",
  "cidade_lista_espera": "O Vagas sem Caos ainda não chegou em {{cidade}}. Deixe seu e-mail e avisamos quando abrir. {{total}} pessoas já estão na lista.",
  "cidade_lista_espera_ok": "Pronto! Avisamos por e-mail quando {{cidade}} abrir.",
  "cidade_pausada": "O mural de {{cidade}} está pausado por enquanto. Suas candidaturas e seus selos continuam guardados. Avisamos por e-mail quando voltar.",
  "sem_internet": "Sem internet agora. O que você fez ficou salvo neste aparelho e é enviado quando a conexão voltar.",
  "erro_generico": "Algo deu errado do nosso lado. Tente de novo em instantes. Se continuar, fale com a gente.",
  "conta_suspensa": "Sua conta está suspensa. O motivo está no e-mail que enviamos. Se discordar, responda esse e-mail em até 30 dias: uma pessoa da equipe revisa. Você continua podendo baixar uma cópia dos seus dados ou apagar a conta.",
  "denuncia_ok": "Denúncia recebida. Ela é confidencial: não mostramos a quem foi denunciado quem denunciou. Decidimos em até 24 horas.",
  "referencia_cartao_cego_empresa": "Referência de empresa verificada: {{quantidade}}. O nome da empresa, os pontos fortes e o texto aparecem depois do Combinou.",
  "selo_nota": "Nota {{nota}} de 100 (15 questões; margem de cerca de ±{{margem}} pontos)",
  "selo_sem_selo_competencias": "Onde você acertou menos: {{competencias}}.",
  "denuncia_titulo": "Denunciar",
  "denuncia_texto": "O que está errado? A denúncia é confidencial: não mostramos a quem foi denunciado quem denunciou.",
  "teste_encerrar_conta": "Se você encerrar antes do fim, a tentativa conta: este teste só pode ser feito de novo em 30 dias.",
  "cidade_lista_espera_vazia": "O Vagas sem Caos ainda não chegou em {{cidade}}. Entre na lista e avisamos quando chegar."
 },
 "botoes": {
  "quero": "Quero",
  "pular": "Pular",
  "quero_conversar": "Quero conversar",
  "agora_nao": "Agora não",
  "ver_empresa": "Ver quem é a empresa",
  "liberar_contato": "Liberar meu contato",
  "retirar": "Retirar candidatura",
  "marcar_contratada": "Marcar como contratada",
  "abrir_contato": "Ver contato",
  "whatsapp": "Chamar no WhatsApp",
  "copiar_mensagem": "Copiar mensagem",
  "compartilhar": "Compartilhar no WhatsApp",
  "copiar_boletim": "Copiar boletim do dia",
  "denunciar": "Denunciar",
  "fazer_teste": "Fazer o teste",
  "refazer_teste": "Refazer o teste",
  "entrar_banco": "Entrar no banco de talentos",
  "sair_banco": "Sair do banco de talentos",
  "renovar_banco": "Renovar por 6 meses",
  "exportar": "Baixar meus dados",
  "excluir": "Apagar minha conta",
  "publicar": "Publicar vaga",
  "pausar": "Pausar",
  "retomar": "Retomar",
  "encerrar": "Encerrar vaga",
  "renovar": "Renovar por 30 dias",
  "lista_espera": "Me avise quando abrir",
  "entrar": "Entrar",
  "criar_conta": "Criar conta grátis",
  "esqueci_senha": "Esqueci minha senha",
  "reenviar_email": "Reenviar e-mail",
  "voltar": "Voltar",
  "continuar": "Continuar",
  "salvar": "Salvar",
  "cancelar": "Cancelar",
  "tentar_de_novo": "Tentar de novo",
  "referencia_dar": "Dar referência",
  "referencia_pedir": "Pedir referência",
  "referencia_aceitar": "Aceitar e publicar",
  "referencia_recusar": "Recusar",
  "referencia_ocultar": "Ocultar",
  "referencia_mostrar": "Mostrar de novo",
  "referencia_excluir": "Excluir referência",
  "referencia_enviar": "Enviar referência",
  "perfil_publico_ligar": "Tornar meu perfil público",
  "perfil_publico_desligar": "Desligar perfil público",
  "foto_enviar": "Enviar foto (opcional)",
  "foto_remover": "Remover foto",
  "foto_trocar": "Trocar foto",
  "roteiro_entrevista": "Roteiro de entrevista (20–30 min)"
 },
 "validacao": {
  "email_invalido": "Escreva um e-mail válido, por exemplo nome@exemplo.com.",
  "senha_curta": "A senha precisa ter pelo menos 8 caracteres.",
  "senha_diferente": "As senhas não são iguais.",
  "nome_obrigatorio": "Escreva o seu nome como quer ser chamada(o).",
  "whatsapp_invalido": "Escreva o WhatsApp com DDD e o número do celular, só os números (11 dígitos).",
  "cidade_obrigatoria": "Escolha pelo menos uma cidade.",
  "cidade_maximo": "Você pode escolher até 2 cidades.",
  "zona_obrigatoria": "Escolha a zona onde você mora ou pode trabalhar.",
  "maior_18_obrigatorio": "Só maiores de 18 anos podem usar o Vagas sem Caos.",
  "termos_obrigatorio": "Para continuar, aceite os Termos de uso e o Aviso de privacidade.",
  "cnpj_invalido": "Confira o CNPJ: ele tem 14 números.",
  "cnpj_ja_cadastrado": "Esse CNPJ já tem conta. Peça à pessoa responsável para convidar você.",
  "experiencia_periodo": "Confira as datas: o fim não pode vir antes do início.",
  "pretensao_invalida": "Escreva a pretensão em reais, só números.",
  "texto_longo": "O texto passou do limite de {{maximo}} letras.",
  "limite_candidaturas": "Você chegou ao limite de {{limite}} candidaturas ativas. Retire alguma para enviar outra.",
  "limite_envios": "Muitas tentativas em pouco tempo. Espere {{minutos}} minutos e tente de novo.",
  "captcha": "Confirme que você não é um robô.",
  "foto_formato": "A foto precisa ser JPG, PNG ou WEBP, com até 1 MB.",
  "foto_tamanho": "A foto passou de 1 MB. Tente uma menor.",
  "login_invalido": "E-mail ou senha não conferem."
 }
};
  function buscar(caminho) {
    var atual = DADOS;
    var partes = String(caminho || '').split('.');
    for (var i = 0; i < partes.length; i++) {
      if (!atual || typeof atual !== 'object' || !Object.prototype.hasOwnProperty.call(atual, partes[i])) return undefined;
      atual = atual[partes[i]];
    }
    return atual;
  }
  // Texto com {{variavel}} preenchida pelo valor de vars (variável sem valor some, nunca aparece "{{…}}" na tela).
  function t(caminho, vars) {
    var v = buscar(caminho);
    if (typeof v !== 'string') return '';
    return v.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, function (_, k) { return vars && vars[k] != null ? String(vars[k]) : ''; });
  }
  DADOS.t = t;
  DADOS.buscar = buscar;
  if (typeof module !== 'undefined' && module.exports) module.exports = DADOS;
  else root.VAGAS_TEXTOS = DADOS;
})(typeof self !== 'undefined' ? self : this);
