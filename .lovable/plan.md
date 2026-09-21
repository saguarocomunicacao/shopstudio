# Ajustes mobile do estúdio e dos roteiros

## Diagnóstico confirmado no código atual
- O teleprompter tem altura e `overflow-y-auto`, portanto existe área rolável. O problema principal não é falta de conteúdo ou de overflow.
- O estúdio mantém dois loops `requestAnimationFrame` independentes na mesma tela: um para o vídeo/canvas (até 30 FPS, incluindo filtros e suavização facial) e outro para o scroll. No celular, ambos disputam a thread principal; o loop do texto ainda limita cada avanço a 50 ms, então, quando os quadros atrasam, a rolagem perde distância e parece congelada.
- O navegador pausa `requestAnimationFrame` ao ocultar a aba. Há uma tentativa de retomada, mas ela só conhece o frame do scroll, não o loop visual concorrente; por isso uma remontagem/reload pode mascarar o estado travado.
- O formato já é salvo por perfil e o canvas já usa recorte central, mas o seletor está escondido em “Geração de vídeo”, fora do estúdio. Além disso, as classes do quadro vertical combinam altura total e limite de largura, o que pode ocupar a tela como se fosse expandida no celular, em vez de mostrar claramente a moldura 9:16.

## Implementação
1. Unificar a animação do preview e do teleprompter em um único ciclo, com delta de tempo real, retomada após troca de aba, reinício controlado e limpeza completa ao fechar.
2. Garantir que a área do teleprompter tenha geometria estável no mobile e role automaticamente do início para cima durante a gravação.
3. Exibir sobre o vídeo controles grandes e discretos para diminuir/aumentar velocidade, pausar/continuar e voltar ao início.
4. Expor o formato dentro dos ajustes do estúdio, mantendo 9:16 como padrão e salvando a escolha no perfil. Aplicar imediatamente a mesma proporção e o mesmo recorte central ao preview, à gravação e à revisão.
5. Corrigir a moldura mobile para respeitar a proporção escolhida sem expandir ou criar tarjas no arquivo.
6. Nos cards pendentes, colocar badge e lixeira na mesma linha, com a lixeira à direita.
7. No modal de roteiro, empilhar orientação e fala em largura total no mobile; deixar tempo e remoção na primeira linha, com ícone vermelho. Preservar o layout confortável no desktop.
8. Validar compilação e, em viewport mobile, conferir controles, proporções 9:16 e 1:1, card e modal.
