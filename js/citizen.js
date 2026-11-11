import * as C from './core.js';
import * as DB from './firebase.js';
import { htmlComprovante, linkEmail } from './comprovante.js';
import { aplicarMarca } from './marca.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let cfg = { ...DB.CONFIG_PADRAO };
let bloqueios = new Map();
let problema = ''; // motivo pelo qual não dá para agendar agora (mostrado ao clicar)
window.__cinOk = true;
const est = { dados: null, data: '', hora: '', mes: '' };

const views = ['vInicio', 'vAgendar', 'vComp', 'vConsulta', 'vPriv'];
function ir(v) {
  views.forEach((x) => $('#' + x).classList.toggle('oculto', x !== v));
  window.scrollTo({ top: 0 });
}
function toast(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('oculto'), 5000);
}
function setBusy(btn, on, texto) {
  if (on) { btn.dataset.t = btn.textContent; btn.innerHTML = `<span class="spin"></span> ${texto || 'Aguarde…'}`; btn.disabled = true; }
  else { btn.textContent = btn.dataset.t || btn.textContent; btn.disabled = false; }
}

// ---------------------------------------------------------------------
//  Início
// ---------------------------------------------------------------------
async function iniciar() {
  if (!DB.configurado) {
    const a = $('#avisoCfg'); a.classList.remove('oculto');
    a.innerHTML = '<strong>Sistema ainda não configurado.</strong> Preencha o arquivo <code>firebase-config.js</code> com os dados do seu projeto Firebase.';
    problema = 'Sistema ainda não configurado: falta preencher a apiKey e o appId no arquivo firebase-config.js.';
    return;
  }
  try {
    cfg = await DB.lerConfig();
    aplicarMarca(cfg);
    document.title = `Agendamento da CIN – ${cfg.nomeSAC}`;
    if (cfg.aviso) { const a = $('#avisoGeral'); a.textContent = cfg.aviso; a.classList.remove('oculto'); }
    if (cfg.encarregado) { const e = $('#pEncarregado'); e.textContent = `Encarregado pelo tratamento de dados: ${cfg.encarregado}`; e.classList.remove('oculto'); }
    $('#tNome').firstChild.textContent = cfg.nomeSAC;
    $('#tMun').textContent = `${cfg.municipio} — Agendamento da Carteira de Identidade Nacional (CIN)`;
    $('#infoLocal').innerHTML = `<strong>${C.esc(cfg.local)}</strong><br>${C.esc(cfg.endereco)}`
      + (cfg.telefone ? `<br>Tel.: ${C.esc(cfg.telefone)}` : '') + (cfg.email ? `<br>${C.esc(cfg.email)}` : '');
    if (!cfg.configurada) {
      const a = $('#avisoCfg'); a.classList.remove('oculto');
      a.textContent = 'O SAC ainda não abriu a agenda. Volte em breve. (Administrador: entre no painel, salve as Configurações e o período em "Dias de funcionamento".)';
      problema = a.textContent;
    }
  } catch (e) {
    console.error(e);
    const a = $('#avisoCfg'); a.classList.remove('oculto');
    const dica = DB.explicarErro(e, true);
    a.innerHTML = `${C.esc(dica || 'Não foi possível carregar as informações agora. Verifique sua internet.')} <span class="dica">(código: ${C.esc(e.code || e.name || 'erro')})</span> <button class="btn peq claro" id="bTentar" type="button">Tentar de novo</button>`;
    $('#bTentar').onclick = () => location.reload();
    if (e.code === 'not-found' || e.code === 'permission-denied') problema = a.textContent;
  }
}

function mostrarProblema() {
  const a = $('#avisoCfg'); a.classList.remove('oculto'); if (!a.textContent.trim()) a.textContent = problema;
  window.scrollTo({ top: 0, behavior: 'smooth' }); toast(problema, true);
}
$('#bAgendar').onclick = () => { if (problema) return mostrarProblema(); ir('vAgendar'); passo(1); };
$('#bConsultar').onclick = () => { if (problema && !cfg.configurada) return mostrarProblema(); ir('vConsulta'); };
$('#lkPriv').onclick = (e) => { e.preventDefault(); ir('vPriv'); };
$$('[data-voltar]').forEach((b) => (b.onclick = () => ir('vInicio')));

