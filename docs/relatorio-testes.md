# Relatório de testes

Data: 28/10/2026. Ambiente: Node 22, Chromium (Playwright).

## O que foi executado e passou

**A) Lógica (`npm test`) — 15/15**: 20 horários (08:00–12:45, 15 em 15 min, nenhum às 13:00); sábado/domingo nunca disponíveis; data bloqueada, fora da janela e passada sem horários; horário ocupado some e 20 ocupados = dia cheio; horários que já passaram hoje; validação de CPF/telefone/e-mail/nome/nascimento; máscara de CPF; 5.000 protocolos únicos no formato `CIN-XXXX-XXXX-XXXX`; chave do comprovante depende dos 3 dados; cancelamento libera vaga; fuso de Brasília (inclusive meia-noite); escape de HTML; feriados e Páscoa; validação de cor e logo.

**B) Interface (`npm run test:ui`) — 40/40; página de dias (`node tests/ui/funcionamento.mjs`) — 12/12**, em tela de celular (375 px) e desktop, com **Firebase simulado em memória**: página inicial; erros de formulário; CPF inválido; calendário com fim de semana desabilitado; 20 horários; CPF mascarado; aceite LGPD; comprovante completo sem CPF inteiro e sem CPF na URL; botão de e-mail honesto (mailto); horário ocupado aparece em vermelho e bloqueado para o próximo cidadão; corrida pelo mesmo horário (avisa e nada é confirmado); consulta com dados errados; cancelamento libera a vaga; login com senha errada; cadastro manual; duplicidade barrada também pelo admin; CPF protegido na tabela; presença/conclusão; "19 de 20"; bloqueio de datas; auditoria; logout; envio e remoção de logo, formato inválido recusado, cor inválida recusada, configurações salvas sem apagar o período, logo/cor/aviso/encarregado visíveis no site do cidadão; horários livres em verde e ocupados em vermelho; nenhum erro de JavaScript.

## Correções desta revisão

- **Botão "Realizar agendamento" parado (29/10):** na versão publicada o botão era desativado sem explicação quando a configuração não estava salva ou as regras não estavam publicadas, e um `firebase-config.js` sem as exportações opcionais derrubava toda a página. Agora o botão nunca fica morto (ao clicar mostra o motivo), o import da configuração é tolerante e todas as páginas mostram um aviso vermelho se o sistema não conseguir iniciar. Mescladas as melhorias da versão publicada (mensagens de login, App Check antes do Firestore, verificação de administrador com erro claro). Testes: `lento.mjs` 19/19.

- **Erro `not-found` ao confirmar (29/10):** indica que o banco Firestore não existe no projeto Firebase. O sistema agora diagnostica e explica (para o cidadão e para o painel), bloqueia o botão de agendar quando o banco não é encontrado na abertura e o README ganhou a tabela "Problemas comuns".
- **"Confirmando…" sem fim (29/10):** a gravação usava um lote do Firestore, que fica numa fila do navegador quando o servidor não responde (a tela ficava esperando e a gravação podia acontecer escondida depois). Agora usa transação (falha na hora quando não há conexão), tempo limite de 20 s, verificação no servidor após o tempo limite, mensagem clara com o protocolo de referência e conexão por long-polling (funciona em redes/antivírus/bloqueadores que derrubam o canal padrão). Teste: `tests/ui/lento.mjs` (13/13).
- **Calendário travando (29/10):** o calendário só era desenhado depois de uma consulta ao Firebase; com conexão lenta ou bloqueada a tela ficava em branco. Agora é desenhado na hora, as datas bloqueadas chegam em segundo plano, há tempo limite de 15 s com mensagem clara, o Firestore usa detecção automática de long-polling (redes/navegadores que bloqueiam o canal padrão) e uma configuração salva com formato errado não derruba mais a tela. Teste: `tests/ui/lento.mjs` (8/8).
- Salvar configurações usava gravação completa e podia apagar período/logo → agora mescla campos.
- Mensagem "CPF já agendado" nunca aparecia para o cidadão (leitura negada por privacidade) → mensagem com os motivos possíveis.
- Mensagem do painel acusava "CPF duplicado" para qualquer recusa → agora confere de fato.
- Troca rápida de dia podia mostrar horários do dia anterior → resposta atrasada é descartada.
- Dados pessoais ficavam preenchidos no formulário após agendar (computador compartilhado) → formulário é limpo.
- Data/hora de hoje dependiam do formato do navegador → agora calculadas por partes no fuso de Brasília.
- Painel sem controle de sessão ociosa → logout após 30 min.
- Duas telas duplicavam o bloqueio de datas → mantida só "Dias de funcionamento".

