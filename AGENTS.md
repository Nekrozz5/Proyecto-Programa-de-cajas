<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Directiva Obligatoria de Entrada: Verificación de Modelo y Skill de Fases
Ante cualquier solicitud de investigación, análisis, planificación o código en este proyecto:
1. Consultar de forma obligatoria `GEMINI.md` y `.agents/skills/phase-planner/SKILL.md`.
2. Verificar el modelo y esfuerzo activo en el chat.
3. Si el modelo es el idóneo, confirmarlo explícitamente al inicio (`> 🛡️ **[Validación de Modelo]**: ...`) antes de responder.
4. Si el modelo no es el óptimo (quema tokens en vano o es insuficiente), detenerse, alertar al usuario con la alternativa recomendada y pedir confirmación antes de elaborar la respuesta.
