# Alterações — Setor de Psicologia ALESC - PWA

Documento de entrega. Contém **o que mudou**, **o que você precisa fazer antes de publicar** e a **auditoria de compliance** de cada mudança.

---

## 1. AÇÃO NECESSÁRIA ANTES DO PRÓXIMO DEPLOY

> 📖 **O passo a passo detalhado, feito para ser seguido sem conhecimento técnico, está em [COMO-PUBLICAR.md](./COMO-PUBLICAR.md).** Esta seção é só o resumo.

Três coisas, na ordem:

1. **Cadastrar `DIRECT_URL` na Vercel** — a string de conexão do Neon **sem** o `-pooler`. As migrations do Prisma não funcionam através do pooler (PgBouncer em modo transação). Sem isso, o build falha.
2. **Gerar a migration inicial**, uma única vez, pelo **GitHub Codespaces** (terminal no navegador, sem instalar nada): `npm run migration -- --name init`.
3. **Criar os usuários iniciais**: `npm run db:seed`. O seed não roda mais a cada publicação — semear um banco de prontuários em todo build é arriscado.

Depois disso, o fluxo volta a ser 100% pelo navegador. A única exceção passa a ser mudança de estrutura do banco, que exige uma migration nova — e isso é intencional: antes, uma alteração malfeita no `schema.prisma` era aplicada direto na produção, em silêncio.

### Correção de segurança encontrada no caminho

O projeto **não tinha `.gitignore`**, embora o `.env.example` afirmasse que "o .gitignore já bloqueia isso". Na prática, um `.env` criado localmente poderia ser enviado ao GitHub por engano — junto com a `DATABASE_URL`, o `JWT_SECRET` e o `ENCRYPTION_KEY`, que é a chave capaz de decifrar todos os dados dos pacientes. O arquivo foi criado. **Certifique-se de que ele suba para o repositório** (arquivos iniciados com ponto costumam ficar ocultos no explorador de arquivos).

### Variáveis de ambiente

`DATABASE_URL` (pooled), `DIRECT_URL` (direta), `JWT_SECRET`, `ENCRYPTION_KEY`. Se a `ENCRYPTION_KEY` mudar, **todo dado criptografado se torna ilegível** — não há recuperação.

---

## 2. AS 6 ALTERAÇÕES SOLICITADAS

### ① Identidade visual e metadados

O nome vive agora em **um único arquivo**: `src/lib/branding.ts`. Trocar o nome do sistema = editar uma linha.

| Onde | Antes | Agora |
|---|---|---|
| Aba do navegador | `My Google AI Studio App` | `Setor de Psicologia ALESC - PWA` |
| Tela de login | `Clínica Inteligente` | Nome completo + ALESC |
| Menu lateral | `Clínica Admin` | `Psicologia ALESC` |
| `metadata.json`, `package.json` | nome antigo | atualizados |

Também: `lang="pt-BR"`, `noindex/nofollow` (sistema com dado de saúde não deve ser indexado) e `referrer: no-referrer`.

**PWA de verdade** (item 5 do diagnóstico): criados `manifest.webmanifest`, ícones (192, 512, maskable, apple-touch, favicon) e service worker. O app passa a ser instalável na tela inicial.

> ⚠️ **Confirme:** implementei **"PWA"** conforme sua correção. Se for "WPA", é uma linha em `src/lib/branding.ts`.
> ⚠️ Os ícones são um símbolo Ψ genérico que desenhei. Substitua pela identidade oficial da ALESC quando tiver a arte.

---

### ② Supervisor como profissional que atende

Criado `src/lib/roles.ts` como fonte única da verdade. Nenhuma tela compara mais `role === "PSICO"` na mão.

- **CRP obrigatório** para Supervisor, validado no formato `00/00000` — **na tela e na API** (não adianta burlar o front).
- Supervisor aparece em **todas** as listas de profissionais: atribuição de paciente, agenda, grupos, quadro de capacidade, métricas e dashboard.
- Entra no cálculo de capacidade com o mesmo padrão dos psicólogos.
- Pode conduzir grupos.
- Ganhou o filtro "Meus atendimentos" na agenda e em "Em Atendimento", mantendo a visão geral de supervisão.
- A API recusa atribuir paciente ou grupo a profissional **sem CRP cadastrado**.

