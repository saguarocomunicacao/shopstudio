# Painel de acompanhamento da Automação — Parte 3

## Objetivo
Complementar as abas existentes **Agendamentos** e **Últimas execuções**, sem alterar o cron, usando os registros atuais de agendas, execuções, vídeos, produtos e consumo.

## Implementação

### Agendamentos
- Enriquecer cada agenda com gasto real do dia e do mês, calculado pelos mesmos eventos e tarifas usados em **Custos**.
- Mostrar barras de progresso contra os tetos diário e mensal; quando não houver teto, mostrar o gasto sem percentual.
- Exibir vídeos gerados hoje, no mês e no total.
- Calcular o próximo horário previsto em Brasília; agendas pausadas indicarão que não há próximo disparo.
- Destacar pausas automáticas por teto/erro e avisos recentes de falta de produto novo, mantendo o controle atual de ativar/pausar.
- Preservar edição, exclusão e criação já existentes, adaptando a apresentação para desktop e celular.

### Últimas execuções
- Ampliar os dados de cada execução com nome da agenda, produto escolhido, custo real do vídeo e vínculo ao vídeo.
- Adicionar filtros por agenda, período e resultado.
- O link do vídeo abrirá o item correspondente em **Rascunhos**, na fila **Aguardando revisão**, mantendo o perfil ativo.
- Manter estados, selos e tabela no padrão visual já usado no sistema, com adaptação responsiva.

### Visão de custo da automação
- Adicionar um resumo no topo da aba de execuções com total de hoje, total do período selecionado e detalhamento por agenda.
- Informar claramente que os valores são um recorte dos mesmos lançamentos exibidos em **Custos**, sem nova contabilização.

### Integração e validação
- Reutilizar as políticas atuais de acesso por empresa e perfil; nenhuma consulta cruzará empresas.
- Ajustar Rascunhos apenas para aceitar o link direto de um vídeo e abrir seu detalhe.
- Validar filtros, cálculos, estados vazios, desktop/mobile e o build, sem disparar nenhuma geração paga.

## Detalhes técnicos
- Os custos serão derivados de `consumo_eventos` via `computeJobCusto` e das tarifas/taxas existentes.
- Os contadores virão dos jobs vinculados por `automation_schedule_id`.
- Datas e próximo disparo serão tratados no fuso `America/Sao_Paulo`.
- Nenhuma mudança será feita no executor, endpoint ou agendamento do cron.
