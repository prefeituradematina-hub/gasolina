// Testa as REGRAS DO FIRESTORE no emulador. Rodar com:  npm run test:regras
// (precisa de Java 11+ e `npm install`). Não usa seu projeto real.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, writeBatch, getDoc, getDocs, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import * as C from '../js/core.js';

let env;
const hoje = C.hojeBR();
let seg = C.somarDias(hoje, 1); while (!C.ehDiaUtil(seg)) seg = C.somarDias(seg, 1); // próximo dia útil
let sab = seg; while (C.diaDaSemana(sab) !== 6) sab = C.somarDias(sab, 1);

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-sac', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'config/geral'), { abertura: hoje, fechamento: C.somarDias(hoje, 90) });
    await setDoc(doc(db, 'admins/adm1'), { ok: true });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext('adm1').firestore();

async function reservar(db, { data = seg, hora = '08:00', cpf = '52998224725', nasc = '1990-05-20' } = {}) {
  const ref = crypto.randomUUID(); const protocolo = C.gerarProtocolo();
  const chave = await C.gerarChave(protocolo, cpf, 1000); const cpfKey = await C.gerarCpfKey(cpf);
  const b = writeBatch(db);
  b.set(doc(db, 'vagas', `${data}_${hora}`), { data, hora, ref });
  b.set(doc(db, 'agendamentos', ref), { ref, protocolo, nome: 'Maria Silva', cpf, cpfMasc: C.mascararCPF(cpf), nascimento: nasc, telefone: '73912345678', email: '', certidao: 'nascimento', data, hora, status: 'agendado', origem: 'cidadao', chave, cpfKey, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  b.set(doc(db, 'comprovantes', chave), { ref, protocolo, nome: 'Maria Silva', cpfMasc: C.mascararCPF(cpf), data, hora, certidao: 'nascimento', status: 'agendado', criadoEm: serverTimestamp() });
  b.set(doc(db, 'cpfAtivos', cpfKey), { ref });
  return { b, ref, chave, cpfKey, protocolo };
}

test('cidadão consegue agendar um horário livre', async () => {
  const { b } = await reservar(anon()); await assertSucceeds(b.commit());
});

test('segundo cidadão NÃO consegue o mesmo horário', async () => {
  await assertSucceeds((await reservar(anon())).b.commit());
  await assertFails((await reservar(anon(), { cpf: '11144477735' })).b.commit());
});

test('reservas simultâneas do mesmo horário: só uma vence', async () => {
  const lote = await Promise.all(['52998224725', '11144477735', '39053344705', '86288366757', '71428793860'].map((cpf) => reservar(anon(), { cpf, hora: '09:00' })));
  const r = await Promise.allSettled(lote.map((x) => x.b.commit()));
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
});

test('mesmo CPF não faz dois agendamentos ativos', async () => {
  await assertSucceeds((await reservar(anon())).b.commit());
  await assertFails((await reservar(anon(), { hora: '08:15' })).b.commit());
});

test('sábado, domingo, horário fora do expediente e data passada são recusados', async () => {
  await assertFails((await reservar(anon(), { data: sab })).b.commit());
  await assertFails((await reservar(anon(), { hora: '13:00' })).b.commit());
  await assertFails((await reservar(anon(), { hora: '07:45' })).b.commit());
  await assertFails((await reservar(anon(), { data: C.somarDias(hoje, -7) })).b.commit());
});

test('data bloqueada não recebe agendamento; fora da janela também não', async () => {
  await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), `bloqueios/${seg}`), { motivo: 'feriado' }));
  await assertFails((await reservar(anon())).b.commit());
  let longe = C.somarDias(hoje, 200); while (!C.ehDiaUtil(longe)) longe = C.somarDias(longe, 1);
  await assertFails((await reservar(anon(), { data: longe })).b.commit());
});

test('limite de 20 por dia: os 20 horários ocupam, não existe 21º', async () => {
  const cpfs = ['52998224725', '11144477735', '39053344705', '86288366757', '71428793860'];
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    for (const h of C.HORARIOS) await setDoc(doc(d, `vagas/${seg}_${h}`), { data: seg, hora: h, ref: 'x'.repeat(30) });
  });
  for (const h of C.HORARIOS.slice(0, 3)) await assertFails((await reservar(anon(), { hora: h, cpf: cpfs[0] })).b.commit());
});

test('cidadão não consegue LER agendamentos nem listar comprovantes', async () => {
  const { b, ref, chave } = await reservar(anon()); await assertSucceeds(b.commit());
  await assertFails(getDoc(doc(anon(), 'agendamentos', ref)));
  await assertFails(getDocs(collection(anon(), 'agendamentos')));
  await assertFails(getDocs(collection(anon(), 'comprovantes')));
  await assertFails(getDocs(collection(anon(), 'cpfAtivos')));
  await assertSucceeds(getDoc(doc(anon(), 'comprovantes', chave)));
});

