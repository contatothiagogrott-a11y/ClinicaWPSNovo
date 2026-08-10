# Padrão dos Documentos Psicológicos — proposta para aprovação

> **O que é isto:** o padrão escrito de como todos os documentos gerados pelo
> sistema devem ficar. Nada foi alterado no código ainda — este documento é
> para você revisar, riscar, corrigir e devolver. Depois eu implemento.
>
> **Como revisar:** as caixas 🔲 marcam decisões que dependem de você. O resto
> é diagnóstico do que existe hoje.

---

# PARTE A — O que está desalinhado hoje

Os quatro documentos foram construídos em momentos diferentes, sem um padrão
comum. Isto é o que difere entre eles:

| Elemento | Atestado | Anamnese/Risco | Urgência | Prontuário |
|---|---|---|---|---|
| Subtítulo sob o título | **ausente** | presente | presente | presente |
| Tabela de identificação | **ausente** | 6 linhas | 2 linhas | 3 linhas |
| Tamanho do texto corrido | **11 pt** | 10 pt | 10 pt | 10 pt |
| Entrelinha | **1,4** | padrão | padrão | padrão |
| Assinaturas | 1 | 2 | 1 | 2 |
| Local e data | por extenso, no corpo | "Data:" antes da assinatura | **ausente** | frase de arquivamento |
| Alinhamento do corpo | justificado | esquerda | esquerda | justificado |

**Diagnóstico:** o atestado destoa de todos os outros (fonte maior, sem tabela,
sem subtítulo), e a urgência é o único documento **sem data de emissão** — o que
é uma falha, não só estética: documento psicológico exige data (Resolução CFP
nº 06/2019).

---

# PARTE B — Padrão proposto de layout

## B1. Página e margens *(manter como está)*

| Medida | Valor | Origem |
|---|---|---|
| Tamanho | A4 (595 × 842 pt) | — |
| Margem esquerda | 85 pt (3 cm) | modelo Word oficial |
| Margem direita | 57 pt (2 cm) | modelo Word oficial |
| Margem superior | 108 pt | espaço da logo |
| Margem inferior | 78 pt | espaço do rodapé |

Estas medidas vieram do `ATESTADO_MODELO.docx` de vocês e **não proponho
mudar**. Se o setor tiver outro padrão de margem, é aqui que se altera.

🔲 **Confirma as margens?** ( ) sim ( ) alterar para: ______

## B2. Timbre *(manter como está)*

- **Logo:** topo, 380 pt de largura, alinhada à margem esquerda
- **Marca d'água:** centralizada, 226,77 × 257,10 pt, opacidade 13%
- **Rodapé:** linha cinza + endereço institucional (6,5 pt) + aviso de
  confidencialidade e numeração de página (6 pt)

🔲 **O rodapé deve continuar com o texto atual?**
Hoje: *"Assembleia Legislativa do Estado de Santa Catarina. Coordenadoria de
Saúde e Assistência. Av. Mauro Ramos 300, 2º andar. Florianópolis, Santa
Catarina. Contato telefônico — Setor de Psicologia: (48) 3221-2917."*
( ) sim ( ) corrigir para: ______

## B3. Escala tipográfica proposta

Uma escala única para todos os documentos:

