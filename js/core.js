// =====================================================================
//  core.js — regras de negócio puras (sem Firebase, sem DOM).
//  Usado pelo site e pelos testes automatizados (Node).
// =====================================================================

export const TOTAL_VAGAS = 20;
export const FUSO = 'America/Sao_Paulo';

const pad2 = (n) => String(n).padStart(2, '0');

/** 08:00, 08:15 ... 12:45  (exatamente 20 horários) */
export const HORARIOS = (() => {
  const r = [];
  for (let i = 0; i < TOTAL_VAGAS; i++) {
    const m = 8 * 60 + i * 15;
    r.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
  }
  return r;
})();

export const STATUS = {
  agendado: 'Agendado',
  presente: 'Presente',
  concluido: 'Concluído',
  faltou: 'Não compareceu',
  cancelado: 'Cancelado',
};
/** Situações que ocupam uma vaga do dia. */
export const OCUPAM_VAGA = ['agendado', 'presente', 'concluido', 'faltou'];

export const CERTIDOES = {
  nascimento: 'Certidão de nascimento',
  casamento: 'Certidão de casamento',
};

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'];

// ---------------------------------------------------------------------
//  Datas (sempre texto AAAA-MM-DD, fuso de Brasília)
// ---------------------------------------------------------------------
function partesBR(now) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {}; for (const p of f.formatToParts(now)) o[p.type] = p.value;
  if (o.hour === '24') o.hour = '00';
  return o;
}

/** Data de hoje no fuso de Brasília (AAAA-MM-DD), independente do relógio/fuso do aparelho. */
export function hojeBR(now = new Date()) {
  const o = partesBR(now); return `${o.year}-${o.month}-${o.day}`;
}

export function horaAgoraBR(now = new Date()) {
  const o = partesBR(now); return `${o.hour}:${o.minute}`;
}

