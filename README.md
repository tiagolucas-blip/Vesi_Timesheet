# Protótipo Timesheet Fiori

Protótipo clicável de registo de horas a projetos, desenhado como extensão Fiori em SAP BTP, com registo lido para o CATS. Serve de referência visual e funcional para o desenvolvimento e para as conversas com cliente.

Documentos que acompanham este repositório:

- Especificação UX/UI, 23 secções, dos princípios aos critérios de aceitação
- Anexo A, mapeamento da interface para os conceitos SAP e para os campos de CATSDB

## O que o protótipo faz

Tudo abaixo funciona, sem servidor e sem dados reais.

**Registo**
- Grelha semanal com edição inline, aceita `1,5`, `1:30` e `90m`, arredondamento a 15 minutos
- Vista de calendário com blocos por projeto e eventos externos a converter
- Registo rápido com interpretação de linguagem natural e chips corrigíveis
- Copiar a semana anterior, aplicar template, favoritos por projeto

**Ausências, lidas do pedido de ausência**
- Ausência aprovada de dia inteiro fecha o dia ao registo, na grelha e no calendário
- Ausência parcial reduz a capacidade do dia e o esperado da semana
- Pedido pendente gera aviso, não bloqueia
- O botão `Simular aprovação` mostra o conflito que surge quando um pedido é aprovado depois de as horas terem sido registadas, com resolução assistida
- Sugestões que caiam em dias de ausência aprovada não são propostas

**Assistente conversacional, padrão Joule**
- Registo por conversa, consulta do estado da semana, consulta de ausências, copiar semana, submeter
- Nunca grava sem confirmação explícita, e mostra sempre o objeto recetor e o tipo de atividade antes de gravar
- Recusa dias com ausência aprovada e propõe o dia livre seguinte
- Entradas criadas pelo assistente ficam marcadas com origem `Joule`

**Validação e aprovação**
- Três severidades, erro bloqueia, aviso não bloqueia, informação orienta
- Resumo por projeto e objeto recetor antes da submissão
- Ecrã de aprovação com aprovação em massa e exceções separadas

**Mapeamento CATS**
- Tabela campo a campo, cadeia de estados até à transferência
- Geração ao vivo dos registos CATS a partir da semana preenchida, em tabela ou como payload

## Estrutura

```
body.html      conteúdo da página, fonte única de verdade do markup
styles.css     tokens de cor e tipografia, tema claro e escuro
app.js         toda a lógica, sem dependências externas
index.html     documento completo, é o que a Vercel serve  (gerado)
artifact.html  mesma página sem esqueleto, para publicar como Artifact  (gerado)
tools/build.py gera os dois ficheiros acima a partir de body.html
api/chat.js    função serverless opcional, desligada por omissão
vercel.json    configuração de site estático
```

Depois de editar `body.html`, correr:

```bash
python3 tools/build.py
```

## Correr localmente

Não há build nem dependências:

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Publicar na Vercel

O projeto é estático. Importar o repositório na Vercel e aceitar os valores por omissão, sem framework preset, sem comando de build, com a raiz como diretório de saída. O `vercel.json` já traz essa configuração.

## Dados

Não há dados reais. Colaborador, projetos, WBS, centros de custo e ausências são inventados e vivem em constantes no topo do `app.js`. Nenhum pedido sai do browser, nenhum dado é guardado, não há armazenamento local nem cookies.

## Limites conhecidos, por desenho

- A navegação entre semanas é simulada, existe uma semana
- O interpretador de linguagem natural é determinístico, baseado em expressões regulares. Reconhece duração, dia e prefixo do projeto, e nada mais
- O assistente não chama nenhum modelo de linguagem. Ver a secção seguinte
- Não há autenticação nem perfis, o utilizador é fixo

## O que falta para o assistente ser real

O protótipo demonstra o padrão de interação, que é a parte que precisa de validação com utilizadores. Para o operacionalizar a sério são precisas sete peças:

1. **Motor de linguagem.** Um endpoint de inferência, SAP AI Core com Generative AI Hub no cenário BTP, ou outro fornecedor. O interpretador atual não generaliza para fraseado livre
2. **Function calling com esquema fechado.** O modelo não escreve na timesheet, apenas escolhe entre funções tipadas: `registar_horas`, `consultar_semana`, `listar_ausencias`, `copiar_semana`, `submeter_semana`. Cada função valida os argumentos antes de executar
3. **Grounding por utilizador.** Projetos e WBS onde a pessoa está alocada, ausências, capacidade do dia, estado da semana. Sem isto o modelo inventa códigos de projeto
4. **Autenticação e propagação de identidade.** XSUAA ou IAS com propagação de principal até à API do S/4HANA, para que a escrita aconteça em nome da pessoa e o trilho de auditoria fique correto
5. **Estado de conversa.** Armazenamento de sessão com retenção curta, para manter o contexto entre turnos sem guardar histórico indefinidamente
6. **Salvaguardas.** Confirmação obrigatória antes de qualquer escrita, que o protótipo já implementa, mais limite de chamadas, recusa de campos contabilísticos preenchidos por texto livre, marcação de origem para auditoria, e registo do que o assistente propôs contra o que a pessoa aceitou
7. **Avaliação.** Um conjunto de casos de teste com fraseado real dos consultores, incluindo casos difíceis, para medir a precisão antes de abrir a utilizadores

No cenário SAP, o caminho standard é expor estas funções como capacidade do Joule, com o Joule Studio no SAP Build, em vez de construir um chat próprio dentro da aplicação. A vantagem é o utilizador ter um só assistente no launchpad em vez de um por aplicação. Este protótipo imita o padrão de interação, não o produto.

## Aviso

O assistente deste protótipo chama-se Assistente e está marcado como `padrão Joule`. Não é o Joule da SAP, não usa a marca nem os serviços da SAP, e serve apenas para demonstrar o padrão de interação.
