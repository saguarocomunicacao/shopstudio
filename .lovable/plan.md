# Dois modos de criação de roteiro + textos longos

## Objetivo
No modo "Gravar eu mesmo", deixar a pessoa escolher entre a IA escrever o roteiro do zero ou apenas organizar um roteiro que ela já tem, aceitando textos longos (digitados, ditados ou vindos de arquivo) sem erro de limite.

## 1. Escolha do modo
No modal de novo vídeo próprio, primeiro aparece a escolha:
- **Criar roteiro** — fluxo de hoje: informa o assunto/tema (digitar ou ditar) e a IA escreve tudo.
- **Organizar meu roteiro** — a pessoa entrega o roteiro pronto e a IA só distribui na linha do tempo.

A tela muda conforme a escolha e o modo fica guardado no vídeo, para que "Regenerar" repita o mesmo comportamento.

## 2. Textos longos sem erro
- Remover o limite de 300 caracteres do campo de assunto e qualquer validação que hoje mostra mensagem técnica.
- Textos grandes passam a ser divididos em pedaços antes de ir para a IA e o resultado é reunido em um roteiro único, com os tempos recalculados em sequência.
- Se o texto for realmente enorme, avisar em linguagem simples em vez de mostrar erro.

## 3. Modo "Organizar meu roteiro"
- Entrada por: colar texto em campo grande, ditar por voz, ou enviar arquivo TXT, RTF, PDF, DOC ou DOCX (o texto é extraído no navegador; DOC antigo é lido em modo aproximado e, se não der, a pessoa é orientada a colar o texto).
- A IA preserva as palavras originais: apenas divide a fala nos blocos, estima os segundos de cada bloco pela quantidade de fala e não reescreve nem inventa conteúdo.
- Título, gancho, CTA, legenda, hashtags e orientação de cena: se já vierem no texto enviado, são aproveitados; se não vierem, a IA sugere. Nada que a pessoa já preencheu é sobrescrito.
- O modal traz uma orientação curta de como formatar o roteiro para sair melhor organizado.

## 4. Custo
"Organizar" continua contando como a ação "roteiro" no controle de custo, somando o consumo de todos os pedaços processados.

## Detalhes técnicos
- Migração: colunas `roteiro_modo` ("criar" | "organizar") e `roteiro_origem` (texto bruto enviado) em `jobs`.
- `src/lib/recording.functions.ts`: `createOwnVideoJob` aceita modo e texto de origem sem teto rígido; novo caminho de organização com prompt dedicado; utilitário de chunking + consolidação; `recordConsumo` somando os tokens de todas as chamadas, etapa `roteiro_texto`.
- Novo `src/lib/script-chunking.ts` (divisão por parágrafos/sentenças com testes) e `src/lib/document-text.ts` (extração client-side; `pdfjs-dist` e `mammoth` carregados sob demanda).
- `src/components/recording-kit.tsx`: seletor de modo, campo de roteiro grande, upload de arquivo, orientação de formatação; demais telas e o estúdio permanecem iguais.
- Verificar typecheck, build e o log de erros do preview.
