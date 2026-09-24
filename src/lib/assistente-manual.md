# Manual do Shop Studio

## Visão geral (menu: Visão geral, /app)
Tela inicial. Mostra vídeos prontos, rascunhos aguardando, publicados no mês, jobs no pipeline e, para quem pode ver Custos, o gasto do mês com a barra do orçamento. "Últimos jobs" lista os 5 mais recentes; clicar abre o detalhe. O botão "Como funciona" e o item "Guia do Shop Studio" (menu da sua foto) abrem o guia de 10 passos.

## Perfis (menu: Configurar > Perfis, /app/perfis)
Cada perfil é um canal do TikTok Shop. Sem perfil nenhuma outra tela funciona, por isso ele vem primeiro. Passo a passo: Perfis > "Novo perfil" > preencha nome, @ e categoria > salve. Abas do perfil: Dados do perfil (inclui a Foto do perfil, com recorte redondo, JPG/PNG até 15 MB), Identidade (tom e idioma), Geração (estilo visual padrão, qualidade, cenas), Pessoa / Avatar, Avatares e Voz.
- Pessoa fixa: até 5 fotos (15 MB cada) da mesma pessoa, para ela aparecer nas cenas.
- Avatares com tag: cada avatar tem nome, tag curta única no perfil e foto principal. No roteiro, escrever {{tag}} coloca aquela persona na cena (só na geração por IA). Cenas com várias tags podem sair menos fiéis.
- Estilo visual: realista, cartoon/HQ, 3D, aquarela, anime ou texto livre. O vídeo pode sobrescrever o do perfil.

## Automação (menu: Configurar > Automação, /app/automacao)
Agendas por perfil que criam vídeos sozinhas em dias e horários definidos, com teto diário e mensal de gasto. A automação para em "Aguardando revisão": ninguém publica sozinho. Se faltar saldo, a agenda pausa com o motivo "sem saldo". Passo a passo: Automação > "Nova agenda" > escolha perfil, horários, fonte de produtos e tetos > salve.

## Produtos (menu: Produzir > Produtos, /app/produtos)
Os produtos vêm somente do garimpo (Kalodata) e são só leitura. Abas: Catálogo (produtos salvos no perfil), Descobrir (em alta) e Radar de emergentes (em ascensão). "Ver detalhes" mostra preço, comissão, crescimento, hype e a descrição usada pela IA. "Usar neste perfil" cria um job.

## Pipeline (menu: Produzir > Pipeline, /app/pipeline)
Kanban com as etapas: Novo, Produto escolhido, Roteiro pronto, Gerando cenas, Cenas geradas, Gerando vídeo, Vídeo pronto, Rascunho enviado, Publicado. Clicar no card abre o detalhe do job.

## Formatos de vídeo
- Completo (100% IA): roteiro, cenas (imagens), animações, narração e montagem.
- Gravar eu mesmo: a pessoa grava no estúdio com teleprompter. Esse job também pode seguir para "Gerar vídeo por IA"; as versões gravada, editada e IA convivem.
- Vídeo próprio: sobe um vídeo pronto.
Roteiro: modo "Criar roteiro" (a partir de um assunto) ou "Organizar meu roteiro" (cola um texto seu). O roteiro pode usar vídeos campeões da categoria como referência de gancho.

## Custos da geração
Cenas são baratas; o vídeo animado é caro. Por isso aprove as cenas antes de animar. Cada nova tentativa é um novo consumo. Falhas mostram "Tentar novamente", que continua de onde parou sem refazer o que já deu certo.

## Rascunhos (menu: Produzir > Rascunhos, /app/rascunhos)
Abas: Roteiros prontos (?tab=roteiros), Aguardando revisão (?tab=revisao), Aprovados (?tab=aprovados), Publicados (?tab=publicados) e Lixeira. Cada card tem "Duplicar" (cópia fiel em rascunho), "Voltar etapa" e excluir (vai para a Lixeira). Aprovados têm o kit de postagem: baixar vídeo, copiar legenda e hashtags.
- Publicação é manual: poste no TikTok pelo app e marque o produto no carrinho, depois cole o link em "Marcar como publicado".
- Link público: cada vídeo pode ser compartilhado por um link /v/... para revisão externa.

