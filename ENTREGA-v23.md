# Entrega v23 — cancelamentos no prontuário e suspensão por período

> ⚠️ **Esta versão PRECISA de uma migration.** É a primeira desde a v21.
> Nome a usar: **`suspensao_por_periodo`**.
> O passo a passo está em [COMO-CRIAR-MIGRATION.md](./COMO-CRIAR-MIGRATION.md).

---

## Ordem para publicar

1. Subir os arquivos para o GitHub
2. Abrir o Codespace e rodar `npm run migration -- --name suspensao_por_periodo`
3. Commit + Sync (a Vercel republica sozinha)
4. **Depois de publicado:** Configurações → *Registrar cancelamentos no prontuário* →
   **Conferir o que falta** → conferir os números → **Registrar**

O passo 4 é o que recupera os cancelamentos antigos. Sem ele, a regra nova vale
só daqui para frente.

---

## 1. Cancelamento agora aparece no prontuário

### O que estava errado

Cancelar ou reagendar um atendimento **apagava** o prontuário pendente em
branco. O prontuário ficava sem nenhum vestígio de que aquele horário existiu —
quem lesse o documento meses depois via um intervalo de três semanas e não tinha
como saber se houve interrupção, abandono ou simples remarcação.

Isso é lacuna documental. O art. 1º da Resolução CFP nº 001/2009 trata o
prontuário como o registro do **curso** do acompanhamento, não apenas dos
encontros que deram certo. Três cancelamentos seguidos pelo paciente são
informação clínica relevante.

### Como ficou

Todo desfecho diferente de "compareceu" deixa uma entrada:

```
Sessão 6 · 12/03/2026
   Evolução…

Cancelada pelo paciente · 05/03/2026
   Atendimento cancelado pelo paciente. Não houve encontro.

Sessão 5 · 26/02/2026
   Evolução…
```

Três garantias no código:

1. **Evolução escrita nunca é sobrescrita.** Se o profissional já tinha
   escrito algo, só a marcação de presença é atualizada.
2. **Séries recorrentes também geram.** As ocorrências seguintes de uma série
   não nascem com rascunho; agora o registro é criado quando o desfecho é
   marcado.
3. **O texto é descritivo, nunca interpretativo.** "Cancelado pelo paciente" é
   fato verificável. Qualquer leitura clínica disso cabe ao profissional
   escrever — o sistema não interpreta. Há um teste que garante isso.

Vale também para **encontros de grupo**: entra no registro coletivo e na ficha
de cada integrante (art. 5º da mesma resolução).

---

## 2. O número da sessão estava errado — e isso foi corrigido

Este era o defeito que eu tinha apontado no fluxo, e ele **precisava** ser
resolvido junto.

O número exibido em cada registro — "Sessão 7" — era apenas a **posição na
lista**, não a contagem de atendimentos. Uma falta já aparecia como "Sessão 7"
mesmo não contando no Controle de Sessões. O documento e o contador se
contradiziam, e é o contador que define alta e renovação de pacote.

Sem corrigir isso antes, incluir os cancelamentos **pioraria** o problema: cada
cancelamento empurraria toda a numeração para cima.

Agora o número pertence só ao que foi realizado:

| Data | Desfecho | Como aparece |
|---|---|---|
| 05/03 | Compareceu | **Sessão 1** |
| 12/03 | Cancelado pelo paciente | *Cancelada pelo paciente* |
| 19/03 | Compareceu | **Sessão 2** |
| 26/03 | Falta | *Falta* |
| 02/04 | Suspenso | *Suspensa* |
| 09/04 | Compareceu | **Sessão 3** |

Vale na tela **e no PDF exportado** — senão o documento impresso contradiria o
sistema.

---

## 3. Suspensão por período

Botão novo na Agenda: **Suspender período**.

Conforme você decidiu:

### Duas marcações separadas

`Afastamento do paciente` e `Afastamento do profissional` são situações
distintas. A primeira fala da disponibilidade de quem é atendido; a segunda, da
capacidade do serviço. Somadas num rótulo só, o setor perderia a única
informação que serve para planejar escala.

### Desfazer em bloco

Cada período é guardado como um registro próprio no banco — é isso que exige a
migration. O sistema sabe exatamente o que marcou e devolve tudo ao estado
anterior num comando: os atendimentos voltam a pendente e as entradas que ele
criou saem dos prontuários.

**O que o desfazer nunca apaga:** evolução escrita por profissional. A
verificação é por comparação com o texto gerado pelo sistema, não por "está
vazio" — um critério de vazio apagaria uma evolução curta que alguém escreveu e
não chegou a versionar, destruindo registro clínico num comando de desfazer.

