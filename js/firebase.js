// =====================================================================
//  firebase.js — conexão com o Firebase + todas as operações de dados.
//  As credenciais vêm de ../firebase-config.js (arquivo separado).
// =====================================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  initializeFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, collection, query, where,
  runTransaction, getDocFromServer, serverTimestamp, orderBy, limit, documentId,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserSessionPersistence,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import * as CFG from '../firebase-config.js';
// Tolerante: se o arquivo de configuração tiver só `firebaseConfig`, o sistema continua funcionando.
const firebaseConfig = CFG.firebaseConfig || {};
const appCheckSiteKey = CFG.appCheckSiteKey || '';
const usarEmulador = !!CFG.usarEmulador;
import * as C from './core.js';

export const configurado = !/^(COLE|COLOQUE)/i.test(String(firebaseConfig.apiKey)) && !/^(COLE|COLOQUE)/i.test(String(firebaseConfig.appId));

export const app = initializeApp(firebaseConfig);
// App Check precisa ser iniciado ANTES do Firestore/Auth, senão as primeiras requisições saem sem token
// (e seriam recusadas quando o "Aplicar/Enforce" estiver ligado).
if (appCheckSiteKey) {
  const { initializeAppCheck, ReCaptchaV3Provider } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js');
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
}
// Long-polling: funciona em redes, antivírus, proxies e bloqueadores de anúncio que derrubam o canal padrão (streaming) do Firestore.
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
export const auth = getAuth(app);

if (usarEmulador) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

/** Traduz erros do Firebase em orientação clara (para o painel e para o cidadão). */
export function explicarErro(e, publico = false) {
  const c = e && e.code;
  if (c === 'not-found') return publico
    ? 'O banco de dados do sistema ainda não foi criado no Firebase. Avise o SAC.'
    : 'O banco Firestore NÃO existe neste projeto Firebase. No Console: Build > Firestore Database > Criar banco de dados (não é o "Realtime Database"). Depois publique o arquivo firestore.rules.';
  if (c === 'permission-denied') return publico
    ? 'O agendamento foi recusado pelo sistema. Confira a data e o horário e tente de novo.'
    : 'Operação recusada pelas regras do Firestore: data inválida, bloqueada ou fora do período, horário já ocupado — ou o arquivo firestore.rules ainda não foi publicado (Firestore > Regras).';
  if (c === 'failed-precondition' || c === 'unimplemented') return publico ? 'Serviço indisponível no momento. Avise o SAC.' : `Configuração do Firestore incompleta (${c}). Veja o console do navegador (F12).`;
  if (c === 'timeout' || c === 'unavailable') return 'Sem resposta do servidor. Verifique a internet e tente novamente.';
  return null;
}

let LIMITE_MS = 15000;
/** (usado nos testes) altera o tempo limite padrão das operações. */
export function definirLimite(ms) { LIMITE_MS = ms; }

/** Evita espera infinita: se o Firebase não responder, falha com mensagem clara. */
export function comTimeout(promessa, ms = LIMITE_MS) {
  let t; const limite = new Promise((_, rej) => { t = setTimeout(() => { const e = new Error('Tempo esgotado ao falar com o servidor.'); e.code = 'timeout'; rej(e); }, ms); });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(t));
}

/**
 * Gravação atômica de vários documentos (tudo ou nada), no mesmo formato do writeBatch.
 * Usa transação: ela NÃO fica "na fila" quando a internet cai — falha na hora, em vez de
 * deixar a tela travada e gravar escondido depois.
 */
function lote() {
  const ops = [];
  return {
    set: (r, d, o) => ops.push(['set', r, d, o]),
    update: (r, d) => ops.push(['update', r, d]),
    delete: (r) => ops.push(['delete', r]),
    commit: () => comTimeout(runTransaction(db, async (tx) => {
      for (const [k, r, d, o] of ops) { if (k === 'set') (o ? tx.set(r, d, o) : tx.set(r, d)); else if (k === 'update') tx.update(r, d); else tx.delete(r); }
    }, { maxAttempts: 1 }), LIMITE_MS + 5000),
  };
}