## Estúdio de gravação e editor
Estúdio com teleprompter, enquadramento (9:16) e prévia. Editor com Aparar pontas, Tesoura (cortar trechos) e Enquadrar. Ao sair sem salvar, o sistema pergunta se quer salvar como rascunho.

## Vídeos (menu: Produzir > Vídeos, /app/videos)
Biblioteca dos vídeos prontos e publicados.

## Inteligência: Analisar vídeo (menu: Inteligência > Analisar vídeo, /app/analises; detalhe em /app/analises/<id>)
Envie um arquivo ou cole um link do TikTok, YouTube ou Instagram. A IA devolve gancho, cenas, transcrição, produto, CTA, formato e ritmo. Cada análise consome 1 unidade de "Análise de vídeo".

## Inteligência: Perfis de referência (menu: Inteligência > Perfis de referência, /app/referencias; detalhe em /app/referencias/<id>)
Acompanhe um @ do TikTok (seu ou de referência) ligado ao perfil do topo. "Adicionar @": escolha 20, 50 ou 100 vídeos e se quer acompanhar diariamente (coleta às 06:00, junto com Métricas). "Atualizar" manual: 1 por hora por @. No detalhe: aba Vídeos (médias e tabela com checkbox; "Analisar selecionados" ou "Analisar os 10 mais vistos", no máximo 5 análises ao mesmo tempo), aba Evolução (seguidores e views por dia) e aba Insights (com 5 ou mais vídeos analisados: padrões acima/abaixo da mediana, 5 melhores ganchos, recomendações e comparação 5 melhores x 5 piores). "Usar como referência do roteirista" junta os ganchos dos 10 vídeos mais vistos analisados aos campeões do Kalodata no roteiro. Seus próprios perfis podem ser adicionados (marcados "meu perfil") e usam a coleta de Métricas, sem coleta duplicada. Remover um @ apaga vídeos, números e capas, mas as análises feitas continuam em Analisar vídeo.

## Inteligência: Radar (menu: Inteligência > Radar, /app/radar)
Mostra vídeos NOVOS (até 72 h) dos @ com "Acompanhar diariamente" que estão subindo rápido: acima de 2x a média de views do @ nos últimos 30 dias, acima de 80% dos vídeos do próprio @, ou entre os 10% mais vistos da semana entre os @ acompanhados do perfil (em alta no nicho). A checagem roda junto com a coleta diária das 06:00, sem custo extra. Filtros: 24 h, 3 dias, 7 dias e por @. Em cada card: "Analisar" (mesmo custo de Analisar vídeo), "Ver no TikTok", "Ignorar" e, depois da análise, "Criar roteiro inspirado" (abre Novo vídeo próprio com o gancho e o resumo). Admin e Gerente do perfil recebem aviso no sino.

## Inteligência: Pesquisar (menu: Inteligência > Pesquisar, /app/pesquisa; resultado em /app/pesquisa/<id>)
Antes de gravar, veja o que está sendo postado sobre um tema. Escolha "Hashtag" ou "Palavra", a quantidade (10, 30 ou 50) e toque em "Pesquisar" (custo estimado aparece antes; o real fica em Custos). Os vídeos chegam em 1 a 2 minutos. No resultado: views médias, engajamento médio e duração média (anúncios ficam fora das médias com selo "Anúncio"; carrosséis de fotos têm selo "Fotos" e ficam fora da duração média), hashtags usadas junto, @ que mais aparecem e a tabela de vídeos, ordenada por data (mais recentes) ou por views. "Só português" vem ligado: esconde vídeos cuja legenda parece de outro idioma (detecção provável). A busca por palavra traz os mais relevantes, não só os recentes. "Analisar selecionados" / "Analisar os 10 mais vistos" usam o mesmo fluxo de Analisar vídeo. Clicar no @ oferece "Adicionar a Perfis de referência". Aba Insights com 5+ analisados; "Enviar para o roteirista" salva as recomendações do tema na Identidade do perfil. As pesquisas ficam guardadas por 90 dias. No Descobrir de Produtos, a lupa ao lado do produto abre a pesquisa já com o nome curto.

