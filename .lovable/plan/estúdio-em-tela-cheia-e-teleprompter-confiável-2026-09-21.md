# Estúdio em tela cheia e teleprompter confiável

## Objetivo
Manter o vídeo vertical 9:16 no maior tamanho possível, com todos os comandos sobrepostos, e eliminar os travamentos da rolagem do teleprompter.

## Alterações
- Transformar o estúdio em uma tela cheia real: o quadro 9:16 ocupa toda a altura disponível, centralizado no desktop e preenchendo o celular sem ser reduzido por barras externas.
- Sobrepor título, fechar, cronômetro, gravar/parar e rolar/pausar diretamente no vídeo, posicionados para preservar a área central do rosto.
- Criar dois acessos flutuantes:
  - **Ajustes:** filtro, suavizar pele, intensidade, redução de ruído e troca de câmera.
  - **Texto:** velocidade, tamanho da fonte e espelhamento.
- Abrir essas opções em painéis inferiores sobre o vídeo, com fundo escurecido; tocar fora fecha o painel sem encerrar ou alterar a gravação.
- Manter a revisão também em tela cheia, com Salvar e Regravar sobrepostos ao vídeo final.

## Correção do teleprompter
- Centralizar o controle da animação em um único controlador com `requestAnimationFrame`, estado corrente em referências e cancelamento explícito antes de qualquer novo início.
- Calcular cada avanço por timestamp, tempo decorrido e velocidade, limitando apenas o salto causado por aba em segundo plano.
- Tornar iniciar, pausar, retomar e reiniciar do topo operações determinísticas, inclusive após chegar ao fim.
- Sincronizar rolagem manual e automática sem criar loops concorrentes.
- Tratar mudança de visibilidade da aba: descartar o timestamp antigo ao voltar, sem salto, e manter o botão capaz de retomar imediatamente.
- Cancelar completamente a animação ao desmontar o estúdio; abrir ou fechar os painéis não deixará o loop em estado morto.

## Desempenho
- Separar o loop do teleprompter do processamento da câmera.
- Limitar a renderização do quadro da câmera à frequência útil da gravação.
- Reduzir a frequência da detecção facial e reutilizar os últimos pontos detectados entre análises, preservando o efeito visual com menos bloqueio da tela.
- Manter o desligamento seguro da suavização em aparelhos lentos, sem interromper câmera, áudio ou gravação.

## Validação
- Conferir início, pausa e retomada repetidos; fim do texto e reinício; troca de aba e retorno.
- Repetir com suavização desligada e ligada.
- Verificar o layout e os painéis em viewport de celular e desktop, além de gravação, revisão, filtros e controles existentes.
