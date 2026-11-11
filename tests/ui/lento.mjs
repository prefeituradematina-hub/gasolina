// Conexão lenta/travada: o calendário precisa aparecer mesmo assim. Rodar: node tests/ui/lento.mjs
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
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 375, height: 740 }, isMobile: true });
async function nova(init, soCfg = false) {
  const p = await ctx.newPage(); p.erros = []; p.on('pageerror', (e) => p.erros.push(e.message));
  await p.route('https://www.gstatic.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await p.route('**/firebase-config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: soCfg ? 'export const firebaseConfig={apiKey:"t",appId:"t",projectId:"t"};' : 'export const firebaseConfig={apiKey:"t",appId:"t",projectId:"t"};export const appCheckSiteKey="";export const usarEmulador=false;' }));
  await p.addInitScript(([h, f, extra]) => { const s = (globalThis.__store ||= new Map()); s.set('config/geral', { nomeSAC: 'SAC', municipio: 'M', local: 'L', endereco: 'E', abertura: h, fechamento: f, ...(extra.cfg || {}) }); Object.assign(globalThis, extra.g || {}); }, [hoje, C.somarDias(hoje, 60), init]);
  return p;
}
async function ate(p) {
  await p.goto(base + '/index.html'); await p.waitForSelector('#bAgendar:not([disabled])');
  await p.click('#bAgendar'); await p.fill('#nome', 'Maria Aparecida Souza'); await p.fill('#cpf', '52998224725'); await p.fill('#nasc', '1990-05-20'); await p.fill('#tel', '73912345678'); await p.selectOption('#cert', 'nascimento');
  await p.click('#f1 button[type=submit]');
}
// 1) consulta de "bloqueios" TRAVADA para sempre: o calendário deve aparecer e ser usável
let p = await nova({ g: { __travado: true } }); await ate(p);
const t0 = Date.now(); await p.waitForSelector('#cal .dia[data-x], #cal .dia:not(.vazio):not([disabled])', { timeout: 2500 });
ok('calendário aparece em <2,5 s mesmo com o servidor travado', Date.now() - t0 < 2500, `(${Date.now() - t0} ms)`);
ok('mostra aviso de verificação de datas bloqueadas', (await p.textContent('#calCarga')).length > 0);
await p.locator('#cal .dia:not([disabled]):not(.vazio)').first().click(); await p.waitForSelector('.hora.livre');
ok('é possível escolher o dia e ver os horários verdes', (await p.locator('.hora.livre').count()) > 0);
ok('sem erros de JavaScript (travado)', p.erros.length === 0, p.erros.join('|'));
// 2) conexão lenta (3 s): desenha já e depois aplica o bloqueio
let seg = C.somarDias(hoje, 1); while (!C.ehDiaUtil(seg)) seg = C.somarDias(seg, 1);
p = await nova({ g: { __lento: 3000 } }); await p.addInitScript((d) => globalThis.__store.set('bloqueios/' + d, { motivo: 'x' }), seg); await ate(p);
await p.waitForSelector('#cal .dia:not(.vazio)', { timeout: 1500 });
ok('com conexão lenta o calendário já aparece antes da resposta', true);
await p.waitForFunction((n) => document.querySelector('#calCarga').classList.contains('oculto'), 0, { timeout: 8000 });
const dia = Number(seg.slice(8)); const m = seg.slice(0, 7);
await p.waitForTimeout(3500);
ok('depois da resposta, o dia bloqueado fica desabilitado', await p.locator('#cal .dia', { hasText: new RegExp('^' + dia + '$') }).first().isDisabled());
// 3) período salvo em formato errado (ex.: editado à mão) não derruba o calendário
p = await nova({ cfg: { abertura: { seconds: 1 }, fechamento: 12345, nomeSAC: 42 } }); await ate(p);
await p.waitForSelector('#cal .dia:not(.vazio)', { timeout: 2500 }); ok('configuração com formato inválido usa padrões e o calendário aparece', (await p.locator('#cal .dia:not([disabled])').count()) > 0);
ok('sem erros de JavaScript (config inválida)', p.erros.length === 0, p.erros.join('|'));
// 4) gravação que NUNCA responde: não pode ficar "Confirmando…" para sempre
p = await nova({ g: { __commitTravado: true } }); await ate(p);
await p.evaluate(async () => { (await import('/js/firebase.js')).definirLimite(1000); });
await p.waitForSelector('#cal .dia:not(.vazio):not([disabled])'); await p.locator('#cal .dia:not([disabled]):not(.vazio)').first().click();
await p.waitForSelector('.hora.livre'); await p.locator('.hora.livre').first().click(); await p.click('#c2'); await p.check('#lgpd');
await p.click('#c3'); ok('botão mostra "Confirmando…" enquanto espera', (await p.textContent('#c3')).includes('Confirmando'));
await p.waitForSelector('#e3:not(.oculto)', { timeout: 20000 });
const msg = await p.textContent('#e3');
ok('após o tempo limite mostra mensagem clara com o protocolo de referência', msg.includes('Nada foi garantido') && /CIN-[0-9A-Z]{4}-/.test(msg));
ok('botão volta ao normal e pode tentar de novo', !(await p.locator('#c3').isDisabled()) && (await p.textContent('#c3')).includes('CONFIRMAR'));
ok('nenhum comprovante é exibido quando não houve confirmação', !(await p.locator('#comprovante').count()));
ok('sem erros de JavaScript (gravação travada)', p.erros.length === 0, p.erros.join('|'));
// 5) banco Firestore inexistente: a mensagem precisa explicar, com o código
p = await nova({ g: { __semBancoGravar: true } }); await ate(p);
await p.waitForSelector('#cal .dia:not(.vazio):not([disabled])'); await p.locator('#cal .dia:not([disabled]):not(.vazio)').first().click();
await p.waitForSelector('.hora.livre'); await p.locator('.hora.livre').first().click(); await p.click('#c2'); await p.check('#lgpd'); await p.click('#c3');
await p.waitForSelector('#e3:not(.oculto)');
const m5 = await p.textContent('#e3'); ok('erro not-found explica que o banco não foi criado e mostra o código', m5.includes('banco de dados') && m5.includes('not-found') && m5.includes('Nada foi reservado'));
p = await nova({ g: { __semBanco: true } }); await p.goto(base + '/index.html'); await p.waitForSelector('#avisoCfg:not(.oculto)');
ok('sem banco na abertura: aviso claro no topo', (await p.textContent('#avisoCfg')).includes('banco de dados'));
await p.click('#bAgendar'); await p.waitForSelector('.toast.erro'); ok('sem banco: o botão responde com o motivo (não fica morto) e não abre o formulário', (await p.textContent('#toast')).includes('banco de dados') && (await p.locator('#vAgendar').isHidden()));
// 6) leitura de horários negada (regras não publicadas): mensagem com causa e código
p = await nova({ g: { __negaVagas: true } }); await ate(p);
await p.waitForSelector('#cal .dia:not(.vazio):not([disabled])'); await p.locator('#cal .dia:not([disabled]):not(.vazio)').first().click();
await p.waitForFunction(() => document.querySelector('#e2').textContent.length > 0);
const m6 = await p.textContent('#e2'); ok('erro ao carregar horários mostra causa provável e código', m6.includes('regras') && m6.includes('permission-denied'));
// 7) arquivo firebase-config.js com SÓ o firebaseConfig (como o do console) não derruba o sistema
p = await nova({}, true); await ate(p);
await p.waitForSelector('#cal .dia:not(.vazio)', { timeout: 3000 }); ok('config com só firebaseConfig: o sistema funciona', p.erros.length === 0, p.erros.join('|'));
// 8) agenda ainda não aberta (config não salva): o botão responde explicando, não fica "morto"
p = await nova({}); await p.addInitScript(() => globalThis.__store.delete('config/geral'));
await p.goto(base + '/index.html'); await p.waitForSelector('#avisoCfg:not(.oculto)');
ok('botão continua clicável quando a agenda ainda não foi aberta', !(await p.locator('#bAgendar').isDisabled()));
await p.click('#bAgendar'); await p.waitForSelector('.toast.erro');
ok('ao clicar, explica o motivo e não abre o formulário', (await p.textContent('#toast')).includes('ainda não abriu') && (await p.locator('#vAgendar').isHidden()));
await b.close(); srv.close(); const f = res.filter((x) => !x).length; console.log(`\n${res.length - f}/${res.length} OK`); process.exit(f ? 1 : 0);
