# Reorganizar Planos, Empresas e Créditos por ação

## Escopo

- Criar o menu administrativo **Planos** e retirar Planos de Configurações.
- Transformar **Aprovações** em **Empresas**, mantendo aprovação e adicionando gestão de plano e redefinição de senha.
- Ajustar **Créditos por ação** para o mesmo padrão visual responsivo de Tarifas de custo.
- Preservar integralmente cálculos, cobrança, créditos e permissões existentes.

## Implementação

### Planos
- Criar a rota de catálogo com tabela compacta e linhas expansíveis.
- Mostrar nome, fonte das chaves, estado e quantidade de empresas vinculadas.
- Disponibilizar Editar, Ativar/desativar e Remover conforme as permissões atuais.
- Criar uma rota de detalhe dedicada para novo plano e edição.
- Na tela de detalhe, manter nome, fonte das chaves, ativo e a matriz das 12 ações com quantidade mensal incluída e valores monetários mascarados em R$.
- Remover o bloco de atribuição de empresas e planos desse catálogo.

### Empresas
- Renomear o menu e a rota visível de Aprovações para Empresas, sem duplicar a área administrativa.
- Criar tabela expansível com e-mail, empresa, plano, status e cadastro, incluindo filtro por status e destaque para pendências.
- No detalhe expandido, manter Aprovar/Recusar, permitir atribuir plano e disparar o e-mail seguro de redefinição de senha.
- Exibir aviso de que senhas não podem ser visualizadas.

### Créditos por ação
- Substituir os cartões cinza por linhas e colunas equivalentes às Tarifas de custo.
- Dar aos campos editáveis fundo e borda de entrada ativa.
- Ajustar a distribuição das colunas e rolagem horizontal para telas menores.

## Validação

- Verificar permissões administrativas, navegação e metadados das novas páginas.
- Confirmar criação/edição de plano, expansão das tabelas, filtro de empresas, atribuição de plano e disparo do reset.
- Conferir Planos, Empresas e Créditos por ação em desktop e celular, sem alterar resultados financeiros.
