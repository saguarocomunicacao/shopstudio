# Timeline visual com miniaturas no editor

## Objetivo
Substituir a barra sólida da timeline por uma tira leve de frames do próprio vídeo, sem alterar o funcionamento atual de aparar, tesoura, enquadrar ou aplicar a edição a partir do original.

## Implementação
- Extrair no navegador entre 8 e 15 miniaturas de baixa resolução, conforme a largura disponível da timeline, distribuídas uniformemente pela duração.
- Fazer a extração de forma assíncrona e sequencial, liberando a interface entre frames e cancelando o trabalho ao trocar o vídeo ou fechar o editor.
- Manter a barra atual como placeholder e preencher cada posição à medida que sua miniatura ficar pronta.
- Renderizar a mesma filmstrip como base visual nos modos **Aparar pontas** e **Tesoura**.
- Em **Aparar pontas**, manter os handles existentes sobre os frames, escurecer as áreas externas e destacar visualmente o trecho preservado.
- Em **Tesoura**, destacar sobre os frames a seleção temporária e os cortes internos já adicionados.
- Manter o playhead atual sobre toda a tira e preservar clique para navegar, arraste dos handles, múltiplos cortes, desfazer e aplicação final.

## Desempenho e compatibilidade
- Usar um elemento de vídeo auxiliar e canvas pequeno, sem reencodar e sem interferir no player principal.
- Limitar quantidade, dimensões e qualidade das imagens; processar uma por vez para reduzir memória e travamentos no celular.
- Recalcular apenas quando o vídeo ou a faixa de quantidade necessária mudar, com limpeza das URLs/imagens geradas.

## Validação
- Confirmar carregamento progressivo dos frames e placeholder inicial.
- Testar visualmente Aparar pontas e Tesoura em desktop e mobile, incluindo escurecimento, seleção, cortes e playhead.
- Confirmar que seek, handles, reprodução, desfazer e aplicação continuam funcionando.
- Verificar tipos, compilação e ausência de erros no preview.