## Produtos: aba Criadores (/app/produtos?tab=criadores)
Ranking de criadores do TikTok Shop BR pelo Kalodata (50 primeiros). Filtros: categoria (padrão: a do perfil), período 7 ou 30 dias, ordenação (padrão: receita em vídeo), seguidores mínimo/máximo, receita mínima e "só quem tem 50%+ da receita em vídeo" (ligado por padrão). Colunas: seguidores, receita em vídeo, % em vídeo, receita total, vendas, crescimento e R$ por mil views. Abrir a linha busca a ficha (vídeos e lives no período, novos seguidores, ticket médio, contatos) e os vídeos que mais venderam, com custo registrado. "Acompanhar" / "Adicionar selecionados" cria o @ em Perfis de referência com acompanhamento diário e primeira coleta (não duplica). Buscas recentes ficam salvas.

## Métricas, Custos e Investimento (menu: Acompanhar)
Métricas mostra o desempenho. Custos (/app/custos) mostra o gasto por período, etapa e perfil, com o orçamento. Investimento mostra o retorno. Só aparecem para quem tem permissão.

## Saldo e planos
O plano é por compra de quantidade de cada ação (roteiro, cena, animação, montagem, narração...), sem expiração. Ação com preço zero no plano é ilimitada. Antes de gerar, o sistema confere o saldo de todas as ações que serão consumidas e bloqueia se faltar. Saldo e histórico ficam em Minha conta (/app/conta).

## Chaves próprias (BYOK)
Empresas podem usar as próprias chaves dos fornecedores. As chaves ficam guardadas no servidor e nunca aparecem na tela.

## Equipe e permissões (menu: Administrar > Equipe)
Convide pessoas e dê papéis por perfil. Cada pessoa só vê o que o papel permite (ex.: sem permissão de Custos, não vê gastos).

# Perguntas frequentes

## FAQ: Como duplicar um vídeo?
Em Rascunhos, clique em Duplicar no card (qualquer aba, exceto Lixeira). A cópia nasce em Roteiros prontos com "(cópia)" no título. [Rascunhos](/app/rascunhos)

## FAQ: Como renomear um vídeo?
Em Rascunhos, clique no lápis ao lado do título ou dê duplo clique nele. Enter salva, Esc cancela. Máximo 120 caracteres. [Rascunhos](/app/rascunhos)

## FAQ: Como favoritar um vídeo?
Clique no coração sobre a miniatura do card, no detalhe do job ou no kit. Os favoritos ficam na aba Favoritos. [Favoritos](/app/rascunhos?tab=favoritos)

## FAQ: Como mudar a voz da narração?
Abra o perfil, aba Voz, e escolha outra voz como padrão. [Perfis](/app/perfis)

## FAQ: Como clonar minha voz?
No perfil, aba Voz, use Clonar voz e envie uma gravação limpa. A clonagem consome saldo de clonagem de voz. [Perfis](/app/perfis)

## FAQ: Como criar um avatar com tag?
No perfil, aba Meus avatares, clique em Novo avatar, preencha nome, uma tag curta única (ex.: alex), até 5 fotos de até 15 MB e marque a foto principal. No roteiro use {{alex}}. [Perfis](/app/perfis)

