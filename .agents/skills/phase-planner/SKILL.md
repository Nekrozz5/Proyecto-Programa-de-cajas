---
name: phase-planner
description: >-
  Planifica avances, refactorizaciones y nuevas funcionalidades descomponiéndolas
  en fases atómicas secuenciales con prompts quirúrgicos listos para copiar o ejecutar,
  diseñados para maximizar el ahorro de tokens y eliminar alucinaciones.
---

# Skill: Phase Planner (Planificador por Fases Quirúrgicas)

Esta skill se activa cuando el usuario solicita planificar, descomponer o estructurar el desarrollo de una nueva funcionalidad, módulo, refactorización visual (ej. migración a Shadcn) o cambio de arquitectura.

El objetivo principal es **dividir el trabajo en fases pequeñas e independientes**, generando para cada una un **Prompt Quirúrgico** que la IA pueda ejecutar sin desperdiciar tokens de contexto ni desbordar la ventana de atención.

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

---

## 2. Formato de Salida Obligatorio

Cuando esta skill se invoque, la respuesta DEBE seguir rigurosamente esta estructura:

```markdown
## 🗺️ Desglose de Avance: [Nombre de la Funcionalidad / Módulo]

**Resumen Ejecutivo:** (1-2 oraciones explicando el alcance y el resultado final esperado).
**Impacto en Tokens:** (Estimación cualitativa: Bajo / Moderado / Alto y por qué).

---

### 📍 Fase [N]: [Título Descriptivo de la Fase]
* **Objetivo:** Qué se construye o modifica puntualmente en este paso.
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
* **Fase 1:** Instalar y verificar los componentes de Shadcn necesarios (`npx shadcn add dialog tabs input badge`).
* **Fase 2:** Maquetar el nuevo componente `ModalCobroShadcn.jsx` de forma aislada recibiendo props limpias.
* **Fase 3:** Reemplazar la invocación en `app/caja/_components/ModalCobro.js` verificando que mantenga los cálculos de cambio reactivo y cierres de modal.
* **Fase 4:** Verificación visual y pruebas de pago rápido en efectivo y QR.

Cada fase tiene su prompt empaquetado, impidiendo que el agente gaste 15,000 tokens en un solo turno y garantizando control total del código.
