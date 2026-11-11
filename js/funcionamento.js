import * as C from './core.js';
import * as DB from './firebase.js';
import { aplicarMarca, logoutOcioso } from './marca.js';

window.__cinOk = true;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const hoje = C.hojeBR();
const est = {
  cfg: null, mes: hoje.slice(0, 7), bloq: new Map(), ags: [], sel: new Set(), ancora: '', sug: [],
};

function toast(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('oculto'), 4500);
}
const msgErro = (e) => DB.explicarErro(e) || 'Erro: ' + (e.message || e);

// ---------------------------------------------------------------------
//  Login
// ---------------------------------------------------------------------
$('#fLogin').addEventListener('submit', async (e) => {
  e.preventDefault(); const er = $('#eLogin'); er.classList.add('oculto');
  try { await DB.entrar($('#lEmail').value.trim(), $('#lSenha').value); }
  catch (x) { er.textContent = x.code === 'auth/too-many-requests' ? 'Muitas tentativas. Aguarde alguns minutos.' : 'E-mail ou senha incorretos.'; er.classList.remove('oculto'); }
});
$('#bSair').onclick = () => DB.sair();
DB.lerConfig().then((c) => aplicarMarca(c)).catch(() => {});
DB.aoMudarLogin(async (u) => {
  if (!u) { $('#login').classList.remove('oculto'); $('#painel').classList.add('oculto'); $('#quem').classList.add('oculto'); return; }
  if (!(await DB.ehAdmin(u.uid).catch(() => false))) { await DB.sair(); $('#eLogin').textContent = 'Este usuário não tem permissão de administrador.'; $('#eLogin').classList.remove('oculto'); return; }
  $('#login').classList.add('oculto'); $('#painel').classList.remove('oculto'); $('#quem').classList.remove('oculto'); $('#quemEmail').textContent = u.email;
  logoutOcioso(() => DB.sair(), 30);
  await iniciar();
});

async function iniciar() {
  est.cfg = await DB.lerConfig();
  $('#pAb').value = est.cfg.abertura; $('#pFe').value = est.cfg.fechamento;
  const ano = Number(hoje.slice(0, 4));
  $('#fAno').innerHTML = [ano, ano + 1].map((a) => `<option>${a}</option>`).join('');
  if (!est.cfg.configurada) toast('Defina o período de agendamento e salve para abrir a agenda ao público.');
  await carregarMes();
}

// ---------------------------------------------------------------------
//  Dados do mês
// ---------------------------------------------------------------------
async function carregarMes() {
  const mes = est.mes; const ini = `${mes}-01`; const fim = C.ultimoDiaDoMes(mes);
  est.ags = est.ags.filter((a) => a.data.startsWith(mes)); // não mostra dados de outro mês enquanto carrega
  desenhar(); // calendário aparece já; números chegam em seguida
  try {
    const [bl, ags] = await Promise.all([DB.comTimeout(DB.listarBloqueios()), DB.comTimeout(DB.listarAgendamentos(ini, fim))]);
    if (mes !== est.mes) return;
    est.bloq = new Map(bl.map((b) => [b.id, b])); est.ags = ags;
    desenhar();
  } catch (e) { console.error(e); toast(e.code === 'timeout' ? 'Conexão lenta. Os dados do mês ainda não chegaram — tente novamente.' : msgErro(e), true); }
}

const ativosDe = (d) => est.ags.filter((a) => a.data === d && C.OCUPAM_VAGA.includes(a.status)).length;
const reservasAtivasDe = (d) => est.ags.filter((a) => a.data === d && ['agendado', 'presente'].includes(a.status)).length;

function estadoDia(d) {
  if (!C.ehDiaUtil(d)) return 'fds';
  if (est.bloq.has(d)) return 'bloqueado';
  const { abertura, fechamento } = est.cfg;
  if (d < hoje) return 'passado';
  if (d < abertura || d > fechamento) return 'fora';
  return 'aberto';
}

