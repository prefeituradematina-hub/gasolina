/**
 * times.js — gestão de times pelo administrador (aprovação é exclusiva dele).
 * A criação do time em si é feita pelo responsável (ver equipe.js, próxima etapa).
 */

import { db, storage } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

async function listarTimes({ campeonatoId = null, status = null } = {}) {
  let filtros = [];
  if (campeonatoId) filtros.push(where("campeonatoId", "==", campeonatoId));
  if (status) filtros.push(where("status", "==", status));

  const q = filtros.length
    ? query(collection(db, "times"), ...filtros, orderBy("dataCadastro", "desc"))
    : query(collection(db, "times"), orderBy("dataCadastro", "desc"));

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function buscarTime(id) {
  const snap = await getDoc(doc(db, "times", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function definirStatusTime(id, status) {
  // status: "pendente" | "aprovado" | "rejeitado" | "bloqueado"
  await updateDoc(doc(db, "times", id), { status });
}

async function editarTime(id, dados) {
  // Admin pode editar qualquer campo (nome, cidade, contato etc.),
  // exceto responsavelUid, que é gerido por usuarios.js.
  await updateDoc(doc(db, "times", id), dados);
}

async function excluirTime(id) {
  await deleteDoc(doc(db, "times", id));
}

/** Times sem responsável vinculado — usados no formulário de criação de usuário. */
async function listarTimesSemResponsavel() {
  const snap = await getDocs(collection(db, "times"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => !t.responsavelUid);
}

/**
 * -----------------------------------------------------------------------
 * A partir daqui: funções de AUTOATENDIMENTO usadas pela tela do
 * responsável de time (equipe.html). As regras do Firestore garantem
 * que só o dono (responsavelUid === uid logado) consegue criar/editar
 * o próprio time, e apenas os campos permitidos — nome, cidade,
 * telefone, e-mail, logo. Status, responsavelUid e campeonatoId ficam
 * travados após a criação e só o admin altera.
 * -----------------------------------------------------------------------
 */

async function buscarMeuTime(uid) {
  const snap = await getDocs(
    query(collection(db, "times"), where("responsavelUid", "==", uid), limit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function criarMeuTime(uid, dados) {
  const ref_ = await addDoc(collection(db, "times"), {
    ...dados,
    responsavelUid: uid,
    status: "pendente",
    dataCadastro: serverTimestamp()
  });
  return ref_.id;
}

/** Edição pelo próprio responsável — nunca envia status/responsavelUid/campeonatoId. */
async function editarMeuTime(id, dados) {
  const { status, responsavelUid, campeonatoId, ...permitido } = dados;
  await updateDoc(doc(db, "times", id), permitido);
}

async function enviarLogoTime(id, arquivo) {
  const caminho = ref(storage, `times/${id}/logo.jpg`);
  await uploadBytes(caminho, arquivo);
  const url = await getDownloadURL(caminho);
  await updateDoc(doc(db, "times", id), { logoUrl: url });
  return url;
}

export {
  listarTimes, buscarTime, definirStatusTime, editarTime, excluirTime,
  listarTimesSemResponsavel,
  buscarMeuTime, criarMeuTime, editarMeuTime, enviarLogoTime
};
