# Como publicar as alterações — passo a passo

> **Para quem é este guia:** você, que já tem o projeto no GitHub, publicado na Vercel, com banco no Neon — e que faz tudo pelo navegador, sem instalar nada no computador.

Leia inteiro antes de começar. São **3 partes**. A Parte 2 você faz **uma única vez na vida**; depois disso, volta a ser tudo pelo navegador como sempre foi.

⏱️ Tempo estimado: **30 a 40 minutos**, com calma.

---

## Por que existe uma etapa nova agora?

Antes, o banco de dados era atualizado com um comando (`prisma db push`) que **alterava a estrutura direto na produção** a cada publicação, sem registro nenhum. Funcionava, mas tinha dois problemas: se uma alteração desse errado, não havia como saber o que mudou nem voltar atrás; e numa auditoria não existe resposta para "quando esta coluna passou a existir?".

Agora o sistema usa **migrations**: cada mudança de estrutura vira um arquivo com data e nome, guardado no GitHub. É o histórico do banco.

O preço disso é o assunto da Parte 2: o **primeiro** arquivo de migration precisa ser criado uma vez, e isso exige um terminal. Vamos usar um terminal que roda **dentro do navegador**, sem instalar nada.

---

# PARTE 1 — Pegar a segunda string de conexão do Neon

O Neon oferece dois endereços para o mesmo banco:

| Tipo | Como reconhecer | Para que serve |
|---|---|---|
| **Pooled** | tem `-pooler` no endereço | o dia a dia do sistema (você já usa) |
| **Direta** | **sem** `-pooler` | apenas as migrations |

As migrations **não funcionam** pelo endereço pooled — é uma limitação conhecida do Neon com o Prisma. Por isso precisamos dos dois.

### O que fazer

1. Entre em https://console.neon.tech e abra o seu projeto.
2. Procure **Connection string** (fica no painel principal, "Connection Details").
3. Você verá uma caixa de seleção ou botão chamado **"Connection pooling"** (em alguns layouts aparece como "Pooled connection").
   - **Com** essa opção ligada → é a string que você já usa (`DATABASE_URL`).
   - **Desligue** essa opção → aparece a string **direta**. É essa que queremos agora.
4. Copie a string direta. Ela é quase idêntica à outra, só **sem** o `-pooler`:

   ```
   Pooled:  postgresql://user:senha@ep-cool-name-123456-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require
   Direta:  postgresql://user:senha@ep-cool-name-123456.sa-east-1.aws.neon.tech/neondb?sslmode=require
                                                      ↑ sem "-pooler"
   ```

5. Guarde num bloco de notas por enquanto.

### Cadastrar na Vercel

6. Vá em **Vercel → seu projeto → Settings → Environment Variables**.
7. Clique em **Add New** e preencha:
   - **Key:** `DIRECT_URL`
   - **Value:** a string direta que você acabou de copiar
   - **Environments:** marque **os três** (Production, Preview, Development)
   - ✅ **Ative o toggle "Sensitive"** antes de salvar (mesma prática das outras chaves)
8. Salve.

> ✅ **Confira antes de seguir:** você deve ter agora **4** variáveis na Vercel — `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`.

---

# PARTE 2 — Criar o primeiro arquivo de migration (uma única vez)

Vamos usar o **GitHub Codespaces**: um editor de código com terminal que abre **dentro do navegador**, numa máquina temporária na nuvem do GitHub. Nada é instalado no seu computador.

> 💰 **Custo:** contas gratuitas do GitHub incluem cerca de 60 horas por mês de Codespaces. Vamos usar uns 15 minutos. Ao final, você **apaga** a máquina (passo 2.9) — isso é importante e explico por quê.

### 2.1 — Subir o código novo para o GitHub

Antes de tudo, envie os arquivos alterados (o ZIP que eu entreguei) para o seu repositório, do mesmo jeito que você já fez antes: **Add file → Upload files**, arrastando o conteúdo da pasta.

