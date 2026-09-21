# Adicionar ferramenta Enquadrar ao editor

## Interface
- Adicionar a terceira ferramenta **Enquadrar** ao lado de Aparar pontas e Tesoura.
- Exibir opções 9:16, 1:1, 4:5 e 16:9.
- Sobrepor ao vídeo uma moldura proporcional, arrastável e redimensionável por alças, com área externa escurecida.
- Manter interação por toque e mouse, sem alterar o layout do editor em telas pequenas ou grandes.
- Mostrar aviso discreto quando a seleção exigir ampliação relevante e puder perder nitidez.

## Edição e persistência
- Registrar o crop em coordenadas relativas ao vídeo original, preservando o original e o histórico de operações.
- Refletir o enquadramento imediatamente no preview, sem chamar FFmpeg durante ajustes.
- Incluir o crop junto do trim e dos cortes internos ao clicar em **Aplicar edição**.

## Processamento final
- Converter as coordenadas relativas para pixels pares da fonte original.
- Combinar `trim`/`concat`, `crop` e `scale` em uma única execução FFmpeg, com saída 1080×1920, 1080×1080, 1080×1350 ou 1920×1080 conforme a proporção.
- Preservar áudio sincronizado e manter o fallback para vídeos sem áudio e a tela circular de progresso existente.

## Validação
- Testar interação responsiva da moldura no desktop e mobile.
- Executar um crop central 9:16 combinado com corte de tesoura sobre vídeo com áudio.
- Validar proporção, resolução, duração e sincronismo do arquivo final, além da compilação do app.
