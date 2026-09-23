# Reforma de planos por quantidade — Etapa A

## Objetivo
Adequar o cadastro e a apresentação dos planos ao modelo de compra de quantidades sem expiração, sem criar carteira, saldo ou débito nesta etapa.

## Alterações
- Manter as 12 ações existentes e usar apenas `unit_price_cents` como preço de compra de uma unidade.
- Retirar da tela de Planos todos os campos, resumos e textos de franquia mensal, quantidade incluída, excedente, ciclo e renovação.
- Preservar as colunas antigas no banco apenas como compatibilidade temporária, gravando nelas os valores neutros atuais quando necessário.
- Atualizar Minha conta para consultar somente o nome do plano e seus preços unitários, explicando que as quantidades compradas não expiram.
- Simplificar `recordConsumo` para registrar sempre o preço unitário vigente e `billing_mode = unitario`, sem consultar consumo mensal e sem debitar saldo.
- Não alterar tetos da Automação, orçamento mensal das Configurações nem Investimento.

## Validação
- Conferir Planos e Minha conta em desktop e mobile.
- Confirmar que não há referência visual a franquia, excedente, ciclo ou renovação mensal nessas telas.
- Validar tipos, compilação e preservação do registro de eventos de consumo.