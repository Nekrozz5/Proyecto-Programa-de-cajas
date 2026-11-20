// ==========================================
// CONFIGURACIÓN DE PM2 PARA PRODUCCIÓN LOCAL / SERVIDOR
// ==========================================

module.exports = {
  apps: [
    {
      name: 'pos-cajas',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
