# Entrega v22 — agenda, acolhimento e prontuário de grupo

> **Nenhuma migration é necessária nesta versão.** Nada mudou na estrutura do
> banco. É só subir os arquivos para o GitHub — a Vercel republica sozinha.

---

## 1. Acolhimento emergencial ia sempre para a mesma pessoa

### O que estava acontecendo

O campo "profissional que vai conduzir" **nascia preenchido com quem estava
agendando**. Quem não mexesse no campo gravava a si próprio — por isso todos os
acolhimentos lançados pela mesma pessoa ficavam com ela.

E havia um agravante. O **Administrativo não aparece** nessa lista (só entra
quem tem CRP). Quando um `<select>` guarda um valor que não existe entre as
opções, o navegador **mostra a primeira da lista**. Resultado: a tela exibia o
nome de uma psicóloga enquanto o sistema gravava o Administrativo. A pessoa via
uma escolha que o sistema não tinha feito.

Rodando a lógica antiga com a equipe de exemplo:

| Situação | Aparecia na tela | Era gravado |
|---|---|---|
| Secretaria agenda e não mexe no campo | Ana Paula | **Secretaria** |
| Secretaria agenda e escolhe Carla | Carla | Carla |
| Bruno agenda pensando na Carla, mas não mexe | Bruno | **Bruno** |

### O que mudou

A correção não é um valor padrão melhor — é **tirar o valor padrão**:

- o campo começa **vazio**, com a opção `— escolha o profissional —`;
- o agendamento é **bloqueado** enquanto ninguém for escolhido, com aviso na tela;
- o **servidor recusa** o mesmo caso, mesmo que a tela seja contornada;
- o servidor também recusa designar quem **não é psicólogo nem supervisor**.

Vale para acolhimento, triagem de grupo, entrevista e devolutiva.

Rodando a lógica nova nos mesmos casos: nenhum caminho grava profissional
diferente do que está na tela.

> **Compliance.** O art. 1º da Resolução CFP nº 001/2009 atribui o registro a
> quem **prestou** o serviço, e a Resolução CFP nº 06/2019 exige que o documento
> identifique o psicólogo responsável pelo ato. Um profissional escolhido pelo
> sistema produziria prontuário assinado por quem não atendeu — inveracidade
> documental, não apenas erro de dado. LGPD Art. 6º, V (qualidade dos dados):
> o vínculo autor–atendimento passa a ser sempre declarado, nunca inferido.

### ⚠️ Os acolhimentos já lançados continuam errados

A correção vale daqui para frente. Os registros antigos ficaram com o
profissional errado no banco. Me diga se quer que eu faça uma rotina de
conferência — igual às que já existem em Manutenção — para listar os
acolhimentos e permitir corrigir o profissional de cada um.

---

## 2. SUSPENSO — férias do profissional

Nova situação no bloco de presença do agendamento, **separada do cancelamento**:

> **Indisponibilidade do profissional** → `Suspenso (férias/afastamento)`

| | Cancelado | **Suspenso** |
|---|---|---|
| Quem decidiu | paciente ou serviço | ninguém — o serviço não estava disponível |
| Sala e horário | liberados | **liberados** |
| Consome sessão do pacote | não | não |
| Cobra evolução escrita | não | não |
| Conta como encontro do grupo | não | não |
| Aparência na agenda | cinza, **riscado** | âmbar, **borda tracejada** |
| Indicador de adesão | conta como interrupção | **não conta** |

A distinção visual e de indicador é o ponto: férias não são desistência do
paciente nem falha de escala. Tratar as duas coisas como cancelamento faria os
números do setor acusarem abandono onde houve férias.

O horário fica na agenda como histórico, mas **a sala volta a aceitar outro
agendamento** — é o que você pediu.

> **Compliance.** Resolução CFP nº 001/2009, art. 1º: o prontuário registra o
> que efetivamente ocorreu. Registrar férias como "cancelado pelo serviço"
> descreveria um ato que não houve. LGPD Art. 6º, V.

---

## 3. Impressão do prontuário de grupo

