# Creator Studio — plano do protótipo visual

## Objetivo
Construir um dashboard interno navegável, totalmente mockado, para validar a experiência de gestão de conteúdo afiliado no TikTok Shop. Nesta fase não haverá login real, banco de dados ou integrações externas.

## Estrutura da experiência
- Criar uma estrutura compartilhada com sidebar fixa e recolhível, topbar e área principal.
- Em telas pequenas, transformar a sidebar em menu retrátil.
- Exibir no topo o título da tela, seletor do perfil ativo, alternância dark/light e usuário mockado “Lauffer”.
- Manter o tema escuro como padrão e persistir a escolha de tema no navegador.
- Manter o perfil ativo em estado local; ao trocar entre um perfil e “Todos os perfis”, atualizar métricas, listas, tabelas, gráficos e configurações visíveis.
- Simular o papel `admin`, exibindo “Equipe”; deixar a navegação preparada para ocultá-la quando o papel for comum.

## Direção visual
- Aplicar a paleta especificada: fundos `#121212`/`#1E1E1E`, modo claro `#FFFFFF`/`#F6F6F6`, ciano `#25F4EE` e rosa `#FE2C55` como destaques.
- Usar Inter, contraste alto, bastante espaço, superfícies minimalistas, cantos arredondados e bordas discretas.
- Reservar o efeito cromático/glitch exclusivamente ao logotipo “Creator Studio”.
- Adicionar transições rápidas e estados de interação sutis, com respeito à preferência de movimento reduzido.

## Telas e conteúdo mockado
1. **Dashboard** — quatro métricas filtradas e lista dos jobs mais recentes.
2. **Perfis** — cards dos cinco perfis solicitados, status, seguidores e ação “Adicionar perfil”.
3. **Produtos** — tabela responsiva de produtos em alta com preço, comissão, hype score e ação “Usar”.
4. **Pipeline** — visão kanban responsiva com todas as sete etapas e jobs mockados movidos conforme o perfil selecionado.
5. **Vídeos** — biblioteca em grade com thumbnails visuais, título, data, status e produto relacionado.
6. **Rascunhos** — fila para revisão com preview, perfil, produto e ações funcionais de interface para revisar/agendar/publicar.
7. **Métricas** — gráficos mockados de views, vendas e comissão, com agregação em “Todos os perfis”.
8. **Equipe** — usuários mockados, indicação de papel, matriz de permissões editável e ação “Adicionar usuário”, apenas para admin.
9. **Configurações** — preferências visuais escopadas ao perfil selecionado, sem persistência de servidor.

## Navegação e estados
- Criar uma rota própria para cada seção, com navegação ativa e metadados específicos.
- Centralizar os mocks e o contexto de perfil/tema para garantir que todas as telas respondam da mesma forma.
- Fazer botões e controles do protótipo responderem localmente com diálogos, menus, checkboxes ou avisos visuais, sem prometer persistência real.
- Usar componentes reutilizáveis para métricas, status, avatars, tabelas, previews e estados vazios.

## Validação
- Verificar o fluxo completo de navegação, troca de perfil, tema, colapso da sidebar e visibilidade da área de equipe.
- Conferir desktop e mobile para evitar cortes, sobreposições e tabelas inutilizáveis.
- Validar que a página inicial já abre no Dashboard e que nenhuma ação visual exige backend.

## Fora deste passo
- Autenticação, convites reais, permissões seguras, banco, upload, geração de vídeo, postagem no TikTok Shop e métricas reais.
