const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

const PROJECT_ID = 'tabela-gasolina';
const DATABASE_URL = 'https://' + PROJECT_ID + '-default-rtdb.firebaseio.com';
initializeApp({ databaseURL: DATABASE_URL });
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const auth = getAuth();
const db = getDatabase();

function normalizeLogin(value) { return String(value == null ? '' : value).trim().toLowerCase(); }
function validLogin(login) { return /^[a-z0-9._-]{1,40}$/.test(login); }
function digest(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function uidForLogin(login) { return 'usr_' + digest(normalizeLogin(login)).slice(0, 32); }
function emailForLogin(login) { return normalizeLogin(login) + '@sistema.local'; }
function safeEqual(left, right) {
  return crypto.timingSafeEqual(
    crypto.createHash('sha256').update(String(left)).digest(),
    crypto.createHash('sha256').update(String(right)).digest()
  );
}
function withoutPassword(profile) {
  const clean = Object.assign({}, profile || {});
  delete clean.senha;
  return clean;
}
function claimsFor(login, profile) {
  const role = login === 'master' ? 'admin' : String(profile.role || '').trim().toLowerCase();
  const permissions = Array.isArray(profile.permissoes) ? profile.permissoes : [];
  return {
    login,
    active: profile.ativo !== false,
    role,
    admin: login === 'master' || role === 'admin' || permissions.includes('gerenciar_usuarios'),
    secretaria: String(profile.secretariaVinculada || profile.secretaria || ''),
    acessoGasolina: profile.acessoGasolina !== false,
    acessoFrota: profile.acessoFrota !== false,
    acessoLavagem: profile.acessoLavagem === true,
    acessoOficios: profile.acessoOficios === true
  };
}
async function requireSignedIn(request) {
  if (!request.auth || !request.auth.token || !request.auth.token.login ||
      (request.auth.token.firebase && request.auth.token.firebase.sign_in_provider === 'anonymous')) {
    throw new HttpsError('unauthenticated', 'Entre no sistema para continuar.');
  }
  const login = normalizeLogin(request.auth.token.login);
  if (request.auth.uid !== uidForLogin(login) || request.auth.token.active !== true) {
    throw new HttpsError('permission-denied', 'A sessão não corresponde a uma conta ativa.');
  }
  const access = await db.ref('_access/' + request.auth.uid + '/active').once('value');
  if (access.val() !== true) throw new HttpsError('permission-denied', 'Esta conta está inativa.');
  return login;
}
async function requireAdmin(request) {
  const login = await requireSignedIn(request);
  const caller = await auth.getUser(request.auth.uid);
  const issuedAt = Number(request.auth.token.auth_time || 0) * 1000;
  const validAfter = Date.parse(caller.tokensValidAfterTime || '') || 0;
  if (caller.disabled || issuedAt < validAfter || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Somente um administrador autorizado pode executar esta operação.');
  }
  return login;
}
async function hitMigrationLimit(login, request) {
  const ip = String(request.rawRequest && request.rawRequest.ip || 'unknown').slice(0, 80);
  const key = digest(login + '|' + ip);
  const ref = db.ref('_security/authMigrationAttempts/' + key);
  const now = Date.now();
  const result = await ref.transaction(current => {
    if (!current || now - Number(current.startedAt || 0) >= 15 * 60 * 1000) current = { startedAt: now, count: 0 };
    if (current.count >= 10) return;
    current.count += 1;
    current.lastAttemptAt = now;
    return current;
  });
  if (!result.committed) throw new HttpsError('resource-exhausted', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}
function validStrongPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128 &&
    /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}
async function profileForLogin(login) {
  if (login === 'master') return { role: 'admin', acessoGasolina: true, acessoFrota: true, acessoLavagem: true, acessoOficios: true };
  const snap = await db.ref('usuarios/' + login).once('value');
  return snap.exists() ? snap.val() : null;
}

exports.migrateLegacyAccount = onCall({ timeoutSeconds: 30, memory: '256MiB' }, async request => {
  const login = normalizeLogin(request.data && request.data.login);
  const password = String(request.data && request.data.password || '');
  if (!validLogin(login) || !password || password.length > 128) throw new HttpsError('invalid-argument', 'Usuário ou senha inválidos.');
  await hitMigrationLimit(login, request);
  const uid = uidForLogin(login);
  try {
    await auth.getUser(uid);
    throw new HttpsError('already-exists', 'Esta conta já foi migrada. Entre com a senha atual.');
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error.code !== 'auth/user-not-found') throw new HttpsError('internal', 'Não foi possível verificar a conta.');
  }

  let profile;
  let legacyPassword;
  if (login === 'master') {
    const passSnap = await db.ref('config/masterPassword').once('value');
    legacyPassword = passSnap.val();
    if (!legacyPassword) throw new HttpsError('failed-precondition', 'Defina uma senha master atual no banco antes de migrar esta conta.');
    profile = { role: 'admin', nome: 'Master', acessoGasolina: true, acessoFrota: true, acessoLavagem: true, acessoOficios: true };
  } else {
    profile = await profileForLogin(login);
    legacyPassword = profile && profile.senha;
  }
  if (!profile || profile.ativo === false || !legacyPassword || !safeEqual(password, legacyPassword)) {
    throw new HttpsError('unauthenticated', 'Usuário ou senha inválidos.');
  }
  if (password.length < 6) throw new HttpsError('failed-precondition', 'A senha atual tem menos de 6 caracteres. Altere-a antes da migração.');

  let created;
  try {
    created = await auth.createUser({ uid, email: emailForLogin(login), password,
      displayName: String(profile.nome || login).slice(0, 100), disabled: false });
    await auth.setCustomUserClaims(created.uid, claimsFor(login, profile));
    await db.ref('_access/' + uid).set({ active: true, updatedAt: Date.now() });
  } catch (error) {
    if (created) {
      await db.ref('_access/' + uid).remove().catch(() => {});
      await auth.deleteUser(created.uid).catch(() => {});
    }
    if (error.code === 'auth/uid-already-exists' || error.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'A conta já existe no Firebase Authentication. Tente entrar novamente.');
    }
    console.error('Falha ao criar conta migrada:', error && error.code);
    throw new HttpsError('internal', 'Não foi possível migrar esta conta. Nenhuma senha foi removida.');
  }
  try {
    if (login === 'master') await db.ref('config/masterPassword').remove();
    else await db.ref('usuarios/' + login + '/senha').remove();
  } catch (error) {
    await db.ref('_access/' + uid).remove().catch(() => {});
    try { await auth.deleteUser(created.uid); } catch (_) {}
    console.error('Falha ao retirar senha legada:', error && error.code);
    throw new HttpsError('internal', 'Não foi possível concluir a migração. Tente novamente.');
  }
  return { email: emailForLogin(login), migrated: true };
});