---

### ③ Anotações privadas por sessão

A funcionalidade existia no banco e na API, mas tinha **um defeito que a tornava invisível na prática**:

> `privateNotesDraft` era preenchido na tela e **nunca enviado ao servidor**. Só dava para criar anotação privada em sessão já salva — por isso você não a encontrava.

**Corrigido:**
- Editor de anotação privada **sempre presente** no painel de redação do prontuário, salvo junto com o registro.
- A API informa (`canWritePrivateNotes`) quem pode escrever; a interface obedece em vez de recalcular a regra.
- Se alguém que não é o autor tentar gravar, a API responde **403** em vez de ignorar em silêncio (silêncio faz o usuário achar que salvou).

**Garantias de sigilo:** o campo é criptografado; a API **não envia** a anotação para Supervisor nem Administrativo (o campo nem existe na resposta); não sai em nenhum PDF; não gera entrada na trilha clínica; e permanece com o autor quando o paciente é transferido.

---

### ④ RBAC para troca de profissional

**A falha era grave:** `assignedPsicoId` estava na lista de campos livres do `PATCH /api/clients/:id` — qualquer psicólogo com acesso ao paciente podia transferir o caso.

Agora:
- Só **Supervisor** e **Administrativo** transferem. Bloqueio **no servidor**.
- **Justificativa obrigatória** (mínimo 10 caracteres), registrada na trilha.
- O campo saiu do formulário de edição e virou ação própria (`TransferPsicoModal`) — transferência é um ato, não a edição de uma ficha.
- **Agendamentos futuros migram** automaticamente; os passados permanecem com quem atendeu.
- Fechei a porta lateral: trocar o profissional de um agendamento avulso segue a mesma regra.
- Única exceção, estreita: primeira atribuição de caso ainda sem responsável, ao agendar (fluxo que você pediu para manter).
- Excluir usuário com pacientes ativos agora é bloqueado (evita vínculo órfão).

---

### ⑤ Bug de fuso horário nos atestados

**Causa-raiz confirmada e corrigida na origem.** `new Date("2026-07-20")` é lido pelo JavaScript como meia-noite **UTC**; ao imprimir em Florianópolis (UTC−3) virava **19/07**. Não era o Neon.

Criados `src/lib/datetime.ts` e `api/_lib/datetime.ts`, com fuso fixo em **America/Sao_Paulo**. Corrigidos: atestado (emissão, nascimento, acompanhamento desde), prontuário, anamnese, urgência, agenda, métricas e a ficha do paciente.

**Verificado por teste automatizado** (`npm run verificar`), rodando com `TZ=UTC` (como a Vercel executa) e `TZ=America/Sao_Paulo`:

```
OK | Atestado: emissão 2026-07-20        | 20/07/2026
OK | Atestado: por extenso               | 20 de julho de 2026
OK | ISO 2026-07-30T01:00Z -> dia civil  | 2026-07-29
OK | Agenda ida-e-volta 20/07 08:00      | 2026-07-20 11:00
```

---

### ⑥ Log de auditoria e rastreabilidade

Duas trilhas, ambas **append-only** (não existe rota de edição ou exclusão, nem para o Supervisor — log editável não serve como prova):

| Trilha | Responde |
|---|---|
| `HistoryLog` | o que mudou no caso, quem mudou, quando |
| `AccessLog` *(nova)* | quem **leu** ou **exportou** dado sensível |

**Regra de sigilo absoluto — implementada como barreira de projeto, não como convenção:**

```ts
logClinicalRecord(clientId, actor, kind, when)  // ← não existe parâmetro de conteúdo
```

A função é **incapaz por assinatura** de receber o texto do prontuário. Grava exatamente:

