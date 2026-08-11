/**
 * firebase-config.js
 * -------------------------------------------------------------------------
 * ÚNICO arquivo do sistema que deve conter as credenciais do projeto Firebase.
 * Nenhum outro arquivo .js ou .html deve declarar firebaseConfig.
 *
 * Para trocar de projeto Firebase no futuro, basta editar os valores abaixo.
 * -------------------------------------------------------------------------
 */

// TODO: substitua pelos dados do SEU projeto Firebase
// (Console Firebase > Configurações do projeto > Seus apps > SDK setup)
const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

// Firebase SDK v10 (modular, via CDN) — importado nos arquivos que precisarem
// Exemplo de uso em outro arquivo:
//   import { app, auth, db, storage } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage, firebaseConfig };
