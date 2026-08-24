# Como ativar as notificações no celular

> **Antes de começar:** enquanto você não terminar, o recurso fica desligado e
> **nada mais no sistema quebra**. Dá para parar no meio sem risco nenhum.
....
⏱️ Cerca de 25 minutos, sem pressa. São **5 partes** — faça na ordem.

---

## Antes de tudo: entenda a peça que falta

O sistema já sabe quem tem atendimento e a que horas. O que ele **não** tem é
um despertador: alguém precisa "acordar" o servidor de tempos em tempos e
perguntar *"tem atendimento chegando? então avisa"*.

A Vercel tem esse despertador, mas **no plano gratuito ele só toca uma vez por
dia** — não serve para lembrete por horário.

A solução é um despertador de fora, gratuito, tocando de 30 em 30 minutos.
É a Parte 4.

---

# PARTE 1 — Gerar as chaves de segurança

As notificações usam um par de chaves chamado **VAPID**. É o que prova ao
Google e à Apple que quem manda a notificação é o seu sistema, não um impostor.

Abra o **Codespace** (repositório no GitHub → botão verde `< > Code` → aba
**Codespaces**) e, no terminal, rode:

```bash
npx web-push generate-vapid-keys
```

Ele responde algo assim:

```
=======================================

Public Key:
BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkFbx4gpXYL5hFzPmT...

Private Key:
UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls

=======================================
```

**Copie as duas** para um bloco de notas. Você vai usá-las na Parte 2.

> A chave **privada** é secreta. Se vazar, alguém consegue enviar notificações
> falsas em nome do Setor de Psicologia. Trate como senha.

---

# PARTE 2 — Cadastrar as variáveis na Vercel

**Vercel → seu projeto → Settings → Environment Variables.**

São **6 variáveis**. Para cada uma: **Add New**, preencher, marcar os
ambientes, salvar.

### 1. `VAPID_PUBLIC_KEY`
- **Value:** a chave pública da Parte 1
- **Environments:** Production e Preview
- **Sensitive:** ✅ ligado

### 2. `VAPID_PRIVATE_KEY`
- **Value:** a chave privada da Parte 1
- **Environments:** Production e Preview
- **Sensitive:** ✅ ligado

### 3. `VAPID_SUBJECT`
- **Value:** `mailto:psicologia@alesc.sc.gov.br`
- **Environments:** Production e Preview
- **Sensitive:** ❌ desligado (não é segredo)

### 4. `CRON_SECRET`
- **Value:** um texto longo e aleatório (~40 caracteres). Use o gerador de
  senha do navegador.
- **Environments:** Production e Preview
- **Sensitive:** ✅ ligado
- **Guarde esse valor:** você vai colá-lo de novo na Parte 4.

### 5. `REMINDER_MINUTES_BEFORE`
- **Value:** `30`
- **Environments:** Production e Preview
- **Sensitive:** ❌ desligado

Significa: avisar com **no mínimo 30 minutos** de antecedência.

### 6. `CRON_INTERVAL_MINUTES`
- **Value:** `30`
- **Environments:** Production e Preview
- **Sensitive:** ❌ desligado

Significa: o despertador toca **de 30 em 30 minutos**. Este número **precisa
ser igual** ao que você configurar na Parte 4.

### Por fim: publicar de novo

Variáveis novas só valem num deploy novo. **Deployments** → abra o mais
recente → menu **⋯** → **Redeploy**.

---

# PARTE 3 — Aplicar a migration

Foram criadas duas coisas no banco: a tabela que guarda quais aparelhos recebem
notificação, e o controle que impede o mesmo aviso de sair duas vezes.

No terminal do **Codespace**:

```bash
npm run migration -- --name notificacoes_push
```

Depois, no menu de controle de versão (ícone de bifurcação, lateral esquerda):
escreva `notificacoes push`, clique **Commit** e depois **Sync Changes**.

> Confira que o `.env` **não** aparece na lista de arquivos do commit.

---

# PARTE 4 — Configurar o despertador externo

### 4.1 Criar a conta

Acesse **https://cron-job.org** e crie uma conta gratuita.

### 4.2 Primeiro job — lembrete de atendimento

Clique em **CREATE CRONJOB**:

| Campo | O que colocar |
|---|---|
| **Title** | `Lembretes de atendimento` |
| **URL** | `https://SEU-APP.vercel.app/api/cron/reminders` |
| **Execution schedule** | **Every 30 minutes** |

> Troque `SEU-APP` pelo endereço real do seu sistema na Vercel.

Role até **ADVANCED** e expanda:

1. **Request method:** mude de `GET` para **`POST`**
2. **Headers** → adicionar:
   - **Key / Name:** `Authorization`
   - **Value:** `Bearer ` seguido do seu `CRON_SECRET`

   Exemplo, se o segredo for `abc123xyz`:
   ```
   Bearer abc123xyz
   ```
   Repare no **espaço** depois de `Bearer`. Ele é obrigatório.

Clique em **CREATE**.

> **Por que o segredo vai no cabeçalho e não no endereço?** Porque endereços
> ficam gravados em registros de servidor, de proxy e no histórico do
> navegador. Cabeçalhos, não.