export const CONFIG_PADRAO = {
  nomeSAC: 'SAC – Serviço de Atendimento ao Cidadão',
  municipio: 'Município',
  local: 'SAC',
  endereco: 'Endereço do SAC (configure no painel)',
  telefone: '',
  email: '',
  abertura: '',
  fechamento: '',
  aviso: '',
  encarregado: '',
  corPrincipal: '',
  logo: '',
};

// ---------------------------------------------------------------------
//  Leitura pública
// ---------------------------------------------------------------------
export async function lerConfig() {
  const s = await comTimeout(getDoc(doc(db, 'config', 'geral')));
  const hoje = C.hojeBR();
  const c = { ...CONFIG_PADRAO, ...(s.exists() ? s.data() : {}) };
  c.configurada = s.exists();
  // Defesa: se alguém editou o documento à mão e o período ficou em formato errado (ex.: Timestamp), usa padrões.
  if (!C.dataValida(c.abertura)) c.abertura = hoje;
  if (!C.dataValida(c.fechamento)) c.fechamento = C.somarDias(hoje, 60);
  for (const k of ['nomeSAC', 'municipio', 'local', 'endereco', 'telefone', 'email', 'aviso', 'encarregado']) if (typeof c[k] !== 'string') c[k] = CONFIG_PADRAO[k];
  return c;
}

export async function lerBloqueios(ini, fim) {
  const q = query(collection(db, 'bloqueios'), where(documentId(), '>=', ini), where(documentId(), '<=', fim));
  const s = await comTimeout(getDocs(q));
  return new Map(s.docs.map((d) => [d.id, d.data()]));
}

export async function horariosOcupados(data) {
  const s = await comTimeout(getDocs(query(collection(db, 'vagas'), where('data', '==', data))));
  return new Set(s.docs.map((d) => d.data().hora));
}

// ---------------------------------------------------------------------
//  Agendamento do cidadão — UM lote atômico: ou grava tudo, ou nada.
//  Se o horário já foi ocupado, o Firestore recusa o lote inteiro.
// ---------------------------------------------------------------------
export class HorarioOcupadoError extends Error {}

export async function agendar(d) {
  const ref = C.gerarRef();
  const protocolo = C.gerarProtocolo();
  const cpf = C.apenasDigitos(d.cpf);
  const [chave, cpfKey] = await Promise.all([C.gerarChave(protocolo, cpf), C.gerarCpfKey(cpf)]);
  const nome = C.normalizarNome(d.nome);
  const cpfMasc = C.mascararCPF(cpf);
  const id = C.slotId(d.data, d.hora);

  const b = lote();
  b.set(doc(db, 'vagas', id), { data: d.data, hora: d.hora, ref });
  b.set(doc(db, 'agendamentos', ref), {
    ref, protocolo, nome, cpf, cpfMasc, nascimento: d.nascimento,
    telefone: C.apenasDigitos(d.telefone), email: String(d.email || '').trim(),
    certidao: d.certidao, data: d.data, hora: d.hora, status: 'agendado', origem: 'cidadao',
    chave, cpfKey, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
  });
  b.set(doc(db, 'comprovantes', chave), {
    ref, protocolo, nome, cpfMasc, data: d.data, hora: d.hora, certidao: d.certidao,
    status: 'agendado', criadoEm: serverTimestamp(),
  });
  b.set(doc(db, 'cpfAtivos', cpfKey), { ref });

  try {
    await b.commit(); // só depois deste "await" a vaga é considerada confirmada
  } catch (e) {
    if (e.code === 'timeout') {
      // O servidor não respondeu a tempo: confirma no servidor se a gravação chegou a acontecer.
      const ok = await comTimeout(getDocFromServer(doc(db, 'comprovantes', chave)), 8000).then((s) => s.exists()).catch(() => false);
      if (ok) return { ref, protocolo, nome, cpfMasc, data: d.data, hora: d.hora, certidao: d.certidao, status: 'agendado' };
      const x = new Error('INCERTO'); x.code = 'incerto'; x.protocolo = protocolo; throw x;
    }
    if (e.code === 'permission-denied' || e.code === 'already-exists' || e.code === 'aborted') {
      const ocupados = await horariosOcupados(d.data).catch(() => new Set());
      if (ocupados.has(d.hora)) throw new HorarioOcupadoError('Este horário acabou de ser ocupado.');
      // Não dá para o cidadão consultar "CPF já agendado" (privacidade): informamos os motivos possíveis.
      const x = new Error('RECUSADO'); x.code = 'recusado'; throw x;
    }
    throw e;
  }
  return { ref, protocolo, nome, cpfMasc, data: d.data, hora: d.hora, certidao: d.certidao, status: 'agendado' };
}

