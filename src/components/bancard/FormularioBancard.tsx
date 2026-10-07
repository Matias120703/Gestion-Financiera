'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { colorDeVariable, estilosBancard, PALETA_CLARA, type PaletaBancard } from '@/lib/bancard-estilos';
import { leerLoQueDijoElFormulario, type DichoPorElFormulario } from '@/lib/bancard-formulario';

/**
 * EL FORMULARIO DE BANCARD, ADENTRO DE ORDEN.
 *
 * Es un iframe que arma la librería oficial de Bancard (`bancard-checkout`
 * 4.0.0, manual: «Invocar al iframe de pago ocasional»). Ahí la persona elige
 * tarjeta, QR o lo que Bancard ofrezca, y carga sus datos: Orden nunca ve el
 * número de la tarjeta.
 *
 * Reglas, todas aprendidas de cómo es la librería por dentro:
 *
 *   · EL SCRIPT SE CARGA UNA VEZ, DEL HOST DEL ENTORNO (staging o
 *     producción): cada host sirve su librería con su dirección adentro, y
 *     la de un entorno descarta los mensajes del otro. La dirección la pasa
 *     la página (que corre en el servidor): `bancard.ts` usa `node:crypto` y
 *     no entra al navegador.
 *   · EL TERCER ARGUMENTO ES `{ styles, responseHandler }`, no los estilos
 *     pelados (con los estilos pelados no da error, pero se ignoran).
 *   · LA LIBRERÍA NUNCA QUITA SU OYENTE: cada `createForm` suma uno. Por eso
 *     hay UN manejador de módulo que reenvía al vigente, y el vigente es
 *     idempotente (se resuelve una sola vez por apertura).
 *   · LO QUE DICE EL FORMULARIO NO SE CREE: el manejador solo avisa «terminó»
 *     y la pantalla le pregunta al servidor qué pasó de verdad. Lo que dijo
 *     (la librería le pasa al manejador el aviso del iframe tal cual:
 *     `{ message, details, return_url }`) viaja con ese aviso, ya limpio,
 *     como un dato para mostrar y dejar anotado: acá no se mira ni se decide
 *     nada con él. Tirarlo era no saber nunca por qué Bancard rechazó un
 *     catastro adentro del iframe (07/10/2026).
 *   · ANCHO MÍNIMO 320 px (manual: «el requisito… es que se les dé un ancho
 *     mínimo de 320px»): en un teléfono angosto el contenedor va a sangre.
 *   · Si a los 12 segundos no avisó su alto, aparece la ayuda de Safari
 *     (manual: con «Prevent cross-site tracking» el iframe no carga).
 */

export type EspacioBancard = 'Checkout' | 'Cards' | 'Charge3DS';

/**
 * Lo que la librería le pasa al `responseHandler`: el `event.data` del iframe,
 * sin tocar. Suele ser `{ message, details, return_url }`, pero viene de otra
 * ventana: se trata como desconocido y lo lee `leerLoQueDijoElFormulario`.
 */
type Manejador = (r: unknown) => void;

/** El que está montado ahora. La librería llama siempre al de módulo. */
let manejadorVigente: Manejador | null = null;
function manejadorDeModulo(r: unknown) {
  manejadorVigente?.(r);
}

const ID_DEL_SCRIPT = 'bancard-checkout';
let cargando: Promise<void> | null = null;

/** Carga la librería del entorno, una sola vez. */
function cargarLibreria(url: string, entorno: string): Promise<void> {
  const w = window as unknown as { Bancard?: unknown };
  const existente = document.getElementById(ID_DEL_SCRIPT) as HTMLScriptElement | null;

  // La de otro entorno ya está cargada (cambió BANCARD_ENTORNO con la
  // pantalla abierta): la librería no se puede descargar, se recarga.
  if (existente && existente.dataset.entorno !== entorno) {
    window.location.reload();
    return new Promise(() => undefined);
  }
  if (existente && w.Bancard) return Promise.resolve();
  if (cargando) return cargando;

  cargando = new Promise<void>((resolver, rechazar) => {
    const s = existente ?? document.createElement('script');
    const listo = () => resolver();
    const falla = () => {
      cargando = null;
      s.remove();
      rechazar(new Error('bancard-checkout'));
    };
    s.addEventListener('load', listo, { once: true });
    s.addEventListener('error', falla, { once: true });
    if (!existente) {
      s.id = ID_DEL_SCRIPT;
      s.src = url;
      s.async = true;
      s.dataset.entorno = entorno;
      document.head.appendChild(s);
    }
  });
  return cargando;
}