export function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** 0 = domingo ... 6 = sábado */
export function diaDaSemana(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function ehDiaUtil(s) {
  if (!dataValida(s)) return false;
  const w = diaDaSemana(s);
  return w >= 1 && w <= 5;
}

export function somarDias(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function formatarData(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export function formatarDataLonga(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${DIAS_SEMANA[diaDaSemana(s)]}, ${d} de ${MESES[m - 1]} de ${y}`;
}

export function hojeMaisDias(n, now = new Date()) {
  return somarDias(hojeBR(now), n);
}

/** Todas as datas de ini..fim (inclusive). */
export function intervaloDatas(ini, fim) {
  const r = [];
  if (!dataValida(ini) || !dataValida(fim)) return r;
  for (let d = ini; d <= fim && r.length < 800; d = somarDias(d, 1)) r.push(d);
  return r;
}

/** "2026-11" -> "2026-11-30" */
export function ultimoDiaDoMes(aaaamm) {
  const [y, m] = aaaamm.split('-').map(Number);
  return somarDias(`${m === 12 ? y + 1 : y}-${pad2(m === 12 ? 1 : m + 1)}-01`, -1);
}

export function slotId(data, hora) {
  return `${data}_${hora}`;
}

// ---------------------------------------------------------------------
//  Disponibilidade
// ---------------------------------------------------------------------
/**
 * Horários ainda possíveis de uma data (ignora vagas ocupadas; só tira
 * horários que já passaram quando a data é hoje).
 */
export function horariosPossiveis(data, hoje, agora) {
  if (!ehDiaUtil(data)) return [];
  if (data < hoje) return [];
  if (data === hoje) return HORARIOS.filter((h) => h > agora);
  return [...HORARIOS];
}

/**
 * A data pode receber agendamento do cidadão?
 * ctx = { hoje, agora, abertura, fechamento, bloqueios:Set<string> }
 */
export function dataAgendavel(data, ctx) {
  if (!ehDiaUtil(data)) return false;
  if (data < ctx.hoje) return false;
  if (ctx.abertura && data < ctx.abertura) return false;
  if (ctx.fechamento && data > ctx.fechamento) return false;
  if (ctx.bloqueios && ctx.bloqueios.has(data)) return false;
  return horariosPossiveis(data, ctx.hoje, ctx.agora).length > 0;
}

export function horariosLivres(data, ocupados, ctx) {
  const occ = ocupados instanceof Set ? ocupados : new Set(ocupados);
  if (!dataAgendavel(data, ctx)) return [];
  return horariosPossiveis(data, ctx.hoje, ctx.agora).filter((h) => !occ.has(h));
}

/** Dias úteis (seg-sex) de ini..fim que não estão bloqueados. */
export function diasUteisAbertos(ini, fim, bloqueios = new Set()) {
  return intervaloDatas(ini, fim).filter((d) => ehDiaUtil(d) && !bloqueios.has(d));
}

// ---------------------------------------------------------------------
//  Validações (usadas no navegador; as regras do Firestore repetem as
//  principais no servidor)
// ---------------------------------------------------------------------
export const apenasDigitos = (s) => String(s ?? '').replace(/\D+/g, '');

export function validarCPF(valor) {
  const c = apenasDigitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base) => {
    let soma = 0;
    for (let i = 0; i < base; i++) soma += Number(c[i]) * (base + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export function formatarCPF(valor) {
  const c = apenasDigitos(valor).slice(0, 11);
  return c.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

/** ***.456.789-** */
export function mascararCPF(valor) {
  const c = apenasDigitos(valor);
  if (c.length !== 11) return '***.***.***-**';
  return `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;
}

export function validarTelefone(valor) {
  const t = apenasDigitos(valor);
  if (t.length !== 10 && t.length !== 11) return false;
  const ddd = Number(t.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (t.length === 11 && t[2] !== '9') return false;
  return true;
}

export function formatarTelefone(valor) {
  const t = apenasDigitos(valor).slice(0, 11);
  if (t.length <= 2) return t;
  if (t.length <= 6) return `(${t.slice(0, 2)}) ${t.slice(2)}`;
  if (t.length <= 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
  return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
}

export function validarEmail(valor) {
  const e = String(valor ?? '').trim();
  return e === '' || (e.length <= 120 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}

export function validarNome(valor) {
  const n = normalizarNome(valor);
  return n.length >= 5 && n.length <= 120 && n.split(' ').length >= 2
    && /^[\p{L}][\p{L}\s'.-]*$/u.test(n);
}

export function normalizarNome(valor) {
  return String(valor ?? '').replace(/\s+/g, ' ').trim();
}

export function validarNascimento(s, hoje = hojeBR()) {
  return dataValida(s) && s >= '1900-01-01' && s <= hoje;
}

/** "Maria Aparecida Souza" -> "Maria A. S." */
export function nomeCurto(nome) {
  const p = normalizarNome(nome).split(' ');
  if (p.length === 1) return p[0];
  return [p[0], ...p.slice(1).map((x) => `${x[0].toUpperCase()}.`)].join(' ');
}

// ---------------------------------------------------------------------
//  Protocolo e chaves
// ---------------------------------------------------------------------
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 32 símbolos (sem I, L, O, U)

/** CIN-XXXX-XXXX-XXXX — 60 bits aleatórios, não previsível. */
export function gerarProtocolo() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const s = [...bytes].map((b) => ALFABETO[b & 31]).join('');
  return `CIN-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export function normalizarProtocolo(p) {
  const s = String(p ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  let corpo = s.startsWith('CIN') ? s.slice(3) : s;
  // O alfabeto do protocolo não tem O, I, L: corrige a confusão comum com 0 e 1.
  corpo = corpo.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (corpo.length !== 12) return '';
  return `CIN-${corpo.slice(0, 4)}-${corpo.slice(4, 8)}-${corpo.slice(8, 12)}`;
}

export function gerarRef() {
  return crypto.randomUUID();
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Chave secreta do comprovante = PBKDF2(protocolo | CPF).
 * É o ID do documento "comprovantes": só quem sabe os dois dados chega nele.
 */
export async function gerarChave(protocolo, cpf, iteracoes = 120000) {
  const material = await crypto.subtle.importKey(
    'raw', enc.encode(`${protocolo}|${apenasDigitos(cpf)}`), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('sac-cin/chave/v2'), iterations: iteracoes },
    material, 256);
  return hex(bits);
}

/** Identificador (não reversível) usado para permitir 1 agendamento ativo por CPF. */
export async function gerarCpfKey(cpf) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(`sac-cin/cpf/v1|${apenasDigitos(cpf)}`)));
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------
//  Estatísticas (painel e relatórios)
// ---------------------------------------------------------------------
/** Resume uma lista de agendamentos de UM dia. */
export function resumoDia(lista) {
  const r = { total: TOTAL_VAGAS, ocupadas: 0, disponiveis: TOTAL_VAGAS, concluidos: 0, cancelamentos: 0, faltas: 0, presentes: 0, agendados: 0, registros: lista.length };
  for (const a of lista) {
    if (OCUPAM_VAGA.includes(a.status)) r.ocupadas++;
    if (a.status === 'concluido') r.concluidos++;
    if (a.status === 'cancelado') r.cancelamentos++;
    if (a.status === 'faltou') r.faltas++;
    if (a.status === 'presente') r.presentes++;
    if (a.status === 'agendado') r.agendados++;
  }
  r.disponiveis = Math.max(0, TOTAL_VAGAS - r.ocupadas);
  return r;
}

export function agruparPor(lista, chaveFn) {
  const m = new Map();
  for (const a of lista) {
    const k = chaveFn(a);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(a);
  }
  return m;
}

// ---------------------------------------------------------------------
//  Feriados (para sugerir bloqueios no painel; a administração decide)
// ---------------------------------------------------------------------
/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

/** [{data, nome, tipo}] tipo: 'feriado' | 'facultativo' | 'estadual-ba' */
export function feriadosDoAno(ano) {
  const p = pascoa(ano); const f = (md, nome, tipo = 'feriado') => ({ data: `${ano}-${md}`, nome, tipo });
  return [
    f('01-01', 'Confraternização Universal'),
    { data: somarDias(p, -48), nome: 'Carnaval (segunda)', tipo: 'facultativo' },
    { data: somarDias(p, -47), nome: 'Carnaval (terça)', tipo: 'facultativo' },
    { data: somarDias(p, -2), nome: 'Sexta-feira Santa', tipo: 'feriado' },
    f('04-21', 'Tiradentes'), f('05-01', 'Dia do Trabalho'),
    { data: somarDias(p, 60), nome: 'Corpus Christi', tipo: 'facultativo' },
    f('07-02', 'Independência da Bahia', 'estadual-ba'),
    f('09-07', 'Independência do Brasil'), f('10-12', 'Nossa Sra. Aparecida'),
    f('10-28', 'Dia do Servidor Público', 'facultativo'),
    f('11-02', 'Finados'), f('11-15', 'Proclamação da República'),
    f('11-20', 'Consciência Negra'), f('12-24', 'Véspera de Natal', 'facultativo'), f('12-25', 'Natal'),
    f('12-31', 'Véspera de Ano Novo', 'facultativo'),
  ].sort((a, b) => a.data.localeCompare(b.data));
}

// ---------------------------------------------------------------------
//  Identidade visual
// ---------------------------------------------------------------------
export const COR_PADRAO = '#0b4f9c';
export const corValida = (c) => /^#[0-9a-fA-F]{6}$/.test(String(c ?? ''));

/** Escurece uma cor #rrggbb (fator 0..1) — usada no degradê do topo. */
export function escurecer(hex, f = 0.35) {
  if (!corValida(hex)) hex = COR_PADRAO;
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - f)));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Só aceitamos imagens embutidas (data URL) de tipos seguros, e de tamanho razoável. */
export const logoValida = (u) => typeof u === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(u) && u.length <= 300000;
