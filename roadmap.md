# Roadmap

## Planos por quantidade — Etapa A
- [x] Simplificar cadastro de planos para preço unitário por ação
- [x] Adequar Minha conta ao modelo de quantidades sem expiração
- [x] Registrar todo novo consumo com preço unitário, sem débito de saldo
- [x] Validar Planos e Conta sem referências a franquia, excedente ou ciclo mensal

- [x] Diagnosticar a rolagem automática do teleprompter no mobile
- [x] Unificar animação do vídeo e rolagem e adicionar controles sobrepostos
- [x] Expor e aplicar o formato de gravação no estúdio
- [x] Reorganizar card pendente e blocos do roteiro no mobile
- [x] Validar tipos, build automático e interface mobile
- [x] Diagnosticar a distorção do preview e do arquivo gravado no mobile
- [x] Preservar o stream nativo e aplicar recorte central no canvas
- [x] Validar proporção dos pixels no preview e no arquivo gravado
- [x] Manter controles do teleprompter disponíveis antes e durante a gravação
- [x] Sincronizar reinício, velocidade e tamanho do texto em tempo real
- [x] Isolar a proporção de gravação do layout dos ajustes e controles
- [x] Validar as quatro correções no mobile sem regressão no desktop

## Editor de vídeo
- [x] Preservar a proporção real do vídeo nas miniaturas do filmstrip
- [x] Adicionar filmstrip assíncrona à timeline de aparar e tesoura
- [x] Original preservado no armazenamento; versão editada salva em paralelo
- [x] Botão "Editar" na revisão, com linha do tempo, barra de progresso e aviso no celular
- [x] "Restaurar original" na fila de rascunhos
- [x] Corte real testado (6,1s → 3,3s)
- [x] Corrigir layout responsivo do editor em desktop e mobile
- [x] Adicionar múltiplos cortes internos com tesoura e concatenação
- [x] Testar trim e tesoura reais e validar o resultado visual
- [x] Mostrar tela dedicada com progresso circular ao aplicar edição
- [x] Permitir reproduzir o vídeo na revisão antes de salvar
- [x] Adicionar reenquadramento com proporção travada, arraste e redimensionamento
- [x] Combinar crop, scale, trim e tesoura em uma única geração final
- [x] Testar crop 9:16 + tesoura com áudio e validar o layout responsivo
- [x] Manter crop e cortes visíveis no preview em todas as ferramentas
- [x] Abrir o fluxo de gravação em tela cheia no mobile e voltar à fila ao fechar
- [x] Substituir Fullscreen API por layout fixo compatível com Safari no iPhone
- [x] Alertar ao fechar gravação/edição não salva com três opções
- [x] Salvar rascunho com original, versão ativa e operações
- [x] Reabrir rascunho gravado diretamente no estúdio/editor com operações restauradas
- [ ] Validar gravação, fechamento, salvamento e retomada

## Expansão da landing
- [x] Preservar hero, navegação, estrutura, identidade e seções atuais
- [x] Adicionar os três modos de criação e diferenciais do garimpo
- [x] Adicionar estúdio de gravação e editor com placeholders visuais
- [x] Adicionar BYOK, custos transparentes, multi-perfil, equipe e publicação manual
- [x] Validar desktop e mobile e publicar no domínio

## Transição e miniaturas dos Rascunhos
- [x] Substituir o carregamento preto pela transição visual do estúdio
- [x] Gerar e salvar thumbnail ao salvar uma gravação
- [x] Preencher thumbnails de vídeos antigos sem miniatura
- [x] Validar cards, reprodução, tipos e build

## Estilo visual da geração por IA
- [x] Adicionar estilo padrão por perfil e override por vídeo
- [x] Aplicar o estilo em geração e regeneração de cenas sem alterar referências
- [x] Exibir os seletores nos dois fluxos de vídeo por IA
- [x] Testar herança cartoon e override realista

## Validação do roteiro próprio
- [x] Separar os campos obrigatórios dos modos Criar e Organizar
- [x] Validar os dois modos sem regressão

## Varredura de erros e estados
- [ ] Centralizar extração e sanitização de mensagens de validação
- [ ] Remover mensagens técnicas diretas da interface
- [ ] Padronizar falhas de fornecedores e funções do servidor
- [ ] Garantir fallback global amigável em português
- [ ] Revisar carregamento, vazio e erro nas telas principais
- [ ] Validar tipos, build e fluxos críticos

## Foto de identidade do perfil
- [x] Adicionar campo e armazenamento isolado por empresa/perfil
- [x] Criar upload JPG/PNG de até 15 MB com recorte circular
- [x] Exibir foto no seletor superior e na listagem de Perfis
- [x] Validar upload real, fallback e visualização desktop/mobile

## Estado da geração por IA em vídeo próprio
- [x] Sincronizar a etapa de IA com o estado principal do job
- [x] Exibir geração de cenas, animação e vídeo pronto em Rascunhos
- [x] Mover o card pelas colunas corretas do Pipeline
- [x] Validar progressão preservando as versões gravadas

## Assistente e miniaturas da Visão geral
- [x] Criar ícone próprio de robô e aplicar no botão, cabeçalho e mensagens
- [x] Atualizar aparência e indicador do botão flutuante
- [x] Assinar miniaturas privadas e corrigir a ordem de fallback dos últimos jobs
- [x] Validar dados reais, carregamento privado e compilação; sessão visual indisponível

## Títulos e favoritos dos Rascunhos
- [x] Manter o lápis visível e ampliar sua área de toque
- [x] Destacar o campo de edição com borda magenta tracejada e acessível
- [x] Substituir estrelas por corações nos cards, detalhe, kit e aba Favoritos

## Analisar vídeo por link (Apify)
- [x] Conectar Apify no novo workspace
- [x] Download de links TikTok/YouTube/Instagram, custo real, estatísticas, "Baixar e extrair frames"

## Inteligência: Perfis de referência
- [x] Grupo Inteligência no menu (Analisar vídeo + Perfis de referência), guia e manual
- [x] Coleta compartilhada com Métricas (mesmas tabelas/campos para perfis próprios)
- [x] Lista, detalhe (Vídeos, Evolução, Insights), análise em lote (máx. 5), insights com prompt configurável
- [x] Fonte extra do roteirista, "meu perfil" sem coleta duplicada, remoção mantendo análises
- [x] Tools listar_referencias e detalhe_referencia
- [x] Gráfico de seguidores com 1 coleta mostra o ponto único

## Inteligência: rotas, status, Insights e correções
- [x] URLs próprias (/app/analises, /app/analises/:id?tab, /app/referencias/:id?tab); /app/analisar redireciona
- [x] Mapa único de status (Na fila, Baixando/Analisando, Pronta, Erro com motivo)
- [x] Insights em JSON validado (retentativa 1x) e tela em blocos; Enviar para o roteirista
- [x] Capas: bug do upsert em lote corrigido + backfill do @cazzacuradoriaa
- [x] Contagem prontas/analisando/erro e aviso ao gerar com análises em andamento
- [ ] Baixar PDF (opcional, não feito)

## Inteligência: Radar (fase 2)
- [x] Detecção na coleta diária, tabela de alertas, tela /app/radar, sino, card Visão geral, tool do assistente, manual
- [ ] Validar com dados reais após a coleta diária (depende de publicar)
