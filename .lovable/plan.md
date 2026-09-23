# Corrigir validação do modo Organizar roteiro

## Alteração
- Separar a validação do envio por modo no servidor.
- Em **Criar roteiro**, exigir somente `assunto` com ao menos 3 caracteres.
- Em **Organizar meu roteiro**, exigir somente `roteiroOrigem` com o conteúdo mínimo atual, sem validar `assunto`.
- Manter os limites máximos de texto e as mensagens amigáveis existentes.

## Validação
- Confirmar que um roteiro preenchido no modo Organizar é aceito sem `assunto`.
- Confirmar que o modo Criar continua bloqueado quando `assunto` está vazio ou curto.
- Verificar tipos e o resultado do build automático.

## Detalhes técnicos
Usar um schema discriminado pelo campo `modo`, evitando valores padrão que façam a validação de um modo atingir o outro.
