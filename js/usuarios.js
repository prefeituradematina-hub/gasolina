/**
 * usuarios.js
 * -------------------------------------------------------------------------
 * Criação/gestão de contas (usuarios) pelo administrador.
 *
 * PROBLEMA: criar um novo usuário do Firebase Auth pelo SDK do cliente
 * assina automaticamente o app COM a nova conta, derrubando a sessão do
 * admin. Como este projeto não usa Cloud Functions/backend próprio, a
 * solução é criar um app Firebase SECUNDÁRIO (mesma config, nome
 * diferente) só para o createUser, e depois encerrar a sessão dele —
 * a sessão principal do admin nunca é afetada.
 * -------------------------------------------------------------------------
 */

import { db, firebaseConfig } from "./firebase-config.js";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function appSecundario() {
  const nome = "secundario";
  const existente = getApps().find((a) => a.name === nome);
  return existente || initializeApp(firebaseConfig, nome);
}

/**
 * Cria um novo usuário (Auth + doc em /usuarios) sem afetar a sessão
 * do administrador logado. Se `vincularTimeId` for informado, também
 * grava responsavelUid nesse time (só funciona em time sem responsável).
 */
async function criarUsuario({ nome, email, senha, tipo, vincularTimeId }) {
  const authSecundario = getAuth(appSecundario());

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(authSecundario, email, senha);
  } catch (err) {
    throw new Error(traduzErro(err));
  }

  const uid = cred.user.uid;
  await signOut(authSecundario); // não deixa sessão paralela aberta

  await setDoc(doc(db, "usuarios", uid), {
    nome,
    email,
    tipo, // "admin" | "responsavel"
    timeId: vincularTimeId || null,
    status: "ativo",
    criadoEm: serverTimestamp()
  });

  if (tipo === "responsavel" && vincularTimeId) {
    await updateDoc(doc(db, "times", vincularTimeId), {
      responsavelUid: uid
    });
  }

  return uid;
}

async function listarUsuarios() {
  const snap = await getDocs(query(collection(db, "usuarios"), orderBy("criadoEm", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function alternarBloqueio(uid, statusAtual) {
  const novo = statusAtual === "bloqueado" ? "ativo" : "bloqueado";
  await updateDoc(doc(db, "usuarios", uid), { status: novo });
  return novo;
}

function traduzErro(err) {
  const mapa = {
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "Senha muito fraca (mínimo 6 caracteres)."
  };
  return mapa[err.code] || err.message || "Erro ao criar usuário.";
}

export { criarUsuario, listarUsuarios, alternarBloqueio };
