# Plano de implementação

## Segurança de planos
- Restringir a leitura de planos no banco: backoffice vê o catálogo completo; cada empresa vê somente seu plano atribuído.
- Preservar as regras atuais de escrita e a leitura da matriz de preços somente do próprio plano.

## Reset administrativo
- Criar uma função protegida no servidor que autentica a sessão, confirma a permissão de backoffice no banco e somente então solicita o e-mail de redefinição.
- Trocar o botão da tela Empresas para usar essa função, mantendo o aviso de que senhas não podem ser exibidas.

## Proteção das páginas
- Adicionar uma verificação de backoffice antes da renderização de Empresas, Planos, detalhes de plano e Configurações.
- Revisar outras páginas internas para aplicar a mesma proteção somente onde o acesso já é exclusivamente backoffice.
- Redirecionar usuários sem permissão ao painel.

## Validação
- Confirmar as políticas finais no banco e testar as páginas e a ação com sessão administrativa.
- Quando houver uma conta Admin comum disponível, validar leitura limitada, redirecionamentos e rejeição do reset; caso contrário, registrar claramente a parte não verificada.
