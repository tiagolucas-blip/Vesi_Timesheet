/**
 * Função serverless opcional, desligada por omissão.
 *
 * O protótipo funciona sem esta função: o assistente do browser é determinístico.
 * Esta função existe para o passo seguinte, ligar um motor de linguagem real,
 * e está aqui como esqueleto do contrato, não como implementação.
 *
 * Para ativar:
 *   1. definir a variável de ambiente LLM_API_KEY no projeto Vercel
 *   2. definir LLM_ENDPOINT, por exemplo o Generative AI Hub do SAP AI Core
 *   3. implementar a chamada onde está o TODO, mantendo o esquema de funções
 *
 * Princípios que esta função tem de respeitar:
 *   - nunca escreve na timesheet, apenas devolve a função escolhida e os argumentos
 *   - a confirmação do utilizador acontece no cliente, antes de qualquer escrita
 *   - nenhum dado de cliente vai no prompt além do necessário para a tarefa
 */

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
  { name: "consultar_semana", description: "Total registado, esperado e erros de validação", parameters: { type: "object", properties: {} } },
  { name: "listar_ausencias", description: "Ausências da semana e capacidade por dia", parameters: { type: "object", properties: {} } },
  { name: "copiar_semana", description: "Copiar a estrutura da semana anterior, sem durações", parameters: { type: "object", properties: {} } },
  { name: "submeter_semana", description: "Libertar a semana para aprovação", parameters: { type: "object", properties: {} } }
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  if (!process.env.LLM_API_KEY || !process.env.LLM_ENDPOINT) {
    res.status(501).json({
      error: "assistente_nao_configurado",
      detalhe: "Defina LLM_API_KEY e LLM_ENDPOINT para ativar o motor de linguagem. Sem isso, o protótipo usa o interpretador determinístico do browser.",
      funcoes_disponiveis: FUNCTIONS.map((f) => f.name)
    });
    return;
  }

  // TODO: chamar o motor de linguagem com FUNCTIONS como esquema de function calling,
  // passando apenas: mensagem do utilizador, projetos onde a pessoa está alocada,
  // ausências da semana e capacidade por dia. Devolver { funcao, argumentos, texto }.
  res.status(501).json({ error: "nao_implementado" });
}
