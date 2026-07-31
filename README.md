# Setor de Psicologia ALESC - PWA — Guia de Instalação e Deploy

> 📌 **Já tem o sistema publicado e quer aplicar as alterações mais recentes?**
> Vá direto para **[COMO-PUBLICAR.md](./COMO-PUBLICAR.md)** — passo a passo detalhado.
>
> Este README descreve a instalação do zero.

## O que mudou em relação ao app original do AI Studio

O app que você gerou no Google AI Studio era **só a tela** (front-end): tudo era
salvo no navegador (`localStorage`), sem banco de dados, sem senha criptografada,
e existia um botão que deixava qualquer pessoa "virar" qualquer usuário sem senha.

Isso foi reescrito para ter:

- **Banco de dados real** (Postgres, hospedado no Neon).
- **Login de verdade**: senha com hash (bcrypt), sessão via cookie `httpOnly`.
- **Criptografia dos dados sensíveis** (nome, whatsapp, data de nascimento,
  contato de emergência, anotações de prontuário, resultados de testes).
- **Controle de acesso por papel**: Psicólogo só vê os próprios pacientes;
  Supervisor e Administrativo veem tudo.
- O antigo seletor "Modo Teste — Alternar Usuário" foi **removido**.
- **Trilha de auditoria** de tudo que muda num caso, com sigilo do conteúdo
  clínico preservado (o log registra que houve registro, nunca o que foi escrito).
- **Estrutura do banco versionada** (migrations): cada mudança fica registrada
  com data e histórico, em vez de ser aplicada em silêncio na produção.

> ⚠️ **Mudança importante em relação à versão anterior deste guia:** a estrutura
> do banco não é mais criada automaticamente a cada publicação. O primeiro
> arquivo de migration precisa ser gerado **uma única vez** — o que exige um
> terminal (usamos o GitHub Codespaces, que roda no navegador, sem instalar
> nada). Depois disso, tudo volta a ser feito pelo navegador.
> Ver **[COMO-PUBLICAR.md](./COMO-PUBLICAR.md)**.

> **Sobre segurança**: nenhum sistema garante 100% de proteção contra qualquer
> acesso indevido. O que este setup faz é aplicar as práticas corretas (senha
> com hash, dados sensíveis criptografados, HTTPS obrigatório, banco nunca
> exposto publicamente, controle de acesso por papel). Conformidade formal com
> a LGPD também exige um responsável pelo tratamento de dados, política de
> privacidade e base legal — isso é um passo jurídico que este guia não cobre.

---

## Passo 1 — Neon (criar o banco de dados)

1. Acesse https://console.neon.tech e crie um novo projeto. Região sugerida:
   `sa-east-1` (São Paulo) ou a mais próxima da clínica.
2. Vá em **Connection Details / Connection string** e selecione a versão
   **Pooled connection** (o endereço tem "-pooler" no meio, ex:
   `ep-xxxx-pooler.sa-east-1.aws.neon.tech`).
3. Copie a string inteira, algo como:
   ```
   postgresql://usuario:senha@ep-xxxx-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require
   ```
   Guarde — é o valor de `DATABASE_URL`.
4. **Agora desmarque a opção "Connection pooling"** e copie a segunda string,
   idêntica mas **sem** o `-pooler` no endereço. Guarde — é o valor de
   `DIRECT_URL`.

   > Por que duas? A aplicação usa a versão *pooled* (necessária em ambiente
   > serverless, onde cada requisição abre uma conexão). Já as migrations do
   > Prisma **não funcionam** através do pooler do Neon, que é um PgBouncer em
   > modo transação — elas precisam da conexão direta.

---

## Passo 2 — Gerar as duas chaves de segurança (sem terminal)

Você precisa de duas strings longas e aleatórias — **não precisam ter formato
especial**, qualquer senha longa e aleatória serve. Gere duas (diferentes entre
si) usando o gerador de senha de qualquer gerenciador de senhas que você já
tenha (1Password, Bitwarden, o próprio Chrome/Safari sugerindo "senha forte",
etc.), ou qualquer gerador de senha online de confiança. Peça por volta de
**40 caracteres**, com letras, números e símbolos.

Guarde as duas em um lugar seguro:
- Uma vai ser o `JWT_SECRET`.
- A outra vai ser o `ENCRYPTION_KEY` (**esta é especialmente importante: se for
  perdida ou trocada depois, os dados já criptografados no banco não podem mais
  ser lidos**).

