# Ícone do assistente e miniaturas da Visão geral

## O que será alterado
- Criar um `RobotIcon` reutilizável, com SVG próprio 24×24, traço arredondado, olhos, antena e sorriso.
- Usar o robô no botão flutuante, no cabeçalho e como avatar de cada resposta do assistente.
- Atualizar o botão flutuante para 52px, fundo magenta, ícone branco, sombra magenta suave e indicador ciano com borda do fundo da tela.
- Corrigir a cadeia de miniaturas de “Últimos jobs”: miniatura do vídeo, primeira cena aprovada, frame da gravação própria, foto do produto e placeholder.

## Diagnóstico e implementação
- Confirmar quais campos de miniatura chegam na consulta compartilhada de jobs e incluir os campos/caminhos assinados que estiverem ausentes.
- Priorizar cenas aprovadas sem impedir fallback para cenas antigas que não tenham o marcador `approved`.
- Para vídeo próprio sem produto, reaproveitar a miniatura extraída e salva durante a gravação; não gerar um novo frame na Visão geral.
- Manter dados, rotas e ações atuais; alterar apenas apresentação e obtenção da miniatura já existente.

## Validação
- Conferir o botão e o painel do assistente no tema escuro.
- Conferir “Últimos jobs” com vídeo pronto de IA, cena aprovada e gravação própria sem produto.
- Validar desktop e celular, além do resultado automático do projeto.
