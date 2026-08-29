# Orden · Gestión financiera

Sistema para registrar ventas y gastos en segundos y ver la ganancia real todos los días.
Pensado para el comerciante que vende en la calle, no para el contador.

- **Registro por voz, foto o texto.** Decís *"vendí dos perfumes a 150 mil cada uno"* y el sistema lo carga solo.
- **Ganancia real.** Bruta, neta y margen, calculados con el costo que tenía el producto el día de la venta.
- **Excel presentable.** Cinco hojas, listo para mandar o imprimir, por el rango de fechas que elijas.
- **Retos con meta.** Ponés un objetivo con fecha límite y te dice a qué ritmo tenés que ir.
- **Multi-empresa y multi-usuario.** Cada negocio ve solo sus datos, con separación aplicada en la base de datos.
- **El comprobante queda guardado.** La foto del ticket se pega al movimiento y se busca después.
- **Cierre del día y racha.** Diez segundos a la noche para saber cómo te fue, y un contador de días seguidos.
- **Avisos.** Recordatorio a la hora que elijas y resumen de la semana por email.
- **Seis idiomas.** Español, inglés, portugués, alemán, francés e italiano.
- **Planes con prueba de 14 días** sin tarjeta.
- **Se instala como app** en Android y iPhone. Abre sin señal.

---

## Puesta en marcha (una sola vez)

### 1. Base de datos