## FAQ: Posso criar o avatar na hora de gerar o vídeo?
Sim. Na geração por IA, o resumo "Personagens deste vídeo" mostra as tags pendentes com o botão Criar avatar. [Pipeline](/app/pipeline)

## FAQ: Como mudar o estilo visual (realista, cartoon, 3D)?
Padrão por perfil na aba Vídeo/Geração. Por vídeo, escolha outro estilo no detalhe do job antes de gerar as cenas. [Perfis](/app/perfis)

## FAQ: Como usar o link público?
No kit de postagem ou no detalhe do job, gere o link público e envie para quem aprova. Dá para desativar a qualquer momento e ver quantas vezes foi aberto. [Rascunhos](/app/rascunhos?tab=revisao)

## FAQ: Como editar um vídeo gravado?
Abra o kit do vídeo gravado e clique em Editar: aparar pontas, cortar trechos com a tesoura e ajustar o enquadramento. [Rascunhos](/app/rascunhos)

## FAQ: Qual formato de gravação usar?
O formato padrão é 9:16 (vertical, ideal para TikTok). Ele é configurado por perfil na aba Vídeo/Geração. [Perfis](/app/perfis)

## FAQ: Como gravar eu mesmo?
Escolha o formato Gravar eu mesmo ao usar um produto, ou crie um Novo vídeo próprio. Depois, em Roteiros prontos, clique em Gravar vídeo. [Rascunhos](/app/rascunhos?tab=roteiros)

## FAQ: Qual a diferença entre Criar roteiro e Organizar meu roteiro?
Criar roteiro: você dá o assunto e a IA escreve. Organizar meu roteiro: você cola seu texto (mínimo 30 caracteres) e a IA só organiza em blocos. [Rascunhos](/app/rascunhos)

## FAQ: Posso gerar por IA um vídeo que era para gravar?
Sim. No kit do vídeo próprio use Gerar vídeo por IA. As versões gravada, editada e IA ficam juntas e você escolhe qual postar. [Rascunhos](/app/rascunhos)

## FAQ: Como pausar a automação?
Em Automação, desligue a chave da agenda. Ela também pausa sozinha quando falta saldo ou o teto de gasto é atingido. [Automação](/app/automacao)

## FAQ: Por que minha automação pausou?
O motivo aparece na agenda, por exemplo "sem saldo" ou teto atingido. Resolva a causa e ative de novo. [Automação](/app/automacao)

## FAQ: Como ver meu saldo?
Em Minha conta você vê o saldo por ação e o histórico de movimentações. [Minha conta](/app/conta)

## FAQ: Como comprar mais pacotes?
Por enquanto a compra é manual: fale com a equipe Shop Studio, que credita os pacotes pelo backoffice. [Minha conta](/app/conta)

## FAQ: O saldo expira?
Não. Pacotes comprados não expiram. Ações com preço zero no seu plano são ilimitadas.

## FAQ: Por que a geração foi bloqueada?
Antes de gerar, o sistema confere o saldo de todas as ações que a etapa consome. Sem saldo em alguma delas, a geração não começa. [Minha conta](/app/conta)

## FAQ: Como conectar o TikTok?
No perfil, aba Integrações, clique em Conectar TikTok e autorize a conta. [Perfis](/app/perfis)

## FAQ: Por que a publicação é manual?
O TikTok exige que o produto seja marcado no carrinho no próprio app para gerar comissão. Por isso você baixa o vídeo pelo kit e publica no app. [Aprovados](/app/rascunhos?tab=aprovados)

## FAQ: Como marco um vídeo como publicado?
No kit de postagem, depois de publicar no TikTok, cole o link do vídeo e marque como publicado. [Aprovados](/app/rascunhos?tab=aprovados)

## FAQ: O que é hype score?
Nota de 0 a 100 que combina vendas (40%), crescimento de receita (35%) e receita (25%). Quanto maior, mais quente o produto. [Produtos](/app/produtos)

