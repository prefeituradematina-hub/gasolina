# Guia: colocar no ar e entrar como administrador

Projeto Firebase deste sistema: **agendamento-f33e8**
Links diretos do console (precisa estar logado na conta Google dona do projeto):

- Configurações do projeto: https://console.firebase.google.com/project/agendamento-f33e8/settings/general
- Authentication → Usuários: https://console.firebase.google.com/project/agendamento-f33e8/authentication/users
- Authentication → Métodos de login: https://console.firebase.google.com/project/agendamento-f33e8/authentication/providers
- Authentication → Configurações (domínios): https://console.firebase.google.com/project/agendamento-f33e8/authentication/settings
- Firestore → Dados: https://console.firebase.google.com/project/agendamento-f33e8/firestore/data
- Firestore → Regras: https://console.firebase.google.com/project/agendamento-f33e8/firestore/rules

## Parte A — Conectar o sistema ao Firebase

1. Abra *Configurações do projeto → Geral → Seus aplicativos*. Se não houver app Web, clique em **`</>`**, dê um nome e registre (não precisa marcar Hosting).
2. Copie `apiKey` e `appId` (e `measurementId`, se aparecer).
3. Abra `firebase-config.js` e troque `COLOQUE_SUA_API_KEY`, `COLOQUE_SEU_APP_ID` e `COLOQUE_SEU_MEASUREMENT_ID`. Os demais campos já apontam para o projeto `agendamento-f33e8`.
   - Enquanto `apiKey`/`appId` estiverem como "COLOQUE_…", o site mostra "Sistema ainda não configurado" e o painel não deixa entrar.
4. **Firestore**: *Build → Firestore Database → Criar banco de dados* → modo **produção** → região **southamerica-east1**.
5. **Authentication**: *Começar → Método de login → E-mail/senha → Ativar* (só a primeira opção, sem "link por e-mail").

## Parte B — Publicar as regras de segurança (obrigatório)

1. Abra *Firestore → Regras*.
2. Apague tudo, cole o conteúdo inteiro de `firestore.rules` e clique em **Publicar**.
3. Se aparecer erro vermelho de sintaxe, não publique; me envie a mensagem.

Sem isso o cidadão não consegue agendar e o painel não consegue verificar o administrador.

## Parte C — Cadastrar o usuário administrador e entrar

O administrador tem **duas** partes: o usuário (e-mail/senha) e um documento que o marca como admin.

**C1. Criar o usuário**
1. *Authentication → Usuários → Adicionar usuário*.
2. Informe e-mail e senha forte (12+ caracteres) e confirme.
3. Na lista, copie o **UID** (texto longo na coluna "UID do usuário"; passe o mouse para aparecer o ícone de copiar).

**C2. Marcar como administrador**
1. *Firestore → Dados → Iniciar coleção*.
2. ID da coleção: `admins` (exatamente assim, minúsculo).
3. **ID do documento: cole o UID copiado** (não use "ID automático").
4. Crie um campo qualquer, por exemplo `nome` (string) = `Seu Nome`. Salvar.

**C3. Entrar**
1. Abra `admin.html` (pelo endereço publicado ou por `http://localhost:8000/admin.html`).
2. Entre com o e-mail e a senha do passo C1.
3. No primeiro acesso, o painel abre em **Datas e configurações**:
   - preencha nome do SAC, município e endereço → *Salvar*;
   - abra **Dias de funcionamento** (link no painel) e salve o **período em que o calendário fica aberto**.
   Sem esses dois passos o cidadão não consegue agendar.

**Outros servidores:** repita C1 e C2 para cada pessoa. **Remover acesso:** apague o documento dela em `admins` (e, se quiser, o usuário em Authentication).

### Se o login não funcionar

| Mensagem no painel | O que fazer |
|---|---|
| "Preencha o arquivo firebase-config.js…" | Parte A, passo 3. |
| "O login por e-mail/senha não está ativado…" | Parte A, passo 5. |
| "Este endereço do site não está autorizado…" | Parte D, passo 3 (ou adicione `localhost` para testes locais). |
| "A apiKey … é inválida" | Recopie a `apiKey` do console. |
| "E-mail ou senha incorretos" | Confirme o usuário em Authentication; redefina a senha pelo menu ⋮ do usuário. |
| "Este usuário não é administrador… UID: …" | Parte C2: o ID do documento em `admins` tem de ser exatamente o UID mostrado na mensagem. |
| "Não foi possível verificar a permissão (permission-denied)" | As regras não foram publicadas (Parte B). |
| "Muitas tentativas" | Aguarde alguns minutos. |

## Parte D — Publicar no GitHub Pages

1. Crie uma conta em https://github.com e um repositório (ex.: `agendamento-cin`). Pode ser público: nenhum segredo fica no código (a `apiKey` do Firebase web não é senha). **Nunca** envie backups (`backup-*.json`, já ignorados pelo `.gitignore`) nem chaves de conta de serviço.
2. Envie os arquivos desta pasta (sem `node_modules`). Pelo site: *Add file → Upload files*, arrastando o conteúdo da pasta. Ou por terminal:
   ```bash
   git init && git add . && git commit -m "Sistema de agendamento"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/agendamento-cin.git
   git push -u origin main
   ```
3. *Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.* Em ~1 minuto o site fica em `https://SEU-USUARIO.github.io/agendamento-cin/`.
4. **Autorizar o domínio no Firebase:** *Authentication → Configurações → Domínios autorizados → Adicionar* `SEU-USUARIO.github.io`. Sem isso o login do painel falha.
5. Painel: `https://SEU-USUARIO.github.io/agendamento-cin/admin.html`.

### Teste de fumaça (faça antes de divulgar)
1. Entre no painel e confirme que configurações e período estão salvos.
2. No site do cidadão, faça um agendamento de teste com um CPF válido fictício (ex.: gerado por gerador de CPF), imprima o comprovante.
3. No painel: o agendamento aparece em *Agendamentos*; "Controle de vagas" mostra 19 de 20.
4. Em outro navegador anônimo, tente agendar o **mesmo horário**: deve ser recusado.
5. Consulte e cancele o agendamento de teste pelo site (protocolo + CPF + nascimento) e veja a vaga voltar.
6. Anonimize/descarte os dados de teste.

## Parte E — Antes de divulgar ao público

1. **Rodar o teste das regras** em um computador com Java 11+ e internet livre:
   ```bash
   npm install
   npm run test:regras
   ```
   Deve passar todos os cenários, incluindo as 5 reservas simultâneas (só uma vence). Se algum falhar, não divulgue.
2. **App Check (anti-robô):** README, seção 5. Ative o *Enforce* só depois de testar.
3. **Backup automático** do Firestore (README, seção 7) e um backup manual no painel.
4. Defina o **encarregado LGPD** nas configurações e revise o texto de privacidade em `index.html`.
5. Limite quem é administrador (cada pessoa com o seu próprio usuário; ninguém compartilha senha).
