/**
 * Função serverless que liga o assistente do protótipo ao Claude, via function calling.
 *
 * Desligada por omissão: sem ANTHROPIC_API_KEY, devolve 501 e o cliente cai
 * automaticamente no interpretador determinístico do browser.
 *
 * Princípios que esta função tem de respeitar:
 *   - nunca escreve na timesheet, apenas devolve a função escolhida e os argumentos
 *   - a confirmação do utilizador acontece no cliente, antes de qualquer escrita
 *   - nunca inventa projetos fora da lista dada no contexto
 *   - nenhum dado de cliente vai no prompt além do contexto necessário à tarefa
 */

import Anthropic from "@anthropic-ai/sdk";

const FUNCTIONS = [
  {
    name: "registar_horas",
    description: "Registar horas num dia, contra um projeto onde a pessoa está alocada",
    parameters: {
      type: "object",
      properties: {
        dia: { type: "string", description: "data ISO, YYYY-MM-DD" },
        duracao_horas: { type: "number", description: "múltiplo de 0,25" },
        projeto: { type: "string", description: "código do projeto, apenas da lista fornecida" },
        descricao: { type: "string", maxLength: 300 }
      },
      required: ["dia", "duracao_horas", "projeto"]
    }
  },
  {
    name: "registar_horas_semana",
    description: "Registar a mesma duração em todos os dias úteis da semana visível (segunda a sexta), contra um projeto onde a pessoa está alocada. Usar quando o pedido cobrir a semana toda, não um único dia.",
    parameters: {
      type: "object",
      properties: {
        duracao_horas: { type: "number", description: "múltiplo de 0,25, aplicada a cada dia" },
        projeto: { type: "string", description: "código do projeto, apenas da lista fornecida" },
        descricao: { type: "string", maxLength: 300 }
      },
      required: ["duracao_horas", "projeto"]
    }
  },
  { name: "consultar_semana", description: "Total registado, esperado e erros de validação", parameters: { type: "object", properties: {} } },
  { name: "ir_para_equipa", description: "Mudar para o ecrã Team (mass entry), onde o líder lança horas, allowances ou bónus em massa para a equipa", parameters: { type: "object", properties: {} } },
  { name: "ir_para_aprovacao", description: "Mudar para o ecrã Approval (manager), onde os timesheets da equipa são aprovados", parameters: { type: "object", properties: {} } },
  { name: "ir_para_cats", description: "Mudar para o ecrã CATS mapping, a referência técnica do que cada ação grava no CATS/SAP", parameters: { type: "object", properties: {} } },
  { name: "listar_ausencias", description: "Ausências da semana e capacidade por dia", parameters: { type: "object", properties: {} } },
  { name: "copiar_semana", description: "Copiar a estrutura da semana anterior, sem durações", parameters: { type: "object", properties: {} } },
  { name: "aplicar_sugestoes", description: "Aplicar as sugestões de confiança alta ainda por rever", parameters: { type: "object", properties: {} } },
  { name: "submeter_semana", description: "Libertar a semana para aprovação", parameters: { type: "object", properties: {} } },
  {
    name: "registar_horas_equipa",
    description: "Lançar horas em massa para um membro da equipa do líder atual (ecrã Team), ou para todos, contra o projeto do líder. Usar quando o pedido nomear outra pessoa, não quem está a escrever.",
    parameters: {
      type: "object",
      properties: {
        pessoa: { type: "string", description: "nome da pessoa da lista 'equipa' no contexto, ou 'todos' para a equipa toda" },
        dia: { type: "string", description: "data ISO, YYYY-MM-DD, para um único dia" },
        dias: { type: "array", items: { type: "string" }, description: "lista de datas ISO, YYYY-MM-DD, quando o pedido cobrir mais do que um dia; usar em vez de 'dia'" },
        duracao_horas: { type: "number", description: "múltiplo de 0,25. Usar para quem regista por duração simples (a maioria); não usar junto com hora_inicio/hora_fim" },
        hora_inicio: { type: "string", description: "HH:MM, só para quem regista por relógio (perfil Z_BSRV); usar em vez de duracao_horas" },
        hora_fim: { type: "string", description: "HH:MM, só para quem regista por relógio (perfil Z_BSRV)" }
      },
      required: ["pessoa"]
    }
  },
  {
    name: "aprovar",
    description: "Aprovar, no ecrã Approval, o timesheet de uma pessoa da lista 'aprovacoes' no contexto, ou de todos os que não têm exceção. Nunca aprova uma linha com exceção, essa precisa de revisão individual no ecrã.",
    parameters: {
      type: "object",
      properties: {
        pessoa: { type: "string", description: "nome da pessoa da lista 'aprovacoes' no contexto, ou 'todos' para os timesheets sem exceção" }
      },
      required: ["pessoa"]
    }
  }
];

function toClaudeTools() {
  return FUNCTIONS.map((f) => ({
    name: f.name,
    description: f.description,
    input_schema: {
      type: "object",
      properties: f.parameters.properties,
      required: f.parameters.required || [],
      additionalProperties: false
    },
    strict: true
  }));
}