> *"Prontuário registrado por Ana Souza (Psicólogo) em 20/07/2026 14:30"*

Retificações são rastreadas separadamente (*"Prontuário retificado por..."*), como você pediu.

**Alterações de cadastro** registram apenas **nomes de campos** — nunca valores:

> *"Campos alterados: Nome completo, Status do caso."*

Isso é testado: a verificação prova que o resultado não contém o nome nem o telefone do paciente.

**Leitura da trilha:** restrita a Supervisor e Administrativo. Categorias com cores (Cadastro, Clínico, Documento, Transferência, Fluxo, Sistema). Exportação de PDF e emissão de documentos deixam rastro.

---

## 3. INSIGHTS APLICADOS (você autorizou todos)

| # | Problema | Correção |
|---|---|---|
| 1 | **Administrativo lia prontuário pela API** (a tela só escondia o botão) | Separação real entre *acesso de cadastro* e *acesso clínico*. O Administrativo recebe sessões **sem conteúdo** — mantém contagens e painéis, perde o texto clínico. Documentos psicológicos e prontuários de grupo saíram do payload dele. |
| 2 | `/api/bootstrap` trafegava tudo | Histórico saiu do payload (rota sob demanda); métricas de triagem viraram **agregado no servidor**; colegas trafegam com dados mínimos para quem não gerencia equipe. |
| 3 | Sem migrations versionadas | `prisma migrate deploy` no build (ver §1.1). |
| 4 | Sem trilha de leitura | `AccessLog`, com IP guardado apenas como **hash com sal**. |
| 5 | Sem temporalidade de guarda | `api/_lib/retention.ts`: 5 anos (Res. CFP 001/2009) e regra estendida para menores (maioridade + 10 anos). Calculado no encerramento. **Nada é apagado automaticamente** — descarte de prontuário é ato deliberado. |
| 6 | Senha temporária em `alert()`, escolhida no navegador | Gerada **no servidor**, exibida uma vez em modal, com **troca obrigatória** no primeiro acesso (tela bloqueante). Trocar a própria senha agora **exige a senha atual**. |
| 7 | Sessão de 12h sem timeout | **30 min de inatividade** (deslizante) + teto de 12h; `SameSite=Strict`; aviso na tela antes de encerrar. |
| 8 | Sem rate limiting no login | 8 tentativas / 15 min por IP+e-mail, com bloqueio temporário e mensagem idêntica para e-mail inexistente e senha errada. |
| 9 | `ClientProfile` com hooks após `return` | Hooks reordenados ali e também em `MySettings` (mesmo defeito, não detectado antes). |

**Extras encontrados no caminho:** removi `src/lib/seed.ts` (dados fictícios iam no bundle do navegador); removi a segunda porta de criação de usuário em Configurações; adicionei CSP e cabeçalhos de segurança no `vercel.json`; e o service worker **nunca cacheia `/api/*`** (cachear resposta de API deixaria prontuário em claro no disco do aparelho).

---

## 4. SOBRE "NADA ACESSÍVEL POR INSPECIONAR ELEMENTO"

Preciso ser direto, porque a diferença importa para a sua conformidade:

**O que dá para garantir — e está feito:** a API não *envia* o que o perfil não pode ver. Anotação privada não vai para o Supervisor. Prontuário não vai para o Administrativo. Não há dado em `localStorage`, não há mock no bundle, não há cache de API no dispositivo, e a resposta da API não é cacheável por proxy.

**O que nenhum sistema consegue:** o que a tela legitimamente exibe é sempre legível no DevTools. Se o psicólogo pode ver o prontuário na tela, ele pode vê-lo no inspetor — vale para qualquer sistema do mundo, inclusive bancos.

**A proteção real é não enviar. É isso que está implementado.**

---

## 5. VERIFICAÇÕES EXECUTADAS

```
npm run typecheck       → OK (front-end, 0 erros)
npm run typecheck:api   → OK (API, 0 erros)
npx vite build          → OK (build de produção completo)
npm run verificar       → 19/19 testes, em TZ=UTC e TZ=America/Sao_Paulo
```

