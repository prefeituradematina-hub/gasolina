import * as C from './core.js';
import * as DB from './firebase.js';
import { htmlComprovante } from './comprovante.js';
import { aplicarMarca, processarLogo, logoutOcioso } from './marca.js';

window.__cinOk = true;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let cfg = { ...DB.CONFIG_PADRAO };
let linhas = [];
let relatorio = null;

function toast(msg, erro = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('oculto'), 5000);
}
const tsTxt = (t) => (t && t.toDate ? t.toDate().toLocaleString('pt-BR', { timeZone: C.FUSO }) : '');
const tag = (s) => `<span class="tag ${s}">${C.esc(C.STATUS[s] || s)}</span>`;
function msgErro(e) {
  if (e instanceof DB.HorarioOcupadoError) return 'Esse horário já está ocupado.';
  if (e.code === 'cpf-ja-agendado') return 'Este CPF já possui agendamento ativo.';
  { const x = DB.explicarErro(e); if (x) return x; }
  return 'Erro: ' + (e.message || e);
}

// ---------------------------------------------------------------------
//  Login
// ---------------------------------------------------------------------
if (!DB.configurado) {
  $('#eLogin').classList.remove('oculto');
  $('#eLogin').textContent = 'Preencha o arquivo firebase-config.js antes de usar o painel.';
}
$('#fLogin').addEventListener('submit', async (e) => {
  e.preventDefault(); const er = $('#eLogin'); er.classList.add('oculto');
  try { await DB.entrar($('#lEmail').value.trim(), $('#lSenha').value); }
  catch (x) {
    console.error(x);
    const msgs = {
      'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
      'auth/operation-not-allowed': 'O login por e-mail/senha não está ativado no Firebase (Authentication → Método de login → E-mail/senha).',
      'auth/unauthorized-domain': 'Este endereço do site não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).',
      'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'A apiKey em firebase-config.js é inválida.',
      'auth/invalid-api-key': 'A apiKey em firebase-config.js é inválida.',
      'auth/network-request-failed': 'Sem conexão com o Firebase. Verifique a internet.',
      'auth/user-disabled': 'Este usuário foi desativado no Firebase.',
    };
    er.textContent = msgs[x.code] || 'E-mail ou senha incorretos.';
    er.classList.remove('oculto');
  }
});
$('#bSair').onclick = () => DB.sair();

DB.lerConfig().then((c) => { cfg = c; aplicarMarca(c); }).catch(() => {});
DB.aoMudarLogin(async (u) => {
  if (!u) { $('#login').classList.remove('oculto'); $('#painel').classList.add('oculto'); $('#quem').classList.add('oculto'); return; }
  let admin = false; let falha = null;
  try { admin = await DB.ehAdmin(u.uid); } catch (e) { falha = e; console.error(e); }
  if (falha || !admin) {
    await DB.sair();
    $('#eLogin').textContent = falha
      ? `Não foi possível verificar a permissão (${falha.code || 'erro'}). Confira se as regras do Firestore foram publicadas e se há conexão.`
      : `Este usuário não é administrador. No Firestore, crie a coleção "admins" com um documento cujo ID seja exatamente este UID: ${u.uid}`;
    $('#eLogin').classList.remove('oculto'); return;
  }
  $('#login').classList.add('oculto'); $('#painel').classList.remove('oculto'); $('#quem').classList.remove('oculto');
  $('#quemEmail').textContent = u.email; $('#lSenha').value = '';
  logoutOcioso(() => DB.sair(), 30);
  await iniciarPainel();
});

// ---------------------------------------------------------------------
//  Abas
// ---------------------------------------------------------------------
$$('.aba[data-aba]').forEach((b) => (b.onclick = () => {
  $$('.aba').forEach((x) => x.classList.toggle('at', x === b));
  $$('#painel > section').forEach((s) => s.classList.toggle('oculto', s.id !== 'a-' + b.dataset.aba));
  ({ agend: buscar, vagas: carregarVagas, datas: carregarDatas, aud: carregarAud }[b.dataset.aba] || (() => {}))();
}));

