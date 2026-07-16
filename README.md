# Clínica Inteligente — Guia de Instalação e Deploy (100% pelo navegador)

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
- **As tabelas do banco e os dados de demonstração são criados automaticamente
  a cada vez que a Vercel publica o site** — você não precisa instalar Node.js
  nem rodar nenhum comando no seu computador.

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
   - `DATABASE_URL` → a string do Neon (Passo 1)
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
- cria todas as tabelas no banco do Neon (`prisma db push`),
- cria 4 usuários de demonstração e 2 pacientes de exemplo (`prisma db seed`),
- e então publica o site.

Ao final, você recebe uma URL (`https://seu-projeto.vercel.app`). Abra e
faça login com um destes e-mails, senha `TrocarSenha!123`:

| E-mail | Papel |
|---|---|
| `roberto@clinica.com` | Supervisor |
| `ana@clinica.com` | Administrativo |
| `carolina@clinica.com` | Psicólogo |
| `joao@clinica.com` | Psicólogo |

---

## Passo 5 — Depois do primeiro acesso (faça isso já no primeiro dia)

1. Entre com o usuário Supervisor → **Gerenciar Usuários** → troque a senha de
   cada usuário de demonstração (ou apague os que não for usar e crie os reais
   da sua equipe — ao criar um usuário novo, o sistema mostra uma senha
   temporária na tela, anote e repasse com segurança).
2. Cada pessoa pode trocar a própria senha em **Minhas Configurações**.
3. Apague os 2 pacientes de exemplo (`PROTO-0001` / `PROTO-0002`), se não
   precisar deles.

---

## Quando você quiser alterar algo no futuro

Sempre que quiser mudar algo simples (texto, cor, um campo), você pode editar o
arquivo direto na tela do GitHub (abra o arquivo → ícone de lápis "Edit" →
salve com "Commit changes"). A Vercel detecta o novo commit e publica sozinha
de novo, alguns minutos depois — sem precisar reinstalar nada.

> **Atenção**: como a criação/atualização das tabelas do banco (`prisma db push`)
> roda automaticamente a cada publicação, uma mudança de estrutura malfeita no
> arquivo `prisma/schema.prisma` pode alterar o banco de produção direto, sem
> uma etapa extra de revisão. Isso é o preço de não precisar de terminal — em um
> time maior/mais formal, o ideal seria ter uma etapa de revisão antes de aplicar
> mudanças de banco em produção. Para o tamanho deste projeto, o trade-off é
> razoável, mas evite mexer em `prisma/schema.prisma` sem necessidade.

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
consegue ver esse cookie pelo F12 e, em teoria, usá-lo enquanto ele for válido
(expira em 12h, ou antes disso ao clicar em "Sair"). Isso vale para praticamente
qualquer site com login do mundo — o hábito simples que neutraliza isso é sempre
clicar em **Sair** ao terminar de usar, especialmente em computador compartilhado.

---

## Se quiser testar no seu computador antes de publicar (opcional)

Isso **não é necessário** para publicar (o Passo 4 já cuida de tudo), mas se
quiser testar localmente: instale o [Node.js](https://nodejs.org) (LTS), copie
`.env.example` para `.env` preenchendo os mesmos valores, rode `npm install`,
depois `npx prisma db push` e `npm run db:seed` uma vez, e por fim, em dois
terminais: `npm run dev:api` e `npm run dev`.
