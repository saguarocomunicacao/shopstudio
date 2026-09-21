# Corrigir o modo “Gravar eu mesmo”

## Objetivo
Eliminar a repetição do gancho, iniciar a rolagem do teleprompter junto com a gravação e garantir o fluxo gravar → revisar → salvar → reproduzir/baixar.

## Alterações
- Atualizar o prompt global de `roteiro_gravacao` por migração, preservando o sistema de override por perfil, para que o gancho seja a primeira fala e os blocos comecem depois dele.
- Normalizar a comparação de textos e ocultar, na exibição e no teleprompter, blocos cuja fala seja igual ou quase igual ao gancho, incluindo roteiros antigos.
- Refazer o controle de rolagem com animação contínua baseada no tempo, iniciada junto da gravação, pausável, retomável, ajustável e parada no final.
- Tornar explícitos os estados de câmera, gravação e revisão; ao parar, aguardar o `MediaRecorder`, montar o Blob, desligar todas as tracks e mostrar somente o vídeo gravado.
- Manter o Blob local durante falhas de envio para permitir nova tentativa; “Regravar” descarta o Blob e religa a câmera; fechar o estúdio sempre libera câmera, microfone e URL temporária.
- Enviar o formato e extensão compatíveis produzidos pelo navegador, concluir o vínculo com o job somente após upload bem-sucedido e manter o player/download do arquivo salvo na fila.

## Validação
- Cobrir deduplicação e construção do teleprompter com testes unitários.
- Validar compilação e erros do preview.
- Simular câmera e `MediaRecorder` em viewport móvel, verificando transições, rolagem, revisão, nova tentativa e encerramento das tracks.
- Validar os caminhos de compatibilidade usados por Chrome Android e Safari iOS; a confirmação física final de captura depende desses aparelhos reais.
