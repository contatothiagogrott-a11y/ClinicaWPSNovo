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
   - **Environments:** marque **Production** e **Preview**
   - ✅ **Ative o toggle "Sensitive"** antes de salvar

   > ℹ️ A Vercel **não permite** marcar uma variável como *Sensitive* e, ao mesmo
   > tempo, habilitá-la em *Development* — são opções mutuamente exclusivas.
   > Isso é esperado e não é problema: o build de produção usa o ambiente
   > *Production*, que é o que importa aqui.
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

### 2.4 — Criar o arquivo `.env` dentro do Codespace

O Codespace precisa saber o endereço do banco. Vamos preencher isso à mão.

> 💡 **Por que não baixar as variáveis da Vercel automaticamente?**
> Porque variáveis marcadas como **Sensitive** são *write-only*: a Vercel as
> entrega ao build, mas **nunca as devolve** para leitura — nem para você, nem
> para a CLI. Se você tentar `vercel env pull`, o arquivo vem com o texto
> literal `[SENSITIVE]` no lugar do valor, e o Prisma responde com o erro
> `P1013: The provided database string is invalid`.
> Esse comportamento é proposital e é uma boa coisa: significa que suas chaves
> não podem ser extraídas do painel por ninguém.

1. No explorador de arquivos do Codespace (ícone de pastas, canto superior
   esquerdo), clique com o botão direito na área vazia → **New File**.
2. Nomeie exatamente **`.env`** (com o ponto na frente).
3. Cole o conteúdo abaixo, substituindo as duas primeiras linhas pelas strings
   que você copiou do Neon na Parte 1:

```
DATABASE_URL="cole_aqui_a_string_COM_pooler"
DIRECT_URL="cole_aqui_a_string_SEM_pooler"
JWT_SECRET="qualquer_texto_longo_serve_nesta_etapa_1234567890abcdefghij"
ENCRYPTION_KEY="idem_outro_texto_longo_qualquer_para_esta_etapa_9876543210"
```

4. Salve com `Ctrl+S` (ou `Cmd+S`).

> 🔑 **Sobre as duas últimas linhas:** nesta etapa você vai apenas **criar
> tabelas vazias e usuários**. Nada será criptografado agora, então essas duas
> chaves podem ser qualquer texto longo. As chaves **reais** permanecem só na
> Vercel — que é onde devem ficar. Assim você não precisa trazer as credenciais
> de produção para dentro do Codespace.

### 2.5 — Conferir se o arquivo ficou correto

```bash
grep -E "^(DATABASE_URL|DIRECT_URL)" .env | sed -E 's|://[^@]*@|://USUARIO:SENHA@|'
```

Este comando **mascara usuário e senha**, então a saída pode ser compartilhada
sem risco. Você deve ver duas linhas começando com `postgresql://` — uma
**com** `-pooler` e outra **sem**:

```
DATABASE_URL="postgresql://USUARIO:SENHA@ep-nome-123456-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://USUARIO:SENHA@ep-nome-123456.sa-east-1.aws.neon.tech/neondb?sslmode=require"
```

**Três detalhes que costumam derrubar esta etapa:**

- Se você copiou a string pela aba **psql** do Neon, ela vem como
  `psql 'postgresql://...'`. Apague o `psql ` e as aspas simples — o valor deve
  começar em `postgresql://`.
- Aspas duplas: **uma de cada lado**, nunca duas (`""postgresql://..."" `dá erro).
- A `DIRECT_URL` é idêntica à `DATABASE_URL`, apenas **sem** o `-pooler`.

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

O Codespace tem, dentro dele, um arquivo `.env` com a string de conexão do
banco. Seguindo o passo 2.4, ele **não** contém as chaves de criptografia de
produção — mas ainda dá acesso ao banco. Ele é seu e privado, e não há motivo
para mantê-lo existindo depois que o trabalho acabou.

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
| `P1013: The provided database string is invalid` | O `.env` está com `[SENSITIVE]` ou vazio no lugar da string | Refaça o passo 2.4 preenchendo à mão. Variáveis *Sensitive* da Vercel não podem ser baixadas pela CLI |
| `Environment variable not found: DIRECT_URL` | A variável não existe no `.env` (Codespace) ou na Vercel (build) | No Codespace, passo 2.4. Na Vercel, Parte 1 |
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
