/**
 * atletas.js — CRUD de atletas. Neste arquivo, a visão é a do ADMIN
 * (pode ver/editar atletas de qualquer time). A tela do responsável
 * (equipe.html, próxima etapa) reaproveita estas mesmas funções,
 * respeitando as regras do Firestore que já bloqueiam edição cruzada.
 */

import { db, storage } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

async function listarAtletas({ timeId = null } = {}) {
  const q = timeId
    ? query(collection(db, "atletas"), where("timeId", "==", timeId), orderBy("nomeCompleto"))
    : query(collection(db, "atletas"), orderBy("nomeCompleto"));

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function buscarAtleta(id) {
  const snap = await getDoc(doc(db, "atletas", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function salvarAtleta(dados, id = null) {
  if (id) {
    await updateDoc(doc(db, "atletas", id), dados);
    return id;
  }
  const ref_ = await addDoc(collection(db, "atletas"), {
    ...dados,
    status: "ativo",
    ajusteGols: 0,
    criadoEm: serverTimestamp()
  });
  return ref_.id;
}

async function excluirAtleta(id) {
  await deleteDoc(doc(db, "atletas", id));
}

async function enviarFotoAtleta(id, arquivo) {
  const caminho = ref(storage, `atletas/${id}/foto.jpg`);
  await uploadBytes(caminho, arquivo);
  const url = await getDownloadURL(caminho);
  await updateDoc(doc(db, "atletas", id), { fotoUrl: url });
  return url;
}

export { listarAtletas, buscarAtleta, salvarAtleta, excluirAtleta, enviarFotoAtleta };
