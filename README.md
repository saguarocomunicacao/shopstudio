# Shop Studio

Crie um painel web (dashboard) interno para gerenciar criação e postagem 

de conteúdo de afiliado no TikTok Shop, com múltiplos perfis e múltiplos 

usuários. Nome de trabalho: "Creator Studio".

IMPORTANTE: neste primeiro passo, foque APENAS no visual e na navegação. 

Sem backend, sem banco, sem login real ainda. Use dados mockados no código. 

O objetivo é validar o design e a estrutura. O login e as permissões reais 

virão num passo seguinte, mas o layout já deve prever os lugares deles.

## Conceito central: tudo é escopado por PERFIL

No topo da área principal deve haver um SELETOR DE PERFIL ATIVO (um 

dropdown moderno com avatar + nome do perfil). Ao trocar o perfil ativo, 

TODO o conteúdo das telas muda para refletir só aquele perfil (dashboard, 

pipeline, vídeos, rascunhos, métricas, configurações). Inclua também a 

opção "Todos os perfis" para uma visão consolidada. No mock, simule essa 

troca de contexto com estado local.

## Papéis (mock por enquanto)

Simule um usuário logado que é ADMIN (ex: "Lauffer"). O admin enxerga 

todos os perfis e vê a seção "Equipe". Usuários comuns só veriam os perfis 

liberados a eles e não veem "Equipe". Deixe a UI preparada para isso.

## Estética (o mais importante)

Visual inspirado no TikTok: moderno, escuro por padrão, alto contraste, 

minimalista, cantos bem arredondados, muito respiro.

- Tema DARK por padrão + switch (toggle) moderno no topo para LIGHT. 

  Persistir a escolha.

- Paleta:

  - Dark: fundo #121212, superfícies #1E1E1E, bordas sutis.

  - Light: fundo #FFFFFF, superfícies #F6F6F6.

  - Destaque primário: ciano #25F4EE. Secundário: rosa #FE2C55.

  - Texto branco no dark / quase preto no light, secundário em cinza.

- Efeito de deslocamento cromático (glitch estilo TikTok) só no logotipo 

  "Creator Studio", com bom gosto.

- Tipografia sans moderna (Inter). Títulos com peso forte.

- Hover suave, transições rápidas, sensação premium.

## Layout

- Sidebar vertical fixa à esquerda: logo no topo + itens de menu (ícone + 

  texto), podendo colapsar para só ícones.

- Topbar: título da seção + SELETOR DE PERFIL ATIVO + toggle de tema + 

  avatar do usuário logado.

- Responsivo: em telas pequenas a sidebar vira menu retrátil.

## Seções do menu (navegação + tela com mock, todas filtradas pelo 

perfil ativo)

1. Dashboard: cards de métricas (vídeos gerados hoje, rascunhos 

   aguardando, publicados na semana, comissão estimada) + lista dos 

   últimos jobs.

2. Perfis: grade de cards, um por perfil de TikTok. 5 mocks: Moda e 

   Acessórios, Beleza, Casa e Decoração, Eletrônicos, Hobby/Gadgets. 

   Cada card: nome, nicho, avatar, seguidores, status (ativo/pausado). 

   Botão "adicionar perfil".

3. Produtos: tabela de produtos em alta (mock): produto, nicho, preço, 

   comissão %, hype score, botão "usar".

4. Pipeline: kanban/tabela dos "jobs" (vídeos em produção) com selo de 

   status colorido por etapa: Novo, Produto escolhido, Roteiro pronto, 

   Gerando vídeo, Vídeo pronto, Rascunho enviado, Publicado. É aqui que 

   se acompanha a geração de cada vídeo.

5. Vídeos: biblioteca de todos os vídeos já criados do perfil ativo, em 

   grade, com thumbnail placeholder, título, data, status e o produto 

   associado.

6. Rascunhos: fila de vídeos prontos aguardando revisão e publicação, 

   cada um com preview placeholder, perfil de destino e produto a anexar, 

   botões "revisar" e "publicar".

7. Métricas: gráficos mockados por perfil (views, vendas, comissão).

8. Equipe (visível só para admin): lista de usuários (mocks: Lauffer 

   [admin], e mais 3 usuários comuns) e uma MATRIZ DE PERMISSÕES em 

   tabela, com usuários nas linhas e os 5 perfis nas colunas, com 

   checkboxes marcando quem acessa o quê. Botão "adicionar usuário".

9. Configurações: placeholder, escopado ao perfil ativo.

Capriche no acabamento. Deve parecer um produto real e moderno.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://shopstudio.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c5a0c6dd-28ab-4eee-a22b-3c59cd2e5a81).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
