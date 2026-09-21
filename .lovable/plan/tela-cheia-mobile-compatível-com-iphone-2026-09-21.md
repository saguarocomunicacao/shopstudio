# Tela cheia mobile compatível com iPhone

## Correção
- Remover a dependência da Fullscreen API e qualquer chamada a `requestFullscreen`/`exitFullscreen`.
- Usar uma camada fixa sobre toda a viewport para gravação, revisão, edição e processamento.
- Usar unidades de viewport dinâmica (`100dvh`) com fallback e respeitar as quatro safe areas do iOS.
- Travar a rolagem da página enquanto o ambiente estiver aberto e restaurá-la ao fechar.
- Manter o fechamento mobile retornando à lista de rascunhos; preservar o comportamento desktop.

## Validação
- Simular Safari mobile/iPhone com viewport, safe areas e ausência de Fullscreen API.
- Verificar gravação, revisão, editor, processamento e fechamento.
- Confirmar build e ausência de erros em execução.

## Limite da validação
- O ambiente automatizado usa Chromium e não substitui um iPhone físico; a compatibilidade com Safari será validada pela arquitetura sem Fullscreen API e pela simulação mobile disponível.
