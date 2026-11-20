---
name: phase-planner
description: >-
  Planifica avances, tareas de investigación técnica, diagnósticos, refactorizaciones
  y nuevas funcionalidades descomponiéndolas en fases atómicas secuenciales con prompts
  quirúrgicos, validación previa del modelo de IA y control estricto de tokens.
---

# Skill: Phase Planner (Planificador por Fases y Guardián de Modelos)

Esta skill se activa ante **cualquier solicitud de planificación, investigación técnica, diagnóstico, desarrollo de nuevas funcionalidades o refactorizaciones**.

Su doble objetivo fundamental es:
1. **Actuar como Guardián de Cuota y Modelo:** Verificar antes que nada qué modelo de IA y nivel de esfuerzo está activo en el chat, confirmando si es idóneo o recomendando el cambio antes de elaborar la respuesta.
2. **Dividir el trabajo en fases atómicas e independientes:** Generar para cada fase un **Prompt Quirúrgico** para evitar el desperdicio de tokens y prevenir alucinaciones.

---

## 1. Principios Obligatorios de Ahorro de Tokens

Al descomponer cualquier requerimiento, la IA debe aplicar estrictamente estas 5 reglas:

1. **Aislamiento Estricto de Contexto (Context Pruning):**
   * Cada fase debe declarar explícitamente la **lista cerrada de archivos** que se leerán o modificarán.
   * Prohibir a la IA inspeccionar carpetas no relacionadas (ej. si la fase es de UI, no se leen repositorios de base de datos ni migraciones).
2. **Edición Quirúrgica vs. Reescritura:**
   * Los prompts generados deben instruir el uso de modificaciones puntuales (`edit_file` / diffs) en lugar de reescribir componentes o scripts completos de cientos de líneas.
3. **Cero Redundancia de Contexto General:**
   * No repetir en los prompts la descripción del proyecto ni reglas ya contenidas en `GEMINI.md`. Ir directo a la acción técnica concreta.
4. **Definición de Terminado (DoD - Definition of Done):**
   * Cada fase debe contar con un criterio de aceptación binario (pasa o no pasa) que se pueda verificar rápidamente antes de saltar a la siguiente.
5. **Secuencia Dependiente Lógica:**
   * Orden estándar recomendado:
     * **Fase 1: Datos y Lógica (Backend / Schema / Acciones):** Preparar persistencia y funciones sin interfaz.
     * **Fase 2: Componentes Atómicos (UI aislada):** Crear o adaptar componentes visuales puros con Shadcn/Tailwind.
     * **Fase 3: Cableado e Integración:** Conectar los componentes con la lógica/servidor.
     * **Fase 4: Verificación y Pulido:** Pruebas de borde, accesibilidad táctil y limpieza.
6. **Asignación Racional de Modelo, Rendimiento y Agente (Budgeting de Cuotas y Tokens):**
   * **Prohibido 'quemar tokens en vano':** Nunca asignar modelos de razonamiento pesado (`High` / `XHigh`) o con cuotas semanales restrictivas (*Gemini 4 Argon*, *Claude Opus*) a tareas mecánicas, de estilo o de 1-2 archivos.
   * **Matriz de Asignación por Complejidad:**
     * **UI puntual, componentes Shadcn, scripts auxiliares, refactorizaciones cosméticas:** `Gemini 3.8 Flash (Low o Medium)` — *Chat directo* (máxima velocidad, consumo despreciable de cuota diaria).
     * **Lógica de negocio, consultas SQLite / Drizzle ORM, Endpoints API:** `Gemini 4 Neon (Medium)` o `Claude Sonnet (Medium)` — *Chat directo* (alta fidelidad y balance de cuota diaria).
     * **Lectura o investigación de múltiples archivos (más de 3 archivos):** Subagente `research` con modelo Flash para inspeccionar en sandbox y retornar solo el extracto, protegiendo el contexto principal.
     * **Verificación de interfaces web o interacción en navegador:** Subagente `browser`.
     * **Arquitectura de base de datos crítica, concurrencia WAL o bugs no reproducibles:** `Gemini 4 Argon (Medium/High)` o `Claude Opus (High)` — *Reservado exclusivamente para bloqueos reales, justificando el uso de cuota semanal*.