// ---------------------------------------------------------------------
//  Calendário
// ---------------------------------------------------------------------
function desenhar() {
  const [y, m] = est.mes.split('-').map(Number);
  $('#mTit').textContent = `${C.MESES[m - 1]} de ${y}`;
  const ini = `${est.mes}-01`; const fim = C.ultimoDiaDoMes(est.mes);
  const box = $('#cal'); box.innerHTML = '';
  for (let i = 0; i < C.diaDaSemana(ini); i++) box.insertAdjacentHTML('beforeend', '<button class="fx-dia vazio" tabindex="-1" aria-hidden="true"></button>');
  for (let d = ini; d <= fim; d = C.somarDias(d, 1)) {
    const st = estadoDia(d); const b = document.createElement('button'); b.type = 'button'; b.dataset.d = d;
    const ocup = ativosDe(d);
    let label = ''; let barra = '';
    if (st === 'aberto') { label = ocup >= C.TOTAL_VAGAS ? 'lotado' : `${ocup}/${C.TOTAL_VAGAS}`; barra = `<span class="bar"><i style="width:${Math.round(ocup / C.TOTAL_VAGAS * 100)}%"></i></span>`; }
    else if (st === 'bloqueado') label = est.bloq.get(d).motivo || 'Bloqueado';
    else if (st === 'fora' || st === 'passado') label = ocup ? `${ocup} atend.` : '—';
    b.className = `fx-dia ${st === 'bloqueado' ? 'bloq' : ''} ${st === 'fora' || st === 'passado' ? 'fora' : ''} ${ocup >= C.TOTAL_VAGAS && st === 'aberto' ? 'cheio' : ''} ${d === hoje ? 'hoje' : ''} ${est.sel.has(d) ? 'sel' : ''}`;
    b.innerHTML = `<span class="n">${Number(d.slice(8))}</span><span class="l">${C.esc(label)}</span>${barra}`;
    b.setAttribute('aria-label', `${C.formatarDataLonga(d)} — ${{ fds: 'sem atendimento', bloqueado: 'bloqueado', passado: 'passado', fora: 'fora do período', aberto: 'aberto' }[st]}`);
    b.setAttribute('aria-pressed', est.sel.has(d));
    if (st === 'fds') b.disabled = true; else b.onclick = (ev) => clicarDia(d, ev);
    box.appendChild(b);
  }
  resumo(); painelSelecao();
}

function resumo() {
  const { abertura, fechamento } = est.cfg;
  const ini = abertura < hoje ? hoje : abertura;
  const dias = C.intervaloDatas(ini, fechamento).filter(C.ehDiaUtil);
  const abertos = dias.filter((d) => !est.bloq.has(d)).length;
  const bl = dias.length - abertos;
  const mesBloq = [...est.bloq.keys()].filter((d) => d.startsWith(est.mes) && C.ehDiaUtil(d)).length;
  const diasMes = C.intervaloDatas(`${est.mes}-01`, C.ultimoDiaDoMes(est.mes)).filter(C.ehDiaUtil);
  const ocupMes = diasMes.reduce((t, d) => t + ativosDe(d), 0);
  $('#resumo').innerHTML = [
    [abertos, 'dias abertos no período'], [bl, 'dias bloqueados no período'], [abertos * C.TOTAL_VAGAS, 'vagas no período'],
    [diasMes.length - mesBloq, 'dias úteis abertos no mês'], [ocupMes, 'agendamentos no mês'],
  ].map(([v, l]) => `<div class="fx-res"><b>${v}</b><span>${l}</span></div>`).join('');
}

function clicarDia(d, ev) {
  if (ev.shiftKey && est.ancora) {
    const [a, b] = [est.ancora, d].sort();
    C.intervaloDatas(a, b).filter((x) => C.ehDiaUtil(x)).forEach((x) => est.sel.add(x));
  } else if (ev.ctrlKey || ev.metaKey) {
    est.sel.has(d) ? est.sel.delete(d) : est.sel.add(d); est.ancora = d;
  } else {
    const unico = est.sel.size === 1 && est.sel.has(d);
    est.sel.clear(); if (!unico) est.sel.add(d); est.ancora = d;
  }
  desenhar();
}

