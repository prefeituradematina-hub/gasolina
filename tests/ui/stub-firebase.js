// Firebase FALSO em memória — só para o teste de interface (não é usado em produção).
// Imita o comportamento essencial: criar documento que já existe = recusado (como as regras fazem com "vagas").
const store = (globalThis.__store ||= new Map());
const listeners = [];
const ts = () => ({ toDate: () => new Date(), __ts: 1 });
export class Timestamp { static fromDate(d) { return { toDate: () => d }; } }
export const serverTimestamp = ts;
export const documentId = () => '__name__';
export const initializeFirestore = () => ({}); export const getAuth = () => ({ get currentUser() { return globalThis.__user || null; } });
export const initializeApp = () => ({});
export const connectFirestoreEmulator = () => {}; export const connectAuthEmulator = () => {};
export const setPersistence = async () => {}; export const browserSessionPersistence = {};
export const doc = (_db, ...p) => { if (_db && _db.isColl) p = [_db.path, Math.random().toString(36).slice(2)]; const path = p.join('/'); return { path, id: path.split('/').pop() }; };
export const collection = (_db, ...p) => ({ path: p.join('/'), isColl: true });
export const where = (f, op, v) => ({ t: 'w', f, op, v }); export const orderBy = (f) => ({ t: 'o', f }); export const limit = (n) => ({ t: 'l', n });
export const query = (c, ...cs) => ({ ...c, cs });
const snap = (path, data) => ({ id: path.split('/').pop(), ref: { path }, data: () => data, exists: () => data !== undefined });
export async function getDoc(r) {
  if (globalThis.__semBanco) { const e = new Error('not-found'); e.code = 'not-found'; throw e; } return snap(r.path, store.get(r.path)); }
export async function getDocs(q) {
  if (globalThis.__negaVagas && q.path === 'vagas') { const e = new Error('denied'); e.code = 'permission-denied'; throw e; }
  if (globalThis.__lento && q.path === 'bloqueios') await new Promise((r) => setTimeout(r, globalThis.__lento));
  if (globalThis.__travado && q.path === 'bloqueios') await new Promise(() => {});
  const pre = q.path + '/'; let out = [];
  for (const [p, d] of store) if (p.startsWith(pre) && !p.slice(pre.length).includes('/')) out.push([p, d]);
  for (const c of q.cs || []) if (c.t === 'w') out = out.filter(([p, d]) => { const v = c.f === '__name__' ? p.split('/').pop() : d[c.f]; return { '==': v === c.v, '>=': v >= c.v, '<=': v <= c.v, '<': v < c.v }[c.op]; });
  return { docs: out.map(([p, d]) => snap(p, d)) };
}
export function writeBatch() {
  const ops = [];
  return {
    set: (r, d, o) => ops.push(['set', r.path, d, o]), update: (r, d) => ops.push(['upd', r.path, d]), delete: (r) => ops.push(['del', r.path]),
    async commit() {
      const tmp = new Map(store);
      for (const [k, p, d, o] of ops) {
        if (k === 'set' && o && o.merge) { tmp.set(p, { ...tmp.get(p), ...d }); continue; }
        if (k === 'set') { const liberado = /^cpfAtivos\//.test(p) && tmp.has(p) && (!tmp.get(`agendamentos/${tmp.get(p).ref}`) || tmp.get(`agendamentos/${tmp.get(p).ref}`).data < new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)); if (tmp.has(p) && /^(vagas|cpfAtivos)\//.test(p) && !liberado) { const e = new Error('permission-denied'); e.code = 'permission-denied'; throw e; } tmp.set(p, d); }
        if (k === 'upd') tmp.set(p, { ...tmp.get(p), ...d });
        if (k === 'del') tmp.delete(p);
      }
      store.clear(); for (const [k, v] of tmp) store.set(k, v);
    },
  };
}
export async function signInWithEmailAndPassword(_a, email, senha) {
  if (senha !== 'ok') { const e = new Error('x'); e.code = 'auth/invalid-credential'; throw e; }
  globalThis.__user = { uid: 'adm1', email }; listeners.forEach((f) => f(globalThis.__user)); return {};
}
export const signOut = async () => { globalThis.__user = null; listeners.forEach((f) => f(null)); };
export const onAuthStateChanged = (_a, f) => { listeners.push(f); f(globalThis.__user || null); };

export const getDocFromServer = async (r) => getDoc(r);
export async function runTransaction(_db, fn) {
  if (globalThis.__semBancoGravar) { const e = new Error('The database (default) does not exist'); e.code = 'not-found'; throw e; }
  if (globalThis.__commitTravado) await new Promise(() => {});
  const b = writeBatch();
  await fn({ set: (r, d, o) => b.set(r, d, o), update: (r, d) => b.update(r, d), delete: (r) => b.delete(r) });
  return b.commit();
}