7. **Detección Activa de Desajuste y Confirmación de Cambio (Model Mismatch Alert):**
   * **Monitoreo del Modelo Activo:** La IA debe contrastar activamente el modelo/esfuerzo activo en el chat con la complejidad de la fase.
   * **Caso Sobredimensionado (Overkill):** Si el chat está en un modelo de razonamiento alto (*Gemini 4 Argon High*, *Claude Opus High*) pero la fase es simple (ej. maquetación, scripts, 1-2 archivos), la IA debe alertar que se están quemando tokens en vano y sugerir bajar a *Gemini 3.8 Flash (Low/Medium)* o *Gemini 4 Neon (Low)*.
   * **Caso Insuficiente (Underpowered):** Si el chat está en un modelo rápido/ligero pero la fase involucra concurrencia compleja de SQLite WAL, auditoría criptográfica o algoritmos intrincados, la IA debe advertir que el modelo actual puede tener alucinaciones y sugerir subir a un modelo de mayor razonamiento.
   * **Petición Obligatoria de Confirmación:** Siempre que se detecte un desajuste o se proponga delegar la fase a un subagente (ej. `research` o `browser`), la IA **no ejecutará automáticamente la fase**, sino que solicitará confirmación expresa al usuario (ej. *"¿Deseas cambiar el modelo en la interfaz antes de que proceda, o prefieres ejecutarlo con el actual?"*).

---

## 2. Formato de Salida Obligatorio

Cuando esta skill se invoque, la respuesta DEBE seguir rigurosamente esta estructura:

```markdown
## 🗺️ Desglose de Avance: [Nombre de la Funcionalidad / Módulo]

**Resumen Ejecutivo:** (1-2 oraciones explicando el alcance y el resultado final esperado).
**Impacto en Tokens:** (Estimación cualitativa: Bajo / Moderado / Alto y por qué).
**Modelo Activo en el Chat:** [Nombre del modelo y rendimiento detectado actualmente].

---

### 📍 Fase [N]: [Título Descriptivo de la Fase]
* **Objetivo:** Qué se construye o modifica puntualmente en este paso.
* **Modelo y Rendimiento Recomendado:** `[Modelo] ([Low / Medium / High])` — *(Ej. Gemini 3.8 Flash (Medium) para no quemar cuota en maquetación)*.
* **Agente / Modo de Ejecución:** `[Directo en Chat | Subagente research | Subagente browser]`.
* **Alerta de Desajuste de Modelo:** [Opcional: ⚠️ Solo si el modelo activo en el chat no coincide con el recomendado. Explicar por qué es excesivo o insuficiente y pedir confirmación antes de iniciar].
* **Archivos Afectados:**
  - Lectura: `ruta/al/archivo.js`
  - Edición / Creación: `ruta/al/archivo_nuevo.js`
* **Lo que NO se debe tocar:** Restricciones explícitas para evitar sobre-ingeniería.
* **Criterio de Éxito (DoD):** Cómo comprobar que la fase está 100% completada.

> 📋 **Prompt para Ejecutar la Fase [N] (Copiar o ejecutar directamente):**
```text
[FASE N: Título de la Fase]
Objetivo: <Explicación precisa y directa de la tarea>.
Archivos a leer: <Lista exacta de rutas>.
Archivos a modificar o crear: <Lista exacta de rutas>.

Instrucciones específicas:
1. <Paso técnico 1>.
2. <Paso técnico 2>.

Restricciones para ahorro de tokens:
- NO inspecciones ni leas archivos fuera de la lista indicada.
- Aplica cambios quirúrgicos reemplazando únicamente las secciones necesarias.
- No ejecutes pruebas masivas ni builds a menos que se indique.

Definición de Terminado (DoD): <Criterio exacto para dar la fase por completada>.
Al finalizar, responde únicamente con un resumen de 3 viñetas de lo realizado y confirma que el DoD fue cumplido.
```

---
(Repetir el bloque para las siguientes fases)
```

---

## 3. Ejemplo Práctico de Aplicación

### Solicitud de Usuario:
> *"Quiero migrar el Modal de Cobro de la caja a Shadcn usando Dialog, Tabs para Efectivo/QR y que se vea más moderno."*

### Aplicación de la Skill:
* **Fase 1 (Instalación):** `Gemini 3.8 Flash (Low)` — Chat directo. Instalar y verificar componentes Shadcn (`npx shadcn add dialog tabs input badge`).
* **Fase 2 (UI Aislada):** `Gemini 3.8 Flash (Medium)` — Chat directo. Maquetar `ModalCobroShadcn.jsx` puro con props limpias sin tocar backend.
* **Fase 3 (Cableado Reactivo):** `Gemini 4 Neon (Medium)` — Chat directo. Reemplazar la invocación en `app/caja/_components/ModalCobro.js` verificando cálculos de cambio reactivo y cierres.
* **Fase 4 (Verificación):** Subagente `browser` o `Gemini 3.8 Flash (Low)`. Verificación visual y pruebas de cobro en efectivo y QR.

Cada fase tiene su prompt empaquetado y su asignación presupuestaria de IA, impidiendo que el agente gaste miles de tokens de razonamiento en un solo turno y preservando intactas las cuotas de modelos pesados como Argon u Opus.
