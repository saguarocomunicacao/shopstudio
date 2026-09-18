# Textos editáveis no vídeo pronto

## Objetivo
Separar claramente o que pode ser ajustado sem custo para a postagem do conteúdo já usado para montar e narrar o vídeo.

## Alterações
- Adicionar ao job um campo próprio para **CTA/título de publicação**, sem reutilizar nem alterar o título interno do job ou o roteiro narrado.
- No detalhe do Pipeline, para `video_pronto` e `rascunho_enviado`:
  - criar a seção **Textos para postar** com CTA/título, legenda e hashtags editáveis;
  - salvar esses três campos sem regeneração e sem custo;
  - criar a seção **Conteúdo gerado (referência)** com roteiro somente leitura, aviso sobre custo e cenas/vídeo sem controles de edição;
  - manter aprovação, compartilhamento, download e demais ações atuais.
- Na Fila de Rascunhos:
  - trocar os blocos apenas de cópia por campos editáveis de CTA/título, legenda e hashtags;
  - adicionar **Salvar** e manter os botões de copiar;
  - exibir o roteiro narrado como somente leitura e explicar que mudanças exigem voltar a etapa e regenerar;
  - manter edição disponível também em `rascunho_enviado`; em `publicado`, exibir os valores salvos sem edição.
- Proteger a gravação no servidor: aceitar alterações somente antes de `publicado` e validar tamanho/conteúdo.

## Verificação
- Conferir salvamento e recarga nos dois locais.
- Confirmar que o roteiro e as cenas não podem ser alterados em `video_pronto`/`rascunho_enviado`.
- Validar estados mobile/desktop e ausência de erros na prévia.

## Detalhes técnicos
- Migração aditiva em `jobs` para o CTA/título de publicação, preservando todos os jobs existentes.
- Função autenticada para atualizar somente os três textos de postagem, respeitando o acesso ao job pelo banco.
- O roteiro em `script` nunca será atualizado por essa ação.