exports.syncMyClaims = onCall({ timeoutSeconds: 20, memory: '256MiB' }, async request => {
  const login = await requireSignedIn(request);
  if (request.auth.uid !== uidForLogin(login)) throw new HttpsError('permission-denied', 'A sessão não corresponde à conta do sistema.');
  const profile = await profileForLogin(login);
  if (!profile || profile.ativo === false) {
    await db.ref('_access/' + request.auth.uid).update({ active: false, updatedAt: Date.now() });
    await auth.updateUser(request.auth.uid, { disabled: true }).catch(() => {});
    throw new HttpsError('permission-denied', 'Esta conta está inativa.');
  }
  await db.ref('_access/' + request.auth.uid).set({ active: true, updatedAt: Date.now() });
  await auth.setCustomUserClaims(request.auth.uid, claimsFor(login, profile));
  return { claimsUpdated: true };
});

exports.getUserProfiles = onCall({ timeoutSeconds: 20, memory: '256MiB' }, async request => {
  const caller = await requireSignedIn(request);
  const wanted = request.data && request.data.login ? normalizeLogin(request.data.login) : '';
  if (!request.auth.token.admin && (!wanted || wanted !== caller)) {
    throw new HttpsError('permission-denied', 'Somente administradores podem consultar outras contas.');
  }
  if (wanted) {
    const snapshot = await db.ref('usuarios/' + wanted).once('value');
    return { users: snapshot.exists() ? { [wanted]: withoutPassword(snapshot.val()) } : {} };
  }
  const snapshot = await db.ref('usuarios').once('value');
  const users = {};
  snapshot.forEach(child => { users[child.key] = withoutPassword(child.val()); return false; });
  return { users };
});

