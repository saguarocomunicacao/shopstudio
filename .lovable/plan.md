# Corrigir controles e layout do estúdio mobile

## Alterações
- Manter play/pausa, velocidade e retorno ao início sempre visíveis, agrupados à esquerda, com gravar/parar alinhado à direita.
- Fazer “voltar ao início” zerar a posição visual, o acumulador interno e o timestamp do ciclo, para a próxima reprodução começar realmente do topo.
- Sincronizar velocidade e tamanho do texto em tempo real entre o painel, o teleprompter e o ciclo de animação, sem valores antigos capturados.
- Fixar a interface do estúdio ao viewport e aplicar a proporção escolhida somente ao vídeo/canvas, mantendo os painéis e controles na mesma posição em todos os formatos.

## Validação
- Testar em viewport mobile os controles antes da gravação, pausa → início → play e mudanças de velocidade/fonte em execução.
- Alternar entre 9:16 e 1:1 com “Ajustes da câmera” aberto e confirmar que somente o enquadramento muda.
- Confirmar compilação e ausência de erros no preview.