// ---------------------------------------------------------------------
//  Passo 1 — dados
// ---------------------------------------------------------------------
function passo(n) {
  $('#f1').classList.toggle('oculto', n !== 1);
  $('#p2').classList.toggle('oculto', n !== 2);
  $('#p3').classList.toggle('oculto', n !== 3);
  $$('#passos li').forEach((li, i) => { li.className = i + 1 === n ? 'at' : i + 1 < n ? 'feito' : ''; });
  window.scrollTo({ top: 0 });
}

$('#cpf').addEventListener('input', (e) => { e.target.value = C.formatarCPF(e.target.value); });
$('#cCpf').addEventListener('input', (e) => { e.target.value = C.formatarCPF(e.target.value); });
$('#tel').addEventListener('input', (e) => { e.target.value = C.formatarTelefone(e.target.value); });
$('#cProt').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
$('#nasc').max = C.hojeBR();

function erroCampo(k, msg) { $(`[data-e="${k}"]`).textContent = msg || ''; }

$('#f1').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const d = {
    nome: C.normalizarNome($('#nome').value), cpf: C.apenasDigitos($('#cpf').value), nascimento: $('#nasc').value,
    telefone: C.apenasDigitos($('#tel').value), email: $('#email').value.trim(), certidao: $('#cert').value,
  };
  let ok = true;
  const v = (k, cond, msg) => { erroCampo(k, cond ? '' : msg); if (!cond) ok = false; };
  v('nome', C.validarNome(d.nome), 'Informe o nome completo (nome e sobrenome).');
  v('cpf', C.validarCPF(d.cpf), 'CPF inválido. Confira os 11 números.');
  v('nasc', C.validarNascimento(d.nascimento), 'Informe uma data de nascimento válida.');
  v('tel', C.validarTelefone(d.telefone), 'Informe o celular com DDD. Ex.: (73) 91234-5678');
  v('email', C.validarEmail(d.email), 'E-mail inválido. Deixe em branco se não tiver.');
  v('cert', ['nascimento', 'casamento'].includes(d.certidao), 'Escolha o tipo de certidão.');
  if (!ok) { $('.erro-campo:not(:empty)')?.previousElementSibling?.focus?.(); return; }
  est.dados = d; est.data = ''; est.hora = '';
  const hoje = C.hojeBR();
  // Abre no mês do primeiro dia que ainda aceita agendamento (no fim do mês, vai direto ao próximo).
  const base = cfg.abertura > hoje ? cfg.abertura : hoje;
  est.mes = base.slice(0, 7);
  const c0 = { ...ctx(), bloqueios: null };
  for (let d = base, i = 0; d <= cfg.fechamento && i < 400; d = C.somarDias(d, 1), i++) {
    if (C.dataAgendavel(d, c0)) { est.mes = d.slice(0, 7); break; }
  }
  passo(2); montarCalendario(); $('#boxHoras').classList.add('oculto'); $('#c2').disabled = true;
});

// ---------------------------------------------------------------------
//  Passo 2 — calendário e horários
// ---------------------------------------------------------------------
function ctx() {
  return { hoje: C.hojeBR(), agora: C.horaAgoraBR(), abertura: cfg.abertura, fechamento: cfg.fechamento, bloqueios: new Set(bloqueios.keys()) };
}

