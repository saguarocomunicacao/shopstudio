import { z } from "zod";

const ts = z.coerce.number().catch(0);
const txt = z.coerce.string().catch("");
export const ResultadoSchema = z.object({
  resumo: txt,
  transcricao: z.array(z.object({ inicio: ts, fim: ts, texto: txt })).catch([]),
  cenas: z
    .array(
      z.object({
        inicio: ts,
        fim: ts,
        descricao_visual: txt,
        texto_na_tela: txt,
        pessoa_ou_mao: txt,
        produto_visivel: txt,
      }),
    )
    .catch([]),
  gancho: z.object({ texto: txt, por_que_funciona: txt }),
  cta: z.object({ texto: txt, momento: ts }),
  produto: z.object({ nome: txt, categoria: txt, como_e_mostrado: txt }),
  tom_de_voz: txt,
  ritmo: z.object({ cortes_por_minuto: ts, descricao: txt }),
  formato: txt,
  hashtags_sugeridas: z.array(txt).catch([]),
  titulo_video: txt.optional(),
  duracao_segundos: ts.optional(),
});
export type ResultadoAnalise = z.infer<typeof ResultadoSchema>;
