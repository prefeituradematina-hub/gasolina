// Teste da página "Dias de funcionamento". Rodar: node tests/ui/funcionamento.mjs
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import * as C from '../../js/core.js';
const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req(process.env.PLAYWRIGHT_PATH || execSync('npm root -g').toString().trim() + '/playwright')); }
const raiz = resolve(new URL('../../', import.meta.url).pathname);
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = createServer((q, r) => { const f = join(raiz, q.url.split('?')[0]); if (!existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': tipos[extname(f)] || 'text/plain' }); r.end(readFileSync(f)); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const stub = readFileSync(new URL('./stub-firebase.js', import.meta.url), 'utf8');
const hoje = C.hojeBR();
const out = process.env.SHOTS || '/tmp';
const res = []; const ok = (n, c, d = '') => { res.push(!!c); console.log(c ? '  ✔' : '  ✘', n, d); };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message)); p.on('dialog', (d) => d.accept());
await p.route('https://www.gstatic.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
await p.route('**/firebase-config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export const firebaseConfig={apiKey:"t",projectId:"t"};export const appCheckSiteKey="";export const usarEmulador=false;' }));
let u = C.somarDias(hoje, 1); while (!C.ehDiaUtil(u)) u = C.somarDias(u, 1);
await p.addInitScript(([h, f, ag]) => { const s = (globalThis.__store ||= new Map()); s.set('config/geral', { nomeSAC: 'SAC', municipio: 'M', local: 'L', endereco: 'E', telefone: '', email: '', abertura: h, fechamento: f }); s.set('admins/adm1', { ok: 1 });
  for (let i = 0; i < 7; i++) s.set(`agendamentos/r${i}`, { ref: 'r' + i, data: ag, hora: '08:00', status: 'agendado', nome: 'x' }); }, [hoje, C.somarDias(hoje, 60), u]);
await p.goto(base + '/funcionamento.html');
ok('exige login', await p.locator('#login').isVisible() && !(await p.locator('#painel').isVisible()));
await p.fill('#lEmail', 'a@b.c'); await p.fill('#lSenha', 'ok'); await p.click('#fLogin button'); await p.waitForSelector('#painel:not(.oculto)');
await p.waitForSelector('.fx-dia[data-d]');
ok('fins de semana desabilitados', (await p.locator('.fx-dia[disabled]').count()) >= 8);
if (u.slice(0, 7) !== hoje.slice(0, 7)) await p.click('#mProx'); // dia útil pode cair no mês seguinte
const cel = p.locator(`.fx-dia[data-d="${u}"]`);
ok('dia aberto mostra ocupação 7/20', (await cel.textContent()).includes('7/20'));
await p.screenshot({ path: `${out}/func-1.png` });
// bloquear um dia
await cel.click(); await p.fill('#sMot', 'Feriado teste'); await p.click('#sBloq');
await p.waitForSelector(`.fx-dia.bloq[data-d="${u}"]`); ok('bloquear dia (avisa que há 7 agendamentos ativos e bloqueia)', (await cel.textContent()).includes('Feriado teste'));
// reabrir
await p.locator(`.fx-dia[data-d="${u}"]`).click(); await p.click('#sAbrir'); await p.waitForFunction((d) => !document.querySelector(`.fx-dia[data-d="${d}"]`).classList.contains('bloq'), u);
ok('reabrir dia', true);
// shift: intervalo
const dias = C.intervaloDatas(u, C.somarDias(u, 6)).filter((d) => C.ehDiaUtil(d) && d.slice(0, 7) === u.slice(0, 7));
await p.locator(`.fx-dia[data-d="${dias[0]}"]`).click(); await p.locator(`.fx-dia[data-d="${dias.at(-1)}"]`).click({ modifiers: ['Shift'] });
ok('shift seleciona intervalo só de dias úteis', (await p.locator('.fx-dia.sel').count()) === dias.length, `(${dias.length})`);
await p.fill('#sMot', 'Férias'); await p.click('#sBloq'); await p.waitForSelector('.fx-dia.bloq');
ok('bloqueio em lote', (await p.locator('.fx-dia.bloq').count()) >= dias.filter((d) => d.slice(0, 7) === hoje.slice(0, 7)).length);
// período
await p.click('[data-dias="90"]'); await p.click('#pSalvar'); await p.waitForSelector('.toast:not(.oculto)');
ok('salva período (+90 dias) sem apagar outras configurações', await p.evaluate(() => { const c = globalThis.__store.get('config/geral'); return c.nomeSAC === 'SAC' && c.fechamento > c.abertura; }));
await p.fill('#pFe', C.somarDias(hoje, -5)); await p.click('#pSalvar'); ok('recusa período invertido', await p.locator('#pErro').isVisible());
// feriados
await p.click('#fVer'); await p.waitForSelector('#fLista li');
const n = await p.locator('#fLista li').count(); ok('lista sugestões de feriados', n > 0, `(${n})`);
await p.screenshot({ path: `${out}/func-2.png` });
await p.click('#fAplicar'); await p.waitForTimeout(300);
ok('aplicar feriados grava bloqueios', await p.evaluate(() => [...globalThis.__store.keys()].filter((k) => k.startsWith('bloqueios/')).length > 3));
ok('sem erros de JavaScript', erros.length === 0, erros.join('|'));
await b.close(); srv.close(); const f = res.filter((x) => !x).length; console.log(`\n${res.length - f}/${res.length} OK`); process.exit(f ? 1 : 0);