| Uso | Tamanho | Estilo | Espaço antes / depois |
|---|---|---|---|
| Título do documento | 15 pt | negrito, centralizado, CAIXA ALTA | 10 / 4 |
| Subtítulo | 9 pt | cinza (#555), centralizado | 0 / 12 |
| Título de seção | 11 pt | negrito, azul (#1e3a8a), sublinhado | 16 / 6 |
| Rótulo de campo | 10 pt | negrito | — |
| Texto corrido | **10,5 pt** | normal, entrelinha 1,35 | 0 / 8 |
| Tabela de identificação | 9,5 pt | rótulos em negrito | 0 / 10 |
| Assinatura (nome) | 9 pt | negrito, centralizado | — |
| Assinatura (título/CRP) | 9 pt | normal, centralizado | — |
| Nota de rodapé do documento | 7 pt | cinza (#666) | 24 / 0 |

**Mudança principal:** o corpo passa de 11 pt (atestado) e 10 pt (demais) para
**10,5 pt em todos**. É um meio-termo: o atestado fica menos "solto" e os
outros ficam mais legíveis.

🔲 **Aprova 10,5 pt para o corpo?** ( ) sim ( ) prefiro 10 ( ) prefiro 11

## B4. Estrutura obrigatória — todos os documentos

Toda peça passa a ter, nesta ordem:

```
1. TÍTULO DO DOCUMENTO           (caixa alta, centralizado)
2. Subtítulo                      (uma linha, explicando a natureza)
3. Tabela de Identificação        (padronizada — ver B5)
4. Corpo                          (varia por documento)
5. Local e data                   ("Florianópolis, 6 de agosto de 2026.")
6. Assinatura(s)
7. Nota de rodapé                 (quando houver: validade, base normativa)
```

**O que muda na prática:**
- o **atestado** ganha subtítulo e tabela de identificação;
- a **urgência** ganha local e data (hoje não tem);
- todos passam a ter a mesma tabela de identificação.

🔲 **Aprova a estrutura única?** ( ) sim ( ) exceto: ______

## B5. Tabela de Identificação padronizada

Mesma tabela em todos os documentos, com linhas cinza-claras horizontais:

| | | | |
|---|---|---|---|
| **Nome** | *(ocupa as 3 colunas)* | | |
| **Data de Nascimento** | 15/01/1982 | **Matrícula** | 13530 |
| **Setor** | TVAL | **Contato** | (48) 99192-3890 |
| **Prontuário nº** | 121 | **Vínculo** | Servidor |

O bloco de **contato de emergência** aparece apenas na Anamnese e na Urgência —
documentos em que a informação é operacionalmente necessária.

🔲 **Falta algum campo nessa tabela?** ______
🔲 **Sobra algum?** ______

---

# PARTE C — Conteúdo de cada documento

## C1. Atestado Psicológico

**Título:** ATESTADO PSICOLÓGICO
**Subtítulo proposto:** *"Documento emitido conforme Resolução CFP nº 06/2019"*

**Texto-modelo atual** (o profissional edita antes de emitir):

> Atesto¹ para os devidos fins que **[NOME]**, nascido(a) em **[DATA]**,
> residente à **[ENDEREÇO]**, está apta para **[FINALIDADE]**. Está em
> acompanhamento psicológico nesta instituição desde **[DATA]** por
> recomendação da equipe médica que a acompanha para a realização de
> **[MOTIVO]**. Participou dos encontros de forma assídua e encontra-se com
> humor estável, sono regular e sem alterações do senso-percepção.
>
> Os instrumentos utilizados para avaliação foram entrevistas clínicas,
> anamnese, psicoterapia individual e psico-orientação para o pré e pós
> cirúrgico individual.

**Nota de rodapé:** ¹ Este atestado psicológico tem o prazo de validade de
**[N]** dias, contados a partir da data de emissão.

⚠️ **Três problemas neste texto que preciso apontar:**

1. **"está apta"** — flexionado no feminino, fixo. Para um paciente homem sai
   errado. Proponho concordar automaticamente com o gênero do paciente, ou usar
   "está apto(a)".
2. **O segundo parágrafo é específico demais.** Ele fala de "pré e pós
   cirúrgico" como se todo atestado fosse desse tipo. Quem esquecer de editar
   emite um atestado dizendo algo que não aconteceu — o que é grave num
   documento assinado com CRP.
3. **"por recomendação da equipe médica"** também é presumido: nem todo
   acompanhamento vem de encaminhamento médico.

🔲 **Como resolver o texto do atestado?**
( ) Manter como está, confiando na edição do profissional
( ) Deixar o texto **mínimo** e neutro, e o profissional completa
( ) Criar **modelos por finalidade** (cirurgia, afastamento, comparecimento…)
( ) Outro: ______

🔲 **Se optar por modelos, quais finalidades o setor mais emite?** ______

## C2. Anamnese de Classificação de Risco

**Título:** ANAMNESE DE CLASSIFICAÇÃO DE RISCO
**Subtítulo:** Instrumento unificado de Anamnese e Avaliação de Fatores de Risco
e Proteção — Setor de Psicologia

**Seções atuais, nesta ordem:**
Dados de Identificação · Queixa Principal · Diagnóstico Prévio · Uso de
Medicamentos · Uso de Substâncias · Uso da Rede de Saúde · Rede de Apoio ·
Condição Socioeconômica · Risco de Vida · Estado Mental Atual · Fatores de
Risco · Fatores de Proteção · Vulnerabilidade Social · Classificação de Risco

**Assinaturas:** profissional que aplicou + supervisor

🔲 **A ordem das seções está correta?** ( ) sim ( ) mudar: ______
🔲 **Falta ou sobra alguma seção?** ______

## C3. Registro de Atendimento de Urgência

**Título:** REGISTRO DE ATENDIMENTO DE URGÊNCIA
**Subtítulo:** Atendimento pontual em situação de crise — não configura anamnese
nem atendimento contínuo

**Seções atuais:** Identificação do Atendimento · Motivo do Acionamento ·
Intervenção Realizada · Desfecho

**Correção necessária:** acrescentar **local e data** ao final (hoje ausente).

🔲 **Confirma o acréscimo da data?** ( ) sim ( ) não

## C4. Prontuário Psicológico

**Título:** PRONTUÁRIO PSICOLÓGICO
**Subtítulo proposto:** *"Registro documental — Resolução CFP nº 001/2009"*

**Estrutura:** identificação → evoluções em ordem cronológica → frase de
arquivamento → assinaturas (profissional + supervisor)

Cada evolução: `DATA: 12/03/2026` em negrito, seguida do texto justificado.

🔲 **A evolução deve mostrar o nome do profissional que a escreveu?**
( ) sim, em cada entrada ( ) não, só a assinatura no fim

---

# PARTE D — Decisão pendente que trava parte disto

Os documentos de **Anamnese** e **Prontuário** têm duas assinaturas: a do
profissional e a do **supervisor**. Hoje o nome e o CRP do supervisor estão
**fixos no código** (`Rafael da Costa Faria — CRP-SC 25613`), então todo
documento sai assinado com essa pessoa, independentemente de quem supervisiona
o caso.

Isso atribui a um profissional a responsabilidade por um ato que pode não ter
sido dele.

🔲 **Como definir o supervisor de cada documento?**
( ) É sempre quem estiver cadastrado como Supervisor no sistema
( ) O profissional escolhe na hora de emitir
( ) Cada paciente tem um supervisor fixo, definido no cadastro
( ) Documentos deixam de ter a segunda assinatura

---

# PARTE E — Resumo do que muda

| Documento | Mudanças |
|---|---|
| **Atestado** | ganha subtítulo e tabela de identificação; corpo de 11 → 10,5 pt; revisão do texto-modelo |
| **Anamnese** | corpo de 10 → 10,5 pt; espaçamentos padronizados |
| **Urgência** | **ganha local e data**; tabela de identificação completa; corpo 10 → 10,5 pt |
| **Prontuário** | ganha subtítulo; tabela de identificação padronizada; corpo 10 → 10,5 pt |

Nada disso mexe no banco de dados — é só geração de PDF. Não haverá migration.

---

## Como devolver

Pode responder direto no chat, pelos códigos das caixas (B1, B3, C1…), ou
escrever livremente o que quer diferente. Se preferir, edite este arquivo e me
devolva.
