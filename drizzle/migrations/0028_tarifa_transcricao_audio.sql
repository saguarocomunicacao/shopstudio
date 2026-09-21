INSERT INTO public.tarifas (tipo_unidade, modelo, preco_unitario, moeda, vigente_desde, ativo)
SELECT 'minuto_audio'::public.unidade_tarifa, 'gemini-2.5-flash-audio', 0.0006, 'USD'::public.moeda_tarifa, CURRENT_DATE, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.tarifas WHERE modelo = 'gemini-2.5-flash-audio' AND tipo_unidade = 'minuto_audio'::public.unidade_tarifa
);