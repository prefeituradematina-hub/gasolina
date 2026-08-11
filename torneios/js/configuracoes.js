/**
 * configuracoes.js — documento único "geral" com opções globais do sistema.
 * Hoje só controla se o campo de CPF/documento aparece no cadastro de
 * atletas (briefing, seção 5: "caso o administrador habilite essa opção").
 */

import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const PADRAO = { exigirDocumentoAtleta: false };

async function buscarConfiguracoes() {
  const snap = await getDoc(doc(db, "configuracoes", "geral"));
  return snap.exists() ? { ...PADRAO, ...snap.data() } : PADRAO;
}

async function salvarConfiguracoes(dados) {
  await setDoc(doc(db, "configuracoes", "geral"), dados, { merge: true });
}

export { buscarConfiguracoes, salvarConfiguracoes };
