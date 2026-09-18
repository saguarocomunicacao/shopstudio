# Corrigir CTA e campos do kit de postagem

## Implementação
- Criar um parser compartilhado para extrair a seção CTA do roteiro, ignorando o rótulo e marcações de tempo.
- Manter a gravação de `generated.cta` em `jobs.post_cta` e usar o parser como fallback para jobs antigos.
- Preencher `post_cta` dos jobs existentes que ainda estejam vazios, incluindo o vídeo do pincel.
- Padronizar título/gancho, CTA, legenda e hashtags com fundo branco, borda sutil e espaçamento consistente no kit e no detalhe do Pipeline.

## Validação
- Conferir o CTA do pincel na tela Rascunhos.
- Verificar visualmente os quatro campos e confirmar que o aplicativo compila sem erros.
