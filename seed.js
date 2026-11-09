const db = require('./database/database');

// Función asíncrona para poblar los datos iniciales
async function inicializarDatos() {
    console.log("🌱 Insertando datos iniciales en la base de datos...");

    // 1. Crear un usuario Super Administrador por defecto
    db.run(
        `INSERT INTO usuarios (nombre, pin_o_password, rol) VALUES (?, ?, ?)`,
        ['Dueño / Super Admin', '1234', 'superadmin'],
        function(err) {
            if (err) {
                console.log("Nota: El usuario admin ya podría existir o hubo un aviso:", err.message);
            } else {
                console.log("✅ Administrador creado con éxito (PIN de acceso: 1234).");
            }
        }
    );

    // 2. Crear un producto de prueba para la cafetería (Ej. Café Americano)
    db.run(
        `INSERT INTO productos (nombre, precio, costo) VALUES (?, ?, ?)`,
        ['Café Americano', 15.00, 5.00],
        function(err) {
            if (err) {
                console.log("Nota: El producto ya podría existir:", err.message);
            } else {
                console.log("✅ Producto de cafetería ('Café Americano') registrado con éxito.");
            }
        }
    );
}

// Ejecutamos la función
inicializarDatos();