# Tela "Custos"

Nova tela no menu lateral (ícone Wallet), separada de Métricas. Métricas continua só com desempenho; Custos concentra todo o gasto, calculado a partir dos eventos de consumo já gravados, com a tarifa vigente e a cotação configurada.

## Filtros (topo da tela)

- **Período**: hoje, 7 dias, 30 dias, mês atual e intervalo personalizado (data início/fim). Padrão: mês atual.
- **Perfil**: o perfil ativo do seletor do topo ou "Todos os perfis" — opção que existe apenas nesta tela, para a visão consolidada.
- **Etapa** (opcional): roteiro, cenas, animação, montagem, buscas, categorias.

Os filtros ficam na URL, então recarregar ou compartilhar o link mantém a mesma visão.

## Conteúdo

**Cards de resumo** (do período e filtro): custo total em R$, nº de vídeos gerados, custo médio por vídeo e nº de buscas de produto.

**Orçamento**: teto mensal vigente (global e do perfil, quando houver), quanto já foi consumido no mês e barra de progresso, com o mesmo alerta de 80% e 100% já usado no Pipeline.

**Gráficos**:
- Barras de custo total por dia no período.
- Distribuição do custo por etapa (% de cada uma).
- Linha de custo acumulado no mês comparado ao teto, exibida só quando existe teto definido.

**Tabela "Custo por etapa"**: Etapa | Consumo total | Custo R$ | % do total, com linha final de Total em destaque. Categorias aparecem separadas das buscas de produto (ambas Kalodata, distinguidas pelo registro de atualização de categorias).

**Tabela "Custo por vídeo/job"**: uma linha por job com custo — Produto (truncado com tooltip) | Perfil | Data | Roteiro | Cenas | Animação | Montagem | Total | nº de regenerações. Ordenável por total e por data; clicar na linha abre o mesmo modal de detalhe do job usado no Pipeline.

**Tabela "Buscas"**: Tipo (busca / categorias) | Perfil | Termo | Linhas | Data | Custo R$.

**Exportar CSV**: baixa a tabela de custo por job do período filtrado, pronta para o Excel.

**Estados vazios**: sem nenhum perfil cadastrado, o mesmo convite "Crie seu primeiro perfil"; sem perfil selecionado e sem "Todos os perfis", o convite para escolher no seletor; com filtro válido mas sem gasto, uma mensagem clara de que não houve custo no período.

## Detalhes técnicos

- Rota `src/routes/_authenticated/app/custos.tsx` com `head()` próprio, renderizando um novo `src/components/costs-page.tsx`. Item no menu de `studio-shell.tsx` e título da topbar.
- Permissão: reaproveita o módulo `metricas` para visualização; a visão "Todos os perfis" e o bloco de orçamento ficam restritos a admin (RLS já limita os eventos aos perfis acessíveis).
- Cálculo em `src/lib/custo.ts`: novos hooks `useCustoPeriodo` (eventos do intervalo, com ou sem filtro de perfil) e agregadores puros por dia, por etapa e por job, reaproveitando `computeEventoCusto` / `computeJobCusto`. Nada de nova lógica de tarifa.
- Eventos de categorias (profile_id nulo, metadados `tipo: "atualizacao_categorias"`) entram na visão global e na tabela de buscas como tipo "Categorias".
- Gráficos com `recharts` (já instalado); datas com `date-fns`.
- Sem mudanças na geração, nas tarifas ou nos guardrails — apenas leitura e apresentação.
