# Agendamento SAC – Carteira de Identidade Nacional (CIN)

Sistema de agendamento online (gratuito para o cidadão) feito em **HTML + JavaScript puro**, com **Firebase** (Firestore + Authentication) e hospedagem no **GitHub Pages**.

| Arquivo | Para que serve |
|---|---|
| `index.html` | Site do cidadão (agendar, consultar, cancelar, comprovante) |
| `admin.html` | Painel administrativo (login) |
| **`firebase-config.js`** | **Único arquivo com os dados do Firebase** (separado do index) |
| `firestore.rules` | Regras de segurança — garantem vagas, limite de 20/dia, fins de semana etc. |
| `js/`, `css/` | Código do sistema |
| `tests/` | Testes automatizados |

> **Como funciona sem servidor:** as regras de negócio (20 vagas, sem fim de semana, sem horário duplicado, datas bloqueadas) ficam em `firestore.rules`, executadas pelo Google. Cada horário é um documento `vagas/AAAA-MM-DD_HH:MM`: só um agendamento consegue criá-lo, mesmo com acessos simultâneos.

---

## 1. Criar o projeto no Firebase

1. Acesse <https://console.firebase.google.com> → **Adicionar projeto**.
2. **Build → Firestore Database → Criar banco de dados**. Escolha **modo de produção** e a região **southamerica-east1 (São Paulo)**.
3. **Build → Authentication → Começar → Email/senha → Ativar**.
4. **Configurações do projeto (engrenagem) → Seus aplicativos → `</>` (Web)** → registre o app e copie o `firebaseConfig`.
5. Cole os valores em **`firebase-config.js`**.

## 2. Publicar as regras de segurança (obrigatório)

No console: **Firestore Database → Regras** → apague tudo, cole o conteúdo de `firestore.rules` → **Publicar**.
(Ou, com a CLI: `npm i -g firebase-tools && firebase login && firebase deploy --only firestore:rules`.)

Sem este passo o sistema **não funciona** e, pior, o banco fica sem as proteções.

## 3. Criar o primeiro administrador

1. **Authentication → Usuários → Adicionar usuário**: informe e-mail e uma senha forte. Copie o **UID** do usuário criado.
2. **Firestore → Iniciar coleção** `admins` → ID do documento = **o UID copiado** → crie um campo qualquer (ex.: `nome` = `Fulano`).
3. Acesse `admin.html`, entre e abra **Configurações**: preencha nome, município e endereço (e logo, se quiser) e clique em *Salvar*. Depois abra **Dias de funcionamento** e salve o **período em que o calendário fica aberto**. **Sem salvar esses dois passos, o cidadão não consegue agendar.**

Para outros servidores: repita (usuário + documento em `admins`). Para remover acesso: apague o documento em `admins`.

