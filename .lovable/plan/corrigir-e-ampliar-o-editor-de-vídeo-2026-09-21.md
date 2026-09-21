# Corrigir e ampliar o editor de vídeo

## Objetivo
Entregar um editor responsivo e estável no estúdio “Gravar eu mesmo”, com preview sem distorção, timeline organizada e dois tipos de edição: aparar pontas e remover um ou mais trechos internos.

## Alterações
- Reorganizar o editor em uma sobreposição de tela inteira com cabeçalho, área de vídeo central limitada pelo espaço disponível e painel inferior fixo para timeline e ações, respeitando áreas seguras no celular.
- Manter a proporção original do vídeo no preview com `object-fit: contain`, limites explícitos de largura/altura e isolamento da timeline para impedir vazamento ou sobreposição.
- Adicionar controles próprios de reproduzir/pausar e posicionamento na timeline, mantendo Desfazer e Aplicar sempre legíveis em desktop e mobile.
- Criar dois modos claros na timeline: **Aparar pontas**, com os dois marcadores atuais, e **Tesoura**, com seleção de início/fim do trecho a remover.
- Permitir adicionar vários cortes internos, exibi-los visualmente na timeline e remover/desfazer cortes antes de aplicar.
- Normalizar e validar os intervalos para impedir sobreposição, cortes fora do trecho aparado ou resultado vazio.
- Ampliar o pipeline de operações para aplicar o trim e os cortes internos sobre o original; no caminho de tesoura, usar filtros do ffmpeg.wasm para manter os segmentos restantes e concatenar vídeo e áudio numa única saída.
- Preservar o arquivo original e salvar a nova versão editada em paralelo, mantendo “Restaurar original”.

## Validação
- Adicionar testes unitários para duração resultante, normalização de múltiplos cortes e argumentos/filtros do ffmpeg.
- Executar um corte real apenas das pontas e outro removendo trecho do meio, validando duração e reprodução do resultado.
- Verificar visualmente o editor em desktop e mobile: vídeo centralizado e sem esticar, timeline abaixo, ações acessíveis e sem sobreposição.
- Confirmar compilação e ausência de erros no preview.

## Detalhes técnicos
- O preview continuará lendo o Blob original; as operações serão uma lista serializável de `trim` e múltiplos `cut`.
- Para tesoura, os intervalos mantidos serão calculados após o trim e concatenados por `trim/atrim + setpts/asetpts + concat`, com fallback apropriado quando não houver áudio.
- A edição será sempre gerada do original, evitando perdas acumuladas e mantendo restauração integral.
