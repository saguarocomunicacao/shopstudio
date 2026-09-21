# Corrigir interação do Enquadrar

## Objetivo
Manter o vídeo inteiro, parado e sem zoom enquanto a pessoa ajusta uma moldura de recorte por cima dele.

## Alterações
- Separar o preview de ajuste do Enquadrar do preview composto das outras ferramentas.
- Em **Enquadrar**, exibir o vídeo original completo e imóvel, com a moldura posicionada pelas coordenadas salvas.
- Escurecer somente as quatro áreas externas à moldura, deixando a seleção nítida.
- Fazer arraste e redimensionamento pelos quatro cantos respeitarem a proporção escolhida e os limites do vídeo.
- Reabrir uma edição com crop usando a mesma moldura salva, permitindo novos ajustes sem zoom ou perda.
- Manter **Aparar pontas** e **Tesoura** com o preview composto do crop já definido.
- Preservar o processamento atual: crop e cortes temporais são aplicados juntos, uma única vez, sobre o original ao clicar em **Aplicar edição**.

## Validação
- Testar arraste, redimensionamento e troca de proporção no preview.
- Confirmar visualmente que o vídeo não se move nem amplia na ferramenta Enquadrar.
- Verificar o cálculo do crop final e o build do projeto.
