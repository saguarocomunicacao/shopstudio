# Corrigir o título/gancho do kit de postagem

## Resultado
- Adicionar um campo próprio para o gancho em cada job.
- Salvar o gancho gerado pela IA sem alterar o CTA final.
- Fazer o kit e o detalhe do Pipeline usarem o mesmo extrator de fallback para jobs antigos.
- Preencher o novo campo nos jobs existentes a partir do roteiro salvo.
- Validar especificamente o kit do vídeo do pincel.

## Implementação
- Criar uma migração aditiva com `jobs.hook TEXT` e backfill que ignora o rótulo `GANCHO (0-3s)` e captura a frase seguinte.
- Centralizar o parser em um utilitário compartilhado e remover as duas implementações divergentes.
- Na geração do roteiro, persistir `generated.hook` em `jobs.hook`; manter `generated.cta` em `jobs.post_cta`.
- Carregar `hook` nas consultas do Pipeline e da Fila de Rascunhos, usando parsing somente quando o campo estiver vazio.
- Conferir tipos, integridade da aplicação e o valor exibido no job do pincel.
