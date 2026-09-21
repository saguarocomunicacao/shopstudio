# Plan: Conteúdo textual sempre visível

## Objetivo
Garantir que todo conteúdo textual de vídeos e jobs apareça integralmente nos modais e telas, sem truncamento nem rolagem interna pequena.

## Alterações
- Mapear os campos textuais dos modos Completo e Gravar eu mesmo.
- Substituir campos editáveis potencialmente longos por textareas com crescimento automático.
- Remover cortes, reticências, limites de linhas e rolagem interna dos campos somente leitura.
- Manter a rolagem vertical no contêiner do modal e preservar edição e cópia.
- Validar os principais modais em tela ampla e celular, sem alterar regras de negócio.

## Detalhes técnicos
- Reaproveitar ou criar um textarea autoajustável compatível com os controles existentes.
- Preservar estados, callbacks, permissões e botões atuais.
- Verificar compilação e renderização após as mudanças.