## O que NÃO foi executado (seja transparente)

| Item | Situação |
|---|---|
| **Regras reais do Firestore** (`tests/rules.test.mjs`, 13 cenários incluindo 5 reservas simultâneas) | **Escrito, mas não rodado**: o emulador do Firebase não pôde ser baixado neste ambiente (rede bloqueada). **Rode `npm run test:regras` antes de publicar.** Como as regras são a única barreira contra duplicidade e fim de semana, este teste é obrigatório. |
| Reservas simultâneas contra o Firestore real | Dependem do teste acima. A simulação da interface só imita a recusa. |
| Funcionamento com o seu projeto Firebase real e GitHub Pages | Não testado (credenciais suas). Faça o roteiro do README e uma reserva de teste. |
| Impressão/PDF do comprovante, exportação PDF/Excel | Implementados (impressão do navegador, jsPDF, SheetJS), não executados (bibliotecas via CDN indisponíveis aqui). |
| Backup/restauração e anonimização | Implementados; não executados contra banco real. Teste com dados fictícios. |
| Persistência após reinício | Garantida pelo Firestore (nuvem), não testável localmente. |

## Riscos conhecidos

- Robôs podem tentar ocupar vagas com CPFs válidos fabricados: ative o **App Check** (README, seção 5) e monitore o painel.
- O CPF é guardado em texto no documento do agendamento (somente administrador lê), para o servidor conferir. Restrinja bem quem é administrador.

## Revisão técnica (Out/2026)
Corrigido: lote com vários agendamentos compartilhando um `cpfKey`; datas impossíveis (30/02) nas regras; comprovante agora confere `cpfMasc`/`certidao`/`ref`; `restaurarBackup` não falha em dados existentes (pula vagas/CPF/histórico já presentes e limita datas por lote); backup grava Timestamps corretamente; validação de abertura/fechamento ao salvar; protocolo tolera O/I/L digitados. Rules tests novos escritos (ainda sem emulador). Suítes: core 16/16, smoke 40/40, funcionamento 12/12, lento 20/20.

## Alterações de 30/10/2026
- Consulta/cancelamento do cidadão agora usa **protocolo + CPF** (sem data de nascimento). A chave do comprovante mudou (v2): agendamentos criados antes desta versão não são encontrados pela consulta pública; o administrador continua vendo e cancelando todos no painel.
- Um agendamento por CPF: "concluído" passa a manter o CPF bloqueado; só cancelado ou "faltou" libera para novo agendamento.
- Calendário do cidadão abre no mês do primeiro dia disponível (antes ficava vazio no fim do mês).
- Suítes: core 16/16, smoke 40/40, funcionamento 12/12, lento 20/20.

## Alterações de 11/11/2026 — CPF volta a poder agendar depois da data
- Regra: um CPF só tem um agendamento enquanto a data do anterior não passou (o dia do atendimento ainda bloqueia; libera no dia seguinte). Depois disso pode agendar de novo, inclusive se o anterior foi concluído ou faltou. Cancelar libera na hora, como antes.
- `firestore.rules`: `cpfAtivos` ganhou `update` permitido só quando o agendamento anterior já passou (`cpfLiberado`). **Publicar o novo firestore.rules.**
- `adminCancelar` só apaga o controle do CPF se ele ainda pertence ao agendamento cancelado (evita liberar o CPF de um agendamento novo). `adminMarcar` não mexe mais no controle.
- Teste de regras novo escrito (sem emulador); teste de tela novo no smoke (43/43).
