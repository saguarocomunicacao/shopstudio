# Transição e miniaturas dos Rascunhos

## Objetivo
Substituir o carregamento preto do estúdio por uma transição no padrão visual Shop Studio e garantir miniaturas reais nos cards com vídeo.

## Implementação
- Criar uma tela de preparação centralizada, com fundo escuro da marca, logo, anel ciano/magenta e texto contextual, usada ao carregar gravações salvas.
- Extrair no navegador um frame representativo do vídeo ativo, sem reencodar o vídeo.
- Salvar a imagem no armazenamento privado e associá-la ao rascunho quando a gravação for salva.
- Fazer o mesmo automaticamente para vídeos antigos sem miniatura quando eles aparecerem na fila, cobrindo o preenchimento retroativo.
- Enquanto a imagem é preparada, mostrar um placeholder visual da marca; manter o play usando o vídeo assinado do card.

## Validação
- Confirmar que “Gravar vídeo” abre a transição estilizada, sem tela preta simples.
- Confirmar card com imagem real antes do play e reprodução direta no card.
- Verificar carregamento, falha segura, desktop/mobile, tipos e build.

## Detalhes técnicos
A miniatura será JPEG, extraída de um frame após o início do vídeo e enviada por URL temporária. O arquivo do vídeo não será alterado. O preenchimento retroativo será idempotente: itens que já têm miniatura não serão reprocessados.
