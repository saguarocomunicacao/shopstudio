# Refazer o hero da landing

## Objetivo
Atualizar somente o primeiro bloco da página pública, mantendo as demais seções intactas e preservando a identidade escura do Shop Studio.

## Alterações
- Refinar a coluna de texto com badge menor, título de alta leitura, glitch limpo apenas em “vídeo pronto”, subtítulo e dois botões com brilho discreto.
- Reconstruir o mockup do celular com moldura realista 9:16, ilha dinâmica, cena ambiente full-bleed e sobreposição inspirada no TikTok Shop.
- Adicionar ações laterais, perfil, legenda, hashtags e etiqueta de produto dentro da tela.
- Reposicionar os três indicadores de pipeline fora da moldura, com vidro translúcido, cores por função e animações em ritmos diferentes.
- Ajustar o mobile para texto centralizado, celular abaixo e menos elementos flutuantes quando necessário.

## Detalhes técnicos
- Alterar apenas `src/routes/index.tsx` e os estilos semânticos da landing em `src/styles.css`.
- Usar os ícones já disponíveis no projeto e os tokens ciano, magenta, fundo, texto e borda existentes.
- Respeitar foco visível e `prefers-reduced-motion`.
- Validar visualmente em desktop e mobile, além de conferir a compilação.
