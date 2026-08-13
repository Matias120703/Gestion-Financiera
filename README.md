# Orden · Gestión empresarial

Aplicación web estática para administrar ingresos, gastos y desempeño de productos.

## Qué permite hacer

- Elegir un rango de fechas (hoy, semana, mes, trimestre, año o personalizado).
- Registrar movimientos con producto/servicio y cantidad para cada venta.
- Analizar productos líderes, baja rotación y productos que todavía no se vendieron.
- Ver el mayor gasto del periodo, indicadores de caja y actividad financiera.
- Descargar un Excel profesional con cuatro hojas: resumen ejecutivo, movimientos, productos y controles.
- Conservar y restaurar copias de seguridad en formato JSON.

## Usar en iPhone y Android

La aplicación funciona como una **PWA instalable**. Después de publicarla en Vercel (HTTPS), puede usarse como una aplicación normal:

- **Android (Chrome):** abrí la web, tocá **Instalar aplicación** cuando aparezca el aviso o usá el menú de Chrome → **Instalar app**.
- **iPhone / iPad (Safari):** abrí la web con Safari, tocá **Compartir** → **Agregar a pantalla de inicio** → **Agregar**.

Al instalarla, Orden abre a pantalla completa, queda disponible en el inicio y mantiene las pantallas principales listas para usarse sin conexión. Las copias de seguridad y el Excel necesitan estar guardados en el dispositivo.

## Abrir y actualizar

1. Abrí esta carpeta en Visual Studio Code.
2. Para probarla, abrí `index.html` en el navegador o instalá la extensión **Live Server**.
3. Los datos se guardan en el navegador de cada dispositivo. Usá **Configuración → Descargar copia de seguridad** antes de cambiar de equipo o navegador.

## Publicar en Vercel

1. Subí estos archivos a un repositorio de GitHub.
2. En Vercel elegí **Add New → Project → Import** y seleccioná el repositorio.
3. Elegí el preset **Other**. No requiere comandos de compilación ni directorio de salida.
4. Hacé clic en **Deploy**.

La aplicación usa una librería de Excel desde CDN para generar archivos `.xlsx`. Para que varios usuarios compartan datos en tiempo real, el siguiente paso recomendado es agregar autenticación, permisos por rol y una base de datos central (por ejemplo, Supabase o PostgreSQL).