// ---------------------------------------------------------------------
//  Painel de seleção — bloquear / reabrir
// ---------------------------------------------------------------------
function painelSelecao() {
  const box = $('#selInfo'); const sel = [...est.sel].sort();
  if (!sel.length) { box.className = 'fx-vazio'; box.textContent = 'Nenhum dia selecionado.'; return; }
  box.className = '';
  const bloqueados = sel.filter((d) => est.bloq.has(d)); const livres = sel.filter((d) => !est.bloq.has(d));
  if (sel.length === 1) {
    const d = sel[0]; const st = estadoDia(d); const oc = ativosDe(d);
    box.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${C.esc(C.formatarDataLonga(d))}</div>
      <span class="fx-chip ${st === 'bloqueado' ? 'bad' : st === 'aberto' ? 'ok' : ''}">${{ bloqueado: 'Bloqueado', aberto: 'Aberto', fora: 'Fora do período', passado: 'Passado' }[st]}</span>
      <p style="margin:10px 0 0" class="fx-vazio">Vagas ocupadas: <strong style="color:var(--fg)">${oc} de ${C.TOTAL_VAGAS}</strong>${st === 'bloqueado' && est.bloq.get(d).motivo ? `<br>Motivo: ${C.esc(est.bloq.get(d).motivo)}` : ''}</p>`;
  } else box.innerHTML = `<div style="font-weight:600">${sel.length} dias selecionados</div><p class="fx-vazio" style="margin:4px 0 0">${livres.length} aberto(s) · ${bloqueados.length} bloqueado(s)</p>`;
  let acoes = '';
  if (livres.length) acoes += `<label for="sMot">Motivo do bloqueio</label><input id="sMot" maxlength="80" placeholder="Ex.: Feriado, férias coletivas">
    <div class="acoes"><button class="btn" id="sBloq">Bloquear ${livres.length} dia(s)</button></div>`;
  if (bloqueados.length) acoes += `<div class="acoes"><button class="btn claro" id="sAbrir">Reabrir ${bloqueados.length} dia(s)</button></div>`;
  acoes += '<div class="acoes" style="margin-top:8px"><button class="btn claro peq" id="sLimpar">Limpar seleção</button></div>';
  box.insertAdjacentHTML('beforeend', acoes);
  $('#sLimpar').onclick = () => { est.sel.clear(); desenhar(); };
  if ($('#sBloq')) $('#sBloq').onclick = () => bloquear(livres, $('#sMot').value.trim());
  if ($('#sAbrir')) $('#sAbrir').onclick = () => reabrir(bloqueados);
}

async function bloquear(dias, motivo) {
  const ativos = (await Promise.all(dias.map(async (d) => (est.ags.some((a) => a.data === d) ? reservasAtivasDe(d)
    : (d.startsWith(est.mes) ? 0 : (await DB.listarAgendamentos(d, d)).filter((a) => ['agendado', 'presente'].includes(a.status)).length))))).reduce((a, b) => a + b, 0);
  if (ativos && !confirm(`Há ${ativos} agendamento(s) ativo(s) nesses dias. Eles NÃO são cancelados automaticamente — remarque ou cancele no painel. Bloquear mesmo assim?`)) return;
  try {
    await DB.bloquearVarias(dias.map((data) => ({ data, motivo })));
    toast(`${dias.length} dia(s) bloqueado(s).`); est.sel.clear(); await carregarMes();
  } catch (e) { console.error(e); toast(msgErro(e), true); }
}

async function reabrir(dias) {
  try { await DB.desbloquearVarias(dias); toast(`${dias.length} dia(s) reaberto(s).`); est.sel.clear(); await carregarMes(); }
  catch (e) { console.error(e); toast(msgErro(e), true); }
}

// ---------------------------------------------------------------------
//  Navegação do mês
// ---------------------------------------------------------------------
$('#mAnt').onclick = () => { est.mes = C.somarDias(`${est.mes}-01`, -1).slice(0, 7); carregarMes(); };
$('#mProx').onclick = () => { est.mes = C.somarDias(C.ultimoDiaDoMes(est.mes), 1).slice(0, 7); carregarMes(); };
$('#mHoje').onclick = () => { est.mes = hoje.slice(0, 7); carregarMes(); };

// ---------------------------------------------------------------------
//  Período
// ---------------------------------------------------------------------
$$('[data-dias]').forEach((b) => (b.onclick = () => {
  const ab = $('#pAb').value && $('#pAb').value >= hoje ? $('#pAb').value : hoje;
  $('#pAb').value = ab; $('#pFe').value = C.somarDias(ab, Number(b.dataset.dias));
}));
$('#pSalvar').onclick = async () => {
  const ab = $('#pAb').value; const fe = $('#pFe').value; const er = $('#pErro'); er.classList.add('oculto');
  if (!C.dataValida(ab) || !C.dataValida(fe) || fe < ab) { er.textContent = 'Informe um período válido (a data final não pode ser anterior à inicial).'; er.classList.remove('oculto'); return; }
  const antes = est.cfg.configurada;
  try { await DB.salvarPeriodo(ab, fe); est.cfg = { ...est.cfg, abertura: ab, fechamento: fe, configurada: true }; toast(antes ? 'Período salvo.' : 'Período salvo. Agora complete nome e endereço em Painel › Configurações.'); desenhar(); }
  catch (e) { console.error(e); toast(msgErro(e), true); }
};

// ---------------------------------------------------------------------
//  Feriados sugeridos
// ---------------------------------------------------------------------
const ROTULO = { feriado: 'Feriado', facultativo: 'Ponto facultativo', 'estadual-ba': 'Estadual (BA)' };
$('#fVer').onclick = () => {
  const ano = Number($('#fAno').value);
  est.sug = C.feriadosDoAno(ano).filter((f) => C.ehDiaUtil(f.data) && f.data >= hoje && !est.bloq.has(f.data));
  const box = $('#fBox'); box.classList.remove('oculto');
  $('#fLista').innerHTML = est.sug.length ? est.sug.map((f, i) => `<li><input type="checkbox" id="fs${i}" data-i="${i}" ${f.tipo === 'feriado' ? 'checked' : ''}>
      <label for="fs${i}" style="margin:0;display:flex;gap:8px;flex:1;color:inherit;font-size:inherit;font-weight:400"><span class="d">${C.formatarData(f.data)}</span><span>${C.esc(f.nome)} <span class="fx-vazio">· ${ROTULO[f.tipo]}</span></span></label></li>`).join('')
    : '<li class="fx-vazio">Nenhum feriado novo em dia útil neste ano.</li>';
  $('#fAplicar').classList.toggle('oculto', !est.sug.length);
};
$('#fAplicar').onclick = async () => {
  const itens = $$('#fLista input:checked').map((c) => est.sug[Number(c.dataset.i)]).map((f) => ({ data: f.data, motivo: f.nome }));
  if (!itens.length) return toast('Marque ao menos uma data.', true);
  try { await DB.bloquearVarias(itens); toast(`${itens.length} feriado(s) bloqueado(s).`); $('#fBox').classList.add('oculto'); await carregarMes(); }
  catch (e) { console.error(e); toast(msgErro(e), true); }
};
