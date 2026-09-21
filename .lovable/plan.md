# Melhorar aplicação e revisão da edição de vídeo

## Objetivo
Simplificar a espera durante a geração do vídeo editado e permitir conferir o resultado na tela de revisão antes de salvar.

## Alterações
- Substituir o editor inteiro, enquanto a edição é aplicada, por uma tela escura dedicada com mensagem “Aplicando edição...” e progresso circular com porcentagem.
- Manter a identidade visual do estúdio com as cores ciano e magenta, sem timeline, preview ou controles durante o processamento.
- Em caso de falha, retornar ao editor com a mensagem existente e preservar todos os cortes para nova tentativa.
- Ao concluir, fechar o editor e voltar automaticamente para “Revise sua gravação”, exibindo a nova versão editada.
- Adicionar um botão de play/pause sobre o vídeo da revisão, sem interferir em Salvar, Editar ou Regravar.
- Garantir que a revisão reproduza a versão ativa (editada quando existir, original caso contrário) sem alterar seu enquadramento.

## Validação
- Confirmar em desktop e mobile que, ao aplicar, somente a tela de progresso circular aparece.
- Confirmar que a conclusão volta à revisão com a versão editada pronta para reprodução.
- Testar play/pause na revisão com vídeo original e editado.
- Verificar compilação e ausência de erros no preview.
