# Fidelidade da pessoa de referência

## Objetivo
Aumentar a preservação exata da identidade da pessoa nas cenas do Gemini, sem alterar as demais etapas do pipeline.

## Alterações
- Substituir a instrução atual por um bloco forte e destacado de preservação de identidade.
- Enviar primeiro todas as referências disponíveis da pessoa, até três, e depois a foto do produto.
- Aplicar a mesma ordem e instrução tanto na geração inicial quanto na regeneração de uma cena.
- Só adicionar parâmetros de aderência/criatividade se forem oficialmente suportados pelo endpoint e modelo atuais.

## Validação
- Confirmar que os dois caminhos de geração usam até três fotos da pessoa.
- Verificar compilação e erros da aplicação.
- Testar uma chamada real do Gemini se houver uma configuração utilizável no ambiente, sem expor credenciais.
