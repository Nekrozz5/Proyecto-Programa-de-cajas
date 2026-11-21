const DB_NOMBRE = 'pos-dispositivo';
const DB_VERSION = 1;
const ALMACEN = 'credenciales';
const CLAVE_ACTUAL = 'terminal-actual';

function exigirCriptografiaNavegador() {
    if (typeof window === 'undefined' || !window.indexedDB || !window.crypto?.subtle) {
        throw new Error('Este navegador no permite usar la credencial segura de la terminal.');
    }
}

function abrirBase() {
    exigirCriptografiaNavegador();
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NOMBRE, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('No se pudo abrir el almacén seguro de la terminal.'));
    });
}

async function leerCredencial() {
    const db = await abrirBase();
    try {
        return await new Promise((resolve, reject) => {
            const request = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(CLAVE_ACTUAL);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(new Error('No se pudo leer la credencial de la terminal.'));
        });
    } finally {
        db.close();
    }
}

async function guardarCredencial(credencial) {
    const db = await abrirBase();
    try {
        await new Promise((resolve, reject) => {
            const request = db.transaction(ALMACEN, 'readwrite').objectStore(ALMACEN).put(credencial, CLAVE_ACTUAL);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error('No se pudo guardar la credencial de la terminal.'));
        });
    } finally {
        db.close();
    }
}

function bytesABase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binario = '';
    for (const byte of bytes) binario += String.fromCharCode(byte);
    return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function spkiAPem(buffer) {
    const bytes = new Uint8Array(buffer);
    let binario = '';
    for (const byte of bytes) binario += String.fromCharCode(byte);
    const base64 = btoa(binario);
    const lineas = base64.match(/.{1,64}/g)?.join('\n') || base64;
    return `-----BEGIN PUBLIC KEY-----\n${lineas}\n-----END PUBLIC KEY-----`;
}

function crearChallenge() {
    if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function generarCredencial() {
    exigirCriptografiaNavegador();
    const claves = await window.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign', 'verify']
    );
    const clavePublica = await window.crypto.subtle.exportKey('spki', claves.publicKey);
    return {
        privateKey: claves.privateKey,
        clavePublica: spkiAPem(clavePublica)
    };
}

export async function emparejarTerminal({ codigo, nombre }) {
    const codigoLimpio = String(codigo || '').trim().toUpperCase();
    const nombreLimpio = String(nombre || '').trim();
    if (!codigoLimpio) throw new Error('Ingresa el código de emparejamiento.');
    if (!nombreLimpio) throw new Error('Ingresa un nombre para la terminal.');

    const credencial = await generarCredencial();
    const response = await fetch('/api/auth/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            accion: 'emparejar',
            codigo: codigoLimpio,
            nombre: nombreLimpio,
            clavePublica: credencial.clavePublica
        })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo emparejar la terminal.');

    await guardarCredencial({
        privateKey: credencial.privateKey,
        clavePublica: credencial.clavePublica,
        deviceId: Number(data.dispositivo.id),
        nombre: data.dispositivo.nombre
    });
    return data.dispositivo;
}

export async function crearPruebaDispositivo({ obligatoria = false } = {}) {
    let credencial;
    try {
        credencial = await leerCredencial();
    } catch (error) {
        if (obligatoria) throw error;
        return {};
    }

    const deviceId = Number(credencial?.deviceId);
    if (!credencial?.privateKey || !Number.isSafeInteger(deviceId) || deviceId <= 0) {
        if (obligatoria) {
            throw new Error('Esta terminal no está emparejada. Solicita un código al administrador.');
        }
        return {};
    }

    const challenge = crearChallenge();
    const signature = await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        credencial.privateKey,
        new TextEncoder().encode(challenge)
    );
    return { deviceId, challenge, signature: bytesABase64Url(signature) };
}
