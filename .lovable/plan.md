# Corrigir preview composto e fullscreen mobile

## Objetivo
- Fazer o preview do editor respeitar sempre o reenquadramento salvo e os cortes temporais, em qualquer ferramenta.
- Manter os controles da moldura visíveis somente em “Enquadrar”.
- Abrir gravação, revisão e edição em tela cheia no celular, sem alterar o desktop.
- Ao fechar o estúdio ou editor no celular, sair da tela cheia e retornar à lista de rascunhos.

## Implementação
- Separar a superfície visual do preview da superfície de ajuste: o vídeo será recortado visualmente sempre que houver crop; na aba “Enquadrar”, uma camada sobre o quadro permitirá mover e redimensionar a seleção usando as coordenadas do original.
- Preservar o salto imediato dos trechos removidos durante a reprodução, independentemente da ferramenta ativa.
- Criar um controle de fullscreen móvel com detecção responsiva, entrada após o gesto de “Gravar vídeo”, tratamento de navegadores sem suporte e saída segura ao fechar.
- Ajustar o fechamento do editor para encerrar todo o ambiente de gravação no mobile e voltar à fila; no desktop, manter o retorno atual à revisão.

## Validação
- Verificar crop salvo ao abrir e alternar entre Aparar pontas, Tesoura e Enquadrar.
- Verificar crop + tesoura durante a reprodução e ao reabrir o editor.
- Verificar abertura/fechamento em viewport mobile e confirmar que o desktop não força fullscreen.
- Confirmar build e ausência de erros em execução.