### 4.3 Segundo job — resumo da manhã

**CREATE CRONJOB** de novo:

| Campo | O que colocar |
|---|---|
| **Title** | `Resumo diário` |
| **URL** | `https://SEU-APP.vercel.app/api/cron/daily-summary` |
| **Execution schedule** | **Every day at** → `07:00` |

Em **ADVANCED**, igual ao anterior: método **`POST`** e o header
`Authorization` com `Bearer SEU_CRON_SECRET`.

Clique em **CREATE**.

### 4.4 Testar agora, sem esperar

Abra o job de lembretes e clique em **TEST RUN**.

| Resposta | Significado |
|---|---|
| **200** | ✅ Funcionou |
| **401** | Segredo errado, ou faltou o `Bearer ` antes dele |
| **404** | Endereço errado — confira o nome do app |
| **500** | Erro no servidor: veja os logs na Vercel |

---

# PARTE 5 — Cada pessoa ativa no próprio aparelho

Isso **cada usuário faz por conta própria**. Você não consegue ativar pelos
outros: é o navegador de cada um que precisa dar a permissão.

### No app

1. Entrar no sistema
2. Menu → **Minhas Configurações**
3. Botão **"Ativar notificações neste aparelho"**
4. O navegador pergunta se permite → **Permitir**
5. Chega uma notificação de teste na hora

Quem usa celular **e** computador ativa nos dois — cada aparelho é registrado
separadamente.

### 📱 iPhone — leia antes de tentar

Só funciona se **as duas** condições forem verdadeiras:

1. **iOS 16.4 ou mais recente** (Ajustes → Geral → Sobre → Versão do software)
2. **App instalado na tela de início**, assim:
   - Abrir o sistema no **Safari** (não funciona no Chrome do iPhone)
   - Tocar em **Compartilhar** (quadrado com seta para cima, embaixo)
   - Rolar e escolher **"Adicionar à Tela de Início"** → **Adicionar**
   - **Fechar o Safari** e abrir o app pelo ícone novo
   - Só então ir em Minhas Configurações e ativar

Aberto como site comum no Safari, o iPhone **nem oferece** a opção. O app
detecta e mostra a instrução na tela.

> **Confira as versões de iOS da equipe antes de anunciar o recurso.** Quem
> estiver abaixo do 16.4 não vai receber, e é melhor saber antes.

### 🤖 Android

Funciona direto pelo Chrome. Instalar na tela de início (menu ⋮ → **Instalar
aplicativo**) é recomendável, mas não obrigatório.

---

## O que cada pessoa vai receber

| Quando | Mensagem |
|---|---|
| Entre 30 e 60 min antes do atendimento | *"Você tem um atendimento às 14:00 · Sala 2"* |
| Todo dia às 07:00 | *"3 atendimento(s) hoje, o primeiro às 09:00"* |

### Por que "entre 30 e 60 minutos"?

Porque o despertador toca de 30 em 30 minutos. O sistema avisa na primeira vez
que ele toca dentro da janela — então a antecedência exata varia, mas **nunca é
menor que 30 minutos**.

Quanto mais frequente o despertador, mais preciso o aviso:

| Despertador a cada | Aviso chega entre |
|---|---|
| **30 minutos** *(configuração atual)* | 30 e 60 min antes |
| 15 minutos | 30 e 45 min antes |
| 5 minutos | 30 e 35 min antes |

O cron-job.org permite até de 1 em 1 minuto, sem custo. Se quiser mais precisão
depois, mude **os dois lugares**: o `Execution schedule` no cron-job.org **e** a
variável `CRON_INTERVAL_MINUTES` na Vercel. Se os dois não baterem, o aviso sai
com antecedência diferente da esperada.

### Nenhuma mensagem diz o nome do paciente

A notificação aparece na **tela de bloqueio**, visível a qualquer pessoa que
olhe o celular de relance. Dizer *"Sessão com Maria Silva"* revelaria que Maria
faz terapia — para quem estiver do lado na fila do café, numa reunião, com o
celular em cima da mesa.

Quem é o paciente, o profissional vê **dentro do app**, com sessão autenticada.

Para mudar isso existe uma única constante, `INCLUIR_NOME_DO_PACIENTE`, em
`api/_lib/push.ts`. Vale registrar a decisão com o setor antes de alterá-la.

---

## Se algo não funcionar

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Botão diz "não configurado" | Faltam as chaves VAPID, ou faltou o Redeploy | Refaça a Parte 2, incluindo o Redeploy |
| No iPhone o botão não aparece | App não instalado na tela de início, ou iOS < 16.4 | Parte 5, seção iPhone |
| cron-job.org responde **401** | Segredo diferente, ou faltou `Bearer ` | Confira o header da Parte 4.2 |
| cron-job.org responde **404** | Endereço do app errado | Confira a URL |
| Teste chega, mas lembrete não | Não há agendamento na janela | O atendimento precisa ser hoje e faltar até 60 min |
| Notificação repetida | Não deve acontecer | Cada agendamento é avisado só uma vez |
| Parou de chegar num aparelho | Inscrição expirou | Desativar e ativar de novo em Minhas Configurações |
