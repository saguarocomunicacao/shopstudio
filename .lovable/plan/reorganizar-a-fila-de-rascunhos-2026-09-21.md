# Reorganizar a fila de Rascunhos

## Objetivo
Separar claramente a criação de roteiros da etapa de gravação, mantendo o fluxo atual de revisão, aprovação e publicação.

## Mudanças na tela
- Reordenar e renomear as abas para: **Roteiros prontos**, **Aguardando revisão**, **Aprovados** e **Publicados**.
- Fazer **Roteiros prontos** abrir por padrão e listar somente vídeos próprios com roteiro gerado e ainda sem gravação salva.
- Manter vídeos completos de IA entrando diretamente em **Aguardando revisão**.
- Preservar os filtros do perfil ativo, os contadores e as permissões atuais.

## Novo cartão de gravação pendente
- Trocar o espaço preto por um cartão claro com ícone de câmera e estado **Pendente de gravação**.
- Mostrar título do roteiro e, quando disponível, o produto associado; sem produto, identificar o tema como vídeo próprio.
- Exibir a mensagem “Roteiro pronto. Falta gravar este vídeo.” e a orientação curta para usar o teleprompter pelo celular.
- Adicionar **Gravar vídeo** como ação principal, abrindo diretamente o estúdio, e **Ver roteiro** como ação secundária, abrindo o kit de roteiro.
- Manter a ação de excluir apenas para quem já possui permissão.

## Transição automática
- Reutilizar a transição existente ao salvar a gravação: o job passa para `video_pronto`, recebe a data de gravação e, após atualizar a lista, aparece em **Aguardando revisão**.
- Fechar corretamente o estúdio/modal após salvar para que a mudança de aba fique visível sem recarregar a página.

## Validação
- Conferir os quatro contadores e os estados vazios.
- Testar abertura separada do roteiro e do estúdio.
- Verificar em tamanhos de celular e desktop que o novo cartão permanece legível e que o fluxo respeita perfil e permissões.
