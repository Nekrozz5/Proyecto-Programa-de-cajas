import { NextResponse } from 'next/server';
import { exigirUsuarioSesion } from '../../../server/sesion';
import packageInfo from '../../../package.json';

const ROLES_ADMIN = ['admin', 'propietario', 'developer'];
const GITHUB_REPO = 'Nekrozz5/Proyecto-Programa-de-cajas';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/**
 * Compara dos versiones semánticas (SemVer: "X.Y.Z").
 * @returns {number} 1 si v2 > v1 (hay actualización), -1 si v2 < v1, 0 si son iguales
 */
function compararSemVer(v1, v2) {
    const parse = (v) => {
        const limpia = String(v || '').replace(/^[vV]/, '').trim();
        const partes = limpia.split('.').map((p) => {
            const n = parseInt(p, 10);
            return Number.isFinite(n) ? n : 0;
        });
        while (partes.length < 3) partes.push(0);
        return partes.slice(0, 3);
    };

    const [maj1, min1, pat1] = parse(v1);
    const [maj2, min2, pat2] = parse(v2);

    if (maj2 !== maj1) return maj2 > maj1 ? 1 : -1;
    if (min2 !== min1) return min2 > min1 ? 1 : -1;
    if (pat2 !== pat1) return pat2 > pat1 ? 1 : -1;
    return 0;
}

export async function GET(request) {
    try {
        // 1. Autorización estricta resuelta exclusivamente en servidor
        await exigirUsuarioSesion(request, ROLES_ADMIN);

        const versionActual = packageInfo.version || '1.0.0';

        // 2. Consulta segura a GitHub Releases con timeout de 5 segundos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        let respuestaGithub;
        try {
            respuestaGithub = await fetch(GITHUB_API_URL, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'POS-Cajas-Updater',
                    'Accept': 'application/vnd.github.v3+json'
                },
                // Desactivar caché de fetch para siempre tener la versión más fresca
                cache: 'no-store'
            });
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            return NextResponse.json({
                success: true,
                versionActual,
                versionNueva: null,
                hayActualizacion: false,
                offline: true,
                mensaje: 'Modo sin conexión: No se pudo contactar con el servidor de actualizaciones.'
            });
        }
        clearTimeout(timeoutId);

        // 3. Si no hay releases o el repositorio responde error
        if (!respuestaGithub.ok) {
            return NextResponse.json({
                success: true,
                versionActual,
                versionNueva: null,
                hayActualizacion: false,
                offline: false,
                mensaje: respuestaGithub.status === 404
                    ? 'Aún no se han publicado versiones públicas en GitHub Releases.'
                    : `El servidor de actualizaciones respondió con código ${respuestaGithub.status}.`
            });
        }

        const dataRelease = await respuestaGithub.json();
        const versionRemota = String(dataRelease.tag_name || '').replace(/^[vV]/, '').trim();

        // 4. Comparar versiones SemVer
        const hayActualizacion = versionRemota ? compararSemVer(versionActual, versionRemota) > 0 : false;

        // 5. Detectar instalador ejecutable (.exe) en los assets del release
        const assets = Array.isArray(dataRelease.assets) ? dataRelease.assets : [];
        const assetInstalador = assets.find((a) => a.name && a.name.toLowerCase().endsWith('.exe')) || null;

        return NextResponse.json({
            success: true,
            versionActual,
            versionNueva: versionRemota || versionActual,
            hayActualizacion,
            offline: false,
            titulo: dataRelease.name || `Versión ${dataRelease.tag_name}`,
            notas: dataRelease.body || 'Sin notas de versión disponibles.',
            fechaPublicacion: dataRelease.published_at || null,
            urlRelease: dataRelease.html_url || `https://github.com/${GITHUB_REPO}/releases`,
            instalador: assetInstalador ? {
                nombre: assetInstalador.name,
                urlDescarga: assetInstalador.browser_download_url,
                tamanoBytes: assetInstalador.size
            } : null
        });

    } catch (err) {
        const status = err.status || 500;
        return NextResponse.json(
            { success: false, error: err.message || 'Error al comprobar actualizaciones' },
            { status }
        );
    }
}