En [supabase.com](https://supabase.com) creá un proyecto (o usá el que ya tenías).

Abrí **SQL Editor → New query**, pegá todo el contenido de `supabase/schema.sql` y tocá **Run**.
Ese archivo crea las tablas, las funciones y las reglas de seguridad. Es idempotente: se puede
volver a ejecutar cuantas veces quieras sin romper nada ni borrar datos.

**Si ya tenías Orden funcionando**, ejecutá solo lo que te falte de `supabase/migrations/`
(o `schema.sql` entero, da lo mismo). La `002` reconstruye los subtotales y descuentos de tus
ventas viejas sin perder un solo movimiento.

> La `003` **elimina la columna `empresas.codigo_acceso`** después de copiarla a la tabla
> `empresa_accesos`. Aplicala junto con esta versión del código, no antes: la versión anterior
> de la app leía esa columna.

> `schema.sql` se genera solo con `npm run esquema` a partir de `supabase/migrations/`.
> No lo edites a mano: editá la migración correspondiente.

Después, en **Authentication → Providers → Email**, si querés probar rápido desactivá
*Confirm email* para no tener que confirmar el correo cada vez.

### 2. Variables de entorno

Copiá `.env.example` a `.env.local` y completá. **Lo mínimo para que arranque** son las dos
primeras; todo lo demás enciende una función y se puede dejar vacío.

```
NEXT_PUBLIC_SUPABASE_URL=https://tuproyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Están en **Supabase → Project Settings → API**.

> **Nunca pongas una clave real en `.env.example`.** Ese archivo se sube a GitHub;
> `.env.local` no. Si alguna vez pegaste una clave donde no iba, revocala y creá otra:
> una clave que estuvo un minuto en un repositorio público hay que darla por perdida.

#### Lo que enciende cada variable

| Variable | Para qué | Si falta |
|---|---|---|
| `OPENAI_API_KEY` | Voz, foto y texto libre | Queda solo la carga manual. Todo lo demás anda |
| `SUPABASE_SERVICE_ROLE_KEY` | Webhooks de pago y tareas programadas | No se activan planes ni salen avisos |
| `NEXT_PUBLIC_VAPID_PUBLICA` / `VAPID_PRIVADA` | Avisos push | El botón de avisos no aparece |
| `RESEND_API_KEY` / `EMAIL_REMITENTE` | Resumen semanal por email | No sale el correo del lunes |
| `CRON_SECRETO` | Autoriza las tareas programadas | Las tareas responden 401 |
| `PASARELA` + sus claves | Cobrar la suscripción | La pantalla de planes avisa que no hay forma de pago |
| `NEXT_PUBLIC_SITIO` | Enlaces de los emails y vuelta del pago | Apunta a localhost |

`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `VAPID_PRIVADA` **nunca** llevan el prefijo
`NEXT_PUBLIC_`. Esas claves viven solo en el servidor. Con `NEXT_PUBLIC_`, cualquiera que
abra tu web las lee.

#### Claves de avisos push

Las generás una sola vez, sin cuenta en ningún lado:

```bash
npx web-push generate-vapid-keys
```

La pública va en `NEXT_PUBLIC_VAPID_PUBLICA` (esta sí es pública, la necesita el navegador)
y la privada en `VAPID_PRIVADA`.

#### Secreto de las tareas programadas

Las tareas mandan correos y usan la clave de servicio, así que no pueden quedar abiertas a
quien adivine la URL. Generá uno cualquiera:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ponelo en `CRON_SECRETO`. En Vercel, además, cargá el mismo valor como `CRON_SECRET`: es el
que Vercel Cron manda solo en la cabecera `Authorization`.

### 3. Arrancar

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000`, creá tu cuenta y después tu empresa.

---

## Publicar en internet

1. Subí esta carpeta a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com): **Add New → Project → Import**, elegí el repositorio.
   Vercel detecta Next.js solo, no toques nada.
3. En **Environment Variables** cargá las tres variables del paso 2.
4. **Deploy**.

Cuando termine, copiá la URL de Vercel y volvé a Supabase → **Authentication → URL
Configuration**:

- **Site URL:** la URL de Vercel.
- **Redirect URLs:** esa misma URL y `http://localhost:3000` para probar local.

### Instalarla en el celular

- **Android (Chrome):** menú de los tres puntos → *Instalar aplicación*.
- **iPhone (Safari):** *Compartir* → *Agregar a pantalla de inicio*.

Queda con ícono propio y abre a pantalla completa. El micrófono y la cámara funcionan
igual que en una app nativa.

---

## Cómo se usa el día a día

**Vendiendo en la calle.** Abrí *Vender*, tocá los productos, tocá *Cobrar*. Dos toques por
venta. Si es algo que no está en tu catálogo, usá *+ Suelto*.

**Con las manos ocupadas.** Tocá el botón verde flotante → *Hablar* y contá lo que pasó.
El sistema lo interpreta, te lo muestra para que confirmes, y recién ahí lo guarda.
Nunca guarda nada sin que vos lo veas.

**Cerrando el día.** *Reportes* → elegís *Hoy* → *Descargar Excel*. Cinco hojas: resumen
ejecutivo, ranking de productos, detalle de movimientos, gastos por categoría y el
resultado de cada día.

**Durante un reto.** *Reto* te muestra cuánto llevás, cuánto falta, cuánto necesitás por
día para llegar, si vas adelantado o atrasado, y a dónde llegás si seguís a ese ritmo.

---

## Avisos y tareas programadas

Dos tareas corren solas en Vercel. Ya están declaradas en `vercel.json`, así que se activan
en el primer despliegue; lo único que hay que cargar son las variables.

| Tarea | Cuándo | Qué hace |
|---|---|---|
| `/api/tareas/recordatorio` | cada hora | Avisa por push a quien tiene racha viva y hoy no cargó nada |
| `/api/tareas/resumen-semanal` | lunes 11:30 UTC | Manda el resumen de los últimos siete días por email |

El horario del cron está en **UTC**. Las 00:00 UTC son las ~20:00 en Asunción, que es
cuando tiene sentido decirle a alguien que todavía no cargó nada.

### Cada cuánto puede correr (y por qué importa)

Esto lo decide **el plan de Vercel**, no el código:

| Plan de Vercel | `CRON_RECORDATORIO` | Qué hace |
|---|---|---|
| Hobby (1 corrida por día) | `diario` (por defecto) | Ignora la hora elegida y manda en la corrida del día |
| Pro (corridas por hora) | `cada-hora` | Le escribe a cada negocio a SU hora local |

> **Ojo con esto.** En Hobby, comparar la hora local contra la elegida no falla a veces:
> **no manda nunca**. Con una sola corrida diaria, la hora del servidor no va a coincidir
> jamás con las 20:00 que eligió la persona. Por eso el modo `diario` afloja esa condición.
> La tabla `envios` sigue garantizando uno por día, así que no hay riesgo de repetidos.

Cuando pases a Vercel Pro: poné el cron en `0 * * * *` y `CRON_RECORDATORIO=cada-hora`.

**A quién se le escribe y a quién no.** Solo se avisa a quien lleva **dos días o más** de
racha. A quien todavía no tiene el hábito, una notificación no se lo crea: lo único que
logra es enseñarle a ignorar nuestros avisos. Y como máximo uno por día: la clave única de
la tabla `envios` lo garantiza, no un `if` en el código.

El resumen semanal va **solo a propietarios y administradores**, porque trae ganancia y
márgenes. Mandárselo a un vendedor sería saltarse por la puerta de atrás el permiso por
columna que impone la base.

Para probarlas a mano:

```bash
curl -H "Authorization: Bearer TU_CRON_SECRETO" https://tudominio.com/api/tareas/recordatorio
```

---

## La cuenta personal

Orden atiende a dos públicos con un solo sistema. **La cuenta personal no es
un producto aparte: es el comercial menos ventas y productos.** Restar es
barato; mantener dos sistemas era lo caro.

Se elige al crear la cuenta, en la primera pregunta de la pantalla —antes que
el nombre— porque de ahí cuelga todo: el largo de la prueba (20 días un
comercio, 14 una persona), el precio, y qué pantallas van a existir.

### Qué desaparece, y por qué desaparece

En una cuenta personal **Vender, Productos y Reto no existen**. No se muestran
en gris ni con un candado: no están en el menú, y las páginas redirigen si
alguien escribe la URL a mano.

Una pantalla que se ve pero no sirve es peor que una que no existe: invita a
tocarla y después decepciona. Y un reto de ventas no significa nada para quien
anota su sueldo.

En la barra de abajo del celular, **el lugar de Vender lo ocupa Deudas**. No es
relleno: para alguien que lleva sus finanzas, saber cuánto debe y cuándo vence
la cuota es lo que más mira. Es la pantalla que justifica la suscripción, así
que va a un toque.

### El tipo que sobra

Con las deudas, el problema fue un tipo que **faltaba**: sin `deuda`, el modelo
empujó «debo cinco millones» al casillero más parecido y lo cargó como
ingreso.

Acá el problema es el inverso: un tipo que **sobra**. Si la captura por voz
tiene `venta` disponible en una cuenta personal, la va a usar — *«cobré mi
sueldo»* y *«me pagaron los 500 mil»* se parecen bastante a una venta. Y una
venta mueve stock y espera productos que en esta cuenta no existen.

Por eso el prompt de cuenta personal es **otro**, no el mismo con una nota al
pie: conoce cuatro tipos (`ingreso`, `gasto`, `deuda`, `pago_deuda`), dice
explícitamente que «venta» no existe, y trae sus propias categorías —Sueldo,
Comida, Alquiler, Salud— en vez de las de un comercio.

Y no se confía solo en la instrucción. **El saneo del servidor también lo
aplica**: si el modelo igual devolviera `venta` en una cuenta personal, se
convierte en el `ingreso` que en realidad era. Una instrucción se puede
ignorar; el saneo no.

Tampoco se le pide el catálogo a la base: no hay productos que vincular, así
que es una consulta menos y un prompt más corto.

### Cómo se probó

Con llamadas reales al modelo, usando el prompt de verdad:

```
OK  "cobré mi sueldo, cuatro millones"          → ingreso · Sueldo
OK  "me pagaron quinientos mil por un trabajo"  → ingreso
OK  "pagué el alquiler, un millón ochocientos"  → gasto · Alquiler
OK  "debo tres millones de la tarjeta"          → deuda · tarjeta
OK  "pagué la cuota de la tarjeta"              → pago_deuda, imputado
```

Ocho de ocho, sin una sola venta y sin items.

---

## Cobrar la suscripción

### Planes

Orden le vende a **dos públicos distintos**, y por eso hay dos listas.

**Para un comercio** — 20 días de prueba:

| Plan | Guaraníes | Dólares | Para quién |
|---|---|---|---|
| Pro | Gs. 190.000 / mes | US$ 24,99 / mes | Hasta 3 vendedores, 600 capturas con IA al mes, comprobantes, Excel |
| Premium | desde Gs. 250.000 / mes | desde US$ 32,99 / mes | Sin tope de vendedores, 3.000 capturas al mes, roles |

**Para una cuenta personal** — 14 días de prueba:

| Plan | Guaraníes | Dólares | Para quién |
|---|---|---|---|
| Personal | Gs. 60.000 / mes | US$ 7,99 / mes | Sueldo, gastos y deudas. Sin ventas ni productos |

Premium es **«desde»**: cada vendedor por encima de los 3 que trae Pro suma
**Gs. 60.000 al mes**. 250.000 es el primer escalón —cuatro vendedores— y por
eso es el número que se muestra. El precio final se cierra por WhatsApp.

**Los vendedores no pagan.** La suscripción la paga una sola persona: el dueño.

### Por qué el mismo plan cuesta distinto

Una cuenta personal y un comercio pueden estar los dos en plan `pro`, con los
mismos topes y las mismas funciones, y pagar tres veces distinto. No es una
inconsistencia: **no reciben el mismo valor.**

Al comerciante, Orden le dice cuánta plata ganó de verdad. Eso se paga solo. A
quien lleva sus finanzas personales le dice cuánto debe y cuándo vence la
cuota; le sirve, pero no le genera un guaraní. Cobrarles lo mismo sería no
haber entendido a ninguno de los dos.

Por eso el plan sigue decidiendo **qué se puede hacer** (`limites_plan()`), y
el par `tipo_cuenta` + `plan` decide **cuánto se paga**. Dos preguntas
distintas, dos respuestas distintas. Ver la migración 017.

El anual da **dos meses gratis**: se calcula de los propios importes con
`mesesDeRegalo()`, así que si mañana cambian, el cartel sigue diciendo la
verdad o desaparece — nunca miente.

**Los precios viven en la tabla `precios`, no en el código.** Cambiar uno es un
`update` en Supabase; no hace falta desplegar nada. Para abrir un país nuevo se
agrega una fila con su moneda.


**Toda empresa nueva arranca con 14 días de Pro, sin tarjeta.** Cuando vence cae a gratis:
sigue viendo todo su historial y cargando a mano, y pierde la captura ilimitada, los
comprobantes y el Excel. Nunca se le quitan los datos a nadie.

### Elegir la pasarela

`PASARELA` acepta `ninguna` (por defecto), `stripe` o `pagopar`.

**Antes de elegir, verificá desde qué país vas a facturar.** Stripe no opera con cuentas de
todos los países, y Paraguay es uno de los que quedan afuera; lo mismo Mercado Pago. Si
facturás desde Asunción, lo que corresponde es Pagopar o Bancard, que además cobran en
guaraníes y aceptan transferencia y billeteras locales, que es como paga de verdad el
comerciante paraguayo.

- **Stripe** está implementado de punta a punta: checkout, webhook con verificación de
  firma, altas, bajas, impagos y cancelaciones.
- **Pagopar** está declarado y **sin implementar a propósito**. Si lo activás sin terminarlo,
  el checkout devuelve 501 y la pantalla lo dice. Un checkout que redirige a una URL
  inventada sería mucho peor que uno que avisa que todavía no está. Lo que falta está
  anotado en `src/lib/pagos.ts`.

### Conectar Stripe

1. `PASARELA=stripe` y `STRIPE_SECRET_KEY=sk_live_...`
2. En **Stripe → Developers → Webhooks**, agregá `https://tudominio.com/api/pagos/webhook`
   escuchando `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted` e
   `invoice.payment_failed`.
3. Copiá el *signing secret* a `STRIPE_WEBHOOK_SECRET`.
4. Opcional: creá los precios en Stripe y pegá cada `price_id` en
   `precios.referencia_externa`. Sin eso el precio se arma al vuelo, que sirve para probar.

**El plan lo activa el webhook, nunca la pantalla de "gracias".** Volver de la pasarela a
`/plan?pago=listo` no prueba nada: esa URL se puede escribir a mano. Lo único que activa un
plan es `aplicar_suscripcion()`, que solo puede llamar `service_role` desde un webhook con
firma verificada.

---

## Cuando se termina la prueba

Se deja de **cargar**, no de **mirar**.

La cuenta vencida sigue entrando, viendo todo su historial y bajándose su
Excel. Lo único que no puede es agregar algo nuevo: ni una venta, ni un gasto,
ni una deuda, ni un comprobante, ni el cierre del día.

### Por qué no se bloquea la cuenta entera

Porque los datos son de esa persona, no nuestros. Dejar a alguien afuera de
sus propios números es la clase de cosa que genera un mensaje furioso y mala
fama — y en un mercado donde los comerciantes se conocen entre ellos, esa fama
cuesta más que la suscripción que se estaría forzando.

Solo lectura tiene **la misma presión** que bloquear —para seguir trabajando
hay que pagar— sin quedarse con lo ajeno. Y el Excel pasa a ser el mejor
argumento de venta que hay: *«mirá todo lo que cargaste, seguí desde donde
estás»*.

Por la misma razón, **el DELETE queda libre**: vaciar el negocio y borrar la
cuenta funcionan con la cuenta vencida. Nadie debería tener que pagar para
poder irse.

### `gratis` cambió de significado

Antes era un plan: 20 capturas con IA al mes y **carga manual sin límite**.
Para un almacén chico eso alcanzaba de sobra — era un sistema financiero
completo, gratis para siempre, y nadie tenía motivo para pagar.

Ahora `gratis` significa **cuenta vencida**. El plan ya no existe como
destino: se prueba y se paga.

El tope de IA pasó de 20 a **cero**, y no por mezquindad: si igual no va a
poder guardar el movimiento, gastar créditos de OpenAI para producir un
borrador que después rebota es tirar plata sin darle nada a nadie.

El Excel, en cambio, pasó de `false` a **`true`**. Es el corazón de todo esto.

### Por qué con triggers y no con políticas

Se escribe desde muchos lados: políticas RLS para los gastos, `registrar_venta`
para las ventas, `crear_deuda` y `registrar_pago_deuda` para las deudas,
`adjuntar` para los comprobantes, `marcar_cierre` para el cierre. Poner el
control en cada uno significa que el día que se agregue una ruta nueva y
alguien se olvide, **se abre un agujero silencioso** — de esos que no fallan,
simplemente dejan pasar.

Un trigger por tabla lo agarra todo, venga por donde venga, incluidas las
funciones `security definer` que saltean RLS. Una definición por tabla en vez
de una por camino.

Hay una excepción deliberada: **si no hay sesión, pasa**. Una escritura sin
`auth.uid()` no es de un cliente — es el webhook de pagos, una tarea
programada o una migración. Si se bloquearan, un pago no podría registrarse
justamente cuando la cuenta está vencida, que es cuando más falta hace.

### Se avisa antes del choque

`estado_cuenta()` le dice a la pantalla en qué situación está, y una franja lo
explica arriba de todo:

- **vencida** → qué sí se puede hacer (mirar, bajar el Excel) y el botón para
  activar;
- **tres días o menos** → cuántos quedan;
- **último día** → aparte, porque «mañana» y «en tres días» no se leen igual.

Con la cuenta al día no se muestra nada. Una franja permanente pidiendo plata
convierte el producto en un cartel publicitario.

---

## Suscribirse es abrir un WhatsApp

No cargar una tarjeta. En Paraguay, entre pedirle a un comerciante que ponga
los datos de su tarjeta en un formulario de un sistema que recién conoce, y
que le escriba a una persona para arreglar una transferencia, **lo segundo
cierra muchas más ventas**. No es una limitación técnica: es cómo se hacen los
negocios ahí.

El mensaje va escrito de antemano con el negocio, el plan y el precio. Importa
más de lo que parece: sin eso, del otro lado llegan diez «hola» sueltos por
día y hay que preguntar todo de nuevo, con lo que cada suscripción tarda dos
días en vez de diez minutos.

Premium no manda precio sino **la pregunta**, porque depende de cuántos
vendedores sean.

El número sale de `NEXT_PUBLIC_WHATSAPP`. **Si no está configurado el botón no
se dibuja** y vuelve solo el camino de la pasarela: las dos rutas conviven sin
tocar código. Nunca un botón que no lleva a ningún lado.

---

## Idiomas

Español (el original), inglés, portugués, alemán, francés e italiano.

Cada **persona** elige el suyo desde *Ajustes*, no el negocio: en un local pueden trabajar
alguien que lee español y alguien que lee portugués, y el negocio es uno solo. La elección
se guarda en una cookie —para que lo que se ve cambie al instante— y también en la base,
para que la siga en otro dispositivo.

Español e inglés están completos. Los otros cuatro están traducidos en lo que más se usa y
**lo que falta cae a inglés**, nunca a una clave cruda en pantalla.

Los números y las fechas también cambian: separador de miles, decimal, nombre de los meses
y abreviaturas de escala salen del idioma activo.

### Agregar o completar un idioma

1. Crear (o editar) `src/i18n/textos/<código>.ts`.
2. Sumarlo a `IDIOMAS` y `FICHA` en `src/i18n/idiomas.ts`, y a `DICCIONARIOS` en
   `src/i18n/diccionarios.ts`.

Ninguna pantalla se toca. El tipo `Textos` sale del diccionario español, así que si agregás
un texto nuevo allá y te olvidás de inglés, no compila.

> **Ojo con `es.ts`:** no lleva `as const`. Con `as const`, cada texto sería su propio tipo
> literal y ninguna traducción compilaría (`'Speichern'` no es asignable a `'Guardar'`).

---

## Comprobantes

La foto del ticket se guarda pegada al movimiento y se ve desde el historial.

- El bucket `comprobantes` es **privado** y lo crea la migración `007` sola. Cada foto se
  muestra con una URL firmada que vence a los diez minutos.
- **La foto se achica en el navegador antes de subir**, a 1600 px de lado largo y WebP. La
  cámara de un celular saca fotos de 3 a 6 MB; comprimidas quedan en unos 150 KB y el ticket
  se lee igual. Sin eso, diez fotos por día son 9 GB de storage al año — que se pagan todos
  los meses.
- **El audio no se guarda, la transcripción sí.** De una nota de voz lo único que sirve
  después es lo que se dijo. Guardar el archivo costaría storage todos los meses para que
  nadie lo vuelva a escuchar nunca.
- Guardar comprobantes es del plan Pro. El límite lo impone la base, no la pantalla.

---

## Sin conexión

La app se instala y **abre sin señal**, porque se usa en la calle y la señal se corta.

Lo que hace el service worker (`public/sw.js`) es exactamente esto y nada más:

- guarda los archivos estáticos, que llevan hash y no cambian nunca;
- si no hay red, muestra `/sin-conexion` en vez del dinosaurio del navegador;
- recibe los avisos push y abre la pantalla correcta al tocarlos.

**No cachea datos a propósito.** Un total de ventas viejo mostrado como si fuera el de hoy
es peor que no mostrar nada. Cuando se cae la conexión aparece una franja ámbar abajo: sin
ella, un guardado que no salió parece un guardado que salió.

---


## Deudas

Tarjetas, préstamos y lo que se le debe al proveedor. Está adentro de Orden y
no en otro sistema porque **el comerciante debe plata igual o más** que
cualquiera: la cuota del préstamo con el que compró la mercadería, la tarjeta,
lo que le fía el proveedor.

La pantalla se ordena **por urgencia, no por monto**: lo vencido primero, lo
que vence pronto después. Quien entra ahí no viene a mirar el total, viene a
saber qué tiene que pagar y cuándo.

### El saldo solo baja pagando

`saldo` es lo que falta, y **no se puede editar**. Solo lo cambia
`registrar_pago_deuda()`, y cada pago queda con su fecha en `pagos_deuda`.

Si el saldo se pudiera escribir a mano, el historial de pagos dejaría de
explicarlo y no habría forma de saber cuál de los dos dice la verdad. Es la
misma regla que con las ventas: los números importantes se mueven por una
puerta y esa puerta deja rastro.

Tampoco se puede pagar de más: lo que sobra se informa y no se aplica. Sin
eso, un dedo de más dejaría un saldo negativo, que es un estado que no existe
en la vida real.

### ¿Pagar una cuota es un gasto?

En contabilidad estricta no del todo: devolver capital baja una deuda, no es
un gasto del período. Pero Orden no le habla a un contador, le habla a alguien
que quiere saber cuánta plata le queda — y para esa persona, la cuota **salió
de su bolsillo**.

Por eso al registrar el pago se crea también el gasto (categoría `Deudas`),
con una casilla marcada por defecto que se puede desmarcar. Quien lleva la
contabilidad fina la apaga; el resto ve la plata salir, que es lo que espera.

### Quién las ve

**Solo el propietario y los administradores.** Cuánto debe el negocio es del
mismo orden que los costos: la base no se lo devuelve a un vendedor, y la
pantalla se lo explica en vez de dejar que salte un error.

### Dictarlas, igual que una venta

Se cargan hablando, sacando una foto o escribiendo, con el mismo botón que
todo lo demás. Esto costó un error caro y vale la pena dejarlo escrito.

Al principio la captura conocía **tres** tipos: venta, gasto e ingreso. Alguien
dijo *«tengo una deuda en el banco Atlas, debo cinco millones de mi tarjeta»* y
quedó guardado como **otro ingreso**: cinco millones sumados a las ganancias de
un negocio que no había visto un guaraní.

La lección no es que el modelo se equivocó. Es que **un tipo que falta no
produce un "no sé": produce una respuesta segura y errada.** El modelo empujó
la frase al casillero más parecido de los que tenía. Cuando una clasificación
no puede decir "esto no entra acá", la falta de una opción se paga en datos
mal cargados, sin un solo error a la vista.

Por eso ahora existen dos tipos más:

- **`deuda`** — se contrae una obligación. **No es un movimiento**: no entró ni
  salió plata del cajón por firmarla, así que no toca las ventas ni los gastos
  del día. Va a su propia tabla.
- **`pago_deuda`** — se paga una cuota de una deuda que ya está cargada.

Al interpretar, el servidor le pasa al modelo **las deudas que ya existen**,
para que *«pagué la cuota de la tarjeta»* sepa de cuál tarjeta habla. Ese
`deuda_id` **se valida contra las deudas reales de la empresa** antes de usarse:
un id inventado se descarta y la pantalla pide elegir a mano. Un pago que no
sabe a qué deuda va no se guarda — sería plata saliendo sin que baje ningún
saldo.

Esa lista se le pasa **solo para reconocer pagos**, nunca para completar una
deuda nueva: sin esa aclaración el modelo le ponía al préstamo recién dictado
el banco de otra deuda de la lista, inventándole un acreedor que nadie nombró.
Y si lo que se dicta se parece a algo ya cargado, avisa antes de guardar: una
deuda duplicada hace parecer que se debe el doble.

El prompt vive en `src/lib/captura.ts` y no dentro de la ruta a propósito. La
ruta importa `next/server` y no se puede ejecutar suelta, y el prompt es
justamente la pieza que hay que poder probar: acá el error no estuvo en el
código sino en una regla mal escrita.

Una salvedad: al cargar una **deuda nueva por foto**, la imagen se lee pero no
se archiva — los comprobantes cuelgan de un movimiento, y una deuda no lo es.
Lo que la foto decía queda en los datos de la deuda. En un **pago** sí se
archiva, porque ahí sí hay gasto del que colgarla.

---

## El panel de quien administra Orden

Mientras el cobro sea por transferencia y WhatsApp, alguien tiene que poder
activar una cuenta a mano cuando entra el pago. **Sin este panel no se le
puede cobrar a nadie**, así que no es una comodidad: es la pieza que hace que
el negocio exista.

Vive en `/admin`, fuera del grupo `(app)`, porque no pertenece a ninguna
empresa y no debe tener la navegación del negocio.

### La regla: ve cuentas, no plata

Para activarle el plan a alguien hace falta su nombre, su correo, qué plan
tiene y cuándo vence. **No hace falta saber cuánto vendió, qué compró ni a
quién le debe.**

Por eso ninguna función del panel devuelve un monto, una descripción, un
producto ni una deuda. Y no es una promesa escrita en un comentario: hay una
prueba que le pasa una lista de palabras prohibidas —`monto`, `saldo`,
`costo`, `precio`, `deuda`…— a lo que el panel devuelve, **y falla si aparece
alguna**. Si mañana alguien agrega un campo de más sin pensarlo, la suite se
pone roja antes de que llegue a producción.

Sí devuelve señales de **uso**: cuántos movimientos tiene la cuenta, cuándo
fue el último y cuántas capturas de IA consumió este mes. Sin eso es
imposible saber si una cuenta está viva o si alguien está quemando créditos
de OpenAI. Un conteo y una fecha no dicen nada del negocio de nadie.

Lo que esto **no** puede evitar: quien administra la base de datos siempre
puede leerla. Eso no lo cambia ninguna función. Lo que sí se logra es que el
panel no tenga forma de mostrarlo, ni por accidente ni por comodidad — que es
lo que permite prometerle a un comerciante que sus números no los mira nadie,
y que sea verdad.

### Quién entra

Una tabla `superadmins`, no un rol dentro de `miembros`. Es un permiso **por
encima** de todas las empresas, y mezclarlo con los roles de negocio haría
que un error en una consulta de permisos comunes pudiera, en el peor caso,
dar permisos de sistema.

**Nadie se agrega solo.** La tabla no tiene política de INSERT, y además el
privilegio está revocado a `authenticated`. Son dos cerrojos a propósito:
Supabase le otorga por defecto todos los permisos de tabla a `authenticated`
sobre lo nuevo que aparece en `public`, así que confiar solo en «no hay
policy» sería confiar en una configuración de la nube que no controlamos. Se
carga desde el editor SQL.

Y no existe una pantalla de «no tenés permiso»: a quien no administra se lo
manda a su propio panel, sin decirle que esto existe. Una puerta que anuncia
que está cerrada invita a golpearla.

### Ordenado por urgencia, no por nombre

La lista arranca filtrada por **vencen pronto**, y ese es el punto. Con
veinte clientes, que el dueño escriba por WhatsApp el día 11 de una prueba
convierte muchísimo más que cualquier notificación automática. **El panel no
es solo donde se activan cuentas: es la lista de a quién hay que escribirle
hoy.**

### Activar suma, nunca resta

Cuando entra una transferencia, `cambiar_plan_cuenta()` **suma** el mes al
tiempo que ya tenía. Si a alguien le quedaban seis días pagos y transfiere
antes, no los pierde. Sin ese `greatest()`, adelantarse al pago te castigaba.

`extender_prueba()` solo estira, con tope de 90 días. Recortarle la prueba a
alguien que la está usando no debería poder hacerse de un clic.

### Todo queda anotado

Cada acción del panel se escribe en `registro_admin` con quién, cuándo, qué
había antes y una nota libre.

No es burocracia. El día que alguien diga «me cortaste sin avisar» o «yo
pagué y no me activaste», esto es lo único que sabe quién tiene razón —
incluso cuando el error es propio. Un registro donde cualquiera pueda
escribir no sirve para auditar nada, así que el INSERT también está revocado:
solo entran filas desde las funciones `security definer`.

### Cortar no es secuestrar

Bajar a gratis corta la carga, pero la persona **sigue entrando, viendo lo
suyo y bajándose su Excel**. Tiene la misma presión que bloquear —para seguir
trabajando hay que pagar— sin quedarse con los datos de nadie. En un mercado
donde los comerciantes se conocen entre ellos, esa diferencia vale más que
cualquier suscripción forzada.

---

## Irse, y empezar de nuevo

Dos cosas distintas, las dos en **Ajustes → Zona delicada** (hay que abrirla:
un botón rojo suelto es un botón que alguien toca por curiosidad).

### Empezar de cero

Borra ventas, gastos, productos y comprobantes. **El negocio se queda**: el
equipo, el plan y el código de invitación siguen igual. Sirve después de
probar el sistema, o cuando el primer mes se cargó todo mal.

Es la única puerta por la que un movimiento se borra de verdad — lo normal es
**anular**, que deja el rastro. Por eso pide escribir el nombre exacto del
negocio: un «¿estás seguro?» se toca sin leer.

> El consumo de IA del mes **no** se reinicia, a propósito. Si se reiniciara,
> vaciar el negocio sería una forma de tener capturas gratis infinitas.

### Borrar la cuenta

Se va la cuenta y todo lo cargado. Antes de confirmar, la pantalla dice
exactamente qué negocios desaparecen, cuántos movimientos se pierden y de
cuáles solo se sale.

Las reglas las impone la base de datos, no la pantalla:

| Situación | Qué pasa |
|---|---|
| Sos el único en tu negocio | Se borra entero |
| Sos propietario y hay más gente adentro | **No se borra nada.** Hay que sacarlos primero |
| Sos vendedor o admin en el negocio de otro | Solo se va tu membresía; lo que cargaste se queda |

La segunda fila es la que importa: darle de baja el sistema —y la
contabilidad— a personas que están trabajando sería mucho peor que no dejar
irse a alguien.

**Se borra de verdad.** No hay «marcado como borrado»: las filas desaparecen y
los archivos de Storage se eliminan. Storage no entiende de claves foráneas,
así que las rutas se averiguan *antes* de borrar los datos — después ya no
habría forma de saber cuáles eran.

---

## Ayuda y contacto

En Ajustes aparece un WhatsApp y un correo de soporte, si están configurados
(`NEXT_PUBLIC_WHATSAPP_SOPORTE` y `NEXT_PUBLIC_EMAIL_SOPORTE`). Si no hay
ninguno, la sección no se muestra: es peor prometer soporte y que el enlace no
lleve a ningún lado.

Va WhatsApp porque es donde el cliente ya está. Sin un canal visible, cuando
algo se rompe la persona no escribe: desinstala, y vos te enterás del problema
cuando ya la perdiste.

---

## Legales

`/privacidad` y `/terminos` son páginas públicas, escritas sobre lo que Orden
**realmente** hace: los proveedores que nombran son los de `.env.example`, y
lo que dicen del borrado y de los planes es lo que hacen las migraciones.

> **Si se suma un proveedor nuevo** —otra pasarela, otro servicio de correo—
> hay que tocar `/privacidad` en el mismo cambio. Una política que no dice la
> verdad es peor que no tenerla.

> **No están revisadas por un abogado.** Cubren con honestidad lo que hace el
> sistema, pero antes de cobrarle a alguien conviene que un profesional las
> mire contra la ley que te aplique, sobre todo la parte de responsabilidad y
> la de defensa del consumidor.

---

## Cómo se calculan los números

| Concepto | Fórmula |
|---|---|
| Ventas | lo cobrado, ya con los descuentos restados |
| Ganancia bruta | ventas − costo de la mercadería vendida |
| Ganancia neta | ganancia bruta + otros ingresos − gastos del periodo |
| Margen bruto | ganancia bruta ÷ ventas |
| Ticket promedio | ventas ÷ cantidad de ventas válidas |

Las operaciones anuladas no suman en ningún lado. `ventasAnuladas` cuenta solo ventas; los gastos
e ingresos anulados se cuentan aparte en `movimientosAnulados`.

**`null` no es cero.** Cuando quien consulta no puede ver costos, el costo no llega como `0`:
llega como `null`, y todo lo que se deriva de él (ganancia, margen, ganancia del día) también.
La pantalla muestra un guion y el Excel deja la celda vacía. Un cero se sumaría y se promediaría
como si fuera un dato real; un guion no miente.

El costo de cada producto se congela en el momento de la venta. Si mañana subís el precio
de un perfume, los reportes de la semana pasada siguen mostrando los números reales de
esos días.

---

## Estructura

```
src/
  app/
    ingresar/           entrar y crear cuenta
    empezar/            crear empresa o unirse con código
    (app)/
      panel/            indicadores del periodo
      vender/           venta rápida con catálogo y carrito
      gastos/           gastos y otros ingresos
      productos/        catálogo, costos, precios y stock
      movimientos/      historial completo con filtros
      reto/             metas con fecha límite
      reportes/         análisis y descarga del Excel
      cierre/           el cierre del día: tres números y una comparación
      deudas/           tarjetas, préstamos y lo que se le debe al proveedor
      plan/             planes, precios y prueba gratis
      ajustes/          empresa, equipo, idioma, avisos y estado del sistema
    page.tsx            la portada: qué es Orden, precios y registro
    privacidad/         qué datos guarda, dónde y cómo se borran
    terminos/           condiciones de uso
    sin-conexion/       la pantalla que sirve el service worker sin red
    api/
      capturar/         voz, foto y texto → movimiento estructurado
      excel/            genera el archivo .xlsx
      pagos/checkout/   arranca el pago (el importe sale de la base, no del navegador)
      pagos/webhook/    lo ÚNICO que activa un plan, con firma verificada
      tareas/           recordatorio de la noche y resumen semanal
      cuenta/borrar/    borra la cuenta, sus datos y sus archivos
  components/           piezas de interfaz
  i18n/
    idiomas.ts          los seis idiomas y su locale de Intl
    diccionarios.ts     los diccionarios fusionados (sirve en servidor y navegador)
    fusionar.ts         un idioma parcial se apoya en inglés, nunca en la clave cruda
    cliente.tsx         contexto e useTextos() para componentes del navegador
    textos/             es.ts (el original), en.ts, pt.ts, de.ts, fr.ts, it.ts
  lib/
    agregados.ts        lecturas agregadas: los números salen de PostgreSQL
    habito.ts           cierre del día y racha
    admin.ts            lecturas del panel: cuentas, nunca movimientos
    adjuntos.ts         subir, ver y borrar comprobantes
    captura.ts          el prompt y el esquema de la captura por voz, foto y texto
    deudas.ts           lecturas de deudas y de sus pagos
    imagen.ts           achica la foto en el navegador antes de subirla
    precios.ts          precios por plan, moneda y periodo
    pagos.ts            costura de pasarelas: Stripe hecho, Pagopar pendiente
    avisos.ts           push y email
    correo-semanal.ts   el HTML del resumen del lunes
    lectura.ts          un error nunca se convierte en un número financiero
    calculos.ts         la misma matemática, como referencia para las pruebas
    fechas.ts           rangos y fechas sin corrimiento de zona horaria
    formato.ts          guaraníes, porcentajes, fechas legibles
    reporte.ts          armado del Excel
    datos.ts            consultas a la base
    sesion.ts           usuario y empresa activa
    permisos.ts         espejo de los permisos, solo para la interfaz
    errores.ts          errores de Postgres → mensajes entendibles
supabase/
  migrations/           001_base.sql, 002_integridad_financiera.sql,
                        003_cierre_permisos.sql, 004_lecturas_consistentes.sql,
                        005_lecturas_escalables.sql,
                        006_confiabilidad_lecturas.sql,
                        007_adjuntos.sql, 008_habito.sql,
                        009_planes_precios.sql, 010_preferencias_avisos.sql,
                        011_baja_de_miembros.sql, 012_cerrar_anon.sql,
                        013_borrar_usuario.sql, 014_borrar_mi_cuenta.sql,
                        015_deudas.sql, 016_panel_admin.sql,
                        017_precios_por_tipo.sql, 018_solo_lectura.sql
  schema.sql            generado: las migraciones concatenadas
  generar-schema.js     lo regenera (npm run esquema)
pruebas/
  calculos.test.js      matemática financiera
  excel.test.js         generación y coherencia del Excel
  migracion.test.js     migrar una base con datos sin perder nada
  integridad.test.js    seguridad contra PostgreSQL real
  permisos.test.js      información sensible por rol y suscripciones
  agregados.test.js     volumen, reconciliación SQL↔TS y tope de filas
  confiabilidad.test.js vacío legítimo vs consulta fallida
  adjuntos.test.js      comprobantes: rutas, topes, quién borra qué
  habito.test.js        racha, cierre del día, cupo de IA y precios
  equipo.test.js        baja de miembros y rotación del código de invitación
  borrado.test.js       vaciar el negocio y borrar la cuenta sin llevarse nada de más
  deudas.test.js        saldos, pagos, vencimientos y quién puede verlos
  panel.test.js         el panel: quién entra y que no se filtre plata
  solo-lectura.test.js  al vencer no se carga nada, pero se ve y se baja todo
  verificar-data-api.js verificación manual contra tu Supabase real
  ayuda-db.js           levanta Postgres en memoria imitando a Supabase
v1-legacy/              la versión anterior, por si querés consultarla
```

## Pruebas

```bash
npm run verificar   # typecheck + lint + todas las pruebas + build
npm run probar      # solo las pruebas
```

Las suites:

- **`probar:calculos`** — la matemática financiera (ganancia bruta y neta, márgenes, rankings,
  prorrateo de descuentos, anuladas, divisiones por cero, rangos de fechas, guaraníes) y el
  Excel: lo genera, lo vuelve a abrir y comprueba que los números estén en las celdas correctas
  y que las hojas coincidan entre sí.
- **`probar:migracion`** — aplica la migración sobre una base con datos ya cargados y verifica
  que no se pierda nada, que los subtotales se reconstruyan bien y que se pueda ejecutar
  varias veces.
- **`probar:integridad`** — 149 comprobaciones de seguridad contra un **PostgreSQL real**
  (PGlite) con RLS activo. Cada caso simula lo que haría alguien desde la consola del navegador:
  mandar un costo falso, insertar una venta a mano, borrar un movimiento, anular dos veces,
  vender productos de otra empresa, ascenderse de rol, pasarse al plan pro.
- **`probar:permisos`** — comprobaciones sobre información sensible: que un vendedor no pueda
  recuperar costos por ninguna vía (ni filtrando, ni ordenando, ni sumando), que no vea el código
  del equipo, que solo `service_role` tenga el privilegio para cambiar el plan, y los once casos
  de plan efectivo.
- **`probar:agregados`** — genera **21.000 movimientos** y verifica que los agregados den exactos,
  que PostgreSQL y `calculos.ts` produzcan los mismos números hasta el último decimal, que la
  paginación recorra todo sin repetir, y que con un tope de filas de 1.000, 5.000, 100 o incluso
  **10** los totales no cambien ni un guaraní.
- **`probar:adjuntos`** — que un comprobante no se pueda colgar del movimiento de otra empresa
  ni de otro movimiento de la propia, que la fila no se pueda insertar salteando la función, que
  el tope por movimiento se respete, que un vendedor solo borre lo que subió él, y que borrar
  la empresa no deje archivos huérfanos pagando storage.
- **`probar:habito`** — que la racha no la sostenga un movimiento anulado, que no se corte a las
  ocho de la mañana por no haber cargado todavía, que el cierre del día le llegue al vendedor
  sin la ganancia, que el cupo de IA no se pueda pasar ni pidiendo dos capturas a la vez, y que
  nadie edite un precio desde el navegador.
- **`probar:calculos`** incluye además **confiabilidad**: que un vacío legítimo se distinga de una
  consulta fallida en cada función, y que recorrer páginas devuelva todo o nada, nunca una parte.

> **Límite conocido de las pruebas.** PGlite reproduce PostgreSQL, RLS, triggers y privilegios,
> pero no es Supabase. Dos diferencias que conviene tener presentes:
>
> 1. En Supabase hosted el rol `service_role` tiene además `BYPASSRLS`; en las pruebas se crea sin
>    ese atributo, así que el entorno local es **más estricto** que producción. Lo que pasa acá
>    pasa allá; la recíproca no está garantizada.
> 2. PGlite corre dentro de Node, sin socket TCP, así que **no se le puede poner PostgREST
>    adelante**. El recorte de filas de la Data API se prueba con una capa que aplica exactamente
>    el mismo corte, no con PostgREST de verdad.
>
> Para cerrar esa segunda brecha hay un script que corre contra **tu proyecto real** usando el
> mismo cliente que la app. Solo lee, no escribe nada:
>
> ```bash
> NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
> ORDEN_EMAIL=tu@correo.com ORDEN_PASSWORD=... \
> node pruebas/verificar-data-api.js
> ```
>
> Las políticas de `anon` y `authenticated`, que son las que enfrentan al navegador, sí se
> reproducen tal cual en las pruebas automáticas.

Las pruebas de integridad corren contra el mismo `schema.sql` que vas a pegar en Supabase, así
que lo que pasa acá es lo que va a pasar en producción.

---

## Seguridad e integridad

La regla de fondo: **nada importante depende de que la interfaz esconda un botón.** Todo está
aplicado en PostgreSQL, así que sigue valiendo aunque alguien llame a Supabase directamente
desde la consola del navegador.

**Las ventas no se pueden falsear.**

- Una venta solo se crea con `registrar_venta()`, que en una sola transacción escribe el
  movimiento, sus líneas y el stock. No hay forma de insertar una venta suelta: la policy de
  `movimientos` rechaza `tipo = 'venta'`, y `movimiento_items` es de solo lectura.
- **El costo lo pone la base, no el cliente.** Si la línea apunta a un producto de tu catálogo,
  el costo sale de `productos.costo` y se descarta lo que haya mandado el navegador. Sin esto,
  cualquiera podría inflar su ganancia mandando `costo = 1`.
- Ese costo se congela como foto histórica: cambiar el precio de un producto mañana no altera
  los reportes de ayer.
- El stock se mueve con `stock = stock - cantidad` dentro de la transacción, nunca leyendo y
  reescribiendo desde JavaScript. Dos ventas simultáneas no se pisan.

**Las ventas se anulan, no se borran.** Borrar dejaba el stock descuadrado para siempre.
`anular_movimiento()` marca la operación, devuelve exactamente el stock que descontó, y guarda
quién, cuándo y por qué. Anular dos veces se rechaza: el stock nunca vuelve dos veces.

**Descuentos coherentes.** Cada venta guarda `subtotal`, `descuento` y `monto`, y una
restricción de la tabla garantiza que `monto = subtotal − descuento`. Para el análisis por
producto, el descuento se reparte en proporción al peso de cada línea, así el ranking suma
exactamente lo mismo que el panel y que el Excel.

**Nadie se asciende solo.** Un vendedor no puede tocar costos, precios, stock ni la meta del
reto. Un admin no puede volverse propietario ni degradar al propietario. Nadie puede mover
datos de una empresa a otra ni cambiar el código de acceso.

**El plan no se eleva desde el cliente.** `empresas.plan` está protegido por un trigger y la
tabla `suscripciones` no tiene ninguna política de escritura. La única puerta es
`aplicar_suscripcion()`, que solo puede llamar el backend con la clave de servicio.

**Stock flexible.** Por defecto se puede vender aunque no haya stock cargado y el saldo queda
en negativo: un comerciante chico vende primero y ordena el inventario después. La app avisa
cuando pasa. Si algún día querés modo estricto, alcanza con poner
`empresas.permitir_stock_negativo = false`; el motor ya lo contempla.

**Un vendedor no ve la rentabilidad.** Esto no se resuelve escondiendo tarjetas: `authenticated`
directamente no tiene privilegio de lectura sobre `productos.costo`, `movimientos.costo_total` ni
`movimiento_items.costo_unitario`. Ni un `select *` funciona. Los datos se piden por
`listar_productos()` y `listar_movimientos()`, que devuelven los costos en `null` a quien no
corresponde. El Excel financiero es de administración. Un vendedor ve lo suyo: productos, precios,
stock, lo vendido, sus operaciones.

**El código para sumar gente vive aparte.** Estaba dentro de `empresas`, así que cualquier miembro
podía leerlo (RLS filtra filas, no columnas). Ahora está en `empresa_accesos`, con una policy que
solo deja verlo al propietario y a los administradores. Unirse con el código sigue funcionando sin
necesidad de poder leer la tabla.

**El plan tiene una sola fuente de verdad.** `plan_efectivo()` mira plan, estado y periodo:
`pro` + `cancelada` con periodo pagado por delante sigue siendo Pro hasta que venza; `vencida` o
periodo terminado caen a gratis. Solo responde a miembros de esa empresa. `empresas.plan` quedó
como espejo de lectura y no debe usarse para habilitar nada.

**Los números se calculan en la base, no en el navegador.** Panel, reportes, reto y Excel piden
agregados a PostgreSQL: un objeto con el resumen, una fila por producto, una por día, una por
categoría. Nunca descargan el historial para sumarlo. Eso importa porque entre PostgreSQL y el
navegador está la Data API, que recorta a `db-max-rows` (habitualmente 1.000 filas) **sin avisar**:
con 15.000 ventas, el camino viejo mostraba el total de las primeras 1.000 y parecía correcto.

**El historial se pagina.** De a 100, con cursor estable `(fecha, created_at, id)` calculado por el
servidor, así no repite ni saltea filas aunque haya varias operaciones en el mismo segundo. El Excel
recorre esas páginas de a 500 **desde el servidor**: el navegador recibe solo el `.xlsx` terminado.

**Toda función devuelve exactamente una fila.** Un array dentro de un `jsonb` es un valor, no un
conjunto de filas: `db-max-rows` no tiene nada que recortar. Da igual que esté en 1.000, 100 o 10.
Antes, un catálogo o un ranking con más de mil productos podía llegar cortado sin aviso.

**Si falla, falla.** Ninguna lectura devuelve un valor de respaldo ante un error: si la consulta no
llegó a completarse, la pantalla lo dice y ofrece reintentar. Un `Gs. 0` significa que no vendiste
nada, nunca que no pudimos leer. Y si falla una sola página del detalle, **el Excel no se genera**:
un archivo con la mitad de los movimientos parece completo y no lo es.

**Lo de siempre.** La clave pública de Supabase (`anon key`) es pública por diseño; la
seguridad real está en RLS. **Nunca** pongas la clave `service_role` en este proyecto ni en una
variable `NEXT_PUBLIC_*`: solo `aplicar_suscripcion()` la necesita, desde el backend. La clave
de OpenAI también vive solo en el servidor.

## Costos a tener en cuenta

Los números redondos, para que el precio se decida mirando la realidad y no una intuición.

### Lo que se paga todos los meses

| Qué | Cuánto | Cuándo empieza a doler |
|---|---|---|
| Supabase | gratis, después ~US$ 25/mes | Al pasar el plan gratis: es el gasto fijo grande |
| Vercel | gratis, después ~US$ 20/mes | Recién con bastante tráfico |
| Resend | gratis hasta 3.000 correos/mes | Un resumen semanal por usuario: 3.000 correos son ~700 usuarios |
| Storage de comprobantes | por GB y por mes | Ver abajo |

### Lo que se paga por uso

**OpenAI.** Entre Whisper y `gpt-4o-mini`, cada captura sale alrededor de medio centavo de
dólar; la foto un poco más que la voz. Doscientas capturas al mes son menos de un dólar. El
modelo se elige con `MODELO_IA` (por defecto `gpt-4o-mini`, el más barato que hace bien
este trabajo).

El tope por plan ya está puesto y **lo impone la base**: `consumir_credito_ia()` se llama
*antes* de hablar con OpenAI, así que un plan gratis no puede quemar la cuenta ni desde la
consola del navegador.

**Storage.** Cada comprobante pesa unos 150 KB porque se comprime en el navegador antes de
subir. Un usuario que guarda diez por día suma ~550 MB al año. Sin esa compresión, con las
fotos que saca un celular de hoy, serían 9 GB — sesenta veces más, todos los meses.

**Pasarela de pago.** Hoy no se paga ninguna: el cobro es por transferencia, arreglado por
WhatsApp. Cuando se automatice, ojo con el plan personal: una comisión de 3,5% + US$ 0,30
sobre US$ 7,99 se lleva cerca del 8%, **todos los meses**. Por eso existe el plan anual con
dos meses gratis — la comisión fija se paga una vez al año en vez de doce.

### Dónde queda el equilibrio

Con Supabase Pro y todo lo demás en gratis, **con unos 15 a 20 usuarios pagos ya cubrís la
infraestructura**. De ahí para arriba es margen.
