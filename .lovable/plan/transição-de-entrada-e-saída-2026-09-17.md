# Transição de entrada e saída

## Objetivo
Criar uma experiência moderna entre a tela de acesso e o painel, sem alterar o fluxo de autenticação.

## Implementação
- Adicionar uma tela de transição em tela cheia com a marca Shop Studio, indicador animado e mensagens curtas de progresso.
- Exibir a transição após o login ser confirmado, antes de abrir o painel.
- Exibir uma versão de despedida ao clicar em “Sair”, concluindo o logout antes de voltar para `/entrar`.
- Substituir o carregamento simples inicial do painel pela mesma linguagem visual.
- Bloquear cliques repetidos durante as transições e manter mensagens de erro na tela de acesso quando necessário.
- Respeitar a preferência de movimento reduzido e adaptar o visual para celular e desktop.

## Detalhes técnicos
- Criar um componente reutilizável para os estados `entrando`, `saindo` e `carregando`.
- Usar os logotipos claro/escuro existentes e os tokens magenta/ciano da marca.
- Manter autenticação, permissões e redirecionamentos atuais intactos.
- Validar compilação e testar visualmente login/logout no navegador quando houver sessão disponível.