export async function consultar(protocolo, cpf) {
  const p = C.normalizarProtocolo(protocolo);
  if (!p || !C.validarCPF(cpf)) return null;
  const chave = await C.gerarChave(p, cpf);
  const s = await getDoc(doc(db, 'comprovantes', chave));
  if (!s.exists()) return null;
  return { ...s.data(), chave, cpfKey: await C.gerarCpfKey(cpf) };
}

export async function cancelarCidadao(comp) {
  const b = lote();
  b.update(doc(db, 'agendamentos', comp.ref), {
    status: 'cancelado', canceladoPor: 'cidadao', canceladoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
  });
  b.update(doc(db, 'comprovantes', comp.chave), { status: 'cancelado', canceladoEm: serverTimestamp() });
  b.delete(doc(db, 'vagas', C.slotId(comp.data, comp.hora)));
  b.delete(doc(db, 'cpfAtivos', comp.cpfKey));
  await b.commit();
}

// ---------------------------------------------------------------------
//  Administração
// ---------------------------------------------------------------------
export async function entrar(email, senha) {
  await setPersistence(auth, browserSessionPersistence); // sessão termina ao fechar o navegador
  return signInWithEmailAndPassword(auth, email, senha);
}
export const sair = () => signOut(auth);
export const aoMudarLogin = (fn) => onAuthStateChanged(auth, fn);

/** true/false conforme o documento admins/{uid} exista; lança erro se não for possível verificar (ex.: regras não publicadas). */
export async function ehAdmin(uid) {
  return (await comTimeout(getDoc(doc(db, 'admins', uid)))).exists();
}

const comId = (d) => ({ id: d.id, ...d.data() });

export async function listarAgendamentos(ini, fim) {
  // ordenação por hora feita aqui (evita exigir índice composto no Firestore)
  const s = await getDocs(query(collection(db, 'agendamentos'), where('data', '>=', ini), where('data', '<=', fim)));
  return s.docs.map(comId).sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
}
export async function buscarPor(campo, valor) {
  const s = await getDocs(query(collection(db, 'agendamentos'), where(campo, '==', valor), limit(50)));
  return s.docs.map(comId);
}
export async function listarHistorico(ref) {
  const s = await getDocs(query(collection(db, `agendamentos/${ref}/historico`), orderBy('em', 'desc')));
  return s.docs.map(comId);
}
export async function listarBloqueios() {
  const s = await getDocs(collection(db, 'bloqueios'));
  return s.docs.map(comId).sort((a, b) => a.id.localeCompare(b.id));
}
export async function listarAuditoria(n = 200) {
  const s = await getDocs(query(collection(db, 'auditoria'), orderBy('em', 'desc'), limit(n)));
  return s.docs.map(comId);
}

function quem() { return { uid: auth.currentUser.uid, email: auth.currentUser.email }; }

function audit(b, acao, ref, detalhe) {
  b.set(doc(collection(db, 'auditoria')), { ...quem(), acao, ref: ref || '', detalhe: detalhe || '', em: serverTimestamp() });
}
function hist(b, ref, acao, detalhe) {
  b.set(doc(collection(db, `agendamentos/${ref}/historico`)), { ...quem(), acao, detalhe: detalhe || '', em: serverTimestamp() });
}

