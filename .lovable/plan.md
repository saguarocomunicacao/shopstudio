# Melhorias no detalhe do job

## Implementação
- Tornar cada miniatura de cena clicável e abrir uma visualização em tela cheia, mantendo a imagem vertical 9:16 bem enquadrada.
- Adicionar navegação por setas na tela e no teclado, fechamento por Escape e indicador da posição atual.
- Reutilizar a regeneração existente dentro da visualização, incluindo a descrição editável da cena; a aprovação individual será um estado visual de revisão compartilhado entre a miniatura e o lightbox, sem mudar o disparo atual da geração do vídeo.
- Reestruturar o Histórico em uma tabela com as colunas Etapa, Início, Fim e Duração, preservando a ordem cronológica e destacando a etapa em andamento em magenta.
- Validar a interação e o enquadramento em desktop e celular.

## Detalhes técnicos
- O lightbox será implementado com o diálogo e botões do sistema visual existente, incluindo foco acessível e atalhos de teclado.
- A regeneração continuará chamando a mesma ação atual e atualizando os dados do job.
- A tabela reutilizará os elementos de tabela já usados no projeto e terá rolagem horizontal segura em telas estreitas.
