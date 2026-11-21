# Guía de Arquitectura y Desarrollo: Frontend vs Backend

Bienvenido al proyecto. Si eres nuevo en el repositorio o vienes a colaborar, esta guía te explicará en menos de 3 minutos cómo está dividido el sistema, dónde vive cada parte y qué archivo debes tocar según lo que quieras programar.

---

## 💡 ¿Cómo está estructurado el sistema?

Este proyecto utiliza **Next.js (App Router)** y PostgreSQL como único motor de persistencia, con un registro central de tenants y una base operativa por negocio.

En lugar de tener dos servidores o carpetas separadas (como un frontend en Vite y un backend en Express en puertos distintos), el Frontend y el Backend **coexisten dentro del mismo proyecto pero están limpiamente separados por carpetas especializadas**.

```text
programa-cajas/
│
├── 🧠 BACKEND (Servidor, Base de Datos, Lógica y Seguridad)
│   ├── database/                    # Pools pg, migraciones SQL y aprovisionamiento
│   ├── server/                      # Núcleo de lógica de servidor (Server Actions, Repositorios)
│   └── app/api/                     # Endpoints HTTP REST (Descarga de reportes Excel/CSV)
│
├── 🎨 FRONTEND (Interfaz de Usuario, Componentes React y Estilos)
│   ├── app/caja/                    # Terminal de ventas (POS) para cajeros
│   ├── app/admin/                   # Panel de control administrativo y reportes
│   └── components/ui/               # Componentes UI reutilizables (Botones, Modales, Inputs)
│
└── 🛠️ INFRAESTRUCTURA Y UTILIDADES
    └── scripts/                     # Automatizaciones (respaldos y datos semilla)
```

---

## 🧠 1. Dónde está el Backend

El Backend gestiona las transacciones, la integridad de los datos, el cálculo de inventario y la seguridad. **El usuario o navegador nunca toca estos archivos directamente.**

| Carpeta / Archivo | Responsabilidad | ¿Qué encontrarás aquí? |
| :--- | :--- | :--- |
| **`database/`** | **Capa de Persistencia** | Pools de PostgreSQL (`postgres.js`), registro central (`migraciones-control.js`) y migraciones versionadas por negocio (`migraciones-tenant.js`). |
| **`server/actions/`** | **Server Actions (`'use server'`)** | Las mutaciones protegidas que ejecuta Next.js en el servidor: registrar ventas, aperturas y cierres de turno, compras, mermas, actualización de catálogo. Todo corre dentro de `transaccion()`. |
| **`server/domain/`** | **Reglas de Negocio Puras** | Lógica financiera desacoplada: cálculo de Costo Promedio Ponderado (`costos.js`), snapshot tributario e impuestos IVA/IT (`fiscal.js`). |
| **`server/repositories/`**| **Consultas SQL** | Consultas SQL parametrizadas a la base de datos (`ventas.repo.js`, `catalogo.repo.js`, `cajas.repo.js`, `inventario.repo.js`, etc.). |
| **`server/lib/`** | **Infraestructura Técnica** | Seguridad de contraseñas (`bcryptjs`), sesiones JWT con HttpOnly (`sesion.js`), validación de secretos (`secretos.js`) y envío SMTP de correos (`mailer.js`). |
| **`app/api/`** | **Rutas REST Tradicionales** | Endpoints HTTP convencionales para operaciones que requieren streaming de archivos: descarga de Excel de 10 hojas (`app/api/reportes/route.js`), etc. |

---

## 🎨 2. Dónde está el Frontend

El Frontend es todo lo visual que se ejecuta en el navegador o en la ventana del Punto de Venta. Está construido con **React, Tailwind CSS y componentes de Shadcn UI**.