/** Cadastro manual feito pelo servidor (mesmas travas de vaga e de CPF). */
export async function adminCriar(d) {
  const ref = C.gerarRef();
  const protocolo = C.gerarProtocolo();
  const cpf = C.apenasDigitos(d.cpf);
  const [chave, cpfKey] = await Promise.all([C.gerarChave(protocolo, cpf), C.gerarCpfKey(cpf)]);
  const nome = C.normalizarNome(d.nome);
  const cpfMasc = C.mascararCPF(cpf);
  const b = lote();
  b.set(doc(db, 'vagas', C.slotId(d.data, d.hora)), { data: d.data, hora: d.hora, ref });
  b.set(doc(db, 'agendamentos', ref), {
    ref, protocolo, nome, cpf, cpfMasc, nascimento: d.nascimento, telefone: C.apenasDigitos(d.telefone),
    email: String(d.email || '').trim(), certidao: d.certidao, data: d.data, hora: d.hora, status: 'agendado',
    origem: 'admin', chave, cpfKey, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp(), criadoPor: quem().email,
  });
  b.set(doc(db, 'comprovantes', chave), { ref, protocolo, nome, cpfMasc, data: d.data, hora: d.hora, certidao: d.certidao, status: 'agendado', criadoEm: serverTimestamp() });
  b.set(doc(db, 'cpfAtivos', cpfKey), { ref });
  hist(b, ref, 'criado', `Cadastro manual para ${d.data} ${d.hora}`);
  audit(b, 'criar_agendamento', ref, `${protocolo} ${d.data} ${d.hora}`);
  try { await b.commit(); } catch (e) {
    if (e.code === 'permission-denied' || e.code === 'already-exists') {
      const oc = await horariosOcupados(d.data).catch(() => new Set());
      if (oc.has(d.hora)) throw new HorarioOcupadoError('Horário já ocupado.');
      const cp = await getDoc(doc(db, 'cpfAtivos', cpfKey)).catch(() => null);
      if (cp && cp.exists()) { const x = new Error('CPF_JA_AGENDADO'); x.code = 'cpf-ja-agendado'; throw x; }
    }
    throw e;
  }
  return { ref, protocolo };
}

export async function adminAlterarHorario(a, data, hora) {
  if (a.data === data && a.hora === hora) throw new Error('Escolha uma data ou horário diferente do atual.');
  const b = lote();
  b.delete(doc(db, 'vagas', C.slotId(a.data, a.hora)));
  b.set(doc(db, 'vagas', C.slotId(data, hora)), { data, hora, ref: a.ref });
  b.update(doc(db, 'agendamentos', a.ref), { data, hora, atualizadoEm: serverTimestamp() });
  b.update(doc(db, 'comprovantes', a.chave), { data, hora });
  hist(b, a.ref, 'remarcado', `De ${a.data} ${a.hora} para ${data} ${hora}`);
  audit(b, 'remarcar', a.ref, `${a.data} ${a.hora} -> ${data} ${hora}`);
  try { await b.commit(); } catch (e) {
    if (e.code === 'permission-denied') {
      const oc = await horariosOcupados(data).catch(() => new Set());
      if (oc.has(hora)) throw new HorarioOcupadoError('Horário já ocupado.');
    }
    throw e;
  }
}

export async function adminCancelar(a, motivo) {
  const b = lote();
  b.update(doc(db, 'agendamentos', a.ref), { status: 'cancelado', canceladoPor: 'admin', canceladoEm: serverTimestamp(), atualizadoEm: serverTimestamp(), motivoCancelamento: motivo || '' });
  b.update(doc(db, 'comprovantes', a.chave), { status: 'cancelado', canceladoEm: serverTimestamp() });
  b.delete(doc(db, 'vagas', C.slotId(a.data, a.hora)));
  // Só libera o CPF se o controle ainda pertence a este agendamento (pode já ser de um agendamento novo).
  const cp = await getDoc(doc(db, 'cpfAtivos', a.cpfKey)).catch(() => null);
  if (cp && cp.exists() && cp.data().ref === a.ref) b.delete(doc(db, 'cpfAtivos', a.cpfKey));
  hist(b, a.ref, 'cancelado', motivo || '');
  audit(b, 'cancelar', a.ref, motivo || '');
  await b.commit();
}