**O que NÃO pude executar neste ambiente** (rede restrita ao `binaries.prisma.sh`), e você precisa rodar:

```bash
npx prisma@6 validate     # valida o schema
npm run postinstall     # gera o client
npm run migration -- --name init
npm run db:seed
npm run dev             # + npm run dev:api em outro terminal
```

O schema foi escrito com cuidado, mas **não foi validado pelo parser do Prisma nem aplicado a um banco real**. Teste local antes de publicar.

---

## 6. PONTOS QUE QUERO SUBMETER A VOCÊ

1. **Guarda de menores:** adotei maioridade + 10 anos (prescrição civil, art. 205 CC), conforme o Manual Orientativo do CFP. Vale confirmar com o CRP-12 — a constante está isolada em `retention.ts`.
2. **Administrativo vê "pedido de ajuda" e "medicações em uso"** no cadastro. São dados de saúde. Mantive porque a triagem da fila de espera depende deles, mas é uma decisão sua, não técnica.
3. **Supervisor lê todos os prontuários** (supervisão clínica). Correto para supervisão; se o setor preferir restringir a casos sob supervisão formal, é ajustável.
4. **Bundle de 3,7 MB** num único arquivo. Não mexi (fora do escopo), mas `pdfmake` e o calendário pesam bastante e poderiam ser carregados sob demanda.
5. **Chave de criptografia única, sem rotação.** Hoje, trocá-la inutiliza os dados. Uma rotação versionada seria o próximo passo de maturidade.

---

## 7. IMPORTAÇÃO DE PLANILHAS DE FILA DE ESPERA

Construída a partir da análise dos arquivos reais do setor (3 arquivos, 17 abas).

### Escopo definido
Importar apenas: `Lista Geral 2026`, `Lista Geral 2025.`, `Espera Geral` e
`Lista Geral - Estagiarios`. As abas de organização de atendimentos, prontuário
e triagem de risco ficam de fora.

**233 linhas → 155 pessoas distintas → 53 sinalizadas para revisão.**

### Armadilhas dos arquivos reais, todas tratadas
| Problema encontrado | Tratamento |
|---|---|
| Telefone gravado **como data** (`48999216836`) | Leitura em bruto; o tipo é decidido pelo campo de destino, não pelo que o Excel acha que a célula é |
| Matrícula como decimal (`13230.0`) | Convertida para `13230` |
| Hora como fração de dia (`0.4166`) | Convertida para `10:00` |
| Cabeçalho na **linha 2** (`Espera Geral`) | Usuário escolhe a linha do cabeçalho |
| Coluna sem título (`Matutino`) | Nomeada pela letra, continua mapeável |
| Colunas deslocadas (telefone em "Programa"; setor em "Matrícula") | Detectado e marcado para revisão |
| `Dependente` na coluna Matrícula | Convertido para o campo Tipo de dependência |
| Turno em texto livre (12 variações) | Importado como está, marcado para revisão |

### Como funciona
Arquivo → escolher aba → escolher linha do cabeçalho → **conferir de onde vem
cada campo** (com correção manual) → pré-visualizar → importar.

- **Nomes, setor e contato de emergência em CAIXA ALTA**
- **Diagnóstico/CID** em campo próprio criptografado (dado de saúde, LGPD Art. 5º, II)
- **Ramal** e **Data de ingresso na ALESC**: campos novos
- E-mail, plano de saúde, acompanhamento profissional, terapia regular e
  interesse em grupo → concatenados em Observações, rotulados
- Agendamento que constava na planilha → preservado em Observações
  (*"Consta agendamento anterior... redistribuir manualmente"*), sem migrar
  para a agenda: todos entram como **Fila de Espera sem psicólogo atribuído**

### Revisão pós-importação
Nenhuma linha com nome é descartada, e nada duvidoso entra em silêncio.
O que precisa de conferência é marcado (`needsReview` + motivo) e aparece:
- numa **faixa laranja** no topo da Fila de Espera, com filtro "ver só estes";
- com selo **REVISAR** no cartão do paciente;
- numa faixa dentro da ficha, com o motivo exato e botão "Marcar como revisado".

