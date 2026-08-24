# Correos de la cuenta

Los que manda Supabase Auth: confirmar el correo, recuperar la contraseña y
cambiar de dirección. **No los manda la aplicación**, por eso no están en
`src/` y no se pueden desplegar con un `git push`: hay que pegarlos a mano en
el panel de Supabase.

## Dónde va cada uno

**Supabase → Authentication → Emails** (pestaña *Templates*):

| Archivo | Plantilla | Asunto sugerido |
|---|---|---|
| `confirmar-cuenta.html` | Confirm signup | `Confirmá tu correo para entrar a Orden` |
| `recuperar-clave.html` | Reset password | `Cambiá tu contraseña de Orden` |
| `cambiar-correo.html` | Change email address | `Confirmá tu correo nuevo en Orden` |

Pegá el HTML entero en el cuadro *Message body* y guardá. El asunto se carga
en el campo de arriba.

---

## Lo que más cambia la percepción no es el HTML

Es **de quién viene el correo**.

Por defecto, Supabase manda desde `noreply@mail.app.supabase.io`. Por más
lindo que sea el diseño, esa dirección se lee como "esto no es una empresa
de verdad" — y además el servidor de pruebas de Supabase tiene un límite bajo
de envíos por hora y peor entregabilidad, así que varios correos van a parar
a spam.

**La solución es configurar SMTP propio**, y ya tenés la cuenta: Resend, la
misma del resumen semanal.

### Cómo conectarlo

1. En **resend.com → Domains**, agregá tu dominio y cargá los registros DNS que
   te pide (SPF y DKIM). Sin esto, Gmail marca el correo como sospechoso.
2. Creá una API key.
3. En **Supabase → Project Settings → Authentication → SMTP Settings**,
   activá *Enable Custom SMTP* y completá:

   | Campo | Valor |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend` |
   | Password | tu API key de Resend |
   | Sender email | `hola@tudominio.com` |
   | Sender name | `Orden` |

4. Creá una cuenta de prueba y mirá cómo llega.

> **Mientras no tengas dominio propio**, el diseño igual mejora mucho respecto
> del que viene de fábrica. Pero el remitente va a seguir siendo el de
> Supabase, y eso es lo primero que ve la persona. Un dominio cuesta unos
> pocos dólares al año y es lo que más rinde de todo esto.

---

## Están en español

Las plantillas de Supabase son de un solo idioma: se elige una y esa llega a
todos. Está en español porque es donde están tus clientes hoy.

El día que haya usuarios en otro idioma, la salida es dejar de usar los
correos de Supabase y mandarlos desde la app, donde ya sabemos el idioma de
cada persona (`src/i18n`). Es bastante más trabajo; no vale la pena hasta que
haya alguien del otro lado que lo necesite.