/** Los colores del tema que está viendo la persona (oscuro o claro). */
function paletaDelTema(): PaletaBancard {
  const estilo = getComputedStyle(document.documentElement);
  const leer = (nombre: string, respaldo: string) => colorDeVariable(estilo.getPropertyValue(nombre), respaldo);
  return {
    superficie: leer('--superficie', PALETA_CLARA.superficie),
    campo: leer('--arena', PALETA_CLARA.campo),
    texto: leer('--tinta', PALETA_CLARA.texto),
    textoSuave: leer('--tinta-suave', PALETA_CLARA.textoSuave),
    borde: leer('--borde', PALETA_CLARA.borde),
    verde: leer('--verde', PALETA_CLARA.verde),
    verdeFuerte: leer('--verde-fuerte', PALETA_CLARA.verdeFuerte),
    sobreVerde: leer('--sobre-verde', PALETA_CLARA.sobreVerde),
    rojo: leer('--rojo', PALETA_CLARA.rojo),
  };
}

export function FormularioBancard({
  espacio, processId, entorno, urlScript, origen, onTermino,
}: {
  espacio: EspacioBancard;
  processId: string;
  entorno: 'staging' | 'produccion';
  /** `${HOST_BANCARD[entorno]}${SCRIPT_BANCARD}`, armado en el servidor. */
  urlScript: string;
  /** El origen de Bancard en ese entorno: solo sus mensajes cuentan. */
  origen: string;
  /**
   * El formulario terminó (pagó, falló o se canceló): la pantalla pregunta qué
   * pasó. `dicho` es lo que avisó el iframe, ya limpio, si avisó algo legible:
   * para mostrarlo o mandarlo a anotar, nunca para decidir.
   */
  onTermino: (dicho?: DichoPorElFormulario) => void;
}) {
  const t = useTextos();
  const idContenedor = `bancard-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [cargo, setCargo] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [error, setError] = useState(false);
  const resuelto = useRef(false);
  const avisar = useRef(onTermino);
  avisar.current = onTermino;

  // El alto que avisa el iframe es la señal de que cargó.
  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      if (e.origin !== origen) return;
      let datos: unknown = e.data;
      if (typeof datos === 'string') {
        try { datos = JSON.parse(datos); } catch { return; }
      }
      if (datos && typeof datos === 'object' && 'iframeHeight' in (datos as Record<string, unknown>)) setCargo(true);
    };
    window.addEventListener('message', alMensaje);
    const reloj = window.setTimeout(() => setAyuda(true), 12_000);
    return () => {
      window.removeEventListener('message', alMensaje);
      window.clearTimeout(reloj);
    };
  }, [origen]);

  useEffect(() => {
    let vivo = true;
    resuelto.current = false;
    const propio: Manejador = (r) => {
      if (!vivo || resuelto.current) return;
      resuelto.current = true;
      avisar.current(leerLoQueDijoElFormulario(r) ?? undefined);
    };
    manejadorVigente = propio;

    cargarLibreria(urlScript, entorno)
      .then(() => {
        if (!vivo) return;
        const lib = (window as unknown as { Bancard?: Record<string, { createForm?: (...a: unknown[]) => void }> }).Bancard;
        const crear = lib?.[espacio]?.createForm;
        if (typeof crear !== 'function') { setError(true); return; }
        crear.call(lib?.[espacio], idContenedor, processId, {
          styles: estilosBancard(paletaDelTema()),
          responseHandler: manejadorDeModulo,
        });
      })
      .catch(() => { if (vivo) setError(true); });

    return () => {
      vivo = false;
      if (manejadorVigente === propio) manejadorVigente = null;
    };
  }, [espacio, processId, entorno, urlScript, idContenedor]);

  return (
    <div>
      {!cargo && !error && (
        <p className="py-2 text-center text-[13px] font-semibold text-tinta/50" aria-live="polite">
          {t.bancard.formulario.cargando}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-ambar-claro px-3 py-2.5 text-[13px] font-medium text-ambar">
          {t.bancard.formulario.noCargo}
        </p>
      )}
      <div id={idContenedor} className="-mx-5 min-h-[120px] min-w-[320px] sm:mx-0" />
      {ayuda && !cargo && (
        <p className="mt-3 rounded-xl bg-arena px-3 py-2.5 text-[12.5px] leading-relaxed text-tinta/65">
          {t.bancard.formulario.ayudaSafari}
        </p>
      )}
    </div>
  );
}