| Carpeta / Archivo | Responsabilidad | ¿Qué encontrarás aquí? |
| :--- | :--- | :--- |
| **`app/caja/`** | **Terminal de Punto de Venta (POS)** | Pantalla para cajeros. Subrutas: `pos/page.js` (pantalla táctil de cobro, catálogo, carrito) y `movimientos/page.js` (ingresos, egresos, historial de turno). |
| **`app/caja/_components/`** | **Componentes Visuales de Caja** | `CatalogoProductos.js`, `CarritoVenta.js`, `ModalCobro.js`, `ModalArqueoCiego.js`, `ModalModificadores.js`. |
| **`app/caja/_hooks/`** | **Hooks de Estado Visual** | `useCarrito.js` (lógica reactiva del carrito de compras) y `useInactividad.js`. |
| **`app/admin/`** | **Panel de Administración** | Pantalla para administradores y propietarios. Subrutas: `resumen/`, `catalogo/`, `insumos/`, `arqueos/`, `usuarios/`, `configuracion/`, `exportacion/`. |
| **`app/admin/_components/`**| **Componentes de Administración**| Formularios de productos, tablas de arqueo, kardex de insumos, gráficos (`GraficosFinancieros.js`), exportación en PDF (`exportarPDF.js`). |
| **`components/ui/`** | **Librería de Componentes** | Elementos visuales reutilizables con Shadcn: `button.jsx`, `dialog.jsx`, `table.jsx`, `input.jsx`, `badge.jsx`, `tabs.jsx`. |

---

## 🚀 Guía Rápida: "¿Quiero hacer X, qué archivo debo tocar?"

### 🔹 Casos de Frontend (Diseño, Pantallas, Botones):
1. **"Quiero cambiar cómo se ve el carrito o la calculadora de cambio":**
   👉 Ve a [app/caja/_components/ModalCobro.js](file:///app/caja/_components/ModalCobro.js) o [app/caja/_components/CarritoVenta.js](file:///app/caja/_components/CarritoVenta.js).
2. **"Quiero agregar una pestaña o un botón nuevo en el panel de administración":**
   👉 Revisa la subruta correspondiente en [app/admin/](file:///app/admin/) y sus componentes en `app/admin/_components/`.
3. **"Quiero cambiar colores o estilos globales":**
   👉 Revisa [app/globals.css](file:///app/globals.css) o las clases de Tailwind en los componentes.

### 🔹 Casos de Backend (Datos, Lógica, Base de Datos):
1. **"Quiero agregar un campo nuevo a la base de datos":**
   👉 Agrega una nueva versión en [database/migraciones-tenant.js](database/migraciones-tenant.js). Para cambios en el registro central, actualiza [database/migraciones-control.js](database/migraciones-control.js).
2. **"Quiero cambiar las reglas de cómo se descuenta el stock o los combos al vender":**
   👉 Ve a [server/actions/ventas.actions.js](file:///server/actions/ventas.actions.js) o a las reglas de dominio en [server/domain/](file:///server/domain/).
3. **"Quiero modificar una consulta SQL de reporte o catálogo":**
   👉 Ve al repositorio correspondiente en [server/repositories/](file:///server/repositories/).
4. **"Quiero modificar el correo que se envía al cerrar caja":**
   👉 Ve a [server/lib/mailer.js](file:///server/lib/mailer.js) y a la acción en [server/actions/notificaciones.actions.js](file:///server/actions/notificaciones.actions.js).

---

## ⚠️ Reglas de Oro para Colaboradores

1. **Toda escritura en Base de Datos va dentro de `transaccion()`:**
   Cualquier Server Action que inserte o actualice datos debe usar la función `transaccion(async (dbTx) => { ... })` para evitar inconsistencias de inventario o dinero.
2. **Descuento de stock atómico:**
   Todo descuento de stock en SQL debe usar una condición atómica para evitar números negativos (`UPDATE ... WHERE stock >= $1`).
3. **Sesión exclusiva en el servidor:**
   Los roles y permisos del usuario se leen siempre desde la cookie cifrada en el servidor (`server/lib/sesion.js`), nunca desde parámetros enviados desde el cliente.