async function iniciarPainel() {
  cfg = await DB.lerConfig(); aplicarMarca(cfg);
  const hoje = C.hojeBR();
  $('#gIni').value = C.somarDias(hoje, -7); $('#gFim').value = C.somarDias(hoje, 30);
  $('#vIni').value = hoje; $('#vFim').value = C.somarDias(hoje, 30);
  $('#rIni').value = hoje.slice(0, 8) + '01'; $('#rFim').value = hoje;
  $('#lgCorte').value = C.somarDias(hoje, -365 * 2);
  $('#gSt').innerHTML = '<option value="">Todas</option>' + Object.entries(C.STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  if (!cfg.configurada) {
    toast('Primeiro acesso: configure o SAC e o período do calendário na aba "Datas e configurações".');
    $$('.aba[data-aba]')[3].click();
  } else buscar();
}

// ---------------------------------------------------------------------
//  Agendamentos
// ---------------------------------------------------------------------
$('#gBuscar').onclick = buscar;
$('#gBusca').addEventListener('keydown', (e) => { if (e.key === 'Enter') buscar(); });

async function buscar() {
  const termo = $('#gBusca').value.trim();
  const st = $('#gSt').value;
  $('#gInfo').textContent = 'Carregando…';
  try {
    let r;
    const dig = C.apenasDigitos(termo);
    const dm = termo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (C.normalizarProtocolo(termo) && /CIN/i.test(termo)) r = await DB.buscarPor('protocolo', C.normalizarProtocolo(termo));
    else if (dig.length === 11 && C.validarCPF(dig)) r = await DB.buscarPor('cpf', dig);
    else if (dm) r = await DB.listarAgendamentos(`${dm[3]}-${dm[2]}-${dm[1]}`, `${dm[3]}-${dm[2]}-${dm[1]}`);
    else {
      r = await DB.listarAgendamentos($('#gIni').value, $('#gFim').value);
      if (termo) { const t = termo.toLowerCase(); r = r.filter((a) => (a.nome || '').toLowerCase().includes(t) || (a.protocolo || '').toLowerCase().includes(t)); }
    }
    if (st) r = r.filter((a) => a.status === st);
    linhas = r.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
    $('#gTb').innerHTML = linhas.map((a) => `<tr>
      <td class="mono">${C.esc(a.protocolo)}</td><td>${C.esc(a.nome)}</td><td class="mono">${C.esc(a.cpfMasc)}</td>
      <td>${C.esc(C.formatarTelefone(a.telefone))}</td><td>${C.esc(C.formatarData(a.data))}</td><td>${C.esc(a.hora)}</td>
      <td>${tag(a.status)}</td><td><button class="btn peq" data-ref="${C.esc(a.ref)}">Abrir</button></td></tr>`).join('')
      || '<tr><td colspan="8">Nenhum agendamento encontrado.</td></tr>';
    $$('#gTb [data-ref]').forEach((b) => (b.onclick = () => detalhe(linhas.find((x) => x.ref === b.dataset.ref))));
    $('#gInfo').textContent = `${linhas.length} agendamento(s).`;
  } catch (e) { console.error(e); $('#gInfo').textContent = ''; toast(msgErro(e), true); }
}

const dlg = $('#dlg');
const abrirDlg = (html) => { $('#dlgCorpo').innerHTML = html; if (!dlg.open) dlg.showModal(); };
const fecharDlg = () => dlg.close();

function detalhe(a) {
  const ativo = ['agendado', 'presente'].includes(a.status);
  abrirDlg(`
    <h3>${C.esc(a.nome)}</h3>
    <dl class="resumo">
      <dt>Protocolo</dt><dd class="mono">${C.esc(a.protocolo)}</dd>
      <dt>CPF</dt><dd><span id="dCpf">${C.esc(a.cpfMasc)}</span> <button class="btn claro peq" id="dVer">mostrar</button></dd>
      <dt>Nascimento</dt><dd>${C.formatarData(a.nascimento)}</dd>
      <dt>Telefone</dt><dd>${C.esc(C.formatarTelefone(a.telefone))}</dd>
      <dt>E-mail</dt><dd>${C.esc(a.email || '—')}</dd>
      <dt>Certidão</dt><dd>${C.CERTIDOES[a.certidao] || ''}</dd>
      <dt>Data / hora</dt><dd>${C.formatarData(a.data)} às ${C.esc(a.hora)}</dd>
      <dt>Situação</dt><dd>${tag(a.status)}</dd>
      <dt>Origem</dt><dd>${a.origem === 'admin' ? 'Cadastro manual' : 'Site'}</dd>
      <dt>Criado em</dt><dd>${tsTxt(a.criadoEm)}</dd><dt>Alterado em</dt><dd>${tsTxt(a.atualizadoEm)}</dd>
      ${a.canceladoEm ? `<dt>Cancelado em</dt><dd>${tsTxt(a.canceladoEm)} (${C.esc(a.canceladoPor || '')})</dd>` : ''}
    </dl>
    <div class="acoes">
      ${a.status === 'agendado' ? '<button class="btn peq" data-a="presente">Registrar presença</button>' : ''}
      ${ativo ? '<button class="btn peq verde" data-a="concluido">Concluir atendimento</button><button class="btn peq" style="background:#8a5300" data-a="faltou">Não compareceu</button><button class="btn peq claro" data-a="remarcar">Alterar data/horário</button><button class="btn peq perigo" data-a="cancelar">Cancelar</button>' : ''}
      <button class="btn peq claro" data-a="hist">Histórico</button>
      <button class="btn peq claro" data-a="comp">Comprovante</button>
      <button class="btn peq claro" data-a="fechar">Fechar</button>
    </div><div id="dExtra"></div>`);
  $('#dVer').onclick = () => { $('#dCpf').textContent = C.formatarCPF(a.cpf); $('#dVer').remove(); };
  $$('#dlgCorpo [data-a]').forEach((b) => (b.onclick = () => acao(a, b.dataset.a)));
}

async function acao(a, qual) {
  const ex = $('#dExtra');
  try {
    if (qual === 'fechar') return fecharDlg();
    if (['presente', 'concluido', 'faltou'].includes(qual)) {
      await DB.adminMarcar(a, qual); toast('Situação atualizada.'); fecharDlg(); return buscar();
    }
    if (qual === 'cancelar') {
      ex.innerHTML = `<label>Motivo do cancelamento</label><input id="xMot" maxlength="120"><div class="acoes"><button class="btn perigo peq" id="xOk">Confirmar cancelamento</button></div>`;
      $('#xOk').onclick = async () => { try { await DB.adminCancelar(a, $('#xMot').value.trim()); toast('Agendamento cancelado. Vaga liberada.'); fecharDlg(); buscar(); } catch (e) { toast(msgErro(e), true); } };
    }
    if (qual === 'remarcar') {
      ex.innerHTML = `<label>Nova data</label><input type="date" id="xData" value="${C.esc(a.data)}"><label>Novo horário</label><select id="xHora"></select><div class="acoes"><button class="btn peq" id="xOk">Salvar</button></div>`;
      const carregar = () => preencherHoras('#xHora', $('#xData').value, a);
      $('#xData').onchange = carregar; carregar();
      $('#xOk').onclick = async () => {
        const d = $('#xData').value; const h = $('#xHora').value;
        if (!h) return toast('Escolha um horário.', true);
        if (d === a.data && h === a.hora) return toast('Nada foi alterado.', true);
        try { await DB.adminAlterarHorario(a, d, h); toast('Agendamento remarcado.'); fecharDlg(); buscar(); } catch (e) { toast(msgErro(e), true); }
      };
    }
    if (qual === 'hist') {
      const h = await DB.listarHistorico(a.ref);
      ex.innerHTML = '<h3 style="margin-top:14px">Histórico de alterações</h3>' + (h.length
        ? '<ul>' + h.map((x) => `<li>${tsTxt(x.em)} — <strong>${C.esc(x.acao)}</strong> ${C.esc(x.detalhe)} <em>(${C.esc(x.email)})</em></li>`).join('') + '</ul>'
        : '<p>Sem registros.</p>');
    }
    if (qual === 'comp') {
      ex.innerHTML = htmlComprovante({ ...a }, cfg) + '<div class="acoes"><button class="btn peq" id="xImp">Imprimir / PDF</button></div>';
      $('#xImp').onclick = () => { document.body.classList.add('imp-dlg'); window.print(); document.body.classList.remove('imp-dlg'); };
    }
  } catch (e) { console.error(e); toast(msgErro(e), true); }
}

/** Preenche <select> só com horários livres (mais o horário atual do próprio agendamento). */
async function preencherHoras(sel, data, atual) {
  const s = $(sel); s.innerHTML = '<option value="">Carregando…</option>';
  if (!C.ehDiaUtil(data)) { s.innerHTML = '<option value="">Escolha um dia útil (seg–sex)</option>'; return; }
  const bl = await DB.lerBloqueios(data, data);
  if (bl.has(data)) { s.innerHTML = '<option value="">Data bloqueada</option>'; return; }
  const oc = await DB.horariosOcupados(data);
  if (atual && atual.data === data) oc.delete(atual.hora);
  const l = C.HORARIOS.filter((h) => !oc.has(h));
  s.innerHTML = l.length ? l.map((h) => `<option ${atual && atual.data === data && atual.hora === h ? 'selected' : ''}>${h}</option>`).join('') : '<option value="">Sem vagas nesta data</option>';
}

// ---------------------------------------------------------------------
//  Controle de vagas
// ---------------------------------------------------------------------
$('#vBuscar').onclick = carregarVagas;
async function carregarVagas() {
  try {
    const ini = $('#vIni').value; const fim = $('#vFim').value;
    const [lista, bl] = await Promise.all([DB.listarAgendamentos(ini, fim), DB.listarBloqueios()]);
    const bloq = new Set(bl.map((b) => b.id));
    const por = C.agruparPor(lista, (a) => a.data);
    const dias = C.intervaloDatas(ini, fim).filter((d) => C.ehDiaUtil(d));
    $('#vTb').innerHTML = dias.map((d) => {
      const r = C.resumoDia(por.get(d) || []); const pct = Math.round((r.ocupadas / r.total) * 100);
      return `<tr><td>${C.formatarData(d)}</td><td>${C.DIAS_SEMANA[C.diaDaSemana(d)]}${bloq.has(d) ? ' <span class="tag cancelado">bloqueada</span>' : ''}</td>
        <td>${r.total}</td><td>${r.ocupadas}</td><td><strong>${r.disponiveis} de ${r.total}</strong></td><td>${r.concluidos}</td><td>${r.cancelamentos}</td><td>${r.faltas}</td>
        <td><div class="barra-oc"><i class="${pct >= 100 ? 'cheio' : ''}" style="width:${pct}%"></i></div></td></tr>`;
    }).join('') || '<tr><td colspan="9">Sem dias úteis no período.</td></tr>';
  } catch (e) { console.error(e); toast(msgErro(e), true); }
}

// ---------------------------------------------------------------------
//  Novo agendamento (manual)
// ---------------------------------------------------------------------
$('#nCpf').addEventListener('input', (e) => { e.target.value = C.formatarCPF(e.target.value); });
$('#nTel').addEventListener('input', (e) => { e.target.value = C.formatarTelefone(e.target.value); });
$('#nData').addEventListener('change', () => preencherHoras('#nHora', $('#nData').value));
$('#nForm').addEventListener('submit', async (ev) => {
  ev.preventDefault(); const er = $('#nErro'); er.classList.add('oculto');
  const d = { nome: C.normalizarNome($('#nNome').value), cpf: C.apenasDigitos($('#nCpf').value), nascimento: $('#nNasc').value, telefone: C.apenasDigitos($('#nTel').value), email: $('#nEmail').value.trim(), certidao: $('#nCert').value, data: $('#nData').value, hora: $('#nHora').value };
  const erros = [];
  if (!C.validarNome(d.nome)) erros.push('Nome completo inválido.');
  if (!C.validarCPF(d.cpf)) erros.push('CPF inválido.');
  if (!C.validarNascimento(d.nascimento)) erros.push('Nascimento inválido.');
  if (!C.validarTelefone(d.telefone)) erros.push('Telefone inválido.');
  if (!C.validarEmail(d.email)) erros.push('E-mail inválido.');
  if (!C.ehDiaUtil(d.data)) erros.push('A data precisa ser segunda a sexta.');
  if (!C.HORARIOS.includes(d.hora)) erros.push('Escolha um horário.');
  if (erros.length) { er.textContent = erros.join(' '); er.classList.remove('oculto'); return; }
  try {
    const r = await DB.adminCriar(d);
    toast(`Cadastrado. Protocolo ${r.protocolo}`); $('#nForm').reset(); $('#nHora').innerHTML = '<option value="">Escolha a data primeiro</option>';
  } catch (e) { console.error(e); er.textContent = msgErro(e); er.classList.remove('oculto'); if (e instanceof DB.HorarioOcupadoError) preencherHoras('#nHora', d.data); }
});

// ---------------------------------------------------------------------
//  Datas e configurações
// ---------------------------------------------------------------------
let logoAtual = '';
function mostrarLogo(url) {
  logoAtual = url || '';
  aplicarMarca({ ...cfg, logo: logoAtual });
  $('#logoInfo').textContent = logoAtual ? `Logo em uso (${Math.round(logoAtual.length / 1365)} KB).` : 'PNG, JPG ou WebP. É reduzida automaticamente.';
}

async function carregarDatas() {
  cfg = await DB.lerConfig();
  $('#cNomeSAC').value = cfg.nomeSAC; $('#cMun').value = cfg.municipio; $('#cLocal').value = cfg.local; $('#cEnd').value = cfg.endereco;
  $('#cTel').value = cfg.telefone; $('#cMail').value = cfg.email; $('#cAviso').value = cfg.aviso || ''; $('#cEnc').value = cfg.encarregado || '';
  const cor = C.corValida(cfg.corPrincipal) ? cfg.corPrincipal : C.COR_PADRAO;
  $('#cCor').value = cor; $('#cCorTxt').value = cor;
  $('#cPeriodo').textContent = `${C.formatarData(cfg.abertura)} a ${C.formatarData(cfg.fechamento)}`;
  mostrarLogo(cfg.logo);
}

// logo
$('#logoEscolher').onclick = () => $('#logoArq').click();
$('#logoArq').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const url = await processarLogo(f);
    await DB.salvarLogo(url); cfg.logo = url; mostrarLogo(url); toast('Logo salva.');
  } catch (x) { console.error(x); toast(x.message || msgErro(x), true); }
};
$('#logoRemover').onclick = async () => {
  if (!logoAtual) return toast('Não há logo para remover.', true);
  if (!confirm('Remover a logo?')) return;
  try { await DB.salvarLogo(''); cfg.logo = ''; mostrarLogo(''); toast('Logo removida.'); } catch (x) { toast(msgErro(x), true); }
};

