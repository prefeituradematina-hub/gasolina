/**
 * jogos.js — CRUD de partidas + registro de resultado.
 *
 * Resultado fica embutido no próprio doc de "jogos" (placarMandante/
 * placarVisitante + arrays de gols por atleta), em vez de uma coleção
 * "resultados" separada — evita duplicação e mantém tudo consistente
 * em uma única escrita ao confirmar o placar.
 *
 * golsMandante / golsVisitante: [{ atletaId, quantidade }]
 */

import { db } from "./firebase-config.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

async function listarJogos({ campeonatoId = null, timeId = null } = {}) {
  const filtros = [];
  if (campeonatoId) filtros.push(where("campeonatoId", "==", campeonatoId));
  const q = filtros.length
    ? query(collection(db, "jogos"), ...filtros, orderBy("data"), orderBy("horario"))
    : query(collection(db, "jogos"), orderBy("data"), orderBy("horario"));

  const snap = await getDocs(q);
  let jogos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (timeId) jogos = jogos.filter((j) => j.timeMandanteId === timeId || j.timeVisitanteId === timeId);
  return jogos;
}

async function buscarJogo(id) {
  const snap = await getDoc(doc(db, "jogos", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function salvarJogo(dados, id = null) {
  if (id) {
    await updateDoc(doc(db, "jogos", id), dados);
    return id;
  }
  const ref_ = await addDoc(collection(db, "jogos"), {
    ...dados,
    status: dados.status || "agendado",
    placarMandante: null,
    placarVisitante: null,
    golsMandante: [],
    golsVisitante: [],
    criadoEm: serverTimestamp()
  });
  return ref_.id;
}

async function excluirJogo(id) {
  await deleteDoc(doc(db, "jogos", id));
}

/**
 * Registra (ou corrige) o resultado de um jogo já cadastrado.
 * golsMandante/golsVisitante: [{ atletaId, quantidade }] — usados
 * depois por artilharia.js para somar os gols de cada atleta.
 */
async function registrarResultado(id, { placarMandante, placarVisitante, golsMandante, golsVisitante }) {
  await updateDoc(doc(db, "jogos", id), {
    placarMandante,
    placarVisitante,
    golsMandante: golsMandante || [],
    golsVisitante: golsVisitante || [],
    status: "encerrado"
  });
}

async function definirStatusJogo(id, status) {
  // status: "agendado" | "adiado" | "cancelado" | "encerrado"
  await updateDoc(doc(db, "jogos", id), { status });
}

export {
  listarJogos, buscarJogo, salvarJogo, excluirJogo,
  registrarResultado, definirStatusJogo
};
