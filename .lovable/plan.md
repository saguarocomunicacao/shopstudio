# Formato configurável do estúdio

## O que será alterado
- Adicionar “Formato de gravação” nas configurações de vídeo de cada perfil, visível e editável pelas mesmas permissões já usadas para editar o perfil.
- Oferecer 9:16 (TikTok/Reels/Shorts), 1:1, 4:5 e 16:9, mantendo 9:16 como padrão para perfis novos e existentes.
- Fazer o estúdio carregar a escolha do perfil do job e aplicar a mesma proporção ao preview, recorte central, gravação e revisão.
- Manter filtros de cor, suavização de pele, áudio e teleprompter funcionando em todos os formatos, sem tarjas pretas.

## Dados e segurança
- Adicionar um campo validado à configuração de vídeo do perfil, com valor padrão `9:16` e restrição às quatro opções permitidas.
- Reutilizar as políticas atuais da configuração por perfil; não haverá configuração global nem acesso adicional de backoffice.

## Detalhes técnicos
- Generalizar o canvas hoje fixo em 1080×1920 para dimensões proporcionais: 1080×1920, 1080×1080, 1080×1350 e 1920×1080.
- Generalizar o cálculo de recorte `cover` para as dimensões escolhidas e usar essas mesmas dimensões no canvas capturado pelo gravador.
- Ajustar o contêiner visual do estúdio dinamicamente para reproduzir exatamente a proporção final.
- Validar a configuração 9:16 e 1:1 no navegador, incluindo preview, ações do estúdio e metadados do arquivo quando o ambiente permitir câmera virtual.
