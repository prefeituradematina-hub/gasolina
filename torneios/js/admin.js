/**
 * admin.js — glue do painel administrativo: sessão, navegação por seções
 * (hash-based) e contadores do dashboard.
 */

import { db } from "./firebase-config.js";
import { requireAuth, logout, getPerfilAtual } from "./auth.js";
import {
  collection, query, where, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

async function iniciarSessaoAdmin() {
  const perfil = await requireAuth(["admin"]);
  document.querySelectorAll("[data-nome-admin]").forEach((el) => (el.textContent = perfil.nome));
  return perfil;
}

/** Troca de seção visível conforme o hash da URL (#dashboard, #campeonatos, ...). */
function iniciarNavegacao(aoTrocarSecao) {
  const secoes = document.querySelectorAll("[data-secao]");
  const linksMenu = document.querySelectorAll("[data-menu-link]");

  function aplicar() {
    const alvo = (window.location.hash || "#dashboard").replace("#", "");
    secoes.forEach((s) => s.classList.toggle("secao-ativa", s.dataset.secao === alvo));
    linksMenu.forEach((l) => l.classList.toggle("menu-ativo", l.dataset.menuLink === alvo));
    document.getElementById("menuLateral")?.classList.remove("menu-aberto");
    if (typeof aoTrocarSecao === "function") aoTrocarSecao(alvo);
  }

  window.addEventListener("hashchange", aplicar);
  aplicar();
}

async function contar(nomeColecao, filtros = []) {
  const base = collection(db, nomeColecao);
  const q = filtros.length ? query(base, ...filtros) : query(base);
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

async function carregarEstatisticasDashboard() {
  const hojeISO = new Date().toISOString().slice(0, 10); // YYYY-MM-DD, compatível com o formato salvo em jogos.data

  const [
    campeonatosAtivos,
    timesTotal,
    timesPendentes,
    atletasTotal,
    jogosTotal,
    proximosJogos
  ] = await Promise.all([
    contar("campeonatos", [where("status", "==", "ativo")]),
    contar("times"),
    contar("times", [where("status", "==", "pendente")]),
    contar("atletas"),
    contar("jogos"),
    contar("jogos", [where("status", "==", "agendado"), where("data", ">=", hojeISO)])
  ]);

  return { campeonatosAtivos, timesTotal, timesPendentes, atletasTotal, jogosTotal, proximosJogos };
}

function ligarLogout(botaoId = "btnSair") {
  document.getElementById(botaoId)?.addEventListener("click", logout);
}

export {
  iniciarSessaoAdmin, iniciarNavegacao, carregarEstatisticasDashboard,
  ligarLogout, getPerfilAtual
};
