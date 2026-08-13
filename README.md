# Orden · Gestión empresarial

Aplicación web empresarial para administrar ingresos, gastos, inventario y desempeño de productos, conectada a Supabase.

## Qué permite hacer

- Elegir un rango de fechas (hoy, semana, mes, trimestre, año o personalizado).
- Registrar movimientos con producto/servicio y cantidad para cada venta.
- Analizar productos líderes, baja rotación y productos que todavía no se vendieron.
- Ver el mayor gasto del periodo, indicadores de caja y actividad financiera.
- Descargar un Excel profesional con cuatro hojas: resumen ejecutivo, movimientos, productos y controles.
- Crear una empresa, iniciar sesión y sumar colaboradores mediante un código controlado por administradores.
- Mantener productos, stock, costos, precios y nivel mínimo de reposición de forma centralizada.
- Conservar y restaurar copias de seguridad en formato JSON.

## Usar en iPhone y Android

La aplicación funciona como una **PWA instalable**. Después de publicarla en Vercel (HTTPS), puede usarse como una aplicación normal:

- **Android (Chrome):** abrí la web, tocá **Instalar aplicación** cuando aparezca el aviso o usá el menú de Chrome → **Instalar app**.
- **iPhone / iPad (Safari):** abrí la web con Safari, tocá **Compartir** → **Agregar a pantalla de inicio** → **Agregar**.

Al instalarla, Orden abre a pantalla completa y queda disponible en el inicio. El acceso a datos centralizados, inicio de sesión, inventario y movimientos requieren conexión; las copias de seguridad y el Excel se descargan en el dispositivo.

## Abrir y actualizar

1. Abrí esta carpeta en Visual Studio Code.
2. Para probarla, abrí `index.html` en el navegador o instalá la extensión **Live Server**.
3. La primera vez, creá tu cuenta y después tu empresa. Los datos se guardan en Supabase y pueden usarse desde distintos dispositivos con la misma cuenta.

## Publicar en Vercel

1. Subí estos archivos a un repositorio de GitHub.
2. En Vercel elegí **Add New → Project → Import** y seleccioná el repositorio.
3. Elegí el preset **Other**. No requiere comandos de compilación ni directorio de salida.
4. Hacé clic en **Deploy**.

Después del primer deploy, copiá la URL final de Vercel y en **Supabase → Authentication → URL Configuration** configurá:

- **Site URL:** la URL de Vercel (por ejemplo, `https://mi-orden.vercel.app`).
- **Redirect URLs:** esa misma URL y, si vas a probar localmente, `http://localhost:4173`.

Esto permite que el enlace de confirmación de correo devuelva a la aplicación correcta.

## Modelo de acceso

- La primera persona crea la empresa y queda como **Propietario**.
- El propietario o un administrador ve, desde **Configuración**, un código para sumar al equipo.
- Los vendedores pueden registrar y consultar movimientos; los administradores gestionan empresa, productos y stock.
- Cada empresa queda aislada por políticas de seguridad de Supabase. Los códigos de acceso no se exponen en listados generales.

La aplicación usa una librería de Excel y el cliente de Supabase desde CDN. La clave incluida en `supabase-config.js` es una clave pública; la seguridad real está aplicada en Supabase con autenticación, políticas RLS y funciones con permisos por rol. Nunca agregues una clave `service_role` al proyecto.