## FAQ: O que é o radar de emergentes (Em ascensão)?
A aba Em ascensão busca produtos que mais cresceram no período, para pegar tendências antes de saturar. [Em ascensão](/app/produtos?tab=ascensao)

## FAQ: Como buscar produtos novos?
Em Produtos, aba Descobrir, filtre por categoria, comissão, preço e período. Cada busca consome saldo de busca de produto. [Descobrir](/app/produtos?tab=descobrir)

## FAQ: Como salvar um produto no catálogo?
No Descobrir, marque os produtos e clique em Salvar selecionados (no Em ascensão, use o botão de salvar do produto). Eles vão para o Catálogo do perfil. [Produtos](/app/produtos)

## FAQ: De onde vem a descrição do produto?
Vem do Kalodata, da IA ou foi escrita manualmente. A origem aparece como selo no detalhe do produto e dá para editar. [Produtos](/app/produtos)

## FAQ: Como começar um vídeo a partir de um produto?
No Catálogo, clique em Usar no produto e escolha o formato: Completo ou Gravar eu mesmo. [Catálogo](/app/produtos?tab=catalogo)

## FAQ: Como voltar uma etapa?
No detalhe do job use Voltar etapa. O que já foi gerado continua salvo e nada é cobrado de novo por voltar. [Pipeline](/app/pipeline)

## FAQ: Uma etapa falhou, o que faço?
Abra o job e clique em Tentar novamente. Só a parte que falhou é refeita; a nova tentativa é um novo consumo. [Pipeline](/app/pipeline)

## FAQ: Como recuperar um vídeo excluído?
Na aba Lixeira de Rascunhos, clique em Restaurar. [Lixeira](/app/rascunhos?tab=lixeira)

## FAQ: Como aprovar um vídeo?
Em Rascunhos, aba Aguardando revisão, assista e clique em Aprovar para postagem. [Revisão](/app/rascunhos?tab=revisao)

## FAQ: Como regerar uma cena?
No detalhe do job, na etapa de cenas, clique em Regerar esta cena na cena que não gostou antes de aprovar o vídeo. [Pipeline](/app/pipeline)

## FAQ: Quanto custa cada vídeo?
O custo de cada job aparece no Pipeline e o total do período em Custos. [Custos](/app/custos)

## FAQ: Como definir orçamento mensal?
O orçamento é definido pelo backoffice em Configurações > Orçamento. A barra aparece em Custos. [Custos](/app/custos)

## FAQ: Como convidar alguém para a equipe?
Administradores abrem Equipe, aprovam cadastros pendentes e definem o papel por perfil. [Equipe](/app/equipe)

## FAQ: Como criar um novo perfil?
Em Perfis, clique em Adicionar perfil e preencha Dados e Identidade. [Perfis](/app/perfis)

## FAQ: Como trocar a foto do perfil?
No perfil, aba Dados do perfil, envie uma imagem JPG ou PNG de até 15 MB e ajuste o recorte redondo. [Perfis](/app/perfis)

## FAQ: Onde configuro minhas chaves de API?
Administradores configuram em Minhas APIs, no menu da sua foto. O assistente só informa se a chave está configurada, nunca o valor. [Minhas APIs](/app/apis)

## FAQ: Como abrir o guia de novo?
No menu da sua foto, Guia do Shop Studio, ou no botão Como funciona da Visão geral. [Visão geral](/app)

## FAQ: Onde vejo o histórico de um job?
No detalhe do job, seção Histórico: etapas, tempo em cada uma, quem avançou ou voltou, tentativas e erros. [Pipeline](/app/pipeline)

## FAQ: Onde vejo minhas notificações?
Pergunte ao assistente "quais minhas notificações". Vídeos criados pela automação avisam os Admins e Gerentes do perfil. Uma central de notificações no topo virá em breve.

## FAQ: O assistente pode fazer ações por mim?
Não. O assistente só consulta e explica, e mostra o link da tela onde você faz a ação.
