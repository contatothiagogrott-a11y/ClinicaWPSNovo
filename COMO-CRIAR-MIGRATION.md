# Como criar uma migration (mudança no banco)

> Use este roteiro **toda vez** que uma alteração mexer na estrutura do banco.
> Sempre que eu entregar uma versão que precise disso, vou avisar e indicar o
> nome a usar.

---

## ⚠️ A regra número 1: nunca use `npx prisma`

Se o Prisma não estiver instalado na pasta, o `npx` **baixa a versão mais nova
da internet sem avisar** — hoje a 7, enquanto o projeto usa a 6. A versão 7
mudou onde a conexão do banco é declarada, e o erro que aparece é este:

```
Error code: P1012
The datasource property `url` is no longer supported in schema files.
```

Ele não tem nada a ver com o seu banco nem com o seu código. É só versão errada.

**Use sempre `npm run`**, que obriga o uso da versão instalada no projeto:

| ❌ Não use | ✅ Use |
|---|---|
| `npx prisma migrate dev` | `npm run migration -- --name algum_nome` |
| `npx prisma generate` | `npm run postinstall` |
| `npx prisma studio` | `npm run db:studio` |
| `npx prisma db seed` | `npm run db:seed` |

---

## Os 6 passos

### 1. Abrir o Codespace

Repositório no GitHub → botão verde `< > Code` → aba **Codespaces** →
**Create codespace on main** (ou abrir um já existente).

### 2. Trazer o código mais recente

```bash
git pull
```

> Se você acabou de subir arquivos novos pelo GitHub, este passo é
> **obrigatório** — sem ele, o Codespace continua com o código antigo e o
> Prisma não encontra nada para migrar.

### 3. Instalar as dependências

```bash
npm install
```

**Não pule este passo.** É ele que coloca o Prisma 6 na pasta e impede o `npx`
de baixar a versão errada. Demora 1 a 2 minutos. Avisos amarelos (`warn`) são
normais; preocupe-se só com `error` em vermelho.

### 4. Conferir se o `.env` está preenchido

```bash
grep -E "^(DATABASE_URL|DIRECT_URL)" .env | sed -E 's|://[^@]*@|://USUARIO:SENHA@|'
```

Devem aparecer duas linhas começando com `postgresql://` — uma **com**
`-pooler` e outra **sem**. Se aparecer `[SENSITIVE]` ou nada, preencha o `.env`
à mão com as strings do Neon (as variáveis marcadas como *Sensitive* na Vercel
não podem ser baixadas pela CLI).

### 5. Criar a migration

```bash
npm run migration -- --name NOME_DA_MUDANCA
```

Repare nos **dois traços** antes de `--name`. Eles são obrigatórios: é o que
diz ao npm para repassar o parâmetro ao Prisma em vez de consumi-lo.

Use nomes curtos, em minúsculas, com sublinhado no lugar de espaço.
Exemplos: `notificacoes_push`, `prontuario_opcional_e_genero`.

Confirme que a pasta foi criada:

```bash
ls prisma/migrations
```

### 6. Enviar para o GitHub

No menu de controle de versão (ícone de bifurcação, lateral esquerda):

1. Confira a lista de arquivos — deve aparecer **`prisma/migrations/`**
2. **Confirme que o `.env` NÃO está na lista**
3. Escreva a mensagem (pode ser o mesmo nome da migration)
4. **Commit** → **Sync Changes**

A Vercel republica sozinha em alguns minutos, aplicando a migration em produção.

---

## Depois: apagar o Codespace

https://github.com/codespaces → três pontinhos (**...**) → **Delete**

O Codespace tem um `.env` com a conexão do banco. Terminou o trabalho, apaga.

---

## Se der erro

| Mensagem | Causa | Solução |
|---|---|---|
| `The datasource property url is no longer supported` | `npx` baixou o Prisma 7 | Passo 3 (`npm install`) e use `npm run migration` |
| `P1013: database string is invalid` | `.env` vazio ou com `[SENSITIVE]` | Passo 4 |
| `Environment variable not found: DIRECT_URL` | Falta a variável no `.env` | Passo 4 |
| `Drift detected` | O banco não bate com o histórico de migrations | Ver abaixo |
| Nada para commitar | O código novo não chegou ao Codespace | Passo 2 (`git pull`) |
| `prepared statement already exists` | Migration rodando pela conexão *pooled* | A `DIRECT_URL` está com `-pooler`; use a versão sem |

### Sobre o "Drift detected"

Significa que o banco tem uma estrutura diferente da que o histórico de
migrations descreve. Acontece quando alguém alterou o banco por fora.

O Prisma vai propor **resetar** (apagar tudo). Isso só é aceitável se o banco
tiver apenas dados de teste. Se houver **paciente real cadastrado, PARE** e me
chame antes de confirmar.

Se for seguro resetar, use a flag que não depende do teclado — o prompt
interativo às vezes não captura a resposta no terminal do Codespace:

```bash
npx prisma migrate reset --force --skip-seed
npm run migration -- --name init
npm run db:seed
```

---

## Resumo para copiar e colar

```bash
git pull
npm install
npm run migration -- --name NOME_DA_MUDANCA
```

Depois: commit + push pelo menu lateral, e apagar o Codespace.
