/**
 * regulamentos.js — um documento por campeonato (doc.id === campeonatoId).
 * `publicado` controla se o texto aparece na página pública mesmo que o
 * campeonato em si esteja marcado como público.
 */

import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

async function buscarRegulamento(campeonatoId) {
  const snap = await getDoc(doc(db, "regulamentos", campeonatoId));
  return snap.exists() ? snap.data() : { texto: "", publicado: false };
}

async function salvarRegulamento(campeonatoId, { texto, publicado }) {
  await setDoc(doc(db, "regulamentos", campeonatoId), {
    texto,
    publicado: !!publicado,
    atualizadoEm: serverTimestamp()
  });
}

export { buscarRegulamento, salvarRegulamento };
