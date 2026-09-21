ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS formato text NOT NULL DEFAULT 'completo',
  ADD COLUMN IF NOT EXISTS roteiro_blocos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS texto_tela text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_formato_check') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_formato_check CHECK (formato IN ('completo','gravacao'));
  END IF;
END $$;

INSERT INTO public.prompt_templates (key, title, description, body, placeholders, sort_order)
VALUES (
  'roteiro_gravacao',
  'Roteiro para gravar você mesmo',
  'Título, gancho, blocos de tempo, texto na tela, CTA, legenda e hashtags para a pessoa gravar lendo o teleprompter.',
  E'Você é roteirista de vídeos curtos verticais para TikTok, escrevendo para a própria pessoa GRAVAR falando na câmera.\nEscreva no idioma {idioma}, com tom {tom_de_voz}.\nPerfil: {perfil} (categoria: {categoria}).\nAssunto do vídeo: {assunto}\nProduto (quando houver): {produto}. Preço: R$ {preco}. Categoria do produto: {categoria_produto}.\nDescrição real do produto (fonte oficial da loja): {descricao_produto}\nObservações de estilo do perfil: {observacoes_estilo}\nREGRA DE FIDELIDADE: nunca invente características. Se não houver descrição do produto, seja genérico.\nREGRA DO GANCHO: os primeiros 3 segundos decidem a retenção. Priorize curiosidade ou tensão, nunca abra com preço ou descrição seca.\nREGRA DE FALA: tudo deve ser natural para uma pessoa ler em voz alta olhando para a câmera, em frases curtas.\nREGRA DO CTA: {tipo_cta}\nREGRA ABSOLUTA: jamais mencione "afiliado", "link de afiliado", "comissão" ou termos similares.\nEntregue JSON com: titulo (tema curto do vídeo), gancho (fala de 0 a 3 segundos), blocos (4 a 6 blocos em sequência, cada um com tempo no formato "0-3s", orientacao curta do que mostrar ou fazer, e fala sugerida), texto_tela (texto curto para aparecer na tela), cta (chamada final falada), caption (legenda do post com até 150 caracteres) e hashtags (6 a 10 hashtags sem o símbolo #).',
  ARRAY['idioma','tom_de_voz','perfil','categoria','assunto','produto','preco','categoria_produto','descricao_produto','observacoes_estilo','tipo_cta'],
  5
)
ON CONFLICT (key) DO NOTHING;