// cor
$('#cCor').oninput = () => { $('#cCorTxt').value = $('#cCor').value; };
$('#cCorTxt').oninput = () => { if (C.corValida($('#cCorTxt').value)) $('#cCor').value = $('#cCorTxt').value; };
$('#cCorPadrao').onclick = () => { $('#cCor').value = C.COR_PADRAO; $('#cCorTxt').value = C.COR_PADRAO; };

$('#cForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const er = $('#cErro'); er.classList.add('oculto');
  const c = {
    nomeSAC: $('#cNomeSAC').value.trim(), municipio: $('#cMun').value.trim(), local: $('#cLocal').value.trim(), endereco: $('#cEnd').value.trim(),
    telefone: $('#cTel').value.trim(), email: $('#cMail').value.trim(), aviso: $('#cAviso').value.trim(), encarregado: $('#cEnc').value.trim(),
    corPrincipal: $('#cCorTxt').value.trim() || C.COR_PADRAO,
  };
  const erros = [];
  if (!c.nomeSAC) erros.push('Informe o nome do SAC.');
  if (!c.municipio) erros.push('Informe o município.');
  if (!c.endereco) erros.push('Informe o endereço.');
  if (!C.corValida(c.corPrincipal)) erros.push('Cor inválida (use o formato #0b4f9c).');
  if (!C.validarEmail(c.email)) erros.push('E-mail de contato inválido.');
  if (erros.length) { er.textContent = erros.join(' '); er.classList.remove('oculto'); return; }
  // Garante que o período exista no documento (as regras do Firestore dependem dele)
  c.abertura = cfg.abertura; c.fechamento = cfg.fechamento;
  try { await DB.salvarConfig(c); cfg = { ...cfg, ...c, configurada: true }; aplicarMarca(cfg); toast('Configurações salvas.'); }
  catch (x) { console.error(x); toast(msgErro(x), true); }
});

