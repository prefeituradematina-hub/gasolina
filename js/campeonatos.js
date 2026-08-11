/**
 * campeonatos.js — CRUD de campeonatos + controle de período de inscrições.
 */

import { db, storage } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

async function listarCampeonatos() {
  const snap = await getDocs(query(collection(db, "campeonatos"), orderBy("criadoEm", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function buscarCampeonato(id) {
  const snap = await getDoc(doc(db, "campeonatos", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function salvarCampeonato(dados, id = null) {
  if (id) {
    await updateDoc(doc(db, "campeonatos", id), dados);
    return id;
  }
  const ref_ = await addDoc(collection(db, "campeonatos"), {
    ...dados,
    inscricoesForcadas: null, // null = segue automático pelas datas
    criadoEm: serverTimestamp()
  });
  return ref_.id;
}

async function excluirCampeonato(id) {
  await deleteDoc(doc(db, "campeonatos", id));
}

async function enviarLogoCampeonato(id, arquivo) {
  const caminho = ref(storage, `campeonatos/${id}/banner.jpg`);
  await uploadBytes(caminho, arquivo);
  const url = await getDownloadURL(caminho);
  await updateDoc(doc(db, "campeonatos", id), { logoUrl: url });
  return url;
}

/** Abre ou fecha as inscrições manualmente, independente das datas. */
async function forcarInscricoes(id, estado) {
  // estado: "abertas" | "fechadas" | null (volta ao automático)
  await updateDoc(doc(db, "campeonatos", id), { inscricoesForcadas: estado });
}

/** Regra única de "inscrições abertas": usada aqui e nas telas do responsável. */
function inscricoesEstaoAbertas(campeonato) {
  if (campeonato.inscricoesForcadas === "abertas") return true;
  if (campeonato.inscricoesForcadas === "fechadas") return false;

  const agora = new Date();
  const abertura = campeonato.inscricaoAbertura ? new Date(campeonato.inscricaoAbertura) : null;
  const encerramento = campeonato.inscricaoEncerramento ? new Date(campeonato.inscricaoEncerramento) : null;

  if (abertura && agora < abertura) return false;
  if (encerramento && agora > encerramento) return false;
  return true;
}

/** Campeonatos ativos com inscrições abertas agora — usado no formulário do responsável. */
async function listarCampeonatosComInscricoesAbertas() {
  const todos = await listarCampeonatos();
  return todos.filter((c) => c.status === "ativo" && inscricoesEstaoAbertas(c));
}

/** Campeonatos com página pública habilitada — usado na listagem pública (publico.html). */
async function listarCampeonatosPublicos() {
  const todos = await listarCampeonatos();
  return todos.filter((c) => c.publico);
}

export {
  listarCampeonatos, buscarCampeonato, salvarCampeonato, excluirCampeonato,
  enviarLogoCampeonato, forcarInscricoes, inscricoesEstaoAbertas,
  listarCampeonatosComInscricoesAbertas, listarCampeonatosPublicos
};
