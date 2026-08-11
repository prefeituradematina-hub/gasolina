/**
 * atletas.js — CRUD de atletas. Neste arquivo, a visão é a do ADMIN
 * (pode ver/editar atletas de qualquer time). A tela do responsável
 * (equipe.html) reaproveita estas mesmas funções, respeitando as regras
 * do Firestore que já bloqueiam edição cruzada.
 *
 * Dados sensíveis (CPF, título de eleitor, foto do documento) NÃO ficam
 * no doc de /atletas — ficam em /atletasPrivado/{mesmoId}, com leitura
 * restrita ao admin e ao responsável dono do time (ver firestore.rules).
 * As funções buscarAtletaPrivado/salvarAtletaPrivado/enviarDocumentoAtleta
 * cuidam dessa coleção separada.
 *
 * status do atleta: "pendente" | "aprovado" | "rejeitado". Atletas
 * criados pelo admin diretamente já entram "aprovado"; atletas cadastrados
 * pelo responsável (equipe.html) entram "pendente" e só ficam visíveis
 * publicamente após aprovação do admin. Docs antigos sem esse fluxo têm
 * status "ativo" — tratado como aprovado para não sumir da tela.
 */

import { db, storage } from "./firebase-config.js";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, getDoc,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

/** true se o atleta deve contar como aprovado/visível publicamente. */
function estaAprovado(atleta) {
  return atleta.status === "aprovado" || atleta.status === "ativo";
}

/**
 * @param timeId filtra por time (opcional)
 * @param somenteAprovados se true, devolve só atletas aprovados/legados "ativo"
 *
 * OBS: a consulta usa só `where(timeId)`, sem `orderBy` combinado — isso
 * evita a exigência de um índice composto no Firestore (era a causa raiz
 * de a lista de atletas do time ficar vazia para o responsável quando o
 * índice ainda não tinha sido criado no console). Ordenação é feita aqui
 * no cliente, o que é igualmente correto para volumes de time/campeonato.
 */
async function listarAtletas({ timeId = null, somenteAprovados = false } = {}) {
  const q = timeId
    ? query(collection(db, "atletas"), where("timeId", "==", timeId))
    : collection(db, "atletas");

  const snap = await getDocs(q);
  let atletas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (somenteAprovados) atletas = atletas.filter(estaAprovado);
  atletas.sort((a, b) => (a.nomeCompleto || "").localeCompare(b.nomeCompleto || "", "pt-BR"));
  return atletas;
}

async function buscarAtleta(id) {
  const snap = await getDoc(doc(db, "atletas", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * @param dados.status opcional — quem chama decide ("aprovado" para
 *   cadastro direto do admin, "pendente" para cadastro do responsável).
 *   Se omitido na criação, cai em "pendente" (mais seguro por padrão).
 */
async function salvarAtleta(dados, id = null) {
  if (id) {
    await updateDoc(doc(db, "atletas", id), dados);
    return id;
  }
  const ref_ = await addDoc(collection(db, "atletas"), {
    ...dados,
    status: dados.status || "pendente",
    ajusteGols: 0,
    aprovadoPor: null,
    aprovadoEm: null,
    criadoEm: serverTimestamp()
  });
  return ref_.id;
}

async function excluirAtleta(id) {
  await deleteDoc(doc(db, "atletas", id));
  // Best-effort: remove também o doc de dados sensíveis, se existir.
  try {
    await deleteDoc(doc(db, "atletasPrivado", id));
  } catch (err) {
    // Doc pode não existir (atleta antigo, criado antes deste recurso) — ok ignorar.
  }
}

async function enviarFotoAtleta(id, arquivo) {
  const caminho = ref(storage, `atletas/${id}/foto.jpg`);
  await uploadBytes(caminho, arquivo);
  const url = await getDownloadURL(caminho);
  await updateDoc(doc(db, "atletas", id), { fotoUrl: url });
  return url;
}

/**
 * Aprova ou rejeita o cadastro de um atleta (ação exclusiva do admin —
 * a regra do Firestore já impede o responsável de alterar esses campos).
 */
async function definirStatusAtleta(id, status, adminUid) {
  await updateDoc(doc(db, "atletas", id), {
    status,
    aprovadoPor: adminUid || null,
    aprovadoEm: serverTimestamp()
  });
}

// -----------------------------------------------------------------------
// Dados sensíveis (CPF / título de eleitor / documento com foto)
// -----------------------------------------------------------------------

async function buscarAtletaPrivado(atletaId) {
  const snap = await getDoc(doc(db, "atletasPrivado", atletaId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : { cpf: "", tituloEleitor: "", documentoFotoUrl: null };
}

async function salvarAtletaPrivado(atletaId, { cpf, tituloEleitor }) {
  await setDoc(doc(db, "atletasPrivado", atletaId), {
    cpf: cpf || "",
    tituloEleitor: tituloEleitor || "",
    atualizadoEm: serverTimestamp()
  }, { merge: true });
}

async function enviarDocumentoAtleta(atletaId, arquivo) {
  const caminho = ref(storage, `atletasDocumentos/${atletaId}/documento.jpg`);
  await uploadBytes(caminho, arquivo);
  const url = await getDownloadURL(caminho);
  await setDoc(doc(db, "atletasPrivado", atletaId), {
    documentoFotoUrl: url,
    atualizadoEm: serverTimestamp()
  }, { merge: true });
  return url;
}

export {
  listarAtletas, buscarAtleta, salvarAtleta, excluirAtleta, enviarFotoAtleta,
  definirStatusAtleta, estaAprovado,
  buscarAtletaPrivado, salvarAtletaPrivado, enviarDocumentoAtleta
};
