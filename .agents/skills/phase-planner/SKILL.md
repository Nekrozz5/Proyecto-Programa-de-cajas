---
name: phase-planner
description: >-
  Planifica avances, tareas de investigación técnica, diagnósticos, refactorizaciones
  y nuevas funcionalidades descomponiéndolas en fases atómicas secuenciales con prompts
  quirúrgicos, validación previa del modelo de IA y control estricto de tokens.
---

# Planificador por Fases para Codex

Esta skill se activa ante **cualquier solicitud de planificación, investigación técnica, diagnóstico, desarrollo de nuevas funcionalidades o refactorizaciones**.

Su doble objetivo fundamental es:
1. **Actuar como Guardián de Cuota y Modelo:** Verificar antes que nada qué modelo y nivel de esfuerzo expone el runtime de Codex. Si un dato no es visible, declararlo como `no expuesto` sin inferirlo.
2. **Dividir el trabajo en fases atómicas e independientes:** Generar para cada fase un **Prompt Quirúrgico** para evitar el desperdicio de tokens y prevenir alucinaciones.

---

## 1. Principios Obligatorios de Ahorro de Tokens

Al descomponer cualquier requerimiento, Codex debe aplicar estas reglas:

1. **Aislamiento Estricto de Contexto (Context Pruning):**
   * Cada fase debe declarar explícitamente la **lista cerrada de archivos** que se leerán o modificarán.
   * Prohibir a la IA inspeccionar carpetas no relacionadas (ej. si la fase es de UI, no se leen repositorios de base de datos ni migraciones).
2. **Edición Quirúrgica vs. Reescritura:**
   * Los prompts generados deben instruir el uso de modificaciones puntuales con `apply_patch` o diffs en lugar de reescribir componentes o scripts completos.
3. **Cero Redundancia de Contexto General:**
   * No repetir en los prompts la descripción del proyecto ni reglas ya contenidas en `.agents/PROJECT_CONTEXT.md`. Ir directo a la acción técnica concreta.
4. **Definición de Terminado (DoD - Definition of Done):**
   * Cada fase debe contar con un criterio de aceptación binario (pasa o no pasa) que se pueda verificar rápidamente antes de saltar a la siguiente.
5. **Secuencia Dependiente Lógica:**
   * Orden estándar recomendado:
     * **Fase 1: Datos y Lógica (Backend / Schema / Acciones):** Preparar persistencia y funciones sin interfaz.
     * **Fase 2: Componentes Atómicos (UI aislada):** Crear o adaptar componentes visuales puros con Shadcn/Tailwind.
     * **Fase 3: Cableado e Integración:** Conectar los componentes con la lógica/servidor.
     * **Fase 4: Verificación y Pulido:** Pruebas de borde, accesibilidad táctil y limpieza.
6. **Asignación Racional de Modelo, Rendimiento y Modo de Ejecución:**
   * Use únicamente modelos disponibles en la sesión de Codex. Como guía, asigne una variante rápida (`luna`) o generalista (`sol`) con `low`/`medium` a tareas mecánicas; una variante generalista de código (`sol`) con `medium`/`high` a lógica de negocio; una variante avanzada (`astra`) con `high`/`xhigh` a arquitectura crítica; y una variante visual (`terra`) a inspección de interfaces.
   * Reserve `max`/`ultra` para riesgos que justifiquen su costo.
   * Ejecute directamente en el chat por defecto. Delegue solo por petición explícita del usuario o autorización de una instrucción superior; no asuma agentes fijos llamados `research` o `browser`.
7. **Detección Activa de Desajuste y Confirmación de Cambio (Model Mismatch Alert):**
   * **Monitoreo del Modelo Activo:** La IA debe contrastar activamente el modelo/esfuerzo activo en el chat con la complejidad de la fase.
   * **Caso Sobredimensionado:** Si el modelo o esfuerzo activo es innecesariamente costoso para una tarea simple, sugiera una variante disponible más rápida.
   * **Caso Insuficiente:** Si la fase involucra concurrencia compleja, auditoría criptográfica o algoritmos intrincados y el modelo es ligero, sugiera una variante disponible de mayor razonamiento.
   * **Petición Obligatoria de Confirmación:** Cuando exista un desajuste, no ejecute la fase hasta recibir confirmación. No prometa cambiar el modelo mediante herramientas.

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
* **Modelo y Rendimiento Recomendado:** `[modelo disponible] ([low / medium / high / xhigh])`.
* **Modo de Ejecución:** `[Directo en chat | Delegado, solo si está autorizado]`.
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
* **Fase 1 (Instalación):** variante Codex rápida (`low`) — chat directo. Instalar y verificar componentes Shadcn (`npx shadcn add dialog tabs input badge`).
* **Fase 2 (UI Aislada):** variante Codex generalista (`medium`) — chat directo. Maquetar `ModalCobroShadcn.jsx` puro con props limpias sin tocar backend.
* **Fase 3 (Cableado Reactivo):** variante Codex generalista (`medium`) — chat directo. Reemplazar la invocación en `app/caja/_components/ModalCobro.js` verificando cálculos de cambio reactivo y cierres.
* **Fase 4 (Verificación):** variante Codex visual o generalista (`medium`) — chat directo, salvo delegación autorizada. Verificar visualmente y probar cobros en efectivo y QR.

Cada fase tiene su prompt empaquetado y una asignación proporcional de modelo y esfuerzo, evitando gastar razonamiento avanzado en tareas mecánicas.
