/*
 * Vagas sem Caos v2 · TELAS DA PESSOA · fila de candidaturas sem internet. A candidatura (dados, respostas e, se houver, o arquivo)
 * fica no aparelho ('vsc.eu.fila' + IndexedDB 'vsc-eu-fila') e sai quando a rede voltar. É idempotente: cada item leva um idLocal, e o
 * banco devolve a mesma candidatura se o envio repetir. Sai do aparelho junto com os outros dados pessoais ao sair da conta.
 */
(function (root) {
  'use strict';
  const P = root.VSC_P, E = P.est;
  const CHAVE = 'fila', BD = 'vsc-eu-fila';
  let enviando = false;

  const bd = () => new Promise((ok, no) => {
    if (!root.indexedDB) { no(new Error('sem IndexedDB')); return; }
    const r = root.indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('arq');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  const guardarArq = (id, f) => bd().then((db) => new Promise((ok, no) => { const t = db.transaction('arq', 'readwrite'); t.objectStore('arq').put(f, id); t.oncomplete = () => ok(); t.onerror = () => no(t.error); })).catch(() => null);
  const lerArq = (id) => bd().then((db) => new Promise((ok) => { const q = db.transaction('arq').objectStore('arq').get(id); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); })).catch(() => null);
  const apagarArq = (id) => bd().then((db) => new Promise((ok) => { const t = db.transaction('arq', 'readwrite'); t.objectStore('arq').delete(id); t.oncomplete = () => ok(); t.onerror = () => ok(); })).catch(() => null);

  const lista = () => { const l = P.eu.ler(CHAVE, []); return Array.isArray(l) ? l : []; };
  const F = P.fila = {
    pendentes: lista,
    async adicionar(envio, arquivo, titulo) {
      const item = { idLocal: envio.idLocal, vagaId: envio.vagaId, caminho: envio.caminho, respostas: envio.respostas, dados: envio.dados || null, titulo: titulo || '', ts: new Date().toISOString(), arquivo: !!arquivo };
      if (arquivo) await guardarArq(item.idLocal, arquivo);
      P.eu.guardar(CHAVE, lista().filter((x) => x.idLocal !== item.idLocal).concat([item]));
      E.offline = true;
    },
    async limparTudo() {
      E.offline = false;
      const l = lista();
      P.eu.guardar(CHAVE, null);
      await Promise.all(l.map((x) => apagarArq(x.idLocal)));
      try { if (root.indexedDB) root.indexedDB.deleteDatabase(BD); } catch (e) { /* sem banco local */ }
    },
    // manda as candidaturas guardadas, uma por vez; para na primeira falta de rede
    async enviarPendentes() {
      if (enviando || !E.conta) return;
      const l = lista();
      if (!l.length) { E.offline = false; return; }
      enviando = true;
      let enviadas = 0;
      try {
        for (const item of l) {
          try {
            if (item.arquivo) { const f = await lerArq(item.idLocal); if (f) await P.api('curriculoEnviar', { arquivo: f }); }
            await P.api('candidatar', { vagaId: item.vagaId, caminho: item.caminho, respostas: item.respostas, dados: item.dados || undefined, idLocal: item.idLocal });
            enviadas++;
          } catch (e) {
            if (P.semRede(e)) { E.offline = true; break; }
            P.toast('Não foi possível enviar sua candidatura' + (item.titulo ? ' para ' + item.titulo : '') + ': ' + P.msgErro(e), null, 'erro');
          }
          P.eu.guardar(CHAVE, lista().filter((x) => x.idLocal !== item.idLocal));
          await apagarArq(item.idLocal);
        }
      } finally { enviando = false; }
      if (!lista().length) E.offline = false;
      if (enviadas) {
        await Promise.all([P.carregarConta().catch(() => null), P.carregarCands().catch(() => null)]);
        P.toast(enviadas === 1 ? 'Internet de volta. Sua candidatura foi enviada.' : 'Internet de volta. Suas candidaturas foram enviadas.');
      }
      P.pintarContadores();
      if (P.redesenhar) P.redesenhar();
    }
  };
  // candidaturas à espera, para aparecer na lista como "Esperando internet"
  P.filaComoCands = () => lista().map((x) => ({ id: 'fila-' + x.idLocal, vagaId: x.vagaId, etapa: 'nova', criadaEm: x.ts, offline: true, marcos: { enviada: x.ts }, respostas: x.respostas, naoLidas: 0, whatsappLiberado: false, forma: x.caminho }));
  root.addEventListener('online', () => { F.enviarPendentes(); });
  root.addEventListener('offline', () => { if (lista().length) { E.offline = true; if (P.redesenhar) P.redesenhar(); } });
})(typeof self !== 'undefined' ? self : this);