> ⚠️ **Atenção especial:** existe agora um arquivo chamado **`.gitignore`** (começa com ponto). Ele é essencial — é o que impede que senhas sejam enviadas ao GitHub por engano.
>
> Arquivos que começam com ponto costumam ficar **invisíveis** no seu computador. Para vê-los:
> - **Windows** (Explorador de Arquivos): aba **Exibir** → marque **Itens ocultos**
> - **Mac** (Finder): pressione `Cmd + Shift + .` (ponto)
>
> Se mesmo assim ele não subir, crie manualmente: **Add file → Create new file**, nomeie exatamente `.gitignore` e cole o conteúdo do arquivo que veio no ZIP.

### 2.2 — Abrir o Codespace

1. Na página principal do seu repositório no GitHub, clique no botão verde **`< > Code`**.
2. Escolha a aba **Codespaces**.
3. Clique em **Create codespace on main**.
4. Aguarde 1 a 2 minutos. Vai abrir um editor parecido com o VS Code, dentro do navegador.
5. Na parte de baixo da tela há um **terminal** (uma área preta onde se digita). Se não estiver visível: menu **☰** (canto superior esquerdo) → **Terminal** → **New Terminal**.

Daqui em diante, você vai **digitar comandos e apertar Enter**. Um de cada vez, esperando cada um terminar.

### 2.3 — Instalar as dependências do projeto

```bash
npm install
```

Demora 1 a 2 minutos. É normal aparecerem avisos amarelos (`warn`) — só se preocupe com `error` em vermelho.

### 2.4 — Conectar-se à Vercel para buscar as senhas

Aqui está a parte elegante: em vez de você copiar e colar senhas manualmente (arriscado e sujeito a erro de digitação), vamos **baixá-las direto da Vercel**.

```bash
npm install -g vercel
```

```bash
vercel login
```

Isso mostra um link e um código. Clique no link, confirme na sua conta Vercel, e volte para a aba do Codespace. O terminal reconhece sozinho.

```bash
vercel link
```

Ele fará algumas perguntas:
- *"Set up ... ?"* → responda **`y`** (sim)
- *"Which scope?"* → escolha sua conta (setas ↑↓ e Enter)
- *"Link to existing project?"* → **`y`** (sim)
- *"What's the name of your existing project?"* → digite o nome do projeto na Vercel

### 2.5 — Baixar as variáveis de ambiente

```bash
vercel env pull .env --environment=production
```

Isso cria um arquivo `.env` dentro do Codespace com as 4 variáveis — incluindo a `DIRECT_URL` que você cadastrou na Parte 1.

> 🔒 **Este arquivo contém as credenciais reais do banco.** Ele fica **só** dentro desta máquina temporária. O `.gitignore` garante que ele nunca seja enviado ao GitHub. Por isso o passo 2.9 (apagar o Codespace) importa.

Confira se deu certo:

```bash
grep -c DIRECT_URL .env
```

Deve responder **`1`**. Se responder `0`, a variável não foi cadastrada na Vercel — volte à Parte 1.

### 2.6 — Criar a migration

Este é o comando principal de toda a operação:

```bash
npx prisma migrate dev --name init
```

O que ele faz: lê a estrutura descrita em `prisma/schema.prisma`, compara com o banco no Neon, e **cria a pasta `prisma/migrations/`** com o histórico inicial.

Ele vai avisar que precisa **recriar o banco do zero** e pedir confirmação. Como você tem **apenas dados de teste**, pode confirmar (**`y`**).

> ⚠️ Se em algum momento futuro houver dados reais de pacientes, **pare aqui** e me chame antes.

### 2.7 — Criar os usuários iniciais

```bash
npm run db:seed
```

Isso cria os 4 usuários de acesso. **Anote a senha provisória que aparecer na tela** — cada pessoa será obrigada a trocá-la no primeiro acesso.