---

## Passo 3 — Subir o código para o GitHub (sem git, direto no navegador)

1. No GitHub, clique em **New repository**, dê um nome (ex: `clinica-inteligente`),
   marque como **Private**, e clique em **Create repository**. Não marque para
   criar README/gitignore automático.
2. Na página do repositório recém-criado, clique no link **"uploading an existing file"**.
3. No seu computador, extraia o `.zip` do projeto em uma pasta.
4. **Importante:** antes de arrastar, confirme que seu explorador de arquivos está
   mostrando arquivos ocultos (arquivos que começam com ponto, como `.gitignore` e
   `.npmrc`):
   - Windows (Explorador de Arquivos): guia **Exibir** → marque **Itens ocultos**.
   - Mac (Finder): com o Finder aberto, pressione `Cmd + Shift + .` (ponto).
5. Selecione **todos** os arquivos e pastas de dentro da pasta extraída (não a
   pasta em si, o conteúdo dela) e arraste para a área de upload do GitHub.
6. Espere o upload terminar, escreva uma mensagem tipo "Versão inicial" no campo
   de commit, e clique em **Commit changes**.

> Se algum arquivo com ponto (`.gitignore`, `.npmrc`, `.env.example`) não for
> enviado pelo arrasto, não tem problema grave — exceto o `.gitignore`. Se ele
> faltar, clique em **Add file → Create new file**, nomeie exatamente `.gitignore`
> e cole este conteúdo:
> ```
> node_modules/
> build/
> dist/
> coverage/
> .DS_Store
> *.log
> .env*
> !.env.example
> ```

---

## Passo 4 — Publicar na Vercel

1. Na Vercel, clique em **Add New → Project** e escolha o repositório que você
   acabou de criar.
2. A Vercel detecta sozinha que é um projeto **Vite** — não precisa mudar
   Build Command nem Output Directory.
3. Antes de clicar em "Deploy", abra **Environment Variables** e adicione, uma
   por uma. Para cada uma, clique para expandir as opções e **ative o toggle
   "Sensitive"** antes de salvar — isso faz o valor virar ilegível na tela do
   painel depois de salvo (só dá pra trocar o valor depois, nunca mais
   visualizar o que já foi salvo), mesmo para quem tiver acesso ao seu projeto
   na Vercel:
   - `DATABASE_URL` → a string **pooled** do Neon (Passo 1)
   - `DIRECT_URL` → a string **direta** do Neon, sem `-pooler` (Passo 1)
   - `JWT_SECRET` → a primeira senha longa gerada (Passo 2)
   - `ENCRYPTION_KEY` → a segunda senha longa gerada (Passo 2)

   > Sem marcar "Sensitive", qualquer pessoa com acesso ao painel deste projeto
   > na Vercel consegue ver essas 3 chaves em texto puro. Com "Sensitive"
   > ativado, elas ficam protegidas mesmo de quem acessa o painel — só o
   > processo de build/execução consegue usá-las. Uma limitação que nenhuma
   > ferramenta resolve sozinha: quem tem permissão para **fazer deploy do
   > código** sempre poderia, em teoria, escrever um trecho de código que exiba
   > essas chaves de propósito (isso vale para qualquer sistema, não é uma
   > falha específica daqui). Por isso, mantenha o número de pessoas com acesso
   > de administrador ao GitHub e à Vercel deste projeto o menor possível — são
   > elas que, na prática, têm acesso de confiança máxima aos dados da clínica.
4. Clique em **Deploy**.

Durante o build, a Vercel automaticamente:
- instala as dependências,
- **aplica as migrations pendentes** no banco do Neon (`prisma migrate deploy`),
- e então publica o site.

> O build **não cria mais usuários nem pacientes de exemplo**. Semear um banco
> de prontuários a cada publicação é arriscado: reintroduz usuários de teste e
> produz efeitos colaterais em produção. A criação dos usuários iniciais é um
> ato deliberado, feito uma vez (ver COMO-PUBLICAR.md, passo 2.7).

Ao final, você recebe uma URL (`https://seu-projeto.vercel.app`). Faça login
com um dos usuários criados pelo seed:

| E-mail | Papel |
|---|---|
| `roberto@clinica.com` | Supervisor (com CRP — atende pacientes) |
| `ana@clinica.com` | Administrativo (sem acesso a conteúdo clínico) |
| `carolina@clinica.com` | Psicólogo |
| `joao@clinica.com` | Psicólogo |