O período em si permanece no banco, marcado como desfeito. Desfazer é um ato, e
atos sobre prontuário deixam rastro.

### O que a suspensão faz, de uma vez

1. marca os atendimentos **pendentes** do período;
2. **libera as salas e horários** para outro agendamento;
3. grava **uma entrada** no prontuário de cada paciente atingido:

```
Atendimentos suspensos por afastamento do profissional.
Período: de 06/07/2026 até 10/07/2026.
Motivo: férias regulamentares.
3 atendimento(s) do período não foram realizados por este motivo.
```

4. não consome sessão do pacote de ninguém.

Atendimentos que **já têm desfecho** — realizados, faltas, cancelamentos — não
são tocados. Suspender um período não reescreve o que já aconteceu dentro dele.

### Escopo de cada uma

- **Profissional** — atinge os atendimentos individuais **e** os encontros de
  grupo que ele conduz. Se quem conduz está afastado, o encontro não ocorre
  para ninguém.
- **Paciente** — atinge só os atendimentos **individuais**. O encontro de grupo
  continua acontecendo para os demais integrantes; a ausência daquela pessoa é
  presença do encontro, não suspensão do grupo.

### Quem pode lançar

O psicólogo suspende a própria agenda e os pacientes de quem é responsável.
Suspender a agenda de um colega é decisão de escala e fica com Supervisor e
Administrativo.

### O motivo é dado sensível

Guardado **criptografado** e fora da trilha de auditoria. Um campo livre de
motivo recebe com frequência dado de saúde — "licença para tratamento",
"cirurgia marcada" — que é dado pessoal sensível na LGPD (Art. 5º, II) e exige
proteção específica (Art. 46). Na listagem, o motivo só chega ao Supervisor e a
quem lançou; o Administrativo opera a agenda sem precisar da razão clínica.

---

## 4. Sobre "empurrar o fim do acompanhamento"

Você escolheu que o período suspenso não consome o prazo.

**Isso já acontece, e sem risco nenhum:** o setor controla por **número de
sessões** (`maxSessions` / `completedSessions`), não por data de término. Como
nada que foi suspenso conta como sessão realizada, quem tinha 12 previstas
continua com 12.

**O que o sistema NÃO faz sozinho:** remarcar os atendimentos que caíram dentro
do período. Se alguém tinha 12 semanas marcadas e um mês foi suspenso, aqueles 4
horários não são recriados automaticamente no fim da série — o pacote continua
com 12 sessões previstas, mas só 8 estão na agenda.

Isso é uma decisão de agenda, não de contagem, e eu não quis presumir: remarcar
automaticamente esbarra em sala ocupada, férias de outra pessoa e mudança de
horário do paciente. **Quer que eu acrescente?** Faria assim: ao lançar a
suspensão, uma caixa opcional *"remarcar os atendimentos suspensos após o
término"*, mostrando antes quais datas e salas seriam usadas, para você conferir
antes de confirmar.

---

## 5. Testes

`npm run verificar` — **84 testes**, rodados em dois fusos (UTC e Brasília).

Os novos:

```
OK | SUSPENSO_PACIENTE: libera o horário / não consome sessão / não é cancelamento
OK | SUSPENSO_PROFISSIONAL: idem
OK | Há marcações separadas para paciente e profissional
OK | Valor antigo SUSPENSO continua reconhecido
OK | Numeração: cancelamento NÃO recebe número
OK | Numeração: falta NÃO recebe número
OK | Numeração: suspensão NÃO recebe número
OK | Numeração: total numerado = total que consome sessão
OK | Numeração independe da ordem recebida
OK | O texto do cancelamento não interpreta clinicamente
OK | Suspensão: último dia às 19:30 entra
OK | Suspensão: dia seguinte às 08:00 fica de fora
```

Os quatro últimos de janela de data existem porque este projeto já teve bug de
fuso (o atestado que saía com um dia a menos). Se a janela fechasse ao meio-dia,
os atendimentos da tarde do último dia escapariam da suspensão e continuariam
cobrando evolução.

---

## 6. Arquivos alterados

```
prisma/schema.prisma              ← migration necessária
api/_lib/attendance.ts            (+ cópia em src/lib/attendance.ts)
api/_lib/app.ts
src/components/SuspensaoModal.tsx (novo)
src/components/AgendaModal.tsx
src/pages/Agenda.tsx
src/pages/ClientProfile.tsx
src/pages/Settings.tsx
src/lib/pdfProntuario.ts
src/contexts/StoreContext.tsx
src/types.ts
scripts/verificacao.ts
```
