/*
  CORREÇÃO DO PORTAL — Firebase Auth antes de qualquer leitura do Realtime Database

  APLICAÇÃO:
  1) No porta.html, localize o bloco "FASE A DE SEGURANÇA: autenticação anônima".
     Substitua o bloco inteiro pelo trecho 1 abaixo.
  2) Localize a chamada isolada carregarConfigGeral(); e substitua pelo trecho 2.
  3) Substitua a função sair() inteira pelo trecho 3.
  4) Substitua a função logar() inteira pelo trecho 4.
  5) Substitua autenticarNoFirebase() pela versão do trecho 5.

  Não publique este arquivo .js como script separado. Ele é um guia de substituição
  para o código já existente em porta.html.
*/

/* TRECHO 1 — substitui o bloco atual de autenticação anônima.
   Coloque depois de firebase.initializeApp(...) e antes de var db = firebase.database(); */
var firebaseAuthReady = (function() {
  var auth = firebase.auth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  return auth.signInAnonymously().then(function(result) {
    console.log('Firebase autenticado anonimamente:', result.user.uid);
    return result.user;
  }).catch(function(error) {
    console.error('Não foi possível autenticar no Firebase:', error);
    throw error;
  });
})();

/* TRECHO 2 — substitui a chamada carregarConfigGeral(); */
firebaseAuthReady
  .then(function() {
    carregarConfigGeral();
  })
  .catch(function(error) {
    console.error('Configurações gerais não carregadas: autenticação Firebase indisponível.', error);
  });

/* TRECHO 3 — substitui a função sair() inteira.
   O portal encerra a sessão local e renova a sessão técnica anônima. */
function sair() {
  localStorage.removeItem(SESSAO_KEY);
  document.getElementById('tela-hub').style.display = 'none';
  document.getElementById('tela-login').style.display = 'flex';
  document.getElementById('senha').value = '';

  firebaseAuthReady = firebase.auth().signOut()
    .then(function() {
      return firebase.auth().signInAnonymously();
    })
    .then(function(result) {
      console.log('Sessão técnica Firebase renovada.');
      return result.user;
    })
    .catch(function(error) {
      console.error('Falha ao renovar sessão Firebase após sair:', error);
      throw error;
    });
}

/* TRECHO 4 — substitui a função logar() inteira.
   A validação no nó usuarios/config só começa depois da autenticação Firebase. */
function logar() {
  var u = document.getElementById('user').value.trim();
  var s = document.getElementById('senha').value.trim();
  document.getElementById('login-erro').style.display = 'none';

  if (!u || !s) {
    erroLogin('Preencha usuário e senha.');
    return;
  }

  travar(true);

  firebaseAuthReady.then(function() {
    if (u === 'master') {
      return db.ref('config/masterPassword').once('value').then(function(snap) {
        var senhaMaster = snap.val() || '05048989';
        if (s !== senhaMaster) {
          erroLogin('Usuário ou senha incorretos.');
          return;
        }

        var sess = salvarSessao('master', 'admin', 0, '', {
          combustivelLiberado: 'todos',
          senha: senhaMaster,
          role: 'admin',
          permissoes: null
        });

        db.ref('auditoria').push({
          acao: 'LOGIN', usuario: 'master', via: 'portal',
          em: new Date().toISOString()
        }).catch(function(e) {
          console.warn('Não foi possível registrar auditoria do login:', e);
        });

        return autenticarNoFirebase('master', senhaMaster).then(function() {
          mostrarHub(sess);
          travar(false);
        });
      });
    }

    return db.ref('usuarios/' + u).once('value').then(function(snap) {
      var user = snap.val();

      if (user && user.role) {
        user.role = String(user.role).trim().toLowerCase();
      }

      if (!user || user.senha !== s) {
        erroLogin('Usuário ou senha incorretos.');
        return;
      }

      var limiteVictor = user.limiteVictor || 0;
      var limiteMatina = user.limiteMatina || 0;
      var limiteTotal = (limiteVictor + limiteMatina) || user.limite || 0;

      var dados = {
        combustivelLiberado: user.combustivelLiberado || 'todos',
        senha: user.senha,
        role: user.role,
        limite: limiteTotal,
        limiteVictor: limiteVictor,
        limiteMatina: limiteMatina,
        ultimoResetLimite: user.ultimoResetLimite || 0,
        secretariaVinculada: user.secretariaVinculada || '',
        postoVinculado: user.postoVinculado || '',
        postosVinculados: user.postosVinculados || (user.postoVinculado ? [user.postoVinculado] : []),
        acessoGasolina: user.acessoGasolina !== false,
        acessoFrota: user.acessoFrota !== false,
        acessoLavagem: user.acessoLavagem === true,
        acessoOficios: user.acessoOficios === true,
        frotaAdmin: (user.frotaAdmin === undefined ? null : user.frotaAdmin),
        permissoes: user.permissoes || null
      };

      var sess = salvarSessao(u, user.role, limiteTotal, user.secretariaVinculada || '', dados);

      db.ref('auditoria').push({
        acao: 'LOGIN', usuario: u, via: 'portal',
        em: new Date().toISOString()
      }).catch(function(e) {
        console.warn('Não foi possível registrar auditoria do login:', e);
      });

      return autenticarNoFirebase(u, s).then(function() {
        mostrarHub(sess);
        travar(false);
      });
    });
  }).catch(function(err) {
    console.error('Falha durante o login:', err);
    erroLogin('Não foi possível acessar o banco. Verifique a conexão e a autenticação do Firebase.');
  });
}

/* TRECHO 5 — substitui autenticarNoFirebase() inteira.
   Se a autenticação nominal falhar, preserva/recupera uma sessão anônima técnica.
   O login legado continua validado pelo nó usuarios, como no código original. */
function autenticarNoFirebase(login, senha) {
  return new Promise(function(resolve) {
    try {
      var auth = firebase.auth();
      var email = String(login).toLowerCase().replace(/[^a-z0-9._-]/g, '_') + '@sistema.local';

      auth.signInWithEmailAndPassword(email, String(senha))
        .then(function(result) {
          console.log('Autenticado no Firebase como', email);
          resolve(true);
        })
        .catch(function(error) {
          console.warn('Autenticação nominal não concluída:', error && error.code);

          var atual = auth.currentUser;
          if (atual && atual.isAnonymous) {
            resolve(false);
            return;
          }

          auth.signOut()
            .then(function() { return auth.signInAnonymously(); })
            .then(function() { resolve(false); })
            .catch(function(fallbackError) {
              console.error('Também falhou a autenticação anônima:', fallbackError);
              resolve(false);
            });
        });
    } catch (error) {
      console.error('Erro inesperado na autenticação Firebase:', error);
      resolve(false);
    }
  });
}
