/**
 * auth.js
 * -------------------------------------------------------------------------
 * Autenticação (Firebase Auth) + perfil/permissões (Firestore).
 *
 * Estrutura da coleção "usuarios" (doc.id === uid do Firebase Auth):
 *   {
 *     nome: string,
 *     email: string,
 *     tipo: "admin" | "responsavel",
 *     timeId: string | null,      // obrigatório quando tipo === "responsavel"
 *     status: "ativo" | "bloqueado",
 *     criadoEm: Timestamp
 *   }
 *
 * O cadastro de usuários é sempre feito/liberado pelo administrador
 * (ver admin.js) — não existe autocadastro público de usuário.
 * -------------------------------------------------------------------------
 */

import { auth, db, firebaseConfig } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let currentUser = null;   // objeto do Firebase Auth
let currentProfile = null; // documento de usuarios/{uid}

const MSG_CONFIG_PENDENTE =
  "O sistema ainda não foi configurado: abra js/firebase-config.js e substitua os valores de exemplo pelas credenciais reais do seu projeto Firebase.";

/** true se js/firebase-config.js ainda estiver com os valores de exemplo. */
function configuracaoPendente() {
  return !firebaseConfig.apiKey || firebaseConfig.apiKey === "SUA_API_KEY_AQUI" ||
         !firebaseConfig.projectId || firebaseConfig.projectId === "SEU_PROJETO";
}

/**
 * Faz login com e-mail e senha.
 * Lança erro com mensagem amigável em português em caso de falha.
 */
async function login(email, senha) {
  if (configuracaoPendente()) throw new Error(MSG_CONFIG_PENDENTE);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, senha);
    const profile = await carregarPerfil(cred.user.uid);

    if (!profile) {
      await signOut(auth);
      throw new Error("Usuário sem cadastro de perfil. Contate o administrador.");
    }
    if (profile.status === "bloqueado") {
      await signOut(auth);
      throw new Error("Este usuário está bloqueado. Contate o administrador.");
    }
    return profile;
  } catch (err) {
    throw new Error(traduzErroFirebase(err));
  }
}

async function logout() {
  await signOut(auth);
  currentUser = null;
  currentProfile = null;
  window.location.href = "login.html";
}

async function carregarPerfil(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function traduzErroFirebase(err) {
  const codigo = err.code || "";
  const mapa = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-disabled": "Usuário desabilitado.",
    "auth/user-not-found": "E-mail ou senha incorretos.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
    "auth/api-key-not-valid": MSG_CONFIG_PENDENTE,
    "auth/invalid-api-key": MSG_CONFIG_PENDENTE,
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet e tente novamente."
  };
  return mapa[codigo] || err.message || "Erro ao entrar. Tente novamente.";
}

/**
 * Protege uma página: exige autenticação e, opcionalmente, um tipo de
 * usuário específico. Redireciona para login.html quando não autorizado.
 * REJEITA (em vez de travar para sempre) se a configuração do Firebase
 * ainda não foi preenchida ou se a conexão falhar — quem chamar deve
 * envolver em try/catch e mostrar o erro na tela (ver index.html).
 *
 * Uso no topo de admin.html/js:
 *   const perfil = await requireAuth(["admin"]);
 *
 * Uso em equipe.html/js (admin OU responsável podem entrar):
 *   const perfil = await requireAuth(["admin", "responsavel"]);
 */
function requireAuth(tiposPermitidos = null) {
  return new Promise((resolve, reject) => {
    if (configuracaoPendente()) { reject(new Error(MSG_CONFIG_PENDENTE)); return; }

    onAuthStateChanged(
      auth,
      async (user) => {
        try {
          if (!user) {
            window.location.href = "login.html";
            return;
          }

          const profile = await carregarPerfil(user.uid);
          if (!profile || profile.status === "bloqueado") {
            await signOut(auth);
            window.location.href = "login.html";
            return;
          }

          if (tiposPermitidos && !tiposPermitidos.includes(profile.tipo)) {
            window.location.href = "acesso-negado.html";
            return;
          }

          currentUser = user;
          currentProfile = profile;
          resolve(profile);
        } catch (err) {
          reject(new Error(traduzErroFirebase(err)));
        }
      },
      (err) => reject(new Error(traduzErroFirebase(err)))
    );
  });
}

function getPerfilAtual() {
  return currentProfile;
}

function isAdmin() {
  return currentProfile?.tipo === "admin";
}

function getTimeIdAtual() {
  return currentProfile?.tipo === "responsavel" ? currentProfile.timeId : null;
}

export {
  login,
  logout,
  requireAuth,
  getPerfilAtual,
  isAdmin,
  getTimeIdAtual,
  configuracaoPendente,
  MSG_CONFIG_PENDENTE
};
