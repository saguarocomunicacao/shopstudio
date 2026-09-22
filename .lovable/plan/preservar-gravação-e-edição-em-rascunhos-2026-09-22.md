# Preservar gravação e edição em rascunhos

## Objetivo
Evitar perda de gravações ou edições ao fechar e permitir continuar exatamente de onde a pessoa parou.

## Alterações
- Detectar gravação, versão editada ou operações ainda não salvas ao fechar o estúdio ou editor.
- Mostrar o alerta com **Salvar como rascunho**, **Sair sem salvar** e **Continuar editando**.
- Reutilizar o salvamento privado atual para guardar o original, a versão ativa e a lista de operações no job.
- Manter o rascunho na fila e permitir abrir novamente o estúdio com o vídeo original e as operações carregadas.
- Ao editar novamente, sempre gerar a próxima versão a partir do original preservado.
- Manter a opção de regravar e o comportamento atual no desktop e mobile.

## Validação
- Verificar tipos e build.
- Testar o alerta de fechamento nas etapas de revisão e edição.
- Testar salvamento e retomada de um rascunho com cortes e enquadramento preservados.
