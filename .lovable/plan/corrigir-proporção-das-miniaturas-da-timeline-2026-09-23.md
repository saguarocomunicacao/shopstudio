# Corrigir proporção das miniaturas da timeline

## Objetivo
Fazer cada frame do filmstrip respeitar a proporção real do vídeo, inclusive 9:16, sem alterar playhead, alças ou marcações.

## Implementação
- Ler a proporção do vídeo durante a extração dos frames e gerar cada imagem nessa proporção, sem recorte ou distorção.
- Calcular quantas miniaturas cabem pela altura fixa da timeline e pela largura real de cada frame.
- Distribuir os frames lado a lado, centralizados quando necessário, mantendo o mesmo filmstrip compartilhado por Aparar pontas e Tesoura.
- Validar visualmente com um vídeo vertical e conferir o build automático.

## Detalhes técnicos
A altura da tira permanece fixa. A largura de cada miniatura será derivada de `videoWidth / videoHeight`, e a quantidade será limitada pelo espaço disponível, sem usar `flex: 1` para esticar imagens.
