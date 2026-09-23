/**
 * Descrição de produto gerada por IA de visão, usada quando a fonte (Kalodata)
 * não devolve `product_description`. Analisa nome + categoria + fotos reais.
 */

export type DescricaoIa = { description: string; usage: { input: number; output: number } };

const MODELO = "openai/gpt-6-astra";

export async function describeProductWithAi(input: {
  name: string;
  category?: string | null;
  images: string[];
}): Promise<DescricaoIa> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("A inteligência artificial não está configurada.");

  const images = input.images.filter(Boolean).slice(0, 4);
  if (!images.length) throw new Error("O produto não tem fotos para a IA analisar.");

  const instrucao = [
    "Você analisa fotos de um produto do TikTok Shop e escreve uma descrição objetiva em português do Brasil.",
    `Nome do produto: ${input.name}`,
    input.category ? `Categoria: ${input.category}` : "",
    "Descreva APENAS características REAIS e visíveis nas fotos: tipo de produto, material, formato, cor, partes, acessórios inclusos e como se usa.",
    "Não invente benefícios, marca, preço, promessas de resultado ou informações que não dá para ver.",
    "Responda em um único parágrafo corrido de 40 a 80 palavras, sem títulos, sem listas e sem emojis.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODELO,
      stream: true,
      reasoning: { effort: "low" },
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: instrucao },
            ...images.map((url) => ({ type: "input_image", image_url: url })),
          ],
        },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error("[product-description] gateway", res.status, detail.slice(0, 500));
    if (res.status === 429) throw new Error("A IA está sobrecarregada no momento. Tente de novo em instantes.");
    if (res.status === 402) throw new Error("Os créditos de IA do espaço de trabalho acabaram. Adicione créditos para continuar.");
    throw new Error("Não foi possível gerar a descrição. Tente novamente.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const usage = { input: 0, output: 0 };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
        else if (event.type === "response.completed" && event.response?.output_text) text = event.response.output_text;
        const u = event.response?.usage;
        if (u) {
          if (typeof u.input_tokens === "number") usage.input = u.input_tokens;
          if (typeof u.output_tokens === "number") usage.output = u.output_tokens;
        }
      } catch {
        // frames parciais / keep-alive
      }
    }
  }

  const description = text.trim().replace(/\s+/g, " ");
  if (!description) throw new Error("A IA não retornou uma descrição. Tente novamente.");
  return { description, usage };
}

/** Gera a descrição, grava no produto com origem "gerada_por_ia" e registra o consumo. */
export async function generateAndSaveDescription(
  supabase: {
    from: (t: string) => {
      update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
    };
  },
  row: { id: string; name: string; niche?: string | null; profile_id: string | null; image_url: string | null; extra_image_urls: string[] | null },
): Promise<string> {
  const { assertOrcamento } = await import("./orcamento.server");
  await assertOrcamento(row.profile_id, { barata: true });
  const { assertSaldoPerfil } = await import("./saldo.server");
  await assertSaldoPerfil(row.profile_id, { descricao_produto: 1 });

  const images = [...new Set([row.image_url ?? "", ...(row.extra_image_urls ?? [])].filter(Boolean))];
  const { description, usage } = await describeProductWithAi({ name: row.name, category: row.niche ?? null, images });

  const { recordConsumo } = await import("./consumo.server");
  for (const [unidade, quantidade] of [
    ["token_input", usage.input],
    ["token_output", usage.output],
  ] as const) {
    if (quantidade > 0) {
      await recordConsumo({
        jobId: null,
        profileId: row.profile_id,
        etapa: "roteiro_texto",
        acao: "descricao_produto",
        modelo: "gpt-6-astra",
        unidade,
        quantidade,
        metadados: { tipo: "descricao_produto_ia", produto: row.id, imagens: images.length },
      });
    }
  }

  const { error } = await supabase
    .from("products")
    .update({ description, description_origem: "gerada_por_ia", updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (error) throw new Error(error.message);
  return description;
}