test('ninguém altera uma vaga ocupada; cidadão não apaga vaga sem cancelar', async () => {
  const { b } = await reservar(anon()); await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(anon(), `vagas/${seg}_08:00`), { data: seg, hora: '08:00', ref: 'y'.repeat(30) }));
  await assertFails(writeBatch(anon()).delete(doc(anon(), `vagas/${seg}_08:00`)).commit());
});

test('cancelamento pelo cidadão libera a vaga (e só com a chave secreta)', async () => {
  const { b, ref, chave, cpfKey } = await reservar(anon()); await assertSucceeds(b.commit());
  const d = anon(); const c = writeBatch(d);
  c.update(doc(d, 'agendamentos', ref), { status: 'cancelado', canceladoPor: 'cidadao', canceladoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  c.update(doc(d, 'comprovantes', chave), { status: 'cancelado', canceladoEm: serverTimestamp() });
  c.delete(doc(d, `vagas/${seg}_08:00`)); c.delete(doc(d, 'cpfAtivos', cpfKey));
  await assertSucceeds(c.commit());
  await assertSucceeds((await reservar(anon(), { cpf: '11144477735' })).b.commit()); // vaga livre de novo
});

test('terceiro (sem a chave) não consegue cancelar agendamento alheio', async () => {
  const { b, ref } = await reservar(anon()); await assertSucceeds(b.commit());
  const d = anon(); const c = writeBatch(d);
  c.update(doc(d, 'agendamentos', ref), { status: 'cancelado', canceladoPor: 'cidadao', canceladoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  c.delete(doc(d, `vagas/${seg}_08:00`));
  await assertFails(c.commit());
});

test('admin lê, remarca e cancela; usuário comum logado não é admin', async () => {
  const { b, ref } = await reservar(anon()); await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(admin(), 'agendamentos', ref)));
  await assertFails(getDoc(doc(env.authenticatedContext('qualquer').firestore(), 'agendamentos', ref)));
  await assertSucceeds(setDoc(doc(admin(), 'bloqueios/2099-01-05'), { motivo: 'teste' }));
  await assertFails(setDoc(doc(anon(), 'bloqueios/2099-01-06'), { motivo: 'x' }));
  await assertFails(setDoc(doc(anon(), 'config/geral'), { abertura: '2000-01-01', fechamento: '2099-01-01' }));
});

test('auditoria só aceita inclusão', async () => {
  const d = admin();
  await assertSucceeds(setDoc(doc(d, 'auditoria/a1'), { uid: 'adm1', em: serverTimestamp(), acao: 'x' }));
  await assertFails(setDoc(doc(d, 'auditoria/a1'), { uid: 'adm1', em: serverTimestamp(), acao: 'y' }));
});

test('datas impossíveis (30/02, mês 13, 31/11) são recusadas', async () => {
  for (const d of ['2026-02-30', '2026-13-01', '2026-11-31']) {
    await assertFails((await reservar(anon(), { data: d })).b.commit());
  }
});

test('duas reservas num só lote usando o mesmo cpfKey são recusadas', async () => {
  const db = anon();
  const a = await reservar(db, { hora: '08:00' });
  // a 2ª reserva aponta para o cpfKey da 1ª (o cliente poderia tentar isso)
  const ref2 = crypto.randomUUID(); const prot2 = C.gerarProtocolo();
  const chave2 = await C.gerarChave(prot2, '11144477735', 1000);
  const l2 = writeBatch(db);
  l2.set(doc(db, 'vagas', `${seg}_08:15`), { data: seg, hora: '08:15', ref: ref2 });
  l2.set(doc(db, 'agendamentos', ref2), { ref: ref2, protocolo: prot2, nome: 'Joao Souza', cpf: '11144477735', cpfMasc: C.mascararCPF('11144477735'), nascimento: '1990-05-20', telefone: '73912345678', email: '', certidao: 'nascimento', data: seg, hora: '08:15', status: 'agendado', origem: 'cidadao', chave: chave2, cpfKey: a.cpfKey, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });
  l2.set(doc(db, 'comprovantes', chave2), { ref: ref2, protocolo: prot2, nome: 'Joao Souza', cpfMasc: C.mascararCPF('11144477735'), data: seg, hora: '08:15', certidao: 'nascimento', status: 'agendado', criadoEm: serverTimestamp() });
  await assertSucceeds(a.b.commit());
  await assertFails(l2.commit());
});

test('CPF pode agendar de novo depois que a data do agendamento anterior passou', async () => {
  const a = await reservar(anon());
  await assertSucceeds(a.b.commit());
  // enquanto o 1º agendamento não passou: recusado
  await assertFails((await reservar(anon(), { hora: '08:15' })).b.commit());
  // a data do 1º passa (simulado)
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'agendamentos', a.ref), { data: C.somarDias(hoje, -1) }, { merge: true });
  });
  await assertSucceeds((await reservar(anon(), { hora: '08:15' })).b.commit());
});
