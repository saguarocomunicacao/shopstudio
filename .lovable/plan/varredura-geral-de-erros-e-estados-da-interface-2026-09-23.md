# Varredura geral de erros e estados da interface

## Tratamento centralizado
- Criar um único formatador de erro para a interface.
- Extrair somente a primeira mensagem legível de erros de validação, inclusive quando chegam serializados pelo servidor.
- Reconhecer mensagens técnicas de banco, HTTP, fornecedor, stack trace e objetos serializados, substituindo-as por um texto amigável adequado à ação.
- Preservar mensagens de negócio já escritas para pessoas, como falta de saldo, permissão ou campo obrigatório.
- Manter o erro original disponível apenas nos registros técnicos.

## Pontos de interface
- Substituir usos diretos de `error.message` em avisos, formulários e modais pelo formatador comum.
- Fazer os handlers já existentes usarem o mesmo formatador, sem duplicar regras.
- Traduzir a tela global de erro inesperado e manter as opções de tentar novamente e voltar.
- Padronizar mensagens específicas para geração de cena/vídeo, voz, produtos, conta, empresas, equipe, automação, planos e investimento.

## Servidor e fornecedores
- Nos pontos de integração que hoje devolvem corpo HTTP ou mensagem técnica, registrar o detalhe no servidor e lançar somente uma mensagem segura para a interface.
- Não alterar modelos, prompts, cálculos, cobranças, permissões ou sequência dos fluxos.
- Preservar mensagens úteis de bloqueio que já fazem parte das regras do produto.

## Estados principais
- Revisar Rascunhos, Vídeos, Produtos, Custos, Automação, Planos e Empresas.
- Garantir estado de carregamento, vazio e falha legível em cada uma, sem tratar falha como lista vazia.
- Proteger acessos a dados opcionais para evitar quebra quando a resposta estiver vazia.

## Validação e relatório
- Testar o formatador com erro Zod real, erro Zod serializado, erro HTTP/fornecedor e exceção desconhecida.
- Verificar tipos, build e as telas principais no navegador.
- Entregar um relatório por categoria com cada vazamento ou ausência encontrada e a correção aplicada.
