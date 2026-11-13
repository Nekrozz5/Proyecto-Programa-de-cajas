// ==========================================
// CONFIGURACIÓN DE PM2 PARA PRODUCCIÓN (AWS Lightsail / EC2)
// ==========================================

module.exports = {
  apps: [
    {
      name: 'pos-cajas',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '450M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
