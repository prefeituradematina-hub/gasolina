/**
 * artilharia.js — soma os gols registrados em golsMandante/golsVisitante
 * dos jogos encerrados de um campeonato, agrupando por atleta. Também
 * soma o campo `ajusteGols` do atleta (correção manual do admin, ver
 * seção 11 do briefing: "corrigir manualmente quando necessário").
 */

import { listarJogos } from "./jogos.js";
import { listarAtletas } from "./atletas.js";

async function calcularArtilharia(campeonatoId, timeIdsDoCampeonato) {
  const jogos = await listarJogos({ campeonatoId });
  const encerrados = jogos.filter((j) => j.status === "encerrado");

  const contagem = {}; // atletaId -> gols
  encerrados.forEach((j) => {
    (j.golsMandante || []).forEach(({ atletaId, quantidade }) => {
      contagem[atletaId] = (contagem[atletaId] || 0) + Number(quantidade || 0);
    });
    (j.golsVisitante || []).forEach(({ atletaId, quantidade }) => {
      contagem[atletaId] = (contagem[atletaId] || 0) + Number(quantidade || 0);
    });
  });

  // Carrega todos os atletas dos times do campeonato para exibir nome/foto/time,
  // mesmo os que ainda não marcaram gol nenhum (não entram na lista, só os artilheiros).
  const todosAtletas = (await Promise.all(
    (timeIdsDoCampeonato || []).map((timeId) => listarAtletas({ timeId }))
  )).flat();

  const lista = todosAtletas
    .map((a) => ({
      atletaId: a.id,
      nome: a.nomeCompleto,
      fotoUrl: a.fotoUrl || null,
      timeId: a.timeId,
      gols: (contagem[a.id] || 0) + Number(a.ajusteGols || 0)
    }))
    .filter((a) => a.gols > 0)
    .sort((a, b) => b.gols - a.gols);

  return lista;
}

export { calcularArtilharia };