// ---------------------------------------------------------------------
//  Relatórios
// ---------------------------------------------------------------------
$('#rGerar').onclick = async () => {
  try {
    const ini = $('#rIni').value; const fim = $('#rFim').value; const tipo = $('#rTipo').value;
    const lista = await DB.listarAgendamentos(ini, fim);
    const por = C.agruparPor(lista, (a) => (tipo === 'mes' ? a.data.slice(0, 7) : a.data));
    const chaves = tipo === 'mes' ? [...new Set(C.intervaloDatas(ini, fim).map((d) => d.slice(0, 7)))] : C.intervaloDatas(ini, fim).filter(C.ehDiaUtil);
    const bloq = new Set((await DB.listarBloqueios()).map((b) => b.id));
    const rows = chaves.map((k) => {
      const r = C.resumoDia(por.get(k) || []);
      const dias = tipo === 'mes'
        ? C.intervaloDatas(k + '-01' > ini ? k + '-01' : ini, C.ultimoDiaDoMes(k) < fim ? C.ultimoDiaDoMes(k) : fim).filter((d) => C.ehDiaUtil(d) && !bloq.has(d)).length
        : (bloq.has(k) ? 0 : 1);
      const capacidade = dias * C.TOTAL_VAGAS;
      return { periodo: tipo === 'mes' ? `${k.slice(5)}/${k.slice(0, 4)}` : C.formatarData(k), agendados: r.ocupadas, concluidos: r.concluidos, cancelamentos: r.cancelamentos, faltas: r.faltas, capacidade, disponiveis: Math.max(0, capacidade - r.ocupadas), ocupacao: capacidade ? Math.round((r.ocupadas / capacidade) * 100) : 0 };
    });
    const tot = rows.reduce((t, r) => ({ agendados: t.agendados + r.agendados, concluidos: t.concluidos + r.concluidos, cancelamentos: t.cancelamentos + r.cancelamentos, faltas: t.faltas + r.faltas, capacidade: t.capacidade + r.capacidade, disponiveis: t.disponiveis + r.disponiveis }), { agendados: 0, concluidos: 0, cancelamentos: 0, faltas: 0, capacidade: 0, disponiveis: 0 });
    tot.ocupacao = tot.capacidade ? Math.round((tot.agendados / tot.capacidade) * 100) : 0;
    relatorio = { ini, fim, tipo, rows, tot, lista };
    $('#rKpis').innerHTML = [['Cidadãos agendados', tot.agendados], ['Atendimentos concluídos', tot.concluidos], ['Cancelamentos', tot.cancelamentos], ['Não comparecimentos', tot.faltas], ['Vagas disponíveis', tot.disponiveis], ['Ocupação', tot.ocupacao + '%']].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('');
    $('#rTh').innerHTML = `<tr><th>${tipo === 'mes' ? 'Mês' : 'Dia'}</th><th>Agendados</th><th>Concluídos</th><th>Cancelamentos</th><th>Faltas</th><th>Vagas</th><th>Disponíveis</th><th>Ocupação</th></tr>`;
    $('#rTb').innerHTML = rows.map((r) => `<tr><td>${r.periodo}</td><td>${r.agendados}</td><td>${r.concluidos}</td><td>${r.cancelamentos}</td><td>${r.faltas}</td><td>${r.capacidade}</td><td>${r.disponiveis}</td><td>${r.ocupacao}%</td></tr>`).join('');
    $('#rPdf').disabled = $('#rXls').disabled = false;
  } catch (e) { console.error(e); toast(msgErro(e), true); }
};
const cabRel = ['Período', 'Agendados', 'Concluídos', 'Cancelamentos', 'Faltas', 'Vagas', 'Disponíveis', 'Ocupação'];
const linhaRel = (r) => [r.periodo, r.agendados, r.concluidos, r.cancelamentos, r.faltas, r.capacidade, r.disponiveis, r.ocupacao + '%'];

