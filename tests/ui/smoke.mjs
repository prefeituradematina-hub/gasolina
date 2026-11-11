// Teste de interface (navegador real, Firebase falso). Rodar: node tests/ui/smoke.mjs
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
let chromium; try { ({ chromium } = req('playwright')); } catch { ({ chromium } = req(process.env.PLAYWRIGHT_PATH || '/home/claude/.npm-global/lib/node_modules/playwright')); }
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import * as C from '../../js/core.js';

const raiz = resolve(new URL('../../', import.meta.url).pathname);
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const srv = createServer((q, r) => { const f = join(raiz, q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0]); if (!existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': tipos[extname(f)] || 'text/plain' }); r.end(readFileSync(f)); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const stub = readFileSync(new URL('./stub-firebase.js', import.meta.url), 'utf8');
const hoje = C.hojeBR(); let seg = C.somarDias(hoje, 1); while (!C.ehDiaUtil(seg)) seg = C.somarDias(seg, 1);

const resultados = []; const ok = (n, c, d = '') => { resultados.push([n, !!c]); console.log(c ? '  ✔' : '  ✘', n, d); };
const browser = await chromium.launch();
async function pagina(ctx) {
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', (e) => erros.push(e.message)); p.erros = erros;
  await p.route('https://www.gstatic.com/**', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await p.route('https://cdnjs.cloudflare.com/**', (r) => r.abort());
  await p.route('**/firebase-config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'export const firebaseConfig={apiKey:"teste",projectId:"t"};export const appCheckSiteKey="";export const usarEmulador=false;' }));
  return p;
}
const semear = (p) => p.addInitScript(([hoje, fim]) => { const s = (globalThis.__store ||= new Map()); s.set('config/geral', { nomeSAC: 'SAC de Teste', municipio: 'Matina', local: 'Prefeitura', endereco: 'Rua A, 1', telefone: '(73) 3000-0000', email: '', abertura: hoje, fechamento: fim }); s.set('admins/adm1', { ok: 1 }); }, [hoje, C.somarDias(hoje, 60)]);

// O "store" é por página, então para testar conflito usamos a mesma página (mesmo contexto JS).
const mobile = await browser.newContext({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true });
const p = await pagina(mobile); await semear(p);
await p.goto(base + '/index.html');
await p.waitForSelector('#bAgendar:not([disabled])');
ok('home mostra "REALIZAR AGENDAMENTO" e gratuidade', (await p.textContent('.hero')).includes('REALIZAR AGENDAMENTO') && (await p.textContent('.hero')).includes('GRATUITO'));
ok('home mostra horário de funcionamento e local configurado', (await p.textContent('#infoLocal')).includes('Rua A, 1'));
await p.screenshot({ path: '/tmp/claude-0/-home-claude/4502446a-0fc9-5dc1-a475-42bb68f62370/scratchpad/home-mobile.png', fullPage: true });

async function preencher(cpf, nome = 'Maria Aparecida Souza') {
  await p.click('#bAgendar'); await p.fill('#nome', nome); await p.fill('#cpf', cpf); await p.fill('#nasc', '1990-05-20'); await p.fill('#tel', '73912345678'); await p.selectOption('#cert', 'nascimento'); await p.click('#f1 button[type=submit]');
}
await p.click('#bAgendar'); await p.click('#f1 button[type=submit]');
ok('formulário vazio mostra mensagens de erro', (await p.textContent('[data-e="cpf"]')).includes('CPF inválido'));
await p.fill('#nome', 'Maria Aparecida Souza'); await p.fill('#cpf', '111.111.111-11'); await p.click('#f1 button[type=submit]');
ok('CPF inválido é recusado no front-end', (await p.textContent('[data-e="cpf"]')).includes('inválido'));
await p.reload(); await p.waitForSelector('#bAgendar:not([disabled])');
await preencher('52998224725');
const dia = Number(seg.slice(8));
const alvo = p.locator('#cal .dia:not(.vazio)').filter({ hasText: new RegExp('^' + dia + '$') });
// se o próximo dia útil cair no mês seguinte, avança o calendário
ok('sábado e domingo aparecem desabilitados', await p.locator('#cal .dia[disabled]').count() > 0);
await p.locator('#cal .dia:not([disabled]):not(.vazio)').filter({ hasText: new RegExp('^' + dia + '$') }).first().click();
await p.waitForSelector('.hora');
const horas = await p.locator('.hora').allTextContents();
ok('mostra apenas horários 08h00..12h45 (20 vagas no dia futuro)', horas.length === 20 && horas[0] === '08h00' && horas[19] === '12h45', `(${horas.length})`);
await p.locator('.hora', { hasText: '09h15' }).click(); await p.click('#c2');
ok('resumo mostra CPF mascarado', (await p.textContent('#resumo')).includes('***.982.247-**') && !(await p.textContent('#resumo')).includes('52998224725'));
await p.click('#c3'); ok('exige aceite LGPD', await p.locator('#e3').isVisible());
await p.check('#lgpd'); await p.click('#c3');
await p.waitForSelector('#comprovante');
const comp = await p.textContent('#comprovante');
ok('comprovante: protocolo, nome, data, horário, local, gratuidade, documentação', /CIN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/.test(comp) && comp.includes('Maria Aparecida Souza') && comp.includes('09h15') && comp.includes('Prefeitura') && comp.includes('GRATUITO') && comp.includes('Certidão de nascimento'));
ok('comprovante NÃO traz CPF completo', !comp.includes('52998224725') && !comp.includes('529.982.247-25') && comp.includes('***.982.247-**'));
const protocolo = comp.match(/CIN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/)[0];
ok('botão de e-mail é mailto (não afirma envio)', (await p.getAttribute('#bMail', 'href')).startsWith('mailto:') && (await p.textContent('#vComp')).includes('não envia mensagens automáticas'));
await p.screenshot({ path: '/tmp/claude-0/-home-claude/4502446a-0fc9-5dc1-a475-42bb68f62370/scratchpad/comprovante-mobile.png', fullPage: true });
ok('URL não contém CPF', !p.url().includes('529'));

// conflito: outro cidadão tenta o mesmo horário
await p.click('#bIni'); await preencher('11144477735', 'João Pedro Lima');
await p.locator('#cal .dia:not([disabled]):not(.vazio)').filter({ hasText: new RegExp('^' + dia + '$') }).first().click();
await p.waitForSelector('.hora');
await p.screenshot({ path: '/tmp/claude-0/-home-claude/4502446a-0fc9-5dc1-a475-42bb68f62370/scratchpad/horas.png' });
ok('horário ocupado (09h15) aparece em vermelho e desabilitado; 19 livres em verde', (await p.locator('.hora.ocupado[disabled]', { hasText: '09h15' }).count()) === 1 && (await p.locator('.hora.livre:not([disabled])').count()) === 19 && (await p.locator('.hora').count()) === 20);
// simula corrida: ocupa 10h00 por baixo dos panos depois de a tela já ter listado
await p.locator('.hora', { hasText: '10h00' }).click(); await p.click('#c2');
await p.evaluate((s) => globalThis.__store.set(`vagas/${s}_10:00`, { data: s, hora: '10:00', ref: 'x' }), seg);
await p.check('#lgpd'); await p.click('#c3');
await p.waitForSelector('#e2:not(:empty)');
ok('corrida: se o horário foi tomado, avisa e volta para escolher outro (nada é confirmado)', (await p.textContent('#e2')).includes('acabou de ser ocupado'));

// consulta e cancelamento
await p.click('#v2').catch(() => {}); await p.goto(base + '/index.html'); // (store em memória é perdido ao recarregar; refaz agendamento)
await semear(p); await p.reload(); await p.waitForSelector('#bAgendar:not([disabled])');
await preencher('52998224725');

await p.locator('#cal .dia:not([disabled]):not(.vazio)').filter({ hasText: new RegExp('^' + dia + '$') }).first().click(); await p.waitForSelector('.hora');
await p.locator('.hora', { hasText: '08h00' }).click(); await p.click('#c2'); await p.check('#lgpd'); await p.click('#c3'); await p.waitForSelector('#comprovante');
const prot2 = (await p.textContent('#comprovante')).match(/CIN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}/)[0];
await p.click('#bIni'); await p.click('#bConsultar');
await p.fill('#cProt', prot2); await p.fill('#cCpf', '111.111.111-11'); await p.click('#fc button[type=submit]');
ok('consulta com CPF inválido é recusada', await p.locator('#eC').isVisible());
await p.fill('#cCpf', '529.982.247-25'); await p.fill('#cProt', 'CIN-0000-0000-0000'); await p.click('#fc button[type=submit]');
await p.waitForSelector('#eC:not(.oculto)'); ok('consulta com protocolo errado: "não encontrado" (não vaza dados)', (await p.textContent('#eC')).includes('não encontrado'));
await p.fill('#cProt', prot2); await p.click('#fc button[type=submit]'); await p.waitForSelector('#comprovante');
ok('consulta correta mostra o comprovante', (await p.textContent('#comprovante')).includes(prot2));
p.on('dialog', (d) => d.accept()); await p.click('#bCanc'); await p.waitForSelector('.cancelado-marca');
ok('cancelamento marca CANCELADO e libera a vaga (vaga some do store)', await p.evaluate((s) => !globalThis.__store.has(`vagas/${s}_08:00`), seg));
ok('sem erros de JavaScript no site do cidadão', p.erros.length === 0, p.erros.join(' | '));

// ---------------- UM AGENDAMENTO POR CPF (liberado depois da data) ----------------
async function agendarCom(cpf, horaTxt) {
  const snap = await p.evaluate(() => [...globalThis.__store]);
  await p.reload(); await p.waitForSelector('#bAgendar:not([disabled])');
  await p.evaluate((x) => { globalThis.__store.clear(); x.forEach(([k, v]) => globalThis.__store.set(k, v)); }, snap);
  await preencher(cpf);
  await p.locator('#cal .dia:not([disabled]):not(.vazio)').filter({ hasText: new RegExp('^' + dia + '$') }).first().click();
  await p.locator('.hora', { hasText: horaTxt }).click(); await p.click('#c2'); await p.check('#lgpd'); await p.click('#c3');
  await p.waitForSelector('#comprovante, #e3:not(.oculto)');
  return p.locator('#comprovante').count().then((n) => n > 0);
}
ok('CPF novo agenda normalmente', await agendarCom('11144477735', '11h00'));
const r2 = await agendarCom('11144477735', '11h15');
ok('mesmo CPF NÃO agenda de novo antes da data do primeiro', !r2 && (await p.textContent('#e3')).includes('um agendamento por CPF'));
await p.evaluate((ontem) => { for (const [k, v] of globalThis.__store) if (k.startsWith('agendamentos/') && v.cpf === '11144477735') v.data = ontem; }, C.somarDias(hoje, -1));
ok('depois que a data do primeiro passou, o CPF pode agendar de novo', await agendarCom('11144477735', '11h15'));

// ---------------- ADMIN ----------------
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const a = await pagina(desk); await semear(a);
await a.goto(base + '/admin.html');
ok('painel começa bloqueado (login visível, painel oculto)', await a.locator('#login').isVisible() && !(await a.locator('#painel').isVisible()));
await a.fill('#lEmail', 'adm@x.gov.br'); await a.fill('#lSenha', 'errada'); await a.click('#fLogin button');
await a.waitForSelector('#eLogin:not(.oculto)'); ok('senha errada é recusada', (await a.textContent('#eLogin')).includes('incorretos'));
await a.fill('#lSenha', 'ok'); await a.click('#fLogin button'); await a.waitForSelector('#painel:not(.oculto)');
ok('login correto abre o painel', true);
// cadastra manualmente
await a.click('[data-aba=novo]');
await a.fill('#nNome', 'Carlos Eduardo Pinto'); await a.fill('#nCpf', '39053344705'); await a.fill('#nNasc', '1985-03-10'); await a.fill('#nTel', '73988887777'); await a.fill('#nData', seg);
await a.waitForFunction(() => document.querySelector('#nHora').options.length > 1); await a.selectOption('#nHora', '08:30'); await a.click('#nForm button');
await a.waitForSelector('.toast:not(.oculto)'); ok('cadastro manual funciona', (await a.textContent('#toast')).includes('Protocolo'));
// duplicado
await a.fill('#nNome', 'Outra Pessoa Silva'); await a.fill('#nCpf', '86288366757'); await a.fill('#nNasc', '1980-01-01'); await a.fill('#nTel', '73988887777'); await a.fill('#nData', seg);
await a.waitForFunction(() => document.querySelector('#nHora').options.length > 1);
await a.evaluate(() => { const s = document.querySelector('#nHora'); s.innerHTML = '<option>08:30</option>'; });
await a.click('#nForm button'); await a.waitForSelector('#nErro:not(.oculto)'); ok('admin também não consegue duplicar horário', (await a.textContent('#nErro')).includes('ocupado'));
// lista + ações
await a.click('[data-aba=agend]'); await a.fill('#gFim', C.somarDias(hoje, 30)); await a.click('#gBuscar'); await a.waitForSelector('#gTb [data-ref]');
ok('tabela mostra CPF protegido', (await a.textContent('#gTb')).includes('***.') && !(await a.textContent('#gTb')).includes('39053344705'));
await a.click('#gTb [data-ref]'); await a.click('[data-a=presente]'); await a.waitForSelector('.tag.presente');
ok('registra presença', true);
await a.click('#gTb [data-ref]'); await a.click('[data-a=concluido]'); await a.waitForSelector('.tag.concluido'); ok('conclui atendimento', true);
await a.click('[data-aba=vagas]'); await a.fill('#vFim', C.somarDias(hoje, 14)); await a.click('#vBuscar');
await a.waitForSelector('#vTb tr'); const linha = (await a.locator('#vTb tr', { hasText: C.formatarData(seg) }).first().textContent());
ok('controle de vagas: "19 de 20" disponíveis (1 ocupada, concluída)', linha.includes('19 de 20'), linha.replace(/\s+/g, ' ').slice(0, 90));
await a.screenshot({ path: '/tmp/claude-0/-home-claude/4502446a-0fc9-5dc1-a475-42bb68f62370/scratchpad/admin-vagas.png' });
a.on('dialog', (d) => d.accept());
// configurações: logo, cor, aviso
await a.click('[data-aba=datas]'); await a.waitForSelector('#cNomeSAC');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGPg9p/zHx9mGBkKADSofUGtjP6tAAAAAElFTkSuQmCC', 'base64');
await a.setInputFiles('#logoArq', { name: 'logo.png', mimeType: 'image/png', buffer: png });
await a.waitForSelector('#logoPrev img'); ok('envio de logo mostra a prévia e o cabeçalho do painel', (await a.locator('.topo .brasao img').count()) === 1);
await a.setInputFiles('#logoArq', { name: 'x.gif', mimeType: 'image/gif', buffer: png });
await a.waitForSelector('.toast.erro'); ok('formato inválido (GIF) é recusado', (await a.textContent('#toast')).includes('PNG, JPG'));
await a.fill('#cNomeSAC', 'SAC Matina'); await a.fill('#cMun', 'Matina'); await a.fill('#cEnd', 'Rua Nova, 10'); await a.fill('#cAviso', 'Atendimento suspenso dia 15');
await a.fill('#cEnc', 'Fulano - lgpd@matina.ba.gov.br'); await a.fill('#cCorTxt', '#157347'); await a.dispatchEvent('#cCorTxt', 'input');
await a.fill('#cCorTxt', 'verde'); await a.click('#cSalvar'); ok('cor inválida é recusada', (await a.textContent('#cErro')).includes('Cor inválida'));
await a.fill('#cCorTxt', '#157347'); await a.click('#cSalvar'); await a.waitForFunction(() => document.querySelector('#toast').textContent.includes('salvas'));
const salvo = await a.evaluate(() => globalThis.__store.get('config/geral'));
ok('salva configurações sem apagar período nem logo', salvo.nomeSAC === 'SAC Matina' && salvo.corPrincipal === '#157347' && !!salvo.abertura && !!salvo.fechamento && salvo.logo.startsWith('data:image/'));
// o site do cidadão passa a mostrar logo, cor e aviso
const c2 = await pagina(mobile); await c2.addInitScript((c) => { (globalThis.__store ||= new Map()).set('config/geral', c); }, salvo);
await c2.goto(base + '/index.html'); await c2.waitForSelector('#avisoGeral:not(.oculto)');
ok('site do cidadão mostra logo, aviso e a cor escolhida', (await c2.locator('.topo .brasao img').count()) === 1 && (await c2.textContent('#avisoGeral')).includes('suspenso') && (await c2.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--azul').trim())) === '#157347');
ok('título e nome refletem a configuração', (await c2.textContent('#tNome')).includes('SAC Matina'));
await c2.click('#lkPriv'); ok('encarregado de dados aparece na política de privacidade', (await c2.textContent('#pEncarregado')).includes('lgpd@matina'));
ok('sem erros de JavaScript (site com logo)', c2.erros.length === 0, c2.erros.join('|'));
await a.click('[data-aba=datas]'); await a.click('#logoRemover'); await a.waitForFunction(() => !document.querySelector('#logoPrev img')); ok('remover logo volta ao padrão', true);
await a.click('[data-aba=aud]'); await a.waitForSelector('#auTb tr'); ok('auditoria registra as operações', (await a.locator('#auTb tr').count()) >= 4);
await a.click('#bSair'); await a.waitForSelector('#login:not(.oculto)'); ok('sair volta ao login', true);
ok('sem erros de JavaScript no painel', a.erros.length === 0, a.erros.join(' | '));

await browser.close(); srv.close();
const falhas = resultados.filter((r) => !r[1]); console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificações OK`); process.exit(falhas.length ? 1 : 0);