Motivos automáticos: duplicata de matrícula ou nome, telefone ausente/inválido,
telefone em campo de texto (coluna deslocada), matrícula sem dígito, turno fora
do padrão, data não reconhecida, nome com um só termo.

### Desfazer
Cada importação recebe um `importBatchId`. A rota
`DELETE /api/clients/import/:batchId` remove o lote inteiro — **exceto** se
algum paciente já tiver prontuário registrado, caso em que a operação é
recusada (apagar destruiria registro clínico).

---

## 8. NUMERAÇÃO DE PRONTUÁRIO E FLEXÃO DE TÍTULO

### Numeração de prontuário — dois defeitos corrigidos

**Regra do setor:** quem está na fila de espera **não tem prontuário aberto**,
logo não tem número. O número nasce quando o caso passa a ser atendido
(Triagem, Triado, Em Atendimento ou Finalizado).

| Defeito | Antes | Agora |
|---|---|---|
| Importação | gravava o texto `"Pendente"` no campo | campo fica **nulo** |
| Cadastro manual | `clients.length + 1` **no navegador** | gerado no **servidor**, em sequência |

O cálculo no navegador quebrava de três formas: duas pessoas cadastrando ao
mesmo tempo recebiam o mesmo número; apagar um paciente fazia o próximo repetir
um número já usado; e um psicólogo, que só enxerga os próprios pacientes,
geraria um número baixíssimo, colidindo com prontuário antigo.

A geração agora acontece numa **única instrução SQL** (`assignProtocolNumber`),
em que cálculo e gravação são atômicos — dois pedidos simultâneos não podem
receber o mesmo número. A cláusula `WHERE "protocolNumber" IS NULL` torna a
operação idempotente.

**Formato:** zeros à esquerda até 3 dígitos (`001`), crescendo naturalmente
depois do 999 (`1000`). Sequência **contínua**, sem reiniciar a cada ano,
partindo do maior número já existente no banco — assim continua de onde a
numeração histórica do setor parou.

**Limpeza:** `POST /api/manutencao/limpar-prontuarios-da-fila` remove o número
de quem ainda está em fila de espera (só desses; quem é atendido mantém).

### Flexão de gênero no título profissional

Documentos psicológicos são assinados com título e CRP (Resolução CFP
nº 06/2019). Um atestado que diz "Psicólogo Maria Silva" identifica errado quem
o emitiu.

Foi criado o campo `gender` no usuário, com três opções — **Feminino**,
**Masculino** e **Prefiro não informar**. Ninguém é obrigado a declarar gênero:
sem informar, os documentos usam a forma neutra.

| Papel | Feminino | Masculino | Não informado |
|---|---|---|---|
| Psicólogo | Psicóloga | Psicólogo | Psicólogo(a) |
| Supervisor | Supervisora | Supervisor | Supervisor(a) |
| Administrativo | Administrativa | Administrativo | Administrativo(a) |

Cada pessoa escolhe em **Minhas Configurações**, com prévia de como a
assinatura vai sair. O Supervisor assina os documentos como **psicólogo**, não
como supervisor: quem responde pelo documento é o profissional inscrito no CRP;
"Supervisora" é função interna, não título profissional.

### ⚠️ Achado que precisa de decisão

`pdfAnamneseRisco.ts` e `pdfProntuario.ts` têm **nome e CRP de supervisor fixos
no código** (`Rafael da Costa Faria — CRP-SC 25613`). Todo documento sai
assinado com essa pessoa, independentemente de quem supervisiona o caso.

Se ela sair do setor, ou se outro profissional assumir a supervisão, os
documentos continuarão saindo com a assinatura errada — atribuindo a um
profissional a responsabilidade por um ato que não foi dele. Marquei o trecho
com um aviso no código, mas a correção depende de definir **como escolher o
supervisor de cada documento**.
