# Estilo visual por perfil e por vídeo

## Objetivo
Dar a cada perfil um estilo visual padrão para cenas geradas por IA, com uma escolha opcional por vídeo que não altera o perfil nem as fotos dos personagens.

## Implementação
- Adicionar ao perfil os campos de estilo visual e descrição personalizada, preservando o isolamento atual por perfil e empresa.
- Adicionar ao vídeo um override opcional de estilo e sua descrição personalizada; vazio significa “usar o padrão do perfil”.
- Criar uma definição compartilhada dos estilos: Realista, Cartoon/Quadrinho, 3D/Pixar, Aquarela, Anime e Personalizado.
- Exibir o padrão na aba **Geração de vídeo** do perfil, com campo livre somente quando **Personalizado** estiver selecionado.
- Exibir a escolha por vídeo nos dois fluxos de IA: geração 100% IA e **Gerar vídeo por IA** dentro do vídeo próprio.
- Resolver no servidor o estilo efetivo (override do vídeo primeiro, padrão do perfil depois) e compor um bloco explícito no prompt enviado ao Gemini para todas as cenas e regenerações.
- Manter referências de avatar/personas intactas: o estilo define apenas como a cena é renderizada.
- Não aplicar estilo ao fluxo puro **Gravar eu mesmo**.

## Detalhes técnicos
- Migração aditiva em `profile_video_settings` e `jobs`, sem duplicar tabelas nem alterar as políticas existentes.
- Validação dos valores aceitos no servidor e limite para a descrição personalizada.
- O mesmo bloco de consistência visual será usado na geração inicial e ao regenerar uma cena, incluindo a instrução de manter o estilo em todo o vídeo e na série do perfil.
- Atualizar os tipos e consultas que carregam perfil e job para incluir os novos campos.

## Validação
- Confirmar que um perfil em **Cartoon/Quadrinho** produz um prompt de cena com essa direção visual.
- No mesmo perfil, definir o vídeo como **Realista** e confirmar que o prompt troca para realista sem alterar o padrão do perfil.
- Confirmar que as fotos principais das tags continuam sendo enviadas sem modificação.
- Verificar as telas em desktop e celular e a ausência de erros no preview.
