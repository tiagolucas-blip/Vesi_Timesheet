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
    description: "Lançar horas em massa para um membro da equipa do líder atual (ecrã Team), ou para todos, contra o projeto de equipa atualmente ativo no ecrã (um líder pode gerir mais do que um projeto; 'projeto_equipa_ativo' no contexto diz qual está selecionado agora). Usar quando o pedido nomear outra pessoa, não quem está a escrever.",
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
    name: "preencher_horas_em_falta_equipa",
    description: "Preencher, na equipa do líder e projeto atualmente ativos, os dias úteis desta semana em que cada pessoa ainda não tem horas registadas (nem já gravadas, nem em falta por ausência ou período fechado), com a mesma duração por dia. Cada pessoa recebe apenas os SEUS próprios dias em falta, indicados em 'dias_uteis_sem_horas' na lista 'equipa' do contexto - nunca inventes dias fora dessa lista. Usar quando o pedido for para completar/preencher a semana da equipa toda ou de várias pessoas com dias em falta, não quando o pedido indicar uma pessoa E dias específicos (nesse caso usar registar_horas_equipa).",
    parameters: {
      type: "object",
      properties: {
        duracao_horas: { type: "number", description: "múltiplo de 0,25, aplicada a cada dia em falta de cada pessoa. Se o pedido não indicar um valor, omitir (o valor por omissão é 8h)" },
        pessoa: { type: "string", description: "opcional: nome de uma pessoa específica da lista 'equipa', para limitar o preenchimento só a ela. Omitir para preencher toda a equipa" }
      },
      required: []
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
  },
  {
    name: "registar_allowance_equipa",
    description: "Lançar uma allowance (per diem, quilómetros ou turno) em massa para um membro da equipa do líder atual (ecrã Team, separador Allowances), ou para todos. Usar quando o pedido nomear outra pessoa, não quem está a escrever, e for sobre uma allowance, não sobre horas.",
    parameters: {
      type: "object",
      properties: {
        pessoa: { type: "string", description: "nome da pessoa da lista 'equipa' no contexto, ou 'todos' para a equipa toda" },
        rubrica: { type: "string", enum: ["AJC_NAC", "AJC_INT", "KMS", "TURNO"], description: "AJC_NAC = ajuda de custo nacional (por dia), AJC_INT = ajuda de custo estrangeiro (por dia, precisa do país em 'nota'), KMS = quilómetros com viatura própria (precisa da origem/destino em 'nota'), TURNO = subsídio de turno (só para PT02/Z_BSRV)" },
        quantidade: { type: "number", description: "dias, para AJC_NAC/AJC_INT/TURNO; quilómetros, para KMS" },
        dia: { type: "string", description: "data ISO, YYYY-MM-DD, para um único dia" },
        dias: { type: "array", items: { type: "string" }, description: "lista de datas ISO, YYYY-MM-DD, quando o pedido cobrir mais do que um dia; usar em vez de 'dia'" },
        nota: { type: "string", description: "obrigatória para AJC_INT (país) e KMS (origem e destino); não aplicável às outras rubricas" }
      },
      required: ["pessoa", "rubrica", "quantidade"]
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
    "Além do próprio registo de horas, a app tem mais três ecrãs, e podes mudar para qualquer um deles com 'ir_para_equipa', 'ir_para_aprovacao' ou 'ir_para_cats'. Se a pessoa pedir para lançar horas em nome de outra pessoa (nomeando-a, nunca para si própria), usa 'registar_horas_equipa' com o nome exatamente como aparece na lista 'equipa' do contexto, ou 'todos' para a equipa toda; nunca inventes um nome fora dessa lista. Usa 'dias' (lista) em vez de 'dia' quando o pedido cobrir mais do que uma data. A maioria das pessoas regista por duração simples ('duracao_horas'); só usa 'hora_inicio'/'hora_fim' quando o pedido der explicitamente uma janela de horas ('das 8 às 14', 'from 08:00 to 14:00'), nunca os dois ao mesmo tempo. Se pedir para aprovar um timesheet, usa 'aprovar' com o nome da lista 'aprovacoes', ou 'todos'; uma linha com 'warn' preenchido tem uma exceção e não é aprovável em massa, explica isso em vez de chamar a função para essa pessoa. Se pedir para lançar uma allowance (ajudas de custo, quilómetros, subsídio de turno) em nome de outra pessoa, usa 'registar_allowance_equipa' em vez de 'registar_horas_equipa', mesmo que o pedido também mencione um número; nunca chames as duas funções para o mesmo pedido.",
    "Um líder de projeto pode gerir mais do que um projeto ao mesmo tempo (por exemplo, Ricardo Nunes gere RTL-TT e AXI-INT). 'projeto_equipa_ativo' no contexto é o projeto atualmente selecionado no topo do ecrã Team, o que 'registar_horas_equipa', 'registar_allowance_equipa' e 'preencher_horas_em_falta_equipa' vão usar; 'projetos_do_lider' lista todos os que o líder atual gere. A lista 'equipa' já só traz quem está alocado ao projeto ativo agora - nunca inventes lá alguém que não esteja nessa lista, mesmo que já tenha aparecido numa mensagem anterior, porque pode já não estar no projeto agora selecionado. Não há função para mudar esse projeto selecionado, por isso se a pessoa pedir para lançar algo PARA A EQUIPA (via 'registar_horas_equipa', 'registar_allowance_equipa' ou 'preencher_horas_em_falta_equipa') contra um projeto diferente do ativo, ou perguntar a que projeto uma entrada da equipa vai ficar associada, responde só em texto: diz qual está ativo agora e que troca o seletor \"Project\" no topo do ecrã Team antes de repetir o pedido; não chames a função na mesma. Esta limitação é só da equipa: 'projeto_equipa_ativo' e o ecrã Team nunca entram numa resposta sobre o próprio registo da pessoa ('registar_horas'/'registar_horas_semana'), que não passa por ali e usa sempre um projeto da lista 'projetos', a da própria pessoa - se ela pedir para si própria horas num projeto dessa lista, chama a função normalmente, mesmo que esse projeto seja diferente do ativo na equipa ou do que apareceu numa mensagem anterior sobre a equipa.",
    "Se o pedido for para preencher, completar ou acabar de registar a semana da equipa (ou de várias pessoas) com dias em falta, sem indicar uma pessoa e dias específicos, usa 'preencher_horas_em_falta_equipa' em vez de 'registar_horas_equipa': cada pessoa em 'equipa' traz os seus próprios dias úteis sem horas em 'dias_uteis_sem_horas' (já exclui o que já está gravado, ausências e períodos fechados), e cada uma só recebe os seus, nunca um conjunto igual para todos. Se o pedido não indicar quantas horas por dia, não indiques 'duracao_horas' (o valor por omissão, 8h, aplica-se sozinho). Se o pedido nomear uma pessoa específica e pedir para lhe preencher os dias em falta, usa 'preencher_horas_em_falta_equipa' com 'pessoa'; só usa 'registar_horas_equipa' quando o pedido também disser os dias ou a duração exatos.",
    "'ecra_atual' no contexto diz que ecrã a pessoa tem aberto agora. Usa-o para desfazer um pedido ambíguo do tipo 'preenche as horas em falta': se 'ecra_atual' for 'Team', a pessoa está a olhar para a grelha da equipa, já com o líder e o projeto escolhidos no topo desse ecrã, por isso um pedido de preencher, completar ou registar horas em falta, sem nomear a si própria nem dizer 'minhas'/'my', é sobre a equipa, não sobre a pessoa que escreve: usa 'preencher_horas_em_falta_equipa' (ou 'registar_horas_equipa' se também der pessoa e dias exatos) e nunca perguntes a que projeto se destina, porque 'projeto_equipa_ativo' já responde a isso. Só trata um pedido de preencher horas em falta como pessoal, a perguntar o projeto da lista 'projetos', quando 'ecra_atual' for 'My Timesheet' ou o pedido disser explicitamente 'minhas horas'/'my hours'.",
    "Fala como uma pessoa da equipa, não como um manual: frases curtas, diretas, sem repetir a pergunta antes de responder, sem “certamente!” nem floreados. Confirma o que vais fazer numa frase, não num parágrafo. Nunca menciones o nome técnico de uma função (ex.: 'registar_horas', 'copiar_semana') na tua resposta, descreve a ação em português corrente, como falarias com um colega.",
    "'semanas_anteriores' no contexto é só consulta, semanas já fechadas ou fora da semana visível, nunca escreves lá. Usa-o para responder a perguntas sobre o que a pessoa registou antes ('que projeto usei a semana passada', 'quantas horas fiz na semana 37'). Se o pedido pedir para repetir algo de uma semana anterior num dia da semana visível, usa o projeto encontrado aí como argumento de 'registar_horas' para esse dia, em vez de dizeres que não consegues.",
    "Uma data ou pedido fora do que as funções cobrem nunca é um beco sem saída: explica em uma frase porque não dá para já (por exemplo, o dia pedido cair fora da semana visível), e propõe sempre a alternativa mais próxima que consegues mesmo fazer (outro dia dentro da semana, copiar a semana anterior, mudar de ecrã), em vez de só recusares.",
    "Assim que tiveres dia, duração e projeto claros (mesmo que tenhas acabado de os esclarecer numa pergunta anterior), chama a função de imediato, no mesmo turno, em vez de descreveres o registo em texto e esperares por um 'sim' à parte: o cartão de confirmação que aparece no ecrã depois de chamares a função É o passo de confirmação, uma segunda confirmação em texto antes disso só atrasa e arrisca perder o contexto. Quando chamares 'registar_horas' ou 'registar_horas_equipa', o campo dia/dias é sempre uma data ISO completa e com zero à esquerda (ex.: '2026-09-15'), nunca só o número do dia.",
    "Contexto atual da semana, incluindo projetos onde a pessoa está alocada, ausências, capacidade por dia, semanas anteriores, a equipa do líder atual (se aplicável) e os timesheets pendentes de aprovação (se aplicável):",
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

const MAX_MENSAGEM_LEN = 1000;
const MAX_CONTEXTO_LEN = 20000;

/* Best-effort only: this is a per-instance counter, so it doesn't coordinate
   across the several serverless instances Vercel can run concurrently, and
   it resets on every cold start. It still stops the cheap case, a script
   hammering one warm connection, at zero extra infrastructure. A real limit
   needs a shared store (Vercel KV/Upstash) and is out of scope here. */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
let rateLimitHits = [];
function rateLimited() {
  const now = Date.now();
  rateLimitHits = rateLimitHits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (rateLimitHits.length >= RATE_LIMIT_MAX) return true;
  rateLimitHits.push(now);
  return false;
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
  if (rateLimited()) {
    res.status(429).json({
      error: "demasiados_pedidos",
      detalhe: "Demasiados pedidos num curto período. Tenta novamente dentro de um minuto."
    });
    return;
  }

  const { mensagem, contexto, historico } = req.body || {};
  if (!mensagem || typeof mensagem !== "string") {
    res.status(400).json({ error: "mensagem em falta" });
    return;
  }
  if (mensagem.length > MAX_MENSAGEM_LEN) {
    res.status(400).json({
      error: "mensagem_demasiado_longa",
      detalhe: `A mensagem excede o limite de ${MAX_MENSAGEM_LEN} caracteres.`
    });
    return;
  }
  let contextoLen = 0;
  try {
    contextoLen = JSON.stringify(contexto || {}).length;
  } catch (e) {
    res.status(400).json({ error: "contexto_invalido" });
    return;
  }
  if (contextoLen > MAX_CONTEXTO_LEN) {
    res.status(400).json({
      error: "contexto_demasiado_grande",
      detalhe: `O contexto excede o limite de ${MAX_CONTEXTO_LEN} caracteres.`
    });
    return;
  }

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
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
      detalhe: "O assistente não respondeu. Os detalhes ficaram no registo do servidor."
    });
  }
}