$('#rPdf').onclick = () => {
  const { jsPDF } = window.jspdf; const doc = new jsPDF();
  doc.setFontSize(14); doc.text(`${cfg.nomeSAC} — Relatório de agendamentos da CIN`, 14, 16);
  doc.setFontSize(10); doc.text(`Período: ${C.formatarData(relatorio.ini)} a ${C.formatarData(relatorio.fim)}  |  Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: C.FUSO })}`, 14, 23);
  const t = relatorio.tot;
  doc.text(`Agendados: ${t.agendados}  Concluídos: ${t.concluidos}  Cancelamentos: ${t.cancelamentos}  Faltas: ${t.faltas}  Vagas disponíveis: ${t.disponiveis}  Ocupação: ${t.ocupacao}%`, 14, 30);
  doc.autoTable({ startY: 35, head: [cabRel], body: relatorio.rows.map(linhaRel), foot: [['Total', t.agendados, t.concluidos, t.cancelamentos, t.faltas, t.capacidade, t.disponiveis, t.ocupacao + '%']], styles: { fontSize: 8 } });
  doc.save(`relatorio-cin-${relatorio.ini}-a-${relatorio.fim}.pdf`);
};
$('#rXls').onclick = () => {
  const wb = XLSX.utils.book_new(); const t = relatorio.tot;
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cabRel, ...relatorio.rows.map(linhaRel), ['Total', t.agendados, t.concluidos, t.cancelamentos, t.faltas, t.capacidade, t.disponiveis, t.ocupacao + '%']]), 'Resumo');
  const det = [['Protocolo', 'Nome', 'CPF', 'Data', 'Hora', 'Situação']].concat(relatorio.lista.map((a) => [a.protocolo, a.nome, a.cpfMasc, C.formatarData(a.data), a.hora, C.STATUS[a.status] || a.status]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(det), 'Agendamentos');
  XLSX.writeFile(wb, `relatorio-cin-${relatorio.ini}-a-${relatorio.fim}.xlsx`);
};