/** presente | concluido | faltou  (a vaga continua ocupada; o CPF fica liberado sozinho depois da data do agendamento) */
export async function adminMarcar(a, status) {
  const b = lote();
  b.update(doc(db, 'agendamentos', a.ref), { status, atualizadoEm: serverTimestamp() });
  b.update(doc(db, 'comprovantes', a.chave), { status });
  hist(b, a.ref, status, '');
  audit(b, `marcar_${status}`, a.ref, '');
  await b.commit();
}

/** Salva (mescla) os campos informados. Nunca apaga o período nem a logo se não vierem. */
export async function salvarConfig(campos) {
  const b = lote();
  for (const k of ['abertura', 'fechamento']) {
    if (k in campos && !C.dataValida(campos[k])) throw new Error(`Data de ${k === 'abertura' ? 'abertura' : 'fechamento'} inválida.`);
  }
  if (campos.abertura && campos.fechamento && campos.abertura > campos.fechamento) throw new Error('A abertura deve ser anterior ao fechamento.');
  b.set(doc(db, 'config', 'geral'), campos, { merge: true });
  audit(b, 'salvar_config', '', Object.keys(campos).filter((k) => k !== 'logo').join(', '));
  await b.commit();
}

export async function salvarLogo(dataUrl) {
  const b = lote();
  b.set(doc(db, 'config', 'geral'), { logo: dataUrl || '' }, { merge: true });
  audit(b, dataUrl ? 'alterar_logo' : 'remover_logo', '', '');
  await b.commit();
}

export async function bloquearData(data, motivo) {
  const b = lote();
  b.set(doc(db, 'bloqueios', data), { motivo: motivo || '', por: quem().email, em: serverTimestamp() });
  audit(b, 'bloquear_data', '', `${data} ${motivo || ''}`);
  await b.commit();
}
export async function desbloquearData(data) {
  const b = lote();
  b.delete(doc(db, 'bloqueios', data));
  audit(b, 'desbloquear_data', '', data);
  await b.commit();
}

// ---------------------------------------------------------------------
//  Backup / restauração (arquivo JSON) e LGPD
// ---------------------------------------------------------------------
const COLECOES_BACKUP = ['config', 'bloqueios', 'vagas', 'agendamentos', 'comprovantes', 'cpfAtivos'];

export async function gerarBackup() {
  const out = { versao: 1, geradoEm: new Date().toISOString(), colecoes: {} };
  for (const nome of COLECOES_BACKUP) {
    const s = await getDocs(collection(db, nome));
    out.colecoes[nome] = s.docs.map((d) => ({ id: d.id, data: d.data(), historico: [] }));
  }
  for (const a of out.colecoes.agendamentos) {
    const h = await getDocs(collection(db, `agendamentos/${a.id}/historico`));
    a.historico = h.docs.map((d) => ({ id: d.id, data: d.data() }));
  }
  // `this[k]` é o valor original (antes do toJSON do Timestamp), por isso function e não seta.
  const rep = JSON.stringify(out, function (k, v) {
    const raw = this[k];
    return raw && typeof raw === 'object' && typeof raw.toDate === 'function' ? { __ts: raw.toDate().toISOString() } : v;
  });
  const b = lote();
  audit(b, 'backup', '', `${out.colecoes.agendamentos.length} agendamentos`);
  await b.commit().catch(() => {});
  return rep;
}

import { Timestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const reviver = (_, v) => (v && typeof v === 'object' && '__ts' in v ? Timestamp.fromDate(new Date(v.__ts)) : v);

/**
 * Restaura os documentos do arquivo. As regras proíbem alterar vagas, cpfAtivos e
 * histórico já existentes; por isso esses são gravados só se ainda não existirem.
 * Vagas são agrupadas em até 15 datas por lote (limite de 20 consultas às regras).
 */
export async function restaurarBackup(texto) {
  const dados = JSON.parse(texto, reviver);
  if (!dados || dados.versao !== 1 || !dados.colecoes) throw new Error('Arquivo de backup inválido.');
  let n = 0; let ignorados = 0;
  let b = lote(); let cont = 0; let datas = new Set();
  const flush = async () => { if (cont) { await b.commit(); b = lote(); cont = 0; datas = new Set(); } };
  const SO_NOVO = new Set(['vagas', 'cpfAtivos']);
  const add = async (ref, data, soNovo, dataVaga) => {
    if (soNovo && (await getDoc(ref)).exists()) { ignorados++; return; }
    if (dataVaga && !datas.has(dataVaga) && datas.size >= 15) await flush();
    if (dataVaga) datas.add(dataVaga);
    b.set(ref, data); n++;
    if (++cont >= 300) await flush();
  };
  for (const nome of COLECOES_BACKUP) {
    for (const it of dados.colecoes[nome] || []) {
      await add(doc(db, nome, it.id), it.data, SO_NOVO.has(nome), nome === 'vagas' ? it.data.data : null);
      for (const h of it.historico || []) await add(doc(db, `${nome}/${it.id}/historico`, h.id), h.data, true, null);
    }
  }
  await flush();
  const f = lote(); audit(f, 'restaurar_backup', '', `${n} documentos, ${ignorados} já existentes`); await f.commit();
  return n;
}

/** LGPD — retenção: apaga dados pessoais de atendimentos encerrados antes de `corte`. */
export async function anonimizarAntes(corte) {
  const s = await getDocs(query(collection(db, 'agendamentos'), where('data', '<', corte)));
  let n = 0; let b = lote(); let cont = 0;
  for (const d of s.docs) {
    const a = d.data();
    if (a.anonimizado || !['concluido', 'faltou', 'cancelado'].includes(a.status)) continue;
    b.update(d.ref, { nome: 'ANONIMIZADO', cpf: '', cpfMasc: '', cpfKey: '', nascimento: '1900-01-01', telefone: '', email: '', chave: '', anonimizado: true, atualizadoEm: serverTimestamp() });
    if (a.chave) b.delete(doc(db, 'comprovantes', a.chave));
    n++; cont += 2;
    if (cont >= 400) { await b.commit(); b = lote(); cont = 0; }
  }
  audit(b, 'anonimizar', '', `antes de ${corte}: ${n}`);
  await b.commit();
  return n;
}

// ---------------------------------------------------------------------
//  Dias de funcionamento (página funcionamento.html)
// ---------------------------------------------------------------------
/** Período em que o calendário fica aberto (mantém os demais campos da configuração). */
export async function salvarPeriodo(abertura, fechamento) {
  const b = lote();
  b.set(doc(db, 'config', 'geral'), { abertura, fechamento }, { merge: true });
  audit(b, 'alterar_periodo', '', `${abertura} a ${fechamento}`);
  await b.commit();
}

/** itens: [{data, motivo}] — bloqueia vários dias de uma vez (em lotes). */
export async function bloquearVarias(itens) {
  for (let i = 0; i < itens.length; i += 100) {
    const b = lote(); const parte = itens.slice(i, i + 100);
    for (const it of parte) b.set(doc(db, 'bloqueios', it.data), { motivo: it.motivo || '', por: quem().email, em: serverTimestamp() });
    audit(b, 'bloquear_datas', '', parte.map((x) => x.data).join(', ').slice(0, 400) + (it0(parte)));
    await b.commit();
  }
}
const it0 = (p) => (p[0] && p[0].motivo ? ` | ${p[0].motivo}` : '');

export async function desbloquearVarias(datas) {
  for (let i = 0; i < datas.length; i += 100) {
    const b = lote(); const parte = datas.slice(i, i + 100);
    for (const d of parte) b.delete(doc(db, 'bloqueios', d));
    audit(b, 'desbloquear_datas', '', parte.join(', ').slice(0, 400));
    await b.commit();
  }
}