A senha provisória é exibida no terminal ao rodar o seed. **No primeiro acesso,
o sistema obriga cada pessoa a trocá-la** antes de liberar qualquer tela.

---

## Passo 5 — Depois do primeiro acesso (faça isso já no primeiro dia)

1. Entre com o usuário Supervisor → **Gerenciar Usuários** → apague os usuários
   de demonstração que não for usar e crie os reais da sua equipe. Ao criar um
   usuário, o sistema gera uma senha provisória e a exibe **uma única vez** —
   anote e repasse por um canal seguro.
2. Cada pessoa troca a própria senha em **Minhas Configurações** (é exigida a
   senha atual). Enquanto a senha provisória não for trocada, o usuário não
   consegue registrar nada no sistema.
3. **Supervisores precisam ter CRP cadastrado** — o perfil passou a atender
   pacientes e a assinar documentos.
3. Apague os 2 pacientes de exemplo (`PROTO-0001` / `PROTO-0002`), se não
   precisar deles.

---

## Quando você quiser alterar algo no futuro

Sempre que quiser mudar algo simples (texto, cor, um campo), você pode editar o
arquivo direto na tela do GitHub (abra o arquivo → ícone de lápis "Edit" →
salve com "Commit changes"). A Vercel detecta o novo commit e publica sozinha
de novo, alguns minutos depois — sem precisar reinstalar nada.

> **Atenção**: mudanças no arquivo `prisma/schema.prisma` (estrutura do banco)
> são a **única** exceção a esse fluxo. Elas exigem gerar uma migration nova
> pelo Codespaces — ver a seção final de **[COMO-PUBLICAR.md](./COMO-PUBLICAR.md)**.
> Editar o schema direto no GitHub **não** altera o banco: o build vai apenas
> aplicar as migrations já existentes, e o schema editado ficará dessincronizado.

---

## Resumo de segurança do que foi implementado

| Item | Como é tratado |
|---|---|
| Senhas de usuários | Hash com bcrypt (nunca texto puro, nunca enviado à tela) |
| Sessão de login | Cookie `httpOnly` + `Secure` + assinado (JWT) |
| Nome, whatsapp, data de nascimento, contato de emergência do paciente | Criptografados (AES-256-GCM) |
| Anotações de prontuário (individuais e de grupo) | Criptografadas (AES-256-GCM) |
| Resultados de testes/instrumentos aplicados | Criptografados (AES-256-GCM) |
| Acesso ao banco de dados | Só a API do backend acessa o Neon; nunca exposto à internet/navegador |
| Controle por papel | Psicólogo só acessa pacientes atribuídos a ele; Supervisor/Administrativo acessam tudo |
| Transporte de dados | HTTPS obrigatório (Vercel força isso automaticamente) |

Nenhuma dessas medidas constitui uma "garantia absoluta" — isso é tecnicamente
impossível para qualquer sistema. Elas reduzem significativamente o risco e
seguem práticas reconhecidas de mercado para dados sensíveis de saúde.

**Um ponto que vale reforçar com a equipe**: o cookie de sessão é protegido contra
scripts maliciosos na página (`httpOnly`), mas se alguém tiver acesso físico (ou
remoto) a um computador com a sessão de outra pessoa ainda aberta, essa pessoa
consegue ver esse cookie pelo F12 e, em teoria, usá-lo enquanto ele for válido.
A janela agora é bem menor: a sessão expira após **30 minutos de inatividade**
(com teto de 12h por login), e a tela se desconecta sozinha, avisando antes.
Isso vale para praticamente qualquer site com login do mundo — o hábito que
neutraliza o risco continua sendo clicar em **Sair** ao terminar, especialmente
em computador compartilhado.

---

## Se quiser testar no seu computador antes de publicar (opcional)

Isso **não é necessário** para publicar (o Passo 4 já cuida de tudo), mas se
quiser testar localmente: instale o [Node.js](https://nodejs.org) (LTS), copie
`.env.example` para `.env` preenchendo os valores, rode `npm install`,
depois `npm run migration --` e `npm run db:seed` uma vez, e por fim, em dois
terminais: `npm run dev:api` e `npm run dev`.

Comandos úteis de verificação:

```bash
npm run typecheck      # checagem de tipos do front-end
npm run typecheck:api  # checagem de tipos da API
npm run verificar      # testes das regras de data, guarda documental e sigilo do log
```