/** Desenha o calendário NA HORA (sem esperar o Firebase) e depois busca os dias bloqueados em segundo plano. */
function montarCalendario() {
  const [y, m] = est.mes.split('-').map(Number);
  $('#mTit').textContent = `${C.MESES[m - 1]} de ${y}`;
  desenharCalendario();
  const mes = est.mes; const ini = `${mes}-01`; const fim = C.ultimoDiaDoMes(mes);
  const aviso = $('#calCarga'); aviso.textContent = 'Verificando datas bloqueadas…'; aviso.classList.remove('oculto');
  DB.lerBloqueios(ini, fim).then((b) => {
    let mudou = false;
    for (const [k, v] of b) if (!bloqueios.has(k)) { bloqueios.set(k, v); mudou = true; }
    aviso.classList.add('oculto');
    if (mudou && mes === est.mes) {
      if (est.data && bloqueios.has(est.data)) { est.data = ''; est.hora = ''; $('#boxHoras').classList.add('oculto'); $('#c2').disabled = true; }
      desenharCalendario();
    }
  }).catch((e) => {
    console.error(e);
    if (mes === est.mes) aviso.textContent = 'Conexão lenta: não foi possível verificar datas bloqueadas agora. Você pode escolher a data; o sistema confere de novo ao confirmar.';
  });
}

function desenharCalendario() {
  const [y, m] = est.mes.split('-').map(Number);
  const ini = `${est.mes}-01`; const fim = C.ultimoDiaDoMes(est.mes);
  const c = ctx();
  const box = $('#cal'); box.innerHTML = '';
  ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach((x) => box.insertAdjacentHTML('beforeend', `<div class="sem">${x}</div>`));
  for (let i = 0; i < C.diaDaSemana(ini); i++) box.insertAdjacentHTML('beforeend', '<button class="dia vazio" tabindex="-1" aria-hidden="true"></button>');
  for (let d = ini; d <= fim; d = C.somarDias(d, 1)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'dia'; b.textContent = Number(d.slice(8));
    const ag = C.dataAgendavel(d, c);
    b.disabled = !ag;
    b.setAttribute('aria-label', C.formatarDataLonga(d) + (ag ? '' : ' — indisponível'));
    if (d === est.data) b.classList.add('sel');
    b.onclick = () => escolherData(d);
    box.appendChild(b);
  }
  const hoje = c.hoje.slice(0, 7);
  $('#mAnt').disabled = est.mes <= hoje || est.mes <= cfg.abertura.slice(0, 7);
  $('#mProx').disabled = est.mes >= cfg.fechamento.slice(0, 7);
}
$('#mAnt').onclick = () => { est.mes = C.somarDias(`${est.mes}-01`, -1).slice(0, 7); montarCalendario(); };
$('#mProx').onclick = () => { est.mes = C.somarDias(`${est.mes}-28`, 8).slice(0, 7); montarCalendario(); };

let tokenDia = 0;
async function escolherData(d) {
  const meu = ++tokenDia;
  est.data = d; est.hora = ''; $('#c2').disabled = true; $('#e2').textContent = '';
  $$('#cal .dia').forEach((b) => b.classList.remove('sel'));
  [...$$('#cal .dia:not(.vazio)')].find((b) => b.getAttribute('aria-label').startsWith(C.formatarDataLonga(d)))?.classList.add('sel');
  $('#hData').textContent = C.formatarData(d);
  $('#boxHoras').classList.remove('oculto');
  const box = $('#horas'); box.innerHTML = '<span class="dica">Carregando horários…</span>';
  $('#semVagas').classList.add('oculto');
  try {
    const ocup = await DB.horariosOcupados(d);
    if (meu !== tokenDia) return; // o cidadão já escolheu outro dia
    const livres = C.horariosLivres(d, ocup, ctx());
    box.innerHTML = '';
    // Livres em verde (clicáveis) e já agendados em vermelho (bloqueados)
    const livresSet = new Set(livres);
    for (const h of C.horariosPossiveis(d, ctx().hoje, ctx().agora)) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = h.replace(':', 'h');
      if (livresSet.has(h)) {
        b.className = 'hora livre'; b.setAttribute('aria-label', `${h.replace(':', 'h')} — disponível`);
        b.onclick = () => { est.hora = h; $$('.hora').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); $('#c2').disabled = false; };
      } else {
        b.className = 'hora ocupado'; b.disabled = true; b.title = 'Horário já agendado';
        b.setAttribute('aria-label', `${h.replace(':', 'h')} — já agendado`);
      }
      box.appendChild(b);
    }
    $('#semVagas').classList.toggle('oculto', livres.length > 0);
  } catch (e) {
    if (meu !== tokenDia) return;
    console.error(e); box.innerHTML = '';
    const motivo = e.code === 'permission-denied' ? 'O sistema ainda não está liberado para consultas (regras do banco não publicadas). Avise o SAC.'
      : e.code === 'not-found' ? 'O banco de dados do sistema ainda não foi criado. Avise o SAC.'
      : 'Verifique sua internet e tente novamente.';
    $('#e2').textContent = `Não foi possível carregar os horários. ${motivo} (código: ${e.code || e.name || 'erro'})`;
  }
}