O PDF trazia **só o registro coletivo**. Faltava justamente o que o **art. 5º da
Resolução CFP nº 001/2009** torna obrigatório: a documentação individual de cada
participante. Na prática, o setor imprimia metade do prontuário.

Agora cada encontro sai com as duas camadas:

```
ENCONTRO Nº 7 — 12/03/2026 · Presentes: 6 de 8
├── Registro coletivo do encontro
│      autor + o que aconteceu no grupo
└── Registros individuais dos integrantes (6)
       Maria Silva · Compareceu
         Registro de: Ana Paula — CRP 12/11111
         [evolução individual]
       Ana Souza · Falta justificada
         ...
```

E, ao final, uma seção nova: **anotações de acompanhamento por integrante** — a
observação contínua que cada profissional mantém sobre o participante ao longo
do processo.

Outros ajustes no documento:

- os encontros são **numerados** com o mesmo número que aparece na ficha do
  paciente ("Sessão 7" significa a mesma coisa nos dois lugares);
- entram no documento os integrantes **já desligados**, porque participaram dos
  encontros anteriores e o prontuário é o histórico do processo;
- a contagem de encontros passa a excluir os que não aconteceram.

### O que NÃO sai no documento

As **anotações privadas** de cada profissional continuam fora, sempre. São o
rascunho pessoal de quem escreveu, e imprimi-las num documento que circula entre
condutores e supervisão anularia por via oblíqua a garantia que você pediu. O
art. 1º, § 2º da Resolução CFP nº 001/2009 distingue o prontuário das anotações
pessoais do psicólogo, e só o primeiro compõe o documento. Há uma nota de rodapé
no PDF dizendo isso.

A restrição de download continua: só condutores, coterapeuta e supervisor.

---

## 4. A causa de raiz — reagendamentos que sumiam

Investigando os dois problemas de agenda, encontrei o que os produziu.

A lista de situações em que "o encontro não aconteceu" estava **copiada e colada
em nove lugares**: agenda, painel, numeração de grupos, contador de sessões e
quatro rotinas de manutenção. Cada um desses lugares tinha a sua própria cópia.

Era isso que fazia **alguns reagendamentos aparecerem e outros não** — telas
diferentes tinham entendimentos diferentes sobre o mesmo fato clínico. E seria
isso que faria o SUSPENSO funcionar em três lugares e falhar nos outros seis.

Agora existe **um arquivo só** (`attendance.ts`). Criar uma situação nova é
acrescentar uma linha, e o sistema inteiro passa a tratá-la igual.

Como front-end e servidor têm compiladores separados, o arquivo tem duas cópias
idênticas — e o `npm run verificar` **compara as duas byte a byte e falha** se
alguém alterar uma e esquecer a outra.

---

## 5. Testes

`npm run verificar` passou a cobrir também estas mudanças. São **44 testes**,
rodados duas vezes (fuso UTC e fuso de Brasília):

```
OK | Presença: as duas cópias de attendance.ts são idênticas
OK | Presença: SUSPENSO libera o horário
OK | Presença: SUSPENSO não consome sessão
OK | Presença: SUSPENSO não é cancelamento
OK | Acolhimento: sem escolha, é bloqueado
OK | Acolhimento: nunca cai em quem está agendando
OK | Acolhimento: administrativo não pode ser designado
OK | PDF do grupo: traz o registro coletivo
OK | PDF do grupo: traz a evolução individual de cada membro
OK | PDF do grupo: traz a anotação de acompanhamento
OK | PDF do grupo: NÃO vaza a anotação privada
```

---

## Como publicar

Nenhuma migration. Suba os arquivos alterados pelo GitHub e a Vercel republica
em alguns minutos.

Arquivos alterados:

```
api/_lib/attendance.ts          (novo)
api/_lib/app.ts
src/lib/attendance.ts           (novo)
src/lib/groupSessions.ts
src/lib/pdfProntuarioGrupo.ts
src/components/AgendaModal.tsx
src/pages/Agenda.tsx
src/pages/Dashboard.tsx
src/pages/GroupProfile.tsx
src/types.ts
scripts/verificacao.ts
```
