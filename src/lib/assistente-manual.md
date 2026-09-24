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

## Métricas, Custos e Investimento (menu: Acompanhar)
Métricas mostra o desempenho. Custos (/app/custos) mostra o gasto por período, etapa e perfil, com o orçamento. Investimento mostra o retorno. Só aparecem para quem tem permissão.

## Saldo e planos
O plano é por compra de quantidade de cada ação (roteiro, cena, animação, montagem, narração...), sem expiração. Ação com preço zero no plano é ilimitada. Antes de gerar, o sistema confere o saldo de todas as ações que serão consumidas e bloqueia se faltar. Saldo e histórico ficam em Minha conta (/app/conta).

## Chaves próprias (BYOK)
Empresas podem usar as próprias chaves dos fornecedores. As chaves ficam guardadas no servidor e nunca aparecem na tela.

## Equipe e permissões (menu: Administrar > Equipe)
Convide pessoas e dê papéis por perfil. Cada pessoa só vê o que o papel permite (ex.: sem permissão de Custos, não vê gastos).