exports.getMyProfile = onCall({ timeoutSeconds: 20, memory: '256MiB' }, async request => {
  const login = await requireSignedIn(request);
  if (request.auth.uid !== uidForLogin(login)) throw new HttpsError('permission-denied', 'A sessão não corresponde à conta do sistema.');
  const profile = await profileForLogin(login);
  if (!profile || profile.ativo === false) throw new HttpsError('permission-denied', 'Esta conta está inativa.');
  return { profile: withoutPassword(profile) };
});

exports.removeLegacyFleetCredentials = onCall({ timeoutSeconds: 20, memory: '256MiB' }, async request => {
  await requireAdmin(request);
  await db.ref('frota/dados/usuarios').remove();
  return { removed: true };
});

exports.saveUserProfile = onCall({ timeoutSeconds: 30, memory: '256MiB' }, async request => {
  await requireAdmin(request);
  const login = normalizeLogin(request.data && request.data.login);
  const profile = request.data && request.data.profile;
  const password = request.data && request.data.password;
  const replace = request.data && request.data.replace === true;
  if (!validLogin(login) || login === 'master' || !profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new HttpsError('invalid-argument', 'Dados da conta inválidos.');
  }
  const clean = withoutPassword(profile);
  const profileRef = db.ref('usuarios/' + login);
  const before = await profileRef.once('value');
  if (!before.exists() && !password) throw new HttpsError('invalid-argument', 'Informe uma senha para criar a conta.');
  if (password && !validStrongPassword(password)) throw new HttpsError('invalid-argument', 'Use uma senha de 8 ou mais caracteres com maiúscula, minúscula, número e caractere especial.');
  if (before.exists() && replace) throw new HttpsError('already-exists', 'Este usuário já existe.');
  const uid = uidForLogin(login);
  let authUser = null;
  try { authUser = await auth.getUser(uid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  if (password) {
    if (authUser) authUser = await auth.updateUser(uid, { password, displayName: String(clean.nome || login).slice(0, 100), disabled: clean.ativo === false });
    else authUser = await auth.createUser({ uid, email: emailForLogin(login), password, displayName: String(clean.nome || login).slice(0, 100), disabled: clean.ativo === false });
    await auth.setCustomUserClaims(uid, claimsFor(login, clean));
  } else if (authUser) {
    await auth.updateUser(uid, { displayName: String(clean.nome || login).slice(0, 100), disabled: clean.ativo === false });
    await auth.setCustomUserClaims(uid, claimsFor(login, clean));
  }
  if (replace) await profileRef.set(clean); else await profileRef.update(clean);
  if (password && before.exists()) await profileRef.child('senha').remove();
  if (authUser) await db.ref('_access/' + uid).set({ active: clean.ativo !== false, updatedAt: Date.now() });
  if (authUser && clean.ativo === false) await auth.revokeRefreshTokens(uid);
  return { saved: true };
});

exports.deleteUserProfile = onCall({ timeoutSeconds: 20, memory: '256MiB' }, async request => {
  const caller = await requireAdmin(request);
  const login = normalizeLogin(request.data && request.data.login);
  if (!validLogin(login) || login === 'master' || login === caller) throw new HttpsError('failed-precondition', 'Esta conta não pode ser excluída por esta operação.');
  const uid = uidForLogin(login);
  await auth.deleteUser(uid).catch(error => { if (error.code !== 'auth/user-not-found') throw error; });
  await db.ref('_access/' + uid).remove();
  await db.ref('usuarios/' + login).remove();
  return { deleted: true };
});

exports.changeOwnPassword = onCall({ timeoutSeconds: 20, memory: '256MiB' }, async request => {
  const login = await requireSignedIn(request);
  const password = request.data && request.data.password;
  if (request.auth.uid !== uidForLogin(login)) throw new HttpsError('permission-denied', 'A sessão não corresponde à conta do sistema.');
  if (!validStrongPassword(password)) throw new HttpsError('invalid-argument', 'Use uma senha de 8 ou mais caracteres com maiúscula, minúscula, número e caractere especial.');
  const authTime = Number(request.auth.token.auth_time || 0) * 1000;
  if (!authTime || Date.now() - authTime > 5 * 60 * 1000) throw new HttpsError('failed-precondition', 'Entre novamente antes de alterar a senha.');
  await auth.updateUser(request.auth.uid, { password });
  await auth.revokeRefreshTokens(request.auth.uid);
  if (login === 'master') await db.ref('config/masterPassword').remove();
  else await db.ref('usuarios/' + login + '/senha').remove();
  return { changed: true };
});
