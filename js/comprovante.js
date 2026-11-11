import * as C from './core.js';

/** HTML do comprovante. `comp` nunca contém CPF completo (só cpfMasc). */
export function htmlComprovante(comp, cfg) {
  const cancel = comp.status === 'cancelado';
  const docs = comp.certidao === 'casamento'
    ? 'Certidão de casamento (original) — pessoa casada'
    : 'Certidão de nascimento (original) — pessoa solteira';
  return `
  <div class="comprovante" id="comprovante">
    ${cancel ? '<div class="cancelado-marca">CANCELADO</div>' : ''}
    ${C.logoValida(cfg.logo) ? `<img class="logo-comp" src="${cfg.logo}" alt="">` : ''}
    <h2>Comprovante de agendamento</h2>
    <div>${C.esc(cfg.nomeSAC)} — ${C.esc(cfg.municipio)}</div>
    <div class="prot">${C.esc(comp.protocolo)}</div>
    <dl class="resumo">
      <dt>Serviço</dt><dd>Emissão da Carteira de Identidade Nacional (CIN)</dd>
      <dt>Cidadão</dt><dd>${C.esc(comp.nome)}</dd>
      <dt>CPF</dt><dd>${C.esc(comp.cpfMasc)}</dd>
      <dt>Data</dt><dd>${C.esc(C.formatarDataLonga(comp.data))}</dd>
      <dt>Horário</dt><dd>${C.esc(comp.hora.replace(':', 'h'))}</dd>
      <dt>Local</dt><dd>${C.esc(cfg.local)} — ${C.esc(cfg.endereco)}${cfg.telefone ? '<br>Tel.: ' + C.esc(cfg.telefone) : ''}</dd>
      <dt>Situação</dt><dd>${cancel ? 'Cancelado' : 'Confirmado'}</dd>
      <dt>Levar</dt><dd>${C.esc(docs)}</dd>
      <dt>Valor</dt><dd>GRATUITO — nenhuma taxa é cobrada</dd>
    </dl>
    <p style="font-size:.9rem;color:#5b6675;margin-bottom:0">Chegue com alguns minutos de antecedência. Guarde este número de protocolo: com ele e o seu CPF você consulta ou cancela o agendamento.</p>
  </div>`;
}

/** Link "mailto:" — abre o e-mail do próprio cidadão. Não há envio automático. */
export function linkEmail(comp, cfg, para = '') {
  const assunto = `Agendamento CIN – protocolo ${comp.protocolo}`;
  const corpo = [
    `Agendamento para emissão da Carteira de Identidade Nacional (CIN) — serviço gratuito.`, '',
    `Protocolo: ${comp.protocolo}`, `Cidadão: ${comp.nome}`,
    `Data: ${C.formatarDataLonga(comp.data)}`, `Horário: ${comp.hora.replace(':', 'h')}`,
    `Local: ${cfg.local} — ${cfg.endereco}`,
    `Levar: ${comp.certidao === 'casamento' ? 'certidão de casamento (original)' : 'certidão de nascimento (original)'}`,
  ].join('\n');
  return `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}