// ---------------------------------------------------------------------
//  Backup / LGPD / Auditoria
// ---------------------------------------------------------------------
$('#bkBaixar').onclick = async () => {
  try {
    toast('Gerando backup…'); const txt = await DB.gerarBackup();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = `backup-cin-${C.hojeBR()}.json`; a.click(); URL.revokeObjectURL(a.href); toast('Backup baixado.');
  } catch (e) { console.error(e); toast(msgErro(e), true); }
};
$('#bkRest').onclick = async () => {
  const f = $('#bkArq').files[0]; if (!f) return toast('Escolha o arquivo de backup.', true);
  if (!confirm('Restaurar este backup? Os documentos do arquivo sobrescrevem os atuais.')) return;
  try { const n = await DB.restaurarBackup(await f.text()); toast(`Backup restaurado (${n} documentos).`); } catch (e) { console.error(e); toast(msgErro(e), true); }
};
$('#lgRun').onclick = async () => {
  const c = $('#lgCorte').value; if (!C.dataValida(c)) return toast('Data inválida.', true);
  if (!confirm(`Apagar dados pessoais de atendimentos encerrados antes de ${C.formatarData(c)}? Não dá para desfazer (só restaurando backup).`)) return;
  try { const n = await DB.anonimizarAntes(c); toast(`${n} registro(s) anonimizado(s).`); } catch (e) { console.error(e); toast(msgErro(e), true); }
};
async function carregarAud() {
  try {
    const l = await DB.listarAuditoria();
    $('#auTb').innerHTML = l.map((x) => `<tr><td>${tsTxt(x.em)}</td><td>${C.esc(x.email)}</td><td>${C.esc(x.acao)}</td><td>${C.esc(x.detalhe)}</td></tr>`).join('') || '<tr><td colspan="4">Sem registros.</td></tr>';
  } catch (e) { toast(msgErro(e), true); }
}
