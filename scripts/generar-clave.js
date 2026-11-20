#!/usr/bin/env node

/**
 * =====================================================================
 * GENERADOR DE CLAVES DE ACTIVACIÓN DE PRODUCTO (SISTEMA POS)
 * =====================================================================
 * Este script es de USO EXCLUSIVO del desarrollador/propietario del software.
 * Utiliza la llave privada Ed25519 en 'keys/licencia_privada.pem' para
 * firmar digitalmente claves que solo tú puedes crear y que son imposibles
 * de falsificar.
 *
 * Modo de uso interactivo:
 *   node scripts/generar-clave.js
 *   npm run licencia
 *
 * Modo con argumentos directos:
 *   node scripts/generar-clave.js --negocio "Ferretería Central" --dias 365
 *   node scripts/generar-clave.js --universal --vitalicia
 * =====================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const KEYS_DIR = path.resolve(process.cwd(), 'keys');
const PRIV_KEY_PATH = path.join(KEYS_DIR, 'licencia_privada.pem');
const PUB_KEY_PATH = path.join(KEYS_DIR, 'licencia_publica.pem');
const PREFIJO_CLAVE = 'POS-ACT-';

function asegurarLlaves() {
    if (!fs.existsSync(KEYS_DIR)) {
        fs.mkdirSync(KEYS_DIR, { recursive: true });
    }

    if (!fs.existsSync(PRIV_KEY_PATH)) {
        console.log('\n🔐 [Seguridad] No se encontró un par de llaves maestras. Generando nuevo par Ed25519...');
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        fs.writeFileSync(PRIV_KEY_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }), 'utf8');
        fs.writeFileSync(PUB_KEY_PATH, publicKey.export({ type: 'spki', format: 'pem' }), 'utf8');
        console.log(`✅ Llave privada guardada en: ${PRIV_KEY_PATH}`);
        console.log(`✅ Llave pública guardada en: ${PUB_KEY_PATH}\n`);
    }

    return fs.readFileSync(PRIV_KEY_PATH, 'utf8');
}

function firmarLicencia(payload, privateKeyPem) {
    const payloadStr = JSON.stringify(payload);
    const payloadBuf = Buffer.from(payloadStr, 'utf8');
    const firmaBuf = crypto.sign(null, payloadBuf, privateKeyPem);

    const payloadB64 = payloadBuf.toString('base64url');
    const firmaB64 = firmaBuf.toString('base64url');

    return `${PREFIJO_CLAVE}${payloadB64}.${firmaB64}`;
}

function formatearFecha(fecha) {
    if (!fecha) return 'Sin vencimiento (Vitalicia)';
    const d = new Date(fecha);
    return `${d.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })} (${d.toISOString().slice(0, 10)})`;
}

function parsearArgs() {
    const args = process.argv.slice(2);
    const opciones = {
        negocio: null,
        dias: null,
        vitalicia: false,
        universal: false,
        plan: 'completo',
        cajas: null,
        equipo: null
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--negocio' && args[i + 1]) {
            opciones.negocio = args[++i];
        } else if (arg === '--dias' && args[i + 1]) {
            opciones.dias = parseInt(args[++i], 10);
        } else if (arg === '--vitalicia') {
            opciones.vitalicia = true;
        } else if (arg === '--universal') {
            opciones.universal = true;
        } else if (arg === '--plan' && args[i + 1]) {
            opciones.plan = args[++i];
        } else if (arg === '--cajas' && args[i + 1]) {
            const val = String(args[++i]).trim().toLowerCase();
            if (val === 'ilimitado' || val === 'unlimited' || val === '*' || val === '0') {
                opciones.cajas = 0;
            } else {
                const num = parseInt(val, 10);
                opciones.cajas = Number.isFinite(num) && num > 0 ? num : 2;
            }
        } else if (arg === '--equipo' && args[i + 1]) {
            opciones.equipo = String(args[++i]).trim();
        }
    }
    return opciones;
}

function preguntar(rl, pregunta, valorPorDefecto = '') {
    return new Promise((resolve) => {
        const texto = valorPorDefecto ? `${pregunta} [${valorPorDefecto}]: ` : `${pregunta}: `;
        rl.question(texto, (respuesta) => {
            resolve(respuesta.trim() || valorPorDefecto);
        });
    });
}

async function modoInteractivo(privateKeyPem) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.clear();
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║        🔑 GENERADOR DE CLAVES DE ACTIVACIÓN - SISTEMA POS          ║');
    console.log('║               Exclusivo del Desarrollador / Propietario            ║');
    console.log('╚════════════════════════════════════════════════════════════════════╝\n');

    // 1. Negocio
    console.log('1️⃣  ASIGNACIÓN DE CLIENTE / ESTABLECIMIENTO:');
    console.log('   (Si especificas el nombre, la clave SOLO funcionará para ese negocio)');
    console.log('   (Si lo dejas vacío con Enter, será una clave universal para cualquier cliente)\n');
    const negocio = await preguntar(rl, '   ➤ Nombre del Negocio (o Enter para universal)', '*');

    // 2. Vigencia
    console.log('\n2️⃣  VIGENCIA DE LA LICENCIA:');
    console.log('   [1] Vitalicia (Sin fecha de vencimiento)');
    console.log('   [2] 1 Año (365 días)');
    console.log('   [3] 6 Meses (180 días)');
    console.log('   [4] 1 Mes (30 días)');
    console.log('   [5] Personalizada (especificar días)');
    const opcionVigencia = await preguntar(rl, '\n   ➤ Selecciona una opción', '1');

    let diasValidez = null;
    if (opcionVigencia === '2') diasValidez = 365;
    else if (opcionVigencia === '3') diasValidez = 180;
    else if (opcionVigencia === '4') diasValidez = 30;
    else if (opcionVigencia === '5') {
        const diasStr = await preguntar(rl, '   ➤ Número de días de validez', '365');
        diasValidez = parseInt(diasStr, 10) || 365;
    }

    // 3. Plan / Edición
    console.log('\n3️⃣  EDICIÓN / FUNCIONALIDADES:');
    console.log('   [1] Completa (Venta Directa + Lotes PEPS + Recetas + Combos)');
    console.log('   [2] Estándar (Venta Directa sin módulos avanzados)');
    const opcionPlan = await preguntar(rl, '\n   ➤ Selecciona el plan', '1');
    const plan = opcionPlan === '2' ? 'estandar' : 'completo';

    // 4. Límite de Cajas Físicas
    console.log('\n4️⃣  LÍMITE DE CAJAS FÍSICAS ACTIVAS:');
    console.log('   (Ingresa un número, por ejemplo 2, o escribe "ilimitado" para sin límite)');
    const cajasStr = await preguntar(rl, '   ➤ Máximo de cajas físicas', '2');
    const cajasNorm = String(cajasStr || '').trim().toLowerCase();
    const cajas = (cajasNorm === 'ilimitado' || cajasNorm === 'unlimited' || cajasNorm === '*' || cajasNorm === '0')
        ? 0
        : (parseInt(cajasNorm, 10) || 2);

    // 5. Vinculación a Equipo (Machine ID)
    console.log('\n5️⃣  VINCULACIÓN A EQUIPO (HARDWARE):');
    console.log('   (Ingresa POS-HW-XXXX-XXXX para bloquear a una PC específica o Enter para cualquier equipo)');
    const equipo = await preguntar(rl, '   ➤ ID de Equipo (o Enter para universal)', '*');

    rl.close();

    return generarYMostrar({
        negocio,
        dias: diasValidez,
        plan,
        cajas,
        equipo
    }, privateKeyPem);
}

function generarYMostrar({ negocio, dias, plan, cajas = 2, equipo = '*' }, privateKeyPem) {
    const fechaCreacion = new Date();
    let fechaExpira = null;

    if (dias && dias > 0) {
        fechaExpira = new Date(fechaCreacion.getTime() + dias * 24 * 60 * 60 * 1000).toISOString();
    }

    const maxCajas = cajas === 0
        ? 0
        : (Number.isFinite(Number(cajas)) && Number(cajas) > 0 ? Math.floor(Number(cajas)) : 2);
    const equipoLimpio = equipo && String(equipo).trim() !== '' && String(equipo).trim() !== '*'
        ? String(equipo).trim().toUpperCase()
        : '*';

    const payload = {
        v: 1, // Versión del esquema de licencias
        id: crypto.randomBytes(6).toString('hex').toUpperCase(),
        negocio: negocio && negocio !== '*' ? negocio.trim() : '*',
        plan: plan || 'completo',
        cajas: maxCajas,
        equipo: equipoLimpio,
        creado: fechaCreacion.toISOString(),
        expira: fechaExpira
    };

    const claveActivacion = firmarLicencia(payload, privateKeyPem);

    console.log('\n══════════════════════════════════════════════════════════════════════');
    console.log('             🎉 ¡CLAVE DE ACTIVACIÓN GENERADA CON ÉXITO!              ');
    console.log('══════════════════════════════════════════════════════════════════════\n');
    console.log(`   🏷️  Serial / ID Licencia : ${payload.id}`);
    console.log(`   🏢  Establecimiento      : ${payload.negocio === '*' ? 'Universal (Cualquier negocio)' : payload.negocio}`);
    console.log(`   📦  Edición / Plan        : ${payload.plan === 'completo' ? 'Completo (Todas las funciones)' : 'Estándar'}`);
    console.log(`   🖥️  Máximo de Cajas       : ${payload.cajas === 0 ? 'Ilimitadas' : payload.cajas}`);
    console.log(`   🔒  Equipo Autorizado     : ${payload.equipo === '*' ? 'Universal (Cualquier equipo)' : payload.equipo}`);
    console.log(`   📅  Fecha de Emisión     : ${fechaCreacion.toLocaleDateString('es-ES')}`);
    console.log(`   ⏳  Vencimiento          : ${formatearFecha(fechaExpira)}\n`);

    console.log('──────────────────────────────────────────────────────────────────────');
    console.log('CLAVE DE ACTIVACIÓN (Copia la siguiente línea completa):');
    console.log('──────────────────────────────────────────────────────────────────────\n');
    console.log(`\x1b[32m\x1b[1m${claveActivacion}\x1b[0m\n`);
    console.log('──────────────────────────────────────────────────────────────────────');
    console.log('📌 Esta clave tiene una firma digital Ed25519.');
    console.log('   Solo tú pudiste generarla con tu llave privada.');
    console.log('   El cliente la pega en la pantalla de bienvenida para activar el producto.');
    console.log('══════════════════════════════════════════════════════════════════════\n');

    return claveActivacion;
}

async function main() {
    const privateKeyPem = asegurarLlaves();
    const args = parsearArgs();

    const hayArgumentos = args.negocio || args.dias || args.vitalicia || args.universal || args.cajas !== null || args.equipo !== null;

    if (hayArgumentos) {
        const negocio = args.universal ? '*' : (args.negocio || '*');
        const dias = args.vitalicia ? null : (args.dias || null);
        const cajas = args.cajas !== null ? args.cajas : 2;
        const equipo = args.equipo || '*';
        generarYMostrar({ negocio, dias, plan: args.plan, cajas, equipo }, privateKeyPem);
    } else {
        await modoInteractivo(privateKeyPem);
    }
}

main().catch((err) => {
    console.error('❌ Error fatal al generar clave:', err);
    process.exit(1);
});
