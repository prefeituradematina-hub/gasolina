/**
 * classificacao.js — calcula a tabela (P/J/V/E/D/GP/GC/SG) em tempo real
 * a partir dos jogos com status "encerrado" de um campeonato. Não grava
 * nada no banco: é sempre recalculada na hora, então nunca fica
 * desatualizada em relação aos jogos/resultados.
 */

import { listarJogos } from "./jogos.js";
import { listarTimes } from "./times.js";

/**
 * @param campeonato objeto do campeonato (usa pontosVitoria/Empate/Derrota,
 *   com padrão 3/1/0 caso não configurado)
 */
async function calcularClassificacao(campeonato) {
  const pV = campeonato.pontosVitoria ?? 3;
  const pE = campeonato.pontosEmpate ?? 1;
  const pD = campeonato.pontosDerrota ?? 0;

  const [times, jogos] = await Promise.all([
    listarTimes({ campeonatoId: campeonato.id, status: "aprovado" }),
    listarJogos({ campeonatoId: campeonato.id })
  ]);

  const tabela = {};
  times.forEach((t) => {
    tabela[t.id] = {
      timeId: t.id, nome: t.nome, logoUrl: t.logoUrl || null,
      pontos: 0, jogos: 0, vitorias: 0, empates: 0, derrotas: 0,
      golsPro: 0, golsContra: 0, saldoGols: 0
    };
  });

  jogos
    .filter((j) => j.status === "encerrado" && j.placarMandante != null && j.placarVisitante != null)
    .forEach((j) => {
      const mandante = tabela[j.timeMandanteId];
      const visitante = tabela[j.timeVisitanteId];
      if (!mandante || !visitante) return; // time não está mais aprovado/no campeonato

      mandante.jogos++; visitante.jogos++;
      mandante.golsPro += j.placarMandante; mandante.golsContra += j.placarVisitante;
      visitante.golsPro += j.placarVisitante; visitante.golsContra += j.placarMandante;

      if (j.placarMandante > j.placarVisitante) {
        mandante.vitorias++; mandante.pontos += pV;
        visitante.derrotas++; visitante.pontos += pD;
      } else if (j.placarMandante < j.placarVisitante) {
        visitante.vitorias++; visitante.pontos += pV;
        mandante.derrotas++; mandante.pontos += pD;
      } else {
        mandante.empates++; mandante.pontos += pE;
        visitante.empates++; visitante.pontos += pE;
      }
    });

  const lista = Object.values(tabela).map((t) => ({ ...t, saldoGols: t.golsPro - t.golsContra }));

  // Critério de desempate: pontos > vitórias > saldo de gols > gols pró
  lista.sort((a, b) =>
    b.pontos - a.pontos ||
    b.vitorias - a.vitorias ||
    b.saldoGols - a.saldoGols ||
    b.golsPro - a.golsPro
  );

  return lista;
}

export { calcularClassificacao };