function buildSystemPrompt(contexto) {
  return [
    "És o assistente de registo de horas do protótipo Vesi Timesheet, no padrão Joule.",
    "A tua única tarefa é interpretar o pedido do consultor e, quando aplicável, escolher uma função da lista fornecida com os argumentos corretos.",
    "Nunca escreves na timesheet. Só devolves a função e os argumentos; quem grava é a pessoa, depois de confirmar no ecrã.",
    "Nunca inventas projetos, dias ou horas fora do que está no contexto abaixo. Se não reconheceres o projeto pedido, não chames nenhuma função e explica, em texto curto, quais os projetos disponíveis.",
    "Se o pedido não corresponder a nenhuma das funções (por exemplo, uma pergunta fora de âmbito), não chames nenhuma função e responde apenas em texto curto, em português de Portugal, sem inglês.",
    "Durações aceitam vírgula, dois pontos ou minutos, por exemplo 1,5, 1:30 ou 90m. Arredonda sempre a múltiplos de 15 minutos.",
    "O histórico da conversa, quando presente nas mensagens anteriores, mostra as tuas próprias respostas em texto simples, nunca uma chamada de função por resolver. Se o campo 'pedido_por_confirmar' do contexto estiver preenchido, há um cartão de confirmação em aberto no ecrã com esses dados exatos, ainda não gravado. Uma mensagem curta que só corrija parte disso (outro dia, outra duração, outro projeto) refere-se a esse mesmo pedido: chama 'registar_horas' outra vez, com o campo corrigido e os restantes exatamente como estavam em 'pedido_por_confirmar', em vez de pedires a frase toda de novo.",
    "Além do próprio registo de horas, a app tem mais três ecrãs, e podes mudar para qualquer um deles com 'ir_para_equipa', 'ir_para_aprovacao' ou 'ir_para_cats'. Se a pessoa pedir para lançar horas em nome de outra pessoa (nomeando-a, nunca para si própria), usa 'registar_horas_equipa' com o nome exatamente como aparece na lista 'equipa' do contexto, ou 'todos' para a equipa toda; nunca inventes um nome fora dessa lista. Usa 'dias' (lista) em vez de 'dia' quando o pedido cobrir mais do que uma data. A maioria das pessoas regista por duração simples ('duracao_horas'); só usa 'hora_inicio'/'hora_fim' quando o pedido der explicitamente uma janela de horas ('das 8 às 14', 'from 08:00 to 14:00'), nunca os dois ao mesmo tempo. Se pedir para aprovar um timesheet, usa 'aprovar' com o nome da lista 'aprovacoes', ou 'todos'; uma linha com 'warn' preenchido tem uma exceção e não é aprovável em massa, explica isso em vez de chamar a função para essa pessoa.",
    "Fala como uma pessoa da equipa, não como um manual: frases curtas, diretas, sem repetir a pergunta antes de responder, sem “certamente!” nem floreados. Confirma o que vais fazer numa frase, não num parágrafo.",
    "Contexto atual da semana, incluindo projetos onde a pessoa está alocada, ausências, capacidade por dia, a equipa do líder atual (se aplicável) e os timesheets pendentes de aprovação (se aplicável):",
    JSON.stringify(contexto || {}, null, 2)
  ].join("\n");
}

/* Trusts nothing from the client: keeps only well-formed {role, content}
   pairs, role restricted to user/assistant, content capped in length, and
   the whole list capped in size, before it goes anywhere near the prompt. */
function sanitizeHistorico(historico) {
  if (!Array.isArray(historico)) return [];
  return historico
    .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
    .slice(-12)
    .map((h) => ({ role: h.role, content: h.content.slice(0, 600) }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(501).json({
      error: "assistente_nao_configurado",
      detalhe: "Defina ANTHROPIC_API_KEY nas variáveis de ambiente do projeto Vercel para ativar o Claude. Sem isso, o protótipo usa o interpretador determinístico do browser.",
      funcoes_disponiveis: FUNCTIONS.map((f) => f.name)
    });
    return;
  }

  const { mensagem, contexto, historico } = req.body || {};
  if (!mensagem || typeof mensagem !== "string") {
    res.status(400).json({ error: "mensagem em falta" });
    return;
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1024,
      system: buildSystemPrompt(contexto),
      tools: toClaudeTools(),
      tool_choice: { type: "auto" },
      output_config: { effort: "low" },
      messages: [...sanitizeHistorico(historico), { role: "user", content: mensagem }]
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    const texto = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    res.status(200).json({
      funcao: toolUse ? toolUse.name : null,
      argumentos: toolUse ? toolUse.input : null,
      texto: texto || null
    });
  } catch (err) {
    console.error("assistente_falha_claude", {
      name: err && err.name,
      status: err && err.status,
      message: err && err.message
    });
    res.status(502).json({
      error: "falha_motor_linguagem",
      detalhe: String((err && err.message) || err)
    });
  }
}