> Pacientes de exemplo **não** são mais criados automaticamente (semear paciente fictício num banco de prontuários é má prática). Se quiser criá-los para testar, use: `SEED_DEMO_DATA=true npm run db:seed`

### 2.8 — Enviar a migration para o GitHub

No menu lateral esquerdo, clique no ícone de **controle de versão** (parece uma bifurcação de estradas, terceiro ícone). Você verá a lista de arquivos novos.

1. Confira a lista: deve aparecer **`prisma/migrations/`** e possivelmente `.vercel`.
2. **Confirme que `.env` NÃO está na lista.** Se estiver, pare e me avise — significa que o `.gitignore` não subiu corretamente.
3. Escreva uma mensagem na caixa de texto: `baseline do banco`
4. Clique em **Commit** e depois em **Sync Changes** (ou **Push**).

A Vercel detecta o novo commit e republica sozinha em alguns minutos.

### 2.9 — Apagar o Codespace ⚠️ *não pule esta etapa*

O Codespace tem, dentro dele, um arquivo `.env` com as credenciais reais do seu banco. Ele é seu e privado, mas não há motivo para mantê-lo existindo depois que o trabalho acabou — é superfície de risco desnecessária.

1. Volte para https://github.com/codespaces
2. Localize o Codespace deste projeto
3. Clique nos **três pontinhos (...)** → **Delete**

---

# PARTE 3 — Conferir se deu certo

1. Na Vercel, abra a aba **Deployments** e veja se o último build está **Ready** (verde).
   - Se estiver **Error** (vermelho), clique nele e leia as últimas linhas do log. Compare com a tabela de problemas abaixo.
2. Abra o site e faça login com um dos usuários criados.
3. O sistema deve **exigir a troca da senha** antes de liberar qualquer coisa. Isso é o comportamento esperado.
4. Testes rápidos que valem fazer:
   - A aba do navegador mostra **"Setor de Psicologia ALESC - PWA"**
   - Emitir um atestado e conferir se a **data está correta** (era o bug principal)
   - Como Psicólogo: o campo "Psicólogo Responsável" mostra **"Restrito"**, sem botão de transferir
   - Como Supervisor: aparece o botão **"Transferir"**, que exige justificativa
   - Escrever um prontuário e conferir se a **anotação privada** aparece no painel
   - Na aba **Histórico**, ver a trilha de auditoria

---

## Se algo der errado

| Mensagem no log | O que significa | Solução |
|---|---|---|
| `Environment variable not found: DIRECT_URL` | A variável não foi cadastrada na Vercel | Refaça a Parte 1 e marque os 3 ambientes |
| `prepared statement ... already exists` ou erro de *advisory lock* | Migration tentando rodar pela conexão **pooled** | A `DIRECT_URL` está com `-pooler` no endereço. Use a versão **sem** `-pooler` |
| `No migration found in prisma/migrations` | A pasta não foi enviada ao GitHub | Refaça o passo 2.8 |
| `Can't reach database server` | Banco pausado ou string errada | Abra o console do Neon (isso "acorda" o banco) e confira a string |
| O site abre mas ninguém consegue entrar | O seed não rodou | Refaça o passo 2.7 |

---

## E daqui pra frente?

**Voltou a ser tudo pelo navegador.** Para mudanças de texto, cor ou lógica: edite o arquivo direto no GitHub (ícone de lápis → *Commit changes*) e a Vercel publica sozinha.

A **única** situação que exige voltar ao Codespaces é **mudar a estrutura do banco** (editar `prisma/schema.prisma` — criar um campo novo, por exemplo). Nesse caso o roteiro é o mesmo, trocando o nome ao final:

```bash
npx prisma migrate dev --name descricao_da_mudanca
```

E isso é justamente o ponto: mudança de estrutura de banco **deve** ter uma etapa deliberada. Antes ela acontecia sozinha, em silêncio, direto na produção.
