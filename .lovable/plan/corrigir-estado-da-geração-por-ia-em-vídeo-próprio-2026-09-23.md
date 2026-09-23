# Corrigir estado da geração por IA em vídeo próprio

## O que será feito
- Adicionar o estado explícito **Gerando cenas** à esteira, antes de **Cenas geradas**.
- Quando a geração por IA começar em um vídeo próprio, sincronizar o estado principal do job com a trilha de IA, mantendo os arquivos gravados e editados intactos.
- Atualizar Rascunhos, Pipeline e indicadores gerais para exibirem a etapa real e moverem o card automaticamente.
- Sincronizar também conclusão, falha retomável e retorno para revisão das cenas.

## Detalhes técnicos
- Evoluir o enum de status com `gerando_cenas`.
- Fazer a orquestração escrever em `status` e nas colunas `ai_*` nos vídeos próprios; somente os artefatos de mídia permanecem separados.
- Usar `ai_render_stage` para diferenciar planejamento/imagens de animação/narração/montagem nos badges.
- Preservar `video_path`, `video_original_path`, `video_edited_path` e a possibilidade de gravar depois.

## Validação
- Iniciar a IA em um job de gravação e confirmar **Gerando cenas** em Rascunhos e Pipeline.
- Acompanhar as transições para **Cenas geradas**, **Gerando vídeo** e **Vídeo pronto**.
- Confirmar que as versões gravada e editada continuam disponíveis.
