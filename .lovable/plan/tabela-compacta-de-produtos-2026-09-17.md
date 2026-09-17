# Tabela compacta de produtos

## Objetivo
Reestruturar as listas de Catálogo e Descobrir para exibir mais informação com alinhamento consistente, detalhes expansíveis e boa leitura em telas menores.

## Alterações
- Criar uma apresentação compartilhada para produtos, evitando diferenças visuais entre as duas abas.
- No desktop, usar colunas independentes para expansão, foto, produto, nicho, preço, comissão, hype e ações.
- Exibir miniatura de 48 px e um placeholder com ícone quando não houver imagem.
- Truncar o nome em uma linha, preservando o nome completo em tooltip.
- Calcular e mostrar o ganho unitário em reais abaixo do percentual de comissão.
- Permitir expandir várias linhas ao mesmo tempo para ver nome, categoria, vendas, crescimento, link e cálculo detalhado da comissão.
- Em telas menores, transformar cada item em card compacto, mantendo expansão, tooltip e ações.
- Preservar busca, seleção/salvamento, edição, remoção e criação de job já existentes.

## Validação
- Conferir Catálogo e Descobrir em desktop e celular.
- Verificar alinhamento, truncamento, expansão simultânea, imagens ausentes e cálculos em BRL.
- Confirmar que a aplicação continua sem erros.
