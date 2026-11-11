import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/core.js';

const ctx = (o = {}) => ({ hoje: '2026-11-09', agora: '07:00', abertura: '2026-11-09', fechamento: '2026-12-31', bloqueios: new Set(), ...o });

test('exatamente 20 horários, de 08:00 a 12:45, de 15 em 15 min', () => {
  assert.equal(C.HORARIOS.length, 20);
  assert.equal(C.HORARIOS[0], '08:00');
  assert.equal(C.HORARIOS[19], '12:45');
  for (let i = 1; i < 20; i++) {
    const [h1, m1] = C.HORARIOS[i - 1].split(':').map(Number); const [h2, m2] = C.HORARIOS[i].split(':').map(Number);
    assert.equal(h2 * 60 + m2 - (h1 * 60 + m1), 15);
  }
  assert.ok(!C.HORARIOS.includes('13:00'));
});

test('sábados e domingos nunca são dias úteis', () => {
  assert.equal(C.ehDiaUtil('2026-11-07'), false); // sábado
  assert.equal(C.ehDiaUtil('2026-11-08'), false); // domingo
  assert.equal(C.ehDiaUtil('2026-11-09'), true);  // segunda
  assert.equal(C.ehDiaUtil('2026-11-13'), true);  // sexta
  assert.deepEqual(C.horariosLivres('2026-11-07', [], ctx({ hoje: '2026-11-02' })), []);
  assert.deepEqual(C.horariosLivres('2026-11-08', [], ctx({ hoje: '2026-11-02' })), []);
});

test('data bloqueada, fora da janela e no passado não recebem agendamento', () => {
  assert.deepEqual(C.horariosLivres('2026-11-10', [], ctx({ bloqueios: new Set(['2026-11-10']) })), []);
  assert.deepEqual(C.horariosLivres('2027-01-04', [], ctx()), []);
  assert.deepEqual(C.horariosLivres('2026-11-06', [], ctx()), []);
  assert.equal(C.horariosLivres('2026-11-10', [], ctx()).length, 20);
});

test('horário ocupado some da lista; 20 ocupados = dia cheio', () => {
  assert.ok(!C.horariosLivres('2026-11-10', ['08:00'], ctx()).includes('08:00'));
  assert.equal(C.horariosLivres('2026-11-10', C.HORARIOS, ctx()).length, 0);
});

test('hoje: horários que já passaram não aparecem', () => {
  const l = C.horariosLivres('2026-11-09', [], ctx({ agora: '10:20' }));
  assert.equal(l[0], '10:30'); assert.equal(l.length, 10);
  assert.equal(C.horariosLivres('2026-11-09', [], ctx({ agora: '12:50' })).length, 0);
});

test('CPF: válidos e inválidos', () => {
  assert.ok(C.validarCPF('529.982.247-25'));
  assert.ok(!C.validarCPF('111.111.111-11'));
  assert.ok(!C.validarCPF('529.982.247-26'));
  assert.ok(!C.validarCPF('123'));
});

test('CPF é mascarado e nunca aparece inteiro', () => {
  assert.equal(C.mascararCPF('52998224725'), '***.982.247-**');
  assert.ok(!C.mascararCPF('52998224725').includes('52998224725'));
  assert.equal(C.mascararCPF('x'), '***.***.***-**');
});

test('telefone, e-mail, nome, nascimento', () => {
  assert.ok(C.validarTelefone('(73) 91234-5678')); assert.ok(C.validarTelefone('7332221234'));
  assert.ok(!C.validarTelefone('(73) 21234-5678')); assert.ok(!C.validarTelefone('1234'));
  assert.ok(C.validarEmail('')); assert.ok(C.validarEmail('a@b.co')); assert.ok(!C.validarEmail('a@b'));
  assert.ok(C.validarNome('Maria Silva')); assert.ok(!C.validarNome('Maria')); assert.ok(!C.validarNome('<script> alert'));
  assert.ok(C.validarNascimento('1990-05-20', '2026-11-09')); assert.ok(!C.validarNascimento('2030-01-01', '2026-11-09')); assert.ok(!C.validarNascimento('1990-02-31'));
});

