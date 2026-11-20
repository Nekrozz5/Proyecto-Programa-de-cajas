'use client';

import { useEffect } from 'react';
import packageInfo from '../package.json';

/**
 * Componente silencioso que detecta automáticamente si se instaló una nueva
 * versión de la aplicación. Si la versión cambió, purga las cachés del navegador
 * (CacheStorage) y desregistra Service Workers antiguos para evitar pantallas desactualizadas.
 */
export default function LimpiadorCacheCliente() {
  useEffect(() => {
    try {
      const versionActual = packageInfo?.version || '1.0.0';
      const versionGuardada = localStorage.getItem('pos_installed_app_version');

      if (versionGuardada && versionGuardada !== versionActual) {
        // 1. Borrar todas las cachés de CacheStorage (PWA / Service Workers)
        if ('caches' in window) {
          caches.keys().then((nombres) => {
            nombres.forEach((nombre) => caches.delete(nombre));
          });
        }

        // 2. Desregistrar Service Workers viejos para forzar obtención fresca de assets
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then((registros) => {
            registros.forEach((reg) => reg.unregister());
          });
        }

        // 3. Guardar la nueva versión como activa
        localStorage.setItem('pos_installed_app_version', versionActual);

        // 4. Recargar limpiamente la ventana una única vez
        window.location.reload();
      } else if (!versionGuardada) {
        localStorage.setItem('pos_installed_app_version', versionActual);
      }
    } catch {
      // Ignorar silenciosamente si localStorage está deshabilitado en modo privado estricto
    }
  }, []);

  return null;
}
