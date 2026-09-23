# Personas com tag para cenas com várias pessoas

Evolução da biblioteca "Meus avatares" já existente. O modo de avatar único (o override por vídeo, com até 5 fotos) continua exatamente como está hoje.

## 1. Cada avatar ganha tag e foto principal

No cadastro de avatar (aba "Meus avatares" do perfil):
- **Tag**: nome curto, sem espaço nem acento (ex. `alex`, `regina`), único dentro do perfil. Sugerida automaticamente a partir do nome e editável.
- **Foto principal**: a pessoa marca com uma estrela qual das fotos é a principal. Sem marcação, vale a primeira.
- No cartão de cada avatar aparece a etiqueta pronta para copiar: `{{alex}}` com a dica "use {{alex}} nas cenas".

Guardado no mesmo cadastro de avatares (colunas novas `tag` e `primary_url`), isolado por perfil e empresa como o resto.

## 2. Tags na descrição da cena

Na descrição de imagem de cada cena (fluxo 100% IA e "Gerar vídeo por IA"), pode-se escrever:

```text
{{alex}} corre e abraça {{regina}} enquanto {{daniel}} vibra no fundo
```

Ao gerar essa cena:
- as tags citadas são identificadas e resolvidas nos avatares do perfil;
- de cada pessoa citada é usada **apenas a foto principal** (uma por pessoa);
- o texto enviado à IA troca `{{alex}}` pelo nome da pessoa e traz um guia dizendo qual foto é quem ("Image 1 is Alex", "Image 2 is Regina"), seguido das fotos do produto;
- tags que não existem no perfil são deixadas como o nome escrito, sem foto, e a cena continua.

Isso vale tanto na geração inicial das cenas quanto ao regerar uma cena na revisão.

Quando a cena não tem tag nenhuma, nada muda: segue o caminho atual de avatar único.

## 3. Aviso na revisão de cenas

Na revisão, quando a descrição da cena cita duas ou mais tags, aparece um aviso discreto: gerar várias pessoas específicas na mesma imagem é difícil para a IA e pode ser preciso regerar a cena algumas vezes. A lista de tags disponíveis do perfil também fica visível ali para consulta.

## 4. Fora do escopo

- O avatar único por vídeo (JobAvatarSelect) fica inalterado, inclusive usando as 5 fotos.
- O fluxo "Gravar eu mesmo" puro não é afetado.

## Detalhes técnicos

- Migração aditiva em `profile_avatars`: `tag text` e `primary_url text`, com índice único parcial em `(profile_id, lower(tag))`.
- `src/lib/avatars.functions.ts`: validação do formato da tag (`^[a-z0-9_]{2,24}$`, normalizando acentos) e persistência da foto principal.
- Novo helper em `src/lib/video-pipeline.server.ts` / `video.functions.ts`: `resolveScenePersonas(supabase, profileId, prompt)` → `{ prompt, refs, labels }`; `buildReferenceGuide` passa a aceitar rótulos nomeados por foto.
- Aplicado nos dois pontos de geração de imagem: etapa `cenas` de `runStep` e `regenerateJobScene`. Caminho multi-persona só entra quando há pelo menos uma tag reconhecida.
- UI: `avatar-library.tsx` (tag + estrela de foto principal + chip), `job-scenes-review.tsx` (aviso e lista de tags).

## Validação

Gerar uma cena com duas tags e conferir nos registros que as fotos principais corretas das duas personas foram enviadas, com o guia identificando quem é quem.