test('protocolo: formato, unicidade e imprevisibilidade', () => {
  const set = new Set();
  for (let i = 0; i < 5000; i++) { const p = C.gerarProtocolo(); assert.match(p, /^CIN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/); set.add(p); }
  assert.equal(set.size, 5000);
  assert.equal(C.normalizarProtocolo('cin 1234 5678 9abc'), 'CIN-1234-5678-9ABC');
  assert.equal(C.normalizarProtocolo('abc'), '');
});

test('chave do comprovante depende de protocolo e CPF; CPF-key não revela o CPF', async () => {
  const k1 = await C.gerarChave('CIN-AAAA-BBBB-CCCC', '529.982.247-25', 1000);
  const k2 = await C.gerarChave('CIN-AAAA-BBBB-CCCC', '52998224725', 1000);
  const k3 = await C.gerarChave('CIN-AAAA-BBBB-CCCC', '52998224726', 1000);
  assert.equal(k1, k2); assert.notEqual(k1, k3); assert.match(k1, /^[0-9a-f]{64}$/);
  const ck = await C.gerarCpfKey('52998224725'); assert.match(ck, /^[0-9a-f]{64}$/); assert.ok(!ck.includes('52998224725'));
});

test('resumo do dia: vagas ocupadas/disponíveis, cancelamento libera vaga', () => {
  const l = [{ status: 'agendado' }, { status: 'concluido' }, { status: 'faltou' }, { status: 'cancelado' }, { status: 'presente' }];
  const r = C.resumoDia(l);
  assert.equal(r.ocupadas, 4); assert.equal(r.disponiveis, 16); assert.equal(r.cancelamentos, 1); assert.equal(r.concluidos, 1); assert.equal(r.total, 20);
  const vinte = Array.from({ length: 25 }, (_, i) => ({ status: i < 20 ? 'agendado' : 'cancelado' }));
  assert.equal(C.resumoDia(vinte).disponiveis, 0);
});

test('datas: soma de dias, formatação e fuso de Brasília', () => {
  assert.equal(C.somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(C.somarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(C.formatarData('2026-11-10'), '10/11/2026');
  assert.equal(C.ultimoDiaDoMes('2026-02'), '2026-02-28'); assert.equal(C.ultimoDiaDoMes('2026-12'), '2026-12-31');
  // 02:30 UTC de 10/11 ainda é 09/11 23:30 em Brasília
  const d = new Date('2026-11-10T02:30:00Z');
  assert.equal(C.hojeBR(d), '2026-11-09'); assert.equal(C.horaAgoraBR(d), '23:30');
});

test('escape de HTML', () => { assert.equal(C.esc('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;'); });

test('feriados: Páscoa e datas móveis corretas', () => {
  assert.equal(C.pascoa(2026), '2026-04-05'); assert.equal(C.pascoa(2027), '2027-03-28');
  const f = Object.fromEntries(C.feriadosDoAno(2026).map((x) => [x.nome, x.data]));
  assert.equal(f['Sexta-feira Santa'], '2026-04-03'); assert.equal(f['Corpus Christi'], '2026-06-04');
  assert.equal(f['Carnaval (terça)'], '2026-02-17'); assert.equal(f['Natal'], '2026-12-25');
});

test('identidade visual: cor, logo e fuso do aparelho', () => {
  assert.ok(C.corValida('#0b4f9c')); assert.ok(!C.corValida('azul')); assert.ok(!C.corValida('#fff')); assert.ok(!C.corValida('red;background:url(x)'));
  assert.match(C.escurecer('#ffffff'), /^#[0-9a-f]{6}$/); assert.equal(C.escurecer('lixo'), C.escurecer(C.COR_PADRAO));
  assert.ok(C.logoValida('data:image/png;base64,iVBORw0KGgo=')); assert.ok(!C.logoValida('https://x.com/a.png'));
  assert.ok(!C.logoValida('data:image/svg+xml;base64,PHN2Zz4=')); assert.ok(!C.logoValida('javascript:alert(1)'));
  assert.ok(!C.logoValida('data:image/png;base64,' + 'A'.repeat(300001)));
  // meia-noite em Brasília não vira "24:00"
  assert.equal(C.horaAgoraBR(new Date('2026-11-10T03:05:00Z')), '00:05'); assert.equal(C.hojeBR(new Date('2026-11-10T03:05:00Z')), '2026-11-10');
});

test('protocolo: corrige O/I/L digitados no lugar de 0/1', () => {
  assert.equal(C.normalizarProtocolo('cin-oabc-1lO1-2345'), 'CIN-0ABC-1101-2345');
});