$('#v2').onclick = () => passo(1);
$('#c2').onclick = () => {
  if (!est.data || !est.hora) return;
  const d = est.dados;
  $('#resumo').innerHTML = `
    <dt>Nome</dt><dd>${C.esc(d.nome)}</dd><dt>CPF</dt><dd>${C.esc(C.mascararCPF(d.cpf))}</dd>
    <dt>Nascimento</dt><dd>${C.formatarData(d.nascimento)}</dd><dt>Celular</dt><dd>${C.esc(C.formatarTelefone(d.telefone))}</dd>
    <dt>E-mail</dt><dd>${C.esc(d.email || '—')}</dd><dt>Certidão</dt><dd>${C.CERTIDOES[d.certidao]}</dd>
    <dt>Data</dt><dd>${C.esc(C.formatarDataLonga(est.data))}</dd><dt>Horário</dt><dd>${est.hora.replace(':', 'h')}</dd>
    <dt>Valor</dt><dd>Gratuito</dd>`;
  $('#lgpd').checked = false; $('#e3').classList.add('oculto');
  passo(3);
};

// ---------------------------------------------------------------------
//  Passo 3 — confirmar (a vaga só vale depois da gravação)
// ---------------------------------------------------------------------
$('#v3').onclick = () => passo(2);
$('#c3').onclick = async () => {
  const e3 = $('#e3'); e3.classList.add('oculto');
  if (!$('#lgpd').checked) { e3.textContent = 'Marque a caixa de concordância para continuar.'; e3.classList.remove('oculto'); return; }
  // revalida tudo imediatamente antes de gravar
  const c = ctx();
  if (!C.dataAgendavel(est.data, c) || !C.horariosPossiveis(est.data, c.hoje, c.agora).includes(est.hora)) {
    e3.textContent = 'Esta data ou horário não está mais disponível. Escolha outro.'; e3.classList.remove('oculto'); return;
  }
  const btn = $('#c3'); setBusy(btn, true, 'Confirmando…');
  const lento = setTimeout(() => { btn.innerHTML = '<span class="spin"></span> Ainda confirmando, aguarde…'; }, 8000);
  try {
    const r = await DB.agendar({ ...est.dados, data: est.data, hora: est.hora });
    mostrarComprovante(r, true);
    $('#f1').reset(); est.dados = null; est.data = ''; est.hora = ''; // não deixa dados pessoais no formulário (computador compartilhado)
  } catch (e) {
    console.error(e);
    if (e instanceof DB.HorarioOcupadoError) {
      e3.textContent = 'Este horário acabou de ser ocupado por outra pessoa. Escolha outro horário.';
      passo(2); await escolherData(est.data); $('#e2').textContent = e3.textContent;
    } else if (e.code === 'incerto' || e.code === 'timeout' || e.code === 'unavailable') {
      e3.innerHTML = `Não conseguimos confirmar o agendamento porque a internet ou o servidor não respondeu. <strong>Nada foi garantido.</strong> Aguarde um minuto, vá em "Consultar ou cancelar agendamento" na página inicial${e.protocolo ? ` (protocolo de referência: <strong>${C.esc(e.protocolo)}</strong>)` : ''} para ver se o horário foi registrado e, se não foi, tente de novo.`;
      e3.classList.remove('oculto');
    } else if (e.code === 'recusado') {
      e3.textContent = 'O agendamento não foi aceito. Só é permitido um agendamento por CPF enquanto a data do anterior não tiver passado: se este CPF já tem um agendamento, use "Consultar ou cancelar" na página inicial (com o protocolo e o CPF). Também pode ser que o horário não esteja mais disponível. Nada foi reservado.';
      e3.classList.remove('oculto');
    } else {
      e3.textContent = `${DB.explicarErro(e, true) || 'Não foi possível confirmar o agendamento. Verifique sua internet e tente novamente.'} Nada foi reservado. (código: ${e.code || e.name || 'erro'})`;
      e3.classList.remove('oculto');
    }
  } finally { clearTimeout(lento); setBusy(btn, false); }
};

