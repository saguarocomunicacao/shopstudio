# Remover vídeos “Gravar eu mesmo”

## Objetivo
Permitir excluir permanentemente um vídeo do tipo “Gravar eu mesmo” diretamente na lista de Rascunhos.

## Alterações
- Adicionar uma ação de excluir no cartão do vídeo, visível apenas para quem pode editar o perfil.
- Exibir uma confirmação clara antes da exclusão para evitar remoções acidentais.
- Ao confirmar, remover o job e o arquivo gravado associado, quando existir.
- Atualizar imediatamente as listas de Rascunhos, Vídeos e Pipeline após a exclusão.
- Manter os demais fluxos e tipos de vídeo inalterados.

## Segurança e validação
- Validar no servidor a sessão e a permissão de edição do perfil antes de excluir.
- Impedir que um usuário exclua vídeos de perfis sem acesso.
- Verificar o fluxo na tela em desktop e celular e confirmar a compilação sem erros.