## 4. Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta.
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** → Save.
3. O site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/` (cidadão) e `.../admin.html` (painel).
4. No Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar** `SEU-USUARIO.github.io`. (Sem isso o login do painel falha.)

**Domínio próprio e HTTPS:** em *Settings → Pages → Custom domain* informe, por exemplo, `agendamento.suaprefeitura.gov.br`; no provedor de DNS crie um registro **CNAME** apontando para `SEU-USUARIO.github.io`; marque **Enforce HTTPS** (certificado gratuito, automático). Depois adicione o novo domínio em *Domínios autorizados* do Firebase.

## 5. Proteção contra robôs (recomendado)

Como o site é público, um robô poderia tentar reservar todas as vagas. O sistema limita a 1 agendamento ativo por CPF, mas a defesa forte é o **Firebase App Check**:
1. Console → **App Check → Aplicativo Web → reCAPTCHA v3** (crie a chave em <https://www.google.com/recaptcha/admin>).
2. Cole a *site key* em `appCheckSiteKey` no `firebase-config.js`.
3. Depois de testar, ative **Aplicar (Enforce)** para o Firestore.

O painel permite cancelar agendamentos suspeitos (libera a vaga na hora).

## 6. Uso diário

- **Agendamentos**: busca por nome, CPF, protocolo ou data (dd/mm/aaaa); abrir → presença, concluir, não compareceu, alterar data/horário, cancelar, histórico, comprovante. O CPF aparece mascarado; "mostrar" revela dentro do detalhe.
- **Controle de vagas**: por dia, "vagas disponíveis: X de 20", concluídos, cancelamentos, faltas.
- **Novo agendamento**: cadastro manual (mesmas travas de horário e CPF).
- **Dias de funcionamento** (`funcionamento.html`, link no painel): calendário mensal com vagas por dia, bloquear/reabrir dias (Ctrl para vários, Shift para intervalo), período de agendamento (+30/60/90 dias) e sugestão de feriados nacionais (Carnaval, Corpus Christi e 2 de julho vêm desmarcados). Atendimento continua só de segunda a sexta (regra fixa do serviço, também nas regras do Firestore).
- **Configurações** (aba no painel): **logo** (enviada pelo painel, reduzida automaticamente e guardada no próprio Firestore, sem precisar do Firebase Storage), nome do SAC, município, **cor principal** do site, local, endereço, telefone, e-mail, **aviso na página inicial** (opcional) e **encarregado de dados LGPD** (opcional). Logo e cor aparecem no site do cidadão, no comprovante e no painel.
- **Sessão**: o painel encerra o login sozinho após 30 minutos sem uso e ao fechar o navegador.
- **Relatórios**: por dia ou mês, exportação em **PDF** e **Excel**.
- **Auditoria**: quem fez o quê (somente inclusão, ninguém apaga).

## 7. Backup e restauração

- **Manual**: painel → *Backup e LGPD* → *Baixar backup (JSON)*. Guarde em local protegido (contém dados pessoais). Para restaurar: escolha o arquivo e *Restaurar*. Faça um backup antes de restaurar.
- **Automático (recomendado)**: Firestore → **Backups → Agendamento de backup** (diário, retenção de 7 dias a 14 semanas). Requer plano Blaze (pago por uso; para este volume o custo é mínimo). Restauração: `gcloud firestore databases restore ...` ou pelo console (aba Backups).

## 8. LGPD

- Coleta só o necessário; o CPF nunca aparece inteiro em comprovante, URL ou página pública.
- Consultar/cancelar exige **protocolo + CPF** (o ID do comprovante é derivado desses dois dados; não existe listagem pública).
- Retenção: painel → *Backup e LGPD* → **Anonimizar** atendimentos encerrados anteriores a uma data.
- Defina o responsável (encarregado) e a base legal junto à assessoria jurídica do município, e ajuste o texto de privacidade em `index.html` (seção `vPriv`).

## 9. E-mail de confirmação

O Firebase sozinho não envia e-mail sem servidor. Por isso o botão **"Abrir no meu e-mail"** só abre o e-mail do próprio cidadão com os dados prontos, e o sistema **não afirma que enviou nada**. Para envio automático seria preciso um serviço externo (por exemplo, a extensão *Trigger Email* do Firebase, plano Blaze + SMTP).

## 10. Limites do Firebase (plano gratuito Spark)

50 mil leituras e 20 mil gravações por dia. Cada cidadão consome poucas dezenas de leituras; o volume de 20 atendimentos/dia cabe com folga.

## 11. Testes

```bash
npm install
npm test            # lógica (horários, CPF, protocolo, vagas...) – não precisa de Firebase
npm run test:ui     # navegador real + Firebase simulado (precisa do Playwright)
node tests/ui/funcionamento.mjs   # página de dias de funcionamento
node tests/ui/lento.mjs           # conexão lenta/travada
npm run test:regras # regras do Firestore no emulador (precisa de Java)
```

Veja `docs/relatorio-testes.md` para o que foi e o que não foi executado.

## 12. Desenvolvimento local

`python3 -m http.server 8000` na pasta e abra `http://localhost:8000` (os módulos JS exigem servidor; não abra o arquivo direto). Adicione `localhost` aos domínios autorizados do Firebase.

## 13. Problemas comuns (diagnóstico)

O sistema mostra um **código** no fim da mensagem de erro. Veja o que significa:

| Código / sintoma | Causa | Solução |
|---|---|---|
| `not-found` / "banco de dados ainda não foi criado" | O **Firestore** não existe no projeto (o "Realtime Database" é outro serviço e não serve) | Console Firebase → **Build → Firestore Database → Criar banco de dados** (modo produção, região São Paulo). Depois **Regras → colar `firestore.rules` → Publicar** |
| `permission-denied` | Regras não publicadas, período do calendário não salvo, data bloqueada/fora do período, horário já ocupado, ou administrador sem documento em `admins` | Publicar as regras; em **Dias de funcionamento** salvar o período; conferir o UID em `admins` |
| `timeout` / "Sem resposta do servidor" | Internet ruim ou rede bloqueando o Google | Testar em outra rede/4G e sem extensões de bloqueio |
| Login do painel falha | Domínio não autorizado ou login por e-mail/senha desativado | Authentication → Domínios autorizados e Método de login |
| "Sistema ainda não configurado" | `apiKey` ou `appId` ainda são "COLOQUE…" em `firebase-config.js` | Colar os valores reais do app Web |

Dica: pressione **F12 → Console** para ver o erro técnico completo.