// ---------------------------------------------------------------------
//  Comprovante
// ---------------------------------------------------------------------
function mostrarComprovante(comp, novo, extra = {}) {
  const box = $('#compBox');
  const cancelavel = comp.status === 'agendado' && comp.data > C.hojeBR() && extra.chave;
  box.innerHTML = `
    ${novo ? '<div class="ok no-print"><strong>Agendamento confirmado!</strong> Guarde o número de protocolo. Imprima ou salve em PDF.</div>' : ''}
    ${htmlComprovante(comp, cfg)}
    <div class="acoes no-print">
      <button class="btn" id="bImp">🖨️ Imprimir / Salvar em PDF</button>
      <a class="btn claro" id="bMail" href="${linkEmail(comp, cfg, est.dados?.email || '')}">✉️ Abrir no meu e-mail</a>
      ${cancelavel ? '<button class="btn perigo" id="bCanc">Cancelar agendamento</button>' : ''}
      <button class="btn claro" id="bIni">Início</button>
    </div>
    <p class="dica no-print">O botão de e-mail apenas abre o seu aplicativo de e-mail com os dados prontos; o sistema não envia mensagens automáticas.</p>`;
  ir('vComp');
  $('#bImp').onclick = () => window.print();
  $('#bIni').onclick = () => ir('vInicio');
  const bc = $('#bCanc');
  if (bc) bc.onclick = async () => {
    if (!confirm('Cancelar este agendamento? A vaga será liberada para outra pessoa.')) return;
    setBusy(bc, true, 'Cancelando…');
    try { await DB.cancelarCidadao(extra); comp.status = 'cancelado'; mostrarComprovante(comp, false); toast('Agendamento cancelado.'); }
    catch (e) { console.error(e); setBusy(bc, false); toast('Não foi possível cancelar. O cancelamento só é permitido até a véspera do atendimento.', true); }
  };
}

// ---------------------------------------------------------------------
//  Consultar / cancelar
// ---------------------------------------------------------------------
$('#fc').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const e = $('#eC'); e.classList.add('oculto');
  const btn = $('#fc button[type=submit]');
  const prot = $('#cProt').value; const cpf = $('#cCpf').value;
  if (!C.normalizarProtocolo(prot) || !C.validarCPF(cpf)) {
    e.textContent = 'Confira o protocolo (CIN-XXXX-XXXX-XXXX) e o CPF.'; e.classList.remove('oculto'); return;
  }
  setBusy(btn, true, 'Consultando…');
  try {
    const comp = await DB.consultar(prot, cpf);
    if (!comp) { e.textContent = 'Agendamento não encontrado. Confira os dados informados.'; e.classList.remove('oculto'); return; }
    est.dados = null;
    mostrarComprovante(comp, false, comp);
  } catch (err) {
    console.error(err); e.textContent = 'Não foi possível consultar agora. Tente novamente.'; e.classList.remove('oculto');
  } finally { setBusy(btn, false); }
});

iniciar();
