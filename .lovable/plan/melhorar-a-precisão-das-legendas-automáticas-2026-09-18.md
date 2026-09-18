# Melhorar a precisão das legendas automáticas

## Objetivo
Manter a transcrição automática palavra a palavra do JSON2Video, adicionando vocabulário específico de cada job para preservar nomes de produto, marca e termos estrangeiros.

## Implementação
- Criar uma função compartilhada e testável que monte `keywords` e `replace` a partir do nome do produto, vendedor/marca e narrações das cenas.
- Priorizar frases comerciais completas e palavras com sinais de termo estrangeiro ou nome próprio; normalizar, remover duplicados e limitar o tamanho enviado.
- Incluir correções fonéticas úteis derivadas dos termos conhecidos, sem substituir palavras comuns de forma ampla.
- Passar `keywords` e `replace` nas configurações do elemento `subtitles`, preservando modelo, idioma, estilo e sincronização automática atuais.
- Ampliar a leitura do produto na montagem para incluir `seller_name`, sem alterar pipeline, voz, custo ou armazenamento.

## Validação
- Testar a função com “Silicone Brush da Océane” e confirmar que o payload contém `Silicone Brush`, `Brush` e `Océane`.
- Validar o payload enviado ao JSON2Video e a compilação do aplicativo.
- Regerar a montagem do job do pincel, sem refazer imagens, takes ou narração, e conferir o resultado final da legenda. Essa renderização pode gerar cobrança de montagem no JSON2Video.

## Fora do escopo
- Não trocar por SRT/ASS.
- Não adicionar edição manual de legenda nesta etapa, conforme o item opcional.
